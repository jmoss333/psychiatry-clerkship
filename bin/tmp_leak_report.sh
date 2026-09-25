#!/usr/bin/env bash
# tmp_leak_report.sh — what a bin/verify.sh step left behind in its private TMPDIR.
#
#   bash bin/tmp_leak_report.sh <dir>
#
# <dir> is the per-step directory verify.sh's step() exported as TMPDIR while the step ran. This
# prints one line summarising what is still in it — the entry count, then the entries grouped by
# name prefix with the random mkdtemp suffix stripped, largest group first — removes the
# directory, and exits:
#   0  the step left nothing (prints nothing)
#   1  the step left entries: a test that never cleans up its fixtures (prints the summary)
#   2  could not check: <dir> missing, not a verify-step.* directory, or not removable
#
# WHY: on 2026-09-24 the Mac's $TMPDIR held ~122,700 entries, ~103k of them fixtures from three
# test files that never removed what they made (queue-runner-, queue-out-, lfs-repo-, lfs-cache-,
# lfs-shim-, fake-netlify- …) — about 48 per full `node --test` run, ~200 runs a day across the
# sessions working this repo, and growing 10–33k a day by the end. `python3` put that directory
# first on sys.path whenever it ran from it, so every import listed it, and
# tests/preview-site.test.mjs — whose launcher starts from os.tmpdir() — blew its 20 s readiness
# limit and blocked pushes. No test failed: every leak was invisible until the pile was big
# enough to break something unrelated. A private TMPDIR per step makes the pile impossible, and
# this report names the prefix, which greps straight to the file that leaked it.
#
# A few names are not fixtures and are exempt by EXACT name, never by prefix: a tool's own
# fixed-name cache is reused rather than piling up, and anything with a random suffix is a leak.
#   node-compile-cache  npm (10.x lib/cli.js) calls module.enableCompileCache() at start-up,
#                       which keeps Node's compile cache in os.tmpdir()/node-compile-cache.
#
# Removal is guarded by the directory's NAME, not only by the caller: this runs `rm -rf`, so it
# refuses anything that is not a `verify-step.*` directory rather than trusting its argument.
#
# Bash 3.2-safe (the Mac's /bin/bash runs verify.sh as the pre-push hook) and BWK-awk-safe (the
# Mac's /usr/bin/awk); plain find/sed/sort flags that BSD and GNU both accept.
set -uo pipefail

MAX_GROUPS=8
EXEMPT='node-compile-cache'
dir="${1:-}"

if [ -z "$dir" ] || [ ! -d "$dir" ]; then
  echo "could not check: private TMPDIR '$dir' is not a directory"
  exit 2
fi
case "$(basename "$dir")" in
  verify-step.*) ;;
  *) echo "could not check: refusing to remove '$dir' (not a verify-step.* directory)"; exit 2 ;;
esac

names="$(find "$dir" -mindepth 1 -maxdepth 1 -print | sed 's#.*/##' | grep -vxF "$EXEMPT")"
if [ -n "$names" ]; then
  count="$(printf '%s\n' "$names" | wc -l | tr -d ' ')"
  # Group by the name a test chose, not the random suffix mkdtemp appended: node adds 6
  # characters, Python's tempfile 8 (`tmp` + 8 when no prefix is given), mktemp one per X.
  groups="$(printf '%s\n' "$names" | awk -v max="$MAX_GROUPS" '
    {
      name = $0
      # A name with no random suffix to strip is shown whole, without the `*`.
      if (name ~ /^tmp[a-z0-9_]+$/ && length(name) == 11) { group = "tmp*" }
      else {
        group = name
        sub(/[A-Za-z0-9_]+$/, "", group)
        group = (group == "") ? name : group "*"
      }
      seen[group]++
    }
    END { for (g in seen) printf "%d\t%s\n", seen[g], g }
  ' | sort -t "$(printf '\t')" -k1,1nr -k2,2 | awk -F '\t' -v max="$MAX_GROUPS" '
    NR <= max { out = out (NR > 1 ? ", " : "") $2 " (" $1 ")" }
    END { if (NR > max) out = out ", and " (NR - max) " more prefixes"; print out }
  ')"
  printf '%s left in its private TMPDIR (removed): %s\n' \
    "$([ "$count" = 1 ] && echo "1 entry" || echo "$count entries")" "$groups"
fi

# A fixture may leave read-only directories behind (a checked-out git object store does), and
# rm -rf cannot descend into a directory it may not write.
chmod -R u+w "$dir" 2>/dev/null
rm -rf "$dir" 2>/dev/null
if [ -e "$dir" ]; then
  echo "could not check: private TMPDIR '$dir' could not be removed"
  exit 2
fi
[ -z "$names" ]
