# HANDOFF — Therapy Curriculum → Live Site Integration

**To:** Claude Code, working in `/Users/jm/Psychiatry-Clerkship-Library`
**From:** Cowork session with Joshua Moss, MD · 2026-08-20
**Mission:** take the verified therapy curriculum package from `docs/superpowers/plans/` to the live MS3 and resident sites, through every gate this repo enforces, without shipping anything unattested or unverified.

---

## 0 · Read these first, in this order

1. `CLAUDE.md` (repo root) — build commands, registration rules, conventions. Non-negotiable.
2. `docs/superpowers/plans/THERAPY_CURRICULUM_PLAN_2026-08-20.md` — the architecture (two layers, six-week arc, wiring map).
3. `docs/superpowers/plans/THERAPY_LIBRARY_KEEPS_VERIFICATION_2026-08-20.md` — what was verified and how.
4. `docs/superpowers/plans/PLAN_Taplinger_Feedback_and_Therapy_Library_2026-08-20.md` — Part B is the governing design (B0 governance, B4 schema, B5 sequencing).

**Standing amendments from the active remediation (apply to all work below):** A1 — locate code by grepping the string, never by line number; A5 — confirm a premise reproduces before writing the fix; A6 — any data-model change needs a *render* assertion, not just a data assertion; A7 — assume ~40% of any written premise is stale; verify against the working tree.

## 1 · Inventory (what exists, where)

| File (all in `docs/superpowers/plans/`) | Role | State |
|---|---|---|
| `DRAFT_PAGE_Therapy_On_The_Unit_2026-08-20.md` | Flagship MS3 teaching module + resident extensions | Content complete; **all citations identity+retraction verified**; pending: canonical OA/errata/format pass (WP-T1), attestation, registration |
| `DRAFT_PAGE_Therapy_Reading_Room_2026-08-20.md` | Student-facing evidence page (12 domains, 6 ★ picks) | Same state; D10 deliberately marked "under construction with CL colleagues" — keep that line |
| `therapy_library.staging.json` | 59-entry staging registry (Taplinger B4 schema): 47 reading-list entries + 12 `practice-inpatient` module-support entries | Valid JSON, integrity-checked (unique ids/PMIDs); `linkType` provisional pending Unpaywall |
| `THERAPY_LIBRARY_TRIAGE_ANNOTATED_2026-08-20.md` | Full triage with leans | Reference — Josh may still adjust keeps; treat Reading Room content as current |
| `THERAPY_LIBRARY_KEEPS_VERIFICATION_2026-08-20.md` | Verification evidence + provisional AMA citations | Reference |

**Verification status:** every PMID in the two pages and the staging JSON passed identity + retraction verification 2026-08-20 (Europe PMC; retracted-control test fired correctly). The single exception: `stanley-brown-2012` (DOI `10.1016/j.cbpra.2011.01.001`) — not Europe PMC-indexed, needs `verifyCitation`.

## 2 · Tooling note — Scholar_Sidekick

The Scholar Sidekick desktop extension was repaired on 2026-08-20: the lapsed `RAPIDAPI_KEY`/`RAPIDAPI_HOST` env mappings were **removed from its manifest** (`~/Library/Application Support/Claude/Claude Extensions/ant.dir.gh.mlava.scholar-sidekick-mcp/manifest.json`; backup at `manifest.json.bak-20260820`), so it now runs on the anonymous free tier against scholar-sidekick.com. **The fix takes effect after the Claude desktop app restarts (or the extension is toggled off/on).** WP-T0 verifies this. If a future extension update restores the manifest, reapply the same edit — or set a free `SCHOLAR_API_KEY` (ssk_) in the extension settings, which Josh must do himself.

## 3 · Work packages (execute in order)

### WP-T0 · Preflight (10 min)
- Confirm Scholar_Sidekick works: `resolveIdentifier("29998307")` should return Stanley 2018 metadata, not a RapidAPI error. If it still errors, stop and tell Josh to restart the app/toggle the extension — do not route around it with ad-hoc fetchers.
- `git status` clean; branch off `main` (e.g. `feat/therapy-curriculum-wp36`).
- Confirm the four §0 docs are present and current (A7: check nothing has superseded them). Also read `FEEDBACK_IMPACT_Taplinger_Verbatim_2026-08-20.md` — it amends this handoff.
- **Companion PR check (WP-37):** confirm whether the question-bank default has been flipped to attested-only (drafts opt-in). If not, open WP-37 as its **own small AGENT PR first** — an external TUSM course page is preparing to link to the site, which makes serving unattested drafts by default an external-facing problem, not an internal debt. Do not fold WP-37 into the therapy PR.

### WP-T1 · Canonical citation pass (the remaining pipeline stages) — AGENT
Everything already has identity+retraction verified; this pass completes the canon:

1. **`checkOpenAccess`** on every entry in `therapy_library.staging.json` with `"linkType": "proxy"` (the JSON is the source of truth — do not re-derive the list). For each: if Unpaywall reports a legal open copy (green/gold/hybrid), update `oaStatus` + `linkType: "open"` and note `bestLocation.url`. Loop single calls; the tool rejects batches.
2. **`checkRetraction`** on **all 59** entries (Crossref/Retraction Watch catches errata and expressions of concern that MEDLINE pubType misses). Any `isRetracted: true` → remove the entry and flag Josh immediately. Any `hasCorrections`/`hasConcern` → keep, but record the notice in the entry's `note` and flag in the PR.
3. **`formatCitation`** (style: `ama`, batch by comma-separated PMIDs — batching IS supported here) for all 59 → replace every `citation` field and every reference in both draft pages. This also settles the de Figueiredo/"de Figueirido" spelling (trust the formatter's resolved record).
4. **`verifyCitation`** for Stanley & Brown 2012: `{title: "Safety planning intervention: a brief intervention to mitigate suicide risk", doi: "10.1016/j.cbpra.2011.01.001", author: "Stanley", year: 2012}`. Verdict `matched` → set its `verification` field accordingly; anything else → flag Josh.
5. Rate discipline (B3): human-paced; if the free tier throttles, back off — never hammer.

**Acceptance:** zero entries with `verification` containing "pending"; zero unexplained retraction notices; both pages' reference sections regenerated from formatCitation output.

### WP-T2 · Promote staging → `evidence_registry.json` — AGENT
- Map each staging entry to the registry's **schema v2** (read the paired `*.schema.json` first — do not guess field names; A7 applies).
- Promote in curated batches (reading-list domains first; `practice-inpatient` second).
- Gate: `python3 13_Faculty_Resources/_automation/validate_registry_schemas.py` and its test must pass after every batch.
- Keep `therapy_library.staging.json` in `docs/superpowers/plans/` as the provenance record; the registry is the shipped artifact.

### WP-T3 · Pages into the source tree — AGENT (content), AUTHOR-GATED (release)
- Convert both drafts to house-style markdown. Match an existing page in the target dir for front-matter/format conventions (A1: read a neighbor, don't assume).
- Recommended homes (flag in PR if you deviate): module → `02_Clinical_Skills/therapy_on_the_unit.md`; reading page → `07_Evidence_and_Reading/therapy_reading_room.md`.
- **Strip the draft banners** but KEEP an attestation marker consistent with site convention ("AI-drafted, pending faculty review" chip) — these pages must surface as pending until Josh attests, consistent with the WP-37 attested-by-default direction.
- Audience: both pages ship to **both** builds (`ms3` and `res`); the module's "Resident extension" blocks may use the existing ms3/res build split if the repo's split mechanism supports block-level gating — check how the MMC/FRST paragraph split (OPEN-DECISION-12) was implemented and mirror it; if block-level gating isn't cleanly available, ship identical content to both.
- **Register or the build fails:** add both pages to `site_manifest.json` AND nav in `build_deploy.py`. The orphaned-source check hard-fails otherwise. Never leave an unregistered .md in `NN_Category/`.
- No publisher figures, no reproduced tables from the OpenEvidence docx files, no PDFs (B0 governance). The content as drafted already complies — keep it that way.

### WP-T4 · Wire the go-deeper rails (`topic_meta.evidenceIds`) — AGENT
- Apply the wiring map in `THERAPY_CURRICULUM_PLAN` §4 (8 existing pages).
- Use registry ids (post-WP-T2), not raw PMIDs, per schema.
- Gates: `validate_topic_meta.py` passes, AND (A6) a **render** assertion — build the site and confirm at least one wired page actually displays its rail; a passing data validator alone is insufficient.
- This closes review finding **F19** — say so in the PR description.

### WP-T5 · Build + full local battery — AGENT
```bash
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
node --test tests/*.test.mjs
```
All must pass. **CI is currently dead (GitHub Actions billing) — the local battery IS the gate.** Do not promote any warn to a hard gate while CI is down.

### WP-T6 · PR + stop line — AGENT opens, JOSH decides
- One PR: registry batches + pages + wiring + manifest/nav. Include: full battery output, deploy-preview links for both sites, the WP-T1 verification summary, and the four flagged decisions (module home; block-level vs identical res/ms3 content; Reading Room launch scope; **approval to start the Phase 2 worksheet track** — see §3b below).
- **This PR is AUTHOR-GATED: open and stop.** New student-facing clinical content requires Josh's review and attestation — do not merge, even with green checks. (Merge authority rule: agent may self-merge only pure-AGENT mechanical PRs after posting verify output; this is not one.)

### §3b · Phase 2 — the worksheet track (do NOT build in this PR)
Kaitlin Taplinger's verbatim request was "more info, **examples, worksheets**, etc." — worksheets are the named remaining gap, deliberately deferred to a follow-on PR so the current one stays reviewable. Scope when approved (details in `FEEDBACK_IMPACT_Taplinger_Verbatim_2026-08-20.md` §2): four **original, license-clean** worksheets (BA activity scheduling · distress-tolerance pocket card · family-meeting prep · first-week-out discharge bridge), each registered via the WP-38 `instrument_provenance.json` extension, none reproducing Linehan/Guilford, Beck Institute, or Stanley–Brown material, all patient/family-facing text at ~8th-grade reading level, all faculty-attested before release. Mention this section in the PR description; do not start it without Josh's explicit go.

### WP-T7 · Optional follow-on (separate PR, only if Josh approves in WP-T6)
- Add the module's 5 self-check questions to `question_bank.json` as a "therapy" topic block, `status: draft-unattested`, conforming to `QUESTION_BANK_STANDARD.md` and the schema. They must land behind the attested-only default (WP-37). Item-id namespace: follow existing conventions exactly — id collisions silently corrupt `cw_qbank_attest_v1` and SRS state.

## 4 · Landmines (each has bitten before)

1. **Unregistered source page** → orphaned-source hard fail. Register in BOTH `site_manifest.json` and nav.
2. **`/Users/...` paths in tracked .py** → CI lint (and the local battery) fails. Derive from `__file__`.
3. **LFS pointer stubs** — you shouldn't touch media, so if `git status` shows audio/video "modified", do NOT commit those files.
4. **`CLAUDE.md`/`AGENTS.md` byte-parity** — if you edit `CLAUDE.md` for any reason, `cp CLAUDE.md AGENTS.md` or CI (when alive) fails the PR.
5. **Do not touch** `sp-proxy` `pack.status` / `POST_PACK_STATUSES` — the 403 is the only thing keeping learners away from the invalid SP assessment layer.
6. **Line numbers lie** (A1/A7): the review's anchors are approximate; grep for strings.
7. **Registry ≠ decoration**: every promoted entry must be referenced by a page or a `topic_meta.evidenceIds` rail. Do not promote entries nothing links to — that recreates the F19 defect this work closes.
8. **No dose literals** in any `rp-*`/`*-trainer` tool — not applicable to these md pages, but applies if WP-T7 touches interactive surfaces.

## 5 · Acceptance criteria (the PR description checks every box)

- [ ] Scholar_Sidekick canonical pass complete: 0 pending verifications, 0 unflagged notices, all citations formatCitation-regenerated
- [ ] `evidence_registry.json` validates; every new entry is referenced by a page or rail
- [ ] Both pages registered, built, and rendering in both deploy previews with attestation-pending markers
- [ ] `topic_meta.evidenceIds` wired for the 8 mapped pages; rails render (screenshot in PR)
- [ ] Full local battery green (output pasted)
- [ ] No publisher-owned figures/PDFs/abstracts anywhere in the diff
- [ ] PR opened, flagged decisions listed, **not merged**

## 6 · Context for judgment calls

The point of this build is Kaitlin Taplinger's request #5 ("could the therapy section be built up some?") executed to the same governance standard as the instrument remediation: verified citations, attested prose, honest evidence framing. When in doubt between shipping more and shipping cleaner, ship cleaner — the credibility of this library with an outside clerkship director is worth more than any single page. The D10/CL domain stays visibly under construction; that line is a collaboration signal to her, not a gap to fill.

*Prepared by the Cowork session of 2026-08-20. Session memory: `project_therapy_library_triage.md` in project memory carries the full state if anything here is unclear.*
