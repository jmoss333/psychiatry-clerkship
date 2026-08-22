# Feedback Impact Review — Kaitlin Taplinger's Verbatim Email vs. the Plans

**Prepared:** 2026-08-20 · reviewed before the Claude Code handoff executes
**Question:** does her exact wording change anything the plans already say?
**Answer: the plans hold on 4 of 5 points. Her exact words change three things — one content gap (worksheets), one sequencing call (TUSM adoption makes WP-34/WP-37 urgent), and one framing correction (what she actually offered in this email). Amendments applied to the curriculum plan and handoff; nothing in the handoff's execution order breaks.**

---

## 1 · Point-by-point: verbatim vs. what we built

| Her words | Plan's mapping | Verdict |
|---|---|---|
| "Down the road if you go for a grant again/publication, we can brainstorm… I usually have 5-6 MS3s every 6 weeks and usually a couple of MS4s between MMC and SHH" | A5 (grant/publication + pilot cohort) | **Covered.** Note the detail: MS4s rotate between MMC and **Spring Harbor** — the pilot cohort spans both sites, which matters for any future evaluation design (two clinical contexts, one curriculum). |
| OSCE live fails / offline patient doesn't advance — "Is this because it is offline?" | A1 — both faults known; offline non-advancement is the MockProvider regex finding, NOT an offline limitation | **Covered.** Her direct question deserves the direct answer in the reply: *no — that's a real defect you found, not an offline limitation.* |
| "Were they AI generated with you then proofreading them?" | A2 — answer honestly; flip to attested-only default (WP-37) | **Covered, but see §3 — sequencing changes.** |
| "Students could get a bit lost… is this a starting point?… diving deeper into each topic" | A3 (entry contract, WP-34) + A4 (vignettes, sub-blocks, go-deeper rails, WP-35) | **Covered** — the Reading Room and rails ARE the A4 answer. See §3 for WP-34 timing. |
| "Do you think the therapy section could be built up some?… more **info, examples, worksheets**, etc." | Part B → the curriculum package | **Two-thirds covered.** Info ✔ (Reading Room + registry). Examples ✔ (module vignette, what-to-say scripts, scenario table, family-meeting scripts). **Worksheets ✘ — the named gap. See §2.** |

## 2 · Delta 1 — the worksheet track (her word, our gap)

She asked for "info, examples, **worksheets**, etc." The package delivers the first two; worksheets were anticipated in B0's governance (author originals; never reproduce Linehan/Guilford or Beck Institute materials; verify anything "public domain" before assuming) but never became a deliverable. **They now are — as Phase 2**, after the current PR lands, so the AUTHOR-GATED PR stays reviewable:

| Worksheet (all authored from scratch, license-clean) | Ties to | Audience / reading level |
|---|---|---|
| **Today's One Thing** — BA activity-scheduling sheet (pick one activity, schedule it, rate mood before/after) | Module §3 BA micro-dose | Patient-facing · plain, ~8th grade |
| **Cool the Body First** — distress-tolerance pocket card (paced breathing, temperature, movement — original instructions; cite DBT conceptually, reproduce nothing) | Module §3 skills | Patient-facing · plain |
| **Before the Family Meeting** — one-page family prep sheet (what to bring, what you can always tell us, warning signs to watch) | Module §6; family handout concept | Family-facing · plain |
| **My First Week Out** — discharge-bridge sheet (appointments, early warning signs, who to call, one scheduled activity per day) | Module §2c / discharge tool | Patient-facing · plain |

**Governance riders (non-negotiable):** each registered in the `instrument_provenance.json` extension (WP-38) as an original in-house instrument; none reproduces the Stanley–Brown form (the safety-planning tool WP-06R-b owns that surface and its own provenance question); all are faculty-attested before any student or patient sees them; patient/family-facing text follows the reading-level and safety-language norms.

## 3 · Delta 2 — sequencing: her TUSM page makes two small WPs urgent

*"For my TUSM, I have a separate course page… I think that your work on this page could be such a valuable addition."* That is an **adoption signal with a concrete integration surface**: she intends to point TUSM students at the site. Two items already on the books change priority because of it:

- **WP-37 (flip the question bank to attested-only, drafts opt-in — AGENT, ~1h):** must land **before or alongside** the therapy PR, as its own small PR. The moment an external course page links in, "46 unattested drafts served by default" stops being an internal debt and becomes the answer to the provenance question she already asked. Landing WP-37 first makes Josh's reply to her clean and true in real time.
- **WP-34 (the entry contract page — AUTHOR-GATED):** her "starting point?" question is exactly what this page answers, and an external cohort arriving via TUSM will hit the site without any framing at all. Recommend Josh draft it next; it is small, and it is the page her students see first.

**Handoff change applied:** WP-T0 preflight now includes "confirm WP-37 has landed or open it as a companion PR first."

## 4 · Delta 3 — framing correction: what this email actually offers

The Taplinger plan's A5 says she offered her CL reading list "twice" — that offer is **not in this email** (it presumably lives in earlier thread context). What this email concretely offers: (a) grant/publication brainstorming plus **access to a real pilot cohort** (5–6 MS3s per block + MS4s across MMC/SHH), and (b) the TUSM integration. Two implications:

- The Reading Room's D10 line ("under construction with CL colleagues") **stays** — it is still the right collaboration hook — but the reply should *ask* for the CL list rather than assume it is incoming from this note.
- Her closing ("AI is not a strong point for me… leaning into it") shapes the second-reviewer ask: frame it as **clinical/OSCE content review** — the thing she is expert in — not as reviewing AI systems. She reviews cases; the governance architecture handles the AI part. That framing also lowers the bar for a yes.

## 5 · Reply additions (drop into the Part C draft, Josh's voice)

Three sentences to add to the existing Part C draft reply:

> **On worksheets** — yes, and you named the exact gap: the therapy build now has a reading layer and a bedside-skills module, and the next phase is a small set of original worksheets (activity scheduling, distress-tolerance card, family-meeting prep, first-week-out plan) written in-house so there are no licensing problems — I'd gladly take your eye on those drafts.
>
> **On TUSM** — I'd be glad to have the site linked from your course page. Before you do, I'm finishing two things so it's ready for students arriving cold: a front-door page that says plainly "this is a starting point, here's the six-week path," and a switch so the question bank serves only faculty-reviewed items by default. I'll tell you when both are live.
>
> **On your offline OSCE question** — direct answer: no, it isn't because it's offline. You found a real defect — the offline patient advances only when phrasing matches what its scripted engine expects, which penalizes exactly the kind of skilled interviewing you were doing. It's the central finding of an audit I'd already run, and you reproduced it in one sitting. I'm rebuilding that layer before it goes near students.

## 6 · What does NOT change

- The two-layer architecture, the six-week arc, the wiring map, the 59-entry registry, and every WP-T0…T7 step of the handoff — all stand.
- The AUTHOR-GATED stop line stands (and Delta 2 reinforces it).
- D10 held for the Kaitlin merge stands.
- The verification state stands — nothing in her email touches citations.

**Net effect on the handoff:** one preflight line added (WP-37 companion PR), one Phase 2 section added (worksheets — explicitly NOT built in the current PR), one flagged decision added for the PR description. Everything else executes as written.
