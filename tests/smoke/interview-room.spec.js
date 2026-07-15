import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const sourcePack = JSON.parse(fs.readFileSync(
  new URL('../../_prototypes/sp-interview/sp-interview.pack.json', import.meta.url),
  'utf8',
));
const CASE_ID = 'sp_depression_gated_si_001';
const OPENING = 'I have barely slept, and it is getting hard to do ordinary things.';
const PATIENT_REPLY = 'Mostly I stay in bed and avoid everyone.';
const LATE_REPLY = 'This late response must never enter the room.';
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

function reviewedVoicePack(scenario = {}) {
  const pack = JSON.parse(JSON.stringify(sourcePack));
  if (scenario.maxTurns) pack.engine.maxTurns = scenario.maxTurns;
  pack.speechEngine.enabled = true;
  pack.speechEngine.status = 'reviewed';
  pack.speechEngine.activeStack = 'openai-quality-v1';
  pack.speechEngine.privacyReview = {
    status: 'reviewed',
    decision: 'approved',
    policyUrls: ['https://platform.openai.com/docs/guides/your-data'],
    consentVersion: 'test-reviewed-v1',
    accountControls: {
      provider: 'openai',
      zeroRetentionEntitled: false,
      evidenceHash: 'test-reviewed-account-controls',
    },
  };
  const dana = pack.cases.find(({ id }) => id === CASE_ID);
  dana.speechProfile.status = 'reviewed';
  dana.speechProfile.provider = 'openai';
  dana.speechProfile.providerModel = 'tts-1-hd';
  dana.speechProfile.voiceId = 'alloy';
  dana.speechProfile.adapterMappingVersion = 'openai-v1';
  dana.speechProfile.facultyReview.status = 'reviewed';
  if (scenario.reviewedCaseWithoutVoice) {
    const marcus = pack.cases.find(({ id }) => id === 'sp_mania_redirect_001');
    marcus.facultyReview.status = 'reviewed';
  }
  return pack;
}

async function installFakes(page, scenario = {}) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') await route.continue();
    else await route.abort('blockedbyclient');
  });
  await page.route('**/sp-interview.pack.json', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(reviewedVoicePack(scenario)) });
  });
  await page.addInitScript(({ scenario: configured, opening, reply, lateReply, caseId }) => {
    window.__SP_PREVIEW__ = {
      providerMode: 'live',
      endpoint: '/api/sp',
      voiceEndpoint: '/api/sp/voice',
      autoOpenSettings: false,
    };
    try {
      sessionStorage.setItem('cw_sp_passcode', 'student-test-key');
      localStorage.setItem('cw_sp_endpoint', '/api/sp');
      if (configured.persistedManaged) {
        localStorage.setItem('cw_sp_voice_mode_v2', 'managed');
        localStorage.setItem('cw_sp_voice_consent_v1', 'stale-consent|old-stack');
      }
    } catch (error) {}
    window.__voiceScenario = configured;
    if (configured.fastRecordingLimit) {
      const nativeSetTimeout = window.setTimeout.bind(window);
      window.setTimeout = (callback, delay, ...args) => nativeSetTimeout(
        callback,
        delay === 90_000 ? 20 : delay,
        ...args,
      );
    }
    window.__voiceTestLog = {
      fetches: [],
      events: [],
      announcements: [],
      randomSizes: [],
      recorderOptions: [],
      recorderTimeslices: [],
    };

    let randomSeed = 0;
    const nativeRandom = crypto.getRandomValues.bind(crypto);
    Object.defineProperty(crypto, 'getRandomValues', {
      configurable: true,
      value(target) {
        if (!(target instanceof Uint8Array)) return nativeRandom(target);
        window.__voiceTestLog.randomSizes.push(target.byteLength);
        for (let index = 0; index < target.byteLength; index += 1) {
          target[index] = (randomSeed + index) & 0xff;
        }
        randomSeed += target.byteLength;
        return target;
      },
    });

    document.addEventListener('DOMContentLoaded', () => {
      const live = document.querySelector('#live');
      if (!live) return;
      new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === 'childList' || record.type === 'characterData') {
            const text = live.textContent.trim();
            if (text) window.__voiceTestLog.announcements.push(text);
          }
        }
      }).observe(live, { childList: true, characterData: true, subtree: true });
    });

    const track = { stop() { window.__voiceTestLog.events.push('track:stop'); } };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        async getUserMedia() {
          window.__voiceTestLog.events.push('media:request');
          if (window.__voiceScenario.denyMic) {
            throw new DOMException('Microphone permission denied', 'NotAllowedError');
          }
          return { getTracks() { return [track]; } };
        },
      },
    });

    class FakeMediaRecorder extends EventTarget {
      static isTypeSupported(type) {
        return [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus',
          'audio/ogg',
          'audio/wav',
        ].includes(type);
      }
      constructor(stream, options = {}) {
        super();
        this.stream = stream;
        this.mimeType = options.mimeType || 'audio/webm;codecs=opus';
        this.state = 'inactive';
        window.__voiceTestLog.recorderOptions.push({ ...options });
      }
      emitBytes(size) {
        const data = new Blob([new Uint8Array(size)], { type: this.mimeType });
        const dataEvent = new Event('dataavailable');
        Object.defineProperty(dataEvent, 'data', { value: data });
        this.dispatchEvent(dataEvent);
        if (typeof this.ondataavailable === 'function') this.ondataavailable(dataEvent);
      }
      start(timeslice) {
        this.state = 'recording';
        window.__voiceTestLog.recorderTimeslices.push(timeslice);
        window.__voiceTestLog.events.push('media:start');
        if (window.__voiceScenario.incrementalOversize) {
          queueMicrotask(() => {
            if (this.state !== 'recording') return;
            this.emitBytes(4 * 1024 * 1024);
            if (this.state === 'recording') this.emitBytes(1);
          });
        }
      }
      stop() {
        if (this.state === 'inactive') return;
        this.state = 'inactive';
        window.__voiceTestLog.events.push('media:stop');
        this.emitBytes(4);
        queueMicrotask(() => {
          this.dispatchEvent(new Event('stop'));
          if (typeof this.onstop === 'function') this.onstop();
        });
      }
    }
    window.MediaRecorder = FakeMediaRecorder;

    let blockedPlaybackCount = 0;
    class FakeAudio extends EventTarget {
      constructor(url) {
        super();
        this.src = url;
        this.paused = true;
      }
      play() {
        this.paused = false;
        window.__voiceTestLog.events.push('audio:play');
        if (window.__voiceScenario.blockAutoplay && blockedPlaybackCount++ === 0) {
          this.paused = true;
          return Promise.reject(new DOMException('Autoplay blocked', 'NotAllowedError'));
        }
        return Promise.resolve();
      }
      pause() {
        this.paused = true;
        window.__voiceTestLog.events.push('audio:pause');
      }
      load() {}
      removeAttribute() {}
    }
    window.Audio = FakeAudio;

    window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) { this.text = text; };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speak(utterance) {
        window.__voiceTestLog.events.push(`device:speak:${utterance.text}`);
      },
      cancel() { window.__voiceTestLog.events.push('device:cancel'); },
      getVoices() { return [{ name: 'Test voice', lang: 'en-US' }]; },
    } });

    function waitWithSignal(milliseconds, signal, ignoreAbort) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, milliseconds);
        signal?.addEventListener('abort', () => {
          window.__voiceTestLog.events.push('actor:abort');
          if (!ignoreAbort) {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          }
        }, { once: true });
      });
    }

    const nativeFetch = window.fetch.bind(window);
    let evaluationCalls = 0;
    window.fetch = async (input, init = {}) => {
      const requestUrl = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (!/^\/api\/(?:[^/]+\/)*sp(?:\/voice)?$/.test(requestUrl.pathname)) return nativeFetch(input, init);
      const method = (init.method || 'GET').toUpperCase();
      const headers = Object.fromEntries(new Headers(init.headers).entries());
      let body = null;
      if (typeof init.body === 'string') {
        try { body = JSON.parse(init.body); } catch (error) { body = init.body; }
      }
      const record = { url: requestUrl.pathname + requestUrl.search, method, headers, body };
      window.__voiceTestLog.fetches.push(record);

      if (requestUrl.pathname.endsWith('/sp/voice') && method === 'GET') {
        return new Response(JSON.stringify({
          schemaVersion: 1,
          enabled: true,
          acceptingVoice: true,
          budgetBand: 'ok',
          activeStack: {
            id: 'openai-quality-v1',
            transcription: { provider: 'openai', model: 'whisper-1' },
            synthesis: { provider: 'openai', model: 'tts-1-hd' },
          },
          eligibleProfiles: [{ caseId, profileId: 'dana-measured-v1', profileVersion: configured.profileVersion ?? 1 }],
          acceptedMediaTypes: ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/wav'],
          limits: { maxAudioBytes: 4194304, maxAudioDurationMilliseconds: 90000 },
        }), { headers: { 'content-type': 'application/json' } });
      }
      if (requestUrl.search === '?op=transcribe') {
        if (window.__voiceScenario.delayedTranscriptMs) {
          await waitWithSignal(window.__voiceScenario.delayedTranscriptMs, init.signal, false);
        }
        const transcript = window.__voiceScenario.longTranscript
          ? 'x'.repeat(1201)
          : 'Could you tell me more?';
        return new Response(JSON.stringify({ text: transcript, durationMilliseconds: 600 }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      if (requestUrl.search === '?op=speak') {
        record.textVisibleBeforeAudio = document.body.textContent.includes(body.reply);
        return new Response(Uint8Array.of(0x49, 0x44, 0x33, 0x04), {
          headers: { 'content-type': 'audio/mpeg' },
        });
      }
      if (requestUrl.pathname.endsWith('/sp') && method === 'GET') {
        if (window.__voiceScenario.setupError) {
          return new Response(JSON.stringify({
            error: { code: 'unauthorized', message: 'Correct the rotation passcode.' },
            retryDisposition: 'offline-only',
          }), { status: 401, headers: { 'content-type': 'application/json' } });
        }
        if (window.__voiceScenario.preflightRace && requestUrl.pathname === '/api/old/sp') {
          await waitWithSignal(260, init.signal, true);
        }
        return new Response(JSON.stringify({
          packVersion: '0.2.0',
          packStatus: 'reviewed',
          actorModel: 'test-actor',
        }), { headers: { 'content-type': 'application/json' } });
      }
      if (requestUrl.pathname.endsWith('/sp') && method === 'POST') {
        if (body.mode === 'evaluate') {
          evaluationCalls += 1;
          if (window.__voiceScenario.staleEvaluationRace) {
            if (evaluationCalls === 1) await waitWithSignal(220, init.signal, true);
            else return new Promise(() => {});
          }
          return new Response(JSON.stringify({
            domains: {
              alliance: { rating: 'partial', note: 'You stayed curious.' },
              data: { rating: 'partial', note: 'You began the history.' },
              technique: { rating: 'partial', note: 'Your language was plain.' },
              organization: { rating: 'missed', note: 'The close was not observed.' },
            },
            strengths: [window.__voiceScenario.staleEvaluationRace ? 'OLD STALE FEEDBACK' : 'You opened plainly.', 'You left room to answer.'],
            growth: [
              { t: 'Next time, try a reflection.', link: 'pg_interview.md' },
              { t: 'Next time, try a summary.', link: 'pg_interview.md' },
            ],
            selfAssessmentNote: 'Your read matches the early transcript.',
          }), { headers: { 'content-type': 'application/json' } });
        }
        if (body.mode === 'converse' && window.__voiceScenario.actorUnauthorized && headers['x-student-key'] !== 'corrected-key') {
          return new Response(JSON.stringify({
            error: { code: 'unauthorized', message: 'The rotation passcode needs attention.' },
            retryDisposition: 'offline-only',
          }), { status: 401, headers: { 'content-type': 'application/json' } });
        }
        if (body.mode === 'converse' && window.__voiceScenario.actorError) {
          return new Response(JSON.stringify({
            error: { code: 'actor_upstream_failed', message: 'The live patient could not reply.' },
            retryDisposition: 'offline-only',
          }), { status: 502, headers: { 'content-type': 'application/json' } });
        }
        if (body.mode === 'converse' && window.__voiceScenario.slowActorMs) {
          await waitWithSignal(
            window.__voiceScenario.slowActorMs,
            init.signal,
            window.__voiceScenario.ignoreActorAbort,
          );
        }
        const patientText = body.mode === 'open'
          ? opening
          : window.__voiceScenario.slowActorMs ? lateReply : reply;
        return new Response(JSON.stringify({
          reply: patientText,
          state: { intents: [], flags: [], rapport: 0, unlocked: [] },
          ticket: `ticket:${body.encounterId}:${body.turnId}`,
        }), { headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected API request: ${requestUrl}`);
    };
  }, { scenario, opening: OPENING, reply: PATIENT_REPLY, lateReply: LATE_REPLY, caseId: CASE_ID });
}

async function openRoom(page, scenario = {}) {
  await installFakes(page, scenario);
  await page.goto('sp-interview.html');
  await expect(page).toHaveTitle(/Interview Room/);
  await expect(page.getByRole('button', { name: /Begin — Supported/i }).first()).toBeVisible();
}

function voiceMode(page) {
  return page.getByRole('combobox', { name: /voice mode/i });
}

async function chooseManaged(page) {
  const select = voiceMode(page);
  await expect(select.locator('option[value="managed"]')).toHaveCount(1);
  await select.selectOption('managed');
  const accept = page.getByRole('button', { name: /agree.*managed|use managed voice|continue with managed/i });
  if (await accept.count()) await accept.first().click();
  await expect(select).toHaveValue('managed');
}

async function beginSupported(page) {
  await page.getByRole('button', { name: /Begin — Supported/i }).click();
  await expect(page.locator('.msg.pt').filter({ hasText: OPENING })).toBeVisible();
}

async function completeSelfAssessment(page, suffix = '') {
  await page.getByLabel(/most afraid/i).fill(`A fictional concern ${suffix}`.trim());
  await page.getByLabel(/wish you had asked/i).fill(`A fictional follow-up ${suffix}`.trim());
  await page.getByLabel(/one-line problem representation/i).fill(`A fictional formulation ${suffix}`.trim());
}

async function log(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.__voiceTestLog)));
}

test('voice mode is keyboard-operable and managed identity stays canonical across one room', async ({ page }) => {
  await openRoom(page);
  const select = voiceMode(page);
  await expect(select).toHaveValue('off');
  await select.focus();
  await page.keyboard.press('ArrowDown');
  await expect(select).toHaveValue('device');
  await page.keyboard.press('Home');
  await expect(select).toHaveValue('off');
  await chooseManaged(page);
  await beginSupported(page);
  await expect(page.getByText(/stock synthetic voice; no real person.s voice is cloned/i)).toBeVisible();

  const active = page.locator('.msg.pt').filter({ hasText: OPENING });
  expect(await active.getByRole('button', { name: 'Stop' }).evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('log', { name: 'Conversation transcript' })).toHaveAttribute('aria-live', 'off');
  await expect(page.locator('[aria-live]:not([aria-live="off"]), [role="status"]:not([aria-live="off"]), [role="log"]:not([aria-live="off"]), [role="alert"]:not([aria-live="off"])')).toHaveCount(1);
  const record = page.getByRole('button', { name: /record|speak your question/i });
  await record.click();
  await expect.poll(async () => (await log(page)).events.includes('media:start')).toBe(true);
  const bargeIn = await log(page);
  expect(bargeIn.recorderOptions.at(-1).audioBitsPerSecond).toBe(32_000);
  expect(bargeIn.recorderTimeslices.at(-1)).toBeGreaterThan(0);
  expect(bargeIn.events.lastIndexOf('audio:pause')).toBeLessThan(bargeIn.events.lastIndexOf('media:start'));
  await page.getByRole('button', { name: /stop recording|stop listening/i }).click();
  await expect(page.getByLabel(/Your next words/i)).toHaveValue('Could you tell me more?');
  await page.getByRole('button', { name: 'Say it' }).click();
  await expect(page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY })).toBeVisible();
  await expect(page.getByLabel(/Your next words/i)).toBeFocused();
  await page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY }).getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('button', { name: 'End encounter' }).click();
  await expect(select).toBeDisabled();
  await page.getByLabel(/most afraid/i).fill('Being alone');
  await page.getByLabel(/wish you had asked/i).fill('More about safety');
  await page.getByLabel(/one-line problem representation/i).fill('A fictional learner formulation');
  await page.getByRole('button', { name: /show the debrief/i }).click();
  await expect(page.getByText('Your read, then the room’s')).toBeVisible();
  await page.getByRole('button', { name: 'Back to cases' }).click();
  await select.selectOption('device');
  await expect(select).toHaveValue('device');
  await page.getByRole('button', { name: /Begin — Supported/i }).click();
  await expect(page.locator('.msg.pt').filter({ hasText: OPENING })).toBeVisible();

  const captured = await log(page);
  const actorCalls = captured.fetches.filter(({ url }) => url === '/api/sp');
  const openings = actorCalls.filter(({ body }) => body?.mode === 'open');
  const open = openings[0];
  const nextOpen = openings[1];
  const converse = actorCalls.find(({ body }) => body?.mode === 'converse');
  const evaluation = actorCalls.find(({ body }) => body?.mode === 'evaluate');
  const transcription = captured.fetches.find(({ url }) => url === '/api/sp/voice?op=transcribe');
  const synthesis = captured.fetches.find(({ url }) => url === '/api/sp/voice?op=speak');
  expect(open.body.encounterId).toMatch(ID_PATTERN);
  expect(converse.body.encounterId).toBe(open.body.encounterId);
  expect(evaluation.body.encounterId).toBe(open.body.encounterId);
  expect(transcription.headers['x-sp-encounter-id']).toBe(open.body.encounterId);
  expect(synthesis.body).toEqual({ reply: OPENING, ticket: `ticket:${open.body.encounterId}:0` });
  expect(nextOpen.body.encounterId).toMatch(ID_PATTERN);
  expect(nextOpen.body.encounterId).not.toBe(open.body.encounterId);
  expect(captured.randomSizes.length).toBeGreaterThanOrEqual(2);
  expect(captured.randomSizes.every((size) => size === 16)).toBe(true);
  expect(captured.events).toContain(`device:speak:${OPENING}`);
});

test('modal focus, encounter focus, and 44px setup targets remain keyboard-safe', async ({ page }) => {
  await openRoom(page);
  const modeButtons = page.locator('.badge.mode');
  const heights = await modeButtons.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);
  expect(heights.every((height) => height >= 44)).toBe(true);

  const select = voiceMode(page);
  await select.selectOption('managed');
  const consent = page.getByRole('dialog', { name: 'Before using managed voice' });
  await expect(consent).toBeFocused();
  await expect(consent).toContainText(/microphone audio is sent to openai for transcription/i);
  await expect(consent).toContainText(/clerkship tool does not intentionally store/i);
  await expect(consent).toContainText(/openai processes it under the linked provider data notice and approved account settings/i);
  await expect(consent).toContainText(/openai account is not marked as zero-retention entitled/i);
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Keep voice off' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(consent).toHaveCount(0);
  await expect(select).toBeFocused();

  await beginSupported(page);
  await expect(page.getByLabel(/Your next words/i)).toBeFocused();
  const stepOut = page.getByRole('button', { name: /Step out/i });
  await stepOut.click();
  const returnToRoom = page.getByRole('button', { name: 'Return to the room' });
  await expect(returnToRoom).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(returnToRoom).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(stepOut).toBeFocused();
});

test('managed consent is bound to the configured endpoint identity', async ({ page }) => {
  await openRoom(page);
  await chooseManaged(page);
  await voiceMode(page).selectOption('off');
  await page.getByRole('button', { name: /setup/i }).click();
  await page.getByLabel('Endpoint URL').fill('/api/second/sp');
  await page.getByRole('button', { name: /Save & test connection/i }).click();
  await expect(page.getByText(/Connected/i)).toBeVisible();
  await voiceMode(page).selectOption('managed');
  await expect(page.getByRole('dialog', { name: 'Before using managed voice' })).toBeVisible();
  await expect(voiceMode(page)).toHaveValue('off');
});

test('setup surfaces a typed server error message without object coercion', async ({ page }) => {
  await openRoom(page, { setupError: true });
  await page.getByRole('button', { name: /setup/i }).click();
  await page.getByRole('button', { name: /Save & test connection/i }).click();
  await expect(page.getByText('✗ Correct the rotation passcode.')).toBeVisible();
  await expect(page.getByText(/\[object Object\]/)).toHaveCount(0);
});

test('losing the tab passcode fails closed before microphone access', async ({ page }) => {
  await openRoom(page);
  await chooseManaged(page);
  await beginSupported(page);
  await page.locator('.msg.pt').filter({ hasText: OPENING }).getByRole('button', { name: 'Stop' }).click();
  const before = (await log(page)).events.filter((event) => event === 'media:request').length;
  await page.evaluate(() => sessionStorage.removeItem('cw_sp_passcode'));
  await page.getByRole('button', { name: /record|speak your question/i }).click();
  const after = await log(page);
  expect(after.events.filter((event) => event === 'media:request')).toHaveLength(before);
  await expect(voiceMode(page)).toHaveValue('off');
});

test('persisted managed mode cannot bypass current consent and stack review', async ({ page }) => {
  await openRoom(page, { persistedManaged: true });
  await expect(voiceMode(page)).toHaveValue('off');
  await beginSupported(page);
  const captured = await log(page);
  expect(captured.fetches.some(({ url }) => url === '/api/sp/voice?op=speak')).toBe(false);
  expect(captured.events).not.toContain('media:request');
});

test('managed voice requires the exact reviewed profile version', async ({ page }) => {
  await openRoom(page, { profileVersion: 999 });
  await expect.poll(async () => (await log(page)).fetches.some(({ url }) => url === '/api/sp/voice')).toBe(true);
  await expect(voiceMode(page).locator('option[value="managed"]')).toHaveCount(0);
});

test('a reviewed case without an approved voice profile offers a clear text or device path', async ({ page }) => {
  await openRoom(page, { reviewedCaseWithoutVoice: true });
  await chooseManaged(page);
  const marcus = page.locator('.case').filter({ has: page.getByRole('heading', { name: 'Marcus' }) });
  await expect(marcus.getByText(/managed voice is not approved for this case/i)).toBeVisible();
  await expect(marcus.getByRole('button', { name: /Begin — Supported/i })).toBeDisabled();
  await expect(marcus.getByRole('button', { name: /Begin — Realistic/i })).toBeDisabled();
  await voiceMode(page).selectOption('device');
  await expect(marcus.getByText(/managed voice is not approved for this case/i)).toHaveCount(0);
  await expect(marcus.getByRole('button', { name: /Begin — Supported/i })).toBeEnabled();
});

test('consent cannot be accepted after the tab credential expires', async ({ page }) => {
  await openRoom(page);
  const select = voiceMode(page);
  await expect(select.locator('option[value="managed"]')).toHaveCount(1);
  await select.selectOption('managed');
  await expect(page.getByRole('dialog', { name: /before using managed voice/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Begin — Supported/i })).toBeDisabled();
  await page.evaluate(() => sessionStorage.removeItem('cw_sp_passcode'));
  await page.getByRole('button', { name: 'Use managed voice' }).click();
  await expect(page.getByRole('dialog', { name: /before using managed voice/i })).toHaveCount(0);
  await expect(select).toHaveValue('off');
  await beginSupported(page);
  expect((await log(page)).fetches.some(({ url }) => url.endsWith('?op=speak'))).toBe(false);
});

test('managed voice must be selected before entering the room', async ({ page }) => {
  await openRoom(page);
  await beginSupported(page);
  const select = voiceMode(page);
  await select.selectOption('managed');
  await expect(select).toHaveValue('off');
  await expect(page.getByRole('dialog', { name: /before using managed voice/i })).toHaveCount(0);
  await expect(page.getByText(/choose managed voice before entering the room/i)).toBeVisible();
});

test('the newest provider check exclusively owns managed voice transport', async ({ page }) => {
  await openRoom(page, { preflightRace: true });
  await page.getByRole('button', { name: /setup/i }).click();
  const endpoint = page.getByLabel('Endpoint URL');
  await endpoint.fill('/api/old/sp');
  await page.getByRole('button', { name: 'Save & test connection' }).click();
  await endpoint.fill('/api/new/sp');
  await page.getByRole('button', { name: 'Save & test connection' }).click();
  await expect(page.getByText(/Connected — pack v0\.2\.0/)).toBeVisible();
  await expect.poll(async () => (await log(page)).fetches.some(({ url }) => url === '/api/new/sp/voice')).toBe(true);
  await page.waitForTimeout(320);
  expect((await log(page)).fetches.some(({ url }) => url === '/api/old/sp/voice')).toBe(false);

  await chooseManaged(page);
  await beginSupported(page);
  await page.locator('.msg.pt').filter({ hasText: OPENING }).getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('button', { name: /record|speak your question/i }).click();
  await page.getByRole('button', { name: /stop recording|stop listening/i }).click();
  const captured = await log(page);
  expect(captured.fetches.some(({ url }) => url === '/api/new/sp/voice?op=transcribe')).toBe(true);
  expect(captured.fetches.some(({ url }) => url === '/api/old/sp/voice?op=transcribe')).toBe(false);
});

test('patient text precedes audio; Stop and Replay never overlap recording or call synthesis twice', async ({ page }) => {
  await openRoom(page);
  await chooseManaged(page);
  await beginSupported(page);
  const patient = page.locator('.msg.pt').filter({ hasText: OPENING });
  const before = await log(page);
  const firstSynthesis = before.fetches.find(({ url }) => url === '/api/sp/voice?op=speak');
  expect(firstSynthesis.textVisibleBeforeAudio).toBe(true);
  expect(before.announcements.filter((text) => text.includes(OPENING))).toHaveLength(1);

  await patient.getByRole('button', { name: 'Stop' }).click();
  await expect(patient.getByRole('button', { name: 'Replay' })).toBeVisible();
  expect(await patient.getByRole('button', { name: 'Replay' }).evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  const synthesisCount = before.fetches.filter(({ url }) => url === '/api/sp/voice?op=speak').length;
  await patient.getByRole('button', { name: 'Replay' }).click();
  await patient.getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('button', { name: /record|speak your question/i }).click();
  const after = await log(page);
  expect(after.fetches.filter(({ url }) => url === '/api/sp/voice?op=speak')).toHaveLength(synthesisCount);
  expect(after.events.lastIndexOf('audio:pause')).toBeLessThan(after.events.lastIndexOf('media:start'));
  await page.getByRole('button', { name: 'End encounter' }).click();
  expect((await log(page)).events).toContain('track:stop');
});

test('denied microphone keeps typing available and never sends audio', async ({ page }) => {
  await openRoom(page, { denyMic: true });
  await chooseManaged(page);
  await beginSupported(page);
  await page.locator('.msg.pt').filter({ hasText: OPENING }).getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('button', { name: /record|speak your question/i }).click();
  await expect(page.getByText(/microphone|permission|recording.*unavailable/i).last()).toBeVisible();
  await expect(page.getByLabel(/Your next words/i)).toBeEditable();
  expect((await log(page)).fetches.some(({ url }) => url.includes('op=transcribe'))).toBe(false);
});

test('incremental recording chunks enforce the 4 MiB browser-side stop', async ({ page }) => {
  await openRoom(page, { incrementalOversize: true });
  await chooseManaged(page);
  await beginSupported(page);
  await page.locator('.msg.pt').filter({ hasText: OPENING }).getByRole('button', { name: 'Stop' }).click();
  await page.getByLabel(/Your next words/i).fill('Keep this typed draft.');
  await page.getByRole('button', { name: /record|speak your question/i }).click();
  await expect(page.getByText(/Recording exceeded the 4 MiB limit/i)).toBeVisible();
  const captured = await log(page);
  expect(captured.recorderOptions.at(-1).audioBitsPerSecond).toBe(32_000);
  expect(captured.recorderTimeslices.at(-1)).toBeGreaterThan(0);
  expect(captured.events).toContain('track:stop');
  expect(captured.fetches.some(({ url }) => url.includes('op=transcribe'))).toBe(false);
  await expect(page.getByLabel(/Your next words/i)).toHaveValue('Keep this typed draft.');
});

test('the 90-second auto-stop explains the limit through the owned status path', async ({ page }) => {
  await openRoom(page, { fastRecordingLimit: true });
  await chooseManaged(page);
  await beginSupported(page);
  await page.locator('.msg.pt').filter({ hasText: OPENING }).getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('button', { name: /record|speak your question/i }).click();
  await expect(page.locator('.audiostatus')).toContainText(/90-second limit/i);
  await expect.poll(async () => (await log(page)).announcements.some((text) => /90-second limit/i.test(text))).toBe(true);
  await expect(page.getByLabel(/Your next words/i)).toHaveValue('Could you tell me more?');
});

test('typing during transcription is preserved and reconciled explicitly', async ({ page }) => {
  await openRoom(page, { delayedTranscriptMs: 220 });
  await chooseManaged(page);
  await beginSupported(page);
  await page.locator('.msg.pt').filter({ hasText: OPENING }).getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('button', { name: /record|speak your question/i }).click();
  await page.getByRole('button', { name: /stop recording|stop listening/i }).click();
  await page.getByLabel(/Your next words/i).fill('My newer typed words must stay.');
  await expect(page.getByText(/Your newer typing was kept/i)).toBeVisible();
  await expect(page.getByLabel(/Your next words/i)).toHaveValue('My newer typed words must stay.');
  await expect(page.getByLabel(/Transcribed words available for review/i)).toHaveValue('Could you tell me more?');
  await page.getByRole('button', { name: 'Say it' }).click();
  await expect(page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY })).toBeVisible();
  await expect(page.getByText(/Your newer typing was kept/i)).toHaveCount(0);
  await expect(page.getByLabel(/Transcribed words available for review/i)).toHaveCount(0);
});

test('an over-limit transcription is shown for editing and never sent silently', async ({ page }) => {
  await openRoom(page, { longTranscript: true });
  await chooseManaged(page);
  await beginSupported(page);
  await page.locator('.msg.pt').filter({ hasText: OPENING }).getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('button', { name: /record|speak your question/i }).click();
  await page.getByRole('button', { name: /stop recording|stop listening/i }).click();
  await expect(page.getByText(/Draft is 1201 characters.*shorten it to 1200/i)).toBeVisible();
  await expect(page.getByLabel(/Your next words/i)).toHaveValue('x'.repeat(1201));
  await expect(page.getByRole('button', { name: 'Say it' })).toBeDisabled();
  expect((await log(page)).fetches.filter(({ body }) => body?.mode === 'converse')).toHaveLength(0);
});

test('slow actor is cancelled on End and its stale reply never appears', async ({ page }) => {
  await openRoom(page, { slowActorMs: 700, ignoreActorAbort: true });
  await beginSupported(page);
  await page.getByLabel(/Your next words/i).fill('Please take your time.');
  await page.getByRole('button', { name: 'Say it' }).click();
  await expect(page.locator('.audiostatus')).toContainText(/Dana is thinking/i);
  await page.getByRole('button', { name: 'End encounter' }).click();
  await expect.poll(async () => (await log(page)).events.includes('actor:abort')).toBe(true);
  await page.waitForTimeout(850);
  await expect(page.getByText(LATE_REPLY)).toHaveCount(0);
  await page.getByLabel(/most afraid/i).fill('A fictional concern');
  await page.getByLabel(/wish you had asked/i).fill('A fictional follow-up');
  await page.getByLabel(/one-line problem representation/i).fill('A fictional formulation');
  await page.getByRole('button', { name: /show the debrief/i }).click();
  const evaluation = (await log(page)).fetches.find(({ body }) => body?.mode === 'evaluate');
  expect(evaluation.body.turns).toEqual([]);
  expect(JSON.stringify(evaluation.body)).not.toContain(LATE_REPLY);
});

test('a late evaluation cannot write feedback into a re-run encounter', async ({ page }) => {
  await openRoom(page, { staleEvaluationRace: true });
  await beginSupported(page);
  await page.getByRole('button', { name: 'End encounter' }).click();
  await completeSelfAssessment(page, 'from room one');
  await page.getByRole('button', { name: /show the debrief/i }).click();
  await page.getByRole('button', { name: /Re-run — Realistic/i }).click();
  await expect(page.locator('.msg.pt').filter({ hasText: OPENING })).toBeVisible();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'End encounter' }).click();
  await completeSelfAssessment(page, 'from room two');
  await page.getByRole('button', { name: /show the debrief/i }).click();
  await page.waitForTimeout(260);
  await expect(page.getByText('OLD STALE FEEDBACK')).toHaveCount(0);
  expect((await log(page)).events).toContain('actor:abort');
});

test('actor failure requires explicit offline choice and never silently falls back', async ({ page }) => {
  await openRoom(page, { actorError: true });
  await beginSupported(page);
  const learnerText = 'What has felt hardest?';
  await page.getByLabel(/Your next words/i).fill(learnerText);
  await page.getByRole('button', { name: 'Say it' }).click();
  await expect(page.getByText(learnerText)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue offline' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Retry$/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue with text' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Use device voice' })).toHaveCount(0);
  await expect(page.getByText('Offline simulation', { exact: true })).toHaveCount(0);
  const before = await page.locator('.msg.pt').count();
  await page.getByRole('button', { name: 'Continue offline' }).click();
  await expect(page.getByText('Offline simulation', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.msg.pt')).toHaveCount(before + 1);
  await expect(page.locator('.msg.pt').last()).toContainText('Offline simulation');
  expect((await log(page)).fetches.filter(({ url, body }) => url === '/api/sp' && body?.mode === 'converse')).toHaveLength(1);
});

test('actor authentication recovery requires an explicitly restarted room', async ({ page }) => {
  await openRoom(page, { actorUnauthorized: true });
  await beginSupported(page);
  await page.getByLabel(/Your next words/i).fill('Can we try that again?');
  await page.getByRole('button', { name: 'Say it' }).click();
  const failedEncounterId = (await log(page)).fetches.find(({ body }) => body?.mode === 'converse').body.encounterId;
  await expect(page.getByRole('button', { name: 'Reopen setup' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue offline' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue with text' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reopen setup' }).click();
  await expect(page.getByLabel('Passcode')).toBeFocused();
  await page.getByLabel('Passcode').fill('corrected-key');
  await page.getByRole('button', { name: /Save & test connection/i }).click();
  await expect(page.getByText(/Connected/i)).toBeVisible();
  expect((await log(page)).fetches.filter(({ body }) => body?.mode === 'converse')).toHaveLength(1);
  await page.getByRole('button', { name: /Restart room with corrected passcode/i }).click();
  await expect(page.locator('.msg.pt').filter({ hasText: OPENING })).toBeVisible();
  await expect(page.getByLabel(/Your next words/i)).toBeFocused();
  await page.getByLabel(/Your next words/i).fill('Can we try that again?');
  await page.getByRole('button', { name: 'Say it' }).click();
  await expect(page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY })).toBeVisible();
  const actorCalls = (await log(page)).fetches.filter(({ body }) => body?.mode === 'converse');
  expect(actorCalls).toHaveLength(2);
  expect(actorCalls[1].headers['x-student-key']).toBe('corrected-key');
  expect(actorCalls[1].body.encounterId).not.toBe(failedEncounterId);
  await expect(page.getByText('Offline simulation', { exact: true })).toHaveCount(0);
});

test('the final allowed patient reply remains visible until the learner ends the room', async ({ page }) => {
  await openRoom(page, { maxTurns: 1 });
  await beginSupported(page);
  await page.getByLabel(/Your next words/i).fill('One final question?');
  await page.getByRole('button', { name: 'Say it' }).click();
  await expect(page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY })).toBeVisible();
  await expect(page.getByText(/Turn limit reached.*final patient reply remains above/i)).toBeVisible();
  await expect(page.getByLabel(/Your next words/i)).toHaveCount(0);
  const endAndReflect = page.getByRole('button', { name: /End encounter and reflect/i });
  await expect(endAndReflect).toBeFocused();
  await endAndReflect.click();
  await expect(page.getByLabel(/most afraid/i)).toBeFocused();
});

test('blocked autoplay stays text-first, and mobile reduced-motion layout remains usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoom(page, { blockAutoplay: true });
  await chooseManaged(page);
  await beginSupported(page);
  await expect(page.locator('.msg.pt').filter({ hasText: OPENING })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with text' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use device voice' })).toBeVisible();
  const beforeRecovery = await log(page);
  const synthesisCount = beforeRecovery.fetches.filter(({ url }) => url === '/api/sp/voice?op=speak').length;
  const playCount = beforeRecovery.events.filter((event) => event === 'audio:play').length;
  await page.locator('.msg.pt').filter({ hasText: OPENING }).getByRole('button', { name: 'Play' }).click();
  await expect(page.locator('.msg.pt').filter({ hasText: OPENING }).getByRole('button', { name: 'Stop' })).toBeVisible();
  const afterRecovery = await log(page);
  expect(afterRecovery.events.filter((event) => event === 'audio:play')).toHaveLength(playCount + 1);
  expect(afterRecovery.fetches.filter(({ url }) => url === '/api/sp/voice?op=speak')).toHaveLength(synthesisCount);
  await page.locator('.msg.pt').filter({ hasText: OPENING }).getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('.msg.pt').filter({ hasText: OPENING }).getByRole('button', { name: 'Replay' })).toBeVisible();
  expect((await log(page)).events.some((event) => event.startsWith('device:speak:'))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  const composer = page.getByLabel(/Your next words/i);
  await composer.scrollIntoViewIfNeeded();
  await expect(composer).toBeInViewport();
  await expect(composer).toBeEditable();
});
