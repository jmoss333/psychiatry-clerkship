import assert from 'node:assert/strict';
import fs from 'node:fs';
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
const markedSources = new Map([
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
  // tools where the learner is actively assessing or rehearsing risk
  ['04_Acute_and_Safety/Suicide_Risk_and_Safety_Planning/columbia-cssrs-screener.html', HTML],
  ['_prototypes/sp-interview/sp-interview.html', HTML],
  ['02_Clinical_Skills/Communication_Practice/communication-practice.html', HTML],
  ['06_Family_and_Relational/family-systems-practice.html', HTML],
  ['08_Cases_and_Simulation/one-patient-six-weeks.html', HTML],
]);

// Verified 2026-07-27 against the official source recorded on each record.
const requiredContacts = new Map([
  ['lifeline_988', '988'],
  ['crisis_text_line', '741741'],
  ['maine_crisis_line', '1-888-568-1112'],
  ['emergency_911', '911'],
]);

test('every required crisis contact is present with the verified number', () => {
  for (const [id, expected] of requiredContacts) {
    const resource = data.resources.find((r) => r.id === id);
    assert.ok(resource, `crisis_resources.json is missing required resource "${id}"`);
    assert.ok(
      resource.contact.includes(expected),
      `resource "${id}" contact "${resource.contact}" does not contain "${expected}"`,
    );
  }
});

test('Crisis Text Line uses the official HOME keyword, not the stale upstream HELLO', () => {
  const ctl = data.resources.find((r) => r.id === 'crisis_text_line');
  assert.match(ctl.contact, /\bHOME\b/);
  assert.doesNotMatch(ctl.contact, /\bHELLO\b/);
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

test('no safety surface hand-maintains a crisis number inline', () => {
  // The whole point of the single source of truth: numbers live in crisis_resources.json only.
  for (const relative of markedSources.keys()) {
    const text = fs.readFileSync(path.join(repo, relative), 'utf8');
    assert.doesNotMatch(
      text,
      /741741|568-1112/,
      `${relative} hard-codes a crisis number — it must come from crisis_resources.json`,
    );
  }
});
