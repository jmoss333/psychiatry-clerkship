# Structured Rotation Edition Catalog v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the prerelease free-text rotation-edition contract with a catalog-resolved schema-v2 edition that gives trainees reviewed attending, location, first-day, schedule, workflow, and official-resource guidance inside the existing MS3 and resident sites.

**Architecture:** A centrally reviewed, immutable catalog and separate disposition manifest compile into one audience-specific inline projection. Public edition links contain only exact catalog keys, canonical core references, closed codes, dates/times, bounded numbers, and generated identity values; a shared resolver produces the only learner-renderable display model. One default-off build governance value gates both curator Generate and learner acceptance, while a curator-only module can salvage structural fields from digest-valid but untrusted v1 backups.

**Tech Stack:** Static HTML/CSS, ES5-style build-injected JavaScript, Web Crypto SHA-256, JSON Schema Draft 7 with Python `jsonschema`, Python build tooling, Node `node:test`, Playwright/Chromium, Netlify static builds, and vendored `qrcode-generator` 1.4.4.

**Spec:** `docs/superpowers/specs/2026-08-19-structured-rotation-edition-catalog-design.md`

## Global Constraints

- Work only in `/Users/jm/Psychiatry-Clerkship-Library/.worktrees/attending-curated-rotation-spec`; preserve the user's dirty primary checkout.
- Do not hand-edit `_build/ms3` or `_build/res`; they are generated verification artifacts.
- Keep the existing `ms3` / `ms3-six-week` / Weeks 1–6 and `resident` / `resident-four-week` / Weeks 1–4 contracts unchanged.
- Schema version 2 is the only publishable learner format. Learner code must reject schema v1; v1 parsing may exist only in the curator-only salvage module.
- Keep `rotationEditionV2` set to `disabled` in checked-in governance. Enabling it requires a separate human-approved repository change after implementation, catalog-content review, and full verification.
- When publication is disabled, curator Generate and learner acceptance both fail closed before payload decoding, projection, or edition/local-state writes.
- Public v2 configuration strings are limited to fixed constants, exact catalog keys, canonical core refs, ISO dates, `HH:MM` times, closed codes, revisions/digests, and deterministic IDs. No public prose field or raw URL may reappear.
- Production catalog source starts empty and disabled. Sanford BHU2, Joshua Moss, phrase wording, presets, places, and official links are not inferred. Reviewed synthetic data lives only under `tests/fixtures/`.
- Do not modify `13_Faculty_Resources/reviewed.json`, `reviewed.schema.json`, `surface_governance.py`, `curriculum.json`, or `site_manifest.json` for catalog lifecycle. Page/tool governance remains a separate authority.
- Never ship raw catalog source, raw disposition source, test fixtures, or internal review provenance as learner assets. Only the audience projection is injected inline.
- Treat imported, stored, or URL-carried data as untrusted even when its digest matches. Digest proves integrity, not authorship.
- Keep the Library, Safety Kit, Single Safety Rule, clinical content, governance metadata, attestation, supervision boundaries, escalation language, and core learner history outside the edition projector's write surface.
- Do not add PHI, learner identity/evaluation data, credentials, access codes, direct phone/email/pager values, medication doses, copied protocol text, accounts, analytics, reporting, uploads, a backend, a short-link service, or cross-site fetches.
- Shared Front Door modules remain audience-neutral and ES5-style: `var`, functions, no imports, no arrow functions, no template literals.
- Render resolved catalog strings through `textContent`, `createTextNode`, or `fdEsc()`. Never render raw catalog keys as learner fallback copy.
- Preserve all v1 browser keys byte-for-byte. V2 uses only the fixed audience-specific keys below.
- Run MS3 and resident full builds sequentially. Do not run the two build scripts concurrently because they share generated build locations.
- Tasks 3–6 are one atomic v1-to-v2 cutover batch: Task 3 changes the shared public contract, while learner and curator consumers/tests migrate in Tasks 4–6. Do not commit or run the full root/build gates after Tasks 3, 4, or 5; keep their focused suites green, finish Task 6, then run every affected root test and both full builds before the single cutover commit. Do not add a public v1 compatibility overload to make an intermediate commit green.
- Before Task 1, complete Task 0 and commit the approved design, supersession note, and this executable plan as one documentation-only checkpoint. No implementation task may leave an authoritative planning document untracked or dirty.
- Do not push, merge, deploy, enable publication, claim faculty approval, or claim institutional verification.

## Locked Implementation Contracts

### Storage keys

```javascript
var FD_EDITION_V2_KEYS={
  ms3:{
    edition:'cw_rotation_edition_ms3_v2',
    local:'cw_rotation_local_progress_ms3_v2',
    curator:'cw_curator_draft_ms3_v2'
  },
  resident:{
    edition:'rp_rotation_edition_resident_v2',
    local:'rp_rotation_local_progress_resident_v2',
    curator:'rp_curator_draft_resident_v2'
  }
};
```

`fd_edition_contract.js` owns this fixed map and exposes `fdEditionStorageKeys(audience)`, which returns a fresh three-field copy or `null`; learner and curator code never construct key names dynamically.

The learner local document is exactly:

```json
{"schemaVersion":2,"byFingerprint":{"EXU-MS3-A2C4E6":{"checklist":{"local:generated:arrival":true},"resources":{"local:resource:1":true}}}}
```

Both objects are closed except for validated fingerprint/ID map keys; stored values must be exactly `true`, and unchecked values are absent. Local progress keeps at most 128 fingerprint buckets. A 129th acceptance fails without deleting an earlier bucket. Each bucket permits only the edition's resolved checklist/resource IDs, with maxima 24 and 12.

The active edition key stores compact canonical envelope JSON, not the link payload or curator draft. The public link is exactly `<same-audience-root>#edition=<unpadded-base64url(canonical-envelope-UTF8)>`; it has no query, second fragment parameter, percent-encoded payload, compression, or alternate codec. Decoder input and the complete URL retain the 16,000-character cap.

### Catalog records and digests

Catalog exact keys match `^[a-z0-9][a-z0-9._:-]{0,126}@v[1-9][0-9]{0,5}$`. Every record is one closed variant:

- `trainingLocation`: `displayName`, `locationCode`, `locationTypeCode`, `audiences`, `officialHostnames`, `verifiedOn`;
- `curatorProfile`: `displayName`, `roleKey`, `locationKeys`, `audiences`, `verifiedOn`;
- `place`: `displayName`, `locationKeys`, `audiences`, `verifiedOn`;
- `officialLink`: `title`, `url`, `visibleHostname`, `purposeCode`, `locationKeys`, `audiences`, `verifiedOn`;
- `phraseSet`: `displayName`, exact template variants and their typed token lists, `audiences`, optional `locationKeys`, `verifiedOn`;
- `choice`: `choiceKind`, `label`, `fragment`, `audiences`, optional `locationKeys`, `verifiedOn`;
- `localPreset`: `displayName`, a closed v2 `localPlan` value, `audiences`, `locationKeys`, `phraseSetKey`, `verifiedOn`.

The source objects are exactly:

```json
{"schemaVersion":1,"records":[{"key":"location.example-unit@v1","kind":"trainingLocation","contentDigest":"sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","displayName":"Example Training Unit","locationCode":"EXU","locationTypeCode":"inpatient","audiences":["ms3"],"officialHostnames":["example.edu"],"verifiedOn":"2026-08-19"}]}
```

```json
{"schemaVersion":1,"manifestRevision":1,"rotationEditionV2":"disabled","dispositions":[{"key":"location.example-unit@v1","status":"pending","changedOn":"2026-08-19","reviewRef":"REVIEW-EXAMPLE-1"}]}
```

Every record includes exactly `key`, `kind`, `contentDigest`, its variant fields, `audiences`, optional variant-permitted `locationKeys`, and `verifiedOn`. Every disposition includes exactly `key`, `status`, `changedOn`, and `reviewRef`; status is `pending | reviewed | deprecated | blocked`, dates are real and not later than the injected build date, and the manifest contains exactly one disposition per source key. Governance provenance is build-only and is not included in the public projection.

String and collection bounds are fixed: human display names/titles 1–120 Unicode scalar values; curator role fragments and choice labels 1–80; choice fragments 1–240; template text 1–512; `reviewRef` 1–160; HTTPS URL 1–2,048 characters; hostname 1–253 ASCII characters; exact-key base 1–127 and full versioned key 4–135 characters under the locked regex; at most 4,096 total records, 16,384 dispositions, 32 hostnames per location, 64 location scopes, and two audiences. Each compact canonical audience projection is at most 2 MiB UTF-8, measured after projection construction and before injection. Catalog text rejects C0/C1 controls, bidi overrides/isolates, unpaired surrogates, HTML markup delimiters, and leading/trailing whitespace. `locationCode` is 2–8 uppercase ASCII alphanumerics. Boundary tests pin both the 127-character base and 135-character maximum full key plus 2 MiB projection pass/fail boundaries.

`choiceKind` is closed to:

```text
reason | activity | role | checklist | daySet |
roundsPreparation | roundsParticipation | roundsFollowUp |
presentationFormat | presentationTiming | presentationElement |
documentationWorkflow | documentationTiming |
feedbackCadence | feedbackInitiator | feedbackSetting |
accessItem | duePoint
```

`locationTypeCode` is closed to `inpatient | outpatient | consult-liaison | emergency | community | mixed`. `officialLink.purposeCode` is closed to `arrival-map | orientation | access-training | documentation-policy | attendance-policy | feedback-policy | directory | parking-transit | official-clinical-policy | reviewed-operational`.

Official URLs are absolute HTTPS with no userinfo, query, or fragment. Their lowercase hostname must exactly match both `visibleHostname` and a hostname declared by every scoped training location. A future need for query-bearing institutional URLs requires a separately reviewed schema change rather than a sensitive-parameter heuristic.

Each record's `contentDigest` is SHA-256 over compact canonical UTF-8 JSON of that record with `contentDigest` omitted. Object keys sort recursively; array order remains semantic. The value is `sha256-` plus 43 unpadded base64url characters.

Source `records` and `dispositions` must be unique and ascending by exact key. Set-like `audiences`, `locationKeys`, and `officialHostnames` must also be unique and ascending; template token order and local-plan row order remain semantic. Unsorted source is invalid rather than silently normalized.

The combined catalog revision is SHA-256 over compact canonical UTF-8 JSON:

```json
{"catalog": {"schemaVersion": 1, "records": []}, "governance": {"schemaVersion": 1, "manifestRevision": 1, "rotationEditionV2": "disabled", "dispositions": []}}
```

The public audience projection also carries `projectionDigest`, computed over its complete closed object with only `projectionDigest` omitted. Browser preparation recomputes every public record digest and the projection digest.

For editions, `contentDigest` is the envelope's stored `digest`: SHA-256 over compact canonical UTF-8 JSON `{format:'cw-rotation-edition',schemaVersion:2,config}` before the `digest` field is added. Preview receipts use that same future envelope digest; there is no second ambiguously named config digest.

### Exact reference typing

The resolver applies this closed field map; no other record-kind coercion or label-based alias is allowed:

| Field | Required record constraint |
|---|---|
| `context.trainingLocationKey` | `trainingLocation` |
| `context.curatorProfileKey` | `curatorProfile`, scoped to the selected location; its `roleKey` is `choice/role` |
| `phraseSetKey` | `phraseSet`, scoped to the selected location when location-scoped |
| `pathItems[].reasonKey`, `resources[].reasonKey` | `choice/reason` |
| `arrival.placeKey`, `schedule.events[].placeKey` | `place` |
| `arrival.checkInRoleKey`, `attendance.absenceRoleKey`, `contacts[].roleKey` | `choice/role` |
| `arrival.linkKey` | `officialLink/arrival-map` |
| `schedule.events[].daySetKey` | `choice/daySet` |
| `schedule.events[].activityKey` | `choice/activity` |
| `rounds.preparationKey` | `choice/roundsPreparation` |
| `rounds.participationKey` | `choice/roundsParticipation` |
| `rounds.followUpKey` | `choice/roundsFollowUp` |
| `presentation.formatKey` | `choice/presentationFormat` |
| `presentation.timingKey` | `choice/presentationTiming` |
| `presentation.elementKeys[]` | `choice/presentationElement` |
| `documentation.workflowKey` | `choice/documentationWorkflow` |
| `documentation.timingKey` | `choice/documentationTiming` |
| `documentation.policyLinkKey` | `officialLink/documentation-policy` |
| `attendance.policyLinkKey` | `officialLink/attendance-policy` |
| `feedback.cadenceKey` | `choice/feedbackCadence` |
| `feedback.initiatorKey` | `choice/feedbackInitiator` |
| `feedback.settingKey` | `choice/feedbackSetting` |
| `accessItems[].itemKey` | `choice/accessItem` |
| `accessItems[].dueKey` | `choice/duePoint` |
| `accessItems[].linkKey` | `officialLink` with purpose `access-training | parking-transit | reviewed-operational` |
| `contacts[].linkKey` | `officialLink/directory` |
| `checklistItems[].itemKey` | `choice/checklist` |
| `resources[].linkKey` | any scoped `officialLink` purpose |
| `localPreset.phraseSetKey` and every preset local-plan key | the same constraints as an ordinary configuration |

All configuration catalog references except the selected training location must be shared or explicitly scoped to that location and eligible for the current audience. `arrival.timingCode` is `at | by`; `schedule.endQualifierCode` is `at | about | no-later-than`; placement/local priority remains `required | recommended | optional`.

### Catalog scope and lifecycle

- Every record has one or two audience values.
- Once an exact key exists in repository history, its canonical record bytes and `contentDigest` are immutable. Corrections add a new `@vN` key and deprecate/block the old key; they never rewrite the old record.
- `trainingLocation` has no `locationKeys`; it is the root scope record.
- `curatorProfile`, `place`, `officialLink`, and `localPreset` require 1–64 location keys.
- `phraseSet` and `choice` omit `locationKeys` when shared; when present, the list contains 1–64 keys.
- An official link's lowercase URL hostname must equal `visibleHostname` and occur in every referenced location's `officialHostnames`.
- The disposition manifest has exactly one entry for each source record and no orphan entry.
- `pending` is absent from all public views. `reviewed` appears in builder selection and learner resolution. `deprecated` appears only in learner resolution. `blocked` exposes only its exact key in `blockedKeys`; blocked record content is absent.
- `selectionKeys`, `resolutionRecords`, and `blockedKeys` are sorted by exact key before projection hashing; invalid unsorted source never reaches projection.
- Because links are unsigned, deprecated keys are accepted from any otherwise-valid learner payload. Builder import/generation requires reviewed selection keys and rejects deprecated keys with `CURATOR_IMPORT_RESELECTION_REQUIRED`.

### Phrase templates

The `phraseSet` record carries exactly these templates and token sets:

| Template | Exact allowed tokens |
|---|---|
| `arrival` | `timing`, `time`, `place`, `role` |
| `scheduleWindow` | `dayStart`, `dayEnd`, `endQualifier` |
| `scheduleRangeWithPlace` | `daySet`, `startTime`, `endTime`, `activity`, `place`, `priority` |
| `scheduleRangeWithoutPlace` | `daySet`, `startTime`, `endTime`, `activity`, `priority` |
| `schedulePointWithPlace` | `daySet`, `startTime`, `activity`, `place`, `priority` |
| `schedulePointWithoutPlace` | `daySet`, `startTime`, `activity`, `priority` |
| `rounds` | `preparation`, `participation`, `followUp` |
| `presentation` | `format`, `timing`, `elements` |
| `documentation` | `workflow`, `timing` |
| `attendance` | `events`, `absenceRole` |
| `feedback` | `cadence`, `initiator`, `setting` |
| `access` | `item`, `due` |
| `contact` | `role` |
| `checklist` | `item`, `priority` |
| `resourceWithReason` | `title`, `priority`, `week`, `reason`, `hostname` |
| `resourceWithoutReason` | `title`, `priority`, `week`, `hostname` |
| `changeSummary` | `kinds`, `count` |

Templates contain plain text plus `{token}` placeholders only. Tokens cannot repeat, unknown tokens fail validation, and runtime substitution accepts only resolved catalog fragments or validated generated primitives.

A `phraseSet` stores all table rows in one exact object; every row is `{text,tokens}`, and `tokens` must equal the table's ordered list byte-for-byte. For example:

```json
{"key":"phrases.example@v1","kind":"phraseSet","contentDigest":"sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","displayName":"Example reviewed wording","templates":{"arrival":{"text":"On the first day, arrive {timing} {time} and meet at {place}. Check in with {role}.","tokens":["timing","time","place","role"]}},"audiences":["ms3"],"verifiedOn":"2026-08-19"}
```

The abbreviated example shows one row for readability; the actual schema requires every table row and rejects extras. `localPreset` stores `{displayName,localPlan,phraseSetKey}` plus common metadata; `localPlan` is byte-for-byte the same closed schema and caps as a public v2 configuration, with no preset key nested inside it.

Generated primitives are locale-independent and testable: `HH:MM` displays in English 12-hour time with `AM`/`PM`; ISO dates display with fixed English full month names; same-year ranges show the year once and cross-year ranges show both. Lists render one item alone, two as `A and B`, and three or more with an Oxford comma. Fixed labels are `Required | Recommended | Optional`; `at | by`; `at | about | no later than`; location types `Inpatient | Outpatient | Consult-liaison | Emergency | Community | Mixed`; and change kinds `Initial edition | Edition details | Curriculum selection | Curriculum priority | Curriculum reason | Schedule | Arrival | Team workflow | Access preparation | Contacts | Checklist | Official resources`. The generated title is `<locationCode> MS3 psychiatry rotation` or `<locationCode> Resident psychiatry rotation`. No browser locale API determines learner-visible bytes.

### Dates, IDs, coverage, and dependent actions

- `createdAgainstCoreRevision` remains the existing lowercase 40-character Git revision contract. Catalog, projection, record, reference-set, config, and envelope digests use `sha256-` plus 43 unpadded base64url characters; do not migrate the unrelated core-revision format.
- Curator generation receives an injected local-calendar `generationDate` in `YYYY-MM-DD`; it rejects `editionCheckedOn` later than that date. Learner validation checks only that it is a real date and does not compare the learner's clock.
- V1 salvage maps a real non-future `lastVerified` date to `editionCheckedOn`; otherwise it leaves `editionCheckedOn` empty for reselection.
- Core placement IDs remain `core:<ref>:<occurrence>` and are regenerated during salvage.
- Full fingerprints match `^[A-Z0-9]{2,8}-(MS3|RES)-[0-9A-HJKMNP-TV-Z]{6}$`; the audience token is `MS3` or `RES`, and the suffix is the first 30 digest bits encoded as six characters with the Crockford Base32 alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`. Do not substitute RFC 4648 Base32 or modulo/truncation over a textual digest.
- Local row IDs are `local:schedule:<n>`, `local:access:<n>`, `local:contact:<n>`, `local:checklist:<n>`, and `local:resource:<n>` using the lowest unused positive integer across the full draft ID union.
- Generated checklist IDs are `local:generated:arrival` and `local:generated:access:<access-instance-id>`.
- The total resolved learner checklist count is at most 24, counting every explicit checklist row plus the generated arrival row when arrival is present plus one generated row per access item. Builder validation and learner resolution both reject a configuration over that combined cap.
- Exact duplicate schedule-event semantic tuples `(daySetKey,startTime,endTime,activityKey,placeKey)` are rejected. Legitimate time overlap between different activities is not inferred to be an error.
- A schedule event referenced by attendance cannot be removed until the curator removes that attendance reference; direct reducer attempts are semantic no-ops.
- Empty repeatable collections are omitted from the final public `localPlan`, never serialized as empty arrays or `null`.
- Coverage is advisory, not a Generate blocker: `where` needs `arrival.placeKey`; `when` needs arrival timing/time; `prepare` needs one access item; `help` needs one contact or arrival check-in role; `first` needs one checklist item or schedule event.

### Change summary

`kindCodes` is closed to:

```text
initial | edition-context | curriculum-selection | curriculum-priority |
curriculum-reason | schedule | arrival | workflow | access | contacts |
checklist | resources
```

Edition 1 stores `{"kindCodes":["initial"],"changedItemCount":0}`. Later counts use changed high-level units: one per changed context field; one per path placement added/removed; one per placement whose priority, reason, week, or order changed; one per changed single local category; and one per repeatable local row added, removed, or changed. The count is capped at 255; `kindCodes` are unique and ordered by the list above.

Field-to-kind mapping is exact:

| Changed semantic field/unit | Kind code |
|---|---|
| training location, curator profile, rotation dates, checked-on date, or phrase set | `edition-context` |
| path placement added, removed, or repeated | `curriculum-selection` |
| placement priority | `curriculum-priority` |
| placement reason | `curriculum-reason` |
| placement week/order, schedule bounds, or schedule event | `schedule` |
| arrival | `arrival` |
| rounds, presentation, documentation, attendance, or feedback | `workflow` |
| access item | `access` |
| contact | `contacts` |
| checklist item | `checklist` |
| official resource | `resources` |

One placement changed in several placement fields counts once but may emit several kind codes. A schedule-bounds change counts one, and each added/removed/changed schedule row counts one. Each changed singleton workflow category counts one. `createdAgainstCoreRevision`, `createdAgainstLocalCatalogRevision`, derived edition number, generated summary, receipts, affirmations, and publication state never contribute.

### V1 salvage

- Parse at most 64 KiB, require exact v1 structure and matching digest, and treat the source as untrusted.
- Preserve current audience/path, valid core refs, week/order/priority, and real ordered rotation dates even when the rotation is in the future; only `lastVerified` is bounded by `generationDate` before mapping to `editionCheckedOn`.
- Regenerate all placement IDs and compact orders per week.
- Drop unknown refs without echoing them; report only the dropped count. A draft with zero surviving placements remains incomplete until the curator selects curriculum.
- Discard and never display/log/store all names, codes, titles, rationales, orientation prose, contacts, checklist/resource values, raw URLs, change note, v1 fingerprint, and v1 edition number.
- Create v2 Edition 1 with empty reviewed-catalog selections, no base envelope, no receipts, and false affirmations. V1 browser keys and the original file remain untouched.

### Test interpretation

“Browser/server parity” means Python schema/build validation and browser contract validation; no server runtime is added. Enabled happy-path browser tests patch only the exact injected catalog global in memory through Playwright route fulfillment using reviewed synthetic fixtures. Checked-in production builds remain disabled and empty.

## File Responsibility Map

Create:

- `13_Faculty_Resources/Rotation_Curation/rotation_edition_catalog.json` — immutable catalog source, initially empty.
- `13_Faculty_Resources/Rotation_Curation/rotation_edition_catalog.schema.json` — closed source-record variants and caps.
- `13_Faculty_Resources/Rotation_Curation/rotation_edition_catalog_governance.json` — dispositions plus the one default-off publication value.
- `13_Faculty_Resources/Rotation_Curation/rotation_edition_catalog_governance.schema.json` — closed lifecycle manifest.
- `13_Faculty_Resources/_automation/validate_rotation_edition_catalog.py` and `test_validate_rotation_edition_catalog.py` — canonical digest, relationship, projection, privacy-safe error, and cap gates.
- `13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_catalog.js` — hostile-object-safe catalog preparation, exact reference resolution, phrase rendering, display model, and reference digest.
- `13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_v1_salvage.js` — curator-only v1 digest validation and structural salvage.
- `tests/fd-edition-catalog.test.mjs`, `fd-edition-salvage.test.mjs`, `fd-curator-publish.test.mjs`, `rotation-edition-build-governance.test.mjs`, and `fd-edition-adversarial.test.mjs`.
- `tests/fixtures/rotation-edition-catalog/` — reviewed synthetic catalog/governance and invalid mutations.
- `tests/smoke/rotation-edition-v2.spec.js` and `rotation-edition-fixture.js` — enabled synthetic two-audience journeys without changing production source.
- `tests/smoke/run-local-playwright.sh` — self-contained local browser-test wrapper with private server state and exact-PID cleanup.
- `13_Faculty_Resources/_automation/site_build/vendor/qrcode-generator-1.4.4.js` and adjacent `.LICENSE`.
- `docs/pilots/rotation-edition-v2-pilot-protocol.md` — draft human pilot gate.

Modify:

- `rotation_edition.schema.json`, edition fixtures, Python edition validator/tests.
- `frontdoor_catalog.py`, its Python tests, `build_deploy.py`, `resident_section.py`, `build_and_check.sh`, `.github/workflows/ci.yml`, and `check-static-site.mjs`.
- `common.py`, `test_common.py`, and `tests/parallel-ceilings.test.mjs` for the catalog, curator-salvage, and QR-vendor markers and the pinned ceiling.
- `fd_edition_contract.js`, `fd_edition_project.js`, `fd_edition_student.js`, `fd_curator.js`, `fd_today.js`, `fd_path.js`, and their focused tests.
- `spa_index.html`, `rotation-curator.html`, `frontdoor.css`, and focused shell/render/contrast tests.
- `tests/smoke/rotation-curator.spec.js`, `tests/smoke/frontdoor-runtime.spec.js`, Playwright configuration, `tests/smoke/start-local-servers.sh`, and `tests/smoke-server-launcher.test.mjs` where existing v1 expectations, startup-atomicity fixtures, or local server orchestration must become v2 expectations.

Do not create a third site, add raw catalog files to `site_manifest.json`, or modify reviewed clinical curriculum.

---

## Task 0: Checkpoint the approved design and executable plan

**Files:**

- Modify: `docs/superpowers/specs/2026-08-19-structured-rotation-edition-catalog-design.md`
- Modify: `docs/superpowers/plans/2026-08-19-attending-curated-rotation-editions.md`
- Create: `docs/superpowers/plans/2026-08-19-structured-rotation-edition-catalog-v2.md`

- [ ] **Step 1: Verify the three-document handoff**

Confirm the design records user approval, the earlier plan clearly identifies its failed/superseded and historical-only portions, and this plan contains no placeholder paths, unbalanced fences, duplicate task headings, or unstaged implementation changes.

- [ ] **Step 2: Commit the authoritative checkpoint**

```bash
git diff --check
git add docs/superpowers/specs/2026-08-19-structured-rotation-edition-catalog-design.md docs/superpowers/plans/2026-08-19-attending-curated-rotation-editions.md docs/superpowers/plans/2026-08-19-structured-rotation-edition-catalog-v2.md
git commit -m "docs: plan structured rotation edition v2"
```

Expected: implementation starts from a clean worktree with the exact approved architecture recoverable in repository history.

---


## Task 1: Add the static catalog, disposition manifest, projection, and dual default-off gate

**Files:**

- Create: `13_Faculty_Resources/Rotation_Curation/rotation_edition_catalog.json`
- Create: `13_Faculty_Resources/Rotation_Curation/rotation_edition_catalog.schema.json`
- Create: `13_Faculty_Resources/Rotation_Curation/rotation_edition_catalog_governance.json`
- Create: `13_Faculty_Resources/Rotation_Curation/rotation_edition_catalog_governance.schema.json`
- Create: `13_Faculty_Resources/_automation/validate_rotation_edition_catalog.py`
- Create: `13_Faculty_Resources/_automation/test_validate_rotation_edition_catalog.py`
- Create: `tests/fixtures/rotation-edition-catalog/valid-catalog.json`
- Create: `tests/fixtures/rotation-edition-catalog/valid-governance.json`
- Create: `tests/rotation-edition-build-governance.test.mjs`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor_catalog.py`
- Modify: `13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py`
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py`
- Modify: `13_Faculty_Resources/_automation/site_build/resident_section.py`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Modify: `13_Faculty_Resources/Rotation_Curation/rotation-curator.html`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_student.js`
- Modify: `tests/fd-edition-storage.test.mjs`
- Modify: `tests/fd-shell-boot.test.mjs`
- Modify: `13_Faculty_Resources/_automation/site_build/build_and_check.sh`
- Modify: `13_Faculty_Resources/_automation/site_build/check-static-site.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: empty production catalog/governance source and synthetic test fixtures.
- Produces: `load_catalog`, `load_governance`, `validate_catalog`, `build_audience_projection`, `canonical_json_bytes`, `canonical_digest`; injected `FD_ROTATION_EDITION_CATALOG`; `siteContext.localCatalogRevision`; and a pre-decode default-off learner gate.

- [ ] **Step 1: Write the failing catalog and projection tests**

Create fixtures using harmless `Example Training Unit`, `Example Attending`, and `https://example.edu/orientation`. Require exact record/disposition coverage, recomputed content digests, real dates, HTTPS/no-userinfo, hostname/location/audience scope, template token sets, cycle rejection, all catalog caps, reviewed/deprecated/pending/blocked projection behavior, stable combined/projection digests, and privacy-safe errors that contain JSON pointers but not rejected values. In a temporary Git repository, prove a prior exact-key record cannot be edited or removed even when its digest is recomputed; adding a new versioned key and changing only its disposition are allowed.

The valid governance fixture begins:

```json
{
  "schemaVersion": 1,
  "manifestRevision": 1,
  "rotationEditionV2": "enabled",
  "dispositions": [
    {"key":"location.example-unit@v1","status":"reviewed","changedOn":"2026-08-19","reviewRef":"SYNTHETIC-TEST-REVIEW"}
  ]
}
```

Extend the live signature to `build_frontdoor_payload(site, curriculum, catalog, revision, rotation_projection)` so it returns `rotationEditionCatalog`, and both HTML consumers contain exactly one replaceable `FD_ROTATION_EDITION_CATALOG` value after injection. Add Node/static-QA assertions that production source is empty/disabled, shell/curator gate/revision bytes match, and raw catalog/governance files are absent from both publish trees.

- [ ] **Step 2: Run the focused tests to capture RED**

```bash
python3 13_Faculty_Resources/_automation/test_validate_rotation_edition_catalog.py
python3 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py
node --test tests/rotation-edition-build-governance.test.mjs tests/fd-edition-storage.test.mjs tests/fd-shell-boot.test.mjs
```

Expected: fail because the catalog schemas/validator/projection/global and pre-decode publication gate do not exist.

- [ ] **Step 3: Implement the Python catalog contract and empty production sources**

Use these exact public functions:

```python
def canonical_json_bytes(value: object) -> bytes: ...
def canonical_digest(value: object) -> str: ...
def load_catalog(root: Path) -> dict: ...
def load_governance(root: Path) -> dict: ...
def validate_catalog(catalog: dict, governance: dict, *, today: date) -> None: ...
def build_audience_projection(catalog: dict, governance: dict, audience: str) -> dict: ...
def validate_immutable_against_ref(root: Path, git_ref: str, catalog: dict) -> None: ...
```

`build_audience_projection()` returns this exact closed shape:

```json
{
  "schemaVersion": 1,
  "audience": "ms3",
  "revision": "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "projectionDigest": "sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  "rotationEditionV2": "disabled",
  "selectionKeys": [],
  "resolutionRecords": [],
  "blockedKeys": []
}
```

Create production catalog `{ "schemaVersion": 1, "records": [] }` and governance `{ "schemaVersion": 1, "manifestRevision": 1, "rotationEditionV2": "disabled", "dispositions": [] }`. Validation errors expose only stable error code/path text. The validator CLI accepts optional `--compare-ref <40-lowercase-hex-SHA>` and invokes `git show` with an argument array and `shell=False`, without checking out or changing the worktree; a missing prior catalog at the feature's first introduction is allowed, while later removal/mutation of an existing exact key fails.

Because `localPreset` must be final before the public edition-schema cutover, the Draft-7 catalog schema embeds the locked v2 `localPlan` as its own `definitions.localPlanV2`; it must not `$ref` the still-v1 `rotation_edition.schema.json` during Task 1. Task 3 adds a canonical subschema-parity test so the catalog preset definition and final public local-plan definition cannot drift.

- [ ] **Step 4: Inject the eighth Front Door value into both audience pages**

Add `FD_ROTATION_EDITION_CATALOG` to `DATA_DEFAULTS`, extend `build_frontdoor_payload(...)`, and inject the same projection object into the learner shell and curator for each audience. `resident_section.py` must replace the inherited MS3 value with the resident projection. Configure CI checkout with full history and invoke the immutability comparison against the PR base SHA (or the prior push SHA); ordinary local/Netlify validation remains history-independent.

Add to both source pages before shared modules:

```javascript
var FD_ROTATION_EDITION_CATALOG={};
```

Build `FD_SITE_CONTEXT` / `FD_CURATOR_CONTEXT` with `localCatalogRevision` and `rotationEditionV2` copied from that injected object through descriptor-safe reads; malformed values become an empty revision plus `disabled`.

- [ ] **Step 5: Add the interim pre-decode learner gate**

Change `fdEditionRuntimeInputs()` and `fdEditionResolveStartup()` so disabled publication does not read an edition storage key and never calls the v1/v2 decoder or projector. With no edition fragment, return ordinary core mode. With `#edition=`, return `rejected` and fixed receipt code `EDITION_DISABLED` without echoing the fragment. Leave all v1 storage bytes untouched. Curator Generate remains disabled and must expose the same gate state in its fixed copy.

- [ ] **Step 6: Wire validation into build and CI, then verify GREEN**

Run:

```bash
python3 13_Faculty_Resources/_automation/test_validate_rotation_edition_catalog.py
python3 13_Faculty_Resources/_automation/validate_rotation_edition_catalog.py
python3 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py
node --test tests/rotation-edition-build-governance.test.mjs tests/fd-edition-storage.test.mjs tests/fd-shell-boot.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: production projections are empty/disabled; both audience builds pass; incoming edition fragments cannot decode or write while disabled.

- [ ] **Step 7: Commit**

```bash
git add 13_Faculty_Resources/Rotation_Curation/rotation_edition_catalog.json 13_Faculty_Resources/Rotation_Curation/rotation_edition_catalog.schema.json 13_Faculty_Resources/Rotation_Curation/rotation_edition_catalog_governance.json 13_Faculty_Resources/Rotation_Curation/rotation_edition_catalog_governance.schema.json 13_Faculty_Resources/_automation/validate_rotation_edition_catalog.py 13_Faculty_Resources/_automation/test_validate_rotation_edition_catalog.py tests/fixtures/rotation-edition-catalog tests/rotation-edition-build-governance.test.mjs 13_Faculty_Resources/_automation/site_build/frontdoor_catalog.py 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py 13_Faculty_Resources/_automation/site_build/build_deploy.py 13_Faculty_Resources/_automation/site_build/resident_section.py 13_Faculty_Resources/_automation/site_build/spa_index.html 13_Faculty_Resources/Rotation_Curation/rotation-curator.html 13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_student.js tests/fd-edition-storage.test.mjs tests/fd-shell-boot.test.mjs 13_Faculty_Resources/_automation/site_build/build_and_check.sh 13_Faculty_Resources/_automation/site_build/check-static-site.mjs .github/workflows/ci.yml
git commit -m "feat: add disabled rotation edition catalog"
```

---

## Task 2: Add the browser catalog snapshot, exact resolver, and generated display model

**Files:**

- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_catalog.js`
- Create: `tests/fd-edition-catalog.test.mjs`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor_catalog.py`
- Modify: `13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py`
- Modify: `13_Faculty_Resources/_automation/site_build/common.py`
- Modify: `13_Faculty_Resources/_automation/site_build/test_common.py`
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py`
- Modify: `13_Faculty_Resources/_automation/site_build/resident_section.py`
- Modify: `tests/parallel-ceilings.test.mjs`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Modify: `13_Faculty_Resources/Rotation_Curation/rotation-curator.html`

**Interfaces:**

```javascript
fdEditionCatalogSnapshot(projection,expectedAudience,subtle)
  // Promise<{ok,snapshot,errors}>
fdEditionCatalogRecord(snapshot,exactKey,mode,expectedKind,locationKey)
  // {ok,record,error}; mode is "builder" or "learner"
fdEditionCatalogResolve(config,snapshot,mode,siteContext,subtle)
  // Promise<{ok,resolved,referenceSetDigest,displayModel,errors}>
fdEditionPublicationEnabled(snapshot)
  // boolean
```

The module has no DOM, storage, network, clock, or mutable global dependency. A closure-private `WeakSet` brands successfully prepared snapshots; later functions reject cloned or forged lookalikes.

- [ ] **Step 1: Write failing canonicalization and hostile-input tests**

Cover valid synthetic MS3 and resident projections; wrong audience; malformed gate; duplicate or unlisted keys; tampered `contentDigest`, `revision`, or `projectionDigest`; accessors, proxies, revoked proxies, inherited properties, `__proto__`, sparse/oversized arrays, cycles, Unicode edge cases, and promise rejection from `subtle.digest`. Assert no accessor executes, no caller object is frozen or mutated, no raw rejected key/value appears in an error, and a failed preparation result cannot be used by the resolver.

Add builder-versus-learner lifecycle assertions:

```javascript
assert.equal(fdEditionCatalogRecord(snapshot,reviewedKey,'builder','choice',locationKey).ok,true);
assert.equal(fdEditionCatalogRecord(snapshot,deprecatedKey,'builder','choice',locationKey).error,'CATALOG_RESELECTION_REQUIRED');
assert.equal(fdEditionCatalogRecord(snapshot,deprecatedKey,'learner','choice',locationKey).ok,true);
assert.equal(fdEditionCatalogRecord(snapshot,blockedKey,'learner','choice',locationKey).error,'CATALOG_BLOCKED');
```

- [ ] **Step 2: Capture RED**

```bash
node --test tests/fd-edition-catalog.test.mjs
python3 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py
python3 13_Faculty_Resources/_automation/site_build/test_common.py
```

Expected: the browser module, shared marker, injection order, and exact resolver are absent.

- [ ] **Step 3: Implement descriptor-safe snapshot preparation**

Use private helpers that read only enumerable own data properties, reject symbols/accessors/prototypes other than `Object.prototype` or `null`, cap array length before traversal, and copy to fresh null-prototype data. Reproduce the Python compact canonical JSON and unpadded base64url SHA-256 algorithms byte-for-byte.

The trusted snapshot contains recursively frozen copied plain data plus lookup tables created inside the closure:

```javascript
{
  schemaVersion:1,
  audience:'ms3',
  revision:'sha256-...',
  projectionDigest:'sha256-...',
  rotationEditionV2:'disabled',
  selectionKeys:[],
  resolutionRecords:[],
  blockedKeys:[]
}
```

Do not expose the lookup tables, trust brand, canonicalizer, or mutable record references. `fdEditionCatalogRecord()` returns a fresh recursively frozen record copy; resolver internals use only the closure-private validated record. `fdEditionPublicationEnabled()` returns true only for a branded snapshot whose exact gate value is `enabled`.

- [ ] **Step 4: Implement typed resolution and phrase rendering**

Require descriptor-safe `siteContext.audience` to equal the branded snapshot audience, `siteContext.localCatalogRevision` to equal its revision, and `siteContext.rotationEditionV2` to equal its gate before resolving. For every reference, require exact kind, audience, location scope, lifecycle mode, and immutable version. Resolve the complete graph before generating any display text. Compute `referenceSetDigest` asynchronously with injected Web Crypto SHA-256 over compact canonical JSON of unique sorted `[exactKey,contentDigest]` pairs. A missing, rejecting, or malformed `subtle.digest` fails the whole resolution; do not introduce a second handwritten SHA-256 implementation.

Implement closed substitution helpers for the exact phrase-template inventory. A template renders only when its own token set exactly matches the required set; substitutions come only from resolved record fields or already-validated date/time/enum/number primitives. Reject unresolved braces, HTML-significant control characters, or any attempt to use a catalog key as fallback display text.

Return one closed display model containing:

```javascript
{
  card:{title:'',locationName:'',locationCode:'',locationTypeLabel:'',curatorName:'',curatorRole:'',audienceLabel:'MS3',durationLabel:'6 weeks',rotationDates:'',editionCheckedOn:'',editionCheckedOnLabel:'Self-attested',editionNumber:1,fingerprintPrefix:'',fingerprint:'',identityNotice:'Curator identity and institutional endorsement are not digitally verified by this link.',fingerprintNotice:'Compare this fingerprint with the curator. Matching codes confirm the same edition content, not identity or institutional approval.',provenance:[]},
  revisions:{createdAgainstCoreRevision:'',currentCoreRevision:'',coreMatches:true,createdAgainstCatalogRevision:'',currentCatalogRevision:'',catalogMatches:true},
  pathItems:[],
  firstDay:{arrival:null,accessItems:[],contacts:[],checklistItems:[]},
  typicalDay:null,
  workflow:{rounds:null,presentation:null,documentation:null},
  attendanceFeedback:{attendance:null,feedback:null},
  resources:[],
  authority:{coreLabel:'Reviewed clerkship Library',localLabel:'Local rotation guidance',requiredLabel:'Required by this local rotation',recommendedLabel:'Recommended by this local rotation',optionalLabel:'Optional for this local rotation',resourceLabel:'Locally curated official resource',localBoundary:'Local rotation guidance does not replace current institutional policy or supervision.',documentationGuardrail:'Use only the approved institutional record. Do not place patient information in this site. Complete documentation only with supervisor guidance and review.'},
  changeSummary:{kindCodes:[],changedItemCount:0,text:'',provenanceLabel:'Locally supplied edition summary; change lineage is not authenticated.'},
  emptyLocalPlan:false
}
```

The nested display-model interfaces are also closed and exact:

| Field | Exact item shape |
|---|---|
| `card.provenance[]` | `{recordKind,displayLabel,verifiedOn}`; `recordKind` is `trainingLocation | curatorProfile | phraseSet | officialLink` |
| resolver-stage `pathItems[]` | `{instanceId,ref,week,order,priority,priorityLabel,reasonText?}` |
| validated-edition `pathItems[]` | the resolver-stage fields plus `title`, copied only from the current canonical core index by Task 3 |
| link view | `{title,url,visibleHostname,purposeCode}` |
| `firstDay.arrival` | `{text,link?}` |
| `firstDay.accessItems[]` | `{id,text,checklistId,link?}` |
| `firstDay.contacts[]` | `{id,text,link?}` |
| `firstDay.checklistItems[]` | `{id,text,priority,priorityLabel,sourceCode}`; source is `arrival | access | selected` |
| `typicalDay` | `{summaryText,eventItems:[{id,text,priority,priorityLabel}]}` |
| `workflow.rounds` / `presentation` | `{text}` |
| `workflow.documentation` | `{text,guardrailText,link?}` and `guardrailText` must equal `authority.documentationGuardrail` |
| `attendanceFeedback.attendance` | `{text,link?}` |
| `attendanceFeedback.feedback` | `{text}` |
| `resources[]` | `{id,text,title,url,visibleHostname,purposeCode,priority,priorityLabel,week,reasonText?,authorityLabel}`; `authorityLabel` must equal `authority.resourceLabel` |

Every object in this table rejects extra keys. Optional fields are absent, not `undefined` or `null`; the explicit top-level category `null` values are the only empty-category sentinel. Every `link` property uses the exact link-view shape. Arrays retain the public configuration caps and deterministic order. No nested field may contain a raw catalog key as learner-visible copy.

The catalog resolver derives `card.audienceLabel` / `card.durationLabel` only from the locked pair: `ms3` / `ms3-six-week` becomes `MS3` / `6 weeks`, and `resident` / `resident-four-week` becomes `Resident` / `4 weeks`; every other pair rejects. The card and curator previews render these as `MS3 · 6 weeks` or `Resident · 4 weeks` and pin both exact strings in unit and browser tests.

The catalog resolver's resolution-stage model keeps `card.fingerprint:''` because the envelope `contentDigest` does not exist at that layer; it is never renderable directly. Task 3 clones and fills the full fingerprint and canonical core titles only inside the branded validated-edition snapshot. Each official resource includes resolved `title`, `url`, `visibleHostname`, `purposeCode`, `priority`, `week`, and generated learner copy. Provenance separately labels immutable `verifiedOn` values for the location, curator, phrase set, and referenced official links; it never relabels `editionCheckedOn` as repository verification. The resolver fills both created/current revision pairs from config, branded snapshot, and descriptor-safe `siteContext`. Core or catalog revision drift remains valid only when every canonical core ref and exact catalog record still resolves; visible `coreMatches:false` / `catalogMatches:false` comparisons explain the difference. The unchanged configuration/fingerprint continues to open the latest reviewed core content rather than freezing an outdated clinical page. The fixed `authority` strings are code-owned, never catalog/config fields, and must render wherever the corresponding local/core item appears.

- [ ] **Step 5: Inject the module in a fixed, auditable order**

Register `fd_edition_catalog.js` as a shared Front Door snippet after the injected catalog value and before contract/student/curator consumers. Add a unique marker to `common.py`, update its focused tests and the pinned shared-marker ceiling, and ensure both audience assemblers inject exactly one identical module byte sequence.

- [ ] **Step 6: Verify resolver GREEN and both builds**

```bash
node --test tests/fd-edition-catalog.test.mjs tests/parallel-ceilings.test.mjs
python3 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py
python3 13_Faculty_Resources/_automation/site_build/test_common.py
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: every valid phrase renders without raw IDs or unresolved tokens; forged/tampered projections fail closed; production remains empty and disabled.

- [ ] **Step 7: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_catalog.js tests/fd-edition-catalog.test.mjs 13_Faculty_Resources/_automation/site_build/frontdoor_catalog.py 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py 13_Faculty_Resources/_automation/site_build/common.py 13_Faculty_Resources/_automation/site_build/test_common.py 13_Faculty_Resources/_automation/site_build/build_deploy.py 13_Faculty_Resources/_automation/site_build/resident_section.py tests/parallel-ceilings.test.mjs 13_Faculty_Resources/_automation/site_build/spa_index.html 13_Faculty_Resources/Rotation_Curation/rotation-curator.html
git commit -m "feat: resolve reviewed rotation catalog records"
```

---

## Task 3: Cut the public edition schema, contract, and projector over to version 2

**Files:**

- Modify: `rotation_edition.schema.json`
- Modify: `tests/fixtures/rotation-editions/valid-ms3.json`
- Modify: `tests/fixtures/rotation-editions/valid-resident.json`
- Modify: `tests/fixtures/rotation-editions/invalid-extra-property.json`
- Modify: `tests/fixtures/rotation-editions/invalid-unsafe-url.json`
- Create: `tests/fixtures/rotation-editions/synthetic-core-index.json`
- Modify: `13_Faculty_Resources/_automation/validate_rotation_edition_schema.py`
- Modify: `13_Faculty_Resources/_automation/test_validate_rotation_edition_schema.py`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_contract.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_project.js`
- Modify: `tests/fd-edition-contract.test.mjs`
- Modify: `tests/fd-edition-schema-parity.test.mjs`
- Modify: `tests/fd-edition-project.test.mjs`
- Create: `tests/fd-edition-adversarial.test.mjs`

**Interfaces:**

```javascript
fdEditionValidateConfig(config,coreIndex,catalogSnapshot,siteContext,validationContext,subtle)
  // Promise<validation-result>
fdEditionCreateEnvelope(config,coreIndex,catalogSnapshot,siteContext,validationContext,subtle)
  // Promise<envelope-result>
fdEditionValidateEnvelope(envelope,coreIndex,catalogSnapshot,siteContext,validationContext,subtle)
  // Promise<validation-result>
fdEditionDecodePayload(payload,coreIndex,catalogSnapshot,siteContext,validationContext,subtle,totalUrlLength)
  // Promise<validation-result>
fdEditionSemanticConfig(config)
fdEditionGenerateChangeSummary(baseConfig,currentConfig)
fdEditionStorageKeys(audience)
  // fresh {edition,local,curator} copy or null
fdProjectEdition(coreIndex,trustedValidatedEdition)
```

`validationContext` is exactly `{mode:'builder',generationDate:'YYYY-MM-DD'}` or `{mode:'learner',generationDate:''}`. Builder mode rejects future `editionCheckedOn`; learner mode validates only a real date.

- [ ] **Step 1: Replace v1 fixtures with failing v2 schema invariants**

Write a minimal valid v2 fixture and table-driven invalid mutations for every object boundary, collection cap, enum, semantic date/time rule, audience/path/week combination, duplicate ID/tuple, contiguous order, catalog-key field, and public-string-leaf class. Create a closed synthetic core-index fixture with both audience/path/week contracts and the exact `library/example` ref used below; Python and browser parity tests consume that fixture rather than pretending the ref exists in production curriculum. Explicitly assert that these legacy names fail as additional properties wherever inserted:

```text
text title label rationale note changeNote name role url
orientationDetails firstDayArrival typicalDay attendanceFeedback
```

The valid envelope is exactly:

```json
{
  "format":"cw-rotation-edition",
  "schemaVersion":2,
  "config":{
    "audience":"ms3",
    "pathId":"ms3-six-week",
    "editionNumber":1,
    "createdAgainstCoreRevision":"503b42d2538d525c0a3bbf0e1767333e5e617df4",
    "createdAgainstLocalCatalogRevision":"sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    "context":{"trainingLocationKey":"location.example-unit@v1","curatorProfileKey":"curator.example-attending@v1","rotationStart":"2026-09-01","rotationEnd":"2026-10-12","editionCheckedOn":"2026-08-19"},
    "phraseSetKey":"phrases.example@v1",
    "pathItems":[{"instanceId":"core:library/example:1","ref":"library/example","week":1,"order":1,"priority":"required"}],
    "localPlan":{},
    "changeSummary":{"kindCodes":["initial"],"changedItemCount":0}
  },
  "digest":"sha256-b06zyAfiw5Ft1tA1SOptperbXMfZZDdNDWz2A79irxg"
}
```

- [ ] **Step 2: Capture schema, parity, contract, and projector RED**

```bash
python3 13_Faculty_Resources/_automation/test_validate_rotation_edition_schema.py
node --test tests/fd-edition-contract.test.mjs tests/fd-edition-schema-parity.test.mjs tests/fd-edition-project.test.mjs tests/fd-edition-adversarial.test.mjs
```

Expected: v1 prose fields are still accepted and v2 resolver/trust integration is absent.

- [ ] **Step 3: Implement the closed Draft-7 schema and Python semantic checks**

Define exact discriminated local-plan variants and all locked caps from the design. Keep every object closed. Add a test that canonicalizes `rotation_edition.schema.json`'s public local-plan subschema and the catalog schema's `definitions.localPlanV2` and requires byte equality. The Python validator must also enforce constraints awkward in JSON Schema: real dates/times, builder future-date rule when invoked with a generation date, contiguous per-week order, audience week bounds, unique ID union, duplicate schedule tuple rejection, attendance references to existing schedule events, core-ref membership through an explicit audience core context supplied by its caller, key-kind/location/audience resolution through the same synthetic projection, canonical 12 KiB config limit, and digest parity. It must not silently read the repository's MS3 index while validating a resident or isolated fixture.

Do not add a generic text-pattern scanner. The safety boundary is the absence of arbitrary public string positions plus exact catalog resolution.

- [ ] **Step 4: Rebuild the browser contract around trusted catalog resolution**

Before digesting or resolving, copy untrusted envelopes/configs through the existing own-data hostile-object boundary. Validate the full shape and core refs, await `fdEditionCatalogResolve()`, and return a closure-branded trusted result that binds together:

```javascript
{
  envelope:plainEnvelope,
  config:plainConfig,
  resolved:catalogResult.resolved,
  displayModel:catalogResult.displayModel,
  referenceSetDigest:catalogResult.referenceSetDigest,
  fingerprint:'BHU2-MS3-4F7C2Q'
}
```

The fingerprint uses the resolved location code, audience token, and the first 30 bits of SHA-256 over compact canonical JSON `{contentDigest,referenceSetDigest}`, encoded with the locked Crockford alphabet. Sanitize the catalog location code to `A-Z0-9`, 2–8 characters, during catalog validation rather than truncating arbitrary display text. Pin this cross-runtime vector in Python and browser tests: canonical UTF-8 `{"contentDigest":"sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","referenceSetDigest":"sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"}` hashes to hex `faf7d2342ab986807811b00b5285958e36aa8f99d97b9c0692c0d0c8ee5037f0`, whose first 30 bits encode as `ZBVX4D`; location `EXU` and audience `ms3` therefore display `EXU-MS3-ZBVX4D`.

`fdEditionSemanticConfig()` excludes exactly `editionNumber`, `changeSummary`, `createdAgainstCoreRevision`, and `createdAgainstLocalCatalogRevision`. `fdEditionGenerateChangeSummary()` implements the locked kind ordering/count rules and never consumes authored summary text. Candidate generation uses a two-stage rule:

1. Compare curated semantic content while ignoring both created-against revisions. If it is unchanged, preserve the base envelope's exact config/envelope bytes, edition number, both created-against revisions, summary, digest, and fingerprint even when the current site core and/or catalog revision changed. Validation still resolves every exact ref against the current core/catalog and the display model visibly reports the current revisions and mismatch flags.
2. If any genuine learner-visible curation field changed, increment exactly once, generate the summary, and set both created-against revisions to the current site core/catalog revisions before computing the new digest/fingerprint.

Pin regressions for core-only drift, catalog-only drift, combined revision-only drift, and a genuine curation edit after either drift. Revision-only drift never increments or silently changes identity; the later genuine edit increments once and records both then-current revisions.

- [ ] **Step 5: Restrict projection to the trusted v2 result**

Preserve the cross-module trust accessor `fdEditionTrustedSnapshot(validationResult)`, which returns a fresh recursively frozen plain snapshot or `null` only when the result carries the closure-private validation brand. The snapshot contains the normalized envelope/config, resolved display model, reference-set digest, and fingerprint; its bound display model includes `card.fingerprint` as a full generated value. `fdProjectEdition(coreIndex,trustedValidatedEdition)` calls that accessor and rejects raw envelopes and copied trust lookalikes. It clones the existing current-audience index, decorates only selected path placements with `instanceId`, `priority`, and resolved reason copy, and attaches the already-resolved display model under `index.edition`. It must not mutate or replace the Library, Safety Kit, Single Safety Rule, governance, attestation, core resource data, supervision copy, or unrelated learner history contracts.

- [ ] **Step 6: Run parity and protected-graph GREEN**

```bash
python3 13_Faculty_Resources/_automation/test_validate_rotation_edition_schema.py
python3 13_Faculty_Resources/_automation/validate_rotation_edition_schema.py
node --test tests/fd-edition-contract.test.mjs tests/fd-edition-schema-parity.test.mjs tests/fd-edition-project.test.mjs tests/fd-edition-adversarial.test.mjs tests/fd-edition-catalog.test.mjs
```

Expected: Python and browser accept/reject the same mutation matrix, and protected core data is byte-equivalent before and after projection.

- [ ] **Step 7: Record the atomic-cutover checkpoint without committing**

Save the focused RED/GREEN command output in the task report and continue directly to Task 4 in the same worktree. The untouched v1 curator suites are expected to be incompatible with the new v2-only shared contract at this intermediate point, so do not run a full root suite, build, or commit. Do not restore v1 overloads; Tasks 4–6 migrate every consumer before the cutover commit.

---

## Task 4: Accept, store, switch, and render v2 editions for learners

**Files:**

- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_student.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_path.js`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- Modify: `tests/fd-edition-storage.test.mjs`
- Modify: `tests/fd-edition-render.test.mjs`
- Modify: `tests/fd-shell-boot.test.mjs`
- Modify: `tests/fd-today.test.mjs`
- Modify: `tests/fd-path.test.mjs`
- Modify: `tests/fd-plan-migration.test.mjs`
- Modify: `tests/fd-contrast.test.mjs`
- Modify: `tests/smoke/frontdoor-runtime.spec.js`

**Interfaces:**

```javascript
fdEditionResolveStartup(canonicalIndex,catalogSnapshot,siteContext,pageUrl,incomingHash,storedText,subtle)
fdEditionCommitAcceptance(storage,keys,validatedEdition,localDocument,journal)
fdEditionReadLocal(storage,keys,fingerprint,displayModel)
fdEditionRenderCard(root,displayModel,documentObject)
fdEditionRenderLocal(root,displayModel,localState,documentObject)
```

Learner bootstrap must first await `fdEditionCatalogSnapshot(FD_ROTATION_EDITION_CATALOG,FD_SITE_CONTEXT.audience,subtle)`, then pass only its branded snapshot to `fdEditionResolveStartup()`. Snapshot failure enters canonical core mode; an incoming edition fragment receives fixed `EDITION_CATALOG_UNAVAILABLE`. No edition/local storage read, decode, projection, listener registration, or write may occur before snapshot success and the branded publication gate check.

- [ ] **Step 1: Write failing startup, storage, switch, and render tests**

Build a matrix for both audiences and these states: disabled/no hash, disabled/hash, enabled/no stored edition, enabled/valid incoming v2, enabled/valid stored v2, v1 URL/storage, malformed fragment, digest mismatch, missing/deprecated/blocked record, catalog revision drift with resolvable exact records, first acceptance, same-edition revisit, switch accept/decline, quota/write/reload/history/dialog failure, and hostile browser API objects.

Assert exact v2 keys only through the shared fresh-copy helper:

```javascript
assert.deepEqual(fdEditionStorageKeys('ms3'),{
  edition:'cw_rotation_edition_ms3_v2',
  local:'cw_rotation_local_progress_ms3_v2',
  curator:'cw_curator_draft_ms3_v2'
});
assert.deepEqual(fdEditionStorageKeys('resident'),{
  edition:'rp_rotation_edition_resident_v2',
  local:'rp_rotation_local_progress_resident_v2',
  curator:'rp_curator_draft_resident_v2'
});
```

Assert every prerelease v1 edition key plus core progress and attestation key remains byte-identical on rejection, acceptance, and switch. `cw_plan_v1` remains byte-identical on rejection or declined switch; after successful acceptance/switch, only its edition-derived recommendations/fingerprint may refresh while manually saved items and history remain byte-identical. Add explicit before/after field assertions plus DOM tests for the card, identity/fingerprint/change-summary provenance disclosures, current-versus-created revisions, empty-local state, eight-section mobile order, official hostname, focus, announcements, and light/dark contrast. The generated summary must never render without its fixed unauthenticated-lineage label.

Migrate `tests/smoke/frontdoor-runtime.spec.js` from v1 keys, envelopes, and direct old-signature harness calls to v2 synthetic catalog snapshots and branded projections. Prepare the catalog module before the contract/runtime modules, use the audience-specific v2 keys and validation contexts, and preserve every existing missing/hostile/register-then-throw startup-atomicity case. A v1 scenario remains only as an explicit unsupported-prerelease rejection with zero writes/listeners.

- [ ] **Step 2: Capture learner RED**

```bash
node --test tests/fd-edition-storage.test.mjs tests/fd-edition-render.test.mjs tests/fd-shell-boot.test.mjs tests/fd-today.test.mjs tests/fd-path.test.mjs tests/fd-plan-migration.test.mjs tests/fd-contrast.test.mjs
```

Expected: runtime still assumes v1 fields/keys and cannot render the resolved v2 model.

- [ ] **Step 3: Implement fail-closed startup and v2-only persistence**

Snapshot descriptor-safe `location`, `history`, `storage`, `crypto`, document, dialog, listener, and reload capabilities before any edition write. Require an enabled branded catalog snapshot before reading the v2 edition key or decoding the fragment. Return fixed codes without echoing input:

```text
EDITION_DISABLED
EDITION_PRERELEASE_UNSUPPORTED
EDITION_INVALID
EDITION_CATALOG_UNAVAILABLE
EDITION_RESELECTION_REQUIRED
```

With no fragment and publication disabled, enter ordinary core mode without reading edition storage. With any v1 envelope, reject before writes and leave v1 browser data untouched.

Use the existing `fdEditionStartupJournal(storage,[keys.local,keys.edition])` contract. `fdEditionCommitAcceptance(...)` must first serialize and reparse both intended documents, then invoke `fdEditionStartupJournalRun(journal,[keys.local,keys.edition],operation)` exactly once; `operation` writes the local bytes first and edition bytes second. It returns `{ok:true,code:'EDITION_ACCEPTED'}` only after both post-write values match. Any throw/mismatch invokes `fdEditionStartupJournalRollback(journal)` before returning `{ok:false,code:'EDITION_STORAGE'}`; a rollback that cannot be proved additionally marks startup irrecoverable. In either failure case, keep the canonical core index displayed, show a fixed privacy-safe error, and do not claim acceptance. Do not install startup listeners until all fallible shell wiring can be unwound atomically.

- [ ] **Step 4: Implement bounded fingerprint-local progress**

The local document is a closed v2 object keyed by fingerprint. Validate every bucket before use, permit only resolved checklist/resource IDs, cap checklist/resource state at 24/12, and cap the document at 128 fingerprints. A 129th acceptance returns `EDITION_LOCAL_CAPACITY` and writes nothing; it never evicts an older bucket. Switching editions changes only the active derived bucket and v2 edition marker.

- [ ] **Step 5: Render only the bound display model**

Build the edition card and local sections entirely from `trustedValidatedEdition.displayModel`. Render with DOM text APIs. The card visibly separates:

- `Edition checked on — self-attested by the curator`
- `Catalog verification — repository-reviewed record dates`

Render the exact code-owned `authority` copy from Task 2: distinguish `Reviewed clerkship Library` from `Local rotation guidance`; label priorities as `Required by this local rotation`, `Recommended by this local rotation`, or `Optional for this local rotation`; label every selected local official link `Locally curated official resource`; and show the fixed local-policy boundary plus documentation privacy/supervision guardrail. These strings cannot be hidden, changed by a phrase set, or replaced by catalog/config content. Unit and browser tests must assert the exact text in both audiences and prove hostile catalog strings cannot override it.

Use this mobile DOM order, which must also be the reading order at desktop:

```text
First day at the location
Before you arrive
Who to contact
Today's checklist
Typical day
Team workflow
Attendance and feedback
Official resources
```

If every optional local category is absent, show: `This edition adds no local orientation. Your reviewed Path and full Library remain available.` Never show a key as fallback copy.

- [ ] **Step 6: Preserve Today and My Plan behavior**

Keep plan storage at `cw_plan_v1`. Use the v2 fingerprint only to determine which derived recommendations are current; preserve manually saved items and existing plan history. `fd_today.js` and `fd_path.js` consume only projected core placements plus resolved display labels. Edition switching may add/remove derived plan suggestions but may not delete manual items, clinical references, attestations, or core completion data.

- [ ] **Step 7: Verify the learner-focused checkpoint**

```bash
node --test tests/fd-edition-storage.test.mjs tests/fd-edition-render.test.mjs tests/fd-shell-boot.test.mjs tests/fd-today.test.mjs tests/fd-path.test.mjs tests/fd-plan-migration.test.mjs tests/fd-contrast.test.mjs tests/fd-edition-adversarial.test.mjs
```

Expected: enabled synthetic unit tests render v2 and all rejection paths make zero edition/local writes. Defer full builds because curator/local suites complete their v2 migration in Tasks 5–6.

- [ ] **Step 8: Record the atomic-cutover checkpoint without committing**

Save the focused evidence in the task report and continue directly to Task 5. Keep Tasks 3–4 changes together and uncommitted until all v1 curator/local tests are replaced in Task 6.

---

## Task 5: Rebuild curator state, v1 salvage, and Steps 1 through 3 for v2

**Files:**

- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_v1_salvage.js`
- Create: `tests/fd-edition-salvage.test.mjs`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js`
- Modify: `13_Faculty_Resources/Rotation_Curation/rotation-curator.html`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- Modify: `13_Faculty_Resources/_automation/site_build/common.py`
- Modify: `13_Faculty_Resources/_automation/site_build/test_common.py`
- Modify: `tests/parallel-ceilings.test.mjs`
- Modify: `tests/fd-curator-contract.test.mjs`
- Modify: `tests/fd-curator-state.test.mjs`
- Modify: `tests/fd-curator-schedule.test.mjs`
- Modify: `tests/smoke/rotation-curator.spec.js`

**State contract:**

```javascript
{
  schemaVersion:2,
  step:1,
  site:{audience:'ms3',pathId:'ms3-six-week',coreRevision:'',localCatalogRevision:'',rotationEditionV2:'disabled',rendererRevision:'rotation-edition-v2-r1'},
  config:{
    context:{trainingLocationKey:'',curatorProfileKey:'',rotationStart:'',rotationEnd:'',editionCheckedOn:''},
    phraseSetKey:'',
    pathItems:canonicalPathItems,
    localPlan:{},
    changeSummary:{kindCodes:['initial'],changedItemCount:0}
  },
  publication:{baseEnvelope:null,baseSemanticConfig:'',lastGenerated:null},
  previewReceipts:{desktop:null,mobile:null},
  affirmations:{publicSafe:false,officialLinks:false,previewsReviewed:false,forwardable:false}
}
```

Curator bootstrap calls:

```javascript
fdCuratorMount(root,canonicalIndex,siteContext,catalogSnapshot,generationDate,dependencies)
```

It awaits the same audience-specific catalog snapshot before loading a draft/import or rendering selectors. Snapshot failure renders a fixed unavailable state and performs no curator storage read/write. The inline bootstrap derives `generationDate` once from injected/testable local-calendar getters (`getFullYear`, `getMonth`, `getDate`) and zero-pads `YYYY-MM-DD`; it must not use UTC `toISOString()`. Any throw or invalid local date supplies an empty generation date, which permits read-only inspection but blocks preview receipts and Generate.

`fdCuratorNewDraft()` obtains `canonicalPathItems` from `fdCuratorCanonicalPathItems(canonicalIndex,siteContext)`: every current-audience Path placement is copied in canonical week/order, repeated refs receive deterministic `core:<ref>:<occurrence>` IDs, priority starts `recommended`, and `reasonKey` is absent. It never starts as an empty curriculum and never includes the other audience. Pin the exact current MS3 six-week and resident four-week defaults in focused tests.

- [ ] **Step 1: Write failing pure-state and salvage tests**

Test exact initial state for both audiences, deep immutability, no-op identity, import transaction cancellation only after a semantic state change, receipt/affirmation invalidation exactly once, stable lowest-unused ID allocation, profile/location eligibility, phrase-set eligibility, repeated placement labels, and all week/reorder boundaries.

Use this exact Step 1–3 action contract. Each object contains own enumerable data properties only: `type` plus exactly the listed fields, with no extras, symbols, accessors, inherited values, or alternate spellings.

| Action | Exact additional fields and closed values |
|---|---|
| `SET_TRAINING_LOCATION` | `trainingLocationKey` (reviewed exact key or empty to clear) |
| `SET_CURATOR_PROFILE` | `curatorProfileKey` (eligible reviewed exact key or empty) |
| `SET_ROTATION_START`, `SET_ROTATION_END`, `SET_EDITION_CHECKED_ON` | `value` (empty or real `YYYY-MM-DD`; reducer applies ordering/generation-date rules) |
| `SET_PHRASE_SET` | `phraseSetKey` (eligible reviewed exact key or empty) |
| `PATH_INCLUDE`, `PATH_REPEAT` | `ref`, `week` (current canonical core ref; audience-bounded integer week) |
| `PATH_REMOVE` | `instanceId` |
| `PATH_MOVE_WEEK` | `instanceId`, `week` |
| `PATH_MOVE_ORDER` | `instanceId`, `direction` where direction is `up | down` |
| `PATH_SET_PRIORITY` | `instanceId`, `priority` where priority is `required | recommended | optional` |
| `PATH_SET_REASON` | `instanceId`, `reasonKey` (eligible reviewed reason key or empty to clear) |
| `SET_STEP` | `step` (integer `1–5`) |
| `IMPORT_SUCCEEDED` | `result`, `sequence`; `result` must carry the closure-private successful-import brand |
| `IMPORT_REJECTED` | `code`, `sequence`; `code` is one fixed curator import error code and never raw input |

The reducer checks primitive action fields through descriptors before use. It never reads a nested `result` property unless the exact object is already present in the corresponding closure-private `WeakMap`; a copied/forged/revoked result is a no-op. Async actions apply only when `sequence` exactly equals the live transaction sequence.

For v1 salvage, test valid/digest-mismatch/oversize/accessor/proxy/revoked/cross-audience inputs and discarded malicious prose, URLs, names, contacts, codes, and rationale. Assert output contains only allowed dates and current core placement structure, reports only a numeric dropped-reference count, and never touches v1 storage/import bytes. Include future but real/ordered rotation dates, which survive, plus a future `lastVerified`, which does not become `editionCheckedOn`.

- [ ] **Step 2: Capture curator RED**

```bash
node --test tests/fd-edition-salvage.test.mjs tests/fd-curator-contract.test.mjs tests/fd-curator-state.test.mjs tests/fd-curator-schedule.test.mjs
```

Expected: current state is v1/free-text and no isolated salvage module exists.

- [ ] **Step 3: Implement the curator-only salvage boundary**

Expose only:

```javascript
fdEditionV1ValidateForSalvage(text,index,siteContext,subtle)
fdEditionV1Salvage(validatedV1,index,siteContext,generationDate)
```

Accept only a primitive string, measure its UTF-8 byte length before `JSON.parse`, and reject above 64 KiB. A direct object/proxy/revoked-proxy argument rejects without property access. After parsing, validate the exact old schema and digest, copy through the hostile-object boundary, and keep the trusted intermediate closure-private. Preserve valid audience/path; real ordered `rotationStart`/`rotationEnd` even when they are after `generationDate`; a real `lastVerified` only when it is not after `generationDate`, mapped to `editionCheckedOn`; and known core refs/week/order/priority. Regenerate `core:<ref>:<occurrence>` IDs and compact order per week. Discard everything else before any render/storage/log call. Return a fresh incomplete v2 Edition 1 draft with empty reviewed selections, `baseEnvelope:null`, no receipts, and all affirmations false.

V2 backup import uses `fdCuratorImportBackup(text,index,siteContext,catalogSnapshot,validationContext,subtle)`. It accepts only primitive text of at most 64 KiB UTF-8 measured before `JSON.parse`; the file reader rejects a declared or accumulated size over 64 KiB before handing content to the parser. Oversize returns `CURATOR_IMPORT_SIZE` without parsing, property access, echo, or draft/storage mutation. It resolves in `builder` mode and rejects the whole backup with `CURATOR_IMPORT_RESELECTION_REQUIRED` for deprecated, blocked, unknown, or ineligible references. It never guesses aliases.

- [ ] **Step 4: Implement the pure v2 curator reducer**

Reduce first, compare the semantic result, then—and only then—mark touched, invalidate both receipts/affirmations, and cancel a pending import. Same-value selects, empty rationale changes, current-week moves, first/last reorder attempts, blocked dependent actions, and stale async results are no-ops that preserve transaction and review state.

Do not read nested action getters. Trust asynchronous import/generation results through closure-private brands before reducer dispatch. Cap and validate arrays before iteration.

- [ ] **Step 5: Render structured Steps 1–3**

Step 1 selects only reviewed, audience-eligible location/profile/phrase records. Selecting a location clears now-ineligible dependent selections. If production has no profiles, render a focused onboarding empty state explaining that a reviewed catalog proposal is required; offer no custom-name or text fallback.

Step 2 retains include/omit/repeat/priority controls and adds an optional reviewed reason selector. Every repeated placement control name includes title, occurrence, `position X of Y in Week N`, and action. Step 3 keeps exact four-/six-week bounds and keyboard-accessible move controls. Preview still comes from `fdProjectEdition()`; navigation/import must invalidate any outstanding preview sequence before an early-return placeholder renders.

- [ ] **Step 6: Inject salvage only into the curator page**

Register a curator-only marker and inject `fd_edition_v1_salvage.js` after v2 contract/catalog modules but before `fd_curator.js`. Assert its marker and v1 parsing symbols are absent from both learner builds. Update the exact pinned marker ceiling.

- [ ] **Step 7: Verify curator GREEN**

```bash
node --test tests/fd-edition-salvage.test.mjs tests/fd-curator-contract.test.mjs tests/fd-curator-state.test.mjs tests/fd-curator-schedule.test.mjs tests/fd-edition-adversarial.test.mjs tests/parallel-ceilings.test.mjs
```

Expected: unit-level synthetic fixtures drive Steps 1–3, disabled-state markup is present, and v1 values never reach DOM or storage. Defer browser/full-build gates until structured Step 4 removes the remaining v1 local-editor expectations in Task 6.

- [ ] **Step 8: Record the atomic-cutover checkpoint without committing**

Save the focused evidence in the task report and continue directly to Task 6 with the same uncommitted Tasks 3–5 changes.

---

## Task 6: Build structured local details, coverage, and exact preview receipts

**Files:**

- Create: `tests/smoke/run-local-playwright.sh`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js`
- Modify: `13_Faculty_Resources/Rotation_Curation/rotation-curator.html`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- Modify: `tests/fd-curator-local.test.mjs`
- Modify: `tests/fd-curator-state.test.mjs`
- Modify: `tests/fd-curator-schedule.test.mjs`
- Modify: `tests/fd-edition-render.test.mjs`
- Modify: `tests/fd-contrast.test.mjs`
- Modify: `tests/smoke/rotation-curator.spec.js`
- Modify: `tests/smoke/frontdoor-runtime.spec.js`
- Modify: `tests/smoke/start-local-servers.sh`
- Modify: `tests/smoke-server-launcher.test.mjs`

**Local action contract:**

As in Task 5, every action is an exact own-enumerable-data object containing `type` plus only the fields below. Optional fields are either absent or use the explicit empty-string clearing rule; they are never `undefined`/`null`.

| Action | Exact additional fields and closed values |
|---|---|
| `LOCAL_APPLY_PRESET` | `presetKey` |
| `ARRIVAL_SET` | `value` with the exact public arrival shape; `ARRIVAL_CLEAR` has no additional field |
| `SCHEDULE_SET_BOUNDS` | `dayStart`, `dayEnd`, `endQualifierCode` |
| `SCHEDULE_EVENT_ADD` | `daySetKey`, `startTime`, optional `endTime`, `activityKey`, optional `placeKey`, `priority` |
| `SCHEDULE_EVENT_UPDATE` | `instanceId`, `field`, `value`; field is `daySetKey | startTime | endTime | activityKey | placeKey | priority`, and empty clears only optional `endTime`/`placeKey` |
| `SCHEDULE_EVENT_REMOVE` | `instanceId` |
| `ROUNDS_SET` | `value:{preparationKey,participationKey,followUpKey}` |
| `PRESENTATION_SET` | `value:{formatKey,timingKey,elementKeys}` |
| `DOCUMENTATION_SET` | `value:{workflowKey,timingKey,policyLinkKey?}` |
| `ATTENDANCE_SET` | `value:{eventInstanceIds,absenceRoleKey,policyLinkKey?}` |
| `FEEDBACK_SET` | `value:{cadenceKey,initiatorKey,settingKey}` |
| `ACCESS_ADD` | `itemKey`, `dueKey`, optional `linkKey`; `ACCESS_UPDATE` uses `instanceId`, `field`, `value` with field `itemKey | dueKey | linkKey`; `ACCESS_REMOVE` uses `instanceId` |
| `CONTACT_ADD` | `roleKey`, optional `linkKey`; `CONTACT_UPDATE` uses `instanceId`, `field`, `value` with field `roleKey | linkKey`; `CONTACT_REMOVE` uses `instanceId` |
| `CHECKLIST_ADD` | `itemKey`, `priority`; `CHECKLIST_UPDATE` uses `instanceId`, `field`, `value` with field `itemKey | priority`; `CHECKLIST_REMOVE` uses `instanceId` |
| `RESOURCE_ADD` | `linkKey`, `priority`, `week`, optional `reasonKey`; `RESOURCE_UPDATE` uses `instanceId`, `field`, `value` with field `linkKey | priority | week | reasonKey`; `RESOURCE_REMOVE` uses `instanceId` |
| `LOCAL_CATEGORY_CLEAR` | `category` from `arrival | schedule | rounds | presentation | documentation | attendance | feedback | accessItems | contacts | checklistItems | resources` |
| `PREVIEW_REVIEW_SUCCEEDED` | `preset`, `result`, `sequence`; preset is `desktop | mobile-390`, result is closure-branded |
| `SET_AFFIRMATION` | `name`, `value`; name is `publicSafe | officialLinks | forwardable`, value is boolean |
| `GENERATION_SUCCEEDED` | `result`, `sequence`; result is closure-branded |

All nested `value` objects are themselves exact own-data copies of the public shapes and are validated before reduction. Preview/generation results are retrieved only from closure-private `WeakMap` brands and only for the live sequence; their getters are never invoked. Invalid, forged, stale, same-value, boundary, or dependency-blocked actions preserve object identity, pending transactions, receipts, and affirmations.

**Candidate interface:**

```javascript
fdCuratorCandidateConfig(draft,index,catalogSnapshot,siteContext,validationContext,subtle)
  // Promise<{ok,config,envelopePreimage,contentDigest,referenceSetDigest,fingerprint,displayModel,errors}>
```

This is the single source of the prospective full public configuration before preview or publication. It derives audience, path, both created-against revisions, edition number, and generated change summary from the draft plus base envelope using the locked two-stage semantic-equality rule: revision-only drift preserves the exact base identity, while a genuine curation change records both current revisions and increments once before preview.

- [ ] **Step 1: Write failing reducer, coverage, receipt, and browser tests**

Exercise every local variant, exact action fields and field/category/preset/name enums, catalog kind/scope checks, collection cap, lowest-unused IDs, date/time rules, duplicate schedule tuple, attendance dependency, safe category clearing, preset copy semantics, no-op identity, generated checklist IDs, closure-branded/stale async results, and removal/re-add behavior. Extend `tests/smoke-server-launcher.test.mjs` with failing tests for the missing self-contained runner, test-exit-code preservation, direct-child launcher cleanup on success/failure/signal, rejection of malformed/stale manifests, private state removal, and no termination of an unrelated process. The hostile stale-manifest case must contain three valid-looking rows whose PIDs name a live unrelated process; the runner must fail closed while that process remains alive.

Define coverage assertions exactly:

```javascript
{
  where:Boolean(localPlan.arrival&&localPlan.arrival.placeKey),
  when:Boolean(localPlan.arrival&&localPlan.arrival.timingCode&&localPlan.arrival.time),
  prepare:Boolean(localPlan.accessItems&&localPlan.accessItems.length),
  help:Boolean((localPlan.contacts&&localPlan.contacts.length)||(localPlan.arrival&&localPlan.arrival.checkInRoleKey)),
  first:Boolean((localPlan.checklistItems&&localPlan.checklistItems.length)||(localPlan.schedule&&localPlan.schedule.events.length))
}
```

Coverage is advisory and never the sole Generate blocker. Add browser assertions that Step 4 has no learner-facing `textarea`, ordinary public-text input, URL input, or `Other` choice; search/filter UI values never enter draft/backup/preview/storage/payload.

- [ ] **Step 2: Capture local-editor RED**

```bash
node --test tests/fd-curator-local.test.mjs tests/fd-curator-state.test.mjs tests/fd-curator-schedule.test.mjs tests/fd-edition-render.test.mjs tests/fd-contrast.test.mjs tests/smoke-server-launcher.test.mjs
```

Expected: Step 4 still exposes free-text authoring, one preview state cannot prove both canonical layouts, and the self-contained browser runner is absent.

- [ ] **Step 3: Implement the self-contained local browser runner**

Extend `tests/smoke/start-local-servers.sh` with a backward-compatible `--wait <control-fifo>` mode. The existing no-argument start-and-return behavior and `--print-config` remain unchanged. The control path must be one private FIFO supplied by the caller, validated without following a symlink. In `--wait` mode, after argument/path validation but before any directory, port, or readiness preflight, the launcher installs cleanup traps and performs this exact race-safe handoff: open a temporary read-write anchor on the FIFO, open its long-lived read-only control descriptor while that anchor guarantees a writer, then close the anchor before emitting fixed `CONTROL_READY`. It retains no FIFO writer. If the wrapper already exited, closing the anchor makes the control read immediately observe EOF rather than block. The launcher then performs the exact existing startup/readiness checks and atomic manifest write, emits fixed `SERVERS_READY`, and stays alive as the owner of its in-memory server child jobs while reading that already-open descriptor. Receiving the one exact `STOP` line or FIFO EOF triggers cleanup. Cleanup signals a server PID only while Bash's own job table still identifies it as that launcher's running direct child, then waits for and verifies those children, removes its own manifest/journal artifacts, and returns the triggering status. It never asks a caller to signal a manifest PID.

`tests/smoke/run-local-playwright.sh` runs from any working directory. Before creating or spawning anything, it installs idempotent `EXIT/HUP/INT/TERM` traps that tolerate unset state. It creates a private `mktemp -d` state directory and FIFO, verifies their ownership/type, and opens fixed descriptor 9 read-write (`exec 9<>`) on that FIFO before spawning; on the supported Darwin and Linux Bash environments this establishes a nonblocking writer endpoint and is pinned by the launcher tests. It exports the directory as `SMOKE_SERVER_STATE_DIR` and starts `tests/smoke/start-local-servers.sh --wait <private-fifo> 9>&-` as one direct background child: the explicit child redirection closes the inherited wrapper descriptor before the launcher runs its own anchor/read handoff. It waits boundedly first for `CONTROL_READY`, then for `SERVERS_READY` plus an exactly shaped three-row label/port manifest, while confirming Bash's job table still identifies the launcher as its running direct child. The manifest is readiness evidence only and never an authorization list for signaling. The runner then invokes `npx playwright test ... 9>&-` from `tests/smoke` with every received argument unchanged; the explicit redirection ensures Playwright and its complete browser/process tree inherit no control-FIFO writer while descriptor 9 remains open only in the wrapper for later `STOP`.

The traps preserve the test/signal status, write only `STOP` to descriptor 9 when a live owned job reached `CONTROL_READY`, close descriptor 9 in every case, and use shell `wait` on the recorded child job; they never use `kill` on the launcher or any server/manifest PID. FIFO EOF also makes the launcher clean up if the wrapper exits before sending `STOP`. The wrapper reports failure if bounded child cleanup cannot be proved. Startup failure, malformed/replaced manifest, an already-occupied configured port, or cleanup uncertainty fails closed and never uses a process-name match, broad `pkill`, unresolved variable, manifest-selected PID, or unrelated process. Unit tests use temporary sites/ports, replace the manifest with valid-looking unrelated PIDs, close descriptor 9 without `STOP`, force launcher exit before `CONTROL_READY`, send wrapper TERM before `CONTROL_READY`, SIGKILL the wrapper both before `CONTROL_READY` and while a controlled Playwright stand-in is actively running, and force directory/port preflight failure after the control handshake; every case has a short timeout proving no open deadlock, proves neither launcher nor test process tree inherited the writer, leaves no stale server/state, and sends no signal to the unrelated process.

- [ ] **Step 4: Implement the two progressive structured groups**

Render:

1. `First-day essentials`: arrival, access preparation, who to contact, checklist.
2. `How this rotation works`: typical schedule, rounds, presentation, documentation, attendance, feedback, official resources.

Every selector lists only reviewed, eligible records of the required kind. Each included card immediately renders a `Students will see` sentence from the trusted display model. A `localPreset` copies its closed `localPlan` fields into ordinary editable state after full builder-mode validation; the preset key itself is never stored in config, backup, or payload.

Schedule removal must be a no-op while attendance references the event and must focus an explanatory fixed message. Empty repeatable arrays/categories are omitted during normalization, not stored as `[]` or `null`.

- [ ] **Step 5: Implement independent desktop and mobile receipts**

Use the exact renderer revision constant `rotation-edition-v2-r1`. Before either preview, await `fdCuratorCandidateConfig()`; its `contentDigest` is SHA-256 of the exact future envelope preimage `{format:'cw-rotation-edition',schemaVersion:2,config:candidateConfig}`. A receipt is:

```javascript
{
  contentDigest:'sha256-...',
  referenceSetDigest:'sha256-...',
  currentCoreRevision:'503b42d2538d525c0a3bbf0e1767333e5e617df4',
  currentCatalogRevision:'sha256-...',
  rendererRevision:'rotation-edition-v2-r1',
  previewPreset:'desktop'
}
```

The mobile receipt is identical except `previewPreset:'mobile-390'`. Capture each only after the corresponding canonical preview has rendered from that exact candidate's trusted validation result and current descriptor-safe site context. Any content change, successful import, reference-resolution digest change, current core/catalog revision change, or renderer-revision change clears both. Loading a saved draft whose `site.coreRevision` or `site.localCatalogRevision` differs from current context clears both receipts before render and updates only those draft-site observation fields; it does not change the edition identity. Capturing one replaces only that mode. Tab switches and ordinary curator-window resizing neither create nor clear receipts. A stale asynchronous projector/receipt result cannot overwrite a newer draft, placeholder, or receipt.

`previewsReviewed` becomes true only when both receipts match the current exact candidate `contentDigest`, `referenceSetDigest`, current core/catalog revisions, and renderer revision; it is derived, not independently settable. Add core-only, catalog-only, and combined revision-drift tests proving both receipts and derived review health become stale while edition number/digest/fingerprint remain unchanged; recapturing both against the current display restores review health. `SET_AFFIRMATION` accepts only `publicSafe`, `officialLinks`, and `forwardable`.

- [ ] **Step 6: Render accessible coverage and preview evidence**

Show the five coverage questions as a status strip with text plus icon, not color alone. Missing items link/focus the corresponding structured control. Canonical desktop and 390 px previews have distinct review buttons, visible digest/fingerprint context, keyboard focus, mutation-backed announcements, and light/dark contrast. The mobile preview uses the learner's real DOM order and width, not a scaled screenshot.

- [ ] **Step 7: Verify the complete atomic v2 cutover GREEN**

```bash
node --test tests/fd-curator-local.test.mjs tests/fd-curator-state.test.mjs tests/fd-curator-schedule.test.mjs tests/fd-edition-render.test.mjs tests/fd-contrast.test.mjs tests/fd-edition-adversarial.test.mjs
node --test tests/*.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
npm --prefix tests/smoke ci
bash tests/smoke/run-local-playwright.sh rotation-curator.spec.js frontdoor-runtime.spec.js --project=nav-ms3 --project=nav-res
```

Expected: every affected root suite and both legacy startup-atomicity browser projects are v2-green, structured local state alone produces all learner-visible copy, both preview receipts are independently provable, both builds pass sequentially, the runner leaves no server/state residue, and production Generate/learner acceptance remain disabled.

- [ ] **Step 8: Commit the atomic Tasks 3–6 cutover**

```bash
git add tests/fixtures/rotation-editions/synthetic-core-index.json
git add rotation_edition.schema.json tests/fixtures/rotation-editions/valid-ms3.json tests/fixtures/rotation-editions/valid-resident.json tests/fixtures/rotation-editions/invalid-extra-property.json tests/fixtures/rotation-editions/invalid-unsafe-url.json 13_Faculty_Resources/_automation/validate_rotation_edition_schema.py 13_Faculty_Resources/_automation/test_validate_rotation_edition_schema.py 13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_contract.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_project.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_student.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_path.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_v1_salvage.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js 13_Faculty_Resources/_automation/site_build/spa_index.html 13_Faculty_Resources/Rotation_Curation/rotation-curator.html 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css 13_Faculty_Resources/_automation/site_build/common.py 13_Faculty_Resources/_automation/site_build/test_common.py tests/fd-edition-contract.test.mjs tests/fd-edition-schema-parity.test.mjs tests/fd-edition-project.test.mjs tests/fd-edition-adversarial.test.mjs tests/fd-edition-storage.test.mjs tests/fd-edition-render.test.mjs tests/fd-shell-boot.test.mjs tests/fd-today.test.mjs tests/fd-path.test.mjs tests/fd-plan-migration.test.mjs tests/fd-contrast.test.mjs tests/fd-edition-salvage.test.mjs tests/fd-curator-contract.test.mjs tests/fd-curator-state.test.mjs tests/fd-curator-schedule.test.mjs tests/fd-curator-local.test.mjs tests/parallel-ceilings.test.mjs tests/smoke/rotation-curator.spec.js tests/smoke/frontdoor-runtime.spec.js tests/smoke/start-local-servers.sh tests/smoke/run-local-playwright.sh tests/smoke-server-launcher.test.mjs
git commit -m "feat: replace rotation editions with structured v2"
```

---

## Task 7: Restore gated sharing, QR, and exact backup export

**Files:**

- Create: `13_Faculty_Resources/_automation/site_build/vendor/qrcode-generator-1.4.4.js`
- Create: `13_Faculty_Resources/_automation/site_build/vendor/qrcode-generator-1.4.4.LICENSE`
- Create: `tests/fd-curator-publish.test.mjs`
- Create: `tests/qr-vendor.test.mjs`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js`
- Modify: `13_Faculty_Resources/Rotation_Curation/rotation-curator.html`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- Modify: `13_Faculty_Resources/_automation/site_build/common.py`
- Modify: `13_Faculty_Resources/_automation/site_build/test_common.py`
- Modify: `13_Faculty_Resources/_automation/site_build/check-static-site.mjs`
- Modify: `tests/parallel-ceilings.test.mjs`
- Modify: `tests/smoke/rotation-curator.spec.js`

**Interfaces:**

```javascript
fdCuratorHealth(draft,index,catalogSnapshot,siteContext,validationContext,subtle)
  // Promise<health-result>
fdCuratorStudentBaseUrl(locationObject)
fdCuratorBuildShare(draft,index,catalogSnapshot,siteContext,validationContext,subtle,locationObject)
  // Promise<share-result>
fdCuratorBackupJson(envelope)
fdCuratorQrSvg(url)
```

- [ ] **Step 1: Write failing publication-boundary tests**

Test the full gate matrix: disabled projection, forged enabled snapshot, invalid/incomplete config, ineligible profile, missing desktop receipt, missing mobile receipt, stale content/reference/core-revision/catalog-revision/renderer receipt, each false affirmation, URL >16,000, wrong origin/path, crypto failure, backup serialization failure, and success with an enabled trusted synthetic snapshot. Separately prove that a valid URL of 1,801–16,000 characters still publishes its link and backup but returns no QR plus fixed status `QR_TOO_LONG`.

The four required affirmations are exactly:

| Key | Fixed user-facing statement and satisfaction rule |
|---|---|
| `publicSafe` | `I confirm this edition contains no PHI, learner data, evaluations, credentials, private contact details, or access codes.` Explicit checkbox. |
| `officialLinks` | `I confirm every linked local clinical protocol is an official HTTPS institutional source.` Explicit checkbox. |
| `previewsReviewed` | `I reviewed both the desktop and 390 px mobile student previews.` Derived only after the curator explicitly completes both canonical review actions and both current receipts match. |
| `forwardable` | `I understand anyone may forward this account-free link and I cannot revoke this edition from the link.` Explicit checkbox. |

Assert any blocking failure yields no share link, QR, generated marker, clipboard write, download, storage mutation, or edition-number increment. `QR_TOO_LONG` is a non-blocking QR omission, not a publication failure. Assert an enabled success recomputes validation/digest/reference resolution after the final user action rather than trusting earlier UI state.

- [ ] **Step 2: Capture publication RED**

```bash
node --test tests/fd-curator-publish.test.mjs tests/qr-vendor.test.mjs tests/fd-curator-state.test.mjs tests/fd-edition-contract.test.mjs
```

Expected: v2 has no reviewed share boundary or local QR implementation.

- [ ] **Step 3: Vendor and verify QR code generation**

Vendor exactly `qrcode-generator@1.4.4`, retain its license, and record/verify the upstream source SHA-256:

```text
18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780
```

Pin the npm tarball integrity in the supply-chain test as:

```text
sha512-HM7yY8O2ilqhmULxGMpcHSF1EhJJ9yBj8gvDEuZ6M+KGJ0YY2hKpnXvRD+hZPLrDVck3ExIGhmPtSdcjC+guuw==
```

`tests/qr-vendor.test.mjs` hashes the exact vendored source bytes, pins the version/header, license presence, tarball integrity receipt, unique curator-only marker, and absence of remote imports/requests. Register it only in the curator build. `fdCuratorQrSvg()` uses exactly `qrcode(0,'M')` (automatic version, error-correction level M), adds the ASCII URL in explicit `Byte` mode, and emits inline SVG with 4 px cells, a four-module/16 px quiet zone, and an accessible title. It performs no network request. Tests require exactly 1,800 URL characters to produce a decodable SVG and 1,801 to return `{ok:false,code:'QR_TOO_LONG'}` without invalidating an otherwise publishable link. Add static QA assertions forbidding remote QR/image/script destinations.

- [ ] **Step 4: Implement the final health and share transaction**

`fdCuratorHealth()` awaits the same Web Crypto-backed builder validation used for preview and publication. Immediately before evaluating receipts it descriptor-safely snapshots the current core/catalog context and invalidates any receipt whose `currentCoreRevision` or `currentCatalogRevision` differs; draft-saved observations are never trusted as current. It requires an enabled branded projection, exact audience/path/core/catalog context, reviewed profiles and selections, a fully valid builder-mode v2 config, matching current desktop/mobile receipts, and all affirmations. Coverage remains advisory.

`fdCuratorStudentBaseUrl()` accepts a snapshotted same-origin location object and returns only the current audience site's root URL. `fdCuratorBuildShare()` takes a new descriptor-safe core/catalog context snapshot, recomputes `fdCuratorCandidateConfig()`, requires both receipts to match the candidate plus those current revisions, creates the envelope from that candidate without changing its edition number, summary, digest, or fingerprint, confirms canonical config <=12 KiB and final URL <=16,000 characters, and revalidates it in learner mode against the same trusted snapshot. It returns a closure-branded `GENERATION_SUCCEEDED` result; the reducer then records that exact envelope as `lastGenerated` and the new base. No identity-affecting derivation occurs after preview review.

The backup is the exact envelope JSON, never curator UI state. Its filename is `<resolved-location-code>-<audience>-rotation-edition-<editionNumber>.json`, using only the already-validated code. Clear transient import buffers after success; retain recoverable input after rejection without rendering it.

- [ ] **Step 5: Render Step 5 review and sharing**

Show destination site/audience, resolved edition card, fingerprint, core/catalog/reference/renderer revisions, generated change summary with its unauthenticated-lineage label, both receipt statuses, four affirmations, and the default-off governance status. Generate stays visibly disabled in checked-in production even if every other requirement is satisfied. On enabled synthetic success, show the exact account-free link, copy control, local QR when eligible, backup download, and a reminder that the link is forwardable and contains public operational guidance only. State that the fragment is not intentionally sent to the host, while browser history, clipboard tools, extensions, screenshots, recipients, and forwarded messages can still expose it.

- [ ] **Step 6: Verify publication GREEN with production still disabled**

```bash
node --test tests/fd-curator-publish.test.mjs tests/qr-vendor.test.mjs tests/fd-curator-state.test.mjs tests/fd-edition-contract.test.mjs tests/fd-edition-adversarial.test.mjs tests/parallel-ceilings.test.mjs
python3 13_Faculty_Resources/_automation/site_build/test_common.py
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
npm --prefix tests/smoke ci
bash tests/smoke/run-local-playwright.sh rotation-curator.spec.js --project=nav-ms3 --project=nav-res
```

Expected: production cannot generate; enabled synthetic tests produce a same-site root link/QR/backup only after every exact gate passes.

- [ ] **Step 7: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/vendor/qrcode-generator-1.4.4.js 13_Faculty_Resources/_automation/site_build/vendor/qrcode-generator-1.4.4.LICENSE tests/fd-curator-publish.test.mjs tests/qr-vendor.test.mjs 13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js 13_Faculty_Resources/Rotation_Curation/rotation-curator.html 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css 13_Faculty_Resources/_automation/site_build/common.py 13_Faculty_Resources/_automation/site_build/test_common.py 13_Faculty_Resources/_automation/site_build/check-static-site.mjs tests/parallel-ceilings.test.mjs tests/smoke/rotation-curator.spec.js
git commit -m "feat: gate rotation edition sharing"
```

---

## Task 8: Prove two-audience browser behavior and prepare the human pilot gate

**Files:**

- Create: `tests/smoke/rotation-edition-fixture.js`
- Create: `tests/smoke/rotation-edition-v2.spec.js`
- Create: `docs/pilots/rotation-edition-v2-pilot-protocol.md`
- Modify: `tests/smoke/playwright.config.js`
- Modify: `tests/smoke/rotation-curator.spec.js`
- Modify: `tests/fixtures/rotation-edition-catalog/valid-catalog.json`
- Modify: `tests/fixtures/rotation-edition-catalog/valid-governance.json`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the failing enabled-fixture route and journey**

Implement a test-only helper that reads the actual built HTML and replaces only the exact serialized value assigned to `FD_ROTATION_EDITION_CATALOG` during Playwright route fulfillment. It must retain the localhost/deploy origin, every other built byte, CSP expectations, and the audience-specific projection. It must not edit source or `_build`, and it must throw unless exactly one assignment was replaced.

Start with failing end-to-end journeys for both `nav-ms3` and `nav-res`:

1. Production build loads core mode and exposes empty/disabled catalog state.
2. A compact synthetic enabled edition selects reviewed identity, dates, phrase set, canonical curriculum plus one reason, and only enough structured local detail to exercise arrival/resource rendering while keeping the final URL at most 1,800 characters.
3. Desktop and mobile receipts are independently captured; all affirmations are made. Generate yields the expected audience root link, fingerprint, decodable QR, and exact backup.
4. A separate full-group edition selects schedule plus every local category and official resources. Its fixture is deliberately valid but produces a URL in the 1,801–16,000 range; Generate returns `QR_TOO_LONG` while still yielding the exact usable link and backup and no QR.
5. Fresh learner contexts open both links, accept them, and see the identical card/copy/order/revisions/fingerprint; the full-group learner proves the long non-QR link is still usable.
6. Today/Path/Library and local checklist/resource state behave correctly.
7. A second compact-edition switch preserves core/manual history and scopes only edition-derived local state.

Assert the compact and full-group URL-length preconditions explicitly so neither journey can silently cross the QR boundary as fixture bytes evolve.

- [ ] **Step 2: Capture browser RED**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
npm --prefix tests/smoke ci
bash tests/smoke/run-local-playwright.sh rotation-edition-v2.spec.js --project=nav-ms3 --project=nav-res
```

Expected: the fixture route/journey and pilot protocol do not yet exist.

- [ ] **Step 3: Add adversarial browser and accessibility coverage**

For both audiences, route valid and one-at-a-time corrupted projections/payloads: disabled gate, wrong audience, tampered projection/record/reference/edition digest, unknown/deprecated-builder/blocked keys, cross-location place/link, raw legacy public field, oversize URL/config/local document, v1 payload, quota failure, storage register-then-throw, hostile listener/history/location/dialog/reload, and stale preview/import results. Assert fixed non-echoing errors, zero partial edition/local writes, canonical core render, no residual startup listeners, and no raw catalog/import/payload values in DOM/console/alerts.

Run curator and learner at desktop plus `390x844`, keyboard-only, light and dark. Assert reading order, labels including placement occurrence/position/week, focus after errors/removals, status announcements, visible hostname, and computed contrast. Assert the exact immutable core/local authority labels, locally-curated resource label, documentation privacy/supervision guardrail, and local-policy boundary in both audiences; inject hostile catalog/config lookalikes and prove none can replace or suppress that code-owned copy. Reacquire controls after every rerender so browser tests cannot pass on detached nodes.

- [ ] **Step 4: Add the draft pilot protocol**

Begin the document with:

```text
DRAFT — HUMAN REVIEW AND APPROVAL REQUIRED
```

Include exact preconditions: confirm no v1 link was externally shared; review every real catalog name, role, location, place, phrase, official URL/hostname, audience scope, and `verifiedOn`; run both production-disabled and synthetic-enabled gates; obtain faculty/institutional privacy and clinical review; test synthetic details before any real proposal; conduct sessions with two attendings from different training settings, at least one MS3 edition and one resident edition, and four trainees total with both audiences represented; test mobile first-day comprehension, local/core distinction, fingerprint matching, long-link/QR behavior, and corrupt-link recovery; record findings without PHI; stop release while any P0 or P1 pilot finding remains open; and require separate approval for real catalog content, gate enablement, merge, and deployment. Do not state that any item is already approved.

- [ ] **Step 5: Wire full verification into CI without enabling production**

Add the catalog Python tests/validator and the new two-audience Playwright file to the existing jobs. Preserve the two sequential site builds and existing static QA. CI fixtures may enable only route-fulfilled in-memory projections; checked-in catalog/governance remain empty/disabled.

- [ ] **Step 6: Run the complete release-candidate evidence set**

```bash
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
python3 13_Faculty_Resources/_automation/test_validate_rotation_edition_catalog.py
python3 13_Faculty_Resources/_automation/validate_rotation_edition_catalog.py
python3 13_Faculty_Resources/_automation/test_validate_rotation_edition_schema.py
python3 13_Faculty_Resources/_automation/validate_rotation_edition_schema.py
node --test tests/*.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
npm --prefix tests/smoke ci
bash tests/smoke/run-local-playwright.sh --project=nav-ms3 --project=nav-res
```

Expected: all targeted and full gates pass; both checked-in sites remain production-disabled; enabled behavior is proved only with reviewed synthetic test records.

- [ ] **Step 7: Inspect the final public surface and diff**

```bash
git diff --check
git status --short
rg -n 'rotationEditionV2|FD_ROTATION_EDITION_CATALOG|cw_rotation_edition_ms3_v2|rp_rotation_edition_resident_v2' 13_Faculty_Resources tests rotation_edition.schema.json
rg -n 'textarea|type="url"|orientationDetails|firstDayArrival|changeNote' 13_Faculty_Resources/Rotation_Curation/rotation-curator.html 13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js rotation_edition.schema.json
```

Manually inspect both built curator and learner pages to confirm the production gate is disabled, raw catalog sources/fixtures are absent, v1 salvage code is curator-only, and no learner-facing free-text/URL control remains. Treat any unexpected match as a blocker until explained by a test-only, legacy-salvage, or fixed non-public context.

- [ ] **Step 8: Commit the verification and pilot handoff**

```bash
git add tests/smoke/rotation-edition-fixture.js tests/smoke/rotation-edition-v2.spec.js tests/smoke/playwright.config.js tests/smoke/rotation-curator.spec.js tests/fixtures/rotation-edition-catalog/valid-catalog.json tests/fixtures/rotation-edition-catalog/valid-governance.json docs/pilots/rotation-edition-v2-pilot-protocol.md .github/workflows/ci.yml
git commit -m "test: prove structured rotation edition journeys"
```

---

## Completion and Human Handoff

After Task 8, request an independent requirements review and code-quality review over the full Task 0–8 diff. Address every Critical or Important finding with a new red/green test and rerun the complete evidence set. The implementation is technically complete only when both reviewers approve, the worktree is clean, and the checked-in production projection is still empty/disabled.

Then hand the user:

- a plain-language description of what trainees and attendings can now do;
- exact test/build/browser evidence separated from human clinical/content approval;
- the catalog onboarding workflow and draft pilot protocol;
- confirmation that no production gate, real identity/location record, merge, push, or deploy was performed; and
- one concrete next step: human-review a first real location/profile/phrase/link proposal, run the pilot, and separately approve a future gate-enablement change.

**Innovative follow-on, outside this plan:** design a signed institutional site-pack compiler that produces reviewable catalog proposals and revocation metadata. Do not implement it here; issuer signatures can prove origin and integrity but cannot replace semantic, privacy, clinical, or institutional review.
