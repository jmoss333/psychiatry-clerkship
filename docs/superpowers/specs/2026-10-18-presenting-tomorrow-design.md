# Presenting tomorrow (F4): syndrome × hospital day, the night before rounds

**Date:** 2026-10-18 · **Status:** built on `claude/presenting-tomorrow-2026-10-18` · **Author:** Claude (Cowork), for Joshua Moss, MD
**Origin:** F4 of `claude/org-and-features-review-2026-10-17.md` (project doc). Depends on the topic hubs (#1080) and C2's `cotwForTopic` join (#1091).

## 1. The clinical job, and what already existed

"I'm presenting a new admission with first-episode psychosis tomorrow" / "my mania patient is day 4." The learner needs, tonight: what to ask, what to examine, what to rule out, how the team wants it presented, the words for the patient, the collateral plan — and the one case, the one conversation drill, the one family scenario that match.

Measured on `origin/main` before building: **13 of 15 hub topics already carry a complete, attested `clinicalWorkflow` block** (ask · mse · safety · say · collateral · rounds · exam · actions), 11 carry `firstMove` + `ruleOut`, 10 name a communication case, 10 a family scenario, all carry EPA codes, and 11 have Case-of-the-Week editions. The topic page already renders all of it as one "On the unit" card — unphased, and only once the learner has found the page. The gap was never content; it was a *phase lens* and an *entry from Today*.

(`toxidromes.md` gains its block in #1095 and will join automatically; `psychotherapy.md` has none and is not a bedside syndrome.)

## 2. What was built

| Piece | Change |
|---|---|
| `site_build/presenting_tomorrow.json` | Routing data, not content: three phases (*Admission*, *Day 2–3 · presenting*, *Pre-discharge*), each naming **which attested fields** it shows and **which links** (guide · Case of the Week · conversation drill · family scenario · the record's own tools); every label; `minItems: 3`; an `exclude` list (empty). |
| `site_build/presenting_tomorrow.py` | `syndromes(data, site)` = topic hubs that ship on the site and carry a `clinicalWorkflow` block, joined to their first communication case and family scenario (titles from the registries). `cell_items()` = the exact item list a card renders. `validate()` fails the build if any syndrome × phase cell would render fewer than `minItems`, if a label is missing, or if copy carries an audience token. `--check`, `--matrix`, `--json`. |
| `build_deploy.py` / `resident_section.py` | Verified needle `FD_PRESENTING` (the `FD_MEDIA` pattern): MS3 injects, the resident build matches that exact value and swaps in its own (resident case titles). |
| `spa_index.html` | Two session-only picks (`fdTodayPrepRef`, `fdTodayPrepPhase`), validated against the payload before they are kept — the purpose chooser's own pattern; never persisted, never in the URL. The chooser call hands the payload, `FD_TOPIC_META` and the picks to the pure renderer. |
| `frontdoor/fd_today.js` | `fdPrepPicker` / `fdPrepCard` / `fdPrepItems`: under **Before rounds** only — syndrome pills (registry order), hospital-day pills, one card: "Topic · Phase", the phase's lead, the syndrome's **own attested lines** (verbatim, escaped), the links (a page via `data-fd-open`; a drill / scenario / tool with a query as a real `href`, since the Front Door action drops query parameters), and on the resident build the EPA codes. |
| `frontdoor.css`, `CLASS-INVENTORY.md` | 11 selectors; the pills reuse the chooser's pill rule. |

**No new clinical text anywhere.** Every line a learner reads is the record the page already shows; every label is payload data. **0 re-signs.**

## 3. The matrix (items per card, both sites identical today)

| Syndrome | Admission | Day 2–3 | Pre-discharge |
|---|---|---|---|
| Suicide risk & safety planning | 5 | 8 | 6 |
| Violence risk | 5 | 7 | 5 |
| Agitation & restraint | 7 | 8 | 6 |
| Delirium | 6 | 8 | 6 |
| Catatonia | 6 | 7 | 5 |
| Substance use & withdrawal | 7 | 8 | 6 |
| Mood disorders | 7 | 8 | 6 |
| Psychotic disorders | 7 | 8 | 6 |
| Personality disorders | 5 | 8 | 6 |
| Anxiety, trauma & OCD | 5 | 7 | 5 |
| Neurocognitive disorders | 6 | 7 | 5 |
| Psychopharmacology | 7 | 6 | 5 |
| Ethics, law & capacity | 7 | 7 | 5 |

Minimum 5 everywhere; the gate is 3. (`python3 site_build/presenting_tomorrow.py --matrix` reproduces this.)

## 4. Acceptance checks

| Check | Where |
|---|---|
| ≥ 3 syndromes per site; every cell ≥ `minItems`; every link target ships on its site; copy audience-neutral; phase ids unique | `tests/presenting-tomorrow.test.mjs` (Python half, real registries) + build-time `resolve()` |
| **Parity:** for every real cell on both sites, `fdPrepItems` draws exactly the list `cell_items()` counted | `tests/presenting-tomorrow.test.mjs` |
| Picker only under *Before rounds*; registry order; no card until a syndrome is picked; nothing without the payload; Regular Today and the other purposes unchanged | `tests/presenting-tomorrow.test.mjs`, `tests/today-purpose.test.mjs` |
| Card: first phase by default; lines in phase order, verbatim; guide first; page → `data-fd-open`, query → `href`; newest edition is the site's own twin; EPA on the resident build only | `tests/presenting-tomorrow.test.mjs` |
| Hostile ref / phase / topic name: no card, first phase, escaped | `tests/presenting-tomorrow.test.mjs` |
| Shell: needle once; both pickers validated; no storage/history/fetch; faculty preview inert; MS3 injects, resident swaps before writing | `tests/presenting-tomorrow.test.mjs`, `tests/block-wiring.test.mjs` |
| Live, both sites: Before rounds → pick a syndrome → card → open the Case of the Week | `tests/smoke/front-door.spec.js` |

## 5. What does not move

- No source page, `topic_meta` record or registry row: **0 re-signs**.
- Visual baselines: the chooser is open by default but shows the picker only after *Before rounds* is chosen, so `front-door-today-*` are unchanged.
- One Thing First is untouched: the card lives inside the purpose chooser, below the Now card and *Also today*.

## 6. Open questions for Josh

1. Three phases, these names? (*Admission* · *Day 2–3 · presenting* · *Pre-discharge* — one JSON edit each.)
2. Should the picker also offer the two hubs that are not bedside syndromes (*Psychopharmacology*, *Ethics, law & capacity*) — included now — or should `exclude` drop them?
3. Should picking a syndrome remember itself across reloads? (No, as built: session-only like the purpose; a stored pick would be the start of a profile.)
