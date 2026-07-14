// Server/client gate-parity — multi-case. The server (sp.mjs deriveState) must agree with the
// client MockProvider on rapport, coverage, and unlocked gates for every scenario, or a modified
// client could out-derive the server (security invariant #1).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { _internals } = await import(path.join(REPO, 'sp-proxy/netlify/functions/sp.mjs'));
const pack = JSON.parse(fs.readFileSync(path.join(REPO, '_prototypes/sp-interview/sp-interview.pack.json'), 'utf8'));

const html = fs.readFileSync(path.join(REPO, '_prototypes/sp-interview/sp-interview.html'), 'utf8');
const m = html.match(/<script>\n\(function\(\)\{[\s\S]*?\n<\/script>/);
let src = m[0].replace(/^<script>\n/, '').replace(/\n<\/script>$/, '');
global.window = {};
global.document = { getElementById: () => ({ addEventListener() {}, removeEventListener() {}, textContent: '' }), documentElement: { getAttribute: () => null, setAttribute() {} }, createElement: () => ({ click() {} }) };
global.localStorage = { getItem: () => null, setItem() {} };
global.React = { createElement: () => null, useState: (v) => [v, () => {}], useEffect: () => {}, useRef: () => ({ current: null }) };
global.ReactDOM = { createRoot: () => ({ render() {} }) };
global.fetch = () => Promise.reject(new Error('no net'));
eval(src);
const T = global.window.__SP_TEST__;

const scenarios = [
  // ---- Dana ----
  { c: 0, name: 'dana skilled', msgs: ["Hi, my name is Alex, I'm the medical student on the team. Before we start — what would you most want us to understand today?","Tell me more about what's been going on, in your own words.","It sounds like everything has felt really heavy for a while.","When you say burden — have you had thoughts of killing yourself?","Do you have a plan?","Are the pills still at home — do you have access to them?","What has kept you going?"] },
  { c: 0, name: 'dana cold SI first', msgs: ["Have you had thoughts of killing yourself?","Do you have a plan?"] },
  { c: 0, name: 'dana judgmental block', msgs: ["You should just snap out of it.","Have you had thoughts of killing yourself?"] },
  { c: 0, name: 'dana euphemism', msgs: ["Tell me what's been going on.","It sounds like that's been really hard.","Do you ever think about hurting yourself?"] },
  { c: 0, name: 'dana flag+SI same message', msgs: ["You should be honest with me — have you had thoughts of killing yourself?"] },
  // ---- Dana compound/flagged single-turn cascade parity (unioned from #209 parity.test) ----
  { c: 0, name: 'dana flag+SI same turn (2-msg, #209)', msgs: ["Tell me more about what's been going on, in your own words.","What's the diagnosis? Have you had thoughts of killing yourself?"] },
  { c: 0, name: 'dana SI+plan same message (#209)', msgs: ["Hi, my name is Alex, I'm the medical student on the team. Before we start — what would you most want us to understand today?","Tell me more about what's been going on, in your own words.","It sounds like everything has felt really heavy.","Have you thought about killing yourself, and do you have a plan?"] },
  { c: 0, name: 'dana compound secondary (plan+means one msg, #209)', msgs: ["Hi, my name is Alex, I'm the medical student on the team. Before we start — what would you most want us to understand today?","Tell me more about what's been going on, in your own words.","It sounds like everything has felt really heavy.","Have you had thoughts of killing yourself?","Do you have a plan, and access to any means at home?"] },
  // ---- Marcus ----
  { c: 1, name: 'marcus skilled', msgs: ["Hi, my name is Alex, I'm the medical student on the team — before we start, what would you most want from this conversation?","Tell me what's been going on, in your own words.","It sounds like everything sped up fast — and that must be really intense.","I do want to hear about the irrigation fix — first, let's start with your sleep. How many hours are you actually getting?","Do your thoughts feel like they're racing?","What have you been spending money on lately?","Any new partners, or times you weren't as careful as usual?","With everything moving this fast — have you had thoughts of killing yourself, even for a second?"] },
  { c: 1, name: 'marcus cold SI (unlocks at 0)', msgs: ["Have you had thoughts of killing yourself?"] },
  { c: 1, name: 'marcus calm-down block', msgs: ["You need to calm down, okay?","Have you had thoughts of killing yourself?"] },
  { c: 1, name: 'marcus argue blocks fear gate', msgs: ["That's not realistic — you can't possibly fix campus irrigation.","Do your thoughts feel like they're racing?"] },
  { c: 1, name: 'marcus two gates one message', msgs: ["What are you spending money on — and any new partners?"] },
  { c: 1, name: 'marcus flag+SI same message', msgs: ["You should be honest with me — have you had thoughts of killing yourself?"] },
  // ---- Ray (psychosis) ----
  { c: 2, name: 'ray skilled', msgs: ["Hi, I'm Alex, one of the medical students — and no, this isn't being recorded. You're in control of what we talk about.","We can stop whenever you want. What has this been like for you, these last few weeks?","That sounds really frightening — living like that.","Help me understand what you've noticed at home.","That sounds exhausting — carrying all of this by yourself.","Have you been hearing anything — like sounds or voices — that other people don't seem to?","When the voice talks, does it ever tell you to do anything?","Have you had thoughts of hurting the people you're afraid of?","When did you last eat or drink something?"] },
  { c: 2, name: 'ray command cold (locked)', msgs: ["Do the voices tell you to do anything?"] },
  { c: 2, name: 'ray challenge blocks command', msgs: ["No one is poisoning you — that's not real.","Okay, but do the voices tell you to do anything?"] },
  { c: 2, name: 'ray collude flag', msgs: ["You're right, they really are after you — we need to stop them."] },
  { c: 2, name: 'ray target locked without command', msgs: ["Have you thought about hurting the neighbors?"] },
];

let fails = 0;
for (const sc of scenarios) {
  const cd = pack.cases[sc.c];
  const sv = _internals.deriveState(cd, sc.msgs);
  const P = new T.MockProvider(); const cs = P.start(cd, { difficulty: 'supported' });
  for (const msg of sc.msgs) await P.respond(cs, msg);
  const svU = Object.keys(sv.unlocked).sort().join(','), clU = Object.keys(cs.unlocked).sort().join(',');
  const svC = Object.keys(sv.covered).sort().join(','), clC = Object.keys(cs.covered).sort().join(',');
  const ok = svU === clU && sv.rapport === cs.rapport && svC === clC;
  console.log((ok ? 'PASS' : 'FAIL') + ' parity — ' + sc.name + ' (rapport ' + sv.rapport + '/' + cs.rapport + ', unlocked [' + svU + '] vs [' + clU + '])');
  if (!ok) { fails++; if (svC !== clC) console.log('  server covered:', svC, '\n  client covered:', clC); }
}
process.exit(fails ? 1 : 0);
