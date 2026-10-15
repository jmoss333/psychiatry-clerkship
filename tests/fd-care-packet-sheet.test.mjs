// PR C of the Care aftercare packet: the printable sheet, as pure functions (no DOM, no network, no storage).
// Every test names the production change that would make it fail. The module is loaded the way the shell
// loads it (concatenated source, in the shell's order), WITH the QR generator and fd_care_pack.js, because a
// QR assertion that runs without them passes as "no QR anywhere".
//
// The real build payload is the input (python3 against care_inserts_payload.py), and the oracles are
// independent of the code under test: crisis contacts are read from crisis_resources.json and the dose /
// verification patterns are the Python validator's own, run in a child process.
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
const SHEET_SRC = readIf(path.join(FD, 'fd_care_packet_sheet.js'));
const PACKET_SRC = readIf(path.join(FD, 'fd_care_packet.js'));
const GOVERNED = JSON.parse(readFileSync(path.join(REPO, 'crisis_resources.json'), 'utf8'));

function py(body, args = [], input = undefined) {
  const code = `import json, sys\nsys.path.insert(0, ${JSON.stringify(AUTOMATION)})\nsys.path.insert(0, ${JSON.stringify(SITE_BUILD)})\n${body}`;
  return spawnSync('python3', ['-B', '-c', code, ...args], { cwd: SITE_BUILD, encoding: 'utf8', input, timeout: 60000 });
}
const built = py('import care_inserts_payload as p\nprint(json.dumps(p.build_payload()))');
assert.equal(built.status, 0, built.stderr);
const PAYLOAD = JSON.parse(built.stdout);
const SOURCE_PROFILES = JSON.parse(readFileSync(path.join(SITE_BUILD, 'data/care-unit-profiles.v1.json'), 'utf8')).profiles;
const clone = value => JSON.parse(JSON.stringify(value));
// Invisible and direction-changing characters are built from code points and never typed: nobody reviewing this file
// could see them, which is exactly the property under test. A raw-source scan below keeps it that way.
const cp = (...codes) => String.fromCodePoint(...codes);
const ZWSP = cp(0x200b), ZWJ = cp(0x200d), RLO = cp(0x202e), NBSP = cp(0xa0), SHY = cp(0xad), TAG_ONE = cp(0xe0031);
const FULLWIDTH_MG = cp(0xff4d, 0xff47), ARABIC_FIVE = cp(0x665);

const EXPORTS = `;return typeof fdCarePacketSheet === 'function' ? {
  norm: fdCarePacketNorm, forbidden: fdCarePacketForbidden, unitName: fdCarePacketUnitName, unitPhone: fdCarePacketUnitPhone,
  numbers: fdCarePacketNumbers, crisisHit: fdCarePacketCrisisHit, fill: fdCarePacketFill, description: fdCarePacketDescription,
  paginate: fdCarePacketPaginate, estimate: fdCarePacketEstimate, sheet: fdCarePacketSheet, text: fdCarePacketText,
  validate: fdCareDirectoryValidate, blank: fdCarePacketBlank, insertOn: fdCarePacketInsertOn,
  checkCrisis: fdCarePacketCheckCrisis, payloadOk: fdCarePacketPayloadOk,
  strip: fdCarePacketStrip, phoneLike: fdCarePacketPhoneLike, esc: fdEsc,
  eligibility: fdCarePacketEligibility, reasonText: fdCarePacketReasonText, REASONS: FD_CARE_PACKET_REASONS, dial: fdCarePacketDial,
  unitOf: fdCarePacketUnitOf, profiles: fdCarePacketProfiles, profileUsable: fdCarePacketProfileUsable, profileFind: fdCarePacketProfileFind,
  expired: fdCarePacketExpired, cardSheet: fdCarePacketCardSheet, checkCard: fdCarePacketCheckCard, hasState: fdCarePacketHasState,
  helplineNumbers: fdCarePacketHelplineNumbers,
  BAND: FD_CARE_PACKET_BAND
} : null;`;
const src = name => readFileSync(path.join(SITE_BUILD, name), 'utf8');
// The shell's order: fd_data (fdEsc), the QR generator, fd_care_pack (fdCarePackQrSvg), the packet, the sheet, the search (validate).
const SOURCE = src('frontdoor/fd_data.js') + src('vendor/qrcode-generator-1.4.4.js') + src('frontdoor/fd_care_pack.js') +
  src('frontdoor/fd_care_profile.js') + PACKET_SRC + SHEET_SRC + src('frontdoor/fd_care_search.js') + EXPORTS;
const S = new Function(SOURCE)();

// ---- fixtures ---------------------------------------------------------------------------------------------
const categoryIds = ['aftercare', 'crisis', 'peer_support', 'basic_needs', 'community_services', 'housing_shelters', 'recovery_meetings', 'telehealth_providers'];
const row = (n, more = {}) => ({
  id: 'a' + n, category: 'aftercare', name: 'Support ' + n, description: 'Counseling and recovery support.', details: 'SENTINEL-DETAILS-7f3a',
  area: 'York County', regions: ['Southern Maine'], phone: '207-700-0123', contactHref: 'tel:2077000123', website: 'https://example.org/support-' + n,
  verifiedDate: '2031-02-03', reviewAfter: '2032-04-05', verificationRequired: false, ...more,
});
const feed = (records, more = {}) => ({
  schemaVersion: 1, generatedAt: '2026-10-12T16:36:11Z', sourceHash: 'a'.repeat(64),
  categories: categoryIds.map(id => ({ id, label: id === 'peer_support' ? 'Peer support' : id === 'basic_needs' ? 'Basic needs' : id[0].toUpperCase() + id.slice(1).replace(/_/g, ' '), available: true, count: records.filter(r => r.category === id).length })),
  regionOptions: ['Statewide', 'Southern Maine', 'NH'], records, ...more,
});
const dataOf = (records, more) => S.validate(feed(records, more));
const eight = () => [
  row(0), row(1), row(2, { category: 'peer_support', name: 'Peer Group 2' }), row(3, { category: 'basic_needs', name: 'Ride Help 3' }),
  row(4, { category: 'recovery_meetings', name: 'Meetings 4' }), row(5), row(6, { category: 'peer_support', name: 'Peer Group 6' }),
  row(7, { category: 'community_services', name: 'Services 7' }),
];
const idsOf = records => records.map(r => r.id);
// A typed phone never confirms the unit: either printable copy needs a profile and independent approval.
// PROFILED replaces the real build's candidates with TEST-ONLY profiles (fictional 555-01xx numbers), while
// EMPTY_PROFILES explicitly exercises absence. Tests of the real candidates keep PAYLOAD.
const FIXTURE = JSON.parse(readFileSync(path.join(REPO, 'tests/fixtures/care-unit-profile.json'), 'utf8'));
const withProfiles = (payload, ...profiles) => { const out = clone(payload); out.unitProfiles = profiles.map(clone); return out; };
const EMPTY_PROFILES = withProfiles(PAYLOAD);
const PROFILED = withProfiles(PAYLOAD, FIXTURE.profile, FIXTURE.expired);
const LOADED = { name: '', phone: '', profile: FIXTURE.profile.id };
// Both printable modes use an independently approved profile. Typed values are an explicit negative fixture.
const stateOf = (records, more = {}) => ({ ...S.blank(), ids: idsOf(records), unit: { ...LOADED }, ...more });
const finalState = (records, more = {}) => stateOf(records, { mode: 'final', unit: { ...LOADED }, ...more });
const typedState = (records, more = {}) => stateOf(records, { unit: { name: '4 East', phone: '(207) 555-0100', profile: '' }, ...more });
const typedFinal = (records, more = {}) => typedState(records, { mode: 'final', ...more });
const MODES = ['review', 'final'];
const render = (records, state, payload = PROFILED, opts = {}) => S.sheet(state, dataOf(records), payload, opts);
const TEST_NOW = Date.UTC(2026, 9, 13, 12);
const ARRANGED_CALL = { arranged: true, plan: true, preferences: true };
function approvedOptions(extra = {}, profile = FIXTURE.profile) {
  const now = Object.hasOwn(extra, 'now') ? extra.now : TEST_NOW;
  return { now, authority: Number.isFinite(now) ? profileReceipt(profile, now) : null, ...extra };
}
function renderApproved(records, state, payload = PROFILED, opts = {}) {
  const profile = payload?.unitProfiles?.find(candidate => candidate.id === state.unit?.profile) || FIXTURE.profile;
  return render(records, state, payload, approvedOptions(opts, profile));
}
const codesOf = result => result.blockers.map(b => b.code);
const governedName = id => GOVERNED.resources.find(r => r.id === id).name;
// Plain-text view of the html, for oracle scans.
// The entities are decoded in ONE pass: decoding "&amp;" first and then "&lt;" would turn the text "&amp;lt;" into "<".
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
const textOf = html => html.replace(/<[^>]*>/g, ' ').replace(/&(amp|lt|gt|quot|#39);/g, (whole, name) => ENTITIES[name]);
const governed = id => GOVERNED.resources.find(r => r.id === id).contact;

test('both packet modes require independent current approval of the exact profile for print and copy', () => {
  const records = [row(0)], now = Date.UTC(2026,9,13,12);
  for (const mode of MODES) {
    const state = finalState(records,{mode});
    const unapproved = render(records,state,PROFILED,{now});
    assert.equal(unapproved.ok,true);
    assert.ok(codesOf(unapproved).includes('UNIT_UNCONFIRMED'),mode+' cannot use editable data as approval');
    assert.equal(unapproved.html.includes(FIXTURE.profile.unitPhone),false,'no unapproved phone in patient preview');
    const authority = profileReceipt(FIXTURE.profile,now);
    const approved = render(records,state,PROFILED,{now,authority});
    assert.equal(approved.ok,true);
    assert.equal(codesOf(approved).includes('UNIT_UNCONFIRMED'),false);
    assert.ok(approved.html.includes(FIXTURE.profile.unitPurpose));
    assert.ok(approved.html.includes(FIXTURE.profile.unitHours));
    for (const patch of [{ok:false,status:'revoked'},{ok:false,status:'suspended'},{revision:'c'.repeat(64)}]) {
      const denied = render(records,state,PROFILED,{now,authority:{...authority,...patch}});
      assert.ok(codesOf(denied).includes('UNIT_UNCONFIRMED'));
      assert.equal(denied.html.includes(FIXTURE.profile.unitPhone),false);
    }
    if(mode==='final') {
      const text = S.text(state,dataOf(records),PROFILED,{now});
      assert.ok(codesOf(text).includes('UNIT_UNCONFIRMED'),'copy cannot bypass the profile decision');
    }
  }
});

test('callback program alone never promises a discharge call in either packet mode', () => {
  const records=[row(0)],now=Date.UTC(2026,9,13,12),authority=profileReceipt(FIXTURE.profile,now);
  for(const mode of MODES) {
    const state=finalState(records,{mode,inserts:{callback:true}});
    const unarranged=render(records,state,PROFILED,{now,authority});
    assert.ok(codesOf(unarranged).includes('CALLBACK_UNCONFIRMED'));
    for(const missing of ['arranged','plan','preferences']) {
      const callback={arranged:true,plan:true,preferences:true};callback[missing]=false;
      assert.ok(codesOf(render(records,state,PROFILED,{now,authority,callback})).includes('CALLBACK_UNCONFIRMED'),missing);
    }
    const arranged=render(records,state,PROFILED,{now,authority,callback:{arranged:true,plan:true,preferences:true}});
    assert.equal(codesOf(arranged).includes('CALLBACK_UNCONFIRMED'),false);
    assert.match(arranged.html,/Your planned follow-up call/);
    assert.match(arranged.html,/Do not wait for this call/);
  }
});

test('textOf decodes entities once: "&amp;lt;" stays "&lt;" and is not turned into "<"', () => {
  assert.equal(textOf('a &amp;lt; b &amp;amp; c &lt;i&gt; &quot;q&quot; &#39;s&#39;'), `a &lt; b &amp; c <i> "q" 's'`);
});

test('the module exists, exports the sheet API, and is a front-door module (ES5, no network, no storage, no crisis literal)', () => {
  assert.ok(S, 'fd_care_packet_sheet.js exists and exports the sheet API');
  for (const [label, text] of [['sheet module', SHEET_SRC], ['packet module', PACKET_SRC]]) {
    assert.doesNotMatch(text, /=>|\blet\b\s|\bconst\b\s|`/, label + ' is ES5');
    assert.doesNotMatch(text, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|document\.cookie|\.href\s*=/, label + ' uses no network, durable storage or navigation');
  }
  assert.doesNotMatch(SHEET_SRC, /sessionStorage/, 'storage stays in fd_care_packet.js');
  // No registered crisis contact, anywhere it could be typed (comments included): the governed record is the only home.
  const css = readIf(path.join(FD, 'frontdoor.css'));
  const digitsOf = text => text.replace(/\D/g, '');
  // Every registered number: each governed contact, and the payload's crisisNumbers (which adds alsoAvailable numbers).
  const registered = new Set(PAYLOAD.crisisNumbers);
  for (const resource of GOVERNED.resources) {
    for (const token of String(resource.contact).match(/\d[\d\-\s().]*\d/g) || []) registered.add(digitsOf(token));
  }
  assert.ok(registered.size >= GOVERNED.resources.length, 'the scan has numbers to look for: ' + registered.size);
  for (const digits of registered) {
    const pattern = new RegExp('(?<!\\d)(?:1[\\s.\\-()]*)?' + digits.split('').join('[\\s.\\-()]*') + '(?!\\d)');
    for (const [label, text] of [['sheet module', SHEET_SRC], ['packet module', PACKET_SRC], ['frontdoor.css', css]]) {
      assert.doesNotMatch(text, pattern, label + ' must not type a registered crisis number (' + digits.length + ' digits)');
    }
  }
  assert.doesNotMatch(SHEET_SRC, /lifeline_|maine_crisis|emergency_911|crisis_text_line|veterans_crisis/, 'the sheet never names a crisis id: the payload says which are required');
});

test('source wording: no hard-coded organisation, no Review-copy promise of a "final copy", no listing-status logic in the packet modules', () => {
  for (const [label, text] of [['sheet module', SHEET_SRC], ['packet module', PACKET_SRC]]) {
    assert.doesNotMatch(text, /FD_CARE_PACKET_ORG|Maine Medical Center/, label + ': the organisation comes only from a loaded profile with approved branding');
    // The feed already dropped closed and withdrawn records and blanked blocked contacts; the packet reads verdicts, it does not re-decide them.
    const listingSource = text.replace(/\b(?:authority|receipt|profileAuthority)\.status\b/g, '__profile_authority_status');
    assert.doesNotMatch(listingSource, /\.(?:status|closed|withdrawn|verificationRequired|verifiedDate|reviewAfter)\b/, label + ' reads no listing status or verification field (profile authority status is separate)');
  }
  for (const promise of ['finalize this together', 'print a final copy', 'for the final copy', 'keep what you tick']) {
    assert.equal(SHEET_SRC.toLowerCase().includes(promise), false, 'the Review copy no longer promises: ' + promise);
  }
  assert.equal(S.BAND, 'Review copy · we will go over this with you before you leave');
});

// ---- fill --------------------------------------------------------------------------------------------------
test('fill escapes unit and crisis token values and prints a handwriting blank for a missing unit value', () => {
  const ctx = { unitName: 'Unit <b>4</b> & "East"', unitPhone: '(207) 555-0100', contacts: PAYLOAD.contacts };
  const html = S.fill('Call {{unitPhone}} on {{unitName}}. In danger: {{crisis:emergency_911}}.', ctx, 'html');
  assert.equal(html.ok, true);
  assert.match(html.out, /\(207\) 555-0100/);
  assert.match(html.out, /Unit &lt;b&gt;4&lt;\/b&gt; &amp; &quot;East&quot;/);
  assert.ok(html.out.includes(governed('emergency_911')), 'the governed contact is filled in');
  const blank = S.fill('Call {{unitPhone}}.', { ...ctx, unitPhone: '' }, 'html');
  assert.match(blank.out, /class="fd-packet-blank"/);
  assert.match(blank.out, /blank line to write in/, 'assistive technology is told what the blank is');
  assert.equal(S.fill('Call {{unitPhone}}.', { ...ctx, unitPhone: '' }, 'text').out, 'Call ______.');
});

test('fill escapes the literal text around a token as well as the values it inserts', () => {
  const ctx = { unitName: '4 East', unitPhone: '', contacts: PAYLOAD.contacts };
  assert.equal(S.fill('A & B <i>"q"</i> {{unitName}}', ctx, 'html').out, 'A &amp; B &lt;i&gt;&quot;q&quot;&lt;/i&gt; 4 East');
  assert.equal(S.fill('A & B <i>{{unitName}}', ctx, 'text').out, 'A & B <i>4 East', 'text mode is raw');
});

test('payload validity: every crisis line and every required line resolves, and every required line is in the block', () => {
  assert.equal(S.payloadOk(PAYLOAD), true);
  const dropped = clone(PAYLOAD); dropped.crisis = dropped.crisis.filter(line => line.ref !== PAYLOAD.required[0]);
  assert.equal(S.payloadOk(dropped), false, 'a required line that is not one of the printed lines');
  const unresolved = clone(PAYLOAD); delete unresolved.contacts[PAYLOAD.crisis[2].ref];
  assert.equal(S.payloadOk(unresolved), false, 'a printed line with no contact');
  for (const blank of ['', '   ', undefined, 7]) {
    const nameless = clone(PAYLOAD); nameless.contacts[PAYLOAD.crisis[2].ref].name = blank;
    assert.equal(S.payloadOk(nameless), false, 'a printed line whose contact has no official name: ' + JSON.stringify(blank));
  }
  for (const bad of [null, undefined, 7, 'x', [], {}]) assert.equal(S.payloadOk(bad), false, JSON.stringify(bad));
});

test('the shipped payload: governed crisis names, a separate card, and source candidates survive browser re-validation', () => {
  assert.deepEqual(Object.keys(PAYLOAD).sort(), ['card', 'checkedOn', 'contacts', 'crisis', 'crisisCopy', 'crisisNumbers', 'generatedAt', 'inserts', 'required', 'unitProfiles']);
  for (const line of PAYLOAD.crisis) {
    assert.deepEqual(Object.keys(line).sort(), ['ref', 'when'], line.ref + ' carries no label to print');
    assert.equal(PAYLOAD.contacts[line.ref].name, governedName(line.ref), line.ref + ': the official name from crisis_resources.json');
  }
  assert.equal(PAYLOAD.inserts.some(i => i.id === 'card'), false, 'the wallet card is its own print, not a page of the packet');
  assert.deepEqual(PAYLOAD.unitProfiles.map(p => p.id), SOURCE_PROFILES.map(p => p.id), 'only the source candidates ship');
  for (const [index, profile] of PAYLOAD.unitProfiles.entries()) {
    const { verification, ...sourceContent } = SOURCE_PROFILES[index];
    const { revision, usableThrough, expiresOn, ...publicContent } = profile;
    assert.deepEqual(publicContent, sourceContent, 'candidate content survives the public projection without verification records');
  }
  assert.deepEqual(S.profiles(PAYLOAD).map(p => [p.id, p.revision]), PAYLOAD.unitProfiles.map(p => [p.id, p.revision]), 'every real candidate survives browser re-validation with its revision');
  assert.deepEqual(S.profiles(EMPTY_PROFILES), [], 'an explicitly empty payload still offers no profile');
  assert.deepEqual(S.profiles(PROFILED).map(p => p.id), [FIXTURE.profile.id, FIXTURE.expired.id], 'the test-only fixture is in the shipped shape and survives re-validation');
});

// REWRITTEN for Revision 2: the check now needs each required line's official NAME as well as its contact, both in the
// same crisis unit, and the wallet card is no longer a unit of the packet (it has its own check, fdCarePacketCheckCard).
test('the rendered-output check needs every required line\'s official NAME and CONTACT in one crisis unit; a card-flagged unit no longer counts either way', () => {
  // A sentinel name with an ampersand: the check compares ESCAPED text, as the sheet prints it.
  const payload = clone(PAYLOAD);
  const first = payload.required[0];
  payload.contacts[first].name = 'Sentinel & Official';
  const contactOf = id => S.esc(payload.contacts[id].contact);
  const nameOf = id => S.esc(payload.contacts[id].name);
  const lineOf = id => '<li data-fd-packet-crisis="' + S.esc(id) + '"><b>' + contactOf(id) + '</b><span>' + nameOf(id) + '</span></li>';
  const lines = payload.required.map(lineOf).join('');
  const good = [{ crisis: true, card: false, html: lines }];
  assert.equal(S.checkCrisis(good, payload), true);
  // Added with the review fixes: the NAME and the NUMBER must be on the same printed line. Names rotated one place along (every
  // name and every number is still somewhere in the block) used to pass. Fails if the check goes back to "somewhere in the unit".
  const rotated = payload.required.map((id, i) => '<li data-fd-packet-crisis="' + S.esc(id) + '"><b>' + contactOf(id) + '</b><span>' + nameOf(payload.required[(i + 1) % payload.required.length]) + '</span></li>').join('');
  assert.equal(S.checkCrisis([{ crisis: true, html: rotated }], payload), false, 'a number printed beside another line\'s name');
  assert.equal(S.checkCrisis([{ crisis: true, html: lines.split('data-fd-packet-crisis=').join('data-x=') }], payload), false, 'a line that does not say which resource it is');
  assert.equal(S.checkCrisis([{ crisis: true, html: lines.replace(contactOf(first), '') }], payload), false, 'a contact missing from the block');
  assert.equal(S.checkCrisis([{ crisis: true, html: lines.replace(nameOf(first), '') }], payload), false, 'a NAME missing from the block: the number alone is not enough');
  assert.equal(S.checkCrisis([{ crisis: true, html: lines.replace(nameOf(first), 'Sentinel & Official') }], payload), false, 'an unescaped name is not what the sheet prints');
  const split = payload.required.map(id => '<li>' + contactOf(id) + '</li>').join('');
  const names = payload.required.map(id => '<li>' + nameOf(id) + '</li>').join('');
  assert.equal(S.checkCrisis([{ crisis: true, html: split }, { crisis: true, html: names }], payload), false, 'name and contact in DIFFERENT units do not make a line');
  assert.equal(S.checkCrisis([], payload), false, 'no crisis block at all');
  assert.equal(S.checkCrisis([{ crisis: false, html: lines }], payload), false, 'lines that are not in the crisis unit do not count');
  assert.equal(S.checkCrisis([{ crisis: false, card: true, html: lines }], payload), false, 'a card-flagged unit does not stand in for the crisis block');
  assert.equal(S.checkCrisis([...good, { crisis: false, card: true, html: '<div></div>' }], payload), true, 'and a card-flagged unit without the lines no longer fails the packet');
  assert.match(SHEET_SRC, /if\(!fdCarePacketCheckCrisis\(units,payload\)\)return fdCarePacketFail\('CRISIS_UNAVAILABLE'/, 'the build step really calls the check');
});

test('fill FAILS rather than print a hole: unknown id, blank contact, unknown token, or anything left over', () => {
  const ctx = { unitName: 'X', unitPhone: '', contacts: PAYLOAD.contacts };
  for (const bad of ['{{crisis:not_there}}', '{{nonsense}}', '{{unitPhone', 'oops }} here', '{{crisis:}}']) {
    assert.equal(S.fill('a ' + bad + ' b', ctx, 'html').ok, false, bad);
  }
  const blanked = clone(PAYLOAD.contacts);
  const someId = Object.keys(blanked)[0];
  blanked[someId].contact = '';
  assert.equal(S.fill('x {{crisis:' + someId + '}}', { ...ctx, contacts: blanked }, 'html').ok, false, 'a blank contact is not "filled"');
  assert.equal(S.fill('x {{crisis:' + someId + '}}', { ...ctx, contacts: null }, 'html').ok, false, 'no contacts at all');
});

// ---- the forbidden-text filter -----------------------------------------------------------------------------
const HOSTILE = [
  '10 mg', '10mg', '10 mcg', '5-mg', '2 grams', '20 mEq', 'ten milligrams', 'five mg', 'twenty-five mg', 'half a gram', 'two tablets',
  'Verification due', 'verifiedDate: 2026-01-01', 'reviewAfter', 'L3', 'BHU L2 unit',
  '10' + ZWSP + 'mg', '1' + ZWJ + '0 mg', FULLWIDTH_MG + ' 10 mg', '10' + NBSP + 'mg', '10' + SHY + ' mg', '1' + TAG_ONE + '0 mg',
  RLO + '10 mg', ARABIC_FIVE + ' mg',
];
const CLEAN = [
  'Open 24/7. Call 207-555-0100.', 'Monday to Friday, 8 a.m. to 4 p.m.', 'Free help for people 18 and over.', 'Group meets weekly in Portland.',
  'Counseling and recovery support.', 'Press 1. Support for family and friends.', "Children's mental health services",
];
test('the forbidden-text filter catches every dose, verification and tier spelling in a hostile list and none of the ordinary text', () => {
  for (const text of HOSTILE) assert.equal(S.forbidden(text), true, JSON.stringify(text));
  for (const text of CLEAN) assert.equal(S.forbidden(text), false, JSON.stringify(text));
  assert.equal(S.forbidden('Needs verification before use'), true, 'internal verification notes in prose never print');
  assert.equal(S.forbidden('Recently opened - verify operational status.'), true);
  assert.equal(S.forbidden('MaineCare acceptance NOT confirmed — needs verification.'), true);
});

test('PARITY: the shared patterns agree with the Python validator on a probe list (so the two cannot drift apart)', () => {
  const probes = [...HOSTILE, ...CLEAN, '3 g', '3g', '12 cc', '4 iu', 'one tablet', 'Suite 3G', 'L5', 'l4.', 'mgmt', 'The 10 mgmt team', '1,5 mg', '0.5mg'];
  const python = py(
    `import validate_care_inserts as v\nprobes = json.loads(sys.stdin.read())\n` +
    `pats = [v.DOSE_RE, v.DOSE_WORD_RE, v.DOSE_SPELLED_RE, v.DOSE_COUNT_RE, v.METADATA_RE]\n` +
    `print(json.dumps([any(p.search(v.normalise(s)) for p in pats) for s in probes]))`,
    [], JSON.stringify(probes),
  );
  assert.equal(python.status, 0, python.stderr);
  const theirs = JSON.parse(python.stdout);
  // The JS filter is a superset by exactly one thing: verification WORDING (feed prose). Everything the validator
  // flags must be flagged here, and anything else flagged here must contain the word.
  probes.forEach((probe, i) => {
    const ours = S.forbidden(probe);
    if (theirs[i]) assert.equal(ours, true, 'validator flags ' + JSON.stringify(probe) + ' so the sheet must');
    else if (ours) assert.match(probe, /verif/i, 'the only extra the sheet flags is verification wording: ' + JSON.stringify(probe));
  });
});

test('norm folds width, drops format and bidi controls, maps other scripts\' digits, and unifies dashes (so hidden characters cannot defeat a scan)', () => {
  assert.equal(S.norm('1' + ZWSP + '0' + RLO + ' mg'), '10 mg');
  assert.equal(S.norm(cp(0xff11, 0xff10) + ' mg'), '10 mg');
  assert.equal(S.norm('2' + cp(0x2011, 0x2013, 0x2212) + ' 3'), '2--- 3');
  assert.equal(S.norm('9' + TAG_ONE + '88'), '988', 'tag characters (outside the BMP) are dropped');
  assert.equal(S.norm(cp(0x669, 0x668, 0x668)), '988', 'Arabic-Indic digits become ASCII');
  assert.equal(S.norm(cp(0x96f, 0x96e, 0x96e)), '988', 'Devanagari digits become ASCII');
  assert.equal(S.norm(cp(0x9ef, 0x9ee, 0x9ee)), '988', 'Bengali digits become ASCII');
  assert.equal(S.norm(cp(0x6f9, 0x6f8, 0x6f8)), '988', 'Extended Arabic-Indic digits become ASCII');
});

test('strip is what PRINTS: control and format characters are removed and whitespace collapsed', () => {
  assert.equal(S.strip('  A' + RLO + 'B' + ZWSP + 'C\t\nD  '), 'ABC D');
  assert.equal(S.strip(null), '');
});

test('no source file in this feature contains a raw invisible, format or bidirectional character', () => {
  const invisible = /[\u00ad\u0600-\u0605\u061c\u06dd\u070f\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\ufff9-\ufffb]|\udb40[\udc00-\udc7f]/;
  for (const [label, text] of [['sheet module', SHEET_SRC], ['packet module', PACKET_SRC], ['this test', readFileSync(fileURLToPath(import.meta.url), 'utf8')]]) {
    const hit = invisible.exec(text);
    assert.equal(hit, null, label + ' has a raw invisible character at offset ' + (hit && hit.index));
  }
});

// ---- unit name and phone -----------------------------------------------------------------------------------
test('unit name: optional, trimmed, bounded, no controls or markup characters, and never a forbidden token', () => {
  assert.deepEqual(S.unitName('  4 East  '), { ok: true, value: '4 East', error: '' });
  assert.deepEqual(S.unitName(''), { ok: true, value: '', error: '' });
  assert.equal(S.unitName('x'.repeat(61)).ok, false);
  for (const bad of ['<img onerror=1>', 'a{b', 'a}b', 'tab\there', 'L3 Unit', '10 mg unit', 'verification due']) assert.equal(S.unitName(bad).ok, false, bad);
  assert.equal(S.unitName('Inpatient Psychiatry · Unit 4 (P6)').ok, true, 'ordinary punctuation is fine');
  assert.ok(S.unitName('<b>').error.length > 0, 'a rejection explains itself');
});

test('unit phone: a ten-digit North American number only; never N11, never a crisis number, never letters', () => {
  assert.deepEqual(S.unitPhone('207-555-0100', PAYLOAD), { ok: true, value: '(207) 555-0100', error: '' });
  assert.equal(S.unitPhone('1 (207) 555 0100', PAYLOAD).value, '(207) 555-0100', 'a leading 1 is dropped');
  assert.deepEqual(S.unitPhone('', PAYLOAD), { ok: true, value: '', error: '' });
  for (const bad of ['911', '988', '211', '555-0100', '207-555-010', '207-555-01000', '207-555-0100 x5', 'call me', '123-456-7890', '207-155-0100',
    '211-555-0100', '911-555-0100', '207-911-0100', '207-411-0100']) {
    assert.equal(S.unitPhone(bad, PAYLOAD).ok, false, bad);
  }
  for (const id of Object.keys(PAYLOAD.contacts)) {
    const registered = (PAYLOAD.contacts[id].contact.match(/\d[\d\-\s().]*\d/g) || []).filter(t => t.replace(/\D/g, '').length >= 10);
    for (const number of registered) assert.equal(S.unitPhone(number, PAYLOAD).ok, false, 'a registered crisis number is not a unit phone: ' + id);
  }
  assert.ok(S.unitPhone('911', PAYLOAD).error.length > 0);
});

// ---- crisis numbers inside listings ------------------------------------------------------------------------
test('a registered crisis number inside listing text is detected as a number, not as a substring', () => {
  const maine = governed('maine_crisis_line');
  assert.ok(S.numbers(maine).length >= 1);
  for (const hit of [maine, '207-799-4160 | Crisis Line: 888-568-1112', 'Call 988 anytime', '9-1-1', 'dial 911', '(888) 568-1112', '1 888 568 1112']) {
    assert.equal(S.crisisHit(hit, PAYLOAD), true, hit);
  }
  for (const clean of ['207-791-1000', '207-555-0100', 'Ext 9881', '19115', '1-800-988-0199', 'Open since 1988', '(207) 555-0100']) {
    assert.equal(S.crisisHit(clean, PAYLOAD), false, clean + ' is not a crisis number');
  }
});

// ---- descriptions ------------------------------------------------------------------------------------------
test('a truncated description never prints as a fragment', () => {
  const sentences = 'Provides crisis stabilization and follow-up. ' + 'Walk-ins are welcome during business hours and appointments are available. '.repeat(4);
  const cut = (sentences + 'If you need help now: call or text 988, contact the Maine Stat').slice(0, 420);
  assert.ok(cut.length >= 400 && !/[.!?]$/.test(cut));
  const trimmed = S.description(cut, 'https://example.org/');
  assert.match(trimmed.text, /[.!?]$/, 'ends on a complete sentence');
  assert.ok(!trimmed.text.includes('Maine Stat'), 'the fragment is gone');
  const noSentence = S.description('word '.repeat(90), 'https://example.org/');
  assert.equal(noSentence.text, '');
  assert.equal(noSentence.moreOnWebsite, true);
  assert.equal(S.description('word '.repeat(90), '').moreOnWebsite, false, 'no website, nothing to point to');
  assert.equal(S.description('Counseling', 'https://example.org/').text, 'Counseling', 'a short label without a full stop is left alone');
  const forbidden = S.description('Adults 18+. Take 10 mg nightly.', 'https://example.org/');
  assert.equal(forbidden.text, '');
  assert.ok(forbidden.withheld.length > 0, 'an omission is recorded so the preview can say so');
});

// ---- pagination --------------------------------------------------------------------------------------------
const unit = (key, group = null, keepNext = false) => ({ key, group, keepNext, crisis: false, html: '<div></div>' });
test('paginate packs greedily, keeps a heading with its next unit, and never splits a unit', () => {
  const units = [unit('a'), unit('b'), unit('h', null, true), unit('c')];
  const result = S.paginate(units, [300, 300, 100, 300], 800, { slack: 0 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.pages.map(p => p.units), [[0, 1], [2, 3]], 'the heading (100) moves with its resource, not stranded at 700/800');
  assert.deepEqual(result.pages.map(p => p.used), [600, 400]);
  assert.equal(result.pages[0].capacity, 800);
});

test('paginate keeps a standard page whole when it fits a fresh sheet, otherwise falls back to its parts', () => {
  const group = ['x', 'y', 'z'].map(k => unit(k, 'warning'));
  const filler = unit('f');
  const whole = S.paginate([filler, ...group], [500, 200, 200, 200], 800, { slack: 0, keepWhole: true });
  assert.deepEqual(whole.pages.map(p => p.units), [[0], [1, 2, 3]], 'the page moves whole to a fresh sheet');
  const fill = S.paginate([filler, ...group], [500, 200, 200, 200], 800, { slack: 0, keepWhole: false });
  assert.deepEqual(fill.pages.map(p => p.units), [[0, 1], [2, 3]], '500+200 fits; the next 200 would make 900 > 800, so it starts the next sheet');
  const tooTall = S.paginate([filler, ...group], [100, 500, 500, 500], 800, { slack: 0, keepWhole: true });
  assert.equal(tooTall.ok, true);
  assert.deepEqual(tooTall.pages.map(p => p.units), [[0, 1], [2], [3]], 'taller than a sheet: split at the part boundaries instead');
});

test('paginate FAILS CLOSED: oversize unit, zero/NaN/non-finite heights, bad capacity, mismatched lengths', () => {
  const units = [unit('a'), unit('b')];
  assert.equal(S.paginate(units, [900, 100], 800, { slack: 0 }).code, 'OVERFLOW');
  assert.equal(S.paginate(units, [0, 0], 800, { slack: 0 }).code, 'MEASURE_FAILED', 'all-zero heights mean it measured a hidden box');
  assert.equal(S.paginate(units, [10, NaN], 800, { slack: 0 }).code, 'MEASURE_FAILED');
  assert.equal(S.paginate(units, [10, Infinity], 800, { slack: 0 }).code, 'MEASURE_FAILED');
  assert.equal(S.paginate(units, [10, 10], 0, { slack: 0 }).code, 'MEASURE_FAILED');
  assert.equal(S.paginate(units, [10, 10], NaN, { slack: 0 }).code, 'MEASURE_FAILED');
  assert.equal(S.paginate(units, [10], 800, { slack: 0 }).code, 'MEASURE_FAILED', 'one height per unit');
  assert.equal(S.paginate([], [], 800, { slack: 0 }).code, 'MEASURE_FAILED', 'nothing to paginate is a failure, not an empty success');
  assert.equal(S.paginate(units, [790, 5], 800, { slack: 24 }).code, 'OVERFLOW', 'slack is reserved: 790 does not fit 800 - 24');
});

// ---- the sheet ---------------------------------------------------------------------------------------------
test('the sheet renders for both modes: numbered pages, a footer on every page, and the crisis block on page 1', () => {
  const records = eight();
  for (const mode of MODES) {
    const r = renderApproved(records, stateOf(records, { mode }));
    assert.equal(r.ok, true, mode + ': ' + r.message);
    assert.ok(r.count >= 2);
    const pages = r.html.split('data-fd-packet-page').length - 1;
    assert.equal(pages, r.count, 'one article per page');
    for (let n = 1; n <= r.count; n++) {
      assert.ok(r.html.includes('aria-label="Page ' + n + ' of ' + r.count + '"'), 'page ' + n + ' is named');
      assert.ok(r.html.includes('>Page ' + n + ' of ' + r.count + '<'), 'page ' + n + ' footer text');
    }
    assert.equal(r.html.split('class="fd-packet-foot"').length - 1, r.count, 'a footer on every page');
    const firstPage = r.html.split('data-fd-packet-page')[1];
    assert.match(firstPage, /data-fd-packet-unit="crisis"/, 'the crisis block is on page 1');
    assert.doesNotMatch(r.html.split('data-fd-packet-page').slice(2).join(''), /data-fd-packet-unit="crisis"/, 'and only there');
    assert.equal(r.html.includes('id="'), false, 'the sheet contains no id attributes (it is rendered up to three times)');
    assert.equal(/<a[\s>]/.test(r.html), false, 'the sheet has no anchors');
  }
});

test('review mode carries the band and a tick box per listing on every page; final mode carries neither', () => {
  const records = eight();
  const review = renderApproved(records, stateOf(records, { mode: 'review' }));
  const final = renderApproved(records, finalState(records));
  const bandText = S.BAND;
  assert.equal(review.html.split(bandText).length - 1, review.count, 'the band text is on every page');
  assert.equal(review.html.split('class="fd-packet-box"').length - 1, records.length, 'a tick box per listing');
  assert.match(textOf(review.html), /Tick the ones you want to try/);
  assert.equal(final.html.includes(bandText), false);
  assert.match(final.html, /class="fd-packet-band is-empty"/, 'the band slot is reserved in final so layout does not shift');
  assert.equal(final.html.includes('class="fd-packet-box"'), false);
  assert.doesNotMatch(textOf(final.html), /Tick the ones/);
});

// REWRITTEN for Revision 2: a line printed its short `label`; it now prints the contact's official governed name (the
// payload has no label). The name oracle is crisis_resources.json itself, not the payload.
test('the crisis block is built from the payload: every crisis line with its governed contact and official name, on page 1, plus availability', () => {
  const records = eight();
  for (const mode of MODES) {
    const r = renderApproved(records, mode === 'final' ? finalState(records) : stateOf(records));
    const page1 = r.html.split('data-fd-packet-page')[1];
    for (const line of PAYLOAD.crisis) {
      const marker = new RegExp('data-fd-packet-crisis="' + line.ref + '"[\\s\\S]*?</li>');
      const found = page1.match(marker);
      assert.ok(found, mode + ': a line for ' + line.ref);
      assert.ok(found[0].includes(governed(line.ref)), mode + ': ' + line.ref + ' carries ITS OWN governed contact');
      assert.ok(textOf(found[0]).includes(governedName(line.ref)), mode + ': and ITS OWN official governed name');
      assert.ok(textOf(found[0]).includes(line.when), 'and when to use it');
    }
    assert.match(page1, /24\/7/, 'availability from the governed record is shown');
    assert.ok(textOf(page1).includes(PAYLOAD.crisisCopy.heading));
  }
});

test('the standard pages follow the payload: defaults on, optional pages switchable, core pages never off', () => {
  const records = eight();
  const titles = html => (html.match(/data-fd-packet-insert="([a-z]+)"/g) || []).map(m => m.split('"')[1]);
  const base = titles(renderApproved(records, stateOf(records)).html);
  const defaults = PAYLOAD.inserts.filter(i => i.defaultOn || i.core).map(i => i.id);
  assert.deepEqual([...new Set(base)].sort(), defaults.sort(), 'exactly the default-on pages render');
  const withSafety = titles(renderApproved(records, stateOf(records, { inserts: { safety: true } })).html);
  assert.ok(withSafety.includes('safety'));
  const withoutWarning = titles(renderApproved(records, stateOf(records, { inserts: { warning: false } })).html);
  assert.ok(!withoutWarning.includes('warning'));
  const coreOff = titles(renderApproved(records, stateOf(records, { inserts: { intro: false } })).html);
  assert.ok(coreOff.includes('intro'), 'a core page cannot be switched off');
  assert.equal(S.insertOn({ inserts: {} }, { id: 'x', core: false, defaultOn: true }), true);
  assert.equal(S.insertOn({ inserts: { x: false } }, { id: 'x', core: false, defaultOn: true }), false);
  assert.equal(S.insertOn({ inserts: { x: 'no' } }, { id: 'x', core: false, defaultOn: true }), true, 'only booleans override a default');
});

// Patient-facing unit fields resolve only from the exact independently approved profile in either mode.
test('tokens in the standard pages resolve: the loaded profile\'s unit name and phone on a Final copy, and crisis contacts from the payload', () => {
  const records = eight();
  const r = renderApproved(records, finalState(records, { inserts: { rights: true, safety: true } }));
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.blockers, [], 'a confirmed profile leaves nothing in the way');
  const text = textOf(r.html);
  assert.ok(text.includes(FIXTURE.profile.unitPhone), 'unit phone from the profile');
  assert.ok(text.includes(FIXTURE.profile.unitName), 'unit name from the profile');
  assert.equal(/\{\{|\}\}/.test(r.html), false, 'no token survives');
  assert.ok(text.includes('call ' + governed('emergency_911')) || text.includes(governed('emergency_911')), 'a crisis token resolved');
  const draft = render(records, typedState(records, { inserts: { rights: true } }));
  assert.equal(draft.html.includes('(207) 555-0100'), false, 'typed details never reach the Review patient preview');
  assert.ok(codesOf(draft).includes('UNIT_UNCONFIRMED'));
  const blanks = renderApproved(records, typedFinal(records, { unit: { name: '', phone: '', profile: '' } }));
  assert.equal(blanks.html.includes('class="fd-packet-blank"'), true, 'an unavailable unit value prints a blank to write in');
  assert.ok(codesOf(blanks).includes('UNIT_UNCONFIRMED'), 'and such a Final copy cannot print: the welcome page carries a unit token');
});

test('every listing prints its name, phone, domain and area; the QR appears exactly for https websites', () => {
  const records = [
    row(0, { name: 'Has Https', website: 'https://www.example.org/deep/link?x=1' }),
    row(1, { name: 'Has Http', website: 'http://example.org/plain' }),
    row(2, { name: 'No Site', website: '' }),
    row(3, { name: 'Bad Scheme', website: 'javascript:alert(1)' }),
  ];
  const r = renderApproved(records, finalState(records));
  assert.equal(r.ok, true, r.message);
  const text = textOf(r.html);
  for (const name of ['Has Https', 'Has Http', 'No Site']) assert.ok(text.includes(name), name);
  assert.match(text, /Call\s+207-700-0123/, 'the dialable number from the feed link');
  assert.ok(text.includes('York County'), 'and the area');
  // The printed domain is its own token in the text, not a substring of something longer.
  assert.match(text, /(^|\s)example\.org(\s|$)/);
  // Visible text, not markup: the QR's own namespace attribute legitimately contains "www." (w3.org).
  assert.equal(text.includes('www.'), false, 'the domain prints without www.');
  assert.equal(r.html.split('<svg').length - 1, 1, 'one QR: only the https listing has one (the generator IS loaded, so this is not "no QR anywhere")');
  assert.match(r.html, /QR code for website example\.org/, 'the QR is named by its destination');
  assert.equal(r.html.includes('javascript:'), false);
  assert.equal(text.includes('/deep/link'), false, 'paper prints the domain only');
  assert.equal(r.html.includes('fd-packet-qrurl'), false, 'the full address is not part of the measured sheet (a preview-only line would measure differently from the paper)');
  assert.deepEqual(r.addresses, [{ name: 'Has Https', url: 'https://www.example.org/deep/link?x=1' }],
    'the address a QR encodes comes back as data, for the preview to show beside the sheet');
  const preview = S.sheet(finalState(records), dataOf(records), PROFILED, approvedOptions({ preview: true }));
  assert.equal(preview.html.includes('/deep/link'), false, 'not even the preview sheet carries it: the sheet is the same bytes everywhere');
  assert.equal(preview.html, r.html);
});

test('a QR code that would be too dense to scan at the printed size is left off, and the domain still prints', () => {
  const longUrl = 'https://example.org/' + 'a'.repeat(190);
  const records = [row(0, { name: 'Short Link', website: 'https://example.org/x' }), row(1, { name: 'Long Link', website: longUrl })];
  const r = renderApproved(records, finalState(records));
  assert.equal(r.html.split('<svg').length - 1, 1, 'only the short address gets a code');
  assert.ok(textOf(r.html).split('example.org').length - 1 >= 2, 'both domains still print');
  assert.ok(r.html.indexOf('Short Link') < r.html.indexOf('<svg') && r.html.indexOf('<svg') < r.html.indexOf('Long Link'), 'the code belongs to the short one');
});

test('heading levels are relative to a base: one h1 on paper, none in the preview, and never below h6', () => {
  const records = eight();
  const levels = html => (html.match(/<h([1-9])[\s>]/g) || []).map(h => Number(h[2]));
  const paper = levels(renderApproved(records, stateOf(records), PROFILED, { headingBase: 1 }).html);
  assert.equal(paper.filter(n => n === 1).length, 1, 'exactly one h1 on the printed packet');
  assert.ok(paper.every(n => n >= 1 && n <= 6));
  const inPage = levels(renderApproved(records, stateOf(records), PROFILED, { headingBase: 4, preview: true }).html);
  assert.ok(inPage.length > 0 && inPage.every(n => n >= 4 && n <= 6), 'inside the Care page the sheet starts below its h3: ' + inPage);
});

test('hostile listing text is escaped and the sheet cannot be made to contain markup or script', () => {
  const evil = '<img src=x onerror=alert(1)> & "q" \'s\'';
  const records = [row(0, { name: evil, description: evil, area: evil, phone: '207-700-0123' })];
  const r = renderApproved(records, finalState(records));
  assert.equal(r.ok, true, r.message);
  assert.equal(r.html.includes('<img'), false);
  assert.equal(/onerror=alert/.test(r.html.replace(/&lt;img[^&]*&gt;/g, '')), false);
  assert.ok(r.html.includes('&lt;img'));
});

// ---- AC5 --------------------------------------------------------------------------------------------------
const AC5 = /Verification due|verifiedDate|reviewAfter|L[1-4]\b|\b\d+\s?mg\b/i;
// Every page the payload carries (the wallet card is no longer one of them: it is its own print).
const INSERT_IDS = PAYLOAD.inserts.map(i => i.id);
const insertSets = {
  default: {},
  allOn: Object.fromEntries(INSERT_IDS.map(id => [id, true])),
  coreOnly: Object.fromEntries(INSERT_IDS.filter(id => !PAYLOAD.inserts.find(i => i.id === id).core).map(id => [id, false])),
};
function oracleHits(strings) {
  // The validator's own pattern family, run in a child process: independent of the JS filter under test.
  const run = py(
    `import validate_care_inserts as v\nitems = json.loads(sys.stdin.read())\n` +
    `pats = [v.DOSE_RE, v.DOSE_WORD_RE, v.DOSE_SPELLED_RE, v.DOSE_COUNT_RE, v.METADATA_RE]\n` +
    `print(json.dumps([[p.pattern[:30] for p in pats if p.search(v.normalise(s))] for s in items]))`,
    [], JSON.stringify(strings),
  );
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}
// Final copies load the fixture profile (Revision 2: a typed phone never makes a printable Final copy), so every page set
// below is a Final copy that could really print; the required lines are read from the payload, never typed here.
test('AC5: no sheet and no copy text, in either mode and any page set, contains verification metadata or a dose; the required crisis lines are always present', () => {
  const records = eight();
  const outputs = [];
  for (const [setName, inserts] of Object.entries(insertSets)) {
    for (const mode of MODES) {
      const state = mode === 'final' ? finalState(records, { inserts }) : stateOf(records, { mode, inserts });
      const opts = approvedOptions(inserts.callback ? { callback: ARRANGED_CALL } : {});
      const r = S.sheet(state, dataOf(records), PROFILED, opts);
      assert.equal(r.ok, true, setName + '/' + mode + ': ' + r.message);
      assert.deepEqual(r.blockers, [], setName + '/' + mode + ': current approval and any required call arrangements permit output');
      if (inserts.callback) assert.ok(r.html.includes('Your planned follow-up call'), 'all-on includes the callback text in the audit');
      outputs.push([setName + '/' + mode + '/html', r.html], [setName + '/' + mode + '/text', textOf(r.html)]);
      if (mode === 'final') {
        const t = S.text(state, dataOf(records), PROFILED, opts);
        assert.equal(t.ok, true, setName + ' text: ' + t.message);
        outputs.push([setName + '/text-copy', t.text]);
      }
      const visible = textOf(r.html);
      for (const id of PAYLOAD.required) {
        assert.ok(visible.includes(PAYLOAD.contacts[id].contact), setName + '/' + mode + ' carries the required line ' + id);
        assert.ok(visible.includes(governedName(id)), setName + '/' + mode + ' names the required line ' + id + ' by its official name');
      }
    }
  }
  for (const [label, text] of outputs) {
    assert.doesNotMatch(text, AC5, label);
    assert.equal(/SENTINEL-DETAILS-7f3a|2031-02-03|2032-04-05/.test(text), false, label + ': internal listing fields never print');
  }
  const hits = oracleHits(outputs.map(([, text]) => text));
  hits.forEach((patterns, i) => assert.deepEqual(patterns, [], outputs[i][0] + ' matches the validator patterns ' + JSON.stringify(patterns)));
});

test('AC5 on hostile feed text: every printed free-text field is filtered, and a hit in a name or phone blocks printing', () => {
  const hostile = [
    row(0, { description: 'Lovely place. Take 10 mg nightly.' }),
    row(1, { area: 'National (verify Maine availability)' }),
    row(2, { name: 'Verification Services Inc' }),
    row(3, { phone: '10 mcg line' }),
    row(4, { name: 'Zero' + ZWSP + 'width 1' + ZWJ + '0 mg Clinic' }),
  ];
  const r = renderApproved(hostile, finalState(hostile));
  assert.equal(r.ok, true, r.message);
  assert.doesNotMatch(textOf(r.html), /10 mg|mcg|Verification|verify/i);
  assert.equal(r.html.includes('1' + ZWJ + '0'), false, 'and the hidden character itself is not printed either');
  assert.ok(r.withheld.some(w => w.field === 'description' && w.reason === 'note'));
  assert.ok(r.withheld.some(w => w.field === 'area'));
  const codes = r.blockers.map(b => b.code);
  assert.ok(codes.includes('LISTING_TEXT'), 'a name or phone with forbidden text blocks printing');
  assert.ok(r.blockers.every(b => b.message.length > 0));
});

// ---- blockers and fail-closed -----------------------------------------------------------------------------
// REWRITTEN for Revision 2: UNIT_PHONE is gone. A typed phone never confirms the unit, so a Final copy without a loaded,
// current profile is blocked by UNIT_UNCONFIRMED (typed, missing or invalid alike), and the clean case loads the fixture.
test('blockers: a crisis number in a listing, an unconfirmed unit on a Final copy, hidden saved listings, an empty packet', () => {
  const clean = eight();
  assert.deepEqual(renderApproved(clean, finalState(clean)).blockers, [], 'a loaded, current profile: nothing in the way');
  const withCrisis = [row(0, { phone: '207-799-4160 | Crisis Line: 888-568-1112' }), ...clean.slice(1)];
  assert.ok(renderApproved(withCrisis, finalState(withCrisis)).blockers.some(b => b.code === 'CRISIS_NUMBER' && b.message.includes('Support 0')));
  assert.deepEqual(codesOf(renderApproved(clean, typedFinal(clean))), ['UNIT_UNCONFIRMED'], 'a valid typed phone does not confirm the unit');
  const noPhone = typedFinal(clean, { unit: { name: '4 East', phone: '', profile: '' } });
  assert.deepEqual(codesOf(renderApproved(clean, noPhone)), ['UNIT_UNCONFIRMED']);
  assert.deepEqual(codesOf(renderApproved(clean, { ...noPhone, mode: 'review' })), ['UNIT_UNCONFIRMED'], 'Review has the same approval requirement');
  const badPhone = typedFinal(clean, { unit: { name: '', phone: governed('emergency_911'), profile: '' } });
  assert.deepEqual(codesOf(renderApproved(clean, badPhone)), ['UNIT_UNCONFIRMED'], 'an invalid phone is no better');
  assert.ok(renderApproved(clean, badPhone).blockers.every(b => b.scope === undefined), 'the unit rule also guards Copy');
  const hidden = S.sheet(finalState(clean, { ids: [...idsOf(clean), 'gone-id'] }), dataOf(clean, undefined), PROFILED, approvedOptions());
  assert.equal(hidden.blockers.some(b => b.code === 'HIDDEN_LISTINGS'), false, 'a COMPLETE feed that lacks the id simply drops it');
  const partial = S.sheet(finalState(clean, { ids: [...idsOf(clean), 'gone-id'] }), S.validate(feed(clean, { categories: feed(clean).categories.map((c, i) => (i === 3 ? { ...c, available: false } : c)) })), PROFILED, approvedOptions());
  assert.ok(partial.blockers.some(b => b.code === 'HIDDEN_LISTINGS'), 'a PARTIAL feed holds saved listings back: printing is blocked, not silently shorter');
  assert.equal(S.sheet(stateOf([]), dataOf(clean), PAYLOAD, {}).code, 'EMPTY');
  assert.equal(S.sheet(stateOf([]), dataOf(clean), PAYLOAD, {}).ok, false);
});

test('FAIL CLOSED: a missing payload, missing `required`, a lost or blank contact, an unknown token all refuse to render', () => {
  const records = eight();
  const state = stateOf(records);
  const refuse = (payload, label) => {
    const r = S.sheet(state, dataOf(records), payload, {});
    assert.equal(r.ok, false, label);
    assert.equal(r.code, 'CRISIS_UNAVAILABLE', label);
    assert.equal(r.html || '', '', label + ': no html at all');
    assert.equal(S.text(finalState(records), dataOf(records), payload, {}).ok, false, label + ' (copy text too)');
  };
  refuse(null, 'null payload');
  refuse(undefined, 'undefined payload');
  refuse({}, 'empty payload');
  const noRequired = clone(PAYLOAD); delete noRequired.required; refuse(noRequired, 'no `required`');
  const emptyRequired = clone(PAYLOAD); emptyRequired.required = []; refuse(emptyRequired, 'empty `required`');
  const lost = clone(PAYLOAD); delete lost.contacts[PAYLOAD.required[0]]; refuse(lost, 'a required contact deleted');
  const blank = clone(PAYLOAD); blank.contacts[PAYLOAD.required[1]].contact = ''; refuse(blank, 'a required contact blank');
  const noCrisisLines = clone(PAYLOAD); noCrisisLines.crisis = []; refuse(noCrisisLines, 'no crisis lines');
  const unknown = clone(PAYLOAD);
  unknown.inserts.find(i => i.id === 'warning').groups[3].bullets[0] = 'Call {{crisis:not_a_real_id}} now';
  refuse(unknown, 'an unknown crisis token');
  const wrongContact = clone(PAYLOAD); wrongContact.crisis = wrongContact.crisis.filter(l => l.ref !== PAYLOAD.required[0]);
  refuse(wrongContact, 'a required line missing from the crisis block');
});

test('FAIL CLOSED on layout: a measurer that fails, returns zeros, or reports an unreasonable capacity refuses to render', () => {
  const records = eight();
  const state = stateOf(records);
  const run = measure => S.sheet(state, dataOf(records), PROFILED, approvedOptions({ measure }));
  assert.equal(run(() => null).code, 'MEASURE_FAILED');
  assert.equal(run(units => ({ heights: units.map(() => 0), capacity: 880 })).code, 'MEASURE_FAILED');
  assert.equal(run(units => ({ heights: units.map(() => 10), capacity: NaN })).code, 'MEASURE_FAILED');
  assert.equal(run(units => ({ heights: units.map(() => 5000), capacity: 880 })).code, 'OVERFLOW');
  const ok = run(units => ({ heights: units.map(() => 90), capacity: 880 }));
  assert.equal(ok.ok, true);
  assert.ok(ok.pages.every(p => p.used <= p.capacity));
});

test('the crisis block must land on page 1: a layout that pushes it later is refused', () => {
  const records = eight();
  const state = stateOf(records);
  // Header and intro fill sheet 1 completely, so the crisis block would start sheet 2.
  const r = S.sheet(state, dataOf(records), PROFILED, approvedOptions({ measure: units => ({ heights: units.map(u => (u.key === 'p1-header' || u.key === 'intro-0' ? 440 : 100)), capacity: 880 }) }));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'CRISIS_NOT_PAGE_ONE');
});

// Extended for Revision 2: 4, 8 and 12 listings, both copies (the Final copy with a loaded profile), every page set.
test('the default estimator is deterministic, fits every standard page on a sheet on its own, and is not the production measurer', () => {
  for (const count of [4, 8, 12]) {
    const records = Array.from({ length: count }, (_, i) => row(i, i % 3 === 1 ? { category: 'peer_support', name: 'Peer Group ' + i } : {}));
    for (const [name, inserts] of Object.entries(insertSets)) {
      for (const mode of MODES) {
        const label = count + '/' + name + '/' + mode;
        const state = mode === 'final' ? finalState(records, { inserts }) : stateOf(records, { inserts });
        const options = inserts.callback ? { callback: ARRANGED_CALL } : {};
        const a = renderApproved(records, state, PROFILED, options);
        const b = renderApproved(records, state, PROFILED, options);
        assert.equal(a.html, b.html, label + ': same input, same bytes');
        assert.equal(a.ok, true, label + ': ' + a.message);
        assert.ok(a.count >= 1 && a.pages.length === a.count, label);
        assert.ok(a.pages.every(p => p.used <= p.capacity), label + ': no estimated page is over capacity');
        assert.deepEqual(a.blockers, [], label + ': nothing in the way');
        assert.equal(a.html.split('data-fd-packet-res').length - 1, count, label + ': every listing printed once');
      }
    }
  }
  assert.equal(typeof S.estimate, 'function');
});

// ---- the copy text ------------------------------------------------------------------------------------------
test('copy text: crisis lines first by official name, then each listing, raw (never HTML-escaped), no unit details, Final only', () => {
  const records = [row(0, { name: "Children's Place & Co", area: 'York' }), ...eight().slice(1)];
  const state = finalState(records);
  const t = S.text(state, dataOf(records), PROFILED, approvedOptions());
  assert.equal(t.ok, true, t.message);
  assert.ok(t.text.includes("Children's Place & Co"), 'raw characters, not entities');
  assert.equal(/&#39;|&amp;|&lt;/.test(t.text), false);
  assert.ok(t.text.indexOf(governed('lifeline_988')) < t.text.indexOf("Children's Place"), 'crisis lines come first');
  for (const line of PAYLOAD.crisis) assert.ok(t.text.includes(governedName(line.ref) + ': ' + governed(line.ref)), line.ref + ': official name, then contact');
  for (const value of [FIXTURE.profile.unitName, FIXTURE.profile.unitPhone, FIXTURE.profile.org, '4 East', '555-0100']) {
    assert.equal(t.text.includes(value), false, 'the unit is not copied into a medical record field: ' + value);
  }
  assert.doesNotMatch(t.text, /Not a medical record/, 'text that is going INTO the record cannot say it is not part of it');
  assert.match(t.text, /ReConnect community directory on 2026-10-12/);
  assert.equal(S.text(stateOf(records, { mode: 'review' }), dataOf(records), PROFILED, approvedOptions()).ok, false, 'a Review draft never goes into the record');
  assert.equal(S.text(stateOf(records, { mode: 'review' }), dataOf(records), PROFILED, approvedOptions()).code, 'NOT_FINAL');
  const hidden = S.text(finalState([row(0, { name: 'A' + RLO + 'B' + ZWSP + 'C' })]), dataOf([row(0, { name: 'A' + RLO + 'B' + ZWSP + 'C' })]), PROFILED, approvedOptions()).text;
  assert.equal(hidden.includes(RLO) || hidden.includes(ZWSP), false, 'control and bidi characters are stripped');
  assert.ok(hidden.includes('ABC'), 'and what is left is the visible name');
});

test('the footer prints the directory copy date and the OLDEST helpline check date (never the file date) and never claims the listings were verified', () => {
  const records = eight();
  const r = S.sheet(finalState(records), dataOf(records, { generatedAt: '2026-09-30T08:00:00Z' }), PROFILED, approvedOptions());
  const text = textOf(r.html);
  assert.match(text, /ReConnect community directory on 2026-09-30/);
  assert.match(text, /Call ahead to confirm hours, cost and availability/);
  assert.match(text, /Not a medical record/);
  assert.match(text, new RegExp('Helpline numbers checked against official sources, as of ' + PAYLOAD.checkedOn + '\\.'));
  assert.ok(PAYLOAD.checkedOn < PAYLOAD.generatedAt, 'the check date is older than the file date, so the two cannot be confused in this test');
  assert.equal(text.includes('as of ' + PAYLOAD.generatedAt), false, 'the file date is not presented as a check date');
  assert.equal(text.split('Helpline numbers checked').length - 1, r.count, 'the line is on every page');
  assert.doesNotMatch(text, /verified/i);
  const undated = S.sheet(finalState(records), dataOf(records), { ...PROFILED, checkedOn: undefined }, approvedOptions());
  assert.doesNotMatch(textOf(undated.html), /Helpline numbers checked/, 'no check date, no claim of a check');
});

// ---- review fixes: crisis numbers in any shape, hidden characters, one cleaned set of listings --------------------
test('numbers: a ten-digit number is taken whole so surrounding text cannot hide it; short codes are standalone runs only', () => {
  assert.deepEqual(S.numbers('1-888-568-1112 (24/7)'), ['8885681112'], 'a trailing (24/7) does not hide the number');
  assert.deepEqual(S.numbers('Call (888) 568-1112 or 988 (24 hours)'), ['8885681112', '988']);
  assert.deepEqual(S.numbers('+1 888.568.1112'), ['8885681112']);
  assert.deepEqual(S.numbers('dial 9 1 1 now'), ['911'], 'spaced-out short code');
  assert.deepEqual(S.numbers('9-8-8'), ['988']);
  assert.deepEqual(S.numbers('Open since 1988, ext 9881'), ['1988', '9881'], 'longer runs are their own numbers, never the short code inside them');
  assert.deepEqual(S.numbers('1-800-988-0199'), ['8009880199'], 'the groups of a longer number are not re-read as short codes');
  assert.deepEqual(S.numbers('Mon-Fri 8-4, ages 18 and up'), [], 'ordinary figures are not numbers worth matching');
  assert.deepEqual(S.numbers('ref 7417412'), [], 'a seven-digit run is not read as the six-digit code at its front');
});

test('a crisis number is recognised however it is dressed: trailing text, other-script digits, invisible characters, tag characters', () => {
  const hits = [
    '1-888-568-1112 (24/7)', '988 (24 hours)', 'Call 988.', 'text 9 8 8', cp(0x669, 0x668, 0x668), cp(0x96f, 0x96e, 0x96e),
    '9' + TAG_ONE + '88', '9' + ZWSP + '88', RLO + '988', '888' + NBSP + '568' + NBSP + '1112',
  ];
  for (const hit of hits) assert.equal(S.crisisHit(hit, PAYLOAD), true, JSON.stringify(hit));
  for (const clean of ['1988', 'Suite 9881', '(207) 555-0100', 'Open 9 to 5', 'Ages 18-24']) assert.equal(S.crisisHit(clean, PAYLOAD), false, clean);
  assert.equal(S.crisisHit('Call 988', { contacts: {} }), false, 'no registered numbers, nothing to match (the payload check refuses such a payload before this)');
});

test('unit name: a crisis number or a phone number in the name is rejected; a hidden character is dropped, not printed', () => {
  for (const bad of ['Call 988', '1-888-568-1112 (24/7)', 'Unit 4 207 555 0100', '2075550100', '9 1 1']) {
    assert.equal(S.unitName(bad, PAYLOAD).ok, false, bad);
    assert.ok(S.unitName(bad, PAYLOAD).error.length > 0, 'the rejection explains itself');
  }
  assert.equal(S.unitName('Unit 4 (P6)', PAYLOAD).ok, true);
  assert.equal(S.unitName('Unit 4 East 2', PAYLOAD).ok, true, 'ordinary digits are fine');
  assert.deepEqual(S.unitName('Uni' + ZWSP + 't' + RLO + ' 4', PAYLOAD), { ok: true, value: 'Unit 4', error: '' });
  assert.equal(S.phoneLike('call 207 555 0100'), true);
  assert.equal(S.phoneLike('207' + cp(0x2028) + '555' + cp(0x2029) + '0100'), true, 'any whitespace between the groups, not just a space');
  assert.equal(S.phoneLike('Unit 4'), false);
});

test('a description is judged by the length the FEED cut it at, before whitespace was collapsed', () => {
  // 432 characters as stored, 312 once whitespace is collapsed: the old order treated it as a short label and printed the fragment.
  const stored = 'Open daily. ' + 'word   '.repeat(60);
  assert.ok(stored.length >= 400 && S.strip(stored).length < 400);
  const out = S.description(stored, 'https://example.org/');
  assert.equal(out.text, 'Open daily.', 'trimmed back to the last complete sentence');
  assert.equal(S.description('Counselling' + ' '.repeat(10), 'https://example.org/').text, 'Counselling', 'a short stored label is left alone');
});

test('paper and copy print the SAME cleaned listings: one withheld field is withheld in both, and a hidden character is in neither', () => {
  const records = [
    row(0, { name: 'A' + RLO + 'lpha' + ZWSP + ' Clinic', description: 'Call 1-888-568-1112 (24/7) about the walk-in schedule.', area: 'York' + TAG_ONE + ' County' }),
    row(1, { area: 'Dial 9 8 8', website: 'https://10mg.example.org/' }),
    row(2, {}),
  ];
  const state = finalState(records);
  const paper = renderApproved(records, state);
  const copy = S.text(state, dataOf(records), PROFILED, approvedOptions());
  assert.equal(paper.ok && copy.ok, true, paper.message + copy.message);
  const visible = textOf(paper.html);
  for (const [label, text] of [['paper', visible], ['copy', copy.text]]) {
    assert.ok(text.includes('Alpha Clinic'), label + ': the visible name');
    assert.equal(text.includes('walk-in schedule'), false, label + ': a description holding a crisis number is withheld whole');
    assert.equal(text.includes('Dial 9 8 8'), false, label + ': a crisis number in an area is withheld');
    assert.equal(text.includes('10mg'), false, label + ': a dose-shaped website is withheld');
    assert.ok(text.includes('York County'), label + ': the visible area');
  }
  assert.match(visible, /More details on the website\./, 'a withheld description points at the website when there is one');
  const everything = paper.html + copy.text;
  for (const char of [RLO, ZWSP, TAG_ONE]) assert.equal(everything.includes(char), false, 'no hidden character reaches paper or the record');
  assert.deepEqual(Object.fromEntries(paper.withheld.map(w => [w.field, w.reason])), { description: 'crisis', area: 'crisis', website: 'note' }, 'each omission says WHY, so the preview can tell the trainee');
  assert.equal(paper.addresses.some(a => a.url.includes('10mg')), false, 'no QR address for a withheld website');
});

test('a crisis number in a listing NAME blocks printing, like one in a phone field', () => {
  const clean = eight();
  const named = [row(0, { name: 'Hope Line 988' }), ...clean.slice(1)];
  const r = renderApproved(named, finalState(named));
  assert.ok(r.blockers.some(b => b.code === 'CRISIS_NUMBER' && b.message.includes('Hope Line 988')));
  assert.equal(textOf(r.html).includes('Hope Line 988'), false, 'and the listing is not printed at all');
});

// ---- eligibility: one rule for what may be offered and printed (Revision 2) ------------------------------------------
// Crisis numbers are read from the payload at run time, never typed here.
const crisisOfLength = len => {
  const found = PAYLOAD.crisisNumbers.find(n => n.length === len);
  assert.ok(found, 'the payload registers a ' + len + '-digit crisis number');
  return found;
};
test('eligibility: each reason code (PAYLOAD, CRISIS_CATEGORY, CRISIS_NUMBER, NO_CONTACT), and a good listing passes', () => {
  assert.equal(S.eligibility(row(0), PAYLOAD), '', 'a listing with a dial link and a website is eligible');
  for (const bad of [null, undefined, {}, 7, { ...PAYLOAD, required: [] }, { ...PAYLOAD, crisis: [] }]) {
    assert.equal(S.eligibility(row(0), bad), 'PAYLOAD', 'no usable payload, nothing eligible: ' + JSON.stringify(bad && Object.keys(bad)));
    assert.equal(S.eligibility(row(1, { category: 'crisis' }), bad), 'PAYLOAD', 'the payload is asked before anything else');
  }
  assert.equal(S.eligibility(row(0, { category: 'crisis', name: 'Some Service' }), PAYLOAD), 'CRISIS_CATEGORY', 'crisis services print only in the crisis box');
  assert.equal(S.eligibility(row(0, { category: 'crisis', contactHref: '', website: '' }), PAYLOAD), 'CRISIS_CATEGORY', 'the category is the reason even with no contact');
  const ten = crisisOfLength(10);
  const dressed = ten.slice(0, 3) + '-' + ten.slice(3, 6) + '-' + ten.slice(6);
  assert.equal(S.eligibility(row(0, { name: 'Help ' + dressed }), PAYLOAD), 'CRISIS_NUMBER', 'a crisis number in the name');
  assert.equal(S.eligibility(row(0, { phone: 'Main 207-700-0123, after hours ' + dressed }), PAYLOAD), 'CRISIS_NUMBER', 'in the free-text phone');
  assert.equal(S.eligibility(row(0, { contactHref: 'tel:+1' + ten }), PAYLOAD), 'CRISIS_NUMBER', 'as the dial link');
  assert.equal(S.eligibility(row(0, { contactHref: 'sms:' + crisisOfLength(6) }), PAYLOAD), 'CRISIS_NUMBER', 'a texted short code');
  assert.equal(S.eligibility(row(0, { contactHref: 'tel:' + crisisOfLength(3) }), PAYLOAD), 'CRISIS_NUMBER', 'a dialled short code');
  assert.equal(S.eligibility(row(0, { contactHref: '', website: '' }), PAYLOAD), 'NO_CONTACT');
  assert.equal(S.eligibility(row(0, { contactHref: '', website: '', phone: '207-700-0123' }), PAYLOAD), 'NO_CONTACT', 'a free-text phone is not a contact on record');
  for (const href of ['mailto:help@example.org', 'tel:', 'tel:12', 'tel:207-700-0123', 'javascript:alert(1)', 'https://example.org/']) {
    assert.equal(S.eligibility(row(0, { contactHref: href, website: '' }), PAYLOAD), 'NO_CONTACT', 'not dialable: ' + href);
  }
  for (const junk of [null, undefined, 'a0', 7]) assert.equal(S.eligibility(junk, PAYLOAD), 'NO_CONTACT', 'not a row: ' + String(junk));
});

test('eligibility on partial rows: a dial link alone or a website alone is enough, and missing fields never throw', () => {
  assert.equal(S.eligibility(row(0, { website: '' }), PAYLOAD), '', 'a dial link alone');
  assert.equal(S.eligibility(row(0, { contactHref: '' }), PAYLOAD), '', 'a website alone');
  assert.equal(S.eligibility({ id: 'x', contactHref: 'tel:2077000123' }, PAYLOAD), '', 'no name, phone or category');
  assert.equal(S.eligibility({ id: 'x', website: 'https://example.org/' }, PAYLOAD), '');
  assert.equal(S.eligibility({}, PAYLOAD), 'NO_CONTACT');
  assert.equal(S.eligibility({ id: 'x', name: null, phone: undefined, contactHref: 7, website: '' }, PAYLOAD), 'NO_CONTACT');
});

test('every reason code has plain, specific text the trainee reads; any other code has none', () => {
  assert.deepEqual(Object.keys(S.REASONS).sort(), ['CRISIS_CATEGORY', 'CRISIS_NUMBER', 'LISTING_TEXT', 'NO_CONTACT', 'PAYLOAD']);
  for (const code of Object.keys(S.REASONS)) {
    const text = S.reasonText(code);
    assert.ok(text.length > 20, code);
    assert.doesNotMatch(text, /[<>{}]/, code + ' is plain text');
    assert.equal(S.crisisHit(text, PAYLOAD), false, code + ' names no crisis number');
  }
  for (const other of ['INELIGIBLE', 'toString', '__proto__', 'hasOwnProperty', '', undefined, null]) assert.equal(S.reasonText(other), '', String(other));
});

test('a saved listing that has become ineligible is not printed and blocks with INELIGIBLE and its reason; a crisis number keeps its own code', () => {
  const records = [...eight(), row(8, { category: 'crisis', name: 'Crisis Service 8' }), row(9, { name: 'Unreachable 9', contactHref: '', website: '' })];
  const r = renderApproved(records, finalState(records));
  assert.equal(r.ok, true, r.message);
  const ineligible = r.blockers.filter(b => b.code === 'INELIGIBLE');
  assert.deepEqual(ineligible.map(b => b.id + ':' + b.reason).sort(), ['a8:CRISIS_CATEGORY', 'a9:NO_CONTACT']);
  assert.deepEqual(codesOf(r), ['INELIGIBLE', 'INELIGIBLE'], 'nothing else is in the way');
  for (const b of ineligible) {
    assert.ok(b.message.includes(S.reasonText(b.reason)), 'the message says why: ' + b.reason);
    assert.equal(b.scope, undefined, 'a listing blocker is not scoped to print: it stops Copy too');
  }
  const visible = textOf(r.html);
  assert.equal(visible.includes('Crisis Service 8') || visible.includes('Unreachable 9'), false, 'neither is printed');
  const copy = S.text(finalState(records), dataOf(records), PROFILED, approvedOptions());
  assert.deepEqual(copy.blockers.map(b => b.code), ['INELIGIBLE', 'INELIGIBLE'], 'Copy carries the same listing blockers');
  assert.equal(copy.text.includes('Crisis Service 8') || copy.text.includes('Unreachable 9'), false);
  const numbered = [row(0, { contactHref: 'tel:+1' + crisisOfLength(10) })];
  assert.deepEqual(codesOf(renderApproved(numbered, finalState(numbered))), ['CRISIS_NUMBER'], 'a crisis number keeps CRISIS_NUMBER, not INELIGIBLE');
});

// ---- the printed phone comes only from the feed's dial link (Revision 2) -----------------------------------------------
test('dial: Call or Text from the link, ten digits formatted, a leading 1 dropped, a keyword decoded; anything else is no number', () => {
  assert.deepEqual(S.dial(row(0, { contactHref: 'tel:2077000123' })), { verb: 'Call', number: '207-700-0123', keyword: '' });
  assert.deepEqual(S.dial(row(0, { contactHref: 'tel:+12077000123' })), { verb: 'Call', number: '207-700-0123', keyword: '' }, 'eleven digits with a leading 1');
  assert.deepEqual(S.dial(row(0, { contactHref: 'tel:12077000123' })), { verb: 'Call', number: '207-700-0123', keyword: '' });
  assert.deepEqual(S.dial(row(0, { contactHref: 'sms:55123' })), { verb: 'Text', number: '55123', keyword: '' }, 'a short code with no keyword');
  assert.deepEqual(S.dial(row(0, { contactHref: 'sms:55123?body=INFO' })), { verb: 'Text', number: '55123', keyword: 'INFO' }, 'a short code with a keyword');
  assert.deepEqual(S.dial(row(0, { contactHref: 'sms:+12077000123?body=HELP%20NOW' })), { verb: 'Text', number: '207-700-0123', keyword: 'HELP NOW' }, 'an encoded keyword is decoded');
  assert.equal(S.dial(row(0, { contactHref: 'sms:55123?body=%E0%A4' })).keyword, '', 'a keyword that does not decode is dropped, never printed raw');
  for (const href of ['', 'tel:', 'tel:12', 'tel:207-700-0123', 'tel:2077000123x', 'mailto:a@example.org', 'sms:55123?body=info']) {
    assert.equal(S.dial(row(0, { contactHref: href })), null, JSON.stringify(href));
  }
  assert.equal(S.dial(null), null);
  assert.equal(S.dial({ phone: '207-700-0123' }), null, 'a free-text phone is not a dial link');
});

test('paper and copy print the dial link\'s number, never the free-text phone; a text line says "(send KEYWORD)"; no link, no number', () => {
  const records = [
    row(0, { name: 'Linked Call', phone: '(207) 555-0199 ext 4, ask for intake', contactHref: 'tel:+12077000123' }),
    row(1, { name: 'Linked Text', phone: 'Text us', contactHref: 'sms:55123?body=INFO' }),
    row(2, { name: 'Bare Text', phone: '', contactHref: 'sms:55124' }),
    row(3, { name: 'Website Only', phone: '207-555-0188', contactHref: '', website: 'https://example.org/only' }),
  ];
  const paper = renderApproved(records, finalState(records));
  const copy = S.text(finalState(records), dataOf(records), PROFILED, approvedOptions());
  assert.equal(paper.ok && copy.ok, true, paper.message + copy.message);
  assert.deepEqual(paper.blockers, []);
  const visible = textOf(paper.html);
  assert.match(visible, /Call\s+207-700-0123/);
  assert.match(visible, /Text\s+55123\s+\(send INFO\)/);
  assert.match(visible, /Text\s+55124(?!\s+\(send)/, 'no keyword, no "(send ...)"');
  for (const freeText of ['555-0199', 'ask for intake', 'Text us', '555-0188']) {
    assert.equal(visible.includes(freeText), false, 'paper: the free-text phone never prints: ' + freeText);
    assert.equal(copy.text.includes(freeText), false, 'copy: the free-text phone never prints: ' + freeText);
  }
  assert.ok(copy.text.includes('- Linked Call · Call 207-700-0123 · '), 'copy: the formatted dial number');
  assert.ok(copy.text.includes('- Linked Text · Text 55123 (send INFO) · '), 'copy: the keyword');
  assert.ok(copy.text.includes('- Bare Text · Text 55124 · '));
  assert.ok(copy.text.includes('- Website Only · example.org · '), 'copy: no number at all, straight to the website');
  const section = name => paper.html.split('<section class="fd-packet-res"').find(part => part.includes('>' + name + '<')) || '';
  assert.ok(section('Website Only').length > 0);
  assert.equal(section('Website Only').includes('fd-packet-res__phone'), false, 'paper: no dial link, no phone line, though the feed has a free-text phone');
});

test('a dial link whose keyword is internal text (a tier or verification note) is withheld whole, and the omission is recorded', () => {
  const records = [row(0, { name: 'Tier Keyword', contactHref: 'sms:55123?body=L3' }), row(1, { name: 'Second Keyword', contactHref: 'sms:55124?body=VERIFY' })];
  const paper = renderApproved(records, finalState(records));
  const copy = S.text(finalState(records), dataOf(records), PROFILED, approvedOptions());
  assert.equal(paper.ok && copy.ok, true, paper.message + copy.message);
  for (const [label, text] of [['paper', textOf(paper.html)], ['copy', copy.text]]) {
    assert.doesNotMatch(text, /55123|55124|\(send|\bL3\b|VERIFY/, label + ': neither the keyword nor its number prints');
    assert.ok(text.includes('Tier Keyword') && text.includes('Second Keyword'), label + ': the listing still prints (it has a website)');
  }
  assert.deepEqual(paper.withheld.filter(w => w.field === 'contact').map(w => w.id + ':' + w.reason), ['a0:note', 'a1:note']);
  assert.deepEqual(paper.blockers, [], 'a withheld contact is noted, not a blocker');
});

// ---- the official governed names (Revision 2) ---------------------------------------------------------------------------
test('the crisis block, the copy and the wallet card print each line\'s OFFICIAL governed name (a sentinel), never a label', () => {
  const sentinel = clone(PROFILED);
  sentinel.crisis.forEach((line, i) => {
    sentinel.contacts[line.ref].name = 'SENTINEL-OFFICIAL-' + i + ' & Co';
    line.label = 'SENTINEL-LABEL-' + i; // a stale label key, as the old payload carried: it must never print
  });
  const records = eight();
  const paper = S.sheet(finalState(records), dataOf(records), sentinel, approvedOptions());
  const copy = S.text(finalState(records), dataOf(records), sentinel, approvedOptions());
  const card = S.cardSheet(sentinel, {});
  for (const [label, r] of [['paper', paper], ['copy', copy], ['card', card]]) assert.equal(r.ok, true, label + ': ' + r.message);
  const page1 = paper.html.split('data-fd-packet-page')[1];
  const lineOn = (html, ref) => (html.match(new RegExp('data-fd-packet-crisis="' + ref + '"[\\s\\S]*?</li>')) || [''])[0];
  sentinel.crisis.forEach((line, i) => {
    const official = 'SENTINEL-OFFICIAL-' + i + ' & Co';
    assert.ok(lineOn(page1, line.ref).includes(S.esc(official)), 'page 1: line ' + i + ' carries its official name, escaped');
    assert.ok(lineOn(card.html, line.ref).includes(S.esc(official)), 'card: line ' + i + ' carries its official name, escaped');
    assert.ok(copy.text.includes(official + ': ' + sentinel.contacts[line.ref].contact), 'copy: the raw official name, then the contact');
  });
  for (const [label, out] of [['paper', paper.html], ['copy', copy.text], ['card', card.html]]) {
    assert.equal(out.includes('SENTINEL-LABEL'), false, label + ' never prints a label');
  }
});

// ---- the unit: header, draft line, Review wording (Revision 2) -----------------------------------------------------
test('the header uses only current independently approved unit identity and approved branding', () => {
  const records = eight();
  const orgLines = r => (r.html.match(/<p class="fd-packet-org">[^<]*<\/p>/g) || []).map(p => textOf(p).trim());
  const none = render(records, typedState(records, { unit: { name: '', phone: '', profile: '' } }));
  const typed = render(records, typedState(records));
  assert.deepEqual(orgLines(none), [], 'no unit and no profile: no org line');
  assert.deepEqual(orgLines(typed), [], 'typed unit identity cannot reach the patient header');
  assert.deepEqual(orgLines(renderApproved(records, finalState(records))), [FIXTURE.profile.org + ' · ' + FIXTURE.profile.unitName]);
  const unbrandedProfile = { ...FIXTURE.profile, brandingApproved: false, org: null, revision: 'c'.repeat(64) };
  const unbranded = renderApproved(records, finalState(records), withProfiles(PAYLOAD, unbrandedProfile));
  assert.deepEqual(orgLines(unbranded), [FIXTURE.profile.unitName], 'approved unit without branding uses only its unit name');
  assert.equal(unbranded.html.includes(FIXTURE.profile.org), false);
  const loose = render(records, finalState(records), withProfiles(PAYLOAD, { ...FIXTURE.profile, brandingApproved: 'true' }), approvedOptions());
  assert.ok(codesOf(loose).includes('UNIT_UNCONFIRMED'), 'an editable boolean-like value cannot match the approved profile');
  assert.deepEqual(orgLines(loose), []);
  for (const r of [none, typed, unbranded, loose]) assert.equal(r.html.includes('Maine Medical Center'), false, 'no hard-coded organisation');
});

test('both modes label unapproved previews as drafts for editing and withhold typed unit details', () => {
  const records = eight(), draft = /data-fd-packet-draft/;
  for (const mode of MODES) {
    for (const unit of [{ name: '4 East', phone: '', profile: '' }, { name: '4 East', phone: '(207) 555-0100', profile: '' },
      { name: '', phone: '', profile: '' }, { name: '', phone: '555-0100', profile: '' }]) {
      const output = render(records, typedState(records, { mode, unit }));
      assert.equal(output.html.split('data-fd-packet-draft').length - 1, 1, mode + ': draft warning once');
      assert.match(output.html.split('data-fd-packet-page')[1], draft, 'draft warning is on page one');
      assert.match(textOf(output.html), /Draft for editing.*approval is required before this packet can be printed or copied/);
      assert.doesNotMatch(output.html, /4 East|555-0100|Your nurse will write/, 'no unsupported unit detail or handwritten-completion promise');
      assert.ok(codesOf(output).includes('UNIT_UNCONFIRMED'));
    }
    assert.doesNotMatch(renderApproved(records, stateOf(records, { mode })).html, draft, 'current approval clears the editing-only warning');
  }
});

test('the Review copy promises a talk before discharge, never a "final copy"; the Final copy carries neither the note nor the tip', () => {
  const records = eight();
  const review = textOf(renderApproved(records, stateOf(records)).html);
  assert.doesNotMatch(review, /final copy|finali[sz]e|keep what you tick/i, 'no promise that depends on a Final copy existing');
  assert.match(review, /go over (?:this|your choices) with you before you leave/);
  const final = textOf(renderApproved(records, finalState(records)).html);
  assert.doesNotMatch(final, /While you are still here|Tick the ones/);
});

// Removing contact text never removes the independent output-approval requirement.
const BARE = (() => {
  const out = clone(PROFILED);
  out.inserts = JSON.parse(JSON.stringify(out.inserts).replace(/\{\{unit(?:Name|Phone|Purpose|Hours|Contact)\}\}/g, 'your care team'));
  return out;
})();
test('both modes require approval even with no unit tokens; optional tokens and callback cannot bypass it', () => {
  const records = eight(), nobody = { name: '', phone: '', profile: '' };
  for (const mode of MODES) {
    const run = (payload, more = {}) => render(records, typedState(records, { mode, unit: { ...nobody }, ...more }), payload);
    assert.deepEqual(codesOf(run(BARE)), ['UNIT_UNCONFIRMED'], 'absence of unit wording is not permission to output');
    assert.deepEqual(codesOf(run(PROFILED)), ['UNIT_UNCONFIRMED']);
    assert.deepEqual(codesOf(run(BARE, { unit: { name: '4 East', phone: '', profile: '' } })), ['UNIT_UNCONFIRMED']);
    const tokened = clone(BARE);
    tokened.inserts.find(i => i.id === 'notes').body += ' Ask the team on {{unitName}}.';
    for (const on of [false, true]) assert.deepEqual(codesOf(run(tokened, { inserts: { notes: on } })), ['UNIT_UNCONFIRMED']);
    assert.deepEqual(codesOf(run(BARE, { inserts: { callback: true } })), ['UNIT_UNCONFIRMED', 'CALLBACK_UNCONFIRMED']);
    assert.deepEqual(renderApproved(records, stateOf(records, { mode, inserts: { callback: true, notes: true } }), tokened,
      { callback: ARRANGED_CALL }).blockers, [], 'independent approval plus a complete arranged call permits the selected pages');
  }
});

test('UNIT_UNCONFIRMED: typed, expired, missing and unknown-clock profiles cannot produce unit details in either mode', () => {
  const records = eight(), last = Date.UTC(2100, 0, 1, 4, 59, 59, 999);
  const msg = r => (r.blockers.find(b => b.code === 'UNIT_UNCONFIRMED') || {}).message || '';
  for (const mode of MODES) {
    assert.deepEqual(renderApproved(records, stateOf(records, { mode }), PROFILED, { now: last }).blockers, [], 'last New York millisecond is valid');
    const expired = renderApproved(records, stateOf(records, { mode }), PROFILED, { now: last + 1 });
    assert.deepEqual(codesOf(expired), ['UNIT_UNCONFIRMED']);
    assert.match(msg(expired), /expired/);
    assert.equal(expired.unit.loaded && expired.unit.expired && !expired.unit.confirmed, true);
    const oldFixture = renderApproved(records, stateOf(records, { mode, unit: { name: '', phone: '', profile: FIXTURE.expired.id } }));
    const unknownClock = renderApproved(records, stateOf(records, { mode }), PROFILED, { now: NaN });
    const noneAvailable = render(records, typedState(records, { mode }), EMPTY_PROFILES);
    const typed = render(records, typedState(records, { mode }));
    for (const denied of [expired, oldFixture, unknownClock, noneAvailable, typed]) {
      assert.deepEqual(codesOf(denied), ['UNIT_UNCONFIRMED']);
      assert.equal(denied.html.includes(FIXTURE.profile.unitPhone), false, 'no stale profile phone enters patient preview');
      for (const blocker of denied.blockers) {
        assert.equal(blocker.scope, undefined, 'Copy is subject to the same restriction');
        assert.doesNotMatch(blocker.message, /switch.*Review copy/i);
      }
    }
    assert.match(msg(noneAvailable), /None is set up yet/i);
    assert.match(msg(typed), /Load the profile/);
  }
});

test('CALLBACK_UNCONFIRMED: current program approval and all discharge arrangements are required in both modes', () => {
  const records = eight();
  const noProgramProfile = { ...FIXTURE.profile, callbackProgram: false, callbackTeam: '', callbackPhone: '', callbackHours: '', callbackFallback: '', revision: 'c'.repeat(64) };
  const noProgram = withProfiles(PAYLOAD, noProgramProfile);
  for (const mode of MODES) {
    const state = stateOf(records, { mode, inserts: { callback: true } });
    assert.deepEqual(renderApproved(records, state, PROFILED, { callback: ARRANGED_CALL }).blockers, []);
    assert.deepEqual(codesOf(renderApproved(records, state, noProgram, { callback: ARRANGED_CALL })), ['CALLBACK_UNCONFIRMED']);
    assert.deepEqual(renderApproved(records, stateOf(records, { mode }), noProgram).blockers, [], 'disabled callback page needs no program');
    const loose = render(records, state, withProfiles(PAYLOAD, { ...FIXTURE.profile, callbackProgram: 'true' }), approvedOptions({ callback: ARRANGED_CALL }));
    const expired = renderApproved(records, stateOf(records, { mode, inserts: { callback: true }, unit: { name: '', phone: '', profile: FIXTURE.expired.id } }), PROFILED, { callback: ARRANGED_CALL });
    const typed = render(records, typedState(records, { mode, inserts: { callback: true } }), PROFILED, { callback: ARRANGED_CALL });
    for (const denied of [loose, expired, typed]) {
      assert.deepEqual(codesOf(denied), ['UNIT_UNCONFIRMED', 'CALLBACK_UNCONFIRMED']);
      assert.equal(denied.html.includes('Your planned follow-up call'), false, 'no unapproved promise is rendered');
      assert.ok(denied.blockers.every(b => b.scope === undefined && b.message.length > 0));
    }
  }
});

test('Copy retains unit and callback blockers as well as listing blockers; only an approved complete packet is clear', () => {
  const records = eight(), state = typedFinal(records, { inserts: { callback: true } });
  const copy = S.text(state, dataOf(records), PROFILED, {});
  assert.equal(copy.ok, true, copy.message);
  assert.deepEqual(codesOf(copy), ['UNIT_UNCONFIRMED', 'CALLBACK_UNCONFIRMED']);
  for (const value of ['4 East', '555-0100']) assert.equal(copy.text.includes(value), false);
  const expired = S.text(finalState(records, { unit: { name: '', phone: '', profile: FIXTURE.expired.id } }), dataOf(records), PROFILED, approvedOptions());
  assert.deepEqual(codesOf(expired), ['UNIT_UNCONFIRMED']);
  const withIneligible = [...records, row(8, { category: 'crisis', name: 'Crisis Service 8' })];
  const mixed = S.text(typedFinal(withIneligible, { inserts: { callback: true } }), dataOf(withIneligible), PROFILED, {});
  assert.deepEqual(codesOf(mixed), ['INELIGIBLE', 'UNIT_UNCONFIRMED', 'CALLBACK_UNCONFIRMED']);
  const approved = S.text(finalState(records), dataOf(records), PROFILED, approvedOptions());
  assert.deepEqual(approved.blockers, []);
});

// ---- unit profiles: re-validated in the browser, resolved by one function (Revision 2) ---------------------------------
test('a unit profile is re-validated before it is offered: a crisis-number phone, markup, a bad id or a missing value drops it', () => {
  const base = FIXTURE.profile;
  assert.deepEqual(S.profileUsable(base, PAYLOAD), {
    id: base.id, label: base.label, name: base.unitName, phone: base.unitPhone, org: base.org, callbackProgram: true, usableThrough: base.usableThrough,
    expiresOn: base.expiresOn, revision: base.revision, purpose: base.unitPurpose, hours: base.unitHours,
    callbackTeam: base.callbackTeam, callbackPhone: base.callbackPhone, callbackHours: base.callbackHours, callbackFallback: base.callbackFallback,
  });
  const ten = crisisOfLength(10);
  const crisisPhone = '(' + ten.slice(0, 3) + ') ' + ten.slice(3, 6) + '-' + ten.slice(6);
  const bad = [
    ['a registered crisis number as the unit phone', { unitPhone: crisisPhone }],
    ['a service code as the exchange', { unitPhone: '(207) 411-0142' }],
    ['a seven-digit phone', { unitPhone: '555-0142' }],
    ['markup in the unit name', { unitName: '<b>4 East</b>' }],
    ['braces in the unit name', { unitName: '{{unitName}}' }],
    ['a phone number in the unit name', { unitName: 'Unit 207 555 0142' }],
    ['internal text in the unit name', { unitName: 'Verification Unit' }],
    ['markup in the label', { label: 'Unit <i>4</i>' }],
    ['markup in the org', { org: '<script>Org</script>' }],
    ['an upper-case id', { id: 'Fixture-Unit' }],
    ['an underscore in the id', { id: 'fixture_unit' }],
    ['an id over 40 characters', { id: 'a'.repeat(41) }],
    ['an empty id', { id: '' }],
    ['a numeric id', { id: 7 }],
    ['no unit name', { unitName: '' }],
    ['no unit phone', { unitPhone: undefined }],
    ['no label', { label: '' }],
    ['no confirmed purpose', { unitPurpose: '' }],
    ['no staffed hours', { unitHours: '' }],
    ['no exact version', { revision: '' }],
    ['no expiry date', { expiresOn: '' }],
    ['callback program without its team', { callbackTeam: '' }],
    ['callback program without a return number', { callbackPhone: '' }],
    ['callback program without staffed return hours', { callbackHours: '' }],
    ['callback program without its fallback', { callbackFallback: '' }],
  ];
  for (const [why, change] of bad) {
    const profile = { ...base, ...change };
    assert.equal(S.profileUsable(profile, PAYLOAD), null, why);
    assert.deepEqual(S.profiles(withProfiles(PAYLOAD, profile)), [], why + ': not offered');
    assert.deepEqual(S.profiles(withProfiles(PAYLOAD, profile, FIXTURE.expired)).map(p => p.id), [FIXTURE.expired.id], why + ': the others still are');
  }
  for (const junk of [null, undefined, 'fixture-unit', 7, []]) assert.equal(S.profileUsable(junk, PAYLOAD), null, JSON.stringify(junk));
  const unbranded = { ...base, org: null, brandingApproved: false, callbackProgram: false,
    callbackTeam: '', callbackPhone: '', callbackHours: '', callbackFallback: '', unitPhone: '207-555-0142', usableThrough: 20991231 };
  const display = S.profileUsable(unbranded, PAYLOAD);
  assert.equal(display.phone, '(207) 555-0142', 'a valid phone is formatted for the patient');
  assert.equal(display.org, '', 'unapproved branding is absent');
  assert.equal(display.callbackProgram, false);
  assert.equal(display.usableThrough, '', 'a non-string date is empty and therefore expired');
  assert.equal(S.unitOf({ unit: { profile: base.id } }, withProfiles(PAYLOAD, unbranded), TEST_NOW,
    profileReceipt(unbranded, TEST_NOW)).confirmed, false, 'a bad expiry cannot be approved by a receipt');
  // A profile in state that fails re-validation is not loaded, and the Final copy is held back.
  const refused = withProfiles(PAYLOAD, { ...base, unitPhone: crisisPhone });
  const info = S.unitOf({ unit: { name: '', phone: '', profile: base.id } }, refused, Date.UTC(2026, 9, 12));
  assert.equal(info.loaded || info.confirmed || info.phone !== '', false, 'an unusable profile is "not loaded"');
  assert.deepEqual(codesOf(renderApproved(eight(), finalState(eight()), refused)), ['UNIT_UNCONFIRMED']);
  assert.equal(S.profileFind(PROFILED, base.id).id, base.id);
  for (const id of ['', 'no-such-unit', 'Fixture-Unit', null, 7, 'a'.repeat(41)]) assert.equal(S.profileFind(PROFILED, id), null, String(id));
  assert.equal(S.profileFind(EMPTY_PROFILES, base.id), null, 'an explicitly empty payload carries none');
  assert.equal(S.profileFind(null, base.id), null);
});

test('profile validity follows New York calendar-day boundaries, including both DST transitions, and fails on a bad date or clock', () => {
  for (const [through, last, next] of [
    ['2099-12-31', '2100-01-01T04:59:59.999Z', '2100-01-01T05:00:00.000Z'],
    ['2026-03-07', '2026-03-08T04:59:59.999Z', '2026-03-08T05:00:00.000Z'],
    ['2026-03-08', '2026-03-09T03:59:59.999Z', '2026-03-09T04:00:00.000Z'],
    ['2026-10-31', '2026-11-01T03:59:59.999Z', '2026-11-01T04:00:00.000Z'],
    ['2026-11-01', '2026-11-02T04:59:59.999Z', '2026-11-02T05:00:00.000Z'],
  ]) {
    assert.equal(S.expired(through, Date.parse(last)), false, through + ': last New York millisecond');
    assert.equal(S.expired(through, Date.parse(next)), true, through + ': next New York day');
  }
  const through = '2099-12-31';
  assert.equal(S.expired(through, TEST_NOW), false);
  for (const bad of ['', undefined, null, 20991231, '2099-12-31T00:00:00Z', '2099/12/31', '31-12-2099', ' 2099-12-31', 'never'])
    assert.equal(S.expired(bad, TEST_NOW), true, 'bad or missing date: ' + JSON.stringify(bad));
  for (const clock of [NaN, Infinity, -Infinity, undefined, null, '2026-10-12'])
    assert.equal(S.expired(through, clock), true, 'unknown clock: ' + String(clock));
});

test('unit identity resolves from the loaded profile, but only the matching current receipt confirms it; typed values never confirm', () => {
  const now = Date.UTC(2026, 9, 12);
  const typed = { name: '4 West', phone: '(207) 555-0100' };
  assert.deepEqual(S.unitOf({ unit: { ...typed, profile: FIXTURE.profile.id } }, PROFILED, now, profileReceipt(FIXTURE.profile, now)), {
    name: FIXTURE.profile.unitName, phone: FIXTURE.profile.unitPhone, org: FIXTURE.profile.org, profile: FIXTURE.profile.id,
    loaded: true, expired: false, confirmed: true, callbackProgram: true, nameError: '', phoneError: '', daysToExpiry: 26745,
    purpose: FIXTURE.profile.unitPurpose, hours: FIXTURE.profile.unitHours, callbackTeam: FIXTURE.profile.callbackTeam,
    callbackPhone: FIXTURE.profile.callbackPhone, callbackHours: FIXTURE.profile.callbackHours, callbackFallback: FIXTURE.profile.callbackFallback,
  }, 'the profile wins and the typed values beside it are ignored');
  assert.equal(S.unitOf({ unit: { ...LOADED } }, PROFILED, now).confirmed, false, 'loaded data without an independent receipt is unconfirmed');
  assert.deepEqual(S.unitOf({ unit: { ...typed, profile: 'no-such-unit' } }, PROFILED, now), {
    name: '4 West', phone: '(207) 555-0100', org: '', profile: '', loaded: false, expired: false, confirmed: false, callbackProgram: false, nameError: '', phoneError: '',
  }, 'an unknown id is not loaded, and typed values are not confirmed');
  assert.equal(S.unitOf({ unit: { ...typed, profile: FIXTURE.profile.id } }, EMPTY_PROFILES, now).loaded, false, 'a profile id the payload does not carry');
  const lapsed = S.unitOf({ unit: { profile: FIXTURE.expired.id } }, PROFILED, now);
  assert.equal(lapsed.loaded && lapsed.expired && !lapsed.confirmed, true, 'loaded but lapsed is not confirmed');
  assert.equal(S.unitOf({ unit: { profile: FIXTURE.profile.id } }, PROFILED, NaN).confirmed, false, 'no clock, no confirmation');
  const bad = S.unitOf({ unit: { name: '<b>', phone: governed('emergency_911'), profile: '' } }, PROFILED, now);
  assert.equal(bad.name + bad.phone, '', 'invalid typed values are not used');
  assert.ok(bad.nameError.length > 0 && bad.phoneError.length > 0, 'and say why');
  for (const state of [null, undefined, {}, { unit: null }]) assert.equal(S.unitOf(state, PROFILED, now).loaded, false, JSON.stringify(state));
  const records = eight();
  const printed = textOf(renderApproved(records, finalState(records, { unit: { ...typed, profile: FIXTURE.profile.id } })).html);
  assert.ok(printed.includes(FIXTURE.profile.unitPhone) && printed.includes(FIXTURE.profile.unitName), 'paper: the profile');
  assert.equal(printed.includes('4 West') || printed.includes('555-0100'), false, 'paper: typed values beside a loaded profile never print');
});

test('Clear is offered whenever anything is saved: listings, a unit name, phone or profile, a Final copy, or any page switch', () => {
  assert.equal(S.hasState(S.blank()), false, 'a blank packet');
  assert.deepEqual(S.blank().unit, { name: '', phone: '', profile: '' }, 'a blank packet has an empty profile slot');
  const blank = S.blank();
  for (const [why, change] of [
    ['a listing', { ids: ['a0'] }], ['a Final copy', { mode: 'final' }],
    ['a unit name', { unit: { ...blank.unit, name: '4 East' } }], ['a unit phone', { unit: { ...blank.unit, phone: '2075550100' } }],
    ['a loaded profile', { unit: { ...blank.unit, profile: FIXTURE.profile.id } }],
    ['a page switched on', { inserts: { safety: true } }], ['a page switched OFF', { inserts: { week: false } }],
  ]) assert.equal(S.hasState({ ...S.blank(), ...change }), true, why);
});

test('a category label with a dose or a crisis number prints as "Other resources"', () => {
  const records = eight();
  const data = S.validate(feed(records, { categories: feed(records).categories.map(c => (c.id === 'aftercare' ? { ...c, label: 'Aftercare 10 mg' } : c.id === 'peer_support' ? { ...c, label: 'Peers: dial 988' } : c)) }));
  const r = S.sheet(stateOf(records), data, PROFILED, approvedOptions());
  assert.equal(r.ok, true, r.message);
  const visible = textOf(r.html);
  assert.equal(visible.includes('10 mg') || visible.includes('Peers: dial'), false);
  assert.ok(visible.split('Other resources').length - 1 >= 2, 'both groups survive under a safe label');
});

test('structure: the header and the crisis block are one bordered element inside an unmargined wrapper; categories are not headings; listing names are h3', () => {
  const records = eight();
  const r = renderApproved(records, stateOf(records), PROFILED, { headingBase: 1 });
  assert.match(r.html, /<header class="fd-packet-head"[^>]*><div class="fd-packet-head__box">/);
  assert.match(r.html, /<section class="fd-packet-crisis"[^>]*><div class="fd-packet-crisis__box">/);
  assert.match(r.html, /<p class="fd-packet-cat"[^>]*>Aftercare<\/p>/, 'a category is a label, not a heading level');
  assert.match(r.html, /<h3 class="fd-packet-res__name">Support 0<\/h3>/, 'a listing sits at the level below its section');
  assert.ok((r.html.match(/<h2[\s>]/g) || []).length >= 2, 'sections are h2');
});

test('every write-in row is announced: a labelled row by its label, an unlabelled one as "blank line to write in"', () => {
  const records = eight();
  const r = renderApproved(records, stateOf(records, { inserts: insertSets.allOn }), PROFILED, { callback: ARRANGED_CALL });
  const rows = r.html.match(/<div class="fd-packet-row">[\s\S]*?<\/div>/g) || [];
  assert.ok(rows.length >= 6, 'the all-on set has write-in rows');
  for (const one of rows) assert.match(one, /^<div class="fd-packet-row"><span( class="fd-packet-vh")?>[^<]+<\/span><i aria-hidden="true"><\/i><\/div>$/, one);
  assert.ok(rows.some(one => one.includes('class="fd-packet-vh"')), 'some rows are unlabelled in the data, so some say what they are');
});

test('a standard page that cannot be built is refused with its own code, not printed with a hole', () => {
  const records = eight();
  const bad = clone(PAYLOAD);
  bad.inserts.find(i => i.id === 'warning').groups[3].bullets[0] = 'Do {{nonsense}} now';
  const r = S.sheet(stateOf(records), dataOf(records), bad, {});
  assert.equal(r.ok, false);
  assert.equal(r.code, 'PAGES_UNAVAILABLE');
  assert.equal(r.html || '', '');
});

// The layout check after the pages are assembled. Node has no layout engine, so a minimal document stands in; the real
// one runs in the browser spec. What this pins is the WIRING: the check runs on the assembled pages, counts them, and
// turns an over-tall, over-wide or missing page into a refusal.
// A wallet-card panel is ID-1: 324 x 204 CSS px (3.375in x 2.125in at 96 per inch); the layout check refuses a panel past it.
const panelStub = (width, height) => ({ getBoundingClientRect: () => ({ width, height }) });
function withDocument(pageStubs, body, panelStubs = [panelStub(324, 204), panelStub(324, 204)]) {
  const made = [];
  const doc = {
    body: { appendChild(node) { node.parentNode = this; made.push(node); return node; }, removeChild(node) { node.parentNode = null; return node; } },
    createElement() {
      return { className: '', parentNode: null, setAttribute() {}, innerHTML: '', querySelectorAll(selector) {
        if (selector === '.fd-packet-page') return pageStubs;
        return selector === '[data-fd-packet-card]' ? panelStubs : [];
      } };
    },
  };
  globalThis.document = doc;
  try { return body(made); } finally { delete globalThis.document; }
}
const stub = (height, scroll = 800, client = 800) => ({ getBoundingClientRect: () => ({ height }), scrollWidth: scroll, clientWidth: client });
test('after layout, the assembled pages are checked: too tall, too wide, or a different count each refuse; a fit passes; the host is removed', () => {
  const records = eight();
  const state = stateOf(records);
  const measure = units => ({ heights: units.map(() => 90), capacity: 880 });
  const dry = S.sheet(state, dataOf(records), PROFILED, approvedOptions({ measure, verify: false }));
  assert.equal(dry.ok, true);
  const n = dry.count;
  const run = pages => withDocument(pages, made => ({ result: S.sheet(state, dataOf(records), PROFILED, approvedOptions({ measure })), made }));
  const fit = run(Array.from({ length: n }, () => stub(1056)));
  assert.equal(fit.result.ok, true, 'a page exactly one sheet tall passes');
  assert.ok(fit.made.length >= 1 && fit.made.every(node => node.parentNode === null), 'the hidden host is always removed');
  assert.ok(fit.made[0].innerHTML.includes('data-fd-packet-page'), 'what was checked is the assembled pages');
  const tall = run(Array.from({ length: n }, (_, i) => stub(i === n - 1 ? 1058 : 1056)));
  assert.equal(tall.result.code, 'OVERFLOW', 'one page two pixels over a sheet is refused');
  const wide = run(Array.from({ length: n }, (_, i) => stub(1056, i === 0 ? 900 : 800)));
  assert.equal(wide.result.code, 'OVERFLOW', 'a page wider than its box is refused');
  const missing = run(Array.from({ length: n - 1 }, () => stub(1056)));
  assert.equal(missing.result.code, 'MEASURE_FAILED', 'fewer pages than packed means the check could not run: refuse, never assume');
  assert.ok(missing.made.every(node => node.parentNode === null), 'removed on the failure path too');
  assert.equal(S.sheet(state, dataOf(records), PROFILED, approvedOptions({ measure })).ok, true, 'without a document there is nothing to check and the sheet stands');
});

test('a measurer or a layout check that THROWS refuses the packet instead of escaping into the caller', () => {
  const records = eight();
  const state = stateOf(records);
  const thrown = S.sheet(state, dataOf(records), PROFILED, approvedOptions({ measure: () => { throw new Error('layout engine gone'); } }));
  assert.equal(thrown.ok, false);
  assert.equal(thrown.code, 'MEASURE_FAILED');
  const measure = units => ({ heights: units.map(() => 90), capacity: 880 });
  const broken = { body: { appendChild() {}, removeChild() {} }, createElement: () => ({ setAttribute() {}, set innerHTML(value) {}, querySelectorAll() { throw new Error('no layout'); } }) };
  globalThis.document = broken;
  try {
    assert.equal(S.sheet(state, dataOf(records), PROFILED, approvedOptions({ measure })).code, 'MEASURE_FAILED', 'a check that cannot run is a refusal, never a pass');
  } finally { delete globalThis.document; }
});

// ---- the wallet card: its own one-page print, never part of the packet (Revision 2) ------------------------------------
const cardPanel = (html, which) => {
  const start = html.indexOf('data-fd-packet-card="' + which + '"');
  return start === -1 ? '' : html.slice(start, html.indexOf('</section>', start));
};
test('the wallet card is one page with two panels; the crisis panel carries every line, and every required line\'s official name and contact', () => {
  const card = S.cardSheet(PAYLOAD, {});
  assert.equal(card.ok, true, card.message);
  assert.equal(card.count, 1);
  assert.equal(card.mode, 'card');
  assert.equal(card.html.split('data-fd-packet-page').length - 1, 1, 'exactly one page');
  assert.equal(card.html.split('data-fd-packet-card="crisis"').length - 1, 1, 'one crisis panel');
  assert.equal(card.html.split('data-fd-packet-card="mine"').length - 1, 1, 'one write-in panel');
  const crisis = cardPanel(card.html, 'crisis');
  for (const id of PAYLOAD.required) {
    assert.ok(crisis.includes(S.esc(governed(id))), id + ': contact inside the crisis panel');
    assert.ok(crisis.includes(S.esc(governedName(id))), id + ': official name inside the crisis panel');
  }
  for (const line of PAYLOAD.crisis) {
    assert.match(crisis, new RegExp('data-fd-packet-crisis="' + line.ref + '"'), 'every crisis line: ' + line.ref);
    assert.equal(textOf(card.html).includes(line.when), false, 'no "when to use it" text on the card');
  }
  assert.equal(card.html.includes('fd-packet-crisis__when'), false, 'no availability on the card');
  assert.ok(textOf(crisis).includes(PAYLOAD.crisisCopy.cardHeading));
  const mine = textOf(cardPanel(card.html, 'mine'));
  assert.ok(mine.includes(PAYLOAD.card.mineTitle));
  for (const label of PAYLOAD.card.rows) assert.ok(mine.includes(label), label);
  for (const id of PAYLOAD.required) assert.equal(mine.includes(governed(id)), false, 'the write-in panel carries no crisis line');
  const visible = textOf(card.html);
  assert.ok(visible.includes(PAYLOAD.card.title) && visible.includes(PAYLOAD.card.body));
  assert.equal(/\{\{|\}\}/.test(card.html) || /<a[\s>]/.test(card.html) || card.html.includes('id="'), false, 'no token, anchor or id');
  assert.equal((card.html.match(/<h1[\s>]/g) || []).length, 1, 'one h1');
});

test('the wallet card names no unit: no unit name, phone, org or blank, even with a profile in the payload', () => {
  const card = S.cardSheet(PROFILED, {});
  assert.equal(card.ok, true, card.message);
  for (const value of [FIXTURE.profile.unitName, FIXTURE.profile.unitPhone, FIXTURE.profile.org, FIXTURE.profile.label]) {
    assert.equal(card.html.includes(S.esc(value)), false, value);
  }
  for (const cls of ['fd-packet-blank', 'fd-packet-org', 'fd-packet-draft']) assert.equal(card.html.includes(cls), false, cls);
  assert.equal(card.html, S.cardSheet(EMPTY_PROFILES, {}).html, 'the same bytes with or without profiles');
});

test('the wallet card refuses rather than print without its lines: an unusable payload, a lost required line, a nameless contact, no card copy, more than five lines', () => {
  const refuse = (payload, code, why) => {
    const r = S.cardSheet(payload, {});
    assert.equal(r.ok, false, why);
    assert.equal(r.code, code, why);
    assert.equal(r.html, '', why + ': no html');
  };
  for (const bad of [null, undefined, {}, 7]) refuse(bad, 'CRISIS_UNAVAILABLE', 'payload ' + String(bad));
  const lost = clone(PAYLOAD); lost.crisis = lost.crisis.filter(l => l.ref !== PAYLOAD.required[0]);
  refuse(lost, 'CRISIS_UNAVAILABLE', 'a required line missing');
  const nameless = clone(PAYLOAD); nameless.contacts[PAYLOAD.required[0]].name = '';
  refuse(nameless, 'CRISIS_UNAVAILABLE', 'a required contact with no name');
  const unnamed = clone(PAYLOAD); delete unnamed.contacts[PAYLOAD.required[1]].name;
  refuse(unnamed, 'CRISIS_UNAVAILABLE', 'a required contact whose name is missing');
  const blankContact = clone(PAYLOAD); blankContact.contacts[PAYLOAD.required[1]].contact = ' ';
  refuse(blankContact, 'CRISIS_UNAVAILABLE', 'a blank contact');
  const noCard = clone(PAYLOAD); delete noCard.card;
  refuse(noCard, 'CARD_UNAVAILABLE', 'no card copy');
  for (const [field, value] of [['title', 7], ['body', null], ['mineTitle', undefined], ['rows', []], ['rows', 'x']]) {
    const odd = clone(PAYLOAD); odd.card[field] = value;
    refuse(odd, 'CARD_UNAVAILABLE', 'card.' + field + ' = ' + JSON.stringify(value));
  }
  const listCard = clone(PAYLOAD); listCard.card = [];
  refuse(listCard, 'CARD_UNAVAILABLE', 'a card that is a list');
  const noHeading = clone(PAYLOAD); delete noHeading.crisisCopy.cardHeading;
  refuse(noHeading, 'CARD_UNAVAILABLE', 'no card heading');
  assert.ok(PAYLOAD.crisis.length <= 5, 'the shipped card is within its budget');
  const six = clone(PAYLOAD); six.crisis.push({ ref: PAYLOAD.crisis[0].ref, when: 'again' });
  assert.equal(S.payloadOk(six), true, 'six resolvable lines are a usable payload (the packet prints them)');
  refuse(six, 'CARD_UNAVAILABLE', 'six lines exceed the card\'s five-line budget');
  const optional = PAYLOAD.crisis.map(l => l.ref).filter(ref => !PAYLOAD.required.includes(ref));
  const four = clone(PAYLOAD); four.crisis = four.crisis.filter(l => l.ref !== optional[0]);
  assert.equal(S.cardSheet(four, {}).ok, true, 'fewer lines are fine');
});

test('the card check reads the crisis PANEL: a required name or contact elsewhere on the card does not count', () => {
  const html = S.cardSheet(PAYLOAD, {}).html;
  assert.equal(S.checkCard(html, PAYLOAD), true);
  const id = PAYLOAD.required[0];
  const panel = cardPanel(html, 'crisis');
  const moveToMine = what => html.replace(panel, panel.split(what).join('')).replace('data-fd-packet-card="mine">', 'data-fd-packet-card="mine">' + what);
  assert.equal(S.checkCard(moveToMine(S.esc(governedName(id))), PAYLOAD), false, 'the name only in the write-in panel');
  assert.equal(S.checkCard(moveToMine(S.esc(governed(id))), PAYLOAD), false, 'the contact only in the write-in panel');
  assert.equal(S.checkCard(html.replace('data-fd-packet-card="crisis"', 'data-fd-packet-card="other"'), PAYLOAD), false, 'no crisis panel');
  assert.equal(S.checkCard('', PAYLOAD), false);
  assert.match(SHEET_SRC, /if\(!fdCarePacketCheckCard\(html,payload\)\)return fdCarePacketFail\('CRISIS_UNAVAILABLE'/, 'the card build really calls the check');
});

test('the card\'s layout check: one sheet passes; taller, wider or a missing page refuses; verify:false skips it; with no document it passes unchecked', () => {
  const fit = withDocument([stub(1056)], made => ({ r: S.cardSheet(PAYLOAD, {}), made }));
  assert.equal(fit.r.ok, true, fit.r.message);
  assert.ok(fit.made.length === 2 && fit.made.every(node => node.innerHTML.includes('data-fd-packet-card="crisis"')), 'what was checked is the card page, once as a page and once as two panels');
  assert.ok(fit.made.every(node => node.parentNode === null), 'the hidden host is removed');
  assert.equal(withDocument([stub(1058)], () => S.cardSheet(PAYLOAD, {})).code, 'OVERFLOW', 'two pixels over a sheet');
  assert.equal(withDocument([stub(1056, 900)], () => S.cardSheet(PAYLOAD, {})).code, 'OVERFLOW', 'wider than its box');
  assert.equal(withDocument([], () => S.cardSheet(PAYLOAD, {})).code, 'MEASURE_FAILED', 'no page found: could not check, so refuse');
  assert.equal(withDocument([stub(1056), stub(1056)], () => S.cardSheet(PAYLOAD, {})).code, 'MEASURE_FAILED', 'the card is ONE page');
  // Added with the review fixes: the panels must stay credit-card sized WHEN THE CARD PRINTS (a page that merely fits 11in is not
  // enough: a panel grown past 2.125in is no longer wallet-sized). Fails if fdCarePacketVerifyCard is not run, or its limits drift.
  assert.equal(withDocument([stub(1056)], () => S.cardSheet(PAYLOAD, {}), [panelStub(324, 205), panelStub(324, 204)]).ok, true, 'one pixel of rounding is tolerated');
  assert.equal(withDocument([stub(1056)], () => S.cardSheet(PAYLOAD, {}), [panelStub(324, 206), panelStub(324, 204)]).code, 'OVERFLOW', 'a crisis panel grown taller than a credit card');
  assert.equal(withDocument([stub(1056)], () => S.cardSheet(PAYLOAD, {}), [panelStub(324, 204), panelStub(326, 204)]).code, 'OVERFLOW', 'a write-in panel wider than a credit card');
  assert.equal(withDocument([stub(1056)], () => S.cardSheet(PAYLOAD, {}), [panelStub(324, 204)]).code, 'MEASURE_FAILED', 'a missing panel cannot be checked, so it refuses');
  assert.match(withDocument([stub(1056)], () => S.cardSheet(PAYLOAD, {}), [panelStub(324, 300), panelStub(324, 204)]).message, /credit-card sized/, 'and says what is wrong');
  const skipped = withDocument([stub(5000)], made => ({ r: S.cardSheet(PAYLOAD, { verify: false }), made }));
  assert.equal(skipped.r.ok, true, 'verify:false skips the layout check');
  assert.equal(skipped.made.length, 0, 'and touches no document');
  assert.equal(S.cardSheet(PAYLOAD, {}).ok, true, 'without a document there is nothing to check and the card stands');
  const broken = { body: { appendChild() {}, removeChild() {} }, createElement: () => ({ setAttribute() {}, set innerHTML(value) {}, querySelectorAll() { throw new Error('no layout'); } }) };
  globalThis.document = broken;
  try {
    assert.equal(S.cardSheet(PAYLOAD, {}).code, 'MEASURE_FAILED', 'a check that throws is a refusal');
  } finally { delete globalThis.document; }
});

test('the wallet card is never part of a packet: no page set, copy or stored switch puts it in the sheet or the copied text', () => {
  const records = eight();
  for (const [setName, inserts] of Object.entries({ ...insertSets, cardSwitch: { card: true } })) {
    for (const mode of MODES) {
      const label = setName + '/' + mode;
      const state = mode === 'final' ? finalState(records, { inserts }) : stateOf(records, { inserts });
      const options = inserts.callback ? { callback: ARRANGED_CALL } : {};
      const r = renderApproved(records, state, PROFILED, options);
      assert.equal(r.ok, true, label + ': ' + r.message);
      assert.deepEqual(r.blockers, [], label + ': the whole selected packet is printable');
      assert.equal(r.html.includes('data-fd-packet-card') || r.html.includes('fd-packet-cardsheet'), false, label + ': no card in the packet');
      assert.equal(textOf(r.html).includes(PAYLOAD.card.title), false, label);
      if (mode === 'final') assert.equal(S.text(state, dataOf(records), PROFILED, approvedOptions(options)).text.includes(PAYLOAD.card.title), false, label + ' copy');
    }
  }
});

// ---- the scan reads the engine's Unicode tables, so it cannot lag the validator ------------------------------------------
// Every code point that could sit between "5" and "mg" (controls, format characters, dashes, spaces) and every decimal digit
// that could stand for the 5, sent through the validator's own patterns in Python. Anything Python flags, the sheet must too.
const codePointsOf = pattern => {
  const out = [];
  for (let c = 0; c < 0x110000; c += 1) {
    if (c >= 0xd800 && c <= 0xdfff) continue;
    if (pattern.test(String.fromCodePoint(c))) out.push(c);
  }
  return out;
};
test('PARITY, exhaustively: whatever the validator flags between a number and a unit, or as a digit before one, the sheet flags too', () => {
  const between = codePointsOf(/^[\p{Cc}\p{Cf}\p{Pd}\p{Zs}\p{Zl}\p{Zp}]$/u);
  const digits = codePointsOf(/^\p{Nd}$/u);
  const probes = [...between.map(c => '5' + cp(c) + 'mg'), ...digits.map(c => cp(c) + ' mg')];
  assert.ok(between.length > 250 && digits.length > 500, 'the sweep is not vacuous: ' + between.length + ' separators, ' + digits.length + ' digits');
  const python = py(
    `import validate_care_inserts as v\nprobes = json.loads(sys.stdin.read())\n` +
    `pats = [v.DOSE_RE, v.DOSE_WORD_RE, v.DOSE_SPELLED_RE, v.DOSE_COUNT_RE, v.METADATA_RE]\n` +
    `print(json.dumps([any(p.search(v.normalise(s)) for p in pats) for s in probes]))`,
    [], JSON.stringify(probes),
  );
  assert.equal(python.status, 0, python.stderr);
  const theirs = JSON.parse(python.stdout);
  assert.ok(theirs.filter(Boolean).length > 700, 'Python flags most of them (else the oracle is not running the patterns)');
  const missed = probes.filter((probe, i) => theirs[i] && !S.forbidden(probe)).map(probe => [...probe].map(ch => 'U+' + ch.codePointAt(0).toString(16)).join(' '));
  assert.deepEqual(missed.slice(0, 10), [], missed.length + ' probes the validator flags and the sheet does not');
});

test('every decimal digit of every script reads as the digit it is (checked against Python\'s own table)', () => {
  const digits = codePointsOf(/^\p{Nd}$/u);
  const python = py(
    `import unicodedata\nchars = json.loads(sys.stdin.read())\n` +
    `print(json.dumps([unicodedata.decimal(c, -1) for c in chars]))`,
    [], JSON.stringify(digits.map(c => String.fromCodePoint(c))),
  );
  assert.equal(python.status, 0, python.stderr);
  const theirs = JSON.parse(python.stdout);
  let compared = 0;
  digits.forEach((c, i) => {
    if (theirs[i] < 0) return;
    compared += 1;
    assert.equal(S.norm(String.fromCodePoint(c)), String(theirs[i]), 'U+' + c.toString(16));
  });
  assert.ok(compared > 500, 'compared ' + compared + ' digits');
});

test('an engine without Unicode property escapes cannot run the scan, so the packet refuses to build (and the helpers still do not throw)', () => {
  const noProperties = function (source, flags) {
    if (/\\p\{/.test(source)) throw new SyntaxError('Invalid regular expression: invalid property name');
    return new RegExp(source, flags);
  };
  const limited = new Function('RegExp', SOURCE)(noProperties);
  const records = eight();
  const state = stateOf(records);
  const data = limited.validate(feed(records));
  const r = limited.sheet(state, data, PAYLOAD, {});
  assert.equal(r.ok, false);
  assert.equal(r.code, 'CHECK_UNAVAILABLE');
  assert.equal(r.html || '', '', 'no html at all');
  assert.equal(limited.text(finalState(records), data, PAYLOAD, {}).code, 'CHECK_UNAVAILABLE');
  const card = limited.cardSheet(PAYLOAD, { verify: false });
  assert.equal(card.code, 'CHECK_UNAVAILABLE', 'the wallet card refuses too');
  assert.equal(card.html, '', 'with no html');
  assert.equal(typeof limited.norm('10 mg'), 'string', 'the helpers degrade rather than throw (the unit field still validates)');
  assert.equal(limited.strip('  a\tb  '), 'a b');
});

// Added with the owner's directions: a date that does not exist rolls forward inside Date.UTC (02-30 becomes 03-02) and would
// have kept a confirmation alive past a date nobody wrote. Fails if the calendar round-trip in fdCarePacketExpired is removed.
test('a confirmation date that is not a real calendar day is lapsed, never rolled forward into a later day', () => {
  const now = Date.UTC(2026, 2, 1);
  for (const impossible of ['2026-02-30', '2026-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-06-00']) {
    assert.equal(S.expired(impossible, now), true, impossible + ' does not exist, so it is lapsed');
  }
  assert.equal(S.expired('2028-02-29', now), false, 'a real leap day is a day');
});

// ---- added with the review fixes ----------------------------------------------------------------------------------------
// Eligibility judges what will really print. A contact the sheet leaves off the paper (a text keyword or an address that holds a
// note or a dose) is not a contact; a listing left with none must be refused up front, not printed with no way to reach it.
// Fails if fdCarePacketEligibility goes back to "has a website string / has a link".
test('eligibility counts only contacts that will really print: a listing whose only contact is filtered out is NO_CONTACT', () => {
  const siteOnly = (website, more = {}) => row(0, { phone: '', contactHref: '', website, ...more });
  assert.equal(S.eligibility(siteOnly('https://example.org/care'), PAYLOAD), '', 'an ordinary address keeps it eligible');
  assert.equal(S.eligibility(siteOnly('https://hospital2.example.org/'), PAYLOAD), 'NO_CONTACT', 'an address the sheet would drop (it trips the tier-note scan) leaves nothing to call or visit');
  assert.equal(S.eligibility(siteOnly('https://hospital2.example.org/', { contactHref: 'tel:2077000123' }), PAYLOAD), '', 'a phone keeps it eligible when the address is dropped');
  assert.equal(S.eligibility(siteOnly('', { phone: '', contactHref: 'sms:741999?body=VERIFY' }), PAYLOAD), 'NO_CONTACT', 'a text link whose keyword holds a verification word prints nothing');
  assert.equal(S.eligibility(siteOnly('https://example.org/care', { contactHref: 'sms:741999?body=VERIFY' }), PAYLOAD), '', 'but the address keeps it eligible');
  assert.equal(S.eligibility(siteOnly('not a web address'), PAYLOAD), 'NO_CONTACT', 'an address that prints no domain is no contact');
  // And the sheet agrees with the chooser: nothing eligible comes out with no contact, nothing refused goes in.
  for (const [more, expected] of [[{ website: 'https://hospital2.example.org/', contactHref: '', phone: '' }, 'NO_CONTACT'], [{}, '']]) {
    const records = [row(0, more)];
    const r = renderApproved(records, stateOf(records));
    assert.equal(r.blockers.some(b => b.code === 'INELIGIBLE' && b.reason === 'NO_CONTACT'), expected === 'NO_CONTACT', JSON.stringify(more));
  }
});

// Fails if the address is no longer scanned for crisis numbers (a live telehealth listing printed an address that spells one).
test('a web address that spells a registered crisis number is refused like a phone that does', () => {
  const digits = PAYLOAD.crisisNumbers.find(d => d.length === 3);
  assert.ok(digits, 'precondition: a three-digit crisis number is registered');
  assert.equal(S.eligibility(row(0, { website: 'https://nh' + digits + '.example.org/' }), PAYLOAD), 'CRISIS_NUMBER');
  assert.equal(S.eligibility(row(0, { website: 'https://example.org/care' }), PAYLOAD), '');
});

test('the crisis-service reason tells the trainee what to do (it is not "printed in the crisis box"), and every reason names its own cause', () => {
  const text = S.reasonText('CRISIS_CATEGORY');
  assert.match(text, /tell the patient about it yourself/);
  assert.doesNotMatch(text, /print only in the crisis box/, 'a local crisis service is NOT in the crisis box, so the old wording sent the trainee nowhere');
  assert.match(S.reasonText('CRISIS_NUMBER'), /crisis box/, 'a listing that carries one of the five governed numbers IS covered by the box');
});

// A unit name may not say when the unit answers: only the crisis lines are round the clock. The validator refuses these phrases in a
// profile (AVAILABILITY_RE); the browser's rule for a typed name must be the same rule. Fails if either side drifts.
test('PARITY: a typed unit name refuses exactly the availability phrases the validator refuses in a profile', () => {
  const probes = ['Call us any time', '4 East anytime', 'Any-time unit', '4 East 24/7', 'Unit 24 / 7', '24-hour unit', '24 hours a day', 'Open day or night',
    'Round-the-clock care', 'around the clock', 'Open all hours', 'Unit 24/7!', '4 East', 'West 24', 'Unit 247', '24 East', 'Sometime Unit', 'Hourly Unit', 'Nightingale Unit', '12/7 Unit', '124/7'];
  const python = py(
    `import validate_care_inserts as v\nprobes = json.loads(sys.stdin.read())\nprint(json.dumps([bool(v.AVAILABILITY_RE.search(v.normalise(s))) for s in probes]))`,
    [], JSON.stringify(probes),
  );
  assert.equal(python.status, 0, python.stderr);
  const theirs = JSON.parse(python.stdout);
  probes.forEach((probe, i) => {
    const ours = S.unitName(probe, PAYLOAD);
    const refusedForAvailability = ours.ok === false && /when it answers/.test(ours.error);
    assert.equal(refusedForAvailability, theirs[i], JSON.stringify(probe) + ' (validator ' + theirs[i] + ')');
  });
  assert.ok(theirs.some(Boolean) && theirs.some(v => !v), 'precondition: the probe list covers both sides');
});

// The validator refuses a unit phone that is a helpline-table number; a typed phone and a profile's phone get the same rule in the
// browser. Fails if the browser stops reading the payload's tables, or the two lists of helpline numbers diverge.
test('PARITY: a unit phone may not be any helpline-table number, and the browser reads the same numbers the validator does', () => {
  const python = py(
    `import validate_care_inserts as v, care_inserts_payload as p\nprint(json.dumps(sorted(v.helpline_digits(p.build_payload()))))`,
  );
  assert.equal(python.status, 0, python.stderr);
  const theirs = JSON.parse(python.stdout).filter(d => d.length === 10);
  assert.ok(theirs.length >= 10, 'precondition: the shipped tables carry helpline numbers');
  const ours = new Set(S.helplineNumbers(PAYLOAD).filter(d => d.length === 10));
  assert.deepEqual([...ours].sort(), [...theirs].sort(), 'the same ten-digit numbers');
  for (const d of theirs) {
    const typed = '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
    const r = S.unitPhone(typed, PAYLOAD);
    assert.equal(r.ok, false, typed + ' is a helpline number');
    assert.match(r.error, /helpline number/, typed);
  }
  assert.equal(S.unitPhone('(207) 555-0100', PAYLOAD).ok, true, 'an ordinary unit number is still fine');
  // A profile that carries one is not offered: the profile re-check uses the same rule.
  const bad = { ...clone(FIXTURE.profile), id: 'helpline-phone', unitPhone: '(' + theirs[0].slice(0, 3) + ') ' + theirs[0].slice(3, 6) + '-' + theirs[0].slice(6) };
  assert.equal(S.profileUsable(bad, PAYLOAD), null);
  const named = { ...clone(FIXTURE.profile), id: 'says-24-7', unitName: 'Fixture Unit open 24/7' };
  assert.equal(S.profileUsable(named, PAYLOAD), null, 'a profile whose name says when it answers is not offered either');
});

// The copy is checked against its OUTPUT as well as built from a loop: a source-level pin, because no payload that passes
// fdCarePacketPayloadOk can make the loop and the output disagree (that is why it is defence in depth).
test('the copied text is checked for every required line\'s official name and number before it is returned', () => {
  assert.match(SHEET_SRC, /missing from the copied text/);
});

// ---- round 2 of the review fixes (correctness lens) ----------------------------------------------------------------------------
// Every number below is BUILT from the payload's registered numbers at run time; none is typed. The browser reads a long number the
// way the validator's crisis_patterns does: any run of separators between its digits and an optional leading 1.
const spaced = (digits, sep) => digits.split('').join(sep);
const longCrisis = () => PAYLOAD.crisisNumbers.filter(d => d.length > 4);
test('PARITY: a long registered crisis number is found however its digits are separated, in prose and in a listing, as the validator finds it', () => {
  const probes = longCrisis().flatMap(d => [spaced(d, ' '), spaced(d, '-'), spaced(d, ' - '), d.slice(0, 3) + ' ' + d.slice(3), d.slice(0, 3) + '-' + d.slice(3), '1' + d, '1-' + d, d + '5', '5' + d]);
  const python = py(
    `import validate_care_inserts as v\nprobes = json.loads(sys.stdin.read())\n` +
    `numbers = {'x': set(json.loads(sys.argv[1]))}\npats = [p for _, p in v.crisis_patterns(numbers)]\n` +
    `print(json.dumps([any(p.search(v.normalise(s)) for p in pats) for s in probes]))`,
    [JSON.stringify(longCrisis())], JSON.stringify(probes),
  );
  assert.equal(python.status, 0, python.stderr);
  const theirs = JSON.parse(python.stdout);
  probes.forEach((probe, i) => {
    // The validator is the floor: whatever it finds, the browser finds. (The browser may be stricter, never looser.)
    if (theirs[i]) assert.equal(S.crisisHit('call ' + probe + ' now', PAYLOAD), true, 'validator finds ' + JSON.stringify(probe));
  });
  assert.ok(theirs.some(Boolean), 'precondition: the validator finds some of them');
  for (const d of longCrisis()) {
    for (const sep of [' ', '-', ' - ', '.', '/']) assert.equal(S.crisisHit('Text ' + spaced(d, sep) + ' any time', PAYLOAD), true, d + ' with ' + JSON.stringify(sep));
    assert.equal(S.crisisHit('ref ' + d + '5', PAYLOAD), false, 'a longer number that merely starts with it is not it');
  }
});

test('a crisis number split by spaces or spelled with wide separators makes a listing ineligible, in its name, area, description or text keyword', () => {
  const d = longCrisis()[0];
  const wide = spaced(d, ' - ');
  const withDescription = [row(0, { description: 'Peer help, text ' + d.slice(0, 3) + ' ' + d.slice(3) + ' any time.' })];
  assert.ok(renderApproved(withDescription, stateOf(withDescription)).withheld.some(w => w.field === 'description' && w.reason === 'crisis'), 'the description is left off the paper');
  const withArea = [row(0, { area: 'Statewide, text ' + d.slice(0, 3) + '-' + d.slice(3) })];
  assert.ok(renderApproved(withArea, stateOf(withArea)).withheld.some(w => w.field === 'area' && w.reason === 'crisis'), 'the area is left off the paper');
  assert.equal(S.eligibility(row(0, { name: 'Maine line ' + wide }), PAYLOAD), 'CRISIS_NUMBER');
  const keyword = row(0, { phone: '', website: 'https://example.org/care', contactHref: 'sms:12345?body=TEXT%20' + d });
  assert.equal(S.eligibility(keyword, PAYLOAD), 'CRISIS_NUMBER', 'a text keyword that carries a crisis number');
  const short = PAYLOAD.crisisNumbers.find(n => n.length === 3);
  assert.equal(S.eligibility(row(0, { phone: '', contactHref: 'tel:+1' + short }), PAYLOAD), 'CRISIS_NUMBER', 'a leading 1 before a short code does not hide it');
  assert.equal(S.eligibility(row(0), PAYLOAD), '', 'an ordinary listing is untouched');
});

// The browser must read the payload's WHOLE list of registered numbers: some (the text line a veterans service also answers) are in
// the governed record only as an alternate and are in no contact string. Fails if the browser stops reading `crisisNumbers`.
test('a registered number that appears in no contact string, only in the shipped list of numbers, still refuses a listing', () => {
  const inContacts = new Set(S.numbers(Object.values(PAYLOAD.contacts).map(c => c.contact).join(' ; ')));
  const only = PAYLOAD.crisisNumbers.filter(d => d.length >= 5 && !inContacts.has(d));
  assert.ok(only.length >= 1, 'precondition: the shipped list carries a number no contact string has');
  for (const d of only) assert.equal(S.eligibility(row(0, { phone: 'Text ' + d, contactHref: 'tel:2077000123' }), PAYLOAD), 'CRISIS_NUMBER', d);
  const withoutList = clone(PAYLOAD); delete withoutList.crisisNumbers;
  assert.equal(S.eligibility(row(0, { phone: 'Text ' + only[0], contactHref: 'tel:2077000123' }), withoutList), '', 'without the list the browser cannot know it: that is why the build ships it');
});

// A name that trips the note scan is refused up front (the chooser and the tray say why), not discovered after four confirmations.
test('a listing whose NAME holds a verification note or a dose is LISTING_TEXT in the chooser; its phone text, which no longer prints, does not block it', () => {
  assert.equal(S.eligibility(row(0, { name: 'Verified Peer Support of York' }), PAYLOAD), 'LISTING_TEXT');
  assert.equal(S.eligibility(row(0, { name: 'Recovery Hall L2 Group' }), PAYLOAD), 'LISTING_TEXT');
  assert.match(S.reasonText('LISTING_TEXT'), /cannot print on a patient page/);
  const withNote = [row(0, { phone: '207-700-0123 (verification due)' })];
  const r = renderApproved(withNote, stateOf(withNote));
  assert.deepEqual(codesOf(r), [], 'the free-text phone is not printed, so a note in it cannot reach the paper');
  assert.equal(textOf(r.html).includes('verification due'), false);
});

// The payload's shape is checked, so a malformed insert is an unusable payload (fail closed), not an exception in a click handler.
test('a payload whose inserts hold a null or an id-less entry is unusable', () => {
  for (const bad of [null, 7, 'x', {}, { id: 3 }]) {
    const p = clone(PAYLOAD); p.inserts = [bad, ...p.inserts];
    assert.equal(S.payloadOk(p), false, JSON.stringify(bad));
    assert.equal(S.sheet(stateOf([row(0)]), dataOf([row(0)]), p, {}).ok, false);
  }
});

// The Arabic-Indic digits are digits to a reader. The validator's scan reads them as it reads ASCII ones (as the browser does).
test('PARITY: the validator\'s prose scan reads non-ASCII decimal digits, so a crisis number written in them is found there too', () => {
  const d = PAYLOAD.crisisNumbers.find(n => n.length === 3);
  const arabic = d.split('').map(ch => String.fromCodePoint(0x660 + Number(ch))).join('');
  const python = py(
    `import validate_care_inserts as v\nprint(json.dumps(v.normalise(sys.argv[1])))`, [arabic],
  );
  assert.equal(python.status, 0, python.stderr);
  assert.equal(JSON.parse(python.stdout), d, 'normalised to the ASCII digits');
  assert.equal(S.crisisHit('call ' + arabic, PAYLOAD), true, 'and the browser agrees');
});
