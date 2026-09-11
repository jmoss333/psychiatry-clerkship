import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadBenchmark, runBenchmark } from './run.mjs';

const OUTPUT = new URL('./calibration.html', import.meta.url);
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const rows = [
  { id: 'c_si', label: 'Suicide-screening checklist row' },
  { id: 'c_si_followup', label: 'Follow-up checklist row' },
];

export function runSide(report, id, selectedRows = rows) {
  const run = report.runs.find(r => r.id === id);
  assert.ok(run?.frames.length, `Missing benchmark run: ${id}`);
  const last = run.frames.at(-1);
  return {
    sourceId: id,
    context: run.frames.filter(f => f.setup).map(f => ({ learner: f.student, patient: f.patient })),
    turns: run.frames.filter(f => !f.setup).map(f => ({ learner: f.student, patient: f.patient })),
    coverage: selectedRows.map(row => {
      assert.ok(last.client.coverage[row.id], `${id}: missing ${row.id}`);
      return { ...row, status: last.client.coverage[row.id] };
    }),
    strengths: last.narrative.strengths,
  };
}

// Read context from the actual captured evaluator input, not a parallel fixture.
function capturedTurns(variant) {
  const transcript = variant.transcript.split('\n\nSTUDENT SELF-ASSESSMENT:')[0];
  const matches = [...transcript.matchAll(/\[(\d+)\] STUDENT: ([\s\S]*?)\n\[\1\] PATIENT: ([\s\S]*?)(?=\n\[\d+\] STUDENT:|$)/g)];
  assert.ok(matches.length, 'Missing captured conversation');
  return matches.map(m => ({ learner: m[2], patient: m[3] }));
}

// The pair's evaluation leg can be skipped (pack_not_approved: the shipped
// pack's top-level status is not reviewed/attested, so sp.mjs's own gate
// refuses every POST before an evaluator input ever exists to capture). That
// is a real, visible outcome — not something this exercise papers over with a
// parallel fixture or a silently empty comparison. See run.mjs's responsePair.
function responsePair(report, id, title, focus) {
  const pair = report.responsePairs.find(p => p.id === id);
  assert.ok(pair, `Missing response pair: ${id}`);
  assert.equal(pair.variants.length, 2, `${id}: expected two response variants`);
  if (pair.skipped) {
    return { id, title, focus, persona: pair.case, suppliedReplies: true,
      skipped: pair.skipped, discussion: pair.questionForFaculty };
  }
  assert.ok(pair.completed, `${id}: response pair did not complete`);
  return {
    id, title, focus, persona: pair.case, suppliedReplies: true,
    coverageChanged: JSON.stringify(pair.variants[0].coverage) !== JSON.stringify(pair.variants[1].coverage),
    discussion: pair.questionForFaculty,
    sides: pair.variants.map((variant, index) => {
      assert.equal(variant.handlerStatus, 200, `${id}: incomplete handler capture`);
      const turns = capturedTurns(variant);
      assert.deepEqual(turns.at(-1), { learner: pair.question, patient: variant.patient });
      return { sourceId: `${id}/${index + 1}`, context: turns.slice(0, -1), turns: turns.slice(-1),
        coverage: variant.coverage, strengths: [], promptSha256: variant.promptSha256 };
    }),
  };
}

export function buildCalibration(report) {
  assert.equal(report.reviewStatus, 'pending-faculty-review');
  assert.equal(report.summary.controlMismatches, 0, 'Existing controls must pass');
  assert.equal(report.summary.parityMismatches, 0, 'Client/server parity must hold');
  const pairs = [
    { id: 'question-or-statement', title: 'The learner’s wording', persona: 'Dana', suppliedReplies: false,
      focus: 'Consider the final learner turn and the response it elicits.',
      discussion: 'Should a question and a statement receive the same label? What does the patient’s response establish independently of the learner’s wording?',
      sides: [runSide(report, 'plain-screen/Dana'), runSide(report, 'learner-assertion/Dana')] },
    responsePair(report, 'answer-versus-refusal', 'The patient’s response', 'Consider whether the question was answered.'),
    responsePair(report, 'plan-answer-versus-deflection', 'A follow-up question', 'Consider what this exchange establishes about the question asked.'),
    responsePair(report, 'command-answer-versus-interruption', 'A request to pause', 'Consider the response without treating a pause as a learner failure.'),
    { id: 'bundled-or-separate', title: 'One reply, several questions', persona: 'Dana', suppliedReplies: false,
      focus: 'Consider the follow-up exchange as a whole, including every patient reply.',
      discussion: 'Which follow-up topics received an answer in each conversation? Would a separate response indicator make the feedback clearer without implying that the whole risk assessment is complete?',
      sides: [runSide(report, 'compound-one-reply/Dana'), runSide(report, 'sequential-followup/Dana')] },
  ];
  for (const pair of pairs) {
    if (pair.skipped) continue;
    assert.deepEqual(pair.sides[0].context, pair.sides[1].context, `${pair.id}: shared context differs`);
  }
  return { status: report.reviewStatus, governanceAsOf: report.provenance.governanceAsOf,
    sourceHashes: report.provenance.files, pairs };
}

function dialogue(turns) {
  return turns.map(turn => `<div class="exchange"><p class="speaker">Learner</p><p>${esc(turn.learner)}</p><p class="speaker patient-label">Patient</p><p>${esc(turn.patient)}</p></div>`).join('\n');
}

const prompts = [
  ['Learner move', ['Question or invitation', 'Leading question', 'Statement or reflection', 'Mixed / uncertain']],
  ['Patient response', ['Substantive answer', 'Declines to answer', 'Deflects', 'Requests a pause', 'Mixed / insufficient evidence']],
  ['Clarification for this question', ['Further clarification needed', 'This specific question was answered', 'Uncertain']],
];

function observations(pairId, side) {
  return `<fieldset><legend>Your observations · ${side}</legend>${prompts.map(([label, options], index) => {
    const id = `${pairId}-${side}-${index}`;
    return `<label for="${id}">${label}</label><select id="${id}" name="${id}"><option value="">Choose an observation…</option>${options.map((option, i) => `<option value="${i + 1}">${option}</option>`).join('')}</select>`;
  }).join('')}<p class="small">These describe the displayed exchange, not overall safety or learner readiness.</p></fieldset>`;
}

function feedback(side, letter, supplied) {
  return `<div><h4>Conversation ${letter}</h4><dl class="coverage">${side.coverage.map(row => `<div><dt>${esc(row.label)} <code>${esc(row.id)}</code></dt><dd>${esc(row.status)}</dd></div>`).join('')}</dl>${!supplied ? `<p class="speaker">Built-in strengths feedback</p><ul>${side.strengths.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}<p class="small source">Source: ${esc(side.sourceId)}</p></div>`;
}

// A skipped pair still occupies its numbered slot in the worksheet — it is
// never quietly dropped. The banner names the gate (pack_not_approved) and
// carries the discussion question forward, unanswered, rather than hiding it.
function comparisonSection(pair, index, blind) {
  const heading = `<div class="section-heading"><span class="number">0${index + 1}</span><h2 id="${pair.id}-title">${esc(pair.title)}</h2></div>
<p class="focus">${esc(pair.focus)} <span class="small">Synthetic persona: ${esc(pair.persona)}.</span></p>`;
  if (pair.skipped) {
    return `<section class="comparison skipped" aria-labelledby="${pair.id}-title">
${heading}
<p class="notice small">Skipped: <strong>${esc(pair.skipped)}</strong>. The case pack's current top-level review status is not reviewed/attested, so the real evaluation handler refuses this POST request (403 <code>pack_not_approved</code>) before any evaluator input exists to capture. This is the same gate every learner request meets; it is not a benchmark failure and not a clinical finding.</p>
<p class="small">Faculty discussion question, unanswered pending a reviewed or attested pack: ${esc(pair.discussion)}</p>
</section>`;
  }
  return `<section class="comparison" aria-labelledby="${pair.id}-title">
${heading}
${pair.suppliedReplies ? '<p class="notice small">Patient replies were supplied for this exercise. They are alternatives sent through the evaluation handler, not live model responses.</p>' : '<p class="small">Patient replies below came from the actual built-in practice engine.</p>'}
<details class="context"><summary>Shared conversation context</summary><div class="context-body">${dialogue(pair.sides[0].context)}</div></details>
<div class="columns">${pair.sides.map((side, n) => `<article class="conversation ${n ? 'b' : 'a'}" aria-labelledby="${pair.id}-${n}-title"><h3 id="${pair.id}-${n}-title"><span class="letter">CONVERSATION</span>${n ? 'B' : 'A'}</h3>${dialogue(side.turns)}${observations(pair.id, n ? 'B' : 'A')}</article>`).join('')}</div>
${blind ? '' : `<details class="reveal"><summary>Compare with simulator feedback</summary>
<p class="small">${pair.suppliedReplies ? `These are the complete deterministic checklist labels captured in the input sent to the evaluator. No live evaluator was tested; its interpretation is unknown. The supplied patient response changes. ${pair.coverageChanged ? 'The captured labels differ between these conversations.' : 'The captured labels are identical in these conversations.'}` : 'These are the selected checklist labels and built-in strengths feedback after the final turn. They show what the current code reports; they are not a faculty answer key.'} “Observed,” “partial,” “missed,” and “na” are the simulator’s existing terms; “na” means not applicable under its current rule.</p>
<div class="columns">${pair.sides.map((side, n) => feedback(side, n ? 'B' : 'A', pair.suppliedReplies)).join('')}</div>
<div class="discussion"><strong>For discussion · proposed, not adjudicated</strong><p>${esc(pair.discussion)}</p></div></details>`}
</section>`;
}

export function renderCalibration(exercise, { blind = false } = {}) {
  const title = exercise.round === 2 ? 'A fresh set of conversations.' : 'Listening before labeling.';
  const description = blind
    ? 'Simulator labels are not included in this reviewer copy. Record your observations independently, then discuss them before opening the separate facilitator copy.'
    : 'What did the learner do? What did the patient share? Review each pair, record your observations, then compare them with the simulator’s labels.';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'">
<title>${esc(title)} · Interview Room faculty exercise${blind ? ' · Reviewer copy' : ''}</title>
<style>
:root{color-scheme:light;--paper:#f7f5f0;--ink:#203a3b;--muted:#526465;--line:#c3ceca;--a:#285957;--b:#794635}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--a)}
main{max-width:1200px;margin:auto;padding:38px 42px 80px}.masthead{display:flex;justify-content:space-between;gap:20px;align-items:center;border-bottom:1px solid var(--line);padding-bottom:18px;font-size:13px}.status{padding:4px 12px;border:1px solid var(--b);color:var(--b);border-radius:3px}
h1,h2,h3{font-family:Georgia,"Times New Roman",serif;font-weight:normal;line-height:1.15}h1{font-size:clamp(38px,5vw,62px);max-width:750px;margin:36px 0 18px}h2{font-size:32px;margin:0}h3{font-size:26px;margin:0 0 22px}h4{font-size:17px;margin:12px 0}.intro{max-width:790px;font-size:19px}.eyebrow,.speaker{font-size:12px;letter-spacing:.07em;text-transform:uppercase;font-weight:700}.eyebrow{color:var(--muted)}
.instructions{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;padding:24px 0;margin:28px 0 0;border-block:1px solid var(--line)}.instructions p{margin:0}.instructions strong{display:block;margin-bottom:4px}.small{font-size:13px;color:var(--muted);line-height:1.5}.notice{border-left:3px solid var(--b);padding:8px 16px;margin:22px 0}.tools{display:flex;gap:12px;justify-content:flex-end;margin:24px 0}
button{font:inherit;font-size:14px;border:1px solid var(--ink);color:var(--ink);background:transparent;padding:8px 16px;border-radius:3px;cursor:pointer}button:hover{background:#e6ece8}:focus-visible{outline:3px solid #b26530;outline-offset:4px}
.comparison{padding:44px 0;border-bottom:1px solid var(--line)}.section-heading{display:flex;gap:20px;align-items:baseline}.number{font:26px Georgia,serif;color:var(--b)}.focus{margin:12px 0 22px}.columns{display:grid;grid-template-columns:1fr 1fr;gap:32px}.conversation{border-top:4px solid var(--a);padding-top:20px}.conversation.b{border-color:var(--b)}.letter{font:13px system-ui,sans-serif;color:var(--a);display:block;margin-bottom:4px}.b .letter{color:var(--b)}
.exchange{padding:0 0 18px;margin-bottom:18px;border-bottom:1px solid var(--line)}.exchange p{margin:4px 0 12px}.speaker{color:var(--a)}.patient-label{color:var(--b)}.context{margin:0 0 24px}.context .exchange{font-size:15px;max-width:800px}.context-body{padding:14px 0 0 18px}
summary{cursor:pointer;padding:12px 0;font-weight:600}details[open]>summary{margin-bottom:10px}.reveal{margin-top:26px;background:#eaf0ed;border:1px solid var(--line);padding:4px 20px 16px}.reveal>summary{font-size:17px}.reveal .columns{gap:28px}.discussion{margin-top:24px;border-top:1px solid var(--line);padding-top:18px}.discussion p{margin:8px 0}.coverage{font-size:14px}.coverage>div{display:grid;grid-template-columns:1fr auto;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)}dd{margin:0;font-weight:600}code{display:block;font-size:11px;color:var(--muted)}li{margin-bottom:8px}.source{overflow-wrap:anywhere}
fieldset{margin:24px 0 0;padding:16px 18px;border:1px solid var(--line);background:#fffefa}legend{padding:0 8px;font-weight:600;font-size:15px}label{display:block;font-size:14px;margin:12px 0 6px}select{font:inherit;font-size:15px;line-height:1.5;color:var(--ink);background:white;border:1px solid #798d87;border-radius:3px;width:100%;min-height:44px;padding:8px}.closing{max-width:800px;margin-top:42px}.closing h2{font-size:28px}.provenance{margin-top:32px}.hashes{font-size:12px;overflow-wrap:anywhere}.hashes dd{font-family:monospace;font-weight:400;margin:3px 0 14px}
.comparison.skipped{border-left:3px solid var(--b);padding-left:20px}
@media(max-width:700px){main{padding:20px 20px 50px}.masthead{align-items:flex-start;font-size:12px}.status{max-width:140px;text-align:center}.instructions,.columns{grid-template-columns:1fr;gap:22px}.instructions{gap:18px}.tools{justify-content:flex-start;flex-wrap:wrap}.comparison{padding:32px 0}.section-heading{gap:12px}h2{font-size:27px}.conversation.b{margin-top:12px}.reveal{padding-inline:14px}.coverage>div{grid-template-columns:1fr auto}.intro{font-size:17px}}
@media print{body{background:white;font-size:11pt}main{padding:0;max-width:none}.tools{display:none}h1{font-size:30pt}.comparison{break-before:page}.columns{grid-template-columns:1fr 1fr;gap:20px}fieldset,.exchange{break-inside:avoid}.reveal{background:white}.status{border-color:black}.small{color:#333}select{font-size:10pt}summary{font-size:11pt}}
</style>
</head>
<body>
<main>
<div class="masthead"><span>THE INTERVIEW ROOM / FACULTY WORKSHOP</span><span class="status">Pending faculty review</span></div>
<header><p class="eyebrow">${exercise.round === 2 ? `Round two · ${exercise.pairs.length} comparisons · ${blind ? 'Reviewer' : 'Facilitator'} copy` : 'Five comparisons · Synthetic conversations'}</p><h1>${esc(title)}</h1><p class="intro">${description}</p></header>
<div class="instructions"><p><strong>1. Read both exchanges.</strong>Open the shared context when it helps.</p><p><strong>2. Make your own observations.</strong>${blind ? 'Judge each conversation independently.' : 'Judge each conversation before revealing the labels.'}</p><p><strong>3. Discuss the difference.</strong>${blind ? 'Compare observations before opening the facilitator copy.' : 'Identify what a clearer label would need to say.'}</p></div>
<p class="notice small">This is a local faculty discussion exercise, with no answer key or score. Choices remain only on this page and clear on reload or reset. It does not record faculty approval, grade learners, or establish readiness. Print only if you choose to keep a copy.</p>
<form id="worksheet" autocomplete="off">
<div class="tools"><button type="reset">Clear observations</button><button type="button" id="print">Print current worksheet</button></div>
${exercise.pairs.map((pair, i) => comparisonSection(pair, i, blind)).join('\n')}
</form>
${blind ? '' : '<section class="closing"><h2>Approved display meanings</h2><p>Keep <strong>wording recognized</strong>, <strong>question directed to the patient</strong>, and <strong>response obtained</strong> separate. A refusal or request to pause can be acknowledged without marking the learner’s attempt as a failure. Any future response indicator would need evidence from the exchange and an explicit “uncertain” state.</p><p class="small">The project author approved these display meanings on 2026-09-04. Individual conversation labels remain pending review. This exercise changes no scoring rules, patient pack, faculty attestation, or release decision. It is not linked into the learner sites.</p></section>'}
<details class="provenance"><summary>Source and reproducibility</summary><p class="small">Generated from the local conversation benchmark, using the actual client and server functions. The retrospective governance clock is ${esc(exercise.governanceAsOf)}; this is not a current deployment check. Source file hashes identify the measured inputs. The generator checks that this page matches those inputs.</p><dl class="hashes">${Object.entries(exercise.sourceHashes).map(([file, hash]) => `<dt>${esc(file)}</dt><dd>${esc(hash)}</dd>`).join('')}</dl></details>
</main>
<script>
'use strict';
const form = document.getElementById('worksheet');
function clearWorksheet() { form.reset(); document.querySelectorAll('details').forEach(detail => { detail.open = false; }); }
form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('reset', () => document.querySelectorAll('details').forEach(detail => { detail.open = false; }));
window.addEventListener('pageshow', clearWorksheet);
document.getElementById('print').addEventListener('click', () => window.print());
</script>
</body>
</html>
`;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  assert.ok(['--write', '--check'].includes(mode), 'Use calibration.mjs --write or --check');
  const html = renderCalibration(buildCalibration(await runBenchmark(await loadBenchmark())));
  if (mode === '--write') {
    fs.writeFileSync(OUTPUT, html);
    console.log('Generated calibration.html from current benchmark evidence.');
  } else {
    assert.equal(fs.readFileSync(OUTPUT, 'utf8'), html, 'Calibration page is stale; run calibration.mjs --write');
    console.log('Calibration page matches current benchmark evidence.');
  }
}
