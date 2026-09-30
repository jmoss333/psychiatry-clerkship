/* Finds the tests that read LIVE review state: the faculty's sign-offs as they stand today.

WHY THIS EXISTS. CLAUDE.md: "A test may not depend on live governance state ... faculty
draining that queue turns it red. ... The inverse also holds — a test that passes only while a
backlog exists retires itself silently when the backlog clears." The rule is remembered, not
enforced, and it has been broken three times, each time by a test that read the real queue:

  #729  front-door.spec.js asserted that some Library page was still pending; Josh attested 101
        pages in #725 and four assertions went red for being right.
  #781  faculty-qbank-rules.test.mjs pinned the question bank at 55 drafts; 39 console
        attestations took it to 16 and the build blocked the attestations it was counting.
  #895  qbank-retired.spec.js required the shipped bank to hold drafts; the rolling sign-off
        PR attested the last five and its own smoke job blocked it (fixed by #903).

This module only FINDS such tests. tests/live-governance-state.test.mjs decides what to do
with what it finds: every finding must be registered with how it stays right whatever the
faculty do, and the node tests among them are re-run with the queue drained.

WHAT COUNTS AS A LIVE READ. A code line (comments stripped) that names one of the governed
files below AND reaches the real repository or a served site on that same line:
  * a variable bound to the repository root (anything built from import.meta.url, __dirname,
    process.cwd() or Path(__file__) that does not mention a temp dir or a fixture);
  * import.meta.url itself;
  * a reader helper whose own body reads relative to the root (`const json = p => ...`);
  * a request for the served file: `request.get('/governance.json')`,
    `requestGetWithRetry(page.request, `${baseURL}/question_bank.json`)`.
A constant that holds the file name (`const REVIEWED = '13_Faculty_Resources/reviewed.json'`)
counts wherever it is used on such a line. A line that mentions a fixture, a temp dir or a
page.route() interception is not a live read: that is the test serving its own state.

WHAT COUNTS AS USING REVIEW STATE. The file mentions a review-state value anywhere: a quoted
'attested' / 'draft' / 'pending' / 'reviewed', a facultyReview block, or a retired flag. A file
that reads topic_meta.json only for titles and never mentions a state is not a finding.

WHAT IT CANNOT SEE, stated so nobody mistakes silence for coverage: a read that happens inside
a Python or shell subprocess the test spawns, a path assembled across several lines through
more than one variable, and state that arrives through a built site under _build/ unless the
built file is itself named on a live-read line. The registry is the backstop for all three:
a test author who knows their test reads the queue registers it by hand. */

import fs from 'node:fs';
import path from 'node:path';

export const SOURCES = Object.freeze({
  ledger: { re: /(?<![\w.-])reviewed\.json/, what: 'the sign-off ledger, 13_Faculty_Resources/reviewed.json' },
  qbank: { re: /(?<![\w.-])question_bank\.json/, what: "question_bank.json (each question's attested / draft / retired status)" },
  meta: { re: /(?<![\w.-])topic_meta\.json/, what: 'topic_meta.json (its facultyReview blocks)' },
  served: { re: /(?<![\w.-])governance\.json/, what: "a learner site's served governance.json (the ledger as learners see it)" },
});

const STATE_VOCAB = /facultyReview|(['"])(?:attested|draft|pending|reviewed|retired)\1|\.retired\b|\.get\(\s*['"]retired['"]/;
const NOT_LIVE = /fixture|mkdtemp|tmpdir|tmp_path|temp_dir|synthetic|\bFIX_/i;
const ROOTISH = /import\.meta\.url|__dirname|process\.cwd\(\)|Path\(\s*__file__\s*\)/;
const SERVED_CALL = /\b(?:request|fetch|requestGetWithRetry|get)\s*\(/;
const ROUTE_CALL = /\b(?:route|unroute|fulfill)\s*\(/;
const SCANNED = /\.(?:mjs|cjs|js|py)$/;
const SKIPPED_DIRS = new Set(['node_modules', 'fixtures', '__pycache__', 'test-results', 'playwright-report']);

/* Blank out comments, keep strings and line numbers. Quotes close at end of line (JS and Python
   strings cannot span lines without a backslash), so a regex literal holding a stray quote can
   mislead this lexer for one line at most. Template literals and Python triple quotes span. */
export function stripComments(text, lang) {
  const out = [];
  let i = 0;
  let mode = 'code';
  let quote = '';
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const two = text.slice(i, i + 2);
    const three = text.slice(i, i + 3);
    if (mode === 'code') {
      if (lang === 'js' && two === '//') { mode = 'line'; out.push('  '); i += 2; continue; }
      if (lang === 'js' && two === '/*') { mode = 'block'; out.push('  '); i += 2; continue; }
      if (lang === 'py' && c === '#') { mode = 'line'; out.push(' '); i += 1; continue; }
      if (lang === 'py' && (three === '"""' || three === "'''")) {
        mode = 'doc'; quote = three; out.push('   '); i += 3; continue;
      }
      if (c === '"' || c === "'" || (lang === 'js' && c === '`')) { mode = 'str'; quote = c; out.push(c); i += 1; continue; }
      out.push(c); i += 1; continue;
    }
    if (mode === 'line') {
      if (c === '\n') { mode = 'code'; out.push('\n'); } else out.push(' ');
      i += 1; continue;
    }
    if (mode === 'block') {
      if (two === '*/') { mode = 'code'; out.push('  '); i += 2; continue; }
      out.push(c === '\n' ? '\n' : ' '); i += 1; continue;
    }
    if (mode === 'doc') {
      /* A Python triple-quoted string is prose here (a docstring or a long message), never a path. */
      if (three === quote) { mode = 'code'; out.push('   '); i += 3; continue; }
      out.push(c === '\n' ? '\n' : ' '); i += 1; continue;
    }
    /* mode === 'str' */
    if (c === '\\') { out.push(text.slice(i, i + 2)); i += 2; continue; }
    if (c === quote) { mode = 'code'; out.push(c); i += 1; continue; }
    if (c === '\n' && quote !== '`') { mode = 'code'; out.push('\n'); i += 1; continue; }
    out.push(c); i += 1;
  }
  return out.join('');
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordIn = (names, line) => names.some((name) => new RegExp(`(?<![\\w$.])${escapeRe(name)}(?![\\w$])`).test(line));

function sourcesOn(line) {
  return Object.entries(SOURCES).filter(([, s]) => s.re.test(line)).map(([key]) => key);
}

/* Scan one file's text. Returns { sources, lines, usesState }: the governed files it reads
   live, the 1-based lines where it does, and whether it mentions a review-state value. */
export function scanSource(relPath, text) {
  const lang = relPath.endsWith('.py') ? 'py' : 'js';
  const code = stripComments(text, lang);
  const lines = code.split('\n');
  const binding = lang === 'py'
    ? /^\s*([A-Za-z_]\w*)\s*(?::[^=]+)?=(?!=)\s*(.+)$/
    : /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.+)$/;
  const helperDef = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*(.+)$/;

  /* Three kinds of binding matter, and only these three:
       roots   — a PATH into the real repository (`const repo = path.resolve(...import.meta.url...)`,
                 `REPO_ROOT = Path(__file__).resolve().parents[2]`, `QBANK = REPO_ROOT / "x.json"`).
                 Only a right-hand side that STARTS as a path expression qualifies: a variable
                 holding a file's contents or a loaded module is not a path, even when the
                 expression that produced it mentioned the root.
       names   — a bare string literal naming a governed file (`const REVIEWED = '.../reviewed.json'`);
                 it becomes a live read on any line that also reaches the repository.
       helpers — a JS arrow whose own readFileSync/readFile call resolves against the root
                 (`const json = p => JSON.parse(readFileSync(new URL(p, ROOT)))`).
     Bindings are file-wide, not scoped: a name bound to the root in one function and to a temp
     dir in another counts as the root. Writes are never reads, which covers the common case. */
  const roots = new Set();
  const helpers = new Set();
  const names = new Map();
  const pathStart = lang === 'py'
    ? /^(?:Path\(|os\.path\.(?:join|abspath|dirname|realpath)\(|[A-Za-z_]\w*(?:\.\w+)*\s*\/|[A-Za-z_]\w*\.(?:parent|parents|resolve)\b)/
    : /^(?:(?:path\.)?(?:join|resolve|dirname|normalize)\(|new URL\(|(?:url\.)?fileURLToPath\()/;
  const bareString = /^(['"`])[^'"`]*\1\s*[;,)]?\s*$/;
  for (let pass = 0; pass < 3; pass += 1) {
    for (const line of lines) {
      const helper = lang === 'js' && line.match(helperDef);
      if (helper) {
        const read = helper[2].match(/\b(?:readFileSync|readFile)\s*\((.*)$/);
        if (read && (ROOTISH.test(read[1]) || wordIn([...roots], read[1])) && !NOT_LIVE.test(read[1])) {
          helpers.add(helper[1]);
        }
        continue;
      }
      const m = line.match(binding);
      if (!m) continue;
      const [, name, rhsRaw] = m;
      const rhs = rhsRaw.trim();
      if (bareString.test(rhs)) {
        const named = sourcesOn(rhs);
        if (named.length) names.set(name, named);
        continue;
      }
      if (NOT_LIVE.test(rhs) || !pathStart.test(rhs)) continue;
      if (ROOTISH.test(rhs) || wordIn([...roots], rhs)) roots.add(name);
    }
  }

  const WRITE = /writeFileSync|writeFile\(|write_text|write_bytes|\.write\(|copyFileSync|appendFileSync|mkdirSync|rmSync/;
  const found = new Set();
  const at = [];
  lines.forEach((line, index) => {
    const direct = sourcesOn(line);
    const viaName = [...names].filter(([name]) => wordIn([name], line)).flatMap(([, s]) => s);
    const named = [...new Set([...direct, ...viaName])];
    if (!named.length || NOT_LIVE.test(line) || WRITE.test(line)) return;
    const reachesRepo = ROOTISH.test(line) || wordIn([...roots], line)
      || [...helpers].some((h) => new RegExp(`(?<![\\w$.])${escapeRe(h)}\\s*\\(`).test(line));
    const servedRead = lang === 'js' && SERVED_CALL.test(line) && !ROUTE_CALL.test(line)
      && direct.some((key) => new RegExp(`/${SOURCES[key].re.source.replace('(?<![\\w.-])', '')}`).test(line));
    if (!reachesRepo && !servedRead) return;
    for (const key of named) found.add(key);
    at.push(index + 1);
  });
  return { sources: [...found].sort(), lines: at, usesState: STATE_VOCAB.test(code) };
}

/* Every test-side file under tests/ that reads live review state and uses it. */
export function scanTree(repoRoot, { exclude = [] } = {}) {
  const results = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name) && !entry.name.startsWith('.')) walk(full);
        continue;
      }
      if (!SCANNED.test(entry.name)) continue;
      const rel = path.relative(repoRoot, full).split(path.sep).join('/');
      if (exclude.includes(rel)) continue;
      const scan = scanSource(rel, fs.readFileSync(full, 'utf8'));
      if (scan.sources.length && scan.usesState) results.set(rel, scan);
    }
  };
  walk(path.join(repoRoot, 'tests'));
  return results;
}
