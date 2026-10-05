/* Review bank contents (2026-10-05). Josh signed five bank-bearing tools whose signature hash
   covers whole bank files (437 deck cards, 16 COMM, 8 FAM, 4 + 5 REASON cases) through a review
   surface that never displayed those banks. These tests pin the three halves of the fix:

     (a) the console's bank view renders EVERY unit of the bytes the hash covers — the rendered
         card / option / feedback / case / choice counts equal counts taken independently from
         the same files, every string in those files appears in the rendering, and the file list
         is the hash's own path list (the Python original included), not a parallel list;
     (b) a bank-bearing item cannot be signed until every section has been opened, and the
         server refuses a signature without the bank view's receipt or over a changed bank;
     (c) the one-press baseline never carries a bank-bearing item.

   The GitHub mock serves the REAL repository files (registration data and the banks — content,
   not governance state) and a SYNTHETIC reviewed.json, so nothing here reads or asserts a live
   ledger count (CLAUDE.md: "A test may not depend on live governance state"). */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  bankProgress, bankProgressText, describeBankFile, renderBankFile,
} from '../faculty-console/bank-review.mjs';
import { createHandler } from '../faculty-console/netlify/functions/attest.mjs';
import { deriveAttestationEligibility, normalizeReviewItems } from '../faculty-console/review-model.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_URL = 'https://faculty.example/api/attest';
const FACULTY_KEY = 'synthetic-faculty-key';
const HEAD = '6'.repeat(40);
const REVIEWED_PATH = '13_Faculty_Resources/reviewed.json';
const SHIPPED_PAGES_PATH = '13_Faculty_Resources/_automation/site_build/shipped_pages.json';
const MANIFEST_PATH = '13_Faculty_Resources/_automation/site_build/site_manifest.json';
const REGISTRY_FILES = [SHIPPED_PAGES_PATH, MANIFEST_PATH, 'topic_meta.json', 'question_bank.json'];
const BANK_TOOLS = [
  'review.html', 'rp-canon-quiz.html', 'communication-practice.html',
  'family-systems.html', 'diagnostic-reasoning.html',
];
const RISK = { kind: 'clinical', level: 'moderate' };

const shipped = JSON.parse(readFileSync(path.join(repoRoot, SHIPPED_PAGES_PATH), 'utf8'));

/* Independent of the console: the paths a slug's hash covers beyond its own source, read
   straight off shipped_pages.json (source first, then extraSources, deduplicated). */
function independentBankFiles(slug) {
  const entries = shipped.pages.filter(page => page.slug === slug);
  const primary = new Set(entries.map(page => page.source));
  const out = [];
  for (const page of entries) {
    for (const extra of page.extraSources || []) {
      if (!primary.has(extra) && !out.includes(extra)) out.push(extra);
    }
  }
  return out;
}

// A shipped tool with no extraSources, so the baseline test can prove it is not vacuous.
const PLAIN_TOOL = shipped.pages.find(page => page.kind === 'tool'
  && !(page.extraSources || []).length && existsSync(path.join(repoRoot, page.source)))?.slug;

function blobSha(bytes) {
  return createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`, 'utf8')).update(bytes).digest('hex');
}

function jsonResponse(status, value) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function syntheticLedger(status = 'pending') {
  const ledger = {};
  for (const slug of [...BANK_TOOLS, PLAIN_TOOL]) {
    ledger[slug] = status === 'pending'
      ? { status: 'pending', at: '2026-10-05', by: 'Pending faculty review', risk: RISK, reason: 'Synthetic: reopened for bank review.' }
      : { status, at: '2026-10-05', by: 'Synthetic Reviewer', risk: RISK };
  }
  return ledger;
}

/* GitHub, served from the working tree: one tree listing every shipped source and the
   registries, contents reads of those exact bytes, and a reviewed.json that lives in memory. */
function createRepoMock({ ledger = syntheticLedger(), overrides = {} } = {}) {
  const files = new Map();
  const add = (relative) => {
    if (files.has(relative)) return;
    const absolute = path.join(repoRoot, relative);
    if (existsSync(absolute)) files.set(relative, readFileSync(absolute));
  };
  for (const page of shipped.pages) {
    add(page.source);
    for (const extra of page.extraSources || []) add(extra);
  }
  for (const relative of REGISTRY_FILES) add(relative);
  for (const [relative, bytes] of Object.entries(overrides)) files.set(relative, Buffer.from(bytes));
  let reviewed = { json: ledger, sha: 'a'.repeat(40) };
  const writes = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = (init.method || 'GET').toUpperCase();
    const contents = url.pathname.split('/contents/')[1];
    const git = url.pathname.split('/git/')[1];
    if (method === 'GET' && git === 'ref/heads/main') return jsonResponse(200, { object: { type: 'commit', sha: HEAD } });
    if (method === 'GET' && git?.startsWith('trees/')) {
      return jsonResponse(200, {
        sha: 't'.repeat(40),
        truncated: false,
        tree: [...files].map(([relative, bytes]) => ({ path: relative, type: 'blob', mode: '100644', sha: blobSha(bytes) })),
      });
    }
    if (contents) {
      const relative = decodeURIComponent(contents);
      if (relative === REVIEWED_PATH) {
        if (method === 'PUT') {
          const body = JSON.parse(String(init.body));
          reviewed = { json: JSON.parse(Buffer.from(body.content, 'base64').toString('utf8')), sha: 'd'.repeat(40) };
          writes.push(reviewed.json);
          return jsonResponse(200, { content: { sha: reviewed.sha }, commit: { html_url: 'https://github.example/commit/1' } });
        }
        const bytes = Buffer.from(`${JSON.stringify(reviewed.json, null, 2)}\n`, 'utf8');
        return jsonResponse(200, { sha: reviewed.sha, size: bytes.length, encoding: 'base64', content: bytes.toString('base64') });
      }
      const bytes = files.get(relative);
      if (!bytes) return jsonResponse(404, { message: 'Not Found' });
      return jsonResponse(200, { sha: blobSha(bytes), size: bytes.length, encoding: 'base64', content: bytes.toString('base64') });
    }
    return jsonResponse(404, { message: `Unmocked ${method} ${url.pathname}` });
  };
  return { fetchImpl, writes, files, get reviewed() { return reviewed.json; } };
}

function handlerFor(mock) {
  return createHandler({
    fetchImpl: mock.fetchImpl,
    treeCache: null,
    env: {
      GITHUB_TOKEN: 'synthetic-token',
      FACULTY_ATTEST_PASSWORD: FACULTY_KEY,
      GITHUB_REPO: 'synthetic/faculty-console',
      GIT_BRANCH: 'main',
      STUDENT_SITE_URL: 'https://students.example/',
      ATTESTER_NAME: 'Synthetic Reviewer',
    },
  });
}

async function call(handler, method, { query = '', body } = {}) {
  const headers = new Headers({ 'x-faculty-key': FACULTY_KEY, Origin: new URL(API_URL).origin });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await handler(new Request(`${API_URL}${query}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  }));
  return { status: response.status, payload: await response.json() };
}

/* A minimal element factory with the console's `el` signature, recording attributes. */
function h(tag, attributes = {}, children = []) {
  const node = { tag, attributes: {}, children: [] };
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    node.attributes[name] = value;
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined) continue;
    node.children.push(typeof child === 'object' ? child : String(child));
  }
  return node;
}

function walk(node, visit) {
  if (typeof node === 'string') return;
  visit(node);
  for (const child of node.children) walk(child, visit);
}

function units(nodes, unit) {
  let count = 0;
  for (const node of nodes) walk(node, n => { if (n.attributes['data-bank-unit'] === unit) count += 1; });
  return count;
}

function textOf(node) {
  return typeof node === 'string' ? node : node.children.map(textOf).join('');
}

/* Every string value, plus every object key that is data rather than a field name (an evidence
   id, a card id): the two things a reviewer must be able to read verbatim. */
function stringLeaves(value, out = []) {
  if (typeof value === 'string') out.push(value.trim());
  else if (Array.isArray(value)) value.forEach(entry => stringLeaves(entry, out));
  else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) out.push(key);
      stringLeaves(entry, out);
    }
  }
  return out.filter(Boolean);
}

/* Choices counted from the data's own shape: entries of any `choices` array that carry text. */
function countChoices(value) {
  let count = 0;
  const visit = (entry, key) => {
    if (Array.isArray(entry)) {
      if (key === 'choices') count += entry.filter(choice => choice && typeof choice === 'object' && typeof choice.text === 'string').length;
      entry.forEach(child => visit(child, ''));
    } else if (entry && typeof entry === 'object') {
      for (const [childKey, child] of Object.entries(entry)) visit(child, childKey);
    }
  };
  visit(value, '');
  return count;
}

function renderAll(view) {
  return view.files.map(file => renderBankFile(file, h, { expanded: () => true }));
}

function hashedJson(relative) {
  return JSON.parse(readFileSync(path.join(repoRoot, relative), 'utf8'));
}

let cachedViews = null;
async function bankViews() {
  if (cachedViews) return cachedViews;
  const handler = handlerFor(createRepoMock());
  cachedViews = new Map();
  for (const slug of BANK_TOOLS) {
    const { status, payload } = await call(handler, 'GET', { query: `?view=bank&slug=${encodeURIComponent(slug)}` });
    assert.equal(status, 200, `${slug}: ${JSON.stringify(payload).slice(0, 300)}`);
    cachedViews.set(slug, payload);
  }
  return cachedViews;
}

// ── (a) The view renders the whole hashed bank ─────────────────────────────────────────

test('the bank view reads exactly the files the hash covers, and re-derives the signature from them', async () => {
  const views = await bankViews();
  const python = spawnSync('python3', ['-c', [
    'import json, sys',
    "sys.path.insert(0, '13_Faculty_Resources/_automation')",
    'import attestation_hash as ah',
    'd = json.load(sys.stdin)',
    "print(json.dumps({s: ah.sources_for_slug(d['shipped'], s) for s in d['slugs']}))",
  ].join('\n')], { cwd: repoRoot, input: JSON.stringify({ shipped, slugs: BANK_TOOLS }), encoding: 'utf8' });
  assert.equal(python.status, 0, python.stderr);
  const pythonSources = JSON.parse(python.stdout);
  for (const slug of BANK_TOOLS) {
    const view = views.get(slug);
    const shown = view.files.map(file => file.path);
    assert.deepEqual(shown, independentBankFiles(slug), `${slug}: the files shown are its extraSources`);
    assert.deepEqual([...view.primarySources, ...shown].sort(), [...pythonSources[slug]].sort(),
      `${slug}: page source + bank files = attestation_hash.sources_for_slug (the Python original)`);
    assert.equal(view.verified, true, `${slug}: the bytes shown re-derive the signature fingerprint`);
    assert.match(view.bankRevision, /^[0-9a-f]{40}$/);
    for (const file of view.files) {
      assert.equal(file.revision, blobSha(readFileSync(path.join(repoRoot, file.path))), `${file.path}: shown at its tree blob`);
    }
  }
  // The resident reasoning cases — never rendered anywhere in the console before — are in it.
  assert.ok(views.get('diagnostic-reasoning.html').files.some(file => file.path === 'reasoning_cases_resident.json'));
  assert.ok(views.get('review.html').files.some(file => file.path === 'reasoning_cases_resident.json'));
});

test('every deck card, option, keyed answer and option feedback in the hashed deck file is rendered', async () => {
  const views = await bankViews();
  const decks = hashedJson('07_Evidence_and_Reading/Landmark_Trials/quizzes.json').decks;
  const cards = decks.reduce((sum, deck) => sum + deck.questions.length, 0);
  const options = decks.reduce((sum, deck) => sum + deck.questions.reduce((s, card) => s + card.o.length, 0), 0);
  const keyed = decks.reduce((sum, deck) => sum + deck.questions.reduce((s, card) => s + card.o.filter(o => o.c === true).length, 0), 0);
  for (const slug of ['review.html', 'rp-canon-quiz.html']) {
    const file = views.get(slug).files.find(entry => entry.path.endsWith('Landmark_Trials/quizzes.json'));
    assert.ok(file, `${slug} shows the deck file`);
    const rendered = renderAll({ files: [file] });
    assert.equal(file.sections.filter(section => section.unit === 'deck').length, decks.length, `${slug}: one section per deck`);
    assert.equal(units(rendered, 'card'), cards, `${slug}: rendered card count equals the hashed bank's card count`);
    assert.equal(units(rendered, 'option'), options, `${slug}: every option rendered`);
    assert.equal(units(rendered, 'option-feedback'), options, `${slug}: every option's feedback line rendered`);
    let keyedShown = 0;
    for (const node of rendered) walk(node, n => { if (n.attributes.class === 'bank-option keyed') keyedShown += 1; });
    assert.equal(keyedShown, keyed, `${slug}: every keyed answer marked`);
  }
});

test('every COMM, FAM and REASON case (resident cases included) and every choice with its feedback is rendered', async () => {
  const views = await bankViews();
  const expectations = [
    ['communication_cases.json', 'cases', 'case'],
    ['family_systems_scenarios.json', 'scenarios', 'scenario'],
    ['reasoning_cases.json', 'cases', 'case'],
    ['reasoning_cases_resident.json', 'cases', 'case'],
  ];
  for (const [relative, key, unit] of expectations) {
    const records = hashedJson(relative)[key];
    const choices = countChoices(records);
    if (relative !== 'family_systems_scenarios.json') assert.ok(choices > 0, `${relative}: the fixture has choices to count`);
    for (const slug of BANK_TOOLS) {
      const file = views.get(slug).files.find(entry => entry.path === relative);
      if (!file) continue;
      const rendered = renderAll({ files: [file] });
      assert.equal(file.sections.filter(section => section.unit === unit).length, records.length,
        `${slug} · ${relative}: one ${unit} section per record`);
      assert.equal(units(rendered, 'choice'), choices, `${slug} · ${relative}: every choice rendered`);
      assert.equal(units(rendered, 'choice-feedback'), choices, `${slug} · ${relative}: every choice's feedback rendered`);
    }
  }
});

test('nothing in a hashed bank file is left out of the rendering (every string appears)', async () => {
  const views = await bankViews();
  for (const slug of BANK_TOOLS) {
    for (const file of views.get(slug).files) {
      const text = renderAll({ files: [file] }).map(textOf).join('\n');
      const doc = /\.json$/.test(file.path) ? hashedJson(file.path) : readFileSync(path.join(repoRoot, file.path), 'utf8');
      const missing = stringLeaves(doc).filter(value => !text.includes(value));
      assert.deepEqual(missing.slice(0, 5), [], `${slug} · ${file.path}: ${missing.length} string(s) not rendered`);
    }
  }
});

// ── (b) The sign control waits for every section; the server waits for the receipt ──────

test('a bank-bearing tool is not eligible until every section has been opened', async () => {
  const views = await bankViews();
  const view = views.get('rp-canon-quiz.html');
  // `unreviewed` is how the GET projects a pending row.
  const [item] = normalizeReviewItems({ items: [{ slug: 'rp-canon-quiz.html', kind: 'tool', status: 'unreviewed', bankFiles: view.files.map(f => f.path) }], qbank: [] });
  const keys = view.files.flatMap(file => file.sections.map(section => section.key));
  const signable = bankReview => deriveAttestationEligibility({
    item, previewStatus: 'ready', completeItemReviewed: true,
    contentChecks: { accuracy: true, interactions: true }, bankReview,
  });
  const allButOne = bankProgress(view, new Set(keys.slice(1)));
  assert.equal(allButOne.complete, false);
  assert.equal(bankProgressText(allButOne), `1 of ${keys.length} decks not yet opened`);
  assert.deepEqual(signable({ complete: allButOne.complete }).blockers, ['review.bank_sections_required']);
  assert.deepEqual(signable(undefined).blockers, ['review.bank_sections_required'], 'no bank view, no signature');
  const all = bankProgress(view, new Set(keys));
  assert.equal(all.complete, true);
  assert.deepEqual(signable({ complete: all.complete }).blockers, []);
  assert.equal(bankProgressText(bankProgress(view, new Set(keys.slice(12)))), `12 of ${keys.length} decks not yet opened`);
});

test('the server refuses a bank-bearing signature without the bank receipt, or over a changed bank', async () => {
  const views = await bankViews();
  const revision = views.get('family-systems.html').bankRevision;
  const attest = (mock, bankReviews) => call(handlerFor(mock), 'POST', {
    body: { target: 'content', changes: { 'family-systems.html': true }, ...(bankReviews ? { bankReviews } : {}) },
  });

  const missing = createRepoMock();
  const refused = await attest(missing);
  assert.equal(refused.status, 400);
  assert.equal(refused.payload.error.code, 'content.bank_review_required');
  assert.equal(missing.writes.length, 0, 'nothing written without the receipt');

  const scenarios = hashedJson('family_systems_scenarios.json');
  scenarios.scenarios[0].opening = `${scenarios.scenarios[0].opening} (edited after it was opened)`;
  const changed = createRepoMock({ overrides: { 'family_systems_scenarios.json': `${JSON.stringify(scenarios, null, 2)}\n` } });
  const stale = await attest(changed, { 'family-systems.html': revision });
  assert.equal(stale.status, 409);
  assert.equal(stale.payload.error.code, 'content.bank_changed');
  assert.equal(changed.writes.length, 0, 'nothing written over a changed bank');

  const ok = createRepoMock();
  const signed = await attest(ok, { 'family-systems.html': revision });
  assert.equal(signed.status, 200, JSON.stringify(signed.payload));
  assert.equal(signed.payload.updated, 1);
  assert.equal(ok.reviewed['family-systems.html'].status, 'reviewed');
  assert.match(ok.reviewed['family-systems.html'].contentHash, /^[0-9a-f]{40}$/);
});

test('the GET queue marks exactly the slugs with extraSources as bank-bearing', async () => {
  const { payload } = await call(handlerFor(createRepoMock()), 'GET');
  const marked = payload.items.filter(item => Array.isArray(item.bankFiles)).map(item => item.slug).sort();
  const expected = [...new Set(shipped.pages.filter(page => independentBankFiles(page.slug).length).map(page => page.slug))].sort();
  assert.deepEqual(marked, expected);
  for (const slug of BANK_TOOLS) assert.ok(marked.includes(slug), `${slug} is bank-bearing`);
});

// ── (c) The baseline never carries a bank-bearing item ──────────────────────────────────

test('the baseline press leaves every bank-bearing item out, with the reason, and never signs it', async () => {
  assert.ok(PLAIN_TOOL, 'fixture needs a shipped tool without extraSources');
  const preview = await call(handlerFor(createRepoMock()), 'GET', { query: '?view=batch&mode=baseline' });
  assert.equal(preview.status, 200, JSON.stringify(preview.payload).slice(0, 300));
  const signed = preview.payload.sign.map(item => item.slug);
  assert.ok(signed.includes(PLAIN_TOOL), `${PLAIN_TOOL} (no bank) is offered, so this check is not vacuous`);
  for (const slug of BANK_TOOLS) {
    assert.ok(!signed.includes(slug), `${slug} must not be in the baseline sign list`);
    const left = preview.payload.excluded.find(item => item.slug === slug);
    assert.ok(left, `${slug} is listed under Left out`);
    assert.match(left.reason, /bank file/);
  }
  const mock = createRepoMock();
  const press = await call(handlerFor(mock), 'POST', {
    body: { target: 'content', mode: 'baseline', questions: false, statement: preview.payload.statement },
  });
  assert.equal(press.status, 200, JSON.stringify(press.payload).slice(0, 300));
  assert.equal(mock.reviewed[PLAIN_TOOL].status, 'reviewed');
  for (const slug of BANK_TOOLS) assert.equal(mock.reviewed[slug].status, 'pending', `${slug} stays pending after a baseline`);
});

test('describeBankFile never drops a file it cannot parse: it is shown as its text', () => {
  const file = describeBankFile('notes/broken.json', '{"cases": [');
  assert.equal(file.format, 'text');
  assert.equal(file.sections.length, 1);
  assert.equal(file.sections[0].text, '{"cases": [');
});
