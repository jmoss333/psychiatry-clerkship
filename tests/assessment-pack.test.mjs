/* WP-3 — the workplace-assessment faculty pack (13_Faculty_Resources/Assessment/, decision D5).

   Ten non-shipped faculty files: the clerkship objectives (OBJ-01…), the LCME 6.2 required
   encounters, the mid-clerkship feedback form, four direct-observation cards (DO-1…DO-4), a
   preceptor guide, the Sim-to-Ward encounter card, and a README. Nothing here ships to a learner
   site, so no build gate reads these files; this test is the only thing that holds them together.

   What it pins, and why each one matters:
   - The pack is complete, and no file name trips the build's orphaned-source scan
     (check-static-site.mjs §7 scans *_inpatient(_teaching).md and *_pocket_(guide|card).md).
   - Objective ids are the stable contract WP-13 pages will cite: well formed, unique, 12–18 of
     them, every one assessed by a DO card or the midpoint form, and no id cited that is not
     defined. Foundational Competency references use the official "<Competency> <n>" form and
     stay inside each competency's real range, so a mapping cannot cite a subcompetency that does
     not exist.
   - A DO card's **Objectives:** line is its contract, and the objectives file's "where each
     objective is assessed" matrix must agree with it in both directions.
   - The EPAs the review found never assessed (5, 8, 9, 13) are each covered by an objective AND
     a direct-observation card.
   - No file carries a patient-identifier field token; every rating card states the boundary set
     by feedback.html (it feeds the school's official evaluation and is not itself the grade),
     and every overall rating offers the pack's four levels verbatim and in order.
   - DO-3 quotes oral.html's five self-check labels verbatim, read from the tool's own source, so
     a student's self-check and the preceptor's rating stay comparable when either one changes.
   - The encounter card's coverage-item crosswalk names real Interview Room checklist ids and
     covers every checklist item of each case it lists.

   No assertion reads live governance state (G12): the listing of what ships comes from the
   derived shipped_pages.json through deriveContentUniverse(), never from reviewed.json. */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { deriveContentUniverse } from '../faculty-console/content-universe.mjs';

const repo = path.resolve(import.meta.dirname, '..');
const DIR = path.join(repo, '13_Faculty_Resources', 'Assessment');
const SHIPPED = path.join(
  repo, '13_Faculty_Resources', '_automation', 'site_build', 'shipped_pages.json');
const SP_PACK = path.join(repo, '_prototypes', 'sp-interview', 'sp-interview.pack.json');

const PACK = Object.freeze([
  'README.md',
  'clerkship_objectives.md',
  'required_encounters.md',
  'mid_clerkship_feedback.md',
  'DO-1_interview_mse.md',
  'DO-2_admission_note.md',
  'DO-3_oral_presentation.md',
  'DO-4_team_family_communication.md',
  'preceptor_guide.md',
  'encounter_card.md',
]);
const DO_CARDS = PACK.filter(name => /^DO-\d_/.test(name));
const MIDPOINT = 'mid_clerkship_feedback.md';
// Every file on which someone records a rating about a student.
const RATING_CARDS = [...DO_CARDS, MIDPOINT, 'encounter_card.md'];
const SCALE = Object.freeze([
  'needs direct supervision',
  'needs prompting',
  'needs occasional checking',
  'ready for indirect supervision',
]);
const RESPONSIBILITY = new Set(['observe', 'participate', 'perform under direct supervision']);
const RESPONSIBILITY_HEADER = 'Minimum responsibility (proposed — Josh to confirm)';
const NEVER_ASSESSED_EPAS = Object.freeze([5, 8, 9, 13]);
// The number of subcompetencies in each 2024 Foundational Competency, DO-specific items
// included (frameworks research, AAMC/AACOM/ACGME 2024 report, accessed 2026-09-24).
const FC_MAX = Object.freeze({
  'Professionalism': 11,
  'Patient Care': 13,
  'Medical Knowledge': 6,
  'Practice-Based Learning and Improvement': 5,
  'Interpersonal and Communication Skills': 6,
  'Systems-Based Practice': 8,
});
const OBJ_ID = /\bOBJ-\d{2}\b/g;

const read = name => readFileSync(path.join(DIR, name), 'utf8');

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
}

/* Every markdown table in `md` whose header satisfies `pick`, as { header, rows }. A table is
   a header row, a |---| separator, then contiguous | rows. */
function tables(md, pick) {
  const lines = md.split('\n');
  const found = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].trim().startsWith('|') || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) continue;
    const header = splitRow(lines[i]);
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].trim().startsWith('|'); j++) rows.push(splitRow(lines[j]));
    if (pick(header)) found.push({ header, rows });
    i = j - 1;
  }
  return found;
}

function onlyTable(md, pick, what) {
  const found = tables(md, pick);
  assert.equal(found.length, 1, `expected exactly one ${what} table, found ${found.length}`);
  return found[0];
}

const stripMarks = cell => cell.replace(/[*`]/g, '').trim();

function objectivesTable() {
  return onlyTable(
    read('clerkship_objectives.md'),
    header => header[0] === 'ID' && header.includes('Core EPA'),
    'objectives',
  );
}

function definedObjectives() {
  return objectivesTable().rows.map(row => stripMarks(row[0]));
}

function epaNumbers(text) {
  return new Set([...text.matchAll(/\bEPA (\d{1,2})\b/g)].map(m => Number(m[1])));
}

function epaLine(md) {
  const line = md.split('\n').find(l => l.startsWith('**EPA:**'));
  return line || '';
}

/* A DO card's declared objectives: the ids on its **Objectives:** line. That line is the card's
   contract; an id mentioned only in a note does not make the card assess it. */
function declaredObjectives(md) {
  const line = md.split('\n').find(l => l.startsWith('**Objectives:**')) || '';
  return new Set([...line.matchAll(OBJ_ID)].map(m => m[0]));
}

/* The paragraph that starts with **Overall, joined across its wrapped lines. */
function overallParagraph(md) {
  const lines = md.split('\n');
  const start = lines.findIndex(l => l.startsWith('**Overall'));
  if (start < 0) return '';
  const para = [];
  for (let i = start; i < lines.length && lines[i].trim(); i++) para.push(lines[i].trim());
  return para.join(' ').toLowerCase();
}

function assertInOrder(text, labels, where) {
  let from = -1;
  for (const label of labels) {
    const at = text.indexOf(label, from + 1);
    assert.ok(at > from, `${where}: scale level "${label}" missing or out of order`);
    from = at;
  }
}

test('the pack is the ten expected files, each with real content', () => {
  assert.equal(PACK.length, 10);
  assert.equal(DO_CARDS.length, 4, 'vacuity guard: four direct-observation cards');
  for (const name of PACK) {
    const file = path.join(DIR, name);
    assert.ok(existsSync(file), `missing ${path.relative(repo, file)}`);
    assert.ok(read(name).trim().length > 400, `${name} is empty or a stub`);
  }
});

test('no pack file name trips the build orphaned-source scan', () => {
  const contentPage = [/_inpatient(?:_teaching)?\.md$/, /_pocket_(?:guide|card)\.md$/];
  const names = readdirSync(DIR).filter(name => name.endsWith('.md'));
  assert.ok(names.length >= PACK.length, 'vacuity guard: the directory was read');
  for (const name of names) {
    assert.ok(!contentPage.some(rx => rx.test(name)),
      `${name} matches a learner-content naming convention; rename it (WP-3 location rule)`);
  }
});

test('each direct-observation card names its Core EPA and cites at least one objective', () => {
  for (const name of DO_CARDS) {
    const md = read(name);
    assert.match(epaLine(md), /^\*\*EPA:\*\*\s*Core EPA \d{1,2}\b/, `${name}: no **EPA:** line`);
    assert.ok(declaredObjectives(md).size >= 1, `${name}: no **Objectives:** line with an OBJ- id`);
  }
});

test('no pack file carries a patient-identifier field token', () => {
  const forbidden = [/\bMRN\b/i, /\bDOB\b/i, /patient name/i, /date of birth/i];
  for (const name of PACK) {
    const md = read(name);
    for (const rx of forbidden) assert.doesNotMatch(md, rx, `${name} contains ${rx}`);
  }
});

test('every rating card states the official-evaluation boundary', () => {
  for (const name of RATING_CARDS) {
    const md = read(name);
    assert.match(md, /feeds your school's official evaluation/i, `${name}: boundary missing`);
    assert.match(md, /not itself the grade/i, `${name}: "not itself the grade" missing`);
    assert.match(md, /patient initials: not recorded/i, `${name}: identifier rule missing`);
  }
});

test('the four-level scale appears verbatim, in order, wherever a rating is recorded', () => {
  for (const name of DO_CARDS) {
    assertInOrder(overallParagraph(read(name)), SCALE, `${name} overall rating`);
  }
  assertInOrder(read(MIDPOINT).toLowerCase(), SCALE, MIDPOINT);
  assertInOrder(read('encounter_card.md').toLowerCase(), SCALE, 'encounter_card.md');
});

test('every required encounter names a simulated alternative and a proposed responsibility', () => {
  const { header, rows } = onlyTable(
    read('required_encounters.md'),
    h => h.some(cell => /^Simulated alternative/.test(cell)),
    'required-encounters',
  );
  const alt = header.findIndex(cell => /^Simulated alternative/.test(cell));
  const resp = header.indexOf(RESPONSIBILITY_HEADER);
  assert.ok(resp >= 0, `no column headed "${RESPONSIBILITY_HEADER}"`);
  assert.equal(rows.length, 9, 'the review §7 list has nine encounter types');
  for (const row of rows) {
    const cell = stripMarks(row[alt] || '');
    assert.ok(cell.length > 3 && !/^(—|-|none|tbd|n\/a)$/i.test(cell),
      `encounter "${row[1]}" names no simulated alternative`);
    assert.ok(RESPONSIBILITY.has(stripMarks(row[resp] || '')),
      `encounter "${row[1]}" responsibility "${row[resp]}" is not observe / participate / `
      + 'perform under direct supervision');
  }
});

test('objective ids are well formed, unique, and 12–18 in number', () => {
  const ids = definedObjectives();
  assert.ok(ids.length >= 12 && ids.length <= 18,
    `expected 12–18 objectives, found ${ids.length}`);
  for (const id of ids) assert.match(id, /^OBJ-\d{2}$/, `malformed objective id "${id}"`);
  assert.equal(new Set(ids).size, ids.length, 'duplicate objective id');
});

test('every objective is mapped to Core EPAs and official Foundational Competency ids', () => {
  const { header, rows } = objectivesTable();
  const epa = header.indexOf('Core EPA');
  const fc = header.indexOf('Foundational Competencies');
  assert.ok(epa >= 0 && fc >= 0,
    'objectives table lacks the Core EPA / Foundational Competencies columns');
  const pattern = new RegExp(`^(${Object.keys(FC_MAX).join('|')}) (\\d{1,2})$`);
  for (const row of rows) {
    for (const n of (row[epa].match(/\d+/g) || []).map(Number)) {
      assert.ok(n >= 1 && n <= 13, `${row[0]}: Core EPA ${n} does not exist`);
    }
    const cell = stripMarks(row[fc]);
    if (cell === 'FC: to map') continue;
    const refs = cell.split(';').map(s => s.trim()).filter(Boolean);
    assert.ok(refs.length >= 1, `${row[0]}: no Foundational Competency reference`);
    for (const ref of refs) {
      const m = ref.match(pattern);
      assert.ok(m, `${row[0]}: "${ref}" is not in the official "<Competency> <n>" form`);
      assert.ok(Number(m[2]) >= 1 && Number(m[2]) <= FC_MAX[m[1]],
        `${row[0]}: ${ref} is outside ${m[1]} 1–${FC_MAX[m[1]]}`);
    }
  }
});

test('every defined objective is assessed by a DO card or the midpoint form', () => {
  const assessed = new Set();
  for (const name of DO_CARDS) for (const id of declaredObjectives(read(name))) assessed.add(id);
  for (const m of read(MIDPOINT).matchAll(OBJ_ID)) assessed.add(m[0]);
  for (const id of definedObjectives()) {
    assert.ok(assessed.has(id), `${id} is not assessed anywhere`);
  }
});

test('the objectives file assessment matrix agrees with what each DO card cites', () => {
  const { header, rows } = onlyTable(read('clerkship_objectives.md'),
    h => h[0] === 'ID' && h.some(cell => /^DO-1\b/.test(cell)), 'assessment matrix');
  assert.deepEqual(rows.map(row => stripMarks(row[0])), definedObjectives(),
    'the matrix lists every objective, in order');
  for (const name of DO_CARDS) {
    const tag = name.slice(0, 4);
    const col = header.findIndex(cell => cell.startsWith(tag));
    assert.ok(col >= 0, `the matrix has no ${tag} column`);
    const placed = rows.filter(row => !/^(—|-)?$/.test(stripMarks(row[col] || '')))
      .map(row => stripMarks(row[0]));
    const md = read(name);
    const declared = declaredObjectives(md);
    assert.deepEqual(placed.sort(), [...declared].sort(), `${tag}: matrix and card disagree`);
    for (const m of md.matchAll(OBJ_ID)) {
      assert.ok(declared.has(m[0]), `${tag} mentions ${m[0]} but does not declare it`);
    }
  }
});

test('no objective id is cited that the objectives file does not define', () => {
  const defined = new Set(definedObjectives());
  let cited = 0;
  for (const name of PACK) {
    for (const m of read(name).matchAll(OBJ_ID)) {
      cited++;
      assert.ok(defined.has(m[0]), `${name} cites undefined ${m[0]}`);
    }
  }
  assert.ok(cited > definedObjectives().length, 'vacuity guard: ids are cited across the pack');
});

test('the midpoint self-rating lists every objective exactly once', () => {
  const { rows } = onlyTable(read(MIDPOINT),
    h => h[0] === 'ID' && h.some(c => /self-rating/i.test(c)), 'midpoint self-rating');
  const listed = rows.map(row => stripMarks(row[0]));
  assert.deepEqual([...listed].sort(), [...definedObjectives()].sort());
});

test('the midpoint form has the five handoff sections at the end of Week 3', () => {
  const md = read(MIDPOINT);
  const sections = [...md.matchAll(/^## (\d)\. /gm)].map(m => Number(m[1]));
  assert.deepEqual(sections, [1, 2, 3, 4, 5]);
  assert.match(md, /end of Week 3/i);
  const lcme97 = 'Formal feedback occurs at least at the midpoint of the course or clerkship.';
  assert.ok(md.includes(lcme97),
    'LCME 9.7 midpoint sentence missing (verbatim, 2026–27 F&S)');
});

test('the never-assessed EPAs are each covered by an objective and a DO card', () => {
  const { header, rows } = objectivesTable();
  const epa = header.indexOf('Core EPA');
  const byObjective = new Set(rows.flatMap(row => (row[epa].match(/\d+/g) || []).map(Number)));
  const byCard = new Set(DO_CARDS.flatMap(name => [...epaNumbers(epaLine(read(name)))]));
  for (const n of [1, 6, ...NEVER_ASSESSED_EPAS]) {
    assert.ok(byObjective.has(n), `no objective maps to Core EPA ${n}`);
    assert.ok(byCard.has(n), `no DO card's EPA line names Core EPA ${n}`);
  }
});

test('DO-3 quotes the five oral.html self-check labels verbatim', () => {
  const shipped = JSON.parse(readFileSync(SHIPPED, 'utf8'));
  const oral = shipped.pages.find(page => page.slug === 'oral.html');
  assert.ok(oral, 'oral.html is not in shipped_pages.json');
  const source = readFileSync(path.join(repo, oral.source), 'utf8');
  const block = source.match(/var RUBRIC_ITEMS=\[([\s\S]*?)\];/);
  assert.ok(block, 'RUBRIC_ITEMS not found in the oral.html source');
  const labels = [...block[1].matchAll(/label:'([^']+)'/g)].map(m => m[1]);
  assert.equal(labels.length, 5, 'oral.html no longer has five self-check items; realign DO-3');
  const card = read('DO-3_oral_presentation.md');
  for (const label of labels) {
    assert.ok(card.includes(`"${label}"`), `DO-3 does not quote the oral.html item "${label}"`);
  }
});

test('Core refs in the objectives ship on the MS3 site or are marked planned', () => {
  const shipped = JSON.parse(readFileSync(SHIPPED, 'utf8'));
  const ms3 = new Set(deriveContentUniverse({ shipped })
    .filter(item => item.sites.includes('ms3')).map(item => item.slug));
  const { header, rows } = objectivesTable();
  const refs = header.indexOf('Core refs');
  assert.ok(refs >= 0, 'objectives table lacks a Core refs column');
  let checked = 0;
  for (const row of rows) {
    for (const m of row[refs].matchAll(/`([a-z0-9_.-]+\.(?:md|html))`( \(planned: WP-\d+\))?/g)) {
      checked++;
      if (m[2]) continue;
      assert.ok(ms3.has(m[1]),
        `${row[0]}: Core ref ${m[1]} does not ship on MS3 (mark it planned?)`);
    }
  }
  assert.ok(checked >= 20, `vacuity guard: only ${checked} Core refs were checked`);
});

test('relative links inside the pack resolve, including the supervision guide', () => {
  let checked = 0;
  for (const name of PACK) {
    for (const m of read(name).matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:|#|\?)/.test(target)) continue;
      checked++;
      const resolved = path.resolve(DIR, target.split('#')[0]);
      assert.ok(existsSync(resolved), `${name}: broken relative link ${target}`);
    }
  }
  assert.ok(checked >= 10, `vacuity guard: only ${checked} relative links were checked`);
  const supervision = '](../../14_Tracks/Resident/supervision_teaching.md)';
  assert.ok(read('preceptor_guide.md').includes(supervision),
    'the preceptor guide must link the resident supervision page, not duplicate it');
});

test('the Sim-to-Ward crosswalk names real Interview Room checklist items, all of them', () => {
  const pack = JSON.parse(readFileSync(SP_PACK, 'utf8'));
  const checklist = new Map(pack.cases.map(c => [c.id, new Set(c.checklist.map(item => item.id))]));
  const { header, rows } = onlyTable(read('encounter_card.md'), h => /^DO-1 row/.test(h[0]),
    'Sim-to-Ward crosswalk');
  const caseColumns = header.map(cell => (cell.match(/`(sp_[a-z0-9_]+)`/) || [])[1]);
  const cases = caseColumns.filter(Boolean);
  assert.ok(cases.length >= 3, 'vacuity guard: the crosswalk lists the three Interview Room cases');
  const mapped = new Map(cases.map(id => [id, new Set()]));
  for (const row of rows) {
    caseColumns.forEach((caseId, col) => {
      if (!caseId) return;
      assert.ok(checklist.has(caseId), `crosswalk names unknown case ${caseId}`);
      for (const m of (row[col] || '').matchAll(/`(c_[a-z0-9_]+)`/g)) {
        assert.ok(checklist.get(caseId).has(m[1]), `${caseId} has no checklist item ${m[1]}`);
        mapped.get(caseId).add(m[1]);
      }
    });
  }
  for (const [caseId, items] of mapped) {
    for (const item of checklist.get(caseId)) {
      assert.ok(items.has(item), `crosswalk omits ${caseId} checklist item ${item}`);
    }
  }
});
