// Retired instruments must PRESENT as references, not as bedside tools.
//
// Fresh Eyes Audit A3 (2026-08-27): #411/#413 retitled the C-SSRS and BFCRS pages to
// "— Official Form & Training" and stripped their reproductions, but every wayfinding label
// around them still promised a scorer. Both sat in Quick Tools, listed under the Library's
// "Interactive tools" column, and carried the `tool` chip; BFCRS was a tool-kind item in the
// resident Week-1 path. A learner reaching for a scale mid-shift got a removal notice.
//
// The trap this file exists to guard: fd_data.js derives kind from the FILE EXTENSION
// (fdIsTool = /\.html$/), so flipping the nav's "k" alone changes nothing — cssrs.html is an
// .html file and stays a tool. The `rights` kind must override the extension heuristic, and
// these tests fail if that override is removed even while the nav still says "rights".

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

const RETIRED = ['cssrs.html', 'bfcrs.html'];

// eslint-disable-next-line no-new-func
const F = new Function(`
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_edition_student.js')}
  ${read('frontdoor/fd_today.js')}
  return { fdBuildIndex: fdBuildIndex, fdQuickTools: fdQuickTools, fdItemsForWeek: fdItemsForWeek };
`)();

const CUR = readJson('../curriculum.json');
const META = readJson('../topic_meta.json');
const TOOLS = readJson('../tool_registry.json');
const MAN = readJson('../13_Faculty_Resources/_automation/site_build/site_manifest.json');
const indexFor = (audience) => F.fdBuildIndex(
  { ...CUR, path: CUR.learningPaths[audience], weeks: CUR.learningPaths[audience].weeks },
  META, TOOLS, MAN,
);

const buildDeploy = read('build_deploy.py');
const residentSection = read('resident_section.py');

for (const ref of RETIRED) {
  test(`${ref} is declared a rights reference in the MS3 nav, not a tool`, () => {
    assert.match(buildDeploy, new RegExp(`_rights\\("${ref.replace('.', '\\.')}"`),
      `${ref} must be registered with _rights(), not _tool()`);
  });

  test(`${ref} is declared a rights reference in the resident nav, not a tool`, () => {
    const entry = new RegExp(`"f":"${ref.replace('.', '\\.')}","k":"([a-z]+)"`);
    const m = residentSection.match(entry);
    assert.ok(m, `${ref} not found in resident_section.py nav`);
    assert.equal(m[1], 'rights');
  });

  test(`${ref} resolves to kind "rights" despite its .html extension`, () => {
    // The regression this file exists for: fdIsTool would otherwise call it a tool.
    for (const audience of ['ms3', 'resident']) {
      assert.equal(indexFor(audience).byRef[ref].kind, 'rights',
        `${ref} is kind "${indexFor(audience).byRef[ref].kind}" on ${audience}`);
    }
  });

  test(`${ref} never appears in Quick Tools on either site`, () => {
    for (const audience of ['ms3', 'resident']) {
      const idx = indexFor(audience);
      for (let week = 1; week <= idx.weeks.length; week++) {
        const quick = F.fdQuickTools(idx, F.fdItemsForWeek(idx, week)).map((t) => t.ref);
        assert.equal(quick.includes(ref), false,
          `${ref} surfaced in ${audience} week ${week} Quick Tools: ${quick.join(', ')}`);
      }
    }
  });

  test(`${ref} is not filed under the Library's "Interactive tools" column`, () => {
    const col = CUR.libraryColumns.find((c) => c.name === 'Interactive tools');
    assert.ok(col, 'the "Interactive tools" column should exist');
    assert.equal(col.refs.includes(ref), false,
      `${ref} reproduces nothing — it cannot list as an interactive tool`);
  });

  test(`${ref} is still reachable from some Library column`, () => {
    // Demoting the kind must not orphan the page: it stays findable, just honestly labelled.
    const columns = CUR.libraryColumns.filter((c) => c.refs.includes(ref)).map((c) => c.name);
    assert.equal(columns.length, 1, `${ref} should sit in exactly one column, found: ${columns}`);
  });
}
