#!/usr/bin/env bash
# SP Interview test suite — run from anywhere. Node >=18, zero deps.
set -e
cd "$(dirname "$0")"
echo "── client mock provider (Dana) ──"; node smoke.test.js
echo "── client mock provider (Marcus) ──"; node marcus.test.js
echo "── client mock provider (Ray) ──"; node ray.test.js
echo "── server/client gate parity (both cases) ──"; node parity.test.mjs
echo "── tab-scoped credential storage ──"; node storage.test.mjs
echo "── locked-content leak check (both cases) ──"; node leak.test.mjs
echo "── learner review filter + managed-voice gate ──"; node review-filter.test.mjs
echo "── generated preview reproducibility ──"; node preview.test.mjs
echo "── Dana harness failure propagation ──"; node harness-exit.test.mjs
echo "── deterministic voice state ──"; node --test voice-state.test.mjs
echo "── managed voice contracts ──"; node --test voice-contract.test.mjs
echo "── managed voice browser transport ──"; node --test managed-transport.test.mjs
echo "── governed provider failures + source contract ──"; node --test provider-errors.test.mjs
echo "── CI and site-build contracts ──"; node --test ci-build-contract.test.mjs
echo "── managed voice operations docs + release passport ──"; node --test ops-docs.test.mjs
echo "── disabled Dana conversation prototype ──"
node --test conversation-state.test.mjs
node --test conversation-encounter-ui.test.mjs
node --test encounter-rhythm.test.mjs
node --test conversation-encounter-context.test.mjs
node --test family-visit-state.test.mjs
node --test family-information-replay.test.mjs
node --test family-live-server.test.mjs
node --test conversation-adapters.test.mjs
node --test conversation-interruptions.test.mjs
node --test conversation-responses.test.mjs
node --test conversation-live-context.test.mjs
node --test conversation-local-cases.test.mjs
node --test conversation-local-dana.test.mjs
node --test conversation-live-server.test.mjs
node --test conversation-live-client.test.mjs
node --test conversation-retry.test.mjs
node --test conversation-bookmarks.test.mjs
node --test conversation-quality-benchmark.test.mjs
node --test conversation-quality-refinements.test.mjs
node --test conversation-openai-provider.test.mjs
node --test conversation-first-sentence-experiment.test.mjs
node --test conversation-recorded-speech.test.mjs
node --test conversation-bootstrap.test.mjs
node --test conversation-case-selection.test.mjs
node --test conversation-parity.test.mjs
node --test conversation-voices.test.mjs
node --test conversation-audio-catalog.test.mjs
node --test conversation-recordings.test.mjs
node --test conversation-recording-manifest.test.mjs
echo "ALL SUITES PASSED"
