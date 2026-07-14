# Alex Tour Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the approved Alex Tour design into one verified production landing page and a safe,
current set of linked demonstrations.

**Architecture:** Execute three bounded plans in dependency order. First make the optional supporting
sites accurate, then harden the standardized-patient credential boundary, then build and release the
static tour. Repo edits remain isolated by worktree; Netlify changes use immutable site IDs; every
external mutation follows a draft/preview and verification gate.

**Tech Stack:** Git worktrees, Node.js built-in tests, static HTML/CSS/JavaScript, React 18 UMD for the
existing simulation, Netlify CLI 26, GitHub CLI, ImageGen, in-app Browser.

## Global Constraints

- Approved design:
  `docs/superpowers/specs/2026-07-13-alex-tour-design.md`.
- Never persist or expose a standardized-patient passcode, faculty key, PHI, or patient-entered data.
- Preserve the dirty TherapyMatch checkout and all unrelated user changes.
- Do not weaken a build, simulation, leak, CSP, accessibility, or link-health gate.
- Use exact current URLs only after live verification.
- The production faculty console is not modified and its key is not shared.
- The tour's governance interaction is synthetic, local-only, and read-only.
- The final page remains safe if forwarded; `noindex` is not authentication.

---

## Plan 1: Supporting Sites

Detailed plan:
[2026-07-13-alex-tour-supporting-sites.md](2026-07-13-alex-tour-supporting-sites.md)

- [ ] Reconcile TherapyMatch against the 306-record public dataset in a fresh worktree.
- [ ] Rename the Mental Health Education Library by immutable Netlify site ID.
- [ ] Make the Family Therapy Companion evergreen in canonical source, copy it byte-for-byte, and
  deploy only after draft verification.
- [ ] Record the final education-library URL for the landing-page test and anchor.

Exit gate: all three public destinations return HTTP 200, the family production hash matches the
canonical source, and the original TherapyMatch checkout is untouched.

---

## Plan 2: Standardized-Patient Credential Safety

Detailed plan:
[2026-07-13-alex-tour-sp-safety.md](2026-07-13-alex-tour-sp-safety.md)

- [ ] Add the failing passcode-storage contract test.
- [ ] Keep the endpoint in `localStorage` and move only the passcode to `sessionStorage`.
- [ ] Delete the legacy persistent passcode without migrating it.
- [ ] Add **Clear passcode** and clear any active in-memory provider credential.
- [ ] Pass simulation, parity, leak, storage, MS3-build, and resident-build gates.
- [ ] Keep the canonical production and intentionally different preview defaults intact.

Exit gate: no read or write of `cw_sp_passcode` through `localStorage`, a visible clear path exists,
and Joshua retains sole control of the real credential test.

---

## Plan 3: Landing Page and Release

Detailed plan:
[2026-07-13-alex-tour-page-and-release.md](2026-07-13-alex-tour-page-and-release.md)

- [ ] Generate a complete visual concept and pause for Joshua's approval.
- [ ] Write the static privacy/link/CSP test before source implementation.
- [ ] Build the semantic three-stop tour, synthetic governance preview, related prototypes, and exact
  three questions.
- [ ] Add the accepted visual system and progressive enhancements without network or storage APIs.
- [ ] Compute exact CSP hashes and pass local desktop/mobile/accessibility/no-JavaScript checks.
- [ ] Create a new Netlify project, publish a draft, and verify headers and all destinations.
- [ ] Integrate through the normal GitHub review path, verify the live standardized-patient safety
  change, then publish production.

Exit gate: the production tour returns HTTP 200 with all security headers; all eight external links,
three route headings, three questions, and the synthetic governance demo pass source and browser
checks; no credential, PHI, analytics, form, storage, or network-write path exists.

---

## Commit Boundaries

Keep these changes reviewable as separate commits:

1. `docs: plan Alex workforce education tour`
2. `fix(docs): reconcile TherapyMatch provider count` in the TherapyMatch repository
3. `fix: make family therapy companion evergreen`
4. `fix(sp-interview): scope passcode to browser tab`
5. `feat: add faculty-governed Alex tour`
6. `docs: record Alex tour deployment`

Do not squash locally before review. Preserve exact test evidence per commit and report unrelated
baseline warnings separately.

---

## Definition of Done

- [ ] Supporting-site labels and URLs are current and visually verified.
- [ ] TherapyMatch's current README, public dataset, and visible landing count all use the same
  306-record denominator without an availability claim.
- [ ] The Mental Health Education Library no longer uses a staging-named share URL.
- [ ] The Family Therapy Companion is evergreen with June 2026 provenance.
- [ ] The SP passcode is tab-scoped, clearable, absent from local persistent storage, and sent
  separately.
- [ ] The faculty preview is synthetic/read-only and the production console remains credential-gated.
- [ ] The tour passes static, browser, build, CSP, header, accessibility, print, responsive, and link
  checks.
- [ ] Joshua approves the visual concept and the verified draft before production publication.
- [ ] The final handoff includes the tour URL, SP setup sequence, three collaboration questions, and
  the post-demonstration passcode-rotation reminder.
