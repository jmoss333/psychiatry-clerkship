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
const wire = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_wire.js', import.meta.url,
), 'utf8');
const dataModule = readFileSync(new URL(
  '../13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js', import.meta.url,
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

test('renderGovernanceNotice(item) is defined and passed into the shared resource adapter', () => {
  assert.match(source, /function renderGovernanceNotice\(item\)\{/);
  assert.match(source, /governanceNotice:renderGovernanceNotice/);
  assert.match(wire, /var bar=governance\(legacy\)\|\|''/);
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
  assert.match(source, /toolFrameSuffixWithGovernance\(opts&&opts\.toolExtra\)/,
    'faculty preview must keep the audited governed suffix');
  assert.match(wire, /suffix=toolFrameSuffixWithGovernance\(toolExtra\)/,
    'normal Front Door resource loading must keep the governed suffix');
});

test('warning prose is never derived from topic_meta.facultyReview', () => {
  const noticeBlock = slice('/* ---- governance notice ---- */', '/* ---- end governance notice ---- */');
  assert.doesNotMatch(noticeBlock, /facultyReview/);
  assert.doesNotMatch(noticeBlock, /TOPIC_META/);
});

test('Front Door index keeps each resource risk field and governed open routes', () => {
  assert.match(source, /function governanceBadge\(triplet\)\{/);
  assert.match(source, /Pending review · High risk/);
  assert.match(dataModule, /risk: \(t&&t\.riskLevel\)\|\|m\.safetyLevel\|\|null/);
  assert.match(source, /governanceNotice:renderGovernanceNotice/);
});

test('focus handling skips faculty-preview initialization and browser-history restoration', () => {
  const focusFn = slice('function focusGovernanceNotice(opts)', 'function refreshGovernanceNotice(');
  assert.match(focusFn, /if\(facultyPreviewRequest\)return;/);
  assert.match(focusFn, /if\(opts&&opts\.fromHistory\)return;/);
});

test('focusGovernanceNotice runs after resource mount and respects history restoration', () => {
  assert.match(source, /announceRoute\(currentItem\); focusGovernanceNotice\(\{fromHistory:!!options\.fromHistory\}\)/);
  assert.match(source, /announceRoute\(item\); focusGovernanceNotice\(opts\)/,
    'the exact faculty-preview page path retains its focus order');
});

test('rerenderCurrent is defined and never replays a full route (no content refetch, no iframe reload)', () => {
  assert.match(source, /function rerenderCurrent\(\)\{\s*refreshGovernanceNotice\(\);\s*\}/);
});

test('route announcements cover tabs, Progress, and resources', () => {
  const calls = (source.match(/announceRoute\(/g) || []).length;
  assert.ok(calls >= 3, `tabs, Progress, and resources must all still announce (found ${calls})`);
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
