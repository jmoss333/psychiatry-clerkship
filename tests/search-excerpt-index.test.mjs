// Excerpt prose is additive: the original snippet, tokens and scores stay intact.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';

const lateParagraph = 'Earlier context remains part of the source. '.repeat(90)
  + 'Do not assume the late QTc finding confirms a diagnosis; review the full clinical context.';
const markdown = [
  '---', 'internal_metadata: secretfrontmatter', '---',
  '# Standalone heading must not become an excerpt', '',
  '> **Review status:** secretattestation', '',
  'The ReConnect Resource Finder is linked here.', '',
  '**Do not** replace [the clinical context](https://example.test/secretpath_(nested)). '
    + 'Keep *punctuation*, β-hCG, 0.8–1.2, and “quoted words” &amp; entities.', '',
  'A [reference label][source] remains readable, but its destination does not.[^footnote]', '',
  '[source]: https://example.test/secretdestination',
  '    "secretreferencetitle"',
  '[^footnote]: secretfootnote', '',
  '- First list item retains its complete sentence.',
  '- Second list item is a separate complete sentence.', '',
  'Before the hidden material is ordinary visible prose.', '',
  '<!-- secretcomment -->',
  '<script>const secretscript = "not prose";</script>',
  '<style>.secretstyle {display:none}</style>',
  '<div hidden><p>secrethidden</p></div>',
  '<div style="display: none"><p>secretinlinehidden</p></div>',
  '<span aria-hidden="true">secretariahidden</span>',
  '<template><p>secrettemplate</p></template>',
  '<pre><code>secrethtmlcode</code></pre>',
  '<h3>secrethtmlheading</h3>', '',
  '```html', '<script>secretfencedcode', '```', '',
  '~~~text', 'secretotherfence', '~~~', '',
  '    secretindentedcode', '',
  'A sentence containing `secretinlinecode` is omitted as a whole.', '',
  '<p>Do <code>not</code> turn this into an affirmative instruction.</p>', '',
  'Setext heading is not prose', '===========================', '',
  '| secrettableheading | another |', '| --- | --- |', '| secrettablecell | another |', '',
  'secrettablewithoutborder | another', '--- | ---', 'secretcellwithoutborder | another', '',
  '<section>', '    <p>Visible embedded HTML retains <strong>negation: do not</strong> shorten this sentence.</p>', '</section>', '',
  lateParagraph, '',
  'The repeated passage appears only once.', '',
  'The repeated passage appears only once.',
].join('\n');

const built = JSON.parse(execFileSync('python3', ['-B', '-c', `
import contextlib, io, json, os, sys, tempfile
sys.path.insert(0, '13_Faculty_Resources/_automation/site_build')
import common
raw=json.load(sys.stdin)
nav=[{'section':'Resources','items':[
    {'f':'fixture.md','t':'Fixture','k':'md'},
    {'f':'tool.html','t':'Tool','k':'tool'}]}]
with tempfile.TemporaryDirectory() as tmp:
    os.mkdir(os.path.join(tmp,'content'))
    with open(os.path.join(tmp,'content','fixture.md'),'w',encoding='utf-8') as file:
        file.write(raw)
    with contextlib.redirect_stdout(io.StringIO()):
        result=common.build_search_index(nav,tmp,tool_keywords={'tool.html':'keywordblob qtc lithium'})
    with open(os.path.join(tmp,'search-index.json'),encoding='utf-8') as file:
        serialized=json.load(file)
    with open(os.path.join(tmp,result['passagesFile']),encoding='utf-8') as file:
        passage_text=file.read()
    excluded={path:common._sw_is_excluded(path) for path in [
        result['passagesFile'], 'search-index.json', 'search-passages.json',
        'search-passages-'+('a'*63)+'.json', 'search-passages-'+('A'*64)+'.json',
        'search-passages-'+('a'*64)+'.json.bak', 'nested/'+result['passagesFile']]}
    with open(os.path.join(tmp,'content','fixture.md'),'w',encoding='utf-8') as file:
        file.write('# Heading\\n\\nKeep QTc, not code.\\n')
    with contextlib.redirect_stdout(io.StringIO()):
        baseline=common.build_search_index(nav,tmp,tool_keywords={'tool.html':'keywordblob qtc lithium'})
    remaining=[name for name in os.listdir(tmp) if name.startswith('search-passages-')]
print(json.dumps({'index':result,'baseline':baseline,'serialized':serialized,
                  'passageText':passage_text,'excluded':excluded,'remaining':remaining}))
`], { cwd: new URL('../', import.meta.url), input: JSON.stringify(markdown), encoding: 'utf8' }));

const feed = JSON.parse(built.passageText);
const doc = { passages: feed.docs['fixture.md'] };

test('source passages preserve the complete deep paragraph, including its late negation and match', () => {
  assert.ok(lateParagraph.length > 3500);
  assert.ok(doc.passages.includes(lateParagraph));
  assert.equal(doc.passages.filter(text => text === 'The repeated passage appears only once.').length, 1);
  assert.ok(doc.passages.indexOf(lateParagraph) > doc.passages.indexOf('Second list item is a separate complete sentence.'));
});

test('Markdown formatting becomes readable source prose without losing punctuation or negation', () => {
  assert.ok(doc.passages.includes('Do not replace the clinical context. Keep punctuation, β-hCG, 0.8–1.2, and “quoted words” & entities.'));
  assert.ok(doc.passages.includes('A reference label remains readable, but its destination does not.'));
  assert.ok(doc.passages.includes('First list item retains its complete sentence.'));
  assert.ok(doc.passages.includes('Second list item is a separate complete sentence.'));
  assert.ok(doc.passages.includes('Visible embedded HTML retains negation: do not shorten this sentence.'));
});

test('excerpt passages exclude hidden material, code, headings, tables and source metadata', () => {
  const text = doc.passages.join('\n');
  assert.doesNotMatch(text, /secret|https?:|Standalone heading|Setext heading|sentence containing|affirmative instruction|ReConnect/);
  assert.ok(doc.passages.includes('Before the hidden material is ordinary visible prose.'));
});

test('HTML tool keyword blobs are never exposed as source passages', () => {
  const tool = built.index.docs.find(row => row.f === 'tool.html');
  assert.equal(tool.snip, 'keywordblob qtc lithium');
  assert.equal(Object.hasOwn(tool, 'passages'), false);
  assert.equal(Object.hasOwn(feed.docs, 'tool.html'), false);
});

test('complete source prose lives in an optional content-addressed feed, not the offline index', () => {
  assert.deepEqual(built.index, built.serialized, 'returned and serialized indexes agree');
  assert.equal(feed.version, 1);
  assert.match(built.index.passagesFile, /^search-passages-[0-9a-f]{64}\.json$/);
  const digest = createHash('sha256').update(built.passageText, 'utf8').digest('hex');
  assert.equal(built.index.passagesFile, `search-passages-${digest}.json`);
  assert.equal(built.passageText, JSON.stringify(feed), 'compact JSON retains Unicode');
  assert.ok(built.passageText.includes('β-hCG'));
  for (const indexedDoc of built.index.docs) assert.equal(Object.hasOwn(indexedDoc, 'passages'), false);
  const { passagesFile, ...previousFields } = built.index;
  assert.ok(Buffer.byteLength(JSON.stringify(built.index)) - Buffer.byteLength(JSON.stringify(previousFields)) < 110,
    'the core index adds only its bounded feed reference');
  assert.notEqual(built.index.passagesFile, built.baseline.passagesFile, 'changed prose gets a different URL');
});

test('only the strict root excerpt feed filename is excluded from service-worker precache and hashing', () => {
  assert.equal(built.excluded[built.index.passagesFile], true);
  for (const [path, excluded] of Object.entries(built.excluded)) {
    if (path !== built.index.passagesFile) assert.equal(excluded, false, path);
  }
});

test('rebuilding replaces the inherited audience feed instead of leaving its prose in output', () => {
  assert.deepEqual(built.remaining, [built.baseline.passagesFile]);
});

test('passages leave existing snippets, document lengths and weighted postings unchanged', () => {
  const index = built.baseline;
  assert.equal(index.docs[0].snip, 'Keep QTc, not code.');
  assert.equal(index.docs[0].L, 7);
  assert.equal(index.docs[1].L, 5);
  assert.equal(index.avgLen, 6);
  assert.deepEqual(index.postings, {
    fixture: [[0, 4]], resources: [[0, 2], [1, 2]], heading: [[0, 2]],
    keep: [[0, 1]], qtc: [[0, 1], [1, 1]], not: [[0, 1]], code: [[0, 1]],
    tool: [[1, 4]], keywordblob: [[1, 1]], lithium: [[1, 1]],
  });
  assert.deepEqual(index.df, {
    fixture: 1, resources: 2, heading: 1, keep: 1, qtc: 2, not: 1, code: 1,
    tool: 1, keywordblob: 1, lithium: 1,
  });
});
