import { createHash } from 'node:crypto';

import {
  assessBank,
  assessBatch,
  assessItem,
  diffEditableFields,
  mergeEditableItem,
} from '../../qbank-rules.mjs';

const REVISION_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^qb_[a-z]+_[0-9]{3}$/;

export class QbankActionError extends Error {
  constructor(code, message, status = 422, issues = []) {
    super(message);
    this.name = 'QbankActionError';
    this.code = code;
    this.status = status;
    this.issues = Array.isArray(issues) ? issues : [];
  }
}

function isActionError(error) {
  try {
    return error instanceof QbankActionError;
  } catch {
    return false;
  }
}

function invalidInput(message = 'The question-bank action input is malformed.') {
  return new QbankActionError('qbank.invalid_input', message, 400);
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stableValue(value, ancestors = new WeakSet(), sortKeys = true) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw invalidInput('Question-bank JSON cannot contain non-finite numbers.');
    return value;
  }
  if (typeof value !== 'object') {
    throw invalidInput('Question-bank actions accept JSON-compatible values only.');
  }
  if (ancestors.has(value)) {
    throw invalidInput('Question-bank JSON cannot contain circular references.');
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const propertyNames = Object.getOwnPropertyNames(value);
      if (Object.getOwnPropertySymbols(value).length
          || propertyNames.length !== value.length + 1) {
        throw invalidInput('Question-bank JSON arrays must be dense and contain only indexed values.');
      }
      return Array.from({ length: value.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
          throw invalidInput('Question-bank JSON arrays cannot contain holes or accessor properties.');
        }
        return stableValue(descriptor.value, ancestors, sortKeys);
      });
    }
    const keys = Object.keys(value);
    if (!isRecord(value)
        || Object.getOwnPropertySymbols(value).length
        || Object.getOwnPropertyNames(value).length !== keys.length) {
      throw invalidInput('Question-bank actions accept plain JSON objects only.');
    }

    const orderedKeys = sortKeys ? keys.sort() : keys;
    return Object.fromEntries(orderedKeys.map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
        throw invalidInput('Question-bank JSON cannot contain accessor properties.');
      }
      return [key, stableValue(descriptor.value, ancestors, sortKeys)];
    }));
  } finally {
    ancestors.delete(value);
  }
}

function canonicalJson(value, requireRecord = false) {
  try {
    if (requireRecord && !isRecord(value)) {
      throw invalidInput('A question item must be a JSON object.');
    }
    return JSON.stringify(stableValue(value));
  } catch (error) {
    if (isActionError(error)) throw error;
    throw invalidInput();
  }
}

function safeClone(value) {
  return stableValue(value, new WeakSet(), false);
}

function actionBoundary(action) {
  try {
    return action();
  } catch (error) {
    if (isActionError(error)) throw error;
    throw invalidInput();
  }
}

function requireInput(input) {
  if (!isRecord(input)) throw invalidInput();
  return input;
}

function requireBank(bank) {
  if (!isRecord(bank) || !Array.isArray(bank.items) || bank.items.some(item => !isRecord(item))) {
    throw invalidInput('The question bank must contain an array of item objects.');
  }
  canonicalJson(bank);
  if (bank.items.some(item => (Object.hasOwn(item, 'retired') && typeof item.retired !== 'boolean')
      || (Object.hasOwn(item, 'retiredReason') && typeof item.retiredReason !== 'string'))) {
    throw invalidInput('Question retirement metadata is malformed.');
  }
  return bank;
}

function requireManifestPages(manifestPages) {
  if (!Array.isArray(manifestPages)
      || manifestPages.length === 0
      || manifestPages.some(page => typeof page !== 'string' || !page.trim())) {
    throw invalidInput('The shipped Markdown manifest is required.');
  }
  return manifestPages;
}

function requireId(id) {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw invalidInput('A valid question ID is required.');
  }
  return id;
}

function requireRevision(revision) {
  if (typeof revision !== 'string' || !REVISION_PATTERN.test(revision)) {
    throw invalidInput('A valid item revision is required.');
  }
  return revision;
}

function requireEditedItem(editedItem) {
  if (!isRecord(editedItem)) throw invalidInput('The edited question must be a JSON object.');
  canonicalJson(editedItem);
  return editedItem;
}

function findActiveItem(bank, id) {
  const matches = [];
  bank.items.forEach((item, index) => {
    if (item.retired !== true && item.id === id) matches.push({ item, index });
  });
  if (matches.length === 0) {
    throw new QbankActionError('qbank.unknown_item', `Unknown active item: ${id}`, 404);
  }
  if (matches.length > 1) {
    throw new QbankActionError('qbank.duplicate_item', `Duplicate active item: ${id}`, 409);
  }
  return matches[0];
}

function requireEntries(entries) {
  if (!Array.isArray(entries)) throw invalidInput('Attestation entries must be an array.');
  if (entries.length === 0) {
    throw new QbankActionError('attest.empty_selection', 'Select at least one question to attest.');
  }

  const ids = new Set();
  for (const entry of entries) {
    if (!isRecord(entry)) throw invalidInput('Every attestation entry must be an object.');
    canonicalJson(entry);
    requireId(entry.id);
    requireRevision(entry.revision);
    if (Object.hasOwn(entry, 'acknowledgedWarnings')
        && (!Array.isArray(entry.acknowledgedWarnings)
          || entry.acknowledgedWarnings.some(code => typeof code !== 'string' || !code))) {
      throw invalidInput('Warning acknowledgements must be an array of issue codes.');
    }
    if (ids.has(entry.id)) {
      throw new QbankActionError('attest.duplicate_item', `Question selected more than once: ${entry.id}`);
    }
    ids.add(entry.id);
  }
  return entries;
}

function requireConfirmations(confirmations) {
  if (!isRecord(confirmations)
      || confirmations.clinical !== true
      || confirmations.evidence !== true
      || confirmations.originalityAndNoPhi !== true) {
    throw new QbankActionError(
      'attest.confirmations_required',
      'Complete all faculty confirmations.',
    );
  }
}

function currentWarningCodes(assessment) {
  return assessment.warnings.map(issue => issue.code);
}

function acknowledgesExactly(entry, warningCodes) {
  const acknowledged = entry.acknowledgedWarnings;
  return Array.isArray(acknowledged)
    && acknowledged.length === warningCodes.length
    && new Set(acknowledged).size === acknowledged.length
    && warningCodes.every(code => acknowledged.includes(code));
}

export function itemRevision(item) {
  return actionBoundary(() => createHash('sha256')
    .update(canonicalJson(item, true))
    .digest('hex'));
}

export function prepareDraftSave(input) {
  return actionBoundary(() => {
    const {
      bank,
      manifestPages,
      id,
      baseRevision,
      editedItem,
    } = requireInput(input);
    requireBank(bank);
    requireManifestPages(manifestPages);
    requireId(id);
    requireRevision(baseRevision);
    requireEditedItem(editedItem);

    const { item: original, index } = findActiveItem(bank, id);
    if (itemRevision(original) !== baseRevision) {
      throw new QbankActionError(
        'qbank.conflict',
        'This question changed after you loaded it.',
        409,
      );
    }

    const next = mergeEditableItem(original, editedItem);
    const changedFields = diffEditableFields(original, next);
    if (changedFields.length === 0) {
      throw new QbankActionError('qbank.no_changes', 'No editable question fields changed.');
    }

    const candidateItems = bank.items.map((item, itemIndex) => itemIndex === index ? next : item);
    const assessment = assessItem(next, {
      manifestPages,
      activeItems: candidateItems.filter(item => item.retired !== true),
    });
    if (assessment.blockers.length) {
      throw new QbankActionError(
        'qbank.blocked_draft',
        'Resolve structural blockers before saving.',
        422,
        assessment.blockers,
      );
    }

    const nextBank = safeClone(bank);
    const savedItem = safeClone(next);
    nextBank.items[index] = savedItem;
    return { bank: nextBank, item: savedItem, assessment, changedFields };
  });
}

export function prepareAttestation(input) {
  return actionBoundary(() => {
    const {
      bank,
      manifestPages,
      entries,
      confirmations,
    } = requireInput(input);
    requireBank(bank);
    requireManifestPages(manifestPages);
    requireEntries(entries);
    requireConfirmations(confirmations);

    const assessmentById = assessBank(bank.items, { manifestPages }).byId;
    const selected = entries.map(entry => {
      const { item, index } = findActiveItem(bank, entry.id);
      if (itemRevision(item) !== entry.revision) {
        throw new QbankActionError('qbank.conflict', `${entry.id} changed.`, 409);
      }
      if (item.status !== 'draft') {
        throw new QbankActionError(
          'attest.not_draft',
          `${entry.id} must be saved as a draft before attestation.`,
        );
      }
      return { item, index, entry, assessment: assessmentById[entry.id] };
    });

    const blockedIssues = selected.flatMap(selection => selection.assessment.blockers);
    if (blockedIssues.length) {
      throw new QbankActionError(
        'attest.blocked',
        'Resolve structural blockers before attestation.',
        422,
        blockedIssues,
      );
    }

    const warned = selected.filter(selection => selection.assessment.warnings.length);
    if (selected.length > 1 && warned.length) {
      throw new QbankActionError(
        'attest.warning_individual_only',
        'Questions with warnings must be attested individually.',
        422,
        warned.flatMap(selection => selection.assessment.warnings),
      );
    }
    if (warned.length === 1) {
      const [{ entry, assessment }] = warned;
      const warningCodes = currentWarningCodes(assessment);
      if (!acknowledgesExactly(entry, warningCodes)) {
        throw new QbankActionError(
          'attest.warning_acknowledgement_required',
          'Acknowledge every current warning before attestation.',
          422,
          assessment.warnings,
        );
      }
    }

    const batchAssessment = assessBatch(selected.map(selection => selection.item));
    if (!batchAssessment.ok) {
      throw new QbankActionError(
        'attest.batch_blocked',
        'Resolve batch quality issues before attestation.',
        422,
        batchAssessment.issues,
      );
    }

    const nextBank = safeClone(bank);
    for (const { index } of selected) nextBank.items[index].status = 'attested';
    return { bank: nextBank, ids: selected.map(selection => selection.item.id) };
  });
}
