// "Presenting tomorrow" (F4, 2026-10-18): the Today chooser's syndrome x hospital-day card.
//
// Two halves, one contract. presenting_tomorrow.py decides which syndromes qualify on a site and
// counts the items each (syndrome, phase) card renders -- and fails the build below the minimum.
// fd_today.js fdPrepItems draws that list in the shell from the same inputs. These tests pin:
//   1. the real registries: 13 syndromes per site today, every cell >= minItems, every link
//      target ships on its site, every label and lead audience-neutral;
//   2. parity: for every real cell on both sites, the JS renderer's item list equals Python's;
//   3. the render: pills in registry order, one pressed syndrome and phase, the card's lines in
//      phase order, the right link kind per destination, EPA on the resident build only, nothing
//      outside "Before rounds", and hostile ids rendering nothing dangerous.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

// eslint-disable-next-line no-new-func
const F = new Function('governanceBadge', `
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_edition_student.js')}
  ${read('frontdoor/fd_today.js')}
  return { fdBuildIndex: fdBuildIndex, fdTodayPurpose: fdTodayPurpose, fdPrepItems: fdPrepItems,
           fdPrepCard: fdPrepCard, fdPrepPicker: fdPrepPicker, fdPrepPhase: fdPrepPhase, fdPrepSyndrome: fdPrepSyndrome };
`)(() => '');

// ---- the Python half, over the real registries -----------------------------------------------
const PY = `
import json, sys
sys.path.insert(0, '13_Faculty_Resources/_automation/site_build')
import presenting_tomorrow as p
from topic_hub_block import cotw_for_topics
data = p.load('.')
problems = p.validate(data)
out = {'problems': problems, 'sites': {}}
for site in p.SITES:
    syns = p.syndromes(data, site)
    cotw = cotw_for_topics(data['hubs'], data['shipped'], site)
    cells = {}
    for s in syns:
        for ph in data['registry']['phases']:
            cells[s['ref'] + '|' + ph['id']] = p.cell_items(data, site, s, ph, cotw.get(s['ref']) or [])
    out['sites'][site] = {'payload': p.payload(data, site), 'cells': cells, 'matrix': p.matrix(data, site),
                          'shipped': sorted(k for k, v in data['shipped'].items() if site in v.get('sites', []))}
out['minItems'] = data['registry']['minItems']
print(json.dumps(out))
`;
const PYOUT = JSON.parse(execFileSync('python3', ['-B', '-c', PY], { cwd: ROOT, encoding: 'utf8' }));
const REAL_META = JSON.parse(readFileSync(new URL('../topic_meta.json', import.meta.url), 'utf8'));
const REAL_TOOLS = JSON.parse(readFileSync(new URL('../tool_registry.json', import.meta.url), 'utf8'));

// The per-site projections, as the shell receives them (same recipe as fd-library.test.mjs).
const projected = JSON.parse(execFileSync('python3', ['-B', '-c', `
import json,sys
sys.path.insert(0,'13_Faculty_Resources/_automation/site_build')
from frontdoor_catalog import build_frontdoor_payload
from shipped_pages import load_shipped_pages
cur=json.load(open('curriculum.json')); shipped=load_shipped_pages('.')
out={}
for site,key in [('ms3','ms3'),('res','resident')]:
    nav=[{'section':'Resources','items':[{'f':p['slug'],'t':p['title'],
        'k':'tool' if p['kind']=='tool' else 'md',
        'governance':{'status':'reviewed','riskKind':'general','riskLevel':'low'}}
        for p in shipped['pages'] if site in p['sites']]}]
    out[site]=build_frontdoor_payload(key,cur,nav,'0'*40,shipped=shipped)
print(json.dumps(out))
`], { cwd: ROOT, encoding: 'utf8' }));

test('the real registries validate: >= 3 syndromes per site, every cell >= minItems, every link target ships, copy audience-neutral', () => {
  assert.deepEqual(PYOUT.problems, []);
  for (const site of ['ms3', 'res']) {
    const { payload, matrix, shipped } = PYOUT.sites[site];
    const shippedSet = new Set(shipped);
    assert.ok(payload.syndromes.length >= 3, `${site}: ${payload.syndromes.length} syndromes`);
    for (const [ref, phases] of Object.entries(matrix)) {
      for (const [phase, n] of Object.entries(phases)) assert.ok(n >= PYOUT.minItems, `${site}: ${ref} x ${phase} renders ${n}`);
    }
    for (const syn of payload.syndromes) {
      assert.ok(shippedSet.has(syn.ref), `${site}: ${syn.ref} ships`);
      assert.ok(REAL_META[syn.ref] && REAL_META[syn.ref].clinicalWorkflow, `${site}: ${syn.ref} carries a workflow block`);
      if (syn.comm) assert.ok(shippedSet.has('communication-practice.html'), `${site}: comm tool ships`);
      if (syn.family) assert.ok(shippedSet.has('family-systems.html'), `${site}: family tool ships`);
      for (const a of syn.actions) {
        const target = /^\?(?:page|tool)=([^&#]+)/.exec(a.href);
        assert.ok(target && shippedSet.has(target[1]), `${site}: action ${a.href} ships`);
      }
      assert.doesNotMatch(syn.topic, AUDIENCE_TOKEN_RE);
    }
    for (const text of [payload.heading, payload.prompt, payload.phasePrompt, ...Object.values(payload.labels), ...payload.phases.flatMap((p) => [p.label, p.lead])]) {
      assert.doesNotMatch(text, AUDIENCE_TOKEN_RE, text);
    }
    assert.ok(payload.phases.length >= 2);
    assert.equal(new Set(payload.phases.map((p) => p.id)).size, payload.phases.length, 'phase ids unique');
  }
  // The two sites offer the same syndromes today (the hubs ship on both); case titles may differ.
  assert.deepEqual(PYOUT.sites.ms3.payload.syndromes.map((s) => s.ref), PYOUT.sites.res.payload.syndromes.map((s) => s.ref));
});

test('parity: fdPrepItems draws exactly the list cell_items() counted, for every real cell on both sites', () => {
  for (const site of ['ms3', 'res']) {
    const payload = projected[site];
    const idx = F.fdBuildIndex(payload.curriculum, REAL_META, REAL_TOOLS, payload.manifest);
    const prep = PYOUT.sites[site].payload;
    let checked = 0;
    for (const syn of prep.syndromes) {
      for (const phase of prep.phases) {
        const js = F.fdPrepItems(idx, prep, REAL_META, syn, phase).map((it) => [it.kind, it.key]);
        const py = PYOUT.sites[site].cells[`${syn.ref}|${phase.id}`];
        assert.deepEqual(js, py, `${site}: ${syn.ref} x ${phase.id}`);
        checked++;
      }
    }
    assert.ok(checked >= 30, `${site}: ${checked} cells compared`);
  }
});

// ---- the render --------------------------------------------------------------------------------
const PREP = PYOUT.sites.ms3.payload;
const ms3 = projected.ms3;
const IDX = F.fdBuildIndex(ms3.curriculum, REAL_META, REAL_TOOLS, ms3.manifest);
const resIdx = F.fdBuildIndex(projected.res.curriculum, REAL_META, REAL_TOOLS, projected.res.manifest);
const opts = (over) => Object.assign({ prep: PREP, meta: REAL_META, prepRef: '', prepPhase: '', audience: 'ms3' }, over);
const attrs = (html, re) => [...html.matchAll(re)].map((m) => m[1]);

test('the picker appears only under "Before rounds", lists the syndromes in registry order, and shows no card until one is picked', () => {
  const rounds = F.fdTodayPurpose(IDX, 'rounds', true, opts());
  assert.match(rounds, /<div class="fd-prep"><p class="fd-prep__prompt">Presenting a specific patient\? Pick the syndrome\.<\/p>/);
  assert.deepEqual(attrs(rounds, /data-today-prep="([^"]+)"/g), PREP.syndromes.map((s) => s.ref));
  assert.doesNotMatch(rounds, /aria-pressed="true"[^>]*>[^<]*<\/button><\/div><div class="fd-prep__phases"/, 'nothing pressed yet');
  assert.doesNotMatch(rounds, /fd-prep__phases|fd-prep__card/);
  assert.ok(rounds.indexOf('fd-prep') < rounds.indexOf('fd-prepare') || rounds.indexOf('fd-prepare') === -1, 'the picker precedes the Prepare-for-tomorrow invitation');
  for (const id of ['', 'interview', 'family', 'study']) assert.doesNotMatch(F.fdTodayPurpose(IDX, id, true, opts()), /fd-prep\b|data-today-prep/, id || 'regular Today');
  // Without the payload the chooser is exactly as before.
  assert.doesNotMatch(F.fdTodayPurpose(IDX, 'rounds', true, opts({ prep: null })), /fd-prep\b|data-today-prep/);
  assert.doesNotMatch(F.fdTodayPurpose(IDX, 'rounds', true), /fd-prep\b|data-today-prep/);
});

test('a picked syndrome renders the phase pills (first phase default) and one card whose lines follow the phase in order', () => {
  const html = F.fdTodayPurpose(IDX, 'rounds', true, opts({ prepRef: 't_mood.md' }));
  assert.equal(attrs(html, /data-today-prep="([^"]+)" aria-pressed="true"/g).join(), 't_mood.md');
  assert.deepEqual(attrs(html, /data-today-prep-phase="([^"]+)"/g), PREP.phases.map((p) => p.id));
  assert.equal(attrs(html, /data-today-prep-phase="([^"]+)" aria-pressed="true"/g).join(), PREP.phases[0].id, 'first phase by default');
  assert.match(html, /<div class="fd-prep__card" data-prep-ref="t_mood\.md" data-prep-phase="admit"><h3 class="fd-prep__title">Mood disorders · Admission<\/h3>/);
  const labels = attrs(html, /<div class="fd-prep__line"><dt>([^<]*)<\/dt>/g);
  const expected = F.fdPrepItems(IDX, PREP, REAL_META, F.fdPrepSyndrome(PREP, 't_mood.md'), PREP.phases[0]).filter((i) => i.kind === 'text').map((i) => i.label);
  assert.deepEqual(labels, expected);
  assert.ok(labels.length >= 3);
  // The text is the record's, escaped, never reworded.
  assert.ok(html.indexOf(REAL_META['t_mood.md'].clinicalWorkflow.ask.replace(/&/g, '&amp;')) > -1, 'ask verbatim');
  assert.ok(html.indexOf(REAL_META['t_mood.md'].ruleOut.join(' · ').replace(/&/g, '&amp;')) > -1, 'ruleOut joined verbatim');
  // Another phase: its own lines and links.
  const rounds = F.fdTodayPurpose(IDX, 'rounds', true, opts({ prepRef: 't_mood.md', prepPhase: 'rounds' }));
  assert.match(rounds, /data-prep-phase="rounds"/);
  assert.equal(attrs(rounds, /data-today-prep-phase="([^"]+)" aria-pressed="true"/g).join(), 'rounds');
  assert.match(rounds, /Case of the Week: /);
});

test('links: a page routes through data-fd-open, a drill, scenario or tool with a query is a real href; the guide is first', () => {
  const html = F.fdTodayPurpose(IDX, 'rounds', true, opts({ prepRef: 't_mood.md', prepPhase: 'rounds' }));
  const links = [...html.matchAll(/<li>(<button type="button" class="fd-btn fd-btn--ghost" data-fd-open="([^"]+)"|<a class="fd-btn fd-btn--ghost" href="([^"]+)")>([^<]*)<\/(?:button|a)><\/li>/g)]
    .map((m) => ({ ref: m[2], href: m[3], text: m[4] }));
  assert.ok(links.length >= 2);
  assert.equal(links[0].ref, 't_mood.md');
  assert.match(links[0].text, /^Open the guide: /);
  const cotw = links.find((l) => /^Case of the Week: /.test(l.text));
  assert.ok(cotw && /^cotw_\d{8}_[a-z0-9]+_ms3\.md$/.test(cotw.ref), 'the newest MS3 edition, as a page ref');
  assert.equal(cotw.ref, IDX.cotwForTopic['t_mood.md'][0].slug);
  for (const l of links.filter((l) => l.href)) assert.match(l.href, /^\?(tool|page)=[^"]*(&amp;|$)/, 'query-bearing destinations are real links, escaped');
  const admit = F.fdTodayPurpose(IDX, 'rounds', true, opts({ prepRef: 't_mood.md', prepPhase: 'admit' }));
  assert.match(admit, /href="\?tool=communication-practice\.html&amp;case=mania_limit_sleep_001">Rehearse the conversation: /);
  const dis = F.fdTodayPurpose(IDX, 'rounds', true, opts({ prepRef: 't_mood.md', prepPhase: 'discharge' }));
  assert.match(dis, /href="\?tool=family-systems\.html&amp;scenario=collateral_baseline_safety_001">Rehearse the family conversation: /);
});

test('the EPA line renders on the resident build only; the resident card names the resident Case-of-the-Week twin', () => {
  const resPrep = PYOUT.sites.res.payload;
  const res = F.fdTodayPurpose(resIdx, 'rounds', true, { prep: resPrep, meta: REAL_META, prepRef: 't_mood.md', prepPhase: 'rounds', audience: 'resident' });
  assert.match(res, /<p class="fd-prep__epa">EPA · EPA1 · EPA2 · EPA4<\/p>/);
  assert.match(res, /data-fd-open="cotw_\d{8}_[a-z0-9]+_res\.md"/);
  const ms = F.fdTodayPurpose(IDX, 'rounds', true, opts({ prepRef: 't_mood.md', prepPhase: 'rounds' }));
  assert.doesNotMatch(ms, /fd-prep__epa/);
});

test('hostile or unknown picks render nothing dangerous: no card for an unknown ref, first phase for an unknown phase, everything escaped', () => {
  const unknown = F.fdTodayPurpose(IDX, 'rounds', true, opts({ prepRef: 'nope.md" onclick="alert(1)' }));
  assert.doesNotMatch(unknown, /onclick|alert|fd-prep__card/);
  assert.doesNotMatch(unknown, /aria-pressed="true">[^<]*<\/button><\/div><div class="fd-prep__phases"/);
  // An unknown phase id never reaches the markup at all (the first phase is used instead), so the
  // check is for the raw string's absence, not a tag filter.
  const hostilePhase = '<scr' + 'ipt>alert(1)';
  const badPhase = F.fdTodayPurpose(IDX, 'rounds', true, opts({ prepRef: 'delirium.md', prepPhase: hostilePhase }));
  assert.equal(badPhase.indexOf(hostilePhase), -1);
  assert.equal(badPhase.indexOf('alert(1)'), -1);
  assert.match(badPhase, /data-prep-phase="admit"/);
  // A payload with a hostile topic name is escaped.
  const hostile = JSON.parse(JSON.stringify(PREP));
  hostile.syndromes[0].topic = 'Mood <b>"x"</b> & more';
  const html = F.fdTodayPurpose(IDX, 'rounds', true, opts({ prep: hostile, prepRef: hostile.syndromes[0].ref }));
  assert.match(html, /Mood &lt;b&gt;&quot;x&quot;&lt;\/b&gt; &amp; more/);
  assert.doesNotMatch(html, /<b>"x"<\/b>/);
  // A syndrome the index does not know (not shipped on this site) is not offered.
  const ghost = JSON.parse(JSON.stringify(PREP));
  ghost.syndromes.push({ ref: 'ghost.md', topic: 'Ghost', comm: null, family: null, actions: [], epa: [] });
  assert.doesNotMatch(F.fdTodayPurpose(IDX, 'rounds', true, opts({ prep: ghost })), /data-today-prep="ghost\.md"/);
});

test('shell wiring: both needles and both pickers are validated against the payload, session-only, never persisted', () => {
  const shell = read('spa_index.html');
  assert.equal(shell.split('var FD_PRESENTING=null;').length - 1, 1);
  assert.match(shell, /var fdTodayPrepRef='',fdTodayPrepPhase='';/);
  const handlers = shell.slice(shell.indexOf("el=target.closest&&target.closest('[data-today-prep]')"), shell.indexOf("el=target.closest&&target.closest('[data-today-planner-toggle]')"));
  assert.match(handlers, /if\(!prepValid\)return;/);
  assert.match(handlers, /if\(!phaseValid\)return;/);
  assert.equal((handlers.match(/if\(facultyPreviewRequest\)return/g) || []).length, 2);
  assert.doesNotMatch(handlers, /localStorage|sessionStorage|setItem|history\.|fetch\(/);
  const build = read('build_deploy.py'), resident = read('resident_section.py');
  assert.match(build, /_presenting\.payload\(_presenting_data,"ms3"\)/);
  assert.match(resident, /_presenting\.payload\(_presenting_res_data,"res"\)/);
  assert.ok(resident.indexOf('FD_PRESENTING') < resident.lastIndexOf('open(OUT+"/index.html","w",encoding="utf-8").write(ix)'));
});
