import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { staleBuildReason } from './_build_freshness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (level) => `08_Cases_and_Simulation/case-of-the-week/2026-10-12_suicide-risk-assessment-safety-planning_${level}.md`;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const ledgerPath = '13_Faculty_Resources/reviewed.json';
const cases = [
  { site: 'ms3', level: 'MS3', slug: 'cotw_20261012_safety_ms3.md', references: 10 },
  { site: 'res', level: 'Resident', slug: 'cotw_20261012_safety_res.md', references: 14 },
];

function assertClinicalHigh(row) {
  assert.deepEqual(row.risk, { kind: 'clinical', level: 'high' });
}

function assertCitationBindings(text, file, annotations, registry) {
  const pmids = [...text.matchAll(/PMID: (\d+)\./g)].map((m) => m[1]);
  for (const pmid of pmids) {
    const record = registry.sources.find((s) => s.citation.pmid === pmid);
    assert.ok(record, `${file}: no source record for PMID ${pmid}`);
    const annotation = annotations.annotations.find((a) => a.sourceId === record.id);
    assert.ok(annotation?.verifiedAgainst?.sourceSpan?.length >= 80, `${record.id}: missing source span`);
    assert.ok(annotation.claims.some((c) => c.usedBy.includes(file)), `${record.id}: missing case claim binding`);
  }
  return pmids.length;
}

for (const c of cases) {
  test(`${c.site}: safety content remains clinical/high independent of faculty review status`, () => {
    const row = json(ledgerPath)[c.slug];
    assertClinicalHigh(row);
    // Exercise pending presentation with a controlled fixture, never pin the live review status.
    const fixture = { ...row, status: 'pending', by: 'Pending faculty review', reason: 'Synthetic review pending' };
    const result = spawnSync('python3', ['-c', [
      'import json, sys',
      'from surface_governance import presentation_entry',
      'print(json.dumps(presentation_entry(sys.argv[1], "page", json.loads(sys.argv[2]))))',
    ].join('\n'), c.slug, JSON.stringify(fixture)], {
      cwd: path.join(ROOT, '13_Faculty_Resources/_automation'), encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const presentation = JSON.parse(result.stdout);
    assert.equal(presentation.riskLevel, 'high');
    assert.match(presentation.warning, /high-risk clinical teaching/);
    assert.match(presentation.warning, /supervising clinician/);
  });

  test(`${c.site}: every case citation has an original span and a case-bound claim`, () => {
    assert.equal(assertCitationBindings(read(source(c.level)), source(c.level),
      json('evidence_annotations.json'), json('evidence_registry.json')), c.references);
  });

  test(`${c.site}: built case carries high-risk warning data and crisis contacts`, (t) => {
    const reason = staleBuildReason(ROOT, c.site, [source(c.level), ledgerPath,
      '13_Faculty_Resources/_automation/site_build/build_deploy.py',
      '13_Faculty_Resources/_automation/site_build/resident_section.py',
      '13_Faculty_Resources/_automation/surface_governance.py', 'crisis_resources.json',
    ].map((p) => path.join(ROOT, p)));
    if (reason) return t.skip(reason);
    const page = read(`_build/${c.site}/content/${c.slug}`);
    const governance = json(`_build/${c.site}/governance.json`).items[c.slug];
    assert.equal(governance.riskKind, 'clinical');
    assert.equal(governance.riskLevel, 'high');
    if (governance.status === 'pending') {
      // Markdown warnings are rendered by the reader from governance.json, not injected
      // into the raw .md file. Direct tool HTML has a different injection path.
      assert.match(governance.warning, /high-risk clinical teaching/);
      assert.match(governance.warning, /Verify decisions with your supervising clinician/);
    }
    assert.match(page, /crisis-block-hook/);
    assert.match(page, /not yet determined|does not establish a safe disposition/);
    assert.match(page, /https:\/\/suicidesafetyplan\.com\//);
  });
}

test('MS3 diagnosis, history and antidepressant treatment stay provisional', () => {
  const text = read(source('MS3'));
  assert.match(text, /does not establish depressed mood or anhedonia/);
  assert.match(text, /PHQ-9 19 alone does not diagnose MDD/);
  assert.match(text, /do not initiate an SSRI solely from this stem or the PHQ-9 total/i);
  assert.match(text, /Prior attempts, current intent and plan.*remain to be elicited/);
  assert.match(text, /prior mania\/hypomania.*this history is not supplied/);
  assert.doesNotMatch(text, /≥2 weeks of low mood|against.*no prior attempts|none elicited|initiate an SSRI \(e\.g\./);
});

test('resident case does not turn sober denial or a suspected diagnosis into discharge clearance', () => {
  const text = read(source('Resident'));
  assert.match(text, /Possible borderline personality disorder/);
  assert.match(text, /does not establish the full diagnostic criteria/);
  assert.match(text, /Current denial of intent and clinical sobriety do not establish/);
  assert.match(text, /not yet determined by the stem/);
  assert.match(text, /Possible major depressive episode/);
  assert.match(text, /neither trauma exposure nor dissociation is supplied/);
  assert.match(text, /only the assessment and mitigation actually completed/);
  assert.match(text, /do not assume the roommate can take this role/);
  assert.doesNotMatch(text, /now returning toward baseline|given receding acute drivers|dose-response in quality|roommate-verified storage|protective value \(none\)/);
});

test('study claims preserve uncertainty, study design and negative outcomes', () => {
  for (const c of cases) {
    const text = read(source(c.level));
    assert.match(text, /nonrandomized VA ED cohort/);
    assert.match(text, /no significant effect on ideation/);
    assert.match(text, /not reduced depression symptoms/);
    assert.match(text, /qualitative study did not measure a reduction in suicide deaths/);
    assert.match(text, /four of six studies at high risk of bias/);
    assert.match(text, /could not establish an effect on suicide deaths/);
    assert.doesNotMatch(text, /meta-analysis confirms|triple follow-up engagement|not patient refusal/);
  }
});

test('regressions are rejected: moderate risk and a reference list without source claims', () => {
  assert.throws(() => assertClinicalHigh({ risk: { kind: 'clinical', level: 'moderate' } }));
  const annotations = json('evidence_annotations.json');
  const siry = annotations.annotations.find((a) => a.sourceId === 'siry-2021-lethal-means-clinician-views');
  siry.claims.forEach((c) => { c.usedBy = []; });
  assert.throws(() => assertCitationBindings(read(source('Resident')), source('Resident'),
    annotations, json('evidence_registry.json')), /missing case claim binding/);
});
