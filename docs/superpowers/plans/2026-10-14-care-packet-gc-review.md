# Care packet: review record and owner-directed activation

**As of October 14, 2026: implementation merged; G-B closed; G-C closed by owner
waiver of remaining review; production activation requested and awaiting setup.**
The feature flag remains off and the real unit-profile list remains empty. The owner's
latest direction supersedes the earlier instruction to keep G-C open and the flag off;
it does not supply missing unit facts or create a production profile approval.

## Latest owner direction

In **Finish carer packet work**, thread `01a13a7d-fbda-72c0-8926-17fd260957e3`,
the owner first clarified that approval applied to the updated plan, retaining G-C open
and the flag off. Later on October 14, the owner directed: "i want this live on the site
by the morniing", followed by "no more review needed". Record this as the owner's waiver
of the remaining G-C review and authorization to proceed toward activation for the
morning of October 15, America/New_York. Do not request the waived reviews again or
record unperformed checks as passed.

Activation is authorized; it is not complete. A real unit candidate, private owner
enrollment, storage access token and an approval matching that candidate are still absent.
The empty storage project and service signing configuration are prepared as recorded
below. The initial launch preparation uses no organization branding and no
optional callback program; no institutional branding permission or callback facts are
inferred. Do not invent contact facts, verification evidence, credentials or approvals,
or bypass the existing output guard to meet the requested date.

## Implementation history and evidence

GitHub confirms [#1032](https://github.com/jmoss333/psychiatry-clerkship/pull/1032)
(PR A: standard inserts, schema, validator and freshness check),
[#1034](https://github.com/jmoss333/psychiatry-clerkship/pull/1034)
(core), [#1040](https://github.com/jmoss333/psychiatry-clerkship/pull/1040)
(independent profile authority), and
[#1036](https://github.com/jmoss333/psychiatry-clerkship/pull/1036) (print and Revision 4)
merged. PR A first landed through #1032, not inside #1036. The final implementation
merge was `3f8c549a4c08f2481078d823d351f80bd115f958`,
October 13 at 10:21:56 PM America/New_York.

Refreshed main at this review was `24a62138754faf21cece39f3279b3be816bfc0ad`.
The packet controller, sheet module, retained print module, profile approval service,
profile data and current specifications have no changes from the previously verified
packet revision `652250d6e8ad275641ec6c3c0a9ed5465dc3a8cf`. Other application files have
changed; this comparison does not certify the whole current site or its deployment.

The prior integration record reports the full local gate, 222 packet/directory/retained-print
browser checks, and required GitHub checks passing. The final merged tree matched the
verified combination. These are historical results at the recorded revisions.

Current rules are in [Revision 4](2026-10-13-care-packet-revision-4.md), and workflow
approval is in [the G-B closure record](2026-10-13-care-packet-gb-decisions.md).
Historical unchecked implementation boxes in the original print plan are superseded by
the merged work and its evidence. Deferred ideas and the separate #1008 work are outside
this completion.

## Physical review: preserve what the owner already reported

Evidence source: the owner's October 14 messages in the Codex chat **Confirm requested
task**, thread `01a1322b-aba0-7101-8c83-57af9356897b`. The later chat service errors did
not undo the user's responses. These are owner-reported observations, not observations
made by the coding agent.

Subsequent evidence: in **Finish carer packet work**, thread
`01a13a7d-fbda-72c0-8926-17fd260957e3`, the owner confirmed on October 14:
"All 5 default pages and all 7 long-packet pages pass." This completes the page-inspection
portion of the ward-printer review for these samples. It does not assert QR scanning,
staff review, native accessibility testing or activation approval.

The owner then separately confirmed: "Both packets' printed QR codes scan correctly."
Record that as a pass for scanning from both printed samples. These fictional example.org
destinations do not establish real service-link or contact validity. At that stage the
owner explicitly instructed that the flag stay off and G-C stay open; the later direction
above supersedes it.

On October 14 the owner reported: "A ward nurse reviewed both packets today; both pass
with no changes." Record the reviewer role as ward nurse, review date as October 14,
2026, both samples as passed, and requested changes as none. This is the owner's report
of the nurse's review; no peer-specialist or accessibility review is implied. The owner
again explicitly retained the flag-off and G-C-open instructions at that stage.

| Check | Recorded result |
| --- | --- |
| Default packet sheet count | Pass: owner reported exactly five sheets. |
| Default page 1: edges, review label, footer and page number | Pass: owner reported all checks pass. |
| Default page 1: readability under ward lighting | Pass: owner reported all checks pass. |
| Default page 2: grouping, clipping/overlap and small contact text | Pass: owner answered yes. |
| Default page 3: dense grouping, QR clearance, small text and footer | Pass: owner answered yes to this outstanding check before subsequent service errors. |
| Default pages 4–5 | Pass: owner confirmed all five default pages pass. |
| Long-listing packet: printing and inspection of all seven pages | Pass: owner confirmed all seven long-packet pages pass. |
| QR scanning from paper | Pass: owner confirmed the printed codes scan correctly in both packets; fixture links are fictional. |
| Ward-nurse paper review | Pass for both packets, no changes; ward nurse, October 14, 2026, reported by the owner. |
| Printer model and actual settings used | Not recorded. Requested settings were Letter, portrait, 100%/Actual Size, single-sided, grayscale, one page per sheet. |

No repeated review of the passed rows is needed unless the sample or print conditions change.
All five default pages and all seven long-packet pages have passed the owner's page
inspection, QR scanning has passed for both printed samples, and a ward nurse has passed
both packets with no changes. The owner subsequently waived the remaining G-C review.

## The two review samples

The samples use fictional listings, contacts and profile approval simulated only in an
isolated browser. Each page says **Printer review only · Not for patient use**. The
default has eight listings on five pages; the long sample has twelve listings on seven
pages. The first-week, warning-sign and medicines inserts are on. Making home safer
and callback are off. No real profile approval was created.

Files are retained in the original checkout under `output/pdf/care-gc-2026-10-14/`.
The generation receipt is historical and remains unchanged; the review table above
supersedes its initial statement that physical review had not started.

| File | SHA-256, rechecked October 14 |
| --- | --- |
| `default-packet-printer-review.pdf` | `7da8a87e21b8512f3f29e890815cfd2b8a20104a5050f546a4106121d11856a0` |
| `long-packet-printer-review.pdf` | `31a58b682a557a59d1fc46514843e19ad31587c08e9409b7b364c823f4c4b8e1` |

These frozen PDFs test physical printing, not the ward browser's live print flow or
real service-contact validity. The optional wallet card is not in either sample.

## G-C closure: remaining review waived by owner

G-C is closed by the owner's October 14 direction above. The completed observations
remain recorded as passes; the following evidence remains unavailable and its collection
is waived for this launch:

- Actual printer model and settings. Requested settings are not proof of settings used.
- Peer-specialist paper review of either sample.
- Native ward-browser print dialog, return-to-app and separate single-sided wallet-card
  observations. Frozen PDFs do not establish these behaviors.
- Native screen-reader and keyboard observations, and actual Safari, Firefox and phone
  print coverage. Automated checks do not establish native coverage.

The waiver is an owner decision, not a technical test result. Duplex remains untested;
do not describe it as validated. No additional peer-specialist walkthrough or G-C
approval request is required under the latest direction.

## Contact verification: two separate contracts

The October 14 review found 13 insert table rows with `verifiedDate: "2026-10-12"`
and official source URLs. These record source-check dates; owner call verification is
not recorded in this data. The absence of a verifier field does not establish who
checked the facts or whether the owner has dialled a number.

The [insert schema](../../../13_Faculty_Resources/_automation/site_build/data/care-inserts.v1.schema.json)
requires checking both the number and every printed service fact in `what` against
the operating organization or government `source` and `alsoSources`. It does not
require an owner telephone call. Recheck against those sources and record only checks
actually performed; a genuine call observation can also be recorded in the review
evidence. Do not advance dates merely because the data is being approved or published.

Insert table rows allow only `who`, `number`, `what`, `source`, optional `alsoSources`
and `verifiedDate`. Adding `verifiedBy` or `evidence` while leaving the schema untouched
would fail validation. If structured per-row verifier evidence is wanted, propose that
schema change deliberately, in its own commit with an owner callout. The existing
[owner directions](2026-10-12-care-packet-owner-directions.md) explain that insert data
is neither governance nor classified page content: schema plus insert data does not
itself trip L1. Commit separation follows the owner's direction, not that claimed L1
restriction. This plan changes neither schema nor data.

Unit profiles instead use the existing `verification` entries with `field`, `checkedOn`,
`checkedBy` (a verifier role) and `evidence`; see the
[profile schema](../../../13_Faculty_Resources/_automation/site_build/data/care-unit-profiles.v1.schema.json).
Their oldest required actual verification date starts the **90-calendar-day** validity
period. Approval and build dates do not start or renew that period. Expiry occurs at
the start of the computed expiry date in **America/New_York**, as specified in Revision 4.
Schedule actual verification near launch; delaying approval does not extend freshness.
Insert rows have a separate **180-day freshness warning**, not this profile expiry.
If genuine profile checks postdate the inserts payload's `generatedAt`, update
`generatedAt` in the same data update; never backdate verification to satisfy validation.
The [validator](../../../13_Faculty_Resources/_automation/validate_care_inserts.py) and
[payload builder](../../../13_Faculty_Resources/_automation/site_build/care_inserts_payload.py)
enforce these distinct rules.

## G-D: activation authorized, setup and publication pending

The owner has authorized activation for the morning launch. Complete the owner-side
authority enrollment and isolated production storage setup described in
[the faculty-console README](../../../faculty-console/README.md),
verify that previews cannot access it, and supply and independently approve a real unit
profile backed by actual contact/operational verification. No credentials or approval
records were inspected or created during this progress recovery.

The candidate needs verified purpose, unit name, phone and staffed hours. Record callback
team, return number, hours and fallback only when a real callback program applies.
The patient's agreed day/time window and deadline stay handwritten or in the After Visit
Summary; they are not profile data. The app retains only transient confirmations.
The implementation supports `callbackProgram: false` with its four text fields empty
and the callback page off; do not invent program facts to fill those fields.

Prepare an unbranded profile (`brandingApproved: false`, `org: null`) for this initial
launch. The implementation supports this option; it does not assert institutional
branding permission. Any later branded profile needs the applicable branding decision.
ReConnect app inclusion remains outside this work pending the applicable approval.

Once a current real profile has independent approval, the owner's latest direction
authorizes the separate source edit enabling the flag. Do not request another general
activation approval. Keep the flag off until the required profile and authority are
usable; existing clinical copy, defaults and approval rules remain intact.

October 14 activation preparation found the public production profile-status service
returning HTTP 503 `authority-unavailable` and the candidate list empty. This does not
identify which configuration or storage dependency is missing. No credential, store,
real profile or approval was created during that check.

Subsequent launch preparation, on the owner's authority, created the empty Netlify
project `clerkship-care-profile-store`, site ID `4b4d23f6-8637-4999-a5b2-367800802be6`,
in the existing team. No repository connection or application code was added to it.
On the existing faculty-console project, site ID `295ae8dd-412c-47ad-aac3-7e7cd4b3110d`,
the agent installed `CARE_PROFILE_STORE_SITE_ID` and an independent random
`CARE_PROFILE_SIGNING_SECRET`. A subsequent metadata read confirmed both are scoped
only to Functions in production, with the signing value marked secret. No secret
value is recorded in this document, Git or chat output.

The owner must privately add `CARE_PROFILE_OWNER_KEY` and `CARE_PROFILE_STORE_TOKEN`
as production-only Functions secrets on the faculty-console project. The owner key
must be a new, privately held credential of at least 32 characters; the storage token
must be a Netlify personal access token able to access the storage project, not a
random application string. The current command-line Netlify login is expired and the
in-app project tab requires sign-in; the connected Netlify service performed the
preparation above. No login credential or token was extracted or reused. Redeploy the
console after all configuration is complete, then use its existing `/care-profiles.html`
screen to bind the owner's approval to the real candidate on main. This setup does
not reopen G-C or ask for another general activation decision.

Publish through the existing production release train after the activation commit's
required checks pass. The next scheduled run is October 15 at 5:05 AM America/New_York,
but scheduling and build delays mean this is not a delivery guarantee. Use the existing
publish-now workflow once the activation commit is eligible. Verify both learner sites
serve that exact release and exercise the real packet controls without test interception
before describing the packet as live. A normal Care-navigation smoke test alone does
not establish packet activation.

## Record delivery and separate preservation work

[PR #1055](https://github.com/jmoss333/psychiatry-clerkship/pull/1055) merged the corrected
review record at `f13b8b8cd9deba3a8c520b32e5088b46d1f69de5` on October 14 at 8:31 PM
America/New_York, after its required checks passed. Its final head was
`66159b3cfb06ab8094328525d96a8f2d7a9f9e33`. The owner-directed activation update is
subsequent work; #1055 itself did not enable the packet.

Repository cleanup is a separate operation, not a prerequisite for activation setup.
At the October 14 audit, remote main was
`24a62138754faf21cece39f3279b3be816bfc0ad` and the primary checkout was
`59518403fdeb2ac7e7b5e5333ba43379d8c8e4ac`: 0 ahead and 161 behind, with 235 untracked
files. Five untracked paths overlapped paths newly tracked on main:

- `13_Faculty_Resources/APA_Downloads_2026-06-29/_REFRESH_REPORT_2026-10-01.md`
- `docs/superpowers/plans/2026-09-04-faculty-console-pending-pages-deeplinks.md`
- `docs/superpowers/plans/2026-09-04-required-path-coverage-remediation.md`
- `docs/superpowers/plans/2026-09-15-huggingface-private-infrastructure-plan.md`
- `docs/superpowers/plans/2026-09-19-essentials-handoff.md`

Their names were compared, not their contents. Refresh coordination and remote evidence,
preserve and reconcile these files, then fast-forward only if safe. Do not reset, clean
or overwrite them to make synchronization proceed.

Seven locked care-related worktrees existed at that audit, but they were not all merged:
the review branch still held the four commits above. The print and profile-authority
worktrees also held untracked acceptance evidence. Preserve required evidence, including
ignored files, before individually retiring any checkout. The frozen review PDFs live
in the primary checkout's `output/pdf/care-gc-2026-10-14/` and are ignored by Git; committing
the plan or archiving only tracked files does not preserve them. `git worktree prune`
is not a safe removal procedure for these existing locked worktrees.

At that audit, `care-1036-merge-verify` was already absent locally and remotely. The
`codex/care-profile-authority-2026-10-13` branch remained checked out in its locked local
worktree, while its remote branch was already absent. Recheck each branch before acting.
The core and print plans still reference `_prototypes/care-packet/HANDOFF.md`: any later
archive move must preserve the artifacts and update those references. Follow the home
file-hygiene rules for a move log, rollback record and non-overwriting moves; deletion
requires explicit in-session authorization. This documentation update performs no
synchronization, archival, deletion or unlocking.

Optional later idea: ask each staff reviewer to find the next action and contact details
from a fictional scenario, and record where they hesitate. This is a usability exercise,
not a new clinical score or required gate.

Another optional improvement is a revision-stamped readiness summary that combines live
repository facts with separately recorded human observations. It must never infer a
review, approval or gate closure from automated checks.
