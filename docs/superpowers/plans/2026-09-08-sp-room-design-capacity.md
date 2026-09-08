# Spoken Interview Room: room layout and daily pilot capacity

The owner requested a clearer visual experience and selected 20 encounters per day. This change is limited to the existing protected spoken room; it keeps the three cases, voices, automatic 4.5/8-second pauses, Space/Escape shortcuts, ten-question encounters, and existing clinical review status.

## Experience

The previous interface put several station panels between speaking controls and conversation. The entrance now shows the selected case brief before admission and makes Start reachable in the first mobile viewport. Inside, one main column contains patient identity, a bounded scrollable transcript, live status, and speaking controls. A quiet sidebar contains the case brief, chart, priorities, and marked moments. Supporting objectives and typing expand on demand; typing opens automatically for text-only use or microphone recovery. Mobile places the encounter before supporting material.

The palette uses cool sage (#edf2ef), white (#ffffff), dark blue-green ink (#21383e), muted slate (#53676d), teal (#245e60), and pale borders (#d5e0dc). Existing system body fonts and an Iowan/Palatino serif keep assets local under the current CSP. Case identity, rather than a decorative patient portrait or synthetic waveform, anchors the room.

Transcript updates follow the newest reply while the learner is at the bottom. Reading earlier messages holds the scroll position and exposes a Latest message button. Marked notes keep the same textarea across speech updates, preserving focus, selection, and unsaved writing. Clear disposes notes, presentation, conversation, and passcode and restores the entrance identity.

## Capacity and migration

The shared protected-site policy allows 20 start attempts per UTC calendar day, 680 conservative provider-operation units/day, and 340 units per rolling 30 minutes. A start costs one unit, each question three, and the single optional alternative three. Failed or cancelled reservations remain charged. Existing encounters may continue after the twentieth start, within remaining units. Midnight UTC renews daily capacity; these counters are not dollar accounting.

The required Function-only DANA_PREVIEW_BUDGET_NAMESPACE pins the existing production ledger across deployments. Its first new reservation atomically upgrades schema v1 to v2, preserving usage. Current and preceding UTC days retain operation hashes for at least 24 hours, beyond the 30-minute encounter expiry. Conditional writes, duplicate checks, and malformed-state rejection remain mandatory.

The preview must receive unpaid visual/routing checks before production promotion. A paid request against the upgraded shared ledger would make the old runtime fail closed; therefore paid migration acceptance follows the production deployment. Do not rotate namespaces or delete usage to regain capacity. The assigned alias and production share the same allowance.

## Validation

Budget tests cover migration, twenty-start admission, continuation after the start cap, daily/window bounds, concurrent last-slot requests, midnight replay, stale-record pruning, and failed/ambiguous writes. Browser tests use the actual deployed CSP with mocked provider/audio and controlled speech recognition to cover responsive layout, case choice, typing fallback, pause/resume, shortcuts, focus, scroll anchoring, and Clear. This is browser/state evidence, not new physical-microphone evidence.

The full repository gate, independent capacity review, complete function deployment, actual served assets, and bounded paid production acceptance complete the release checks. Their resulting receipts belong in the local review output rather than this design specification.
