# Care packet: remaining review and recovered progress

**As of October 14, 2026: implementation merged; G-B closed; G-C and G-D open.**
The feature flag remains off and the real unit-profile list remains empty. This record
preserves completed work and observations; it does not approve patient use or activation.

## Software work is complete

GitHub confirms [#1034](https://github.com/jmoss333/psychiatry-clerkship/pull/1034)
(core), [#1040](https://github.com/jmoss333/psychiatry-clerkship/pull/1040)
(independent profile authority), and
[#1036](https://github.com/jmoss333/psychiatry-clerkship/pull/1036) (print and inserts)
merged. The final merge was `3f8c549a4c08f2481078d823d351f80bd115f958`,
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
| Printer model and actual settings used | Not recorded. Requested settings were Letter, portrait, 100%/Actual Size, single-sided, grayscale, one page per sheet. |

No repeated review of the passed rows is needed unless the sample or print conditions change.
All five default pages and all seven long-packet pages have passed the owner's page
inspection, and QR scanning has passed for both printed samples. The next G-C step is a
ward nurse's review of both paper packets; the peer-specialist review remains separate.

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
- Have one nurse and one peer specialist read the paper output. Record each person's
  role, date, concerns and disposition. No staff review is recorded yet.
- Exercise the native browser print dialog and return-to-app behavior on the ward setup;
  frozen PDFs do not establish either. Check the separate single-sided wallet card if
  it is to be used. Duplex remains unapproved unless separately tested.
- Observe native screen-reader announcements and keyboard focus, and record actual
  browser/device coverage. Automated accessibility checks do not replace this evidence;
  Safari, Firefox and phone printing remain unproven in the current record.

Once observations are complete, reconcile any defects and present a concrete G-C closure
recommendation. Paper acceptance alone does not close G-C. Keep its state open until an
explicit closure decision is recorded.

### Next guided step: nurse paper review

Give one ward nurse both printed, fictional review packets. Ask the nurse to read them
as they would when explaining the packet to someone leaving the unit, and check:

- Whether the next action and relevant contact details are easy to find and explain.
- Whether routine follow-up instructions and the urgent-help instructions are clearly
  distinguishable, including any ambiguity about what the unit can provide.
- Whether any wording, grouping, small text or checkbox is confusing or difficult to use.

Record the reviewer's role, review date, whether the paper review passes or needs changes,
and the page/section and requested revision for each concern. No patient details are
needed. This records the nurse's review only; it does not close G-C or approve activation.
The peer-specialist, native accessibility and live-browser print reviews remain pending.

## G-D remains a separate activation decision

Before proposing activation, complete the owner-side authority enrollment and isolated
production storage setup described in [the faculty-console README](../../../faculty-console/README.md),
verify that previews cannot access it, and supply and independently approve a real unit
profile backed by actual contact/operational verification. No credentials or approval
records were inspected or created during this progress recovery.

The feature stays off. Adding profile data, passing tests or closing G-C does not itself
authorize activation. Existing clinical copy, defaults and approval rules remain intact.

Optional later idea: ask each staff reviewer to find the next action and contact details
from a fictional scenario, and record where they hesitate. This is a usability exercise,
not a new clinical score or required gate.
