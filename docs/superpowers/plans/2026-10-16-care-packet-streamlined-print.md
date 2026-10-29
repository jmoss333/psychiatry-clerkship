# Care packet: streamlined printing — October 16, 2026

**Owner-approved workflow change; implementation and release evidence belong to the
change's tests, pull request and publication receipt. This decision records no new
test result, deployment or clinical review.**

After trying the live packet, Joshua Moss requested fewer steps before printing and
explicitly selected “Remove all four checkboxes (recommended)” in the review chat.
This supersedes only the four general print-review confirmations and their reset
behavior in the [October 13 G-B decisions](2026-10-13-care-packet-gb-decisions.md).
The earlier walkthrough and approval records remain historical evidence of the
workflow reviewed on that date.

## Approved behavior

Remove all four required general review checkboxes, their transient confirmation
state, the review-complete status and the print/copy blocker tied to those boxes.
Replace them with this nonblocking reminder:

> Check these resources with the patient before sharing. Do not enter patient-identifying information.

An otherwise valid packet can print without clicking general review confirmations.
Both Review and Final modes remain available; copying packet text remains Final-only.
The printed patient tick boxes in Review mode are separate and remain unchanged.
The existing activation stays on (`FD_CARE_PACKET_ENABLED=true`). This decision does
not create or renew a unit approval, change profile facts, or assert that waived
reviews were performed.

## Requirements retained

- A current independent approval for the exact loaded unit profile is still required
  for patient packet output. Missing, expired, revoked or mismatched approval denies
  output; typed unit details do not count as approval.
- Printable content, valid payloads, listing eligibility, capacity and applicable
  layout checks continue to govern output.
- The three planned-call confirmations remain separate and required when the
  callback insert applies. Sanford Unit 2 has no enabled callback program.
- Content/profile changes still invalidate stale authority results, pending output,
  copied-text fallback and staged prints. A fresh print action authorizes only its
  current packet; the native print shortcut cannot bypass these checks.
- The wallet card remains a separate single-sided print. The earlier handout stays
  disabled.

## Acceptance to verify

Check both learner sites: a valid approved packet prints in Review and Final modes
with no general confirmation checkboxes; Final-only copy still works; the exact
reminder appears without a review-complete claim. Preserve regression coverage for
missing or stale approval, content changes during pending output, callback
requirements, print layout and return-to-app behavior. Record local checks, CI and
served-release verification separately when completed.
