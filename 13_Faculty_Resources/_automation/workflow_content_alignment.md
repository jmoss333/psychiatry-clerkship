# Clinical Workflow Content Alignment

This note documents the metadata layer that connects topic pages to the clinical-workflow sidebar and the daily ward dashboard.

## Metadata Fields

Use these optional fields in `topic_meta.json`:

- `workflowStages`: where the page belongs in the clinical workflow. Allowed values are `encounter`, `diagnosis`, `safety`, `treatment`, `communication`, `family`, `team`, and `exam`.
- `workflowModes`: dashboard modes that should surface the page. Current modes are `ward`, `shelf`, `family`, `safety`, and `5min`.
- `relatedTools`: tool filenames only, such as `mse.html` or `communication-practice.html`. Do not put markdown page filenames here; use `clinicalWorkflow.actions` for page links.
- `communicationCases`: IDs from `communication_cases.json`.
- `clinicalWorkflow`: the rendered "On the unit" scaffold. Supported keys are `ask`, `mse`, `safety`, `say`, `collateral`, `rounds`, `exam`, and `actions`.

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

## Follow-Up Content Cleanup Candidates

- `exp_consult.md` currently bundles capacity, delirium, catatonia, and withdrawal. The sidebar now exposes several of those as standalone acute workflows; consider renaming this page to "Consult Questions" or splitting it into smaller consult cards.
- `exp_tx.md`, `psychopharm_primer.md`, `protocol_library.md`, and `decision-aids.html` overlap. Keep the primer conceptual, the protocol library local-policy/faculty reviewed, and decision aids algorithmic.
- `rounds_questions.md` sits naturally in team workflow but also supports shelf review. Consider adding workflow metadata in a later slice once its content is reviewed.
- `cultural_psychiatry.md` should eventually receive the same `ask`, `say`, `collateral`, and `rounds` structure, with emphasis on cultural formulation and interpreter use.
- `ethics_legal.md` should eventually receive high-risk review metadata and local-policy override notes before being surfaced more aggressively in safety mode.
