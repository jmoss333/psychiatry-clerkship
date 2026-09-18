/**
 * bin/probe_egress.py — the session capability probe.
 *
 * The probe answers a question three separate sessions have paid an hour each to answer the
 * hard way: which external hosts can this environment actually reach, and therefore which repo
 * tasks are possible today. It reports and gates nothing, so what needs pinning is not a verdict
 * but the things that would make it harmful or useless:
 *
 *   · it must never make the SessionStart hook fail, hang, or dirty the working tree;
 *   · it must not conflate "the proxy refused the tunnel" with "the host wants credentials",
 *     because that is precisely the confusion that produced the wrong "egress is blocked
 *     except web search" note this script exists to prevent;
 *   · its hook output must stay short, since it lands in every session's context.
 *
 * NO TEST HERE TOUCHES THE NETWORK. The classification tests call the pure mapping functions
 * with synthetic inputs, and every subprocess is run with --targets (which probes nothing) or
 * with CLERKSHIP_SKIP_EGRESS_PROBE set. A test that reached the internet would be exactly the
 * flakiness that keeps bin/check_instrument_links.py out of CI.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repo, 'bin', 'probe_egress.py');
const vitalsHook = path.join(repo, '.claude', 'hooks', 'session_vitals.sh');

/** Run the probe. Callers must pass --targets or the skip env var; nothing here goes online. */
function run(args, env = {}) {
  const proc = spawnSync('python3', [script, ...args], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, CLERKSHIP_SKIP_EGRESS_PROBE: '', ...env },
  });
  return proc;
}

/** Evaluate a snippet against the imported module. Pure functions only — no network. */
function py(snippet) {
  const proc = spawnSync('python3', ['-c', `import sys; sys.path.insert(0, "bin")\nimport probe_egress as P\n${snippet}`], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 60_000,
  });
  assert.equal(proc.status, 0, `python failed: ${proc.stderr}`);
  return proc.stdout.trim();
}

test('the probe is an executable script with a shebang', () => {
  assert.ok(fs.existsSync(script), 'bin/probe_egress.py must exist');
  const text = fs.readFileSync(script, 'utf8');
  assert.match(text, /^#!\/usr\/bin\/env python3/, 'needs a python3 shebang');
  assert.ok(fs.statSync(script).mode & 0o111, 'must be executable');
});

test('the probe carries no machine-specific paths', () => {
  // Same rule the CI path-lint enforces over tracked *.py: derive locations, never hard-code
  // someone's home directory. The cache in particular must come from the environment.
  const text = fs.readFileSync(script, 'utf8');
  assert.doesNotMatch(text, /\/(Users|sessions)\/[a-z]/, 'no machine-specific paths');
});

test('a refused tunnel and a 403 from the host are never the same verdict', () => {
  // The distinction this whole script exists to preserve. Collapsing them is how a session
  // concludes it has no egress when it actually has a credentials problem, or vice versa.
  assert.equal(py('print(P.status_for_failure(OSError("Tunnel connection failed: 403 Forbidden"), 6)[0])'), 'blocked');
  assert.equal(py('print(P.status_for_http(403)[0])'), 'auth');
  assert.notEqual(
    py('print(P.status_for_failure(OSError("Tunnel connection failed: 403 Forbidden"), 6)[0])'),
    py('print(P.status_for_http(403)[0])'),
  );
});

test('any HTTP answer counts as reachable; only quota and auth are demoted', () => {
  assert.equal(py('print(P.status_for_http(200)[0])'), 'open');
  assert.equal(py('print(P.status_for_http(206)[0])'), 'open');
  // A 404 or a 500 still proves egress works, which is the only question the probe asks.
  assert.equal(py('print(P.status_for_http(404)[0])'), 'open');
  assert.equal(py('print(P.status_for_http(500)[0])'), 'open');
  assert.equal(py('print(P.status_for_http(429)[0])'), 'quota');
  assert.equal(py('print(P.status_for_http(401)[0])'), 'auth');
});

test('a timeout is reported as slow, not as blocked', () => {
  // A slow host is reachable; calling it blocked would retire a task that actually works.
  assert.equal(py('print(P.status_for_failure(TimeoutError(), 6)[0])'), 'slow');
  assert.equal(py('print(P.status_for_failure(OSError("Name or service not known"), 6)[0])'), 'blocked');
});

test('every target names the repo task it gates', () => {
  // The probe is only worth its context if it answers in repo terms. A target whose `gates`
  // string is missing tells a session a hostname and nothing it can act on.
  const proc = run(['--targets']);
  assert.equal(proc.status, 0, proc.stderr);
  const count = Number(py('print(len(P.targets()))'));
  assert.ok(count >= 7, `expected the full target list, got ${count}`);
  assert.equal(Number(py('print(sum(1 for t in P.targets() if t.get("gates")))')), count);
  assert.equal(Number(py('print(sum(1 for t in P.targets() if t["url"].startswith("https://")))')), count);
});

test('the custodian target is read from instrument_rights.json, not hard-coded', () => {
  // Hard-coding a custodian host would rot silently the moment the registry moved, and the
  // probe would then report on a host bin/check_instrument_links.py no longer visits.
  const host = py('t=P.custodian_target(); print(t["url"] if t else "")');
  assert.ok(host.startsWith('https://'), 'a custodian target should resolve');
  const rights = JSON.parse(fs.readFileSync(path.join(repo, 'instrument_rights.json'), 'utf8'));
  const known = rights.instruments
    .map((i) => i.officialSource?.formUrl)
    .filter(Boolean)
    .map((u) => new URL(u).host);
  assert.ok(known.includes(new URL(host).host), `${host} must come from the registry`);
});

test('the cache lives outside the repository so probing never dirties the tree', () => {
  const cache = py('print(P.cache_path())');
  assert.ok(!path.resolve(cache).startsWith(repo + path.sep), `cache must not be inside the repo: ${cache}`);
});

test('changing the proxy invalidates the cache', () => {
  // The answers are a property of the egress path. A cache that survived a proxy change would
  // confidently report the previous environment's capabilities.
  const a = py('import os; os.environ["HTTPS_PROXY"]="http://one:1"; print(P.proxy_fingerprint())');
  const b = py('import os; os.environ["HTTPS_PROXY"]="http://two:2"; print(P.proxy_fingerprint())');
  assert.notEqual(a, b);
});

test('the hook rendering stays short enough to belong in every session context', () => {
  const rendered = py(`
items = P.targets()
blob = {"probed": "2026-01-01", "proxy": "test", "cached": True,
        "results": {i["key"]: {"status": P.BLOCKED, "detail": "x"} for i in items}}
print(P.render_vitals(items, blob))`);
  const lines = rendered.split('\n');
  assert.ok(lines.length <= 9, `vitals must stay compact, got ${lines.length} lines:\n${rendered}`);
  // Worst case is everything blocked; the detail list must be capped, not one line per target.
  assert.ok(rendered.includes('more'), 'a capped list should say how many were elided');
});

test('the probe is opt-out and silent when disabled', () => {
  const proc = run(['--vitals'], { CLERKSHIP_SKIP_EGRESS_PROBE: '1' });
  assert.equal(proc.status, 0);
  assert.equal(proc.stdout.trim(), '', 'disabled --vitals must print nothing into session context');
});

test('the SessionStart hook degrades instead of failing', () => {
  // vitals is a report. If the probe is missing, slow, or broken, the session must still get
  // its other vitals — the hook's own stated contract for every probe it runs.
  const hook = fs.readFileSync(vitalsHook, 'utf8');
  assert.match(hook, /probe_egress\.py/, 'the hook should surface the probe');
  assert.match(hook, /\[ -f bin\/probe_egress\.py \]/, 'guard on the script existing');
  assert.match(hook, /CLERKSHIP_SKIP_EGRESS_PROBE/, 'honour the opt-out');
  assert.match(hook, /timeout \d+ python3 bin\/probe_egress\.py --vitals[^\n]*\|\|/, 'bounded and non-fatal');
});
