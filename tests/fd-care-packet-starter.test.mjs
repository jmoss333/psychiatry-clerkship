// A starter is one explicit, atomic edit; it cannot substitute for current unit approval.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { profileReceipt } from './helpers/care-profile-fixture.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const AUTOMATION = path.join(REPO, '13_Faculty_Resources/_automation');
const BUILD = path.join(AUTOMATION, 'site_build');
const read = name => readFileSync(path.join(BUILD, 'frontdoor', name), 'utf8');
const built = spawnSync('python3', ['-B', '-c',
  `import json,sys\nsys.path.insert(0,${JSON.stringify(AUTOMATION)})\nsys.path.insert(0,${JSON.stringify(BUILD)})\nimport care_inserts_payload as p\nprint(json.dumps(p.build_payload()))`],
{ cwd: BUILD, encoding: 'utf8', timeout: 60000 });
assert.equal(built.status, 0, built.stderr);
const FIXTURE = JSON.parse(readFileSync(path.join(REPO, 'tests/fixtures/care-unit-profile.json'), 'utf8'));
const PROFILE = FIXTURE.profile;
const PAYLOAD = { ...JSON.parse(built.stdout), unitProfiles: [PROFILE] };
const STARTER = { profile: PROFILE.id, ids: ['a1', 'a2', 'a3'] };
const ADDONS = { transport: { ids: ['a4', 'a5'] }, housing: { ids: ['a6', 'a7'] } };
const KEY = 'cw_care_unit_profile_v1';
const SESSION_KEY = 'fd_care_packet_v1';
const NOW = Date.UTC(2026, 9, 16, 12);
const source = read('fd_data.js') + readFileSync(path.join(BUILD, 'vendor/qrcode-generator-1.4.4.js'), 'utf8') +
  read('fd_care_pack.js') + read('fd_care_profile.js') + read('fd_care_search.js') + read('fd_care_packet.js') + read('fd_care_packet_sheet.js');
const P = new Function('FD_CARE_INSERTS', source + `;return {create:fdCreateCarePacket,blank:fdCarePacketBlank,
  addon:typeof fdCarePacketAddon==='function'?fdCarePacketAddon:null,
  starter:typeof fdCarePacketStarter==='function'?fdCarePacketStarter:null};`)(PAYLOAD);
const data = { categories: [{ id: 'aftercare', label: 'Aftercare' }], records: Array.from({ length: 14 }, (_, i) => ({
  id: 'a' + i, category: 'aftercare', name: 'Fictional support ' + i, description: 'Counseling.', details: 'Adults', area: 'York',
  regions: ['Southern Maine'], phone: '(207) 555-0100', contactHref: 'tel:2075550100', website: 'https://example.org/support-' + i,
  verifiedDate: '2026-10-01', reviewAfter: '2027-03-30', verificationRequired: false,
})) };
const clone = value => JSON.parse(JSON.stringify(value));
const store = () => {
  const map = new Map();
  return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) };
};
const preview = () => {
  const controls = { innerHTML: '' }, pages = { innerHTML: '' };
  return { hidden: true, innerHTML: '', controls, pages, isConnected: true,
    querySelector: selector => /controls/.test(selector) ? controls : /pages/.test(selector) ? pages : null };
};
const make = (t, options = {}) => {
  const session = store(), local = store(), view = preview(), checks = [];
  if (options.state) session.setItem(SESSION_KEY, JSON.stringify(options.state));
  if (options.remembered) local.setItem(KEY, options.remembered);
  local.setItem('cw_unrelated', 'keep');
  const c = P.create({ storage: session, profileStorage: local, payload: options.payload === undefined ? PAYLOAD : options.payload,
    starter: options.starter === undefined ? STARTER : options.starter, addons: options.addons === undefined ? ADDONS : options.addons, sheet: { now: NOW },
    authorizeProfile: profile => { checks.push(profile); return options.authorize ? options.authorize(profile) : profileReceipt(profile, NOW); } });
  c.mount(null, { textContent: '' }, () => options.data === undefined ? data : options.data, null, view);
  t.after(() => c.leave());
  return { c, session, local, view, checks };
};
const start = c => {
  assert.equal(typeof c.startStarter, 'function', 'the packet controller exposes the explicit starter action');
  return c.startStarter();
};
const plan = (state, directory = data, payload = PAYLOAD, starter = STARTER) => {
  assert.equal(typeof P.starter, 'function', 'starter validation runs before any packet or storage change');
  return P.starter(state, directory, payload, starter);
};
const saved = session => JSON.parse(session.getItem(SESSION_KEY));
const addon = (state, directory = data, config = ADDONS.transport, payload = PAYLOAD, now = NOW) => {
  assert.equal(typeof P.addon, 'function', 'add-ons validate the complete selection before changing state');
  return P.addon(state, directory, payload, config, now);
};
const add = (c, key = 'transport') => {
  assert.equal(typeof c.startAddon, 'function', 'the controller exposes explicit add-on actions');
  return c.startAddon(key);
};
const rejected = (state, directory, payload, starter) => {
  const before = clone(state);
  const result = plan(state, directory, payload, starter);
  assert.equal(result.ok, false);
  assert.equal(typeof result.reason, 'string');
  assert.ok(result.reason.length > 0, 'rejection explains why the whole starter was held');
  assert.deepEqual(state, before, 'a rejected starter never mutates its input');
};

test('the starter appends only missing resources and preserves deliberate packet choices', () => {
  const state = { ...P.blank(), ids: ['a5', 'a2'], mode: 'final', inserts: { safety: true, notes: false } };
  const before = clone(state), result = plan(state);
  assert.equal(result.ok, true);
  assert.equal(result.reason, '');
  assert.deepEqual(result.result.state, {
    ids: ['a5', 'a2', 'a1', 'a3'], why: {}, mode: 'final', inserts: { safety: true, notes: false },
    unit: { name: '', phone: '', profile: PROFILE.id },
  });
  assert.equal(result.result.added, 2);
  assert.equal(result.result.already, 1);
  assert.deepEqual(result.result.omitted, []);
  assert.equal(result.profile.id, PROFILE.id);
  assert.equal(result.profile.revision, PROFILE.revision);
  assert.deepEqual(state, before, 'successful planning is pure too');
});

test('malformed or empty starter configuration cannot silently load just a unit or a subset', () => {
  for (const config of [null, {}, [], { profile: PROFILE.id, ids: [] }, { profile: '', ids: ['a1'] },
    { profile: 'Bad Unit', ids: ['a1'] }, { profile: PROFILE.id, ids: 'a1' },
    { profile: PROFILE.id, ids: ['a1', null] }, { profile: PROFILE.id, ids: ['a1', ''] }]) {
    rejected(P.blank(), data, PAYLOAD, config);
  }
});

test('absent or partial directory data holds the complete starter', () => {
  for (const directory of [null, {}, { ...data, partial: true }]) {
    rejected({ ...P.blank(), ids: ['a5'] }, directory, PAYLOAD, STARTER);
  }
});

test('a missing or newly ineligible configured resource holds even already selected starter resources', () => {
  const missing = { ...data, records: data.records.filter(row => row.id !== 'a2') };
  const ineligible = { ...data, records: data.records.map(row => row.id === 'a2' ? { ...row, contactHref: '', website: '' } : row) };
  for (const directory of [missing, ineligible]) {
    for (const ids of [[], ['a2']]) rejected({ ...P.blank(), ids }, directory, PAYLOAD, STARTER);
  }
});

test('capacity shortage rejects the whole starter instead of saving a partial packet', () => {
  rejected({ ...P.blank(), ids: ['a0', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'a11', 'a12'] }, data, PAYLOAD, STARTER);
  const atLimit = plan({ ...P.blank(), ids: ['a0', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'a11'] });
  assert.equal(atLimit.ok, true, 'all configured rows fit at the exact packet limit');
  assert.deepEqual(atLimit.result.state.ids, ['a0', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'a11', 'a1', 'a2', 'a3']);
});

test('missing or unusable starter unit cannot fall back to another available unit', () => {
  for (const payload of [null, { ...PAYLOAD, unitProfiles: [] },
    { ...PAYLOAD, unitProfiles: [{ ...PROFILE, id: 'other-unit' }] },
    { ...PAYLOAD, unitProfiles: [{ ...PROFILE, unitPhone: 'bad' }, { ...PROFILE, id: 'other-unit' }] }]) {
    rejected(P.blank(), data, payload, STARTER);
  }
});

test('typed unit details and a different selected profile are never overwritten by a starter', () => {
  for (const unit of [
    { name: 'Draft ward', phone: '', profile: '' },
    { name: '', phone: '(207) 555-0101', profile: '' },
    { name: '', phone: '', profile: 'other-unit' },
  ]) rejected({ ...P.blank(), unit }, data, PAYLOAD, STARTER);
  const same = plan({ ...P.blank(), unit: { name: '', phone: '', profile: PROFILE.id } });
  assert.equal(same.ok, true, 'the existing matching unit is compatible with the starter');
});

test('the explicit controller action saves the complete packet, remembers only its unit ID and opens current preview', t => {
  const { c, session, local, view, checks } = make(t);
  assert.deepEqual(c.ids(), [], 'mount alone never preselects starter resources');
  assert.equal(c.previewOpen(), false);
  assert.equal(start(c), true);
  assert.deepEqual(saved(session), {
    ids: ['a1', 'a2', 'a3'], why: {}, inserts: {}, mode: 'review', unit: { name: '', phone: '', profile: PROFILE.id },
  });
  assert.deepEqual([...local.map], [['cw_unrelated', 'keep'], [KEY, PROFILE.id]], 'no packet contents or authority receipt become device preferences');
  assert.equal(c.previewOpen(), true);
  assert.equal(view.hidden, false);
  assert.ok(checks.length > 0, 'the starter asks independent authority about this exact unit revision');
  assert.equal(checks.at(-1).id, PROFILE.id);
  assert.equal(checks.at(-1).revision, PROFILE.revision);
  assert.equal(c.print().code, 'NO_DOCUMENT', 'current approval and printable content pass; this unit harness has no native print dialog');
});

test('repeated starter clicks keep existing order and custom insert choices without duplicates', t => {
  const { c, session } = make(t, { state: { ...P.blank(), ids: ['a5', 'a2'], mode: 'final', inserts: { safety: true, notes: false } } });
  assert.equal(start(c), true);
  assert.equal(start(c), true);
  assert.deepEqual(saved(session), {
    ids: ['a5', 'a2', 'a1', 'a3'], why: {}, inserts: { safety: true, notes: false }, mode: 'final',
    unit: { name: '', phone: '', profile: PROFILE.id },
  });
});

test('controller rejection leaves packet, device preference, preview and authority untouched', t => {
  const base = { ...P.blank(), ids: ['a5'], inserts: { safety: true } };
  for (const options of [
    { starter: { profile: PROFILE.id, ids: [] } },
    { data: null },
    { data: { ...data, partial: true } },
    { data: { ...data, records: data.records.filter(row => row.id !== 'a3') } },
    { payload: { ...PAYLOAD, unitProfiles: [] } },
    { state: { ...base, unit: { name: 'Draft ward', phone: '', profile: '' } } },
    { state: { ...base, unit: { name: '', phone: '', profile: 'other-unit' } } },
    { state: { ...base, ids: ['a0', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'a11', 'a12'] } },
  ]) {
    const { c, session, local, checks } = make(t, { state: base, remembered: 'removed-unit', ...options });
    const beforeSession = [...session.map], beforeLocal = [...local.map];
    assert.equal(start(c), false);
    assert.deepEqual([...session.map], beforeSession);
    assert.deepEqual([...local.map], beforeLocal);
    assert.equal(c.previewOpen(), false);
    assert.equal(checks.length, 0, 'a refused starter never requests approval of a replacement unit');
  }
});

test('an uncommitted typed unit field is protected without committing it as a side effect of refusal', t => {
  const { c, session, local, checks } = make(t, { state: { ...P.blank(), ids: ['a5'] } });
  const input = { value: 'Draft ward', hasAttribute: key => key === 'data-fd-care-packet-unit-field',
    getAttribute: key => key === 'data-fd-care-packet-unit-field' ? 'name' : null };
  assert.equal(c.handleInput(input), true);
  const beforeSession = [...session.map], beforeLocal = [...local.map];
  assert.equal(start(c), false);
  assert.deepEqual([...session.map], beforeSession);
  assert.deepEqual([...local.map], beforeLocal);
  assert.equal(checks.length, 0);
  assert.equal(c.handleChange(input).keep, true);
  assert.equal(saved(session).unit.name, 'Draft ward', 'the normal change event still saves the protected typed value');
});

test('starter selection cannot carry prior approval through a later revocation', t => {
  let approved = true;
  const { c, local, view } = make(t, { authorize: profile => approved ? profileReceipt(profile, NOW) : { ok: false, status: 'revoked' } });
  assert.equal(start(c), true);
  assert.equal(c.print().code, 'NO_DOCUMENT');
  c.setMode('final');
  approved = false;
  assert.equal(c.print().code, 'UNIT_UNCONFIRMED');
  assert.equal(c.copy().code, 'UNIT_UNCONFIRMED');
  assert.equal(local.getItem(KEY), PROFILE.id, 'a preference is retained but never treated as approval');
  assert.doesNotMatch(view.pages.innerHTML, /Fixture Unit 4 East|555-0142/, 'revoked unit details leave patient output');
});

test('an add-on appends only missing resources while keeping unit, order, copy and page choices', () => {
  const state = { ...P.blank(), ids: ['a8', 'a5'], mode: 'final', inserts: { safety: true, notes: false },
    unit: { name: 'Another ward', phone: '(207) 555-0101', profile: '' } };
  const before = clone(state), result = addon(state);
  assert.equal(result.ok, true);
  assert.deepEqual(result.result.state, { ...state, ids: ['a8', 'a5', 'a4'] });
  assert.equal(result.result.added, 1);
  assert.equal(result.result.already, 1);
  assert.deepEqual(state, before);
});

test('invalid, missing, ineligible or over-capacity add-ons never apply a partial selection', () => {
  const base = { ...P.blank(), ids: ['a5'] }, before = clone(base);
  const invalid = [null, {}, [], { ids: [] }, { ids: ['a4', 'a4'] }, { ids: ['a4', null] },
    { ids: ['a4', ''] }, { ids: ['a4', 'x'.repeat(121)] }, { ids: 'a4' }];
  for (const config of invalid) assert.equal(addon(base, data, config).ok, false);
  for (const directory of [null, {}, { ...data, partial: true },
    { ...data, records: data.records.filter(row => row.id !== 'a4') },
    { ...data, records: data.records.map(row => row.id === 'a5' ? { ...row, contactHref: '', website: '' } : row) }]) {
    const result = addon(base, directory);
    assert.equal(result.ok, false);
    assert.ok(result.reason.length);
  }
  assert.equal(addon(base, data, ADDONS.transport, null).ok, false);
  assert.equal(addon({ ...base, ids: data.records.filter(row => !['a4', 'a5', 'a13'].includes(row.id)).map(row => row.id) }).ok, false);
  assert.deepEqual(base, before);
});

test('add-ons hold overdue, unverified, future or malformed dates even for selected resources', () => {
  for (const fields of [{ reviewAfter: '2026-10-16' }, { reviewAfter: '2026-10-15' }, { reviewAfter: '' },
    { reviewAfter: '2027-02-30' }, { verifiedDate: '2026-10-17' }, { verifiedDate: '' },
    { verifiedDate: '2026-02-30' }, { verificationRequired: true }, { verificationRequired: undefined }]) {
    const directory = { ...data, records: data.records.map(row => row.id === 'a5' ? { ...row, ...fields } : row) };
    for (const ids of [[], ['a5']]) assert.equal(addon({ ...P.blank(), ids }, directory).ok, false, JSON.stringify(fields));
  }
  assert.equal(addon(P.blank(), data, ADDONS.transport, PAYLOAD, NaN).ok, false);
  assert.equal(addon(P.blank(), data).ok, true);
});

test('add-ons are separate explicit actions, do not select a unit, and are repeatable without duplicates', t => {
  const { c, session, local, checks } = make(t);
  const beforeLocal = [...local.map];
  assert.deepEqual(c.ids(), []);
  assert.equal(add(c), true);
  assert.deepEqual(c.ids(), ['a4', 'a5']);
  assert.deepEqual(saved(session).unit, P.blank().unit);
  assert.equal(c.previewOpen(), true);
  assert.equal(checks.length, 0);
  assert.equal(add(c), true);
  assert.equal(add(c, 'housing'), true);
  assert.deepEqual(c.ids(), ['a4', 'a5', 'a6', 'a7']);
  assert.deepEqual([...local.map], beforeLocal);
  assert.notEqual(c.print().code, 'NO_DOCUMENT', 'choosing resources alone cannot authorize patient output');
});

test('add-ons preserve uncommitted unit typing and never write it as a selection side effect', t => {
  const { c, session, local } = make(t, { state: { ...P.blank(), ids: ['a8'] } });
  const input = { value: 'Draft ward', hasAttribute: key => key === 'data-fd-care-packet-unit-field',
    getAttribute: key => key === 'data-fd-care-packet-unit-field' ? 'name' : null };
  c.handleInput(input);
  const beforeLocal = [...local.map];
  assert.equal(add(c), true);
  assert.equal(saved(session).unit.name, '');
  c.handleChange(input);
  assert.equal(saved(session).unit.name, 'Draft ward');
  assert.deepEqual([...local.map], beforeLocal);
});

test('unknown or unavailable add-ons leave packet, preference and preview untouched', t => {
  for (const key of ['unknown', '__proto__', 'constructor', 'transport']) {
    const { c, session, local, checks } = make(t, { state: { ...P.blank(), ids: ['a8'] }, data: { ...data, partial: true } });
    const beforeSession = [...session.map], beforeLocal = [...local.map];
    assert.equal(add(c, key), false);
    assert.deepEqual([...session.map], beforeSession);
    assert.deepEqual([...local.map], beforeLocal);
    assert.equal(c.previewOpen(), false);
    assert.equal(checks.length, 0);
  }
});

test('an add-on rechecks current approval and cannot carry a revoked unit into output', t => {
  let approved = true;
  const { c, checks } = make(t, { authorize: profile => approved ? profileReceipt(profile, NOW) : { ok: false, status: 'revoked' } });
  assert.equal(start(c), true);
  assert.equal(c.print().code, 'NO_DOCUMENT');
  approved = false;
  const previousChecks = checks.length;
  assert.equal(add(c), true);
  assert.ok(checks.length > previousChecks);
  assert.equal(c.print().code, 'UNIT_UNCONFIRMED');
  assert.equal(c.copy().code, 'UNIT_UNCONFIRMED');
});
