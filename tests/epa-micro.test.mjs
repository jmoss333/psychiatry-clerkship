import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// F6 EPA micro-assessment DEMO (unshipped, synthetic, device-local). Pins: no free text beyond the
// guarded token field, one literal storage key wrapped in try/catch, synthetic roster, the DEMO
// banner, no network, the timeline and the template draft, and the inline QR encoder.
// Design: docs/superpowers/specs/2026-10-27-epa-micro-assessment-design.md

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(repo, '_prototypes', 'epa-micro', 'epa-micro.html');
const html = fs.readFileSync(SRC, 'utf8');

function block(id) {
  const m = html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`));
  assert.ok(m, `script block #${id} present`);
  return m[1];
}
const ROSTER = JSON.parse(block('epa-roster'));
const ctx = {};
vm.runInNewContext(`${block('epa-engine')}\n${block('epa-qr')}\nthis.EPA = EPA; this.EPAQR = EPAQR;`, ctx);
const { EPA, EPAQR } = ctx;
const local = (v) => JSON.parse(JSON.stringify(v)); // vm-realm objects -> this realm for deepEqual

const FIXED = [
  { token: 'EPA-DEMO-C9M4', faculty: 'Faculty 2', epa: 6, level: 2, strength: 'Organized, concise presentation', next: 'Commit to a leading diagnosis', day: '2026-09-10' },
  { token: 'EPA-DEMO-C9M4', faculty: 'Faculty 1', epa: 1, level: 2, strength: 'Thorough collateral gathering', next: 'Include pertinent negatives', day: '2026-09-08' },
  { token: 'EPA-DEMO-C9M4', faculty: 'Faculty 2', epa: 6, level: 4, strength: 'Organized, concise presentation', next: 'Prioritize the problem list', day: '2026-10-01' },
  { token: 'EPA-DEMO-A7K3', faculty: 'Faculty 3', epa: 9, level: 3, strength: 'Worked well with the team', next: 'Close the loop with the team', day: '2026-09-15' },
  { token: 'EPA-DEMO-C9M4', faculty: 'Faculty 3', epa: 2, level: 3, strength: 'Clear risk-assessment reasoning', next: 'Commit to a leading diagnosis', day: '2026-09-20' },
];

test('DEMO banner is present and says not to enter real student information', () => {
  assert.match(html, /DEMO — synthetic data, do not enter real student information/);
  assert.match(html, /not the official evaluation/i);
});

test('roster is synthetic: six letter-labelled students, opaque demo tokens, no realistic names', () => {
  assert.equal(ROSTER._synthetic, true);
  assert.equal(ROSTER.students.length, 6);
  for (const s of ROSTER.students) {
    assert.match(s.label, /^Student [A-F]$/);
    assert.match(s.token, /^EPA-DEMO-[A-Z0-9]{4}$/);
    assert.deepEqual(Object.keys(s).sort(), ['label', 'token']);
  }
  for (const f of ROSTER.faculty) assert.match(f, /^Faculty \d$/);
});

test('no free text: no textarea; the only text input is the pattern-guarded token field', () => {
  assert.doesNotMatch(html, /<textarea/i);
  assert.doesNotMatch(html, /contenteditable/i);
  const inputs = html.match(/<input\b[^>]*>/gi) || [];
  assert.equal(inputs.length, 1);
  assert.match(inputs[0], /id="token-input"/);
  assert.match(inputs[0], /pattern="/);
  assert.match(inputs[0], /maxlength="13"/);
});

test('storage: only the literal key cw_epa_demo_v1, and every access sits inside try/catch', () => {
  const keys = new Set(html.match(/\bcw_[a-z0-9_]+/g));
  assert.deepEqual([...keys], ['cw_epa_demo_v1']);
  const calls = html.match(/localStorage\.(getItem|setItem|removeItem)\([^)]*\)/g) || [];
  assert.equal(calls.length, 3);
  for (const c of calls) {
    assert.match(c, /\('cw_epa_demo_v1'/, `${c} uses the literal key`);
    const at = html.indexOf(c);
    const before = html.slice(Math.max(0, at - 200), at);
    assert.match(before, /try \{[^}]*$/, `${c} is inside a try block`);
  }
  assert.doesNotMatch(html, /sessionStorage|indexedDB|document\.cookie/);
});

test('no network, no analytics, no external URLs, no model calls', () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|cwAnalytics|import\(/);
  assert.doesNotMatch(html, /https?:\/\//);
});

test('EPA list: the 13 AAMC Core EPA titles with attribution and the D-F6-6 note', () => {
  assert.equal(EPA.EPAS.length, 13);
  assert.match(EPA.ATTRIBUTION, /Association of American Medical Colleges/);
  assert.match(EPA.ATTRIBUTION, /D-F6-6/);
  assert.equal(EPA.LEVELS.length, 5);
});

test('token guard refuses names, emails and ID numbers; accepts and normalises a roster token', () => {
  for (const bad of ['Jane Smith', 'smith', 'j.smith@school.edu', '12345678', "O'Neil Jones"]) {
    const r = EPA.checkToken(bad, ROSTER);
    assert.equal(r.ok, false, bad);
    assert.equal(r.reason, 'looks-like-identity', bad);
    assert.match(r.message, /never|only/i);
  }
  assert.equal(EPA.checkToken('', ROSTER).reason, 'empty');
  assert.equal(EPA.checkToken('EPA-DEMO-ZZZZ', ROSTER).reason, 'unknown');
  assert.equal(EPA.checkToken('EPA-12', ROSTER).reason, 'format');
  const ok = EPA.checkToken('  epa-demo-c9m4 ', ROSTER);
  assert.equal(ok.ok, true);
  assert.equal(ok.token, 'EPA-DEMO-C9M4');
  assert.equal(ok.label, 'Student C');
});

test('makeObservation keeps only the closed field set and rejects anything off-list', () => {
  const made = EPA.makeObservation({ ...FIXED[0], note: 'free text', patient: 'x' }, ROSTER);
  assert.equal(made.ok, true);
  assert.deepEqual(Object.keys(made.obs).sort(), ['day', 'epa', 'faculty', 'level', 'next', 'strength', 'token']);
  const bad = EPA.makeObservation({ ...FIXED[0], epa: 14, level: 0, strength: 'typed by hand', day: '2026-09-10T08:00' }, ROSTER);
  assert.equal(bad.ok, false);
  assert.deepEqual(local(bad.errors), ['epa', 'level', 'strength', 'day']);
});

test('timeline: one student, sorted by day, per-EPA trajectory, observers and gaps', () => {
  const tl = EPA.timeline(FIXED, 'EPA-DEMO-C9M4');
  assert.equal(tl.count, 4);
  assert.deepEqual(local(tl.observations.map((o) => o.day)), ['2026-09-08', '2026-09-10', '2026-09-20', '2026-10-01']);
  assert.equal(tl.observers, 3);
  assert.equal(tl.firstDay, '2026-09-08');
  assert.equal(tl.lastDay, '2026-10-01');
  const six = tl.epas.find((e) => e.epa === 6);
  assert.deepEqual(local({ n: six.n, first: six.first, latest: six.latest, levels: six.levels }),
    { n: 2, first: 2, latest: 4, levels: [2, 4] });
  assert.deepEqual(local(tl.epas.map((e) => e.epa)), [1, 2, 6]);
  assert.deepEqual(local(tl.notYetObserved), [3, 4, 5, 7, 8, 9, 10, 11, 12, 13]);
  assert.deepEqual(local(tl.strengths[0]), { item: 'Organized, concise presentation', n: 2 });
  assert.equal(EPA.timeline(FIXED, 'EPA-DEMO-B2QX').count, 0);
});

test('draft eval: template-only, deterministic, labelled DRAFT and not official', () => {
  const a = EPA.draftEval(FIXED, 'EPA-DEMO-C9M4', ROSTER, '2026-10-27');
  const b = EPA.draftEval(FIXED.slice(), 'EPA-DEMO-C9M4', ROSTER, '2026-10-27');
  assert.equal(a, b);
  assert.match(a, /^DRAFT — generated from synthetic demo observations on 2026-10-27\./);
  assert.match(a, /Not the official evaluation/);
  assert.match(a, /Learner: Student C \(token EPA-DEMO-C9M4\)/);
  assert.match(a, /Observations: 4 across 3 Core EPAs by 3 observers, 2026-09-08 to 2026-10-01\./);
  assert.match(a, /- EPA 6 Provide an oral presentation of a clinical encounter: latest 4 \(.+\); range 2–4; n=2/);
  assert.match(a, /Supervision level rose over the rotation on EPA 6 \(2 to 4\)\./);
  assert.match(a, /most often observed on EPA 6/);
  assert.match(a, /Not yet observed: EPA 3, EPA 4, EPA 5,/);
  assert.match(a, /Association of American Medical Colleges/);
  const one = EPA.draftEval(FIXED, 'EPA-DEMO-A7K3', ROSTER, '2026-10-27');
  assert.match(one, /Only one observer has recorded feedback so far/);
  assert.match(EPA.draftEval([], 'EPA-DEMO-F3NV', ROSTER, ''), /No observations recorded yet\./);
});

test('seeded demo data is deterministic, valid and covers every synthetic student', () => {
  const s1 = local(EPA.seedDemo(ROSTER, 20261027, '2026-09-07'));
  const s2 = local(EPA.seedDemo(ROSTER, 20261027, '2026-09-07'));
  assert.deepEqual(s1, s2);
  for (const o of s1) assert.equal(EPA.makeObservation(o, ROSTER).ok, true);
  for (const s of ROSTER.students) assert.ok(s1.some((o) => o.token === s.token));
});

// ---- QR encoder ---------------------------------------------------------------------------
// Independent Reed–Solomon (log/antilog tables, GF(256) mod 0x11D) — not the encoder's code.
const EXP = new Array(512); const LOG = new Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsEcc(data, n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const g2 = new Array(g.length + 1).fill(0);
    g.forEach((c, j) => { g2[j] ^= c; g2[j + 1] ^= gmul(c, EXP[i]); });
    g = g2;
  }
  const msg = [...data, ...new Array(n).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const c = msg[i];
    if (c) for (let j = 1; j < g.length; j++) msg[i + j] ^= gmul(g[j], c);
  }
  return msg.slice(data.length);
}
const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];
// Read a version 1–3 symbol back: format → mask → unmask → zigzag → bytes.
function readBack(q) {
  const { size, modules: m } = q;
  let fmt = 0;
  const cells = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  cells.forEach(([x, y], i) => { if (m[y][x]) fmt |= 1 << i; });
  fmt ^= 0x5412;
  let rem = fmt >>> 10;
  const data5 = rem;
  for (let k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  assert.equal(((data5 << 10) | rem) & 0x7fff, fmt, 'format BCH valid');
  assert.equal(data5 >>> 3, 0, 'error-correction level M');
  const mask = data5 & 7;
  const ac = size - 7;
  const isFn = (x, y) => (x < 9 && y < 9) || (x >= size - 8 && y < 9) || (x < 9 && y >= size - 8) || x === 6 || y === 6 ||
    (q.version >= 2 && Math.abs(x - ac) <= 2 && Math.abs(y - ac) <= 2);
  const bits = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j; const up = ((right + 1) & 2) === 0; const y = up ? size - 1 - v : v;
      if (!isFn(x, y)) bits.push(m[y][x] !== MASKS[mask](x, y) ? 1 : 0);
    }
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  return { mask, bytes };
}
const DATA_CW = [0, 16, 28, 44]; const ECC_CW = [0, 10, 16, 26];

test('QR: every roster token round-trips at every mask, with independently checked RS bytes', () => {
  for (const { token } of ROSTER.students) {
    for (let mask = -1; mask < 8; mask++) {
      const q = EPAQR.encode(token, mask < 0 ? {} : { mask });
      assert.equal(q.size, 17 + 4 * q.version);
      const back = readBack(q);
      if (mask >= 0) assert.equal(back.mask, mask);
      const data = back.bytes.slice(0, DATA_CW[q.version]);
      const ecc = back.bytes.slice(DATA_CW[q.version], DATA_CW[q.version] + ECC_CW[q.version]);
      assert.deepEqual(ecc, rsEcc(data, ECC_CW[q.version]), `${token} mask ${mask}: RS bytes`);
      const bits = data.map((b) => b.toString(2).padStart(8, '0')).join('');
      assert.equal(bits.slice(0, 4), '0100', 'byte mode');
      const len = parseInt(bits.slice(4, 12), 2);
      const text = String.fromCharCode(...Array.from({ length: len }, (_, i) => parseInt(bits.slice(12 + 8 * i, 20 + 8 * i), 2)));
      assert.equal(text, token);
    }
  }
  assert.throws(() => EPAQR.encode('x'.repeat(43)));
  assert.throws(() => EPAQR.encode('é'));
});

test('QR: auto-masked roster matrices match the ones decoded by OpenCV at authoring time', () => {
  // sha256 of the module rows ("0"/"1", newline-joined). Each was decoded back to its token by
  // OpenCV (QRCodeDetector / QRCodeDetectorAruco) on 2026-10-27. A change here needs re-checking
  // with a real decoder before the pins move.
  const PINS = {
    'EPA-DEMO-A7K3': 'b29aff71196accc9d195e66179b8abcd5efa7c787eca665f45ece30292bf57e4',
    'EPA-DEMO-B2QX': 'd3022b876d75811659bbc2ceeb7d58ddf4cf3ee1eb11e6bfc0b9b63535af104d',
    'EPA-DEMO-C9M4': 'b5d275a7d481875688857ff772b0a892d189da7e1bc61fc59532df45b890ce9a',
    'EPA-DEMO-D5RW': '3e6f13df47bc0b11f422feadd35227f7989f2bb9e207265025e62b31cf3de7eb',
    'EPA-DEMO-E8TJ': '3ce11b044dcc789ea7877ebd800710f0bc4830ffd8a2ac94dd940ab973576bc5',
    'EPA-DEMO-F3NV': 'cfdc102e97a539b9550a3a3bf8e6cc335a27562580e51726fac6faf028fa9f0f',
  };
  for (const { token } of ROSTER.students) {
    const q = EPAQR.encode(token);
    const rows = q.modules.map((r) => r.map((b) => (b ? '1' : '0')).join('')).join('\n');
    assert.equal(crypto.createHash('sha256').update(rows).digest('hex'), PINS[token], token);
  }
});

test('prototype is not registered to ship', () => {
  const shipped = fs.readFileSync(path.join(repo, '13_Faculty_Resources/_automation/site_build/shipped_pages.json'), 'utf8');
  const extras = fs.readFileSync(path.join(repo, '13_Faculty_Resources/_automation/site_build/site_extras.py'), 'utf8');
  assert.doesNotMatch(shipped, /epa-micro/);
  assert.doesNotMatch(extras, /epa-micro/);
});
