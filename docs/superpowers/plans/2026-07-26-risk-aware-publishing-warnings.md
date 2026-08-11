# Risk-Aware Publishing Warnings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every shipped page and tool display centrally governed, risk-scaled review status in the shared sites and through direct tool addresses.

**Architecture:** Extend `reviewed.json` with a validated surface-risk record, then derive a presentation-only `governance.json` for each built site. Reuse the existing tool-governance producer for provenance, inject standardized direct-tool status into built HTML, and make the faculty console preserve risk during review transitions.

**Tech Stack:** Python 3, JSON Schema via `jsonschema==4.26.0`, static HTML/CSS/JavaScript, Node `node:test`, Netlify Functions v2, Playwright, existing MS3/resident Python build pipeline

## Global Constraints

- `13_Faculty_Resources/reviewed.json` is the sole authority for page/tool review status and surface publishing risk.
- Allowed review statuses are exactly `pending` and `reviewed`.
- Allowed risk kinds are exactly `general`, `clinical`, `legal`, `formulary`, and `local-policy`.
- Allowed surface risk levels are exactly `low`, `moderate`, and `high`.
- Pending high-risk material remains publishable, but it must never render like reviewed material.
- Missing, malformed, or contradictory governance must fail publication.
- Local-policy warnings must tell learners to verify current institutional policy or workflow.
- High-risk clinical, legal, and formulary warnings must tell learners to verify decisions with a supervising clinician.
- Warning text is fixed application copy; do not generate new clinical prose.
- Preserve every current reviewed/pending decision. Do not attest content during migration.
- Do not edit clinical recommendations, doses, evidence claims, media, question-bank items, or local-policy values.
- Preserve existing `cw_*` and `rp_*` storage contracts and faculty-preview behavior.
- Use no real patient data or PHI.
- Build MS3 and residents sequentially because they share generated output.
- Preserve all unrelated changes by executing in an isolated worktree created from current `origin/main`.

---

## Execution setup

Use `superpowers:using-git-worktrees` before Task 1. Create
`.worktrees/risk-aware-publishing-warnings` on
`codex/risk-aware-publishing-warnings` from current `origin/main`, then cherry-pick
the approved design/plan commits. Confirm:

```bash
git status --short --branch
git log -3 --oneline
```

Expected: the isolated branch contains the approved design and this plan, with no
unrelated dirty files.

## File structure

### New files

- `13_Faculty_Resources/reviewed.schema.json` — canonical source-ledger contract.
- `13_Faculty_Resources/_automation/surface_governance.py` — ledger validation,
  presentation normalization, nav annotation, direct-tool status injection, and
  deterministic writes.
- `13_Faculty_Resources/_automation/test_surface_governance.py` — focused unit and
  fixture tests for the new module.
- `tests/surface-governance-build.test.mjs` — static build-contract checks for the
  public artifact, navigation, search, and direct-tool parity.
- `tests/surface-governance-ui.test.mjs` — shared-shell structure and fail-safe
  behavior checks.
- `tests/smoke/governance-warnings.spec.js` — learner-visible MS3/resident and
  direct-tool acceptance checks.

### Modified files

- `13_Faculty_Resources/reviewed.json` — add approved `risk` and pending `reason`
  fields without changing review decisions.
- `13_Faculty_Resources/_automation/validate_attestation_consistency.py` — invoke
  the canonical ledger validator and retain existing source/pack contradiction
  checks.
- `13_Faculty_Resources/_automation/test_validate_attestation_consistency.py` —
  cover risk validation and status contradictions.
- `13_Faculty_Resources/_automation/validate_tool_governance.py` — derive tool
  review/risk envelope fields from the canonical ledger.
- `13_Faculty_Resources/_automation/test_validate_tool_governance.py` — prove the
  ledger, not a source comment, owns those fields.
- `13_Faculty_Resources/_automation/site_build/build_deploy.py` — produce MS3
  `governance.json`, annotate nav/search, inject built-tool status, and cache the
  artifact correctly.
- `13_Faculty_Resources/_automation/site_build/resident_section.py` — rebuild the
  resident artifact and replace inherited MS3 tool-status blocks.
- `13_Faculty_Resources/_automation/site_build/spa_index.html` — render the
  canonical warning/badge/receipt and fail-safe state.
- `13_Faculty_Resources/_automation/site_build/check-static-site.mjs` — enforce
  built governance/nav/search/direct-tool parity.
- `08_Cases_and_Simulation/one-patient-six-weeks.html` — stop fetching the raw
  source ledger and rely on the standardized site/tool status presentation.
- `faculty-console/netlify/functions/attest.mjs` — return risk/reason and preserve
  risk/notes/hashes through attest/reopen writes.
- `faculty-console/review-model.mjs` and `faculty-console/app.mjs` — display
  read-only risk context and require a concise reason when reopening.
- `tests/faculty-console-handler.test.mjs`,
  `tests/faculty-console-contract.test.mjs`, and
  `tests/faculty-console-actions.test.mjs` — cover the extended console contract.
- `tests/smoke/playwright.config.js` — include the governance warning suite in
  `nav-ms3` and `nav-res`.

---

### Task 1: Canonical ledger schema and normalization module

**Files:**

- Create: `13_Faculty_Resources/reviewed.schema.json`
- Create: `13_Faculty_Resources/_automation/surface_governance.py`
- Create: `13_Faculty_Resources/_automation/test_surface_governance.py`

**Interfaces:**

- Produces: `load_validated_ledger(root: Path) -> dict[str, dict]`
- Produces: `build_site_document(ledger: dict, nav: list, site: str) -> dict`
- Produces: `annotate_navigation(nav: list, document: dict) -> list`
- Produces: `apply_tool_status(tools_directory: Path, document: dict) -> None`
- Produces: `write_site_document(output_path: Path, document: dict) -> None`
- The site document shape is
  `{"schemaVersion": 1, "site": "ms3"|"resident", "items": {slug: entry}}`.

- [ ] **Step 1: Write schema and invalid-record tests**

Add fixture helpers that write a minimal ledger and assert:

```python
def reviewed_entry():
    return {
        "status": "reviewed",
        "risk": {"kind": "clinical", "level": "high"},
        "at": "2026-07-26",
        "by": "Synthetic Reviewer, MD",
    }


def pending_entry():
    return {
        "status": "pending",
        "risk": {"kind": "local-policy", "level": "high"},
        "reason": "Synthetic local workflow awaiting confirmation",
        "at": "2026-07-26",
        "by": "Pending faculty review",
    }
```

Test the valid records plus these failures:

- missing `risk`;
- unknown risk kind or level;
- pending without `reason`;
- pending with a non-pending reviewer;
- reviewed with `Pending faculty review`;
- invalid/future date;
- unexpected record field;
- an invalid value is never echoed in the exception.

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
python3 13_Faculty_Resources/_automation/test_surface_governance.py
```

Expected: FAIL because `surface_governance` and the schema do not exist.

- [ ] **Step 3: Add the exact JSON Schema**

Use Draft-07 with:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": {
    "type": "object",
    "properties": {
      "status": {"enum": ["pending", "reviewed"]},
      "risk": {
        "type": "object",
        "properties": {
          "kind": {"enum": ["general", "clinical", "legal", "formulary", "local-policy"]},
          "level": {"enum": ["low", "moderate", "high"]}
        },
        "required": ["kind", "level"],
        "additionalProperties": false
      },
      "reason": {"type": "string", "minLength": 1, "maxLength": 240},
      "at": {"type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$"},
      "by": {"type": "string", "minLength": 1, "maxLength": 80},
      "note": {"type": "string"},
      "contentHash": {"type": "string", "pattern": "^[a-f0-9]{64}$"},
      "claimsHash": {"type": "string", "pattern": "^[a-f0-9]{64}$"},
      "evidenceHash": {"type": "string", "pattern": "^[a-f0-9]{64}$"},
      "evidenceThrough": {"type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$"}
    },
    "required": ["status", "risk", "at", "by"],
    "allOf": [
      {
        "if": {"properties": {"status": {"const": "pending"}}},
        "then": {
          "required": ["reason"],
          "properties": {"by": {"const": "Pending faculty review"}}
        }
      },
      {
        "if": {"properties": {"status": {"const": "reviewed"}}},
        "then": {"not": {"properties": {"by": {"const": "Pending faculty review"}}}}
      }
    ],
    "additionalProperties": false
  }
}
```

- [ ] **Step 4: Implement ledger validation and fixed warning copy**

Implement `load_validated_ledger()` with `Draft7Validator` and an explicit
`date.fromisoformat()`/future-date pass. Format errors as
`reviewed.json: <slug> invalid at /field/path` without the rejected value.

Use this normalization:

```python
def presentation_entry(slug, kind, entry):
    risk_kind = entry["risk"]["kind"]
    risk_level = entry["risk"]["level"]
    result = {
        "kind": kind,
        "status": entry["status"],
        "riskKind": risk_kind,
        "riskLevel": risk_level,
        "reviewer": entry["by"],
        "reviewedAt": entry["at"],
    }
    if entry["status"] == "pending":
        result["reason"] = entry["reason"]
        result["warning"] = warning_copy(kind, risk_kind, risk_level, entry["reason"])
    return result
```

Exact high-risk copy:

```python
HIGH_CLINICAL = (
    "This {kind} includes high-risk {risk} teaching that has not completed "
    "faculty attestation. Verify decisions with your supervising clinician."
)
HIGH_LOCAL = (
    "This {kind} includes institution-specific teaching that has not completed "
    "faculty attestation. Verify current institutional policy or workflow before acting."
)
```

Low/moderate copy is the ledger `reason`, prefixed in the UI by
`Pending faculty review`.

- [ ] **Step 5: Implement deterministic site output and nav annotation**

`build_site_document()` must flatten visible and hidden nav items, reject duplicate
slugs with different kinds, reject missing ledger entries, include only items shipped
to that site, and sort item keys. `annotate_navigation()` adds:

```json
"governance": {
  "status": "pending",
  "riskKind": "clinical",
  "riskLevel": "high"
}
```

to every nav item without modifying titles or routing fields.

- [ ] **Step 6: Write failing direct-tool injection tests**

Cover:

- pending high tool gets one marker-delimited warning block;
- pending moderate tool gets compact status;
- reviewed tool gets a reviewer/date receipt;
- reinjection replaces the prior block rather than duplicating it;
- a top-level tool always shows its injected block;
- an iframe hides the injected block only for `?governed=1`;
- missing `<head>` or `<body>` fails closed for a pending tool;
- a pending page does not cause an HTML-tool injection.

- [ ] **Step 7: Implement direct-tool injection**

Use exact sentinel comments:

```html
<!-- SURFACE-GOVERNANCE:START -->
...
<!-- SURFACE-GOVERNANCE:END -->
```

Inject theme-aware CSS before `</head>`, semantic status markup immediately after
the opening `<body>`, and a minimal head script that adds `governed-embed` only when
`window.self !== window.top` and `governed=1`. If the script fails, the internal
warning remains visible, favoring duplicate warning over hidden warning.

- [ ] **Step 8: Run focused tests**

Run:

```bash
python3 13_Faculty_Resources/_automation/test_surface_governance.py
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add 13_Faculty_Resources/reviewed.schema.json \
  13_Faculty_Resources/_automation/surface_governance.py \
  13_Faculty_Resources/_automation/test_surface_governance.py
git commit -m "feat(governance): add canonical surface review contract"
```

---

### Task 2: Attestation and tool-governance authority alignment

**Files:**

- Modify: `13_Faculty_Resources/_automation/validate_attestation_consistency.py`
- Modify: `13_Faculty_Resources/_automation/test_validate_attestation_consistency.py`
- Modify: `13_Faculty_Resources/_automation/validate_tool_governance.py`
- Modify: `13_Faculty_Resources/_automation/test_validate_tool_governance.py`

**Interfaces:**

- Consumes: `load_validated_ledger(root)`
- Consumes: ledger records with `status`, `risk.kind`, and `risk.level`
- Produces: tool envelopes whose `reviewStatus`, `attestationStatus`,
  `reviewCategory`, and `safetySeverity` match the ledger

- [ ] **Step 1: Add failing attestation-validator fixtures**

Update fixture ledger entries to the Task 1 schema. Add assertions that:

- malformed risk appears as one stable error;
- missing manifest item still fails;
- `topic_meta`/pack/marker claiming reviewed while the ledger is pending fails;
- a valid pending high-risk record is not an error;
- a valid reviewed record is not an error.

- [ ] **Step 2: Run the attestation tests and verify failure**

Run:

```bash
python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py
```

Expected: FAIL because `validate()` does not invoke the new ledger contract.

- [ ] **Step 3: Make the attestation validator consume the canonical loader**

Replace its raw ledger load with:

```python
try:
    reviewed = load_validated_ledger(Path(root))
except SurfaceGovernanceError as error:
    return [str(error)]
```

Retain the source, pack, and topic contradiction checks. Do not let those secondary
sources grant review status.

- [ ] **Step 4: Add failing tool-envelope ownership tests**

For a tool with a source marker saying `reviewed` and a pending ledger record,
expect:

```python
self.assertEqual(envelope["reviewStatus"], "needs-review")
self.assertEqual(envelope["attestationStatus"], "needs-attestation")
self.assertEqual(envelope["reviewCategory"], "local-policy")
self.assertEqual(envelope["safetySeverity"], "high")
```

For a reviewed general/low ledger record, expect `reviewed`,
`faculty-attested`, `general`, and `low`.

- [ ] **Step 5: Run tool-governance tests and verify failure**

Run:

```bash
python3 13_Faculty_Resources/_automation/test_validate_tool_governance.py
```

Expected: FAIL because tool normalization currently prefers marker status and
conservative hard-coded risk.

- [ ] **Step 6: Normalize tool envelopes from the ledger**

Change `normalize_tool()` to receive `ledger_entry: dict` and set:

```python
"reviewStatus": "reviewed" if ledger_entry["status"] == "reviewed" else "needs-review",
"attestationStatus": (
    "faculty-attested" if ledger_entry["status"] == "reviewed"
    else "needs-attestation"
),
"safetySeverity": ledger_entry["risk"]["level"],
"reviewCategory": ledger_entry["risk"]["kind"],
```

Marker and pack statuses remain inputs to the attestation-consistency validator, not
authority for the envelope. Reject a missing ledger entry.

- [ ] **Step 7: Run both validator suites**

Run:

```bash
python3 13_Faculty_Resources/_automation/test_surface_governance.py
python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py
python3 13_Faculty_Resources/_automation/test_validate_tool_governance.py
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add 13_Faculty_Resources/_automation/validate_attestation_consistency.py \
  13_Faculty_Resources/_automation/test_validate_attestation_consistency.py \
  13_Faculty_Resources/_automation/validate_tool_governance.py \
  13_Faculty_Resources/_automation/test_validate_tool_governance.py
git commit -m "fix(governance): make the review ledger authoritative"
```

---

### Task 3: Build artifacts, nav/search status, and direct-tool parity

**Files:**

- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py`
- Modify: `13_Faculty_Resources/_automation/site_build/resident_section.py`
- Modify: `13_Faculty_Resources/_automation/site_build/check-static-site.mjs`
- Modify: `08_Cases_and_Simulation/one-patient-six-weeks.html`
- Test: `13_Faculty_Resources/_automation/test_surface_governance.py`
- Create: `tests/surface-governance-build.test.mjs`

**Interfaces:**

- Consumes: `build_site_document()`, `annotate_navigation()`,
  `apply_tool_status()`, and `write_site_document()`
- Produces: `_build/<site>/governance.json`
- Produces: governance annotation on every `nav.json` item and search-index document
- Preserves: existing `tool-governance.json`

- [ ] **Step 1: Add failing build-contract tests**

Add Python fixture tests plus `tests/surface-governance-build.test.mjs` to build a
temporary nav/search/tools tree and assert:

- `governance.json` contains every nav slug exactly once;
- nav and search governance triplets match the artifact;
- internal source-ledger `note` and hash fields are absent;
- pending direct tools contain the standardized marker;
- reviewed direct tools contain a receipt, not pending copy;
- rerunning resident injection removes inherited MS3 blocks first.

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
python3 13_Faculty_Resources/_automation/test_surface_governance.py
node --test tests/*.test.mjs
```

Expected: new build-contract assertions FAIL.

- [ ] **Step 3: Integrate the MS3 build**

After the final MS3 nav is assembled but before search-index serialization:

```python
_ledger = load_validated_ledger(Path(LIB))
_surface_governance = build_site_document(_ledger, nav, "ms3")
nav = annotate_navigation(nav, _surface_governance)
open(OUT + "/nav.json", "w", encoding="utf-8").write(
    json.dumps(nav, ensure_ascii=False)
)
```

Make `build_search_index()` copy each nav item's `governance` object into its
corresponding search document. After all tool transforms:

```python
apply_tool_status(Path(OUT) / "tools", _surface_governance)
write_site_document(Path(OUT) / "governance.json", _surface_governance)
```

Add a no-cache stanza for `/governance.json`. Keep `/tool-governance.json`.

- [ ] **Step 4: Integrate the resident build**

After resident nav creation, load the same ledger and build a resident-specific
document. `apply_tool_status()` must strip inherited marker blocks before applying
resident entries, then write `_build/res/governance.json`. Ensure resident search
documents receive resident governance.

- [ ] **Step 5: Remove the longitudinal tool's raw ledger client**

Delete its `fetch('../reviewed.json')` and bespoke `state.review/reviewBadge()`
behavior. The standardized shell/direct-tool status is the only prominent
governance signal; the case behavior and `cw_longitudinal_v1` storage remain
unchanged.

- [ ] **Step 6: Add static-QA parity checks**

In `check-static-site.mjs`, hard-fail when:

- `governance.json` is absent/invalid;
- artifact site value is invalid;
- any nav item lacks governance or disagrees with the artifact;
- any search doc lacks governance or disagrees;
- any pending tool lacks exactly one built marker block;
- any reviewed tool contains pending-warning copy;
- `reviewed.json` is still published to the learner output.

The raw source ledger should no longer be copied to `_build/*`; only
`governance.json` is public.

- [ ] **Step 7: Run targeted build checks**

Run sequentially:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: both PASS after the production ledger migration in Task 6. Before Task 6,
run the same behavior against synthetic fixtures only; do not weaken strict
validation to make the unmigrated production ledger pass.

- [ ] **Step 8: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/build_deploy.py \
  13_Faculty_Resources/_automation/site_build/resident_section.py \
  13_Faculty_Resources/_automation/site_build/check-static-site.mjs \
  08_Cases_and_Simulation/one-patient-six-weeks.html \
  13_Faculty_Resources/_automation/test_surface_governance.py \
  tests/surface-governance-build.test.mjs
git commit -m "feat(build): publish governed review status"
```

---

### Task 4: Shared-shell warning, badge, receipt, and fail-safe behavior

**Files:**

- Modify: `13_Faculty_Resources/_automation/site_build/spa_index.html`
- Create: `tests/surface-governance-ui.test.mjs`
- Create: `tests/smoke/governance-warnings.spec.js`

**Interfaces:**

- Consumes: `governance.json` entries keyed by route slug
- Consumes: nav/search `governance` triplets
- Produces: one `.governance-notice` for the active surface
- Produces: `.governance-badge` in pending nav/search rows

- [ ] **Step 1: Add failing structural tests**

Assert the shell:

- fetches `governance.json`, not `reviewed.json`;
- defines `renderGovernanceNotice(item)`;
- includes fixed `Review status unavailable—verify with faculty` copy;
- adds `?governed=1` to embedded tool URLs;
- never derives warning prose from `topic_meta.facultyReview`.

- [ ] **Step 2: Run root tests and verify failure**

Run:

```bash
node --test tests/*.test.mjs
```

Expected: new shell-contract assertions FAIL.

- [ ] **Step 3: Implement governance state loading**

Replace `REVIEWED` with:

```javascript
var GOVERNANCE={status:'loading',items:{}};
fetch('governance.json')
  .then(function(r){if(!r.ok)throw new Error('governance unavailable');return r.json();})
  .then(function(d){GOVERNANCE={status:'ready',items:d.items||{}};rerenderCurrent();})
  .catch(function(){GOVERNANCE={status:'unavailable',items:{}};rerenderCurrent();});
```

The unavailable state must never create a reviewed receipt.

- [ ] **Step 4: Implement the active-surface presentation**

`renderGovernanceNotice(item)` returns:

- high pending: `<section role="alert" tabindex="-1">` with title, fixed warning,
  risk label, reason, and the existing feedback action;
- low/moderate pending: compact `<div role="status">`;
- reviewed: lower-emphasis reviewer/date receipt;
- unavailable or missing runtime entry: generic fail-safe notice.

Focus a high-risk warning after a normal route change. Do not move focus during
faculty-preview initialization or browser-history restoration.

- [ ] **Step 5: Add nav and search badges**

Use the nav/search governance triplet for text:

- `Pending review · High risk`
- `Pending review`
- no badge for reviewed items

Add an accessible name containing the full status and do not rely on color alone.

- [ ] **Step 6: Prevent embedded duplication**

Load tools as:

```javascript
'tools/'+item.f+toolFrameSuffixWithGovernance(opts&&opts.toolExtra)
```

where the helper preserves existing query parameters and adds `governed=1`. The
shell renders the outer warning; the injected built-tool block hides only inside
this governed iframe.

- [ ] **Step 7: Add browser assertions**

Create initial Playwright cases against synthetic built fixtures or the migrated
build:

- pending high page has one alert and receives focus after navigation;
- pending high embedded tool has one visible alert total;
- direct tool has its internal alert;
- pending moderate item has compact status;
- reviewed item has reviewer/date receipt;
- aborted `governance.json` request shows the fail-safe notice;
- pending nav/search rows expose accessible status text.

- [ ] **Step 8: Run root and focused browser tests**

Run:

```bash
node --test tests/*.test.mjs
cd tests/smoke && npx playwright test governance-warnings.spec.js --project=nav-ms3
```

Expected: PASS once Task 6 has migrated the production ledger and builds exist.

- [ ] **Step 9: Commit**

```bash
git add 13_Faculty_Resources/_automation/site_build/spa_index.html \
  tests/surface-governance-ui.test.mjs \
  tests/smoke/governance-warnings.spec.js
git commit -m "feat(ui): show risk-aware review status"
```

---

### Task 5: Faculty-console risk preservation and reopen reason

**Files:**

- Modify: `faculty-console/netlify/functions/attest.mjs`
- Modify: `faculty-console/review-model.mjs`
- Modify: `faculty-console/app.mjs`
- Modify: `tests/faculty-console-handler.test.mjs`
- Modify: `tests/faculty-console-contract.test.mjs`
- Modify: `tests/faculty-console-actions.test.mjs`

**Interfaces:**

- GET content item adds `risk` and `reason`.
- Existing `changes: {slug: boolean}` remains compatible for attestation.
- Reopening additionally requires `reasons: {slug: string}`.
- Risk is read-only in this increment; a later classification queue owns risk edits.

- [ ] **Step 1: Add failing handler tests**

Use ledger fixtures containing risk, note, and synthetic future hash fields. Assert:

- GET returns `risk` and pending `reason` but not internal `note` or hashes;
- attesting uses `{...current, status:'reviewed', at, by}` and preserves
  `risk`, `note`, and hashes while removing `reason`;
- reopening preserves the same fields, sets pending reviewer, and stores the supplied
  concise reason;
- reopening without a reason returns `content.reason_required`;
- a malformed/oversized reason returns `content.invalid_reason`;
- conflict retries retain the exact requested reason and current preserved fields.

- [ ] **Step 2: Run handler tests and verify failure**

Run:

```bash
node --test tests/faculty-console-handler.test.mjs
```

Expected: new tests FAIL because mutation currently replaces the whole record.

- [ ] **Step 3: Preserve records in the handler**

Replace the destructive record creation with:

```javascript
const current = reviewed[slug];
const next = { ...current, status: selected ? 'reviewed' : 'pending', at };
if (selected) {
  next.by = attester;
  delete next.reason;
} else {
  next.by = 'Pending faculty review';
  next.reason = requireReopenReason(body.reasons?.[slug]);
}
reviewed[slug] = next;
```

Reject content mutation if the current record lacks valid risk; do not invent a
default in the function.

- [ ] **Step 4: Add failing review-model/UI tests**

Assert normalized content review items include risk, search can find risk kind, the
attestation rail displays risk read-only, and reopen is disabled until a 1–240
character reason is provided.

- [ ] **Step 5: Run model/action tests and verify failure**

Run:

```bash
node --test tests/faculty-console-contract.test.mjs \
  tests/faculty-console-actions.test.mjs
```

Expected: FAIL.

- [ ] **Step 6: Implement read-only risk and reopen reason UI**

Add risk to `searchText`, show `Clinical · High risk` (or the relevant values), and
add one labeled textarea used only when reopening. `contentMutationSnapshot()`
includes:

```javascript
reasons: reviewed ? {} : { [item.identity]: state.reopenReason.trim() }
```

Clear the reason after a confirmed save; preserve it across authentication retry or
network failure.

- [ ] **Step 7: Run faculty-console suites**

Run:

```bash
node --test tests/faculty-console-handler.test.mjs \
  tests/faculty-console-contract.test.mjs \
  tests/faculty-console-actions.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add faculty-console/netlify/functions/attest.mjs \
  faculty-console/review-model.mjs faculty-console/app.mjs \
  tests/faculty-console-handler.test.mjs \
  tests/faculty-console-contract.test.mjs \
  tests/faculty-console-actions.test.mjs
git commit -m "fix(faculty-console): preserve governance on review"
```

---

### Task 6: Production risk-classification migration

**Files:**

- Modify: `13_Faculty_Resources/reviewed.json`
- Test: all governance validators

**Interfaces:**

- Consumes: current `origin/main` ledger and both generated nav inventories
- Produces: one valid risk record for every ledger entry
- Preserves: every existing status/date decision except pending reviewer labels are
  normalized to `Pending faculty review`

- [ ] **Step 1: Measure the live inventory**

Run:

```bash
python3 - <<'PY'
import json
from pathlib import Path
ledger = json.loads(Path("13_Faculty_Resources/reviewed.json").read_text())
counts = {}
for value in ledger.values():
    counts[value["status"]] = counts.get(value["status"], 0) + 1
print({"entries": len(ledger), "statuses": counts})
PY
```

Record the result in the implementation notes. The 2026-07-26 planning baseline is
110 entries: 94 reviewed and 16 pending; the command is authoritative if that count
has changed.

- [ ] **Step 2: Generate a conservative review worksheet**

Add a non-mutating CLI mode to `surface_governance.py`:

```bash
python3 13_Faculty_Resources/_automation/surface_governance.py \
  --write-proposal /tmp/pcl-risk-review.json
```

Each row contains `slug`, `status`, proposed `risk`, `basis`, and
`facultyConfirmationRequired`. Explicit `LOCAL_POLICY` signals propose
`local-policy/high`; explicit `topic_meta.safetyLevel=high` proposes
`clinical/high`; otherwise the proposal is conservative and confirmation is
required. The command must never write `reviewed.json`.

Add a fixture test that snapshots the exact bytes of `reviewed.json` before
proposal generation and asserts that the bytes are unchanged afterward.

- [ ] **Step 3: Review every proposed class with faculty**

Present the worksheet grouped by risk kind/level. Faculty confirmation may approve a
group or change individual rows. Do not apply unconfirmed clinical, legal,
formulary, or local-policy classifications.

- [ ] **Step 4: Apply the confirmed mapping**

Add exactly the confirmed `risk` object to all records. For every pending record:

- set `by` to `Pending faculty review`;
- add a concise, non-clinical `reason` describing the review state;
- retain `at`, `note`, and future hash fields;
- do not change `status`.

- [ ] **Step 5: Prove decisions were preserved**

Compare the pre-migration and post-migration projections:

```python
before = {slug: (entry["status"], entry["at"]) for slug, entry in old.items()}
after = {slug: (entry["status"], entry["at"]) for slug, entry in new.items()}
assert before == after
```

Also assert `len(old) == len(new)` and that no slug was renamed.

- [ ] **Step 6: Run all source governance validators**

Run:

```bash
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
python3 13_Faculty_Resources/_automation/validate_tool_governance.py
python3 13_Faculty_Resources/_automation/test_surface_governance.py
python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py
python3 13_Faculty_Resources/_automation/test_validate_tool_governance.py
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add 13_Faculty_Resources/reviewed.json \
  13_Faculty_Resources/_automation/surface_governance.py \
  13_Faculty_Resources/_automation/test_surface_governance.py
git commit -m "data(governance): classify learner surfaces"
```

---

### Task 7: End-to-end verification and completion audit

**Files:**

- Modify: `tests/smoke/playwright.config.js`
- Modify: `tests/smoke/governance-warnings.spec.js`
- Modify: documentation only if actual commands or behavior differ from this plan

**Interfaces:**

- Proves every design acceptance criterion against source, built artifacts, and
  runtime behavior

- [ ] **Step 1: Register the browser suite for both sites**

Add `governance-warnings.spec.js` to `nav-ms3` and `nav-res`. Keep the existing
projects and visual-baseline policy unchanged.

- [ ] **Step 2: Run root contracts**

Run:

```bash
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/validate_topic_meta.py
python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
python3 13_Faculty_Resources/_automation/validate_tool_governance.py
node --test tests/*.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Build and gate both sites sequentially**

Run:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Expected: both PASS with no governance hard findings.

- [ ] **Step 4: Inspect built invariants**

Verify:

```bash
test -f _build/ms3/governance.json
test -f _build/res/governance.json
test ! -f _build/ms3/reviewed.json
test ! -f _build/res/reviewed.json
rg -l 'SURFACE-GOVERNANCE:START' _build/ms3/tools _build/res/tools
```

Programmatically prove every nav/search/artifact triplet matches and every pending
tool has exactly one injected block.

- [ ] **Step 5: Start persistent local servers**

Run `tests/smoke/start-local-servers.sh` in a session that remains alive. Confirm
ports 4200, 4201, and 4202 are ready before Playwright.

- [ ] **Step 6: Run targeted browser acceptance**

Run:

```bash
cd tests/smoke
npx playwright test governance-warnings.spec.js \
  --project=nav-ms3 --project=nav-res
```

Expected: PASS.

- [ ] **Step 7: Run the full smoke suite**

Run:

```bash
cd tests/smoke
npx playwright test
```

Expected: PASS. If the environment prevents loopback or Chromium launch, rerun with
the required permission and retain the exact provenance; do not report a product
failure from an environment-only restriction.

- [ ] **Step 8: Perform the requirement-by-requirement audit**

For every design acceptance criterion, record direct evidence:

- source schema/validator test;
- built MS3 artifact;
- built resident artifact;
- browser behavior;
- faculty-console preservation test;
- unchanged clinical-content diff;
- unchanged status/date projection.

Treat any missing evidence as incomplete work.

- [ ] **Step 9: Commit final test/config adjustments**

```bash
git add tests/smoke/playwright.config.js \
  tests/smoke/governance-warnings.spec.js
git commit -m "test(governance): verify warnings end to end"
```

- [ ] **Step 10: Final branch verification**

Run:

```bash
git status --short --branch
git diff --check origin/main...HEAD
git diff --name-only origin/main...HEAD
```

Expected: clean feature worktree and only approved design, plan, governance, build,
console, and test files.
