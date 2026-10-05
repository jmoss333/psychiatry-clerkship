// The pharmacy page's search, scenario entry points, before-rounds strip, tiers, family flip and
// compare grid, executed AS SHIPPED (the model block sliced from the real page, the
// pharmacy-page.test.mjs pattern).
//
// Search golden set (spec AC9): ≥40 bedside queries — brand→generic, class, need words
// ("QTc", "needs level"), adverse effects, misspellings — each returning an expected drug in
// the top 3. The fixture is every record of pharmacy.json with a synthetic review stamp, so the
// ranking is checked over the whole formulary and never depends on which drugs are reviewed
// today (a test may not read live governance state). A reviewed record's search fields are
// J/L/R content; if a reword breaks a query here, re-tune the search or the query, not the stamp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const RX = read('13_Faculty_Resources/_automation/site_build/rx_retrieval.js');
const PAGE = read('05_Psychopharmacology/Pharmacy/pharmacy.html');

function slice(src, a, b) {
  const i = src.indexOf(a); const j = src.indexOf(b, i);
  assert.ok(i !== -1 && j !== -1, `could not locate ${a} .. ${b}`);
  return src.slice(i, j);
}
const model = slice(PAGE, '/* ---- pharmacy page model ----', '/* ---- end pharmacy page model ---- */');
const P = new Function(`${RX}\n${model}\nreturn { rxReviewStamped, rxFilterAgents, rxScore, rxExpand,
  rxScenario, rxScenarioAgents, RX_SCENARIOS, rxBeforeRounds, rxSections, rxTierSections, rxFamilyFlip,
  rxCompareRows, rxEditDistance, rxWordMatch, rxFlagTerms };`)();

const SRC = JSON.parse(read('pharmacy.json'));
const STAMP = { reviewer: 'Test Reviewer', lastReviewed: '2026-01-01' };
const stamped = (r) => ({ ...JSON.parse(JSON.stringify(r)), review: { ...STAMP } });
const FEED = { agents: SRC.records.map(stamped), cards: [], pendingCount: 0 };
const byId = (id) => FEED.agents.find((a) => a.id === id);
const DOSE_RE = /\b\d+(?:\.\d+)?\s?(?:mg|mcg|mL|mg\/kg)\b/;

// [query, acceptable ids] — the query passes when any acceptable id is in the top 3.
const GOLDEN = [
  // brand → generic
  ['seroquel', ['quetiapine']], ['zyprexa', ['olanzapine']], ['zoloft', ['sertraline']],
  ['prozac', ['fluoxetine']], ['lexapro', ['escitalopram']], ['wellbutrin', ['bupropion']],
  ['remeron', ['mirtazapine']], ['ativan', ['lorazepam']], ['klonopin', ['clonazepam']],
  ['depakote', ['valproate']], ['tegretol', ['carbamazepine']], ['lamictal', ['lamotrigine']],
  ['suboxone', ['buprenorphine']], ['chantix', ['varenicline']],
  ['abilify', ['aripiprazole']], ['risperdal', ['risperidone']], ['invega', ['paliperidone']],
  ['latuda', ['lurasidone']], ['vraylar', ['cariprazine']], ['clozaril', ['clozapine']],
  ['effexor', ['venlafaxine']], ['cymbalta', ['duloxetine']], ['nardil', ['phenelzine']],
  ['Invega Sustenna', ['paliperidone']],
  // misspellings
  ['seroquil', ['quetiapine']], ['lithum', ['lithium']], ['halperidol', ['haloperidol']],
  ['olanzipine', ['olanzapine']], ['sertaline', ['sertraline']], ['clozapin', ['clozapine']],
  ['buprenorphin', ['buprenorphine']], ['quetiapin', ['quetiapine']],
  // class and shorthand
  ['ssri', ['sertraline', 'fluoxetine', 'escitalopram', 'citalopram', 'paroxetine']],
  ['snri', ['venlafaxine', 'duloxetine']], ['maoi', ['phenelzine']],
  ['benzodiazepine', ['lorazepam', 'clonazepam', 'diazepam', 'chlordiazepoxide']],
  ['benzo', ['lorazepam', 'clonazepam', 'diazepam', 'chlordiazepoxide']],
  ['tricyclic', ['nortriptyline']], ['stimulant', ['methylphenidate']],
  // need words from the flags
  ['qtc', ['haloperidol', 'ziprasidone', 'citalopram', 'methadone']],
  ['QT prolongation', ['haloperidol', 'ziprasidone', 'citalopram', 'methadone']],
  ['needs level', ['lithium', 'valproate', 'carbamazepine', 'clozapine']],
  ['needs a level', ['lithium', 'valproate', 'carbamazepine', 'clozapine']],
  ['weight gain', ['olanzapine', 'clozapine', 'quetiapine', 'mirtazapine']],
  ['rems', ['clozapine']],
  // dangerous adverse effects and traps
  ['neutropenia', ['clozapine']], ['agranulocytosis', ['clozapine', 'carbamazepine']],
  ['myocarditis', ['clozapine']], ['lithium toxicity', ['lithium']], ['nsaids', ['lithium', 'sertraline']],
  ['serotonin syndrome', ['sertraline', 'fluoxetine', 'phenelzine', 'escitalopram', 'citalopram', 'venlafaxine', 'duloxetine']],
  ['nms', ['haloperidol', 'olanzapine', 'risperidone', 'aripiprazole', 'quetiapine', 'chlorpromazine', 'fluphenazine', 'cariprazine']],
  ['hyponatremia', ['sertraline', 'escitalopram', 'citalopram', 'fluoxetine', 'carbamazepine']],
  ['stevens johnson', ['lamotrigine', 'carbamazepine']], ['hyperammonemia', ['valproate']],
  ['hypertensive crisis', ['phenelzine']], ['precipitated withdrawal', ['buprenorphine']],
  ['priapism', ['trazodone']], ['anticholinergic', ['benztropine', 'diphenhydramine', 'chlorpromazine', 'nortriptyline']],
  // indications and moments
  ['agitation', ['haloperidol', 'lorazepam', 'olanzapine', 'ziprasidone', 'chlorpromazine']],
  ['alcohol withdrawal', ['chlordiazepoxide', 'lorazepam', 'diazepam']],
  ['opioid use disorder', ['buprenorphine', 'methadone', 'naltrexone']],
  ['nightmares', ['prazosin']], ['ocd', ['fluoxetine', 'sertraline', 'paroxetine', 'escitalopram']],
  ['adhd', ['methylphenidate']], ['smoking', ['varenicline', 'nicotine-replacement', 'bupropion']],
  ['mania', ['lithium', 'valproate', 'olanzapine', 'aripiprazole', 'quetiapine', 'carbamazepine', 'risperidone']],
  ['bipolar depression', ['quetiapine', 'lurasidone', 'lamotrigine', 'cariprazine', 'lithium']],
  ['treatment resistant', ['clozapine']], ['long acting injectable', ['paliperidone', 'haloperidol', 'risperidone', 'aripiprazole', 'fluphenazine']],
];

test('AC9: the golden set returns an expected drug in the top 3 for every query', () => {
  assert.ok(GOLDEN.length >= 40, `golden set has ${GOLDEN.length} queries`);
  const misses = [];
  for (const [q, want] of GOLDEN) {
    for (const id of want) assert.ok(byId(id), `${id} is in pharmacy.json`);
    const top = P.rxFilterAgents(FEED, q, '').slice(0, 3).map((a) => a.id);
    if (!want.some((id) => top.includes(id))) misses.push(`${JSON.stringify(q)} → [${top.join(', ')}] (wanted one of ${want.join('/')})`);
  }
  assert.deepEqual(misses, []);
});

// #944 deliberately limits this card to oral naltrexone; the injectable brand is not an alias.
test('oral naltrexone is found by generic name, not the injectable Vivitrol brand', () => {
  assert.ok(P.rxFilterAgents(FEED, 'naltrexone', '').slice(0, 3).some(a => a.id === 'naltrexone'));
  for (const query of ['vivitrol', 'Vivitrol']) {
    assert.ok(!P.rxFilterAgents(FEED, query, '').some(a => a.id === 'naltrexone'),
      `${query} must not return the oral-only naltrexone card`);
  }
});

test('search is case- and diacritic-insensitive, AND across words, and empty for nonsense', () => {
  assert.equal(P.rxFilterAgents(FEED, 'LITHIUM', '')[0].id, 'lithium');
  assert.equal(P.rxFilterAgents(FEED, 'Lithium', '')[0].id, 'lithium');
  assert.equal(P.rxFilterAgents(FEED, 'zzzz-no-such-drug', '').length, 0);
  assert.equal(P.rxFilterAgents(FEED, 'lithium zzzz', '').length, 0, 'every word must match');
  const boxed = P.rxFilterAgents(FEED, 'black box', '');
  assert.ok(boxed.length >= 10);
  assert.ok(boxed.slice(0, 10).every((a) => a.boxedWarning && a.boxedWarning.present), 'a need word ranks the drugs whose flag is set first');
  assert.deepEqual(P.rxFilterAgents(FEED, 'rems', '').map((a) => a.id), ['clozapine']);
  assert.ok(P.rxFilterAgents(FEED, '', 'sud').every((a) => a.group === 'sud'));
  assert.ok(P.rxFilterAgents(FEED, 'lithium', 'antipsychotic').every((a) => a.group === 'antipsychotic'), 'the group filter still applies to a search');
  assert.equal(P.rxFilterAgents(FEED, 'seroquel', 'sud').length, 0);
  const all = P.rxFilterAgents(FEED, '', '').map((a) => a.generic);
  assert.deepEqual(all, [...all].sort((x, y) => x.localeCompare(y)), 'no query lists A to Z');
});

test('a name match outranks a mention; an exact word outranks a misspelling', () => {
  assert.equal(P.rxFilterAgents(FEED, 'clozapine', '')[0].id, 'clozapine', 'drugs whose traps mention clozapine rank below it');
  assert.ok(P.rxScore(byId('quetiapine'), 'seroquel') > P.rxScore(byId('quetiapine'), 'seroquil'));
  assert.equal(P.rxEditDistance('seroquil', 'seroquel', 2), 1);
  assert.equal(P.rxEditDistance('lithum', 'lithium', 2), 1);
  assert.equal(P.rxEditDistance('abc', 'xyz', 1), 2, 'capped');
  assert.equal(P.rxWordMatch('ab', 'about'), 0, 'two letters never prefix-match');
  assert.equal(P.rxWordMatch('qtc', 'qtc prolongation torsades'), 1);
});

test('shorthand expands to the words the fields use, and never to a clinical claim', () => {
  assert.deepEqual(P.rxExpand('nms'), ['nms', 'neuroleptic malignant']);
  assert.ok(P.rxExpand('eps').includes('akathisia'));
  assert.equal(P.rxExpand('long acting injectable')[0], 'lai');
  assert.deepEqual(P.rxExpand(''), ['']);
  assert.doesNotMatch(slice(PAGE, 'var RX_SYNONYMS=', 'function rxExpand'), DOSE_RE);
});

test('need words come only from a drug\'s own flags', () => {
  const terms = (flags, extra) => P.rxFlagTerms({ flags, ...extra }).map((f) => f.t).join(' ');
  assert.equal(terms({ qtcRisk: 'Minimal', weightImpact: 'Neutral', bloodMonitoring: 'No', ekgRequired: 'No' }), '');
  assert.match(terms({ qtcRisk: 'High' }), /qtc/);
  assert.doesNotMatch(terms({ qtcRisk: 'Low' }), /qtc/);
  assert.match(terms({ bloodMonitoring: 'Yes' }), /needs level/);
  assert.match(terms({ weightImpact: 'Significant gain' }), /weight gain/);
  assert.match(terms({}, { boxedWarning: { present: true } }), /boxed warning/);
  assert.equal(terms({}, { boxedWarning: { present: false } }), '');
  const high = P.rxFlagTerms({ flags: { qtcRisk: 'High' } })[0].g;
  const mod = P.rxFlagTerms({ flags: { qtcRisk: 'Moderate' } })[0].g;
  assert.ok(high > mod, 'a higher flag ranks higher');
});

test('an unstamped drug never ranks, in a search, a scenario, a strip, a flip or a grid', () => {
  const ghost = { ...JSON.parse(JSON.stringify(byId('lithium'))), id: 'ghost', generic: 'ghostium' };
  delete ghost.review;
  const feed = { agents: FEED.agents.concat([ghost]), cards: [] };
  assert.ok(!P.rxFilterAgents(feed, 'ghostium', '').length);
  assert.ok(!P.rxFilterAgents(feed, '', '').some((a) => a.id === 'ghost'));
  for (const sc of P.RX_SCENARIOS) assert.ok(!P.rxScenarioAgents(feed, sc, '').some((a) => a.id === 'ghost'), sc.id);
  assert.equal(P.rxBeforeRounds(ghost), null);
  assert.equal(P.rxFamilyFlip(ghost), null);
  assert.deepEqual(P.rxTierSections(ghost, 't2'), []);
  assert.deepEqual(P.rxCompareRows([ghost, byId('lithium'), byId('clozapine')]).agents.map((a) => a.id), ['lithium', 'clozapine']);
});

test('scenario entry points: a union without duplicates, and links only to built library pages', () => {
  const tools = JSON.parse(read('13_Faculty_Resources/_automation/site_build/site_manifest.json'));
  const toolSlugs = new Set(tools.tools.map((t) => t[1]));
  const mdSlugs = new Set(tools.md.map((t) => t[1]));
  assert.ok(P.RX_SCENARIOS.length >= 5);
  for (const sc of P.RX_SCENARIOS) {
    assert.ok(sc.id && sc.label && sc.queries.length, sc.id);
    assert.equal(P.rxScenario(sc.id), sc);
    const ids = P.rxScenarioAgents(FEED, sc, '').map((a) => a.id);
    assert.ok(ids.length > 0, `${sc.id} finds a drug across the formulary`);
    assert.equal(new Set(ids).size, ids.length, `${sc.id} has no duplicates`);
    assert.ok(P.rxScenarioAgents(FEED, sc, 'antipsychotic').every((a) => a.group === 'antipsychotic'));
    for (const l of sc.links) {
      const md = /^\.\.\/index\.html\?page=([\w.-]+\.md)$/.exec(l.href);
      if (md) assert.ok(mdSlugs.has(md[1]), `${sc.id} → ${l.href} is a built content slug`);
      else assert.ok(toolSlugs.has(l.href) && !l.href.includes('/'), `${sc.id} → ${l.href} is a sibling tool slug`);
    }
  }
  assert.equal(P.rxScenario('no-such-scenario'), null);
  assert.deepEqual(P.rxScenarioAgents(FEED, null, ''), []);
  assert.ok(P.rxScenarioAgents(FEED, P.rxScenario('clozapine'), '')[0].id === 'clozapine');
  assert.ok(P.rxScenarioAgents(FEED, P.rxScenario('withdrawal'), '').some((a) => a.id === 'chlordiazepoxide'));
  assert.ok(P.rxScenarioAgents(FEED, P.rxScenario('level'), '').some((a) => a.id === 'lithium'));
  assert.ok(P.rxScenarioAgents(FEED, P.rxScenario('qtc'), '').some((a) => a.id === 'haloperidol'));
});

test('the before-rounds strip is the first item of three reviewed lists, verbatim', () => {
  const li = byId('lithium');
  const s = P.rxBeforeRounds(li);
  assert.equal(s.check, li.monitoring.baseline[0]);
  assert.equal(s.danger.name, li.adverseEffects.dangerous[0].name);
  assert.equal(s.danger.firstMove, li.adverseEffects.dangerous[0].firstMove);
  assert.equal(s.ask, li.attendingAsks[0]);
  for (const a of FEED.agents) {
    const x = P.rxBeforeRounds(a);
    assert.ok(x && x.check && x.danger.name && x.ask, `${a.id} has a full strip`);
  }
  const bare = { ...stamped(li), monitoring: { baseline: [], ongoing: ['Ongoing item'] }, adverseEffects: {}, attendingAsks: [] };
  assert.deepEqual(P.rxBeforeRounds(bare), { check: 'Ongoing item', danger: { name: '', firstMove: '', recognize: '' }, ask: '' });
  assert.equal(P.rxBeforeRounds({ ...stamped(li), monitoring: {}, adverseEffects: {}, attendingAsks: [] }), null);
});

test('tiers: the student view is a subset of the resident view, which is every section', () => {
  for (const a of FEED.agents) {
    const all = P.rxSections(a);
    const t1 = P.rxTierSections(a, 't1'); const t2 = P.rxTierSections(a, 't2');
    assert.deepEqual(t2, all);
    assert.ok(t1.length < t2.length, `${a.id} has resident-only sections`);
    assert.ok(t1.every((s) => s.tier === 't1'));
    const keys = t1.map((s) => s.key);
    for (const k of ['before', 'dangerous', 'asks']) assert.ok(keys.includes(k), `${a.id} student view keeps ${k}`);
    for (const k of ['mechanism', 'resident', 'facts']) assert.ok(!keys.includes(k), `${a.id} student view hides ${k}`);
    assert.ok(all.every((s) => s.items.length > 0));
  }
});

test('the family flip is the reviewed family text and its handout reference, nothing more', () => {
  const li = byId('lithium');
  const f = P.rxFamilyFlip(li);
  assert.equal(f.text, li.familyExplainer.text);
  assert.equal(f.handoutRef, li.familyExplainer.handoutRef || '');
  assert.equal(P.rxFamilyFlip({ ...stamped(li), familyExplainer: {} }), null);
  assert.equal(P.rxFamilyFlip({ ...stamped(li), familyExplainer: { text: 42 } }), null);
});

test('the compare grid: 2 to 4 stamped drugs, every cell a reviewed field or a dash, no doses', () => {
  const ids = ['haloperidol', 'olanzapine', 'clozapine', 'lithium', 'sertraline'];
  const agents = ids.map(byId);
  assert.deepEqual(P.rxCompareRows([agents[0]]).rows, []);
  assert.deepEqual(P.rxCompareRows([]).rows, []);
  const four = P.rxCompareRows(agents);
  assert.deepEqual(four.agents.map((a) => a.id), ids.slice(0, 4), 'a fifth drug is dropped');
  assert.ok(four.rows.length >= 10);
  for (const row of four.rows) assert.equal(row.values.length, 4, row.label);
  const grid = P.rxCompareRows([byId('haloperidol'), byId('olanzapine')]);
  const row = (label) => grid.rows.find((r) => r.label === label).values;
  assert.deepEqual(row('QTc risk'), [byId('haloperidol').flags.qtcRisk, byId('olanzapine').flags.qtcRisk]);
  assert.deepEqual(row('Weight'), [byId('haloperidol').flags.weightImpact, byId('olanzapine').flags.weightImpact]);
  assert.deepEqual(row('Dangerous adverse effects')[0], byId('haloperidol').adverseEffects.dangerous.map((d) => d.name));
  assert.deepEqual(row('Before the first dose')[1], byId('olanzapine').monitoring.baseline);
  assert.deepEqual(row('Boxed warning'), ['Yes', 'Yes']);
  const sparse = P.rxCompareRows([{ ...stamped(byId('lithium')), flags: {}, pk: {}, interactions: {}, adverseEffects: {}, monitoring: {} }, byId('sertraline')]);
  for (const r of sparse.rows) {
    const v = r.values[0];
    assert.ok(v === '—' || v === 'Yes' || v === 'No' || (Array.isArray(v) && v[0] === '—'), `${r.label} reads a dash when empty`);
  }
  assert.doesNotMatch(JSON.stringify(P.rxCompareRows(FEED.agents.slice(0, 4))), DOSE_RE);
});

test('the page carries no dose literal and renders only through textContent', () => {
  assert.doesNotMatch(PAGE, DOSE_RE);
  const script = slice(PAGE, '(function(){', '})();');
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(script, /XMLHttpRequest|WebSocket|sendBeacon|navigator\.sendBeacon/);
  assert.equal((PAGE.match(/fetch\(/g) || []).length, 1, 'the only request is the reviewed feed');
});

test('the scenario strip, compare bar and grid hosts exist in the markup the script targets', () => {
  for (const id of ['scenarios', 'scenlinks', 'cmpbar', 'grid', 'detail', 'list', 'filters', 'status', 'q']) {
    assert.match(PAGE, new RegExp(`id="${id}"`), id);
  }
  assert.ok(existsSync(new URL('../05_Psychopharmacology/Pharmacy/pharmacy.html', import.meta.url)));
});
