# Turning on the attestation ledger

Design and reasoning: `docs/superpowers/specs/2026-09-25-attestation-ledger-design.md` (ADR-003).
Until every step below is done, nothing changes. The console keeps the rolling-PR route and the builds keep reading `reviewed.json` alone.

**Order matters.** Steps 1–3 make the builds *able* to read signed sign-offs before step 4 lets the console *write* them. Do them in the opposite order and sign-offs would be recorded that no site yet honours.

| # | Step | Who | Takes |
|---|---|---|---|
| 0 | Merge the rolling attestation PR, if one is open | Josh | — |
| 1 | Create the signing key | **Josh only** | 1 min |
| 2 | Create the `attestations` branch and protect it | agent or Josh | 2 min |
| 3 | Switch the two learner sites on | agent or Josh | 2 min |
| 4 | Create build hooks and switch the console on | agent or Josh | 3 min |
| 5 | Prove it end to end | Josh signs, agent checks | 10 min |

## 1. Create the signing key (Josh, on your Mac)

In Terminal, from the repository folder:

```bash
node bin/ledger_keygen.mjs --install
```

What it does:

* Generates a key pair.
* Stores the **private** half in the faculty console's Netlify settings as `LEDGER_SIGNING_KEY`. It is a *secret*: nobody can read it back, not you, not an agent, not the Netlify API. It is available to the production site only, so pull-request previews cannot sign.
* Confirms the secret actually landed. Its `updated_at` must move, and it must sit in production only. A success line reads `… stored as a production-only Netlify secret on clerkship-faculty-attest (confirmed: LEDGER_SIGNING_KEY updated <time>)`. Anything else means nothing was recorded; fix what it names and run it again.
* Writes the **public** half into `13_Faculty_Resources/ledger/keys.json`.

The private key is never shown on screen and never saved to disk. Nobody else should run this step, because whoever runs it briefly holds the key.

Then land `keys.json` through one ordinary pull request. It is a governance file, so it must be the only file in that PR. It is safe to publish: it is the half that can only *check* signatures.

## 2. The `attestations` branch

It is an orphan branch with no shared history with `main`, holding `ledger/events.jsonl` (empty) and a README. It is never merged.

```bash
git switch --orphan attestations
mkdir -p ledger && : > ledger/events.jsonl
printf '# Attestation ledger\n\nSigned faculty sign-offs, one per line, append-only. Never merge this branch.\nSee docs/superpowers/specs/2026-09-25-attestation-ledger-design.md on main.\n' > README.md
git add ledger/events.jsonl README.md && git commit -m "ledger: genesis"
git push -u origin attestations && git switch main
```

Protect it with a ruleset that blocks force-pushes and deletion. That keeps it append-only in git as well as in its hash chain:

```bash
gh api -X POST repos/jmoss333/psychiatry-clerkship/rulesets --input - <<'JSON'
{"name":"attestation ledger","target":"branch","enforcement":"active",
 "conditions":{"ref_name":{"include":["refs/heads/attestations"],"exclude":[]}},
 "rules":[{"type":"non_fast_forward"},{"type":"deletion"}],"bypass_actors":[]}
JSON
```

Pushes to this branch trigger nothing. CI runs on pushes to `main` only. The two learner sites build `release` only (`allowed_branches: ["release"]`, the release train of #802), and every other Netlify site builds `main` only.

## 3. Switch the learner sites on

Set `CLERKSHIP_LEDGER=on` (Builds scope) on **both** `une-ms3-psychiatry` and `mmc-psychiatry-residents-sanford`, then trigger one build of each.

> **Target sites by `NETLIFY_SITE_ID`, never `--site`.** netlify-cli 26 ignores `--site` on
> `env:*` outside a linked folder: it exits 0, prints nothing and changes nothing (probed
> 2026-09-27). Every command below names its site by ID in `NETLIFY_SITE_ID` (the IDs are in
> `_automation/maintenance/maintenance_config.json`), and every write is followed by a read.

```bash
NETLIFY_SITE_ID=94717a39-679b-4c78-ae02-7b19e809592e netlify env:set CLERKSHIP_LEDGER on --scope builds  # une-ms3-psychiatry
NETLIFY_SITE_ID=af64d5d4-e0b5-4f03-9857-be40e3b48329 netlify env:set CLERKSHIP_LEDGER on --scope builds  # mmc-psychiatry-residents-sanford
# Read it back. Each line must list CLERKSHIP_LEDGER:
NETLIFY_SITE_ID=94717a39-679b-4c78-ae02-7b19e809592e netlify env:list --json
NETLIFY_SITE_ID=af64d5d4-e0b5-4f03-9857-be40e3b48329 netlify env:list --json
```

**Acceptance:** each site then serves `/ledger-receipt.json` with `"status": "applied"` and `"seq": 0`.

## 4. Build hooks, then the console

> **First, `keys.json` must be on `release`, not only on `main`.** The console checks its key
> against `keys.json` on `main`, but each learner build verifies signatures against the
> `keys.json` in the `release` checkout it builds (`ledger_overlay.mjs` reads it from the build
> root). If the console signs before the release train has carried the keys PR to `release`,
> every learner build refuses the ledger (`LEDGER INVALID`, unknown key). The last good deploy
> stays live, but no sign-off publishes until the train catches up. Check before continuing:
>
> ```bash
> git fetch origin release main && git merge-base --is-ancestor <keys PR merge commit> origin/release && echo on-release
> ```
>
> If it is not there yet, wait for the next train (09:05, 15:05, 21:05 UTC) or press the
> release train's **Run workflow** (publish-now).

Create one build hook per learner site (Site configuration → Build & deploy → Build hooks, branch **`release`**, name "attestation ledger"). Then set these on `clerkship-faculty-attest`, scope Functions:

> **Why `release`, not `main`.** Since #802 the learner sites publish the `release` branch, which the release train moves only to a `main` commit whose build and smoke checks passed. A hook on `release` rebuilds exactly what learners already see and adds the newest signatures. A hook on `main` would publish whatever `main` holds at that minute, so it would skip the green-checks gate. The ledger itself comes from the `attestations` branch at build time either way, so a signature still appears within one rebuild.

| Variable | Value |
|---|---|
| `LEDGER_BUILD_HOOKS` | `ms3=<une-ms3 hook URL>,res=<residents hook URL>`, marked **secret** (a hook URL spends money when called) |
| `ATTEST_LEDGER` | `on` |

A secret must name its context. Netlify refuses a secret in the "all contexts" context, and the
CLI reports success anyway, so `--context production` is not optional here:

```bash
NETLIFY_SITE_ID=295ae8dd-412c-47ad-aac3-7e7cd4b3110d netlify env:set LEDGER_BUILD_HOOKS "ms3=<hook>,res=<hook>" --context production --scope functions --secret --force
NETLIFY_SITE_ID=295ae8dd-412c-47ad-aac3-7e7cd4b3110d netlify env:set ATTEST_LEDGER on --scope functions
```

Read both back before redeploying. A secret's value never reads back, so check that its
`updated_at` moved: `netlify api getEnvVar --data '{"account_id":"<acct>","key":"LEDGER_BUILD_HOOKS","site_id":"295ae8dd-412c-47ad-aac3-7e7cd4b3110d"}'`.

Redeploy the console. Environment changes apply only to a new deploy.

## 5. Prove it

1. In the console, sign one page. The response carries `ledger.seq: 1`, and the page reads **reviewed** at once.
2. Within about 10–20 minutes both sites rebuild on their own. Or press **Publish now**.
3. Check the result:

```bash
node bin/ledger.mjs status    # head seq 1; ms3 and res both "serves seq 1"
node bin/ledger.mjs verify    # OK — every signature and link verified
node bin/ledger.mjs audit     # OK — every commit on the branch only appended
```

The page's pending notice is gone on both learner sites, and no pull request was opened.

## If something goes wrong

| Symptom | Meaning | What to do |
|---|---|---|
| A learner-site build fails with `LEDGER INVALID` | A line in the ledger does not verify. That is tampering or corruption, and the build refused it (the last good deploy is still live) | Investigate the named line. To ship the git baseline meanwhile, set `CLERKSHIP_LEDGER=off` on the site. Do not "fix" the ledger by deleting lines |
| Build log says the ledger "could not be fetched" | GitHub was unreachable during the build | Nothing to do. Signed pages show pending until the next build. **Publish now** |
| Console says "could not be recorded … keys.json" | The console's key is not in `keys.json` on `main` | Finish step 1: merge the keys PR, redeploy the console |
| Console refuses with `content.pending_banner` | The page's source still says "pending review" in its first lines | Remove that banner in a content PR first |
| Console refuses with `content.marker_conflict` | A tool that carries its own review label (The Interview Room, Interaction Cards) cannot change review state through the ledger yet | Owner decision: ADR-003 §6 |
| `node bin/ledger.mjs status` shows a site "BEHIND" for more than an hour | Its build failed or its hook is wrong | Check the site's deploy log. **Publish now** |

## Rotating the key

Run `node bin/ledger_keygen.mjs --install --rotate`, merge the `keys.json` PR, then redeploy the console. The old key stays valid for everything it already signed.

If the old key was **compromised**, also set its `revokedAt` in `keys.json` to the time it was compromised (ISO, with milliseconds). From then on, builds refuse anything that key signed after that moment.
