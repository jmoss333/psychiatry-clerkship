// Reference-list integrity on every shipped reading. A page that numbers its References and cites
// them in the text as [n] must cite only numbers the list has, and number the list in rising
// order with no repeat. (A gap is allowed: an MS3 case may keep its Resident twin's numbers for the
// subset it cites, and the reader shows the author's numbers, not markdown's 1..N.) The reader turns each [n] into a tap that jumps to entry n (fd_ref_evidence.js); a [n]
// with no entry n is a claim pointing at nothing, and a renumbered list silently re-points every
// citation below the edit at the wrong paper. Found by hand on 2026-11-24 (#1196 Q4 cited "ref 8"
// while the list was being rewritten); this makes it a PR-time failure.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const SITE = new URL('13_Faculty_Resources/_automation/site_build/', ROOT);
const shipped = JSON.parse(readFileSync(new URL('shipped_pages.json', SITE), 'utf8')).pages;
const markedSrc = readFileSync(new URL('marked.min.js', SITE), 'utf8');
const mod = { exports: {} };
// eslint-disable-next-line no-new-func
new Function('module', 'exports', markedSrc)(mod, mod.exports);
const marked = mod.exports.marked || mod.exports;
const fdSrc = readFileSync(new URL('frontdoor/fd_ref_evidence.js', SITE), 'utf8');
// eslint-disable-next-line no-new-func
const { fdRefCiteMarkup } = new Function(`${fdSrc}\nreturn {fdRefCiteMarkup};`)();

const HEADING = /^#{1,4}\s*(?:References|Sources|Key references)\b.*$/gim;
const CITE = /\[(\d{1,3}(?:\s*[,–-]\s*\d{1,3})*)\](?!\()/g;
// Code spans, fenced code and markdown link definitions are not citations.
const prose = (s) => s.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '').replace(/^ {0,3}\[[^\]\n]+\]:[ \t].*$/gm, '');

function expand(inner) {
  const out = [];
  for (const part of inner.split(/\s*,\s*/)) {
    const range = part.split(/\s*[–-]\s*/).map(Number);
    if (range.length === 2) for (let n = range[0]; n <= range[1]; n += 1) out.push(n);
    else out.push(range[0]);
  }
  return out;
}

function readPages() {
  const rels = [...new Set(shipped.map((p) => p.source).filter((s) => s && s.endsWith('.md')))].sort();
  const pages = [];
  for (const rel of rels) {
    const file = new URL(rel, ROOT);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const headings = [...text.matchAll(HEADING)];
    if (!headings.length) continue;
    const h = headings[headings.length - 1];
    const body = prose(text.slice(0, h.index));
    const after = text.slice(h.index + h[0].length).split(/^#{1,4}\s/m)[0];
    const numbers = [...after.matchAll(/^(\d+)\.\s/gm)].map((m) => Number(m[1]));
    if (!numbers.length) continue;
    const cited = [...body.matchAll(CITE)].flatMap((m) => expand(m[1]));
    pages.push({ rel, text, numbers, cited });
  }
  return pages;
}
const PAGES = readPages();

// Pages whose numbered list includes entries the text never cites as [n]. Reading lists and older
// cases; frozen on 2026-11-25. This list may only shrink: a new page cites every entry it lists.
const UNCITED_ALLOWED = {
  '02_Clinical_Skills/Psychotherapy/therapy_on_the_unit_inpatient_teaching.md': 'reading list',
  '08_Cases_and_Simulation/case-of-the-week/2026-07-13_acute-agitation-delirium_Resident.md': 'refs 9-10',
  '08_Cases_and_Simulation/case-of-the-week/2026-07-20_bipolar-mania_Resident.md': 'ref 6',
  '08_Cases_and_Simulation/case-of-the-week/2026-07-20_mdd-treatment-selection-augmentation_Resident.md': 'ref 1',
};

test('the sweep sees the cited pages (guards against a silently empty sweep)', () => {
  assert.ok(PAGES.length >= 30, `only ${PAGES.length} pages with a numbered reference list`);
  assert.ok(PAGES.filter((p) => p.cited.length).length >= 30);
});

test('every reference list starts at 1 and rises with no repeat', () => {
  for (const { rel, numbers } of PAGES) {
    assert.equal(numbers[0], 1, `${rel}: the reference list starts at ${numbers[0]}`);
    numbers.slice(1).forEach((n, i) => assert.ok(n > numbers[i], `${rel}: reference numbers ${numbers.join(',')}`));
  }
});

test('every in-text [n] names an entry the page’s reference list has', () => {
  for (const { rel, numbers, cited } of PAGES) {
    const dangling = [...new Set(cited.filter((n) => !numbers.includes(n)))];
    assert.deepEqual(dangling, [], `${rel} cites [${dangling.join(',')}] but lists ${numbers.join(',')}`);
  }
});

test('uncited reference entries stay inside the frozen allowlist, and the allowlist only shrinks', () => {
  for (const { rel, numbers, cited } of PAGES) {
    if (!cited.length) continue;
    const uncited = numbers.filter((n) => !cited.includes(n));
    if (UNCITED_ALLOWED[rel]) {
      assert.ok(uncited.length, `${rel} now cites every entry: remove it from UNCITED_ALLOWED`);
    } else {
      assert.deepEqual(uncited, [], `${rel} lists entries it never cites: ${uncited.join(',')}`);
    }
  }
  for (const rel of Object.keys(UNCITED_ALLOWED)) {
    assert.ok(PAGES.some((p) => p.rel === rel), `${rel} is no longer swept: remove it from UNCITED_ALLOWED`);
  }
});

test('in the reader every source [n] becomes exactly one tappable citation', () => {
  let total = 0;
  for (const { rel, text, cited, numbers } of PAGES) {
    if (!cited.length) continue;
    const html = fdRefCiteMarkup(marked.parse(text), text);
    const buttons = (html.match(/class="fd-cite"/g) || []).length;
    // A range [1–3] renders two buttons for three numbers; count source endpoints the same way.
    const body = prose(text.slice(0, [...text.matchAll(HEADING)].pop().index));
    const endpoints = [...body.matchAll(CITE)]
      .reduce((n, m) => n + m[1].split(/\s*,\s*/).reduce((k, part) => k + Math.min(2, part.split(/\s*[–-]\s*/).length), 0), 0);
    assert.ok(buttons <= endpoints, `${rel}: ${buttons} buttons for ${endpoints} cited numbers`);
    assert.ok(buttons >= Math.ceil(endpoints * 0.9), `${rel}: only ${buttons} of ${endpoints} citations became tappable`);
    const ids = [...html.matchAll(/<li id="fd-ref-(\d+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(ids, numbers, `${rel}: entry ids follow the author's numbers`);
    total += buttons;
  }
  assert.ok(total >= 500, `only ${total} tappable citations across the library`);
});
