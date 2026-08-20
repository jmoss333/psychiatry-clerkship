# Attending-Curated Rotation Editions Implementation Plan

> **Superseded:** The user-approved structured-catalog amendment replaces this plan's schema-v1/free-text requirements, the failed/superseded Task 12 approach, and unexecuted Tasks 13–15. Continue with `docs/superpowers/plans/2026-08-19-structured-rotation-edition-catalog-v2.md`. Tasks 1–11 remain historical implementation context only; do not resume this plan's public prose, raw-URL, v1 storage, or regex-screening work.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an attending create a privacy-safe, audience-locked MS3 or resident rotation edition, share it as an immutable link, and let trainees use that edition inside the existing clerkship site without changing the reviewed clinical core or sending learner activity to a backend.

**Architecture:** Keep the current MS3 and resident builds canonical. Add one strict rotation-edition schema, a shared browser contract for validation/encoding/fingerprints, a pure projector that overlays only the Path and local orientation, an early learner bootstrap that validates before first render, and one guided curator tool emitted into both audience builds. The build injects the active audience, catalog, path, and exact repository revision into both the shell and curator; all edition and learner state remains in approved `cw_*` browser storage.

**Tech Stack:** Static HTML/CSS, ES5-style build-injected JavaScript, Web Crypto SHA-256, JSON Schema Draft 7 with Python `jsonschema`, Node `node:test`, Playwright/Chromium, Python build tooling, Netlify static builds, vendored `qrcode-generator` 1.4.4.

**Spec:** `docs/superpowers/specs/2026-08-19-attending-curated-rotation-editions-design.md`

## Global Constraints

- Work only in the isolated feature worktree. Never reset, switch, or clean the user's dirty primary checkout.
- Do not hand-edit `_build/ms3` or `_build/res`; they are generated verification artifacts.
- Keep the existing MS3 six-week and resident four-week path IDs and exact durations unchanged.
- Treat every imported, stored, or URL-carried edition as untrusted, even when its SHA-256 digest matches.
- Version 1 uses plain UTF-8 JSON plus unpadded base64url only. Do not add compression, encryption, or a migration guess for unknown refs; an explicit future encoding/alias map requires its own reviewed version.
- Do not add accounts, a database, analytics, learner reporting, uploads, a URL shortener, a QR web service, or cross-site configuration fetches.
- Do not add PHI, learner identity, evaluations, credentials, access codes, private contact details, medication doses, or copied local clinical protocols to code, fixtures, screenshots, browser traces, or docs.
- Keep the clinical Library, Safety Kit, Single Safety Rule, governance metadata, attestation state, supervision boundaries, escalation language, and resource bodies outside the projector's write surface.
- Render all edition text with `textContent`, `createTextNode`, or the existing `fdEsc()` helper. Never pass edition text to `innerHTML` unescaped.
- Keep shared Front Door modules audience-neutral and ES5-style (`var` and functions; no imports, `const`, `let`, arrow functions, or template literals) because the build injects their bodies into single-file pages.
- Use only `cw_curator_draft_v1`, `cw_rotation_edition_v1`, and `cw_rotation_local_progress_v1` for new storage. Preserve all existing `cw_*` and `rp_*` values except the explicitly derived `cw_plan_v1` compatibility refresh.
- Keep curator governance `pending`; technical completion is not faculty attestation, verified identity, institutional approval, deployment authorization, or approval of local protocol content.
- Use synthetic training-location data in automated tests and initial pilot materials.
- Do not merge or deploy without separate user authorization after implementation and review.

---

## Task 1: Add the strict edition schema and offline validation gate

**Files:**

- Create: `rotation_edition.schema.json`
- Create: `tests/fixtures/rotation-editions/valid-ms3.json`
- Create: `tests/fixtures/rotation-editions/valid-resident.json`
- Create: `tests/fixtures/rotation-editions/invalid-extra-property.json`
- Create: `tests/fixtures/rotation-editions/invalid-unsafe-url.json`
- Create: `13_Faculty_Resources/_automation/validate_rotation_edition_schema.py`
- Create: `13_Faculty_Resources/_automation/test_validate_rotation_edition_schema.py`
- Modify: `13_Faculty_Resources/_automation/site_build/build_and_check.sh`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: the approved envelope shape and limits from the design spec.
- Produces: a Draft 7 schema with `additionalProperties: false` at every object boundary, deterministic valid/invalid fixtures, and a publish-time schema gate.

- [ ] Write `test_validate_rotation_edition_schema.py` first. Require it to prove that both valid fixtures pass; every object definition forbids extra properties; MS3 accepts only `ms3-six-week` with weeks 1–6; resident accepts only `resident-four-week` with weeks 1–4; and the two invalid fixtures fail at the expected JSON pointer without echoing the rejected value.

- [ ] Run the new test and confirm it fails because the schema, fixtures, and validator do not exist:

  ```bash
  python3 13_Faculty_Resources/_automation/test_validate_rotation_edition_schema.py
  ```

- [ ] Create `rotation_edition.schema.json` with the exact top-level fields `format`, `schemaVersion`, `config`, and `digest`. Set `format` to `cw-rotation-edition`, `schemaVersion` to `1`, and `digest` to `^sha256-[A-Za-z0-9_-]{43}$`.

- [ ] Define exact nested objects for `card`, `pathItems`, `localOrientation`, `contacts`, `checklist`, and `resources`. Encode these limits directly in the schema:

  ```text
  title/location/curator/role/labels: 1..100 characters
  rationale and changeNote: 0..280 characters
  structured orientation fields: 0..600 characters
  checklist: at most 24 items
  local resources: at most 12 items
  URL: at most 2048 characters and ^https://
  locationCode: ^[A-Z0-9]{2,8}$
  date: ^[0-9]{4}-[0-9]{2}-[0-9]{2}$
  core revision: ^[0-9a-f]{40}$
  priority: required | recommended | optional
  instance/local IDs: printable non-whitespace strings, at most 160 characters
  ```

- [ ] Represent audience/path/week coupling with schema `oneOf`: the MS3 branch fixes `audience`, `pathId`, and week maximum 6; the resident branch fixes them and week maximum 4. Leave date ordering, known-ref membership, ID uniqueness, canonical size, and semantic text screening to the shared policy validator because Draft 7 cannot express those safely here.

- [ ] Add two synthetic valid fixtures. Use full 40-character core revisions, HTTPS example domains, no operational contact/access details, and structurally valid illustrative digest strings. Add invalid fixtures for an unexpected nested property and a non-HTTPS local resource.

- [ ] Implement `validate_rotation_edition_schema.py` using `Draft7Validator.check_schema()` and `iter_errors()`. Expose:

  ```python
  load_schema(root: Path) -> dict
  validate_document(document: dict, schema: dict) -> list[str]
  validate_fixtures(root: Path) -> None
  ```

  Error output must contain only the fixture filename and JSON pointer, never the rejected field value.

- [ ] Add the validator to `build_and_check.sh` immediately after `validate_curriculum.py`. Add adjacent CI steps for the Python unit test and validator before the root Node suite.

- [ ] Run the focused tests and gate:

  ```bash
  python3 13_Faculty_Resources/_automation/test_validate_rotation_edition_schema.py
  python3 13_Faculty_Resources/_automation/validate_rotation_edition_schema.py
  ```

  Expected: both commands exit 0; valid fixture count is 2; the validator prints no fixture contents.

- [ ] Commit:

  ```bash
  git add rotation_edition.schema.json tests/fixtures/rotation-editions 13_Faculty_Resources/_automation/validate_rotation_edition_schema.py 13_Faculty_Resources/_automation/test_validate_rotation_edition_schema.py 13_Faculty_Resources/_automation/site_build/build_and_check.sh .github/workflows/ci.yml
  git commit -m "feat: define rotation edition schema"
  ```

---

## Task 2: Implement the shared validator, canonical codec, digest, and fingerprint

**Files:**

- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_contract.js`
- Create: `tests/fd-edition-contract.test.mjs`
- Create: `tests/fd-edition-schema-parity.test.mjs`

**Interfaces:**

- Consumes: an untrusted config/envelope, the audience-correct `fdBuildIndex()` output, `{audience, pathId, coreRevision}`, and `crypto.subtle`.
- Produces: normalized configs, structured privacy-safe findings, canonical JSON, versioned envelopes, base64url fragments, deterministic SHA-256 digests, and human-readable fingerprints.

- [ ] Write `fd-edition-contract.test.mjs` first. Load the real module body with `new Function`, provide Node's `webcrypto.subtle`, and add valid MS3/resident tests plus rejection tests for wrong digest, audience, path, week, ref, priority, duplicate IDs/order, extra property, date order, excessive counts/length, unsafe URL/text, malformed UTF-8/base64url, unsupported schema version, canonical config over 12 KiB, and complete URL over 16,000 characters.

- [ ] Pin deterministic fixtures: recursive object-key reordering must not change canonical JSON, digest, or fingerprint; array reordering must change them; one student-visible edit must change the digest and fingerprint; and `BHU2-MS3-` / `MMC-RES-` prefixes must be normalized exactly.

- [ ] Write `fd-edition-schema-parity.test.mjs` to compare the module's public limits/enums/patterns against `rotation_edition.schema.json`. The test must fail if either implementation changes audience/path pairing, priority values, count limits, text maxima, URL maximum, location-code pattern, revision pattern, or schema version without changing the other.

- [ ] Run both tests and confirm failure because the contract module is absent:

  ```bash
  node --test tests/fd-edition-contract.test.mjs tests/fd-edition-schema-parity.test.mjs
  ```

- [ ] Implement one immutable public rules object:

  ```javascript
  var FD_EDITION_RULES={
    format:'cw-rotation-edition',schemaVersion:1,
    maxConfigBytes:12288,maxUrlChars:16000,maxQrChars:1800,
    maxChecklist:24,maxResources:12,maxUrl:2048,
    maxTitle:100,maxRationale:280,maxOrientation:600,
    priorities:['required','recommended','optional'],
    paths:{ms3:{id:'ms3-six-week',weeks:6,code:'MS3'},
           resident:{id:'resident-four-week',weeks:4,code:'RES'}}
  };
  ```

- [ ] Implement these pure/small functions with no DOM or storage access:

  ```javascript
  fdEditionNormalizeConfig(config)
    -> {ok:true,value:normalized}|{ok:false,errors:[finding]}
  fdEditionValidateConfig(config,index,siteContext)
    -> {ok,value,errors,warnings,canonicalBytes}
  fdEditionCanonicalJson(value) -> string
  fdEditionBase64urlEncode(bytes) -> string
  fdEditionBase64urlDecode(text,maxBytes) -> Uint8Array
  fdEditionDigest(preDigestObject,subtle) -> Promise<'sha256-...'>
  fdEditionDigestEqual(expected,actual) -> boolean
  fdEditionFingerprint(config,digest) -> 'BHU2-MS3-4F7C2Q'
  fdEditionCreateEnvelope(config,index,siteContext,subtle)
    -> Promise<{ok,envelope,payload,fingerprint,canonicalBytes,errors,warnings}>
  fdEditionValidateEnvelope(envelope,index,siteContext,subtle)
    -> Promise<{ok,envelope,config,fingerprint,errors,warnings}>
  fdEditionDecodePayload(payload,index,siteContext,subtle,totalUrlLength)
    -> Promise<{ok,envelope,config,fingerprint,errors,warnings}>
  fdEditionDiagnostic(result,siteContext)
    -> {code,schemaVersion,fingerprint,currentCoreRevision}
  ```

- [ ] Normalize all accepted strings to Unicode NFC, convert CRLF/CR to LF, trim outer whitespace, and uppercase the location code before validation. Canonicalize recursively by sorting object keys and preserving array order, then serialize compact UTF-8 JSON. Hash only `{format,schemaVersion,config}`; add the resulting digest afterward so the digest never recursively includes itself.

- [ ] Rebuild normalized objects from explicit field allowlists rather than spreading/assigning untrusted objects. Reject `__proto__`, `constructor`, `prototype`, unknown keys, and unexpected nesting before canonicalization. Compare the 32 decoded digest bytes with a full-length XOR accumulation in `fdEditionDigestEqual()`; do not return early on the first differing byte.

- [ ] Build the six-character token from the first 30 digest bits with Crockford Base32 alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`. The fingerprint is an equality aid, not an authentication token; no validation result may call it verified identity or a signature.

- [ ] Make every finding `{code,path,message,blocking}`. Paths are JSON pointers; messages describe the rule without echoing user-entered text. Use stable codes such as `EDITION_SCHEMA`, `EDITION_DIGEST`, `EDITION_AUDIENCE`, `EDITION_REF`, `EDITION_WEEK`, `EDITION_SIZE`, `EDITION_URL`, and `EDITION_TEXT_RISK`.

- [ ] Block direct email patterns, phone/pager-number patterns, credential assignments, access/door-code assignments, numeric medication-dose patterns, control characters, HTML-like tags, event-attribute text, and executable/data URL schemes. Emit advisory warnings for ambiguous mentions of patient identifiers, credentials, protocols, or dosing that do not meet a blocking pattern. Warnings never claim the text is PHI-free and never replace the four publication affirmations.

- [ ] Require the validator to prove that every `pathItems[].ref` exists in `index.byRef`, every `instanceId` and local ID is unique, order values are unique and contiguous within each week, dates are real calendar dates with end not before start, and the current index has the exact audience path/duration.

- [ ] Decode only an exact unpadded base64url payload and reject padding, alternate alphabets, compressed wrappers, trailing fragment parameters, unknown refs, or unsupported versions. Version 1 has no ref alias map, so the validator must never guess a replacement.

- [ ] Run:

  ```bash
  node --test tests/fd-edition-contract.test.mjs tests/fd-edition-schema-parity.test.mjs
  ```

  Expected: all codec, risk, size, parity, and deterministic fingerprint cases pass.

- [ ] Commit:

  ```bash
  git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_contract.js tests/fd-edition-contract.test.mjs tests/fd-edition-schema-parity.test.mjs
  git commit -m "feat: add rotation edition contract"
  ```

---

## Task 3: Add the pure Path projector and protected-surface invariants

**Files:**

- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_project.js`
- Create: `tests/fd-edition-project.test.mjs`

**Interfaces:**

- Consumes: a canonical audience index plus a successfully validated edition result.
- Produces: a new projected index whose weeks reflect the edition while Library columns, Safety Kit, governance, resource bodies, and canonical input remain unchanged.

- [ ] Write failing tests for both audience durations, selected/omitted/repeated refs, order, priority/rationale decoration, local data separation, and invalid projector inputs. Snapshot `canonicalIndex.columns`, `.kit`, `.byRef`, and the entire input before projection.

- [ ] Add a protected-surface test that freezes the canonical index recursively. The projector must succeed without writes and must leave Library columns, Safety Kit entries, governance triplets, attestation flags, hrefs, titles, summaries, clinical metadata, and the canonical `path.id`/`weekCount` byte-equivalent.

- [ ] Run and confirm the module-not-found failure:

  ```bash
  node --test tests/fd-edition-project.test.mjs
  ```

- [ ] Implement:

  ```javascript
  fdProjectEdition(canonicalIndex,validatedEdition)
    -> {ok:true,index:projectedIndex}|{ok:false,errors:[finding]}
  fdEditionIndexFingerprint(index) -> string
  fdEditionCoreProgressRef(projectedItem) -> string
  ```

- [ ] Rebuild each output week from the canonical week's `n`, `title`, `theme`, and `focusCategories`, then map the edition's ordered path instances to cloned canonical `byRef` items. Decorate only the clone with `editionInstanceId`, `editionPriority`, and `editionRationale`. Keep repeated instances separate in the week array while `fdEditionCoreProgressRef()` always returns the stable core `ref`.

- [ ] Attach one edition metadata object to the projected index:

  ```javascript
  projected.edition={
    envelope:validatedEdition.envelope,
    fingerprint:validatedEdition.fingerprint,
    card:validatedEdition.config.card,
    editionNumber:validatedEdition.config.editionNumber,
    createdAgainstCoreRevision:validatedEdition.config.createdAgainstCoreRevision,
    changeNote:validatedEdition.config.changeNote,
    localOrientation:validatedEdition.config.localOrientation
  };
  ```

  Local resources and checklist items stay under `index.edition.localOrientation`; they never enter `byRef`, `columns`, or `kit` and never acquire core governance labels.

- [ ] Return a failure rather than a partial index if the validated result or canonical index is inconsistent. The caller must keep the canonical index in that case.

- [ ] Run:

  ```bash
  node --test tests/fd-edition-project.test.mjs
  ```

  Expected: all projection and immutability tests pass for 4- and 6-week fixtures.

- [ ] Commit:

  ```bash
  git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_project.js tests/fd-edition-project.test.mjs
  git commit -m "feat: project curated rotation paths"
  ```

---

## Task 4: Define startup, switching, and edition-scoped storage as a pure transition layer

**Files:**

- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_student.js`
- Create: `tests/fd-edition-storage.test.mjs`

**Interfaces:**

- Consumes: canonical index, site context, URL fragment, stored edition text, Web Crypto, and an injected storage adapter only at explicit commit functions.
- Produces: a no-write startup decision, explicit first-accept/switch commits, edition-scoped local progress, safe diagnostic data, and accessible switch/error markup.

- [ ] Write a recording in-memory storage harness and failing tests for: first valid edition; same edition; valid stored edition with no fragment; different/newer/older candidate; declined switch; invalid stored JSON; malformed/wrong-audience/wrong-path/oversized incoming link; and projection failure.

- [ ] For every declined or invalid case, assert zero writes. For same-edition startup, assert zero writes. For first acceptance, assert that only `cw_rotation_edition_v1` and `cw_rotation_local_progress_v1` are written. For switching, assert those two are the only direct writes and all `cw_progress_v1`, `cw_pretest_v1`, `cw_qb_v1`, unrelated `cw_*`, and every `rp_*` value remain byte-for-byte unchanged.

- [ ] Run and confirm failure:

  ```bash
  node --test tests/fd-edition-storage.test.mjs
  ```

- [ ] Implement the no-write resolver:

  ```javascript
  fdEditionResolveStartup(canonicalIndex,siteContext,pageUrl,incomingHash,storedText,subtle)
    -> Promise<{
         mode:'core'|'active'|'switch-required'|'rejected',
         needsCommit:boolean,
         active:null|validatedEdition,
         candidate:null|validatedEdition,
         index:canonicalOrProjectedIndex,
         receipt:null|diagnostic
       }>
  ```

  Validate stored and incoming envelopes independently. Prefer a valid stored edition as the active index while a different incoming edition awaits confirmation. Never write or delete corrupt stored data during resolution.

- [ ] Implement explicit storage operations:

  ```javascript
  fdEditionAcceptFirst(storage,validatedEdition)
  fdEditionAcceptSwitch(storage,validatedEdition)
  fdEditionReadLocalProgress(storage,fingerprint)
  fdEditionToggleLocalProgress(storage,fingerprint,kind,id)
  ```

  Use this exact local-progress shape:

  ```json
  {"schemaVersion":1,"byFingerprint":{"BHU2-MS3-4F7C2Q":{"checklist":{},"resources":{}}}}
  ```

  Initialize only the accepted fingerprint and preserve every other fingerprint bucket. Do not store learner identity, free text, or an activity timestamp.

- [ ] Add `fdEditionSwitchMarkup(active,candidate)` using a semantic dialog title and both full fingerprints, and `fdEditionErrorMarkup(receipt)` using `role="alert"`. These renderers may show only the privacy-safe diagnostic fields.

- [ ] Run:

  ```bash
  node --test tests/fd-edition-storage.test.mjs
  ```

  Expected: transition and exact-storage-operation assertions pass.

- [ ] Commit:

  ```bash
  git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_student.js tests/fd-edition-storage.test.mjs
  git commit -m "feat: add rotation edition startup state"
  ```

---

## Task 5: Inject audience and core revision once for both runtime consumers

**Files:**

- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor_catalog.py`
- Modify: `13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py`
- Modify: `13_Faculty_Resources/_automation/site_build/common.py`
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py`
- Modify: `13_Faculty_Resources/_automation/site_build/resident_section.py`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Modify: `tests/fd-shell-boot.test.mjs`

**Interfaces:**

- Consumes: the build's audience, projected curriculum/catalog, and `validate_tool_governance.current_revision()` result.
- Produces: `FD_AUDIENCE`, `FD_CORE_REVISION`, and the three shared edition module bodies in each final learner shell.

- [ ] Extend `test_frontdoor_catalog.py` first. Require `build_frontdoor_payload(site,curriculum,catalog,revision)` to reject unsupported sites or non-40-hex revisions, return the exact audience/revision, and inject all seven data needles into both a shell-shaped fixture and a curator-shaped fixture exactly once.

- [ ] Extend `fd-shell-boot.test.mjs` to require one marker each for `FD_EDITION_CONTRACT`, `FD_EDITION_PROJECT`, and `FD_EDITION_STUDENT`, and one JSON literal each for `FD_AUDIENCE` and `FD_CORE_REVISION`.

- [ ] Run focused tests and confirm the new assertions fail:

  ```bash
  python3 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py
  node --test tests/fd-shell-boot.test.mjs
  ```

- [ ] Add `FD_AUDIENCE` and `FD_CORE_REVISION` to `DATA_DEFAULTS`. Change `build_frontdoor_payload()` to require `revision`, validate it against `^[0-9a-f]{40}$`, and return `audience` and `coreRevision`. Change `inject_frontdoor_payload()` to inject those exact values with the existing five globals.

- [ ] Register these shared markers in `common.SNIPPET_MARKERS`:

  ```python
  "/*__FD_EDITION_CONTRACT__*/": "frontdoor/fd_edition_contract.js",
  "/*__FD_EDITION_PROJECT__*/": "frontdoor/fd_edition_project.js",
  "/*__FD_EDITION_STUDENT__*/": "frontdoor/fd_edition_student.js",
  ```

- [ ] In each build script, compute `_core_revision = current_revision(Path(LIB))` before Front Door payload creation, pass it to `build_frontdoor_payload()`, and later pass the same value as `revision=_core_revision` to `build_governance_document()`. This guarantees the edition card and `tool-governance.json` describe the same checkout rather than two independent lookups.

- [ ] Add the three edition markers to `spa_index.html` after `FD_DATA` and before modules that may call edition helpers. Add:

  ```javascript
  var FD_AUDIENCE="";
  var FD_CORE_REVISION="";
  ```

- [ ] Run:

  ```bash
  python3 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py
  node --test tests/fd-shell-boot.test.mjs
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
  ```

  Expected: both built `index.html` files contain their correct audience, the same 40-character revision as their `tool-governance.json` items, and no unexpanded edition marker.

- [ ] Commit:

  ```bash
  git add 13_Faculty_Resources/_automation/site_build/frontdoor_catalog.py 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py 13_Faculty_Resources/_automation/site_build/common.py 13_Faculty_Resources/_automation/site_build/build_deploy.py 13_Faculty_Resources/_automation/site_build/resident_section.py 13_Faculty_Resources/_automation/site_build/spa_index.html tests/fd-shell-boot.test.mjs
  git commit -m "feat: inject rotation edition build context"
  ```

---

## Task 6: Bootstrap the learner shell only after edition validation

**Files:**

- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_student.js`
- Modify: `tests/fd-shell-boot.test.mjs`
- Modify: `tests/smoke/frontdoor-runtime.spec.js`

**Interfaces:**

- Consumes: `location.hash`, `cw_rotation_edition_v1`, `FD_CANONICAL_INDEX`, and injected site context before any Today/Path/plan calculation.
- Produces: one `FD_INDEX` selected before first render, automatic first acceptance, an accessible switch decision, and safe core fallback.

- [ ] Add failing boot-contract assertions that `FD_CANONICAL_INDEX` is created exactly once, `fdEditionResolveStartup()` runs before `fdRotationWeek()`, `fdResolveState()`, `fdRender()`, and `fdWire()`, and the old synchronous boot block is absent.

- [ ] Add Playwright runtime cases with synthetic valid links for first acceptance, stored-edition reload after the hash is removed, same-edition no-churn, different-edition prompt, decline, accept-and-reload, malformed link, and wrong-audience link. Record `localStorage` before and after the rejected/declined cases.

- [ ] Run the focused suites and confirm the order and browser cases fail:

  ```bash
  node --test tests/fd-shell-boot.test.mjs
  cd tests/smoke && npx playwright test frontdoor-runtime.spec.js --project=nav-ms3 --project=nav-res
  ```

- [ ] Replace the synchronous boot tail with:

  ```javascript
  var FD_CANONICAL_INDEX=fdBuildIndex(FD_CURRICULUM,FD_TOPIC_META,FD_TOOL_REGISTRY,FD_SITE_MANIFEST);
  var FD_INDEX=FD_CANONICAL_INDEX;
  var FD_SITE_CONTEXT={audience:FD_AUDIENCE,pathId:FD_CANONICAL_INDEX.path.id,
                       coreRevision:FD_CORE_REVISION};
  fdEditionResolveStartup(FD_CANONICAL_INDEX,FD_SITE_CONTEXT,location.href,location.hash,
    localStorage.getItem('cw_rotation_edition_v1'),crypto.subtle).then(fdStartFrontDoor,
    function(){fdStartFrontDoor({mode:'rejected',index:FD_CANONICAL_INDEX,
      receipt:{code:'EDITION_RUNTIME',schemaVersion:1,fingerprint:'',
               currentCoreRevision:FD_CORE_REVISION}});});
  ```

- [ ] Extract the existing block from `TOPIC_META=FD_TOPIC_META` through initial resource opening into `fdStartFrontDoor(result)`. Set `FD_INDEX=result.index` before rotation week, state, Today, Path, progress, or plan logic runs. Keep all existing controller/event/hydration behavior inside that function.

- [ ] For `mode:'active'` with `needsCommit:true`, call `fdEditionAcceptFirst()` before rendering. A stored or same incoming edition returns `needsCommit:false` and causes no writes. For `switch-required`, start with the stored active edition, then mount the semantic dialog. Accept via `fdEditionAcceptSwitch()`, clear the hash with `history.replaceState`, and reload; decline clears only the incoming hash and closes the dialog. For `rejected`, start the normal core/stored app and mount the privacy-safe alert without trapping focus.

- [ ] Set `aria-busy="true"` on the shell while the Promise resolves and remove it in every `fdStartFrontDoor()` path. Do not render a canonical Today page and then replace it; first meaningful learner render must already use the selected index.

- [ ] Handle unavailable Web Crypto as `EDITION_CRYPTO`: do not accept, persist, or project either incoming or stored edition data because its digest cannot be revalidated. Load the normal core index and show the privacy-safe alert.

- [ ] Run:

  ```bash
  node --test tests/fd-shell-boot.test.mjs tests/fd-edition-storage.test.mjs
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
  cd tests/smoke && npx playwright test frontdoor-runtime.spec.js --project=nav-ms3 --project=nav-res
  ```

  Expected: no pre-validation render, both audiences load their correct edition, and all rejected/declined storage snapshots remain unchanged.

- [ ] Commit:

  ```bash
  git add 13_Faculty_Resources/_automation/site_build/spa_index.html 13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_student.js tests/fd-shell-boot.test.mjs tests/smoke/frontdoor-runtime.spec.js
  git commit -m "feat: load learner editions before first render"
  ```

---

## Task 7: Render the compact edition card and clearly separated local guidance

**Files:**

- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_student.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_path.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Create: `tests/fd-edition-render.test.mjs`
- Modify: `tests/fd-today.test.mjs`
- Modify: `tests/fd-path.test.mjs`

**Interfaces:**

- Consumes: `index.edition`, current core revision, and edition-scoped local completion.
- Produces: escaped card/local markup, visible local/core labels and domains, priority/rationale metadata, and local checklist/resource controls.

- [ ] Write pure-render tests first. Include hostile text (`<img>`, quotes, ampersands), long but valid text, all three priorities, local links, expanded/collapsed card content, full fingerprints, current/original core revisions, curator non-verification language, and empty optional fields.

- [ ] Extend Today tests to require the existing setup/Continue action before the compact card in DOM order, so first-day action remains above it on 390-pixel mobile. Extend Path tests to require edition priority/rationale on cloned core rows and separately labeled local resources without changing core progress refs.

- [ ] Run and confirm failure:

  ```bash
  node --test tests/fd-edition-render.test.mjs tests/fd-today.test.mjs tests/fd-path.test.mjs
  ```

- [ ] Implement escaped render helpers:

  ```javascript
  fdEditionCardMarkup(edition,currentCoreRevision)
  fdEditionCoreMetaMarkup(item)
  fdEditionLocalOrientationMarkup(edition,localProgress)
  fdEditionWeekResourcesMarkup(edition,week,localProgress)
  fdEditionExternalDomain(url)
  ```

- [ ] Use a native `<details>` card. Its summary shows location, edition number, full fingerprint, and `Locally curated`. Expanded content shows curator/role, audience and duration, rotation/last-verified dates, current core revision, original core revision, change note, `Identity not digitally verified`, and a sentence that the fingerprint confirms configuration equality only.

- [ ] Keep the existing setup or Continue card first in `fd_today.js`, insert the compact edition card immediately afterward, then render allowed local orientation/checklist content. This ordering satisfies both “near the top” and “first-day action above the mobile fold.”

- [ ] Add priority and rationale beneath cloned core Path/Today rows using text labels, never color alone. Render local resources in the matching week under a heading `Attending-provided local resources`, with visible hostname, `target="_blank"`, and `rel="noopener noreferrer"`. Never give local resources core `attested`, `reviewed`, or institutional-approval labels.

- [ ] Add local checklist/resource toggle handling to `fdAuxClick()` for `data-fd-local-toggle`. Call `fdEditionToggleLocalProgress()` and refresh only learner local surfaces. Core completion remains keyed by `ref` in `cw_progress_v1`.

- [ ] Add responsive CSS for the card, local labels, priorities, warning copy, dialog, and 44-pixel controls. At `390px`, prohibit horizontal overflow and keep the setup/Continue action visible before the edition card. Respect `prefers-reduced-motion`.

- [ ] Run:

  ```bash
  node --test tests/fd-edition-render.test.mjs tests/fd-today.test.mjs tests/fd-path.test.mjs
  node tests/contrast-check.mjs
  ```

  Expected: escaped rendering, ordering, accessible labels, and contrast checks pass.

- [ ] Commit:

  ```bash
  git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_student.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_today.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_path.js 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css 13_Faculty_Resources/_automation/site_build/spa_index.html tests/fd-edition-render.test.mjs tests/fd-today.test.mjs tests/fd-path.test.mjs
  git commit -m "feat: show learner edition context"
  ```

---

## Task 8: Make generated learning plans edition-compatible without erasing learner history

**Files:**

- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Modify: `tests/fd-plan-migration.test.mjs`
- Modify: `tests/smoke/frontdoor-runtime.spec.js`

**Interfaces:**

- Consumes: `fdEditionIndexFingerprint(index)` during plan generation/loading.
- Produces: `cw_plan_v1.editionFingerprint`, exact compatibility checks, and derived-plan-only regeneration.

- [ ] Add failing unit cases for a core plan with empty fingerprint, an edition plan with a matching fingerprint, the same path/duration with a different fingerprint, a legacy plan missing the field, and edition switching with/without usable placement data.

- [ ] Require exact storage operation assertions: a mismatched plan plus usable placement rewrites only `cw_plan_v1`; a mismatched plan without placement removes only `cw_plan_v1`; matching plans cause only one read; and core progress, pretest, question-bank, local progress, unrelated `cw_*`, and all `rp_*` values remain unchanged.

- [ ] Run and confirm failure:

  ```bash
  node --test tests/fd-plan-migration.test.mjs
  ```

- [ ] Add `editionFingerprint:fdEditionIndexFingerprint(index)` to `fdPlanFromMastery()`. Require exact equality in `fdPlanMatches()`, treating a core index as `''`. A legacy record missing the field is incompatible and follows the existing derived-plan migration path.

- [ ] Change `buildPlan()` to accept the index explicitly and update callers so regeneration can never accidentally use a stale global index during edition startup:

  ```javascript
  function buildPlan(index){
    var active=index||FD_INDEX;
    return fdPlanFromMastery(active,masteryByBlueprint(),
      new Date().toISOString(),LS('cw_shelf_date')||'');
  }
  ```

- [ ] Add a Playwright switch case proving the newly accepted edition regenerates/removes only the derived plan after reload and preserves the other seeded stores.

- [ ] Run:

  ```bash
  node --test tests/fd-plan-migration.test.mjs
  cd tests/smoke && npx playwright test frontdoor-runtime.spec.js --project=nav-ms3 --project=nav-res
  ```

  Expected: all migration/storage assertions pass for core, MS3, and resident indexes.

- [ ] Commit:

  ```bash
  git add 13_Faculty_Resources/_automation/site_build/spa_index.html tests/fd-plan-migration.test.mjs tests/smoke/frontdoor-runtime.spec.js
  git commit -m "feat: scope learner plans to editions"
  ```

---

## Task 9: Register a governed curator tool in both audience builds

**Files:**

- Create: `13_Faculty_Resources/Rotation_Curation/rotation-curator.html`
- Create: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js`
- Modify: `13_Faculty_Resources/_automation/site_build/common.py`
- Modify: `13_Faculty_Resources/_automation/site_build/site_manifest.json`
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py`
- Modify: `13_Faculty_Resources/_automation/site_build/resident_section.py`
- Modify: `curriculum.json`
- Modify: `13_Faculty_Resources/reviewed.json`
- Modify: `13_Faculty_Resources/_automation/validate_tool_governance.py`
- Modify: `13_Faculty_Resources/_automation/test_validate_tool_governance.py`
- Modify: `13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py`
- Create: `tests/fd-curator-contract.test.mjs`

**Interfaces:**

- Consumes: the same injected Front Door payload and site context as the learner shell.
- Produces: `/tools/rotation-curator.html` in both builds, hidden faculty-facing navigation accounting, a disabled-until-valid five-step shell, and pending governance.

- [ ] Write failing tests that require the manifest entry, a hidden nav entry in both `Feedback` sections, `curriculum.libraryExclude` coverage, a preferred metadata marker with `audience="faculty"`, pending ledger state, projected payload reinjection into both built curator files, and updated tool counts of 23 MS3 / 25 resident.

- [ ] Run:

  ```bash
  node --test tests/fd-curator-contract.test.mjs
  python3 13_Faculty_Resources/_automation/test_validate_tool_governance.py
  python3 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py
  ```

  Expected: failures identify the absent source/manifest/nav/governance records.

- [ ] Create a single-file HTML source with `id="root"`, a visible `Faculty rotation edition builder` title, an explicit `Account-free and not access-controlled` notice, semantic five-step navigation, editor and preview mounts, a final disabled Generate action, inline Clinical Warm styling, the seven data needles, and these module markers in dependency order:

  ```javascript
  /*__FD_DATA__*/
  /*__FD_EDITION_CONTRACT__*/
  /*__FD_EDITION_PROJECT__*/
  /*__FD_CURATOR__*/
  ```

- [ ] Add this conservative marker; do not claim review or approval in source metadata:

  ```html
  <!-- [CLERKSHIP-META v1] tool="Rotation Edition Curator" version="1.0" built="2026-08-19" category="faculty-curation" audience="faculty" settings="self-study" time="20min" clinicalClaim="false" summary="Arrange an audience-locked curriculum and bounded local orientation into an account-free edition link." -->
  ```

- [ ] Add the manifest tuple with slug `rotation-curator.html`, and add a hidden tool item named `Faculty: Curate a rotation edition` to both Feedback nav sections. Add a `libraryExclude` entry explaining that it is a faculty curation utility, not learner Library content.

- [ ] Add this exact ledger posture:

  ```json
  "rotation-curator.html": {
    "status": "pending",
    "risk": {"kind": "local-policy", "level": "moderate"},
    "reason": "New account-free faculty curation workflow awaiting faculty and privacy review.",
    "at": "2026-08-19",
    "by": "Pending faculty review"
  }
  ```

- [ ] Register `/*__FD_CURATOR__*/` in `SNIPPET_MARKERS`. Implement only the initial reducer/mount contract in `fd_curator.js`; publication remains disabled until later tasks satisfy the health gate.

- [ ] Update expected governance counts and exact count messages/tests from 22/24 to 23/25. Do not change any existing review state.

- [ ] Refactor both build scripts to call `inject_frontdoor_payload()` for a fixed tuple of destinations: `index.html` and `tools/rotation-curator.html`. In the resident build, reinject both after resident nav/topic projections so the copied MS3 curator cannot retain MS3 data.

- [ ] Run:

  ```bash
  python3 13_Faculty_Resources/_automation/test_validate_tool_governance.py
  python3 13_Faculty_Resources/_automation/validate_tool_governance.py
  python3 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py
  node --test tests/fd-curator-contract.test.mjs
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
  ```

  Expected: both builds ship the governed hidden tool, MS3 builder is locked to six weeks, resident builder to four, and Generate remains unavailable.

- [ ] Commit:

  ```bash
  git add 13_Faculty_Resources/Rotation_Curation/rotation-curator.html 13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js 13_Faculty_Resources/_automation/site_build/common.py 13_Faculty_Resources/_automation/site_build/site_manifest.json 13_Faculty_Resources/_automation/site_build/build_deploy.py 13_Faculty_Resources/_automation/site_build/resident_section.py curriculum.json 13_Faculty_Resources/reviewed.json 13_Faculty_Resources/_automation/validate_tool_governance.py 13_Faculty_Resources/_automation/test_validate_tool_governance.py 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py tests/fd-curator-contract.test.mjs
  git commit -m "feat: register rotation edition curator"
  ```

---

## Task 10: Implement edition metadata, draft persistence, import, and numbering

**Files:**

- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js`
- Modify: `13_Faculty_Resources/Rotation_Curation/rotation-curator.html`
- Create: `tests/fd-curator-state.test.mjs`

**Interfaces:**

- Consumes: the locked site context, form actions, an optional imported valid envelope, and `cw_curator_draft_v1`.
- Produces: one normalized draft, deterministic edition numbering, safe local save/restore, and Step 1 UI.

- [ ] Write reducer tests first for a new draft, field changes, valid/invalid dates, save/restore, corrupt/extra-field draft recovery, valid JSON backup import, wrong-audience import rejection, unchanged regeneration, and changed clone numbering.

- [ ] Run and confirm failure:

  ```bash
  node --test tests/fd-curator-state.test.mjs
  ```

- [ ] Define the draft shape exactly:

  ```javascript
  {
    schemaVersion:1,step:1,
    site:{audience:FD_AUDIENCE,pathId:FD_INDEX.path.id,coreRevision:FD_CORE_REVISION},
    config:{card:{...},pathItems:[],localOrientation:{...},changeNote:''},
    publication:{baseEnvelope:null,baseCanonicalConfig:'',lastGenerated:null},
    preview:{desktopReviewed:false,mobileReviewed:false},
    affirmations:{publicSafe:false,officialLinks:false,previewsReviewed:false,forwardable:false}
  }
  ```

  Validate restored drafts structurally before rendering. If invalid, ignore them and start clean without deleting the stored raw value automatically.

- [ ] Implement pure reducer/selectors:

  ```javascript
  fdCuratorNewDraft(index,siteContext)
  fdCuratorReduce(draft,action,index,siteContext)
  fdCuratorValidateStep(draft,step,index,siteContext)
  fdCuratorBuildConfig(draft,index,siteContext)
  fdCuratorNextEditionNumber(draft,candidateWithoutEditionNumber)
  fdCuratorDraftStorage(storage)
  fdCuratorImportEnvelope(text,index,siteContext,subtle)
  ```

- [ ] Edition numbering rule: new drafts publish as Edition 1; importing a valid envelope sets it as `baseEnvelope`; if all student-visible config except `editionNumber` is canonical-equal to the base, preserve its number; otherwise use `base.config.editionNumber + 1`. After a successful generation, update the base so generating again without edits preserves number, digest, and fingerprint.

- [ ] Build Step 1 fields from the spec with native labels, descriptions, maxlengths, and linked error summary. Display audience/path/duration as locked read-only facts. Dates and last-verified remain informational and never disable an existing imported edition merely because they are past.

- [ ] Save one draft only to `cw_curator_draft_v1`; show `Saved on this device` and never `Published`. Add a JSON file-picker import that reads only text, enforces a 64 KiB file cap before parse, parses one envelope, calls `fdEditionValidateEnvelope()`, and rejects wrong-audience editions without modifying the current draft.

- [ ] Reset both preview-reviewed flags and all public-link affirmations after every student-visible edit; step navigation alone does not reset them.

- [ ] Run:

  ```bash
  node --test tests/fd-curator-state.test.mjs
  ```

  Expected: all reducer, numbering, draft, and import rules pass.

- [ ] Commit:

  ```bash
  git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js 13_Faculty_Resources/Rotation_Curation/rotation-curator.html tests/fd-curator-state.test.mjs
  git commit -m "feat: add curator draft lifecycle"
  ```

---

## Task 11: Implement core selection and keyboard-complete 4-/6-week scheduling

**Files:**

- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js`
- Modify: `13_Faculty_Resources/Rotation_Curation/rotation-curator.html`
- Modify: `tests/fd-curator-state.test.mjs`
- Create: `tests/fd-curator-schedule.test.mjs`

**Interfaces:**

- Consumes: `FD_INDEX.weeks`, `.columns`, and `.byRef` plus curriculum/schedule reducer actions.
- Produces: a complete curated `pathItems` overlay with valid refs, unique instances, priority/rationale, bounded week, and contiguous order.

- [ ] Write failing reducer tests for default path import, omit/re-add, add Library-only core resources, repeated placements, move up/down, move across weeks, first/last boundary no-ops, delete, priority, rationale, and exact MS3/resident week bounds.

- [ ] Require deterministic IDs: canonical defaults use `core:<ref>:<occurrence>`; additional repeated placements use the next unused positive occurrence. Reordering never changes an instance ID.

- [ ] Run and confirm failure:

  ```bash
  node --test tests/fd-curator-state.test.mjs tests/fd-curator-schedule.test.mjs
  ```

- [ ] Seed a new draft from the current canonical Path, preserving its exact week/order and assigning `recommended` by default. Build the add-resource list from the audience-projected Library columns only; never restore the other audience path or offer the curator tool itself as curriculum.

- [ ] Implement reducer actions:

  ```text
  PATH_TOGGLE, PATH_ADD_INSTANCE, PATH_REMOVE_INSTANCE,
  PATH_SET_PRIORITY, PATH_SET_RATIONALE,
  PATH_MOVE_UP, PATH_MOVE_DOWN, PATH_MOVE_WEEK
  ```

  After every action, normalize `order` to 1..N inside each week. Reject unknown refs and out-of-range weeks inside the reducer, not only at publication.

- [ ] Build Step 2 with searchable resource groups, include/omit controls, `required/recommended/optional`, rationale counter, and a clear statement that “required” means required by this local rotation only. Omitted core resources remain visibly available in the Library preview.

- [ ] Build Step 3 with one semantic list per week. Every item has `Move up`, `Move down`, and `Move to week` controls. Drag handles may be progressive enhancement only; all behavior and tests must succeed with drag disabled.

- [ ] Use the pure projector for the student preview. Never implement a second preview-only scheduling algorithm.

- [ ] Run:

  ```bash
  node --test tests/fd-curator-state.test.mjs tests/fd-curator-schedule.test.mjs tests/fd-edition-project.test.mjs
  ```

  Expected: every schedule action stays within 1–6 MS3 or 1–4 resident, and projector tests still prove protected surfaces unchanged.

- [ ] Commit:

  ```bash
  git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js 13_Faculty_Resources/Rotation_Curation/rotation-curator.html tests/fd-curator-state.test.mjs tests/fd-curator-schedule.test.mjs
  git commit -m "feat: curate audience-specific rotation paths"
  ```

---

## Task 12: Add bounded local orientation and deliberate desktop/mobile preview

**Files:**

- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js`
- Modify: `13_Faculty_Resources/Rotation_Curation/rotation-curator.html`
- Modify: `tests/fd-curator-state.test.mjs`
- Create: `tests/fd-curator-local.test.mjs`

**Interfaces:**

- Consumes: structured local-detail actions and shared validator findings.
- Produces: bounded plain-text orientation, role/directory contacts, checklist/resources, visible-domain preview, and preview-completion state.

- [ ] Write failing tests for every approved orientation field, 24/12 item caps, HTTPS-only contacts/resources, ID uniqueness, visible domain extraction, priorities/weeks/rationales, character maxima, blocking and advisory text findings, and edit-triggered preview/affirmation reset.

- [ ] Run and confirm failure:

  ```bash
  node --test tests/fd-curator-local.test.mjs
  ```

- [ ] Implement reducer actions for the eight structured orientation text fields, role-based contacts, checklist items, and local resources. Generate local IDs as `local:first-day:<n>` and `local:resource:<n>`; normalize order after deletion; never accept curator-provided HTML or a free-form contact value outside role plus HTTPS directory URL.

- [ ] Build Step 4 with the approved fields only. Place the privacy boundary directly above the editor: no PHI, learner information, evaluations, credentials, access codes, private contact details, doses, copied clinical protocols, or direct clinical directives. Make the official HTTPS-link alternative explicit for local protocols/access instructions.

- [ ] Render a sticky student preview beside the editor at desktop widths. At mobile widths, replace the two-column layout with a persistent `Edit` / `Preview` toggle. Do not announce preview changes on each keystroke.

- [ ] Add explicit `Review desktop preview` and `Review mobile preview` actions. Each action renders from a newly validated projected edition and then records its review flag; merely opening Step 4 or resizing does not count. Any later student-visible edit resets both flags.

- [ ] Link the error summary to exact field IDs and move focus to the summary only after an explicit Continue/Preview attempt. Advisory findings name the category and field but do not echo entered text.

- [ ] Run:

  ```bash
  node --test tests/fd-curator-local.test.mjs tests/fd-curator-state.test.mjs tests/fd-edition-contract.test.mjs
  node tests/contrast-check.mjs
  ```

  Expected: limits/risk findings match the shared contract, previews require deliberate review, and contrast passes.

- [ ] Commit:

  ```bash
  git add 13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js 13_Faculty_Resources/Rotation_Curation/rotation-curator.html tests/fd-curator-state.test.mjs tests/fd-curator-local.test.mjs
  git commit -m "feat: add safe local orientation editor"
  ```

---

## Task 13: Add the publication health receipt, immutable link, backup, and local QR

**Files:**

- Create: `13_Faculty_Resources/_automation/site_build/vendor/qrcode-generator-1.4.4.js`
- Create: `13_Faculty_Resources/_automation/site_build/vendor/qrcode-generator-1.4.4.LICENSE`
- Modify: `13_Faculty_Resources/_automation/site_build/common.py`
- Modify: `13_Faculty_Resources/Rotation_Curation/rotation-curator.html`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js`
- Create: `tests/fd-curator-publish.test.mjs`
- Create: `tests/qr-vendor.test.mjs`

**Interfaces:**

- Consumes: a fully valid draft, four checked public-link affirmations, both preview flags, current origin, Web Crypto, and local QR function.
- Produces: health receipt, immutable root-site URL, copy action, JSON backup, conditional inline SVG QR, fingerprint, and core revision.

- [ ] Write failing publication tests for structural/privacy blockers, advisory-only warnings, missing affirmations, incomplete previews, unchanged/changed edition numbering, 1,800-character QR boundary, 16,000-character link boundary, 12 KiB config boundary, backup round-trip, current-origin isolation, and copy/download failure messages.

- [ ] Write `qr-vendor.test.mjs` first. Require version 1.4.4, preserved Kazuhiko Arase copyright/MIT header, local-only use, SHA-256 `18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780` for the exact upstream `qrcode.js`, and no HTTP request or external script in QR generation.

- [ ] Run and confirm failure:

  ```bash
  node --test tests/fd-curator-publish.test.mjs tests/qr-vendor.test.mjs
  ```

- [ ] Vendor the exact `qrcode.js` from npm package `qrcode-generator@1.4.4` (npm tarball integrity `sha512-HM7yY8O2ilqhmULxGMpcHSF1EhJJ9yBj8gvDEuZ6M+KGJ0YY2hKpnXvRD+hZPLrDVck3ExIGhmPtSdcjC+guuw==`). Preserve its header and add the upstream MIT license text in the adjacent license file. Do not minify or modify the vendored body.

- [ ] Register `/*__QR_GENERATOR_1_4_4__*/` to the vendored file and add the marker only to the curator source. The student shell must not carry the QR library.

- [ ] Implement:

  ```javascript
  fdCuratorHealth(draft,configResult,shareResult)
    -> {ok,checks:[{code,label,status:'pass'|'warn'|'fail',blocking}],errors,warnings}
  fdCuratorStudentBaseUrl(locationObject) -> root URL on the same origin
  fdCuratorBuildShare(draft,index,siteContext,subtle,locationObject)
    -> Promise<{ok,envelope,url,fingerprint,qrEligible,bytes,receipt,...}>
  fdCuratorBackupJson(envelope) -> pretty JSON with trailing newline
  fdCuratorQrSvg(url) -> escaped inline SVG
  ```

- [ ] Step 5 must show and require the four approved affirmations verbatim in meaning: public-safe contents; official HTTPS sources for linked local clinical protocols; desktop and mobile previews reviewed; and forwardable/non-revocable account-free link understood. A failed structural/privacy item blocks generation. Advisory workload/usability warnings do not block after affirmations.

- [ ] Construct the student base with `new URL('../', location.href)` from `/tools/rotation-curator.html`, then append `#edition=<payload>`. Never hard-code production origins. This keeps localhost and deploy previews isolated and always targets the root learner shell on the current audience site.

- [ ] Generate an inline QR only when the complete URL length is at most 1,800 characters. Always provide link and backup when the URL is within 16,000 characters. Block publication beyond 16,000 with a reduction prompt. Never call a remote QR/short-link endpoint or request camera permission.

- [ ] Copy with `navigator.clipboard.writeText` and an accessible fallback/error. Download backup via a Blob/object URL, name it `<LOCATION>-<AUDIENCE>-edition-<N>-<fingerprint>.json`, and revoke the object URL after the click. Do not upload the backup.

- [ ] After success, render the receipt checks, full fingerprint, full current core revision, immutable-link warning, and sharing exposure warning. Update the draft base envelope only after link generation succeeds.

- [ ] Run:

  ```bash
  node --test tests/fd-curator-publish.test.mjs tests/qr-vendor.test.mjs
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
  ```

  Expected: publication is enabled only after every blocker/affirmation/preview gate passes; no generated page contains an external QR dependency.

- [ ] Commit:

  ```bash
  git add 13_Faculty_Resources/_automation/site_build/vendor/qrcode-generator-1.4.4.js 13_Faculty_Resources/_automation/site_build/vendor/qrcode-generator-1.4.4.LICENSE 13_Faculty_Resources/_automation/site_build/common.py 13_Faculty_Resources/Rotation_Curation/rotation-curator.html 13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js tests/fd-curator-publish.test.mjs tests/qr-vendor.test.mjs
  git commit -m "feat: publish immutable rotation editions"
  ```

---

## Task 14: Add complete MS3/resident browser journeys and mobile accessibility checks

**Files:**

- Create: `tests/smoke/rotation-edition.spec.js`
- Modify: `tests/smoke/playwright.config.js`
- Modify: `tests/smoke/front-door.spec.js`
- Modify: `tests/smoke/nav-crawl.spec.js`

**Interfaces:**

- Consumes: built MS3/resident sites and the full curator/student workflow.
- Produces: end-to-end evidence for creation, transport, rendering, switching, recovery, keyboard use, local/core separation, and mobile layout.

- [ ] Add `rotation-edition.spec.js` to both `nav-ms3` and `nav-res`. Use only synthetic `Example Unit` / `Training Site` data and official example-domain links. Generate links through the real builder rather than embedding a second test codec.

- [ ] Cover the curator happy path on both audiences: locked site/path/duration, metadata, select/omit/repeat, priority/rationale, keyboard move controls, bounded weeks, local fields/resources, desktop/mobile preview actions, affirmations, receipt, link, fingerprint, backup, and QR-present/QR-omitted boundaries.

- [ ] Open the generated link in a clean page and assert: automatic first acceptance; matching fingerprint; curator/location/dates/version/current revision; non-verified identity copy; setup/Continue before the compact card; selected Path order; omitted item still in Library; local/core labels; external domain disclosure; and local progress isolated under the fingerprint.

- [ ] Add returning/switch cases: same link; changed/newer edition; accept; decline; older edition; and ordinary SPA navigation after the fragment disappears. Assert both fingerprints appear before switching and no link silently replaces the stored edition.

- [ ] Add safe-recovery cases: one-byte digest corruption, malformed base64url, unsupported version, unknown ref, wrong audience/path, invalid week, non-HTTPS resource, and oversized payload. Each must load the normal audience core, show `role="alert"`, avoid user-text echo, preserve a seeded edition/progress/pretest/qbank/unrelated-state snapshot, and never partially show the bad local content.

- [ ] Add keyboard-only checks: traverse all five steps; reorder and move week without drag; open/close edition card; toggle local checklist; use switch dialog; copy/download controls; and restore focus to the invoking control after dialogs/error summaries.

- [ ] At `390x844`, assert no horizontal overflow, at least 44x44 action targets, first-day setup/Continue visible before the compact card, persistent Edit/Preview toggle, card expansion, visible core/local text labels, and no hidden focusable editor controls in Preview mode. Do not add a macOS screenshot baseline; use semantic/layout assertions.

- [ ] Update nav crawl expectations so the hidden curator is accounted for but not shown as a primary learner Library item. Extend the existing Front Door regression to assert the non-edition core experience is unchanged.

- [ ] Run:

  ```bash
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
  bash tests/smoke/start-local-servers.sh
  cd tests/smoke
  npm ci
  npx playwright test rotation-edition.spec.js --project=nav-ms3 --project=nav-res
  npx playwright test front-door.spec.js nav-crawl.spec.js --project=nav-ms3 --project=nav-res
  ```

  Expected: both complete audience journeys and existing front-door/nav regressions pass.

- [ ] Commit:

  ```bash
  git add tests/smoke/rotation-edition.spec.js tests/smoke/playwright.config.js tests/smoke/front-door.spec.js tests/smoke/nav-crawl.spec.js
  git commit -m "test: cover rotation edition journeys"
  ```

---

## Task 15: Run adversarial review, full gates, and prepare the human pilot without claiming release

**Files:**

- Create: `tests/fd-edition-adversarial.test.mjs`
- Create: `docs/pilots/rotation-edition-pilot-protocol.md`
- Modify only if a verified failure requires it: feature source/tests from Tasks 1–14

**Interfaces:**

- Consumes: the complete implementation and approved pilot criteria.
- Produces: adversarial contract evidence, full repository verification, a privacy-safe pilot protocol, and a clean handoff that remains pending human review/deploy approval.

- [ ] Add adversarial tests for prototype pollution keys (`__proto__`, `constructor`, `prototype`), deeply nested/large JSON, duplicate JSON-sensitive fields after parse, Unicode normalization edge cases, invalid UTF-8, base64url padding/alphabet abuse, digest timing-independent comparison behavior, HTML/event/script payloads, data/blob/javascript URLs, direct contact patterns, credential assignments, dose-like strings, and configuration attempting to target Safety Kit/governance fields.

- [ ] Require every adversarial case to terminate within a bounded test timeout, return one stable privacy-safe error code, leave canonical index and storage unchanged, and never execute or render hostile input.

- [ ] Run the adversarial suite:

  ```bash
  node --test tests/fd-edition-adversarial.test.mjs
  ```

- [ ] Run the feature and repository contract suites from a clean generated-output state:

  ```bash
  python3 13_Faculty_Resources/_automation/test_validate_rotation_edition_schema.py
  python3 13_Faculty_Resources/_automation/validate_rotation_edition_schema.py
  python3 13_Faculty_Resources/_automation/validate_curriculum.py
  python3 13_Faculty_Resources/_automation/test_validate_tool_governance.py
  python3 13_Faculty_Resources/_automation/validate_tool_governance.py
  node --test tests/*.test.mjs
  node tests/contrast-check.mjs
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
  cd tests/smoke && npm ci && npx playwright test
  ```

  Expected: all commands exit 0. If an unrelated pre-existing or external failure occurs, record it separately; do not call the feature verified until every feature-specific failure is resolved.

- [ ] Inspect generated artifacts without editing them:

  ```bash
  rg -n 'FD_EDITION_|FD_CURATOR|QR_GENERATOR_1_4_4|__FD_' _build/ms3 _build/res
  rg -n 'https?://.*(qr|short)|localStorage\.(setItem|getItem)\([^\x27\x22]' _build/ms3/tools/rotation-curator.html _build/res/tools/rotation-curator.html
  git diff --check
  git status --short
  ```

  Expected: no unexpanded marker, no QR/short-link network endpoint, no computed/unapproved storage key, no whitespace error, and only intentional source/doc/test changes.

- [ ] Review the diff against every Approved Decision and Non-goal in the spec. Explicitly verify no separate site, core-content copy/edit, expiration, curator verification claim, backend, reporting, upload, cross-audience payload, revocation claim, or deployment action entered scope.

- [ ] Create `docs/pilots/rotation-edition-pilot-protocol.md` with exact roles and gates: two attendings from different settings; at least one MS3 and one resident edition; four trainees; synthetic local details first; task script for creation, mobile first-day comprehension, local/core distinction, fingerprint match, and corrupt-link recovery; severity definitions; and a stop condition of zero open P0/P1 findings before broad release.

- [ ] Mark the pilot document `DRAFT — HUMAN REVIEW AND APPROVAL REQUIRED`. State that technical tests do not verify curator identity, approve local protocols, authorize institutional use, or authorize deployment.

- [ ] Run a final source-only hygiene scan (exclude this implementation plan and vendored upstream code from the marker-word check):

  ```bash
  rg -n 'TODO|TBD|FIXME|XXX|PLACEHOLDER' rotation_edition.schema.json 13_Faculty_Resources/Rotation_Curation 13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_contract.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_project.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_edition_student.js 13_Faculty_Resources/_automation/site_build/frontdoor/fd_curator.js tests/fd-edition-*.test.mjs tests/fd-curator-*.test.mjs tests/smoke/rotation-edition.spec.js docs/pilots/rotation-edition-pilot-protocol.md
  ```

  Expected: no matches.

- [ ] Commit final verification assets:

  ```bash
  git add tests/fd-edition-adversarial.test.mjs docs/pilots/rotation-edition-pilot-protocol.md
  git commit -m "test: harden rotation edition release gate"
  ```

- [ ] Before claiming completion, invoke `superpowers:verification-before-completion`, rerun the commands it requires, and report targeted success separately from any unrelated baseline/connector/hosted failure. Request human clinical/privacy review and explicit merge/deploy direction; do not merge or deploy automatically.

---

## Completion Criteria

- Both built audience sites retain their canonical four-/six-week paths and ship one audience-locked curator route.
- The same strict validator powers creation, import, stored loading, and incoming-link loading.
- Digest/fingerprint behavior is deterministic; the fingerprint is never presented as authorship proof.
- Invalid or mismatched editions produce no partial projection and no learner-state writes.
- Library, Safety Kit, governance, clinical content, and core progress survive every edition operation unchanged.
- The learner sees a compact, accessible edition card, clearly labeled local guidance, visible external domains, and the correct current core revision.
- The curator cannot generate a link until schema/privacy/preview/public-link gates pass.
- QR generation is local, conditional, optional, and pinned; links never depend on a third-party service.
- MS3 and resident browser journeys pass at desktop and 390-pixel mobile widths.
- Governance remains pending and broad release remains blocked on the approved human pilot and separate merge/deploy authorization.
