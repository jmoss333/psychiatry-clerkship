/* Phone attestation client — pure model. Everything here is deterministic and unit-tested;
   the DOM layer (m.mjs) only calls these. Reuses the desktop's review-model rules so the two
   clients cannot disagree about what needs review, what a twin is, or when Attest is allowed. */
import {
  deriveAttestationEligibility, normalizeReviewItems, twinOf,
} from '../review-model.mjs';

export const NEEDS_REVIEW = 'needs-review';
const PREVIEW_FAILED = new Set(['not_found', 'error', 'protocol_unavailable', 'frame_failure']);

/** Items the phone lists: every page, tool and question whose completion is needs-review. */
export function phoneQueue(server) {
  return normalizeReviewItems(server || {}).filter(item => item.completion === NEEDS_REVIEW);
}

function groupTitle(group) {
  const title = typeof group.title === 'string' ? group.title.trim() : '';
  if (Number.isInteger(group.pr)) return `#${group.pr}${title ? ` ${title}` : ''}`;
  return title || String(group.id || 'Correction');
}

/**
 * Sections in spec order: one per correction from ?view=changes (server order = largest first),
 * then "No text change" (unexplained drift), then everything else. A slug named by two groups
 * lands once, in the first group that names it. Questions always fall to the last section.
 */
export function groupQueue(items, changes) {
  const list = Array.isArray(items) ? items : [];
  const bySlug = new Map(list.filter(i => i.type !== 'question').map(i => [i.identity, i]));
  const placed = new Set();
  const sections = [];
  const groups = Array.isArray(changes?.groups) ? changes.groups : [];
  for (const group of groups) {
    const members = (Array.isArray(group.slugs) ? group.slugs : [])
      .map(slug => bySlug.get(slug))
      .filter(item => item && !placed.has(item.key));
    if (!members.length) continue;
    members.forEach(item => placed.add(item.key));
    sections.push({ id: String(group.id), title: groupTitle(group), items: members });
  }
  const unexplained = new Set(Array.isArray(changes?.unexplained) ? changes.unexplained : []);
  const noText = list.filter(i => i.type !== 'question' && !placed.has(i.key) && unexplained.has(i.identity));
  if (noText.length) {
    noText.forEach(item => placed.add(item.key));
    sections.push({ id: 'no-text-change', title: 'No text change', items: noText });
  }
  const rest = list.filter(i => !placed.has(i.key));
  if (rest.length) sections.push({ id: 'pending', title: 'Also needing review', items: rest });
  return sections;
}

/** One line under a queue row: why it needs review. */
export function reviewReason(item) {
  const record = item?.record && typeof item.record === 'object' ? item.record : {};
  if (typeof record.reason === 'string' && record.reason.trim()) return record.reason.trim();
  return item?.type === 'question' ? 'Draft question awaiting attestation' : 'Pending faculty review';
}

/** Desktop order: the twin, then the next item in the same section (wrapping), then the first pending page/tool. */
export function nextAfterSign(signedKey, items, sections) {
  const list = Array.isArray(items) ? items : [];
  const signed = list.find(i => i.key === signedKey);
  if (!signed) return null;
  const content = i => i.type !== 'question' && i.completion === NEEDS_REVIEW && i.key !== signedKey;
  const twin = twinOf(signed, list);
  if (twin && content(twin)) return twin.key;
  const section = (sections || []).find(s => s.items.some(i => i.key === signedKey));
  if (section) {
    const idx = section.items.findIndex(i => i.key === signedKey);
    const ordered = [...section.items.slice(idx + 1), ...section.items.slice(0, idx)];
    const next = ordered.find(content);
    if (next) return next.key;
  }
  const rest = list.find(content);
  return rest ? rest.key : null;
}

/** Apply the write's rows to the loaded payload: same items array, updated entries, stale dropped. */
export function applyRows(server, rows) {
  if (!server || !rows || typeof rows !== 'object') return server;
  const items = (Array.isArray(server.items) ? server.items : []).map(item => {
    const row = rows[item.slug];
    if (!row || typeof row !== 'object') return item;
    // A fresh signature binds today's text: neither a drift flag nor a citations-changed flag
    // (fingerprint v2) from the previous load describes it any more.
    const { stale, citationsChanged, ...rest } = item;
    return {
      ...rest,
      status: row.status,
      at: typeof row.at === 'string' ? row.at : '',
      by: typeof row.by === 'string' ? row.by : '',
      risk: row.risk ?? item.risk ?? null,
      reason: typeof row.reason === 'string' ? row.reason : '',
    };
  });
  return { ...server, items };
}

const DIFF_NOTE_TOO_LARGE = 'Too much changed to show here; open the comparison on GitHub.';
const DIFF_NOTE_BINARY = 'Binary file changed.';
const DIFF_NOTE_TRUNCATED = 'Only the first 60 hunks are shown.';

/**
 * Flatten a ?view=diff payload for a phone screen into { kind, text } lines, where kind is
 * 'file' | 'context' | 'del' | 'add' | 'note'. Change rows split into a del line and an add line.
 * A file is skipped only when its status is 'unchanged' or 'missing'. Every other file always
 * gets its 'file' line, even with no hunks, plus a 'note' when the server sent no rows it could
 * show (tooLarge, binary) or cut the rows short (truncated) — mirroring the desktop's hints, so
 * a page whose text did change can never read as "no text change" on the phone.
 */
export function diffLines(diff) {
  const out = [];
  for (const file of Array.isArray(diff?.files) ? diff.files : []) {
    if (file.status === 'unchanged' || file.status === 'missing') continue;
    out.push({ kind: 'file', text: String(file.path || '') });
    if (file.tooLarge === true) out.push({ kind: 'note', text: DIFF_NOTE_TOO_LARGE });
    if (file.status === 'binary') out.push({ kind: 'note', text: DIFF_NOTE_BINARY });
    for (const hunk of Array.isArray(file.hunks) ? file.hunks : []) {
      for (const row of Array.isArray(hunk.rows) ? hunk.rows : []) {
        const segs = Array.isArray(row.segments) ? row.segments : [];
        const before = segs.filter(s => s.t !== 'add').map(s => s.s).join('');
        const after = segs.filter(s => s.t !== 'del').map(s => s.s).join('');
        if (row.kind === 'context') { out.push({ kind: 'context', text: before }); continue; }
        if (row.kind !== 'add' && before) out.push({ kind: 'del', text: before });
        if (row.kind !== 'del' && after) out.push({ kind: 'add', text: after });
      }
    }
    if (file.truncated === true) out.push({ kind: 'note', text: DIFF_NOTE_TRUNCATED });
  }
  return out;
}

/** After the 10 s readiness window: the desktop's two outcomes. */
export function timeoutStatus(frameLoaded) {
  return frameLoaded ? 'protocol_unavailable' : 'frame_failure';
}

/** Content (page/tool) eligibility from the phone's UI flags; the rule itself is the desktop's. */
export function contentEligibility(item, ui = {}) {
  return deriveAttestationEligibility({
    item,
    previewStatus: ui.previewStatus || 'loading',
    retryAttempted: ui.retryAttempted === true,
    completeItemReviewed: ui.completeItemReviewed === true,
    separateTabReviewed: ui.separateTabReviewed === true,
    contentChecks: { accuracy: ui.accuracy === true, interactions: ui.interactions === true },
  });
}

/** Question eligibility: live receipt (or acknowledged unavailability after a retry), saved-revision receipt, confirmations. */
export function questionEligibility(item, ui = {}) {
  const status = ui.previewStatus || 'loading';
  return deriveAttestationEligibility({
    item,
    dirty: false,
    previewStatus: status,
    assessment: item?.record?.assessment,
    liveReviewed: ui.liveReviewed === true,
    retryAttempted: ui.retryAttempted === true,
    liveUnavailableAcknowledged: PREVIEW_FAILED.has(status) && ui.liveUnavailableAcknowledged === true,
    reviewedRevision: typeof ui.reviewedRevision === 'string' ? ui.reviewedRevision : '',
    warningAcks: new Set(),
    confirmations: {
      clinical: ui.clinical === true,
      evidence: ui.evidence === true,
      originalityAndNoPhi: ui.originalityAndNoPhi === true,
    },
  });
}

/**
 * The entry the server validates for qbank.attest. `reviewedRevision` is the receipt the phone
 * recorded when the reviewer saw the question, carried exactly as given and never filled in
 * from item.revision: a stale or missing receipt must reach the server and be rejected there
 * (its receipt check is reviewedRevision === revision). A non-string receipt is sent as ''.
 * The phone never acknowledges warnings (no Attest for warned items).
 */
export function questionEntry(item, reviewedRevision) {
  return {
    id: item.identity,
    revision: item.revision,
    reviewedRevision: typeof reviewedRevision === 'string' ? reviewedRevision : '',
    acknowledgedWarnings: [],
  };
}
