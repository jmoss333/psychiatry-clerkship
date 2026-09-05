/* The one render path for the pinned "On the Unit Practice and Tools" panel.
 *
 * WHY IT EXISTS: three separate pieces of work (WP-A, WP-B, WP-F) each turned on the same
 * question — "does this source edit change what a learner actually sees?" — and each time the
 * answer came from rendering all 74 panels by hand, diffing, and throwing the script away. The
 * strongest verification in that work ("0 of 74 panels changed") was a claim in a PR body that
 * nobody could re-run. This module is that script, kept.
 *
 * It slices buildTpl and its helpers out of spa_index.html between the panel markers and
 * evaluates them for real against the REAL registries, exactly as tests/practice-panel.test.mjs
 * did inline before this file existed — the slicing technique follows tests/calib-panel.test.mjs.
 * Both that test and bin/render_panels.mjs import from here, so the HTML the assertions run over
 * and the HTML in tests/__panels__/ can never drift apart. That shared path is the point: a
 * snapshot rendered by a second, parallel implementation would be worse than no snapshot.
 *
 * WHAT IS AND IS NOT CLAIMED. buildTpl is pure with respect to its inputs — the topic entry, the
 * ref, and the module-level registries — so rendering it outside a browser is faithful. Nothing
 * is claimed about the panel's runtime behaviour: no DOM, no event handlers, no localStorage, no
 * phasePolicy() clock. `window` is passed as {} for exactly that reason. What this module
 * reproduces is the markup the build injects into the page, which is what the snapshots compare.
 *
 * TWO INPUT BINDINGS, ONE EVALUATOR. renderFromSource() reads the source registries and backs
 * tests/practice-panel.test.mjs's property assertions, which must run on a fresh clone in CI.
 * renderFromBuild(site) reads _build/<site>/index.html — the shipped renderer over the shipped
 * data — and backs the per-audience snapshots. The slicing and the `new Function` construction
 * are shared; only the inputs differ, so there is still no second renderer.
 *
 * COVERAGE: 96 of the 97 shipped pages, across both audiences. rapid_review.md has no
 * topic_meta entry and therefore renders no panel; tests/panel-snapshots.test.mjs asserts that
 * it is the only page missing, by name, rather than counting around it.
 *
 * ORDERING: the byte-comparison gate runs from build_and_check.sh AFTER build_deploy.py, so a
 * failure leaves _build/ current and `node bin/render_panels.mjs --write --site <that site>`
 * repairs it with no rebuild -- scoped to the site, because bare --write checks both audiences
 * and exits 2 on whichever tree an ms3-only build left stale. A build-dependent test in the
 * PRE-build node suite would wedge the build that fixes it (CLAUDE.md, T17); that is why the
 * comparison is not there.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { shippedItemsWithSites } from '../faculty-console/content-universe.mjs';

const ROOT = new URL('../', import.meta.url);
export const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
export const readJSON = (p) => JSON.parse(read(p));

const SPA = '13_Faculty_Resources/_automation/site_build/spa_index.html';
export const source = read(SPA);

function slice(src, startMarker, endMarker, { keepEnd = true } = {}) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return src.slice(a, keepEnd ? b + endMarker.length : b);
}

export const panelCode = slice(source, '/* ---- practice panel ---- */', '/* ---- end practice panel ---- */');
// buildWorkflow lives outside the panel block but is the third renderer that links tools.
// keepEnd:false — the end marker is the NEXT declaration, not part of the slice.
export const workflowCode = slice(source, '  var WF_STAGE_LABELS=', '  function toolExtraFromParams', { keepEnd: false });

// ---- the real registries, joined exactly as the shell joins them ------------------------------
const fdCtx = {};
vm.createContext(fdCtx);
vm.runInContext(read('13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js'), fdCtx);

export const CURRICULUM = readJSON('curriculum.json');
export const TOPIC_META = readJSON('topic_meta.json');
export const TOOL_REGISTRY = readJSON('tool_registry.json');
export const SITE_MANIFEST = readJSON('13_Faculty_Resources/_automation/site_build/site_manifest.json');
export const FD_INDEX = fdCtx.fdBuildIndex(CURRICULUM, TOPIC_META, TOOL_REGISTRY, SITE_MANIFEST);

export const RIGHTS_REFS = CURRICULUM.rightsReferences || [];
export const manifestTitle = (slug) => {
  for (const group of [SITE_MANIFEST.tools || [], SITE_MANIFEST.md || []]) {
    for (const entry of group) if (entry[1] === slug) return entry[2];
  }
  return null;
};

export const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const ctaHref = (h) => {
  h = h || '';
  const m = h.match(/^tools\/([^/?#]+\.html)$/);
  return m ? `?tool=${m[1]}` : h;
};
export const ctaAttrs = (h) => (/^\?(page|tool)=/.test(h) ? '' : ' target="_blank" rel="noopener"');

// The build injects case titles into a `var PRACTICE_CASE_TITLES={};` needle (build_deploy.py).
// Doing the same replacement here pins that needle: if it is renamed or removed, this throws
// rather than silently rendering a panel whose drills have all lost their names.
export const CASE_TITLES = Object.fromEntries(
  (readJSON('communication_cases.json').cases || [])
    .filter((c) => c && c.id && c.title).map((c) => [c.id, c.title]),
);
const CASE_NEEDLE = 'var PRACTICE_CASE_TITLES={};';
assert.equal(panelCode.split(CASE_NEEDLE).length - 1, 1,
  'the practice panel must carry exactly one PRACTICE_CASE_TITLES injection needle');
const injectedPanelCode = panelCode.replace(
  CASE_NEEDLE, `var PRACTICE_CASE_TITLES=${JSON.stringify(CASE_TITLES)};`);

export const F = new Function('esc', 'ctaHref', 'ctaAttrs', 'FD_INDEX', 'FD_TOOL_REGISTRY', 'window',
  `${workflowCode}\n${injectedPanelCode}\nreturn {
     buildTpl: buildTpl, buildPracticeTools: buildPracticeTools, buildWorkflow: buildWorkflow,
     practiceToolLabel: practiceToolLabel, practiceIsRights: practiceIsRights,
     practiceActionLabel: practiceActionLabel, hasPracticeTpl: hasPracticeTpl,
     WF_FIELDS: WF_FIELDS, WF_STAGE_LABELS: WF_STAGE_LABELS,
     practiceCaseLabel: practiceCaseLabel, practiceIsSafe: practiceIsSafe,
     practiceRegistryTools: practiceRegistryTools, practicePrimary: practicePrimary,
     practiceReason: practiceReason, practiceLinkedTools: practiceLinkedTools };`,
)(esc, ctaHref, ctaAttrs, FD_INDEX, TOOL_REGISTRY, {});

export const actionKey = (h) => {
  const s = String(h || '');
  const m = s.match(/[?&]tool=([^&#]+)/) || s.match(/^tools\/([^/?#]+\.html)$/);
  return m ? decodeURIComponent(m[1]) : '';
};

export const topicEntries = Object.entries(TOPIC_META).filter(([, m]) => m && typeof m === 'object');

/** Every page that renders a panel FROM THE SOURCE REGISTRIES, as [ref, html]. Sorted by ref so
 *  the set is order-stable regardless of key order in topic_meta.json — snapshots must not churn
 *  on a re-serialisation. */
export const renderFromSource = () => topicEntries
  .filter(([, m]) => F.hasPracticeTpl(m))
  .map(([ref, m]) => [ref, F.buildTpl(m, ref)])
  .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

// ---- snapshot form ----------------------------------------------------------------------------
//
// buildTpl emits one very long line. Stored that way, every change reads as "line 1 changed" and
// the diff is worthless — which defeats the whole purpose, since the reviewable diff IS the
// deliverable. So a snapshot breaks between adjacent tags and nowhere else.
//
// This only ever INSERTS a newline between `>` and `<`; it deletes and rewrites nothing, so no
// change to the render can hide inside the formatting. tests/panel-snapshots.test.mjs pins that
// insertion-only property rather than leaving it as an assurance here — over the stored corpus,
// AND over literal probes, because the corpus only exercises the byte classes it happens to
// contain and a normalisation of anything else would cancel out on both sides of the gate.

/** Break between adjacent tags so a snapshot diffs line by line. */
export const formatPanel = (html) => `${String(html).replace(/></g, '>\n<')}\n`;

/** The exact inverse of formatPanel, on any input formatPanel produced. */
export const unformatPanel = (text) => String(text).replace(/\n$/, '').split('>\n<').join('><');

/** tests/__panels__/<file> for a topic ref. The ref is kept verbatim so the file name says
 *  which topic_meta key it came from; refs are `*.md`, so files read `delirium.md.html`. */
export const snapshotName = (ref) => `${String(ref).replace(/[/\\]/g, '__')}.html`;

// ---- the built-artifact render path -----------------------------------------------------------
//
// WHY THE BUILD AND NOT THE REGISTRIES: neither shipped site renders from the source registries.
// resident_section.py patches OUT's topic_meta with resident CTAs (:301) and rebuilds the index
// from resident nav (:358); both builds append Case-of-the-Week topic_meta derived at build time
// (build_deploy.py:308, resident_section.py:318). Reading _build/<site>/index.html evaluates the
// SHIPPED renderer over the SHIPPED data, so both are covered without re-deriving either — which
// is also what keeps this out of tests/shipped-pages-readers.test.mjs's way.

export const AUDIENCES = Object.freeze(['ms3', 'res']);

const REPO = fileURLToPath(ROOT);
export const builtIndexPath = (site) => path.join(REPO, '_build', assertSite(site), 'index.html');

function assertSite(site) {
  assert.ok(AUDIENCES.includes(site), `unknown audience '${site}' (expected ${AUDIENCES.join('|')})`);
  return site;
}

/* Every input whose edit invalidates a rendered panel, for staleBuildReason(). A path that does
   not exist throws there — a typo would make the freshness check vacuously "fresh" and retire
   the contract silently.

   site_manifest.json is declared even though shipped_pages.json already covers it TRANSITIVELY:
   shipped_pages.py hashes the manifest into the generated_from block it writes, so any manifest
   byte-change makes the tracked shipped_pages.json differ from a regeneration and `--check`
   fails in build_and_check.sh, ci.yml, bin/verify.sh and the post-edit hook. That chain is a
   correctness gate, not a freshness one: it only moves shipped_pages.json's MTIME once someone
   regenerates, while the manifest reaches these panels directly as FD_SITE_MANIFEST ->
   fdBuildIndex. Between the edit and the regeneration the guard would call a build fresh that
   its own inputs have outrun, so the dependency is declared rather than inferred.

   The Case-of-the-Week chain is declared WHOLE -- the registry and the two modules that turn
   it into panels -- because all three reach FD_TOPIC_META and nothing else moves when they
   change. Both builds derive per-case topic_meta from cotw_registry.json at build time
   (build_deploy.py:308, resident_section.py:321); cotw_meta.py IS that derivation, and its
   "Shelf-level takeaway: %s" is the line that carries a week's `tldr` into the rendered panel;
   cotw_slug.py fixes the key each entry lands under, which is also the snapshot's file name, so
   a change to the formula rewrites the corpus wholesale. Undeclared, the registry produced a
   FALSE CLEAN: appending to weeks[0].tldr and re-running the gate WITHOUT a rebuild reported
   "0 of 164 panels changed" against a build its own inputs had outrun, while the same edit
   rebuilt moves 2 panels. Those two omissions were FRESH, not inherited: this list was written
   on 2026-09-05 (33f3a1c), by which date cotw_meta.py had been a standalone module since
   2026-07-31 (cc2a0bc, #278) and cotw_slug.py since 810c0bf (2026-09-04), so neither was ever
   covered here by its caller. Only cotw_slug was ever extracted at all -- it was `def
   _cotw_slug` inside build_deploy.py until 810c0bf -- and that extraction still predates this
   list. cotw_meta.py was born standalone; its code never sat in build_deploy.py.

   frontdoor_catalog.py is declared for exactly the reason the registry was: it writes ALL FOUR
   FD_* payloads renderFromBuild evaluates (inject_frontdoor_payload), and per its own docstring
   the manifest it emits "is rebuilt from `catalog`" rather than copied from site_manifest.json
   -- that manifest becomes FD_SITE_MANIFEST -> fdBuildIndex -> FD_INDEX, which the panel reads
   for every tool title it prints. Unlike site_manifest.json it is NOT hashed into
   shipped_pages.json's generated_from (only cotw_registry.json, site_extras.py and
   site_manifest.json are), so it had no transitive coverage of any kind -- not even the
   correctness chain described above. Edit it, skip the rebuild, and the gate reported the same
   "0 of 164 panels changed" false clean.

   WHAT WAS WALKED AND CLEARED, so the next reader need not re-walk it. On both audiences the
   built panel and workflow slices are byte-identical to spa_index.html's plus the one
   PRACTICE_CASE_TITLES injection, which clears every HTML transform the two builds apply to
   index.html: common.py's page/dark-mode/snippet passes and its CONTRAST_FIX literals (absent
   from both slices), crisis_block.py (its marker sits ~25k bytes ahead of the panel block),
   pairings_block.py (markdown only) and media_guard.py (neither index.html carries a <video>).
   surface_governance.annotate_navigation only ADDS a governance triplet -- never a title, slug
   or kind -- and the panel never reads `.governance`, so it cannot move a render.
   validate_tool_governance.py and validate_rotation_edition_catalog.py feed FD_CORE_REVISION
   and FD_ROTATION_EDITION_CATALOG, neither of which is one of the four payloads. site_extras.py
   supplies copy pairs only (RES_EXTRA, PROTO_TOOLS, the ms3 orientation video); the resident
   nav titles for those pages are literals in resident_section.py, and its one route into this
   render is shipped_pages.json, which is declared. */
export const PANEL_BUILD_INPUTS = [
  '13_Faculty_Resources/_automation/site_build/spa_index.html',
  '13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js',
  '13_Faculty_Resources/_automation/site_build/build_deploy.py',
  '13_Faculty_Resources/_automation/site_build/resident_section.py',
  '13_Faculty_Resources/_automation/site_build/frontdoor_catalog.py',
  '13_Faculty_Resources/_automation/site_build/cotw_meta.py',
  '13_Faculty_Resources/_automation/site_build/cotw_slug.py',
  '13_Faculty_Resources/_automation/site_build/shipped_pages.json',
  '13_Faculty_Resources/_automation/site_build/site_manifest.json',
  '08_Cases_and_Simulation/case-of-the-week/cotw_registry.json',
  'topic_meta.json',
  'curriculum.json',
  'tool_registry.json',
  'communication_cases.json',
].map((rel) => path.join(REPO, rel));

const SHIPPED = readJSON('13_Faculty_Resources/_automation/site_build/shipped_pages.json');

/** Every page slug the derived universe scopes to `site`. Asking shipped_pages.json rather
 *  than a producer is ADR-002's rule; `sites` must stay an array, hence shippedItemsWithSites. */
export const shippedPanelRefs = (site) => new Set(
  shippedItemsWithSites({ shipped: SHIPPED })
    .filter((row) => row.kind === 'page' && row.sites.includes(assertSite(site)))
    .map((row) => row.slug),
);

/* Each payload is one `var FD_X={…};` line the build injected. Extracted by name rather than as
   one span so a missing or duplicated injection names itself, and so the extraction depends on
   neither the injection ORDER nor what sits beside these four. Today build_deploy.py writes them
   on four consecutive lines with an unrelated FD_ROLES on the line immediately after
   (_build/ms3/index.html:1963-1967); a first-to-last span would start swallowing a neighbour the
   day that layout changes, and would do it silently. */
const PAYLOAD_VARS = ['FD_CURRICULUM', 'FD_TOPIC_META', 'FD_TOOL_REGISTRY', 'FD_SITE_MANIFEST'];

function payloadSource(html, site) {
  return PAYLOAD_VARS.map((name) => {
    const needle = `var ${name}=`;
    const at = html.indexOf(needle);
    assert.ok(at !== -1, `${site}: built index.html injects no ${name}`);
    assert.equal(html.indexOf(needle, at + 1), -1, `${site}: ${name} is injected more than once`);
    /* No newline anywhere after the declaration means it runs to EOF, so there is no line to
       slice. This cannot detect a payload that became MULTI-line — that one still finds a
       newline, and its truncated slice fails to parse in vm.runInContext instead. */
    const end = html.indexOf('\n', at);
    assert.ok(end !== -1,
      `${site}: ${name} reaches EOF with no newline; there is no line to slice`);
    return html.slice(at, end);
  }).join('\n');
}

function evalPayload(html, site) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(read('13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js'), ctx);
  vm.runInContext(payloadSource(html, site), ctx);
  for (const name of PAYLOAD_VARS) {
    assert.ok(ctx[name] && typeof ctx[name] === 'object',
      `${site}: ${name} did not evaluate to an object`);
  }
  return ctx;
}

/** The four FD_* payloads the `site` build injected, evaluated — everything that build COULD
 *  render, before renderFromBuild() drops what the site does not publish. Exported because the
 *  filtered output alone cannot distinguish a page the filter excluded from one the build never
 *  carried, and that distinction is the contract tests/panel-build-render.test.mjs pins. */
export const builtPayload = (site) => evalPayload(readFileSync(builtIndexPath(site), 'utf8'), site);

/** Render every panel the `site` build publishes, as [ref, html], sorted by ref.
 *  Sorted so the set is order-stable regardless of key order in the injected payload. */
export function renderFromBuild(site) {
  const html = readFileSync(builtIndexPath(site), 'utf8');
  const ctx = evalPayload(html, site);
  const index = ctx.fdBuildIndex(ctx.FD_CURRICULUM, ctx.FD_TOPIC_META, ctx.FD_TOOL_REGISTRY, ctx.FD_SITE_MANIFEST);

  // The build already replaced the PRACTICE_CASE_TITLES needle, so unlike the source path
  // there is nothing to inject here — this is the renderer exactly as it ships.
  const builtPanel = slice(html, '/* ---- practice panel ---- */', '/* ---- end practice panel ---- */');
  const builtWorkflow = slice(html, '  var WF_STAGE_LABELS=', '  function toolExtraFromParams', { keepEnd: false });
  assert.ok(!builtPanel.includes('var PRACTICE_CASE_TITLES={};'),
    `${site}: the build left PRACTICE_CASE_TITLES uninjected; drills would render unnamed`);

  const built = new Function('esc', 'ctaHref', 'ctaAttrs', 'FD_INDEX', 'FD_TOOL_REGISTRY', 'window',
    `${builtWorkflow}\n${builtPanel}\nreturn { buildTpl: buildTpl, hasPracticeTpl: hasPracticeTpl };`,
  )(esc, ctaHref, ctaAttrs, index, ctx.FD_TOOL_REGISTRY, {});

  const ships = shippedPanelRefs(site);
  return Object.entries(ctx.FD_TOPIC_META)
    .filter(([ref, m]) => m && typeof m === 'object' && ships.has(ref) && built.hasPracticeTpl(m))
    .map(([ref, m]) => [ref, built.buildTpl(m, ref)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** tests/__panels__/<site>/ — one directory per audience, because a single directory could
 *  not say which site a file described. That ambiguity is what produced all three defects. */
export const snapshotDir = (site) => new URL(`__panels__/${assertSite(site)}/`, new URL('tests/', ROOT));
