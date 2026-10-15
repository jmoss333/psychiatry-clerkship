# Care packet: remaining review and recovered progress

**As of October 14, 2026: implementation merged; G-B closed; G-C and G-D open.**
The feature flag remains off and the real unit-profile list remains empty. This record
preserves completed work and observations; it does not approve patient use or activation.

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
destinations do not establish real service-link or contact validity. The owner explicitly
instructed that the flag stay off and G-C stay open.

On October 14 the owner reported: "A ward nurse reviewed both packets today; both pass
with no changes." Record the reviewer role as ward nurse, review date as October 14,
2026, both samples as passed, and requested changes as none. This is the owner's report
of the nurse's review; no peer-specialist or accessibility review is implied. The owner
again explicitly retained the flag-off and G-C-open instructions.

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
both packets with no changes. The next G-C step is a peer specialist's paper review.

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

## Remaining G-C evidence

- Record actual printer model/settings when available. Page inspection and paper QR
  scanning have passed for both samples; do not repeat them unless the samples or print
  conditions change, or infer actual settings from the requested settings.
- Have one peer specialist read both paper packets and record role, date, concerns and
  disposition. The ward-nurse review is complete; no peer-specialist review is recorded yet.
- Exercise the native browser print dialog and return-to-app behavior on the ward setup;
  frozen PDFs do not establish either. Use `?tab=care` in an isolated test build with
  the flag enabled only by test interception and the existing fictional profile and
  simulated authority fixtures, never by changing the source flag or real authority.
  Check the separate single-sided wallet card if it is to be used. Duplex remains
  unapproved unless separately tested.
- Observe native screen-reader announcements and keyboard focus, and record actual
  browser/device coverage. Automated accessibility checks do not replace this evidence;
  Safari, Firefox and phone printing remain unproven in the current record.

Once observations are complete, reconcile any defects and present a concrete G-C closure
recommendation. Paper acceptance alone does not close G-C. Keep its state open until an
explicit closure decision is recorded.

### Next guided step: peer-specialist paper review

Give one peer specialist both printed, fictional review packets, retaining their
"Not for patient use" labels. Invite feedback from the perspective of someone using
the packet after leaving the unit, focusing on:

- Whether the wording feels respectful, clear and manageable during a stressful transition.
- Whether the first action and relevant routine or urgent-help contact are easy to find.
- Whether the amount of information, wording or layout feels confusing or overwhelming.
- Whether instructions assume access to a phone, internet, transportation or support
  that could make them difficult to follow.

These prompts guide the existing peer review; they introduce no new score or threshold.
Record the reviewer's role, review date, pass or needs changes for each packet, and the
page/section and suggested revision for each concern. No patient details or personal
history are needed. This records the peer specialist's review only; it does not close
G-C or approve activation. Native accessibility and live-browser print reviews remain
pending regardless of the peer-review result.

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

## G-D remains a separate activation decision

Before proposing activation, complete the owner-side authority enrollment and isolated
production storage setup described in [the faculty-console README](../../../faculty-console/README.md),
verify that previews cannot access it, and supply and independently approve a real unit
profile backed by actual contact/operational verification. No credentials or approval
records were inspected or created during this progress recovery.

The candidate needs verified purpose, unit name, phone and staffed hours. Record callback
team, return number, hours and fallback only when a real callback program applies.
The patient's agreed day/time window and deadline stay handwritten or in the After Visit
Summary; they are not profile data. The app retains only transient confirmations.
The implementation supports `callbackProgram: false` with its four text fields empty
and the callback page off; do not invent program facts to fill those fields.

Obtain the applicable MaineHealth site/branding decision before launch. The implementation
supports an approved unbranded profile (`brandingApproved: false`, `org: null`), but
that technical option does not waive institutional permission or owner launch decisions.
ReConnect app inclusion remains outside this work pending the applicable approval.

After G-C is explicitly closed in writing and a current real profile has independent
approval, present G-D for the owner's explicit activation decision. Only that decision
authorizes a separate source edit enabling the flag. Adding profile data, passing tests,
merging this record or closing G-C does not itself authorize activation. The feature
stays off; existing clinical copy, defaults and approval rules remain intact.

## Record delivery and separate preservation work

Use the existing [PR #1055](https://github.com/jmoss333/psychiatry-clerkship/pull/1055)
to land this documentation after all checks pass; do not open a duplicate. Before this
correction, its head was `c89740284547fe1e45cc69f9abe94d5c5070bf38` with four documentation
commits, including nurse acceptance. That is a historical snapshot, not the final PR
head or a current check result; consult the PR for its latest revision, checks and merge.
Mergeability alone does not establish passing checks.

Repository cleanup is a separate operation, not a prerequisite for the remaining human
review or authorization supplied by this plan. At the October 14 audit, remote main was
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
