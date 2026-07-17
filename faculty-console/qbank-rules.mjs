export const TYPES = ['sba', 'two-tier', 'relational'];
export const CATEGORIES = ['mood','psychosis','anxiety','substance','neurocog','pharm','safety','personality','childdev','otherdx','ethics','relational'];
export const COMPETENCIES = ['dx','next-step','management','safety','pharm','psychosocial'];
export const SUBTYPES = ['family-system','what-would-you-say','transition-of-care'];
export const OPTION_KEYS = ['A','B','C','D'];

const EDITABLE = ['type','subtype','category','competency','difficulty','hy','pages','link','stem','options','why','pearl','evidence','tier2'];
const REQUIRED_TEXT = ['id', 'status', 'type', 'category', 'stem', 'why', 'pearl', 'evidence'];
const LINK_FIELDS = ['label', 'href'];
const OPTION_FIELDS = ['key', 't', 'c', 'trap'];
const TRAP_FIELDS = ['name', 'note'];
const TIER_FIELDS = ['q', 'why', 'options'];
const TIER_OPTION_FIELDS = ['key', 't', 'c'];

const issue = (code, field, message) => ({ code, field, message });
const text = value => typeof value === 'string' ? value.trim() : '';
const blankKeys = () => ({ A: 0, B: 0, C: 0, D: 0 });
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const record = value => isRecord(value) ? value : {};
const list = value => Array.isArray(value) ? value : [];

function pageFromHref(href) {
  return /^\?page=([A-Za-z0-9_-]+\.md)(?:[&#].*)?$/.exec(text(href))?.[1] || '';
}

function isToolHref(href) {
  return /^tools\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.html(?:[?#].*)?$/.test(text(href));
}

function normalized(value) {
  return text(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
}

function markdownSlugs(value) {
  return new Set(text(value).match(/[A-Za-z0-9_.-]+\.md(?![A-Za-z0-9_.-])/g) || []);
}

function addUnique(target, entry) {
  if (!target.some(existing => existing.code === entry.code && existing.field === entry.field)) {
    target.push(entry);
  }
}

function finalLeadIn(stem) {
  const value = text(stem);
  if (!value.endsWith('?')) return '';
  const beforeQuestion = value.slice(0, -1);
  const boundary = Math.max(
    beforeQuestion.lastIndexOf('.'),
    beforeQuestion.lastIndexOf('!'),
    beforeQuestion.lastIndexOf('?'),
  );
  return value.slice(boundary + 1);
}

function stemTokens(stem) {
  return new Set(text(stem)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2));
}

function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection++;
  return intersection / (left.size + right.size - intersection);
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function validateOptions(options, blockers) {
  if (!Array.isArray(options) || options.length !== 4) {
    addUnique(blockers, issue('options.count', 'options', 'Provide exactly four answer options.'));
  }
  if (!Array.isArray(options)) return;

  const keys = options.map(option => text(option?.key));
  if (keys.length !== OPTION_KEYS.length
      || new Set(keys).size !== OPTION_KEYS.length
      || OPTION_KEYS.some(key => !keys.includes(key))) {
    addUnique(blockers, issue('options.keys', 'options', 'Answer option keys must be unique A, B, C, and D.'));
  }

  const correct = options.filter(option => option?.c === true);
  if (correct.length !== 1) {
    addUnique(blockers, issue('options.correct_count', 'options', 'Mark exactly one answer option as correct.'));
  }

  const answerTexts = [];
  for (const option of options) {
    const key = text(option?.key) || '?';
    const answer = text(option?.t);
    if (!answer) {
      addUnique(blockers, issue('options.text', `options.${key}.t`, 'Every answer option needs text.'));
    } else {
      answerTexts.push(normalized(answer));
    }

    if (option && Object.hasOwn(option, 'c') && option.c !== true) {
      addUnique(blockers, issue('options.correct_flag', `options.${key}.c`, 'Omit the correct flag from wrong answers.'));
    }

    if (option?.c !== true
        && (!option?.trap || !text(option.trap.name) || !text(option.trap.note))) {
      addUnique(blockers, issue('options.trap', `options.${key}.trap`, 'Every wrong answer needs a named trap and corrective note.'));
    }
  }

  if (answerTexts.length !== new Set(answerTexts).size) {
    addUnique(blockers, issue('options.duplicate_text', 'options', 'Answer option text must be unique.'));
  }
}

function validateTierTwo(item, blockers) {
  if (item.type !== 'two-tier') return;
  const tier = item.tier2;
  if (!tier || typeof tier !== 'object' || Array.isArray(tier)) {
    addUnique(blockers, issue('tier2.required', 'tier2', 'Two-tier items need a rationale question.'));
    return;
  }
  if (!text(tier.q)) {
    addUnique(blockers, issue('tier2.question', 'tier2.q', 'The tier-two question cannot be empty.'));
  }
  if (!text(tier.why)) {
    addUnique(blockers, issue('tier2.why', 'tier2.why', 'The tier-two explanation cannot be empty.'));
  }

  const options = tier.options;
  if (!Array.isArray(options) || options.length < 3 || options.length > 4) {
    addUnique(blockers, issue('tier2.options_count', 'tier2.options', 'Provide three or four tier-two rationale options.'));
  }
  if (!Array.isArray(options)) return;

  const keys = options.map(option => text(option?.key));
  if (new Set(keys).size !== keys.length || keys.some(key => !OPTION_KEYS.includes(key))) {
    addUnique(blockers, issue('tier2.keys', 'tier2.options', 'Tier-two option keys must be unique A-D keys.'));
  }
  if (options.filter(option => option?.c === true).length !== 1) {
    addUnique(blockers, issue('tier2.correct_count', 'tier2.options', 'Mark exactly one tier-two rationale as correct.'));
  }

  const answerTexts = [];
  for (const option of options) {
    const key = text(option?.key) || '?';
    const answer = text(option?.t);
    if (!answer) {
      addUnique(blockers, issue('tier2.text', `tier2.options.${key}.t`, 'Every tier-two option needs text.'));
    } else {
      answerTexts.push(normalized(answer));
    }
    if (option && Object.hasOwn(option, 'c') && option.c !== true) {
      addUnique(blockers, issue('tier2.correct_flag', `tier2.options.${key}.c`, 'Omit the correct flag from wrong tier-two answers.'));
    }
  }
  if (answerTexts.length !== new Set(answerTexts).size) {
    addUnique(blockers, issue('tier2.duplicate_text', 'tier2.options', 'Tier-two option text must be unique.'));
  }
}

function addItemWarnings(item, warnings, manifestPages, activeItems) {
  const stem = text(item.stem);
  const leadIn = finalLeadIn(stem);
  if (stem && !leadIn) {
    addUnique(warnings, issue('stem.lead_in', 'stem', 'End the stem with a focused question-form lead-in.'));
  }
  if (leadIn && /\b(?:except|not|least)\b/i.test(leadIn)) {
    addUnique(warnings, issue('stem.negative_lead_in', 'stem', 'Review the negative wording in the final lead-in.'));
  }
  if (leadIn && /\bwhich(?:\s+of\s+the\s+following)?\s+(?:is|are)\s+(?:true|correct)\b/i.test(leadIn)) {
    addUnique(warnings, issue('stem.weak_lead_in', 'stem', 'Use a focused lead-in that can be answered with the options covered.'));
  }

  const options = Array.isArray(item.options) ? item.options : [];
  if (options.some(option => /\b(?:all|none)\s+of\s+the\s+above\b/i.test(text(option?.t)))) {
    addUnique(warnings, issue('options.cueing', 'options', 'Replace all-of-the-above or none-of-the-above cueing.'));
  }

  const correct = options.filter(option => option?.c === true);
  const distractors = options.filter(option => option?.c !== true);
  if (correct.length === 1 && distractors.length) {
    const correctLength = text(correct[0].t).length;
    const distractorLengths = distractors.map(option => text(option?.t).length);
    const distractorMedian = median(distractorLengths);
    const uniquelyLongest = options.filter(option => text(option?.t).length >= correctLength).length === 1;
    if (uniquelyLongest
        && correctLength > distractorMedian * 2.25
        && correctLength - distractorMedian >= 35) {
      addUnique(warnings, issue('options.answer_length', 'options', 'The correct answer is conspicuously longer than the distractors.'));
    }
  }

  const pages = Array.isArray(item.pages) ? item.pages.map(text).filter(Boolean) : [];
  const evidence = text(item.evidence);
  const evidencePages = markdownSlugs(evidence);
  if (evidence && pages.length && !pages.some(page => evidencePages.has(page))) {
    addUnique(warnings, issue('evidence.page_mismatch', 'evidence', 'The evidence text does not name a selected page slug.'));
  }

  const href = text(item.link?.href);
  const linkedPage = pageFromHref(href);
  if (linkedPage && manifestPages.includes(linkedPage) && !pages.includes(linkedPage)) {
    addUnique(warnings, issue('link.page_mismatch', 'link.href', 'The deep link points to a shipped page that is not selected for this item.'));
  }

  const tokens = stemTokens(stem);
  const nearDuplicate = activeItems.some(other => other
    && other.retired !== true
    && other.id !== item.id
    && jaccard(tokens, stemTokens(other.stem)) >= 0.85);
  if (nearDuplicate) {
    addUnique(warnings, issue('stem.near_duplicate', 'stem', 'This stem closely overlaps another active question.'));
  }
}

export function assessItem(item, context = {}) {
  const candidate = record(item);
  const settings = record(context);
  const manifestPages = list(settings.manifestPages).filter(page => typeof page === 'string');
  const activeItems = list(settings.activeItems).filter(isRecord);
  const blockers = [];
  const warnings = [];

  for (const field of REQUIRED_TEXT) {
    if (!text(candidate[field])) {
      addUnique(blockers, issue(`required.${field}`, field, `${field} cannot be empty.`));
    }
  }

  const id = text(candidate.id);
  if (id && !/^qb_[a-z]+_[0-9]{3}$/.test(id)) {
    addUnique(blockers, issue('id.format', 'id', 'Question IDs must match qb_category_000.'));
  }
  if (text(candidate.status) && !['draft', 'attested'].includes(candidate.status)) {
    addUnique(blockers, issue('status.enum', 'status', 'Status must be draft or attested.'));
  }
  if (text(candidate.type) && !TYPES.includes(candidate.type)) {
    addUnique(blockers, issue('type.enum', 'type', 'Choose a supported question type.'));
  }
  if (text(candidate.category) && !CATEGORIES.includes(candidate.category)) {
    addUnique(blockers, issue('category.enum', 'category', 'Choose a supported question category.'));
  }

  if (activeItems.length && id) {
    const matches = activeItems.filter(active => active?.retired !== true && active?.id === id).length;
    if (matches === 0) {
      addUnique(blockers, issue('id.unknown', 'id', 'This ID does not refer to an active repository item.'));
    } else if (matches > 1) {
      addUnique(blockers, issue('id.duplicate', 'id', 'This ID is duplicated among active questions.'));
    }
  }

  if (!Array.isArray(candidate.competency)
      || candidate.competency.length < 1
      || candidate.competency.length > 3) {
    addUnique(blockers, issue('competency.count', 'competency', 'Choose one to three competencies.'));
  }
  if (Array.isArray(candidate.competency)) {
    if (candidate.competency.some(value => !COMPETENCIES.includes(value))) {
      addUnique(blockers, issue('competency.enum', 'competency', 'Every competency must use a supported value.'));
    }
    if (new Set(candidate.competency).size !== candidate.competency.length) {
      addUnique(blockers, issue('competency.duplicate', 'competency', 'Competencies cannot be repeated.'));
    }
  }

  if (!Number.isInteger(candidate.difficulty) || candidate.difficulty < 1 || candidate.difficulty > 3) {
    addUnique(blockers, issue('difficulty.enum', 'difficulty', 'Difficulty must be 1, 2, or 3.'));
  }
  if (Object.hasOwn(candidate, 'hy') && typeof candidate.hy !== 'boolean') {
    addUnique(blockers, issue('hy.type', 'hy', 'The high-yield flag must be true or omitted.'));
  }

  if (!Array.isArray(candidate.pages) || candidate.pages.length === 0) {
    addUnique(blockers, issue('pages.required', 'pages', 'Select at least one source page.'));
  }
  if (Array.isArray(candidate.pages)) {
    const pages = candidate.pages.map(text);
    if (pages.some(page => !page || !/^[^/?#]+\.md$/.test(page))) {
      addUnique(blockers, issue('pages.format', 'pages', 'Every selected page must be a Markdown slug.'));
    }
    if (new Set(pages).size !== pages.length) {
      addUnique(blockers, issue('pages.duplicate', 'pages', 'Selected pages cannot be repeated.'));
    }
    if (manifestPages.length && pages.some(page => page && !manifestPages.includes(page))) {
      addUnique(blockers, issue('pages.unknown', 'pages', 'A selected source page is not in the shipped Markdown manifest.'));
    }
  }

  if (!candidate.link || typeof candidate.link !== 'object' || Array.isArray(candidate.link)) {
    addUnique(blockers, issue('link.required', 'link', 'Provide a learning-path link.'));
  } else {
    const label = text(candidate.link.label);
    const href = text(candidate.link.href);
    if (!label) {
      addUnique(blockers, issue('link.label', 'link.label', 'The learning-path link needs a label.'));
    }
    if (!href) {
      addUnique(blockers, issue('link.href', 'link.href', 'The learning-path link needs a destination.'));
    } else {
      const linkedPage = pageFromHref(href);
      if (!linkedPage && !isToolHref(href)) {
        addUnique(blockers, issue('link.format', 'link.href', 'Use a ?page=slug.md or tools/name.html learning-path link.'));
      } else if (linkedPage && manifestPages.length && !manifestPages.includes(linkedPage)) {
        addUnique(blockers, issue('link.unknown_page', 'link.href', 'The linked Markdown page is not in the shipped manifest.'));
      }
    }
  }

  validateOptions(candidate.options, blockers);

  if (candidate.type === 'relational') {
    if (!text(candidate.subtype)) {
      addUnique(blockers, issue('subtype.required', 'subtype', 'Relational items need a subtype.'));
    } else if (!SUBTYPES.includes(candidate.subtype)) {
      addUnique(blockers, issue('subtype.enum', 'subtype', 'Choose a supported relational subtype.'));
    }
  }

  validateTierTwo(candidate, blockers);

  if (candidate.retired === true) {
    addUnique(blockers, issue('item.retired', 'retired', 'Retired questions cannot be saved or attested.'));
  }

  addItemWarnings(candidate, warnings, manifestPages, activeItems);
  return {
    gate: blockers.length ? 'blocked' : warnings.length ? 'warning' : 'ready',
    blockers,
    warnings,
  };
}

export function assessBank(items, context = {}) {
  const activeItems = list(items).filter(isRecord).filter(item => item.retired !== true);
  const settings = record(context);
  const byId = Object.create(null);
  const counts = { total: activeItems.length, draft: 0, attested: 0, ready: 0, warning: 0, blocked: 0 };
  const answerKeys = blankKeys();
  const categoryAnswerKeys = Object.create(null);

  for (const item of activeItems) {
    const assessment = assessItem(item, { ...settings, activeItems });
    byId[item.id] = assessment;
    if (item.status === 'draft') counts.draft++;
    if (item.status === 'attested') counts.attested++;
    counts[assessment.gate]++;

    if (!Object.hasOwn(categoryAnswerKeys, item.category)) {
      categoryAnswerKeys[item.category] = blankKeys();
    }
    if (item.status !== 'draft') continue;
    const options = Array.isArray(item.options) ? item.options : [];
    const correct = options.find(option => option?.c === true);
    if (correct && Object.hasOwn(answerKeys, correct.key)) {
      answerKeys[correct.key]++;
      categoryAnswerKeys[item.category][correct.key]++;
    }
  }

  return { byId, counts, answerKeys, categoryAnswerKeys };
}

function preserveUnknownMembers(original, supported) {
  const source = record(original);
  return Object.fromEntries(Object.keys(source)
    .filter(key => !supported.includes(key))
    .map(key => [key, structuredClone(source[key])]));
}

function copyPresentFields(target, edited, fields) {
  for (const key of fields) {
    if (Object.hasOwn(edited, key)) target[key] = structuredClone(edited[key]);
  }
  return target;
}

function mergeTrap(original, edited) {
  if (!isRecord(edited)) return structuredClone(edited);
  return copyPresentFields(
    preserveUnknownMembers(original, TRAP_FIELDS),
    edited,
    TRAP_FIELDS,
  );
}

function originalOptionsByKey(options) {
  const byKey = new Map();
  for (const option of list(options)) {
    const key = text(option?.key);
    if (key && !byKey.has(key)) byKey.set(key, option);
  }
  return byKey;
}

function mergeMainOption(original, edited) {
  if (!isRecord(edited)) return structuredClone(edited);
  const next = copyPresentFields(
    preserveUnknownMembers(original, OPTION_FIELDS),
    edited,
    ['key', 't', 'c'],
  );
  if (Object.hasOwn(edited, 'trap')) next.trap = mergeTrap(original?.trap, edited.trap);
  return next;
}

function mergeMainOptions(original, edited) {
  if (!Array.isArray(edited)) return structuredClone(edited);
  const originals = originalOptionsByKey(original);
  return edited.map(option => mergeMainOption(originals.get(text(option?.key)), option));
}

function mergeTierOption(original, edited) {
  if (!isRecord(edited)) return structuredClone(edited);
  return copyPresentFields(
    preserveUnknownMembers(original, TIER_OPTION_FIELDS),
    edited,
    TIER_OPTION_FIELDS,
  );
}

function mergeTierOptions(original, edited) {
  if (!Array.isArray(edited)) return structuredClone(edited);
  const originals = originalOptionsByKey(original);
  return edited.map(option => mergeTierOption(originals.get(text(option?.key)), option));
}

function mergeLink(original, edited) {
  if (!isRecord(edited)) return structuredClone(edited);
  return copyPresentFields(
    preserveUnknownMembers(original, LINK_FIELDS),
    edited,
    LINK_FIELDS,
  );
}

function mergeTierTwo(original, edited) {
  if (!isRecord(edited)) return structuredClone(edited);
  const next = copyPresentFields(
    preserveUnknownMembers(original, TIER_FIELDS),
    edited,
    ['q', 'why'],
  );
  if (Object.hasOwn(edited, 'options')) {
    next.options = mergeTierOptions(original?.options, edited.options);
  }
  return next;
}

export function mergeEditableItem(original, edited) {
  const base = record(original);
  const changes = record(edited);
  const next = structuredClone(base);
  for (const key of EDITABLE) {
    if (!Object.hasOwn(changes, key)) {
      delete next[key];
    } else if (key === 'link') {
      next.link = mergeLink(base.link, changes.link);
    } else if (key === 'options') {
      next.options = mergeMainOptions(base.options, changes.options);
    } else if (key === 'tier2') {
      next.tier2 = mergeTierTwo(base.tier2, changes.tier2);
    } else {
      next[key] = structuredClone(changes[key]);
    }
  }
  next.id = base.id;
  next.status = 'draft';
  if (base.retired) next.retired = true;
  if (base.retiredReason) next.retiredReason = base.retiredReason;
  if (base.v2) next.v2 = structuredClone(base.v2);
  if (next.type !== 'relational') delete next.subtype;
  if (next.type !== 'two-tier') delete next.tier2;
  return next;
}

function deeplyEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => deeplyEqual(value, right[index]));
  }
  if (typeof left !== 'object') return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return deeplyEqual(leftKeys, rightKeys)
    && leftKeys.every(key => deeplyEqual(left[key], right[key]));
}

function diffObject(left, right, prefix) {
  if (deeplyEqual(left, right)) return [];
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object'
      || Array.isArray(left) || Array.isArray(right)) {
    return [prefix];
  }
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return keys.flatMap(key => diffObject(left[key], right[key], `${prefix}.${key}`));
}

function keyedOptions(options) {
  if (!Array.isArray(options)) return null;
  const entries = options.map(option => [text(option?.key), option]);
  if (entries.some(([key]) => !OPTION_KEYS.includes(key))
      || new Set(entries.map(([key]) => key)).size !== entries.length) return null;
  return Object.fromEntries(entries);
}

function diffOptionList(left, right, prefix) {
  if (deeplyEqual(left, right)) return [];
  const leftByKey = keyedOptions(left);
  const rightByKey = keyedOptions(right);
  if (!leftByKey || !rightByKey
      || !deeplyEqual(Object.keys(leftByKey).sort(), Object.keys(rightByKey).sort())) {
    return [prefix];
  }
  return OPTION_KEYS
    .filter(key => Object.hasOwn(leftByKey, key))
    .flatMap(key => diffObject(leftByKey[key], rightByKey[key], `${prefix}.${key}`));
}

function diffTierTwo(left, right) {
  if (deeplyEqual(left, right)) return [];
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object'
      || Array.isArray(left) || Array.isArray(right)) {
    return ['tier2'];
  }
  const changes = [];
  for (const key of ['q', 'why']) {
    if (!deeplyEqual(left[key], right[key])) changes.push(`tier2.${key}`);
  }
  changes.push(...diffOptionList(left.options, right.options, 'tier2.options'));
  const otherKeys = [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter(key => !['q', 'why', 'options'].includes(key))
    .sort();
  for (const key of otherKeys) {
    changes.push(...diffObject(left[key], right[key], `tier2.${key}`));
  }
  return changes;
}

export function diffEditableFields(original, edited) {
  const before = record(original);
  const after = record(edited);
  const changes = [];
  for (const key of EDITABLE) {
    if (deeplyEqual(before[key], after[key])) continue;
    if (key === 'options') {
      changes.push(...diffOptionList(before.options, after.options, 'options'));
    } else if (key === 'tier2') {
      changes.push(...diffTierTwo(before.tier2, after.tier2));
    } else if (key === 'link') {
      changes.push(...diffObject(before.link, after.link, 'link'));
    } else {
      changes.push(key);
    }
  }
  return changes;
}

export function assessBatch(items) {
  const selectedItems = list(items);
  const batchItems = selectedItems.filter(isRecord);
  const answerKeys = { A: 0, B: 0, C: 0, D: 0 };
  for (const item of batchItems) {
    const options = Array.isArray(item.options) ? item.options : [];
    const correct = options.find(option => option?.c === true);
    if (correct && Object.hasOwn(answerKeys, correct.key)) answerKeys[correct.key]++;
  }
  const represented = Object.values(answerKeys).filter(Boolean).length;
  const max = Math.max(...Object.values(answerKeys));
  const issues = selectedItems.length >= 4 && (represented < 3 || max > selectedItems.length / 2)
    ? [issue('batch.answer_key_balance', 'options', 'This batch has a strong answer-position cue. Rebalance or attest individually.')]
    : [];
  return { ok: issues.length === 0, issues, answerKeys };
}
