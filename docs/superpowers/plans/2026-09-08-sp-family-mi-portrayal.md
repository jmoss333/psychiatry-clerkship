# Hosted family and motivational interviewing cases

The owner requested Morgan's motivational interview, a family-therapy case, and more expressive voices reflecting each authored patient's presentation. Extend the protected pilot with the existing fictional Morgan/Maya material. Keep the approved room layout, ten turns, auto-send after 4.5 or 8 seconds, Space completion, same passcode, stable twenty-start daily ledger, and current provider models.

## Implementation

- Register Morgan's existing local case and a public-only family adapter. Keep draft faculty-review status visible; adding a case does not create attestation.
- Use one selected family respondent per learner turn. Direct address at the beginning selects Morgan or Maya; a visible selection remains available. One actor plus at most two speech calls preserves the 34-unit maximum per complete encounter and alternative.
- Bind both case identity and family speaker/addressee history into encrypted receipts. The server restores the original addressee during an alternative. Never promote unfinished audio into either person's heard history.
- Project only authored public family facts. No private inventories or client-selectable private channels enter this version. A role never supplies the other participant's assistant-history examples. Keep choice, disagreement, and sustainable support possible.
- Add hosted voice/actor overlays rather than altering archived recordings or locally modified prototypes. Use native speech synthesis directions for emotion, intonation and cadence, preserving exact words and uncertainty. Marcus has continuous energetic phrasing, brief case-grounded shifts of thought, and a response to explicit respectful redirection.

## Verification

Unit and provider-contract tests cover registration, public projection, addressee changes, replay binding, interrupted history, safe label rejection, and unchanged conservative budget. Browser checks cover both new cases, mobile/keyboard flow, labels and Clear. Paid preview checks will review representative Morgan, Maya and Marcus replies and verify playable audio before production. Acoustic authenticity and physical-microphone performance remain human listening judgments; automated tests cannot establish either.

## Limits and next experiment

The family meeting practices early relational interviewing and does not simulate an entire course of family therapy. There is no private check-in in the hosted slice. Interrupt/Escape remains immediate; true spoken interruption needs a separate capture/echo/cancellation design. Faculty-only portrayal auditions are a useful next experiment: compare the same facts across different degrees of speech pressure while retaining learner control and avoiding diagnostic stereotypes.

Technical reference: OpenAI's [speech guide](https://developers.openai.com/api/docs/guides/text-to-speech) documents instructions for emotional range, intonation, speed, and tone. Instructions are expressive controls, not a validated mental-status examination simulator.

## Recorded implementation refinement

The first real-voice sample confirmed complete MP3 generation and case-grounded dialogue but did not consistently separate Marcus's tempo from other voices. The hosted profile now requests synthesis speed 1.12 for Marcus alone; the API fallback remains 1.0 and the browser never changes playback rate. This complements the pressured phrasing and redirection behavior; speech rate alone is not a diagnostic marker or evidence of clinical fidelity.
