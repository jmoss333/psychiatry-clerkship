# APA Public Resource Download Set

Date: 2026-06-29  
Scope: Official American Psychiatric Association public document files discovered from selected sitemap areas relevant to the psychiatry clerkship library.

## What Was Downloaded

- 419 official APA pages crawled from relevant sitemap areas.
- 362 direct document candidates identified.
- 353 manifest rows downloaded.
- 348 unique local files saved.
- Approximate file size: 299 MB.

Main file location:

- `files/`

Main metadata:

- `metadata/manifest.csv` — every downloaded row, source page, source link text, final URL, local path, size, SHA-256.
- `metadata/categorized_manifest.csv` — same manifest with curriculum-facing categories added.
- `metadata/skipped.csv` — 9 skipped/non-document or dead-link items.
- `metadata/crawled_pages.txt` — all sitemap pages crawled.
- `metadata/apa_learning_center_visible_catalog.json` — visible APA Learning Center catalog entries from Chrome; course pages only, not course content.
- `metadata/summary.txt` — raw downloader counts.

## Category Counts

| Category | Files/Rows |
|---|---:|
| DSM assessment measures | 131 |
| DSM fact sheets and diagnostic education | 42 |
| Medical student and resident development | 33 |
| Diversity, culture, and equity | 30 |
| Spanish patient and family education | 22 |
| Collaborative and integrated care | 22 |
| Perinatal mental health | 9 |
| Telepsychiatry and digital care | 9 |
| APA clinical practice guideline materials | 8 |
| Patient and family education | 7 |
| Other APA public document | 40 |

## High-Yield Examples

### Acute / consult expansion

- Delirium guideline training slides: `files/df318943fd_APA-Delirium-Training-Slides.pptx`
- DSM-5-TR Delirium fact sheet: `files/270b7fbae5_APA-DSM5TR-Delirium.pdf`
- Alcohol use disorder guideline training slides: `files/ed041bb0d7_APA-AUD-Clinical-Practice-Guidelines-Training-Slides.pptx`
- Schizophrenia guideline training slides: `files/161a4fad65_APA-Schizophrenia-Clinical-Practice-Guidelines-Training-Slides.pptx`

### Interview / MSE / assessment

- DSM-5-TR Level 1 adult cross-cutting measure: `files/260bb4400e_APA-DSM5TR-Level1MeasureAdult.pdf`
- DSM-5-TR Level 1 child/adolescent measure: `files/3725307d41_APA-DSM5TR-Level1MeasureChildAge11To17.pdf`
- WHODAS 2.0 self-administered: `files/9c82f1548b_APA-DSM5TR-WHODAS2SelfAdministered.pdf`
- DSM-5-TR Cultural Formulation Interview: `files/fc42b3bcdc_APA-DSM5TR-CulturalFormulationInterview.pdf`

### Patient/family and Spanish-language resources

- Dementia patient/caregiver antipsychotic guide: `files/66be7c4af8_APA-Dementia-Patient-and-Caregiver-Guide.pdf`
- Addiction top 10 public guide: `files/97b9474176_Addiction-Top-10-Public-FINAL.pdf`
- Spanish depression handout: `files/93ca47443a_depresion-folleto.pdf`
- Spanish suicide/self-harm handout: `files/eff17337c8_suicidio-folleto.pdf`
- Spanish opioid handout: `files/4808dd0791_6-3-24-Opioids-Handout-Spanish.pdf`

### Implementation guides

- Collaborative Care one-pager: `files/b477660852_CCM-for-MH-One-Pager.pdf`
- Collaborative Care slide deck: `files/ee09989b71_Integration-of-Mental-Health-Into-Primary-Care-The-Collaborative-Care-Model.pptx`
- Perinatal Collaborative Care guide: `files/d15631060f_APA-Treating-Perinatal-in-the-CoCM-Guide.pdf`
- Digital Mental Health 101 quick-start brief: `files/f16868bbb1_APA-Digital-Mental-Health-101-One-Pager.pdf`
- Videoconferencing-based telemental health best practices: `files/afa328b7c2_APA-ATA-Best-Practices-in-Videoconferencing-Based-Telemental-Health.pdf`

### MS3 / resident development

- APA Roadmap to Psychiatric Residency: `files/142b8a2772_APA-Roadmap-to-Psychiatric-Residency.pdf`
- Building a Career in Psychiatry, Part 1: `files/96203f84bf_Building_A_Career_In_Psychiatry_Part1.pdf`
- Building a Career in Psychiatry, Part 2: `files/4d96415920_Building_A_Career_In_Psychiatry_Part2.pdf`

## What Was Not Downloaded

- PsychiatryOnline books, journals, and practice guideline full text were not downloaded. Chrome hit Cloudflare verification on PsychiatryOnline, and bulk mirroring books/journals would not be appropriate.
- APA Learning Center course videos/modules were not downloaded. The visible catalog was saved as metadata only. Course materials should be downloaded manually only when a course clearly exposes a downloadable handout or slide file after enrollment.
- Images were skipped unless they were embedded in downloaded PDFs/PPTX files.
- Broken APA document links were recorded in `metadata/skipped.csv`.

## Plain-English Note

The downloader collected public APA files that are clearly offered as documents, then wrote a manifest so you can trace every file back to the official APA page. It did not copy protected books, journal articles, or course videos.
