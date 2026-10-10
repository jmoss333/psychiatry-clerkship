#!/usr/bin/env python3
"""Rebuild the vendored Lucide subset (lucide-static-1.54.0.icons.json) from the npm release.

The site never fetches Lucide: the glyphs the Front Door may draw are checked in here as data,
copied from ONE pinned release, and the build turns them into an inline <symbol> sprite
(../icon_sprite.py). This script is the only thing that writes the JSON, so the provenance is a
command anyone can re-run rather than a claim:

    D=$(mktemp -d) && (cd "$D" && npm pack lucide-static@1.54.0 && tar -xzf lucide-static-1.54.0.tgz)
    shasum "$D/lucide-static-1.54.0.tgz"    # must equal PIN["shasum"] below
    python3 lucide_subset.py --package-dir "$D/package"            # re-extract the current names
    python3 lucide_subset.py --package-dir "$D/package" --add clock # add a glyph

Rules it enforces (docs/superpowers/specs/icon-nav-handoff/LUCIDE-PIN.md, errata 1):
  * every glyph comes from icons/<name>.svg of the pinned release, and that file's own licence
    comment must name the pinned version;
  * the root <svg> must carry Lucide's standard presentation attributes and nothing else, so the
    sprite can drop them and the consumer's <svg> can restate them once;
  * the child elements are copied VERBATIM: only the source file's indentation, newlines and the
    space before "/>" are removed. No arc conversion, no compound path, no attribute rewrite;
  * the release's LICENSE must be byte-identical to the vendored lucide-static-1.54.0.LICENSE.

Feather (MIT) marking: a glyph is Feather-derived when the LICENSE lists its name, or when the
LICENSE lists an older name that the release still ships as an alias file with identical
drawing (circle-alert is listed as alert-circle).

Stdlib only. Report-free: prints what it wrote, exits non-zero on any rule it cannot satisfy.
"""
import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
JSON_PATH = os.path.join(HERE, "lucide-static-1.54.0.icons.json")
LICENSE_PATH = os.path.join(HERE, "lucide-static-1.54.0.LICENSE")

PIN = {
    "package": "lucide-static",
    "version": "1.54.0",
    "tarball": "https://registry.npmjs.org/lucide-static/-/lucide-static-1.54.0.tgz",
    "shasum": "3addc8999298b41f788f3b15cf8042a4607293c6",
    "integrity": "sha512-Y0NVQ7uX17m+Jee/coLs7uxGF3bEyWHXiXFBXxmE7BnjjMa5o0s1gR4zQHBQHN19RYaQWVG2cx4GdrW/WroyrA==",
}

ROOT_ATTRS = {
    "xmlns": "http://www.w3.org/2000/svg",
    "width": "24",
    "height": "24",
    "viewBox": "0 0 24 24",
    "fill": "none",
    "stroke": "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
}

NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
ATTR_RE = re.compile(r'([a-zA-Z:-]+)="([^"]*)"')
ALLOWED_CHILD_RE = re.compile(r"^<(path|circle|rect|line|polyline|polygon|ellipse)\s[^<>]*/>$")


class SubsetError(Exception):
    pass


def read_glyph(package_dir, name):
    """Return the minified child markup of icons/<name>.svg, enforcing the rules above."""
    if not NAME_RE.match(name):
        raise SubsetError("not a Lucide icon name: %r" % name)
    path = os.path.join(package_dir, "icons", name + ".svg")
    if not os.path.isfile(path):
        raise SubsetError("no icons/%s.svg in the package" % name)
    text = open(path, encoding="utf-8").read()
    header = "<!-- @license %s v%s - ISC -->" % (PIN["package"], PIN["version"])
    if not text.startswith(header + "\n"):
        raise SubsetError("%s: licence comment does not name %s" % (name, header))
    m = re.search(r"<svg\b([^>]*)>(.*)</svg>\s*$", text, re.S)
    if not m:
        raise SubsetError("%s: no root <svg>" % name)
    attrs = dict(ATTR_RE.findall(m.group(1)))
    cls = attrs.pop("class", "")
    if cls.split() != ["lucide", "lucide-" + name]:
        raise SubsetError("%s: unexpected class %r" % (name, cls))
    if attrs != ROOT_ATTRS:
        raise SubsetError("%s: root attributes differ from Lucide's standard set: %r" % (name, attrs))
    children = []
    for line in m.group(2).split("\n"):
        line = line.strip()
        if not line:
            continue
        if line.endswith(" />"):
            line = line[:-3] + "/>"
        if not ALLOWED_CHILD_RE.match(line):
            raise SubsetError("%s: child element is not a single self-closed shape: %r" % (name, line))
        children.append(line)
    if not children:
        raise SubsetError("%s: no child elements" % name)
    return "".join(children)


def feather_names(license_text):
    m = re.search(r"derived from the Feather project:\n\n(.*?)\n\n", license_text, re.S)
    if not m:
        raise SubsetError("LICENSE: Feather list not found")
    return [n.strip() for n in m.group(1).split(",") if n.strip()]


def is_feather(package_dir, name, body, listed):
    if name in listed:
        return True
    for old in listed:
        try:
            if read_glyph_alias(package_dir, old) == body:
                return True
        except SubsetError:
            continue
    return False


def read_glyph_alias(package_dir, name):
    """Alias files carry the alias's own class; read them with the same rules otherwise."""
    path = os.path.join(package_dir, "icons", name + ".svg")
    if not os.path.isfile(path):
        raise SubsetError("no alias file")
    text = open(path, encoding="utf-8").read()
    m = re.search(r"<svg\b[^>]*>(.*)</svg>\s*$", text, re.S)
    if not m:
        raise SubsetError("no root <svg>")
    out = []
    for line in m.group(1).split("\n"):
        line = line.strip()
        if line.endswith(" />"):
            line = line[:-3] + "/>"
        if line:
            out.append(line)
    return "".join(out)


def build(package_dir, names):
    pkg = json.load(open(os.path.join(package_dir, "package.json"), encoding="utf-8"))
    if pkg.get("name") != PIN["package"] or pkg.get("version") != PIN["version"]:
        raise SubsetError("package.json is %s@%s, pin is %s@%s"
                          % (pkg.get("name"), pkg.get("version"), PIN["package"], PIN["version"]))
    license_bytes = open(os.path.join(package_dir, "LICENSE"), "rb").read()
    if open(LICENSE_PATH, "rb").read() != license_bytes:
        raise SubsetError("the release LICENSE differs from the vendored lucide-static-1.54.0.LICENSE")
    listed = feather_names(license_bytes.decode("utf-8"))
    icons = {}
    for name in sorted(set(names)):
        body = read_glyph(package_dir, name)
        icons[name] = {"body": body, "feather": is_feather(package_dir, name, body, listed)}
    return {
        "_note": ("Generated by lucide_subset.py from the pinned npm release. Do not edit by hand: "
                  "re-run the script (see its docstring). 'body' is the glyph's child elements "
                  "copied verbatim; the root <svg> attributes are Lucide's standard set and are "
                  "restated once by fdIcon(). Licence: lucide-static-1.54.0.LICENSE (ISC; MIT for "
                  "the glyphs marked feather=true)."),
        "source": dict(PIN),
        "license": {"file": "lucide-static-1.54.0.LICENSE", "spdx": "ISC AND MIT"},
        "svg": {"viewBox": ROOT_ATTRS["viewBox"], "fill": ROOT_ATTRS["fill"],
                "stroke": ROOT_ATTRS["stroke"], "stroke-width": ROOT_ATTRS["stroke-width"],
                "stroke-linecap": ROOT_ATTRS["stroke-linecap"],
                "stroke-linejoin": ROOT_ATTRS["stroke-linejoin"]},
        "icons": icons,
    }


def serialize(data):
    return json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--package-dir", required=True, help="the extracted npm tarball's package/ dir")
    ap.add_argument("--add", action="append", default=[], help="Lucide name to add (repeatable)")
    ap.add_argument("--remove", action="append", default=[], help="Lucide name to drop (repeatable)")
    ap.add_argument("--check", action="store_true", help="exit 1 if the JSON would change; write nothing")
    args = ap.parse_args(argv)
    current = json.load(open(JSON_PATH, encoding="utf-8")) if os.path.exists(JSON_PATH) else {"icons": {}}
    names = (set(current.get("icons", {})) | set(args.add)) - set(args.remove)
    try:
        out = serialize(build(args.package_dir, names))
    except SubsetError as error:
        print("lucide_subset: %s" % error, file=sys.stderr)
        return 2
    existing = open(JSON_PATH, encoding="utf-8").read() if os.path.exists(JSON_PATH) else ""
    if args.check:
        print("lucide_subset: %s" % ("up to date" if out == existing else "WOULD CHANGE"))
        return 0 if out == existing else 1
    if out != existing:
        open(JSON_PATH, "w", encoding="utf-8").write(out)
    print("lucide_subset: %d glyph(s) from %s@%s -> %s"
          % (len(names), PIN["package"], PIN["version"], os.path.basename(JSON_PATH)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
