import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/question-bank-practice.html',
  import.meta.url,
), 'utf8');

test('exact-question review mode is explicit and precedes adaptive focus', () => {
  assert.match(source, /function readReviewContext\(/);
  assert.match(source, /function postReviewItemStatus\(/);
  assert.match(source, /function showReviewItem\(/);
  assert.ok(source.indexOf('showReviewItem(reviewItem)') < source.indexOf("localStorage.getItem('cw_qb_focus')"));
  assert.match(source, /This question is not present on the current deployment/);
});

test('review responses bypass learner progress and progression', () => {
  const commit = source.slice(
    source.indexOf('function commitResponse('),
    source.indexOf('function showFeedback('),
  );
  assert.match(commit, /SESSION\s*&&\s*SESSION\.reviewOnly/);
  assert.ok(commit.indexOf('SESSION.reviewOnly') < commit.indexOf('qbRecord('));
  const feedback = source.slice(
    source.indexOf('function getFeedbackHtml('),
    source.indexOf('function renderQuestion('),
  );
  assert.match(feedback, /SESSION\s*&&\s*SESSION\.reviewOnly/);
  assert.doesNotMatch(source, /localStorage\.(?:setItem|removeItem)\(['"]cw_qb_focus['"][^)]*reviewOnly/);
});
