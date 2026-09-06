import {endEncounter} from './sp-station-helpers.js';
import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createDanaAudioCatalog } from '../../_prototypes/sp-interview/dana-audio-catalog.mjs';

const CONVERSATION_URL = '/_prototypes/sp-interview/sp-interview.preview.html?danaConversation=1';
const LIBRARY_PATH = '/output/speech/dana-marin-v1/';
const pack = JSON.parse(fs.readFileSync(new URL('../../_prototypes/sp-interview/sp-interview.pack.json', import.meta.url), 'utf8'));
const audioBytes = Buffer.from([73, 68, 51, 4, 0, 1, 2, 3]);
const hash = value => createHash('sha256').update(value).digest('hex');
const catalog = createDanaAudioCatalog(pack);
const manifest = {
  schemaVersion: 1,
  ...catalog,
  packHash: hash(JSON.stringify(pack)),
  voice: 'marin',
  model: 'gpt-4o-mini-tts-2025-12-15',
  entries: catalog.entries.map(entry => ({
    ...entry,
    audioSha256: hash(audioBytes),
    bytes: audioBytes.length,
    durationSeconds: 3,
  })),
};

const QUESTIONS = [
  'What has been hardest for you lately?',
  'How have you been sleeping?',
  'What do your days look like right now?',
  'Have you still been able to enjoy anything?',
  'How is your energy?',
  'How has your appetite been?',
  'Have you felt guilty or like a burden?',
  'Have you had trouble concentrating?',
  'Have you wished you would not wake up?',
  'Have you thought about hurting yourself?',
];

// These tests exercise the actual page, canonical case, controller, manifest
// validation and local fetch/cache. Recognition and audio events are simulated;
// they make no speech-provider calls and do not assert acoustic voice quality.
async function openRecordings(page, options = {}) {
  const network = { apiCalls: [], externalRequests: [], clips: [] };
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/.netlify/functions/') || url.hostname === 'api.openai.com') {
      network.apiCalls.push(url.href);
      return route.abort();
    }
    if (url.hostname !== '127.0.0.1') {
      network.externalRequests.push(url.href);
      return route.abort();
    }
    if (url.pathname === LIBRARY_PATH + 'manifest.json') {
      return route.fulfill(options.missingManifest
        ? { status: 404, contentType: 'text/plain', body: 'Not generated' }
        : { contentType: 'application/json', body: JSON.stringify(manifest) });
    }
    if (url.pathname.startsWith(LIBRARY_PATH) && url.pathname.endsWith('.mp3')) {
      network.clips.push(url.pathname);
      return route.fulfill(options.missingClip
        ? { status: 404, contentType: 'text/plain', body: 'Missing recording' }
        : { contentType: 'audio/mpeg', body: audioBytes });
    }
    return route.continue();
  });

  await page.addInitScript(({ noDevice, holdAudio, rejectAudio }) => {
    const log = window.__danaRecordingLog = {
      players: [],
      plays: 0,
      pauses: 0,
      recognizers: [],
      recognitionStarts: 0,
      spoken: [],
    };
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback,
      delay === 4500 ? 15 : delay === 6000 ? 30 : delay, ...args);

    class FakeAudio {
      constructor(src = '') {
        this.src = src;
        this.currentTime = 0;
        this.active = false;
        log.players.push(this);
      }
      play() {
        log.plays++;
        this.active = true;
        this.savedEnded = this.onended;
        this.savedError = this.onerror;
        if (rejectAudio) return Promise.reject(new Error('NotAllowedError: browser blocked playback'));
        if (!holdAudio) queueMicrotask(() => {
          if (!this.active) return;
          this.active = false;
          this.onended?.();
        });
        return Promise.resolve();
      }
      pause() { log.pauses++; this.active = false; }
      removeAttribute(name) { if (name === 'src') this.src = ''; }
      load() { this.released = true; }
    }
    window.Audio = FakeAudio;

    class FakeRecognition {
      constructor() { this.active = false; log.recognizers.push(this); }
      start() { this.active = true; log.recognitionStarts++; queueMicrotask(() => this.onstart?.()); }
      stop() { this.active = false; queueMicrotask(() => this.onend?.()); }
      abort() { this.active = false; queueMicrotask(() => this.onend?.()); }
      emitFinal(text) {
        this.onspeechstart?.();
        const result = { 0: { transcript: text, confidence: 0.99 }, length: 1, isFinal: true };
        this.onresult?.({ resultIndex: 0, results: { 0: result, length: 1 } });
        this.onspeechend?.();
      }
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = FakeRecognition;
    window.SpeechSynthesisUtterance = noDevice ? undefined : class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: noDevice ? undefined : {
        getVoices() { return [{ name: 'Samantha', lang: 'en-US', voiceURI: 'samantha', localService: true }]; },
        speak(utterance) { log.spoken.push(utterance.text); queueMicrotask(() => utterance.onend?.()); },
        cancel() {},
        addEventListener() {},
        removeEventListener() {},
      },
    });
    window.__danaRecordingsTest = {
      emitFinal(text) {
        const recognition = [...log.recognizers].reverse().find(item => item.active);
        if (!recognition) throw new Error('No active recognition turn');
        recognition.emitFinal(text);
      },
      latePlayerEvents() {
        log.players.forEach(player => { player.savedEnded?.(); player.savedError?.(); });
      },
    };
  }, { noDevice: !!options.noDevice, holdAudio: !!options.holdAudio, rejectAudio: !!options.rejectAudio });
  await page.goto(CONVERSATION_URL);
  await expect(page.getByRole('heading', { name: 'Talk with Dana' })).toBeVisible();
  return network;
}

async function playbackLog(page) {
  return page.evaluate(() => ({
    plays: window.__danaRecordingLog.plays,
    pauses: window.__danaRecordingLog.pauses,
    activePlayers: window.__danaRecordingLog.players.filter(player => player.active).length,
    activeRecognizers: window.__danaRecordingLog.recognizers.filter(recognizer => recognizer.active).length,
    recognitionStarts: window.__danaRecordingLog.recognitionStarts,
    spoken: [...window.__danaRecordingLog.spoken],
  }));
}

function expectLocalOnly(network) {
  expect(network.apiCalls).toEqual([]);
  expect(network.externalRequests).toEqual([]);
}

test('Marin recordings are the default, preview locally, and complete ten spoken turns without device synthesis', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const network = await openRecordings(page, { noDevice: true });
  expect(manifest.entries).toHaveLength(75);
  await expect(page.getByLabel('Voice playback', { exact: true })).toHaveValue('recorded');
  await expect(page.locator('#dana-recordings-status')).toContainText(/ready|75|Marin/i);
  await expect(page.locator('#dana-voice')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Start conversation', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Preview voice', exact: true }).click();
  await expect.poll(async () => (await playbackLog(page)).plays).toBe(1);
  expect((await playbackLog(page)).recognitionStarts).toBe(0);
  await expect(page.getByRole('button', { name: 'Preview voice', exact: true })).toBeEnabled();

  await page.getByRole('button', { name: 'Start conversation', exact: true }).click();
  const transcript = page.getByRole('log', { name: 'Conversation transcript' });
  await expect(page.locator('textarea:visible')).toHaveCount(0);
  for (let index = 0; index < QUESTIONS.length; index++) {
    await expect(page.locator('#conversation-status')).toHaveText('Listening');
    await page.evaluate(text => window.__danaRecordingsTest.emitFinal(text), QUESTIONS[index]);
    await expect(page.locator('#conversation-count')).toHaveText(`${index + 1} of 10 turns`);
    await expect(transcript).toContainText(QUESTIONS[index]);
  }
  await expect(page.locator('#conversation-status')).toContainText(/complete/i);
  const result = await playbackLog(page);
  expect(result.plays).toBe(12); // one audition, opening, and ten exact patient replies
  expect(result.spoken).toEqual([]);
  expect(result.activePlayers).toBe(0);
  expect(result.activeRecognizers).toBe(0);
  expect(network.clips.filter(path => path.endsWith(catalog.entries[0].file))).toHaveLength(1);
  expect(errors).toEqual([]);
  expectLocalOnly(network);
});

test('a missing recording library explains unavailability and keeps device voice explicitly usable', async ({ page }) => {
  const network = await openRecordings(page, { missingManifest: true });
  await expect(page.locator('#dana-recordings-status')).toContainText(/unavailable|not available|missing|not generated|could not/i);
  await expect(page.getByLabel('Voice playback', { exact: true })).toHaveValue('device');
  await expect(page.getByLabel('Dana’s voice', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Dana’s voice', { exact: true })).toHaveValue('samantha');
  await page.getByRole('button', { name: 'Preview voice', exact: true }).click();
  await expect.poll(async () => (await playbackLog(page)).spoken.length).toBe(1);
  await page.getByRole('button', { name: 'Start conversation', exact: true }).click();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  const result = await playbackLog(page);
  expect(result.plays).toBe(0);
  expect(result.spoken).toHaveLength(2);
  expectLocalOnly(network);
});

for (const [name, options] of [
  ['missing clip', { missingClip: true }],
  ['blocked audio playback', { rejectAudio: true }],
]) {
  test(`${name} stops visibly without silently substituting a device voice`, async ({ page }) => {
    const network = await openRecordings(page, options);
    await expect(page.getByLabel('Voice playback', { exact: true })).toHaveValue('recorded');
    await page.getByRole('button', { name: 'Start conversation', exact: true }).click();
    await expect(page.locator('#conversation-status')).toContainText(/attention|error/i);
    await expect(page.locator('#conversation-error')).toBeVisible();
    await expect(page.locator('#conversation-error')).toContainText(/recording|audio|play/i);
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
    const result = await playbackLog(page);
    expect(result.spoken).toEqual([]);
    expect(result.recognitionStarts).toBe(0);
    expect(result.activePlayers).toBe(0);
    expectLocalOnly(network);
  });
}

test('stopping a recording preview and pausing a patient reply cancel audio and ignore late completion', async ({ page }) => {
  const network = await openRecordings(page, { holdAudio: true });
  await expect(page.getByLabel('Voice playback', { exact: true })).toHaveValue('recorded');
  await page.getByRole('button', { name: 'Preview voice', exact: true }).click();
  await expect.poll(async () => (await playbackLog(page)).activePlayers).toBe(1);
  await page.getByRole('button', { name: 'Stop preview', exact: true }).click();
  await page.evaluate(() => window.__danaRecordingsTest.latePlayerEvents());
  await expect(page.locator('#conversation-status')).toHaveText('Ready to start');
  expect((await playbackLog(page)).activePlayers).toBe(0);
  expect((await playbackLog(page)).recognitionStarts).toBe(0);

  await page.getByRole('button', { name: 'Start conversation', exact: true }).click();
  await expect.poll(async () => (await playbackLog(page)).activePlayers).toBe(1);
  await expect(page.locator('#conversation-status')).toHaveText('Dana is speaking');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.evaluate(() => window.__danaRecordingsTest.latePlayerEvents());
  await expect(page.locator('#conversation-status')).toHaveText('Paused — microphone off');
  const result = await playbackLog(page);
  expect(result.plays).toBe(2);
  expect(result.pauses).toBeGreaterThanOrEqual(2);
  expect(result.activePlayers).toBe(0);
  expect(result.activeRecognizers).toBe(0);
  expect(result.recognitionStarts).toBe(0);
  expect(result.spoken).toEqual([]);
  await expect(page.getByRole('log', { name: 'Conversation transcript' })).toContainText('Playback interrupted');
  expectLocalOnly(network);
});
