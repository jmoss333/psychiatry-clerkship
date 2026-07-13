# SP Interview Proxy

Serverless endpoint that gives The Interview Room (`_prototypes/sp-interview/`) a live LLM patient.
Same trust model as the faculty console: **the API key never leaves the server; the browser holds
only a rotation-block passcode.**

```
sp-proxy/
  index.html                  placeholder page (the site is just the function)
  netlify.toml                base-dir config (publish + functions)
  netlify/functions/sp.mjs    the endpoint: converse + evaluate + health
  package.json                @netlify/blobs (durable daily quota counter)
  REDTEAM_CHECKLIST.md        run after every deploy and every model/pack change
```

## What the function does

- **Converse** (`POST /api/sp`): re-derives rapport/gates/intents from the full transcript
  server-side (the client is untrusted — a modified client cannot unlock Dana's disclosure),
  assembles the actor prompt from the **attested pack fetched from the repo**, and returns
  `{reply, state}`. Locked disclosures are never placed in model context — only their
  deflection lines — so injection cannot extract what the model was never given.
- **Evaluate** (`POST` with `mode:"evaluate"`): deterministic coverage map + rubric context +
  the student's self-assessment → structured JSON feedback. Parse failure degrades gracefully
  to the tool's deterministic debrief.
- **Health** (`GET /api/sp`): `{ok, actorModel, packVersion, packStatus, cases}` — this is what
  the tool's "Test connection" button calls.
- **Logs are metadata only** — case id, turn number, rapport, date. Never message text.

## One-time setup (~10 min, Netlify dashboard)

> Per house routing: do this in the **Netlify dashboard via Chrome** (the Cowork Netlify MCP
> is authed to a different account and 404s these sites).

1. **Add new site → Import from Git →** `jmoss333/psychiatry-clerkship`
   - Base directory: `sp-proxy` · Build command: `npm install --omit=dev` · Publish: `sp-proxy`
   - Functions auto-detect from `sp-proxy/netlify/functions`.
2. **Environment variables:**

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your Anthropic key (console.anthropic.com) |
| `SP_STUDENT_PASSCODE` | strong passcode; **rotate each rotation block** |
| `SP_PACK_URL` | `https://raw.githubusercontent.com/jmoss333/psychiatry-clerkship/main/_prototypes/sp-interview/sp-interview.pack.json` *(update on promotion out of _prototypes)* |
| `SP_MODEL_ACTOR` | pinned actor model — **verify the current model string at docs.claude.com, then record the same string in `pack.engine.modelPinned`** |
| `SP_MODEL_EVALUATOR` | pinned evaluator model (a stronger tier than the actor) |
| `SP_ALLOWED_ORIGINS` | `https://une-ms3-psychiatry.netlify.app,https://mmc-psychiatry-residents-sanford.netlify.app` (+ `http://localhost:8888` while testing) |
| `SP_MAX_TURNS` / `SP_DAILY_LIMIT` | optional; defaults 40 / 2000 LLM calls/day |

3. Deploy, then verify: `curl -H "x-student-key: <passcode>" https://<site>/api/sp` → `{"ok":true,...}`.
4. In the tool: mode chip → **Live** → settings panel → paste endpoint URL
   (`https://<site>/api/sp`) + passcode → **Test connection**.
5. Run `REDTEAM_CHECKLIST.md` end to end **before giving students the passcode**.

## Governance couplings (do not skip)

- **Model pin = content pin.** `SP_MODEL_ACTOR` and `pack.engine.modelPinned` must match.
  Changing either re-triggers faculty review: replay the golden transcript
  (the 19-message skilled-interview script in `/tmp`-test / checklist) and eyeball Dana's voice.
- **Pack changes deploy themselves** (the function re-fetches within 5 min) — which is exactly
  why `SP_PACK_URL` must point at `main`, where nothing lands without your PR review.
- **Cost envelope:** Haiku actor + Sonnet evaluator ≈ $0.03–0.08 per completed encounter;
  a block of 8 students × 12 encounters ≈ $3–8. `SP_DAILY_LIMIT` is a tripwire, not a budget.
- **Passcode hygiene:** one passcode per rotation block, shared in person (not email),
  rotated at block end. If it leaks, the blast radius is your daily limit of Haiku calls.
