/* Deep links, twin navigation, the bookmarklet, and site-aware preview routing.

   The security assertions here are the load-bearing ones. A deep link is the first
   console surface that accepts input from outside the browser session, so every test
   below that names an injection string is checking the same property: the value is only
   ever COMPARED against loaded item keys, never trusted, never reflected, and the
   console's own URL never carries the faculty key, a review token, or a reviewer name. */

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveContentUniverse } from './content-universe.mjs';
import {
  buildBookmarklet,
  buildDeepLink,
  buildExternalReviewUrl,
  buildPreviewRequest,
  normalizeReviewItems,
  parseDeepLink,
  twinOf,
} from './review-model.mjs';

const ROOT = new URL('../', import.meta.url);
const readJson = path => JSON.parse(readFileSync(new URL(path, ROOT), 'utf8'));
const SHIPPED = readJson('13_Faculty_Resources/_automation/site_build/shipped_pages.json');

const MS3_BASE = 'https://une-ms3-psychiatry.netlify.app/';
const RES_BASE = 'https://mmc-psychiatry-residents-sanford.netlify.app/';
const CONSOLE = 'https://clerkship-faculty-attest.netlify.app/';
const TOKEN = '0123456789abcdef0123456789abcdef';

// The real 123-item universe, shaped exactly as the API returns it.
function realItems() {
  return normalizeReviewItems({
    items: deriveContentUniverse({ shipped: SHIPPED })
      .map(item => ({ ...item, status: 'unreviewed' })),
    qbank: [],
  });
}

function itemsFrom(records) {
  return normalizeReviewItems({ items: records, qbank: [] });
}

const SAMPLE = [
  { slug: 't_mood.md', title: 'Mood disorders', kind: 'page', site: 'ms3', status: 'unreviewed' },
  { slug: 'mse.html', title: 'Mental status exam', kind: 'tool', site: 'ms3', status: 'reviewed' },
  {
    slug: 'cotw_20260831_catatonia_ms3.md',
    title: 'Catatonia (Aug 31) — MS3',
    kind: 'page',
    site: 'ms3',
    status: 'unreviewed',
  },
  {
    slug: 'cotw_20260831_catatonia_res.md',
    title: 'Catatonia (Aug 31) — Resident',
    kind: 'page',
    site: 'res',
    status: 'unreviewed',
  },
];

/* ---------------------------------------------------------------- site routing --- */

test('normalizeReviewItems carries site and refuses an unrecognised one', () => {
  const items = itemsFrom(SAMPLE);
  assert.deepEqual(
    items.map(item => `${item.key}@${item.site}`).sort(),
    [
      'page:cotw_20260831_catatonia_ms3.md@ms3',
      'page:cotw_20260831_catatonia_res.md@res',
      'page:t_mood.md@ms3',
      'tool:mse.html@ms3',
    ],
  );
  // Absent means the MS3 site — where every shared page and tool has always lived.
  assert.equal(itemsFrom([{ slug: 'x.md', title: 'X', kind: 'page', status: 'unreviewed' }])[0].site, 'ms3');
  for (const site of ['resident', 'RES', 'ms4', ' ms3 x', 0, {}, []]) {
    assert.throws(
      () => itemsFrom([{ slug: 'x.md', title: 'X', kind: 'page', site, status: 'unreviewed' }]),
      TypeError,
      String(site),
    );
  }
  // Questions live on the MS3 practice tool and say so.
  assert.equal(itemsFrom([]).length, 0);
});

test('a resident twin previews against the resident site, everything else against MS3', () => {
  const items = itemsFrom(SAMPLE);
  const byKey = key => items.find(item => item.key === key);
  const request = item => buildPreviewRequest({
    studentBase: MS3_BASE, residentBase: RES_BASE, item, reviewToken: TOKEN,
  });

  assert.equal(request(byKey('page:cotw_20260831_catatonia_res.md')).origin, new URL(RES_BASE).origin);
  assert.equal(request(byKey('page:cotw_20260831_catatonia_ms3.md')).origin, new URL(MS3_BASE).origin);
  assert.equal(request(byKey('page:t_mood.md')).origin, new URL(MS3_BASE).origin);
  assert.equal(request(byKey('tool:mse.html')).origin, new URL(MS3_BASE).origin);

  // The separate-tab fallback picks the same base.
  assert.ok(buildExternalReviewUrl({
    studentBase: MS3_BASE, residentBase: RES_BASE, item: byKey('page:cotw_20260831_catatonia_res.md'),
  }).startsWith(new URL(RES_BASE).origin));

  // Without a resident base (an older server payload) behaviour is exactly today's.
  assert.equal(
    buildPreviewRequest({ studentBase: MS3_BASE, item: byKey('page:cotw_20260831_catatonia_res.md'), reviewToken: TOKEN }).origin,
    new URL(MS3_BASE).origin,
  );

  // Routing never adds a parameter: the preview URL still carries exactly three.
  const url = new URL(request(byKey('page:cotw_20260831_catatonia_res.md')).url);
  assert.deepEqual([...url.searchParams.keys()], ['page', 'reviewKey', 'reviewToken']);
  assert.equal(url.searchParams.get('page'), 'cotw_20260831_catatonia_res.md');
});

/* ------------------------------------------------------------------ deep links --- */

test('parseDeepLink resolves exactly the key it is given', () => {
  const items = itemsFrom(SAMPLE);
  assert.equal(parseDeepLink('?item=page:t_mood.md', items)?.key, 'page:t_mood.md');
  assert.equal(parseDeepLink('item=tool:mse.html', items)?.key, 'tool:mse.html');
  assert.equal(
    parseDeepLink('?item=page%3Acotw_20260831_catatonia_res.md', items)?.key,
    'page:cotw_20260831_catatonia_res.md',
  );
  // Other parameters are ignored, and the one that matters is still found.
  assert.equal(parseDeepLink('?foo=1&item=page:t_mood.md&bar=2', items)?.key, 'page:t_mood.md');
});

test('parseDeepLink returns null for anything that is not a loaded key', () => {
  const items = itemsFrom(SAMPLE);
  const rejected = [
    '',
    '?item=',
    '?item=page:not_in_the_queue.md',
    '?item=question:qb_moo_901',
    '?item=t_mood.md',
    '?item=page:t_mood.md ',
    '?item=%20page:t_mood.md',
    '?item=PAGE:t_mood.md',
    '?item=page:t_mood.md&item=tool:mse.html',
    '?notitem=page:t_mood.md',
    // Injection shapes. None of these can match a key, and none is ever written to the
    // DOM — the caller selects an item object or shows one fixed notice.
    '?item=<script>alert(1)</script>',
    '?item=javascript:alert(1)',
    '?item=page:<img src=x onerror=alert(1)>',
    "?item=page:t_mood.md';DROP TABLE",
    '?item=../../13_Faculty_Resources/reviewed.json',
    '?item=page:__proto__',
    `?item=page:${'a'.repeat(3000)}.md`,
    `?item=page:t_mood.md&pad=${'x'.repeat(3000)}`,
    null,
    undefined,
    42,
    {},
  ];
  for (const search of rejected) {
    assert.equal(parseDeepLink(search, items), null, String(search));
  }
  assert.equal(parseDeepLink('?item=page:t_mood.md', null), null);
  assert.equal(parseDeepLink('?item=page:t_mood.md', []), null);
});

test('parseDeepLink addresses every one of the 123 real items and nothing else', () => {
  const items = realItems();
  // 123 = 69 shared pages + 22 shared tools + 1 MS3-only tool + 22 Case-of-the-Week
  // twins + 6 resident-only pages + 3 resident-only tools. It was 113 before ADR-002,
  // which is the count of what the manifest and the case registry could see between
  // them; the extra 10 are what the resident build ships and nothing enumerated.
  assert.equal(items.length, 123);
  for (const item of items) {
    assert.equal(parseDeepLink(`?item=${encodeURIComponent(item.key)}`, items)?.key, item.key);
  }
});

test('buildDeepLink carries the item key and structurally nothing else', () => {
  const items = itemsFrom(SAMPLE);
  const item = items.find(candidate => candidate.key === 'page:cotw_20260831_catatonia_res.md');
  const link = buildDeepLink(
    // Every one of these is a value the console must never propagate.
    `${CONSOLE}?reviewToken=${TOKEN}&x-faculty-key=hunter2&attester=Joshua%20Moss&item=page:old.md#frag`,
    item,
  );
  const url = new URL(link);
  assert.deepEqual([...url.searchParams.keys()], ['item']);
  assert.equal(url.searchParams.get('item'), 'page:cotw_20260831_catatonia_res.md');
  assert.equal(url.hash, '');
  for (const secret of ['reviewToken', TOKEN, 'faculty-key', 'hunter2', 'attester', 'Joshua']) {
    assert.ok(!link.includes(secret), `${secret} reached the console URL`);
  }
  // No selection clears the parameter rather than leaving a stale one behind.
  assert.equal(buildDeepLink(`${CONSOLE}?item=page:t_mood.md`, null), CONSOLE);
  assert.throws(() => buildDeepLink('javascript:alert(1)', item), TypeError);
  assert.throws(() => buildDeepLink('file:///etc/passwd', item), TypeError);
});

/* ----------------------------------------------------------------------- twins --- */

test('twinOf pairs all 22 real Case-of-the-Week pages and nothing else', () => {
  const items = realItems();
  const cotw = items.filter(item => /^cotw_\d{8}_[a-z0-9-]+_(ms3|res)\.md$/.test(item.identity));
  assert.equal(cotw.length, 22);
  for (const item of cotw) {
    const twin = twinOf(item, items);
    assert.ok(twin, item.identity);
    assert.notEqual(twin.key, item.key);
    assert.equal(twinOf(twin, items).key, item.key);
    // The pair differs in exactly the level suffix and the site.
    assert.equal(
      item.identity.replace(/_(ms3|res)\.md$/, ''),
      twin.identity.replace(/_(ms3|res)\.md$/, ''),
    );
    assert.notEqual(item.site, twin.site);
  }
  // Non-Case-of-the-Week pages, tools and questions have no twin.
  for (const item of items.filter(candidate => !cotw.includes(candidate))) {
    assert.equal(twinOf(item, items), null, item.key);
  }
});

test('twinOf returns null when the partner is not in the loaded queue', () => {
  const solo = itemsFrom([SAMPLE[0], SAMPLE[2]]);
  const item = solo.find(candidate => candidate.identity === 'cotw_20260831_catatonia_ms3.md');
  assert.equal(twinOf(item, solo), null);
  assert.equal(twinOf(null, solo), null);
  assert.equal(twinOf(item, null), null);
  // A tool whose slug merely looks Case-of-the-Week-ish is still not a twin.
  const decoys = itemsFrom([
    { slug: 'cotw_20260831_catatonia_ms3.md', title: 'Decoy tool', kind: 'tool', site: 'ms3', status: 'unreviewed' },
    SAMPLE[3],
  ]);
  assert.equal(twinOf(decoys.find(i => i.type === 'tool'), decoys), null);
});

test('the twin pair sorts adjacently under the existing title order', () => {
  const items = realItems().filter(item => item.identity.startsWith('cotw_20260831_catatonia'));
  assert.deepEqual(items.map(item => item.title), [
    'Catatonia (Aug 31) — MS3',
    'Catatonia (Aug 31) — Resident',
  ]);
});

/* ----------------------------------------------------------------- bookmarklet --- */

// Runs the bookmarklet the way a browser would: decode the javascript: URL and evaluate
// its source against a stand-in window and location. No jsdom, no dependency.
function runBookmarklet(bookmarklet, search) {
  assert.ok(bookmarklet.startsWith('javascript:'));
  const source = decodeURIComponent(bookmarklet.slice('javascript:'.length));
  const opened = [];
  const win = { open: (...args) => opened.push(args) };
  // eslint-disable-next-line no-new-func
  new Function('window', 'location', 'URLSearchParams', source)(
    win, { search }, URLSearchParams,
  );
  return opened;
}

test('the bookmarklet opens this console on the learner page it was clicked from', () => {
  const bookmarklet = buildBookmarklet(CONSOLE);
  assert.ok(bookmarklet.includes(encodeURIComponent('clerkship-faculty-attest.netlify.app')));
  assert.ok(bookmarklet.length < 600, `bookmarklet is ${bookmarklet.length} characters`);

  assert.deepEqual(runBookmarklet(bookmarklet, '?page=cotw_20260831_catatonia_res.md'), [[
    'https://clerkship-faculty-attest.netlify.app/?item=page%3Acotw_20260831_catatonia_res.md',
    '_blank',
    'noopener',
  ]]);
  assert.equal(
    runBookmarklet(bookmarklet, '?tool=mse.html')[0][0],
    'https://clerkship-faculty-attest.netlify.app/?item=tool%3Amse.html',
  );
  // A learner route with no page or tool opens the queue; it never guesses a slug.
  for (const search of ['', '?', '?reviewItem=qb_moo_901', '?foo=bar']) {
    assert.equal(
      runBookmarklet(bookmarklet, search)[0][0],
      'https://clerkship-faculty-attest.netlify.app/',
      search,
    );
  }
  // A hostile learner URL cannot smuggle anything past encodeURIComponent.
  const hostile = runBookmarklet(bookmarklet, '?page=' + encodeURIComponent('"><script>alert(1)</script>'))[0][0];
  assert.ok(hostile.startsWith('https://clerkship-faculty-attest.netlify.app/?item=page%3A'));
  assert.ok(!hostile.includes('<'));
  assert.ok(!hostile.includes('"'));
});

test('the bookmarklet is bound to the console origin that rendered it', () => {
  // A Netlify preview deploy hands out a bookmarklet pointing at that preview.
  const preview = buildBookmarklet('https://deploy-preview-9--clerkship-faculty-attest.netlify.app/?item=page:x.md');
  assert.equal(
    runBookmarklet(preview, '?page=t_mood.md')[0][0],
    'https://deploy-preview-9--clerkship-faculty-attest.netlify.app/?item=page%3At_mood.md',
  );
  assert.equal(runBookmarklet(buildBookmarklet('http://localhost:4202'), '')[0][0], 'http://localhost:4202/');
  for (const origin of ['javascript:alert(1)', 'file:///tmp', 'not a url', '']) {
    assert.throws(() => buildBookmarklet(origin), TypeError, String(origin));
  }
});
