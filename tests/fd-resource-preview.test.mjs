import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const base = new URL('../13_Faculty_Resources/_automation/site_build/', import.meta.url);
const read = name => readFileSync(new URL(name, base), 'utf8');
const badge = read('spa_index.html').match(/  function governanceBadge\(triplet,opts\)\{[\s\S]*?\n  \}/)[0];
const F = new Function(`
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${badge}
  ${read('frontdoor/fd_library.js')}
  ${read('frontdoor/fd_sheet.js')}
  return {index:fdBuildIndex, library:fdLibrary, essentials:fdEssentials, sheet:fdSheet};
`)();

const refs = ['pg_interview.md', 'case_formulation.md', 'collateral_workflow.md', 'mse.html', 'other.md'];
function fixture(week = 4) {
  return F.index({
    weeks: [{n:week, title:'Assigned week', items:[{ref:'collateral_workflow.md'}]}],
    libraryColumns: [{name:'Resources', refs}],
    essentials: [{name:'Start here', refs}],
    libraryHints: {'mse.html':'Descriptor bank & written exam builder.'},
  }, {
    'pg_interview.md': {read:5, tldr:'Prepare <before> the interview.'},
    'case_formulation.md': {read:4, tldr:'Connect the history to a formulation.', facultyReview:{status:'reviewed'}},
    'collateral_workflow.md': {read:4, tldr:'Prepare and organize a collateral conversation.'},
  }, {tools:[]}, {
    md: [
      ['src/a', 'pg_interview.md', 'Interview & MSE'],
      ['src/b', 'case_formulation.md', 'Case Formulation', {status:'pending', riskLevel:'high'}],
      ['src/c', 'collateral_workflow.md', 'I Need Collateral: 10-Minute Workflow'],
      ['src/d', 'other.md', 'Other reading'],
    ],
    tools:[['src/mse', 'mse.html', 'Mental Status Exam']],
  });
}
const details = (idx, ref) => F.sheet(idx, {}, {sheet:'item:'+ref, sheetFrom:'library'});

test('both Library views add Details only to pilot rows while titles keep direct opening', () => {
  for (const render of [F.library, F.essentials]) {
    const html = render(fixture());
    const actions = [...html.matchAll(/<button[^>]+data-fd-library-details="([^"]+)"[^>]*>/g)];
    assert.deepEqual(actions.map(m=>m[1]).sort(), refs.slice(0,4).sort());
    for (const action of actions) {
      assert.match(action[0], /aria-haspopup="dialog"/);
      assert.doesNotMatch(action[0], /data-fd-open=/, 'Details must not become a direct-navigation opener');
    }
    for (const ref of refs) {
      const escaped = ref.replaceAll('.', '\\.');
      assert.match(html, new RegExp('class="(?:fd-collink|fd-kit__reading)" data-fd-open="'+escaped+'"'));
    }
  }
});

test('reading Details exposes escaped purpose, honest read time, useful context and one Open action', () => {
  const html = details(fixture(), 'pg_interview.md');
  assert.match(html, /fd-sheet--resource/);
  assert.match(html, />Purpose<\/h3>/);
  assert.match(html, /Prepare &lt;before&gt; the interview\./);
  assert.match(html, />Estimated time<\/h3>/);
  assert.match(html, />5 min read<\/p>/);
  assert.match(html, />Useful when…<\/h3>/);
  assert.match(html, /preparing for an interview/);
  assert.equal((html.match(/data-fd-open="pg_interview.md"/g)||[]).length, 1);
  assert.match(html, /aria-label="Open Interview &amp; MSE">Open<\/button>/);
});

test('a workflow title cannot replace its reading estimate and placement follows the audience path', () => {
  for (const week of [3,4]) {
    const html = details(fixture(week), 'collateral_workflow.md');
    assert.match(html, /I Need Collateral: 10-Minute Workflow/);
    assert.match(html, />4 min read<\/p>/);
    assert.doesNotMatch(html, />10 min read<\/p>/);
    assert.match(html, new RegExp('Week '+week));
  }
});

test('missing tool duration stays self-paced and purpose uses its authored hint', () => {
  const html = details(fixture(), 'mse.html');
  assert.match(html, />Self-paced<\/p>/);
  assert.match(html, /Descriptor bank &amp; written exam builder\./);
  assert.doesNotMatch(html, /\d+ min(?: read)?<\/p>/);
});

test('projected pending status wins over a stale reviewed flag in Details', () => {
  const idx = fixture();
  assert.equal(idx.byRef['case_formulation.md'].attested, true);
  const html = details(idx, 'case_formulation.md');
  assert.match(html, /Pending review · High risk/);
  assert.doesNotMatch(html, /✓ faculty-attested/);
  idx.byRef['case_formulation.md'].governance = {status:'reviewed'};
  assert.match(details(idx, 'case_formulation.md'), /✓ faculty-attested/);
});

test('unestimated readings never invent time, and preview content stays scoped to Library Details', () => {
  const idx = fixture();
  idx.byRef['pg_interview.md'].minutes = null;
  assert.match(details(idx, 'pg_interview.md'), />Not estimated<\/p>/);
  assert.doesNotMatch(F.sheet(idx, {}, {sheet:'item:pg_interview.md'}), /fd-sheet--resource|Useful when/);
  assert.doesNotMatch(details(idx, 'other.md'), /fd-sheet--resource|Useful when/);
});
