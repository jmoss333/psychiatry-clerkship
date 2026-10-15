// The Care aftercare packet's build-time payload (docs/superpowers/plans/2026-10-12-care-packet-print.md §1).
//
// The browser needs the standard inserts AND the crisis contacts they reference, and crisis numbers
// live in crisis_resources.json only. So the build resolves nothing: it ships the data unchanged plus a
// `contacts` map copied from the governed record, and the sheet fills `{{crisis:<id>}}` from it. These
// tests read the governed file DIRECTLY as the oracle (never the payload) so a swapped, truncated or
// stale contact cannot pass by agreeing with itself.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { staleBuildReason } from './_build_freshness.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const SITE_BUILD = path.join(REPO, '13_Faculty_Resources/_automation/site_build');
const DATA = path.join(SITE_BUILD, 'data/care-inserts.v1.json');
const SCHEMA = path.join(SITE_BUILD, 'data/care-inserts.v1.schema.json');
const PROFILES = path.join(SITE_BUILD, 'data/care-unit-profiles.v1.json');
const PROFILES_SCHEMA = path.join(SITE_BUILD, 'data/care-unit-profiles.v1.schema.json');
const PACKET_SOURCE = path.join(SITE_BUILD, 'frontdoor/fd_care_packet.js');
const FIXTURE = path.join(REPO, 'tests/fixtures/care-unit-profile.json');
const CRISIS = path.join(REPO, 'crisis_resources.json');
const SHELL = path.join(SITE_BUILD, 'spa_index.html');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const NEEDLE = 'var FD_CARE_INSERTS=null;';
const FLAG_OFF = 'var FD_CARE_PACKET_ENABLED=false;';
const FLAG_ON = 'var FD_CARE_PACKET_ENABLED=true;';
// What a built payload may never carry: the governed record's internal fields, the helpline rows' provenance, and a
// unit profile's verification records (actual check dates, roles and evidence).
const FORBIDDEN = ['alsoAvailable', 'verificationSource', 'verifiedOn', 'reconnectRecord', 'upstreamDiscrepancies',
  'unitEscalationNote', 'verifiedDate', 'alsoSources', '"source"', 'phoneConfirmed', '"verification"', '"checkedBy"', '"evidence"'];
const SHIPPED_PROFILE_KEYS = ['brandingApproved', 'callbackProgram', 'callbackTeam', 'callbackPhone', 'callbackHours', 'callbackFallback', 'id', 'label', 'org', 'unitName', 'unitPhone', 'unitPurpose', 'unitHours', 'revision', 'expiresOn', 'usableThrough'].sort();

// -B writes no __pycache__ into the tree. Not -I: isolated mode also hides the user site-packages, and on
// a machine where jsonschema's own dependency (attrs) lives there the import fails for a reason that has
// nothing to do with this code (CI installs everything into one place; the sibling spawn-python tests use
// plain `python3 -c` for the same reason). The cwd is the build directory, whose contents are controlled,
// so the empty sys.path[0] entry cannot pick up a stray json.py from the repo root.
function py(body, args = []) {
  const code = `import json, sys\nsys.path.insert(0, ${JSON.stringify(SITE_BUILD)})\nimport care_inserts_payload as p\n${body}`;
  return spawnSync('python3', ['-B', '-c', code, ...args], { cwd: SITE_BUILD, encoding: 'utf8' });
}
function payload() {
  const run = py('print(json.dumps(p.build_payload()))');
  assert.equal(run.status, 0, run.stderr || run.stdout);
  return JSON.parse(run.stdout);
}
function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'care-payload-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function referencedIds(data) {
  const ids = new Set(data.crisis.map(line => line.ref));
  const text = JSON.stringify([data.crisisCopy, data.inserts]);
  for (const match of text.matchAll(/\{\{crisis:([a-z0-9_]+)\}\}/g)) ids.add(match[1]);
  return ids;
}
// The oracle for `crisisNumbers`, written from the governed file's own text and NOT from the validator: every number
// in `contact` or `alsoAvailable` of every resource, as digits, a leading North American 1 dropped, three or more.
function registeredDigits(crisis, fields = ['contact', 'alsoAvailable']) {
  const out = new Set();
  for (const resource of crisis.resources) {
    for (const field of fields) {
      for (const token of String(resource[field] ?? '').match(/\d[\d\-\s().]*\d/g) || []) {
        let digits = token.replace(/\D/g, '');
        if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
        if (digits.length >= 3) out.add(digits);
      }
    }
  }
  return [...out].sort();
}
function addDays(iso, days) {
  const day = new Date(`${iso}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}
// A fixture profile (shipped shape) turned back into the SOURCE shape the profiles file holds.
function sourceProfile(shipped, confirmedOn, extra = {}) {
  const { usableThrough, expiresOn, revision, ...rest } = shipped;
  assert.ok(usableThrough, 'the fixture is in the shipped shape');
  const out = { unitPurpose: 'questions about your discharge papers', unitHours: 'Monday to Friday, 9 a.m. to 5 p.m.',
    callbackTeam: 'Test follow-up team', callbackPhone: '(207) 555-0143', callbackHours: 'Monday to Friday, 9 a.m. to 5 p.m.',
    callbackFallback: 'follow the contact instructions in your After Visit Summary', ...rest, ...extra };
  out.verification = ['identity', 'contact', ...(out.callbackProgram ? ['callback'] : []), ...(out.brandingApproved ? ['branding'] : [])]
    .map(field => ({ field, checkedOn: confirmedOn, checkedBy: 'unit charge nurse', evidence: 'Direct confirmation with the responsible unit team' }));
  return out;
}
function changedCheck(profile, changes) {
  return { ...profile, verification: profile.verification.map((entry, i) => i ? entry : { ...entry, ...changes }) };
}
// Independent cross-language oracle: Node crypto and serialization, exercised against the Python payload builder.
function expectedRevision(profile) {
  const covered = { ...profile, verification: [...profile.verification].sort((a, b) => a.field.localeCompare(b.field)) };
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return createHash('sha256').update(JSON.stringify(canonical({ policyVersion: 1, profile: covered })), 'utf8').digest('hex');
}

function profilesFile(t, profiles) {
  const file = path.join(tempDir(t), 'profiles.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, profiles }));
  return file;
}
// A temp copy with an explicit flag, independent of the real source's current boolean default.
function packetSource(t, flag) {
  const text = fs.readFileSync(PACKET_SOURCE, 'utf8');
  const flags = text.match(/var FD_CARE_PACKET_ENABLED=(?:true|false);/g) || [];
  assert.equal(flags.length, 1, 'fd_care_packet.js declares exactly one boolean flag');
  const file = path.join(tempDir(t), 'fd_care_packet.js');
  fs.writeFileSync(file, text.replace(flags[0], flag));
  return file;
}
function buildWith(kwargs, args) {
  return py(`print(json.dumps(p.build_payload(${kwargs})))`, args);
}
// check_profiles straight from the validator the payload imports, against the real inserts and governed record.
function checkProfiles(t, profiles, today) {
  const run = py([
    'v = p._validator',
    'load = lambda f: json.loads(open(f, encoding="utf-8").read())',
    'r = v.check_profiles(load(sys.argv[1]), load(v.PROFILES_SCHEMA), load(v.CRISIS), load(v.DATA), v.parse_iso(sys.argv[2]))',
    'print(json.dumps({"errors": r.errors, "warnings": r.warnings}))',
  ].join('\n'), [profilesFile(t, profiles), today]);
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test('every referenced crisis id carries the governed record\'s name, contact and availability, byte for byte', () => {
  const crisis = readJson(CRISIS);
  const built = payload();
  assert.ok(Object.keys(built.contacts).length >= 2);
  for (const [id, entry] of Object.entries(built.contacts)) {
    const governed = crisis.resources.find(resource => resource.id === id);
    assert.ok(governed, `${id} is in crisis_resources.json`);
    assert.deepEqual(entry, { name: governed.name, contact: governed.contact, availability: governed.availability }, id);
  }
});

test('the payload names exactly the crisis ids the data references: none missing, none extra', () => {
  const data = readJson(DATA);
  assert.deepEqual(Object.keys(payload().contacts).sort(), [...referencedIds(data)].sort());
});

test('`required` is the validator\'s pair and each id resolves to a non-empty contact', () => {
  const built = payload();
  assert.deepEqual([...built.required].sort(), ['lifeline_988', 'maine_crisis_line']);
  for (const id of built.required) {
    assert.ok(built.contacts[id], `${id} resolves`);
    assert.ok(String(built.contacts[id].contact).trim().length > 0, `${id} has a contact`);
  }
});

test('the payload is the validated data plus contacts, required, crisis numbers and unit profiles, minus every internal record', () => {
  const data = readJson(DATA);
  const built = payload();
  assert.deepEqual(Object.keys(built).sort(), ['card', 'checkedOn', 'contacts', 'crisis', 'crisisCopy', 'crisisNumbers',
    'generatedAt', 'inserts', 'required', 'unitProfiles']);
  assert.equal(built.generatedAt, data.generatedAt);
  assert.deepEqual(built.crisisCopy, data.crisisCopy);
  assert.deepEqual(built.crisis, data.crisis);
  assert.deepEqual(built.card, data.card);
  // A helpline row ships only what can be printed. Its source URLs and verification date are an
  // internal record ("Neither is ever printed"): a browser that never receives them cannot print them.
  const printable = data.inserts.map(insert => insert.table
    ? { ...insert, table: insert.table.map(({ who, number, what }) => ({ who, number, what })) }
    : insert);
  assert.deepEqual(built.inserts, printable);
  assert.ok(built.inserts.some(insert => insert.table && insert.table.length), 'the helpline tables are present');
  const shipped = JSON.stringify(built);
  for (const key of FORBIDDEN) assert.ok(!shipped.includes(key), `${key} stays out of the payload`);
});

test('a crisis line ships as ref and when only: its official name comes from the governed record, never a label', () => {
  const built = payload();
  assert.ok(built.crisis.length >= 2);
  for (const line of built.crisis) {
    assert.deepEqual(Object.keys(line).sort(), ['ref', 'when'], line.ref);
    assert.ok(built.contacts[line.ref].name, `${line.ref} has its governed name in contacts`);
  }
  assert.ok(built.crisis.length <= 5, 'the wallet card holds at most five lines');
});

test('the wallet card is a separate print: a top-level card, and no card among the packet inserts', () => {
  const built = payload();
  assert.ok(!built.inserts.some(insert => insert.id === 'card'), 'no card insert');
  assert.deepEqual(Object.keys(built.card).sort(), ['body', 'mineTitle', 'rows', 'title']);
  assert.ok(Array.isArray(built.card.rows) && built.card.rows.length >= 1 && built.card.rows.length <= 4);
  assert.ok(built.card.rows.every(row => typeof row === 'string' && row.trim()), 'every write-in row is labelled');
});

test('defaults are the owner\'s set, read from the raw JSON: welcome, first week, warning signs, medicines', () => {
  const raw = readJson(DATA);
  const flags = Object.fromEntries(raw.inserts.map(insert => [insert.id, insert.defaultOn]));
  assert.deepEqual(flags, {
    intro: true, week: true, callback: false, warning: true, safety: false, family: false,
    national: false, insurance: false, meds: true, rights: false, notes: false,
  });
  assert.deepEqual(raw.inserts.filter(insert => insert.core).map(insert => insert.id), ['intro']);
  assert.deepEqual(payload().inserts.map(insert => [insert.id, insert.defaultOn]), raw.inserts.map(insert => [insert.id, insert.defaultOn]));
});

test('crisisNumbers is every registered crisis number, alsoAvailable included, read independently from the governed file', () => {
  const crisis = readJson(CRISIS);
  const built = payload();
  assert.deepEqual(built.crisisNumbers, registeredDigits(crisis));
  assert.ok(built.crisisNumbers.every(n => /^\d{3,}$/.test(n)), 'digits only, three or more');
  const onlyAlso = registeredDigits(crisis).filter(n => !registeredDigits(crisis, ['contact']).includes(n));
  assert.ok(onlyAlso.length > 0, 'the governed file registers a number in alsoAvailable alone (else this test is vacuous)');
  for (const n of onlyAlso) assert.ok(built.crisisNumbers.includes(n), 'an alsoAvailable-only number is shipped');
  for (const contact of Object.values(built.contacts)) {
    for (const n of registeredDigits({ resources: [contact] }, ['contact'])) assert.ok(built.crisisNumbers.includes(n));
  }
});

test('the payload is byte-reproducible: two builds give the same bytes', () => {
  const first = py('print(json.dumps(p.build_payload()))');
  const second = py('print(json.dumps(p.build_payload()))');
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, second.stdout);
});

test('the real profiles file ships as data and none is invented: unitProfiles mirrors it', () => {
  const doc = readJson(PROFILES);
  const built = payload();
  assert.equal(built.unitProfiles.length, doc.profiles.length);
  assert.deepEqual(built.unitProfiles.map(profile => profile.id), doc.profiles.map(profile => profile.id));
});

test('candidate profiles ship exact content, a version digest and ninety calendar days from the oldest actual check; never an approval', t => {
  const data = readJson(DATA);
  const fixture = readJson(FIXTURE);
  const confirmedOn = addDays(data.generatedAt, -30);
  const first = sourceProfile(fixture.profile, data.generatedAt);
  first.verification[0].checkedOn = confirmedOn;
  const source = [first, sourceProfile(fixture.expired, data.generatedAt)];
  const run = buildWith('profiles_path=sys.argv[1]', [profilesFile(t, source)]);
  assert.equal(run.status, 0, run.stderr);
  const built = JSON.parse(run.stdout);
  for (const [i, shipped] of built.unitProfiles.entries()) {
    assert.deepEqual(Object.keys(shipped).sort(), SHIPPED_PROFILE_KEYS);
    const { verification, ...rest } = source[i];
    const { revision, expiresOn, usableThrough, ...content } = shipped;
    assert.deepEqual(content, rest, 'public content remains byte-exact');
    const oldest = verification.map(entry => entry.checkedOn).sort()[0];
    assert.equal(usableThrough, addDays(oldest, 89));
    assert.equal(expiresOn, addDays(oldest, 90));
    assert.equal(revision, expectedRevision(source[i]));
    assert.equal('approved' in shipped, false);
  }
  assert.equal(built.unitProfiles[0].expiresOn, addDays(data.generatedAt, 60));
  for (const key of FORBIDDEN) assert.ok(!run.stdout.includes(key), `${key} stays private`);
});

test('the payload carries the two approved missed-dose bullets and the complete optional callback template', () => {
  const built = payload();
  const meds = built.inserts.find(insert => insert.id === 'meds');
  assert.equal(meds.bullets[2], 'If you miss a dose or have a break from a medicine, follow the instructions for missed doses or restarting in your After Visit Summary. If those instructions are missing or unclear, call your pharmacist or the person who prescribes it before taking it again.');
  assert.equal(meds.bullets[3], 'Do not take extra medicine to catch up on your own. Some medicines need a different dose after even a short break.');
  const callback = built.inserts.find(insert => insert.id === 'callback');
  assert.equal(callback.defaultOn, false);
  assert.equal(built.inserts.find(insert => insert.id === 'safety').defaultOn, false);
  for (const token of ['callbackTeam', 'callbackPhone', 'callbackHours', 'callbackFallback', 'callWindow', 'callDeadline'])
    assert.ok(callback.body.includes('{{' + token + '}}'), `${token} is present in the printed instructions`);
  assert.match(callback.body, /Do not wait for this call/);
  assert.doesNotMatch(JSON.stringify(built.inserts), /2 days or more|we will help you find another way|We can help|prior authorization/);
  for (const id of ['intro', 'meds', 'rights'])
    assert.ok(JSON.stringify(built.inserts.find(insert => insert.id === id)).includes('{{unitContact}}'));
});

test('profile revisions ignore object and verification order, but bind every covered value without normalization', t => {
  const source = sourceProfile(readJson(FIXTURE).profile, readJson(DATA).generatedAt);
  const reversed = Object.fromEntries(Object.entries(source).reverse());
  reversed.verification = [...source.verification].reverse().map(entry => Object.fromEntries(Object.entries(entry).reverse()));
  const build = profile => {
    const run = buildWith('profiles_path=sys.argv[1]', [profilesFile(t, [profile])]);
    assert.equal(run.status, 0, run.stderr);
    return JSON.parse(run.stdout).unitProfiles[0];
  };
  const first = build(source);
  assert.equal(build(reversed).revision, first.revision);
  for (const changed of [{ ...source, unitPurpose: source.unitPurpose + ' ' }, changedCheck(source, { evidence: 'A different direct confirmation' }),
    { ...source, unitPhone: '2075550142' }, { ...source, label: 'Fíxture unit' }]) {
    const result = build(changed);
    assert.notEqual(result.revision, first.revision);
    assert.equal(result.revision, expectedRevision(changed));
    assert.equal(result.expiresOn, first.expiresOn, 'editing content or evidence never refreshes actual check dates');
  }
});

test('the canonical digest covers every profile and evidence field, so none can change under an old approval', () => {
  const source = sourceProfile(readJson(FIXTURE).profile, readJson(DATA).generatedAt);
  const changed = Object.keys(source).filter(key => key !== 'verification').map(key => ({
    ...source, [key]: typeof source[key] === 'boolean' ? !source[key] : source[key] + ' changed',
  }));
  for (let index = 0; index < source.verification.length; index++) {
    for (const key of ['field', 'checkedOn', 'checkedBy', 'evidence']) {
      changed.push({ ...source, verification: source.verification.map((entry, i) => i === index ? { ...entry, [key]: entry[key] + ' changed' } : entry) });
    }
  }
  // This exercises canonical identity alone; schema and semantic validity are exercised through build_payload above.
  const inputs = [source, ...changed];
  const run = py('print(json.dumps([p._validator.profile_revision(profile) for profile in json.loads(sys.argv[1])]))', [JSON.stringify(inputs)]);
  assert.equal(run.status, 0, run.stderr);
  const actual = JSON.parse(run.stdout);
  assert.deepEqual(actual, inputs.map(expectedRevision));
  assert.equal(new Set(actual).size, inputs.length, 'every isolated change invalidates the old revision');
});

test('a profile the validator rejects aborts the build (a registered crisis number as the unit phone)', t => {
  const data = readJson(DATA);
  const tenDigit = registeredDigits(readJson(CRISIS)).find(n => n.length === 10);
  assert.ok(tenDigit, 'the governed record registers a ten-digit line');
  const bad = sourceProfile(readJson(FIXTURE).profile, data.generatedAt, { unitPhone: tenDigit });
  const run = buildWith('profiles_path=sys.argv[1]', [profilesFile(t, [bad])]);
  assert.notEqual(run.status, 0, 'must fail');
  assert.match(run.stderr + run.stdout, /unitPhone/);
  assert.match(run.stderr + run.stdout, /crisis/i);
});

test('activation is coupled to a profile: the flag on with no profile aborts the build; off, or on with one, builds', t => {
  const data = readJson(DATA);
  const none = profilesFile(t, []);
  const one = profilesFile(t, [sourceProfile(readJson(FIXTURE).profile, data.generatedAt)]);
  const off = packetSource(t, FLAG_OFF);
  const on = packetSource(t, FLAG_ON);
  const kwargs = 'profiles_path=sys.argv[1], packet_source_path=sys.argv[2]';

  const offNone = buildWith(kwargs, [none, off]);
  assert.equal(offNone.status, 0, offNone.stderr);
  const onNone = buildWith(kwargs, [none, on]);
  assert.notEqual(onNone.status, 0, 'flag on and no profile must abort');
  assert.match(onNone.stderr + onNone.stdout, /FD_CARE_PACKET_ENABLED/);
  assert.match(onNone.stderr + onNone.stdout, /profile/i);
  const onOne = buildWith(kwargs, [one, on]);
  assert.equal(onOne.status, 0, onOne.stderr);
  assert.equal(JSON.parse(onOne.stdout).unitProfiles.length, 1);
});

test('the activation check fails closed: a respaced or unreadable flag counts as on, a missing module aborts', t => {
  const none = profilesFile(t, []);
  const kwargs = 'profiles_path=sys.argv[1], packet_source_path=sys.argv[2]';
  for (const flag of ['var FD_CARE_PACKET_ENABLED = true;', 'var FD_CARE_PACKET_ENABLED=!0;', 'var FD_CARE_PACKET_ENABLED="true";']) {
    const run = buildWith(kwargs, [none, packetSource(t, flag)]);
    assert.notEqual(run.status, 0, `${flag} must count as on`);
    assert.match(run.stderr + run.stdout, /FD_CARE_PACKET_ENABLED/);
  }
  const twice = path.join(tempDir(t), 'fd_care_packet.js');
  fs.writeFileSync(twice, `${FLAG_OFF}\n${FLAG_OFF}\n`);
  const doubled = buildWith(kwargs, [none, twice]);
  assert.notEqual(doubled.status, 0, 'two declarations cannot be read');
  const missing = buildWith(kwargs, [none, path.join(tempDir(t), 'nope.js')]);
  assert.notEqual(missing.status, 0, 'a missing module cannot be read');
  assert.match(missing.stderr + missing.stdout, /fd_care_packet|nope\.js/);
});

test('the activation default reads the real packet module, whose flag is on', () => {
  const run = py('print(json.dumps([p.PACKET_SOURCE, p.packet_enabled()]))');
  assert.equal(run.status, 0, run.stderr);
  const [source, enabled] = JSON.parse(run.stdout);
  assert.equal(path.resolve(source), path.resolve(PACKET_SOURCE));
  assert.equal(enabled, true);
  assert.equal(fs.readFileSync(PACKET_SOURCE, 'utf8').includes(FLAG_ON), true);
});

test('profile validation matrix (check_profiles against the real inserts and governed record)', t => {
  const data = readJson(DATA);
  const today = data.generatedAt;
  const base = sourceProfile(readJson(FIXTURE).profile, addDays(today, -10));
  const crisisPhone = registeredDigits(readJson(CRISIS)).find(n => n.length === 10);
  const helpline = data.inserts.flatMap(insert => insert.table || []).map(row => row.number)
    .find(number => number.replace(/\D/g, '').length === 11);
  assert.ok(crisisPhone && helpline, 'the matrix reads a crisis line and a helpline from the real data');
  const cases = [
    ['valid', [base], null],
    ['crisis number as the unit phone', [{ ...base, unitPhone: crisisPhone }], /unitPhone.*crisis/],
    ['N11 exchange', [{ ...base, unitPhone: '(207) 411-0142' }], /unitPhone/],
    ['N11 area code', [{ ...base, unitPhone: '(211) 555-0142' }], /unitPhone/],
    ['helpline-table number as the unit phone', [{ ...base, unitPhone: helpline }], /unitPhone.*helpline/],
    ['future confirmation date', [changedCheck(base, { checkedOn: addDays(today, 1) })], /checkedOn.*future/],
    ['markup in unitName', [{ ...base, unitName: 'Fixture Unit <b>' }], /unitName.*markup/],
    ['role containing digits', [changedCheck(base, { checkedBy: 'nurse 2' })], /checkedBy/],
    ['brandingApproved with a null org', [{ ...base, org: null }], /brandingApproved/],
    ['duplicate id', [base, { ...base, unitPhone: '(207) 555-0143' }], /twice/],
    ['resident-rebrand phrase in label', [{ ...base, label: 'MS3 Clerkship unit' }], /label.*resident/],
  ];
  for (const [name, profiles, expected] of cases) {
    const result = checkProfiles(t, profiles, today);
    if (expected) {
      assert.ok(result.errors.length > 0, `${name}: must fail`);
      assert.match(result.errors.join('\n'), expected, name);
    } else {
      assert.deepEqual(result, { errors: [], warnings: [] }, name);
    }
  }
  const stale = checkProfiles(t, [changedCheck(base, { checkedOn: addDays(today, -90) })], today);
  assert.deepEqual(stale.errors, [], 'a stale confirmation is not an error');
  assert.equal(stale.warnings.length, 1);
  assert.match(stale.warnings[0], /90 days/);
});

test('a stale profile warns but still builds, and ships a usableThrough already in the past', t => {
  const data = readJson(DATA);
  const confirmedOn = addDays(data.generatedAt, -200);
  const run = buildWith('profiles_path=sys.argv[1]', [profilesFile(t, [sourceProfile(readJson(FIXTURE).profile, confirmedOn)])]);
  assert.equal(run.status, 0, run.stderr);
  const [shipped] = JSON.parse(run.stdout).unitProfiles;
  assert.equal(shipped.usableThrough, addDays(confirmedOn, 89));
  assert.ok(shipped.usableThrough < data.generatedAt);
});

test('checkedOn is the OLDEST check behind anything printed: a helpline row\'s date or a governed crisis line\'s, never the file date', () => {
  const data = readJson(DATA);
  const crisis = readJson(CRISIS);
  const built = payload();
  const dates = data.inserts.flatMap(insert => (insert.table || []).map(row => row.verifiedDate));
  for (const id of Object.keys(built.contacts)) dates.push(crisis.resources.find(resource => resource.id === id).verifiedOn);
  assert.equal(built.checkedOn, dates.sort()[0]);
  assert.ok(built.checkedOn <= data.generatedAt);
  // The governed crisis lines were verified before the inserts file was assembled, so a footer dated from the file would
  // claim a check that never happened for them.
  assert.ok(built.checkedOn < data.generatedAt, 'the oldest check predates the file (the test would be vacuous otherwise)');
});

test('a crisis reference that does not resolve aborts the build instead of shipping a hole', t => {
  const dir = tempDir(t);
  const data = readJson(DATA);
  data.crisis[0].ref = 'not_a_real_resource';
  const file = path.join(dir, 'data.json');
  fs.writeFileSync(file, JSON.stringify(data));
  const run = py('p.build_payload(data_path=sys.argv[1])', [file]);
  assert.notEqual(run.status, 0, 'must fail');
  assert.match(run.stderr + run.stdout, /not_a_real_resource|crisis/i);
});

test('data the validator rejects aborts the build (a dose literal in patient prose)', t => {
  const dir = tempDir(t);
  const data = readJson(DATA);
  data.inserts.find(insert => insert.id === 'meds').bullets.push('Take 10 mg every morning.');
  const file = path.join(dir, 'data.json');
  fs.writeFileSync(file, JSON.stringify(data));
  const run = py('p.build_payload(data_path=sys.argv[1])', [file]);
  assert.notEqual(run.status, 0, 'must fail');
  assert.match(run.stderr + run.stdout, /dose|10 mg/i);
});

test('a governed record with a blank contact for a required line aborts the build', t => {
  const dir = tempDir(t);
  const crisis = readJson(CRISIS);
  crisis.resources.find(resource => resource.id === 'lifeline_988').contact = '';
  const file = path.join(dir, 'crisis.json');
  fs.writeFileSync(file, JSON.stringify(crisis));
  const run = py('p.build_payload(crisis_path=sys.argv[1])', [file]);
  assert.notEqual(run.status, 0, 'must fail');
  // The failure must be about THIS defect, not an unrelated crash (a missing module also exits non-zero).
  assert.match(run.stderr + run.stdout, /lifeline_988/);
  assert.match(run.stderr + run.stdout, /contact/i);
});

test('injection replaces the shell needle once, escapes markup, and the value parses back unchanged', () => {
  const hostile = { evil: '</script><script>alert(1)</script> <!-- & \u2028 \u2029 "quoted" \\', list: [1, 2, { a: '>' }] };
  const run = py(
    `text = 'a\\n' + ${JSON.stringify(NEEDLE)} + '\\nb'\nout = p.inject(text, json.loads(sys.argv[1]))\nprint(json.dumps({'out': out}))`,
    [JSON.stringify(hostile)],
  );
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout).out;
  assert.ok(!out.includes('</script'), 'no closing script tag');
  assert.ok(!out.includes('<!--'), 'no comment opener');
  assert.ok(!out.includes('\u2028') && !out.includes('\u2029'), 'no raw line separators');
  const match = out.match(/^a\nvar FD_CARE_INSERTS=(.*);\nb$/s);
  assert.ok(match, 'the declaration keeps its shape');
  assert.deepEqual(JSON.parse(match[1]), hostile);
  assert.ok(!out.includes(NEEDLE), 'the null declaration is gone');
});

test('injection aborts when the needle is missing or duplicated', () => {
  for (const [label, text] of [['missing', 'no declaration here'], ['duplicated', `${NEEDLE}\n${NEEDLE}`]]) {
    const run = py(`p.inject(sys.argv[1], {'x': 1})`, [text]);
    assert.notEqual(run.status, 0, `${label} must abort`);
    assert.match(run.stderr + run.stdout, /FD_CARE_INSERTS/);
  }
});

test('the postcondition accepts a declared payload and rejects a shell that never received one', () => {
  const ok = py(`p.assert_injected('x\\nvar FD_CARE_INSERTS={"a":1};\\ny')`);
  assert.equal(ok.status, 0, ok.stderr);
  for (const text of [`x\n${NEEDLE}\ny`, 'x\ny', 'var FD_CARE_INSERTS={};\nvar FD_CARE_INSERTS={};']) {
    const bad = py('p.assert_injected(sys.argv[1])', [text]);
    assert.notEqual(bad.status, 0, JSON.stringify(text));
  }
});

test('the shell declares the needle exactly once and the build wires injection plus its postcondition', () => {
  const shell = fs.readFileSync(SHELL, 'utf8');
  assert.equal(shell.split(NEEDLE).length - 1, 1, 'spa_index.html declares the null needle once');
  const build = fs.readFileSync(path.join(SITE_BUILD, 'build_deploy.py'), 'utf8');
  assert.match(build, /care_inserts_payload\.build_payload\(/);
  assert.match(build, /care_inserts_payload\.inject\(/);
  assert.match(build, /care_inserts_payload\.assert_injected\(/);
  const resident = fs.readFileSync(path.join(SITE_BUILD, 'resident_section.py'), 'utf8');
  assert.match(resident, /care_inserts_payload\.assert_injected\(/, 'the resident build re-asserts the postcondition');
});

// Local-only contract: node --test runs before both builds, so _build/ does not exist in CI. Guard on
// freshness, never existence (tests/_build_freshness.mjs).
for (const site of ['ms3', 'res']) {
  test(`${site}: the built shell serves exactly the payload the builder produces`, t => {
    const stale = staleBuildReason(REPO, site, [
      SHELL, DATA, SCHEMA, PROFILES, PROFILES_SCHEMA, CRISIS, path.join(SITE_BUILD, 'care_inserts_payload.py'), path.join(SITE_BUILD, 'build_deploy.py'),
      path.join(SITE_BUILD, 'resident_section.py'), path.join(SITE_BUILD, 'frontdoor_catalog.py'), path.join(REPO, '13_Faculty_Resources/_automation/validate_care_inserts.py'),
    ]);
    if (stale) return t.skip(stale);
    const html = fs.readFileSync(path.join(REPO, '_build', site, 'index.html'), 'utf8');
    const declared = [...html.matchAll(/var FD_CARE_INSERTS=/g)].length;
    assert.equal(declared, 1, 'one declaration');
    assert.ok(!html.includes(NEEDLE), 'the null declaration did not survive');
    const line = html.split('\n').find(row => row.includes('var FD_CARE_INSERTS='));
    const value = line.slice(line.indexOf('var FD_CARE_INSERTS=') + 'var FD_CARE_INSERTS='.length).replace(/;\s*$/, '');
    assert.deepEqual(JSON.parse(value), payload());
  });
}

// Unapproved branding cannot enter public HTML or the source candidate the owner would approve.
test('unapproved branding must be null; approved branding remains bound to the exact profile', t => {
  const data = readJson(DATA);
  const fixture = readJson(FIXTURE);
  const date = addDays(data.generatedAt, -30);
  const valid = sourceProfile(fixture.profile, date, { id: 'unapproved-unit', brandingApproved: false, org: null });
  const run = buildWith('profiles_path=sys.argv[1]', [profilesFile(t, [valid])]);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).unitProfiles[0].org, null);
  const rejected = buildWith('profiles_path=sys.argv[1]', [profilesFile(t, [{ ...valid, org: 'Sentinel Health System' }])]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /brandingApproved/);
});
