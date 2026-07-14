# MS3 Anki Deck Redesign

Date: 2026-07-14
Repo: Psychiatry Clerkship Library
Status: Approved for implementation planning

## Plain-language summary

Replace the current prose-scraping Concepts deck with a deliberately authored,
faculty-governed MS3 spaced-repetition system. Every learner-facing card must ask
one clear question, have one defensible answer, identify the exact reviewed source
that supports it, and stop shipping automatically if that source or answer changes.

The recommended learner package contains a concise Core Recall deck and a separate
Clinical Application deck. The full attested question bank remains an optional exam
practice download rather than filling the daily recall queue. Draft, stale,
resident-level, unapproved local-policy, or otherwise unapproved clinical content
never enters an MS3 package.

## Problem statement

The repository contains strong curriculum and question-bank content, but the current
Anki assembly and release process does not reliably convert it into useful or governed
retrieval practice.

Current-state findings that this design addresses:

- The checked-out Concepts package contains 141 notes and 145 scheduled cards. Of the
  notes, 21 use the identical front `In one line?` and 103 use an ordinal prompt such
  as `High-yield pearl #2 (recall):`.
- A newer merged fix converts the 120 pearl notes into curated clozes, but it leaves
  the 21 broad one-line prompts and does not solve source governance, coverage,
  sequencing, migration, or release validation.
- The extractor silently omits 11 reviewed, structured pages because their headings
  use punctuation or heading variants. The omissions include major acute/safety,
  psychopharmacology, formulation, psychotherapy, and medical-workup content.
- Current Concepts coverage contains no cards from the scanned acute/safety pages and
  has no Week or Audience metadata.
- The 168 current qbank cards preserve clinical context, but their long multiple-choice
  fronts and extensive backs are better suited to application practice than daily
  atomic recall.
- `build_anki.sh` stages only `.apkg` files even though the learner page advertises a
  CSV download.
- Anki generation occurs after the site QA gate and is fail-soft. CI does not install
  `genanki`, so a green site build can silently serve an older committed binary.
- Attestation for Concepts is based on finding the phrase `attested by` in Markdown,
  not on reconciling the source path through `13_Faculty_Resources/_automation/site_build/site_manifest.json` and
  `13_Faculty_Resources/reviewed.json`.
- At least one attested qbank item, `qb_pha_002`, retains stale “mandatory” clozapine
  ANC wording while its current reviewed source says monitoring continues per the
  prescribing information after elimination of the clozapine REMS. This item must be
  excluded from active learner clinical content until targeted review and
  re-attestation.

## Goals

- Deliver a balanced six-week MS3 Anki experience optimized first for ward usefulness
  and second for Shelf/COMAT transfer.
- Replace vague or overbroad fronts with atomic, explicit retrieval prompts.
- Keep clinical application separate from core daily recall.
- Sequence cards by the existing six-week curriculum.
- Preserve exact source provenance and card-level faculty review.
- Detect source or qbank drift before it reaches learners.
- Separate routine, high-risk, evidence-sensitive, and local-policy governance.
- Generate and inspect the real Anki packages in CI before site publication.
- Preserve stable card identity after the v2 migration.
- Make learner-facing counts, tags, links, and download claims accurate.

## Non-goals

- Do not rewrite the canonical curriculum pages as part of deck generation.
- Do not treat model recall as clinical evidence.
- Do not include clinical content from draft or retired qbank items.
- Do not include unreviewed communication cases, reasoning cases, or the pending
  longitudinal simulation.
- Do not create a Resident Advanced deck in this milestone.
- Do not ship institution-specific action thresholds without explicit local-policy
  review.
- Do not reproduce or closely paraphrase NBME, NBOME/COMAT, USMLE, or commercial-bank
  items.
- Do not make generated `.apkg`, CSV, JSON receipt, or HTML review output the
  curriculum source of truth.
- Do not silently fall back to an older deck when current generation or validation
  fails.

## Approved architecture

### 1. MS3 Core Recall

Target: 144 cards.

Purpose: efficient daily retrieval of the knowledge and supervised actions an MS3
should be able to produce on the wards.

Card families:

- `Discriminator` — distinguish diagnoses, mimics, or syndromes.
- `StudentAction` — map a finding or situation to the appropriate supervised next
  action.
- `Escalation` — red flag to immediate notification or safety response.
- `Monitor` — medication or intervention to monitoring awareness or adverse-effect
  recognition.
- `WordsToSay` — situation to an exact, usable first sentence.
- `TherapyMatch` — mechanism or presentation to a brief intervention.
- `Disposition` — barrier or uncertainty to a concrete verification or handoff step.

Initial Week allocation:

| Week | Focus | Core cards |
|---|---|---:|
| 1 | Foundations, interview, MSE, capacity, immediate safety | 28 |
| 2 | Mood, psychosis, pharmacology, catatonia recognition | 30 |
| 3 | Psychotherapy, personality, formulation, safety planning | 22 |
| 4 | Family, systems, collateral, expressed emotion | 18 |
| 5 | Acute psychiatry, delirium, withdrawal, agitation, violence | 28 |
| 6 | Integration, disposition, handoff, exam readiness | 18 |
| **Total** |  | **144** |

Initial Domain allocation:

| Domain | Core cards |
|---|---:|
| Diagnosis | 24 |
| Psychopharmacology | 22 |
| Safety and emergency | 30 |
| Communication | 24 |
| Psychotherapy and formulation | 20 |
| Disposition and handoff | 24 |
| **Total** | **144** |

The enforceable Week-by-Domain crosswalk is:

| Week | Diagnosis | Psychopharm | Safety | Communication | Psychotherapy | Disposition | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 5 | 1 | 7 | 8 | 2 | 5 | 28 |
| 2 | 8 | 10 | 5 | 2 | 2 | 3 | 30 |
| 3 | 4 | 2 | 4 | 3 | 8 | 1 | 22 |
| 4 | 1 | 1 | 2 | 7 | 5 | 2 | 18 |
| 5 | 5 | 7 | 10 | 3 | 1 | 2 | 28 |
| 6 | 1 | 1 | 2 | 1 | 2 | 11 | 18 |
| **Total** | **24** | **22** | **30** | **24** | **20** | **24** | **144** |

The Week, Domain, and Week-by-Domain matrices are release contracts. A card may
satisfy one Week and one primary Domain; secondary tags do not change the quota.

### 2. MS3 Clinical Application

Target: 48 cards.

Purpose: test whether learners can use Core knowledge in a short patient context.

- Each Application card originates from an eligible attested qbank item.
- The front uses the reviewed patient facts and focused lead-in but hides the answer
  choices.
- The back gives the best answer, decisive discriminator, and one major named trap.
- The full distractor analysis remains available as collapsed secondary detail.
- The recommended learner workflow introduces each Application card only after its
  related Core work. Week tags and release instructions support this sequence, but
  Anki scheduling remains learner-configurable and cannot enforce it after import.
- The 48-card selection is balanced across the six-week curriculum and must include
  diagnosis, next-step, safety, pharmacology, psychosocial, and disposition tasks.
- Selection is faculty-curated; the qbank `hy` flag is an input, not the sole inclusion
  rule.

Initial Week allocation:

| Week | Application cards |
|---|---:|
| 1 | 8 |
| 2 | 10 |
| 3 | 8 |
| 4 | 6 |
| 5 | 10 |
| 6 | 6 |
| **Total** | **48** |

The enforceable Week-by-task-bundle crosswalk is:

| Week | Diagnosis | Next step | Safety | Pharmacology | Psychosocial | Disposition | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 2 | 1 | 2 | 0 | 2 | 1 | 8 |
| 2 | 4 | 1 | 1 | 3 | 1 | 0 | 10 |
| 3 | 2 | 1 | 1 | 1 | 2 | 1 | 8 |
| 4 | 1 | 1 | 0 | 0 | 2 | 2 | 6 |
| 5 | 2 | 2 | 3 | 2 | 0 | 1 | 10 |
| 6 | 1 | 2 | 1 | 2 | 0 | 0 | 6 |
| **Total** | **12** | **8** | **8** | **8** | **7** | **5** | **48** |

`Psychosocial` covers communication and psychotherapy transfer; `Disposition` covers
handoff. These cells, not a vague claim of balance, define the Application release
contract.

### 3. Full Question Bank

The full qbank package remains a separate optional download.

- Its active clinical content includes only currently eligible attested, non-retired
  items.
- It also carries neutral withdrawal updates for any stable ID that shipped previously
  and later became quarantined or retired. These updates preserve the GUID but remove
  the old clinical prompt and answer.
- It preserves the existing stable qbank item identities and review history.
- It is labeled as exam/application practice, not as the recommended daily Core deck.
- Any item quarantined by the card safety chain is omitted from active clinical
  content even if its item-level status still says `attested`.
- A corrected and re-attested quarantined item returns under the same GUID only after
  its card-context review and all gates pass. A retired ID never reactivates.
- Tier-two cards retain a visible source, evidence anchor, and mechanism label.

### 4. Resident boundary

The MS3 package contains only `Audience::MS3` cards. The resident site must not reuse
or relabel this package as a resident curriculum. A future Resident Advanced deck may
compile from the same specification only after resident-specific action thresholds,
dosing, and management expectations receive their own design and governance review.

## Canonical card specification

The v2 card specification is the learner-facing deck’s source of truth. Generated
packages and review pages derive from it.

Each Core or Application v2 record contains these common fields:

| Field | Contract |
|---|---|
| `id` | Permanent unique identity such as `ms3_w01_safety_001`; never reused |
| `state` | `draft`, `approved`, `quarantined`, or `retired` |
| `kind` | `basic`, `cloze`, or `application` |
| `family` | One approved card family compatible with `kind` |
| `audience` | Exactly `MS3` for this release |
| `week` | Integer 1–6 |
| `domain` | One primary approved Domain |
| `task` | `Recognize`, `Discriminate`, `Ask`, `Say`, `Escalate`, `Monitor`, or `Handoff` |
| `risk.level` | `Routine` or `High` |
| `risk.facets` | Zero or more of `Medication`, `Emergency`, `Pregnancy`, `Legal`, `Regulatory`, `Numerical`, `EvidenceSensitive`, or `LocalPolicy` |
| `front` | Explicit learner prompt satisfying the card standard |
| `answer` | Direct answer shown first on the back |
| `explanation` | At most two sentences explaining the discriminator or reason |
| `caveat` | Supervision, evidence, or local-policy boundary when required |
| `source.path` | Canonical repo-relative source path |
| `source.slug` | Deployed slug resolved through `13_Faculty_Resources/_automation/site_build/site_manifest.json` |
| `source.anchor` | Stable section heading or fragment containing the supporting passage |
| `source.url` | Absolute URL derived from the configured canonical MS3 learner-site base URL plus the deployed slug and anchor; never a local machine path |
| `source.quote` | Exact normalized reviewed source passage supporting the card |
| `source.quoteSha256` | Hash of the normalized source passage at approval |
| `render.templateVersion` | Permanent version identifier for the rendered note contract |
| `render.templateContractSha256` | Hash of the exact model, deck, ordered fields, template, qfmt/afmt, CSS, and template version used for the reviewed render |
| `provenance.authoringMethod` | `human` or `ai_assisted` |
| `provenance.authoringTool` | Tool/model and version when AI-assisted; otherwise `null` |
| `provenance.humanEditor` | Named human editor responsible for the proposed card |
| `provenance.humanEditedAt` | ISO date of the human edit |
| `review.cardApprovedBy` | Named faculty card approver, distinct from source attestation |
| `review.cardApprovedAt` | ISO date of card-context approval |
| `review.approvedCardSha256` | Hash of the exact rendered card and governed metadata that the faculty approver reviewed |
| `review.evidenceCitation` | Reviewed evidence citation, URL, identifier, and version/date; required for `High` |
| `review.evidenceRecord` | Repo-relative reviewed evidence record and anchor; required for `High` |
| `review.evidenceSha256` | Hash of the reviewed evidence excerpt or versioned evidence record; required for `High` |
| `review.evidenceReviewedBy` | Named evidence reviewer; required for `High` |
| `review.evidenceReviewedAt` | Required for `High` |
| `review.localPolicySource` | Named policy document, owner, and version; required when `LocalPolicy` is present |
| `review.localPolicySha256` | Hash of the reviewed policy passage or versioned record; required when `LocalPolicy` is present |
| `review.localPolicyReviewedBy` | Named policy owner; required when `LocalPolicy` is present |
| `review.localPolicyReviewedAt` | Required when `LocalPolicy` is present |
| `review.reviewDue` | Required for every `High` card and every card with `LocalPolicy` |
| `review.sequenceBasis` | `weekly_map` or `faculty_override` for Core/Application records |
| `review.sequenceRationale` | Required when `sequenceBasis` is `faculty_override` |
| `review.sequenceReviewedBy` | Named faculty reviewer; required for a sequencing override |
| `review.sequenceReviewedAt` | Required for a sequencing override |
| `reinforces` | Optional stable ID for an intentional reinforcement relationship |
| `supersedes` | Optional retired stable ID replaced by this new concept; never reactivates the old ID |

Core records fix `kind` to `basic` or `cloze` and use one of the seven Core families.
`state` may become `approved` only after the reviewer has seen and approved the actual
rendered front/back pair. Metadata-only or source-page review is not card approval.
`review.approvedCardSha256` is SHA-256 over canonical JSON containing the rendered
front, rendered back, sorted tags, `id`, `kind`, `family`, Week, Domain, task, risk
object, source object, qbank object when present, `review.sequenceBasis`,
`review.sequenceRationale`, `review.sequenceReviewedBy`,
`review.sequenceReviewedAt`, `reinforces`, `supersedes`, `render.templateVersion`, and
`render.templateContractSha256`. Inapplicable sequence-override values project as
explicit nulls, as do absent relationship fields. Any change to one of those inputs
invalidates the approval hash and quarantines the card until the new render is
explicitly approved.

`render.templateContractSha256` is SHA-256 over the UTF-8 bytes of canonical JSON
with lexicographically sorted object keys, no insignificant whitespace, preserved
array order, and these exact values from the actual generated note contract: model
ID/name; deck ID/name; the ordered array of field ID/name pairs; template
ID/name/ordinal; qfmt; afmt; CSS; and `render.templateVersion`. qfmt, afmt, and CSS
are hashed byte-for-byte without whitespace or newline normalization. Generation and
package inspection independently recompute this projection; the configured value,
packaged value, and every approved-card payload must agree.

Each Application record shares the common fields above, fixes `kind` to `application`
and `family` to `ApplicationVignette`, and adds:

| Field | Contract |
|---|---|
| `qbank.id` | Stable source qbank ID |
| `qbank.taskBundle` | Exactly one of `Diagnosis`, `NextStep`, `Safety`, `Pharmacology`, `Psychosocial`, or `Disposition` |
| `qbank.primaryPage` | Reviewed page nominated as the authority for the decisive answer |
| `qbank.primaryAnchor` | Exact reviewed anchor supporting the decisive answer |
| `qbank.approvedItemSha256` | Hash over the canonical learner-visible qbank fields at approval |
| `qbank.primaryTrap` | One named misconception displayed on the back and tagged |
| `qbank.sourceAnchorSha256` | Hash of the reviewed source anchor used by the qbank item |

For Application records, `reinforces` is required and must resolve to a live,
approved Core ID whose Week is no later than the Application Week. The common source
and qbank source must name the same authority: `source.slug` equals
`qbank.primaryPage`, `source.anchor` equals `qbank.primaryAnchor`, and that slug
resolves to exactly one Markdown source path in `13_Faculty_Resources/_automation/site_build/site_manifest.json`.

For Core/Application sequencing, a source first introduced in the six-week reading
map may be used in that Week or a later Week. When an otherwise eligible primary
source is absent from the reading map, the card requires a named faculty sequencing
override and rationale in its own review object; those fields enter the exact card
approval hash. Full-qbank notes have no Week contract and are exempt from this
sequencing rule.

Anki GUIDs derive only from the stable v2 card ID plus a fixed model namespace. They
do not derive from wording. Changing copy therefore updates the existing card after
approval; it does not create a duplicate. Retired IDs remain as permanent tombstones.
New Core and Application records use distinct fixed v2 GUID namespaces. The full
qbank is the exception: it freezes the exact legacy identities already in learner
collections—model ID `1607392901` (`PCL Vignette (Moss)`), deck ID `2059400191`
(`Psychiatry Clerkship Library (Moss)`), template `Card 1`, field order `UID`,
`Question`, `Options`, `Answer`, `Why`, `Pearl`, `Evidence`, `Link`, `Meta`,
`genanki.guid_for(item_id)` for base notes, and
`genanki.guid_for(item_id + "::t2")` for Tier 2 notes. Changing those would mint new
notes and break the promised review-history continuity. Model, template, and field
IDs are fixed after first release because Anki cannot reliably update an existing
note when its note type identity changes.

The frozen legacy qbank model intentionally has no serialized per-field or
per-template `id` keys, and generation must not add them. Its template-contract
projection therefore uses explicit `null` sentinels for those absent IDs while still
binding the model/deck IDs and names, the nine ordered field names, template name
`Card 1` and ordinal `0`, exact qfmt/afmt/CSS bytes, and template version. An
unexpected newly present legacy field/template ID is contract drift. In contrast,
the v2 Core/Application field and template IDs are explicit serialized keys in the
Anki model JSON and must match their fixed values.

For each shipped Core/Application v2 ID, `kind`, model ID, note-type identity,
template/card ordinal, field identities, and field order are immutable. A Basic-to-
Cloze, Cloze-to-Basic, or other note-type change retires the old ID and creates a new
ID with `supersedes`; reapproval under the old ID is not sufficient.

The source qbank remains canonical for full-qbank clinical content, but item
attestation alone is not rendered-card approval. A committed qbank-render approval
registry stores base and Tier 2 note identities, approved item hash, template version,
template-contract hash using the legacy null-ID projection, exact rendered-card hash,
risk object, required evidence/policy review references, faculty approver, and
approval date. Every active full-qbank note must match that registry; the first
governed release requires review of each actual rendered note, and any mismatch
quarantines only the affected note.

Risk level and governance facets are orthogonal so that a card can be both high-risk
and institution-specific:

- `Routine`: none of the High-risk triggers below apply.
- `High`: any medication, emergency, pregnancy, legal/regulatory, numerical threshold,
  or `EvidenceSensitive` claim; card-context and current evidence review are required.
- `LocalPolicy` is a facet, not an alternative risk level. It always requires named
  local-policy review. If the local-policy card also contains a High-risk claim, both
  evidence and policy review requirements apply.

A required review is current only when its named source/version and hash still match
and the candidate release date is on or before `review.reviewDue`. A missing, changed,
or expired requirement quarantines the card.

## Source hierarchy and eligibility

### Core Recall sources

A source is eligible only when all of these are true:

1. The source path is registered in `13_Faculty_Resources/_automation/site_build/site_manifest.json`.
2. Its deployed slug is marked `reviewed` in `13_Faculty_Resources/reviewed.json`.
3. The source has no learner-facing pending-review banner that conflicts with the
   registry.
4. The card stores an exact supporting passage that occurs once within its declared
   source anchor.
5. The source passage hash still matches the approved value.
6. The claim is not blocked by an open evidence, surveillance, or local-policy review.
7. The actual card front/back pair has card-context faculty approval.

Highest-value sources include reviewed topic pages, acute/safety pages, MS3 pocket
guides, formulation and collateral workflows, brief psychotherapy, family/discharge
material, medication monitoring, reviewed OSCEs, and reviewed synthetic cases.

Reviewed cases and OSCEs may supply transfer context and critical-fail behavior, but
they do not become primary authorities for new treatment claims.

The six-week curriculum supplies sequencing and Week tags only. Rapid Review supplies
an index of candidate concepts only; thresholds and treatment claims must resolve to
their primary reviewed page.

Source normalization is deterministic: normalize Unicode to NFC, convert line endings
to LF, collapse every whitespace run to one ASCII space, and trim leading and trailing
whitespace. Hash the UTF-8 bytes of that result. The source link is resolved from a
configured canonical MS3 learner-site base URL plus `source.slug` and
`source.anchor`; filesystem paths and build-preview hosts are invalid release links.

### Application and full-qbank sources

A qbank item is eligible for either output only when:

1. `status` is `attested`.
2. `retired` is not true.
3. Every required qbank structural rule passes.
4. The Application record or qbank-render registry nominates a `primaryPage` that
   resolves to a currently reviewed source.
5. Its nominated `primaryAnchor` is present in that page and directly supports the
   decisive answer.
6. The approved item hash matches.
7. The item is not quarantined by a targeted evidence or card-context review.
8. Every material learner-facing claim resolves to a reviewed source; any secondary
   reference that is not authoritative is labeled as context rather than support.

The approved item hash is SHA-256 over canonical JSON with lexicographically
sorted object keys and preserved array order. It includes `id`, `status`, `retired`,
`stem`, `options`, `why`, `pearl`, `evidence`, `pages`, `link`, `tier2`, `category`,
`difficulty`, `competency`, `type`, and `hy`; option data includes answer text,
correctness flags, and trap or mechanism annotations when present. The qbank
source-anchor hash uses the same source normalization rule as Core cards.

The 24-item Shelf/COMAT pilot remains excluded while its items are `draft`. Its richer
schema may inform future metadata, but draft pilot content is not a learner source.

## Canonical governance registries

The implementation creates four reviewed, committed inputs under
`13_Faculty_Resources/anki/`:

- `cards.json`: the Core/Application v2 specification;
- `qbank_render_reviews.json`: base and Tier 2 full-qbank rendered-card approvals;
- `quarantine.json`: accepted quarantine decisions and owners;
- `release_history.json`: the append-only record of every note identity that actually
  shipped.

`release_history.json` is how the build knows whether a missing, quarantined, or
retired identity needs a withdrawal update. It separates one immutable identity
contract per namespace/canonical ID/base-or-Tier-2 key (GUID and
model/deck/template/field identities) from append-only per-release membership
snapshots. Membership records carry active/withdrawn state, artifact, approved/render
hashes, release identifier/date, and a governed-input digest covering the exact
registries, sources, qbank, reviews, templates, generator/staging code, dependency
lock, and learner page used for the candidate. This lets a same-GUID copy update append
a new approved/render hash without mutating or duplicating the identity contract.
Entries may be appended but never edited or deleted. The digest excludes
`release_history.json` to avoid a circular hash; the base-branch comparison protects
prior history and the candidate-match check protects the new append. Release
recomputes both the digest and packages. This remains valid across squash/rebase merges
when bytes are unchanged but fails on any governed byte drift. Site staging still
copies only the six artifacts.

The one-time bootstrap from the 2026-07-12 legacy qbank package must not invent a
card approval that did not exist. Those identity contracts use
`origin: legacy_pre_governance`; their first release memberships set
`approvedCardSha256` to `null` and record a `shippedCardSha256` computed from the
actual packaged note. Every governed release after that bootstrap requires the
ordinary non-null approval hash in its membership snapshot.
The bootstrap also inspects the legacy `ALL` package because the same qbank GUIDs
shipped there under a combined-only historical deck ID. A bootstrap membership may
record multiple historical artifact/deck locations for the same GUID; the governed qbank
identity remains the frozen standalone deck contract, and migration tests must prove
that a same-GUID withdrawal updates collections seeded from either legacy package.

## Card standard

### Front

- One explicit question or one short clinical decision.
- Core v2 front: no more than 35 words.
- Application v2 front: no more than 90 words.
- No `In one line?`, ordinal recall labels, `Which statement is true?`, negative
  lead-ins, or other underspecified prompts.
- No visible topic label when it would reveal the answer.
- No answer choices on Application fronts.
- A cloze card has exactly one scheduled deletion and enough visible context for one
  unique answer.
- Do not hide the entire conclusion or an unbounded list.

### Back

1. Direct answer first, no more than 45 words.
2. Explanation limited to two sentences and 60 words.
3. Required supervision, evidence, regulatory, or local-policy caveat.
4. Collapsed exact source passage and working absolute learner-site link.
5. Optional collapsed qbank distractor detail on Application cards.

### Duplicate and reinforcement rule

Compare the front and direct-answer fields independently. Normalize each to Unicode
NFKC, case-fold, remove HTML/Markdown markup and non-alphanumeric punctuation, and
collapse whitespace. Exact normalized equality is a hard duplicate. Otherwise,
token-set Jaccard similarity at or above `0.80` is a faculty-review quarantine. The
same threshold applies independently to fronts and answers. A duplicate may proceed
only when `reinforces` points to the exact live approved card being deliberately
reinforced and the relationship remains inside the card approval hash; unrelated or
self-referential links do not waive the finding.

The back does not repeat the full stem or show an undifferentiated wall of every
distractor explanation.

These word limits govern Core and Application v2. The optional full-qbank package
follows the separately governed qbank item standard and may retain choices and longer
case material; it is not counted as a daily-recall deck.

### Representative approved patterns

| Family | Front | Direct answer |
|---|---|---|
| Discriminator | Before the team starts an antidepressant for depression, what prior episode should an MS3 ask about? | Past mania or hypomania. |
| Escalation | A postoperative patient is quiet, fluctuates within one shift, and cannot recite months backward. What is the leading diagnosis? | Hypoactive delirium. Acute fluctuation plus inattention is the discriminator; escalate and assess medical causes. |
| WordsToSay | How can an MS3 ask permission to obtain collateral? | “Would it be okay if we spoke with someone who knows you well? It helps us understand what changed and how to support you after discharge.” |
| TherapyMatch | A withdrawn, inactive, anhedonic patient is behaviorally shut down. Which brief intervention fits? | Behavioral activation—schedule one small, valued activity. |
| Disposition | What question verifies that outpatient follow-up is real? | Who is seeing the patient, and when? |

## Source-to-card workflow

```text
Reviewed deployed pages -----+
                              |
Attested eligible qbank ------+--> canonical card specification
                              |           |
Six-week sequencing ----------+           +--> schema + quality validation
                                          +--> source/hash reconciliation
                                          +--> governance review
                                                |
                           +--------------------+--------------------+
                           |                                         |
                        eligible                                 quarantined
                           |                                         |
                    active candidates                  +-------------+-------------+
                           |                            |                           |
                           |                  new/unreviewed/unshipped     accepted + shipped +
                           |                            |                  exact withdrawal review
                           |                   exclude/report/block                |
                           |                                                neutral withdrawal
                           +-------------------------------------------------------+
                                                    |
                                             build candidates
                                                    |
                                             inspect + migrate
                                                    |
                                             review history append
                                                    |
                                             rebuild + gates 1-8
                                                    |
                                             atomic stage (gate 9)
                                                    |
                                             site/receipt gates 10-11
```

Workflow steps:

1. Load the canonical card specification, qbank-render approvals, append-only release
   history, site manifest, review registry, qbank, six-week map, and accepted
   quarantine ledger.
2. Validate the card schema and educational card contract.
3. Resolve every source path to a deployed slug and reviewed registry entry.
4. Normalize and locate the exact source passage; compare its hash.
5. For Application and full-qbank cards, hash and compare the approved qbank item
   fields and supporting source anchor.
6. Apply risk, evidence, local-policy, and card-review requirements.
7. Compute Week and Domain coverage and duplication reports.
8. Separate eligible, newly quarantined, accepted-quarantined, and retired records.
9. Generate a human-readable faculty preview and machine-readable release manifest.
10. Build candidates in a temporary directory using a pinned Anki-generation
    environment.
11. Inspect the SQLite collection inside each `.apkg` and run a two-release import
    migration fixture through the pinned supported Anki importer.
12. Generate, review, and apply the append-only identity/release-history proposal.
13. Rebuild in release mode, recompute the governed-input digest, re-inspect/migrate,
    and require exact canonical package/history agreement.
14. Require release gates 1-8 to pass, then stage only the explicit production
    allowlist atomically as gate 9.
15. Run MS3 and resident build/download smoke checks and receipt verification as gates
    10-11, then publish only when all eleven pass.

## Quarantine policy

A release candidate is quarantined when any of these conditions is true:

- source path, deployed slug, review record, source anchor, or exact source passage is
  missing or ambiguous;
- source passage hash changed;
- qbank approved-item or source-anchor hash changed;
- qbank status is no longer attested or the item is retired;
- an evidence-sensitive or time-sensitive review is missing or overdue;
- a local-policy claim lacks explicit local-policy review;
- the card front is vague, answer-leaking, duplicated without `reinforces`, or outside
  MS3 scope;
- the answer exceeds the card contract;
- the cloze target is missing, ambiguous, overlapping, or creates more than one
  scheduled deletion;
- the stable ID collides with another live or retired identity;
- a required source link is not absolute and reachable within the built site.

Quarantine behavior:

- A newly quarantined card that has never shipped appears in no learner package or
  CSV.
- A withdrawal is not authorized mechanically. The named accepted quarantine or
  retirement decision must include disposition `withdraw`, reason, affected release,
  reviewer/date, frozen withdrawal-template version, and approval hash for the exact
  neutral rendered notice shown in the faculty clinic. Changing that render requires a
  new review. The release membership stores that non-null approved render hash.
- If a stable Core v2, Application, or qbank ID shipped previously, the next package
  includes a neutral withdrawal update under the same GUID. Its clinical front/back
  are replaced by a withdrawal notice, it is tagged `Status::withdrawn`, it is
  excluded from active counts and CSV, and the release receipt records it separately.
- Withdrawal updates must contain none of the superseded clinical prompt, answer,
  rationale, or distractor text. They can neutralize stale content only after a
  successful learner re-import; they are not a remote revocation mechanism.
- The supported safety-update path is desktop Anki 23.10 or later. Release instructions
  require learners to re-import the current package and choose unconditional update
  of existing notes for a withdrawal. The package retains the same note type, model,
  template, field, and GUID identities needed for an in-place update.
- Every safety withdrawal also produces a prominent download-page alert and release
  notice naming the stable UID, affected release, reason, and manual remediation. A
  learner who cannot complete the supported update must search that UID and suspend
  or delete the card manually; locally edited/newer copies are assumed unsafe until
  this is confirmed.
- No generic Basic card or old committed binary substitutes for it.
- Every quarantine entry records stable card ID, reason code, source, first-seen
  commit, review owner, and disposition.
- Accepted quarantines may remain excluded without blocking release when they are in
  the reviewed quarantine ledger and do not break a required coverage quota.
- Any new or changed quarantine fails CI until reviewed and recorded.
- Any quarantine that breaks a Week or Domain quota fails release.
- Retired cards remain tombstones and never return through automatic extraction or
  re-attestation. A materially new replacement receives a new ID and may point to the
  retired ID with `supersedes`.
- The initial quarantine proposal includes `qb_pha_002`; exclusion/withdrawal remains
  blocked until a named faculty reviewer records an accepted disposition. Once
  accepted, its stale mandatory-ANC wording remains excluded until corrected and
  re-attested; because it shipped previously, the candidate qbank package must
  neutralize it with a withdrawal update. `qb_pha_011` is not
  quarantined because its current wording already reflects post-REMS monitoring per
  prescribing information.

## Generated artifacts

Production release artifacts:

- `psychiatry_clerkship_ms3_core.apkg`
- `psychiatry_clerkship_ms3_application.apkg`
- `psychiatry_clerkship_ms3_complete.apkg`
- `psychiatry_clerkship_qbank.apkg`
- `psychiatry_clerkship_ms3_cards.csv`
- `anki_release_receipt.json`

These are the six named release artifacts. The four `.apkg` files are the supported
learner import path. The CSV is labeled faculty audit/interchange only, not a supported
learner import or update path. CSV rows and headline card counts include approved
active cards only. The receipt reports active cards and withdrawal updates as separate
totals.

`psychiatry_clerkship_ms3_complete.apkg` is exactly Core union Application; it never
contains the full qbank. Core and Application keep the same permanent deck IDs, deck
names, note identities, and model identities in their standalone and Complete
packages. Complete does not mint complete-specific copies, so importing a standalone
package before or after Complete updates the same notes in place.

Internal review artifacts:

- full candidate-card JSON inventory;
- faculty-readable HTML review sheet;
- quarantine report;
- duplicate/reinforcement report;
- legacy GUID map;
- coverage report by Week, Domain, task, source, and risk.

Internal review artifacts are generated and non-canonical. Approval decisions are
recorded in the canonical card specification and governance fields.

## Testing strategy

### 1. Card contract tests

- Required fields and enumerations validate.
- Stable IDs are unique across live and retired records.
- Every Core/Application v2 card has exactly one audience, Week, primary Domain,
  family, and task.
- Core and Application v2 front and back word limits pass.
- Generic, ordinal-only, negative, and answer-leaking prompts fail.
- Raw Markdown artifacts do not render.
- Each cloze note creates exactly one scheduled card.
- Required links are absolute and safe.

### 2. Governance and provenance tests

- Source path resolves through `13_Faculty_Resources/_automation/site_build/site_manifest.json`.
- Source slug is currently `reviewed` in `13_Faculty_Resources/reviewed.json`.
- Source anchor resolves, the normalized source passage occurs exactly once within it,
  and its hash matches.
- Application item is attested, non-retired, structurally valid, and hash-matched.
- Recomputed rendered-card hashes match the exact faculty-approved hashes; changing
  any governed input without reapproval fails.
- Changing `reinforces`, `supersedes`, or any sequence-review field without
  reapproval changes the approval hash and fails.
- Every active base and Tier 2 full-qbank note matches its render-approval registry.
- High-risk cards carry the required evidence source/version, reviewed repo record,
  evidence hash, named reviewer, review date, and unexpired due date.
- Cards with the `LocalPolicy` facet carry the required named policy source/version,
  policy hash, owner approval, approval date, and unexpired due date.
- Authoring method/tool, human editor, card approver, evidence reviewer, and policy
  owner remain distinct provenance roles where applicable.
- Prior release-history entries are unchanged, and every withdrawal GUID is proven to
  have shipped by an append-only history entry; base and Tier 2 notes are tracked
  separately.
- Draft, pending, retired, stale, and quarantined clinical content never reaches
  learner output; a permitted withdrawal update contains only neutral maintenance
  text under a previously shipped stable GUID.

### 3. Educational quality and coverage tests

- Core totals exactly 144 cards and Application totals exactly 48 cards for v2 launch.
- Core Week, Domain, and Week-by-Domain cells match the approved tables; Application
  Week, task-bundle, and Week-by-task cells match theirs.
- Every required Core family and task is represented.
- Week 1 and Week 5 include explicit recognition-and-escalation coverage.
- MS3 correct answers never independently prescribe, discharge, clear, restrain,
  determine legal disposition, or titrate beyond the approved student role.
- Exact and near-duplicate fronts/answers fail unless `reinforces` documents the
  deliberate relationship.
- Front and answer duplicate tests independently cover normalized exact equality,
  Jaccard values immediately below and at `0.80`, and valid/invalid `reinforces`
  links.
- Application cards do not expose choices on the front.
- Named traps are present only when grounded in the attested qbank item.
- Every Application card maps to related Core work and carries the Week tag used by
  the recommended sequencing instructions.

### 4. Generator and identity tests

- Stable GUIDs derive from stable v2 IDs, not wording.
- Copy changes update an approved existing card rather than creating a duplicate.
- Retired IDs cannot be reused.
- Core and Application v2 GUID namespaces do not collide with each other or with the
  frozen legacy qbank GUIDs.
- The full qbank preserves model ID `1607392901`, deck ID `2059400191`, legacy model,
  template and field identities, and both legacy GUID formulas exactly.
- Model, template, and field IDs remain stable across releases.
- Release history rejects any per-ID reassignment of `kind`, model, note type,
  template/card ordinal, field identity, or field order; a format change must use a
  new `supersedes` ID.
- Core and Application build as separate decks and as the intended combined package.
- Tier-two cards retain source, evidence, type, and mechanism metadata.
- Generation is deterministic at the canonical note-content level even when archive
  timestamps differ.

### 5. Package inspection tests

Open each generated `.apkg` and verify:

- expected note and scheduled-card counts;
- expected deck and model IDs;
- unique note GUIDs;
- non-empty fronts and backs;
- valid cloze expansion;
- required tags and fields;
- no active draft, retired, stale, or quarantined clinical records;
- every permitted withdrawal update uses a previously shipped GUID, carries
  `Status::withdrawn`, contains no superseded clinical text, and is absent from active
  counts and CSV;
- a seeded legacy qbank package and a seeded prior v2 package both update in place;
- importing release N, making the stale note locally newer, and then importing release
  N+1 with unconditional existing-note updates replaces changed or withdrawn content
  without resetting learner scheduling;
- combined package equals the union of its approved standalone decks;
- release receipt fingerprints match the packaged note content.
- the actual packaged model/deck/ordered-field/template/qfmt/afmt/CSS projection
  recomputes to `render.templateContractSha256` and the approved-card payload;
- independently tampering in SQLite with a model/deck name, field ID/name/order,
  template ID/name/ordinal/qfmt/afmt, or CSS changes the contract hash and package
  fingerprint and invalidates the approval.
- for the legacy qbank, absent field/template IDs recompute as explicit `null`
  sentinels; adding an ID, changing any ordered field/template name or ordinal, or
  changing qfmt/afmt/CSS invalidates its template-contract hash and qbank-render
  approval without changing the frozen model to add IDs.

### 6. Site and download tests

- Generate Anki artifacts before the site’s final static QA step.
- Stage only the six named release artifacts.
- Build both MS3 and resident sites.
- Confirm every advertised MS3 download returns HTTP 200 and non-empty content.
- Confirm the CSV and release receipt are present.
- Confirm no `_with_drafts`, quarantine, review, or unexpected `.apkg` file is staged.
- Confirm the resident site does not present the MS3 package as resident-level content.
- Confirm the learner page states that updates are not automatic, documents the
  supported desktop Anki 23.10 minimum, unconditional existing-note update setting,
  manual UID-removal fallback, and withdrawal notices.
- Confirm any active safety withdrawal produces the required prominent site alert.
- Confirm CSV is labeled audit/interchange-only and is not presented as a safe learner
  update path.
- Confirm learner-facing documentation reports actual generated note/card counts and
  truthful AI-drafted-plus-faculty-attested provenance.

## Release gates

A learner release proceeds only when all gates pass:

1. **Specification gate:** every selected Core/Application card validates against the
   canonical schema and card contract; every active full-qbank note validates against
   the qbank schema and render-approval registry.
2. **Clinical governance gate:** every exact active rendered card has a matching
   card-context approval hash, every withdrawal maintenance note has the matching
   named withdrawal-review hash, and all required evidence/local-policy reviews are
   current.
3. **Quarantine gate:** there are no unreviewed new or changed quarantines.
4. **Coverage gate:** v2 totals and every approved Week, Domain, task-bundle, and
   crosswalk cell pass.
5. **Generation gate:** the pinned Anki environment rebuilds all artifacts in a clean
   temporary directory.
6. **Package gate:** inspection of the actual SQLite collections passes.
7. **Update gate:** seeded prior-release and locally newer notes update under the
   supported unconditional-update path while preserving scheduling.
8. **History gate:** prior release-history entries are immutable, proposed entries
   match the candidate, and every withdrawal identity is proven to have shipped.
9. **Staging gate:** only the explicit production allowlist is copied atomically.
10. **Site gate:** MS3 and resident builds, download smoke checks, CSV labeling, and
   required withdrawal alerts pass.
11. **Receipt gate:** staged package fingerprints, counts, governed-input digest,
   inputs, and quarantine summary match the release receipt.

The build fails closed. A failed deck build prevents a new site deployment, leaving
the previously valid deployed site intact. It never publishes an older binary under a
new site build.

## Migration from the legacy deck

### Question Bank

Existing qbank note identities remain stable. Eligible items retain learner review
history. A previously shipped item that becomes quarantined or retired receives the
neutral same-GUID withdrawal update described above; an unshipped ineligible item is
simply excluded. Only a corrected quarantined item may reactivate the same GUID after
review; a retired item never reactivates.

Learners must download and re-import an updated package for any change to reach their
collection; deleting a note from a later `.apkg` does not delete an earlier local copy.
This follows the official [Anki packaged-deck update
behavior](https://docs.ankiweb.net/importing/packaged-decks.html).

### CSV boundary

The CSV is not a supported learner migration path because CSV-imported notes may not
share the packaged deck’s GUID and note-type identity. The learner page labels it for
faculty audit/interchange only. Anyone who previously imported a legacy CSV receives
a stable-UID search list and manual suspend/delete instructions; scheduling continuity
is not promised for that path.

### Concepts to MS3 Core v2

The legacy Concepts deck uses text-derived identities and cannot reliably delete or
update every vague card after cards are split, reframed, or retired. The v2 Core deck
therefore uses a new, clearly versioned deck/model namespace and stable specification
IDs.

This is a deliberate one-time reset:

- the learner page instructs existing users to suspend or delete the legacy Concepts
  deck before importing MS3 Core v2;
- the legacy Concepts download is no longer advertised after v2 release;
- a generated legacy GUID map supports faculty auditing and troubleshooting;
- all later v2 wording changes preserve identity and review history.

The complete v2 package is Core union Application only and reuses their permanent deck,
model, and note identities. A learner may therefore import Complete or either
standalone package without duplicate notes or alternate deck identities.

## Rollout sequence

### Milestone 1: Safety and generation foundation

- Add the canonical card schema plus a small, clearly non-clinical pilot fixture set
  for testing the specification structure.
- Add the qbank-render approval, quarantine, and append-only release-history
  registries.
- Add source, governance, approval-hash, quarantine, identity, package, update, and
  release validators.
- Pin the generation dependency through the repository’s dependency lock.
- Move Anki generation inside the gated build and remove fail-soft fallback.
- Repair explicit staging, CSV delivery, truthful documentation, and package receipts.
- Freeze the exact legacy qbank identities and test a seeded legacy-package update.
- Obtain and record the named `qb_pha_002` quarantine disposition, same-GUID
  withdrawal update, and site alert.

### Milestone 2: Faculty-review pilot

- Author 36 Core cards: six each for Diagnosis, Psychopharmacology, Safety,
  Communication, Psychotherapy/Formulation, and Disposition/Handoff.
- Generate the faculty HTML review sheet and review every actual front/back pair.
- Test the full source-drift and quarantine loop by intentionally changing fixture
  source text, not canonical clinical content.
- Refine wording rules only within the approved card standard.
- Do not publish this pilot as the final learner deck.

### Milestone 3: Complete v2 corpus

- Expand and review Core to exactly 144 cards under the approved Week and Domain
  quotas.
- Select and review exactly 48 Application cards from eligible attested qbank items.
- Produce the optional eligible full-qbank package.
- Review and record the exact rendered base and Tier 2 note hashes for every active
  full-qbank note before its first governed release.
- Review all high-risk, evidence-sensitive, and local-policy cards in their isolated
  card context.

### Milestone 4: Learner release

- Update, review, and re-attest the governed Anki learner page with accurate files,
  counts, workflow, migration instructions, withdrawal alerts, and provenance.
- Prepare/inspect/migrate the clean candidate, review/apply its history append, then
  rebuild and pass release gates 1-8.
- Atomically stage Core, Application, Complete, full qbank, CSV, and receipt as gate 9.
- Pass live MS3/resident site and receipt gates 10-11 before publication is complete.

## Acceptance criteria

- MS3 Core contains exactly 144 approved cards and MS3 Clinical Application exactly
  48 approved cards.
- Every Core Week-by-Domain and Application Week-by-task cell matches the approved
  crosswalk.
- Every Core card asks one explicit question and has one direct, source-grounded
  answer.
- Zero generic or ordinal-only prompts remain.
- Zero unreviewed, draft, retired, stale, resident-only, or quarantined clinical
  content ships; only neutral, same-GUID withdrawal maintenance records are allowed.
- Every active Core/Application v2 card carries stable identity, Week, Domain, task,
  audience, risk, source, review, and provenance metadata; the optional full-qbank
  package retains its governed qbank metadata contract.
- Every approved render hash matches the actual learner-visible card, and post-approval
  content or template changes automatically invalidate approval.
- Every high-risk active note across all packages has the required current evidence
  review and, when applicable, local-policy review.
- Source or qbank approved-item drift automatically quarantines the affected card.
- New quarantine, coverage loss, generation failure, or package mismatch blocks
  release.
- Actual `.apkg` databases are inspected in CI.
- All advertised downloads exist and pass site smoke checks.
- Counts distinguish Anki notes from scheduled cards.
- Existing qbank model/deck/note identities and both legacy GUID formulas are
  preserved, including separate Tier 2 identities.
- Append-only release history proves every shipped identity and every withdrawal
  update; retired IDs never reactivate.
- No shipped ID changes note kind/model/template/field identity; format changes use a
  new `supersedes` ID.
- A seeded prior release, including a locally newer stale note, passes the supported
  unconditional-update migration without losing scheduling.
- Complete is exactly Core union Application and reuses both standalone identities;
  the qbank is never bundled into Complete.
- Safety withdrawals publish a prominent UID-specific alert and manual fallback.
- CSV is labeled audit/interchange-only, not a supported learner import/update path.
- The legacy Concepts migration is clearly disclosed and v2 identities remain stable
  afterward.
- Learner documentation accurately describes AI drafting, faculty attestation,
  package contents, tags, and recommended use.

## Concrete next step after written-spec approval

Create a detailed implementation plan that begins with release safety and test
fixtures, then delivers the 36-card faculty pilot before expanding to the complete
v2 corpus. Implementation must occur in an isolated worktree, preserve unrelated
qbank and curriculum changes, use test-first development for behavior changes, and
separate safe mechanical work from faculty/evidence/local-policy review work.

## Innovative follow-up

Turn the generated faculty review sheet into a “card clinic.” For every changed or
quarantined card it would show the old front/back, proposed front/back, exact source
diff, affected package and Week, risk classification, and approve/revise/retire
decision. A later learner-facing extension could pair selected Core cards with a
delayed “transfer twin” in a different patient context, measuring whether learners
can use the concept rather than recognize its original wording.
