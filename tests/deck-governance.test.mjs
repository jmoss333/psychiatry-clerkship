/**
 * Deck governance — the red/green proofs for the two flash-card gates, run against a COPY of
 * the live tree so no registry is ever edited.
 *
 *   bin/check_deck_card_stability.py   quizzes.schema.json + the positional-id pin
 *   bin/check_qbank_draft_exposure.py  items whose ITEM-LEVEL review flag is open (draft/pending/
 *                                      missing), per bank, capped + named. Item metadata only:
 *                                      the tool-level signatures that hash these bank files whole
 *                                      are bin/check_attestation_hashes.py's, not read here.
 *
 * Both tools carry a --self-test over synthetic fixtures; what this file adds is the proof on
 * the REAL data shape: a malformed entry in a copy of quizzes.json fails the schema; swapping two
 * real questions fails naming the deck and both indices; a new open flag fails (unlisted, and over
 * the cap); a swap fails; clearing a listed case's flag leaves a stale entry that WARNS and exits 0
 * (the follow-up is a governance PR, because bin/ and the banks may not share a diff); reality
 * below the cap WARNS and exits 0. Every copy lives in a mkdtemp that is
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
  'quizzes.fingerprints.json',
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
      if (rel !== 'quizzes.fingerprints.json') {
        assert.equal(fs.readFileSync(path.join(root, rel), 'utf8'), bytes, `${rel} is unchanged by acknowledgment`);
      }
    }
    const pin = readJson(root, 'quizzes.fingerprints.json');
    assert.deepEqual(pin.rekeys.map(e => e.shifts), [['AR-24#1', 'AR-24#4']]);
    assert.equal(pin.rekeys[0].reason, 'test: deliberate swap');
  });
});

test('stability: the committed pin agrees with the live file (437 cards, 79 decks, no re-key yet)', () => {
  const pin = readJson(repo, 'quizzes.fingerprints.json');
  const live = readJson(repo, QUIZZES);
  assert.equal(pin.cardCount, 437);
  assert.equal(pin.deckCount, 79);
  assert.deepEqual(Object.keys(pin.decks).sort(), live.decks.map(d => d.id).sort());
  for (const deck of live.decks) assert.equal(pin.decks[deck.id].length, deck.questions.length, deck.id);
  assert.deepEqual(pin.rekeys, []);
});

test('stability: the pin lives where it can ride in the same PR as the deck edit it pins', () => {
  // 2026-10-05: under bin/ the pin was governance to check_governance_separation.py L1 and the
  // deck is content, so an in-place card edit and its required refresh could not share a PR and
  // neither could land alone. The pin must be neither governance nor content to L1 (governance
  // would re-create the deadlock; content would forbid a governance PR from ever touching it),
  // and content to the policy/content check, like every other gate's data.
  const snippet = [
    'import json, sys; sys.path.insert(0, "bin")',
    'import check_deck_card_stability as S',
    'import check_governance_separation as L1',
    'import check_policy_content_separation as PC',
    'src = L1.shipped_sources(json.load(open(L1.SHIPPED_REL, encoding="utf-8")))',
    'print(json.dumps({"pin": S.PIN, "l1Gov": L1.is_governance(S.PIN),',
    '  "l1Content": L1.is_content(S.PIN, src), "deckIsContent": L1.is_content(S.SOURCE, src),',
    '  "policy": PC.is_policy(S.PIN), "neutral": PC.is_neutral(S.PIN)}))',
  ].join('\n');
  const proc = spawnSync('python3', ['-c', snippet], { cwd: repo, encoding: 'utf8', timeout: 120_000 });
  assert.equal(proc.status, 0, proc.stderr);
  const got = JSON.parse(proc.stdout);
  assert.equal(got.pin, 'quizzes.fingerprints.json');
  assert.ok(fs.existsSync(path.join(repo, got.pin)), 'the pin is committed at the path the gate reads');
  assert.ok(!fs.existsSync(path.join(repo, 'bin/quizzes.fingerprints.json')), 'no stale copy left in bin/');
  assert.deepEqual(
    { l1Gov: got.l1Gov, l1Content: got.l1Content, deckIsContent: got.deckIsContent, policy: got.policy, neutral: got.neutral },
    { l1Gov: false, l1Content: false, deckIsContent: true, policy: false, neutral: false },
  );
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
    assert.match(r.stdout, /OK -- 470 item\(s\) across 6 banks have an open item-level review flag, every one named and within cap \(item metadata only; tool-level signatures are bin\/check_attestation_hashes\.py's\)\./);
    assert.doesNotMatch(r.stdout, /WARN/, 'the live tree carries no stale entry and no slack under a cap');
  });
});

test('exposure: RED — a new open flag (unlisted, and one over the cap) fails, named, and the tool changes nothing', () => {
  withCopy(root => {
    const bank = readJson(root, 'question_bank.json');
    const live = bank.items.find(i => i.status === 'attested' && i.retired !== true);
    live.status = 'draft';
    writeJson(root, 'question_bank.json', bank);
    const before = fs.readFileSync(path.join(root, 'question_bank.json'), 'utf8');
    const r = run('check_qbank_draft_exposure.py', root);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, new RegExp(`FAIL  QB: ${live.id} has item-level flag \`draft\` and is not on the allowlist`));
    assert.match(r.stdout, /FAIL  QB: 1 open, cap is 0/);
    assert.equal(fs.readFileSync(path.join(root, 'question_bank.json'), 'utf8'), before, 'report-only');
  });
});

test('exposure: RED — a swap (one listed case cleared, one new open case added) fails on the new id', () => {
  withCopy(root => {
    const bank = readJson(root, 'communication_cases.json');
    const cleared = bank.cases[0].id;
    bank.cases[0].facultyReview = { status: 'reviewed', reviewer: 'Faculty', lastReviewed: '2026-10-05' };
    const added = { ...structuredClone(bank.cases[1]), id: 'zz_new_open_case_001' };
    added.facultyReview = { status: 'draft', reviewer: '', lastReviewed: '' };
    bank.cases.push(added);
    writeJson(root, 'communication_cases.json', bank);
    const r = run('check_qbank_draft_exposure.py', root);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /FAIL  COMM: zz_new_open_case_001 has item-level flag `draft` and is not on the allowlist/);
    assert.doesNotMatch(r.stdout, /FAIL  COMM: \d+ open, cap is/, 'the count did not rise; only the name catches it');
    assert.match(r.stdout, new RegExp(`WARN  COMM: ${cleared} is listed but is no longer open`));
  });
});

test('exposure: RED — open items above the cap fail (the ratchet only turns down), with the allowlist intact', () => {
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
    assert.match(out, /FAIL  FAM: 8 open, cap is 7/);
    assert.match(out, /FAIL  FAM: allowlist has 8 entries, cap is 7/);
  });
});

test('exposure: WARN — clearing a listed case\'s flag (a content PR) leaves a stale entry that warns and exits 0', () => {
  // The deadlock this proves gone: the allowlist is in bin/ (governance) and the bank is content,
  // and L1 forbids both in one diff. A content PR that clears a flag cannot delete the entry, so
  // it must pass; the deletion is a follow-up governance PR.
  withCopy(root => {
    const bank = readJson(root, 'communication_cases.json');
    const id = bank.cases[0].id;
    bank.cases[0].facultyReview = { status: 'reviewed', reviewer: 'Faculty', lastReviewed: '2026-10-05' };
    writeJson(root, 'communication_cases.json', bank);
    const allowBefore = fs.readFileSync(path.join(root, 'bin/qbank_draft_exposure_allowlist.json'), 'utf8');
    const r = run('check_qbank_draft_exposure.py', root);
    assert.equal(r.status, 0, r.stdout);
    assert.doesNotMatch(r.stdout, /FAIL/);
    assert.match(r.stdout, new RegExp(`WARN  COMM: ${id} is listed but is no longer open \\(its item-level flag is now reviewed/attested\\) -- stale entry; delete it from bin/qbank_draft_exposure_allowlist\\.json in a follow-up governance PR`));
    assert.match(r.stdout, /WARN  COMM: 15 open under a cap of 16 -- lower CAPS\['COMM'\] to 15 in a follow-up governance PR, after deleting its 1 stale entry/);
    assert.match(r.stdout, /OK -- 469 item\(s\) .* 2 warnings above, for a follow-up governance PR\./);
    assert.equal(fs.readFileSync(path.join(root, 'bin/qbank_draft_exposure_allowlist.json'), 'utf8'), allowBefore, 'report-only');
  });
});

test('exposure: WARN — reality below the cap (entry already deleted) warns that the cap can be lowered, exit 0', () => {
  // The follow-up governance PR's first commit: the stale entry is gone, the cap is not lowered yet.
  withCopy(root => {
    const bank = readJson(root, 'family_systems_scenarios.json');
    const id = bank.scenarios[0].id;
    bank.scenarios[0].facultyReview = { status: 'reviewed', reviewer: 'Faculty', lastReviewed: '2026-10-05' };
    writeJson(root, 'family_systems_scenarios.json', bank);
    const allow = readJson(root, 'bin/qbank_draft_exposure_allowlist.json');
    allow.banks.FAM = allow.banks.FAM.filter(x => x !== id);
    writeJson(root, 'bin/qbank_draft_exposure_allowlist.json', allow);
    const r = run('check_qbank_draft_exposure.py', root);
    assert.equal(r.status, 0, r.stdout);
    assert.doesNotMatch(r.stdout, /FAIL|stale/);
    assert.match(r.stdout, /WARN  FAM: 7 open under a cap of 8 -- lower CAPS\['FAM'\] to 7 in a follow-up governance PR\n/);
    assert.match(r.stdout, /OK -- 469 item\(s\) .* 1 warning above, for a follow-up governance PR\./);
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
