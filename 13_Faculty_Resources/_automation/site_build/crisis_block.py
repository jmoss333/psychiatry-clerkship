#!/usr/bin/env python3
"""Render the shared crisis-contact block from crisis_resources.json.

Single source of truth for crisis contacts shipped on safety surfaces of BOTH sites.
Content pages carry only the marker `<!-- crisis-block -->`; tools and the governed
shell carry `<!-- crisis-block-html -->`. The build replaces those markers with the
rendered block, so no contact is ever hand-maintained in a learner-facing source.

Why derived-and-vendored rather than imported live from the ReConnect Psychiatry
System (the upstream steward for this data): Netlify checks out only this repo, so
an absolute path to a ReConnect working copy does not exist on the build runner, and
CLAUDE.md forbids hard-coded /Users paths in tracked .py (CI lints for it). See
docs/superpowers/specs/2026-07-27-crisis-contacts-988-design.md, and
13_Faculty_Resources/_automation/sync_crisis_from_reconnect.py for the reviewed
sync path that runs on a developer machine only.

Determinism: the "verified" line uses the latest verifiedOn recorded in the DATA,
never build time, so the build stays byte-reproducible.
"""

import json
import os

MARKER = "<!-- crisis-block -->"
HTML_MARKER = "<!-- crisis-block-html -->"

HEADING = "If someone is in crisis"


def load(lib_root):
    """Load and lightly sanity-check the crisis snapshot."""
    path = os.path.join(lib_root, "crisis_resources.json")
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    if not data.get("resources"):
        raise SystemExit("crisis_resources.json: no resources defined")
    return data


def verified_on(data):
    """Latest verification date across all resources (data-driven, not build time)."""
    return max(r["verifiedOn"] for r in data["resources"])


def _line(resource):
    """One resource as a markdown bullet."""
    parts = ["**%s** — %s" % (resource["name"], resource["contact"])]
    if resource.get("alsoAvailable"):
        parts.append(resource["alsoAvailable"])
    parts.append(resource["availability"])
    line = ". ".join(parts) + "."
    if resource.get("note"):
        line += " %s" % resource["note"]
    return "- " + line


def render_markdown(data):
    """Render the block as markdown for content pages."""
    out = ["> ### %s" % HEADING, ">"]
    out.append("> %s" % data["unitEscalationNote"])
    out.append(">")
    for resource in data["resources"]:
        out.append("> " + _line(resource))
    out.append(">")
    out.append(
        "> *Contacts verified %s against official sources. Maintained in "
        "`crisis_resources.json`; do not edit these numbers inline.*" % verified_on(data)
    )
    return "\n".join(out)


def _esc(text):
    """Escape text for HTML text nodes and attribute-free inline use."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def render_html(data):
    """Render the block as self-contained HTML for single-file tools.

    Styling uses the Clinical Warm custom properties with literal fallbacks, so the
    block looks right whether or not the host tool links clinical-warm.css.
    """
    items = []
    for resource in data["resources"]:
        bits = ["<strong>%s</strong> — %s" % (_esc(resource["name"]), _esc(resource["contact"]))]
        if resource.get("alsoAvailable"):
            bits.append(_esc(resource["alsoAvailable"]))
        bits.append(_esc(resource["availability"]))
        text = ". ".join(bits) + "."
        if resource.get("note"):
            text += " %s" % _esc(resource["note"])
        items.append("      <li>%s</li>" % text)
    return "\n".join(
        [
            '<section class="crisis-block" aria-labelledby="crisis-block-heading"'
            ' style="margin:1.5rem 0;padding:1rem 1.25rem;'
            "border:1px solid var(--cw-border,#d8cfc4);"
            "border-left:4px solid var(--cw-accent,#8c5a3b);"
            "border-radius:6px;background:var(--cw-surface,#faf6f1);"
            'color:var(--cw-text,#2c2622);">',
            '  <h2 id="crisis-block-heading" style="margin:0 0 .5rem;font-size:1rem;">%s</h2>'
            % _esc(HEADING),
            '  <p style="margin:.25rem 0 .75rem;">%s</p>' % _esc(data["unitEscalationNote"]),
            '  <ul style="margin:0;padding-left:1.25rem;">',
            "\n".join(items),
            "  </ul>",
            '  <p style="margin:.75rem 0 0;font-size:.85em;opacity:.8;">'
            "Contacts verified %s against official sources. Maintained in "
            "<code>crisis_resources.json</code>; do not edit these numbers inline.</p>"
            % verified_on(data),
            "</section>",
        ]
    )


def inject_markdown(text, data):
    """Replace the markdown marker with the rendered block.

    Returns (text, injected). Leaves text untouched when the marker is absent so
    non-safety pages are never modified.
    """
    if MARKER not in text:
        return text, False
    return text.replace(MARKER, render_markdown(data)), True


def inject_html(text, data):
    """Replace the HTML marker with the rendered block. Returns (text, injected)."""
    if HTML_MARKER not in text:
        return text, False
    return text.replace(HTML_MARKER, render_html(data)), True


def inject_required_html_file(path, data, label):
    """Strictly expand the one required HTML marker in a built artifact.

    Optional tool markers continue to use ``inject_html``. The shell is different: it
    is a required safety surface, so zero or duplicate markers are both build errors.
    """
    with open(path, encoding="utf-8") as handle:
        source = handle.read()
    count = source.count(HTML_MARKER)
    if count != 1:
        raise SystemExit(
            "%s: expected exactly one %s marker (found %d)"
            % (label, HTML_MARKER, count)
        )
    rendered, injected = inject_html(source, data)
    if not injected or HTML_MARKER in rendered:
        raise SystemExit("%s: crisis marker did not expand cleanly" % label)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(rendered)
    return rendered


def assert_no_html_marker_file(path, label):
    """Hard-fail when a final built shell retains or reacquires an HTML marker."""
    with open(path, encoding="utf-8") as handle:
        source = handle.read()
    count = source.count(HTML_MARKER)
    if count:
        raise SystemExit(
            "%s: expected no unexpanded %s markers (found %d)"
            % (label, HTML_MARKER, count)
        )
    return source


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    lib = os.path.abspath(os.path.join(here, "..", "..", ".."))
    print(render_markdown(load(lib)))
