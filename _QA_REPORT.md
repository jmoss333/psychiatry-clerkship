# QA & Attestation Report — AI-Drafted Clinical Content

**Date:** June 26, 2026 · **Reviewer (this pass):** automated checks + full clinical read by the assistant. **Attestation:** *pending — requires Joshua Moss, MD sign-off before any learner use.*

**Scope:** the content created with AI assistance in this build — 8 Markdown teaching files (7 Core-Topic one-pagers + the Differential Diagnosis scaffolds) and 6 interactive HTML tools (MSE, Decisional Capacity, Oral Presentation, Violence Risk/Brøset, Withdrawal CIWA-Ar/COWS, Reflection/PIF). Your existing repo materials and the Codex student pack are out of scope here.

## Method
Full read of every AI-drafted file against standard inpatient teaching; plus automated checks: signature + educational disclaimer present (✓ all 14), PHI/identifier scan (✓ clean), stigma-term scan (✓ clean in authored content), internal cross-reference resolution (✓ all "Pair with" targets exist), and JavaScript syntax + React-UMD load for the 6 tools (✓ verified at build).

## Overall verdict
**No safety-critical errors found.** The content is clinically accurate, evidence-anchored to the named sources, appropriately hedged (defers dosing/thresholds to institutional protocol), and notably non-stigmatizing. It reads at an MS3/MS4 level and is internally consistent with the tools it references. **It is nonetheless AI-drafted and must carry your attestation before students use it** — each file now shows a "Review status: pending Dr. Moss's review" banner until you sign off below.

## Per-file assessment
| File | Assessment | Confirm reflects your/unit practice |
|---|---|---|
| Mood | Accurate; STAR*D, lithium anti-suicidality, BALANCE, ECT, bipolarity screen, delirium trap | ECT positioned as first-line for psychotic/catatonic/life-threatening depression; "lithium = strongest maintenance evidence" framing |
| Psychosis | Accurate; CATIE/Huhn/Leucht, RAISE, LEAP, clozapine, anti-NMDA | Clozapine after "two adequate trials" wording; metabolic monitoring cadence |
| Anxiety/Trauma/OCD | Accurate; SSRIs first-line, benzo-avoidance, akathisia caution, ERP/PE/CPT | Benzodiazepine-avoidance stance phrased strongly — confirm it matches your unit's nuance |
| Personality | Accurate, non-stigmatizing; DBT, brief admissions, splitting-as-symptom, countertransference | "Brief admissions / avoid long stays for chronic BPD" framing |
| Substance Use/Withdrawal | Accurate; CIWA-Ar, COWS, thiamine-before-glucose, naloxone+MOUD | **Buprenorphine induction at "COWS ≈ ≥ 8–12"** — confirm against your protocol's exact threshold |
| Geriatric | Accurate; delirium/dementia/depression, Beers, boxed warning, ECT | ECT "early, not last resort" in late-life depression |
| Perinatal | Accurate; postpartum psychosis = emergency, EPDS limits, zuranolone, infant safety | Lithium/valproate-in-lactation phrasing; zuranolone access/role locally |
| DDx scaffolds | Accurate; medical-mimic-first, 8 syndromes, catatonia/lorazepam, thiamine | General — confirm syndrome list matches your teaching |
| 6 interactive tools | Function + disclaimers verified; scale items correct (CIWA-Ar 10, COWS 11, Brøset 6, Appelbaum 4 abilities); CIWA/COWS explicitly "not a dosing calculator" | Confirm the tools' framing matches institutional policy (capacity, restraint, withdrawal) |

## Recommended edits before sign-off
Minor and optional — the content is usable as-is pending your attestation. Where a threshold or positioning above reflects a judgment call (ECT timing, buprenorphine COWS cutoff, benzodiazepine stance), either confirm or tweak one sentence so it matches how you teach it. Every file already defers specifics to institutional protocol.

## Sign-off (complete before learner release)
| File / tool | Reviewed (Y/N) | Edits needed | Attested by / date |
|---|---|---|---|
| Mood one-pager |  |  |  |
| Psychosis one-pager |  |  |  |
| Anxiety/Trauma/OCD one-pager |  |  |  |
| Personality one-pager |  |  |  |
| Substance Use/Withdrawal one-pager |  |  |  |
| Geriatric one-pager |  |  |  |
| Perinatal one-pager |  |  |  |
| Differential Diagnosis scaffolds |  |  |  |
| MSE module |  |  |  |
| Decisional Capacity module |  |  |  |
| Oral Presentation module |  |  |  |
| Violence Risk + Brøset |  |  |  |
| Withdrawal CIWA-Ar/COWS card |  |  |  |
| Reflection + PIF set |  |  |  |

*Once you've reviewed each, I can strip the "pending review" banners and stamp "Reviewed by Joshua Moss, MD — [date]" on the approved files in one pass.*
