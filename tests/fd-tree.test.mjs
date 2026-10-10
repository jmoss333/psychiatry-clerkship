// Safety decision trees (2026-10-10 safety-drawer spec §4.1-4.4): fd_tree.js renders a tree and
// its escalation script from topic_meta.json's safetyTree and owns no clinical text.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const treeSrc = read('frontdoor/fd_tree.js');
// eslint-disable-next-line no-new-func
const make = new Function(`
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${treeSrc}
  return { fdTreeView: fdTreeView, fdTreeValid: fdTreeValid, fdTreeWalk: fdTreeWalk };
`);
const F = make();
const REAL_META = JSON.parse(readFileSync(new URL('../topic_meta.json', import.meta.url), 'utf8'));
const REAL_TREES = Object.entries(REAL_META).filter(([, v]) => v && v.safetyTree);

const SCRIPT = {
  label: 'Come now', identify: 'This is [your name].', situation: 'S [what you saw].',
  background: 'B.', assessment: 'A.', recommendation: 'R.', readBack: 'RB [their instructions].',
};
const TREE = {
  start: 'q1',
  nodes: [
    { id: 'q1', ask: 'Question one?', hint: 'Hint one.', options: [{ label: 'Yes', next: 'a1' }, { label: 'No', next: 'q2' }] },
    { id: 'q2', ask: 'Question two?', options: [{ label: 'Left', next: 'a1' }, { label: 'Right', next: 'a2' }] },
    { id: 'a1', title: 'Act one', tone: 'danger', act: ['Do one.', 'Do two.'], escalate: 'now', see: ['other.md', 'unknown.md'] },
    { id: 'a2', title: 'Act two', tone: 'first', act: ['Do three.'], escalate: 'soon' },
  ],
  scripts: { now: SCRIPT, soon: { ...SCRIPT, label: 'See today' } },
};
const clone = () => JSON.parse(JSON.stringify(TREE));
const view = (path = [], escalate = null, opts = {}) =>
  F.fdTreeView(TREE, { path, escalate }, { kitTitles: { 'other.md': 'Other' }, ...opts });

test('the start screen is the first question, its answers, and a now escalation', () => {
  const html = view();
  assert.match(html, /<h3 class="fd-tree__heading" tabindex="-1">Question one\?<\/h3>/);
  assert.match(html, /<p class="fd-tree__hint">Hint one\.<\/p>/);
  assert.match(html, /data-fd-tree-answer="q1\.0">Yes<\/button>/);
  assert.match(html, /data-fd-tree-answer="q1\.1">No<\/button>/);
  assert.match(html, /class="fd-tree__escalate" data-fd-escalate="now">Escalate to attending</);
  assert.doesNotMatch(html, /fd-tree__trail|data-fd-tree-back|data-fd-tree-restart|fd-tree__draft/);
});

test('an answer moves to the next question with a trail and back/restart', () => {
  const html = view(['q1.1']);
  assert.match(html, /tabindex="-1">Question two\?<\/h3>/);
  assert.match(html, /<ol class="fd-tree__trail" aria-label="Your answers"><li>Question one\? — <b>No<\/b><\/li><\/ol>/);
  assert.match(html, /data-fd-tree-back>‹ Back<\/button>/);
  assert.match(html, /data-fd-tree-restart>Start over<\/button>/);
});

test('a first-move action escalates to its own soon script', () => {
  const html = view(['q1.1', 'q2.1']);
  assert.match(html, /<div class="fd-tree__verdict"><span class="fd-tree__tone">First move<\/span><h3 class="fd-tree__heading" tabindex="-1">Act two<\/h3><\/div>/);
  assert.match(html, /<ol class="fd-tree__acts"><li>Do three\.<\/li><\/ol>/);
  assert.match(html, /data-fd-escalate="soon">Escalate to attending/);
});

test('a danger action is marked in words as well as colour, and links only known protocols', () => {
  const html = view(['q1.0']);
  assert.match(html, /class="fd-tree__verdict is-danger"><span class="fd-tree__tone">Act now<\/span>/);
  assert.match(html, /data-fd-safety="other\.md">Open the Other protocol →<\/button>/);
  assert.doesNotMatch(html, /unknown\.md/);
});

test('a path that does not replay renders the start', () => {
  for (const path of [['nope.0'], ['q1.7'], ['q2.0'], ['q1.0', 'a1.0'], ['q1.x']]) {
    const html = view(path);
    assert.match(html, /tabindex="-1">Question one\?<\/h3>/, JSON.stringify(path));
    assert.doesNotMatch(html, /fd-tree__trail/, JSON.stringify(path));
  }
});

test('the now script lists the six ISBAR parts in order with blanks marked', () => {
  const html = view(['q1.1'], 'now');
  assert.match(html, /<h3 class="fd-tree__heading" id="fdScriptHeading" tabindex="-1">Say this to your attending<\/h3>/);
  const dts = [...html.matchAll(/<dt>([^<]+)<\/dt>/g)].map((m) => m[1]);
  assert.deepEqual(dts, ['Identify', 'Situation', 'Background', 'Assessment', 'Recommendation', 'Read back']);
  assert.match(html, /<mark class="fd-script__blank">\[your name\]<\/mark>/);
  assert.match(html, /data-fd-escalate-close>‹ Back to where you were<\/button>/);
  assert.doesNotMatch(html, /Escalate to attending|Need them sooner/);
});

test('a soon script offers the now script and nothing offers the reverse', () => {
  assert.match(view([], 'soon'), /data-fd-escalate="now">Need them sooner\? Use the come-now script</);
  assert.doesNotMatch(view([], 'now'), /data-fd-escalate="soon"/);
});

test('asking for a soon script on a tree without one shows the now script', () => {
  const t = clone();
  delete t.scripts.soon;
  const html = F.fdTreeView(t, { path: [], escalate: 'soon' }, {});
  assert.match(html, /<p class="fd-script__label">Come now<\/p>/);
  assert.doesNotMatch(html, /Need them sooner/);
});

test('the draft banner appears only when asked for', () => {
  assert.match(view([], null, { draft: true }), /<p class="fd-tree__draft" role="note">DRAFT — not faculty-reviewed\. Learners do not see this tree\.<\/p>/);
  assert.doesNotMatch(view([], null, { draft: false }), /fd-tree__draft/);
});

test('every tree string is escaped, blanks included', () => {
  const t = clone();
  t.nodes[0].ask = '<img src=x onerror=alert(1)>';
  t.scripts.now.situation = 'Say [<b>x</b>] now';
  assert.doesNotMatch(F.fdTreeView(t, { path: [] }, {}), /<img/);
  assert.match(F.fdTreeView(t, { path: [], escalate: 'now' }, {}),
    /<mark class="fd-script__blank">\[&lt;b&gt;x&lt;\/b&gt;\]<\/mark>/);
});

test('fdTreeValid accepts the fixture and fails closed on each broken rule', () => {
  assert.equal(F.fdTreeValid(TREE), true);
  const breaks = {
    'no now script': (t) => { delete t.scripts.now; },
    'start names no node': (t) => { t.start = 'zz'; },
    'duplicate id': (t) => { t.nodes[3].id = 'a1'; },
    'option points nowhere': (t) => { t.nodes[0].options[0].next = 'zz'; },
    'one option': (t) => { t.nodes[0].options.length = 1; },
    'five options': (t) => { t.nodes[0].options = Array(5).fill({ label: 'x', next: 'a1' }); },
    'bad tone': (t) => { t.nodes[2].tone = 'amber'; },
    'no acts': (t) => { t.nodes[2].act = []; },
    'soon without a soon script': (t) => { delete t.scripts.soon; },
    'cycle': (t) => { t.nodes[1].options[0].next = 'q1'; },
    'script missing a part': (t) => { delete t.scripts.now.readBack; },
    'not an object': () => null,
  };
  for (const [name, mutate] of Object.entries(breaks)) {
    const t = clone();
    const result = mutate(t);
    assert.equal(F.fdTreeValid(result === null ? null : t), false, name);
  }
  const deep = clone();
  deep.nodes = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, ask: `Q${i}?`,
    options: [{ label: 'Go', next: i === 5 ? 'a2' : `c${i + 1}` }, { label: 'Stop', next: 'a2' }] }))
    .concat(TREE.nodes.slice(3));
  deep.start = 'c0';
  assert.equal(F.fdTreeValid(deep), false, 'six questions on one path');
});

test('every real safetyTree passes the runtime check', () => {
  assert.ok(REAL_TREES.length >= 1, 'at least one real tree exists');
  for (const [ref, meta] of REAL_TREES) assert.equal(F.fdTreeValid(meta.safetyTree), true, ref);
});

test('no real tree string is copied into fd_tree.js', () => {
  for (const [ref, meta] of REAL_TREES) {
    const strings = [];
    for (const n of meta.safetyTree.nodes) {
      strings.push(n.ask, n.hint, n.title, ...(n.act || []), ...((n.options || []).map((o) => o.label)));
    }
    for (const s of Object.values(meta.safetyTree.scripts)) strings.push(...Object.values(s));
    for (const s of strings.filter((x) => typeof x === 'string' && x.length >= 16)) {
      assert.ok(!treeSrc.includes(s), `${ref}: "${s}" must live in topic_meta.json only`);
    }
  }
});

test('fd_tree.js is pure ES5 and names no clinical or audience token', () => {
  assert.doesNotMatch(treeSrc, /localStorage\.|document\.|window\.|Date\.now\(\)/);
  assert.doesNotMatch(treeSrc, /\bconst\s|\blet\s|=>|`/);
  const NEEDLES = ['CIWA', 'COWS', 'C-SSRS', 'thiamine', 'buprenorphine', 'fingerstick',
    'benzodiazepine', 'anticholinergic', 'de-escalation', 'lethal means', 'CAM screen',
    'hypoglycemia', 'ideation', 'akathisia'];
  for (const n of NEEDLES) assert.ok(!treeSrc.toLowerCase().includes(n.toLowerCase()), n);
  assert.doesNotMatch(treeSrc, /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i);
});
