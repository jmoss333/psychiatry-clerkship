# Care packet activation preparation — October 15, 2026

**DRAFT — BLOCKED on existing private setup and exact profile approval.**

The owner authorized launch and requested no further general G-C review. This
separate branch prepares the one source-flag change enabling the packet. It does
not activate production, approve a profile, change approval rules, or record any
new human observations. The existing G-C record is unchanged.

This branch starts at candidate-and-runtime-fix revision
`f8762d050cb2aa3fbe9291eae639174585c08cca`. Its only product change sets
`FD_CARE_PACKET_ENABLED=true`; test fixtures select explicit on and off states
independently of that default. The single-assignment check and the build failure
for an enabled packet with no candidate remain in place. Profile facts,
credentials, authority storage, and the requirement for current independent
approval before patient output remain unchanged.

Before this activation branch may be merged or deployed, finish the existing
owner-only setup described in the [launch handoff](2026-10-14-care-packet-gc-review.md):
privately install the production Functions owner credential and storage token,
redeploy the faculty console, and use its existing owner screen to approve the
exact current candidate revision. Confirm that the public status service returns
current approval matching that candidate. This is the existing approval boundary,
not a request for another general launch review.

Local tests use synthetic authority fixtures. Their passing results cannot prove
private setup, real profile approval, deployment, or a working production packet.
After the existing prerequisites are met and the authorized release is published,
check the real packet on both learner aliases with no request interception.

Local preparation checks on October 15 passed: both learner builds, 379 focused
Care/profile tests, and 330 browser checks across the MS3 and resident projects
(packet, print, directory, resource pack, and delayed dialog focus). Runtime:
Node 22.18.0, Python 3.13.7, macOS Chromium 153. The actual-source-on assertions
failed before the flag change; the directory touch-target assertion failed before
being corrected to measure its clickable wrapping label. The full verification
gate, merge, deployment, and real approval remain outside these local results.
Before merge, update this preparation status and the existing release record from
the actual private setup and exact approval evidence; do not infer those from tests.
