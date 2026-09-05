/* Snapshot contracts for the pinned "On the Unit Practice and Tools" panel.
 *
 * WHAT RUNS WHERE, and why it is split. The byte-comparison — "did any panel change?" — needs a
 * build, so it runs from build_and_check.sh AFTER build_deploy.py (see bin/render_panels.mjs).
 * Everything in THIS file reads only committed files, so it runs on a fresh clone in CI, where
 * _build/ does not exist. Putting the comparison here instead would either skip in CI or wedge
 * the build that repairs it (CLAUDE.md, T17).
 *
 * WHAT THIS PINS, that tests/practice-panel.test.mjs does not: that file asserts PROPERTIES of a
 * rendered panel. This asserts properties of the stored corpus — that it is complete against what
 * ships, that it contains real panels, and that its storage format can hide nothing.
 *
 * THE FRICTION IS THE FEATURE. An intended change to the panel requires regenerating these
 * snapshots, and the resulting diff of tests/__panels__/ is the learner-visible delta, page by
 * page. Reviewing that diff is the point; committing it is how the change gets evidenced. Do not
 * relax these tests to avoid regenerating — regenerate.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  AUDIENCES, TOPIC_META, formatPanel, shippedPanelRefs, snapshotDir, snapshotName, unformatPanel,
} from './_panel_render.mjs';

const REGEN = 'rebuild, then run `node bin/render_panels.mjs --write` and commit the diff';
const dirOf = (site) => fileURLToPath(snapshotDir(site));
const filesOf = (site) => readdirSync(dirOf(site)).filter((f) => f.endsWith('.html')).sort();

test('both audiences have a populated snapshot directory', () => {
  for (const site of AUDIENCES) {
    assert.ok(existsSync(dirOf(site)), `tests/__panels__/${site}/ is missing — ${REGEN}`);
    assert.ok(filesOf(site).length > 0, `tests/__panels__/${site}/ is empty — ${REGEN}`);
  }
});

test('every shipped page that renders a panel has a snapshot, and nothing else does', () => {
  // The set difference, not a count. #539 pinned {cotw_registry: 22, site_manifest: 1}; those
  // numbers move for several unrelated reasons and invite being bumped. A named set does not.
  for (const site of AUDIENCES) {
    const stored = new Set(filesOf(site));
    const shipped = [...shippedPanelRefs(site)].sort();

    const missing = shipped.filter((ref) => !stored.has(snapshotName(ref)));
    assert.deepEqual(missing, ['rapid_review.md'],
      `${site}: the set of shipped pages with no snapshot changed.\n`
      + '  rapid_review.md is expected here and only here: it has no topic_meta entry, so it\n'
      + '  renders no panel. Anything else means a page that ships lost or gained a panel, or a\n'
      + `  new page-producing route appeared — snapshot it (${REGEN}) or record why not.`);

    const shippedFiles = new Set(shipped.map(snapshotName));
    const extra = [...stored].filter((f) => !shippedFiles.has(f)).sort();
    assert.deepEqual(extra, [],
      `${site}: snapshots for pages that site does not publish — ${REGEN}`);
  }
});

test('the one uncovered page is uncovered because it has no metadata at all', () => {
  // Guards the exemption above from decaying into a permanent excuse. If rapid_review.md ever
  // gains a topic_meta entry it can render a panel, and it needs a snapshot like everything else.
  assert.ok(!TOPIC_META['rapid_review.md'],
    'rapid_review.md now has a topic_meta entry — it may render a panel and needs snapshotting');
});

test('the stored snapshots are real panels, not an empty render agreeing with an empty file', () => {
  // The failure this guards is the one that made a WP-B assertion vacuous on #480: a check that
  // passes because both sides are empty proves nothing. A snapshot must actually contain a panel.
  for (const site of AUDIENCES) {
    for (const file of filesOf(site)) {
      const got = readFileSync(path.join(dirOf(site), file), 'utf8');
      assert.match(got, /<details class="topic-tpl practice-panel">/, `${site}/${file}: not a panel`);
      assert.match(got, /<span class="practice-title">On the Unit Practice and Tools<\/span>/,
        `${site}/${file}: has lost the panel title`);
      assert.ok(got.length > 200, `${site}/${file}: implausibly short (${got.length} bytes)`);
    }
  }
});

/* THE STORAGE FORMAT MUST NOT BE ABLE TO HIDE A RENDER CHANGE. formatPanel breaks between
 * adjacent tags so the diff is readable; the post-build gate applies it to the fresh render and
 * compares against a stored snapshot that had it applied too. So any step formatPanel took
 * BEYOND inserting newlines would be applied to both sides and cancel out — real drift would
 * pass the gate silently. The property to pin is therefore exact: formatPanel inserts a newline
 * between every adjacent `><` pair, adds the trailing newline, and does nothing else.
 *
 * Three facts pin that, and none of them recomputes the transform — a check that re-ran the same
 * substitution would agree with any implementation, including a wrong one:
 *   1. INSERTION-ONLY — deleting every newline from the output returns the input byte for byte.
 *   2. PLACEMENT      — the only newline not sitting between a `>` and a `<` is the final one.
 *   3. COMPLETENESS   — there is exactly one newline per `><` pair, plus that final one.
 * (1) forbids rewriting or dropping any byte; (2) and (3) fix where the newlines go and how many
 * there are. Nothing is left free.
 */
const assertInsertionOnly = (raw, label) => {
  const out = formatPanel(raw);
  assert.equal(out.split('\n').join(''), raw,
    `${label}: formatPanel changed bytes other than the newlines it adds. Such a step would be `
    + 'applied to the fresh render and the stored snapshot alike, so it would hide real drift');
  assert.equal(out.slice(-1), '\n',
    `${label}: formatPanel did not end the snapshot with a newline`);
  const breaks = [];
  for (let i = out.indexOf('\n'); i !== -1; i = out.indexOf('\n', i + 1)) breaks.push(i);
  const misplaced = breaks.slice(0, -1).filter((i) => out[i - 1] !== '>' || out[i + 1] !== '<');
  assert.deepEqual(misplaced, [],
    `${label}: newline inserted somewhere other than between an adjacent > and <`);
  // `><` cannot overlap itself, so split() counts it exactly: n pairs -> n + 1 pieces, and the
  // expected newline count is n + 1 too (one per pair, plus the trailing one).
  assert.equal(breaks.length, raw.split('><').length,
    `${label}: wrong number of line breaks for the >< pairs in the input`);
};

/* WHY LITERALS AND NOT ONLY THE CORPUS: the corpus proves the property only for the bytes it
 * happens to contain, and today not one of the 164 stored panels holds so much as a run of two
 * spaces. A formatPanel that also collapsed whitespace would therefore satisfy every corpus-only
 * check — including the round-trip this test used to be — and then collapse the fresh render and
 * the stored snapshot alike. Each probe below exercises one class of thing a normalisation step
 * would touch, so gaining that step reddens this test whatever the corpus currently looks like.
 * They are literals, so this needs no build. */
const PROBES = [
  ['empty input', ''],
  ['no adjacent-tag boundary', '<p>x</p>'],
  ['several boundaries', '<a>1</a><b>2</b><i>3</i>'],
  ['runs of spaces', '<p>a  b     c</p>'],
  ['tabs and mixed blanks', '<p>\ta \t b</p>'],
  ['blanks inside a tag', '<p  class="x"  data-y="z" >t</p>'],
  ['a space between two tags', '<p>a</p> <p>b</p>'],
  ['entities', '<p>a &amp; b &lt;c&gt; &#39;d&#39;</p>'],
  ['upper-case tags', '<P>x</P><BR>'],
  ['non-ASCII', '<p>é — ✓ 中</p>'],
  ['bare angle brackets', '>><<><'],
  ['leading and trailing blanks', '  <p> x </p>  '],
];

test('the snapshot format only inserts line breaks — no render change can hide in it', () => {
  for (const [label, raw] of PROBES) assertInsertionOnly(raw, `probe: ${label}`);
});

test('every stored snapshot is that formatting applied to a one-line panel, nothing more', () => {
  // What this adds to the probes: the property has to hold for the content that actually exists,
  // and the stored bytes have to BE the format the gate compares against. unformatPanel must
  // recover a panel with no newline left in it — the other half of "every newline in a snapshot
  // sits at a `>\n<` boundary, or is the trailing one" — and re-formatting that recovered panel
  // must reproduce the file byte for byte. Reading the corpus keeps this build-independent.
  for (const site of AUDIENCES) {
    for (const file of filesOf(site)) {
      const stored = readFileSync(path.join(dirOf(site), file), 'utf8');
      const raw = unformatPanel(stored);
      assert.ok(!raw.includes('\n'),
        `${site}/${file}: a newline survives unformatting, so it is not at a >< boundary — `
        + 'unformatPanel cannot restore this file and the gate would compare the wrong bytes');
      assertInsertionOnly(raw, `${site}/${file}`);
      assert.equal(formatPanel(raw), stored,
        `${site}/${file}: the stored bytes are not what formatPanel produces — ${REGEN}`);
    }
  }
});

test('the audiences are stored apart, and their difference is real', () => {
  // 68 refs ship to both sites and only a handful render differently. Storing them per audience
  // costs duplication and buys the ability to say WHICH site a file describes — the ambiguity
  // that let a resident-only change report zero drift (Codex P2 on #539).
  const resFiles = new Set(filesOf('res'));
  const shared = filesOf('ms3').filter((f) => resFiles.has(f));
  assert.ok(shared.length > 50, `expected many pages to ship to both sites, saw ${shared.length}`);
  const differing = shared.filter((f) => readFileSync(path.join(dirOf('ms3'), f), 'utf8')
    !== readFileSync(path.join(dirOf('res'), f), 'utf8'));
  assert.ok(differing.length > 0,
    'no shared page renders differently between audiences; the resident overlay may have stopped '
    + 'being applied, or the two corpora are no longer built from different payloads');
});
