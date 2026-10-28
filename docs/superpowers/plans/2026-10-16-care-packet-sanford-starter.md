# Sanford starter packet — October 16, 2026

Joshua Moss requested a Sanford starter packet with the usual resources preselected
to make printing faster, following the remembered-unit change in #1067.

## Approved resource selection

On October 16, 2026, Joshua Moss approved the five recommended resources, requested
fresh website-based reviews of 211 and YCCAC, and authorized publication of the starter.
The configured directory IDs are:

| Resource | Directory ID |
| --- | --- |
| 211 Maine | `basic_needs-83d37ee6a1e1ab7f8ad0` |
| YCCAC — York County Community Action | `community_services-9e3cca7392bb47e5b3b7` |
| Intentional Peer Support Warm Line (Sweetser) | `community_services-e3ac700dcddb9a94f74b` |
| NAMI Maine Helpline | `community_services-a7e6bff322e81d0ab73d` |
| NAMI Connection — Sanford | `peer_support-69ae8ed43d20cb5b04bb` |

These are specific existing rows, avoiding duplicate directory entries. Their
selection is a packet default, not a claim that a referral is accepted or that a
service was contacted by telephone. The 211/YCCAC refresh belongs in ReConnect's
authoritative source because the Library proxies its generated directory feed.

The YCCAC service-area correction changes its generated ID from
`community_services-ce24715d7b5de65c43b0`; the source refresh must be served before
the Library starter is published. The configured replacement ID resolves the
corrected York County listing. A missing replacement row holds the entire starter
without loading a partial packet.

The source refresh is tracked in ReConnect PR
[#1976](https://github.com/jmoss333/reconnect-psychiatry-system/pull/1976).
It records an official-website review by Codex on October 16, not a telephone check
or human verification. Source claims were narrowed where the websites did not
support the previous wording.

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
configured production IDs separately against the current complete feed. Record
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

These initial checks use fictional resources and browser automation. They do not
establish service verification, native printer behavior, hosted preview verification,
or publication. Validation of the configured starter and publication are recorded
separately when completed.

Configured-starter local evidence on October 16:

- 94 focused starter/preference/packet/action checks and 87 preview checks passed.
- Enabling the configured starter exposed an older preview-test tray stand-in that
  omitted the new controls. It now supplies those controls when their markup is
  present; the existing repaint-count and focus-preservation assertions are unchanged.
  The original full-check failure is retained in the local evidence directory.
- All 30 starter/preference browser cases passed on the freshly assembled student
  and resident sites, with zero retries.
- Both unmodified built shells loaded the exact five configured IDs from the complete
  regenerated ReConnect feed (5,675 records; source hash
  `fb68cfa49fe484a9dc01dc1033f930f1e38e4c6d60fcc80bb179204f3785072d`).
  Preview focus, all five resource names, zero automatic prints and five pages after
  explicit Print passed on both sites. This test uses synthetic independent approval
  and intercepts native printing; it is not production or physical-printer evidence.
- Independent review found no further issues in the enabled preset.
