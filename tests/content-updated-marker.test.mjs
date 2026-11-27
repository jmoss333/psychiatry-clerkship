// The author's "this page changed in a way a reader should come back for" marker,
//   <!-- content-updated: YYYY-MM-DD -->
// read by the learner reader's one-time "updated since you last opened it" notice
// (frontdoor/fd_page_changed.js). The reader ignores a marker it cannot parse, so a misspelt key or
// an impossible date would make a correction silent. This test makes that a PR-time failure: on every
// shipped reading source, any comment that looks like the marker must BE the marker, there is at most
// one, and the reader's own parser reads the same date this test does.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const SITE = new URL('13_Faculty_Resources/_automation/site_build/', ROOT);
const shipped = JSON.parse(readFileSync(new URL('shipped_pages.json', SITE), 'utf8')).pages;
const fdSrc = readFileSync(new URL('frontdoor/fd_page_changed.js', SITE), 'utf8');
// eslint-disable-next-line no-new-func
const { fdPageContentVersion } = new Function(`${fdSrc}\nreturn {fdPageContentVersion};`)();

// Anything an author might type when reaching for the marker: content-updated, content_updated,
// content updated, contentupdate, content-update, updated-content ...
const LOOKALIKE = /<!--\s*(?:content[\s_-]*update[ds]?|updated?[\s_-]*content)\b[^>]*-->/gi;
const STRICT = /^<!--\s*content-updated:\s*(\d{4}-\d{2}-\d{2})\s*-->$/i;

function realDay(day) {
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

const SOURCES = [...new Set(shipped.flatMap((p) => [p.source, ...(p.extraSources || [])])
  .filter((s) => s && s.endsWith('.md')))].sort();

test('the sweep sees the shipped readings (guards against a silently empty sweep)', () => {
  assert.ok(SOURCES.length >= 100, `only ${SOURCES.length} shipped markdown sources`);
});

test('every content-updated marker on a shipped reading is well-formed, real-dated and single', () => {
  for (const rel of SOURCES) {
    const file = new URL(rel, ROOT);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const found = [...text.matchAll(LOOKALIKE)].map((m) => m[0]);
    assert.ok(found.length <= 1, `${rel}: ${found.length} content-updated markers; keep one, set to the latest update`);
    if (!found.length) {
      assert.equal(fdPageContentVersion(text), '', `${rel}: the reader found a marker this sweep did not`);
      continue;
    }
    const m = STRICT.exec(found[0]);
    assert.ok(m, `${rel}: "${found[0]}" is not <!-- content-updated: YYYY-MM-DD -->, so the reader would ignore it`);
    assert.ok(realDay(m[1]), `${rel}: ${m[1]} is not a calendar date`);
    assert.equal(fdPageContentVersion(text), m[1], `${rel}: the reader reads a different date`);
  }
});

test('the sweep would catch the mistakes it exists for', () => {
  const check = (text) => {
    const found = [...text.matchAll(LOOKALIKE)].map((m) => m[0]);
    if (found.length > 1) return 'many';
    if (!found.length) return 'none';
    const m = STRICT.exec(found[0]);
    return m && realDay(m[1]) ? m[1] : 'bad';
  };
  assert.equal(check('# T\n<!-- content-updated: 2026-11-24 -->\n'), '2026-11-24');
  assert.equal(check('# T\n<!-- content_updated: 2026-11-24 -->\n'), 'bad');
  assert.equal(check('# T\n<!-- content-update: 2026-11-24 -->\n'), 'bad');
  assert.equal(check('# T\n<!-- content-updated: 2026-11-31 -->\n'), 'bad');
  assert.equal(check('# T\n<!-- content-updated: Nov 24 -->\n'), 'bad');
  assert.equal(check('<!-- content-updated: 2026-11-01 -->\n<!-- content-updated: 2026-11-24 -->'), 'many');
  assert.equal(check('# T\n<!-- crisis-block -->\n'), 'none');
});
