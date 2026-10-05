/**
 * Deck governance — the red/green proofs for the two flash-card gates, run against a COPY of
 * the live tree so no registry is ever edited.
 *
 *   bin/check_deck_card_stability.py   quizzes.schema.json + the positional-id pin
 *   bin/check_qbank_draft_exposure.py  un-attested items shipping, per bank, capped + named
 *
 * Both tools carry a --self-test over synthetic fixtures; what this file adds is the proof on
 * the REAL data shape: a malformed entry in a copy of quizzes.json fails the schema; swapping two
 * real questions fails naming the deck and both indices; flipping one real case to draft fails
 * the exposure cap; a cap below reality fails the other way. Every copy lives in a mkdtemp that is
 * removed in `finally` — bin/verify.sh counts anything left in a step's TMPDIR as a failure.
 *
 * Nothing here touches the network and nothing writes outside the temp copy.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUIZZES = '07_Evidence_and_Reading/Landmark_Trials/quizzes.json';
const SNAPSHOT = '_prototypes/canon-quiz/quizzes.json';
const COPIED = [
  'quizzes.schema.json',
  QUIZZES,
  SNAPSHOT,
  'bin/quizzes.fingerprints.json',
  'bin/qbank_draft_exposure_allowlist.json',
  'question_bank.json',
  'communication_cases.json',
  'family_systems_scenarios.json',
  'reasoning_cases.json',
  'reasoning_cases_resident.json',
];

function run(tool, root, args = []) {
  return spawnSync('python3', [path.join(repo, 'bin', tool), '--root', root, ...args], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 120_000,
  });
}

/** Copy the governed files into a fresh tree, hand it to fn, and remove it whatever happens. */
function withCopy(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-governance-'));
  try {
    for (const rel of COPIED) {
      const dest = path.join(root, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(repo, rel), dest);
    }
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const readJson = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const writeJson = (root, rel, data) => fs.writeFileSync(path.join(root, rel), JSON.stringify(data));

test('stability: a faithful copy of the live tree is green against the committed pin', () => {
  withCopy(root => {
    const r = run('check_deck_card_stability.py', root);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /OK -- 437 cards in 79 decks match/);
  });
});

test('stability: a malformed entry in a copy fails the schema and is located', () => {
  withCopy(root => {
    const data = readJson(root, QUIZZES);
    delete data.decks[3].questions[1].o[2].c; // an option without `c`: the shape no longer holds
    writeJson(root, QUIZZES, data);
    const r = run('check_deck_card_stability.py', root);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /SCHEMA\s+07_Evidence_and_Reading\/Landmark_Trials\/quizzes\.json \/decks\/3\/questions\/1\/o\/2: 'c' is a required property/);
    assert.match(r.stdout, /FAIL -- 1 schema violation/);
  });
});

test('stability: swapping two real questions fails naming the deck and both indices, nothing else', () => {
  withCopy(root => {
    const data = readJson(root, QUIZZES);
    const deck = data.decks.find(d => d.id === 'AR-24'); // the deck review_companion_pairs.json cites (AR-24#5)
    assert.ok(deck && deck.questions.length >= 6, 'AR-24 still has six questions');
    [deck.questions[1], deck.questions[4]] = [deck.questions[4], deck.questions[1]];
    writeJson(root, QUIZZES, data);
    const r = run('check_deck_card_stability.py', root);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /MOVED\s+AR-24#1\s+holds the card pinned at index 4/);
    assert.match(r.stdout, /MOVED\s+AR-24#4\s+holds the card pinned at index 1/);
    assert.doesNotMatch(r.stdout, /AR-24#5/, 'the companion-cited card did not move and is not named');
    assert.doesNotMatch(r.stdout, /AR-23|AR-25|SP-/, 'no other deck is named');
    assert.match(r.stdout, /FAIL -- 2 positional id\(s\) would shift/);
    assert.match(r.stdout, /--acknowledge-positional-id-breakage/);

    // The refresh refuses; an explicit breakage acknowledgment only changes the pin.
    const beforeOverride = new Map(COPIED.map(rel => [rel, fs.readFileSync(path.join(root, rel), 'utf8')]));
    const scheduleFile = path.join(root, 'synthetic-learner-schedule.json');
    const schedule = JSON.stringify({ cards: { 'AR-24#1': { ivl: 21, reps: 4 } } });
    fs.writeFileSync(scheduleFile, schedule);
    const refused = run('check_deck_card_stability.py', root, ['--update-fingerprints']);
    assert.equal(refused.status, 1);
    assert.match(refused.stdout, /REFUSED -- 2 shift\(s\)/);
    const logged = run('check_deck_card_stability.py', root, ['--update-fingerprints', '--acknowledge-positional-id-breakage', 'test: deliberate swap']);
    assert.equal(logged.status, 0, logged.stdout);
    assert.match(logged.stdout, /OVERRIDE LOGGED/);
    assert.match(logged.stdout, /learner schedules were NOT migrated/);
    assert.doesNotMatch(logged.stdout, /[0-9]+ re-keyed/);
    assert.equal(fs.readFileSync(scheduleFile, 'utf8'), schedule);
    for (const [rel, bytes] of beforeOverride) {
      if (rel !== 'bin/quizzes.fingerprints.json') {
        assert.equal(fs.readFileSync(path.join(root, rel), 'utf8'), bytes, `${rel} is unchanged by acknowledgment`);
      }
    }
    const pin = readJson(root, 'bin/quizzes.fingerprints.json');
    assert.deepEqual(pin.rekeys.map(e => e.shifts), [['AR-24#1', 'AR-24#4']]);
    assert.equal(pin.rekeys[0].reason, 'test: deliberate swap');
  });
});

test('stability: the committed pin agrees with the live file (437 cards, 79 decks, no re-key yet)', () => {
  const pin = readJson(repo, 'bin/quizzes.fingerprints.json');
  const live = readJson(repo, QUIZZES);
  assert.equal(pin.cardCount, 437);
  assert.equal(pin.deckCount, 79);
  assert.deepEqual(Object.keys(pin.decks).sort(), live.decks.map(d => d.id).sort());
  for (const deck of live.decks) assert.equal(pin.decks[deck.id].length, deck.questions.length, deck.id);
  assert.deepEqual(pin.rekeys, []);
});

test('exposure: the live tree is green, and the per-bank numbers are the ones on record', () => {
  withCopy(root => {
    const r = run('check_qbank_draft_exposure.py', root);
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /COMM\s+16\s+0\s+16\s+0\s+0\s+0\s+0\s+16\s+16\s+16/);
    assert.match(r.stdout, /FAM\s+8\s+0\s+8\s+0\s+0\s+0\s+0\s+8\s+8\s+8/);
    assert.match(r.stdout, /REASON\s+4\s+0\s+4\s+0\s+0\s+0\s+0\s+4\s+4\s+4/);
    assert.match(r.stdout, /REASON-RES\s+5\s+0\s+5\s+0\s+0\s+0\s+0\s+5\s+5\s+5/);
    assert.match(r.stdout, /DECK\s+437\s+0\s+0\s+0\s+437\s+0\s+0\s+437\s+437\s+437/);
    assert.match(r.stdout, /QB\s+192\s+189\s+0\s+0\s+0\s+0\s+0\s+0\s+0\s+0\s+\(3 retired QB draft\(s\) not shipping\)/);
    assert.match(r.stdout, /OK -- 470 un-attested item\(s\) ship across 6 banks/);
  });
});

test('exposure: one more draft than the cap fails, named, and the tool changes nothing', () => {
  withCopy(root => {
    const bank = readJson(root, 'question_bank.json');
    const live = bank.items.find(i => i.status === 'attested' && i.retired !== true);
    live.status = 'draft';
    writeJson(root, 'question_bank.json', bank);
    const before = fs.readFileSync(path.join(root, 'question_bank.json'), 'utf8');
    const r = run('check_qbank_draft_exposure.py', root);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, new RegExp(`FAIL  QB: ${live.id} ships draft and is not on the allowlist`));
    assert.match(r.stdout, /FAIL  QB: 1 exposed, cap is 0/);
    assert.equal(fs.readFileSync(path.join(root, 'question_bank.json'), 'utf8'), before, 'report-only');
  });
});

test('exposure: a cap below reality fails the other way (stale cap), with the allowlist intact', () => {
  withCopy(root => {
    // The caps live in the script; the fixture door is the allowlist, so lower the policy the
    // only way a copy can: import the module and call the gate with a cap under the real count.
    const snippet = [
      'import sys, json; sys.path.insert(0, "bin")',
      'import check_qbank_draft_exposure as X',
      `root = ${JSON.stringify(root)}`,
      'caps = dict(X.CAPS, FAM=7)',
      'lines = []',
      'rc = X.gate(X.collect(root), X.load_allowlist(root), caps, out=lines.append)',
      'print(json.dumps({"rc": rc, "out": "\\n".join(lines)}))',
    ].join('\n');
    const proc = spawnSync('python3', ['-c', snippet], { cwd: repo, encoding: 'utf8', timeout: 120_000 });
    assert.equal(proc.status, 0, proc.stderr);
    const { rc, out } = JSON.parse(proc.stdout);
    assert.equal(rc, 1);
    assert.match(out, /FAIL  FAM: 8 exposed, cap is 7/);
    assert.match(out, /FAIL  FAM: allowlist has 8 entries, cap is 7/);
  });
});

test('exposure: attesting a listed case leaves a stale entry, which fails until deleted', () => {
  withCopy(root => {
    const bank = readJson(root, 'communication_cases.json');
    bank.cases[0].facultyReview = { status: 'reviewed', reviewer: 'Faculty', lastReviewed: '2026-10-04' };
    writeJson(root, 'communication_cases.json', bank);
    const r = run('check_qbank_draft_exposure.py', root);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, new RegExp(`FAIL  COMM: ${bank.cases[0].id} is listed but is clear -- stale entry`));
    const allow = readJson(root, 'bin/qbank_draft_exposure_allowlist.json');
    allow.banks.COMM = allow.banks.COMM.filter(id => id !== bank.cases[0].id);
    writeJson(root, 'bin/qbank_draft_exposure_allowlist.json', allow);
    const green = run('check_qbank_draft_exposure.py', root);
    assert.equal(green.status, 0, green.stdout);
    assert.match(green.stdout, /note  COMM: 15 listed under a cap of 16 -- lower CAPS\['COMM'\] to 15/);
  });
});

test('both tools: --self-test exits 0 so the falsifications stay wired', () => {
  for (const tool of ['check_deck_card_stability.py', 'check_qbank_draft_exposure.py']) {
    const r = spawnSync('python3', [path.join(repo, 'bin', tool), '--self-test'], { cwd: repo, encoding: 'utf8', timeout: 120_000 });
    assert.equal(r.status, 0, `${tool}: ${r.stdout}${r.stderr}`);
  }
});

test('stability: CLI names an acknowledgment, explicitly disclaims migration, and rejects the old action name', () => {
  const help = run('check_deck_card_stability.py', repo, ['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--acknowledge-positional-id-breakage/);
  assert.match(help.stdout, /does NOT\s+migrate learner schedules/);
  const obsolete = run('check_deck_card_stability.py', repo, ['--rekey-learner-schedules', 'not a migration']);
  assert.equal(obsolete.status, 2);
  assert.match(obsolete.stderr, /unrecognized arguments/);
});
