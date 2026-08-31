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
      fdSearchScore: fdSearchScore, fdSearchTriggerHit: fdSearchTriggerHit,
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

test('the results list announces its count politely (Fresh Eyes Audit A6)', () => {
  // Results updated silently: a screen-reader user typing had no signal that anything changed.
  const html = F.fdSearchOverlay(REAL_INDEX, 'suicide', SYN, {});
  assert.match(html, /class="fd-searchpanel__body"[^>]*aria-live="polite"/);
  assert.match(html, /aria-label="\d+ results?"/);
});

test('the count in the live region matches the number of rows rendered', () => {
  const results = F.fdSearchResults(REAL_INDEX, 'lithium', SYN, {});
  const html = F.fdSearchOverlay(REAL_INDEX, 'lithium', SYN, {});
  assert.match(html, new RegExp(`aria-label="${results.length} results?"`));
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

test('searching a page title exactly returns that page at the head of the whole list', () => {
  // This assertion inverted on 2026-08-28 (Fresh Eyes Audit A1). Protocols used to be matched on
  // the UNFILTERED query, so this query's stopwords brushed all five safety sheets and the exact
  // title landed 6th of 8 -- pressing Enter opened the suicide protocol instead of the page the
  // learner named. The protocol pass now filters stopwords (crisis routing moved to explicit
  // safetyKit triggers), so the title leads the whole list, not just the item block.
  const r = F.fdSearchResults(REAL_INDEX, 'therapy on the unit', SYN, {});
  assert.equal(r[0].kind, 'item');
  assert.equal(r[0].item.title, 'Therapy on the Unit');
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

// ---- protocol reachability: explicit crisis vocabulary, not a stopword accident --------------
// Before 2026-08-28 the ONLY thing routing "i want to kill myself" to pg_suicide.md was the
// stopword "to", substring-matched inside "thoughts" in that page's tldr. The haystack carries
// none of kill/myself/die/suicidal and curriculum.json's synonyms map has no crisis terms, so
// filtering stopwords out of the protocol pass -- as the 2026-08-27 Fresh Eyes Audit recommended
// for its exact-title leak -- returned ZERO protocols for that query. The leak and the crisis
// route were the same mechanism.
//
// safetyKit triggers make the routing explicit. These tests pin the vocabulary, not the accident:
// the "does not depend on any stopword" test below fails if anyone reverts to matching on the
// unfiltered word list.

const protocolRefs = (q) => F.fdSearchResults(REAL_INDEX, q, SYN, {})
  .filter((x) => x.kind === 'protocol').map((x) => x.item.ref);

for (const q of ['i want to kill myself', 'she said she wants to die',
  'patient is suicidal', 'thinking about self harm']) {
  test(`"${q}" reaches the suicide protocol by trigger, not by stopword`, () => {
    assert.ok(protocolRefs(q).includes('pg_suicide.md'), `pg_suicide.md missing for "${q}"`);
  });
}

test('the crisis route does not depend on any stopword in the query', () => {
  // Strip every stopword from a real query and the protocol must STILL be reached: the route is
  // carried by the content words, not by "to"/"a"/"the" wildcard-matching the haystack.
  assert.ok(protocolRefs('kill myself').includes('pg_suicide.md'));         // "i want TO kill myself"
  assert.ok(protocolRefs('want kill myself').includes('pg_suicide.md'));
  assert.ok(protocolRefs('patient suicidal').includes('pg_suicide.md'));    // "patient IS suicidal"
});

test('a trigger matches whole words only, so "diet" does not summon the suicide sheet', () => {
  assert.equal(protocolRefs('diet and nutrition').includes('pg_suicide.md'), false);
});

test('stopwords no longer summon the safety kit for an ordinary content query', () => {
  // The A1 leak: "on"/"the" substring-matched every protocol haystack, so all five ranked above
  // the page the learner named, and pressing Enter opened the suicide sheet.
  assert.deepEqual(protocolRefs('therapy on the unit'), []);
});

test('every safety-kit protocol carries a non-empty trigger vocabulary', () => {
  for (const k of REAL_CUR.safetyKit) {
    assert.ok(Array.isArray(k.triggers) && k.triggers.length > 0, `${k.ref} has no triggers`);
    for (const t of k.triggers) {
      assert.equal(t, t.toLowerCase(), `trigger "${t}" on ${k.ref} must be lowercase`);
      assert.ok(t.trim() === t && t.length > 1, `trigger "${t}" on ${k.ref} is malformed`);
    }
  }
});

test('a natural-language risk disclosure still returns the safety-kit protocol first', () => {
  const r = F.fdSearchResults(REAL_INDEX, 'she said she wants to die', SYN, {});
  assert.ok(r.some((x) => x.kind === 'protocol'),
    'no protocol at all for a plain-language risk disclosure');
  assert.equal(r[0].kind, 'protocol', 'the protocol sheet must lead, not a study-mode tool');
});

test('asking how to talk to a suicidal patient still reaches the suicide protocol sheet', () => {
  const refs = F.fdSearchResults(REAL_INDEX, 'how do i talk to a suicidal patient', SYN, {})
    .map((x) => x.item.ref);
  assert.ok(refs.includes('pg_suicide.md'), `pg_suicide.md missing: ${refs.join(', ')}`);
});

test('"patient wants to leave" still reaches both the suicide and the capacity/AMA sheets', () => {
  const refs = F.fdSearchResults(REAL_INDEX, 'patient wants to leave', SYN, {})
    .map((x) => x.item.ref);
  assert.ok(refs.includes('pg_suicide.md'), `pg_suicide.md missing: ${refs.join(', ')}`);
  assert.ok(refs.includes('exp_consult.md'), `exp_consult.md missing: ${refs.join(', ')}`);
});

test('the item comparator breaks score ties explicitly rather than trusting sort stability', () => {
  // ES5 does not guarantee a stable Array.prototype.sort; an engine that reorders equal scores
  // would reshuffle the tail of every result list, and the cap-at-8 would then drop a different
  // page on different browsers. The tiebreak makes the order a property of the comparator.
  const src = searchSrc.slice(searchSrc.indexOf('itemResults.sort('));
  assert.match(src.slice(0, 400), /_score[\s\S]{0,120}\|\|[\s\S]{0,160}ref/,
    'itemResults.sort must fall back to a ref comparison when scores are equal');
});

// ---- phrase synonyms (Fresh Eyes Audit A5) ----------------------------------------------------
// fdExpandQuery is per-word, and A5's two named gaps cannot be expressed that way without real
// collateral. Measured before building this: a synonym on "first" fixes "first shift" but hijacks
// "first line treatment" and "first episode psychosis" (both push welcome.md above the correct
// page), and "shift" alone still breaks "night shift sleep". The limitation is the mechanism.
//
// Multi-word synonym keys are therefore matched WHOLE-PHRASE against the space-padded raw query —
// the same shape as the safetyKit triggers — so "first shift" expands and "first line treatment"
// does not. Single-word keys are untouched. The collateral queries below are the point of this
// block: they are what a per-word fix would have broken.

const topRefs = (q, n) => F.fdSearchResults(REAL_INDEX, q, SYN, {}).map((r) => r.item.ref).slice(0, n);
const rankOf = (q, ref) => F.fdSearchResults(REAL_INDEX, q, SYN, {})
  .map((r) => r.item.ref).indexOf(ref);

test('"first shift" reaches the orientation trio instead of unrelated pages', () => {
  // Baseline was cases.md, ddx.md, exp_family.md — summary-substring noise, no orientation page.
  assert.ok(rankOf('first shift', 'welcome.md') > -1, `welcome.md missing: ${topRefs('first shift', 5)}`);
});

test('"first day" reaches the orientation trio too', () => {
  assert.ok(rankOf('first day', 'welcome.md') > -1, `welcome.md missing: ${topRefs('first day', 5)}`);
});

test('"patient refuses medication" surfaces Decisional Capacity', () => {
  assert.ok(rankOf('patient refuses medication', 'capacity.html') > -1,
    `capacity.html missing: ${topRefs('patient refuses medication', 5)}`);
});

// ---- the collateral a per-word synonym would have caused --------------------------------------

test('"first line treatment" is untouched — the phrase never matches', () => {
  const refs = topRefs('first line treatment', 3);
  assert.equal(refs.includes('welcome.md'), false, `orientation leaked in: ${refs}`);
  assert.equal(refs[0], 'exp_tx.md');
});

test('"first episode psychosis" is untouched', () => {
  const refs = topRefs('first episode psychosis', 3);
  assert.equal(refs.includes('welcome.md'), false, `orientation leaked in: ${refs}`);
  assert.equal(refs[0], 't_psychosis.md');
});

test('"night shift sleep" is untouched', () => {
  const refs = topRefs('night shift sleep', 3);
  assert.equal(refs.includes('welcome.md'), false, `orientation leaked in: ${refs}`);
  assert.equal(refs[0], 't_sleep.md');
});

// ---- mechanism --------------------------------------------------------------------------------

test('a multi-word synonym key expands only when the whole phrase is present', () => {
  const syn = { 'first shift': 'orientation welcome' };
  assert.match(F.fdExpandQuery('my first shift tomorrow', syn), /orientation welcome/);
  assert.doesNotMatch(F.fdExpandQuery('first line treatment', syn), /orientation/);
  assert.doesNotMatch(F.fdExpandQuery('shift first', syn), /orientation/,
    'word order matters — this is a phrase, not a bag of words');
});

test('single-word synonyms keep working exactly as before', () => {
  assert.match(F.fdExpandQuery('etoh', BRIEF_SYN), /alcohol/);
  assert.match(F.fdExpandQuery('etoh', BRIEF_SYN), /etoh/);
});

test('phrase expansion never summons a safety protocol on its own', () => {
  // Expanded words feed the protocol haystack pass; a phrase must not become a back door into
  // the safety kit, which is trigger-governed (A1).
  for (const q of ['first shift', 'first day']) {
    assert.deepEqual(protocolRefs(q), [], `${q} summoned protocols: ${protocolRefs(q)}`);
  }
});

test('every multi-word synonym key is lowercase and genuinely multi-word', () => {
  for (const key of Object.keys(SYN).filter((k) => k.includes(' '))) {
    assert.equal(key, key.trim().toLowerCase(), `"${key}" must be lowercase and trimmed`);
    assert.ok(key.split(/\s+/).length > 1, `"${key}" is not a phrase`);
  }
});
