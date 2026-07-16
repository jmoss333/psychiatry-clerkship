# WP-06 — Clinical Harmonization — Content Plan (FACULTY-GATED)

> **For content workers:** This is a **content-only** change set — no code, build scripts, localStorage, or JS. It MUST be a separate PR from any code work, and MUST NOT merge until Dr. Moss (faculty) has reviewed and attested the clinical wording. Steps use checkbox (`- [ ]`) tracking.

**Goal:** Remove clinical-currency inconsistencies and two safety-completeness gaps the audit found: unify clozapine ANC-monitoring wording, correct an attested clozapine item, add 988 to the primary suicide surfaces, and add the MAOI washout interval.

**Approach:** Edit the source markdown/JSON in place; adopt one canonical phrasing where pages disagree; re-attest any attested item that changes. No new numbers beyond what the source pages already teach, except the two explicitly-approved additions (988, MAOI washout).

**Tech stack:** Markdown content, `question_bank.json`, the attestation console (for re-attestation), the Python validators.

## Global Constraints
Inherited from `2026-07-15-audit-remediation-master.md`. Most relevant: fictional composites / no PHI; content-only (no code in this PR); faculty attestation required before merge; keep every clinical claim traceable to a named library page per `QUESTION_BANK_STANDARD.md`.

## Faculty sign-off gate
This plan produces a diff for **faculty review**. Merge is blocked until Dr. Moss approves the wording and the changed attested item (`qb_pha_011`) is re-attested through the console. The implementer prepares the diff; faculty approves the clinical substance.

---

### Task 1: Unify clozapine ANC-monitoring wording

**Files:**
- Modify: `05_Psychopharmacology/Protocol_Library/protocol_library_inpatient.md:13`
- Modify: `05_Psychopharmacology/Monitoring_and_Labs/medication_monitoring_inpatient_teaching.md:15`
- Reference (already correct, do not change): `03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md:14,32`; `14_Tracks/Resident/adv_psychopharmacology.md:12`

**Canonical phrasing to adopt everywhere ANC monitoring is described:**
> "ANC monitoring per the prescribing information (the FDA eliminated the clozapine REMS in 2025; monitoring continues per the PI, not REMS-enforced)."

- [ ] **Step 1: Read the three current phrasings**

Run:
```bash
grep -rn "clozapine" 05_Psychopharmacology/Protocol_Library/protocol_library_inpatient.md 05_Psychopharmacology/Monitoring_and_Labs/medication_monitoring_inpatient_teaching.md 03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md | grep -iE "required|recommended|REMS|per the prescribing"
```
Note where the text says "required hematologic monitoring" (protocol_library:13) versus "recommended per the prescribing information" (psychosis page).

- [ ] **Step 2: Edit `protocol_library_inpatient.md:13`**

Change the phrase "with the **required** hematologic monitoring (ANC for agranulocytosis)" so it uses the canonical phrasing above — i.e., replace "required" with the "per the prescribing information (FDA eliminated the REMS in 2025; not REMS-enforced)" formulation, keeping the surrounding sentence and the myocarditis/ileus/seizure warnings intact.

- [ ] **Step 3: Edit `medication_monitoring_inpatient_teaching.md:15`**

The Clozapine table row already lists the schedule "ANC weekly ×6 months → every 2 weeks ×6 months → monthly." Add the qualifier so the monitoring column reads consistently with the canonical phrasing (schedule "per the prescribing information; the FDA eliminated the REMS in 2025, monitoring continues per PI"). Do not change the numeric schedule.

- [ ] **Step 4: Verify consistency**

Run:
```bash
grep -rn -iE "clozapine.*(required|recommended|REMS)" 03_Core_Topics 04_Acute_and_Safety 05_Psychopharmacology 14_Tracks --include="*.md" | grep -iv "recommended per\|per the prescribing"
```
Expected: no line still calls the monitoring "required" in a way that conflicts with the canonical PI phrasing. Faculty confirms the surviving phrasings all match.

- [ ] **Step 5: (defer commit — batch with Tasks 2-4 into one faculty PR)**

---

### Task 2: Correct the attested clozapine-enrollment item (`qb_pha_011`)

**Files:**
- Modify: `question_bank.json` — item `qb_pha_011`, option B `t`, and the item's `why`/`pearl` if they echo "enrollment."

**Context:** Option B (the keyed-correct answer) currently reads "Baseline absolute neutrophil count and **enrollment in the clozapine monitoring program** with ongoing ANC monitoring…". Post-REMS there is no enrollment/certification program — that is exactly what the FDA removed in 2025. The item is `status:"attested"`, so any edit reverts it to draft until re-attested.

- [ ] **Step 1: Locate the item**

Run:
```bash
python3 - <<'PY'
import json
b=json.load(open('question_bank.json'))
it=[x for x in b['items'] if x['id']=='qb_pha_011'][0]
print('status:',it['status'])
for o in it['options']: print(o['key'],o.get('c'),'::',o['t'])
print('WHY:',it['why'])
print('PEARL:',it.get('pearl'))
PY
```

- [ ] **Step 2: Edit option B and any echoing fields**

Replace "enrollment in the clozapine monitoring program" in option B with wording that reflects post-REMS reality, e.g. "Baseline absolute neutrophil count and ongoing ANC monitoring per the prescribing information — agranulocytosis is the central safety concern." Keep B the single correct answer (`"c": true`); ensure the other options' correctness is unchanged. Update `why`/`pearl` if they mention "enrollment/program."

- [ ] **Step 3: Validate JSON + qbank integrity**

Run:
```bash
python3 -c "import json; json.load(open('question_bank.json')); print('json OK')"
node 13_Faculty_Resources/_automation/site_build/check-static-site.mjs _build/ms3 2>/dev/null || echo "(run full build_and_check for the real gate)"
```
Expected: `json OK`; item still has exactly one correct option.

- [ ] **Step 4: Flip status to draft pending re-attestation**

Set `qb_pha_011` `"status": "draft"` (an edited attested item is no longer attested). It will re-appear with the "Pending faculty review" badge until re-attested in Step (Task 5).

---

### Task 3: Add 988 to the primary suicide surfaces

**Files:**
- Modify: `04_Acute_and_Safety/Suicide_Risk_and_Safety_Planning/suicide_risk_safety_planning_inpatient_teaching.md` (the crisis-resources / safety-plan step)
- Modify: `14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/suicide_risk_and_safety_pocket_card.md:106` (step 5 "Professionals/crisis resources")

**Context:** 988 currently appears only on the perinatal page and patient-facing handouts, not on the core suicide teaching page or the MS3 pocket card a student reaches first.

- [ ] **Step 1: Add 988 to the teaching page**

In the Stanley–Brown safety-plan "professionals and crisis resources" step, add: "the 988 Suicide & Crisis Lifeline (call or text 988; 911 for imminent danger)." Keep the existing means-restriction and no-suicide-contract content.

- [ ] **Step 2: Add 988 to the pocket card**

At `suicide_risk_and_safety_pocket_card.md:106` (step 5), make the crisis-resources line explicit: "Crisis resources: 988 Suicide & Crisis Lifeline (call/text 988); 911 for imminent danger; local crisis team."

- [ ] **Step 3: Verify**

Run:
```bash
grep -rn "988" 04_Acute_and_Safety/Suicide_Risk_and_Safety_Planning/suicide_risk_safety_planning_inpatient_teaching.md 14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides/suicide_risk_and_safety_pocket_card.md
```
Expected: 988 now present in both files.

---

### Task 4: Add the MAOI washout interval

**Files:**
- Modify: `05_Psychopharmacology/Student_Primer_Top10/psychopharmacology_primer_inpatient.md` (the antidepressant/medication-emergencies section) and/or `05_Psychopharmacology/Monitoring_and_Labs/medication_monitoring_inpatient_teaching.md` (MAOI row).

**Statement to add (approved):**
> "MAOI washout: allow ≥2 weeks after stopping most SSRIs (≥5 weeks after fluoxetine, due to its long half-life) before starting an MAOI, and ≥2 weeks after stopping an MAOI before starting a serotonergic agent — to avoid serotonin syndrome / hypertensive crisis."

- [ ] **Step 1: Add the washout statement** to the primer's antidepressant discussion (and/or the MAOI monitoring row), consistent with the page's existing citation convention.

- [ ] **Step 2: Verify**

Run:
```bash
grep -rn -iE "washout|5 weeks|two weeks after stopping|MAOI" 05_Psychopharmacology --include="*.md" | grep -i "washout\|5 week\|2 week"
```
Expected: the washout interval now appears in served content.

---

### Task 5: Validate, faculty-review, re-attest, and commit

- [ ] **Step 1: Run the content validators**

```bash
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
```
Expected: all green (content edits don't break the contract; `qb_pha_011` now draft is consistent).

- [ ] **Step 2: FACULTY REVIEW GATE**

Dr. Moss reviews the diff for clinical correctness: clozapine phrasing, `qb_pha_011` wording, 988 placement, MAOI washout accuracy. **Do not proceed without explicit approval.**

- [ ] **Step 3: Commit the content PR**

```bash
git add 05_Psychopharmacology 04_Acute_and_Safety 14_Tracks/MS3/Student_Ready_Pack/02_pocket_guides question_bank.json
git commit -m "content: unify clozapine wording, add 988 + MAOI washout, fix qb_pha_011 (faculty-reviewed)"
```

- [ ] **Step 4: Re-attest `qb_pha_011`**

After merge/deploy, through the faculty console re-attest `qb_pha_011` so it returns to `status:"attested"` with a fresh `by`/`at`. (If WP-07 has landed, the `by` is server-derived from the faculty key.)

**Acceptance:** one canonical clozapine phrasing across all pages; `qb_pha_011` corrected and re-attested; 988 on the core suicide page + MS3 pocket card; MAOI washout in served content; validators green; faculty approved.
**Regression risk:** low (content). **Faculty review:** **REQUIRED.** **Depends on:** none (own timeline); pairs with WP-16 doc reconciliation.

## Self-Review
- Clozapine wording (CL-1) → Task 1 ✓; `qb_pha_011` (CL-2) → Task 2 ✓; 988 (CL-3) → Task 3 ✓; MAOI washout (CL-4) → Task 4 ✓; re-attestation gate → Task 5 ✓.
- No code touched; separate PR; faculty gate explicit. Canonical phrasing given verbatim (not a placeholder). ✓
