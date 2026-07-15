import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import SPInterviewVoice from '../sp-interview.voice.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(testDir, '..', 'sp-interview.html');
const packPath = path.resolve(testDir, '..', 'sp-interview.pack.json');
const html = fs.readFileSync(htmlPath, 'utf8');
const pack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
const reviewedCase = pack.cases.find((candidate) => candidate.facultyReview?.status === 'reviewed');
const ENCOUNTER_ID = 'AAECAwQFBgcICQoLDA0ODw';

function mainScriptSource() {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1]);
  const source = scripts.find((candidate) => candidate.includes('var e=React.createElement'));
  assert.ok(source, 'the Interview Room React application script must remain extractable');
  return source.trim();
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function loadHooks(fetchImpl) {
  const liveNode = { textContent: '', addEventListener() {}, removeEventListener() {} };
  const document = {
    documentElement: { getAttribute() { return null; }, setAttribute() {} },
    getElementById(id) {
      if (id === 'live') return liveNode;
      return { addEventListener() {}, removeEventListener() {}, textContent: '' };
    },
    createElement() {
      return { click() {}, set href(value) {}, set download(value) {} };
    },
  };
  const window = {
    __SP_PREVIEW__: { providerMode: 'live', endpoint: '/api/sp', autoOpenSettings: false },
    SPInterviewVoice,
  };
  const context = vm.createContext({
    AbortController,
    ArrayBuffer,
    Blob,
    DOMException,
    Headers,
    Request,
    Response,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    URL,
    clearTimeout,
    console,
    document,
    fetch: fetchImpl,
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
    setTimeout,
    window,
    React: {
      createElement() { return null; },
      useEffect() {},
      useRef(value) { return { current: value }; },
      useState(value) { return [typeof value === 'function' ? value() : value, () => {}]; },
    },
    ReactDOM: { createRoot() { return { render() {} }; } },
  });
  window.window = window;
  window.document = document;
  vm.runInContext(mainScriptSource(), context, { filename: htmlPath });
  assert.ok(window.__SP_TEST__, 'the Interview Room must publish its bounded test hook');
  return window.__SP_TEST__;
}

function endpointError(status, code, retryDisposition = 'offline-only') {
  return new Response(JSON.stringify({
    error: { code, message: `safe ${code}` },
    retryDisposition,
  }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function newProvider(hooks) {
  assert.equal(typeof hooks.ProxyProvider, 'function', 'ProxyProvider must be exposed to the test hook');
  const provider = new hooks.ProxyProvider('/api/sp', 'student-test-key', {
    rapportMin: pack.engine.rapportMin,
    rapportMax: pack.engine.rapportMax,
  });
  const session = provider.start(reviewedCase, {
    difficulty: 'supported',
    encounterId: ENCOUNTER_ID,
  });
  return { provider, session };
}

test('ProxyProvider preserves typed endpoint failures and never silently calls MockProvider', async () => {
  const failures = [
    [401, 'unauthorized', 'offline-only'],
    [403, 'case_not_reviewed', 'offline-only'],
    [429, 'rotation_budget_exhausted', 'offline-only'],
    [504, 'actor_timeout', 'offline-only'],
    [502, 'actor_upstream_failed', 'offline-only'],
    [503, 'actor_not_started', 'same-operation'],
  ];
  let responseIndex = 0;
  const hooks = loadHooks(async () => {
    const [status, code, retryDisposition] = failures[responseIndex++];
    return endpointError(status, code, retryDisposition);
  });
  let mockResponses = 0;
  const originalMockRespond = hooks.MockProvider.prototype.respond;
  hooks.MockProvider.prototype.respond = function forbiddenFallback() {
    mockResponses += 1;
    return Promise.resolve({ reply: 'silent fallback must not happen' });
  };

  try {
    for (const [status, code, retryDisposition] of failures) {
      const { provider, session } = newProvider(hooks);
      await assert.rejects(
        provider.respond(session, 'What has this week been like?', {
          encounterId: ENCOUNTER_ID,
          turnId: 1,
          signal: new AbortController().signal,
        }),
        (error) => {
          assert.equal(error.code, code);
          assert.equal(error.status, status);
          assert.equal(error.retryDisposition, retryDisposition);
          assert.equal(error.message, `safe ${code}`);
          return true;
        },
      );
      assert.equal(session.turns.length, 0, `${code} must not publish a patient turn`);
    }
  } finally {
    hooks.MockProvider.prototype.respond = originalMockRespond;
  }

  assert.equal(responseIndex, failures.length, 'ProxyProvider must make one request per learner action');
  assert.equal(mockResponses, 0, 'typed failures require an explicit learner fallback choice');
});

test('ProxyProvider applies governed state privately and exposes only reply and ticket', async () => {
  const body = {
    reply: 'It has been hard to get out of bed.',
    state: {
      intents: ['open_invite'],
      flags: [],
      rapport: 1,
      unlocked: ['work_stressor'],
    },
    ticket: 'signed-speech-ticket',
  };
  const hooks = loadHooks(async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }));
  const { provider, session } = newProvider(hooks);

  const result = await provider.respond(session, 'Tell me what has been hardest.', {
    encounterId: ENCOUNTER_ID,
    turnId: 1,
    signal: new AbortController().signal,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    reply: body.reply,
    ticket: body.ticket,
  });
  assert.deepEqual(Object.keys(result), ['reply', 'ticket']);
  assert.equal(session.turns.length, 1);
  assert.equal(session.turns[0].pt, body.reply);
  assert.equal(session.rapport, 1);
  assert.equal(session.covered.open_invite, true);
  assert.equal(session.unlocked.work_stressor, true);
});

test('malformed successful actor responses leave the private session unchanged', async () => {
  const validState = {
    intents: ['open_invite'],
    flags: [],
    rapport: 1,
    unlocked: ['work_stressor'],
  };
  const malformedBodies = [
    { state: validState, ticket: null },
    { reply: '', state: validState, ticket: null },
    { reply: '   ', state: validState, ticket: null },
    { reply: 'x'.repeat(1201), state: validState, ticket: null },
    { reply: 'Extra top-level key.', state: validState, ticket: null, extra: true },
    { reply: 'Extra state key.', state: { ...validState, extra: true }, ticket: null },
    { reply: 'Invalid intents.', state: { ...validState, intents: 'open_invite' }, ticket: null },
    { reply: 'Invalid flag member.', state: { ...validState, flags: [7] }, ticket: null },
    { reply: 'Invalid rapport.', state: { ...validState, rapport: '1' }, ticket: null },
    { reply: 'Fractional rapport.', state: { ...validState, rapport: 1.5 }, ticket: null },
    { reply: 'Rapport below reviewed bounds.', state: { ...validState, rapport: pack.engine.rapportMin - 1 }, ticket: null },
    { reply: 'Rapport above reviewed bounds.', state: { ...validState, rapport: pack.engine.rapportMax + 1 }, ticket: null },
    { reply: 'Invalid unlocked.', state: { ...validState, unlocked: null }, ticket: null },
    { reply: 'Invalid ticket.', state: validState, ticket: 42 },
    { reply: 'Empty ticket.', state: validState, ticket: '' },
    { reply: 'Blank ticket.', state: validState, ticket: '   ' },
  ];
  let responseIndex = 0;
  const hooks = loadHooks(async () => new Response(JSON.stringify(malformedBodies[responseIndex++]), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }));

  for (const body of malformedBodies) {
    const { provider, session } = newProvider(hooks);
    await assert.rejects(
      provider.respond(session, 'Please tell me more.', {
        encounterId: ENCOUNTER_ID,
        turnId: 1,
        signal: new AbortController().signal,
      }),
      (error) => {
        assert.equal(error.code, 'invalid_response');
        assert.equal(error.status, 200);
        assert.equal(error.retryDisposition, 'offline-only');
        return true;
      },
      `body must be rejected before session mutation: ${JSON.stringify(body)}`,
    );
    assert.equal(session.turns.length, 0);
    assert.equal(session.rapport, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(session.covered)), {});
    assert.deepEqual(JSON.parse(JSON.stringify(session.unlocked)), {});
  }
  assert.equal(responseIndex, malformedBodies.length);
});

test('a late response after cancellation cannot mutate the private session', async () => {
  let resolveFetch;
  const hooks = loadHooks(() => new Promise((resolve) => { resolveFetch = resolve; }));
  const { provider, session } = newProvider(hooks);
  const abort = new AbortController();
  const pending = provider.respond(session, 'Please take your time.', {
    encounterId: ENCOUNTER_ID,
    turnId: 1,
    signal: abort.signal,
  });

  abort.abort();
  resolveFetch(new Response(JSON.stringify({
    reply: 'This stale reply must stay private and unused.',
    state: { intents: ['open_invite'], flags: [], rapport: 2, unlocked: ['work_stressor'] },
    ticket: 'stale-ticket',
  }), { headers: { 'content-type': 'application/json' } }));

  await assert.rejects(pending, { code: 'cancelled', retryDisposition: 'offline-only' });
  assert.equal(session.turns.length, 0);
  assert.equal(session.rapport, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(session.covered)), {});
  assert.deepEqual(JSON.parse(JSON.stringify(session.unlocked)), {});
});

test('HTML loads one shared voice controller and removes the parallel legacy speech engine', () => {
  const source = mainScriptSource();
  const controllerAsset = html.indexOf('<script src="./sp-interview.voice.js"></script>');
  const applicationScript = html.indexOf('<script>\n(function(){', controllerAsset + 1);

  assert.ok(controllerAsset > 0, 'the voice controller asset must be loaded');
  assert.ok(applicationScript > controllerAsset, 'the controller must load before the React application');
  assert.equal(
    (source.match(/\bvoiceControllerRef\s*=\s*useRef\s*\(/g) || []).length,
    1,
    'React must create exactly one voice controller ref',
  );
  assert.doesNotMatch(source, /\b(?:webkit)?SpeechRecognition\b/);
  assert.doesNotMatch(source, /\bbuildSpeechSteps\b/);
  assert.doesNotMatch(source, /\bspkTimer\b/);
});

test('patient messages always render their complete authoritative text', () => {
  const source = mainScriptSource();
  assert.match(source, /\bm\.text\b/, 'message rendering must use the complete m.text value');
  assert.doesNotMatch(source, /\bspk\.text\b/);
  assert.doesNotMatch(source, /speaking\s*\?[^:]+:\s*m\.text/);
});
