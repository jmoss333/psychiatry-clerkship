#!/usr/bin/env python3
"""Design-system drift gate — the dimension half of what clinical-warm.css already does for colour.

WHY THIS EXISTS
---------------
frontdoor.css has carried a "no raw colour" rule since it was written, and it works: the file
contains 0 colour literals against 500+ var(--fd-*) references. Nothing equivalent guarded any
OTHER visual dimension, and the result was measurable — one stylesheet with 26 distinct
font-sizes, 16 radii, 22 gap values and 69 padding values, plus a second (spa_index.html) using
rem where the first uses px. clinical-warm.css now declares a dimension token layer; this script
is the mechanism that makes it stick, exactly the way the colour rule stuck.

It also carries four HARD checks that are not ratchets, because each one encodes a defect that
actually shipped to learners:

  C1 ROLE RULE          A fill token (--fd-terracotta / --fd-teal / --fd-olive) must never be set
                        as `color:`. Painting a 3:1 fill colour as text is where the light
                        palette's entire inherited contrast debt came from.
  C2 NO RAW COLOUR      frontdoor.css keeps its zero-literal property.
  C3 THEME-INVARIANCE   A dimension token must never be redeclared in a dark block. Spacing does
                        not have a dark value; a "dark" one means someone smuggled colour in.
  C4 DARK ORPHANS       *** the P0 this script was written for ***
                        Any colour-valued custom property a page declares in :root AND consumes
                        via var() must have a dark counterpart. On 2026-09-10 five shipped tool
                        pages failed this: they declare a PRIVATE palette (--ink, --muted,
                        --line, --terracotta, ...), link clinical-warm.css so --bg/--surface DO
                        flip to dark, and leave their own ink near-black. Measured live on
                        production: family-systems.html 56 text elements below AA at 1.06:1,
                        one-patient-six-weeks.html 31 at 1.06:1, rotation-curator.html 21 at
                        1.57:1. Nothing in CI could see it, because every unit test and both
                        contrast gates read the --fd-* palette, which was fine.

WHAT IT DELIBERATELY DOES NOT DO
--------------------------------
Contrast ratios. tests/fd-contrast.test.mjs owns those and owns them well (it parses the shipped
CSS rather than asserting literals, and it fails when a pinned exception starts PASSING so the
allowlist cannot absorb a regression). Duplicating it here would create two sources of truth for
the same number. This script asserts only that its LIGHT_DEBT allowlist is still empty.

RATCHETS
--------
R1-R4 compare against design_drift_baseline.json. Counts may go DOWN freely; going UP fails.
`--update-baseline` rewrites the pins and is meant for a reviewed reduction, not for silencing a
regression — the diff is in the PR.

Exit 0 clean, 1 on any failure. Registry-driven: the tool list comes from shipped_pages.json
(ADR-002), so a new tool is covered the moment it ships and drops out when it stops, with no
edit here.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "13_Faculty_Resources", "_automation", "site_build")
WARM = os.path.join(BUILD, "clinical-warm.css")
FRONTDOOR = os.path.join(BUILD, "frontdoor", "frontdoor.css")
SPA = os.path.join(BUILD, "spa_index.html")
BASELINE = os.path.join(BUILD, "design_drift_baseline.json")
CONTRAST_TEST = os.path.join(ROOT, "tests", "fd-contrast.test.mjs")

# Fill/border tokens. Their ink counterparts are the -dark / -deep variants.
FILL_ONLY = ("fd-terracotta", "fd-teal", "fd-olive")
# Theme-invariant token families declared in the :root dimension layer.
# NOTE the namespace split: --fd-text-* is COLOUR (text, text-mid, text-dim); font SIZE is
# --fd-font-*. Listing "fd-text-" here would make C3 fire on the colour tokens.
DIMENSION_PREFIXES = ("fd-space-", "fd-font-", "fd-radius-", "fd-dur-", "fd-ease-",
                      "fd-leading-", "fd-target-")
ALLOWED_BREAKPOINTS = {430, 640, 1000}
TYPE_FLOOR_PX = 11.0

# A colour VALUE for the orphan check: color-mix() counts, because a mix of two light
# tokens is still a light colour unless its inputs flip.
COLOUR_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\bcolor-mix\(")
# A raw colour LITERAL for C2: color-mix(in srgb, var(--fd-teal) ...) is a derivation from a
# token, which frontdoor.css's own header explicitly permits, so it is not a literal.
LITERAL_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(")
DECL_RE = re.compile(r"--([A-Za-z0-9_-]+)\s*:\s*([^;}]+)")
STRIP_COMMENTS = re.compile(r"/\*.*?\*/", re.S)


# ---------------------------------------------------------------- helpers

def read(path: str) -> str:
    with open(path, encoding="utf-8", errors="replace") as fh:
        return fh.read()


def css_of(text: str, path: str) -> str:
    """Return the CSS in a file: the whole file for .css, every <style> for .html."""
    if path.endswith(".css"):
        return STRIP_COMMENTS.sub("", text)
    return STRIP_COMMENTS.sub("", "\n".join(re.findall(r"<style[^>]*>(.*?)</style>", text, re.S)))


def blocks(css: str, opener: re.Pattern) -> list[str]:
    """Brace-matched bodies of every rule whose selector matches `opener`."""
    out = []
    for m in opener.finditer(css):
        i, depth = m.end(), 1
        while i < len(css) and depth:
            if css[i] == "{":
                depth += 1
            elif css[i] == "}":
                depth -= 1
            i += 1
        out.append(css[m.end():i - 1])
    return out


ROOT_OPEN = re.compile(r"(?<![\w\]\-]):root\s*\{")
DARK_OPEN = re.compile(r"\[data-theme=[\"']dark[\"']\][^{;]*\{")
SCHEME_OPEN = re.compile(r"@media[^{]*prefers-color-scheme\s*:\s*dark[^{]*\{")


def declared(css: str, opener: re.Pattern) -> dict[str, str]:
    out: dict[str, str] = {}
    for body in blocks(css, opener):
        for name, value in DECL_RE.findall(body):
            out[name] = value.strip()
    return out


def dark_names(css: str) -> set[str]:
    names = set(declared(css, DARK_OPEN))
    for body in blocks(css, SCHEME_OPEN):
        names |= {n for n, _ in DECL_RE.findall(body)}
    return names


def tool_sources() -> list[tuple[str, str]]:
    """(slug, absolute source path) for every shipped tool page.

    Reads shipped_pages.json through shipped_pages.load_shipped_pages(), per ADR-002 — that
    file is THE answer to "what ships", and going around it to site_manifest.json is the
    defect tests/shipped-pages-readers.test.mjs exists to catch. It also means a tool that
    stops shipping stops being gated here on the same commit, with no edit.
    """
    sys.path.insert(0, BUILD)
    import shipped_pages  # noqa: E402  (path is set immediately above)

    out = []
    for page in shipped_pages.load_shipped_pages(ROOT)["pages"]:
        if page.get("kind") != "tool":
            continue
        source = page.get("source")
        if not source or not source.endswith(".html"):
            continue
        path = os.path.join(ROOT, source)
        if os.path.exists(path):
            out.append((page["slug"], path))
    return sorted(set(out))


def surfaces() -> list[tuple[str, str]]:
    """Authoring surfaces — where a human edits CSS. C1/C2/C3 read these, because that is where
    the fix belongs and where a line number is meaningful."""
    out = [("clinical-warm.css", WARM), ("frontdoor.css", FRONTDOOR), ("spa_index.html", SPA)]
    out += [("tools/" + name, path) for name, path in tool_sources()]
    return [(label, path) for label, path in out if os.path.exists(path)]


BUILD_DIRS = [("ms3", os.path.join(ROOT, "_build", "ms3")),
              ("res", os.path.join(ROOT, "_build", "res"))]


def shipped() -> list[tuple[str, str]]:
    """SHIPPED pages — what a learner's browser actually parses. C4 reads these, not the sources.

    This distinction is the whole reason the 2026-09-10 P0 survived a repo full of green tests:
    the dark-mode stylesheet is INJECTED at build time (common.py polish_html links
    clinical-warm.css into any page that does not already ship a dark block). A tool's SOURCE
    therefore looks self-consistently light and passes every source-level check, while the page
    that ships flips --bg and --surface to dark and leaves the page's private --ink near-black.
    Auditing sources cannot see that; auditing the build can. Same principle as ADR-002.
    """
    out = []
    for site, base in BUILD_DIRS:
        if not os.path.isdir(base):
            continue
        index = os.path.join(base, "index.html")
        if os.path.exists(index):
            out.append((f"{site}:index.html", index))
        tools = os.path.join(base, "tools")
        if os.path.isdir(tools):
            for name in sorted(os.listdir(tools)):
                if name.endswith(".html"):
                    out.append((f"{site}:tools/{name}", os.path.join(tools, name)))
    return out


# ---------------------------------------------------------------- hard checks

# The negative lookbehind is the whole point: `border-color`, `background-color`,
# `outline-color` and `-webkit-text-fill-color` are legitimate uses of a fill token and must
# not be flagged. --self-test pins that.
ROLE_RE = re.compile(r"(?<![-\w])color\s*:\s*var\(\s*--(" + "|".join(FILL_ONLY) + r")\s*\)")
INK_OF = {"fd-terracotta": "fd-terracotta-dark", "fd-teal": "fd-teal-deep", "fd-olive": "fd-olive-deep"}


def role_violations(css: str) -> list[tuple[str, int]]:
    """(fill token, 1-based line) for every fill token painted as text."""
    return [(m.group(1), css[:m.start()].count("\n") + 1) for m in ROLE_RE.finditer(css)]


def c1_role_rule(fails: list[str]) -> None:
    for label, path in surfaces():
        for token, line in role_violations(css_of(read(path), path)):
            fails.append(
                f"C1 ROLE  {label}: `color:var(--{token})` near line {line} of its CSS. "
                f"Fill tokens are gated at 3:1 (non-text); use --{INK_OF[token]} for ink."
            )


def colour_literals(css: str) -> list[str]:
    return LITERAL_RE.findall(css)


def c2_no_raw_colour(fails: list[str]) -> None:
    css = css_of(read(FRONTDOOR), FRONTDOOR)
    literals = colour_literals(css)
    if literals:
        fails.append(
            f"C2 RAW COLOUR  frontdoor.css must contain no colour literal of its own; found "
            f"{len(literals)} (e.g. {', '.join(sorted(set(literals))[:5])}). Add a token to "
            f"clinical-warm.css, which carries a light AND a dark value for every colour."
        )


def invariance_violations(css: str) -> list[str]:
    return sorted(n for n in dark_names(css) if n.startswith(DIMENSION_PREFIXES))


def c3_theme_invariance(fails: list[str]) -> None:
    for label, path in surfaces():
        css = css_of(read(path), path)
        for name in invariance_violations(css):
            fails.append(
                f"C3 THEME-INVARIANCE  {label}: --{name} is redeclared in a dark block. "
                f"Spacing, type, radius and motion have no dark value by contract."
            )


def _flips(name: str, value: str, dark: set[str], light: dict[str, str]) -> bool:
    """Safe if the token itself is overridden in dark, or if its value is derived purely from
    other tokens that are (an alias, or a color-mix of them) — those follow the theme for free."""
    if name in dark:
        return True
    refs = re.findall(r"var\(\s*--([A-Za-z0-9_-]+)", value)
    if refs and not LITERAL_RE.search(re.sub(r"var\([^)]*\)", "", value)):
        return all(r in dark for r in refs)
    return False


def dark_orphans(page_text: str, shared_dark: set[str]) -> list[str]:
    """Colour tokens a page declares in :root, consumes, and never gives a dark value.

    A page is at risk only if something actually flips its ground. If it neither links the
    shared palette nor ships a dark block, its light tokens are the only tokens and there is
    nothing to be inconsistent with — so an unthemed page returns [].
    """
    css = css_of(page_text, ".html")
    if not (("clinical-warm.css" in page_text) or dark_names(css)):
        return []
    light = declared(css, ROOT_OPEN)
    used = set(re.findall(r"var\(\s*--([A-Za-z0-9_-]+)", css))
    page_dark = dark_names(css) | shared_dark
    return sorted(
        name for name, value in light.items()
        if name in used and COLOUR_RE.search(value) and not _flips(name, value, page_dark, light)
    )


def c4_dark_orphans(fails: list[str], notes: list[str]) -> None:
    warm_css = css_of(read(WARM), WARM)
    warm_dark = dark_names(warm_css)
    pages = shipped()
    if not pages:
        notes.append("C4 DARK ORPHAN  no _build/ output found — run the site build first; this "
                     "check reads the SHIPPED page, not the source, and is skipped without one.")
        return
    for label, path in pages:
        orphans = dark_orphans(read(path), warm_dark)
        if orphans:
            fails.append(
                f"C4 DARK ORPHAN  {label}: {len(orphans)} colour token(s) declared, used, and "
                f"never overridden for dark mode — "
                f"{', '.join('--' + o for o in orphans[:8])}"
                f"{' …' if len(orphans) > 8 else ''}. This page DOES flip --bg/--surface, so "
                f"these render light-on-dark. Add dark values (clinical-warm.css) or migrate "
                f"the page to --fd-* tokens."
            )


def c5_contrast_allowlist_empty(fails: list[str]) -> None:
    """The colour gate lives in tests/fd-contrast.test.mjs. Assert only that its inherited-debt
    allowlist has not been re-opened; the ratios themselves are that test's job."""
    if not os.path.exists(CONTRAST_TEST):
        fails.append("C5 CONTRAST  tests/fd-contrast.test.mjs is missing — the colour gate is gone.")
        return
    src = read(CONTRAST_TEST)
    m = re.search(r"const LIGHT_DEBT = new Set\(\[(.*?)\]\)", src, re.S)
    if not m:
        fails.append("C5 CONTRAST  could not find LIGHT_DEBT in fd-contrast.test.mjs.")
        return
    entries = re.findall(r"'([^']+)'", STRIP_COMMENTS.sub("", m.group(1)))
    if entries:
        fails.append(
            f"C5 CONTRAST  LIGHT_DEBT is no longer empty ({len(entries)} entr"
            f"{'y' if len(entries) == 1 else 'ies'}: {', '.join(entries[:4])}). Re-opening it is a "
            f"palette-owner decision — record it in clinical-warm.css's CONTRAST DECISIONS block "
            f"and update this gate deliberately."
        )


# ---------------------------------------------------------------- ratchets

DIMENSION_PROPS = ("font-size", "border-radius", "gap", "padding", "margin")


def measure_css(css: str) -> dict:
    raw = 0
    sizes: set[str] = set()
    tiny: list[str] = []
    for prop in DIMENSION_PROPS:
        for m in re.finditer(r"(?<![\w-])" + prop + r"\s*:\s*([^;}]+)", css):
            value = m.group(1).strip()
            if "var(" in value:
                continue
            if re.fullmatch(r"0|none|auto|inherit|initial|unset|100%|50%|999px", value):
                continue
            raw += 1
            if prop == "font-size":
                sizes.add(value)
                px = re.fullmatch(r"([\d.]+)px", value)
                if px and float(px.group(1)) < TYPE_FLOOR_PX:
                    tiny.append(value)
    # Only @media preludes. A bare `min-width:20px` inside a rule is a control size, not a
    # breakpoint; scanning the whole sheet for it produced 13 phantom "breakpoints" on the
    # first run of this gate.
    preludes = " ".join(re.findall(r"@media([^{]*)\{", css))
    breakpoints = {
        int(v) for v in re.findall(r"(?:min|max)-width\s*:\s*(\d+)px", preludes)
    } - ALLOWED_BREAKPOINTS
    return {
        "raw_dimension_declarations": raw,
        "distinct_font_sizes": len(sizes),
        "sub_floor_font_sizes": len(tiny),
        "nonstandard_breakpoints": sorted(breakpoints),
    }


def measure(path: str) -> dict:
    return measure_css(css_of(read(path), path))


RATCHET_FILES = {"frontdoor.css": FRONTDOOR, "spa_index.html": SPA}


def ratchets(fails: list[str], notes: list[str], baseline: dict) -> dict:
    current = {label: measure(path) for label, path in RATCHET_FILES.items()}
    for label, now in current.items():
        was = baseline.get(label)
        if was is None:
            notes.append(f"R  {label}: no baseline pinned yet — recording {now}")
            continue
        for key in ("raw_dimension_declarations", "distinct_font_sizes", "sub_floor_font_sizes"):
            if now[key] > was.get(key, now[key]):
                fails.append(
                    f"R  {label}: {key} rose {was[key]} -> {now[key]}. The dimension layer in "
                    f"clinical-warm.css exists so this number only goes down; use a token."
                )
            elif now[key] < was.get(key, now[key]):
                notes.append(f"R  {label}: {key} improved {was[key]} -> {now[key]} — "
                             f"run --update-baseline to lock the gain in.")
        new_bp = set(now["nonstandard_breakpoints"]) - set(was.get("nonstandard_breakpoints", []))
        if new_bp:
            fails.append(
                f"R  {label}: new non-standard breakpoint(s) {sorted(new_bp)}. The scale is "
                f"sm 430 / md 640 / lg 1000 (clinical-warm.css)."
            )
    return current


# ---------------------------------------------------------------- falsification
# House rule: a guard ships with a paired falsification, or it is not a guard (see
# bin/check_vacuity.py). These fixtures are minimal but REAL — FAMILY_SYSTEMS_SHAPE is the
# actual structure of the page that shipped a 1.06:1 dark mode, reduced to its skeleton, so
# this is a regression test for the defect and not just an exercise of the regex.

FAMILY_SYSTEMS_SHAPE = """
<html><head><link rel="stylesheet" href="/clinical-warm.css"></head><body>
<style>
:root{ --bg:#f6f3ee; --surface:#fff; --ink:#2f2924; --muted:#5f554b; --line:#ded3c5; }
body{background:var(--bg);color:var(--ink)}
.item{border:1px solid var(--line);color:var(--ink)}
.item small{color:var(--muted)}
</style></body></html>
"""

SAFE_SHAPE = FAMILY_SYSTEMS_SHAPE.replace(
    "</style>", '</style><style>[data-theme="dark"]{--ink:#ece5db;--muted:#bcb0a2;--line:#3a332c}</style>')


def self_test() -> int:
    checks: list[tuple[str, bool]] = []

    def expect(label: str, condition: bool) -> None:
        checks.append((label, bool(condition)))

    # C1 fires on ink use, and NOT on the four legitimate -color properties.
    expect("C1 flags color:var(--fd-terracotta)",
           role_violations(".a{color:var(--fd-terracotta)}") == [("fd-terracotta", 1)])
    expect("C1 flags color:var(--fd-olive) and names its ink token",
           role_violations(".a{color:var(--fd-olive)}") and INK_OF["fd-olive"] == "fd-olive-deep")
    expect("C1 ignores border-color/background-color/outline-color/text-fill-color",
           role_violations(".a{border-color:var(--fd-teal);background-color:var(--fd-teal);"
                           "outline-color:var(--fd-teal);-webkit-text-fill-color:var(--fd-teal)}") == [])
    expect("C1 ignores the ink tokens themselves",
           role_violations(".a{color:var(--fd-terracotta-dark);color:var(--fd-teal-deep)}") == [])

    # C2 counts literals but not token-derived colour.
    expect("C2 flags a hex literal", colour_literals(".a{color:#ff0000}") == ["#ff0000"])
    expect("C2 flags rgba()", colour_literals(".a{background:rgba(0,0,0,.5)}") != [])
    expect("C2 allows color-mix() over tokens",
           colour_literals(".a{background:color-mix(in srgb,var(--fd-teal) 80%,var(--fd-bg))}") == [])

    # C3 separates the two --fd-text-*/--fd-font-* namespaces.
    expect("C3 flags a dimension token with a dark value",
           invariance_violations('[data-theme="dark"]{--fd-space-4:9px}') == ["fd-space-4"])
    expect("C3 flags a font-size token with a dark value",
           invariance_violations('[data-theme="dark"]{--fd-font-md:15px}') == ["fd-font-md"])
    expect("C3 does NOT flag the --fd-text-* COLOUR tokens",
           invariance_violations('[data-theme="dark"]{--fd-text-dim:#a2968a;--fd-text-mid:#bcb0a2}') == [])

    # C4 — the P0 itself.
    shared = {"bg", "surface"}          # what clinical-warm.css actually flips for these pages
    orphans = dark_orphans(FAMILY_SYSTEMS_SHAPE, shared)
    expect("C4 catches the family-systems shape (--ink/--muted/--line orphaned)",
           orphans == ["ink", "line", "muted"])
    expect("C4 is silent once those tokens have dark values",
           dark_orphans(SAFE_SHAPE, shared) == [])
    expect("C4 ignores an UNTHEMED page (nothing flips its ground)",
           dark_orphans("<style>:root{--ink:#2f2924}body{color:var(--ink)}</style>", set()) == [])
    expect("C4 ignores a declared-but-unused token",
           dark_orphans('<style>:root{--ghost:#123456}</style>'
                        '<style>[data-theme="dark"]{--x:1}</style>', set()) == [])
    expect("C4 ignores a token aliased to one that flips",
           dark_orphans('<link href="/clinical-warm.css">'
                        '<style>:root{--card:var(--surface)}.a{background:var(--card)}</style>',
                        {"surface"}) == [])
    expect("C4 catches an orphaned colour-bearing SHADOW token (interview-circle's defect)",
           dark_orphans('<link href="/clinical-warm.css">'
                        '<style>:root{--shadow-card:0 1px 2px rgba(59,51,44,.05)}'
                        '.a{box-shadow:var(--shadow-card)}</style>', set()) == ["shadow-card"])

    # Ratchet measurement.
    m = measure_css(".a{font-size:14px;border-radius:10px}.b{font-size:9px}.c{font-size:var(--fd-font-md)}")
    expect("R counts raw dimension declarations, not tokenised ones",
           m["raw_dimension_declarations"] == 3)
    expect("R counts distinct font sizes", m["distinct_font_sizes"] == 2)
    expect("R flags sub-11px type", m["sub_floor_font_sizes"] == 1)
    expect("R reads breakpoints from @media preludes only",
           measure_css("@media (max-width:820px){.a{min-width:44px}}")["nonstandard_breakpoints"] == [820])
    expect("R does not invent a breakpoint from a control size",
           measure_css(".a{min-width:44px;max-width:300px}")["nonstandard_breakpoints"] == [])

    failed = [label for label, ok in checks if not ok]
    for label, ok in checks:
        print(f"  {'ok  ' if ok else 'FAIL'}  {label}")
    print(f"\nself-test: {len(checks) - len(failed)}/{len(checks)} passed")
    return 1 if failed else 0


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--update-baseline", action="store_true",
                    help="rewrite design_drift_baseline.json from the current tree")
    ap.add_argument("--self-test", action="store_true",
                    help="prove each check can fail, and that it stays silent on the good case")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    baseline = json.loads(read(BASELINE)) if os.path.exists(BASELINE) else {}
    fails: list[str] = []
    notes: list[str] = []

    c1_role_rule(fails)
    c2_no_raw_colour(fails)
    c3_theme_invariance(fails)
    c4_dark_orphans(fails, notes)
    c5_contrast_allowlist_empty(fails)
    current = ratchets(fails, notes, baseline.get("files", {}))

    if args.update_baseline:
        with open(BASELINE, "w", encoding="utf-8") as fh:
            json.dump({
                "_note": "Pinned by bin/check_design_drift.py. Counts may fall, never rise. "
                         "Regenerate with --update-baseline as part of a reviewed reduction.",
                "files": current,
            }, fh, indent=2, sort_keys=True)
            fh.write("\n")
        print(f"baseline written to {os.path.relpath(BASELINE, ROOT)}")

    for note in notes:
        print("note: " + note)
    if fails:
        print(f"\nFAIL — {len(fails)} design-system finding(s):\n")
        for f in fails:
            print("  - " + f + "\n")
        return 1
    print(f"OK — design system clean across {len(surfaces())} authoring surface(s) and "
          f"{len(shipped())} shipped page(s); ratchets at or below baseline.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
