# Design-Plan Alignment + Orientation Video — Review & Integration Plan

**Author:** Joshua Moss, MD | Psychiatrist · **Date:** 2026-07-02
**Reviews:** (a) `Resident platform tools.zip` — the Claude-design handoff (`design_handoff_resident_platform_tools/`), and (b) `Inpatient_Psych_Orientation.mp4` — NotebookLM video overview.

---

## Part 1 — Does the design plan align? **Yes — strongly. It's the same project.**

The design handoff is an independent spec (`Resident Feature Specs.dc.html` + four tool mockups: Agitation Ladder, Night Float Companion, Family Meeting Simulator, Brief Psychotherapy Coach). It converged on the **same architecture and conventions** we've been building to — which is strong validation, not a conflict.

### Where it matches us (near-identical)

| Dimension | Design plan | Our workstream | Status |
|---|---|---|---|
| Stack | Static, no-build, React-18-UMD tools in iframes; `nav.json`/`reviewed.json`/`topic_meta.json`/`quizzes.json` | Same | ✅ match |
| Local-policy handling | `[[LOCAL: …]]` chips, "unverified until attested via `review-attest.html`" | `LOCAL_POLICY` tokens → `LocalChip` "⚠ Confirm locally" | ✅ same idea |
| Fact discipline | `[[VERIFY: …]]` before shipping | `evidenceThrough` + pending-attestation | ✅ match |
| Safety framing | "Not a clinical decision support device; rehearsal/reference/reflection; no PHI by design" | Identical | ✅ match |
| Top builds | Agitation, Night Float, Family Sim | Same three | ✅ match |
| Fold-in layers | Flag/evidence-surveillance + ABPN/ACGME milestone tagging | Same (my §2.4 + merged milestones) | ✅ match |
| Deferred | Discharge planning (~80% local policy) | Same | ✅ match |
| Agitation core | Driver-first triage, de-escalation-first, LOCAL order-set overlay, Richmond 2012 / Wilson 2012 | Exactly what I built | ✅ match |

Bottom line: **my working agitation prototype is a functioning MVP of the design plan's "F1 · Agitation Ladder."** Same citations, same driver-first logic, same unverified-local-chip discipline.

### Where it diverges — the decisions to make

**A. Feature set at slots 4–5 (genuine, both defensible).**

| | Design plan | Our build so far |
|---|---|---|
| F4 | **Canon Quiz Bank** (surface the existing `quizzes.json` 79 decks / 437 Q + audio + SRS) | Treated as already-built; I built **EPA + Milestones** instead |
| F5 | **Brief Psychotherapy Coach** | I built **PD Team Formulation** |
| EPA feedback | **DEFER** — "duplicates the GME system of record; needs governance answers first" | I built it (framed as formative/self-owned) |
| PD formulation | **DEFER** — deliver later as a case-type in F3 + a module in F5 | I built it |

The design plan's **EPA-defer reasoning is worth taking seriously**: an entrustment tool that looks like assessment can collide with your program's official evaluation system of record and raises governance/FERPA questions. My build mitigated this (self-owned, "not the official instrument"), but the cleaner path may be to defer EPA until the GME governance question is answered, and instead ship the near-zero-cost **Quiz Bank surfacing** as the fast win. *Recommendation: adopt the design plan's F4=Quiz, F5=Brief-Psych ordering for the shared roadmap; keep my EPA and PD builds as attested, ready-to-slot v2 modules (PD folds into Family Sim as a case type, exactly as the design suggests).*

**B. Target architecture — one hub vs. two (biggest structural call).**
The design plan builds the resident tools **into `clerkship-hub-deploy/` as a new "Residency" nav section** (residents as a *track* on the shared hub, `rp_*`-namespaced storage that never touches `cw_*`). I've been targeting **`mmc-resident-deploy/`** as a separate twin. The one-hub approach matches the ClerkshipOS multi-tenant direction and lets MS3 ↔ resident material cross-reference. *Recommendation: adopt one hub + a Residency track + `rp_*` keys.* (Decision needed — see questions.)

**C. Operational bug the design caught — my prototype has it.**
The design plan flags: *"bundle CDN dependencies locally — ward wifi already blanks the hub when `marked` fails to load."* My `agitation-trainer.html` and `_TEMPLATE.html` load React from **cdnjs at runtime** — which will fail on bad ward wifi. **This is a real fix:** vendor React/ReactDOM locally (like `marked.min.js` already is) so tools work offline. High priority.

**D. Naming + conventions to adopt from the design plan (cleaner than mine):**
`tools/rp-agitation.html` + `rp-agitation-scenarios.json` (rp- prefix); `rp_*` localStorage; names "Agitation Ladder," "Night Float Companion / First Call."

**E. Richer mechanics in the design's F1 to fold into my prototype (it's the better target spec):**
1. A persistent **least-restrictive "ladder rail"** (Environment → Verbal → Offered PRN → Involuntary → Restraint) as the visual mental model.
2. **Evolving-scenario state machine** — de-escalation can *fail* and force the next rung (my MVP is linear; this is the v2 engine).
3. **Hard teaching stops** — benzo-in-delirium / restraint-first cannot be skipped until the rationale is expanded (mine shows a hazard but lets you proceed).
4. **"Call your senior" present in every decision, scored correct** in ≥2 scenarios.
5. **SRS integration** — wrong-turn tags enqueue into the existing `cw_srs_v1` store (exact card contract in `review.html`).
6. **Restraint-equity teaching** in a debrief (≈1.85× adjusted odds of restraint for Black inpatients — already in `agitation.md`).

### Integration plan (concrete, no re-work thrown away)

1. **Converge on one spec:** treat the design handoff as the authoritative target spec; treat my built prototype + pack + shell + QA harness as F1's working MVP + the shared infrastructure. They are the same design; my merged roadmap already covers sequencing.
2. **Apply 3 fast refits to the existing prototype:** (i) vendor React locally [C]; (ii) rename to `rp-agitation.html` / `rp-agitation-scenarios.json` + `rp_*` keys [D]; (iii) add the ladder-rail + "Call your senior" option [E1, E4]. ~half a day.
3. **Defer the richer engine (E2/E3/E5/E6)** to F1 v2 — my MVP is shippable now for attestation.
4. **Make two decisions (below), then update the merged roadmap** to reflect the reconciled feature set and target repo.
5. **Everything else already aligns** — no conflict in conventions, safety model, or evidence discipline.

---

## Part 2 — Is the video a good option for the orientation page? **Yes — with two gates before it goes live.**

**What it is:** a ~7:51, 720p (H.264/AAC, 35 MB) NotebookLM whiteboard-animation overview. Structure: title → 6-section agenda (Welcome · Daily Unit Workflow · The Clinical Encounter · Clinical Reasoning · The Single Safety Rule · Day One Essentials) → **Daily Rhythm** timeline (pre-round → rounds → post-round → midday → afternoon → end of day) → **4-Layer Formulation** (Body & Brain → Psych Syndrome → Relationships → Recovery) → Day-One logistics → **Final Thoughts** (Be Curious · Be Structured · Escalate early and often).

**Why it fits:**
- **Content is on-target and on-philosophy.** The 4-Layer Formulation is biopsychosocial-to-recovery; "escalate safety concerns early and often" is the exact message of the agitation trainer ("Call your senior is always correct") and Night Float. It maps directly to `orientation.md` / `welcome.md` and the resident-depth sections.
- **Right length & format** for an orientation page; web-friendly MP4 consistent with your existing `audio_oe/` media library.
- **Appropriately generic** — the slides I reviewed stay at the teaching level (a PHI icon, frameworks, "escalate early"); I saw **no invented local policy or doses**, which is consistent with our no-local-policy rule.

**Two gates before publishing (both required):**
1. **Accessibility — captions + transcript.** NotebookLM ships neither, and this is exactly the audit's Issue 11 (media accessibility manifest). A clinical education video needs a caption track (`.vtt`) + a readable transcript (residents watch on silent ward machines; 508/ADA). *I can generate both from the audio.*
2. **Your end-to-end review + attestation.** The narration is AI-generated (NotebookLM voices). Watch it through once for accuracy and tone, then attest it via `reviewed.json` like any other content. Label it as an AI-generated overview for transparency.

**Housekeeping:** a copy already sits in staging (`OPENEVIDENCE RAW FILES TO REVIEW/Inpatient_Psych_Orientation.mp4`) — de-dupe to one canonical file. Integration: host under a `media/` (or reuse the audio pattern), embed with `<video controls poster>` + `<track kind="captions">`, add a visible "Transcript" expander, add a cache header for video, and cross-link from `welcome.md`. Note `orientation.md` currently isn't in `nav.json` (flagged by the QA harness) — adding the video is a good reason to wire that page in.

**Verdict:** a strong, low-effort addition that raises the orientation page's quality — publish it once captions/transcript exist and you've attested the narration.

---

## Decisions needed
1. **Target architecture:** one hub + "Residency" track (design plan, recommended) vs. separate `mmc-resident-deploy`.
2. **Feature set 4–5:** adopt Quiz Bank + Brief-Psych (design plan) and hold EPA/PD as attested v2 modules — vs. keep EPA/PD as F4/F5.
3. **Video:** want me to generate captions + transcript and wire the accessible embed now?

*Joshua Moss, MD | Psychiatrist*
