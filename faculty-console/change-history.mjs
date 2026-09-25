/**
 * "What changed since you signed" — the pure half of the Re-sign by change view.
 *
 * WHY THIS EXISTS. A signed page drifts when any input to its fingerprint changes after the
 * signature. On 2026-09-25 three peer-review correction sets (#767 jurisdiction, #769 DSM-5-TR
 * wording, #773 Major/Moderate findings) drifted 51 pages at once. Re-reviewing them page by
 * page means re-reading 51 whole pages to find a handful of changed sentences. Grouped by the
 * correction that changed them, with the exact words shown, it is the way a clinician reviews
 * interval changes: one kind of change across many pages, then one signature per page.
 *
 * WHAT IT NEVER DOES. It does not sign, batch-sign, or decide anything. Each page is still
 * signed by one press in the existing review flow (the standing one-attestation-per-press
 * rule). This module only answers "which change touched which page, and what did it say".
 *
 * Everything here is pure (no I/O) so it can be pinned by unit tests and run in both the
 * Netlify function and the browser.
 */

/**
 * The opening words of the reason a drifted page carries (attestation-hash.mjs STALE_REASON,
 * up to its `{at}`). Repeated here, not imported, because that module needs node:crypto and
 * this one also runs in the browser; tests/change-history.test.mjs pins the two together.
 */
export const DRIFT_REASON_PREFIX = 'Content changed since faculty review on ';

/** True for a page whose signature was made against text that has since changed. */
export function isDriftReason(reason) {
  return typeof reason === 'string' && reason.startsWith(DRIFT_REASON_PREFIX);
}

const PR_SUFFIX = /\s*\(#(\d+)\)\s*$/;
const MERGE_PR = /^Merge pull request #(\d+) from /;

/** The first line of a commit message, and the PR number GitHub's squash/merge put in it. */
export function commitSummary(commit) {
  const message = typeof commit?.commit?.message === 'string' ? commit.commit.message : '';
  const firstLine = message.split('\n')[0].trim();
  const squash = firstLine.match(PR_SUFFIX);
  const merge = firstLine.match(MERGE_PR);
  const pr = squash ? Number(squash[1]) : merge ? Number(merge[1]) : null;
  const title = squash ? firstLine.replace(PR_SUFFIX, '').trim()
    : merge ? (message.split('\n').slice(1).find(line => line.trim()) || firstLine).trim()
    : firstLine;
  const date = commit?.commit?.committer?.date || commit?.commit?.author?.date || '';
  return {
    sha: typeof commit?.sha === 'string' ? commit.sha : '',
    pr: Number.isSafeInteger(pr) ? pr : null,
    title: title || '(no commit message)',
    date: typeof date === 'string' ? date : '',
    url: typeof commit?.html_url === 'string' ? commit.html_url : '',
  };
}

export function groupId(summary) {
  return summary.pr ? `pr:${summary.pr}` : `sha:${summary.sha.slice(0, 12)}`;
}

/**
 * Group drifted pages by the change that touched them.
 *
 * `pages`: [{ slug, title, kind, at, commits: [commitSummary…] }] where `commits` are the
 * commits that touched the page's source files on or after the day it was signed.
 * Returns { groups, unexplained }:
 *   groups       one per correction (PR, or commit when there is no PR), each naming its
 *                pages; a page changed by two corrections is in both. Largest group first,
 *                newest first on a tie, so the change that affects the most pages leads.
 *   unexplained  pages with no source-file commit since signing — their drift came from the
 *                page's metadata record or from what the fingerprint covers, not from its text.
 */
export function groupDriftedByChange(pages) {
  const groups = new Map();
  const unexplained = [];
  for (const page of Array.isArray(pages) ? pages : []) {
    const commits = Array.isArray(page.commits) ? page.commits : [];
    if (!commits.length) {
      unexplained.push(page.slug);
      continue;
    }
    const seen = new Set();
    for (const summary of commits) {
      const id = groupId(summary);
      if (seen.has(id)) continue;
      seen.add(id);
      if (!groups.has(id)) {
        groups.set(id, { id, pr: summary.pr, sha: summary.sha, title: summary.title,
          date: summary.date, url: summary.url, slugs: [] });
      }
      const group = groups.get(id);
      group.slugs.push(page.slug);
      // Keep the newest commit's identity for a PR that landed as several commits.
      if (summary.date > group.date) Object.assign(group, { sha: summary.sha, date: summary.date, url: summary.url });
    }
  }
  const ordered = [...groups.values()].sort((left, right) => (
    right.slugs.length - left.slugs.length || right.date.localeCompare(left.date)
  ));
  for (const group of ordered) group.slugs.sort();
  return { groups: ordered, unexplained: unexplained.sort() };
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// diff
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Myers' O((N+M)·D) shortest edit script over two arrays of comparable values.
 * Returns ops [{ op: 'eq'|'del'|'add', a?, b? }] in order, or null when more than `maxEdits`
 * edits would be needed (the caller then says "too many changes to show" rather than
 * spending the function's time budget on a rewrite nobody reviews line by line anyway).
 * Memory is O(D²) — only the live band of each round is kept for the backtrack.
 */
export function diffSequences(a, b, { maxEdits = 2000 } = {}) {
  const n = a.length;
  const m = b.length;
  const maxD = Math.min(n + m, maxEdits);
  const off = maxD + 1;
  const v = new Int32Array(2 * maxD + 3);
  const trace = [];
  for (let d = 0; d <= maxD; d += 1) {
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]);
      let x = down ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x += 1; y += 1; }
      v[off + k] = x;
      if (x >= n && y >= m) return backtrack(trace, d, n, m);
    }
  }
  return null;
}

function backtrack(trace, dEnd, n, m) {
  const ops = [];
  let x = n;
  let y = m;
  for (let d = dEnd; d > 0; d -= 1) {
    const band = trace[d];
    const at = k => band[k + d + 1];
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push({ op: 'eq', a: x - 1, b: y - 1 }); x -= 1; y -= 1; }
    if (down) { ops.push({ op: 'add', b: y - 1 }); y -= 1; } else { ops.push({ op: 'del', a: x - 1 }); x -= 1; }
  }
  while (x > 0 && y > 0) { ops.push({ op: 'eq', a: x - 1, b: y - 1 }); x -= 1; y -= 1; }
  return ops.reverse();
}

const TOKEN = /\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu;

function pushSegment(segments, t, s) {
  if (!s) return;
  const last = segments.at(-1);
  if (last && last.t === t) last.s += s;
  else segments.push({ t, s });
}

/**
 * One changed line, word by word: [{ t: 'eq'|'del'|'add', s }]. Whitespace is its own token,
 * so a reflowed sentence reads as the words that changed, not as a whole new paragraph.
 */
export function wordSegments(oldLine, newLine, { maxEdits = 600 } = {}) {
  const a = String(oldLine).match(TOKEN) || [];
  const b = String(newLine).match(TOKEN) || [];
  const ops = diffSequences(a, b, { maxEdits });
  const segments = [];
  if (!ops) {
    pushSegment(segments, 'del', a.join(''));
    pushSegment(segments, 'add', b.join(''));
    return segments;
  }
  for (const op of ops) {
    if (op.op === 'eq') pushSegment(segments, 'eq', a[op.a]);
    else if (op.op === 'del') pushSegment(segments, 'del', a[op.a]);
    else pushSegment(segments, 'add', b[op.b]);
  }
  return readableSegments(segments);
}

/**
 * Semantic cleanup for reading: a space or a single character left "unchanged" between two
 * changes is folded into the change, so "depressed mood with activation" → "a depressive
 * episode plus ≥3 manic symptoms" reads as one phrase replaced by another rather than as four
 * interleaved word swaps. Only the rendering changes; nothing is dropped.
 */
function readableSegments(segments) {
  const out = [];
  let i = 0;
  while (i < segments.length) {
    if (segments[i].t === 'eq') { out.push({ ...segments[i] }); i += 1; continue; }
    let del = '';
    let add = '';
    let j = i;
    while (j < segments.length) {
      const segment = segments[j];
      if (segment.t === 'del') { del += segment.s; j += 1; continue; }
      if (segment.t === 'add') { add += segment.s; j += 1; continue; }
      const bridging = (/^\s+$/.test(segment.s) || segment.s.length <= 1)
        && j + 1 < segments.length && segments[j + 1].t !== 'eq';
      if (!bridging) break;
      del += segment.s;
      add += segment.s;
      j += 1;
    }
    pushSegment(out, 'del', del);
    pushSegment(out, 'add', add);
    i = j;
  }
  return out;
}

function splitLines(text) {
  const value = String(text ?? '');
  if (!value) return [];
  const lines = value.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

/**
 * The changes between two texts as hunks of rows, ready to render.
 * Row kinds: 'context' (unchanged, around a change), 'change' (an old line and the new line
 * that replaced it, word by word), 'del' (a line removed), 'add' (a line added).
 * Returns { hunks, changed, truncated, tooLarge }.
 */
export function lineDiffHunks(oldText, newText, { context = 2, maxEdits = 2000, maxHunks = 60, maxLines = 6000 } = {}) {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  if (a.length > maxLines || b.length > maxLines) return { hunks: [], changed: true, truncated: false, tooLarge: true };
  const ops = diffSequences(a, b, { maxEdits });
  if (!ops) return { hunks: [], changed: true, truncated: false, tooLarge: true };

  // Rows, with changed runs pairing their deletions and additions line for line. Every row
  // carries its position in BOTH texts (`a`, `b`, 0-based; for a pure addition `a` is where
  // it lands in the old text, and vice versa), so a hunk that opens on an addition still
  // says truthfully where it is.
  const rows = [];
  let index = 0;
  let cursorA = 0;
  let cursorB = 0;
  while (index < ops.length) {
    if (ops[index].op === 'eq') {
      rows.push({ kind: 'context', a: cursorA, b: cursorB, segments: [{ t: 'eq', s: a[cursorA] }] });
      cursorA += 1;
      cursorB += 1;
      index += 1;
      continue;
    }
    let dels = 0;
    let adds = 0;
    while (index < ops.length && ops[index].op !== 'eq') {
      if (ops[index].op === 'del') dels += 1; else adds += 1;
      index += 1;
    }
    const paired = Math.min(dels, adds);
    for (let i = 0; i < paired; i += 1) {
      rows.push({ kind: 'change', a: cursorA + i, b: cursorB + i,
        segments: wordSegments(a[cursorA + i], b[cursorB + i]) });
    }
    for (let i = paired; i < dels; i += 1) {
      rows.push({ kind: 'del', a: cursorA + i, b: cursorB + paired, segments: [{ t: 'del', s: a[cursorA + i] }] });
    }
    for (let i = paired; i < adds; i += 1) {
      rows.push({ kind: 'add', a: cursorA + dels, b: cursorB + i, segments: [{ t: 'add', s: b[cursorB + i] }] });
    }
    cursorA += dels;
    cursorB += adds;
  }

  // Hunks: every changed row plus `context` unchanged rows either side, merging overlaps.
  const keep = new Array(rows.length).fill(false);
  rows.forEach((row, at) => {
    if (row.kind === 'context') return;
    for (let i = Math.max(0, at - context); i <= Math.min(rows.length - 1, at + context); i += 1) keep[i] = true;
  });
  const hunks = [];
  let current = null;
  rows.forEach((row, at) => {
    if (!keep[at]) { current = null; return; }
    if (!current) {
      current = { oldStart: row.a + 1, newStart: row.b + 1, rows: [] };
      hunks.push(current);
    }
    current.rows.push({ kind: row.kind, segments: row.segments });
  });
  const truncated = hunks.length > maxHunks;
  return {
    hunks: truncated ? hunks.slice(0, maxHunks) : hunks,
    changed: rows.some(row => row.kind !== 'context'),
    truncated,
    tooLarge: false,
  };
}

/**
 * A topic_meta record's changes, key by key (facultyReview excluded — it records the act of
 * signing, not the page). Each changed key carries line hunks over its pretty-printed JSON.
 */
export function recordDiff(before, after) {
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const left = isRecord(before) ? before : {};
  const right = isRecord(after) ? after : {};
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter(key => key !== 'facultyReview')
    .sort();
  const changes = [];
  for (const key of keys) {
    const was = Object.hasOwn(left, key) ? JSON.stringify(left[key], null, 1) : '';
    const now = Object.hasOwn(right, key) ? JSON.stringify(right[key], null, 1) : '';
    if (was === now) continue;
    changes.push({ key, ...lineDiffHunks(was, now, { context: 1 }) });
  }
  return changes;
}
