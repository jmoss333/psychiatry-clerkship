import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let validateSurfaceGovernance;
try {
  ({ validateSurfaceGovernance } = await import(
    '../13_Faculty_Resources/_automation/site_build/surface-governance-check.mjs'
  ));
} catch {
  validateSurfaceGovernance = null;
}

const triplet = {
  status: 'pending',
  riskKind: 'clinical',
  riskLevel: 'high',
};
const CHECKER = fileURLToPath(new URL(
  '../13_Faculty_Resources/_automation/site_build/check-static-site.mjs',
  import.meta.url,
));

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function createSite() {
  const root = await mkdtemp(join(tmpdir(), 'surface-governance-build-'));
  await mkdir(join(root, 'tools'));
  await mkdir(join(root, 'content'));
  await writeFile(join(root, 'content', 'page.md'), '# Synthetic page\n', 'utf8');
  await writeFile(
    join(root, 'tools', 'tool.html'),
    '<!doctype html><!-- SURFACE-GOVERNANCE:START -->'
      + '<section class="surface-governance-pending-high" role="alert">'
      + 'Pending faculty review</section><!-- SURFACE-GOVERNANCE:END -->',
    'utf8',
  );
  await writeJson(join(root, 'nav.json'), [{
    section: 'Synthetic',
    items: [
      {
        t: 'Page',
        f: 'page.md',
        k: 'md',
        governance: {
          status: 'reviewed',
          riskKind: 'general',
          riskLevel: 'low',
        },
      },
      { t: 'Tool', f: 'tool.html', k: 'tool', governance: triplet },
    ],
  }]);
  await writeJson(join(root, 'search-index.json'), {
    version: 1,
    docs: [
      {
        t: 'Page',
        f: 'page.md',
        k: 'md',
        governance: {
          status: 'reviewed',
          riskKind: 'general',
          riskLevel: 'low',
        },
      },
      { t: 'Tool', f: 'tool.html', k: 'tool', governance: triplet },
    ],
    postings: {},
    df: {},
    synonyms: {},
  });
  await writeJson(join(root, 'governance.json'), {
    schemaVersion: 1,
    site: 'ms3',
    items: {
      'page.md': {
        kind: 'page',
        status: 'reviewed',
        riskKind: 'general',
        riskLevel: 'low',
        reviewer: 'Synthetic Reviewer, MD',
        reviewedAt: '2026-07-26',
      },
      'tool.html': {
        kind: 'tool',
        ...triplet,
        reviewer: 'Pending faculty review',
        reviewedAt: '2026-07-26',
        reason: 'Synthetic clinical review is pending',
        warning: 'Synthetic fixed warning',
      },
    },
  });
  await writeJson(join(root, 'tool-governance.json'), {
    schemaVersion: 1,
    contract: {},
    items: [{
      id: 'tools/tool',
      reviewStatus: 'needs-review',
      attestationStatus: 'needs-attestation',
      reviewCategory: 'clinical',
      safetySeverity: 'high',
    }],
  });
  return root;
}

test('accepts one internally consistent governed site', async t => {
  assert.equal(
    typeof validateSurfaceGovernance,
    'function',
    'the static gate must expose surface-governance validation',
  );
  const root = await createSite();
  t.after(() => rm(root, { recursive: true, force: true }));

  assert.deepEqual(validateSurfaceGovernance(root), []);
});

test('reviewed receipt validation ignores non-governance draft-item copy', async t => {
  const root = await createSite();
  t.after(() => rm(root, { recursive: true, force: true }));
  const reviewed = {
    status: 'reviewed',
    riskKind: 'clinical',
    riskLevel: 'high',
  };
  const nav = JSON.parse(await readFile(join(root, 'nav.json'), 'utf8'));
  nav[0].items[1].governance = reviewed;
  await writeJson(join(root, 'nav.json'), nav);
  const search = JSON.parse(await readFile(join(root, 'search-index.json'), 'utf8'));
  search.docs[1].governance = reviewed;
  await writeJson(join(root, 'search-index.json'), search);
  const governance = JSON.parse(await readFile(
    join(root, 'governance.json'), 'utf8',
  ));
  governance.items['tool.html'] = {
    kind: 'tool',
    ...reviewed,
    reviewer: 'Synthetic Reviewer, MD',
    reviewedAt: '2026-07-26',
  };
  await writeJson(join(root, 'governance.json'), governance);
  const envelope = JSON.parse(await readFile(
    join(root, 'tool-governance.json'), 'utf8',
  ));
  Object.assign(envelope.items[0], {
    reviewStatus: 'reviewed',
    attestationStatus: 'faculty-attested',
    reviewCategory: 'clinical',
    safetySeverity: 'high',
  });
  await writeJson(join(root, 'tool-governance.json'), envelope);
  await writeFile(
    join(root, 'tools', 'tool.html'),
    '<!doctype html><!-- SURFACE-GOVERNANCE:START -->'
      + '<div class="surface-governance-receipt" role="status">'
      + 'Reviewed by Synthetic Reviewer, MD</div>'
      + '<!-- SURFACE-GOVERNANCE:END -->'
      + '<p>Some draft questions show “Pending faculty review”.</p>',
    'utf8',
  );

  assert.deepEqual(validateSurfaceGovernance(root), []);
});

test('finds public raw ledgers and nav, search, tool, or envelope drift', async t => {
  assert.equal(typeof validateSurfaceGovernance, 'function');
  const root = await createSite();
  t.after(() => rm(root, { recursive: true, force: true }));

  await writeFile(join(root, 'reviewed.json'), '{}\n', 'utf8');
  const nav = JSON.parse(await readFile(join(root, 'nav.json'), 'utf8'));
  nav[0].items[1].governance.riskLevel = 'moderate';
  await writeJson(join(root, 'nav.json'), nav);
  const search = JSON.parse(await readFile(join(root, 'search-index.json'), 'utf8'));
  delete search.docs[1].governance;
  await writeJson(join(root, 'search-index.json'), search);
  await writeFile(join(root, 'tools', 'tool.html'), '<!doctype html>', 'utf8');
  const envelope = JSON.parse(await readFile(
    join(root, 'tool-governance.json'), 'utf8',
  ));
  envelope.items[0].reviewCategory = 'general';
  await writeJson(join(root, 'tool-governance.json'), envelope);

  const findings = validateSurfaceGovernance(root);

  assert.ok(findings.some(finding => finding.includes('reviewed.json must not be published')));
  assert.ok(findings.some(finding => finding.includes('nav governance mismatch: tool.html')));
  assert.ok(findings.some(finding => finding.includes('search governance missing: tool.html')));
  assert.ok(findings.some(finding => finding.includes('direct status marker count: tool.html')));
  assert.ok(findings.some(finding => finding.includes('tool envelope mismatch: tool.html')));
});

test('the static publish gate promotes governance drift to hard failures', async t => {
  const root = await createSite();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'reviewed.json'), '{}\n', 'utf8');

  const result = spawnSync(process.execPath, [CHECKER, root], {
    encoding: 'utf8',
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0);
  assert.match(output, /reviewed[.]json must not be published/);
});
