# Offline Shell + Qbank Session Capsule (Direction D, reduced) — design

**Date:** 2026-08-05
**Status:** Design — awaiting review
**Author:** Joshua Moss, MD (with Claude Code)
**Line anchors verified against:** `origin/main` @ `6a00a36` (post-#316). Re-derive anchors in a
fresh worktree before editing.
**Scope note:** Direction D's third component — the Ward Question Catcher — is specified
separately in `2026-08-05-ward-question-capture-design.md` (Cowork-authored) and is NOT covered
here. This spec covers **PR-1 (offline-first shell)** and **PR-3 (qbank session capsule)**.
Companion: `2026-08-05-shared-state-spine-design.md`. Merge order in §Sequencing binds all specs.

---

## Plain-language summary

The site currently assumes a desk and working Wi-Fi. On hospital guest networks it fails at
exactly the moments it exists for: a dead zone leaves the loading skeleton forever, and an
interrupted question session evaporates. PR-1 makes the whole non-media site load instantly and
work offline after the first visit. PR-3 makes an interrupted qbank session resumable — "3
questions left, ~2 min" — instead of gone.

## Problem

1. **Zero offline resilience.** No service worker or manifest exists anywhere in either build.
   The `nav.json` fetch has no `.catch` (`spa_index.html:898`) — offline first-load hangs the
   skeleton forever (the content fetch at `:895` and search degrade gracefully; nav does not).
2. **Interruption loses sessions.** A mid-session qbank exit loses queue position and the
   session summary; the only "resume" affordance (`cw_last`) is written for md pages only
   (`:1167`) and can never point at a tool.
3. **Hospital Wi-Fi fails by hanging** (captive portals, degraded APs), not by fast
   connection-refused — any offline strategy that waits out browser timeouts is worst-of-both.

## Scope decisions (YAGNI)

- **Daily Review needs no capsule** — every grade persists per-card to `cw_srs_v1` and the queue
  rebuilds from due-ness on load (`review.html`); the only loss is the same-session Again
  requeue. Accepted; documented; not built.
- **Deferred:** "I have N minutes" launcher (needs per-item duration data that no store
  captures — the capsule is where measurement would accrue later); audio pinning (iOS Range
  semantics need their own design); encounter loop / pocket cards / teach-one-thing / walk-mode
  audio (new attestation surfaces).

---

## PR-1: Offline-first shell

### Emission (build side)

New `common.py` helper `emit_service_worker(out_dir)`, called as the **last** artifact step in
BOTH builders — after `tool-governance.json` (`build_deploy.py:390`; end of
`resident_section.py`) — because the resident build copytrees the finished ms3 build then
deletes/adds/rebrands files: an inherited ms3 worker is silently wrong for res (same reason
`search-index.json` and `tool-governance.json` are re-emitted per site).

The helper walks the final publish dir and generates `sw.js` at **site root** (never `tools/` —
that directory is doubly gated by nav-orphan and inventory-count checks) from
`site_build/sw_template.js`, inlining:

```
const VERSION = '<sha256 over the sorted (path, content-hash) pairs of the PRECACHE SET ONLY>'[:12];
const PRECACHE = /*__PRECACHE_START__*/["/", "/nav.json", ...]/*__PRECACHE_END__*/;
```

- **Precache scope:** everything EXCEPT, by directory prefix, `audio/`, `audio_oe/`, `media/`,
  `anki/` (emitted after the build by `build_anki.sh` — not enumerable), plus
  `*.mp4|*.vtt|*.m4a|*.mp3|*.wav` anywhere, `sw.js` itself, `robots.txt`, `404.html`. Result:
  the ~3.7 MB / ~125-file shell+content+tools+JSON payload.
- **`/` ↔ `index.html` mapping is explicit**: the emitter writes `"/"` into PRECACHE (never
  `/index.html`), the worker's navigation fallback matches `"/"`, and the QA-gate existence
  check maps `"/"` → `index.html` — all three sides use one rule (the draft's ambiguity here
  would have made the gate fail its own emitter).
- **Version hash covers the precached set only** — CI/deploy-preview builds (LFS pointer stubs)
  must not spuriously change VERSION, and media is outside the SW entirely.
- **Build-time budget assertion:** emission fails if the precache payload exceeds 10 MB — the
  tripwire against media creeping into a precached directory.
- Deterministic output (sorted paths, content hashes, no timestamps) preserves the frozen-time
  byte-diff property.
- **Deviation from the brainstorm's "manifest beside nav.json":** the list embeds in `sw.js`
  so the worker byte-change IS the browser's update trigger; a sibling manifest adds an
  install-time fetch and a consistency race. The gate parses the list from between the
  `__PRECACHE_START__/__PRECACHE_END__` markers (JSON-parseable array literal).

### Worker behavior (`sw_template.js`, ~120 lines, ES5-ish, zero deps, no importScripts)

- **Install:** `cache.addAll(PRECACHE)` into `cw-precache-<VERSION>` — atomic; any 404 aborts
  install and the old version keeps serving. No `skipWaiting()` by default.
- **Activate:** delete all `cw-precache-*` except current.
- **Fetch, first check — media bypass:** pathname under `/audio/`, `/audio_oe/`, `/media/`, or a
  media extension → return without `respondWith` (browser-native Range handling; iOS
  `<audio>/<video>` breaks if a SW answers ranged requests from a cached 200). Cross-origin
  (sp-proxy) likewise untouched. This single rule also makes deploy-previews safe: pointer
  stubs are never cached.
- **Navigations:** network-first **raced against a ~3 s timeout** → cache fallback on `"/"`
  (`Promise.race`; hospital Wi-Fi fails by hanging — plain network-first would wait out the
  full browser timeout in exactly the target scenario). The SPA never changes URL path
  (`/?page=X`, `/?tool=X` via pushState, `:809`), so one cache key serves every route.
- **Everything else:** cache-first with `{ignoreSearch:true}` against the versioned cache
  (uniformly handles `/?page=`, `/tools/x.html?case=`, and `quizzes.json?v=<hash>` — within a
  version the content is immutable), network fallback with the same timeout race.
- **Update pickup** (deploys ~2×/week): `_headers` serves `/sw.js` with
  `max-age=0, must-revalidate`; a byte-changed worker installs in background. Shell listens for
  `updatefound` and shows a small dismissible toast — "Updated content available · Refresh" —
  which posts `SKIP_WAITING` and reloads on `controllerchange`. **Toast rules:** suppressed
  while a `?tool=` route is active (a reload mid-session destroys exactly what PR-3 protects;
  PR-3's question-boundary checkpoints make the reload safe once it lands — another reason for
  the merge order), and **re-arms every launch/session** (A2HS standalone users have no browser
  refresh button; a once-dismissed toast must not pin them to an old build forever).
- **Kill switch:** `SW_KILL=1` at build → the emitted worker's activate handler deletes all
  `cw-precache-*` and calls `registration.unregister()`. Per-site env in the Netlify UI +
  redeploy on BOTH sites; recipe documented in `GIT_AND_DEPLOY_PLAN.md`.

### Registration (shell side)

`SNIPPET_MARKERS["/*__SW_REGISTER__*/"] = "sw_register.js"`, marker once in `spa_index.html`
script 1 (never in tools — every iframe would re-register). First function line:
`function registerClerkshipSW(){` (31 chars, <60 per the signature-fragility rule; unique across
snippet files). Guards: `'serviceWorker' in navigator`; try/catch (iOS private mode); **skip
when `facultyPreviewRequest` is active** (the shell is legitimately iframed by the faculty
console, `spa_index.html:588-686`).

Also in PR-1:
- `.catch` on the `nav.json` fetch (`:898`) rendering a "Could not load — check your connection"
  retry block (parity with the content fetch's error handling at `:895`).
- One audience-neutral sentence + Share glyph on the Start page: "On iPhone: Share → Add to
  Home Screen keeps this site working offline." (A2HS also exempts the site from Safari's
  7-day script-storage eviction — which already threatens every `cw_*` key today.) Subject to
  the same audience-token ban and `RESIDENT_REBRAND` needle-collision test as all new shell copy.

### Headers, gate, tests

- **`_headers`:** add the `/sw.js` stanza inside the single string literal
  (`build_deploy.py:354`) and update the byte-pinned expected string in
  `tests/faculty-console-handler.test.mjs` (full-string `assert.equal` at `:483-520`; the
  extraction regex requires one double-quoted literal) **in the same PR**. No CSP change:
  no `worker-src` means fallback to `script-src 'self'`, which permits same-origin `/sw.js` —
  both CSP assertions stay untouched.
- **QA gate — new tri-state section** (7b precedent; SP fixture sites have neither artifact →
  `I()` skip): both `sw.js` and the registration marker present → validate: every PRECACHE
  entry exists (with the `/`→`index.html` mapping; HARD), no entry under media prefixes (HARD),
  payload ≤ budget (HARD), **and `sw.js` contains no `importScripts` or non-relative URL**
  (closes the "root JS is scan-blind" gap for the one root JS file we ship; HARD). Exactly one
  of the two present → HARD (partial wiring). **Deliberately zero new `S()` messages** — a new
  soft class ratchets under `other` (implicit baseline 0) and would hard-fail both sites.
- **Tests:** `test_common.py::TestServiceWorkerEmission` (tmp-dir emission: coverage, media
  exclusion, `/`-mapping, determinism, budget failure, kill mode); signature + <60-char pins
  for `sw_register.js`; new Playwright project `tests/smoke/offline.spec.js` — registered in
  `playwright.config.js`'s explicit `testMatch` arrays (unregistered specs are silently
  skipped) — load `/` → `navigator.serviceWorker.ready` → reload → `context.setOffline(true)`
  → navigate a `?page=` and a `?tool=` route → assert render. Existing smoke specs are
  structurally immune (fresh contexts, request fixture); no-skipWaiting-by-default avoids
  intra-test staleness. Smoke servers are `127.0.0.1` http = secure context, SW works.
- **Visual baselines:** the Start-page sentence renders inside `#content` on the start route —
  the `topic-*.png` baselines capture a topic page and `sidebar-*.png` captures `#side`;
  **no expected baseline change**, verify at PR time.

**Effort: 2.5–3 days.**

---

## PR-3: Qbank session capsule

### Store — `cw_sess_v1` (literal key at every call site)

```js
{ v:1, sessions:{ 'qbank':{
    at:<epoch ms>, expiresAt:<at + 24h>,
    queueIds:['qb_mood_001', ...], idx:N,
    responses:[{id, correct:0|1, confidence:'guess'|'likely'|'certain'}, ...] } } }
```

- **Checkpoint at question boundaries only** — written on advance/skip, deleted on session
  completion. Mid-question state (`confidence`, `tier1Key`, `state`, `displayOrder`,
  `tier2DisplayOrder`) is deliberately NOT captured: `showQuestion()` resets it on entry
  (`question-bank-practice.html:682-695`) and the display shuffles aren't reconstructable — a
  mid-question restore is structurally broken, so it is not attempted.
- **`responses` is captured** so a resumed session's summary covers the WHOLE session
  (`showSummary()` renders cert-accuracy and per-category bars from `SESSION.responses`,
  pushed at `:813/:821`) — without it a resumed summary silently describes only post-resume
  items. `remaining`/`responsesDone` are NOT stored — both derive from `queueIds`/`idx`
  (redundant fields that can disagree).
- **Expiry:** 24 h (a ward day). One tiny injected helper —
  `SNIPPET_MARKERS["/*__SESS_CAPSULE__*/"] = "sess_capsule.js"`, first function line
  `function sessLoad(tool){` (24 chars) — owns load-validate-expire; consumed by BOTH readers
  (shell home card + qbank) so two hand-rolled expiry copies can't drift. Body also defines
  `sessSave`/`sessClear`. Literal key lives only in the snippet body; wiring test enforces it.
- Writes go through the tool's `beginSession` funnel (`:655-669`), the single seam.

### Resume path

- **Home card:** "Resume question bank — N left, ~M min" (M = remaining × 45 s static estimate;
  duration measurement is the deferred launcher's job), deep-linking
  `?tool=question-bank-practice.html&resume=1` — rides `toolExtraFromParams`
  (`spa_index.html:586`, forwards every param except `tool`/`page`; verified no collision with
  the faculty-preview param validation). Zero shell routing changes.
- **On `resume=1`:** qbank rebuilds the queue from `queueIds` via `activeItems()`, dropping ids
  that no longer exist (deploy between checkpoint and resume), restores `idx` and
  `SESSION.responses`, and continues. Answered items were already persisted to
  `cw_qb_v1`/`cw_srs_v1` per interaction (`:819-820`) — the capsule stores position + session
  bookkeeping, never grading state: no double-write against the SM-2 stats contract.
- Mobile-bar "Resume" chip: deferred (the bar mounts only on md pages; extending its mount
  surface is its own change).

**Effort: ~1 day.** (Plus a small `tool_registry.json` `storageKeys` update for
question-bank-practice IF it is registered by then — as of `6a00a36` it is not among the 11
registered tools, and nothing pins its key list; verify at PR time.)

---

## Migration & rollback

All additive: one new `cw_*` key (`cw_sess_v1`) + two new snippet markers (`SW_REGISTER`,
`SESS_CAPSULE`), no version bumps to existing stores (the `cw_srs_v1` v-gate wipe hazard is never approached), no existing-record schema
changes. Rollback = revert; the SW additionally has the kill-switch build for already-registered
clients (per-site env, both sites).

## Sequencing (binds all three specs)

**(0)** Snippet-infrastructure PR — `phi_heuristic.js` + its `SNIPPET_MARKERS` entry + shell
marker (capture spec §Sequencing step 1) **+ `tests/parallel-ceilings.test.mjs`** (asserts
computed-key counts equal `qa-baseline.json` exactly and `SNIPPET_MARKERS` entry count equals a
pinned constant; every marker-adding PR bumps the constant in the same diff). Lands first and
alone. →
**(1)** This spec's PR-1 (offline shell; bumps marker constant for `SW_REGISTER`) →
**(2)** Shared-state PR-A →
**(3)** Ward capture (Cowork; largest shell diff, rebases onto a settled shell) →
**(4)** Shared-state PR-B, then this spec's PR-3 (bumps constant for `SESS_CAPSULE`) →
**one** visual-baseline refresh after the last `#side`-touching merge (capture's desktop mount).

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Stale-cache poisoning after deploys | High if unversioned | versioned atomic caches; must-revalidate sw.js; toast; kill switch |
| SW breaks media playback on iOS | High if mishandled | absolute media bypass (never respondWith) |
| Captive-portal hangs defeat offline fallback | Medium | 3 s timeout race on network paths |
| Update reload destroys a live session | Medium | toast suppressed on `?tool=` routes; PR-3 checkpoints; merge order |
| Fixture/CI gate breakage (third consumer class) | Medium | tri-state gate section; zero new soft classes; fixtures skip cleanly |
| Capsule resumes against a changed bank | Low | `activeItems()` filter drops missing ids |
| `_headers` byte-pin missed | Low | same-PR test update; named in the tracked-file boundary |

## Expected tracked-file boundary

```
13_Faculty_Resources/_automation/site_build/common.py            (emit helper + 2 markers)
13_Faculty_Resources/_automation/site_build/sw_template.js       (new)
13_Faculty_Resources/_automation/site_build/sw_register.js       (new)
13_Faculty_Resources/_automation/site_build/sess_capsule.js      (new, PR-3)
13_Faculty_Resources/_automation/site_build/build_deploy.py      (_headers literal + emit call)
13_Faculty_Resources/_automation/site_build/resident_section.py  (emit call at end)
13_Faculty_Resources/_automation/site_build/check-static-site.mjs (tri-state SW section)
13_Faculty_Resources/_automation/site_build/spa_index.html       (marker, nav .catch, start line, home card)
13_Faculty_Resources/_automation/site_build/question-bank-practice.html (PR-3 capsule wiring)
13_Faculty_Resources/_automation/site_build/test_common.py
13_Faculty_Resources/_automation/GIT_AND_DEPLOY_PLAN.md          (kill-switch recipe)
tests/faculty-console-handler.test.mjs                           (_headers pin update)
tests/parallel-ceilings.test.mjs                                 (PR-0; both marker bumps here)
tests/sess-capsule.test.mjs + sw-emission coverage in test_common.py
tests/smoke/offline.spec.js + tests/smoke/playwright.config.js   (register the project)
docs/superpowers/specs/2026-08-05-offline-shell-and-session-capsule-design.md (this file)
```
