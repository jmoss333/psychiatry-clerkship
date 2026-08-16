// Contract for the side-sheet renderer -- the safety kit list, a protocol view, an item preview,
// and the post-protocol nudge toast. Evaluates the real snippet body via new Function, following
// tests/fd-search.test.mjs, tests/fd-reader.test.mjs. Concatenated in the same dependency order
// inject_shared_snippets() uses on the built page: phase_policy.js -> fd_state.js -> fd_data.js
// (the join layer fdBuildIndex/fdEsc come from) -> fd_sheet.js.
//
// This is the 2am surface, so two of the assertions below are load-bearing beyond ordinary markup
// coverage:
//
//   1. "every real kit protocol renders >= 3 steps" runs against the LIVE topic_meta.json, not a
//      fixture, so a safetySteps array emptied by an unrelated edit fails here rather than on the
//      ward.
//   2. "no protocol step or doc line is a literal in fd_sheet.js" pins the single most important
//      rule of the module: protocol content is faculty-attested content owned by topic_meta.json,
//      and a hardcoded copy in the renderer would be unreviewed clinical text on the one surface
//      whose whole purpose is being correct under time pressure.
//
// The attested affordance is tested in BOTH directions for the same reason -- a pill asserting a
// review that did not happen is worse than no pill at all.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const sheetSrc = read('frontdoor/fd_sheet.js');

// eslint-disable-next-line no-new-func
const make = new Function(`
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${sheetSrc}
  return { fdSheet: fdSheet, fdNudge: fdNudge, fdBuildIndex: fdBuildIndex, fdEsc: fdEsc };
`);
const F = make();

const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const REAL_CUR = readJson('../curriculum.json');
const REAL_META = readJson('../topic_meta.json');
const REAL_TOOLS = readJson('../tool_registry.json');
const REAL_MAN = readJson(`${BUILD}/site_manifest.json`);
const REAL_INDEX = F.fdBuildIndex(REAL_CUR, REAL_META, REAL_TOOLS, REAL_MAN);
const KIT_REFS = REAL_CUR.safetyKit.map((k) => k.ref);

// A fixture whose every string is hostile, for the escaping pass, plus the degraded cases the real
// data cannot produce (a kit page with no safetySteps; a protocol that is not faculty-reviewed).
const FIX_CUR = {
  weeks: [{ n: 2, title: 'W2', theme: 'T', items: [{ ref: 'evil.md', kind: 'read' }] }],
  libraryColumns: [],
  safetyKit: [
    { ref: 'evil.md', sub: '<b>sub & more</b>' },
    { ref: 'bare.md', sub: 'no steps at all' },
  ],
};
const FIX_META = {
  'evil.md': {
    read: 3,
    tldr: '<script>alert(1)</script>',
    safetySteps: ['<img src=x onerror=1>', 'second "step"'],
    safetyDoc: '<img src=y onerror=2>',
    facultyReview: { status: 'draft' },
  },
  'bare.md': { read: 2, tldr: 'nothing here', facultyReview: { status: 'reviewed' } },
};
const FIX_MAN = { tools: [], md: [['a/b', 'evil.md', '<b>Evil</b>'], ['a/c', 'bare.md', 'Bare']] };
const FIX_INDEX = F.fdBuildIndex(FIX_CUR, FIX_META, { tools: [] }, FIX_MAN);

// ---- the kit list ---------------------------------------------------------------------------

test('the kit variant renders every kit row, in curriculum order, with its subtitle', () => {
  const html = F.fdSheet(REAL_INDEX, REAL_META, { sheet: 'kit' });
  assert.match(html, /<span class="fd-sheet__title">Safety kit<\/span>/);
  assert.equal(html.split('class="fd-kitrow"').length - 1, KIT_REFS.length);
  let cursor = -1;
  for (const k of REAL_CUR.safetyKit) {
    const at = html.indexOf(`data-fd-safety="${k.ref}"`);
    assert.ok(at > cursor, `${k.ref} must appear, after the previous kit row`);
    cursor = at;
    assert.match(html, new RegExp(`<span class="fd-kitrow__sub">${F.fdEsc(k.sub)}</span>`));
  }
});

test('kit rows carry the established data-fd-safety payload, and are direct siblings', () => {
  const html = F.fdSheet(REAL_INDEX, REAL_META, { sheet: 'kit' });
  // .fd-kitrow + .fd-kitrow supplies the 9px gap, so no wrapper may sit between two rows.
  assert.match(html, /<\/button><button type="button" class="fd-kitrow"/);
  assert.doesNotMatch(html, /class="fd-kitrow"[^>]*data-fd-open/);
});

test('the kit variant has no back affordance -- it is the root of the sheet', () => {
  const html = F.fdSheet(REAL_INDEX, REAL_META, { sheet: 'kit', sheetFrom: 'kit' });
  assert.doesNotMatch(html, /fd-sheet__back/);
});

// ---- the protocol view ----------------------------------------------------------------------

test('every real kit protocol renders at least 3 steps from the live topic_meta.json', () => {
  for (const ref of KIT_REFS) {
    const html = F.fdSheet(REAL_INDEX, REAL_META, { sheet: ref });
    const n = html.split('class="fd-step"').length - 1;
    assert.ok(n >= 3, `${ref} rendered ${n} protocol steps; a safety protocol needs at least 3`);
    assert.equal(n, REAL_META[ref].safetySteps.length, `${ref} must render every step it has`);
  }
});

test('protocol steps render in topic_meta order, verbatim', () => {
  for (const ref of KIT_REFS) {
    const html = F.fdSheet(REAL_INDEX, REAL_META, { sheet: ref });
    let cursor = -1;
    for (const step of REAL_META[ref].safetySteps) {
      const at = html.indexOf(`<span class="fd-step__text">${F.fdEsc(step)}</span>`);
      assert.ok(at > cursor, `${ref}: "${step}" must appear, after the previous step`);
      cursor = at;
    }
  }
});

test('the Document callout carries topic_meta.safetyDoc', () => {
  for (const ref of KIT_REFS) {
    const html = F.fdSheet(REAL_INDEX, REAL_META, { sheet: ref });
    assert.match(
      html,
      new RegExp(`<div class="fd-doccallout"><b>Document:</b> ${F.fdEsc(REAL_META[ref].safetyDoc).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</div>`),
    );
  }
});

test('the protocol title and the open-page button come from the page the ref names', () => {
  const html = F.fdSheet(REAL_INDEX, REAL_META, { sheet: 'pg_suicide.md' });
  assert.match(html, /<span class="fd-sheet__title">Suicide Risk &amp; Safety Card<\/span>/);
  assert.match(html, /class="fd-btn fd-btn--ghost"[^>]*data-fd-open="pg_suicide\.md"/);
});

// bare.md is faculty-REVIEWED but carries no safetySteps -- the shape an unrelated edit emptying
// the array produces. Provenance is gated on there being content to attribute, so an empty body
// must not be stamped "faculty-attested": that reads as "attested, nothing to do" rather than
// "the content did not load", which is a failure presenting as a success on the 2am surface.
test('a kit page with no safetySteps degrades to no steps and no callout, never a fabrication', () => {
  const html = F.fdSheet(FIX_INDEX, FIX_META, { sheet: 'bare.md' });
  assert.equal(FIX_META['bare.md'].facultyReview.status, 'reviewed', 'fixture premise');
  assert.doesNotMatch(html, /class="fd-step"/);
  assert.doesNotMatch(html, /fd-doccallout/);
  assert.doesNotMatch(html, /fd-sheet__attribution/, 'nothing rendered, so nothing to attribute');
  assert.doesNotMatch(html, /faculty-attested/);
  assert.doesNotMatch(html, /From: bare\.md/, 'the neutral provenance line is gated the same way');
  assert.match(html, /class="fd-sheet__body"/);
  assert.match(html, /data-fd-open="bare\.md"/, 'the way out of an empty protocol is the full page');
});

// The shape of a Plan-3 injection failure: the index is fine, topicMeta never arrived.
test('an undefined topicMeta renders no content AND no attestation claim', () => {
  for (const ref of KIT_REFS) {
    const html = F.fdSheet(REAL_INDEX, undefined, { sheet: ref });
    assert.doesNotMatch(html, /class="fd-step"/, `${ref}`);
    assert.doesNotMatch(html, /fd-doccallout/, `${ref}`);
    assert.doesNotMatch(html, /faculty-attested/,
      `${ref}: content that failed to load must never be stamped attested`);
    assert.doesNotMatch(html, /fd-sheet__attribution/, `${ref}`);
  }
});

test('a sheet ref that names no kit protocol renders nothing rather than an empty protocol', () => {
  assert.equal(F.fdSheet(REAL_INDEX, REAL_META, { sheet: 'welcome.md' }), '');
});

// ---- step checks: session-only, driven by stepsDone -------------------------------------------

test('step checks reflect state.stepsDone by index', () => {
  const ref = KIT_REFS[0];
  const off = F.fdSheet(REAL_INDEX, REAL_META, { sheet: ref });
  assert.doesNotMatch(off, /fd-check is-done/);
  const on = F.fdSheet(REAL_INDEX, REAL_META, { sheet: ref, stepsDone: { 0: true, 2: true } });
  assert.equal(on.split('fd-check is-done').length - 1, 2);
  assert.match(on, /data-fd-step="0" aria-pressed="true"><span class="fd-check is-done"/);
  assert.match(on, /data-fd-step="1" aria-pressed="false"><span class="fd-check"/);
});

// The ✓ glyph is emitted in BOTH states (frontdoor.css colours it transparent when unchecked), so
// a screen reader would announce an UNCHECKED step as "✓ <step>" -- on a safety checklist that
// inverts the item's meaning. The glyph must therefore be decorative and the state must live on
// the button that actually toggles.
test('the checkmark is hidden from assistive tech and the state is carried by aria-pressed', () => {
  const html = F.fdSheet(REAL_INDEX, REAL_META, { sheet: KIT_REFS[0], stepsDone: { 0: true } });
  assert.equal(html.split('aria-hidden="true">✓</span>').length - 1,
    REAL_META[KIT_REFS[0]].safetySteps.length, 'every check glyph is decorative');
  assert.doesNotMatch(html, /class="fd-check[^"]*"(?! aria-hidden)/,
    'no check glyph may reach the a11y tree');
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-pressed="false"/);
  const off = F.fdSheet(REAL_INDEX, REAL_META, { sheet: KIT_REFS[0] });
  assert.doesNotMatch(off, /aria-pressed="true"/, 'nothing checked means nothing announced pressed');
});

test('the check lives INSIDE .fd-step so the 20px ancestor-keyed size rule applies', () => {
  const html = F.fdSheet(REAL_INDEX, REAL_META, { sheet: KIT_REFS[0] });
  assert.match(html, /class="fd-step"[^>]*><span class="fd-check"/,
    '.fd-step .fd-check is the only size variant and it is keyed on the ancestor, not a modifier');
  assert.doesNotMatch(html, /fd-check--/, 'no invented size modifier');
});

test('step state is session-only: nothing in the module reads or writes storage', () => {
  assert.doesNotMatch(sheetSrc, /localStorage|sessionStorage|cw_|rp_/,
    'step checks reset per open -- they are never persisted');
});

// ---- the back affordance ---------------------------------------------------------------------

test('the ‹ kit back affordance appears only when the protocol was reached from the kit', () => {
  const withBack = F.fdSheet(REAL_INDEX, REAL_META, { sheet: 'agitation.md', sheetFrom: 'kit' });
  assert.match(withBack, /<button type="button" class="fd-sheet__back" data-fd-safety>‹ kit<\/button>/);
  const noBack = F.fdSheet(REAL_INDEX, REAL_META, { sheet: 'agitation.md' });
  assert.doesNotMatch(noBack, /fd-sheet__back/,
    'a protocol opened straight from a kit card or a search hit has no kit to go back to');
});

// ---- the attested affordance: only when the review actually happened ---------------------------

test('an attested protocol shows the faculty-attested attribution', () => {
  const html = F.fdSheet(REAL_INDEX, REAL_META, { sheet: 'delirium.md' });
  assert.equal(REAL_META['delirium.md'].facultyReview.status, 'reviewed', 'fixture premise');
  assert.match(html, /<div class="fd-sheet__attribution">✓ From: delirium\.md · faculty-attested<\/div>/);
});

test('an UNattested protocol never claims a review -- source only, no pill, no ✓', () => {
  const html = F.fdSheet(FIX_INDEX, FIX_META, { sheet: 'evil.md' });
  assert.doesNotMatch(html, /faculty-attested/,
    'facultyReview.status is not "reviewed"; asserting review that did not happen is worse than no pill');
  assert.doesNotMatch(html, /fd-sheet__attribution/);
  assert.doesNotMatch(html, /✓ From:/);
  assert.match(html, /From: evil\.md/, 'provenance is still true and still shown');
});

test('an UNattested item preview omits the .fd-attested pill entirely', () => {
  const html = F.fdSheet(FIX_INDEX, FIX_META, { sheet: 'item:evil.md' });
  assert.doesNotMatch(html, /fd-attested/);
  assert.doesNotMatch(html, /faculty-attested/);
});

test('an attested item preview shows the .fd-attested pill', () => {
  const html = F.fdSheet(REAL_INDEX, REAL_META, { sheet: 'item:delirium.md' });
  assert.match(html, /<span class="fd-attested">✓ faculty-attested<\/span>/);
});

// ---- the item preview -------------------------------------------------------------------------

test('the item preview renders chip, lead, source chip, primary open button and the close note', () => {
  const html = F.fdSheet(REAL_INDEX, REAL_META, { sheet: 'item:pg_suicide.md' });
  const item = REAL_INDEX.byRef['pg_suicide.md'];
  assert.match(html, /<span class="fd-sheet__title">Suicide Risk &amp; Safety Card<\/span>/);
  assert.match(html, /<span class="fd-chip">read<\/span>/);
  assert.match(html, new RegExp(`<p class="fd-sheet__lead">${F.fdEsc(item.summary).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</p>`));
  assert.match(html, /<span class="fd-src">pg_suicide\.md<\/span>/);
  assert.match(html, /class="fd-btn fd-btn--primary"[^>]*data-fd-open="pg_suicide\.md"/);
  assert.match(html, /<p class="fd-sheet__note">Or ✕ to close/);
});

test('a tool item preview carries the teal chip and self-paced meta, not a minute count', () => {
  const html = F.fdSheet(REAL_INDEX, REAL_META, { sheet: 'item:mse.html' });
  assert.match(html, /<span class="fd-chip is-tool">tool<\/span>/);
  assert.match(html, /self-paced/);
});

test('the item preview names the week the item belongs to, and omits it when there is none', () => {
  const inWeek = F.fdSheet(REAL_INDEX, REAL_META, { sheet: 'item:pg_suicide.md' });
  assert.match(inWeek, /Week 1/);
  const html = F.fdSheet(FIX_INDEX, FIX_META, { sheet: 'item:bare.md' });
  assert.doesNotMatch(html, /Week /, 'bare.md belongs to no week in the fixture curriculum');
});

test('an item preview for a ref the index does not carry degrades to a titled shell, not a throw', () => {
  const html = F.fdSheet(REAL_INDEX, REAL_META, { sheet: 'item:not_a_page.md' });
  assert.match(html, /<span class="fd-sheet__title">not_a_page\.md<\/span>/);
  assert.match(html, /data-fd-open="not_a_page\.md"/);
});

// ---- sheet chrome ------------------------------------------------------------------------------

test('the backdrop is a separate sibling element emitted BEFORE the sheet', () => {
  const html = F.fdSheet(REAL_INDEX, REAL_META, { sheet: 'kit' });
  assert.match(html, /^<div class="fd-sheetbackdrop" data-fd-close-sheet><\/div><aside class="fd-sheet">/,
    'the sheet uses two elements (backdrop + panel); only the search overlay merges them');
});

test('the head carries a close control on every variant', () => {
  for (const s of ['kit', 'agitation.md', 'item:mse.html']) {
    const html = F.fdSheet(REAL_INDEX, REAL_META, { sheet: s });
    assert.match(html, /class="fd-sheet__close" data-fd-close-sheet/, `variant ${s}`);
    assert.match(html, /<div class="fd-sheet__body">/, `variant ${s}`);
  }
});

test('no sheet in state renders nothing, so the caller can concatenate unconditionally', () => {
  assert.equal(F.fdSheet(REAL_INDEX, REAL_META, {}), '');
  assert.equal(F.fdSheet(REAL_INDEX, REAL_META, { sheet: null }), '');
  assert.equal(F.fdSheet(undefined, undefined, undefined), '');
});

// ---- fdNudge -----------------------------------------------------------------------------------

test('the nudge names the item and its minutes, and offers open + dismiss', () => {
  const html = F.fdNudge(REAL_INDEX.byRef['delirium.md']);
  assert.match(html, /<div class="fd-nudge">/);
  assert.match(html, /<span class="fd-nudge__text">“Delirium” is the full read — 4 min\.<\/span>/);
  assert.match(html, /<button type="button" class="fd-nudge__go" data-fd-open="delirium\.md">Read it<\/button>/);
  assert.match(html, /class="fd-nudge__dismiss" data-fd-close-nudge/);
});

test('the nudge omits the minute clause when the page carries no read time', () => {
  const html = F.fdNudge({ ref: 'x.md', title: 'X', minutes: null });
  assert.match(html, /“X” is the full read\.</);
  assert.doesNotMatch(html, /min/);
});

test('the nudge escapes the item title and renders nothing without an item', () => {
  assert.doesNotMatch(F.fdNudge({ ref: 'e.md', title: '<img src=x>' }), /<img/);
  assert.equal(F.fdNudge(null), '');
});

// ---- escaping ----------------------------------------------------------------------------------

// Every fixture string is hostile, so nothing the fixture supplies may survive into the output as
// live markup. `<b>Document:</b>` is NOT in this list: it is the callout's own literal label from
// the prototype, authored here, not interpolated from data.
test('every interpolated value is escaped -- clinical step text included', () => {
  const HOSTILE = ['<img src=x onerror=1>', '<img src=y onerror=2>', '<script>alert(1)</script>',
    '<b>Evil</b>', '<b>sub & more</b>'];
  for (const s of ['kit', 'evil.md', 'item:evil.md']) {
    const html = F.fdSheet(FIX_INDEX, FIX_META, { sheet: s });
    assert.doesNotMatch(html, /<img|<script/, `variant ${s}: unescaped markup reached the output`);
    for (const h of HOSTILE) {
      assert.ok(!html.includes(h), `variant ${s}: "${h}" reached the output unescaped`);
    }
    assert.doesNotMatch(html, /&amp;amp;/, `variant ${s}: values must be escaped once, not twice`);
  }
  // The step text specifically -- the clinical string, escaped at its own interpolation site.
  const proto = F.fdSheet(FIX_INDEX, FIX_META, { sheet: 'evil.md' });
  assert.match(proto, /<span class="fd-step__text">&lt;img src=x onerror=1&gt;<\/span>/);
});

// ---- the module owns no clinical content -------------------------------------------------------

test('no protocol step or doc line appears as a literal in fd_sheet.js', () => {
  for (const ref of KIT_REFS) {
    for (const step of REAL_META[ref].safetySteps) {
      assert.ok(!sheetSrc.includes(step), `${ref}: step text must live in topic_meta.json only`);
    }
    assert.ok(!sheetSrc.includes(REAL_META[ref].safetyDoc), `${ref}: safetyDoc must not be copied here`);
  }
});

test('no distinctive clinical token is spelled anywhere in fd_sheet.js, comments included', () => {
  const NEEDLES = ['CIWA', 'COWS', 'C-SSRS', 'thiamine', 'buprenorphine', 'fingerstick',
    'benzodiazepine', 'anticholinergic', 'de-escalation', 'lethal means', 'CAM screen',
    'hypoglycemia', 'ideation', 'akathisia'];
  for (const n of NEEDLES) {
    assert.ok(!sheetSrc.toLowerCase().includes(n.toLowerCase()),
      `"${n}" is clinical content; it belongs in topic_meta.json, not in a renderer`);
  }
});

// ---- purity / audience-neutral / no raw hex ------------------------------------------------------

test('fd_sheet.js touches no DOM, storage, or clock, and stays ES5', () => {
  assert.doesNotMatch(sheetSrc, /localStorage\.|document\.|window\.|Date\.now\(\)/,
    'fd_sheet.js must stay a pure function of (index, topicMeta, state)');
  assert.doesNotMatch(sheetSrc, /\bconst\s|\blet\s|=>/,
    'fd_sheet.js is a build-injected snippet, not a module -- ES5 only (var/function)');
});

test('no rendered output carries an audience-specific token', () => {
  for (const s of ['kit', 'agitation.md', 'item:mse.html']) {
    assert.doesNotMatch(F.fdSheet(REAL_INDEX, REAL_META, { sheet: s }), AUDIENCE_TOKEN_RE, `variant ${s}`);
  }
  assert.doesNotMatch(F.fdNudge(REAL_INDEX.byRef['delirium.md']), AUDIENCE_TOKEN_RE);
});

test('no raw hex in emitted markup', () => {
  for (const s of ['kit', 'agitation.md', 'item:mse.html']) {
    assert.doesNotMatch(F.fdSheet(REAL_INDEX, REAL_META, { sheet: s }), /#[0-9a-fA-F]{3,6}/, `variant ${s}`);
  }
});

test('only classes that exist in frontdoor.css are emitted', () => {
  const css = read('frontdoor/frontdoor.css');
  const seen = new Set();
  for (const s of ['kit', 'agitation.md', 'item:mse.html', 'item:evil.md']) {
    const html = s.startsWith('item:e') ? F.fdSheet(FIX_INDEX, FIX_META, { sheet: s })
      : F.fdSheet(REAL_INDEX, REAL_META, { sheet: s, sheetFrom: 'kit', stepsDone: { 0: true } });
    for (const m of html.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => seen.add(c));
  }
  for (const m of F.fdNudge(REAL_INDEX.byRef['delirium.md']).matchAll(/class="([^"]+)"/g)) {
    m[1].split(/\s+/).forEach((c) => seen.add(c));
  }
  // Word-boundary match, not a substring one: `css.includes('.' + c)` would let an invented short
  // name pass on the strength of a longer real class it happens to prefix (".fd-step" would
  // "prove" ".fd-ste"). Class names may contain [A-Za-z0-9_-], so the selector must not continue
  // into one of those.
  for (const c of seen) {
    const re = new RegExp(`\\.${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_-])`);
    assert.match(css, re, `class "${c}" has no rule in frontdoor.css -- an invented class gets no styling`);
  }
});

test('the class check itself rejects a name that merely prefixes a real class', () => {
  const css = read('frontdoor/frontdoor.css');
  const re = (c) => new RegExp(`\\.${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_-])`);
  assert.match(css, re('fd-step'), 'control: the real class still matches');
  assert.doesNotMatch(css, re('fd-ste'), 'a substring check would have passed this');
});
