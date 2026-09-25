// Retired instruments must PRESENT as references, not as bedside tools.
//
// Fresh Eyes Audit A3 (2026-08-27): #411/#413 retitled the C-SSRS and BFCRS pages to
// "— Official Form & Training" and stripped their reproductions, but every wayfinding label
// around them still promised a scorer. Both sat in Quick Tools, listed under the Library's
// "Interactive tools" column, and carried the `tool` chip; BFCRS was a tool-kind item in the
// resident Week-1 path. A learner reaching for a scale mid-shift got a removal notice.
//
// The trap this file exists to guard, learned the hard way: `rights` is a PRESENTATION flag, not
// a kind. A first attempt made it a third `kind` value; the served site then 404'd both pages,
// because every loading/routing/location path in the SPA, the wiring layer and the smoke crawler
// branches on kind==='tool' to choose between /tools/<f> and /content/<f>. No local gate caught
// it — nothing local fetches built URLs — only the CI nav crawl did.
//
// So these tests assert BOTH halves: the page presents as a reference, AND it keeps kind 'tool'
// so it still loads. A future change that demotes the kind to win the label breaks the site.

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
  test(`${ref} is registered in curriculum.json's rightsReferences`, () => {
    assert.ok((CUR.rightsReferences || []).includes(ref),
      `${ref} must be listed in rightsReferences (mirrored from instrument_rights.json)`);
  });

  test(`${ref} keeps nav kind "tool" in BOTH registries so it still loads from /tools/`, () => {
    // Non-negotiable: demoting the nav kind 404s the page. See the header note.
    assert.match(buildDeploy, new RegExp(`_tool\\("${ref.replace('.', '\\.')}"`));
    const m = residentSection.match(new RegExp(`"f":"${ref.replace('.', '\\.')}","k":"([a-z]+)"`));
    assert.ok(m, `${ref} not found in resident_section.py nav`);
    assert.equal(m[1], 'tool');
  });

  test(`${ref} carries the rights flag on both audiences, with kind still "tool"`, () => {
    for (const audience of ['ms3', 'resident']) {
      const item = indexFor(audience).byRef[ref];
      assert.equal(item.rights, true, `${ref} lost its rights flag on ${audience}`);
      assert.equal(item.kind, 'tool', `${ref} must stay kind "tool" to keep loading`);
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

// ---- the reader's own kicker (the surface A3 named first) -------------------------------------
// fdReader derives isTool from the file extension for its tool MECHANICS (toolbar, expand,
// #fd-tool-region), which a rights page still needs — it is still an .html artifact in the tool
// frame. Only the copy may branch, or "Interactive tool · self-paced" sits over a page whose
// entire purpose is to say the instrument is not reproduced here.

// eslint-disable-next-line no-new-func
const R = new Function('governanceBadge', `
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_edition_student.js')}
  ${read('frontdoor/fd_today.js')}
  ${read('frontdoor/fd_reader.js')}
  return { fdReader: fdReader };
`)(() => '');

for (const [ref, week] of [['cssrs.html', 5], ['bfcrs.html', null]]) {
  test(`${ref} is not labelled an "Interactive tool" in the reader`, () => {
    const html = R.fdReader(indexFor('ms3'), { ref, week, done: {} }, '');
    const eyebrow = (html.match(/fd-eyebrow">([^<]*)</) || [])[1];
    assert.ok(eyebrow, 'eyebrow should render');
    assert.doesNotMatch(eyebrow, /Interactive tool/, `eyebrow reads "${eyebrow}"`);
    assert.match(eyebrow, /Reference/);
  });

  test(`${ref} does not advertise itself as "self-paced"`, () => {
    const html = R.fdReader(indexFor('ms3'), { ref, week, done: {} }, '');
    const meta = (html.match(/fd-article__meta">([^<]*)</) || [])[1];
    assert.notEqual(meta, 'self-paced');
    assert.match(meta, /not reproduced/);
  });

  test(`${ref} keeps the tool MECHANICS — it is still an .html artifact`, () => {
    const html = R.fdReader(indexFor('ms3'), { ref, week, done: {} }, '<p>body</p>');
    assert.match(html, /fd-reader--tool/, 'the tool frame must stay');
    assert.match(html, /id="fd-tool-region"/);
  });
}

// ---- wayfinding labels may not promise to SCORE a retired or restricted instrument -----------
// Architecture review 2026-09-24, WP-1a(g): after the CIWA-Ar retired and the BFCRS was
// restricted, two chips still read "Screen & score — Bush-Francis (BFCRS)" and "Score at the
// bedside — CIWA-Ar / COWS", and a question-bank link carried the second one. No test pinned
// either string. Prose may still teach that a unit scores the CIWA-Ar on its own form (that is
// administration, which the rule permits); what may not happen is a LABEL that promises the site
// will do the scoring. The set of shipped sources comes from shipped_pages.json (ADR-002).

const SHIPPED = readJson('../13_Faculty_Resources/_automation/site_build/shipped_pages.json');
const QB = readJson('../question_bank.json');
const SCORED_HERE = /\bscor(?:e|es|ing)\b[^<>\n]{0,30}\b(?:CIWA-Ar|BFCRS|Bush-Francis|C-SSRS)\b|\b(?:CIWA-Ar|BFCRS|Bush-Francis|C-SSRS)\b[^<>\n]{0,20}\bscor(?:e|er|ing)\b/i;
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');

function chipLabels() {
  const sources = [...new Set(SHIPPED.pages.flatMap((p) => [p.source, ...(p.extraSources || [])]).filter(Boolean))];
  const labels = [];
  for (const rel of sources) {
    const text = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
    for (const m of text.matchAll(/<a class="tl-chip"[^>]*>([^<]*)<\/a>/g)) labels.push([rel, decode(m[1])]);
  }
  return labels;
}

test('the "scored here" pattern catches the retired phrasings and spares their replacements', () => {
  assert.match('Screen & score — Bush-Francis (BFCRS)', SCORED_HERE);
  assert.match('Score at the bedside — CIWA-Ar / COWS', SCORED_HERE);
  assert.doesNotMatch('Bush-Francis — official form & how to administer', SCORED_HERE);
  assert.doesNotMatch('Withdrawal recognition card (COWS)', SCORED_HERE);
});

test('no shipped chip label promises to score a retired or restricted instrument', () => {
  const labels = chipLabels();
  // Chips are few, so a count floor proves little; instead the scan must reach the two pages
  // whose chips this guard was written for. If the regex or the source list breaks, it fails here.
  const reached = new Set(labels.map(([rel]) => rel));
  for (const rel of ['04_Acute_and_Safety/Catatonia/catatonia_inpatient_teaching.md',
    '03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md']) {
    assert.ok(reached.has(rel), `the chip scan never reached ${rel}`);
  }
  const bad = labels.filter(([, label]) => SCORED_HERE.test(label));
  assert.deepEqual(bad, [], `chips that promise scoring: ${JSON.stringify(bad)}`);
});

test('no question-bank link label promises to score a retired or restricted instrument', () => {
  const labels = QB.items.filter((it) => it.link && it.link.label).map((it) => [it.id, it.link.label]);
  assert.ok(labels.length >= 50, `expected many question-bank link labels, saw ${labels.length}`);
  const bad = labels.filter(([, label]) => SCORED_HERE.test(label));
  assert.deepEqual(bad, [], `link labels that promise scoring: ${JSON.stringify(bad)}`);
});
