import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(repo, 'crisis_resources.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Source surfaces that must carry the build marker. The build asserts the same set, so this
// test catches a dropped marker at `node --test` time rather than only at deploy time.
// Scope rule: surfaces where a learner is plausibly DOING risk work — assessing, rehearsing,
// or planning disposition — not reference pages that merely mention suicide.
const MD = '<!-- crisis-block -->';
const HTML = '<!-- crisis-block-html -->';
const shellRelative = '13_Faculty_Resources/_automation/site_build/spa_index.html';
const markedSources = new Map([
  // the governed shell renders protocol sheets, where the learner is doing risk work
  [shellRelative, HTML],
  // direct risk assessment & acute safety
  ['04_Acute_and_Safety/Suicide_Risk_and_Safety_Planning/suicide_risk_safety_planning_inpatient_teaching.md', MD],
  ['14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/suicide_risk_and_safety_pocket_card.md', MD],
  ['04_Acute_and_Safety/Violence_Risk/violence_risk_inpatient_teaching.md', MD],
  ['04_Acute_and_Safety/Agitation_and_Restraint/agitation_restraint_inpatient_teaching.md', MD],
  ['03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md', MD],
  // populations where self-harm risk is core to the page's own teaching
  ['03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md', MD],
  ['03_Core_Topics/Personality/personality_disorders_inpatient_teaching.md', MD],
  ['03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md', MD],
  ['03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md', MD],
  ['03_Core_Topics/Geriatric/geriatric_psychiatry_inpatient_teaching.md', MD],
  ['03_Core_Topics/Eating_Disorders/eating_disorders_inpatient_teaching.md', MD],
  ['03_Core_Topics/Dissociative/dissociative_disorders_inpatient_teaching.md', MD],
  ['03_Core_Topics/Adjustment/adjustment_disorders_inpatient_teaching.md', MD],
  ['03_Core_Topics/Perinatal/perinatal_psychiatry_inpatient_teaching.md', MD],
  // bedside work & disposition — peri-discharge is the highest-risk window
  ['02_Clinical_Skills/Brief_Psychotherapy/brief_psychotherapy_inpatient.md', MD],
  ['14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/family_discharge_student_module.md', MD],
  ['06_Family_and_Relational/family_meeting_playbook_90min.md', MD],
  ['06_Family_and_Relational/collateral_micro_workflow.md', MD],
  ['03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md', MD],
  // Case-of-the-Week pages that rehearse risk work. The MS3 files reach build_deploy.py's md
  // loop via its _cotw_slug(w,'ms3') entries; the resident files do not — see the note below.
  ['08_Cases_and_Simulation/case-of-the-week/2026-07-23_suicide-risk-assessment-safety-planning_MS3.md', MD],
  ['08_Cases_and_Simulation/case-of-the-week/2026-08-10_anxiety-panic-disorder_MS3.md', MD],
  ['08_Cases_and_Simulation/case-of-the-week/2026-08-27_borderline-personality-disorder_MS3.md', MD],
  ['08_Cases_and_Simulation/case-of-the-week/2026-07-23_suicide-risk-assessment-safety-planning_Resident.md', MD],
  // resident-only Case-of-the-Week pages that rehearse risk work. These do NOT reach
  // build_deploy.py's md loop — resident_section.py writes them fresh from source and runs
  // its own crisis_block.inject_markdown pass, gated by _CRISIS_REQUIRED_RES_MD there.
  ['08_Cases_and_Simulation/case-of-the-week/2026-08-10_anxiety-panic-disorder_Resident.md', MD],
  ['08_Cases_and_Simulation/case-of-the-week/2026-08-27_borderline-personality-disorder_Resident.md', MD],
  // tools where the learner is actively assessing or rehearsing risk
  ['04_Acute_and_Safety/Suicide_Risk_and_Safety_Planning/columbia-cssrs-screener.html', HTML],
  ['04_Acute_and_Safety/Violence_Risk/violence-risk-one-pager.html', HTML],
  // PHQ-9 item 9 is itself a suicide-risk screen; the tool escalates its band on it
  ['02_Clinical_Skills/Screeners/screeners.html', HTML],
  ['_prototypes/sp-interview/sp-interview.html', HTML],
  ['02_Clinical_Skills/Communication_Practice/communication-practice.html', HTML],
  ['06_Family_and_Relational/family-systems-practice.html', HTML],
  ['08_Cases_and_Simulation/one-patient-six-weeks.html', HTML],
]);

// Front Door modules can feed the Safety Kit without carrying the build marker themselves. Scan
// every module, not only the marked shell, so moving a hand-maintained contact into a renderer or
// controller cannot bypass the source-of-truth guard.
const frontDoorRelative = '13_Faculty_Resources/_automation/site_build/frontdoor';
const frontDoorSafetySources = fs.readdirSync(path.join(repo, frontDoorRelative))
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.posix.join(frontDoorRelative, name));
const scannedSafetySources = [...new Set([...markedSources.keys(), ...frontDoorSafetySources])];

function compactContact(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function canonicalContactFields() {
  return data.resources.flatMap((resource) => ['contact', 'alsoAvailable']
    .filter((field) => typeof resource[field] === 'string' && resource[field].trim())
    .map((field) => ({ id: resource.id, field, value: resource[field] })));
}

function canonicalContactSignatures(entry) {
  const signatures = new Set([compactContact(entry.value)]);
  for (const match of entry.value.match(/\d(?:[\d\s()+.\-/]*\d)?/g) || []) {
    const digits = match.replace(/\D/g, '');
    if (digits.length >= 3) signatures.add(digits);
  }
  return [...signatures].filter((signature) => signature.length >= 3);
}

// A digit signature like "988" or "911" is only three characters, so testing it against a
// whole-file alphanumeric compaction fires on any incidental adjacency. Bibliographies are full
// of them: 10.1038/s41598-021-99882-w spells 988, and 2018;48(7):1119-1127 spells 911. Match
// digit signatures against the ORIGINAL text instead, allowing punctuation or spacing between the
// digits so "9 8 8" is still caught, but requiring the run to stand alone rather than sit inside a
// longer number. The full compacted contact string stays a whole-text check — it is long and
// specific enough not to collide.
function digitRunPattern(digits) {
  return new RegExp(`(?<!\\d)${digits.split('').join('[^a-z0-9]*')}(?![^a-z0-9]*\\d)`, 'i');
}

function canonicalContactLeaks(text) {
  const source = String(text || '');
  const compactSource = compactContact(source);
  return canonicalContactFields().filter((entry) =>
    canonicalContactSignatures(entry).some((signature) => (/^\d+$/.test(signature)
      ? digitRunPattern(signature).test(source)
      : compactSource.includes(signature))));
}

const requiredContactIds = [
  'lifeline_988',
  'crisis_text_line',
  'maine_crisis_line',
  'emergency_911',
];

test('every required crisis contact is present with a non-empty canonical contact', () => {
  for (const id of requiredContactIds) {
    const resource = data.resources.find((r) => r.id === id);
    assert.ok(resource, `crisis_resources.json is missing required resource "${id}"`);
    assert.equal(typeof resource.contact, 'string', `resource "${id}" contact must be a string`);
    assert.ok(resource.contact.trim(), `resource "${id}" contact must not be empty`);
  }
});

test('canonical contact uses the independently verified value, not the stale upstream value', () => {
  for (const discrepancy of data.upstreamDiscrepancies) {
    const resource = data.resources.find((item) =>
      item.reconnectRecord === discrepancy.reconnectRecord);
    assert.ok(resource, `missing resource for discrepancy ${discrepancy.reconnectRecord}`);
    assert.ok(resource.contact.includes(discrepancy.verifiedValue));
    assert.ok(!resource.contact.includes(discrepancy.upstreamValue));
  }
});

test('every resource carries an official https verification source and date', () => {
  for (const resource of data.resources) {
    assert.match(
      resource.verificationSource,
      /^https:\/\//,
      `resource "${resource.id}" needs an https verification source`,
    );
    assert.match(
      resource.verifiedOn,
      /^\d{4}-\d{2}-\d{2}$/,
      `resource "${resource.id}" needs an ISO verifiedOn date`,
    );
  }
});

test('provenance points at ReConnect and forbids unreviewed sync', () => {
  assert.equal(data.provenance.relation, 'derived-and-independently-verified');
  assert.equal(data.provenance.syncPolicy, 'manual-reviewed-only');
  assert.match(data.provenance.upstreamRepository, /reconnect-psychiatry-system/);
});

test('each required safety surface still carries its build marker', () => {
  for (const [relative, marker] of markedSources) {
    const full = path.join(repo, relative);
    assert.ok(fs.existsSync(full), `expected safety surface missing: ${relative}`);
    const text = fs.readFileSync(full, 'utf8');
    assert.ok(
      text.includes(marker),
      `${relative} lost its "${marker}" marker — the crisis block would silently disappear`,
    );
  }
});

test('the source shell carries exactly one HTML marker and no canonical contact copy', () => {
  const text = fs.readFileSync(path.join(repo, shellRelative), 'utf8');
  assert.equal(text.split(HTML).length - 1, 1,
    'the shell build must have exactly one unambiguous crisis injection point');
  for (const resource of data.resources) {
    assert.ok(!text.includes(resource.contact),
      `the source shell hand-maintains the contact for "${resource.id}"`);
  }
});

function runRequiredShellInjection(targets) {
  const helper = path.join(repo, '13_Faculty_Resources', '_automation', 'site_build');
  const program = [
    'import json, os, sys',
    'sys.path.insert(0, sys.argv[1])',
    'import crisis_block',
    'data = crisis_block.load(sys.argv[2])',
    'for target in sys.argv[3:]:',
    '    crisis_block.inject_required_html_file(target, data, "shell index")',
  ].join('\n');
  return spawnSync('python3', ['-c', program, helper, repo, ...targets], {
    cwd: repo,
    encoding: 'utf8',
  });
}

function runOrderedShellPipeline(root, {
  sourceMarkerCount = 1,
  ms3LateMarker = false,
  residentLateMarker = false,
} = {}) {
  const helper = path.join(repo, '13_Faculty_Resources', '_automation', 'site_build');
  const ms3 = path.join(root, 'ms3');
  const resident = path.join(root, 'resident');
  const snippet = path.join(root, 'test-snippet.js');
  fs.mkdirSync(ms3, { recursive: true });
  fs.writeFileSync(snippet, ms3LateMarker ? HTML : 'var orderedShellFixture=true;');
  fs.writeFileSync(path.join(ms3, 'index.html'), [
    '<!doctype html><html><head></head><body>',
    HTML.repeat(sourceMarkerCount),
    '<script>/*__TEST_CRISIS_LATE__*/</script>',
    '<main id="content"></main></body></html>',
  ].join(''));

  const program = [
    'import os, shutil, sys',
    'sys.path.insert(0, sys.argv[1])',
    'import common, crisis_block',
    'ms3, resident, snippet = sys.argv[3], sys.argv[4], sys.argv[5]',
    'data = crisis_block.load(sys.argv[2])',
    'common.SNIPPET_MARKERS = {"/*__TEST_CRISIS_LATE__*/": snippet}',
    'common.apply_full_page_pass(ms3)',
    'crisis_block.inject_required_html_file(os.path.join(ms3, "index.html"), data, "MS3 shell index")',
    'crisis_block.assert_no_html_marker_file(os.path.join(ms3, "index.html"), "final MS3 shell index")',
    'shutil.copytree(ms3, resident)',
    'common.apply_full_page_pass(resident)',
    'if sys.argv[6] == "1":',
    '    with open(os.path.join(resident, "index.html"), "a", encoding="utf-8") as handle:',
    '        handle.write(crisis_block.HTML_MARKER)',
    'crisis_block.assert_no_html_marker_file(os.path.join(resident, "index.html"), "final resident shell index")',
  ].join('\n');
  return spawnSync('python3', [
    '-c', program, helper, repo, ms3, resident, snippet, residentLateMarker ? '1' : '0',
  ], { cwd: repo, encoding: 'utf8' });
}

test('the required shell pass renders canonical contacts into both built indices', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-crisis-build-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = fs.readFileSync(path.join(repo, shellRelative), 'utf8');
  const targets = ['ms3', 'res'].map((site) => {
    const target = path.join(root, site, 'index.html');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, source);
    return target;
  });

  const result = runRequiredShellInjection(targets);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  for (const target of targets) {
    const built = fs.readFileSync(target, 'utf8');
    assert.ok(!built.includes(HTML), `${target} retained an unexpanded crisis marker`);
    for (const resource of data.resources) {
      assert.ok(built.includes(resource.contact),
        `${target} omitted the canonical contact for "${resource.id}"`);
    }
  }
});

test('the required shell pass hard-fails a missing or duplicate marker', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-crisis-count-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, source, count] of [
    ['missing', '<main></main>', 0],
    ['duplicate', `${HTML}${HTML}`, 2],
  ]) {
    const target = path.join(root, `${name}.html`);
    fs.writeFileSync(target, source);
    const result = runRequiredShellInjection([target]);
    assert.notEqual(result.status, 0, `${name} marker count must abort the build`);
    assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(`found ${count}`));
  }
});

test('shell enforcement runs after shared snippets and gates both final audience indices', () => {
  const build = fs.readFileSync(path.join(
    repo, '13_Faculty_Resources', '_automation', 'site_build', 'build_deploy.py'), 'utf8');
  const resident = fs.readFileSync(path.join(
    repo, '13_Faculty_Resources', '_automation', 'site_build', 'resident_section.py'), 'utf8');
  const fullPass = build.indexOf('common.apply_full_page_pass(OUT');
  const expansion = build.indexOf('_crisis.inject_required_html_file(OUT+"/index.html"');
  const ms3Final = build.indexOf('_crisis.assert_no_html_marker_file(OUT+"/index.html"');
  const ms3Contract = build.indexOf('common.assert_page_contract(OUT, label="ms3")');
  assert.ok(fullPass > -1 && fullPass < expansion,
    'MS3 shell expansion must observe markers introduced by shared-snippet injection');
  assert.ok(expansion < ms3Final && ms3Final < ms3Contract,
    'the final MS3 marker gate must run after expansion and before the page contract');

  const residentPayload = resident.indexOf('frontdoor_catalog.inject_frontdoor_payload(');
  const residentFinal = resident.indexOf('_crisis.assert_no_html_marker_file(OUT+"/index.html"');
  const residentContract = resident.indexOf('common.assert_page_contract(OUT, label="resident")');
  assert.ok(residentPayload > -1 && residentPayload < residentFinal,
    'resident marker cleanliness must be checked after its final shell payload transform');
  assert.ok(residentFinal < residentContract,
    'the final resident marker gate must precede the resident page contract');
});

test('actual shared-pass ordering accepts one source marker and rejects zero, duplicates, and late markers', (t) => {
  const cases = [
    { name: 'clean twin build', expected: 0 },
    {
      name: 'missing source marker', sourceMarkerCount: 0, expected: 1,
      failure: /expected exactly one .* marker \(found 0\)/,
    },
    {
      name: 'duplicate source marker', sourceMarkerCount: 2, expected: 1,
      failure: /expected exactly one .* marker \(found 2\)/,
    },
    {
      name: 'MS3 shared snippet adds a late marker', ms3LateMarker: true, expected: 1,
      failure: /expected exactly one .* marker \(found 2\)/,
    },
    {
      name: 'resident transform adds a late marker', residentLateMarker: true, expected: 1,
      failure: /expected no unexpanded .* markers \(found 1\)/,
    },
  ];
  for (const entry of cases) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ordered-shell-crisis-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const result = runOrderedShellPipeline(root, entry);
    if (entry.expected === 0) {
      assert.equal(result.status, 0, `${entry.name}\n${result.stdout}\n${result.stderr}`);
      for (const audience of ['ms3', 'resident']) {
        const built = fs.readFileSync(path.join(root, audience, 'index.html'), 'utf8');
        assert.equal(built.includes(HTML), false, `${entry.name}: ${audience} retained a marker`);
      }
    } else {
      assert.notEqual(result.status, 0, `${entry.name} must abort the ordered shell pipeline`);
      assert.match(`${result.stdout}\n${result.stderr}`, entry.failure,
        `${entry.name} must fail for its marker-count postcondition`);
    }
  }
});

test('the source guard recognizes canonical contact and alsoAvailable formatting variants', () => {
  const fields = canonicalContactFields();
  assert.ok(fields.some((entry) => entry.field === 'alsoAvailable'),
    'fixture premise: alternate contact routes must participate in the guard');
  for (const entry of fields) {
    assert.ok(canonicalContactLeaks(entry.value).length,
      `${entry.id}.${entry.field}: exact canonical value must be detected`);
    const reformatted = [...entry.value].join(' . ');
    assert.ok(canonicalContactLeaks(reformatted).length,
      `${entry.id}.${entry.field}: punctuation/spacing variants must be detected`);
  }
});

test('no marked surface or Front Door module hand-maintains a crisis contact inline', () => {
  for (const relative of scannedSafetySources) {
    const text = fs.readFileSync(path.join(repo, relative), 'utf8');
    const leaks = canonicalContactLeaks(text);
    assert.deepEqual(leaks, [],
      `${relative} hard-codes canonical contact fields: ${leaks.map((leak) =>
        `${leak.id}.${leak.field}`).join(', ')}`);
  }
});
