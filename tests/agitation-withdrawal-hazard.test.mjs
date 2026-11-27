// Simulator red-team AG-1 (2026-11-25, Critical): in the alcohol-withdrawal scenario an
// antipsychotic alone scored "Reasonable class-level choice", because the SGA and typical
// entries carried no `withdrawal` hazard, so pharmVerdict fell through to "good". The
// scenario's own teaching point says antipsychotics are adjuncts, not monotherapy.
// This pins the pairing in both agitation packs and both previews that inline them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const PACKS = ['_prototypes/agitation-trainer/rp-agitation.pack.json',
  '_prototypes/agitation-trainer/agitation.pack.json'];
const ANTIPSYCHOTIC_ONLY = ['sga', 'd2_typical'];

for (const p of PACKS) {
  test(`${p}: an antipsychotic alone is a hazard in alcohol or sedative withdrawal`, () => {
    const pack = JSON.parse(read(p));
    const choices = pack.choiceBanks.pharmApproach;
    for (const id of ANTIPSYCHOTIC_ONLY) {
      const c = choices.find((x) => x.id === id);
      assert.ok(c, `${id} present`);
      assert.match(c.hazardIf?.withdrawal || '', /benzodiazepine/i, `${id} names benzodiazepine treatment of withdrawal`);
    }
    const scen = pack.content.scenarios.filter((s) => s.trueEtiology === 'withdrawal');
    assert.ok(scen.length >= 1, 'the withdrawal scenario still exists, so the hazard is reachable');
  });
}

test('both previews inline the withdrawal hazard', () => {
  for (const p of ['_prototypes/agitation-trainer/rp-agitation.preview.html',
    '_prototypes/agitation-trainer/agitation-trainer.preview.html']) {
    const n = (read(p).match(/"withdrawal": "Not a substitute for withdrawal treatment/g) || []).length;
    assert.equal(n, 2, `${p}: SGA and typical both carry it`);
  }
});
