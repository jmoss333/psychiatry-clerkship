// Which Scale? — the scale and screening chooser (Phase 1 of
// docs/superpowers/plans/2026-10-31-scale-chooser-plan.md; D1 and D2 approved 2026-11-05).
//
// The chooser is data: one row per clinical question. Every row is checked here against the
// registries the library already gates on, so the chooser cannot drift from what ships:
//
//   1. every surface and related page resolves in shipped_pages.json;
//   2. every rightsId exists in instrument_rights.json, and the row's standing fits the
//      instrument's rights status — a restricted instrument is link-only, a retired one is never
//      shown as practised from the form's own wording;
//   3. a row's official route for a registered instrument equals that registry row's formUrl;
//   4. every evidence pair resolves to an annotation claim whose usedBy lists this tool, and the
//      tool_registry row lists the source;
//   5. a number in a "licenses", "doesNotLicense" or "first" line needs evidence on its row;
//   6. no dose literal, no storage, no text field, no crisis number, no scoring;
//   7. every instrument in instrument_rights.json appears in at least one row.
//
// Trust model: the data block is executed straight out of the tracked html between its
// sentinels, the way tests/cows-series.test.mjs runs its helpers. No live governance state is
// read (reviewed.json and faculty status are never asserted).

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = 'scale-chooser.html';
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const html = read('02_Clinical_Skills/Scale_Chooser/scale-chooser.html');

function data() {
  const m = html.match(/\/\* SCALE_CHOOSER_DATA_BEGIN[\s\S]*?\*\/\n([\s\S]*?)\/\* SCALE_CHOOSER_DATA_END \*\//);
  assert.ok(m, 'data block not found — locate it by its sentinels, not by line');
  // eslint-disable-next-line no-new-func
  return new Function(`${m[1]}\nreturn { STANDING, MOMENTS, ROWS, hrefFor };`)();
}

const { STANDING, MOMENTS, ROWS, hrefFor } = data();
const shipped = new Set(JSON.parse(read('13_Faculty_Resources/_automation/site_build/shipped_pages.json')).pages.map((p) => p.slug));
const rightsRaw = JSON.parse(read('instrument_rights.json'));
const rights = Object.fromEntries((Array.isArray(rightsRaw.instruments) ? rightsRaw.instruments : Object.values(rightsRaw.instruments || rightsRaw)).map((r) => [r.id, r]));
const annotations = JSON.parse(read('evidence_annotations.json')).annotations;
const toolRow = JSON.parse(read('tool_registry.json')).tools.find((t) => t.file === SLUG);

test('the page carries its marker, title, banner and no route out of the rules', () => {
  assert.equal((html.match(/\[CLERKSHIP-META v1\] tool="Which Scale\?"/g) || []).length, 1);
  assert.equal((html.match(/\[CLERKSHIP-META v1\]/g) || []).length, 1);
  assert.match(html, /e\('h1',null,'Which Scale\?'\)/);
  assert.match(html, /Nothing is scored and nothing is saved, and no patient details are entered here\./);
  assert.match(html, /Instruments are named and linked, never reproduced\./);
});

test('rows are well formed: unique ids, known moments and standings, a question each', () => {
  const ids = ROWS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ROWS.length >= 14, 'the v1 inventory has at least fourteen questions');
  const moments = new Set(MOMENTS.map((m) => m.id));
  for (const r of ROWS) {
    assert.ok(moments.has(r.moment), `${r.id}: unknown moment ${r.moment}`);
    assert.ok(STANDING[r.standing], `${r.id}: unknown standing ${r.standing}`);
    assert.ok(r.intent && r.instruments.length, `${r.id}: needs a question and an instrument`);
    assert.ok(r.licenses.length && r.doesNotLicense.length, `${r.id}: both lists are the point of the card`);
    for (const m of MOMENTS) assert.ok(ROWS.some((x) => x.moment === m.id), `moment ${m.id} has no row`);
  }
});

test('invariant 1 — every surface and related page ships', () => {
  for (const r of ROWS) {
    if (r.surface) assert.ok(shipped.has(r.surface), `${r.id}: surface ${r.surface} is not in shipped_pages.json`);
    for (const s of r.related) assert.ok(shipped.has(s), `${r.id}: related ${s} is not in shipped_pages.json`);
    if (['practised-here', 'practised-own-words', 'taught-here', 'not-a-scale'].includes(r.standing)) {
      assert.ok(r.surface, `${r.id}: "${r.standing}" needs a page to practise on`);
    }
    if (r.standing === 'not-yet') assert.equal(r.surface, null, `${r.id}: "not yet in the library" cannot link a practice page`);
  }
  assert.equal(hrefFor('screeners.html'), './screeners.html');
  assert.equal(hrefFor('t_sud.md'), '../index.html?page=t_sud.md');
});

test('invariant 2 — the standing fits the instrument\'s rights status', () => {
  const allowed = {
    retired: ['practised-own-words', 'taught-here', 'route-only'],
    restricted: ['route-only'],
    provisional: ['practised-here', 'practised-own-words', 'taught-here', 'route-only'],
  };
  for (const r of ROWS) {
    for (const i of r.instruments) {
      if (!i.rightsId) continue;
      const entry = rights[i.rightsId];
      assert.ok(entry, `${r.id}: rightsId ${i.rightsId} is not in instrument_rights.json`);
      const ok = allowed[entry.status] || [];
      assert.ok(ok.includes(r.standing), `${r.id}: ${i.rightsId} is ${entry.status}; "${r.standing}" is not allowed`);
    }
  }
});

test('invariant 3 — a registered instrument routes exactly where the rights registry says', () => {
  for (const r of ROWS) {
    for (const i of r.instruments) {
      if (i.rightsId) assert.equal(i.officialUrl, rights[i.rightsId].officialSource.formUrl, `${r.id}: ${i.name} route drifted from instrument_rights.json`);
      if (i.officialUrl) assert.match(i.officialUrl, /^https:\/\//, `${r.id}: official routes are https`);
    }
  }
});

test('invariant 4 — every citation resolves, lists this tool, and is registered', () => {
  for (const r of ROWS) {
    for (const ev of r.evidence) {
      const row = annotations.find((a) => a.sourceId === ev.sourceId);
      assert.ok(row, `${r.id}: no annotation row for ${ev.sourceId}`);
      const claim = row.claims.find((c) => c.claimId === ev.claimId);
      assert.ok(claim, `${r.id}: claim ${ev.claimId} not in ${ev.sourceId}`);
      assert.ok(claim.usedBy.includes(SLUG), `${r.id}: ${ev.claimId} usedBy must list ${SLUG}`);
      assert.ok(toolRow.evidenceIds.includes(ev.sourceId), `${r.id}: tool_registry evidenceIds must list ${ev.sourceId}`);
      assert.ok(ev.cite.includes(`PMID ${row.verifiedAgainst.pmid}`), `${r.id}: the cite must carry PMID ${row.verifiedAgainst.pmid}`);
    }
  }
  const cited = new Set(ROWS.flatMap((r) => r.evidence.map((x) => x.sourceId)));
  assert.deepEqual([...toolRow.evidenceIds].sort(), [...cited].sort(), 'registry evidenceIds are exactly the cited sources');
});

test('invariant 4, in words — the cited lines say what the annotated claims say', () => {
  const phq = ROWS.find((r) => r.id === 'phq-screen');
  assert.match(phq.licenses[0], /10 or more had a sensitivity of 88% and a specificity of 88% for major depression/);
  const cows = ROWS.find((r) => r.id === 'opioid-withdrawal');
  assert.match(cows.licenses[0], /COWS ≥8 with 1 objective sign of opioid withdrawal/);
  assert.match(cows.licenses[0], /Teaching, not an order/);
  const trend = ROWS.find((r) => r.id === 'depression-trend');
  assert.match(trend.licenses[0], /minimal clinically important difference for individual change was 5 points on the 0 to 27 point scale/);
});

test('invariant 5 — a number in a teaching line needs evidence on its row', () => {
  for (const r of ROWS) {
    const lines = [...r.licenses, ...r.doesNotLicense, ...(r.first ? [r.first] : [])];
    for (const l of lines) {
      if (/\d/.test(l.replace(/PHQ-9|GAD-7|3D-CAM|AUDIT-C|CAM-ICU|4AT|item 9/g, ''))) {
        assert.ok(r.evidence.length, `${r.id}: "${l}" carries a number with no evidence entry`);
      }
    }
  }
});

test('invariant 6 — no dose, no storage, no text field, no crisis number, nothing scored', () => {
  assert.doesNotMatch(html, /\b\d+(?:\.\d+)?\s?(?:mg|mcg|mL|mg\/kg)\b/i, 'check-static-site §5 dose regex');
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(html, /<textarea|<input\b|contentEditable|e\(\s*['"](?:input|textarea)['"]/i);
  assert.doesNotMatch(html, /\b988\b|crisis-block/);
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, [
    'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  ]);
  assert.doesNotMatch(html, /\.reduce\(|total\s*[+=]|score\s*[:=]/, 'the chooser sums and scores nothing');
  assert.doesNotMatch(html, /name="cw-frame"/);
  assert.deepEqual(toolRow.storageKeys, []);
});

test('invariant 7 — every registered instrument has a row', () => {
  const covered = new Set(ROWS.flatMap((r) => r.instruments.map((i) => i.rightsId)).filter(Boolean));
  for (const id of Object.keys(rights)) assert.ok(covered.has(id), `instrument_rights.json ${id} has no chooser row`);
});

test('the tool is registered once, on both sites, as a pending clinical-skills tool', () => {
  assert.equal(toolRow.sourcePath, '02_Clinical_Skills/Scale_Chooser/scale-chooser.html');
  assert.equal(toolRow.category, 'clinical-skills');
  const manifest = read('13_Faculty_Resources/_automation/site_build/site_manifest.json');
  assert.equal((manifest.match(/"scale-chooser\.html"/g) || []).length, 1);
  assert.match(read('13_Faculty_Resources/_automation/site_build/build_deploy.py'), /_tool\("scale-chooser\.html","Which Scale\?"\)/);
  assert.match(read('13_Faculty_Resources/_automation/site_build/resident_section.py'), /\{"t":"Which Scale\?","f":"scale-chooser\.html","k":"tool"\}/);
  assert.ok(shipped.has(SLUG));
});
