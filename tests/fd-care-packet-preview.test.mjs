// PR C of the Care aftercare packet: the preview's state and controller (the sheet itself is tested in
// fd-care-packet-sheet.test.mjs). Pure state, the controls markup, the blocker order, the rules that re-arm the
// review gate, and the controller's typing / commit / Escape behaviour against fake nodes. DOM-dependent behaviour
// (measuring, the print container, focus, real keyboard) is in the browser spec.
//
// Every test names the production change that would make it fail.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { profileReceipt } from './helpers/care-profile-fixture.mjs';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const AUTOMATION = path.join(REPO, '13_Faculty_Resources/_automation');
const SITE_BUILD = path.join(AUTOMATION, 'site_build');
const FD = path.join(SITE_BUILD, 'frontdoor');
const readIf = file => (existsSync(file) ? readFileSync(file, 'utf8') : '');
const PACKET = readIf(path.join(FD, 'fd_care_packet.js'));
const SHEET = readIf(path.join(FD, 'fd_care_packet_sheet.js'));
const SEARCH = readIf(path.join(FD, 'fd_care_search.js'));
const DATA = readIf(path.join(FD, 'fd_data.js'));

const built = spawnSync('python3', ['-B', '-c',
  `import json, sys\nsys.path.insert(0, ${JSON.stringify(AUTOMATION)})\nsys.path.insert(0, ${JSON.stringify(SITE_BUILD)})\nimport care_inserts_payload as p\nprint(json.dumps(p.build_payload()))`],
{ cwd: SITE_BUILD, encoding: 'utf8', timeout:60000 });
assert.equal(built.status, 0, built.stderr);
const PAYLOAD = JSON.parse(built.stdout);
const clone = value => JSON.parse(JSON.stringify(value));
// Either printable copy needs a profile and independent approval; absence uses an explicit empty fixture.
// Positive tests use synthetic fixture profiles and matching authority receipts (fictional 555-01xx numbers).
const FIXTURE = JSON.parse(readFileSync(path.join(REPO, 'tests/fixtures/care-unit-profile.json'), 'utf8'));
const EMPTY_PROFILES = { ...clone(PAYLOAD), unitProfiles: [] };
const PROFILED = { ...clone(PAYLOAD), unitProfiles: [clone(FIXTURE.profile), clone(FIXTURE.expired)] };
const PROFILE_UNIT = { name: '', phone: '', profile: 'fixture-unit' };
const NOW = Date.UTC(2026, 9, 12);
const ARRANGED_CALL = { arranged: true, plan: true, preferences: true };
const approvedOptions = (profile = FIXTURE.profile, extra = {}) => ({ now: NOW, authority: profileReceipt(profile, NOW), ...extra });
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const EXPORTS = `;return typeof fdCarePacketControls === 'function' ? {
  blank: fdCarePacketBlank, normalize: fdCarePacketNormalize, load: fdCarePacketLoad, save: fdCarePacketSave,
  tray: fdCarePacketTray, controls: fdCarePacketControls, blocker: fdCarePacketBlocker, create: fdCreateCarePacket,
  sheet: fdCarePacketSheet, validate: fdCareDirectoryValidate, KEY: FD_CARE_PACKET_KEY,
  stale: fdCarePacketStale, hint: fdCarePacketHint, TITLE: FD_CARE_PACKET_TITLE,
  copy: fdCarePacketCopy, unitOf: fdCarePacketUnitOf, INSERTS: FD_CARE_PACKET_INSERTS
} : null;`;
// The shell's order. The QR generator and fd_care_pack.js are loaded because a sheet built without them has no codes at all.
const QR = readFileSync(path.join(SITE_BUILD, 'vendor/qrcode-generator-1.4.4.js'), 'utf8');
const PACK = readIf(path.join(FD, 'fd_care_pack.js'));
const AUTHORITY = readIf(path.join(FD, 'fd_care_profile.js'));
const load = (storage = undefined, global = PAYLOAD) =>
  new Function('sessionStorage', 'FD_CARE_INSERTS', DATA + QR + PACK + AUTHORITY + PACKET + SHEET + SEARCH + EXPORTS)(storage, global);
const P = load();

const store = () => {
  const m = new Map();
  return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
};
const categoryIds = ['aftercare', 'crisis', 'peer_support', 'basic_needs', 'community_services', 'housing_shelters', 'recovery_meetings', 'telehealth_providers'];
const row = (n, more = {}) => ({ id: 'a' + n, category: 'aftercare', name: 'Support ' + n, description: 'Counseling.', details: 'x', area: 'York',
  regions: ['Southern Maine'], phone: '207-700-0123', contactHref: 'tel:2077000123', website: 'https://example.org/' + n,
  verifiedDate: '2026-10-01', reviewAfter: '2027-03-30', verificationRequired: false, ...more });
const feed = records => ({ schemaVersion: 1, generatedAt: '2026-10-12T00:00:00Z', sourceHash: 'a'.repeat(64),
  categories: categoryIds.map(id => ({ id, label: id, available: true, count: records.filter(r => r.category === id).length })),
  regionOptions: ['Statewide', 'Southern Maine', 'NH'], records });
const dataOf = count => P.validate(feed(Array.from({ length: count }, (_, i) => row(i))));
const gateOn = { verification: true, region: true, identifiers: true, supervisor: true };
const gateOff = { verification: false, region: false, identifiers: false, supervisor: false };
const settle = () => new Promise(resolve => setTimeout(resolve, 300));
const fakeLive = () => ({ textContent: '' });
// A stand-in for the preview mount: innerHTML in, and the two sub-mounts the controller paints into. `inner` is a node inside
// the preview (where keyboard focus is when the trainee works in it); `controls` may be a richer stand-in that can be patched.
function fakePreview(controls) {
  // `writes` counts every assignment, because identical HTML written twice looks unchanged to a string comparison.
  const piece = () => { let html = ''; const node = { writes: 0, get innerHTML() { return html; }, set innerHTML(value) { node.writes += 1; html = value; } }; return node; };
  const pieces = { controls: controls || piece(), pages: piece() };
  const inner = { insidePreview: true };
  return { hidden: true, innerHTML: '', isConnected: true, pieces, inner, contains: node => node === inner,
    querySelector(selector) {
      if (/profile-select/.test(selector)) return typeof pieces.controls.querySelector === 'function' ? pieces.controls.querySelector(selector) : null;
      return /controls/.test(selector) ? pieces.controls : /pages/.test(selector) ? pieces.pages : null;
    } };
}
// The controls after their first paint, as nodes the controller patches in place (the selectors are the ones it asks for).
function fakeControls() {
  const el = () => ({ textContent: '', hidden: false, disabled: false, value: '', readOnly: false, focused: 0, attrs: {}, innerHTML: '',
    setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; },
    getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }, focus() { this.focused += 1; } });
  const nodes = {};
  for (const selector of ['#fd-care-packet-reason', '[data-fd-care-packet-print]', '[data-fd-care-packet-copy]', '[data-fd-care-packet-summary]',
    '[data-fd-care-packet-hint]', '[data-fd-care-packet-fallback]', '#fd-care-packet-unit-name', '#fd-care-packet-unit-phone',
    '#fd-care-packet-unit-name-error', '#fd-care-packet-unit-phone-error', '[data-fd-care-packet-profile-status]',
    '[data-fd-care-packet-profile-unlink]', '[data-fd-care-packet-profile-select]', '[data-fd-care-packet-readback]']) nodes[selector] = el();
  let html = '';
  const root = { writes: 0, nodes, get innerHTML() { return html; }, set innerHTML(value) { root.writes += 1; html = value; },
    querySelector: selector => nodes[selector] || null, querySelectorAll: () => [] };
  return root;
}
const fakeField = (field, value) => ({
  value, checked: false, type: 'text',
  hasAttribute: k => k === 'data-fd-care-packet-unit-field', getAttribute: k => (k === 'data-fd-care-packet-unit-field' ? field : null),
});
const fakeChoice = (attr, value, checked = true) => ({
  value, checked, type: attr === 'data-fd-care-packet-mode' ? 'radio' : 'checkbox',
  hasAttribute: k => k === attr, getAttribute: k => (k === attr ? value : null),
});
function mounted(count = 6, options = {}) {
  const storage = options.storage || store();
  const live = fakeLive();
  const preview = options.preview || fakePreview();
  const c = P.create({ storage, payload: PAYLOAD, ...options.create });
  const data = dataOf(count);
  c.mount(options.root || null, live, () => data, null, preview);
  return { c, storage, live, preview, data };
}
// The same, with the fixture profiles in the payload.
const mountedP = (count = 6, options = {}) => mounted(count, { ...options, create: { payload: PROFILED,
  authorizeProfile: profile => profileReceipt(profile,options.create?.sheet?.now ?? Date.now()), ...options.create } });
const confirmAll = c => { for (const key of Object.keys(gateOn)) c.setGate(key, true); };
const savedKey = storage => JSON.parse(storage.m.get('fd_care_packet_v1'));
// A packet that can print as a Final copy: a listing, the confirmed fixture profile loaded, the copy, and the confirmations.
const readyFinal = (c, mode = 'final') => {
  c.toggle('a1');
  assert.equal(c.loadProfile('fixture-unit'), true, 'the fixture profile loads (precondition: the controller was given PROFILED)');
  c.setMode(mode);
  confirmAll(c);
};

// ---- state ------------------------------------------------------------------------------------------------
test('the module exports the preview API', () => {
  assert.ok(P, 'fd_care_packet.js exports controls, blocker and the sheet');
  assert.equal(typeof P.controls, 'function');
  assert.equal(typeof P.blocker, 'function');
});

test('state carries the ward\'s name, phone and profile id, and storage is never trusted for them', () => {
  assert.deepEqual(P.blank().unit, { name: '', phone: '', profile: '' });
  assert.deepEqual(P.normalize({ unit: { name: '4 East', phone: '(207) 555-0100' } }).unit, { name: '4 East', phone: '(207) 555-0100', profile: '' });
  for (const [label, unit] of [
    ['markup', { name: '<img onerror=1>', phone: '' }], ['braces', { name: '{{crisis:x}}', phone: '' }], ['control character', { name: 'a\tb', phone: '' }],
    ['over-length name', { name: 'x'.repeat(61), phone: '' }], ['over-length phone', { name: '', phone: '1'.repeat(31) }],
    ['letters in a phone', { name: '', phone: 'call me' }], ['non-strings', { name: 7, phone: null }],
  ]) {
    const stored = P.normalize({ unit }).unit;
    assert.deepEqual(stored, { name: '', phone: '', profile: '' }, label + ' is dropped whole, not trimmed into something else');
  }
  assert.deepEqual(P.normalize({ unit: ['4 East'] }).unit, { name: '', phone: '', profile: '' });
  assert.deepEqual(P.normalize({ unit: 'x' }).unit, { name: '', phone: '', profile: '' });
});

test('the profile id travels through copy, save and load; with one set the typed details are dropped; a bad id is dropped whole', () => {
  assert.deepEqual(P.copy({ ...P.blank(), unit: { ...PROFILE_UNIT } }).unit, PROFILE_UNIT, 'copy carries the profile');
  assert.deepEqual(P.copy({ ...P.blank(), unit: { name: 1, phone: null, profile: 7 } }).unit, { name: '', phone: '', profile: '' }, 'copy keeps strings only');
  assert.deepEqual(P.normalize({ unit: { profile: 'fixture-unit', name: '4 East', phone: '(207) 555-0100' } }).unit, PROFILE_UNIT,
    'typed values never sit beside a profile: the profile is the only source of the unit');
  assert.equal(P.normalize({ unit: { profile: 'x'.repeat(40) } }).unit.profile, 'x'.repeat(40), 'forty characters is within the bound');
  for (const bad of ['Fixture-Unit', 'fixture_unit', 'x'.repeat(41), 'a b', '<x>', '{{x}}', 'a\tb', 7, null, ['fixture-unit'], { id: 'fixture-unit' }]) {
    assert.deepEqual(P.normalize({ unit: { profile: bad, name: '4 East', phone: '(207) 555-0100' } }).unit, { name: '4 East', phone: '(207) 555-0100', profile: '' },
      JSON.stringify(bad) + ' is not a profile id: dropped whole, and the typed details stand');
  }
  const s = store();
  P.save(s, { ...P.blank(), unit: { ...PROFILE_UNIT } });
  assert.deepEqual(JSON.parse(s.m.get(P.KEY)).unit, PROFILE_UNIT, 'a packet holding only a profile keeps its key');
  assert.deepEqual(P.load(s).unit, PROFILE_UNIT);
  P.save(s, { ...P.blank(), unit: { name: '4 East', phone: '(207) 555-0100', profile: 'fixture-unit' } });
  assert.deepEqual(P.load(s).unit, PROFILE_UNIT, 'typed values written beside a profile do not survive a reload');
  // The id is not looked up in storage: an id the payload does not carry is simply not loaded.
  const unknown = P.normalize({ unit: { profile: 'not-shipped' } });
  assert.equal(unknown.unit.profile, 'not-shipped');
  assert.equal(P.unitOf(unknown, PROFILED, NOW).loaded, false);
  assert.equal(P.unitOf({ unit: PROFILE_UNIT }, PROFILED, NOW, profileReceipt(FIXTURE.profile, NOW)).confirmed, true, 'the fixture profile is confirmed (precondition for the Final-copy tests)');
  // The wallet card is no longer a page of the packet: a stored switch from an older tab is dropped.
  assert.equal(P.INSERTS.includes('card'), false);
  assert.deepEqual(P.normalize({ inserts: { card: true, safety: true } }).inserts, { safety: true });
});

test('a packet that holds only the ward\'s details keeps its key; a truly empty one leaves no residue', () => {
  const s = store();
  P.save(s, { ...P.blank(), unit: { name: '4 East', phone: '' } });
  assert.equal(JSON.parse(s.m.get('fd_care_packet_v1')).unit.name, '4 East');
  assert.deepEqual(P.load(s).unit, { name: '4 East', phone: '', profile: '' });
  P.save(s, P.blank());
  assert.equal(s.m.size, 0, 'nothing at all to remember: the key goes');
});

// Rewritten for the owner's directions: Clear used to keep the ward's details; it now removes everything the packet holds.
test('Clear packet removes everything (listings, unit details, profile, copy, page switches, an unsaved draft) and the confirmations, and says what went', async () => {
  const { c, storage, live, preview } = mountedP();
  c.toggle('a1');
  c.setUnit('name', '4 East');
  c.setMode('final');
  c.setInsert('safety', true);
  c.openPreview();
  c.handleInput(fakeField('phone', '(207) 555-0199')); // typed, not yet committed
  confirmAll(c);
  await settle();
  c.clear();
  assert.equal(storage.m.has(P.KEY), false, 'nothing is left to remember: the key goes');
  assert.deepEqual(c.gate(), gateOff, 'and the confirmations with it');
  assert.equal(c.mode, 'review', 'a new packet starts as a Review copy');
  assert.equal(c.previewOpen(), false, 'an empty packet has nothing to preview');
  await settle();
  assert.equal(live.textContent, 'Packet cleared: 1 listing, unit details, copy and page choices removed. Review confirmations cleared.');
  c.toggle('a1');
  c.openPreview();
  await settle();
  assert.doesNotMatch(preview.pieces.pages.innerHTML + preview.pieces.controls.innerHTML, /4 East|555-0199/, 'neither the saved name nor the unsaved draft comes back');
  assert.doesNotMatch(preview.pieces.controls.innerHTML, /data-fd-care-packet-insert="safety" checked/, 'the page switches went');
  // A loaded profile goes the same way, and is not loaded again by itself.
  c.loadProfile('fixture-unit');
  c.clear();
  assert.equal(storage.m.has(P.KEY), false);
  c.toggle('a1');
  assert.deepEqual(savedKey(storage).unit, { name: '', phone: '', profile: '' }, 'a confirmed profile comes back only when it is loaded again');
  // Clear is offered whenever anything is saved, not only listings.
  assert.match(P.tray({ ...P.blank(), unit: { ...PROFILE_UNIT } }, dataOf(3), gateOff, { payload: PROFILED }), /data-fd-care-packet-clear/);
  assert.match(P.tray(P.blank(), dataOf(3), gateOff, { payload: PROFILED }), /data-fd-care-packet-clear disabled/);
});

// ---- the markup ------------------------------------------------------------------------------------------
const stateWith = (count, more = {}) => ({ ...P.blank(), ids: Array.from({ length: count }, (_, i) => 'a' + i), ...more });
const readyUi = (state, payload = PAYLOAD) => {
  const profile = payload.unitProfiles?.find(p => p.id === state.unit?.profile);
  const options = profile ? approvedOptions(profile) : { now: NOW };
  const sheet = P.sheet(state, dataOf(6), payload, options);
  return { sheet, blocker: P.blocker(state, dataOf(6), gateOn, sheet, false), copyBlocker: P.blocker(state, dataOf(6), gateOn, sheet, true), unitErrors: { name: '', phone: '' },
    info: P.unitOf(state, payload, NOW, options.authority) };
};
// The text of the one element carrying this attribute in a piece of markup, or null.
const textOf = (html, attr) => { const m = html.match(new RegExp('<(\\w+)[^>]*' + attr + '[^>]*>([^<]*)</\\1>')); return m ? m[2] : null; };
const inputOf = (html, key) => (html.match(new RegExp('<input id="fd-care-packet-unit-' + key + '"[^>]*>')) || [''])[0];

test('the tray offers Preview and print only for a non-empty packet, as a disclosure that names its region', () => {
  const data = dataOf(6);
  const empty = P.tray(P.blank(), data, gateOff, { previewOpen: false });
  assert.doesNotMatch(empty, /data-fd-care-packet-preview-toggle/);
  const closed = P.tray(stateWith(2), data, gateOff, { previewOpen: false });
  assert.match(closed, /<button[^>]*data-fd-care-packet-preview-toggle[^>]*aria-expanded="false"[^>]*aria-controls="fd-care-packet-preview"[^>]*>Preview and print</);
  const opened = P.tray(stateWith(2), data, gateOff, { previewOpen: true });
  assert.match(opened, /data-fd-care-packet-preview-toggle[^>]*aria-expanded="true"/);
  assert.equal(P.tray(stateWith(2), data, gateOff).includes('Preview and print'), true, 'ui is optional (PR B callers pass three arguments)');
  assert.doesNotMatch(closed + opened, /role="dialog"|aria-modal/, 'a disclosure, never a modal: the shared announcer is silent while a modal exists');
});

test('controls: a native radio group for the copy, a checkbox per optional page, always-included text, labelled unit fields', () => {
  const state = stateWith(2, { inserts: { safety: true, warning: false }, unit: { name: '4 East', phone: '(207) 555-0100' } });
  const html = P.controls(state, dataOf(6), PAYLOAD, gateOn, readyUi(state));
  assert.match(html, /<fieldset[^>]*>\s*<legend>Copy to print<\/legend>/);
  assert.equal((html.match(/type="radio"/g) || []).length, 2);
  assert.equal((html.match(/type="radio"[^>]*checked/g) || []).length, 1, 'exactly one is checked');
  assert.match(html, /name="fd-care-packet-mode"[^>]*value="review"[^>]*checked/);
  assert.match(html, /<legend>Pages to include<\/legend>/);
  const optional = PAYLOAD.inserts.filter(i => !i.core);
  assert.equal((html.match(/type="checkbox"[^>]*data-fd-care-packet-insert=/g) || []).length, optional.length);
  for (const insert of optional) {
    const box = html.match(new RegExp('<input[^>]*data-fd-care-packet-insert="' + insert.id + '"[^>]*>'));
    assert.ok(box, insert.id + ' has a checkbox');
    const expected = insert.id === 'safety' ? true : insert.id === 'warning' ? false : insert.defaultOn;
    assert.equal(/ checked/.test(box[0]), expected, insert.id + ': stored switch over the default');
  }
  assert.equal(PAYLOAD.inserts.filter(i => i.core).length, 1);
  assert.doesNotMatch(html, /data-fd-care-packet-insert="intro"/, 'a core page is text, not a control that can be switched off');
  assert.match(html, /Always included/);
  assert.match(html, /<label for="fd-care-packet-unit-name">Unit name[^<]*<\/label>\s*<input[^>]*id="fd-care-packet-unit-name"[^>]*maxlength="60"[^>]*autocomplete="off"[^>]*value="4 East"/);
  assert.match(html, /<label for="fd-care-packet-unit-phone">Unit phone[^<]*<\/label>\s*<input[^>]*id="fd-care-packet-unit-phone"[^>]*type="tel"[^>]*maxlength="30"[^>]*autocomplete="off"[^>]*value="\(207\) 555-0100"/);
  assert.match(html, /data-fd-care-packet-unit-field="name"/);
  assert.match(html, /never the patient/i, 'the hint says whose details these are');
});

test('controls: typed values are escaped, and an invalid one stays in the field with an error tied to it', () => {
  const evil = '"><script>alert(1)</script>';
  const state = stateWith(2, { unit: { name: evil, phone: '911' } });
  const ui = { ...readyUi(state), unitErrors: { name: 'Use letters, numbers and ordinary punctuation.', phone: 'Enter the ten-digit number patients call, with the area code.' } };
  const html = P.controls(state, dataOf(6), PAYLOAD, gateOn, ui);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /value="&quot;&gt;&lt;script&gt;/);
  assert.match(html, /id="fd-care-packet-unit-phone"[^>]*aria-invalid="true"[^>]*aria-describedby="[^"]*fd-care-packet-unit-phone-error/);
  assert.match(html, /id="fd-care-packet-unit-phone-error"[^>]*>Enter the ten-digit number/);
  const clean = P.controls(stateWith(2), dataOf(6), PAYLOAD, gateOn, readyUi(stateWith(2)));
  assert.doesNotMatch(clean, /aria-invalid="true"/);
});

// Rewritten: the Final copy here used a typed phone; a Final copy that names the unit now needs the confirmed profile loaded.
test('controls: Print and Copy are native-disabled with the reason beside them, and enabled only when nothing blocks', () => {
  const state = stateWith(2, { mode: 'final', unit: { ...PROFILE_UNIT } });
  const blockedHtml = P.controls(state, dataOf(6), PROFILED, gateOff, { ...readyUi(state, PROFILED), blocker: { code: 'REVIEW', message: 'Finish the four review confirmations above.' }, copyBlocker: { code: 'REVIEW', message: 'Finish the four review confirmations above.' } });
  assert.match(blockedHtml, /<p[^>]*id="fd-care-packet-reason"[^>]*tabindex="-1"[^>]*>Finish the four review confirmations above\.<\/p>/);
  assert.match(blockedHtml, /<button[^>]*data-fd-care-packet-print[^>]*disabled[^>]*aria-describedby="fd-care-packet-reason"[^>]*>Print packet</);
  assert.match(blockedHtml, /<button[^>]*data-fd-care-packet-copy[^>]*disabled[^>]*aria-describedby="fd-care-packet-reason"[^>]*>Copy as text</);
  const okUi = readyUi(state, PROFILED);
  assert.equal(okUi.blocker, null, 'a complete, valid Final copy with the confirmed profile has no blocker (test precondition)');
  const readyHtml = P.controls(state, dataOf(6), PROFILED, gateOn, okUi);
  assert.doesNotMatch(readyHtml.match(/<button[^>]*data-fd-care-packet-print[^>]*>/)[0], /disabled/);
  assert.doesNotMatch(readyHtml.match(/<button[^>]*data-fd-care-packet-copy[^>]*>/)[0], /disabled/);
  const reviewHtml = P.controls({ ...state, mode: 'review' }, dataOf(6), PROFILED, gateOn, readyUi({ ...state, mode: 'review' }, PROFILED));
  assert.match(reviewHtml.match(/<button[^>]*data-fd-care-packet-copy[^>]*>/)[0], /disabled/, 'Copy is Final-only');
  assert.doesNotMatch(reviewHtml.match(/<button[^>]*data-fd-care-packet-print[^>]*>/)[0], /disabled/, 'a Review copy still prints');
});

// Rewritten: the hint no longer asks for a one-sided print (the wallet card prints on its own, from the tray).
test('controls: a failed sheet shows its message as text and no pages, and the summary says how many pages', () => {
  const state = stateWith(2);
  const html = P.controls(state, dataOf(6), PAYLOAD, gateOn, { ...readyUi(state), sheet: { ok: false, code: 'CRISIS_UNAVAILABLE', message: 'The crisis lines did not load.' }, blocker: { code: 'CRISIS_UNAVAILABLE', message: 'The crisis lines did not load.' } });
  assert.match(html, /The crisis lines did not load\./);
  const okHtml = P.controls(state, dataOf(6), PAYLOAD, gateOn, readyUi(state));
  assert.match(okHtml, /\d+ pages? · Review copy/);
  assert.match(okHtml, /Chrome or Edge/, 'the supported print path is said out loud');
  assert.doesNotMatch(okHtml, /one-sided|wallet card/i, 'the packet controls say nothing about the wallet card: it is not part of the packet');
});

test('controls: the mode note requires approval for both copies, beside the copy radios', () => {
  const html = P.controls(stateWith(2), dataOf(6), PAYLOAD, gateOn, readyUi(stateWith(2)));
  assert.match(html, /<fieldset class="fd-care-packet-preview__mode"><legend>Copy to print<\/legend>[\s\S]*?<p[^>]*data-fd-care-packet-modenote[^>]*>[^<]*<\/p><\/fieldset>/,
    'inside the copy fieldset, after the radios');
  assert.equal(textOf(html, 'data-fd-care-packet-modenote'), 'Both copies need current owner approval of the unit profile before Print or Copy. Draft editing remains available.');
});

test('controls: the profile section offers a select and an explicit Load button; the status, read-only fields, unlink button and readback follow what is loaded', () => {
  const data = dataOf(6);
  const ui = (state, payload) => readyUi(state, payload);
  const typed = stateWith(2, { unit: { name: '4 East', phone: '(207) 555-0100', profile: '' } });
  const html = P.controls(typed, data, PROFILED, gateOn, ui(typed, PROFILED));
  assert.match(html, /<div class="fd-care-packet-preview__profile" data-fd-care-packet-profile>/);
  assert.match(html, /<label for="fd-care-packet-profile">Unit profile<\/label>/, 'the select is labelled');
  assert.match(html, /<select id="fd-care-packet-profile" data-fd-care-packet-profile-select><option value="">Choose a profile…<\/option><option value="fixture-unit">Fixture unit \(test only\)<\/option><option value="fixture-unit-expired">Expired fixture unit \(test only\)<\/option><\/select>/);
  assert.match(html, /<button type="button" data-fd-care-packet-profile-load>Load profile<\/button>/, 'loading is a button, never the select\'s change');
  assert.match(html, /<button type="button" data-fd-care-packet-profile-unlink hidden>/, 'nothing loaded, nothing to unlink');
  assert.doesNotMatch(html, /data-fd-care-packet-profile-none/);
  assert.equal(textOf(html, 'data-fd-care-packet-profile-status'), 'Using the details you typed. They are not a confirmed profile.');
  assert.equal(textOf(html, 'data-fd-care-packet-readback'), 'Candidate phone: (207) 555-0100. It cannot be printed or copied until approved.');
  for (const key of ['name', 'phone']) assert.doesNotMatch(inputOf(html, key), /readonly/, key + ' can be typed in');
  assert.match(inputOf(html, 'name'), /value="4 East"/);

  const loaded = stateWith(2, { unit: { ...PROFILE_UNIT } });
  const on = P.controls(loaded, data, PROFILED, gateOn, ui(loaded, PROFILED));
  assert.match(on, /<option value="fixture-unit" selected>/);
  assert.match(on, /<button type="button" data-fd-care-packet-profile-unlink>Use my own details instead<\/button>/);
  assert.match(inputOf(on, 'name'), /readonly[^>]*value="Fixture Unit 4 East"/, 'the profile\'s name, read-only');
  assert.match(inputOf(on, 'phone'), /readonly[^>]*value="\(207\) 555-0142"/, 'the profile\'s phone, read-only');
  assert.equal(textOf(on, 'data-fd-care-packet-profile-status'), 'Loaded: Fixture unit (test only). Approval checked. Expires on 2100-01-01 (America/New_York).');
  assert.equal(textOf(on, 'data-fd-care-packet-readback'), 'Approved unit contact: (207) 555-0142.', 'a confirmed number is not called unconfirmed');

  const lapsed = stateWith(2, { unit: { name: '', phone: '', profile: 'fixture-unit-expired' } });
  const old = P.controls(lapsed, data, PROFILED, gateOn, ui(lapsed, PROFILED));
  assert.equal(textOf(old, 'data-fd-care-packet-profile-status'), 'This profile expired on 2020-01-02 (America/New_York). A new verification and owner approval are required.');
  assert.equal(textOf(old, 'data-fd-care-packet-readback'), 'Candidate phone: (207) 555-0142. It cannot be printed or copied until approved.');
  assert.match(inputOf(old, 'phone'), /readonly/, 'still the profile\'s, still read-only');
  const noClock = P.controls(loaded, data, PROFILED, gateOn, { unitErrors: { name: '', phone: '' } });
  assert.match(textOf(noClock, 'data-fd-care-packet-profile-status'), /expired/, 'without a clock a confirmation is never assumed to hold');

  const empty = stateWith(2);
  assert.equal(textOf(P.controls(empty, data, PROFILED, gateOn, ui(empty, PROFILED)), 'data-fd-care-packet-readback'),
    'No approved unit contact is loaded. You can keep editing this draft.');
  const emptyFinal = { ...empty, mode: 'final' };
  assert.equal(textOf(P.controls(emptyFinal, data, PROFILED, gateOn, ui(emptyFinal, PROFILED)), 'data-fd-care-packet-readback'), 'No approved unit contact is loaded. You can keep editing this draft.', 'the Final copy has the same approval boundary');
  assert.equal(textOf(P.controls(empty, data, PROFILED, gateOn, ui(empty, PROFILED)), 'data-fd-care-packet-profile-status'), '');

  const noProfiles = P.controls(typed, data, EMPTY_PROFILES, gateOn, ui(typed, EMPTY_PROFILES));
  assert.equal(textOf(noProfiles, 'data-fd-care-packet-profile-none'), 'No unit profile is set up yet. Print and Copy need an approved profile; draft editing remains available.');
  assert.doesNotMatch(noProfiles, /data-fd-care-packet-profile-select|data-fd-care-packet-profile-load/, 'nothing to choose');
  const unusable = { ...clone(PAYLOAD), unitProfiles: [{ ...clone(FIXTURE.profile), id: 'Bad Id' }, { ...clone(FIXTURE.profile), id: 'short-phone', unitPhone: '555-0142' }] };
  const none = P.controls(typed, data, unusable, gateOn, ui(typed, unusable));
  assert.match(none, /data-fd-care-packet-profile-none/, 'a payload whose profiles all fail the browser re-check offers none');
  assert.doesNotMatch(none, /Bad Id|short-phone/);
});

test('controls: every profile value is escaped, and a profile whose label carries markup is never offered', () => {
  const hostile = { ...clone(FIXTURE.profile), id: 'hostile-label', label: 'Ward "B" & \'C\'', unitName: 'Unit "B" & \'C\'' };
  const markup = { ...clone(FIXTURE.profile), id: 'markup-label', label: '<img src=x onerror=alert(1)>' };
  const payload = { ...clone(PAYLOAD), unitProfiles: [hostile, markup] };
  const state = stateWith(2, { unit: { name: '', phone: '', profile: 'hostile-label' } });
  const html = P.controls(state, dataOf(6), payload, gateOn, readyUi(state, payload));
  assert.match(html, /<option value="hostile-label" selected>Ward &quot;B&quot; &amp; &#39;C&#39;<\/option>/);
  assert.equal(textOf(html, 'data-fd-care-packet-profile-status'), 'Loaded: Ward &quot;B&quot; &amp; &#39;C&#39;. Approval checked. Expires on 2100-01-01 (America/New_York).');
  assert.match(inputOf(html, 'name'), /value="Unit &quot;B&quot; &amp; &#39;C&#39;"/);
  assert.doesNotMatch(html, /Ward "B"|Unit "B"/, 'nothing unescaped');
  assert.doesNotMatch(html, /markup-label|<img|onerror/, 'the profile with markup in its label is dropped, never rendered');
});

// ---- the blocker ------------------------------------------------------------------------------------------
// Both modes require the exact approved profile; setup blockers precede review confirmations.
test('the blocker names the first thing in the way, in a fixed order', () => {
  const data = dataOf(6);
  const state = stateWith(2, { mode: 'final', unit: { ...PROFILE_UNIT } });
  const sheet = P.sheet(state, data, PROFILED, approvedOptions());
  assert.equal(sheet.ok, true, sheet.message);
  assert.deepEqual(sheet.blockers, [], 'a Final copy with the confirmed fixture profile has nothing in its way (precondition)');
  assert.equal(P.blocker(P.blank(), data, gateOn, sheet, false).code, 'EMPTY');
  assert.equal(P.blocker(state, data, gateOff, sheet, false).code, 'REVIEW');
  assert.equal(P.blocker(state, data, gateOn, null, false).code, 'MEASURE_FAILED');
  assert.equal(P.blocker(state, data, gateOn, { ok: false, code: 'OVERFLOW', message: 'too long' }, false).code, 'OVERFLOW');
  assert.equal(P.blocker(state, data, gateOn, { ...sheet, blockers: [{ code: 'LISTING_TEXT', message: 'remove it' }] }, false).code, 'LISTING_TEXT');
  assert.equal(P.blocker(state, data, gateOn, sheet, false), null);
  assert.equal(P.blocker({ ...state, mode: 'review' }, data, gateOn, P.sheet({ ...state, mode: 'review' }, data, PROFILED, approvedOptions()), true).code, 'NOT_FINAL');
  assert.equal(P.blocker({ ...state, mode: 'review' }, data, gateOn, P.sheet({ ...state, mode: 'review' }, data, PROFILED, approvedOptions()), false), null, 'Print has no Final requirement');
  assert.equal(P.blocker(state, data, gateOff, null, false).code, 'REVIEW', 'confirmations come before layout');
  assert.equal(P.blocker(P.blank(), data, gateOff, null, false).code, 'EMPTY', 'an empty packet comes first of all');
});

test('setup blockers (unit, call-back, an ineligible saved listing) guard Print and Copy before the four confirmations; NOT_FINAL is last', () => {
  const data = dataOf(6);
  const state = stateWith(2, { mode: 'final', unit: { ...PROFILE_UNIT } });
  // A typed phone: never confirmed.
  const typed = { ...state, unit: { name: '', phone: '(207) 555-0100', profile: '' } };
  const typedSheet = P.sheet(typed, data, PROFILED, {});
  assert.equal(P.blocker(typed, data, gateOff, typedSheet, false).code, 'UNIT_UNCONFIRMED', 'named before the confirmations: confirming first and then fixing would re-arm them');
  assert.equal(P.blocker(typed, data, gateOn, typedSheet, false).code, 'UNIT_UNCONFIRMED');
  assert.equal(P.blocker(typed, data, gateOff, typedSheet, true).code, 'UNIT_UNCONFIRMED', 'Copy cannot bypass the unit approval rule');
  assert.equal(P.blocker(typed, data, gateOn, typedSheet, true).code, 'UNIT_UNCONFIRMED');
  assert.equal(P.blocker(P.blank(), data, gateOff, typedSheet, false).code, 'EMPTY', 'still after an empty packet');
  // The call-back page: the fixture records a call-back program; a confirmed profile without one does not.
  const callback = { ...state, inserts: { callback: true } };
  assert.deepEqual(P.sheet(callback, data, PROFILED, approvedOptions(FIXTURE.profile, { callback: ARRANGED_CALL })).blockers, [], 'an approved program and the specific arranged call are both confirmed');
  assert.equal(P.sheet(callback, data, PROFILED, approvedOptions()).blockers[0].code, 'CALLBACK_UNCONFIRMED', 'a program alone never promises a call');
  const noCallProfile = { ...clone(FIXTURE.profile), id: 'fixture-no-callback', callbackProgram: false,
    callbackTeam: '', callbackPhone: '', callbackHours: '', callbackFallback: '', revision: 'c'.repeat(64) };
  const noCall = { ...clone(PAYLOAD), unitProfiles: [noCallProfile] };
  const callbackNo = { ...callback, unit: { name: '', phone: '', profile: 'fixture-no-callback' } };
  const callbackSheet = P.sheet(callbackNo, data, noCall, approvedOptions(noCallProfile, { callback: ARRANGED_CALL }));
  assert.equal(P.blocker(callbackNo, data, gateOff, callbackSheet, false).code, 'CALLBACK_UNCONFIRMED');
  assert.equal(P.blocker(callbackNo, data, gateOff, callbackSheet, true).code, 'CALLBACK_UNCONFIRMED', 'Copy cannot bypass the arrangement rule');
  // A saved listing that has become ineligible: before the confirmations, for Print and Copy alike.
  const mixed = P.validate(feed([row(0), row(1, { category: 'crisis' })]));
  const inel = { ...state, ids: ['a0', 'a1'] };
  const inelSheet = P.sheet(inel, mixed, PROFILED, approvedOptions());
  assert.equal(P.blocker(inel, mixed, gateOff, inelSheet, false).code, 'INELIGIBLE');
  assert.equal(P.blocker(inel, mixed, gateOff, inelSheet, true).code, 'INELIGIBLE', 'an ineligible listing would be in the copied text too');
  // NOT_FINAL is the last thing Copy is told.
  const review = { ...state, mode: 'review' };
  const reviewSheet = P.sheet(review, data, PROFILED, approvedOptions());
  assert.equal(P.blocker(review, data, gateOn, { ...reviewSheet, blockers: [{ code: 'LISTING_TEXT', message: 'remove it' }] }, true).code, 'LISTING_TEXT');
  assert.equal(P.blocker(review, data, gateOff, reviewSheet, true).code, 'REVIEW');
  assert.equal(P.blocker(review, data, gateOn, reviewSheet, true).code, 'NOT_FINAL');
});

// ---- the gate is re-armed by anything that adds or changes what is printed ---------------------------------------
test('every packet change re-arms all four review confirmations; unchanged values do not', () => {
  const rearmed = c => Object.values(c.gate()).every(v => v === false);
  const intact = c => Object.values(c.gate()).every(v => v === true);
  const { c } = mounted();
  c.toggle('a1');
  const arm = () => confirmAll(c);

  arm(); c.setUnit('name', '4 East');
  assert.ok(rearmed(c), 'typing the ward\'s name changes what prints');
  arm(); c.setUnit('name', '4 East');
  assert.ok(intact(c), 'committing the same value again changes nothing');
  arm(); c.setUnit('phone', '(207) 555-0100');
  assert.ok(rearmed(c), 'the ward\'s phone changes what prints');
  arm(); c.setInsert('safety', true);
  assert.ok(rearmed(c), 'switching a page ON adds content nobody reviewed');
  arm(); c.setInsert('safety', false);
  assert.ok(rearmed(c), 'removing a page changes the reviewed packet too');
  arm(); c.setInsert('warning', false);
  assert.ok(rearmed(c));
  arm(); c.setInsert('warning', true);
  assert.ok(rearmed(c), 'switching a default page back on adds it again');
  arm(); c.setMode('final');
  assert.ok(rearmed(c), 'the mode changes the reviewed packet');
  arm(); c.setMode('review');
  assert.ok(rearmed(c));
  arm(); c.toggle('a2');
  assert.ok(rearmed(c), 'a new listing (PR B rule, unchanged)');
});

// Rewritten: the Final copy loads the fixture profile, and the re-arming edit is a page switched on (a profile's unit
// details cannot be typed over).
test('print() and copy() refuse while the confirmations are stale, whatever the buttons look like', () => {
  const { c } = mountedP();
  readyFinal(c);
  c.setInsert('safety', true); // re-arms
  assert.deepEqual(c.gate(), gateOff, 'precondition: the confirmations are stale');
  const printed = c.print();
  assert.equal(printed.ok, false);
  assert.equal(printed.code, 'REVIEW', 'refused for the right reason, not because there is no document');
  assert.equal(c.copy().code, 'REVIEW');
  confirmAll(c);
  assert.equal(c.print().code, 'NO_DOCUMENT', 'with the confirmations back the only thing missing is a browser (this suite has none)');
});

test('an unfinished edit is committed before printing, and committing re-arms and refuses', async () => {
  const { c, preview } = mounted();
  c.toggle('a1');
  c.setUnit('phone', '(207) 555-0100');
  confirmAll(c);
  c.openPreview();
  // The trainee typed a name and pressed Print without leaving the field: the input still holds an uncommitted value.
  c.handleInput(fakeField('name', 'Bed 4'));
  const result = c.print();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNIT_UNCONFIRMED');
  assert.deepEqual(c.gate(), gateOff, 'committing the pending draft invalidates all four confirmations');
  await settle();
  assert.equal(preview.pieces.controls.innerHTML.includes('Bed 4'), true, 'the committed value is what the controls now show');
});

// ---- typing, committing, Escape ---------------------------------------------------------------------------
test('typing repaints the draft without exposing unapproved details and touches neither storage nor the announcer', async () => {
  const { c, storage, live, preview } = mounted();
  c.toggle('a1');
  await settle();
  live.textContent = '';
  c.openPreview();
  await settle();
  live.textContent = '';
  const before = storage.m.get('fd_care_packet_v1');
  const controlWrites = preview.pieces.controls.writes;
  const pageWrites = preview.pieces.pages.writes;
  c.handleInput(fakeField('name', 'Unit 4 East'));
  assert.equal(storage.m.get('fd_care_packet_v1'), before, 'storage is written on change, not on input');
  await settle();
  assert.doesNotMatch(preview.pieces.pages.innerHTML, /Unit 4 East/, 'unapproved details stay out of the patient pages');
  assert.match(preview.pieces.pages.innerHTML, /Draft for editing/, 'the preview remains explicitly a draft');
  assert.ok(preview.pieces.pages.writes > pageWrites, 'and they really were repainted');
  assert.equal(preview.pieces.controls.writes, controlWrites, 'the controls (and the focused field in them) are not written to while typing');
  assert.equal(live.textContent, '', 'nothing is announced per keystroke');
});

test('committing the field saves it and re-arms the gate with an announcement', async () => {
  const { c, storage, live } = mounted();
  c.toggle('a1');
  confirmAll(c);
  await settle();
  const result = c.handleChange(fakeField('phone', '207-555-0100'));
  assert.deepEqual(savedKey(storage).unit, { name: '', phone: '207-555-0100', profile: '' }, 'the typed value is stored as typed; validation happens at use');
  assert.deepEqual(c.gate(), gateOff);
  assert.deepEqual(result, { attr: 'data-fd-care-packet-unit-field', id: 'phone', keep: true }, 'focus stays in the field');
  await settle();
  assert.equal(live.textContent, 'Unit phone saved. Candidate phone: (207) 555-0100. It cannot be printed or copied until approved. Review confirmations cleared.',
    'the saved number is read back, so a transposed digit is heard before printing');
});

test('radios and page checkboxes route through handleChange', () => {
  const { c, storage } = mounted();
  c.toggle('a1');
  assert.deepEqual(c.handleChange(fakeChoice('data-fd-care-packet-mode', 'final')), { attr: 'data-fd-care-packet-mode', id: 'final', keep: true });
  assert.equal(savedKey(storage).mode, 'final');
  assert.deepEqual(c.handleChange(fakeChoice('data-fd-care-packet-insert', 'safety', true)), { attr: 'data-fd-care-packet-insert', id: 'safety', keep: true });
  assert.equal(savedKey(storage).inserts.safety, true);
  c.handleChange(fakeChoice('data-fd-care-packet-insert', 'warning', false));
  assert.equal(savedKey(storage).inserts.warning, false);
  assert.equal(c.handleChange(fakeChoice('data-fd-care-packet-insert', 'intro', false)), null, 'a core page has no switch');
  assert.equal(c.handleChange(fakeChoice('data-fd-care-packet-insert', '__proto__', true)), null, 'unknown names are ignored');
  assert.equal(c.handleChange(fakeChoice('data-fd-care-packet-mode', 'sideways')), null);
});

// ---- the unit profile -----------------------------------------------------------------------------------------
test('a profile loads only from its Load button: the select\'s change event is not the packet\'s and changes nothing', async () => {
  const controls = fakeControls();
  const { c, storage, live } = mountedP(6, { preview: fakePreview(controls) });
  c.toggle('a1');
  c.openPreview();
  confirmAll(c);
  await settle();
  live.textContent = '';
  const select = { value: 'fixture-unit', hasAttribute: k => k === 'data-fd-care-packet-profile-select', getAttribute: k => (k === 'data-fd-care-packet-profile-select' ? '' : null) };
  assert.equal(c.owns(select), false, 'the directory controller never routes the select to the packet');
  assert.equal(c.handleChange(select), null);
  assert.equal(savedKey(storage).unit.profile, '', 'choosing in the select loads nothing');
  assert.deepEqual(c.gate(), gateOn, 'and re-arms nothing');
  await settle();
  assert.equal(live.textContent, '', 'and says nothing');
  // The button reads whatever the select holds when it is pressed.
  controls.nodes['[data-fd-care-packet-profile-select]'].value = '';
  assert.deepEqual(c.handleClick(fakeButtonTarget('data-fd-care-packet-profile-load')), { attr: 'data-fd-care-packet-profile-load', id: '', keep: true });
  assert.equal(savedKey(storage).unit.profile, '', 'the empty choice loads nothing');
  controls.nodes['[data-fd-care-packet-profile-select]'].value = 'fixture-unit';
  assert.deepEqual(c.handleClick(fakeButtonTarget('data-fd-care-packet-profile-load')), { attr: 'data-fd-care-packet-profile-load', id: '', keep: true }, 'focus stays on the button');
  assert.equal(savedKey(storage).unit.profile, 'fixture-unit');
});

test('loadProfile(id) replaces typed details with the profile, re-arms the confirmations and says what it loaded; an unknown id is refused and changes nothing', async () => {
  const { c, storage, live } = mountedP();
  c.toggle('a1');
  c.setUnit('name', '4 East');
  c.setUnit('phone', '(207) 555-0100');
  confirmAll(c);
  await settle();
  for (const id of ['nope', '', 'Fixture-Unit', '__proto__', 'constructor', 7, null, undefined]) {
    live.textContent = '';
    assert.equal(c.loadProfile(id), false, String(id) + ' is refused');
    await settle();
    assert.equal(live.textContent, 'That unit profile is not available.', String(id) + ': the refusal is said');
  }
  assert.deepEqual(savedKey(storage).unit, { name: '4 East', phone: '(207) 555-0100', profile: '' }, 'a refused id changes nothing');
  assert.deepEqual(c.gate(), gateOn, 'and the confirmations stand');
  assert.equal(c.loadProfile('fixture-unit'), true);
  assert.deepEqual(savedKey(storage).unit, PROFILE_UNIT, 'the typed values are dropped, not kept beside the profile');
  assert.deepEqual(c.gate(), gateOff, 'a new unit identity re-arms the confirmations');
  await settle();
  assert.equal(live.textContent, 'Loaded unit profile Fixture unit (test only). Approved unit contact: (207) 555-0142. Review confirmations cleared.');
  confirmAll(c);
  assert.equal(c.loadProfile('fixture-unit-expired'), true, 'an expired candidate can load for editing but cannot gain approval');
  assert.deepEqual(c.gate(), gateOff);
  await settle();
  assert.equal(live.textContent, 'Unit approval could not be confirmed. Print and Copy are unavailable; draft editing remains available.');
  // An explicitly empty payload refuses every profile id.
  const noProfiles = mounted(6, { create: { payload: EMPTY_PROFILES } });
  noProfiles.c.toggle('a1');
  assert.equal(noProfiles.c.loadProfile('fixture-unit'), false);
  assert.equal(savedKey(noProfiles.storage).unit.profile, '');
});

test('unlinkProfile() starts the typed details empty, re-arms the confirmations and says so; without a loaded profile it does nothing', async () => {
  const { c, storage, live } = mountedP();
  c.toggle('a1');
  c.setUnit('name', '4 East');
  c.loadProfile('fixture-unit');
  confirmAll(c);
  await settle();
  live.textContent = '';
  assert.equal(c.unlinkProfile(), true);
  assert.deepEqual(savedKey(storage).unit, { name: '', phone: '', profile: '' }, 'neither the profile\'s values nor the name typed before it come back');
  assert.deepEqual(c.gate(), gateOff);
  await settle();
  assert.equal(live.textContent, 'Unit profile removed. Type your own unit details. Review confirmations cleared.');
  confirmAll(c);
  await settle();
  live.textContent = '';
  assert.equal(c.unlinkProfile(), false, 'nothing loaded: nothing to remove');
  assert.deepEqual(c.gate(), gateOn, 'and nothing re-armed');
  await settle();
  assert.equal(live.textContent, '');
  assert.equal(c.setUnit('name', 'Ward 5'), true, 'typing works again');
  c.loadProfile('fixture-unit');
  assert.deepEqual(c.handleClick(fakeButtonTarget('data-fd-care-packet-profile-unlink')), { attr: 'data-fd-care-packet-unit-field', id: 'name' }, 'the button sends focus to the name field');
  assert.equal(savedKey(storage).unit.profile, '');
});

test('while a profile is loaded the typed fields are not the unit: setUnit and a field commit are ignored and the confirmations stand', () => {
  const { c, storage } = mountedP();
  readyFinal(c);
  const before = storage.m.get(P.KEY);
  assert.equal(c.setUnit('name', 'Ward 5'), false);
  assert.equal(c.setUnit('phone', '(207) 555-0100'), false);
  assert.equal(c.handleChange(fakeField('phone', '(207) 555-0100')), null);
  assert.equal(storage.m.get(P.KEY), before, 'nothing saved');
  assert.deepEqual(c.gate(), gateOn, 'nothing re-armed');
});

test('the preview controls follow a load, an unlink and a typed commit IN PLACE (values, read-only, status, readback), and a field being typed in keeps its text', async () => {
  const controls = fakeControls();
  const { c } = mountedP(6, { preview: fakePreview(controls) });
  c.toggle('a1');
  c.openPreview();
  const built = controls.writes;
  assert.equal(built, 1, 'the controls are written once, when the preview opens');
  const n = controls.nodes;
  const name = n['#fd-care-packet-unit-name'], phone = n['#fd-care-packet-unit-phone'];
  const status = () => n['[data-fd-care-packet-profile-status]'].textContent, readback = () => n['[data-fd-care-packet-readback]'].textContent;

  c.loadProfile('fixture-unit');
  assert.equal(controls.writes, built, 'patched, not rewritten: the Print button the trainee may be about to press stays the same node');
  assert.equal(name.value, 'Fixture Unit 4 East');
  assert.equal(phone.value, '(207) 555-0142');
  assert.equal(name.readOnly, true);
  assert.equal(phone.readOnly, true);
  assert.equal(status(), 'Loaded: Fixture unit (test only). Approval checked. Expires on 2100-01-01 (America/New_York).');
  assert.equal(n['[data-fd-care-packet-profile-unlink]'].hidden, false);
  assert.equal(n['[data-fd-care-packet-profile-select]'].value, 'fixture-unit');
  assert.equal(readback(), 'Approved unit contact: (207) 555-0142.');
  assert.equal(n['[data-fd-care-packet-print]'].disabled, true, 'the confirmations were re-armed');
  confirmAll(c);
  assert.equal(n['[data-fd-care-packet-print]'].disabled, false);

  c.unlinkProfile();
  assert.equal(controls.writes, built);
  assert.equal(name.value, '');
  assert.equal(phone.value, '');
  assert.equal(name.readOnly, false);
  assert.equal(phone.readOnly, false);
  assert.equal(n['[data-fd-care-packet-profile-unlink]'].hidden, true);
  assert.equal(n['[data-fd-care-packet-profile-select]'].hidden, false, 'the profile can still be chosen again');
  assert.equal(status(), '');
  assert.equal(readback(), 'No approved unit contact is loaded. You can keep editing this draft.');

  c.setUnit('phone', '(207) 555-0100');
  await settle();
  assert.equal(controls.writes, built);
  assert.equal(phone.value, '(207) 555-0100');
  assert.equal(status(), 'Using the details you typed. They are not a confirmed profile.');
  assert.equal(readback(), 'Candidate phone: (207) 555-0100. It cannot be printed or copied until approved.');

  // A field with a pending draft keeps what the trainee is typing; one without follows the saved value.
  name.value = 'Ward 5 (still typing)';
  c.handleInput(fakeField('name', 'Ward 5 (still typing)'));
  phone.value = 'stale';
  c.setMode('final');
  assert.equal(name.value, 'Ward 5 (still typing)', 'never overwritten under the caret');
  assert.equal(phone.value, '(207) 555-0100');
  assert.equal(controls.writes, built);

  // Loading drops the draft: the profile is the only source of the unit.
  c.loadProfile('fixture-unit');
  assert.equal(name.value, 'Fixture Unit 4 East');
  assert.equal(controls.writes, built);

  // Clear empties the listings, so the preview closes; reopened, the controls are fresh and empty.
  c.clear();
  assert.equal(c.previewOpen(), false);
  c.toggle('a1');
  c.openPreview();
  assert.equal(controls.writes, built + 1);
  assert.match(inputOf(controls.innerHTML, 'name'), /value=""/);
  assert.match(inputOf(controls.innerHTML, 'phone'), /value=""/);
  assert.doesNotMatch(controls.innerHTML, /readonly/);
  assert.match(controls.innerHTML, /data-fd-care-packet-profile-unlink hidden/);
});

test('Preview opens and closes as a disclosure, Escape closes it from inside it or on its button only, and leaving Care closes it', () => {
  const { c, preview } = mounted();
  c.toggle('a1');
  assert.equal(c.previewOpen(), false);
  assert.equal(preview.hidden, true);
  const toggle = fakeButtonTarget('data-fd-care-packet-preview-toggle');
  assert.deepEqual(c.handleClick(toggle), { attr: 'data-fd-care-packet-preview-toggle', id: '' });
  assert.equal(c.previewOpen(), true);
  assert.equal(preview.hidden, false);
  assert.match(preview.innerHTML + preview.pieces.controls.innerHTML, /Copy to print/);

  const inside = { key: 'Escape', isComposing: false, defaultPrevented: false, target: { closest: s => (/preview/.test(s) ? {} : null) } };
  assert.equal(c.handleKey({ ...inside, target: { closest: () => null } }), null, 'Escape elsewhere (the search box) is not ours');
  assert.equal(c.handleKey({ ...inside, isComposing: true }), null, 'Escape during IME composition');
  assert.equal(c.handleKey({ ...inside, defaultPrevented: true }), null);
  assert.equal(c.handleKey({ ...inside, key: 'Tab' }), null);
  assert.equal(c.previewOpen(), true);
  assert.deepEqual(c.handleKey(inside), { attr: 'data-fd-care-packet-preview-toggle', id: '' }, 'focus goes back to the Preview button');
  assert.equal(c.previewOpen(), false);
  assert.equal(preview.hidden, true);

  c.openPreview();
  c.leave();
  assert.equal(c.previewOpen(), false, 'leaving Care closes it');
});

test('Preview cannot open on an empty packet', () => {
  const { c, preview } = mounted();
  assert.equal(c.openPreview(), false);
  assert.equal(c.previewOpen(), false);
  assert.equal(preview.hidden, true);
});

test('removing the last listing while the preview is open closes it', () => {
  const { c } = mounted();
  c.toggle('a1');
  c.openPreview();
  assert.equal(c.previewOpen(), true);
  c.remove('a1');
  assert.equal(c.previewOpen(), false, 'there is nothing left to preview');
});

test('announcements: opening says the page count and what is in the way; switching a page says the new count', async () => {
  const { c, live } = mountedP();
  c.toggle('a1');
  c.loadProfile('fixture-unit');
  await settle();
  c.openPreview();
  await settle();
  assert.match(live.textContent, /Preview open\. \d+ pages?, Review copy\./);
  assert.match(live.textContent, /Finish the four review confirmations/);
  c.setInsert('safety', true);
  await settle();
  assert.match(live.textContent, /\d+ pages? · Review copy/);
  confirmAll(c);
  await settle();
  assert.match(live.textContent, /Review complete\./);
  assert.match(live.textContent, /Print/);
});

// ---- structure pins ----------------------------------------------------------------------------------------
// Rewritten: without a payload nothing can be ADDED any more (eligibility fails closed), so the refusal to print is shown
// on a packet saved earlier in the tab.
test('the production default: the controller reads the injected payload when none is passed; without one nothing is added and a saved packet refuses', () => {
  const data = dataOf(6);
  const withPreview = fakePreview();
  const withPayload = load(store(), PAYLOAD).create({ storage: store() });
  withPayload.mount(null, null, () => data, null, withPreview);
  assert.equal(withPayload.toggle('a1'), 'added');
  assert.equal(withPayload.openPreview(), true);
  assert.match(withPreview.pieces.pages.innerHTML, /Page 1 of \d+/, 'the injected global is what the preview renders from');
  const without = load(store(), null).create({ storage: store() });
  without.mount(null, null, () => data, null, fakePreview());
  assert.equal(without.toggle('a1'), 'ineligible', 'no payload: there are no crisis numbers to check a listing against, so nothing is added');
  assert.deepEqual(without.ids(), []);
  const saved = store();
  saved.setItem(P.KEY, JSON.stringify({ ids: ['a1'], inserts: {}, mode: 'review', unit: { name: '', phone: '', profile: '' } }));
  const strandedPreview = fakePreview();
  const stranded = load(store(), null).create({ storage: saved });
  stranded.mount(null, null, () => data, null, strandedPreview);
  confirmAll(stranded);
  assert.equal(stranded.openPreview(), true, 'a packet saved before the payload went missing can still be looked at');
  assert.doesNotMatch(strandedPreview.pieces.pages.innerHTML, /fd-packet-page/, 'no payload: no pages at all');
  assert.match(strandedPreview.pieces.pages.innerHTML, /crisis lines did not load/);
  assert.equal(stranded.print().code, 'CRISIS_UNAVAILABLE', 'no payload: refuse, never print without the crisis lines');
  assert.equal(stranded.printCard().code, 'CRISIS_UNAVAILABLE', 'nor the wallet card');
});

test('the module header and search wiring describe the preview, not "printing arrives in the next release"', () => {
  assert.doesNotMatch(PACKET, /arrive in the next release/);
  assert.match(SEARCH, /data-fd-care-packet-preview/, 'the search panel emits the preview mount');
  assert.match(SEARCH, /handleInput/, 'typing in the ward\'s fields is routed to the packet');
  assert.match(SEARCH, /handleKey/, 'Escape is routed to the packet');
  assert.doesNotMatch(SEARCH, /sessionStorage|localStorage/, 'storage stays in fd_care_packet.js');
});

function fakeButtonTarget(attr) {
  return { hasAttribute: k => k === attr, getAttribute: k => (k === attr ? 'x' : null) };
}

// ---- review fixes: what the controller does around the sheet ---------------------------------------------------------
// A measurer for tests that install a fake document: the real DOM measurer needs a layout engine, which node does not have.
const FIXED_LAYOUT = { measure: units => ({ heights: units.map(() => 90), capacity: 880 }), verify: false };
const readyPacket = (c, mode = 'final') => {
  c.toggle('a1');
  c.setUnit('phone', '(207) 555-0100');
  c.setMode(mode);
  confirmAll(c);
};

// Just enough browser for the print lifecycle: a body and head to put nodes in, a title, and the two print events.
function fakeBrowser(t) {
  const handlers = {};
  const holder = () => {
    const box = { children: [], appendChild(node) { node.parentNode = box; box.children.push(node); return node; },
      removeChild(node) { node.parentNode = null; box.children = box.children.filter(n => n !== node); return node; } };
    return box;
  };
  const body = holder();
  const marks = new Set();
  body.classList = { add: name => marks.add(name), remove: name => marks.delete(name) };
  const head = holder();
  const doc = { title: 'Home', body, head, activeElement: null, querySelector: () => null,
    createElement: () => ({ parentNode: null, id: '', className: '', innerHTML: '', textContent: '' }) };
  const win = { printed: 0, print() { win.printed += 1; },
    addEventListener: (type, fn) => { handlers[type] = fn; }, removeEventListener: type => { delete handlers[type]; } };
  globalThis.document = doc;
  globalThis.window = win;
  t.after(() => { delete globalThis.document; delete globalThis.window; });
  return { handlers, doc, win, body, head, marks };
}

test('each output checks approval again and revocation blocks an already open packet in both modes', t => {
  const env=fakeBrowser(t);
  for(const mode of ['review','final']) {
    let approved=true,calls=0;
    const {c}=mountedP(6,{create:{sheet:FIXED_LAYOUT,authorizeProfile:profile=>{
      calls++;return approved?profileReceipt(profile,FIXED_LAYOUT.now):{ok:false,status:'revoked'};
    }}});
    readyFinal(c,mode);c.openPreview();
    const before=calls;
    assert.equal(c.print().ok,true);
    assert.equal(calls,before+1,'printing always rechecks');
    env.handlers.afterprint();approved=false;
    assert.equal(c.print().ok,false,'revocation takes effect without reload');
    assert.equal(env.body.children.length,0,'old patient print removed');
    assert.equal(c.copy().ok,false,'copy obeys the same authority');
    c.leave();
  }
});

test('a changed packet invalidates an outstanding approval response before any print is staged', async t => {
  const env=fakeBrowser(t);let finish,pending=false;
  const {c}=mountedP(6,{create:{sheet:FIXED_LAYOUT,authorizeProfile:profile=>pending?
    new Promise(resolve=>{finish=()=>resolve(profileReceipt(profile,FIXED_LAYOUT.now));}):profileReceipt(profile,FIXED_LAYOUT.now)}});
  readyFinal(c);c.openPreview();pending=true;
  const result=c.print();
  assert.equal(typeof result.then,'function');
  c.clear();finish();
  assert.equal((await result).ok,false);
  assert.equal(env.win.printed,0);
  assert.equal(env.body.children.length,0);
  c.leave();
});

// Rewritten: the Final copy loads the fixture profile, and focus is put inside the preview (the print command stages the
// packet only when it comes from inside the packet). The typing half runs on typed details, the only ones that can be typed.
test('opening a saved selected profile checks its approval immediately without requiring Load again', t => {
  const storage = store();
  storage.setItem(P.KEY, JSON.stringify({ ...P.blank(), ids: ['a1'], mode: 'final', unit: { ...PROFILE_UNIT } }));
  const checked = [];
  const { c, preview } = mountedP(6, { storage, create: { sheet: FIXED_LAYOUT,
    authorizeProfile: profile => { checked.push([profile.id, profile.revision]); return profileReceipt(profile, Date.now()); } } });
  t.after(() => c.leave());
  const before = checked.length;
  assert.equal(c.openPreview(), true);
  assert.equal(checked.length, before + 1, 'opening checks now, without waiting for the periodic refresh');
  assert.deepEqual(checked.at(-1), [FIXTURE.profile.id, FIXTURE.profile.revision]);
  assert.match(preview.pieces.controls.innerHTML, /Approval checked\./);
  assert.deepEqual(c.gate(), gateOff, 'restoring a profile never restores review confirmations');
});

test('a staged packet cannot reach native print after its approved profile expires', t => {
  const env = fakeBrowser(t);
  const sheet = { ...FIXED_LAYOUT, now: Date.UTC(2100, 0, 1, 4, 59, 59, 999) };
  const { c, preview } = mountedP(6, { create: { sheet } });
  t.after(() => c.leave());
  readyFinal(c); c.openPreview(); env.doc.activeElement = preview.inner;
  assert.deepEqual(c.print(), { ok: true, code: '' });
  assert.match(env.body.children[0].innerHTML, /fd-packet-page/, 'approved bytes were staged before expiry');
  sheet.now += 1;
  env.handlers.beforeprint();
  const staged = env.body.children.map(node => node.innerHTML).join('');
  assert.doesNotMatch(staged, /fd-packet-page|Fixture Unit 4 East|555-0142/, 'expiry is checked again at native print');
});

test('a staged packet is consumed by one native print event even when afterprint is missed', t => {
  const env = fakeBrowser(t);
  const { c, preview } = mountedP(6, { create: { sheet: FIXED_LAYOUT } });
  t.after(() => c.leave());
  readyFinal(c); c.openPreview(); env.doc.activeElement = preview.inner;
  assert.deepEqual(c.print(), { ok: true, code: '' });
  env.handlers.beforeprint();
  assert.match(env.body.children[0].innerHTML, /fd-packet-page/, 'the first event consumes the freshly approved packet');
  env.handlers.beforeprint();
  const staged = env.body.children.map(node => node.innerHTML).join('');
  assert.doesNotMatch(staged, /fd-packet-page|Fixture Unit 4 East|555-0142/, 'a second event cannot reuse those bytes');
});

test('Ctrl+P prints only a notice until the Print button checks approval and stages the packet; pending typed details also print only a notice', t => {
  const env = fakeBrowser(t);
  const { c, preview } = mountedP(6, { create: { sheet: FIXED_LAYOUT } });
  readyFinal(c);
  c.openPreview();
  env.doc.activeElement = preview.inner;
  env.handlers.beforeprint();
  assert.match(env.body.children[0].innerHTML, /This is not the patient packet/, 'native printing cannot await a fresh approval check');
  assert.doesNotMatch(env.body.children[0].innerHTML, /fd-packet-page|Fixture Unit 4 East/);
  env.handlers.afterprint();
  assert.equal(env.body.children.length, 0, 'and it is removed afterwards');
  assert.deepEqual(c.print(), { ok: true, code: '' }, 'the button checks approval and stages the packet');
  assert.match(env.body.children[0].innerHTML, /fd-packet-page/);
  assert.match(env.body.children[0].innerHTML, /Fixture Unit 4 East/);
  env.handlers.beforeprint();
  assert.match(env.body.children[0].innerHTML, /fd-packet-page/, 'the one-shot staged packet survives the native print event');
  env.handlers.afterprint();
  c.unlinkProfile();
  c.setMode('review');
  confirmAll(c);
  env.handlers.beforeprint();
  assert.match(env.body.children[0].innerHTML, /This is not the patient packet/, 'an unapproved Review copy cannot print');
  env.handlers.afterprint();
  c.handleInput(fakeField('name', 'Bed 4'));
  env.handlers.beforeprint();
  assert.match(env.body.children[0].innerHTML, /This is not the patient packet/);
  assert.doesNotMatch(env.body.children[0].innerHTML, /fd-packet-page/, 'a packet that silently lacks the typed text never reaches paper');
  env.handlers.afterprint();
  assert.equal(env.marks.size, 0, 'the body marker goes with the container');
});

test('native print inside the packet stages its notice; with focus elsewhere the ordinary page prints', t => {
  const env = fakeBrowser(t);
  const tray = fakeTray();
  const { c, preview } = mountedP(6, { root: tray.root, create: { sheet: FIXED_LAYOUT } });
  readyFinal(c);
  c.openPreview();
  const olderPackPrint = { olderPackPrintButton: true };
  const staged = () => env.body.children.length;
  env.doc.activeElement = preview.inner;
  env.handlers.beforeprint();
  assert.equal(staged(), 1, 'focus in the preview: the notice');
  assert.match(env.body.children[0].innerHTML, /This is not the patient packet/);
  env.handlers.afterprint();
  env.doc.activeElement = tray.inner;
  env.handlers.beforeprint();
  assert.equal(staged(), 1, 'focus in the tray: the notice');
  assert.doesNotMatch(env.body.children[0].innerHTML, /fd-packet-page|Fixture Unit 4 East/);
  env.handlers.afterprint();
  for (const [label, active] of [['a button outside the packet', olderPackPrint], ['the page body', env.doc.body], ['nothing focused', null]]) {
    env.doc.activeElement = active;
    env.handlers.beforeprint();
    assert.equal(staged(), 0, label + ': the ordinary page prints');
    assert.equal(env.doc.title, 'Home', label + ': the title is left alone');
    assert.equal(env.marks.size, 0, label + ': no body marker');
  }
  // Something staged by an earlier print command whose afterprint never came is removed, not printed again.
  env.doc.activeElement = preview.inner;
  env.handlers.beforeprint();
  assert.equal(staged(), 1);
  env.doc.activeElement = olderPackPrint;
  env.handlers.beforeprint();
  assert.equal(staged(), 0, 'the staged packet is removed');
  assert.equal(env.head.children.length, 0, 'with its page rule');
  assert.equal(env.marks.size, 0);
  assert.equal(env.doc.title, 'Home');
  // A closed preview stages nothing, even with focus in the tray.
  c.closePreview();
  env.doc.activeElement = tray.inner;
  env.handlers.beforeprint();
  assert.equal(staged(), 0);
});

test('with no preview node mounted the controller adds no print listener, so the older print workflow is left alone', t => {
  const env = fakeBrowser(t);
  const c = P.create({ storage: store(), payload: PROFILED });
  c.mount(fakeTray().root, fakeLive(), () => dataOf(3), null);
  assert.deepEqual(Object.keys(env.handlers), [], 'no preview: no listener');
  c.mount(null, fakeLive(), () => dataOf(3), null, fakePreview());
  assert.deepEqual(Object.keys(env.handlers).sort(), ['afterprint', 'beforeprint', 'focus']);
  c.mount(null, fakeLive(), () => dataOf(3), null, null);
  assert.deepEqual(Object.keys(env.handlers), [], 'a remount without a preview removes them');
  c.mount(null, fakeLive(), () => dataOf(3), null, fakePreview());
  c.leave();
  assert.deepEqual(Object.keys(env.handlers), [], 'leaving Care removes them');
});

// The printable packet loads the independently approved fixture profile.
test('the page title is put back after printing only if nothing else changed it meanwhile', t => {
  const env = fakeBrowser(t);
  const { c } = mountedP(6, { create: { sheet: FIXED_LAYOUT } });
  readyFinal(c);
  assert.deepEqual(c.print(), { ok: true, code: '' });
  assert.equal(env.win.printed, 1);
  assert.equal(env.doc.title, P.TITLE, 'the print uses its own title');
  env.handlers.afterprint();
  assert.equal(env.doc.title, 'Home', 'put back when it is still ours');
  assert.deepEqual(c.print(), { ok: true, code: '' });
  env.doc.title = 'Care directory';
  env.handlers.afterprint();
  assert.equal(env.doc.title, 'Care directory', 'a title the app set in between is not overwritten with a stale one');
  assert.equal(env.body.children.length, 0);
});

// ---- Final-copy rules -----------------------------------------------------------------------------------------
test('a Final copy with the loaded fixture profile prints, naming the unit, and copies text that names no unit', async t => {
  const env = fakeBrowser(t);
  const { c, preview } = mountedP(6, { create: { sheet: FIXED_LAYOUT } });
  readyFinal(c);
  c.openPreview();
  assert.deepEqual(c.print(), { ok: true, code: '' });
  assert.equal(env.win.printed, 1);
  const paper = env.body.children[0].innerHTML;
  assert.match(paper, /<p class="fd-packet-org">Test Org · Fixture Unit 4 East<\/p>/, 'the org line comes only from a loaded, branding-approved profile');
  assert.match(paper, /\(207\) 555-0142/, 'the confirmed unit phone fills the unit tokens');
  assert.doesNotMatch(paper, /data-fd-packet-draft/);
  env.handlers.afterprint();
  assert.equal(c.copy().code, 'NO_CLIPBOARD', 'nothing blocks Copy; this suite has no clipboard, so the text is shown instead');
  const copied = preview.pieces.controls.innerHTML.split('id="fd-care-packet-copy-text"')[1] || '';
  assert.match(copied, /Places that can help/, 'precondition: the copied text is shown');
  assert.doesNotMatch(copied, /555-0142|Fixture Unit|Test Org/, 'the copied text names no unit');
});

test('typed details block Print and Copy in both modes before the confirmations and keep the phone out of patient output', async t => {
  const env = fakeBrowser(t);
  const NEED_APPROVAL = 'Print and Copy need an approved unit profile. You can keep editing this draft.';
  for (const mode of ['review', 'final']) {
    const profiled = mountedP(6, { create: { sheet: FIXED_LAYOUT } });
    readyPacket(profiled.c, mode);
    profiled.c.openPreview();
    assert.deepEqual(profiled.c.print(), { ok: false, code: 'UNIT_UNCONFIRMED' });
    await settle();
    assert.equal(profiled.live.textContent, NEED_APPROVAL, 'the refusal explains that draft editing remains available');
    assert.match(profiled.preview.pieces.controls.innerHTML, /Load the profile to check its approval/);
    assert.equal(env.win.printed, 0);
    assert.equal(env.body.children.length, 0, 'nothing staged');
    assert.doesNotMatch(profiled.preview.pieces.pages.innerHTML, /555-0100/, 'the candidate phone is not patient output');
    profiled.c.setGate('region', false);
    assert.equal(profiled.c.print().code, 'UNIT_UNCONFIRMED', 'named before the confirmations');
    assert.equal(profiled.c.copy().code, 'UNIT_UNCONFIRMED', 'Copy cannot bypass approval');
    confirmAll(profiled.c);
    assert.equal(profiled.c.copy().code, 'UNIT_UNCONFIRMED', 'all four confirmations still cannot replace approval');
    profiled.c.leave();
  }
  const shipped = mounted(6, { create: { sheet: FIXED_LAYOUT } });
  readyPacket(shipped.c);
  assert.deepEqual(shipped.c.print(), { ok: false, code: 'UNIT_UNCONFIRMED' });
  await settle();
  assert.equal(shipped.live.textContent, NEED_APPROVAL, 'typed details remain unconfirmed with the real candidate list');
  shipped.c.openPreview();
  await settle();
  shipped.c.handleChange(fakeField('name', 'Ward 4'));
  await settle();
  assert.match(shipped.live.textContent, /Unit name saved\. Review confirmations cleared\./);
  assert.equal(shipped.c.print().code, 'UNIT_UNCONFIRMED');
  assert.equal(shipped.c.copy().code, 'UNIT_UNCONFIRMED');
  assert.doesNotMatch(shipped.preview.pieces.pages.innerHTML, /Ward 4|555-0100/);
});

test('an expired profile blocks both outputs in both modes, with expiry at New York midnight after the last usable date', async t => {
  const env = fakeBrowser(t);
  const DENIED = 'Unit approval could not be confirmed. Print and Copy are unavailable; draft editing remains available.';
  const lastMillisecond = Date.UTC(2100, 0, 1, 4, 59, 59, 999);
  for (const mode of ['review', 'final']) {
    const expired = mountedP(6, { create: { sheet: FIXED_LAYOUT } });
    expired.c.toggle('a1');
    expired.c.loadProfile('fixture-unit-expired');
    expired.c.setMode(mode);
    confirmAll(expired.c);
    expired.c.openPreview();
    assert.deepEqual(expired.c.print(), { ok: false, code: 'UNIT_UNCONFIRMED' });
    await settle();
    assert.equal(expired.live.textContent, DENIED);
    assert.equal(expired.c.copy().code, 'UNIT_UNCONFIRMED', 'an expired profile also blocks Copy');
    assert.doesNotMatch(expired.preview.pieces.pages.innerHTML, /555-0142|Fixture Unit 4 East/);
    assert.match(expired.preview.pieces.controls.innerHTML, /expired on 2020-01-02 \(America\/New_York\)/);
    expired.c.leave();
    const late = mountedP(6, { create: { sheet: { ...FIXED_LAYOUT, now: lastMillisecond + 1 } } });
    readyFinal(late.c, mode);
    assert.deepEqual(late.c.print(), { ok: false, code: 'UNIT_UNCONFIRMED' }, 'the first invalid New York millisecond');
    assert.equal(late.c.copy().code, 'UNIT_UNCONFIRMED');
    late.c.leave();
    const onTime = mountedP(6, { create: { sheet: { ...FIXED_LAYOUT, now: lastMillisecond } } });
    readyFinal(onTime.c, mode);
    assert.deepEqual(onTime.c.print(), { ok: true, code: '' }, 'the last New York millisecond remains usable');
    env.handlers.afterprint();
    onTime.c.leave();
  }
  assert.equal(env.win.printed, 2, 'only the two unexpired copies reached the printer');
});

// ---- the wallet card ------------------------------------------------------------------------------------------
test('printCard() prints the wallet card by itself: one card page in #fdPacketPrint, its own title, one print, focus back on the card button', t => {
  const env = fakeBrowser(t);
  const tray = fakeTray();
  const { c, storage } = mounted(6, { root: tray.root, create: { sheet: FIXED_LAYOUT } });
  assert.deepEqual(c.ids(), [], 'no listings at all');
  assert.deepEqual(c.printCard(), { ok: true, code: '' }, 'the card needs only the payload');
  assert.equal(env.win.printed, 1);
  assert.equal(env.body.children.length, 1);
  const host = env.body.children[0];
  assert.equal(host.id, 'fdPacketPrint');
  assert.equal((host.innerHTML.match(/class="fd-packet-page[ "]/g) || []).length, 1, 'one page');
  assert.match(host.innerHTML, /data-fd-packet-card="crisis"/);
  assert.match(host.innerHTML, /data-fd-packet-card="mine"/);
  assert.doesNotMatch(host.innerHTML, /data-fd-packet-res|data-fd-packet-unit=|Page 1 of/, 'nothing of the packet');
  for (const id of PAYLOAD.required) {
    assert.ok(host.innerHTML.includes(esc(PAYLOAD.contacts[id].name)), id + ': the official name');
    assert.ok(host.innerHTML.includes(esc(PAYLOAD.contacts[id].contact)), id + ': the contact');
  }
  assert.equal(env.doc.title, PAYLOAD.card.title, 'the print uses the card\'s title');
  assert.equal(env.marks.has('fd-packet-printing'), true);
  assert.equal(env.head.children.length, 1, 'the page rule for this print');
  assert.deepEqual(c.printCard(), { ok: false, code: 'BUSY' }, 'one print at a time');
  assert.deepEqual(c.print(), { ok: false, code: 'BUSY' }, 'the packet waits too');
  assert.equal(env.win.printed, 1);
  env.handlers.afterprint();
  assert.equal(env.doc.title, 'Home');
  assert.equal(env.body.children.length, 0);
  assert.equal(env.head.children.length, 0);
  assert.equal(env.marks.size, 0);
  assert.equal(tray.cardButton.focused, 1, 'focus returns to the card button');
  assert.equal(storage.m.size, 0, 'the card saved nothing');
  assert.deepEqual(c.printCard(), { ok: true, code: '' }, 'after the print, the card can print again');
  env.handlers.afterprint();
});

test('the wallet card never touches the review confirmations, the copy, the unit or the listings', t => {
  const env = fakeBrowser(t);
  const tray = fakeTray();
  const { c, storage } = mountedP(6, { root: tray.root, create: { sheet: FIXED_LAYOUT } });
  readyFinal(c);
  c.openPreview();
  const before = storage.m.get(P.KEY);
  assert.deepEqual(c.printCard(), { ok: true, code: '' });
  assert.equal(storage.m.get(P.KEY), before, 'the saved packet is untouched');
  assert.deepEqual(c.gate(), gateOn, 'the confirmations stand');
  assert.equal(c.mode, 'final');
  assert.equal(c.previewOpen(), true);
  assert.doesNotMatch(env.body.children[0].innerHTML, /Fixture Unit|555-0142|Test Org|data-fd-packet-res/, 'the card names no unit and carries no listing');
  env.handlers.afterprint();
  assert.equal(tray.cardButton.focused, 1, 'focus goes back to the card button, not to Print packet');
  c.setGate('region', false);
  c.setMode('review');
  const beforeCard = c.gate();
  assert.deepEqual(beforeCard, gateOff, 'changing mode legitimately resets all four confirmations');
  assert.deepEqual(c.printCard(), { ok: true, code: '' }, 'unconfirmed and a Review copy: the card still prints');
  assert.deepEqual(c.gate(), beforeCard, 'the card preserves exactly the confirmations that preceded it');
  env.handlers.afterprint();
});

test('a wallet card that cannot be built says why beside its button and out loud, and prints nothing', async t => {
  const env = fakeBrowser(t);
  const six = clone(PAYLOAD);
  six.crisis = [...six.crisis, clone(six.crisis[0])];
  assert.ok(six.crisis.length > 5, 'precondition: more crisis lines than the card holds');
  const tray = fakeTray();
  const { c, live } = mounted(6, { root: tray.root, create: { payload: six, sheet: FIXED_LAYOUT } });
  assert.doesNotMatch(tray.root.innerHTML.match(/<button[^>]*data-fd-care-packet-card-print[^>]*>/)[0], /disabled/, 'the tray cannot know in advance: the button is offered');
  assert.deepEqual(c.printCard(), { ok: false, code: 'CARD_UNAVAILABLE' });
  assert.equal(env.win.printed, 0);
  assert.equal(env.body.children.length, 0);
  assert.equal(env.doc.title, 'Home');
  assert.equal(tray.cardNote.textContent, 'The wallet card could not be built, so it cannot print.', 'the note beside the button says why');
  await settle();
  assert.equal(live.textContent, 'The wallet card could not be built, so it cannot print.');
  // A tray that has to be repainted carries the same reason.
  let html = '';
  const bare = { isConnected: true, get innerHTML() { return html; }, set innerHTML(value) { html = value; } };
  const repainted = mounted(6, { root: bare, create: { payload: six, sheet: FIXED_LAYOUT } });
  repainted.c.printCard();
  assert.match(html, /data-fd-care-packet-card-note>The wallet card could not be built, so it cannot print\.<\/p>/);
  // With no card in the payload the button is disabled and its note says so.
  const noCard = clone(PAYLOAD);
  delete noCard.card;
  const missing = mounted(6, { root: bare, create: { payload: noCard, sheet: FIXED_LAYOUT } });
  assert.match(html, /<button[^>]*data-fd-care-packet-card-print[^>]*disabled[^>]*>Print wallet card<\/button><p[^>]*data-fd-care-packet-card-note>The wallet card did not load, so it cannot print\.<\/p>/);
  assert.equal(missing.c.printCard().code, 'CARD_UNAVAILABLE');
  assert.equal(env.win.printed, 0);
});

test('mounting into a NEW preview node starts clean: nothing from the old node is reused', () => {
  const { c, data, live } = mounted();
  c.toggle('a1');
  c.openPreview();
  const second = fakePreview();
  c.mount(null, live, () => data, null, second);
  assert.match(second.pieces.controls.innerHTML, /Copy to print/, 'the new node gets its own controls');
  assert.match(second.pieces.pages.innerHTML, /fd-packet-page/, 'and its own pages');
});

test('the copy fallback describes ONE packet: any change, a closed preview or a withdrawn confirmation removes it', async () => {
  const { c, preview } = mountedP();
  readyFinal(c);
  c.openPreview();
  const shown = () => preview.pieces.controls.innerHTML.includes('Copy this text');
  const stage = () => { c.loadProfile('fixture-unit'); confirmAll(c); assert.equal(c.copy().code, 'NO_CLIPBOARD', 'this suite has no clipboard, so the text is shown instead'); assert.equal(shown(), true, 'precondition'); };
  stage(); c.unlinkProfile(); c.setUnit('name', 'Ward 4'); await settle();
  assert.equal(shown(), false, 'a changed ward detail');
  stage(); c.setGate('region', false);
  assert.equal(shown(), false, 'a withdrawn confirmation');
  stage(); c.closePreview(); c.openPreview();
  assert.equal(shown(), false, 'a closed preview');
  stage(); c.toggle('a2');
  assert.equal(shown(), false, 'a changed listing');
  stage(); c.setInsert('safety', true);
  assert.equal(shown(), false, 'a changed page list');
});

// A late clipboard result belongs to the packet that started it, never a new or abandoned packet.
test('pending clipboard results cannot restore old text or announce success after the packet changes', async t => {
  for (const outcome of ['resolve', 'reject']) for (const change of ['edit', 'uncheck', 'clear', 'close', 'leave']) {
    await t.test(outcome + ' after ' + change, async t => {
      const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
      let finish;
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: {
        writeText: () => new Promise((resolve, reject) => { finish = outcome === 'resolve' ? resolve : reject; })
      } } });
      t.after(() => { if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator; });
      const { c, preview, live, data } = mountedP(6, { create: { sheet: FIXED_LAYOUT } });
      t.after(() => c.leave());
      readyFinal(c); c.openPreview(); await settle();
      assert.equal(c.copy().ok, true);
      if (change === 'edit') c.toggle('a2');
      if (change === 'uncheck') c.setGate('region', false);
      if (change === 'clear') c.clear();
      if (change === 'close') { c.closePreview(); c.openPreview(); }
      if (change === 'leave') { c.leave(); c.mount(null, live, () => data, null, preview); c.openPreview(); }
      await settle(); live.textContent = '';
      finish(outcome === 'reject' ? new Error('clipboard refused') : undefined);
      await settle();
      assert.doesNotMatch(preview.pieces.controls.innerHTML, /Copy this text/, 'old text stays discarded');
      assert.doesNotMatch(live.textContent, /Copied\.|Copy is unavailable/, 'no stale completion announcement');
    });
  }
});

test('pending clipboard rejection rechecks live authority before exposing manual fallback text', async t => {
  for (const revoked of [true, false]) {
    await t.test(revoked ? 'revocation blocks the delayed fallback' : 'current approval preserves the delayed fallback', async t => {
      const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
      let rejectClipboard, approvalRevoked = false, checks = 0;
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: {
        writeText: () => new Promise((_resolve, reject) => { rejectClipboard = reject; })
      } } });
      t.after(() => { if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator; });
      const { c, preview, live } = mountedP(6, { create: { sheet: FIXED_LAYOUT,
        authorizeProfile: profile => {
          checks += 1;
          return approvalRevoked ? { ok: false, status: 'revoked' } : profileReceipt(profile, Date.now());
        } } });
      t.after(() => c.leave());
      readyFinal(c); c.openPreview(); await settle();
      assert.equal(c.copy().ok, true, 'the clipboard write starts with current approval');
      const checksBeforeRejection = checks;
      approvalRevoked = revoked;
      live.textContent = '';
      rejectClipboard(new Error('clipboard permission denied'));
      await settle();
      if (revoked) {
        assert.doesNotMatch(preview.pieces.controls.innerHTML, /Copy this text|id="fd-care-packet-copy-text"/, 'revoked patient text is never exposed as a manual fallback');
        assert.deepEqual(c.gate(), gateOff, 'revocation invalidates the reviewed packet');
        assert.doesNotMatch(live.textContent, /Copied\.|Copy is unavailable here\. The text is shown below/, 'revocation cannot announce a successful or manual copy');
      } else {
        assert.match(preview.pieces.controls.innerHTML, /id="fd-care-packet-copy-text"/, 'permission denial retains the practical fallback when approval is still current');
        assert.match(live.textContent, /Copy is unavailable here\. The text is shown below/, 'the manual fallback is announced');
        assert.deepEqual(c.gate(), gateOn, 'a still-current packet keeps its confirmations');
      }
      assert.equal(checks, checksBeforeRejection + 1, 'the delayed failure requests a second live approval check');
    });
  }
});

test('pending clipboard results cannot expose text or announce success after the profile expires', async t => {
  for (const outcome of ['resolve', 'reject']) {
    await t.test(outcome + ' after New York expiry', async t => {
      const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
      let finish;
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: {
        writeText: () => new Promise((resolve, reject) => { finish = outcome === 'resolve' ? resolve : reject; })
      } } });
      t.after(() => { if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator; });
      const sheet = { ...FIXED_LAYOUT, now: Date.UTC(2100, 0, 1, 4, 59, 59, 999) };
      const { c, preview, live } = mountedP(6, { create: { sheet } });
      t.after(() => c.leave());
      readyFinal(c); c.openPreview(); await settle();
      assert.equal(c.copy().ok, true, 'the clipboard request begins while the profile is valid');
      sheet.now += 1;
      live.textContent = '';
      finish(outcome === 'reject' ? new Error('clipboard refused') : undefined);
      await settle();
      assert.doesNotMatch(preview.pieces.controls.innerHTML, /Copy this text/, 'expired text is not exposed as a fallback');
      assert.doesNotMatch(live.textContent, /Copied\.|Copy is unavailable/, 'an expired request never announces completion');
    });
  }
});

// Only typed details can be committed from a field. Draft editing keeps its focus even while Print and Copy remain blocked.
test('a unit field commit brings the preview controls up to date a task later, so focus lands first; the announcement describes the settled screen', async () => {
  const { c, live, preview } = mounted();
  readyPacket(c, 'review');
  c.openPreview();
  await settle();
  live.textContent = '';
  const writes = preview.pieces.controls.writes;
  c.handleChange(fakeField('name', 'Bed 4'));
  assert.equal(preview.pieces.controls.writes, writes, 'not yet: the focused control is retained until the next task');
  assert.deepEqual(c.gate(), gateOff, 'but the gate is already re-armed, so a click in between is refused');
  await settle();
  assert.ok(preview.pieces.controls.writes > writes, 'then the controls follow');
  assert.match(live.textContent, /Unit name saved\. Review confirmations cleared\./, 'the committed change and reset are announced');
  assert.equal(c.print().code, 'UNIT_UNCONFIRMED', 'a click on a stale Print still requires an approved profile');
  assert.doesNotMatch(preview.pieces.pages.innerHTML, /Bed 4/, 'the typed detail is not patient output');
});

// Rewritten: the Final copy that makes Copy (and Print) available now needs the fixture profile loaded.
test('an announcement adds what Print and Copy can now do only when that changed', async () => {
  const { c, live } = mountedP();
  readyFinal(c, 'review');
  c.openPreview();
  await settle();
  c.setInsert('warning', false);
  await settle();
  assert.match(live.textContent, /\d+ pages? · Review copy\./);
  assert.match(live.textContent, /Finish the four review confirmations/, 'changing the page list invalidates its review');
  confirmAll(c);
  await settle();
  assert.match(live.textContent, /Print is available/, 'reviewing the changed packet enables Print');
  c.setMode('final');
  await settle();
  assert.match(live.textContent, /Final copy selected\./);
  assert.match(live.textContent, /Finish the four review confirmations/, 'changing the mode invalidates its review too');
  confirmAll(c);
  await settle();
  assert.match(live.textContent, /Print and Copy are available\./, 'the newly reviewed Final copy enables both');
  live.textContent = '';
  c.setMode('final');
  await settle();
  assert.equal(live.textContent, '', 'an unchanged value announces nothing');
});

// A tray stand-in that records writes to its innerHTML and offers the pieces patchTray looks for, including the wallet
// card's button and note. `inner` is a node inside the tray (where keyboard focus is when the trainee works in it).
function fakeTray() {
  const node = attrs => ({ checked: false, disabled: false, textContent: '', focused: 0, attrs: { ...attrs }, getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
    setAttribute(k, v) { this.attrs[k] = String(v); }, focus() { this.focused += 1; } });
  const boxes = ['verification', 'region', 'identifiers', 'supervisor'].map(key => node({ 'data-fd-care-packet-gate': key }));
  const ready = node({ 'data-fd-care-packet-ready': 'false' });
  const toggle = node({ 'aria-expanded': 'false' });
  const cardNote = node({ 'data-fd-care-packet-card-note': '' });
  const cardButton = node({ 'data-fd-care-packet-card-print': '' });
  const inner = { insideTray: true };
  let html = '';
  const root = { isConnected: true, writes: 0, get innerHTML() { return html; }, set innerHTML(value) { root.writes += 1; html = value; },
    contains: n => n === inner,
    querySelector(selector) {
      if (/card-note/.test(selector)) return cardNote;
      if (/card-print/.test(selector)) return cardButton;
      return /ready/.test(selector) ? ready : /preview-toggle/.test(selector) ? (/data-fd-care-packet-preview-toggle/.test(html) ? toggle : null) : null;
    },
    querySelectorAll(selector) { return /gate/.test(selector) ? boxes : []; } };
  return { root, boxes, ready, toggle, cardNote, cardButton, inner };
}
test('changes that do not touch the listings patch the tray in place; a changed listing repaints it', () => {
  const tray = fakeTray();
  const { c, data, live } = mounted();
  c.mount(tray.root, live, () => data, null, fakePreview());
  c.toggle('a1');
  const written = tray.root.writes;
  assert.ok(written >= 1, 'a listing change repaints the tray');
  confirmAll(c);
  assert.equal(tray.root.writes, written, 'confirmations are patched in place');
  assert.equal(tray.cardNote.textContent, 'A separate one-sided page: the crisis lines and space for your own numbers. It is not part of the packet. Print from Chrome or Edge with scale 100 and margins set to Default, so it stays card-sized.', 'the card note is patched too');
  assert.equal(tray.cardButton.disabled, false);
  assert.deepEqual(tray.boxes.map(box => box.checked), [true, true, true, true]);
  assert.equal(tray.ready.textContent, 'Review complete.');
  assert.equal(tray.ready.attrs['data-fd-care-packet-ready'], 'true');
  c.openPreview();
  assert.equal(tray.root.writes, written, 'opening the preview only flips aria-expanded');
  assert.equal(tray.toggle.attrs['aria-expanded'], 'true');
  c.setUnit('name', '4 East');
  assert.equal(tray.root.writes, written, 'a ward detail re-arms the boxes in place');
  assert.deepEqual(tray.boxes.map(box => box.checked), [false, false, false, false]);
  assert.match(tray.ready.textContent, /Finish the four review confirmations/);
  c.closePreview();
  assert.equal(tray.toggle.attrs['aria-expanded'], 'false');
  assert.equal(tray.root.writes, written);
  c.toggle('a2');
  assert.equal(tray.root.writes, written + 1, 'a changed listing list is a structural change: repainted');
});

test('the tray falls back to a repaint when its pieces are missing (never leaves a half-patched tray)', () => {
  const { c, data, live } = mounted();
  const bare = { isConnected: true, writes: 0, get innerHTML() { return ''; }, set innerHTML(v) { bare.writes += 1; } };
  c.mount(bare, live, () => data, null, fakePreview());
  c.toggle('a1');
  const before = bare.writes;
  c.setGate('region', true);
  assert.equal(bare.writes, before + 1, 'no querySelector on the tray: repaint');
});

test('the directory copy age: a notice after more than a week, none within it, and a pure function of its inputs', () => {
  const on = Date.UTC(2026, 9, 8);
  assert.equal(P.stale('2026-10-01T00:00:00Z', on), null, 'exactly seven days is not stale');
  assert.deepEqual(P.stale('2026-10-01T00:00:00Z', Date.UTC(2026, 9, 9)), { days: 8, date: '2026-10-01' });
  for (const bad of [undefined, null, 7, '', 'yesterday', '2026-13']) assert.equal(P.stale(bad, on), null, JSON.stringify(bad));
  assert.equal(P.stale('2026-10-01T00:00:00Z', NaN), null);
  assert.equal(P.stale('2026-10-01T00:00:00Z', '2026-10-30'), null, 'a non-numeric clock is not a date');
});
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString().replace(/\.\d+Z$/, 'Z');
const mountedWith = data => {
  const live = fakeLive();
  const preview = fakePreview();
  const c = P.create({ storage: store(), payload: PAYLOAD });
  c.mount(null, live, () => data, null, preview);
  return { c, live, preview };
};
test('the preview warns when the directory copy is old, and not when it is recent', () => {
  const records = Array.from({ length: 3 }, (_, i) => row(i));
  const old = mountedWith(P.validate({ ...feed(records), generatedAt: daysAgo(20) }));
  old.c.toggle('a1'); old.c.openPreview();
  assert.match(old.preview.pieces.pages.innerHTML, /data-fd-care-packet-stale/);
  assert.match(old.preview.pieces.pages.innerHTML, /20 days ago/);
  const recent = mountedWith(P.validate({ ...feed(records), generatedAt: daysAgo(2) }));
  recent.c.toggle('a1'); recent.c.openPreview();
  assert.doesNotMatch(recent.preview.pieces.pages.innerHTML, /data-fd-care-packet-stale/);
});

test('the preview says what was left off the paper and why, and lists the web addresses behind the QR codes outside the sheet', () => {
  const records = [
    row(0, { description: 'Call 1-888-568-1112 (24/7) about the schedule.' }),
    row(1, { description: 'Lovely place. Take 10 mg nightly.' }),
    row(2, { website: 'https://example.org/deep/link?x=1' }),
  ];
  const { c, preview } = mountedWith(P.validate(feed(records)));
  for (const id of ['a0', 'a1', 'a2']) c.toggle(id);
  c.openPreview();
  const pages = preview.pieces.pages.innerHTML;
  assert.match(pages, /Not printed: the description of “Support 0” \(it holds a crisis line number, and those print only in the crisis lines on page 1\)/);
  assert.match(pages, /Not printed: the description of “Support 1” \(it holds a verification note or a dose\)/);
  const [before, sheet] = pages.split('<div class="fd-packet-sheet');
  assert.match(before, /<details class="fd-care-packet-preview__addresses">/);
  assert.match(before, /https:\/\/example\.org\/deep\/link\?x=1/, 'the full address is shown in the preview, beside the sheet');
  assert.doesNotMatch(sheet, /deep\/link/, 'and the sheet itself is the same bytes as the paper');
  assert.match(before, /Web addresses behind the QR codes \(3\)/);
});

// Rewritten: the wallet card is no longer a page of the packet, so the hint no longer follows it or asks for one-sided printing.
test('the print hint is its own node, names the supported print path, and says nothing about the wallet card or one-sided printing', () => {
  const plain = P.controls({ ...P.blank(), ids: ['a0'] }, dataOf(3), PAYLOAD, gateOn, { unitErrors: { name: '', phone: '' } });
  const oldSwitch = P.controls({ ...P.blank(), ids: ['a0'], inserts: { card: true } }, dataOf(3), PAYLOAD, gateOn, { unitErrors: { name: '', phone: '' } });
  assert.equal(textOf(plain, 'data-fd-care-packet-hint'), P.hint(), 'its own node, holding the hint');
  assert.equal(P.hint(), 'Print from Chrome or Edge with margins set to Default and scale 100.');
  assert.equal(P.hint(true), P.hint(false), 'nothing the packet holds changes it');
  assert.doesNotMatch(P.hint(true), /one-sided|wallet|card/i);
  assert.equal(textOf(oldSwitch, 'data-fd-care-packet-hint'), P.hint(), 'a card switch left in state from an older tab changes nothing');
  assert.doesNotMatch(plain + oldSwitch, /data-fd-care-packet-insert="card"|one-sided/, 'and the card is not offered as a page');
});

test('a unit value that will not print is announced as needing a fix, never as saved', async () => {
  const { c, live } = mounted();
  readyPacket(c);
  c.openPreview();
  await settle();
  live.textContent = '';
  c.setUnit('phone', '911');
  await settle();
  assert.match(live.textContent, /Unit phone needs fixing: Enter the ten-digit number patients call, with the area code\./);
  assert.doesNotMatch(live.textContent, /saved/);
  c.setUnit('phone', '(207) 555-0142');
  await settle();
  assert.match(live.textContent, /Unit phone saved\./, 'a valid value is saved');
  assert.match(live.textContent, /^Unit phone saved\. Candidate phone: \(207\) 555-0142\. It cannot be printed or copied until approved\./, 'and read back, unconfirmed');
});

// Added with the owner's directions. The staged card is removed by the afterprint listener, which is mounted only with a preview
// node; without it a printed card would stay staged for the next ordinary print. Fails if printCard() stops checking for the hook.
test('printCard() refuses, says so and stages nothing when no print listener is mounted (a card could never be taken down again)', async t => {
  const env = fakeBrowser(t);
  const tray = fakeTray();
  const c = P.create({ storage: store(), payload: PAYLOAD, sheet: FIXED_LAYOUT });
  const live = fakeLive();
  c.mount(tray.root, live, () => dataOf(3), null, null);
  assert.deepEqual(env.handlers, {}, 'precondition: no print listeners without a preview node');
  assert.deepEqual(c.printCard(), { ok: false, code: 'NO_PRINT_HOOK' });
  assert.equal(env.win.printed, 0);
  assert.equal(env.body.children.length, 0, 'nothing staged');
  await settle();
  assert.equal(live.textContent, 'The card cannot print from here.');
});

// A saved listing that carries a registered crisis number is as unprintable as a crisis-category one, and the fix (removing it)
// is as much a setup step, so it is named before the confirmations too. Fails if CRISIS_NUMBER leaves the setup list.
test('a saved listing that lists a crisis number is named before the four confirmations, like any other listing that cannot print', () => {
  const crisisDigits = PAYLOAD.crisisNumbers[0];
  const bad = P.validate(feed([row(0, { name: 'Support 0 call ' + crisisDigits })]));
  const state = { ...stateWith(1), ids: ['a0'] };
  const sheet = P.sheet(state, bad, PAYLOAD, {});
  assert.equal(sheet.blockers[0].code, 'CRISIS_NUMBER');
  assert.equal(P.blocker(state, bad, gateOff, sheet, false).code, 'CRISIS_NUMBER', 'before the confirmations');
  assert.equal(P.blocker(state, bad, gateOff, sheet, true).code, 'CRISIS_NUMBER', 'and for Copy');
});

// ---- added with the review fixes ----------------------------------------------------------------------------------------
// A saved profile id the build no longer ships ("not loaded") must not freeze the unit fields: the fields look editable, so typing
// has to work, drop the stale id and say what happened. Fails if setUnit is refused for a merely SAVED id again.
test('a saved profile id the build no longer ships does not leave the unit fields stuck: the first edit drops it, and the status line says so', async () => {
  const storage = store();
  storage.m.set('fd_care_packet_v1', JSON.stringify({ ids: ['a1'], inserts: {}, mode: 'review', unit: { name: '', phone: '', profile: 'gone-unit' } }));
  const controls = fakeControls();
  const c = P.create({ storage, payload: PAYLOAD });
  const live = fakeLive();
  c.mount(null, live, () => dataOf(6), null, fakePreview(controls));
  c.openPreview();
  assert.match(controls.innerHTML, /<p [^>]*data-fd-care-packet-profile-status>The saved unit profile is not available in this version\. Type your own details, or choose another profile and press Load profile\.<\/p>/, 'the first paint says so');
  assert.equal(c.setUnit('name', '4 East'), true, 'typing works');
  assert.deepEqual(savedKey(storage).unit, { name: '4 East', phone: '', profile: '' }, 'and the stale id is gone');
  await settle();
  assert.match(live.textContent, /^Unit name saved\./);
});

// Load with nothing chosen is "choose one", not "not available" (WCAG 3.3.1: the message must describe the actual error).
test('pressing Load profile with nothing chosen says to choose a profile first and loads nothing', async () => {
  const controls = fakeControls();
  const { c, storage, live } = mountedP(6, { preview: fakePreview(controls) });
  c.toggle('a1');
  c.openPreview();
  await settle();
  live.textContent = '';
  controls.nodes['[data-fd-care-packet-profile-select]'].value = '';
  c.handleClick(fakeButtonTarget('data-fd-care-packet-profile-load'));
  await settle();
  assert.equal(live.textContent, 'Choose a unit profile first, then press Load profile.');
  assert.equal(savedKey(storage).unit.profile, '');
});

// After "Use my own details instead" the select must not keep naming a profile that is no longer loaded.
test('"Use my own details instead" puts the profile select back on its placeholder', () => {
  const controls = fakeControls();
  const { c } = mountedP(6, { preview: fakePreview(controls) });
  c.toggle('a1');
  c.openPreview();
  assert.equal(c.loadProfile('fixture-unit'), true);
  controls.nodes['[data-fd-care-packet-profile-select]'].value = 'fixture-unit';
  assert.equal(c.unlinkProfile(), true);
  assert.equal(controls.nodes['[data-fd-care-packet-profile-select]'].value, '');
});

// The older pack's Print is never swapped for the packet. Some browsers (Safari, Firefox on macOS) do not move focus when a button is
// clicked, so focus alone cannot tell the two prints apart: a click OUTSIDE the packet just before the print means it is not ours.
// Fails if onBefore stops consulting the last pointer-down.
test('a print that follows a click outside the packet is never the packet\'s, even when focus is still inside it; a click inside it is', t => {
  const env = fakeBrowser(t);
  const pointer = {};
  env.doc.addEventListener = (type, fn) => { pointer[type] = fn; };
  env.doc.removeEventListener = type => { delete pointer[type]; };
  const { c, preview } = mountedP(6, { create: { sheet: FIXED_LAYOUT } });
  readyFinal(c);
  c.openPreview();
  assert.equal(typeof pointer.pointerdown, 'function', 'the packet listens for the last pointer-down while it is mounted');
  env.doc.activeElement = preview.inner;
  pointer.pointerdown({ target: { somewhereElse: true } });
  env.handlers.beforeprint();
  assert.equal(env.body.children.length, 0, 'the older pack\'s Print button was clicked: nothing of the packet is staged');
  pointer.pointerdown({ target: preview.inner });
  env.handlers.beforeprint();
  assert.equal(env.body.children.length, 1, 'a click inside the packet: its print notice');
  assert.match(env.body.children[0].innerHTML, /This is not the patient packet/);
  c.leave();
  assert.equal(pointer.pointerdown, undefined, 'and leaving Care takes the listener away');
});

// If a browser never fires afterprint, the staged packet must not wait for the next print anywhere on the page.
// Fails if onBefore returns early for a stale "printing" flag without tearing the stale print down.
test('a staged print whose afterprint never came is torn down by the next print once 30 seconds have passed', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000000 });
  const env = fakeBrowser(t);
  const { c, preview } = mountedP(6, { create: { sheet: FIXED_LAYOUT } });
  readyFinal(c);
  c.openPreview();
  env.doc.activeElement = preview.inner;
  assert.deepEqual(c.print(), { ok: true, code: '' });
  assert.equal(env.body.children.length, 1, 'staged for the print');
  env.doc.activeElement = null;
  t.mock.timers.tick(5000);
  env.handlers.beforeprint();
  assert.equal(env.body.children.length, 1, 'the first native event consumes the button-approved print');
  t.mock.timers.tick(30000);
  env.handlers.beforeprint();
  assert.equal(env.body.children.length, 0, 'afterprint never came: the stale staged packet is removed, not printed again');
});

// The tray puts the card control BEFORE the review confirmations and the preview button, so "Preview and print" is the control that
// precedes its preview in the Tab order, and the announcement of a refused card is not lost.
test('the card control is not between the preview toggle and the preview it opens', () => {
  const tray = fakeTray();
  mounted(6, { root: tray.root });
  const html = tray.root.innerHTML;
  assert.ok(html.indexOf('data-fd-care-packet-card-print') < html.indexOf('<fieldset class="fd-care-packet__gate"'));
});

// The fields and radios are described by the text that explains them (a screen reader hears WHY a field is read-only, what
// is an approved contact or only a candidate, and what both copies need).
test('the unit fields point at the profile status (and the phone at its readback), and each copy radio at the mode note', () => {
  const state = stateWith(2, { unit: { name: '', phone: '', profile: 'fixture-unit' } });
  const html = P.controls(state, dataOf(6), PROFILED, gateOn, readyUi(state));
  assert.match(html, /id="fd-care-packet-unit-name"[^>]*aria-describedby="fd-care-packet-profile-status fd-care-packet-unit-hint fd-care-packet-unit-name-error"/);
  assert.match(html, /id="fd-care-packet-unit-phone"[^>]*aria-describedby="fd-care-packet-profile-status fd-care-packet-readback fd-care-packet-unit-hint fd-care-packet-unit-phone-error"/);
  assert.equal((html.match(/data-fd-care-packet-mode="[a-z]+"[^>]*aria-describedby="fd-care-packet-modenote"/g) || []).length, 2);
  for (const id of ['fd-care-packet-profile-status', 'fd-care-packet-readback', 'fd-care-packet-modenote', 'fd-care-packet-unit-hint']) {
    assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id + ' exists exactly once, so the reference resolves');
  }
});

// ---- round 2 of the review fixes ----------------------------------------------------------------------------------------------
// onBefore keeps a staged print for 30 seconds (a browser may fire beforeprint twice), so the ONLY things that take a stale one down
// quickly are the controller's own changes. Deleting teardown() from commit() or setGate() left every earlier test green.
// Fails if a change to the packet no longer removes what was staged for the old packet.
test('anything that changes the packet takes a staged print down at once: a listing change (commit) and a confirmation (setGate)', t => {
  const env = fakeBrowser(t);
  const { c } = mountedP(6, { create: { sheet: FIXED_LAYOUT } });
  readyFinal(c);
  c.openPreview();
  assert.deepEqual(c.print(), { ok: true, code: '' });
  assert.equal(env.body.children.length, 1, 'staged');
  c.toggle('a2');
  assert.equal(env.body.children.length, 0, 'a new listing: the staged packet described the old one');
  confirmAll(c);
  assert.equal(c.print().ok, true);
  assert.equal(env.body.children.length, 1);
  c.setGate('supervisor', false);
  assert.equal(env.body.children.length, 0, 'a withdrawn confirmation: the staged packet was released under it');
});

// A saved listing whose NAME holds a verification note or a dose cannot print, and removing it is a setup step like any other
// listing that cannot print: it is named before the four confirmations, for Print and for Copy. Fails if LISTING_TEXT leaves the
// setup list (found by the mutation pass: nothing pinned its position).
test('a saved listing whose name cannot print is named before the four confirmations, with the listing named in the message', () => {
  const data = P.validate(feed([row(0, { name: 'Verified Peer Support of York' })]));
  const state = { ...stateWith(1), ids: ['a0'] };
  const sheet = P.sheet(state, data, PAYLOAD, {});
  assert.equal(sheet.blockers[0].code, 'LISTING_TEXT');
  for (const forCopy of [false, true]) {
    const blocker = P.blocker(state, data, gateOff, sheet, forCopy);
    assert.equal(blocker.code, 'LISTING_TEXT', forCopy ? 'Copy' : 'Print');
    assert.match(blocker.message, /Verified Peer Support of York/, 'and it names the listing');
  }
  assert.equal(P.blocker(state, data, gateOn, sheet, false).code, 'LISTING_TEXT', 'still blocked once the confirmations are ticked');
});
