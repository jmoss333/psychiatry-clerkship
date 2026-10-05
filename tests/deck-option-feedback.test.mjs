/**
 * Article-deck distractors carry their rationale in `fb`, never inside the option text.
 *
 * THE DEFECT (fixed 2026-10-05). The 50 article decks (AR-01..AR-50) of
 * 07_Evidence_and_Reading/Landmark_Trials/quizzes.json came from a NotebookLM extraction that
 * ran each distractor's rationale onto its option text and left `fb` empty: 650 options in 288
 * of 292 cards. review.html and the resident Canon Quiz render `t` on the answer button, so the
 * explanation ("This contradicts the study's findings…") was on screen BEFORE the learner
 * answered, and the keyed option was the one short, clean choice left. The fix split each `t`
 * at the option/rationale boundary and moved the rationale, verbatim, into `fb`.
 *
 * THE INVARIANT pinned here, on both copies (the shipped source and the resident snapshot):
 * every non-keyed option in an article deck has non-empty `fb`. An empty `fb` on a distractor
 * is how the leak looked, so a regression (a regenerated deck, a re-extraction, a merge that
 * drops a field) goes red here by name, deck#index and option letter.
 *
 * Anti-vacuity: the examined set is counted and must be the whole one — 50 article decks,
 * 292 cards, 876 distractors per copy — so a filter that silently matched nothing cannot pass.
 * The SP spine decks are not in scope (they were never affected and are counted separately).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COPIES = [
  '07_Evidence_and_Reading/Landmark_Trials/quizzes.json',
  '_prototypes/canon-quiz/quizzes.json',
];
const EXPECTED = { decks: 50, cards: 292, distractors: 876 };
const LETTERS = 'ABCDEFGH';

/** Every article-deck distractor whose `fb` is missing or blank, plus what was examined. */
function distractorsWithoutFeedback(data) {
  const missing = [];
  const seen = { decks: 0, cards: 0, distractors: 0 };
  for (const deck of data.decks || []) {
    if (!/^AR-\d+$/.test(String(deck.id))) continue;
    seen.decks += 1;
    (deck.questions || []).forEach((q, index) => {
      seen.cards += 1;
      (q.o || []).forEach((o, j) => {
        if (o.c === true) return;
        seen.distractors += 1;
        if (typeof o.fb !== 'string' || o.fb.trim() === '') missing.push(`${deck.id}#${index} option ${LETTERS[j] || j}`);
      });
    });
  }
  return { missing, seen };
}

const read = rel => JSON.parse(fs.readFileSync(path.join(repo, rel), 'utf8'));

for (const rel of COPIES) {
  test(`${rel}: every article-deck distractor has feedback (rationale is not in the option text)`, () => {
    const { missing, seen } = distractorsWithoutFeedback(read(rel));
    assert.deepEqual(seen, EXPECTED, 'examined the whole article-deck set (no silent shrink)');
    assert.deepEqual(missing, [], `${missing.length} distractor(s) with empty fb — the answer-leak shape`);
  });
}

test('the check goes red on a distractor with empty fb, and names it', () => {
  const data = read(COPIES[0]);
  const deck = data.decks.find(d => d.id === 'AR-50');
  const j = deck.questions[0].o.findIndex(o => o.c !== true);
  deck.questions[0].o[j].fb = '';
  const { missing } = distractorsWithoutFeedback(data);
  assert.deepEqual(missing, [`AR-50#0 option ${LETTERS[j]}`]);
});
