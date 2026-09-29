#!/usr/bin/env node
/*
 * check-qbank-drafts.mjs — every live draft question must be attestable from the phone.
 *
 * DECISION: qbank-drafts-phone-attestable (2026-09-29, Joshua Moss, MD).
 *
 * WHY. The faculty console's phone view (faculty-console/m/) never offers Attest for a question
 * the console's own rules flag: m-model.mjs passes an empty warningAcks set, so any warning
 * leaves the item desktop-only, and a blocker makes it unattestable anywhere. On 2026-09-28 all
 * five live drafts reached main carrying one warning each (lead-in wording, evidence citing a
 * file name instead of a page slug, a conspicuously long keyed answer), and nothing was red.
 * The owner found out by failing to attest them on the phone. #891 fixed the five; this gate
 * keeps the next one from merging.
 *
 * WHAT. Loads question_bank.json and the shipped Markdown manifest exactly as the console's
 * attest function does (faculty-console/netlify/functions/attest.mjs buildQbankPayload), runs
 * the SAME faculty-console/qbank-rules.mjs assessBank over the live (not retired) items, and
 * fails if any live item the console would queue (status !== 'attested', review-model.mjs
 * completion()) is not gate === 'ready'. The rules are imported, never copied: the gate and the
 * phone cannot disagree about what "flagged" means, and a PR that changes the rules is checked
 * against every draft by the rules it ships.
 *
 * WHAT IT DOES NOT DO. It never judges attested items (their warnings were acknowledged at
 * signing; WP-7's length-cue ratchet owns that debt) and never edits anything unless --fix is
 * passed. --fix repairs only the two warnings with one mechanical answer, and only on drafts:
 *   stem.lead_in           a final "The <x> is/are:" becomes "What is/are the <x>?"; a final
 *                          "Which/What ... :" gets its question mark. Anything else is left.
 *   evidence.page_mismatch a raw source file name (or path) of exactly one selected page is
 *                          replaced by that page's slug, as the manifest maps it.
 * Wording that needs clinical judgment (weak or negative lead-in, answer length, cueing,
 * near-duplicate stems) is reported, never rewritten. --fix never touches `status`.
 *
 * DESKTOP-ONLY EXCEPTIONS. bin/qbank_desktop_only.json may list a draft whose warnings the owner
 * wants kept ({id, codes, reason}); it is then allowed to stay desktop-only. The list is content,
 * its cap is MAX_DESKTOP_ONLY here (policy, 0 today): opening the door is its own policy commit.
 * An entry for an item that is no longer a flagged draft, or whose codes no longer match, fails.
 *
 * Usage:
 *   node bin/check-qbank-drafts.mjs              # the gate
 *   node bin/check-qbank-drafts.mjs --fix        # repair the mechanical warnings, then the gate
 *   node bin/check-qbank-drafts.mjs --self-test  # falsification, no repository files read
 *   node bin/check-qbank-drafts.mjs --root DIR   # another checkout
 *
 * Exit 0 clean, 1 a flagged draft (or a bad exception), 2 could not check.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessBank } from '../faculty-console/qbank-rules.mjs';

export const QBANK_PATH = 'question_bank.json';
export const MANIFEST_PATH = '13_Faculty_Resources/_automation/site_build/site_manifest.json';
export const DESKTOP_ONLY_PATH = 'bin/qbank_desktop_only.json';
export const MAX_DESKTOP_ONLY = 0;
export const FIXABLE = new Set(['stem.lead_in', 'evidence.page_mismatch']);

// Same token rule as qbank-rules.mjs markdownSlugs(): a *.md word not glued to more word chars.
const SLUG_TOKEN = /[A-Za-z0-9_.-]+\.md(?![A-Za-z0-9_.-])/g;
const text = value => (typeof value === 'string' ? value.trim() : '');
const escapeRe = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The slugs a question may anchor to — attest.mjs requireManifest(): md entries are [src, slug, title]. */
export function manifestPagesOf(manifest) {
  const md = Array.isArray(manifest?.md) ? manifest.md : null;
  if (!md || !md.length || md.some(e => !Array.isArray(e) || typeof e[1] !== 'string' || !e[1])) {
    throw new Error(`${MANIFEST_PATH}: expected a non-empty md list of [src, slug, title]`);
  }
  return md.map(([, slug]) => slug);
}

/** What the console queues for review: live (not retired) and not attested (review-model completion()). */
export function isLiveDraft(item) {
  return item && item.retired !== true && item.status !== 'attested';
}

function sameCodes(left, right) {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((code, i) => code === b[i]);
}

/**
 * Pure: judge a bank. Returns { drafts, ready, excused, problems }. A problem is
 * { id, kind, issues?, fixable?, detail? } with kind blocked | warning | exception | cap.
 */
export function evaluate({ bank, manifest, desktopOnly = [], cap = MAX_DESKTOP_ONLY }) {
  if (!bank || !Array.isArray(bank.items)) throw new Error(`${QBANK_PATH}: expected an items list`);
  const manifestPages = manifestPagesOf(manifest);
  const active = bank.items.filter(item => item && item.retired !== true);
  const { byId } = assessBank(active, { manifestPages, activeItems: active });
  const drafts = active.filter(isLiveDraft);
  const problems = [];
  const excused = [];
  let ready = 0;

  const entries = Array.isArray(desktopOnly) ? desktopOnly : [];
  const byException = new Map();
  for (const entry of entries) {
    const id = text(entry?.id);
    if (!id || !Array.isArray(entry?.codes) || !entry.codes.length || !text(entry?.reason)) {
      problems.push({ id: id || '(no id)', kind: 'exception', detail: 'a desktop-only entry needs id, codes and reason' });
    } else if (byException.has(id)) {
      problems.push({ id, kind: 'exception', detail: 'listed twice in the desktop-only file' });
    } else {
      byException.set(id, entry);
    }
  }
  if (entries.length > cap) {
    problems.push({ id: DESKTOP_ONLY_PATH, kind: 'cap', detail: `${entries.length} desktop-only entr${entries.length === 1 ? 'y' : 'ies'}; the cap is ${cap} (MAX_DESKTOP_ONLY in this script — raising it is a policy commit)` });
  }

  for (const item of drafts) {
    const assessment = byId[item.id] || { gate: 'blocked', blockers: [{ code: 'unassessed', message: 'The console rules returned no assessment.' }], warnings: [] };
    const exception = byException.get(item.id);
    if (assessment.gate === 'ready') {
      ready++;
      if (exception) problems.push({ id: item.id, kind: 'exception', detail: 'is ready now — delete its desktop-only entry' });
      continue;
    }
    if (assessment.gate === 'blocked') {
      problems.push({ id: item.id, kind: 'blocked', issues: assessment.blockers });
      continue;
    }
    const codes = assessment.warnings.map(w => w.code);
    if (exception && sameCodes(exception.codes, codes)) {
      excused.push({ id: item.id, codes, reason: text(exception.reason) });
      continue;
    }
    problems.push({
      id: item.id,
      kind: 'warning',
      issues: assessment.warnings,
      fixable: codes.filter(code => FIXABLE.has(code)),
      detail: exception ? `desktop-only entry lists ${[...exception.codes].sort().join(', ')}; the console now flags ${[...codes].sort().join(', ')}` : '',
    });
  }
  const draftIds = new Set(drafts.map(item => item.id));
  for (const id of byException.keys()) {
    if (!draftIds.has(id)) problems.push({ id, kind: 'exception', detail: 'is not a live draft — delete its desktop-only entry' });
  }
  return { drafts: drafts.length, ready, excused, problems };
}

/**
 * stem.lead_in, the mechanical cases only. Returns the repaired stem, or null to leave it for a
 * person. The final sentence is split at ". " / "! " / "? " so a dose like "0.5 mg" never splits.
 */
export function fixLeadIn(stem) {
  const value = text(stem);
  if (!value || value.endsWith('?')) return null;
  const trimmed = value.replace(/[\s:.…_]+$/u, '');
  const boundary = Math.max(trimmed.lastIndexOf('. '), trimmed.lastIndexOf('! '), trimmed.lastIndexOf('? '));
  const head = boundary >= 0 ? trimmed.slice(0, boundary + 2) : '';
  const last = boundary >= 0 ? trimmed.slice(boundary + 2) : trimmed;
  let match = /^The ([^.?!:;]+?) (is|are)$/.exec(last);
  if (match) return `${head}What ${match[2]} the ${match[1]}?`;
  match = /^(?:Which|What)\b[^.?!:;]*$/.exec(last);
  if (match) return `${head}${last}?`;
  return null;
}

/**
 * evidence.page_mismatch, the mechanical case only: the evidence names a selected page by its
 * source path or file name instead of its slug, and exactly one selected page matches. Returns
 * the repaired evidence, or null.
 */
export function fixEvidence(evidence, pages, manifest) {
  const value = typeof evidence === 'string' ? evidence : '';
  const selected = Array.isArray(pages) ? pages.filter(page => typeof page === 'string') : [];
  if (!value || !selected.length) return null;
  const tokens = value.match(SLUG_TOKEN) || [];
  if (selected.some(page => tokens.includes(page))) return null;
  const md = Array.isArray(manifest?.md) ? manifest.md : [];
  const candidates = md.filter(([src, slug]) => selected.includes(slug) && typeof src === 'string');
  const hits = [];
  for (const [src, slug] of candidates) {
    const base = path.posix.basename(src);
    if (value.includes(src)) hits.push({ find: src, slug });
    else if (tokens.includes(base)) hits.push({ find: base, slug });
  }
  const slugs = new Set(hits.map(hit => hit.slug));
  if (hits.length !== 1 || slugs.size !== 1) return null;
  const { find, slug } = hits[0];
  const whole = new RegExp(`(?<![A-Za-z0-9_./-])${escapeRe(find)}(?![A-Za-z0-9_.-])`, 'g');
  const repaired = value.replace(whole, slug);
  return repaired === value ? null : repaired;
}

/** Pure: repair the mechanical warnings on live drafts. Returns { bank, changes }. Never touches status. */
export function applyFixes(bank, manifest) {
  const manifestPages = manifestPagesOf(manifest);
  const items = bank.items.map(item => ({ ...item }));
  const active = items.filter(item => item && item.retired !== true);
  const { byId } = assessBank(active, { manifestPages, activeItems: active });
  const changes = [];
  for (const item of active) {
    if (!isLiveDraft(item)) continue;
    const codes = new Set((byId[item.id]?.warnings || []).map(w => w.code));
    if (codes.has('stem.lead_in')) {
      const stem = fixLeadIn(item.stem);
      if (stem) { changes.push({ id: item.id, field: 'stem', before: item.stem, after: stem }); item.stem = stem; }
    }
    if (codes.has('evidence.page_mismatch')) {
      const evidence = fixEvidence(item.evidence, item.pages, manifest);
      if (evidence) { changes.push({ id: item.id, field: 'evidence', before: item.evidence, after: evidence }); item.evidence = evidence; }
    }
  }
  return { bank: { ...bank, items }, changes };
}

/** The human report. Returns lines; the caller prints them. */
export function report(result) {
  const lines = ['qbank drafts — every live draft must be attestable from the phone (console gate = ready)'];
  lines.push(`  live drafts ${result.drafts} · ready ${result.ready} · desktop-only by exception ${result.excused.length} · problems ${result.problems.length}`);
  for (const ex of result.excused) lines.push(`  desktop-only  ${ex.id} (${ex.codes.join(', ')}) — ${ex.reason}`);
  for (const problem of result.problems) {
    if (problem.kind === 'blocked' || problem.kind === 'warning') {
      const label = problem.kind === 'blocked' ? 'BLOCKED (unattestable anywhere)' : 'FLAGGED (desktop-only)';
      lines.push(`  ${label}  ${problem.id}`);
      for (const issue of problem.issues) {
        const tag = problem.fixable?.includes(issue.code) ? '  [--fix repairs this]' : '';
        lines.push(`      ${issue.code} — ${issue.message}${tag}`);
      }
      if (problem.detail) lines.push(`      note: ${problem.detail}`);
    } else {
      lines.push(`  ${problem.kind.toUpperCase()}  ${problem.id} — ${problem.detail}`);
    }
  }
  if (result.problems.length) {
    const fixable = result.problems.some(p => p.fixable?.length);
    lines.push(`FAIL — ${result.problems.length} problem(s). Rewrite the flagged draft(s) until the console shows them ready${fixable ? '; run `node bin/check-qbank-drafts.mjs --fix` first for the mechanical ones' : ''}.`);
  } else {
    lines.push(`OK — all ${result.drafts} live draft(s) can be attested from the phone.`);
  }
  return lines;
}

function readJson(root, rel, { optional = false } = {}) {
  const file = path.join(root, rel);
  if (optional && !fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function desktopOnlyEntries(raw) {
  if (raw === null) return [];
  if (!raw || !Array.isArray(raw.entries)) throw new Error(`${DESKTOP_ONLY_PATH}: expected {"entries": [...]}`);
  return raw.entries;
}

export function run(root, { fix = false } = {}) {
  const bank = readJson(root, QBANK_PATH);
  const manifest = readJson(root, MANIFEST_PATH);
  const desktopOnly = desktopOnlyEntries(readJson(root, DESKTOP_ONLY_PATH, { optional: true }));
  const lines = [];
  let current = bank;
  if (fix) {
    const { bank: repaired, changes } = applyFixes(bank, manifest);
    if (changes.length) {
      fs.writeFileSync(path.join(root, QBANK_PATH), `${JSON.stringify(repaired, null, 2)}\n`);
      current = repaired;
    }
    lines.push(`--fix: ${changes.length} mechanical repair(s)${changes.length ? ' written to question_bank.json — review the diff before committing' : ''}`);
    for (const change of changes) {
      lines.push(`  ${change.id}.${change.field}`, `    - ${change.before}`, `    + ${change.after}`);
    }
  }
  const result = evaluate({ bank: current, manifest, desktopOnly });
  return { result, lines: [...lines, ...report(result)] };
}

// ─── falsification ──────────────────────────────────────────────────────────────────────────
// Every case plants the defect the gate exists for and asserts it goes red, so a gate that
// silently passes everything (the check_vacuity.py failure class) cannot stay green.
const FIXTURE_MANIFEST = {
  md: [
    ['03_Core_Topics/Mood/mood_teaching.md', 't_mood.md', 'Mood'],
    ['03_Core_Topics/SUD/substance_teaching.md', 't_sud.md', 'Substance Use'],
  ],
  tools: [],
};

export function fixtureItem(overrides = {}) {
  return {
    id: 'qb_mood_901',
    status: 'draft',
    type: 'sba',
    category: 'mood',
    competency: ['dx'],
    difficulty: 2,
    pages: ['t_mood.md'],
    link: { label: 'Mood', href: '?page=t_mood.md' },
    stem: 'A 30-year-old woman has two weeks of low mood, anhedonia and early waking. What is the most likely diagnosis?',
    options: [
      { key: 'A', t: 'Major depressive disorder', c: true },
      { key: 'B', t: 'Bipolar I disorder', trap: { name: 'No mania', note: 'No manic episode is described.' } },
      { key: 'C', t: 'Adjustment disorder', trap: { name: 'Stressor', note: 'No stressor is named.' } },
      { key: 'D', t: 'Persistent depressive disorder', trap: { name: 'Duration', note: 'Two weeks, not two years.' } },
    ],
    why: 'Five of nine criteria for two weeks.',
    pearl: 'Duration separates MDD from PDD.',
    evidence: "t_mood.md 'Diagnosis' — criteria.",
    ...overrides,
  };
}

export function selfTest() {
  const failures = [];
  const check = (name, actual, expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  const judge = (items, extra = {}) => evaluate({ bank: { items }, manifest: FIXTURE_MANIFEST, ...extra });
  const kinds = result => result.problems.map(p => `${p.kind}:${p.id}`);
  const statement = 'A 30-year-old woman has two weeks of low mood. The most likely diagnosis is:';
  const rawEvidence = "mood_teaching.md 'Diagnosis' — criteria.";

  check('a clean draft passes', kinds(judge([fixtureItem()])), []);
  check('a flagged draft fails', kinds(judge([fixtureItem({ stem: statement })])), ['warning:qb_mood_901']);
  check('the flagged code is reported', judge([fixtureItem({ stem: statement })]).problems[0]?.issues?.map(i => i.code), ['stem.lead_in']);
  check('the same text attested is out of scope', kinds(judge([fixtureItem({ stem: statement, status: 'attested' })])), []);
  check('a retired flagged draft is ignored', judge([fixtureItem({ stem: statement, retired: true })]).drafts, 0);
  check('a blocked draft fails', kinds(judge([fixtureItem({ pages: ['t_missing.md'] })])), ['blocked:qb_mood_901']);
  check('a weak lead-in is flagged, never auto-fixable', judge([fixtureItem({ stem: 'Low mood for two weeks. Which of the following is correct?' })]).problems[0]?.fixable, []);
  check('a raw file name in evidence is flagged', judge([fixtureItem({ evidence: rawEvidence })]).problems[0]?.issues?.map(i => i.code), ['evidence.page_mismatch']);

  const entry = { id: 'qb_mood_901', codes: ['stem.lead_in'], reason: 'owner keeps this wording' };
  check('any desktop-only entry breaks the cap of 0', kinds(judge([fixtureItem({ stem: statement })], { desktopOnly: [entry] })), ['cap:bin/qbank_desktop_only.json']);
  check('a matching entry under a raised cap excuses the draft', kinds(judge([fixtureItem({ stem: statement })], { desktopOnly: [entry], cap: 1 })), []);
  check('an entry for a ready draft is stale', kinds(judge([fixtureItem()], { desktopOnly: [entry], cap: 1 })), ['exception:qb_mood_901']);
  check('an entry whose codes no longer match does not excuse', kinds(judge([fixtureItem({ evidence: rawEvidence })], { desktopOnly: [entry], cap: 1 })), ['warning:qb_mood_901']);
  check('an entry for a non-draft is stale', kinds(judge([fixtureItem()], { desktopOnly: [{ ...entry, id: 'qb_mood_999' }], cap: 1 })), ['exception:qb_mood_999']);

  check('fixLeadIn: "The x is:"', fixLeadIn(statement), 'A 30-year-old woman has two weeks of low mood. What is the most likely diagnosis?');
  check('fixLeadIn: "Which ...:"', fixLeadIn('Low mood. Which medication is most appropriate:'), 'Low mood. Which medication is most appropriate?');
  check('fixLeadIn: a vignette sentence is left alone', fixLeadIn('He takes 0.5 mg daily. The ECG is normal.'), null);
  check('fixLeadIn: an open imperative is left alone', fixLeadIn('Low mood. The student should next:'), null);
  check('fixEvidence: file name becomes slug', fixEvidence(rawEvidence, ['t_mood.md'], FIXTURE_MANIFEST), "t_mood.md 'Diagnosis' — criteria.");
  check('fixEvidence: full path becomes slug', fixEvidence("03_Core_Topics/Mood/mood_teaching.md 'Dx'", ['t_mood.md'], FIXTURE_MANIFEST), "t_mood.md 'Dx'");
  check('fixEvidence: ambiguous is left alone', fixEvidence('mood_teaching.md and substance_teaching.md', ['t_mood.md', 't_sud.md'], FIXTURE_MANIFEST), null);
  check('fixEvidence: an unselected page is left alone', fixEvidence('substance_teaching.md', ['t_mood.md'], FIXTURE_MANIFEST), null);

  const planted = { items: [fixtureItem({ stem: statement, evidence: rawEvidence }), fixtureItem({ id: 'qb_mood_902', status: 'attested', stem: 'Mood. The next step is:' })] };
  const { bank: repaired, changes } = applyFixes(planted, FIXTURE_MANIFEST);
  check('--fix repairs both mechanical warnings on the draft', changes.map(c => `${c.id}.${c.field}`), ['qb_mood_901.stem', 'qb_mood_901.evidence']);
  check('--fix leaves the attested item untouched', repaired.items[1], planted.items[1]);
  check('--fix never changes status', repaired.items.map(i => i.status), ['draft', 'attested']);
  check('--fix output passes the gate', kinds(evaluate({ bank: { items: [repaired.items[0]] }, manifest: FIXTURE_MANIFEST })), []);
  return failures;
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--self-test')) {
    const failures = selfTest();
    for (const failure of failures) console.error(`  FAIL ${failure}`);
    console.log(failures.length ? `self-test: ${failures.length} failure(s)` : 'self-test: OK — every planted flagged/blocked draft goes red; --fix stays mechanical and drafts-only');
    return failures.length ? 1 : 0;
  }
  const rootAt = args.indexOf('--root');
  const root = rootAt >= 0 ? path.resolve(args[rootAt + 1] || '.') : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let outcome;
  try {
    outcome = run(root, { fix: args.includes('--fix') });
  } catch (error) {
    console.error(`could not check: ${error.message}`);
    return 2;
  }
  for (const line of outcome.lines) console.log(line);
  return outcome.result.problems.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv);
}
