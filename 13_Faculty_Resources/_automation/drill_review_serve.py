#!/usr/bin/env python3
"""One-command review of the evidence-literacy drill drafts.

Same shape as attest_serve.py: render a review page from current content, serve
it locally, and expose POST /save so the page's button writes the decision file
directly. No manual file editing, no JSON by hand.

Decisions land in evidence_drill_review.json — hand-maintained and durable. The
generator reads it, so a decision survives every later regeneration: kept items
become `attested`, cut items drop out, anything undecided stays `draft`.

Usage:
    python3 13_Faculty_Resources/_automation/drill_review_serve.py
Then open the printed URL, mark each item keep or cut, click Save. Ctrl-C stops.
"""
import argparse
import html
import http.server
import json
import os
import subprocess
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.abspath(os.path.join(HERE, "..", ".."))
GENERATED = os.path.join(HERE, "generated")
DRILL = os.path.join(GENERATED, "evidence_drill.json")
DECISIONS = os.path.join(GENERATED, "evidence_drill_review.json")
GENERATOR = os.path.join(HERE, "generate_evidence_drill.py")

ap = argparse.ArgumentParser()
ap.add_argument("--port", type=int, default=8766)
ap.add_argument("--reviewer", default="Joshua Moss, MD")
ARGS = ap.parse_args()

PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Evidence drill — review</title>
<style>
 :root{--ink:#2f2a26;--muted:#6b625a;--line:#e2dad0;--bg:#faf7f3;--keep:#2f6f4f;--cut:#8c3b3b}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--ink);
      font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
 header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);
        padding:14px 24px;display:flex;gap:16px;align-items:baseline;flex-wrap:wrap;z-index:5}
 h1{font-size:18px;margin:0}
 .count{color:var(--muted);font-size:14px}
 main{max-width:860px;margin:0 auto;padding:24px}
 article{background:#fff;border:1px solid var(--line);border-radius:10px;
         padding:18px 20px;margin:0 0 18px}
 article[data-decision="keep"]{border-left:5px solid var(--keep)}
 article[data-decision="cut"]{border-left:5px solid var(--cut);opacity:.62}
 .meta{color:var(--muted);font-size:13px;margin-bottom:8px}
 .claim{font-size:17px;margin:0 0 12px}
 .stem{color:var(--muted);font-size:14px;margin:0 0 12px}
 ol{margin:0 0 14px;padding-left:22px}
 li{margin:2px 0}
 li.correct{font-weight:600;color:var(--keep)}
 details{margin:10px 0 14px}
 summary{cursor:pointer;color:var(--muted);font-size:14px}
 .why{white-space:pre-wrap;font-size:14px;background:#fbf8f4;border:1px solid var(--line);
      border-radius:8px;padding:12px;margin-top:8px}
 .pearl{font-size:14px;border-left:3px solid var(--line);padding-left:12px;color:var(--muted)}
 .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}
 button{font:inherit;padding:7px 16px;border-radius:8px;border:1px solid var(--line);
        background:#fff;cursor:pointer}
 button.on[data-v="keep"]{background:var(--keep);color:#fff;border-color:var(--keep)}
 button.on[data-v="cut"]{background:var(--cut);color:#fff;border-color:var(--cut)}
 input[type=text]{flex:1;min-width:220px;padding:7px 10px;border:1px solid var(--line);
                  border-radius:8px;font:inherit}
 #save{background:var(--ink);color:#fff;border-color:var(--ink);padding:9px 22px}
 #status{font-size:14px;color:var(--muted)}
</style></head><body>
<header>
  <h1>Evidence drill — review</h1>
  <span class="count" id="count"></span>
  <span style="flex:1"></span>
  <button id="save">Save decisions</button>
  <span id="status"></span>
</header>
<main id="items">__ITEMS__</main>
<script>
const REVIEWER = __REVIEWER__;
const state = __STATE__;
document.querySelectorAll("article").forEach(a => {
  const id = a.dataset.id;
  a.querySelectorAll("button[data-v]").forEach(b => {
    b.addEventListener("click", () => {
      const v = b.dataset.v;
      state[id] = state[id] || {};
      state[id].decision = state[id].decision === v ? null : v;
      render(a);
    });
  });
  a.querySelector("input").addEventListener("input", e => {
    state[id] = state[id] || {}; state[id].note = e.target.value;
  });
  render(a);
});
function render(a){
  const id = a.dataset.id, d = (state[id]||{}).decision || "";
  a.dataset.decision = d;
  a.querySelectorAll("button[data-v]").forEach(b => b.classList.toggle("on", b.dataset.v === d));
  count();
}
function count(){
  const total = document.querySelectorAll("article").length;
  const done = Object.values(state).filter(v => v && v.decision).length;
  document.getElementById("count").textContent = done + " of " + total + " decided";
}
document.getElementById("save").addEventListener("click", async () => {
  const out = {};
  for (const [id, v] of Object.entries(state)) {
    if (v && v.decision) out[id] = {decision: v.decision, reviewer: REVIEWER,
                                    date: __TODAY__, note: (v.note || "")};
  }
  const s = document.getElementById("status");
  s.textContent = "saving…";
  try {
    const r = await fetch("/save", {method:"POST", body: JSON.stringify(out)});
    const j = await r.json();
    s.textContent = j.ok ? ("saved " + j.decisions + " → " + j.path) : ("error: " + j.error);
  } catch (e) { s.textContent = "error: " + e; }
});
count();
</script></body></html>
"""


def render_item(item, decided):
    options = "".join(
        '<li class="%s">%s</li>' % ("correct" if o.get("c") else "", html.escape(o["t"]))
        for o in item["options"]
    )
    return (
        '<article data-id="%(id)s" data-decision="%(d)s">'
        '<div class="meta">%(page)s · %(sid)s</div>'
        '<p class="claim">%(claim)s</p>'
        '<p class="stem">%(stem)s</p>'
        "<ol>%(options)s</ol>"
        "<details><summary>Why / scope note</summary><div class=\"why\">%(why)s</div></details>"
        '<p class="pearl">%(pearl)s</p>'
        '<div class="row">'
        '<button data-v="keep">Keep</button>'
        '<button data-v="cut">Cut</button>'
        '<input type="text" placeholder="note (optional) — e.g. reword the stem" value="%(note)s">'
        "</div></article>"
    ) % {
        "id": html.escape(item["id"]),
        "d": html.escape(decided.get("decision") or ""),
        "page": html.escape(item["page"]),
        "sid": html.escape(item["sourceId"]),
        "claim": html.escape(item["claim"]),
        "stem": html.escape(item["stem"]),
        "options": options,
        "why": html.escape(item["why"]),
        "pearl": html.escape(item["pearl"]),
        "note": html.escape(decided.get("note") or ""),
    }


def build_page():
    drill = json.loads(open(DRILL, encoding="utf-8").read())
    decisions = {}
    if os.path.exists(DECISIONS):
        decisions = json.loads(open(DECISIONS, encoding="utf-8").read())
    body = "".join(render_item(i, decisions.get(i["id"], {})) for i in drill["items"])
    return (
        PAGE.replace("__ITEMS__", body)
        .replace("__STATE__", json.dumps(decisions))
        .replace("__REVIEWER__", json.dumps(ARGS.reviewer))
        .replace("__TODAY__", json.dumps(date.today().isoformat()))
    )


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype):
        raw = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path.rstrip("/") in ("", "/review"):
            return self._send(200, build_page(), "text/html; charset=utf-8")
        self._send(404, "not found", "text/plain; charset=utf-8")

    def do_POST(self):
        if self.path.rstrip("/") != "/save":
            return self._send(404, json.dumps({"ok": False, "error": "not found"}), "application/json")
        try:
            n = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(n))
            assert isinstance(data, dict), "payload must be an object"
            for key, value in data.items():
                assert isinstance(value, dict), key
                assert value.get("decision") in ("keep", "cut"), key
                assert value.get("reviewer"), key
                assert value.get("date"), key
        except Exception as exc:
            return self._send(
                400, json.dumps({"ok": False, "error": str(exc)}), "application/json"
            )

        os.makedirs(GENERATED, exist_ok=True)
        with open(DECISIONS, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + "\n")
        # Regenerate so the drill reflects the decisions immediately.
        proc = subprocess.run(["python3", GENERATOR], capture_output=True, text=True)
        return self._send(
            200,
            json.dumps(
                {
                    "ok": True,
                    "decisions": len(data),
                    "path": os.path.relpath(DECISIONS, LIB),
                    "regenerated": proc.stdout.strip().splitlines()[-1] if proc.stdout else "",
                }
            ),
            "application/json",
        )


if not os.path.exists(DRILL):
    raise SystemExit(
        "no drill to review — run: python3 13_Faculty_Resources/_automation/generate_evidence_drill.py"
    )

print("Drill review  ->  http://localhost:%d/     (Ctrl-C to stop)" % ARGS.port)
try:
    http.server.ThreadingHTTPServer(("127.0.0.1", ARGS.port), Handler).serve_forever()
except KeyboardInterrupt:
    print("\nstopped")
