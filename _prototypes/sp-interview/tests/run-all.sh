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
echo "ALL SUITES PASSED"
