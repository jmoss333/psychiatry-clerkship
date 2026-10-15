# Care packet activation preparation — October 15, 2026

**Private setup and exact profile approval verified; activation authorized;
merge, publication and production packet verification pending.**

The owner authorized launch and requested no further general G-C review. This
separate branch prepares the one source-flag change enabling the packet. G-C remains
closed by the owner's waiver of remaining review; unperformed reviews are not passes.
The owner has now approved the exact unit candidate through the independent profile
screen. This branch does not create that approval or change its enforcement rules.

This branch starts at candidate-and-runtime-fix revision
`f8762d050cb2aa3fbe9291eae639174585c08cca`. Its only product change sets
`FD_CARE_PACKET_ENABLED=true`; test fixtures select explicit on and off states
independently of that default. The single-assignment check and the build failure
for an enabled packet with no candidate remain in place. Profile facts,
credentials, authority storage, and the requirement for current independent
approval before patient output remain unchanged. At this update, main revision
`6b721c35b1e5fe01888cb6900245e836f44213fd` still has the flag off; this activation
branch has it on. Neither the branch nor the profile approval proves publication.

The existing private setup is complete. Faculty-console deployment
`6ad0d5f949b0d54e96b63123`, from main revision
`6b721c35b1e5fe01888cb6900245e836f44213fd`, was published at
`2026-10-15T13:33:14.333Z`. After the owner reported approval, the real status service
returned HTTP 200, `ok: true`, `status: approved`, and approver Joshua Moss, MD, for
requests from both learner origins. The response `checkedAt` values were
`2026-10-15T15:22:33.463Z` (MS3) and `2026-10-15T15:22:34.434Z` (resident);
these are status-check times, not the approval creation time.
The approved `sanford-bhu-2` revision is
`bbe0a2d48f060fcb8fdb63d4d0d6c97fc92d838cc58f2c7fc1352bd3d81523bb`,
matching the candidate whose latest source-file commit is
`dd58ed43dfa16fdd772d66ca6a4b64af61a28d44`. Expiry remains January 13, 2027 at the
start of the New York day. The [release record](2026-10-14-care-packet-gc-review.md)
records the completed setup separately from the remaining publication work.

Local tests use synthetic authority fixtures. Their passing results cannot prove
private setup, real profile approval, deployment, or a working production packet.
The live service evidence above independently establishes current profile approval.
After the authorized release is published, check the real packet on both learner
aliases with no request interception and bind that result to the served release.

Local preparation checks on October 15 passed: both learner builds, 379 focused
Care/profile tests, and 330 browser checks across the MS3 and resident projects
(packet, print, directory, resource pack, and delayed dialog focus). Runtime:
Node 22.18.0, Python 3.13.7, macOS Chromium 153. The actual-source-on assertions
failed before the flag change; the directory touch-target assertion failed before
being corrected to measure its clickable wrapping label. The complete normal pre-push
verification gate also passed for activation head
`a2f15fdcce1e87f88b57e19e318a51e7eb973d51`, including both learner builds.
These local results remain separate from the real approval evidence above.
Merge, learner publication, and nonintercepted production packet verification remain
pending; no publication receipt is claimed in this record.
