/* The content universe, and the invariants that keep it honest.

   These tests exist because the July 2026 bug was invisible to every gate the repository
   had: reviewed.json said 22 pages were pending, both site builds shipped them, and the
   console could not show a single one. Nothing was red for two months. What is asserted
   here is what would have made it red:
     1. the universe is exactly what shipped_pages.json says ships, whichever producer
        put each item there;
     2. that file agrees with the producers themselves — the JS-side parity check;
     3. the Case-of-the-Week slug the console derives is byte-identical to the one shared
        Python formula the builds use;
     4. every pending ledger entry is reachable, or explicitly excluded on the record. */

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

const SHIPPED = readJson('13_Faculty_Resources/_automation/site_build/shipped_pages.json');
const MANIFEST = readJson('13_Faculty_Resources/_automation/site_build/site_manifest.json');
const REGISTRY = readJson('08_Cases_and_Simulation/case-of-the-week/cotw_registry.json');
const REVIEWED = readJson('13_Faculty_Resources/reviewed.json');

// The exact Python expression the one shared slug helper uses. Asserting on the source
// text — not on a hand-copied restatement of it — is what makes "byte-identical" a claim
// a test can actually break when someone edits the Python side alone.
const PYTHON_SLUG_EXPRESSION =
  'return "cotw_%s_%s_%s.md" % (week["date"].replace("-", ""), week["topic"], level)';

function week(overrides = {}) {
  return {
    date: '2026-08-31',
    topic: 'catatonia',
    label: 'Catatonia (Aug 31)',
    ...overrides,
  };
}

function page(overrides = {}) {
  return {
    slug: 't_mood.md',
    kind: 'page',
    sites: ['ms3', 'res'],
    title: 'Mood disorders',
    source: '01_Core/t_mood.md',
    producer: 'site_manifest',
    ...overrides,
  };
}

const MINIMAL_SHIPPED = { version: 1, generated_from: {}, pages: [page()] };

test('the real repository universe is exactly what shipped_pages.json ships', () => {
  const items = deriveContentUniverse({ shipped: SHIPPED });
  const pages = items.filter(item => item.kind === 'page');
  const tools = items.filter(item => item.kind === 'tool');
  const cotw = items.filter(item => isCotwSlug(item.slug));

  // 69 shared pages + 22 shared tools + 1 MS3-only tool (orientation-video.html)
  // + 22 Case-of-the-Week twins + 6 resident-only pages + 3 resident-only tools.
  assert.equal(MANIFEST.md.length, 69);
  assert.equal(MANIFEST.tools.length, 22);
  assert.equal(REGISTRY.weeks.length, 11);
  assert.equal(items.length, 123);
  assert.equal(pages.length, 69 + 22 + 6);
  assert.equal(tools.length, 22 + 1 + 3);
  assert.equal(cotw.length, 22);

  const byProducer = {};
  for (const entry of SHIPPED.pages) {
    byProducer[entry.producer] = (byProducer[entry.producer] ?? 0) + 1;
  }
  assert.deepEqual(byProducer, {
    site_manifest: 91,
    ms3_extra_tool: 1,
    cotw_registry: 22,
    resident_extra: 6,
    resident_tool: 3,
  });

  // Every Case-of-the-Week page is a page (never a tool) and names its own site.
  assert.deepEqual(
    [...new Set(cotw.map(item => `${item.kind}:${item.site}`))].sort(),
    ['page:ms3', 'page:res'],
  );
  assert.equal(cotw.filter(item => item.site === 'ms3').length, 11);
  assert.equal(cotw.filter(item => item.site === 'res').length, 11);

  // site is the ONE deployment to preview against: resident-only items say 'res',
  // everything shared says 'ms3'.
  const residentOnly = SHIPPED.pages.filter(
    entry => entry.sites.length === 1 && entry.sites[0] === 'res',
  );
  assert.equal(residentOnly.length, items.filter(item => item.site === 'res').length);
  assert.equal(residentOnly.length, 11 + 6 + 3);
});

/* THE JS-SIDE PARITY CHECK. shipped_pages.json is generated Python-side; this
   cross-derives the same universe from the producers in JavaScript and asserts equality,
   so the tracked file cannot silently disagree with site_manifest.json + cotw_registry.json
   even if every Python gate were bypassed. The resident-only and MS3-only extras live in
   site_extras.py, which this reads as data rather than restating. */
test('shipped_pages.json agrees with the producers it claims to be derived from', () => {
  const expected = new Map();
  for (const [source, slug, title] of MANIFEST.md) {
    expected.set(slug, { slug, kind: 'page', sites: ['ms3', 'res'], title, source });
  }
  for (const [source, slug, title] of MANIFEST.tools) {
    expected.set(slug, { slug, kind: 'tool', sites: ['ms3', 'res'], title, source });
  }

  // site_extras.py's literal lists, read out of the module by Python itself.
  const extras = JSON.parse(execFileSync('python3', [
    '-c',
    [
      'import json,sys',
      'sys.path.insert(0, sys.argv[1])',
      'import site_extras as e',
      'print(json.dumps({',
      '  "ms3_tools": e.MS3_EXTRA_TOOLS,',
      '  "resident_pages": e.RESIDENT_EXTRA_PAGES,',
      '  "resident_tools": e.RESIDENT_PROTO_TOOLS,',
      '}))',
    ].join('\n'),
    new URL('13_Faculty_Resources/_automation/site_build/', ROOT).pathname,
  ], { encoding: 'utf8' }));

  for (const [source, slug, title] of extras.ms3_tools) {
    expected.set(slug, { slug, kind: 'tool', sites: ['ms3'], title, source });
  }
  for (const w of REGISTRY.weeks) {
    for (const [level, key, label] of [['ms3', 'ms3_src', 'MS3'], ['res', 'res_src', 'Resident']]) {
      expected.set(cotwSlug(w, level), {
        slug: cotwSlug(w, level),
        kind: 'page',
        sites: [level],
        title: `${w.label} — ${label}`,
        source: `08_Cases_and_Simulation/case-of-the-week/${w[key]}`,
      });
    }
  }
  for (const [source, slug, title] of extras.resident_pages) {
    // welcome.md and cotw_index.md are resident OVERRIDES of a page both sites already
    // ship, not new shipped pages — the resident build overwrites the inherited file.
    if (expected.has(slug)) continue;
    expected.set(slug, { slug, kind: 'page', sites: ['res'], title, source });
  }
  for (const [source, slug, title] of extras.resident_tools) {
    expected.set(slug, { slug, kind: 'tool', sites: ['res'], title, source });
  }

  const actual = new Map(SHIPPED.pages.map(entry => [entry.slug, {
    slug: entry.slug,
    kind: entry.kind,
    sites: entry.sites,
    title: entry.title,
    source: entry.source,
  }]));

  assert.deepEqual(
    [...actual.keys()].sort(),
    [...expected.keys()].sort(),
    'shipped_pages.json lists a different slug set than its producers do — regenerate it: '
    + 'python3 13_Faculty_Resources/_automation/site_build/shipped_pages.py --write',
  );
  for (const [slug, want] of expected) assert.deepEqual(actual.get(slug), want, slug);
});

test('the derived slug is byte-identical to cotw_slug() in the shared Python helper', () => {
  const helper = read('13_Faculty_Resources/_automation/site_build/cotw_slug.py');
  assert.ok(
    helper.includes(PYTHON_SLUG_EXPRESSION),
    'cotw_slug.py no longer contains the expected slug expression',
  );
  // The builds must use that helper rather than a private copy — the drift ADR-002 closes.
  for (const script of ['build_deploy.py', 'resident_section.py', 'cotw_meta.py']) {
    const source = read(`13_Faculty_Resources/_automation/site_build/${script}`);
    assert.ok(
      /from cotw_slug import/.test(source),
      `${script} no longer imports the shared cotw_slug helper`,
    );
    assert.ok(
      !source.includes('"cotw_%s_%s_%s.md"'),
      `${script} has grown a private copy of the Case-of-the-Week slug formula again`,
    );
  }

  // Run the helper's own formula over the real registry and compare it to ours. This is
  // the parity gate: an edit to either side without the other fails here.
  const program = [
    'import json,sys',
    'registry=json.load(open(sys.argv[1],encoding="utf-8"))',
    'def cotw_slug(week, level):',
    `    ${PYTHON_SLUG_EXPRESSION}`,
    'print(json.dumps([cotw_slug(w,l) for w in registry.get("weeks",[]) for l in ("ms3","res")]))',
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

test('every shipped slug already has a reviewed.json entry', () => {
  const missing = deriveContentUniverse({ shipped: SHIPPED })
    .filter(item => !Object.hasOwn(REVIEWED, item.slug))
    .map(item => item.slug);
  assert.deepEqual(missing, []);
});

test('titles name the audience so the Case-of-the-Week twins sort next to each other', () => {
  const items = deriveContentUniverse({ shipped: SHIPPED }).filter(item => isCotwSlug(item.slug));
  const pair = items.filter(item => item.slug.startsWith('cotw_20260831_catatonia_'));
  assert.deepEqual(pair, [
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
  const titles = pair.map(item => item.title);
  assert.deepEqual([...titles].sort((a, b) => a.localeCompare(b)), titles);
});

test('a malformed shipped_pages.json is refused, never silently shortened', () => {
  const cases = [
    ['nothing at all', {}],
    ['not an object', { shipped: [] }],
    ['unsupported version', { shipped: { version: 2, pages: [page()] } }],
    ['no pages list', { shipped: { version: 1 } }],
    ['pages is not a list', { shipped: { version: 1, pages: 'nope' } }],
    ['pages is empty', { shipped: { version: 1, pages: [] } }],
    ['entry is not an object', { shipped: { version: 1, pages: ['x'] } }],
    ['entry has no slug', { shipped: { version: 1, pages: [page({ slug: '  ' })] } }],
    ['entry has no title', { shipped: { version: 1, pages: [page({ title: '' })] } }],
    ['entry has an unknown kind', { shipped: { version: 1, pages: [page({ kind: 'media' })] } }],
    ['entry has no sites', { shipped: { version: 1, pages: [page({ sites: [] })] } }],
    ['entry names an unknown site', { shipped: { version: 1, pages: [page({ sites: ['att'] })] } }],
    ['two entries collide', {
      shipped: { version: 1, pages: [page(), page({ title: 'Duplicate' })] },
    }],
  ];
  for (const [label, sources] of cases) {
    assert.throws(() => deriveContentUniverse(sources), TypeError, label);
  }
});

test('cotwSlug refuses a malformed week rather than inventing a slug', () => {
  for (const bad of [
    week({ date: undefined }),
    week({ date: '31-08-2026' }),
    week({ topic: '' }),
    week({ topic: 'a_b' }),
    week({ topic: '../x' }),
  ]) {
    assert.throws(() => cotwSlug(bad, 'ms3'), TypeError);
  }
  assert.throws(() => cotwSlug(week(), 'att'), TypeError);
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
  const universe = contentUniverseSlugs({ shipped: SHIPPED });
  const cotw = [...universe].filter(isCotwSlug);
  assert.equal(cotw.length, 22);
  for (const slug of cotw) assert.ok(universe.has(cotwTwinSlug(slug)), slug);
});

test('the pending-visibility invariant fails when a producer stops being read', () => {
  // The July 2026 state reconstructed exactly: the shared manifest alone, which is what
  // the console used to derive its universe from. Every one of the 22 built
  // Case-of-the-Week pages falls outside it while reviewed.json still calls them pending.
  const manifestOnly = new Set([
    ...MANIFEST.md.map(([, slug]) => slug),
    ...MANIFEST.tools.map(([, slug]) => slug),
  ]);
  const allowlist = new Set(NOT_REVIEWABLE_IN_CONSOLE);
  const pending = Object.entries(REVIEWED)
    .filter(([, entry]) => entry && typeof entry === 'object' && entry.status === 'pending')
    .map(([slug]) => slug);

  assert.equal(pending.length, 24);
  const invisibleBefore = pending.filter(slug => !manifestOnly.has(slug) && !allowlist.has(slug));
  assert.equal(invisibleBefore.length, 24);
  assert.equal(invisibleBefore.filter(isCotwSlug).length, 22);
  // The two that are NOT Case-of-the-Week pages are the resident-only role-play tools —
  // the ones #517's allowlist called undeployed while the resident site served them.
  assert.deepEqual(
    invisibleBefore.filter(slug => !isCotwSlug(slug)).sort(),
    ['rp-agitation.html', 'rp-brief-psych.html'],
  );

  // Reading the one derived listing, nothing pending is unreachable and nothing is excluded.
  const universe = contentUniverseSlugs({ shipped: SHIPPED });
  assert.deepEqual(pending.filter(slug => !universe.has(slug) && !allowlist.has(slug)), []);
  // …and no exclusion masks a live item. The list is empty; see content-universe.mjs.
  assert.deepEqual(NOT_REVIEWABLE_IN_CONSOLE.filter(slug => universe.has(slug)), []);
  assert.deepEqual([...NOT_REVIEWABLE_IN_CONSOLE], []);
});
