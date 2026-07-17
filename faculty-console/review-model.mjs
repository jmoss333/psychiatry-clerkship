const TYPE_ORDER = { page: 0, tool: 1, question: 2 };
const TOKEN_PATTERN = /^[0-9a-f]{32}$/;
const REVISION_PATTERN = /^[0-9a-f]{64}$/;
const PREVIEW_FAILURES = new Set([
  'not_found', 'error', 'protocol_unavailable', 'frame_failure',
]);

const clean = value => typeof value === 'string' ? value.trim() : '';
const list = value => Array.isArray(value) ? value : [];

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
    items.push({
      key: `${type}:${identity}`, type, identity,
      title: clean(record.title) || identity,
      savedStatus: clean(record.status), completion: completion(type, record.status),
      revision: '', gate: '',
      searchText: [record.title, identity].map(clean).join(' ').toLowerCase(),
      record,
    });
  }
  for (const record of list(server.qbank)) {
    const identity = clean(record?.id);
    if (!identity) throw new TypeError('Invalid question review item.');
    items.push({
      key: `question:${identity}`, type: 'question', identity,
      title: identity, savedStatus: clean(record.status),
      completion: completion('question', record.status),
      revision: clean(record.revision), gate: clean(record.assessment?.gate),
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

export function buildPreviewRequest({ studentBase, item, reviewToken }) {
  const identity = clean(item?.identity);
  if (!item || !Object.hasOwn(TYPE_ORDER, item.type) || !identity
      || item.key !== `${item.type}:${identity}`
      || !TOKEN_PATTERN.test(clean(reviewToken))) {
    throw new TypeError('Invalid preview request.');
  }
  const base = normalizeStudentBase(studentBase);
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

export function buildExternalReviewUrl({ studentBase, item }) {
  const identity = clean(item?.identity);
  if (!item || !['page', 'tool'].includes(item.type)
      || !identity || item.key !== `${item.type}:${identity}`) {
    throw new TypeError('External review is available only for a valid page or tool.');
  }
  const base = normalizeStudentBase(studentBase);
  const url = new URL(base.href);
  url.searchParams.set(item.type, item.identity);
  return url.href;
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
