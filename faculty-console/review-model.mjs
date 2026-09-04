import { cotwTwinSlug } from './content-universe.mjs';

const TYPE_ORDER = { page: 0, tool: 1, question: 2 };
// Which learner deployment an item actually ships on. Case-of-the-Week pages exist as
// MS3/resident twins built from one registry week (content-universe.mjs), so a preview
// has to be requested from the site that serves the selected half.
const SITES = new Set(['ms3', 'res']);
const DEEP_LINK_PARAM = 'item';
// A deep link addresses exactly one item key and nothing else. Bounded on purpose: the
// value is matched against the loaded queue and never reflected into the DOM, and this
// keeps an oversized query string from being walked at all.
const DEEP_LINK_MAX_LENGTH = 256;
const TOKEN_PATTERN = /^[0-9a-f]{32}$/;
const REVISION_PATTERN = /^[0-9a-f]{64}$/;
const PREVIEW_FAILURES = new Set([
  'not_found', 'error', 'protocol_unavailable', 'frame_failure',
]);
// Mirrors 13_Faculty_Resources/reviewed.schema.json (Task 1) — risk is read-only here;
// a later classification queue owns edits, so this module only ever normalizes it.
const RISK_KINDS = new Set(['general', 'clinical', 'legal', 'formulary', 'local-policy']);
const RISK_LEVELS = new Set(['low', 'moderate', 'high']);
const REOPEN_REASON_MAX_LENGTH = 240;

const clean = value => typeof value === 'string' ? value.trim() : '';
const list = value => Array.isArray(value) ? value : [];

function validRisk(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const kind = clean(value.kind);
  const level = clean(value.level);
  return RISK_KINDS.has(kind) && RISK_LEVELS.has(level) ? { kind, level } : null;
}

// Both the raw ledger kind ("local-policy") and its space-separated display form
// ("local policy") are searchable, since riskLabel() in app.mjs is what a reviewer
// actually reads on screen — a search for what they see should find it too.
function riskSearchTerms(risk) {
  return risk ? [risk.kind, risk.kind.replace(/-/g, ' '), risk.level] : [];
}

function completion(type, status) {
  return type === 'question'
    ? (status === 'attested' ? 'complete' : 'needs-review')
    : (status === 'reviewed' ? 'complete' : 'needs-review');
}

function compareItems(left, right) {
  return TYPE_ORDER[left.type] - TYPE_ORDER[right.type]
    || left.title.localeCompare(right.title)
    || left.identity.localeCompare(right.identity);
}

export function normalizeReviewItems(server = {}) {
  const items = [];
  for (const record of list(server.items)) {
    const type = clean(record?.kind);
    const identity = clean(record?.slug);
    if (!Object.hasOwn(TYPE_ORDER, type) || !identity) throw new TypeError('Invalid content review item.');
    const risk = validRisk(record?.risk);
    // `site` is authoritative when the server sends it (it always does since the
    // content-universe change) and defaults to the MS3 site otherwise, which is where
    // every manifest page and tool has always lived. An unrecognised value is refused
    // rather than guessed: routing a preview at the wrong deployment would show the
    // reviewer a different page than the one they are about to attest.
    const rawSite = record?.site;
    const site = rawSite === undefined || rawSite === null ? 'ms3' : clean(rawSite);
    if (!SITES.has(site)) throw new TypeError('Invalid content review item site.');
    items.push({
      key: `${type}:${identity}`, type, identity, site,
      title: clean(record.title) || identity,
      savedStatus: clean(record.status), completion: completion(type, record.status),
      revision: '', gate: '',
      risk,
      searchText: [record.title, identity, ...riskSearchTerms(risk)].map(clean).join(' ').toLowerCase(),
      record,
    });
  }
  for (const record of list(server.qbank)) {
    const identity = clean(record?.id);
    if (!identity) throw new TypeError('Invalid question review item.');
    items.push({
      key: `question:${identity}`, type: 'question', identity, site: 'ms3',
      title: identity, savedStatus: clean(record.status),
      completion: completion('question', record.status),
      revision: clean(record.revision), gate: clean(record.assessment?.gate),
      risk: null,
      searchText: [identity, record.stem, record.category, record.evidence, ...list(record.pages)]
        .map(clean).join(' ').toLowerCase(),
      record,
    });
  }
  const keys = new Set();
  for (const item of items) {
    if (keys.has(item.key)) throw new TypeError(`Duplicate review key: ${item.key}`);
    keys.add(item.key);
  }
  return items.sort(compareItems);
}

export function filterReviewItems(items, filters = {}) {
  const search = clean(filters.search).toLowerCase();
  return list(items).filter(item => {
    if (search && !item.searchText.includes(search)) return false;
    if (clean(filters.type) && filters.type !== 'all' && item.type !== filters.type) return false;
    if (clean(filters.status) && filters.status !== 'all' && item.completion !== filters.status) return false;
    if (item.type !== 'question') return true;
    if (clean(filters.category) && filters.category !== 'all' && item.record.category !== filters.category) return false;
    if (clean(filters.gate) && filters.gate !== 'all' && item.gate !== filters.gate) return false;
    return !(clean(filters.difficulty) && filters.difficulty !== 'all'
      && String(item.record.difficulty) !== String(filters.difficulty));
  });
}

export function deriveReviewCounts(items) {
  const counts = { total: 0, needsReview: 0, complete: 0, page: 0, tool: 0, question: 0 };
  for (const item of list(items)) {
    counts.total += 1; counts[item.type] += 1;
    counts[item.completion === 'complete' ? 'complete' : 'needsReview'] += 1;
  }
  return counts;
}

// Matches reviewed.schema.json's reason field exactly (minLength 1, maxLength 240,
// counted after trimming). The console disables its reopen control on this; the
// server (attest.mjs's requireReopenReason) re-enforces it independently.
export function isValidReopenReason(value) {
  const reason = clean(value);
  return reason.length > 0 && reason.length <= REOPEN_REASON_MAX_LENGTH;
}

export function createReviewToken(cryptoImpl) {
  if (!cryptoImpl || typeof cryptoImpl.getRandomValues !== 'function') {
    throw new TypeError('Secure random values are unavailable.');
  }
  const bytes = new Uint8Array(16);
  cryptoImpl.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizeStudentBase(studentBase) {
  const url = new URL(studentBase);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new TypeError('Unsafe student deployment URL.');
  }
  url.search = ''; url.hash = '';
  return Object.freeze({ href: url.href, origin: url.origin });
}

// `residentBase` is optional and falls back to `studentBase`, so a payload from an
// older function deployment (no resident base) keeps today's exact behaviour rather
// than failing to preview at all.
function baseForItem({ studentBase, residentBase, item }) {
  return item?.site === 'res' && residentBase ? residentBase : studentBase;
}

export function buildPreviewRequest({ studentBase, residentBase, item, reviewToken }) {
  const identity = clean(item?.identity);
  if (!item || !Object.hasOwn(TYPE_ORDER, item.type) || !identity
      || item.identity !== identity
      || item.key !== `${item.type}:${identity}`
      || reviewToken !== clean(reviewToken)
      || !TOKEN_PATTERN.test(reviewToken)) {
    throw new TypeError('Invalid preview request.');
  }
  const base = normalizeStudentBase(baseForItem({ studentBase, residentBase, item }));
  const url = new URL(base.href);
  if (item.type === 'page') url.searchParams.set('page', item.identity);
  if (item.type === 'tool') url.searchParams.set('tool', item.identity);
  if (item.type === 'question') {
    url.searchParams.set('tool', 'question-bank-practice.html');
    url.searchParams.set('reviewItem', item.identity);
  }
  url.searchParams.set('reviewKey', item.key);
  url.searchParams.set('reviewToken', reviewToken);
  return Object.freeze({
    url: url.href, origin: url.origin, key: item.key,
    token: reviewToken, surface: item.type,
  });
}

export function buildExternalReviewUrl({ studentBase, residentBase, item }) {
  const identity = clean(item?.identity);
  if (!item || !['page', 'tool'].includes(item.type)
      || !identity || item.identity !== identity
      || item.key !== `${item.type}:${identity}`) {
    throw new TypeError('External review is available only for a valid page or tool.');
  }
  const base = normalizeStudentBase(baseForItem({ studentBase, residentBase, item }));
  const url = new URL(base.href);
  url.searchParams.set(item.type, item.identity);
  return url.href;
}

/* ?item=<key> deep links (2026-09). The value is compared against the loaded queue and
   nothing else: an unknown, malformed, oversized or hostile string yields null, and the
   caller shows one neutral notice rather than echoing anything back to the page. The
   key must reconstruct exactly from the item it names — the same `${type}:${identity}`
   equality buildPreviewRequest already enforces — so a crafted key can never select an
   item other than the one it literally spells. */
export function parseDeepLink(search, items) {
  let requested;
  try {
    const query = typeof search === 'string' ? search : '';
    if (query.length > DEEP_LINK_MAX_LENGTH) return null;
    // Exactly one `item`. A repeated parameter is ambiguous, and the learner-side
    // review route already refuses duplicates rather than picking a winner.
    const values = new URLSearchParams(query).getAll(DEEP_LINK_PARAM);
    if (values.length !== 1) return null;
    [requested] = values;
  } catch {
    return null;
  }
  if (typeof requested !== 'string' || !requested || requested !== requested.trim()) return null;
  if (requested.length > DEEP_LINK_MAX_LENGTH) return null;
  return list(items).find(item => (
    item?.key === requested && item.key === `${item.type}:${item.identity}`
  )) || null;
}

/* The shareable address of one item. Deliberately built from the origin and path alone,
   discarding every other query parameter: the console must never place the faculty key,
   a review token, or the reviewer's name in a URL (README security note), and rebuilding
   the query from scratch makes that structural rather than a rule to remember. */
export function buildDeepLink(consoleHref, item) {
  const url = new URL(consoleHref);
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('Unsafe console URL.');
  url.search = '';
  url.hash = '';
  if (item?.key && item.key === `${item.type}:${item.identity}`) {
    url.searchParams.set(DEEP_LINK_PARAM, item.key);
  }
  return url.href;
}

/* Case-of-the-Week pages are built in MS3/resident pairs from one registry week, and a
   reviewer reads the same case twice. twinOf finds the partner so the console can offer
   it directly. It reports the twin ONLY — it never attests it: the standing rule that a
   page attestation writes exactly the selected slug is unchanged, and a one-press
   "attest both" would be a governance decision nobody has made. */
export function twinOf(item, items) {
  if (!item || item.type !== 'page') return null;
  const twinSlug = cotwTwinSlug(item.identity);
  if (!twinSlug) return null;
  return list(items).find(other => other?.type === 'page' && other.identity === twinSlug) || null;
}

/* "Attest this page" bookmarklet. Self-contained, no external fetch, no state: it reads
   the learner tab's own ?page=/?tool= parameter — exactly how buildExternalReviewUrl
   addresses a learner surface — and opens this console on that item. With neither
   parameter present it opens the console root rather than guessing a slug. The origin is
   baked in from the console that rendered it, so a preview deploy hands out a
   bookmarklet pointing at that preview instead of production. */
export function buildBookmarklet(consoleOrigin) {
  const origin = new URL(consoleOrigin).origin;
  if (!['http:', 'https:'].includes(new URL(origin).protocol)) {
    throw new TypeError('Unsafe console origin.');
  }
  const source = `(function(){var p=new URLSearchParams(location.search),`
    + `s=p.get('page'),t=p.get('tool'),k=s?'page:'+s:(t?'tool:'+t:'');`
    + `window.open(${JSON.stringify(origin)}+(k?'/?item='+encodeURIComponent(k):'/'),'_blank','noopener');})()`;
  return `javascript:${encodeURIComponent(source)}`;
}

export function matchesPreviewStatus(event, request, expectedSource) {
  const data = event?.data;
  return Boolean(event?.origin === request?.origin
    && event?.source === expectedSource
    && data && typeof data === 'object' && !Array.isArray(data)
    && Object.keys(data).sort().join(',') === 'reviewKey,reviewToken,status,surface,type'
    && data.type === 'faculty-preview-status'
    && data.reviewKey === request.key && data.reviewToken === request.token
    && data.surface === request.surface
    && ['ready', 'not_found', 'error'].includes(data.status));
}

export function reviewedRevisionMatches(item, reviewedRevision) {
  return item?.type === 'question' && REVISION_PATTERN.test(item.revision)
    && reviewedRevision === item.revision;
}

/* Batch-tray membership (2026-08-04 batch design, section A). Mirrors what the server
   will demand of every entry in a multi-item attestation rather than inventing a looser
   client-side notion: draft status, a ready gate (warnings force individual attestation
   when N > 1 — attest.warning_individual_only; blocked never attests), and a review
   receipt recorded at the question's EXACT current revision. Receipts are the per-item
   control that makes one batch affirmation defensible; anything that changes a revision
   must drop the item out of the batch, which callers get for free by re-deriving. */
export function deriveBatchEligibility(question, { assessmentGate, reviewedRevision } = {}) {
  const reasons = [];
  if (!question || question.status !== 'draft') reasons.push('batch.not_draft');
  if (assessmentGate === 'warning') reasons.push('batch.warning_individual_only');
  else if (assessmentGate === 'blocked') reasons.push('batch.blocked');
  else if (assessmentGate !== 'ready') reasons.push('batch.gate_unknown');
  if (!REVISION_PATTERN.test(question?.revision ?? '') || reviewedRevision !== question?.revision) {
    reasons.push('batch.review_receipt_required');
  }
  return { eligible: reasons.length === 0, reasons };
}

function validAssessment(assessment) {
  if (!assessment || typeof assessment !== 'object' || Array.isArray(assessment)
      || !['ready', 'warning', 'blocked'].includes(assessment.gate)
      || !Array.isArray(assessment.blockers) || !Array.isArray(assessment.warnings)
      || ![...assessment.blockers, ...assessment.warnings]
        .every(issue => issue && typeof issue === 'object' && clean(issue.code))) return false;
  if (assessment.gate === 'ready') {
    return assessment.blockers.length === 0 && assessment.warnings.length === 0;
  }
  if (assessment.gate === 'warning') {
    return assessment.blockers.length === 0 && assessment.warnings.length > 0;
  }
  return assessment.blockers.length > 0;
}

export function deriveAttestationEligibility(context = {}) {
  const blockers = [];
  const item = context.item;
  if (!item) return { eligible: false, blockers: ['selection.missing'] };
  if (context.dirty) blockers.push('question.unsaved_changes');
  if (!['loading', 'ready', 'not_found', 'error', 'protocol_unavailable', 'frame_failure']
    .includes(context.previewStatus)) blockers.push('preview.invalid_state');
  const failedPreview = PREVIEW_FAILURES.has(context.previewStatus);
  if (context.previewStatus === 'loading') blockers.push('preview.loading');
  if (item.type === 'question') {
    const assessment = context.assessment;
    const assessmentIsValid = validAssessment(assessment);
    if (item.savedStatus !== 'draft') blockers.push('question.not_draft');
    if (!assessmentIsValid) blockers.push('checks.runtime_failure');
    if (!assessmentIsValid || !['ready', 'warning'].includes(assessment.gate)) {
      blockers.push('question.gate_not_attestable');
    }
    if (context.previewStatus === 'ready' && context.liveReviewed !== true) blockers.push('review.live_required');
    if (['error', 'protocol_unavailable', 'frame_failure'].includes(context.previewStatus)
        && context.retryAttempted !== true) blockers.push('preview.retry_required');
    if (failedPreview && context.liveUnavailableAcknowledged !== true) blockers.push('review.live_unavailable_ack_required');
    if (!reviewedRevisionMatches(item, context.reviewedRevision)) blockers.push('review.saved_revision_required');
    if (assessmentIsValid && assessment.gate === 'blocked') blockers.push('question.blocked');
    const warningCodes = assessmentIsValid
      ? assessment.warnings.map(issue => clean(issue.code)) : [];
    if (assessmentIsValid && assessment.gate === 'warning'
        && warningCodes.some(code => !context.warningAcks?.has?.(code))) {
      blockers.push('question.warning_ack_required');
    }
    if (context.confirmations?.clinical !== true || context.confirmations?.evidence !== true
        || context.confirmations?.originalityAndNoPhi !== true) blockers.push('question.confirmations_required');
  } else {
    if (item.savedStatus !== 'unreviewed') blockers.push('content.status_not_attestable');
    if (context.previewStatus === 'ready' && context.completeItemReviewed !== true) blockers.push('review.complete_item_required');
    if (failedPreview && context.separateTabReviewed !== true) blockers.push('review.separate_tab_required');
    if (context.contentChecks?.accuracy !== true || context.contentChecks?.interactions !== true) {
      blockers.push('content.resolve_checks_required');
    }
  }
  return { eligible: blockers.length === 0, blockers };
}
