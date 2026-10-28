# ADR-004 — The faculty console is a GitHub App, not a person's token

**Status:** Accepted 2026-10-26 (decision `console-identity-github-app`, Joshua Moss, MD, ruled
2026-10-18 in the architecture review, item R4). **Code shipped; activation pending** the owner's
settings steps below — until the three `GITHUB_APP_*` variables exist on the console site, the
console authenticates with `GITHUB_TOKEN` exactly as before.
**Plan:** `claude/r4-github-app-identity-plan-2026-10-18.md` (Cowork project doc).
**Code:** `faculty-console/github-app-auth.mjs`; the hook in
`faculty-console/netlify/functions/attest.mjs` (`requireServerSettings` → `withGithubIdentity`).

## Context

Every attestation reaches `main` through `attest/pending`, committed by the console through
GitHub's Contents API as `Faculty Attestation Console <faculty@clerkship.local>`. Gate L4
(`bin/check_governance_separation.py`) accepts a promotion on that branch only when author **and**
committer are that identity. But the identity is a commit email — a string anyone with push
rights can set with `git commit --author` — and the console authenticated with the owner's
personal fine-grained token, so "the console wrote this" and "the owner wrote this" were the same
credential. ADR-003's signed ledger was built to close that gap cryptographically and was removed
as design debt (decision `attestation-ledger-removed`); the gap stayed open.

## Decision

The console authenticates as a **GitHub App** (`clerkship-faculty-console`, installed on this
repository only; Contents and Pull requests read & write, Metadata read). Its installation token
is minted per process from an RS256 app JWT and the App's private key, which lives in exactly
one place: the console site's Netlify environment.

- **Nothing about the commits changes.** The Contents API takes an explicit committer, so commits
  still name `faculty@clerkship.local`; `attestation_hash.py`'s `CONSOLE_IDENTITY`, L4 and every
  attestation test are untouched.
- **What changes is who can hold the credential.** Step 2 below puts a ruleset on
  `attest/pending` whose only bypass actor is the App. From then on the email is no longer the
  guarantee; the key is. A human push to `attest/pending` — the owner's included — is refused.
- **Fail closed, never fall back.** With none of the three variables set the console uses
  `GITHUB_TOKEN`. With some but not all, a key that does not parse, or an exchange GitHub refuses,
  every request is `server_configuration` before any repository call. A half-configured identity
  silently reverting to the personal token would be the forgeable identity back, with a dashboard
  that says otherwise.
- **The sweep, release status, red-team revisions and care-profile reads keep `GITHUB_TOKEN`.**
  None of them pushes to the branch; the sweep's PR creation and auto-merge arming are PR
  operations, not pushes, and release status needs Checks/Actions read the App does not carry.

## Consequences

- GitHub's **"Update branch"** on the rolling PR is a push to `attest/pending` as the person
  pressing it, so the ruleset refuses it. It is not needed: `main`'s ruleset does not require
  branches to be up to date (`strict_required_status_checks_policy: false`, pinned by
  `bin/check_ruleset_drift.py`), so a rolling PR that is merely behind still merges. A rolling PR
  that is **dirty** (a `reviewed.json` conflict) is the one case a human must resolve on the
  branch; the owner does that by temporarily adding themselves to the ruleset's bypass list and
  removing themselves after — recorded in `docs/OPERATIONS.md` §6.
- `attest/evidence-review` (faculty evidence dispositions) is written by the same handler with the
  same token; the ruleset should cover both branches.
- The private key is a single secret, rotated in App settings (generate, paste, delete the old);
  it joins the quarterly rotation with the Interview Room key. An installation token lives one
  hour and is cached until five minutes before expiry; a cold function mints at most one per
  invocation.
- The "Verified" badge on commits is **not** the guarantee and may not appear (GitHub signs
  API commits only when the committer is the App's own bot identity, which the console does not
  use). The proof is the ruleset refusing a human push.

## Activation (the owner's hands; the code is already live and inert)

1. Create the App, generate a private key, install it on `jmoss333/psychiatry-clerkship` only.
2. Netlify → `clerkship-faculty-attest` → environment: `GITHUB_APP_ID`,
   `GITHUB_APP_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY` (production secrets). Redeploy. Leave
   `GITHUB_TOKEN` in place for the read-only functions.
3. Sign one attestation. `git log -1 --format='%an <%ae> | %cn <%ce>' origin/attest/pending` must
   still read `Faculty Attestation Console <faculty@clerkship.local>` for both, and
   `python3 bin/check_governance_separation.py --base origin/main` on the rolling PR must pass.
4. Only then: ruleset `attest/pending — console only` targeting `attest/pending` and
   `attest/evidence-review`, *Restrict updates* + *Restrict creations*, bypass list = the App,
   enforcement Active. A deliberate `git push origin HEAD:attest/pending` from the owner's Mac is
   then **refused** — that refusal is the evidence. Pin the new ruleset in
   `bin/check_ruleset_drift.py`.
