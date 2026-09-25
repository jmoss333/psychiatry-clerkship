# Usage Analytics — Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a first-party aggregate counter service that records which pages and tools are used on the two clerkship sites, and how far learners get through multi-step tools — storing only integers, never raw events.

**Architecture:** A generated allowlist derived from `shipped_pages.json` defines every legal event key. A tiny client emitter (build-injected into both sites) sends allowlisted keys via `navigator.sendBeacon` to a new, isolated Netlify site (`metrics/`) whose single function validates the key, increments a Netlify Blobs counter, and discards the request. Nothing else is written. Reporting is a separate, later plan.

**Tech Stack:** Python 3.11 (registry deriver, gates), Node 20 + `node:test` (function, emitter, tests), `@netlify/blobs` 11.0.2, Netlify Functions, esbuild bundler.

**Spec:** `docs/superpowers/specs/2026-09-04-usage-analytics-design.md`

## Global Constraints

Every task's requirements implicitly include all of these. Values are copied verbatim from the spec.

- **Never store:** IP address, user agent, session identifier, geolocation, referrer, or any timestamp finer than the ISO week. The function must not log the request either.
- **Stored shape is exactly:** `{ "site": "ms3", "week": "2026-W36", "key": "tool:interview-room:step2", "n": 74 }`
- **`site`** is one of exactly `ms3` or `res`.
- **Suppression threshold** for any reported cell is **n = 5** (reporting is a later plan; the threshold is recorded here so the read CLI honors it).
- **Event keys** match exactly one of: `page:<slug>` or `tool:<tool>:<step>`. Any key not on the generated allowlist is rejected with HTTP 204 (silent to the client, uncounted).
- **localStorage keys must be literal and `cw_`-prefixed.** `check-static-site.mjs` hard-fails any other namespace and warns on computed keys. The only key this feature adds is `cw_analytics_optout_v1`.
- **Client failure is silent and total.** If the endpoint is unreachable, slow, or rejecting, page behavior is unchanged. Analytics must never degrade the library.
- **Honor `navigator.doNotTrack === '1'` and `navigator.globalPrivacyControl === true`** — when either is set, send nothing.
- **Python:** no hard-coded `/Users` or `/sessions` paths in tracked `.py`; derive from `__file__`. CI lints for this.
- **Bash:** target `/bin/bash` 3.2. Write `${ARR[@]+"${ARR[@]}"}`, never bare `"${ARR[@]}"` under `set -u`.
- **After editing `CLAUDE.md`, run `cp CLAUDE.md AGENTS.md`.** CI fails the PR if they diverge. (Only Task 7 touches CLAUDE.md.)

**Known landmine — read before Task 4.** A Netlify site with a `base` directory cancels any build whose commit did not touch that directory, and records the cancel as a **failed deploy**, firing the "Deploy failed" alarm email (~75/day observed on 2026-09-02). `sp-proxy/netlify.toml` solves this with `ignore = "/bin/false"` (exit 1 = "content changed, build"). The metrics site must carry the same line.

**CI contracts — which this plan trips, and which it deliberately avoids.** The spec flagged three. This plan is scoped so only the cheap one applies:

| Contract | Applies? | Why |
|---|---|---|
| `bin/check-verify-coverage.py` | **No** | It enforces that every **ci.yml** step has a local equivalent. This plan adds steps to `verify.sh` only and does **not** touch `ci.yml` — `verify.sh` is allowed to be a superset. |
| `validate_scheduled_workflows.py` step-inventory + sha256 digest | **No** | No workflow YAML is edited, so no digest recompute. |
| `test_validate_registry_schemas.py` `PAIRS` | **Yes** | `PAIRS` is not root-only: it already carries `shipped_pages.json` (and its schema) by full repo-relative path even though that pair lives beside `site_build/`, not at the repo root. `analytics_events.json` follows that same precedent — it needs the identical full-path entry in both `PAIRS` tuples (the validator's and its test's), not an exemption. |

If a later change *does* add an analytics step to `ci.yml`, all three reactivate — recompute the digest by importing the validator's own `_load`/`_contract_digest` rather than reimplementing its canonicalisation.

**Known landmine — stale `_build/`.** Node tests run *before* `build_deploy.py` in `build_and_check.sh`, so a build-output test failing against a stale `_build/` aborts the build that would fix it. If a gate fails on a commit that cannot have caused it, rebuild directly:
```bash
H=13_Faculty_Resources/_automation/site_build
OUT_DIR="$PWD/_build/ms3" python3 "$H/build_deploy.py"
MS3_DIR="$PWD/_build/ms3" OUT_DIR="$PWD/_build/res" python3 "$H/resident_section.py"
```

---

## File Structure

| File | Responsibility |
|---|---|
| `13_Faculty_Resources/_automation/site_build/analytics_events.json` | Hand-edited: tool step lists only. Pages come from `shipped_pages.json`. |
| `13_Faculty_Resources/_automation/site_build/analytics_events.schema.json` | Schema for the above. |
| `13_Faculty_Resources/_automation/site_build/analytics_events.py` | `derive()` / `--write` / `--check`. Generates the bundled allowlist. |
| `13_Faculty_Resources/_automation/site_build/test_analytics_events.py` | Unit tests for the deriver. |
| `metrics/allowlist.json` | GENERATED. Bundled with the function so it can validate offline. |
| `metrics/netlify/functions/_shared/counters.mjs` | Pure counter logic: ISO week, key encoding, increment-with-retry. No I/O except the injected store. |
| `metrics/netlify/functions/ev.mjs` | HTTP handler: validate, increment, 204. |
| `metrics/bin/read_counters.mjs` | Read CLI so collection is verifiable before any dashboard exists. |
| `metrics/tests/counters.test.mjs` | Tests for pure counter logic. |
| `metrics/tests/ev-handler.test.mjs` | Tests for the handler, using a fake store. |
| `metrics/netlify.toml`, `metrics/package.json` | Site config. |
| `13_Faculty_Resources/_automation/site_build/analytics.js` | Client emitter. |
| `tests/analytics-emitter.test.mjs` | Emitter contract tests (no identifier, no free text). |
| `build_deploy.py`, `common.py` | Copy the emitter, inject the tag, widen CSP. |
| `check-static-site.mjs`, `bin/verify.sh`, `decisions.json` | Gates. |

---

### Task 1: Event registry, schema, and allowlist deriver

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/analytics_events.json`
- Create: `13_Faculty_Resources/_automation/site_build/analytics_events.schema.json`
- Create: `13_Faculty_Resources/_automation/site_build/analytics_events.py`
- Test: `13_Faculty_Resources/_automation/site_build/test_analytics_events.py`

**Interfaces:**
- Consumes: `shipped_pages.load_shipped_pages(root)` and `shipped_pages.slugs_for_site(document, site)` (both already exist in `site_build/shipped_pages.py`).
- Produces: `derive(root) -> dict` with shape `{"version": 1, "keys": {"ms3": [...], "res": [...]}}`; `write(root)`; `check(root) -> int` (0 ok, 1 stale). Task 3 and Task 5 consume `metrics/allowlist.json`.

- [ ] **Step 1: Write the registry file**

Create `13_Faculty_Resources/_automation/site_build/analytics_events.json`. Only tool steps are hand-edited; page keys are derived.

```json
{
  "version": 1,
  "_note": "Hand-edited: tool step lists ONLY. Page keys derive from shipped_pages.json. Regenerate the bundled allowlist: python3 13_Faculty_Resources/_automation/site_build/analytics_events.py --write",
  "tools": {
    "interview-room": ["open", "first-turn", "five-turns", "wrapped"],
    "reasoning-workbench": ["open", "step1", "step2", "step3", "done"]
  }
}
```

- [ ] **Step 2: Write the schema**

Create `13_Faculty_Resources/_automation/site_build/analytics_events.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "analytics_events",
  "type": "object",
  "required": ["version", "tools"],
  "additionalProperties": false,
  "properties": {
    "version": { "const": 1 },
    "_note": { "type": "string" },
    "tools": {
      "type": "object",
      "minProperties": 1,
      "additionalProperties": {
        "type": "array",
        "minItems": 1,
        "items": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]{0,31}$" }
      },
      "propertyNames": { "pattern": "^[a-z0-9][a-z0-9-]{0,31}$" }
    }
  }
}
```

- [ ] **Step 3: Write the failing test**

Create `13_Faculty_Resources/_automation/site_build/test_analytics_events.py`:

```python
#!/usr/bin/env python3
"""Unit tests for analytics_events.derive()."""
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import analytics_events as ae  # noqa: E402


class DeriveTests(unittest.TestCase):
    def test_every_page_key_names_a_shipped_slug(self):
        doc = ae.derive()
        import shipped_pages as sp
        shipped = sp.load_shipped_pages()
        for site in ("ms3", "res"):
            allowed = sp.slugs_for_site(shipped, site)
            for key in doc["keys"][site]:
                if key.startswith("page:"):
                    self.assertIn(key[len("page:"):], allowed, key)

    def test_tool_keys_appear_on_both_sites(self):
        doc = ae.derive()
        tools = {k for k in doc["keys"]["ms3"] if k.startswith("tool:")}
        self.assertTrue(tools, "expected at least one tool key")
        self.assertEqual(tools, {k for k in doc["keys"]["res"] if k.startswith("tool:")})

    def test_keys_are_sorted_and_unique(self):
        doc = ae.derive()
        for site in ("ms3", "res"):
            keys = doc["keys"][site]
            self.assertEqual(keys, sorted(keys))
            self.assertEqual(len(keys), len(set(keys)))

    def test_rejects_a_tool_step_with_illegal_characters(self):
        with self.assertRaises(ae.AnalyticsEventsError):
            ae._tool_keys({"tools": {"bad tool": ["open"]}})


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 4: Run it to make sure it fails**

Run: `python3 13_Faculty_Resources/_automation/site_build/test_analytics_events.py`
Expected: FAIL with `ModuleNotFoundError: No module named 'analytics_events'`

- [ ] **Step 5: Write the deriver**

Create `13_Faculty_Resources/_automation/site_build/analytics_events.py`:

```python
#!/usr/bin/env python3
"""Derive the analytics event allowlist.

Page keys come from shipped_pages.json, so "what can be measured" and "what
ships" are the same set by construction (ADR-002). Tool step keys come from the
hand-edited analytics_events.json. The result is bundled with the metrics
function so it can validate offline.
"""
import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)

import shipped_pages as sp  # noqa: E402

REGISTRY = os.path.join(HERE, "analytics_events.json")
RELATIVE_ALLOWLIST = os.path.join("metrics", "allowlist.json")
VERSION = 1
SITES = ("ms3", "res")
SEGMENT = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")


class AnalyticsEventsError(Exception):
    pass


def _load_registry():
    try:
        with open(REGISTRY, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError) as exc:
        raise AnalyticsEventsError("analytics_events.json unreadable: %s" % exc)


def _tool_keys(registry):
    """Every tool:<tool>:<step> key. Raises on a malformed tool or step name."""
    tools = registry.get("tools")
    if not isinstance(tools, dict) or not tools:
        raise AnalyticsEventsError("analytics_events.json: tools must be non-empty")
    keys = []
    for tool, steps in tools.items():
        if not SEGMENT.match(tool):
            raise AnalyticsEventsError("illegal tool name: %r" % tool)
        if not isinstance(steps, list) or not steps:
            raise AnalyticsEventsError("tool %s: steps must be a non-empty list" % tool)
        for step in steps:
            if not isinstance(step, str) or not SEGMENT.match(step):
                raise AnalyticsEventsError("tool %s: illegal step %r" % (tool, step))
            keys.append("tool:%s:%s" % (tool, step))
    return sorted(set(keys))


def derive(root=ROOT):
    """Return {"version": 1, "keys": {"ms3": [...], "res": [...]}}."""
    registry = _load_registry()
    tool_keys = _tool_keys(registry)
    document = sp.load_shipped_pages(root)
    keys = {}
    for site in SITES:
        page_keys = ["page:%s" % slug for slug in sp.slugs_for_site(document, site)]
        keys[site] = sorted(set(page_keys) | set(tool_keys))
    return {"version": VERSION, "keys": keys}


def serialize(document):
    return json.dumps(document, indent=2, ensure_ascii=False, sort_keys=True) + "\n"


def write(root=ROOT):
    path = os.path.join(os.fspath(root), RELATIVE_ALLOWLIST)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(serialize(derive(root)))
    print("analytics allowlist: wrote %s" % RELATIVE_ALLOWLIST)
    return 0


def check(root=ROOT):
    path = os.path.join(os.fspath(root), RELATIVE_ALLOWLIST)
    try:
        with open(path, encoding="utf-8") as fh:
            on_disk = fh.read()
    except OSError:
        print("analytics allowlist: %s missing — run --write" % RELATIVE_ALLOWLIST)
        return 1
    if on_disk != serialize(derive(root)):
        print("analytics allowlist: %s is stale — run --write" % RELATIVE_ALLOWLIST)
        return 1
    print("analytics allowlist OK — %d ms3 key(s), %d res key(s)"
          % (len(derive(root)["keys"]["ms3"]), len(derive(root)["keys"]["res"])))
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description="Derive the analytics event allowlist.")
    parser.add_argument("--root", default=ROOT)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--write", action="store_true")
    group.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    try:
        return write(args.root) if args.write else check(args.root)
    except (AnalyticsEventsError, sp.ShippedPagesError) as exc:
        print("analytics allowlist: %s" % exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 6: Generate the allowlist and run the tests**

Run:
```bash
python3 13_Faculty_Resources/_automation/site_build/analytics_events.py --write
python3 13_Faculty_Resources/_automation/site_build/test_analytics_events.py
python3 13_Faculty_Resources/_automation/site_build/analytics_events.py --check
```
Expected: the write prints a path, all 4 tests PASS, `--check` prints `analytics allowlist OK` and exits 0.

- [ ] **Step 7: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/analytics_events.json \
        13_Faculty_Resources/_automation/site_build/analytics_events.schema.json \
        13_Faculty_Resources/_automation/site_build/analytics_events.py \
        13_Faculty_Resources/_automation/site_build/test_analytics_events.py \
        metrics/allowlist.json
git commit -m "feat(analytics): derive the event allowlist from shipped_pages.json"
```

---

### Task 2: Pure counter logic

**Files:**
- Create: `metrics/netlify/functions/_shared/counters.mjs`
- Test: `metrics/tests/counters.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `isoWeek(date) -> string` (e.g. `"2026-W36"`); `blobKey(site, week, eventKey) -> string`; `increment(store, {site, week, key}) -> Promise<number>` returning the new count. Task 3 consumes all three.

**Design note on the race.** Netlify Blobs has no atomic increment, so `increment` is read-modify-write with bounded retries. One blob per counter keeps contention to a single (site, week, key) triple; with cohorts of 4–10 learners, concurrent writes to the same triple are rare and a lost update costs one count. This is a deliberate accuracy-for-simplicity trade, recorded here so nobody "fixes" it into a transaction later.

- [ ] **Step 1: Write the failing test**

Create `metrics/tests/counters.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek, blobKey, increment } from '../netlify/functions/_shared/counters.mjs';

test('isoWeek formats an ISO week-numbering date', () => {
  assert.equal(isoWeek(new Date('2026-09-04T12:00:00Z')), '2026-W36');
  // 2027-01-01 is a Friday and belongs to ISO week 53 of 2026.
  assert.equal(isoWeek(new Date('2027-01-01T00:00:00Z')), '2026-W53');
  // 2026-01-01 is a Thursday, so it is week 1 of 2026.
  assert.equal(isoWeek(new Date('2026-01-01T00:00:00Z')), '2026-W01');
});

test('blobKey is stable and contains no separator ambiguity', () => {
  assert.equal(blobKey('ms3', '2026-W36', 'tool:interview-room:step2'),
    'ms3/2026-W36/tool%3Ainterview-room%3Astep2');
});

test('increment creates a counter at 1 then advances it', async () => {
  const data = new Map();
  const store = {
    async get(k) { return data.has(k) ? JSON.parse(data.get(k)) : null; },
    async setJSON(k, v) { data.set(k, JSON.stringify(v)); },
  };
  const at = { site: 'ms3', week: '2026-W36', key: 'page:t_mood.md' };
  assert.equal(await increment(store, at), 1);
  assert.equal(await increment(store, at), 2);
  const stored = JSON.parse(data.get(blobKey(at.site, at.week, at.key)));
  assert.deepEqual(stored, { site: 'ms3', week: '2026-W36', key: 'page:t_mood.md', n: 2 });
});

test('increment stores no field beyond the four in the schema', async () => {
  const data = new Map();
  const store = {
    async get(k) { return data.has(k) ? JSON.parse(data.get(k)) : null; },
    async setJSON(k, v) { data.set(k, JSON.stringify(v)); },
  };
  await increment(store, { site: 'res', week: '2026-W36', key: 'page:x.md' });
  const stored = JSON.parse([...data.values()][0]);
  assert.deepEqual(Object.keys(stored).sort(), ['key', 'n', 'site', 'week']);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd metrics && node --test tests/counters.test.mjs`
Expected: FAIL — cannot find module `_shared/counters.mjs`

- [ ] **Step 3: Write the implementation**

Create `metrics/netlify/functions/_shared/counters.mjs`:

```javascript
// Pure counter logic. No network, no Netlify imports — the store is injected so
// every branch is testable offline.

const RETRIES = 3;

/** ISO-8601 week-numbering string, e.g. "2026-W36". Weeks, never timestamps. */
export function isoWeek(date) {
  // Copy to UTC midnight so DST and local offsets cannot shift the day.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO weekday: Mon=1..Sun=7. Move to the Thursday of this week; the year of
  // that Thursday is the ISO week-numbering year, by definition.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** One blob per (site, week, key). Percent-encoding keeps ':' out of the path. */
export function blobKey(site, week, eventKey) {
  return `${site}/${week}/${encodeURIComponent(eventKey)}`;
}

/**
 * Read-modify-write with bounded retries. Netlify Blobs has no atomic
 * increment; at cohort sizes of 4-10 a lost update costs one count, which is
 * cheaper than a transaction. Deliberate — see the plan's design note.
 */
export async function increment(store, { site, week, key }) {
  let lastError;
  for (let attempt = 0; attempt < RETRIES; attempt += 1) {
    try {
      const path = blobKey(site, week, key);
      const current = await store.get(path, { type: 'json' });
      const n = (Number.isInteger(current?.n) ? current.n : 0) + 1;
      await store.setJSON(path, { site, week, key, n });
      return n;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd metrics && node --test tests/counters.test.mjs`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add metrics/netlify/functions/_shared/counters.mjs metrics/tests/counters.test.mjs
git commit -m "feat(metrics): pure counter logic — ISO weeks, one blob per counter"
```

---

### Task 3: The /api/ev handler

**Files:**
- Create: `metrics/netlify/functions/ev.mjs`
- Test: `metrics/tests/ev-handler.test.mjs`

**Interfaces:**
- Consumes: `isoWeek`, `increment` from Task 2; `metrics/allowlist.json` from Task 1.
- Produces: `createEv({ store, allowlist, now, origins }) -> (request) => Promise<Response>`. Task 4 wires it to Netlify.

- [ ] **Step 1: Write the failing test**

Create `metrics/tests/ev-handler.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEv } from '../netlify/functions/ev.mjs';

const ALLOWLIST = { version: 1, keys: { ms3: ['page:t_mood.md', 'tool:interview-room:open'], res: ['page:x.md'] } };
const ORIGINS = ['https://une-ms3-psychiatry.netlify.app', 'https://mmc-psychiatry-residents-sanford.netlify.app'];

function fakeStore() {
  const data = new Map();
  return {
    data,
    async get(k) { return data.has(k) ? JSON.parse(data.get(k)) : null; },
    async setJSON(k, v) { data.set(k, JSON.stringify(v)); },
  };
}

function post(body, origin = ORIGINS[0]) {
  return new Request('https://metrics.invalid/api/ev', {
    method: 'POST', headers: { 'Content-Type': 'application/json', origin },
    body: JSON.stringify(body),
  });
}

const build = (store) => createEv({
  store, allowlist: ALLOWLIST, origins: ORIGINS,
  now: () => new Date('2026-09-04T12:00:00Z'),
});

test('counts an allowlisted key', async () => {
  const store = fakeStore();
  const res = await build(store)(post({ site: 'ms3', keys: ['page:t_mood.md'] }));
  assert.equal(res.status, 204);
  assert.deepEqual(await store.get('ms3/2026-W36/page%3At_mood.md'),
    { site: 'ms3', week: '2026-W36', key: 'page:t_mood.md', n: 1 });
});

test('silently drops a key that is not on the allowlist', async () => {
  const store = fakeStore();
  const res = await build(store)(post({ site: 'ms3', keys: ['page:../../etc/passwd', 'free text'] }));
  assert.equal(res.status, 204, 'never tells a probe which keys are real');
  assert.equal(store.data.size, 0, 'nothing outside the allowlist may enter the store');
});

test('drops a key allowlisted for the OTHER site', async () => {
  const store = fakeStore();
  await build(store)(post({ site: 'ms3', keys: ['page:x.md'] }));
  assert.equal(store.data.size, 0);
});

test('rejects an unknown site', async () => {
  const store = fakeStore();
  const res = await build(store)(post({ site: 'faculty', keys: ['page:t_mood.md'] }));
  assert.equal(res.status, 204);
  assert.equal(store.data.size, 0);
});

test('caps the batch and dedups within it', async () => {
  const store = fakeStore();
  await build(store)(post({ site: 'ms3', keys: Array(50).fill('page:t_mood.md') }));
  assert.equal((await store.get('ms3/2026-W36/page%3At_mood.md')).n, 1,
    'a repeated key in one batch counts once');
});

test('rejects a non-POST', async () => {
  const res = await build(fakeStore())(new Request('https://metrics.invalid/api/ev', { method: 'GET' }));
  assert.equal(res.status, 405);
});

test('rejects an origin that is not a learner site', async () => {
  const store = fakeStore();
  const res = await build(store)(post({ site: 'ms3', keys: ['page:t_mood.md'] }, 'https://evil.invalid'));
  assert.equal(res.status, 403);
  assert.equal(store.data.size, 0);
});

test('a store failure still returns 204 and never throws to the client', async () => {
  const store = { async get() { throw new Error('blobs down'); }, async setJSON() {} };
  const res = await build(store)(post({ site: 'ms3', keys: ['page:t_mood.md'] }));
  assert.equal(res.status, 204);
});

test('malformed JSON is a 204, not a 500', async () => {
  const req = new Request('https://metrics.invalid/api/ev', {
    method: 'POST', headers: { 'Content-Type': 'application/json', origin: ORIGINS[0] }, body: '{oops',
  });
  assert.equal((await build(fakeStore())(req)).status, 204);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd metrics && node --test tests/ev-handler.test.mjs`
Expected: FAIL — cannot find module `ev.mjs`

- [ ] **Step 3: Write the handler**

Create `metrics/netlify/functions/ev.mjs`:

```javascript
import { getStore } from '@netlify/blobs';

import { isoWeek, increment } from './_shared/counters.mjs';
import allowlistJson from '../../allowlist.json' with { type: 'json' };

const SITES = new Set(['ms3', 'res']);
const MAX_KEYS = 20;
const MAX_BODY_BYTES = 4096;

const LEARNER_ORIGINS = [
  'https://une-ms3-psychiatry.netlify.app',
  'https://mmc-psychiatry-residents-sanford.netlify.app',
];

function noContent(origin) {
  // 204 for everything the client could get wrong. A probe must not be able to
  // learn which keys exist by watching status codes.
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function createEv({ store, allowlist, now = () => new Date(), origins = LEARNER_ORIGINS }) {
  const allowed = {
    ms3: new Set(allowlist.keys.ms3),
    res: new Set(allowlist.keys.res),
  };

  return async function ev(request) {
    const origin = request.headers.get('origin') || '';

    if (request.method === 'OPTIONS') {
      if (!origins.includes(origin)) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    if (!origins.includes(origin)) return new Response(null, { status: 403 });

    // Deliberately NOT read or logged: IP, user agent, referrer. There is no
    // logging in this function at all; Netlify's own function logs would
    // otherwise reintroduce the IPs this design promises never to keep.
    let payload;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) return noContent(origin);
      payload = JSON.parse(text);
    } catch {
      return noContent(origin);
    }

    const site = payload?.site;
    if (!SITES.has(site)) return noContent(origin);

    const keys = Array.isArray(payload?.keys) ? payload.keys.slice(0, MAX_KEYS) : [];
    const unique = [...new Set(keys.filter((k) => typeof k === 'string' && allowed[site].has(k)))];

    const week = isoWeek(now());
    for (const key of unique) {
      try {
        await increment(store, { site, week, key });
      } catch {
        // A store failure must never surface to the learner's page.
      }
    }
    return noContent(origin);
  };
}

export default createEv({
  store: getStore('usage-counters'),
  allowlist: allowlistJson,
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd metrics && node --test tests/ev-handler.test.mjs`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add metrics/netlify/functions/ev.mjs metrics/tests/ev-handler.test.mjs
git commit -m "feat(metrics): /api/ev — allowlist-gated, 204-always, no request logging"
```

---

### Task 4: Netlify site config and the read CLI

**Files:**
- Create: `metrics/netlify.toml`
- Create: `metrics/package.json`
- Create: `metrics/bin/read_counters.mjs`

**Interfaces:**
- Consumes: `ev.mjs` default export (Task 3), `blobKey` (Task 2).
- Produces: a deployable site at `/api/ev`, and `node metrics/bin/read_counters.mjs --site ms3 --week 2026-W36` printing counters with n<5 suppressed.

- [ ] **Step 1: Write `metrics/package.json`**

```json
{
  "name": "clerkship-metrics",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": { "test": "node --test tests/*.test.mjs" },
  "dependencies": { "@netlify/blobs": "11.0.2" }
}
```

- [ ] **Step 2: Write `metrics/netlify.toml`**

The `ignore = "/bin/false"` line is load-bearing — see the landmine note in Global Constraints.

```toml
# Usage-analytics collector — its own tiny Netlify site (same repo, base directory: metrics).
# Kept SEPARATE from sp-proxy so analytics never shares a deployment bundle with the LLM
# API key, and so an analytics change never re-opens sp-proxy's REDTEAM_CHECKLIST.
#
# `ignore = "/bin/false"` = ALWAYS BUILD, NEVER "CANCEL". A site with a base directory
# otherwise cancels any build whose commit did not touch metrics/, and Netlify records that
# cancel as a FAILED deploy — firing the "Deploy failed" alarm on every unrelated push
# (~75/day observed 2026-09-02). Exit 1 means "content changed, build". See sp-proxy/netlify.toml.
[build]
  publish = "."
  command = "npm ci --omit=dev"
  ignore = "/bin/false"

[build.environment]
  NODE_VERSION = "20"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"

# Pinned explicitly: in-source route registration was observed NOT to register on the live
# sp-proxy deploy, so the path fell through to the static 404 (which carries no CORS header)
# and the browser reported a generic load failure. Status 200 = rewrite, not redirect.
[[redirects]]
  from = "/api/ev"
  to = "/.netlify/functions/ev"
  status = 200
  force = true
```

- [ ] **Step 3: Write the read CLI**

Create `metrics/bin/read_counters.mjs`:

```javascript
#!/usr/bin/env node
// Read counters for one site+week. Honors the n<5 suppression threshold so the
// CLI cannot become a back door around the reporting rule.
import { getStore } from '@netlify/blobs';

const SUPPRESS_BELOW = 5;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const site = arg('site', 'ms3');
const week = arg('week', null);
const raw = process.argv.includes('--raw');
if (!week) {
  console.error('usage: read_counters.mjs --site <ms3|res> --week <YYYY-Www> [--raw]');
  process.exit(2);
}

const store = getStore('usage-counters');
const { blobs } = await store.list({ prefix: `${site}/${week}/` });
const rows = [];
for (const blob of blobs) {
  const row = await store.get(blob.key, { type: 'json' });
  if (row) rows.push(row);
}
rows.sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));

console.log(`${site} · ${week} · ${rows.length} counter(s)`);
for (const row of rows) {
  const shown = !raw && row.n < SUPPRESS_BELOW ? `<${SUPPRESS_BELOW}` : String(row.n);
  console.log(`  ${shown.padStart(5)}  ${row.key}`);
}
if (!raw) console.log(`\n(cells below ${SUPPRESS_BELOW} suppressed; --raw to override locally)`);
```

- [ ] **Step 4: Verify the package installs and the suite passes**

Run:
```bash
cd metrics && npm install && node --test tests/*.test.mjs
```
Expected: install succeeds; 13 tests PASS (4 from Task 2, 9 from Task 3).

- [ ] **Step 5: Commit**

```bash
git add metrics/package.json metrics/package-lock.json metrics/netlify.toml metrics/bin/read_counters.mjs
git commit -m "feat(metrics): Netlify site config and a suppression-honoring read CLI"
```

- [ ] **Step 6: Create the Netlify site (manual, by the repo owner)**

This step is not automatable from the repo — Netlify site creation and env config live in the Netlify UI, as they do for the other three sites.

1. New site from the same GitHub repo, **base directory `metrics`**.
2. Site name: `clerkship-metrics` (the emitter in Task 5 hard-codes `https://clerkship-metrics.netlify.app`; if a different name is used, update Task 5's `ENDPOINT` and Task 6's CSP in the same commit).
3. No environment variables are required — the function reads no secrets.
4. After the first deploy, confirm the route: `curl -i -X OPTIONS https://clerkship-metrics.netlify.app/api/ev -H 'origin: https://une-ms3-psychiatry.netlify.app'` returns **204** with an `Access-Control-Allow-Origin` header. A 404 means the redirect did not register.

---

### Task 5: Client emitter

**Files:**
- Create: `13_Faculty_Resources/_automation/site_build/analytics.js`
- Test: `tests/analytics-emitter.test.mjs`

**Interfaces:**
- Consumes: the `/api/ev` contract from Task 3 (`{site, keys[]}`).
- Produces: a browser global `window.cwAnalytics = { record(key), optOut(), optIn(), enabled() }`. Task 6 injects the file.

- [ ] **Step 1: Write the failing test**

Create `tests/analytics-emitter.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SRC = path.join(process.cwd(), '13_Faculty_Resources/_automation/site_build/analytics.js');
const source = fs.readFileSync(SRC, 'utf8');

function load({ dnt = undefined, gpc = undefined, stored = null, site = 'ms3' } = {}) {
  const sent = [];
  const store = { value: stored };
  const win = {
    CW_SITE: site,
    navigator: {
      doNotTrack: dnt,
      globalPrivacyControl: gpc,
      sendBeacon: (url, body) => { sent.push({ url, body: JSON.parse(body) }); return true; },
    },
    localStorage: {
      getItem: (k) => (k === 'cw_analytics_optout_v1' ? store.value : null),
      setItem: (k, v) => { if (k === 'cw_analytics_optout_v1') store.value = v; },
      removeItem: (k) => { if (k === 'cw_analytics_optout_v1') store.value = null; },
    },
    addEventListener() {},
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(source, win);
  return { api: win.cwAnalytics, sent, store };
}

test('records an event as a beacon to /api/ev', () => {
  const { api, sent } = load();
  api.record('page:t_mood.md');
  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /\/api\/ev$/);
  assert.deepEqual(sent[0].body, { site: 'ms3', keys: ['page:t_mood.md'] });
});

test('transmits no identifier and no timestamp', () => {
  const { api, sent } = load();
  api.record('page:t_mood.md');
  assert.deepEqual(Object.keys(sent[0].body).sort(), ['keys', 'site'],
    'the payload has exactly two fields: site and keys');
  const serialized = JSON.stringify(sent[0].body);
  assert.doesNotMatch(serialized, /\d{4}-\d{2}-\d{2}T/, 'no timestamp');
  assert.doesNotMatch(serialized, /session|visit|uuid|[0-9a-f]{16}/i, 'no identifier');
});

test('dedups a repeated key within the visit', () => {
  const { api, sent } = load();
  api.record('tool:interview-room:open');
  api.record('tool:interview-room:open');
  assert.equal(sent.length, 1, 'a refresh or replay must not double-count');
});

test('sends nothing when Do Not Track is set', () => {
  const { api, sent } = load({ dnt: '1' });
  api.record('page:t_mood.md');
  assert.equal(sent.length, 0);
});

test('sends nothing when Global Privacy Control is set', () => {
  const { api, sent } = load({ gpc: true });
  api.record('page:t_mood.md');
  assert.equal(sent.length, 0);
});

test('sends nothing when the learner has opted out', () => {
  const { api, sent } = load({ stored: '1' });
  api.record('page:t_mood.md');
  assert.equal(sent.length, 0);
  assert.equal(api.enabled(), false);
});

test('optOut persists to the cw_-namespaced key and takes effect immediately', () => {
  const { api, sent, store } = load();
  api.optOut();
  api.record('page:t_mood.md');
  assert.equal(store.value, '1');
  assert.equal(sent.length, 0);
  api.optIn();
  api.record('page:t_mood.md');
  assert.equal(sent.length, 1);
});

test('a throwing sendBeacon never propagates to the page', () => {
  const sent = [];
  const win = {
    CW_SITE: 'ms3',
    navigator: {
      sendBeacon: () => { throw new Error('beacon blocked by an extension'); },
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(source, win);
  assert.doesNotThrow(() => win.cwAnalytics.record('page:t_mood.md'));
  assert.equal(sent.length, 0);
});

test('a throwing localStorage does not disable the page', () => {
  const win = {
    CW_SITE: 'ms3',
    navigator: { sendBeacon: () => true },
    localStorage: { getItem: () => { throw new Error('site data blocked'); }, setItem() {}, removeItem() {} },
    addEventListener() {},
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(source, win);
  assert.doesNotThrow(() => win.cwAnalytics.record('page:t_mood.md'));
});

test('the source references only the one sanctioned storage key', () => {
  const keys = [...source.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.ok(keys.length > 0, 'expected at least one storage access');
  for (const k of keys) assert.equal(k, 'cw_analytics_optout_v1');
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/analytics-emitter.test.mjs`
Expected: FAIL — `ENOENT` reading `analytics.js`

- [ ] **Step 3: Write the emitter**

Create `13_Faculty_Resources/_automation/site_build/analytics.js`:

```javascript
/* Usage analytics emitter. Sends allowlisted event keys and nothing else.
 *
 * Never transmitted: any identifier, timestamp, URL, referrer, or free text.
 * The visit set below lives in memory only; it exists so a refresh does not
 * double-count a step, and it is never serialized or sent.
 *
 * Every failure path is silent. If this file throws, the page must not notice.
 */
(function (w) {
  var ENDPOINT = 'https://clerkship-metrics.netlify.app/api/ev';
  var OPTOUT_KEY = 'cw_analytics_optout_v1';
  var seen = {};

  function optedOut() {
    try {
      return w.localStorage.getItem(OPTOUT_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function signalsPrivacy() {
    var nav = w.navigator || {};
    return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
  }

  function enabled() {
    return !signalsPrivacy() && !optedOut();
  }

  function record(key) {
    try {
      if (typeof key !== 'string' || !key) return;
      if (!enabled()) return;
      if (seen[key]) return;
      seen[key] = true;
      var site = w.CW_SITE === 'res' ? 'res' : 'ms3';
      w.navigator.sendBeacon(ENDPOINT, JSON.stringify({ site: site, keys: [key] }));
    } catch (e) {
      // Silent by contract.
    }
  }

  function optOut() {
    try { w.localStorage.setItem(OPTOUT_KEY, '1'); } catch (e) { /* silent */ }
  }

  function optIn() {
    try { w.localStorage.removeItem(OPTOUT_KEY); } catch (e) { /* silent */ }
  }

  w.cwAnalytics = { record: record, optOut: optOut, optIn: optIn, enabled: enabled };
}(typeof window !== 'undefined' ? window : this));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/analytics-emitter.test.mjs`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/analytics.js tests/analytics-emitter.test.mjs
git commit -m "feat(analytics): client emitter — allowlisted keys only, silent on every failure"
```

---

### Task 6: Build integration — copy, inject, widen CSP

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py` (asset copy near line 402; CSP string at line 531)
- Modify: `13_Faculty_Resources/_automation/site_build/common.py` (near `CLINICAL_CSS_LINK`, line 372; injection near line 560)
- Modify: `13_Faculty_Resources/_automation/site_build/resident_section.py` (CW_SITE relabel)
- Test: `tests/analytics-build.test.mjs`

**Interfaces:**
- Consumes: `analytics.js` (Task 5).
- Produces: `/analytics.js` on both built sites, a `<script>` tag and `window.CW_SITE` in every built page's `<head>`, and `https://clerkship-metrics.netlify.app` in the CSP `connect-src`.

- [ ] **Step 1: Write the failing test**

Create `tests/analytics-build.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repo = process.cwd();
const METRICS_ORIGIN = 'https://clerkship-metrics.netlify.app';

for (const site of ['ms3', 'res']) {
  const out = path.join(repo, '_build', site);

  test(`(build ${site}) ships analytics.js`, (t) => {
    if (!fs.existsSync(out)) { t.skip(`no _build/${site}`); return; }
    assert.ok(fs.existsSync(path.join(out, 'analytics.js')), 'analytics.js copied to the site root');
  });

  test(`(build ${site}) CSP allows the metrics origin and nothing new besides`, (t) => {
    if (!fs.existsSync(out)) { t.skip(`no _build/${site}`); return; }
    const headers = fs.readFileSync(path.join(out, '_headers'), 'utf8');
    const connect = /connect-src ([^;]+);/.exec(headers);
    assert.ok(connect, 'connect-src present');
    const origins = connect[1].trim().split(/\s+/);
    assert.deepEqual(origins.sort(), [
      "'self'", METRICS_ORIGIN, 'https://sp-interview-proxy.netlify.app',
    ].sort(), 'connect-src gained exactly the metrics origin');
  });

  test(`(build ${site}) index.html declares CW_SITE and loads the emitter`, (t) => {
    if (!fs.existsSync(out)) { t.skip(`no _build/${site}`); return; }
    const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.match(html, /<script src="\/analytics\.js" defer><\/script>/);
    assert.match(html, new RegExp(`window\\.CW_SITE='${site}'`));
  });
}
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/analytics-build.test.mjs`
Expected: FAIL on `analytics.js copied to the site root` (or skip if `_build/` is absent — if it skips, run a build first, see the stale-`_build` note in Global Constraints).

- [ ] **Step 3: Add the shared tag constant in `common.py`**

Immediately after the `CLINICAL_CSS_LINK` definition (line 372):

```python
CLINICAL_CSS_LINK = '<link rel="stylesheet" href="/clinical-warm.css">'
# Usage analytics. CW_SITE tells the emitter which site it is on; the emitter
# sends only allowlisted keys and never an identifier. See
# docs/superpowers/specs/2026-09-04-usage-analytics-design.md
ANALYTICS_TAG = '<script src="/analytics.js" defer></script>'


def analytics_head(site):
    """The two tags every built page carries, in <head> order."""
    return "<script>window.CW_SITE='%s'</script>%s" % (site, ANALYTICS_TAG)
```

- [ ] **Step 4: Copy the asset in `build_deploy.py`**

Beside the existing `CLINICAL_CSS` constant (line 19):

```python
CLINICAL_CSS=os.path.join(HERE,"clinical-warm.css")       # shared dark-mode tokens
ANALYTICS_JS=os.path.join(HERE,"analytics.js")            # usage analytics emitter
```

And beside the existing copy (line 402):

```python
_copy_required(CLINICAL_CSS, OUT+"/clinical-warm.css", _missing_req)  # shared dark-mode tokens (linked into tools below)
_copy_required(ANALYTICS_JS, OUT+"/analytics.js", _missing_req)       # usage analytics emitter (tag injected per page)
```

- [ ] **Step 5: Widen the CSP in `build_deploy.py`**

In the `_headers` string at line 531, change the `connect-src` directive only. Find:

```
connect-src 'self' https://sp-interview-proxy.netlify.app;
```

Replace with:

```
connect-src 'self' https://sp-interview-proxy.netlify.app https://clerkship-metrics.netlify.app;
```

Leave every other directive byte-identical. Widening `connect-src` is the entire security cost of this feature; it is deliberate and reviewable, and it is why no third-party tracker can be added without an equally visible diff.

- [ ] **Step 6: Inject the tag into built pages**

The page-polish pass in `common.py` already injects the stylesheet into `</head>` (around line 560). Add the analytics injection immediately after it, in the same function. Find:

```python
    # Dark tokens come from the linked stylesheet — one file, not N inline copies.
    if '[data-theme="dark"]' not in t and "clinical-warm.css" not in t and "</head>" in t:
        t = t.replace("</head>", CLINICAL_CSS_LINK + "\n</head>", 1)
```

Add directly beneath it:

```python
    # Usage analytics. Injected here so every polished page carries it from one
    # source; the emitter itself sends only allowlisted keys. The default site is
    # ms3 because resident_section.py derives the resident build from the MS3 one
    # and rewrites CW_SITE in its own pass (see below).
    if "analytics.js" not in t and "</head>" in t:
        t = t.replace("</head>", analytics_head("ms3") + "\n</head>", 1)
```

- [ ] **Step 7: Rewrite CW_SITE in the resident pass**

`resident_section.py` derives the resident build from the finished MS3 build, so every page arrives carrying `window.CW_SITE='ms3'`. Without this the resident site would report its traffic as MS3 — a silent, total mislabelling of one audience.

In `resident_section.py`, in the same per-page rewrite that applies the other resident substitutions, add:

```python
    # The resident build is derived from the MS3 output, so pages arrive labelled
    # ms3. Relabel before writing, or every resident event is counted as MS3.
    t = t.replace("window.CW_SITE='ms3'", "window.CW_SITE='res'")
```

Verify placement with `grep -n "def .*(" 13_Faculty_Resources/_automation/site_build/resident_section.py` and put it alongside the existing text substitutions, before the file is written.

- [ ] **Step 8: Rebuild and run the tests**

Run:
```bash
H=13_Faculty_Resources/_automation/site_build
OUT_DIR="$PWD/_build/ms3" python3 "$H/build_deploy.py"
MS3_DIR="$PWD/_build/ms3" OUT_DIR="$PWD/_build/res" python3 "$H/resident_section.py"
node --test tests/analytics-build.test.mjs
```
Expected: PASS, 6 tests (3 per site)

- [ ] **Step 9: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/build_deploy.py \
        13_Faculty_Resources/_automation/site_build/common.py \
        13_Faculty_Resources/_automation/site_build/resident_section.py \
        tests/analytics-build.test.mjs
git commit -m "feat(analytics): ship the emitter on both sites and widen connect-src"
```

---

### Task 7: Gates — QA rule, verify.sh, decision record, docs

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/check-static-site.mjs` (near line 452)
- Modify: `bin/verify.sh` (near line 102)
- Modify: `decisions.json`
- Modify: `CLAUDE.md`, then `cp CLAUDE.md AGENTS.md`

**Interfaces:**
- Consumes: `metrics/allowlist.json` (Task 1), built output (Task 6).
- Produces: a hard build failure if any built page records a key outside the allowlist.

- [ ] **Step 1: Add the QA gate rule**

In `check-static-site.mjs`, after the storage-namespace rule (line 452), add:

```javascript
  // DECISION: analytics-allowlist  (decisions.json; bin/check_decision_drift.py)
  // Every cwAnalytics.record() argument must be a literal on the generated allowlist.
  // A computed or unlisted key is how free text — and therefore PHI — would reach the
  // counter store, which the design forbids structurally rather than by policy.
  const recorded = [...html.matchAll(/cwAnalytics\.record\(\s*(['"])([^'"]+)\1\s*\)/g)].map(m => m[2]);
  for (const k of recorded) if (!ANALYTICS_KEYS.has(k)) H(`unlisted analytics key in ${f}: "${k}" (add it to analytics_events.json and regenerate)`);
  const computedRecords = [...html.matchAll(/cwAnalytics\.record\(\s*[^'")]/g)];
  if (computedRecords.length) H(`computed analytics key in ${f} (${computedRecords.length}) — record() takes a string literal only`);
```

Near the top of the file, beside the other constants, load the allowlist for the site under test:

```javascript
const ANALYTICS_KEYS = new Set(
  JSON.parse(fs.readFileSync(path.join(REPO, 'metrics', 'allowlist.json'), 'utf8'))
    .keys[process.argv[2].endsWith('/res') ? 'res' : 'ms3'],
);
```

- [ ] **Step 2: Record the decision**

Add to the `decisions.json` `decisions` array:

```json
{
  "id": "analytics-allowlist",
  "title": "Analytics event keys come from a generated allowlist",
  "decided": "2026-09-04",
  "rationale": "Cohorts are 4-10 learners, so aggregate data can still identify. Free text in an event key is the path by which PHI or a re-identifying detail would reach the counter store. Deriving the allowlist from shipped_pages.json makes what can be measured and what ships the same set by construction.",
  "enforced_by": ["13_Faculty_Resources/_automation/site_build/check-static-site.mjs"],
  "spec": "docs/superpowers/specs/2026-09-04-usage-analytics-design.md"
}
```

- [ ] **Step 3: Add the verify.sh steps**

After the existing `unit — shared build logic` step (line 102):

```bash
step "unit — analytics allowlist"           python3 $A/site_build/test_analytics_events.py
step "analytics allowlist freshness"        python3 $A/site_build/analytics_events.py --check
step "unit — metrics collector"             bash -c "cd metrics && node --test tests/*.test.mjs"
```

- [ ] **Step 4: Document the feature in CLAUDE.md**

Under "Conventions & gotchas", add:

```markdown
- **Usage analytics store integers, never events.** `metrics/` is a separate Netlify site whose
  one function accepts an allowlisted event key and increments a counter keyed by site + ISO week.
  It stores no IP, user agent, session id, or timestamp finer than the week, and it does not log
  requests. The allowlist is GENERATED from `shipped_pages.json` — regenerate with
  `analytics_events.py --write` after adding a page or a tool step, or the freshness gate fails.
  Cohorts here are 4-10 learners, so reported cells below n=5 are suppressed. Adding a metric is a
  registry edit, never a free-text string: `check-static-site.mjs` hard-fails a computed or
  unlisted `cwAnalytics.record()` argument.
```

Then run `cp CLAUDE.md AGENTS.md` — CI fails the PR if they diverge.

- [ ] **Step 5: Run the full gate**

Run: `bash bin/verify.sh`
Expected: `ALL CHECKS PASSED`, including the three new steps.

- [ ] **Step 6: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/check-static-site.mjs \
        bin/verify.sh decisions.json CLAUDE.md AGENTS.md
git commit -m "feat(analytics): gate the allowlist in the QA pass, verify.sh, and the agent guide"
```

---

## Deferred to a second plan

**The faculty reporting dashboard.** The spec's rollout is explicit that a dashboard built against zero data designs for imaginary shapes. Build it after at least one full rotation week of counters exists, using `metrics/bin/read_counters.mjs` to see the real distribution first. It will need: the n<5 suppression rule, a funnel view per tool, and a dead-pages list.

**Instrumenting the tools themselves.** This plan ships the emitter and the registry with two tools declared (`interview-room`, `reasoning-workbench`) but does **not** add `cwAnalytics.record()` calls inside those tools — that is a per-tool change with its own review, and the QA gate added in Task 7 will hard-fail any call that names an unregistered step, which is the safety net for doing it incrementally.

## Open decision carried from the spec

**Whether learners see a usage notice.** Recommended in the spec; unresolved. If the answer is yes, it is a small addition to Task 6 (a footer line plus an opt-out control wired to `cwAnalytics.optOut()`), and it should land before the first site is enabled, not after.
