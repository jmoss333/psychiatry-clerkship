// "Beyond this page" (README_MEDIA.md M2) -- the Reader's optional podcast/book block.
//
// Two kinds of fixture, never the live governance state:
//  - hand-written media indexes for the renderer's structure, states and placement;
//  - an END-TO-END fixture: media_index.py resolves the LIVE map with its status flipped to
//    "approved" IN MEMORY (the file is never written), over the live libraries and topic_meta.json,
//    so the guidance lines asserted below are read from data rather than retyped here.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BUILD = '../13_Faculty_Resources/_automation/site_build';
const read = (p) => readFileSync(new URL(`${BUILD}/${p}`, import.meta.url), 'utf8');
const readerSrc = read('frontdoor/fd_reader.js');
const spa = read('spa_index.html');

// eslint-disable-next-line no-new-func
const F = new Function(`
  ${read('phase_policy.js')}
  ${read('frontdoor/fd_state.js')}
  ${read('frontdoor/fd_data.js')}
  ${read('frontdoor/fd_today.js')}
  ${read('frontdoor/fd_block.js')}
  ${readerSrc}
  return { fdReader: fdReader, fdBuildIndex: fdBuildIndex, fdReaderMedia: fdReaderMedia };
`)();

const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;
const unescape = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const CUR = {
  weeks: [{ n: 2, title: 'Mood', theme: 'T', items: [{ ref: 't_mood.md', kind: 'read' }, { ref: 'b.md', kind: 'read' }] }],
  libraryColumns: [{ name: 'Col', accent: 'topic', refs: ['t_mood.md', 'b.md', 'delirium.md', 'family-systems.html'] }],
  libraryExclude: [],
  safetyKit: [{ ref: 'delirium.md', sub: 'Vitals', triggers: [] }],
  roles: { ms3: [], resident: [] },
  synonyms: {},
};
const META = { 't_mood.md': { read: 6, tldr: 'Mood' }, 'b.md': { read: 3, tldr: 'B' }, 'delirium.md': { read: 4, tldr: 'D' } };
const TOOLS = { tools: [{ file: 'family-systems.html', title: 'Family Systems Practice', category: 'family' }] };
const MAN = {
  tools: [['src/f.html', 'family-systems.html', 'Family Systems Practice']],
  md: [['src/m.md', 't_mood.md', 'Mood Disorders'], ['src/b.md', 'b.md', 'Page B'], ['src/d.md', 'delirium.md', 'Delirium']],
};
const IDX = F.fdBuildIndex(CUR, META, TOOLS, MAN);
const state = (over) => Object.assign({ ref: 't_mood.md', week: 2, fromTab: 'today', done: {}, desk: true }, over);

const EP = { n: 25, title: 'Ep <Title>', category: 'Mood & bipolar; suicide', url: 'https://www.youtube.com/watch?v=vBeB6V-KA70' };
const BK = { isbn: '9781608822195', title: 'Book One', author: 'A. Author', description: 'Desc.', category: 'Mood, bipolar & depression', anchor: 'mood-bipolar-depression' };
const GUIDANCE = { familySay: "SAY 'q'", familySafety: 'BOOK SAFETY', listenSay: 'POD SAY', listenSafety: 'POD SAFETY' };
const entry = (over) => Object.assign({
  week: 2, listen: [EP],
  listenAll: { ref: 'podcast_library.md', category: 'Mood & bipolar; suicide', anchor: 'mood-bipolar-suicide' },
  family: [BK],
  familyAll: { ref: 'book_library.md', category: 'Mood, bipolar & depression', anchor: 'mood-bipolar-depression' },
  practiceRef: 'family-systems.html',
}, over);
const media = (pages) => ({ version: 1, site: 'ms3', status: 'approved', guidance: GUIDANCE, pages });
const render = (m, over, body) => F.fdReader(IDX, state(Object.assign({ thread: { media: m } }, over)), body || '<p>Body</p>');
const section = (html) => (html.match(/<section class="fd-beyond[\s\S]*?<\/section>/) || [''])[0];

function liveApprovedIndex(site) {
  const py = [
    'import json, sys',
    "sys.path.insert(0, '13_Faculty_Resources/_automation/site_build')",
    'import media_index as m',
    "mm, e, b, t, s = m.load_inputs('.')",
    "mm['status'] = 'approved'",
    `print(json.dumps(m.resolve(mm, e, b, t, s, ${JSON.stringify(site)})))`,
  ].join('\n');
  const run = spawnSync('python3', ['-c', py], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

// ---- placement and presence ---------------------------------------------------------------------

test('the block renders after "Next in this thread" and before the prev/next footer', () => {
  const html = render(media({ 't_mood.md': entry() }));
  const at = html.indexOf('<section class="fd-beyond"');
  assert.ok(at > 0, 'block present');
  assert.ok(html.indexOf('class="fd-nextthread"') < at, 'after Next in this thread');
  assert.ok(at < html.indexOf('class="fd-prevnext"'), 'before the page footer');
  assert.match(section(html), /aria-labelledby="fd-beyond-title"/);
  assert.match(section(html), /<h2 class="fd-beyond__title" id="fd-beyond-title">Beyond this page<\/h2>/);
  assert.match(section(html), /<span class="fd-beyond__tag">Suggested, not required<\/span>/);
});

test('no entry, no index, a draft index, or a tool: nothing renders and there is no empty state', () => {
  assert.doesNotMatch(render(media({ 'other.md': entry() })), /fd-beyond/);
  assert.doesNotMatch(render(null), /fd-beyond/);
  assert.doesNotMatch(render({ version: 1, site: 'ms3', status: 'draft', pages: {} }), /fd-beyond/);
  assert.doesNotMatch(F.fdReader(IDX, state({ ref: 'family-systems.html', thread: { media: media({ 'family-systems.html': entry() }) } }), ''),
    /fd-beyond/, 'reads only');
  assert.doesNotMatch(render(media({ 't_mood.md': entry({ listen: [], family: [] }) })), /fd-beyond/);
});

test('a page carrying the crisis block never gets the block above it', () => {
  const body = '<p>x</p><div class="crisis-block-hook"></div><section class="crisis-block">contacts</section><p>y</p>';
  const html = render(media({ 't_mood.md': entry() }), {}, body);
  assert.ok(html.indexOf('crisis-block-hook') < html.indexOf('<section class="fd-beyond"'));
  const notice = '<div class="governance-notice pending-compact">Pending</div>';
  const pending = render(media({ 't_mood.md': entry() }), {}, notice + '<p>Body</p>');
  assert.match(pending, /fd-beyond/, 'a pending page still shows the optional block');
  assert.doesNotMatch(pending.match(/<div class="governance-notice[\s\S]*?<\/div>/)[0], /fd-beyond/,
    'never inside a governance notice');
});

// ---- the switch -----------------------------------------------------------------------------------

test('both sides: a two-button switch, "For you" pressed, the family panel hidden', () => {
  const html = section(render(media({ 't_mood.md': entry() })));
  assert.match(html, /<div class="fd-beyond__switch" role="group" aria-label="Who it is for">/);
  assert.match(html, /data-media-side="listen" aria-pressed="true" aria-controls="fd-beyond-listen">For you · listen</);
  assert.match(html, /data-media-side="family" aria-pressed="false" aria-controls="fd-beyond-family">For the family · read</);
  assert.match(html, /id="fd-beyond-listen" data-media-panel="listen">/);
  assert.match(html, /id="fd-beyond-family" data-media-panel="family" hidden>/);
  assert.doesNotMatch(html, /data-fd-/, 'no controller action: the switch is transient DOM state');
});

test('one side empty: no switch, that side only, never padded', () => {
  const listenOnly = section(render(media({ 't_mood.md': entry({ family: undefined, familyAll: undefined }) })));
  assert.doesNotMatch(listenOnly, /fd-beyond__switch|data-media-panel="family"/);
  assert.match(listenOnly, /data-media-panel="listen">/);
  const familyOnly = section(render(media({ 't_mood.md': entry({ listen: undefined, listenAll: undefined }) })));
  assert.doesNotMatch(familyOnly, /fd-beyond__switch|data-media-panel="listen"/);
  assert.match(familyOnly, /data-media-panel="family">/, 'the only side is not hidden');
  assert.equal((listenOnly.match(/class="fd-beyond__card"/g) || []).length, 1);
});

test('the shell switches in place, moves focus to the first card, and stores nothing', () => {
  const fn = spa.match(/function fdMediaSwitch\(button\)\{[\s\S]*?\n {2}\}/);
  assert.ok(fn, 'fdMediaSwitch is defined in spa_index.html');
  assert.match(fn[0], /setAttribute\('aria-pressed'/);
  assert.match(fn[0], /panels\[i\]\.hidden=!on/);
  assert.match(fn[0], /querySelector\('\.fd-beyond__card'\)/);
  assert.match(fn[0], /\.focus\(/);
  assert.doesNotMatch(fn[0], /localStorage|sessionStorage|history\.|location\.|fdSave|setRoute/);
  assert.match(spa, /closest\('\[data-media-side\]'\);\s*if\(el\)\{event\.preventDefault\(\);fdMediaSwitch\(el\);return;\}/);
  // A real DOM-free simulation of the handler over a tiny fake tree.
  // eslint-disable-next-line no-new-func
  const switcher = new Function(`${fn[0]}; return fdMediaSwitch;`)();
  const mk = (attrs) => ({ attrs: { ...attrs }, hidden: !!attrs.hidden, getAttribute(k) { return this.attrs[k]; },
    setAttribute(k, v) { this.attrs[k] = v; } });
  const opts = [mk({ 'data-media-side': 'listen', 'aria-pressed': 'true' }), mk({ 'data-media-side': 'family', 'aria-pressed': 'false' })];
  let focused = null;
  const card = { focus() { focused = 'family-card'; } };
  const panels = [mk({ 'data-media-panel': 'listen' }), mk({ 'data-media-panel': 'family', hidden: true })];
  panels[1].querySelector = () => card;
  panels[0].querySelector = () => ({ focus() { focused = 'listen-card'; } });
  const sectionEl = { querySelectorAll: (sel) => (sel === '[data-media-side]' ? opts : panels) };
  opts[1].closest = () => sectionEl;
  switcher(opts[1]);
  assert.deepEqual(opts.map((o) => o.attrs['aria-pressed']), ['false', 'true']);
  assert.deepEqual(panels.map((p) => p.hidden), [true, false]);
  assert.equal(focused, 'family-card');
});

// ---- cards, links, actions --------------------------------------------------------------------------

test('episode card: title, show and category, an external YouTube link that announces a new tab', () => {
  const html = section(render(media({ 't_mood.md': entry() })));
  assert.match(html, /<p class="fd-beyond__kicker">For you<\/p>/);
  assert.match(html, /<p class="fd-beyond__name">Episode 25: Ep &lt;Title&gt;<\/p>/, 'escaped');
  assert.match(html, /<p class="fd-beyond__meta">Psychiatry &amp; Psychotherapy Podcast · Mood &amp; bipolar; suicide<\/p>/);
  assert.match(html, /<a class="fd-beyond__link" href="https:\/\/www\.youtube\.com\/watch\?v=vBeB6V-KA70" target="_blank" rel="noopener noreferrer" aria-label="Episode 25 on YouTube \(opens in a new tab\)">YouTube ↗<\/a>/);
  assert.doesNotMatch(html, /<iframe|embed/i, 'no in-app player');
  assert.match(html, /<a href="\?page=podcast_library\.md#mood-bipolar-suicide" data-media-anchor="mood-bipolar-suicide">All Mood &amp; bipolar; suicide episodes<\/a>/);
});

test('book card: title, author, library description, an internal Book Library link and no Amazon link', () => {
  const html = section(render(media({ 't_mood.md': entry() })));
  assert.match(html, /<p class="fd-beyond__kicker fd-beyond__kicker--family">For the family<\/p>/);
  assert.match(html, /<p class="fd-beyond__name">Book One <span class="fd-beyond__by">· A\. Author<\/span><\/p>/);
  assert.match(html, /<p class="fd-beyond__desc">Desc\.<\/p>/);
  assert.match(html, /<a class="fd-beyond__link" href="\?page=book_library\.md#mood-bipolar-depression" data-media-anchor="mood-bipolar-depression">In the Book Library<\/a>/);
  assert.doesNotMatch(html, /amazon/i);
  assert.match(html, /All Mood, bipolar &amp; depression books<\/a>/);
  const noDesc = section(render(media({ 't_mood.md': entry({ family: [{ ...BK, description: '' }] }) })));
  assert.doesNotMatch(noDesc, /fd-beyond__desc/, 'a library line with no description shows none');
});

test('family actions: capture prefilled with titles and authors only, and the Family Systems link', () => {
  const two = entry({ family: [BK, { ...BK, isbn: '9780143128724', title: 'Book Two', author: 'B. Writer' }] });
  const html = section(render(media({ 't_mood.md': two })));
  assert.match(html, /<button type="button" class="fd-btn fd-btn--ghost fd-beyond__bring" data-capture-open data-cap-prefill="Book One — A\. Author; Book Two — B\. Writer">＋ Bring to family meeting<\/button>/);
  assert.match(html, /<a class="fd-beyond__practice" href="\?tool=family-systems\.html">Practice the offer in Family Systems →<\/a>/);
  assert.doesNotMatch(section(render(media({ 't_mood.md': entry({ practiceRef: undefined }) }))), /fd-beyond__practice/);
  // The capture dialog takes the prefill as a draft only: Save is still the learner's.
  assert.match(spa, /var prefill=invoker&&invoker\.getAttribute&&invoker\.getAttribute\('data-cap-prefill'\);\s*if\(ta&&prefill&&!ta\.value\)ta\.value=String\(prefill\)\.slice\(0,280\);/);
  const capOpen = spa.match(/function capOpen\(invoker,onAction\)\{[\s\S]*?\n {2}\}/)[0];
  assert.doesNotMatch(capOpen.slice(capOpen.indexOf('data-cap-prefill')), /^[\s\S]{0,200}capAdd\(/, 'the prefill never saves');
  assert.match(capOpen, /class="cap-warn"/, 'the existing no-patient-details warning is still shown');
});

test('an entry renders the guidance lines it signs, not a top-level copy', () => {
  const own = { listenSafety: 'OWN POD SAFETY', familySay: 'OWN SAY', familySafety: 'OWN SAFETY' };
  const html = section(render(media({ 't_mood.md': entry({ guidance: own }) })));
  assert.match(html, /<p class="fd-beyond__note">OWN POD SAFETY<\/p>/);
  assert.match(html, /How to offer it:<\/strong> OWN SAY<\/div>/);
  assert.doesNotMatch(html, /POD SAFETY<\/p>[\s\S]*POD SAFETY<\/p>/);
  assert.doesNotMatch(html, />BOOK SAFETY</, 'the fixture-only top-level guidance is ignored when the entry has its own');
});

test('the faculty preview renders the same block after the page body, only in preview', () => {
  const fn = spa.match(/function fdFacultyPreviewMedia\(ref\)\{[\s\S]*?\n {2}\}/);
  assert.ok(fn, 'fdFacultyPreviewMedia is defined');
  assert.match(fn[0], /if\(!facultyPreviewRequest/);
  assert.match(fn[0], /var html=fdMediaPreviewHtml\(ref\);/);
  assert.match(fn[0], /contentEl\.appendChild/);
  // The renderer lives in the Front Door closure; the bridge is set right after it is injected.
  assert.match(spa, /\/\*__FD_READER__\*\/\s*\/\*[\s\S]*?\*\/\s*fdMediaPreviewHtml=function\(ref\)\{[\s\S]*?return fdReaderMedia\(FD_MEDIA,ref,/);
  assert.match(spa, /makeCollapsible\(contentEl\); enhanceTables\(contentEl\); fdFacultyPreviewMedia\(item\.f\);/,
    'appended after makeCollapsible so the block is never folded into the last section');
});

test('safety-kit page: the block is the quiet row variant', () => {
  const html = F.fdReader(IDX, state({ ref: 'delirium.md', week: null, thread: { media: media({ 'delirium.md': entry({ family: undefined }) }) } }), '<p>x</p>');
  assert.match(html, /<section class="fd-beyond fd-beyond--quiet"/);
  assert.doesNotMatch(render(media({ 't_mood.md': entry() })), /fd-beyond--quiet/);
});

test('the block persists nothing and never touches progress state', () => {
  const st = state({ thread: { media: media({ 't_mood.md': entry() }) } });
  const before = JSON.stringify(st);
  F.fdReader(IDX, st, '<p>x</p>');
  assert.equal(JSON.stringify(st), before, 'render state is not written');
  assert.doesNotMatch(readerSrc.slice(readerSrc.indexOf('var FD_MEDIA_PODCAST_NAME'), readerSrc.indexOf('function fdReaderIsSafetyPage')),
    /localStorage|sessionStorage|data-fd-toggle|cw_|rp_/);
  for (const mod of ['fd_today.js', 'fd_path.js', 'fd_due.js', 'fd_block.js', 'fd_library.js', 'fd_search.js']) {
    assert.doesNotMatch(read(`frontdoor/${mod}`), /\bmedia\b|fd-beyond|FD_MEDIA/, `${mod} does not read the media index`);
  }
});

test('the block copy is audience-neutral', () => {
  const html = section(render(media({ 't_mood.md': entry() })));
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), AUDIENCE_TOKEN_RE);
});

// ---- end to end: live libraries, live map flipped to approved in memory --------------------------------

test('approved live map: the Mood page shows the block; guidance is byte-identical to topic_meta.json', () => {
  const index = liveApprovedIndex('ms3');
  const topicMeta = JSON.parse(readFileSync(new URL('../topic_meta.json', import.meta.url), 'utf8'));
  const html = render(index);
  const block = section(html);
  assert.ok(block, 'the Mood page renders the block');
  const text = (re) => unescape((block.match(re) || [])[1] || '');
  assert.equal(text(/<div class="fd-beyond__offer"><strong>How to offer it:<\/strong> ([^<]*)<\/div>/),
    topicMeta['book_library.md'].clinicalWorkflow.say);
  assert.equal(text(/<p class="fd-beyond__safety">([^<]*)<\/p>/), topicMeta['book_library.md'].clinicalWorkflow.safety);
  assert.equal(text(/<p class="fd-beyond__note">([^<]*)<\/p>/), topicMeta['podcast_library.md'].clinicalWorkflow.safety);
  assert.doesNotMatch(F.fdReader(IDX, state({ ref: 'b.md', thread: { media: index } }), '<p>x</p>'), /fd-beyond/,
    'a page without an entry shows nothing');
  const titles = [...block.matchAll(/class="fd-beyond__name">([^<]*)/g)].map((m) => unescape(m[1]).trim());
  const podcastLib = readFileSync(new URL('../12_Media/psychiatry_psychotherapy_podcast_library.md', import.meta.url), 'utf8');
  const bookLib = readFileSync(new URL('../07_Evidence_and_Reading/Book_Summaries/ms3_book_library.md', import.meta.url), 'utf8');
  for (const t of titles) {
    const ep = t.match(/^Episode (\d+): (.+)$/);
    if (ep) assert.ok(podcastLib.includes(`- Episode ${ep[1]}: ${ep[2]} — [▶ YouTube](`), `${t} is a verified library line`);
    else assert.ok(bookLib.includes(`- **[${t}](`), `${t} is a book library line`);
  }
  assert.ok(titles.length >= 2);
  for (const site of ['ms3', 'res']) {
    for (const [ref, page] of Object.entries(liveApprovedIndex(site).pages)) {
      for (const ep of page.listen || []) assert.match(ep.url, /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/, `${site} ${ref}`);
      assert.ok((page.listen || []).length <= 2 && (page.family || []).length <= 2);
    }
  }
});
