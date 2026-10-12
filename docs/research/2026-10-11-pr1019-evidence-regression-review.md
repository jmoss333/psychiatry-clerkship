# PR #1019 evidence follow-up — October 11, 2026 (Eastern)

## Reviewed state

Reviewed PR head `a1919811f4843cb2307974133c7b15c5441f087d` against refreshed main
`81895e0afd2e19564dc04affa8788b747d89e375`. The originally reported head was
`182c79f4348c0f856267896fb295b970b41869ac`; the PR has since integrated citation
correction commit `c8a5076ba86ecd1e7b5e625d30690e3cf42fbf24` through #1022.
Those existing corrections are preserved; this follow-up adds focused tests.

#1018 merged at 23:34:59 UTC on October 11. Its five citation identities are already
in #1019, and its citation-cache file is identical to current main. #1019 already
targets main. A merge-tree check against current main is conflict-free, including
the subsequent #1020 changes; no retarget or history rewrite is needed for #1018.
No branch was merged into main. Automatic merge was confirmed disabled.

## Evidence decisions

| Finding | Verified correction | Clinical meaning and faculty review |
| --- | --- | --- |
| Huhn comparative efficacy | The stored excerpt occurs in abstract Findings, not Interpretation. The annotation and regenerated drill preserve the six-drug nonsignificance qualifier. | The current teaching claim describes symptom estimates versus placebo in acute, multi-episode schizophrenia. Faculty should review that narrower scope; it does not establish equal efficacy between agents or prove six drugs ineffective. The old relative-magnitude comparison of efficacy and adverse effects is no longer asserted by this binding. |
| Brunner taper guidance | The citation marker now binds the abrupt-discontinuation sentence. The regenerated drill no longer claims that the shorter stored excerpt verifies the adjacent individualized-taper instruction. | The full guideline independently supports severe withdrawal risk and individualized, monitored tapering. Preserve these recommendations; this finding was a citation-placement defect, not evidence that tapering advice was clinically wrong. |
| McPheeters alcohol treatment | The stored excerpt comes from Results and retains the return-to-any-drinking endpoint with the treatment outcomes. Annotation, page-derived claim, and drill align on that endpoint. | The first-line designation is no longer inserted into the stored claim. This does not reject the paper's clinical conclusion. Faculty should review the endpoint-specific teaching and the separate psychosocial-care instruction; the individual placebo comparisons do not establish superiority of one drug over the other. |

The three cached abstracts were independently retrieved from Europe PMC core
records and matched after HTML and whitespace normalization (October 12 UTC,
still October 11 Eastern). Huhn's full-text Results were also read through Europe
PMC XML; Brunner's full guideline and the publisher's McPheeters results were
inspected. Browser access to some PMC/PubMed pages returned a challenge, so those
pages were not treated as successful reads.

Primary sources: [Huhn, PMID 31303314](https://pmc.ncbi.nlm.nih.gov/articles/PMC6891890/),
[Brunner, PMID 40526204](https://pmc.ncbi.nlm.nih.gov/articles/PMC12463801/),
[McPheeters, PMID 37934220](https://doi.org/10.1001/jama.2023.19761).
This is a focused review of the three findings, not a clinical approval of the
primer's other tables, treatments, or fictional cases.

## CI diagnosis

- [Original run 38173341748](https://github.com/jmoss333/psychiatry-clerkship/actions/runs/38173341748), head `182c79f4348c`: the required smoke job failed the first-reading-above-phone-dock assertion for both audiences (841.56 and 888.06 pixels versus a 777-pixel limit). The reading-position test also failed once and passed its retry. This was not an evidence-annotation failure.
- [Run 38185611407](https://github.com/jmoss333/psychiatry-clerkship/actions/runs/38185611407), head `1358d2c3a1a3`: the resident phone-layout assertion still failed (791.56 versus 777 pixels).
- [Run 38187950306](https://github.com/jmoss333/psychiatry-clerkship/actions/runs/38187950306), head `08f1a511cc5e`: the reading-position clear/reload test failed; an unexpectedly recreated bookmark and heading-position mismatch appear in the log.
- [Run 38194288298](https://github.com/jmoss333/psychiatry-clerkship/actions/runs/38194288298), reviewed head `a1919811f484`: build validation and smoke jobs passed. The navigation portion reports 955 passed and 43 skipped, with no retry/flaky entries. Both preview LFS checks passed. This run belongs to the reviewed head before this test-only follow-up; it does not certify a later commit or production publication.

Existing UI fixes remain untouched. A clean latest run is not proof that every
previously observed intermittent reading-position issue is permanently resolved.

## Regression proof and governance

Three focused tests in `test_generate_evidence_drill.py` exercise the real drill
generator against the primer and compare its claims with the annotations and the
correct sections of the independently checked abstract cache. Missing bindings,
empty spans, conclusion-only excerpts, dropped qualifiers, or a misplaced taper
anchor fail. Generation uses a controlled empty faculty-decision mapping so future
keep/cut decisions cannot silently remove this coverage; the existing freshness
check separately verifies the committed drill with the real decisions.

Replacing the three corrected data/content files with their pre-correction versions
at `4c106f18f22d` makes all three tests fail. Restoring the fixes makes the entire
25-test generator suite pass. Each of the three targeted span audits reports one
clean row, no flagged/uncached row; those partial runs do not evaluate the corpus
ratchet. No gate, baseline, schema, or approval policy was loosened.

The first full local gate attempt passed its other checks but failed both learner
builds because the newly created worktree held 106 Git LFS placeholders. All 106
were subsequently materialized from existing local objects with `git lfs checkout`,
without a network download or tracked media change. The required pre-push gate
must pass after that environment repair before this follow-up can be pushed.

The current-main comparison confirms `reviewed.json`, `pharmacy.json`, and all
existing topic `facultyReview` fields are unchanged. The drill decision file is
absent on both sides; all three corrected items remain `draft` with `review: null`.
The sign-off impact report reopens exactly one signature, `psychopharm_primer.md`
(signed September 26). Faculty review and subsequent console re-attestation remain
the owner's decisions. No clinical content was re-attested, merged to main, or
published by this follow-up.
