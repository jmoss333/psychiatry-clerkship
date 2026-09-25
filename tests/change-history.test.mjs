/* The pure half of the console's Re-sign by change view (faculty-console/change-history.mjs):
   which correction changed which signed page, and a diff a reviewer can read. Nothing here
   signs anything; these tests pin that what the reviewer is shown is TRUE — every word the
   diff calls unchanged really is, every changed line is shown at the line it is really on,
   and grouping never drops a page or invents one. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { STALE_REASON } from '../faculty-console/attestation-hash.mjs';
import {
  commitSummary,
  diffSequences,
  DRIFT_REASON_PREFIX,
  groupDriftedByChange,
  groupId,
  isDriftReason,
  lineDiffHunks,
  recordDiff,
  wordSegments,
} from '../faculty-console/change-history.mjs';

// A small deterministic PRNG so every property run is reproducible from its seed.
function rng(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
}

function lcsLength(a, b) {
  const row = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j];
      row[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : Math.max(row[j], row[j - 1]);
      diagonal = above;
    }
  }
  return row[b.length];
}

function randomLines(random, length, alphabet = 'abcde') {
  return Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]);
}

function commit({ sha, message, date, url = `https://github.com/o/r/commit/${sha}` }) {
  return { sha, html_url: url, commit: { message, committer: { date } } };
}

test('the drift prefix is the stale reason up to its date, byte for byte', () => {
  assert.equal(DRIFT_REASON_PREFIX, STALE_REASON.split('{at}')[0]);
  assert.equal(isDriftReason(STALE_REASON.replace('{at}', '2026-09-25')), true);
  // The other two stale findings are NOT drift: nothing changed, so there is no change to show.
  assert.equal(isDriftReason('No content hash recorded; re-attest to bind this review to the page text.'), false);
  assert.equal(isDriftReason('Could not verify this review against the page text this load.'), false);
  assert.equal(isDriftReason(undefined), false);
});

test('commitSummary reads the PR number GitHub put in a squash or merge commit', () => {
  const squash = commitSummary(commit({
    sha: 'a'.repeat(40),
    message: 'fix(content): Major/Moderate peer-review findings (#773)\n\nBody.',
    date: '2026-09-24T12:00:00Z',
  }));
  assert.deepEqual(squash, {
    sha: 'a'.repeat(40),
    pr: 773,
    title: 'fix(content): Major/Moderate peer-review findings',
    date: '2026-09-24T12:00:00Z',
    url: `https://github.com/o/r/commit/${'a'.repeat(40)}`,
  });

  const merge = commitSummary(commit({
    sha: 'b'.repeat(40),
    message: 'Merge pull request #12 from owner/branch\n\nDSM-5-TR wording pass',
    date: '2026-09-20T00:00:00Z',
  }));
  assert.equal(merge.pr, 12);
  assert.equal(merge.title, 'DSM-5-TR wording pass');

  const plain = commitSummary(commit({ sha: 'c'.repeat(40), message: 'direct edit', date: '2026-09-01T00:00:00Z' }));
  assert.equal(plain.pr, null);
  assert.equal(plain.title, 'direct edit');
  assert.equal(groupId(plain), `sha:${'c'.repeat(12)}`);
  assert.equal(groupId(squash), 'pr:773');

  // Hostile or partial input is summarised, never thrown on.
  assert.deepEqual(commitSummary(null), { sha: '', pr: null, title: '(no commit message)', date: '', url: '' });
});

test('grouping puts each drifted page under every correction that changed it', () => {
  const c773 = commitSummary(commit({ sha: '1'.repeat(40), message: 'Major/Moderate (#773)', date: '2026-09-24T10:00:00Z' }));
  const c767old = commitSummary(commit({ sha: '2'.repeat(40), message: 'Jurisdiction (#767)', date: '2026-09-23T10:00:00Z' }));
  const c767new = commitSummary(commit({ sha: '3'.repeat(40), message: 'Jurisdiction (#767)', date: '2026-09-23T11:00:00Z' }));
  const loose = commitSummary(commit({ sha: '4'.repeat(40), message: 'typo', date: '2026-09-22T10:00:00Z' }));
  const { groups, unexplained } = groupDriftedByChange([
    { slug: 't_mood.md', commits: [c773, c767old] },
    { slug: 'ddx.md', commits: [c773, c767new, c767old] },
    { slug: 'rapid_review.md', commits: [c773] },
    { slug: 't_geri.md', commits: [] },
    { slug: 'week2.md', commits: [loose] },
  ]);

  assert.deepEqual(groups.map(group => [group.id, group.slugs]), [
    ['pr:773', ['ddx.md', 'rapid_review.md', 't_mood.md']],
    ['pr:767', ['ddx.md', 't_mood.md']],
    [`sha:${'4'.repeat(12)}`, ['week2.md']],
  ]);
  // A PR that landed as several commits is one group, named by its newest commit.
  assert.equal(groups[1].sha, '3'.repeat(40));
  assert.equal(groups[1].date, '2026-09-23T11:00:00Z');
  assert.deepEqual(unexplained, ['t_geri.md']);

  // Nothing lost, nothing invented: every page with a commit is in at least one group.
  const grouped = new Set(groups.flatMap(group => group.slugs));
  assert.deepEqual([...grouped].sort(), ['ddx.md', 'rapid_review.md', 't_mood.md', 'week2.md']);
});

test('diffSequences returns a minimal edit script that rebuilds the new sequence', () => {
  const random = rng(20260925);
  for (let run = 0; run < 400; run += 1) {
    const a = randomLines(random, Math.floor(random() * 30));
    const b = randomLines(random, Math.floor(random() * 30));
    const ops = diffSequences(a, b);
    const rebuiltOld = [];
    const rebuiltNew = [];
    let edits = 0;
    for (const op of ops) {
      if (op.op === 'eq') {
        assert.equal(a[op.a], b[op.b], `run ${run}: an "unchanged" pair must be equal`);
        rebuiltOld.push(a[op.a]);
        rebuiltNew.push(b[op.b]);
      } else if (op.op === 'del') {
        rebuiltOld.push(a[op.a]);
        edits += 1;
      } else {
        rebuiltNew.push(b[op.b]);
        edits += 1;
      }
    }
    assert.deepEqual(rebuiltOld, a, `run ${run}: old side`);
    assert.deepEqual(rebuiltNew, b, `run ${run}: new side`);
    assert.equal(edits, a.length + b.length - 2 * lcsLength(a, b), `run ${run}: minimal`);
  }
});

test('diffSequences gives up (null) rather than spending time on a rewrite', () => {
  const a = Array.from({ length: 50 }, (_, index) => `old ${index}`);
  const b = Array.from({ length: 50 }, (_, index) => `new ${index}`);
  assert.equal(diffSequences(a, b, { maxEdits: 20 }), null);
  assert.notEqual(diffSequences(a, b, { maxEdits: 100 }), null);
});

test('word segments always rebuild both lines exactly', () => {
  const random = rng(773);
  const words = ['the', 'patient', 'mood', 'depressive', 'episode', ',', '.', '≥3', 'manic', 'DSM-5-TR', ' ', '  '];
  const sentence = () => Array.from({ length: Math.floor(random() * 14) }, () => words[Math.floor(random() * words.length)]).join(' ');
  for (let run = 0; run < 400; run += 1) {
    const before = sentence();
    const after = random() < 0.2 ? before : sentence();
    const segments = wordSegments(before, after);
    const oldSide = segments.filter(segment => segment.t !== 'add').map(segment => segment.s).join('');
    const newSide = segments.filter(segment => segment.t !== 'del').map(segment => segment.s).join('');
    assert.equal(oldSide, before, `run ${run}`);
    assert.equal(newSide, after, `run ${run}`);
    if (before === after) assert.ok(segments.every(segment => segment.t === 'eq'), `run ${run}: no change shown`);
  }
});

test('a replaced phrase reads as one phrase replaced, not interleaved word swaps', () => {
  const segments = wordSegments(
    'Mixed features: depressed mood with activation.',
    'Mixed features: a depressive episode plus ≥3 manic symptoms.',
  );
  assert.deepEqual(segments, [
    { t: 'eq', s: 'Mixed features: ' },
    { t: 'del', s: 'depressed mood with activation' },
    { t: 'add', s: 'a depressive episode plus ≥3 manic symptoms' },
    { t: 'eq', s: '.' },
  ]);
});

// Walks every hunk against the two texts: each row must be the line it claims to be, at
// the line number the hunk header claims — so "Near line N" in the console is true.
function assertHunksTrue(before, after, result, label) {
  const a = before ? before.replace(/\n$/, '').split('\n') : [];
  const b = after ? after.replace(/\n$/, '').split('\n') : [];
  let removed = 0;
  let added = 0;
  for (const hunk of result.hunks) {
    let at = hunk.oldStart - 1;
    let bt = hunk.newStart - 1;
    for (const row of hunk.rows) {
      const oldText = row.segments.filter(segment => segment.t !== 'add').map(segment => segment.s).join('');
      const newText = row.segments.filter(segment => segment.t !== 'del').map(segment => segment.s).join('');
      if (row.kind === 'context') {
        assert.equal(a[at], oldText, `${label}: context old line ${at + 1}`);
        assert.equal(b[bt], newText, `${label}: context new line ${bt + 1}`);
        at += 1; bt += 1;
      } else if (row.kind === 'change') {
        assert.equal(a[at], oldText, `${label}: changed old line ${at + 1}`);
        assert.equal(b[bt], newText, `${label}: changed new line ${bt + 1}`);
        at += 1; bt += 1; removed += 1; added += 1;
      } else if (row.kind === 'del') {
        assert.equal(a[at], oldText, `${label}: removed line ${at + 1}`);
        at += 1; removed += 1;
      } else {
        assert.equal(b[bt], newText, `${label}: added line ${bt + 1}`);
        bt += 1; added += 1;
      }
    }
  }
  if (!result.truncated) {
    const common = lcsLength(a, b);
    assert.equal(removed, a.length - common, `${label}: every removed line is shown`);
    assert.equal(added, b.length - common, `${label}: every added line is shown`);
  }
}

test('line hunks show every change at the line it is really on', () => {
  const random = rng(767);
  const vocabulary = ['# Mood', '- SIGECAPS', 'Lithium level 0.6-1.0', '', 'Mixed features', 'Screen for bipolarity', '> Pearl'];
  for (let run = 0; run < 300; run += 1) {
    const lines = Array.from({ length: Math.floor(random() * 25) }, () => vocabulary[Math.floor(random() * vocabulary.length)]);
    const edited = lines.flatMap(line => {
      const roll = random();
      if (roll < 0.1) return [];
      if (roll < 0.2) return [line, vocabulary[Math.floor(random() * vocabulary.length)]];
      if (roll < 0.3) return [`${line} (revised)`];
      return [line];
    });
    if (random() < 0.3) edited.unshift('Prepended line');
    const before = lines.length ? `${lines.join('\n')}\n` : '';
    const after = edited.length ? `${edited.join('\n')}\n` : '';
    const result = lineDiffHunks(before, after, { context: Math.floor(random() * 3) });
    assert.equal(result.tooLarge, false);
    assert.equal(result.changed, before !== after, `run ${run}: changed flag`);
    assertHunksTrue(before, after, result, `run ${run}`);
  }
});

test('a hunk that opens on an added line still names where it is', () => {
  const result = lineDiffHunks('one\ntwo\nthree\nfour\nfive\nsix\n', 'one\ntwo\nthree\nfour\nfive\nNEW\nsix\n', { context: 0 });
  assert.equal(result.hunks.length, 1);
  assert.equal(result.hunks[0].rows[0].kind, 'add');
  assert.equal(result.hunks[0].newStart, 6);
  assert.equal(result.hunks[0].oldStart, 6);
});

test('line hunks refuse oversize input and cap the number of passages', () => {
  const huge = Array.from({ length: 30 }, (_, index) => `line ${index}`).join('\n');
  assert.deepEqual(lineDiffHunks(huge, `${huge}\nmore`, { maxLines: 10 }),
    { hunks: [], changed: true, truncated: false, tooLarge: true });

  const before = Array.from({ length: 40 }, (_, index) => `line ${index}`).join('\n');
  const after = Array.from({ length: 40 }, (_, index) => (index % 4 === 0 ? `edited ${index}` : `line ${index}`)).join('\n');
  const capped = lineDiffHunks(before, after, { context: 0, maxHunks: 3 });
  assert.equal(capped.truncated, true);
  assert.equal(capped.hunks.length, 3);
});

test('recordDiff shows changed record fields and never the signature itself', () => {
  const changes = recordDiff(
    { title: 'Mood', quiz: [{ q: 'Old stem' }], evidenceIds: ['a'], facultyReview: { lastReviewed: '2026-07-01' } },
    { title: 'Mood', quiz: [{ q: 'New stem' }], keyPoints: ['Added'], facultyReview: { lastReviewed: '2026-09-25' } },
  );
  assert.deepEqual(changes.map(change => change.key), ['evidenceIds', 'keyPoints', 'quiz']);
  for (const change of changes) assert.equal(change.changed, true);
  assert.deepEqual(recordDiff(null, undefined), []);
  assert.deepEqual(recordDiff({ facultyReview: 1 }, { facultyReview: 2 }), []);
});
