# Confirm the protected room's published version

A merged change does not publish this separately hosted room. The release check
compares the public files actually served with the bytes from an explicit Git
commit. It also checks `/` separately from `/index.html`, because an incorrect
rewrite can serve a stale entrance while the named asset is correct.

```bash
node sp-preview/qa/release-check.mjs \
  --revision FULL_40_CHARACTER_COMMIT_SHA \
  --out /tmp/interview-room-release.json
```

The default target is `https://interview-room-faculty-preview.netlify.app`.
Use `--url https://DEPLOY_ID--interview-room-faculty-preview.netlify.app` to
check a particular immutable deployment. The URL must be an HTTPS origin.

The checker reads the entire `sp-preview/public/` tree from the pinned commit,
including any newly added files. It never trusts uncommitted working files or a
version string returned by the server. The existing build contract establishes
that public files are copied unchanged to `dist`. Keep this checker aligned if
that build ever introduces transformations.

Every expected file must return HTTP 200 with an identical SHA-256 hash. Missing
files, redirects, timeouts, oversized responses, unavailable commits, and an
empty inventory fail. The receipt records expected and served hashes and HTTP
status, without response bodies, dialogue, credentials, or provider calls.
Exit 0 means all public routes matched; exit 1 means a failure or incomplete
check. Failure is never reported as a successful check of zero files.

## Automatic check and post-deploy rerun

`.github/workflows/interview-room-release-check.yml` checks each push to `main`
against that push's exact commit. Three bounded attempts allow a short publish
delay. An unrelated main commit with identical public files passes without
requiring a new protected deployment. The workflow retains the final JSON
receipt for 90 days, including failures.

After deploying, run **Interview Room — Hosted release check** in Actions and
provide the deployed full commit SHA. For example:

```bash
gh workflow run interview-room-release-check.yml -f revision=FULL_COMMIT_SHA
```

The workflow becomes automatic only after it is merged into `main`. It does not
deploy anything or grant clinical approval. A mismatch means the protected room
needs the intended release, or the operator must correct the expected revision.

## Evidence boundary

This checks public browser files and the root route only. It does **not** prove
which server-function source is running, authenticate a session, exercise actor
responses, validate clinical content, or establish physical microphone,
headphone, or VoiceOver behavior. Continue the separate
[hosted release checks](REDTEAM_CHECKLIST.md) after each deployment. Existing
passcode, budget namespace, limits, and faculty review status remain unchanged.
