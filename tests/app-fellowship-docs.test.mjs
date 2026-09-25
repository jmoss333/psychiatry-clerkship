import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs/app-fellowship');
const read = (name) => fs.readFileSync(path.join(docs, name), 'utf8');

test('the implementation register carries G01-G42 exactly once with separate evidence states', () => {
  const status = read('implementation-status.md');
  assert.match(status,
    /Software state \| Clinical-content state \| Local-policy dependency \| Observation dependency \| Verification evidence \| Remaining action/);
  for (let n = 1; n <= 42; n += 1) {
    const id = `G${String(n).padStart(2, '0')}`;
    assert.equal((status.match(new RegExp(`\\| ${id} \\|`, 'g')) || []).length, 1, id);
  }
  const ids = status.match(/\| G\d{2} \|/g) || [];
  assert.equal(ids.length, 42);
  assert.match(status, /implemented/);
  assert.match(status, /drafted/);
  assert.match(status, /requires faculty input/);
  assert.match(status, /requires institutional policy/);
  assert.match(status, /requires real observation/);
});

test('all four faculty packets name gaps, authoritative sources, decisions, and release conditions', () => {
  const packets = [
    'faculty-review-packets/role-supervision-observation.md',
    'faculty-review-packets/medical-assessment-and-results.md',
    'faculty-review-packets/medication-workflows.md',
    'faculty-review-packets/documentation-consult-transition.md',
  ];
  for (const packet of packets) {
    const body = read(packet);
    assert.match(body, /Gap IDs/);
    assert.match(body, /Canonical repository sources/);
    assert.match(body, /Authoritative sources rechecked/);
    assert.match(body, /Faculty decisions required/);
    assert.match(body, /Institutional decisions required/);
    assert.match(body, /Conditions for learner release/);
    assert.match(body, /https:\/\//);
    assert.doesNotMatch(body, /clinical review owner: (?!unassigned)/i,
      `${packet} must not assign a human owner without agreement`);
    for (const match of body.matchAll(/`([^`]*\/[^`]*)`/g)) {
      assert.equal(fs.existsSync(path.join(root, match[1])), true,
        `${packet} references missing repository path ${match[1]}`);
    }
  }
});

test('policy and pilot records remain undecided rather than implying local approval', () => {
  const policy = read('local-policy-questions.md');
  const pilot = read('pilot-decision-record.md');
  assert.match(policy, /No local answer is supplied/i);
  assert.match(pilot, /Decision status: not decided/i);
  assert.match(pilot, /Production host.*not decided/i);
  assert.match(pilot, /Pilot population.*not decided/i);
  assert.match(pilot, /Observation staffing.*not decided/i);
  assert.match(pilot, /Clinical release.*not decided/i);
  assert.doesNotMatch(pilot, /\|\s*(?:approved|ready for production)\s*\|/i);
});

test('draft scenario shells are unshipped, nonoperational, and contain no learner feedback', () => {
  const names = [
    'draft-scenarios/pa-formulation-follow-through.json',
    'draft-scenarios/pmhnp-medical-consult.json',
  ];
  for (const name of names) {
    const data = JSON.parse(read(name));
    assert.equal(data.status, 'faculty-review-draft');
    assert.equal(data.learnerRelease, false);
    assert.equal(data.clinicalFeedbackStatus, 'withheld-pending-faculty-review');
    assert.ok(Array.isArray(data.gapIds) && data.gapIds.length > 0);
    assert.ok(Array.isArray(data.facultyQuestions) && data.facultyQuestions.length > 0);
    assert.equal(Object.hasOwn(data, 'feedback'), false);
    assert.doesNotMatch(JSON.stringify(data), /\b(?:mg|mcg|mL)\b/i);
  }

  const producerFiles = [
    'curriculum.json',
    '13_Faculty_Resources/_automation/site_build/common.py',
    '13_Faculty_Resources/_automation/site_build/spa_index.html',
    '13_Faculty_Resources/_automation/site_build/site_manifest.json',
    '13_Faculty_Resources/_automation/site_build/site_extras.py',
  ];
  for (const rel of producerFiles) {
    const body = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.doesNotMatch(body, /pa-formulation-follow-through|pmhnp-medical-consult/);
  }
});

test('the research backlog separates research, faculty review, policy, and observation work', () => {
  const body = read('research-backlog.md');
  for (const label of ['Evidence research', 'Faculty content review', 'Institutional policy', 'Real observation']) {
    assert.match(body, new RegExp(label));
  }
  assert.match(body, /Re-opened 2026-09-22/);
});
