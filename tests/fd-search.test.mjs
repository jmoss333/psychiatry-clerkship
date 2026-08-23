// Contract for the Search renderer -- synonym expansion, protocol-first ranking, the cap-at-8
// safety contract, and the ⌘K overlay markup. Evaluates the real snippet body via new Function,
// following tests/fd-library.test.mjs, tests/fd-reader.test.mjs. Concatenated in the same
// dependency order inject_shared_snippets() uses on the built page: phase_policy.js ->
// fd_state.js -> fd_data.js (the join layer fd_search.js's fdBuildIndex comes from) ->
// fd_search.js.
//
// Ranking here is a safety contract, not a preference (task-8-brief.md): a student typing
// "suicide" mid-shift needs the C-SSRS protocol first, not a topic page that merely mentions it.
// REAL_INDEX is built from the repo's real curriculum.json/topic_meta.json (not a fixture) for
// exactly that reason -- a fixture could keep passing after a real protocol quietly stopped
// outranking a real item.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const searchSrc = read('frontdoor/fd_search.js');

function make(governanceBadge) {
  // eslint-disable-next-line no-new-func
  return new Function('governanceBadge', `
    ${read('phase_policy.js')}
    ${read('frontdoor/fd_state.js')}
    ${read('frontdoor/fd_data.js')}
    ${searchSrc}
    return {
      fdExpandQuery: fdExpandQuery, fdSearchResults: fdSearchResults,
      fdSearchOverlay: fdSearchOverlay, fdSearchResultRow: fdSearchResultRow,
      fdBuildIndex: fdBuildIndex, fdSearchContentWords: fdSearchContentWords,
      fdSearchScore: fdSearchScore,
    };
  `)(governanceBadge || function () { return ''; });
}
const F = make();

const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

const readJson = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const REAL_CUR = readJson('../curriculum.json');
const REAL_META = readJson('../topic_meta.json');
const REAL_TOOLS = readJson('../tool_registry.json');
const REAL_MAN = readJson('../13_Faculty_Resources/_automation/site_build/site_manifest.json');
const REAL_MS3_CUR = {
  ...REAL_CUR,
  path: { id: 'ms3-six-week', weekCount: 6 },
  weeks: REAL_CUR.learningPaths.ms3.weeks,
};
const REAL_INDEX = F.fdBuildIndex(REAL_MS3_CUR, REAL_META, REAL_TOOLS, REAL_MAN);
const SYN = REAL_CUR.synonyms;

// ---- fdExpandQuery -- pinned test code from task-8-brief.md, verbatim -------------------------

const BRIEF_SYN = { etoh: 'alcohol withdrawal ciwa', si: 'suicide risk ideation' };

test('a known abbreviation expands, an unknown word is left alone', () => {
  assert.match(F.fdExpandQuery('etoh', BRIEF_SYN), /alcohol/);
  assert.match(F.fdExpandQuery('etoh', BRIEF_SYN), /etoh/, 'the original term must survive expansion');
  assert.equal(F.fdExpandQuery('pneumonia', BRIEF_SYN), 'pneumonia');
});

test('expansion is per-word, so a multi-word query expands each term', () => {
  const out = F.fdExpandQuery('etoh si', BRIEF_SYN);
  assert.match(out, /alcohol/);
  assert.match(out, /ideation/);
});

// ---- fdSearchResults -- pinned test code from task-8-brief.md, verbatim -----------------------

test('protocols rank ahead of ordinary items for the same query', () => {
  const r = F.fdSearchResults(REAL_INDEX, 'suicide', SYN, {});
  assert.equal(r[0].kind, 'protocol',
    'a student typing "suicide" mid-shift needs the protocol first, not a topic page');
});

test('results are capped at 8 however many match', () => {
  assert.ok(F.fdSearchResults(REAL_INDEX, 'a', SYN, {}).length <= 8);
});

test('a query matching nothing returns an empty list rather than throwing', () => {
  assert.deepEqual(F.fdSearchResults(REAL_INDEX, 'zzzzqqq', SYN, {}), []);
});

test('the empty-state message escapes the user query', () => {
  const html = F.fdSearchOverlay(REAL_INDEX, '<img src=x onerror=1>', SYN, {});
  assert.doesNotMatch(html, /<img/, 'the query is echoed back into the empty state');
});

// ---- additional coverage this task's brief asked for: matching over title + ref + summary -----

test('matches via title alone (ref and summary do not contain the query)', () => {
  const r = F.fdSearchResults(REAL_INDEX, 'mental status', SYN, {});
  assert.ok(r.some((x) => x.item.ref === 'mse.html'),
    '"Mental Status Exam" only appears in mse.html’s title');
});

test('matches via ref alone', () => {
  const r = F.fdSearchResults(REAL_INDEX, 't_sud', SYN, {});
  assert.ok(r.some((x) => x.item.ref === 't_sud.md'));
});

test('matches via summary alone (word appears in tldr, not title or ref)', () => {
  const r = F.fdSearchResults(REAL_INDEX, 'orientation', SYN, {});
  assert.ok(r.some((x) => x.item.ref === 'welcome.md'),
    '"orientation" only appears in welcome.md’s tldr');
});

// ---- protocol/item dedup (repo-specific: safetyKit refs are ALSO regular week items) ----------

test('a ref that is both a safety-kit protocol and a regular item is returned only once', () => {
  const r = F.fdSearchResults(REAL_INDEX, 'suicide', SYN, {});
  const hits = r.filter((x) => x.item.ref === 'pg_suicide.md');
  assert.equal(hits.length, 1, 'pg_suicide.md is week-1 content AND a safety-kit ref -- must not double-list');
  assert.equal(hits[0].kind, 'protocol');
});

// ---- empty-query defaults ------------------------------------------------------------------

test('empty query with no week set: 5 protocols then the 3 pinned reference tools, capped exactly at 8', () => {
  const r = F.fdSearchResults(REAL_INDEX, '', SYN, {});
  assert.equal(r.length, 8);
  for (let i = 0; i < 5; i++) assert.equal(r[i].kind, 'protocol', `result ${i} should be a protocol`);
  assert.deepEqual(r.slice(0, 5).map((x) => x.item.ref), REAL_CUR.safetyKit.map((k) => k.ref));
  assert.deepEqual(r.slice(5).map((x) => x.item.ref), ['mse.html', 'withdrawal.html', 'pg_interview.md']);
});

test('empty query with a week set: next-unread item slots in after the protocols; the cap still drops the tail', () => {
  const r = F.fdSearchResults(REAL_INDEX, '', SYN, { week: 1, done: {} });
  assert.equal(r.length, 8, 'cap holds: 5 protocols + next-unread + 3 pinned = 9 raw candidates');
  assert.deepEqual(r.slice(0, 5).map((x) => x.item.ref), REAL_CUR.safetyKit.map((k) => k.ref));
  assert.equal(r[5].item.ref, 'welcome.md', 'first item in week 1, nothing done yet');
  assert.equal(r[5].kind, 'item');
  assert.deepEqual(r.slice(6).map((x) => x.item.ref), ['mse.html', 'withdrawal.html'],
    'the cap drops the LAST pinned tool (pg_interview.md), matching the prototype’s own slice(0,8) behaviour');
});

test('empty query never throws on a missing index (undefined defaults like every sibling renderer)', () => {
  assert.deepEqual(F.fdSearchResults(undefined, '', {}, {}), []);
});

// ---- fdSearchOverlay markup ------------------------------------------------------------------

test('renders the panel skeleton with input, esc button, and footer copy', () => {
  const html = F.fdSearchOverlay(REAL_INDEX, '', SYN, {});
  assert.match(html, /^<div class="fd-search"(?:\s|>)/);
  assert.match(html, /<div class="fd-searchpanel">/);
  assert.match(html, /<input type="text" class="fd-searchpanel__input" value=""/);
  assert.match(html, /<button type="button" class="fd-searchpanel__esc" data-fd-close-search(?:\s[^>]*)?>esc<\/button>/);
  assert.match(html, /<div class="fd-searchpanel__foot">↵ opens as a side sheet/);
});

test('the current query round-trips into the input value, escaped', () => {
  const html = F.fdSearchOverlay(REAL_INDEX, 'ciwa "quotes"', SYN, {});
  assert.match(html, /value="ciwa &quot;quotes&quot;"/);
});

test('a protocol result carries data-fd-safety, not data-fd-open', () => {
  const html = F.fdSearchOverlay(REAL_INDEX, 'suicide', SYN, {});
  assert.match(html, /<button type="button" class="fd-result" data-fd-safety="pg_suicide\.md">/);
});

test('an item result carries data-fd-open plus the data-fd-sheet modifier -- never a bare data-fd-open', () => {
  const html = F.fdSearchOverlay(REAL_INDEX, 'mental status', SYN, {});
  assert.match(html, /<button type="button" class="fd-result" data-fd-open="mse\.html" data-fd-sheet>/);
});

test('search rows pass projected governance to the shared badge helper between title and meta', () => {
  const calls = [];
  const G = make((triplet) => {
    calls.push(triplet);
    if (!triplet || triplet.status === 'reviewed') return '';
    return triplet.riskLevel === 'high'
      ? '<span class="governance-badge high">Pending review · High risk</span>'
      : '<span class="governance-badge">Pending review</span>';
  });
  const high = G.fdSearchResultRow({
    item: { ref: 'high.html', kind: 'tool', title: 'High item', governance: { status: 'pending', riskKind: 'clinical', riskLevel: 'high' } },
    kind: 'item', meta: 'tool',
  });
  const ordinary = G.fdSearchResultRow({
    item: { ref: 'ordinary.md', kind: 'read', title: 'Ordinary item', governance: { status: 'pending', riskKind: 'general', riskLevel: 'low' } },
    kind: 'item', meta: 'read',
  });
  const reviewed = G.fdSearchResultRow({
    item: { ref: 'reviewed.md', kind: 'read', title: 'Reviewed item', governance: { status: 'reviewed', riskKind: 'general', riskLevel: 'low' } },
    kind: 'item', meta: 'read',
  });

  assert.deepEqual(calls, [
    { status: 'pending', riskKind: 'clinical', riskLevel: 'high' },
    { status: 'pending', riskKind: 'general', riskLevel: 'low' },
    { status: 'reviewed', riskKind: 'general', riskLevel: 'low' },
  ]);
  assert.match(high, /fd-result__title">High item<\/span><span class="governance-badge high">Pending review · High risk<\/span><span class="fd-result__meta">tool<\/span>/);
  assert.match(ordinary, /fd-result__title">Ordinary item<\/span><span class="governance-badge">Pending review<\/span><span class="fd-result__meta">read<\/span>/);
  assert.doesNotMatch(reviewed, /governance-badge/);
});

test('result dot classes: is-safety for protocols, is-tool for tool items, bare for reads', () => {
  const html = F.fdSearchOverlay(REAL_INDEX, '', SYN, {});
  assert.match(html, /<span class="fd-result__dot is-safety"><\/span>/, 'at least one protocol dot');
  assert.match(html, /<span class="fd-result__dot is-tool"><\/span>/, 'mse.html/withdrawal.html are tools');
});

test('no-results empty state only replaces results for a non-empty query that matches nothing', () => {
  const html = F.fdSearchOverlay(REAL_INDEX, 'zzzzqqq', SYN, {});
  assert.match(html, /<div class="fd-searchpanel__empty">Nothing for “zzzzqqq” — try a symptom, scale, or drug class\.<\/div>/);
  assert.doesNotMatch(html, /class="fd-result"/);
});

test('empty query never shows the no-results state (defaults always populate it)', () => {
  const html = F.fdSearchOverlay(REAL_INDEX, '', SYN, {});
  assert.doesNotMatch(html, /fd-searchpanel__empty/);
});

test('the search overlay is a labelled modal dialog and its close control is named', () => {
  const html = F.fdSearchOverlay(REAL_INDEX, '', SYN, {});
  assert.match(html, /^<div class="fd-search" role="dialog" aria-modal="true" aria-label="Search">/,
    'the full-screen search host is the modal surface');
  assert.match(html,
    /class="fd-searchpanel__esc" data-fd-close-search aria-label="Close search">esc<\/button>/,
    'the keyboard-looking close control must retain an explicit name');
});

// ---- purity / audience-neutral / no raw hex ---------------------------------------------------

test('fd_search.js touches no DOM, storage, or clock, and stays ES5', () => {
  assert.doesNotMatch(searchSrc, /localStorage\.|document\.|window\.|Date\.now\(\)/,
    'fd_search.js must stay a pure function of (index, query, synonyms, state)');
  assert.doesNotMatch(searchSrc, /\bconst\s|\blet\s|=>/,
    'fd_search.js is a build-injected snippet, not a module -- ES5 only (var/function)');
});

test('no rendered output carries an audience-specific token', () => {
  const html = F.fdSearchOverlay(REAL_INDEX, '', SYN, {});
  assert.doesNotMatch(html, AUDIENCE_TOKEN_RE);
});

test('no raw hex in emitted markup', () => {
  const html = F.fdSearchOverlay(REAL_INDEX, '', SYN, {});
  assert.doesNotMatch(html, /#[0-9a-fA-F]{3,6}/);
});

test('synonyms are not hardcoded -- an empty synonym map falls back to plain substring matching', () => {
  const withSyn = F.fdSearchResults(REAL_INDEX, 'etoh', SYN, {});
  const withoutSyn = F.fdSearchResults(REAL_INDEX, 'etoh', {}, {});
  assert.ok(withSyn.length >= withoutSyn.length,
    'the real synonyms map should never find FEWER results than no synonyms at all');
});

// ---- relevance ranking (Taplinger UX remediation, F2) ----------------------------------------

const titles = (q) => F.fdSearchResults(REAL_INDEX, q, SYN, {}).map((r) => r.item.title);

test('searching a page title exactly returns that page first', () => {
  assert.equal(titles('therapy on the unit')[0], 'Therapy on the Unit');
});

test('a one-word topic query surfaces the attested pages for that topic', () => {
  const t = titles('therapy');
  assert.ok(t.includes('Therapy on the Unit'), 'Therapy on the Unit missing from "therapy"');
  assert.ok(t.includes('The Therapy Reading Room'), 'The Therapy Reading Room missing from "therapy"');
});

test('stopwords do not displace content matches in a multi-word query', () => {
  // "on" alone matched 70 of 83 items before the guard, and "the" 59, so every item result
  // for this query used to be a stopword accident. Verified: all item results now contain
  // the content word.
  const items = F.fdSearchResults(REAL_INDEX, 'therapy on the unit', SYN, {})
    .filter((r) => r.kind === 'item');
  assert.ok(items.length > 0);
  for (const r of items) {
    const hay = `${r.item.title} ${r.item.ref} ${r.item.summary}`.toLowerCase();
    assert.ok(hay.includes('therapy'), `stopword-only match leaked in: ${r.item.title}`);
  }
});

test('an all-stopword query degrades to protocol-first rather than exploding', () => {
  // fdSearchContentWords never returns empty, so a query with no topic signal keeps its
  // words rather than silently matching nothing -- and the safety contract still governs
  // what surfaces first.
  assert.equal(F.fdSearchResults(REAL_INDEX, 'on', SYN, {})[0].kind, 'protocol');
});

test('protocols still rank ahead of ordinary items after scoring', () => {
  // Regression guard for the safety contract -- scoring reorders items, never protocols.
  const r = F.fdSearchResults(REAL_INDEX, 'suicide', SYN, {});
  assert.equal(r[0].kind, 'protocol');
});

test('scoring does not break the cap-at-8 contract', () => {
  assert.ok(F.fdSearchResults(REAL_INDEX, 'a', SYN, {}).length <= 8);
});
