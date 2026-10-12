// PR B of the Care aftercare packet: state, add buttons, bulk add, tray and review gate, revised for the owner's
// directions (Revision 2): listing eligibility, unit profiles, a Clear that empties everything, the separate wallet card.
// Every test names the production change that would make it fail. The module is loaded the way the
// shell loads it (concatenated source), with `sessionStorage` and the build-injected payload bound as parameters so the
// PRODUCTION defaults (no storage argument, the injected `FD_CARE_INSERTS` global) are the paths under test.
//
// The payload is the REAL build payload (python3 against care_inserts_payload.py, as the sheet test builds it), and every
// crisis number is read from the governed crisis_resources.json at run time: none is typed in this file.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const base = '../13_Faculty_Resources/_automation/site_build/frontdoor/';
const read = name => {
  const url = new URL(base + name, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
};
const PACKET = read('fd_care_packet.js');
const SHEET = read('fd_care_packet_sheet.js');
const EXPORTS = `;return typeof fdCarePacketNormalize === 'function' ? {
  controls: typeof fdCarePacketControls === 'function' ? fdCarePacketControls : null,
  blocker: typeof fdCarePacketBlocker === 'function' ? fdCarePacketBlocker : null,
  sheet: typeof fdCarePacketSheet === 'function' ? fdCarePacketSheet : null,
  FD_PAYLOAD_DEFAULT: typeof FD_CARE_INSERTS === 'undefined' ? undefined : FD_CARE_INSERTS,
  enabled: fdCarePacketEnabled, LIMIT: FD_CARE_PACKET_LIMIT, SUGGEST: FD_CARE_PACKET_SUGGEST, KEY: FD_CARE_PACKET_KEY,
  blank: fdCarePacketBlank, normalize: fdCarePacketNormalize, load: fdCarePacketLoad, save: fdCarePacketSave,
  ids: fdCarePacketIds, toggle: fdCarePacketToggle, addMany: fdCarePacketAddMany, move: fdCarePacketMove,
  remove: fdCarePacketRemove, canPrint: fdCarePacketCanPrint, context: fdCarePacketContext,
  button: fdCarePacketButton, bulk: fdCarePacketBulk, tray: fdCarePacketTray, create: fdCreateCarePacket,
  validate: fdCareDirectoryValidate, search: fdCareDirectorySearch, results: fdCareDirectoryResults,
  shell: fdCareSearch, createDirectory: fdCreateCareDirectory,
  displayOrder: typeof fdCarePacketDisplayOrder === 'function' ? fdCarePacketDisplayOrder : null,
  held: typeof fdCarePacketHeld === 'function' ? fdCarePacketHeld : null,
  hasState: typeof fdCarePacketHasState === 'function' ? fdCarePacketHasState : null,
  copy: typeof fdCarePacketCopy === 'function' ? fdCarePacketCopy : null,
  eligibility: typeof fdCarePacketEligibility === 'function' ? fdCarePacketEligibility : null,
  reasonText: typeof fdCarePacketReasonText === 'function' ? fdCarePacketReasonText : null,
  INSERTS: typeof FD_CARE_PACKET_INSERTS === 'undefined' ? null : FD_CARE_PACKET_INSERTS
} : null;`;
// The shell's order: fd_data (fdEsc), the packet, the sheet it prints with, the search that hosts it. `FD_CARE_INSERTS`
// is the build-injected payload; passed as a parameter so the PRODUCTION default (the global) is the path under test.
// `after` is in-memory test code run after the sheet's definitions (nothing on disk is changed).
const moduleSource = (source = PACKET, after = '') => read('fd_data.js') + source + SHEET + after + read('fd_care_search.js') + EXPORTS;
const load = (source = PACKET, storage = undefined, payload = null, after = '') =>
  new Function('sessionStorage', 'FD_CARE_INSERTS', moduleSource(source, after))(storage, payload);
const P = load();

// ---- the real build payload, the test-only unit profile and the governed crisis numbers ------------------------------
const REPO = fileURLToPath(new URL('..', import.meta.url));
const AUTOMATION = path.join(REPO, '13_Faculty_Resources/_automation');
const SITE_BUILD = path.join(AUTOMATION, 'site_build');
const built = spawnSync('python3', ['-B', '-c', `import json, sys\nsys.path.insert(0, ${JSON.stringify(AUTOMATION)})\n` +
  `sys.path.insert(0, ${JSON.stringify(SITE_BUILD)})\nimport care_inserts_payload as p\nprint(json.dumps(p.build_payload()))`],
{ cwd: SITE_BUILD, encoding: 'utf8' });
assert.equal(built.status, 0, built.stderr);
const PAYLOAD = JSON.parse(built.stdout);
const clone = value => JSON.parse(JSON.stringify(value));
const UI = { payload: PAYLOAD };
const FIXTURE = JSON.parse(readFileSync(path.join(REPO, 'tests/fixtures/care-unit-profile.json'), 'utf8'));
const WITH_PROFILE = { ...clone(PAYLOAD), unitProfiles: [FIXTURE.profile, FIXTURE.expired] };
const GOVERNED = JSON.parse(readFileSync(path.join(REPO, 'crisis_resources.json'), 'utf8'));
const digitRuns = text => (String(text).match(/\d(?:[\d\-\s().]*\d)?/g) || []).map(t => t.replace(/\D/g, ''));
// A governed line written as a full phone number, and one written as a short code: whichever they are today.
const LONG_LINE = GOVERNED.resources.find(r => digitRuns(r.contact).some(d => d.length >= 10));
const SHORT_LINE = GOVERNED.resources.find(r => digitRuns(r.contact).some(d => d.length >= 3 && d.length <= 6));
assert.ok(LONG_LINE && SHORT_LINE, 'the governed record has a full-number line and a short-code line');
const LONG_DIGITS = digitRuns(LONG_LINE.contact).find(d => d.length >= 10);
// An independent escaper for oracles (the module's fdEsc is part of what is under test).
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const store = () => {
  const m = new Map();
  return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
};
const categoryIds = ['aftercare', 'crisis', 'peer_support', 'basic_needs', 'community_services', 'housing_shelters', 'recovery_meetings', 'telehealth_providers'];
const row = (n, more = {}) => ({ id: 'a' + n, category: 'aftercare', name: 'Support ' + n, description: 'Counseling', details: 'Adults',
  area: 'York', regions: ['Southern Maine'], phone: '207-700-0123', contactHref: 'tel:2077000123', website: 'https://example.org/',
  verifiedDate: '2026-10-01', reviewAfter: '2027-03-30', verificationRequired: false, ...more });
const feed = records => ({ schemaVersion: 1, generatedAt: '2026-10-12T00:00:00Z', sourceHash: 'a'.repeat(64),
  categories: categoryIds.map(id => ({ id, label: id === 'peer_support' ? 'Peer support' : id, available: true, count: records.filter(r => r.category === id).length })),
  regionOptions: ['Statewide', 'Southern Maine', 'NH'], records });
const dataOf = (count, more = () => ({})) => P.validate(feed(Array.from({ length: count }, (_, i) => row(i, more(i)))));
const idsOf = n => Array.from({ length: n }, (_, i) => 'a' + i);
const gateOn = { verification: true, region: true, identifiers: true, supervisor: true };
const GATE_OFF = { verification: false, region: false, identifiers: false, supervisor: false };
// One listing for each reason a listing cannot go in the packet, two that can on one contact alone, and two plain ones.
const MIXED = () => [
  row(0), row(1),
  row(2, { category: 'crisis' }),
  row(3, { contactHref: 'tel:' + LONG_DIGITS }),
  row(4, { name: 'Support 4 ' + SHORT_LINE.contact }),
  row(5, { phone: LONG_LINE.contact }),
  row(6, { contactHref: '', website: '' }),
  row(7, { contactHref: '', phone: '' }),
  row(8, { website: '' }),
];
// a3: the feed's own dial link is a crisis line; a4: its name carries one; a5: its listed phone is one.
const REASON = { a2: 'CRISIS_CATEGORY', a3: 'CRISIS_NUMBER', a4: 'CRISIS_NUMBER', a5: 'CRISIS_NUMBER', a6: 'NO_CONTACT' };
const CODES = ['PAYLOAD', 'CRISIS_CATEGORY', 'CRISIS_NUMBER', 'NO_CONTACT'];
const cardButtonOf = html => (/<button[^>]*data-fd-care-packet-card-print[^>]*>/.exec(html) || [''])[0];
const cardNoteOf = html => {
  const m = /<p class="fd-care-packet__note" id="fd-care-packet-card-note" data-fd-care-packet-card-note>([^<]*)<\/p>/.exec(html);
  return m ? m[1] : null;
};
// Just enough browser for the print lifecycle: a body and head to put nodes in, a title, the print call and its two events.
// Handed to the module as parameters, so no global is touched and no other test can see it.
function fakeBrowser() {
  const handlers = {};
  const holder = () => {
    const box = { children: [], appendChild(node) { node.parentNode = box; box.children.push(node); return node; },
      removeChild(node) { node.parentNode = null; box.children = box.children.filter(n => n !== node); return node; } };
    return box;
  };
  const body = holder(), head = holder(), marks = new Set();
  body.classList = { add: name => marks.add(name), remove: name => marks.delete(name) };
  const doc = { title: 'Home', body, head, activeElement: null, querySelector: () => null,
    createElement: () => ({ parentNode: null, id: '', className: '', innerHTML: '', textContent: '' }) };
  const win = { printed: 0, print() { win.printed += 1; },
    addEventListener: (type, fn) => { handlers[type] = fn; }, removeEventListener: type => { delete handlers[type]; } };
  return { handlers, doc, win, body, head, marks };
}
const loadInBrowser = env =>
  new Function('sessionStorage', 'FD_CARE_INSERTS', 'document', 'window', moduleSource())(undefined, null, env.doc, env.win);
const FIXED_LAYOUT = { verify: false, measure: units => ({ heights: units.map(() => 90), capacity: 880 }) };

test('the module exists and the gate is OFF in the shipped source (production default)', () => {
  assert.ok(P, 'fd_care_packet.js exists and exports the packet API');
  assert.equal(P.enabled(), false);
  assert.equal(PACKET.split('var FD_CARE_PACKET_ENABLED=false;').length, 2, 'exactly one literal flag, so the test fixture can flip it');
  assert.equal(P.LIMIT, 12);
  assert.equal(P.SUGGEST, 8);
  assert.equal(P.KEY, 'fd_care_packet_v1');
});

test('normalize keeps only a well-formed packet and never trusts storage', () => {
  assert.deepEqual(P.normalize(null), P.blank());
  assert.deepEqual(P.normalize('x'), P.blank());
  const dirty = P.normalize({ ids: ['a1', 'a1', 7, '', null, 'a2', 'x'.repeat(200)], why: { a1: 'free text' }, inserts: { callback: true, bad: 'yes' }, mode: 'sideways' });
  assert.deepEqual(dirty.ids, ['a1', 'a2']);
  assert.deepEqual(dirty.why, {}, 'the why-line is held until MaineHealth approval (HANDOFF Q3)');
  assert.deepEqual(dirty.inserts, { callback: true });
  assert.equal(dirty.mode, 'review');
  assert.equal(P.normalize({ ids: idsOf(40) }).ids.length, 12, 'a hand-edited key cannot exceed the cap');
  assert.equal(P.normalize({ mode: 'final' }).mode, 'final');
});

test('load survives corrupt JSON and a storage that throws', () => {
  const s = store();
  s.m.set(P.KEY, '{not json');
  assert.deepEqual(P.load(s), P.blank());
  assert.deepEqual(P.load({ getItem() { throw new Error('blocked'); } }), P.blank());
  assert.deepEqual(P.load(undefined), P.blank());
});

test('save writes exactly one session key, removes it when the packet empties, and survives a full or blocked store', () => {
  const s = store();
  P.save(s, { ...P.blank(), ids: ['a1'] });
  assert.deepEqual([...s.m.keys()], ['fd_care_packet_v1']);
  assert.deepEqual(JSON.parse(s.m.get(P.KEY)).ids, ['a1']);
  P.save(s, P.blank());
  assert.equal(s.m.size, 0, 'an empty packet leaves no residue in the tab');
  assert.doesNotThrow(() => P.save({ setItem() { throw new Error('quota'); }, removeItem() { throw new Error('x'); } }, { ...P.blank(), ids: ['a1'] }));
});

test('toggle adds, removes, refuses unknown ids and refuses to exceed the cap', () => {
  const data = dataOf(14);
  let st = P.blank();
  const r = P.toggle(st, 'a3', data, PAYLOAD);
  assert.equal(r.result, 'added');
  assert.deepEqual(r.state.ids, ['a3']);
  assert.equal(P.toggle(r.state, 'a3', data, PAYLOAD).result, 'removed');
  assert.equal(P.toggle(st, 'not-in-directory', data, PAYLOAD).result, 'unknown');
  st = P.addMany(st, idsOf(12), data, PAYLOAD).state;
  assert.equal(P.toggle(st, 'a13', data, PAYLOAD).result, 'full');
  assert.equal(P.toggle(st, 'a0', data, PAYLOAD).result, 'removed', 'a full packet still lets you take one out');
  assert.equal(st.ids.length, 12, 'toggle never mutates its input');
});

test('addMany adds min(N-k, 12-current), reports what it skipped, and never duplicates', () => {
  const data = dataOf(20);
  const st = P.addMany(P.blank(), ['a0', 'a1', 'a2'], data, PAYLOAD).state;
  const r = P.addMany(st, idsOf(20), data, PAYLOAD);
  assert.equal(r.added, 9);
  assert.equal(r.already, 3);
  assert.equal(r.skipped, 8);
  assert.equal(r.ineligible, 0, 'every listing here can go in the packet');
  assert.equal(r.state.ids.length, 12);
  assert.equal(new Set(r.state.ids).size, 12);
  assert.deepEqual(r.state.ids.slice(0, 3), ['a0', 'a1', 'a2'], 'existing order is kept, new ones append in result order');
  const room = P.addMany(P.blank(), ['a0', 'zzz', 'a1'], data, PAYLOAD);
  assert.equal(room.added, 2);
  assert.equal(room.skipped, 0, 'an id the directory does not list is ignored, not counted as a full-packet skip');
  assert.equal(room.ineligible, 0, 'nor counted as ineligible');
});

test('ids() is filtered through the CURRENT directory so a stale id never renders', () => {
  const data = dataOf(5);
  const st = { ...P.blank(), ids: ['a4', 'gone', 'a1'] };
  assert.deepEqual(P.ids(st, data), ['a4', 'a1']);
  assert.deepEqual(P.ids(st, null), []);
});

test('move reorders only within a category and stops at the edges; remove drops one', () => {
  const data = P.validate(feed([row(1), row(2, { category: 'peer_support' }), row(3), row(4, { category: 'peer_support' })]));
  const st = { ...P.blank(), ids: ['a1', 'a2', 'a3', 'a4'] };
  assert.deepEqual(P.move(st, 'a3', -1, data).ids, ['a3', 'a2', 'a1', 'a4'], 'a3 swaps with the aftercare item above it, skipping peer support');
  assert.deepEqual(P.move(st, 'a1', -1, data).ids, st.ids, 'already first in its category');
  assert.deepEqual(P.move(st, 'a4', 1, data).ids, st.ids, 'already last in its category');
  assert.deepEqual(P.remove(st, 'a2').ids, ['a1', 'a3', 'a4']);
});

test('printing is allowed only when all four review checks are ticked AND the packet has a live listing', () => {
  const data = dataOf(3);
  const st = { ...P.blank(), ids: ['a1'] };
  assert.equal(P.canPrint(st, data, gateOn), true);
  for (const k of Object.keys(gateOn)) assert.equal(P.canPrint(st, data, { ...gateOn, [k]: false }), false, k);
  assert.equal(P.canPrint(P.blank(), data, gateOn), false, 'empty packet');
  assert.equal(P.canPrint({ ...P.blank(), ids: ['gone'] }, data, gateOn), false, 'only stale ids');
  assert.equal(P.canPrint(st, data, undefined), false);
  assert.equal(P.canPrint(st, data, { ...gateOn, supervisor: 'yes' }), false, 'strict true, not truthy');
});

test('the add button toggles by id, announces state with aria-pressed, and is disabled only when full and not in', () => {
  // The hostile name is a real directory row: a listing the directory does not carry gets no button at all now.
  const data = P.validate(feed([...Array.from({ length: 14 }, (_, i) => row(i)), row('x', { name: '<img src=x onerror=alert(1)>' })]));
  const idle = P.context({ ...P.blank(), ids: ['a1'] }, data, PAYLOAD);
  const off = P.button(data.records[0], idle);
  assert.match(off, /data-fd-care-packet="a0"/);
  assert.match(off, /aria-pressed="false"/);
  assert.doesNotMatch(off, /disabled/);
  assert.match(P.button(data.records[1], idle), /aria-pressed="true"/);
  const full = P.context({ ...P.blank(), ids: idsOf(12) }, data, PAYLOAD);
  assert.match(P.button(data.records[13], full), /disabled/);
  assert.doesNotMatch(P.button(data.records[3], full), /disabled/, 'a packed listing can still be removed when the packet is full');
  assert.match(off, />Add to packet</, 'the visible label never changes, so the accessible name always contains it');
  const tricky = P.button(data.records[14], idle);
  assert.match(tricky, /data-fd-care-packet="ax"/, 'precondition: the hostile row is offered, so its name is written');
  assert.doesNotMatch(tricky, /<img/);
  assert.match(tricky, /&lt;img/);
});

test('bulk buttons count only listings not already packed, across all pages, and disable when nothing can be added', () => {
  const data = dataOf(20);
  const result = P.search(data, 'support', '', '', 1);
  const none = P.bulk(result, P.context(P.blank(), data, PAYLOAD));
  assert.match(none, /Add this page \(5\)/);
  assert.match(none, /Add all results \(20\)/);
  const some = P.bulk(result, P.context({ ...P.blank(), ids: ['a0', 'a1', 'a19'] }, data, PAYLOAD));
  assert.match(some, /Add this page \(3\)/);
  assert.match(some, /Add all results \(17\)/);
  const full = P.bulk(result, P.context({ ...P.blank(), ids: idsOf(12) }, data, PAYLOAD));
  assert.equal((full.match(/disabled/g) || []).length, 2, 'both bulk buttons are disabled when the packet is full');
  assert.equal(P.bulk(P.search(data, '', '', '', 1), P.context(P.blank(), data, PAYLOAD)), '', 'hidden while idle');
  assert.equal(P.bulk(P.search(data, 'nothing-matches-this', '', '', 1), P.context(P.blank(), data, PAYLOAD)), '', 'hidden with zero results');
});

test('results carry add buttons and is-packed ONLY when a packet context is passed (flag-off output is unchanged)', () => {
  const data = dataOf(7);
  const result = P.search(data, 'support', '', '', 1);
  const without = P.results(data, result, '2026-10-12');
  assert.doesNotMatch(without, /data-fd-care-packet|is-packed|fd-care-search__pack|fd-care-search__bulk/);
  assert.equal(P.results(data, result, '2026-10-12', undefined), without);
  const ctx = P.context({ ...P.blank(), ids: ['a1'] }, data, PAYLOAD);
  const withCtx = P.results(data, result, '2026-10-12', ctx);
  assert.equal((withCtx.match(/data-fd-care-packet="a\d"/g) || []).length, 5, 'one add button per row on the page');
  assert.equal((withCtx.match(/<article class="is-packed">/g) || []).length, 1);
  assert.match(withCtx, /fd-care-search__packed/);
  assert.ok(withCtx.indexOf('fd-care-search__bulk') < withCtx.indexOf('<ol'), 'bulk bar sits in the results bar, above the list');
});

test('search results expose every matching id so "Add all results" means all pages, not the current one', () => {
  const data = dataOf(20);
  const result = P.search(data, 'support', '', '', 2);
  assert.equal(result.rows.length, 5);
  assert.equal(result.allIds.length, 20);
  assert.equal(P.search(data, '', '', '', 1).allIds.length, 0);
});

test('the tray is empty-state safe, grouped by category, escaped, and nudges at 9 and stops at 12', () => {
  const data = P.validate(feed([row(1), row(2, { category: 'peer_support', name: '<script>alert(1)</script>' }), row(3)]));
  const empty = P.tray(P.blank(), data, {}, UI);
  assert.match(empty, /No listings yet/);
  assert.doesNotMatch(empty, /data-fd-care-packet-clear/, 'nothing saved, nothing to clear');
  const html = P.tray({ ...P.blank(), ids: ['a1', 'a2', 'a3'] }, data, {}, UI);
  assert.doesNotMatch(html, /data-fd-care-packet-ineligible/, 'precondition: every listing here can print');
  assert.match(html, /Aftercare packet[\s\S]*>3</);
  assert.ok(html.indexOf('>aftercare<') < html.indexOf('>Peer support<'), 'groups follow the directory category order');
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /data-fd-care-packet-up="a1"[^>]*disabled/);
  assert.match(html, /data-fd-care-packet-down="a3"[^>]*disabled/);
  assert.match(html, /data-fd-care-packet-remove="a2"/);
  assert.match(html, /data-fd-care-packet-clear/);
  assert.doesNotMatch(html, /full at 12|hard to read/);
  const big = dataOf(14);
  assert.match(P.tray({ ...P.blank(), ids: idsOf(9) }, big, {}, UI), /Eight or fewer/);
  assert.match(P.tray({ ...P.blank(), ids: idsOf(12) }, big, {}, UI), /full at 12/);
});

test('the review gate has four unticked-by-default checks and reports readiness; Print and Copy live in the preview, never in the tray', () => {
  const data = dataOf(3);
  const st = { ...P.blank(), ids: ['a1'] };
  const html = P.tray(st, data, {}, UI);
  for (const k of ['verification', 'region', 'identifiers', 'supervisor']) assert.match(html, new RegExp('data-fd-care-packet-gate="' + k + '"'));
  assert.equal((html.match(/type="checkbox"/g) || []).length, 4);
  assert.doesNotMatch(html, /checked/);
  assert.match(html, /data-fd-care-packet-ready="false"/);
  const ready = P.tray(st, data, gateOn, UI);
  assert.equal((ready.match(/ checked/g) || []).length, 4);
  assert.match(ready, /data-fd-care-packet-ready="true"/);
  assert.doesNotMatch(html + ready, /data-fd-care-packet-print|data-fd-care-packet-copy/, 'Print and Copy sit beside the reason they are unavailable, in the preview, not in the tray');
  assert.match(P.tray(P.blank(), data, gateOn, UI), /data-fd-care-packet-ready="false"/, 'an empty packet is never ready');
});

test('the search panel gets a tray mount only when the packet flag is on', () => {
  const off = P.shell({ careResources: [] });
  assert.doesNotMatch(off, /data-fd-care-packet/);
  const on = load(PACKET.replace('var FD_CARE_PACKET_ENABLED=false;', 'var FD_CARE_PACKET_ENABLED=true;')).shell({ careResources: [] });
  assert.match(on, /data-fd-care-packet-tray/);
  assert.ok(on.indexOf('data-care-directory-results') < on.indexOf('data-fd-care-packet-tray'), 'the tray sits after the results, outside the results mount');
});

test('the controller persists to the real session key, shares state across instances, and keeps it when you leave Care', () => {
  const s = store();
  const data = dataOf(6);
  const c = P.create({ storage: s, payload: PAYLOAD });
  c.mount(null, null, () => data);
  assert.equal(c.toggle('a2'), 'added');
  assert.deepEqual(JSON.parse(s.m.get('fd_care_packet_v1')).ids, ['a2']);
  c.leave();
  const again = P.create({ storage: s, payload: PAYLOAD });
  again.mount(null, null, () => data);
  assert.deepEqual(again.ids(), ['a2'], 'tab-scoped by design: leaving Care does not clear the packet');
  assert.equal(c.mode, 'review');
  assert.deepEqual(again.addMany(idsOf(6)), { added: 5, already: 1, skipped: 0, ineligible: 0 });
  again.clear();
  assert.equal(s.m.size, 0);
});

test('PRODUCTION default: with no storage or payload argument the controller uses the page sessionStorage and the injected payload', () => {
  const s = store();
  const c = load(PACKET, s, PAYLOAD).create();
  c.mount(null, null, () => dataOf(3));
  assert.equal(c.toggle('a1'), 'added', 'the injected FD_CARE_INSERTS global is the payload the eligibility rule reads');
  assert.deepEqual([...s.m.keys()], ['fd_care_packet_v1']);
  const none = store();
  const without = load(PACKET, none, null).create();
  without.mount(null, null, () => dataOf(3));
  assert.equal(without.toggle('a1'), 'ineligible', 'no injected payload: nothing can be added (fail closed)');
  assert.equal(none.m.size, 0);
  assert.doesNotThrow(() => load(PACKET, undefined).create().mount(null, null, () => dataOf(3)), 'no sessionStorage at all must degrade, not throw');
});

test('the gate resets when you leave Care, and changing it never touches storage', () => {
  const s = store();
  const data = dataOf(3);
  const c = P.create({ storage: s, payload: PAYLOAD });
  c.mount(null, null, () => data);
  c.toggle('a1');
  const before = s.m.get('fd_care_packet_v1');
  c.setGate('verification', true);
  c.setGate('region', true);
  assert.equal(s.m.get('fd_care_packet_v1'), before);
  assert.equal(c.gate().verification, true);
  assert.equal(c.setGate('nonsense', true), false, 'unknown gate keys are ignored');
  c.leave();
  assert.deepEqual(c.gate(), { verification: false, region: false, identifiers: false, supervisor: false });
});

test('the packet module makes no network or persistence call beyond sessionStorage and uses only ES5', () => {
  for (const banned of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /localStorage/, /document\.cookie/, /\bhistory\./, /location\.(?:href|hash|search)\s*=/, /geolocation/,
    /WebSocket/, /EventSource/, /indexedDB/, /openDatabase/, /\bcaches\./]) {
    assert.doesNotMatch(PACKET, banned, String(banned));
  }
  for (const es6 of [/=>/, /\blet\s/, /\bconst\s/, /`/, /\bclass\s+\w/, /\.\.\./, /\bPromise\b/]) {
    assert.doesNotMatch(PACKET, es6, 'ES5 only: ' + es6);
  }
  assert.match(PACKET, /fdEsc\(/, 'every interpolation goes through fdEsc');
});

// ---- Review findings (independent review of this PR): each test failed before its fix ----

const fakeLive = () => ({ textContent: '' });
const fakeButton = attrs => ({ hasAttribute: k => Object.prototype.hasOwnProperty.call(attrs, k), getAttribute: k => attrs[k] });
const settle = () => new Promise(resolve => setTimeout(resolve, 260));

test('the review confirmations are bound to the packet: adding or clearing resets them, an empty packet cannot be confirmed', () => {
  const data = dataOf(8);
  const confirm = c => { for (const k of Object.keys(gateOn)) c.setGate(k, true); };
  const c = P.create({ storage: store(), payload: PAYLOAD });
  c.mount(null, null, () => data);
  assert.equal(c.setGate('verification', true), false, 'nothing to confirm while the packet is empty');
  assert.equal(c.gate().verification, false);
  c.toggle('a1');
  confirm(c);
  assert.deepEqual(c.gate(), gateOn);
  c.toggle('a2');
  assert.deepEqual(c.gate(), { verification: false, region: false, identifiers: false, supervisor: false }, 'a new listing was never confirmed');
  confirm(c);
  c.addMany(['a3', 'a4']);
  assert.equal(c.gate().supervisor, false, 'bulk add resets too');
  confirm(c);
  c.clear();
  assert.equal(c.gate().verification, false, 'clear resets');
  c.addMany(['a5']);
  assert.equal(c.gate().verification, false, 'and the old confirmations do not come back');
  confirm(c);
  c.addMany(['a5']);
  assert.equal(c.gate().verification, true, 'adding nothing new leaves the confirmations alone');
  c.move('a5', -1);
  assert.equal(c.gate().verification, true, 'reordering adds no unconfirmed listing');
  c.remove('a5');
  assert.equal(c.gate().verification, true, 'removing adds no unconfirmed listing');
});

test('the confirmation boxes are disabled while the packet is empty and there is no live-region on the readiness line', () => {
  const data = dataOf(3);
  const empty = P.tray(P.blank(), data, {}, UI);
  assert.equal((empty.match(/type="checkbox"[^>]*disabled/g) || []).length, 4);
  const filled = P.tray({ ...P.blank(), ids: ['a1'] }, data, {}, UI);
  assert.doesNotMatch(filled, /type="checkbox"[^>]*disabled/);
  assert.doesNotMatch(filled + empty, /role="status"/, 'a status region re-inserted on every repaint is announced unreliably and competes with the shared announcer');
});

test('announcements wait for focus to settle, carry the packet count, and say when confirmations were cleared', async () => {
  const data = dataOf(6);
  const live = fakeLive();
  const c = P.create({ storage: store(), payload: PAYLOAD });
  c.mount(null, live, () => data);
  c.toggle('a1');
  assert.equal(live.textContent, '', 'not written in the same task as the DOM change');
  await settle();
  assert.match(live.textContent, /Added Support 1 to the packet\. 1 listing in packet\./);
  for (const k of Object.keys(gateOn)) c.setGate(k, true);
  c.toggle('a2');
  await settle();
  assert.match(live.textContent, /2 listings in packet\. Review confirmations cleared\./);
  c.remove('a2');
  await settle();
  assert.match(live.textContent, /Removed Support 2 from the packet\. 1 listing in packet\./);
  c.addMany(['a3', 'a4']);
  await settle();
  assert.match(live.textContent, /Added 2 listings\. 3 listings in packet\./);
  c.toggle('a1');
  c.toggle('a1');
  await settle();
  assert.match(live.textContent, /Added Support 1/, 'only the last of two quick messages is spoken');
  c.leave();
});

test('a message queued before leaving Care never lands afterwards, and readiness changes are announced', async () => {
  const data = dataOf(3);
  const live = fakeLive();
  const c = P.create({ storage: store(), payload: PAYLOAD });
  c.mount(null, live, () => data);
  c.toggle('a1');
  c.leave();
  await settle();
  assert.equal(live.textContent, '');
  const again = fakeLive();
  const d = P.create({ storage: store(), payload: PAYLOAD });
  d.mount(null, again, () => data);
  d.toggle('a1');
  await settle();
  for (const k of Object.keys(gateOn)) d.setGate(k, true);
  await settle();
  assert.equal(again.textContent, 'Review complete.');
  d.setGate('region', false);
  await settle();
  assert.match(again.textContent, /incomplete/i);
});

test('Remove hands focus to the next item ON SCREEN (category order), not the next in storage order', () => {
  const data = P.validate(feed([row(1), row(2, { category: 'peer_support' }), row(3)]));
  const order = P.displayOrder({ ...P.blank(), ids: ['a1', 'a2', 'a3'] }, data);
  assert.deepEqual(order, ['a1', 'a3', 'a2'], 'aftercare group first, then peer support, each in packet order');
  const c = P.create({ storage: store(), payload: PAYLOAD });
  c.mount(null, null, () => data);
  c.addMany(['a1', 'a2', 'a3']);
  const hit = c.handleClick(fakeButton({ 'data-fd-care-packet-remove': 'a1' }));
  assert.deepEqual(hit, { attr: 'data-fd-care-packet-remove', id: 'a3' }, 'a3 is the next row under a1; a2 is in another group');
  const last = c.handleClick(fakeButton({ 'data-fd-care-packet-remove': 'a2' }));
  assert.equal(last.id, 'a3', 'removing the last row falls back to the previous one on screen');
});

test('a PARTIAL directory never destroys saved listings; a complete one drops listings it no longer carries', () => {
  const full = P.validate(feed([row(1), row(2), row(3)]));
  const partial = { ...full, records: full.records.filter(r => r.id !== 'a2'), partial: true };
  const st = { ...P.blank(), ids: ['a1', 'a2'] };
  const withPartial = P.toggle(st, 'a3', partial, PAYLOAD);
  assert.deepEqual(withPartial.state.ids, ['a1', 'a2', 'a3'], 'a2 is hidden, not gone: its category may simply not have loaded');
  assert.deepEqual(P.addMany(st, ['a3'], partial, PAYLOAD).state.ids, ['a1', 'a2', 'a3']);
  const complete = { ...partial, partial: false };
  assert.deepEqual(P.toggle(st, 'a3', complete, PAYLOAD).state.ids, ['a1', 'a3'], 'a complete feed that lacks a2 means a2 is stale');
  assert.equal(P.held(st, partial), 2, 'hidden listings still hold their slots while the feed is partial');
  assert.equal(P.held(st, complete), 1);
  assert.match(P.tray(st, partial, {}, UI), /1 saved listing is hidden while the directory is incomplete/);
  assert.doesNotMatch(P.tray(st, complete, {}, UI), /hidden while/);
});

test('hidden listings count toward the cap so a partial feed cannot push a stored packet past 12', () => {
  const full = dataOf(20);
  const partial = { ...full, records: full.records.filter(r => Number(r.id.slice(1)) >= 10), partial: true };
  const st = { ...P.blank(), ids: idsOf(10) };
  const r = P.addMany(st, ['a10', 'a11', 'a12', 'a13'], partial, PAYLOAD);
  assert.equal(r.state.ids.length, 12);
  assert.equal(r.added, 2);
  assert.equal(r.skipped, 2);
  assert.equal(P.toggle(r.state, 'a14', partial, PAYLOAD).result, 'full');
  assert.equal(P.context(r.state, partial, PAYLOAD).full, true);
});

test('stored insert switches are limited to the known inserts, so no stored key can shadow a built-in', () => {
  const dirty = P.normalize({ inserts: { constructor: true, prototype: true, hasownproperty: true, callback: false, meds: true, bogus: true } });
  assert.deepEqual(dirty.inserts, { callback: false, meds: true });
});

test('only the literal true opens the gate; no URL, storage or cookie value can', () => {
  const anyKey = () => ({ getItem: () => '1', setItem() {}, removeItem() {} });
  const loc = { search: '?tab=care&packet=1', hash: '#packet', href: 'https://x/?packet=1#packet' };
  const gate = src => new Function('sessionStorage', 'localStorage', 'location', 'window', 'document',
    read('fd_data.js') + src + ';return fdCarePacketEnabled();')(anyKey(), anyKey(), loc, { location: loc, sessionStorage: anyKey() }, { cookie: 'packet=1' });
  assert.equal(gate(PACKET), false);
  assert.equal(gate(PACKET.replace('var FD_CARE_PACKET_ENABLED=false;', 'var FD_CARE_PACKET_ENABLED="true";')), false, 'truthy is not true');
  assert.equal(gate(PACKET.replace('var FD_CARE_PACKET_ENABLED=false;', 'var FD_CARE_PACKET_ENABLED=true;')), true);
});

test('ids and category labels from the feed are escaped everywhere they are written into markup', () => {
  const hostile = '"><img src=x onerror=alert(1)>';
  const data = P.validate({ ...feed([row(1, { id: hostile }), row(2, { category: 'peer_support' })]),
    categories: categoryIds.map(id => ({ id, label: id === 'aftercare' ? '<b onmouseover=1>Aftercare</b>' : id, available: true, count: id === 'aftercare' || id === 'peer_support' ? 1 : 0 })) });
  const st = { ...P.blank(), ids: [hostile, 'a2'] };
  const html = P.tray(st, data, {}, UI) + P.button(data.records[0], P.context(st, data, PAYLOAD)) +
    P.results(data, P.search(data, 'support', '', '', 1), '2026-10-12', P.context(st, data, PAYLOAD));
  assert.doesNotMatch(html, /<img|<b /);
  assert.match(html, /&lt;b onmouseover=1&gt;Aftercare/);
  assert.match(html, /data-fd-care-packet="&quot;&gt;&lt;img/);
});

test('single adds reach the cap at exactly 12, refuse the 13th, and the 12th still shows as full', () => {
  const data = dataOf(14);
  let st = P.blank();
  for (let i = 0; i < 12; i++) {
    const r = P.toggle(st, 'a' + i, data, PAYLOAD);
    assert.equal(r.result, 'added', 'add #' + (i + 1));
    st = r.state;
  }
  assert.equal(P.toggle(st, 'a12', data, PAYLOAD).result, 'full');
  assert.equal(P.context(st, data, PAYLOAD).full, true);
  assert.equal(P.context({ ...P.blank(), ids: idsOf(11) }, data, PAYLOAD).full, false);
});

test('the nudge starts at 9 and not at 8; bulk buttons disable at (0) even when the packet is not full', () => {
  const data = dataOf(20);
  assert.doesNotMatch(P.tray({ ...P.blank(), ids: idsOf(8) }, data, {}, UI), /Eight or fewer/);
  assert.match(P.tray({ ...P.blank(), ids: idsOf(9) }, data, {}, UI), /Eight or fewer/);
  const result = P.search(data, 'support', '', '', 1);
  const pagePacked = P.bulk(result, P.context({ ...P.blank(), ids: result.rows.map(r => r.id) }, data, PAYLOAD));
  assert.match(pagePacked, /data-fd-care-packet-page disabled>Add this page \(0\)/);
  assert.doesNotMatch(pagePacked, /data-fd-care-packet-all disabled/);
});

test('up and down are disabled at the edge of each category group, not only at the ends of the whole list', () => {
  const data = P.validate(feed([row(1), row(2), row(3, { category: 'peer_support' }), row(4, { category: 'peer_support' })]));
  const html = P.tray({ ...P.blank(), ids: ['a1', 'a2', 'a3', 'a4'] }, data, {}, UI);
  assert.match(html, /data-fd-care-packet-up="a1"[^>]*disabled/);
  assert.match(html, /data-fd-care-packet-down="a2"[^>]*disabled/);
  assert.match(html, /data-fd-care-packet-up="a3"[^>]*disabled/);
  assert.doesNotMatch(html, /data-fd-care-packet-down="a1"[^>]*disabled/);
  assert.doesNotMatch(html, /data-fd-care-packet-up="a4"[^>]*disabled/);
});

test('a packed listing keeps the same visible label and says it is pressed', () => {
  const data = dataOf(3);
  const html = P.button(data.records[0], P.context({ ...P.blank(), ids: ['a0'] }, data, PAYLOAD));
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, />Add to packet</, 'never flips to "In packet", or voice control (WCAG 2.5.3) loses the name');
  assert.match(html, /aria-label="Add to packet: Support 0"/);
});

test('fd_care_search.js stays ES5 and network-free too (PR B extends it)', () => {
  const search = read('fd_care_search.js');
  for (const es6 of [/=>/, /\blet\s/, /\bconst\s/, /`/, /\bclass\s+\w/, /\.\.\./]) assert.doesNotMatch(search, es6, 'ES5 only: ' + es6);
  assert.equal((search.match(/\bfetch\s*\(/g) || []).length, 1, 'exactly the one fixed directory feed request');
  assert.doesNotMatch(search, /localStorage|sessionStorage|sendBeacon|XMLHttpRequest/);
});

test('the bulk bar really is emitted above the list (a missing bar can no longer pass)', () => {
  const data = dataOf(7);
  const html = P.results(data, P.search(data, 'support', '', '', 1), '2026-10-12', P.context(P.blank(), data, PAYLOAD));
  assert.ok(html.indexOf('fd-care-search__bulk') > -1);
  assert.ok(html.indexOf('fd-care-search__bulk') < html.indexOf('<ol'));
});

test('the gate is never read back from storage when the controller is created', () => {
  const s = store();
  s.m.set('fd_care_packet_v1', JSON.stringify({ ids: ['a1'], gate: gateOn, verification: true }));
  const c = P.create({ storage: s, payload: PAYLOAD });
  c.mount(null, null, () => dataOf(3));
  assert.deepEqual(c.gate(), { verification: false, region: false, identifiers: false, supervisor: false });
  assert.equal(c.toggle('a2'), 'added', 'precondition: the packet really was written');
  const written = JSON.parse(s.m.get('fd_care_packet_v1'));
  assert.equal(Object.keys(written).sort().join(), 'ids,inserts,mode,unit,why', 'only the five documented fields are ever written');
  assert.equal(Object.keys(written.unit).sort().join(), 'name,phone,profile', 'and the unit carries only its name, phone and profile id');
});

// ---- Revision 2 (the owner's directions): eligibility, a Clear that empties everything, unit profiles, the wallet card ----

test('eligibility gives one reason code per listing that cannot go in the packet, from the governed numbers and the feed\'s own link', () => {
  const data = P.validate(feed(MIXED()));
  assert.equal(data.partial, false, 'precondition: a complete feed');
  for (const r of data.records) assert.equal(P.eligibility(r, PAYLOAD), REASON[r.id] || '', r.id);
  for (const r of data.records) assert.equal(P.eligibility(r, null), 'PAYLOAD', r.id + ': without a usable payload nothing is offered');
  const texts = CODES.map(code => P.reasonText(code));
  for (const [i, text] of texts.entries()) assert.ok(text.trim(), CODES[i] + ' has a reason a trainee can read');
  assert.equal(new Set(texts).size, CODES.length, 'each reason says something different');
  assert.equal(P.reasonText('constructor'), '', 'an inherited key is not a reason');
  assert.equal(P.reasonText(''), '');
});

test('an ineligible listing never gets an add button: its row shows the plain-text reason instead, for every code', () => {
  const data = P.validate(feed(MIXED()));
  const ctx = P.context(P.blank(), data, PAYLOAD);
  assert.equal(ctx.payloadOk, true);
  assert.equal(typeof ctx.reason, 'function');
  assert.equal(ctx.reason('not-in-directory'), 'NO_CONTACT', 'an id the directory does not carry is never offered');
  for (const r of data.records) {
    const html = P.button(r, ctx), code = REASON[r.id];
    assert.equal(ctx.reason(r.id), code || '', r.id);
    if (!code) {
      assert.match(html, new RegExp('^<button type="button" class="fd-care-search__pack" data-fd-care-packet="' + r.id + '"'), r.id + ' can be added');
      assert.doesNotMatch(html, /ineligible/);
      continue;
    }
    assert.doesNotMatch(html, /<button|<a |data-fd-care-packet="/, r.id + ' offers no add control');
    assert.equal(html, '<p class="fd-care-search__ineligible" data-fd-care-packet-ineligible="' + code + '">Can’t be added to the packet: ' +
      esc(P.reasonText(code)) + '</p>', r.id + ' says why, as plain text');
  }
  // In the results list: an add button on each eligible row of the page, a reason on each of the others.
  const result = P.search(data, 'support', '', '', 1);
  const items = P.results(data, result, '2026-10-12', ctx).split('<li class="fd-care-search__result">').slice(1);
  assert.equal(items.length, result.rows.length);
  for (const [i, item] of items.entries()) {
    const id = result.rows[i].id;
    assert.equal((item.match(/data-fd-care-packet="/g) || []).length, REASON[id] ? 0 : 1, id);
    assert.equal((item.match(/data-fd-care-packet-ineligible="/g) || []).length, REASON[id] ? 1 : 0, id);
  }
});

test('the reason code and the reason text are escaped wherever the chooser and the tray write them', () => {
  const data = P.validate(feed(MIXED()));
  const noContact = data.records.find(r => r.id === 'a6');
  const odd = P.button(noContact, { ids: {}, full: false, payloadOk: true, reason: () => '"><img src=x onerror=alert(1)>' });
  assert.doesNotMatch(odd, /<img/);
  assert.match(odd, /data-fd-care-packet-ineligible="&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;"/);
  // The reason table is replaced in memory with markup, so the escaping is what keeps it text.
  const H = load(PACKET, undefined, null, ";FD_CARE_PACKET_REASONS.NO_CONTACT='<b onmouseover=1>none</b> & \"q\"';");
  const chooser = H.button(noContact, H.context(H.blank(), data, PAYLOAD));
  const tray = H.tray({ ...H.blank(), ids: ['a6'] }, data, {}, UI);
  for (const [label, html] of [['chooser', chooser], ['tray', tray]]) {
    assert.doesNotMatch(html, /<b /, label);
    assert.ok(html.includes('&lt;b onmouseover=1&gt;none&lt;/b&gt; &amp; &quot;q&quot;'), label + ' writes the reason as text');
  }
});

test('bulk buttons count eligible listings only, and a note says how many results cannot go in the packet', () => {
  const data = P.validate(feed(MIXED()));
  const result = P.search(data, 'support', '', '', 1);
  assert.equal(result.total, 9);
  assert.deepEqual(result.rows.map(r => r.id), ['a0', 'a1', 'a2', 'a3', 'a4'], 'precondition: page 1');
  const none = P.bulk(result, P.context(P.blank(), data, PAYLOAD));
  assert.match(none, /Add this page \(2\)/, 'a0 and a1 are the only eligible rows on the page');
  assert.match(none, /Add all results \(4\)/, 'a0, a1, a7 and a8 across all pages');
  assert.match(none, /<p class="fd-care-search__ineligible" data-fd-care-packet-ineligible-count>5 results can’t go in the packet and are not counted\.<\/p>/);
  const some = P.bulk(result, P.context({ ...P.blank(), ids: ['a0', 'a7'] }, data, PAYLOAD));
  assert.match(some, /Add this page \(1\)/);
  assert.match(some, /Add all results \(2\)/);
  const one = P.validate(feed([row(0), row(1), row(2, { category: 'crisis' })]));
  assert.match(P.bulk(P.search(one, 'support', '', '', 1), P.context(P.blank(), one, PAYLOAD)),
    /data-fd-care-packet-ineligible-count>1 result can’t go in the packet and is not counted\./);
  const clean = dataOf(7);
  assert.doesNotMatch(P.bulk(P.search(clean, 'support', '', '', 1), P.context(P.blank(), clean, PAYLOAD)), /ineligible/, 'no note when every result can go in');
  const blocked = P.validate(feed([row(0, { category: 'crisis' }), row(1, { contactHref: '', website: '' })]));
  const html = P.bulk(P.search(blocked, 'support', '', '', 1), P.context(P.blank(), blocked, PAYLOAD));
  assert.match(html, /data-fd-care-packet-page disabled>Add this page \(0\)/);
  assert.match(html, /data-fd-care-packet-all disabled>Add all results \(0\)/);
  assert.match(html, />2 results can’t go in the packet/);
});

test('an unusable payload: ONE reason above the results, no row repeats it, and nothing at all is offered', () => {
  const data = dataOf(7);
  const result = P.search(data, 'support', '', '', 1);
  const noName = clone(PAYLOAD);
  delete noName.contacts[PAYLOAD.required[0]].name;
  const unusable = [['none', null], ['missing', undefined], ['empty', {}], ['no crisis lines', { ...clone(PAYLOAD), crisis: [] }],
    ['no required lines', { ...clone(PAYLOAD), required: [] }], ['an official name missing', noName]];
  for (const [label, payload] of unusable) {
    const ctx = P.context({ ...P.blank(), ids: ['a1'] }, data, payload);
    assert.equal(ctx.payloadOk, false, label);
    const html = P.results(data, result, '2026-10-12', ctx);
    assert.equal((html.match(/data-fd-care-packet-ineligible="PAYLOAD"/g) || []).length, 1, label + ': said once');
    assert.equal((html.match(/data-fd-care-packet-ineligible/g) || []).length, 1, label + ': no row repeats it');
    assert.equal(html.split(esc(P.reasonText('PAYLOAD'))).length - 1, 1, label + ': the reason text appears once');
    assert.doesNotMatch(html, /data-fd-care-packet="|data-fd-care-packet-page|data-fd-care-packet-all/, label + ': nothing offered');
    assert.ok(html.indexOf('data-fd-care-packet-ineligible="PAYLOAD"') < html.indexOf('<ol'), label + ': above the list');
    assert.match(html, /<article class="is-packed">/, label + ': a saved listing still shows as in the packet');
  }
  // A context built without the eligibility rule fails closed the same way.
  const bare = { ids: {}, count: 0, full: false, payloadOk: true };
  assert.equal(P.button(data.records[0], bare), '');
  assert.match(P.bulk(result, bare), /^<p class="fd-care-search__ineligible" data-fd-care-packet-ineligible="PAYLOAD">/);
  assert.doesNotMatch(P.bulk(result, bare), /<button/);
});

test('toggle and addMany refuse an ineligible listing and report "ineligible"; one already packed is reported as already there', () => {
  const data = P.validate(feed(MIXED()));
  for (const id of Object.keys(REASON)) {
    const r = P.toggle(P.blank(), id, data, PAYLOAD);
    assert.equal(r.result, 'ineligible', id);
    assert.deepEqual(r.state.ids, [], id + ' is not added');
  }
  for (const payload of [null, undefined, { ...clone(PAYLOAD), crisis: [] }]) {
    assert.equal(P.toggle(P.blank(), 'a0', data, payload).result, 'ineligible', 'fail closed without a usable payload');
  }
  assert.equal(P.toggle(P.blank(), 'a7', data, PAYLOAD).result, 'added', 'a website alone is enough');
  assert.equal(P.toggle(P.blank(), 'a8', data, PAYLOAD).result, 'added', 'a dial link alone is enough');
  const many = P.addMany(P.blank(), ['a0', 'a2', 'a3', 'a6', 'a1', 'zzz'], data, PAYLOAD);
  assert.deepEqual(many.state.ids, ['a0', 'a1']);
  assert.deepEqual({ added: many.added, already: many.already, skipped: many.skipped, ineligible: many.ineligible },
    { added: 2, already: 0, skipped: 0, ineligible: 3 });
  // Saved before it became ineligible: it is reported as already there and kept; toggle can take it out.
  const packed = { ...P.blank(), ids: ['a2'] };
  const again = P.addMany(packed, ['a2', 'a0'], data, PAYLOAD);
  assert.equal(again.already, 1, 'an ineligible listing already in the packet is reported as already there');
  assert.equal(again.ineligible, 0);
  assert.deepEqual(again.state.ids, ['a2', 'a0'], 'and it is not dropped');
  assert.equal(P.toggle(packed, 'a2', data, PAYLOAD).result, 'removed', 'it can always be taken out');
  // An ineligible listing never takes a slot, and is not counted as skipped for a full packet.
  const big = P.validate(feed([...Array.from({ length: 13 }, (_, i) => row(i)), row(13, { category: 'crisis' })]));
  const full = P.addMany(P.blank(), ['a13', ...idsOf(13)], big, PAYLOAD);
  assert.deepEqual([full.added, full.skipped, full.ineligible], [12, 1, 1]);
  const down = P.addMany(P.blank(), ['a0', 'a1'], data, null);
  assert.deepEqual([down.added, down.ineligible, down.state.ids.length], [0, 2, 0], 'no payload: nothing is added');
});

test('the controller adds nothing without a usable payload, and says why a listing was not added', async () => {
  const data = P.validate(feed(MIXED()));
  const s = store();
  const live = fakeLive();
  const bare = P.create({ storage: s });
  bare.mount(null, live, () => data);
  assert.equal(bare.toggle('a0'), 'ineligible', 'no options.payload and no injected global: fail closed');
  assert.deepEqual(bare.addMany(['a0', 'a1']), { added: 0, already: 0, skipped: 0, ineligible: 2 });
  assert.equal(s.m.size, 0, 'nothing saved');
  await settle();
  assert.equal(live.textContent, 'Added 0 listings. 2 not added because they can’t go in the packet. 0 listings in packet.');
  bare.leave();
  const said = fakeLive();
  const c = P.create({ storage: s, payload: PAYLOAD });
  c.mount(null, said, () => data);
  assert.equal(c.toggle('a2'), 'ineligible');
  await settle();
  assert.equal(said.textContent, 'Not added: Support 2 can’t go in the packet. ' + P.reasonText('CRISIS_CATEGORY'));
  assert.equal(s.m.size, 0);
  assert.deepEqual(c.addMany(['a0', 'a6']), { added: 1, already: 0, skipped: 0, ineligible: 1 });
  await settle();
  assert.equal(said.textContent, 'Added 1 listing. 1 not added because it can’t go in the packet. 1 listing in packet.');
  c.leave();
});

test('a saved listing that BECAME ineligible stays in the tray, says why, keeps a working Remove, and still counts', () => {
  const data = P.validate(feed(MIXED()));
  const st = { ...P.blank(), ids: ['a0', 'a2', 'a6'] };
  const html = P.tray(st, data, {}, UI);
  assert.match(html, /Aftercare packet <span class="fd-care-packet__count">3<\/span>/, 'counted');
  const item = id => (new RegExp('<li class="fd-care-packet__item" data-fd-care-packet-item="' + id + '">[\\s\\S]*?</li>').exec(html) || [''])[0];
  for (const id of ['a2', 'a6']) {
    const li = item(id);
    assert.ok(li, id + ' is still listed');
    assert.match(li, new RegExp('<span class="fd-care-packet__why" data-fd-care-packet-ineligible="' + REASON[id] + '">'), id);
    assert.ok(li.includes(esc(P.reasonText(REASON[id]))), id + ' says why');
    const remove = /<button[^>]*data-fd-care-packet-remove="[^"]*"[^>]*>/.exec(li);
    assert.ok(remove && remove[0].includes('data-fd-care-packet-remove="' + id + '"'), id + ' can be removed');
    assert.doesNotMatch(remove[0], /disabled/);
  }
  assert.doesNotMatch(item('a0'), /ineligible/, 'an eligible listing carries no reason');
  // Payload down: one notice in the header and no row repeats it.
  const down = P.tray(st, data, {}, { payload: null });
  assert.equal((down.match(/data-fd-care-packet-ineligible=/g) || []).length, 1);
  assert.match(down, /<p class="fd-care-packet__hint" data-fd-care-packet-ineligible="PAYLOAD">/);
  assert.doesNotMatch(P.tray(P.blank(), data, {}, { payload: null }), /data-fd-care-packet-ineligible/, 'and no notice over an empty tray');
});

test('the controller never silently drops a listing that became ineligible: it holds its slot until the trainee removes it', () => {
  const data = P.validate(feed(MIXED()));
  const s = store();
  s.m.set(P.KEY, JSON.stringify({ ids: ['a2', 'a0'] }));
  const c = P.create({ storage: s, payload: PAYLOAD });
  c.mount(null, null, () => data);
  assert.deepEqual(c.ids(), ['a2', 'a0']);
  assert.equal(c.toggle('a1'), 'added');
  assert.deepEqual(JSON.parse(s.m.get(P.KEY)).ids, ['a2', 'a0', 'a1'], 'a change elsewhere keeps it');
  assert.equal(c.context().count, 3, 'it counts');
  assert.equal(c.context().reason('a2'), 'CRISIS_CATEGORY');
  assert.deepEqual(c.handleClick(fakeButton({ 'data-fd-care-packet-remove': 'a2' })), { attr: 'data-fd-care-packet-remove', id: 'a1' },
    'on screen the crisis group follows aftercare (a0, a1), so focus goes back to a1');
  assert.deepEqual(JSON.parse(s.m.get(P.KEY)).ids, ['a0', 'a1'], 'Remove works on it');
  // It holds a slot toward the cap: 11 eligible plus one that became ineligible is a full packet.
  const big = P.validate(feed([...Array.from({ length: 12 }, (_, i) => row(i)), row(12, { category: 'crisis' })]));
  const t = store();
  t.m.set(P.KEY, JSON.stringify({ ids: ['a12', ...idsOf(11)] }));
  const d = P.create({ storage: t, payload: PAYLOAD });
  d.mount(null, null, () => big);
  assert.equal(d.context().full, true);
  assert.equal(d.toggle('a11'), 'full');
});

test('Clear packet is offered whenever anything is saved, not only listings, and never when nothing is', () => {
  const data = dataOf(3);
  const unit = more => ({ name: '', phone: '', profile: '', ...more });
  const CLEAR = /<button type="button" class="fd-care-packet__clear" data-fd-care-packet-clear>Clear packet<\/button>/;
  assert.equal(P.hasState(P.blank()), false);
  assert.equal(P.hasState({ ids: [], inserts: {}, mode: 'review' }), false, 'a state with no unit at all is empty');
  assert.doesNotMatch(P.tray(P.blank(), data, {}, UI), /data-fd-care-packet-clear/);
  assert.doesNotMatch(P.tray({ ...P.blank(), unit: unit({}), inserts: {} }, data, {}, UI), /data-fd-care-packet-clear/);
  const cases = {
    'a typed unit name': { ...P.blank(), unit: unit({ name: '4 East' }) },
    'a typed unit phone': { ...P.blank(), unit: unit({ phone: '(207) 555-0100' }) },
    'a loaded profile': { ...P.blank(), unit: unit({ profile: FIXTURE.profile.id }) },
    'the Final copy': { ...P.blank(), mode: 'final' },
    'a page switched on': { ...P.blank(), inserts: { callback: true } },
    'a page switched off': { ...P.blank(), inserts: { week: false } },
    'a listing': { ...P.blank(), ids: ['a1'] },
  };
  for (const [label, st] of Object.entries(cases)) {
    assert.equal(P.hasState(st), true, label);
    const html = P.tray(st, data, {}, UI);
    assert.match(html, CLEAR, label);
    if (!st.ids.length) assert.match(html, /No listings yet/, label + ': with no listings at all');
  }
});

test('clear() empties everything the packet holds (listings, unit, profile, copy, pages, confirmations) and says what went', async () => {
  const data = dataOf(4);
  const s = store();
  const live = fakeLive();
  const tray = { innerHTML: '' };
  const c = P.create({ storage: s, payload: WITH_PROFILE });
  c.mount(tray, live, () => data);
  c.toggle('a1');
  c.setMode('final');
  c.setInsert('callback', true);
  assert.equal(c.loadProfile(FIXTURE.profile.id), true);
  for (const k of Object.keys(gateOn)) c.setGate(k, true);
  assert.deepEqual(JSON.parse(s.m.get(P.KEY)), { ids: ['a1'], why: {}, inserts: { callback: true }, mode: 'final',
    unit: { name: '', phone: '', profile: FIXTURE.profile.id } }, 'precondition: everything is saved');
  assert.deepEqual(c.gate(), gateOn);
  c.clear();
  assert.equal(s.m.size, 0, 'nothing is left in the tab');
  assert.deepEqual(P.load(s), P.blank(), 'the unit and the profile went too');
  assert.deepEqual(c.ids(), []);
  assert.equal(c.mode, 'review');
  assert.deepEqual(c.gate(), GATE_OFF);
  assert.doesNotMatch(tray.innerHTML, /data-fd-care-packet-clear/, 'nothing left to clear');
  await settle();
  assert.equal(live.textContent, 'Packet cleared: 1 listing, unit details, copy and page choices removed. Review confirmations cleared.');
  c.setUnit('name', '4 East');
  assert.match(tray.innerHTML, /data-fd-care-packet-clear/, 'a saved unit alone is enough to offer Clear');
  c.clear();
  await settle();
  assert.equal(live.textContent, 'Packet cleared: unit details removed.');
  assert.equal(s.m.size, 0);
  c.setMode('final');
  assert.match(tray.innerHTML, /data-fd-care-packet-clear/, 'so is the Final copy alone');
  c.clear();
  await settle();
  assert.equal(live.textContent, 'Packet cleared: copy and page choices removed.');
  assert.equal(c.mode, 'review');
  c.clear();
  await settle();
  assert.equal(live.textContent, 'Packet cleared.');
  c.leave();
});

test('stored unit details: a profile is a bounded id, and with one set the typed name and phone are dropped', () => {
  assert.deepEqual(P.normalize({ unit: { profile: FIXTURE.profile.id, name: '4 East', phone: '(207) 555-0100' } }).unit,
    { name: '', phone: '', profile: FIXTURE.profile.id }, 'the profile is the only source of the unit\'s details');
  assert.deepEqual(P.normalize({ unit: { name: '4 East', phone: '(207) 555-0100' } }).unit, { name: '4 East', phone: '(207) 555-0100', profile: '' });
  assert.equal(P.normalize({ unit: { profile: 'a'.repeat(40) } }).unit.profile, 'a'.repeat(40), 'forty characters is the bound');
  for (const odd of ['a'.repeat(41), 'Fixture-Unit', 'fixture unit', 'fixture_unit', 'unit/../x', 'x<y', FIXTURE.profile.id + '\n', 7, true, null, [FIXTURE.profile.id], { id: FIXTURE.profile.id }]) {
    const st = P.normalize({ unit: { profile: odd, name: '4 East' } });
    assert.equal(st.unit.profile, '', JSON.stringify(odd) + ' is not a profile id');
    assert.equal(st.unit.name, '4 East', JSON.stringify(odd) + ': a rejected id is no profile, so the typed name (never confirmed) stands');
  }
  assert.deepEqual(P.normalize({ unit: [FIXTURE.profile.id] }).unit, P.blank().unit);
  assert.deepEqual(P.normalize({ unit: FIXTURE.profile.id }).unit, P.blank().unit);
  const s = store();
  s.m.set(P.KEY, JSON.stringify({ ids: ['a1'], unit: { profile: 'x'.repeat(5000), name: '4 East' } }));
  assert.deepEqual(P.load(s).unit, { name: '4 East', phone: '', profile: '' }, 'storage is untrusted text');
});

test('save and copy carry the profile id; an empty state leaves no residue in the tab', () => {
  const s = store();
  const withProfile = { ...P.blank(), unit: { name: '', phone: '', profile: FIXTURE.profile.id } };
  P.save(s, withProfile);
  assert.deepEqual(JSON.parse(s.m.get(P.KEY)), { ids: [], why: {}, inserts: {}, mode: 'review', unit: { name: '', phone: '', profile: FIXTURE.profile.id } },
    'a profile alone is state worth keeping');
  assert.deepEqual(P.load(s), withProfile, 'and it survives the round trip');
  for (const empty of [P.blank(), { ...P.blank(), unit: { name: '', phone: '', profile: '' } }, { ids: [], why: {}, inserts: {}, mode: 'review' }]) {
    P.save(s, withProfile);
    P.save(s, empty);
    assert.equal(s.m.size, 0, 'an empty state removes the key: ' + JSON.stringify(empty));
  }
  P.save(s, { ...P.blank(), inserts: { week: false } });
  assert.equal(s.m.size, 1, 'a page switched off is still a choice to keep');
  const original = { ids: ['a1'], why: {}, inserts: { callback: true }, mode: 'final', unit: { name: '', phone: '', profile: FIXTURE.profile.id } };
  const copied = P.copy(original);
  assert.deepEqual(copied, original);
  copied.ids.push('a2');
  copied.unit.profile = 'other';
  copied.inserts.meds = true;
  assert.deepEqual(original, { ids: ['a1'], why: {}, inserts: { callback: true }, mode: 'final', unit: { name: '', phone: '', profile: FIXTURE.profile.id } },
    'a copy shares nothing with its source');
  assert.deepEqual(P.copy({ ids: [], inserts: {}, mode: 'review', unit: { name: 7, phone: null, profile: {} } }).unit, { name: '', phone: '', profile: '' }, 'only strings are copied');
  assert.deepEqual(P.copy({ ids: [], inserts: {}, mode: 'review' }).unit, { name: '', phone: '', profile: '' }, 'no unit copies as a blank unit');
});

test('the tray offers the wallet card as its own print: present with an empty packet, enabled with a usable payload, disabled with the reason when not', () => {
  const data = dataOf(3);
  const empty = P.tray(P.blank(), data, {}, UI);
  const button = cardButtonOf(empty);
  assert.ok(button, 'offered before any listing is added');
  assert.doesNotMatch(button, /disabled/);
  assert.match(button, /aria-describedby="fd-care-packet-card-note"/, 'the button is described by its note');
  assert.match(empty, /data-fd-care-packet-card-print[^>]*>Print wallet card<\/button>/);
  assert.match(cardNoteOf(empty), /not part of the packet/, 'the note node exists and says what the card is');
  assert.ok(empty.indexOf('data-fd-care-packet-card-print') < empty.indexOf('<fieldset class="fd-care-packet__gate"'), 'outside the review confirmations (before them)');
  // Added with the review fixes: "Preview and print" stays the LAST tray control, so Tab goes from it straight into the preview it
  // opens (WCAG 2.4.3). Fails if the card control moves back between the toggle and the preview.
  const withListing = P.tray({ ...P.blank(), ids: ['a1'] }, data, {}, UI);
  assert.ok(withListing.indexOf('data-fd-care-packet-card-print') < withListing.indexOf('data-fd-care-packet-preview-toggle'), 'the card control comes before the preview toggle');
  assert.match(cardNoteOf(empty), /scale 100 and margins set to Default/, 'a trainee who prints only the card is told the print settings that keep it card-sized');
  assert.doesNotMatch(cardButtonOf(P.tray({ ...P.blank(), ids: ['a1'] }, data, {}, UI)), /disabled/, 'an unreviewed packet does not hold the card back');
  const noName = clone(PAYLOAD);
  delete noName.contacts[PAYLOAD.required[0]].name;
  for (const [label, payload] of [['none', null], ['missing', undefined], ['no crisis lines', { ...clone(PAYLOAD), crisis: [] }], ['an official name missing', noName]]) {
    const html = P.tray(P.blank(), data, {}, { payload });
    assert.match(cardButtonOf(html), / disabled/, label);
    assert.match(cardNoteOf(html), /crisis lines did not load/, label + ': the note says why');
  }
  const noCard = clone(PAYLOAD);
  delete noCard.card;
  const missing = P.tray(P.blank(), data, {}, { payload: noCard });
  assert.match(cardButtonOf(missing), / disabled/);
  assert.match(cardNoteOf(missing), /wallet card did not load/);
  const refused = P.tray(P.blank(), data, {}, { payload: PAYLOAD, cardMessage: 'Refused <b>now</b>' });
  assert.equal(cardNoteOf(refused), 'Refused &lt;b&gt;now&lt;/b&gt;', 'a refused print says why in the same note, escaped');
});

test('the wallet card prints on its own with an empty packet and no review confirmations: it needs only the payload', () => {
  const env = fakeBrowser();
  const M = loadInBrowser(env);
  const s = store();
  const focused = [];
  const cardButton = { disabled: false, focus() { focused.push('card'); } };
  const tray = { innerHTML: '', querySelector: sel => (sel === '[data-fd-care-packet-card-print]' ? cardButton : null) };
  const c = M.create({ storage: s, payload: PAYLOAD, sheet: FIXED_LAYOUT });
  c.mount(tray, null, () => dataOf(3), null, { hidden: false, innerHTML: '' });
  assert.match(cardButtonOf(tray.innerHTML), /data-fd-care-packet-card-print/);
  assert.deepEqual(c.gate(), GATE_OFF);
  assert.equal(c.print().code, 'EMPTY', 'the packet itself has nothing to print');
  assert.deepEqual(c.printCard(), { ok: true, code: '' });
  assert.equal(env.win.printed, 1);
  assert.equal(env.body.children.length, 1);
  const host = env.body.children[0];
  assert.equal(host.id, 'fdPacketPrint');
  assert.match(host.innerHTML, /data-fd-packet-card="crisis"/);
  assert.match(host.innerHTML, /data-fd-packet-card="mine"/);
  assert.doesNotMatch(host.innerHTML, /aria-label="Page \d/, 'the card, not the packet');
  const governed = id => GOVERNED.resources.find(r => r.id === id);
  for (const id of PAYLOAD.required) {
    assert.ok(host.innerHTML.includes(esc(governed(id).contact)), id + ': the governed contact is on the card');
    assert.ok(host.innerHTML.includes(esc(governed(id).name)), id + ': under its official name');
  }
  assert.equal(env.doc.title, PAYLOAD.card.title);
  assert.equal(s.m.size, 0, 'printing the card saves nothing');
  env.handlers.beforeprint();
  assert.equal(env.body.children[0], host, 'the browser\'s own print event leaves the card print alone');
  env.handlers.afterprint();
  assert.deepEqual([env.body.children.length, env.head.children.length, env.marks.size], [0, 0, 0], 'everything staged goes afterwards');
  assert.equal(env.doc.title, 'Home');
  assert.deepEqual(focused, ['card'], 'focus returns to the card button');
  // A listing nobody has reviewed: the packet waits for the four confirmations, the card does not.
  assert.equal(c.toggle('a1'), 'added');
  assert.equal(c.print().code, 'REVIEW');
  assert.deepEqual(c.printCard(), { ok: true, code: '' });
  env.handlers.afterprint();
  c.setMode('final');
  assert.deepEqual(c.printCard(), { ok: true, code: '' }, 'nor does it ask for a unit or a copy mode');
  env.handlers.afterprint();
  assert.equal(env.win.printed, 3);
  assert.deepEqual(c.gate(), GATE_OFF, 'and printing it confirmed nothing');
  c.leave();
});

test('the wallet card refuses without the crisis lines or with a broken card, says why in its note, and nothing reaches the printer', () => {
  const env = fakeBrowser();
  const M = loadInBrowser(env);
  const tray = { innerHTML: '' };
  const c = M.create({ storage: store(), payload: null, sheet: FIXED_LAYOUT });
  c.mount(tray, null, () => dataOf(3), null, { hidden: false, innerHTML: '' });
  assert.match(cardButtonOf(tray.innerHTML), / disabled/);
  assert.equal(c.printCard().code, 'CRISIS_UNAVAILABLE');
  c.leave();
  // The card copy arrived broken: the payload is usable, so the button is offered, but the print refuses and the note says so.
  const odd = { ...clone(PAYLOAD), card: { title: 'Wallet crisis card' } };
  const second = { innerHTML: '' };
  const d = M.create({ storage: store(), payload: odd, sheet: FIXED_LAYOUT });
  d.mount(second, null, () => dataOf(3), null, { hidden: false, innerHTML: '' });
  assert.doesNotMatch(cardButtonOf(second.innerHTML), /disabled/);
  assert.equal(d.printCard().code, 'CARD_UNAVAILABLE');
  assert.match(cardNoteOf(second.innerHTML), /wallet card could not be built/);
  assert.deepEqual([env.win.printed, env.body.children.length], [0, 0], 'nothing printed and nothing staged');
  d.leave();
});

test('the stored page switches are exactly the payload\'s inserts, and the wallet card is not one of them', () => {
  assert.ok(Array.isArray(P.INSERTS));
  assert.equal(P.INSERTS.includes('card'), false);
  assert.deepEqual([...P.INSERTS].sort(), PAYLOAD.inserts.map(ins => ins.id).sort(), 'a switch the payload has no page for could never print');
  assert.equal(typeof PAYLOAD.card, 'object', 'precondition: the card is its own block of the payload');
  assert.deepEqual(P.normalize({ inserts: { card: true, week: true } }).inserts, { week: true }, 'a stored card switch from the older shape is dropped');
  const literal = /var FD_CARE_PACKET_INSERTS=\[([^\]]*)\];/.exec(PACKET);
  assert.ok(literal, 'the list is one literal in the source');
  assert.doesNotMatch(literal[1], /card/);
});

// ---- added with the review fixes ----------------------------------------------------------------------------------------
// A saved listing that later became ineligible must show its reason AND keep a way out in the chooser, not an "In packet" tag over
// a reason with no control. Fails if the packed-and-ineligible row loses the pressed button, or the reason.
test('a saved listing that became ineligible shows its reason and the pressed button that takes it out; one not in the packet shows the reason alone', () => {
  const noContact = row(7, { website: '', phone: '', contactHref: '' });
  const data = P.validate(feed([row(0), noContact]));
  const packed = P.context({ ...P.blank(), ids: ['a7'] }, data, PAYLOAD);
  const html = P.button(data.records.find(r => r.id === 'a7'), packed);
  assert.match(html, /data-fd-care-packet-ineligible="NO_CONTACT"/, 'the reason');
  assert.match(html, /<button[^>]*data-fd-care-packet="a7"[^>]*aria-pressed="true"/, 'and the way to take it out');
  const unpacked = P.context(P.blank(), data, PAYLOAD);
  const alone = P.button(data.records.find(r => r.id === 'a7'), unpacked);
  assert.match(alone, /data-fd-care-packet-ineligible="NO_CONTACT"/);
  assert.doesNotMatch(alone, /<button/, 'not in the packet: nothing to press');
});
