# Family Conversation Simulator — approved implementation record

This local review-branch record maps the approved remaining-review packet to the simulator
implementation. It records authored teaching-text and scoring changes only. The simulator remains
draft, formative, and unvalidated; it is not an authorized bedside decision tool.

## Implemented packet revisions

| Packet item | Implemented change |
| --- | --- |
| Safety rubric | Updated the four axis levels to the approved validation, non-blaming, structure/consent, and safety language. Generic acknowledgment can earn validation 1; safety remains separate from required gate steps. |
| Not assessed | Moment-by-moment debriefs show **Not assessed at this step** when no option at that moment assesses safety. |
| R01–R03 (S7) | Replaced assumptions about sharing, direct contact, two-home symmetry, and parent roles with team verification, Riley's involvement, and path-honest proposed steps. A channel gate is explicitly a proposal for team confirmation, not proof of a completed arrangement. |
| R04–R05 (S4) | Replaced unverified legal-rights and timing language with respectful routing to the attending and appropriate process contact; removed unsupported legal/process claims from distractor feedback and closing. |
| R06–R09 (S6) | Replaced sequential diagnostic claims, assigned motives, categorical causation, and unsupported authority assumptions with broad uncertainty, checked perspectives, Ruth's role in sharing/planning, and team-routed firearm/driving concerns. |
| R10 (S5) | Replaced an unconfirmed next-day call and implied discharge timing with an honest return-to-team step for unresolved support and safety arrangements. |
| R11 (S7) | Removed endings that asserted identical rules, named adults, direct parent messages, custody outcomes, or predicted legal conflict when those were not shown on the path. |
| R12 and prior S8 approval | Uses the approved direct question, shows the attending taking over before the later planning node, preserves a prior missed question after repair, and prevents a future promise from satisfying the completed-handover gate. |
| Prior focused approvals | Retains consent-limited adult sharing, qualified teen confidentiality language, formative framing, patient autonomy, and the approved firearm wording/feedback boundaries. |
| Changed distractors | Replaced the seven approved distractors and synchronized the S8 branch twin. No scores were silently changed except a generic acknowledgment now earns validation 1 under the approved rubric. |

## Verification scope

- `node --test tests/family-meeting-sim.test.mjs` exercises every complete authored path, gate,
  repair, ending composition, scoring distinction, and the added regression coverage for the
  approved changes.
- A local browser flow exercised the S8 direct-question, immediate-attending-handover, and
  completed-plan route; the debrief displayed the three required safety steps as done and the
  not-assessed distinction at non-safety moments.

## Remaining holds

- Counsel/local policy review remains required for intended legal, privacy, custody, contact, and
  disclosure teaching; this change does not resolve those questions.
- Faculty review remains required for the draft rubric and for the fresh length-cue assessment.
  Approved wording reduced several distractors and made 68 of 70 nodes have a uniquely longest
  strongest option (previous test baseline: 62); the test records the new measured baseline rather
  than padding unsafe distractors.
- No attestation, publication, deployment, merge, remote push, or signature occurred.
