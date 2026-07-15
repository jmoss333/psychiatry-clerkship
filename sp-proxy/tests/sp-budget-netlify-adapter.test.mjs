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

function makeAdapterHarness(status) {
  const signedRequests = [];
  const adapter = getStore({
    name: 'budget-regression',
    siteID: 'test-site',
    token: 'test-token',
    apiURL: 'https://api.test',
    fetch: async (url, options) => {
      if (String(url).startsWith('https://api.test/')) {
        return Response.json({ url: 'https://signed.test/write' });
      }
      signedRequests.push({ url: String(url), options });
      return new Response(null, { status });
    },
  });
  const observedResults = [];
  const ledger = createBudgetLedger({
    store: {
      getWithMetadata: async () => null,
      set: async (...args) => {
        const result = await adapter.set(...args);
        observedResults.push(result);
        return result;
      },
    },
    namespace: 'test',
    rotationId: `status-${status}`,
    capMicros: 20_000_000,
    warningMicros: 16_000_000,
    rateCard: RATE_CARD,
    clock: () => Date.parse('2026-07-14T12:00:00.000Z'),
    randomBytes: (size) => Buffer.alloc(size, status % 256),
  });
  return { ledger, observedResults, signedRequests };
}

test('Netlify Blobs 10.7.9 ambiguous conditional HTTP failures fail the ledger closed', async (t) => {
  for (const [status, expectedAttempts] of [[500, 6], [429, 6], [400, 1]]) {
    await t.test(`HTTP ${status}`, async () => {
      const { ledger, observedResults, signedRequests } = makeAdapterHarness(status);

      await assert.rejects(
        ledger.reserve({
          idempotencyKey: `adapter-status-${status}`,
          kind: 'actor',
          rateKey: { provider: 'test-provider', model: 'test-model' },
          maximumUsage: { inputTokens: 100, outputTokens: 0 },
        }),
        (error) => {
          assert.equal(error?.status, 503);
          assert.equal(error?.code, 'budget_unavailable');
          return true;
        },
      );
      assert.deepEqual(observedResults, [{ etag: '', modified: true }]);
      assert.equal(signedRequests.length, expectedAttempts);
      assert.equal(signedRequests.every((request) => request.options.headers['if-none-match'] === '*'), true);
    });
  }
});
