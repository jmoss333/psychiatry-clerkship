# Recovery Companion Wave 3 PR 2 Safety Revision Summary

Date: March 7, 2026  
Source: Claude Code pre-implementation clinical safety review of the Wave 3 spec  
Audience: Codex, Claude Code, human clinical reviewers

## Summary
Wave 3 PR 1 reflection tooling was approved to proceed.  
Wave 3 PR 2 repair/de-escalation tooling was **not approved as originally specified** and required a spec rewrite before implementation.

## Review Outcome
- `PR 1` (`rupture-log`, `two-truths`, `conflict-replay`): approved with minor wording review gates
- `PR 2` (`repair-lab`, `cycle-map`, `conflict-pause-plan`): blocked pending safety rewrite and re-approval

## Critical Design Corrections Adopted
1. Removed `accountability-forward` as a planned repair tone.
2. Replaced `accountability points` with neutral contribution / impact / next-step framing.
3. Added explicit routing for:
   - minors
   - dependent young adults
   - power-imbalanced relationships
   - coercive / monitored / retaliatory contexts
4. Required unsafe contexts to fall back to safety, grounding, support seeking, or private planning instead of direct repair scripting.
5. Tightened pause-plan wording so distance is framed as regulation/safety, not punishment or leverage.

## Revised PR 2 Rules
- Repair work is optional and never implied as required.
- The app must not pressure users toward apology, confrontation, or contact in unsafe contexts.
- The other person's truth, need, or motive must stay clearly framed as a guess.
- Private reflection remains a valid completion path for every PR 2 feature.

## Implementation Status
- Canonical spec updated in:
  - `docs/plans/2026-03-07-recovery-companion-wave3-repair-conflict.md`
- Re-approval recorded on March 11, 2026; PR 2 implementation may proceed with Section 6 guardrails enforced as hard behavioral rules.
