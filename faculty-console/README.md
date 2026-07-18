# Faculty Attestation Console

A standalone, shared-key faculty workbench for reviewing learner-facing pages, tools, and questions in one queue — **separate from the two student sites**. Each save or attestation commits `reviewed.json` (pages/tools) or `question_bank.json` (question drafts and status) **directly to the repository through a Netlify function and the GitHub API**, which triggers the normal student-site rebuild. No export → upload → merge step.

```
faculty-console/
  index.html                     password gate and unified workspace styles
  app.mjs                        shared queue, preview/editor, sign-off, and conflict workflow
  review-model.mjs               queue, preview-route, protocol, and eligibility rules
  qbank-rules.mjs                shared question-bank structural checks
  netlify.toml                   config for this site (publish + functions)
  netlify/functions/attest.mjs   authenticated state reads and commit-on-save API
  netlify/functions/qbank-actions.mjs
                                 revision-safe draft and attestation transitions
  README.md                      this file
```

## How it works

1. Open the faculty site (its own Netlify URL), enter the faculty key, and provide a reviewer label.
2. The console calls `GET /api/attest`. The key is sent only in the `x-faculty-key` header; it is never accepted from the URL or JSON body. The function reads `reviewed.json`, `site_manifest.json`, and `question_bank.json`, then returns the page/tool review state, active questions with their exact saved revisions, the normalized Git object ID for the loaded manifest, and current structural checks.
3. Pages, tools, and questions appear in one filterable queue. Selecting an item opens its learner-facing surface beside one common **Review → Resolve → Confirm** rail.
4. The embedded learner site reports a typed readiness result for the exact selected item. Preview requests carry a short-lived random review token, never the faculty key, reviewer label, confirmations, edits, or commit data.
5. A question edit is saved as a **draft** first. The browser sends the exact loaded question and manifest revisions. Before each write attempt, the server rereads and validates both files, applies only editable fields, reruns the structural checks, commits the draft, and makes the browser reload that committed revision. The save response can show its commit receipt before that reload; a failed refresh explicitly says the latest repository state has not been confirmed in the browser.
6. Attestation is a separate, one-item action. The server rechecks the exact saved question revision, current warnings, human confirmations, and manifest revision before changing status. Page/tool attestations likewise write only the selected slug. Attestation remains in its saving-and-confirming state until a repository reload matches the requested status and, for a question, revision.
7. Netlify sees the commit and rebuilds the student sites. Badges update on the next deploy.

**The GitHub token never leaves the server.** The browser only ever holds the faculty key (in `sessionStorage`, cleared when the tab closes).

## Faculty review runbook

### 1. Choose one item

Use the shared queue's search, item type, review status, category, gate, and difficulty filters. **Previous** and **Next** move deliberately through the filtered queue; a successful attestation stays on the completed item so its repository receipt can be inspected before choosing **Next item**.

### 2. Review the learner-facing surface

The preview reports one of these honest states:

- **Ready:** the exact learner surface reported that it loaded and is ready for review.
- **Not found:** the deployed learner site does not contain the requested page, tool, or question.
- **Error:** the learner surface reported a loading or rendering error.
- **Preview protocol unavailable:** the outer learner page loaded, but the typed readiness message did not arrive in time.
- **Network or embedded-preview failure:** the frame did not load reliably, changed, or reloaded after verification.

Use **Retry preview** to create a fresh token and a new verification attempt. If a page or tool still cannot be verified in the frame, **Open full page** opens a clean learner URL in a separate tab; record the separate-tab review before continuing. A question never substitutes another item: review its exact saved Draft and acknowledge that the live question is unavailable. Error, protocol, and frame failures require one Retry before that acknowledgement becomes available.

### 3. Resolve concerns

For a page or tool, verify both that the material is accurate and appropriate for a third-year student and that the relevant links, media, or interactions work.

For a question, use the three mutually exclusive views:

- **Live deploy** shows the exact deployed learner question when available. It provides learner context; it is not proof that the deployed content matches the saved repository revision.
- **Draft preview** renders the question outside the learner deployment. With no unsaved edits, it shows the exact saved repository revision as **Saved Draft preview · Not deployed** and permits the saved-revision receipt. With local edits, it instead shows **Unsaved local preview · Not deployed**; save and reload before recording that receipt.
- **Edit question** exposes the governed fields and structural feedback. Saving forces the question back to `draft`, reloads the committed revision, and invalidates earlier review receipts and confirmations.

Treat the gate as a workflow aid, not a clinical verdict:

- **Blocked:** resolve every structural blocker before saving or attesting.
- **Warning:** review the exact saved revision and acknowledge every current warning individually.
- **Ready:** the saved structure passed automated checks.

Ready and Warning questions both require an explicit **I reviewed this exact saved revision** receipt. Automated checks and a successful preview do **not** establish clinical correctness, evidence support, originality, or absence of PHI; those remain faculty judgments.

### 4. Confirm one attestation

The rail shows the self-entered reviewer label. For questions, complete all three faculty confirmations covering the clinical answer, named evidence, and an original fictional vignette without PHI. Then choose **Attest this question**. For pages and tools, choose **Attest this page** or **Attest this tool** after the Review and Resolve steps are complete.

The interface submits only the selected item and waits for a confirming repository reload. A commit link is shown only after that confirmation. Completed page/tool reviews have no primary attestation button; use **More actions → Reopen review**, confirm the exact item, and complete a fresh review before re-attesting.

### Embedded preview limits

The learner iframe uses exactly `allow-scripts allow-same-origin allow-forms` with `referrerpolicy="no-referrer"`. It does not grant popup, download, or top-navigation permission. The separate-tab page/tool fallback is intentionally outside that sandbox and uses a clean public learner URL without review tokens or faculty data.

This MVP deliberately makes no saved/deployed parity claim. **Live deploy** and **Draft preview** are separate evidence: the former shows what the current learner deployment serves, while the latter identifies the exact repository revision being attested.

### Conflicts and failed refreshes

Every question action includes the question revision and source-manifest revision that were loaded. The server returns HTTP 409 without another write when the selected question or manifest changed, or when the current manifest disappeared. A GitHub write conflict caused only by an unrelated question-bank edit may be retried once, but the retry rereads and rechecks both files first. Choose **Reload** to replace the editor with the current repository version, or **Keep local copy** to retain the unsaved text for reference.

Any valid `GET` response with a different manifest revision clears saved-revision receipts, learner-review checks, warning acknowledgements, and faculty confirmations. A failed post-save refresh keeps the current local item, retains the commit receipt returned by the save, and adds an error explaining that the latest repository state has not been confirmed in the browser. A failed post-attestation refresh does not announce the item as attested.

## Runtime and request limits

- Netlify runs the function on **Node 24**.
- GitHub REST requests declare API version **`2026-03-10`**.
- POST bodies are limited to **128 KiB** and `question_bank.json` reads/writes to **4 MiB**.
- The function declares a Netlify limit of **60 requests per 60 seconds**, aggregated by IP and domain.
- Responses use `Cache-Control: no-store`.
- Same-origin requests are the default. Set `ALLOWED_ORIGIN` only to one exact `http://` or `https://` origin (no path or trailing slash) when the faculty frontend and function require that explicit origin.

## Local browser verification

The browser test uses a synthetic in-memory repository and intercepts `/api/attest`; it does not need or expose production secrets. It does require a current built learner site on port 4200 and the console on port 4202.

```bash
# Terminal 1, from the repository root: build and serve the learner site
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
python3 -m http.server 4200 --directory _build/ms3

# Terminal 2, from the repository root: serve the console
python3 -m http.server 4202 --directory faculty-console

# Terminal 3, from the repository root: run the focused browser project
cd tests/smoke
npm ci
npx playwright test --project=faculty-console
```

CI uses Node 20. On this repository, local Node 25 has stalled in Playwright; Node 22 is the verified local fallback.

## One-time setup (≈10 minutes, all in the Netlify + GitHub UIs)

### 1. Create a fine-grained GitHub token
GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token:
- **Resource owner:** `jmoss333`
- **Repository access:** Only select repositories → `jmoss333/psychiatry-clerkship`
- **Permissions:** Repository permissions → **Contents: Read and write** (leave everything else "No access")
- **Expiration:** your choice (set a calendar reminder to rotate)

Copy the token once. This is the *only* thing that can write to the repo, so treat it like a password.

### 2. Create the faculty Netlify site
Netlify → **Add new site → Import from Git →** pick `jmoss333/psychiatry-clerkship`, then in the site settings:
- **Base directory:** `faculty-console`
- **Build command:** *(empty)*
- **Publish directory:** `faculty-console`
- **Site URL:** use `https://clerkship-faculty-attest.netlify.app` for the current exact learner framing allowlist
- Functions are auto-detected from `faculty-console/netlify/functions`.

If the console uses a different origin, update the learner site's exact `frame-ancestors` source and redeploy the learner before expecting embedded previews to work. `ALLOWED_ORIGIN` controls API CORS; it does not change the learner framing policy.

### 3. Set environment variables (Netlify → Site config → Environment variables)
| Variable | Value |
|---|---|
| `GITHUB_TOKEN` | the fine-grained PAT from step 1 |
| `FACULTY_ATTEST_PASSWORD` | a strong shared faculty key |
| `GITHUB_REPO` | `jmoss333/psychiatry-clerkship` *(optional; this is the default)* |
| `GIT_BRANCH` | `main` *(optional; default)* |
| `STUDENT_SITE_URL` | learner site to embed *(optional; defaults to `https://une-ms3-psychiatry.netlify.app`)* |
| `ALLOWED_ORIGIN` | the exact faculty site origin, e.g. `https://clerkship-faculty-attest.netlify.app` *(optional; tightens API CORS)* |

Deploy. Open the site, enter the key, and you're attesting.

> **Do not** put the token or password in the repo, in `netlify.toml`, or in the HTML. Keep both required secrets only in Netlify environment variables.

## Security notes

- **Token scope is the blast radius.** A fine-grained PAT limited to this one repo with Contents-only access means a leaked token can, at worst, edit files in this repo — not touch your other repos or account.
- **The key is a shared secret**, checked server-side in constant time before a POST body is read. It is appropriate only for a small trusted faculty group.
- **Reviewer labels are self-asserted, not verified identities.** The label improves the Git history but does not prove which person used the shared key. If verified per-person attribution is required, replace the shared key with institutional SSO or OAuth before treating the label as an identity record.
- **Framing is exact-origin only.** The built learner site sets `frame-ancestors 'self' https://clerkship-faculty-attest.netlify.app` and intentionally omits `X-Frame-Options`, because `SAMEORIGIN` would block that named cross-origin console. There is no wildcard. A different console origin requires an explicit learner-policy change and learner redeploy; `ALLOWED_ORIGIN` and `STUDENT_SITE_URL` do not expand the framing allowlist. The faculty console itself remains non-embeddable with `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
- **Concurrency is fail-closed at each preflight.** Every question-bank write attempt reads the current bank and then the current manifest, validates both, compares the manifest's normalized 40- or 64-hex Git object ID with the loaded value, checks exact per-item revisions, and writes with the current bank SHA. Missing or changed manifest state becomes a safe conflict; other upstream failures retain their existing generic error handling.
- **Residual race boundary:** this narrows the manifest-to-write window but is not a cross-file or branch-wide transaction. GitHub's Contents write protects the `question_bank.json` blob SHA; it cannot atomically lock `site_manifest.json` with that write. A manifest commit can still land after the final manifest read. The browser's required post-write reload detects a changed manifest and invalidates session approvals, but deployment policy or a true server-side transaction would be needed to eliminate that final cross-file window.
- **Audit trail:** every successful mutation is a Git commit. The interface submits one selected item at a time; attestation messages retain the server's compatible count-and-reviewer format, while a question draft-save message names its item. The Git diff records the exact changed entry. Git history is durable, but the self-entered reviewer label retains the identity limitation above.

## After it's live: remove the on-site attestation tools

Once you've confirmed the console works end-to-end, the two attestation tools can be deleted from the student build (`review-attest.html`, `qbank-attest.html`) — remove them from `site_manifest.json` (`tools`), from the `nav` in `build_deploy.py`, and from the `_required`/copy lines. That change is intentionally **not** bundled here so the console can be verified first.

*Joshua Moss, MD | Psychiatrist*
