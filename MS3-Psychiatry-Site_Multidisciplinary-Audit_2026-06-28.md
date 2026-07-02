# Multidisciplinary Review Panel — Audit of the MS3 Inpatient Psychiatry Clerkship Site

**Site:** https://une-ms3-psychiatry.netlify.app/ · **Owner:** Joshua Moss, MD · UNE COM MS3 clerkship, Maine Medical Center–Sanford (BHU2)
**Date of review:** June 28, 2026 · **Method:** Full walkthrough as an anxious, time-pressed MS3 — every nav group, all 9 interactive tools exercised, ~20 content pages read, Path + Library modes, search, responsive/accessibility inspection (DOM-level), and primary-source verification of a key citation.
**Panel lens:** Clerkship Director · Adult / C&A / C-L Psychiatry · Chief & Senior Residents · MS3 · Medical Educator · Learning Scientist · UX Designer · Information Architect · Accessibility Expert · Digital PM.

---

## 1. Bottom line up front

This is, candidly, one of the best single-author clerkship companion sites I have seen. It is not a textbook dump — it is a **clinically intelligent, workflow-integrated learning system** built by someone who clearly knows both inpatient psychiatry and medical education. The bedside tools, the dual-mode (guided Path / reference Library) architecture, the documentation-and-presentation scaffolds, and the reflection/professional-identity layer are genuinely better than what most national products offer for *real rotation work*. The clinical content I read is accurate, evidence-anchored, and pitched perfectly for an MS3 ("recognition and escalation, not titrating an antidote").

**One issue gates everything:** the site itself flags nearly all clinical pages as *"AI-drafted, evidence-anchored — pending Dr. Moss's review/attestation before learner use,"* and the faculty **Review & Attest** dashboard reads **0 / 44 reviewed**. The content is good; it is just not yet faculty-attested *on the record*. Until that pass is done, a director cannot in good conscience push it as required reading — not because it is wrong, but because the site says so itself.

**Verdict (expanded in §16):** Yes — I would recommend it as the primary companion site for every MS3 on this rotation, **conditional on** (a) completing the attestation pass and (b) bolting on a vignette-style shelf question bank. As-is, it is already a superb *adjunct* and the best bedside-skills resource in the field.

### Headline scores (full table in §15)

| Dimension | Score |
|---|---|
| Educational Quality | 9.0 |
| Clinical Accuracy (where reviewed) | 8.5 |
| Student Engagement | 8.0 |
| Ease of Navigation | 8.5 |
| Visual Design | 8.0 |
| Information Architecture | 9.0 |
| Shelf-Exam Utility | 7.0 |
| Clinical (bedside) Utility | 9.5 |
| Innovation | 9.0 |
| Likelihood students recommend it | 8.5 |
| **Overall** | **8.7** (→ 9+ once attested) |

---

## 2. What the site actually is (site map)

A static, fast, single-page app (Netlify) with a **left rail that toggles between two whole modes**:

- **Path** — a guided, gamified six-week arc: progress ring, **streak counter**, *"Daily review — 8 quick cards"* (spaced repetition), and each week exploded into a checklist tagged `read` / `optional tool` / `quiz` with completion tracking.
- **Library** — the same material as a browsable reference, grouped into 11 sections, plus instant full-text **search**.

**Content inventory (44 learner-facing pages/tools):**

- **Start Here:** Welcome to the Rotation · Orientation Packet
- **Interactive Tools (9):** Mental Status Exam builder · Decisional Capacity · Treatment-Team Rounding Prep (+ presentation timer) · Violence Risk (FRST) · Columbia C-SSRS Screener · **Screeners: PHQ-9 & GAD-7** (added during review) · Withdrawal CIWA-Ar/COWS · Reflection & Identity · Active Recall self-test · *(Faculty:* Review & Attest*)*
- **Six-Week Curriculum:** Weeks 1–6 (Foundations → Mood/Psychosis/Pharm → Psychotherapy/Personality → Family/Systems/EE → Acute/Emergency → Integration/Exam)
- **Core Topics:** Differential Dx Scaffolds · Mood · Psychosis · Anxiety/Trauma/OCD · Personality · Substance Use · Geriatric · Perinatal
- **Acute & Safety:** Catatonia · Delirium · Agitation & Restraint
- **Psychopharmacology:** Primer · Protocol Library (unit order sets)
- **Pocket Guides:** Interview & MSE · Formulation & DDx · Suicide Risk & Safety
- **Skills, Cases & Exam:** Documentation & Oral Presentation · Capacity/Delirium/Catatonia/Withdrawal · Treatment Basics · Family & Discharge · Family Therapy Modalities · OSCE Stations · Practice Cases · Shelf Review Guide
- **Evidence & Reading:** Weekly Reading Map · Landmark Trials — Listen & Test (50 papers, ~2-min NotebookLM audio)
- **Books & Podcasts:** MS3 Book Library (curated from 345 titles) · Podcast Library (Puder, 255 episodes, categorized)

This is broad *and* deep. The taxonomy maps cleanly onto how an inpatient rotation is actually lived.

---

## 3. Information Architecture

**Strengths**

- **The Path/Library duality is the smartest IA decision on the site.** It resolves the central tension of every clerkship resource — *guided curriculum* vs. *just-in-time reference* — by giving each its own mode instead of forcing one navigation to do both. A nervous Week-1 student lives in Path; the same student between patients in Week 5 lives in Library + search. This is more thoughtful than the IA of most commercial products.
- **Logical grouping and a consistent mental model.** Tools, weeks, topics, acute/safety, pharm, pocket guides, skills/cases/exam, evidence, media. A student forms an accurate mental model within one screen.
- **Cross-linking is real, not decorative.** Pages end with "Pair with…" and inline "→ see the agitation ladder," and the weekly pages route to the exact tool, reading, and reflection prompt for that week. The differential scaffolds link straight into the FRST, C-SSRS, MSE, and withdrawal tools.
- **Search works** — instant, full-text, section-labeled, with snippet previews (9 hits for "lithium," spanning Primer, Shelf, Perinatal, Mood, Landmark, Podcasts, Treatment Basics, Documentation, Reading Map).
- **Discoverability is high:** the homepage tells you what exists and where to start; the Path's "pick up where you left off" removes the "where was I" friction.

**Gaps / fixes**

- **Content sections are not URL-addressable.** Every page renders at the same `/` URL (only the standalone `/tools/*.html` have real URLs). A student can't bookmark "Suicide Risk & Safety," a resident can't paste a deep link, and faculty can't say "read this URL before rounds." Add hash routing (`/#/suicide-safety`). **High-leverage, modest effort.**
- **No breadcrumbs** in the content panel and no "you are here" beyond the rail highlight. Minor.
- **The rail is long.** On desktop it's fine; on mobile the single 820px breakpoint collapses to a menu toggle, but the most-used bedside tools deserve a persistent quick-access (see §9).
- **Search indexes the "Review status: AI-drafted…" boilerplate,** so several previews open with that banner instead of content. Cosmetic but it dilutes the snippet.

**IA score: 9.0** — genuinely excellent; loses points only for non-addressable content URLs and breadcrumb/quick-access polish.

---

## 4. Educational Design — does the curriculum build knowledge?

Yes, deliberately. This is the work of someone who has thought about *instructional design*, not just content.

- **A coherent spiral.** The six-week arc moves interview/MSE → diagnosis/differential → treatment → family/systems → acute/emergency → integration. Each week states **objectives**, a **skill of the week**, **suggested landmark readings**, a **case**, a **reflection prompt**, **on-the-unit tasks**, and a **time estimate** (~3.5–4 h/wk outside clinical time). That is a real curriculum, not a link farm.
- **Observable, entrustable skills.** The Orientation Packet maps each week to an *observable skill* and explicitly aligns to **AAMC Core EPAs 1, 2, 5, 6, 8, 10**. The OSCE set uses a 4-level **entrustment** rubric. This is competency-based education done properly — most clerkship sites never get near EPAs.
- **Coverage of the required domains is strong.** Mapping the brief's twelve teaching targets against what the site delivers:

| Domain | Coverage | Notes |
|---|---|---|
| Psychiatric interviewing | ✅ Strong | Interview & MSE guide, Week 1, podcast Ep.1 |
| Mental Status Exam | ✅ Exemplary | Interactive builder (learn → build → exemplar → language) |
| Differential diagnosis | ✅ Exemplary | 8-syndrome scaffolds, "medical mimic first" rule |
| DSM diagnosis | ✅ Good | Embedded across topic pages + shelf guide; not a DSM-criteria drill |
| Risk assessment | ✅ Exemplary | C-SSRS tool, Suicide pocket card, FRST violence tool, chronic-vs-acute framing |
| Psychopharmacology | ✅ Strong | Primer + Protocol Library; correctly defers dosing to EHR |
| Psychotherapy | ✅ Good | Week 3, DBT/MBT/CBT landmark set, Puder library (psychotherapy-heavy) |
| Family systems | ✅ Signature strength | Week 4, EE, Family Meeting Playbook — rare and excellent |
| Consultation (C-L) | ⚠️ Adequate | Capacity, delirium, withdrawal, "medical mimic" thinking; no dedicated C-L workflow page |
| Emergency psychiatry | ✅ Strong | Agitation/restraint, catatonia, delirium, withdrawal, violence |
| Documentation | ✅ Exemplary | Note + presentation + handoff templates, rubric, pitfalls |
| Clinical reasoning | ✅ Exemplary | Formulation templates, "reasoning not checklist," 10-sec differential script |

- **The pedagogy is active, not passive.** Builders, self-tests, reflection, OSCE rehearsal, "what good sounds like" exemplars, strong-vs-weak documentation contrasts. Cognitive load is well-managed via chunking ("In one line," then sections, then "high-yield pearls").

**Where the design could go further:** there is **no visual learning** (see §6) — every algorithm, ladder, and decision tree is prose. And the curriculum is **time-uniform**, not adaptive to the student's week-of-rotation or quiz performance (see §12).

---

## 5. Clerkship Utility — would this become the student's most-used resource?

For *daily rotation work*, very plausibly **yes** — this is its strongest claim. Walking the inpatient day:

| Moment in the day | What the student opens | Verdict |
|---|---|---|
| Morning prep / pre-round | Rounding Prep pre-round sweep (overnight, sleep, meds, vitals, **safety**, disposition) | Best-in-class; nothing else does this |
| Patient interview | Interview & MSE guide; MSE builder for language | Excellent |
| Writing notes | Documentation guide + note template + MSE/Capacity note generators | Excellent, uniquely workflow-native |
| Presenting on rounds | 60–90-sec daily template **with a worked example** + practice timer | Excellent |
| Medication questions | Psychopharm Primer + Protocol Library | Good (framework, not dosing — correctly) |
| Risk assessment | C-SSRS tool, Suicide pocket card, FRST | Excellent |
| Family meetings | Week 4 Family Meeting Playbook, EE checklist | Signature strength |
| Capacity / delirium / catatonia / withdrawal | Dedicated tools + scales (CIWA/COWS) | Excellent |
| On-call / weekend | Differential scaffolds, agitation ladder, escalation rules | Strong |
| Discharge planning | Family & Discharge, barrier mapping, safer-discharge structure | Strong |
| Weekend studying / shelf | Shelf guide, traps table, 437-Q self-test, landmark audio | Good (reasoning) / see §6 (vignette gap) |
| OSCE prep | 6 timed stations + entrustment rubric + debrief | Excellent |

The differentiator vs. AMBOSS/UWorld/OnlineMedEd is precisely this: those teach you psychiatry; **this helps you *do the rotation*** — prep, interview, document, present, assess risk, talk to families — with tools tied to *this unit's* protocols (BHU2 order sets) and *this institution's* screen (FRST). That local tailoring is something no national product can match.

The honest caveat: a subset of students optimize almost entirely for the shelf, and for *that* narrow goal they will still open UWorld/AMBOSS for question volume. This site wins the rotation; it needs a Qbank to also win the shelf (§6, §11).

---

## 6. Content Review — accuracy, evidence, depth, gaps

**Accuracy (where I read it): excellent and evidence-anchored.** Representative checks, all correct:

- **Mood:** screen for past mania before any antidepressant; STAR*D-style measurement-based, sequential care; lithium's anti-suicidal signal (Cipriani 2013) and maintenance primacy (BALANCE); ECT *not* last-resort for psychotic/catatonic/pregnancy; "sleep is treatment"; delirium-as-mimic. Attending-level.
- **Psychosis:** rule out secondary causes incl. **anti-NMDA encephalitis**; choose antipsychotic by side-effect profile per **CATIE** (Huhn 2019/Leucht 2013 for real differences); **RAISE** coordinated specialty care; **LEAP** (Amador) for anosognosia; **clozapine** for TRS with monitoring. Correct.
- **Psychopharm Primer:** class-based framing; medication **emergencies** (serotonin syndrome vs NMS distinction, lithium toxicity, QTc/torsades, anticholinergic, clozapine red flags) framed as *recognize-and-escalate*. Exactly right for an MS3.
- **Suicide pocket card:** ask-directly scripts, chronic-vs-acute separation, "protective factors are not magic," strong-vs-weak documentation examples, escalation cues including *sudden unexplained improvement*. Outstanding.
- **Differential scaffolds:** "a new psychiatric presentation is a medical workup until proven otherwise"; thiamine-before-glucose; Bush-Francis + lorazepam challenge for catatonia (avoid antipsychotics → NMS risk). Correct.

**Citation integrity: verified against primary literature.** I independently confirmed the site's flagship *local* citation. According to PubMed, the FRST validation it cites is real and quoted **exactly**: Racine CW, Strout TD, Johnston DN, Quigley KM, Wolfrum LA, Guido BJ, *"Evaluating the Predictive Validity of the Fordham Risk Screening Tool (FRST)…,"* **Community Mental Health Journal 2025;62(4):705–712** ([DOI](https://doi.org/10.1007/s10597-025-01562-w)) — including the "33.0% vs 8.1%" figure and the Maine Medical Center affiliations. Citing hot-off-the-press *local* evidence with correct numbers is a strong accuracy signal.

**The central content caveat — provenance & attestation.** Nearly every clinical page carries: *"AI-drafted, evidence-anchored — pending Dr. Moss's review/attestation before learner use,"* and the **Review & Attest** dashboard shows **0/44 reviewed**. Read two ways:

- *As a strength:* this is **content-governance maturity** almost no educational site has — transparent provenance, a per-page sign-off workflow, exportable attestation records, and an honest homepage disclaimer. It models exactly the AI-in-medicine hygiene we want trainees to see.
- *As the gating risk:* until the pass is done, the site advertises its own clinical content as not-yet-verified. For learners, repeated "AI-drafted, pending review" banners quietly erode trust in otherwise excellent material, and a director cannot mandate unattested clinical content. **This is the #1 fix (§10).**

**Specific QA flags (minor, found incidentally):**

1. **Citation-date inconsistency:** expressed-emotion is cited as *Brown 1962* (Landmark list, Active Recall) but *Brown 1972* (Week 4). Pick one (both Brown EE papers exist; standardize).
2. **Count mismatch:** Landmark page says *"50 landmark papers"* (audio) while Active Recall says *"79 decks · 437 questions."* Reconcile the messaging so students aren't confused about scope.
3. **FRST nuance:** the page leads with the "33% vs 8%" difference, but the cited paper's *overall* conclusion is mixed (sensitivity 33%, limited AUROC) and cautions against standalone use. The page's "structured judgment, not prediction" framing is consistent with that — but adding one line on the tool's limited predictive validity would make the evidence use airtight and model critical appraisal.
4. **Depth is intentionally MS3-level**, so this is *not* a criticism: it correctly is not a dosing reference (defers to PsychDB-class detail and EHR order sets). Just know that students wanting drug-level depth will leave the site for it.

**The biggest content gap — no visual learning.** The homepage has **zero images** and the site uses a **single** CSS breakpoint; every "scaffold," "ladder," and "decision tree" is rendered as text. Psychiatry shelf/OSCE reasoning is highly amenable to **flowcharts and decision trees** (delirium workup, agitation ladder, catatonia pathway, the 8 differentials, withdrawal trees). Adding real diagrams would raise retention, scannability, and "high-yield feel" substantially (§12, Top-25 #12).

---

## 7. Learning Experience

The learning-science instrumentation here is unusually complete for a clerkship site — several "innovation opportunities" the brief lists are **already built**:

- **Progression & chunking:** ✅ six-week spiral; every page is "one line → sections → pearls."
- **Active recall / self-testing:** ✅ **437 questions across 79 landmark-paper decks**, immediate feedback + scoring (browser-saved).
- **Spaced repetition:** ✅ Path's *"Daily review — 8 quick cards"* surfaces retrieval daily. (Currently a fixed daily set rather than a true SM-2/Anki scheduler — see Top-25 #13.)
- **Gamification / progress:** ✅ streak counter, % progress rings, per-week completion (0/4, 0/5).
- **Multimodal:** ✅ ~2-min **audio** overviews of 50 landmark papers (NotebookLM), cross-linked to quizzes; ✅ curated **podcast** and **book** libraries.
- **Case-based learning:** ✅ 8 synthetic practice cases + 6 OSCE stations, each with tasks, teaching points, and debrief prompts.
- **Reflection / professional identity formation:** ✅ weekly + ethics/bias/boundaries/wellbeing prompts, with a built-in *wellbeing safety net* ("the hard weeks…"). Rare and mature.
- **Clinical pearls & high-yield summaries:** ✅ every topic page; the MSE "describe, don't interpret" pearl is exemplary.

**What's missing or light:** spaced repetition is not yet a true scheduler; there are **no clinical-vignette MCQs** (the landmark decks test paper knowledge, not NBME-style reasoning); gamification is light (streaks only — no goals, badges, or cohort view); and there is no **knowledge-gap feedback** (the system can't yet tell a student "you're weak on withdrawal — here are 5 cards").

---

## 8. User Experience, Visual Design & Accessibility

**UX / visual strengths**

- **Calm, professional, editorial aesthetic** — serif display titles + *Source Sans 3* body; warm-neutral palette (bg `#F6F3EE`, ink `#3B332C`); generous whitespace; card-based content; consistent design language across hub and all standalone tools.
- **Fast.** Static Netlify build, no heavy framework, no images to load — near-instant navigation, which matters for between-patient use.
- **Excellent body-text contrast:** ink-on-cream measures **~11:1** (WCAG AAA). All **53 interactive controls have accessible names** (0 unnamed). `lang="en"`, semantic `<main>`/`<nav>`, proper `viewport` meta.
- **Tool interactions are tactile and clear** — descriptor chips, live tallies, single-vs-multi-select logic, copy/reset, and "Remember/Always" callouts.

**Accessibility & responsive findings (DOM-verified)**

| Finding | Severity | Detail |
|---|---|---|
| **No dark mode** | Medium | Zero `prefers-color-scheme` rules on hub *and* tools. The brief explicitly asks; wards/night shifts/mobile make this a real ask. |
| **Weak heading hierarchy** | Medium | The hub content panel exposes essentially **one** semantic heading; dynamic page titles aren't `<h2>/<h3>`. Screen-reader users lose heading navigation. |
| **No skip-to-content link** | Low–Med | Keyboard users tab through the long rail every time. |
| **Accent contrast** | Low | Terracotta `#C25A3C` = **3.94:1** on cream — passes AA for *large* headings (≥3:1) but **fails AA for normal text** (needs 4.5:1). Keep it off small text/links; darken to ~`#A8431F` for any body-size use. |
| **Single 820px breakpoint** | Low–Med | Hub reflows to a menu toggle below 820px; tool pages are fluid single-column (no breakpoints — acceptable). Coarse but functional. **Recommend real-device QA** (I could not render a true mobile viewport in this environment). |
| **No reduced-motion handling** | Low | `prefers-reduced-motion` absent (little animation, so minor). |
| **No `<header>/<footer>` landmarks** | Low | Uses divs; add for completeness. |

**Visual Design score 8.0 / Navigation 8.5** — held back from 9s by the missing visual learning assets, no dark mode, and the heading/contrast/a11y polish.

---

## 9. Clinical Workflow Integration — usable during a real inpatient day?

Yes — more so than any national product, because the tools are shaped to the *workflow*, not the syllabus:

- **Admission:** differential scaffold → MSE builder → C-SSRS/Suicide card → FRST → Capacity tool → admission-note template + admission-presentation template. A student can move from door to note to presentation entirely inside the site.
- **Daily rounds:** pre-round sweep → progress-note template → 60–90-sec presentation script (+ timer).
- **Treatment planning / med changes:** Primer + Protocol Library + metabolic-monitoring prompts; medication-emergency recognition.
- **Family meetings:** Playbook, EE checklist, agenda OSCE — a genuine rarity.
- **Emergencies:** agitation ladder, restraint checklist, catatonia (Bush-Francis + lorazepam), delirium workup, withdrawal scales.
- **Consults:** capacity, delirium, "medical mimic first" thinking (though no dedicated C-L *page/workflow* — see Top-25 #17).
- **Weekend call / discharge:** escalation rules, barrier mapping, safer-discharge structure, handoff template.

**The one missing primitive:** the bedside tools that *generate text* (MSE, Capacity) have copy-out, but the **admission/progress note and the suicide formulation** are still static templates. Turning those into builders (Top-25 #9, #14) would close the loop and make the site the literal place students draft from.

---

## 10. The single most important recommendation

**Run the attestation pass and re-label.** Use the existing Review & Attest tool to take **44/44** from "AI-drafted, pending review" to **"Reviewed — J. Moss, MD · [date]."** Nothing else moves the site's credibility — or a director's willingness to mandate it — as much. It is a focused weekend of work the infrastructure already supports, and it converts the provenance banners from a *liability* into a *trust signal* ("physician-reviewed, dated, versioned"). This is Quick Win #1 and the precondition for "primary companion."

---

## 11. Benchmark vs. the major psychiatry resources

| Resource | Where it beats this site | Where this site is **better / equivalent** |
|---|---|---|
| **OnlineMedEd** | Polished video frameworks; brand familiarity | **Better:** rotation/bedside utility, local protocols, reflection, documentation scaffolds. **Equiv:** high-yield framing. *Missing here:* video lectures. |
| **AMBOSS** | Vast cross-linked library + large shelf Qbank; constant updates | **Better:** bedside tools, narrative reasoning, EPA/observable-skill design, local tailoring. *Missing here:* encyclopedic breadth & question volume. |
| **UWorld** | Gold-standard NBME-style vignette MCQs + explanations | **Better:** everything *clinical-workflow*. *Missing here:* a comparable vignette Qbank — **the key shelf gap.** |
| **Osmosis** | Videos, animations, polished flashcards, SRS | **Better:** real-rotation usefulness, reflection, local protocols. **Equiv-ish:** spaced repetition (lighter here). *Missing here:* video/animation/visual. |
| **First Aid Psychiatry** | Dense high-yield shelf reference | **Better:** clinically usable, interactive, reasoning-first. **Equiv:** pearl density. *Missing here:* exhaustive DSM-criteria coverage. |
| **PsychDB** | Deep, free *clinician* reference (dosing, detail) | **Better:** MS3 pedagogy & workflow; smartly defers dosing to EHR. *Missing here:* PsychDB-level pharmacology depth (by design). |
| **Carlat** | Practical, continuously-updated, clinician pearls/CME | **Equiv:** pragmatic evidence-based voice for trainees. *Missing here:* breadth/update cadence; different audience. |
| **APA materials** | Authoritative practice guidelines | **Better:** daily usability for MS3s. *Opportunity:* cite APA guidelines explicitly where relevant. |

**Net:** **Better than all of them** at *bedside workflow integration, local tailoring, family/EE teaching, documentation/presentation coaching, reflection/PIF, and dual-mode IA.* **Inferior/missing** on *high-volume vignette Qbank (UWorld/AMBOSS), video/animation (OnlineMedEd/Osmosis), and encyclopedic/dosing depth (AMBOSS/PsychDB).* The strategic read: it occupies a lane none of the giants serve — *"how to be excellent on this specific rotation"* — and should not try to out-Qbank UWorld; it should **bolt on** enough vignette practice to be shelf-sufficient and keep widening its bedside-skills moat.

---

## 12. Innovation — what's already here, and what would make it best-in-class

**Already innovative (ship-and-tell-people):**

- **Bedside note/documentation generators** (MSE builder; Capacity note) — most products *describe* the MSE; this one *drafts* it.
- **Dual-mode Path/Library** with streaks, progress, and a daily spaced-review queue.
- **Content-governance layer** (per-page AI-drafted → faculty-attested workflow with exportable records) — frontier-grade hygiene.
- **Locally-tailored clinical tooling** (FRST + BHU2 order sets + MMC specifics) tied to current local primary literature.
- **Reflection / professional-identity formation** with an integrated wellbeing safety net.
- **NotebookLM audio** + **437-question** landmark self-test.

**What would push it to "best psychiatry clerkship resource, period":**

1. **Interactive virtual patients / SP simulations** for the 6 OSCE stations (branching dialogue, elicit the MSE, run a risk assessment, get scored on the entrustment rubric).
2. **A PHI-free Socratic AI tutor** scoped to the site's own content — "quiz me on withdrawal," "critique my formulation," auto-generate vignettes from any page.
3. **Adaptive study plan** — personalize the Path by week-of-rotation *and* self-test performance (more retrieval where weak).
4. **A real vignette shelf Qbank** with rationale-rich explanations (closes the one competitive gap).
5. **Note/communication builders** (admission, progress, safety-plan, family-meeting agenda) parallel to the MSE builder.
6. **Visual decision trees** for the differentials/ladders/workups.

---

## 13. Top 25 Improvements (ranked)

Ranked by overall priority. **Impact / Edu / Clinical** = H/M/L. **Difficulty** = Easy/Med/Hard. **Priority** P0 = do first (credibility/safety), P1 = high value, P2 = valuable.

| # | Improvement | Impact | Difficulty | Est. effort | Edu | Clin | Priority |
|---|---|---|---|---|---|---|---|
| 1 | **Complete faculty attestation pass (0/44→44) and relabel** "AI-drafted, pending" → "Reviewed, J. Moss MD, [date]" | H | Easy | ~1 weekend | H | H | **P0** |
| 2 | Add **dark mode** (`prefers-color-scheme`) across hub + tools | M | Easy | 0.5–1 day | M | M | P1 |
| 3 | A11y: **skip-link**, semantic **h2/h3** in content panel, `header`/`footer` landmarks | M | Easy | 1 day | M | L | P1 |
| 4 | Fix **accent contrast** for small text/links (darken `#C25A3C`→~`#A8431F`); color-use audit | M | Easy | 2–3 hrs | L | L | P1 |
| 5 | **URL-addressable content** (hash routing) so pages are bookmarkable/deep-linkable | H | Med | 2–4 days | M | M | P1 |
| 6 | Reconcile **QA inconsistencies** (Brown 1962/1972; "50" vs "79/437"; add FRST predictive-validity line) | M | Easy | 2–3 hrs | M | M | P1 |
| 7 | **Version / "last reviewed" stamp + changelog** on every page | M | Easy | 0.5 day | M | M | P1 |
| 8 | **Read-time + ⭐high-yield tags** on content pages | L | Easy | 0.5 day | M | L | P2 |
| 9 | **Copy-to-note / builder-ize** the Suicide formulation + note/handoff templates (like the MSE builder) | H | Med | 3–5 days | M | H | P1 |
| 10 | **Mobile quick-access bar** to top bedside tools + real-device QA | M | Med | 2–3 days | L | H | P1 |
| 11 | **Vignette shelf Qbank** (150–300 NBME-style MCQs + rationales) — closes the one competitive gap | H | Hard | 3–6 wks | H | M | **P0/P1** |
| 12 | **Visual decision trees / algorithms** for the 8 differentials, agitation ladder, delirium/catatonia/withdrawal | H | Med | 1–3 wks | H | H | P1 |
| 13 | **True spaced-repetition scheduler** (SM-2/Anki-style) across *all* content, not just landmark decks | H | Med | 1–2 wks | H | M | P1 |
| 14 | **Note builders**: admission note, progress note, safety plan, family-meeting agenda | H | Med | 2–3 wks | M | H | P1 |
| 15 | **Scored screener suite**: PHQ-9/GAD-7 trends, C-SSRS triage tiers, add MoCA/MMSE cognitive screen | M | Med | 1–2 wks | M | H | P1 |
| 16 | **Interactive OSCE mode** (timer + self-rating against the entrustment rubric) | M | Med | 1 wk | H | M | P2 |
| 17 | **Dedicated C-L page** + interactive **agitation/de-escalation** and **delirium-workup** tools | M | Med | 1–2 wks | M | H | P1 |
| 18 | **Preceptor / EPA dashboard**: students privately share Path progress, scores, reflections; entrustment tracking | H | Hard | 3–5 wks | H | M | P1 |
| 19 | Standardize **"Related" cross-link footers**; strip review-banner from search snippets | M | Easy | 1–2 days | M | L | P2 |
| 20 | **Depth-parity pass** so Anxiety/Trauma/OCD, Personality, Substance, Geriatric, Perinatal match Mood/Psychosis | M | Med | 1–2 wks | H | M | P2 |
| 21 | **PHI-free Socratic AI tutor** scoped to site content + auto-vignette generation | H | Hard | 1–3 mo | H | M | P1 |
| 22 | **Virtual-patient / SP simulations** for the 6 OSCE stations (branching, MSE elicitation, scored) | H | Hard | 2–3 mo | H | H | P1 |
| 23 | **Adaptive study plan** (week-of-rotation + self-test performance) | M | Hard | 1–2 mo | H | M | P2 |
| 24 | **Faculty CMS**: multi-reviewer attestation, versioning, scheduled re-review, audit trail | M | Hard | 1–2 mo | M | M | P2 |
| 25 | **Multi-site templatization** (separate local config from core) + usage analytics | M | Hard | 1–3 mo | M | M | P2 |

---

## 14. Roadmap by effort, and the true differentiators

**Quick Wins — one weekend (do now):** #1 attestation pass *(this is the one that unlocks "primary companion")*, #2 dark mode, #3 a11y basics, #4 contrast, #6 QA fixes, #7 version stamps, #8 tags. Collectively these convert "excellent but self-flagged as unverified" into "physician-reviewed, dated, accessible."

**Medium projects — 1–4 weeks:** #5 URL routing, #9 note copy-out, #10 mobile quick-access, #12 visual decision trees, #13 real SRS, #14 note builders, #15 scored screeners, #16 interactive OSCE, #17 C-L + acute tools, #18 preceptor dashboard. These deepen the moat (workflow + spaced learning) and start on shelf-sufficiency.

**Major features — 1–3 months:** #11 vignette Qbank (start sooner; it's the gating shelf gap), #21 AI tutor, #22 virtual-patient sims, #23 adaptive plan, #24 faculty CMS, #25 multi-site.

**Features that would differentiate this from *every other* psychiatry education site** (most don't exist anywhere): the **bedside note-generators** (already unique — extend them, #9/#14), **virtual-patient OSCE sims** (#22), a **content-scoped Socratic AI tutor** (#21), the **attestation/governance layer** (already unique — productize it, #24), and **adaptive, performance-driven spaced repetition** (#13/#23). Ship these and the honest claim becomes: *the most clinically integrated, best-governed psychiatry clerkship platform available — not just at UNE/MMC, but anywhere.*

---

## 15. Final Scorecard (1–10)

| Dimension | Score | One-line justification |
|---|---|---|
| **Educational Quality** | **9.0** | Coherent EPA-aligned spiral; observable skills; scaffolds, OSCEs, reflection, active recall. Loses points for no visual learning + unattested status. |
| **Clinical Accuracy** | **8.5** | Everything reviewed is correct and evidence-anchored; a flagship citation verified *exactly* against PubMed. Docked only for self-flagged non-attestation (0/44) + minor QA inconsistencies — **no actual errors found.** |
| **Student Engagement** | **8.0** | Path streaks, daily review, 437-Q self-test, audio, reflection. Gamification still light; no images. |
| **Ease of Navigation** | **8.5** | Dual-mode + search + real cross-links. Held back by non-addressable URLs, no breadcrumbs. |
| **Visual Design** | **8.0** | Clean, warm, professional, fast, AAA body contrast. No diagrams, no dark mode. |
| **Information Architecture** | **9.0** | Path/Library duality is genuinely best-in-class IA; logical taxonomy; searchable. |
| **Shelf-Exam Utility** | **7.0** | Excellent reasoning/traps/integration + landmark recall, but **no high-volume vignette Qbank** — the gap. |
| **Clinical (bedside) Utility** | **9.5** | The standout. Real tools for MSE, risk, capacity, withdrawal, rounding, documentation, presentation — locally tailored. |
| **Innovation** | **9.0** | Note-generators, attestation governance, dual-mode path, NotebookLM audio, local FRST/BHU2 integration. |
| **Likelihood students recommend it** | **8.5** | Genuinely useful daily, anxiety-reducing, concrete; ceiling set by shelf-Q depth + attestation. |
| **OVERALL** | **8.7** | An exceptional, field-leading rotation companion with one gating fix (attestation) and one strategic gap (vignette Qbank). **→ a clear 9+ once attested.** |

---

## 16. Director's verdict

> *"If you were directing this clerkship, would you recommend this as the primary companion website for every MS3? Why or why not?"*

**Yes — with two conditions, and enthusiastically once they're met.**

**Why yes.** I have reviewed national products for years, and none of them does what this site does for the part of the rotation that actually frightens and forms students: walking onto the unit and *being useful and safe*. The orientation packet alone — Single Safety Rule, PHI discipline, daily rhythm, observable weekly skills, presentation scripts, explicit "may / may not" boundaries — is better onboarding than most residencies write. The bedside tools (MSE builder, C-SSRS, FRST, capacity, CIWA/COWS, rounding prep) are real instruments, not flashcards. The documentation and presentation coaching teaches the thing attendings most wish students arrived knowing: *show your reasoning.* The family/EE focus is a genuine, rare strength. The content I read is accurate and evidence-anchored, and where I could verify a citation against the primary literature, it was exact. And the dual-mode Path/Library architecture, with streaks and daily retrieval, is smarter learning design than most commercial sites. As a *companion for doing this rotation well*, it is already the best I've seen.

**The two conditions.** (1) **Complete the attestation pass.** The site currently labels its own clinical content "AI-drafted, pending review" (0/44 attested). The material is good — but I cannot mandate, and students should not lean on, content the author has explicitly marked unverified. This is a weekend of work the built-in Review & Attest tool is designed for, and it flips the provenance banners from a doubt into a trust signal. (2) **Add vignette-style shelf questions.** The reasoning scaffolds, traps table, and 437-question landmark self-test are excellent for *thinking*, but shelf success also needs NBME-style vignette volume; right now students will still leave for UWorld/AMBOSS to get it. Bolt that on and the site is shelf-sufficient too.

**So:** as the **primary companion for the rotation itself** — prep, interviewing, risk, documentation, presenting, families, safety — I would adopt it for every MS3 today, the moment it's attested. As a **complete shelf solution**, pair it with a vignette Qbank until #11 lands. It is not a marginal site that needs rescuing; it is an excellent one that needs *finishing* — sign-off, a Qbank, some diagrams, and dark mode — to become, credibly, one of the best psychiatry clerkship resources in existence.

*— Multidisciplinary Review Panel, June 28, 2026. Clinical-accuracy spot-checks performed against the author's own content and, for the FRST validation, against PubMed (Racine et al., Community Ment Health J 2025; [DOI](https://doi.org/10.1007/s10597-025-01562-w)).*
