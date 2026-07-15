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
echo "── generated preview reproducibility ──"; node preview.test.mjs
echo "── Dana harness failure propagation ──"; node harness-exit.test.mjs
echo "── deterministic voice state ──"; node --test voice-state.test.mjs
echo "── managed voice contracts ──"; node --test voice-contract.test.mjs
echo "── CI and site-build contracts ──"; node --test ci-build-contract.test.mjs
echo "── managed voice operations docs + release passport ──"; node --test ops-docs.test.mjs
echo "ALL SUITES PASSED"
