/**
 * The digest is implemented TWICE, and this is the test that makes that safe.
 *
 * `13_Faculty_Resources/_automation/attestation_hash.py` is the rule the governance tools
 * and the build gate enforce; `faculty-console/attestation-hash.mjs` is the twin the faculty
 * console computes with, so that writing a hash on attest and reading staleness back needs no
 * Python in a Netlify function. Two implementations of one rule is a drift generator unless
 * something compares their BYTES — a digest that differs by one escaped character rereads as
 * "every page drifted", which is indistinguishable from the defect the hash exists to catch.
 *
 * So the comparison here is deliberately not "both are 40 hex characters":
 *
 *   · every shipped slug's MANIFEST is compared as text before its digest, so a divergence
 *     names the line that differs rather than an opaque hash mismatch. Every SHIPPED slug, not
 *     every reviewed one: the console computes a digest when it attests a pending page, so the
 *     pages that most need parity are the ones not yet reviewed — and a set read off
 *     reviewed.json is the faculty's queue, which demoting or draining would shrink under the
 *     test (CLAUDE.md: a test may not depend on live governance state);
 *   · every topic_meta record's canonical bytes are compared as bytes (base64 over the wire),
 *     because key order, float formatting and `ensure_ascii=False` are exactly where a JSON
 *     canonicaliser silently disagrees, and comparing digests alone would only say "one of the
 *     74 records differs somehow";
 *   · the two governance strings are compared, because a stale entry's reason is rendered by
 *     the console and by the Python projection, and they must read identically.
 *
 * What this test does NOT assert is that each slug's computed digest equals the `contentHash`
 * stored in reviewed.json. Most of them do not, and that is the intended state: the 2026-09-18
 * backfill bound every reviewed row to the text as it stood then, and every page edited since
 * is legitimately stale until the owner re-attests through the console. Asserting a match would
 * make an ordinary content edit fail the test suite. The match count is REPORTED instead.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PENDING_SENTINEL,
  STALE_REASON,
  blobSha,
  canonicalTopicMetaRecord,
  digestFromManifest,
  manifestForSlug,
  sourcesForSlug,
} from '../faculty-console/attestation-hash.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTOMATION = path.join(repo, '13_Faculty_Resources/_automation');
const SHIPPED_PAGES = '13_Faculty_Resources/_automation/site_build/shipped_pages.json';
const REVIEWED = '13_Faculty_Resources/reviewed.json';
const TOPIC_META = 'topic_meta.json';

// One process, one job spec: the slugs go in together and the manifests come back together,
// because spawning python per slug would turn a 130-slug corpus into a 130-process test.
const PYTHON = `
import base64, json, sys
payload = json.load(sys.stdin)
sys.path.insert(0, payload["automation"])
import attestation_hash as ah
from pathlib import Path

root = Path(payload["root"])
shipped = json.loads((root / payload["shipped"]).read_text(encoding="utf-8"))
meta = json.loads((root / payload["topicMeta"]).read_text(encoding="utf-8"))
out = {
    "constants": {"stale": ah.STALE_REASON, "pending": ah.PENDING_SENTINEL},
    "slugs": {},
    "records": {},
}
for slug in payload["slugs"]:
    paths = ah.sources_for_slug(shipped, slug)
    sources = {p: (root / p).read_bytes() for p in paths}
    try:
        manifest = ah.manifest_for_slug(slug, sources, meta.get(slug))
    except ah.AttestationHashError:
        out["slugs"][slug] = {"error": "AttestationHashError"}
        continue
    out["slugs"][slug] = {
        "manifest": manifest,
        "digest": ah.blob_sha(manifest.encode("utf-8")),
    }
for slug, record in meta.items():
    if isinstance(record, dict):
        out["records"][slug] = base64.b64encode(
            ah.canonical_topic_meta_record(record)
        ).decode("ascii")
json.dump(out, sys.stdout)
`;

function python(job) {
  const proc = spawnSync('python3', ['-c', PYTHON], {
    cwd: repo,
    input: JSON.stringify({ automation: AUTOMATION, ...job }),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
  });
  assert.equal(proc.status, 0, `python failed: ${proc.stderr}`);
  return JSON.parse(proc.stdout);
}

function readJson(root, relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

// The JS half of one slug, computed the way the console computes it: blob shas first,
// then a manifest over them. Source bytes come off disk here because there is no git
// tree to read in a test; in the console they come from one recursive-tree call.
function jsManifest(root, shipped, topicMeta, slug) {
  const sources = {};
  for (const source of sourcesForSlug(shipped, slug)) {
    sources[source] = blobSha(fs.readFileSync(path.join(root, source)));
  }
  const record = Object.hasOwn(topicMeta, slug) ? topicMeta[slug] : undefined;
  return manifestForSlug(slug, sources, record);
}

const shippedDoc = readJson(repo, SHIPPED_PAGES);
const topicMetaDoc = readJson(repo, TOPIC_META);
const ledger = readJson(repo, REVIEWED);

// The parity set is the derived shipped listing, so the ledger decides nothing about what is
// compared. Its size is not pinned here: shipped_pages.py --check-build binds the listing to
// the real build output, and a floor on it would be one more number to move by hand.
const shippedSlugs = [...new Set(shippedDoc.pages.map(page => page.slug))].sort();

// Reviewed rows for pages a site actually ships -- read ONLY by the stored-hash format test
// at the bottom, which reports its counts rather than asserting them. A reviewed row with no
// source is a governance question (attestation_hash.LEDGER_ONLY_LEGACY), not a digest one.
const reviewedShipped = Object.keys(ledger)
  .filter(slug => ledger[slug]?.status === 'reviewed')
  .filter(slug => sourcesForSlug(shippedDoc, slug).length > 0)
  .sort();

const live = python({
  root: repo,
  shipped: SHIPPED_PAGES,
  topicMeta: TOPIC_META,
  slugs: shippedSlugs,
});

test('every shipped slug hashes identically in both implementations, reviewed or not', (t) => {
  assert.ok(shippedSlugs.length > 0, 'shipped_pages.json lists no pages: nothing was compared');
  for (const slug of shippedSlugs) {
    // A shipped slug Python refuses to hash would otherwise surface as "manifest differs"
    // against undefined; name it for what it is.
    assert.equal(live.slugs[slug]?.error, undefined, `${slug} ships but Python cannot hash it`);
    const manifest = jsManifest(repo, shippedDoc, topicMetaDoc, slug);
    // Manifest before digest: a text diff names the line, a hash diff names nothing.
    assert.equal(manifest, live.slugs[slug].manifest, `manifest differs for ${slug}`);
    assert.equal(digestFromManifest(manifest), live.slugs[slug].digest,
      `digest differs for ${slug}`);
  }
  t.diagnostic(`${shippedSlugs.length} shipped slugs compared `
    + `(${reviewedShipped.length} reviewed, ${shippedSlugs.length - reviewedShipped.length} not)`);
});

test('the governance strings are byte-identical across the two implementations', () => {
  assert.equal(STALE_REASON, live.constants.stale);
  assert.equal(PENDING_SENTINEL, live.constants.pending);
  // The template is formatted by both sides; the placeholder must survive verbatim.
  assert.match(STALE_REASON, /\{at\}/);
});

test('every topic_meta record canonicalises to identical bytes', () => {
  const records = Object.entries(topicMetaDoc)
    .filter(([, record]) => record !== null && typeof record === 'object'
      && !Array.isArray(record));
  assert.ok(records.length > 70, `expected the live topic_meta records, got ${records.length}`);
  for (const [slug, record] of records) {
    // Bytes, not digests: a Unicode, float or key-order divergence must name the record
    // and show the text, which a mismatched sha1 never would.
    assert.equal(
      canonicalTopicMetaRecord(record).toString('base64'),
      live.records[slug],
      `canonical bytes differ for ${slug}`,
    );
  }
});

test('facultyReview is excluded, so attesting a page cannot invalidate its own hash', () => {
  const slug = Object.keys(topicMetaDoc).find(key => topicMetaDoc[key]?.facultyReview);
  assert.ok(slug, 'expected at least one topic_meta record with a facultyReview block');
  const withoutBlock = { ...topicMetaDoc[slug] };
  delete withoutBlock.facultyReview;
  assert.equal(
    canonicalTopicMetaRecord(topicMetaDoc[slug]).toString('base64'),
    canonicalTopicMetaRecord(withoutBlock).toString('base64'),
  );
  assert.equal(canonicalTopicMetaRecord(topicMetaDoc[slug]).includes('facultyReview'), false);
});

test('a two-source slug, a non-record topic_meta value, and an unshipped slug agree too', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'attestation-hash-parity-'));
  try {
    fs.mkdirSync(path.join(root, 'zz_second'), { recursive: true });
    fs.mkdirSync(path.join(root, 'aa_first'), { recursive: true });
    // Written out of sorted order on purpose: the manifest must be sorted by PATH, not by
    // the order the shipped document happens to list the sources in.
    fs.writeFileSync(path.join(root, 'zz_second/resident.md'), 'Resident half — ±β\n');
    fs.writeFileSync(path.join(root, 'aa_first/ms3.md'), 'MS3 half\n');
    const shipped = {
      pages: [{
        slug: 'pair.md',
        source: 'zz_second/resident.md',
        extraSources: ['aa_first/ms3.md'],
      }, {
        // plain.md must be SHIPPED here, or Python returns AttestationHashError for it
        // (no sources) and the non-record comparison below never happens — the JS side
        // would be asserting against itself while reading as a parity check.
        slug: 'plain.md',
        source: 'aa_first/ms3.md',
      }],
    };
    const topicMeta = {
      'pair.md': {
        title: 'Pair — a record with non-ASCII: ≥ 5 · ü',
        facultyReview: { status: 'reviewed', reviewer: 'Someone' },
        b: [3, 2, 1],
        a: { z: true, y: null },
      },
      'plain.md': 'not a record at all',
    };
    fs.writeFileSync(path.join(root, 'shipped.json'), JSON.stringify(shipped));
    fs.writeFileSync(path.join(root, 'meta.json'), JSON.stringify(topicMeta));

    const slugs = ['pair.md', 'plain.md', 'absent.md'];
    const expected = python({
      root,
      shipped: 'shipped.json',
      topicMeta: 'meta.json',
      slugs,
    });

    const pair = jsManifest(root, shipped, topicMeta, 'pair.md');
    assert.equal(pair, expected.slugs['pair.md'].manifest);
    assert.equal(digestFromManifest(pair), expected.slugs['pair.md'].digest);
    assert.equal(pair.split('\n')[0].startsWith('aa_first/ms3.md '), true,
      'sources are hashed in sorted path order');
    assert.equal(pair.split('\n')[2], 'topic_meta ' + blobSha(
      canonicalTopicMetaRecord(topicMeta['pair.md'])));

    // A topic_meta value that is not a mapping is NO record: one source line, no topic_meta
    // line — the same decision on both sides, or the two disagree about every such slug.
    // Compared against PYTHON's manifest and digest, not only against JS's own shape: the
    // shape assertions alone would pass even if Python decided the opposite.
    const plain = jsManifest(root, shipped, topicMeta, 'plain.md');
    assert.equal(plain.split('\n').filter(Boolean).length, 1);
    assert.equal(plain.includes('topic_meta'), false);
    assert.equal(plain, expected.slugs['plain.md'].manifest,
      'Python and JS disagree about a topic_meta value that is not a record');
    assert.equal(digestFromManifest(plain), expected.slugs['plain.md'].digest);

    // An unshipped slug has no sources, and a digest over nothing is refused on both sides
    // rather than returned as a plausible-looking hash.
    assert.equal(expected.slugs['absent.md'].error, 'AttestationHashError');
    assert.throws(() => manifestForSlug('absent.md', {}, undefined), /no attested sources/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('working-tree bytes hash to the same blob sha git stores, for every shipped source',
  (t) => {
    // THE PREMISE OF THE CONSOLE'S READ SIDE. Python hashes the bytes on disk; the console
    // hashes nothing at all — it reads blob shas straight out of ONE recursive-tree API
    // call. The two agree only while `git hash-object --no-filters <path>` equals the tree's
    // sha, which a clean filter (core.autocrlf, an LFS smudge) breaks silently: every page
    // would read as drifted, which is indistinguishable from the defect the hash exists for.
    const sources = [...new Set(shippedDoc.pages.flatMap(
      page => [page.source, ...(page.extraSources ?? [])].filter(Boolean)))].sort();
    assert.ok(sources.length > 100, `expected the shipped source paths, got ${sources.length}`);

    // A dirty path has working-tree bytes git's tree does not claim to match, so the
    // comparison would be meaningless. SKIP with the reason printed — never a silent pass.
    const dirty = spawnSync('git', ['status', '--porcelain', '--', ...sources],
      { cwd: repo, encoding: 'utf8' });
    assert.equal(dirty.status, 0, `git status failed: ${dirty.stderr}`);
    if (dirty.stdout.trim() !== '') {
      const paths = dirty.stdout.trim().split('\n').map(line => line.slice(3)).join(', ');
      t.skip(`shipped sources are modified in the working tree, so tree shas cannot be `
        + `compared to disk bytes: ${paths}`);
      return;
    }

    const listed = spawnSync('git', ['ls-tree', '-r', '-z', 'HEAD'],
      { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    assert.equal(listed.status, 0, `git ls-tree failed: ${listed.stderr}`);
    const tree = new Map(listed.stdout.split('\0').filter(Boolean).map((record) => {
      const [meta, filePath] = record.split('\t');
      return [filePath, meta.split(/\s+/)[2]];
    }));

    for (const source of sources) {
      const inTree = tree.get(source);
      assert.ok(inTree, `${source} ships but is not tracked at HEAD`);
      assert.equal(blobSha(fs.readFileSync(path.join(repo, source))), inTree,
        `${source}: working-tree bytes do not hash to the blob sha git stores `
        + `(a checkout filter is rewriting it — the console would read every page as drifted)`);
    }
    t.diagnostic(`${sources.length} shipped source paths hash identically on disk and in HEAD`);
  });

test('the ledger stores 40-hex git blob shas, and the drifted count is reported', (t) => {
  let bound = 0;
  let stored = 0;
  for (const slug of reviewedShipped) {
    const hash = ledger[slug].contentHash;
    if (hash === undefined) continue;
    stored += 1;
    assert.match(hash, /^[a-f0-9]{40}$/, `${slug} stores something that is not a blob sha`);
    if (hash === live.slugs[slug].digest) bound += 1;
  }
  // REPORTED, never asserted: a page edited after its review is legitimately stale until
  // the owner re-attests, so pinning this number would fail the suite on ordinary edits.
  t.diagnostic(`${bound} of ${stored} stored hashes match the current tree `
    + `(${reviewedShipped.length} reviewed shipped rows)`);
});
