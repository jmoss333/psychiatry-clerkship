import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const review = readFileSync(new URL('../07_Evidence_and_Reading/Landmark_Trials/review.html', import.meta.url), 'utf8');
const articleData = JSON.parse(readFileSync(new URL('../07_Evidence_and_Reading/Landmark_Trials/quizzes.json', import.meta.url), 'utf8'));
const laneBegin = review.indexOf('/* ---------- review lanes ---------- */');
const laneEnd = review.indexOf('/* ---------- end review lanes ---------- */', laneBegin);
const freshBegin = review.indexOf('function freshStore(){');
const freshEnd = review.indexOf('/* #324 backfill:', freshBegin);
const begin = review.indexOf('/* ---------- review restore ---------- */');
const end = review.indexOf('/* ---------- end review restore ---------- */', begin);
const restore = begin >= 0 && end > begin
  ? new Function(review.slice(freshBegin, freshEnd) + review.slice(laneBegin, laneEnd) + review.slice(begin, end) + ';return {reviewVerifiedArticles,reviewQbInventoryFromDocument,reviewSourceDigestsFromDocument,reviewVerifySourceBytes,reviewPrepareRestore,reviewApplyRestore};')()
  : {};
const now = 1_800_000_000_000;
const card = (due = now - 1000) => ({ease: 2.5, ivl: 7, reps: 3, lapses: 0, due, last: now - 86_400_000});
const reviews = [
  {id: 'CONCEPT#t_mood@1', q: 'A reviewed concept'},
  {id: 'AR-24#5', q: 'A reviewed article question'},
];
const bank = [
  {id: 'Q-1', retired: false},
  {id: 'Q-old', retired: true},
];
function exported(schema = 'clerkship-study-v2') {
  return JSON.stringify({
    schema, exported_at: '2026-09-27T18:00:00.000Z',
    srs: {
      v: 1,
      cards: {
        'CONCEPT#t_mood@1': card(),
        'AR-24#5': card(now + 86_400_000),
        'QB#Q-1': card(),
        'QB#Q-old': card(),
        'CONCEPT#withdrawn': card(),
      },
      day: {lastDay: '2026-9-27', newToday: 2},
      stats: {streak: 3, lastStudy: '2026-9-27', totalReviews: 12, correct: 8, seen: 12,
        choiceSeen: 10, choiceCorrect: 7, recallSeen: 2, recallGoodEasy: 1},
      settings: {newPerDay: 12, userSet: true},
    },
  });
}

test('an existing study export restores current review and QB schedules and reports retired cards', () => {
  const prepared = restore.reviewPrepareRestore(exported(), reviews, bank, now);
  assert.equal(prepared.reviewCount, 2);
  assert.equal(prepared.qbCount, 1);
  assert.equal(prepared.skippedCount, 2);
  assert.deepEqual(Object.keys(prepared.store.cards).sort(), ['AR-24#5', 'CONCEPT#t_mood@1', 'QB#Q-1']);
  assert.equal(prepared.store.cards['QB#Q-1'].due, now - 1000);
  assert.equal(prepared.store.stats.totalReviews, 12);
  assert.equal(prepared.store.settings.userSet, true);
});

test('review-only backups and older exports with optional statistics omitted remain usable', () => {
  for (const schema of ['clerkship-review-backup-v1', 'clerkship-study-v2']) {
    const payload = JSON.parse(exported(schema));
    delete payload.srs.stats.choiceSeen;
    delete payload.srs.stats.recallSeen;
    delete payload.srs.settings.userSet;
    const prepared = restore.reviewPrepareRestore(JSON.stringify(payload), reviews, bank, now);
    assert.equal(prepared.store.stats.choiceSeen, 0);
    assert.equal(prepared.store.stats.recallSeen, 0);
    assert.equal(prepared.store.settings.newPerDay, 12);
    assert.equal(prepared.reviewCount, 2);
  }
});

test('an imported schedule reopens corrected CATIE wording without erasing its grades', () => {
  const payload = JSON.parse(exported());
  payload.srs.cards['AR-24#5'] = {...card(now + 30 * 86_400_000), reps: 9};
  const catie = articleData.decks.find(deck => deck.id === 'AR-24').questions[5];
  const current = reviews.map(item => item.id === 'AR-24#5' ? {...item, q: catie.q} : item);
  const prepared = restore.reviewPrepareRestore(JSON.stringify(payload), current, bank, now);
  assert.equal(prepared.store.cards['AR-24#5'].due, now);
  assert.equal(prepared.store.cards['AR-24#5'].reps, 9);
  assert.equal(prepared.store.stats.totalReviews, 12);
});

test('bad envelope, version, timestamps, and malformed card fields reject the whole file', () => {
  assert.equal(typeof restore.reviewPrepareRestore, 'function');
  const cases = [
    '{',
    JSON.stringify({...JSON.parse(exported()), schema: 'unknown'}),
    JSON.stringify({...JSON.parse(exported()), srs: {...JSON.parse(exported()).srs, v: 2}}),
    JSON.stringify({...JSON.parse(exported()), exported_at: 'not a date'}),
    JSON.stringify({...JSON.parse(exported()), srs: null}),
  ];
  for (const [field, value] of [['ease', null], ['ivl', -1], ['reps', '3'], ['lapses', -1], ['due', null], ['last', -1]]) {
    const payload = JSON.parse(exported());
    payload.srs.cards['QB#Q-1'][field] = value;
    cases.push(JSON.stringify(payload));
  }
  for (const raw of cases) {
    assert.throws(() => restore.reviewPrepareRestore(raw, reviews, bank, now), Error, raw.slice(0, 60));
  }
});

test('dangerous object keys, missing inventories, and oversized files fail before a write', () => {
  assert.equal(typeof restore.reviewPrepareRestore, 'function');
  const dangerous = exported().replace('"CONCEPT#t_mood@1":', '"__proto__":' + JSON.stringify(card()) + ',"CONCEPT#t_mood@1":');
  assert.throws(() => restore.reviewPrepareRestore(dangerous, reviews, bank, now), Error);
  assert.throws(() => restore.reviewPrepareRestore(exported(), null, bank, now), Error);
  assert.throws(() => restore.reviewPrepareRestore(exported(), reviews, null, now), Error);
  assert.throws(() => restore.reviewPrepareRestore(exported(), reviews, [], now), Error);
  assert.throws(() => restore.reviewPrepareRestore(' '.repeat(10_000_001), reviews, bank, now), Error);
});

test('built question-bank inventory must be present, complete, and unique', () => {
  const doc = items => ({getElementById: () => items === null ? null : {textContent: JSON.stringify(items)}});
  assert.deepEqual(restore.reviewQbInventoryFromDocument(doc(bank)), bank);
  for (const items of [null, [], [{id: 'Q-1', retired: false}, {id: 'Q-1', retired: false}],
    [{id: 'Q-1'}], [{id: '', retired: false}]]) {
    assert.throws(() => restore.reviewQbInventoryFromDocument(doc(items)), Error);
  }
  assert.doesNotMatch(review, /fetch\(['"]\.\.\/question_bank\.json/);
});

test('a coherent but shortened article feed cannot pass the build-bound source check', async () => {
  const original = readFileSync(new URL('../07_Evidence_and_Reading/Landmark_Trials/quizzes.json', import.meta.url));
  const expected = createHash('sha256').update(original).digest('hex');
  const parsed = await restore.reviewVerifySourceBytes(original, expected);
  assert.equal(parsed.questionCount, articleData.questionCount);
  const shortened = {decks: [{...articleData.decks[0], questions: articleData.decks[0].questions.slice(0, 1)}], deckCount: 1, questionCount: 1};
  assert.equal(restore.reviewVerifiedArticles(shortened), shortened);
  const bytes = new TextEncoder().encode(JSON.stringify(shortened));
  await assert.rejects(restore.reviewVerifySourceBytes(bytes, expected), /does not match/);
  assert.match(review, /reviewFetchVerifiedSource\(fetch\("quizzes\.json"\),"articles"\)\.then\(reviewVerifiedArticles\)/);
  for (const [path, key] of [['topic_meta.json', 'topics'], ['family_systems_scenarios.json', 'family'],
    ['communication_cases.json', 'communication'], ['reasoning_cases.json', 'reasoning']]) {
    assert.ok(review.includes(`reviewFetchVerifiedSource(fetch("../${path}"),"${key}")`));
  }
});

test('source digest inventory is required and includes all five current feeds', () => {
  const keys = ['articles', 'topics', 'family', 'communication', 'reasoning'];
  const value = Object.fromEntries(keys.map(key => [key, 'a'.repeat(64)]));
  const doc = contents => ({getElementById: () => contents === null ? null : {textContent: JSON.stringify(contents)}});
  assert.deepEqual(restore.reviewSourceDigestsFromDocument(doc(value)), value);
  assert.throws(() => restore.reviewSourceDigestsFromDocument(doc(null)), Error);
  assert.throws(() => restore.reviewSourceDigestsFromDocument(doc({...value, articles: 'bad'})), Error);
  assert.throws(() => restore.reviewSourceDigestsFromDocument(doc({...value, reasoning: undefined})), Error);
});

test('preview makes no write; replace writes only cw_srs_v1, and a failed write retains old bytes', () => {
  const original = '{"v":1,"cards":{"old":{"due":0}}}';
  const values = new Map([['cw_srs_v1', original], ['cw_progress_v1', 'reading']]);
  const prepared = restore.reviewPrepareRestore(exported(), reviews, bank, now);
  assert.equal(values.get('cw_srs_v1'), original);
  const storage = {setItem(key, value) { values.set(key, value); }};
  restore.reviewApplyRestore(prepared, storage);
  assert.deepEqual(Object.keys(JSON.parse(values.get('cw_srs_v1')).cards).sort(),
    ['AR-24#5', 'CONCEPT#t_mood@1', 'QB#Q-1']);
  assert.equal(values.get('cw_progress_v1'), 'reading');
  values.set('cw_srs_v1', original);
  assert.throws(() => restore.reviewApplyRestore(prepared, {setItem() { throw Error('quota'); }}), /quota/);
  assert.equal(values.get('cw_srs_v1'), original);
});

function dashboard(restoreState, conceptStatus = 'ready') {
  const states = [
    [{id: 'CONCEPT#t_mood@1', deck: 'CONCEPT', kind: 'recall', q: 'A concept', page: 't_mood.md'}],
    conceptStatus, 'all', null, null, false,
    {cards: {}, day: {lastDay: '', newToday: 0}, stats: {streak: 0}, settings: {newPerDay: 12}},
    null, 'light', 0, 'clerkship', 'ready', 'ready', null, 'ready', '', false,
    restoreState,
  ];
  let index = 0;
  const React = {
    createElement: (tag, props, ...children) => ({tag, props, children}),
    useState: initial => [index < states.length ? states[index++] : initial, () => {}],
    useRef: value => ({current: value}),
    useEffect: () => {},
  };
  let js = review.slice(review.indexOf('var e=React.createElement'), review.indexOf('ReactDOM.createRoot'));
  js = js.replace('/*__CONCEPT_RECALL__*/', readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/concept_recall.js', import.meta.url), 'utf8'));
  const storage = {getItem: () => null, setItem: () => { throw Error('render must not write'); }};
  return new Function('React', 'window', 'document', 'localStorage', 'phasePolicy', 'calibLog', 'cwReceipt',
    js + ';return App();')(React, {}, {documentElement: {getAttribute: () => null}}, storage,
    () => ({phase: 'unset'}), () => {}, () => ({html: ''}));
}
function walk(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...(node.children || []).flat(Infinity).flatMap(child => walk(child, predicate))];
}

test('Daily Review offers backup and a two-step restore with a visible skip preview', () => {
  const idle = dashboard(null);
  assert.ok(walk(idle, node => node.tag === 'button' && node.children?.includes('Download review backup')).length);
  assert.ok(walk(idle, node => node.tag === 'input' && node.props?.type === 'file').length);
  assert.equal(walk(idle, node => node.tag === 'button' && node.children?.includes('Replace this browser’s review schedule')).length, 0);
  const preview = dashboard({phase: 'ready', prepared: {store: {}, reviewCount: 2, qbCount: 1, skippedCount: 3}});
  assert.match(JSON.stringify(preview), /3 unavailable cards skipped/);
  assert.ok(walk(preview, node => node.tag === 'button' && node.children?.includes('Replace this browser’s review schedule')).length);
});

test('restore control is unavailable when a required card source is incomplete', () => {
  const tree = dashboard(null, 'unavailable');
  const inputs = walk(tree, node => node.tag === 'input' && node.props?.type === 'file');
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].props.disabled, true);
});

test('the latest selected backup owns the preview even when an older read finishes afterward', async () => {
  const start = review.indexOf('  function chooseRestoreFile(ev){');
  const end = review.indexOf('  function replaceReviewSchedule(){', start);
  assert.ok(start >= 0 && end > start);
  let state;
  const texts = new Map();
  const choose = new Function('cards', 'conceptStatus', 'articleStatus', 'practiceStatus',
    'setRestoreState', 'reviewPrepareRestore', 'reviewQbInventoryFromDocument', 'document', 'restoreRequest',
    review.slice(start, end) + ';return chooseRestoreFile;')(
    reviews, 'ready', 'ready', 'ready', next => { state = next; }, restore.reviewPrepareRestore,
    restore.reviewQbInventoryFromDocument, {getElementById: () => ({textContent: JSON.stringify(bank)})}, {current: 0});
  function select(name) {
    let resolve;
    const text = new Promise(done => { resolve = done; });
    texts.set(name, resolve);
    choose({target: {files: [{name, size: 1000, text: () => text}], value: name}});
  }
  const flush = () => new Promise(done => setTimeout(done, 0));
  select('older.json');
  select('newer.json');
  texts.get('newer.json')(exported());
  await flush();
  assert.equal(state.phase, 'ready');
  assert.equal(state.fileName, 'newer.json');
  texts.get('older.json')(exported());
  await flush();
  assert.equal(state.phase, 'ready');
  assert.equal(state.fileName, 'newer.json');
});
