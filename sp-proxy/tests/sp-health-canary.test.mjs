import assert from 'node:assert/strict';
import test from 'node:test';

const CANONICAL_ORIGIN = 'https://une-ms3-psychiatry.netlify.app';
const CHECKED_AT = '2026-07-28T12:00:00.000Z';
const NEXT_RUN = '2026-07-28T18:00:00.000Z';
const SITE_URL = 'https://sp-interview-proxy.netlify.app';
const STUDENT_PASSCODE = 'test-only-passcode';

const VALID_HEALTH = Object.freeze({
  schemaVersion: 1,
  actorModel: 'model-pin-v1',
  evaluatorModel: 'model-pin-v1',
  packVersion: 'pack-version-v1',
  packStatus: 'reviewed',
  cases: [Object.freeze({ id: 'case-1', title: 'Synthetic case' })],
});

const SUCCESS_RECEIPT = Object.freeze({
  schemaVersion: 1,
  state: 'success',
  learnerReady: true,
  caseCount: 1,
  checkedAt: CHECKED_AT,
  nextRun: NEXT_RUN,
  contractSha256: 'ab'.repeat(32),
});

let healthModulesPromise;

async function healthModules() {
  healthModulesPromise ??= Promise.all([
    import('../netlify/functions/_shared/sp-health-receipt.mjs'),
    import('../netlify/functions/sp-health-canary.mjs'),
    import('../netlify/functions/sp-health-status.mjs'),
  ]).then(([receipt, canary, status]) => ({ receipt, canary, status }));
  return healthModulesPromise;
}

function scheduledRequest(nextRun = NEXT_RUN) {
  return new Request('https://scheduled.invalid', {
    method: 'POST',
    body: JSON.stringify({ next_run: nextRun }),
  });
}

function defaultEnv(overrides = {}) {
  return {
    SP_STUDENT_PASSCODE: STUDENT_PASSCODE,
    SP_ALLOWED_ORIGINS: CANONICAL_ORIGIN,
    URL: SITE_URL,
    ...overrides,
  };
}

function memoryStore(initial = null, { failSet = false, failGet = false } = {}) {
  let latest = initial;
  const writes = [];
  return {
    writes,
    async setJSON(key, value) {
      writes.push({ key, value });
      if (failSet) throw new Error('PRIVATE_BLOB_EXCEPTION_SENTINEL');
      latest = structuredClone(value);
    },
    async get(key, options) {
      assert.equal(key, 'latest');
      assert.deepEqual(options, { type: 'json' });
      if (failGet) throw new Error('PRIVATE_BLOB_READ_SENTINEL');
      return latest === null ? null : structuredClone(latest);
    },
    readLatest() {
      return latest === null ? null : structuredClone(latest);
    },
  };
}

function responseFor(body = VALID_HEALTH, {
  status = 200,
  contentType = 'application/json',
  rawBody = null,
} = {}) {
  return new Response(rawBody ?? JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType },
  });
}

async function createCanaryHarness({
  env = defaultEnv(),
  fetchImpl = async () => responseFor(),
  store = memoryStore(),
  now = () => CHECKED_AT,
  log = () => {},
  setTimeoutImpl,
  clearTimeoutImpl,
} = {}) {
  const { canary } = await healthModules();
  return {
    store,
    handler: canary.createHealthCanary({
      readEnv: (key) => env[key],
      fetchImpl,
      store,
      now,
      log,
      ...(setTimeoutImpl ? { setTimeoutImpl } : {}),
      ...(clearTimeoutImpl ? { clearTimeoutImpl } : {}),
    }),
  };
}

async function statusResponse(receipt, {
  method = 'GET',
  now = () => '2026-07-28T12:05:00.000Z',
  store = memoryStore(receipt),
  headers = {},
} = {}) {
  const { status } = await healthModules();
  const handler = status.createHealthStatus({ store, now });
  return handler(new Request('https://status.example/api/sp/health-status', {
    method,
    headers,
  }));
}

test('exports the scheduled config and leaves public status route ownership to TOML', async () => {
  const { canary, status } = await healthModules();
  assert.deepEqual(canary.config, { schedule: '0 */6 * * *' });
  assert.equal('config' in status, false);
});

test('runtime env access falls back per key when Netlify omits a system variable', async (t) => {
  const { canary } = await healthModules();
  const fallbackKey = 'SP_TEST_RUNTIME_ENV_FALLBACK';
  const priorNetlify = globalThis.Netlify;
  const priorFallback = process.env[fallbackKey];
  t.after(() => {
    if (priorNetlify === undefined) delete globalThis.Netlify;
    else globalThis.Netlify = priorNetlify;
    if (priorFallback === undefined) delete process.env[fallbackKey];
    else process.env[fallbackKey] = priorFallback;
  });

  globalThis.Netlify = {
    env: {
      get(name) {
        return name === 'SP_TEST_NETLIFY_ENV' ? 'netlify-value' : undefined;
      },
    },
  };
  process.env[fallbackKey] = 'process-value';

  assert.equal(canary.readRuntimeEnv('SP_TEST_NETLIFY_ENV'), 'netlify-value');
  assert.equal(canary.readRuntimeEnv(fallbackKey), 'process-value');
});

test('scheduled canary normalizes Netlify next_run timestamps without milliseconds', async () => {
  const store = memoryStore();
  const { handler } = await createCanaryHarness({ store });

  await handler(scheduledRequest('2026-07-28T18:00:00Z'));

  assert.equal(store.writes.length, 1);
  assert.equal(store.writes[0].value.nextRun, NEXT_RUN);
});

test('validateHealth accepts only the bounded health contract and freezes its result', async () => {
  const { receipt } = await healthModules();
  for (const [packStatus, learnerReady] of [
    ['draft-pending-attestation', false],
    ['reviewed', true],
    ['attested', true],
  ]) {
    const result = receipt.validateHealth({ ...VALID_HEALTH, packStatus });
    assert.deepEqual(Object.keys(result).sort(), [
      'caseCount',
      'contractSha256',
      'learnerReady',
    ]);
    assert.equal(result.learnerReady, learnerReady);
    assert.equal(result.caseCount, 1);
    assert.match(result.contractSha256, /^[a-f0-9]{64}$/);
    assert.equal(Object.isFrozen(result), true);
  }
});

test('validateHealth rejects wrong schemas, unsafe model or pack pins, and invalid case sets', async () => {
  const { receipt } = await healthModules();
  const invalidBodies = [
    { ...VALID_HEALTH, schemaVersion: 2 },
    { ...VALID_HEALTH, actorModel: 'different-model' },
    { ...VALID_HEALTH, actorModel: ' ' },
    { ...VALID_HEALTH, evaluatorModel: '' },
    { ...VALID_HEALTH, packVersion: '\t' },
    { ...VALID_HEALTH, packStatus: 'approved' },
    { ...VALID_HEALTH, cases: [] },
    {
      ...VALID_HEALTH,
      cases: [
        { id: 'duplicate', title: 'Synthetic one' },
        { id: 'duplicate', title: 'Synthetic two' },
      ],
    },
    { ...VALID_HEALTH, cases: [{ id: '', title: 'Synthetic case' }] },
    { ...VALID_HEALTH, cases: [{ id: 'case-1' }] },
    { ...VALID_HEALTH, cases: [{ id: 'case-1', title: 123 }] },
    { ...VALID_HEALTH, cases: [{ id: 'case-1', title: 'Synthetic case', prompt: 'extra' }] },
    { ...VALID_HEALTH, cases: [{ id: '\ud800', title: 'Synthetic case' }] },
    { ...VALID_HEALTH, cases: [{ id: 'x'.repeat(129), title: 'Synthetic case' }] },
    { ...VALID_HEALTH, cases: [{ id: 'case-1', title: '\udfff' }] },
    { ...VALID_HEALTH, cases: [{ id: 'case-1', title: 'x'.repeat(201) }] },
  ];
  for (const body of invalidBodies) {
    assert.throws(() => receipt.validateHealth(body), /health contract/i);
  }
});

test('validateHealth never returns or hashes case title text', async () => {
  const { receipt } = await healthModules();
  const first = receipt.validateHealth(VALID_HEALTH);
  const second = receipt.validateHealth({
    ...VALID_HEALTH,
    cases: [{ id: 'case-1', title: 'A different synthetic title' }],
  });
  assert.deepEqual(first, second);
  assert.doesNotMatch(JSON.stringify(first), /Synthetic|different/i);
});

test('scheduled canary performs one exact authenticated GET and persists a redacted success receipt', async () => {
  const requests = [];
  const store = memoryStore();
  const { handler } = await createCanaryHarness({
    store,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return responseFor();
    },
  });

  const result = await handler(scheduledRequest());

  assert.equal(result, undefined);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${SITE_URL}/api/sp`);
  assert.deepEqual(Object.keys(requests[0].init).sort(), ['headers', 'method', 'redirect', 'signal']);
  assert.equal(requests[0].init.method, 'GET');
  assert.equal(requests[0].init.redirect, 'error');
  assert.deepEqual(requests[0].init.headers, {
    Origin: CANONICAL_ORIGIN,
    'x-student-key': STUDENT_PASSCODE,
    Accept: 'application/json',
  });
  assert.equal(requests[0].init.signal instanceof AbortSignal, true);
  assert.equal(store.writes.length, 1);
  assert.equal(store.writes[0].key, 'latest');
  assert.deepEqual(Object.keys(store.writes[0].value).sort(), [
    'caseCount',
    'checkedAt',
    'contractSha256',
    'learnerReady',
    'nextRun',
    'schemaVersion',
    'state',
  ]);
  assert.equal(store.writes[0].value.state, 'success');
  assert.equal(store.writes[0].value.learnerReady, true);
  assert.equal(store.writes[0].value.caseCount, 1);
  assert.equal(store.writes[0].value.checkedAt, CHECKED_AT);
  assert.equal(store.writes[0].value.nextRun, NEXT_RUN);
  assert.match(store.writes[0].value.contractSha256, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(store.writes), /test-only-passcode|model-pin|pack-version|Synthetic/);
});

test('scheduled canary refuses redirects without forwarding the learner credential', async () => {
  const requests = [];
  const logs = [];
  const store = memoryStore();
  const { handler } = await createCanaryHarness({
    store,
    log: (event) => logs.push(event),
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      if (init.redirect !== 'error') {
        requests.push({
          url: 'https://redirect-target.invalid/credential-capture',
          init,
        });
        return responseFor();
      }
      return new Response(null, {
        status: 302,
        headers: { location: 'https://redirect-target.invalid/credential-capture' },
      });
    },
  });

  await assert.rejects(handler(scheduledRequest()), /^Error: Interview Room health canary failed\.$/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${SITE_URL}/api/sp`);
  assert.equal(requests.some(({ url }) => url.includes('redirect-target')), false);
  assert.deepEqual(store.writes, [{
    key: 'latest',
    value: {
      schemaVersion: 1,
      state: 'failed',
      failureCode: 'http_status',
      checkedAt: CHECKED_AT,
    },
  }]);
  assert.doesNotMatch(
    JSON.stringify({ writes: store.writes, logs }),
    /test-only-passcode|x-student-key|redirect-target/i,
  );
});

test('scheduled canary requires the literal canonical origin instead of selecting another HTTPS origin', async () => {
  for (const allowedOrigins of [
    '',
    'https://another.example',
    `https://another.example,${CANONICAL_ORIGIN}.evil.example`,
  ]) {
    let fetchCalls = 0;
    const store = memoryStore();
    const { handler } = await createCanaryHarness({
      env: defaultEnv({ SP_ALLOWED_ORIGINS: allowedOrigins }),
      store,
      fetchImpl: async () => {
        fetchCalls += 1;
        return responseFor();
      },
    });
    await assert.rejects(handler(scheduledRequest()), /^Error: Interview Room health canary failed\.$/);
    assert.equal(fetchCalls, 0);
    assert.deepEqual(store.writes[0].value, {
      schemaVersion: 1,
      state: 'failed',
      failureCode: 'configuration',
      checkedAt: CHECKED_AT,
    });
  }
});

test('scheduled canary converts missing or malformed configuration into one bounded receipt', async () => {
  const configurations = [
    { SP_STUDENT_PASSCODE: '' },
    { SP_STUDENT_PASSCODE: undefined },
    { URL: '' },
    { URL: 'not-a-url' },
    { URL: 'https://user:secret@example.test' },
  ];
  for (const overrides of configurations) {
    const store = memoryStore();
    const { handler } = await createCanaryHarness({
      env: defaultEnv(overrides),
      store,
    });
    await assert.rejects(handler(scheduledRequest()), /^Error: Interview Room health canary failed\.$/);
    assert.equal(store.writes.length, 1);
    assert.deepEqual(store.writes[0].value, {
      schemaVersion: 1,
      state: 'failed',
      failureCode: 'configuration',
      checkedAt: CHECKED_AT,
    });
  }
});

test('scheduled canary maps upstream failures to a fixed allow-list of sanitized failure codes', async () => {
  const cases = [
    {
      want: 'http_status',
      fetchImpl: async () => responseFor({}, { status: 503 }),
    },
    {
      want: 'content_type',
      fetchImpl: async () => responseFor(VALID_HEALTH, { contentType: 'text/html' }),
    },
    {
      want: 'invalid_json',
      fetchImpl: async () => responseFor(null, { rawBody: '{' }),
    },
    {
      want: 'contract',
      fetchImpl: async () => responseFor({ ...VALID_HEALTH, schemaVersion: 9 }),
    },
    {
      want: 'transport',
      fetchImpl: async () => {
        throw new Error('PRIVATE_TRANSPORT_EXCEPTION https://private.example');
      },
    },
  ];
  for (const item of cases) {
    const logs = [];
    const store = memoryStore();
    const { handler } = await createCanaryHarness({
      store,
      fetchImpl: item.fetchImpl,
      log: (event) => logs.push(event),
    });
    await assert.rejects(handler(scheduledRequest()), /^Error: Interview Room health canary failed\.$/);
    assert.deepEqual(store.writes.at(-1).value, {
      schemaVersion: 1,
      state: 'failed',
      failureCode: item.want,
      checkedAt: CHECKED_AT,
    });
    assert.match(
      item.want,
      /^(configuration|timeout|transport|http_status|content_type|invalid_json|contract|receipt_write)$/,
    );
    assert.doesNotMatch(
      JSON.stringify({ writes: store.writes, logs }),
      /PRIVATE_|private\.example|test-only-passcode|x-student-key|model-pin|pack-version|prompt|reply/i,
    );
  }
});

test('validation failure attempts a sanitized receipt before a generic throw', async () => {
  const logs = [];
  const store = memoryStore();
  const unsafe = {
    ...VALID_HEALTH,
    actorModel: 'RAW_MODEL_SENTINEL',
    packVersion: 'RAW_PACK_SENTINEL',
    cases: [{
      id: 'case-1',
      title: 'RAW_CASE_SENTINEL',
      prompt: 'RAW_PROMPT_SENTINEL',
      reply: 'RAW_REPLY_SENTINEL',
    }],
  };
  const { handler } = await createCanaryHarness({
    store,
    fetchImpl: async () => responseFor(unsafe),
    log: (event) => logs.push(event),
  });

  await assert.rejects(handler(scheduledRequest()), (error) => {
    assert.equal(error.message, 'Interview Room health canary failed.');
    assert.doesNotMatch(error.message, /RAW_|https?:|passcode|header|exception/i);
    return true;
  });
  assert.deepEqual(store.writes, [{
    key: 'latest',
    value: {
      schemaVersion: 1,
      state: 'failed',
      failureCode: 'contract',
      checkedAt: CHECKED_AT,
    },
  }]);
  assert.doesNotMatch(
    JSON.stringify({ writes: store.writes, logs }),
    /RAW_|test-only-passcode|x-student-key|exception/i,
  );
});

test('scheduled canary aborts upstream work at exactly eight seconds and writes a timeout receipt', async () => {
  let timerCallback;
  const timerCalls = [];
  const store = memoryStore();
  const { handler } = await createCanaryHarness({
    store,
    setTimeoutImpl(callback, milliseconds) {
      timerCallback = callback;
      timerCalls.push({ method: 'set', milliseconds });
      return 41;
    },
    clearTimeoutImpl(id) {
      timerCalls.push({ method: 'clear', id });
    },
    fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        reject(new DOMException('PRIVATE_TIMEOUT_EXCEPTION', 'AbortError'));
      });
      queueMicrotask(() => timerCallback());
    }),
  });

  await assert.rejects(handler(scheduledRequest()), /^Error: Interview Room health canary failed\.$/);
  assert.deepEqual(timerCalls, [
    { method: 'set', milliseconds: 8_000 },
    { method: 'clear', id: 41 },
  ]);
  assert.equal(store.writes.at(-1).value.failureCode, 'timeout');
  assert.doesNotMatch(JSON.stringify(store.writes), /PRIVATE_TIMEOUT_EXCEPTION/);
});

test('scheduled canary keeps the deadline active through a never-settling response body', async () => {
  let timerActive = true;
  const store = memoryStore();
  const { handler } = await createCanaryHarness({
    store,
    setTimeoutImpl(callback, milliseconds) {
      assert.equal(milliseconds, 8_000);
      setImmediate(() => {
        if (timerActive) callback();
      });
      return 73;
    },
    clearTimeoutImpl(id) {
      assert.equal(id, 73);
      timerActive = false;
    },
    fetchImpl: async (_url, { signal }) => new Response(new ReadableStream({
      start(controller) {
        signal.addEventListener('abort', () => {
          controller.error(new DOMException('PRIVATE_SLOW_BODY', 'AbortError'));
        });
        setTimeout(() => {
          if (!signal.aborted) controller.error(new Error('PRIVATE_LATE_BODY'));
        }, 20);
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });

  await assert.rejects(handler(scheduledRequest()), /^Error: Interview Room health canary failed\.$/);
  assert.equal(store.writes.at(-1).value.failureCode, 'timeout');
  assert.doesNotMatch(JSON.stringify(store.writes), /PRIVATE_SLOW_BODY|PRIVATE_LATE_BODY/);
});

test('scheduled canary times out a signal-ignoring body read and cancels it best-effort', async () => {
  const never = new Promise(() => {});
  let readCalls = 0;
  let cancelCalls = 0;
  const logs = [];
  const store = memoryStore();
  const { handler } = await createCanaryHarness({
    store,
    log: (event) => logs.push(event),
    setTimeoutImpl(callback, milliseconds) {
      assert.equal(milliseconds, 8_000);
      setImmediate(callback);
      return 79;
    },
    clearTimeoutImpl(id) {
      assert.equal(id, 79);
    },
    fetchImpl: async () => ({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: {
        getReader() {
          return {
            read() {
              readCalls += 1;
              return never;
            },
            cancel() {
              cancelCalls += 1;
              return never;
            },
          };
        },
      },
    }),
  });

  const outcome = await Promise.race([
    handler(scheduledRequest()).then(
      () => ({ state: 'resolved' }),
      (error) => ({ state: 'rejected', error }),
    ),
    new Promise((resolve) => {
      setTimeout(() => resolve({ state: 'hung' }), 100);
    }),
  ]);

  assert.equal(outcome.state, 'rejected');
  assert.equal(outcome.error?.message, 'Interview Room health canary failed.');
  assert.doesNotMatch(outcome.error?.message ?? '', /PRIVATE_|https?:|passcode|header/i);
  assert.equal(readCalls, 1);
  assert.equal(cancelCalls, 1);
  assert.deepEqual(store.writes, [{
    key: 'latest',
    value: {
      schemaVersion: 1,
      state: 'failed',
      failureCode: 'timeout',
      checkedAt: CHECKED_AT,
    },
  }]);
  assert.doesNotMatch(
    JSON.stringify({ writes: store.writes, logs }),
    /PRIVATE_|test-only-passcode|x-student-key|prompt|reply/i,
  );
});

test('scheduled canary stops reading an oversized response body and writes a contract failure', async () => {
  const chunk = new TextEncoder().encode('x'.repeat(4_096));
  let bytesPulled = 0;
  const store = memoryStore();
  const { handler } = await createCanaryHarness({
    store,
    fetchImpl: async () => responseFor(null, {
      rawBody: new ReadableStream({
        pull(controller) {
          if (bytesPulled >= 512 * 1_024) {
            controller.close();
            return;
          }
          controller.enqueue(chunk);
          bytesPulled += chunk.byteLength;
        },
      }),
    }),
  });

  await assert.rejects(handler(scheduledRequest()), /^Error: Interview Room health canary failed\.$/);
  assert.equal(store.writes.at(-1).value.failureCode, 'contract');
  assert.equal(bytesPulled <= 72 * 1_024, true);
});

test('public status returns the exact current receipt without requiring a credential', async () => {
  const response = await statusResponse(SUCCESS_RECEIPT, {
    headers: { 'x-student-key': 'wrong-and-unneeded' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(await response.json(), SUCCESS_RECEIPT);
});

test('public status returns non-success for failed, missing, malformed, or unreadable receipts', async () => {
  const cases = [
    {
      receipt: {
        schemaVersion: 1,
        state: 'failed',
        failureCode: 'contract',
        checkedAt: CHECKED_AT,
      },
      wantState: 'failed',
    },
    { receipt: null, wantState: 'missing' },
    { receipt: { ...SUCCESS_RECEIPT, secret: 'must-not-pass' }, wantState: 'malformed' },
    {
      receipt: null,
      store: memoryStore(null, { failGet: true }),
      wantState: 'unavailable',
    },
  ];
  for (const item of cases) {
    const response = await statusResponse(item.receipt, { store: item.store ?? memoryStore(item.receipt) });
    assert.equal(response.status >= 500, true);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.state, item.wantState);
    assert.deepEqual(
      Object.keys(body).every((key) => [
        'schemaVersion',
        'state',
        'failureCode',
        'checkedAt',
      ].includes(key)),
      true,
    );
    assert.doesNotMatch(JSON.stringify(body), /must-not-pass|PRIVATE_BLOB_READ/);
  }
});

test('public status rejects receipts older than eight hours at the exact freshness boundary', async () => {
  const fresh = await statusResponse({
    ...SUCCESS_RECEIPT,
    checkedAt: '2026-07-28T04:05:00.000Z',
    nextRun: '2026-07-28T18:00:00.000Z',
  });
  assert.equal(fresh.status, 200);

  const stale = await statusResponse({
    ...SUCCESS_RECEIPT,
    checkedAt: '2026-07-28T04:04:59.999Z',
    nextRun: '2026-07-28T18:00:00.000Z',
  });
  assert.equal(stale.status >= 500, true);
  assert.equal((await stale.json()).state, 'stale');
});

test('public status detects a missed slot ten minutes after nextRun', async () => {
  const receipt = {
    ...SUCCESS_RECEIPT,
    checkedAt: '2026-07-28T00:00:00.000Z',
    nextRun: '2026-07-28T06:00:00.000Z',
  };
  const withinJitter = await statusResponse(receipt, {
    now: () => '2026-07-28T06:10:00.000Z',
  });
  assert.equal(withinJitter.status, 200);

  const late = await statusResponse(receipt, {
    now: () => '2026-07-28T06:15:00.000Z',
  });
  assert.equal(late.status >= 500, true);
  assert.equal((await late.json()).state, 'late-slot');
});

test('Blob-write loss preserves the stale prior receipt so the missed durable slot stays visible', async () => {
  const prior = {
    ...SUCCESS_RECEIPT,
    checkedAt: '2026-07-28T00:00:00.000Z',
    nextRun: '2026-07-28T06:00:00.000Z',
  };
  const store = memoryStore(prior, { failSet: true });
  const { handler } = await createCanaryHarness({
    store,
    now: () => '2026-07-28T06:00:00.000Z',
  });

  await assert.rejects(handler(scheduledRequest('2026-07-28T12:00:00.000Z')), (error) => {
    assert.equal(error.message, 'Interview Room health canary failed.');
    assert.doesNotMatch(error.message, /PRIVATE_BLOB|receipt_write/i);
    return true;
  });
  assert.deepEqual(store.readLatest(), prior);
  assert.equal(store.writes[0].value.state, 'success');
  assert.equal(store.writes[1].value.failureCode, 'receipt_write');
  assert.doesNotMatch(JSON.stringify(store.writes), /PRIVATE_BLOB_EXCEPTION/);

  const status = await statusResponse(null, {
    store,
    now: () => '2026-07-28T06:15:00.000Z',
  });
  assert.equal(status.status >= 500, true);
  assert.equal((await status.json()).state, 'late-slot');
});

test('public status is GET-only and still returns bounded no-store JSON', async () => {
  const response = await statusResponse(SUCCESS_RECEIPT, { method: 'POST' });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('content-type'), 'application/json');
  assert.deepEqual(await response.json(), {
    schemaVersion: 1,
    state: 'method-not-allowed',
  });
});
