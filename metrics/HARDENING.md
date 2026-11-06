# Usage-analytics collector: hardening (H1–H6) and residual risk

Added 2026-11-05, before the `clerkship-metrics` Netlify site exists. Owner decision
`METRICS-harden` (D2 kit, 2026-11-05).

`/api/ev` is a public, unauthenticated write endpoint by necessity: learners' browsers call it
from two static sites with `sendBeacon`, so there is no secret that could authenticate them (a
token shipped in the page is public). Before this change, the collector would have accepted
forged events from the moment it was deployed. The only check was the `Origin` header, which
browsers set but `curl` and scripts can forge, and the allowlist is in this public repo. The
gates below are about **bounding** forged data, not preventing it.

## The gates

| # | Gate | Where | Fails closed when |
|---|---|---|---|
| H1 | **Writes need an explicit enable flag.** `metrics/collection.json` → `"writes": "on"` **and** a valid `armedFromWeek`. It's a committed file, not an env var, so switching on is a reviewed commit (same discipline as `REAL_COUNTERS_ENABLED`). Default and committed state: `"off"`, `null`. While off, the body is never read, the store is never opened, and the response is the same 204. | `_shared/collection.mjs`, `ev.mjs` | file missing or malformed, any other value, wrong `schemaVersion` |
| H2 | **Only the published production deploy writes.** Checks `context.deploy.context === 'production' && context.deploy.published === true`, using the function's trusted handler context, never the `CONTEXT` env var. Previews, branch deploys, `dev` and old production permalinks (`<deploy-id>--…`) are all refused. | `ev.mjs` `isPublishedProduction` | context missing, partial or non-boolean |
| H3 | **Site-bound origins.** `une-ms3-psychiatry` may post only `site: "ms3"`, and `mmc-psychiatry-residents-sanford` only `site: "res"`. | `ev.mjs` `LEARNER_ORIGIN_SITES` | mismatch → 204, no write |
| H4 | **Per-client rate limit at Netlify's edge**, before the function runs: 120 requests / 60 s per IP, on the `/api/ev` redirect. Code-based redirect rules are on every plan (Free allows 2 per project; this is 1). It's deliberately not `config.rateLimit` in `ev.mjs`, which would need `config.path` and so disable the default endpoint the redirect targets. | `netlify.toml` `[redirects.rate_limit]` | **unverifiable until first deploy:** an invalid rule does not fail the deploy. Check the deploy log's post-processing stage. |
| H5 | **Per-counter ceiling.** A `(site, week, key)` counter stops at `counterCeiling` (500) and is marked `capped: true`. After that, posts cost one read and no write. Readers **exclude** capped cells, because their true value is unknown and may be forged. | `_shared/counters.mjs` `increment`, `aggregate/cohort_function.mjs`, `bin/read_counters.mjs` | non-integer ceiling → switch disabled |
| H6 | **Pre-switch-on weeks never count.** The writer refuses any week before `armedFromWeek`. Readers drop those weeks and, while unarmed, every week. The store name lives in the same file, so writer and readers always open the same store. Moving to a fresh name (e.g. `usage-counters-2027`) is the clean-slate option if a period is ever found polluted. | `_shared/collection.mjs` `weekCounts`, readers | `armedFromWeek: null` → nothing counts; `loadFeed` real path refuses |

Tests: `metrics/tests/hardening.test.mjs`. Removing any single gate line from `ev.mjs` turns at
least one named test red (checked by mutation on 2026-11-05).

## Residual risk (what these gates do **not** fix)

1. **Forged events still pass validation after switch-on.** Any non-browser client can set
   `Origin: https://une-ms3-psychiatry.netlify.app`, send `site: "ms3"` with up to 20
   allowlisted keys, and raise those counters for the **current** week.
   - It can't backdate a week, invent a key, touch the other site's counters (H3), write
     outside published production (H2), or write before arming (H6).
   - Once switched on, forged and real counts look the same.
   - **Treat every counter as an untrusted upper bound.** The L8 analysis plan should say so,
     and shouldn't use these counts as a primary outcome without a corroborating measure.
2. **H4 limits per IP, not in total.** An attacker with many addresses (a botnet, rotating
   cloud IPs) multiplies the 120/min budget.
   - A shared total budget ("per domain") is Enterprise-only.
   - An in-function total budget would need a per-hour or per-minute Blobs counter. That would
     store a timestamp finer than the ISO week the privacy design promises, so it was rejected.
3. **H5 bounds damage per cell, but can hide a real cell.** A forger can push a counter to
   500, which excludes that cell from reports for the week. That's denial of one cell's data,
   not corruption of it. A ceiling well above any real week (cohort 4–10) makes a capped cell a
   reliable **tamper signal**: any capped cell should be investigated.
4. **Cost of a flood.**
   - Below the rate limit, each accepted key costs a function invocation plus ≤ 2 Blobs
     operations; capped keys cost 1 read.
   - Over the limit, Netlify answers 429 at the edge without invoking the function.
   - While writes are off (H1), a request costs one invocation and no Blobs operation.
   - Netlify's credit billing still meters invocations, so a sustained multi-IP flood is a cost
     risk. The daily deploy-health check doesn't watch usage. Watch the team usage page after
     switch-on.
5. **Lost updates.** The read-modify-write without a transaction can lose a count under
   concurrent posts (pre-existing, accepted at cohort scale). It can't inflate a count.
6. **IP processing at the edge.** H4 means Netlify counts requests per client address at its
   edge. The function still never reads, logs or stores an IP. Netlify's platform request logs
   already process it, but the learner-facing privacy notice (L8 D3) should mention rate
   limiting if it describes processing at all.
7. **Rate-limit rule not yet proven.** It can only be confirmed in the first deploy's log
   (post-processing stage). If it's absent, the rule was rejected silently and only H5 bounds a
   single client.

## Switching on (L8, not before the determination letters are in hand)

One reviewed PR:

1. Set `"writes": "on"` and `"armedFromWeek": "<first ISO week of collection>"` in
   `collection.json`.
2. Update the H1 tripwire test in `hardening.test.mjs`.
3. Optionally set a fresh `store`.

Then, separately, set `CLERKSHIP_ANALYTICS` on the learner sites (send kit §6). Neither step
alone collects anything.
