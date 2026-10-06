# Faculty console: surface the pending pages, then make attesting one hop

**Date:** 2026-09-04 · **Author:** Claude (Cowork) for Joshua Moss, MD · **Status:** approved for implementation, PR-gated
**Site:** `https://clerkship-faculty-attest.netlify.app/` (Netlify site id `295ae8dd-412c-47ad-aac3-7e7cd4b3110d`)
**Scope:** `faculty-console/` only (+ one CI check + README). No learner-site build changes. No new Netlify env vars required.

## 0. What is actually wrong (verified, not assumed)

| Fact | Evidence |
|---|---|
| The console is up and the key gate is configured | `GET /` → 200; `GET /api/attest` (no header) → **401** (a missing `FACULTY_ATTEST_PASSWORD` returns 500) |
| `reviewed.json` has **24 pending** items (102 reviewed / 126) | `git show origin/main:13_Faculty_Resources/reviewed.json` |
| **0 of the 24 pending items are in `site_manifest.json`** | 22 are `cotw_<date>_<topic>_{ms3,res}.md`; 2 are `_prototypes/` tools (`rp-agitation.html`, `rp-brief-psych.html`) |
| The console's content universe is `manifest.md ∪ manifest.tools` and nothing else | `attest.mjs` → `buildContentItems(reviewed, manifest)` iterates only `manifest.md` and `manifest.tools` |
| The learner build *deliberately* bypasses the manifest for Case-of-the-Week | `build_deploy.py` L284-292: `md += [... for w in cotw_registry.json weeks]`; `resident_section.py` L59-63 does the same for `_res` |
| All 91 manifest items are already `reviewed` | so "Needs review" shows **only questions** — exactly the screenshot |
| `app.mjs` (4,012 lines) has no deep-linking | `grep URLSearchParams\|location.hash\|replaceState` → 0 hits |
| `attest/pending` is 300 behind / **0 ahead** of `main` | harmless: a merely-behind branch fast-forwards on the next write (`ensureBranchFresh`) |

**Root cause (Item 0):** `cotw_registry.json` became a second source of truth for what ships (2026-07), but the faculty console — and `validate_attestation_consistency.py` — still read only `site_manifest.json`. Every COTW page generated since is invisible to attestation.

## 1. Deliverables

Four items, one PR, in this order. Items A–C depend on 0; B depends on A.

### Item 0 — Pending pages appear in the queue (the bug)

**Change:** in `faculty-console/netlify/functions/attest.mjs`, derive the content universe the same way the builds do.

1. `buildState()` additionally reads `08_Cases_and_Simulation/case-of-the-week/cotw_registry.json` from the attestation branch (same `repository.read` path as the manifest; return its `sha` as `registryRevision`).
2. New pure function `deriveContentUniverse({ manifest, registry })` → ordered list of `{ slug, title, kind, site }` where:
   - `manifest.md` → `kind:'page', site:'ms3'`; `manifest.tools` → `kind:'tool', site:'ms3'` (unchanged behaviour)
   - each registry week `w` → `{ slug: cotw_<YYYYMMDD>_<topic>_ms3.md, title: w.label + ' — MS3', kind:'page', site:'ms3' }` and `{ ... _res.md, title: w.label + ' — Resident', kind:'page', site:'res' }`. Slug formula must be **byte-identical** to `_cotw_slug()` in `build_deploy.py`: `"cotw_%s_%s_%s.md" % (date.replace("-",""), topic, level)`.
   - Reject duplicates and any registry week missing `date`, `topic`, `label` with `repository_file_invalid` (502), matching `requireManifest`'s posture.
3. Put `deriveContentUniverse` in a new shared module `faculty-console/content-universe.mjs` (imported by the function; unit-testable without Netlify), following the `review-model.mjs` / `qbank-rules.mjs` pattern.
4. Every content item the API returns gains `site: 'ms3' | 'res'`. `normalizeReviewItems` in `review-model.mjs` carries it through (`TypeError` if absent/invalid).
5. **Resident preview:** add `RESIDENT_SITE_URL` env var, **defaulting in code** to `https://mmc-psychiatry-residents-sanford.netlify.app` (so no Netlify UI change is needed). `buildPreviewRequest` / `buildExternalReviewUrl` pick the base by `item.site`. Verify the resident build's `_headers` carries `frame-ancestors 'self' https://clerkship-faculty-attest.netlify.app` (it is written by `build_deploy.py` L508; confirm `resident_section.py` does not overwrite it). If it does not, do **not** patch the learner build in this PR — the console's existing failed-preview path ("Open learner surface (new tab)" + separate-tab acknowledgement) still permits attestation; note it in the PR body as a follow-up.
6. **The two `_prototypes/` tools are out of scope.** They are not deployed on any learner site, and their own `reviewed.json` reason says they await *completion*, not review. Exclude them via an explicit, documented allowlist constant `NOT_REVIEWABLE_IN_CONSOLE = ['rp-agitation.html', 'rp-brief-psych.html']` so the CI invariant below stays green and the exclusion is visible in code, not implicit.
7. Mirror the same universe in `13_Faculty_Resources/_automation/validate_attestation_consistency.py` (`manifest_items` at L770-775) so it stops treating COTW slugs as unknown. Keep its existing behaviour for everything else. If this widens into more than ~20 lines, stop and leave it as a follow-up in the PR body — the console is the deliverable.

**Acceptance (machine-verifiable):**
- `node --test faculty-console/*.test.mjs` includes `content-universe.test.mjs` proving: (a) 69 md + 22 tools + 2×11 registry weeks = **113** items from the current fixtures; (b) slug formula matches a fixture generated by running the Python `_cotw_slug` over the same registry; (c) malformed registry → 502.
- New CI + `bin/verify.sh` step `node faculty-console/check_pending_visible.mjs` that loads `reviewed.json`, `site_manifest.json`, `cotw_registry.json` and **fails if any `status:"pending"` key is absent from the console universe** and not in `NOT_REVIEWABLE_IN_CONSOLE`. This is the invariant that would have caught this bug in July.
- Playwright `tests/smoke/faculty-console.spec.js`: with the synthetic repo extended to include a registry, the queue shows page items for both `_ms3` and `_res` twins under "Needs review", and selecting a `_res` item requests a preview whose origin is the resident base.
- Post-deploy, human: Josh opens the console → "Needs review · All types" lists **22 pages** + the questions.

### Item A — Deep links and pending-first landing

**Change (app.mjs + review-model.mjs):**
1. Accept `?item=<key>` on load, where `<key>` is exactly an item key (`page:<slug>` | `tool:<slug>` | `question:<id>`). Validate with the same `key === \`${type}:${identity}\`` rule already in `buildPreviewRequest`; anything else is ignored silently (no error UI, no reflection of the value into the DOM).
2. If the console is locked when a deep link arrives, keep the requested key in memory (not `sessionStorage`), unlock as usual, then select it. If the key is not in the loaded queue, show one neutral notice ("That item is not in the current queue") and fall back to the default selection.
3. When the reviewer selects an item, `history.replaceState` updates `?item=` so the address bar is always a shareable link to the current item. Never place the faculty key, review token, or reviewer name in the URL — README rule, unchanged.
4. Default filters on a fresh load stay `status = needs-review`, `type = all` (already the case — confirm, do not regress). Add a one-line queue summary above the selector: "N pages · N tools · N questions need review" from `deriveReviewCounts`.
5. A **Copy link** button beside the item selector copies the current deep link.

**Acceptance:**
- Unit: `parseDeepLink(search, items)` in `review-model.mjs` — valid key → item; unknown key → null; injection strings (`<`, `javascript:`, 3 KB payload) → null; tested.
- Playwright: load `/?item=page:cotw_20260831_catatonia_ms3.md` on a locked console, enter key → that item is selected and its preview requested; load with a bogus key → default selection and the neutral notice; select another item → `location.search` updates.
- Grep gate in the test: no `reviewToken`, `x-faculty-key`, or attester string ever appears in `location.href` after any action (assert in the spec after each step).

### Item B — "Attest this page" bookmarklet

**Change (app.mjs + index.html):** in the unlocked header, a small "Review from the learner site" disclosure containing a draggable bookmarklet link and a copyable version for mobile.

Bookmarklet logic (must be self-contained, ≤ 600 chars after minification, no external fetch):
- Read `page` or `tool` from `location.search` of the current learner tab (that is how `buildExternalReviewUrl` addresses pages: `?page=<slug>` / `?tool=<slug>`).
- If found, `window.open('https://clerkship-faculty-attest.netlify.app/?item=' + encodeURIComponent(kind + ':' + slug))`.
- If not found (e.g. the SPA route has no `?page=`), fall back to opening the console root — never guess a slug.
- Hard-code the console origin from `location.origin` of the console itself at render time, so a preview deploy generates a bookmarklet pointing at that preview.

**Acceptance:**
- Unit: `buildBookmarklet(consoleOrigin)` returns a `javascript:` URL that, evaluated in a jsdom window with `location.search='?page=x.md'`, calls `window.open` with `.../?item=page%3Ax.md`; with `?tool=y.html` → `tool%3Ay.html`; with neither → console root.
- Playwright: the disclosure renders only when unlocked; the link's `href` starts with `javascript:` and contains the console origin.
- Human: Josh drags it to the bookmarks bar once, opens any learner page, clicks it → lands on that item.

### Item C — Twin-aware navigation for Case-of-the-Week pairs

Design constraint: the standing rule "page/tool attestations always write only the selected slug" (README §How it works, and the server's single-slug write path) **stays**. C halves the *finding* cost, not the judgment — a one-press "attest both" would be a governance change Josh has not made, so it is explicitly **not** built.

**Change (review-model.mjs + app.mjs):**
1. `twinOf(item, items)`: for a page whose slug matches `/^cotw_\d{8}_[a-z0-9-]+_(ms3|res)\.md$/`, return the item with the other suffix if present in the queue, else null.
2. In the rail, a **Pair** badge: "Twin: <title> · <Needs review | Reviewed>" with a **Go to twin** button (deep-link navigation within the console, not a new tab).
3. After a successful page attestation, if the twin exists and still needs review, the console advances to the **twin** instead of "next pending in the filtered queue". If not, existing behaviour.
4. Queue ordering: keep `compareItems` alphabetical by title, but COTW titles already sort twins adjacently (`<label> — MS3`, `<label> — Resident`) — confirm in the test; do not add a custom sort.

**Acceptance:**
- Unit: `twinOf` on the 22-item fixture returns the correct partner for all 22 and null for a non-COTW page and for a COTW page whose twin is absent.
- Playwright: attest a synthetic `_ms3` item → selection moves to its `_res` twin and the twin's preview is requested; attest a non-COTW page → previous "next pending" behaviour.

## 2. Non-goals (do not do in this PR)

- Any change under `13_Faculty_Resources/_automation/site_build/` (learner builds), `cotw_registry.json`, or `reviewed.json` content.
- Attesting both twins in one press (see C).
- Passkey / magic-link login; weekly digest email; the `_prototypes/` tools.
- Touching `attest/pending`, `reviewed.json` history, or the GitHub PAT.

## 3. Working rules for the implementer (from project memory — these are load-bearing)

1. **Two machines.** The Cowork `device_bash` shell is a VM that mounts the repo; git/gh/netlify/LFS commands run on the Mac via Desktop Commander `start_process` (real zsh). Editing and grepping can happen in the VM.
2. `git fetch origin && git status -sb` first; branch from `origin/main`; name it `claude/faculty-console-pending-pages-deeplinks`.
3. **Never commit the 106 phantom LFS media "changes"** that show as modified only in the VM. Stage files by name.
4. Never `--no-verify`. The pre-push hook runs `bin/verify.sh` (~90 s+): run it on the Mac in the background (`nohup bash bin/verify.sh > /tmp/verify.log 2>&1 &`) and poll. If a gate fails, check it on clean `main` before assuming it is yours. `verify.sh` writes `13_Faculty_Resources/_automation/generated/evidence_drill_review.json` — delete it before committing.
5. `CLAUDE.md` and `AGENTS.md` must stay byte-identical if either is touched (`cp CLAUDE.md AGENTS.md`).
6. Node: CI uses 20; local Node 22 is the verified Playwright fallback (25 stalls). Playwright faculty project needs the learner site on :4200 and the console on :4202 (README §Local browser verification).
7. Open the PR with `gh pr create`; **do not merge**. Josh reviews. PR body: the verified-facts table above, the acceptance checklist with each item ticked by a command output, and any follow-ups (resident `_headers`, `validate_attestation_consistency.py`).
8. Update `faculty-console/README.md`: the "How it works" universe sentence, new env var `RESIDENT_SITE_URL` (optional, default given), the deep-link and bookmarklet sections, the Pair behaviour, and the `NOT_REVIEWABLE_IN_CONSOLE` note.

## 4. Human review gates

| Gate | Who | What they check |
|---|---|---|
| PR review | Josh | The verified-facts table matches his experience; acceptance evidence pasted; no learner-build files in the diff |
| Post-deploy check | Josh | Console shows 22 pending pages; `?item=` deep link lands; bookmarklet works from one learner page; attesting one `_ms3` case advances to its `_res` twin |
| Standing decision (unchanged) | Josh | One attestation per press; the console never writes to `main` directly |

## 5. Rollback

The console is a no-build static site with two functions; reverting the PR redeploys the previous behaviour in ~20 s. No data migration: `reviewed.json`, the registry, and the manifest are untouched.
