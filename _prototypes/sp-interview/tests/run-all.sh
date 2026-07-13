#!/usr/bin/env bash
# SP Interview test suite — run from anywhere. Node >=18, zero deps.
set -e
cd "$(dirname "$0")"
echo "── client mock provider ──"; node smoke.test.js
echo "── server/client gate parity ──"; node parity.test.mjs
echo "── locked-content leak check ──"; node leak.test.mjs
echo "ALL SUITES PASSED"
