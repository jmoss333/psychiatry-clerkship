# Audience-as-data: deferred, with a trigger (decision `two-audience-copy-accepted`)

**Status:** decision record. Owner's answer given in a Cowork session on 2026-10-16; this spec
is the `rationaleRef` for the `decisions.json` entry and changes no code.

## What is being deferred

The resident site is built by **copying the finished MS3 build and patching it**
(`13_Faculty_Resources/_automation/site_build/resident_section.py`, the
`copytree_with_virtiofs_retry(MS3, OUT)` call near the top), and nav order is a Python literal
(`_navorder` in `build_deploy.py`). The July architecture review
(`docs/ARCHITECTURE_REVIEW_2026-07-26.md`, S1 and Phase 2) called this the main structural
defect and proposed the fix: manifest rows carrying `audiences[]`, nav generated from the
manifest, one build entrypoint `--audience {ms3,res,...}`, no copytree. The October review
(project doc `claude/architecture-review-2026-10-17.md`, F7 / R8) measured it unchanged and
recommended deferring it **with an explicit trigger** rather than doing it during a period of
~36 commits/day on the build it would rewrite.

## The one question, and the answer

> Is a third learner audience (another institution, nursing, CAP, a family-facing track)
> realistically scheduled in the next six months?

**No** (Joshua Moss, MD, 2026-10-16).

## The decision

1. The two-audience copy-and-patch build is an **accepted limitation** until the trigger fires.
2. **Trigger:** a third learner audience is scheduled, or the number of code locations a new
   resident-only tool must be registered in grows beyond today's list. Either reopens R8 as the
   next structural item.
3. **Revisit backstop:** 2027-04-16 (six months), advisory only.
4. **What agents must not do meanwhile:** re-propose the refactor as a monthly finding, or
   begin it inside another PR. `bin/check_decision_drift.py` carries the decision through the
   `DECISION:` marker on the copytree; a session that wants to change it reads this spec first
   and asks the owner.

## What the marker pins

`resident_section.py` carries `# DECISION: two-audience-copy-accepted` on the copytree line.
The drift checker's rule 3 fails if the marker is removed while the decision stands, and rule 2
fails if the decision is later superseded and the marker is left behind — which is exactly the
moment the refactor would be due.

## Cost of the deferral, stated

Every new surface pays the "register in N places" tax (the resident tool touchpoints list),
and `ADOPTING.md`'s promise that another clerkship can run this library is harder than it
reads. Both are known and accepted for the six months.
