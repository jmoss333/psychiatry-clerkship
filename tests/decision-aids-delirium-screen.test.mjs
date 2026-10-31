// Decision Aids — "Delirium screen first" view (enhancement B, owner request 2026-10-31).
//
// What this pins, and why each pin exists:
//
//   · the view exists, is reachable from the nav, and renders the four steps in order: who to
//     screen, look before you test (arousal, attention, baseline), the unit's validated screen,
//     and what a screen does not license;
//   · it reproduces no instrument: the 4AT and the CAM family are named and routed to, never
//     scored — no item wording, no cut-off, no total, no algorithm (CLAUDE.md invariant 8);
//   · the rule the MSE page states — delirium screen first, formal cognitive testing only after
//     it clears — is carried here as a limit, so the two pages cannot drift apart silently;
//   · nothing is stored, no new hook is used (the theme harness fakes only createElement,
//     useState and useEffect), and no dose literal rode in.
//
// Trust model: the block is executed straight out of the tracked html between its sentinels
// with a fake createElement, the same way tests/cows-series.test.mjs runs its helpers.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(path.join(ROOT, '04_Acute_and_Safety/Decision_Aids/decision-aids.html'), 'utf8');

function block() {
  const m = html.match(/\/\* DELIRIUM_SCREEN_BEGIN[\s\S]*?\*\/\n([\s\S]*?)\/\* DELIRIUM_SCREEN_END \*\//);
  assert.ok(m, 'delirium-screen block not found — locate it by its sentinels, not by line');
  return m[1];
}

function load() {
  const e = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter((x) => x != null) });
  // eslint-disable-next-line no-new-func
  return new Function('e', `${block()}\nreturn { SCREEN, ScreenView };`)(e);
}

const nodes = (t) => (typeof t === 'object' ? [t, ...t.children.flatMap(nodes)] : []);
const text = (t) => (typeof t === 'object' ? t.children.map(text).join('') : String(t));

test('the view is in the nav, second, and body() renders it', () => {
  assert.match(html, /var VIEWS=\[\["trees","Decision trees"\],\["screen","Delirium screen first"\],/);
  assert.match(html, /if\(view==="screen"\) return e\(ScreenView\);/);
});

test('the four steps render in order, with the route and the rounds line', () => {
  const { SCREEN, ScreenView } = load();
  const tree = ScreenView();
  const labels = nodes(tree).filter((n) => n.props.className === 'nlabel').map(text);
  assert.deepEqual(labels, ['1Who to screen', '2Look before you test', '3Then the validated screen', '4What a screen does not license']);
  assert.deepEqual(SCREEN.look.map((x) => x[0]), ['Arousal', 'Attention', 'Baseline']);
  const link = nodes(tree).find((n) => n.type === 'a');
  assert.equal(link.props.href, 'https://www.the4at.com/');
  assert.equal(link.props.rel, 'noopener noreferrer');
  const all = text(tree);
  assert.match(all, /^Delirium screen first/);
  assert.match(all, /On rounds · /);
  assert.match(all, /Teaching, not an order\./);
  assert.match(all, /delirium is a medical diagnosis/);
});

test('the limits carry the screen-first rule and the fluctuation rule', () => {
  const { SCREEN } = load();
  const limits = SCREEN.limits.join(' ');
  assert.match(limits, /A MoCA or MMSE taken during delirium measures the delirium\. Defer formal cognitive testing until it clears\./);
  assert.match(limits, /rescreen each shift and whenever the picture changes/);
  assert.match(limits, /Hypoactive delirium is quiet/);
  assert.match(limits, /Dementia does not rule delirium out/);
});

test('no instrument is reproduced: nothing is scored, no cut-off, no item wording', () => {
  const src = block();
  // Nothing sums, scores or thresholds.
  assert.doesNotMatch(src, /score\s*[:=]|total|reduce\(|\bpoints?\b|cut-?off|≥|>=/i);
  // No 4AT item scoring criterion and no item label beyond the generic bedside features.
  assert.doesNotMatch(src, /AMT4|seven months|7 months|achieves|abbreviated mental test/i);
  // The CAM family is named, not programmed: no algorithm features as a rule.
  assert.doesNotMatch(src, /feature 1|feature 2|feature 3|feature 4|and either/i);
  // Named and routed, explicitly from the official form.
  assert.match(src, /Score it from the official form and its instructions, not from memory\./);
});

test('the view stores nothing, uses no new hook, and carries no dose literal', () => {
  const src = block();
  assert.doesNotMatch(src, /localStorage|sessionStorage|useState|useEffect|useRef|useMemo|useCallback/);
  assert.doesNotMatch(src, /<input\b|<textarea|contentEditable|e\(\s*["'](?:input|textarea)["']/i);
  assert.doesNotMatch(html, /\b\d+(?:\.\d+)?\s?(?:mg|mcg|mL|mg\/kg)\b/i);
  assert.equal((html.match(/\[CLERKSHIP-META v1\]/g) || []).length, 1);
});

test('the existing trees and views are untouched (keep-guards)', () => {
  assert.match(html, /\{id:"delirium",title:"Confused \/ fluctuating",/);
  assert.match(html, /\["ladder","Agitation ladder"\],\["nmsss","NMS vs SS"\],\["withdrawal","Withdrawal timeline"\],\["ciwa","CIWA-Ar bands"\]\];/);
  assert.match(html, /'Toggle light\/dark theme'|"Toggle light\/dark theme"/);
});
