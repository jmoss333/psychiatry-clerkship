#!/usr/bin/env python3
"""Render the workplace-assessment faculty pack to one printable HTML file, and to PDF when a
headless Chrome or Chromium is available.

DEV-ONLY. Not in CI, not in bin/verify.sh, not part of either site build. The pack
(13_Faculty_Resources/Assessment/, WP-3, decision D5) is faculty material that never ships; this
script only turns it into something a clerkship director can print.

    python3 13_Faculty_Resources/_automation/build_assessment_pdf.py [--out-dir DIR] [--no-pdf]

Output, ignored by git (see .gitignore):
    output/assessment-pack/assessment-pack.html
    output/assessment-pack/assessment-pack.pdf   (only when Chrome/Chromium is found)

The ten pack files render in a fixed order. Any other markdown file in the folder renders after
them rather than being dropped, and a missing pack file stops the run: a print-out that silently
omits a card would look complete. Markdown is converted by a small stdlib renderer that covers
exactly what the pack uses (headings, paragraphs, lists, tables, block quotes, code spans, links,
bold, italic); it is not a general Markdown implementation.

Exit codes: 0 rendered (PDF too, when a browser was found); 1 a browser was found but the PDF
step failed; 2 a pack file is missing.
"""

from __future__ import annotations

import argparse
import html
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PACK_DIR = REPO / "13_Faculty_Resources" / "Assessment"
DEFAULT_OUT = REPO / "output" / "assessment-pack"

# Print order: orientation material first, then the instruments in the order they are used.
PACK_ORDER = (
    "README.md",
    "clerkship_objectives.md",
    "required_encounters.md",
    "preceptor_guide.md",
    "DO-1_interview_mse.md",
    "DO-2_admission_note.md",
    "DO-3_oral_presentation.md",
    "DO-4_team_family_communication.md",
    "encounter_card.md",
    "mid_clerkship_feedback.md",
)

BROWSER_NAMES = ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome")
MAC_BROWSERS = (
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
)

CSS = """
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #ffffff; color: #1d1d1b;
  font: 10.5pt/1.45 "Source Serif 4", Georgia, "Times New Roman", serif; }
main { max-width: 7.4in; margin: 0 auto; padding: 0.4in 0; }
h1, h2, h3, h4 { font-family: "Source Sans 3", "Helvetica Neue", Arial, sans-serif;
  line-height: 1.2; break-after: avoid; }
h1 { font-size: 17pt; margin: 0 0 0.5em; border-bottom: 2px solid #1d1d1b; padding-bottom: 4px; }
h2 { font-size: 12.5pt; margin: 1.1em 0 0.4em; }
h3 { font-size: 11pt; margin: 1em 0 0.3em; }
p, ul, ol { margin: 0.35em 0 0.6em; }
li { margin: 0.15em 0; }
code { font: 9pt/1.3 "SFMono-Regular", Menlo, Consolas, monospace; background: #f1efe9;
  padding: 0 2px; border-radius: 2px; }
pre { background: #f1efe9; padding: 6px 8px; overflow-x: auto; }
pre code { background: none; padding: 0; }
blockquote { margin: 0.6em 0; padding: 6px 10px; border-left: 4px solid #8a6d3b;
  background: #faf6ee; }
table { width: 100%; border-collapse: collapse; margin: 0.5em 0 0.9em; font-size: 9.5pt; }
th, td { border: 1px solid #8f8a80; padding: 3px 5px; vertical-align: top; text-align: left; }
th { background: #ece8df; }
tr { break-inside: avoid; }
a { color: #1d1d1b; }
.id { white-space: nowrap; }
.doc { break-before: page; }
.doc:first-of-type { break-before: auto; }
.cover { min-height: 8in; }
.cover .meta { color: #55524c; }
.runner { font: 8.5pt/1.3 "Source Sans 3", Arial, sans-serif; color: #55524c;
  border-bottom: 1px solid #c9c4b8; padding-bottom: 3px; margin-bottom: 10px; }
@page { size: Letter; margin: 0.55in 0.6in; }
@media print { main { padding: 0; max-width: none; } a { text-decoration: none; } }
"""


def slug_for(name: str) -> str:
    return "doc-" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def render_inline(text: str, anchors: dict[str, str]) -> str:
    """Escape text and apply inline Markdown: code spans, links, bold, italic."""
    codes: list[str] = []

    def stash(match: re.Match) -> str:
        codes.append("<code>" + html.escape(match.group(1)) + "</code>")
        return f"\x00{len(codes) - 1}\x00"

    text = re.sub(r"`([^`]+)`", stash, text)
    text = html.escape(text, quote=False)

    def link(match: re.Match) -> str:
        label, target = match.group(1), match.group(2)
        base = target.split("#")[0]
        if base in anchors:
            return f'<a href="#{anchors[base]}">{label}</a>'
        if re.match(r"^(https?:|mailto:)", target):
            return f'<a href="{html.escape(target)}">{label}</a>'
        # A relative link outside the pack would break in the output folder; print its
        # repository path instead so a reader can find the file.
        try:
            shown = (PACK_DIR / base).resolve().relative_to(REPO).as_posix()
        except ValueError:
            shown = base
        return f"{label} (<code>{html.escape(shown)}</code>)"

    text = re.sub(r"&lt;(https?://[^\s&]+)&gt;", r'<a href="\1">\1</a>', text)
    text = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", link, text)
    text = re.sub(r"\b((?:OBJ|DO)-\d{1,2})\b", r'<span class="id">\1</span>', text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", text)
    return re.sub(r"\x00(\d+)\x00", lambda m: codes[int(m.group(1))], text)


LIST_ITEM = re.compile(r"^([-*]|\d+\.)\s+(.*)$")  # a top-level item: no leading spaces


def collect_list(lines: list[str], i: int, ordered: bool) -> tuple[list[list[str]], int]:
    """Gather one top-level list. Each item is its first line plus every indented line after it
    (with two spaces of indent removed); a blank line stays inside the list when the next line
    is indented or is another item of the same kind."""
    items: list[list[str]] = []
    while i < len(lines):
        cur = lines[i]
        top = LIST_ITEM.match(cur)
        if top and top.group(1)[0].isdigit() == ordered:
            items.append([top.group(2)])
        elif cur.startswith("  ") and items:
            items[-1].append(cur[2:])
        elif not cur.strip() and items:
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            nxt_top = LIST_ITEM.match(nxt)
            if not (nxt.startswith("  ") or (nxt_top and nxt_top.group(1)[0].isdigit() == ordered)):
                break
            items[-1].append("")
        else:
            break
        i += 1
    return items, i


def render_item(parts: list[str], anchors: dict[str, str]) -> str:
    """An item's wrapped first paragraph, then any nested block (a sub-list, a write-in line)."""
    head = [parts[0]]
    k = 1
    while k < len(parts) and parts[k].strip() and not re.match(r"^\s*([-*]|\d+\.)\s+", parts[k]):
        head.append(parts[k].strip())
        k += 1
    rest = "\n".join(parts[k:])
    body = render_inline(" ".join(head), anchors)
    if rest.strip():
        body += render_markdown(rest, anchors)
    return f"<li>{body}</li>"


def split_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def is_separator(line: str) -> bool:
    return bool(re.match(r"^\s*\|[\s:|-]+\|\s*$", line))


def render_markdown(md: str, anchors: dict[str, str]) -> str:
    """Convert the Markdown subset the pack uses to HTML."""
    lines = md.split("\n")
    out: list[str] = []
    i = 0
    para: list[str] = []

    def flush_para() -> None:
        if para:
            out.append("<p>" + render_inline(" ".join(para), anchors) + "</p>")
            para.clear()

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            flush_para()
            i += 1
            continue
        if stripped.startswith("```"):
            flush_para()
            block = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                block.append(lines[i])
                i += 1
            out.append("<pre><code>" + html.escape("\n".join(block)) + "</code></pre>")
            i += 1
            continue
        heading = re.match(r"^(#{1,4})\s+(.*)$", stripped)
        if heading:
            flush_para()
            level = len(heading.group(1))
            out.append(f"<h{level}>{render_inline(heading.group(2), anchors)}</h{level}>")
            i += 1
            continue
        if stripped.startswith("|") and i + 1 < len(lines) and is_separator(lines[i + 1]):
            flush_para()
            header = split_row(line)
            rows = []
            i += 2
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append(split_row(lines[i]))
                i += 1
            head = "".join(f"<th>{render_inline(c, anchors)}</th>" for c in header)
            body = "".join(
                "<tr>" + "".join(f"<td>{render_inline(c, anchors)}</td>" for c in row) + "</tr>"
                for row in rows
            )
            out.append(f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>")
            continue
        if stripped.startswith(">"):
            flush_para()
            quote = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote.append(lines[i].strip()[1:].strip())
                i += 1
            inner = render_markdown("\n".join(quote), anchors)
            out.append(f"<blockquote>{inner}</blockquote>")
            continue
        item = LIST_ITEM.match(line)
        if item:
            flush_para()
            ordered = item.group(1)[0].isdigit()
            items, i = collect_list(lines, i, ordered)
            tag = "ol" if ordered else "ul"
            out.append(f"<{tag}>" + "".join(render_item(p, anchors) for p in items) + f"</{tag}>")
            continue
        if re.match(r"^-{3,}$", stripped):
            flush_para()
            out.append("<hr>")
            i += 1
            continue
        para.append(stripped)
        i += 1
    flush_para()
    return "\n".join(out)


def pack_files() -> list[Path]:
    """The ten pack files in print order, then any other markdown in the folder."""
    missing = [name for name in PACK_ORDER if not (PACK_DIR / name).is_file()]
    if missing:
        print("assessment pack incomplete; missing: " + ", ".join(missing), file=sys.stderr)
        sys.exit(2)
    extras = sorted(p.name for p in PACK_DIR.glob("*.md") if p.name not in PACK_ORDER)
    for name in extras:
        print(f"note: {name} is not in the fixed print order; rendering it last")
    return [PACK_DIR / name for name in (*PACK_ORDER, *extras)]


def build_html(files: list[Path]) -> str:
    anchors = {path.name: slug_for(path.name) for path in files}
    titles = []
    sections = []
    for path in files:
        md = path.read_text(encoding="utf-8")
        first = next((ln for ln in md.split("\n") if ln.startswith("# ")), f"# {path.name}")
        title = first[2:].strip()
        titles.append((anchors[path.name], title, path.name))
        runner = (f'<div class="runner">MS3 Psychiatry Clerkship · Workplace-Assessment Pack · '
                  f'DRAFT · {html.escape(path.name)}</div>')
        sections.append(f'<section class="doc" id="{anchors[path.name]}">{runner}'
                        f"{render_markdown(md, anchors)}</section>")
    toc = "".join(f'<li><a href="#{a}">{html.escape(t)}</a> <code>{html.escape(n)}</code></li>'
                  for a, t, n in titles)
    cover = (
        '<section class="doc cover" id="cover">'
        "<h1>Workplace-Assessment Pack: MS3 Psychiatry Clerkship</h1>"
        '<p class="meta">DRAFT for the clerkship director\'s edit. Faculty material; not shipped '
        "to either learner site. Every card feeds the school's official evaluation and is not "
        "itself the grade. No patient identifiers on any card.</p>"
        f"<h2>Contents</h2><ol>{toc}</ol>"
        "<p>Joshua Moss, MD | Psychiatrist</p></section>"
    )
    return (
        "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
        "<title>Assessment Pack</title>"
        f"<style>{CSS}</style></head><body><main>{cover}{''.join(sections)}</main></body></html>\n"
    )


def find_browser() -> str | None:
    override = os.environ.get("CHROME")
    if override and Path(override).exists():
        return override
    for name in BROWSER_NAMES:
        found = shutil.which(name)
        if found:
            return found
    for candidate in MAC_BROWSERS:
        if Path(candidate).exists():
            return candidate
    return None


def print_pdf(browser: str, html_path: Path, pdf_path: Path, timeout: float = 120.0) -> bool:
    """Print with headless Chrome. On macOS, Chrome can finish writing the PDF and then keep
    running, so this waits for the file to appear and stop growing, then ends the browser's
    whole process group rather than waiting for it to exit."""
    if pdf_path.exists():
        pdf_path.unlink()  # never mistake an earlier run's PDF for this one
    with tempfile.TemporaryDirectory(prefix="assessment-pdf-") as profile:
        cmd = [
            browser,
            "--headless=new",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            f"--user-data-dir={profile}",
            "--no-pdf-header-footer",
            f"--print-to-pdf={pdf_path}",
            html_path.as_uri(),
        ]
        try:
            proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                                    text=True, start_new_session=True)
        except OSError as exc:
            print(f"PDF step failed: {exc}", file=sys.stderr)
            return False
        deadline = time.monotonic() + timeout
        last_size = -1
        while time.monotonic() < deadline and proc.poll() is None:
            size = pdf_path.stat().st_size if pdf_path.exists() else -1
            if size > 0 and size == last_size:
                break  # written and stable for one interval
            last_size = size
            time.sleep(1.0)
        if proc.poll() is None:
            stop_group(proc)
        stderr = proc.stderr.read() if proc.stderr else ""
    if not pdf_path.is_file() or pdf_path.stat().st_size == 0:
        print(f"PDF step failed (exit {proc.returncode}): {stderr.strip()[:400]}", file=sys.stderr)
        return False
    return True


def stop_group(proc: subprocess.Popen) -> None:
    """End the browser and its helper processes."""
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(proc.pid, sig)
        except (ProcessLookupError, PermissionError):
            return
        try:
            proc.wait(timeout=5)
            return
        except subprocess.TimeoutExpired:
            continue


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT,
                        help="output folder (default: output/assessment-pack, ignored by git)")
    parser.add_argument("--no-pdf", action="store_true", help="write the HTML only")
    args = parser.parse_args(argv)

    files = pack_files()
    out_dir = args.out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    html_path = out_dir / "assessment-pack.html"
    html_path.write_text(build_html(files), encoding="utf-8")
    print(f"rendered {len(files)} files -> {html_path}")

    if args.no_pdf:
        return 0
    browser = find_browser()
    if not browser:
        print("no headless Chrome/Chromium found: open the HTML and print to PDF from the browser")
        return 0
    pdf_path = out_dir / "assessment-pack.pdf"
    if not print_pdf(browser, html_path, pdf_path):
        print("open the HTML and print to PDF from the browser instead", file=sys.stderr)
        return 1
    print(f"PDF -> {pdf_path} ({pdf_path.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
