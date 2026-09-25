# Handoff to Claude Code: remediate the 2026-09-24 peer-review findings

**To:** the remediation session (Claude Code, working in `jmoss333/psychiatry-clerkship`)
**From:** the peer-review session (Cowork, 2026-09-24)
**Record:** `docs/curriculum-review/peer-review-2026-09-24/`. Read `PEER_REVIEW_REPORT_2026-09-24.md` §1–§6 before the first edit.
**Scope:** 374 findings (0 Critical · 18 Major · 198 Moderate · 158 Minor).
- 358 come from the main review of what both learner sites served at `origin/main` 2b18fd0.
- 16 come from a supplemental pass (S1-*) over the 2026-09-23 agitation & delirium Case-of-the-Week pair (#751), which merged after the snapshot.

The baseline was re-proven at `origin/main` **36b9827**.
**Decisions:** Josh made them on 2026-09-24. They are recorded in §0A and are binding; don't re-ask them.
**Definition of done:**
- `check_remediation.py --all` exits 0 on `main`.
- Every PR has passed `bin/verify.sh`, and Josh has re-attested what the fixes demoted.

## 0A · Decisions recorded 2026-09-24 (binding; do not re-ask)

Josh answered these before handoff. Where one also answers an architecture-handoff decision (`claude/curriculum-architecture-remediation-handoff-2026-09-24.md`, D1–D10), that is noted in the table and below.

| # | Decision | Answer | What it changes here |
|---|---|---|---|
| **J0** | How to handle the strings both handoffs touch (refeeding, COWS/buprenorphine, lithium, RLS, cultural sentence, toxidromes, ECT, catatonia, withdrawal card, rounds Q&A) | **One combined PR for the shared files.** | WP-1 becomes the **joint safety PR**: this handoff's WP-1 + WP-2 + four shared WP-10 items, together with architecture **WP-1a (a)–(h)**, in one content PR (§3, §8). WP-2 no longer exists as a separate PR. |
| **J1** | Canonical buprenorphine-start sentence | **The architecture handoff's §7-C wording** (see §4.2). | One sentence for both handoffs. **Checked 2026-09-24:** `decisions.json` on origin/main has no canonical-values entry, and no `clinical-contradictions` branch exists, so the other chat hadn't recorded a different D1. If a recorded D1 (a `decisions.json` entry or a merged PR) exists by the time you start, **that** wording wins for both handoffs. Use it, and say so in the PR body. |
| **J2** | Resident escalation wording (RD-001) | **Policy pointer only.** No enumerated list. | The RD-001 correction in `findings.json` now reads "…bringing your supervising attending in at the time your program's written supervision policy requires, and whenever you are unsure…". Don't add a list. |
| **J3** | Crisis-block scope | **Markers + required list.** | Four pages get the page marker **and** an entry in `_CRISIS_REQUIRED_MD` (`site_build/build_deploy.py`): MS3 MDD COTW, resident FEP COTW, resident MDD COTW (Q8, passive SI), and the OSCE page. `site_build/` is registration, so this rides the content PR. See WP-8. |
| **J4** | Question-bank demotion batches (also answers architecture **D6**) | **≤ 10 attested items per PR, safety items first.** This overrides D6's ≤ 24 for both handoffs. | The joint WP-1 PR demotes exactly 9 items: `qb_cog_014`, `qb_sud_014`, `qb_mood_013` and `qb_sud_005`, plus the architecture WP-1a items `qb_oth_001`, the day-3 phosphate refeeding item, `qb_mood_002`, `qb_sud_002` and `qb_eth_007`. If you find a 10th, stop there. An item touched by both handoffs (including later WP-7 length-cue rewrites) is demoted once and fixed once. |
| **J5** | Editorial-instruction lint | **Governance PR now, as a `bin/verify.sh` step (not `ci.yml`).** | New **WP-0b** (§3). |
| **J6** | Example state in the jurisdiction footnotes | **Generic rule + a Maine example.** | §4.3 convention, as written. |
| **J7** | The 2026-09-23 agitation & delirium COTW pair, merged after the snapshot | **Reviewed now.** | 16 S1-* findings were added and verified (11 re-checked: 3 confirmed, 8 modified). They sit in WP-1 and WP-9/11. Both pages are still **pending** in the ledger, so **fix them before Josh attests them.** |

Still Josh's, ongoing: re-attestation of demoted items and drifted pages (console, `attest/pending`), and merging every PR.

---

## 0 · What you are holding

| File | What it is | How you use it |
|---|---|---|
| `PEER_REVIEW_REPORT_2026-09-24.md` | Method, ledger, the safety-first queue (§3), the 17 Majors in full, systemic patterns (§5), **linked sibling edits (§6)**, rejected findings (§7) | Read first. §3 and §6 are binding scope. |
| `findings.json` | 374 findings: `quote` → `correction`, plus `problem`, `whyItMatters`, `evidence`, `verification`, `sourceFile` | The work list. `correction` is a drop-in for `quote`, except where §2.4 says otherwise. |
| `FINDINGS_BY_PAGE.md` | The same findings in page order, human-readable | For reading a page's findings together before you edit it. |
| `locator_manifest.json` | Per finding: **`editFiles`**, every source file that contains the quote at `origin/main`; `derivedCopies`, generated artefacts to regenerate and never hand-edit; `governance`, the ledger state the edit disturbs | This tells you where the text lives. **More than one `editFiles` entry means every copy changes.** |
| `wp_map.json` | Finding → work package (WP-1 … WP-11) | Selects the scope for each PR. |
| `sibling_rules.json` | 21 regex rules for defects that sit **outside** any quote. These are the siblings that the 2026-09-01 cycle half-fixed. | Run by the checker. All 21 currently match (each rule has been proven to fire). |
| `check_remediation.py` | **The completion gate.** Checks sources, not transcripts. Per finding it reports FIXED / DEVIATED / OPEN / UNCHECKED, then runs the sibling rules. Exit codes: 0 pass · 1 open work or a sibling match · 2 could-not-check. | Run per WP before every push. Details in §5. |
| `waivers.json` | Empty `{}` | Lets you exempt one located copy of a quote, with a written reason. Keep it short; every waiver is printed. |
| `rejected_at_verification.json` | 3 findings overturned in verification | **Do-not-apply list** (see §2.1). |
| `REVIEWER_BRIEF.md`, `VERIFIER_BRIEF.md`, `raw/` | Provenance: each pass's raw output and each verifier's verdict | Check here when a finding surprises you. |

**Baseline**, proven at `origin/main`:

```bash
python3 docs/curriculum-review/peer-review-2026-09-24/check_remediation.py --all --rev origin/main
# → examined 374 findings: OPEN 374 · sibling rules: 31 match(es) · exit 1   (at origin/main 36b9827)
```

The checker was self-tested before handoff:
- Applying the M09-001 correction to a scratch copy flipped that finding to FIXED.
- Applying M11-008 (an additive crisis marker) also read FIXED.
- Applying AQ3-011 read FIXED, while rule SR-06 still caught the two remaining "Kirkbride" siblings in deck AR-29. That half-fix is exactly the defect the gate exists to catch.

---

## 1 · Why this cycle has its own gate

The 2026-09-01 remediation declared 164 findings done by grepping each `quote` in the regenerated transcript. That check passed on 13 findings that were not fixed, and this review found them again. They failed in two ways:

1. **An instruction pasted as content.** The previous `replacement` field sometimes held an editorial instruction ("Rewrite the item to the review's actual result, e.g. stem: …"). It was pasted verbatim, so learners now see it as a stem, a keyed option or feedback (AR-34 Q6, AR-20 Q2, AR-27 Q3).
2. **A fix that reached one layer.** The key was fixed but not the rationale or pearl (`qb_sud_014`, `qb_anx_003`). Or the TL;DR was fixed but not the prose (`t_anxiety`). Or the stem was fixed but not the distractor feedback (AR-26 Q5). Or one twin was fixed and not the other.

`check_remediation.py` closes both gaps:
- It reads **sources**.
- It requires the quote gone from **every** located copy.
- It requires the correction **present**.
- It runs **sibling rules** over the whole item, deck or file.

Do not substitute the transcript grep for it. The transcript grep is still worth running once at the end (WP-12), as a second look.

---

## 2 · Ground rules. Read before the first edit.

### 2.1 Verification metadata is binding
- `rejected_at_verification.json` is a do-not-apply list. It covers R01-003 ("most" suicides rated low-risk is correct per NCISH), R04-003 (lithium weight gain is not significant per Gomes-da-Costa 2021) and R04-008 (the nuance is already present). The 2026-09-01 `docs/curriculum-review/findings/rejected.json` still binds as well.
- **`verification.verdict: "modified"`.** Here `correction` already holds the verifier's version, which fixed an error in the first-pass correction. Use it as written. Read `verification.reason` first: it often names the source that settled the point.
- **`verification.verdict: "not-verified…"`** covers 224 Moderate and Minor findings, which are reviewer judgment only.
  - Apply the clear ones.
  - Independently verify anything that surprises you (PubMed, DailyMed, the named guideline) before editing.
  - If you disagree after checking, do not apply. Record the id and your evidence in the PR body under **"Declined, with evidence"**. The checker will show it OPEN; list it in `waivers.json` against every located file, with the reason.

### 2.2 Governance: CLAUDE.md gates that bite on exactly this work
- **Content PRs never promote.** `bin/check_governance_separation.py` (L1–L4) runs in `bin/verify.sh` (the pre-push hook) and in CI.
  - Never touch `13_Faculty_Resources/reviewed.json`. Attested pages will drift to pending by themselves through `contentHash`. That is the designed outcome, not a problem to fix.
  - Never set any `status` to `attested`/`reviewed`, or edit a `facultyReview` block toward reviewed.
  - Never put a governance path in the same diff as content. Governance paths include `bin/`, `.claude/`, `.github/`, `CLAUDE.md`/`AGENTS.md`, `*.schema.json`, `faculty-console/`, the named `_automation/` validators, and `tests/maintenance/`.
- **Attested question-bank items (38 of them) cannot be edited in place.**
  - An attested item with any field change counts as a *promotion* (L2/L3). The honest edit changes `status: "attested"` → `"draft"` **in the same diff** as the text fix. That is registration, which a content PR may do.
  - Re-attestation is Josh's, through the faculty console, on `attest/pending`. Never you.
  - Consequence: **draft items disappear from Shelf Mode (`shelf-mode.html:164`) and from the Anki decks until re-attested.** WP-4's batching (below) exists to limit that.
- **Every `topic_meta.json` edit goes through the `topic-meta-author` skill** (`.claude/skills/topic-meta-author/`), even a one-field tweak. `validate_topic_meta.py` enforces invariants that the schema does not.
- **Every sentence asserting what a paper found needs a verbatim `sourceSpan` in `evidence_annotations.json` in the same change.** `validate_evidence_annotations.py` gates this, and `bin/verify_spans.py` is a ratchet.
  - Read the **results section**, not the abstract conclusion.
  - Never widen a span to fit a claim; rewrite the claim instead (rule C5).
  - About 45 corrections introduce a new paper, author or year. List them with `python3 - <<'EOF'` over `findings.json`: any `correction` citing a year, *et al.*, a journal or a PMID/DOI that its `quote` did not.
  - The ones that certainly need spans: Studdert 2020 (M13-002), PRELAPSE (R02-007), Katz 2022 VA lithium (R05-001, AQ2-003, C1-005), Larochelle 2018 (M09-001), Alon 2024 (AQ3-011/-012), McMain 2009 (R02-011), EXTRIP 2015 (R01-001), Cuijpers 2023 (AQ3-016..-019), Aoki 2022 (AQ3-001..-005), Vigen 2011 (AQ3-013/-014).
- **Crisis contacts.** Use only the `<!-- crisis-block -->` marker (`<!-- crisis-block-html -->` in tools), never a literal number.
  - Opting a markdown page in **removes its collapsible sections** (`makeCollapsible()` returns early). Check `tests/smoke/front-door.spec.js` pins before merging.
  - It does **not** reopen attestation.
  - Whether to add a page to `_CRISIS_REQUIRED_MD` is **Josh's scope call** (see §7). Adding the marker to a page is in scope.
- **No dose literals in `rp-*` / `*-trainer` tools**, including the agitation packs (R01-005/-006/-007) and the brief-psych pack (R01-013..-015). Every correction for those surfaces was checked to contain no dose literal; keep it that way.
- **No verbatim instrument text.** Leave the COWS interim waiver on `withdrawal.html` alone. M05-014 adds a *clinical* caveat, not anchor text.
- **No PHI.** No machine paths in tracked `.py`.

### 2.3 Twins and copies: fix all of them
`locator_manifest.json` lists every copy. The known families:

| Family | Files | Tooling |
|---|---|---|
| Audio-quiz decks | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json` (both sites, copied to `tools/quizzes.json`) **and** `_prototypes/canon-quiz/quizzes.json` (resident Canon Quiz) | Not covered by twin parity. The checker covers both (45 of 49 WP-3 findings live in both). |
| Agitation packs | `_prototypes/agitation-trainer/agitation.pack.json` ↔ `rp-agitation.pack.json` | `bin/check_twin_parity.py` EXACT half, plus the SNAPSHOT half against both `.preview.html`. |
| Reasoning cases | `reasoning_cases.json` ↔ `reasoning_cases_resident.json` | `bin/check_twin_parity.py` CONCEPT half (report-only; read it). |
| COTW MS3/Resident pairs | `…_MS3.md` / `…_Resident.md` | **Not twins** (different patients). A fix on one does not imply the other. The manifest lists both only when the quote is in both. |
| Shared text across layers | `question_bank.json` ↔ topic pages ↔ `rounds_questions.md` | Some M-chunk quotes also live in `question_bank.json` items (see appendix). The attested-item rule applies to those items too. |
| COTW overlays | TL;DR and shelf takeaway come from `08_Cases_and_Simulation/case-of-the-week/cotw_registry.json`, **not** `topic_meta.json` | M11-001 lives there. |

### 2.4 Corrections that are NOT drop-in text

| ID | Why it isn't | Do this |
|---|---|---|
| **M02-006, M02-007** | They delete passive-wish regexes from the SP pack's `si_direct` patterns. Applied alone, this **breaks the case**: the `si_active` / `g_si_mixed` gates require `si_direct`. | Structural change (WP-5): split the passive-wish patterns into a partial-credit intent, and make `si_direct` require a "kill yourself / end your life / suicide" question. Update the gates and the case tests. |
| **M02-011** | Adds a carbon-monoxide exposure hint, but Ray's script has no line for it. | Add a matching script line (the neighbours / a CO detector) in the same edit. |
| **C1-008** | The correction contains a placeholder: `[your role — e.g., a medical student or a resident]`. | Resolve it per edition: MS3 "a medical student", resident "a resident". Never ship the bracket. |
| **E1-001** | A registry swap, not a string replacement. The checker tracks it through rule SR-21. | Replace source `sall-2019` with the 2024 VA/DoD CPG synopsis (Brenner LA et al., *Ann Intern Med* 2025;178:416–425, PMID 39903866; verify the metadata on PubMed). Update `tools/evidence_registry/test_registry.py` if it pins the id. Then recheck every page and claim that cited `sall-2019` against the 2024 recommendations. |
| **AQ1-002** | The verifier found the distractor "Paroxetine and agomelatine" is *also* defensible under the 2018 NMA. | Rewrite the distractor as well as the feedback. |
| **AQ2-001 / AQ2-002** | AR-34 Q6 is double-keyed. | Either change the stem to ask for a "limitation", or re-key to the "uniform benefit" option. Pick one and state which in the PR. |
| **AQ3-001..-005** | AR-20 Q2 needs the options, key and feedback **rebuilt** to Aoki 2022's actual result. Correcting the stem alone is not enough. | Rebuild the item. The correction supplies the stem. |
| **AQ3-006** | AR-27 Q3: the verifier found BALANCE *does* report the depressive-relapse HR 0.63 (secondary analysis). | The key stands. Replace only the pasted instruction with the verifier's explanatory feedback. |

Everything else in `findings.json` is literal replacement text. **If you find yourself about to paste something that reads like an instruction** ("Rewrite…", "Re-key…", "e.g.", "[…]"), stop. That is the failure mode this cycle exists to end. Rule SR-01 will catch it in the decks, but not elsewhere.

### 2.5 Environment
- **Work from Josh's Mac** (a Claude Code session, or Codex with the same rules), in a **fresh worktree off `origin/main`**. Don't use his checked-out branch: it is 28 commits behind and holds unrelated work. See the project memory "branch-base-gotcha".
  ```bash
  git fetch origin && git worktree add .worktrees/pr-wpN origin/main -b fix/peer-review-wpN
  ```
- **Do not build or commit from the Cowork Linux VM.** It has no git-lfs, so LFS media appear as false modifications. It also cannot unlink files inside the mounted folder. A stale worktree from the review is left at `.worktrees/peer-review-0924`, with a stuck `index.lock` under `.git/worktrees/peer-review-0924/`. Remove both from the Mac first:
  ```bash
  git worktree remove --force .worktrees/peer-review-0924; git worktree prune
  ```
- The Mac's `/bin/bash` is 3.2. If a local gate fails while CI is green, suspect empty-array expansion under `set -u` before suspecting your change. `--no-verify` is never the answer.

---

## 3 · Work packages, sequenced by constraint

Each WP ships as **one small PR**, off `origin/main` or stacked on the previous one with `CLERKSHIP_PR_BASE=origin/<parent>` (§6). The PR body lists the finding ids it resolves. Order rules:
- **WP-0 first**, because everything references the record.
- **WP-0b next.** It is a governance PR, and it must land before any content PR (J5).
- **WP-1 next.** It is the joint safety PR with architecture WP-1a (J0) and holds every point-of-action safety defect. It depends only on architecture **WP-0**, the governance PR fixing the stale COWS-waiver text in CLAUDE.md, if that PR is open; otherwise it goes straight after WP-0b.
- **WP-4 is batched** to cap how many question-bank items are in draft (and so hidden from Shelf Mode and Anki) at once.
- **WP-12 last**, because it regenerates derived artefacts once.

| WP | Scope | n (Maj/Mod/Min) | Main files | Hard constraints | Human gate |
|---|---|---|---|---|---|
| **0** | Land the review record | — | `docs/curriculum-review/peer-review-2026-09-24/**` | Docs only: no content, no governance. Commit the folder as-is plus this handoff; `raw/` stays. Leave `__pycache__/` out. | Josh merges. |
| **0b** | **Editorial-leak lint** (J5) | — | `bin/check_editorial_leaks.py` *(new)*, `bin/editorial_leaks_baseline.json` *(new)*, one `step` in `bin/verify.sh` | **Governance-only diff.** Scan every learner-facing registry and shipped source for editorial imperatives (§4.7). It is a ratchet per `docs/RATCHETS.md`: pin today's count, and have `--self-test` prove it fires. Exit 0/1/2, where 2 = could not check. **Not** in `ci.yml`. After WP-3 merges, lower the pin to 0 in a second tiny governance PR. | Josh reviews and merges. |
| **1** | **Joint safety PR** (J0): this handoff's WP-1 + former WP-2 + M04-001/-002/-016 + M05-009, **and** architecture WP-1a (a)–(h) | 66 (7/58/1) + arch WP-1a | `cl_reference.md`, both 09-14 SS/NMS COTWs, the **09-23 agitation COTW pair (S1-*)**, `hyperthermia_toxidromes…md`, `interaction-cards.html`, `ect_neuromodulation…md`, `catatonia…md`, agitation page, eating/sleep/cultural/mood/monitoring pages, `rounds_questions.md`, `rapid_review_buzzwords.md`, `withdrawal-ciwa-cows-card.html`, both OUD COTWs, `cotw_registry.json`, orientation packet, Week 1 README, `topic_meta.json`, both `quizzes.json` (AR-41 Q5), agitation packs, `question_bank.json` (**9 items ATT → draft**, J4) | SR-10, -11, -12, -14, -15, -16, -17 and -19 must clear, **and** every architecture WP-1a acceptance grep returns 0. Use one commit per topic cluster: lithium/EXTRIP, SS-NMS-hyperthermia, catatonia/ECT, withdrawal/COWS/OUD, refeeding, RLS, cultural, SI escalation, 09-23 COTW, instrument chips. | Josh reviews per commit, then re-attests the 9 items and the drifted pages. |
| **2** | *(merged into WP-1 by J0)* | 0 | — | `check_remediation.py --wp WP-2` now exits 2 (empty selection). That is expected. | — |
| **3** | **Audio-quiz decks** (pattern G; 9 Majors) | 49 (9/27/13) | both `quizzes.json` | SR-01 through SR-07 clear in **both** files. Make every sibling edit in report §6. Read each deck's paper **results section** before rewriting. | None (decks carry no attestation ledger). Josh spot-checks the AR-18/-20/-23/-26/-29 rewrites. |
| **4** | **Question bank**, remaining items | 52 (0/27/25) | `question_bank.json` (34 attested items touched) | Batch by category, **≤ 10 attested items per PR** (J4), merged only when Josh can re-attest within ~48 h. Order: safety → pharm → mood → the rest. Rules SR-08 and SR-09 must clear. | Josh re-attests each batch in the console. |
| **5** | **Interview Room** (`sp-interview.pack.json`) | 13 (0/12/1) | `_prototypes/sp-interview/sp-interview.pack.json`, `…/tests/*`, regenerated `sp-interview.preview.html` | Structural (§2.4). SR-18 must clear. Page is attested, so it drifts to pending. | Josh re-attests. **Run `sp-proxy/REDTEAM_CHECKLIST.md` after the pack change** (a CLAUDE.md rule). |
| **6** | **Jurisdiction** (pattern B) | 20 (0/11/9) | ethics/legal, violence, sexual/paraphilic, adjustment, capacity tool, therapy-on-unit, OSCE, systems_medlegal, `topic_meta.json` | Use **one footnote convention** (§4.3). SR-20 must clear, including the two extra t_sexual siblings. | None beyond PR review. |
| **7** | **DSM-5-TR criteria strings** (pattern D) | 15 (1/5/9) | `rounds_questions.md`, `rapid_review_buzzwords.md`, the MDD COTW, psychosis/personality/neurodev/somatic pages | Quote DSM-5-TR criteria counts and durations exactly (§4.4). Include the sp-interview "mixed features" siblings only if WP-5 hasn't landed. | None. |
| **8** | **Suicide-inquiry alignment** (pattern F), remainder | 9 (0/3/6) | MSE tool, OSCE, MDD COTW, therapy reading room, systems_medlegal, FEP resident COTW, canon_200 | Align every surface to `pg_interview.md`. **J3:** add `<!-- crisis-block -->` to the MS3 MDD COTW (M11-008), resident FEP COTW (R02-006), resident MDD COTW (Q8; no finding id, so note it in the PR) and `osce.md` (M09-011), **and** add all four to `_CRISIS_REQUIRED_MD`. Check `front-door.spec.js` collapse pins, and confirm the block renders in `_build/res` for the resident pages. | PR review only (scope decided). |
| **9** | **Citations and evidence** (pattern H + E1) | 56 (0/19/37) | `evidence_annotations.json`, `evidence_registry.json` (E1-001), `canon_200.md`, `evidence_inpatient.md`, brief psychotherapy, book library, BPD resident COTW | Span discipline (§2.2). `validate_evidence_annotations.py` and `bin/verify_spans.py` must stay at or below their ratchet baselines. SR-21 must clear. | None. |
| **10** | Remaining **Major + Moderate** | 40 (1/39/0) | `topic_meta.json`, `rounds_questions.md`, reasoning cases, anxiety/eating/perinatal/workup pages | SR-13 must clear. (Refeeding, RLS and the cultural sentence moved to WP-1 by J0.) | None. |
| **11** | **Minor sweep** | 53 (0/0/53) | mostly `rounds_questions.md` and topic pages | Terminology and stigmatising-language fixes ("completed suicide", "alcoholic", "a diabetic", DSM-5 → DSM-5-TR). | None. |
| **12** | **Derived artefacts + close-out** | — | `09_Exam_Prep/anki_export/*` (regenerate with genanki locally), `.preview.html` (their generators), `tests/__panels__/` (`node bin/render_panels.mjs --write`), transcript re-export, final ledger | See §4.6. | Josh merges; confirms production deploys. |

Appendix A maps every finding id to its WP, its file(s), and the attestation state it disturbs.

---

## 4 · WP-specific instructions

### 4.1 WP-1: joint safety PR (do these exactly)

**Mechanics (J0).**
- Branch `content/clinical-safety-shared` off `origin/main`.
- Apply this handoff's WP-1 ids **and** architecture WP-1a (a)–(h) in one diff, one commit per topic cluster.
- Where both handoffs name the same string, satisfy both at once. One edit, both acceptance checks:
  ```bash
  check_remediation.py --wp WP-1
  ```
  plus the architecture WP-1a grep list.
- **Conflict rule:** the architecture handoff §7-B says to leave the `cl_reference.md` toxicity/EXTRIP lines alone. **Override it.** R01-001/-002 were verified against EXTRIP 2015 after that note was written. Change the lithium *target* range per architecture §7-B **and** the dialysis line per R01-001 in the same edit.
- Refeeding (M04-001/-002, SR-12) uses the architecture §7-A statement.
- RLS (M04-016) uses §7-D.
- The cultural sentence (M05-009) uses §7-F. The finding's `correction` is superseded by §7-F; mark it DEVIATED with that reason.
- Every buprenorphine surface uses the §4.2 sentence (J1), shortened as needed. Where a finding's `correction` wording differs from the canonical, the canonical wins: record DEVIATED with the reason "J1 canonical".

**09-23 agitation & delirium COTW (S1-*; pages still pending, so fix before attestation).**
- **S1-005 (Major, resident):** the IM olanzapine + parenteral benzodiazepine caution applies generally (Zyprexa label §5.7; Project BETA), not only to alcohol-intoxicated patients.
- **S1-001/-007:** add alcohol/sedative withdrawal and CNS infection to both delirium differentials. The pages' "avoid benzodiazepines" rule depends on withdrawal being excluded.
- **S1-006:** patient B's differential needs head injury (police altercation), excited catatonia and serotonin toxicity.
- **S1-003/-012:** Lewy body/Parkinson sensitivity before haloperidol in a 74-year-old. Use the verifier's wording: features that predate this illness, *not* the visual hallucinations and fluctuations the page teaches as delirium.
- **S1-008..-011:**
  - lead with benzodiazepine for sympathomimetic agitation, with the no-stacking caution (S1-008);
  - temperature and CK monitoring, plus restraint harms (S1-009);
  - federal restraint specifics per the verifier: continuous monitoring only for combined restraint + seclusion, and no CMS debrief requirement for hospitals (S1-010);
  - the droperidol boxed warning is current, not historical (S1-011).
- Citation fixes S1-013..-016 go to WP-9.


- **Lithium dialysis** (`cl_reference.md` line and key-point card, R01-001/-002).
  - Replace with the EXTRIP 2015 wording in `findings.json` (the verifier restored "life-threatening").
  - Check the MS3 lithium COTW and the resident lithium COTW still agree. Both were judged correct; don't touch them unless SR-17 flags them.
- **09-14 SS/NMS resident COTW** (R02-001..-004).
  - Hold venlafaxine and other serotonergic agents until serotonin syndrome is excluded.
  - Bromocriptine only once SS is excluded.
  - Paralysis with a non-depolarising agent; avoid succinylcholine.
  - Fix the garbled rule for continuing dopamine agonists after NMS resolves (≈10 days after oral antipsychotic exposure; 2–3 weeks after depot).
  - MS3 twin (M10-002/-003): apply the >38.5 °C threshold to the case's own patient, and add "avoid physical restraints".
  - Also apply the succinylcholine line to the 07-09 MS3 COTW (M12-013).
- **Toxidromes** (M05-001..-004). Add DTs and sympathomimetic toxicity to the rule-out list, the page's first-move sentence **and** the first-move card. These are two copies: `topic_meta.json` and the page.
- **Clozapine + smoking cessation** (M06-001). Tell the prescriber the same day. The source string has inline `<em>` tags; keep the markup.
- **Malignant catatonia item** (`qb_cog_014`, Q2-001..-003). Add "continue lorazepam" to the key and pearl, and reconcile the tier-2 option C text. **Demote to draft.**
- **Withdrawal-seizure item** (`qb_sud_014`, Q4-001/-002). Make the rationale and pearl match the corrected key. **Demote to draft.**
- **ECT holds** (M06-005/-006). Continue antiepileptics given for epilepsy; don't abruptly stop lorazepam in catatonia.
- **Agitation / catatonia holds** (M05-005, M05-007). Add the withdrawal and catatonia exception, and give the hold an end point. The catatonia pearl carries the same wording (SR-15).
- **SI/HI escalation threshold, MS3** (M01-001..-003). Apply to the packet, the key-point card and the Week 1 README.
- **Hold standard** (R04-001). "A substantial likelihood of serious harm … how imminent is defined by your state's statute."
- **CIWA reassessment interval** (M13-001). Fix it in the withdrawal `topic_meta.json` clinicalWorkflow string; the curator catalog renders from it.
- **Methadone bridge** (R03-004). Buprenorphine prescription. Methadone for OUD goes through an OTP next-day intake, or the DEA 3-day dispensing rule (21 CFR 1306.07(b) as amended 2023).
- **Remaining WP-1 ids:** CK/EEG in the catatonia workup; myocarditis surveillance in `med_monitoring.md` and `adv_psychopharm.md`; seizure window 6–48 h in `decision-aids.html` (the verifier notes First Aid still says 24–48 h, so say "typically 6–48 h, peak 12–24 h"); NMS/SS rapid-review lines (keep "hyporeflexia"); thiamine in the agitation packs (both); the resident welcome escalation line (**RD-001: policy pointer only, per J2.** The correction in `findings.json` is already updated); the C-SSRS-as-first-move card (M03-004); the case-4 NMS loop in `cases.md` (M10-001, persisting since 09-01); delirium not ruled out by one exam (`qb_mood_013` **ATT → draft**).

### 4.2 The canonical buprenorphine sentence (J1: approved; reuse everywhere, inside WP-1)

> *Start buprenorphine once objective withdrawal is present — roughly COWS ≥ 8–12 depending on the guideline (ASAM's 2023 fentanyl guidance: ≥ 8 with at least one objective sign). With fentanyl, precipitated withdrawal is uncommon; the first treatment is more buprenorphine. Low-dose and high-dose initiation are recognised alternatives your team may use.*

- **Source:** architecture handoff §7-C. Its spans are TIP 63 (REMS COWS ≥ 12), ASAM 2020 (COWS 11–12), ASAM 2023 HPSO (PMID 37934520, Table 3: COWS ≥ 8 + 1 objective sign), and D'Onofrio *JAMA* 2026 (PMID 41670966: precipitated withdrawal 0.6–0.8% with 76% fentanyl-positive).
- **Register the spans (G6)** in the same PR. Watch the decoy erratum, PMID 32487948.
- **Fit the length to each surface.**
  - A rapid-review line takes the first sentence plus "low-dose/high-dose initiation are alternatives".
  - Items and quizzes keep their own grammar, but must not call the threshold "required", say it "ensures" safety, or teach one cutoff as *the* number.
- **Do not assert** a *higher* COWS threshold for fentanyl. **Do not say** fentanyl precludes standard initiation.
- **Replace** "COWS should ideally be ≥10–12" in `rounds_questions.md`. The architecture WP-1a grep `COWS[^.]{0,20}(≥|>=) ?10[–-]12` must return 0.
- **M09-001:** methadone and buprenorphine reduce mortality; naltrexone has not been shown to (Larochelle 2018, PMID 29913516).
- **M11-001:** rewrite the MS3 OUD TL;DR **and** the shelf takeaway in `cotw_registry.json` to describe *this* case: naloxone-precipitated withdrawal, then start buprenorphine in the ED.
- **R03-004:** the methadone bridge goes through an OTP next-day intake or the DEA 3-day rule, never a discharge prescription.

### 4.3 WP-6: one jurisdiction convention
**J6: generic rule first, then a Maine example.** Use one pattern everywhere, modelled on `14_Tracks/Resident/systems_medlegal.md`, which already does this well:

> *…varies by state (mandatory in some, permissive in others, absent in a few). Check your state's statute; in Maine, …*

Surfaces:
- Tarasoff: violence, ethics card, `qb_eth_002` (WP-4), rapid review.
- Elder-abuse reporting.
- Civil involuntary medication (M12-001: the three Supreme Court cases are criminal-justice cases; civil involuntary medication follows state law).
- ECT surrogate consent (R02-008: California Probate Code §4652 is the verified example).
- Voluntary discharge requests.
- Paraphilia reporting (only children, elders and dependent adults create a mandate).

UK-as-US:
- **R04-005:** valproate "pregnancy-prevention programme". US = FDA boxed warning; there is no REMS.
- **M11-003:** MAOI washout. US labels = at least 14 days, or 5 weeks from fluoxetine.

### 4.4 WP-7: DSM-5-TR strings
Fix each finding, and make every edited criteria line state the count and duration exactly:
- Manic episode: ≥ 3 symptoms, or ≥ 4 if mood is only irritable; plus increased activity or energy.
- MDD: 5 of 9 symptoms over 2 weeks, one of them depressed mood or anhedonia.
- PTSD: four clusters, duration > 1 month.
- ADHD: several symptoms present in ≥ 2 settings.
- Schizophrenia: 6 months.
- Schizoaffective: mood episodes for the majority of the total illness duration.
- Mixed features: ≥ 3 opposite-pole symptoms, **excluding** the overlapping ones (agitation, insomnia, distractibility).

### 4.5 WP-5: Interview Room
- Pack edits go in `sp-interview.pack.json`. The preview regenerates with `node _prototypes/sp-interview/generate-preview.mjs`.
- Update the case tests under `_prototypes/sp-interview/tests/`, then run `bash _prototypes/sp-interview/tests/run-all.sh`. This suite is CI-only in the build, so run it locally.
- Checklist labels and tags say "mixed features" at several places. Rename the Marcus framing to "a passing hopeless thought during mania: ask about it, and don't label it mixed features".
- Add a weapons/firearms prompt to all three debriefs, and weapons, past violence and "tell your supervisor now" to Ray.
- After merge: `sp-proxy/REDTEAM_CHECKLIST.md`, plus a hosted-preview redeploy if the preview site is in use (see `sp-preview/`).

### 4.6 WP-12: derived artefacts and close-out
1. **Anki decks ship stale** unless regenerated. Netlify has no genanki and falls back to the committed `.apkg` files in `09_Exam_Prep/anki_export/`, and 170 finding texts are in them.
   - Install genanki locally, run the three `export_anki*.py` scripts (see `build_anki.sh`), and commit the refreshed decks.
   - Note that drafts are excluded, so run this **after** Josh has re-attested WP-1/2/4.
2. **Previews:** regenerate `sp-interview.preview.html` (generator above) and the two agitation previews (`bin/check_twin_parity.py` SNAPSHOT must pass).
3. **Legacy `13_Faculty_Resources/attest-batch.html`** carries 29 old strings. Regenerate it with `python3 13_Faculty_Resources/_automation/build_attest.py`, or leave it and say so. It is not learner-facing.
4. **Transcripts.** Build both sites, then run `export_curriculum_review.py`. Then do the old-style grep of every FIXED quote against the regenerated transcripts as a second check; this catches audience-scoping mistakes.
5. **Ledger.** Append a `REMEDIATION_LEDGER.md` to the review folder: id → PR → commit → final status, plus every DEVIATED and declined id with its reason.
6. **ICD-10-CM FY2027 starts 2026-10-01.** Run `python3 bin/check_icd_codes.py` whether or not any WP touched a code.

### 4.7 WP-0b: `bin/check_editorial_leaks.py` (J5)

- **Scope.** Every learner-facing registry:
  - `question_bank.json`
  - both `quizzes.json`
  - `topic_meta.json`
  - `communication_cases.json`, `reasoning_cases*.json`, `family_systems_scenarios.json`, `longitudinal_case.json`
  - `cotw_registry.json`
  - `_prototypes/**/*.pack.json`

  Plus every shipped `source`/`extraSources` from `site_build/shipped_pages.json`. Read that through `load_shipped_pages()`, never the manifest (ADR-002).
- **Patterns.** Start from SR-01 and generalise:
  `(?i)\brewrite the (item|stem|question)\b|\bre-?key (the item|to)\b|\bthe key is the false claim\b|\b[A-Z0-9]{2,6}-F\d{3}\b|\be\.g\. stem:|\[your [a-z]+ — e\.g\.|\breviewer (must|should)\b`
  Report path, locus and the matched text. Allowlist the review record itself (`docs/`) and `13_Faculty_Resources/Handoffs/`.
- **Contract** (`docs/RATCHETS.md`, `docs/SILENT_SHRINK_CHECKLIST.md`):
  - `--self-test` plants a leak in a fixture and must exit 1.
  - It says how many files it examined beside the verdict.
  - It exits 2 when it examined 0 files or a registry fails to parse.
  - The pin lives in `bin/editorial_leaks_baseline.json` and is set to **today's count**. That is at least 16 (8 hits in each `quizzes.json`); measure it, don't assume it.
  - `--update-baseline` lowers the pin.
- **Wire-up.** One `step` in `bin/verify.sh`. `bin/check-verify-coverage.py` needs nothing (the tool is not in `ci.yml`).
- **Lowering the pin to 0 after WP-3** is a **separate governance PR**. The baseline file is under `bin/`, so it can't ride WP-3's content diff (L1).

---

## 5 · Acceptance loop: every WP, before every push

Machine-verifiable. Paste each command's last line into the PR body.

```bash
R=docs/curriculum-review/peer-review-2026-09-24
export PYTHONDONTWRITEBYTECODE=1

# 0. Start clean: record the WP's baseline (expect every id OPEN)
python3 $R/check_remediation.py --wp WP-N --rev origin/main | head -3

# … edits …

# 1. The completion gate — MUST exit 0
python3 $R/check_remediation.py --wp WP-N --verbose        # 0 = all FIXED/DEVIATED, no sibling match

# 2. Validators and contracts
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
python3 13_Faculty_Resources/_automation/validate_evidence_annotations.py
python3 bin/verify_spans.py                                  # ratchet: must not rise
python3 bin/check_twin_parity.py                             # EXACT + SNAPSHOT halves must pass
node --test tests/*.test.mjs
node bin/render_panels.mjs          # expect N>0 changed; then --write and commit tests/__panels__/ as the learner-visible diff

# 3. Governance separation (also runs inside verify.sh)
python3 bin/check_governance_separation.py                   # exit 0; stacked branch → CLERKSHIP_PR_BASE=origin/<parent>

# 4. Full local gate (= pre-push hook), then both builds
bash bin/verify.sh
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

**How to read the checker:**

| Status | Meaning | What to do |
|---|---|---|
| `FIXED` | Quote gone from every located copy, and the correction is present. | Nothing. |
| `DEVIATED` | Quote gone, but the correction text wasn't found verbatim. | Allowed only with a one-line reason per id in the PR body: a verifier's §6 companion edit reworded it, grammar, or a structural fix (§2.4). |
| `OPEN` | The quote survives somewhere in `editFiles`. | Fix that copy, or waive it in `waivers.json` with a reason if it is truly a different context. |
| `UNCHECKED` (exit 2) | A located file has gone missing (renamed or moved). | **Never a pass.** Update `locator_manifest.json` in the same PR and say why. |
| `MATCH SR-nn` | A sibling copy of the defect survived. | Fix it. Never edit a rule to make it pass. If a rule is truly wrong, change it in a separate commit with the evidence. |

---

## 6 · PR conventions

- **Branch:** `fix/peer-review-wpN-<slug>`, off `origin/main`. When stacking on an unmerged WP:
  ```bash
  CLERKSHIP_PR_BASE=origin/<parent-branch> git push
  ```
  This moves the base only; it silences no rule.
- **Title:** `peer-review WP-N: <scope> (<k> findings)`.
- **Body sections, in order:**
  1. Finding ids resolved (the checker's `--verbose` table).
  2. DEVIATED ids with reasons.
  3. Declined ids with evidence.
  4. **Attestation impact.** Question-bank items demoted to draft, which Josh must re-attest in the console. Pages that will render pending by drift; list them from `node bin/render_panels.mjs` and `python3 bin/what_needs_josh.py`.
  5. New or changed `sourceSpan` entries.
  6. Learner-visible delta (the `tests/__panels__/` diff summary).
  7. Acceptance-loop last lines.
- **Commit trailer:** use the repo's attribution convention. Never `--no-verify`.
- **Never merge your own PR.** Josh merges.

---

## 7 · Decisions: status

All J-decisions were made on 2026-09-24 (§0A). What remains Josh's at run time:

- **Re-attestation** of every demoted question-bank item and every drifted page. Use the console on `attest/pending`, which is synced by merge, never rebase. List them with `python3 bin/what_needs_josh.py`.
- **Merging** every PR. Never merge your own.
- **Any clinical question a finding's evidence can't settle.** Put it in the PR body as a numbered question. Don't guess.
- **Architecture D1 check.** If a recorded D1 exists by the time you start and differs from J1, the recorded D1 wins (per J1). Note it in the PR body.

---

## 8 · Coordination with the architecture handoff (J0)

The architecture remediation handoff is in the claude.ai project, as doc `claude/curriculum-architecture-remediation-handoff-2026-09-24.md`. If you can't read it from your session, ask Josh to paste §4 WP-1a and §7-A..F.

- **Shared strings go in one PR** (WP-1 here = WP-1a there). Branch `content/clinical-safety-shared`. The PR body lists both handoffs' ids.
- **Architecture WP-0** (the governance PR fixing the stale COWS-waiver text in CLAUDE.md) goes before or alongside this handoff's **WP-0b**. They are both governance-only, so they may share one governance PR if Josh prefers. Never combine either with content.
- **Question-bank batches:** J4's ≤ 10 applies to both handoffs, so architecture D6's ≤ 24 is superseded.
- **Canonical values:** J1 = architecture §7-C. Refeeding, lithium, RLS and the cultural sentence use §7-A/B/D/F. EXTRIP: R01-001/-002 **override** the §7-B "leave alone" note.
- **After WP-1 merges:** architecture WP-1b (`canonical_claims.json` guards) makes the refeeding, lithium and COWS values regex-guarded. That is the permanent version of this handoff's SR-12/-14/-17/-19.
- **Architecture WP-2 "Curriculum spine v1" and later:** if any merge before a WP here, rebase and re-run the checker. `locator_manifest.json` paths may move; that is what `UNCHECKED` catches.
- **Architecture WP-6** (strip OSCE examiner material) and **J3** (a crisis marker on `osce.md`) touch the same file. Whichever lands second rebases. The crisis marker belongs in the learner-facing part, outside `<!-- faculty-only -->`.

## 9 · Out of scope (note in PRs; don't do unless asked)
- Instrument scope and the COWS interim waiver.
- `ci.yml` and any workflow change.
- The architecture review's structural recommendations (objectives, WBA cards, blueprint rebalancing).
- Rewriting any section beyond its finding. This review's mandate was the **smallest safe correction**. If a page needs more, open an issue citing the finding id.
- The ~229 first-pass-only findings get a lighter touch, but they are not optional. Declining one needs evidence, and "I'd phrase it differently" is not evidence.

— Peer-review session, 2026-09-24. Everything above is reproducible from the files in this folder. The checker baseline is `OPEN 374 · 31 sibling matches` at `origin/main` 36b9827. Decisions J0–J7 are recorded in §0A.

---

## Appendix A · Finding → work package → file map

Generated from `wp_map.json` + `locator_manifest.json` (located at `origin/main` 36b9827).

`Gov` is the attestation state the edit will disturb:
- **ATT** = attested question-bank item (demote to `draft` in the same diff).
- **rev** = page has a `reviewed` ledger row (it will drift to pending; do nothing).
- **pend** = page is already pending (fix before Josh attests).
- **draft** = draft item.
- blank = no ledger row (decks, cases, registry).

A file list with more than one entry means **every copy must change**, unless you waive one with a reason. WP-2 is empty (merged into WP-1 by J0).

### WP-1 (66)

| ID | Sev | Surface | Edit file(s) | Gov |
|---|---|---|---|---|
| M09-001 | Maj | rapid_review.md | `09_Exam_Prep/Shelf_High_Yield/rapid_review_buzzwords.md` | rev |
| M11-001 | Maj | cotw_20260727_oud_ms3.md | `08_Cases_and_Simulation/case-of-the-week/cotw_registry.json` | rev |
| Q4-001 | Maj | qb_sud_014 | `question_bank.json` | **ATT** |
| Q4-002 | Maj | qb_sud_014 | `question_bank.json` | **ATT** |
| R01-001 | Maj | cl_reference.md | `14_Tracks/Resident/cl_reference.md` | rev |
| R01-002 | Maj | cl_reference.md | `topic_meta.json` | rev |
| S1-005 | Maj | cotw_20260923_agitation_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-23_acute-agitation-delirium_Resident.md` | pend |
| AQ1-006 | Mod | AR-41 Q5 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| M01-001 | Mod | orientation.md | `14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md` | rev |
| M01-002 | Mod | orientation.md | `topic_meta.json` | rev |
| M01-003 | Mod | week1.md | `01_Six_Week_Curriculum/Week_1_Foundations/README.md` | rev |
| M03-004 | Mod | ddx.md | `02_Clinical_Skills/Differential_Diagnosis/inpatient_differential_scaffolds.md` | rev |
| M04-001 | Mod | t_eating.md | `topic_meta.json` | rev |
| M04-002 | Mod | t_eating.md | `03_Core_Topics/Eating_Disorders/eating_disorders_inpatient_teaching.md` | rev |
| M04-016 | Mod | t_sleep.md | `03_Core_Topics/Sleep/sleep_wake_disorders_inpatient_teaching.md` | rev |
| M05-001 | Mod | toxidromes.md | `04_Acute_and_Safety/Decision_Aids/decision-aids.html`<br>`07_Evidence_and_Reading/Landmark_Trials/shelf-mode.html`<br>`question_bank.json`<br>`topic_meta.json` | rev |
| M05-002 | Mod | toxidromes.md | `04_Acute_and_Safety/Toxidromes/hyperthermia_toxidromes_inpatient_teaching.md` | rev |
| M05-003 | Mod | toxidromes.md | `topic_meta.json` | rev |
| M05-004 | Mod | toxidromes.md | `04_Acute_and_Safety/Toxidromes/hyperthermia_toxidromes_inpatient_teaching.md` | rev |
| M05-005 | Mod | agitation.md | `04_Acute_and_Safety/Agitation_and_Restraint/agitation_restraint_inpatient_teaching.md` | rev |
| M05-006 | Mod | catatonia.md | `04_Acute_and_Safety/Catatonia/catatonia_inpatient_teaching.md` | rev |
| M05-007 | Mod | catatonia.md | `04_Acute_and_Safety/Catatonia/catatonia_inpatient_teaching.md`<br>`question_bank.json` | rev |
| M05-009 | Mod | cultural_psychiatry.md | `03_Core_Topics/Cultural_Psychiatry/cultural_psychiatry_inpatient_teaching.md` | rev |
| M05-013 | Mod | exp_consult.md | `14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/consult_capacity_delirium_catatonia_withdrawal.md` | rev |
| M05-014 | Mod | withdrawal.html | `03_Core_Topics/SUD_Withdrawal/withdrawal-ciwa-cows-card.html` | rev |
| M06-001 | Mod | interaction-cards.html | `05_Psychopharmacology/Monitoring_and_Labs/interaction-cards.html` | rev |
| M06-004 | Mod | med_monitoring.md | `05_Psychopharmacology/Monitoring_and_Labs/medication_monitoring_inpatient_teaching.md` | rev |
| M06-005 | Mod | ect_neuromodulation.md | `topic_meta.json` | rev |
| M06-006 | Mod | ect_neuromodulation.md | `05_Psychopharmacology/ECT_Neuromodulation/ect_neuromodulation_inpatient_teaching.md` | rev |
| M06-007 | Mod | decision-aids.html | `04_Acute_and_Safety/Decision_Aids/decision-aids.html` | rev |
| M08-005 | Mod | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M08-008 | Mod | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M09-004 | Mod | rapid_review.md | `09_Exam_Prep/Shelf_High_Yield/rapid_review_buzzwords.md` | rev |
| M09-005 | Mod | rapid_review.md | `09_Exam_Prep/Shelf_High_Yield/rapid_review_buzzwords.md` | rev |
| M09-007 | Mod | rapid_review.md | `09_Exam_Prep/Shelf_High_Yield/rapid_review_buzzwords.md` | rev |
| M10-001 | Mod | cases.md | `14_Tracks/MS3/Student_Ready_Pack/08_synthetic_cases/synthetic_practice_cases.md` | rev |
| M10-002 | Mod | cotw_20260914_ssnms_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-14_serotonin-syndrome-vs-nms_MS3.md` | rev |
| M10-003 | Mod | cotw_20260914_ssnms_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-14_serotonin-syndrome-vs-nms_MS3.md` | rev |
| M13-001 | Mod | rotation-curator.html (embedded withdrawal t | `topic_meta.json` | rev |
| Q1-015 | Mod | qb_mood_013 | `question_bank.json` | **ATT** |
| Q2-001 | Mod | qb_cog_014 | `question_bank.json` | **ATT** |
| Q2-002 | Mod | qb_cog_014 | `question_bank.json` | **ATT** |
| Q2-003 | Mod | qb_cog_014 | `question_bank.json` | **ATT** |
| Q4-003 | Mod | qb_sud_005 | `question_bank.json` | **ATT** |
| Q4-004 | Mod | qb_sud_005 | `question_bank.json` | **ATT** |
| R01-006 | Mod | rp-agitation.html | `_prototypes/agitation-trainer/agitation.pack.json`<br>`_prototypes/agitation-trainer/rp-agitation.pack.json` | rev |
| R01-009 | Mod | adv_psychopharm.md | `topic_meta.json` | rev |
| R02-001 | Mod | cotw_20260914_ssnms_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-14_serotonin-syndrome-vs-nms_Resident.md` | rev |
| R02-002 | Mod | cotw_20260914_ssnms_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-14_serotonin-syndrome-vs-nms_Resident.md` | rev |
| R02-003 | Mod | cotw_20260914_ssnms_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-14_serotonin-syndrome-vs-nms_Resident.md` | rev |
| R02-004 | Mod | cotw_20260914_ssnms_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-14_serotonin-syndrome-vs-nms_Resident.md` | rev |
| R03-004 | Mod | cotw_20260727_oud_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-27_opioid-use-disorder_Resident.md` | rev |
| R03-005 | Mod | cotw_20260727_oud_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-27_opioid-use-disorder_Resident.md` | rev |
| R04-001 | Mod | cotw_20260723_suiciderisk_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-23_suicide-risk-assessment-safety-planning_Resident.md` | rev |
| RD-001 | Mod | welcome.md | `14_Tracks/Resident/resident_welcome.md`<br>`topic_meta.json` | rev |
| S1-001 | Mod | cotw_20260923_agitation_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-23_acute-agitation-delirium_MS3.md` | pend |
| S1-002 | Mod | cotw_20260923_agitation_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-23_acute-agitation-delirium_MS3.md` | pend |
| S1-003 | Mod | cotw_20260923_agitation_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-23_acute-agitation-delirium_MS3.md` | pend |
| S1-006 | Mod | cotw_20260923_agitation_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-23_acute-agitation-delirium_Resident.md` | pend |
| S1-007 | Mod | cotw_20260923_agitation_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-23_acute-agitation-delirium_Resident.md` | pend |
| S1-008 | Mod | cotw_20260923_agitation_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-23_acute-agitation-delirium_Resident.md` | pend |
| S1-009 | Mod | cotw_20260923_agitation_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-23_acute-agitation-delirium_Resident.md` | pend |
| S1-010 | Mod | cotw_20260923_agitation_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-23_acute-agitation-delirium_Resident.md` | pend |
| S1-011 | Mod | cotw_20260923_agitation_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-23_acute-agitation-delirium_Resident.md` | pend |
| S1-012 | Mod | cotw_20260923_agitation_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-23_acute-agitation-delirium_Resident.md` | pend |
| M12-013 | Min | cotw_20260709_ssnms_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-09_serotonin-syndrome-vs-nms_MS3.md` | rev |

### WP-3 (49)

| ID | Sev | Surface | Edit file(s) | Gov |
|---|---|---|---|---|
| AQ2-001 | Maj | AR-34 Q6 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-001 | Maj | AR-20 Q2 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-002 | Maj | AR-20 Q2 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-003 | Maj | AR-20 Q2 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-006 | Maj | AR-27 Q3 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-011 | Maj | AR-29 Q1 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-013 | Maj | AR-23 Q2 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json` |  |
| AQ3-016 | Maj | AR-18 Q3 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-017 | Maj | AR-18 Q3 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ1-001 | Mod | AR-44 Q2 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ1-002 | Mod | AR-48 Q4 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ1-003 | Mod | AR-48 Q3 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ1-004 | Mod | AR-41 Q1 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ1-008 | Mod | AR-36 Q4 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ1-009 | Mod | AR-42 Q5 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ1-010 | Mod | AR-49 Q1 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ2-002 | Mod | AR-34 Q6 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ2-003 | Mod | AR-40 Q1 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ2-004 | Mod | AR-40 Q3 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ2-005 | Mod | AR-37 Q4 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ2-006 | Mod | AR-37 Q5 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json` |  |
| AQ3-004 | Mod | AR-20 Q6 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-007 | Mod | AR-27 Q4 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-008 | Mod | AR-26 Q5 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-009 | Mod | AR-26 Q5 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-010 | Mod | AR-26 Q5 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-014 | Mod | AR-23 Q2 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json` |  |
| AQ3-015 | Mod | AR-23 Q3 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-018 | Mod | AR-18 Q3 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-019 | Mod | AR-18 Q6 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-020 | Mod | AR-18 Q2 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-021 | Mod | AR-22 Q5 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ4-001 | Mod | AR-08 Q6 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ4-002 | Mod | AR-08 Q1 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ4-003 | Mod | AR-12 Q5 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ4-004 | Mod | AR-13 Q4 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ1-005 | Min | AR-41 Q6 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ1-007 | Min | AR-41 Q5 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ1-011 | Min | AR-44 Q3 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ1-012 | Min | AR-44 Q5 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ1-013 | Min | AR-45 Q2 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ2-007 | Min | AR-37 Q3 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ2-008 | Min | AR-31 Q3 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ2-009 | Min | AR-32 Q6 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-005 | Min | AR-20 Q4 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-012 | Min | AR-29 Q2 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-022 | Min | AR-25 Q3 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |
| AQ3-023 | Min | AR-25 Q3 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json` |  |
| AQ4-005 | Min | AR-16 Q6 | `07_Evidence_and_Reading/Landmark_Trials/quizzes.json`<br>`_prototypes/canon-quiz/quizzes.json` |  |

### WP-4 (52)

| ID | Sev | Surface | Edit file(s) | Gov |
|---|---|---|---|---|
| Q1-001 | Mod | qb_anx_003 | `question_bank.json` | **ATT** |
| Q1-002 | Mod | qb_anx_003 | `question_bank.json` | **ATT** |
| Q1-003 | Mod | qb_anx_003 | `question_bank.json` | **ATT** |
| Q1-005 | Mod | qb_cdev_002 | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md`<br>`question_bank.json` | **ATT** |
| Q1-006 | Mod | qb_cdev_005 | `question_bank.json` | draft |
| Q1-007 | Mod | qb_cdev_005 | `question_bank.json` | draft |
| Q1-009 | Mod | qb_eth_002 | `question_bank.json` | **ATT** |
| Q1-011 | Mod | qb_eth_005 | `question_bank.json` | **ATT** |
| Q1-012 | Mod | qb_eth_014 | `question_bank.json` | draft |
| Q1-013 | Mod | qb_mood_005 | `question_bank.json` | **ATT** |
| Q1-014 | Mod | qb_mood_005 | `question_bank.json` | **ATT** |
| Q1-016 | Mod | qb_mood_015 | `question_bank.json` | **ATT** |
| Q1-017 | Mod | qb_mood_016 | `question_bank.json` | **ATT** |
| Q1-018 | Mod | qb_mood_016 | `question_bank.json` | **ATT** |
| Q2-004 | Mod | qb_otherdx_008 | `question_bank.json` | **ATT** |
| Q2-005 | Mod | qb_otherdx_008 | `question_bank.json` | **ATT** |
| Q2-006 | Mod | qb_pha_006 | `question_bank.json` | **ATT** |
| Q2-008 | Mod | qb_otherdx_013 | `question_bank.json` | draft |
| Q2-009 | Mod | qb_per_005 | `question_bank.json` | **ATT** |
| Q3-001 | Mod | qb_psy_007 | `question_bank.json` | **ATT** |
| Q3-002 | Mod | qb_psy_005 | `question_bank.json` | **ATT** |
| Q3-003 | Mod | qb_psy_003 | `question_bank.json` | **ATT** |
| Q3-009 | Mod | qb_rel_013 | `question_bank.json` | **ATT** |
| Q3-010 | Mod | qb_rel_010 | `question_bank.json` | **ATT** |
| Q3-011 | Mod | qb_saf_010 | `question_bank.json` | **ATT** |
| Q4-005 | Mod | qb_sud_016 | `question_bank.json` | draft |
| Q4-006 | Mod | qb_sud_016 | `question_bank.json` | draft |
| Q1-004 | Min | qb_anx_016 | `question_bank.json` | **ATT** |
| Q1-008 | Min | qb_cdev_011 | `question_bank.json` | draft |
| Q1-010 | Min | qb_eth_003 | `question_bank.json` | **ATT** |
| Q1-019 | Min | qb_mood_016 | `question_bank.json` | **ATT** |
| Q2-007 | Min | qb_pha_006 | `question_bank.json` | **ATT** |
| Q2-010 | Min | qb_per_002 | `question_bank.json` | **ATT** |
| Q2-011 | Min | qb_pha_002 | `question_bank.json` | **ATT** |
| Q2-012 | Min | qb_pha_007 | `question_bank.json` | **ATT** |
| Q2-013 | Min | qb_pha_009 | `question_bank.json` | **ATT** |
| Q2-014 | Min | qb_pha_012 | `question_bank.json` | draft |
| Q2-015 | Min | qb_pha_013 | `question_bank.json` | **ATT** |
| Q2-016 | Min | qb_pha_005 | `question_bank.json` | **ATT** |
| Q2-017 | Min | qb_otherdx_010 | `question_bank.json` | draft |
| Q3-004 | Min | qb_psy_013 | `question_bank.json` | **ATT** |
| Q3-005 | Min | qb_psy_014 | `question_bank.json` | **ATT** |
| Q3-006 | Min | qb_psy_008 | `question_bank.json` | **ATT** |
| Q3-007 | Min | qb_rel_011 | `question_bank.json` | **ATT** |
| Q3-008 | Min | qb_rel_016 | `question_bank.json` | draft |
| Q3-012 | Min | qb_rel_001 | `question_bank.json` | **ATT** |
| Q3-013 | Min | qb_saf_006 | `question_bank.json` | **ATT** |
| Q3-014 | Min | qb_saf_005 | `question_bank.json` | **ATT** |
| Q3-015 | Min | qb_saf_013 | `question_bank.json` | draft |
| Q3-016 | Min | qb_rel_002 | `question_bank.json` | **ATT** |
| Q4-007 | Min | qb_sud_013 | `03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md`<br>`question_bank.json` | **ATT** |
| Q4-008 | Min | qb_sud_007 | `question_bank.json` | **ATT** |

### WP-5 (13)

| ID | Sev | Surface | Edit file(s) | Gov |
|---|---|---|---|---|
| M02-001 | Mod | sp-interview.html — Marcus criticalMiss.part | `_prototypes/sp-interview/sp-interview.pack.json` | rev |
| M02-002 | Mod | sp-interview.html — Marcus debriefTeachingPo | `_prototypes/sp-interview/sp-interview.pack.json` | rev |
| M02-004 | Mod | sp-interview.html — Marcus debriefTeachingPo | `_prototypes/sp-interview/sp-interview.pack.json` | rev |
| M02-005 | Mod | sp-interview.html — Marcus hints.c_si | `_prototypes/sp-interview/sp-interview.pack.json` | rev |
| M02-006 | Mod | sp-interview.html — Dana intent si_direct (p | `_prototypes/sp-interview/sp-interview.pack.json` | rev |
| M02-007 | Mod | sp-interview.html — Marcus intent si_direct  | `_prototypes/sp-interview/sp-interview.pack.json` | rev |
| M02-008 | Mod | sp-interview.html — Dana debriefTeachingPoin | `_prototypes/sp-interview/sp-interview.pack.json` | rev |
| M02-009 | Mod | sp-interview.html — Dana debriefTeachingPoin | `_prototypes/sp-interview/sp-interview.pack.json` | rev |
| M02-010 | Mod | sp-interview.html — Ray debriefTeachingPoint | `_prototypes/sp-interview/sp-interview.pack.json` | rev |
| M02-011 | Mod | sp-interview.html — Ray hints.c_medical | `_prototypes/sp-interview/sp-interview.pack.json` | rev |
| M02-012 | Mod | sp-interview.html — Ray hints.c_si | `_prototypes/sp-interview/sp-interview.pack.json` | rev |
| M02-013 | Mod | sp-interview.html — Ray intent challenge_del | `_prototypes/sp-interview/sp-interview.pack.json` | rev |
| M02-003 | Min | sp-interview.html — Marcus checklist c_si la | `_prototypes/sp-interview/sp-interview.pack.json` | rev |

### WP-6 (20)

| ID | Sev | Surface | Edit file(s) | Gov |
|---|---|---|---|---|
| M04-017 | Mod | t_sexual.md | `topic_meta.json` | rev |
| M04-018 | Mod | t_sexual.md | `03_Core_Topics/Sexual_Gender/sexual_paraphilic_gender_inpatient_teaching.md` | rev |
| M05-008 | Mod | violence.md | `04_Acute_and_Safety/Violence_Risk/violence_risk_inpatient_teaching.md`<br>`14_Tracks/Resident/systems_medlegal.md` | rev |
| M06-008 | Mod | ethics_legal.md | `topic_meta.json` | rev |
| M06-009 | Mod | ethics_legal.md | `topic_meta.json` | rev |
| M06-010 | Mod | ethics_legal.md | `03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md` | rev |
| M07-005 | Mod | therapy_on_the_unit.md | `topic_meta.json` | rev |
| M07-006 | Mod | therapy_on_the_unit.md | `02_Clinical_Skills/Psychotherapy/therapy_on_the_unit_inpatient_teaching.md` | rev |
| M11-003 | Mod | cotw_20260720_mdd_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-20_mdd-treatment-selection-augmentation_MS3.md` | rev |
| M12-001 | Mod | evidence_inpatient.md | `07_Evidence_and_Reading/Inpatient_Evidence/evidence_inpatient.md` | rev |
| R04-005 | Mod | cotw_20260720_bipolar_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-20_bipolar-mania_Resident.md` | rev |
| C1-006 | Min | bpd_rupture_repair_001 | `communication_cases.json` |  |
| M04-019 | Min | t_adjustment.md | `topic_meta.json` | rev |
| M04-020 | Min | t_adjustment.md | `03_Core_Topics/Adjustment/adjustment_disorders_inpatient_teaching.md` | rev |
| M05-012 | Min | capacity.html | `04_Acute_and_Safety/Decisional_Capacity/decisional-capacity-module.html` | rev |
| M06-011 | Min | ethics_legal.md | `03_Core_Topics/Ethics_Legal/ethics_law_confidentiality_inpatient_teaching.md` | rev |
| M08-025 | Min | doc_oral.md | `14_Tracks/MS3/Student_Ready_Pack/05_documentation_oral_presentation/student_documentation_and_oral_presentations.md` | rev |
| M09-006 | Min | rapid_review.md | `09_Exam_Prep/Shelf_High_Yield/rapid_review_buzzwords.md` | rev |
| M09-010 | Min | osce.md | `14_Tracks/MS3/Student_Ready_Pack/06_osce_cases/osce_station_set.md` | rev |
| R02-008 | Min | cotw_20260831_catatonia_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-08-31_catatonia-recognition-workup-treatment_Resident.md` | rev |

### WP-7 (15)

| ID | Sev | Surface | Edit file(s) | Gov |
|---|---|---|---|---|
| M08-002 | Maj | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M03-006 | Mod | t_mood.md | `topic_meta.json` | rev |
| M08-001 | Mod | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M09-002 | Mod | rapid_review.md | `09_Exam_Prep/Shelf_High_Yield/rapid_review_buzzwords.md` | rev |
| M09-003 | Mod | rapid_review.md | `09_Exam_Prep/Shelf_High_Yield/rapid_review_buzzwords.md` | rev |
| M11-005 | Mod | cotw_20260720_mdd_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-20_mdd-treatment-selection-augmentation_MS3.md` | rev |
| M03-009 | Min | t_personality.md | `03_Core_Topics/Personality/personality_disorders_inpatient_teaching.md` | rev |
| M03-010 | Min | t_psychosis.md | `03_Core_Topics/Psychosis/psychotic_disorders_inpatient_teaching.md` | rev |
| M04-010 | Min | t_neurodev.md | `03_Core_Topics/Neurodevelopmental/neurodevelopmental_disorders_inpatient_teaching.md` | rev |
| M04-014 | Min | t_somatic.md | `03_Core_Topics/Somatic/somatic_symptom_disorders_inpatient_teaching.md` | rev |
| M08-016 | Min | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M08-018 | Min | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M11-006 | Min | cotw_20260720_mdd_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-20_mdd-treatment-selection-augmentation_MS3.md` | rev |
| R02-009 | Min | cotw_20260831_catatonia_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-08-31_catatonia-recognition-workup-treatment_Resident.md` | rev |
| R04-002 | Min | cotw_20260723_suiciderisk_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-23_suicide-risk-assessment-safety-planning_Resident.md` | rev |

### WP-8 (9)

| ID | Sev | Surface | Edit file(s) | Gov |
|---|---|---|---|---|
| M01-010 | Mod | mse.html | `02_Clinical_Skills/Mental_Status_Exam/mental-status-exam-module.html` | rev |
| M13-002 | Mod | therapy_reading_room.md | `07_Evidence_and_Reading/Therapy_Reading_Room/therapy_reading_room.md` | rev |
| R05-001 | Mod | canon_200.md | `14_Tracks/Resident/canon_200.md` | rev |
| M01-007 | Min | orientation.md | `14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md` | rev |
| M04-021 | Min | t_impulse.md | `03_Core_Topics/Impulse_Control/impulse_control_conduct_inpatient_teaching.md` | rev |
| M09-011 | Min | osce.md | `14_Tracks/MS3/Student_Ready_Pack/06_osce_cases/osce_station_set.md` | rev |
| M11-008 | Min | cotw_20260720_mdd_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-20_mdd-treatment-selection-augmentation_MS3.md` | rev |
| R01-004 | Min | systems_medlegal.md | `14_Tracks/Resident/systems_medlegal.md` | rev |
| R02-006 | Min | cotw_20260907_fep_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-07_first-episode-psychosis_Resident.md` | rev |

### WP-9 (59)

| ID | Sev | Surface | Edit file(s) | Gov |
|---|---|---|---|---|
| C1-005 | Mod | trd_augmentation_choice_001 | `reasoning_cases_resident.json` |  |
| E1-001 | Mod | sall-2019 | `evidence_registry.json` |  |
| E1-002 | Mod | hajek-gross-2024 | `evidence_annotations.json` |  |
| E1-003 | Mod | boggs-2020-lethal-means-assessment | `evidence_annotations.json` |  |
| E1-004 | Mod | brodsky-2025 | `evidence_annotations.json` |  |
| M01-005 | Mod | week1.md | `topic_meta.json` | rev |
| M01-006 | Mod | week1.md | `01_Six_Week_Curriculum/Week_1_Foundations/README.md` | rev |
| M03-007 | Mod | t_personality.md | `03_Core_Topics/Personality/personality_disorders_inpatient_teaching.md`<br>`question_bank.json` | rev |
| M04-005 | Mod | t_perinatal.md | `topic_meta.json` | rev |
| M07-001 | Mod | brief_psychotherapy.md | `02_Clinical_Skills/Brief_Psychotherapy/brief_psychotherapy_inpatient.md` | rev |
| M07-002 | Mod | brief_psychotherapy.md | `02_Clinical_Skills/Brief_Psychotherapy/brief_psychotherapy_inpatient.md` | rev |
| M07-011 | Mod | family_modalities.md | `06_Family_and_Relational/family_therapy_modalities_inpatient.md` | rev |
| M07-013 | Mod | family_playbook.md | `topic_meta.json` | rev |
| M12-003 | Mod | evidence_inpatient.md | `07_Evidence_and_Reading/Inpatient_Evidence/evidence_inpatient.md` | rev |
| M13-003 | Mod | book_library.md | `topic_meta.json` | rev |
| R01-005 | Mod | rp-agitation.html | `_prototypes/agitation-trainer/agitation.pack.json`<br>`_prototypes/agitation-trainer/rp-agitation.pack.json` | rev |
| R01-013 | Mod | rp-brief-psych.html | `_prototypes/brief-psych/rp-brief-psych.pack.json` | rev |
| R03-002 | Mod | cotw_20260810_panic_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-08-10_anxiety-panic-disorder_Resident.md` | rev |
| S1-013 | Mod | cotw_20260923_agitation_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-23_acute-agitation-delirium_Resident.md` | pend |
| E1-005 | Min | stanley-brown-2018 | `evidence_annotations.json` |  |
| E1-006 | Min | bot-2026-benzodiazepines-catatonia | `evidence_annotations.json` |  |
| E1-007 | Min | steinberg-2024 | `evidence_annotations.json` |  |
| E1-008 | Min | steeg-2025 | `evidence_annotations.json` |  |
| E1-009 | Min | pharoah-2010-family-intervention | `evidence_annotations.json` |  |
| E1-010 | Min | cuijpers-2007 | `evidence_annotations.json` |  |
| E1-011 | Min | huggett-2024 | `evidence_annotations.json` |  |
| M03-013 | Min | t_sud.md | `03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md`<br>`question_bank.json` | rev |
| M03-014 | Min | ddx.md | `07_Evidence_and_Reading/Landmark_Library/Tier1_Primary_Source_Curriculum_Map.md`<br>`evidence_annotations.json`<br>`evidence_registry.json`<br>`topic_meta.json` | rev |
| M04-004 | Min | t_eating.md | `03_Core_Topics/Eating_Disorders/eating_disorders_inpatient_teaching.md` | rev |
| M04-013 | Min | t_neurocog.md | `03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md` | rev |
| M06-016 | Min | ect_neuromodulation.md | `topic_meta.json` | rev |
| M06-017 | Min | psychopharm_primer.md | `05_Psychopharmacology/Student_Primer_Top10/psychopharmacology_primer_inpatient.md` | rev |
| M07-008 | Min | therapy_on_the_unit.md | `topic_meta.json` | rev |
| M07-009 | Min | exp_family.md | `14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/family_discharge_student_module.md` | rev |
| M07-014 | Min | family_playbook.md | `06_Family_and_Relational/family_meeting_playbook_90min.md`<br>`question_bank.json` | rev |
| M08-019 | Min | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M08-020 | Min | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M08-021 | Min | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M12-004 | Min | evidence_inpatient.md | `07_Evidence_and_Reading/Inpatient_Evidence/evidence_inpatient.md` | rev |
| M12-005 | Min | evidence_inpatient.md | `07_Evidence_and_Reading/Inpatient_Evidence/evidence_inpatient.md` | rev |
| M12-006 | Min | evidence_inpatient.md | `07_Evidence_and_Reading/Inpatient_Evidence/evidence_inpatient.md` | rev |
| M12-010 | Min | cotw_20260720_bipolar_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-20_bipolar-mania_MS3.md` | rev |
| M13-005 | Min | book_library.md | `07_Evidence_and_Reading/Book_Summaries/ms3_book_library.md` | rev |
| M13-006 | Min | book_library.md | `07_Evidence_and_Reading/Book_Summaries/ms3_book_library.md` | rev |
| R02-005 | Min | cotw_20260914_ssnms_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-14_serotonin-syndrome-vs-nms_Resident.md` | rev |
| R02-010 | Min | cotw_20260827_bpd_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-08-27_borderline-personality-disorder_Resident.md` | rev |
| R02-011 | Min | cotw_20260827_bpd_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-08-27_borderline-personality-disorder_Resident.md` | rev |
| R04-006 | Min | cotw_20260720_bipolar_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-20_bipolar-mania_Resident.md` | rev |
| R05-004 | Min | canon_200.md | `14_Tracks/Resident/canon_200.md` | rev |
| R05-005 | Min | canon_200.md | `14_Tracks/Resident/canon_200.md` | rev |
| R05-006 | Min | canon_200.md | `14_Tracks/Resident/canon_200.md` | rev |
| R05-007 | Min | canon_200.md | `14_Tracks/Resident/canon_200.md` | rev |
| R05-008 | Min | canon_200.md | `14_Tracks/Resident/canon_200.md` | rev |
| R05-009 | Min | canon_200.md | `14_Tracks/Resident/canon_200.md` | rev |
| R05-010 | Min | canon_200.md | `14_Tracks/Resident/canon_200.md` | rev |
| R05-011 | Min | canon_200.md | `14_Tracks/Resident/canon_200.md` | rev |
| S1-014 | Min | cotw_20260923_agitation_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-23_acute-agitation-delirium_Resident.md` | pend |
| S1-015 | Min | cotw_20260923_agitation_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-23_acute-agitation-delirium_Resident.md` | pend |
| S1-016 | Min | cotw_20260923_agitation_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-23_acute-agitation-delirium_Resident.md` | pend |

### WP-10 (37)

| ID | Sev | Surface | Edit file(s) | Gov |
|---|---|---|---|---|
| M11-002 | Maj | cotw_20260726_etohwd_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-26_alcohol-withdrawal-delirium-tremens_MS3.md` | rev |
| C1-001 | Mod | rounds_naming_uncertainty_001 | `communication_cases.json` |  |
| C1-002 | Mod | trd_augmentation_choice_001 | `reasoning_cases_resident.json` |  |
| C1-003 | Mod | trd_augmentation_choice_001 | `reasoning_cases_resident.json` |  |
| C1-004 | Mod | trd_augmentation_choice_001 | `reasoning_cases_resident.json` |  |
| M01-004 | Mod | week2.md | `topic_meta.json` | rev |
| M01-009 | Mod | week2.md | `pairings.json` | rev |
| M03-001 | Mod | t_anxiety.md | `03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md`<br>`question_bank.json` | rev |
| M03-002 | Mod | t_anxiety.md | `03_Core_Topics/Anxiety/anxiety_trauma_ocd_inpatient_teaching.md` | rev |
| M03-003 | Mod | ddx.md | `02_Clinical_Skills/Differential_Diagnosis/inpatient_differential_scaffolds.md` | rev |
| M03-005 | Mod | medical_workup.md | `03_Core_Topics/Medical_Workup/medical_workup_inpatient_teaching.md` | rev |
| M03-008 | Mod | t_personality.md | `topic_meta.json` | rev |
| M04-003 | Mod | t_eating.md | `03_Core_Topics/Eating_Disorders/eating_disorders_inpatient_teaching.md` | rev |
| M04-006 | Mod | t_perinatal.md | `03_Core_Topics/Perinatal/perinatal_psychiatry_inpatient_teaching.md` | rev |
| M04-007 | Mod | t_geri.md | `topic_meta.json` | rev |
| M06-002 | Mod | med_monitoring.md | `05_Psychopharmacology/Monitoring_and_Labs/medication_monitoring_inpatient_teaching.md` | rev |
| M06-003 | Mod | med_monitoring.md | `topic_meta.json` | rev |
| M07-003 | Mod | brief_psychotherapy.md | `topic_meta.json` | rev |
| M07-007 | Mod | therapy_on_the_unit.md | `topic_meta.json` | rev |
| M08-003 | Mod | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M08-004 | Mod | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M08-006 | Mod | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M08-007 | Mod | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M08-009 | Mod | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M08-010 | Mod | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M09-008 | Mod | shelf.md | `14_Tracks/MS3/Student_Ready_Pack/07_shelf_guide/shelf_review_guide.md` | rev |
| M10-006 | Mod | cotw_20260907_fep_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-07_first-episode-psychosis_MS3.md` | rev |
| M11-004 | Mod | cotw_20260720_mdd_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-20_mdd-treatment-selection-augmentation_MS3.md` | rev |
| M12-002 | Mod | evidence_inpatient.md | `07_Evidence_and_Reading/Inpatient_Evidence/evidence_inpatient.md` | rev |
| M13-004 | Mod | book_library.md | `07_Evidence_and_Reading/Book_Summaries/ms3_book_library.md` | rev |
| R01-010 | Mod | adv_psychopharm.md | `14_Tracks/Resident/adv_psychopharmacology.md` | rev |
| R01-012 | Mod | cl_reference.md | `14_Tracks/Resident/cl_reference.md` | rev |
| R01-014 | Mod | rp-brief-psych.html | `_prototypes/brief-psych/rp-brief-psych.pack.json` | rev |
| R03-001 | Mod | cotw_20260810_panic_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-08-10_anxiety-panic-disorder_Resident.md` | rev |
| R04-004 | Mod | cotw_20260720_mdd_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-20_mdd-treatment-selection-augmentation_Resident.md` | rev |
| R05-002 | Mod | canon_200.md | `14_Tracks/Resident/canon_200.md` | rev |
| R05-003 | Mod | canon_200.md | `14_Tracks/Resident/canon_200.md` | rev |

### WP-11 (54)

| ID | Sev | Surface | Edit file(s) | Gov |
|---|---|---|---|---|
| C1-007 | Min | catatonia_vs_refusal_001 | `reasoning_cases_resident.json` |  |
| C1-008 | Min | interview_motive_suspicion_001 | `communication_cases.json` |  |
| C1-009 | Min | caregiver_baseline_adaptations_001 | `family_systems_scenarios.json` |  |
| M01-008 | Min | orientation.md | `14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md` | rev |
| M03-011 | Min | t_mood.md | `03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md` | rev |
| M03-012 | Min | t_sud.md | `03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md` | rev |
| M04-008 | Min | t_neurodev.md | `03_Core_Topics/Neurodevelopmental/neurodevelopmental_disorders_inpatient_teaching.md` | rev |
| M04-009 | Min | t_neurodev.md | `03_Core_Topics/Neurodevelopmental/neurodevelopmental_disorders_inpatient_teaching.md` | rev |
| M04-011 | Min | t_neurocog.md | `03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md` | rev |
| M04-012 | Min | t_neurocog.md | `03_Core_Topics/Neurocognitive/neurocognitive_disorders_inpatient_teaching.md` | rev |
| M04-015 | Min | t_somatic.md | `03_Core_Topics/Somatic/somatic_symptom_disorders_inpatient_teaching.md` | rev |
| M05-010 | Min | cultural_psychiatry.md | `question_bank.json`<br>`topic_meta.json` | rev |
| M05-011 | Min | cultural_psychiatry.md | `03_Core_Topics/Cultural_Psychiatry/cultural_psychiatry_inpatient_teaching.md` | rev |
| M06-012 | Min | psychopharm_primer.md | `question_bank.json`<br>`topic_meta.json` | rev |
| M06-013 | Min | protocol_library.md | `topic_meta.json` | rev |
| M06-014 | Min | ect_neuromodulation.md | `05_Psychopharmacology/ECT_Neuromodulation/ect_neuromodulation_inpatient_teaching.md` | rev |
| M06-015 | Min | ect_neuromodulation.md | `05_Psychopharmacology/ECT_Neuromodulation/ect_neuromodulation_inpatient_teaching.md`<br>`question_bank.json` | rev |
| M06-018 | Min | psychopharm_primer.md | `05_Psychopharmacology/Student_Primer_Top10/psychopharmacology_primer_inpatient.md` | rev |
| M06-019 | Min | psychotherapy.md | `02_Clinical_Skills/Psychotherapy/psychotherapy_inpatient_teaching.md` | rev |
| M07-004 | Min | brief_psychotherapy.md | `02_Clinical_Skills/Brief_Psychotherapy/brief_psychotherapy_inpatient.md`<br>`question_bank.json` | rev |
| M07-010 | Min | exp_family.md | `14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/family_discharge_student_module.md` | rev |
| M07-012 | Min | family_modalities.md | `06_Family_and_Relational/family_therapy_modalities_inpatient.md` | rev |
| M07-015 | Min | collateral_workflow.md | `06_Family_and_Relational/collateral_micro_workflow.md` | rev |
| M07-016 | Min | family_playbook.md | `06_Family_and_Relational/family_meeting_playbook_90min.md` | rev |
| M08-011 | Min | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M08-012 | Min | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M08-013 | Min | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M08-014 | Min | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M08-015 | Min | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M08-017 | Min | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M08-022 | Min | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M08-023 | Min | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M08-024 | Min | rounds_questions.md | `07_Evidence_and_Reading/Rounds_Questions/rounds_questions.md` | rev |
| M09-009 | Min | shelf.md | `14_Tracks/MS3/Student_Ready_Pack/07_shelf_guide/shelf_review_guide.md` | rev |
| M10-004 | Min | cotw_20260914_ssnms_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-14_serotonin-syndrome-vs-nms_MS3.md` | rev |
| M10-005 | Min | cotw_20260914_ssnms_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-14_serotonin-syndrome-vs-nms_MS3.md` | rev |
| M10-007 | Min | cotw_20260831_catatonia_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-08-31_catatonia-recognition-workup-treatment_MS3.md` | rev |
| M10-008 | Min | cotw_20260831_catatonia_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-08-31_catatonia-recognition-workup-treatment_MS3.md` | rev |
| M11-007 | Min | cotw_20260720_mdd_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-20_mdd-treatment-selection-augmentation_MS3.md` | rev |
| M12-007 | Min | evidence_inpatient.md | `07_Evidence_and_Reading/Inpatient_Evidence/evidence_inpatient.md` | rev |
| M12-008 | Min | evidence_inpatient.md | `07_Evidence_and_Reading/Inpatient_Evidence/evidence_inpatient.md` | rev |
| M12-009 | Min | evidence_inpatient.md | `07_Evidence_and_Reading/Inpatient_Evidence/evidence_inpatient.md` | rev |
| M12-011 | Min | cotw_20260713_agitation_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-13_acute-agitation-delirium_MS3.md` | rev |
| M12-012 | Min | cotw_20260713_agitation_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-13_acute-agitation-delirium_MS3.md` | rev |
| R01-007 | Min | rp-agitation.html | `_prototypes/agitation-trainer/agitation.pack.json`<br>`_prototypes/agitation-trainer/rp-agitation.pack.json` | rev |
| R01-008 | Min | rp-agitation.html | `_prototypes/agitation-trainer/rp-agitation.html` | rev |
| R01-011 | Min | adv_psychopharm.md | `14_Tracks/Resident/adv_psychopharmacology.md` | rev |
| R01-015 | Min | rp-brief-psych.html | `_prototypes/brief-psych/rp-brief-psych.pack.json` | rev |
| R02-007 | Min | cotw_20260907_fep_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-07_first-episode-psychosis_Resident.md` | rev |
| R03-003 | Min | cotw_20260803_lithium_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-08-03_lithium-monitoring-toxicity-interactions_Resident.md` | rev |
| R04-007 | Min | cotw_20260713_agitation_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-13_acute-agitation-delirium_Resident.md` | rev |
| R04-009 | Min | cotw_20260726_etohwd_res.md | `08_Cases_and_Simulation/case-of-the-week/2026-07-26_alcohol-withdrawal-delirium-tremens_Resident.md` | rev |
| RD-002 | Min | cotw_index.md | `08_Cases_and_Simulation/case-of-the-week/index_resident.md` | rev |
| S1-004 | Min | cotw_20260923_agitation_ms3.md | `08_Cases_and_Simulation/case-of-the-week/2026-09-23_acute-agitation-delirium_MS3.md` | pend |
