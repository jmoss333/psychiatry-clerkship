import assert from 'node:assert/strict';
import test from 'node:test';
import { installRotationEditionRoute } from './smoke/rotation-edition-fixture.js';

for (const request of [
  { url: 'https://sessions.bugsnag.com/', type: 'fetch', navigation: false },
  { url: 'https://learner.example/', type: 'fetch', navigation: false },
  { url: 'https://learner.example/index.html', type: 'stylesheet', navigation: false },
  { url: 'https://learner.example/other.html', type: 'document', navigation: true },
]) {
  test(`edition fixture leaves unrelated requests untouched: ${request.type} ${request.url}`, async () => {
    let handle, continued = 0;
    await installRotationEditionRoute({ route: async (pattern, handler) => { handle = handler; } });
    await handle({
      request: () => ({ url: () => request.url, resourceType: () => request.type,
        isNavigationRequest: () => request.navigation }),
      continue: async () => { continued += 1; },
      fetch: async () => { throw new Error('must not fetch or parse an unrelated response'); },
      fulfill: async () => { throw new Error('must not replace an unrelated response'); },
    });
    assert.equal(continued, 1);
  });
}
