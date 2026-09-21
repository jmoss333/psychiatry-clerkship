import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const form = readFileSync(new URL('../13_Faculty_Resources/Feedback/feedback.html', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/spa_index.html', import.meta.url), 'utf8');

test('feedback is private, optional-contact, and explicitly excludes PHI', () => {
  assert.match(form, /Goes privately to Dr\. Moss/);
  assert.match(form, /leave blank to stay anonymous/);
  assert.match(form, /no patient information \(PHI\)/);
});

test('feedback type is a one-tap required choice rather than a dropdown', () => {
  const choices = [...form.matchAll(/type="radio" name="type"/g)];
  assert.ok(choices.length >= 5, `expected at least five quick choices, found ${choices.length}`);
  assert.doesNotMatch(form, /<select id="f_type"/);
  assert.match(form, /type="radio" name="type" value="Confusing or unclear" required/);
});

test('the form asks for the learner goal and a concrete improvement', () => {
  assert.match(form, /name="goal"/);
  assert.match(form, /What were you trying to do\?/);
  assert.match(form, /What happened, and what would make this better\?/);
});

test('the form records route context and the launcher passes its own context', () => {
  assert.match(form, /type="hidden" name="source-url" id="f_source"/);
  assert.match(form, /document\.referrer/);
  assert.match(shell, /getAttribute\('data-fb-context'\)/);
  assert.match(shell, /localStorage\.setItem\('cw_fb_ctx'/);
});
