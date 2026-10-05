/* Review bank contents (2026-10-05) — the model and the rendering behind the console's
   read-only view of every file a signature covers beyond the page itself.

   WHY THIS EXISTS. A page or tool signature is a hash over its `source` PLUS every
   `extraSources` file (attestation_hash.py `sources_for_slug`; JS twin `sourcesForSlug`).
   For five tools those extra files are whole content banks — 437 deck cards, 16
   communication cases, 8 family scenarios, 4 + 5 reasoning cases — and the console had no
   surface that displayed them: the baseline press showed titles, and the live preview showed
   whatever the learner tool happened to serve (12 new deck cards a day, one chosen choice's
   feedback, never the resident reasoning cases). Signatures therefore covered text the review
   surface never displayed. This module renders ALL of it, read-only, from the exact bytes the
   hash covers (the server reads them at the attestation branch's head and checks each file's
   blob sha against the tree it fingerprints), and counts which sections have been opened so
   the tool's own sign control can stay disabled until every one has.

   "OPENED" IS WHAT IS MEASURED, NOT "READ". A section counts as opened once the reviewer has
   expanded it and its body has been on screen in this session. Nothing here — and nothing
   the console sends — claims the reviewer read it; that is the reviewer's own statement when
   they sign.

   COMPLETENESS IS STRUCTURAL. Every field of every record is rendered: the shapes this
   module knows (deck questions, answer options, case choices) get a readable layout, and every
   key they do not consume falls through to a generic renderer that prints the rest. A field
   added to a bank tomorrow is displayed tomorrow without a change here.

   Browser- and Node-safe on purpose (no imports): the server builds the section model with
   `describeBankFile`, and the desktop console renders it with `renderBankFile`, handing in its
   own element factory, so the test suite renders through the very same function. */

// A generic top-level array longer than this is shown in groups of this many records, so a
// 138-entry list of small records is 7 sections to open, not 138.
export const BANK_GROUP_SIZE = 20;

// The units a section can be, in the order progress is reported. Deck/case/scenario are named
// after what faculty know them as; everything else is an "other section".
export const BANK_UNITS = Object.freeze(['deck', 'case', 'scenario', 'question-group', 'section']);
const UNIT_NOUNS = Object.freeze({
  deck: ['deck', 'decks'],
  case: ['case', 'cases'],
  scenario: ['scenario', 'scenarios'],
  'question-group': ['question group', 'question groups'],
  section: ['other section', 'other sections'],
});
// Top-level arrays whose records are the units faculty review one at a time.
const RECORD_UNITS = Object.freeze({ cases: 'case', scenarios: 'scenario' });
const OPTION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPrimitive(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function basename(path) {
  const parts = String(path).split('/');
  return parts[parts.length - 1] || String(path);
}

/** "learnerGoal" → "Learner goal", "_note" → "Note", "evidenceIds" → "Evidence ids". A key
    that is not a plain identifier is DATA (an evidence id, a slug, a card id) and is shown
    exactly as written. */
export function humanizeKey(key) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(key))) return String(key);
  const words = String(key)
    .replace(/^_+/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : String(key);
}

function recordTitle(record, fallback) {
  const id = typeof record?.id === 'string' ? record.id.trim() : '';
  const title = typeof record?.title === 'string' ? record.title.trim() : '';
  if (id && title) return `${id} · ${title}`;
  return title || id || fallback;
}

export function unitNoun(unit, count) {
  const nouns = UNIT_NOUNS[unit] || UNIT_NOUNS.section;
  return count === 1 ? nouns[0] : nouns[1];
}

function isDeckList(value) {
  return Array.isArray(value) && value.length > 0
    && value.every(deck => isPlainObject(deck) && Array.isArray(deck.questions));
}

function isQuestionList(value) {
  return Array.isArray(value) && value.length > 0
    && value.every(item => isPlainObject(item) && typeof item.id === 'string'
      && (typeof item.stem === 'string' || Array.isArray(item.options)));
}

/**
 * One bank file as sections. Pure; `text` is the file's UTF-8 text. Never throws: a file this
 * module cannot parse is shown as its raw text, which is still the whole of it.
 *
 *   header    [key, value] pairs shown above the sections, always visible: every top-level
 *             primitive (and array of primitives, and empty container).
 *   sections  each a collapsible unit: { id, title, unit, and ONE of record | records | value
 *             | text }, plus `cards` for a deck. `id` is stable within the file; the server
 *             adds a content-addressed `key`.
 */
export function describeBankFile(path, text) {
  const source = typeof text === 'string' ? text : '';
  let doc;
  let parsed = false;
  if (/\.json$/i.test(String(path))) {
    try {
      doc = JSON.parse(source);
      parsed = true;
    } catch {
      parsed = false;
    }
  }
  if (!parsed) {
    return {
      path,
      format: 'text',
      header: [],
      sections: [{ id: `${path}#text`, title: basename(path), unit: 'section', text: source }],
    };
  }
  if (!isPlainObject(doc)) {
    return {
      path,
      format: 'json',
      header: [],
      sections: [{ id: `${path}#document`, title: basename(path), unit: 'section', value: doc }],
    };
  }
  const header = [];
  const sections = [];
  let format = 'records';
  for (const [key, value] of Object.entries(doc)) {
    if (key === 'decks' && isDeckList(value)) {
      format = 'decks';
      value.forEach((deck, index) => sections.push({
        id: `${path}#decks/${index}`,
        title: recordTitle(deck, `Deck ${index + 1}`),
        unit: 'deck',
        cards: deck.questions.length,
        record: deck,
      }));
      continue;
    }
    if (key === 'items' && isQuestionList(value)) {
      format = 'questions';
      const groups = new Map();
      for (const item of value) {
        const category = typeof item.category === 'string' && item.category ? item.category : 'uncategorised';
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category).push(item);
      }
      for (const [category, items] of groups) {
        sections.push({
          id: `${path}#items/category:${category}`,
          title: `${category} · ${items.length} question${items.length === 1 ? '' : 's'}`,
          unit: 'question-group',
          records: items,
        });
      }
      continue;
    }
    if (Array.isArray(value) && value.length && value.every(isPlainObject)) {
      const unit = RECORD_UNITS[key] || 'section';
      if (unit !== 'section' || value.length <= BANK_GROUP_SIZE) {
        value.forEach((record, index) => sections.push({
          id: `${path}#${key}/${index}`,
          title: recordTitle(record, `${humanizeKey(key)} ${index + 1}`),
          unit,
          record,
        }));
      } else {
        for (let start = 0; start < value.length; start += BANK_GROUP_SIZE) {
          const records = value.slice(start, start + BANK_GROUP_SIZE);
          sections.push({
            id: `${path}#${key}/${start}-${start + records.length - 1}`,
            title: `${humanizeKey(key)} ${start + 1}–${start + records.length} of ${value.length}`,
            unit: 'section',
            records,
            start,
          });
        }
      }
      continue;
    }
    if ((isPlainObject(value) && Object.keys(value).length)
        || (Array.isArray(value) && value.some(entry => !isPrimitive(entry)))) {
      sections.push({ id: `${path}#${key}`, title: humanizeKey(key), unit: 'section', value });
      continue;
    }
    header.push([key, value]);
  }
  return { path, format, header, sections };
}

/** Every section of a bank view, flattened, with the file it came from. */
export function bankSections(view) {
  const out = [];
  for (const file of Array.isArray(view?.files) ? view.files : []) {
    for (const section of Array.isArray(file?.sections) ? file.sections : []) {
      out.push({ ...section, path: file.path });
    }
  }
  return out;
}

/**
 * How much of a bank view has been opened. `opened` is a Set of section keys (content-
 * addressed, so a case opened under one tool counts under every tool carrying the same text).
 */
export function bankProgress(view, opened) {
  const seen = opened instanceof Set ? opened : new Set();
  const sections = bankSections(view);
  const byUnit = new Map();
  for (const section of sections) {
    const unit = BANK_UNITS.includes(section.unit) ? section.unit : 'section';
    if (!byUnit.has(unit)) byUnit.set(unit, { unit, total: 0, opened: 0 });
    const entry = byUnit.get(unit);
    entry.total += 1;
    if (typeof section.key === 'string' && seen.has(section.key)) entry.opened += 1;
  }
  const units = BANK_UNITS.filter(unit => byUnit.has(unit)).map(unit => byUnit.get(unit));
  const total = sections.length;
  const openedCount = units.reduce((sum, entry) => sum + entry.opened, 0);
  return {
    total,
    opened: openedCount,
    // A view with no sections cannot vouch for anything: it is never complete.
    complete: total > 0 && openedCount === total,
    units,
  };
}

function joinList(parts) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** "12 of 79 decks not yet opened", or what has been opened when nothing is left. */
export function bankProgressText(progress) {
  if (!progress || !progress.total) return 'This bank view has no sections to open.';
  const remaining = progress.units
    .filter(entry => entry.opened < entry.total)
    .map(entry => `${entry.total - entry.opened} of ${entry.total} ${unitNoun(entry.unit, entry.total)}`);
  if (remaining.length) return `${joinList(remaining)} not yet opened`;
  return `Every section opened: ${joinList(progress.units.map(entry => `${entry.total} ${unitNoun(entry.unit, entry.total)}`))}`;
}

// ── Rendering ──────────────────────────────────────────────────────────────────────────
// `h(tag, attributes, children)` is the caller's element factory (the console's `el`).
// Units a test can count are marked with `data-bank-unit`: card, option, option-feedback,
// choice, choice-feedback, question, record.

function emptyNote(label) {
  return ['em', { class: 'bank-empty' }, [label]];
}

function build(h, spec) {
  if (spec === null || spec === undefined) return null;
  if (typeof spec === 'string') return spec;
  const [tag, attributes, children] = spec;
  return h(tag, attributes, (children || []).map(child => build(h, child)).filter(child => child !== null));
}

function isOptionList(key, value) {
  return (key === 'o' || key === 'options') && Array.isArray(value) && value.length > 0
    && value.every(option => isPlainObject(option) && typeof option.t === 'string');
}

function isChoiceList(key, value) {
  return key === 'choices' && Array.isArray(value) && value.length > 0
    && value.every(choice => isPlainObject(choice) && typeof choice.text === 'string');
}

function primitiveText(value) {
  if (value === null) return '(null)';
  if (value === '') return null;
  return String(value);
}

function valueSpec(value, key = '') {
  if (isPrimitive(value)) {
    const shown = primitiveText(value);
    return shown === null ? emptyNote('(empty)') : ['span', { class: 'bank-value' }, [shown]];
  }
  if (Array.isArray(value)) {
    if (!value.length) return emptyNote('(none)');
    if (isOptionList(key, value)) return optionListSpec(value);
    if (isChoiceList(key, value)) return choiceListSpec(value);
    if (value.every(isPrimitive)) {
      return ['ul', { class: 'bank-list' }, value.map(entry => ['li', {}, [valueSpec(entry)]])];
    }
    return ['ol', { class: 'bank-records' }, value.map(entry => ['li', { 'data-bank-unit': 'record' }, [valueSpec(entry)]])];
  }
  if (isPlainObject(value)) return fieldsSpec(value, []);
  return ['span', { class: 'bank-value' }, [String(value)]];
}

/** Every field of `record` not in `skip`, as a definition list (null when nothing is left). */
function fieldsSpec(record, skip) {
  const entries = Object.entries(record).filter(([key]) => !skip.includes(key));
  if (!entries.length) return skip.length ? null : emptyNote('(empty)');
  return ['dl', { class: 'bank-fields' }, entries.flatMap(([key, value]) => [
    ['dt', {}, [humanizeKey(key)]],
    ['dd', {}, [valueSpec(value, key)]],
  ])];
}

function optionListSpec(options) {
  return ['ol', { class: 'bank-options' }, options.map((option, index) => {
    const keyed = option.c === true;
    const letter = typeof option.key === 'string' && option.key ? option.key : OPTION_LETTERS[index] || String(index + 1);
    const hasFeedback = Object.hasOwn(option, 'fb');
    const feedback = hasFeedback && typeof option.fb === 'string' ? option.fb.trim() : '';
    return ['li', { class: keyed ? 'bank-option keyed' : 'bank-option', 'data-bank-unit': 'option' }, [
      ['p', { class: 'bank-option-text' }, [
        ['span', { class: 'bank-option-letter' }, [`${letter}.`]],
        ` ${option.t}`,
        keyed ? ['strong', { class: 'bank-keyed' }, [' — keyed answer']] : null,
      ]],
      hasFeedback ? ['p', { class: 'bank-feedback', 'data-bank-unit': 'option-feedback' }, [
        ['span', { class: 'bank-label' }, ['Feedback: ']],
        feedback ? feedback : emptyNote('none written for this option'),
      ]] : null,
      fieldsSpec(option, ['t', 'c', 'fb', 'key']),
    ]];
  })];
}

function choiceListSpec(choices) {
  return ['ol', { class: 'bank-choices' }, choices.map(choice => {
    const quality = typeof choice.quality === 'string' ? choice.quality : '';
    const feedback = typeof choice.feedback === 'string' ? choice.feedback.trim() : '';
    return ['li', { class: `bank-choice${quality ? ` quality-${quality.replace(/[^a-z0-9-]/gi, '')}` : ''}`, 'data-bank-unit': 'choice' }, [
      ['p', { class: 'bank-option-text' }, [
        quality ? ['span', { class: 'bank-quality' }, [quality]] : null,
        typeof choice.id === 'string' && choice.id ? ['span', { class: 'bank-option-letter' }, [` ${choice.id}.`]] : null,
        ` ${choice.text}`,
      ]],
      ['p', { class: 'bank-feedback', 'data-bank-unit': 'choice-feedback' }, [
        ['span', { class: 'bank-label' }, ['Feedback: ']],
        feedback ? feedback : emptyNote('none written for this choice'),
      ]],
      fieldsSpec(choice, ['id', 'text', 'quality', 'feedback']),
    ]];
  })];
}

function deckSpec(deck) {
  const cards = Array.isArray(deck.questions) ? deck.questions : [];
  return ['div', { class: 'bank-deck' }, [
    fieldsSpec(deck, ['questions']),
    ['ol', { class: 'bank-cards' }, cards.map((card, index) => {
      const record = isPlainObject(card) ? card : { value: card };
      const stem = typeof record.q === 'string' ? record.q : '';
      return ['li', { class: 'bank-card', 'data-bank-unit': 'card' }, [
        ['p', { class: 'bank-stem' }, [['strong', {}, [`Card ${index + 1}. `]], stem || emptyNote('(no question text)')]],
        Array.isArray(record.o) ? optionListSpec(record.o) : null,
        fieldsSpec(record, ['q', 'o']),
      ]];
    })],
  ]];
}

function questionGroupSpec(items) {
  return ['ol', { class: 'bank-cards' }, items.map(item => ['li', { class: 'bank-card', 'data-bank-unit': 'question' }, [
    ['p', { class: 'bank-stem' }, [
      ['strong', {}, [`${item.id}${item.retired === true ? ' (retired)' : ''}. `]],
      typeof item.stem === 'string' && item.stem ? item.stem : emptyNote('(no stem)'),
    ]],
    Array.isArray(item.options) && isOptionList('options', item.options) ? optionListSpec(item.options) : null,
    fieldsSpec(item, ['id', 'stem', ...(isOptionList('options', item.options) ? ['options'] : [])]),
  ]])];
}

function sectionBodySpec(section) {
  if (typeof section.text === 'string') return ['pre', { class: 'bank-text' }, [section.text]];
  if (section.unit === 'deck' && isPlainObject(section.record)) return deckSpec(section.record);
  if (section.unit === 'question-group' && Array.isArray(section.records)) return questionGroupSpec(section.records);
  if (Array.isArray(section.records)) {
    return ['ol', { class: 'bank-records', start: String((section.start || 0) + 1) },
      section.records.map(record => ['li', { 'data-bank-unit': 'record' }, [valueSpec(record)]])];
  }
  if (Object.hasOwn(section, 'record')) return valueSpec(section.record);
  return valueSpec(section.value);
}

/**
 * One section as a <details>. `options`:
 *   domId(section)        the element id (the console derives it from the section key)
 *   expanded(section)     whether it renders open
 *   opened(section)       whether it has been opened this session (summary marker only)
 *   onToggle(section, e)  the toggle listener
 */
export function renderBankSection(section, h, options = {}) {
  const opened = options.opened ? options.opened(section) === true : false;
  const unitLabel = unitNoun(section.unit, 1);
  return h('details', {
    id: options.domId ? options.domId(section) : null,
    class: `bank-section${opened ? ' opened' : ''}`,
    'data-bank-section': section.unit,
    'data-bank-key': typeof section.key === 'string' ? section.key : null,
    open: options.expanded ? options.expanded(section) === true : false,
    onToggle: options.onToggle ? event => options.onToggle(section, event) : null,
  }, [
    h('summary', {}, [
      h('span', { class: 'bank-section-unit' }, [unitLabel]),
      ` ${section.title}`,
      section.unit === 'deck' && Number.isInteger(section.cards) ? ` · ${section.cards} card${section.cards === 1 ? '' : 's'}` : '',
      h('span', { class: 'bank-opened-mark', 'aria-label': opened ? 'opened' : 'not yet opened' }, [opened ? ' ✓ opened' : '']),
    ]),
    h('div', { class: 'bank-section-body' }, [build(h, sectionBodySpec(section))]),
  ]);
}

/** One file: its path, header fields (always visible), then every section. */
export function renderBankFile(file, h, options = {}) {
  const sections = Array.isArray(file?.sections) ? file.sections : [];
  const header = Array.isArray(file?.header) ? file.header : [];
  return h('section', { class: 'bank-file', 'data-bank-file': file?.path || '' }, [
    h('h3', { class: 'bank-file-title' }, [h('code', {}, [String(file?.path || '')])]),
    h('p', { class: 'hint' }, [
      `${sections.length} section${sections.length === 1 ? '' : 's'}`,
      typeof file?.revision === 'string' && file.revision ? ` · file revision ${file.revision.slice(0, 12)}` : '',
    ]),
    header.length ? build(h, ['dl', { class: 'bank-fields bank-file-header' }, header.flatMap(([key, value]) => [
      ['dt', {}, [humanizeKey(key)]],
      ['dd', {}, [valueSpec(value, key)]],
    ])]) : null,
    ...sections.map(section => renderBankSection(section, h, options)),
  ]);
}
