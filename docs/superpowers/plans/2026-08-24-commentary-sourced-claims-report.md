# Claims licensed by commentary-grade sources — report, not a gate

**Generated 2026-08-24.** The handoff (§1.3) proposed a CI gate: flag any claim whose source's
PubMed `article_types` contains no Meta-Analysis / Systematic Review / Clinical Trial /
Observational Study **and** whose claim text contains a numeral.

**That gate is withdrawn — it would not have caught the bug that motivated it.** Modini & Large
(PMID 41664893) is typed `Journal Article` in PubMed, not Editorial or Comment, so the
article-type signal is blind to it; and the offending claim was *"risk peaks in the weeks after
discharge"*, which contains no numeral, so the second trigger never fires either. Shipping it
would have added false positives across 68 systematic reviews and primary studies while missing
the case it was designed for.

What actually discriminated was the repo's own `type` field. This report uses that instead.

## Claim anchors pointing at `other-authoritative` or `instrument` sources (6)

| source | type | anchored at |
|---|---|---|
| `boyer-shannon-2005-serotonin-syndrome` | other-authoritative | `03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md:37`, `04_Acute_and_Safety/Toxidromes/hyperthermia_toxidromes_inpatient_teaching.md:20`, `05_Psychopharmacology/Student_Primer_Top10/psychopharmacology_primer_inpatient.md:9` |
| `clozapine-rems` | other-authoritative | `03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md:34`, `05_Psychopharmacology/Monitoring_and_Labs/medication_monitoring_inpatient_teaching.md:29` |
| `fda-drug-safety` | other-authoritative | `03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md:23`, `05_Psychopharmacology/Monitoring_and_Labs/medication_monitoring_inpatient_teaching.md:32` |
| `fda-prozac-label-maoi-switching` | other-authoritative | `05_Psychopharmacology/Student_Primer_Top10/psychopharmacology_primer_inpatient.md:9` |
| `nasreddine-2005-moca` | instrument | `03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md:40` |
| `strawn-2007-neuroleptic-malignant-syndrome` | other-authoritative | `03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md:36`, `04_Acute_and_Safety/Toxidromes/hyperthermia_toxidromes_inpatient_teaching.md:19` |

**Most of this is probably fine.** An FDA label genuinely is the authority for a REMS
requirement or a boxed warning, and citing Boyer & Shannon for the Hunter criteria is orthodox.
That is exactly why this is a report and not a gate: it needs judgement, one bounded human pass.

## The real invariant already exists

`evidence_annotations.json`'s policy — every claim licensed by a stored verbatim span — catches
this class properly and without a proxy. Coverage is the thing to finish, not a cheaper heuristic
to invent. Note the three suspect-type sources that already carry spans are all `descriptive` or
`negative`; none asserts a quantitative finding, so the annotation layer is already hedging these
correctly on its own.
