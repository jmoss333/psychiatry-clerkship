# Structured Rotation Edition Catalog — Design Amendment

**Date:** 2026-08-19

**Status:** Awaiting final user review

**Amends:** `2026-08-19-attending-curated-rotation-editions-design.md`

**Decision:** Replace every learner-visible curator-authored prose field and raw URL in a rotation edition with reviewed catalog references, closed choices, or constrained primitives. Preserve recognizable real curator and training-location names through reviewed, versioned catalog profiles.

## Why the architecture changed

Task 12 demonstrated that finite text rules cannot reliably distinguish ordinary local logistics from patient information, learner evaluations, copied protocols, or clinical directions. Tight rules blocked useful wording, while harmless rewording let prohibited content through. This is a property of unrestricted language, not a missing regular expression.

The safe model is therefore a form made from reviewed choices, dates, times, week numbers, priorities, and official-link selections. It remains useful to trainees because it generates clear first-day and rotation guidance, but arbitrary public prose has no place in the edition payload.

## Authority and boundaries

This amendment supersedes the original design wherever it described:

- self-entered edition, location, curator, or role text;
- curriculum rationales or change notes;
- free-text local orientation, checklist, contact, or resource fields; or
- raw curator-entered URLs;
- the schema-v1 example, text/URL limits, and semantic-screening contract;
- version-1 curator/edition/local-progress storage as active state; or
- acceptance and test criteria that require those replaced fields.

The original design remains authoritative for:

- the existing MS3 and resident sites rather than a separate site;
- audience locking and the six-week versus four-week paths;
- immutable edition links, digest, numbering, and human-readable fingerprint;
- separation of reviewed core, edition configuration, and learner-local state;
- pure projection and protected clinical/safety surfaces;
- account-free sharing and no learner identity, analytics, or reporting; and
- visible governance, privacy, and identity-not-verified language.

Clinical content, safety language, PHI rules, supervision boundaries, and escalation instructions remain centrally governed. A curator can arrange reviewed resources and select approved local logistics, but cannot write or override clinical guidance.

## Goals

1. Let trainees recognize the attending, location, dates, and exact edition they received.
2. Provide useful first-day and rotation guidance without arbitrary public prose or raw URLs.
3. Let other attendings and training locations be added through a clear human-review process.
4. Make the privacy boundary mechanically testable rather than dependent on semantic guessing.
5. Preserve audience-correct four-week and six-week learning paths.
6. Keep the current account-free, static-site, browser-local architecture.

## Non-goals

- Instant self-service publication for an unreviewed person, location, phrase, or link
- A server-side faculty account, directory, approval workflow, or revocation service
- Automatic verification that the person operating the curator is the named attending
- Arbitrary learner-facing notes, protocols, evaluations, patient details, contact details, or URLs
- Institution-specific clinical directives or local copies of clinical policies
- A separate deployed site per attending, location, or cohort

## High-level architecture

```text
Reviewed static catalog + reviewed core curriculum
                    |
                    v
      audience-projected curator choices
                    |
                    v
       schema-v2 edition of refs/enums only
                    |
                    v
       full validation + pure projection
                    |
                    v
   generated learner card and local guidance
```

The shared repository owns a static rotation-edition catalog. Each audience build produces two views from the same verified source: a curator selection index containing only eligible `reviewed` records, and a learner resolution index containing eligible `reviewed` plus `deprecated` exact versions. `pending` content is absent from both; `blocked` exact keys remain identifiable in the governance manifest but their content is not rendered. The curator stores catalog keys and constrained values. The learner resolves those keys against the resolution index before anything renders or writes to browser storage.

An edition is accepted only when the entire catalog reference graph resolves. An unknown, pending, mismatched, blocked, or structurally invalid reference rejects the whole edition; the learner falls back to the ordinary site without partial local guidance. A deprecated exact version remains resolvable from any otherwise-valid payload, but the curator cannot select it.

## Reviewed catalog

### Catalog record families

The catalog contains:

- `trainingLocations`: display name, short code, location type, eligible audiences, approved places, official hostnames, and verification metadata;
- `curatorProfiles`: public display name, professional role code, eligible locations/audiences, and verification metadata;
- `places`: reviewed learner-facing place names scoped to a location;
- `officialLinks`: reviewed title, absolute HTTPS destination, visible hostname, purpose code, and location/audience scope;
- `phraseSets`: versioned learner-facing templates and the exact typed parameters each template permits;
- `reasonCodes`, `activityCodes`, `roleCodes`, `checklistCodes`, and other closed dictionaries needed by the structured editor.

No catalog record contains patient information, learner-specific information, credentials, access codes, phone numbers, pagers, or personal email addresses. Contact options point only to reviewed institutional directory pages or centrally approved role routes.

### Identity and immutability

Each record has:

- a stable readable base key;
- an immutable version;
- a canonical SHA-256 content digest;
- `verifiedOn` and review provenance metadata; and
- explicit location/audience eligibility.

Edition references resolve an exact versioned key. Editing learner-visible catalog content or recording a new verification date creates a new version rather than mutating an existing version. Every supported exact version, including a deprecated version still used by an edition, remains in the built catalog with its verified record digest.

Current lifecycle status is deliberately not stored inside the immutable content record. A separate, revisioned governance manifest maps every exact record version to a current disposition. The build and learner loader verify and apply that manifest before exposing or resolving records. This lets central governance block a known unsafe exact version without mutating its content digest. The complete catalog content plus governance manifest has a canonical revision digest shown in learner and curator governance details.

### Governance statuses

- `pending`: source-review candidate only; excluded from public audience projections and unusable by curator or learner runtimes;
- `reviewed`: selectable by the builder and resolvable from otherwise-valid payloads;
- `deprecated`: not selectable by the builder, but resolvable from any otherwise-valid payload;
- `blocked`: unavailable because central safety or privacy governance requires a fail-closed stop.

Only central repository governance can change the manifest. Because links are unsigned, the loader cannot prove whether a deprecated reference was assembled before or after deprecation; `deprecated` is therefore a builder rule, not an acceptance-age claim. `blocked` is a static-site safety release mechanism for a known unsafe catalog record, not a curator-controlled or server-side edition-revocation feature. A curator cannot silently revoke or rewrite an account-free immutable edition.

### Real names and locations

The user selected a reviewed catalog that preserves real curator and training-location names. These values are not typed into the public edition. They are displayed from reviewed profiles.

The interface must still state that the operator's identity is not digitally verified. Catalog review confirms what a profile says and where it may be used; it does not prove who clicked Generate.

The initial Sanford BHU2 and Joshua Moss profile candidates remain `pending` until their exact display text, associations, official links, and verification dates receive human review. The implementation must not infer or publish these production records merely from repository history.

## Schema version 2

Only schema version 2 is publishable after this amendment. Its public configuration contains only:

- fixed format/version strings;
- catalog references;
- canonical core resource references;
- closed enums;
- dates and times;
- bounded integers, booleans, and ordered collections; and
- generated IDs, revisions, digests, edition number, and fingerprint inputs.

Every object uses `additionalProperties: false`, every array has a small explicit maximum, and every discriminated variant defines its own exact properties. A generic parameter bag is prohibited.

### Public string-leaf rule

Every public string leaf must be one of:

- a fixed protocol constant;
- an exact catalog reference;
- a canonical core reference;
- a validated ISO date or 24-hour time;
- a closed enum;
- a revision or SHA-256 digest; or
- a deterministic generated identifier.

There is no generic `text`, `title`, `label`, `rationale`, `note`, `changeNote`, `name`, `role`, or `url` field in the v2 edition schema.

### Edition context and card

The edition context stores:

- audience and canonical path ID;
- edition number;
- training-location profile key;
- curator profile key;
- rotation start and end dates;
- self-attested `editionCheckedOn` date;
- core revision; and
- local-catalog revision.

The stored local-catalog revision means “created against,” just as the core revision does. It is covered by the edition digest and displayed for comparison, but it need not equal the site's current catalog revision. Compatibility depends on resolving and verifying every exact referenced record version. This lets unrelated catalog additions appear without breaking an immutable edition.

The learner card derives its title, location name/code, curator name/role, and visible governance labels from reviewed records. It shows rotation dates, “Edition checked on” with an explicit self-attested label, edition number, catalog revision, core revision, and the existing fingerprint such as `BHU2-MS3-4F7C2Q`.

`editionCheckedOn` is selected by the operator, must be a real calendar date, and cannot be in the future at generation time. It never appears as catalog or identity verification. Expandable governance details separately show the immutable `verifiedOn` provenance for the selected location profile, curator profile, phrase set, and official links. This preserves the requested last-verification signal without conflating an unverified operator's assertion with repository review.

The title is generated rather than edited—for example, “BHU2 MS3 psychiatry rotation.”

### Curriculum choices

Path items retain canonical core reference, deterministic instance ID, week, order, and `required`/`recommended`/`optional` priority. Free-text rationale becomes a reviewed `reasonCode`, such as “prepare for supervised practice” or “review before first patient encounter.”

The MS3 path remains exactly six weeks; the resident path remains exactly four weeks. Omitted resources remain in the Library, and protected safety/governance surfaces cannot be omitted or relabeled.

## Structured local plan

Local guidance is stored as discriminated structured records. Reviewed phrase templates turn those records into learner-facing sentences. A phrase-set version is part of the exact referenced catalog graph so an unchanged edition cannot silently display different wording later.

### Arrival

Controls may include:

- arrive `at` or `by` a validated time;
- reviewed meeting place;
- reviewed check-in role; and
- optional official arrival-map link selected from the catalog.

Example generated copy: “On the first day, arrive by 7:45 AM and meet at the unit workroom. Check in with the clerkship coordinator.”

### Typical schedule

The curator may select a bounded day-start/day-end pattern and add a small number of rows containing weekday set, time range, reviewed activity code, reviewed place, and priority. Validations prevent impossible times, overlapping identity keys, excessive rows, and audience-invalid options.

Example generated copy: “A typical day runs from 7:45 AM until about 5:00 PM. Team rounds begin at 8:30 AM.”

### Rounds and presentation

The curator selects reviewed operational patterns for preparation, supervised participation, presentation format, timing, and approved content categories. No option may create a site-specific clinical directive or weaken supervision.

Example generated copy: “Before rounds, review your assigned patients. During rounds, present assigned patients. Complete follow-up tasks with supervision.”

### Documentation

Choices are limited to centrally reviewed workflow statements such as:

- documentation is not expected;
- use the approved institutional EHR for supervisor review; or
- confirm the workflow with the supervisor.

Timing is a closed choice. Generated copy always includes centrally controlled privacy and supervision language. The curator cannot disable or rewrite it.

### Attendance and feedback

Attendance choices reference selected schedule events and reviewed absence-process links. Feedback choices use cadence, initiator, and setting enums. They cannot collect attendance, performance, or evaluation data.

### Access preparation

Repeatable items select a reviewed preparation code, due point, and optional reviewed official link. Examples include badge setup, approved EHR access, required institutional training, institutional email, VPN, and parking/transit. No credential, account, access code, or completion status is stored in the edition.

### Contacts

Each contact contains only a reviewed role code and optional reviewed institutional-directory link. Direct phone, pager, email, free-text role, and personal contact details are prohibited. A small explicit cap applies.

### Checklist

The checklist is generated primarily from included arrival and access choices. The curator may select additional reviewed checklist actions and priority. Labels and IDs are generated; neither is editable.

### Official resources

Each resource stores a reviewed link reference, priority, valid week, and reviewed reason code. Title, URL, and visible hostname come from the catalog. The learner sees that it is locally curated and can inspect the destination hostname before opening it.

### Change summary

There is no curator-authored change note. The system compares the previous and current validated configuration and generates a bounded summary from change categories and counts—for example, “Schedule updated; 2 local-orientation selections changed.”

## Curator experience

The existing five-step flow remains, with structured controls replacing public text authoring.

### Step 1 — Edition

Select a reviewed training-location profile and an eligible reviewed curator profile, then choose rotation dates and the self-attested “Edition checked on” date. Audience and path stay locked to the current site. The title, code, role, and edition identity are generated.

If no reviewed profile is available, publication remains disabled and the interface explains how to request catalog onboarding. It must not offer a custom-name fallback.

### Step 2 — Curriculum

Include, omit, or repeat current-audience Library resources; choose priority and an optional reviewed reason. Repeated placements retain distinguishable screen-reader labels including occurrence, week, and current position.

### Step 3 — Schedule

Move selected items within the exact four- or six-week boundary using keyboard-accessible controls. The pure projector continues to drive preview.

### Step 4 — Local details

Use two progressive groups:

1. **First-day essentials:** arrival, access preparation, who to contact, and checklist.
2. **How this rotation works:** typical schedule, rounds, presentation, documentation, attendance, feedback, and official resources.

A curator can start from a reviewed common inpatient pattern or choose sections individually. A preset only fills the same editable structured fields; it is not a distinct payload.

Every included card shows an immediate “Students will see” generated sentence. Step 4 contains no learner-facing textarea, ordinary text input, or URL input, and no “Other” choice. Search/filter inputs may help find catalog records, but their values never enter draft, backup, preview, storage, or edition payload.

A first-day coverage strip answers five trainee questions:

- Where do I go?
- When do I arrive?
- What should I prepare?
- Who can help?
- What happens first?

It indicates missing structured choices without introducing new public fields.

### Step 5 — Review and share

The curator reviews the exact desktop/mobile learner preview, governance state, generated change summary, destination site, catalog/core revisions, and fingerprint. Existing privacy/scope affirmations remain.

The app keeps two independent review receipts: one for the canonical desktop preview and one for the canonical 390 px mobile preview. Both bind to the same exact validated content digest, referenced phrase/catalog versions, renderer revision, and their own preview preset. Reviewing or switching to one mode does not invalidate the other. Any learner-visible structured change, import, referenced-record resolution change, or renderer change invalidates both; recapturing one mode replaces only that mode's receipt. Ordinary curator-window resizing does not create or destroy a receipt.

Generate remains disabled unless:

- every reference and parameter validates;
- the chosen profiles are `reviewed` and eligible;
- desktop/mobile preview requirements are satisfied;
- required affirmations are current; and
- publication governance is explicitly enabled.

Publication governance is one default-off build-time value, `rotationEditionV2`, with only `disabled` or `enabled`. The same audience build projection controls both sides of the feature:

- when `disabled`, the curator cannot Generate and the learner loader rejects any v2 edition fragment before projection or writes, even if someone hand-calculates a structurally valid unsigned payload;
- when `enabled`, both surfaces still require every ordinary schema, digest, catalog, audience, review, and transaction check.

Enabling it requires a separate human-approved repository governance change and successful builds for both audiences. A hidden button or disabled UI alone is never treated as a publication boundary.

## Learner experience

The learner loader performs these steps before any edition or local learner-state write:

1. Require the current audience build's `rotationEditionV2` gate to be enabled; otherwise fail before decoding or writes.
2. Decode and structurally validate the entire envelope.
3. Validate digest, audience, path, duration, core revision policy, and limits.
4. Validate the current governance manifest and every catalog reference against the exact audience projection.
5. Validate all template-specific parameters and cross-record location/audience relationships.
6. Resolve a complete plain-data display model.
7. Project the core path without mutating protected surfaces.
8. Ask for the existing first-use/switch decision where applicable.
9. Commit learner-local edition state only after complete success.

Any failure is non-echoing and fail-closed. No partial edition renders, no raw IDs or rejected values leak into messages, and the ordinary core site remains usable.

The mobile trainee order is:

1. First day at the location
2. Before you arrive
3. Who to contact
4. Today’s checklist
5. Typical day
6. Team workflow
7. Attendance and feedback
8. Official resources

If the edition has no optional local-plan selections, the learner sees a short statement that the edition adds no local orientation; the reviewed Path and Library remain available.

## Adoption and catalog onboarding

An attending or training location becomes selectable through a reviewed repository catalog change:

1. Propose exact public display names, role/location associations, places, official links, phrase choices, audiences, and verification date.
2. Run schema, privacy, link, audience, and render validation.
3. Human-review the exact learner-facing output and official destinations.
4. Commit the immutable records and mark their exact keys `reviewed` in the revisioned governance manifest.
5. Rebuild both sites so eligible choices appear without creating a new site.

This deliberately trades instant arbitrary self-service for a reliable public-content boundary. Later, a signed site-pack compiler could let another institution prepare a portable catalog proposal, but signature, issuer, revocation, and semantic-review governance require a separate design. A signature proves issuer and integrity, not safety.

## Version-1 migration and storage

Version 1 is an unpublished prerelease on this branch. Version 2 therefore becomes the only format the learner loader accepts. Before relying on this policy, release verification must confirm that no v1 edition link was externally shared.

The learner loader rejects v1 with an unsupported-prerelease message and performs no writes.

The curator may offer a one-way safe salvage of a structurally and digest-valid—but still untrusted—v1 backup. The digest detects corruption; it does not authenticate the author. Salvage may:

- preserve audience/path, valid canonical core references, week, order, priority, and valid dates;
- discard without displaying, logging, or storing all prose and raw URLs;
- do not automatically map similar labels or destinations;
- require new reviewed location, curator, phrase, reason, place, and link selections; and
- reset preview receipts and every publication affirmation.

A salvaged draft starts as v2 Edition 1 with a new digest and fingerprint. It does not inherit v1 numbering or identity. The original import file remains untouched outside the app.

V2 curator drafts and learner edition state use new versioned, audience-namespaced storage keys. Existing v1 browser data is preserved but never loaded into public v2 state except through the explicit safe-salvage transaction. Import buffers are cleared after success and safely recoverable after rejection, consistent with the existing transaction rules.

For v2 imports:

- unchanged canonical student-visible configuration preserves edition number, digest, and fingerprint;
- any student-visible structured change increments the edition once;
- generated change summary and edition number are excluded from semantic equality; and
- a catalog revision change alone does not increment the curator edition, but exact referenced catalog-record versions remain fingerprint-significant.

Unknown, builder-deprecated, or blocked references are never guessed during migration. Migration requires an explicit reviewed alias or curator reselection; ordinary learner validation may still resolve an exact deprecated key as described above.

## Normative v2 shape and limits

The implementation plan may split definitions across files, but it may not broaden this public shape. All objects are closed. Fields marked optional are absent rather than `null`. Catalog-key fields use an exact versioned key matching `^[a-z0-9][a-z0-9._:-]{0,126}@v[1-9][0-9]{0,5}$`. Generated IDs retain the existing printable-ASCII, 160-character maximum. Collections reject duplicate semantic keys as well as duplicate generated IDs.

### Envelope and configuration

| Object | Exact properties | Required bounds |
|---|---|---|
| envelope | `format`, `schemaVersion`, `config`, `digest` | format `cw-rotation-edition`; version `2`; digest canonical SHA-256 |
| config | `audience`, `pathId`, `editionNumber`, `createdAgainstCoreRevision`, `createdAgainstLocalCatalogRevision`, `context`, `phraseSetKey`, `pathItems`, `localPlan`, `changeSummary` | edition 1–2,147,483,647; canonical config at most 12 KiB |
| context | `trainingLocationKey`, `curatorProfileKey`, `rotationStart`, `rotationEnd`, `editionCheckedOn` | real ISO dates; end not before start; checked-on not future when generated |
| path item | `instanceId`, `ref`, `week`, `order`, `priority`, optional `reasonKey` | 1–96 items; unique IDs; contiguous order per week; priority closed to required/recommended/optional |
| change summary | `kindCodes`, `changedItemCount` | generated only; 1–12 unique closed kinds; count 0–255; `initial` is the sole kind for Edition 1 |

Audience/path pairs remain exactly `ms3`/`ms3-six-week` and `resident`/`resident-four-week`. Week values are 1–6 and 1–4 respectively. `ref` must be a current canonical resource in that audience's Library projection.

### Local-plan variants

`localPlan` permits only the optional category properties below. Each included category must satisfy its full discriminator-specific shape; there is no generic parameter object.

| Category | Exact stored properties | Maximum/cardinality |
|---|---|---:|
| arrival | `timingCode`, `time`, `placeKey`, `checkInRoleKey`, optional `linkKey` | one; timing `at` or `by` |
| schedule | `dayStart`, `dayEnd`, `endQualifierCode`, `events` | one; 1–24 events |
| schedule event | `instanceId`, `daySetKey`, `startTime`, optional `endTime`, `activityKey`, optional `placeKey`, `priority` | unique ID; end after start when present |
| rounds | `preparationKey`, `participationKey`, `followUpKey` | one |
| presentation | `formatKey`, `timingKey`, `elementKeys` | one; 1–8 unique elements |
| documentation | `workflowKey`, `timingKey`, optional `policyLinkKey` | one |
| attendance | `eventInstanceIds`, `absenceRoleKey`, optional `policyLinkKey` | one; 1–24 unique existing schedule-event IDs |
| feedback | `cadenceKey`, `initiatorKey`, `settingKey` | one |
| access item | `instanceId`, `itemKey`, `dueKey`, optional `linkKey` | 0–12; unique ID |
| contact | `instanceId`, `roleKey`, optional `linkKey` | 0–8; unique ID |
| checklist item | `instanceId`, `itemKey`, `priority` | 0–24; unique ID |
| resource | `instanceId`, `linkKey`, `priority`, `week`, optional `reasonKey` | 0–12; unique ID; audience week bound |

The `accessItems`, `contacts`, `checklistItems`, and `resources` category properties are arrays of the corresponding row. Times use valid `HH:MM` 24-hour values. All `*Key` values are exact catalog references with type, location, audience, and disposition checked at runtime.

The generated change summary is covered by the edition digest but excluded, with `editionNumber`, from semantic change detection. The curator generator derives it from the current draft and imported/base configuration rather than accepting editable text or direct UI input. Because an unsigned payload cannot prove lineage, the learner validates only the closed codes/count and labels the result as a locally supplied edition summary; it does not claim that the change history is authenticated.

### Catalog and governance caps

Catalog source and audience projections are build inputs, not edition payload fields, but they also fail closed on explicit limits:

- at most 4,096 immutable records in any record family;
- at most two audience keys per record;
- at most 64 eligible location keys per curator or shared record;
- at most 32 declared official hostnames per location;
- at most 16 typed placeholders per phrase template;
- at most 16,384 exact-key entries in the disposition manifest; and
- at most 2 MiB of canonical catalog projection per audience.

The retained transport limits remain: final encoded URL at most 16,000 characters and QR generation only at 1,800 characters or fewer.

## Validation and release gates

### Schema and public-surface tests

- Version 2 is the only publishable version.
- Legacy public prose and raw URL properties fail as additional properties at every object boundary.
- Every public string leaf satisfies the fixed/ref/enum/date/time/revision/digest/generated-ID allowlist.
- Every object is closed and every array has an explicit maximum.
- MS3 weeks remain 1–6 and resident weeks remain 1–4.
- Dates and times are semantically valid, not merely pattern-shaped.
- Template variants reject missing, extra, generic, or wrong-typed parameters.

### Catalog tests

- Stable versioned keys and canonical digests are unique.
- References are acyclic where required and resolve completely.
- New selections use only `reviewed` records eligible for location and audience.
- `deprecated` records are absent from new-builder choices but remain resolvable from any otherwise-valid payload; tests do not pretend an unsigned payload has provable issuance age.
- Current disposition comes from the separate manifest; changing a disposition never mutates the immutable content record or its digest.
- Official links are absolute HTTPS, contain no userinfo, use a declared reviewed hostname, and exclude sensitive query/fragment patterns.
- Phrase placeholders are allowlisted and typed; no arbitrary-string placeholder exists.
- Every phrase renders without unresolved tokens or raw internal IDs.
- Curator/location/link/place relationships cannot cross their declared scope.

### Contract and adversarial tests

- Unknown or mismatched profile, template, place, link, reason, activity, role, or core IDs reject the whole edition.
- A catalog revision changed without a matching edition digest, or a tampered/missing record version, record digest, edition digest, or audience, fails before writes. A legitimate difference between the stored created-against catalog revision and current site revision is displayed rather than rejected when all exact references remain valid.
- Raw patient information, learner evaluations, protocols, directives, URLs, emails, phone/pager values, credentials, HTML, and arbitrary prose have no schema location in which they can be stored.
- Existing accessor/proxy, prototype-pollution, canonicalization, oversize, decoding, storage-transaction, startup-order, and stale-async protections remain covered.
- Non-echoing errors never expose rejected import content or catalog internals.

### Curator tests

- New drafts contain only references, enums, constrained primitives, and generated IDs.
- Step 4 has no learner-facing free-text or URL authoring control.
- Every structured discriminator and exact parameter union is exercised.
- V1 salvage preserves only the allowlisted structural values and never echoes discarded content.
- No-op actions preserve imports and review state; visible changes invalidate review once.
- Repeated placements and all schedule/local controls remain keyboard and screen-reader operable.
- Generated learner copy, visible hostname, first-day coverage, empty states, and error focus work at desktop and 390 px in light and dark themes.

### Learner and build tests

- In explicitly enabled test builds, both audiences accept a valid exact v2 edition and reject all invalid/unresolved variants with no writes.
- With the default-off publication gate, both curator Generate and learner acceptance reject even a hand-built digest-valid v2 payload with no edition/local-state writes.
- Edition switching preserves core learner history and scopes only edition-derived state.
- Generated card identity, fingerprint, catalog/core revisions, local/core labels, schedule, and first-day guidance match the validated model.
- Both full build/QA gates, the root test suite, contrast checks, and two-audience Playwright journeys pass sequentially.

Technical test success does not approve production catalog facts, clinical content, official links, or deployment. Those remain human decisions.

## Implementation sequence after approval

1. **Catalog and schema v2:** define reviewed catalog schemas/fixtures/validator, exact v2 edition schema, browser/server parity, and public-string-leaf invariant.
2. **Resolver and migration:** add catalog projection, exact reference resolution, v1 safe salvage, v2 storage keys, generated card/copy/change summary, and learner fail-closed behavior.
3. **Structured curator UI:** replace all public prose/URL controls across Steps 1, 2, 4, and 5 with reviewed selectors and typed controls; add coverage strip and generated preview.
4. **End-to-end hardening:** test both audiences, desktop/mobile, light/dark, import/switch/no-write boundaries, hostile inputs, catalog drift, accessibility, and complete build gates.
5. Resume the original plan's share/publication and full-pilot tasks only after independent review approves this boundary.

Each slice follows test-first implementation and independent requirements/code-quality review. Publication stays disabled during the migration.

## Acceptance decisions captured

- Use the existing MS3/resident sites, not a third clerkship site.
- Use constrained structured/template-generated local guidance rather than governed arbitrary free text.
- Preserve real curator and training-location names through a reviewed catalog rather than anonymous role/code-only display.
- Keep account-free immutable sharing, audience locking, learner-local state, and the human-readable fingerprint.

## Open human-review items before production publication

- Exact initial production training-location records
- Exact initial curator profiles and allowed location/audience associations
- Exact learner-facing phrase dictionary and presets
- Exact official destinations and declared hostnames
- Verification dates and review provenance
- Confirmation that no v1 prerelease edition link was externally shared

These are content/governance inputs, not reasons to weaken the structured architecture or infer facts automatically.

## Plain-language summary

An attending will still build an edition on the existing clerkship site, but the public parts work like a carefully reviewed form. They choose the attending, location, schedule details, workflow statements, checklist actions, and official resources from approved options. The app generates the trainee-facing wording and edition card. That makes the experience portable and useful while preventing an edition link from becoming a container for patient information, evaluations, copied protocols, or unsafe clinical directions.

The concrete next best step is to approve this amendment, then replace the old Task 12/free-text plan with the four implementation slices above. A future innovative extension is a signed offline “site-pack compiler” that helps another institution prepare a review-ready catalog bundle without adding accounts or a backend.
