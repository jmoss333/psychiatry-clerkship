# Hugging Face as private infrastructure for the Psychiatry Clerkship Library

**Status:** proposal, awaiting author decision on WS-0 · **Date:** 2026-09-15 · **Owner:** Joshua Moss, MD
**Posture (decided 2026-09-15):** *private infrastructure only.* Nothing is published under the account; no licence decision is required; nothing on Hugging Face is learner-facing.

---

## 0. The thesis in one paragraph

Hugging Face (HF) is worth adopting here for exactly three things the repo cannot do well today: **(1) hosting the ~450 MB of audio outside GitHub LFS's metered bandwidth**, which caused the 2026-08-30 deploy freeze; **(2) holding evaluation run artefacts — synthetic transcripts, model bake-off outputs, embedding caches — that should never bloat the git history** yet must be versioned and queryable; and **(3) giving the Interview Room a second, cheaper provider leg for speech and, later, for the actor model**, so the AI line of the operating run-rate stops depending on two vendors' pricing. Everything else HF sells (public publishing, model training, GPU Spaces, community features) is either forbidden by the private posture, unjustified by cohorts of 4–10 learners, or already done better by what the repo has. The free tier (100 GB private storage, $0/month) covers WS-1 through WS-3 with an order of magnitude of headroom; PRO ($9/month) is a *later* decision tied to a measured inference-credit need, not a prerequisite.

---

## 1. Ground truth this plan rests on (measured 2026-09-15)

| Fact | Value | Where verified |
|---|---|---|
| Existing HF usage in tracked code | **none** (`git grep -i huggingface` on tracked files, worktrees excluded → 0 hits) | repo |
| Media in LFS | 106 LFS-tracked files; each uncached deploy re-cloned ~433–455 MB; `12_Media/audio_oe` alone is 163 MB / 50 files | `NETLIFY_LFS_RUNBOOK.md`, `du` |
| LFS bandwidth budget (GitHub free) | 1 GB/month — exhausted 2026-08-30, froze all three sites | runbook "Incident pattern 2" |
| Current mitigation | `site_build/lfs_pull_cached.sh` serves media from Netlify's persistent cache (~0 MB steady state) | `build_and_check.sh` |
| Unmerged escape hatch | branch `chore/audio-out-of-git` (`ee77ece`) moves audio to `~/Psychiatry-Clerkship-Audio-Archive/`, never pushed | git |
| Interview Room LLM | Anthropic Messages API (`sp.mjs:18`), actor pinned in pack `engine.modelPinned`; `validateEngineContract` refuses to run on a mismatch | `sp.mjs`, pack |
| Interview Room speech legs | `openai` and `elevenlabs` only, each with a rate card and a governance leg (`sp-speech-provider.mjs:127-135`, `sp-governance.mjs`) | sp-proxy |
| Scoring | 100 % deterministic regex (`compileIntents/matchIntents/deriveState/computeCoverage`); model never adjudicates | `sp.mjs:276-372` |
| Benchmark corpus | `benchmarks/interview-room/corpus.json` — 23 scenarios, 2 setups, 3 response pairs, **`reviewStatus: pending-faculty-review`**, all synthetic | repo |
| Conformance suite | `conformance/` — portable uniformity/conformance matrices (baseline 60/124 → 124/124 after #446) | repo |
| Corpus sizes | 192 qbank items · 107 evidence sources · 49 annotations · 75 topic_meta entries · 4 shipped-page producers | JSON counts |
| Search | hand-rolled BM25-pivot scorer, `b=0.5`, parity pinned by `tests/search-scorer-parity.test.mjs`; open defects are *aboutness* (title-bonus collisions), diagnosed as needing a canonical-page signal in `topic_meta.json`, **not** a better scorer | memory: search-index-and-coverage |
| Egress from the Cowork VM | `huggingface.co` 200 · `hf.co` 307 · **`cdn-lfs.huggingface.co` unreachable** · `router.huggingface.co` 404 (host up, path expected) | `curl` from VM |
| Egress from the cloud container | `huggingface.co` 200, `hf.co` 307, `router.huggingface.co` 404 | `curl` |
| `huggingface_hub` installed anywhere | no (VM: `ModuleNotFoundError`) | VM |
| HF free tier | 100 GB private storage; Inference Providers credits **$0.10/month** (subject to change); CPU Basic Spaces 2 vCPU/16 GB free | hf.co/docs/hub/storage-limits, /pricing, /docs/inference-providers/pricing |
| HF PRO | $9/month; 1 TB private (+$18/TB/mo overage); **$2.00/month** inference credits; 8× ZeroGPU quota | same |
| HF hard limits | ≤10 k files per folder (hard); ≤500 GB per file (hard); keep 50–100 files per commit | storage-limits |
| Cost posture | infra run-rate $65–95/mo; AI line unknown and probably largest; institutional ask is for cost-centre absorption, not grants | memory: funding-and-cost-ownership |

**Two environment consequences that shape every workstream.** First, uploads and downloads of real bytes go through `cdn-lfs.huggingface.co` (Xet/LFS), which the Cowork VM cannot reach — so *every HF transfer runs on the Mac or in a GitHub Action, never here*; the VM can author code and read metadata only. Second, the Netlify build has its own egress; whether it can reach `cdn-lfs` is **unverified** and is the first thing WS-1 must prove (§4, gate G1-a).

---

## 2. What HF is *not* for here — decided up front

| Considered | Decision | Why (one line each) |
|---|---|---|
| Publishing the benchmark / conformance corpus as a public dataset | **Out of scope** | Private posture chosen 2026-09-15; corpus is also still `pending-faculty-review` |
| Fine-tuning any model on library content | **Declined** | No training signal (4–10 learners/rotation), no consented transcript corpus, and it would create a second attested artefact nobody can review |
| Uploading learner transcripts or analytics | **Forbidden** | Transcripts live only in `localStorage` (`cw_sp_v1`); analytics store integers, never events. This is a design invariant, not a preference |
| Client-side embeddings / transformers.js in the learner SPA | **Declined for now** | 20–30 MB model download per learner, breaks the two-scorer parity contract, and the diagnosed search defects are not scorer defects |
| Public or ZeroGPU Spaces | **Declined** | Nothing learner-facing goes on HF; free CPU Spaces sleep and add a third hosting surface to keep alive |
| Replacing Anthropic as the actor today | **Deferred to WS-4, gated** | A model change re-triggers attestation + red-team Tier 3; do it only after a measured bake-off on the benchmark corpus |
| HF as the *primary* media host (delete LFS) | **Deferred** | The cached-pull path works. HF becomes the mirror first; primacy is a separate decision once G1 holds for 30 days |

---

## 3. Workstreams

Sequenced **by constraint** (what unblocks what), not by attractiveness. Each carries machine-verifiable acceptance criteria (AC) and a named human gate (G). "Report-only" tools go in `bin/`, exit 0, and are deliberately kept out of CI (the repo rule: a report that fails a push is a report nobody keeps).

### WS-0 — Foundations (½ day, blocks everything)

| Item | Spec |
|---|---|
| Namespace | Personal account for now. Note for the "when Josh leaves" objection: HF orgs are free; migrating private repos to an org later is a one-click move, so defer |
| Tokens | Two **fine-grained** tokens, never a classic write-all: `hf-clerkship-read` (read on the specific repos only — goes to Netlify env as `HF_TOKEN_READ`) and `hf-clerkship-mirror` (write on the media + eval dataset repos — GitHub Actions secret `HF_TOKEN_MIRROR`). Josh enters both himself; agents never see them |
| Local tooling | `pip install huggingface_hub` on the Mac; `hf auth login` with the mirror token. Not installed in the VM (cannot transfer bytes anyway) |
| Egress probe | Add `huggingface.co` + `cdn-lfs.huggingface.co` to `bin/probe_egress.py`'s capability map with task names in the repo's own terms: *"hf-media-mirror push cannot run here"*, *"hf-eval-artefact pull cannot run here"*. A refused CONNECT and a host 403 stay distinct, per the probe's own rule |
| Secrets hygiene | `.claude/hooks` already deny machine paths; add the literal `hf_` token prefix to the deny-list regex so a pasted token can never land in a tracked file |
| Storage budget | Expected use ≈ 0.5 GB media + <0.2 GB eval artefacts + <0.1 GB embedding caches — under 1 % of the free 100 GB. Document the number so nobody buys PRO for storage |

**AC-0:** `python3 bin/probe_egress.py --json` reports both HF hosts with a capability line; `node --test tests/hooks.test.mjs` includes a case that a file containing `hf_` followed by 30+ alphanumerics is denied; `git grep -n 'hf_[A-Za-z0-9]\{30,\}'` on tracked files returns 0.
**G0 (Josh):** approve token scopes and namespace. Nothing is created until this is answered.

### WS-1 — Media mirror: HF private dataset as the LFS escape hatch (1–2 days)

**Why first:** it is the only workstream that removes an *incident class* (the LFS budget freeze) rather than adding a capability, and it turns the never-pushed `chore/audio-out-of-git` branch from a gamble into a reversible option.

| Component | Spec |
|---|---|
| Repo | `datasets/<user>/clerkship-media` (private). Layout mirrors the source tree (`12_Media/audio_oe/…`, `07_Evidence_and_Reading/…`) so a path in `media_manifest.json` maps 1:1. Well under the 10 k-per-folder hard limit |
| Manifest | `MEDIA_MIRROR.json` at the dataset root: `{path, sha256, bytes, lfs_oid, hf_revision}` per file. This is the artefact every check reads |
| Push | GitHub Action `hf-media-mirror.yml`, `workflow_dispatch` + on push to `main` touching `*.m4a|*.mp3|*.mp4|*.wav`. Uses `secrets.HF_TOKEN_MIRROR`, `huggingface_hub.upload_folder` with `commit_message` = git SHA. **Not scheduled**, so it does not need enrolment in `validate_scheduled_workflows.py` — verify that with the validator before merging, because the contract is by inventory and digest |
| Pull | `site_build/lfs_pull_cached.sh` gains a **third** source, tried only after the Netlify cache and before GitHub LFS: `hf_hub_download` by `sha256` from `MEDIA_MIRROR.json`, using `HF_TOKEN_READ`. Order matters: cache (free) → HF (free, unmetered on private) → GitHub LFS (metered). Existing gates are untouched: `check_lfs_media.py` still refuses pointer stubs, so a failed HF pull fails the same way it fails today |
| Verification | `bin/check_media_mirror.py` (report-only): for every LFS-tracked path, compare the local object's sha256 with `MEDIA_MIRROR.json`; print `mirrored / stale / missing` counts. Registers in `bin/what_can_i_do_today.py` as task `media-mirror` measured by `stale + missing` — **retires at 0, reports `unknown` on any fetch failure, never 0** (the repo's two queue rules) |

**AC-1:**
- `python3 bin/check_media_mirror.py --strict` exits 0 with `missing=0 stale=0` for all 106 LFS paths (re-measure the count on the Mac with `git lfs ls-files | wc -l`; the VM cannot).
- A **production** deploy after "Clear cache and deploy" shows in its log `media-source: hf` for ≥1 file and `~0 MB downloaded from GitHub this build`; `check_lfs_media.py` passes; `https://une-ms3-psychiatry.netlify.app/audio/40_LM_41_Engel_1977_Biopsychosocial_1_47.m4a` still returns 3,473,535 bytes of `audio/mp4`.
- Deploy previews are unchanged (`is_soft_context()` still short-circuits; previews keep shipping stubs behind the soft gate and cost 0 HF bytes).
- `node --test tests/*.test.mjs` green; `bin/verify.sh` green.

**G1-a (blocking, before any code):** prove the Netlify build can reach `cdn-lfs.huggingface.co` — a one-line `curl -sI` in a throwaway branch's build log. If it cannot, WS-1 collapses to "HF as cold archive only" and the pull path is dropped.
**G1-b (Josh):** approve adding a second secret to both learner sites' Netlify env (functions and builds read env from the deploy snapshot — redeploy after setting it).
**Rollback:** delete the HF source block from `lfs_pull_cached.sh`; nothing else changes. The mirror is additive.

### WS-2 — Evaluation artefact store: private datasets for the Interview Room (2–3 days, blocks WS-4)

**Why second:** WS-4 (provider diversification) is only defensible with a measured bake-off, and the bake-off's *outputs* — hundreds of synthetic transcripts per candidate model — do not belong in git. The corpus and conformance matrices already live in the repo and stay canonical there; HF holds **runs**, not sources.

| Component | Spec |
|---|---|
| Repo | `datasets/<user>/clerkship-interview-room-evals` (private) |
| Sources (mirrored, read-only) | `benchmarks/interview-room/corpus.json`, `round-two.json`, `conformance/matrices/*`, the three golden transcripts, red-team probe set B1–B7 — each with `git_sha` and `pack_sha256` in its dataset-card front-matter, so a run can never be matched to the wrong pack |
| Runs (new, append-only) | Parquet, one row per `(run_id, model, provider, scenario_id, turn, text, deterministic_status, leak_guard_hit, latency_ms, cost_usd)`. Statuses use the real vocabulary `observed / partial / missed / na`, never full/none |
| Runner | `bin/eval_bakeoff.py` on the Mac: replays the corpus through a **candidate actor** while the evaluator and the deterministic scorer stay fixed (the thesis "rules decide, the model narrates" is what makes a fair swap test possible). Writes locally, then `upload_file` to the dataset. Never touches the pack, `reviewed.json`, or any learner surface — same exclusion-by-construction as the queue runner |
| Reader | The HF Dataset Viewer + SQL console give Josh per-scenario comparison across models with no code; `bin/eval_report.py` renders the same as a markdown table for a PR body |
| Bake-off metrics (all machine-scored) | (a) **gate integrity**: % of runs where a locked `reveal` n-gram appears before unlock — must be 0 for any candidate to proceed; (b) **status agreement** with the pinned model on the 23 scenarios; (c) **leak-guard hits**; (d) p50/p95 latency; (e) cost per encounter. A candidate that wins on (e) and loses on (a) is disqualified regardless |

**AC-2:**
- `bin/eval_bakeoff.py --dry-run` produces a parquet whose schema validates against `benchmarks/interview-room/run.schema.json` (new, paired per `test_validate_registry_schemas.py`'s `PAIRS` if it lives at root — prefer keeping it under `benchmarks/` to avoid tripping that tuple).
- For the **pinned** model, run-vs-run status agreement on the 23 scenarios is 100 % (determinism check — if it is not, the harness is broken, not the model).
- Dataset card front-matter `pack_sha256` equals `sha256sum _prototypes/sp-interview/sp-interview.pack.json` at the run's `git_sha`.
- `tests/eval-bakeoff.test.mjs` pins that the runner refuses to start if the pack's `facultyReview` is not `reviewed` (mirrors `sp-governance.mjs:113-124`).

**G2 (Josh):** the corpus is still `pending-faculty-review`. A bake-off may *run* on it, but no candidate may be *adopted* on its evidence until the corpus's proposed labels are adjudicated. Record that in the dataset card so the constraint travels with the data.

### WS-3 — Dev-only embedding audits (1–2 days, independent; can run in parallel with WS-2)

**Why:** the `bin/` philosophy is corpus-level checks for defects no schema sees. Embeddings are good at exactly one such class — *semantic near-duplicates and contradictions* — and bad at what search needs. Keep them where they are strong.

| Audit | What it finds | Output |
|---|---|---|
| `bin/audit_qbank_semantic.py` | Pairs of the 192 qbank items with cosine ≥ τ on stem+answer — candidate inputs for `check_qbank_coherence.py`, which today only catches pairs it is told about | ranked pair list, report-only |
| `bin/audit_claim_span_semantic.py` | For each of the 49 `evidence_annotations` claims, similarity between `claimText` and its `sourceSpan`; low-similarity rows are the ones most likely written from a title (the 2026-08-21 failure class: 54 % needed amendment, 7 said the opposite) | ranked rows, report-only — **never edits a span** |
| `bin/audit_topic_overlap.py` | Topic pages whose bodies are closer to each other than to their own `topic_meta` summary — the "aboutness" collisions behind the `delirium → exp_consult.md` search defect, surfaced as data for the canonical-page decision rather than a scorer change | pair list, report-only |

Embedding source, in order of preference: (1) local `sentence-transformers` on the Mac (free, no credits, deterministic per model version); (2) HF Inference Providers feature-extraction only if the Mac cannot run it. Cache vectors as parquet in a private dataset `clerkship-embedding-cache` keyed by `(model_id, model_revision, sha256(text))` so re-runs are free and the model version is pinned in the data.

**AC-3:** each audit exits 0 always, prints `N rows, M flagged, K uncached` (the `verify_spans.py` lesson — a silent pass when the cache path is wrong is not a clean bill, so `K uncached > 0` prints a warning line and the script exits 0 with a non-empty `uncached` list); vectors are byte-reproducible for a pinned `model_revision`; none of the three touch any registry. **Not** wired into `verify.sh` or CI.
**G3 (Josh):** calibrate τ on the first output before quoting a count — the same rule as `sweep_unlicensed_claims.py`.

### WS-4 — Provider diversification for the Interview Room (3–5 days, gated on WS-2)

Two sub-tracks with very different governance weight.

**4a — Speech leg (lower risk).** Add a third provider `hf` to `sp-speech-provider.mjs` for transcription (Whisper-family via Inference Providers) and synthesis (an open TTS such as Kokoro), behind the same `createSpeechProvider` selection. Governance already models legs as data: add rate-card rows (`provider, model, meter, price, unit, sourceUrl`) and the `adapterMappingVersion` string for the voice profile. Speech legs are *not* the attested clinical content and *not* the engine pin, so this does **not** reopen attestation — but it **is** a deploy change, so it runs the red-team change gate (Tier 1 + Tier 2 scripted; Tier 3 live, ~45 min, cannot be skipped).

**4b — Actor model leg (higher risk).** Through HF's OpenAI-compatible router an open actor can be swapped in behind the Provider interface. Preconditions, all hard: WS-2 bake-off shows gate-integrity 0 breaches and status agreement ≥ the pinned model's own run-to-run agreement; pack `engine.modelPinned` is updated (which by design re-triggers attestation); `validateEngineContract` is extended, not bypassed; leak guard unchanged. Red-team Tier 3 live again. **Decision rule:** if 4b saves less than the cost of one Tier-3 session per year, do not do it.

**AC-4:** `node --test sp-proxy/tests/*.test.mjs` includes `sp-speech-provider.test.mjs` cases for the `hf` leg (selection, rate-card presence, budget accounting); `bin/redteam-offline.mjs` 12/12; `./bin/redteam-live.sh` 5/5; a `receipts/` entry written by `record_red_team.py --state passed --signed-by "Joshua Moss, MD"` — the artefact that has been missing since 2026-08-31 and that `monthly_review.py` flags every month. Cost line in the PR body: measured $/encounter before and after.
**G4 (Josh, twice):** approve the rate-card rows and the pinned model IDs; run and sign Tier 3.

### WS-5 — Optional: PRO decision (15 minutes, after WS-3 and WS-4a have run for a month)

Buy PRO ($9/mo) **only if** measured monthly Inference-Providers spend exceeds $2 (its included credits) — i.e. if the speech leg or embedding jobs are actually being used. Storage is never the reason (1 % of free tier used). Record the decision in `decisions.json` so `check_decision_drift.py` carries it.

---

## 4. Sequencing and dependency graph

```
WS-0 foundations ──► WS-1 media mirror ──────────────────────────► (30-day soak) ► primacy decision
        │
        ├──────────► WS-2 eval artefact store ──► WS-4a speech leg ──► WS-4b actor leg (gated)
        │
        └──────────► WS-3 embedding audits (parallel, independent)
                                                                   └──► WS-5 PRO decision (data-driven)
```

| Order | Why it sits here (the constraint) |
|---|---|
| WS-0 | Tokens and egress facts gate every byte transferred |
| WS-1 | Only workstream that removes an incident class; G1-a is cheap and decisive |
| WS-2 before WS-4 | No provider swap without measured evidence; the harness must exist before the candidates |
| WS-3 parallel | Touches no shared file with WS-1/2; runs entirely on the Mac |
| WS-4a before 4b | Speech leg does not reopen attestation; actor leg does — do the reversible one first |
| WS-5 last | Spend decision needs a month of usage data or it is a guess |

**Elapsed estimate:** WS-0/1 in week 1; WS-2/3 in weeks 2–3; WS-4a week 4 (Tier 3 session is the pacing item, it needs Josh's 45 minutes); WS-4b only if the bake-off earns it.

---

## 5. Risk register

| # | Risk | Likelihood | Impact | Mitigation / early signal |
|---|---|---|---|---|
| R1 | Netlify build cannot reach `cdn-lfs.huggingface.co` | Medium (VM cannot) | WS-1 pull path dead | G1-a before any code; fallback = cold archive only |
| R2 | HF token lands in a tracked file or log | Low | Credential leak | Hook deny-list on `hf_` prefix (AC-0); Actions masks secrets; read-only token on Netlify |
| R3 | Third media source adds a silent failure mode | Medium | Stub audio ships | Existing `check_lfs_media.py` hard gate is unchanged; log line `media-source:` per file; the mirror check reports `unknown` never 0 |
| R4 | Bake-off adopted on a corpus that is still `pending-faculty-review` | Medium | Model change on unadjudicated labels | G2 written into the dataset card; runner refuses unreviewed pack |
| R5 | New workflow trips `validate_scheduled_workflows.py` / `check-verify-coverage.py` | High if scheduled | 28 maintenance tests red | Keep `hf-media-mirror.yml` unscheduled; recompute digests via the validator's own `_load/_contract_digest` if it must be enrolled |
| R6 | Speech-leg swap changes what learners hear without a Tier 3 run | Medium | Undetected character break | Change gate is mandatory; receipt written or the change does not ship |
| R7 | Embedding audit counts quoted before calibration | Medium | False defect counts in a PR body | G3; same discipline as `sweep_unlicensed_claims.py` |
| R8 | HF changes free-tier terms (credits are "subject to change") | Medium over 12 mo | Cost creep | Nothing learner-facing depends on HF at runtime; WS-1 degrades to GitHub LFS automatically |
| R9 | Work attempted from the Cowork VM stalls on `cdn-lfs` | High if forgotten | Wasted session | Probe capability lines (AC-0) say it in the repo's own words |
| R10 | Second attester / continuity | — | Single-owner account | HF org migration is a later, free step; note it in the funding brief's "when Josh leaves" answer |

---

## 6. Human review gates (summary)

| Gate | Decision | Who | Before |
|---|---|---|---|
| G0 | Token scopes, namespace | Josh | any HF repo exists |
| G1-a | Netlify ↔ `cdn-lfs` reachability proven | build log | WS-1 code |
| G1-b | Second secret on both learner sites | Josh (Netlify UI) | WS-1 merge |
| G2 | Corpus adjudication before any model adoption | Josh (faculty) | WS-4b |
| G3 | τ calibration before counts are quoted | Josh | any audit number in a PR |
| G4 | Rate cards, model IDs, Tier 3 signature | Josh | WS-4 deploy |
| G5 | PRO purchase | Josh | WS-5 (Claude never executes purchases) |

---

## 7. What "done" looks like in 30 days

- A production deploy of both learner sites that logs `media-source: hf` and `~0 MB from GitHub`, with the audio byte-count check still green.
- One private evals dataset holding the pinned model's baseline run, with a dataset card that names the pack hash and the `pending-faculty-review` constraint.
- Three report-only audits in `bin/`, each registered in `what_can_i_do_today.py` with a count that can actually move.
- A red-team receipt in `receipts/` — whether or not the speech leg ships, the receipt gap closes as a side-effect of WS-4a's change gate.
- Operating run-rate unchanged: $0 added.

---

## 8. Next best step and next idea

**Next best step (today, 20 minutes, Josh's hands):** answer G0 — create the two fine-grained tokens — then push a one-line throwaway branch that runs `curl -sI https://cdn-lfs.huggingface.co` in the Netlify build so G1-a is answered from the log. Everything downstream is sequenced on those two facts, and both are things only the account owner can produce.

**Innovative next idea:** turn WS-2 into a *continuous* contract rather than a one-off bake-off. Every time `engine.modelPinned` changes, the PR that changes it must attach a run row-set whose `pack_sha256` matches — the same shape as the shipped-pages derivation that ADR-002 established: a model pin without matching run evidence fails a `bin/check_model_pin_evidence.py` gate, exactly the way a stale `shipped_pages.json` fails `--check`. That makes "rules decide, the model narrates" a *verified* property of every release, which is a stronger sentence for the JMIR Viewpoint than anything a one-time bake-off can say.
