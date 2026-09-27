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
 * The canonical JSON text of any JSON value: keys sorted by code point at every level, no
 * whitespace, raw UTF-8. Python twin: `json.dumps(v, sort_keys=True, separators=(",", ":"),
 * ensure_ascii=False)`. Exported because the attestation ledger (faculty-console/ledger.mjs)
 * signs and chains exactly this form; one canonicaliser, not two.
 */
export function canonicalJson(value) {
  return serialize(value);
}

// The one registry that is both page text (#783 lists it in the question tools'
// `extraSources`) and an attestation ledger (each item's `status`). Its manifest line hashes
// the bank WITHOUT any item's `status` — see `canonicalQuestionBank`. Python twin:
// QUESTION_BANK_PATH / canonical_question_bank / source_blob_sha in attestation_hash.py.
export const QUESTION_BANK_PATH = 'question_bank.json';
const QUESTION_BANK_GOVERNANCE_KEYS = new Set(['status']);

/**
 * Canonical bytes of question_bank.json with every item's `status` removed.
 *
 * Signing a question must not drift the two question tools' own attestations, and a build
 * that overlays question sign-offs from the attestation ledger (ADR-003) must not either.
 * `retired` stays: it changes which questions ship, which is content. Anything that is not
 * a JSON object with an `items` list is returned unchanged, exactly as the Python twin does,
 * so a malformed bank drifts rather than throws.
 */
export function canonicalQuestionBank(data) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  let doc;
  try {
    doc = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return bytes;
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || !Array.isArray(doc.items)) {
    return bytes;
  }
  const body = { ...doc };
  body.items = doc.items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const kept = {};
    for (const [key, value] of Object.entries(item)) {
      if (!QUESTION_BANK_GOVERNANCE_KEYS.has(key)) kept[key] = value;
    }
    return kept;
  });
  return Buffer.from(serialize(body), 'utf8');
}

/**
 * The value a manifest line carries for one source file: its git blob SHA, computed over
 * the canonical question bank when the source IS the question bank. Callers that already
 * hold a tree's blob SHAs (the console) must replace the question bank's entry with this.
 */
export function sourceBlobSha(path, data) {
  return path === QUESTION_BANK_PATH ? blobSha(canonicalQuestionBank(data)) : blobSha(data);
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

// ---------------------------------------------------------------------------------------
// FINGERPRINT v2 — the clinical text (`clinicalHash`)
// ---------------------------------------------------------------------------------------
//
// Ruling (Joshua Moss, MD, 2026-09-26): a change to a page's CITATIONS that leaves its
// clinical claims unchanged keeps the signature. The rules, their reasons, the measurement
// behind them and the risk they accept are written once, in attestation_hash.py above
// CLINICAL_FINGERPRINT; this is the byte-for-byte twin, pinned by
// tests/attestation-hash-parity.test.mjs over every shipped Markdown source.
//
// The regex dialect is deliberately plain so both engines read it identically: explicit
// ASCII classes (no \w \d \s), `[^\n]` (no `.`), no `i` flag, and every anchored rule run on
// one line at a time with no `m` flag.

export const CLINICAL_FINGERPRINT = 'fingerprint clinical/1';
const CLINICAL_RECORD_EXCLUDED_KEYS = new Set(['facultyReview', 'evidenceIds']);

const REFERENCE_SECTION_NAMES = new Set([
  'references', 'reference', 'sources', 'bibliography', 'works cited', 'citations',
]);
const HEADING = /^(#{1,6})[ \t]+([^\n]*)$/;
const HEADING_MARKER = /^[ \t]*#{1,6}[ \t]+/;
const LIST_ITEM = /^[ \t]*(?:[-*+]|[0-9]+[.)])[ \t]+/;
const YEAR = /(?:^|[^0-9])(?:19|20)[0-9][0-9](?![0-9])/;
const KEY_PAPER_LINE = /^[ \t]*(?:[-*+][ \t]+)?\*\*[Kk]ey [Pp]apers?:\*\*/;
const FOOTNOTE_REF = /\[\^[^\]\n]+\]/g;
const CITATION_HOST = 'https?://(?:(?:dx\\.)?doi\\.org/|(?:pubmed|pmc)\\.ncbi\\.nlm\\.nih\\.gov/'
  + '|www\\.ncbi\\.nlm\\.nih\\.gov/(?:pmc|pubmed)/|europepmc\\.org/)';
const CITATION_LINK_TARGET = new RegExp(`\\]\\(${CITATION_HOST}[^) \\t\\n]*(?:[ \\t]+"[^"\\n]*")?\\)`, 'g');
const CITATION_URL = new RegExp(`<?${CITATION_HOST}[^ \\t\\n<>)\\]]*>?`, 'g');
const DOI = /(?<![A-Za-z0-9_])[Dd][Oo][Ii]:[ \t]*10\.[0-9]{4,9}\/[^ \t\n;,)\]]+/g;
const PMID = /(?<![A-Za-z0-9_])(?:PMID:?[ \t]*[0-9]+|PMCID:?[ \t]*PMC[0-9]+|PMC[0-9]{4,})(?![A-Za-z0-9_])/g;
const NUMERIC_ANCHOR = /\[[0-9]+(?:[ \t]*[,–-][ \t]*[0-9]+)*(?:[ \t]*✓)?\](?!\()/g;
const PAREN = /\(([^()\n]*)\)/g;
const NAME_LETTERS = 'A-Za-zÀ-ÖØ-öø-ÿ';
const NAME = `[A-Z][${NAME_LETTERS}'’-]+`;
const CITE_PIECE = new RegExp(
  `^(?:see(?: also)?|e\\.g\\.,?|cf\\.)?[ \\t]*${NAME}`
  + `(?:[ \\t]+(?:et al\\.?|(?:and|&)[ \\t]+${NAME}))?,?`
  + `(?:[ \\t]+[*_]?[A-Z][${NAME_LETTERS}0-9 .&:-]*[*_]?,?)?`
  + '[ \\t]+(?:19|20)[0-9][0-9][a-z]?$',
);
const STRONG = /\*\*|__/g;
const EM_OPEN = /(?<![A-Za-z0-9_*])[*_](?=[^ \t\n*_])/g;
const EM_CLOSE = /(?<=[^ \t\n*_])[*_](?![A-Za-z0-9_*])/g;
const EMPTY_PARENS = /\([ \t]*[;,]?[ \t]*\)/g;
const WHITESPACE = /[ \t\n\r\f\v]+/g;
const SPACE_BEFORE_PUNCTUATION = / +(?=[.,;:!?)])/g;
const EDGE_BLANKS = /^[ \t]+|[ \t]+$/g;

// Spaces and tabs only: String.prototype.trim and Python's str.strip disagree on the rest.
function stripBlanks(text) {
  return text.replace(EDGE_BLANKS, '');
}

function sectionName(headingText) {
  let name = stripBlanks(headingText.replace(/[*_`]/g, ''));
  name = stripBlanks(name.replace(/[ \t#]*$/, ''));
  name = stripBlanks(name.replace(/:+$/, ''));
  name = name.replace(/[A-Z]/g, letter => letter.toLowerCase());
  return name.replace(/^[0-9]+[.)]?[ \t]+/, '');
}

function clinicalLines(text) {
  const kept = [];
  let sectionLevel = 0;
  for (const line of text.split('\n')) {
    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      if (sectionLevel && level <= sectionLevel) sectionLevel = 0;
      if (!sectionLevel && REFERENCE_SECTION_NAMES.has(sectionName(heading[2]))) {
        sectionLevel = level;
        continue;
      }
    } else if (sectionLevel && LIST_ITEM.test(line) && YEAR.test(line)) {
      continue;
    }
    if (KEY_PAPER_LINE.test(line)) continue;
    kept.push(line.replace(HEADING_MARKER, ''));
  }
  return kept.join('\n');
}

function stripParentheticalCitations(text) {
  return text.replace(PAREN, (whole, inner) => {
    const pieces = inner.split(';').map(stripBlanks).filter(Boolean);
    const kept = pieces.filter(piece => !CITE_PIECE.test(piece));
    if (kept.length === pieces.length) return whole;
    return kept.length ? `(${kept.join('; ')})` : '';
  });
}

/** The clinical text of a Markdown page: its words with citation apparatus removed. */
export function clinicalMarkdown(text) {
  let out = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  out = clinicalLines(out);
  out = out.replace(FOOTNOTE_REF, '');
  out = out.replace(CITATION_LINK_TARGET, ']');
  out = out.replace(CITATION_URL, '');
  out = out.replace(DOI, '');
  out = out.replace(PMID, '');
  out = out.replace(NUMERIC_ANCHOR, '');
  out = stripParentheticalCitations(out);
  out = out.replace(STRONG, '');
  out = out.replace(EM_OPEN, '');
  out = out.replace(EM_CLOSE, '');
  out = out.replace(EMPTY_PARENS, '');
  out = out.replace(WHITESPACE, ' ');
  return stripBlanks(out.replace(SPACE_BEFORE_PUNCTUATION, ''));
}

/** Whether a source is hashed over its clinical text (Markdown) rather than its bytes. */
export function isClinicalMarkdownSource(path) {
  return typeof path === 'string' && path.endsWith('.md');
}

/**
 * A clinical manifest line's value for one source: the blob sha of a Markdown source's
 * clinical text; for anything else — and for Markdown that is not valid UTF-8 — exactly the
 * v1 value. `ignoreBOM` keeps a leading U+FEFF as text, as Python's utf-8 codec does.
 */
export function clinicalSourceSha(path, data) {
  if (!isClinicalMarkdownSource(path)) return sourceBlobSha(path, data);
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return sourceBlobSha(path, bytes);
  }
  return blobSha(Buffer.from(clinicalMarkdown(text), 'utf8'));
}

/** A topic_meta record's canonical bytes without `facultyReview` or `evidenceIds`. */
export function canonicalClinicalRecord(record) {
  const body = {};
  for (const [key, value] of Object.entries(record)) {
    if (!CLINICAL_RECORD_EXCLUDED_KEYS.has(key)) body[key] = value;
  }
  return Buffer.from(serialize(body), 'utf8');
}

/**
 * The clinical manifest: a version line, then v1's shape over clinical values. `sources`
 * maps each path to its CLINICAL value (clinicalSourceSha; for a non-Markdown source that is
 * the same value v1 carries, so the console may pass its tree sha straight through).
 */
export function clinicalManifestForSlug(slug, sources, record) {
  const paths = Object.keys(sources || {}).sort(compareCodePoints);
  if (!paths.length) {
    throw new AttestationHashError(
      `${slug}: no attested sources — its digest would cover nothing`,
    );
  }
  const lines = [CLINICAL_FINGERPRINT, ...paths.map(path => `${path} ${sources[path]}`)];
  if (record !== null && typeof record === 'object' && !Array.isArray(record)) {
    lines.push(`topic_meta ${blobSha(canonicalClinicalRecord(record))}`);
  }
  return `${lines.join('\n')}\n`;
}
