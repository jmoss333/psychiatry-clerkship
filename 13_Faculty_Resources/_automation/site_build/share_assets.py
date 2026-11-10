"""Link-preview card, home-screen icon and web manifest for both learner sites.

Why: a link to either site texted or pasted into chat unfurled as a blank card, and "Add to
Home Screen" produced a generic letter tile, although the offline shell (sw.js) already made the
site usable as an installed app. This module is the one place that knows the share surface:

  * copies the committed PNGs under ``brand/`` into the build root;
  * writes ``site.webmanifest``;
  * injects ONE marked block of <meta>/<link> tags into the shell index.

The ms3 build calls ``install(out, "ms3")``; the resident build starts as a copy of the ms3 tree
and calls ``install(out, "res")``, which REPLACES the marked block and the files, so a resident
site can never ship the MS3 card (the same fail-closed posture as the resident rebrand).

og:image must be an absolute URL (link unfurlers do not resolve relative ones), so each site's
production origin is named here. On a deploy preview the tag therefore points at production's
copy of the card; that is deliberate, not a bug.

The PNGs are generated once and committed (render recipe: ``brand/README.md``); nothing here
draws pixels, so the build gains no dependency.
"""
import json
import os
import re
import shutil
import struct

HERE = os.path.dirname(os.path.abspath(__file__))
BRAND = os.path.join(HERE, "brand")

THEME_COLOR = "#3a7d6e"       # --fd-teal (light)
BACKGROUND_COLOR = "#f6f3ee"  # --fd-bg (light)

SITES = {
    "ms3": {
        "origin": "https://une-ms3-psychiatry.netlify.app",
        "name": "Inpatient Psychiatry — MS3 Clerkship",
        "short_name": "Psychiatry",
        "description": "A private learning hub for the third-year inpatient psychiatry clerkship.",
        "card": "og-ms3.png",
    },
    "res": {
        "origin": "https://mmc-psychiatry-residents-sanford.netlify.app",
        "name": "Inpatient Psychiatry — Resident Rotation",
        "short_name": "MMC Psychiatry",
        "description": "A private learning hub for the MMC general-psychiatry resident inpatient rotation (Sanford BHU).",
        "card": "og-res.png",
    },
}

# name in the build root -> (source under brand/, required pixel size)
ICONS = {
    "apple-touch-icon.png": ("apple-touch-icon.png", (180, 180)),
    "icon-192.png": ("icon-192.png", (192, 192)),
    "icon-512.png": ("icon-512.png", (512, 512)),
}
CARD_NAME = "og-card.png"
CARD_SIZE = (1200, 630)
MANIFEST_NAME = "site.webmanifest"

BLOCK_START = "<!--share-meta-->"
BLOCK_END = "<!--/share-meta-->"
_BLOCK_RE = re.compile(re.escape(BLOCK_START) + r".*?" + re.escape(BLOCK_END), re.DOTALL)
_ANCHOR_RE = re.compile(r'<meta name="description" content="[^"]*">')


def png_size(path):
    """(width, height) from a PNG's IHDR; raises ValueError on anything that is not a PNG."""
    with open(path, "rb") as fh:
        head = fh.read(24)
    if len(head) < 24 or head[:8] != b"\x89PNG\r\n\x1a\n" or head[12:16] != b"IHDR":
        raise ValueError("not a PNG: %s" % path)
    return struct.unpack(">II", head[16:24])


def _esc(text):
    return (text.replace("&", "&amp;").replace('"', "&quot;")
            .replace("<", "&lt;").replace(">", "&gt;"))


def meta_block(site):
    cfg = SITES[site]
    card = "%s/%s" % (cfg["origin"], CARD_NAME)
    lines = [
        BLOCK_START,
        '<meta property="og:type" content="website">',
        '<meta property="og:title" content="%s">' % _esc(cfg["name"]),
        '<meta property="og:description" content="%s">' % _esc(cfg["description"]),
        '<meta property="og:url" content="%s/">' % cfg["origin"],
        '<meta property="og:image" content="%s">' % card,
        '<meta property="og:image:width" content="%d">' % CARD_SIZE[0],
        '<meta property="og:image:height" content="%d">' % CARD_SIZE[1],
        '<meta property="og:image:alt" content="%s">' % _esc(cfg["name"]),
        '<meta name="twitter:card" content="summary_large_image">',
        '<meta name="theme-color" content="%s">' % THEME_COLOR,
        '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
        '<link rel="manifest" href="/%s">' % MANIFEST_NAME,
        BLOCK_END,
    ]
    return "\n".join(lines)


def manifest(site):
    cfg = SITES[site]
    return {
        "name": cfg["name"],
        "short_name": cfg["short_name"],
        "description": cfg["description"],
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "background_color": BACKGROUND_COLOR,
        "theme_color": THEME_COLOR,
        "icons": [
            {"src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
            {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
        ],
    }


def inject(text, site):
    """Return the index HTML with exactly one share block for `site`. Idempotent; replaces
    another site's block. Raises if there is nowhere to put it — a silent no-op here is how a
    site ships with no card and nobody notices."""
    block = meta_block(site)
    found = _BLOCK_RE.findall(text)
    if len(found) > 1:
        raise SystemExit("share_assets: %d share-meta blocks in the index; expected at most 1" % len(found))
    if found:
        return _BLOCK_RE.sub(lambda _m: block, text, count=1)
    anchors = _ANCHOR_RE.findall(text)
    if len(anchors) != 1:
        raise SystemExit(
            "share_assets: expected exactly one <meta name=\"description\"> in the shell index "
            "to anchor the share block; found %d" % len(anchors))
    return _ANCHOR_RE.sub(lambda m: m.group(0) + "\n" + block, text, count=1)


def install(out_dir, site):
    if site not in SITES:
        raise SystemExit("share_assets: unknown site %r" % (site,))
    for dest, (src, size) in ICONS.items():
        path = os.path.join(BRAND, src)
        if png_size(path) != size:
            raise SystemExit("share_assets: %s is %r, expected %r" % (src, png_size(path), size))
        shutil.copyfile(path, os.path.join(out_dir, dest))
    card = os.path.join(BRAND, SITES[site]["card"])
    if png_size(card) != CARD_SIZE:
        raise SystemExit("share_assets: %s is %r, expected %r" % (card, png_size(card), CARD_SIZE))
    shutil.copyfile(card, os.path.join(out_dir, CARD_NAME))
    with open(os.path.join(out_dir, MANIFEST_NAME), "w", encoding="utf-8") as fh:
        json.dump(manifest(site), fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    index = os.path.join(out_dir, "index.html")
    with open(index, encoding="utf-8") as fh:
        before = fh.read()
    after = inject(before, site)
    if after.count(BLOCK_START) != 1 or SITES[site]["origin"] not in after:
        raise SystemExit("share_assets: share block for %s did not land in %s" % (site, index))
    other = [s for s in SITES if s != site]
    for s in other:
        if SITES[s]["origin"] + "/" + CARD_NAME in after:
            raise SystemExit("share_assets: %s index still carries the %s card URL" % (site, s))
    if after != before:
        with open(index, "w", encoding="utf-8") as fh:
            fh.write(after)
    return len(ICONS) + 2
