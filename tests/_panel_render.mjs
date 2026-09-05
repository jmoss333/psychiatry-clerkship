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
 * NOTE ON ORDERING: the snapshots depend only on source, never on _build/, so a stale snapshot is
 * always fixable by `node bin/render_panels.mjs --write` — which does not run through
 * build_and_check.sh. That matters because build_and_check.sh is `set -euo pipefail` and runs the
 * node suite BEFORE build_deploy.py: a test that could only be repaired by building would wedge
 * the build that repairs it (see the T17 trap noted in CLAUDE.md). This one cannot.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

export const SNAPSHOT_DIR = new URL('__panels__/', new URL('tests/', ROOT));
