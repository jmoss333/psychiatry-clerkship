// Behavioural + structural contract for the shared shell's risk-aware review UI
// (task-4-brief.md, Step 1). The shell consumes governance.json (Task 3's public
// projection) and renders a single `.governance-notice` for the active page/tool
// surface, `.governance-badge` markers in pending nav/search rows, and passes
// governed=1 to embedded tool iframes so the tool's own injected status block
// hides itself rather than duplicating the shell's outer notice.
//
// Structural assertions pin things node:test cannot easily execute without a DOM
// (focus handling, insertion order) — same convention as tests/spa-shell-a11y.test.mjs.
// Behavioural assertions extract the pure rendering functions (no contentEl/DOM
// dependency) and run them for real via `new Function`, following
// tests/calib-panel.test.mjs / tests/qbank-draft-visibility.test.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/spa_index.html',
  import.meta.url,
), 'utf8');
// The route/focus CALLERS moved into the wiring module when Plan 3 Task 4 wired routing; the
// governance renderers themselves never left spa_index.html (they read GOVERNANCE,
// facultyPreviewRequest and currentItem, none of which a pure frontdoor/ module may touch).
const wireSrc = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js',
  import.meta.url,
), 'utf8');

function slice(startMarker, endMarker) {
  const a = source.indexOf(startMarker);
  const b = source.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return source.slice(a, b);
}

// ---- structural / contract assertions --------------------------------------

test('the governance-notice marker pair appears exactly once in spa_index.html', () => {
  const startCount = source.split('/* ---- governance notice ---- */').length - 1;
  const endCount = source.split('/* ---- end governance notice ---- */').length - 1;
  assert.equal(startCount, 1, 'expected exactly one governance-notice start marker');
  assert.equal(endCount, 1, 'expected exactly one governance-notice end marker');
});

test('the shell fetches governance.json and never fetches reviewed.json', () => {
  assert.match(source, /fetch\(['"]governance\.json['"]\)/);
  assert.doesNotMatch(source, /fetch\(['"]reviewed\.json['"]\)/);
  assert.doesNotMatch(source, /REVIEWED/, 'the old REVIEWED ledger variable must be fully retired');
});

test('governance state loading matches the specified fetch/then/catch contract exactly', () => {
  assert.match(
    source,
    /fetch\('governance\.json'\)\s*\n?\s*\.then\(function\(r\)\{if\(!r\.ok\)throw new Error\('governance unavailable'\);return r\.json\(\);\}\)\s*\n?\s*\.then\(function\(d\)\{GOVERNANCE=\{status:'ready',items:d\.items\|\|\{\}\};rerenderCurrent\(\);\}\)\s*\n?\s*\.catch\(function\(\)\{GOVERNANCE=\{status:'unavailable',items:\{\}\};rerenderCurrent\(\);\}\);/,
  );
});

// REPOINTED (Plan 3 Task 8, bucket (b)). The old assertion counted `renderGovernanceNotice(item)`
// at three sites: the definition, the tool branch of show(), and its md branch. Task 3 deleted
// show(), and Task 7 replaced its two renderings with ONE — fdRender writes the notice to a mount
// outside #content, for whatever route is open, tool or page alike. That is the same contract
// stated better (two renderings of one compliance statement is how they drift), so the assertion
// becomes: exactly one route-time renderer, exactly one late-settle refresher, and no third.
test('exactly one route-time governance renderer serves both the tool and the page branch', () => {
  assert.match(source, /function renderGovernanceNotice\(item\)\{/);
  const refresher = slice('function refreshGovernanceNotice(', 'function rerenderCurrent(');
  assert.match(refresher, /renderGovernanceNotice\(currentItem\)/,
    'the late-settle path re-renders for whatever is currently open');
  const mount = slice("fdMount('governanceNotice'", '}));');
  assert.match(mount, /renderGovernanceNotice\(govItem\)/,
    'the route path renders once, for the open route, into its own mount');
  const calls = (source.match(/renderGovernanceNotice\(/g) || []).length;
  assert.equal(calls, 3,
    `1 definition + 1 route render + 1 late-settle refresh; found ${calls} — a fourth site is a `
    + 'second rendering of the same compliance statement, which is how they drift');
});

// The claim "one call site for BOTH branches" is only true if the route test that gates it treats
// tools and pages alike, so the deciding expression is executed rather than described. It is the
// single line fdRender uses to choose an item for the notice.
test('the governance notice is gated on the ROUTE, not the surface', () => {
  const line = source.match(/ {4}var govItem=[^\n]*\n/);
  assert.ok(line, 'the govItem decision line was not found — the scan went blind');
  // eslint-disable-next-line no-new-func
  const decide = new Function('wizard', 'openRoute', `${line[0]}\nreturn govItem;`);

  const tool = { k: 'tool', f: 'mse.html' };
  const page = { k: 'md', f: 'welcome.md' };
  const progress = { k: 'special', f: '__progress__' };

  assert.equal(decide('', tool), tool, 'an open tool gets a notice');
  assert.equal(decide('', page), page, 'an open page gets one too — this is the asymmetry Task 7 closed');
  assert.equal(decide('', progress), null, '__progress__ is a slug no ledger has ever heard of');
  assert.equal(decide('', null), null, 'a bare tab is not a page under review');
  assert.equal(decide('role', page), null, 'the first-run role picker suppresses it');
  assert.equal(decide('week', tool), null, 'and so does the week step');
});

test('the fixed fail-safe copy is present verbatim, with no live-region role', () => {
  assert.match(source, /'<div class="governance-notice unavailable">Review status unavailable—verify with faculty<\/div>'/);
});

test('the reviewed receipt carries no live-region role (it would render on nearly every route change)', () => {
  assert.match(source, /'<div class="governance-notice reviewed-receipt">Reviewed by '/);
});

test('pending-high is an alert section; pending-compact is a status div', () => {
  assert.match(source, /class="governance-notice pending-high" role="alert" tabindex="-1"/);
  assert.match(source, /class="governance-notice pending-compact" role="status"/);
});

test('the unguarded toolFrameSuffix helper is fully retired in favor of the governed variant', () => {
  assert.match(source, /function toolFrameSuffixWithGovernance\(extra\)\{/);
  assert.doesNotMatch(source, /function toolFrameSuffix\(extra\)\{/);
  assert.match(source, /params\.set\(['"]governed['"],\s*['"]1['"]\)/);
});

test('both the normal and faculty-preview tool iframes add governed=1', () => {
  const callSites = (source.match(/toolFrameSuffixWithGovernance\(opts&&opts\.toolExtra\)/g) || []).length;
  assert.equal(callSites, 2, 'the plain iframe src and the faculty-preview frame.src must both route through the governed helper');
});

test('warning prose is never derived from topic_meta.facultyReview', () => {
  const noticeBlock = slice('/* ---- governance notice ---- */', '/* ---- end governance notice ---- */');
  assert.doesNotMatch(noticeBlock, /facultyReview/);
  assert.doesNotMatch(noticeBlock, /TOPIC_META/);
});

// *** DELETED (Plan 3 Task 8, bucket (c)), AND NOTHING REPLACED IT. ***
// The old assertion pinned two call sites — `governanceBadge(it.governance)` in the sidebar nav
// row builder and `governanceBadge(r.d.governance)` in the legacy search result builder. Task 3
// deleted both builders; the front door's own row renderers (fd_library.js, fd_search.js,
// fd_today.js, fd_path.js) render no review-status badge at all, so a learner browsing or
// searching no longer sees which pages are pending faculty review BEFORE opening them.
//
// What survives: the PAGE-LEVEL notice, which Task 7 made symmetric across tools and pages and
// which still fires role="alert" for a pending-high item on every open (tests above), plus the
// safety sheet's own .fd-sheet__pending line. So a learner is still warned — at open time rather
// than at browse time.
//
// governanceBadge() itself is deliberately NOT deleted, and its behavioural tests at the bottom of
// this file are deliberately kept: it is a correct renderer with no caller, which is the cheapest
// possible starting point if the row-level warning is restored. Recorded here so that reads as a
// decision rather than as an oversight — and so nobody assumes the badge still ships.

test('the two fixed badge labels still exist for whoever restores the row-level warning', () => {
  assert.match(source, /function governanceBadge\(triplet\)\{/);
  assert.match(source, /Pending review · High risk/);
});

test('focus handling skips faculty-preview initialization and browser-history restoration', () => {
  const focusFn = slice('function focusGovernanceNotice(opts)', 'function refreshGovernanceNotice(');
  assert.match(focusFn, /if\(facultyPreviewRequest\)return;/);
  assert.match(focusFn, /if\(opts&&opts\.fromHistory\)return;/);
});

// REPOINTED (Plan 3 Task 8, bucket (a)). The ordering contract is unchanged and is still the whole
// point — announceRoute() moves focus into #content, and #governanceNotice sits OUTSIDE and BEFORE
// #content, so a learner sent into #content has been sent PAST a high-risk pending-review warning
// unless the governance focus runs after it and takes focus back. What changed is who runs it:
// show()'s two branches are gone, and fdApply() (fd_wire.js) is now the single ordering site.
test('the governance focus runs after the route announcement, so it wins the focus race', () => {
  const apply = wireSrc.slice(wireSrc.indexOf('function fdApply(patch){'));
  const end = apply.indexOf('\n}');
  const body = apply.slice(0, end);
  assert.ok(body.includes('fdAnnounce(next);'), 'fdApply must announce a routed change');
  assert.ok(body.includes('fdFocusAfterRender('), 'and then decide focus');
  assert.ok(body.indexOf('fdAnnounce(next);') < body.indexOf('fdFocusAfterRender('),
    'the announcement (which moves focus to #content) must run FIRST, or the governance focus is '
    + 'taken back off the notice a line later');

  const after = wireSrc.slice(wireSrc.indexOf('function fdFocusAfterRender('));
  const afterBody = after.slice(0, after.indexOf('\n}'));
  assert.match(afterBody, /if\(routed\)\{ fdFocusGovernance\(\); return; \}/,
    'and it is the routed branch that hands off to the shell, ahead of the generic restore below');

  // The shell keeps its side of the seam: one guarded entry point, no direct DOM reach from the
  // wiring module (which cannot see GOVERNANCE, facultyPreviewRequest or currentItem).
  assert.match(wireSrc, /if\(typeof focusGovernanceNotice==='function'\) focusGovernanceNotice\(\);/);
  assert.match(source, /function focusGovernanceNotice\(opts\)/);
});

test('rerenderCurrent is defined and never replays a full route (no content refetch, no iframe reload)', () => {
  assert.match(source, /function rerenderCurrent\(\)\{\s*refreshGovernanceNotice\(\);\s*\}/);
});

// REPOINTED (Plan 3 Task 8). This was a cross-check that governance work had not disturbed route
// announcements, expressed as ">=5 announceRoute call sites" — one per show() branch. show() is
// gone and the callers are fd_wire.js's fdAnnounce(), two branches covering all four route shapes.
// The full contract (both branches, and fdApply actually reaching them) is asserted in
// tests/spa-shell-a11y.test.mjs, which owns shell a11y; duplicating it here would give two places
// to update and one of them would rot. What is kept is the seam this file cares about: the
// announcement is still what moves focus into #content, which is what makes the governance focus
// handoff above necessary in the first place.
test('route announcements still move focus into #content, which is what the handoff above depends on', () => {
  assert.match(source, /function announceRoute\(/);
  assert.match(source, /contentEl\.focus\(\{preventScroll:true\}\)/);
  assert.match(wireSrc, /if\(st\.openId\) announceRoute\(/,
    'and the wiring still announces open items — see tests/spa-shell-a11y.test.mjs for the rest');
});

test('no inline midnight-parse idiom was introduced anywhere, including in new comments', () => {
  assert.doesNotMatch(source, /\+'T00:00:00'/);
});

test('no rebrand needle was introduced in new governance copy', () => {
  const noticeBlock = slice('/* ---- governance notice ---- */', '/* ---- end governance notice ---- */');
  assert.doesNotMatch(noticeBlock, /MS3 Psychiatry Clerkship|MS3 Clerkship/);
});

test('the shell stores no governance state in localStorage (fetch-only, in-memory)', () => {
  const noticeBlock = slice('/* ---- governance notice ---- */', '/* ---- end governance notice ---- */');
  assert.doesNotMatch(noticeBlock, /localStorage\.(setItem|getItem|removeItem)/);
});

// ---- behavioural extract-and-execute tests ----------------------------------
// Slices the pure rendering functions (no contentEl/DOM dependency) out of the
// marked block and evaluates them for real, so a threshold, escaping, or wording
// regression turns these red even when the wrapping show()/nav/search glue stays
// byte-identical.

const noticeBlock = slice('/* ---- governance notice ---- */', '/* ---- end governance notice ---- */');

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function buildGovernanceFns(governance) {
  // eslint-disable-next-line no-new-func
  const factory = new Function('esc', 'GOVERNANCE', 'URLSearchParams', `
    ${noticeBlock}
    return {
      renderGovernanceNotice: renderGovernanceNotice,
      governanceBadge: governanceBadge,
      toolFrameSuffixWithGovernance: toolFrameSuffixWithGovernance,
    };
  `);
  return factory(esc, governance, URLSearchParams);
}

test('toolFrameSuffixWithGovernance adds governed=1 and preserves other params', () => {
  const { toolFrameSuffixWithGovernance } = buildGovernanceFns({ status: 'loading', items: {} });
  assert.equal(toolFrameSuffixWithGovernance(''), '?governed=1');
  assert.equal(toolFrameSuffixWithGovernance(undefined), '?governed=1');
  const withExtra = toolFrameSuffixWithGovernance('&case=xyz');
  assert.match(withExtra, /^\?/);
  const params = new URLSearchParams(withExtra.slice(1));
  assert.equal(params.get('case'), 'xyz');
  assert.equal(params.get('governed'), '1');
});

test('toolFrameSuffixWithGovernance overwrites rather than duplicates an existing governed param', () => {
  const { toolFrameSuffixWithGovernance } = buildGovernanceFns({ status: 'loading', items: {} });
  const out = toolFrameSuffixWithGovernance('&governed=0&case=xyz');
  const params = new URLSearchParams(out.slice(1));
  assert.equal(params.getAll('governed').length, 1);
  assert.equal(params.get('governed'), '1');
  assert.equal(params.get('case'), 'xyz');
});

test('renderGovernanceNotice shows the fail-safe notice while loading and when the fetch failed', () => {
  for (const state of [{ status: 'loading', items: {} }, { status: 'unavailable', items: {} }]) {
    const { renderGovernanceNotice } = buildGovernanceFns(state);
    const out = renderGovernanceNotice({ f: 'welcome.md', k: 'md' });
    assert.equal(out, '<div class="governance-notice unavailable">Review status unavailable—verify with faculty</div>');
  }
});

test('renderGovernanceNotice shows the fail-safe notice for a ready ledger missing this slug', () => {
  const { renderGovernanceNotice } = buildGovernanceFns({ status: 'ready', items: {} });
  const out = renderGovernanceNotice({ f: 'not-in-ledger.md', k: 'md' });
  assert.match(out, /class="governance-notice unavailable"/);
});

test('renderGovernanceNotice renders a high-risk pending alert: title, risk label, warning, reason, feedback action', () => {
  const { renderGovernanceNotice } = buildGovernanceFns({
    status: 'ready',
    items: {
      'cotw_index.md': {
        kind: 'page', status: 'pending', riskKind: 'clinical', riskLevel: 'high',
        reason: 'Synthetic clinical review is pending',
        warning: 'This page includes high-risk clinical teaching that has not completed faculty attestation. Verify decisions with your supervising clinician.',
      },
    },
  });
  const out = renderGovernanceNotice({ f: 'cotw_index.md', k: 'md' });
  assert.match(out, /^<section class="governance-notice pending-high" role="alert" tabindex="-1">/);
  assert.match(out, /<strong class="governance-title">Pending faculty review<\/strong>/);
  assert.match(out, /<span class="governance-risk">Clinical · High risk<\/span>/);
  assert.match(out, /Verify decisions with your supervising clinician/);
  assert.match(out, /Synthetic clinical review is pending/);
  assert.match(out, /<button type="button" class="pgfb-b">Feedback on this page →<\/button>/);
  assert.match(out, /<\/section>$/);
});

test('renderGovernanceNotice renders a compact status for low/moderate pending, prefixed "Pending faculty review"', () => {
  const { renderGovernanceNotice } = buildGovernanceFns({
    status: 'ready',
    items: {
      'anki.md': {
        kind: 'page', status: 'pending', riskKind: 'general', riskLevel: 'moderate',
        reason: 'Synthetic moderate review is pending',
        warning: 'Synthetic moderate review is pending',
      },
    },
  });
  const out = renderGovernanceNotice({ f: 'anki.md', k: 'md' });
  assert.match(out, /^<div class="governance-notice pending-compact" role="status">/);
  assert.match(out, /<strong class="governance-title">Pending faculty review<\/strong>/);
  assert.match(out, /Synthetic moderate review is pending/);
  assert.doesNotMatch(out, /pending-high/);
  assert.doesNotMatch(out, /pgfb-b/, 'the feedback action is only embedded in the high-risk alert');
});

test('renderGovernanceNotice renders a low-emphasis reviewer/date receipt for reviewed items', () => {
  const { renderGovernanceNotice } = buildGovernanceFns({
    status: 'ready',
    items: {
      'welcome.md': {
        kind: 'page', status: 'reviewed', riskKind: 'general', riskLevel: 'low',
        reviewer: 'Synthetic Reviewer, MD', reviewedAt: '2026-07-26',
      },
    },
  });
  const out = renderGovernanceNotice({ f: 'welcome.md', k: 'md' });
  assert.equal(out, '<div class="governance-notice reviewed-receipt">Reviewed by Synthetic Reviewer, MD · 2026-07-26</div>');
});

test('renderGovernanceNotice escapes faculty-authored free text (warning and reason)', () => {
  const { renderGovernanceNotice } = buildGovernanceFns({
    status: 'ready',
    items: {
      'x.md': {
        kind: 'page', status: 'pending', riskKind: 'general', riskLevel: 'high',
        reason: '<script>reason(1)</script>', warning: '<script>warning(1)</script>',
      },
    },
  });
  const out = renderGovernanceNotice({ f: 'x.md', k: 'md' });
  assert.doesNotMatch(out, /<script>/);
  assert.match(out, /&lt;script&gt;warning\(1\)&lt;\/script&gt;/);
  assert.match(out, /&lt;script&gt;reason\(1\)&lt;\/script&gt;/);
});

test('governanceBadge renders the two fixed labels for pending rows and nothing for reviewed rows', () => {
  const { governanceBadge } = buildGovernanceFns({ status: 'loading', items: {} });

  const high = governanceBadge({ status: 'pending', riskKind: 'clinical', riskLevel: 'high' });
  assert.match(high, /class="governance-badge high"/);
  assert.match(high, /aria-label="Pending review · High risk"/);
  assert.match(high, />Pending review · High risk</);

  const low = governanceBadge({ status: 'pending', riskKind: 'general', riskLevel: 'low' });
  assert.match(low, /class="governance-badge"/);
  assert.doesNotMatch(low, /governance-badge high/);
  assert.match(low, />Pending review</);
  assert.doesNotMatch(low, /High risk/);

  assert.equal(governanceBadge({ status: 'reviewed', riskKind: 'general', riskLevel: 'low' }), '');
  assert.equal(governanceBadge(null), '');
  assert.equal(governanceBadge(undefined), '');
});
