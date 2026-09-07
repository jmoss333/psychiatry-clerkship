import { expect, test } from '@playwright/test';

const CONVERSATION_URL = '/_prototypes/sp-interview/sp-interview.preview.html?danaConversation=1';
const STANDARD_URL = '/_prototypes/sp-interview/sp-interview.preview.html';

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

async function installSpeechFakes(page, { failRecognition = false, holdReadiness = false, holdVoices = false, missingRecognition = false, holdPlayback = false } = {}) {
  // These cases cover device speech even when a developer has generated Marin's
  // optional local library. Recorded playback has its own explicit fixtures.
  await page.route('**/output/speech/dana-marin-v1/manifest.json', route => route.fulfill({
    status: 404, contentType: 'text/plain', body: 'Device-voice test fixture',
  }));
  await page.addInitScript(({ shouldFailRecognition, shouldHoldReadiness, shouldHoldVoices, shouldMissRecognition, shouldHoldPlayback }) => {
    let voicesReady = !shouldHoldVoices;
    const voiceListeners = new Set();
    let activeUtterance = null, lastUtterance = null;
    const log = window.__danaSpeechLog = {
      recognitionStarts: 0,
      recognitionStops: 0,
      recognitionAborts: 0,
      spoken: [],
      spokenVoices: [],
      synthesisCancels: 0,
      recognizers: [],
    };

    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(
      callback,
      delay === 4500 ? 24 : delay === 6000 ? 80 : delay,
      ...args,
    );

    function makeResultEvent(text, isFinal = true) {
      const alternative = { transcript: text, confidence: 0.99 };
      const result = { 0: alternative, length: 1, isFinal };
      const results = { 0: result, length: 1 };
      return { resultIndex: 0, results };
    }

    class FakeSpeechRecognition {
      constructor() {
        this.continuous = false;
        this.interimResults = false;
        this.lang = '';
        this.started = false;
        this.finalResults = [];
        log.recognizers.push(this);
      }

      start() {
        log.recognitionStarts += 1;
        if (shouldFailRecognition) {
          shouldFailRecognition = false;
          queueMicrotask(() => {
            this.onerror?.({ error: 'not-allowed', message: 'Microphone permission denied' });
            this.onend?.();
          });
          return;
        }
        this.started = true;
        if (!shouldHoldReadiness) queueMicrotask(() => this.onstart?.());
      }

      stop() {
        log.recognitionStops += 1;
        this.started = false;
        queueMicrotask(() => this.onend?.());
      }

      abort() {
        log.recognitionAborts += 1;
        this.started = false;
        queueMicrotask(() => this.onend?.());
      }

      emitFinal(text) {
        const result = makeResultEvent(text, true).results[0];
        this.finalResults.push(result);
        const event = { resultIndex: this.finalResults.length - 1, results: [...this.finalResults] };
        this.onspeechstart?.();
        this.onresult?.(event);
        this.onspeechend?.();
        return event;
      }

      emitInterim(text) {
        const event = { resultIndex: this.finalResults.length, results: [...this.finalResults, makeResultEvent(text, false).results[0]] };
        this.onspeechstart?.();
        this.onresult?.(event);
      }

      emitReady() {
        this.onstart?.();
      }

      endService() {
        this.started = false;
        this.onend?.();
      }

      emit(event) {
        this.onresult?.(event);
      }
    }

    window.SpeechRecognition = shouldMissRecognition ? undefined : FakeSpeechRecognition;
    window.webkitSpeechRecognition = shouldMissRecognition ? undefined : FakeSpeechRecognition;
    window.SpeechSynthesisUtterance = class SpeechSynthesisUtterance {
      constructor(text) {
        this.text = text;
        this.lang = '';
        this.rate = 1;
        this.pitch = 1;
      }
    };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak(utterance) {
          activeUtterance = lastUtterance = utterance;
          log.spoken.push(utterance.text);
          log.spokenVoices.push(utterance.voice?.name || null);
          queueMicrotask(() => {
            utterance.onstart?.();
            if (!shouldHoldPlayback) { activeUtterance = null; utterance.onend?.({ elapsedTime: 0 }); }
          });
        },
        cancel() { log.synthesisCancels += 1; activeUtterance = null; },
        pause() {},
        resume() {},
        addEventListener(name, callback) { if (name === 'voiceschanged') voiceListeners.add(callback); },
        removeEventListener(name, callback) { if (name === 'voiceschanged') voiceListeners.delete(callback); },
        getVoices() { return voicesReady ? [
          { name: 'Albert', lang: 'en-US', voiceURI: 'albert', localService: true },
          { name: 'Samantha', lang: 'en-US', voiceURI: 'samantha', localService: true },
          { name: 'Ava', lang: 'en-US', voiceURI: 'ava', localService: true },
          { name: 'Cloud voice', lang: 'en-US', voiceURI: 'remote', localService: false },
        ] : []; },
      },
    });

    window.__danaSpeech = {
      finishPlayback() { const utterance = activeUtterance; activeUtterance = null; utterance?.onend?.({ elapsedTime: 1 }); },
      emitLatePlaybackEnd() { lastUtterance?.onend?.({ elapsedTime: 1 }); },
      isPlaying() { return !!activeUtterance; },
      loadVoices() { voicesReady = true; [...voiceListeners].forEach((callback) => callback()); },
      emitFinal(text, { duplicate = false } = {}) {
        const recognizer = [...log.recognizers].reverse().find((entry) => entry.started);
        if (!recognizer) throw new Error('No active speech recognizer');
        const event = recognizer.emitFinal(text);
        if (duplicate) recognizer.emit(event);
      },
      emitReady() {
        const recognizer = [...log.recognizers].reverse().find((entry) => entry.started);
        if (!recognizer) throw new Error('No starting speech recognizer');
        recognizer.emitReady();
      },
      emitInterim(text) {
        const recognizer = [...log.recognizers].reverse().find((entry) => entry.started);
        if (!recognizer) throw new Error('No active speech recognizer');
        recognizer.emitInterim(text);
      },
      endService() {
        const recognizer = [...log.recognizers].reverse().find((entry) => entry.started);
        if (!recognizer) throw new Error('No active speech recognizer');
        recognizer.endService();
      },
    };
  }, { shouldFailRecognition: failRecognition, shouldHoldReadiness: holdReadiness, shouldHoldVoices: holdVoices, shouldMissRecognition: missingRecognition, shouldHoldPlayback: holdPlayback });
}

async function endEncounter(page) {
  await page.getByRole('button', { name: 'End encounter' }).click();
  const finish = page.getByRole('button', { name: 'Finish visit and give handoff' });
  if (await finish.isVisible()) await finish.click();
}

async function openConversation(page, options) {
  await installSpeechFakes(page, options);
  await page.goto(CONVERSATION_URL);
  await expect(page.getByRole('heading', { name: 'Talk with Dana' })).toBeVisible();
}

async function speechLog(page) {
  return page.evaluate(() => ({
    recognitionStarts: window.__danaSpeechLog.recognitionStarts,
    recognitionStops: window.__danaSpeechLog.recognitionStops,
    recognitionAborts: window.__danaSpeechLog.recognitionAborts,
    spoken: [...window.__danaSpeechLog.spoken],
    synthesisCancels: window.__danaSpeechLog.synthesisCancels,
    activeRecognizers: window.__danaSpeechLog.recognizers.filter((entry) => entry.started).length,
  }));
}

async function deliverFinal(page, text, options) {
  await page.evaluate(({ utterance, deliveryOptions }) => {
    window.__danaSpeech.emitFinal(utterance, deliveryOptions);
  }, { utterance: text, deliveryOptions: options });
}

test('prerecorded Dana labels the local draft and distinguishes direct suicide inquiry in debrief', async ({ page }) => {
  await openConversation(page);
  await expect(page.locator('#conversation-local-draft-status')).toContainText('LOCAL DRAFT · Faculty review pending.');
  await expect(page.locator('#conversation-local-draft-status')).toContainText('not enabled for learners');

  await page.getByRole('button', { name: 'Start conversation' }).click();
  await deliverFinal(page, 'Have you had thoughts of killing yourself?');
  await expect(page.locator('#conversation-count')).toHaveText('1 of 10 turns');
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await endEncounter(page);
  for (const field of await page.locator('#conversation-self-assessment textarea').all()) await field.fill('Reflection for supervision.');
  await page.getByRole('button', { name: /Show Dana.s teaching points/ }).click();
  await expect(page.locator('#conversation-local-draft-teaching')).toHaveText(
    'Ask about suicide directly. A guarded response does not mean the question was wrong.',
  );
});

for (const scenario of [
  {name:'as the first learner turn',history:[]},
  {name:'after a judgmental prior turn',history:['You just need to snap out of it.']},
]) test(`local prerecorded Dana answers a direct suicide question ${scenario.name}`,async({page})=>{
  await openConversation(page);await page.getByRole('button',{name:'Start conversation'}).click();
  for(const [index,words] of [...scenario.history,'Have you had thoughts of killing yourself?'].entries()){
    await expect(page.locator('#conversation-status')).toHaveText('Listening');await deliverFinal(page,words);await expect(page.locator('#conversation-count')).toHaveText(`${index+1} of 10 turns`);await expect(page.locator('#conversation-status')).toHaveText('Listening');
  }
  const transcript=page.getByRole('log',{name:'Conversation transcript'});await expect(transcript).toContainText(/Most nights, when I'm awake at three/i);
  await expect(transcript).not.toContainText(/very direct question for someone I met four minutes ago/i);
});

test('Dana completes ten hands-free turns through the real mock patient', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await openConversation(page);

  await page.getByRole('button', { name: 'Start conversation' }).click();
  const transcript = page.getByRole('log', { name: 'Conversation transcript' });
  await expect(transcript).toBeVisible();
  await expect(page.getByText('0 of 10 turns')).toBeVisible();
  await expect(page.locator('textarea:visible')).toHaveCount(0);

  for (let index = 0; index < QUESTIONS.length; index += 1) {
    await expect.poll(async () => (await speechLog(page)).recognitionStarts).toBeGreaterThan(index);
    await deliverFinal(page, QUESTIONS[index], { duplicate: index === 2 });
    await expect(page.getByText(`${index + 1} of 10 turns`)).toBeVisible();
    await expect(transcript).toContainText(QUESTIONS[index]);
  }

  await expect(page.locator('#conversation-status')).toContainText(/complete|finished|reflect/i);
  const captured = await speechLog(page);
  expect(captured.spoken.length).toBeGreaterThanOrEqual(11); // opening plus one answer per turn
  for (const question of QUESTIONS) {
    expect((await transcript.innerText()).split(question)).toHaveLength(2);
  }
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('dana-ten-turns.png'), fullPage: true });
});

test('missing microphone recognition keeps voice preview usable and offers the exact conversation link', async ({ page }) => {
  await openConversation(page, { missingRecognition: true });
  await expect(page.getByRole('button', { name: 'Start conversation' })).toBeDisabled();
  await expect(page.locator('#conversation-status')).toContainText('Voice preview only');
  await expect(page.getByLabel('Conversation link', { exact: true })).toHaveValue(/sp-interview\.preview\.html\?danaConversation=1$/);
  await expect(page.getByRole('button', { name: 'Copy conversation link' })).toBeVisible();
  await page.getByRole('button', { name: 'Preview voice', exact: true }).click();
  expect((await speechLog(page)).recognitionStarts).toBe(0);
  expect((await speechLog(page)).spoken).toHaveLength(1);
});

test('speech connection failure stops capture and exposes recovery without losing completed turns', async ({ page }) => {
  await openConversation(page);
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await deliverFinal(page, QUESTIONS[0]);
  await expect(page.getByText('1 of 10 turns')).toBeVisible();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await page.evaluate(() => {
    const current = [...window.__danaSpeechLog.recognizers].reverse().find(entry => entry.started);
    current.onerror({ error: 'network' });
  });
  await expect(page.getByRole('alert')).toContainText('speech-recognition connection error');
  await expect(page.getByRole('alert')).not.toContainText('lost its connection');
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  await expect(page.getByLabel('Conversation link', { exact: true })).toHaveValue(/\?danaConversation=1$/);
  await expect(page.getByRole('log', { name: 'Conversation transcript' })).toContainText(QUESTIONS[0]);
  expect((await speechLog(page)).activeRecognizers).toBe(0);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await expect(page.getByLabel('Conversation link', { exact: true })).toBeHidden();
});

test('Listening waits for speech-recognition readiness', async ({ page }) => {
  await openConversation(page, { holdReadiness: true });
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await expect.poll(async () => (await speechLog(page)).recognitionStarts).toBe(1);
  await expect(page.locator('#conversation-status')).toContainText(/starting microphone/i);
  await expect(page.locator('#conversation-status')).not.toHaveText('Listening');

  await page.evaluate(() => window.__danaSpeech.emitReady());
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
});

test('Dana uses a conversational voice and auditions it without starting the microphone', async ({ page }) => {
  await openConversation(page);
  const voice = page.getByLabel('Dana’s voice', { exact: true });
  await expect(voice).toHaveValue('samantha');
  await expect(voice).not.toContainText('Albert');
  await expect(voice).not.toContainText('Cloud voice');
  await voice.selectOption('ava');
  await page.getByRole('button', { name: 'Preview voice', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__danaSpeechLog.spokenVoices)).toEqual(['Ava']);
  expect((await speechLog(page)).recognitionStarts).toBe(0);
  await expect(page.getByText('0 of 10 turns')).toBeVisible();
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await expect(voice).toBeDisabled();
  expect(await page.evaluate(() => window.__danaSpeechLog.spokenVoices)).toEqual(['Ava', 'Ava']);
});

test('voices that load during the opening become selectable after Pause', async ({ page }) => {
  await openConversation(page, { holdVoices: true });
  const voice = page.getByLabel('Dana’s voice', { exact: true });
  await expect(voice).toBeDisabled();
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await page.evaluate(() => window.__danaSpeech.loadVoices());
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(voice).toBeEnabled();
  await expect(voice).toHaveValue('samantha');
  await expect(page.getByRole('button', { name: 'Preview voice', exact: true })).toBeEnabled();
});

test('a speech service ending on interim words requires the whole question again', async ({ page }) => {
  await openConversation(page);
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');

  await page.evaluate(() => window.__danaSpeech.emitInterim('Have you been thinking about'));
  await expect(page.getByLabel('Words being recognized', {exact:true})).toContainText('Have you been thinking about');
  await page.evaluate(() => window.__danaSpeech.endService());

  await expect(page.getByRole('alert')).toContainText(/repeat the whole question/i);
  await expect(page.locator('#conversation-status')).toContainText(/voice needs your attention/i);
  await expect(page.getByText('0 of 10 turns')).toBeVisible();
  const resume = page.getByRole('button', { name: 'Resume' });
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await deliverFinal(page, 'Have you been thinking about hurting yourself?');
  await page.getByRole('button', { name: 'Done speaking' }).click();
  await expect(page.getByText('1 of 10 turns')).toBeVisible();
});

test('extra thinking time uses the longer pause and Pause prevents a patient turn', async ({ page }) => {
  await openConversation(page);
  await page.getByRole('checkbox', { name: 'Give me more thinking time' }).check();
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await expect.poll(async () => (await speechLog(page)).recognitionStarts).toBeGreaterThan(0);

  await deliverFinal(page, 'I am still thinking about how to ask this.');
  await page.getByRole('button', { name: 'Pause' }).click();
  const spokenAtPause = (await speechLog(page)).spoken.length;
  await page.waitForTimeout(110); // accelerated 6,000 ms endpoint window
  expect((await speechLog(page)).spoken).toHaveLength(spokenAtPause);
  await expect(page.locator('#conversation-status')).toContainText(/paused/i);

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect.poll(async () => (await speechLog(page)).recognitionStarts).toBeGreaterThan(1);
  await deliverFinal(page, 'How long have you felt this way?');
  await page.getByRole('button', { name: 'Done speaking' }).click();
  await expect(page.getByText('1 of 10 turns')).toBeVisible();
});

test('microphone failure is visible and supports an explicit resume', async ({ page }) => {
  await openConversation(page, { failRecognition: true });
  await page.getByRole('button', { name: 'Start conversation' }).click();

  await expect(page.locator('#conversation-status')).toContainText(/microphone|permission|voice/i);
  const resume = page.getByRole('button', { name: 'Resume' });
  await expect(resume).toBeVisible();
  await resume.click();
  await expect.poll(async () => (await speechLog(page)).recognitionStarts).toBeGreaterThan(1);
});

test('Pause and End release recognition and speech resources', async ({ page }) => {
  await openConversation(page);
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await expect.poll(async () => (await speechLog(page)).recognitionStarts).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Pause' }).click();
  const paused = await speechLog(page);
  expect(paused.recognitionStops + paused.recognitionAborts).toBeGreaterThan(0);
  expect(paused.activeRecognizers).toBe(0);

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect.poll(async () => (await speechLog(page)).recognitionStarts).toBeGreaterThan(1);
  await endEncounter(page);
  const ended = await speechLog(page);
  expect(ended.activeRecognizers).toBe(0);
  const spokenAtEnd = ended.spoken.length;
  await page.waitForTimeout(120);
  expect((await speechLog(page)).spoken).toHaveLength(spokenAtEnd);
  await expect(page.locator('textarea')).not.toHaveCount(0);
});

test('the ordinary preview offers a spoken-mode link without starting recognition', async ({ page }) => {
  await installSpeechFakes(page);
  await page.goto(STANDARD_URL);
  await expect(page.getByRole('heading', { name: 'The Interview Room', exact: true })).toBeVisible();
  const entry = page.getByRole('link', { name: 'Talk with Dana', exact: true });
  await expect(entry).toHaveAttribute('href', './sp-interview.preview.html?danaConversation=1');
  await expect(page.getByRole('button', { name: 'Start conversation' })).toHaveCount(0);
  expect((await speechLog(page)).recognitionStarts).toBe(0);
  await entry.click();
  await expect(page).toHaveURL(/\?danaConversation=1$/);
  await expect(page.getByRole('button', { name: 'Start conversation' })).toBeVisible();
  expect((await speechLog(page)).recognitionStarts).toBe(0);
});

test.describe('responsive conversation shell', () => {
  for (const viewport of [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`${viewport.name} keeps primary controls inside the viewport`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openConversation(page);
      const start = page.getByRole('button', { name: 'Start conversation' });
      await expect(start).toBeVisible();
      const startBox = await start.boundingBox();
      expect(startBox).not.toBeNull();
      expect(startBox.x).toBeGreaterThanOrEqual(0);
      expect(startBox.x + startBox.width).toBeLessThanOrEqual(viewport.width);
      expect(startBox.height).toBeGreaterThanOrEqual(44);
      await start.click();

      for (const name of ['Pause', 'Done speaking', 'End encounter']) {
        const control = page.getByRole('button', { name });
        await expect(control).toBeVisible();
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    });
  }
});

test('Hold my turn preserves a question beyond the extended pause and Done submits once', async ({ page }) => {
  await openConversation(page);
  await expect(page.getByRole('checkbox', { name: 'Give me more thinking time' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Give me more thinking time' }).check();
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await page.locator('#conversation-hold').check();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await deliverFinal(page, 'I want to take time to ask this carefully.');
  await page.waitForTimeout(160); // twice the accelerated six-second pause
  await expect(page.getByText('0 of 10 turns')).toBeVisible();
  expect((await speechLog(page)).spoken).toHaveLength(1);
  await page.getByRole('button', { name: 'Done speaking', exact: true }).click();
  await expect(page.getByText('1 of 10 turns')).toBeVisible();
  await page.waitForTimeout(160);
  await expect(page.getByText('1 of 10 turns')).toBeVisible();
  expect((await speechLog(page)).spoken).toHaveLength(2);
});

test('headphone interruption retains the first negation and the same recognizer', async ({ page }) => {
  await openConversation(page, { holdPlayback: true });
  await page.locator('#dana-spoken-interruptions').check();
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await page.locator('#conversation-hold').check();
  await expect(page.getByRole('button', { name: 'Interrupt Dana', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__danaSpeech.isPlaying())).toBe(true);
  expect((await speechLog(page)).recognitionStarts).toBe(1);
  await page.evaluate(() => window.__danaSpeech.emitInterim('No, I am not'));
  await expect.poll(() => page.evaluate(() => window.__danaSpeech.isPlaying())).toBe(false);
  await deliverFinal(page, 'No, I am not asking that', { duplicate: true });
  await page.evaluate(() => window.__danaSpeech.emitLatePlaybackEnd());
  expect((await speechLog(page)).recognitionStarts).toBe(1);
  await expect(page.getByLabel('Words being recognized', {exact:true})).toContainText('No, I am not asking that');
  await page.getByRole('button', { name: 'Done speaking', exact: true }).click();
  await expect(page.getByText('1 of 10 turns')).toBeVisible();
  const transcript = page.getByRole('log', { name: 'Conversation transcript' });
  expect((await transcript.innerText()).split('No, I am not asking that')).toHaveLength(2);
  await expect(transcript).toContainText('Playback interrupted');
  await endEncounter(page);
  expect((await speechLog(page)).activeRecognizers).toBe(0);
  expect(await page.evaluate(() => window.__danaSpeech.isPlaying())).toBe(false);
});

test('headphone playback completion keeps capture alive and Pause tears both down', async ({ page }) => {
  await openConversation(page, { holdPlayback: true });
  await page.locator('#dana-spoken-interruptions').check();
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await expect.poll(() => page.evaluate(() => window.__danaSpeech.isPlaying())).toBe(true);
  await page.evaluate(() => window.__danaSpeech.finishPlayback());
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  expect((await speechLog(page)).recognitionStarts).toBe(1);
  await deliverFinal(page, 'How have you been sleeping?');
  await expect.poll(() => page.evaluate(() => window.__danaSpeech.isPlaying())).toBe(true);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect((await speechLog(page)).activeRecognizers).toBe(0);
  expect(await page.evaluate(() => window.__danaSpeech.isPlaying())).toBe(false);
  await page.evaluate(() => window.__danaSpeech.emitLatePlaybackEnd());
  await expect(page.locator('#conversation-status')).toContainText('Paused');
});

test('Interrupt during headphone readiness cancels pending Dana playback', async ({ page }) => {
  await openConversation(page, { holdPlayback: true, holdReadiness: true });
  await page.locator('#dana-spoken-interruptions').check();
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await expect.poll(async () => (await speechLog(page)).recognitionStarts).toBe(1);
  expect((await speechLog(page)).spoken).toHaveLength(0);
  await page.getByRole('button', { name: 'Interrupt Dana', exact: true }).click();
  await page.evaluate(() => window.__danaSpeech.emitReady());
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await page.waitForTimeout(100);
  expect((await speechLog(page)).spoken).toHaveLength(0);
  expect((await speechLog(page)).recognitionStarts).toBe(1);
});

test('Space leaves Dana speaking and Escape interrupts without hijacking controls or modified keys', async ({ page }) => {
  await openConversation(page, { holdPlayback: true });
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await expect.poll(() => page.evaluate(() => window.__danaSpeech.isPlaying())).toBe(true);
  await page.locator('#conversation-hold').focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__danaSpeech.isPlaying())).toBe(true);
  await expect(page.getByRole('button', {name: 'Interrupt Dana', exact: true})).toHaveAttribute('aria-keyshortcuts', 'Escape');
  await page.evaluate(() => {
    document.activeElement.blur();
    for (const extra of [{repeat: true}, {isComposing: true}, {keyCode: 229}, {ctrlKey: true}, {metaKey: true}, {altKey: true}, {shiftKey: true}]) {
      document.dispatchEvent(new KeyboardEvent('keydown', {code: 'Escape', key: 'Escape', bubbles: true, ...extra}));
    }
  });
  expect(await page.evaluate(() => window.__danaSpeech.isPlaying())).toBe(true);
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.__danaSpeech.isPlaying())).toBe(true);
  await expect(page.locator('#conversation-hint')).toContainText('Dana is speaking. Press Escape');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__danaSpeech.isPlaying())).toBe(false);
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
});

test('Space finishes a held question once and never submits unfinished recognized words', async ({ page }) => {
  await openConversation(page);
  await expect(page.getByRole('checkbox', { name: 'Give me more thinking time' })).not.toBeChecked();
  await expect(page.locator('#thinking-help')).toContainText('4.5 seconds');
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await page.locator('#conversation-hold').check();
  const done = page.getByRole('button', { name: 'Done speaking', exact: true });
  await expect(done).toContainText('Space');
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Space');
  await expect(page.locator('#conversation-status')).toHaveText('Listening — no question yet');
  await deliverFinal(page, 'Are you feeling');
  await page.evaluate(() => window.__danaSpeech.emitInterim('safe today'));
  await page.keyboard.press('Space');
  await expect(page.locator('#conversation-status')).toHaveText('Listening — finishing your words');
  await expect(page.getByText('0 of 10 turns')).toBeVisible();
  expect((await speechLog(page)).spoken).toHaveLength(1);
  await deliverFinal(page, 'safe today?');
  await page.keyboard.press('Space');
  await expect(page.getByText('1 of 10 turns')).toBeVisible();
  const learnerLine = page.locator('#conversation-log .msg.me');
  await expect(learnerLine).toHaveCount(1);
  await expect(learnerLine).toHaveText('You: Are you feeling safe today?');
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await page.keyboard.press('Space');
  await expect(page.getByText('1 of 10 turns')).toBeVisible();
  expect((await speechLog(page)).spoken).toHaveLength(2);
});

test('Space completion leaves editing controls, composition, modifiers and repeated keys alone', async ({ page }) => {
  await openConversation(page);
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await page.locator('#conversation-hold').check();
  await deliverFinal(page, 'How have you been sleeping?');
  const handled = await page.evaluate(() => {
    const prevented = [];
    const fixture = document.createElement('div');
    fixture.innerHTML = '<input><textarea></textarea><select><option>A</option></select><button>Button</button><a href="#">Link</a><div contenteditable="true">Words</div><div role="button">Custom button</div>';
    document.body.appendChild(fixture);
    for (const code of ['Space', 'Escape']) {
      for (const target of fixture.children) {
        const event = new KeyboardEvent('keydown', {code, key: code === 'Space' ? ' ' : 'Escape', bubbles: true, cancelable: true});
        target.dispatchEvent(event); prevented.push(event.defaultPrevented);
      }
    }
    fixture.remove();
    document.activeElement.blur();
    for (const extra of [{repeat: true}, {isComposing: true}, {ctrlKey: true}, {metaKey: true}, {altKey: true}, {shiftKey: true}]) {
      const event = new KeyboardEvent('keydown', {code: 'Space', key: ' ', bubbles: true, cancelable: true, ...extra});
      document.dispatchEvent(event); prevented.push(event.defaultPrevented);
    }
    return prevented;
  });
  expect(handled.every(value => value === false)).toBe(true);
  await expect(page.getByText('0 of 10 turns')).toBeVisible();
  await expect(page.locator('#conversation-status')).toHaveText('Listening');
  await page.keyboard.press('Space');
  await expect(page.getByText('1 of 10 turns')).toBeVisible();
});

test('spoken greeting and sympathy use existing Dana acknowledgement lines', async ({ page }, testInfo) => {
  await openConversation(page);
  await page.getByRole('button', { name: 'Start conversation' }).click();
  for (const [index, question, bank] of [
    [0, 'Hello', 'greeting_agenda'],
    [1, "I'm sorry that you had to", 'reflection'],
    [2, "My goal is to help understand why you're here", 'greeting_agenda'],
  ]) {
    await expect(page.locator('#conversation-status')).toHaveText('Listening');
    await deliverFinal(page, question);
    await expect(page.getByText(`${index + 1} of 10 turns`)).toBeVisible();
    const allowed = await page.evaluate((name) => {
      const dana = window.__SP_PACK__.cases.find(entry => entry.id === 'sp_depression_gated_si_001');
      return Object.values(dana.responses[name]).flat();
    }, bank);
    const lastReply = page.locator('#conversation-log .msg.pt').last();
    await expect.poll(async () => {
      const reply = (await lastReply.innerText()).replace(/^Dana: /, '');
      return allowed.includes(reply);
    }).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('dana-greeting-and-sympathy.png'), fullPage: true });
});


test('headphone backchannels keep the patient speaking and never add learner turns', async ({ page }) => {
  await openConversation(page, { holdPlayback: true });
  expect(await page.evaluate(() => typeof window.SPEncounterRhythm?.createListener)).toBe('function');
  await page.locator('#dana-spoken-interruptions').check();
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await expect.poll(() => page.evaluate(() => window.__danaSpeech.isPlaying())).toBe(true);
  for (const text of ['mm-hmm', 'Uh-huh.', 'okay', 'yes', 'right', 'I see']) {
    await deliverFinal(page, text, { duplicate: true });
    await expect(page.locator('#conversation-status')).toHaveText('Dana is speaking — listening for you');
    expect(await page.evaluate(() => window.__danaSpeech.isPlaying())).toBe(true);
    await expect(page.getByText('0 of 10 turns')).toBeVisible();
    await expect(page.locator('#conversation-log .me')).toHaveCount(0);
  }
  expect((await speechLog(page)).recognitionStarts).toBe(1);
  await page.getByRole('button', {name:'Pause',exact:true}).click();
  expect((await speechLog(page)).activeRecognizers).toBe(0);
  expect(await page.evaluate(() => window.__danaSpeech.isPlaying())).toBe(false);
});

test('an interim acknowledgment can become a full interruption without losing its first words', async ({ page }) => {
  await openConversation(page, { holdPlayback: true });
  await page.locator('#dana-spoken-interruptions').check();
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await page.locator('#conversation-hold').check();
  await expect.poll(() => page.evaluate(() => window.__danaSpeech.isPlaying())).toBe(true);
  await page.evaluate(() => window.__danaSpeech.emitInterim('I'));
  await page.evaluate(() => window.__danaSpeech.emitInterim('I see'));
  expect(await page.evaluate(() => window.__danaSpeech.isPlaying())).toBe(true);
  await page.evaluate(() => window.__danaSpeech.emitInterim('I see but could you explain'));
  await expect.poll(() => page.evaluate(() => window.__danaSpeech.isPlaying())).toBe(false);
  await deliverFinal(page, 'I see but could you explain what happened next?', {duplicate:true});
  await expect(page.getByLabel('Words being recognized', {exact:true})).toHaveText('I see but could you explain what happened next?');
  expect((await speechLog(page)).recognitionStarts).toBe(1);
  await page.getByRole('button', { name: 'Done speaking', exact:true }).click();
  await expect(page.locator('#conversation-log .me')).toHaveCount(1);
  await expect(page.locator('#conversation-log .me')).toContainText('I see but could you explain what happened next?');
  await endEncounter(page);
  expect((await speechLog(page)).activeRecognizers).toBe(0);
});
