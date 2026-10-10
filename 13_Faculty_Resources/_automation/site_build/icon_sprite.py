#!/usr/bin/env python3
"""Front Door icon sprite: vendored Lucide subset -> one hidden inline <svg> of <symbol>s.

Input is vendor/lucide-static-1.54.0.icons.json (written only by vendor/lucide_subset.py). Output
is a single `<svg id="fd-icon-sprite">` holding one `<symbol id="ic-<lucide-name>">` per glyph,
which build_deploy.py injects into the shell index in place of the SPRITE_MARKER comment. The
resident build inherits it (it rebrands the MS3-built index.html), and common.page_contract_failures()
requires exactly one sprite in each shipped index.

Consumers never touch the sprite directly: frontdoor/fd_icons.js `fdIcon(name, opts)` returns
`<svg ...><use href="#ic-NAME"></use></svg>`, restating Lucide's root presentation attributes
(fill/stroke/width/caps/joins) on the outer <svg> so CSS can still change them per use. The
symbols therefore carry only `viewBox` and the verbatim child elements.

Visible-neutral by construction: the sprite is aria-hidden, unfocusable, absolutely positioned at
0x0 with overflow hidden, so it adds no box to the layout and nothing to the accessibility tree.
Nothing in C1 references a symbol yet.

Deterministic: symbols are emitted in sorted name order from sorted JSON, with no timestamp, so
the same JSON always yields the same bytes (pinned by tests/fd-icon-sprite.test.mjs).

    python3 icon_sprite.py            # print the sprite
    python3 icon_sprite.py --sha256   # print its sha256 (what the test pins)
"""
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ICONS_JSON = os.path.join(HERE, "vendor", "lucide-static-1.54.0.icons.json")

SPRITE_MARKER = "<!--fd-icon-sprite-->"
SPRITE_ID = "fd-icon-sprite"
SYMBOL_PREFIX = "ic-"

_NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_BODY_RE = re.compile(r"^(?:<(?:path|circle|rect|line|polyline|polygon|ellipse)\s[^<>]*/>)+$")

# The licence notices, carried inside the sprite so they travel with every shipped copy of the
# glyphs (LUCIDE-PIN.md: "Both notices must travel with any copy"). Text is the two notices from
# vendor/lucide-static-1.54.0.LICENSE verbatim; the file's "---" separator and the full Feather
# name list are left out because "--" may not appear inside an HTML comment. The Feather glyphs
# actually present are named instead.
_ISC = (
    "ISC License\n\n"
    "Copyright (c) 2026 Lucide Icons and Contributors\n\n"
    "Permission to use, copy, modify, and/or distribute this software for any\n"
    "purpose with or without fee is hereby granted, provided that the above\n"
    "copyright notice and this permission notice appear in all copies.\n\n"
    "THE SOFTWARE IS PROVIDED \"AS IS\" AND THE AUTHOR DISCLAIMS ALL WARRANTIES\n"
    "WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF\n"
    "MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR\n"
    "ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES\n"
    "WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN\n"
    "ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF\n"
    "OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE."
)
_MIT = (
    "The MIT License (MIT) (for the icons listed above)\n\n"
    "Copyright (c) 2013-present Cole Bemis\n\n"
    "Permission is hereby granted, free of charge, to any person obtaining a copy\n"
    "of this software and associated documentation files (the \"Software\"), to deal\n"
    "in the Software without restriction, including without limitation the rights\n"
    "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n"
    "copies of the Software, and to permit persons to whom the Software is\n"
    "furnished to do so, subject to the following conditions:\n\n"
    "The above copyright notice and this permission notice shall be included in all\n"
    "copies or substantial portions of the Software.\n\n"
    "THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n"
    "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n"
    "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n"
    "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n"
    "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n"
    "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n"
    "SOFTWARE."
)


class SpriteError(ValueError):
    pass


def load_icons(path=ICONS_JSON):
    return json.load(open(path, encoding="utf-8"))


def render_sprite(data):
    """Return the sprite markup for a loaded icons JSON. Pure and deterministic."""
    source = data.get("source") or {}
    icons = data.get("icons")
    if not isinstance(icons, dict) or not icons:
        raise SpriteError("icons JSON has no icons")
    if source.get("package") != "lucide-static" or not source.get("version"):
        raise SpriteError("icons JSON does not name its lucide-static release")
    view_box = (data.get("svg") or {}).get("viewBox")
    if view_box != "0 0 24 24":
        raise SpriteError("unexpected viewBox %r" % view_box)
    symbols = []
    feather = []
    for name in sorted(icons):
        entry = icons[name]
        body = entry.get("body") if isinstance(entry, dict) else None
        if not _NAME_RE.match(name):
            raise SpriteError("bad icon name %r" % name)
        if not isinstance(body, str) or not _BODY_RE.match(body):
            raise SpriteError("icon %r body is not a run of self-closed shapes" % name)
        if entry.get("feather"):
            feather.append(name)
        symbols.append('<symbol id="%s%s" viewBox="%s">%s</symbol>' % (SYMBOL_PREFIX, name, view_box, body))
    notice = (
        "Icons: %s@%s (%s). Glyphs copied verbatim; see "
        "13_Faculty_Resources/_automation/site_build/vendor/.\n\n%s\n\n"
        "Feather-derived icons in this sprite (MIT, below): %s\n\n%s"
        % (source["package"], source["version"], source.get("tarball", ""), _ISC,
           ", ".join(feather) or "none", _MIT)
    )
    if "--" in notice.replace("2013-present", ""):
        raise SpriteError("licence notice would contain '--' inside an HTML comment")
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" id="%s" aria-hidden="true" focusable="false" '
        'width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden">'
        "<!--\n%s\n-->%s</svg>" % (SPRITE_ID, notice, "".join(symbols))
    )


def sprite_sha256(data=None):
    return hashlib.sha256(render_sprite(data or load_icons()).encode("utf-8")).hexdigest()


def inject_sprite_text(html, sprite):
    """Replace the one SPRITE_MARKER with the sprite. Exactly one marker, else SpriteError."""
    n = html.count(SPRITE_MARKER)
    if n != 1:
        raise SpriteError("expected exactly one %s in the shell, found %d" % (SPRITE_MARKER, n))
    if ('id="%s"' % SPRITE_ID) in html:
        raise SpriteError("the shell already carries a sprite")
    return html.replace(SPRITE_MARKER, sprite, 1)


def inject_sprite_file(path, label="shell index"):
    """Verified, build-aborting injection into a built index.html."""
    try:
        html = open(path, encoding="utf-8").read()
        out = inject_sprite_text(html, render_sprite(load_icons()))
    except (OSError, ValueError) as error:
        print("BUILD ABORTED — icon sprite (%s): %s" % (label, error))
        raise SystemExit(1)
    open(path, "w", encoding="utf-8").write(out)
    return len(load_icons()["icons"])


if __name__ == "__main__":
    if "--sha256" in sys.argv[1:]:
        print(sprite_sha256())
    else:
        sys.stdout.write(render_sprite(load_icons()))
