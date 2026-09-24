/* ONE SCHEDULE — WP-2 phase 1, in ratchet mode.

   `curriculum.json` learningPaths.ms3 is meant to be the only week plan. Six other surfaces also
   say "what week X covers" — the six week READMEs, the 01_Six_Week_Curriculum table, the reading
   map, the orientation and shelf tables, and FD_PATH_PRACTICE — and they disagree with it and
   with each other (the WP-2 review found catatonia in four weeks, weeks 4 and 5 swapped in the
   shelf table, and the orientation table / FD_PATH_PRACTICE off the Path in weeks 2-3; the
   fixture records exactly which placements disagree today). This test reads each one,
   reduces it to `(ref or theme) → week` placements, and diffs every placement against the Path.
   Which surfaces are read, and which two plans are deliberately not, is documented at SURFACES
   in _schedule_consistency.mjs.

   A MISMATCH is (surface, week, ref) where the surface places `ref` in `week` and the Path does
   not list it in that week. A ref the Path lists but a surface omits is NOT a mismatch — a
   surface may be partial. Prose is mapped through the ONE theme table in the fixture; prose the
   table cannot map, and links that do not resolve to an MS3 page, are reported as UNMAPPED so
   they stay visible instead of being dropped.

   THE RATCHET. tests/fixtures/schedule-known-drift.json lists today's mismatches and unmapped
   prose. The test fails on any entry not in that list, AND on any listed entry that no longer
   occurs, so the list can only shrink. A PR that edits curriculum.json or one of the surfaces
   regenerates it deterministically, and the diff is the review:

       SCHEDULE_DRIFT_WRITE=1 node --test tests/schedule-consistency.test.mjs

   It also fails (never passes) when a surface file is missing or parses to zero placements — a
   parser that silently finds nothing would pass vacuously (docs/SILENT_SHRINK_CHECKLIST.md).
   When WP-2 phase 3 replaces a hand table with a build-injected block, delete that surface from
   SURFACES in _schedule_consistency.mjs in the same PR; the guard is meant to fail until you do.
   Phase 3 is done when the fixture's `mismatches` and `unmapped` are both empty.

   The unit tests below use inline fixtures only (G12); the last test reads the live tree. */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluate, linksIn, mapProse, compileThemes, parseWeekTable, parseWeekSections,
  parseFdPractice, resolveLink, runLive,
} from './_schedule_consistency.mjs';

const weeks = (obj) => new Map(Object.entries(obj).map(([n, refs]) => [Number(n), new Set(refs)]));
const WEEKS = weeks({ 1: ['a.md', 'week1.md'], 2: ['b.md', 'c.html'] });
const THEME_REFS = { family: ['b.md', 'x.md'] };
const surface = (entries, unmapped = []) => ({ id: 's', entries, unmapped });
const at = (week, ref) => ({ week, ref, file: 'f.md' });
const KNOWN_NONE = { mismatches: [], unmapped: [] };

// ---- the diff / ratchet ----------------------------------------------------------------

test('ratchet: a surface that agrees with the Path and an empty known list passes', () => {
  const r = evaluate({
    weeks: WEEKS, themeRefs: THEME_REFS, known: KNOWN_NONE,
    surfaces: [surface([at(1, 'a.md'), at(2, 'c.html'), at(1, 'week1.md')])],
  });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.mismatches, []);
});

test('ratchet: a mismatch that is not in the known list fails and names it', () => {
  const r = evaluate({
    weeks: WEEKS, themeRefs: THEME_REFS, known: KNOWN_NONE,
    surfaces: [surface([at(1, 'a.md'), at(1, 'b.md')])],
  });
  assert.deepEqual(r.mismatches, [{ surface: 's', file: 'f.md', week: 1, ref: 'b.md' }]);
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /new mismatch/i);
  assert.match(r.problems[0], /s · week 1 · b\.md · f\.md/);
});

test('ratchet: a week the Path does not have is a mismatch, not a crash', () => {
  const r = evaluate({
    weeks: WEEKS, themeRefs: THEME_REFS, known: KNOWN_NONE, surfaces: [surface([at(7, 'a.md')])],
  });
  assert.deepEqual(r.mismatches, [{ surface: 's', file: 'f.md', week: 7, ref: 'a.md' }]);
});

test('ratchet: a listed mismatch that still occurs passes', () => {
  const r = evaluate({
    weeks: WEEKS, themeRefs: THEME_REFS,
    known: { mismatches: [{ surface: 's', file: 'f.md', week: 1, ref: 'b.md' }], unmapped: [] },
    surfaces: [surface([at(1, 'a.md'), at(1, 'b.md')])],
  });
  assert.deepEqual(r.problems, []);
});

test('ratchet: a listed mismatch that no longer occurs fails as stale', () => {
  const r = evaluate({
    weeks: WEEKS, themeRefs: THEME_REFS,
    known: { mismatches: [{ surface: 's', file: 'f.md', week: 1, ref: 'b.md' }], unmapped: [] },
    surfaces: [surface([at(1, 'a.md')])],
  });
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /stale/i);
  assert.match(r.problems[0], /s · week 1 · b\.md/);
});

test('ratchet: unmapped prose is ratcheted both ways', () => {
  const found = { week: 2, text: 'plan', file: 'f.md' };
  const fresh = evaluate({
    weeks: WEEKS, themeRefs: THEME_REFS, known: KNOWN_NONE,
    surfaces: [surface([at(1, 'a.md')], [found])],
  });
  assert.equal(fresh.problems.length, 1);
  assert.match(fresh.problems[0], /new unmapped/i);
  const gone = evaluate({
    weeks: WEEKS, themeRefs: THEME_REFS,
    known: { mismatches: [], unmapped: [{ surface: 's', ...found }] },
    surfaces: [surface([at(1, 'a.md')])],
  });
  assert.equal(gone.problems.length, 1);
  assert.match(gone.problems[0], /stale unmapped/i);
});

test('ratchet: a surface that parsed to zero placements fails, even when nothing is known', () => {
  const r = evaluate({
    weeks: WEEKS, themeRefs: THEME_REFS, known: KNOWN_NONE,
    surfaces: [surface([at(1, 'a.md')]), { id: 'empty', entries: [], unmapped: [] }],
  });
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /empty.*zero/i);
});

test('ratchet: a theme agrees with a week when the Path lists any of its refs there', () => {
  const r = evaluate({
    weeks: WEEKS, themeRefs: THEME_REFS, known: KNOWN_NONE,
    surfaces: [surface([at(2, 'theme:family'), at(1, 'theme:family')])],
  });
  assert.deepEqual(r.mismatches, [{ surface: 's', file: 'f.md', week: 1, ref: 'theme:family' }]);
});

test('ratchet: a placement of an undefined theme is a problem, never a silent agreement', () => {
  const r = evaluate({
    weeks: WEEKS, themeRefs: THEME_REFS, known: KNOWN_NONE,
    surfaces: [surface([at(1, 'theme:nope')])],
  });
  assert.ok(r.problems.some((p) => /theme:nope/.test(p) && /not defined/i.test(p)), r.problems);
});

// ---- prose → themes --------------------------------------------------------------------

const MS3 = new Set(['a.md', 'b.md', 'x.md', 'fp.md', 'mse.html']);
const THEMES = {
  family: { keywords: ['family', 'systems'], refs: ['b.md', 'x.md'] },
  'family-meeting': { keywords: ['family meeting', 'family-meeting'], refs: ['fp.md'] },
  mse: { keywords: ['mse', 'mental status exam'], refs: ['mse.html'] },
};

test('prose: longest keyword wins, whole words only, and leftover phrases stay visible', () => {
  const compiled = compileThemes(THEMES, MS3);
  assert.deepEqual(mapProse('Family/discharge/systems', compiled),
    { themes: ['theme:family'], unmapped: ['discharge'] });
  assert.deepEqual(mapProse('Draft a family-meeting agenda and the Mental Status Exam', compiled),
    { themes: ['theme:family-meeting', 'theme:mse'], unmapped: [] });
  // "MSEs" matches as a plural; "Familyish" is not the word "family"; a phrase with at least one
  // match is mapped, and a phrase with none ("then plan") is reported verbatim.
  assert.deepEqual(mapProse('Familyish MSEs, then plan', compiled),
    { themes: ['theme:mse'], unmapped: ['then plan'] });
  assert.deepEqual(mapProse('Familyish', compiled), { themes: [], unmapped: ['Familyish'] });
});

test('prose: the theme table refuses refs that are not MS3 pages and duplicate keywords', () => {
  const gone = { t: { keywords: ['k'], refs: ['gone.md'] } };
  assert.throws(() => compileThemes(gone, MS3), /gone\.md/);
  assert.throws(() => compileThemes({
    t: { keywords: ['k'], refs: ['a.md'] }, u: { keywords: ['K'], refs: ['b.md'] },
  }, MS3), /keyword "k" is in both t and u/);
  assert.throws(() => compileThemes({ t: { keywords: [], refs: ['a.md'] } }, MS3), /keywords/);
});

// ---- links → refs ----------------------------------------------------------------------

test('links: ?page= / ?tool= and relative source links resolve to MS3 slugs, others do not', () => {
  const shipped = {
    ms3: new Set(['t_mood.md', 'mse.html']),
    slugBySource: new Map([['03_Core/Mood/mood.md', 't_mood.md']]),
  };
  const from = '01_Six/Week_2/README.md';
  assert.equal(resolveLink('?page=t_mood.md', from, shipped), 't_mood.md');
  assert.equal(resolveLink('?tool=mse.html#top', from, shipped), 'mse.html');
  assert.equal(resolveLink('../../03_Core/Mood/mood.md', from, shipped), 't_mood.md');
  assert.equal(resolveLink('?page=rotation.md', from, shipped), null, 'a res-only slug');
  assert.equal(resolveLink('https://example.org/paper', from, shipped), null);
  assert.deepEqual(linksIn('see [Mood](?page=t_mood.md) and [MSE](?tool=mse.html).'),
    [{ text: 'Mood', target: '?page=t_mood.md' }, { text: 'MSE', target: '?tool=mse.html' }]);
});

// ---- surface parsers -------------------------------------------------------------------

test('table: reads the Week table under the named heading; a missing heading throws', () => {
  const md = [
    '# Doc', '', '| Week | Focus |', '|---|---|', '| 9 | decoy |', '',
    '## Weekly Plan', '', '| Week | Focus | Skill |', '|---|---|---|',
    '| 1 | Mood, psychosis | MSE |', '| 2 | Family | Plan |', '', 'after',
  ].join('\n');
  assert.deepEqual(parseWeekTable(md, { heading: 'Weekly Plan' }), [
    { week: 1, cells: ['Mood, psychosis', 'MSE'] },
    { week: 2, cells: ['Family', 'Plan'] },
  ]);
  assert.deepEqual(parseWeekTable(md, { heading: null })[0], { week: 9, cells: ['decoy'] });
  assert.throws(() => parseWeekTable(md, { heading: 'Nope' }), /Nope/);
});

test('sections: one entry per "## Week N" section, stopping at the next heading', () => {
  const md = ['# Map', '', '## Week 1 — A', '', 'x [A](?page=a.md)', '', '## Week 2 — B', '',
    'y', '', '## Faculty Note', '', 'z'].join('\n');
  assert.deepEqual(parseWeekSections(md), [
    { week: 1, body: '\nx [A](?page=a.md)\n' },
    { week: 2, body: '\ny\n' },
  ]);
});

test('fd practice: FD_PATH_PRACTICE is read by index; a missing array throws', () => {
  const js = ['var X=1;', 'var FD_PATH_PRACTICE=[', '  null,', "  {skill:'Do A', feedback:'?'},",
    "  {skill:'Do B',", "    feedback:'?'}", '];', 'function f(){}'].join('\n');
  assert.deepEqual(parseFdPractice(js), [{ week: 1, skill: 'Do A' }, { week: 2, skill: 'Do B' }]);
  assert.throws(() => parseFdPractice('var Y=[];'), /FD_PATH_PRACTICE/);
});

// ---- the live tree ---------------------------------------------------------------------

test('every week plan agrees with curriculum.json learningPaths.ms3, bar the known drift', (t) => {
  const write = process.env.SCHEDULE_DRIFT_WRITE === '1';
  const { problems, summary, wrote } = runLive({ write });
  for (const line of summary) t.diagnostic(line);
  if (wrote) t.diagnostic(`SCHEDULE_DRIFT_WRITE=1: rewrote ${wrote}`);
  assert.deepEqual(problems, [], 'Schedule drift changed. If the change is intended (a PR that '
    + 'edits curriculum.json or a week surface), regenerate and review the diff:\n'
    + '  SCHEDULE_DRIFT_WRITE=1 node --test tests/schedule-consistency.test.mjs\n'
    + 'A vacuity problem (missing file, zero placements) is never fixed by regenerating.');
});
