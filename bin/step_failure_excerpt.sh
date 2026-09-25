#!/usr/bin/env bash
# step_failure_excerpt.sh — what bin/verify.sh prints for a FAILED step.
#
#   printf '%s\n' "$out" | bash bin/step_failure_excerpt.sh [TAIL_LINES]
#
# Reads a step's full combined output on stdin and prints, in order:
#   1. every TAP `not ok` line (up to MAX_FAILURES) with its `location:` and `error:` keys —
#      a multi-line `error: |-` block included, up to MAX_ERROR_LINES of it;
#   2. the last TAIL_LINES lines (default 15), exactly as verify.sh printed before.
# Output with no `not ok` line (a Python validator, a shell check) gets part 2 only, so every
# step that is not a node:test run prints what it always did.
#
# WHY: verify.sh used to print only `tail -15` of a failing step. For `node --test` that is
# the TAP summary counters (`# tests` … `# duration_ms`) and nothing else: node's TAP reporter
# — the one it picks when stdout is not a terminal, as inside `$(…)` — reports each failure
# inline, where it happened, and never recaps them. The root suite is ~2,800 tests, so the
# failing test's name, file:line and error sat thousands of lines above the tail. On
# 2026-09-24 a load-sensitive flake in tests/preview-site.test.mjs aborted pre-push runs and
# the visible tail could not say which test it was. A bigger fixed tail only moves the cliff.
#
# Bash 3.2-safe (the Mac's /bin/bash runs this as the pre-push hook) and BWK-awk-safe (the
# Mac's /usr/bin/awk): no arrays under `set -u`, no gawk extensions.
set -uo pipefail

TAIL_LINES="${1:-15}"
MAX_FAILURES=10
MAX_ERROR_LINES=8

out="$(cat)"

failures="$(printf '%s\n' "$out" | awk -v max="$MAX_FAILURES" -v maxerr="$MAX_ERROR_LINES" '
  function indent(s) { match(s, /^ */); return RLENGTH }
  # A TAP test point. node:test indents a subtest by 4 spaces per level; its YAML block sits
  # 2 deeper than the `not ok` line and closes with `...` at that same depth.
  /^ *not ok [0-9]+/ {
    count++
    inblock = (count <= max); inerr = 0
    if (inblock) { print; base = indent($0) }
    next
  }
  !inblock { next }
  {
    ind = indent($0)
    if (inerr) {
      # A block scalar runs while lines are indented past its key (blank lines included).
      if ($0 ~ /^[[:space:]]*$/ || ind > errind) {
        if (errlines < maxerr) print
        else if (errlines == maxerr) print substr("                ", 1, errind + 2) "…"
        errlines++
        next
      }
      inerr = 0
    }
    if (ind == base + 2 && $0 ~ /^ *\.\.\. *$/) { inblock = 0; next }
    if (ind == base + 2 && $0 ~ /^ *(location|error):/) {
      print
      if ($0 ~ /error: *[|>][-+]? *$/) { inerr = 1; errind = ind; errlines = 0 }
    }
  }
  END {
    if (count > max) printf "… %d more not-ok line(s) not shown; see the full output\n", count - max
  }
')"

if [ -n "$failures" ]; then
  printf '%s\n' "$failures"
  printf '⋯ last %s lines ⋯\n' "$TAIL_LINES"
fi
printf '%s\n' "$out" | tail -n "$TAIL_LINES"
