/* The content universe, and the invariant that keeps it honest.

   These tests exist because the July 2026 bug was invisible to every gate the repository
   had: reviewed.json said 22 pages were pending, both site builds shipped them, and the
   console could not show a single one. Nothing was red for two months. The three things
   asserted here are the three things that would have made it red:
     1. the universe includes the registry-derived Case-of-the-Week twins;
     2. the slug the console derives is byte-identical to the one the builds write;
     3. every pending ledger entry is reachable, or explicitly excluded on the record. */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NOT_REVIEWABLE_IN_CONSOLE,
  contentUniverseSlugs,
  cotwSlug,
  cotwTwinSlug,
  deriveContentUniverse,
  isCotwSlug,
} from './content-universe.mjs';

const ROOT = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, ROOT), 'utf8');
const readJson = path => JSON.parse(read(path));

const MANIFEST = readJson('13_Faculty_Resources/_automation/site_build/site_manifest.json');
const REGISTRY = readJson('08_Cases_and_Simulation/case-of-the-week/cotw_registry.json');
const REVIEWED = readJson('13_Faculty_Resources/reviewed.json');

// The exact Python expression both site builds use. Asserting on the source text — not
// on a hand-copied restatement of it — is what makes "byte-identical" a claim a test can
// actually break when someone edits one build script and not the other.
const PYTHON_SLUG_EXPRESSION =
  'return "cotw_%s_%s_%s.md"%(w["date"].replace("-",""),w["topic"],level)';

function week(overrides = {}) {
  return {
    date: '2026-08-31',
    topic: 'catatonia',
    label: 'Catatonia (Aug 31)',
    ...overrides,
  };
}

const MINIMAL_MANIFEST = {
  md: [['01_Core/t_mood.md', 't_mood.md', 'Mood disorders']],
  tools: [['04_Assessment/mse.html', 'mse.html', 'Mental status exam']],
};

test('the real repository universe is the manifest plus both Case-of-the-Week twins', () => {
  const items = deriveContentUniverse({ manifest: MANIFEST, registry: REGISTRY });
  const pages = items.filter(item => item.kind === 'page');
  const tools = items.filter(item => item.kind === 'tool');
  const cotw = items.filter(item => isCotwSlug(item.slug));

  assert.equal(MANIFEST.md.length, 69);
  assert.equal(MANIFEST.tools.length, 22);
  assert.equal(REGISTRY.weeks.length, 11);
  // 69 manifest pages + 22 manifest tools + 2 x 11 registry weeks.
  assert.equal(items.length, 113);
  assert.equal(pages.length, 69 + 22);
  assert.equal(tools.length, 22);
  assert.equal(cotw.length, 22);

  // Every Case-of-the-Week page is a page (never a tool) and names its own site.
  assert.deepEqual(
    [...new Set(cotw.map(item => `${item.kind}:${item.site}`))].sort(),
    ['page:ms3', 'page:res'],
  );
  assert.equal(cotw.filter(item => item.site === 'ms3').length, 11);
  assert.equal(cotw.filter(item => item.site === 'res').length, 11);
  // Manifest items keep their historical behaviour exactly: MS3 site, unchanged titles.
  assert.deepEqual([...new Set(items.filter(item => !isCotwSlug(item.slug)).map(i => i.site))], ['ms3']);
});

test('the derived slug is byte-identical to _cotw_slug in both site builds', () => {
  const buildDeploy = read('13_Faculty_Resources/_automation/site_build/build_deploy.py');
  const residentSection = read('13_Faculty_Resources/_automation/site_build/resident_section.py');
  assert.ok(
    buildDeploy.includes(PYTHON_SLUG_EXPRESSION),
    'build_deploy.py no longer contains the expected _cotw_slug expression',
  );
  assert.ok(
    residentSection.includes(PYTHON_SLUG_EXPRESSION),
    'resident_section.py no longer contains the expected _cotw_slug expression',
  );

  // Run the builds' own formula over the real registry and compare it to ours. This is
  // the parity gate: an edit to either side without the other fails here.
  const program = [
    'import json,sys',
    'registry=json.load(open(sys.argv[1],encoding="utf-8"))',
    `def _cotw_slug(w,level): ${PYTHON_SLUG_EXPRESSION}`,
    'print(json.dumps([_cotw_slug(w,l) for w in registry.get("weeks",[]) for l in ("ms3","res")]))',
  ].join('\n');
  const registryPath = new URL('08_Cases_and_Simulation/case-of-the-week/cotw_registry.json', ROOT);
  const fromPython = JSON.parse(execFileSync(
    'python3',
    ['-c', program, registryPath.pathname],
    { encoding: 'utf8' },
  ));

  const fromJs = REGISTRY.weeks.flatMap(w => ['ms3', 'res'].map(level => cotwSlug(w, level)));
  assert.deepEqual(fromJs, fromPython);
  assert.equal(fromPython.length, 22);
  assert.ok(fromPython.includes('cotw_20260831_catatonia_ms3.md'));
  assert.ok(fromPython.includes('cotw_20260831_catatonia_res.md'));
});

test('every built Case-of-the-Week slug already has a reviewed.json entry', () => {
  const cotw = deriveContentUniverse({ manifest: MANIFEST, registry: REGISTRY })
    .filter(item => isCotwSlug(item.slug));
  const missing = cotw.filter(item => !Object.hasOwn(REVIEWED, item.slug)).map(item => item.slug);
  assert.deepEqual(missing, []);
});

test('titles name the audience so the twins sort next to each other', () => {
  const items = deriveContentUniverse({
    manifest: MINIMAL_MANIFEST,
    registry: { weeks: [week()] },
  });
  const cotw = items.filter(item => isCotwSlug(item.slug));
  assert.deepEqual(cotw, [
    {
      slug: 'cotw_20260831_catatonia_ms3.md',
      title: 'Catatonia (Aug 31) — MS3',
      kind: 'page',
      site: 'ms3',
    },
    {
      slug: 'cotw_20260831_catatonia_res.md',
      title: 'Catatonia (Aug 31) — Resident',
      kind: 'page',
      site: 'res',
    },
  ]);
  // localeCompare on the shared label prefix puts "— MS3" immediately before
  // "— Resident", so compareItems needs no custom Case-of-the-Week ordering.
  const titles = cotw.map(item => item.title);
  assert.deepEqual([...titles].sort((a, b) => a.localeCompare(b)), titles);
});

test('a malformed manifest or registry is refused, never silently shortened', () => {
  const cases = [
    ['no manifest', {}],
    ['manifest is not an object', { manifest: [] }],
    ['manifest md is not a list', { manifest: { md: 'nope', tools: [] } }],
    ['manifest entry is short', { manifest: { md: [['src', 'slug']], tools: [] } }],
    ['registry is not an object', { manifest: MINIMAL_MANIFEST, registry: [] }],
    ['weeks is not a list', { manifest: MINIMAL_MANIFEST, registry: { weeks: {} } }],
    ['week is not an object', { manifest: MINIMAL_MANIFEST, registry: { weeks: ['x'] } }],
    ['week has no date', { manifest: MINIMAL_MANIFEST, registry: { weeks: [week({ date: undefined })] } }],
    ['week date is malformed', { manifest: MINIMAL_MANIFEST, registry: { weeks: [week({ date: '31-08-2026' })] } }],
    ['week has no topic', { manifest: MINIMAL_MANIFEST, registry: { weeks: [week({ topic: '' })] } }],
    ['week topic has a separator', { manifest: MINIMAL_MANIFEST, registry: { weeks: [week({ topic: 'a_b' })] } }],
    ['week topic escapes the slug', { manifest: MINIMAL_MANIFEST, registry: { weeks: [week({ topic: '../x' })] } }],
    ['week has no label', { manifest: MINIMAL_MANIFEST, registry: { weeks: [week({ label: '  ' })] } }],
    ['two weeks collide', {
      manifest: MINIMAL_MANIFEST,
      registry: { weeks: [week(), week({ label: 'Duplicate' })] },
    }],
    ['a week collides with a manifest page', {
      manifest: {
        md: [['08_Cases/x.md', 'cotw_20260831_catatonia_ms3.md', 'Hand-wired duplicate']],
        tools: [],
      },
      registry: { weeks: [week()] },
    }],
  ];
  for (const [label, sources] of cases) {
    assert.throws(() => deriveContentUniverse(sources), TypeError, label);
  }
});

test('an absent weeks list means no weekly cases, exactly as the builds treat it', () => {
  // json.load(...).get("weeks",[]) in both build scripts.
  for (const registry of [undefined, null, {}, { _note: 'documentation only' }]) {
    const items = deriveContentUniverse({ manifest: MINIMAL_MANIFEST, registry });
    assert.deepEqual(items.map(item => item.slug), ['t_mood.md', 'mse.html']);
  }
});

test('cotwTwinSlug pairs the two halves and ignores everything else', () => {
  assert.equal(cotwTwinSlug('cotw_20260831_catatonia_ms3.md'), 'cotw_20260831_catatonia_res.md');
  assert.equal(cotwTwinSlug('cotw_20260831_catatonia_res.md'), 'cotw_20260831_catatonia_ms3.md');
  assert.equal(cotwTwinSlug('cotw_20260726_etohwd_res.md'), 'cotw_20260726_etohwd_ms3.md');
  for (const slug of [
    't_mood.md', 'mse.html', 'cotw_index.md', '', null, undefined, 42,
    'cotw_2026_catatonia_ms3.md', 'cotw_20260831_catatonia_att.md',
    'cotw_20260831_Catatonia_ms3.md', 'xcotw_20260831_catatonia_ms3.md',
  ]) {
    assert.equal(cotwTwinSlug(slug), null, String(slug));
  }
  // Every real twin resolves to a slug that is itself in the universe.
  const universe = contentUniverseSlugs({ manifest: MANIFEST, registry: REGISTRY });
  const cotw = [...universe].filter(isCotwSlug);
  assert.equal(cotw.length, 22);
  for (const slug of cotw) assert.ok(universe.has(cotwTwinSlug(slug)), slug);
});

test('the pending-visibility invariant fails when the registry stops being read', () => {
  // This is the July 2026 state reconstructed exactly: the manifest alone, which is what
  // the console used to derive its universe from. Every one of the 22 built
  // Case-of-the-Week pages falls outside it while reviewed.json still calls them pending.
  const manifestOnly = contentUniverseSlugs({ manifest: MANIFEST, registry: { weeks: [] } });
  const allowlist = new Set(NOT_REVIEWABLE_IN_CONSOLE);
  const pending = Object.entries(REVIEWED)
    .filter(([, entry]) => entry && typeof entry === 'object' && entry.status === 'pending')
    .map(([slug]) => slug);

  assert.equal(pending.length, 24);
  const invisibleBefore = pending.filter(slug => !manifestOnly.has(slug) && !allowlist.has(slug));
  assert.equal(invisibleBefore.length, 22);
  assert.ok(invisibleBefore.every(isCotwSlug));

  // With the registry read, nothing pending is unreachable.
  const universe = contentUniverseSlugs({ manifest: MANIFEST, registry: REGISTRY });
  const invisibleAfter = pending.filter(slug => !universe.has(slug) && !allowlist.has(slug));
  assert.deepEqual(invisibleAfter, []);
  // …and the two exclusions are genuinely outside the universe, not masking a live item.
  assert.deepEqual(NOT_REVIEWABLE_IN_CONSOLE.filter(slug => universe.has(slug)), []);
  assert.deepEqual([...NOT_REVIEWABLE_IN_CONSOLE], ['rp-agitation.html', 'rp-brief-psych.html']);
});
