# Lucide pin (icons & wayfinding)

| Field | Value |
|---|---|
| Package | `lucide-static@1.54.0` |
| Why this release | npm `dist-tags.latest` on 2026-10-09; GitHub release [`1.54.0`](https://github.com/lucide-icons/lucide/releases/tag/1.54.0) published 2026-10-09T06:08:14Z, `isDraft:false`, `isPrerelease:false` |
| Tarball | `https://registry.npmjs.org/lucide-static/-/lucide-static-1.54.0.tgz` |
| SHA-1 (`dist.shasum`, checked locally with `shasum`) | `3addc8999298b41f788f3b15cf8042a4607293c6` |
| `dist.integrity` | `sha512-Y0NVQ7uX17m+Jee/coLs7uxGF3bEyWHXiXFBXxmE7BnjjMa5o0s1gR4zQHBQHN19RYaQWVG2cx4GdrW/WroyrA==` |
| Licence | `LICENSE-lucide.txt`, a byte copy of the release's `LICENSE` |

**What the licence covers**

- **ISC** © Lucide Icons and Contributors, for the set as a whole.
- **MIT** © Cole Bemis, for the Feather-derived icons it lists.
- Both notices must travel with any copy of the glyphs.

**Nothing is vendored into the site by this PR.** C1 builds `FD/fd_icons.js` from the release. When it does, it will:

- carry this version string;
- carry the licence;
- copy each glyph's SVG child elements **verbatim**: no arc conversion, no merging into one path.

## Re-verify

```sh
npm view lucide-static@1.54.0 dist.shasum dist.integrity    # must match the table
npm pack lucide-static@1.54.0 && shasum lucide-static-1.54.0.tgz
tar -xzf lucide-static-1.54.0.tgz && cmp package/LICENSE LICENSE-lucide.txt
```

## Site A subset (C1 input)

The registry names follow the bundle (`icons/SOURCES.md`), adjusted by N6 and N7 (§ decision log in `README.md`):

- `teaching` (presentation) is dropped.
- `bookList` uses `library-big`.
- `library` uses Lucide `library`.
- `reference` (`file-text`) is added.
- `video` is dropped.

Bytes are the minified inner markup (child elements only) from `icons/<upstream>.svg` in the release. "Feather" marks the icons on the MIT list in the licence.

| Registry name | Upstream (`lucide-static@1.54.0`) | Feather (MIT) | Bytes | Used in |
|---|---|---|---|---|
| today | sun | | 241 | W1 |
| path | route | | 124 | W1 |
| library | library | | 80 | W1 (N7) |
| care | hand-heart | | 343 | W1 |
| ask | message-circle-question | | 205 | W1 (N1) |
| settings | settings-2 | | 100 | W1 |
| chevronRight | chevron-right | ✓ | 25 | W2 |
| chevronLeft | chevron-left | ✓ | 26 | W3 |
| chevronDown | chevron-down | ✓ | 24 | W2 |
| arrowRight | arrow-right | ✓ | 45 | W2 |
| external | external-link | ✓ | 112 | W2 (N6) |
| plus | plus | ✓ | 40 | — |
| check | check | ✓ | 27 | — |
| close | x | ✓ | 44 | — |
| filter | list-filter | | 58 | — |
| thisWeek | calendar | ✓ | 105 | W2 |
| startHere | flag | | 158 | W2 |
| pocketCard | wallet-cards | | 155 | W2 |
| diagnoses | brain | | 361 | W2 |
| medication | pill | | 100 | W2 |
| family | users | | 159 | W2 |
| exam | clipboard-check | | 163 | W2 |
| tool | wrench | | 205 | W2 |
| systems | network | | 217 | W2 |
| scholarship | pen-line | | 160 | W2 |
| skills | messages-square | | 241 | W2 |
| evidence | graduation-cap | | 192 | W2 |
| reading | book-open | | 171 | W2 |
| deck | layers | | 290 | W2 |
| podcast | headphones | ✓ | 135 | W2 |
| bookList | library-big | | 189 | W2 (N7) |
| caseVignette | user-round | | 63 | W2 |
| journey | footprints | | 296 | W4 |
| reference | file-text | | 216 | W2 (N3) |
| **Total** | **34 Lucide glyphs** | 10 | **5,070** | |

**Not from Lucide**

| Glyph | Source |
|---|---|
| `safety` | Custom ✚, two strokes at 1.75× weight. It may also stay the existing text glyph ✚ (D7) |
| `search` | The existing shell magnifier, already inline three times (A10/A26/A62); C1 dedupes it |

C1 ships only the glyphs that W1–W3 consume. Unused rows stay out until a phase needs them.
