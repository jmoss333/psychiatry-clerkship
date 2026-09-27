import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { createHandler } from '../faculty-console/netlify/functions/red-team-revisions.mjs';

const COMMIT = 'a'.repeat(40);
const DEPLOYS = {
  proxy: ['111111111111111111111111', 'proxy.example.netlify.app', 'proxy-site'],
  ms3: ['222222222222222222222222', 'ms3.example.netlify.app', 'ms3-site'],
  res: ['333333333333333333333333', 'res.example.netlify.app', 'res-site'],
};
const CONFIG = {
  sites: [
    { name: 'ms3', siteId: DEPLOYS.ms3[2], baseUrl: `https://${DEPLOYS.ms3[1]}` },
    { name: 'res', siteId: DEPLOYS.res[2], baseUrl: `https://${DEPLOYS.res[1]}` },
  ],
  spProxy: { siteId: DEPLOYS.proxy[2], baseUrl: `https://${DEPLOYS.proxy[1]}` },
};
const PACK = JSON.stringify({ version: '0.1.0', engine: { modelPinned: 'synthetic-model' } });

function fixtureFetch({ badSite, badPermalink, missingPack } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith('/git/ref/heads/main')) {
      return Response.json({ object: { sha: COMMIT } });
    }
    if (url.includes('/contents/')) {
      const data = url.includes('maintenance_config.json') ? JSON.stringify(CONFIG) : PACK;
      if (missingPack && !url.includes('maintenance_config.json')) return new Response('', { status: 404 });
      return Response.json({ type: 'file', encoding: 'base64', content: Buffer.from(data).toString('base64') });
    }
    const site = Object.entries(DEPLOYS).find(([, fields]) => url.includes(fields[2]) || url.includes(fields[0]));
    if (!site) throw new Error(`Unexpected request: ${url}`);
    const [key, [id, host, siteId]] = site;
    const record = {
      id, site_id: badSite === key ? 'wrong-site' : siteId,
      context: 'production', state: 'ready', commit_ref: COMMIT,
      published_at: '2026-09-27T03:18:29.119Z',
      deploy_ssl_url: `https://main--${host}`,
      ...(badPermalink === key ? { links: { permalink: `https://main--${host}` } } : {}),
    };
    return Response.json(url.includes('/deploys/') ? record : [record]);
  };
  return { fetchImpl, calls };
}

function handler(fetchImpl) {
  const env = { FACULTY_ATTEST_PASSWORD: 'synthetic-faculty-key', GITHUB_TOKEN: 'synthetic-github-token' };
  return createHandler({ fetchImpl, getEnv: key => env[key] || '', now: () => '2026-09-27T03:50:00.000Z' });
}

function request(key = 'synthetic-faculty-key') {
  return new Request('https://faculty.example.netlify.app/api/red-team-revisions', {
    headers: { 'x-faculty-key': key },
  });
}

test('the revision panel endpoint rejects an invalid faculty key before any upstream call', async () => {
  const { fetchImpl, calls } = fixtureFetch();
  const response = await handler(fetchImpl)(request('wrong-key'));
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});

test('the endpoint returns exact production IDs and source hash without treating them as a red-team pass', async () => {
  const { fetchImpl } = fixtureFetch();
  const response = await handler(fetchImpl)(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.state, 'metadata-verified');
  assert.equal(body.pack.sourceCommit, COMMIT);
  assert.equal(body.pack.sha256, createHash('sha256').update(PACK).digest('hex'));
  assert.equal(body.pack.version, '0.1.0');
  assert.equal(body.pack.model, 'synthetic-model');
  for (const [key, [id, host]] of Object.entries(DEPLOYS)) {
    assert.equal(body.deployments[key].deployId, id);
    assert.equal(body.deployments[key].commitRef, COMMIT);
    assert.equal(body.deployments[key].deployUrl, `https://${id}--${host}`);
    assert.equal(body.deployments[key].publishedAt, '2026-09-27T03:18:29.119Z');
  }
  assert.equal(JSON.stringify(body).includes('synthetic-github-token'), false);
  assert.equal('redTeamPassed' in body, false);
});

for (const [name, options] of [
  ['a deploy site mismatch', { badSite: 'res' }],
  ['a moving alias presented as a permalink', { badPermalink: 'proxy' }],
  ['an unavailable pack', { missingPack: true }],
]) {
  test(`${name} makes the entire revision snapshot unverified`, async () => {
    const { fetchImpl } = fixtureFetch(options);
    const response = await handler(fetchImpl)(request());
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.state, 'unverified');
    assert.equal('deployments' in body, false);
    assert.equal('pack' in body, false);
  });
}
