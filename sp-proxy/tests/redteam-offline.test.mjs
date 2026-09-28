// bin/redteam-offline.mjs — the Interview Room's deterministic gate-integrity checks — derives
// its case table from the pack. Two kinds of check run: S1–S3, AUTOMATIC over every reviewed
// case and gate (small talk opens nothing, every gate is wired to things that exist, no gate
// opens on a euphemism), and the hand-written B/C/M probes for the cases they name.
//
// Decision sp-redteam-signoff-retired (2026-09-27, Joshua Moss, MD): a reviewed case or gate with
// no HAND-WRITTEN probe is named, never failed — from 2026-09-26 to 2026-09-27 it failed the run,
// which forced every new case through three PRs. These tests break each guard on purpose: every
// S check must turn the run red when its rule is violated, a failing hand-written probe must turn
// it red, a new reviewed case with no hand-written probe must pass with its name printed, and a
// case that is in the pack but not reviewed must SKIP its probes (reported), never pass them.
//
// This suite lives under sp-proxy/tests, not tests/, on purpose: the runner imports the proxy's
// sp.mjs, which imports @netlify/blobs from sp-proxy/node_modules, and the learner-site Netlify
// builds run `node --test tests/*.test.mjs` dependency-free (no npm install) before either site
// builds. A root test that spawns the runner failed both deploy previews in under a minute on
// 2026-09-26; here it runs where the engine's dependencies are guaranteed (`npm --prefix
// sp-proxy test`, a CI step and a verify.sh step).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(REPO, 'bin', 'redteam-offline.mjs');
const PACK = path.join(REPO, '_prototypes', 'sp-interview', 'sp-interview.pack.json');
const MORGAN = 'sp_alcohol_ambivalence_001';

function run(args) {
  const proc = spawnSync('node', [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8', timeout: 120_000 });
  // A spawn error (timeout, ENOENT) would otherwise read as "expected 0, got null" with no cause.
  assert.equal(proc.error, undefined, `spawn failed: ${proc.error && proc.error.message}`);
  return { status: proc.status, out: `${proc.stdout}\n${proc.stderr}` };
}

function fixturePack(t, mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'redteam-offline-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const pack = JSON.parse(fs.readFileSync(PACK, 'utf8'));
  mutate(pack);
  const file = path.join(dir, 'pack.json');
  fs.writeFileSync(file, JSON.stringify(pack));
  return file;
}

test('the real pack passes, S1–S3 range over every reviewed gate, and every reviewed case is driven — Morgan by the M series', () => {
  const r = run([]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /\d+\/\d+ deterministic checks pass/);
  for (const id of ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7']) assert.match(r.out, new RegExp(`^pass  ${id}  `, 'm'), `${id} ran and passed`);
  // The automatic checks say what they ranged over, so "every gate" can never mean zero gates.
  for (const id of ['S1', 'S2', 'S3']) assert.match(r.out, new RegExp(`^pass  ${id}  .*\\(12 gate\\(s\\) on 4 reviewed case\\(s\\)\\)`, 'm'), `${id} ran over the whole pack`);
  assert.doesNotMatch(r.out, /^skip /m, 'nothing is skipped on the real pack');
  assert.doesNotMatch(r.out, /hand-written probe coverage/, 'every real case and gate has a hand-written probe today');
  // Tripwire only (the fixture tests below are the contract): the old hand-written three-name
  // table must not come back under its original spelling.
  const src = fs.readFileSync(SCRIPT, 'utf8');
  assert.doesNotMatch(src, /Dana:\s*'sp_depression_gated_si_001'/, 'the old hand-written case table is back');
});

test('a reviewed case no hand-written probe names is NAMED, not failed (decision sp-redteam-signoff-retired)', (t) => {
  const file = fixturePack(t, (pack) => {
    const quinn = JSON.parse(JSON.stringify(pack.cases.find((c) => c.id === MORGAN)));
    quinn.id = 'sp_fixture_undriven_001';
    quinn.persona.displayName = 'Quinn';
    quinn.title = 'Quinn — fixture';
    pack.cases.push(quinn);
  });
  const r = run([file]);
  assert.equal(r.status, 0, `an undriven reviewed case is reported, not failed\n${r.out}`);
  assert.match(r.out, /^note  hand-written probe coverage \(informational/m);
  assert.match(r.out, /sp_fixture_undriven_001 — no hand-written probe drives this case/, 'the gap is printed, never dropped');
  assert.doesNotMatch(r.out, /^FAIL/m);
  assert.match(r.out, /Gate integrity clean/);
});

// The point of the decision: a NEW case with disclosure gates lands in ONE content PR. It needs no
// hand-written probe, and S1–S3 check every one of its gates the moment it is reviewed.
test('a new reviewed case WITH gates and no hand-written probe passes, and S1–S3 range over its gates', (t) => {
  const file = fixturePack(t, (pack) => {
    const casey = JSON.parse(JSON.stringify(pack.cases.find((c) => c.id === 'sp_mania_redirect_001')));
    casey.id = 'sp_fixture_new_001';
    casey.persona.displayName = 'Casey';
    casey.title = 'Casey — fixture';
    pack.cases.push(casey);
  });
  const r = run([file]);
  assert.equal(r.status, 0, r.out);
  for (const id of ['S1', 'S2', 'S3']) assert.match(r.out, new RegExp(`^pass  ${id}  .*\\(16 gate\\(s\\) on 5 reviewed case\\(s\\)\\)`, 'm'), `${id} counted the new case's four gates`);
  assert.match(r.out, /sp_fixture_new_001 — no hand-written probe drives this case/);
  assert.match(r.out, /sp_fixture_new_001 \/ g_spending — no hand-written probe asserts on this gate/);
});

// S1–S3 must each be able to fail (docs/SILENT_SHRINK_CHECKLIST.md §F: prove a guard by breaking it).
test('S1 bites: a gate whose key intent matches small talk turns the run red', (t) => {
  const file = fixturePack(t, (pack) => {
    const dana = pack.cases.find((c) => c.id === 'sp_depression_gated_si_001');
    dana.intents.find((i) => i.id === 'si_direct').patterns.push('^okay\\.?$');
  });
  const r = run([file]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^FAIL  S1  /m);
  assert.match(r.out, /sp_depression_gated_si_001 \/ si_active — its required intent si_direct matches the small-talk line "Okay\."/);
  assert.match(r.out, /sp_depression_gated_si_001 — small talk alone unlocked \[si_active\]/);
});

test('S2 bites: a gate keyed to an intent the case does not define, or a parent-gate loop, turns the run red', (t) => {
  const typo = fixturePack(t, (pack) => {
    const marcus = pack.cases.find((c) => c.id === 'sp_mania_redirect_001');
    marcus.gated.find((g) => g.id === 'g_spending').requiresIntents = ['spending_typo'];
  });
  const r = run([typo]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^FAIL  S2  /m);
  assert.match(r.out, /sp_mania_redirect_001 \/ g_spending — requires intent spending_typo, which the case does not define/);
  const loop = fixturePack(t, (pack) => {
    const dana = pack.cases.find((c) => c.id === 'sp_depression_gated_si_001');
    dana.gated.find((g) => g.id === 'si_active').requiresGate = 'si_plan_detail';
  });
  const r2 = run([loop]);
  assert.equal(r2.status, 1, r2.out);
  assert.match(r2.out, /sp_depression_gated_si_001 \/ si_active — its requiresGate chain loops back to si_active/);
});

test('S3 bites: a gate that opens on si_euphemism turns the run red (G1)', (t) => {
  const file = fixturePack(t, (pack) => {
    const dana = pack.cases.find((c) => c.id === 'sp_depression_gated_si_001');
    dana.gated.find((g) => g.id === 'si_active').requiresIntents.push('si_euphemism');
  });
  const r = run([file]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^FAIL  S3  /m);
  assert.match(r.out, /sp_depression_gated_si_001 \/ si_active — si_euphemism opens this gate/);
});

test('a case that is in the pack but not reviewed skips its probes — reported, never counted as a pass', (t) => {
  const file = fixturePack(t, (pack) => {
    const morgan = pack.cases.find((c) => c.id === MORGAN);
    morgan.facultyReview = { status: 'pending', reviewer: null, lastReviewed: null };
  });
  const r = run([file]);
  assert.equal(r.status, 0, r.out);
  for (const id of ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7']) assert.match(r.out, new RegExp(`^skip  ${id}  `, 'm'), `${id} skipped`);
  assert.match(r.out, /is in the pack but not reviewed — learners cannot select it/);
  assert.match(r.out, /\(7 skipped: case not reviewed\)/);
  assert.doesNotMatch(r.out, /^pass  M\d/m, 'a skipped probe is never reported as a pass');
});

test('a probe naming a case that is not in the pack at all is a broken probe, and fails', (t) => {
  const file = fixturePack(t, (pack) => {
    pack.cases = pack.cases.filter((c) => c.id !== MORGAN);
  });
  const r = run([file]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /crashed: case not found for Morgan — not in the pack/);
});

test('--coverage reports the passing probes that drive each case, and says a gateless case has nothing to open', () => {
  const r = run(['--coverage']);
  assert.equal(r.status, 0, r.out);
  const morganBlock = r.out.split(MORGAN)[1] || '';
  assert.match(morganBlock, /driven by 7 passing probe\(s\): M1, M2, M3, M4, M5, M6, M7/);
  assert.match(morganBlock, /no disclosure gates — nothing to open/);
  assert.match(r.out, /Every reviewed case is driven by at least one passing probe\./);
  assert.match(r.out, /Every one of the 12 gate\(s\) on 4 reviewed case\(s\) has at least one passing probe\./, 'the summary says how many gates it counted');
});

test('a run in which nothing passed is never "clean": every case pending → exit 1 on the pass floor', (t) => {
  const file = fixturePack(t, (pack) => {
    for (const c of pack.cases) c.facultyReview = { status: 'pending', reviewer: null, lastReviewed: null };
  });
  const r = run([file]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^skip  B1  /m);
  assert.match(r.out, /FAIL  NONE  at least one probe ran to completion/);
  assert.match(r.out, /no probe passed — nothing was proved/);
  assert.match(r.out, /^skip  S1  [^\n]*\n\s+· no reviewed case has a disclosure gate/m, 'S1–S3 say they had nothing to range over');
  assert.doesNotMatch(r.out, /Gate integrity clean/);
});

test('a duplicate case id is refused before anything runs — the case gate keys by id', (t) => {
  const file = fixturePack(t, (pack) => {
    const twin = JSON.parse(JSON.stringify(pack.cases.find((c) => c.id === MORGAN)));
    twin.persona.displayName = 'Morgan Twin'; // same id, no probe names this display name
    pack.cases.push(twin);
  });
  const r = run([file]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /FAIL  PACK  duplicate case id\(s\): sp_alcohol_ambivalence_001/);
  assert.doesNotMatch(r.out, /^pass  /m, 'nothing ran');
  const c = run([file, '--coverage']);
  assert.equal(c.status, 1, 'coverage mode refuses the same pack');
});

test('a case is driven only by a PASSING probe: when every Morgan probe fails, coverage counts zero (and reports it)', (t) => {
  const file = fixturePack(t, (pack) => {
    const morgan = pack.cases.find((c) => c.id === MORGAN);
    morgan.checklist = null; // computeCoverage throws for Morgan, so every M probe crashes after probe()
  });
  const cov = run([file, '--coverage']);
  assert.equal(cov.status, 0, `--coverage is a report since 2026-09-27\n${cov.out}`);
  const morganBlock = cov.out.split(MORGAN)[1] || '';
  assert.match(morganBlock, /driven by 0 passing probe\(s\)/);
  assert.match(cov.out, /1 reviewed case\(s\) with no passing probe: sp_alcohol_ambivalence_001/);
  assert.match(cov.out, /Informational only/);
  const tier1 = run([file]);
  assert.equal(tier1.status, 1, 'the crashing M probes still fail the plain run');
  assert.match(tier1.out, /^FAIL  M1  [^\n]*\n\s+· crashed:/m);
  assert.match(tier1.out, /sp_alcohol_ambivalence_001 — no hand-written probe drives this case/, 'a probe that crashed after calling probe() does not count as driving the case');
});

test('--coverage reports a new unprobed gate without failing, and M1 still pins that Morgan is gateless', (t) => {
  const file = fixturePack(t, (pack) => {
    const morgan = pack.cases.find((c) => c.id === MORGAN);
    morgan.gated = [{ id: 'g_fixture_unprobed', requiresIntents: ['values'], requiresRapport: 9, reveal: 'fixture reveal line' }];
  });
  const r = run([file, '--coverage']);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /g_fixture_unprobed: NO PASSING PROBE THAT DROVE THIS CASE ASSERTS ON state\.unlocked FOR THIS GATE/);
  assert.match(r.out, /1 gate\(s\) with no probe:\s+- sp_alcohol_ambivalence_001 \/ g_fixture_unprobed/);
  assert.match(r.out, /Informational only/);
  const tier1 = run([file]);
  assert.equal(tier1.status, 1, tier1.out);
  assert.match(tier1.out, /Morgan gained disclosure gate\(s\) \[g_fixture_unprobed\]/);
});

test('M5 is not vacuous: it pins that the injury question trips the indirect screen, so a narrowed pattern turns it red', (t) => {
  // Design §18 documents the over-breadth; the probe must reproduce it, not merely fail to
  // observe it. A pack whose si_euphemism no longer matches the phrase makes M5 (and M2) fail.
  const file = fixturePack(t, (pack) => {
    const morgan = pack.cases.find((c) => c.id === MORGAN);
    morgan.intents.find((i) => i.id === 'si_euphemism').patterns = ['\\bzzz-never-matches\\b'];
  });
  const r = run([file]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^FAIL  M5  [^\n]*\n\s+· the injury question no longer trips si_euphemism/m);
  assert.match(r.out, /^FAIL  M2  /m);
  // A probe that ran to completion and FAILED does not drive its case either: M2 and M5 fail
  // without throwing here, so coverage must count only the five that passed.
  const cov = run([file, '--coverage']);
  const morganBlock = cov.out.split(MORGAN)[1] || '';
  assert.match(morganBlock, /driven by 5 passing probe\(s\): M1, M3, M4, M6, M7/);
  const drivenLine = (morganBlock.match(/driven by [^\n]*/) || [''])[0];
  assert.doesNotMatch(drivenLine, /\bM2\b|\bM5\b/);
  // …and the two that failed are NAMED, so the table cannot shrink by two with nothing on the page.
  assert.match(morganBlock, /2 probe\(s\) that drove this case FAILED and are not counted: M2 \(.*?\); M5 \(/);
  assert.match(cov.out, /2 probe\(s\) failed — the plain Tier 1 run is red/);
  assert.equal(cov.status, 0, 'five passing probes still drive the case, so coverage itself has no gap');
});

test('--coverage never summarises an empty set as covered: every case pending says nothing was proved', (t) => {
  const file = fixturePack(t, (pack) => {
    for (const c of pack.cases) c.facultyReview = { status: 'pending', reviewer: null, lastReviewed: null };
  });
  const r = run([file, '--coverage']);
  assert.equal(r.status, 0, `a report; the plain run's pass floor is what fails an empty pack\n${r.out}`);
  assert.match(r.out, /No reviewed case in the pack — nothing was proved\./);
  assert.doesNotMatch(r.out, /Every reviewed case is driven/);
  assert.match(r.out, /No reviewed case in the pack — no gate was evaluated\./, 'the gate axis says so too');
  assert.doesNotMatch(r.out, /Every one of the \d+ gate/, 'no universal claim over zero gates');
});

test('the plain run names an unprobed gate on a reviewed case but does not fail on it; S1–S3 still check its wiring', (t) => {
  const file = fixturePack(t, (pack) => {
    const dana = pack.cases.find((c) => c.id === 'sp_depression_gated_si_001');
    dana.gated.push({ id: 'g_fixture_unprobed_dana', requiresIntents: ['si_direct'], requiresRapport: 9, reveal: 'fixture reveal line' });
  });
  const r = run([file]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /sp_depression_gated_si_001 \/ g_fixture_unprobed_dana — no hand-written probe asserts on this gate/);
  assert.match(r.out, /^pass  S2  .*\(13 gate\(s\) on 4 reviewed case\(s\)\)/m, 'the new gate is inside what S1–S3 checked');
  assert.doesNotMatch(r.out, /^FAIL/m);
});

// Codex review on #837 (P1): gate coverage keyed on the gate id alone, so a second case that
// reused an id already probed on another case read as covered by that other case's probes —
// both Tier 1 and --coverage passed while no probe had ever driven the new gate. Coverage is
// per (case, gate) now: a gate counts as probed only by a PASSING probe that DROVE that case.
test('a same-named gate on a second case is not covered by the first case\'s probes (Codex P1 on #837)', (t) => {
  const file = fixturePack(t, (pack) => {
    const ray = pack.cases.find((c) => c.id === 'sp_psychosis_paranoid_001');
    // Dana's gate id, on Ray; requiresRapport 9 so it never opens and Ray's own probes still pass.
    ray.gated.push({ id: 'si_active', requiresIntents: ['si_direct'], requiresRapport: 9, reveal: 'fixture reveal line' });
  });
  const r = run([file]);
  assert.equal(r.status, 0, `reported, not failed, since 2026-09-27\n${r.out}`);
  assert.match(r.out, /sp_psychosis_paranoid_001 \/ si_active — no hand-written probe asserts on this gate/, "Dana's si_active probes are not credited to Ray's");
  assert.doesNotMatch(r.out, /sp_depression_gated_si_001 \/ si_active/, "Dana's own si_active stays covered");
  assert.doesNotMatch(r.out, /^FAIL/m);
  const cov = run([file, '--coverage']);
  assert.equal(cov.status, 0, cov.out);
  const dana = cov.out.split('sp_depression_gated_si_001')[1].split('sp_mania_redirect_001')[0];
  const rayBlock = cov.out.split('sp_psychosis_paranoid_001')[1].split(MORGAN)[0];
  assert.match(dana, /si_active: B1, B2/, "Dana's row still names her probes");
  assert.match(rayBlock, /si_active: NO PASSING PROBE THAT DROVE THIS CASE ASSERTS ON state\.unlocked FOR THIS GATE/);
  assert.match(cov.out, /1 gate\(s\) with no probe:\s+- sp_psychosis_paranoid_001 \/ si_active/);
});

// A case the pack carries but faculty have not reviewed is not selectable (tool and proxy filter
// on `reviewed`) and every probe naming it skips by construction, so no probe could cover its
// gates: evaluating them would be a guaranteed, uncoverable failure that says nothing about the
// served pack. The moment it is reviewed, every one of its gates is evaluated against probes
// that drove IT, so the gates it cloned from Dana are not credited by Dana's probes. This is the
// landing order the 2026-09-27 amendment of decision pack-case-review-is-registration (#844) makes real: the attestation
// validator accepts a pending case inside a reviewed pack, so a new case lands pending, gains
// its probes in a governance PR, and is judged here the moment a content PR flips it to reviewed.
test('a pending case\'s gates are not evaluated until it is reviewed; once reviewed, cloned gates are its own to prove', (t) => {
  const clone = (pack) => {
    const quinn = JSON.parse(JSON.stringify(pack.cases.find((c) => c.id === 'sp_depression_gated_si_001')));
    quinn.id = 'sp_fixture_pending_001';
    quinn.persona.displayName = 'Quinn';
    quinn.title = 'Quinn — fixture';
    quinn.gated.push({ id: 'g_fixture_pending_gate', requiresIntents: ['si_direct'], requiresRapport: 9, reveal: 'fixture reveal line' });
    pack.cases.push(quinn);
    return quinn;
  };
  const pending = fixturePack(t, (pack) => { clone(pack).facultyReview = { status: 'pending', reviewer: null, lastReviewed: null }; });
  const r = run([pending]);
  assert.equal(r.status, 0, `a pending case's gates are not the run's to judge yet\n${r.out}`);
  assert.doesNotMatch(r.out, /sp_fixture_pending_001/, 'a pending case is not listed as a coverage gap');
  const cov = run([pending, '--coverage']);
  assert.equal(cov.status, 0, cov.out);
  const quinn = cov.out.split('sp_fixture_pending_001')[1] || '';
  assert.match(quinn, /not reviewed — not selectable/);
  assert.match(quinn, /g_fixture_pending_gate: not evaluated until the case is reviewed/);

  const reviewed = fixturePack(t, (pack) => { clone(pack); /* facultyReview cloned from Dana: reviewed */ });
  const r2 = run([reviewed]);
  assert.equal(r2.status, 0, `a reviewed case with no hand-written probe is named, not failed\n${r2.out}`);
  assert.match(r2.out, /^pass  S1  .*\(18 gate\(s\) on 5 reviewed case\(s\)\)/m, 'S1–S3 now range over the clone\'s six gates');
  assert.match(r2.out, /sp_fixture_pending_001 \/ si_active — no hand-written probe asserts on this gate/, "Dana's probes do not cover the clone's si_active");
  assert.match(r2.out, /sp_fixture_pending_001 \/ g_fixture_pending_gate — no hand-written probe/);
  assert.match(r2.out, /sp_fixture_pending_001 — no hand-written probe drives this case/);
  assert.doesNotMatch(r2.out, /sp_depression_gated_si_001 \/ si_active/, "Dana's own gates stay covered");
  // The table and the note are two renderings of one predicate; pin the table too.
  const cov2 = run([reviewed, '--coverage']);
  assert.equal(cov2.status, 0, cov2.out);
  const q2 = cov2.out.split('sp_fixture_pending_001')[1] || '';
  assert.match(q2, /g_fixture_pending_gate: NO PASSING PROBE THAT DROVE THIS CASE ASSERTS ON state\.unlocked FOR THIS GATE/);
  assert.doesNotMatch(q2, /not evaluated until the case is reviewed/, 'a reviewed case is evaluated, whatever drives it');
  assert.match(cov2.out, /6 gate\(s\) with no probe:/);
  assert.doesNotMatch(cov2.out, /Every one of the \d+ gate/);
});

// Credit is a PASSING probe's: a runner that credited any probe that merely drove the case would
// pass every fixture above (they all pass 30/30 or use gateless Morgan). Here the only two probes
// declaring si_means_detail and si_protective_detail (B3c, B8e) fail, so both gates lose cover.
test('gate credit needs a PASSING probe: when the only probes declaring two of Dana\'s gates fail, the run is red and both gates lose credit', (t) => {
  const file = fixturePack(t, (pack) => {
    const dana = pack.cases.find((c) => c.id === 'sp_depression_gated_si_001');
    dana.intents.find((i) => i.id === 'si_means').patterns = ['\\bzzz-never-matches\\b'];
  });
  const r = run([file]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^FAIL  B3c  /m);
  assert.match(r.out, /^FAIL  B8e  /m);
  assert.match(r.out, /sp_depression_gated_si_001 \/ si_means_detail — no hand-written probe asserts on this gate/);
  assert.match(r.out, /sp_depression_gated_si_001 \/ si_protective_detail — no hand-written probe/);
  const cov = run([file, '--coverage']);
  assert.equal(cov.status, 0, cov.out);
  const dana = cov.out.split('sp_depression_gated_si_001')[1].split('sp_mania_redirect_001')[0];
  assert.match(dana, /si_means_detail: NO PASSING PROBE THAT DROVE THIS CASE ASSERTS ON state\.unlocked FOR THIS GATE/);
  assert.match(dana, /si_active: B1, B2/, 'gates other passing probes cover stay covered');
  assert.match(dana, /probe\(s\) that drove this case FAILED and are not counted: B3c \(.*?\); B8e \(/);
});

// A `gates` declaration that names a gate the driven case does not have is a stale or misplaced
// declaration; B7 asserts only that g_target stays shut, so with g_target gone every B7
// assertion is vacuously true and the declaration check is the only thing that can notice.
test('a stale `gates` declaration fails its probe: removing Ray\'s g_target makes B7 red on the declaration alone', (t) => {
  const file = fixturePack(t, (pack) => {
    const ray = pack.cases.find((c) => c.id === 'sp_psychosis_paranoid_001');
    ray.gated = ray.gated.filter((g) => g.id !== 'g_target');
  });
  const r = run([file]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /^FAIL  B7  [^\n]*\n\s+· declares gate g_target, which no case this probe drove has \[sp_psychosis_paranoid_001\]/m);
  assert.doesNotMatch(r.out, /^FAIL  (?!B7  )[BCM]\d/m, 'only the declaration check fired');
  assert.doesNotMatch(r.out, /hand-written probe coverage/, 'the gate is gone, so nothing is unprobed — the declaration is the only thing that noticed');
  assert.doesNotMatch(r.out, /Gate integrity clean/);
  // The other branch — a declared id on more than one case the probe drove — cannot be reached
  // from a pack fixture while every probe drives exactly one case; it is untested by construction.
});

// The validator reads `attested` as reviewed; the tool, the proxy and this runner select on
// `reviewed` alone. A case spelled `attested` would therefore pass the validator and leave Tier 1
// with a green exit — its probes skipping, its gates unevaluated. Fail closed instead.
test('a case status this runner does not know is refused before anything runs — the validator\'s `attested` included', (t) => {
  const file = fixturePack(t, (pack) => {
    pack.cases.find((c) => c.id === 'sp_depression_gated_si_001').facultyReview.status = 'attested';
  });
  const r = run([file]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /FAIL  PACK  case status this runner does not know: sp_depression_gated_si_001=attested/);
  assert.doesNotMatch(r.out, /^(pass|skip)  /m, 'nothing ran');
  const c = run([file, '--coverage']);
  assert.equal(c.status, 1, 'coverage mode refuses the same pack');
});
