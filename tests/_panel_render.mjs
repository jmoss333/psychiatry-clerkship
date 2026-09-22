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
 * WHAT IT COVERS: the MS3 source-registry render of the 74 topic_meta.json entries — NOT
 * either shipped site's own payload. See the SCOPE note on SNAPSHOT_DIR below; the gap is
 * pinned as data in tests/panel-snapshots.test.mjs rather than left to a reader's memory.
 *
 * NOTE ON ORDERING: the snapshots depend only on source, never on _build/, so a stale snapshot is
 * always fixable by `node bin/render_panels.mjs --write` — which does not run through
 * build_and_check.sh. That matters because build_and_check.sh is `set -euo pipefail` and runs the
 * node suite BEFORE build_deploy.py: a test that could only be repaired by building would wedge
 * the build that repairs it (see the T17 trap noted in CLAUDE.md). This one cannot.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

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

/** Every page that renders a panel, as [ref, html]. Sorted by ref so the set is order-stable
 *  regardless of key order in topic_meta.json — snapshots must not churn on a re-serialisation. */
export const renderAll = () => topicEntries
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
// round-trip on the real corpus rather than leaving it as an assurance in a comment.

/** Break between adjacent tags so a snapshot diffs line by line. */
export const formatPanel = (html) => `${String(html).replace(/></g, '>\n<')}\n`;

/** The exact inverse of formatPanel, on any input formatPanel produced. */
export const unformatPanel = (text) => String(text).replace(/\n$/, '').split('>\n<').join('><');

/** tests/__panels__/<file> for a topic ref. The ref is kept verbatim so the file name says
 *  which topic_meta key it came from; refs are `*.md`, so files read `delirium.md.html`. */
export const snapshotName = (ref) => `${String(ref).replace(/[/\\]/g, '__')}.html`;

/* The snapshots are the MS3 SOURCE-REGISTRY render, and the path says so.
 *
 * SCOPE, stated plainly because a gate that overstates its reach is worse than none
 * (Codex P2 on #539). Neither shipped site renders from these registries:
 *   - the resident build injects its OWN FD_TOPIC_META and FD_SITE_MANIFEST, patched from
 *     OUT's copy with resident overlays and rebuilt from resident nav (resident_section.py:301,
 *     :358), so e.g. shelf-mode.html is titled "Board-Style Question Bank" there and
 *     "Shelf Mode — Exam Simulation" here;
 *   - both builds APPEND Case-of-the-Week topic_meta derived at build time
 *     (build_deploy.py:308, resident_section.py:318), which topic_meta.json never contains.
 * So this covers 74 of the 97 shipped pages. tests/panel-snapshots.test.mjs pins that gap
 * against shipped_pages.json as data, so it cannot be forgotten or quietly over-trusted, and
 * so a NEW uncovered producer fails rather than passing silently.
 *
 * Widening to both audiences means reading each build's own topic_meta.json — correct, but it
 * makes the gate build-dependent, and ci.yml runs the node suite on a fresh clone BEFORE the
 * build. That widening now EXISTS for the resident audience, below: renderFromBuild() reads
 * each build's injected payload, tests/__panels__/res/ stores it, and the gate runs from
 * build_and_check.sh AFTER the build rather than in the pre-build node suite. This
 * source-registry path is unchanged and still owns tests/__panels__/ms3/. */
export const SNAPSHOT_DIR = new URL('__panels__/ms3/', new URL('tests/', ROOT));

// ---- the built-artifact render path -----------------------------------------------------------
//
// WHY THE BUILD AND NOT THE REGISTRIES: the SCOPE note above is the whole reason. Neither
// shipped site renders from the source registries, so a source-registry snapshot cannot cover
// the resident site at all — resident_section.py patches OUT's topic_meta with resident CTAs
// and rebuilds the index from resident nav, and both builds append Case-of-the-Week topic_meta
// derived at build time. Reading _build/<site>/index.html evaluates the SHIPPED renderer over
// the SHIPPED data, so no payload is re-derived here and no second renderer exists to disagree
// with the first — the same rule the source path follows.
//
// WHAT THIS COSTS, stated because it is the reason the source path was not simply replaced:
// this render is build-dependent, so it cannot live in the pre-build `node --test` step. It is
// driven from build_and_check.sh after the build (tests/panel_build_gate.mjs), where _build/ is
// current by construction, and guarded by staleBuildReason() for every other invocation.

export const AUDIENCES = Object.freeze(['ms3', 'res']);

const REPO = fileURLToPath(ROOT);

function assertSite(site) {
  assert.ok(AUDIENCES.includes(site), `unknown audience '${site}' (expected ${AUDIENCES.join('|')})`);
  return site;
}

export const builtIndexPath = (site) => path.join(REPO, '_build', assertSite(site), 'index.html');

/* Every input whose edit invalidates a rendered panel, for staleBuildReason(). A path that does
   not exist throws there — a typo would make the freshness check vacuously "fresh" and retire
   this contract silently, which is the one failure mode a freshness guard must not have.

   The list is what a panel actually READS, traced rather than guessed:
     - spa_index.html and fd_data.js are the renderer and the index builder;
     - build_deploy.py and resident_section.py inject the four FD_* payloads, and the resident
       one patches topic_meta and rebuilds the manifest from resident nav;
     - frontdoor_catalog.py writes all four payloads (inject_frontdoor_payload) and REBUILDS the
       manifest from `catalog` rather than copying site_manifest.json, so it reaches
       FD_SITE_MANIFEST -> fdBuildIndex -> every tool title the panel prints;
     - the Case-of-the-Week chain is declared WHOLE — cotw_registry.json is the data,
       cotw_meta.py is the derivation that carries a week's `tldr` into the rendered panel, and
       cotw_slug.py fixes the key each case lands under, which is also the snapshot's file name;
     - topic_meta.json, curriculum.json and tool_registry.json are the source registries both
       builds start from, communication_cases.json supplies the drill names the build injects
       into the PRACTICE_CASE_TITLES needle, and shipped_pages.json decides which slugs a site
       publishes (shippedPanelRefs).

   site_manifest.json is declared even though shipped_pages.json covers it TRANSITIVELY for
   CORRECTNESS: shipped_pages.py hashes the manifest into its generated_from block, so a
   manifest change makes the tracked listing fail `--check`. That chain is a correctness gate,
   not a freshness one — it only moves shipped_pages.json's MTIME once someone regenerates,
   while the manifest reaches these panels directly. Between the edit and the regeneration a
   guard that inferred the dependency would call a build fresh that its own input had outrun. */
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

/** Every page slug the derived universe scopes to `site`. ADR-002's rule is to ask
 *  shipped_pages.json rather than a producer; `sites` is an array because 68 pages ship to
 *  BOTH sites, so a collapsed single value would answer "does this ship on res?" wrongly. */
export const shippedPanelRefs = (site) => new Set(
  SHIPPED.pages
    .filter((p) => p.kind === 'page' && Array.isArray(p.sites) && p.sites.includes(assertSite(site)))
    .map((p) => p.slug),
);

/* Each payload is one `var FD_X={…};` line the build injected. Extracted BY NAME rather than as
   one span, so a missing or duplicated injection names itself, and so the extraction depends on
   neither the injection ORDER nor on what sits beside these four. build_deploy.py writes them on
   consecutive lines today with an unrelated FD_ROLES immediately after; a first-to-last span
   would start swallowing a neighbour the day that layout changes, and would do it silently. */
const PAYLOAD_VARS = ['FD_CURRICULUM', 'FD_TOPIC_META', 'FD_TOOL_REGISTRY', 'FD_SITE_MANIFEST'];

function payloadSource(html, site) {
  return PAYLOAD_VARS.map((name) => {
    const needle = `var ${name}=`;
    const at = html.indexOf(needle);
    assert.ok(at !== -1, `${site}: built index.html injects no ${name}`);
    assert.equal(html.indexOf(needle, at + 1), -1, `${site}: ${name} is injected more than once`);
    /* No newline after the declaration means it runs to EOF, so there is no line to slice. This
       cannot detect a payload that became MULTI-line — that one still finds a newline, and its
       truncated slice fails to parse in vm.runInContext instead of passing silently. */
    const end = html.indexOf('\n', at);
    assert.ok(end !== -1, `${site}: ${name} reaches EOF with no newline; there is no line to slice`);
    return html.slice(at, end);
  }).join('\n');
}

function evalPayload(html, site) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(read('13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js'), ctx);
  vm.runInContext(payloadSource(html, site), ctx);
  for (const name of PAYLOAD_VARS) {
    assert.ok(ctx[name] && typeof ctx[name] === 'object', `${site}: ${name} did not evaluate to an object`);
  }
  return ctx;
}

/** The four FD_* payloads the `site` build injected, evaluated — everything that build COULD
 *  render, before renderFromBuild() drops what the site does not publish. Exported because the
 *  filtered output alone cannot distinguish a page the filter excluded from one the build never
 *  carried, and that distinction is what tests/panel-build-render.test.mjs pins. */
export const builtPayload = (site) => evalPayload(readFileSync(builtIndexPath(site), 'utf8'), site);

/** Render every panel the `site` build publishes, as [ref, html], sorted by ref so the set is
 *  order-stable regardless of key order in the injected payload. */
export function renderFromBuild(site) {
  const html = readFileSync(builtIndexPath(site), 'utf8');
  const ctx = evalPayload(html, site);
  const index = ctx.fdBuildIndex(
    ctx.FD_CURRICULUM, ctx.FD_TOPIC_META, ctx.FD_TOOL_REGISTRY, ctx.FD_SITE_MANIFEST,
  );

  const builtPanel = slice(html, '/* ---- practice panel ---- */', '/* ---- end practice panel ---- */');
  const builtWorkflow = slice(html, '  var WF_STAGE_LABELS=', '  function toolExtraFromParams', { keepEnd: false });
  // The build already replaced the needle, so unlike the source path there is nothing to inject.
  // If it did not, every drill would render unnamed — fail rather than snapshot that.
  assert.ok(!builtPanel.includes(CASE_NEEDLE),
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

/* WHICH AUDIENCES HAVE A BUILD-RENDERED CORPUS, and why it is not both.
 *
 * `renderFromBuild` works for either site — tests/panel-build-render.test.mjs renders both and
 * compares them, which is how we know the resident payload is not a copy of the MS3 one. But
 * only `res` has a STORED corpus, because tests/__panels__/ms3/ already holds the SOURCE-registry
 * render and is owned by bin/render_panels.mjs. Pointing a build-rendered gate at that directory
 * would compare 81 build-rendered panels against 74 source-rendered ones and, under --write,
 * silently overwrite the corpus another tool maintains.
 *
 * Unifying MS3 onto this path is the right end state: it would retire the source/build split and
 * pick up the 13 MS3 Case-of-the-Week panels that no snapshot covers today. It requires
 * rewriting bin/render_panels.mjs, which is a governance path, so it ships as its own PR.
 * Until then this list is the boundary, and asking for a directory outside it throws. */
export const BUILD_SNAPSHOT_AUDIENCES = Object.freeze(['res']);

/** tests/__panels__/<site>/ for the build-rendered corpus. One directory per audience, because
 *  a single directory could not say which site a file described. */
export function buildSnapshotDir(site) {
  assert.ok(BUILD_SNAPSHOT_AUDIENCES.includes(site),
    `'${site}' has no build-rendered corpus (only ${BUILD_SNAPSHOT_AUDIENCES.join(', ')}).\n`
    + '  tests/__panels__/ms3/ is the SOURCE-registry render, maintained by bin/render_panels.mjs;\n'
    + '  a build-rendered write there would overwrite it. See BUILD_SNAPSHOT_AUDIENCES.');
  return new URL(`__panels__/${site}/`, new URL('tests/', ROOT));
}
