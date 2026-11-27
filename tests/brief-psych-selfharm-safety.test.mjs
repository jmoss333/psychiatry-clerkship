// Simulator red-team BP-1 (2026-11-25, Critical): the Brief Psych Coach routed "Just
// self-harmed or nearly did" straight to a chain-analysis script, skipping the injury or
// ingestion check, the call to the team and the risk and observation reassessment. This
// pins the safety-first gate in the pack and the tool that reads it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const pack = JSON.parse(read('_prototypes/brief-psych/rp-brief-psych.pack.json'));
const HTML = read('_prototypes/brief-psych/rp-brief-psych.html');

test('the self-harm cue goes through a medical and safety check before its technique', () => {
  const cue = pack.content.cues.find((c) => c.id === 'cue-selfharm');
  assert.ok(cue, 'cue-selfharm present');
  assert.equal(cue.safetyFirst, true);
  const gate = pack.incidentSafety;
  assert.equal(gate.cueId, 'cue-selfharm');
  const steps = gate.steps.join(' ');
  assert.match(steps, /injury|wound/i, 'checks the injury');
  assert.match(steps, /ingestion|taken/i, 'checks for an ingestion');
  assert.match(steps, /attending|resident/i, 'tells the team');
  assert.match(steps, /observation/i, 'reassesses the observation level');
  assert.ok(gate.continueLabel, 'a clear way on to the technique once safe');
});

test('the tool stops on the gate unless the learner has cleared it', () => {
  assert.match(HTML, /if\(cue\.safetyFirst&&!cleared&&pack\.incidentSafety\)\{[^}]*setPhase\('incident'\)/);
  assert.match(HTML, /phase==='incident'&&pack\.incidentSafety/);
  assert.match(HTML, /openCue\(c,true\)/, 'only the gate itself passes cleared=true');
  assert.equal((HTML.match(/openCue\([^)]*true\)/g) || []).length, 1);
});
