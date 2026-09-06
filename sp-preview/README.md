# Protected hosted Dana preview

An isolated engineering/faculty proof of ten spoken turns. This directory does not alter either learner site's navigation or the production SP proxy. Dana's disclosure overlay and conversational portrayal remain drafts pending faculty review.

## Local verification

Requires Node 22 or later. Install dependencies here and in `../sp-proxy`, then run `npm test` and `npm run build`. Run the full root and prototype suites sequentially. The `dist` folder contains only `index.html`, `app.js`, and `styles.css`; never publish the repository root, `_prototypes`, or `sp-preview` itself.

The opt-in `npm run test:hosted` also requires the `tests/smoke` Playwright dependencies, explicit `DANA_QA_URL` and `DANA_QA_ACCESS_FILE` environment variables, and an authorized preview passcode file. It makes one paid opening and ten paid conversation requests, with synthetic recognition and native muted audio at 2x. It never runs as part of `npm test`; reports contain counts/timings, not dialogue, keys, or state receipts. See `ACCEPTANCE.md` for the completed run and its limits.

## Hosting configuration

Use a separate Netlify preview site with this directory as its base. Keep its provider key and access credentials separate from learner/faculty console credentials. Required Function environment variables:

| Name | Meaning |
| --- | --- |
| `DANA_PREVIEW_ENABLED` | Exactly `true` to permit this engineering preview. Missing/false fails closed. |
| `DANA_PREVIEW_PASSCODE` | Preview-only access phrase, at least 16 characters. Held only in browser memory. |
| `DANA_PREVIEW_STATE_KEY` | Random 32-byte key encoded as 43 base64url characters. Server only. |
| `OPENAI_API_KEY` | Existing user-authorized Psychiatherapy key. Server only; never public assets. |
| Deployment identity | Supplied by trusted Function `context.deploy.id`; state and budget bind to that deployment. Do not rely on build-only `DEPLOY_ID`. |
| `DANA_PREVIEW_ORIGIN` | Optional explicit exact origin for a local test or assigned preview alias. |

Draft deployment only. The learner production sites and `sp-interview-proxy` production deployment are outside this change's activation scope. Set no canonical `speechEngine` enabled flag or faculty attestation during deployment.

Use `netlify deploy --context deploy-preview` with the complete build for the first upload. Verify the function bundle as well as static assets. Routing uses the explicit TOML rewrite to the default function endpoint. Do not also export `config.path`: modern custom paths disable the default endpoint, making that combination return 404. See [Netlify function configuration](https://docs.netlify.com/build/functions/configuration/).

Runtime deployment identity comes from [the Function context](https://docs.netlify.com/build/functions/api/#deploy). `DEPLOY_ID`/`DEPLOY_URL` are build variables and are not among the [read-only runtime variables](https://docs.netlify.com/build/functions/environment-variables/#netlify-read-only-variables).

## Request and information boundaries

The browser sends questions in an authenticated same-origin POST. Browser speech recognition may send microphone audio to the browser vendor; completed text is sent to OpenAI. Dana's voice is AI-generated Marin. No browser transcript persistence, transcript database, durable audio, or dialogue logs are added. OpenAI requests use `store:false`; this does not assert absence of provider retention under the account's terms.

The server validates the complete actor reply before publishing any speculative first-sentence audio. Each complete MP3 segment carries an encrypted receipt containing server-authored dialogue. The next request can acknowledge only issued, generation-complete segments; interruption never treats an unheard tail as communicated. Receipts expire after 30 minutes and are invalid on another deployment/origin or after key/access rotation.

The ledger stores hashes, timestamps, and counts only. Each opening reserves one paid attempt; each question conservatively reserves three (actor plus up to two speech segments), even if fewer are used. Limit: 72 attempts per rolling 30 minutes, 120 per deployment. Failures/cancellations remain reserved. These are operation limits, **not dollar billing or a guarantee against charges outside this preview**. Redeploying creates a new allowance and must be intentional.

## Acceptance before sharing

- Wrong/missing access phrase or origin, altered/expired receipts, and budget exhaustion fail before provider calls.
- Ten turns work across fresh Function instances. Duplicate requests start no duplicate generation.
- Space finishes outside input controls; reflective pacing and typed fallback work; Escape stops late playback.
- Native MP3 completion, microphone behavior, cancellation, and response delays are verified in the actual hosted browser journey.
- Private source paths are absent from published assets; public failures contain no provider details or keys.
- Canonical production voice flags and learner routes remain unchanged.

Retry/reflection, Morgan, and family information replay are preserved in the packaged local prototype. They are subsequent hosted slices, not implied by this first proof.
