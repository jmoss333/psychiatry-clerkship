import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The field guide's bold-lead detector (Next Ten #10). 38 teaching pages have no H2; their
// sections open with a paragraph led by a bold label. The browser suite proves the promoted
// sections on real pages; this pins the rule itself, including the sentences it must refuse.
const guide = readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_guide.js',
  import.meta.url), 'utf8');
// eslint-disable-next-line no-new-func
const G = new Function(`${guide}\nreturn { fdGuideLeadLabel, fdGuideLeads, FD_GUIDE_LEAD_MIN, FD_GUIDE_LEAD_MIN_WORDS };`)();

// Minimal DOM: element children, text nodes, sibling links, textContent, and matches /
// querySelector over selector lists of bare tags and single classes (all the detector uses).
function text(value) { return { nodeType: 3, nodeValue: value, get textContent() { return value; } }; }
function el(tag, ...kids) {
  const [tagName, className = ''] = tag.split('.');
  const childNodes = kids.map((k) => (typeof k === 'string' ? text(k) : k));
  childNodes.forEach((node, i) => { node.nextSibling = childNodes[i + 1] || null; });
  const node = {
    nodeType: 1, tagName: tagName.toUpperCase(), className, childNodes,
    get firstChild() { return childNodes[0] || null; },
    get children() { return childNodes.filter((c) => c.nodeType === 1); },
    get textContent() { return childNodes.map((c) => c.textContent).join(''); },
    matches(selector) {
      return selector.split(',').some((s) => (s.startsWith('.') ? className === s.slice(1)
        : this.tagName === s.toUpperCase()));
    },
    querySelector(selector) {
      for (const child of this.children) {
        if (child.matches(selector)) return child;
        const found = child.querySelector(selector);
        if (found) return found;
      }
      return null;
    },
  };
  return node;
}
const p = (...kids) => el('p', ...kids);
const b = (label) => el('strong', label);
const prose = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

test('a bold label with a separator, a closing stop, or standing alone is a section lead', () => {
  assert.equal(G.fdGuideLeadLabel(p(b('Initial workup'), ' — Keep it focused.')), 'Initial workup');
  assert.equal(G.fdGuideLeadLabel(p(b('Management.'), ' Non-pharmacologic measures first.')), 'Management');
  assert.equal(G.fdGuideLeadLabel(p(b('Pair with:'), ' the MSE tool.')), 'Pair with');
  assert.equal(G.fdGuideLeadLabel(p(b('Pair with'), ': the MSE tool.')), 'Pair with');
  assert.equal(G.fdGuideLeadLabel(p(b('What the student does'), ' —')), 'What the student does');
  assert.equal(G.fdGuideLeadLabel(p(b('High-yield pearls.'))), 'High-yield pearls');
  assert.equal(G.fdGuideLeadLabel(p('\n  ', b('Grief vs depression anchor'), ' – Normal bereavement…')),
    'Grief vs depression anchor', 'leading whitespace and an en dash are allowed');
  assert.equal(G.fdGuideLeadLabel(p(el('b', 'Legacy bold'), ' — text')), 'Legacy bold');
});

test('a bold word that opens a sentence, or bold that is not first, is not a section', () => {
  assert.equal(G.fdGuideLeadLabel(p(b('Never'), ' leave a patient on 1:1 without a plan.')), '',
    'no separator: emphasis, not a label');
  assert.equal(G.fdGuideLeadLabel(p(b('Pair with'), ' the Differential Diagnosis scaffolds.')), '');
  assert.equal(G.fdGuideLeadLabel(p('Check ', b('vitals'), ' — every shift.')), '', 'bold must lead');
  assert.equal(G.fdGuideLeadLabel(p(el('em', 'Note'), ' — italic is not a label.')), '');
  assert.equal(G.fdGuideLeadLabel(el('li', b('List item'), ' — not a paragraph.')), '');
  assert.equal(G.fdGuideLeadLabel(p(b('X'), ' — too short.')), '');
  assert.equal(G.fdGuideLeadLabel(p(b('y'.repeat(81)), ' — too long for a label.')), '');
});

test('a page qualifies only with no H2 anywhere, enough leads, and enough words', () => {
  assert.equal(G.FD_GUIDE_LEAD_MIN, 4);
  assert.equal(G.FD_GUIDE_LEAD_MIN_WORDS, 500);
  const sections = (n, words) => Array.from({ length: n }, (_, i) =>
    [p(b(`Section ${i + 1}`), ` — ${prose(words)}`), el('ul', el('li', 'detail'))]).flat();

  const long = el('div', p('Intro paragraph.'), ...sections(5, 120));
  const leads = G.fdGuideLeads(long);
  assert.equal(leads.length, 5);
  assert.deepEqual(leads.map((node) => G.fdGuideLeadLabel(node)),
    ['Section 1', 'Section 2', 'Section 3', 'Section 4', 'Section 5']);

  assert.deepEqual(G.fdGuideLeads(el('div', ...sections(3, 250))), [], 'three leads are not enough');
  assert.deepEqual(G.fdGuideLeads(el('div', ...sections(6, 40))), [],
    'a short week page with many leads stays plain');
  assert.deepEqual(G.fdGuideLeads(el('div', el('section', el('h2', 'Six-Week Compass')), ...sections(5, 120))), [],
    'an embedded component heading keeps the page out of lead mode');
  // The reader's chrome rides on every page and is not authored length: a week page with a
  // governance receipt, a practice panel, a crisis block and a feedback link stays plain.
  const chrome = (n) => p(prose(n));
  const week = el('div', el('div.governance-notice', chrome(40)), el('div.topic-tpl', chrome(120)),
    ...sections(6, 60), el('blockquote', el('div.crisis-block-hook'), chrome(80)), el('div.pgfb', chrome(10)));
  assert.deepEqual(G.fdGuideLeads(week), [], 'about 420 authored words stay under the floor');
  const notice = el('div', el('div.governance-notice', el('h2', 'Notice')), ...sections(5, 120));
  assert.equal(G.fdGuideLeads(notice).length, 5, 'a heading inside chrome does not disqualify the page');
  const nested = el('div', el('blockquote', ...sections(5, 120)));
  assert.deepEqual(G.fdGuideLeads(nested), [], 'only direct children of the body can open a section');
  assert.deepEqual(G.fdGuideLeads(null), []);
});
