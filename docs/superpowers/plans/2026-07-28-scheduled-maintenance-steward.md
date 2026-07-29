# Scheduled Maintenance Steward Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and activate the approved layered maintenance steward for surveillance, hosted reliability, faculty governance, evidence operations, and rotation readiness.

**Architecture:** Deterministic repository and production checks run in GitHub Actions or a Netlify scheduled function; authenticated control-plane and local-source checks run as independent Codex heartbeats. Every layer emits a content-free receipt, preserves faculty authority, and separates a clean check from missing evidence.

**Tech Stack:** Python 3.11 standard library plus existing PyYAML/jsonschema dependencies, Node.js 20 ESM and `node:test`, GitHub Actions, Playwright, Netlify Functions, GitHub CLI, Codex heartbeat automations.

## Global Constraints

- Work only in `/Users/jm/Psychiatry-Clerkship-Library/.worktrees/scheduled-maintenance-steward` on branch `codex/scheduled-maintenance-steward`; preserve the user's dirty primary checkout.
- Run `build_and_check.sh ms3` and then `build_and_check.sh res` sequentially; never run the two builders concurrently.
- Never commit Git LFS pointer stubs or macOS-only visual baselines.
- Never edit clinical teaching content, `reviewed.json`, question attestation state, or managed-voice activation state automatically.
- Never refresh visual baselines from a failing scheduled run.
- Never invent rotation dates, learner identities, credentials, clinical assignments, or patient data.
- Reports, tests, logs, issues, and receipts must contain no PHI, learner activity, transcripts, prompts, replies, secret values, or real patient data.
- Local storage key, single-file clinical-tool, dose-literal, and static-site conventions in `AGENTS.md` remain unchanged.
- Use the built-in `GITHUB_TOKEN` with least privilege; keep `APIFY_TOKEN` in its existing workflow boundary; do not copy a Netlify token or student passcode into GitHub.
- The Interview Room health canary is authenticated `GET` only and must not call a model, evaluator, budget operation, transcription, or synthesis provider.
- GitHub and Netlify cron expressions are UTC; Codex heartbeats use `America/New_York`.
- All generated hashes are drift identifiers, not clinical approval.
- Tests exercise behavior against controlled inputs; they do not merely grep source text.
- Every action in a new or modified workflow is pinned to one of these live-verified immutable
  commits, with its semantic tag retained in a comment:
  `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` (`v7`),
  `actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97` (`v7`),
  `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020` (`v7`),
  `actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` (`v7`),
  `actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9` (`v6`), and
  `lycheeverse/lychee-action@e7477775783ea5526144ba13e8db5eec57747ce8` (`v2`).
- Workflow artifacts use at most the repository-supported 90-day retention.

---

### Task 1: Repair surveillance identity, freshness, live issue truth, and protected-branch publication

**Files:**
- Create: `13_Faculty_Resources/_automation/surveillance/bin/report_branch.py`
- Create: `tests/maintenance/test_surveillance_maintenance.py`
- Create: `tests/maintenance/fixtures/issues-open-closed.json`
- Modify: `13_Faculty_Resources/_automation/surveillance/bin/lib_surveillance.py`
- Modify: `13_Faculty_Resources/_automation/surveillance/bin/run_link_monitor.py`
- Modify: `13_Faculty_Resources/_automation/surveillance/bin/run_citation_check.py`
- Modify: `13_Faculty_Resources/_automation/surveillance/bin/run_guideline_surv.py`
- Modify: `13_Faculty_Resources/_automation/surveillance/bin/run_resource_intake.py`
- Modify: `13_Faculty_Resources/_automation/surveillance/bin/sync_findings.py`
- Modify: `13_Faculty_Resources/_automation/surveillance/bin/build_status.py`
- Modify: `.github/workflows/surveillance-link-monitor.yml`
- Modify: `.github/workflows/surveillance-citations.yml`
- Modify: `.github/workflows/surveillance-guideline.yml`
- Modify: `.github/workflows/surveillance-resource-intake.yml`
- Modify: `13_Faculty_Resources/_automation/surveillance/README.md`
- Modify: `13_Faculty_Resources/_automation/surveillance/REVIEW_RULES.md`

**Interfaces:**
- Consumes: existing normalized finding dictionaries and `<!-- surveillance:fp=... -->` issue markers.
- Produces: `lib_surveillance.validate_checked_sources(value) -> list[str]`; collector option `--checked-out PATH`; `sync_findings.py --checked-sources PATH --issues-out PATH`; `build_status.py --issues-json PATH`; `report_branch.py hydrate|publish`.
- Produces report identities: `link-source-monitor -> link_audit`, `citation-monitor -> citation_audit`, `guideline-surveillance -> guideline_delta`, `resource-intake -> resource_intake`.
- Rolling branch: `automation/surveillance-inbox`; allowed generated paths are exactly `history/**`, `STATUS.md`, and `status.html` below the surveillance root.

- [ ] **Step 1: Write failing surveillance behavior tests**

```python
def test_link_and_citation_reports_do_not_overwrite(self):
    link = L.write_report("link-source-monitor", [], when="2026-07-28", base=self.temp_dir)
    citation = L.write_report("citation-monitor", [], when="2026-07-28", base=self.temp_dir)
    self.assertEqual({Path(p).name for p in link}, {
        "link_audit_2026-07-28.json", "link_audit_2026-07-28.csv"
    })
    self.assertEqual({Path(p).name for p in citation}, {
        "citation_audit_2026-07-28.json", "citation_audit_2026-07-28.csv"
    })

def test_zero_findings_stamp_every_checked_source(self):
    checked = self.temp_dir / "checked.json"
    checked.write_text('["apa-practice-guidelines", "doi:10.1/example"]')
    result = self.run_sync(
        findings=[],
        checked_sources=checked,
        out_dir=self.temp_dir,
        job="citation-monitor",
    )
    self.assertEqual(result.returncode, 0)
    self.assertEqual(set(json.loads((self.temp_dir / "last_run.json").read_text())), {
        "apa-practice-guidelines", "doi:10.1/example"
    })

def test_closed_issue_overrides_historical_open_status(self):
    self.write_report_fixture(fingerprint="source::modified::abc", status="issue-open")
    state = build_status.compute(
        self.temp_dir,
        reviewed_path=self.fixture_reviewed(),
        issues_path=FIXTURES / "issues-open-closed.json",
    )
    self.assertEqual(state["p0"], [])
    self.assertEqual(state["p1"], [])
```

The `unittest.TestCase` creates `self.temp_dir` with `TemporaryDirectory`; `self.run_sync` writes a
findings fixture and invokes the real CLI in a subprocess; `self.write_report_fixture` writes one
literal historical finding; and `self.fixture_reviewed` writes an empty reviewed ledger. Expected
values stay literal and do not call production helpers.

Add tests that malformed/duplicate/blank checked-source arrays fail, missing link collector output
fails rather than producing zero findings, all collectors write checked IDs on zero findings, open
issues remain active, unissued overflow remains active, report history is de-duplicated by
fingerprint, and issue snapshots exclude pull requests.

Add command-runner tests for `report_branch.py` that assert an out-of-scope inbox diff is rejected,
the exact remote SHA is persisted, publication stages only the allowed paths, and the push argument
is constructed exactly as:

```python
f"--force-with-lease=refs/heads/{branch}:{expected_remote_sha}"
```

- [ ] **Step 2: Run the surveillance tests and verify the intended failures**

Run:

```bash
python3 -m unittest tests.maintenance.test_surveillance_maintenance -v
```

Expected: failures for the missing `citation-monitor` identity, checked-source contract, live issue
overlay, strict link-report handling, and report-branch helper.

- [ ] **Step 3: Implement distinct report identities and checked-source receipts**

Add the exact mapping:

```python
_STEM = {
    "guideline-surveillance": "guideline_delta",
    "link-source-monitor": "link_audit",
    "citation-monitor": "citation_audit",
    "resource-intake": "resource_intake",
}
```

`validate_checked_sources` must accept only a JSON array of unique, non-empty strings and return a
sorted list. Each collector writes its successfully attempted IDs to `--checked-out`. For links the
aggregate checked ID is `link-monitor`; for resource intake it is `resource-intake`; guideline and
citation collectors write every source/DOI/PMID actually attempted. `sync_findings` must call
`update_last_run` with that validated list even when `findings == []`.

`run_link_monitor.py` must exit nonzero for a missing, empty, non-object, or schema-unrecognizable
lychee report. A valid report with an empty `fail_map` or `error_map` remains a successful zero-
finding check.

- [ ] **Step 4: Implement normalized issue snapshots and authoritative status**

Normalize issue data to:

```python
{
    "number": 123,
    "url": "https://github.com/owner/repo/issues/123",
    "state": "OPEN",
    "closedAt": None,
    "fingerprint": "source::modified::abc",
    "labels": ["P1", "surveillance"],
}
```

`sync_findings --issues-out` writes the snapshot used for deduplication, appends newly created
issues, and never includes secret/token data. `build_status` loads all dated reports, keeps the
newest record per fingerprint, overlays the snapshot, excludes closed issues, retains open issues
and unissued overflow, and sets `issueTruth: "live"` in the returned model. Its no-snapshot path sets
`issueTruth: "offline-report-fallback"` so rendered status cannot imply live authority.

- [ ] **Step 5: Implement the rolling surveillance inbox helper**

`report_branch.py hydrate` must:

1. fetch `origin/main` and the optional remote inbox branch;
2. query whether one open PR exists for that head/base;
3. reject any inbox diff outside the three allowed generated locations;
4. restore only allowed generated files into the current `main` checkout;
5. write a state JSON containing `base`, `branch`, `expectedRemoteSha`, and `openPrNumber`.

`report_branch.py publish` must:

1. reject an unexpected dirty path;
2. create/reset the local inbox branch from `origin/main` while preserving generated changes;
3. stage only allowed paths;
4. commit one content-free report snapshot when the tree changed;
5. push with exact force-with-lease when the remote exists, or a normal first push otherwise;
6. create one PR titled `surveillance: refresh maintenance inbox` only when no open PR exists;
7. switch back to `main`.

All subprocess arguments are lists, branch/base values match
`^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$`, and no shell interpolation is used.

- [ ] **Step 6: Rewire all four surveillance workflows**

Every workflow must:

- use `concurrency.group: surveillance-inbox`;
- request only `contents: write`, `issues: write`, and `pull-requests: write` where needed;
- checkout with `fetch-depth: 0` and `lfs: false`;
- hydrate before collection;
- pass both `--checked-sources checked-sources.json` and `--issues-out issue-state.json`;
- build status with `--issues-json issue-state.json`;
- upload findings, checked sources, issue state, reports/status, and collector logs with the
  immutable `actions/upload-artifact` v7 commit from Global Constraints, `if: always()`, and
  `retention-days: 90`;
- pin checkout, setup-python, upload-artifact, and the existing lychee action to the immutable
  commits in Global Constraints;
- publish through `report_branch.py`;
- contain no direct `git push` to `main`.

The citation workflow passes `--job citation-monitor`. Guideline attestation-routing PR creation
remains advisory and must fail visibly if it cannot route an actionable P0/P1; remove its
`continue-on-error: true`. Preserve exact UTC crons: link `0 6 * * 1`, citations `0 7 * * 1`, and
guidelines `0 6 1 * *`; resource intake remains manual.

- [ ] **Step 7: Run focused surveillance verification**

Run:

```bash
python3 -m unittest tests.maintenance.test_surveillance_maintenance -v
python3 13_Faculty_Resources/_automation/surveillance/bin/run_citation_check.py --self-test
python3 13_Faculty_Resources/_automation/surveillance/bin/build_status.py \
  --history-dir 13_Faculty_Resources/_automation/surveillance/history \
  --out-dir /tmp/scheduled-maintenance-status
```

Expected: all tests pass; citation self-test passes; the offline status render explicitly labels its
issue truth as fallback.

- [ ] **Step 8: Commit Task 1**

```bash
git add .github/workflows/surveillance-*.yml \
  13_Faculty_Resources/_automation/surveillance \
  tests/maintenance
git commit -m "fix: make surveillance schedules truthful and reviewable"
```

---

### Task 2: Add authenticated Interview Room health receipts and a public deadman surface

**Files:**
- Create: `sp-proxy/netlify/functions/_shared/sp-health-receipt.mjs`
- Create: `sp-proxy/netlify/functions/sp-health-canary.mjs`
- Create: `sp-proxy/netlify/functions/sp-health-status.mjs`
- Create: `sp-proxy/tests/sp-health-canary.test.mjs`
- Create: `sp-proxy/tests/sp-deploy-manifest.test.mjs`
- Modify: `sp-proxy/tests/sp-handler.test.mjs`
- Modify: `sp-proxy/tests/sp-deploy-routing.test.mjs`
- Modify: `sp-proxy/netlify.toml`
- Modify: `sp-proxy/package.json`
- Modify: `sp-proxy/package-lock.json`
- Modify: `sp-proxy/README.md`
- Modify: `sp-proxy/REDTEAM_CHECKLIST.md`

**Interfaces:**
- Consumes: existing Netlify environment names `SP_STUDENT_PASSCODE`, `SP_ALLOWED_ORIGINS`, and
  `URL`; public route `/api/sp`; site-scoped Netlify Blob store `sp-health-canary`.
- Produces: `validateHealth(body) -> frozen internal result`;
  `createHealthCanary(deps) -> async handler`; `createHealthStatus(deps) -> async handler`;
  Blob key `latest`; TOML-owned public `GET /api/sp/health-status`;
  Netlify deployment manifest schedule `0 */6 * * *` with no public canary route.

- [ ] **Step 1: Write failing scheduled-canary and durable-receipt tests**

```javascript
test('scheduled canary performs one authenticated GET and persists a redacted success receipt', async () => {
  const requests = [];
  const stored = [];
  const handler = createHealthCanary({
    readEnv: key => ({
      SP_STUDENT_PASSCODE: 'test-only-passcode',
      SP_ALLOWED_ORIGINS: 'https://une-ms3-psychiatry.netlify.app',
      URL: 'https://sp-interview-proxy.netlify.app',
    })[key],
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify(VALID_HEALTH), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    },
    store: { setJSON: async (key, value) => stored.push({ key, value }) },
    log: () => {},
    now: () => '2026-07-28T12:00:00.000Z',
  });
  await handler(new Request('https://scheduled.invalid', {
    method: 'POST',
    body: JSON.stringify({ next_run: '2026-07-28T18:00:00.000Z' }),
  }));
  assert.equal(requests[0].init.method, 'GET');
  assert.equal(requests[0].init.headers.Origin, 'https://une-ms3-psychiatry.netlify.app');
  assert.equal(stored[0].key, 'latest');
  assert.deepEqual(Object.keys(stored[0].value).sort(), [
    'caseCount', 'checkedAt', 'contractSha256', 'learnerReady',
    'nextRun', 'schemaVersion', 'state',
  ]);
  assert.equal(JSON.stringify(stored).includes('test-only-passcode'), false);
});
```

Add table tests for non-200 responses, invalid JSON/content type, wrong schema, unequal/blank model
pins, blank pack version, unknown status, zero/duplicate case IDs, missing secrets, absent exact
canonical origin, arbitrary first HTTPS origin, fetch timeout, Blob-write failure, and bounded
failure codes. On validation failure, assert a sanitized failure receipt is attempted before a
generic throw and neither stored data nor logs contain an exception message, URL, raw model/pack
identifier, passcode, header, case content, prompt, or reply. Assert `config.schedule` exactly.
Require exact, scalar-length-bounded `{id, title}` case summaries, reject unpaired surrogates, and
prove title text is neither returned nor hashed.

Add redirect and response-body regressions: `redirect: "error"` must prevent a second request from
receiving the learner credential; the eight-second deadline must remain active through a bounded
64 KiB body read and validation; and an oversized or never-settling body must produce only a
sanitized failure receipt and generic throw.

Add public status tests for success, failed, stale, missing, and malformed receipts; GET-only routing;
`Cache-Control: no-store`; bounded response keys; and no credential requirement. The status route
must return a non-success HTTP status for missing, malformed, failed, stale, or late-slot state. Use
an explicit ten-minute scheduler-jitter allowance and test that a 00:00 receipt with
`nextRun: 06:00` fails at 06:15 even though it is less than eight hours old. Simulate the 06:00
canary succeeding upstream but failing to write its Blob receipt; assert the prior receipt fails the
same late-slot check rather than concealing the missed durable invocation.

- [ ] **Step 2: Add a real-handler side-effect test**

In `sp-handler.test.mjs`, invoke the actual `createSpHandler` with an authenticated `GET` and assert
zero calls to its real provider, budget, ticket, and logger seams. The canary test separately proves
its one request is the exact `GET /api/sp` URL and never `/api/sp/voice`. Extend the deploy-routing
test for `/api/sp/health-status`.

Use pinned devDependency `@netlify/zip-it-and-ship-it` 14.5.4 to generate a real deployment manifest.
Assert the canary schedule is exactly `0 */6 * * *`, neither health function owns a source route,
and the status function remains available at its default function URL for the explicit TOML rewrite.

- [ ] **Step 3: Run the new SP tests and verify they fail**

Run:

```bash
node --test sp-proxy/tests/sp-health-canary.test.mjs \
  sp-proxy/tests/sp-deploy-manifest.test.mjs \
  sp-proxy/tests/sp-handler.test.mjs \
  sp-proxy/tests/sp-deploy-routing.test.mjs
```

Expected: module/route/manifest/behavior failures for the missing canary and status implementation.

- [ ] **Step 4: Implement the scheduled function and Blob receipt**

Use dependency injection for tests and default dependencies that read environment only through
`globalThis.Netlify.env.get` and obtain
`getStore({ name: "sp-health-canary", consistency: "strong" })`. Parse `SP_ALLOWED_ORIGINS` as exact
origins and require this literal canonical origin:

```javascript
const CANONICAL_HEALTH_ORIGIN = 'https://une-ms3-psychiatry.netlify.app';
```

Use an eight-second abort timeout. Send only:

```javascript
{
  method: 'GET',
  headers: {
    Origin: CANONICAL_HEALTH_ORIGIN,
    'x-student-key': studentPasscode,
    Accept: 'application/json',
  },
  redirect: 'error',
  signal,
}
```

Keep the deadline active through a size-bounded 64 KiB body read and validation. Require exact,
bounded `{id, title}` summaries but hash only the normalized model/pack pins and case IDs; never
store or hash title text. Validate before persisting and store no raw identifiers.
Use a fixed allow-list of failure codes such as `configuration`, `timeout`, `transport`,
`http_status`, `content_type`, `invalid_json`, `contract`, and `receipt_write`; never persist an
upstream body or exception string. A failure best-effort writes `{schemaVersion, state, failureCode,
checkedAt}` and then throws a generic error. The scheduled handler returns no body. Export:

```javascript
export const config = { schedule: '0 */6 * * *' };
```

This direct literal is required for static extraction by the pinned Netlify packager. Do not add a
`path` property: the scheduled canary must not own a public route.

- [ ] **Step 5: Implement the public status function**

Read only Blob key `latest` with strong consistency, validate its exact schema, and return only
bounded content-free fields. A successful receipt is current only when it is no more than eight
hours old and `now <= nextRun + 10 minutes`; otherwise it is stale/late-slot. Respond to GET only and
set `Content-Type: application/json`, `Cache-Control: no-store`, and
`X-Content-Type-Options: nosniff`. Do not export in-source path/method config. The explicit
`netlify.toml` 200/force rewrite is the sole public route owner and targets the default
`/.netlify/functions/sp-health-status` URL; the handler itself remains GET-only.

- [ ] **Step 6: Document the operational receipt and manual boundary**

Document that the canary reuses the server-side learner credential, performs GET only, has no model
charge, and does not replace the deploy/model/pack red-team checklist. Explain the public
content-free receipt, its eight-hour freshness contract, and that GitHub plus the independent Codex
deadman provide the alert path. Add a red-team check confirming no receipt/log includes credentials,
raw model/pack identifiers, learner content, or exception text.

- [ ] **Step 7: Verify and commit Task 2**

Run:

```bash
node --test sp-proxy/tests/sp-health-canary.test.mjs \
  sp-proxy/tests/sp-deploy-manifest.test.mjs \
  sp-proxy/tests/sp-handler.test.mjs \
  sp-proxy/tests/sp-deploy-routing.test.mjs
npm --prefix sp-proxy test
```

Expected: all canary, status, direct-handler, routing, and existing SP proxy tests pass.

```bash
git add sp-proxy/netlify/functions/_shared/sp-health-receipt.mjs \
  sp-proxy/netlify/functions/sp-health-canary.mjs \
  sp-proxy/netlify/functions/sp-health-status.mjs \
  sp-proxy/tests/sp-health-canary.test.mjs \
  sp-proxy/tests/sp-deploy-manifest.test.mjs \
  sp-proxy/tests/sp-handler.test.mjs \
  sp-proxy/tests/sp-deploy-routing.test.mjs \
  sp-proxy/netlify.toml sp-proxy/package.json sp-proxy/package-lock.json \
  sp-proxy/README.md sp-proxy/REDTEAM_CHECKLIST.md \
  docs/superpowers/plans/2026-07-28-scheduled-maintenance-steward.md
git commit -m "feat: publish Interview Room health receipts"
```

---

### Task 3: Build the daily production canary and content-free release twin

**Files:**
- Create: `13_Faculty_Resources/_automation/maintenance/__init__.py`
- Create: `13_Faculty_Resources/_automation/maintenance/production_canary.py`
- Create: `13_Faculty_Resources/_automation/maintenance/maintenance_config.json`
- Create: `tests/maintenance/test_production_canary.py`

**Interfaces:**
- Consumes: public learner URLs, `media_manifest.json`, `_prototypes/sp-interview/sp-interview.pack.json`,
  and `GITHUB_SHA`.
- Produces: `probe(config, opener, now, source_sha) -> dict`; CLI flags `--config`, `--out`,
  `--source-sha`; release-twin schema v1 from the design.

- [ ] **Step 1: Write failing production-canary tests**

```python
def test_release_twin_is_content_free_and_deterministic(self):
    opener = FixtureOpener(valid_responses())
    receipt = production_canary.probe(
        CONFIG,
        opener=opener,
        now=lambda: "2026-07-28T12:00:00+00:00",
        source_sha="a" * 40,
    )
    self.assertEqual(receipt["schemaVersion"], 1)
    self.assertEqual(receipt["sites"][0]["navSha256"], sha256(NAV_BYTES).hexdigest())
    self.assertNotIn("content", json.dumps(receipt).lower())
    self.assertNotIn("test-only-passcode", json.dumps(receipt))

def test_lfs_pointer_prefix_is_a_hard_failure(self):
    opener = FixtureOpener(valid_responses(
        media_body=b"version https://git-lfs.github.com/spec/v1\n",
    ))
    with self.assertRaisesRegex(CanaryError, "Git LFS pointer"):
        production_canary.probe(CONFIG, opener=opener, now=NOW, source_sha="a" * 40)
```

Use `unittest.TestCase` in the committed test file. Add cases for missing security headers, bad CSP
tokens, wrong root/nav/search/media `Cache-Control` values, malformed/empty nav, malformed/empty
search index, non-200/206 media, invalid content type, missing or weak `W/` ETag, malformed or
implausibly short full length in `Content-Range`, Range header omission, duplicate media paths,
invalid source SHA, and pack/model metadata missing from the expected SP section. Add a same-length
media fixture whose tail is represented by a changed strong ETag and assert the media integrity
aggregate changes even though the downloaded 512-byte prefix does not.

`FixtureOpener` is a test-only boundary fake implementing the same `open(request, timeout)` method
as the production opener. Its response objects expose the complete status, headers, bounded
`read(size)`, context-manager, and `close()` behavior; tests assert the real probe's receipt or
failure, not calls on the fake.

- [ ] **Step 2: Run the production-canary tests and verify they fail**

Run:

```bash
python3 -m unittest tests.maintenance.test_production_canary -v
```

Expected: module-not-found failure for the maintenance package.

- [ ] **Step 3: Implement strict public probes**

`maintenance_config.json` must contain the exact HTTPS URLs:

```json
{
  "schemaVersion": 1,
  "sites": [
    {"name": "ms3", "baseUrl": "https://une-ms3-psychiatry.netlify.app"},
    {"name": "res", "baseUrl": "https://mmc-psychiatry-residents-sanford.netlify.app"}
  ],
  "spProxy": {
    "baseUrl": "https://sp-interview-proxy.netlify.app",
    "siteId": "455d2740-4020-4d9c-b9f8-82f72f4b2897"
  }
}
```

Include the two learner Netlify site IDs from the design. Accept only HTTPS with no credentials,
query, or fragment. Request `nav.json`, `search-index.json`, and each unique `served: true` media
path under `/audio/`, `/audio_oe/`, or `/media/`. Send `Range: bytes=0-511`; read at most 512 bytes;
close every response. Validate root headers `x-content-type-options: nosniff`,
`referrer-policy: strict-origin-when-cross-origin`, and the required CSP directives. Require these
live-verified cache contracts: root and `nav.json` contain
`public,max-age=0,must-revalidate`; `search-index.json` contains `public,max-age=86400`; media
contains `public,max-age=604800`. Accept only quoted strong ETags; reject empty or `W/` values.

- [ ] **Step 4: Build the release twin**

Count nav items from parsed sections, hash exact response bytes, and aggregate sorted media records
as SHA-256 over newline-delimited `path|full_object_length|etag|prefix_sha256`. Require the full
length from `Content-Range`, not the 512-byte response `Content-Length`, and require a non-empty
ETag. Read the expected pack version and engine model pins from the canonical pack; hash the full
pack bytes; include the expected pack status and derive `learnerReady` only from `reviewed` or
`attested`. Name the field `mediaIntegrityAggregateSha256` and reject any receipt key outside the
schema shown in the design.

- [ ] **Step 5: Verify and commit Task 3**

Run:

```bash
python3 -m unittest tests.maintenance.test_production_canary -v
python3 13_Faculty_Resources/_automation/maintenance/production_canary.py \
  --config 13_Faculty_Resources/_automation/maintenance/maintenance_config.json \
  --source-sha c0c6550b94aa5a845c2561ce37c59e9ead8503e5 \
  --out /tmp/release-twin.json
```

The live probe may require network approval. Expected: unit tests pass and the live receipt contains
both sites plus expected SP identifiers without content or credentials.

```bash
git add 13_Faculty_Resources/_automation/maintenance \
  tests/maintenance/test_production_canary.py
git commit -m "feat: add production canary and release twin"
```

---

### Task 4: Build the weekly faculty governance digest

**Files:**
- Create: `13_Faculty_Resources/_automation/maintenance/governance_digest.mjs`
- Create: `tests/maintenance-governance-digest.test.mjs`

**Interfaces:**
- Consumes: `faculty-console/qbank-rules.mjs`, `question_bank.json`, `topic_meta.json`,
  `site_manifest.json`, `reviewed.json`, `needs_reattest.json`, and the existing attestation
  validator.
- Produces: `buildGovernanceDigest(inputs) -> object`; `renderGovernanceMarkdown(digest) -> string`;
  CLI `--out-json` and `--out-md`; exit 2 only for attestation errors or blocked active qbank items.

- [ ] **Step 1: Write failing governance-digest tests**

```javascript
test('warnings and drafts are review queues but blockers fail the gate', () => {
  const digest = buildGovernanceDigest({
    bank: SYNTHETIC_BANK_WITH_READY_WARNING_BLOCKED,
    manifestPages: ['t_mood.md'],
    topicMeta: SYNTHETIC_TOPIC_META,
    reviewed: {},
    needsReattest: { slugs: [] },
    attestationErrors: [],
  });
  assert.deepEqual(digest.qbank.counts, {
    total: 3, draft: 3, attested: 0, ready: 1, warning: 1, blocked: 1,
  });
  assert.equal(digest.gate, 'blocked');
  assert.deepEqual(digest.qbank.blockedIds, ['blocked_fixture']);
  assert.equal(JSON.stringify(digest).includes('fixture question stem'), false);
});
```

Define both fixture constants as complete, literal synthetic records in the test file; expected
counts and IDs must not be produced by a test helper that mirrors the assessment rules.

Add tests for attestation drift, warning-only success, high-risk/other topic grouping, missing
optional governance fields, reviewed coverage, re-attestation queue counts, deterministic ordering,
and absence of question stems, options, explanations, reviewer names, or clinical page bodies.

- [ ] **Step 2: Run the governance tests and verify they fail**

Run:

```bash
node --test tests/maintenance-governance-digest.test.mjs
```

Expected: module-not-found failure for `governance_digest.mjs`.

- [ ] **Step 3: Implement the digest using canonical rules**

Import `assessBank` and pass the current active bank plus manifest page slugs. Store only counts,
blocked IDs, warning count, topic metadata counts, reviewed coverage counts, re-attestation slugs,
and attestation error codes/slug prefixes. Do not serialize stems, options, explanations, evidence
text, or reviewer identity.

The CLI invokes the existing Python attestation validator in a subprocess, converts each returned
line to a bounded code/slug summary, writes JSON and Markdown, and exits:

- `0` for ready or review-only;
- `2` for attestation inconsistency or an active blocked question;
- `1` for malformed input/runtime failure.

- [ ] **Step 4: Verify current-repository behavior and commit Task 4**

Run:

```bash
node --test tests/maintenance-governance-digest.test.mjs
node 13_Faculty_Resources/_automation/maintenance/governance_digest.mjs \
  --out-json /tmp/governance-digest.json \
  --out-md /tmp/governance-digest.md
```

Expected on the verified clean base: exit 0, attestation consistency ready, zero blocked questions,
and review-only draft/warning/metadata queues. Record the observed active-question count as evidence;
do not encode a drift-prone count as a pass criterion.

```bash
git add 13_Faculty_Resources/_automation/maintenance/governance_digest.mjs \
  tests/maintenance-governance-digest.test.mjs
git commit -m "feat: add faculty governance digest"
```

---

### Task 5: Build monthly operations review and rotation-readiness passport

**Files:**
- Create: `13_Faculty_Resources/_automation/maintenance/monthly_review.py`
- Create: `13_Faculty_Resources/_automation/maintenance/rotation_readiness.py`
- Create: `13_Faculty_Resources/_automation/maintenance/rotation_blocks.schema.json`
- Create: `13_Faculty_Resources/_automation/maintenance/rotation_blocks.json`
- Create: `tests/maintenance/test_monthly_review.py`
- Create: `tests/maintenance/test_rotation_readiness.py`
- Modify: `13_Faculty_Resources/_automation/maintenance/maintenance_config.json`

**Interfaces:**
- Consumes: canonical evidence/media registries, git history, operational paths, current SP pack,
  optional content-free run receipts, and privacy-safe rotation block records.
- Produces: `build_monthly_review(root, config, today, git_last_changed) -> dict`;
  `validate_rotation_config(value) -> list[block]`;
  `evaluate_rotation(blocks, today) -> passport`; CLIs write JSON and Markdown.

- [ ] **Step 1: Write failing monthly-review tests**

```python
def test_existing_accessibility_debt_is_review_only_but_new_debt_blocks():
    current = ["audio_oe/existing.m4a", "audio_oe/new.m4a"]
    report = build_report(
        served_missing=current,
        accessibility_baseline=["audio_oe/existing.m4a"],
    )
    self.assertEqual(report["media"]["existingDebt"], ["audio_oe/existing.m4a"])
    self.assertEqual(report["media"]["newRegressions"], ["audio_oe/new.m4a"])
    self.assertEqual(report["gate"], "blocked")
```

Add tests for evidence cadence due/overdue, pending identity counts, local-policy-dependent counts,
stale runbooks, missing APA crosswalk, absent/old OpenEvidence receipt, expected SP hash changes,
red-team receipt recency versus the latest SP pack change in git, deterministic output, and no
citation text/attachment path/credential value in the report. This GitHub-side report must not
claim recency against a Netlify deploy because it has no authenticated deploy data source.

- [ ] **Step 2: Write failing rotation tests**

```python
def test_exactly_seven_days_before_block_is_due():
    passport = evaluate_rotation(
        [{"id": "rot-2026-hx-a1b2c3d4e5f60718", "startsOn": "2026-08-10",
          "endsOn": "2026-09-20", "status": "planned"}],
        today=date(2026, 8, 3),
    )
    self.assertEqual(passport["state"], "due")
    self.assertEqual(passport["daysUntilStart"], 7)
    self.assertNotIn("credential", json.dumps(passport).lower())
```

Add empty-config `configuration_required`, not-due, overdue, active, complete, duplicate ID,
invalid date, end-before-start, duration shorter than 35 or longer than 49 calendar days, overlap,
unexpected key, and forbidden identity key (`name`, `email`, `learnerId`, `patient`, `passcode`,
`credential`) tests. Assert IDs must match
`^rot-[0-9]{4}-hx-(?=[a-f0-9]{16}$)(?=[a-f0-9]*[a-f])(?=[a-f0-9]*[0-9])[a-f0-9]{16}$`; reject
email-like and whitespace values plus the concrete counterexamples `rot-2026-joshua` and
`rot-2026-12345678`.

- [ ] **Step 3: Run both test modules and verify they fail**

Run:

```bash
python3 -m unittest tests.maintenance.test_monthly_review \
  tests.maintenance.test_rotation_readiness -v
```

Expected: module/attribute failures for the missing implementations.

- [ ] **Step 4: Implement monthly evidence and operations review**

Add to `maintenance_config.json`:

- `operationalDocs`: exact path and maximum age for the root deploy plan, LFS runbook,
  surveillance README/review rules, evidence registry README, SP README, and SP red-team checklist;
- `accessibilityDebtBaseline`: the sorted current set of `served: true` media entries that lack the
  required transcript/caption/text-alternative record;
- `receipts`: content-free paths for OpenEvidence and red-team recency checks;
- `apaCrosswalk`: the exact expected `library_crosswalk.csv` path.

Compute evidence cadence from `governance.lastReviewed` plus `reviewCadence`; use UTC dates and
explicit `unknown` when data is absent. Invoke git through the injected runner with the exact
argument list `["git", "log", "-1", "--format=%cI", "--", configured_path]`, where
`configured_path` is the already validated relative path from `operationalDocs`. Existing debt,
attended-only Zotero/provider review, missing APA prerequisite, and absent OpenEvidence receipt are
review items. New accessibility regression or evidence generated-view validation failure is
blocking. Compare the red-team receipt only with the latest git change to the canonical SP pack.
Authenticated deploy-versus-receipt recency is delegated to the external Netlify deadman.

- [ ] **Step 5: Implement rotation schema, evaluator, and passport**

Commit an honest initial configuration:

```json
{"schemaVersion": 1, "blocks": []}
```

The passport contains only block ID/dates/state, days until start, and the exact manual checklist
from the design. Markdown must state that automation does not rotate or display credentials and does
not authorize managed voice. Enforce the exact opaque-ID regex from Step 2 before any ID is rendered.
`configuration_required` exits 0 and creates no issue. `due` and `overdue` exit 10 as a routing
signal; the workflow must translate that signal to a successful conclusion after issue routing and
artifact upload. Malformed/privacy-invalid config exits 2 and remains a failed workflow.

- [ ] **Step 6: Verify and commit Task 5**

Run:

```bash
python3 -m unittest tests.maintenance.test_monthly_review \
  tests.maintenance.test_rotation_readiness -v
python3 13_Faculty_Resources/_automation/maintenance/monthly_review.py \
  --out-json /tmp/monthly-review.json --out-md /tmp/monthly-review.md
python3 13_Faculty_Resources/_automation/maintenance/rotation_readiness.py \
  --config 13_Faculty_Resources/_automation/maintenance/rotation_blocks.json \
  --out-json /tmp/rotation-passport.json --out-md /tmp/rotation-passport.md
```

Expected: tests pass; monthly report distinguishes existing debt from regressions; rotation output
is `configuration_required` and exits 0.

```bash
git add 13_Faculty_Resources/_automation/maintenance \
  tests/maintenance/test_monthly_review.py \
  tests/maintenance/test_rotation_readiness.py
git commit -m "feat: add operations review and rotation passport"
```

---

### Task 6: Wire schedules, workflow heartbeat, and CI contract validation

**Files:**
- Create: `13_Faculty_Resources/_automation/maintenance/sp_health_monitor.py`
- Create: `13_Faculty_Resources/_automation/maintenance/maintenance_issue.py`
- Create: `13_Faculty_Resources/_automation/maintenance/workflow_heartbeat.py`
- Create: `13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py`
- Create: `tests/maintenance/test_sp_health_monitor.py`
- Create: `tests/maintenance/test_maintenance_issue.py`
- Create: `tests/maintenance/test_workflow_heartbeat.py`
- Create: `tests/maintenance/test_scheduled_workflows.py`
- Create: `.github/workflows/maintenance-sp-health-monitor.yml`
- Create: `.github/workflows/maintenance-production-canary.yml`
- Create: `.github/workflows/maintenance-heartbeat.yml`
- Create: `.github/workflows/maintenance-governance-digest.yml`
- Create: `.github/workflows/maintenance-monthly-review.yml`
- Create: `.github/workflows/maintenance-rotation-readiness.yml`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: GitHub Actions REST run payloads, maintenance scripts from Tasks 3–5, and existing
  Playwright projects; public `/api/sp/health-status`; content-free governance/monthly/rotation
  reports.
- Produces: SP health-monitor receipt; rolling faculty-review issues; heartbeat receipt JSON; parsed
  workflow contract gate; exact schedules from the design.

- [ ] **Step 1: Write failing health-monitor, issue-routing, and heartbeat tests**

For `sp_health_monitor.py`, cover fresh success, stale success, failed state, missing/malformed JSON,
unexpected response keys, non-200 status, unavailable endpoint, UTC-boundary behavior, and receipt
redaction. A fresh receipt must be at most eight hours old.

For `maintenance_issue.py`, use injected list/create/update functions. Assert:

- governance and monthly reports with review/blocking items create or update one rolling issue using
  `<!-- maintenance:governance -->` or `<!-- maintenance:monthly -->`;
- rotation `due`/`overdue` uses
  `<!-- maintenance:rotation:id=rot-2026-hx-a1b2c3d4e5f60718 -->`;
- ready/not-due/configuration-required state creates no issue;
- two marker matches fail closed;
- update payloads contain only bounded counts, safe IDs, gate/state, run/artifact links, and the
  fixed faculty-authority disclaimer;
- no path can close an issue, record attestation, or serialize clinical text, identity, or secret
  material.

```python
def test_stale_or_failed_scheduled_run_blocks():
    receipt = evaluate_runs(
        EXPECTATIONS,
        fixture_runs("production-canary", age_hours=31, conclusion="failure"),
        now=datetime(2026, 7, 28, 12, tzinfo=timezone.utc),
    )
    self.assertEqual(receipt["gate"], "blocked")
    self.assertEqual(receipt["workflows"][0]["state"], "failed")
```

Cover success, stale, failure, cancelled, missing, first-run grace, workflow API unavailable, exact
boundary age, manual runs not satisfying scheduled-run freshness, and missing git activation
provenance. Add history fixtures for a schedule added to an old `ci.yml`, a same-cron workflow
change, a pre-activation success, a non-descendant or wrong-blob run `head_sha`, remove/re-add,
malformed historical YAML, and unavailable git proof. Assert grace and run eligibility begin with
the exact current workflow blob's activation commit rather than file creation or cron continuity.

- [ ] **Step 2: Write failing parsed-workflow contract tests**

Parse YAML with the isolated Actions-compatible loader. It must reject duplicate mapping keys and
unsupported legacy scalar forms, preserve `on` and typed trigger values, and normalize only action
`with:` values to runner strings before comparing the canonical whole-workflow projection. Assert
the exact schedule map:

```python
EXPECTED = {
    "ci.yml": "0 8 * * 0",
    "surveillance-link-monitor.yml": "0 6 * * 1",
    "surveillance-citations.yml": "0 7 * * 1",
    "surveillance-guideline.yml": "0 6 1 * *",
    "maintenance-sp-health-monitor.yml": "15 */6 * * *",
    "maintenance-production-canary.yml": "20 9 * * *",
    "maintenance-heartbeat.yml": "45 10 * * *",
    "maintenance-governance-digest.yml": "30 12 * * 1",
    "maintenance-monthly-review.yml": "0 13 1 * *",
    "maintenance-rotation-readiness.yml": "15 13 * * *",
}
```

The validator must also assert:

- every action reference in each new or modified workflow equals an immutable SHA from Global
  Constraints; new maintenance/surveillance evidence uploads use `retention-days: 90`, the existing
  CI smoke artifact may remain 14 days, and no upload exceeds 90 days;
- least-privilege permissions, including `issues: write` only for workflows that route issues;
- sequential build commands and production URLs provided to scheduled/manual-equivalent LFS and
  Playwright runs;
- `ci.yml` has both `build-test-validate` and `smoke-tests`, `smoke-tests` needs
  `build-test-validate`, and neither job has an event condition that excludes `schedule`;
- the SP health monitor calls only the public content-free status route;
- governance/monthly artifacts upload before issue routing, the router receives the upload step's
  `artifact-url`, and blocking exit codes are preserved after both;
- rotation captures exit 10, routes and uploads, then translates 0/10 to final success while
  malformed/privacy-invalid codes fail;
- no baseline update command, curriculum/attestation mutation command, automatic issue close, or
  direct push to `main`.

- [ ] **Step 3: Run the tests and verify they fail**

Run:

```bash
python3 -m unittest tests.maintenance.test_sp_health_monitor \
  tests.maintenance.test_maintenance_issue \
  tests.maintenance.test_workflow_heartbeat \
  tests.maintenance.test_scheduled_workflows -v
```

Expected: missing workflow/script failures.

- [ ] **Step 4: Implement the GitHub Actions heartbeat**

Use the Actions API endpoint:

```text
GET /repos/{owner}/{repo}/actions/workflows/{workflow-file}/runs?event=schedule&per_page=10
```

Read and validate `head_sha` only for git provenance; do not serialize it. Normalize only workflow
file, run ID/URL, created/updated timestamps, status, conclusion, and age.
Default freshness limits are 30 hours daily, 8 days weekly, and 35 days monthly. The script reads
`GITHUB_TOKEN` only at request time, never serializes it, writes a receipt even on failure, and exits
2 when blocked. The expectation list is exact:

```python
{
    "maintenance-sp-health-monitor.yml": 10,
    "maintenance-production-canary.yml": 30,
    "maintenance-rotation-readiness.yml": 30,
    "ci.yml": 8 * 24,
    "maintenance-governance-digest.yml": 8 * 24,
    "surveillance-link-monitor.yml": 8 * 24,
    "surveillance-citations.yml": 8 * 24,
    "maintenance-monthly-review.yml": 35 * 24,
    "surveillance-guideline.yml": 35 * 24,
}
```

The heartbeat does not assess its own current workflow. Use a full-history default-branch checkout.
Confirm the parsed `HEAD` workflow contains the expected cron, record its exact Git blob SHA, and
walk the workflow path's first-parent history while that blob remains identical. The oldest commit
in the current exact-blob suffix is the activation commit. Any workflow-byte change, even with the
same cron, creates a new activation window.

A completed scheduled run qualifies only when its validated `head_sha` descends from that activation
commit, contains that exact workflow blob, and was created and updated on or after activation.
Absence remains `pending_first_run` only while the activation age is within the workflow's freshness
limit. Missing or malformed API, YAML, git, ancestry, or blob proof is blocked, never indefinite
grace.

- [ ] **Step 5: Implement the public SP monitor and safe issue router**

`sp_health_monitor.py` performs one unauthenticated GET to the exact configured
`https://sp-interview-proxy.netlify.app/api/sp/health-status` endpoint, enforces the bounded schema,
eight-hour maximum age, and `nextRun + 10 minutes` slot deadline, writes a normalized content-free
receipt even on failure, and exits 2 for missing/late-slot/stale/failed/unavailable state. It sends
no passcode or other credential.

`maintenance_issue.py` talks to the GitHub Issues REST API with `GITHUB_TOKEN`, exact owner/repo, and
fixed marker per kind. It creates or updates at most one open issue, never closes an issue, fails on
ambiguous matches, and renders issue bodies itself from allow-listed report fields. It uses only
argument arrays/standard-library HTTP, never shell interpolation. Governance/monthly issues link to
the run and captured `upload-artifact` `artifact-url` output and state explicitly that faculty review
remains required. Rotation issues use only a regex-validated opaque block ID, dates, state, and the
manual checklist.

- [ ] **Step 6: Create the six workflows and Sunday CI schedule**

All action uses are immutable pins from Global Constraints.

`maintenance-sp-health-monitor.yml`:

- cron `15 */6 * * *`, `contents: read`;
- run `sp_health_monitor.py` against the exact public status endpoint;
- upload the normalized receipt for 90 days with `if: always()`.

`maintenance-production-canary.yml`:

- cron `20 9 * * *`, `contents: read`;
- install smoke dependencies/Chromium;
- run Playwright `nav-ms3` and `nav-res` with the public URLs;
- run `production_canary.py`;
- upload Playwright evidence and release twin for 90 days with `if: always()`.

`maintenance-heartbeat.yml`:

- cron `45 10 * * *`, `actions: read`, `contents: read`, checkout with `fetch-depth: 0`;
- run `workflow_heartbeat.py`;
- upload receipt for 90 days with `if: always()`.

`maintenance-governance-digest.yml`:

- cron `30 12 * * 1`, `contents: read`, `issues: write`;
- capture the digest exit code without aborting;
- upload JSON/Markdown for 90 days with `if: always()`, a stable step ID, and capture its
  `artifact-url` output;
- after upload, route one rolling issue with that URL when review or blocking items exist; use
  `if: always()` so an upload failure can still link the run and say the artifact is unavailable;
- restore the digest's blocking/malformed exit code only after routing and upload.

`maintenance-monthly-review.yml`:

- cron `0 13 1 * *`, `contents: read`, `issues: write`, `fetch-depth: 0`;
- run evidence generated-view validation and monthly review;
- upload JSON/Markdown for 90 days with `if: always()`, a stable step ID, and capture its
  `artifact-url` output;
- after upload, route one rolling issue with that URL when review or blocking items exist; use
  `if: always()` so an upload failure can still link the run and say the artifact is unavailable;
- preserve a blocking/malformed exit only after routing and upload.

`maintenance-rotation-readiness.yml`:

- cron `15 13 * * *`, `contents: read`, `issues: write`;
- run the evaluator with shell fail-fast temporarily disabled and capture its exit code;
- upload the passport for 90 days with `if: always()` and capture the artifact URL;
- after upload, on exit 10 (`due`/`overdue`), create or update one issue keyed by the
  regex-validated opaque block ID; on `configuration_required` or `not_due`, create no issue;
- finish successfully for exit 0 or 10 and fail for malformed/privacy-invalid/runtime exit codes.

Add cron `0 8 * * 0` to `.github/workflows/ci.yml`. Preserve validator, sequential-build,
Playwright, and baseline behavior. Pin every existing action in the modified file. For `schedule`
and `workflow_dispatch`, feed the two exact production learner URLs to the LFS project instead of
silently skipping its hosted probe; PR runs keep the deploy-preview behavior. Place `schedule` after
the existing `workflow_dispatch` mapping so the faculty-console deployment-contract regression
retains its trigger-order assertion.

- [ ] **Step 7: Add the workflow contract gate to CI**

After dependencies are installed, run:

```bash
python3 -m unittest discover -s tests/maintenance -p 'test_*.py' -v
python3 13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py
```

Keep the root `node --test tests/*.test.mjs` step so the governance-digest test joins the existing
suite.

- [ ] **Step 8: Verify and commit Task 6**

Run:

```bash
python3 -m unittest discover -s tests/maintenance -p 'test_*.py' -v
python3 13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py
node --test tests/*.test.mjs
```

Expected: every maintenance test and the expanded root suite passes. The parsed contract confirms
both CI jobs and all required release-gate steps are schedule-reachable.

```bash
git add .github/workflows \
  13_Faculty_Resources/_automation/maintenance \
  tests/maintenance tests/maintenance-governance-digest.test.mjs
git commit -m "feat: wire scheduled maintenance workflows"
```

---

### Task 7: Document operations and run full verification

**Files:**
- Create: `13_Faculty_Resources/_automation/maintenance/README.md`
- Modify: `README.md`
- Modify: `13_Faculty_Resources/_automation/GIT_AND_DEPLOY_PLAN.md`
- Modify: `13_Faculty_Resources/_automation/maintenance/maintenance_config.json`
- Modify: `13_Faculty_Resources/_automation/surveillance/README.md`
- Modify: `docs/superpowers/specs/2026-07-28-scheduled-maintenance-steward-design.md`
- Modify: `docs/superpowers/plans/2026-07-28-scheduled-maintenance-steward.md`

**Interfaces:**
- Consumes: all prior task CLIs, workflow names, artifact names, and manual gates.
- Produces: one operator index with cadence, ownership, artifact location, alert semantics, required
  manual actions, and rollback/disable instructions.

- [ ] **Step 1: Write the operator runbook**

Document:

- the complete schedule matrix and UTC/local distinction;
- GitHub artifact names and retention;
- the rolling surveillance inbox lifecycle and exact allowed paths;
- how to run each script locally with output under `/tmp`;
- how to interpret `ready`, `review`, `blocked`, `configuration_required`, and
  `pending_first_run`;
- the Netlify Blob receipt, public status endpoint, six-hour GitHub alert monitor, and secondary
  scheduled-function log verification;
- the rolling governance/monthly/rotation issue lifecycle and the rule that automation never closes
  or attests;
- the exact root/nav/search/media cache-control and ETag integrity contracts;
- immutable action-pin update procedure and 90-day artifact ceiling;
- rotation block JSON examples using synthetic non-identifying IDs;
- manual credential rotation/red-team/faculty/privacy boundaries;
- the split between GitHub pack-versus-red-team recency and external authenticated
  deploy-versus-red-team recency;
- how to pause a workflow by disabling it in GitHub and how to pause a Codex heartbeat;
- that scheduled GitHub workflows activate only on the default branch.

- [ ] **Step 2: Run targeted validators and tests**

Run:

```bash
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
python3 tools/evidence_registry/validate.py --check-generated
python3 -m unittest discover -s tests/maintenance -p 'test_*.py' -v
python3 13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py
node --test tests/*.test.mjs
npm --prefix sp-proxy test
```

Expected: all commands pass. Record exact totals in the task report.

- [ ] **Step 3: Run both site builds sequentially**

Run:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: both static QA gates pass. Do not start them in parallel.

- [ ] **Step 4: Run the full browser suite**

Run:

```bash
cd tests/smoke
npm ci
npx playwright install chromium
cd ../..
bash tests/smoke/start-local-servers.sh
cd tests/smoke
npx playwright test
```

Expected: nav, tools, accessibility interactions, LFS fixture behavior, and resident visual
regression pass. Do not update snapshots.

- [ ] **Step 5: Confirm privacy and mutation boundaries**

Run:

```bash
git diff origin/main -- \
  question_bank.json topic_meta.json 13_Faculty_Resources/reviewed.json \
  00_START_HERE 01_Six_Week_Curriculum 02_Clinical_Skills 03_Core_Topics \
  04_Acute_and_Safety 05_Psychopharmacology
git grep -nE '(SP_STUDENT_PASSCODE|SP_OPERATIONS_KEY|NETLIFY_AUTH_TOKEN).{0,12}=' \
  -- ':!docs/superpowers/**' ':!sp-proxy/README.md'
```

Expected: no clinical/attestation diff and no committed credential assignment.

- [ ] **Step 6: Commit Task 7**

```bash
git add README.md \
  13_Faculty_Resources/_automation/maintenance/README.md \
  13_Faculty_Resources/_automation/maintenance/maintenance_config.json \
  13_Faculty_Resources/_automation/GIT_AND_DEPLOY_PLAN.md \
  13_Faculty_Resources/_automation/surveillance/README.md \
  docs/superpowers/specs/2026-07-28-scheduled-maintenance-steward-design.md \
  docs/superpowers/plans/2026-07-28-scheduled-maintenance-steward.md
git commit -m "docs: add scheduled maintenance operations runbook"
```

---

### Task 8: Controller-only activation, external heartbeats, and live handoff

**Files:**
- No repository file changes unless review findings require a separately reviewed fix.

**Interfaces:**
- Consumes: reviewed branch, complete verification evidence, GitHub/Netlify connectors, current
  Codex thread ID, and the three immutable Netlify site IDs.
- Produces: pushed branch, pull request, active Codex heartbeats, and an honest active-versus-
  pending-merge status.

- [ ] **Step 1: Run final whole-branch review and address findings**

Use the SDD final review package from merge base `origin/main` to current `HEAD`. One fix wave and one
scoped re-review are allowed. No controller-authored unreviewed fix.

- [ ] **Step 2: Push the branch and create a pull request**

```bash
git push --set-upstream origin codex/scheduled-maintenance-steward
gh pr create \
  --base main \
  --head codex/scheduled-maintenance-steward \
  --title "Add scheduled maintenance steward" \
  --body-file /tmp/scheduled-maintenance-pr-body.md
```

The PR body summarizes schedules, secrets (names only), safety boundaries, verification, and the
fact that default-branch merge activates GitHub/Netlify schedules and deploys the new SP scheduled
function.

- [ ] **Step 3: Create or update the daily external deadman heartbeat**

Create one `ACTIVE` thread heartbeat named `Clerkship automation deadman`, daily at 08:30
`America/New_York`, with failed-runs-only notification. Its prompt must:

- inspect default-branch scheduled workflow runs and latest release-twin artifact;
- inspect the public content-free Interview Room health status and its six-hour GitHub monitor;
- inspect open surveillance/automation issues;
- inspect all three Netlify site IDs read-only;
- compare ready state, branch, commit relationship, and function inventory;
- compare the latest content-free red-team receipt with the authenticated SP deploy timestamp/commit,
  clearly separating pack-git recency from deploy recency;
- treat an unmerged implementation PR as `pending_merge`, not a hosted failure;
- report only stale, failed, missing, drifted, or unavailable evidence;
- never deploy, edit, rotate credentials, or change clinical content.

- [ ] **Step 4: Create or update the monthly external review heartbeat**

Create one `ACTIVE` thread heartbeat named `Clerkship external policy review`, first Tuesday at
09:00 `America/New_York`, normal notification. Its prompt limits sources to official provider,
Netlify, evidence-registry, and connected local Zotero metadata. It reports source links, dates,
identity ambiguity, model/privacy/retention/price changes, and attended actions. It never downloads
licensed attachments into git, changes evidence mappings/appraisals, or modifies curriculum.

- [ ] **Step 5: Create or update the rotation follow-up heartbeat**

Create one `ACTIVE` thread heartbeat named `Clerkship rotation readiness`, Mondays at 09:15
`America/New_York`, normal notification. It checks a bounded 90-day calendar window plus
`rotation_blocks.json`; if an authoritative start is found it proposes the date fields and asks for
a faculty-supplied opaque ID matching
`^rot-[0-9]{4}-hx-(?=[a-f0-9]{16}$)(?=[a-f0-9]*[a-f])(?=[a-f0-9]*[0-9])[a-f0-9]{16}$`. It never
generates or writes the ID or record. At seven days it summarizes the generated passport. If no date
exists, it uses the task's own prior run messages as a durable request ledger and asks only when no
request appears in the previous 30 days; if history is unavailable it reports that limitation
without repeating the request. It never writes a learner name or credential.

- [ ] **Step 6: Verify live external state**

Confirm the three automation IDs/names/statuses, the PR URL and checks, the default-branch state,
and current Netlify deploy metadata. Inspect each automation definition to prove its local cadence,
exact site-ID mapping, read-only prompt, durable 30-day request rule, and `pending_merge` behavior.
Run one bounded manual/dry-run wakeup for each heartbeat and verify it performs no write/deploy and
reports unavailable evidence honestly. If the PR is not merged, report GitHub/Netlify schedules as
`pending_merge`; never claim activation from branch-local files. If protected checks and required
review permit merge, merge through the protected branch, wait for Actions/Netlify, dispatch the
Sunday CI workflow once as a manual-equivalent rehearsal, and verify both authoritative jobs plus
every required step executed rather than skipped. Wait through one scheduled SP receipt/monitor
window or invoke the documented safe receipt verification path, then report confirmed production
state separately from local success.
