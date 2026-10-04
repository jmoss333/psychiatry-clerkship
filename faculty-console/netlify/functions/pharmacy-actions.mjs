// Medication reviews use the existing authenticated console gateway. No clinical text
// or browser-supplied attribution/hash is ever written by this module.
import { createHash } from 'node:crypto';

export const PHARMACY_PATH = 'pharmacy.json';
export const LABEL_RECEIPT_PATH = '13_Faculty_Resources/_automation/pharmacy/label_receipt.json';
const MAX_BYTES = 4 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const own = (value, key) => Object.hasOwn(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export class PharmacyActionError extends Error {
  constructor(code, message, status = 400) {
    super(message); this.code = `pharmacy.${code}`; this.status = status; this.issues = [];
  }
}
function refuse(code, message, status) { throw new PharmacyActionError(code, message, status); }

// Python json.dumps(sort_keys=True, ensure_ascii=False, separators=(',', ':')).
// The persisted hash inputs contain strings, booleans and integer indices. Refuse
// non-integer/unsafe numbers rather than invent cross-runtime float serialization.
function sortedKeys(value) {
  return Object.keys(value).sort((a, b) => {
    const aa = Array.from(a, c => c.codePointAt(0)), bb = Array.from(b, c => c.codePointAt(0));
    for (let i = 0; i < Math.min(aa.length, bb.length); i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
    return aa.length - bb.length;
  });
}
export function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0)) return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (object(value)) return `{${sortedKeys(value).map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  refuse('invalid_record', 'The saved medication contains an unsupported value.');
}
export function hash(value) { return createHash('sha256').update(canonicalJson(value)).digest('hex'); }
function pathValue(value, path, arrays = false) {
  if (typeof path !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*|\[\d+\])*$/.test(path)) return null;
  if (!arrays && path.includes('[')) return null;
  for (const key of path.replace(/\[(\d+)\]/g, '.$1').split('.')) {
    if (['__proto__', 'constructor', 'prototype'].includes(key) || value == null || !own(Object(value), key)) return null;
    value = value[key];
  }
  return value;
}
export function reviewedFieldsHash(record) {
  const classes = record.provenance?.fieldClasses;
  if (!object(classes)) refuse('invalid_record', 'The medication field classifications are missing.');
  return hash(Object.fromEntries(Object.keys(classes).filter(p => classes[p] === 'J').map(p => [p, pathValue(record, p)])));
}
export function retrievalHash(record) {
  return hash({ asks: record.attendingAsks ?? [], retrieval: record.retrieval ?? [] });
}

function requireRegistry(registry) {
  if (!object(registry) || registry.schemaVersion !== 1 || !Array.isArray(registry.records)) {
    refuse('invalid_registry', 'The medication registry cannot be reviewed.', 502);
  }
  const ids = new Set();
  for (const row of registry.records) {
    if (!object(row) || typeof row.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,100}$/.test(row.id) || ids.has(row.id)) {
      refuse('invalid_registry', 'The medication registry contains an invalid or duplicate identity.', 502);
    }
    ids.add(row.id);
  }
}

export function assessMedication(record, receipt) {
  const issues = [];
  const classes = record.provenance?.fieldClasses;
  if (!object(classes) || !Object.values(classes).includes('J')) issues.push('Judgment-field classifications are missing.');
  else for (const [path, kind] of Object.entries(classes)) {
    // Optional classified fields may be absent; Python's persisted J hash binds
    // them as null. Retrieval targets, unlike these optional fields, must resolve.
    if (!['L', 'R', 'J', 'E'].includes(kind) || !/^[A-Za-z][A-Za-z0-9_.]*$/.test(path)) issues.push(`Invalid classified field: ${path}.`);
  }
  if (!object(record.facultyReview) || !['pending', 'reviewed', 'needs-review'].includes(record.facultyReview.status)) issues.push('The saved review status is invalid.');
  if (typeof record.generic !== 'string' || !record.generic.trim() || record.safetyLevel !== 'high') issues.push('Medication identity or safety classification is missing.');
  if (!object(receipt) || !object(receipt.reference) || !object(receipt.rxnorm)) issues.push('The committed label receipt is missing.');
  else {
    for (const [value, expected] of [[record.rxcui, receipt.rxnorm.rxcui], [record.dailymedSetId, receipt.reference.setId], [record.labelVersionDate, receipt.reference.effectiveDate], [record.boxedWarning?.present, receipt.reference.boxedWarningPresent]]) {
      if (value === undefined || value !== expected) issues.push('The medication does not match its committed label receipt.');
    }
    if (!Array.isArray(receipt.problems) || receipt.problems.length || receipt.reference.dailymedResolves !== true) issues.push('The label receipt has unresolved verification problems.');
  }
  if (!Array.isArray(record.attendingAsks) || !Array.isArray(record.retrieval ?? [])) issues.push('The retrieval questions or mappings are invalid.');
  else {
    const ids = new Set();
    for (const mapping of record.retrieval ?? []) {
      if (!object(mapping) || typeof mapping.id !== 'string' || ids.has(mapping.id) || !Number.isInteger(mapping.askIndex) || mapping.askIndex < 0 || mapping.askIndex >= record.attendingAsks.length || !Array.isArray(mapping.revealFrom) || !mapping.revealFrom.length) {
        issues.push('A retrieval mapping is invalid or duplicated.'); continue;
      }
      ids.add(mapping.id);
      for (const path of mapping.revealFrom) {
        const value = pathValue(record, path, true), root = typeof path === 'string' ? path.split('[')[0] : '';
        if (value == null || value === '' || (Array.isArray(value) && !value.length) || !object(classes) || !Object.keys(classes).some(p => root === p || root.startsWith(p + '.') || p.startsWith(root + '.'))) issues.push(`Unresolved retrieval field: ${String(path)}.`);
      }
    }
  }
  // Clinical source validation (including dose policy, citations and quote spans)
  // remains in the existing Python gates. This action cannot edit that source;
  // do not duplicate a changing clinical policy in a second runtime.
  try { reviewedFieldsHash(record); retrievalHash(record); } catch { issues.push('The saved record contains an unsupported hash value.'); }
  return [...new Set(issues)];
}

function requireMode(settings) {
  if (settings.ledger || settings.branch !== 'attest/pending' || settings.baseBranch !== 'main' || !settings.isolated) {
    refuse('unsupported_mode', 'Medication review requires the existing attest/pending delivery branch. Ledger and direct-write modes are not supported.', 409);
  }
}

export async function loadMedicationSnapshot(repository, settings) {
  requireMode(settings);
  const sync = await repository.describeBranchSync();
  if (sync.error || !Number.isInteger(sync.aheadBy) || !Number.isInteger(sync.behindBy)) refuse('sync_unavailable', 'Branch freshness could not be verified. Reload before reviewing.', 503);
  // A read-only view may read main when the empty rolling branch only needs a
  // fast-forward. The existing authenticated POST performs that normal freshen.
  const head = sync.aheadBy === 0 ? await repository.headOf(settings.baseBranch) : await repository.head();
  const [registry, receipt] = await Promise.all([
    repository.read(PHARMACY_PATH, { ref: head, maxBytes: MAX_BYTES }),
    repository.read(LABEL_RECEIPT_PATH, { ref: head, maxBytes: MAX_BYTES }),
  ]);
  requireRegistry(registry.json);
  if (!object(receipt.json?.agents)) refuse('invalid_receipts', 'The committed label receipts cannot be read.', 502);
  return { head, registry, receipt, needsSync: sync.aheadBy > 0 && sync.behindBy > 0 };
}

export function medicationView(snapshot, attester) {
  return {
    head: snapshot.head, attester, needsSync: snapshot.needsSync,
    items: snapshot.registry.json.records.map(record => {
      const receipt = snapshot.receipt.json.agents[record.id] ?? null;
      const issues = assessMedication(record, receipt);
      return { id: record.id, record, receipt, issues,
        // This temporary server-only fingerprint may include decimal display metadata.
        // It is never persisted as a clinical hash; exact Git head binding also applies.
        revision: createHash('sha256').update(JSON.stringify({ head: snapshot.head, record, receipt })).digest('hex'),
        reviewCurrent: issues.length === 0 && record.facultyReview?.status === 'reviewed' && record.facultyReview.reviewedFieldsHash === reviewedFieldsHash(record),
        retrievalCurrent: issues.length === 0 && Boolean(record.retrieval?.length) && record.facultyReview?.retrievalHash === retrievalHash(record),
      };
    }),
  };
}

export function prepareMedicationApproval(snapshot, body, attester, date) {
  const allowed = new Set(['action', 'id', 'head', 'revision', 'confirmations']);
  if (!object(body) || Object.keys(body).some(k => !allowed.has(k)) || body.action !== 'pharmacy.attest' || typeof body.id !== 'string' || typeof body.revision !== 'string' || !HASH.test(body.revision)) refuse('invalid_input', 'Choose one saved medication and confirm its review.');
  if (snapshot.needsSync || body.head !== snapshot.head) refuse('conflict', 'The repository changed. Reload and review this medication again before approving.', 409);
  const item = medicationView(snapshot, attester).items.find(row => row.id === body.id);
  if (!item || body.revision !== item.revision) refuse('conflict', 'The selected medication changed. Reload and review it again.', 409);
  if (item.issues.length) refuse('blocked', 'Resolve this medication’s validation problems before approving it.', 422);
  const checks = body.confirmations;
  if (!object(checks) || Object.keys(checks).some(k => !['card', 'sources', 'retrieval'].includes(k)) || checks.card !== true || checks.sources !== true || (item.record.retrieval?.length && checks.retrieval !== true)) refuse('confirmations_required', 'Explicitly confirm the complete saved card, its label/evidence, and each retrieval mapping.');
  const registry = structuredClone(snapshot.registry.json);
  const record = registry.records.find(row => row.id === body.id);
  record.facultyReview = { ...record.facultyReview, status: 'reviewed', reviewer: attester, lastReviewed: date, reviewedFieldsHash: reviewedFieldsHash(record) };
  if (record.retrieval?.length) record.facultyReview.retrievalHash = retrievalHash(record);
  return { registry, id: record.id, review: record.facultyReview };
}

export async function commitMedicationApproval({ repository, settings, body, attester, date }) {
  const snapshot = await loadMedicationSnapshot(repository, settings);
  const next = prepareMedicationApproval(snapshot, body, attester, date);
  // No automatic retry: any intervening commit requires a new explicit review.
  const saved = await repository.writeAtHead(PHARMACY_PATH, next.registry, {
    parentHead: snapshot.head, expectedBlobSha: snapshot.registry.sha, indent: 2,
    message: `attest: medication ${next.id} by ${attester} (${date})`,
  });
  return { ok: true, action: 'pharmacy.attest', updated: 1, id: next.id, commit: saved.commit, review: next.review };
}
