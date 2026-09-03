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
| `withdrawal.html` | **CIWA-Ar** | ✅ retired 2026-08-28 | Was: 10 items with abbreviated prose descriptors. Removed by author's call; the page now carries a rights stub and no CIWA scoring surface. WP-20 (full ladder) is closed by that disposition | Sullivan 1989, PMID 2597811 |
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

> ## ✅ RESOLVED 2026-08-23 — **Option A.** The rule covers copyrighted instruments only.
>
> Joshua Moss, MD, clinical author-of-record. Consequences, in force from this date:
>
> | Instrument | Standing under Option A |
> |---|---|
> | **C-SSRS** | **Retires** — copyrighted, licensed by the Columbia Lighthouse Project, reproduced verbatim on two public sites. → **WP-06R-a**. **Stage 1 executed 2026-08-27:** all six stems, the branching logic, and the triage engine removed; `cssrs.html` now ships as a rights stub (attribution, PMID 22193671, cssrs.columbia.edu, crisis block kept) on the `bfcrs.html` #400 pattern, guarded by `tests/cssrs-retirement.test.mjs`. Stage 2 — the authored administration teaching — remains author-gated. |
> | **Stanley–Brown** | Never programmed. → **WP-06R-b** builds a rehearsal tool that reproduces nothing |
> | **PHQ-9 / GAD-7** | Provisionally stay. Pfizer's standard form footer states no permission is required to reproduce, translate, display or distribute — **this must be verified against the current form before it is relied on.** → **WP-02c** |
> | **BFCRS** | **RESTRICTED — resolved 2026-08-23 (WP-02d).** Published by URMC under site-wide Web Terms of Use: contents *"may not be distributed, modified, reproduced, or used, in whole or in part without the prior written consent of the University of Rochester Medical Center"*, with use granted only for *"personal non-commercial use."* No instrument-specific licence exists on any URMC BFCRS page or PDF, and absence of a copyright notice is not a licence (works published after 1 March 1989 need none). **All 23 items and anchor ladders removed from `bfcrs.html`; WP-22 blocked on written permission, not on an open question.** |
> | **COWS** | **Permission real, scope wrong (WP-02d).** The published instrument carries, in Appendix 1, *"This version may be copied and used clinically."* That licenses clinical copying; it does not plainly reach verbatim reproduction on a public educational website — and WHO dropped the line when re-typesetting. **WP-02's 45 verbatim anchors in `withdrawal.html` are outside the grant on a conservative reading. Flagged, not reverted, pending the author's call.** |
> | **CIWA-Ar** | **RETIRES — resolved 2026-08-28 (author's call, Joshua Moss, MD).** The WP-02d finding stands: "Not copyrighted and may be reproduced freely" circulates widely, but every located instance is a note added by a *reproducer*, in three different wordings, and the attribution to the 1989 article itself could not be verified (closed access). Rights that cannot be established are not rights. **The 10 abbreviated descriptors and the CIWA scoring surface are removed from `withdrawal.html`**, which now carries a stub on the `bfcrs.html` / `cssrs.html` pattern — attribution (PMID 2597811), the direction to score from the institution's approved form, and no items. Guarded by `tests/ciwa-retirement.test.mjs` and by five `instrument_rights.json` signatures (status `retired`), so a re-add hard-fails both builds. Administration teaching is authored separately and is not yet published, as with BFCRS. The ILL request is no longer blocking — it would now only reopen a closed question. **COWS is untouched on the same page under its own interim waiver.** |
> | **WP-20 / WP-21 / WP-22** | WP-22 (BFCRS) is blocked on **written permission from URMC**, not on an open question. **WP-20 is now closed by the 2026-08-28 CIWA-Ar retirement** — it proposed adding the full verbatim CIWA-Ar ladder, which the disposition forecloses; reopening it needs a new rights finding, not an implementation decision. WP-21 stays blocked on COWS. Full evidence: `DECISION_BRIEF_2026-08-23.md` §2 |
> | **WP-02b** | Unblocked and **done** — attribution added to `withdrawal.html`; see below |
>
> Option A resolves the scope question. It does **not** license an agent to infer that any
> further instrument is exempt: an instrument is exempt only once its status is established and
> recorded in the table above.

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

**Done 2026-08-23.** `withdrawal.html` now names both instruments and links their primary
sources, verified against PubMed the same day: CIWA-Ar — Sullivan et al., *Br J Addict*
1989;84(11):1353–7 (PMID 2597811); COWS — Wesson & Ling, *J Psychoactive Drugs* 2003;35(2):253–9
(PMID 12924748). The block also directs scoring to the institution's complete current form
rather than to this page. No clinical content was authored.

## Recommended enforcement, once scope is decided

A gate in `check-static-site.mjs` that fails on known verbatim item stems, seeded from the
retirement list. Deliberately **not** built yet, for one reason only: encoding the wrong scope in
a gate is worse than no gate. The second reason has expired — **amendment A3 was retired in #396**
(Actions billing restored 2026-08-22), so when this gate is built it should ship **hard**, not
warn-only.

> **Built 2026-08-27 — shipped hard.** `instrument_rights.json` (root registry, schema-paired,
> every entry citing its decision record) + `check-static-site.mjs` §11 via
> `instrument-rights-gate.mjs`, tested by `tests/instrument-rights-gate.test.mjs`. The table
> above is now executable: retired/restricted signatures hard-fail any build; the COWS interim
> ("flagged, not reverted") is encoded as a **file-scoped waiver** citing this document — remove
> the waiver while the anchors ship and the build fails; PHQ-9/GAD-7 is encoded `provisional`,
> confined to `screeners.html`, and arms automatically if WP-02c resolves against it. Signature
> discipline, verified empirically before seeding: signatures detect the reproduction that
> shipped, never plain bedside language ("thoughts of killing yourself" lives legitimately in
> `mse.html` and the SP pack and is deliberately NOT a signature), and scan scope is
> learner-rendered HTML only. Status changes remain governance acts: change
> `instrument_rights.json` only with the decision record that authorized the change. The dormant
> `validated-instrument-line` dose-waiver context for `bfcrs.html` was retired in the same
> change (it waived nothing since #400 but would still have validated a smuggled dose line).

## A withdrawal must leave a route (INV-IR2, 2026-09-03)

Three retirements had removed the only copy of an instrument the learner had, and left pages
that could say what they no longer showed but not where to get the real thing. `cssrs.html` and
`bfcrs.html` named their custodians in a footnote; the CIWA-Ar tab pointed at "your institution's
protocol" and nothing else. That is the **ODC-4 shape** — an attested page directing a student to
something they cannot reach — arrived at from the opposite direction.

**The route is a link, never a mirror.** Hosting a PDF of C-SSRS, BFCRS or the Stanley-Brown form
would be *broader* redistribution than the excerpts that came down, and would breach the very
URMC term ("may not be distributed … in whole or in part") that forced the BFCRS removal. So
every route points at the rights-holder's own download. This is not a limitation of the fix: for
BFCRS the learner now gets the scale, the Training Manual & Coding Guide and standardized-patient
exam videos — considerably more than the 23 anchor ladders ever gave them.

| Instrument | Route recorded | Access |
|---|---|---|
| **C-SSRS** | Columbia Protocol forms for healthcare settings + free training (~20 min) | free |
| **BFCRS** | URMC's scale, coding guide and per-item scoring videos | free, no registration |
| **CIWA-Ar** | the unit's protocol form **first**; CSAM's posted copy as a reference | see caveat below |
| **COWS** | NIDA's one-page PDF — what makes "score from the real form" followable | free |
| **PHQ-9 / GAD-7** | phqscreeners.com — forms, scoring, ~80 translations | free |
| **Stanley-Brown** | suicidesafetyplan.com — the authors' own form and training | free for individual use |

**CIWA-Ar is the honest exception.** It is the one instrument here with no custodian still
distributing a form — the 1989 paper is paywalled and the originating Addiction Research
Foundation publishes none, which is the same fact that made its rights unestablishable on
2026-08-28. CSAM is a professional society posting a copy, not a licensor. Linking to someone
else's posting is not reproduction by this library, and it is **not permission either**: the
route must never be read back as a rights finding, and `tests/ciwa-retirement.test.mjs` pins
that the page keeps saying so.

Mechanics: `officialSource` on every registry entry (schema-required for every `retired` and
`restricted` one — a withdrawal cannot be recorded without a route), pinned per page by
`requireOfficialSourceLink`, enforced in `instrument-rights-gate.mjs` (check A: the page ships
the recorded `formUrl`; check B: a `link-only` route must be an absolute custodian URL, so a
mirrored copy cannot be recorded as official — check B runs on every build, governed or not,
because mirroring is a rights problem everywhere). `bin/check_instrument_links.py` re-checks the
far end; it is **dev-only and report-only** because external link checks are flaky and both
Netlify and the agent sandbox block these hosts, so a CI gate there would fail for reasons
unrelated to the links.

**Routes are wayfinding, not dispositions.** Refresh a rotted URL freely; `status` still moves
only with a decision record. `tests/instrument-rights-gate.test.mjs` pins all six statuses so a
future link fix cannot ride a status change in with it.

Two things this change deliberately did **not** do, both author calls:

1. **WP-02c is not resolved.** Secondary sources consistently report that Pfizer released the PHQ
   family and GAD-7 with no copyright restriction on 2010-07-21, and that the current footer reads
   *"No permission required to reproduce, translate, display or distribute."* That is exactly what
   WP-02c asks — but it is second-hand, which is the **same shape of evidence that failed for
   CIWA-Ar**, where every "may be reproduced freely" notice turned out to be a reproducer's
   addition. It is recorded in the registry as evidence, under a heading saying so. Closing WP-02c
   needs the author to read the footer on the current form at `phqscreeners.com`; the link is now
   on the page, which makes that a two-minute task.
2. **Five faculty attestations are now stale** — `cssrs.html`, `bfcrs.html`, `withdrawal.html`,
   `screeners.html`, `suicide.md`, all attested 2026-06-30/07-09. Following the precedent of #400
   and #413, which also edited retired surfaces without touching `reviewed.json`, the ledger is
   left alone: re-attestation goes through the faculty console.

Adjacent stale pointers fixed in the same pass, all of them the removals' own wake: the
safety-planning page advertised "the interactive C-SSRS screener" that has not existed since
#411, the legacy root `index.html` still described "the 6-question Columbia screener with
branching and risk triage", and `longitudinal_case.json` still labelled the stub "C-SSRS
Screener".

**Still open, and not touched here:** `violence.html` tells the learner to "use the official
version for the exact items" of the FRST and gives no route — the same dead end, but not a
*removal*, since that page ships an in-house checklist and never reproduced the FRST. The FRST
has no public distribution point found; a route would have to be the MMC EHR workflow plus the
developers. That is ODC-4's remaining half and stays with ODC-4.
