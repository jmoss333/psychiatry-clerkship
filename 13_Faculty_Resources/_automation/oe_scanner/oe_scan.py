#!/usr/bin/env python3
"""
OpenEvidence folder scanner for the clerkship library.

Detects NEW or CHANGED review files dropped into the
"OPENEVIDENCE RAW FILES TO REVIEW" folder (compared to a manifest of
already-processed files), extracts their text to a staging area, and can
mark files as processed once reviewed.

Path resolution is location-relative (works regardless of session mount
prefix): the scanned folder is <library_root>/"OPENEVIDENCE RAW FILES TO REVIEW",
where <library_root> is four directories up from this script
(.../13_Faculty_Resources/_automation/oe_scanner/oe_scan.py).

Usage:
  python3 oe_scan.py                 # report new/changed files + extract their text to ./staging/
  python3 oe_scan.py --commit "A.docx" "B.docx"   # mark specific files processed (record current hash)
  python3 oe_scan.py --commit-all    # mark every currently-present file processed (use to seed)
  python3 oe_scan.py --list          # just list tracked/untracked without extracting
"""
import os, sys, json, hashlib, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
LIB_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))  # up: oe_scanner -> _automation -> 13_Faculty_Resources -> <lib>
FOLDER = os.path.join(LIB_ROOT, "OPENEVIDENCE RAW FILES TO REVIEW")
MANIFEST = os.path.join(HERE, "oe_manifest.json")
STAGING = os.path.join(HERE, "staging")
EXTS = {".docx", ".pdf", ".txt", ".md", ".csv"}

def _sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def _load():
    try:
        return json.load(open(MANIFEST, encoding="utf-8"))
    except Exception:
        return {}

def _save(m):
    json.dump(m, open(MANIFEST, "w", encoding="utf-8"), indent=2, sort_keys=True)

def _candidates():
    out = []
    if not os.path.isdir(FOLDER):
        return out
    for fn in sorted(os.listdir(FOLDER)):
        p = os.path.join(FOLDER, fn)
        if not os.path.isfile(p):
            continue
        if fn.startswith("~$") or fn.startswith("."):
            continue
        if os.path.splitext(fn)[1].lower() not in EXTS:
            continue
        out.append(fn)
    return out

def _new_or_changed():
    m = _load()
    res = []
    for fn in _candidates():
        p = os.path.join(FOLDER, fn)
        s = _sha(p)
        if m.get(fn, {}).get("sha256") != s:
            res.append((fn, s))
    return m, res

def _extract(path):
    ext = os.path.splitext(path)[1].lower()
    try:
        if ext == ".docx":
            try:
                import docx  # python-docx
            except Exception:
                os.system("pip install python-docx --break-system-packages -q >/dev/null 2>&1")
                import docx
            d = docx.Document(path)
            parts = [x.text for x in d.paragraphs]
            for t in d.tables:
                for row in t.rows:
                    parts.append(" | ".join(c.text for c in row.cells))
            return "\n".join(parts)
        if ext in (".txt", ".md", ".csv"):
            return open(path, encoding="utf-8", errors="ignore").read()
        if ext == ".pdf":
            try:
                import pypdf
            except Exception:
                os.system("pip install pypdf --break-system-packages -q >/dev/null 2>&1")
                import pypdf
            r = pypdf.PdfReader(path)
            return "\n".join((pg.extract_text() or "") for pg in r.pages)
    except Exception as e:
        return "[extraction error: %s]" % e
    return ""

def cmd_report(extract=True):
    m, new = _new_or_changed()
    os.makedirs(STAGING, exist_ok=True)
    report = {
        "scanned_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "folder": FOLDER,
        "total_files": len(_candidates()),
        "already_processed": len([k for k in m]),
        "new_or_changed_count": len(new),
        "new_or_changed": [],
    }
    for fn, s in new:
        entry = {"file": fn, "sha256": s}
        if extract:
            txt = _extract(os.path.join(FOLDER, fn))
            stage = os.path.join(STAGING, fn + ".txt")
            open(stage, "w", encoding="utf-8").write(txt)
            entry["chars"] = len(txt)
            entry["staged_text"] = stage
        report["new_or_changed"].append(entry)
    print(json.dumps(report, indent=2))

def cmd_commit(files):
    m = _load()
    present = set(_candidates())
    done = []
    if files == ["--all"]:
        files = sorted(present)
    for fn in files:
        if fn not in present:
            continue
        m[fn] = {"sha256": _sha(os.path.join(FOLDER, fn)),
                 "processed_at": datetime.datetime.now().isoformat(timespec="seconds")}
        done.append(fn)
    _save(m)
    print(json.dumps({"committed": done, "manifest_size": len(m)}, indent=2))

if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        cmd_report(extract=True)
    elif args[0] == "--list":
        cmd_report(extract=False)
    elif args[0] == "--commit-all":
        cmd_commit(["--all"])
    elif args[0] == "--commit":
        cmd_commit(args[1:] if len(args) > 1 else [])
    else:
        print("unknown args:", args)
