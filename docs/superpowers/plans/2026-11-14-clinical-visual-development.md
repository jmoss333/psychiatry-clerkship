# Clinical visuals for diagnosis, formulation and decision-making

Development plan for the MS3 and resident libraries · November 14, 2026 · Reviewed against `aeab73af68cf68354ca852f456da9e87f29e9c24`

**Start with Case Formulation.** The page tells learners to cross three domains with four Ps, supplies a fictional case, and then asks for a one-sentence formulation. The learner has to construct the grid mentally. Make that relationship visible and ask learners to use it on a second case. If that works, develop a mood–psychosis timeline and a delirium handoff exercise. Together these cover the faculty priorities of diagnosis, formulation and clinical decision-making.

## What is already on the pages

| Review scope | Finding | Design implication |
|---|---|---|
| 110 registered reading routes across both sites | A scan of the 110 primary Markdown sources found 38 with a pipe table, 72 without one, and zero with inline Markdown image, HTML image, figure or SVG markup. The registry also lists 32 tools. The two additional resident source overrides for the welcome and case-index routes had no such figure either. | Count the representations learners encounter. An embedded tool, a video, and the panels the reader adds are outside this source count. |
| 41 readings in Clinical Skills, Core Topics, Acute & Safety, Psychopharmacology, and Family & Relational | 17 had tables. In Psychosis, the existing duration table already supports looking up criteria. In Delirium, two tables already compare presentations and group possible causes. In Case Formulation, the worked example is a list. | Choose the relationship a learner has to infer, such as overlap in time or how a barrier changes a plan. Preserve tables that already do their job. |
| 32 unique Essentials readings across audiences | The existing audit found 15 without a table or figure. Both sites already have an Interview Circle. Decision Aids already covers an agitation ladder, a withdrawal timeline, a delirium screening view, and a toxidrome comparison. | Use these tools for practice. A new ladder or another screening algorithm would duplicate teaching. A welcome page can stay prose. |
| Two live Case Formulation readers | At phone width on MS3 and desktop width on the resident site, the page rendered the grid instruction and worked case as text. Both audiences could open the reading. It is explicitly assigned in resident week 4. The MS3 Essentials pocket guide uses a different four-layer framework. | Pilot the full formulation page once. Give MS3 participants its direct link. Preserve the distinction between the four **Ps** and the pocket guide’s four **layers**. |

The review inventories source structure across the full set and examines selected clinical sections, curriculum placements, and related tools in detail. The live spot check covered Case Formulation. Learner performance and usage were not measured. Reproduce the scope from the [shipped-page listing](../../../13_Faculty_Resources/_automation/site_build/shipped_pages.json), [Essentials audit](../../../bin/check_essentials_visuals.py), and [curriculum paths](../../../curriculum.json). See the [Interview Circle](../../../02_Clinical_Skills/Interviewing/interview-circle.html) and [Decision Aids](../../../04_Acute_and_Safety/Decision_Aids/decision-aids.html).

## Three visuals to develop, in order

The order weighs how well a visual represents the reasoning task, whether learners already have something similar, and the consequences of misreading it. Start with the simplest figure to draw and score. Each later figure earns a separate faculty read.

### 1. Formulation · From a case detail to a plan

**Where.** At “A worked example (fictional composite)” in [Case Formulation](../../../02_Clinical_Skills/Case_Formulation/case_formulation_inpatient_teaching.md). Use the existing 34-year-old patient’s story and retain the one-sentence synthesis. Both sites serve `?page=case_formulation.md`.

**What to draw.** A worked matrix with four rows (predisposing, precipitating, perpetuating, protective) and three data columns (biological, psychological, social). Each filled cell contains one short, case-supported phrase. Use “unspecified” where the case gives no information. Below it, trace one concrete relationship in words: loss of insurance interrupted medication access, and continued lack of access gives the team a practical barrier to address. A factor can appear in more than one row when its role changes over time. Label proposed explanations as hypotheses. Convert the existing worked-example bullets into the matrix to avoid repeating the same reading.

**What the learner does.** Before seeing the worked answer, the MS3 names one precipitant, one protective factor and a related action. The resident explains how the plan changes if access is restored but the spouse is unavailable. The facilitator accepts multiple clinically defensible answers and asks which case detail supports each one.

**Acceptance example.** A learner can explain why the loss of insurance belongs in two rows and propose one feasible next step without filling every cell. On a phone the same learner can read each row with its domain labels.

### 2. Diagnosis · When did mood symptoms and psychosis overlap?

**Where.** Immediately after the existing table under “Duration and mood anchors” in [Psychotic Disorders](../../../03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md), `?page=t_psychosis.md`. Both learning paths assign this reading in week 2.

**What to draw.** Two short fictional histories, each with aligned tracks for a major mood episode and psychotic symptoms. Give the tracks the same dated intervals. Label each interval directly as present, absent, or history unavailable. In one case the documented symptoms overlap. In the other, introduce an interval in which collateral is missing. Use the figure to distinguish what is known from what needs verification. Keep the existing table and its duration, course and exclusion criteria beside this exercise.

**What the learner does.** The MS3 identifies which interval would change the differential and asks one precise collateral question. The resident receives one dated collateral observation and explains how it changes the differential, what uncertainty remains, and which other medical or substance-related explanations still warrant consideration. Use the existing `mania_psychosis_substance_001` reasoning case for further practice.

**Acceptance example.** A blank stretch is never interpreted as symptom absence. The answer key rewards a justified provisional differential. Faculty checks that the visual cannot imply that one isolated interval establishes schizoaffective disorder.

### 3. Clinical decision · A quiet patient whose attention changes across a shift

**Where.** After “How it presents on the unit” and its table in [Delirium](../../../04_Acute_and_Safety/Delirium/delirium_inpatient_teaching.md), `?page=delirium.md`. MS3 weeks 1 and 5 and resident week 1 already use it.

**What to draw.** A shift timeline with three attributed observations: usual baseline from collateral, an apparently reassuring bedside conversation, and a later change in attention reported by nursing. Pair each observation with what was actually checked. Use descriptive words and times, with an explicit gap for an unobserved interval. Show the complete timeline together at the decision point. Place the existing delirium screen and reasoning case within reach.

**What the learner does.** The MS3 gives a short update naming the change, the information source, and what they would communicate promptly to the supervising team. The resident identifies which uncertainty needs immediate assessment and what they would ask the team to reassess. Keep the worked response within local supervision and protocol. Faculty checks that the prompt never suggests waiting for another observation before communicating a concerning change.

**Acceptance example.** A learner notices a quiet change, uses the baseline, and communicates an appropriate next step. The exercise uses original observations with no copied screening items, scores, or prescribing instructions. For editorial review of changes and fluctuations, see [NICE CG103, sections 1.3–1.5](https://www.nice.org.uk/guidance/cg103/chapter/Recommendations).

**Practice links for the two later figures.** Both audience-specific reasoning banks already contain `mania_psychosis_substance_001` and `delirium_vs_psychosis_001`. For the diagnosis pilot, score a supported differential, the missing timeline detail, and a question that could establish it. For the decision pilot, score recognition of a change from baseline, attribution of the observation, and timely communication to the supervising team. Use each rubric with a fresh case. [MS3 reasoning cases](../../../reasoning_cases.json) · [Resident reasoning cases](../../../reasoning_cases_resident.json)

## Next candidates if the pilot earns expansion

| Page and insertion point | Asset to commission | Learner task and reason to wait |
|---|---|---|
| [Collateral Micro-Workflow](../../../06_Family_and_Relational/collateral_micro_workflow.md), “Bring It Back To The Team” | A two-column diagram of what a support person reports and what the team can share within the agreed scope. Carry one attributed fact into the handoff. | Give a 30-second update and identify what needs verification. Existing family-systems cases already rehearse the call. Faculty should check the disclosure boundary in the illustrated example. |
| [Family Meeting Playbook](../../../06_Family_and_Relational/family_meeting_playbook_90min.md), “Before the meeting” | An original overhead illustration of a fictional room paired with participants’ stated roles and preferences. Include a patient-selected support person and, when relevant, a qualified interpreter. | Ask who the patient wants present, who will interpret, and whose goal has yet to be heard. Commission the illustration if learners find the spatial view helpful. Several arrangements can work. |
| [Psychopharmacology Primer](../../../05_Psychopharmacology/Student_Primer_Top10/psychopharmacology_primer_inpatient.md), “Monitoring: know the purpose, result, and next owner” | One annotated fictional handoff from the reason for monitoring through the result to the person responsible for follow-up. | Identify an unassigned follow-up and repair the handoff. Keep schedules and values in the existing text where faculty can update them. |

## Production and review

- [ ] **Storyboard one page.** The content author drafts the labels, one learner prompt, the answer rationale and the text equivalent together. Start with the existing formulation case. Ask the faculty editor to mark unsupported facts, ambiguous cells, and plausible alternative answers before layout. For any new literature claim in learner copy, apply the repository’s [evidence annotation rules](../../agent-guide/content-and-pages.md).
- [ ] **Build the pilot in its reading.** Use a simple Markdown table and an adjacent ordinary paragraph for the first visual. The guide already offers “Compare columns” and “Read by row” on eligible tables. For the two timelines, use selectable HTML text in reading order and an adjacent prose equivalent. Keep all clinical labels and relationships in the reviewed source. The bundled reader does not render Mermaid fences as figures. [Reader implementation](../../../13_Faculty_Resources/_automation/site_build/frontdoor/fd_guide.js)
- [ ] **Check the clinical meaning and accessibility together.** Have a faculty reviewer read the figure alone and the text alone, then answer the same case. Resolve discrepancies. Use direct labels, enough contrast in both themes, and shape or wording for every color distinction. For a separate illustration, provide a short identifying alternative and adjacent text describing the relevant relationships. Use original, fictional material and record authorship and permission for third-party assets. [W3C guidance on complex images](https://www.w3.org/WAI/tutorials/images/complex/)
- [ ] **Verify both sites before trying the figure with learners.** Run the two commands below. Open the affected `?page=` route on each built site at 390 px and desktop width. Check row labels, keyboard operation, screen-reader order, zoom, grayscale print, and that feedback remains reachable. For later external image files, explicitly copy them to both outputs, verify each URL and confirm that changing the image alone changes the affected page’s review fingerprint. An adjacent file is not automatically copied or covered by the Markdown signature. [Build guide](../../agent-guide/build-and-deploy.md) · [Attestation inputs](../../agent-guide/attestation-hashes.md)
- [ ] **Return the changed page to faculty.** The formulation reading’s signature was bound at the audited revision. Review the edited page and answer key on both previews and use the normal faculty console for re-attestation. The educational pilot can use a faculty-reviewed preview. Release decisions stay with the usual release train.

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
python3 bin/check_attestation_hashes.py --explain case_formulation.md
```

## How to find out whether it helped

**One teaching session, then one delayed case.** Prepare two faculty-reviewed fictional cases of comparable difficulty. In one small MS3 or mixed-level teaching group, give half the participants case A with the current prose and case B with the proposed visual. Give the others case A with the visual and case B with prose. Alternate which format participants see first. Use the same instructions and time allowance, collect both answers before feedback, and score against a key written in advance. At the next scheduled teaching session, offer a third unfamiliar case without either aid. Keep audience and denominators visible when interpreting the results.

| Question | What to record manually |
|---|---|
| Did the visual engage learners in the task? | Count who attempted an explanation before seeing the worked answer, out of everyone offered that version. Invite one comment on which label helped or confused them. |
| Did reasoning improve? | Score one point each for a case-supported precipitant, a case-supported protective factor, and a feasible action explicitly linked to a factor. Compare each participant’s visual and prose scores out of three. Record counts improved, tied, and lower. Report the delayed unaided case separately, including how many returned. |
| Did it introduce a misconception? | Note when a learner invents missing information, treats a hypothesis as established, or selects an action unsupported by the case. Record only anonymous rubric marks and comments about the design. |

**Proposed decision rule.** Correct any clinically consequential misreading before expanding. If more learners improve than decline, participation holds up, and the delayed case shows they can still link a factor to an action, try the next figure. If scores are tied near the ceiling or attendance is too small to interpret, revise the cases or repeat once during ordinary teaching. The delayed check describes retention after exposure to both formats. A small pilot guides the next editorial decision and cannot establish effectiveness across the clerkship.

**Experiment for later.** In the formulation exercise, cover the protective-factor row, let the learner give a plan aloud, then reveal a single changed fact about the available support. Ask “Which part of your plan changes, and why?” It can be tried on paper with a folded sheet before anyone develops an interactive version.
