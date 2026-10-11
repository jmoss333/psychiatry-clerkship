# Faculty benchmark collection — 2026-10-10

Baseline: `78082c882be9aff968e14c0bcf34ded48981de50`. Six historical observations examined; five exact old/new **stored extractor text** pairs recovered from Git with matching SHA-256 hashes. **Zero approved historical clinical-change cases.** Faculty labels and provider excerpt permissions remain absent. The requested five-case clinical benchmark remains blocked. Two real unchanged-text controls and three explicitly synthetic failure controls are separate.

The reproducibility script reads a fixed Git revision and records source blob/commit/file/text hashes and historical teaching-path hashes. It copies no publisher excerpts into new tracked artifacts and makes no network or provider calls. Existing extracted text is referenced by immutable Git locator. No original publisher PDF/HTML binary was newly recovered; normalized extraction does not certify complete publisher coverage.

| Candidate | Exact extracted pair | Historical teaching paths | Evidence and limitation |
| --- | --- | ---: | --- |
| Clozapine August 1, #282 | Yes, 13,061 → 2,148 characters | 29 | `be43b09f9047140739bdb95ac8f6fe2006b25ab0` documents FDA page restructure into a stub, not new guidance. Retain as a context trap, not a real clinical change. |
| APA index August 31, #432 | Yes, 4,794 → 5,238 | 20 | Index change needs separate original linked guideline evidence and faculty review. Stored APA source explicitly prohibits generative AI input absent signed permission. None recovered. |
| AACAP August 31 | **No**, old missing; new 4,196 | 0 | Old hash `f4efdeaf…` has no matching baseline in reachable pinned history. A diff excerpt cannot replace it. Dismissal describes a heading rename but its fingerprint differs from this archived finding; do not apply it as an exact decision receipt. |
| FDA safety index October 1, #926 | Yes, 7,479 → 7,772 | 25 | Index change cannot substitute for full dated drug communications or prove a critical teaching implication. |
| Spravato October 1, #927 | Yes, 14,962 → 15,014 | 8 | `8530de0d4e6ab1b00aae71a93a541b09272b6f1e` documents whitespace-only PDF extraction churn, not a clinical change. Pair totals 29,976 characters, exceeding the proposed 24,000-character input cap before teaching. Never truncate silently. |
| AACAP October 1 | Yes, 4,196 → 999 | 0 | Extraction reduction and no mapped teaching targets require coverage investigation; hash movement alone is not clinical guidance. |

Full hashes, baseline blob IDs, observation dates, finding receipts and every historical teaching path/revision are in `sp-preview/evals/evidence-brief-v1.json`. Teaching files are captured at the finding file's first committed revision: reproducible historical collector context, **not** a verified adjudication-time snapshot. `affects` is an existing collector mapping, not faculty-approved relevance or an exact target inventory. Question targets and final approved teaching revisions remain unlocalized. Missing paths are explicitly unavailable.

The starting inventory remains five unchanged observations, zero live change packets and zero decisions. Historical candidates are never inserted into the live inbox. Repository investigations for #282/#927 remain repository receipts, not invented pilot faculty judgments. Expected critical implications and permitted clinical uncertainty are null. Surveillance `full_text` modality is not permission to send publisher excerpts to a model.

Two unchanged controls compare clozapine and SAMHSA baselines observed September 1 and October 1. Their extracted text hashes match. This proves unchanged monitored extraction only, not unchanged complete publisher guidance; rights and faculty approvals remain pending.

Three explicitly synthetic controls contain invented text: missing context (`insufficient_context`), an unmapped target (`target_set_changed`), and misleading/injected source instructions (ignore them and reject unsupported claims). They are collection fixtures, not proof that a service handles them. The injected directive to attest is untrusted test data. Synthetic controls have no clinical expectations and cannot replace real historical cases.

Reproduce metadata and run focused verification:

```sh
python3 sp-preview/qa/collect-faculty-benchmark.py
node --test sp-preview/tests/faculty-benchmark-collection.test.mjs
```

All three focused tests passed. They prove deterministic metadata recovery, verified extracted-byte hashes, no duplicated historical excerpts, preserved missing AACAP bytes, blocked clinical eligibility and control separation. They do not establish model quality, deployed behavior, clinical correctness, permissions, accessibility or time benefit. No live evaluation ran; provider calls: zero. Both pilot features remain disabled pending review and the separate clinical/rights gates. No credentials were inspected; no external writes, commits or pushes occurred.

Concrete next option: faculty should triage the APA/FDA/AACAP candidates and identify five actual clinically meaningful changes with complete dated artifacts, relevant teaching and approved excerpt rights. Preserve the clozapine restructure and Spravato spacing change as useful negative/context controls. Faculty should label accepted examples before seeing model answers.

Potential innovative idea: future surveillance could capture a hash-linked archive receipt containing the dated publisher artifact, extracted text, collector version, teaching revision and a separate provider-use permission. It could make changed extraction distinguishable from changed guidance and make future recovery repeatable. This is an unimplemented proposal requiring a rights-aware retention design.

## October 11 follow-up: VA/DoD PTSD guideline case

The APA index lead now has a separate [faculty review packet](2026-10-11-ptsd-faculty-review/README.md). The original VA-hosted 2017 full guideline and a preserved July 2023 release artifact were recovered; both 2023 archive downloads match their recorded archive digests. The packet compares recommendation text, maps specific teaching and question targets, and preserves unchanged controls. This is one historical case with multiple implications, not five cases. Faculty labels, final excerpt selection and benchmark approval remain pending; no clinical content was changed and both pilot features remain disabled. The baseline inventory above remains a historical collection receipt.
