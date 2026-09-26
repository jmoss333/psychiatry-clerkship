import { expect, test } from '@playwright/test';
import fs from 'node:fs';

// The Interview Room acceptance suite, spoken-first (2026-09-26). The room a learner enters
// by default is the real-time spoken room: the browser opens a WebRTC peer connection whose
// SDP offer the proxy exchanges server-side (/api/sp/realtime?op=start), speaks from Director
// briefs the proxy derives per turn (op=turn), and hangs up on op=end. The typed room is one
// select away and unchanged. Everything the browser would otherwise need from the network or
// the platform is faked here — RTCPeerConnection, the provider data channel, getUserMedia,
// Audio — so the PRODUCTION adapters in sp-interview.html run unmodified against a scripted
// provider. No test seam exists in the tool for this: a flag every test passes and production
// never passes would be an untested production path.

const sourcePack = JSON.parse(fs.readFileSync(
  new URL('../../_prototypes/sp-interview/sp-interview.pack.json', import.meta.url),
  'utf8',
));
const CASE_ID = 'sp_depression_gated_si_001';
// The learner selector renders one card per attested persona — all three since Marcus and
// Ray were attested 2026-07-22. This spec drives the Dana encounter specifically (its fakes,
// opening line and voice are all Dana's), so selection locators are scoped to her card.
const CASE_HEADING = sourcePack.cases.find((c) => c.id === CASE_ID).title.split(' — ')[0];
const OPENING = 'I have barely slept, and it is getting hard to do ordinary things.';
const PATIENT_REPLY = 'Mostly I stay in bed and avoid everyone.';
const SECOND_REPLY = 'My sister. She calls every night, even when I do not pick up.';
const LATE_REPLY = 'This late response must never enter the room.';
const LEARNER_LINE = 'Could you tell me more?';
const PACK_OPENING = sourcePack.cases.find((c) => c.id === CASE_ID).persona.opening;
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const CONSENT_VERSION = '2026-09-26-realtime-v1';
const REALTIME_MODEL = 'test-realtime-model';
const TRANSCRIPTION_MODEL = 'test-transcription-model';
const ROOM_MODE_KEY = 'cw_sp_room_mode_v1';
const CONSENT_KEY = 'cw_sp_spoken_consent_v1';

function reviewedPack(scenario = {}) {
  const pack = JSON.parse(JSON.stringify(sourcePack));
  if (scenario.maxTurns) pack.engine.maxTurns = scenario.maxTurns;
  return pack;
}

async function installFakes(page, scenario = {}) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') await route.continue();
    else await route.abort('blockedbyclient');
  });
  await page.route('**/sp-interview.pack.json', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(reviewedPack(scenario)) });
  });
  await page.addInitScript(({
    scenario: configured, opening, reply, secondReply, lateReply, caseId, caseTitle, realtimeModel, transcriptionModel, roomModeKey, consentKey, consentVersion,
  }) => {
    window.__SP_PREVIEW__ = {
      providerMode: 'live',
      endpoint: '/api/sp',
      voiceEndpoint: '/api/sp/voice',
      autoOpenSettings: false,
    };
    try {
      if (!configured.noPasscode) sessionStorage.setItem('cw_sp_passcode', 'student-test-key');
      localStorage.setItem('cw_sp_endpoint', '/api/sp');
      if (configured.roomMode) localStorage.setItem(roomModeKey, configured.roomMode);
      if (configured.consented) localStorage.setItem(consentKey, `${consentVersion}|${realtimeModel}|${transcriptionModel}`);
      if (configured.staleConsent) localStorage.setItem(consentKey, `${consentVersion}|retired-model|${transcriptionModel}`);
      if (configured.legacyVoiceMode) {
        localStorage.setItem('cw_sp_voice_mode_v2', configured.legacyVoiceMode);
        localStorage.setItem('cw_sp_voice_consent_v1', 'stale-consent|old-stack');
      }
    } catch (error) {}
    window.__voiceScenario = configured;
    window.__voiceTestLog = {
      fetches: [],
      events: [],
      announcements: [],
      randomSizes: [],
      sent: [],
      audio: [],
    };
    const testLog = window.__voiceTestLog;

    let randomSeed = 0;
    const nativeRandom = crypto.getRandomValues.bind(crypto);
    Object.defineProperty(crypto, 'getRandomValues', {
      configurable: true,
      value(target) {
        if (!(target instanceof Uint8Array)) return nativeRandom(target);
        testLog.randomSizes.push(target.byteLength);
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
            if (text) testLog.announcements.push(text);
          }
        }
      }).observe(live, { childList: true, characterData: true, subtree: true });
    });

    // ---------------------------------------------------------------- microphone
    const track = { kind: 'audio', stop() { testLog.events.push('track:stop'); } };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        async getUserMedia(constraints) {
          testLog.events.push('media:request');
          testLog.mediaConstraints = constraints;
          if (window.__voiceScenario.denyMic) {
            throw new DOMException('Microphone permission denied', 'NotAllowedError');
          }
          return { getTracks() { return [track]; }, getAudioTracks() { return [track]; } };
        },
      },
    });

    // ---------------------------------------------------------------- patient audio sink
    // The production adapter attaches the remote track to an Audio element and reports what
    // it hears. This fake plays on request and, in the blockAutoplay scenario, refuses the
    // FIRST play() the way a browser's autoplay policy does.
    let blockedPlaybackCount = 0;
    class FakeAudio extends EventTarget {
      constructor(url) {
        super();
        this.src = url || '';
        this.srcObject = null;
        this.paused = true;
        this.autoplay = false;
      }
      play() {
        testLog.events.push('audio:play');
        if (window.__voiceScenario.blockAutoplay && blockedPlaybackCount++ === 0) {
          this.paused = true;
          return Promise.reject(new DOMException('Autoplay blocked', 'NotAllowedError'));
        }
        this.paused = false;
        queueMicrotask(() => { if (!this.paused) this.dispatchEvent(new Event('playing')); });
        return Promise.resolve();
      }
      pause() {
        if (this.paused) return;
        this.paused = true;
        testLog.events.push('audio:pause');
        this.dispatchEvent(new Event('pause'));
      }
      load() {}
      removeAttribute() {}
    }
    window.Audio = FakeAudio;

    window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) { this.text = text; };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speak(utterance) {
        testLog.events.push(`device:speak:${utterance.text}`);
        setTimeout(() => { if (typeof utterance.onend === 'function') utterance.onend({}); }, 10);
      },
      cancel() { testLog.events.push('device:cancel'); },
      getVoices() { return [{ name: 'Test voice', lang: 'en-US' }]; },
    } });

    // ---------------------------------------------------------------- the provider, scripted
    // One fake provider per page. It answers the client events the controller sends over the
    // data channel with the events the real one would, and lets a test play the learner.
    const rt = window.__rtFake = {
      pc: null,
      dc: null,
      responses: 0,
      items: 0,
      current: null,
      replies: [opening, reply, secondReply],
      spokenReplies: 0,
      repeatRequested: false,
      lastText: null,
      voiceItemId: null,
      // A real data channel never delivers re-entrantly inside send(); queue every event on its
      // own macrotask so order is kept and the controller has returned from the send.
      emit(event) {
        const payload = JSON.stringify(event);
        setTimeout(() => {
          if (!this.dc || this.dc.readyState !== 'open' || typeof this.dc.onmessage !== 'function') return;
          this.dc.onmessage({ data: payload });
        }, 0);
      },
      openChannel() {
        if (!this.dc) return;
        this.dc.readyState = 'open';
        if (typeof this.dc.onopen === 'function') this.dc.onopen();
        this.emit({ type: 'session.created', session: { id: 'sess_fake' } });
      },
      onClientEvent(event) {
        testLog.sent.push(event);
        switch (event.type) {
          case 'conversation.item.create': {
            if (event.item.role === 'system' && /repeat/i.test(event.item.content[0].text)) this.repeatRequested = true;
            const item = { ...event.item, id: event.item.id || `sys_${this.items += 1}`, status: 'completed' };
            this.emit({ type: 'conversation.item.added', item, previous_item_id: null });
            this.emit({ type: 'conversation.item.done', item, previous_item_id: null });
            break;
          }
          case 'response.create':
            this.startResponse();
            break;
          case 'response.cancel':
            if (this.current && !this.current.done) this.finishResponse('cancelled');
            break;
          case 'output_audio_buffer.clear':
            if (this.current && !this.current.audioStopped) {
              this.current.audioStopped = true;
              this.emit({ type: 'output_audio_buffer.cleared', response_id: this.current.id });
            }
            break;
          case 'conversation.item.truncate':
            this.emit({ type: 'conversation.item.truncated', item_id: event.item_id, content_index: event.content_index, audio_end_ms: event.audio_end_ms });
            break;
          case 'input_audio_buffer.commit':
            this.emit({ type: 'input_audio_buffer.committed', item_id: this.voiceItemId, previous_item_id: null });
            break;
          default:
            break;
        }
      },
      startResponse() {
        const id = `resp_${this.responses += 1}`;
        const itemId = `item_${this.items += 1}`;
        let text;
        if (this.repeatRequested && this.lastText) {
          text = this.lastText;
          this.repeatRequested = false;
        } else {
          text = this.replies[Math.min(this.spokenReplies, this.replies.length - 1)];
          this.spokenReplies += 1;
        }
        this.lastText = text;
        const current = this.current = { id, itemId, text, done: false, audioStopped: false, audioStarted: false };
        this.emit({ type: 'response.created', response: { id, status: 'in_progress' } });
        this.emit({ type: 'response.output_item.added', response_id: id, output_index: 0, item: { id: itemId, type: 'message', role: 'assistant', status: 'in_progress' } });
        if (window.__voiceScenario.replyFails) {
          this.finishResponse('failed');
          return;
        }
        current.audioStarted = true;
        this.emit({ type: 'output_audio_buffer.started', response_id: id });
        this.emit({ type: 'response.output_audio_transcript.delta', response_id: id, item_id: itemId, output_index: 0, content_index: 0, delta: text });
        this.emit({ type: 'response.output_audio_transcript.done', response_id: id, item_id: itemId, output_index: 0, content_index: 0, transcript: text });
        // The real provider finishes generating (response.done) well before the audio it produced has
        // drained; holdResponseDone keeps a long reply "in progress" so floor-taking exercises cancel.
        if (!window.__voiceScenario.holdResponseDone) this.finishResponse('completed');
        if (!window.__voiceScenario.holdPatientAudio) {
          setTimeout(() => this.finishPatientAudio(current), window.__voiceScenario.patientAudioMs || 40);
        }
      },
      finishResponse(status) {
        const current = this.current;
        if (!current || current.done) return;
        current.done = true;
        this.emit({
          type: 'response.done',
          response: {
            id: current.id,
            status,
            usage: { total_tokens: 140, input_tokens: 100, output_tokens: 40, input_token_details: { text_tokens: 80, audio_tokens: 20, cached_tokens: 0 }, output_token_details: { text_tokens: 10, audio_tokens: 30 } },
          },
        });
      },
      finishPatientAudio(target) {
        const current = target || this.current;
        if (!current || !current.audioStarted || current.audioStopped) return;
        current.audioStopped = true;
        if (!current.done) this.finishResponse('completed');
        this.emit({ type: 'output_audio_buffer.stopped', response_id: current.id });
      },
      learnerStartsSpeaking() {
        this.voiceItemId = `user_${this.items += 1}`;
        this.emit({ type: 'input_audio_buffer.speech_started', item_id: this.voiceItemId, audio_start_ms: 0 });
        return this.voiceItemId;
      },
      learnerStopsSpeaking(text) {
        const itemId = this.voiceItemId;
        this.emit({ type: 'input_audio_buffer.speech_stopped', item_id: itemId, audio_end_ms: 1800 });
        this.emit({ type: 'input_audio_buffer.committed', item_id: itemId, previous_item_id: null });
        this.emit({ type: 'conversation.item.added', item: { id: itemId, type: 'message', role: 'user', status: 'completed' }, previous_item_id: null });
        this.emit({ type: 'conversation.item.input_audio_transcription.completed', item_id: itemId, content_index: 0, transcript: text, usage: { type: 'duration', seconds: 1.8 } });
        return itemId;
      },
      learnerSays(text) {
        this.learnerStartsSpeaking();
        return this.learnerStopsSpeaking(text);
      },
      dropConnection() {
        if (this.pc) {
          this.pc.connectionState = 'failed';
          if (typeof this.pc.onconnectionstatechange === 'function') this.pc.onconnectionstatechange();
        }
      },
    };

    class FakeDataChannel {
      constructor(label) {
        this.label = label;
        this.readyState = 'connecting';
        this.onopen = null;
        this.onmessage = null;
        this.onclose = null;
      }
      send(text) {
        if (this.readyState !== 'open') throw new Error('channel is not open');
        rt.onClientEvent(JSON.parse(text));
      }
      close() {
        this.readyState = 'closed';
        testLog.events.push('dc:close');
      }
    }

    class FakeRTCPeerConnection {
      constructor() {
        this.connectionState = 'new';
        this.localDescription = null;
        this.remoteDescription = null;
        this.ontrack = null;
        this.onconnectionstatechange = null;
        this.tracks = [];
        testLog.events.push('pc:new');
        rt.pc = this;
      }
      addTrack(mediaTrack) {
        this.tracks.push(mediaTrack);
        testLog.events.push('pc:addTrack');
      }
      createDataChannel(label) {
        const channel = new FakeDataChannel(label);
        rt.dc = channel;
        testLog.events.push(`pc:channel:${label}`);
        return channel;
      }
      async createOffer() {
        return { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=fake offer\r\n' };
      }
      async setLocalDescription(description) {
        this.localDescription = description;
      }
      async setRemoteDescription(description) {
        this.remoteDescription = description;
        testLog.events.push('pc:answer');
        this.connectionState = 'connected';
        setTimeout(() => {
          if (this.connectionState !== 'connected') return;
          if (typeof this.ontrack === 'function') this.ontrack({ track: { kind: 'audio' }, streams: [{ id: 'remote-patient' }] });
          rt.openChannel();
        }, 0);
      }
      close() {
        this.connectionState = 'closed';
        testLog.events.push('pc:close');
        if (rt.dc) rt.dc.readyState = 'closed';
      }
    }
    window.RTCPeerConnection = FakeRTCPeerConnection;

    // ---------------------------------------------------------------- the proxy, scripted
    function waitWithSignal(milliseconds, signal, ignoreAbort) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, milliseconds);
        signal?.addEventListener('abort', () => {
          testLog.events.push('actor:abort');
          if (!ignoreAbort) {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          }
        }, { once: true });
      });
    }

    function json(body, status = 200) {
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }

    const nativeFetch = window.fetch.bind(window);
    let evaluationCalls = 0;
    let realtimeTurns = 0;
    let realtimeStarts = 0;
    window.fetch = async (input, init = {}) => {
      const requestUrl = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (!/^\/api\/(?:[^/]+\/)*sp(?:\/voice|\/realtime)?$/.test(requestUrl.pathname)) return nativeFetch(input, init);
      const method = (init.method || 'GET').toUpperCase();
      const headers = Object.fromEntries(new Headers(init.headers).entries());
      let body = null;
      if (typeof init.body === 'string') {
        try { body = JSON.parse(init.body); } catch (error) { body = init.body; }
      }
      const record = { url: requestUrl.pathname + requestUrl.search, method, headers, body, keepalive: !!init.keepalive };
      testLog.fetches.push(record);

      if (requestUrl.pathname.endsWith('/sp/realtime')) {
        if (headers['x-student-key'] !== 'student-test-key') {
          return json({ error: { code: 'unauthorized', message: 'Correct the rotation passcode.' } }, 401);
        }
        if (method === 'GET') {
          if (window.__voiceScenario.realtimeDisabled) {
            return json({ schemaVersion: 1, enabled: false, acceptingSessions: false, model: null, transcriptionModel: null, budgetBand: null, deadlineMinutes: null, eagerness: [], cases: [] });
          }
          return json({
            schemaVersion: 1,
            enabled: true,
            acceptingSessions: !window.__voiceScenario.realtimeCapped,
            model: realtimeModel,
            transcriptionModel,
            budgetBand: window.__voiceScenario.realtimeCapped ? 'capped' : 'ok',
            deadlineMinutes: 15,
            eagerness: ['low', 'medium'],
            cases: window.__voiceScenario.danaVoiceless ? [] : [{ id: caseId, title: caseTitle, voice: 'marin' }],
          });
        }
        const state = { intents: [], flags: [], rapport: 0, unlocked: [] };
        if (requestUrl.search === '?op=start') {
          realtimeStarts += 1;
          record.startIndex = realtimeStarts;
          if (window.__voiceScenario.startFails) {
            return json({ error: { code: 'provider_status', message: 'The realtime provider could not complete the request.' } }, 502);
          }
          return json({
            sdp: 'v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=fake answer\r\n',
            receipt: `receipt-${realtimeStarts}-0`,
            deadline: Date.now() + 15 * 60_000,
            turn: 0,
            opening,
            brief: '[Director] rapport=0. unlocked=[]. still locked, use their deflections=[si_active]. Begin the encounter with your opening line.',
            state,
            model: realtimeModel,
            voice: 'marin',
          });
        }
        if (requestUrl.search === '?op=turn') {
          realtimeTurns += 1;
          const maxTurns = window.__voiceScenario.maxTurns || 40;
          if (Array.isArray(body.items) && body.items.length > maxTurns) {
            return json({ error: { code: 'turn_cap_reached', message: 'The reviewed turn limit has been reached.' } }, 429);
          }
          if (window.__voiceScenario.turnFails) {
            return json({ error: { code: 'invalid_request', message: 'The request is invalid.' } }, 400);
          }
          return json({
            receipt: `receipt-${realtimeStarts}-${body.items.length}`,
            turn: body.items.length,
            brief: `[Director] rapport=${body.items.length}. unlocked=[]. still locked, use their deflections=[si_active].`,
            state: { intents: ['reflection'], flags: [], rapport: Math.min(body.items.length, 4), unlocked: [] },
            deadline: Date.now() + 15 * 60_000,
          });
        }
        if (requestUrl.search === '?op=end') {
          return json({ ended: true });
        }
        return json({ error: { code: 'method_not_allowed', message: 'Method not allowed.' } }, 405);
      }

      if (requestUrl.pathname.endsWith('/sp/voice') && method === 'GET') {
        // The managed-dictation service is retired from the learner tool; a probe here is a
        // regression. Answer disabled so the tool cannot lean on it by accident.
        return json({ schemaVersion: 1, enabled: false, acceptingVoice: false, budgetBand: null, activeStack: null, eligibleProfiles: [], acceptedMediaTypes: [], limits: null });
      }
      if (requestUrl.pathname.endsWith('/sp') && method === 'GET') {
        if (window.__voiceScenario.setupError) {
          return json({
            error: { code: 'unauthorized', message: 'Correct the rotation passcode.' },
            retryDisposition: 'offline-only',
          }, 401);
        }
        return json({ packVersion: '0.2.0', packStatus: 'reviewed', actorModel: 'test-actor' });
      }
      if (requestUrl.pathname.endsWith('/sp') && method === 'POST') {
        if (body.mode === 'evaluate') {
          evaluationCalls += 1;
          if (window.__voiceScenario.staleEvaluationRace) {
            if (evaluationCalls === 1) await waitWithSignal(220, init.signal, true);
            else return new Promise(() => {});
          }
          return json({
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
          });
        }
        if (body.mode === 'converse' && window.__voiceScenario.actorUnauthorized && headers['x-student-key'] !== 'corrected-key') {
          return json({
            error: { code: 'unauthorized', message: 'The rotation passcode needs attention.' },
            retryDisposition: 'offline-only',
          }, 401);
        }
        if (body.mode === 'converse' && window.__voiceScenario.actorError) {
          return json({
            error: { code: 'actor_upstream_failed', message: 'The live patient could not reply.' },
            retryDisposition: 'offline-only',
          }, 502);
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
        return json({
          reply: patientText,
          state: { intents: [], flags: [], rapport: 0, unlocked: [] },
          ticket: `ticket:${body.encounterId}:${body.turnId}`,
        });
      }
      throw new Error(`Unexpected API request: ${requestUrl}`);
    };
  }, {
    scenario,
    opening: OPENING,
    reply: PATIENT_REPLY,
    secondReply: SECOND_REPLY,
    lateReply: LATE_REPLY,
    caseId: CASE_ID,
    caseTitle: sourcePack.cases.find((c) => c.id === CASE_ID).title,
    realtimeModel: REALTIME_MODEL,
    transcriptionModel: TRANSCRIPTION_MODEL,
    roomModeKey: ROOM_MODE_KEY,
    consentKey: CONSENT_KEY,
    consentVersion: CONSENT_VERSION,
  });
}

function caseCard(page) {
  return page.locator('.case').filter({
    has: page.getByRole('heading', { name: CASE_HEADING, exact: true }),
  });
}

function supportedButton(page) {
  return caseCard(page).getByRole('button', { name: /Begin — Supported/i });
}

function roomMode(page) {
  return page.getByRole('combobox', { name: 'Room', exact: true });
}

async function openRoom(page, scenario = {}) {
  await installFakes(page, scenario);
  await page.goto('sp-interview.html');
  await expect(page).toHaveTitle(/Interview Room/);
  await expect(supportedButton(page)).toBeVisible();
}

async function log(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.__voiceTestLog)));
}

async function storageSnapshot(page) {
  return page.evaluate(() => ({
    local: Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])),
    session: Object.fromEntries(Object.keys(sessionStorage).map((key) => [key, sessionStorage.getItem(key)])),
  }));
}

function realtimeCalls(captured, op) {
  return captured.fetches.filter(({ url }) => url === `/api/sp/realtime${op ? `?op=${op}` : ''}`);
}

function sentEvents(captured, type) {
  return captured.sent.filter((event) => !type || event.type === type);
}

// Enter the spoken room as a consented learner: the Begin button, the connection, the opening
// line spoken from the Director brief.
async function enterSpokenRoom(page) {
  await supportedButton(page).click();
  await expect(page.locator('.msg.pt').filter({ hasText: OPENING })).toBeVisible();
  await expect(page.locator('.audiostatus')).toContainText(/Listening/i);
}

// A learner utterance once the patient has finished: speaking over the patient is its own test.
async function learnerSays(page, text) {
  await expect(page.locator('.audiostatus')).toContainText(/Listening/i);
  return page.evaluate((line) => window.__rtFake.learnerSays(line), text);
}

async function completeSelfAssessment(page, suffix = '') {
  await page.getByLabel(/most afraid/i).fill(`A fictional concern ${suffix}`.trim());
  await page.getByLabel(/wish you had asked/i).fill(`A fictional follow-up ${suffix}`.trim());
  await page.getByLabel(/one-line problem representation/i).fill(`A fictional formulation ${suffix}`.trim());
}

async function beginTyped(page) {
  await supportedButton(page).click();
  await expect(page.locator('.msg.pt').filter({ hasText: OPENING })).toBeVisible();
}

/* ------------------------------------------------------------------ the spoken room */

test('the spoken room is the default, chosen before a case, and its consent names the provider and binds to the model', async ({ page }) => {
  await openRoom(page);
  const select = roomMode(page);
  await expect(select).toHaveValue('spoken');
  expect(await select.evaluate((element) => !!(element.compareDocumentPosition(document.querySelector('.casegrid')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(page.getByRole('region', { name: 'Spoken interviews' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Start a spoken interview/i })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: /voice mode/i })).toHaveCount(0);
  expect((await storageSnapshot(page)).local[CONSENT_KEY]).toBeUndefined();

  await supportedButton(page).click();
  const consent = page.getByRole('dialog', { name: 'Before entering the spoken room' });
  await expect(consent).toBeVisible();
  await expect(consent).toBeFocused();
  await expect(consent).toContainText(/microphone audio streams to OpenAI/i);
  await expect(consent).toContainText(/do not say real-patient names, dates, record numbers/i);
  await expect(consent).toContainText(/stores no audio and no transcript/i);
  await expect(consent).toContainText(/not claimed to be zero/i);
  await expect(consent).toContainText(/stock synthetic voice/i);
  await expect(consent).toContainText(/Headphones are recommended/i);
  await expect(consent).toContainText(/Interrupting is allowed/i);
  await expect(consent).toContainText(/patient model the clerkship currently uses/i);
  await expect(page.locator('.msg.pt')).toHaveCount(0);
  expect((await log(page)).events).not.toContain('media:request');

  await consent.getByRole('button', { name: 'Enter the spoken room' }).click();
  await expect(page.locator('.msg.pt').filter({ hasText: OPENING })).toBeVisible();
  const stored = await storageSnapshot(page);
  expect(stored.local[CONSENT_KEY]).toBe(`${CONSENT_VERSION}|${REALTIME_MODEL}|${TRANSCRIPTION_MODEL}`);
  expect(stored.local[ROOM_MODE_KEY] ?? 'spoken').toBe('spoken');
  await expect(page.getByText(/Spoken room · Supported/)).toBeVisible();

  // The room is chosen before entering it, never switched underneath a live encounter.
  await select.selectOption('typed');
  await expect(select).toHaveValue('spoken');
  await expect(page.getByText(/Spoken room · Supported/)).toBeVisible();
});

test('declining the spoken consent falls back to the typed room, and a consent for a retired model is asked again', async ({ page }) => {
  await openRoom(page, { staleConsent: true });
  await supportedButton(page).click();
  const consent = page.getByRole('dialog', { name: 'Before entering the spoken room' });
  await expect(consent).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(consent).toHaveCount(0);
  await expect(roomMode(page)).toHaveValue('typed');
  await expect(roomMode(page)).toBeFocused();
  expect((await storageSnapshot(page)).local[ROOM_MODE_KEY]).toBe('typed');
  await beginTyped(page);
  await expect(page.getByLabel('Your next words to the patient')).toBeFocused();
  const captured = await log(page);
  expect(realtimeCalls(captured, 'start')).toHaveLength(0);
  expect(captured.events).not.toContain('media:request');
  expect(captured.events).not.toContain('pc:new');
});

test('a spoken encounter: the opening is spoken from a Director brief, learner speech posts the whole transcript with the receipt, and the reply is text first', async ({ page }) => {
  await openRoom(page, { consented: true });
  await enterSpokenRoom(page);

  let captured = await log(page);
  const health = captured.fetches.find(({ url, method }) => url === '/api/sp/realtime' && method === 'GET');
  expect(health.headers['x-student-key']).toBe('student-test-key');
  const start = realtimeCalls(captured, 'start')[0];
  expect(start.method).toBe('POST');
  expect(start.headers['x-student-key']).toBe('student-test-key');
  expect(start.headers['content-type']).toBe('application/json');
  expect(Object.keys(start.body).sort()).toEqual(['audioSetup', 'caseId', 'eagerness', 'encounterId', 'sdp']);
  expect(start.body.caseId).toBe(CASE_ID);
  expect(start.body.encounterId).toMatch(ID_PATTERN);
  expect(start.body.sdp.startsWith('v=')).toBe(true);
  expect(start.body.eagerness).toBe('low');
  expect(start.body.audioSetup).toBe('headphones');
  expect(captured.mediaConstraints.audio.echoCancellation).toBe(true);
  expect(captured.events.indexOf('media:request')).toBeLessThan(captured.events.indexOf('pc:new'));
  expect(captured.events).toContain('pc:channel:oai-events');
  expect(captured.events.filter((event) => event === 'audio:play').length).toBeGreaterThanOrEqual(1);

  // The opening was requested from the brief, not improvised: one system item then one response.
  const briefs = sentEvents(captured, 'conversation.item.create');
  expect(briefs).toHaveLength(1);
  expect(briefs[0].item.role).toBe('system');
  expect(briefs[0].item.content[0].text).toContain('[Director]');
  expect(sentEvents(captured, 'response.create')).toHaveLength(1);
  expect(sentEvents(captured, 'session.update')).toHaveLength(0);
  expect(captured.announcements.some((text) => text.includes('Listening'))).toBe(true);
  await expect(page.getByText('Turn 0 / 40')).toBeVisible();

  await learnerSays(page, LEARNER_LINE);
  await expect(page.locator('.msg.me').filter({ hasText: LEARNER_LINE })).toBeVisible();
  await expect(page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY })).toBeVisible();
  await expect(page.getByText('Turn 1 / 40')).toBeVisible();

  captured = await log(page);
  const turn = realtimeCalls(captured, 'turn')[0];
  expect(Object.keys(turn.body).sort()).toEqual(['caseId', 'encounterId', 'items', 'lastPatient', 'receipt']);
  expect(turn.body.receipt).toBe('receipt-1-0');
  expect(turn.body.caseId).toBe(CASE_ID);
  expect(turn.body.encounterId).toBe(start.body.encounterId);
  expect(turn.body.items).toEqual([{ itemId: expect.stringMatching(/^user_/), text: LEARNER_LINE }]);
  expect(turn.body.lastPatient).toEqual({ itemId: expect.stringMatching(/^item_/), status: 'complete' });
  // The reply came from the second brief; its text reached the room from the transcript events.
  expect(sentEvents(captured, 'conversation.item.create')).toHaveLength(2);
  expect(sentEvents(captured, 'conversation.item.create')[1].item.content[0].text).toContain('rapport=1');
  expect(sentEvents(captured, 'response.create')).toHaveLength(2);
  expect(captured.announcements.some((text) => text.includes(PATIENT_REPLY))).toBe(false);
  await expect(page.getByRole('log', { name: 'Conversation transcript' })).toHaveAttribute('aria-live', 'off');
  await expect(page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY }).locator('.tag')).toHaveCount(0);

  // Nothing of the session lands in browser storage: no SDP, no receipt, no transcript.
  const stored = await storageSnapshot(page);
  const everything = JSON.stringify(stored);
  expect(everything).not.toContain('receipt-');
  expect(everything).not.toContain('v=0');
  expect(everything).not.toContain(LEARNER_LINE);
  expect(everything).not.toContain(PATIENT_REPLY);
  expect(Object.keys(stored.local).every((key) => key.startsWith('cw_'))).toBe(true);

  // Ending hangs the call up exactly once, then the debrief evaluates the recorded turns.
  await page.getByRole('button', { name: 'End encounter' }).click();
  await expect(page.getByLabel(/most afraid/i)).toBeFocused();
  captured = await log(page);
  const ends = realtimeCalls(captured, 'end');
  expect(ends).toHaveLength(1);
  expect(ends[0].body).toEqual({ receipt: 'receipt-1-1', caseId: CASE_ID, encounterId: start.body.encounterId });
  expect(captured.events).toContain('track:stop');
  expect(captured.events).toContain('pc:close');
  await completeSelfAssessment(page);
  await page.getByRole('button', { name: /show the debrief/i }).click();
  await expect(page.getByText('Your read, then the room’s')).toBeVisible();
  captured = await log(page);
  const evaluation = captured.fetches.find(({ body }) => body?.mode === 'evaluate');
  expect(evaluation.body.encounterId).toBe(start.body.encounterId);
  expect(evaluation.body.turns).toEqual([{ me: LEARNER_LINE, pt: PATIENT_REPLY }]);
  expect(realtimeCalls(captured, 'end')).toHaveLength(1);
});

test('sustained learner speech takes the floor in order — cancel, clear, truncate — and the cut reply is recorded as uncertain, never as heard text', async ({ page }) => {
  await openRoom(page, { consented: true, holdPatientAudio: true, holdResponseDone: true });
  await supportedButton(page).click();
  await expect(page.locator('.msg.pt').filter({ hasText: OPENING })).toBeVisible();
  await expect(page.locator('.audiostatus')).toContainText(/Dana is speaking/i);
  await expect(page.getByRole('button', { name: 'Stop Dana' })).toBeEnabled();

  await page.evaluate(() => window.__rtFake.learnerStartsSpeaking());
  // Under 600 ms of speech is a backchannel: nothing is sent yet.
  await page.waitForTimeout(250);
  let captured = await log(page);
  expect(sentEvents(captured, 'response.cancel')).toHaveLength(0);
  expect(sentEvents(captured, 'output_audio_buffer.clear')).toHaveLength(0);
  await expect.poll(async () => sentEvents(await log(page), 'response.cancel').length, { timeout: 3000 }).toBe(1);
  captured = await log(page);
  const order = captured.sent.map((event) => event.type).filter((type) => ['response.cancel', 'output_audio_buffer.clear', 'conversation.item.truncate'].includes(type));
  expect(order).toEqual(['response.cancel', 'output_audio_buffer.clear', 'conversation.item.truncate']);
  const truncate = sentEvents(captured, 'conversation.item.truncate')[0];
  expect(truncate.item_id).toMatch(/^item_/);
  expect(truncate.content_index).toBe(0);
  expect(Number.isInteger(truncate.audio_end_ms) && truncate.audio_end_ms >= 0).toBe(true);
  const opening = page.locator('.msg.pt').filter({ hasText: OPENING });
  await expect(opening.locator('.tag.warn')).toHaveText('interrupted — delivery uncertain');

  await page.evaluate(() => window.__rtFake.learnerStopsSpeaking('Sorry — what keeps you going?'));
  await expect(page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY })).toBeVisible();
  captured = await log(page);
  const turn = realtimeCalls(captured, 'turn')[0];
  expect(turn.body.items.map(({ text }) => text)).toEqual(['Sorry — what keeps you going?']);
  expect(turn.body.lastPatient).toEqual({ itemId: expect.stringMatching(/^item_/), status: 'interrupted' });

  // The debrief carries the marker for the cut reply, not the words the learner may not have heard.
  await page.evaluate(() => window.__rtFake.finishPatientAudio());
  await page.getByRole('button', { name: 'End encounter' }).click();
  await completeSelfAssessment(page);
  await page.getByRole('button', { name: /show the debrief/i }).click();
  captured = await log(page);
  const evaluation = captured.fetches.find(({ body }) => body?.mode === 'evaluate');
  expect(evaluation.body.turns).toEqual([{ me: 'Sorry — what keeps you going?', pt: PATIENT_REPLY }]);
  expect(JSON.stringify(evaluation.body.turns)).not.toContain(OPENING);
});

test('Stop marks the reply uncertain and Say that again repeats it in full from a repeat brief; the repeat replaces the marker', async ({ page }) => {
  await openRoom(page, { consented: true, holdPatientAudio: true });
  await enterSpokenRoomHeld(page);
  await learnerSaysAndHears(page, LEARNER_LINE, PATIENT_REPLY);
  const reply = page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY }).first();
  await expect(page.locator('.audiostatus')).toContainText(/Dana is speaking/i);
  const repeat = page.getByRole('button', { name: 'Say that again' });
  await expect(repeat).toBeDisabled();
  await page.getByRole('button', { name: 'Stop Dana' }).click();
  await expect(reply.locator('.tag.warn')).toHaveText('interrupted — delivery uncertain');
  await expect(page.locator('.audiostatus')).toContainText(/Listening/i);
  await expect(repeat).toBeEnabled();
  let captured = await log(page);
  expect(sentEvents(captured, 'output_audio_buffer.clear')).toHaveLength(1);
  expect(sentEvents(captured, 'response.cancel')).toHaveLength(0);

  await repeat.click();
  await expect(page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY })).toHaveCount(2);
  const again = page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY }).nth(1);
  await expect(again.locator('.tag').first()).toHaveText('again');
  captured = await log(page);
  const briefs = sentEvents(captured, 'conversation.item.create');
  expect(briefs.at(-1).item.content[0].text).toMatch(/\[Director\].*repeat/i);
  expect(sentEvents(captured, 'response.create')).toHaveLength(3);
  // A repeat is not a learner turn: the proxy saw one op=turn, and the turn counter did not move.
  expect(realtimeCalls(captured, 'turn')).toHaveLength(1);
  await expect(page.getByText('Turn 1 / 40')).toBeVisible();
  await page.evaluate(() => window.__rtFake.finishPatientAudio());
  await expect(page.locator('.audiostatus')).toContainText(/Listening/i);
  await expect(repeat).toBeDisabled();

  await page.getByRole('button', { name: 'End encounter' }).click();
  await completeSelfAssessment(page);
  await page.getByRole('button', { name: /show the debrief/i }).click();
  captured = await log(page);
  const evaluation = captured.fetches.find(({ body }) => body?.mode === 'evaluate');
  expect(evaluation.body.turns).toEqual([{ me: LEARNER_LINE, pt: PATIENT_REPLY }]);
});

test('a short backchannel while the patient speaks never cancels the reply or posts a turn', async ({ page }) => {
  await openRoom(page, { consented: true, holdPatientAudio: true });
  await supportedButton(page).click();
  await expect(page.locator('.msg.pt').filter({ hasText: OPENING })).toBeVisible();
  await expect(page.locator('.audiostatus')).toContainText(/Dana is speaking/i);
  await page.evaluate(() => window.__rtFake.learnerSays('Mm-hm.'));
  await page.waitForTimeout(700);
  const captured = await log(page);
  expect(sentEvents(captured, 'response.cancel')).toHaveLength(0);
  expect(sentEvents(captured, 'output_audio_buffer.clear')).toHaveLength(0);
  expect(realtimeCalls(captured, 'turn')).toHaveLength(0);
  await expect(page.locator('.audiostatus')).toContainText(/Dana is speaking/i);
  await expect(page.locator('.msg.me')).toHaveCount(0);
  await expect(page.locator('.msg.pt').filter({ hasText: OPENING }).locator('.tag')).toHaveCount(0);
});

test('blocked autoplay is surfaced as sound off; a reply that never played is marked not heard and Turn on sound recovers', async ({ page }) => {
  await openRoom(page, { consented: true, blockAutoplay: true });
  await supportedButton(page).click();
  await expect(page.locator('.msg.pt').filter({ hasText: OPENING })).toBeVisible();
  const notice = page.getByRole('note').filter({ hasText: /Sound is off/ });
  await expect(notice).toBeVisible();
  const opening = page.locator('.msg.pt').filter({ hasText: OPENING });
  await expect(opening.locator('.tag.warn')).toHaveText('not heard — playback did not start');
  await expect(page.locator('.audiostatus')).toContainText(/Listening/i);
  const before = (await log(page)).events.filter((event) => event === 'audio:play').length;
  await notice.getByRole('button', { name: 'Turn on sound' }).click();
  await expect(notice).toHaveCount(0);
  expect((await log(page)).events.filter((event) => event === 'audio:play')).toHaveLength(before + 1);

  await learnerSays(page, LEARNER_LINE);
  const reply = page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY });
  await expect(reply).toBeVisible();
  await expect(page.locator('.audiostatus')).toContainText(/Listening/i);
  await expect(reply.locator('.tag')).toHaveCount(0);
  await page.getByRole('button', { name: 'End encounter' }).click();
  await completeSelfAssessment(page);
  await page.getByRole('button', { name: /show the debrief/i }).click();
  const evaluation = (await log(page)).fetches.find(({ body }) => body?.mode === 'evaluate');
  expect(evaluation.body.turns).toEqual([{ me: LEARNER_LINE, pt: PATIENT_REPLY }]);
});

test('typing inside the spoken room is a learner turn, and a possible real-patient detail is held before it leaves the browser', async ({ page }) => {
  await openRoom(page, { consented: true });
  await enterSpokenRoom(page);
  const composer = page.getByLabel('Or type to the patient');
  await composer.fill('The patient in bed 4, MRN 1234567, said the same thing.');
  await page.getByRole('button', { name: 'Send' }).click();
  const hold = page.getByRole('alertdialog', { name: /real-patient information/i });
  await expect(hold).toBeVisible();
  let captured = await log(page);
  expect(realtimeCalls(captured, 'turn')).toHaveLength(0);
  expect(sentEvents(captured, 'conversation.item.create')).toHaveLength(1);
  await hold.getByRole('button', { name: 'Edit message' }).click();
  await expect(hold).toHaveCount(0);
  await composer.fill('What has felt hardest this week?');
  await composer.press('Enter');
  await expect(page.locator('.msg.me').filter({ hasText: 'What has felt hardest this week?' })).toBeVisible();
  await expect(page.locator('.msg.me').filter({ hasText: 'What has felt hardest this week?' }).locator('.tag')).toHaveText('typed');
  await expect(page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY })).toBeVisible();
  captured = await log(page);
  const turn = realtimeCalls(captured, 'turn')[0];
  expect(turn.body.items).toEqual([{ itemId: expect.stringMatching(/^typed-/), text: 'What has felt hardest this week?' }]);
  expect(JSON.stringify(captured.fetches)).not.toContain('1234567');
  expect(JSON.stringify(captured.sent)).not.toContain('1234567');
  // The typed words reached the patient as a user item before the brief and the response.
  const userItems = sentEvents(captured, 'conversation.item.create').filter((event) => event.item.role === 'user');
  expect(userItems).toHaveLength(1);
  expect(userItems[0].item.content[0].text).toBe('What has felt hardest this week?');
});

test('the turn cap closes the room with the final reply visible and one route out', async ({ page }) => {
  await openRoom(page, { consented: true, maxTurns: 1 });
  await enterSpokenRoom(page);
  await learnerSays(page, 'One final question?');
  await expect(page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY })).toBeVisible();
  await expect(page.getByText('Turn 1 / 1')).toBeVisible();
  await learnerSays(page, 'And one more?');
  await expect(page.getByText(/Turn limit reached.*final patient reply remains above/i)).toBeVisible();
  await expect(page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY })).toBeVisible();
  await expect(page.getByLabel('Or type to the patient')).toHaveCount(0);
  const captured = await log(page);
  expect(realtimeCalls(captured, 'turn')).toHaveLength(2);
  expect(realtimeCalls(captured, 'end')).toHaveLength(1);
  expect(sentEvents(captured, 'response.create')).toHaveLength(2);
  const endAndReflect = page.getByRole('button', { name: /End encounter and reflect/i });
  await expect(endAndReflect).toBeVisible();
  await endAndReflect.click();
  await expect(page.getByLabel(/most afraid/i)).toBeFocused();
  expect(realtimeCalls(await log(page), 'end')).toHaveLength(1);
});

test('a dropped connection offers Reconnect and Continue typing; continuing keeps the encounter and its turns', async ({ page }) => {
  await openRoom(page, { consented: true });
  await enterSpokenRoom(page);
  await learnerSays(page, LEARNER_LINE);
  await expect(page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY })).toBeVisible();
  await expect(page.locator('.audiostatus')).toContainText(/Listening/i);
  const startBody = realtimeCalls(await log(page), 'start')[0].body;

  await page.evaluate(() => window.__rtFake.dropConnection());
  const alert = page.getByRole('alert');
  await expect(alert).toContainText(/The spoken room could not continue/);
  await expect(alert.getByRole('button', { name: 'Reconnect' })).toBeVisible();
  await expect(alert.getByRole('button', { name: 'Continue typing' })).toBeVisible();
  await expect(alert.getByRole('button', { name: 'End encounter' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue offline' })).toHaveCount(0);

  await alert.getByRole('button', { name: 'Reconnect' }).click();
  await expect(page.locator('.audiostatus')).toContainText(/Listening/i);
  let captured = await log(page);
  const starts = realtimeCalls(captured, 'start');
  expect(starts).toHaveLength(2);
  expect(starts[1].body.encounterId).toBe(startBody.encounterId);
  // The reconnect re-posts the learner transcript so the proxy's turn count is restored.
  const turns = realtimeCalls(captured, 'turn');
  expect(turns.at(-1).body.receipt).toBe('receipt-2-0');
  expect(turns.at(-1).body.items.map(({ text }) => text)).toEqual([LEARNER_LINE]);
  await expect(page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY })).toHaveCount(1);
  await expect(page.getByText('Turn 1 / 40')).toBeVisible();

  await page.evaluate(() => window.__rtFake.dropConnection());
  await expect(page.getByRole('alert').getByRole('button', { name: 'Continue typing' })).toBeVisible();
  await page.getByRole('alert').getByRole('button', { name: 'Continue typing' }).click();
  const composer = page.getByLabel('Your next words to the patient');
  await expect(composer).toBeVisible();
  // The typed room continues the conversation the learner actually had, the spoken opening included.
  await expect(page.locator('.msg.pt').filter({ hasText: OPENING })).toBeVisible();
  await expect(page.locator('.msg.pt').filter({ hasText: PACK_OPENING })).toHaveCount(0);
  await expect(page.locator('.msg.me').filter({ hasText: LEARNER_LINE })).toBeVisible();
  await expect(page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY })).toBeVisible();
  await expect(page.getByText('Turn 1 / 40')).toBeVisible();
  // Each dropped receipt was hung up once (the controller posts op=end on loss); continuing by
  // typing adds nothing more.
  captured = await log(page);
  expect(realtimeCalls(captured, 'end')).toHaveLength(2);
  await composer.fill('Thank you for telling me.');
  await page.getByRole('button', { name: 'Say it' }).click();
  await expect(page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY })).toHaveCount(2);
  captured = await log(page);
  const converse = captured.fetches.find(({ body }) => body?.mode === 'converse');
  expect(converse.body.encounterId).toBe(startBody.encounterId);
  expect(converse.body.turns).toEqual([{ me: LEARNER_LINE, pt: PATIENT_REPLY }]);
  expect(converse.body.turnId).toBe(2);
  expect(realtimeCalls(captured, 'start')).toHaveLength(2);
});

test('when the spoken room is not switched on, every case says so and routes to the typed room without a microphone request', async ({ page }) => {
  await openRoom(page, { realtimeDisabled: true });
  await expect(roomMode(page)).toHaveValue('spoken');
  const notes = page.getByRole('note').filter({ hasText: /not switched on for this rotation/ });
  await expect(notes.first()).toBeVisible();
  const begins = page.getByRole('button', { name: /Begin — Supported/i });
  const count = await begins.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) await expect(begins.nth(index)).toBeDisabled();
  await caseCard(page).getByRole('button', { name: 'Use the typed room' }).click();
  await expect(roomMode(page)).toHaveValue('typed');
  await expect(notes).toHaveCount(0);
  await beginTyped(page);
  const captured = await log(page);
  expect(captured.events).not.toContain('media:request');
  expect(realtimeCalls(captured, 'start')).toHaveLength(0);
});

test('without the tab passcode the spoken room fails closed before any microphone or health request', async ({ page }) => {
  await openRoom(page, { consented: true, noPasscode: true });
  await expect(roomMode(page)).toHaveValue('spoken');
  await expect(caseCard(page).getByRole('note').first()).toContainText(/Enter the passcode in setup/);
  await expect(supportedButton(page)).toBeDisabled();
  const captured = await log(page);
  expect(captured.events).not.toContain('media:request');
  expect(realtimeCalls(captured, 'start')).toHaveLength(0);
  expect(captured.fetches.filter(({ url, method }) => url === '/api/sp/realtime' && method === 'GET')).toHaveLength(0);
});

test('a denied microphone leaves the encounter recoverable by typing and never opens a call', async ({ page }) => {
  await openRoom(page, { consented: true, denyMic: true });
  await supportedButton(page).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText(/The spoken room could not continue/);
  await expect(alert).toContainText(/microphone/i);
  await expect(alert.getByRole('button', { name: 'Continue typing' })).toBeVisible();
  const captured = await log(page);
  expect(captured.events).toContain('media:request');
  expect(captured.events).not.toContain('pc:new');
  expect(realtimeCalls(captured, 'start')).toHaveLength(0);
  await alert.getByRole('button', { name: 'Continue typing' }).click();
  await expect(page.getByLabel('Your next words to the patient')).toBeEditable();
  // Nothing was spoken, so the typed room opens with the case's own opening line.
  await expect(page.locator('.msg.pt').filter({ hasText: PACK_OPENING })).toBeVisible();
});

test('a legacy managed-voice preference is retired into the typed room with device playback, and never re-enables dictation', async ({ page }) => {
  await openRoom(page, { legacyVoiceMode: 'device' });
  await expect(roomMode(page)).toHaveValue('typed-device');
  const stored = await storageSnapshot(page);
  expect(stored.local.cw_sp_voice_mode_v2).toBeUndefined();
  expect(stored.local.cw_sp_voice_consent_v1).toBeUndefined();
  expect(stored.local[ROOM_MODE_KEY]).toBeUndefined();
  await beginTyped(page);
  await expect(page.getByRole('button', { name: /record|speak your question/i })).toHaveCount(0);
  const captured = await log(page);
  expect(captured.events).toContain(`device:speak:${OPENING}`);
  expect(captured.events).not.toContain('media:request');
  expect(captured.fetches.some(({ url }) => url.includes('/sp/voice'))).toBe(false);
});

/* ------------------------------------------------------------------ the typed room */

test('the typed room is one keyboard step away and reads replies aloud only on request', async ({ page }) => {
  await openRoom(page);
  const select = roomMode(page);
  await select.focus();
  await page.keyboard.press('ArrowDown');
  await expect(select).toHaveValue('typed');
  await page.keyboard.press('ArrowDown');
  await expect(select).toHaveValue('typed-device');
  await page.keyboard.press('Home');
  await expect(select).toHaveValue('spoken');
  await select.selectOption('typed-device');
  await beginTyped(page);
  await expect(page.getByRole('log', { name: 'Conversation transcript' })).toHaveAttribute('aria-live', 'off');
  await expect(page.locator('[aria-live]:not([aria-live="off"]), [role="status"]:not([aria-live="off"]), [role="log"]:not([aria-live="off"]), [role="alert"]:not([aria-live="off"])')).toHaveCount(1);
  await page.getByLabel('Your next words to the patient').fill(LEARNER_LINE);
  await page.getByRole('button', { name: 'Say it' }).click();
  await expect(page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY })).toBeVisible();
  await expect(page.getByLabel('Your next words to the patient')).toBeFocused();
  await page.getByRole('button', { name: 'End encounter' }).click();
  await expect(select).toBeDisabled();
  await completeSelfAssessment(page);
  await page.getByRole('button', { name: /show the debrief/i }).click();
  await expect(page.getByText('Your read, then the room’s')).toBeVisible();
  await page.getByRole('button', { name: 'Back to cases' }).click();
  await expect(select).toBeEnabled();
  await select.selectOption('typed');
  await beginTyped(page);

  const captured = await log(page);
  const actorCalls = captured.fetches.filter(({ url }) => url === '/api/sp');
  const openings = actorCalls.filter(({ body }) => body?.mode === 'open');
  const converse = actorCalls.find(({ body }) => body?.mode === 'converse');
  const evaluation = actorCalls.find(({ body }) => body?.mode === 'evaluate');
  expect(openings[0].body.encounterId).toMatch(ID_PATTERN);
  expect(converse.body.encounterId).toBe(openings[0].body.encounterId);
  expect(evaluation.body.encounterId).toBe(openings[0].body.encounterId);
  expect(openings[1].body.encounterId).toMatch(ID_PATTERN);
  expect(openings[1].body.encounterId).not.toBe(openings[0].body.encounterId);
  expect(captured.randomSizes.length).toBeGreaterThanOrEqual(2);
  expect(captured.randomSizes.every((size) => size === 16)).toBe(true);
  expect(captured.events.filter((event) => event === `device:speak:${OPENING}`)).toHaveLength(1);
  expect(captured.events).not.toContain('media:request');
  expect(captured.events).not.toContain('pc:new');
  expect(realtimeCalls(captured, 'start')).toHaveLength(0);
});

test('modal focus, encounter focus, and 44px setup targets remain keyboard-safe', async ({ page }) => {
  await openRoom(page, { roomMode: 'typed' });
  const modeButtons = page.locator('.badge.mode');
  const heights = await modeButtons.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);
  expect(heights.every((height) => height >= 44)).toBe(true);
  expect(await roomMode(page).evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);

  await roomMode(page).selectOption('spoken');
  await supportedButton(page).click();
  const consent = page.getByRole('dialog', { name: 'Before entering the spoken room' });
  await expect(consent).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(consent.getByRole('button', { name: 'Use the typed room instead' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(consent.getByRole('checkbox', { name: /using speakers/i })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(consent).toHaveCount(0);
  await expect(roomMode(page)).toBeFocused();
  await expect(roomMode(page)).toHaveValue('typed');

  await beginTyped(page);
  await expect(page.getByLabel('Your next words to the patient')).toBeFocused();
  const stepOut = page.getByRole('button', { name: /Step out/i });
  await stepOut.click();
  const returnToRoom = page.getByRole('button', { name: 'Return to the room' });
  await expect(returnToRoom).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(returnToRoom).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(stepOut).toBeFocused();
});

test('the speakers choice reaches the proxy as far-field audio setup', async ({ page }) => {
  await openRoom(page);
  await supportedButton(page).click();
  const consent = page.getByRole('dialog', { name: 'Before entering the spoken room' });
  await consent.getByRole('checkbox', { name: /using speakers/i }).check();
  await consent.getByRole('button', { name: 'Enter the spoken room' }).click();
  await expect(page.locator('.msg.pt').filter({ hasText: OPENING })).toBeVisible();
  const start = realtimeCalls(await log(page), 'start')[0];
  expect(start.body.audioSetup).toBe('speakers');
  await expect(page.getByText('Spoken room · speakers')).toBeVisible();
  expect((await storageSnapshot(page)).local.cw_sp_audio_setup_v1).toBe('speakers');
});

test('setup surfaces a typed server error message without object coercion', async ({ page }) => {
  await openRoom(page, { setupError: true, roomMode: 'typed' });
  await page.getByRole('button', { name: /setup/i }).click();
  await page.getByRole('button', { name: /Save & test connection/i }).click();
  await expect(page.getByText('✗ Correct the rotation passcode.')).toBeVisible();
  await expect(page.getByText(/\[object Object\]/)).toHaveCount(0);
});

test('slow actor is cancelled on End and its stale reply never appears', async ({ page }) => {
  await openRoom(page, { slowActorMs: 700, ignoreActorAbort: true, roomMode: 'typed' });
  await beginTyped(page);
  await page.getByLabel('Your next words to the patient').fill('Please take your time.');
  await page.getByRole('button', { name: 'Say it' }).click();
  await expect(page.locator('.audiostatus')).toContainText(/Dana is thinking/i);
  await page.getByRole('button', { name: 'End encounter' }).click();
  await expect.poll(async () => (await log(page)).events.includes('actor:abort')).toBe(true);
  await page.waitForTimeout(850);
  await expect(page.getByText(LATE_REPLY)).toHaveCount(0);
  await completeSelfAssessment(page);
  await page.getByRole('button', { name: /show the debrief/i }).click();
  const evaluation = (await log(page)).fetches.find(({ body }) => body?.mode === 'evaluate');
  expect(evaluation.body.turns).toEqual([]);
  expect(JSON.stringify(evaluation.body)).not.toContain(LATE_REPLY);
});

test('a late evaluation cannot write feedback into a re-run encounter', async ({ page }) => {
  await openRoom(page, { staleEvaluationRace: true, roomMode: 'typed' });
  await beginTyped(page);
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
  await openRoom(page, { actorError: true, roomMode: 'typed' });
  await beginTyped(page);
  const learnerText = 'What has felt hardest?';
  await page.getByLabel('Your next words to the patient').fill(learnerText);
  await page.getByRole('button', { name: 'Say it' }).click();
  await expect(page.getByText(learnerText)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue offline' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Retry$/ })).toHaveCount(0);
  await expect(page.getByText('Offline simulation', { exact: true })).toHaveCount(0);
  const before = await page.locator('.msg.pt').count();
  await page.getByRole('button', { name: 'Continue offline' }).click();
  await expect(page.getByText('Offline simulation', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.msg.pt')).toHaveCount(before + 1);
  await expect(page.locator('.msg.pt').last()).toContainText('Offline simulation');
  expect((await log(page)).fetches.filter(({ url, body }) => url === '/api/sp' && body?.mode === 'converse')).toHaveLength(1);
});

test('actor authentication recovery requires an explicitly restarted room', async ({ page }) => {
  await openRoom(page, { actorUnauthorized: true, roomMode: 'typed' });
  await beginTyped(page);
  await page.getByLabel('Your next words to the patient').fill('Can we try that again?');
  await page.getByRole('button', { name: 'Say it' }).click();
  const failedEncounterId = (await log(page)).fetches.find(({ body }) => body?.mode === 'converse').body.encounterId;
  await expect(page.getByRole('button', { name: 'Reopen setup' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue offline' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reopen setup' }).click();
  await expect(page.getByLabel('Passcode')).toBeFocused();
  await page.getByLabel('Passcode').fill('corrected-key');
  await page.getByRole('button', { name: /Save & test connection/i }).click();
  await expect(page.getByText(/Connected/i)).toBeVisible();
  expect((await log(page)).fetches.filter(({ body }) => body?.mode === 'converse')).toHaveLength(1);
  await page.getByRole('button', { name: /Restart room with corrected passcode/i }).click();
  await expect(page.locator('.msg.pt').filter({ hasText: OPENING })).toBeVisible();
  await expect(page.getByLabel('Your next words to the patient')).toBeFocused();
  await page.getByLabel('Your next words to the patient').fill('Can we try that again?');
  await page.getByRole('button', { name: 'Say it' }).click();
  await expect(page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY })).toBeVisible();
  const actorCalls = (await log(page)).fetches.filter(({ body }) => body?.mode === 'converse');
  expect(actorCalls).toHaveLength(2);
  expect(actorCalls[1].headers['x-student-key']).toBe('corrected-key');
  expect(actorCalls[1].body.encounterId).not.toBe(failedEncounterId);
  await expect(page.getByText('Offline simulation', { exact: true })).toHaveCount(0);
});

test('the final allowed patient reply remains visible until the learner ends the typed room', async ({ page }) => {
  await openRoom(page, { maxTurns: 1, roomMode: 'typed' });
  await beginTyped(page);
  await page.getByLabel('Your next words to the patient').fill('One final question?');
  await page.getByRole('button', { name: 'Say it' }).click();
  await expect(page.locator('.msg.pt').filter({ hasText: PATIENT_REPLY })).toBeVisible();
  await expect(page.getByText(/Turn limit reached.*final patient reply remains above/i)).toBeVisible();
  await expect(page.getByLabel('Your next words to the patient')).toHaveCount(0);
  const endAndReflect = page.getByRole('button', { name: /End encounter and reflect/i });
  await expect(endAndReflect).toBeFocused();
  await endAndReflect.click();
  await expect(page.getByLabel(/most afraid/i)).toBeFocused();
});

test('the spoken room stays usable on a narrow reduced-motion screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoom(page, { consented: true });
  await enterSpokenRoom(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  for (const name of ['Pause', 'Done speaking', 'Stop Dana', 'Say that again', 'Send', 'End encounter']) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    expect(await button.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
  const composer = page.getByLabel('Or type to the patient');
  await composer.scrollIntoViewIfNeeded();
  await expect(composer).toBeInViewport();
  await expect(composer).toBeEditable();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('.audiostatus')).toContainText(/Paused/i);
  await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.locator('.audiostatus')).toContainText(/Listening/i);
});

/* ------------------------------------------------------------------ helpers used above */

async function enterSpokenRoomHeld(page) {
  await supportedButton(page).click();
  await expect(page.locator('.msg.pt').filter({ hasText: OPENING })).toBeVisible();
  await expect(page.locator('.audiostatus')).toContainText(/Dana is speaking/i);
  await page.evaluate(() => window.__rtFake.finishPatientAudio());
  await expect(page.locator('.audiostatus')).toContainText(/Listening/i);
}

async function learnerSaysAndHears(page, line, replyText) {
  await learnerSays(page, line);
  await expect(page.locator('.msg.me').filter({ hasText: line })).toBeVisible();
  await expect(page.locator('.msg.pt').filter({ hasText: replyText }).first()).toBeVisible();
}
