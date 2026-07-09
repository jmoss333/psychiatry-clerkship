# Adobe for Creativity Utilization Brainstorm

Date: 2026-07-08
Repo: Psychiatry Clerkship Library

## Plain-language summary

Adobe should be the production layer, not the curriculum source. The repo should continue to hold the canonical Markdown, HTML tools, JSON question bank, videos, indexes, and attestation records. Adobe can turn those source materials into polished PDFs, flyers, posters, thumbnails, short videos, and platform-specific media exports.

## What the repo already has

- A six-week MS3 psychiatry curriculum in `01_Six_Week_Curriculum/`.
- Interactive teaching tools in single-file HTML modules across clinical skills, acute safety, and prototypes.
- Structured curriculum data in `topic_meta.json`, `question_bank.json`, `_MASTER_INDEX.xlsx`, and fill manifests.
- Audience overlays in `14_Tracks/`, including an MS3 student-ready pack and resident-facing materials.
- Existing video prototypes and video handoff files in `_prototypes/video-library/`, `_prototypes/orientation-video/`, and `13_Faculty_Resources/Handoffs/Clerkship_video_handoff/`.
- Faculty review and attestation surfaces in `13_Faculty_Resources/`.

## Adobe capability map

| Adobe capability | Repo fit | Practical output |
|---|---|---|
| InDesign data merge / PDF generation | Strong | Weekly packets, pocket cards, OSCE packets, certificates, faculty checklists |
| Adobe Express templates | Strong | Orientation posters, QR signage, journal club flyers, patient/family one-pagers |
| Quick Cut video editing | Strong | Orientation trailer cuts, day-in-the-life clips, tool spotlight reels |
| Social/media resizing | Strong | 16:9 web videos, 9:16 mobile clips, thumbnails, poster frames, LMS/social variants |
| Batch photo editing | Conditional | Cohesive faculty headshots, site images, event photos, if the repo later adds original photography |
| Portrait retouching | Low/conditional | Faculty bios only if real headshots are intentionally added and approved |

## Three viable approaches

### 1. Learner packet production pipeline

Create polished learner PDFs from existing repo sources. The first candidates are weekly MS3 packets, pocket cards, OSCE station packets, and shelf-prep handouts. Data can come from Markdown, `topic_meta.json`, `question_bank.json`, or a generated CSV.

Strengths: high educational value, works with current repo structure, keeps source-of-truth discipline.

Risks: requires a stable template and clear rules for what content is safe to export. Local-policy and clinical claims still need attestation.

### 2. Orientation and media production pipeline

Use Adobe video tools to produce polished variations of the existing orientation and video-library assets. Outputs could include a 30-60 second trailer, 9:16 mobile clips, 16:9 web embeds, thumbnails, and poster frames.

Strengths: the repo already has source videos, captions/transcripts, and video handoff material.

Risks: generated media must preserve accessibility with captions/transcripts and must not imply local policy unless reviewed.

### 3. Visual communications kit

Use Adobe Express templates to create consistent rotation-facing visuals: QR posters, student onboarding one-pagers, journal club flyers, faculty teaching prompts, and patient/family education covers.

Strengths: fast, visible polish; good for clerkship adoption and day-one orientation.

Risks: lower structural value than packets or media. Templates can drift from the repo unless outputs are catalogued and regenerated from canonical copy.

## Recommendation

Start with Approach 1: the learner packet production pipeline. It provides the best balance of accuracy, efficiency, and educational value. The repo already has the structured content needed to feed a template, and the output would directly support the six-week clerkship.

The first concrete project should be:

> Generate an MS3 Week Packet and Pocket Card set from repo-owned Markdown/JSON/CSV into Adobe/InDesign PDF templates.

## Proposed first deliverables

1. Week 1 packet: foundations, daily workflow, interviewing, MSE, formulation, and safety escalation.
2. Pocket cards: Interview/MSE, formulation/DDx, agitation ladder, capacity, delirium/catatonia, CIWA/COWS.
3. OSCE station packet: student prompt, examiner checklist, feedback rubric, and faculty answer key.
4. Orientation media kit: 16:9 trailer, 9:16 mobile cut, poster frame, captioned embed package.
5. QR poster set: "Start Here", "Interactive Tools", "Shelf/OSCE Prep", and "Emergency/Safety Tools".

## Guardrails

- No PHI or patient-identifiable media.
- Repo files remain canonical; Adobe outputs are generated or catalogued artifacts.
- Do not duplicate copyrighted third-party content into Adobe outputs unless licensing permits it.
- Local-policy material should remain visibly marked as local/unverified until attested.
- Clinical education assets need faculty review before learner-facing use.
- Videos require captions/transcripts and accessible embeds.

## Suggested implementation shape

1. Create a small export script that turns selected repo metadata into CSV/JSON for Adobe data merge.
2. Define one Adobe/InDesign template family for MS3 handouts and pocket cards.
3. Generate the first Week 1 packet from repo sources.
4. Save generated outputs under a clearly marked generated-artifacts location, not as canonical curriculum.
5. Add a manifest entry describing source files, generated outputs, review status, and regeneration date.

## Not recommended yet

- Using Adobe as the primary authoring environment for curriculum.
- Uploading large portions of copyrighted PDFs or textbook-derived content into generated packets.
- Producing patient-facing materials without explicit review and local approval.
- Investing first in faculty headshot or portrait workflows; the repo has higher-yield curriculum production needs.

