# Faculty Attestation Console

A standalone, password-gated console for attesting clerkship content — **separate from the two student sites**. When you save, a Netlify serverless function commits `reviewed.json` (content pages/tools) or `question_bank.json` (question status) **directly to the repo via the GitHub API**, which triggers the normal student-site rebuild. No export → upload → merge step.

```
faculty-console/
  index.html                     the console (password gate + Content / Question-bank tabs)
  netlify.toml                   config for this site (publish + functions)
  netlify/functions/attest.mjs   serverless: GET current state, POST commit-on-save
  README.md                      this file
```

## How it works

1. You open the faculty site (its own Netlify URL) and enter the faculty key.
2. The console calls `GET /api/attest` (key in the `x-faculty-key` header). The function reads `reviewed.json`, `site_manifest.json`, and `question_bank.json` from the repo and returns the current attestation state.
3. You toggle items reviewed/attested and click **Save**. The console calls `POST /api/attest`; the function merges your changes into the target file and commits it to `main`.
4. Netlify sees the commit and rebuilds the student sites. Badges update on next deploy.

**The GitHub token never leaves the server.** The browser only ever holds the faculty key (in `sessionStorage`, cleared when the tab closes).

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
- **The key is a shared secret**, checked server-side in constant time. Fine for a small faculty group. If this grows to several attesters or you want per-person audit trails, upgrade the auth to **GitHub OAuth** (each faculty signs in with GitHub; the commit is attributed to them and no shared secret exists). The function is structured so that swap is localized to the auth check.
- **Concurrency:** the function reads the file's current SHA before writing and retries once on a conflict, so two near-simultaneous saves won't clobber each other.
- **Audit trail:** every save is a git commit (`attest: N item(s) by <name> (date)`), so `git log -- 13_Faculty_Resources/reviewed.json` is your ledger.

## After it's live: remove the on-site attestation tools

Once you've confirmed the console works end-to-end, the two attestation tools can be deleted from the student build (`review-attest.html`, `qbank-attest.html`) — remove them from `site_manifest.json` (`tools`), from the `nav` in `build_deploy.py`, and from the `_required`/copy lines. That change is intentionally **not** bundled here so the console can be verified first.

*Joshua Moss, MD | Psychiatrist*
