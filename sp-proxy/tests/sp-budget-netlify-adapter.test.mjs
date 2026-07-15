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

const FAILURE_MATRIX = Object.freeze([
  Object.freeze({ status: 401, code: 'budget_unavailable', adapterWrites: 1, httpAttempts: 1 }),
  Object.freeze({ status: 403, code: 'budget_unavailable', adapterWrites: 1, httpAttempts: 1 }),
  // The pinned SDK performs the initial request plus its five retries for 429 and 5xx.
  Object.freeze({ status: 429, code: 'budget_unavailable', adapterWrites: 1, httpAttempts: 6 }),
  Object.freeze({ status: 500, code: 'budget_unavailable', adapterWrites: 1, httpAttempts: 6 }),
  Object.freeze({ status: 412, code: 'budget_contention', adapterWrites: 5, httpAttempts: 5 }),
]);

function clone(value) {
  return value === null ? null : JSON.parse(JSON.stringify(value));
}

function makeAdapterHarness({ forcedStatus = null, rotationId = 'adapter-matrix' } = {}) {
  const apiRequests = [];
  const signedRequests = [];
  const observedResults = [];
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
    async set(...args) {
      const result = await adapter.set(...args);
      observedResults.push(result);
      if (
        result.modified === true
        && typeof result.etag === 'string'
        && result.etag.trim().length > 0
      ) {
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
    observedResults,
    readableRecord: () => clone(readableRecord),
    forceStatus(status) {
      nextForcedStatus = status;
    },
    resetObservations() {
      apiRequests.length = 0;
      signedRequests.length = 0;
      observedResults.length = 0;
    },
  };
}

function operationStatus(harness) {
  const operations = Object.values(harness.readableRecord()?.data.operations ?? {});
  return operations[0]?.attempts.at(-1).status ?? null;
}

function assertConditionalRequests(harness, {
  adapterWrites,
  httpAttempts,
  condition,
}) {
  assert.equal(harness.apiRequests.length, adapterWrites);
  assert.equal(harness.observedResults.length, adapterWrites);
  assert.equal(harness.signedRequests.length, httpAttempts);
  assert.equal(harness.signedRequests.every((request) => (
    request.options.headers[condition.name] === condition.value
  )), true);
}

test('Netlify Blobs 10.7.9 reserve matrix fails closed except for HTTP 200 with an ETag', async (t) => {
  for (const entry of FAILURE_MATRIX) {
    await t.test(`HTTP ${entry.status}`, async () => {
      const harness = makeAdapterHarness({
        forcedStatus: entry.status,
        rotationId: `reserve-${entry.status}`,
      });

      await assert.rejects(
        harness.ledger.reserve({ ...REQUEST, idempotencyKey: `reserve-${entry.status}` }),
        (error) => {
          assert.equal(error?.status, 503);
          assert.equal(error?.code, entry.code);
          return true;
        },
      );
      assert.equal(harness.readableRecord(), null);
      assertConditionalRequests(harness, {
        ...entry,
        condition: { name: 'if-none-match', value: '*' },
      });
      if (entry.status === 412) {
        assert.equal(harness.observedResults.every((result) => result.modified === false), true);
      } else {
        assert.deepEqual(harness.observedResults, [{ etag: '', modified: true }]);
      }
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
    assertConditionalRequests(harness, {
      adapterWrites: 1,
      httpAttempts: 1,
      condition: { name: 'if-none-match', value: '*' },
    });
    assert.equal(harness.observedResults[0].modified, true);
    assert.match(harness.observedResults[0].etag, /^sdk-etag-\d+$/);
  });
});

test('Netlify Blobs 10.7.9 provider-start matrix never authorizes HTTP failures or 412', async (t) => {
  for (const entry of FAILURE_MATRIX) {
    await t.test(`HTTP ${entry.status}`, async () => {
      const harness = makeAdapterHarness({ rotationId: `mark-${entry.status}` });
      const reservation = await harness.ledger.reserve({
        ...REQUEST,
        idempotencyKey: `mark-${entry.status}`,
      });
      const reservationEtag = harness.readableRecord().etag;
      harness.resetObservations();
      harness.forceStatus(entry.status);

      await assert.rejects(
        harness.ledger.markProviderStarted(reservation),
        (error) => {
          assert.equal(error?.status, 503);
          assert.equal(error?.code, entry.code);
          return true;
        },
      );
      assert.equal(operationStatus(harness), 'reserved');
      assertConditionalRequests(harness, {
        ...entry,
        condition: { name: 'if-match', value: reservationEtag },
      });
      assert.equal(harness.observedResults.some((result) => (
        result.modified === true
        && typeof result.etag === 'string'
        && result.etag.length > 0
      )), false);
      assert.equal(harness.signedRequests.every((request) => request.status === entry.status), true);
      if (entry.status === 412) {
        assert.equal(harness.observedResults.every((result) => result.modified === false), true);
      } else {
        assert.deepEqual(harness.observedResults, [{ etag: '', modified: true }]);
      }
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
  assertConditionalRequests(harness, {
    adapterWrites: 2,
    httpAttempts: 2,
    condition: { name: 'if-match', value: reservationEtag },
  });
  assert.equal(harness.observedResults.filter((result) => (
    result.modified === true && /^sdk-etag-\d+$/.test(result.etag)
  )).length, 1);
  assert.equal(harness.observedResults.filter((result) => result.modified === false).length, 1);
  assert.deepEqual(harness.signedRequests.map((request) => request.status).sort(), [200, 412]);
});
