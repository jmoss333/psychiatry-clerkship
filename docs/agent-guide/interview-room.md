# The Interview Room (`sp-proxy/`)

Part of the agent guide; the index is [`CLAUDE.md`](../../CLAUDE.md). The serverless LLM patient: where the key lives, what gates every PR (the offline red-team runner) and what does not (the retired live sign-off), and the owner's rotation-start command.

Every rule below is tagged with what enforces it: `[gate: …]` names the check that fails a build, a push or a PR; `[report: …]` names a tool that reports and blocks nothing; `[judgment]` means nothing enforces it but the reader.

### `sp-proxy/`: the key stays server-side; the red-team sign-off is retired — [gate: bin/redteam-offline.mjs]
- `sp-proxy/` — serverless LLM patient for The Interview Room. **API key stays server-side; the browser
  holds only a passcode.** Its live red-team checklist (`sp-proxy/REDTEAM_CHECKLIST.md`) and signed
  receipt are **optional, not a change gate** (decision `sp-redteam-signoff-retired`, 2026-09-27):
  never tell the owner a deploy, rotation or case "needs a red-team pass", and never re-add it to a
  checklist, the owner queue or the monthly gate. What does gate every PR and push is
  `node bin/redteam-offline.mjs` — the hand-written B/C/M probes plus the automatic S1–S3 checks
  over every reviewed case (small talk opens no gate; every gate is wired to intents and parent
  gates that exist; no gate opens on a euphemism). A reviewed case or gate with no hand-written
  probe is named in its output, never failed.

### `bin/rotation_turnover.py` is the owner's rotation-start command — [judgment]
- `bin/rotation_turnover.py` — the rotation-start Netlify visit for `sp-interview-proxy` as one
  command (rotation ID, origins, a new operations credential via the macOS Keychain, redeploy,
  live proof, a summary on the rotation issue). **The owner runs it on the Mac**; dry run by
  default, `--apply` to change anything. It never touches the learner passcode (decision
  `passcode-fixed`) and never prints a credential; an agent must not run `--apply` unasked.
