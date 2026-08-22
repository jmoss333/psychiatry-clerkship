#!/usr/bin/env python3
"""Generate the COWS item array from SPEC section 2.2, verbatim.

Ground Rule 1 of the remediation handoff forbids retyping a clinical anchor from memory. This
parses the SPEC's own table and emits the JS, so every anchor string in the shipped tool is a
byte-for-byte copy of the spec row it came from. Run it, diff the output against the tool, and
the provenance question answers itself.

    python3 13_Faculty_Resources/_automation/gen_cows_from_spec.py           # print JS
    python3 13_Faculty_Resources/_automation/gen_cows_from_spec.py --check   # verify tool matches

The keys are the tool's existing ones and are positional against the spec table, which runs in
the same order the tool already used (pulse, sweating, restlessness, pupil, aches, nose, GI,
tremor, yawning, anxiety, gooseflesh). --check fails loudly if that stops being true.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SPEC = ROOT / "docs/superpowers/specs/SPEC_Withdrawal_Instrument_Redesign_v1.md"
TOOL = ROOT / "03_Core_Topics/SUD_Withdrawal/withdrawal-ciwa-cows-card.html"

# Tool key <- spec item name. Positional order is asserted below, not assumed silently.
KEYS = [
    ("pulse", "Resting pulse rate"),
    ("sweat", "Sweating"),
    ("rest", "Restlessness"),
    ("pupil", "Pupil size"),
    ("aches", "Bone or joint aches"),
    ("nose", "Runny nose or tearing"),
    ("gi", "GI upset"),
    ("tremor", "Tremor"),
    ("yawn", "Yawning"),
    ("anx", "Anxiety or irritability"),
    ("goose", "Gooseflesh skin"),
]


def demark(s: str) -> str:
    """Strip markdown emphasis; keep the words exactly as written."""
    return re.sub(r"\*\*(.+?)\*\*", r"\1", s).strip()


def js(s: str) -> str:
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def parse_spec():
    text = SPEC.read_text(encoding="utf-8")
    start = text.index("### 2.2 Item content")
    end = text.index("**Score bands", start)
    rows = []
    for line in text[start:end].splitlines():
        line = line.strip()
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 5 or not cells[0].isdigit():
            continue
        num, name, tag, ask, vals = cells[0], demark(cells[1]), demark(cells[2]), demark(cells[3]), cells[4]
        anchors = []
        for chunk in vals.split(" · "):
            m = re.match(r"\*\*(\d+)\*\*\s*(.+)", chunk.strip())
            if not m:
                raise SystemExit(f"unparsed anchor in item {num}: {chunk!r}")
            anchors.append((int(m.group(1)), demark(m.group(2))))
        rows.append({"n": int(num), "name": name, "tag": tag, "ask": "" if ask == "—" else ask, "vals": anchors})
    return rows


def build_js(rows):
    if len(rows) != len(KEYS):
        raise SystemExit(f"spec has {len(rows)} items, tool expects {len(KEYS)}")
    out = ["var COWS=["]
    for (key, expect), row in zip(KEYS, rows):
        if row["name"] != expect:
            raise SystemExit(f"item order changed: spec #{row['n']} is {row['name']!r}, expected {expect!r}")
        vals = ",".join("{v:%d,a:%s}" % (v, js(a)) for v, a in row["vals"])
        ask = (",ask:" + js(row["ask"])) if row["ask"] else ""
        out.append(
            "  {k:%s,b:%s,tag:%s%s,\n   vals:[%s]},"
            % (js(key), js(row["name"]), js(row["tag"]), ask, vals)
        )
    out[-1] = out[-1].rstrip(",")
    out.append("];")
    out.append("/* max is derived, never hand-maintained: it drove the dense-range bug. */")
    out.append("COWS.forEach(function(i){ i.max=i.vals[i.vals.length-1].v; });")
    return "\n".join(out)


def main():
    rows = parse_spec()
    generated = build_js(rows)
    if "--check" in sys.argv:
        tool = TOOL.read_text(encoding="utf-8")
        missing = [a for row in rows for _, a in row["vals"] if a not in tool]
        if missing:
            print("FAIL — anchors absent from the tool:")
            for m in missing[:10]:
                print("   ", m)
            return 1
        total = sum(max(v for v, _ in r["vals"]) for r in rows)
        print(f"OK — all {sum(len(r['vals']) for r in rows)} spec anchors present in the tool; max total {total}")
        return 0 if total == 48 else 1
    print(generated)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
