# Citation audit — PR #672 and PR #640
Every verdict below rests on live NCBI E-utilities queries run 2026-09-17 (esearch + esummary, no API key). Zero HTTP errors and zero empty bodies across all three query passes, so nothing here is partial. No repository file was modified.

**Verdict key** — VERIFIED: author, year, journal and topic all match a real PubMed record. MISATTRIBUTED: a real paper by that author exists, but at least one of year / journal / topic disagrees. NOT_FOUND: no PubMed record by that first author in that year (+/-1) on anything close to the topic. UNCHECKED: book, guideline, TIP or DSM — not PubMed-checkable.

---

## PR #672 (Phase 4A, commit 8b8ccd9)

55 citations: **4 VERIFIED · 34 MISATTRIBUTED · 9 NOT_FOUND · 8 UNCHECKED**

### `02_Clinical_Skills/Case_Formulation/case_formulation_inpatient_teaching.md`

4 citations — 0 VERIFIED / 0 MISATTRIBUTED / 2 NOT_FOUND / 2 UNCHECKED

| Citation as published | Verdict | What PubMed actually has |
|---|---|---|
| Caplan PJ (2007) — *The Myth of Women's Masochism* | UNCHECKED **[cited year 2007 vs real 1984/1985]** | PMID 6367565 — *The myth of women's masochism.* — Am Psychol 1984. Book, not PubMed-checkable. PubMed shows Caplan PJ, 'The myth of women's masochism', Am Psychol 1984; the book was published 1985. Cited year 2007 does not match either. |
| Ackerman-Barger K (2019) — *Journal of the American Psychiatric Association* | NOT_FOUND **['Journal of the American Psychiatric Association' is not a real journal; co-author 'Moss, J.' is the site owner's own name]** | PMID 32176970 — *Barbershop Talk: African-American Men's Perceptions of Nursing as a Career.* — J Natl Black Nurses Assoc 2019. No Ackerman-Barger 2019 paper on structural racism in psychiatric formulation. The single 2019 PubMed record carrying her name is a nursing-career interview study (first  |
| Lu FG (1992) — *Handbook of Mental Health and Mental Disorder Am* | UNCHECKED | PMID 18695027 — *Culture and psychiatric education.* — Acad Psychiatry 2008. Edited book, not PubMed-checkable. Lu FG is a real cultural-psychiatry author (e.g. with Lim RF, Acad Psychiatry 2008), but the editorship/year of this handbook cannot be |
| Pierce CM (1974) — *Journal of the National Medical Association* | NOT_FOUND **[different Pierce (HE vs CM)]** | PMID 4819902 — *Cryosurgery for hypertrophic scars and keloids. A preliminary report.* — J Natl Med Assoc 1974. No Pierce CM 1974 J Natl Med Assoc paper. The only Pierce/1974/JNMA record is by Pierce HE on cryosurgery for keloids. Author+topic search for Pierce CM on racism/racial  |

### `03_Core_Topics/Medical_Workup/medical_workup_inpatient_teaching.md`

5 citations — 0 VERIFIED / 2 MISATTRIBUTED / 3 NOT_FOUND / 0 UNCHECKED

| Citation as published | Verdict | What PubMed actually has |
|---|---|---|
| Hogan AM (2020) — *Frontiers in Psychiatry* | NOT_FOUND **[6-author string (Dillon, Owens, Kilcourse, Monahan, Boyd) does not resolve to any real paper]** | PMID 31708044 — *First Episode Psychosis Medical Workup: Evidence-Informed Recommendations and In* — Child Adolesc Psychiatr Clin N Am 2020. No Hogan AM 2020 Frontiers in Psychiatry paper. Author+topic search returned one unrelated colorectal-cancer paper. The claim's real source appears to be a different pape |
| Hinds PS (2011) — *Journal of Clinical Nursing* | NOT_FOUND **[author's field (pediatric oncology nursing) unrelated to the claim]** | PMID 22157101 — *'The family factor' knowledge needed in oncology research.* — Cancer Nurs 2012. No Hinds PS 2011 Journal of Clinical Nursing paper on cultural attribution of symptoms. Hinds PS has 38 records in 2010-2012, all pediatric oncology / palliative nursing. |
| Flores G (2002) — *Journal of General Internal Medicine* | MISATTRIBUTED | PMID 12509547 — *Errors in medical interpretation and their potential clinical consequences in pe* — Pediatrics 2003. Flores G is genuinely the language-barriers researcher, but has no 2002 J Gen Intern Med paper. His 2001-2003 language work is in Arch Pediatr Adolesc Med (2002), Pediatr |
| Carson N (2020) — *Journal of Psychiatric Research* | NOT_FOUND | PMID 32889344 — *A pilot study using ecological momentary assessment via smartphone application..* — Psychiatry Res 2020. No Carson N 2020 Journal of Psychiatric Research paper on the epidemiology of medical mimics. Carson N publishes on racial/ethnic mental-health service disparities; nothi |
| Singal AG (2012) — *American Journal of Gastroenterology* | MISATTRIBUTED **[hepatology author team cited for a thyroid/endocrine claim]** | PMID 21316670 — *Is MRCP equivalent to ERCP for diagnosing biliary obstruction in orthotopic live* — Gastrointest Endosc 2011. Singal AG, Volk ML and Waljee A are a real co-publishing team, but entirely in hepatology/GI (HCC surveillance, liver disease). No paper by them on race-differential TSH/ |

### `03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md` — **safetyKit surface (`t_sud.md`)**

15 citations — 1 VERIFIED / 9 MISATTRIBUTED / 1 NOT_FOUND / 4 UNCHECKED

| Citation as published | Verdict | What PubMed actually has |
|---|---|---|
| Sullivan JT (1989) — *American Journal of Psychiatry* | MISATTRIBUTED | PMID 2597811 — *Assessment of alcohol withdrawal: the revised clinical institute withdrawal asse* — Br J Addict 1989. Real paper exists but the journal is wrong. Cited as American Journal of Psychiatry; the CIWA-Ar development/validation paper is in British Journal of Addiction. |
| Wesson DR (2003) — *Journal of Clinical Psychiatry* | MISATTRIBUTED | PMID 12924748 — *The Clinical Opiate Withdrawal Scale (COWS).* — J Psychoactive Drugs 2003. Real paper exists but the journal is wrong. Cited as Journal of Clinical Psychiatry; the COWS paper is in Journal of Psychoactive Drugs. Author and year match. |
| Saitz R (1994) — *New England Journal of Medicine* | MISATTRIBUTED | PMID 8046805 — *Individualized treatment for alcohol withdrawal. A randomized double-blind contr* — JAMA 1994. Real Saitz 1994 paper exists but in JAMA, not NEJM; and its subject is symptom-triggered vs fixed-schedule dosing, not the LOT/glucuronidation teaching attached to the ci |
| Zubaran C (1997) — *Drug and Alcohol Dependence* | MISATTRIBUTED | PMID 9039406 — *Wernicke-Korsakoff syndrome.* — Postgrad Med J 1997. Real paper exists but the journal is wrong. Cited as Drug and Alcohol Dependence; Zubaran's 1997 Wernicke-Korsakoff review is in Postgraduate Medical Journal. |
| Harper C (2005) — *Alcohol and Alcoholism* | MISATTRIBUTED | PMID 15661629 — *Ethanol and brain damage.* — Curr Opin Pharmacol 2005. The exact author pair and year are right but the journal is wrong. Harper C & Matsumoto I 2005 is in Current Opinion in Pharmacology, not Alcohol and Alcoholism (Harper d |
| Mattick RP (2014) — *Cochrane Database of Systematic Reviews* | VERIFIED | PMID 24500948 — *Buprenorphine maintenance versus placebo or methadone maintenance for opioid dep* — Cochrane Database Syst Rev 2014. Author, year, journal and topic all match. |
| Volkow ND (2004) — *New England Journal of Medicine* | MISATTRIBUTED | PMID 26816013 — *Neurobiologic Advances from the Brain Disease Model of Addiction.* — N Engl J Med 2016. Volkow's brain-disease-model NEJM paper is 2016, not 2004; her 2004 paper on this theme is in Nature Reviews Neuroscience. Cited co-author Blanco C appears on neither. |
| Litten RZ (2016) — *JAMA Psychiatry* | MISATTRIBUTED | PMID 27696442 — *Nociceptin Receptor as a Target to Treat Alcohol Use Disorder: Challenges in Adv* — Alcohol Clin Exp Res 2016. No Litten RZ 2016 JAMA Psychiatry paper. Litten's 2016 output is in Alcohol Clin Exp Res. |
| Johnson BA (2010) — *Lancet* | MISATTRIBUTED | PMID 20516163 — *Medication treatment of different types of alcoholism.* — Am J Psychiatry 2010. No Johnson BA 2010 Lancet paper. His 2010 alcohol-pharmacotherapy papers are in Am J Psychiatry and Curr Pharm Des. |
| Miller WR (2013) — *Motivational Interviewing: Helping People Change* | UNCHECKED | Book (Motivational Interviewing, 3rd ed.). Year 2013 is correct for the 3rd edition. |
| DiClemente CC (2003) — *Addiction: Comprehensive Guidebook* | UNCHECKED **[book title likely conflated]** | Book, not PubMed-checkable. DiClemente's own 2003 book is 'Addiction and Change: How Addictions Develop and Addicted People Recover'; 'Addiction: Comprehensive Guidebook' is a different (1999) edited volume. Title/year pairing loo |
| Singal AG (2023) — *American Journal of Psychiatry* | NOT_FOUND **[hepatology author cited for an addiction-psychiatry claim]** | PMID 37199193 — *AASLD Practice Guidance on prevention, diagnosis, and treatment of hepatocellula* — Hepatology 2023. No Singal AG 2023 American Journal of Psychiatry paper. Author+topic search for OUD disparities returned 0; his 2023 output is hepatology (AASLD HCC guidance, Hepatology) |
| Hansen H (2016) — *Journal of Bioethical Inquiry* | MISATTRIBUTED | PMID 27831792 — *Is the Prescription Opioid Epidemic a White Problem?* — Am J Public Health 2016. Hansen H & Netherland J 2016 is real but in the American Journal of Public Health, not the Journal of Bioethical Inquiry. (A Hansen H 2016 J Bioeth Inq paper does exist,  |
| SAMHSA (2014) — *TIP 41: Substance Abuse Treatment: Group Therapy* | UNCHECKED **[TIP number does not match the cited content or year]** | SAMHSA TIP, grey literature. Title/content mismatch visible from the citation itself: TIP 41 is 'Substance Abuse Treatment: Group Therapy' (2005), but the claim attached (trauma-informed care; safety, trustworthiness, choice, coll |
| Schuckit MA (2016) — *Drug and Alcohol Abuse: A Clinical Guide to Diag* | UNCHECKED | Textbook, not PubMed-checkable. Schuckit MA is a real and appropriate author for this subject. |

### `04_Acute_and_Safety/Delirium/delirium_inpatient_teaching.md` — **safetyKit surface (`delirium.md`)**

22 citations — 2 VERIFIED / 17 MISATTRIBUTED / 1 NOT_FOUND / 2 UNCHECKED

| Citation as published | Verdict | What PubMed actually has |
|---|---|---|
| Inouye SK (1990) — *Annals of Internal Medicine* | VERIFIED | PMID 2240918 — *Clarifying confusion: the confusion assessment method. A new method for detectio* — Ann Intern Med 1990. Author, year, journal and topic all match exactly. |
| American Psychiatric Association (2013) — *Diagnostic and Statistical Manual of Mental Diso* | UNCHECKED | DSM-5, grey. Year 2013 is correct. |
| Liptzin B (1992) — *Journal of the American Geriatrics Society* | MISATTRIBUTED | PMID 1483173 — *An empirical study of delirium subtypes.* — Br J Psychiatry 1992. Liptzin & Levkoff 1992 is real but in the British Journal of Psychiatry, not JAGS, and its subject is delirium subtypes, not a 50% miss rate. |
| Breitbart W (2002) — *Journal of Palliative Medicine* | MISATTRIBUTED | PMID 12075033 — *The delirium experience: delirium recall and delirium-related distress in hospit* — Psychosomatics 2002. The exact author trio and year are right but the journal is wrong: Psychosomatics, not Journal of Palliative Medicine. The paper is about delirium recall and delirium-rel |
| Marcantonio ER (2011) — *New England Journal of Medicine* | MISATTRIBUTED | PMID 29020579 — *Delirium in Hospitalized Older Adults.* — N Engl J Med 2017. Marcantonio's NEJM delirium review exists but is dated 2017, not 2011. |
| Siddiqi N (2016) — *PLoS Medicine* | MISATTRIBUTED | PMID 26967259 — *Interventions for preventing delirium in hospitalised non-ICU patients.* — Cochrane Database Syst Rev 2016. Siddiqi's 2016 delirium-prevention systematic review is a Cochrane review, not PLoS Medicine. Author and year match. |
| Inouye SK (1999) — *New England Journal of Medicine* | VERIFIED | PMID 10053175 — *A multicomponent intervention to prevent delirium in hospitalized older patients* — N Engl J Med 1999. Author, year, journal and topic all match (the HELP multicomponent intervention trial). |
| Martinez FT (2015) — *Critical Care Medicine* | MISATTRIBUTED | PMID 22589080 — *Preventing delirium in an acute hospital using a non-pharmacological interventio* — Age Ageing 2012. Martinez FT's delirium paper is Age and Ageing 2012, not Critical Care Medicine 2015, and it is about non-pharmacological prevention on an acute ward, not ICU early mobil |
| Clegg A (2011) — *BMJ* | MISATTRIBUTED | PMID 21068014 — *Which medications to avoid in people at risk of delirium: a systematic review.* — Age Ageing 2011. Clegg A & Young JB 2011 is real, with the cited topic, but published in Age and Ageing, not the BMJ. |
| Sultana J (2018) — *Nature Reviews Neurology* | MISATTRIBUTED | PMID 25736834 — *Antidepressant use in the elderly: the role of pharmacodynamics and pharmacokine* — Expert Opin Drug Metab Toxicol 2015. The Sultana/Spina/Trifiro trio is real but has no 2018 Nature Reviews Neurology paper on anticholinergic burden; their related work is in Expert Opin Drug Metab Toxicol ( |
| Flaherty JH (2011) — *Annals of Internal Medicine* | MISATTRIBUTED | PMID 22091572 — *Antipsychotics in the treatment of delirium in older hospitalized adults: a syst* — J Am Geriatr Soc 2011. Flaherty JH 2011 wrote on exactly this topic, but in the Journal of the American Geriatrics Society (and Med Clin North Am), not Annals of Internal Medicine. |
| Yue J (2015) — *Journal of Gerontology: Medical Sciences* | MISATTRIBUTED | PMID 24697606 — *NICE to HELP: operationalizing National Institute for Health and Clinical Excell* — J Am Geriatr Soc 2014. The nearest real paper is Yue J, Tabloski P, Dowal SL ... Inouye SK, 'NICE to HELP', J Am Geriatr Soc 2014 — different year and journal, and the cited 4th author (Traviso |
| Xie H (2013) — *JAMA Psychiatry* | NOT_FOUND | PMID 23927941 — *Behavior observation of major noise sources in critical care wards.* — J Crit Care 2013. No Xie H 2013 JAMA Psychiatry paper on sleep and delirium. Xie H's 2012-2013 records are ICU noise/acoustics studies in J Crit Care and Noise Health. |
| Pandharipande PP (2013) — *Intensive Care Medicine* | MISATTRIBUTED | PMID 24088092 — *Long-term cognitive impairment after critical illness.* — N Engl J Med 2013. The landmark Pandharipande 2013 paper with this content is in the New England Journal of Medicine, not Intensive Care Medicine. |
| Ely EW (2010) — *Critical Care Medicine* | MISATTRIBUTED | PMID 11730446 — *Delirium in mechanically ventilated patients: validity and reliability of the co* — JAMA 2001. CAM-ICU development and validation is Ely EW 2001 (JAMA and Critical Care Medicine), not 2010. Ely's 2010 Crit Care Med records are co-authorships on other topics. |
| Granberg A (2017) — *American Journal of Critical Care* | MISATTRIBUTED | PMID 10196913 — *Patients' experience of being critically ill or severely injured and cared for i* — Intensive Crit Care Nurs 1998. Granberg A has zero PubMed records in 2016-2018. Her work on the ICU patient experience and acute confusion is in Intensive and Critical Care Nursing, 1998-1999. |
| Fick DM (2014) — *Critical Care Nursing Clinics of North America* | MISATTRIBUTED | PMID 12366629 — *Delirium superimposed on dementia: a systematic review.* — J Am Geriatr Soc 2002. No Fick DM 2014 paper in Critical Care Nursing Clinics of North America; her 24 records in 2013-2015 are in Geriatric Nursing and J Gerontol Nurs. Her landmark delirium-s |
| Han JH (2011) — *Journal of Hospital Medicine* | MISATTRIBUTED | PMID 21521405 — *Delirium in older emergency department patients is an independent predictor of h* — Acad Emerg Med 2011. Han JH's 2011 ED delirium paper is in Academic Emergency Medicine, not the Journal of Hospital Medicine, and concerns length of stay rather than racial disparities in rec |
| Racine AM (2016) — *Journal of the American Geriatrics Society* | MISATTRIBUTED | PMID 29746694 — *Delirium Burden in Patients and Family Caregivers: Development and Testing of Ne* — Gerontologist 2019. Racine AM's delirium-burden/caregiver work is in The Gerontologist (2019); her 2016 record is a CSF-amyloid study. No 2016 JAGS paper, and cited co-author Calhoun DA (a h |
| Ely EW (2001) — *Critical Care Medicine* | MISATTRIBUTED **[real paper, fabricated finding attached to it]** | PMID 11445689 — *Evaluation of delirium in critically ill patients: validation of the Confusion A* — Crit Care Med 2001. Author list, year and journal match a real paper exactly, but the topic does not: PMID 11445689 is the CAM-ICU validation study, not a study of racial variation in ICU ou |
| Levkoff SE (1992) — *Journal of the American Geriatrics Society* | MISATTRIBUTED | PMID 1739363 — *Delirium. The occurrence and persistence of symptoms among elderly hospitalized * — Arch Intern Med 1992. Levkoff's 1992 delirium-prevalence paper is in Archives of Internal Medicine, not JAGS. |
| Trzepacz PT (2022) — *The Delirium Superbook* | UNCHECKED **[book title 'The Delirium Superbook' not identifiable]** | PMID 36539078 — *Delusions and Hallucinations Are Associated With Greater Severity of Delirium.* — J Acad Consult Liaison Psychiatry 2023. Book, not PubMed-checkable. No work by this title is identifiable; Trzepacz and Meagher do co-publish (J Acad Consult Liaison Psychiatry 2023). Title appears invented. |

### `14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/consult_capacity_delirium_catatonia_withdrawal.md` — **safetyKit surface (`exp_consult.md`)**

4 citations — 0 VERIFIED / 3 MISATTRIBUTED / 1 NOT_FOUND / 0 UNCHECKED

| Citation as published | Verdict | What PubMed actually has |
|---|---|---|
| Appelbaum PS (1995) — *Psychiatric Services* | MISATTRIBUTED | PMID 11660290 — *The MacArthur Treatment Competence Study. I: Mental illness and competence to co* — Law Hum Behav 1995. Appelbaum & Grisso 1995 is real but in Law and Human Behavior, not Psychiatric Services; and the racial/socioeconomic-variability claim is not that paper's subject. |
| Saks ER (2006) — *Journal of the American Academy of Psychiatry an* | MISATTRIBUTED | PMID 16883609 — *Capacity to consent to or refuse treatment and/or research: theoretical consider* — Behav Sci Law 2006. Saks & Jeste 2006 is real but in Behavioral Sciences & the Law, not JAAPL; and it is a theoretical paper on capacity to consent, not a vignette study of racial bias in ca |
| Makadon HJ (2003) — *Journal of the American Medical Association* | NOT_FOUND | PMID 4003969 — *Nurses and physicians: prospects for collaboration.* — Ann Intern Med 1985. Makadon HJ has 45 PubMed records but none in 2003 (a 2002-2004 window returns one unrelated paper by another author). No paper with a co-author Silin JG exists. |
| Buchanan AE (2004) — *Journal of Medical Ethics* | MISATTRIBUTED | PMID 15340019 — *Mental capacity, legal competence and consent to treatment.* — J R Soc Med 2004. The real 2004 capacity paper is Buchanan A, 'Mental capacity, legal competence and consent to treatment', J R Soc Med 2004 — a different journal and a different Buchanan  |

### `14_Tracks/MS3/Student_Ready_Pack/05_documentation_oral_presentation/student_documentation_and_oral_presentations.md`

5 citations — 1 VERIFIED / 3 MISATTRIBUTED / 1 NOT_FOUND / 0 UNCHECKED

| Citation as published | Verdict | What PubMed actually has |
|---|---|---|
| Chapman EN (2013) — *Academic Medicine* | MISATTRIBUTED | PMID 23576243 — *Physicians and implicit bias: how doctors may unwittingly perpetuate health care* — J Gen Intern Med 2013. Author trio, year and topic match exactly; only the journal is wrong — Journal of General Internal Medicine, not Academic Medicine. |
| Fernandez A (2011) — *JAMA Internal Medicine* | MISATTRIBUTED **[cited journal did not exist in the cited year]** | PMID 20878497 — *Language barriers, physician-patient language concordance, and glycemic control * — J Gen Intern Med 2011. The nine-author string matches a real paper exactly, but both the journal and the topic are wrong: it is J Gen Intern Med 2011 and it is about glycemic control in Latinos |
| Lui PP (2018) — *Psychiatric Services* | MISATTRIBUTED | PMID 29355333 — *Acculturation and alcohol use among Asian Americans: A meta-analytic review.* — Psychol Addict Behav 2018. Lui PP & Zamboanga BL 2018 is real but in Psychology of Addictive Behaviors, not Psychiatric Services, and it is a meta-analysis of acculturation and alcohol use, not a s |
| Street RL (2007) — *Social Science & Medicine* | VERIFIED | PMID 17462801 — *Physicians' communication and perceptions of patients: is it how they look, how * — Soc Sci Med 2007. Author trio, year and journal all match. Topic (physician communication and perceptions of patients, including by race) matches the claim, though the study is a primary-c |
| Basit SA (2020) — *Journal of the American Psychiatric Association* | NOT_FOUND **['Journal of the American Psychiatric Association' is not a real journal]** | PMID 25454305 — *Portal vein thrombosis.* — Clin Liver Dis 2015. Author+topic search returned 0. Basit SA's PubMed record is hepatology/GI (portal vein thrombosis). |

---

## PR #640 (Phase 1 & 2, commit 0009ad6)

30 citations: **10 VERIFIED · 8 MISATTRIBUTED · 2 NOT_FOUND · 10 UNCHECKED**

### `02_Clinical_Skills/Case_Formulation/case_formulation_inpatient_teaching.md`

1 citations — 0 VERIFIED / 0 MISATTRIBUTED / 0 NOT_FOUND / 1 UNCHECKED

| Citation as published | Verdict | What PubMed actually has |
|---|---|---|
| For students interested in depth-oriented formulation: the PDM-5 (2018) — *no journal cited* | UNCHECKED **[nonexistent manual name]** | Grey/book reference. No 'PDM-5' exists: the Psychodynamic Diagnostic Manual's current edition is PDM-2 (2017). Both the name and the year appear wrong. |

### `03_Core_Topics/Medical_Workup/medical_workup_inpatient_teaching.md`

2 citations — 1 VERIFIED / 0 MISATTRIBUTED / 0 NOT_FOUND / 1 UNCHECKED

| Citation as published | Verdict | What PubMed actually has |
|---|---|---|
| APA Practice Guideline for Schizophrenia (2020) — *no journal cited* | UNCHECKED | Professional-society guideline, not PubMed-checkable as cited. The APA schizophrenia practice guideline was indeed published in 2020; nothing visibly wrong. |
| First-Episode Psychosis Medical Workup: Evidence-Informed Recommendations (2020) — *no journal cited* | VERIFIED | PMID 31708044 — *First Episode Psychosis Medical Workup: Evidence-Informed Recommendations and In* — Child Adolesc Psychiatr Clin N Am 2020. The cited title and year correspond exactly to a real paper, although the citation gives no author or journal. |

### `04_Acute_and_Safety/Agitation_and_Restraint/agitation_restraint_inpatient_teaching.md` — **safetyKit surface (`agitation.md`)**

6 citations — 2 VERIFIED / 2 MISATTRIBUTED / 0 NOT_FOUND / 2 UNCHECKED

| Citation as published | Verdict | What PubMed actually has |
|---|---|---|
| Richmond (2012) — *Journal of the American Psychiatric Nurses Assoc* | MISATTRIBUTED **[page also expands BETA as 'Behavioral Emergency Team Approach'; the real expansion is 'Best practices in Evaluation and Treatment of Agitation']** | PMID 22461917 — *Verbal De-escalation of the Agitated Patient: Consensus Statement of the America* — West J Emerg Med 2012. The Project BETA de-escalation consensus statement is real (Richmond JS et al., 2012) but published in the Western Journal of Emergency Medicine, not the Journal of the A |
| Wilson (2012) — *Canadian Journal of Psychiatry* | MISATTRIBUTED | PMID 22461918 — *The psychopharmacology of agitation: consensus statement of the American Associa* — West J Emerg Med 2012. Wilson MP 2012 is real but in the Western Journal of Emergency Medicine (the Project BETA psychopharmacology statement), not the Canadian Journal of Psychiatry. |
| Singal (2024) — *Psychiatric Services* | VERIFIED | PMID 37855100 — *Race-Based Disparities in the Frequency and Duration of Restraint Use in a Psych* — Psychiatr Serv 2024. Author, year, journal and topic all match. |
| Smith (2022) — *Psychiatric Services* | VERIFIED | PMID 34932385 — *Association of Black Race With Physical and Chemical Restraint Use Among Patient* — Psychiatr Serv 2022. Author, year, journal and topic all match. |
| Linehan MM (1993) — *Cognitive-Behavioral Treatment of Borderline Per* | UNCHECKED | Book. Year 1993 is correct for Linehan's DBT treatment manual. |
| van der Kolk (2014) — *The Body Keeps the Score: Brain, Mind, and Body * | UNCHECKED | Book with ISBN. Year 2014 and ISBN are consistent with the real edition. |

### `14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/consult_capacity_delirium_catatonia_withdrawal.md` — **safetyKit surface (`exp_consult.md`)**

7 citations — 2 VERIFIED / 2 MISATTRIBUTED / 1 NOT_FOUND / 2 UNCHECKED

| Citation as published | Verdict | What PubMed actually has |
|---|---|---|
| Appelbaum PS (2007) — *The New England Journal of Medicine* | VERIFIED | PMID 17978292 — *Clinical practice. Assessment of patients' competence to consent to treatment.* — N Engl J Med 2007. Author, year, journal and topic all match (the four-abilities model). |
| Kennedy GJ (2014) — *no journal cited* | MISATTRIBUTED | PMID 12134464 — *The importance of executive deficits. Assessing the older patient's capacity to * — Geriatrics 2002. No Kennedy GJ 2014 paper on capacity in older adults; his 10 records in 2013-2015 are in unrelated fields. The geriatric-psychiatry paper matching this claim is Kennedy G |
| NICE CG103 (2010) — *no journal cited* | UNCHECKED | NICE guideline, grey literature. CG103 (delirium) is indeed 2010; nothing visibly wrong. |
| British Association for Psychopharmacology (2023) — *no journal cited* | UNCHECKED | Professional-society consensus guideline, grey. BAP catatonia guidance was published in 2023; nothing visibly wrong. |
| McKeon A (2016) — *no journal cited* | MISATTRIBUTED | PMID 17986499 — *The alcohol withdrawal syndrome.* — J Neurol Neurosurg Psychiatry 2008. McKeon A has zero PubMed records in 2015-2017 on alcohol/Wernicke/thiamine. The real paper is 'The alcohol withdrawal syndrome', J Neurol Neurosurg Psychiatry 2008. |
| Rudd RA (2016) — *no journal cited* | VERIFIED | PMID 28033313 — *Increases in Drug and Opioid-Involved Overdose Deaths - United States, 2010-2015* — MMWR Morb Mortal Wkly Rep 2016. Author, year and topic match (no journal was cited). |
| Reuland R (2016) — *no journal cited* | NOT_FOUND **[author pair does not resolve in PubMed]** | A search for Reuland on mental health courts / diversion / police returned 0 PubMed records. No paper by Reuland & Schwarzfeld 2016 is indexed. |

### `14_Tracks/MS3/Student_Ready_Pack/04_expansion_modules/family_discharge_student_module.md`

4 citations — 3 VERIFIED / 0 MISATTRIBUTED / 0 NOT_FOUND / 1 UNCHECKED

| Citation as published | Verdict | What PubMed actually has |
|---|---|---|
| Chung (2017) — *JAMA Psychiatry* | VERIFIED | PMID 28564699 — *Suicide Rates After Discharge From Psychiatric Facilities: A Systematic Review a* — JAMA Psychiatry 2017. Author, year, journal and topic all match. |
| Chung (2019) — *BMJ Open* | VERIFIED | PMID 30904843 — *Meta-analysis of suicide rates in the first week and the first month after psych* — BMJ Open 2019. Author, year, journal and topic all match. |
| Boggs (2020) — *no journal cited* | VERIFIED | PMID 32040838 — *A Quasi-Experimental Analysis of Lethal Means Assessment and Risk for Subsequent* — J Gen Intern Med 2020. Author, year and topic match, including the quasi-experimental design and lethal-means focus (no journal was cited). |
| Stanley (2012) — *no journal cited* | UNCHECKED **[quoted title does not match the real paper's title]** | PMID 29998307 — *Comparison of the Safety Planning Intervention With Follow-up vs Usual Care of S* — JAMA Psychiatry 2018. The Safety Planning Intervention paper (Stanley & Brown 2012) is in Cognitive and Behavioral Practice, which PubMed does not index, so it cannot be confirmed here. The au |

### `14_Tracks/MS3/Student_Ready_Pack/05_documentation_oral_presentation/student_documentation_and_oral_presentations.md`

10 citations — 2 VERIFIED / 4 MISATTRIBUTED / 1 NOT_FOUND / 3 UNCHECKED

| Citation as published | Verdict | What PubMed actually has |
|---|---|---|
| Doran KM (2014) — *American Journal of Psychiatry* | NOT_FOUND | PMID 23929401 — *The revolving hospital door: hospital readmissions among patients who are homele* — Med Care 2013. No Doran KM 2014 American Journal of Psychiatry paper. Her 2013-2015 records are on homelessness and ED use, in J Health Care Poor Underserved, Medical Care and Am J Emer |
| American Psychiatric Association (2015) — *no journal cited* | UNCHECKED **[wrong year for DSM-5]** | DSM-5, grey. The year is wrong: DSM-5 was published in 2013, not 2015 (and the same manual is cited as 2013 in PR #672, so the two PRs disagree with each other). |
| Solet JM (2005) — *Joint Commission Journal on Quality and Patient * | MISATTRIBUTED **[first-author initials belong to a different researcher]** | PMID 16306279 — *Lost in translation: challenges and opportunities in physician-to-physician comm* — Acad Med 2005. The real handoff paper is Solet DJ, Norvell JM, Rutan GH, Frankel RM, Academic Medicine 2005 — not the Joint Commission Journal, and the first author's initials are DJ, n |
| Summers WK (2016) — *Journal of Psychiatric Practice* | MISATTRIBUTED **[wrong author initials; cited author works in an unrelated field]** | PMID 12647568 — *The psychodynamic formulation updated.* — Am J Psychother 2003. Summers WK is a tacrine/Alzheimer's researcher with no 2016 Journal of Psychiatric Practice paper (that journal+year+author search returned 0). The psychiatric-formulatio |
| McWilliams N (2011) — *Psychoanalytic Diagnosis Revised Ed* | UNCHECKED | Book. 'Psychoanalytic Diagnosis' 2nd edition, 2011 — consistent. |
| Halmi KA (2015) — *no journal cited* | MISATTRIBUTED **[author's field unrelated to the claim]** | PMID 25250660 — *Comparison of 2 family therapies for adolescent anorexia nervosa: a randomized p* — JAMA Psychiatry 2014. Halmi KA is an eating-disorders researcher; her 2014-2016 records are anorexia-nervosa genetics and family therapy. Nothing matches the cited general differential-diagnos |
| Rudd MD (2006) — *Suicide and Life-Threatening Behavior* | VERIFIED | PMID 16805653 — *Warning signs for suicide: theory, research, and clinical applications.* — Suicide Life Threat Behav 2006. Author, year and journal match, and the topic (suicide warning signs, i.e. acute vs chronic risk) matches the claim. |
| Trzepacz PT (1993) — *Psychiatric Annals* | MISATTRIBUTED | PMID 7843576 — *A review of delirium assessment instruments.* — Gen Hosp Psychiatry 1994. No Trzepacz & Baker 1993 article in Psychiatric Annals; Trzepacz's 1992-1994 indexed papers are in Psychosomatics and General Hospital Psychiatry. The 1993 Trzepacz-Baker |
| Epstein RM (2002) — *JAMA* | VERIFIED | PMID 11779266 — *Defining and assessing professional competence.* — JAMA 2002. Author, year, journal and topic all match. |
| Morrison J (2014) — *Diagnosis Made Easier Revised* | UNCHECKED | Book with ISBN. 'Diagnosis Made Easier' 2nd edition, 2014 — consistent. |

---

## Summary by PR

| PR | VERIFIED | MISATTRIBUTED | NOT_FOUND | UNCHECKED | Total |
|---|---|---|---|---|---|
| PR #672 (Phase 4A, commit 8b8ccd9) | 4 | 34 | 9 | 8 | 55 |
| PR #640 (Phase 1 & 2, commit 0009ad6) | 10 | 8 | 2 | 10 | 30 |
| **Both** | **14** | **42** | **11** | **18** | **85** |

> Of the 74 PubMed-checkable citations, **14 (19%) are VERIFIED**. 42 are MISATTRIBUTED and 11 are NOT_FOUND — 53 of 74 (72%) misdescribe or invent their source.

---

## safetyKit high-risk surfaces

These pages are governed by `curriculum.json`'s `safetyKit` array and must hold `facultyReview.status = 'reviewed'`. Both PRs added citations to four of them.

| Page | safetyKit ledger key | PR | VERIFIED | MISATTRIBUTED | NOT_FOUND | UNCHECKED |
|---|---|---|---|---|---|---|
| `delirium_inpatient_teaching.md` | `delirium.md` | #672 | 2 | 17 | 1 | 2 |
| `substance_use_inpatient_teaching.md` | `t_sud.md` | #672 | 1 | 9 | 1 | 4 |
| `consult_capacity_delirium_catatonia_withdrawal.md` | `exp_consult.md` | #672 | 0 | 3 | 1 | 0 |
| `consult_capacity_delirium_catatonia_withdrawal.md` | `exp_consult.md` | #640 | 2 | 2 | 1 | 2 |
| `agitation_restraint_inpatient_teaching.md` | `agitation.md` | #640 | 2 | 2 | 0 | 2 |
| **All safetyKit surfaces** |  |  | **7** | **33** | **4** | **10** |

**37 of the 54 citations added to safetyKit pages are MISATTRIBUTED or NOT_FOUND.**

---

## Red-flag features independent of the API

| Citation | File | Flag |
|---|---|---|
| Caplan PJ (2007) — *The Myth of Women's Masochism* | `case_formulation_inpatient_teaching.md` | cited year 2007 vs real 1984/1985 |
| Ackerman-Barger K (2019) — *Journal of the American Psychiatric Association* | `case_formulation_inpatient_teaching.md` | 'Journal of the American Psychiatric Association' is not a real journal |
| Ackerman-Barger K (2019) — *Journal of the American Psychiatric Association* | `case_formulation_inpatient_teaching.md` | co-author 'Moss, J.' is the site owner's own name |
| Pierce CM (1974) — *Journal of the National Medical Association* | `case_formulation_inpatient_teaching.md` | different Pierce (HE vs CM) |
| Hogan AM (2020) — *Frontiers in Psychiatry* | `medical_workup_inpatient_teaching.md` | 6-author string (Dillon, Owens, Kilcourse, Monahan, Boyd) does not resolve to any real paper |
| Hinds PS (2011) — *Journal of Clinical Nursing* | `medical_workup_inpatient_teaching.md` | author's field (pediatric oncology nursing) unrelated to the claim |
| Singal AG (2012) — *American Journal of Gastroenterology* | `medical_workup_inpatient_teaching.md` | hepatology author team cited for a thyroid/endocrine claim |
| DiClemente CC (2003) — *Addiction: Comprehensive Guidebook* | `substance_use_inpatient_teaching.md` | book title likely conflated |
| Singal AG (2023) — *American Journal of Psychiatry* | `substance_use_inpatient_teaching.md` | hepatology author cited for an addiction-psychiatry claim |
| SAMHSA (2014) — *TIP 41: Substance Abuse Treatment: Group Therapy* | `substance_use_inpatient_teaching.md` | TIP number does not match the cited content or year |
| Ely EW (2001) — *Critical Care Medicine* | `delirium_inpatient_teaching.md` | real paper, fabricated finding attached to it |
| Trzepacz PT (2022) — *The Delirium Superbook* | `delirium_inpatient_teaching.md` | book title 'The Delirium Superbook' not identifiable |
| Fernandez A (2011) — *JAMA Internal Medicine* | `student_documentation_and_oral_presentations.md` | cited journal did not exist in the cited year |
| Basit SA (2020) — *Journal of the American Psychiatric Association* | `student_documentation_and_oral_presentations.md` | 'Journal of the American Psychiatric Association' is not a real journal |
| For students interested in depth-oriented formulation: the PDM-5 (2018) — *no journal cited* | `case_formulation_inpatient_teaching.md` | nonexistent manual name |
| Richmond (2012) — *Journal of the American Psychiatric Nurses Assoc* | `agitation_restraint_inpatient_teaching.md` | page also expands BETA as 'Behavioral Emergency Team Approach'; the real expansion is 'Best practices in Evaluation and Treatment of Agitation' |
| Reuland R (2016) — *no journal cited* | `consult_capacity_delirium_catatonia_withdrawal.md` | author pair does not resolve in PubMed |
| Stanley (2012) — *no journal cited* | `family_discharge_student_module.md` | quoted title does not match the real paper's title |
| American Psychiatric Association (2015) — *no journal cited* | `student_documentation_and_oral_presentations.md` | wrong year for DSM-5 |
| Solet JM (2005) — *Joint Commission Journal on Quality and Patient * | `student_documentation_and_oral_presentations.md` | first-author initials belong to a different researcher |
| Summers WK (2016) — *Journal of Psychiatric Practice* | `student_documentation_and_oral_presentations.md` | wrong author initials; cited author works in an unrelated field |
| Halmi KA (2015) — *no journal cited* | `student_documentation_and_oral_presentations.md` | author's field unrelated to the claim |
