// Reference wording transcribed from the exact official PDFs, visually checked 2026-10-02.
// Version URLs, original SHA-256s and comparison are in docs/permissions/phq-gad-review-2026-10-02.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../02_Clinical_Skills/Screeners/screeners.html', import.meta.url), 'utf8');
const script = html.match(/<script>\s*(var e=React[\s\S]*?)<\/script>/)[1];
function harness() {
  let slot = 0;
  const state = [];
  const context = vm.createContext({
    React: {
      createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(x => x != null) }),
      useState: initial => {
        const i = slot++;
        if (!(i in state)) state[i] = initial;
        return [state[i], value => { state[i] = value; }];
      },
    },
    ReactDOM: { createRoot: () => ({ render() {} }) },
    document: { getElementById() {} },
  });
  vm.runInContext(script, context);
  return { context, render(name = 'PHQ-9') {
    slot = 0;
    return context.Scale({ name, lead: name === 'PHQ-9' ? context.PHQ_LEAD : context.GAD_LEAD,
      items: name === 'PHQ-9' ? context.PHQ : context.GAD,
      band: name === 'PHQ-9' ? context.phqBand : context.gadBand, interp: '' });
  } };
}
function nodes(tree) { return typeof tree === 'object' ? [tree, ...tree.children.flatMap(nodes)] : []; }
function text(tree) { return typeof tree === 'object' ? tree.children.map(text).join('') : String(tree); }
function score(tree) { return nodes(tree).find(n => n.props.className === 'score').children[0]; }
function symptomButtons(tree) { return nodes(tree).filter(n => n.type === 'button' && nodes(n).some(c => c.props.className === 'v')); }

const expectedPHQ = [
  'Little interest or pleasure in doing things',
  'Feeling down, depressed, or hopeless',
  'Trouble falling or staying asleep, or sleeping too much',
  'Feeling tired or having little energy',
  'Poor appetite or overeating',
  'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
  'Trouble concentrating on things, such as reading the newspaper or watching television',
  'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual',
  'Thoughts that you would be better off dead or of hurting yourself in some way',
];
const expectedGAD = [
  'Feeling nervous, anxious or on edge',
  'Not being able to stop or control worrying',
  'Worrying too much about different things',
  'Trouble relaxing',
  'Being so restless that it is hard to sit still',
  'Becoming easily annoyed or irritable',
  'Feeling afraid as if something awful might happen',
];
test('all stems, scale-specific prompts, timeframe and response values match selected official forms', () => {
  const { context: c } = harness();
  assert.deepEqual(Array.from(c.PHQ), expectedPHQ);
  assert.deepEqual(Array.from(c.GAD), expectedGAD);
  assert.equal(c.PHQ_LEAD, 'Over the last 2 weeks, how often have you been bothered by any of the following problems?');
  assert.equal(c.GAD_LEAD, 'Over the last 2 weeks, how often have you been bothered by the following problems?');
  assert.deepEqual(JSON.parse(JSON.stringify(c.OPTS)), [['Not at all', 0], ['Several days', 1], ['More than half the days', 2], ['Nearly every day', 3]]);
});
test('PHQ functional difficulty is present with official wording/options and never changes total or completion', () => {
  const h = harness();
  assert.equal(h.context.DIFFICULTY_QUESTION, 'If you checked off any problems, how difficult have these problems made it for you to do your work, take care of things at home, or get along with other people?');
  assert.deepEqual(Array.from(h.context.DIFFICULTY_OPTIONS), ['Not difficult at all', 'Somewhat difficult', 'Very difficult', 'Extremely difficult']);
  let tree = h.render();
  // Re-render each symptom selection to model React state rather than using stale closures.
  for (let i = 0; i < 9; i++) { tree = h.render(); symptomButtons(tree)[i * 4 + 3].props.onClick(); }
  for (const label of h.context.DIFFICULTY_OPTIONS) {
    tree = h.render();
    nodes(tree).find(n => n.type === 'button' && text(n).replace(/^✔ /, '') === label).props.onClick();
    tree = h.render();
    assert.equal(score(tree), 27);
    assert.match(text(tree), /complete/);
    assert.match(text(tree), /not scored/);
  }
  nodes(tree).find(n => n.type === 'button' && text(n) === 'Reset').props.onClick();
  tree = h.render();
  assert.equal(score(tree), 0);
  assert.match(text(tree), /0\/9 answered/);
  assert.ok(nodes(tree).filter(n => n.type === 'button').every(n => !n.props['aria-pressed']));
});
test('difficulty alone is not an answered symptom and GAD has no extra question', () => {
  const h = harness();
  let tree = h.render();
  nodes(tree).find(n => n.type === 'button' && text(n) === 'Extremely difficult').props.onClick();
  tree = h.render();
  assert.equal(score(tree), 0);
  assert.match(text(tree), /0\/9 answered/);
  const gad = harness(); tree = gad.render('GAD-7');
  assert.equal(nodes(tree).filter(n => n.type === 'fieldset').length, 0);
  for (let i = 0; i < 7; i++) { tree = gad.render('GAD-7'); symptomButtons(tree)[i * 4 + 3].props.onClick(); }
  assert.equal(score(gad.render('GAD-7')), 21);
});
test('any positive item 9 triggers assessment even with otherwise zero/unanswered symptoms', () => {
  for (const value of [1, 2, 3]) {
    const h = harness(); let tree = h.render();
    symptomButtons(tree)[8 * 4 + value].props.onClick(); tree = h.render();
    assert.equal(score(tree), value);
    assert.match(text(tree), /Move to a direct safety assessment now/);
    assert.equal(nodes(tree).find(n => n.type === 'a').props.href, 'cssrs.html');
  }
  const h = harness(); let tree = h.render();
  symptomButtons(tree)[8 * 4].props.onClick(); tree = h.render();
  assert.equal(nodes(tree).filter(n => n.props.className === 'flag').length, 0);
});
test('all official severity cutpoints and exact attribution/permission notice remain accurate', () => {
  const c = harness().context;
  const ranges = [[0,4,'Minimal'],[5,9,'Mild'],[10,14,'Moderate'],[15,19,'Moderately severe'],[20,27,'Severe']];
  for (const [lo,hi,label] of ranges) for (let s=lo;s<=hi;s++) assert.equal(c.phqBand(s)[0],label);
  for (let s=0;s<=21;s++) assert.equal(c.gadBand(s)[0],s<5?'Minimal':s<10?'Mild':s<15?'Moderate':'Severe');
  assert.equal(c.FORM_NOTICE, 'Developed by Drs. Robert L. Spitzer, Janet B.W. Williams, Kurt Kroenke and colleagues, with an educational grant from Pfizer Inc. No permission required to reproduce, translate, display or distribute.');
  assert.ok(html.includes('<!-- crisis-block-html -->'));
  assert.ok(html.includes('A low score does not establish safety or readiness.'));
});
