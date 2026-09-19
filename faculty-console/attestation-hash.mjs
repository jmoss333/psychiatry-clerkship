/**
 * The digest of a page's attested inputs — the JS twin of
 * `13_Faculty_Resources/_automation/attestation_hash.py`.
 *
 * WHY A TWIN AT ALL: the rule has to run in two places that cannot share a runtime. The
 * governance tools and the build gate are Python; the faculty console is a Netlify function,
 * and it is the only actor that may WRITE a hash — a review binds to the text it covered at
 * the moment the reviewer presses attest, which is a fact only the console knows. Shipping a
 * Python interpreter into a serverless function to compute one sha1 would be the larger risk.
 *
 * THE RULE (see the Python module's docstring for the reasoning behind each choice):
 *
 *     a.md 4a58007052a65fbc2fc3f910f2855f45a4058e74
 *     topic_meta e51494b9a628601e078505913ea6ff67d2039bad
 *
 * one line per source path the slug ships from, sorted by path, each line carrying that
 * file's git blob sha; then, only when the slug HAS a topic_meta record, one `topic_meta`
 * line over that record canonicalised with `facultyReview` removed. The digest is the git
 * blob sha of that manifest text.
 *
 * Choosing a git blob sha is what makes the console's read cheap: every value on the left is
 * already in one `GET /git/trees/<sha>?recursive=1`, so staleness for the whole queue costs
 * one API call and no page fetches.
 *
 * THIS FILE IS PINNED AGAINST THE PYTHON ONE, BYTE FOR BYTE, by
 * `tests/attestation-hash-parity.test.mjs` — every reviewed shipped slug's manifest text,
 * every topic_meta record's canonical bytes, and both governance strings. Two implementations
 * of one rule drift silently otherwise, and a digest that differs by a single escaped
 * character rereads as "every page drifted", which is exactly the alarm the hash exists to
 * raise for real. Change one side and the parity test is where you find out.
 */

import { createHash } from 'node:crypto';

// The sentinel a pending entry carries in `by`; not a signature.
export const PENDING_SENTINEL = 'Pending faculty review';

// The reason a drifted entry renders with. Byte-identical to the Python constant.
export const STALE_REASON =
  'Content changed since faculty review on {at}; awaiting re-attestation.';

/** A slug's digest cannot be computed from what is available. */
export class AttestationHashError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AttestationHashError';
  }
}

/** The git blob SHA of `data` — identical to `git hash-object --stdin`. */
export function blobSha(data) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  return createHash('sha1')
    .update(Buffer.from(`blob ${bytes.length}\0`, 'utf8'))
    .update(bytes)
    .digest('hex');
}

// Python's `sort_keys` orders by code point. JavaScript's default sort compares UTF-16 code
// units, which disagrees for astral keys (U+10000+ sorts before U+E000 there and after it in
// Python). No key in topic_meta.json is astral today; the day one is, this is why the two
// implementations still agree.
function compareCodePoints(left, right) {
  const a = Array.from(left);
  const b = Array.from(right);
  const shared = Math.min(a.length, b.length);
  for (let index = 0; index < shared; index += 1) {
    const delta = a[index].codePointAt(0) - b[index].codePointAt(0);
    if (delta !== 0) return delta;
  }
  return a.length - b.length;
}

// Written out rather than handed to JSON.stringify on a rebuilt object, because an object's
// own integer-like keys ("0", "1") enumerate in numeric order ahead of every string key — so
// re-sorting into a fresh object would silently disagree with Python for any record carrying
// one. Numbers go through JSON.stringify: JS renders an integral float as `1` where Python
// renders `1.0`, so a float in topic_meta.json would be a real divergence — there are none
// today, and the parity test compares bytes precisely so that one would be named, not hidden
// inside a mismatched digest.
function serialize(value) {
  if (Array.isArray(value)) return `[${value.map(serialize).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort(compareCodePoints);
    return `{${keys.map(key => `${JSON.stringify(key)}:${serialize(value[key])}`).join(',')}}`;
  }
  // JSON.stringify(undefined) is undefined; nothing parsed from JSON can be undefined, and
  // `null` is the honest rendering of a key that somehow is.
  return value === undefined ? 'null' : JSON.stringify(value);
}

/**
 * Canonical bytes of a topic_meta record: key-sorted, no whitespace, raw UTF-8.
 *
 * `facultyReview` is dropped: it records the act of attesting, so including it would make
 * every attestation invalidate itself. Non-ASCII stays raw UTF-8, matching Python's
 * `ensure_ascii=False`.
 *
 * Takes a mapping. Whether a given topic_meta value IS one is `manifestForSlug`'s decision,
 * made once there; do not re-decide it here or in a caller.
 */
export function canonicalTopicMetaRecord(record) {
  const body = {};
  for (const [key, value] of Object.entries(record)) {
    if (key !== 'facultyReview') body[key] = value;
  }
  return Buffer.from(serialize(body), 'utf8');
}

/**
 * Every source path the slug ships from: `source` first, then `extraSources`.
 *
 * Returns [] when no site ships the slug. Reads the RAW shipped_pages document on purpose:
 * `deriveContentUniverse` drops both keys, so routing through it would hash the page's title
 * and lose its text.
 */
export function sourcesForSlug(shippedDoc, slug) {
  const pages = shippedDoc && typeof shippedDoc === 'object' ? shippedDoc.pages : null;
  if (!Array.isArray(pages)) return [];
  const paths = [];
  for (const page of pages) {
    if (!page || typeof page !== 'object' || page.slug !== slug) continue;
    const source = page.source;
    if (typeof source === 'string' && source && !paths.includes(source)) paths.push(source);
    const extras = Array.isArray(page.extraSources) ? page.extraSources : [];
    for (const extra of extras) {
      if (typeof extra === 'string' && extra && !paths.includes(extra)) paths.push(extra);
    }
  }
  return paths;
}

/**
 * The manifest text for one slug: `path <blob sha>` per source, then `topic_meta`.
 *
 * `sources` maps each source path to its blob sha — in the console those come straight from
 * one recursive git tree. Refuses an empty mapping: a manifest over no sources would still
 * produce a plausible-looking digest, which is exactly the shape of a check that reports
 * success over nothing.
 *
 * A `record` that is not a mapping counts as NO record, decided here so every caller
 * inherits it, exactly as the Python module decides it once in `manifest_for_slug`.
 */
export function manifestForSlug(slug, sources, record) {
  const paths = Object.keys(sources || {}).sort(compareCodePoints);
  if (!paths.length) {
    throw new AttestationHashError(
      `${slug}: no attested sources — its digest would cover nothing`,
    );
  }
  const lines = paths.map(path => `${path} ${sources[path]}`);
  if (record !== null && typeof record === 'object' && !Array.isArray(record)) {
    lines.push(`topic_meta ${blobSha(canonicalTopicMetaRecord(record))}`);
  }
  return `${lines.join('\n')}\n`;
}

/** The slug's `contentHash`: the blob SHA of its manifest. */
export function digestFromManifest(manifest) {
  return blobSha(Buffer.from(manifest, 'utf8'));
}
