#!/usr/bin/env python3
"""One-command attestation — single round trip.

Regenerates the attestation tool from current content, serves it locally, and
exposes POST /save so the tool's "Save & rebuild" button writes reviewed.json
and runs the QA gate WITHOUT any manual file move.

Usage:
    python3 13_Faculty_Resources/_automation/attest_serve.py            # serve + gate on save
    python3 13_Faculty_Resources/_automation/attest_serve.py --no-build # serve, skip the gate
Then open the printed URL, attest, click "Save & rebuild". Ctrl-C to stop.
"""
import http.server, json, os, subprocess, argparse, sys

# DEPRECATED (2026-08-12, PR #351 follow-up): reviewed.json is now a validated
# governance ledger — every record carries a faculty-confirmed risk classification,
# and this server's /save wrote the WHOLE file from the posted payload, which would
# strip risk from all 119 records and fail every validator/build. The faculty
# console (clerkship-faculty-attest.netlify.app) is the only contract-preserving
# write path. This file is kept for reference only.
sys.exit(
    "attest_serve.py is DEPRECATED: its /save would strip the ledger's risk "
    "classifications (schema-invalid since PR #351). Use the faculty console instead."
)

HERE = os.path.dirname(os.path.abspath(__file__))
LIB  = os.path.abspath(os.path.join(HERE, "..", ".."))
FAC  = os.path.join(LIB, "13_Faculty_Resources")
RV   = os.path.join(FAC, "reviewed.json")
GEN  = os.path.join(HERE, "build_attest.py")
BUILD = os.path.join(HERE, "site_build", "build_and_check.sh")

ap = argparse.ArgumentParser()
ap.add_argument("--port", type=int, default=8765)
ap.add_argument("--no-build", action="store_true")
ARGS = ap.parse_args()

subprocess.run(["python3", GEN], check=True)   # refresh the tool from current content


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=FAC, **k)

    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.rstrip("/") != "/save":
            return self._json(404, {"ok": False, "error": "not found"})
        try:
            n = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(n))
            assert isinstance(data, dict) and data, "empty or non-object"
            for k, v in data.items():
                assert isinstance(v, dict) and v.get("status") == "reviewed" and v.get("by"), k
        except Exception as e:
            return self._json(400, {"ok": False, "error": "bad reviewed.json: %s" % e})
        with open(RV, "w", encoding="utf-8") as f:
            f.write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        res = {"ok": True, "attested": len(data), "path": os.path.relpath(RV, LIB)}
        if not ARGS.no_build:
            p = subprocess.run(["bash", BUILD, "ms3"], capture_output=True, text=True)
            res["gate"] = "PASS" if p.returncode == 0 else "FAIL"
            res["gate_tail"] = "\n".join((p.stdout + p.stderr).splitlines()[-4:])
        subprocess.run(["python3", GEN])   # refresh served tool to reflect new state
        return self._json(200, res)


url = "http://localhost:%d/attest-batch.html" % ARGS.port
print("Attestation tool  ->  %s     (Ctrl-C to stop)" % url)
try:
    http.server.ThreadingHTTPServer(("127.0.0.1", ARGS.port), Handler).serve_forever()
except KeyboardInterrupt:
    print("\nstopped")
