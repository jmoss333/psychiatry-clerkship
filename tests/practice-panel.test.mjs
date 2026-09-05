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
import test from 'node:test';

// The render path itself lives in tests/_panel_render.mjs so that these assertions and the
// snapshots in tests/__panels__/ run over the SAME rendered HTML. Two parallel renderers
// could disagree, and a snapshot that disagrees with the assertions is worse than none.
import {
  F, renderAll, topicEntries, esc, actionKey, manifestTitle, source,
  TOPIC_META, TOOL_REGISTRY, FD_INDEX, RIGHTS_REFS, CASE_TITLES, read,
} from './_panel_render.mjs';

test('the practice-panel marker pair appears exactly once in spa_index.html', () => {
  assert.equal(source.split('/* ---- practice panel ---- */').length - 1, 1);
  assert.equal(source.split('/* ---- end practice panel ---- */').length - 1, 1);
});

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
      // NOTE: match ANY anchor, not just class-carrying ones. buildWorkflow emits
      // `<a href=...>` with no class attribute, so the earlier `<a class="..." href=`
      // form silently skipped it — that false negative is what let 9 pages ship a
      // retired instrument as a workflow action (Codex P1 on #480).
      const re = new RegExp(`<a ([^>]*)href="\\?tool=${rights.replace('.', '\\.')}"[^>]*>([^<]*)</a>`, 'g');
      let m;
      while ((m = re.exec(html)) !== null) {
        seen += 1;
        const [, attrs, text] = m;
        const cls = (attrs.match(/class="([^"]*)"/) || [, ''])[1];
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

test("buildWorkflow drops a rights reference from its actions row entirely", () => {
  // Relabelling was not enough: a retired instrument under a corrected title is still being
  // offered as a workflow action. buildPracticeTools routes the same target to the
  // "Official forms" block, so suppressing it here loses nothing (asserted on real data below).
  const html = F.buildWorkflow({
    clinicalWorkflow: { ask: 'x', actions: [{ label: 'Open the C-SSRS screener', href: '?tool=cssrs.html' }] },
  });
  assert.ok(!html.includes('Open the C-SSRS screener'));
  assert.ok(!html.includes('?tool=cssrs.html'), 'a rights reference must not appear as a workflow action');
  assert.ok(!html.includes('<div class="workflow-actions">'),
    'an actions row emptied by suppression must not render as an empty container');
});

test('a non-rights workflow action still renders, alongside a suppressed one', () => {
  const html = F.buildWorkflow({
    clinicalWorkflow: {
      ask: 'x',
      actions: [{ label: 'Open C-SSRS', href: '?tool=cssrs.html' },
                { label: 'Open the ladder', href: '?tool=rp-agitation.html' }],
    },
  });
  assert.ok(!html.includes('?tool=cssrs.html'));
  assert.match(html, /<div class="workflow-actions">/);
  assert.ok(html.includes('Open the ladder'));
});

test('a non-rights tool still keeps the author-written cta label', () => {
  const html = F.buildPracticeTools(
    { cta: [{ label: 'Open the Agitation Ladder trainer', href: 'tools/rp-agitation.html' }] },
    'agitation.md',
  );
  assert.ok(html.includes('Open the Agitation Ladder trainer'));
});

// ---- Codex review of #480 · the workflow card is the third renderer -----------------------------
//
// Both findings below were real and both were invisible to the tests above: buildWorkflow emits
// class-less anchors and was never passed the promoted-action seen set. They are pinned against
// the WHOLE of topic_meta, not a synthetic fixture, because the count is the point.

test('P1 · no rights reference is emitted inside a workflow-actions row, on any page', () => {
  let rows = 0;
  for (const [ref, m] of topicEntries) {
    if (!F.hasPracticeTpl(m)) continue;
    const wa = F.buildTpl(m, ref).match(/<div class="workflow-actions">([\s\S]*?)<\/div>/);
    if (!wa) continue;
    rows += 1;
    for (const rights of RIGHTS_REFS) {
      assert.ok(!wa[1].includes(`?tool=${rights}`),
        `${ref}: ${rights} is presented as a workflow action`);
    }
  }
  assert.ok(rows >= 20, `expected many pages to render a workflow actions row, saw ${rows}`);
});

test('P1 · suppressing it in the workflow card never loses the Official-forms link', () => {
  // The governance fix must not become a governance regression: every page that declares a
  // rights reference anywhere must still route the learner to the official form.
  let checked = 0;
  for (const [ref, m] of topicEntries) {
    if (!F.hasPracticeTpl(m)) continue;
    const declared = new Set();
    const ctas = Array.isArray(m.cta) ? m.cta : (m.cta ? [m.cta] : []);
    for (const a of [...ctas, ...((m.clinicalWorkflow || {}).actions || [])]) {
      const key = (typeof a === 'object' && a) ? actionKey(a.href || '') : '';
      if (RIGHTS_REFS.includes(key)) declared.add(key);
    }
    if (!declared.size) continue;
    const html = F.buildTpl(m, ref);
    const forms = html.indexOf('>Official forms<');
    assert.notEqual(forms, -1, `${ref} declares a rights reference but shows no Official forms block`);
    for (const key of declared) {
      checked += 1;
      assert.ok(html.slice(forms).includes(`?tool=${key}`),
        `${ref}: ${key} vanished instead of moving to Official forms`);
    }
  }
  assert.ok(checked >= 9, `expected at least the 9 audited pages, saw ${checked}`);
});

test('P2 · the promoted primary is never repeated in the workflow actions row', () => {
  // Dedupe is by DESTINATION, not by tool: `?tool=x.html` and `?tool=x.html&case=y` are two
  // different places to land, and the author's case-specific action carries its own label.
  // Collapsing them by tool would suppress the more specific one, which is the worse outcome.
  for (const [ref, m] of topicEntries) {
    if (!F.hasPracticeTpl(m)) continue;
    const html = F.buildTpl(m, ref);
    const pm = html.match(/Do this next<\/div><div class="practice-actions">([\s\S]*?)<\/div>/);
    const wa = html.match(/<div class="workflow-actions">([\s\S]*?)<\/div>/);
    if (!pm || !wa) continue;
    const href = (pm[1].match(/href="([^"]+)"/) || [])[1];
    if (!href) continue;
    assert.ok(!wa[1].includes(`href="${href}"`),
      `${ref}: the promoted action ${href} is repeated in the workflow card`);
  }
});

test('a workflow actions row is never rendered empty by suppression', () => {
  for (const [ref, m] of topicEntries) {
    if (!F.hasPracticeTpl(m)) continue;
    const wa = F.buildTpl(m, ref).match(/<div class="workflow-actions">([\s\S]*?)<\/div>/);
    if (wa) assert.ok(!/^\s*$/.test(wa[1]), `${ref} renders an empty workflow-actions container`);
  }
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
  const html = F.buildPracticeTools({ relatedTools: ['screeners.html'] }, 'med_monitoring.md');
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

// ---- WP-D · one reason, one primary action ----------------------------------------------------

const NEVER = () => false;  // no drill done yet — deterministic stand-in for cw_srs_v1

test('the fake mode UI is gone from the shell', () => {
  for (const dead of ['practiceModeCfg', 'practiceModeText', 'sortPracticeTools',
    'sortPracticeCases', '__casePriority', 'PRACTICE_MODE_LABELS']) {
    assert.ok(!new RegExp(`(function|var)\\s+${dead}\\b`).test(source),
      `${dead} implied a mode filter that never existed — it must not come back`);
  }
  assert.doesNotMatch(source, /tpl-chip mode/,
    'the mode chips rendered like a segmented control with no handler behind them');
});

test('every page shows at most one primary action, and it is one the page already linked', () => {
  let withPrimary = 0;
  for (const [ref, m] of topicEntries) {
    if (!F.hasPracticeTpl(m)) continue;
    const primary = F.practicePrimary(m, ref, 'encode', NEVER);
    if (!primary) continue;
    withPrimary += 1;
    const html = F.buildTpl(m, ref);
    assert.equal(html.split('>Do this next<').length - 1, 1, `${ref} must render exactly one primary`);
    const caseId = (primary.href.match(/[?&]case=([^&#]+)/) || [])[1];
    if (caseId) {
      // A drill's link IS its case id; the page need not list communication-practice.html.
      assert.ok((m.communicationCases || []).includes(decodeURIComponent(caseId)),
        `${ref}: promoted a drill the page does not list`);
    } else {
      const slug = decodeURIComponent((primary.href.match(/[?&]tool=([^&#]+)/) || [])[1]);
      assert.ok(new Set(F.practiceLinkedTools(m, ref)).has(slug),
        `${ref}: promoting ${slug} must not introduce a link the page did not have`);
    }
  }
  assert.ok(withPrimary >= 60, `most pages should get a primary action, got ${withPrimary}`);
});

test('a rights reference is never the primary action', () => {
  for (const [ref, m] of topicEntries) {
    if (!F.hasPracticeTpl(m)) continue;
    const primary = F.practicePrimary(m, ref, 'encode', NEVER);
    if (!primary) continue;
    const slug = decodeURIComponent((primary.href.match(/[?&]tool=([^&#]+)/) || [])[1] || '');
    assert.ok(!RIGHTS_REFS.includes(slug), `${ref} promoted ${slug}, which is a reference not an action`);
  }
});

test('the primary is deterministic for a fixed phase, and the phase tilts it to retrieval', () => {
  const m = { safetyLevel: 'high', relatedTools: ['violence.html', 'review.html'], tldr: 'x' };
  const steady = F.practicePrimary(m, 'synthetic.md', 'encode', NEVER);
  assert.equal(steady.href, '?tool=violence.html', 'away from the exam, safety work leads');
  for (const phase of ['taper', 'consolidate']) {
    assert.equal(F.practicePrimary(m, 'synthetic.md', phase, NEVER).href, '?tool=review.html',
      `in ${phase} the page's own retrieval tool leads`);
  }
  // Same inputs, same answer — no clock, no storage inside the ranking itself.
  assert.deepEqual(F.practicePrimary(m, 'synthetic.md', 'encode', NEVER), steady);
});

test('a drill already done is not offered as the primary', () => {
  const m = { communicationCases: ['suicide_direct_question_001', 'psychosis_validation_001'] };
  const fresh = F.practicePrimary(m, 'synthetic.md', 'encode', NEVER);
  assert.match(fresh.href, /case=suicide_direct_question_001/);
  const doneFirst = (id) => id === 'suicide_direct_question_001';
  assert.match(F.practicePrimary(m, 'synthetic.md', 'encode', doneFirst).href,
    /case=psychosis_validation_001/, 'the next unfinished drill should take over');
});

test('no sentence appears twice in one panel', () => {
  // The old "Why today" line printed clinicalWorkflow.rounds, which the grid renders verbatim.
  for (const [ref, m] of topicEntries) {
    if (!F.hasPracticeTpl(m)) continue;
    const html = F.buildTpl(m, ref);
    const cw = m.clinicalWorkflow || {};
    for (const field of ['rounds', 'ask', 'exam', 'safety', 'say', 'collateral', 'mse']) {
      const v = cw[field];
      if (!v || String(v).length < 25) continue;
      assert.equal(html.split(esc(v)).length - 1, 1,
        `${ref}: clinicalWorkflow.${field} is rendered more than once`);
    }
    if (m.cant) {
      assert.equal(html.split(esc(m.cant)).length - 1, 1, `${ref}: the can't-miss is rendered twice`);
    }
  }
});

test('the reason is the promoted can\'t-miss, never a copy of a grid row', () => {
  for (const [ref, m] of topicEntries) {
    const reason = F.practiceReason(m);
    if (!reason) continue;
    assert.equal(reason, m.cant, `${ref}: the reason must be the can't-miss`);
    const cw = m.clinicalWorkflow || {};
    for (const field of ['rounds', 'ask', 'exam']) {
      assert.notEqual(reason, cw[field], `${ref}: the reason must not repeat clinicalWorkflow.${field}`);
    }
  }
});

// ---- WP-F · the quiz-less empty state ------------------------------------------------------------

test('a quiz-less page offers retrieval without apologising for the missing quiz', () => {
  let quizless = 0;
  for (const [ref, m] of topicEntries) {
    if (!F.hasPracticeTpl(m) || m.quiz) continue;
    quizless += 1;
    const html = F.buildTpl(m, ref);
    assert.ok(!html.includes('No page-specific question yet'),
      `${ref}: the panel still apologises for having no quiz`);
    // The two retrieval actions MUST survive. review.html is hidden:true in nav on BOTH sites
    // and appears nowhere else in the shell except practicePrimary's phase-gated branch and
    // buildPracticeTools' empty state (which fires on only 3 pages), so dropping them here
    // would make Daily Review unreachable on 28 of these pages.
    assert.match(html, /href="\?tool=question-bank-practice\.html"/, `${ref}: lost Practice Questions`);
    assert.match(html, /href="\?tool=review\.html"/, `${ref}: lost Daily Review`);
  }
  // A non-vacuity guard, NOT a corpus pin. It asserts only that the loop ran, so a broken
  // hasPracticeTpl or an always-truthy m.quiz cannot make this test pass by iterating nothing.
  // It deliberately does not pin HOW MANY quiz-less pages exist: authoring quizzes is the fix
  // for that debt, and a threshold would fail the build for making the improvement — with 31
  // today, a `>= 25` pin broke as soon as seven pages gained a quiz (Codex P2 on #534). The
  // synthetic case below keeps the contract alive even if every page eventually carries one.
  assert.ok(quizless >= 1, 'no quiz-less page was exercised; the empty state went untested');
});

test('the quiz-less empty state holds even when no real page is quiz-less', () => {
  // Pins the same contract against a fixture rather than against content debt, so it survives
  // the corpus reaching zero quiz-less pages — the state this test exists to protect is a
  // property of the renderer, not a property of how much quiz authoring is outstanding.
  const html = F.buildTpl({ tldr: 'A page with no quiz.' }, 'synthetic-quizless.md');
  assert.ok(!html.includes('No page-specific question yet'), 'the panel apologises for having no quiz');
  assert.match(html, /href="\?tool=question-bank-practice\.html"/, 'lost Practice Questions');
  assert.match(html, /href="\?tool=review\.html"/, 'lost Daily Review');
});

test('every quiz-less page still routes to Daily Review somewhere in its panel', () => {
  // Guards the reachability argument above as data, not as a comment: if a later change removes
  // the fallback pair, this fails even if the apology assertion still passes.
  for (const [ref, m] of topicEntries) {
    if (!F.hasPracticeTpl(m) || m.quiz) continue;
    assert.match(F.buildTpl(m, ref), /\?tool=review\.html/, `${ref}: no route to Daily Review`);
  }
});

// ---- WP-E · density and grouping --------------------------------------------------------------

const countActions = (html, cls) => [...html.matchAll(/<a class="practice-action([^"]*)"/g)]
  .filter((m) => (cls ? m[1].includes(cls) : true)).length;

test('no page shows more than five actions before the disclosure', () => {
  // Drills and references sit outside the budget by design — they are separately labelled
  // blocks, not competing calls to action (the plan says drills keep their own block).
  let capped = 0;
  for (const [ref, m] of topicEntries) {
    if (!F.hasPracticeTpl(m)) continue;
    const html = F.buildTpl(m, ref);
    const moreAt = html.indexOf('<details class="practice-more">');
    const visible = moreAt === -1 ? html : html.slice(0, moreAt);
    // is-review is the quiz-less / empty-state fallback pair rendered by Test-yourself —
    // panel chrome, not a registry-derived tool link, and outside the Tools budget.
    const actions = countActions(visible) - countActions(visible, 'is-drill')
      - countActions(visible, 'is-reference') - countActions(visible, 'is-review');
    assert.ok(actions <= 5, `${ref} shows ${actions} actions before the disclosure`);
    if (moreAt !== -1) capped += 1;
  }
  assert.ok(capped >= 15, `expected the cap to actually engage on the dense pages, hit ${capped}`);
});

test('the disclosure hides the overflow rather than dropping it', () => {
  // week1.md was the worst page in the audit; nothing it linked may disappear.
  const before = new Set([...F.buildTpl(TOPIC_META['week1.md'], 'week1.md')
    .matchAll(/href="(\?tool=[^"]+)"/g)].map((m) => m[1]));
  assert.ok(before.size >= 8, `week1.md should still link everything it did, saw ${before.size}`);
  const html = F.buildTpl(TOPIC_META['week1.md'], 'week1.md');
  assert.match(html, /<details class="practice-more"><summary[^>]*>More for this page \(\d+\)</,
    'the densest page must get a disclosure');
});

test('high-risk bedside tools get their own labelled row, and rights refs never join it', () => {
  let pagesWithAssess = 0;
  for (const [ref, m] of topicEntries) {
    if (!F.hasPracticeTpl(m)) continue;
    const html = F.buildTpl(m, ref);
    const at = html.indexOf('>Assess at the bedside<');
    if (at === -1) continue;
    pagesWithAssess += 1;
    const row = html.slice(at, html.indexOf('</div>', html.indexOf('<div class="practice-actions">', at)));
    for (const x of row.matchAll(/href="\?tool=([^"&]+)"/g)) {
      const slug = decodeURIComponent(x[1]);
      assert.equal(F.practiceIsSafe(slug), true, `${ref}: ${slug} is in Assess but is not high risk`);
      assert.ok(!RIGHTS_REFS.includes(slug), `${ref}: ${slug} is a rights reference, not an action`);
    }
  }
  assert.ok(pagesWithAssess >= 10, `expected an Assess row on many pages, saw ${pagesWithAssess}`);
});

test('references keep their own labelled block, below everything else', () => {
  const html = F.buildTpl(TOPIC_META['catatonia.md'], 'catatonia.md');
  const forms = html.indexOf('>Official forms<');
  assert.ok(forms !== -1, 'a page with a rights reference must label it');
  assert.ok(forms > html.indexOf('<div class="practice-actions">'), 'references come last');
  assert.match(html.slice(forms), /the instrument itself is not reproduced here/);
});

test('the disclosure adds no CSS (D-1)', () => {
  for (const hook of ['practice-more', 'is-reference']) {
    assert.ok(!new RegExp(`\\.${hook}\\s*\\{`).test(source),
      `${hook} is an intentionally unstyled hook — styling it needs a visual-baseline refresh`);
  }
  // The nested summary borrows an existing heading class rather than a new rule.
  assert.match(source, /<summary class="practice-section-title">More for this page/);
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
