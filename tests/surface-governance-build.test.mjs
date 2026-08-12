// Build-contract tests for the surface-governance QA gate (check-static-site.mjs
// §10) — task-3-brief.md, Step 1. Each test spawns the REAL checker against a
// synthetic nav/search/tools/governance tree (never the real repo's reviewed.json,
// which is unmigrated — see the task brief's "CRITICAL production-state facts").
//
// Fixture conventions mirror _prototypes/sp-interview/tests/ci-build-contract.test.mjs
// (the only other suite that spawns check-static-site.mjs against ad hoc fixtures):
// a minimal FIXTURE_INDEX_HTML (so §5c's shell CDN/storage scan reports clean) and a
// sibling <site>.source-map.json seeded from the REAL site_manifest.json's wired
// sources (so §7's orphaned-source scan — which always walks the real repo tree
// regardless of the fixture site's own contents — reports clean too).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = path.join(
  ROOT,
  '13_Faculty_Resources/_automation/site_build/check-static-site.mjs',
);
const MANIFEST = path.join(
  ROOT,
  '13_Faculty_Resources/_automation/site_build/site_manifest.json',
);

const FIXTURE_INDEX_HTML = '<!doctype html><html><head><title>Fixture Shell</title>'
  + '<meta name="viewport" content="width=device-width"></head><body></body></html>';

function run(site) {
  return spawnSync(process.execPath, [CHECKER, site], { encoding: 'utf8' });
}

function seedSourceMap(site) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const sources = [...manifest.tools, ...manifest.md, ...(manifest.toolAssets || [])]
    .map(([source]) => source);
  fs.writeFileSync(`${site}.source-map.json`, JSON.stringify({ sources }));
}

function writeJson(target, value) {
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const PENDING_TRIPLET = { status: 'pending', riskKind: 'clinical', riskLevel: 'high' };
const REVIEWED_TRIPLET = { status: 'reviewed', riskKind: 'general', riskLevel: 'low' };

function pendingBlock() {
  return '<!-- SURFACE-GOVERNANCE:START -->'
    + '<section class="surface-governance-pending-high" role="alert">'
    + '<strong>Pending faculty review</strong>'
    + '<p>Synthetic fixed warning text</p>'
    + '</section>'
    + '<!-- SURFACE-GOVERNANCE:END -->';
}

function reviewedBlock() {
  return '<!-- SURFACE-GOVERNANCE:START -->'
    + '<div class="surface-governance-receipt" role="status">'
    + 'Reviewed by Synthetic Reviewer, MD on 2026-07-26'
    + '</div>'
    + '<!-- SURFACE-GOVERNANCE:END -->';
}

function toolHtml(block, extraBody = '') {
  return `<!doctype html><html><head><title>Fixture</title>`
    + `<meta name="viewport" content="width=device-width"></head>`
    + `<body>${block}${extraBody}</body></html>`;
}

/**
 * A fully governed, internally consistent synthetic site:
 *   content/page.md          — reviewed page
 *   tools/pending.html       — pending/clinical/high tool, one injected block
 *   tools/reviewed.html      — reviewed/general/low tool, one injected block, PLUS
 *                              unrelated page copy that happens to say the phrase
 *                              "Pending faculty review" OUTSIDE the injected block
 *                              (must never be mistaken for a governance drift).
 */
function createGovernedSite() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-governance-build-'));
  fs.mkdirSync(path.join(root, 'tools'));
  fs.mkdirSync(path.join(root, 'content'));
  fs.writeFileSync(path.join(root, 'index.html'), FIXTURE_INDEX_HTML);
  fs.writeFileSync(path.join(root, 'content', 'page.md'), '# Synthetic page\n');
  fs.writeFileSync(path.join(root, 'tools', 'pending.html'), toolHtml(pendingBlock()));
  fs.writeFileSync(
    path.join(root, 'tools', 'reviewed.html'),
    toolHtml(
      reviewedBlock(),
      '<p>Some draft questions in this bank still show &quot;Pending faculty review&quot; until attested.</p>',
    ),
  );
  writeJson(path.join(root, 'nav.json'), [{
    section: 'Synthetic',
    items: [
      { t: 'Page', f: 'page.md', k: 'md', governance: REVIEWED_TRIPLET },
      { t: 'Pending Tool', f: 'pending.html', k: 'tool', governance: PENDING_TRIPLET },
      { t: 'Reviewed Tool', f: 'reviewed.html', k: 'tool', governance: REVIEWED_TRIPLET },
    ],
  }]);
  writeJson(path.join(root, 'search-index.json'), {
    version: 1,
    n: 3,
    synonyms: {},
    postings: {},
    df: {},
    docs: [
      { t: 'Page', f: 'page.md', k: 'md', sec: 'Synthetic', snip: '', governance: REVIEWED_TRIPLET },
      { t: 'Pending Tool', f: 'pending.html', k: 'tool', sec: 'Synthetic', snip: '', governance: PENDING_TRIPLET },
      { t: 'Reviewed Tool', f: 'reviewed.html', k: 'tool', sec: 'Synthetic', snip: '', governance: REVIEWED_TRIPLET },
    ],
  });
  writeJson(path.join(root, 'governance.json'), {
    schemaVersion: 1,
    site: 'ms3',
    items: {
      'page.md': {
        kind: 'page', ...REVIEWED_TRIPLET,
        reviewer: 'Synthetic Reviewer, MD', reviewedAt: '2026-07-26',
      },
      'pending.html': {
        kind: 'tool', ...PENDING_TRIPLET,
        reviewer: 'Pending faculty review', reviewedAt: '2026-07-26',
        reason: 'Synthetic clinical review is pending',
        warning: 'Synthetic fixed warning text',
      },
      'reviewed.html': {
        kind: 'tool', ...REVIEWED_TRIPLET,
        reviewer: 'Synthetic Reviewer, MD', reviewedAt: '2026-07-26',
      },
    },
  });
  seedSourceMap(root);
  return root;
}

function cleanup(site) {
  fs.rmSync(site, { recursive: true, force: true });
  fs.rmSync(`${site}.source-map.json`, { force: true });
}

test('accepts one internally consistent governed site, including an isolated pending-copy mention', () => {
  const site = createGovernedSite();
  try {
    const result = run(site);
    const output = result.stdout + result.stderr;
    assert.equal(result.status, 0, output);
    assert.doesNotMatch(output, /nav governance|search governance|direct status marker|pending-review copy|reviewed\.json must not/i);
  } finally {
    cleanup(site);
  }
});

test('skips §10 entirely for a fixture site with no governance.json and no governed nav items', () => {
  // Same shape the pre-existing sp-interview build-contract fixtures use: a plain
  // nav item with no `.governance` key, no governance.json, no search-index.json.
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-governance-legacy-'));
  try {
    fs.mkdirSync(path.join(site, 'tools'));
    fs.writeFileSync(path.join(site, 'index.html'), FIXTURE_INDEX_HTML);
    fs.writeFileSync(
      path.join(site, 'tools', 'fixture.html'),
      '<!doctype html><title>Fixture</title><meta name="viewport" content="width=device-width"><!-- [RC-META] -->',
    );
    writeJson(path.join(site, 'nav.json'), [
      { section: 'Fixture', items: [{ t: 'Fixture', k: 'tool', f: 'fixture.html' }] },
    ]);
    seedSourceMap(site);

    const result = run(site);
    const output = result.stdout + result.stderr;
    assert.equal(result.status, 0, output);
    assert.match(output, /§10 skipped/);
  } finally {
    cleanup(site);
  }
});

test('reviewed.json must not ship, in either a governed or a pre-governance site', () => {
  for (const build of [createGovernedSite, () => {
    const site = fs.mkdtempSync(path.join(os.tmpdir(), 'surface-governance-legacy-rv-'));
    fs.mkdirSync(path.join(site, 'tools'));
    fs.writeFileSync(path.join(site, 'index.html'), FIXTURE_INDEX_HTML);
    writeJson(path.join(site, 'nav.json'), []);
    seedSourceMap(site);
    return site;
  }]) {
    const site = build();
    try {
      fs.writeFileSync(path.join(site, 'reviewed.json'), '{}\n');
      const result = run(site);
      const output = result.stdout + result.stderr;
      assert.notEqual(result.status, 0, output);
      assert.match(output, /reviewed\.json must not be published/);
    } finally {
      cleanup(site);
    }
  }
});

test('hard-fails when nav claims governance but governance.json is missing', () => {
  const site = createGovernedSite();
  try {
    fs.rmSync(path.join(site, 'governance.json'));
    const result = run(site);
    const output = result.stdout + result.stderr;
    assert.notEqual(result.status, 0, output);
    assert.match(output, /governance\.json missing from built site/);
  } finally {
    cleanup(site);
  }
});

test('hard-fails on an invalid governance.json site value', () => {
  const site = createGovernedSite();
  try {
    const governancePath = path.join(site, 'governance.json');
    const gov = JSON.parse(fs.readFileSync(governancePath, 'utf8'));
    gov.site = 'sandbox-typo';
    writeJson(governancePath, gov);

    const result = run(site);
    const output = result.stdout + result.stderr;
    assert.notEqual(result.status, 0, output);
    assert.match(output, /governance\.json has an invalid site value: "sandbox-typo"/);
  } finally {
    cleanup(site);
  }
});

test('hard-fails on nav and search governance drift', () => {
  const site = createGovernedSite();
  try {
    const navPath = path.join(site, 'nav.json');
    const nav = JSON.parse(fs.readFileSync(navPath, 'utf8'));
    nav[0].items[1].governance = { ...PENDING_TRIPLET, riskLevel: 'moderate' };
    writeJson(navPath, nav);

    const searchPath = path.join(site, 'search-index.json');
    const search = JSON.parse(fs.readFileSync(searchPath, 'utf8'));
    delete search.docs[2].governance;
    writeJson(searchPath, search);

    const result = run(site);
    const output = result.stdout + result.stderr;
    assert.notEqual(result.status, 0, output);
    assert.match(output, /nav governance mismatch: pending\.html/);
    assert.match(output, /search governance missing: reviewed\.html/);
  } finally {
    cleanup(site);
  }
});

test('hard-fails when a tool carries zero or more than one status marker block', () => {
  const zero = createGovernedSite();
  const duplicated = createGovernedSite();
  try {
    fs.writeFileSync(path.join(zero, 'tools', 'pending.html'), toolHtml(''));
    const zeroResult = run(zero);
    const zeroOutput = zeroResult.stdout + zeroResult.stderr;
    assert.notEqual(zeroResult.status, 0, zeroOutput);
    assert.match(zeroOutput, /direct status marker count: pending\.html \(found 0, expected 1\)/);

    fs.writeFileSync(
      path.join(duplicated, 'tools', 'pending.html'),
      toolHtml(pendingBlock() + pendingBlock()),
    );
    const duplicatedResult = run(duplicated);
    const duplicatedOutput = duplicatedResult.stdout + duplicatedResult.stderr;
    assert.notEqual(duplicatedResult.status, 0, duplicatedOutput);
    assert.match(duplicatedOutput, /direct status marker count: pending\.html \(found 2, expected 1\)/);
  } finally {
    cleanup(zero);
    cleanup(duplicated);
  }
});

test('hard-fails when a reviewed tool\'s OWN governance block still carries pending-review copy', () => {
  const site = createGovernedSite();
  try {
    // Corrupt the injected block itself (not the surrounding page copy, which the
    // happy-path test above already proves is safe to ignore).
    fs.writeFileSync(
      path.join(site, 'tools', 'reviewed.html'),
      toolHtml(
        '<!-- SURFACE-GOVERNANCE:START -->'
          + '<div class="surface-governance-receipt" role="status">Pending faculty review</div>'
          + '<!-- SURFACE-GOVERNANCE:END -->',
      ),
    );
    const result = run(site);
    const output = result.stdout + result.stderr;
    assert.notEqual(result.status, 0, output);
    assert.match(output, /reviewed tool carries pending-review copy: reviewed\.html/);
  } finally {
    cleanup(site);
  }
});
