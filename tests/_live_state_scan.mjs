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
faculty do, and the node tests among them are re-run with the queue drained and refilled.

WHAT COUNTS AS A LIVE READ. A code line (comments stripped) that names one of the governed
files below AND reaches the real repository or a served site on that same line:
  * a variable bound to a PATH into the repository: a right-hand side that starts as a path
    expression (path.join / resolve / new URL / Path(...) / ROOT / "x") built from
    import.meta.url, import.meta.dirname, __dirname, process.cwd() or __file__;
  * one of those root expressions itself;
  * a reader helper whose own body reads relative to the root (an arrow, a function
    declaration or a Python def; its body may run a few lines past the definition);
  * a read call handed the file's repository-relative path directly
    (`readFileSync('13_Faculty_Resources/reviewed.json')`, `open("question_bank.json")`),
    which reads the checkout because every gate runs from the repository root;
  * a request for the served file (`request.get('/governance.json')`, a URL held in a
    variable, or a page.waitForResponse() on a governance.json URL glob).
A constant holding the file name (`const REVIEWED = '13_Faculty_Resources/reviewed.json'`)
counts wherever it is used on such a line. A string on the line that points into a fixture, or a
temp-dir call on the line, makes it not live; so does a page.route() interception, which is the
test serving its own state. A write is not a read, but a COPY of a governed file is.

WHAT COUNTS AS USING REVIEW STATE. The file mentions a review-state value anywhere in code: a
quoted 'attested' / 'draft' / 'pending' / 'reviewed' / 'retired', a facultyReview block, a
retired flag, or one of those words as an object key or a property (`{ draft: 5 }`,
`tally.pending`). A file that reads topic_meta.json only for titles is not a finding.

WHAT IT CANNOT SEE, stated so nobody mistakes silence for coverage: a read inside a Python or
shell subprocess the test spawns, a path assembled across lines through more than one variable,
a helper defined in another module, and state that arrives through a built or served file
other than the four governed ones (nav.json, search-index.json). A test author who knows their
test reads the queue that way registers it by hand (`detected: false`). */

import fs from 'node:fs';
import path from 'node:path';

export const SOURCES = Object.freeze({
  ledger: { re: /(?<![\w.-])reviewed\.json/, what: 'the sign-off ledger, 13_Faculty_Resources/reviewed.json' },
  qbank: { re: /(?<![\w.-])question_bank\.json/, what: "question_bank.json (each question's attested / draft / retired status)" },
  meta: { re: /(?<![\w.-])topic_meta\.json/, what: 'topic_meta.json (its facultyReview blocks)' },
  served: { re: /(?<![\w.-])governance\.json/, what: "a learner site's served governance.json (the ledger as learners see it)" },
});

const STATE_VOCAB = new RegExp([
  'facultyReview',
  String.raw`(['"])(?:attested|draft|pending|reviewed|retired)\1`,
  String.raw`\.retired\b`,
  String.raw`\.get\(\s*['"]retired['"]`,
  String.raw`\b(?:attested|draft|pending|reviewed)\s*:(?!:)`,
  String.raw`\.(?:attested|draft|pending|reviewed)\b`,
].join('|'));
const ROOTISH = /import\.meta\.(?:url|dirname|filename)|__dirname|__filename|process\.cwd\(\)|os\.getcwd\(\)|\b__file__\b/;
const TEMP_CALL = /\b(?:mkdtempSync|mkdtemp|tmpdir|tmp_path|temp_dir|TemporaryDirectory|tempfile|gettempdir)\b/;
const NOT_LIVE_STRING = /fixture|synthetic/i;
const STRONG_SERVED_CALL = /\b(?:requestGetWithRetry|fetch|waitForResponse)\s*\(|\brequest\s*\.\s*(?:get|fetch)\s*\(|\.request\s*\(/;
const WEAK_SERVED_CALL = /\bget\s*\(/;
const ROUTE_CALL = /\b(?:route|unroute|fulfill)\s*\(/;
const WRITE = /writeFileSync|writeFile\(|write_text|write_bytes|\.write\(|appendFileSync|mkdirSync|rmSync|unlinkSync/;
const SCANNED = /\.(?:mjs|cjs|js|py)$/;
const SKIPPED_DIRS = new Set(['node_modules', 'fixtures', '__pycache__', 'test-results', 'playwright-report']);
const REGEX_PREFIX = /[(,=:[!&|?{};+\-*%<>~^]$|(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/;

/* Blank out comments, keep strings, regex literals and line numbers. Quotes close at end of line
   (JS and Python strings cannot span lines without a backslash). A `/` where an expression can
   start opens a regex literal, so `/^\/*\/` cannot open a block comment. Template literals and
   Python triple quotes span lines; a Python triple-quoted string is blanked as prose. */
export function stripComments(text, lang) {
  const out = [];
  let i = 0;
  let mode = 'code';
  let quote = '';
  let inClass = false;
  const n = text.length;
  /* The last few significant code characters, for the regex-or-division decision. A string or
     a regex literal ends as an operand, so it is recorded as one. */
  let recent = '';
  const note = (s) => { recent = (recent + s).slice(-16); };
  while (i < n) {
    const c = text[i];
    const two = text.slice(i, i + 2);
    const three = text.slice(i, i + 3);
    if (mode === 'code') {
      if (lang === 'js' && two === '//') { mode = 'line'; out.push('  '); i += 2; continue; }
      if (lang === 'js' && two === '/*') { mode = 'block'; out.push('  '); i += 2; continue; }
      if (lang === 'js' && c === '/' && (recent.trim() === '' || REGEX_PREFIX.test(recent.trimEnd()))) {
        mode = 'regex'; inClass = false; out.push(c); i += 1; continue;
      }
      if (lang === 'py' && c === '#') { mode = 'line'; out.push(' '); i += 1; continue; }
      if (lang === 'py' && (three === '"""' || three === "'''")) {
        mode = 'doc'; quote = three; out.push('   '); i += 3; continue;
      }
      if (c === '"' || c === "'" || (lang === 'js' && c === '`')) { mode = 'str'; quote = c; out.push(c); i += 1; continue; }
      note(/\s/.test(c) ? ' ' : c);
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
      if (three === quote) { mode = 'code'; out.push('   '); i += 3; continue; }
      out.push(c === '\n' ? '\n' : ' '); i += 1; continue;
    }
    if (mode === 'regex') {
      if (c === '\\') { out.push(text.slice(i, i + 2)); i += 2; continue; }
      if (c === '\n') { mode = 'code'; out.push('\n'); i += 1; continue; }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) { mode = 'code'; note('a'); out.push(c); i += 1; continue; }
      out.push(c); i += 1; continue;
    }
    /* mode === 'str' */
    if (c === '\\') { out.push(text.slice(i, i + 2)); i += 2; continue; }
    if (c === quote) { mode = 'code'; note('a'); out.push(c); i += 1; continue; }
    if (c === '\n' && quote !== '`') { mode = 'code'; note('a'); out.push('\n'); i += 1; continue; }
    out.push(c); i += 1;
  }
  return out.join('');
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordIn = (names, line) => names.some((name) => new RegExp(`(?<![\\w$.])${escapeRe(name)}(?![\\w$])`).test(line));
const callOf = (names, line) => names.some((name) => new RegExp(`(?<![\\w$.])${escapeRe(name)}\\s*\\(`).test(line));
const TOKENS = Object.values(SOURCES).map((s) => s.re.source.replace('(?<![\\w.-])', '')).join('|');
const CWD_READ = new RegExp(String.raw`\b(?:readFileSync|readFile|createReadStream|open|read_text|Path)\s*\(\s*(['"\x60])(?!/)(?:\./)?[^'"\x60]*?(?:${TOKENS})\1`);

function sourcesOn(line) {
  return Object.entries(SOURCES).filter(([, s]) => s.re.test(line)).map(([key]) => key);
}

/* A helper's body: the rest of the definition line, extended over the following lines only while
   a JS block is still open (at most 8 lines) or, in Python, while they stay indented under the
   def. Never the unrelated lines after it. */
function helperBody(lang, def, lines, index) {
  if (lang === 'py') {
    const indent = (lines[index].match(/^\s*/) || [''])[0].length;
    const body = [];
    for (const next of lines.slice(index + 1, index + 9)) {
      if (next.trim() && (next.match(/^\s*/) || [''])[0].length <= indent) break;
      body.push(next);
    }
    return body.join('\n');
  }
  const body = [def[3]];
  let depth = (def[3].match(/[{(]/g) || []).length - (def[3].match(/[})]/g) || []).length;
  const openEnded = !def[3].trim() || /(?:=>|[{(,])\s*$/.test(def[3]);
  for (let k = index + 1; (depth > 0 || (openEnded && k === index + 1)) && k < Math.min(lines.length, index + 9); k += 1) {
    body.push(lines[k]);
    depth += (lines[k].match(/[{(]/g) || []).length - (lines[k].match(/[})]/g) || []).length;
  }
  return body.join('\n');
}

function notLive(text) {
  if (TEMP_CALL.test(text)) return true;
  for (const m of text.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)) if (NOT_LIVE_STRING.test(m[2])) return true;
  return false;
}

/* Scan one file's text. Returns { sources, lines, usesState }: the governed files it reads
   live, the 1-based lines where it does, and whether it uses a review-state value. */
export function scanSource(relPath, text) {
  const lang = relPath.endsWith('.py') ? 'py' : 'js';
  const code = stripComments(text, lang);
  const lines = code.split('\n');
  const binding = lang === 'py'
    ? /^\s*([A-Za-z_]\w*)\s*(?::[^=]+)?=(?!=)\s*(.+)$/
    : /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.+)$/;
  const helperDef = lang === 'py'
    ? /^\s*def\s+([A-Za-z_]\w*)\s*\((.*)$/
    : /(?:\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|function\b[^(]*\([^)]*\))|\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\))\s*(.*)$/;
  const pathStart = lang === 'py'
    ? /^(?:(?:pathlib\.)?Path\(|os\.path\.(?:join|abspath|dirname|realpath)\(|os\.getcwd\(\)|[A-Za-z_]\w*(?:\.\w+)*\s*\/|[A-Za-z_]\w*\.(?:parent|parents|resolve)\b)/
    : /^(?:(?:path\.)?(?:join|resolve|dirname|normalize)\(|new URL\(|(?:url\.)?fileURLToPath\(|import\.meta\.(?:dirname|filename)|process\.cwd\(\)|__dirname)/;
  const bareString = /^(['"`])[^'"`]*\1\s*[;,)]?\s*$/;
  const READ_CALL = /\b(?:readFileSync|readFile|createReadStream|read_text|read_bytes|json\.load|open)\s*\(/;

  /* Three kinds of binding matter:
       roots   — a PATH into the real repository. Only a right-hand side that STARTS as a path
                 expression qualifies: a variable holding a file's contents or a loaded module is
                 not a path, even when the expression that produced it mentioned the root.
       names   — a bare string naming a governed file; live on any line that also reaches the
                 repository, and a served URL when it is handed to a request.
       helpers — a function whose own read resolves against the root.
     Bindings are file-wide, not scoped: a name bound to the root in one function and to a temp
     dir in another counts as the root. Writes are never reads, which covers the common case. */
  const roots = new Set();
  const helpers = new Set();
  const names = new Map();
  for (let pass = 0; pass < 3; pass += 1) {
    lines.forEach((line, index) => {
      const def = line.match(helperDef);
      if (def) {
        const name = def[1] || def[2];
        const body = helperBody(lang, def, lines, index);
        const read = body.match(new RegExp(`${READ_CALL.source}([\\s\\S]*)$`));
        if (name && read && (ROOTISH.test(read[0]) || wordIn([...roots], read[0])) && !notLive(read[0])) helpers.add(name);
        if (lang === 'js' && /=>|function/.test(line)) return;
      }
      const m = line.match(binding);
      if (!m) return;
      const [, name, rhsRaw] = m;
      const rhs = rhsRaw.trim();
      if (bareString.test(rhs)) {
        const named = sourcesOn(rhs);
        if (named.length) names.set(name, named);
        return;
      }
      if (notLive(rhs) || !pathStart.test(rhs)) return;
      if (ROOTISH.test(rhs) || wordIn([...roots], rhs)) roots.add(name);
    });
  }

  const found = new Set();
  const at = [];
  lines.forEach((line, index) => {
    const direct = sourcesOn(line);
    const viaName = [...names].filter(([name]) => wordIn([name], line)).flatMap(([, s]) => s);
    const named = [...new Set([...direct, ...viaName])];
    if (!named.length || notLive(line) || WRITE.test(line)) return;
    const reachesRepo = ROOTISH.test(line) || wordIn([...roots], line) || callOf([...helpers], line)
      || (direct.length && CWD_READ.test(line));
    const served = lang === 'js' && !ROUTE_CALL.test(line) && (STRONG_SERVED_CALL.test(line)
      || (WEAK_SERVED_CALL.test(line) && direct.some((key) => new RegExp(`/${SOURCES[key].re.source.replace('(?<![\\w.-])', '')}`).test(line))));
    if (!reachesRepo && !served) return;
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
