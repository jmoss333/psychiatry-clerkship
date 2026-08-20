# Instrument Reproduction Audit

Audit of all **22 shipped HTML tools** against the rule added to `CLAUDE.md` on 2026-08-20:

> **THE LIBRARY TEACHES ADMINISTRATION; IT DOES NOT REPRODUCE INSTRUMENTS.**

Method: for every tool, grep the **built** output (`_build/ms3/tools/*.html`, i.e. what actually
ships) for named instruments, then check whether the tool reproduces **item text / anchor ladders
/ field labels** or merely names the instrument and points at the official form.

Auditing the build rather than the source matters: the source tree is not what learners load.

## Result: four reproductions, not two

| Tool | Instrument | Reproduces? | What ships | Attribution present |
|---|---|---|---|---|
| `cssrs.html` | **C-SSRS** | ❌ **YES — full** | Q1–Q5 verbatim stems + Q6 lifetime structure | Posner et al. 2011; Columbia Lighthouse Project; "use your institution's official form" |
| `screeners.html` | **PHQ-9 + GAD-7** | ❌ **YES — full** | **15 of 16** canonical item stems + the complete 4-point anchor set (`Not at all` / `Several days` / `More than half the days` / `Nearly every day`) | "(Spitzer, Kroenke, Williams)" — **no permission notice** |
| `bfcrs.html` | **BFCRS** | ❌ **YES — full** | All **23 items** with their 0–3 anchor ladders | "(Bush, Fink, Petrides, Dowling & Francis, …)" |
| `withdrawal.html` | **COWS** | ❌ **YES — full** | All **11 items**, 45 verbatim anchors (**added by WP-02, PR #375**) | **NONE — no attribution at all** |
| `withdrawal.html` | **CIWA-Ar** | ⚠️ partial | 10 items with abbreviated prose descriptors, not the published anchor ladder. **WP-20 would make this full reproduction** (SPEC §1.2) | **NONE** |
| `violence.html` | **FRST** | ✅ no | Generic warning-sign checklist authored in-house (`Escalating motor restlessness / pacing`, `Clenched fists or jaw…`). Says *"use the official version for the exact items."* | names FRST, points to official |
| `mse.html` | MMSE / MoCA | ✅ no | Named only: *"Use a tool (MoCA/MMSE) when indicated."* | n/a |
| `decision-aids.html` | CIWA score bands | ⚠️ borderline | Band thresholds only, no items | — |
| `shelf-mode.html` | CIWA | ✅ no | Mentioned in a question stem | n/a |
| Other 14 tools | — | ✅ no | no instrument content | — |

### Two corrections to the assumed picture

1. **FRST is *not* a reproduction case.** `violence.html` ships an in-house warning-sign list and
   explicitly directs the learner to the official form for the exact items — it already complies
   with the new rule. The FRST problem is a *different* one, still open as **ODC-4**: the attested
   prose page sends students to a **Brøset (BVC)** tool that does not exist, while the tool
   implements a generic list and the page describes FRST. That is a mismatch, not a reproduction.

2. **The third case is `screeners.html`, and there is a fourth.** PHQ-9 + GAD-7 ship in full, and
   BFCRS ships all 23 anchor ladders. Neither was on the known list.

## ⚠️ The rule is in direct tension with the Wave 4 plan

`SPEC_Withdrawal_Instrument_Redesign_v1.md` §1.2 and §2.2 are **entirely verbatim anchor
ladders** — that is what "drop-in content spec" means. Under the new rule:

- **WP-02 (already merged)** added 45 verbatim COWS anchors, and did so *with no attribution on
  the page at all*.
- **WP-20** would add the full verbatim CIWA-Ar ladder plus all-eight-rungs perceptual items, and
  its acceptance criteria require every clinical string to trace to a SPEC line.
- **WP-22** would add BFCRS examination procedures.

**This needs a scope decision before Wave 4 proceeds.** The plausible positions:

| Option | Consequence |
|---|---|
| **A. Rule covers copyrighted instruments only** | C-SSRS retires (WP-06R-a). PHQ-9/GAD-7 likely stay (Pfizer's standard form footer states no permission is required to reproduce, translate, display or distribute — **verify against the current form before relying on it**). CIWA-Ar/COWS/BFCRS need their status established. WP-20 largely survives. |
| **B. Rule covers all instruments** | WP-02 must be partly reverted, WP-20 redesigned around elicitation-without-anchors, and `screeners.html` + `bfcrs.html` join the retirement queue. |
| **C. Rule covers learner-facing scoring surfaces, not teaching pages** | Turns on whether a tool that *computes a score* is an administration aid or a copy. |

**I am not making this call**, and per the rule as written an agent must not infer that a given
instrument is exempt. What is not in doubt: **C-SSRS retires** (Josh's decision, WP-06R-a) and
**Stanley-Brown is never programmed** (WP-06R-b builds a rehearsal tool that reproduces nothing).

Copyright status of CIWA-Ar (Sullivan 1989), COWS (Wesson & Ling 2003) and BFCRS (Bush et al.
1996) is **not established here** — all three are widely reproduced in public materials, which is
evidence of practice, not of permission. Establishing it is an author/counsel task, not an agent
one.

## Immediate gap from this repo's own work

`withdrawal.html` carries **no instrument attribution whatsoever** — not Sullivan for CIWA-Ar,
not Wesson & Ling for COWS. WP-02 added 45 verbatim anchors to that page without adding any.
Independent of how the scope question lands, attribution should be added; queued as **WP-02b**
(agent-executable: citation + link to the official form, no clinical content authored).

## Recommended enforcement, once scope is decided

A gate in `check-static-site.mjs` that fails on known verbatim item stems, seeded from the
retirement list. Deliberately **not** built yet: encoding the wrong scope in a gate is worse than
no gate, and per amendment A3 no new gate is promoted to hard while CI is down.
