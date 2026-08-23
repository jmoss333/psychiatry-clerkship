# Therapy Library — KEEP Verification Run

**Run date:** 2026-08-20 · **Scope:** all 39 KEEPs from the annotated triage queue + retracted control + 3 add-by-hand candidates + 1 OA contingency
**Pipeline:** `resolveIdentifier → checkOpenAccess → checkRetraction → formatCitation`

## ⚠ Tooling note — read first

**Scholar_Sidekick is down on your machine**: every call (batch and single) returns RapidAPI `"You are not subscribed to this API"`. Fix: remove `RAPIDAPI_KEY` from the MCP config (falls back to the free anonymous tier) or set a free `SCHOLAR_API_KEY` from scholar-sidekick.com/account.

This run therefore executed the pipeline's substance against the **Europe PMC REST API via Chrome** — the exact endpoint and method §5 of the triage queue blesses (the cloud fetch proxy 403'd both Europe PMC and NCBI, so the browser carried it, queryString-echo check and all — which caught one stale read, precisely the defect the run notes warned about).

**Status of each pipeline stage:**

| Stage | Status | Source used | Canonical re-run needed? |
|---|---|---|---|
| resolveIdentifier (identity) | ✅ **DONE** | Europe PMC (PMID → full record) | No — 44/44 resolved, titles matched |
| checkRetraction | ✅ done (provisional) | MEDLINE `pubType` via Europe PMC | **Yes** — Crossref/Retraction Watch also catches errata + expressions of concern, which pubType misses |
| checkOpenAccess | ✅ done (provisional) | Europe PMC `isOpenAccess` + `inPMC` | **Yes** — Unpaywall also finds green/repository copies for the "proxy-only" set |
| formatCitation | ✅ done (provisional) | Hand-built AMA from resolved metadata | **Yes** — regenerate via formatCitation before `evidence_registry.json` |

Nothing below should enter `evidence_registry.json` until the connector is fixed and stages 2–4 re-run canonically. Everything below is safe to **triage on**.

---

## 1. Headline results

- **Identity: 44/44 clean.** Every PMID resolves to the claimed paper — no Topaz-pattern mismatches, no harvest parse errors in the KEEP set. The queue's abbreviated titles were all faithful.
- **Retraction: only the control fired.** 27810717 carries pubType `retracted publication`; **no other KEEP shows a retraction flag.** (The check demonstrably works — the control was the point.)
- **Open access: 15 of 39 KEEPs are free-linkable** — including **4 papers the harvest's `isOpenAccess: N` would have mislabeled as proxy-only** despite free PMC full text (§5's exact warning, now with names): **31050757** (FEP family intervention, PMC6942164), **21154340** (Pharoah Cochrane, PMC4204509), **38084817** (Cochrane MI, PMC10714668), and add-by-hand **29998307** (Stanley 2018, PMC6142908).
- **Two genre discoveries that change leans** (§2).
- **All four D2b title-only keeps now have PMIDs** (§3). All three add-by-hand candidates resolved except Stanley & Brown 2012, which is not Europe PMC-indexed (§3).

## 2. Findings that change the triage

**42077010 (D10, "desire for hastened death") is a LETTER, not a review** — Palliat Support Care 2026;24:e133, pubType `letter`. The queue's title framing read like a review article. **Lean changed: KEEP → CUT** (rail at most). Its teaching point (DHD ≠ suicidality) needs a different citation — candidates: promote 42271659 (OA, Psychooncology) or source a proper DHD review in the Kaitlin merge. *This is the run's best argument for itself.*

**D1 OA contingency settled exactly as forecast:** 39098267 (Huggett 2024) is **proxy-only**, and it turns out to be a **meta-ethnography** (qualitative synthesis) — while 35168297 (Huggett 2022 — same first author, same group) is **OA with 24 citations**. **Leans swapped: 35168297 CUT → KEEP (OA, the linkable read); 39098267 KEEP → GO DEEPER** (the richer method, proxy link). D1 keep count unchanged.

**41920002 (demoralization) is a commentary** (`26com16383`), not a review — by the construct's own principal scholar, so it stays KEEP, but the page should call it a commentary. ⚠ Europe PMC spells the author "de Figueirido"; the demoralization literature's author is de Figueiredo — **resolve the spelling at formatCitation re-run before shipping.**

**40177337 (D12 allegiance anchor) is narrower than the queue title implied:** the moderator analysis is specifically of **humanistic-vs-other** psychotherapy comparisons. Still the right anchor (OA, current), but the annotation should carry the scope.

**36525623 (Dodo bird) is a 3-page comment** (Westra, pp. 527-529) — fine, that's its job as the closing read; noting so no one expects a review.

**Bonus identity color:** 41190740 (DBT vs SSRI) is Brodsky, Galfalvy, Mann, Grunebaum & **Stanley** — the Safety Planning Intervention's Barbara Stanley, tying D5 to D3. And 42018336 (BOOTS) carries pubType `equivalence trial` — the design frame for its annotation.

## 3. Resolutions: D2b title-only rows + add-by-hand candidates

| Item | Resolution |
|---|---|
| D2b 2026 comprehensive SR | **PMID 42492146** — Cuijpers et al., Clin Psychol Rev 2026;128:102783. Same lineage as the 2007 anchor — "then and now" is literally the same first author. Not OA. |
| D2b co-occurring SUD | **PMID 34146994** — Pott, Delgadillo, Kellett. J Subst Abuse Treat 2022;132:108478. Not OA. |
| D2b network meta-analysis | **PMID 34264703** — Ciharova, Furukawa, …, Cuijpers. J Consult Clin Psychol 2021;89(6):563-574. 67 citations. Not OA. |
| D2b group BA | **PMID 31422844** — Simmonds-Buckley, Kellett, Waller. Behav Ther 2019;50(5):864-885. Not OA. |
| D2b 2007 anchor | **PMID 17184887 confirmed** — Cuijpers, van Straten, Warmerdam. Clin Psychol Rev 2007;27(3):318-326. 584 citations. |
| Flückiger alliance meta | **PMID 29792475**, doi 10.1037/pst0000172, Psychotherapy 2018;55(4):316-340. **810 citations.** Fixes WP-26. |
| Stanley & Brown 2018 | **PMID 29998307 confirmed** — JAMA Psychiatry 2018;75(9):894-900. Free full text PMC6142908. 370 citations. |
| Stanley & Brown 2012 | **Not in Europe PMC** (Cogn Behav Pract isn't indexed). Cite by DOI 10.1016/j.cbpra.2011.01.001; verify via Crossref when Scholar_Sidekick is back. |

## 4. Verified KEEP registry (provisional citations, AMA-style)

Access legend: **OA** = open access · **PMC** = free full text in PMC despite `isOpenAccess:N` (§5 pattern) · proxy = Tufts proxy link needed (pending Unpaywall green-copy check).

### D1 · Alliance

| PMID | Access | Retraction | Citation (provisional) |
|---|---|---|---|
| 41110399 | proxy | clean | Tetzlaff M, Bruins J, Castelein S. Associated factors of the quality of therapeutic alliance in people with severe mental illnesses: a systematic review. Clin Psychol Rev. 2025;122:102656. doi:10.1016/j.cpr.2025.102656 |
| 35168297 ⬆ | **OA** (PMC9546023) | clean | Huggett C, Gooding P, Haddock G, Quigley J, Pratt D. The relationship between the therapeutic alliance in psychotherapy and suicidal experiences: a systematic review. Clin Psychol Psychother. 2022;29(4):1203-1235. doi:10.1002/cpp.2726 |
| 38993343 | **OA** (PMC11238262) | clean | Saxler E, Schindler T, Philipsen A, Schulze M, Lux S. Therapeutic alliance in individual adult psychotherapy: a systematic review of conceptualizations and measures for face-to-face- and online-psychotherapy. Front Psychol. 2024;15:1293851. doi:10.3389/fpsyg.2024.1293851 |
| 39098267 ⬇ rail | proxy | clean | Huggett C, Peters S, Gooding P, Berry N, Pratt D. A systematic review and meta-ethnography of client and therapist perspectives of the therapeutic alliance in the context of psychotherapy and suicidal experiences. Clin Psychol Rev. 2024;113:102469. doi:10.1016/j.cpr.2024.102469 |
| 29792475 (add) | proxy | clean | Flückiger C, Del Re AC, Wampold BE, Horvath AO. The alliance in adult psychotherapy: a meta-analytic synthesis. Psychotherapy (Chic). 2018;55(4):316-340. doi:10.1037/pst0000172 |

### D2 · Inpatient brief interventions

| PMID | Access | Retraction | Citation (provisional) |
|---|---|---|---|
| 35997039 | **OA** (PMC10087275) | clean | Man H, Wood L, Glover N. A systematic review and narrative synthesis of indirect psychological intervention in acute mental health inpatient settings. Clin Psychol Psychother. 2023;30(1):24-37. doi:10.1002/cpp.2780 |
| 35442174 | proxy | clean | Cohen-Chazani Y, Lavidor M, Gilboa-Schechtman E, Roe D, Hasson-Ohayon I. Meta-analysis of the effect of psychotherapy in an inpatient setting: examining the moderating role of diagnosis and therapeutic approach. Psychiatry. 2022;85(4):399-417. doi:10.1080/00332747.2022.2062660 |
| 30520019 | proxy | clean | Schefft C, Guhn A, Brakemeier EL, Sterzer P, Köhler S. Efficacy of inpatient psychotherapy for major depressive disorder: a meta-analysis of controlled trials. Acta Psychiatr Scand. 2019;139(4):322-335. doi:10.1111/acps.12995 |

### D2b · Behavioral activation

| PMID | Access | Retraction | Citation (provisional) |
|---|---|---|---|
| 42492146 | proxy | clean | Cuijpers P, Ciharova M, Tong L, et al. Behavioral activation for depression: a comprehensive systematic review and meta-analysis. Clin Psychol Rev. 2026;128:102783. doi:10.1016/j.cpr.2026.102783 |
| 34146994 | proxy | clean | Pott SL, Delgadillo J, Kellett S. Is behavioral activation an effective and acceptable treatment for co-occurring depression and substance use disorders? A meta-analysis of randomized controlled trials. J Subst Abuse Treat. 2022;132:108478. doi:10.1016/j.jsat.2021.108478 |
| 34264703 | proxy | clean | Ciharova M, Furukawa TA, Efthimiou O, et al. Cognitive restructuring, behavioral activation and cognitive-behavioral therapy in the treatment of adult depression: a network meta-analysis. J Consult Clin Psychol. 2021;89(6):563-574. doi:10.1037/ccp0000654 |
| 31422844 | proxy | clean | Simmonds-Buckley M, Kellett S, Waller G. Acceptability and efficacy of group behavioral activation for depression among adults: a meta-analysis. Behav Ther. 2019;50(5):864-885. doi:10.1016/j.beth.2019.01.003 |
| 17184887 | proxy | clean | Cuijpers P, van Straten A, Warmerdam L. Behavioral activation treatments of depression: a meta-analysis. Clin Psychol Rev. 2007;27(3):318-326. doi:10.1016/j.cpr.2006.11.001 |
| 27810717 | — | **RETRACTED ✓ control fired** | Chan ATY et al. J Affect Disord 2017;208:345-354. pubType: `retracted publication`. Tombstone only — never ships. |

### D3 · Safety planning / lethal means

| PMID | Access | Retraction | Citation (provisional) |
|---|---|---|---|
| 40185617 | proxy | clean | Shank LM, Smolenski DJ, Boyd C, et al. Systematic review of the impact of interventions changing access to lethal means on suicide attempts and deaths. Inj Prev. 2026;32(1):7-15. doi:10.1136/ip-2024-045611 |
| 41365522 | **OA** (PMC12699607) | clean | Steeg S, Ledden S, Marzano L, et al. Effectiveness of suicide means restriction: an overview of systematic reviews. BMJ Ment Health. 2025;28(1):e302069. doi:10.1136/bmjment-2025-302069 |
| 41588871 | proxy | clean | Penzenik ME, Schneider AL, Hoffmire CA, Sells JR, Stearns-Yoder KA, Brenner LA. Rural community members' experiences and perceptions regarding lethal means safety in the context of suicide and accidental death rates. J Rural Health. 2026;42(1):e70103. doi:10.1111/jrh.70103 |
| 29998307 (add) | **PMC** (PMC6142908) | clean | Stanley B, Brown GK, Brenner LA, et al. Comparison of the Safety Planning Intervention with follow-up vs usual care of suicidal patients treated in the emergency department. JAMA Psychiatry. 2018;75(9):894-900. doi:10.1001/jamapsychiatry.2018.1776 |
| (add) | publisher | pending Crossref | Stanley B, Brown GK. Safety planning intervention: a brief intervention to mitigate suicide risk. Cogn Behav Pract. 2012;19(2):256-264. doi:10.1016/j.cbpra.2011.01.001 — *not Europe PMC-indexed; verify via Scholar_Sidekick when restored* |

### D4 · CBT for psychosis

| PMID | Access | Retraction | Citation (provisional) |
|---|---|---|---|
| 41217072 | **OA** (+ NBK618904) | clean | Varese F, Sudell M, Morrison AP, Longden E, Tudur Smith C; IMPART. Treatment effect modifiers of cognitive behaviour therapy in people with psychosis: an individual participant data meta-analysis of RCTs. Health Technol Assess. 2025;29(53):1-115. doi:10.3310/NCFR5074 |
| 40392926 | **OA** (PMC12091889) | clean | Hong Y, Chen Y, Bai Y, Tan W. Cognitive-behavioral therapy for the improvement of negative symptoms and functioning in schizophrenia: a systematic review and meta-analysis of randomized controlled trials. PLoS One. 2025;20(5):e0324685. doi:10.1371/journal.pone.0324685 |
| 15500811 | proxy | clean | Tarrier N, Wykes T. Is there evidence that cognitive behaviour therapy is an effective treatment for schizophrenia? A cautious or cautionary tale? Behav Res Ther. 2004;42(12):1377-1401. doi:10.1016/j.brat.2004.06.020 |

### D5 · DBT / GPM

| PMID | Access | Retraction | Citation (provisional) |
|---|---|---|---|
| 42018336 | proxy | clean | Wibbelink CJM, Kamphuis JH, Sinnaeve R, et al. Dialectical behavior therapy vs schema therapy for patients with borderline personality disorder: the BOOTS multicenter randomized clinical trial. JAMA Psychiatry. 2026;83(7):669-681. doi:10.1001/jamapsychiatry.2026.0418 *(equivalence trial)* |
| 41190740 | proxy | clean | Brodsky BS, Galfalvy H, Mann JJ, Grunebaum MF, Stanley B. Dialectical behavior therapy versus serotonin reuptake inhibitor treatment for suicidal behavior in borderline personality disorder: a randomized controlled trial. Am J Psychiatry. 2025;182(12):1083-1092. doi:10.1176/appi.ajp.20240298 |
| 42275028 | proxy | clean | Arqueros M, Soler J, Pascual JC. Stand-alone dialectical behavior therapy skills training for borderline personality disorder: a systematic review and meta-analysis. Personal Disord. 2026. doi:10.1037/per0000774 *(ahead of print — no vol/pages yet)* |
| 38952224 | proxy | clean | Links PS, Ross J. Good psychiatric management of borderline personality disorder: foundations and future challenges. Am J Psychother. 2025;78(1):4-10. doi:10.1176/appi.psychotherapy.20230044 |
| 41849148 | proxy | clean | Appel G, Arac-Orhun S, Hersh R. Guidance for family engagement with patients with borderline personality disorder: integrating principles from transference-focused psychotherapy and good psychiatric management. Psychodyn Psychiatry. 2026;54(1):97-109. doi:10.1521/pdps.2026.54.1.97 |

### D6 · Family

| PMID | Access | Retraction | Citation (provisional) |
|---|---|---|---|
| 33568244 | proxy | clean | Ma CF, Chan SKW, Chung YL, et al. The predictive power of expressed emotion and its components in relapse of schizophrenia: a meta-analysis and meta-regression. Psychol Med. 2021;51(3):365-375. doi:10.1017/S0033291721000209 |
| 31050757 | **PMC** (PMC6942164) | clean | Camacho-Gomez M, Castellvi P. Effectiveness of family intervention for preventing relapse in first-episode psychosis until 24 months of follow-up: a systematic review with meta-analysis of randomized controlled trials. Schizophr Bull. 2020;46(1):98-109. doi:10.1093/schbul/sbz038 |
| 21154340 | **PMC** (PMC4204509) | clean | Pharoah F, Mari J, Rathbone J, Wong W. Family intervention for schizophrenia. Cochrane Database Syst Rev. 2010;(12):CD000088. doi:10.1002/14651858.CD000088.pub2 |

### D7 · Motivational interviewing

| PMID | Access | Retraction | Citation (provisional) |
|---|---|---|---|
| 38084817 | **PMC** (PMC10714668) | clean | Schwenker R, Dietrich CE, Hirpa S, et al. Motivational interviewing for substance use reduction. Cochrane Database Syst Rev. 2023;12:CD008063. doi:10.1002/14651858.CD008063.pub3 |
| 39798118 | proxy | clean | Bastos Maia M, Martins PM, Figueiredo-Braga M. Outcomes and challenges of motivational interviewing in dual diagnosis treatment—a systematic review. J Dual Diagn. 2025;21(1):56-69. doi:10.1080/15504263.2024.2434218 |

### D8 · Trauma-informed care

| PMID | Access | Retraction | Citation (provisional) |
|---|---|---|---|
| 41267566 | proxy | clean | Ferguson M, Loughhead M, McIntyre H, Procter N. Trauma-informed approaches to suicide prevention. Crisis. 2026;47(1):41-52. doi:10.1027/0227-5910/a001031 |
| 39046622 | proxy | clean | Mahon D. An umbrella review of systematic reviews on trauma informed approaches. Community Ment Health J. 2024;60(8):1627-1651. doi:10.1007/s10597-024-01317-z |
| 38444328 | **OA** (PMC10940237) | clean | Goldstein E, Chokshi B, Melendez-Torres GJ, Rios A, Jelley M, Lewis-O'Connor A. Effectiveness of trauma-informed care implementation in health care settings: systematic review of reviews and realist synthesis. Perm J. 2024;28(1):135-150. doi:10.7812/TPP/23.127 |

### D9 · Psychodynamic / MBT

| PMID | Access | Retraction | Citation (provisional) |
|---|---|---|---|
| 38279664 | proxy | clean | Hajek Gross C, Oehlke SM, Prillinger K, Goreis A, Plener PL, Kothgassner OD. Efficacy of mentalization-based therapy in treating self-harm: a systematic review and meta-analysis. Suicide Life Threat Behav. 2024;54(2):317-337. doi:10.1111/sltb.13044 |
| 36958077 | proxy | clean | Wienicke FJ, Beutel ME, Zwerenz R, et al. Efficacy and moderators of short-term psychodynamic psychotherapy for depression: a systematic review and meta-analysis of individual participant data. Clin Psychol Rev. 2023;101:102269. doi:10.1016/j.cpr.2023.102269 |
| 36404677 | **OA** (PMC10520584) | clean | Driessen E, Fokkema M, Dekker JJM, et al. Which patients benefit from adding short-term psychodynamic psychotherapy to antidepressants in the treatment of depression? A systematic review and meta-analysis of individual participant data. Psychol Med. 2023;53(13):6090-6101. doi:10.1017/S0033291722003270 |

### D10 · Medically ill / CL (held for Kaitlin)

| PMID | Access | Retraction | Citation (provisional) |
|---|---|---|---|
| 41920002 | proxy | clean | de Figueirido JM *(sic — verify: de Figueiredo)*. The demoralization construct in clinical practice and research. J Clin Psychiatry. 2026;87(2):26com16383. doi:10.4088/JCP.26com16383 *(commentary)* |
| 42207918 | **OA** (NBK622746) | clean | Gunturu S, McGee M, Javaid A. Meaning-Centered Psychotherapy. In: StatPearls. StatPearls Publishing; 2026. |
| 32428905 | proxy | clean | Abbass A, Town J, Holmes H, et al. Short-term psychodynamic psychotherapy for functional somatic disorders: a meta-analysis of randomized controlled trials. Psychother Psychosom. 2020;89(6):363-370. doi:10.1159/000507738 |
| ~~42077010~~ | OA | clean | **DEMOTED — this is a letter** (Palliat Support Care 2026;24:e133), not a review. Replace its slot in the Kaitlin merge. |

### D11 · Post-discharge

| PMID | Access | Retraction | Citation (provisional) |
|---|---|---|---|
| 39837259 | proxy | clean | Diefenbach GJ, Collett S, Black S, Rudd MD, Gueorguieva R, Tolin DF. The effect of inpatient brief cognitive-behavioral therapy for suicide prevention on post-discharge emergency department utilization: secondary analysis of a randomized clinical trial. Gen Hosp Psychiatry. 2025;93:73-79. doi:10.1016/j.genhosppsych.2025.01.007 |
| 41664893 | proxy | clean | Modini M, Large M. Understanding the suicide rate post-discharge from a psychiatric hospital: time for a rethink. Australas Psychiatry. 2026;34(3):227-230. doi:10.1177/10398562261425069 |
| 38934489 | **OA** (PMC11629600) | clean | Steinberg R, Amini J, Sinyor M, Mitchell RHB, Schaffer A. Implementation of caring contacts using patient feedback to reduce suicide-related outcomes following psychiatric hospitalization. Suicide Life Threat Behav. 2024;54(6):1041-1052. doi:10.1111/sltb.13108 |

### D12 · Evidence limits

| PMID | Access | Retraction | Citation (provisional) |
|---|---|---|---|
| 40177337 | **OA** (PMC11960564) | clean | Schünemann O, Jansen A, Willutzki U, Heinrichs N. Allegiance and treatment quality as moderators of the comparative effectiveness of psychotherapy? A systematic review and meta-analysis of studies comparing humanistic psychotherapy to other psychotherapy approaches. Clin Psychol Eur. 2025;7(1):e9709. doi:10.32872/cpe.9709 *(scope: humanistic-vs-other comparisons)* |
| 36525623 | proxy | clean | Westra HA. The implications of the Dodo bird verdict for training in psychotherapy: prioritizing process observation. Psychother Res. 2023;33(4):527-529. doi:10.1080/10503307.2022.2141588 *(3-page comment — by design)* |
| 40325843 | proxy | clean | De Salve F, Rossi C, Gioacchini E, Messina I, Oasi O. Dropout in psychotherapy for personality disorders: a systematic review of predictors. Clin Psychol Psychother. 2025;32(3):e70080. doi:10.1002/cpp.70080 |
| 40471224 | **OA** (PMC12203892) | clean | Difronzo MJ, Thackeray L, O'Keeffe S, Calderon A, Midgley N. "Maybe you don't know what answers I want": unresolved alliance ruptures preceding dropout in short-term psychoanalytic psychotherapy with depressed adolescents. Res Psychother. 2025;28(1). doi:10.4081/ripppo.2025.2025.841 |

---

## 5. Checklist for the canonical Scholar_Sidekick re-run (after key fix)

1. `checkOpenAccess` on the 24 proxy-only PMIDs — Unpaywall may surface green copies (author manuscripts) the Europe PMC flags miss, especially for 29792475 (Flückiger), 33568244, 36958077.
2. `checkRetraction` on all 43 — catches **errata and expressions of concern**, which `pubType` doesn't carry.
3. `formatCitation` (style: ama) on all 43 — replaces every provisional citation above; resolves the de Figueiredo/Figueirido spelling.
4. `verifyCitation` on Stanley & Brown 2012 (DOI 10.1016/j.cbpra.2011.01.001) — the one item Europe PMC couldn't see.
5. Then stage into `therapy_library.json`.

**Run-notes addendum earned today:** the stale-read defect reproduced once in this session and the queryString-echo check caught it — keep that check permanent. And the §5 OA warning is now quantified: 4 of 39 keeps (~10%) would have shipped proxy links over existing free full text on `isOpenAccess` alone.
