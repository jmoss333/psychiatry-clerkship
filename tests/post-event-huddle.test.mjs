import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { staleBuildReason } from './_build_freshness.mjs';

// Deterministic acceptance tests for the Post-Event Learning Huddle
// (design: docs/superpowers/specs/2026-09-04-post-event-learning-huddle-design.md, §10).
//
// The tool's V1 contract is stricter than the shared QA gate: zero storage, zero network
// transport, zero free text, zero doses/agents/instruments/crisis numbers, no evaluative
// labels, no blame language, no wording that implies a report was filed or that a
// universal policy exists, resident-only placement, and a pure deterministic debrief.
// T1–T16 and T18–T20 run against the SOURCE file; T17 runs against _build/ when it is CURRENT
// — see tests/_build_freshness.mjs for why existence is not the same question as freshness.

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = 'rp-post-event-huddle.html';
const SRC = path.join(repo, '_prototypes', 'post-event-huddle', SLUG);
// Every input T17's assertions depend on. site_extras.py is the producer that copies this tool
// (it is NOT in site_manifest.json); curriculum.json feeds the resident nav and library columns.
const BUILD_INPUTS = [
  SRC,
  path.join(repo, '13_Faculty_Resources', '_automation', 'site_build', 'site_extras.py'),
  path.join(repo, '13_Faculty_Resources', '_automation', 'site_build', 'build_deploy.py'),
  path.join(repo, '13_Faculty_Resources', '_automation', 'site_build', 'resident_section.py'),
  path.join(repo, 'curriculum.json'),
];
const html = fs.readFileSync(SRC, 'utf8');
const lower = html.toLowerCase();

function block(id) {
  const m = html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`));
  assert.ok(m, `script block #${id} present`);
  return m[1];
}
function noMatches(text, re, what) {
  const hits = [...text.matchAll(re)].map((m) => m[0]);
  assert.deepEqual(hits, [], `${what}: ${JSON.stringify(hits)}`);
}
function visibleText(fragment) {
  return fragment
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ');
}
function words(s) {
  return (s.match(/[A-Za-z0-9'’-]+/g) || []).length;
}

const data = JSON.parse(block('huddle-event'));
const reviewed = JSON.parse(fs.readFileSync(path.join(repo, '13_Faculty_Resources', 'reviewed.json'), 'utf8'));

test('T1 static shell: lang, one title, viewport, one h1, no skipped heading levels', () => {
  assert.match(html, /<html lang="en">/);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.match(html, /<meta name="viewport"/);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  for (let i = 1; i < levels.length; i++) {
    assert.ok(levels[i] <= levels[i - 1] + 1, `heading level jumps from h${levels[i - 1]} to h${levels[i]}`);
  }
});

test('T2 governance marker: one CLERKSHIP-META, resident-only audience, 2min, status tracks the ledger', () => {
  const markers = html.match(/<!--\s*\[CLERKSHIP-META v1\][\s\S]*?-->/g) || [];
  assert.equal(markers.length, 1);
  assert.equal((html.match(/\[RC-META\]/g) || []).length, 0, 'no legacy marker');
  const fields = Object.fromEntries([...markers[0].matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(fields.audience.split(',').map((s) => s.trim()), ['resident']);
  assert.equal(fields.time, '2min');
  const ledger = reviewed[SLUG];
  assert.ok(ledger, `${SLUG} has a ledger record in reviewed.json`);
  const expected = ledger.status === 'pending' ? 'draft-pending-attestation' : 'reviewed';
  assert.equal(fields.status, expected, 'marker status must mirror the canonical ledger');
});

test('T3 self-contained: no external scripts, stylesheets, imports or URLs of any kind', () => {
  noMatches(html, /<script[^>]*\ssrc=/gi, 'script src');
  noMatches(html, /<link\b[^>]*\shref=/gi, 'link href');
  noMatches(html, /@import\b/gi, '@import');
  noMatches(html, /url\(\s*['"]?https?:/gi, 'remote url()');
  noMatches(html, /https?:\/\//gi, 'http(s) URL');
});

test('T4 no network transport API or dynamic source assignment', () => {
  noMatches(html, /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b/g, 'transport API');
  noMatches(html, /\bnavigator\./g, 'navigator.*');
  noMatches(html, /\bimport\s*\(/g, 'dynamic import');
  noMatches(html, /\bnew\s+Image\s*\(/g, 'new Image');
  noMatches(html, /\.(src|srcset)\s*=/g, 'src assignment');
  noMatches(html, /\.pack\.json/g, 'pack.json fetch convention');
});

test('T5 no storage of any kind', () => {
  noMatches(html, /localStorage|sessionStorage|indexedDB|document\.cookie|\bcaches\b|BroadcastChannel|openDatabase/g, 'storage API');
});

test('T6 no free text: radios only, three groups of four, no textarea/select/contenteditable', () => {
  noMatches(html, /<textarea|<select|contenteditable/gi, 'free-text control');
  noMatches(html, /<input\b/gi, 'static <input> (inputs are generated from the JSON data only)');
  const render = block('huddle-render');
  const inputTypes = [...render.matchAll(/type:\s*'([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(inputTypes)], ['radio', 'button'], 'render creates only radio inputs and buttons');
  assert.equal(data.lenses.length, 3);
  for (const lens of data.lenses) assert.equal(lens.options.length, 4, `lens ${lens.id} has 4 options`);
  assert.match(html, /<form[^>]*onsubmit="return false"/, 'form never submits');
});

test('T7 no dose literal and no agent name', () => {
  noMatches(html, /\b\d+(?:\.\d+)?\s?(?:mg|mcg|mL|mg\/kg)\b/gi, 'dose literal');
  noMatches(html, /\b(haloperidol|lorazepam|olanzapine|ziprasidone|droperidol|ketamine|risperidone|diphenhydramine|benzodiazepine|antipsychotic|IM)\b/g, 'agent name');
});

test('T8 no instrument is named or reproduced', () => {
  const rights = JSON.parse(fs.readFileSync(path.join(repo, 'instrument_rights.json'), 'utf8'));
  const names = new Set();
  for (const inst of rights.instruments || []) {
    for (const v of [inst.id, inst.name, inst.shortName, ...(inst.aliases || [])]) {
      if (typeof v === 'string' && v.length >= 4) names.add(v.toLowerCase());
    }
  }
  for (const n of names) {
    const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    assert.ok(!re.test(lower), `instrument name present: ${n}`);
  }
  noMatches(html, /\b(C-SSRS|CSSRS|PHQ-?9|GAD-?7|BFCRS|CIWA|COWS|Stanley|safety plan form)\b/gi, 'instrument token');
});

test('T9 no crisis number and no crisis-block marker (design default: not a risk-work surface)', () => {
  const crisis = JSON.parse(fs.readFileSync(path.join(repo, 'crisis_resources.json'), 'utf8'));
  const digitRuns = new Set();
  for (const r of crisis.resources || []) {
    for (const field of ['contact', 'alsoAvailable']) {
      for (const token of String(r[field] || '').match(/\d[\d\-\s().]*\d/g) || []) {
        const digits = token.replace(/\D/g, '');
        if (digits.length >= 3) digitRuns.add(digits);
      }
    }
  }
  assert.ok(digitRuns.size > 0, 'crisis_resources.json yields at least one contact number to guard against');
  const htmlDigits = html.replace(/[\s.\-()]/g, '');
  for (const d of digitRuns) assert.ok(!new RegExp(`(?<!\\d)${d}(?!\\d)`).test(htmlDigits), `crisis number present: ${d}`);
  noMatches(html, /crisis-block/g, 'crisis-block marker');
});

test('T10 no evaluative labels', () => {
  noMatches(visibleText(html) + block('huddle-event'), /\b(competent|incompetent|negligen(?:t|ce)|passed|fail(?:ed|s|ure)?|ready|score[sd]?|grade[sd]?|remediat\w*|deficien\w*)\b/gi, 'label');
});

test('T11 no blame language', () => {
  noMatches(visibleText(html) + block('huddle-event'), /\b(fault|blame[sd]?|should have|shouldn't have|should not have|careless|error by|mistake by|to blame)\b/gi, 'blame');
});

test('T12 reporting boundary is explicit and nothing implies a report was made', () => {
  assert.match(html, /<section id="boundary"/);
  assert.match(html, /<h2>Already handled before this huddle/);
  assert.match(html, /<h2>This huddle \(later; learning only\)/);
  assert.equal(data.event.boundaryStatement, 'This page is not a report, does not know whether one was made, and cannot make one.');
  noMatches(html, /\b(you have (?:now )?(?:reported|filed|completed)|report (?:was|has been|is) (?:filed|made|complete)|counts as (?:a )?report|this fulfil+s)\b/gi, 'report-completion wording');
});

test('T13 no universal policy claims; institution-relative wording present', () => {
  noMatches(html, /\b(all hospitals|every hospital|always required|the law requires|policy requires|regulation requires|must be reported within|within \d+ hours?)\b/gi, 'universal policy');
  assert.ok(/your institution/i.test(html), 'says "your institution"');
});

test('T14 event data shape', () => {
  const e = data.event;
  for (const k of ['title', 'setting', 'patientVoice', 'boundaryStatement']) assert.ok(typeof e[k] === 'string' && e[k].length, `event.${k}`);
  assert.ok(Array.isArray(e.timeline) && e.timeline.length >= 4 && e.timeline.length <= 7, 'timeline 4–7 steps');
  assert.ok(e.alreadyHandled.length >= 3, 'alreadyHandled ≥ 3');
  assert.ok(e.thisHuddle.length >= 2, 'thisHuddle ≥ 2');
  assert.deepEqual(data.lenses.map((l) => l.id), ['patient', 'team', 'system']);
  const ids = new Set();
  for (const lens of data.lenses) {
    assert.ok(lens.prompt && lens.name, `lens ${lens.id} prompt/name`);
    for (const o of lens.options) {
      assert.ok(!ids.has(o.id), `duplicate option id ${o.id}`); ids.add(o.id);
      assert.ok(o.label && o.debrief && o.bridge, `${o.id} fields`);
      assert.ok(o.debrief.length >= 150 && o.debrief.length <= 450, `${o.id} debrief length ${o.debrief.length}`);
      assert.ok(o.bridge.length >= 60 && o.bridge.length <= 220, `${o.id} bridge length ${o.bridge.length}`);
      if (lens.id === 'patient') assert.ok(/\?"?$/.test(o.label), `${o.id} is a question`);
    }
  }
  assert.ok(data.synthesis.intro && data.synthesis.close && data.notDone, 'synthesis + notDone');
});

test('T15 the patient stays visible in every debrief', () => {
  const render = block('huddle-render');
  assert.match(render, /patientVoice/);
  assert.match(html, /data-slot="patient-voice"/);
  assert.match(render, /data-slot': 'patient-voice'/, 'debrief re-renders the patient voice');
});

test('T16 pure deterministic debrief logic across all 64 combinations', () => {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(block('huddle-logic'), sandbox);
  const H = sandbox.window.HUDDLE;
  assert.ok(H && typeof H.buildDebrief === 'function');
  // Values come back from the vm realm; normalise through JSON so deepEqual compares
  // structure, not Array prototypes.
  const plain = (v) => JSON.parse(JSON.stringify(v));
  assert.deepEqual(plain(H.LENS_ORDER), ['patient', 'team', 'system']);
  const [P, T, S] = data.lenses;
  let combos = 0;
  for (const p of P.options) for (const t of T.options) for (const s of S.options) {
    const picks = { patient: p.id, team: t.id, system: s.id };
    const a = plain(H.buildDebrief(data, picks));
    const b = plain(H.buildDebrief(data, picks));
    assert.deepEqual(a, b, 'same picks → identical output');
    assert.equal(a.patientVoice, data.event.patientVoice);
    assert.deepEqual(a.sections.map((x) => x.lens), ['patient', 'team', 'system']);
    assert.deepEqual(a.sections.map((x) => x.debrief), [p.debrief, t.debrief, s.debrief]);
    assert.deepEqual(a.synthesis, [data.synthesis.intro, p.bridge, t.bridge, s.bridge, data.synthesis.close]);
    assert.equal(a.notDone, data.notDone);
    combos++;
  }
  assert.equal(combos, 64);
  assert.throws(() => H.buildDebrief(data, { patient: 'zz', team: 'b1', system: 'c1' }), /unknown option/);
  assert.throws(() => H.buildDebrief(data, { patient: 'a1', team: 'b1' }), /no pick/);
  assert.equal(Object.keys(sandbox).filter((k) => k !== 'window').length, 0, 'logic block leaks no globals');
});

test('T17 (build) resident-only: ships on res, absent from ms3, built copy adds only the shared injections', (t) => {
  const res = path.join(repo, '_build', 'res', 'tools', SLUG);
  const ms3 = path.join(repo, '_build', 'ms3', 'tools', SLUG);
  // BOTH trees must be current. A stale _build/res fails the 'built on the resident site'
  // assertion honestly and then blocks the rebuild that would fix it (build_and_check.sh runs
  // this suite before build_deploy.py under `set -e`). And the 'absent from ms3' half is
  // VACUOUS against an ms3 tree that was never built — it would pass a real leak.
  for (const site of ['res', 'ms3']) {
    const stale = staleBuildReason(repo, site, BUILD_INPUTS);
    if (stale) { t.skip(stale); return; }
  }
  assert.ok(fs.existsSync(res), 'built on the resident site');
  assert.ok(!fs.existsSync(ms3), 'not built on the MS3 site');
  const built = fs.readFileSync(res, 'utf8');
  // The page pass injects a same-origin stylesheet link and a theme-init that READS cw_theme.
  // Nothing else may appear: no other storage call, no transport API, no remote URL.
  const storage = [...built.matchAll(/(localStorage|sessionStorage|indexedDB)\.[a-zA-Z]+\(\s*['"]([^'"]*)['"]/g)].map((m) => `${m[1]}.${m[0].split('.')[1].split('(')[0]}(${m[2]})`);
  assert.deepEqual(storage, ['localStorage.getItem(cw_theme)'], 'only the build-injected theme read');
  noMatches(built, /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b/g, 'transport API in built copy');
  noMatches(built, /https?:\/\//gi, 'remote URL in built copy');
  // Same-origin static assets the page pass may add (common.py: CLINICAL_CSS_LINK, favicon).
  const BUILD_LINKS = new Set(['/clinical-warm.css', '/favicon.svg']);
  const links = [...built.matchAll(/<link\b[^>]*href="([^"]*)"/gi)].map((m) => m[1]);
  for (const href of links) assert.ok(BUILD_LINKS.has(href), `unexpected <link> in built copy: ${href}`);
  const nav = fs.readFileSync(path.join(repo, '_build', 'res', 'index.html'), 'utf8');
  assert.ok(nav.includes(SLUG), 'resident shell nav references the tool');
});

test('T18 accessibility statics', () => {
  const render = block('huddle-render');
  assert.match(render, /el\('fieldset'\)/, 'each lens is a fieldset');
  assert.match(render, /el\('legend'\)/, 'each fieldset has a legend');
  assert.match(render, /el\('label', \{ class: 'opt', for: inputId \}/, 'every radio is wrapped in a label with for=id');
  assert.match(html, /<section id="debrief" aria-live="polite" tabindex="-1" hidden>/, 'debrief is a polite live region that can take focus');
  noMatches(html, /tabindex="[1-9]/g, 'positive tabindex');
  noMatches(html, /\son(click|change|keydown|keyup)=/gi, 'inline event handler');
  assert.match(html, /<button type="button" class="btn" id="show" disabled>/, 'debrief trigger is a real button');
  assert.match(html, /<main class="wrap" id="root">/, 'main landmark with the skip-link target id');
  assert.match(html, /\[data-theme="dark"\]/, 'ships its own dark tokens');
  noMatches(html, /color:\s*var\(--primary\)/g, 'bare --primary text colour (AA)');
});

test('T19 registries: ledger record, library placement, exclusion reason', () => {
  const ledger = reviewed[SLUG];
  assert.ok(['pending', 'reviewed'].includes(ledger.status));
  assert.ok(['general', 'clinical', 'legal', 'formulary', 'local-policy'].includes(ledger.risk.kind));
  const cur = JSON.parse(fs.readFileSync(path.join(repo, 'curriculum.json'), 'utf8'));
  const excl = (cur.libraryExclude || []).find((e) => e.ref === SLUG);
  assert.ok(excl && excl.reason, 'libraryExclude entry with a reason');
  const resCols = JSON.stringify(cur.siteLibrary && cur.siteLibrary.resident);
  assert.ok(resCols.includes(SLUG), 'placed in a resident siteLibrary column');
});

test('T20 two-minute budget: event ≤ 220 words, longest path ≤ 600 words', () => {
  const e = data.event;
  const eventWords = words(visibleText([e.title, e.setting, ...e.timeline, e.patientVoice].join(' ')));
  assert.ok(eventWords <= 220, `event block is ${eventWords} words`);
  const boundaryWords = words([...e.alreadyHandled, e.boundaryStatement, ...e.thisHuddle].join(' '));
  const longest = data.lenses.reduce((sum, l) => sum + Math.max(...l.options.map((o) => words(o.debrief) + words(o.bridge))), 0);
  const synth = words(data.synthesis.intro) + words(data.synthesis.close) + words(data.notDone);
  const total = eventWords + boundaryWords + longest + synth;
  assert.ok(total <= 600, `longest path is ${total} words`);
});
