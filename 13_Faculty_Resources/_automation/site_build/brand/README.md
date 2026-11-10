# brand/ — share and home-screen images

Committed PNGs that `share_assets.py` copies into both builds. Nothing draws them at build time.

| File | Size | Used as |
|---|---|---|
| `apple-touch-icon.png` | 180×180 | iOS "Add to Home Screen" |
| `icon-192.png`, `icon-512.png` | 192, 512 | `site.webmanifest` icons (maskable-safe: glyph inside the centre 60%) |
| `og-ms3.png`, `og-res.png` | 1200×630 | link-preview card, shipped as `/og-card.png` |

Colours are the light Front Door tokens: teal `#3a7d6e` (`--fd-teal`), ground `#f6f3ee`
(`--fd-bg`), ink `#3b332c` (`--fd-text`). The card title is Source Serif 4 (`../fonts/`).

To change one: render the replacement at exactly the size above (headless Chromium screenshot of
a small HTML page is how these were made, 2026-11-09), overwrite the file, and rebuild.
`share_assets.install()` refuses a PNG of the wrong pixel size.
