// "In the paper's own words": verified source excerpts under the references that cite them.
// Pins the pure parts of frontdoor/fd_ref_evidence.js, the index evidence_excerpts.py derives,
// and the corpus contract: every shipped reading's PubMed/DOI citation of an annotated source
// resolves to that source's verbatim span, and the index never carries the library's claimText.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const SITE = new URL('../13_Faculty_Resources/_automation/site_build/', import.meta.url);
const ROOT = new URL('../', import.meta.url);
const source = readFileSync(new URL('frontdoor/fd_ref_evidence.js', SITE), 'utf8');
// eslint-disable-next-line no-new-func
const F = new Function(`${source}
return {fdRefEvidenceIds,fdRefEvidenceLookup,fdRefEvidenceHtml,fdRefEvidenceTargets,fdRefEvidenceApply,fdMountRefEvidence,fdRefEvidenceDoi};`)();

const derived = JSON.parse(execFileSync('python3', [
  new URL('evidence_excerpts.py', SITE).pathname, '--stdout',
], { encoding: 'utf8' }));
const annotations = JSON.parse(readFileSync(new URL('evidence_annotations.json', ROOT), 'utf8'));

const INDEX = {
  schemaVersion: 1,
  sources: {
    a: { span: 'We found <b>X</b> & more.', spanType: 'abstract', checked: '2026-09-03' },
    b: { span: 'Guideline says Y.', spanType: 'guideline-statement', checked: '' },
  },
  byPmid: { 12345678: 'a', 87654321: 'b' },
  byDoi: { '10.1000/abc': 'a' },
};

test('identifiers come from PubMed and doi.org links and from PMID/DOI text, in order, deduplicated', () => {
  const ids = F.fdRefEvidenceIds(
    'Smith J. Title. JAMA. 2020. PMID: 12345678. DOI: 10.1000/ABC. See also PMID 12345678.',
    ['https://pubmed.ncbi.nlm.nih.gov/12345678/', 'https://doi.org/10.1000%2Fabc'],
  );
  assert.deepEqual(ids, { pmids: ['12345678'], dois: ['10.1000/abc'] });
});

test('trailing punctuation is not part of a DOI', () => {
  assert.deepEqual(F.fdRefEvidenceIds('DOI: 10.1056/NEJMoa051688).', []).dois, ['10.1056/nejmoa051688']);
});

test('a bare year or page range is not an identifier', () => {
  assert.deepEqual(F.fdRefEvidenceIds('Am J Psychiatry. 2020;177:868–872.', []), { pmids: [], dois: [] });
});

test('lookup prefers nothing over a guess when one item cites two different sources', () => {
  assert.equal(F.fdRefEvidenceLookup(INDEX, { pmids: ['12345678'], dois: [] }).sourceId, 'a');
  assert.equal(F.fdRefEvidenceLookup(INDEX, { pmids: ['12345678'], dois: ['10.1000/abc'] }).sourceId, 'a');
  assert.equal(F.fdRefEvidenceLookup(INDEX, { pmids: ['12345678', '87654321'], dois: [] }), null);
  assert.equal(F.fdRefEvidenceLookup(INDEX, { pmids: ['99999999'], dois: [] }), null);
  assert.equal(F.fdRefEvidenceLookup(null, { pmids: ['12345678'], dois: [] }), null);
});

test('lookup ignores inherited keys', () => {
  assert.equal(F.fdRefEvidenceLookup(INDEX, { pmids: ['constructor'], dois: ['__proto__'] }), null);
});

test('the excerpt is escaped, collapsed, labelled as the paper’s words and dated', () => {
  const html = F.fdRefEvidenceHtml(F.fdRefEvidenceLookup(INDEX, { pmids: ['12345678'], dois: [] }));
  assert.match(html, /^<details class="fd-ref-evidence" data-source="a">/);
  assert.doesNotMatch(html, /<details[^>]* open/, 'collapsed by default');
  assert.match(html, /<summary class="fd-ref-evidence__toggle">In the paper’s own words<\/summary>/);
  assert.match(html, /We found &lt;b&gt;X&lt;\/b&gt; &amp; more\./);
  assert.match(html, /from the abstract, checked against the source on 2026-09-03\./);
  const undated = F.fdRefEvidenceHtml(F.fdRefEvidenceLookup(INDEX, { pmids: ['87654321'], dois: [] }));
  assert.match(undated, /from the guideline statement, checked against the source\./);
  assert.equal(F.fdRefEvidenceHtml(null), '');
});

// A minimal DOM: enough of Element for the mount to run without a browser.
function fakeLi(text, hrefs = []) {
  const li = {
    textContent: text, appended: '',
    querySelector: (sel) => (sel === '.fd-ref-evidence' && li.appended.includes('fd-ref-evidence') ? {} : null),
    querySelectorAll: (sel) => (sel === 'a[href]' ? hrefs.map((h) => ({ getAttribute: () => h })) : []),
    closest: () => null,
    insertAdjacentHTML(where, html) { assert.equal(where, 'beforeend'); li.appended += html; },
  };
  return li;
}
const fakeBody = (items) => ({ isConnected: true, querySelectorAll: (sel) => (sel === 'li' ? items : []) });

test('mount appends one excerpt per matching item, leaves the rest alone, and is idempotent', async () => {
  const hit = fakeLi('Smith. PMID: 12345678.');
  const miss = fakeLi('Jones. PMID: 99999999.');
  const plain = fakeLi('Ask about sleep.');
  const body = fakeBody([hit, miss, plain]);
  let loads = 0;
  const load = () => { loads += 1; return Promise.resolve(INDEX); };
  assert.equal(await F.fdMountRefEvidence(body, load), 1);
  assert.match(hit.appended, /fd-ref-evidence/);
  assert.equal(miss.appended, '');
  assert.equal(plain.appended, '');
  assert.equal(await F.fdMountRefEvidence(body, load), 0, 'a re-mount adds nothing');
  assert.equal((hit.appended.match(/<details/g) || []).length, 1);
  assert.ok(loads >= 1);
});

test('a page with no citations never loads the index; a failed load changes nothing', async () => {
  let loads = 0;
  assert.equal(await F.fdMountRefEvidence(fakeBody([fakeLi('No refs here.')]), () => { loads += 1; }), 0);
  assert.equal(loads, 0);
  const li = fakeLi('PMID: 12345678');
  assert.equal(await F.fdMountRefEvidence(fakeBody([li]), () => Promise.resolve(null)), 0);
  assert.equal(await F.fdMountRefEvidence(fakeBody([li]), () => Promise.reject(new Error('offline'))), 0);
  assert.equal(li.appended, '');
});

test('the derived index carries verbatim spans only, never the library’s claim text', () => {
  assert.equal(derived.schemaVersion, 1);
  const spans = new Map(annotations.annotations.map((a) => [a.sourceId, a]));
  // A claim may quote its own source verbatim (guideline statements do); any OTHER claim text
  // appearing in the index would be the library's paraphrase reaching learners as the paper's words.
  const squash = (s) => String(s || '').split(/\s+/).filter(Boolean).join(' ');
  const blob = JSON.stringify(derived);
  for (const a of annotations.annotations) {
    const own = squash(a.verifiedAgainst.sourceSpan);
    for (const c of a.claims || []) {
      const text = squash(c.claimText);
      if (text.length > 40 && !own.includes(text)) {
        assert.ok(!blob.includes(JSON.stringify(text).slice(1, -1)), `claimText leaked: ${text.slice(0, 60)}`);
      }
    }
  }
  for (const [sid, entry] of Object.entries(derived.sources)) {
    const verified = spans.get(sid).verifiedAgainst;
    assert.equal(entry.span, verified.sourceSpan.split(/\s+/).filter(Boolean).join(' '), `${sid} span is verbatim`);
    assert.deepEqual(Object.keys(entry).sort(), ['checked', 'span', 'spanType']);
  }
  for (const sid of [...Object.values(derived.byPmid), ...Object.values(derived.byDoi)]) {
    assert.ok(derived.sources[sid], `${sid} resolves to an excerpt`);
  }
});

test('every annotated source a shipped reading cites in a list item resolves to its own excerpt', () => {
  const shipped = JSON.parse(readFileSync(new URL('shipped_pages.json', SITE), 'utf8')).pages;
  const sources = [...new Set(shipped.map((p) => p.source).filter((s) => s && s.endsWith('.md')))];
  let matched = 0;
  const pages = new Set();
  for (const rel of sources) {
    const file = new URL(rel, ROOT);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!/^\s*(?:[-*+]|\d+\.)\s/.test(line)) continue;
      const hrefs = [...line.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
      const ids = F.fdRefEvidenceIds(line, hrefs);
      const entry = F.fdRefEvidenceLookup(derived, ids);
      if (!entry) continue;
      matched += 1; pages.add(rel);
      const own = annotations.annotations.find((a) => a.sourceId === entry.sourceId).verifiedAgainst;
      const cites = ids.pmids.includes(own.pmid) || ids.dois.includes(F.fdRefEvidenceDoi(own.doi));
      assert.ok(cites, `${rel}: excerpt ${entry.sourceId} must be the paper the line cites`);
    }
  }
  // Floor, not a target: 2026-11-25 measured 160+ matched citations on 30+ pages. A drop
  // means the matcher or the markdown changed shape and learners silently lost excerpts.
  assert.ok(matched >= 120, `only ${matched} citations matched an excerpt`);
  assert.ok(pages.size >= 25, `only ${pages.size} pages carry an excerpt`);
});

test('both render paths mount the excerpts and the build ships the index', () => {
  const spa = readFileSync(new URL('spa_index.html', SITE), 'utf8');
  assert.equal(spa.match(/fdMountRefEvidence\((?:body|contentEl)\);/g).length, 2,
    'the learner reader and the faculty preview both mount it');
  assert.equal(spa.split('/*__FD_REF_EVIDENCE__*/').length - 1, 1);
  const build = readFileSync(new URL('build_deploy.py', SITE), 'utf8');
  assert.match(build, /_evidence_excerpts\.write\(OUT,/);
});

// ---- Tappable in-text citations (fdRefCiteMarkup) ----------------------------------------
const G = new Function(`${source}
return {fdRefCiteMarkup,fdRefCiteList,fdRefCiteJump,fdRefCiteSourceNumbers};`)();
const PAGE = '<p>Check levels [1] and the ECG [2,3]; see [4] and [1–3].</p>'
  + '<p><a href="#x">[2]</a> <code>[3]</code></p><h3>Why [1]?</h3>'
  + '<h2>References</h2><p>Based on PubMed.</p>'
  + '<ol><li>One.</li><li class="x">Two.<ul><li>nested</li></ul></li><li>Three [1].</li></ol>';

test('each bracketed number naming a list entry becomes a citation button; the entries get ids', () => {
  const html = G.fdRefCiteMarkup(PAGE);
  assert.match(html, /Check levels \[<button type="button" class="fd-cite" data-ref-cite="1" aria-label="Reference 1">1<\/button>\]/);
  assert.match(html, /\[<button[^>]*data-ref-cite="2"[^>]*>2<\/button>,<button[^>]*data-ref-cite="3"[^>]*>3<\/button>\]/);
  assert.match(html, /\[<button[^>]*>1<\/button>–<button[^>]*>3<\/button>\]/, 'a range links its endpoints');
  assert.match(html, /see \[4\]/, 'a number the list does not have stays plain text');
  assert.match(html, /<a href="#x">\[2\]<\/a> <code>\[3\]<\/code>/, 'never inside a link or code');
  assert.match(html, /<h3>Why \[1\]\?<\/h3>/, 'never inside a heading');
  assert.match(html, /<li id="fd-ref-1" tabindex="-1">One\./);
  assert.match(html, /<li id="fd-ref-2" tabindex="-1" class="x">Two\.<ul><li>nested/, 'nested items are not entries');
  assert.match(html, /<li id="fd-ref-3" tabindex="-1">Three \[1\]\./, 'nothing after the heading is rewritten');
  assert.equal((html.match(/class="fd-cite"/g) || []).length, 5);
});

test('a page without a closing numbered reference list is returned unchanged', () => {
  for (const html of ['<p>See [1].</p>', '<p>[1]</p><h2>References</h2><ul><li>A</li></ul>',
    '<p>[1]</p><h2>References</h2><h3>More</h3><ol><li>A</li></ol>', '']) {
    assert.equal(G.fdRefCiteMarkup(html), html);
  }
});

test('an ol start attribute shifts the numbering', () => {
  const html = G.fdRefCiteMarkup('<p>[5] [4]</p><h2>Sources</h2><ol start="5"><li>Five</li></ol>');
  assert.match(html, /\[<button[^>]*data-ref-cite="5"/);
  assert.match(html, /\[4\]/);
  assert.match(html, /<li id="fd-ref-5"/);
});

test('a citation tap opens a collapsed section, scrolls and focuses the entry', () => {
  const calls = [];
  const section = { classList: { contains: () => false },
    querySelector: () => ({ click: () => calls.push('open') }) };
  const li = { closest: () => section, scrollIntoView: (o) => calls.push(['scroll', o.block]),
    focus: (o) => calls.push(['focus', o.preventScroll]) };
  const body = { querySelector: (sel) => (sel === '#fd-ref-3' ? li : null) };
  assert.equal(G.fdRefCiteJump(body, '3'), true);
  assert.deepEqual(calls, ['open', ['scroll', 'center'], ['focus', true]]);
  assert.equal(G.fdRefCiteJump(body, '9'), false);
});

test('the author\u2019s reference numbers win over markdown\u2019s 1..N', () => {
  const md = 'Mania [1,2] and lamotrigine [5].\n\n## References\n\n1. A\n2. B\n4. C\n5. D\n';
  const html = '<p>Mania [1,2] and lamotrigine [5].</p><h2>References</h2><ol><li>A</li><li>B</li><li>C</li><li>D</li></ol>';
  assert.deepEqual(G.fdRefCiteSourceNumbers(md), [1, 2, 4, 5]);
  const out = G.fdRefCiteMarkup(html, md);
  assert.match(out, /<li id="fd-ref-4" tabindex="-1" value="4">C/, 'shown as 4, not 3');
  assert.match(out, /<li id="fd-ref-5" tabindex="-1" value="5">D/);
  assert.match(out, /<li id="fd-ref-2" tabindex="-1">B/, 'no value where markdown already agrees');
  assert.match(out, /lamotrigine \[<button[^>]*data-ref-cite="5"/);
  assert.equal(G.fdRefCiteMarkup(html.replace('<li>D</li>', ''), md), html.replace('<li>D</li>', ''),
    'when the author\u2019s list and the rendered list disagree, the page is left alone');
  assert.equal(G.fdRefCiteMarkup(html, md.replace('5. D', '3. D')), html, 'numbers that do not rise: left alone');
});

test('the index drops sourceless spans and ambiguous identifiers, and squashes whitespace', () => {
  const dir = mkdtempSync(join(tmpdir(), 'excerpts-'));
  const fixture = join(dir, 'annotations.json');
  writeFileSync(fixture, JSON.stringify({ annotations: [
    { sourceId: 'a', verifiedAgainst: { sourceSpan: '  We  found X. ', spanType: 'abstract',
      retrievedAt: '2026-09-03', pmid: '12345678', doi: 'https://doi.org/10.1000/ABC.' } },
    { sourceId: 'b', verifiedAgainst: { sourceSpan: '', pmid: '22222222' } },
    { sourceId: 'c', verifiedAgainst: { sourceSpan: 'Y.', spanType: 'weird', retrievedAt: 'soon',
      pmid: '33333333', doi: '10.1000/dup' } },
    { sourceId: 'd', verifiedAgainst: { sourceSpan: 'Z.', pmid: '44444444', doi: '10.1000/DUP' } },
  ] }));
  try {
    const got = JSON.parse(execFileSync('python3', [new URL('evidence_excerpts.py', SITE).pathname,
      '--from', fixture, '--stdout'], { encoding: 'utf8' }));
    assert.deepEqual(got.sources.a, { span: 'We found X.', spanType: 'abstract', checked: '2026-09-03' });
    assert.equal(got.sources.b, undefined, 'a source with no span is never offered');
    assert.deepEqual(got.sources.c, { span: 'Y.', spanType: 'excerpt', checked: '' });
    assert.deepEqual(got.byPmid, { 12345678: 'a', 33333333: 'c', 44444444: 'd' });
    assert.deepEqual(got.byDoi, { '10.1000/abc': 'a' }, 'a DOI two sources claim is dropped, not guessed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
