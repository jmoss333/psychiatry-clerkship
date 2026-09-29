// The benchmark names patients the way faculty read them. One patient can be two cases — Dana on
// admission and Dana one week after discharge — so a name resolves through corpus.caseIds, never
// through a scan of display names (benchmarks/interview-room/run.mjs caseForName).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { caseForName } from '../../benchmarks/interview-room/run.mjs';

const pack = JSON.parse(fs.readFileSync(new URL('../../_prototypes/sp-interview/sp-interview.pack.json', import.meta.url), 'utf8'));
const corpus = JSON.parse(fs.readFileSync(new URL('../../benchmarks/interview-room/corpus.json', import.meta.url), 'utf8'));

test('every corpus name resolves through caseIds to a case that carries that name', () => {
  assert.deepEqual(Object.keys(corpus.caseIds).sort(), ['Dana', 'Marcus', 'Ray']);
  for (const name of Object.keys(corpus.caseIds)) assert.equal(caseForName(corpus, pack, name).persona.displayName, name);
  assert.equal(caseForName(corpus, pack, 'Dana').id, 'sp_depression_gated_si_001');
});

test('a second case with the same display name changes nothing, and a stale table fails loudly', () => {
  const twin = { ...JSON.parse(JSON.stringify(pack.cases[0])), id: 'sp_fixture_dana_week_001' };
  const withTwin = { ...pack, cases: [...pack.cases, twin] };
  assert.equal(caseForName(corpus, withTwin, 'Dana').id, 'sp_depression_gated_si_001');
  assert.throws(() => caseForName(corpus, withTwin, 'Quinn'), /unknown persona Quinn: add it to corpus\.caseIds/);
  assert.throws(() => caseForName({ caseIds: { Dana: 'sp_mania_redirect_001' } }, withTwin, 'Dana'), /corpus\.caseIds\.Dana names sp_mania_redirect_001, whose persona is Marcus/);
});
