# Operations — the procedures a successor must be able to run

**Who this is for:** whoever keeps the two learner sites up if the owner (Joshua Moss, MD) is
unavailable — a covering faculty member, a program coordinator, or a future steward. You do not
need to understand the build. You need to know which of the seven situations below you are in,
run the one command or click named for it, and recognise the expected result.

**Where you run things.** Everything here is run from a terminal on a Mac with a clone of this
repository (the owner's is `~/Psychiatry-Clerkship-Library`), or from GitHub's web interface
where it says so. Nothing here needs an AI session. Each procedure names the authoritative
runbook or tool; this page is the index, not a replacement for them.

**Three rules before anything else**
1. **Never edit `13_Faculty_Resources/reviewed.json` by hand.** Only the faculty console writes a
   signature. A hand edit fails the production deploy on purpose (`docs/agent-guide/attestation-hashes.md`).
2. **Never push to `release` by hand, never merge to `main` locally, never force-push.** The release
   train publishes; GitHub's ruleset blocks the rest (`docs/agent-guide/branching-and-worktrees.md`).
3. **When in doubt, do nothing to production.** A failed deploy leaves the last good site live. The
   dangerous moves are the "fixes" — clearing Netlify's cache, rebinding attestations by hand,
   minting any signing key — and each is named below as something not to do. An agent never
   mints a signing key or writes a signatures branch of any kind.

---

## 0. Is anything broken right now?

| Look at | What it tells you |
|---|---|
| `python3 bin/what_needs_josh.py` | the owner's queue: pages awaiting attestation or re-attestation, pack cases, instrument rulings. `unknown` means it could not measure, never zero. |
| GitHub → **Issues** → the open issue titled by **Automation — Failure Escalation** | every scheduled workflow that failed recently, in one place |
| GitHub → **Actions** → **Maintenance — Production Learner Canary** / **Maintenance — Release Watch** | whether the two learner sites serve what `main` says they should |
| The faculty console → *What learners see* panel | the same reading on demand, and which pages learners are served as awaiting re-signature |
| `python3 bin/check_netlify_deploy_health.py` | the last production deploy of each site, from Netlify's record |

Both sites: `https://une-ms3-psychiatry.netlify.app` (students) and
`https://mmc-psychiatry-residents-sanford.netlify.app` (residents).

## 1. Publish a safety fix *now*

**When:** a fix has merged to `main` and cannot wait for the next scheduled train (09:05, 15:05,
21:05 UTC).

1. GitHub → **Actions** → **Production — Release train (publish main to the learner sites)** →
   **Run workflow** → type the reason → Run.
2. Expected: the run fast-forwards `release` to the newest green `main` commit and both sites
   redeploy within ~10 minutes. Publish-now is never held by the spend tripwire.
3. Confirm: the Release Watch workflow (10:05 UTC) goes green, or the console's *What learners
   see* panel shows the new revision.

Do **not** push `release` yourself. Do **not** clear Netlify's build cache to "force" it — a
fresh clone spends the month's LFS bandwidth (see §4). Reference:
`docs/agent-guide/build-and-deploy.md`, `13_Faculty_Resources/_automation/GIT_AND_DEPLOY_PLAN.md`.

## 2. Work the attestation queue

**When:** `what_needs_josh.py` lists pages under `attestation` or `re-attest`, or a learner page
shows the "awaiting faculty review" notice.

1. Open the faculty console: `https://clerkship-faculty-attest.netlify.app` (the phone view is
   `/m/`). Sign in with your **enrolled faculty credential** — the owner enrols each attester;
   nothing is shared (`faculty-console/README.md`).
2. Review each page's text as served, then **Attest**. A re-attestation rebinds the signature
   to the current text; a page whose only change was citations says *CITATIONS CHANGED* so you
   can read just that.
3. Expected: your signature is committed to the branch `attest/pending`; within 15 minutes the
   rolling PR opens or reopens and auto-merges; the next train publishes it. The daily delivery
   check (`bin/check_attestation_delivery.py`) names anything stuck.

Only faculty may attest. An agent, a coordinator or a bot must never sign (the 2026-09-14
incident is why: `docs/agent-guide/governance-separation.md`). Reference:
`docs/agent-guide/attestation-hashes.md`, `docs/agent-guide/attestation-delivery-and-ledger.md`,
`faculty-console/README.md`.

## 3. Start a rotation block (Interview Room turnover)

**When:** the first day of each rotation block.

```bash
python3 bin/rotation_turnover.py            # dry run: shows what would change, changes nothing
python3 bin/rotation_turnover.py --apply    # new rotation ID, origins, operations credential, redeploy, live proof
```
Expected: a summary comment on the rotation issue and a live proof that the proxy answers. The
learner **passcode is fixed and never rotates** (decision `passcode-fixed`); the command never
prints a credential. Reference: `sp-proxy/README.md`, `docs/agent-guide/interview-room.md`.

## 4. Deploys failing: Git LFS bandwidth or a missing media object

**When:** every production deploy of both learner sites fails the LFS gate while CI and the deploy
previews stay green and nothing changed.

- That pattern is the **GitHub LFS bandwidth quota** (10 GB/month per account), not the code.
  Read `13_Faculty_Resources/_automation/site_build/NETLIFY_LFS_RUNBOOK.md`, *Incident pattern 2*.
- The cost is per **fresh clone** (~455 MB). A cache-reusing build downloads nothing. So: **never
  "Clear cache and deploy"** to retry; wait for the quota to reset or buy a data pack.
- A single missing object (one page's audio) is *Incident pattern 1* in the same runbook.

Diagnostic: in the Netlify deploy log, the checkout step takes ~2 s when the cache was reused and
~70 s when it cloned fresh.

## 5. Spend

| Bill | What drives it | Where it is bounded |
|---|---|---|
| Netlify credits | every **production** deploy (15 credits) and function invocations | the train publishes at most 3×/day and **holds** if more than 12 billable production deploys happened in 24 h; `13_Faculty_Resources/_automation/NETLIFY_COST_REDUCTION_PLAN.md` |
| GitHub Actions minutes | workflows on **private** repositories | this repository is public, so its minutes are free; the audit of 2026-09-11 lists what was disabled elsewhere |
| GitHub LFS bandwidth | fresh clones of the media (§4) | the cached-pull path; never clear the Netlify cache |

If the train is **holding** (red run, "HOLD" in its summary), that is the tripwire working: look
for what produced the extra deploys (a satellite site redeploying in a loop, a manual trigger)
before publishing again.

## 6. Credentials and identities — who holds what

| Secret / identity | Held by | Rotated how |
|---|---|---|
| Interview Room operations key | Netlify env of `sp-interview-proxy`; macOS Keychain on the owner's Mac | `bin/rotation_turnover.py --apply` (§3) |
| Interview Room learner passcode | Netlify env | **fixed** — decision `passcode-fixed` |
| Faculty console's GitHub token (`GITHUB_TOKEN`; the attestation writer until the App is active, the read-only panels' token afterwards) | Netlify env of the console site | GitHub → Settings → Developer settings; paste into the console site's env; redeploy the console |
| Faculty console's GitHub App key (`GITHUB_APP_PRIVATE_KEY` with `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`; commits as `faculty@clerkship.local`; ADR-004) | Netlify env of the console site — the only copy | App settings → Private keys → generate, paste, delete the old; redeploy. Quarterly, with the Interview Room key. **If the rolling PR is dirty:** add yourself to the `attest/pending` ruleset's bypass list, resolve on the branch with a merge (never a rebase), remove yourself the same day |
| Each attester's console credential | the attester alone; enrolled by the owner | re-enrol (`faculty-console/README.md`); never shared, never in Git or logs |
| LLM provider API key (Interview Room) | Netlify env of the proxy — **never the browser** | provider dashboard, then the proxy site's env |

## 7. If the owner leaves

The minimum handover is four things: (1) a second named attester with a console login, because
nothing publishes a changed clinical page without a faculty signature; (2) ownership of the
Netlify team and the GitHub repository transferred to an institutional account; (3) the Keychain
entry and the Netlify env secrets above re-created by the new steward (do not copy them); (4) this
page and `docs/ADOPTING.md` read once end to end. Everything else — content, gates, schedules —
keeps running without anyone.

---

**Keeping this page true.** Each procedure above names its source of truth. When a tool or
workflow is renamed, change it here in the same PR — `tests/operations-runbook.test.mjs` fails
when a path or workflow named on this page no longer exists.
