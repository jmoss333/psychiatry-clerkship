# Usage analytics: a first-party aggregate counter service

**Date:** 2026-09-04
**Status:** designed, not implemented. Approved in brainstorming; awaiting spec review, then an
implementation plan.
**Decision this serves:** improving the curriculum. Not assessment, not research, not individual
tracking.

## The question

Which pages and tools does anyone actually use, and where do learners abandon a multi-step tool?
Those two questions, and deliberately no others. Everything below is sized to answer exactly them.

## What already exists

Three facts about the platform shaped this design more than any preference did.

**The instrumentation largely already exists.** `calib_log.js` and `sm2_apply_grade.js` write
`cw_practice_events_v1`; roughly twenty-five other `cw_*` keys hold quiz attempts, SM-2 grades,
calibration, progress, reflection and pretest state. The Progress view already renders an
analytics view of the learner's own data. None of it is ever transmitted. **What is missing is
aggregation, not measurement.**

**There is no learner identity anywhere.** Learners open a public URL; no account, no login, no
cookie. The only credential in the platform is the faculty console's. Two consequences: MS3 vs
resident is answered for free by which site was hit, and "what did learner X do" is unanswerable
without introducing authentication — a different and much heavier project (FERPA education
records, institutional sign-off from both UNE and MMC, IRB if ever published). That project is
not this one.

**The built site ships a CSP that forbids this by default.** `build_deploy.py` emits:

```
connect-src 'self' https://sp-interview-proxy.netlify.app
```

A browser on either learner site can POST to exactly two origins. The endpoint's location is
therefore not a free choice, and no third-party tracker could ever be added silently — it would
fail loudly at the CSP. This is a feature and the design preserves it.

## The constraint that drives everything: cohorts are tiny

An MS3 psychiatry block is roughly 4–10 students; the Sanford resident group is comparably small.
Standard web analytics assumes thousands of users, where a page-view count reveals nothing about
any individual. **At n = 6 it can.** "Someone opened the safety-planning tool at 02:14 on a
Tuesday" is potentially identifying, and it concerns people this platform's owner also evaluates.
If a learner later says "I struggled with suicide risk assessment," a timestamped log could
corroborate or contradict them. That is a power asymmetry worth designing away rather than
managing.

Three rules follow, and they are cheap because the two chosen questions do not need what they
forbid:

1. **Counters, not rows.** No raw event is ever written to disk.
2. **Weeks, not timestamps.** The finest time resolution stored is the ISO week.
3. **Suppress small cells.** Any reported cell below n = 5 renders as `<5`.

Re-identification is not mitigated here; it is made structurally impossible, because the data
required to do it never exists.

## Scope

**Answers:** most- and least-used pages per site; pages nobody opens; traffic by week; whether a
tool is opened at all; and for each instrumented multi-step tool, how many sessions reached each
step.

**Does not answer, by choice:** per-item question-bank difficulty; faculty console usage;
individual completion; sequences or paths; anything cross-visit. Each was considered and dropped —
they carry risk or cost the two questions do not need. Adding any of them is a new design.

## Architecture

### Event vocabulary

Two kinds, both drawn from a build-time allowlist:

| Kind | Shape | Source of truth |
|---|---|---|
| Page view | `page:<slug>` | `site_build/shipped_pages.json` |
| Tool step | `tool:<tool>:<step>` | `site_build/analytics_events.json` (new), one step list per instrumented tool |

`analytics_events.json` sits beside `shipped_pages.json` in `site_build/` with a paired
`analytics_events.schema.json`, following that file's precedent exactly. Placing it there rather
than at the repo root is deliberate: `test_validate_registry_schemas.py`'s `PAIRS` tuple pins
*root* registries, and a root file would add a fourth contract to keep in sync for no benefit.

The allowlist deriving from `shipped_pages.json` is the point, not a convenience. That file became
the single source of "what ships" in #517/#522, after Case-of-the-Week pages shipped by a second
producer stayed invisible to faculty for two months. Reusing it means **what can be measured and
what ships are the same set by construction.** A new page becomes reportable automatically; a page
that does not ship cannot be reported on.

The endpoint rejects any key not on the allowlist. Free text can therefore never enter the store,
which closes the accidental-PHI vector before it can open.

### Where it runs

A new Netlify site, `clerkship-metrics`, with one function; plus its origin added to the CSP's
`connect-src` in `build_deploy.py`.

The alternative — putting the function in `sp-interview-proxy`, whose origin the CSP already
allows — was rejected deliberately. That function holds the LLM API key and has
`REDTEAM_CHECKLIST.md` gating every deploy and every model or pack change. Analytics has no
business sharing a deployment bundle with it, and coupling them would mean every analytics change
re-opens a security checklist. A reviewable one-line CSP widening is the cheaper risk.

### Stored shape

This is the complete schema:

```json
{ "site": "ms3", "week": "2026-W36", "key": "tool:interview-room:step2", "n": 74 }
```

Storage is Netlify Blobs (`@netlify/blobs`, already a proven dependency at 11.0.2 in `sp-proxy`).
The function validates, increments, and discards the request.

**Never stored:** IP address, user agent, session identifier, geolocation, referrer, or any
timestamp finer than the ISO week. The function must not log the request either — Netlify function
logs would otherwise reintroduce IPs that the design promises not to keep.

### Client emitter

Roughly forty lines, build-injected the way `clinical-warm.css` and crisis blocks already are, so
it lands on both sites from one source.

- Transport is `navigator.sendBeacon`; failure is silent and total. If the endpoint is down, slow,
  or blocked, the page behaves exactly as it does today. Analytics must never be able to degrade
  the library.
- A random visit id lives **in memory only** and is never transmitted. Its sole purpose is
  client-side dedup, so a refresh does not double-count a step and a funnel counts sessions rather
  than events.
- Honors `navigator.doNotTrack` and Global Privacy Control: when either is set, nothing is sent.
- Opt-out persists to `cw_analytics_optout_v1`. The `cw_*` prefix is required — `check-static-site.mjs`
  hard-fails any other namespace, and computed keys draw a warning, so the key must be a literal.

### Reporting

A static faculty-facing page reading the counters: top and bottom pages per site, dead pages, a
weekly traffic line, and a funnel bar per instrumented tool. Cells below n = 5 render `<5`. No new
authentication — it can sit behind the faculty console's existing credential.

## Gates

Every gate below runs offline, so `bin/verify.sh` covers it without network.

| Gate | Asserts |
|---|---|
| node test — emitter contract | the emitter transmits no identifier, no free-text key, no timestamp finer than a week |
| Python test — allowlist integrity | every allowlisted `page:` key resolves to a page in `shipped_pages.json` |
| `check-static-site.mjs` rule | built output contains no event key outside the allowlist |
| node test — failure isolation | a rejecting or unreachable endpoint leaves page behavior unchanged |
| Python test — CSP | `connect-src` contains the metrics origin and nothing unexpected |

Per `CLAUDE.md`, adding a CI step trips `bin/check-verify-coverage.py`, the scheduled-workflow
contract digest, and `test_validate_registry_schemas.py`'s `PAIRS` if a root registry is added.
The implementation plan must budget for all three.

## Open decision for the author

**Should learners see a notice?** Aggregate, non-identifiable counters on a public site do not
legally require consent. But these are the author's own students, and the platform's credibility
with them is an asset worth more than the data.

Recommendation: ship a one-line footer — *"This site counts page and tool usage in aggregate to
improve the curriculum. No accounts, no cookies, no individual tracking. Opt out."* It costs
nothing, it is true, and it forecloses the conversation that happens if someone discovers the
endpoint later. Deciding this before implementation is cheaper than retrofitting it.

This is a governance decision, not an agent decision, and is recorded here unresolved.

## Rollout

1. Endpoint and store, with the allowlist derived from `shipped_pages.json`. No client yet.
2. Emitter behind an off-by-default build flag; verify with the gates that it sends what is
   claimed and nothing else.
3. Enable on the resident site first — smaller surface, and residents are likelier to raise a
   concern early, which is useful.
4. Enable on the MS3 site.
5. Reporting page once at least one full rotation week of counters exists; a dashboard built
   against zero data designs for imaginary shapes.

## Why not the alternatives

**A pseudonymous event log** would allow true path analysis and let new questions be asked of old
data. Rejected: at n = 6 it holds a re-identifiable behavioral record of people the author grades,
it creates a retention and deletion obligation, and it would need defending to two institutions.
Neither chosen question needs sequences.

**A privacy-first vendor** (Plausible, Fathom) would be far less to build and maintain. Rejected on
data residency: learner behavior would transit a third party requiring disclosure to both
institutions, and it would mean widening the CSP to a tracker origin, which is precisely the
property this platform currently has and should keep.

**Local-first voluntary export** would collect nothing and risk nothing. Rejected as the primary
approach: it yields data only from volunteers, and a biased sample makes curriculum decisions
worse than no data. It remains a good complement if learners ever want their own data.

**Netlify Analytics** is server-side, needs no client JS and no consent banner, and Netlify already
holds these request logs by virtue of serving the sites — so enabling it discloses nothing to
anyone new. It cannot measure drop-off, so it does not replace this design, but it is a legitimate
zero-build way to get the traffic half immediately if that is wanted before this ships.
