/* Parsers, the diff and the ratchet behind tests/schedule-consistency.test.mjs. Read that file's
   header first — it states the contract. This module only reads files, except in the documented
   SCHEDULE_DRIFT_WRITE=1 mode, where it rewrites the known-drift fixture and nothing else. */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { contentUniverseSlugs } from '../faculty-console/content-universe.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
export const FIXTURE = 'tests/fixtures/schedule-known-drift.json';
const CURRICULUM = 'curriculum.json';
// The one derived listing of what ships (ADR-002). Never read site_manifest.json here.
const SHIPPED = '13_Faculty_Resources/_automation/site_build/shipped_pages.json';

/* Every week plan other than the Path itself: six surfaces (the six week READMEs are one).
   Where a surface ships, it is located by its MS3 slug through shipped_pages.json rather than by
   a remembered source path; the two that do not ship as pages are named by path. Of the eight
   plans WP-2 names, two are deliberately NOT here:
     - core_readings.md (core_reading_list.md) groups readings by diagnostic class, not by week;
       it has no week→item table to check.
     - docs/superpowers/plans/_AUDIT_AND_ROADMAP.md §6 is the unshipped 2026 planning roadmap
       that proposed the six weeks; nothing a learner sees is built from it.
   Link surfaces are read for their links only; the prose around those links is not parsed (it
   would be noise), which leaves e.g. the reading map's "the BFCRS tool in the sidebar" unchecked.
   Table and FD_PATH_PRACTICE surfaces are prose and go through the theme table. */
export const SURFACES = Object.freeze([
  { id: 'week-readmes', kind: 'readmes' },
  { id: 'six-week-table', kind: 'table', file: '01_Six_Week_Curriculum/README.md', heading: null },
  { id: 'reading-map', kind: 'sections', slug: 'reading_map.md' },
  { id: 'orientation-table', kind: 'table', slug: 'orientation.md',
    heading: 'What Students Should Practice Each Week' },
  { id: 'shelf-table', kind: 'table', slug: 'shelf.md', heading: 'Weekly Exam Integration' },
  { id: 'fd-path-practice', kind: 'fd-practice',
    file: '13_Faculty_Resources/_automation/site_build/frontdoor/fd_path.js' },
]);

const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function read(root, rel) {
  try {
    return readFileSync(path.join(root, rel), 'utf8');
  } catch (err) {
    throw new Error(`cannot read ${rel} (${err.code || err.message})`);
  }
}

// ---- the Path --------------------------------------------------------------------------

/** week number → every ref learningPaths.ms3 lists that week (items + the week's landingRef). */
export function curriculumWeeks(curriculum) {
  const weeksIn = curriculum?.learningPaths?.ms3?.weeks;
  if (!Array.isArray(weeksIn) || !weeksIn.length) {
    throw new Error(`${CURRICULUM}: learningPaths.ms3.weeks is missing or empty`);
  }
  const weeks = new Map();
  for (const w of weeksIn) {
    if (!Number.isInteger(w?.n) || weeks.has(w.n)) {
      throw new Error(`${CURRICULUM}: week number ${JSON.stringify(w?.n)} is missing or repeated`);
    }
    if (!Array.isArray(w.items) || !w.items.length) {
      throw new Error(`${CURRICULUM}: week ${w.n} lists no items`);
    }
    const refs = new Set();
    for (const item of w.items) {
      if (typeof item?.ref !== 'string' || !item.ref) {
        throw new Error(`${CURRICULUM}: week ${w.n} has an item without a ref`);
      }
      refs.add(item.ref);
    }
    if (typeof w.landingRef === 'string' && w.landingRef) refs.add(w.landingRef);
    weeks.set(w.n, refs);
  }
  return weeks;
}

// ---- what ships on the MS3 site ----------------------------------------------------------

/** MS3 slugs via the validating loader (throws on a malformed listing), plus each MS3 page's
    source paths — which that loader does not return — read strictly from the same file. */
export function loadShippedMs3(shipped) {
  contentUniverseSlugs({ shipped }); // validates every entry's slug, kind and sites, or throws
  const ms3 = new Set();
  const slugBySource = new Map();
  const sourceBySlug = new Map();
  for (const page of shipped.pages) {
    if (!page.sites.includes('ms3')) continue;
    const sources = [page.source, ...(page.extraSources ?? [])];
    if (sources.some((s) => typeof s !== 'string' || !s)) {
      throw new Error(`${SHIPPED}: entry ${page.slug} has a missing or malformed source`);
    }
    ms3.add(page.slug);
    sourceBySlug.set(page.slug, page.source);
    for (const src of sources) slugBySource.set(src, page.slug);
  }
  if (!ms3.size) throw new Error(`${SHIPPED}: no page ships on the ms3 site`);
  return { ms3, slugBySource, sourceBySlug };
}

// ---- links → refs -------------------------------------------------------------------------

export function linksIn(markdown) {
  const out = [];
  for (const m of markdown.matchAll(/\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    out.push({ text: m[1], target: m[2] });
  }
  return out;
}

/** `?page=` / `?tool=` → that slug; a relative link → the MS3 page whose source it is; else
    null (external URLs, anchors, and anything that is not an MS3 page are unresolvable). */
export function resolveLink(target, fromFile, shipped) {
  const t = target.trim();
  const q = t.match(/^\?(?:page|tool)=([^&#\s]+)/);
  if (q) {
    const slug = decodeURIComponent(q[1]);
    return shipped.ms3.has(slug) ? slug : null;
  }
  if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(t)) return null;
  const rel = t.split(/[?#]/)[0];
  const src = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), rel));
  return shipped.slugBySource.get(src) ?? null;
}

// ---- prose → themes ------------------------------------------------------------------------

// A "word" may carry letters, digits, and - # * so that "non-medication" is not "medication",
// "osce-style" is its own keyword, and "JC#1" / "STAR*D" stay whole.
const WORD = String.raw`[\p{L}\p{N}#*-]`;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SPLIT = /\s*(?:[,;·+/&()[\]]|\s[—–]\s|\band\b|\bor\b)\s*/i;

export function compileThemes(themes, ms3) {
  if (!isRecord(themes) || !Object.keys(themes).length) {
    throw new Error(`${FIXTURE}: the theme table is missing or empty`);
  }
  const owner = new Map();
  const refsOf = {};
  const matchers = [];
  for (const id of Object.keys(themes).sort()) {
    const { keywords, refs } = isRecord(themes[id]) ? themes[id] : {};
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`theme id "${id}" must be lowercase-kebab`);
    if (!Array.isArray(keywords) || !keywords.length
      || keywords.some((k) => typeof k !== 'string' || !k.trim())) {
      throw new Error(`theme ${id}: keywords must be a non-empty list of strings`);
    }
    if (!Array.isArray(refs) || !refs.length) {
      throw new Error(`theme ${id}: refs must be non-empty`);
    }
    for (const ref of refs) {
      if (!ms3.has(ref)) {
        throw new Error(`theme ${id}: ref ${ref} is not an MS3 page in ${SHIPPED}`);
      }
    }
    refsOf[id] = [...refs];
    for (const raw of keywords) {
      const kw = raw.trim().toLowerCase();
      if (owner.has(kw)) throw new Error(`keyword "${kw}" is in both ${owner.get(kw)} and ${id}`);
      owner.set(kw, id);
      const body = escapeRe(kw).replace(/\s+/g, String.raw`\s+`);
      matchers.push({ kw, id, re: new RegExp(`(?<!${WORD})${body}s?(?!${WORD})`, 'giu') });
    }
  }
  matchers.sort((a, b) => b.kw.length - a.kw.length || cmp(a.kw, b.kw));
  return { matchers, refsOf };
}

/** Split prose into list phrases; each phrase maps to the themes whose keywords it contains
    (longest keyword first, non-overlapping) or, if it contains none, is returned as unmapped. */
export function mapProse(text, compiled) {
  const themes = [];
  const unmapped = [];
  const phrases = text.replace(/\*\*|`/g, '').split(SPLIT).map((s) => s.trim()).filter(Boolean);
  for (const phrase of phrases) {
    const taken = [];
    for (const { id, re } of compiled.matchers) {
      for (const m of phrase.matchAll(re)) {
        const [start, end] = [m.index, m.index + m[0].length];
        if (taken.some((t) => start < t.end && t.start < end)) continue;
        taken.push({ start, end, id });
      }
    }
    if (!taken.length) {
      unmapped.push(phrase);
      continue;
    }
    for (const { id } of taken.sort((a, b) => a.start - b.start)) {
      if (!themes.includes(`theme:${id}`)) themes.push(`theme:${id}`);
    }
  }
  return { themes, unmapped };
}

// ---- surface parsers -----------------------------------------------------------------------

const isRow = (line) => /^\s*\|.*\|\s*$/.test(line);
const cellsOf = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const isRule = (line) => /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line ?? '');

/** The first `| Week | … |` table under `## heading` (before the next heading), or in the whole
    file when heading is null. Throws when there is none: a lost table must never read as empty. */
export function parseWeekTable(md, { heading }) {
  const lines = md.split('\n');
  let start = 0;
  let stop = lines.length;
  if (heading) {
    const title = (l) => l.replace(/^#+\s*/, '').trim();
    start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && title(l) === heading);
    if (start < 0) throw new Error(`no "## ${heading}" heading`);
    const next = lines.findIndex((l, i) => i > start && /^#{1,2}\s/.test(l));
    stop = next < 0 ? lines.length : next;
  }
  let head = -1;
  for (let i = start; i < stop; i++) {
    if (isRow(lines[i]) && cellsOf(lines[i])[0].toLowerCase() === 'week' && isRule(lines[i + 1])) {
      head = i;
      break;
    }
  }
  if (head < 0) throw new Error(`no "| Week |" table${heading ? ` under "## ${heading}"` : ''}`);
  const rows = [];
  for (let i = head + 2; i < lines.length && isRow(lines[i]); i++) {
    const cells = cellsOf(lines[i]);
    if (!/^\d+$/.test(cells[0])) throw new Error(`table row without a week number: ${lines[i]}`);
    rows.push({ week: Number(cells[0]), cells: cells.slice(1) });
  }
  return rows;
}

/** One entry per `## Week N` section; a section ends at the next `#` or `##` heading. */
export function parseWeekSections(md) {
  const sections = [];
  let current = null;
  for (const line of md.split('\n')) {
    const h = line.match(/^##\s+Week\s+(\d+)\b/);
    if (h) {
      current = { week: Number(h[1]), lines: [] };
      sections.push(current);
    } else if (/^#{1,2}\s/.test(line)) {
      current = null;
    } else if (current) {
      current.lines.push(line);
    }
  }
  return sections.map((s) => ({ week: s.week, body: s.lines.join('\n') }));
}

/** FD_PATH_PRACTICE is indexed by week with a null at 0. Only `skill` is read: it is the
    statement of what the week practises; `feedback` is a request phrased around that skill. */
export function parseFdPractice(js) {
  const m = js.match(/\bvar\s+FD_PATH_PRACTICE\s*=\s*(\[[\s\S]*?\n\s*\]);/);
  if (!m) throw new Error('no `var FD_PATH_PRACTICE=[…];` array literal found');
  // Evaluates this repository's own shipped fd_path.js literal, as tests/fd-path.test.mjs does.
  // eslint-disable-next-line no-new-func
  const practice = new Function(`"use strict"; return (${m[1]});`)();
  if (!Array.isArray(practice) || practice[0] !== null) {
    throw new Error('FD_PATH_PRACTICE is not [null, {skill}, …] indexed by week');
  }
  return practice.slice(1).map((p, i) => {
    if (typeof p?.skill !== 'string' || !p.skill.trim()) {
      throw new Error(`FD_PATH_PRACTICE[${i + 1}] has no skill`);
    }
    return { week: i + 1, skill: p.skill };
  });
}

// ---- reading the live surfaces -------------------------------------------------------------

/** A week plan must cover exactly the Path's weeks; a lost row is a parser failure, not a pass. */
function requireEveryWeek(parsed, weeks) {
  const want = [...weeks.keys()].sort((a, b) => a - b).join(',');
  const got = [...new Set(parsed)].sort((a, b) => a - b).join(',');
  if (want !== got) throw new Error(`expected weeks [${want}], parsed [${got}]`);
}

function addLinks(out, markdown, week, file, shipped) {
  for (const { target } of linksIn(markdown)) {
    const ref = resolveLink(target, file, shipped);
    if (ref) out.entries.push({ week, ref, file });
    else out.unmapped.push({ week, text: target, file });
  }
}

function addProse(out, text, week, file, compiled) {
  const { themes, unmapped } = mapProse(text, compiled);
  for (const ref of themes) out.entries.push({ week, ref, file });
  for (const phrase of unmapped) out.unmapped.push({ week, text: phrase, file });
}

/** Read one surface into placements. Every failure names the surface and its file: a surface
    that cannot be read fails the test, it never contributes an empty list. */
export function readSurface(root, spec, ctx) {
  const file = spec.slug ? ctx.shipped.sourceBySlug.get(spec.slug) : spec.file;
  try {
    if (spec.slug && !file) throw new Error(`${spec.slug} does not ship on the ms3 site`);
    return readSurfaceBody(root, spec, file, ctx);
  } catch (err) {
    const where = file ?? spec.slug ?? 'the week READMEs';
    throw new Error(`surface ${spec.id} (${where}): ${err.message}`);
  }
}

function readSurfaceBody(root, spec, file, { weeks, pathWeeks, shipped, compiled }) {
  const out = { id: spec.id, entries: [], unmapped: [] };
  if (spec.kind === 'readmes') {
    // Derived, not remembered: each Path week's landingRef is the README that ships for it.
    for (const w of pathWeeks) {
      const src = shipped.sourceBySlug.get(w.landingRef);
      if (!src) throw new Error(`week ${w.n} landingRef ${w.landingRef} is not an ms3 page`);
      const md = read(root, src);
      if (!new RegExp(`^# Week ${w.n}\\b`).test(md)) {
        throw new Error(`${src} does not open with "# Week ${w.n}"`);
      }
      addLinks(out, md, w.n, src, shipped);
    }
    return out;
  }
  const text = read(root, file);
  if (spec.kind === 'table') {
    const rows = parseWeekTable(text, spec);
    requireEveryWeek(rows.map((r) => r.week), weeks);
    for (const row of rows) {
      for (const cell of row.cells) addProse(out, cell, row.week, file, compiled);
    }
  } else if (spec.kind === 'sections') {
    const sections = parseWeekSections(text);
    requireEveryWeek(sections.map((s) => s.week), weeks);
    for (const s of sections) addLinks(out, s.body, s.week, file, shipped);
  } else if (spec.kind === 'fd-practice') {
    const practice = parseFdPractice(text);
    requireEveryWeek(practice.map((p) => p.week), weeks);
    for (const p of practice) addProse(out, p.skill, p.week, file, compiled);
  } else {
    throw new Error(`unknown surface kind ${spec.kind}`);
  }
  return out;
}

// ---- the diff and the ratchet --------------------------------------------------------------

const pickMismatch = ({ surface, week, ref, file }) => ({ surface, week, ref, file });
const pickUnmapped = ({ surface, week, text, file }) => ({ surface, week, text, file });
const keyOf = (o) => JSON.stringify(Object.values(o));
const byEntry = (a, b) => cmp(a.surface, b.surface) || a.week - b.week
  || cmp(a.ref ?? a.text, b.ref ?? b.text) || cmp(a.file, b.file);
const show = (o) => `${o.surface} · week ${o.week} · ${o.ref ?? JSON.stringify(o.text)}`
  + ` · ${o.file}`;

/** Diff every surface against the Path, then ratchet the result against `known`.
    `problems` is everything that fails the test; `blocking` is the subset that no regenerate
    can clear (vacuity, an undefined theme) and that SCHEDULE_DRIFT_WRITE=1 refuses to write. */
export function evaluate({ weeks, themeRefs, surfaces, known }) {
  const problems = [];
  const blocking = [];
  const block = (p) => { problems.push(p); blocking.push(p); };
  const mismatches = new Map();
  const unmapped = new Map();
  const counts = [];
  for (const s of surfaces) {
    const placements = new Map(s.entries.map((e) => [keyOf([e.week, e.ref, e.file]), e]));
    const loose = new Map(s.unmapped.map((u) => [keyOf([u.week, u.text, u.file]), u]));
    if (placements.size + loose.size === 0) {
      block(`VACUOUS: surface ${s.id} parsed to zero week placements — a parser that finds `
        + 'nothing must never pass');
    }
    let missed = 0;
    for (const e of placements.values()) {
      const listed = weeks.get(e.week) ?? new Set();
      let agrees;
      if (e.ref.startsWith('theme:')) {
        const refs = themeRefs[e.ref.slice('theme:'.length)];
        if (!refs) {
          block(`${e.ref} (surface ${s.id} · week ${e.week}) is not defined in the theme table`);
          continue;
        }
        agrees = refs.some((r) => listed.has(r));
      } else {
        agrees = listed.has(e.ref);
      }
      if (!agrees) {
        const m = pickMismatch({ surface: s.id, ...e });
        mismatches.set(keyOf(m), m);
        missed += 1;
      }
    }
    for (const u of loose.values()) {
      const x = pickUnmapped({ surface: s.id, ...u });
      unmapped.set(keyOf(x), x);
    }
    counts.push({
      id: s.id, placements: placements.size, mismatches: missed, unmapped: loose.size,
    });
  }
  if (!Array.isArray(known?.mismatches) || !Array.isArray(known?.unmapped)) {
    block(`${FIXTURE}: "mismatches" and "unmapped" must both be lists`);
  } else {
    const knownM = new Map(known.mismatches.map((m) => [keyOf(pickMismatch(m)), m]));
    const knownU = new Map(known.unmapped.map((u) => [keyOf(pickUnmapped(u)), u]));
    const gone = 'no longer occurs — drop it';
    for (const [k, m] of mismatches) {
      if (!knownM.has(k)) problems.push(`new mismatch (not in ${FIXTURE}): ${show(m)}`);
    }
    for (const [k, m] of knownM) {
      if (!mismatches.has(k)) problems.push(`stale mismatch (${gone}): ${show(m)}`);
    }
    for (const [k, u] of unmapped) {
      if (!knownU.has(k)) problems.push(`new unmapped text (not in ${FIXTURE}): ${show(u)}`);
    }
    for (const [k, u] of knownU) {
      if (!unmapped.has(k)) problems.push(`stale unmapped entry (${gone}): ${show(u)}`);
    }
  }
  return {
    problems,
    blocking,
    mismatches: [...mismatches.values()].sort(byEntry),
    unmapped: [...unmapped.values()].sort(byEntry),
    counts,
  };
}

// ---- the fixture -----------------------------------------------------------------------------

/** Canonical bytes: one theme and one drift entry per line, everything sorted, trailing newline. */
export function serializeFixture({ _note, _themesNote, themes, mismatches, unmapped }) {
  const themeLines = Object.keys(themes).sort(cmp).map((id) => `    ${JSON.stringify(id)}: `
    + JSON.stringify({
      keywords: [...themes[id].keywords].sort(cmp),
      refs: [...themes[id].refs].sort(cmp),
    }));
  const list = (items, pick) => (items.length
    ? `[\n${items.map(pick).sort(byEntry).map((o) => `    ${JSON.stringify(o)}`).join(',\n')}\n  ]`
    : '[]');
  return '{\n'
    + `  "_note": ${JSON.stringify(_note)},\n`
    + `  "_themesNote": ${JSON.stringify(_themesNote)},\n`
    + `  "themes": {\n${themeLines.join(',\n')}\n  },\n`
    + `  "mismatches": ${list(mismatches, pickMismatch)},\n`
    + `  "unmapped": ${list(unmapped, pickUnmapped)}\n}\n`;
}

/** The live check. With write=true, rewrites the fixture's drift lists from the tree — never
    while a blocking problem stands, so a vacuous parse can not bless itself. */
export function runLive({ root = ROOT, write = false } = {}) {
  const curriculum = JSON.parse(read(root, CURRICULUM));
  const weeks = curriculumWeeks(curriculum);
  const pathWeeks = curriculum.learningPaths.ms3.weeks;
  const shipped = loadShippedMs3(JSON.parse(read(root, SHIPPED)));
  const fixtureText = read(root, FIXTURE);
  const fixture = JSON.parse(fixtureText);
  const compiled = compileThemes(fixture.themes, shipped.ms3);
  const ctx = { weeks, pathWeeks, shipped, compiled };
  const surfaces = SURFACES.map((spec) => readSurface(root, spec, ctx));
  const r = evaluate({ weeks, themeRefs: compiled.refsOf, surfaces, known: fixture });

  const summary = [`schedule vs ${CURRICULUM} learningPaths.ms3 (${weeks.size} weeks):`];
  const n = (v, w = 3) => String(v).padStart(w);
  for (const c of r.counts) {
    summary.push(`  ${c.id.padEnd(18)} ${n(c.placements)} placements · `
      + `${n(c.mismatches)} mismatches · ${n(c.unmapped)} unmapped`);
  }
  summary.push(`  ${'total'.padEnd(18)} ${n(r.mismatches.length, 20)} mismatches · `
    + `${n(r.unmapped.length)} unmapped`);

  if (write) {
    if (r.blocking.length) return { problems: r.blocking, summary };
    const next = serializeFixture({ ...fixture, mismatches: r.mismatches, unmapped: r.unmapped });
    writeFileSync(path.join(root, FIXTURE), next);
    return { problems: [], summary, wrote: FIXTURE };
  }
  const problems = [...r.problems];
  if (fixtureText !== serializeFixture(fixture)) {
    problems.push(`${FIXTURE} is not in canonical form (sorted, one entry per line) — `
      + 'regenerate it');
  }
  return { problems, summary };
}
