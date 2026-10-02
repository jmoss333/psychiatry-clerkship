// The pharmacy page, Daily Review and the home counters never surface a drug card whose faculty
// review is invalid.
//
// Layer 1 (Python, 13_Faculty_Resources/_automation/pharmacy/test_build_pharmacy_public.py): the
// build admits a drug to pharmacy_public.json only while its review hash matches its text.
// Layer 2 (this file): every consumer re-checks what it is handed. The page's model code and the
// shell's due counter are executed AS SHIPPED (sliced from the real files, the
// srs-home-counters.test.mjs pattern), against the real build projection and against feeds that
// were tampered with after the build.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const RX = read('13_Faculty_Resources/_automation/site_build/rx_retrieval.js');
const PAGE = read('05_Psychopharmacology/Pharmacy/pharmacy.html');
const SPA = read('13_Faculty_Resources/_automation/site_build/spa_index.html');
const REVIEW = read('07_Evidence_and_Reading/Landmark_Trials/review.html');

function slice(src, a, b) {
  const i = src.indexOf(a); const j = src.indexOf(b, i);
  assert.ok(i !== -1 && j !== -1, `could not locate ${a} .. ${b}`);
  return src.slice(i, j);
}

const model = slice(PAGE, '/* ---- pharmacy page model ----', '/* ---- end pharmacy page model ---- */');
const P = new Function(`${RX}\n${model}\nreturn { rxVerifiedPublic, rxReviewStamped, rxRecallCards,
  rxRevealLines, rxFilterAgents, rxGroupsPresent, rxSections, rxLabelHref };`)();

// The real projection, exactly as build_deploy.py writes it.
const tmp = mkdtempSync(join(tmpdir(), 'rx-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const out = join(tmp, 'pharmacy_public.json');
execFileSync('python3', [new URL('../13_Faculty_Resources/_automation/pharmacy/build_pharmacy_public.py',
  import.meta.url).pathname, '--out', out]);
const FEED = JSON.parse(readFileSync(out, 'utf8'));
const clone = () => JSON.parse(JSON.stringify(FEED));
const unstamped = (a) => { const x = JSON.parse(JSON.stringify(a)); delete x.review; x.id = 'unreviewed'; return x; };

test('the shipped projection verifies, and the page lists exactly its stamped drugs', () => {
  assert.equal(P.rxVerifiedPublic(clone()).agents.length, FEED.agents.length);
  assert.ok(FEED.agents.length > 0, 'at least one reviewed drug ships');
  const listed = P.rxFilterAgents(FEED, '', '').map((a) => a.id).sort();
  assert.deepEqual(listed, FEED.agents.map((a) => a.id).sort());
  for (const a of FEED.agents) assert.ok(P.rxReviewStamped(a), a.id);
});

test('a feed carrying one drug without a faculty review is refused whole', () => {
  const feed = clone(); feed.agents.push(unstamped(feed.agents[0]));
  assert.throws(() => P.rxVerifiedPublic(feed), /without a faculty review/);
  for (const bad of [{}, { reviewer: '' }, { reviewer: 'X' }, { reviewer: 'X', lastReviewed: 'yesterday' }]) {
    const f = clone(); f.agents[0].review = bad;
    assert.throws(() => P.rxVerifiedPublic(f), undefined, JSON.stringify(bad));
  }
});

test('a card for a drug that is not shown is refused, and never becomes a review card', () => {
  const feed = clone();
  feed.cards.push({ ...feed.cards[0], id: 'RX#ghost#boxed', drug: 'ghost' });
  assert.throws(() => P.rxVerifiedPublic(feed), /not backed by a reviewed drug/);
  assert.ok(!P.rxRecallCards(feed).some((c) => c.id === 'RX#ghost#boxed'));
  const mislabeled = clone(); mislabeled.cards[0] = { ...mislabeled.cards[0], id: 'RX#other#boxed' };
  assert.throws(() => P.rxVerifiedPublic(mislabeled));
});

test('even past a bypassed check, an unstamped drug is never listed, rendered, or reviewed', () => {
  const feed = clone(); const ghost = unstamped(feed.agents[0]); feed.agents.push(ghost);
  feed.cards.push({ ...feed.cards[0], id: 'RX#unreviewed#boxed', drug: 'unreviewed' });
  assert.ok(!P.rxFilterAgents(feed, '', '').some((a) => a.id === 'unreviewed'));
  assert.ok(!P.rxFilterAgents(feed, ghost.generic, '').some((a) => a.id === 'unreviewed'));
  assert.deepEqual(P.rxSections(ghost), []);
  assert.ok(!P.rxRecallCards(feed).some((c) => c.id.startsWith('RX#unreviewed#')));
});

test('Daily Review cards are recall, seeded-only, RX#, with labelled verbatim reveals', () => {
  const cards = P.rxRecallCards(FEED);
  assert.equal(cards.length, FEED.cards.length);
  for (const c of cards) {
    assert.match(c.id, /^RX#[^#]+#[^#]+$/);
    assert.equal(c.kind, 'recall'); assert.equal(c.seededOnly, true); assert.equal(c.deck, 'RX');
    const src = FEED.cards.find((x) => x.id === c.id);
    assert.deepEqual(c.reveal, P.rxRevealLines(src));
    for (const block of src.reveal) for (const line of block.lines) {
      assert.ok(c.reveal.includes(`${block.label}: ${line}`), `${c.id} reveals ${line} verbatim`);
    }
  }
});

test('search, group filter, sections and links', () => {
  const a = FEED.agents[0];
  assert.deepEqual(P.rxFilterAgents(FEED, a.generic.toUpperCase(), '').map((x) => x.id)[0], a.id);
  assert.equal(P.rxFilterAgents(FEED, 'zzzz-no-such-drug', '').length, 0);
  assert.ok(P.rxFilterAgents(FEED, '', a.group).every((x) => x.group === a.group));
  assert.ok(P.rxGroupsPresent(FEED).includes(a.group));
  const titles = P.rxSections(a).map((s) => s.title);
  assert.ok(titles.length >= 5, titles.join(' | '));
  assert.ok(P.rxSections(a).every((s) => s.items.length > 0), 'no empty section renders');
  assert.equal(P.rxLabelHref({ dosing: { labelLink: 'javascript:alert(1)' } }), null);
  assert.equal(P.rxLabelHref({ dosing: { labelLink: 'https://evil.example/' } }), null);
});

test('the page renders data only through textContent', () => {
  const script = slice(PAGE, '(function(){', '})();');
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|document\.write/);
});

test('review.html serves RX# from the verified feed, and a withdrawn card goes quiet', () => {
  assert.match(REVIEW, /\/\*__RX_RETRIEVAL__\*\//);
  assert.match(REVIEW, /reviewFetchVerifiedSource\(fetch\("\.\.\/pharmacy_public\.json"\),"pharmacy"\)\.then\(rxVerifiedPublic\)/);
  assert.match(REVIEW, /out=out\.concat\(rxRecallCards\(res\[7\]\|\|\{\}\)\)/);
  assert.match(REVIEW, /'reasoning','pharmacy'\]/, 'the digest key list includes pharmacy');
  const missing = slice(REVIEW, 'function reviewMissingDueIds', '/* ---------- end review lanes');
  const fn = new Function(`${missing}\nreturn reviewMissingDueIds;`)();
  assert.deepEqual(fn([], { cards: { 'RX#gone#boxed': { due: 0 } } }, 10), [],
    'a due RX# card whose drug left the feed must not fail the practice source');
});

// Home counters: an RX# card counts only while the released feed still carries it.
const dueCode = slice(SPA, 'function srsState(', '/* ---- end due breakdown ----');
const servCode = slice(SPA, '/* ---- qb servability (shell parity) ----', '/* ---- end qb servability ----');
function counters(cards, rxDueState) {
  const ls = { getItem: (k) => (k === 'cw_srs_v1' ? JSON.stringify({ v: 1, cards }) : null) };
  return new Function('localStorage', 'rxDueState', `
    var conceptDueState={status:"ready",releasedIds:new Set()};
    function conceptIdEligible(){return false;}
    ${servCode}\n${dueCode}\nreturn {srsBucket:srsBucket,dueBreakdown:dueBreakdown};`)(ls, rxDueState);
}

test('the shell buckets RX# as rx and counts only released cards', () => {
  const live = P.rxRecallCards(FEED)[0].id;
  const cards = { [live]: { due: 1 }, 'RX#withdrawn#boxed': { due: 1 } };
  const ready = counters(cards, { status: 'ready', releasedIds: new Set([live]) });
  assert.equal(ready.srsBucket(live), 'rx');
  const b = ready.dueBreakdown();
  assert.equal(b.rx.due, 1, 'only the released card counts');
  assert.equal(b.other.due, 0, 'RX# never falls through to other');
  const checking = counters(cards, { status: 'checking', releasedIds: null }).dueBreakdown();
  assert.equal(checking.rx.due, 0, 'nothing counts before the feed has loaded and verified');
  const failed = counters(cards, { status: 'unavailable', releasedIds: null }).dueBreakdown();
  assert.equal(failed.rx.due, 0);
});
