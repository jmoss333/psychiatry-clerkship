/* Rendered-state guard for the in-page collapsible sections.
 *
 * The collapse pass is a RENDER-time decision, so a source-level assertion cannot see it: the
 * `<!-- crisis-block -->` marker can be present, the build can pass its crisis gate, and the
 * lifeline can still land inside a `display:none` section body. These tests therefore render each
 * shipped content page the way the Front Door reader does (fd_wire.js preprocessing -> marked),
 * run the shell's own makeCollapsible() over the result, and read back the text a learner sees on
 * first paint with zero interaction. See tests/_collapse_harness.mjs for what the harness models.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadMarked, preprocessMarkdown, runCollapsible } from './_collapse_harness.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(repo, '13_Faculty_Resources', '_automation', 'site_build');
const shell = fs.readFileSync(path.join(buildDir, 'spa_index.html'), 'utf8');
const shellCss = shell.slice(shell.indexOf('<style>'), shell.indexOf('</style>'));
const marked = loadMarked(buildDir);
const manifest = JSON.parse(fs.readFileSync(path.join(buildDir, 'site_manifest.json'), 'utf8'));

const MARKER = '<!-- crisis-block -->';

/* Derived from crisis_resources.json, never written out here: the repo's rule is that a crisis
   number lives in exactly one file, and a test that pasted the digits would be a second copy to
   drift. This is the line a learner must be able to read without touching anything. */
const crisisData = JSON.parse(fs.readFileSync(path.join(repo, 'crisis_resources.json'), 'utf8'));
const lifeline = crisisData.resources.find((r) => r.id === 'lifeline_988');
assert.ok(lifeline && lifeline.contact, 'crisis_resources.json must carry the lifeline contact');
const LIFELINE_RE = new RegExp((lifeline.contact.match(/\d{3,}/) || [''])[0]);
assert.ok(LIFELINE_RE.source.length >= 3, 'expected a dialable lifeline number to assert on');

/* The real renderer, not a fixture: crisis_block.py prints render_markdown() of the live
   crisis_resources.json, exactly what build_deploy.py substitutes for the marker. */
const crisisMarkdown = (() => {
  const run = spawnSync('python3', [path.join(buildDir, 'crisis_block.py')], { encoding: 'utf8' });
  assert.equal(run.status, 0, `crisis_block.py failed: ${run.stderr}`);
  return run.stdout.trimEnd();
})();

/* Every registered content page, as the build ships it. */
const pages = manifest.md.map(([source, slug]) => {
  const abs = path.join(repo, source);
  const raw = fs.readFileSync(abs, 'utf8');
  return { source, slug, markdown: raw.split(MARKER).join(crisisMarkdown), hasCrisis: raw.includes(MARKER) };
});

const rendered = new Map();
function render(page) {
  if (!rendered.has(page.slug)) {
    rendered.set(page.slug, runCollapsible(shell, marked.parse(preprocessMarkdown(page.markdown))));
  }
  return rendered.get(page.slug);
}

test('the harness sees the collapse pass actually running on long pages', () => {
  // Guards the guard: if makeCollapsible ever stopped being reachable, every visibility
  // assertion below would pass vacuously.
  const collapsed = pages.filter((p) => render(p).sections.length > 0);
  assert.ok(collapsed.length > 5,
    `expected many long pages to collapse; got ${collapsed.length}`);
});

test('CRITICAL 1 — the crisis block is visible on first paint on every page that carries one', () => {
  const crisisPages = pages.filter((p) => p.hasCrisis);
  assert.ok(crisisPages.length > 5, 'expected the crisis block on many safety surfaces');
  const hidden = crisisPages.filter((p) => !LIFELINE_RE.test(render(p).visible));
  assert.deepEqual(hidden.map((p) => p.slug), [],
    'the lifeline must be readable with zero interaction on every crisis surface');
});

test('CRITICAL 1 — a crisis page is never carved into collapsed sections at all', () => {
  // The stronger structural form of the same contract: a safety surface stays fully expanded,
  // so no future change to the block\'s position can strand it inside a collapsed body.
  for (const page of pages.filter((p) => p.hasCrisis)) {
    assert.equal(render(page).sections.length, 0,
      `${page.slug} carries a crisis block and must not be collapsed`);
  }
});

test('IMPORTANT 5 — a trailing cross-link rail is never swallowed by the last section', () => {
  const railPages = pages.filter((p) => /\*\*Pair with\*\*/.test(p.markdown));
  assert.ok(railPages.length > 10, 'expected the Pair-with rail on many topic pages');
  const swallowed = railPages.filter((p) => !/Pair with/.test(render(p).visible));
  assert.deepEqual(swallowed.map((p) => p.slug), [],
    'the trailing rail is the page\'s reachability surface -- it must render on first paint');
});

test('IMPORTANT 3 — a print rule un-hides collapsed section bodies', () => {
  const printBlocks = [...shellCss.matchAll(/@media\s+print\s*\{([\s\S]*?)\n\s*\}\n/g)].map((m) => m[1]);
  assert.ok(printBlocks.length > 0, 'spa_index.html has no @media print block at all');
  const unhides = printBlocks.some((block) => /\.sec-b[^{]*\{[^}]*display\s*:\s*block/.test(block));
  assert.ok(unhides,
    'Ctrl-P / Save-as-PDF renders the page as it stands: .sec-b must be forced visible for print');
});

test('MINOR 8 — every disclosure button names the region it controls', () => {
  const start = shell.indexOf('  function makeCollapsible(body){');
  const fnSrc = shell.slice(start, shell.indexOf('\n  function tableLabel(', start));
  assert.match(fnSrc, /aria-controls/,
    'the toggle sets aria-expanded but never points at the body it expands');
  assert.match(fnSrc, /bd\.id\s*=|setAttribute\('id'/,
    'aria-controls needs a matching id on the .sec-b it references');
});
