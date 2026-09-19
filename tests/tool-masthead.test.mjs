// Tool masthead: the shell yields its title to the embedded tool at EVERY width.
//
// Measured 2026-09-18 on the production MS3 site at 1024px opening ?tool=capacity.html: the
// shell painted "INTERACTIVE TOOL · self-paced / Decisional Capacity / Reviewed by …" and the
// tool, directly beneath it, painted its own "ACUTE & SAFETY · 04 / Assessing Decisional
// Capacity" — two mastheads for one page. Below 1000px the shell already hid its head and
// clipped its h1 (the tool supplies the visible title there, and a phone had no room for two);
// the desktop kept both because nobody had asked which title was the page's. A runtime
// calibration on the built sites (2026-09-19) answered it: 25 of 27 shipped tools render their
// own visible <h1>, and the two that titled themselves with a <div> (feedback.html,
// review.html) now carry a real heading. So the rule is one contract, not a breakpoint: a tool
// supplies its own h1, and the shell's head, h1 and empty lead yield everywhere. The shell h1
// stays in the document, clipped, so the outer page keeps an accessible heading.
//
// These assertions read the stylesheet. tests/smoke/tool-expand.spec.js ("every shipped tool
// titles itself") opens every published tool and asserts the visible h1 inside the frame, which
// is the half a stylesheet pin cannot see.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const css = read('frontdoor/frontdoor.css');

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

// Every rule in the sheet with its enclosing @media prelude ('' when unscoped), in source order.
function rules() {
  const out = [];
  const src = strip(css);
  let i = 0;
  while (i < src.length) {
    const at = src.indexOf('@media', i);
    const next = at === -1 ? src.length : at;
    for (const m of src.slice(i, next).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      out.push({ media: '', selector: m[1].trim(), body: m[2] });
    }
    if (at === -1) break;
    const open = src.indexOf('{', at);
    let depth = 0; let end = open;
    for (let k = open; k < src.length; k += 1) {
      if (src[k] === '{') depth += 1;
      if (src[k] === '}') { depth -= 1; if (depth === 0) { end = k; break; } }
    }
    const prelude = src.slice(at, open).trim();
    for (const m of src.slice(open + 1, end).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      out.push({ media: prelude, selector: m[1].trim(), body: m[2] });
    }
    i = end + 1;
  }
  return out;
}

const forSelector = (selector) => rules().filter((r) => r.selector.split(',').map((s) => s.trim()).includes(selector));

test('the shell hides its head for a tool at every width, not only below 1000px', () => {
  const head = forSelector('.fd-reader--tool .fd-article__head');
  assert.ok(head.length >= 1, 'a rule for the tool head must exist');
  const unscoped = head.filter((r) => r.media === '' && /display:none/.test(r.body));
  assert.equal(unscoped.length, 1, `exactly one unscoped display:none rule for the tool head, found ${unscoped.length}`);
  assert.equal(head.filter((r) => r.media !== '').length, 0,
    'no breakpoint-scoped copy remains — one contract, not one per width');
});

test('the shell h1 is clipped for a tool at every width, never removed (the outer page keeps an accessible heading)', () => {
  const h1 = forSelector('.fd-reader--tool .fd-article__h1');
  const unscoped = h1.filter((r) => r.media === '');
  assert.equal(unscoped.length, 1, `exactly one unscoped rule for the tool h1, found ${unscoped.length}`);
  assert.match(unscoped[0].body, /position:absolute/);
  assert.match(unscoped[0].body, /width:1px/);
  assert.doesNotMatch(unscoped[0].body, /display:none/);
  assert.equal(h1.filter((r) => r.media !== '').length, 0, 'no breakpoint-scoped copy remains');
});

test('an empty tool lead collapses at every width', () => {
  const lead = forSelector('.fd-reader--tool .fd-article__lead:empty');
  assert.equal(lead.filter((r) => r.media === '' && /display:none/.test(r.body)).length, 1);
  assert.equal(lead.filter((r) => r.media !== '').length, 0);
});

test('the phone-only card treatment for a tool stays phone-only', () => {
  // The desktop keeps the article card around the frame (the expand toggle is its full-bleed
  // state); only the head/h1/lead rules graduate to every width.
  const card = forSelector('.fd-reader--tool .fd-article');
  assert.ok(card.some((r) => /max-width:999px/.test(r.media) && /background:transparent/.test(r.body)),
    'the transparent-card rule stays inside the (max-width:999px) block');
  assert.ok(!card.some((r) => r.media === '' && /background:transparent/.test(r.body)));
});

test('the tool overrides sit after the base article rules they override (first-textual-match resolvers)', () => {
  const src = strip(css);
  const base = src.indexOf('.fd-article__h1{');
  const tool = src.indexOf('.fd-reader--tool .fd-article__h1{');
  assert.ok(base !== -1 && tool !== -1);
  assert.ok(tool > base, 'tests/fd-tokens.test.mjs resolves a selector by its first textual match');
});
