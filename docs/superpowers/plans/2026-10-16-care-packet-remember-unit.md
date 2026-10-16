# Care packet: remember the chosen unit — October 16, 2026

**Owner-approved behavior; acceptance below is work to verify, not a claim of
completed tests or publication.**

Joshua Moss directly requested remembering Sanford Unit 2 on the device after the
[streamlined printing change](2026-10-16-care-packet-streamlined-print.md). The
implementation applies to any explicitly loaded, usable unit profile; it does not
hard-code Sanford or select an arbitrary default.

## Approved behavior

- Loading a unit profile automatically remembers its raw profile ID under
  `cw_care_unit_profile_v1` in `localStorage`. Store no contact snapshot, approval
  receipt, patient details or packet selections in that preference. The packet
  continues to use its existing tab-scoped `sessionStorage` record.
- A new packet controller restores the remembered profile once, only when the
  existing tab's packet has neither a profile nor typed unit details. Resolve the
  ID against the current payload and require a usable profile. Existing tab choices
  win. Missing, corrupt or unavailable preferences do not choose a fallback unit.
- Restoration remembers a choice, not approval. Opening the preview and each
  Print or Copy action still check current independent approval for the exact
  profile revision. No approval receipt is restored from browser storage.
- **Clear packet** clears the current packet and unit details while keeping the
  remembered preference for a later visit. The same controller does not immediately
  reapply it after Clear or refresh.
- **Forget this unit** removes the durable preference while leaving the current
  packet and loaded unit unchanged. Existing tab-scoped packet state can therefore
  still retain that unit; a fresh packet no longer inherits the forgotten choice.
- **Use my own details instead** removes the durable preference and unlinks the
  current profile, making the unit fields editable. It does not clear the selected
  resources or make typed details an approved profile.
- Storage failures leave the packet usable for the current visit and show a truthful
  hint rather than claiming the unit was remembered or forgotten.

“On this device” means this browser profile on this site's origin. The student and
resident sites have separate preferences; another browser, private session or
cleared browser storage may not retain the choice. No cross-site or device-wide
synchronization is introduced.

Existing activation, profile approval, privacy, content eligibility, callback,
Final-only copying and stale-output protections remain unchanged.

## Acceptance to verify

Verify on both learner sites that a remembered unit restores into a fresh packet,
existing session choices and typed unit details take precedence, and unavailable
or corrupt IDs never choose another unit. Check fresh approval after restoration
and before each output, including expired or revoked approval. Cover Clear without
same-controller restoration, Forget without changing the current packet, switching
to own details, storage read/write/remove failures, and browser/site isolation.
Check that the hint and Forget button update without replacing focused controls.
Record local tests, CI and production verification separately when completed.
