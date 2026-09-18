# Collision sentinel

The collision sentinel is a read-only preflight for concurrent work. Give it the
repository-relative paths you intend to edit; it reports whether current local
work, Claude sessions, local branch footprints, or open pull requests overlap
those paths.

In plain language, it is a traffic light, not a lock:

- `SAFE` — every evidence source was available and no overlap was found.
- `COORDINATE` — an inactive branch, Claude session scope, open pull request,
  duplicate pull-request head, or incomplete evidence warrants coordination.
- `OCCUPIED` — dirty local work or an active branch already overlaps the path.

`SAFE` is only a point-in-time engineering observation. It does not grant
faculty, clinical, publication, merge, or deployment approval.

## Run it

From the repository root:

```bash
python3 tools/coordination/collision_report.py \
  --path tools/coordination/collision_report.py \
  --path tests/maintenance/test_collision_report.py
```

For machine-readable output or a longer path list:

```bash
python3 tools/coordination/collision_report.py \
  --paths-file proposed-paths.txt \
  --format json
```

Each non-empty line in `--paths-file` is one repository-relative path. `--path`
is repeatable and can be combined with `--paths-file`. Absolute paths, parent
traversal, `.git` paths, NULs, and backslashes are rejected.

Normal report mode exits `0` whenever it emits a valid report, regardless of the
traffic light. Add `--check` only when a non-safe report should act as a gate:

| Exit | Meaning |
| ---: | --- |
| `0` | Valid report; in `--check` mode, all paths are `SAFE`. |
| `1` | A fatal probe or internal error prevented a valid report. |
| `2` | Invalid command-line input. |
| `3` | `--check` produced `COORDINATE`, `OCCUPIED`, or incomplete evidence. |

## Evidence and safety boundaries

The command reads:

- registered Git worktrees, their dirty paths, and their diff from the locally
  resolved default branch;
- active Claude session working-directory scopes from `claude agents --json`;
- all open GitHub pull requests, each PR detail record, and all paginated changed
  files, including both sides of renames.

It does not fetch, checkout, switch, reset, clean, stash, commit, push, prune,
comment, label, close, merge, or write a cache or report. Git probes disable
optional locks. The subprocess runner accepts only the exact read-only command
shapes the collector needs.

If GitHub, Claude-session, or part of the local Git evidence is unavailable or
incomplete, the report says so and will not return `SAFE`. A stronger local
`OCCUPIED` result remains `OCCUPIED` even when another source is unavailable.

Output is privacy-bounded: it includes proposed and matched repository-relative
paths, PR numbers, short head IDs, and synthetic worktree IDs. It omits absolute
paths, usernames, process IDs, session names, PR titles, branch names, remote
URLs, command output, file contents, and raw errors. Text output JSON-escapes
filenames so control characters cannot forge terminal lines.

## Test it

```bash
PYTHONDONTWRITEBYTECODE=1 \
  python3 -m unittest tests.maintenance.test_collision_report -v
```

The existing maintenance discovery also finds these tests:

```bash
PYTHONDONTWRITEBYTECODE=1 \
  python3 -m unittest discover -s tests/maintenance -p 'test_*.py'
```
