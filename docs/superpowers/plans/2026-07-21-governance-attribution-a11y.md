# Governance Triad Remainder + Tool Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the audit's governance triad (draft-item render filter, server-side attestation attribution) and the remaining `--primary` AA contrast failures on served tool pages.

**Architecture:** Three of the five requested items already shipped in PR #234 (push CI, retired filter, quiz aria-live, `--text-light`, SPA-shell `--primary`). This plan covers the remainder. The draft filter is a client-side change in the source renderer; attribution moves from a client-supplied body field to a server env var in the faculty-console Netlify function; the tool contrast fix goes into the build's polish pass (the sanctioned source→generated transform layer) so 20+ single-file tool sources stay untouched.

**Tech Stack:** vanilla JS (single-file HTML tools), Netlify Functions v2 ESM, Python build pipeline, node:test, Playwright smoke.

## Global Constraints
- No PHI; synthetic content only.
- localStorage keys stay `cw_*`/`rp_*`.
- `cp CLAUDE.md AGENTS.md` after any CLAUDE.md edit (none planned).
- Do not regress dark mode (`--primary-dark` is overridden to `#dd9277` in `clinical-warm.css` dark block — the rewrite must keep the token indirection, never a bare light-mode literal).
- Keep source/generated separation: served-page fixes belong in `build_deploy.py`'s polish pass, not hand-edits to `_build/`.
- Decision reversal (explicit user instruction 2026-07-21): drafts are now EXCLUDED from the learner practice bank, reversing the 2026-07-15 "serve drafts, marked" decision. Faculty preview (REVIEW_CONTEXT) must still render drafts.

---

### Task 1: Draft filter in the practice renderer

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/question-bank-practice.html` (~line 305–330)
- Test: `tests/smoke/qbank-retired.spec.js`

**Interfaces:**
- Consumes: `question_bank.json` (`items[].status` enum `draft|attested`, `items[].retired` boolean).
- Produces: `activeItems()` returns only attested, non-retired items (143 of 192 today). The faculty REVIEW_CONTEXT path (init → `showReviewItem`) keeps reading `data.items` directly and must continue serving drafts.

- [ ] **Step 1: Extend the smoke test to assert drafts are excluded**

In `tests/smoke/qbank-retired.spec.js`, replace the pool computation and assertions:

```js
const attested = items.filter((it) => !it.retired && it.status === 'attested');
const retired = items.filter((it) => it.retired);
const drafts = items.filter((it) => !it.retired && it.status !== 'attested');
// Guards: this test only proves something if the bank has both retired items and drafts.
expect(retired.length).toBeGreaterThan(0);
expect(drafts.length).toBeGreaterThan(0);
...
expect(shown).toBe(attested.length);          // count reflects the attested-only pool
expect(shown).not.toBe(items.length);          // proves retired were removed
expect(shown).not.toBe(items.length - retired.length); // proves drafts were removed too
```

Rename the test to `'practice bank serves only attested, non-retired items'`.

- [ ] **Step 2: Change `activeItems()` and the setup copy**

```js
/* Items eligible to serve to learners: faculty-attested, non-retired only.
   Drafts and retired near-duplicates never reach the learner pool. The faculty
   REVIEW_CONTEXT path below reads BANK.items directly so drafts stay previewable. */
function activeItems(){
  return (BANK && BANK.items ? BANK.items : []).filter(function(it){
    return !it.retired && it.status==='attested';
  });
}
```

Setup copy: replace the `.sub` sentence with
`'+total+' faculty-attested items across 12 categories. Select filters, then start. Draft items pending faculty review and retired near-duplicates are excluded.`

Keep `chip-draft` in `renderMeta` (used by faculty preview of drafts).

- [ ] **Step 3: Build both sites + QA gate; commit**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
git commit -m "fix(qbank): learner practice bank serves only attested items"
```

---

### Task 2: Server-side attestation attribution

**Files:**
- Modify: `faculty-console/netlify/functions/attest.mjs` (settings, buildState, handlePost)
- Modify: `faculty-console/app.mjs` (reviewer strip display-only; drop `attester` from POST bodies; take label from GET payload)
- Modify: `faculty-console/README.md` (runbook wording)
- Test: `tests/faculty-console-handler.test.mjs`, `tests/smoke/faculty-console.spec.js`

**Interfaces:**
- Consumes: env `ATTESTER_NAME` (optional; default `'Joshua Moss, MD'` = existing `DEFAULT_ATTESTER`).
- Produces: GET `/api/attest` payload gains `attester: string`; POST ignores any `body.attester`; commit messages and `by:` fields always carry the server label.

- [ ] **Step 1: Failing handler tests** — in `tests/faculty-console-handler.test.mjs`: add `ATTESTER_NAME: 'Synthetic Reviewer'` to the shared handler env (line ~398) and add a test asserting (a) GET payload includes `attester: 'Synthetic Reviewer'`; (b) a content attest whose body carries `attester: 'Spoofed Reviewer'` still records `by: 'Synthetic Reviewer'`; (c) with no `ATTESTER_NAME`, the label defaults to `'Joshua Moss, MD'`. Adjust any existing assertion that expects a body-supplied label (e.g. `'Different Synthetic Reviewer'`) to expect the env label.

- [ ] **Step 2: attest.mjs** — in `requireServerSettings`: `const attester = attesterLabel(readEnv(env, 'ATTESTER_NAME'));` and return it. `buildState(repository, settings)` includes `attester: settings.attester`. `handlePost({ repository, body, attester })` receives it from the handler switch (`settings.attester`); delete the `attesterLabel(body.attester)` line. `attesterLabel()` keeps its cleaning role but is now only fed the env value.

- [ ] **Step 3: app.mjs** — set `state.reviewerLabel = text(payload.attester) || DEFAULT_REVIEWER` where the GET payload is applied; replace the `reviewer-label` input with a read-only element showing the label; note copy → `'Attribution is set server-side (ATTESTER_NAME) and cannot be edited in the browser.'`; delete the three `attester: state.reviewerLabel` body fields.

- [ ] **Step 4: smoke spec** — mock GET payload gains `attester`; remove the three `getByLabel('Reviewer label').fill(...)` calls; privacy assertions keep checking the (server) label never leaks into preview URLs; add `expect(body.attester).toBe(undefined)` on a captured POST.

- [ ] **Step 5: README** — runbook steps 1 and 4: reviewer label is no longer self-entered; attribution comes from the site's `ATTESTER_NAME` env var (defaults to Joshua Moss, MD).

- [ ] **Step 6: Run + commit**

```bash
node --test tests/faculty-console-handler.test.mjs
git commit -m "feat(faculty-console): server-side attestation attribution (ATTESTER_NAME)"
```

---

### Task 3: Tool-page `--primary` contrast via the polish pass

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/build_deploy.py` (polish pass, tools loop)
- Modify: `13_Faculty_Resources/_automation/site_build/check-static-site.mjs` (QA gate check with teeth)

**Interfaces:**
- Produces: built `tools/*.html` contain no bare `color:var(--primary)`; every former usage becomes `color:var(--primary-dark,#a84830)` (light ≥4.5:1; dark inherits `#dd9277`).

- [ ] **Step 1: Polish-pass rewrite** — inside the existing `for _f in _glob.glob(OUT+"/tools/*.html")` loop:

```python
# WP-03 remainder: bare accent text (#c25a3c, ~3.9:1 light) fails AA normal text.
# Repoint to --primary-dark; the literal fallback covers tools whose light :root
# lacks the token, and the dark theme's own --primary-dark override still wins.
_t=_re.sub(r'color:\s*var\(--primary\)', 'color:var(--primary-dark,#a84830)', _t)
```

- [ ] **Step 2: QA-gate teeth** — add a check to `check-static-site.mjs` (follow its existing hard-fail pattern) that scans built `tools/*.html` and fails on `color:var(--primary)` not followed by `-`.

- [ ] **Step 3: Build both sites, verify zero bare occurrences in `_build/*/tools`, spot-check one tool renders, commit**

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
grep -c 'color:var(--primary)[^-]' _build/ms3/tools/*.html   # expect no matches
git commit -m "a11y(build): repoint bare --primary accent text to --primary-dark in built tools"
```

---

### Task 4: Verification + PR

- [ ] Run full local suite: registry/topic_meta/attestation validators, `node --test tests/*.test.mjs`, `node tests/contrast-check.mjs`, both site builds.
- [ ] Push branch, open PR to `main` noting: (a) items already shipped in #234, (b) the drafts-served decision reversal, (c) `ATTESTER_NAME` Netlify env var is optional (defaults correctly), (d) Playwright runs in CI only (hangs locally per prior sessions).
