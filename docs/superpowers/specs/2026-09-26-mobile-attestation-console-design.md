# Mobile attestation console — design

**Status:** approved in conversation 2026-09-26; spec for review before the implementation plan.
**Date:** 2026-09-26 · **Owner:** Joshua Moss, MD · **Depends on:** nothing merged; builds beside the desktop console and the dark ADR-003 ledger.

## 1. The problem

The faculty attestation console (`faculty-console/`) is a desktop workbench. Its layout is a four-column grid with 11–22 rem column minimums and no media query, so at a phone's width it cannot be used at all. Its flow is also desktop-shaped: after every **Attest** press the browser reloads the entire console state (`GET /api/attest`, about 16 sequential GitHub calls and 1.5 MB of JSON) before it will show the receipt, then rebuilds the whole page. On a phone network that is the difference between signing between patients and not signing.

The owner's stated job for the phone is **full review**: read the learner page or tool as a learner sees it, then attest it, one item per press, with the same governance as the desktop.

Two facts fix the shape of any solution:

- The learner sites accept embedding **only from the console's origin** (`https://clerkship-faculty-attest.netlify.app`). A phone client that wants the learner page on screen must be served from that same site.
- The server already does the governance: it hashes the page as it stands on `main`, writes exactly the slugs it is given, and refuses anything else. A phone client adds no rule and removes none.

## 2. Decision

A **second, phone-first front-end at `/m/` on the same Netlify site**, talking to the same `/api/attest` function and reusing the console's shared modules. It is not a rewrite of the desktop console and not a native app. It is added to the home screen as a web app.

In scope:

- Sign in with the same faculty key (session only).
- A queue of items that need review, grouped the way the desktop's *Re-sign by change* already groups them.
- An item screen that shows the **learner page itself** full-screen through the existing preview-token protocol, with **What changed**, **Open in site** and **Attest**.
- A confirm step naming the item and the reviewer; a receipt from the write itself; auto-advance.
- Questions shown **read-only**: the saved draft text with **Attest**; no editing.
- One server change: the attest write returns the row it wrote, so no client needs the confirming reload.

Out of scope, deliberately: editing question text, the *Attest together* tray, remembering the key across sessions, any change to how the learner sites accept embedding, and per-person attribution (the console records every sign-off under the single server-side `ATTESTER_NAME`; fixing that is a separate governance change).

## 3. Architecture

```
phone ── https://clerkship-faculty-attest.netlify.app/m/ ── m/index.html + m/m.mjs
            │  x-faculty-key header (sessionStorage, tab only)
            ▼
        /api/attest  (netlify/functions/attest.mjs — unchanged rules)
            │  GET            → queue state (once per session, refreshed in background)
            │  GET ?view=changes → groups for the queue
            │  GET ?view=diff&slug= → What changed
            │  POST {target:'content', changes:{slug:true}} → {ok, commit, row, pullRequest}
            ▼
        attest/pending (or the ledger, when ATTEST_LEDGER=on) — unchanged
```

The item screen embeds the learner page with `buildPreviewRequest()` from `review-model.mjs`, exactly as the desktop does: a 32-hex review token in the URL, and the learner shell answering with `postMessage({type:'faculty-preview-status', status: ready|not_found|error, surface})`. The console's own `Content-Security-Policy: frame-ancestors 'none'` header stays (nothing may frame the console); the learner sites' `frame-ancestors` list is untouched because `/m/` shares the allowed origin.

Shared with the desktop, imported not copied: `review-model.mjs` (`normalizeReviewItems`, `filterReviewItems`, `deriveReviewCounts`, `createReviewToken`, `buildPreviewRequest`, `buildExternalReviewUrl`, `parseDeepLink`, `buildDeepLink`, `twinOf`, `matchesPreviewStatus`, `deriveAttestationEligibility`) and `content-universe.mjs`. New code is the phone view layer and a small phone-side state machine only.

## 4. Screens and flow

**Sign in.** One field for the faculty key, sent only in the `x-faculty-key` header, held in `sessionStorage` and cleared when the tab closes. A 401 clears the key and re-prompts while keeping the pending action, as the desktop does.

**Queue.** One list. Items that need review, grouped:

1. By correction, when `?view=changes` explains the drift: the pull request that changed the pages, largest group first, each page one row.
2. *No text change* pages (record or fingerprint scope moved).
3. Everything else pending, in the desktop's queue order.

Each row: title, site (MS3 / residents), risk level, one line of why it needs review (`Content changed since faculty review on <date>` or the pending reason). A count line at the top (`N pages · N tools · N questions`) from `deriveReviewCounts`. Search over titles. Tapping a row opens the item; `?item=page:<slug>` deep links open the item directly once unlocked, so the desktop's **Copy link** and the **Attest this page** bookmarklet keep working on a phone.

**Item.** The learner page fills the screen in an embedded frame requested with a fresh review token. A thin status pill reports the frame's typed readiness: *Ready*, *Not found*, *Error*, or *No answer* after 10 s, with **Retry**. A bottom bar, always visible, with three actions:

- **What changed**: a sheet rendering `?view=diff&slug=<slug>` as removed and added text (the same data the desktop's *What changed since you signed* shows), with the correction's PR number.
- **Open in site**: the public learner URL from `buildExternalReviewUrl` in a new tab.
- **Attest**: enabled only when `deriveAttestationEligibility` allows it (the frame reported *Ready*, or the reviewer pressed **Retry** once and then acknowledged that the live surface is unavailable, exactly the desktop's rule).

A Case-of-the-Week item names its twin and offers **Go to twin**; one press still attests one slug.

**Confirm.** A sheet: *Sign `<title>` as `<ATTESTER_NAME>`*, with the hash-binding sentence (*this signs the text as it is on `main` right now*), one **Sign** button and **Cancel**.

**Receipt and advance.** On `ok`, the receipt shows the commit id from the response and the rolling PR number when present, then the client advances: the twin if it needs review, else the next page in the same correction group, else the next pending item, as the desktop does. The queue row updates from the returned `row`; a background `GET` refreshes the queue after the sitting pauses for 30 s, never on the press.

**Questions.** A question row opens a read-only view of its saved draft (stem, options with the key marked, rationale, evidence) and **Attest**, gated by the same eligibility as the desktop's saved-revision receipt (`reviewedRevisionMatches`). No edit controls. A question with a warning gate shows the warnings and no **Attest**.

**Home screen.** A `manifest.webmanifest` (name, icon, `display: standalone`, `start_url: /m/`) so the console can be added to the phone's home screen. No service worker in v1: the client must always talk to the server.

**Hand-off from the desktop page.** Netlify redirects cannot match a phone, so `index.html` shows a one-line link *Use the phone console* on viewports narrower than 700 px. `/m/` is also directly linkable.

## 5. Server change

In `netlify/functions/attest.mjs`, `commitContentMutation` already returns `{ ok, target: 'content', updated, commit }`. It will also return `row`: the ledger row it just wrote for the slug (`status`, `at`, `by`, `risk`, `contentHash`), read back from the object it serialized, not re-fetched. The question path (`commitQbankMutation`) likewise returns the written item's `id`, `status` and `revision`. Nothing else in the response changes; the desktop ignores the new field until it chooses to use it.

Optional and small: `GET /api/attest?view=item&slug=<slug>` returning one item's current state, for the phone's lazy refresh of a single row. If it costs more than a day it is dropped; the background full `GET` covers the same need.

## 6. Security and governance

- The faculty key is the only credential; it is never in a URL, never in `localStorage`, never logged. Same as today.
- The review token is per item and per attempt (`createReviewToken`), never reused after a press.
- The server's rate limit (60 requests a minute per IP) is untouched; the phone client makes at most one `GET` per session start, one `GET ?view=diff` per **What changed**, and one `POST` per press.
- One slug per press, enforced by the client sending `changes: {<slug>: true}` with a single key, and by the server as today.
- `faculty-console/` is a governance path under `bin/check_governance_separation.py`. The change ships in **its own pull request** with no content files, no ledger, no registry.
- Nothing in this design writes `reviewed.json` or `question_bank.json` from the client; the server remains the only writer.

## 7. Performance budget

Per press on the phone: one `POST` (about 10–13 sequential GitHub calls inside the function; unchanged) and **no** confirming reload. Perceived time is the function's own latency, typically a few seconds. Per session: one full `GET` at unlock and one `?view=changes` for the grouping. The 610 KB question bank is downloaded by the function, not by the phone; the phone receives the derived items only. Target: **Attest** to receipt under 5 s on LTE; queue open under 4 s.

## 8. Error handling

| Case | Behaviour |
|---|---|
| 401 on any call | Clear the key, re-prompt, keep the pending action, retry once unlocked |
| 409 from the write (branch moved) | The server already retries once; the client shows *The branch moved, press Sign again* and keeps the item |
| `pullRequestError: true` | Receipt says *Signed (commit …); the rolling review request needs attention*, never *failed* |
| Frame `not_found` / `error` / no answer in 10 s | Status pill + **Retry**; after one retry the reviewer may acknowledge and continue, as on the desktop |
| Offline | Actions disabled with *You are offline*; the queue as last loaded stays readable |
| Function 5xx | *Could not reach the repository*; the item stays selected; **Retry** |

## 9. Testing

- `faculty-console/m-model.test.mjs` (node): queue grouping from a fixture `changes` view, deep-link parsing for `/m/`, the item state machine (idle → preview → eligible → confirming → signed → advanced), auto-advance order, and that a press always sends exactly one slug.
- `faculty-console/attest.test.mjs` (existing function tests): the `POST` response carries `row` with the written status, `at`, `by` and `contentHash`; the question path carries `id`, `status`, `revision`.
- `tests/smoke/faculty-console.spec.js` (Playwright, project `faculty-console`): a phone-viewport (390 × 844) run of sign in → queue → item → What changed → confirm sheet against the deploy preview, with a **controlled governance fixture**, never the live queue (the repo's rule; see CLAUDE.md).
- `console-navigation.test.mjs`: `/m/?item=page:<slug>` resolves like the desktop link; a link naming an unknown item selects nothing and says so.

## 10. Rollout

1. One governance PR: `faculty-console/m/index.html`, `faculty-console/m/m.mjs`, `faculty-console/manifest.webmanifest`, the desktop hand-off link in `faculty-console/index.html`, the `row` field in `attest.mjs`, and the tests above. No content, no registry, no ledger.
2. Review on the Netlify deploy preview from a phone (`https://deploy-preview-<N>--clerkship-faculty-attest.netlify.app/m/`). The preview cannot sign in ledger mode (no signing key) but can in the current rolling-PR mode.
3. Merge; the console site builds from `main`. Add `/m/` to the home screen.
4. When the ADR-003 ledger is switched on, the phone client needs no change: the same `POST` returns the same receipt with `ledger.seq`, and the *Publish now* control is added to both clients in that work, not here.

## 11. Decisions recorded

- Full review on the phone, not diff-only (owner, 2026-09-26).
- Separate `/m/` client rather than a phone mode inside the desktop script (owner, 2026-09-26).
- Key held for the session only; no remember-me (this spec).
- Questions read-only on the phone (this spec).
