# Attending-Curated Rotation Editions — Design

**Date:** 2026-08-19

**Status:** Approved in conversation; written specification awaiting final user review

**Scope:** Account-free attending curation, audience-correct student edition links, local orientation overlays, immutable edition identity, and privacy-safe browser-local state

## Purpose

Make the clerkship platform portable across attendings and training locations without forking the reviewed clinical curriculum.

An attending should be able to arrange the existing MS3 or resident learning path, add bounded local orientation, preview the result as a student, and share one immutable edition link. The student continues to use the existing MS3 or resident site. The link carries only a small configuration overlay; it does not create a duplicate site or frozen copy of clinical content.

The first release is intentionally account-free and one-way:

- no curator account or server-side database;
- no student account, identity, analytics, or automatic reporting;
- no editing of reviewed clinical content;
- no file uploads or executable local content; and
- no claim that the curator's identity is digitally verified.

## Product model

The system has three distinct layers:

1. **Reviewed core** — centrally maintained clinical resources, tools, audience-specific paths, safety surfaces, and governance metadata.
2. **Rotation edition** — an attending's selection, ordering, local priority labels, local orientation, and external institutional links.
3. **Learner state** — completion, practice, plans, and local checklist state stored only in that learner's browser.

The layers must not silently overwrite each other. A rotation edition may arrange the Path, but it may not change the Library's clinical text, governance, attestation, Safety Kit, Single Safety Rule, PHI rules, supervision boundaries, or escalation language.

The current audience builds remain authoritative:

| Student destination | Canonical path | Duration |
|---|---|---:|
| MS3 site | `ms3-six-week` | 6 weeks |
| Resident site | `resident-four-week` | 4 weeks |

The curator is a faculty-facing route shipped from this repository and build system, not a third clinical-content site. A faculty entry point may offer MS3 and resident destinations, but each destination opens the builder on that audience's actual site. Once there, the audience and canonical path are locked, and generated links use that page's `location.origin`. This preserves production and deploy-preview isolation: an MS3 preview cannot accidentally generate a production or resident edition link, and one builder never needs the other audience's private build projection.

## Problem statement

Site-specific details such as arrival instructions, rounds workflow, access preparation, documentation expectations, and feedback processes do not belong in a universal clerkship orientation. Hard-coding one location's details would make the application less adoptable and would invite stale or contradictory local guidance.

The actual missing capability is a governed local configuration layer. It must be easy enough for a nontechnical attending to use, while protecting the clinical source of truth and making the difference between core and local guidance unmistakable to trainees.

## Goals

1. Let another attending create a usable local edition without editing repository files or receiving technical assistance.
2. Preserve the exact four-week resident and six-week MS3 duration contracts already present in `curriculum.json`.
3. Keep reviewed clinical content centrally updateable after an edition is created.
4. Give the attending and student a simple way to confirm that they are viewing the same edition.
5. Keep all learner activity on the learner's device.
6. Fail safely when an edition link is malformed, incompatible, oversized, or opened on the wrong audience site.
7. Keep first-day actions easy to find on mobile.

## Non-goals for the first release

- Authenticated faculty profiles or institution-verified identity
- Server-side saving, short links, revocation, or an edition-management dashboard
- Student rosters, assignments, completion reporting, evaluation, or messaging
- Student submission of reflections or other content
- Editing, copying, or freezing clinical teaching pages
- Uploading documents, images, audio, video, or arbitrary HTML
- Embedding local protocols or clinical directives as free text
- Automatic expiration of an edition
- A separate deployed site for each attending, cohort, or training location
- A new multi-tenant backend

## Curator workflow

The approved interface is a five-step guided builder.

### Step 1 — Edition

The curator selects the audience entry point and provides:

- edition title;
- training-location display name;
- short location code;
- curator display name;
- curator professional role;
- rotation start and end dates;
- informational last-verified date; and
- edition number, assigned automatically.

A new configuration starts at Edition 1. Importing or cloning an existing edition prepares the next edition number. Regenerating an unchanged configuration preserves its number and fingerprint. Any student-visible edit marks the draft as changed; publication then creates the next number, link, and fingerprint.

There is no automatic expiration. Rotation dates and the last-verified date remain visible information only.

### Step 2 — Curriculum

The builder begins from the active site's projected path. The curator may:

- include or omit a core resource from the curated Path;
- add another resource already available in that site's Library;
- label an item `required`, `recommended`, or `optional`; and
- add a short, plain-text “Why I selected this” rationale.

`required` means required by this local rotation. It must never imply a universal clerkship, institutional, licensing, or clinical requirement unless that authority is separately established.

Omitting a resource removes it only from the curated Path. It remains available in the site's Library. The builder has no controls that can suppress or relabel the global Safety Kit, Single Safety Rule, PHI guidance, supervision boundaries, or escalation instructions.

### Step 3 — Schedule

The curator may reorder selected items and move them between valid weeks. The builder may display drag handles, but every action must also be available through keyboard-accessible `Move up`, `Move down`, and `Move to week` controls.

The selected site fixes the valid week range:

- MS3: Weeks 1–6
- Resident: Weeks 1–4

The editor cannot create an additional week, change the path duration, or place an item outside that range.

### Step 4 — Local details

The curator may add bounded, plain-text local orientation and HTTPS links. The desktop interface keeps a sticky student preview beside the editor. Mobile uses a persistent Preview toggle rather than compressing two columns.

The allowed local fields are:

- first-day arrival guidance;
- typical daily schedule;
- rounds workflow;
- presentation expectations;
- documentation expectations;
- attendance expectations;
- feedback process;
- instructions for how to obtain approved institutional access or training;
- role-based contact labels with an institutional-directory HTTPS link;
- a first-day checklist; and
- local external resources.

Each local resource contains a title, HTTPS URL, local priority, and optional selection rationale. It is always labeled `Attending-provided local resource` in the student experience.

The first release does not accept direct email addresses, phone numbers, pager numbers, passwords, passcodes, door codes, private access instructions, local clinical directives, medication doses, or free-text local protocols. An official local clinical protocol may be linked only through an HTTPS institutional source and remains labeled local guidance.

### Step 5 — Preview and share

The final step shows the complete student experience and requires a public-link review. The curator must affirm that:

1. the edition contains no PHI, learner data, evaluations, credentials, private contact details, or access codes;
2. linked local clinical protocols are official HTTPS institutional sources;
3. the desktop and mobile student previews were reviewed; and
4. anyone may forward the account-free link and the edition cannot be revoked by the curator.

The curator may add a short `What changed in this edition?` note.

Successful generation provides:

- the immutable student link;
- a copy action;
- a downloadable JSON backup;
- a QR code when the final URL is within the tested scan limit;
- the edition fingerprint; and
- the current core-library revision.

Any later edit produces a new edition. Older links remain functional.

## Student workflow

1. The student opens the edition link without an account or import step.
2. The app decodes and validates the entire configuration before applying any part of it.
3. A first-time learner receives the valid edition automatically.
4. A learner who already has a different edition sees both fingerprints and confirms before switching.
5. The Start Here surface displays a compact, expandable edition card without pushing first-day actions below the mobile fold.
6. The Path reflects the attending's selection, order, local priority, and valid weekly schedule.
7. The Library continues to expose the complete audience-correct core collection.
8. Local resources and orientation remain visibly distinct from reviewed core content.
9. Learner progress and local checklist state remain browser-local.

Opening an older valid link must not silently replace the currently selected edition. The same comparison and confirmation flow applies.

## Edition card

The compact card displays:

- training location;
- audience and duration;
- rotation dates;
- curator display name and professional role;
- edition number;
- informational last-verified date;
- edition fingerprint;
- current core-library revision; and
- `Locally curated — identity not digitally verified`.

Expanded details show the optional change note, the configuration's original core revision, the distinction between local and core guidance, and a concise explanation of the fingerprint.

The card must not imply institutional approval, faculty attestation of the local edition, or cryptographic proof of authorship.

## Configuration model

The edition is a versioned JSON envelope. The exact schema is validated with `additionalProperties: false` at every object boundary.

```json
{
  "format": "cw-rotation-edition",
  "schemaVersion": 1,
  "config": {
    "audience": "ms3",
    "pathId": "ms3-six-week",
    "editionNumber": 3,
    "createdAgainstCoreRevision": "503b42d",
    "card": {
      "title": "BHU2 MS3 Rotation",
      "locationName": "BHU2",
      "locationCode": "BHU2",
      "curatorName": "Joshua Moss, MD",
      "curatorRole": "Attending psychiatrist",
      "rotationStart": "2026-08-24",
      "rotationEnd": "2026-10-02",
      "lastVerified": "2026-08-19"
    },
    "pathItems": [
      {
        "instanceId": "core:pg_interview.md:1",
        "ref": "pg_interview.md",
        "week": 1,
        "order": 1,
        "priority": "required",
        "rationale": "Use this structure for the first supervised interview."
      }
    ],
    "localOrientation": {
      "firstDayArrival": "Meet in the unit workroom at 7:45 AM.",
      "dailySchedule": "",
      "roundsWorkflow": "",
      "presentationExpectations": "",
      "documentationExpectations": "",
      "attendanceExpectations": "",
      "feedbackProcess": "",
      "accessPreparation": "Complete the institution's approved EHR training before Day 1.",
      "contacts": [
        {
          "role": "Clerkship coordinator",
          "directoryUrl": "https://institution.example/directory"
        }
      ],
      "checklist": [
        {
          "id": "local:first-day:1",
          "label": "Confirm required institutional access",
          "priority": "required"
        }
      ],
      "resources": [
        {
          "id": "local:resource:1",
          "title": "Local documentation policy",
          "url": "https://institution.example/policy",
          "priority": "recommended",
          "week": 1,
          "rationale": "Review before writing the first supervised note."
        }
      ]
    },
    "changeNote": "Moved the MSE guide to Week 1 and added the local rounds workflow."
  },
  "digest": "sha256-LcpaRhETF-u-cRGkRpzecudJxloVk8zsFAEIdURAozo"
}
```

The example uses synthetic domains and contains no operational access details. Its digest is illustrative; a real envelope always contains the digest calculated from that envelope's canonical pre-digest bytes.

### Configuration rules

- `audience` is exactly `ms3` or `resident`.
- `pathId` must match the path projected into the current build.
- `week` is an integer within that path's exact week range.
- Every core `ref` must exist in the current site's final catalog and Library.
- `instanceId` distinguishes deliberate repeated placements of one core ref; core progress still uses `ref`.
- `priority` is exactly `required`, `recommended`, or `optional`.
- Titles are at most 100 characters.
- Rationale and change-note fields are at most 280 characters.
- Each structured orientation text field is at most 600 characters.
- The edition may contain at most 24 local checklist items and 12 local resources.
- URLs are at most 2,048 characters and must use `https:`.
- Location codes normalize to 2–8 uppercase ASCII letters or digits.
- Dates use `YYYY-MM-DD`; the end date may not precede the start date.
- Plain-text fields reject control characters and are always rendered through text APIs or existing escaping helpers.
- No field accepts HTML, Markdown execution, CSS, JavaScript, data URLs, event attributes, or embedded forms.

The configuration is a complete curated Path overlay rather than a copy of resource content. If the canonical default placement changes later, a valid edition retains its selected refs and schedule while opening the latest reviewed resource bodies.

## Encoding, integrity, and fingerprint

The encoder performs these deterministic steps:

1. Validate the configuration.
2. Normalize strings and location code.
3. Sort object keys recursively while preserving semantically ordered arrays.
4. Serialize compact canonical UTF-8 JSON for `format`, `schemaVersion`, and `config`.
5. Calculate SHA-256 with the browser Web Crypto API.
6. Store the full base64url digest in the envelope.
7. Serialize the complete envelope and encode it as unpadded base64url in the URL fragment as `#edition=<payload>`.

Version 1 uses no compression. This keeps decoding auditable and avoids a compression dependency or decompression-bomb surface. A future compressed format must use a new schema/encoding version.

The displayed fingerprint is:

```text
{LOCATION_CODE}-{AUDIENCE_CODE}-{FIRST_30_DIGEST_BITS_AS_CROCKFORD_BASE32}
```

Examples:

- `BHU2-MS3-4F7C2Q`
- `MMC-RES-91K6TX`

The six-character token reduces accidental collisions but is not a security signature. The digest detects corruption of the encoded payload; it does not prove authorship because anyone can create a new valid configuration and digest.

Size limits:

- decoded canonical configuration: at most 12 KiB;
- final encoded URL: at most 16,000 characters; and
- QR generation: only when the complete URL is at most 1,800 characters.

An edition over the QR limit still receives a link and backup. An edition over the final URL limit cannot be published until reduced.

The fragment is not intentionally sent to the hosting server or telemetry. The interface nevertheless warns that browser history, clipboard tools, extensions, screenshots, recipients, and forwarded messages can expose it.

## Core revision

The edition fingerprint identifies the curation configuration, not a frozen clinical-content snapshot.

The student card separately shows the current build's source revision using the same repository revision already emitted for build governance. The configuration also records `createdAgainstCoreRevision` for troubleshooting. When reviewed clinical content changes:

- the edition fingerprint remains stable;
- the card's current core revision changes; and
- selected refs open the latest reviewed content.

The application must never preserve an outdated clinical page solely to keep an old edition visually identical.

## Browser-local storage

All new keys follow the shared-shell `cw_*` namespace:

| Key | Purpose |
|---|---|
| `cw_curator_draft_v1` | One device-local curator draft; never read by the student experience |
| `cw_rotation_edition_v1` | The learner's currently accepted validated edition envelope |
| `cw_rotation_local_progress_v1` | Local checklist/resource completion keyed by edition fingerprint |

Existing keys retain their current ownership:

- `cw_progress_v1` continues to record core-resource completion by stable ref.
- `cw_pretest_v1` and `cw_qb_v1` remain unchanged.
- `cw_plan_v1` adds the active edition fingerprint to its compatibility contract.

Accepting a different edition may regenerate only the derived `cw_plan_v1` and edition-scoped local state. It must preserve `cw_progress_v1`, `cw_pretest_v1`, `cw_qb_v1`, and unrelated storage. Opening the same edition causes no storage churn. Rejecting or failing to validate an edition causes no writes.

## Runtime projection

The existing build continues to emit exactly one audience path. The browser applies a validated edition after `fdBuildIndex()` creates the audience-correct index and before Today, Path, dates, progress summaries, or placement plans consume that index.

The edition projector is pure:

```text
projectEdition(canonicalIndex, validatedEdition) -> projectedIndex
```

It may change only:

- Path item membership;
- valid-week placement and order;
- local priority and rationale metadata; and
- local orientation/resources exposed through a separate local collection.

It may not mutate the canonical input, Library columns, Safety Kit, governance, attestation, topic metadata, tool registry, or resource bodies.

The projected index retains the canonical `path.id` and `weekCount` and adds the edition fingerprint. All existing week-aware surfaces must consume that one projected index. This prevents Today, Path, dates, progress, and generated plans from disagreeing.

## Repository integration constraints

- The curation entry page is built from one shared source and emitted into both audience builds.
- Each emitted builder receives only its build-projected audience catalog and path; it does not restore both paths to one public payload.
- The builder derives its student-link origin from the current page, so local, preview, and production links stay in their own environment.
- The new page is registered in `site_manifest.json` and the appropriate faculty-facing navigation so the static QA gate can account for it.
- Shared runtime logic lives in focused Front Door modules rather than adding another large inline subsystem to `spa_index.html`.
- The canonical paths remain in `curriculum.json`; the edition format never becomes a second clinical curriculum registry.
- Browser storage uses only the approved `cw_*` names.
- Build-time projection, schema emission, escaping, and static-QA checks apply identically to MS3 and resident output.
- The student loader runs early enough to validate an incoming fragment before initial Today/Path state and plan compatibility are calculated. After acceptance, the stored validated envelope remains authoritative even when ordinary SPA navigation removes the fragment from the visible route.

## Validation and safe recovery

The curator and student loader must call the same pure schema and policy validator.

Validation covers:

- envelope format and schema version;
- canonical digest equality;
- audience/path agreement;
- week bounds and contiguous output weeks;
- unique instance/local IDs;
- known audience-available refs;
- priority enums and ordering;
- count, text, URL, and total-size limits;
- safe protocols and text-only rendering; and
- preservation of protected shell/safety surfaces.

Semantic risk screening flags credential terms, patient identifiers, direct contact-number patterns, local dosing language, and other likely confidential content. Structural violations block publication. Risk-phrase screening provides a warning and specific correction prompt, but it never claims to prove that text is PHI-free. The curator's public-link affirmation remains mandatory.

If decoding, validation, digest comparison, audience matching, or projection fails, the app must:

1. reject the whole edition rather than partially apply it;
2. leave the current edition and all learner state unchanged;
3. load the normal audience-correct core application;
4. show an accessible explanation; and
5. offer a privacy-safe diagnostic receipt containing only error code, edition fingerprint when available, current core revision, and schema version.

Unknown refs may use an explicit, build-reviewed alias map. Without an approved alias, the edition is incompatible; the app must not guess a replacement.

## Interface design

### Curator

- Five-step guided builder: Edition, Curriculum, Schedule, Local details, Preview and share
- Sticky student preview beside the desktop editor
- Persistent Preview toggle on mobile
- Save draft locally without implying publication
- Explicit non-drag ordering controls
- Visible domain for every external link
- Public-link check immediately before generation
- Edition health receipt before Copy link becomes available

### Student

- Compact expandable edition card near the top of Start Here
- First-day action remains visible above the mobile fold
- Core and local content use text labels in addition to visual styling
- The external destination domain appears before navigation
- Edition switching shows old and new fingerprints
- Invalid-edition errors use `role="alert"` without trapping focus

The QR code is an alternate transport only. The copyable link and backup remain available, and no workflow depends on camera access.

## Edition health receipt

Before publication, the builder produces a privacy-safe local receipt covering:

- schema validity;
- audience/path agreement;
- protected-surface preservation;
- external-link protocol and visible domains;
- link and QR size status;
- desktop/mobile preview completion;
- public-link affirmations;
- edition fingerprint; and
- core revision.

The receipt contains no learner activity and is not uploaded automatically. A failed item blocks link generation only when it represents a structural, safety, or privacy contract; workload and optional usability suggestions remain advisory.

## Accessibility requirements

- All builder controls are keyboard operable.
- Reordering never requires drag-and-drop.
- Priority, core/local status, validation, and errors never rely on color alone.
- Touch targets meet the existing mobile target contract.
- The five-step state uses semantic headings, lists, and current-step announcement.
- Live preview changes are not announced on every keystroke; a deliberate Preview action provides an updated summary for assistive technology.
- Error summaries link focus to the exact field needing correction.
- Edition-switch confirmation names both fingerprints in accessible text.
- Reduced-motion preferences are respected.
- The compact edition card is fully usable at 390 CSS pixels without horizontal scrolling.

## Privacy and clinical-governance boundaries

1. The edition envelope is always treated as untrusted input, including when its digest is valid.
2. No configuration contains PHI, patient examples, learner identity, evaluation, credentials, access codes, or private contact details.
3. No learner activity is sent to the curator or a backend.
4. The clinical core remains locked, centrally reviewed, and updateable.
5. Local protocols are linked, not copied, and are visibly labeled local.
6. The curator identity is self-entered and explicitly not digitally verified.
7. The fingerprint confirms configuration equality only.
8. Last-verified and rotation dates do not expire or disable an edition.
9. Account-free immutable links cannot be curator-revoked; this is disclosed before generation.
10. The faculty curation route may be absent from primary learner navigation, but because it has no authentication it must never be described as access-controlled.

## Testing strategy

### Pure contract tests

- valid MS3 and resident envelopes;
- recursive canonicalization and deterministic digest/fingerprint fixtures;
- equivalent configuration producing the same fingerprint;
- any student-visible edit producing a different fingerprint;
- backup export/import round-trip;
- wrong digest, wrong audience, wrong path, invalid week, unknown ref, duplicate ID, invalid priority, excessive count/length, non-HTTPS URL, unsafe text, and oversized payload rejection;
- protected shell and Safety Kit remaining unchanged;
- repeated core refs using distinct instance IDs while core progress remains ref-based;
- advisory versus blocking edition-health findings; and
- explicit schema-version incompatibility.

### Storage and migration tests

- first valid edition persists only the edition envelope and local state container;
- the same edition causes no writes;
- switching editions requires confirmation;
- declined, invalid, or wrong-audience editions cause no writes;
- core progress survives edition switches;
- local progress is isolated by fingerprint;
- only an incompatible derived plan is regenerated; and
- unrelated `cw_*` and all `rp_*` state remain untouched.

### Browser journeys

Run against both audience builds:

- first-time learner opening a curated link;
- returning learner opening the same link;
- switch to a newer edition;
- decline a switch;
- open an older edition;
- malformed, unsupported, incompatible, and oversized edition fallback;
- compact edition card expansion;
- core/local labeling and external-domain disclosure;
- four-week resident and six-week MS3 week bounds;
- curator draft, preview, public-link check, generation, QR threshold, and backup restore;
- keyboard-only reordering and publication;
- screen-reader labels, focus restoration, and alert behavior; and
- 390-pixel mobile layout with first-day action above the fold.

### Repository gates

At minimum, implementation must pass:

```bash
python3 13_Faculty_Resources/_automation/validate_curriculum.py
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
node --test tests/*.test.mjs
cd tests/smoke && npm ci && npx playwright test
```

Any new visual baselines are refreshed through the Ubuntu/Chromium workflow, not from macOS.

## Pilot and release gates

Before broad release, complete a privacy-safe pilot with:

- two attendings from different training settings;
- at least one MS3 edition and one resident edition;
- four trainees testing first-day comprehension and mobile use;
- synthetic local details during initial testing; and
- no P0 or P1 finding remaining open.

Success means:

1. Each attending creates and shares a valid edition without technical help.
2. Each trainee can identify the curator, location, fingerprint, core revision, and what is local versus reviewed core.
3. Each trainee reaches the first-day action on mobile without searching.
4. Corrupt or malicious test payloads cannot alter the core application or saved progress.
5. Attending and trainee fingerprints match for the same edition.
6. Both audience build gates and the complete relevant browser suite pass.

Technical success does not constitute institutional approval, verified faculty identity, or approval of any local protocol.

## Phased delivery

### Phase 1 — Pure configuration foundation

- JSON schema and fixtures
- canonical encoder/decoder
- digest and fingerprint
- policy validator and diagnostic receipt
- pure edition projector

### Phase 2 — Curator builder

- five-step guided flow
- device-local draft
- audience-site routing
- curriculum selection and scheduling
- local orientation and external links
- sticky/mobile preview

### Phase 3 — Student edition experience

- fragment loader and validation
- edition card
- projection into Today, Path, dates, progress, and generated plan
- edition-switch confirmation
- edition-scoped local progress
- safe fallback

### Phase 4 — Sharing and pilot

- immutable link and backup
- conditional QR generation
- health receipt and public-link gate
- full accessibility and browser journeys
- cross-setting faculty/trainee pilot

Each phase must remain releasable only when its active surfaces fail safely. A partially implemented curator must not generate links that the production student loader cannot validate.

## Future authenticated extension

A later faculty portal may add verified profiles, server-side edition storage, short links, revocation, and institution-managed access. It must reuse the same versioned configuration schema and student projector rather than create a second curriculum system.

An authenticated future may display `Verified curator`; the first release may not. Authentication also does not authorize edits to reviewed clinical core content.

## Approved decisions

- The clinical core is locked; curation changes selection, order, scheduling, and bounded local orientation only.
- The first release is account-free, portable, and one-way.
- Students receive a click-ready edition link; JSON is a backup, not a required import step.
- The edition card shows curator, location, rotation dates, last-verified date, version, fingerprint, and core revision.
- Editions do not expire automatically.
- Every changed publication creates a new immutable link and fingerprint; older links remain functional.
- Attendings may add labeled HTTPS external resources and selection rationales, but not uploads or clinical-core edits.
- Learner progress remains device-local and invisible to the curator.
- The first architecture embeds validated configuration in the URL fragment.
- The guided builder, sticky desktop preview, mobile Preview toggle, compact expandable edition card, and final public-link gate are approved.
- The human-readable fingerprint uses location, audience, and six digest-derived characters.
- The curator is part of the existing platform/build system, not a separate per-attending site.

## Plain-language summary

An attending will arrange the existing curriculum and add safe local orientation through a guided form. The app turns those choices into a versioned link. A student opens that link on the normal clerkship site and sees the curated Path, local details, and an edition card. The underlying clinical library stays centrally reviewed and current, while progress stays on the student's own device.
