import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = path.join(ROOT, '13_Faculty_Resources', '_automation', 'site_build');

// Offline-shell copy (A2HS sentence + service-worker update toast) is the first shell text
// that ships identically to BOTH sites — unlike page content, it is never routed through
// resident_section.py's RESIDENT_REBRAND rewrite. That makes two failure modes possible that
// no other test catches:
//   1. audience-specific wording (MS3/clerkship/resident/etc.) baked into shared shell copy —
//      wrong for whichever site reads it literally.
//   2. a shared-copy string that happens to contain a RESIDENT_REBRAND "from" needle — since
//      apply_verified_replacements() does a plain text.replace() over the whole built page,
//      an accidental substring match would silently mutate shell copy that was never meant to
//      be rewritten (or, if the needle is required-once elsewhere, the count assumption breaks).
//
// SCOPE, as of Plan 3 Task 8: the set is spa_index.html + sw_register.js + phase_policy.js +
// EVERY frontdoor/*.js module. The modules are where nearly all learner-facing copy now lives, and
// all of it ships to both sites unrewritten; before this task they carried headers citing this
// file by name while nothing here read them. Exactly one front-door string is exempt — the header
// attribution, which IS rebranded per site — and that exemption is itself tested (see
// REBRANDED_ATTRIBUTION).

const AUDIENCE_TOKEN_RE = /MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i;

const FRONTDOOR_DIR = path.join(BUILD_DIR, 'frontdoor');

// *** THE ONE EXEMPTION, AND IT IS NOT A HOLE. ***
// fd_shell.js emits the header attribution, which names its audience on purpose: it is REBRANDED
// per site by a RESIDENT_REBRAND needle anchored on `class="fd-attrib"`, exactly as the deleted
// sidebar's `<div class="by">` was. Adding it to the extracted set would go red and read as a
// genuine audience leak, and the obvious "fix" — neutering the text — would silently delete the
// resident site's attribution. So it is exempt HERE and covered THERE: the test below fails if the
// needle ever stops existing, which is the only condition under which this string would become a
// real leak. fd_shell.js carries the same warning at the emission site.
const REBRANDED_ATTRIBUTION = 'MS3 Clerkship · Joshua Moss, MD';

function extractShellCopy() {
  const shell = fs.readFileSync(path.join(BUILD_DIR, 'spa_index.html'), 'utf8');
  const swRegister = fs.readFileSync(path.join(BUILD_DIR, 'sw_register.js'), 'utf8');

  const strings = {};

  // The A2HS sentence. Its anchor moved from `<p class="sub st-a2hs">` (renderStart, deleted with
  // the sidebar in Plan 3 Task 3) to `.fd-a2hs` at the foot of the Progress page, where Task 5
  // rehomed it. The COPY is byte-identical to the deleted line; only its host changed.
  const a2hs = shell.match(/<p class="fd-a2hs">([^<]*)<\/p>/);
  assert.ok(a2hs, 'A2HS sentence not found at .fd-a2hs in spa_index.html');
  strings['A2HS sentence'] = a2hs[1];

  // Ward question-capture copy (P1 warning, P2 interstitial, P3 disclosure, P4 clipboard stamp).
  // These are the whole PHI enforcement surface — there is no automated PHI check in build or CI —
  // and they ship verbatim to both sites, so they must be audience-neutral and must not collide
  // with a RESIDENT_REBRAND needle. Extracted by role, like the sw_register literals below.
  const capWarn = shell.match(/<p class="cap-warn">([\s\S]*?)<\/p>/);
  assert.ok(capWarn, 'capture P1 warning not found in spa_index.html');
  strings['capture P1 warning'] = capWarn[1].replace(/<[^>]*>/g, '');

  const capDisclose = shell.match(/<p class="cap-disclose">([^<]*)<\/p>/);
  assert.ok(capDisclose, 'capture P3 disclosure not found in spa_index.html');
  strings['capture P3 disclosure'] = capDisclose[1];

  const capPhi = shell.match(/<div class="cap-phi"[^>]*>'\s*\+\s*'([\s\S]*?)'\s*\+\s*'/);
  assert.ok(capPhi, 'capture P2 interstitial not found in spa_index.html');
  strings['capture P2 interstitial'] = capPhi[1].replace(/<[^>]*>/g, '');

  // Anchored on the CAP_STAMP declaration rather than the `lines=[...]` literal it used to be
  // inlined into: the stamp is now shared with the home triage card's framing, so the constant
  // is the stable source. Both strings ship verbatim to both sites.
  const capStamp = shell.match(/var CAP_STAMP='([^']*)'/);
  assert.ok(capStamp, 'capture P4 clipboard stamp not found in spa_index.html');
  strings['capture P4 clipboard stamp'] = capStamp[1];

  // Home triage-card framing. Same contract as the sheet copy above — it restates the no-PHI
  // norm on the one capture surface that previously carried none, so it belongs in this set.
  const capPurpose = shell.match(/var CAP_PURPOSE='([^']*)'/);
  assert.ok(capPurpose, 'capture home-card purpose line not found in spa_index.html');
  strings['capture home-card purpose'] = capPurpose[1];

  const capAria = shell.match(/aria-label="(Your question[^"]*)"/);
  assert.ok(capAria, 'capture textarea aria-label not found in spa_index.html');
  strings['capture textarea aria-label'] = capAria[1];

  // The capture ENTRY POINT's label is no longer extracted here by id: #captureBtnDesk and its
  // mobile twin went with the sidebar chrome, and fd_due.js's fdCaptureButton() ([data-fd-capture])
  // is the front door's replacement. It needs no bespoke anchor any more — the frontdoor sweep
  // below reads every string that module renders, this one included.

  // sw_register.js update-toast copy: innerHTML/textContent literals + the dismiss aria-label.
  // Extracted by role rather than a blanket string dump, so code identifiers (function names,
  // message types, CSS classes) never get swept in as if they were learner-facing copy.
  const innerHtmlLiterals = [...swRegister.matchAll(/\.innerHTML\s*=\s*'([^']*)'/g)].map((m) => m[1]);
  const textContentLiterals = [...swRegister.matchAll(/\.textContent\s*=\s*'([^']*)'/g)].map((m) => m[1]);
  const ariaLabelLiterals = [...swRegister.matchAll(/setAttribute\('aria-label'\s*,\s*'([^']*)'\)/g)].map(
    (m) => m[1],
  );

  assert.ok(innerHtmlLiterals.length >= 1, 'expected at least one innerHTML toast literal in sw_register.js');
  assert.ok(textContentLiterals.length >= 2, 'expected Refresh + Later button literals in sw_register.js');
  assert.ok(ariaLabelLiterals.length >= 1, 'expected the dismiss aria-label literal in sw_register.js');

  innerHtmlLiterals.forEach((s, i) => { strings[`sw toast innerHTML #${i}`] = s; });
  textContentLiterals.forEach((s, i) => { strings[`sw toast textContent #${i}`] = s; });
  ariaLabelLiterals.forEach((s, i) => { strings[`sw toast aria-label #${i}`] = s; });

  // Rotation phase-policy labels (phase_policy.js) — the six phasePolicy() branches' shipped
  // copy (unset/post/taper/consolidate/interleave/encode). These reach BOTH sites verbatim
  // via the /*__PHASE_POLICY__*/ marker — no RESIDENT_REBRAND rewrite pass touches them —
  // so they must be audience-neutral ("Exam", never "Shelf" per the file's own copy-rule
  // comment) and needle-free, exactly like the shell/toast copy above.
  const phasePolicySrc = fs.readFileSync(path.join(BUILD_DIR, 'phase_policy.js'), 'utf8');
  extractPhasePolicyLabels(phasePolicySrc).forEach((s, i) => { strings[`phase-policy label #${i}`] = s; });

  // frontdoor/*.js — added Plan 3 Task 8, and the reason is that eight of these modules ALREADY
  // carried a "Copy rule: ... audience-neutral ... (tests/shell-copy.test.mjs)" header, and one
  // (fd_state.js) named this file outright, while this extractor read only spa_index.html and
  // sw_register.js. The modules now render essentially every learner-facing string on the front
  // door — the header, the wizard, Today, Path, Library, the reader, search, the safety sheet —
  // and every one of them ships to BOTH sites unrebranded. Until this sweep existed, the comments
  // credited a test with enforcement it did not perform.
  Object.assign(strings, extractFrontdoorCopy());

  return strings;
}

// Enumerated from disk rather than hand-listed, so a module added later inherits the ban.
function frontdoorSources() {
  const names = fs.readdirSync(FRONTDOOR_DIR).filter((n) => n.endsWith('.js')).sort();
  assert.ok(names.length >= 10,
    `expected the frontdoor module set, found ${names.length} — did the directory move?`);
  return names.map((n) => [n, fs.readFileSync(path.join(FRONTDOOR_DIR, n), 'utf8')]);
}

// A small quote/comment/regex-aware lexer, not a regex sweep — and the regex arm is the whole
// reason it exists. A naive scanner that only knows quotes and comments hits fdEsc()'s
// `.replace(/'/g,'&#39;')` in fd_data.js, reads that lone `'` as a string opener, and from there
// every subsequent quote is off by one: comment prose starts arriving as if it were shipped copy
// and shipped copy stops arriving at all. That failure is SILENT and it fails OPEN (the extracted
// set is garbage but non-empty), which is why extractFrontdoorCopy() is pinned below by a
// positive-content test naming real strings from real modules.
const REGEX_PRECEDERS = '(,=:[!&|?{};+-*%~^<>';
function jsStringLiterals(src) {
  const out = [];
  let i = 0, prev = '';
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2; continue;
    }
    // Regex literal vs division, decided by the previous significant character.
    if (c === '/' && (prev === '' || REGEX_PRECEDERS.includes(prev))) {
      i++;
      let inClass = false;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        else if (src[i] === '\n') break;
        else if (src[i] === '/' && !inClass) break;
        i++;
      }
      i++; prev = '/'; continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      let buf = '';
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') { buf += src[i + 1]; i += 2; continue; }
        buf += src[i]; i++;
      }
      i++; out.push(buf); prev = quote; continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

// Extracted BY ROLE, exactly like the sw_register.js literals above — never a blanket dump of
// every string, which would sweep class names, data-attributes and storage keys in as if they were
// learner-facing copy (and 'cw_shelf_date' alone would then fail the scan forever). Three roles:
//   - HTML text nodes: whatever sits between a `>` and a `<` inside a markup literal;
//   - the four attributes a user can actually hear or read (aria-label, title, placeholder, alt);
//   - bare prose fragments: a literal with no markup at all that carries a space and none of
//     `{}=_` — which is what separates 'Continue · Week ' or ' opened' (shipped) from
//     'cw_shelf_date', '.fd-searchpanel__input' or '?page=' (code).
function frontdoorStrings(src) {
  const out = [];
  for (const lit of jsStringLiterals(src)) {
    if (/[<>]/.test(lit)) {
      for (const m of lit.matchAll(/(?:^|>)([^<>]*)(?:<|$)/g)) {
        const text = m[1].trim();
        if (text) out.push(text);
      }
      for (const m of lit.matchAll(/\b(?:aria-label|title|placeholder|alt)="([^"]*)"/g)) out.push(m[1]);
    } else if (/\s/.test(lit) && !/[{}=_]/.test(lit) && lit.trim().length >= 3) {
      out.push(lit);
    }
  }
  return out;
}

function extractFrontdoorCopy() {
  const strings = {};
  for (const [name, src] of frontdoorSources()) {
    frontdoorStrings(src).forEach((s, i) => {
      if (s === REBRANDED_ATTRIBUTION) return;   // see the constant's comment
      strings[`${name} copy #${i}`] = s;
    });
  }
  return strings;
}

// Extracted as its own function (source passed in, not read internally) so the RED-teeth
// check below can run it against an in-memory-mutated variant of the source without ever
// writing to disk — same in-memory-only discipline as tests/ward-capture.test.mjs's T3b-teeth.
//
// Four of the six labels (taper/consolidate/interleave/encode) are built by string
// concatenation, e.g. `'Exam in '+days+' day'+(days===1?'':'s')+' — taper new cards,
// review daily.'` — capturing only the first quoted segment (`label:'([^']*)'`, the shape
// used for the single-literal sw_register.js toast strings) would reduce all four to
// "Exam in " and silently skip everything after the first `+`, which is exactly where a
// "Shelf" typo would live. So: grab the WHOLE `label:` expression up to the return object's
// closing `}` (no label expression contains a literal `}`), then pull out and join every
// single-quoted segment inside it, reassembling the full shipped text.
function extractPhasePolicyLabels(src) {
  const exprs = [...src.matchAll(/label:([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(exprs.length >= 6, `expected >=6 label:... expressions in phase_policy.js, found ${exprs.length}`);
  return exprs.map((expr) => [...expr.matchAll(/'([^']*)'/g)].map((m) => m[1]).join(''));
}

function extractResidentRebrandNeedles() {
  const src = fs.readFileSync(path.join(BUILD_DIR, 'resident_section.py'), 'utf8');
  const start = src.indexOf('RESIDENT_REBRAND=[');
  assert.ok(start > -1, 'RESIDENT_REBRAND literal not found in resident_section.py');
  const end = src.indexOf('\n]', start);
  assert.ok(end > start, 'could not find the end of the RESIDENT_REBRAND list');
  const block = src.slice(start, end);
  // Every tuple element is a single-quoted Python string literal (no embedded apostrophes in
  // this list as of writing); pull all of them out — both "from" and "to" sides — so a shell
  // copy string colliding with either half of a rebrand pair is caught.
  const needles = [...block.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
  assert.ok(needles.length >= 10, `expected >=10 quoted needles in RESIDENT_REBRAND, found ${needles.length}`);
  return needles;
}

test('shared shell copy (A2HS sentence + SW toast + capture) is audience-neutral', () => {
  const strings = extractShellCopy();
  for (const [label, value] of Object.entries(strings)) {
    assert.doesNotMatch(
      value,
      AUDIENCE_TOKEN_RE,
      `${label} contains an audience-specific token: ${JSON.stringify(value)}`,
    );
  }
});

test('shared shell copy has zero RESIDENT_REBRAND needle collisions', () => {
  const strings = extractShellCopy();
  const needles = extractResidentRebrandNeedles();
  for (const [label, value] of Object.entries(strings)) {
    for (const needle of needles) {
      assert.ok(
        !value.includes(needle),
        `${label} (${JSON.stringify(value)}) collides with RESIDENT_REBRAND needle ${JSON.stringify(needle)}`,
      );
    }
  }
});

// Positive-content pin: prove extractPhasePolicyLabels() reassembles the FULL text of the
// four concatenation-built labels, not just the first quoted fragment. Without this, the
// >=6-count guard alone would stay green even if extraction silently regressed back to
// `label:'([^']*)'` (first-fragment-only) — the exact bug a prior draft of this guard shipped
// with, where taper/consolidate/interleave/encode all reduced to "Exam in " and everything
// after their first `+` (including where a "Shelf" typo would live) went unchecked.
test('phase-policy label extraction reassembles the full text of concatenated labels, not just the first fragment', () => {
  const labels = extractPhasePolicyLabels(fs.readFileSync(path.join(BUILD_DIR, 'phase_policy.js'), 'utf8'));
  assert.equal(labels.length, 6, `expected exactly 6 phase-policy labels, found ${labels.length}`);
  assert.match(labels[2], /taper new cards/, 'taper label tail missing — extraction regressed to first-fragment-only');
  assert.match(labels[3], /consolidate: fewer new cards/, 'consolidate label tail missing — extraction regressed to first-fragment-only');
  assert.match(labels[4], /mix topics as you practice/, 'interleave label tail missing — extraction regressed to first-fragment-only');
  assert.match(labels[5], /steady building/, 'encode label tail missing — extraction regressed to first-fragment-only');
});

// ---- the frontdoor sweep's own guards ---------------------------------------------------------
// The sweep fails OPEN if the lexer breaks (a mis-parse yields a wrong-but-non-empty set), so it
// needs a positive-content pin. These are real strings from four different modules, chosen to
// cover all three extraction roles: a text node, an aria-label, a title attribute, and a bare
// prose fragment. If the lexer regresses, at least one of them stops arriving.
test('the frontdoor copy sweep actually reaches the shipped strings (extraction health)', () => {
  const values = Object.values(extractFrontdoorCopy());
  const expected = [
    'Inpatient Psychiatry',                                   // fd_shell.js  — text node
    'Sections',                                               // fd_shell.js  — aria-label (the tab nav)
    'Dark mode',                                              // fd_shell.js  — aria-label + title
    'Close — you’ll land exactly where you were',             // fd_sheet.js  — title attribute
    'Not yet faculty-reviewed — verify with faculty.',        // fd_sheet.js  — text node
    '+ Capture a question',                                   // fd_due.js    — the capture entry point
    'Symptom, drug, tool, or task…',                          // fd_search.js — placeholder
    '· exam day — good luck',                                 // fd_state.js  — bare prose fragment
  ];
  for (const s of expected) {
    assert.ok(values.includes(s), `frontdoor sweep did not extract ${JSON.stringify(s)}`);
  }
  assert.ok(values.length >= 120,
    `expected the full front-door copy set, extracted only ${values.length} strings`);
  // The sharpest signal that the lexer lost its place, and the one a count alone misses: comment
  // PROSE arriving as if it were copy. Measured, not guessed — the longest real front-door string
  // is 59 characters (the modules build markup by concatenation, so literals stay short), while the
  // shortest paragraph a mis-lexed fd_data.js produces is over 3000. If a future string genuinely
  // needs more than 120, check the extraction first and raise this second.
  const longest = values.reduce((a, b) => (a.length > b.length ? a : b), '');
  assert.ok(longest.length <= 120,
    `extracted a ${longest.length}-character string — the lexer has swallowed a comment: `
    + `${JSON.stringify(longest.slice(0, 100))}…`);
});

test('every frontdoor module that claims the copy rule is actually covered by the sweep', () => {
  const swept = new Set(Object.keys(extractFrontdoorCopy()).map((k) => k.split(' copy #')[0]));
  for (const [name, src] of frontdoorSources()) {
    if (!/Copy rule:/.test(src)) continue;
    assert.ok(swept.has(name),
      `${name} states a copy rule in its header but the sweep extracted nothing from it`);
  }
});

// The exemption's other half. REBRANDED_ATTRIBUTION is allowed to name its audience ONLY because
// resident_section.py rewrites it per site; if that needle is ever dropped, the string becomes a
// real leak that the sweep is no longer watching for. This is the test fd_shell.js's own comment
// asks for by name ("assert that the needle exists in resident_section.py").
test('the one exempted front-door string is genuinely rebranded per site', () => {
  const shellSrc = fs.readFileSync(path.join(FRONTDOOR_DIR, 'fd_shell.js'), 'utf8');
  assert.ok(shellSrc.includes(REBRANDED_ATTRIBUTION),
    'the exemption names a string fd_shell.js no longer emits — delete the exemption instead');
  const residentSrc = fs.readFileSync(path.join(BUILD_DIR, 'resident_section.py'), 'utf8');
  const start = residentSrc.indexOf('RESIDENT_REBRAND=[');
  const end = residentSrc.indexOf('\n]', start);
  assert.ok(start > -1 && end > start, 'RESIDENT_REBRAND list not found in resident_section.py');
  const block = residentSrc.slice(start, end);
  assert.ok(block.includes(`<span class="fd-attrib">${REBRANDED_ATTRIBUTION}</span>`),
    'the exempted attribution has no RESIDENT_REBRAND needle — it would ship to the resident site '
    + 'verbatim, which is exactly the leak this suite exists to catch');
});

test('the frontdoor sweep actually rejects a planted audience token (RED-check, in-memory only)', () => {
  // Planted in a TEXT NODE of a real module, in memory — the same in-memory-only discipline the
  // phase-policy teeth test uses. "This week" is a heading fd_today.js renders on every visit.
  const realSrc = fs.readFileSync(path.join(FRONTDOOR_DIR, 'fd_today.js'), 'utf8');
  const mutated = realSrc.replace('>This week</h2>', '>This clerkship week</h2>');
  assert.notEqual(mutated, realSrc, 'the replace() must have matched, or this test proves nothing');
  const hit = frontdoorStrings(mutated).find((s) => AUDIENCE_TOKEN_RE.test(s));
  assert.equal(hit, 'This clerkship week', 'the planted token must be the string that trips');
  assert.throws(() => {
    frontdoorStrings(mutated).forEach((s) => assert.doesNotMatch(s, AUDIENCE_TOKEN_RE));
  }, /AssertionError/, 'the audience-token guard must fail closed on a frontdoor module');
});

// Guard the guard: the two assertions above only mean something if they can actually fail.
// This test proves the audience-token check has teeth by running it against a deliberately
// bad string (equivalent to what you'd get by hand-inserting "MS3" into a toast literal) and
// confirming it throws — the manual version of this (editing sw_register.js, running
// `node --test tests/shell-copy.test.mjs`, observing a real failure, then reverting) was done
// once during authoring; this keeps that guarantee under CI rather than trusting a one-time
// manual check.
test('the audience-token guard actually rejects a banned token (RED-check)', () => {
  assert.throws(() => {
    assert.doesNotMatch('Updated content available for MS3 students', AUDIENCE_TOKEN_RE);
  }, /AssertionError/);
});

test('the RESIDENT_REBRAND collision guard actually rejects a needle match (RED-check)', () => {
  const needles = extractResidentRebrandNeedles();
  const poisoned = 'On iPhone: ' + needles[0] + ' keeps this offline.';
  assert.throws(() => {
    assert.ok(!poisoned.includes(needles[0]));
  }, /AssertionError/);
});

// Phase-policy label guard has teeth: mutate one label in-memory (never touching disk — the
// Task 4 lesson: a prior draft's teeth test wrote to disk on every CI run and was rewritten
// as pure in-memory string comparison instead) to plant the exact banned word the file's own
// copy-rule comment calls out ("Exam, never Shelf"), run it back through the real extraction
// regex, and confirm the audience-token guard actually trips on it.
//
// Deliberately planted in the TAPER label's TAIL fragment (' — taper new cards, review
// daily.'), not the 'post' label — 'post' is one of the two single-literal labels, so a
// mutation there would pass under EITHER extraction shape (fixed or the first-fragment-only
// bug this guard originally shipped with) and would prove nothing about whether the
// concatenated labels are actually covered. The taper label's first quoted segment
// ('Exam in ') is left untouched by this mutation; only a correct full-expression extraction
// ever sees the tail where the "Shelf" typo lands.
test('the audience-token guard actually rejects a "Shelf" planted in a concatenated phase-policy label\'s tail (RED-check, in-memory only)', () => {
  const realSrc = fs.readFileSync(path.join(BUILD_DIR, 'phase_policy.js'), 'utf8');
  const mutated = realSrc.replace(
    " — taper new cards, review daily.'",
    " — Shelf new cards, review daily.'",
  );
  assert.notEqual(mutated, realSrc, 'the replace() must actually have matched something, or this test proves nothing');

  const labels = extractPhasePolicyLabels(mutated);
  const hit = labels.find((s) => AUDIENCE_TOKEN_RE.test(s));
  assert.ok(hit, 'expected the planted "Shelf" (in the taper label\'s tail fragment) to be present among the extracted labels');
  assert.match(hit, /Exam in /, 'sanity: the tripped label should still carry its untouched leading fragment, confirming full reassembly (not a fluke first-fragment match)');
  assert.throws(() => {
    labels.forEach((s) => assert.doesNotMatch(s, AUDIENCE_TOKEN_RE));
  }, /AssertionError/, 'the audience-token guard must fail closed when a concatenated phase-policy label\'s tail is corrupted');
});
