# Topic hubs — "Everything on this topic" (design + decision record)

**Date:** 2026-10-17 · **Status:** built on `claude/topic-hubs-2026-10-17`, awaiting the faculty decision in §4 · **Author:** Claude (Cowork), for Joshua Moss, MD
**Origin:** O1 of `claude/org-and-features-review-2026-10-17.md` (project doc). Review target: `origin/main` @ `0ff84cb4` (#1073).

## 1. The problem, measured

One clinical problem is reachable from several surfaces that do not list each other.

| Problem | Surfaces on 2026-10-17 | Which one lists the others |
|---|---|---|
| Suicide risk | `pg_suicide.md` (card) · `suicide.md` (guide) · `cssrs.html` (official-form reference) · COTW Jul 23 · COTW Oct 12 · Safety-kit row · `safety` question category | none |
| Mood | `t_mood.md` · `psychopharm_primer.md` · `med_monitoring.md` · `ect_neuromodulation.md` · `exp_tx.md` · five COTW editions (MDD ×2, mania ×2, lithium) · 17 question-bank items | none |
| Agitation | `agitation.md` · `delirium.md` · `violence.md` · `protocol_library.md` · `rp-agitation.html` (resident) · COTW Jul 13 · COTW Sep 23 · 5 question-bank items | none |

The topic page's practice panel ("On the Unit Practice and Tools") already reconciles **tools and drills** from `tool_registry.relatedPages`, `topic_meta.relatedTools`, `cta` and `communicationCases`. What no surface reconciles is the rest: readings at other depths, Case-of-the-Week editions, reasoning cases, family scenarios, and the question bank.

## 2. What was built

`13_Faculty_Resources/_automation/site_build/topic_hub_block.py` + `topic_hubs.json`, wired into both build scripts; `tests/topic-hub-block.test.mjs`.

- A **collapsed `<details>` block** ("Everything on this topic — *Mood disorders*") on each hub page, placed immediately before the page's hand-written **Pair with** paragraph (34 teaching pages have one) or at the end.
- Contents, in fixed order: **Read** (registry siblings, with a depth label: pocket card · related guide · short module · official form & training · tool · deeper reference · numbers & thresholds) → **Case of the Week** (newest first; older ones labelled *earlier edition*) → **Reason it through** (`reasoning_cases.json` / `_resident.json` by `linkedPages`) → **Family & collateral** (`family_systems_scenarios.json`) → **What do you say next?** (`communication_cases.json`) → **Practice questions** (count of attested items whose `pages` cite the hub, with vocabulary labels).
- **No duplication of the practice panel:** a sibling tool the panel already offers, or a drill/scenario the page's `topic_meta` already deep-links, is dropped at render time.
- **No source edit, no attestation drift:** the block is injected into `_build/<site>/content/` only. `attestation_hash.py` hashes the source file and the `topic_meta` record; neither changes. (The earlier plan to add `canonicalFor` to `topic_meta.json` was dropped for exactly this reason — it would have voided every touched page's signature.)
- **Per-site rendering:** the MS3 pass injects; the resident sweep *replaces* the inherited MS3 block (COTW twins are `_ms3.md` vs `_res.md`; `rp-agitation.html`, `adv_psychopharm.md`, `systems_medlegal.md`, `cl_reference.md` are resident-only).
- **Fails closed:** a hub or sibling that does not ship, an unknown role, or a `cotwTopic` no shipped case carries stops the build naming the entry. Both build scripts abort if any hub the registry names for that site did not receive its block.
- Copy is audience-neutral (same rule as the Front Door); the test scans it.

Registration data, not governance: `topic_hubs.json` sits beside `site_manifest.json` / `cotw_registry.json` and is validated at build time like them. A `topic_hubs.schema.json` is a sensible follow-up and is its own governance PR (any `*.schema.json` ships alone).

## 3. Acceptance checks (all machine-run)

| Check | Where |
|---|---|
| Registry resolves; dangling sibling / unknown role / unknown cotwTopic each fail | `topic_hub_block.py --self-test` (11 tests), driven by `tests/topic-hub-block.test.mjs` |
| Every rendered link resolves **on the site it renders for**; COTW twins carry the right audience suffix; newest first | `tests/topic-hub-block.test.mjs` |
| A hub never links itself; render is byte-deterministic | self-test |
| A sibling already on the practice panel is dropped | self-test |
| Placement: before **Pair with** when present, else appended; an existing block is replaced in place (idempotent) | self-test |
| Copy audience-neutral | self-test + node test |
| Both builds inject; resident sweep ordered after the MS3-twin removal and before the strip passes | node test (string pins) |
| Every `?page=`/`?tool=` in shipped content resolves | existing `check-static-site.mjs` (runs in the build) |
| `shipped_pages.json` unchanged (no new producer) | existing `--check` |

## 4. Faculty decision needed (the human gate)

**The hub table.** Each row is a curricular judgement; edit `topic_hubs.json` to change it (no code change).

| Hub page | Topic label | Siblings (role) | COTW topics |
|---|---|---|---|
| `suicide.md` | Suicide risk & safety planning | pg_suicide (card) · cssrs (reference) · ethics_legal (guide) | safety, suiciderisk |
| `violence.md` | Violence risk | agitation (guide) · ethics_legal (guide) · systems_medlegal (deeper, resident) | — |
| `agitation.md` | Agitation & restraint | delirium · violence · protocol_library (guides) · rp-agitation (tool, resident) | agitation |
| `delirium.md` | Delirium | exp_consult (module) · medical_workup · t_neurocog (guides) · cl_reference (numbers, resident) | agitation |
| `catatonia.md` | Catatonia | bfcrs (reference) · exp_consult (module) · ect_neuromodulation (guide) · cl_reference (numbers) | catatonia |
| `toxidromes.md` | Hyperthermia & toxidromes | med_monitoring (guide) · interaction-cards (tool) · cl_reference (numbers) | ssnms |
| `t_sud.md` | Substance use & withdrawal | withdrawal (reference) · exp_consult (module) · motivational_interviewing · protocol_library (guides) | etohwd, oud |
| `t_mood.md` | Mood disorders | psychopharm_primer · med_monitoring · ect_neuromodulation (guides) · exp_tx (module) | mdd, mddaug, bipolar, mania, lithium |
| `t_psychosis.md` | Psychotic disorders | psychopharm_primer · med_monitoring · nutrition_metabolic (guides) · exp_tx (module) | fep |
| `t_personality.md` | Personality disorders | brief_psychotherapy · psychotherapy · therapy_on_the_unit (guides) | bpd |
| `t_anxiety.md` | Anxiety, trauma & OCD | psychotherapy · brief_psychotherapy · medical_workup (guides) | panic |
| `t_neurocog.md` | Neurocognitive disorders | delirium · t_geri · medical_workup (guides) | — |
| `psychopharm_primer.md` | Psychopharmacology | med_monitoring (guide) · pharmacy (tool) · ect_neuromodulation (guide) · exp_tx (module) · adv_psychopharm (deeper, resident) | lithium, mdd, mddaug, ssnms |
| `ethics_legal.md` | Ethics, law & capacity | capacity (tool) · exp_consult (module) · systems_medlegal (deeper) · cl_reference (numbers) | — |
| `psychotherapy.md` | Psychotherapies | brief_psychotherapy · therapy_on_the_unit · motivational_interviewing · family_modalities · therapy_reading_room (guides) | bpd |

Questions for Dr. Moss, in order of consequence:
1. **Is the block's placement right** — before *Pair with*, collapsed? (The alternative, a strip in the header card, is a shell change with visual-baseline cost.)
2. **Any hub to add or drop?** Candidates not included: `t_eating.md`, `t_perinatal.md`, `t_geri.md` (no siblings; would list only question counts) and a Family hub on `family_playbook.md` (the nav section already groups those five pages).
3. **Back-pointers from cards to guides** (e.g. a one-line "Full guide →" on `pg_suicide.md`) — deliberately not built; it would touch eight more pages' rendering.

## 5. Search — what was measured, and the one-line follow-up

The learner's header search is the Front Door search (`fd_search.js`), not the legacy `search-index.json` scorer (that one now serves only the Capture matcher). Measured live on the MS3 site on 2026-10-17: `delirium` → Delirium (protocol row) ✓ · `catatonia` → protocol row then Catatonia ✓ · `suicide` → Suicide Risk & Safety Card ✓ · **`psychotherapy` → Brief Psychotherapy on the Unit first; "Psychotherapies at a Glance" third** — the title word *Psychotherapies* does not contain *psychotherapy*, so the page earns only a summary match.

Fix is one data line, but it is a recorded faculty statement (`fd_search.js`: "An alias is a recorded faculty statement that a phrasing means a resource"), so it is **proposed, not applied**: in `curriculum.json` → `searchAliases`, add `"psychotherapy.md": ["psychotherapy", "psychotherapies"]`. The legacy scorer's open defects (`delirium` → `exp_consult.md`, `child adolescent` → `t_sexual.md`) affect only the Capture matcher and are left as recorded.

## 6. What this PR knowingly does not do

- No schema for `topic_hubs.json` (governance PR to follow if wanted).
- No change to `curriculum.json`, `topic_meta.json`, any source page, any attestation.
- The visual baseline `front-door-reader-*.png` (`?page=t_mood.md`) will diff by the collapsed block above *Pair with*; refresh via the "Refresh visual baselines" workflow on Ubuntu after review.
- Not re-measured on a phone.
