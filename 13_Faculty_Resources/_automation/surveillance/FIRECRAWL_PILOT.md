# Firecrawl collection pilot

This manual tool collects five existing guideline targets and produces a faculty
review brief. It uses the canonical evidence registry projection and the existing
citation index. It does not publish, file issues, change curriculum, write the
attestation ledger, update production baselines, or award review-cadence credit.

## Run

From the repository root, set `FIRECRAWL_API_KEY` in your environment, then:

```sh
python3 13_Faculty_Resources/_automation/surveillance/bin/run_firecrawl_pilot.py \
  --out-dir /tmp/firecrawl-first
```

Each run needs a **new** output directory. Five URLs means at most five requests;
there are no automatic retries, linked-document downloads, or recurring schedules.
Reported credits are retained per source; missing usage is explicitly unknown.
Credentials travel only in the authorization header and are not saved or printed.

Select other registered guideline targets with repeatable `--source ID` arguments.
Use `--list --out-dir /tmp/unused` to inspect the selection without fetching.

For a subsequent run, compare with the saved report:

```sh
python3 13_Faculty_Resources/_automation/surveillance/bin/run_firecrawl_pilot.py \
  --previous /tmp/firecrawl-first/report.json --out-dir /tmp/firecrawl-second
```

The connected Firecrawl tool can also supply responses without a local API key:
request `markdown`, `onlyMainContent: true`, `maxAge: 0`, `storeInCache: false` for
each listed URL. Supply `--responses FILE` containing an object keyed by source ID;
each value is `{ "success": true, "data": { "markdown": "...", "metadata": {...} } }`.
Missing or failed responses must remain in the selection and report as unable to
check. Imported evidence is labeled `imported`; its report timestamp is processing
time, not independent proof of retrieval time. Keep the originating tool receipts.
Do not persist raw responses for signal-only sources: use direct API mode, which
retains only hashes and metadata for those sources. Use `--fixture` for synthetic
responses; synthetic prior reports are rejected for real comparisons.

## Read the output

- `faculty-brief.md`: coverage, per-source status, recorded affected paths, linked
  question IDs and stem excerpts, credits, redirect destinations, comparison excerpts
  and next actions. A summary table shows question counts (overlapping, not additive).
- `report.json`: reusable observations with source URL, retrieval ID, hash and text
  where permitted. Keep locally; fetched material is untrusted source data.
- Exit **0**: all selected targets retrieved, no detected text changes; first
  observations are explicitly distinguished from unchanged comparisons.
- Exit **1**: at least one text change warrants review.
- Exit **2**: incomplete retrieval, unavailable mapping, or unresolved active
  question-to-reading references. Not a clean pass.

HTTP failures, short/empty responses, suspected challenge pages, cached results,
URL mismatches and redirects do not establish a usable comparison. Error-page
detection is heuristic, not a guarantee. A changed hash is not a clinical finding;
navigation and other page decoration may still appear in extracted text. This
pilot neither checks linked articles nor proves complete guideline coverage.

The citation index is an existing, potentially incomplete mapping, not a new
exhaustive dependency audit. No recorded citations means **mapping gap**, not
no impact. Question mapping resolves each active item's explicit `pages` through
`load_shipped_pages()` (including `extraSources`), then intersects those authored
paths with the citation index. The brief names each matching question ID, stem
excerpt and exact reading-to-source path. These are **indirect** connections:
a source cited somewhere in a reading need not support every question about it.
An exact registered source URL in an item's `evidence` field is labeled direct.
No topic similarity, keywords, or model judgment create these links.

All question IDs and reading lists are validated before mapping; duplicate IDs,
malformed/empty inventories, unreadable inputs and unresolved active page slugs
cannot yield a complete-coverage result. Retired questions are excluded and counted.
No recorded match means unknown impact, not clearance. Unchanged and first-observation
sources show dependencies for orientation, not a demand to revise those questions.
Proposed clinical revisions still require source review and remain future work. The bounded passage pilot below adds more specific routing without changing those clinical records.

A failed run does not overwrite a prior run. When retrying, explicitly choose the
last successful comparison report for the sources you are checking. Production
Apify baselines are intentionally incompatible with this extractor.

## Validation and next step

`node --test tests/firecrawl-pilot.test.mjs` exercises failure handling, changes,
restricted text, and CLI output. The live pilot should establish retrieval coverage
before scheduling is considered. A useful next extension is faculty-confirmed
claim-level links, narrowing broad reading-based candidate lists to the questions
that actually rely on the changed passage.

Firecrawl contract: https://docs.firecrawl.dev/features/scrape


## Proposed clozapine passage links

`config/passage_links.json` records two exact FDA passages, selected by a unique
level-two heading and zero-based paragraph number. It links each to exact question
field excerpts and shipped-reading excerpts. These are proposed review-routing
dependencies, **not faculty approval, clinical validation, or exhaustive coverage**.
The source retrieval receipt is recorded with the map. The enrollment mapping
includes a potential wording discrepancy in `qb_anx_003`; including it does not
endorse its current wording or automatically edit the item.

On the first observation, the extracted paragraph must match the recorded source
quote. Subsequent observations compare that paragraph against the prior pilot
report and bind the mapping using a signature. Missing/ambiguous headings, changed
question or reading excerpts, an incompatible source, or a changed mapping receipt
produce `unavailable` and exit 2. They do not silently clear a candidate. A page
change outside the two mapped paragraphs remains `outside-mapped-passages` and
requires source-level review. Positional paragraph shifts are conservative review
signals, not proof of a clinical change. The broader dependency list is preserved
as background context and labeled separately from targeted passage flags.

Packets show old and new source text, exact question IDs, why each was flagged,
and the affected reading excerpts. The baseline report must already contain
passage observations to localize subsequent changes; older pilot reports establish
a first passage observation rather than inventing a prior paragraph snapshot.

Run the offline demonstration from the repository root:

```sh
python3 13_Faculty_Resources/_automation/surveillance/bin/simulate_firecrawl_passages.py \
  --out-dir /tmp/firecrawl-passage-demo
```

Use a new directory. The demonstration makes no network calls and labels every
report `fixture`. Synthetic edits append conspicuous test markers rather than
inventing medical recommendations. `SUMMARY.md` links to all five review briefs:

| Scenario | Expected targeted questions |
|---|---|
| No change | None |
| ANC paragraph edited | qb_pha_002, qb_pha_011, qb_psy_007 |
| Enrollment paragraph edited | qb_anx_003, qb_pha_002, qb_pha_011 |
| Unrelated footer edited | None; source-level change remains visible |
| Expected heading missing | Unable to localize; exit 2 |

The two targeted readings are `psychopharm_primer.md` and `t_psychosis.md`.
The ANC-only change leaves the enrollment-only question `qb_anx_003` unflagged;
both mapped changes leave unrelated `qb_psy_012` unflagged. Tests execute the real
CLI through each case and also break question, reading, heading, and mapping
receipts independently:

```sh
node --test tests/firecrawl-pilot.test.mjs tests/firecrawl-passages.test.mjs tests/shipped-pages-readers.test.mjs
```

Before expanding or scheduling this pilot, a faculty reviewer should assess the
proposed connections. Future maps can narrow dependencies to additional exact
passages without treating this two-passage experiment as complete source coverage.

## Automated faculty inbox

The follow-up workflow `surveillance-firecrawl.yml` collects the five registered
pilot sources each Monday at 06:30 UTC, or on manual dispatch. Set the repository
Actions secret `FIRECRAWL_API_KEY` securely before expecting successful live runs.
No key is read from the interactive connector. Missing credentials produce a failed
examination with visible diagnostics, not a green unchanged report.

`bin/run_firecrawl_review.py --out-dir <new-directory>` is the production entrypoint.
It hydrates its prior `history/firecrawl/inbox.json` from the existing report branch,
scans active question teaching fields, and appends review packets. Exit 0 means a
complete quiet examination, 1 means new review packets, and 2 means incomplete.
The workflow publishes diagnostics before converting 2 into an Actions failure.
It makes at most five source requests per run and has a 15-minute job timeout.

Old packets survive subsequent quiet scans. Packet decisions are held separately
in the authenticated faculty console. Signals outside the two precise clozapine
mappings remain broader review candidates. Explanations, evidence, pearls, correct
answers, second-tier explanations, and distractor feedback are scanned. Incorrect
answer choices alone are not asserted teaching. Lexical coverage is explicitly
limited: no flags does not prove consistency, and age/setting/historical context
must be judged by faculty. No clinical editing, promotion, cadence credit, or
attestation is performed by this collector.

For offline validation, `--responses` labels all evidence synthetic and requires a
separate `--state` path. Synthetic and live state cannot be combined. The faculty
endpoint refuses synthetic packets. Run `node --test tests/firecrawl-*.test.mjs`
and the faculty evidence review suites before activation. Live activation requires
a successful manual run and inspection of the authenticated inbox, separately from
code merge and deployment. A state file exceeding 8 MB fails without truncation.


### Storage capacity warning

After saving the inbox, each run measures its actual stored byte size (including
any compact-JSON fallback). At 6,400,000 bytes, 80% of the unchanged 8,000,000-byte
limit, it emits an Actions warning and records used/remaining capacity in the run
summary, `receipt.json` (`storageCapacity`), and faculty brief. The receipt also
reports capacity when a missing credential prevents examination; examination
status remains incomplete. Capacity is operational information, not a new faculty
packet or an approval. Nothing is pruned, dismissed, or marked reviewed.

When warned, arrange reviewed expansion of evidence storage before the next large
source change. The indicator describes the saved inbox, not a forecast of how many
runs will fit. An oversized write still fails without replacing existing evidence;
a run that fails before saving may not produce a fresh capacity reading.

### Lossless shared snapshots

The collector accepts the original version-1 inbox and a `storageVersion: 1`
envelope. The envelope contains `state`, `snapshots`, and `references`. Only exact,
repeated values of at least 256 UTF-8 bytes are shared: packet `candidates`,
`questionSnapshots`, `passages`, `diff`, `readings`, and latest-source `text`.
Different wording is never merged. Values are serialized JSON strings keyed by
SHA-256 of those exact UTF-8 bytes. References carry an explicit three-part path;
the referenced field is absent from the stored state and restored on read.

Both the Python collector and authenticated faculty reader verify checksums,
reject missing or unused snapshots, duplicate/overwriting references, unsupported
versions and paths, and cap reconstructed data at 64 MB. The stored inbox remains
capped at 8 MB and is saved compactly. The capacity warning measures stored bytes.
A valid reconstruction has the same packet IDs, ordering, occurrence counts,
supersession links, question snapshots, and all audit/extension fields. Faculty
decisions stay in their separate ledger and are not rewritten by this migration.
No packet is marked reviewed or removed to save space.

Rollout: deploy the faculty reader from this revision before running the new
collector against live history. The first successful collection converts storage
automatically; legacy inboxes still read normally. Verify the reconstructed inbox
against the previous exact report-branch commit, and compare the faculty decision
ledger separately. A code rollback after conversion requires a reader that still
supports the envelope; do not restore an old inbox over newer review evidence.
For offline inspection use `evidence_storage.decode_inbox(json.loads(...))`.
The original packet schema validates the reconstructed state, not the envelope.

The authenticated faculty GET response is also losslessly compressed, inside an
explicit `evidence-gzip-base64-v1` JSON envelope. The browser restores the complete
view before rendering or selecting dispositions. This avoids the provider's 6 MB
buffered-response ceiling without relying on binary-response handling. The server
rejects a wire payload over 5 MB (leaving provider overhead margin), and both ends
reject an expanded view over 64 MB. These bounds fail explicitly; they never trim
packets or decisions. As unique evidence grows, storage and response capacity still
need monitoring; this change is not unbounded storage. Original JSON responses
remain readable by the new browser client. Reload already-open faculty tabs after
deployment so they load the new decoder.

### On-demand faculty review

The phone inbox requests `section=index`: every packet is represented by its ID,
source, observation date, saved-scan priority, and recorded-decision count. This
initial response loads neither current readings nor the question bank. List order
is provisional: current teaching and resolution are assessed only when opened.
Nothing is filtered out as resolved or superseded based on a lightweight summary.

Opening a packet requests `section=packet` with its revision and the index's exact
report commit, teaching commit, and decision-ledger revision. A mismatch returns
409 and asks faculty to reload. Only that packet and its replacement chain are
assessed; unrelated reading files are not fetched. The detail retains the prior
comparison/decision flow, adds every historical decision for that packet, and
exposes the complete original packet (including saved question snapshots and any
additional audit fields). Collapsing an opened packet keeps its unsaved rationale;
reload asks before discarding unsaved text. Failed loads remain retryable.

`section=history`, with the same revision checks, exposes every non-packet inbox
field, including source snapshots and reconciliation receipts, plus the complete
separate decision ledger and a list of all packet revisions. Together with each
packet's full retained record, this provides access to every stored record without
sending it all on initial load. Neither view writes evidence or decisions. Existing
clients without a section parameter retain the full-response contract. Successful
saves refresh and reopen the selected packet when no other forms contain unsaved
work; otherwise those drafts remain in place, using only the exact ledger revision
returned by that successful save. Concurrent external changes still fail revision
checks. New typing during a pending reload cancels replacement of the view.

### Resume review on the same browser

After a packet opens successfully, the reader remembers only its 64-character
revision in `cw_evidence_last_packet`. No key, rationale, evidence, or decision is
stored with the bookmark. After login, **Resume review** reloads the index and
requests that packet with fresh report, teaching, and decision revision pins.
Changes between requests still fail the existing server checks. A replacement is
identified on the earlier packet; both retained records remain in the list.
Missing packets produce an explicit message while leaving available history open
for inspection. Blocked or malformed browser storage does not prevent review.

Resume refuses to replace a view containing unsaved notes. Typing while its index
request is pending cancels the replacement through the existing draft-version
check. The bookmark is local to that browser and origin, not an account-wide
review status or evidence of clinical approval.

The source name beside **Resume review** comes from the currently loaded inbox,
not browser storage. It refreshes with the inbox and follows successful packet
opens (including reopening a loaded panel), without a separate detail request.
The button exposes the name as its accessible description. An absent saved packet
is labelled unavailable; labels are rendered as text and long names can wrap.
