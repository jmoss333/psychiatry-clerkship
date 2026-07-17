import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  deriveQueueCounts,
  filteredQuestions,
  isBatchEligible,
  startFacultyConsole,
} from '../faculty-console/app.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(repo, 'faculty-console/index.html'), 'utf8');
const appSource = readFileSync(path.join(repo, 'faculty-console/app.mjs'), 'utf8');

function relativeLuminance(hex) {
  const channels = hex
    .slice(1)
    .match(/../g)
    .map(value => Number.parseInt(value, 16) / 255)
    .map(value => (
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    ));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first, second) {
  const values = [relativeLuminance(first), relativeLuminance(second)]
    .sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function question(overrides = {}) {
  return {
    id: 'qb_moo_002',
    status: 'draft',
    category: 'mood',
    difficulty: 2,
    stem: 'A fictional patient has depressed mood. What is the diagnosis?',
    evidence: 't_mood.md - syndrome discriminator',
    pages: ['t_mood.md'],
    assessment: { gate: 'ready', blockers: [], warnings: [] },
    options: [
      { key: 'A', t: 'Major depressive disorder', c: true },
      { key: 'B', t: 'Delirium' },
      { key: 'C', t: 'Mania' },
      { key: 'D', t: 'Adjustment disorder' },
    ],
    ...overrides,
  };
}

test('exports the injectable faculty-console browser entry', () => {
  assert.equal(typeof startFacultyConsole, 'function');
  assert.match(appSource, /export function startFacultyConsole\s*\(\{\s*document,\s*window,\s*fetchImpl\s*=\s*fetch\s*\}\)/);
});

test('uses an inert document root and one dedicated status region', () => {
  const appRoot = html.match(/<main\b[^>]*\bid="app"[^>]*>/i)?.[0];
  assert.ok(appRoot, 'Missing main application root');
  assert.doesNotMatch(appRoot, /aria-live/i, 'The whole application must not be live');
  assert.equal((html.match(/\brole="status"/g) || []).length, 1);
  assert.match(
    html,
    /<div\s+id="app-status"\s+class="sr-only"\s+role="status"\s+aria-live="polite"><\/div>/,
  );
  assert.match(html, /<script\s+type="module"\s+src="\.\/app\.mjs"><\/script>/);
  assert.doesNotMatch(html, /<script(?!\s+type="module"\s+src=)[^>]*>[\s\S]+?<\/script>/i);
});

test('creates semantic tabs, queue controls, and persistent field labels', () => {
  for (const contract of [
    /role:\s*'tablist'/,
    /role:\s*'tab'/,
    /role:\s*'tabpanel'/,
    /'aria-selected'/,
    /'aria-current'/,
    /el\('fieldset'/,
    /el\('legend'/,
  ]) assert.match(appSource, contract);

  for (const label of [
    'Faculty key',
    'Reviewer label',
    'Search questions',
    'Category',
    'Status',
    'Review gate',
    'Difficulty',
  ]) assert.ok(appSource.includes(label), `Missing persistent label: ${label}`);

  assert.match(appSource, /not verified identit/i);
  assert.match(appSource, /Mark reviewed & next/);
  assert.match(appSource, /Ready|Warning|Blocked/);
});

test('restores focus to the active tab after click-driven rendering', () => {
  assert.match(appSource, /onClick:\s*\(\)\s*=>\s*activateTab\(name,\s*true\)/);
});

test('renders repository text without HTML parsing sinks', () => {
  assert.doesNotMatch(appSource, /\.innerHTML\s*=/);
  assert.doesNotMatch(appSource, /insertAdjacentHTML|document\.write\s*\(/);
  assert.match(appSource, /document\.createTextNode/);
  assert.match(appSource, /replaceChildren/);
});

test('keeps the shared key in session storage and request headers only', () => {
  assert.match(appSource, /sessionStorage\.getItem\(KEY_STORAGE\)/);
  assert.match(appSource, /sessionStorage\.setItem\(KEY_STORAGE,/);
  assert.match(appSource, /'x-faculty-key'/);
  assert.doesNotMatch(appSource, /localStorage|document\.cookie/);
  assert.doesNotMatch(appSource, /JSON\.stringify\(\{[\s\S]{0,300}?\bkey\s*:/);
});

test('guards unsaved work and reserves the global shortcut for Ctrl or Command S', () => {
  assert.match(appSource, /function hasAnyUnsavedChanges\(\)/);
  assert.match(appSource, /Object\.keys\(state\.contentChanges\)\.length\s*>\s*0/);
  assert.match(appSource, /addEventListener\('beforeunload'/);
  assert.match(appSource, /if \(!hasAnyUnsavedChanges\(\)\) return/);
  assert.match(appSource, /event\.preventDefault\(\)/);
  assert.match(appSource, /event\.returnValue\s*=\s*''/);
  assert.match(appSource, /\(event\.metaKey\s*\|\|\s*event\.ctrlKey\)/);
  assert.match(appSource, /event\.key\.toLowerCase\(\)\s*===\s*'s'/);
  const letterShortcuts = [...appSource.matchAll(/key\.toLowerCase\(\)\s*===\s*'([a-z])'/g)]
    .map(match => match[1]);
  assert.deepEqual(letterShortcuts, ['s']);
});

test('uses the approved clinical workbench layout and accessible primary contrast', () => {
  const primary = html.match(/--primary:\s*(#[0-9a-f]{6})/i)?.[1];
  const primaryText = html.match(/--primary-text:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.equal(primary?.toLowerCase(), '#3f5c45');
  assert.equal(primaryText?.toLowerCase(), '#ffffff');
  assert.ok(contrastRatio(primary, primaryText) >= 4.5);

  assert.match(
    html.replace(/\s+/g, ' '),
    /grid-template-columns:\s*minmax\(280px,\s*340px\)\s+minmax\(0,\s*1fr\)/,
  );
  assert.match(html, /@media\s*\(max-width:\s*760px\)/);
  assert.match(html, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(html, /\.queue-row::before/);
  assert.doesNotMatch(html, /linear-gradient|radial-gradient|@keyframes/);
});

test('filters search text and dimensions, then sorts by category and ID', () => {
  const server = {
    qbank: [
      question({ id: 'qb_psy_010', category: 'psychosis', difficulty: 3 }),
      question({ id: 'qb_moo_003', evidence: 'anchor-only phrase' }),
      question({ id: 'qb_moo_001', pages: ['unique-page.md'] }),
      question({ id: 'qb_moo_004', status: 'attested' }),
      question({
        id: 'qb_moo_005',
        assessment: { gate: 'warning', blockers: [], warnings: [{ code: 'stem.lead_in' }] },
      }),
    ],
  };
  const base = {
    search: '', category: 'all', status: 'all', gate: 'all', difficulty: 'all',
  };

  assert.deepEqual(
    filteredQuestions(server, base).map(item => item.id),
    ['qb_moo_001', 'qb_moo_003', 'qb_moo_004', 'qb_moo_005', 'qb_psy_010'],
  );
  assert.deepEqual(
    filteredQuestions(server, { ...base, search: 'anchor-only' }).map(item => item.id),
    ['qb_moo_003'],
  );
  assert.deepEqual(
    filteredQuestions(server, { ...base, search: 'unique-page' }).map(item => item.id),
    ['qb_moo_001'],
  );
  assert.deepEqual(
    filteredQuestions(server, {
      ...base, category: 'mood', status: 'draft', gate: 'warning', difficulty: '2',
    }).map(item => item.id),
    ['qb_moo_005'],
  );
});

test('derives queue counts without hard-coded totals', () => {
  const questions = [
    question({ id: 'qb_moo_001' }),
    question({
      id: 'qb_moo_002',
      assessment: { gate: 'warning', blockers: [], warnings: [{ code: 'stem.lead_in' }] },
    }),
    question({
      id: 'qb_moo_003',
      assessment: { gate: 'blocked', blockers: [{ code: 'required.stem' }], warnings: [] },
    }),
    question({ id: 'qb_moo_004', status: 'attested' }),
  ];
  assert.deepEqual(deriveQueueCounts(questions), {
    draft: 3,
    ready: 2,
    warning: 1,
    blocked: 1,
    attested: 1,
  });
});

test('batch eligibility requires a saved green draft reviewed in this session', () => {
  const reviewed = new Set(['qb_moo_002']);
  assert.equal(isBatchEligible(question(), reviewed, false), true);
  assert.equal(isBatchEligible(question(), new Set(), false), false);
  assert.equal(isBatchEligible(question({ status: 'attested' }), reviewed, false), false);
  assert.equal(isBatchEligible(question({
    assessment: { gate: 'warning', blockers: [], warnings: [{ code: 'stem.lead_in' }] },
  }), reviewed, false), false);
  assert.equal(isBatchEligible(question(), reviewed, true), false);
});
