# Netlify credit reduction — findings and plan

**Team:** ReConnect Psychiatry (`joshua-moss`, id `698be85333c27693a1f23a2d`) · Pro, 1 member, 16 projects
**Audited:** 2026-09-10 · **Billing period:** Aug 16 – Sep 15 (day 25 of 30)
**Bottom line:** 83% of the bill is production deploys that publish byte-identical output. One PR fixes most of it.

> **Status — Tier 1A landed 2026-09-10.** The three satellite sites (and `metrics/`) now
> build production only when their own directory changes, and the production-deploy alarm
> moved from Netlify's per-site "Deploy failed" email into
> `bin/check_netlify_deploy_health.py`, run daily by `maintenance-production-canary.yml`.
> Two things are still Josh's to do by hand and the change is not finished without them:
> **(1)** add the `NETLIFY_AUTH_TOKEN` repository secret — until then the alarm records
> `status: "skipped"` and watches nothing; **(2)** turn OFF the "Deploy failed" email on
> `sp-interview-proxy`, `clerkship-faculty-attest` and `psychiatry-workforce-tour`, and
> leave it ON for the two learner sites. Tier 1B (the `therapymatch-maine` database) and
> Tier 2 are untouched.

---

## 1. Measured baseline

Current period, 12,761.2 credits consumed against 3,000 included.

| Line | Units | Credits | Share | $ |
|---|---:|---:|---:|---:|
| **Production deploys** | 706 deploys | **10,590.0** | **83.0%** | $70.60 |
| **Database compute** | 164.26 GB-hours | **1,642.6** | **12.9%** | $10.95 |
| Bandwidth | 22.2 GB | 444.9 | 3.5% | $2.97 |
| Web requests | 288,713 | 57.7 | 0.5% | $0.38 |
| Functions compute | 2.59 GB-hours | 25.9 | 0.2% | $0.17 |
| AI inference / Agent Runners / Preview servers / Image CDN | — | 0 | 0% | $0 |
| **Total** | | **12,761.2** | | **$85.07** |

**Rate card** (reconciles to the dashboard exactly — every rate below was re-derived from the numbers above and matched Netlify's published figures to 3 decimal places):

| Metered thing | Rate |
|---|---|
| Production deploy | **15 credits (~$0.10) each, flat, regardless of build duration** |
| Compute (functions **and databases**) | 10 credits / GB-hour |
| Bandwidth | 20 credits / GB (~$0.13/GB) |
| Web requests | 2 credits / 10,000 |
| Pro plan | 3,000 credits for $20/mo · top-ups 1,500 credits for $10 |

**Not metered at all** — this is the fact that reframes everything:

- **Build minutes.** 1,600 build minutes this period cost **$0**.
- **Deploy previews, branch deploys, and failed or cancelled deploys.** All free.
- Form submissions. Free.

So build speed is irrelevant to cost. **Only the count of production deploys matters.**

### Actual spend and trajectory

Invoices since Aug 16: $20 plan + **7 × $10 auto-recharges**, six of them since Sep 2. Auto-recharge is **Enabled** and has been firing roughly every 36 hours without surfacing anything.

Daily credit totals (hovered from the usage chart):

| Day | Production deploys | Database compute | Bandwidth | Day total |
|---|---:|---:|---:|---:|
| Sep 3 | 1,400 | 83 | 32 | ~1,500 (**$10**) |
| Sep 7 | 1,100 | 89 | 18 | ~1,200 (**$8**) |

Period totals are accelerating: **6.4K → 6.6K → 11K credits** (Jun → Jul → Aug periods, current period still 5 days from close). Left alone, the forward run rate is **~$200/month** on a $20 plan.

---

## 2. Root cause

### 2.1 Five sites build production on every merge, four of them for nothing

These Netlify projects all deploy from `github.com/jmoss333/psychiatry-clerkship`:

`une-ms3-psychiatry` · `mmc-psychiatry-residents-sanford` · `sp-interview-proxy` · `clerkship-faculty-attest` · `psychiatry-workforce-tour`

Since **2026-09-03** every one of them carries `ignore = "/bin/false"` — *always build, never cancel* — in its `netlify.toml`. That was a deliberate, well-reasoned change: Netlify records an ignore-cancel as a **failed** deploy, which fired the "Deploy failed" email, and that email is the only alarm for a genuinely broken production deploy (added after the 2026-08-31 LFS outage left a broken Interview Room in front of students). The comment blocks in `netlify.toml`, `sp-proxy/netlify.toml`, `faculty-console/netlify.toml` and `alex-tour/netlify.toml` all price the cost as *"one ~30 s build per event"* — true under the old build-minutes model, and **$0.10 per site per event** under credit pricing.

Measured over the last 163 first-parent merges to `main` (Aug 27 – Sep 10):

| Netlify project | Its inputs | Merges that touched them | Production deploys charged | **Wasted** |
|---|---|---:|---:|---:|
| psychiatry-workforce-tour | `13_Faculty_Resources/Outreach/alex-tour/` | 2 | 163 | **161** |
| sp-interview-proxy | `sp-proxy/` | 19 | 163 | **144** |
| clerkship-faculty-attest | `faculty-console/` | 19 | 163 | **144** |
| une-ms3-psychiatry | whole repo (excl. docs/CI/tests/tooling) | 131 | 163 | **32** |
| mmc-psychiatry-residents-sanford | whole repo (excl. docs/CI/tests/tooling) | 131 | 163 | **32** |
| **Total** | | **302** | **815** | **513 (63%)** |

**513 wasted production deploys per fortnight = 7,695 credits = ~$51 every two weeks ≈ $110/month**, publishing output that is byte-identical to what is already live.

Merge velocity is the multiplier, and it is not bot noise: of those 163 merges, only 5 came from Dependabot or nightly automation. Development cadence is ~12 merges/day.

### 2.2 A dormant app is running a 24/7 Postgres

`therapymatch-maine` (repo `jmoss333/therapymatch`) has **Netlify DB (Neon)** attached: `DATABASE_URL` and `NETLIFY_DATABASE_URL` are set, the latter with **3 values across 3 deploy contexts** — likely three separate compute endpoints.

It bills a **flat 83–89 credits/day whether or not anyone visits** — 164.26 GB-hours this period, **$11 per period, ~$17/month**. Meanwhile the site does not appear anywhere in the bandwidth-by-domain table (i.e. effectively zero traffic), its last production deploy is old, and everything since is Dependabot previews.

Two supporting details:

- A branch in that repo is named `ci/smoke-cadence` — *"ci(cost): production smoke every 15min → every 30min"*. A smoke test on that cadence is exactly what stops a serverless Postgres from autosuspending.
- Netlify has **discontinued** this extension: *"New database creation is no longer available through this extension. Your existing databases are not affected."*

### 2.3 Half the bandwidth is robots reading deploy previews

Bandwidth is doubling monthly: **4.3 GB → 11.3 GB → 21.8 GB**. Of the 22 GB this period, production sites account for ~9.9 GB (`une-ms3` 4.4, `mmc` 4.0, `reconnect-tools` 1.4). The remaining **~12 GB is deploy-preview traffic** — up to 192 MB on a single preview URL, which is automated audits (Lighthouse, a11y, contrast canary, link monitor, benchmarks) pulling the audio-bearing pages. Small money today ($2/period) but it is the fastest-growing line.

### 2.4 A minor leak: CLI `--prod` deploys

`interview-room-faculty-preview` is deployed from the CLI and its history mixes **Production** (billed, 15 credits) with **Branch Deploy** (free) for what look like the same iterative previews.

---

## 3. The plan

### Tier 1 — this week · ~$125/month · no learner-facing risk

**A1. Restore directory-scoped build-ignore on the three satellite sites, and move the alarm off Netlify's deploy record.**

The alarm problem is real; paying $110/month to avoid it is the wrong trade. Decouple them:

1. Replace `ignore = "/bin/false"` in `sp-proxy/netlify.toml`, `faculty-console/netlify.toml`, `13_Faculty_Resources/Outreach/alex-tour/netlify.toml` (and `metrics/netlify.toml`) with a directory-scoped check:

   ```toml
   [build]
     ignore = "git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- ."
   ```

   Exit 0 = skip (free), exit 1 = build. Paths are relative to the site's base directory, so `.` is exactly that site's inputs.

2. Turn **off** the per-site "Deploy failed" email on those three sites — it will now fire on routine no-op cancels and is no longer trustworthy there.

3. Extend the **existing** `maintenance-production-canary.yml` (already runs daily at 09:20 UTC and already curls the live sites) with a Netlify-API check: list deploys in state `error`, drop any whose message matches `Canceled build due to no content change`, and open an issue for anything left. That alarm tests what actually matters — the live site serving — instead of Netlify's build bookkeeping.

Leave the two learner sites on `ignore = "/bin/false"` in this tier. They are built from the whole repo, and #590's required checks point at their **deploy previews**, which are free and unaffected.

**Acceptance criteria (machine-verifiable):**

- [ ] A docs-only merge to `main` increases the production-deploy count for `sp-interview-proxy`, `clerkship-faculty-attest` and `psychiatry-workforce-tour` by **0**.
- [ ] A merge touching `sp-proxy/**` increases `sp-interview-proxy`'s production-deploy count by **exactly 1**.
- [ ] A deliberately broken production deploy on `psychiatry-workforce-tour` opens a GitHub issue within 24 h; a no-op cancel on the same site opens **none**.
- [ ] Team **Production deploys** on Billing → Usage falls below **400/period**.
- [ ] The daily credit total on the usage chart falls below **600 credits/day** within one week.

**Human review gate — Josh:** confirm before merge that (a) the two learner sites are explicitly excluded from this change, (b) you accept losing the Netlify "Deploy failed" email on the three satellites in exchange for the canary alarm, and (c) ruleset 21202405's required checks are untouched. *Note: a ruleset PUT that omits `bypass_actors` silently drops them — read, modify, re-send.*

**A2. Decide the fate of `therapymatch-maine`'s database.** ~$17/month. Pick one:

| If… | Do |
|---|---|
| The app is dormant | Delete the Netlify DB / Neon project, remove `DATABASE_URL` + `NETLIFY_DATABASE_URL`, and stop the 15/30-min production smoke. |
| It must stay reachable | Stop the smoke test so Neon can autosuspend (default 5 min idle), and delete the deploy-preview and branch-deploy values of `NETLIFY_DATABASE_URL` — three contexts probably means three live endpoints. |
| It is real and needed | Move it to Neon directly rather than through an extension Netlify has discontinued. |

**Acceptance criterion:** `Database compute` on the daily credit chart is **< 5 credits/day for three consecutive days**.

**Human review gate — Josh:** confirm `therapymatch-maine` has no live users and the data is expendable or backed up. Deleting a database is yours to do; I will not.

### Tier 2 — this month · a further ~$50/month · one real trade-off

**B1. Put the two learner sites on a release train.** After Tier 1 the residual is almost entirely `une-ms3` + `mmc` at 2 × ~350 merges/month = ~700 production deploys ≈ $70/month. Point both sites at a `release` branch instead of `main`, and fast-forward `main → release` on a schedule (a GitHub Action, 3×/day). That is 6 production deploys/day instead of ~24.

**The trade-off, stated plainly:** learners see a change up to ~8 hours after it merges instead of within a minute. For a curriculum site that is almost certainly fine, and it buys a genuine benefit — the live site stops changing under a student mid-session. A `workflow_dispatch` on the same action gives you a one-click "ship now" for anything urgent.

**Acceptance criteria:** production deploys for the two learner sites ≤ **7/day**; `https://une-ms3-psychiatry.netlify.app` and the mmc site serve the latest `release` SHA within 15 minutes of each scheduled promotion.

**B2. Cap auto-recharge.** It is on, it has fired 7 times in 25 days, and nothing told you. Billing → Credit balance → *Configure auto recharge*: set a deliberate monthly ceiling (2 packs/month is a sensible tripwire). With a cap, a runaway loop shows up as a stalled deploy you notice in minutes rather than a $200 invoice you notice in a month.

**B3. Add a cost line to the monthly maintenance run.** `maintenance-monthly-review.yml` already exists. Have it record production deploys, database compute and bandwidth for the closing period, and fail if production deploys > 400 or database compute > 100 credits.

### Tier 3 — watch items, no action yet

**C1. Preview bandwidth.** Have the a11y / Lighthouse / benchmark / link-monitor jobs skip `/audio/**` on preview URLs — they don't audit media. Saves ~200–400 credits/month today and scales with PR volume. Previews already ship LFS pointer stubs by design; keep it that way.

**C2. Audio bandwidth is the next line to become #1.** Learner audio is ~8 GB/period and doubling. At 20 credits/GB, 200 GB/month would be $27/month. Note that `chore/audio-out-of-git` does **not** help here — moving audio out of git changes GitHub LFS bandwidth, not Netlify egress. If this becomes the top line, the answer is a different *host* for audio, not a different git layout. Watch, don't act.

**C3. CLI hygiene.** On `interview-room-faculty-preview`, use `netlify deploy` (draft/branch — free) for iteration and reserve `netlify deploy --prod` (15 credits) for the version faculty are meant to see.

### What NOT to do

| Don't | Why |
|---|---|
| Optimise build times | Build minutes are not metered. The Lighthouse plugin adding 1 min to `reconnect-tools` builds costs **$0**. |
| Delete the ~10 dormant sites *to save money* | They generate no builds and no measurable bandwidth. Delete them for **security hygiene** (public, unauthenticated, inside the deploy-token blast radius) — that was already on the 2026-09-10 list. |
| Turn off deploy previews | Free, and they are the PR gate. |
| Upgrade the plan tier | Every path costs $0.0061–$0.0067/credit; tiers are within ~3% of top-up packs. **There is no arbitrage in plan tiers — usage is the only lever.** Revisit only if steady-state lands above ~5,000 credits/month, where the $33 / 5,000 tier is marginally better. |
| Downgrade to Free | Loses 3 concurrent builds and password-protected projects. |

---

## 4. Projected end state

At the measured cadence of ~349 merges to `main` per month:

| Scenario | Production deploys/mo | Credits/mo | Monthly cost |
|---|---:|---:|---:|
| **Today** | ~1,750 | ~29,800 | **~$200** |
| **After Tier 1** | ~780 | ~12,800 | **~$90** (−55%) |
| **After Tier 1 + 2** | ~266 | ~5,000 | **~$40** (−80%) |

Tier 1 is one PR plus two dashboard toggles. Tier 2 is one scheduled workflow and a branch change on two sites.

---

## 5. Confidence and what could be wrong

| Claim | Confidence | Basis / caveat |
|---|---|---|
| Rate card and the 12,761-credit breakdown | **Very high** | Read from the dashboard; every unit rate re-derived and matched to published rates exactly. |
| Production deploys are 83% of spend | **Very high** | Dashboard line item, 706 × 15 = 10,590. |
| Per-site waste (513/fortnight) | **High** | Computed from `git diff-tree` over 163 first-parent merges. Assumes each satellite's inputs are confined to its base directory — true per each `netlify.toml`. |
| Ignore-cancels are free | **High, unverified in this account** | Netlify docs list failed/cancelled deploys as non-metered. Confirm by watching the credit chart for one week after A1 — that is why it is an acceptance criterion. |
| `therapymatch-maine` owns the database compute | **High** | Only project with `NETLIFY_DATABASE_URL`; Neon is the only installed extension; flat daily burn is characteristic. |
| The smoke test is *why* it never suspends | **Moderate** | Inferred from the `ci/smoke-cadence` branch name and the flat rate. That repo is not on this machine — verify in the Neon console. |
| Savings estimates (±25%) | **Moderate** | Scale directly with merge velocity. If cadence rises, savings rise with it. |

Per-project *production-deploy* counts are not exposed anywhere in Netlify's UI — the "Builds by project" table mixes free previews with billed production deploys and truncates at five rows. The attribution above is derived from git, which is why it is stated as merges-that-touched-inputs rather than read off a dashboard.

---

## 6. Next best step

**Land one PR: directory-scoped `ignore` on the three satellite sites + the deploy-health check bolted onto `maintenance-production-canary.yml`.** It is the single highest-value change here — roughly $110/month, no learner-facing risk, and it restores a *trustworthy* production alarm rather than removing one.

## 7. Innovative next idea — make cost a governed invariant

This repo already runs a decisions registry (`decisions.json` + a drift checker) precisely so that "code can no longer keep enforcing a decision nobody makes any more." The ignore-hook retirement is the mirror-image failure: a defensible decision was made, the cost model underneath it changed, and nothing in the system noticed for seven days and $70.

Add a **cost invariant** to the same machinery:

- `bin/check_deploy_budget.py` — pulls the Netlify usage figures, computes production-deploys-per-merge for each site, and fails the weekly maintenance run when any site exceeds its declared budget.
- Record the rule as a decision: *"A satellite site deploys to production only when its own directory changes. The production alarm lives in the canary, not in Netlify's deploy-failed email."*
- Add `credits_per_merge` to the monthly governance digest so the number is visible before it becomes an invoice.

That converts "we edited `netlify.toml` and accidentally 10×'d the bill" from a thing you discover on a billing page into a caught regression — the same treatment every other invariant in this repo already gets.
