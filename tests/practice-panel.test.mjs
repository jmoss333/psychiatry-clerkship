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

// The build injects case titles into a `var PRACTICE_CASE_TITLES={};` needle (build_deploy.py).
// Doing the same replacement here pins that needle: if it is renamed or removed, this throws
// rather than silently testing a panel whose drills have all lost their names.
const CASE_TITLES = Object.fromEntries(
  (readJSON('communication_cases.json').cases || [])
    .filter((c) => c && c.id && c.title).map((c) => [c.id, c.title]),
);
const CASE_NEEDLE = 'var PRACTICE_CASE_TITLES={};';
assert.equal(panelCode.split(CASE_NEEDLE).length - 1, 1,
  'the practice panel must carry exactly one PRACTICE_CASE_TITLES injection needle');
const injectedPanelCode = panelCode.replace(
  CASE_NEEDLE, `var PRACTICE_CASE_TITLES=${JSON.stringify(CASE_TITLES)};`);

const F = new Function('esc', 'ctaHref', 'ctaAttrs', 'FD_INDEX', 'FD_TOOL_REGISTRY', 'window',
  `${workflowCode}\n${injectedPanelCode}\nreturn {
     buildTpl: buildTpl, buildPracticeTools: buildPracticeTools, buildWorkflow: buildWorkflow,
     practiceToolLabel: practiceToolLabel, practiceIsRights: practiceIsRights,
     practiceActionLabel: practiceActionLabel, hasPracticeTpl: hasPracticeTpl,
     PRACTICE_MODE_LABELS: PRACTICE_MODE_LABELS, WF_FIELDS: WF_FIELDS,
     WF_STAGE_LABELS: WF_STAGE_LABELS, practiceCaseLabel: practiceCaseLabel,
     practiceIsSafe: practiceIsSafe, practiceRegistryTools: practiceRegistryTools };`,
)(esc, ctaHref, ctaAttrs, FD_INDEX, TOOL_REGISTRY, {});

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
    assert.equal(F.practiceToolLabel(slug), manifestTitle(slug),
      `${slug} label drifted from the registry`);
  }
});

// ---- WP-A · one source of truth for links, labels and risk ------------------------------------

test('drill labels come from communication_cases.json, with no generic fallback', () => {
  // The hand map this replaced had fallen two cases behind, so pg_interview, t_psychosis and
  // doc_oral each rendered an unnamed "What Do You Say Next?" tile beside named ones.
  const referenced = new Set();
  for (const [, m] of topicEntries) for (const id of (m.communicationCases || [])) referenced.add(id);
  assert.ok(referenced.size >= 10, `expected many cases to be referenced, saw ${referenced.size}`);
  for (const id of referenced) {
    assert.ok(CASE_TITLES[id], `${id} is referenced by a topic but absent from communication_cases.json`);
    assert.equal(F.practiceCaseLabel(id), CASE_TITLES[id], `${id} drill label drifted from the registry`);
  }
});

test('the registry back-links the old hand map never surfaced now reach the panel', () => {
  // tool_registry.relatedPages is the curated catalog view and it under-linked: 15 declared
  // links reached no panel at all. Assert the reverse index is what the panel reads.
  for (const t of TOOL_REGISTRY.tools) {
    for (const page of (t.relatedPages || [])) {
      assert.ok(F.practiceRegistryTools(page).includes(t.file),
        `${t.file} is declared for ${page} but the panel does not derive it`);
    }
  }
  // one-patient-six-weeks.html was declared on 11 pages and surfaced on 1 — spot-check the worst.
  assert.ok(F.practiceRegistryTools('med_monitoring.md').includes('interaction-cards.html'));
  assert.ok(F.practiceRegistryTools('pg_interview.md').includes('one-patient-six-weeks.html'));
});

test('a page links exactly the union of both registries, and nothing else', () => {
  // Scoped to registry-derived anchors. Two kinds of link in the panel are chrome, not data:
  // the hardcoded "See the visual decision aids" link inside the rule-out mini-tree, and the
  // is-review pair the quiz-less and empty-state fallbacks emit.
  const toolKey = (href) => {
    const s2 = String(href || '');
    const q = s2.match(/[?&]tool=([^&#]+)/);
    if (q) return decodeURIComponent(q[1]);
    const rel = s2.match(/^tools\/([^/?#]+\.html)$/);
    return rel ? rel[1] : '';
  };
  for (const [ref, m] of topicEntries) {
    if (!F.hasPracticeTpl(m)) continue;
    const expected = new Set([...F.practiceRegistryTools(ref), ...(m.relatedTools || [])]);
    const ctas = m.cta ? (Array.isArray(m.cta) ? m.cta : [m.cta]) : [];
    for (const c of [...ctas, ...((m.clinicalWorkflow && m.clinicalWorkflow.actions) || [])]) {
      const k = toolKey(c && c.href); if (k) expected.add(k);
    }
    const html = F.buildTpl(m, ref);
    for (const x of html.matchAll(/<a class="practice-action([^"]*)" href="\?tool=([^"&]+)"/g)) {
      if (x[1].includes('is-review')) continue;
      const slug = decodeURIComponent(x[2]);
      assert.ok(expected.has(slug), `${ref} renders ${slug}, which neither registry links`);
    }
  }
});

test('declared links lead and an authored-only link follows, neither dropped', () => {
  // The two sources disagree in opposite directions, so the rule is reconcile, not union-and-
  // shrug: med_monitoring.md is declared for interaction-cards and one-patient-six-weeks, and
  // an author adding screeners.html must not displace either.
  const html = F.buildPracticeTools({ relatedTools: ['screeners.html'] }, 'med_monitoring.md', 'ward');
  const order = [...html.matchAll(/href="\?tool=([^"&]+)"/g)].map((x) => decodeURIComponent(x[1]));
  for (const declared of ['interaction-cards.html', 'one-patient-six-weeks.html']) {
    assert.ok(order.includes(declared), `${declared} is registry-declared and must appear`);
    assert.ok(order.indexOf(declared) < order.indexOf('screeners.html'),
      `${declared} is declared and must lead the authored-only link`);
  }
  assert.ok(order.includes('screeners.html'), 'the authored link must not be dropped');
});

test('the safety class comes from tool_registry.riskLevel', () => {
  const highRisk = TOOL_REGISTRY.tools.filter((t) => t.riskLevel === 'high').map((t) => t.file);
  assert.ok(highRisk.length >= 4, 'expected several high-risk tools in the registry');
  for (const slug of highRisk) assert.equal(F.practiceIsSafe(slug), true, `${slug} should read as high risk`);
  for (const t of TOOL_REGISTRY.tools) {
    if (t.riskLevel !== 'high') assert.equal(F.practiceIsSafe(t.file), false, `${t.file} should not`);
  }
});

// ---- WP-C · audience-neutral chrome -------------------------------------------------------------

const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

test('every label constant the panel owns is audience-neutral', () => {
  const owned = [
    ...Object.values(F.PRACTICE_MODE_LABELS),
    ...Object.values(F.WF_STAGE_LABELS),
    ...F.WF_FIELDS.map(([, label]) => label),
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
