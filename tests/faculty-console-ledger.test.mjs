// The faculty console in LEDGER MODE (ATTEST_LEDGER=on, ADR-003). A sign-off must become one
// signed line appended to ledger/events.jsonl on the `attestations` branch — never a write to
// main, never a PR — bound to the page text ON MAIN, and read back through the same overlay
// the learner-site build applies. Everything the build would refuse, the console refuses first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';

import { createHandler } from '../faculty-console/netlify/functions/attest.mjs';
import { itemRevision } from '../faculty-console/netlify/functions/qbank-actions.mjs';
import { loadSigner, questionItemHash, verifyLedger } from '../faculty-console/ledger.mjs';

const API_URL = 'https://faculty.example/api/attest';
const API_ORIGIN = new URL(API_URL).origin;
const FACULTY_KEY = 'synthetic-faculty-key';
const MAIN_HEAD = '6'.repeat(40);
const MANIFEST_SHA = 'b'.repeat(40);
const LEDGER_PATH = 'ledger/events.jsonl';
const HOOKS = 'ms3=https://api.netlify.com/build_hooks/m,res=https://api.netlify.com/build_hooks/r';

function blobShaOf(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8');
  return createHash('sha1').update(Buffer.from(`blob ${buffer.length}\0`, 'utf8')).update(buffer).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// Re-derived here, not imported, for the reason the main handler test gives: an expectation
// computed by the function under test passes for any self-consistent rule, including a wrong one.
function expectedDigest(files, sources, slug) {
  const page = files['13_Faculty_Resources/_automation/site_build/shipped_pages.json'].pages.find(entry => entry.slug === slug);
  const lines = [page.source, ...(page.extraSources || [])].sort().map(source => `${source} ${blobShaOf(sources[source])}`);
  const record = files['topic_meta.json'][slug];
  if (record && typeof record === 'object') {
    const body = { ...record };
    delete body.facultyReview;
    lines.push(`topic_meta ${blobShaOf(canonicalJson(body))}`);
  }
  return blobShaOf(`${lines.join('\n')}\n`);
}

const stem = 'A fictional inpatient reports persistent sadness, anhedonia, and guilt. What diagnosis best explains this syndrome?';
function validItem(id = 'qb_moo_900') {
  const options = [
    { key: 'A', t: 'Major depressive disorder' }, { key: 'B', t: 'Delirium' },
    { key: 'C', t: 'Mania' }, { key: 'D', t: 'Adjustment disorder' },
  ].map(option => option.key === 'A' ? { ...option, c: true }
    : { ...option, trap: { name: `${option.key} discriminator`, note: `${option.t} does not match the defining fictional pattern.` } });
  return {
    id, status: 'draft', type: 'sba', category: 'mood', competency: ['dx'], difficulty: 2, hy: true,
    pages: ['t_mood.md'], link: { label: 'Open Mood Disorders', href: '?page=t_mood.md' }, stem, options,
    why: 'The sustained fictional syndrome supports the keyed diagnosis.',
    pearl: 'Name the syndrome before choosing an answer.',
    evidence: 't_mood.md — fictional syndrome discriminator.',
  };
}

function newSigner() {
  const { privateKey } = generateKeyPairSync('ed25519');
  const secret = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  return { secret, signer: loadSigner(secret) };
}

function keysFor(signer) {
  return { version: 1, keys: [{ keyId: signer.keyId, algorithm: 'ed25519',
    publicKeyPem: signer.publicKey.export({ type: 'spki', format: 'pem' }), addedAt: '2026-09-25', revokedAt: null }] };
}

function fixture(signer, { toolMarker = null, pageBanner = false } = {}) {
  const sources = {
    '01_Core/t_mood.md': Buffer.from(`${pageBanner ? '> AI-drafted — pending faculty review\n\n' : ''}# Mood Disorders\n\nSynthetic page source.\n`),
    '04_Assessment/mse.html': Buffer.from(`<!doctype html>\n${toolMarker ? `<!-- [CLERKSHIP-META v1] tool="MSE" status="${toolMarker}" -->\n` : ''}<title>MSE</title>\n`),
  };
  const files = {
    '13_Faculty_Resources/reviewed.json': {
      't_mood.md': { status: 'pending', at: '2026-09-20', by: 'Pending faculty review',
        risk: { kind: 'clinical', level: 'high' }, reason: 'New page.' },
      'mse-tool': { status: 'reviewed', at: '2026-09-21', by: 'Joshua Moss, MD',
        risk: { kind: 'general', level: 'low' }, contentHash: 'd'.repeat(40) },
    },
    '13_Faculty_Resources/_automation/site_build/site_manifest.json': {
      md: [['01_Core/t_mood.md', 't_mood.md', 'Mood Disorders']],
      tools: [['04_Assessment/mse.html', 'mse-tool', 'Mental Status Examination']],
    },
    '13_Faculty_Resources/_automation/site_build/shipped_pages.json': {
      version: 1, generated_from: {},
      pages: [
        { slug: 't_mood.md', kind: 'page', sites: ['ms3', 'res'], title: 'Mood Disorders', source: '01_Core/t_mood.md', producer: 'site_manifest' },
        { slug: 'mse-tool', kind: 'tool', sites: ['ms3', 'res'], title: 'MSE', source: '04_Assessment/mse.html', producer: 'site_manifest' },
      ],
    },
    'topic_meta.json': { 't_mood.md': { title: 'Mood Disorders', facultyReview: { status: 'pending' } } },
    'question_bank.json': { _note: 'fixture', version: 1, items: [validItem()] },
    '13_Faculty_Resources/ledger/keys.json': keysFor(signer),
  };
  return { files, sources };
}

function b64json(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function githubMock({ files, sources }, { ledgerText = null, receipts = {}, onPut } = {}) {
  const state = { ledger: ledgerText, ledgerSha: ledgerText === null ? null : blobShaOf(ledgerText), puts: [], hooks: [], calls: [] };
  const fileBytes = (path) => {
    if (Object.hasOwn(sources, path)) return sources[path];
    if (Object.hasOwn(files, path)) return b64json(files[path]);
    return null;
  };
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = (init.method || 'GET').toUpperCase();
    state.calls.push(`${method} ${url.href}`);
    const json = (status, value) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.hostname === 'api.netlify.com') {
      state.hooks.push(url.href);
      return new Response('', { status: 200 });
    }
    if (url.hostname !== 'api.github.com') {
      const receipt = receipts[url.origin];
      return receipt ? json(200, receipt) : new Response('nope', { status: 404 });
    }
    const pathname = decodeURIComponent(url.pathname);
    if (method === 'GET' && pathname.endsWith('/git/ref/heads/main')) {
      return json(200, { object: { type: 'commit', sha: MAIN_HEAD } });
    }
    if (method === 'GET' && pathname.includes('/git/trees/')) {
      const tree = Object.keys(sources).map(path => ({ path, type: 'blob', mode: '100644', sha: blobShaOf(sources[path]) }));
      for (const path of Object.keys(files)) tree.push({ path, type: 'blob', mode: '100644', sha: blobShaOf(b64json(files[path])) });
      return json(200, { sha: 'tree', truncated: false, tree });
    }
    const marker = '/contents/';
    const path = pathname.slice(pathname.indexOf(marker) + marker.length);
    const ref = url.searchParams.get('ref');
    if (method === 'GET') {
      if (path === LEDGER_PATH) {
        assert.equal(ref, 'attestations', 'the ledger is read from the attestations branch');
        if (state.ledger === null) return json(404, { message: 'Not Found' });
        const bytes = Buffer.from(state.ledger, 'utf8');
        return json(200, { sha: state.ledgerSha, size: bytes.length, encoding: 'base64', content: bytes.toString('base64') });
      }
      assert.ok(ref === 'main' || ref === MAIN_HEAD, `content is read from main, not ${ref}`);
      const bytes = fileBytes(path);
      if (!bytes) return json(404, { message: 'Not Found' });
      return json(200, { sha: blobShaOf(bytes), size: bytes.length, encoding: 'base64', content: bytes.toString('base64') });
    }
    if (method === 'PUT') {
      const body = JSON.parse(init.body);
      state.puts.push({ path, body });
      const intercepted = await onPut?.(state, body);
      if (intercepted) return intercepted;
      assert.equal(path, LEDGER_PATH, 'ledger mode writes nothing but the ledger');
      assert.equal(body.branch, 'attestations');
      if ((body.sha || null) !== state.ledgerSha) return json(409, { message: 'sha mismatch' });
      state.ledger = Buffer.from(body.content, 'base64').toString('utf8');
      state.ledgerSha = blobShaOf(state.ledger);
      return json(200, { content: { sha: state.ledgerSha }, commit: { html_url: `https://github.com/o/r/commit/${state.ledgerSha}` } });
    }
    return json(404, { message: `unmocked ${method} ${url.href}` });
  };
  return { fetchImpl, state };
}

function env(secret, extra = {}) {
  return {
    FACULTY_ATTEST_PASSWORD: FACULTY_KEY, GITHUB_TOKEN: 'synthetic-token', GITHUB_REPO: 'o/r',
    ATTEST_LEDGER: 'on', LEDGER_SIGNING_KEY: secret, LEDGER_BUILD_HOOKS: HOOKS,
    STUDENT_SITE_URL: 'https://ms3.example', RESIDENT_SITE_URL: 'https://res.example',
    ATTESTER_NAME: 'Joshua Moss, MD',
    ...extra,
  };
}

async function call(mock, envValues, method, body) {
  const handler = createHandler({ env: envValues, fetchImpl: mock.fetchImpl, treeCache: null });
  const response = await handler(new Request(API_URL, {
    method,
    headers: { 'x-faculty-key': FACULTY_KEY, Origin: API_ORIGIN, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  return { status: response.status, payload: await response.json() };
}

test('a page sign-off is one signed line on the attestations branch, bound to the text on main', async () => {
  const { secret, signer } = newSigner();
  const fx = fixture(signer);
  const mock = githubMock(fx);
  const { status, payload } = await call(mock, env(secret), 'POST', { target: 'content', changes: { 't_mood.md': true } });
  assert.equal(status, 200, JSON.stringify(payload));
  assert.equal(payload.updated, 1);
  assert.equal(payload.ledger.seq, 1);
  assert.equal(payload.pullRequest, undefined, 'there is no rolling PR in ledger mode');
  assert.equal(mock.state.puts.length, 1);

  const { events } = verifyLedger(mock.state.ledger, keysFor(signer));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'attest');
  assert.equal(events[0].id, 't_mood.md');
  assert.equal(events[0].by, 'Joshua Moss, MD');
  assert.equal(events[0].base, MAIN_HEAD);
  assert.equal(events[0].contentHash, expectedDigest(fx.files, fx.sources, 't_mood.md'));
});

test('the queue reads back through the overlay: a signed page is reviewed and current', async () => {
  const { secret, signer } = newSigner();
  const mock = githubMock(fixture(signer));
  await call(mock, env(secret), 'POST', { target: 'content', changes: { 't_mood.md': true } });
  const { status, payload } = await call(mock, env(secret), 'GET');
  assert.equal(status, 200, JSON.stringify(payload));
  const item = payload.items.find(entry => entry.slug === 't_mood.md');
  assert.equal(item.status, 'reviewed');
  assert.equal(item.by, 'Joshua Moss, MD');
  assert.equal(item.stale, undefined);
  assert.equal(payload.ledger.mode, 'on');
  assert.equal(payload.ledger.head.seq, 1);
  assert.deepEqual(payload.ledger.published, { ms3: null, res: null });

  const again = await call(mock, env(secret), 'POST', { target: 'content', changes: { 't_mood.md': true } });
  assert.equal(again.payload.updated, 0, 'a bound sign-off is a no-op');
  assert.equal(mock.state.puts.length, 1);
});

test('a reopen is a signed line with its reason, and the queue shows the page unreviewed', async () => {
  const { secret, signer } = newSigner();
  const mock = githubMock(fixture(signer));
  await call(mock, env(secret), 'POST', { target: 'content', changes: { 't_mood.md': true } });
  const reopened = await call(mock, env(secret), 'POST',
    { target: 'content', changes: { 't_mood.md': false }, reasons: { 't_mood.md': 'Check the new mixed-features wording.' } });
  assert.equal(reopened.status, 200, JSON.stringify(reopened.payload));
  const { events } = verifyLedger(mock.state.ledger, keysFor(signer));
  assert.equal(events[1].type, 'reopen');
  assert.equal(events[1].reason, 'Check the new mixed-features wording.');
  const { payload } = await call(mock, env(secret), 'GET');
  assert.equal(payload.items.find(entry => entry.slug === 't_mood.md').status, 'unreviewed');
});

test('a page whose source still announces itself unreviewed is refused before anything is written', async () => {
  const { secret, signer } = newSigner();
  const mock = githubMock(fixture(signer, { pageBanner: true }));
  const { status, payload } = await call(mock, env(secret), 'POST', { target: 'content', changes: { 't_mood.md': true } });
  assert.equal(status, 400);
  assert.equal(payload.error.code, 'content.pending_banner');
  assert.equal(mock.state.puts.length, 0);
});

test('a tool whose source marker disagrees with the requested state is refused (validator parity)', async () => {
  const { secret, signer } = newSigner();
  let mock = githubMock(fixture(signer, { toolMarker: 'reviewed' }));
  let result = await call(mock, env(secret), 'POST',
    { target: 'content', changes: { 'mse-tool': false }, reasons: { 'mse-tool': 'Recheck.' } });
  assert.equal(result.status, 409, JSON.stringify(result.payload));
  assert.equal(result.payload.error.code, 'content.marker_conflict');
  mock = githubMock(fixture(signer, { toolMarker: 'draft-pending-attestation' }));
  result = await call(mock, env(secret), 'POST', { target: 'content', changes: { 'mse-tool': true } });
  assert.equal(result.status, 409);
  assert.equal(mock.state.puts.length, 0);
  // A marker that agrees is no obstacle.
  mock = githubMock(fixture(signer, { toolMarker: 'reviewed' }));
  result = await call(mock, env(secret), 'POST', { target: 'content', changes: { 'mse-tool': true } });
  assert.equal(result.status, 200, JSON.stringify(result.payload));
});

test('a console whose key is not published in keys.json refuses to sign', async () => {
  const { secret, signer } = newSigner();
  const fx = fixture(signer);
  fx.files['13_Faculty_Resources/ledger/keys.json'] = { version: 1, keys: [] };
  const mock = githubMock(fx);
  const { status, payload } = await call(mock, env(secret), 'POST', { target: 'content', changes: { 't_mood.md': true } });
  assert.equal(status, 503);
  assert.equal(payload.error.code, 'ledger_unavailable');
  assert.match(payload.error.message, /ACTIVATION\.md/);
  assert.equal(mock.state.puts.length, 0);
});

test('a tampered ledger stops the console: no queue, no sign-off on top of it', async () => {
  const { secret, signer } = newSigner();
  const mock = githubMock(fixture(signer));
  await call(mock, env(secret), 'POST', { target: 'content', changes: { 't_mood.md': true } });
  mock.state.ledger = mock.state.ledger.replace('"t_mood.md"', '"ddx.md"');
  mock.state.ledgerSha = blobShaOf(mock.state.ledger);
  const read = await call(mock, env(secret), 'GET');
  assert.equal(read.status, 502);
  assert.equal(read.payload.error.code, 'ledger_invalid');
  const write = await call(mock, env(secret), 'POST', { target: 'content', changes: { 't_mood.md': true } });
  assert.equal(write.status, 502);
  assert.equal(mock.state.puts.length, 1, 'only the original sign-off was ever written');
});

test('a concurrent append is retried on top of the new head, and both lines survive', async () => {
  const { secret, signer } = newSigner();
  const mock = githubMock(fixture(signer), {
    onPut: async (state) => {
      if (state.puts.length !== 1) return null;
      // Another console tab signed mse-tool between our read and our write.
      const other = githubMock(fixture(signer));
      await call(other, env(secret), 'POST', { target: 'content', changes: { 'mse-tool': true } });
      state.ledger = other.state.ledger;
      state.ledgerSha = other.state.ledgerSha;
      return new Response(JSON.stringify({ message: 'conflict' }), { status: 409 });
    },
  });
  const { status, payload } = await call(mock, env(secret), 'POST', { target: 'content', changes: { 't_mood.md': true } });
  assert.equal(status, 200, JSON.stringify(payload));
  const { events } = verifyLedger(mock.state.ledger, keysFor(signer));
  assert.deepEqual(events.map(event => event.id), ['mse-tool', 't_mood.md']);
});

test('a question sign-off is a question line bound to its text; draft editing is off in ledger mode', async () => {
  const { secret, signer } = newSigner();
  const fx = fixture(signer);
  const mock = githubMock(fx);
  const item = fx.files['question_bank.json'].items[0];
  const revision = itemRevision(item);
  const signed = await call(mock, env(secret), 'POST', {
    action: 'qbank.attest', manifestRevision: blobShaOf(b64json(fx.files['13_Faculty_Resources/_automation/site_build/site_manifest.json'])),
    items: [{ id: item.id, revision, reviewedRevision: revision }],
    confirmations: { clinical: true, evidence: true, originalityAndNoPhi: true },
  });
  assert.equal(signed.status, 200, JSON.stringify(signed.payload));
  const { events } = verifyLedger(mock.state.ledger, keysFor(signer));
  assert.equal(events[0].kind, 'question');
  assert.equal(events[0].itemHash, questionItemHash(item));
  const { payload } = await call(mock, env(secret), 'GET');
  assert.equal(payload.qbank.find(entry => entry.id === item.id).status, 'attested');

  const draft = await call(mock, env(secret), 'POST', { action: 'qbank.save-draft', id: item.id, baseRevision: revision, item });
  assert.equal(draft.status, 409);
  assert.equal(draft.payload.error.code, 'ledger.drafts_disabled');
});

test('Publish now fires both build hooks for sites that are behind', async () => {
  const { secret, signer } = newSigner();
  const mock = githubMock(fixture(signer), {
    receipts: { 'https://ms3.example': { schemaVersion: 1, status: 'applied', seq: 0 },
      'https://res.example': { schemaVersion: 1, status: 'applied', seq: 0 } },
  });
  await call(mock, env(secret), 'POST', { target: 'content', changes: { 't_mood.md': true } });
  const { status, payload } = await call(mock, env(secret), 'POST', { action: 'ledger.publish' });
  assert.equal(status, 200, JSON.stringify(payload));
  assert.equal(payload.publish.sites.ms3.trigger, true);
  assert.equal(mock.state.hooks.length, 2);
});

test('ledger mode without a usable signing key refuses to start', async () => {
  const { signer } = newSigner();
  const mock = githubMock(fixture(signer));
  for (const secret of ['', 'not-a-key']) {
    const { status, payload } = await call(mock, env(secret), 'GET');
    assert.equal(status, 500);
    assert.equal(payload.error.code, 'server_configuration');
  }
});

/* One press, many pages (2026-09-26) in ledger mode: the same baseline, written as one append
   of one signed line per page, then the ready questions as a second append. topic_meta is not
   written: the build's overlay already makes each page's facultyReview follow its signed line. */

const BASELINE_STATEMENT = 'I have reviewed this content and attest to it as it reads today: it is '
  + 'clinically accurate, supported by its cited evidence, original, and free of protected health '
  + 'information.';

test('a ledger baseline is one append of one signed line per page, and ready questions ride along', async () => {
  const { secret, signer } = newSigner();
  const fx = fixture(signer);
  const mock = githubMock(fx);
  const { status, payload } = await call(mock, env(secret), 'POST',
    { target: 'content', mode: 'baseline', statement: BASELINE_STATEMENT });
  assert.equal(status, 200, JSON.stringify(payload));
  assert.equal(payload.updated, 2);
  assert.deepEqual(payload.signed.map(item => [item.slug, item.was]).sort(), [['mse-tool', 'drifted'], ['t_mood.md', 'pending']]);
  assert.equal(payload.ledger.seq, 2);
  assert.equal(payload.questions.updated, 1);
  assert.equal(payload.facultyReview, undefined, 'ledger mode writes nothing but the ledger');
  assert.equal(mock.state.puts.length, 2, 'the pages in one append, the questions in a second');
  assert.match(mock.state.puts[0].body.message, /^ledger #1–2: baseline sign-off, 2 content item\(s\) by Joshua Moss, MD$/);

  const { events } = verifyLedger(mock.state.ledger, keysFor(signer));
  assert.deepEqual(events.map(event => [event.kind, event.id]), [
    ['content', 't_mood.md'], ['content', 'mse-tool'], ['question', 'qb_moo_900'],
  ]);
  for (const event of events.slice(0, 2)) {
    assert.equal(event.contentHash, expectedDigest(fx.files, fx.sources, event.id));
    assert.equal(event.by, 'Joshua Moss, MD');
    assert.equal(event.base, MAIN_HEAD);
  }
  // Read back through the overlay: everything is reviewed and current.
  const read = await call(mock, env(secret), 'GET');
  assert.deepEqual(read.payload.items.map(item => [item.slug, item.status, item.stale]), [
    ['t_mood.md', 'reviewed', undefined], ['mse-tool', 'reviewed', undefined],
  ]);
});

test('a ledger baseline leaves out a page whose source says it is unreviewed, and signs the rest', async () => {
  const { secret, signer } = newSigner();
  const mock = githubMock(fixture(signer, { pageBanner: true }));
  const { status, payload } = await call(mock, env(secret), 'POST',
    { target: 'content', mode: 'baseline', statement: BASELINE_STATEMENT, questions: false });
  assert.equal(status, 200, JSON.stringify(payload));
  assert.deepEqual(payload.signed.map(item => item.slug), ['mse-tool']);
  assert.deepEqual(payload.excluded.map(item => item.slug), ['t_mood.md']);
  assert.match(payload.excluded[0].reason, /first lines still say it is unreviewed/);
  const { events } = verifyLedger(mock.state.ledger, keysFor(signer));
  assert.deepEqual(events.map(event => event.id), ['mse-tool']);
});
