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
| H4 | **One collector route with a per-client edge rate limit:** `config.path: '/api/ev'` and `config.rateLimit` (120 requests / 60 s per domain and IP). The custom path disables `/.netlify/functions/ev`; no redirect remains. The handler also rejects other paths with 404 before preflight, body reads or storage. | `ev.mjs` exported `config` and path guard | **Edge enforcement is unverified until deployment.** Invalid rules may be ignored. The handler guard prevents alternate-path writes but cannot prevent invocation charges. |
| H5 | **Per-counter ceiling.** A `(site, week, key)` counter stops at `counterCeiling` (500) and is marked `capped: true`. After that, posts cost one read and no write. Conditional writes preserve the cap against stale requests. A countable capped cell **withholds the whole real aggregate** with an explicit incomplete-data response; it is never silently omitted. | `_shared/counters.mjs` `increment`, `aggregate/cohort_function.mjs`, `bin/read_counters.mjs` | non-integer ceiling → switch disabled |
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
   500, which withholds the real aggregate until the contaminated collection is reviewed.
   This is denial of reporting, not a successful but silently incomplete report. A ceiling
   well above any real week (cohort 4–10) makes a capped cell a reliable **tamper signal**: any capped cell should be investigated.
4. **Cost of a flood.**
   - Below the rate limit, each accepted batch costs a function invocation and each key normally
     costs 2 Blobs operations. Three bounded attempts allow up to 6 application-level
     operations per key under conflicts/errors; the SDK can additionally retry transport errors.
     An already capped key costs 1 read and no write.
   - After enforcement activates, Netlify answers 429 at the edge without invoking the function.
     Netlify documents an enforcement delay of up to 10 seconds after crossing the threshold;
     120/min is not a strict invocation or spend ceiling.
   - While writes are off (H1), a request costs one invocation and no Blobs operation.
   - Netlify's credit billing still meters invocations, so a sustained multi-IP flood is a cost
     risk. The daily deploy-health check doesn't watch usage. Watch the team usage page after
     switch-on.
5. **Concurrent requests and failed writes.** Reads request strong consistency and every write
   uses the read ETag (`onlyIfMatch`) or `onlyIfNew` for creation. A conflict re-reads rather
   than overwriting; after three attempts the event is dropped (the collector still returns
   204). No unconditional fallback is allowed. The cap remains sticky if a later ceiling is
   raised or omitted. Counts are still not exact-once: exhausted retries can lose events, and
   a transport failure after a successful write can cause a retry to count again. These are
   approximate event counters, not unique learners or authenticated measures.
6. **IP processing at the edge.** H4 means Netlify counts requests per client address at its
   edge. The function still never reads, logs or stores an IP. Netlify's platform request logs
   already process it, but the learner-facing privacy notice (L8 D3) should mention rate
   limiting if it describes processing at all.
7. **Routing and edge enforcement are not yet proven live.** Local tests pin the exported
   configuration and execute the handler, not Netlify's edge. A missing or invalid rate-limit
   rule can leave the canonical route unthrottled even though alternate-path writes are blocked.

## Counter integrity and incomplete reports

The integrity regressions in `metrics/tests/integrity.test.mjs` hold a stale creation/update
until another request reaches the ceiling. Both cases erased `capped` before the fix; ETag
conditions now reject the stale write, and the retry observes the terminal cap. Tests also
exercise the pinned `@netlify/blobs` 11.0.2 SDK with a fake HTTP transport, including its
`modified: false` result for HTTP 412. Missing ETags and exhausted conflicts fail closed.

The real cohort reader uses strong listing/reads and refuses its whole feed when any countable
row has `capped: true` or an integer count at/above the configured ceiling (including legacy
rows without the marker). `GET` then returns HTTP 503 with
`{"error":"incomplete","reason":"capped-counters"}` and no totals, counts, keys, sites or
weeks; `HEAD` has the same status and no body. No clean-looking zero or partial sum, derived
share or funnel is published. This intentionally withholds the entire real feed, even if the
cap is outside the wired rotation calendar. Pre-armed rows remain excluded by H6, and the
synthetic feed and disabled defaults are unchanged. The local reader marks these rows as
`capped` even with `--raw` and warns `INCOMPLETE` for a countable week.

This does not give the multi-row report a transactional snapshot while collection is changing.
For a final analysis, freeze collection before reading and investigate any integrity warning.
Do not clear a cap to make a report pass; choose an explicitly reviewed clean collection/armed
week instead. No store reset or collection activation is part of this change.

References: [Netlify Blobs API](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
and the pinned SDK's `getWithMetadata`, `setJSON`, `onlyIfMatch` and `onlyIfNew` contracts.

## Route coverage and first-deploy verification

The earlier rewrite limited `/api/ev` but left the default function URL callable. The collector
now uses the documented custom-path registration and attaches the limit to that same path.
Do not restore the rewrite to work around a routing failure: it targets an endpoint disabled
by `config.path`. An earlier sp-proxy routing incident is why registration must be checked on
this collector's own deployment before enabling collection.

Local regression tests reject the direct function URL (including query, suffix and trailing
slash variants) and other noncanonical paths, with no body read or store acquisition even
when the injected collection is armed and the deploy is published production. Canonical POST
and OPTIONS still work, including query strings. H1 and H2 continue to test disabled collection
and nonproduction/unpublished contexts separately.

At the **first separately authorized deploy**, with `collection.json` still off/unarmed:

1. Confirm the deployed function manifest registers only `/api/ev` and that post-processing
   accepts the 120/60 per-IP-and-domain rate-limit rule. A successful deploy alone is not proof.
2. Confirm `/api/ev` returns the expected 204/CORS response for an allowed-origin preflight and
   drops a synthetic POST without opening the store.
3. Probe `/.netlify/functions/ev`, its trailing-slash/suffix/query variants, and noncanonical
   API paths. They must not reach a collector write path; check function invocation evidence,
   not just a static HTTP response. Any platform normalization must resolve to the protected
   route or reject the request.
4. In an authorized bounded test, confirm 429 enforcement on `/api/ev` after allowing for the
   documented delay of up to 10 seconds. Verify blocked requests do not invoke the function.
5. If routing, rule acceptance or enforcement is absent, leave collection off and fix the
   deployment configuration before considering activation. Do not create the site or change
   keys as part of local verification.

References: [Netlify function routing](https://docs.netlify.com/build/functions/configuration/#routing)
and [Netlify rate limiting](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/).

## Switching on (L8, not before the determination letters are in hand)

One reviewed PR:

1. Set `"writes": "on"` and `"armedFromWeek": "<first ISO week of collection>"` in
   `collection.json`.
2. Update the H1 tripwire test in `hardening.test.mjs`.
3. Optionally set a fresh `store`.

Then, separately, set `CLERKSHIP_ANALYTICS` on the learner sites (send kit §6). Neither step
alone collects anything.
