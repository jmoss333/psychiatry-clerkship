# Sanford starter packet — October 16, 2026

Joshua Moss requested a Sanford starter packet with the usual resources preselected
to make printing faster, following the remembered-unit change in #1067.

## Resource selection pending

The owner has been asked to name the usual resources. No real resource list is
configured yet, so the starter action is not offered in production. Do not publish
this as a completed Sanford starter until the requested list has been supplied and
matched to current directory IDs.

The earlier eight- and twelve-listing printer examples were fictional. The earlier
six-resource browser packet was an observed selection, not an approved Sanford
standard. Neither supplies the starter list. The existing standard insert defaults
remain Warm welcome, Your first week, Warning signs and what to do, and Your
medicines after discharge.

## Shortcut behavior

- One explicit **Load Sanford starter** action adds the configured resource IDs,
  loads the current Sanford Unit 2 profile, and opens the existing print preview.
- Resources are resolved against the current complete directory. Loading is atomic:
  a missing or ineligible resource, insufficient capacity, or unavailable unit
  profile leaves the packet unchanged and explains the problem.
- Existing resources, their order, page choices and copy mode are retained. Repeated
  clicks do not duplicate resources. Typed unit details or another selected unit
  prevent replacement, including text not yet committed by the field's change event.
- Current independent approval still governs Print and Copy. The action does not
  print automatically, mark resources verified, or imply referral acceptance.
- Only the existing raw unit-ID preference is remembered. Resource selections stay
  in the existing tab-scoped packet state; no new durable storage is introduced.
- The preview heading receives focus after loading. Every resource remains removable.

## Verification

Use fictional complete fixtures for behavior checks on both sites. Verify the
configured production IDs separately once the owner supplies the list. Record
local checks, hosted checks and publication separately.

Local evidence on October 16:

- 94 focused starter, remembered-unit, packet and action-contract checks passed.
- Both site build-and-check runs passed. Both outputs were freshly assembled again
  after the refusal-control correction described below.
- The initial browser run passed 26 of 30 cases. Four forced-control refusal checks
  exposed a stale enabled button after rejection (missing listing and incomplete
  directory, on both sites). The rejection now patches the controls before announcing
  its reason. All four failed cases then passed with zero retries, preserving the
  original failure log. The other 26 cases include the existing remembered-unit
  checks and the starter's load, edit/print, preservation, deduplication and revoked
  approval paths.
- Independent code review found the same refusal repaint issue; it was corrected.

These checks use fictional resources and browser automation. They do not establish
a real Sanford resource standard, service verification, native printer behavior,
hosted preview verification, or publication.
