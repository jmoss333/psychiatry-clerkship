# NotebookLM Source Strategy for RSSM Audiobook
## Segmentation Plan & Implementation Guide

**Version:** 1.0  
**Date:** April 2026  
**Purpose:** Optimize RSSM Master v10 source manuscript for NotebookLM processing by segmenting into focused, clinically coherent units that respect NotebookLM's character limits while maintaining narrative integrity.

---

## Overview & Rationale

NotebookLM works most effectively with sources that are:
- **Focused** (single coherent topic per source, not monolithic)
- **Self-contained** (readable without extensive cross-references)
- **Well-structured** (clear hierarchy and section breaks)
- **Character-bounded** (~500K characters per source, ~100K ideal for responsive interaction)

The RSSM Master v10 source (14,289 lines) is too large for single-source upload. This strategy segments it into 8 clinically meaningful notebooks that can be processed independently, with cross-linking guidance for comprehensive use.

---

## Segmentation Architecture

### **SEGMENT 1: Philosophical Foundation & Core Architecture**
**NotebookLM Notebook Name:** `RSSM_01_Foundation_Architecture`

#### Content Scope
- File sections: Introduction through Part I (Core Architecture)
- Exact line range: 1–850
- Estimated characters: ~185K

#### What to Include
- Full Introduction: "How to Use This Manual"
- Preface (complete)
- About the Author (complete)
- Part I §§1–3: Complete
  - The Predictable Milieu Model (§1)
  - The Four Structural Layers (§2)
  - The Structural Tension Matrix (§3)
- All quick reference materials and reading paths

#### What to Exclude
- Clinical vignettes from Part VII (separate segment)
- Population-specific adaptations from Part VIII (separate segment)
- Appendices (except Quick Reference in this segment)
- Detailed operational procedures (Part VI—separate segment)

#### Rationale
This is the **canonical entry point** for the model. Anyone learning RSSM needs the architecture first. This segment establishes:
- Theoretical foundation
- The four-layer principle
- Why layer emphasis matters
- Reading paths for different audiences

This segment is essential for **all downstream segments**. It should be uploaded first and referenced in prompts to other segments.

#### NotebookLM Recommendations
- **Audio Overview length:** 10 min (comprehensive introduction)
- **Video Overview:** Recommended (visual representation of layer hierarchy)
- **Suggested use cases:**
  - CME introductory modules
  - Staff orientation
  - Family psychoeducation (frame-setting)
  - Research ethics boards (model explanation)

---

### **SEGMENT 2: Biological Stabilization (Sleep, Medication, Substances)**
**NotebookLM Notebook Name:** `RSSM_02_Biological_Layer`

#### Content Scope
- File sections: Part II (Biological Stabilization) complete
- Exact line range: 1098–1850 (approximate; scan for Part II boundaries)
- Estimated characters: ~175K

#### What to Include
- Part II overview
- §4: Sleep and Circadian Architecture (complete)
  - Sleep as foundation, crisis threshold
  - Circadian architecture
  - Assessment protocols
  - Sleep-first protocol
  - Evidence-based circadian interventions (light therapy, blue-blocking glasses, chronotherapy)
- §5: Medication Effects and Iatrogenic Destabilization (complete)
- §6: Substances and Physiological Load (complete)
- §7: Assessing the Biological Baseline (complete)

#### What to Exclude
- Family-level interventions (Part IV)
- Operational implementation (Part VI)
- Clinical case applications (Part VII)
- Clinical vignettes and extended case studies

#### Rationale
Layer 1 is foundational. This segment must be **self-contained and clinically actionable**. Clinicians should be able to use this segment to:
- Understand sleep as a stabilization prerequisite
- Identify medication-induced destabilization
- Apply evidence-based circadian interventions
- Recognize when substance use is driving layer instability

This is the segment for **sleep-focused audiobook chapters** and for **CME credit on circadian medicine in psychiatry**.

#### NotebookLM Recommendations
- **Audio Overview length:** 20 min (comprehensive clinical depth)
- **Use cases:**
  - Detailed clinical education module
  - Sleep medicine fundamentals for psychiatrists
  - Medication optimization guidance
  - Substance use assessment protocols

---

### **SEGMENT 3: Regulatory Predictability & Environmental Structure**
**NotebookLM Notebook Name:** `RSSM_03_Regulatory_Layer`

#### Content Scope
- File sections: Part III (Regulatory Predictability)
- Exact line range: [Scan for Part III start/end boundaries]
- Estimated characters: ~125K

#### What to Include
- Part III overview
- §8: Arousal, Rhythm, and Environmental Load (complete)
- §9: Signals of Safety (complete)
- §10: Co-Regulation Before Self-Regulation (complete)
- Any clinical scripts related to arousal calibration and environmental modification
- Key passages on neuroception and polyvagal framework

#### What to Exclude
- Family dynamics content (Part IV)
- Functional task engagement (Part V)
- Operational procedures (Part VI)
- Population-specific environmental adaptations (Part VIII—these are separate)

#### Rationale
Layer 2 operationalizes the **external conditions** that enable regulation. This segment answers:
- How does environmental structure reduce arousal load?
- What are "signals of safety" and how do clinicians provide them?
- What is co-regulation and how does it precede self-regulation?
- How do sensory, temporal, and interpersonal elements combine?

This segment is critical for **milieu design, sensory modifications, and team consistency**.

#### NotebookLM Recommendations
- **Audio Overview length:** 15 min (operational and conceptual)
- **Use cases:**
  - Environmental design for psychiatric units
  - Sensory modification protocols
  - Staff training on co-regulation
  - De-escalation and arousal management

---

### **SEGMENT 4: Relational Containment & Family Systems**
**NotebookLM Notebook Name:** `RSSM_04_Relational_Layer`

#### Content Scope
- File sections: Part IV (Relational Containment)
- Exact line range: [Scan for Part IV boundaries, includes §11–§15]
- Estimated characters: ~140K

#### What to Include
- Part IV overview
- §11: The Clinician as Container (complete)
- §12: Authority, Roles, and Boundaries (complete)
- §13: Dignity Under Pressure (complete)
- §14: The Family as Relational System (complete)
- §15: Cultural Context and Adaptation (complete)
- Clinical scripts for boundary-setting, authority establishment, and family engagement
- All content on expressed emotion, family psychoeducation readiness, and therapeutic alliance

#### What to Exclude
- Operational family meeting protocol (§22, §24—goes to SEGMENT 6)
- Extended case studies (Part VII—separate segment)
- Population-specific family adaptations (Part VIII—separate)

#### Rationale
Layer 3 addresses the **relational field**. This segment defines:
- How clinicians establish containment and safety
- Authority without coercion
- Boundary clarity and dignity preservation
- Family as system, not problem
- Cultural responsiveness in relational work

This is the core for **family therapy integration, therapeutic alliance, and dignity-centered care**.

#### NotebookLM Recommendations
- **Audio Overview length:** 20 min (relational theory + clinical application)
- **Use cases:**
  - Family therapy training
  - Clinician self-care (understanding the container)
  - Cultural competency training
  - Boundary and authority modules
  - Staff on-boarding (role clarity)

---

### **SEGMENT 5: Functional & Developmental Engagement**
**NotebookLM Notebook Name:** `RSSM_05_Functional_Layer`

#### Content Scope
- File sections: Part V (Functional and Developmental Engagement)
- Exact line range: [Scan for Part V boundaries, includes §16–§19]
- Estimated characters: ~120K

#### What to Include
- Part V overview
- §16: Task Introduction and Autonomy Scaling (complete)
- §17: Identity, Trajectory, and Launch (complete)
- §18: Developmental Reengagement After Crisis (complete)
- §19: Meaning-Making After Crisis—Narrative, Values, and Purpose (complete)
- Clinical scripts for autonomy calibration and task sequencing
- Content on identity work and developmental holding

#### What to Exclude
- Operational implementation of task bundles (Part VI—separate)
- Clinical vignettes of task failure and recovery (Part VII—separate)
- Extended case studies

#### Rationale
Layer 4 governs **engagement and forward movement**. This segment covers:
- How tasks are scaled to match relational and regulatory capacity
- Identity work and narrative coherence post-crisis
- Autonomy and launch in developmental context
- Meaning-making and values alignment

This segment is essential for **recovery-focused care, developmental psychology in psychiatry, and meaning-centered interventions**.

#### NotebookLM Recommendations
- **Audio Overview length:** 15 min (development + function)
- **Use cases:**
  - Autonomy scaling training
  - Young adult psychiatry modules
  - Identity work and trauma recovery
  - Values and meaning-making in crisis

---

### **SEGMENT 6: Implementation & Operationalization**
**NotebookLM Notebook Name:** `RSSM_06_Implementation_Operations`

#### Content Scope
- File sections: Part VI (Operationalizing the Predictable Milieu) + Clinical Tools (§24–§28)
- Exact line range: [Scan for Part VI and §24–§28 boundaries]
- Estimated characters: ~160K

#### What to Include
- Part VI overview and all sections (§20–§23):
  - §20: Daily Rhythm and Environmental Design
  - §21: Team Function and Role Clarity
  - §22: Family Integration Protocols
  - §23: Transitions and Continuity of Milieu
- Clinical Tools (§24–§28):
  - §24: 60-Minute Family Meeting Playbook
  - §25: First-3-Sessions Clinical Map
  - §26: Bundle Selection Decision Aid
  - §27: Minimum Viable Predictable Milieu Model
  - §28: Failure Modes & Recovery Guide
- All operational checklists, templates, and decision trees

#### What to Exclude
- Theoretical foundation (Part I—Segment 1)
- Individual layer theory (Parts II–V—Segments 2–5)
- Clinical vignettes (Part VII—separate)
- Population-specific operations (Part VIII—separate)

#### Rationale
This segment is **implementation-ready**. It contains:
- Concrete daily procedures
- Team coordination protocols
- Family integration sequences
- Decision aids and failure recovery
- Playbooks that can be deployed immediately

This is the **administrative and operations segment** for program leaders, unit managers, and implementation teams.

#### NotebookLM Recommendations
- **Audio Overview length:** 20 min (procedures + contingencies)
- **Use cases:**
  - Implementation training for new RSS units
  - Team on-boarding and role clarity
  - Family meeting facilitation training
  - Program director orientation
  - Transition and continuity protocols

---

### **SEGMENT 7: Clinical Applications & Case Studies**
**NotebookLM Notebook Name:** `RSSM_07_Clinical_Applications`

#### Content Scope
- File sections: Part VII (Clinical Applications, §29)
- Exact line range: 9824–10655 (approximate; verify boundaries)
- Estimated characters: ~145K

#### What to Include
- Part VII complete, including all subsections:
  - §29.1: Acute Crisis Stabilization
  - §29.2: Chronic Instability and Repeated Admissions
  - §29.3: Family System Rupture
  - §29.4: Developmental Stall and Failure to Launch
  - §29.5: Extended Case Studies (composites)
- All clinical narratives, decision pathways, and recovery trajectories
- Pattern recognition across presentations

#### What to Exclude
- Theoretical foundation (refer to Segment 1)
- Population-specific applications (Part VIII—Segment 8)
- Operational procedures (Part VI—Segment 6)

#### Rationale
This segment shows **the model in action**. It demonstrates:
- How layer dynamics play out in real presentations
- Where emphasis shifts occur
- What recovery trajectories look like
- Pattern recognition across different crises

This is the **clinical learning and pattern-matching segment** for experienced clinicians.

#### NotebookLM Recommendations
- **Audio Overview length:** 20 min (case-driven narrative)
- **Use cases:**
  - Advanced clinical education
  - Case conference facilitation
  - Resident training on pattern recognition
  - Supervision material
  - "What does this model actually look like?" education

---

### **SEGMENT 8: Population-Specific Adaptations**
**NotebookLM Notebook Name:** `RSSM_08_Population_Adaptations`

#### Content Scope
- File sections: Part VIII (Population-Specific Adaptations, §30–§38)
- Exact line range: [Scan for Part VIII boundaries]
- Estimated characters: ~155K

#### What to Include
- Part VIII overview and all population subsections:
  - §30: Geriatric
  - §31: Perinatal
  - §32: Dual Diagnosis (Mental Health + Substance Use)
  - §33: Pediatric
  - §34: LGBTQ+ Affirming
  - §35: Forensic
  - §36: Refugee
  - §37: IDD (Intellectual and Developmental Disabilities)
  - §38: Cross-Population Integration Principles
- All population-specific modifications to layer emphasis, assessment, and intervention
- Culturally adapted scripts and approaches

#### What to Exclude
- Core architecture (Part I)
- Layer theory (Parts II–V)
- Operational procedures (Part VI)
- Clinical cases from Part VII

#### Rationale
This segment allows **targeted adaptation**. Clinicians working with specific populations can:
- Understand how the four-layer model adapts to geriatric, perinatal, substance-use, pediatric, LGBTQ+, forensic, refugee, and IDD presentations
- Modify emphasis allocation based on population vulnerabilities
- Access culturally responsive language and approach modifications
- Build competency in population-specific implementation

#### NotebookLM Recommendations
- **Audio Overview length:** 20 min (multi-population synthesis)
- **Alternative: Individual 5–10 min overviews per population** (recommended for targeted training)
- **Use cases:**
  - Specialized unit training (geriatric, perinatal, etc.)
  - Cultural competency modules
  - Population-specific staff on-boarding
  - Research on RSS adaptability
  - Community mental health center training

---

## Supplementary Segment: Appendices & Reference
**NotebookLM Notebook Name:** `RSSM_99_Appendices_Reference`

#### Content Scope
- File sections: All Appendices (A–G)
- Estimated characters: ~85K

#### What to Include
- Appendix A: Quick Reference (Layer Dynamics)
- Appendix B: Clinical Scripts (organized by layer)
- Appendix C: Assessment Tools
- Appendix D: Family Handouts (patient-facing language)
- Appendix E: Clinical Principles to Resources Map
- Appendix F: References & Evidence Base
- Appendix G: Dyadic Physiological Processes Beyond Polyvagal Theory

#### Rationale
This segment serves as a **reference library**. It's less about learning the model and more about:
- Quick lookup of clinical scripts
- Assessment tools
- Family-facing educational materials
- Evidence citations
- Physiological mechanisms

#### NotebookLM Recommendations
- **Audio Overview length:** 10 min (reference orientation)
- **Best use:** Store for reference, not primary learning
- **Use cases:**
  - Script lookup during clinical encounters
  - Assessment tool guidance
  - Evidence base for publications
  - Family education preparation

---

## Integration Guidance: Cross-Segment References

### **For Learners**
1. Start with **Segment 1** (Foundation & Architecture)
2. Then proceed to **Segment 2, 3, 4, 5** in sequence (the four layers)
3. Then **Segment 6** (Implementation)
4. Then **Segment 7** (Clinical Applications) for pattern recognition
5. Access **Segment 8** (Population Adaptations) when working with that population

### **For Experienced Clinicians**
- Start with **Segment 6** (Implementation)
- Jump to **Segment 7** (Clinical Applications) for your specific case
- Use **Segment 1** as reference when layer emphasis questions arise
- Use **Segment 99** (Appendices) for scripts and tools

### **For Program Implementation**
- **Segment 1** (Foundation) for administrative understanding
- **Segment 6** (Implementation) for operational procedures
- **Segment 8** (Population Adaptations) for your specific setting
- **Segment 99** (Appendices) for daily reference

### **For Research & Evidence**
- **Segment 1** (Foundation) for model architecture
- **Segment 7** (Clinical Applications) for hypothesis generation
- **Segment 99** (Appendices, particularly F) for evidence base

---

## Technical Specifications for NotebookLM Upload

### File Format & Preparation
- Extract each segment from RSSM_Master_v10_source.md
- Save as markdown (.md) with heading structure intact
- Recommended character limit per file: 400K–500K maximum
- All segments fit within this limit

### Naming Convention
```
RSSM_[##]_[Topic]_v1.md
```
- `##` = two-digit segment number (01–99)
- `[Topic]` = lowercase, hyphenated segment name
- `v1` = version (increment if segment updated)

### Metadata for Each Segment
Include at the top of each uploaded file:
```
# [Segment Name]
**Part of RSSM Audiobook Project**  
**Segment [##] of 8**  
**Optimal NotebookLM Length:** [5/10/15/20 min]  
**Primary Use Case:** [Training/Reference/Implementation/Research]  
```

---

## Quality Assurance Checklist

Before uploading each segment to NotebookLM:

- [ ] Heading structure is clean and logical (no skipped levels)
- [ ] All section cross-references are preserved
- [ ] Clinical scripts are complete and unabbreviated
- [ ] Appendix citations are included where referenced
- [ ] Character count is under 500K
- [ ] Segment is self-contained (readable without other segments)
- [ ] No orphaned references to excluded sections
- [ ] File naming follows convention
- [ ] Metadata header included

---

## Estimated Production Timeline

- **Week 1:** Extract and QA segments 1–3 (Foundation, Biological, Regulatory)
- **Week 2:** Extract and QA segments 4–6 (Relational, Functional, Implementation)
- **Week 3:** Extract and QA segments 7–8 (Clinical Applications, Population Adaptations)
- **Week 4:** Final integration testing; prepare segment 99 (Appendices)
- **Week 5:** Upload all segments to NotebookLM; test Audio Overview generation; refine prompts

---

## Next Steps

1. **Extract segments** from RSSM_Master_v10_source.md using this guide
2. **Validate boundaries** for each segment (verify no content loss)
3. **Test character counts** for each segment
4. **Upload to NotebookLM** in this order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 99
5. **Generate Audio Overviews** per recommended lengths above
6. **Test cross-segment linking** in prompts
7. **Proceed to Deliverable 2** (Steering Prompts) once segments are live

---

**Document prepared for:** Josh Moss, MD — ReConnect Psychiatry System  
**Document status:** Ready for implementation  
**Questions/issues:** Contact Claude Cowork for segment extraction assistance
