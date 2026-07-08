# Clinical Workflow Content Alignment

This note documents the metadata layer that connects topic pages to the clinical-workflow sidebar and the daily ward dashboard.

## Metadata Fields

Use these optional fields in `topic_meta.json`:

- `workflowStages`: where the page belongs in the clinical workflow. Allowed values are `encounter`, `diagnosis`, `safety`, `treatment`, `communication`, `family`, `team`, and `exam`.
- `workflowModes`: dashboard modes that should surface the page. Current modes are `ward`, `shelf`, `family`, `safety`, and `5min`.
- `relatedTools`: tool filenames only, such as `mse.html` or `communication-practice.html`. Do not put markdown page filenames here; use `clinicalWorkflow.actions` for page links.
- `communicationCases`: IDs from `communication_cases.json`.
- `clinicalWorkflow`: the rendered "On the unit" scaffold. Supported keys are `ask`, `mse`, `safety`, `say`, `collateral`, `rounds`, `exam`, and `actions`.

Practice links in `cta` and `clinicalWorkflow.actions` are validated when they target `communication-practice.html&case=...` or `family-systems.html&scenario=...`. Family scenario data lives in `family_systems_scenarios.json`; its documented shape is `family_systems_scenarios.schema.json`.

## Authoring Pattern

For diagnosis pages, aim to fill all seven clinical workflow prompts:

- `ask`: what the student should ask at bedside.
- `mse`: what to observe or describe.
- `safety`: what must not be missed.
- `say`: one relational phrase or communication stance.
- `collateral`: what to ask family, staff, outpatient clinicians, or records.
- `rounds`: how to present the reasoning to the team.
- `exam`: one high-yield shelf/COMAT distinction.

This makes each page function as ward support, communication coaching, and exam review without duplicating markdown sections.

## Pages Migrated In This Slice

All core `t_*.md` diagnosis pages now have `clinicalWorkflow` and `workflowStages`.

Additional migrated high-use workflow pages:

- `ddx.md`
- `pg_formulation.md`
- `pg_interview.md`
- `pg_suicide.md`
- `agitation.md`
- `catatonia.md`
- `delirium.md`
- `exp_consult.md`
- `psychopharm_primer.md`
- `exp_family.md`
- `family_playbook.md`
- `brief_psychotherapy.md`
- `doc_oral.md`
- `ethics_legal.md`
- `cultural_psychiatry.md`
- `rounds_questions.md`
- `exp_tx.md`
- `protocol_library.md`
- `ect_neuromodulation.md`
- `nutrition_metabolic.md`

## Coverage Report

The static QA harness reports workflow metadata coverage as an INFO line:

`workflow metadata coverage: N/M nav markdown pages`

This report is intentionally non-failing. It helps future PRs see the remaining gaps without blocking deploys for orientation pages, reading lists, or resident-only reference pages that may not need the full bedside scaffold.

## Follow-Up Content Cleanup Candidates

- `exp_consult.md` now has the clearer sidebar label "Consult Questions: Capacity, Delirium, Catatonia, Withdrawal" while keeping the route stable. A later PR can split it into smaller consult cards if students need faster access.
- `exp_tx.md`, `psychopharm_primer.md`, `protocol_library.md`, and `decision-aids.html` still overlap. Keep the primer conceptual, the protocol library local-policy/faculty reviewed, and decision aids algorithmic.
- `ethics_legal.md` has a workflow scaffold but still needs a stronger local-policy metadata layer before being treated as a high-risk legal guidance page.
- Resident-only pages such as `cl_reference.md`, `systems_medlegal.md`, `adv_psychopharm.md`, and `supervision_teaching.md` are still candidates for workflow metadata if the resident app should mirror the MS3 scaffold fully.
