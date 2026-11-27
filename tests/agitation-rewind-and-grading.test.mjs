// Simulator red-team AG-2..AG-6 (2026-11-25). The Agitation Ladder let a learner erase a miss
// inside one attempt (Back and re-pick rewrote the trace; a wrong etiology revealed the answer,
// then a switch read "matched"), passed monitoring on any single item, never asked for staff
// safety or help, hard-coded the non-pharm row green, and let "Call your senior" at every step
// read as an all-green run. Faculty ruling (Josh, 2026-11-25): Restart / a new scenario is a new
// attempt and may start clean; an in-attempt rewind or re-pick may not erase a miss.
//
// The tool is a React app with no build step, so this drives the real App code through a
// minimal stand-in for React (createElement / useState / useEffect) and clicks its buttons.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const PACK = JSON.parse(read('_prototypes/agitation-trainer/rp-agitation.pack.json'));

function appScript(html) {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script[^>]*>/gi)].map((m) => m[1]);
  const s = blocks.find((b) => b.includes('function App()'));
  assert.ok(s, 'found the App script');
  return s;
}

// ---- a minimal React stand-in --------------------------------------------------------------
function harness(html) {
  let hooks = [], idx = 0, App = null, tree = null, mounted = false;
  const effects = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useState(init) {
      const i = idx++;
      if (!(i in hooks)) hooks[i] = typeof init === 'function' ? init() : init;
      return [hooks[i], (v) => { hooks[i] = typeof v === 'function' ? v(hooks[i]) : v; }];
    },
    useEffect(fn, deps) { if (!mounted || !deps) effects.push(fn); },
  };
  const ReactDOM = { createRoot: () => ({ render: (el) => { App = el.type; } }) };
  const store = new Map();
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const node = () => ({ textContent: '', onclick: null, setAttribute() {}, getAttribute() { return 'light'; } });
  const document = { getElementById: () => node(), documentElement: node(), addEventListener() {}, removeEventListener() {} };
  const fetch = (url) => (String(url).endsWith('.pack.json')
    ? Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(JSON.stringify(PACK))) })
    : Promise.reject(new Error('offline')));
  // eslint-disable-next-line no-new-func
  new Function('React', 'ReactDOM', 'localStorage', 'document', 'fetch', 'window', 'location', appScript(html))(
    React, ReactDOM, localStorage, document, fetch, { prompt: () => null, location: {} }, { hostname: 'test' });
  function render() {
    idx = 0; effects.length = 0; tree = App(); const run = effects.slice(); mounted = true; run.forEach((f) => f());
    return tree;
  }
  return { render, get tree() { return tree; } };
}
const text = (n) => (n == null || n === false ? '' : typeof n !== 'object' ? String(n) : (n.children || []).map(text).join(''));
function all(n, pred, out = []) { if (n && typeof n === 'object') { if (pred(n)) out.push(n); (n.children || []).forEach((c) => all(c, pred, out)); } return out; }
async function boot(html) {
  const h = harness(html); h.render(); await new Promise((r) => setTimeout(r, 0)); h.render(); return h;
}
function click(h, label) {
  const btns = all(h.tree, (n) => n.type === 'button' && typeof n.props.onClick === 'function' && text(n).includes(label));
  assert.ok(btns.length, `a button reading "${label}" (screen: ${text(h.tree).slice(0, 160)}…)`);
  btns[0].props.onClick(); h.render();
}
const optLabel = (bank, id) => PACK.choiceBanks[bank].find((o) => o.id === id).label;
function traceRows(h) {
  return all(h.tree, (n) => n.props && n.props.className === 'node').map((n) => ({
    k: text(all(n, (x) => x.props && x.props.className === 'steplabel')[0]),
    v: (all(n, (x) => typeof x.props.className === 'string' && x.props.className.startsWith('marker'))[0].props.className.split(' ').pop()),
    body: text(n),
  }));
}
async function startScenario(html, scenarioId) {
  const h = await boot(html);
  const scn = PACK.content.scenarios.find((s) => s.id === scenarioId);
  click(h, scn.stem.slice(0, 92));
  return h;
}

for (const file of ['_prototypes/agitation-trainer/rp-agitation.html', '_prototypes/agitation-trainer/rp-agitation.preview.html']) {
  const HTML = read(file);

  test(`${file}: AG-2 a wrong etiology is not revealed until locked, and a later switch cannot read "matched"`, async () => {
    const h = await startScenario(HTML, 'agit-delirium');
    click(h, optLabel('etiology', 'primary_psych'));
    assert.doesNotMatch(text(h.tree), /Key features pointing|Worth re-weighing/, 'no reveal before the answer is locked');
    click(h, 'Lock in answer');
    assert.match(text(h.tree), /Worth re-weighing the discriminators/, 'feedback after locking');
    click(h, optLabel('etiology', 'delirium'));
    assert.match(text(h.tree), /committed answer for this step is kept/);
    click(h, 'Next');
    // step 2: de-escalation and a safe space; step 3: the benzodiazepine hazard, then a switch
    click(h, optLabel('nonpharm', 'deesc')); click(h, optLabel('nonpharm', 'space_safety')); click(h, 'Next');
    click(h, optLabel('pharmApproach', 'benzo')); click(h, 'Lock in answer');
    assert.match(text(h.tree), /Hazard/);
    click(h, 'Back'); click(h, 'Next'); // a rewind through Back does not reopen the step
    click(h, optLabel('pharmApproach', 'treat_cause')); click(h, 'Next');
    click(h, optLabel('monitoring', 'serial_vitals')); click(h, optLabel('monitoring', 'reassess'));
    click(h, 'See decision trace');
    const rows = traceRows(h);
    const et = rows.find((r) => r.k.startsWith('Etiology'));
    assert.equal(et.v, 'caution', 'the first (wrong) etiology is graded');
    assert.match(et.body, /Completed after a miss/);
    const ph = rows.find((r) => r.k.startsWith('Pharmacologic'));
    assert.equal(ph.v, 'hazard', 'the hazard stays on the trace after a switch');
    assert.match(ph.body, /Completed after a miss/);
  });

  test(`${file}: AG-2 a new attempt (back to start, same scenario) starts clean`, async () => {
    const h = await startScenario(HTML, 'agit-psychosis');
    click(h, optLabel('etiology', 'delirium')); click(h, 'Lock in answer'); click(h, 'Next');
    click(h, optLabel('nonpharm', 'deesc')); click(h, optLabel('nonpharm', 'space_safety')); click(h, 'Next');
    click(h, optLabel('pharmApproach', 'sga')); click(h, 'Lock in answer'); click(h, 'Next');
    click(h, optLabel('monitoring', 'serial_vitals')); click(h, optLabel('monitoring', 'reassess')); click(h, optLabel('monitoring', 'eps'));
    click(h, 'See decision trace');
    assert.equal(traceRows(h).find((r) => r.k.startsWith('Etiology')).v, 'caution');
    click(h, 'Back to start'); // a new scenario from the start page is a new attempt
    click(h, PACK.content.scenarios.find((x) => x.id === 'agit-psychosis').stem.slice(0, 92));
    click(h, optLabel('etiology', 'primary_psych'));
    assert.doesNotMatch(text(h.tree), /committed answer/, 'the new attempt carries no earlier lock');
    click(h, 'Lock in answer');
    assert.match(text(h.tree), /Consistent with the discriminating features/);
  });

  test(`${file}: AG-3 an antipsychotic + benzodiazepine needs airway, SpO2 and vitals, not EPS alone`, async () => {
    const h = await startScenario(HTML, 'agit-psychosis');
    click(h, optLabel('etiology', 'primary_psych')); click(h, 'Lock in answer'); click(h, 'Next');
    click(h, optLabel('nonpharm', 'deesc')); click(h, optLabel('nonpharm', 'space_safety')); click(h, 'Next');
    click(h, optLabel('pharmApproach', 'combo')); click(h, 'Lock in answer'); click(h, 'Next');
    click(h, optLabel('monitoring', 'eps'));
    click(h, 'See decision trace');
    const mon = traceRows(h).find((r) => r.k.startsWith('Monitoring'));
    assert.equal(mon.v, 'caution', 'EPS-only after a combination is not a pass');
    for (const id of ['airway', 'pulse_ox', 'serial_vitals', 'reassess']) assert.ok(mon.body.includes(optLabel('monitoring', id)), `names ${id}`);
  });

  test(`${file}: AG-4 the non-pharm row is graded; staff safety and calling for help are expected`, async () => {
    const h = await startScenario(HTML, 'agit-stimulant');
    click(h, optLabel('etiology', 'stimulant_intox')); click(h, 'Lock in answer'); click(h, 'Next');
    click(h, optLabel('nonpharm', 'deesc')); click(h, 'Next');
    click(h, optLabel('pharmApproach', 'benzo')); click(h, 'Lock in answer'); click(h, 'Next');
    for (const id of ['airway', 'pulse_ox', 'serial_vitals', 'reassess']) click(h, optLabel('monitoring', id));
    click(h, 'See decision trace');
    const np = traceRows(h).find((r) => r.k.startsWith('Non-pharm'));
    assert.equal(np.v, 'caution', 'de-escalation alone is not a green row');
    assert.match(np.body, /exit/i);
    assert.match(np.body, /call for help/i, 'threat cues require activating help');
  });

  test(`${file}: AG-6 "Call your senior" marks the step deferred, not green`, async () => {
    const h = await startScenario(HTML, 'agit-withdrawal');
    click(h, 'Call your senior'); click(h, 'Lock in answer'); click(h, 'Next');
    click(h, optLabel('nonpharm', 'deesc')); click(h, optLabel('nonpharm', 'space_safety')); click(h, 'Next');
    click(h, 'Call your senior'); click(h, 'Lock in answer'); click(h, 'Next');
    click(h, optLabel('monitoring', 'reassess'));
    click(h, 'See decision trace');
    const rows = traceRows(h);
    for (const k of ['Etiology', 'Pharmacologic']) {
      const r = rows.find((x) => x.k.startsWith(k));
      assert.equal(r.v, 'neutral', `${k} is not graded good`);
      assert.match(r.k, /deferred/);
    }
    assert.match(text(h.tree), /2 steps deferred to your senior/);
  });
}

test('AG-5: the hazard map names the missing cautions in both packs', () => {
  for (const p of ['_prototypes/agitation-trainer/rp-agitation.pack.json', '_prototypes/agitation-trainer/agitation.pack.json']) {
    const b = JSON.parse(read(p)).choiceBanks.pharmApproach;
    const get = (id) => b.find((x) => x.id === id);
    assert.match(get('d2_typical').cautionIf.qtc_risk, /QTc/);
    for (const id of ['sga', 'd2_typical', 'combo']) assert.match(get(id).cautionIf.stimulant_intox, /first-line/, `${id} in stimulant intoxication`);
    for (const id of ['sga', 'd2_typical', 'benzo', 'combo']) assert.match(get(id).cautionIf.undetermined, /not yet known/, `${id} with no driver yet`);
    assert.match(get('im_if_danger').cautionIf.parkinson_dlb, /Parkinson/);
    assert.match(get('im_if_danger').cautionIf.catatonia, /catatonia/);
  }
});
