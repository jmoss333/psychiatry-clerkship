# Supervised Resource Builder — Clerkship Launch-Link Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one fixed, context-free launch link from the Clerkship Patient care resources / Quick Share surface to the separately released ReConnect Supervised Resource Builder.

**Architecture:** Extend the governed Clerkship curriculum registry with one `careBuilder` record and render it as a distinct external callout inside Quick Share. It is a launcher, not another selectable handout resource: the existing five-resource shelf, three-item local handout, crisis block, and transient selection rules stay unchanged. The URL is the exact verified ReConnect production route and never receives query, fragment, patient, topic, location, path-week, or analytics context.

**Tech Stack:** Existing Front Door ES5 renderers, `curriculum.json` plus JSON Schema, Clinical Warm Front Door CSS, Node `node:test`, Playwright smoke tests, both static-site builds, and `bash bin/verify.sh`.

**Spec:** `docs/superpowers/specs/2026-09-27-supervised-resource-builder-design.md`

## Global Constraints

- Do not start this plan until the ReConnect completion receipt names an exact merged commit, ready production deploy, canonical HTTPS URL, and served-content verification for the stable builder route.
- Start from current `origin/main` in a fresh Clerkship worktree. Run `python3 bin/coordination_report.py --prs` and stop on overlapping edits to `curriculum.json`, its schema, `fd_care_pack.js`, `frontdoor.css`, the class inventory, or Care tests.
- Keep the launch URL fixed and exact. It must contain no query string or fragment and no code may append topic, location, patient, week, audience, referrer, or selection state.
- Preserve the current five Care resources, navigator mappings, Quick Share three-item limit, print content, crisis inclusion, no-PHI copy, and in-memory-only behavior.
- The builder launcher cannot be added to the local Quick Share handout or QR drawer. ReConnect owns its data, matcher, reason badges, print output, and crisis behavior.
- Add no proxy, embed, copied resource dataset, health-status claim, or Clerkship-side clinical mapping.
- Use a new CSS class only where the existing Care/Quick Share classes do not express the callout; update `CLASS-INVENTORY.md` in the same commit as CSS.
- Passing local gates does not establish ReConnect availability, Clerkship faculty approval, CI, merge, release-train promotion, Netlify deployment, or served revision.

## Review Focus

1. The launch link is the exact verified ReConnect URL and remains byte-identical after navigation; no `?`, `#`, patient context, or Front Door state is forwarded (Tasks 1 and 2).
2. The callout is clearly distinct from the five fixed resources and cannot enter the three-item local handout, QR dialog, copied selected links, or print output (Tasks 1 and 2).
3. Keyboard, screen-reader, 320-pixel, and 200%-zoom users can find and activate the link without disrupting Quick Share focus/state (Task 2).
4. Both MS3 and resident builds contain the same launcher, while existing Care contracts and exact canonical links remain unchanged (Task 3).

---

### Task 1: Govern the fixed launcher without expanding the local handout corpus

**Files:**
- Modify: `curriculum.json`
- Modify: `curriculum.schema.json`
- Modify: `tests/fd-care.test.mjs`

**Interface:**
- Add one required top-level object:

```json
"careBuilder": {
  "id": "supervised-resource-builder",
  "title": "Build a printable resource page",
  "description": "Choose a topic, broad area, and resource types, then review transparent ReConnect suggestions with a supervisor.",
  "url": "https://reconnect-tools.netlify.app/tools/supervised-resource-builder.html"
}
```

The URL above is used only if Task 6 of the ReConnect plan verifies that exact canonical route. If the verified route differs, use the receipt's exact fixed URL and update the fixture below to the same value.

- [ ] **Step 1: Write failing schema/data tests.** Assert `careBuilder` is required; has exactly `id`, `title`, `description`, and `url`; fixes `id` with `const`; rejects additional properties; and requires an HTTPS URL without `?` or `#`. Assert the real curriculum record equals the approved copy and exact served URL.
- [ ] **Step 2: Pin separation from handout data.** Assert `curriculum.careResources` still contains exactly the five existing IDs in the existing order, `careNavigator` still resolves only those IDs, and `careBuilder.id` is absent from both collections.
- [ ] **Step 3: Verify red.** Run `node --test tests/fd-care.test.mjs`; expect failures for missing `careBuilder`.
- [ ] **Step 4: Add the schema and curriculum record.** Use `additionalProperties:false`, explicit string minimums, and an HTTPS pattern that excludes whitespace, query, and fragment. Do not add `searchTerms`, matching fields, patient fields, or handout flags.
- [ ] **Step 5: Verify and commit.** Run `python3 13_Faculty_Resources/_automation/validate_registry_schemas.py`, `node --test tests/fd-care.test.mjs`, and `git diff --check`; expect PASS. Commit as `feat: register supervised resource builder launch`.

---

### Task 2: Render the link inside Quick Share without forwarding state

**Files:**
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/fd_care_pack.js`
- Modify: `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- Modify: `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md`
- Modify: `tests/fd-care.test.mjs`
- Modify: `tests/smoke/front-door.spec.js`

**Interfaces:**
- Add pure ES5 helper `fdCareBuilder(index): string` that validates the registry record, requires a fixed `https://` URL with no query/fragment, escapes every field, and returns a callout link with `target="_blank" rel="noopener noreferrer"`.
- `fdCarePack(index,ids,crisisHtml)` places this callout after its introductory header and before the local five-resource picker.
- Use `data-fd-care-builder="supervised-resource-builder"` only as a test/interaction hook. Do not add it to `data-fd-care-pack`, `data-fd-care-share`, or copy/print functions.

- [ ] **Step 1: Write failing renderer tests.** Assert valid copy and exact URL; invalid IDs, missing fields, non-HTTPS URLs, query strings, fragments, and hostile markup produce no launcher. Assert the renderer remains ES5 and has no storage, network, analytics, `document`, or `window` access.

```js
const html = F.fdCareBuilder({careBuilder: curriculum.careBuilder});
assert.match(html, /data-fd-care-builder="supervised-resource-builder"/);
assert.match(html, /target="_blank" rel="noopener noreferrer"/);
assert.doesNotMatch(curriculum.careBuilder.url, /[?#]/);
```

- [ ] **Step 2: Pin handout isolation.** With the builder visible, assert `fdCarePackResources(index)` still returns five items; pack selection still caps at three; copied/printed output contains no builder title or URL; and no builder QR/Add-to-handout control renders.
- [ ] **Step 3: Add failing browser coverage.** On MS3 and resident fixture builds, open Care, locate the launcher by accessible name, verify it is before the picker, and inspect its exact `href`, target, and rel. Seed Care navigator and handout state, activate the link in a captured popup, and assert the destination has no query/fragment while Clerkship state remains unchanged.
- [ ] **Step 4: Add narrow/zoom/accessibility assertions.** At 320 CSS pixels and 200% zoom assert no page overflow, the link's target is at least 44 pixels high, focus is visible, the explanatory copy is exposed to assistive technology, and launcher presence does not change Quick Share tab order or print layout.
- [ ] **Step 5: Verify red.** Run `node --test tests/fd-care.test.mjs` and the focused Playwright grep for `Supervised Resource Builder|Care Quick Share`; expect missing-launcher failures.
- [ ] **Step 6: Implement the pure helper and callout.** Reuse `fdCarePackSafeId` and `fdEsc`; validate with `new URL` only if the existing ES5/browser support contract permits it, otherwise use the same fixed-HTTPS validation style as `fdCarePackResources` plus explicit `?`/`#` rejection. Render no user or Front Door state into `href`.
- [ ] **Step 7: Add minimal CSS and update the class inventory.** Define the callout container/link, 44-pixel target, wrap behavior, focus-visible state, narrow layout, and print exclusion. Record every new class, nesting constraint, state, and print rule in `CLASS-INVENTORY.md`.
- [ ] **Step 8: Verify and commit.** Run `node --test tests/fd-care.test.mjs`, focused Playwright, and `git diff --check`; expect PASS. Commit as `feat: launch supervised builder from quick share`.

---

### Task 3: Revalidate both audiences and preserve release boundaries

**Files:**
- Modify only if a test exposes a real defect: the Task 1–2 source/test files.

- [ ] **Step 1: Refresh collision evidence.** Re-run `python3 bin/coordination_report.py --prs`. If an active attestation or Care PR now overlaps, coordinate merge order rather than overwriting it.
- [ ] **Step 2: Run focused contracts.** Run:

```bash
python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
python3 13_Faculty_Resources/_automation/test_validate_registry_schemas.py
node --test tests/fd-care.test.mjs tests/fd-wire.test.mjs tests/fd-shell.test.mjs tests/spa-shell-a11y.test.mjs
cd tests/smoke && npx playwright test front-door.spec.js --grep "Patient care resources|Care Quick Share|Supervised Resource Builder"
```

- [ ] **Step 3: Build both sites.** From repository root run `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` and `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res`; expect both static QA gates to pass and both built Care surfaces to contain the exact link.
- [ ] **Step 4: Run the complete gate.** Run `bash bin/verify.sh`; expect every step PASS, including span and question-bank ratchets. Diagnose any failure against clean current `main` before attributing it to this link.
- [ ] **Step 5: Open a PR against `main`.** Report the verified ReConnect commit/deploy/URL receipt, the unchanged five-resource and three-item boundaries, exact fixed-link tests, both audience builds, browser coverage, and full `verify.sh`. Do not claim the Clerkship merge deploys learner sites immediately; they publish through the `release` train.
- [ ] **Step 6: Keep later evidence separate.** After human merge, distinguish merge SHA, release-train promotion, each Netlify production deploy, and served content. Do not merge, manually push `release`, or trigger publish-now without explicit authority.

## Completion Evidence

The Clerkship integration is complete only when the exact stable ReConnect destination was verified before coding, the launcher remains separate from all local handout state, both audience builds and the full gate pass at the PR revision, and a human has approved the PR. Merge, release-train promotion, deployment, and served-state checks remain distinct subsequent evidence.
