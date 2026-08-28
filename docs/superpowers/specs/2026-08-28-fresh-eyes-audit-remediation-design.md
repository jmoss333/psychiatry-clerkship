# Fresh Eyes Audit — remediation design

**Date:** 2026-08-28
**Source:** "Fresh Eyes Audit" decision packet (2026-08-27), read-only walk of both production sites.
**Status:** approved in session — A1 approach and the A3 `kind` token were chosen by Josh before any code was written.

---

## 0. What changed between the audit and this design

The audit was written against production on 2026-08-27. `main` moved that same evening, and two
findings are already partly resolved. Re-verified at `ef3057f`:

| Audit finding | State at `ef3057f` |
|---|---|
| A3 — retired instruments dressed as tools | **Half-landed.** `#411`/`#413` retitled C-SSRS and BFCRS to "— Official Form & Training" in all four registries. Residual: `k:"tool"` in `build_deploy.py:327` and `resident_section.py:208`. |
| A2 — 22×22px touch targets | **Half-false.** `frontdoor.css:255` already grows the target to 44px under `@media (pointer:coarse)`. The ward mis-tap does not reproduce on touch. Residual: fine-pointer size, and the nine identical accessible names. |
| B2 — CIWA-Ar exposure | `#412` added the `instrument_rights.json` INV-IR1 publication contract; `#414` removed the dead withdrawal spotlight. The rights question itself is untouched and remains Josh's. |

Everything else reproduced at `ef3057f` exactly as reported.

---

## 1. A1 — the search safety contract

### 1.1 The audit's recommendation is unsafe

The packet states: *"Every plain-language crisis query the comment defends carries content words —
filtering stopwords from the protocol pass only when content words exist changes nothing for them."*

This is false. Measured against the real `curriculum.json` / `topic_meta.json`:

| Query | Protocols today | Under the audit's fix |
|---|---|---|
| `i want to kill myself` | pg_suicide, exp_consult | **none** |
| `she said she wants to die` | pg_suicide, exp_consult | **none** |
| `patient wants to leave` | pg_suicide, exp_consult, delirium | delirium only |
| `therapy on the unit` | all 5 (the leak) | none ✓ |
| `on the` | all 5 | all 5 |

### 1.2 Mechanism

`pg_suicide.md`'s haystack is `title + ref + tldr`:

> `pg_suicide.md ask directly and specifically — thoughts, plan, intent, preparation, means — then
> separate chronic from acute risk and turn the answers into a formulation, not a checkbox.`

It contains none of `kill`, `myself`, `die`, `want`, `suicidal`, `harm`. The synonyms map has 19
keys and no crisis terms. The **only** token in `i want to kill myself` that matches is the
two-letter stopword `to`, substring-matched inside `thoughts` and `into`.

So the stopword leak (A1's complaint) and the crisis-routing path (the code comment's defence) are
**the same mechanism**. Removing one removes the other. `tests/fd-search.test.mjs:310-329` already
pins the crisis reachability, so the suite would have caught the audit's fix — the tests are
correct and the recommendation was not.

The deeper problem: the safety contract is load-bearing on an accident. Rewording `pg_suicide.md`'s
`tldr` to drop every word containing `to` would silently delete the safety kit from every
plain-language suicide query, and no test would fail for the right reason.

### 1.3 Design

Give the protocol pass **explicit crisis vocabulary**, then filter stopwords.

**Data.** Each `safetyKit` entry in `curriculum.json` gains a `triggers` array of lowercase
natural-language phrases:

```json
{ "ref": "pg_suicide.md", "sub": "Screen · stratify · safety plan",
  "triggers": ["suicidal", "kill myself", "wants to die", "self harm", ...] }
```

Colocating triggers with the protocol they route to means the existing `safetyKit` validator owns
them, and there is no second registry to drift.

**Matching.** Triggers match as whole-word / whole-phrase substrings of the **raw** query, padded
with spaces on both sides:

- `" i want to kill myself "` contains `" kill myself "` → match.
- `" diet and nutrition "` does **not** contain `" die "` → no false positive.

Matching the raw query (stopwords intact) rather than the filtered word list means triggers are
authored the way a learner types them — `"wants to die"`, not `"wants die"`.

**Protocol pass.** A kit item is returned when *either*:
1. one of its triggers matches the padded raw query, **or**
2. `fdSearchHits(haystack, rawQuery, contentWords)` — the same call as today, but with the
   **filtered** word list.

(2) with `contentWords` kills the leak: `therapy on the unit` filters to `["therapy","unit"]`,
neither of which appears in any of the five haystacks. (1) restores and makes explicit every crisis
route that used to depend on `to`.

**Degenerate queries are unchanged.** `fdSearchContentWords` never returns empty, so an
all-stopword query (`on the`) keeps its words and still surfaces the kit. That is fail-safe and is
today's behaviour; it is preserved deliberately and pinned by a test, which answers the sign-off
question the audit asked.

### 1.4 Trigger authorship

The starter vocabulary is clinical wording and is **flagged for faculty review**, not asserted as
attested content. It is written to be over-inclusive: a false positive shows a learner a safety
sheet they did not need, a false negative hides one they did. Only the fail-safe direction is
acceptable.

`patient wants to leave` must keep reaching `pg_suicide.md` — `tests/fd-search.test.mjs:326` pins
it, and the clinical reading (a patient demanding to leave is a disposition-safety moment) supports
it. That pinned behaviour is preserved rather than re-litigated here.

### 1.5 Contract changes

One existing test changes premise. `tests/fd-search.test.mjs:256` currently accepts protocols
ranking above an exact title match for `therapy on the unit`, describing it as the safety contract.
After this change that query returns no protocols and `Therapy on the Unit` is result #1 overall.
The test and its comment are updated to pin the new contract — this is the point of A1.

### 1.6 Files

- `curriculum.json` — `triggers` per `safetyKit` entry
- `curriculum.schema.json` — `triggers` in the `safetyKit` item schema (`additionalProperties:false`)
- `13_Faculty_Resources/_automation/validate_curriculum.py` — require non-empty lowercase triggers
- `frontdoor/fd_data.js` — carry `triggers` onto the kit record
- `frontdoor/fd_search.js` — trigger pass + `contentWords` in the protocol pass
- `tests/fd-search.test.mjs` — new pins; update the `therapy on the unit` contract

---

## 2. A2 + A6 — shell accessibility

No clinical claim changes.

- **Per-item accessible names.** `fdRow` in `fd_today.js:98` emits `title="Mark done"` nine times.
  Becomes `Mark done: <item title>` / `Mark undone: <item title>` tracking `aria-pressed`.
  `fd_path.js`'s detail card renders through the same function and inherits the fix.
- **Fine-pointer target.** `.fd-check` is 22px; the 44px overlay is `pointer:coarse` only. Add an
  equivalent overlay for fine pointers to clear WCAG 2.2 SC 2.5.8 (24px) with zero visual change.
- **Search results `aria-live`.** Results update silently; add a polite count announcement.
- **Suggested-week highlight.** Colour-only; add an sr-only "(current week)".
- **Greeting.** `fd_today.js:230` builds `Evening, Core rotation —`: role-as-name plus a dangling
  em dash a screen reader announces. Fix the punctuation.

## 3. A4 — one not-found surface

An unknown `?page=` bounces to Today while the address bar keeps the dead slug; an unknown `?tool=`
renders the raw filename as a title, frames a 404, and shows `Review status unavailable—verify with
faculty` (`spa_index.html:743`). One graceful not-found surface for both ref kinds, **keeping** the
fail-safe governance copy — the fail-safe direction is right, only the presentation is broken.

## 4. A3 — `kind: "rights"`

C-SSRS and BFCRS are reference pages about instruments the library does not reproduce, but still
carry `k:"tool"`. Add a third `kind` token, `rights`, alongside `md` and `tool`, so the shell stops
classing them as Interactive Tools and stops listing them in Quick Tools. Token chosen by Josh: it
names *why* the page is a stub rather than merely what it is not.

Touches the six count-pin surfaces recorded in memory (`validate_tool_governance.py` SITE_EXTRAS +
EXPECTED_TOOL_COUNTS, four assertions in `test_validate_tool_governance.py` plus its
`patch.object` fixture, `tools/pdf_library_export`, and `ci-build-contract.test.mjs`
`assertInventory`). Landed last, on its own, for that reason.

---

## 5. Out of scope — reported, not implemented

| Item | Why not |
|---|---|
| B1 — Interview Room reviewed/pending contradiction | Blocked solely on `sp-proxy/REDTEAM_CHECKLIST.md`, which only Josh can run. |
| B2 — CIWA-Ar rights | Decision, not agent action. Highest-exposure unresolved instrument; no code until recorded in the audit's decision table. |
| B3 — stale reviewed chips | Clinical writing is Josh's; re-attestation plumbing already exists. |
| B4 — audience seams on res | Curricular calls (student packet for residents, COMAT on res, Week-3 composition). |
| B5 — Sanford-local content | Standing policy: no agent may invent unit specifics. |
| B6 — "Pending review · High risk" wording | Governance vocabulary. |
| C1 — `EDITION_RUNTIME` permalink | One dashboard visit; the origin-shape framing is rejected absent evidence. |
| A5 — synonym gaps | DEFER per the audit: one measured tuning pass, not one-off patches. |
| A7 | Rejected false positives — documented so they stay dead. |

## 6. Verification protocol

Per the audit's own terms — no deploy, no merge:

- isolated worktree; never hand-edit `_build/`
- `build_and_check.sh ms3` **and** `res` green
- full `node --test tests/*.test.mjs`
- `python3 -m unittest discover -s tests/maintenance` if any workflow/pin surface moves
- per-page diff of `_build/res` before/after, proving MS3 fixes do not shift resident output
