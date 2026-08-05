# Snippet Infra + Offline Shell + Calibration Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the first three PRs of the merged design specs (#317): the shared snippet
infrastructure (PR-0), the offline-first service-worker shell (PR-1), and the calibration ledger
(PR-A) — in that order, each as its own reviewed, CI-green PR.

**Architecture:** All new shared logic ships as build-injected snippets via `common.py
SNIPPET_MARKERS` (the `sm2_apply_grade.js` pattern). The service worker is a per-site
build-emitted root artifact with an embedded precache list. The ledger is one new `cw_*` store
written by two existing tools and read by one home panel. Nothing bumps an existing store's
version.

**Tech Stack:** vanilla ES5 single-file HTML tools, Python build pipeline, dependency-free
`node:test` root suites, Playwright smoke, Netlify static hosting.

**Specs (authoritative):** `docs/superpowers/specs/2026-08-05-ward-question-capture-design.md`
(§D + tests T1–T3b only — the rest is Cowork's), `2026-08-05-offline-shell-and-session-capsule-design.md`
(PR-1 only), `2026-08-05-shared-state-spine-design.md` (PR-A only).

## Global Constraints

- One PR per group below; each merges before the next group starts (merge order is binding:
  PR-0 → PR-1 → PR-A; PR-B/capsule wait for Cowork's capture PR).
- Branch per PR off current `origin/main`; `gh pr create`; never push to main.
- localStorage: literal `cw_*` keys only, and ONLY inside snippet bodies where a spec says so.
  Zero new computed-key call sites — `qa-baseline.json` counts (`ms3` computed-key **6**, `res`
  **9**) are exact ceilings.
- Snippet rules: first stripped `function `-line is the dup-probe — keep it **<60 chars** and
  unique across ALL snippet files (existing: `function applyGrade(card, grade, opts){`); marker
  appears exactly once per consumer; never any marker in `_prototypes/sp-interview/**`.
- New learner-facing shell copy: audience-neutral (ban, case-insensitive:
  `MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford`) and must not contain any
  `RESIDENT_REBRAND` needle (`resident_section.py:116-125`).
- No new SOFT gate messages (a new class ratchets under `other` baseline-0 and hard-fails).
- Verification suite for every PR: 4 Python validators, `python3 …/test_common.py`,
  `python3 …/test_media_guard.py`, `node --test tests/*.test.mjs`, `node tests/contrast-check.mjs`,
  `bash …/build_and_check.sh ms3` AND `res`, `npm --prefix sp-proxy test` +
  `bash _prototypes/sp-interview/tests/run-all.sh` when anything the SP fixtures consume changes
  (the QA gate counts as such).
- All spec line anchors were verified against `origin/main` @ `6a00a36`; re-verify any anchor
  before editing (the tree may have moved).
- Commits end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

# PR-0 — Snippet infrastructure (branch `claude/snippet-infra`)

### Task 1: `phi_heuristic.js` + `SNIPPET_MARKERS` entry + shell marker + `test_common.py` pins

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/phi_heuristic.js`
- Modify: `13_Faculty_Resources/_automation/site_build/common.py` (SNIPPET_MARKERS, ~:509-511)
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html` (one marker line)
- Test: `13_Faculty_Resources/_automation/site_build/test_common.py` (TestSharedSnippets)

**Interfaces:**
- Produces: injected globals `PHI_PATTERNS` (array) and `looksLikePhi(t)→bool` in the built
  shell; marker string `/*__PHI_HEURISTIC__*/`; snippet signature `function looksLikePhi(t){`.

- [ ] **Step 1: Write failing test_common pins.** In `TestSharedSnippets` add, mirroring the
  existing applyGrade pin at `test_common.py:385`:

```python
    def test_phi_snippet_expands_with_short_signature(self):
        p = self._page("<script>\n/*__PHI_HEURISTIC__*/\n</script>")
        self.assertTrue(common.inject_shared_snippets(p))
        t = open(p, encoding="utf-8").read()
        self.assertIn("function looksLikePhi(t){", t)
        self.assertNotIn("/*__PHI_HEURISTIC__*/", t)

    def test_all_snippet_signatures_are_short_and_unique(self):
        # Whole-line signatures are exact-substring dup-probes (common.py _snippet_signature);
        # long ones silently degrade to no-ops when the file is rewrapped. Cap them.
        sigs = []
        for fname in common.SNIPPET_MARKERS.values():
            body = open(os.path.join(os.path.dirname(common.__file__), fname), encoding="utf-8").read()
            sig = common._snippet_signature(body)
            self.assertIsNotNone(sig, fname)
            self.assertLess(len(sig), 60, "%s signature too long: %r" % (fname, sig))
            sigs.append(sig)
        self.assertEqual(len(sigs), len(set(sigs)), "duplicate snippet signatures")
```

- [ ] **Step 2: Run — expect FAIL** (`phi_heuristic.js` missing / marker unknown):
  `python3 13_Faculty_Resources/_automation/site_build/test_common.py`
- [ ] **Step 3: Create `phi_heuristic.js`.** The `var PHI_PATTERNS=…` line must be
  **byte-identical** to `origin/main:_prototypes/sp-interview/sp-interview.html:222` (T3b in
  Task 2 pins this — copy it from `git show`, do not retype):

```js
/* Shared PHI heuristic — single source for shell consumers.
   Mirrors _prototypes/sp-interview/sp-interview.html:222-223, which KEEPS its inline copy:
   its test suite eval()s the SOURCE html (tests/smoke.test.js:4-17) and build injection never
   reaches source. tests/ward-capture.test.mjs T3b pins the PHI_PATTERNS line byte-identical
   in both files so they cannot drift. Injected via the PHI_HEURISTIC marker (see
   common.py SNIPPET_MARKERS). Function is reformatted multi-line so the dup-probe signature
   (first 'function ' line) stays short and stable — do not collapse to one line. */
var PHI_PATTERNS=[/\b\d{6,}\b/, /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/, /\bmrn\b/i, /\bmy patient\b/i, /\bdate of birth\b/i, /\bdob\b/i];
function looksLikePhi(t){
  for(var i=0;i<PHI_PATTERNS.length;i++){ if(PHI_PATTERNS[i].test(t)) return true; }
  return false;
}
```

- [ ] **Step 4: Add the marker entry** in `common.py` (keep dict order stable, append):

```python
SNIPPET_MARKERS = {
    "/*__SM2_APPLY_GRADE__*/": "sm2_apply_grade.js",
    "/*__PHI_HEURISTIC__*/": "phi_heuristic.js",
}
```

- [ ] **Step 5: Place the marker in the shell.** In `spa_index.html`, in the top-level
  (un-IIFE'd) script that owns `runSearch` (near `:976`, above `var SI=null`), add on its own
  line: `/*__PHI_HEURISTIC__*/` with a one-line comment above it noting the capture feature is
  its consumer (Cowork may relocate within the shell when implementing — the page contract only
  requires exactly-once).
- [ ] **Step 6: Run tests — expect PASS** (both new pins + all existing 40+):
  `python3 13_Faculty_Resources/_automation/site_build/test_common.py`
- [ ] **Step 7: Commit** `feat(build): shared PHI-heuristic snippet (PHI_HEURISTIC marker)`

### Task 2: `tests/ward-capture.test.mjs` — T3 standalone behavior + T3b drift guard

**Files:**
- Create: `tests/ward-capture.test.mjs`

**Interfaces:**
- Consumes: `phi_heuristic.js` from Task 1.
- Produces: the file Cowork's capture PR will extend with T4+; the byte-drift guard.

- [ ] **Step 1: Write the failing test file** (dependency-free `node:test`, source-only):

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNIPPET = path.join(ROOT, '13_Faculty_Resources/_automation/site_build/phi_heuristic.js');
const SP = path.join(ROOT, '_prototypes/sp-interview/sp-interview.html');

function loadHeuristic() {
  const body = fs.readFileSync(SNIPPET, 'utf8');
  return new Function(body + '; return looksLikePhi;')();
}

test('T3: shared heuristic passes the sp-interview fixtures plus ward cases', () => {
  const looksLikePhi = loadHeuristic();
  const cases = [
    ['MRN 4482913 patient in bed 4', true],
    ['my patient said the same thing yesterday', true],
    ['dob 3/14/1990', true],
    ['Have you had thoughts of killing yourself?', false],
    ['QTc over 500', false],
    ['lithium level 1.2', false],
  ];
  for (const [text, expected] of cases) assert.equal(looksLikePhi(text), expected, text);
});

test('T3b: PHI_PATTERNS line is byte-identical between the snippet and sp-interview source', () => {
  const pick = (src, file) => {
    const line = src.split(/\r?\n/).find((l) => l.startsWith('var PHI_PATTERNS='));
    assert.ok(line, `PHI_PATTERNS line missing in ${file}`);
    return line;
  };
  assert.equal(
    pick(fs.readFileSync(SNIPPET, 'utf8'), 'phi_heuristic.js'),
    pick(fs.readFileSync(SP, 'utf8'), 'sp-interview.html'),
    'edit both copies together — sp-interview cannot consume the marker (its tests eval source)',
  );
});
```

  Note T3 deliberately does NOT include `"room 302"` → true: the room/bed pattern is a
  capture-local addition in Cowork's PR, not part of the shared six (spec §P2 + T3b).
- [ ] **Step 2: Run — expect PASS immediately IF Task 1 done; verify RED first** by running the
  suite from a tree without Task 1's snippet (e.g. `git stash` the snippet, run, unstash) OR
  by asserting the suite fails when pointed at a bad copy: simplest — temporarily flip one
  expected boolean, observe FAIL, flip back. Run: `node --test tests/ward-capture.test.mjs`
- [ ] **Step 3: Commit** `test(phi): standalone heuristic behavior + byte-drift guard`

### Task 3: `tests/parallel-ceilings.test.mjs`

**Files:**
- Create: `tests/parallel-ceilings.test.mjs`

**Interfaces:**
- Produces: `EXPECTED_MARKER_COUNT` constant every marker-adding PR must bump in its own diff;
  a full-content pin of `qa-baseline.json`.

- [ ] **Step 1: Write the test:**

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Parallel-work ceilings. Two agents each individually green can make the SECOND merge fail:
// the qa-baseline computed-key counts are exact ceilings, and SNIPPET_MARKERS is a 3-line dict
// every snippet PR edits. This test turns both into a named PR-time failure. If you are here
// because it went red: you (or a concurrent PR) changed a shared ceiling — bump the pins below
// IN THE SAME DIFF as the change, after confirming the other agent's PRs in flight.

const EXPECTED_MARKER_COUNT = 2; // SM2_APPLY_GRADE, PHI_HEURISTIC — bump when adding a marker

test('SNIPPET_MARKERS entry count matches the pinned constant', () => {
  const src = fs.readFileSync(
    path.join(ROOT, '13_Faculty_Resources/_automation/site_build/common.py'), 'utf8');
  const block = src.match(/SNIPPET_MARKERS = \{([\s\S]*?)\n\}/);
  assert.ok(block, 'SNIPPET_MARKERS literal not found');
  const entries = block[1].match(/"\/\*__[A-Z0-9_]+__\*\/"\s*:/g) || [];
  assert.equal(entries.length, EXPECTED_MARKER_COUNT,
    `SNIPPET_MARKERS has ${entries.length} entries; bump EXPECTED_MARKER_COUNT in the same PR`);
});

test('qa-baseline.json matches the pinned ceilings exactly', () => {
  const actual = JSON.parse(fs.readFileSync(
    path.join(ROOT, '13_Faculty_Resources/_automation/site_build/qa-baseline.json'), 'utf8'));
  const expected = {
    ms3: { 'metadata': 1, 'computed-key': 6, 'legacy-metadata': 1 },
    res: { 'metadata': 1, 'computed-key': 9, 'legacy-metadata': 1 },
  };
  assert.deepEqual(actual, expected,
    'qa-baseline.json changed — a computed-key or soft-class ceiling moved; update this pin deliberately');
});
```

- [ ] **Step 2: Verify the baseline pin against the real file before trusting it** —
  `cat 13_Faculty_Resources/_automation/site_build/qa-baseline.json` and make `expected` match
  its exact current content (structure may differ from the sketch; the committed file is the
  source of truth — copy it verbatim into the test).
- [ ] **Step 3: Run — PASS; then prove teeth**: temporarily set `EXPECTED_MARKER_COUNT = 3`,
  observe named FAIL, restore. Run: `node --test tests/parallel-ceilings.test.mjs`
- [ ] **Step 4: Commit** `test(ci): parallel-work ceiling guards (markers + qa-baseline pin)`

### Task 4: PR-0 verification + PR

- [ ] **Step 1: Full verification suite** (Global Constraints list — including
  `run-all.sh`/sp-proxy since the built shell changed via injection).
- [ ] **Step 2:** `git push -u origin claude/snippet-infra` + `gh pr create` — body notes: no
  learner-visible change; PHI heuristic now build-injected into the shell; ceilings guard active;
  sp-interview untouched by design (eval-source constraint).

---

# PR-1 — Offline-first shell (branch `claude/offline-shell`, after PR-0 merges)

### Task 5: `sw_template.js` + `sw_register.js` + markers + pins

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/sw_template.js`
- Create: `13_Faculty_Resources/_automation/site_build/sw_register.js`
- Modify: `common.py` SNIPPET_MARKERS (+`/*__SW_REGISTER__*/`), `spa_index.html` (marker in
  script 1 near the theme/banner boot code ~`:470`), `tests/parallel-ceilings.test.mjs`
  (`EXPECTED_MARKER_COUNT` 2→3), `test_common.py` (signature pin for sw_register)

**Interfaces:**
- Produces: `sw_template.js` with `__VERSION__`, `__PRECACHE_START__/__PRECACHE_END__`, and
  `__KILL__` tokens for Task 6's emitter; injected `registerClerkshipSW()` invoked at load.

- [ ] **Step 1: Write `sw_template.js`** (ES5-ish, zero deps, no importScripts):

```js
/* Generated per-site by common.py emit_service_worker() — do not edit built copies.
   Template tokens: __VERSION__, __KILL__, and the PRECACHE array between markers. */
var VERSION='__VERSION__';
var KILL=__KILL__;
var PRECACHE=/*__PRECACHE_START__*/[]/*__PRECACHE_END__*/;
var CACHE='cw-precache-'+VERSION;
var MEDIA_PREFIX=['/audio/','/audio_oe/','/media/'];
var MEDIA_EXT=/\.(mp4|vtt|m4a|mp3|wav)$/i;
var NET_TIMEOUT_MS=3000;

function isMedia(pathname){
  if(MEDIA_EXT.test(pathname)) return true;
  for(var i=0;i<MEDIA_PREFIX.length;i++){ if(pathname.indexOf(MEDIA_PREFIX[i])===0) return true; }
  return false;
}
function raceNetwork(request){
  return new Promise(function(resolve,reject){
    var timer=setTimeout(function(){ reject(new Error('sw-timeout')); }, NET_TIMEOUT_MS);
    fetch(request).then(function(r){ clearTimeout(timer); resolve(r); },
                        function(e){ clearTimeout(timer); reject(e); });
  });
}

self.addEventListener('install', function(ev){
  if(KILL) return;
  ev.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(PRECACHE); }));
});
self.addEventListener('activate', function(ev){
  ev.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.map(function(k){
      if(k.indexOf('cw-precache-')===0 && (KILL || k!==CACHE)) return caches.delete(k);
    }));
  }).then(function(){ if(KILL && self.registration) return self.registration.unregister(); }));
});
self.addEventListener('message', function(ev){
  if(ev.data && ev.data.type==='SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', function(ev){
  if(KILL) return;
  var url=new URL(ev.request.url);
  if(url.origin!==self.location.origin) return;         /* sp-proxy etc: browser-native */
  if(isMedia(url.pathname)) return;                     /* Range semantics: never respondWith */
  if(ev.request.mode==='navigate'){
    ev.respondWith(raceNetwork(ev.request).catch(function(){
      return caches.open(CACHE).then(function(c){ return c.match('/'); });
    }));
    return;
  }
  ev.respondWith(caches.open(CACHE).then(function(c){
    return c.match(ev.request,{ignoreSearch:true}).then(function(hit){
      return hit || raceNetwork(ev.request);
    });
  }));
});
```

- [ ] **Step 2: Write `sw_register.js`** (first function line
  `function registerClerkshipSW(){`, <60 chars, unique):

```js
/* Service-worker registration + update toast. Injected via SW_REGISTER marker (shell only —
   never tools: each iframe would re-register). Toast is suppressed on ?tool= routes (a reload
   mid-session destroys session state) and re-arms every page load (A2HS users have no refresh
   affordance). Kill/rollback: see GIT_AND_DEPLOY_PLAN.md (SW_KILL=1 rebuild). */
function registerClerkshipSW(){
  try{
    if(!('serviceWorker' in navigator)) return;
    if(typeof facultyPreviewRequest!=='undefined' && facultyPreviewRequest) return;
    navigator.serviceWorker.register('/sw.js').then(function(reg){
      reg.addEventListener('updatefound', function(){
        var w=reg.installing; if(!w) return;
        w.addEventListener('statechange', function(){
          if(w.state!=='installed' || !navigator.serviceWorker.controller) return;
          if(new URLSearchParams(location.search).get('tool')) return;
          var t=document.createElement('div');
          t.className='sw-toast';
          t.setAttribute('role','status');
          t.innerHTML='Updated content available · ';
          var b=document.createElement('button'); b.type='button'; b.textContent='Refresh';
          b.addEventListener('click', function(){ w.postMessage({type:'SKIP_WAITING'}); });
          var x=document.createElement('button'); x.type='button'; x.textContent='Later';
          x.setAttribute('aria-label','Dismiss update notice');
          x.addEventListener('click', function(){ if(t.parentNode) t.parentNode.removeChild(t); });
          t.appendChild(b); t.appendChild(x); document.body.appendChild(t);
        });
      });
      var reloaded=false;
      navigator.serviceWorker.addEventListener('controllerchange', function(){
        if(reloaded) return; reloaded=true; location.reload();
      });
    }).catch(function(){});
  }catch(_){ }
}
registerClerkshipSW();
```

  Plus a `.sw-toast` CSS rule in the shell (fixed bottom-center, `z-index:31`, Clinical Warm
  vars, both themes) — added in the same `spa_index.html` edit as the marker.
- [ ] **Step 3:** marker entry, marker placement (script 1 — the boot script that owns the
  banner/theme init near `:470`; must be able to see `facultyPreviewRequest`, verify the
  variable's scope and if it lives in script 2, guard via
  `document.documentElement.hasAttribute('data-fac-preview')` equivalent — check how the shell
  marks preview mode and adapt the guard, documenting the choice in the snippet comment),
  ceilings bump 2→3, `test_common.py` expand pin (`function registerClerkshipSW(){`).
- [ ] **Step 4:** `python3 …/test_common.py` + `node --test tests/parallel-ceilings.test.mjs`
  green. **Commit** `feat(shell): service-worker registration snippet + update toast`

### Task 6: `emit_service_worker()` + builder calls + emission tests

**Files:**
- Modify: `common.py` (new helper), `build_deploy.py` (call after tool-governance emission,
  ~`:390`), `resident_section.py` (call at very end, after its tool-governance re-emission)
- Test: `test_common.py::TestServiceWorkerEmission`

**Interfaces:**
- Produces: `<out_dir>/sw.js` per site; `emit_service_worker(out_dir, kill=None)` reading env
  `SW_KILL`.

- [ ] **Step 1: Failing tests first** (tmp-dir fixture site with a fake tool, a fake
  `audio/x.m4a`, `index.html`, `nav.json`):

```python
class TestServiceWorkerEmission(unittest.TestCase):
    def _site(self):
        d = tempfile.mkdtemp(); self.addCleanup(shutil.rmtree, d, True)
        os.makedirs(os.path.join(d, "tools")); os.makedirs(os.path.join(d, "audio"))
        open(os.path.join(d, "index.html"), "w").write("<!doctype html>x")
        open(os.path.join(d, "nav.json"), "w").write("[]")
        open(os.path.join(d, "tools", "t.html"), "w").write("<!doctype html>t")
        open(os.path.join(d, "audio", "a.m4a"), "w").write("fake-lfs-bytes")
        return d

    def test_emits_precache_excluding_media_with_root_mapping(self):
        d = self._site(); common.emit_service_worker(d)
        sw = open(os.path.join(d, "sw.js"), encoding="utf-8").read()
        pre = json.loads(sw.split("/*__PRECACHE_START__*/")[1].split("/*__PRECACHE_END__*/")[0])
        self.assertIn("/", pre); self.assertNotIn("/index.html", pre)
        self.assertIn("/nav.json", pre); self.assertIn("/tools/t.html", pre)
        self.assertTrue(all("/audio/" not in p for p in pre))
        self.assertNotIn("/sw.js", pre)

    def test_version_is_deterministic_and_media_independent(self):
        d = self._site(); common.emit_service_worker(d)
        v1 = open(os.path.join(d, "sw.js")).read().split("VERSION='")[1].split("'")[0]
        open(os.path.join(d, "audio", "a.m4a"), "w").write("different-bytes")
        common.emit_service_worker(d)
        v2 = open(os.path.join(d, "sw.js")).read().split("VERSION='")[1].split("'")[0]
        self.assertEqual(v1, v2)
        open(os.path.join(d, "nav.json"), "w").write("[1]")
        common.emit_service_worker(d)
        v3 = open(os.path.join(d, "sw.js")).read().split("VERSION='")[1].split("'")[0]
        self.assertNotEqual(v1, v3)

    def test_budget_failure_and_kill_mode(self):
        d = self._site()
        open(os.path.join(d, "big.json"), "wb").write(b"0" * (11 * 1024 * 1024))
        with self.assertRaises(SystemExit): common.emit_service_worker(d)
        os.remove(os.path.join(d, "big.json"))
        common.emit_service_worker(d, kill=True)
        self.assertIn("var KILL=true;", open(os.path.join(d, "sw.js")).read())
```

- [ ] **Step 2: Implement `emit_service_worker`** in `common.py`: walk `out_dir`; exclude by
  prefix (`audio/`, `audio_oe/`, `media/`, `anki/`), media extensions
  (`.mp4 .vtt .m4a .mp3 .wav`), `sw.js`, `robots.txt`, `404.html`; map `index.html`→`"/"`,
  everything else →`"/"+relpath` (posix separators); sort; VERSION =
  `sha256("\n".join(f"{p}:{sha256(bytes)}") for precached files)[:12]`; budget: sum of
  precached byte sizes ≤ 10 MB else `sys.exit("sw precache budget exceeded …")`; read the
  template beside `common.py`, substitute `__VERSION__`, `__KILL__`
  (`true` if `kill or os.environ.get("SW_KILL")=="1"` else `false`), and the array between the
  markers; write `sw.js`. No timestamps.
- [ ] **Step 3:** tests PASS. Add the two builder calls (last artifact step in each). Rebuild
  both sites; confirm `_build/ms3/sw.js` + `_build/res/sw.js` exist, differ (res has rp-*
  tools), and each parses. **Commit** `feat(build): emit per-site service worker with embedded precache`

### Task 7: `_headers` stanza + faculty-console-handler pin update

**Files:**
- Modify: `build_deploy.py:354` (single string literal — keep it ONE double-quoted literal; the
  test's extraction regex requires that), `tests/faculty-console-handler.test.mjs` (full-string
  `assert.equal` ~`:483-520`)

- [ ] **Step 1:** Append to the `_headers` literal:
  `\n/sw.js\n  Cache-Control: public, max-age=0, must-revalidate\n` (match the file's existing
  stanza formatting exactly — read the literal first).
- [ ] **Step 2:** Run `node --test tests/faculty-console-handler.test.mjs` — observe the
  full-string FAIL, update the expected string to the new literal, re-run → PASS. (RED first is
  the point: it proves the pin still has teeth.)
- [ ] **Step 3:** **Commit** `feat(deploy): sw.js must-revalidate header (+pin update)`

### Task 8: QA-gate tri-state SW section

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/check-static-site.mjs` (new section
  after 7b, same tri-state pattern)

**Interfaces:**
- Consumes: `sw.js` emitted by Task 6; injected `registerClerkshipSW` body in `index.html`.

- [ ] **Step 1:** Implement, HARD/I() only (zero new S() classes):
  - Neither `sw.js` exists NOR `registerClerkshipSW(` appears in `index.html` → `I('sw: not
    present — section skipped (fixture or pre-SW site)')`.
  - Exactly one present → `H('sw: partial wiring — sw.js and shell registration must ship together')`.
  - Both present: parse the PRECACHE array between the markers (JSON.parse; unparsable → H);
    every entry must exist on disk (`"/"` maps to `index.html`; else H naming the entry); no
    entry may start with a media prefix or match the media-extension regex (H); sum of entry
    file sizes ≤ 10 MB (H); `sw.js` must not contain `importScripts` and must not match
    `/https?:\/\//` outside the leading comment block (H — closes the root-JS scan blindness
    for this one file).
- [ ] **Step 2: Fault-injection verification** (the Task-13 lesson — the gate has three
  consumer classes): (a) both builds pass; (b) scratch-copy `_build/ms3`, delete one precached
  file → H fires; add `importScripts('x')` to sw.js → H fires; revert; (c) run the gate against
  a minimal fixture dir (no sw.js) → I() skip, exit 0; (d)
  `bash _prototypes/sp-interview/tests/run-all.sh` green (fixture suite);
  (e) `GITHUB_ACTIONS=true` run on a stub-media copy → no new failures.
- [ ] **Step 3:** **Commit** `feat(qa-gate): tri-state service-worker integrity section`

### Task 9: shell edits + offline smoke + wrap-up

**Files:**
- Modify: `spa_index.html` (nav.json `.catch` at ~`:898`; Start-page A2HS line), `tests/smoke/playwright.config.js`
  (register new spec in a project's explicit `testMatch`), `13_Faculty_Resources/_automation/GIT_AND_DEPLOY_PLAN.md`
  (kill-switch recipe)
- Create: `tests/smoke/offline.spec.js`
- Create: `tests/shell-copy.test.mjs` — audience-token ban + rebrand-needle collision for the
  A2HS sentence and toast strings.

- [ ] **Step 1:** nav fetch gains `.catch` rendering the same error block pattern as `:895`'s
  content fetch ("Could not load the navigation — check your connection and refresh."), into
  `#nav`.
- [ ] **Step 2:** Start page (renderStart) gains one line + Share glyph:
  "On iPhone: Share → Add to Home Screen keeps this site working offline." — audience-neutral.
- [ ] **Step 3:** `tests/shell-copy.test.mjs`: extract the A2HS line + toast strings from
  `spa_index.html`/`sw_register.js` source; assert none matches
  `/MS3|clerkship|student|shelf|resident|UNE|MMC|Sanford/i`; assert none contains any needle
  from `RESIDENT_REBRAND` (parse the needle list from `resident_section.py` source). RED-check
  by temporarily inserting "MS3" into the toast string; restore.
- [ ] **Step 4:** `tests/smoke/offline.spec.js` — new Playwright project `offline` (register in
  config `testMatch`): load `/`; `await page.evaluate(() => navigator.serviceWorker.ready)`;
  reload; `context.setOffline(true)`; `page.goto('/?page=t_mood.md')` renders content;
  `page.goto('/?tool=mse.html')` renders the tool iframe; `context.setOffline(false)`.
- [ ] **Step 5:** Kill-switch recipe into GIT_AND_DEPLOY_PLAN.md: set `SW_KILL=1` env in BOTH
  Netlify site UIs → trigger deploys → every client unregisters + clears `cw-precache-*` on
  next visit; unset to re-enable.
- [ ] **Step 6: full verification** (Global Constraints list + `cd tests/smoke && npx
  playwright test --project=offline` locally-runnable check; note visual baselines are NOT
  expected to change — verify `sidebar-*.png` untouched by diffing screenshots if smoke visual
  project runs).
- [ ] **Step 7:** Push + `gh pr create` (branch `claude/offline-shell`).

---

# PR-A — Calibration ledger (branch `claude/calib-ledger`, after PR-1 merges)

### Task 10: `calib_log.js` snippet + behavior tests + pins

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/calib_log.js`
- Modify: `common.py` (marker `/*__CALIB_LOG__*/`), `tests/parallel-ceilings.test.mjs` (3→4),
  `test_common.py` (signature pin `function calibLog(evt){`)
- Create: `tests/calib-ledger.test.mjs`

**Interfaces:**
- Produces: injected `calibLog(evt)` and `calibRead()→{v,qb:[],rev:[]}`; store `cw_calib_v1`
  (literal key only inside the snippet body).

- [ ] **Step 1: failing behavior tests** (`new Function` + `memStorage()` stub — copy the stub
  pattern from `tests/sm2-behavior.test.mjs`; `Date.now` monkeypatched try/finally): pin —
  append qb/rev routing by `evt.s`; per-source ring trim at 400 (401st qb event evicts qb[0],
  rev untouched); v-reset on `{v:2}`; enum rejection (unknown `s`/`p` → no write, no throw);
  `calibRead()` returns the empty shape on absent/corrupt store; literal key check (the string
  `cw_calib_v1` appears in the snippet source exactly as a quoted literal).
- [ ] **Step 2: implement `calib_log.js`:**

```js
/* Calibration ledger cw_calib_v1 — append-only judgment-vs-outcome history. Enum fields +
   existing ids ONLY; no free text ever (PHI firewall is structural). cw_qb_v1 stays the
   current-state store; this is the history store; no reader joins both into one number
   (spec: 2026-08-05-shared-state-spine-design.md). Writers: qbank qbRecord (re flag),
   review.html grade() (sug/rq). cw_practice_events_v1 remains reserved for sim process
   events — a different thing. */
function calibLog(evt){
  try{
    var S={qb:['guess','likely','certain'],rev:['Again','Hard','Good','Easy']};
    if(!evt || !S[evt.s] || S[evt.s].indexOf(evt.p)<0) return;
    var d=null;
    try{ d=JSON.parse(localStorage.getItem('cw_calib_v1')||'null'); }catch(_e){ d=null; }
    if(!d || d.v!==1 || !Array.isArray(d.qb) || !Array.isArray(d.rev)) d={v:1,qb:[],rev:[]};
    var ring=d[evt.s==='qb'?'qb':'rev'];
    ring.push(evt);
    while(ring.length>400) ring.shift();
    localStorage.setItem('cw_calib_v1', JSON.stringify(d));
  }catch(_){ }
}
function calibRead(){
  try{
    var d=JSON.parse(localStorage.getItem('cw_calib_v1')||'null');
    if(d && d.v===1 && Array.isArray(d.qb) && Array.isArray(d.rev)) return d;
  }catch(_){ }
  return {v:1,qb:[],rev:[]};
}
```

- [ ] **Step 3:** tests PASS; ceilings bump; test_common pins; run both Python + node suites.
- [ ] **Step 4:** **Commit** `feat(build): calibration-ledger snippet (CALIB_LOG marker)`

### Task 11: qbank writer + wiring test

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/question-bank-practice.html` (marker +
  one call in `qbRecord`, ~`:214`)
- Create: `tests/calib-wiring.test.mjs`

- [ ] **Step 1:** In `qbRecord` — BEFORE overwriting `data[item.id]`, read the prior record to
  compute `re`: `var prev=data[item.id]; var re=(prev&&prev.ts&&(new Date(prev.ts)).toDateString()===(new Date()).toDateString())?1:0;`
  After the existing write + `certWrong` logic, call
  `calibLog({s:'qb',id:item.id,pages:item.pages||[],p:confidence,a:correct?1:0,t2:twoTierResult||null,re:re,ts:Date.now()});`
  (`qbRecord` already receives `twoTierResult` — currently unused — and is only reachable
  post-`reviewOnly` guard at `:812-818`; do not add another guard.)
- [ ] **Step 2:** `tests/calib-wiring.test.mjs`: marker exactly once in the tool source; no
  local `function calibLog(`; literal `'cw_calib_v1'` absent from all consumer sources (it may
  exist ONLY in `calib_log.js`); the qbank call site passes `t2:` and `re:` (regex pins).
- [ ] **Step 3:** run suites; build ms3; grep built tool for the injected body. **Commit**
  `feat(qbank): log confidence-vs-outcome events to the calibration ledger`

### Task 12: Daily Review writer

**Files:**
- Modify: `07_Evidence_and_Reading/Landmark_Trials/review.html` (marker + `grade()` edit,
  ~`:180-199`, suggestion lift from `:240-243`)
- Test: extend `tests/calib-wiring.test.mjs`

- [ ] **Step 1:** In the session view, compute `var sug = gotIt ? 'Good' : 'Again';` once and
  use it BOTH for the existing `sug` CSS class AND the event. Track a session-local
  `var gradedThisSession = {};` — `rq = gradedThisSession[card.id] ? 1 : 0;` set after first
  grade. In `grade(g)`:
  `calibLog({s:'rev',id:card.id,p:GRADE_NAMES[g]||g,sug:sug,a:gotIt?1:0,rq:rq,ts:Date.now()});`
  (adapt to the actual grade representation at the call site — `GRADE_NAMES` maps 0-3;
  verify before editing). `cw_srs_v1.stats` writes are untouched; add one sentence to the
  `sm2_apply_grade.js` header pointing history logging at `cw_calib_v1`.
- [ ] **Step 2:** wiring pins: marker once; suggestion variable feeds both consumers (regex:
  `className` usage references the same `sug` variable); no local `calibLog`.
- [ ] **Step 3:** suites + res build (review ships both sites). **Commit**
  `feat(review): log chosen-vs-suggested grades to the calibration ledger`

### Task 13: home metacognition panel + erase + export

**Files:**
- Modify: `spa_index.html` (marker in script 2 near `renderHome`; panel function with
  deliberate slice markers; `exportStudy` v2), `07_Evidence_and_Reading/Landmark_Trials/review.html`
  (`resetAll` confirm + `removeItem('cw_calib_v1')`)
- Create: `tests/calib-panel.test.mjs`

- [ ] **Step 1: failing panel test** — slice `spa_index.html` between
  `/* ---- calib panel ---- */` and `/* ---- end calib panel ---- */`, evaluate with a
  synthetic ledger via stubbed `calibRead`: pin — returns `''` under 20 qb events (fallback);
  ≥20: renders per-confidence bars ONLY for bins with n≥5 counting `re===0` events; the
  confidently-wrong count comes from a stubbed `cw_qb_v1` (`certWrong` records), NOT the
  ledger; divergence line counts unique id/day where `sug==='Again'&&p!=='Again'`.
- [ ] **Step 2: implement** `renderCalibPanel()` inside the slice markers; `renderHome`
  replaces the existing `calibrationSummary()` section with the panel's output when non-empty,
  else keeps the legacy card; one-sentence activation copy ("Counts every attempt, not just
  your latest — numbers may differ from the earlier summary."). Do not disturb the
  `dueBreakdown` slice region (`tests/srs-home-counters.test.mjs`).
- [ ] **Step 3:** `exportStudy`: add `calib:safeLS('cw_calib_v1')`, bump schema literal to
  `'clerkship-study-v2'`; `resetAll` confirm text gains "This also clears your calibration
  history." + `localStorage.removeItem('cw_calib_v1')`.
- [ ] **Step 4:** suites; both builds; verify `spa-shell-a11y` + `srs-home-counters` green
  (frozen regions untouched). **Commit** `feat(home): calibration metacognition panel + export v2 + erase path`

### Task 14: PR-A verification + PR

- [ ] **Step 1:** Full verification suite (Global Constraints list; run-all.sh included — the
  gate/shell changed).
- [ ] **Step 2:** Push `claude/calib-ledger` + `gh pr create` — body discloses: `re`/`rq`
  semantics, export schema bump v1→v2 (additive superset), panel activation threshold and the
  legacy-summary fallback, no baseline refresh expected.

---

## Held until Cowork's capture PR merges (separate short plan then)

PR-B (phase policy: `phase_policy.js`, BOTH `review.html` new-card call sites via one helper,
`userSet` flag, post-shelf state, home chip) and D/PR-3 (qbank session capsule:
`sess_capsule.js`, question-boundary checkpoints, `resume=1`). Their specs are complete
(`2026-08-05-shared-state-spine-design.md` §PR-B, `…offline-shell-and-session-capsule…` §PR-3);
only their line anchors and the ceilings-test constants need re-derivation at that point.
