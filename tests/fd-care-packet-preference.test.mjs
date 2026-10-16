// Device preference is a unit ID only. Packet content remains tab-scoped and approval is checked independently.
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
const PAYLOAD = { ...JSON.parse(built.stdout), unitProfiles: [PROFILE, FIXTURE.expired] };
const KEY = 'cw_care_unit_profile_v1';
const SESSION_KEY = 'fd_care_packet_v1';
const NOW = Date.UTC(2026, 9, 16, 12);
const source = read('fd_data.js') + readFileSync(path.join(BUILD, 'vendor/qrcode-generator-1.4.4.js'), 'utf8') +
  read('fd_care_pack.js') + read('fd_care_profile.js') + read('fd_care_packet.js') + read('fd_care_packet_sheet.js');
const exports = `;return {create:fdCreateCarePacket,blank:fdCarePacketBlank,
  key:typeof FD_CARE_PACKET_PROFILE_KEY==='undefined'?null:FD_CARE_PACKET_PROFILE_KEY,
  preference:typeof fdCarePacketProfilePreference==='function'?fdCarePacketProfilePreference:null,
  remember:typeof fdCarePacketRememberProfile==='function'?fdCarePacketRememberProfile:null};`;
const load = (session = undefined, local = undefined) =>
  new Function('sessionStorage', 'localStorage', 'FD_CARE_INSERTS', source + exports)(session, local, PAYLOAD);
const P = load();
const store = (id = '') => {
  const map = new Map(id ? [[KEY, id]] : []);
  return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) };
};
const data = { categories: [{ id: 'aftercare', label: 'Aftercare' }], records: [0, 1].map(i => ({
  id: 'a' + i, category: 'aftercare', name: 'Support ' + i, description: 'Counseling.', details: 'Adults', area: 'York',
  regions: ['Southern Maine'], phone: '(207) 555-0100', contactHref: 'tel:2075550100', website: 'https://example.org/support-' + i,
  verifiedDate: '2026-10-01', reviewAfter: '2027-03-30', verificationRequired: false,
})) };
const preview = () => {
  const controls = { innerHTML: '' }, pages = { innerHTML: '' };
  return { hidden: true, innerHTML: '', controls, pages, isConnected: true,
    querySelector: selector => /controls/.test(selector) ? controls : /pages/.test(selector) ? pages : null };
};
const make = (t, options = {}) => {
  const session = options.session || store();
  const local = options.local || store();
  const view = preview();
  const checks = [];
  const c = (options.api || P).create({ storage: session, profileStorage: local, payload: options.payload || PAYLOAD,
    sheet: { now: NOW }, authorizeProfile: profile => { checks.push(profile); return options.authorize ? options.authorize(profile) : profileReceipt(profile, NOW); } });
  c.mount(null, { textContent: '' }, options.dataGetter || (() => data), null, view);
  t.after(() => c.leave());
  return { c, session, local, view, checks };
};
const saved = session => JSON.parse(session.getItem(SESSION_KEY));

test('a remembered unit restores into a new packet and checks current approval without loading manually', t => {
  const local = store(PROFILE.id);
  const { c, session, checks } = make(t, { local });
  assert.deepEqual(c.ids(), [], 'the device preference restores no listings');
  assert.equal(c.mode, 'review', 'the device preference restores no copy choice');
  assert.equal(c.toggle('a0'), 'added');
  assert.deepEqual(saved(session).unit, { name: '', phone: '', profile: PROFILE.id });
  assert.equal(c.openPreview(), true);
  assert.ok(checks.length > 0, 'restoration still requests independent approval');
  assert.equal(checks.at(-1).revision, PROFILE.revision);
  assert.equal(c.print().code, 'NO_DOCUMENT', 'approval succeeds; only the absent browser prevents this unit test from printing');
  assert.deepEqual([...local.map], [[KEY, PROFILE.id]], 'only the ID is durable');
});

test('the preference reader accepts only a bounded raw ID and tolerates unavailable storage', () => {
  assert.equal(P.key, KEY);
  for (const id of ['a', PROFILE.id, 'x'.repeat(40)]) assert.equal(P.preference(store(id)), id);
  for (const raw of ['', 'x'.repeat(41), 'Fixture-Unit', ' unit', 'unit ', 'unit_name', '<unit>', '{broken',
    JSON.stringify({ profile: PROFILE.id, phone: PROFILE.unitPhone, approved: true }), JSON.stringify(PROFILE.id), 7, null, undefined, {}]) {
    assert.equal(P.preference({ getItem: () => raw }), '', String(raw));
  }
  assert.equal(P.preference(null), '');
  assert.equal(P.preference(undefined), '');
  assert.equal(P.preference({ getItem() { throw new Error('storage denied'); } }), '');
});

test('remembering writes only the ID and reports whether a write or removal really persisted', () => {
  const local = store();
  local.setItem('cw_unrelated', 'keep');
  assert.equal(P.remember(local, PROFILE.id), true);
  assert.deepEqual([...local.map], [['cw_unrelated', 'keep'], [KEY, PROFILE.id]]);
  for (const invalid of ['x'.repeat(41), 'Fixture-Unit', 'unit name', { id: PROFILE.id }, null, undefined]) {
    assert.equal(P.remember(local, invalid), false, String(invalid));
    assert.equal(local.getItem(KEY), PROFILE.id, 'invalid input never changes the remembered unit');
  }
  assert.equal(P.remember(local, ''), true);
  assert.deepEqual([...local.map], [['cw_unrelated', 'keep']], 'forget removes only its own preference');
  assert.equal(P.remember(null, PROFILE.id), false);
  assert.equal(P.remember({ getItem: () => null, setItem() { throw new Error('quota'); } }, PROFILE.id), false);
  assert.equal(P.remember({ getItem: () => null, setItem() {} }, PROFILE.id), false, 'a swallowed write is not success');
  assert.equal(P.remember({ getItem: () => PROFILE.id, removeItem() {} }, ''), false, 'a swallowed removal is not success');
  assert.equal(P.remember({ getItem() { throw new Error('read denied'); }, setItem() {} }, PROFILE.id), false);
});

test('the production default stores the unit choice separately from packet contents', t => {
  const session = store(), local = store();
  const api = load(session, local);
  const c = api.create({ authorizeProfile: p => profileReceipt(p, NOW), sheet: { now: NOW } });
  c.mount(null, null, () => data, null, preview());
  t.after(() => c.leave());
  c.toggle('a0');
  c.setInsert('safety', true);
  c.setMode('final');
  assert.equal(c.loadProfile(PROFILE.id), true);
  assert.deepEqual([...local.map], [[KEY, PROFILE.id]], 'no selected listing, contact, mode, page choice or approval goes in local storage');
  assert.deepEqual(saved(session).ids, ['a0'], 'packet contents still use tab storage');
  assert.equal(saved(session).mode, 'final');
  assert.equal(saved(session).inserts.safety, true);
});

test('explicit profile loading remembers a choice, while a select change alone never does', t => {
  const { c, local } = make(t);
  c.toggle('a0');
  const select = { value: PROFILE.id, hasAttribute: k => k === 'data-fd-care-packet-profile-select', getAttribute: k => k === 'data-fd-care-packet-profile-select' ? '' : null };
  assert.equal(c.handleChange(select), null);
  assert.equal(local.getItem(KEY), null);
  assert.equal(c.loadProfile(PROFILE.id), true);
  assert.equal(local.getItem(KEY), PROFILE.id);
  assert.equal(c.loadProfile('missing-unit'), false);
  assert.equal(local.getItem(KEY), PROFILE.id, 'an unavailable choice does not replace the working preference');
});

test('a saved packet choice or typed unit wins over the remembered unit', t => {
  for (const unit of [
    { name: 'Draft ward', phone: '', profile: '' },
    { name: '', phone: '(207) 555-0101', profile: '' },
    { name: '', phone: '', profile: FIXTURE.expired.id },
    { name: '', phone: '', profile: 'removed-unit' },
  ]) {
    const session = store();
    session.setItem(SESSION_KEY, JSON.stringify({ ...P.blank(), unit }));
    const { c, local } = make(t, { session, local: store(PROFILE.id) });
    c.toggle('a0');
    assert.deepEqual(saved(session).unit, unit, 'current tab choice is not replaced');
    assert.equal(local.getItem(KEY), PROFILE.id);
  }
});

test('missing or unusable remembered profiles never choose another unit', t => {
  for (const [id, payload] of [
    ['removed-unit', PAYLOAD],
    [PROFILE.id, { ...PAYLOAD, unitProfiles: [] }],
    [PROFILE.id, { ...PAYLOAD, unitProfiles: [{ ...PROFILE, unitPhone: 'bad' }, FIXTURE.expired] }],
  ]) {
    const { c, session, local, checks } = make(t, { local: store(id), payload });
    c.toggle('a0');
    assert.deepEqual(saved(session).unit, { name: '', phone: '', profile: '' });
    assert.equal(c.print().code, 'UNIT_UNCONFIRMED');
    assert.equal(checks.length, 0, 'there is no substitute profile to approve');
    assert.equal(local.getItem(KEY), id, 'a missing build entry does not silently rewrite the device choice');
  }
});

test('corrupt or denied preference storage never prevents normal profile loading and approval', t => {
  for (const local of [
    { getItem: () => '{broken', setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } },
    { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } },
  ]) {
    const { c, session, view } = make(t, { local });
    c.toggle('a0');
    assert.deepEqual(saved(session).unit, { name: '', phone: '', profile: '' });
    assert.equal(c.loadProfile(PROFILE.id), true, 'storage failure does not block the current packet');
    c.openPreview();
    assert.equal(c.print().code, 'NO_DOCUMENT', 'independent approval still succeeds');
    assert.match(view.controls.innerHTML, /data-fd-care-packet-profile-memory/);
    assert.match(view.controls.innerHTML, /could not remember the unit/i, 'failed persistence is explained');
    assert.doesNotMatch(view.controls.innerHTML, /Remembered on this (?:browser|device)/i, 'failed persistence is never reported as remembered');
  }
});

test('clear resets the current packet without deleting or immediately reapplying the device preference', t => {
  const local = store(PROFILE.id);
  const { c, session } = make(t, { local });
  c.toggle('a0');
  c.setMode('final');
  c.setInsert('safety', true);
  c.clear();
  assert.equal(session.getItem(SESSION_KEY), null, 'all current packet state is removed');
  assert.equal(local.getItem(KEY), PROFILE.id, 'device preference survives Clear packet');
  c.refresh();
  c.toggle('a1');
  assert.deepEqual(saved(session).unit, { name: '', phone: '', profile: '' }, 'the same controller respects the explicit clear');
  assert.deepEqual(saved(session).ids, ['a1']);
  assert.equal(saved(session).mode, 'review');
  assert.deepEqual(saved(session).inserts, {});
  const next = make(t, { local });
  next.c.toggle('a0');
  assert.equal(saved(next.session).unit.profile, PROFILE.id, 'a future visit restores just the preferred unit');
});

test('forget removes the preference while retaining the current packet and approved unit', t => {
  const local = store(PROFILE.id);
  const { c, session, view } = make(t, { local });
  c.toggle('a0');
  c.openPreview();
  const before = session.getItem(SESSION_KEY);
  assert.match(view.controls.innerHTML, /data-fd-care-packet-profile-forget/);
  c.forgetProfile();
  assert.equal(local.getItem(KEY), null);
  assert.equal(session.getItem(SESSION_KEY), before, 'forget is a device setting, not packet removal');
  assert.equal(c.print().code, 'NO_DOCUMENT', 'the current unit may still pass its independent approval check');
  c.refresh();
  assert.equal(saved(session).unit.profile, PROFILE.id);
  const next = make(t, { local });
  next.c.toggle('a0');
  assert.equal(saved(next.session).unit.profile, '', 'a new visit no longer selects this unit');
});

test('using own details forgets the device preference and never restores it during a later refresh', t => {
  const local = store(PROFILE.id);
  const { c, session } = make(t, { local });
  c.toggle('a0');
  assert.equal(c.unlinkProfile(), true);
  assert.equal(local.getItem(KEY), null);
  c.setUnit('name', 'Draft ward');
  c.refresh();
  assert.deepEqual(saved(session).unit, { name: 'Draft ward', phone: '', profile: '' });
  assert.equal(c.print().code, 'UNIT_UNCONFIRMED');
  const next = make(t, { local });
  next.c.toggle('a0');
  assert.equal(saved(next.session).unit.profile, '');
});

test('a remembered ID resolves the current revision and cannot reuse an old approval receipt', t => {
  const changed = { ...PROFILE, revision: 'c'.repeat(64), unitName: 'Updated Fixture Unit', unitPhone: '(207) 555-0102' };
  const payload = { ...PAYLOAD, unitProfiles: [changed] };
  let approveCurrent = false;
  const { c, view, local, checks } = make(t, { local: store(PROFILE.id), payload,
    authorize: p => profileReceipt(approveCurrent ? p : PROFILE, NOW) });
  c.toggle('a0');
  c.openPreview();
  assert.equal(checks.at(-1).revision, changed.revision);
  assert.match(view.controls.innerHTML, /Updated Fixture Unit|555-0102/, 'contact details come from the current payload');
  assert.equal(c.print().code, 'UNIT_UNCONFIRMED', 'approval of the old revision cannot authorize this profile');
  assert.doesNotMatch(view.pages.innerHTML, /Updated Fixture Unit|555-0102/, 'unapproved current details remain outside patient output');
  approveCurrent = true;
  assert.equal(c.print().code, 'NO_DOCUMENT', 'current exact approval can enable the restored unit');
  assert.deepEqual([...local.map], [[KEY, PROFILE.id]], 'neither revision nor approval was persisted');
});

test('restoring a unit never makes revoked, expired, stale or unavailable approval printable', t => {
  for (const [label, authorize] of [
    ['revoked', () => ({ ok: false, status: 'revoked' })],
    ['unavailable', () => { throw new Error('offline'); }],
    ['stale', p => profileReceipt(p, NOW - 60001)],
    ['expired', p => profileReceipt({ ...p, expiresOn: '2020-01-02' }, NOW)],
  ]) {
    const { c } = make(t, { local: store(PROFILE.id), authorize });
    c.toggle('a0');
    c.setMode('final');
    c.openPreview();
    assert.equal(c.print().code, 'UNIT_UNCONFIRMED', label);
    assert.equal(c.copy().code, 'UNIT_UNCONFIRMED', label + ' also blocks copied text');
  }
});

test('late directory arrival does not reapply a remembered unit after Clear or own-details selection', t => {
  for (const action of ['clear', 'own-details']) {
    let currentData = null;
    const { c, session } = make(t, { local: store(PROFILE.id), dataGetter: () => currentData });
    if (action === 'clear') c.clear();
    else { c.unlinkProfile(); c.setUnit('name', 'Draft ward'); }
    currentData = data;
    c.refresh();
    c.toggle('a0');
    assert.equal(saved(session).unit.profile, '', action);
    assert.equal(saved(session).unit.name, action === 'clear' ? '' : 'Draft ward');
    assert.equal(c.print().code, 'UNIT_UNCONFIRMED');
  }
});

test('a late approval for the remembered unit cannot undo a switch to own details or restore patient output', async t => {
  let resolveApproval;
  const { c, session, view, local } = make(t, { local: store(PROFILE.id),
    authorize: p => new Promise(resolve => { resolveApproval = () => resolve(profileReceipt(p, NOW)); }) });
  c.toggle('a0');
  c.setMode('final');
  const pending = c.print();
  assert.equal(typeof pending.then, 'function');
  c.unlinkProfile();
  c.setUnit('name', 'Draft ward');
  c.openPreview();
  resolveApproval();
  assert.equal((await pending).ok, false);
  assert.deepEqual(saved(session).unit, { name: 'Draft ward', phone: '', profile: '' });
  assert.equal(local.getItem(KEY), null);
  assert.doesNotMatch(view.pages.innerHTML, /555-0142|Fixture Unit 4 East/);
  assert.equal(c.print().code, 'UNIT_UNCONFIRMED');
});


test('an expired remembered profile remains a candidate and requires renewed approval', t => {
  const { c, session, view } = make(t, { local: store(FIXTURE.expired.id) });
  c.toggle('a0');
  c.openPreview();
  assert.equal(saved(session).unit.profile, FIXTURE.expired.id, 'the chosen identity is retained');
  assert.equal(c.print().code, 'UNIT_UNCONFIRMED');
  assert.equal(c.copy().code, 'UNIT_UNCONFIRMED');
  assert.match(view.controls.innerHTML, /expired on 2020-01-02/);
  assert.doesNotMatch(view.pages.innerHTML, /555-0142|Fixture Unit 4 East/);
});
