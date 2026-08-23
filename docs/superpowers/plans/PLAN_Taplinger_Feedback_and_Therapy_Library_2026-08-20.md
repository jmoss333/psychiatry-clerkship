# Response Plan — Taplinger Feedback + Therapy Evidence Library

**Feedback from:** Kaitlin Taplinger, DO — Clerkship & Advanced Clerkship Site Director, Adult Inpatient CL Psychiatry, MMC Portland · email 2026-08-20
**Prepared:** 2026-08-20 · companion to `CLINICAL_AND_INSTRUMENT_REVIEW_2026-08-20.md` and `IMPLEMENTATION_HANDOFF_2026-08-20.md`

---

## Part A · Her feedback, mapped

She gave five things. Four of them land on findings the internal review already made, which is worth noticing: **an outside clerkship director, working blind, converged on the same defects.** That is the strongest external validity signal this project has.

| # | What she said | What it actually is | Status |
|---|---|---|---|
| 1 | *"For both OSCE cases — I couldn't get the live function to work, only offline. When it's offline… the AI responses don't advance the interview despite different attempts at questioning."* | **Two separate faults, both known.** | See A1 |
| 2 | *"My favorite part… practice questions and psychopharm… Were they AI generated with you then proofreading them?"* | A provenance question from a potential adopter. Currently unanswerable without qualification. | See A2 |
| 3 | *"I worry students could get a bit lost in the website. Do you explain to them that this is a starting point?"* | Missing entry contract. | See A3 |
| 4 | *"…I would also want to make sure they are diving deeper into each topic."* | Review findings F35/F36 + the Tier 1 depth gaps. | See A4 |
| 5 | *"Do you think the therapy section could be built up some?"* | The build. | **Part B** |

### A1 · The SP interview — she reproduced the audit

**Fault one: Live can't work, and doesn't say why.** `pack.status = "draft-pending-attestation"` and `POST_PACK_STATUSES = ['reviewed','attested']`, so every live POST returns 403. That gate is correct and must stay — it is currently the only thing standing between learners and an assessment layer we know is invalid. But **it fails silently**, and your outreach email instructs people to "Confirm Live patient mode… Save & test connection," which cannot succeed. Two actions:

- **WP-08f (new, small, AGENT):** make the 403 explain itself. *"Live patient mode is closed while this case pack is pending faculty review. You are in practice mode."* Right now the user infers "broken."
- **Correct the instructions** in any further outreach. Don't send people at a door that's bolted.

**Fault two: the offline patient doesn't advance — and that is the finding, not a limitation of being offline.** The MockProvider is a deterministic regex engine. Disclosure is gated on a rapport counter that increments on matched "reflection" phrases, and three of the flag regexes penalise textbook-correct technique (`you should`, `at least`, `slow down`) with −2 rapport, which also locks gates for two turns. So a skilled interviewer who doesn't happen to phrase things the way the regex expects gets a patient who deflects indefinitely — **which is exactly what happened to her.**

She is a CL psychiatrist and a clerkship director who writes OSCEs, and she could not advance either case. That is the validity verdict, delivered from outside.

**Action:** tell her plainly. It costs nothing and it buys enormous credibility — and it converts her from a confused user into a collaborator on a known problem. Then WP-08 → WP-30 → WP-31 → WP-32 fix it.

**And the opportunity:** she writes OSCEs for TUSM and has used AI in them. Both peer reviewers said the single systemic weakness in this project is **single-reviewer attestation** — the SP packs are attested by their author one day after he wrote them. *She is the second reviewer.* Ask her.

### A2 · "Were they AI generated with you then proofreading them?"

Answer honestly, because she's asking as someone deciding whether to put this in front of TUSM students. The current facts:

- 192 items; **143 attested** by you on a single date (2026-07-05); **46 unattested drafts are served to students**, marked with a "⚠ Pending faculty review" chip.
- The file-level `_note` says *"All 144 items attested"* — in a file with 192 items. That's a stale string, not a claim you made on purpose, and **WP-17 corrects it.**
- The attestation record is `{status, at, by}` with no binding to the text it approved, and content drifted four days after sign-off with no re-attestation.

**Recommendation, and this is the moment to make it:** flip the default to **attested-only, drafts opt-in**, before any wider adoption. That resolves ODC-7 in the conservative direction, and it means your answer to her is clean: *"Drafted with AI, reviewed by me item-by-item; the site serves only reviewed items by default, and anything unreviewed is labelled and off by default."*

Also note what she praised — **practice questions, psychopharm, and the longitudinal/weekly option**. Those are the surfaces to protect through the remediation. The confidence-calibration and mastery engine sitting under them is, per both reviewers, the best-engineered thing in the repo.

### A3 · "Students could get lost… is this a starting point?"

She's right, and it's a cheap fix with outsized effect. **New WP: the entry contract.** One page, first thing in the nav, that says out loud:

- **What this is:** a scaffold and a starting point, not a textbook.
- **What it is not:** a substitute for your assigned reading, your team, or supervision.
- **The six-week path:** what to do in week 1 vs week 5.
- **The daily loop:** what to open at 6:45am, what to use before rounds, what to use after.
- **What this deliberately does not cover** — naming the gaps is what makes the rest trustworthy.

This also absorbs the "rotation layer" content the inpatient reviewer said was missing entirely: the note as the 2am intervention, PRN order anatomy, the nursing questions, what students actually get wrong, and the emotional/professional-identity page.

### A4 · "Diving deeper into each topic"

Maps to review F35 (no illustrative vignettes anywhere in 03/05) and F36 (the *Acute inpatient management* block — the part a student most needs to scan under time pressure — is the least scannable prose on every page). Per high-yield page, three changes:

1. A **3–4 sentence anchoring vignette** at the top (~80 words, big retention/transfer return).
2. Break the management paragraph into **3–4 labelled sub-blocks**.
3. A **"go deeper" rail** — 3–5 primary sources with one line each on why.

Item 3 is precisely what Part B produces. **Her requests #4 and #5 share the same infrastructure.**

### A5 · Thread-level opportunities worth acting on

| | |
|---|---|
| **Her CL reading list** | She's offered twice. Take it — it seeds Part B's CL domain and it's a collaboration hook that costs her nothing. |
| **Second reviewer** | She is the answer to the single systemic governance weakness. Ask specifically: *"Would you be second reviewer on the SP case packs?"* |
| **Pilot cohort** | 5–6 MS3s per 6-week block plus MS4s, and Punit Matta on the resident side. That is a real pilot — and it makes the "read ten transcripts a week for the first month" loop possible. |
| **Grant + publication** | She raised it twice. The publishable thing is **not** "we built an AI standardized patient." It's *"we built one, audited it against measurement standards, found the assessment layer invalid, and here is the governance architecture that caught it."* That paper is more useful, more honest, and much harder for a reviewer to reject. The fail-closed pack-status gate that stopped her from reaching the invalid scorer is the story. |

---

## Part B · The therapy evidence library

### B0 · Governance first — this is the third instance of the same trap

C-SSRS. Then Stanley–Brown. Now publisher content and therapy worksheets. **Decide the rule before collecting anything:**

- **Do not host publisher PDFs on the Netlify sites.** Two public sites redistributing Elsevier PDFs is a straightforward licence violation and a far bigger exposure than either instrument.
- **Do not bulk-download from Elsevier or any publisher via automation.** Systematic downloading is what triggers institutional access suspension — and the account that gets suspended is **Tufts'**, not yours. Human-paced, article-at-a-time, and only what you'll actually read.
- **Do build:** citations, DOIs, PMIDs, open-access status, links that resolve through the institutional proxy, and **your own annotations**. The annotation is the product. Anyone can list papers.
- **Worksheets need the same check.** Linehan's DBT handouts (Guilford) and Beck Institute materials carry explicit limited photocopy licences; reproduction beyond that requires permission. Either author originals in your own voice, or use genuinely unrestricted sources — US federal/VA-produced materials are typically public domain, but **verify each one** rather than assuming.
- Register all of it in the `instrument_provenance.json` pattern from the remediation plan, extended to cover worksheets and reproduced figures.

### B1 · Architecture — use what already exists

Do not build a new parallel system. You have all four pieces:

| Layer | Tool | Why |
|---|---|---|
| **Discovery** | Claude in Chrome, in your authenticated session | Only step that genuinely needs your Tufts/Hirsh login |
| **Verification** | `Scholar_Sidekick` MCP (`resolveIdentifier`, `checkOpenAccess`, `checkRetraction`, `verifyCitation`, `formatCitation`, `auditBibliography`) | Already on your machine. `checkOpenAccess` decides link type; `checkRetraction` is non-negotiable for a teaching library |
| **Store** | `zotero` MCP | The working library — full metadata, your notes, exportable |
| **Publish** | `evidence_registry.json` + a new therapy reading page + `topic_meta.evidenceIds` | Schema v2, already CI-validated |

**Side effect worth naming:** the review found `evidence_registry.json` is ~90% decorative — 7 of 71 `topic_meta` entries carry `evidenceIds`, and 26 of 36 registered sources are referenced by nothing. Populating it with a real, curated therapy domain is what turns it from ornament into infrastructure. **Kaitlin's request and review finding F19 close together.**

### B2 · Domain map — what to collect

Organised around what an inpatient MS3 and a PGY-2 actually need, **not** a survey of modalities. 3–6 core papers per domain plus 1–2 "go deeper."

1. **Common factors, alliance, rupture and repair** — the part that transfers regardless of modality
2. **Brief interventions that fit a 20-minute inpatient contact** — behavioural activation, MI for ambivalence, distress tolerance, sleep/circadian as intervention
3. **Safety planning and means counselling** — links to the tool being built (WP-06R-b)
4. **CBT for psychosis**, and what is realistic on an acute unit
5. **DBT principles on a non-DBT unit** + **Good Psychiatric Management** for BPD — the review flagged GPM as absent, and it is the right generalist frame for your setting
6. **Family psychoeducation and family interventions** — your strongest domain; Leff, Falloon, McFarlane, Pinsof and Diamond are already in the spine decks
7. **Motivational interviewing** — SUD and treatment ambivalence
8. **Trauma-informed care on an inpatient unit** — recognition and stance, not delivery of PE/CPT
9. **Psychodynamic listening for the inpatient team** — you already have a `Psychodynamic Therapy Reading List` directory to draw from
10. **Therapy in the medically ill / CL** — demoralization vs depression vs grief, brief supportive work, desire for hastened death. *This is Kaitlin's home turf and the natural place to merge her list.*
11. **What to recommend at discharge, and how to write it** — the practical endpoint students never get taught
12. **Evidence limits, honestly** — allegiance effects, dropout, the equivalence debate. The OMM page shows you already write this well.

### B3 · The Chrome workflow

**Phase 1 — discovery** (Chrome, authenticated, one domain per session):
PubMed with Tufts LinkOut → capture PMID, DOI, title, journal, year, abstract, and the proxy-resolvable link. Prefer systematic reviews, meta-analyses, landmark trials, and guideline chapters over primary studies, except where the primary study *is* the teaching point.

**Phase 2 — verification** (Scholar Sidekick, no browser):
`resolveIdentifier` → `checkOpenAccess` → `checkRetraction` → `formatCitation`. Anything retracted or unresolvable is dropped, not flagged for later.

**Phase 3 — triage** (you):
Keep / cut / annotate. **One sentence per paper: why an MS3 should read it and what to take from it.** A paper without an annotation doesn't ship — that rule is what keeps this from becoming another decorative registry.

**Phase 4 — publish:**
`evidence_registry.json` entries → therapy reading page → `topic_meta.evidenceIds` wiring → the "go deeper" rails from A4.

**Rate discipline, non-negotiable:** human-paced, no systematic harvesting, no bulk PDF retrieval, stop if any publisher throttles or challenges. Cap each session.

### B4 · Output shape

Staging file `therapy_library.json`, promoted in curated batches into `evidence_registry.json`:

```
{ id, domain, citation, pmid, doi, oaStatus, linkType: "open" | "proxy",
  annotation, learnerLevel: "ms3" | "resident" | "both",
  linkedPages: [...], addedBy, addedAt, verifiedAt }
```

No PDFs. No abstracts copied wholesale — a one-line annotation in your words, not the publisher's.

### B5 · Sequencing

This is Wave 5 work and **does not collide** with Waves 1–4 of the remediation. It can run in parallel: Claude Code is on the code, this is on the content, and they touch different files. The one join is `evidence_registry.json`, which is CI-validated — so batches must pass `validate_registry_schemas.py` before merge.

---

## Part C · Draft reply to Kaitlin (rewrite in your voice)

> Kaitlin — thank you, this is exactly the kind of feedback that's useful.
>
> On the sim: both faults you hit are real and I know what they are. Live mode is deliberately closed right now — the case pack is pending faculty review and the server refuses live sessions until it isn't. That's working as intended, but it fails silently and just looks broken, which is on me. What you got instead was the offline version, and you found its actual problem: it's a deterministic engine, and if your phrasing doesn't match what it expects, the patient deflects forever no matter how good the interview is. I've had it independently audited and that's the central finding — the scoring measures whether you said certain words, not whether you got the information. I'm rebuilding that layer before it goes near students. **You're the first person outside the project to reproduce the finding, and you did it in one sitting.**
>
> Which leads to an ask: would you be willing to be second reviewer on the case packs? Right now I'm attesting my own material, which is the weakest part of the whole governance model, and you write OSCEs.
>
> On the practice questions — drafted with AI, then reviewed by me item by item. About a quarter of the bank hasn't been through that review yet; those are labelled, and I'm switching the default so the site serves only reviewed items unless someone opts in. I'd rather tell you that than have you find it.
>
> On students getting lost — agreed, and there's no page that says "this is a starting point." I'm writing one.
>
> On therapy — that's the one I most wanted someone to say. I'm building it out with a proper reading list behind it, and I'd love your CL list as the backbone of that section. Also, if you're up for it: grant and paper. I think the honest version — *we built this, audited it, found the assessment layer wasn't valid, and here's the governance that caught it* — is a better paper than the usual one.

---

## Consolidated new work items

| id | Item | Owner | Effort |
|---|---|---|---|
| WP-08f | Make the SP 403 explain itself | AGENT | 30 m |
| WP-34 | Entry contract page — "this is a starting point," six-week path, daily loop, what's not covered | AUTHOR-GATED | — |
| WP-35 | Per-page: anchoring vignette + sub-headed management block + "go deeper" rail | AUTHOR-GATED | — |
| WP-36 | Therapy evidence library — B2 domains through the B3 workflow | JOSH + AGENT | ongoing |
| WP-37 | Flip qbank default to attested-only, drafts opt-in (resolves ODC-7 conservatively) | AGENT | 1 h |
| WP-38 | `instrument_provenance.json` extended to worksheets and reproduced figures | AGENT | 2 h |
| — | Correct the SP setup instructions in outreach | JOSH | 5 m |
| — | Ask Kaitlin: second reviewer on SP packs | JOSH | 5 m |
