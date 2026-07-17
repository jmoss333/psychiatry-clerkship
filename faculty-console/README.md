# Faculty Attestation Console

A standalone, shared-key faculty workbench for reviewing the clerkship question bank and attesting content — **separate from the two student sites**. Saving commits `reviewed.json` (content pages/tools) or `question_bank.json` (question edits and status) **directly to the repo through a Netlify function and the GitHub API**, which triggers the normal student-site rebuild. No export → upload → merge step.

```
faculty-console/
  index.html                     the console (password gate + Content / Question-bank tabs)
  app.mjs                        queue, editor, review-session, and conflict workflow
  qbank-rules.mjs                shared structural checks and batch checks
  netlify.toml                   config for this site (publish + functions)
  netlify/functions/attest.mjs   serverless: GET current state, POST commit-on-save
  netlify/functions/qbank-actions.mjs
                                 revision-safe draft and attestation transitions
  README.md                      this file
```

## How it works

1. You open the faculty site (its own Netlify URL) and enter the faculty key.
2. The console calls `GET /api/attest`. The faculty key is sent only in the `x-faculty-key` header; it is never accepted from the URL or JSON body. The function reads `reviewed.json`, `site_manifest.json`, and `question_bank.json` and returns only active questions with their exact saved revisions and current structural checks.
3. A question edit is saved as a **draft** first. The server checks the loaded revision, applies only editable fields, reruns the shared checks, commits the draft, and makes the browser reload that committed revision.
4. Attestation is a separate deliberate action. The server rechecks the exact saved revision, human confirmations, warning acknowledgements, and batch balance before changing status.
5. Netlify sees the commit and rebuilds the student sites. Badges update on the next deploy.

**The GitHub token never leaves the server.** The browser only ever holds the faculty key (in `sessionStorage`, cleared when the tab closes).

## Faculty review runbook

### Question bank

1. Use search and the category, status, gate, and difficulty filters to narrow the queue. Open one question to see every editable v1 field, source links, changed fields, and the saved revision.
2. Read the gate as a workflow aid, not a clinical verdict:
   - **Blocked (red):** a structural requirement failed. Draft save and attestation remain disabled until it is fixed.
   - **Warning (yellow):** the structure can be saved, but each current warning must be acknowledged and the question attested individually.
   - **Ready (green):** the saved structure passed automated checks. This does **not** establish clinical correctness, evidence support, originality, or absence of PHI; those remain faculty judgments.
3. Editing any item — including an attested item — invalidates prior review, clears confirmations and batch selection, and makes checks local/stale. **Save draft** forces the saved status to `draft`, then reloads the repository version so checks are current again.
4. For a green batch, open each saved green draft and choose **Mark reviewed & next**. Only the exact revision reviewed in this browser session gets an enabled batch checkbox. Reloading, editing, or receiving a newer revision removes that eligibility.
5. Select reviewed green drafts, complete all three faculty confirmations, and inspect the final confirmation dialog. Batches of four or more must avoid a strong answer-position cue. The submitted IDs and revisions are frozen and attested atomically.
6. For a yellow item, complete the three faculty confirmations plus every displayed warning acknowledgement, then use **Attest this warning question**. Yellow items never enter a batch.

### Content pages and tools

Open **Content pages & tools**, filter the list, mark individual or all shown items, and choose **Save content reviews**. Content changes remain separate from question-bank draft and attestation actions.

### Conflicts and failed refreshes

Every question action includes the revision that was loaded. If another commit changes that question first, the server returns HTTP 409 and does not overwrite it. Choose **Reload** to replace the editor with the current repository version, or **Keep local copy** to retain the unsaved text for reference. A failed post-save refresh also keeps the local editor and reports that the commit has not yet been confirmed in the browser.

## Runtime and request limits

- Netlify runs the function on **Node 24**.
- GitHub REST requests declare API version **`2026-03-10`**.
- POST bodies are limited to **128 KiB** and `question_bank.json` reads/writes to **4 MiB**.
- The function declares a Netlify limit of **60 requests per 60 seconds**, aggregated by IP and domain.
- Responses use `Cache-Control: no-store`.
- Same-origin requests are the default. Set `ALLOWED_ORIGIN` only to one exact `http://` or `https://` origin (no path or trailing slash) when the faculty frontend and function require that explicit origin.

## Local browser verification

The browser test uses a synthetic in-memory repository and intercepts `/api/attest`; it does not need or expose production secrets.

```bash
# From the repository root
python3 -m http.server 4202 --directory faculty-console

# In a second terminal
cd tests/smoke
npm ci
npx playwright test --project=faculty-console
```

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
- Functions are auto-detected from `faculty-console/netlify/functions`.

### 3. Set environment variables (Netlify → Site config → Environment variables)
| Variable | Value |
|---|---|
| `GITHUB_TOKEN` | the fine-grained PAT from step 1 |
| `FACULTY_ATTEST_PASSWORD` | a strong shared faculty key |
| `GITHUB_REPO` | `jmoss333/psychiatry-clerkship` *(optional; this is the default)* |
| `GIT_BRANCH` | `main` *(optional; default)* |
| `ALLOWED_ORIGIN` | your faculty site URL, e.g. `https://faculty-clerkship.netlify.app` *(optional; tightens CORS)* |

Deploy. Open the site, enter the key, and you're attesting.

> **Do not** put the token or password in the repo, in `netlify.toml`, or in the HTML. Only the two Netlify env vars.

## Security notes

- **Token scope is the blast radius.** A fine-grained PAT limited to this one repo with Contents-only access means a leaked token can, at worst, edit files in this repo — not touch your other repos or account.
- **The key is a shared secret**, checked server-side in constant time before a POST body is read. It is appropriate only for a small trusted faculty group.
- **Reviewer labels are self-asserted, not verified identities.** The label improves the Git history but does not prove which person used the shared key. If verified per-person attribution is required, replace the shared key with institutional SSO or OAuth before treating the label as an identity record.
- **Concurrency is fail-closed.** The function reads the current file SHA, checks exact per-item revisions, and does not overwrite a question that changed after it was loaded.
- **Audit trail:** every successful mutation is a Git commit. Content commits use `attest: N content item(s) by <name> (date)`; question commits identify the saved draft or attested IDs. Git history is durable, but the self-entered reviewer label retains the identity limitation above.

## After it's live: remove the on-site attestation tools

Once you've confirmed the console works end-to-end, the two attestation tools can be deleted from the student build (`review-attest.html`, `qbank-attest.html`) — remove them from `site_manifest.json` (`tools`), from the `nav` in `build_deploy.py`, and from the `_required`/copy lines. That change is intentionally **not** bundled here so the console can be verified first.

*Joshua Moss, MD | Psychiatrist*
