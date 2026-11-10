import assert from 'node:assert/strict';
import test from 'node:test';

import { createBudgetLedger } from '../netlify/functions/_shared/sp-budget.mjs';

const previousNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'test';
const { getStore } = await import('@netlify/blobs');
if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = previousNodeEnv;

const RATE_CARD = Object.freeze({
  version: 'adapter-regression-v1',
  effectiveDate: '2026-07-14',
  currency: 'USD',
  rates: Object.freeze([
    Object.freeze({
      provider: 'test-provider',
      model: 'test-model',
      meter: 'input_tokens',
      unit: 'million_tokens',
      price: 1,
      sourceUrl: 'https://example.test/input',
    }),
    Object.freeze({
      provider: 'test-provider',
      model: 'test-model',
      meter: 'output_tokens',
      unit: 'million_tokens',
      price: 1,
      sourceUrl: 'https://example.test/output',
    }),
  ]),
});

const REQUEST = Object.freeze({
  kind: 'actor',
  rateKey: Object.freeze({ provider: 'test-provider', model: 'test-model' }),
  maximumUsage: Object.freeze({ inputTokens: 100, outputTokens: 0 }),
});

// These tests drive the ledger through the REAL @netlify/blobs client against a fake HTTP
// endpoint, so they pin what the ledger does with whatever the installed SDK reports. They do
// not pin the SDK's own transport: it retries 403, 429 and 5xx internally (the initial PUT plus
// five retries in 11.1.x, each on a freshly signed URL), and that count is the SDK's business.
//
// What the SDK reports for one conditional write falls into one of three classes:
//   committed — modified: true with a nonempty ETag; the only answer that may advance state
//   failed    — it threw, or it claimed modified: true with no ETag to prove the write
//   conflict  — modified: false; another writer holds the key, so the ledger re-reads and retries
// Which class a status lands in has changed within 11.1.x. Through 11.1.6 a conditional PUT
// answered with any status but 412 came back as { etag: '', modified: true } — an HTTP 401
// reported as a write, refused only by the ledger's nonempty-ETag check. 11.1.7
// (netlify/primitives#820) throws BlobsInternalError for a non-2xx status instead, and answers
// 409 as it answers 412, with { modified: false }. So each row lists the classes its status may
// land in, the test observes the one it did, and the ledger must give that class's answer:
// a failed write is refused at once with budget_unavailable; a conflict goes round the ledger's
// own five-attempt CAS loop and is then refused with budget_contention. No row may commit.
const LEDGER_ANSWER = Object.freeze({
  failed: Object.freeze({ code: 'budget_unavailable', adapterWrites: 1 }),
  conflict: Object.freeze({ code: 'budget_contention', adapterWrites: 5 }),
});

function matrixRow(label, slug, status, classes) {
  return Object.freeze({ label, slug, status, classes: Object.freeze(classes) });
}

// A forced "status" that makes every signed PUT reject instead of answering. The SDK retries it
// and then throws (11.1.6 and 11.1.7 alike), so this row keeps the ledger's catch path under
// test even on an SDK that reports HTTP failures without throwing, as 11.1.6 does.
const NETWORK_ERROR = 'network error';

const FAILURE_MATRIX = Object.freeze([
  matrixRow('network error', 'network', NETWORK_ERROR, ['failed']),
  matrixRow('HTTP 200 without an ETag', '200-no-etag', 200, ['failed']),
  matrixRow('HTTP 401', '401', 401, ['failed']),
  matrixRow('HTTP 403', '403', 403, ['failed']),
  matrixRow('HTTP 409', '409', 409, ['failed', 'conflict']),
  matrixRow('HTTP 429', '429', 429, ['failed']),
  matrixRow('HTTP 500', '500', 500, ['failed']),
  matrixRow('HTTP 412', '412', 412, ['conflict']),
]);

// The ledger's own acceptance rule for an ETag (`nonempty` in sp-budget.mjs): a string, not
// empty, with no surrounding whitespace.
function provesWrite(etag) {
  return typeof etag === 'string' && etag.length > 0 && etag === etag.trim();
}

function classify(outcome) {
  if ('error' in outcome) return 'failed';
  const { result } = outcome;
  if (result?.modified === false) return 'conflict';
  if (result?.modified === true && provesWrite(result.etag)) return 'committed';
  return 'failed';
}

function observedClass(harness, entry) {
  const classes = [...new Set(harness.sdkOutcomes.map(classify))];
  assert.equal(classes.length, 1, `${entry.label}: one kind of SDK answer, saw [${classes}]`);
  const allowed = entry.classes.join(' or ');
  assert.equal(
    entry.classes.includes(classes[0]),
    true,
    `${entry.label}: the SDK answered "${classes[0]}"; this row allows ${allowed}`,
  );
  return classes[0];
}

function assertEveryPutGot(harness, status) {
  assert.equal(harness.signedRequests.every((request) => request.status === status), true);
}

async function rejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return assert.fail('the ledger accepted a write the store never proved');
}

function clone(value) {
  return value === null ? null : JSON.parse(JSON.stringify(value));
}

function makeAdapterHarness({ forcedStatus = null, rotationId = 'adapter-matrix' } = {}) {
  const apiRequests = [];
  const signedRequests = [];
  const sdkOutcomes = [];
  let nextForcedStatus = forcedStatus;
  let serverRecord = null;
  let readableRecord = null;
  let etagSequence = 0;

  const adapter = getStore({
    name: 'budget-regression',
    siteID: 'test-site',
    token: 'test-token',
    apiURL: 'https://api.test',
    fetch: async (url, options) => {
      const requestUrl = String(url);
      if (requestUrl.startsWith('https://api.test/')) {
        apiRequests.push({ url: requestUrl, options });
        return Response.json({ url: `https://signed.test/write/${apiRequests.length}` });
      }
      assert.match(requestUrl, /^https:\/\/signed\.test\/write\/\d+$/);

      let status = nextForcedStatus;
      let etag = '';
      if (status === null) {
        const onlyIfNew = options.headers['if-none-match'] === '*';
        const onlyIfMatch = options.headers['if-match'];
        const conditionFailed = (onlyIfNew && serverRecord !== null)
          || (onlyIfMatch !== undefined && onlyIfMatch !== serverRecord?.etag);
        if (conditionFailed) {
          status = 412;
        } else {
          status = 200;
          etag = `sdk-etag-${++etagSequence}`;
          serverRecord = { value: String(options.body), etag };
        }
      }
      signedRequests.push({ url: requestUrl, options, status });
      if (status === NETWORK_ERROR) throw new TypeError('fetch failed');
      return new Response(null, {
        status,
        headers: etag ? { etag } : undefined,
      });
    },
  });

  const store = {
    async getWithMetadata(_key, options) {
      assert.deepEqual(options, { type: 'json', consistency: 'strong' });
      if (readableRecord === null) return null;
      return {
        data: clone(readableRecord.data),
        etag: readableRecord.etag,
        metadata: null,
      };
    },
    // Every call is recorded, including the ones the SDK answers by throwing.
    async set(...args) {
      let result;
      try {
        result = await adapter.set(...args);
      } catch (error) {
        sdkOutcomes.push({ error });
        throw error;
      }
      sdkOutcomes.push({ result });
      if (classify({ result }) === 'committed') {
        readableRecord = {
          data: JSON.parse(args[1]),
          etag: result.etag,
        };
      }
      return result;
    },
  };

  const ledger = createBudgetLedger({
    store,
    namespace: 'test',
    rotationId,
    capMicros: 20_000_000,
    warningMicros: 16_000_000,
    rateCard: RATE_CARD,
    clock: () => Date.parse('2026-07-14T12:00:00.000Z'),
    randomBytes: (size) => Buffer.alloc(size, 0x5a),
  });

  return {
    ledger,
    apiRequests,
    signedRequests,
    sdkOutcomes,
    readableRecord: () => clone(readableRecord),
    forceStatus(status) {
      nextForcedStatus = status;
    },
    resetObservations() {
      apiRequests.length = 0;
      signedRequests.length = 0;
      sdkOutcomes.length = 0;
    },
  };
}

function operationStatus(harness) {
  const operations = Object.values(harness.readableRecord()?.data.operations ?? {});
  return operations[0]?.attempts.at(-1).status ?? null;
}

// The ledger's write count is its own policy and is pinned exactly. The SDK's HTTP traffic is
// pinned only by its floor (a write is at least one PUT) and its shape: every PUT carries the
// ledger's condition.
function assertConditionalWrites(harness, { adapterWrites, condition }) {
  assert.equal(harness.sdkOutcomes.length, adapterWrites);
  assert.equal(harness.signedRequests.length >= adapterWrites, true);
  assert.equal(harness.signedRequests.every((request) => (
    request.options.headers[condition.name] === condition.value
  )), true);
}

test('Netlify Blobs reserve matrix fails closed except for HTTP 200 with an ETag', async (t) => {
  for (const entry of FAILURE_MATRIX) {
    await t.test(entry.label, async () => {
      const harness = makeAdapterHarness({
        forcedStatus: entry.status,
        rotationId: `reserve-${entry.slug}`,
      });

      const error = await rejection(
        harness.ledger.reserve({ ...REQUEST, idempotencyKey: `reserve-${entry.slug}` }),
      );
      const answer = LEDGER_ANSWER[observedClass(harness, entry)];
      assert.equal(error?.status, 503);
      assert.equal(error?.code, answer.code);
      assert.equal(harness.readableRecord(), null);
      assertConditionalWrites(harness, {
        adapterWrites: answer.adapterWrites,
        condition: { name: 'if-none-match', value: '*' },
      });
      assertEveryPutGot(harness, entry.status);
    });
  }

  await t.test('HTTP 200 with nonempty ETag', async () => {
    const harness = makeAdapterHarness({ rotationId: 'reserve-200' });
    const reservation = await harness.ledger.reserve({
      ...REQUEST,
      idempotencyKey: 'reserve-200',
    });

    assert.equal(Object.isFrozen(reservation), true);
    assert.equal(operationStatus(harness), 'reserved');
    assertConditionalWrites(harness, {
      adapterWrites: 1,
      condition: { name: 'if-none-match', value: '*' },
    });
    assert.equal(classify(harness.sdkOutcomes[0]), 'committed');
    assert.match(harness.sdkOutcomes[0].result.etag, /^sdk-etag-\d+$/);
  });
});

test('Netlify Blobs provider-start matrix never authorizes a failed or lost CAS', async (t) => {
  for (const entry of FAILURE_MATRIX) {
    await t.test(entry.label, async () => {
      const harness = makeAdapterHarness({ rotationId: `mark-${entry.slug}` });
      const reservation = await harness.ledger.reserve({
        ...REQUEST,
        idempotencyKey: `mark-${entry.slug}`,
      });
      const reservationEtag = harness.readableRecord().etag;
      harness.resetObservations();
      harness.forceStatus(entry.status);

      const error = await rejection(harness.ledger.markProviderStarted(reservation));
      const answer = LEDGER_ANSWER[observedClass(harness, entry)];
      assert.equal(error?.status, 503);
      assert.equal(error?.code, answer.code);
      assert.equal(operationStatus(harness), 'reserved');
      assertConditionalWrites(harness, {
        adapterWrites: answer.adapterWrites,
        condition: { name: 'if-match', value: reservationEtag },
      });
      assertEveryPutGot(harness, entry.status);
    });
  }
});

test('only one ETag-bearing HTTP 200 provider-start CAS authorizes the provider', async () => {
  const harness = makeAdapterHarness({ rotationId: 'mark-200-race' });
  const reservation = await harness.ledger.reserve({
    ...REQUEST,
    idempotencyKey: 'mark-200-race',
  });
  const reservationEtag = harness.readableRecord().etag;
  harness.resetObservations();

  const results = await Promise.all([
    harness.ledger.markProviderStarted(reservation),
    harness.ledger.markProviderStarted(reservation),
  ]);

  assert.equal(results.filter((result) => result.authorized === true).length, 1);
  assert.equal(results.filter((result) => result.authorized === false).length, 1);
  assert.equal(results.find((result) => result.authorized === true).modified, true);
  assert.equal(results.find((result) => result.authorized === false).modified, false);
  assert.equal(operationStatus(harness), 'provider_started');
  assertConditionalWrites(harness, {
    adapterWrites: 2,
    condition: { name: 'if-match', value: reservationEtag },
  });
  assert.deepEqual(harness.sdkOutcomes.map(classify).sort(), ['committed', 'conflict']);
  assert.match(
    harness.sdkOutcomes.find((outcome) => classify(outcome) === 'committed').result.etag,
    /^sdk-etag-\d+$/,
  );
  assert.deepEqual(harness.signedRequests.map((request) => request.status).sort(), [200, 412]);
});
