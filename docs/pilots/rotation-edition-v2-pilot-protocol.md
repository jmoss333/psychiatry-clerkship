DRAFT — HUMAN REVIEW AND APPROVAL REQUIRED

# Rotation edition v2 pilot protocol

## Status and boundary

This is a synthetic, pre-release usability protocol for the existing MS3 and resident sites. It does not authorize real catalog content, publication-gate changes, merging, or deployment. Human review and approval remain required before each separately governed action.

Do not enter patient information, learner evaluations, credentials, access codes, private contact details, or unreviewed institutional content. Use only the reviewed synthetic fixture inventory during these sessions.

## Required preconditions

- Confirm no v1 link was externally shared.
- Review every real catalog name, role, location, place, phrase, official URL/hostname, audience scope, and `verifiedOn`.
- Run both production-disabled and synthetic-enabled gates.
- Obtain faculty/institutional privacy and clinical review.
- Test synthetic details before any real proposal.

## Pilot sample and journeys

- Conduct sessions with two attendings from different training settings.
- Include at least one MS3 edition and one resident edition.
- Include four trainees total with both audiences represented.
- Test mobile first-day comprehension.
- Test the local/core distinction.
- Test fingerprint matching.
- Test long-link/QR behavior.
- Test corrupt-link recovery.
- Record findings without PHI.

Each attending should curate one synthetic edition, inspect both desktop and 390 px previews, transfer the exact link to a fresh learner browser, and confirm the learner sees the intended audience, duration, curator card, local guidance, and fingerprint. Each trainee should explain what is clerkship Library content versus local rotation guidance, identify the first-day actions, compare the fingerprint with the attending, and recover safely from a deliberately corrupt synthetic link.

For a long synthetic edition, confirm that the exact link and backup remain available when no QR is shown. For mobile sessions, begin at 390 × 844 and use keyboard-only navigation for a second pass. Do not replace the built-in clinical or institutional authority labels with participant-authored wording.

## Observation record

Record only a session code, audience, device class, journey, observed behavior, severity, and recommended change. Do not record names, contact information, clinical scenarios, patient details, or learner-performance judgments.

Severity definitions:

- P0: privacy, safety, authority, audience, or data-integrity failure that requires immediate containment.
- P1: a major comprehension, accessibility, handoff, or recovery failure that prevents safe independent use.
- P2: a lower-risk usability issue that does not block the intended journey.

## Release and governance gates

- Stop release while any P0 or P1 pilot finding remains open.
- Require separate approval for real catalog content, gate enablement, merge, and deployment.

Keep the checked-in production catalog empty and publication disabled throughout this pilot. A future real-content proposal must be reviewed as a separate change, and a future gate-enablement change must remain separate from content review and pilot findings.
