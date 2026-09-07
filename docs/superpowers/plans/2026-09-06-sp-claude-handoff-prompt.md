# Copy into Claude Code

Continue the spoken Interview Room work in `jmoss333/psychiatry-clerkship`, draft PR #547, branch `codex/hosted-dana-preview`. Read CLAUDE.md and `docs/superpowers/plans/2026-09-06-sp-hands-free-handoff.md` first. On this Mac, the prepared worktree is `/Users/jm/Psychiatry-Clerkship-Library/.worktrees/hosted-dana-preview`. Check current branch status and preserve unrelated work.

Implement Tasks 1–3 in the handoff. The user's first requirement is a genuinely hands-free conversation: after Start and microphone permission, speak normally, wait 4.5 seconds, hear Dana, and continue for ten turns without clicking Send, pressing Space, changing focus, or touching the composer. Keep the eight-second thinking-time option, Hold, optional Space completion, Escape interruption, and explicit typed fallback. Preserve Marin and the existing case-grounded replies.

Automatic submission already exists, but the earlier hosted test pressed Space every turn. Diagnose the actual recognition/lifecycle failure instead of merely hiding Send. Add realistic event-sequence tests and ten automatic controller/browser cycles; distinguish synthetic recognition from physical-microphone evidence. Never silently truncate unfinished speech or resend a question after an uncertain provider failure.

Also repair PR #547's timing-sensitive recording test, add the new hosted-preview tests/build to CI and the local gate, and verify the exact pushed commit. Details and source locations are in the handoff. Keep integrity and security assertions intact.

All four single-patient cases, the student-station features, reflection/retry, Morgan/Maya family meeting, and optional information replay are preserved in this branch. Reuse them; do not rewrite the product. The companion archive preserves the 75 Dana recordings plus three other openings, with checksums. Do not regenerate them.

Make separate reviewable commits, update the draft PR and existing protected preview as appropriate, and report the working link, tests, remaining limitations, and next migration. Continue routine authorized engineering without repeatedly asking for approval. Keep secrets private, respect existing API budgets, and preserve family information boundaries. Do not merge, activate learner access, change clinical facts/attestations, or deploy learner production. Complete the microphone/CI delivery before starting the later migration backlog.
