# Front Door icons: vendored Lucide subset (C1)

Spec: `docs/superpowers/specs/icon-nav-handoff/` (C0, #1012): `README.md` decision log, `PROMPT.md` § C1, `LUCIDE-PIN.md`.

| File | What it is | Written by |
|---|---|---|
| `lucide-static-1.54.0.icons.json` | Lucide name → glyph child elements, copied **verbatim** from `lucide-static@1.54.0/icons/<name>.svg`; `feather: true` marks the MIT (Feather-derived) glyphs | `lucide_subset.py` only |
| `lucide-static-1.54.0.LICENSE` | The release's `LICENSE`, byte for byte (ISC + Feather MIT) | copied from the tarball |
| `lucide_subset.py` | Re-extracts / adds / drops glyphs from the npm release and enforces the provenance rules | — |
| `reconnect-rc-icons-wf.snapshot.json` | ReConnect's Lucide-derived `wf-*` glyphs, stamped with the ReConnect commit they were read from | `refresh_reconnect_icon_snapshot.mjs` only |
| `refresh_reconnect_icon_snapshot.mjs` | Reads `tools-suite/shared-libs/rc-icons.js` at a commit (`git show`, read-only) and rewrites the snapshot | — |

**Pipeline.** `../icon_sprite.py` renders the JSON into one hidden `<svg id="fd-icon-sprite">` of `<symbol id="ic-<name>">`s (with both licence notices in a comment). `build_deploy.py` injects it into the shell `index.html` at `<!--fd-icon-sprite-->`; the resident build inherits that index. `../frontdoor/fd_icons.js` `fdIcon(name, opts)` returns `<svg …><use href="#ic-<name>"></use></svg>`. There is no runtime CDN, icon font or ReConnect dependency.

## Add or remove a glyph

```sh
D=$(mktemp -d) && (cd "$D" && npm pack lucide-static@1.54.0 && tar -xzf lucide-static-1.54.0.tgz)
shasum "$D/lucide-static-1.54.0.tgz"      # 3addc8999298b41f788f3b15cf8042a4607293c6
python3 lucide_subset.py --package-dir "$D/package" --add <lucide-name>
```

Then, in the same PR:

1. Add the name to `FD_ICON_NAMES` in `../frontdoor/fd_icons.js`, plus a registry alias if a phase needs one.
2. Re-pin `ICONS_JSON_SHA256` and `SPRITE_SHA256` in `tests/fd-icon-sprite.test.mjs` (`python3 ../icon_sprite.py --sha256`).
3. Update the expected-set lists in `tests/fd-icons.test.mjs`.

`--check` reports whether the JSON is current without writing anything.

## Refresh the ReConnect snapshot

```sh
node refresh_reconnect_icon_snapshot.mjs --repo ~/Code/reconnect-psychiatry-system --rev <sha>
# optional live comparison in the test run:
RECONNECT_REPO=~/Code/reconnect-psychiatry-system RECONNECT_REV=<sha> node --test tests/fd-icons-reconnect-drift.test.mjs
```

`tests/fd-icons-reconnect-drift.test.mjs` matches glyphs by **upstream Lucide name** (the `lucide` field on each `wf-*` entry, e.g. `wf-crisis` ↔ `life-buoy`). For every shared glyph, the bytes must be identical, and both repos must pin the same Lucide version. The shared set is pinned too, so a refresh that loses overlap reads as a change, not a pass.

## Upgrading Lucide

A version bump is a decision for both repos (C0 D-set). Re-vendor here and in ReConnect, then refresh the snapshot. The drift test fails until both name the same release.
