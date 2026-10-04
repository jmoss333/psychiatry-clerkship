import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHandler } from '../faculty-console/netlify/functions/attest.mjs';
import {
  PHARMACY_PATH, LABEL_RECEIPT_PATH, LABEL_PINS_PATH, labelEvidence, assessMedication, reviewedFieldsHash, retrievalHash,
  loadMedicationSnapshot, medicationView, prepareMedicationApproval, commitMedicationApproval,
} from '../faculty-console/netlify/functions/pharmacy-actions.mjs';

const HEAD = 'a'.repeat(40), NEXT = 'f'.repeat(40);
const settings = { branch: 'attest/pending', baseBranch: 'main', isolated: true, ledger: null };
function record(id = 'synthetic-one') {
  return { id, generic: `Synthetic medication ${id}`, safetyLevel: 'high', rxcui: '123', dailymedSetId: 'synthetic-label', labelVersionDate: '2026-01-01',
    boxedWarning: { present: false }, mechanism: { t1: 'Synthetic judgment — not clinical guidance.' },
    attendingAsks: ['Which synthetic fact was reviewed?'], retrieval: [{ id: 'ask-one', askIndex: 0, revealFrom: ['mechanism.t1'] }],
    provenance: { fieldClasses: { mechanism: 'J', optionalMissing: 'J', boxedWarning: 'L' } }, facultyReview: { status: 'pending' } };
}
function receipt() { return { rxnorm: { rxcui: '123' }, reference: { setId: 'synthetic-label', effectiveDate: '2026-01-01', boxedWarningPresent: false, dailymedResolves: true }, problems: [] }; }
function pin() { return { setId: 'synthetic-label', version: 1, effectiveDate: '2026-01-01', sections: { '1': 'a'.repeat(16) } }; }
function snapshot() { return { pins: { sha: 'd'.repeat(40), json: { agents: { 'synthetic-one': pin(), 'synthetic-two': pin() } } }, head: HEAD, needsSync: false, registry: { sha: 'b'.repeat(40), json: { schemaVersion: 1, records: [record(), record('synthetic-two')] } }, receipt: { sha: 'c'.repeat(40), json: { agents: { 'synthetic-one': receipt(), 'synthetic-two': receipt() } } } }; }
function body(s = snapshot()) { return { action: 'pharmacy.attest', id: 'synthetic-one', head: s.head, revision: medicationView(s, 'Synthetic Faculty').items[0].revision, confirmations: { card: true, sources: true, retrieval: true, labelEvidence: true } }; }
function repository(s = snapshot(), overrides = {}) {
  return { describeBranchSync: async () => ({ aheadBy: 0, behindBy: 0 }), headOf: async () => s.head, head: async () => s.head,
    read: async path => path === PHARMACY_PATH ? s.registry : path === LABEL_PINS_PATH ? s.pins : s.receipt,
    writeAtHead: async () => ({ commit: `https://github.com/synthetic/repo/commit/${NEXT}` }), ...overrides };
}

test('J and retrieval hashes match the existing Python canonical rules, including Unicode and absent optional fields', () => {
  const records = [record(), { ...record(), mechanism: { t1: 'é\n\t"\\ 🩺', nested: [true, false, null, 4] } }];
  const script = `import json,sys\nsys.path.insert(0,'13_Faculty_Resources/_automation/pharmacy')\nfrom validate_pharmacy import j_hash,retrieval_hash\nprint(json.dumps([[j_hash(r),retrieval_hash(r)] for r in json.load(sys.stdin)]))`;
  const result = spawnSync('python3', ['-c', script], { input: JSON.stringify(records), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(records.map(r => [reviewedFieldsHash(r), retrievalHash(r)]), JSON.parse(result.stdout));
});

test('decimal display metadata remains reviewable and revision-bound without changing persisted hash scope', () => {
  const s = snapshot(), r = s.registry.json.records[0];
  const originalHash = reviewedFieldsHash(r);
  r.familyExplainer = { text: 'Synthetic explanation.', fkGrade: 2.6 };
  const b = body(s);
  assert.deepEqual(medicationView(s, 'S').items[0].issues, []);
  assert.equal(prepareMedicationApproval(s, b, 'S', '2026-01-02').review.reviewedFieldsHash, originalHash);
  r.familyExplainer.fkGrade = 3.1;
  assert.throws(() => prepareMedicationApproval(s, b, 'S', '2026-01-02'), /changed/);
});

test('unsupported persisted hash values block only that card and never break the whole review list', () => {
  const s = snapshot(); s.registry.json.records[0].mechanism.score = 2.6;
  const view = medicationView(s, 'S');
  assert.match(view.items[0].issues.join(' '), /unsupported hash value/);
  assert.deepEqual(view.items[1].issues, []);
  assert.throws(() => prepareMedicationApproval(s, body(s), 'S', '2026-01-02'), /validation problems/);
});

test('approval writes only one facultyReview block, preserving clinical bytes and all other records', () => {
  const s = snapshot(), before = structuredClone(s), next = prepareMedicationApproval(s, body(s), 'Synthetic Faculty', '2026-01-02');
  assert.deepEqual(s, before);
  assert.deepEqual(next.registry.records[1], s.registry.json.records[1]);
  const clinical = r => { const copy = structuredClone(r); delete copy.facultyReview; return copy; };
  assert.deepEqual(clinical(next.registry.records[0]), clinical(s.registry.json.records[0]));
  assert.deepEqual(next.review, { status: 'reviewed', reviewer: 'Synthetic Faculty', lastReviewed: '2026-01-02', reviewedFieldsHash: reviewedFieldsHash(record()), retrievalHash: retrievalHash(record()), labelEvidence: labelEvidence(s, record()) });
});

test('all explicit confirmations are required; attribution, hashes and alternate actions cannot come from the browser', () => {
  for (const key of ['card', 'sources', 'retrieval', 'labelEvidence']) {
    const b = body(); delete b.confirmations[key]; assert.throws(() => prepareMedicationApproval(snapshot(), b, 'S', '2026-01-02'), /Explicitly confirm/);
  }
  for (const key of ['reviewer', 'lastReviewed', 'reviewedFieldsHash', 'retrievalHash', 'target', 'record', 'records', 'labelEvidence']) {
    assert.throws(() => prepareMedicationApproval(snapshot(), { ...body(), [key]: 'forged' }, 'S', '2026-01-02'), /Choose one saved/);
  }
});

test('head, card, label receipt and identity changes reject the loaded review', () => {
  for (const edit of [s => { s.head = NEXT; }, s => { s.registry.json.records[0].mechanism.t1 = 'Changed'; }, s => { s.receipt.json.agents['synthetic-one'].verifiedOn = '2026-02-01'; }, s => { s.needsSync = true; }]) {
    const s = snapshot(), b = body(s); edit(s); assert.throws(() => prepareMedicationApproval(s, b, 'S', '2026-01-02'), /changed/);
  }
  assert.throws(() => prepareMedicationApproval(snapshot(), { ...body(), id: 'unknown' }, 'S', '2026-01-02'), /changed/);
});

test('label mismatches, unresolved receipt problems and invalid retrieval targets cannot be approved', () => {
  for (const edit of [s => { s.registry.json.records[0].labelVersionDate = '2025-01-01'; }, s => { s.receipt.json.agents['synthetic-one'].problems = ['unresolved']; }, s => { s.registry.json.records[0].retrieval[0].revealFrom = ['constructor.prototype']; }, s => { s.registry.json.records[0].retrieval[0].askIndex = 99; }]) {
    const s = snapshot(); edit(s); assert.throws(() => prepareMedicationApproval(s, body(s), 'S', '2026-01-02'), /validation problems/);
  }
  assert.deepEqual(assessMedication(record(), receipt()), []);
});

test('read-only snapshot uses current main when no reviews are ahead; never freshens a branch on GET', async () => {
  let writes = 0; const s = snapshot(); const repo = repository(s, { head: async () => { throw Error('Do not read stale branch'); }, ensureBranchFresh: async () => { writes++; } });
  assert.equal((await loadMedicationSnapshot(repo, settings)).head, HEAD); assert.equal(writes, 0);
  const behind = await loadMedicationSnapshot(repository(s, { describeBranchSync: async () => ({ aheadBy: 2, behindBy: 1 }) }), settings);
  assert.equal(behind.needsSync, true);
});

test('ledger, direct-write and alternate branches fail closed; duplicate IDs reject the registry', async () => {
  for (const config of [{ ...settings, ledger: {} }, { ...settings, branch: 'main', isolated: false }, { ...settings, branch: 'feature' }, { ...settings, baseBranch: 'other' }]) await assert.rejects(loadMedicationSnapshot(repository(), config), /requires the existing attest/);
  const s = snapshot(); s.registry.json.records.push(record()); await assert.rejects(loadMedicationSnapshot(repository(s), settings), /duplicate identity/);
});

test('write uses exact parent and blob and never retries an intervening commit', async () => {
  const s = snapshot(); let count = 0;
  const repo = repository(s, { writeAtHead: async (path, value, options) => { count++; assert.equal(path, PHARMACY_PATH); assert.equal(options.parentHead, HEAD); assert.equal(options.expectedBlobSha, s.registry.sha); throw Error('Synthetic race'); } });
  await assert.rejects(commitMedicationApproval({ repository: repo, settings, body: body(s), attester: 'S', date: '2026-01-02' }), /Synthetic race/); assert.equal(count, 1);
});

function gateway({ conflict = false } = {}) {
  const s = snapshot(), writes = [], calls = []; let head = HEAD, pending;
  const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input), path = decodeURIComponent(url.pathname), method = init.method || 'GET'; calls.push({ path, method });
    if (path.includes('/git/ref/heads/')) return response({ object: { type: 'commit', sha: path.endsWith('/main') ? HEAD : head } });
    if (path.includes('/compare/')) return response({ ahead_by: head === HEAD ? 0 : 1, behind_by: 0 });
    if (path.endsWith('/pulls')) return response([{ html_url: 'https://github.com/synthetic/repo/pull/1', head: { ref: 'attest/pending' }, base: { ref: 'main' } }]);
    if (path.includes('/contents/')) {
      const name = path.split('/contents/')[1], file = name === PHARMACY_PATH ? s.registry : name === LABEL_RECEIPT_PATH ? s.receipt : name === LABEL_PINS_PATH ? s.pins : null;
      if (!file) return response({}, 404);
      const raw = JSON.stringify(file.json); return response({ sha: file.sha, size: Buffer.byteLength(raw), encoding: 'base64', content: Buffer.from(raw).toString('base64') });
    }
    if (path.endsWith('/git/commits/' + HEAD)) return response({ sha: HEAD, tree: { sha: 'd'.repeat(40) } });
    if (method === 'POST' && path.endsWith('/git/blobs')) { pending = JSON.parse(Buffer.from(JSON.parse(init.body).content, 'base64')); writes.push({ kind: 'blob', value: pending }); return response({ sha: 'e'.repeat(40) }); }
    if (method === 'POST' && path.endsWith('/git/trees')) { writes.push({ kind: 'tree', value: JSON.parse(init.body) }); return response({ sha: '1'.repeat(40) }); }
    if (method === 'POST' && path.endsWith('/git/commits')) { writes.push({ kind: 'commit', value: JSON.parse(init.body) }); return response({ sha: NEXT, html_url: `https://github.com/synthetic/repo/commit/${NEXT}` }); }
    if (method === 'PATCH' && path.endsWith('/git/refs/heads/attest/pending')) {
      writes.push({ kind: 'ref', value: JSON.parse(init.body) }); if (conflict) return response({}, 409); head = NEXT; s.registry.json = pending; s.registry.sha = 'e'.repeat(40); return response({ object: { type: 'commit', sha: NEXT } });
    }
    throw Error(`Unexpected synthetic request ${method} ${path}`);
  };
  const handler = createHandler({ fetchImpl, treeCache: null, env: { GITHUB_TOKEN: 'synthetic-token', FACULTY_ATTEST_PASSWORD: 'synthetic-key', GITHUB_REPO: 'synthetic/repo', GIT_BRANCH: 'attest/pending', GIT_BASE_BRANCH: 'main', ATTESTER_NAME: 'Server Faculty', ALLOWED_ORIGIN: 'https://faculty.example' } });
  return { handler, writes, calls, snapshot: s };
}
function request(method, body, extraHeaders = {}) {
  return new Request('https://faculty.example/api/attest' + (method === 'GET' ? '?view=medications' : ''), { method, headers: { 'x-faculty-key': 'synthetic-key', Origin: 'https://faculty.example', ...(body ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
test('real handler retains authentication and exact-origin boundaries before any repository access', async () => {
  for (const headers of [{ 'x-faculty-key': 'wrong' }, { Origin: 'https://hostile.example' }]) {
    const mock = gateway(); const result = await mock.handler(request('GET', null, headers)); assert.ok([401, 403].includes(result.status)); assert.equal(mock.calls.length, 0);
  }
});
test('real handler approves exactly one synthetic card with server attribution and non-force CAS', async () => {
  const mock = gateway(); const viewResponse = await mock.handler(request('GET')); assert.equal(viewResponse.status, 200); const view = await viewResponse.json();
  const result = await mock.handler(request('POST', { ...body(), head: view.head, revision: view.items[0].revision }));
  assert.equal(result.status, 200, JSON.stringify(await result.clone().json())); const saved = await result.json(); assert.equal(saved.updated, 1); assert.equal(saved.review.reviewer, 'Server Faculty');
  const blob = mock.writes.find(w => w.kind === 'blob').value; assert.deepEqual(blob.records[1], record('synthetic-two'));
  assert.deepEqual(mock.writes.find(w => w.kind === 'tree').value.tree.map(e => e.path), [PHARMACY_PATH]);
  assert.equal(mock.writes.find(w => w.kind === 'commit').value.committer.email, 'faculty@clerkship.local');
  assert.deepEqual(mock.writes.find(w => w.kind === 'ref').value, { sha: NEXT, force: false });
});
test('real handler rejects extra content target and forged stamps without writing', async () => {
  const mock = gateway(); const result = await mock.handler(request('POST', { ...body(), target: 'content', content: { 'fake.html': true } })); assert.equal(result.status, 400); assert.equal(mock.writes.length, 0);
});
test('real handler conflict produces no successful receipt and no retry', async () => {
  const mock = gateway({ conflict: true }); const result = await mock.handler(request('POST', body())); assert.equal(result.status, 409); assert.equal(mock.writes.filter(w => w.kind === 'ref').length, 1);
});


test('evidence query cannot reinterpret a medication approval or write either review record', async () => {
  const mock = gateway();
  const original = request('POST', body());
  const response = await mock.handler(new Request('https://faculty.example/api/attest?view=evidence', {
    method: 'POST', headers: original.headers, body: JSON.stringify(body()),
  }));
  assert.equal(response.status, 400);
  assert.equal(mock.writes.length, 0);
  assert.ok(mock.calls.some(call => call.path.endsWith('/git/ref/heads/attest/evidence-review')));
  assert.equal(mock.calls.filter(call => call.method !== 'GET').length, 0);
});

test('medication endpoint cannot reinterpret an evidence disposition', async () => {
  const mock = gateway();
  const response = await mock.handler(request('POST', {
    action: 'evidence.decide', packetRevision: 'synthetic-packet',
    expectedReportCommit: HEAD, expectedDecisionRevision: HEAD,
    dispositions: [{ itemKey: 'question:synthetic', itemRevision: HEAD, outcome: 'defer', rationale: 'Synthetic test' }],
  }));
  assert.equal(response.status, 400);
  assert.equal(mock.writes.length, 0);
});

test('approval binds the exact committed label pin and receipt, never a client-supplied evidence claim', () => {
  const s = snapshot();
  s.pins = { json: { agents: { 'synthetic-one': { setId: 'synthetic-label', version: 2, effectiveDate: '2026-01-01', sections: { '1': 'a'.repeat(16) } } } } };
  const b = body(s); b.confirmations.labelEvidence = true;
  const saved = prepareMedicationApproval(s, b, 'Synthetic Faculty', '2026-02-02');
  assert.equal(saved.review.labelEvidence.version, 2);
  assert.equal(saved.review.labelEvidence.sourceRevision, HEAD);
  assert.equal(saved.review.labelEvidence.effectiveDate, '2026-01-01');
  assert.match(saved.review.labelEvidence.pinHash, /^[a-f0-9]{64}$/);
  assert.match(saved.review.labelEvidence.receiptHash, /^[a-f0-9]{64}$/);
  assert.throws(() => prepareMedicationApproval(s, { ...b, labelEvidence: saved.review.labelEvidence }, 'S', '2026-02-02'), /Choose one saved/);
  s.pins.json.agents['synthetic-one'].sections['1'] = 'b'.repeat(16);
  assert.throws(() => prepareMedicationApproval(s, b, 'S', '2026-02-02'), /changed/);
});


test('missing, stale, malformed and mismatched source pins block approval', async () => {
  for (const edit of [s => { delete s.pins; }, s => { delete s.pins.json.agents['synthetic-one']; }, s => { s.pins.json.agents['synthetic-one'].version = 0; }, s => { s.pins.json.agents['synthetic-one'].effectiveDate = '2025-01-01'; }, s => { s.pins.json.agents['synthetic-one'].setId = 'wrong'; }, s => { s.pins.json.agents['synthetic-one'].sections = {}; }, s => { s.pins.json.agents['synthetic-one'].sections['1'] = 'invalid'; }]) {
    const s = snapshot(); edit(s);
    assert.throws(() => prepareMedicationApproval(s, body(s), 'S', '2026-02-02'), /validation problems/);
    const view = medicationView(s, 'S'); assert.ok(view.items[0].issues.length);
  }
});

test('a later review of an old source records only old evidence, never claims the newer observed version', () => {
  const s = snapshot(); const saved = prepareMedicationApproval(s, body(s), 'S', '2026-03-01');
  assert.equal(saved.review.lastReviewed, '2026-03-01');
  assert.equal(saved.review.labelEvidence.version, 1);
  assert.equal(saved.review.labelEvidence.effectiveDate, '2026-01-01');
  assert.notEqual(saved.review.labelEvidence.version, 2);
});


test('authenticated handler refuses a mismatched pin before creating any commit', async () => {
  const mock = gateway(); mock.snapshot.pins.json.agents['synthetic-one'].effectiveDate = '2025-01-01';
  const result = await mock.handler(request('POST', body(mock.snapshot)));
  assert.equal(result.status, 422); assert.equal(mock.writes.length, 0);
});

test('persisted evidence canonical hashes agree with Python', () => {
  const s = snapshot(), evidence = labelEvidence(s, record());
  const result = spawnSync('python3', ['-c', 'import hashlib,json,sys; print(json.dumps([hashlib.sha256(json.dumps(v,sort_keys=True,ensure_ascii=False,separators=(chr(44),chr(58))).encode()).hexdigest() for v in json.load(sys.stdin)]))'], { input: JSON.stringify([s.pins.json.agents['synthetic-one'],s.receipt.json.agents['synthetic-one']]), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.deepEqual([evidence.pinHash,evidence.receiptHash],JSON.parse(result.stdout));
});
