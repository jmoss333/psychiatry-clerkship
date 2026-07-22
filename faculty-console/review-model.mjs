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
      || item.identity !== identity
      || item.key !== `${item.type}:${identity}`
      || reviewToken !== clean(reviewToken)
      || !TOKEN_PATTERN.test(reviewToken)) {
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
      || !identity || item.identity !== identity
      || item.key !== `${item.type}:${identity}`) {
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

function deriveAttestationBlockers(context = {}) {
  const blockers = [];
  const item = context.item;
  if (!item) return ['selection.missing'];
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
  return blockers;
}

function requirement({
  id,
  group,
  label,
  complete,
  status = 'actionable',
  blockerCode = '',
  focusId,
}) {
  const isComplete = complete === true;
  return Object.freeze({
    id,
    group,
    label,
    complete: isComplete,
    status: isComplete ? 'complete' : status,
    blockerCode,
    focusId,
  });
}

function addContentRequirements(add, context) {
  const item = context.item;
  const previewStatus = context.previewStatus;
  const failedPreview = PREVIEW_FAILURES.has(previewStatus);
  const validPreview = ['loading', 'ready', ...PREVIEW_FAILURES].includes(previewStatus);
  add({
    id: 'content.status',
    group: 'Learner review',
    label: 'This item still needs faculty review',
    complete: item.savedStatus === 'unreviewed',
    status: 'blocked',
    blockerCode: 'content.status_not_attestable',
    focusId: 'selected-item-status',
  });
  add({
    id: 'preview.ready',
    group: 'Learner review',
    label: failedPreview ? 'Use the documented preview fallback' : 'Learner preview is ready',
    complete: previewStatus === 'ready' || failedPreview,
    status: validPreview && previewStatus === 'loading' ? 'blocked' : 'unavailable',
    blockerCode: validPreview ? 'preview.loading' : 'preview.invalid_state',
    focusId: 'preview-status',
  });
  if (previewStatus === 'ready') {
    add({
      id: 'review.complete_item',
      group: 'Learner review',
      label: 'I reviewed the complete item',
      complete: context.completeItemReviewed,
      blockerCode: 'review.complete_item_required',
      focusId: 'review-complete-item',
    });
  } else if (failedPreview) {
    add({
      id: 'review.separate_tab',
      group: 'Learner review',
      label: 'I reviewed this item in the separate tab',
      complete: context.separateTabReviewed,
      blockerCode: 'review.separate_tab_required',
      focusId: 'review-separate-tab',
    });
  }
  add({
    id: 'content.accuracy',
    group: 'Content validation',
    label: 'Accurate and appropriate for a third-year student',
    complete: context.contentChecks?.accuracy,
    blockerCode: 'content.resolve_checks_required',
    focusId: 'review-content-accuracy',
  });
  add({
    id: 'content.interactions',
    group: 'Content validation',
    label: 'Relevant links, media, or interactions work',
    complete: context.contentChecks?.interactions,
    blockerCode: 'content.resolve_checks_required',
    focusId: 'review-content-interactions',
  });
}

function addQuestionRequirements(add, context) {
  const item = context.item;
  const assessment = context.assessment;
  const assessmentIsValid = validAssessment(assessment);
  const failedPreview = PREVIEW_FAILURES.has(context.previewStatus);
  const invalidPreview = !['loading', 'ready', ...PREVIEW_FAILURES].includes(context.previewStatus);
  const retryRequired = ['error', 'protocol_unavailable', 'frame_failure']
    .includes(context.previewStatus) && context.retryAttempted !== true;
  const saved = context.dirty !== true && item.savedStatus === 'draft';
  add({
    id: 'question.saved',
    group: 'Learner review',
    label: 'Current saved Draft has no unsaved edits',
    complete: saved,
    status: 'blocked',
    blockerCode: context.dirty ? 'question.unsaved_changes' : 'question.not_draft',
    focusId: context.dirty ? 'save-draft' : 'selected-item-status',
  });
  add({
    id: 'preview.available',
    group: 'Learner review',
    label: retryRequired ? 'Retry the learner preview once' : 'Learner preview state is reviewable',
    complete: !invalidPreview && context.previewStatus !== 'loading' && !retryRequired,
    status: failedPreview ? 'unavailable' : 'blocked',
    blockerCode: invalidPreview
      ? 'preview.invalid_state'
      : context.previewStatus === 'loading'
        ? 'preview.loading'
        : 'preview.retry_required',
    focusId: 'preview-status',
  });
  if (context.previewStatus === 'ready') {
    add({
      id: 'review.live',
      group: 'Learner review',
      label: 'I reviewed the complete item in the learner view',
      complete: context.liveReviewed,
      blockerCode: 'review.live_required',
      focusId: 'review-live-preview',
    });
  } else if (failedPreview) {
    add({
      id: 'review.live_unavailable',
      group: 'Learner review',
      label: 'The live question is unavailable; I reviewed the saved revision',
      complete: context.liveUnavailableAcknowledged,
      blockerCode: 'review.live_unavailable_ack_required',
      focusId: 'ack-live-unavailable',
    });
  }
  add({
    id: 'review.saved_revision',
    group: 'Learner review',
    label: 'I reviewed this exact saved revision',
    complete: reviewedRevisionMatches(item, context.reviewedRevision),
    blockerCode: 'review.saved_revision_required',
    focusId: 'review-saved-revision',
  });
  add({
    id: 'question.gate',
    group: 'Question resolution',
    label: assessmentIsValid && assessment.gate === 'warning'
      ? 'Current structural warnings are reviewed'
      : 'Current structural checks permit attestation',
    complete: assessmentIsValid && ['ready', 'warning'].includes(assessment.gate),
    status: 'blocked',
    blockerCode: assessmentIsValid ? 'question.gate_not_attestable' : 'checks.runtime_failure',
    focusId: 'edit-question-from-rail',
  });
  if (assessmentIsValid && assessment.gate === 'warning') {
    for (const warning of assessment.warnings) {
      const code = clean(warning.code);
      add({
        id: `warning.${code}`,
        group: 'Question resolution',
        label: `${code}: ${clean(warning.message) || 'Warning reviewed'}`,
        complete: context.warningAcks?.has?.(code),
        blockerCode: 'question.warning_ack_required',
        focusId: `ack-${code.replace(/[^A-Za-z0-9_-]/g, '-')}`,
      });
    }
  }
  for (const [key, label, focusId] of [
    ['clinical', 'I verified the clinical answer and rationale', 'confirm-clinical'],
    ['evidence', 'I verified the named library page and evidence anchor', 'confirm-evidence'],
    ['originalityAndNoPhi', 'I verified an original fictional vignette with no PHI', 'confirm-originality'],
  ]) {
    add({
      id: `confirmation.${key}`,
      group: 'Faculty confirmation',
      label,
      complete: context.confirmations?.[key],
      blockerCode: 'question.confirmations_required',
      focusId,
    });
  }
}

export function deriveAttestationChecklist(context = {}) {
  const requirements = [];
  const blockers = deriveAttestationBlockers(context);
  const add = definition => requirements.push(requirement(definition));
  if (!context.item) {
    add({
      id: 'selection.present',
      group: 'Learner review',
      label: 'Select one review item',
      complete: false,
      status: 'blocked',
      blockerCode: 'selection.missing',
      focusId: 'review-item-selector',
    });
  } else if (context.item.type === 'question') {
    addQuestionRequirements(add, context);
  } else {
    addContentRequirements(add, context);
  }
  const completedCount = requirements.filter(item => item.complete).length;
  return Object.freeze({
    requirements: Object.freeze(requirements),
    completedCount,
    totalCount: requirements.length,
    firstUnmet: requirements.find(item => !item.complete) || null,
    eligible: blockers.length === 0,
    blockers: Object.freeze(blockers),
  });
}

export function deriveAttestationEligibility(context = {}) {
  const checklist = deriveAttestationChecklist(context);
  return { eligible: checklist.eligible, blockers: [...checklist.blockers] };
}
