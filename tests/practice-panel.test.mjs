// Behavioural contract for the pinned "On the Unit Practice and Tools" panel (buildTpl and its
// helpers), sliced out of spa_index.html between its markers and evaluated for real — the
// slicing technique follows tests/calib-panel.test.mjs.
//
// Two contracts are pinned here.
//
// 1. GOVERNANCE (WP-B). instrument_rights.json is the authority on which instruments are
//    retired or restricted; the pages that exist to say an instrument is NOT reproduced reach
//    the shell as curriculum.rightsReferences -> fd_data.js's `rights` flag, and
//    validate_curriculum.py keeps the two in step with the words "a rights reference replaces
//    a tool". fd_data.js drops the tool chip and kicker for those pages everywhere else in the
//    shell. This panel used to ignore all of it and offer them as instruments, under labels
//    written before the retirements ("C-SSRS Suicide Screen", "CIWA-Ar / COWS") and under
//    author-written imperatives ("Open the C-SSRS screener"). Three renderers link tools —
//    the tool list, the cta/workflow-action list, and buildWorkflow's own actions row — so all
//    three are exercised below.
//
// 2. AUDIENCE-NEUTRAL COPY (WP-C). The panel ships to both sites, so the strings it owns may
//    not carry an audience token. Note the assertion is scoped to the panel's OWN chrome, not
//    to author-supplied clinical prose: AUDIENCE_TOKEN_RE has no word boundaries, so it fires
//    on "autoimmune" and "unexplained" via UNE, and "student" occurs legitimately in quiz
//    stems. Asserting the regex over rendered real content would be a test that can only be
//    satisfied by rewriting clinical text, which is not what the rule is for.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const readJSON = (p) => JSON.parse(read(p));

const SPA = '13_Faculty_Resources/_automation/site_build/spa_index.html';
const source = read(SPA);

function slice(src, startMarker, endMarker, { keepEnd = true } = {}) {
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  assert.ok(a !== -1 && b !== -1, `could not locate ${startMarker} .. ${endMarker}`);
  return src.slice(a, keepEnd ? b + endMarker.length : b);
}

const panelCode = slice(source, '/* ---- practice panel ---- */', '/* ---- end practice panel ---- */');
// buildWorkflow lives outside the panel block but is the third renderer that links tools.
// keepEnd:false — the end marker is the NEXT declaration, not part of the slice.
const workflowCode = slice(source, '  var WF_STAGE_LABELS=', '  function toolExtraFromParams', { keepEnd: false });

test('the practice-panel marker pair appears exactly once in spa_index.html', () => {
  assert.equal(source.split('/* ---- practice panel ---- */').length - 1, 1);
  assert.equal(source.split('/* ---- end practice panel ---- */').length - 1, 1);
});

// ---- the real registries, joined exactly as the shell joins them ------------------------------
const fdCtx = {};
vm.createContext(fdCtx);
vm.runInContext(read('13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js'), fdCtx);

const CURRICULUM = readJSON('curriculum.json');
const TOPIC_META = readJSON('topic_meta.json');
const TOOL_REGISTRY = readJSON('tool_registry.json');
const SITE_MANIFEST = readJSON('13_Faculty_Resources/_automation/site_build/site_manifest.json');
const FD_INDEX = fdCtx.fdBuildIndex(CURRICULUM, TOPIC_META, TOOL_REGISTRY, SITE_MANIFEST);

const RIGHTS_REFS = CURRICULUM.rightsReferences || [];
const manifestTitle = (slug) => {
  for (const group of [SITE_MANIFEST.tools || [], SITE_MANIFEST.md || []]) {
    for (const entry of group) if (entry[1] === slug) return entry[2];
  }
  return null;
};

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ctaHref = (h) => {
  h = h || '';
  const m = h.match(/^tools\/([^/?#]+\.html)$/);
  return m ? `?tool=${m[1]}` : h;
};
const ctaAttrs = (h) => (/^\?(page|tool)=/.test(h) ? '' : ' target="_blank" rel="noopener"');

const F = new Function('esc', 'ctaHref', 'ctaAttrs', 'FD_INDEX', 'window',
  `${workflowCode}\n${panelCode}\nreturn {
     buildTpl: buildTpl, buildPracticeTools: buildPracticeTools, buildWorkflow: buildWorkflow,
     practiceToolLabel: practiceToolLabel, practiceIsRights: practiceIsRights,
     practiceActionLabel: practiceActionLabel, hasPracticeTpl: hasPracticeTpl,
     PRACTICE_MODE_LABELS: PRACTICE_MODE_LABELS, WF_FIELDS: WF_FIELDS,
     WF_STAGE_LABELS: WF_STAGE_LABELS, PRACTICE_LABEL_NEUTRAL: PRACTICE_LABEL_NEUTRAL };`,
)(esc, ctaHref, ctaAttrs, FD_INDEX, {});

const topicEntries = Object.entries(TOPIC_META).filter(([, m]) => m && typeof m === 'object');
const renderAll = () => topicEntries
  .filter(([, m]) => F.hasPracticeTpl(m))
  .map(([ref, m]) => [ref, F.buildTpl(m, ref)]);

// ---- WP-B · governance -------------------------------------------------------------------------

test('curriculum.rightsReferences is non-empty and every entry resolves in FD_INDEX', () => {
  assert.ok(RIGHTS_REFS.length > 0, 'the rights contract must name at least one page');
  for (const ref of RIGHTS_REFS) {
    assert.equal(F.practiceIsRights(ref), true, `${ref} must be seen as a rights reference`);
  }
});

test('a rights reference never renders as an action anywhere in the panel', () => {
  let seen = 0;
  for (const [ref, html] of renderAll()) {
    for (const rights of RIGHTS_REFS) {
      const re = new RegExp(`<a class="([^"]*)" href="\\?tool=${rights.replace('.', '\\.')}"[^>]*>([^<]*)</a>`, 'g');
      let m;
      while ((m = re.exec(html)) !== null) {
        seen += 1;
        const [, cls, text] = m;
        assert.match(cls, /\bis-reference\b/, `${ref}: ${rights} must carry is-reference, got "${cls}"`);
        assert.doesNotMatch(cls, /\bis-safety\b/, `${ref}: ${rights} must not get the safety treatment`);
        assert.doesNotMatch(text, /→/, `${ref}: ${rights} must not render an action arrow`);
        assert.equal(text, esc(manifestTitle(rights)),
          `${ref}: ${rights} must print the registry title, not an author label`);
      }
    }
  }
  assert.ok(seen >= 20, `expected the rights references to be reachable from many pages, saw ${seen}`);
});

test('no retired instrument label or "open the screener" imperative survives anywhere', () => {
  const BANNED = [
    'C-SSRS Suicide Screen', 'CIWA-Ar / COWS', 'Bush-Francis Catatonia<',
    'Open the C-SSRS screener', 'Open the Columbia C-SSRS screener', 'Open the BFCRS scale',
    '>Open C-SSRS<', '>Open BFCRS<',
  ];
  for (const [ref, html] of renderAll()) {
    for (const phrase of BANNED) {
      assert.ok(!html.includes(phrase), `${ref} still emits ${JSON.stringify(phrase)}`);
    }
  }
});

test("buildWorkflow's actions row also refuses the author's rights-reference label", () => {
  const html = F.buildWorkflow({
    clinicalWorkflow: { ask: 'x', actions: [{ label: 'Open the C-SSRS screener', href: '?tool=cssrs.html' }] },
  });
  assert.ok(!html.includes('Open the C-SSRS screener'));
  assert.ok(html.includes(esc(manifestTitle('cssrs.html'))));
});

test('a non-rights tool still keeps the author-written cta label', () => {
  const html = F.buildPracticeTools(
    { cta: [{ label: 'Open the Agitation Ladder trainer', href: 'tools/rp-agitation.html' }] },
    'agitation.md', 'ward',
  );
  assert.ok(html.includes('Open the Agitation Ladder trainer'));
});

// ---- WP-A (label half) · titles come from the registry -----------------------------------------

// The slug set is taken from what the panels actually render, not reconstructed from the
// source maps — so it stays honest when WP-A deletes those maps. feedback.html and
// rotation-curator.html ship in the manifest but no panel links them, so they are correctly
// out of scope here.
const emittedToolSlugs = () => {
  const slugs = new Set();
  for (const [, html] of renderAll()) {
    const re = /href="\?tool=([^"&]+)"/g;
    let m;
    while ((m = re.exec(html)) !== null) slugs.add(decodeURIComponent(m[1]));
  }
  return [...slugs];
};

test('every tool the panel can link resolves in FD_INDEX', () => {
  // A slug absent from FD_INDEX silently degrades to a mangled title ("interaction cards"),
  // which is exactly the drift this workstream removes — fail loudly instead.
  const inIndex = new Set();
  for (const col of FD_INDEX.columns || []) for (const it of col.items || []) inIndex.add(it.ref);
  for (const slug of emittedToolSlugs()) {
    assert.ok(inIndex.has(slug), `${slug} is linked from a panel but missing from FD_INDEX`);
  }
});

test('the default label for every tool the panel can link equals the registry title', () => {
  for (const slug of emittedToolSlugs()) {
    const expected = F.PRACTICE_LABEL_NEUTRAL[slug] || manifestTitle(slug);
    assert.equal(F.practiceToolLabel(slug), expected, `${slug} label drifted from the registry`);
  }
});

// ---- WP-C · audience-neutral chrome -------------------------------------------------------------

const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

test('every label constant the panel owns is audience-neutral', () => {
  const owned = [
    ...Object.values(F.PRACTICE_MODE_LABELS),
    ...Object.values(F.WF_STAGE_LABELS),
    ...F.WF_FIELDS.map(([, label]) => label),
    ...Object.values(F.PRACTICE_LABEL_NEUTRAL),
  ];
  for (const label of owned) {
    assert.doesNotMatch(label, AUDIENCE_TOKEN_RE, `panel label ${JSON.stringify(label)} names an audience`);
  }
});

test('panel chrome carries no audience token when content is neutral', () => {
  // A synthetic meta whose own text is deliberately token-free, exercising every branch, so
  // anything the regex finds is the panel's own copy rather than authored clinical prose.
  const html = F.buildTpl({
    tldr: 'One line.', points: ['A point.'], read: 4, hy: true, safetyLevel: 'high',
    evidenceIds: ['e1'], facultyReview: { status: 'reviewed', lastReviewed: '2026-01-01' },
    workflowModes: ['ward', 'shelf', 'family', 'safety', '5min'],
    workflowStages: ['encounter', 'diagnosis', 'safety', 'treatment', 'communication', 'family', 'team', 'exam'],
    clinicalWorkflow: {
      ask: 'Ask.', mse: 'Observe.', safety: 'Escalate.', say: 'Say.', collateral: 'Call.',
      rounds: 'Report.', exam: 'Distinguish.',
      actions: [{ label: 'Open a tool', href: '?tool=decision-aids.html' }],
    },
    cant: 'Do not miss it.', ruleOut: ['One', 'Two'], firstMove: 'Move.',
    quiz: { q: 'Q?', o: [{ t: 'A', c: true }, { t: 'B' }], why: 'Because.' },
    relatedTools: ['decision-aids.html', 'cssrs.html'],
    communicationCases: ['suicide_direct_question_001'],
  }, 'synthetic.md');
  const found = html.match(AUDIENCE_TOKEN_RE);
  assert.equal(found, null, `panel chrome names an audience: ${found && found[0]}`);
});

// ---- D-1 · the collapsed summary is untouched ---------------------------------------------------

test('the collapsed summary markup is unchanged (D-1: panel stays a collapsed accessory)', () => {
  const [, html] = renderAll()[0];
  assert.ok(html.startsWith('<details class="topic-tpl practice-panel">'),
    'the panel must still open closed — no `open` attribute');
  assert.ok(html.includes(
    '<summary class="practice-summary"><span class="practice-tab">Ward</span>'
    + '<span class="practice-title">On the Unit Practice and Tools</span>'
    + '<span class="practice-sub">Quick take · bedside use · self-test · drills/tools</span>'
    + '<span class="practice-hint"><span class="practice-hint-open">Click to open</span>'
    + '<span class="practice-hint-close">Click to close</span></span>'
    + '<span class="practice-chev" aria-hidden="true">›</span></summary>'),
    'the summary block must be byte-identical — it is what the visual baselines screenshot');
});

test('the panel stylesheet block is unmodified (D-1: no new CSS)', () => {
  assert.ok(source.includes('.practice-action.is-drill{align-items:flex-start'),
    'existing practice-action styles must still be present');
  assert.ok(!/\.practice-action\.is-reference\s*\{/.test(source),
    'is-reference is intentionally an unstyled hook — adding CSS for it needs a baseline refresh');
});
