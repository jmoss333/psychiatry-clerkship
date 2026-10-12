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
  return spawnSync('python3', ['-B', '-c', code, ...args], { cwd: SITE_BUILD, encoding: 'utf8', input });
}
const built = py('import care_inserts_payload as p\nprint(json.dumps(p.build_payload()))');
assert.equal(built.status, 0, built.stderr);
const PAYLOAD = JSON.parse(built.stdout);
const clone = value => JSON.parse(JSON.stringify(value));

const EXPORTS = `;return typeof fdCarePacketSheet === 'function' ? {
  norm: fdCarePacketNorm, forbidden: fdCarePacketForbidden, unitName: fdCarePacketUnitName, unitPhone: fdCarePacketUnitPhone,
  numbers: fdCarePacketNumbers, crisisHit: fdCarePacketCrisisHit, fill: fdCarePacketFill, description: fdCarePacketDescription,
  paginate: fdCarePacketPaginate, estimate: fdCarePacketEstimate, sheet: fdCarePacketSheet, text: fdCarePacketText,
  validate: fdCareDirectoryValidate, blank: fdCarePacketBlank, insertOn: fdCarePacketInsertOn,
  checkCrisis: fdCarePacketCheckCrisis, payloadOk: fdCarePacketPayloadOk,
  ORG: FD_CARE_PACKET_ORG, BAND: FD_CARE_PACKET_BAND
} : null;`;
const src = name => readFileSync(path.join(SITE_BUILD, name), 'utf8');
// The shell's order: fd_data (fdEsc), the QR generator, fd_care_pack (fdCarePackQrSvg), the packet, the sheet, the search (validate).
const S = new Function(
  src('frontdoor/fd_data.js') + src('vendor/qrcode-generator-1.4.4.js') + src('frontdoor/fd_care_pack.js') +
  PACKET_SRC + SHEET_SRC + src('frontdoor/fd_care_search.js') + EXPORTS,
)();

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
const stateOf = (records, more = {}) => ({ ...S.blank(), ids: idsOf(records), unit: { name: '4 East', phone: '(207) 555-0100' }, ...more });
const finalState = (records, more = {}) => stateOf(records, { mode: 'final', ...more });
const MODES = ['review', 'final'];
const render = (records, state, payload = PAYLOAD, opts = {}) => S.sheet(state, dataOf(records), payload, opts);
// Plain-text view of the html, for oracle scans.
const textOf = html => html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const governed = id => GOVERNED.resources.find(r => r.id === id).contact;

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
  for (const resource of GOVERNED.resources) {
    for (const token of String(resource.contact).match(/\d[\d\-\s().]*\d/g) || []) {
      const digits = digitsOf(token);
      const pattern = new RegExp('(?<!\\d)(?:1[\\s.\\-()]*)?' + digits.split('').join('[\\s.\\-()]*') + '(?!\\d)');
      for (const [label, text] of [['sheet module', SHEET_SRC], ['packet module', PACKET_SRC], ['frontdoor.css', css]]) {
        assert.doesNotMatch(text, pattern, label + ' must not type ' + resource.id + "'s number");
      }
    }
  }
  assert.doesNotMatch(SHEET_SRC, /lifeline_|maine_crisis|emergency_911|crisis_text_line|veterans_crisis/, 'the sheet never names a crisis id: the payload says which are required');
});

// ---- fill --------------------------------------------------------------------------------------------------
test('fill replaces the three tokens only, escapes values, and prints a handwriting blank for a missing unit value', () => {
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
  for (const bad of [null, undefined, 7, 'x', [], {}]) assert.equal(S.payloadOk(bad), false, JSON.stringify(bad));
});

test('the rendered-output check refuses a layout that lost a required contact, on the page or on the wallet card', () => {
  const contact = id => PAYLOAD.contacts[id].contact;
  const lines = PAYLOAD.required.map(id => '<li>' + contact(id) + '</li>').join('');
  const good = [{ crisis: true, card: false, html: lines }];
  assert.equal(S.checkCrisis(good, PAYLOAD), true);
  assert.equal(S.checkCrisis([{ crisis: true, html: lines.replace(contact(PAYLOAD.required[0]), '') }], PAYLOAD), false, 'a contact missing from the block');
  assert.equal(S.checkCrisis([], PAYLOAD), false, 'no crisis block at all');
  assert.equal(S.checkCrisis([{ crisis: false, html: lines }], PAYLOAD), false, 'contacts that are not in the crisis unit do not count');
  assert.equal(S.checkCrisis([...good, { crisis: false, card: true, html: '<div>' + contact(PAYLOAD.required[0]) + '</div>' }], PAYLOAD), false, 'a wallet card without every required line');
  assert.equal(S.checkCrisis([...good, { crisis: false, card: true, html: lines }], PAYLOAD), true);
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
  'Verification due', 'verifiedDate: 2026-01-01', 'reviewAfter', 'L3', 'BHU L2 unit', '10​mg', '1‍0 mg', 'ｍｇ 10 mg', '10 mg',
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

test('norm folds width, drops format and bidi controls, and unifies dashes (so hidden characters cannot defeat a scan)', () => {
  assert.equal(S.norm('1​0‮ mg'), '10 mg');
  assert.equal(S.norm('１０ mg'), '10 mg');
  assert.equal(S.norm('2‑–− 3'), '2--- 3');
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
    const r = render(records, stateOf(records, { mode }));
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
  const review = render(records, stateOf(records, { mode: 'review' }));
  const final = render(records, finalState(records));
  const bandText = S.BAND;
  assert.equal(review.html.split(bandText).length - 1, review.count, 'the band text is on every page');
  assert.equal(review.html.split('class="fd-packet-box"').length - 1, records.length, 'a tick box per listing');
  assert.match(textOf(review.html), /Tick the ones you want to try/);
  assert.equal(final.html.includes(bandText), false);
  assert.match(final.html, /class="fd-packet-band is-empty"/, 'the band slot is reserved in final so layout does not shift');
  assert.equal(final.html.includes('class="fd-packet-box"'), false);
  assert.doesNotMatch(textOf(final.html), /Tick the ones/);
});

test('the crisis block is built from the payload: every crisis line with its governed contact, on page 1, plus availability', () => {
  const records = eight();
  for (const mode of MODES) {
    const r = render(records, stateOf(records, { mode }));
    const page1 = r.html.split('data-fd-packet-page')[1];
    for (const line of PAYLOAD.crisis) {
      const marker = new RegExp('data-fd-packet-crisis="' + line.ref + '"[\\s\\S]*?</li>');
      const found = page1.match(marker);
      assert.ok(found, mode + ': a line for ' + line.ref);
      assert.ok(found[0].includes(governed(line.ref)), mode + ': ' + line.ref + ' carries ITS OWN governed contact');
      assert.ok(textOf(found[0]).includes(line.label), 'and its label');
    }
    assert.match(page1, /24\/7/, 'availability from the governed record is shown');
    assert.ok(textOf(page1).includes(PAYLOAD.crisisCopy.heading));
  }
});

test('the standard pages follow the payload: defaults on, optional pages switchable, core pages never off', () => {
  const records = eight();
  const titles = html => (html.match(/data-fd-packet-insert="([a-z]+)"/g) || []).map(m => m.split('"')[1]);
  const base = titles(render(records, stateOf(records)).html);
  const defaults = PAYLOAD.inserts.filter(i => i.defaultOn || i.core).map(i => i.id);
  assert.deepEqual([...new Set(base)].sort(), defaults.sort(), 'exactly the default-on pages render');
  const withSafety = titles(render(records, stateOf(records, { inserts: { safety: true } })).html);
  assert.ok(withSafety.includes('safety'));
  const withoutWarning = titles(render(records, stateOf(records, { inserts: { warning: false } })).html);
  assert.ok(!withoutWarning.includes('warning'));
  const coreOff = titles(render(records, stateOf(records, { inserts: { intro: false } })).html);
  assert.ok(coreOff.includes('intro'), 'a core page cannot be switched off');
  assert.equal(S.insertOn({ inserts: {} }, { id: 'x', core: false, defaultOn: true }), true);
  assert.equal(S.insertOn({ inserts: { x: false } }, { id: 'x', core: false, defaultOn: true }), false);
  assert.equal(S.insertOn({ inserts: { x: 'no' } }, { id: 'x', core: false, defaultOn: true }), true, 'only booleans override a default');
});

test('tokens in the standard pages resolve: the unit name and phone, and crisis contacts from the payload', () => {
  const records = eight();
  const r = render(records, stateOf(records, { mode: 'final', inserts: { rights: true, safety: true } }));
  const text = textOf(r.html);
  assert.ok(text.includes('(207) 555-0100'), 'unit phone');
  assert.ok(text.includes('4 East'), 'unit name');
  assert.equal(/\{\{|\}\}/.test(r.html), false, 'no token survives');
  assert.ok(text.includes('call ' + governed('emergency_911')) || text.includes(governed('emergency_911')), 'a crisis token resolved');
  const blanks = render(records, finalState(records, { unit: { name: '', phone: '' } }));
  assert.equal(blanks.html.includes('class="fd-packet-blank"'), true, 'an unavailable unit value prints a blank to write in');
});

test('every listing prints its name, phone, domain and area; the QR appears exactly for https websites', () => {
  const records = [
    row(0, { name: 'Has Https', website: 'https://www.example.org/deep/link?x=1' }),
    row(1, { name: 'Has Http', website: 'http://example.org/plain' }),
    row(2, { name: 'No Site', website: '' }),
    row(3, { name: 'Bad Scheme', website: 'javascript:alert(1)' }),
  ];
  const r = render(records, stateOf(records, { mode: 'final' }));
  assert.equal(r.ok, true, r.message);
  const text = textOf(r.html);
  for (const name of ['Has Https', 'Has Http', 'No Site']) assert.ok(text.includes(name), name);
  assert.ok(text.includes('207-700-0123') && text.includes('York County') && text.includes('example.org'));
  // Visible text, not markup: the QR's own namespace attribute legitimately contains "www." (w3.org).
  assert.equal(text.includes('www.'), false, 'the domain prints without www.');
  assert.equal(r.html.split('<svg').length - 1, 1, 'one QR: only the https listing has one (the generator IS loaded, so this is not "no QR anywhere")');
  assert.match(r.html, /QR code for website example\.org/, 'the QR is named by its destination');
  assert.equal(r.html.includes('javascript:'), false);
  assert.equal(text.includes('/deep/link'), false, 'paper prints the domain only');
  assert.equal(S.sheet(stateOf(records, { mode: 'final' }), dataOf(records), PAYLOAD, { preview: true }).html.includes('/deep/link?x=1'), true,
    'the preview (never the paper) shows the full address a QR encodes, as text');
});

test('a QR code that would be too dense to scan at the printed size is left off, and the domain still prints', () => {
  const longUrl = 'https://example.org/' + 'a'.repeat(190);
  const records = [row(0, { name: 'Short Link', website: 'https://example.org/x' }), row(1, { name: 'Long Link', website: longUrl })];
  const r = render(records, stateOf(records, { mode: 'final' }));
  assert.equal(r.html.split('<svg').length - 1, 1, 'only the short address gets a code');
  assert.ok(textOf(r.html).split('example.org').length - 1 >= 2, 'both domains still print');
  assert.ok(r.html.indexOf('Short Link') < r.html.indexOf('<svg') && r.html.indexOf('<svg') < r.html.indexOf('Long Link'), 'the code belongs to the short one');
});

test('heading levels are relative to a base: one h1 on paper, none in the preview, and never below h6', () => {
  const records = eight();
  const levels = html => (html.match(/<h([1-9])[\s>]/g) || []).map(h => Number(h[2]));
  const paper = levels(render(records, stateOf(records), PAYLOAD, { headingBase: 1 }).html);
  assert.equal(paper.filter(n => n === 1).length, 1, 'exactly one h1 on the printed packet');
  assert.ok(paper.every(n => n >= 1 && n <= 6));
  const inPage = levels(render(records, stateOf(records), PAYLOAD, { headingBase: 4, preview: true }).html);
  assert.ok(inPage.length > 0 && inPage.every(n => n >= 4 && n <= 6), 'inside the Care page the sheet starts below its h3: ' + inPage);
});

test('hostile listing text is escaped and the sheet cannot be made to contain markup or script', () => {
  const evil = '<img src=x onerror=alert(1)> & "q" \'s\'';
  const records = [row(0, { name: evil, description: evil, area: evil, phone: '207-700-0123' })];
  const r = render(records, stateOf(records, { mode: 'final' }));
  assert.equal(r.ok, true, r.message);
  assert.equal(r.html.includes('<img'), false);
  assert.equal(/onerror=alert/.test(r.html.replace(/&lt;img[^&]*&gt;/g, '')), false);
  assert.ok(r.html.includes('&lt;img'));
});

// ---- AC5 --------------------------------------------------------------------------------------------------
const AC5 = /Verification due|verifiedDate|reviewAfter|L[1-4]\b|\b\d+\s?mg\b/i;
const insertSets = {
  default: {},
  allOn: Object.fromEntries(['intro', 'week', 'callback', 'warning', 'safety', 'family', 'national', 'insurance', 'meds', 'rights', 'card', 'notes'].map(id => [id, true])),
  coreOnly: Object.fromEntries(['week', 'callback', 'warning', 'safety', 'family', 'national', 'insurance', 'meds', 'rights', 'card', 'notes'].map(id => [id, false])),
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
test('AC5: no sheet and no copy text, in either mode and any page set, contains verification metadata or a dose; the required crisis lines are always present', () => {
  const records = eight();
  const outputs = [];
  for (const [setName, inserts] of Object.entries(insertSets)) {
    for (const mode of MODES) {
      const state = stateOf(records, { mode, inserts });
      const r = S.sheet(state, dataOf(records), PAYLOAD, {});
      assert.equal(r.ok, true, setName + '/' + mode + ': ' + r.message);
      outputs.push([setName + '/' + mode + '/html', r.html], [setName + '/' + mode + '/text', textOf(r.html)]);
      if (mode === 'final') {
        const t = S.text(state, dataOf(records), PAYLOAD, {});
        assert.equal(t.ok, true, setName + ' text: ' + t.message);
        outputs.push([setName + '/text-copy', t.text]);
      }
      const visible = textOf(r.html);
      assert.ok(visible.includes('988'), setName + '/' + mode + ' carries 988');
      assert.ok(visible.includes('1-888-568-1112'), setName + '/' + mode + ' carries the Maine Crisis Line');
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
    row(4, { name: 'Zero​width 1‍0 mg Clinic' }),
  ];
  const r = render(hostile, stateOf(hostile, { mode: 'final' }));
  assert.equal(r.ok, true, r.message);
  assert.doesNotMatch(textOf(r.html), /10 mg|mcg|Verification|verify|1‍0/i);
  assert.ok(r.withheld.some(w => w.field === 'description'));
  assert.ok(r.withheld.some(w => w.field === 'area'));
  const codes = r.blockers.map(b => b.code);
  assert.ok(codes.includes('LISTING_TEXT'), 'a name or phone with forbidden text blocks printing');
  assert.ok(r.blockers.every(b => b.message.length > 0));
});

// ---- blockers and fail-closed -----------------------------------------------------------------------------
test('blockers: a crisis number in a listing, Final without a unit phone, hidden saved listings, an empty packet', () => {
  const clean = eight();
  assert.deepEqual(render(clean, finalState(clean)).blockers, []);
  const withCrisis = [row(0, { phone: '207-799-4160 | Crisis Line: 888-568-1112' }), ...clean.slice(1)];
  assert.ok(render(withCrisis, finalState(withCrisis)).blockers.some(b => b.code === 'CRISIS_NUMBER' && b.message.includes('Support 0')));
  const noPhone = finalState(clean, { unit: { name: '4 East', phone: '' } });
  assert.ok(render(clean, noPhone).blockers.some(b => b.code === 'UNIT_PHONE'));
  assert.equal(render(clean, { ...noPhone, mode: 'review' }).blockers.some(b => b.code === 'UNIT_PHONE'), false, 'review copies may carry blanks');
  const badPhone = finalState(clean, { unit: { name: '', phone: '911' } });
  assert.ok(render(clean, badPhone).blockers.some(b => b.code === 'UNIT_PHONE'), 'an invalid phone counts as missing');
  const hidden = S.sheet(finalState(clean, { ids: [...idsOf(clean), 'gone-id'] }), dataOf(clean, undefined), PAYLOAD, {});
  assert.equal(hidden.blockers.some(b => b.code === 'HIDDEN_LISTINGS'), false, 'a COMPLETE feed that lacks the id simply drops it');
  const partial = S.sheet(finalState(clean, { ids: [...idsOf(clean), 'gone-id'] }), S.validate(feed(clean, { categories: feed(clean).categories.map((c, i) => (i === 3 ? { ...c, available: false } : c)) })), PAYLOAD, {});
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
  const run = measure => S.sheet(state, dataOf(records), PAYLOAD, { measure });
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
  const r = S.sheet(state, dataOf(records), PAYLOAD, { measure: units => ({ heights: units.map(u => (u.key === 'p1-header' || u.key === 'intro-0' ? 440 : 100)), capacity: 880 }) });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'CRISIS_NOT_PAGE_ONE');
});

test('the default estimator is deterministic, fits every standard page on a sheet on its own, and is not the production measurer', () => {
  const records = eight();
  for (const [name, inserts] of Object.entries(insertSets)) {
    const a = S.sheet(stateOf(records, { inserts }), dataOf(records), PAYLOAD, {});
    const b = S.sheet(stateOf(records, { inserts }), dataOf(records), PAYLOAD, {});
    assert.equal(a.html, b.html, name + ': same input, same bytes');
    assert.equal(a.ok, true, name + ': ' + a.message);
    assert.ok(a.pages.every(p => p.used <= p.capacity), name + ': no estimated page is over capacity');
  }
  assert.equal(typeof S.estimate, 'function');
});

// ---- the copy text ------------------------------------------------------------------------------------------
test('copy text: crisis lines first, then each listing, raw (never HTML-escaped), no unit details, Final only', () => {
  const records = [row(0, { name: "Children's Place & Co", area: 'York' }), ...eight().slice(1)];
  const state = finalState(records);
  const t = S.text(state, dataOf(records), PAYLOAD, {});
  assert.equal(t.ok, true, t.message);
  assert.ok(t.text.includes("Children's Place & Co"), 'raw characters, not entities');
  assert.equal(/&#39;|&amp;|&lt;/.test(t.text), false);
  assert.ok(t.text.indexOf(governed('lifeline_988')) < t.text.indexOf("Children's Place"), 'crisis lines come first');
  assert.equal(t.text.includes('4 East') || t.text.includes('555-0100'), false, 'the unit is not copied into a medical record field');
  assert.match(t.text, /Not a medical record/);
  assert.match(t.text, /ReConnect community directory on 2026-10-12/);
  assert.equal(S.text(stateOf(records, { mode: 'review' }), dataOf(records), PAYLOAD, {}).ok, false, 'a Review draft never goes into the record');
  assert.equal(S.text(stateOf(records, { mode: 'review' }), dataOf(records), PAYLOAD, {}).code, 'NOT_FINAL');
  assert.equal(/‮|​/.test(S.text(finalState([row(0, { name: 'A‮B​C' })]), dataOf([row(0, { name: 'A‮B​C' })]), PAYLOAD, {}).text), false, 'control and bidi characters are stripped');
});

test('the footer prints the directory copy date (not the inserts date) and never claims the listings were verified', () => {
  const records = eight();
  const r = S.sheet(finalState(records), dataOf(records, { generatedAt: '2026-09-30T08:00:00Z' }), PAYLOAD, {});
  const text = textOf(r.html);
  assert.match(text, /ReConnect community directory on 2026-09-30/);
  assert.match(text, /Call ahead to confirm hours, cost and availability/);
  assert.match(text, /Not a medical record/);
  assert.match(text, new RegExp('Helplines checked against each organization.s own website, ' + PAYLOAD.generatedAt));
  assert.doesNotMatch(text, /verified/i);
});
