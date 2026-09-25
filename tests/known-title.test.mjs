// A page the site knows but does not index still has a title.
//
// curriculum.libraryExclude registers pages that ship and are reachable but are deliberately
// absent from the Library projection: the feedback form, the faculty curator, the week pages,
// the rp-* trainers. fdBuildIndex marks them `known` so a direct link is not a not-found — but
// every reader-side fallback then synthesized {title: ref}, so opening ?tool=feedback.html
// painted "feedback.html" as the page heading, the iframe's title and the document title
// (2026-09-18 critique; measured on production). The site manifest has carried "Improve this
// library — send feedback" for that page all along. The index now exposes the manifest titles
// and one helper, fdKnownItem, builds the fallback item for every call site.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const shell = read('spa_index.html');

// eslint-disable-next-line no-new-func
const make = new Function(`
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_today.js')}
  ${read('frontdoor/fd_block.js')}
  ${read('frontdoor/fd_reader.js')}
  ${read('frontdoor/fd_shell.js')}
  ${read('frontdoor/fd_wire.js')}
  return { fdBuildIndex, fdKnownItem, fdReader, fdOpenResource };
`);
const F = make();

const CUR = {
  path: { id: 'fixture', weekCount: 1 },
  weeks: [{ n: 1, title: 'W1', theme: 't', focusCategories: [], items: [{ ref: 'a.md', kind: 'read' }] }],
  libraryColumns: [{ name: 'Col', accent: 'topic', refs: ['a.md'] }],
  libraryExclude: [{ ref: 'feedback.html', reason: 'a form' }, { ref: 'week1.md', reason: 'landing' }],
  safetyKit: [],
};
const META = { 'a.md': { read: 3, tldr: 'A.' } };
const TOOLS = { tools: [{ file: 'feedback.html', title: 'Feedback', category: 'faculty', riskLevel: 'low' }] };
const MAN = {
  tools: [['src/feedback.html', 'feedback.html', 'Improve this library — send feedback']],
  md: [['src/a.md', 'a.md', 'Page A'], ['src/week1.md', 'week1.md', 'Week 1 — Foundations']],
};

test('the index exposes manifest titles for every manifest entry, indexed or not', () => {
  const idx = F.fdBuildIndex(CUR, META, TOOLS, MAN);
  assert.equal(idx.known['feedback.html'], true, 'fixture premise: excluded pages are known');
  assert.equal(idx.byRef['feedback.html'], undefined, 'fixture premise: and absent from byRef');
  assert.equal(idx.titles['feedback.html'], 'Improve this library — send feedback');
  assert.equal(idx.titles['a.md'], 'Page A');
});

test('fdKnownItem builds the fallback item with the manifest title, and tolerates a bare index', () => {
  const idx = F.fdBuildIndex(CUR, META, TOOLS, MAN);
  const item = F.fdKnownItem(idx, 'feedback.html');
  assert.equal(item.title, 'Improve this library — send feedback');
  assert.equal(item.kind, 'tool', 'kind is inferred from the extension when the caller has none');
  assert.equal(item.ref, 'feedback.html');
  assert.equal(F.fdKnownItem({ byRef: {} }, 'ghost.html').title, 'ghost.html', 'no manifest -> the ref, as before');
  assert.equal(F.fdKnownItem(idx, 'x.md', 'read').kind, 'read');
});

test('the Reader titles a known-but-unindexed page by its manifest title, never its slug', () => {
  const idx = F.fdBuildIndex(CUR, META, TOOLS, MAN);
  const html = F.fdReader(idx, { ref: 'feedback.html', week: 1, done: {} }, '<iframe class="toolframe"></iframe>');
  assert.match(html, /<h1 class="fd-article__h1">Improve this library — send feedback<\/h1>/);
  assert.doesNotMatch(html, /fd-article__h1">feedback\.html</);
  assert.doesNotMatch(html, /fd-reader--notfound/, 'a known page is never the not-found surface');
});

test('the live open path and the resource mount consult the same helper', () => {
  const live = shell.slice(shell.indexOf('function fdOpenResourceLive(ref,opts)'), shell.indexOf('function fdOpenRef(ref,search)'));
  assert.match(live, /typeof fdKnownItem==='function'\?fdKnownItem\(FD_INDEX,ref\)/);
  // The literal {title:ref,…} survives only as the typeof-guarded fallback for harnesses that
  // evaluate the live path without fd_data.js (tests/fd-resource.test.mjs); the helper wins in the page.
  const wire = read('frontdoor/fd_wire.js');
  assert.match(wire, /typeof fdKnownItem==='function'\?fdKnownItem\(index,ref,request\.kind\)/);
});
