# Checklist: the silent shrink

**Owner:** Joshua Moss, MD · **Run it:** on any new or edited guard, gate, validator, audit tool
or contract test — and on any review of one
**Enforced by:** nothing. This is judgment. `bin/check_vacuity.py` mechanises exactly one line of it (D2).
**Last updated:** 2026-09-06

---

## Purpose

Every defect below shipped in this repository. Not one was caught by a schema, a type, or a
failing test, because in every case **the code was individually correct and the answer was
quietly wrong**. They share one shape:

> A check reports success over a set smaller than the one it claims to check.

Nothing goes red. The output looks exactly like the output of a working check — often with a
reassuring number in it. `OK — 58 required safety surface(s)` reads the same as
`OK — 60`, and only one of them is true.

This is the defect class `bin/` exists for, and it is the class that keeps getting *into* `bin/`:
two of the entries below are bugs found in the anti-vacuity tooling itself, by review, after it
shipped its own self-test. Assume you are not immune. Work the list.

**How to use it.** Read the question, then answer it *by breaking your own code* — not by
reasoning about it. Section F is the recipe. A question you answered by inspection is not
answered.

---

## A — Does it see everything it claims to see?

- [ ] **A1. Enumerate the producers. Is your list of them derived, or remembered?**
      Anything that answers "the set of X" must derive that set, not restate it.

      *Earned by:* the faculty console built its review queue from `site_manifest.json`
      alone while pages shipped from five producers. All 22 Case-of-the-Week pages sat
      `pending` with no surface able to show them, **from 2026-07-09 to 2026-09-04 — two
      months, nothing red anywhere**, because the console displayed *something*.
      `ADR-002-shipped-pages-single-source.md` · #517
      *Tell:* a faculty-facing surface shows a partial list and it looks plausible.
      *Fix pattern:* one derived listing, verified against the real output on every build
      (`load_shipped_pages()`), and a ratchet freezing the remaining direct readers.

- [ ] **A2. Does your inventory cover every SHAPE of the thing, or only the obvious one?**
      *Earned by:* `check_vacuity.py` inventoried falsifications as files (`test_*.py`,
      `*.test.mjs`) while its own docstring called a tool's `--self-test` "the paired
      falsification". Four tools shipped an unwired `--self-test` and the run printed `OK`.
      #548
      *Tell:* your predicate is a filename pattern, and the thing it names also exists in
      another form.

- [ ] **A3. Is every exemption still true?**
      An exemption list rots into a lie without anyone editing it.
      *Earned by:* `NOT_REVIEWABLE_IN_CONSOLE` excluded `rp-agitation.html` and
      `rp-brief-psych.html` on the recorded grounds that they "ship on no learner site" —
      while `resident_section.py` copied both into `_build/res/tools/` on **every** resident
      deploy. Two pending items that ship were marked unreviewable. ADR-002
      *Rule:* an exemption list **may only shrink**, each entry carries a reason a reader can
      check, and a red check is never a reason to add one.

---

## B — Can it fail at all?

- [ ] **B1. Write the input that should make it fail. Does it?**
      If you cannot construct one, the check is decorative.

- [ ] **B2. Is the assertion reachable, or empty by construction?**
      *Earned by:* a coverage assertion that partitioned the uncovered set into known
      buckets and asserted the remainder was empty. The remainder was empty **by
      construction** — a page could not be both uncovered and renderable-from-source — so
      the assertion could never fail. It passed cleanly for a whole PR. #539
      *Tell:* the assertion's subject is derived from the same expression as its expectation.
      *Fix pattern:* pin the gap's *dimensions* (`{cotw_registry: 22, site_manifest: 1}`), so
      each number moves for a real reason.

- [ ] **B3. Are both sides of the comparison non-empty?**
      A check that passes because both sides are empty proves nothing.
      *Earned by:* a WP-B assertion on #480. Guarded today by
      `tests/panel-snapshots.test.mjs`'s "not an empty render agreeing with an empty file".

- [ ] **B4. Does a threshold pin the CONTRACT, or freeze today's debt?**
      *Earned by:* `assert.ok(quizless >= 25)` — a corpus count that silently locked in the
      number of quiz-less pages, so fixing content would have turned the test red. #534
      *Fix pattern:* assert `>= 1` for "this path was exercised", and add a synthetic fixture
      so the contract holds even when no real row exercises it.

---

## C — Does malformed input make it pass?

- [ ] **C1. Feed it a missing, empty, and wrong-typed field. Does it raise, or shrug?**
      *Earned by:* `sites_by_slug()` parsed `shipped_pages.json` by hand as
      `list(page.get("sites") or [])`. A malformed `sites` became `[]`, and `site in []` is
      False for **both** audiences, so a required crisis-contact surface left the required
      list with no trace: the run printed `OK — 58 required safety surface(s)` instead of
      60, **exit 0**. #545
      *Fix pattern:* read through the loader that validates and raises
      (`load_shipped_pages()`), never a permissive second parser.

- [ ] **C2. Can a swallowed failure be counted as a success?**
      `|| true`, a bare `except:`, a default return, an ignored exit code.
      *Earned by:* the resolver split gate commands on `||` and threw the operator away, so
      `python3 test_guard.py || true` read as "this test is on a gate" when its verdict can
      never fail anything. The repo really uses the form —
      `build_and_check.sh:84` wraps an entire sub-script in `|| true`. #548

- [ ] **C3. What happens when your PARSER fails? Does the input vanish?**
      *Earned by:* found while falsifying C2. A `||` inside `bash -c "…"` made the split cut
      through a quote, `shlex` raised `ValueError`, and the whole command was **dropped** —
      taking whatever it covered with it. The `except: continue` was one line and looked
      defensive. #548
      *Rule:* a parse failure is a finding about the checker, not a reason to skip an input.

- [ ] **C4. When it cannot determine what to check, does it say so LOUDLY?**
      *Fix pattern:* a distinct exit code (`2`) meaning "could not determine what to check",
      separate from "checked and clean". A checker that cannot find its inputs must never
      pass vacuously over an empty set.

---

## D — Is what it reads current, and does it actually run?

- [ ] **D1. Is every input the assertions depend on DECLARED?**
      *Earned by:* `check_crisis_surfaces.py` scoped its required surfaces per audience from
      `shipped_pages.json` but did not declare it as a freshness input. Regenerating that
      file after a build changed **what the checker looked for** while the tree it read was
      unchanged, and the guard still called the build current. #545
      *Note:* a declared path that does not exist must **raise** — a typo would otherwise make
      the freshness check vacuously "fresh" and retire the contract in silence.

- [ ] **D2. Does any gate actually RUN it?** ← the one line that is mechanised
      A falsification that never executes is worth nothing, and it rots without saying so.
      *Earned by:* `test_validate_curriculum.py` — 51 tests, **seven of them red for months**,
      because `safetyKit` `triggers` became mandatory on 2026-08-28 and its fixture never
      grew the field. No gate ran the file, so nobody could know. #548
      *Run:* `python3 bin/check_vacuity.py`

- [ ] **D3. Does it run where it MATTERS?**
      "On a gate" is not "in CI", and a check can be genuinely wired and still be absent from
      the place you were counting on.
      *The worked case:* a **build-output** assertion in `tests/*.test.mjs` is a supported
      placement — guard it with `staleBuildReason()` from `tests/_build_freshness.mjs`, as
      `build-freshness`, `post-event-huddle` and `rotation-edition-build-governance` do, and it
      fails honestly against a current local build. What it does **not** do is protect CI:
      `node --test` runs before **both** `build_and_check.sh` invocations and `_build/` starts
      absent there, so it skips every time. That is a local-only contract by design, not a
      misplacement — the error is relying on CI to catch what it pins.
      *Ask:* which of `verify.sh`, `ci.yml`, the Netlify build actually executes this, and is
      that the one that protects the artifact a learner opens? Then say so out loud, because
      an unstated "local only" reads to the next person as "covered".

---

## E — Is the finding the thing you actually verified?

- [ ] **E1. Did you check the source, or the summary of the source?**
      *Earned by:* a 2026-08-21 pass over `evidence_annotations.json` found **54% of
      annotations needed amendment and 7 said close to the opposite of the paper** — all
      written from titles and conclusions rather than results sections. Each row was
      individually well-formed. The corpus was jointly wrong.
      *Rule:* read the results. A positively-voiced claim licensed by a null span is a
      claim to rewrite, never a span to trim.

- [ ] **E2. Does the number in your PR body come from a command you can re-run?**
      "0 of 74 panels changed" was the strongest verification in three work packages and was
      backed by a script that no longer existed. It is `node bin/render_panels.mjs` now.

---

## F — The falsification recipe

Answer B1 for real. This is the whole method, and it takes about five minutes:

1. **Run the check. It must PASS.** A mutation result means nothing against a red baseline.
2. **Break exactly one thing** — the input, not the assertion. Empty a required list, blank a
   field, delete an entry, unwire a step, add `|| true`.
3. **Run it again. It must FAIL, and the message must name what you broke.** "Something is
   wrong" is half a gate.
4. **Restore. It must PASS again.** Confirms you measured your change and not the weather.
5. **Now revert the FIX and repeat step 2.** If it still fails, your fix was not what made
   the difference. This step is the one people skip, and it is the one that proves causation:
   reverting `check_vacuity.py`'s inventory fix made the same unwiring print
   `OK — 174 falsification(s) are executed by a gate` — the bug, on demand.

**When you cannot falsify a check, say so in the PR body.** An unfalsifiable green is not
evidence, and calling it evidence is how the two-month invisibility happened.

---

## G — Choosing which way to be wrong

Every checker is wrong sometimes. You choose the direction when you write it, and the choice
is not symmetric:

| Direction | Consequence | Verdict |
|---|---|---|
| Reports something that is fine | Noisy, annoying, **visible** — someone fixes it | Acceptable |
| Silently covers more than it checked | Invisible, indefinite, looks like success | **Never** |

So: an unresolvable input is reported, not assumed benign. A glob that cannot expand yields
nothing (making files look uncovered — loud and wrong) rather than assuming they are covered.
Indirection deeper than the resolver handles gives up loudly rather than returning "nothing to
see". Each of those is a live decision in `bin/check_vacuity.py`, documented where it is made.

**A checker that cries wolf gets abandoned, and an abandoned checker is worse than none** — so
pay for the loud direction with precision, not with silence. The first cut of
`check_vacuity.py` reported 40 findings, 38 of them wrong; resolving commands properly instead
of grepping for names took it to 2, both real. That work is the price of being allowed to be
loud.

---

## Related

- `13_Faculty_Resources/_automation/site_build/ADR-002-shipped-pages-single-source.md` — the
  decision that replaced a vigilance control with a structural one
- `bin/check_vacuity.py` — mechanises D2
- `bin/check_crisis_surfaces.py` — worked example of C1, C4 and D1 after two review rounds
- `docs/RED_TEAM_RUNBOOK.md` — the sibling discipline: mechanical green is reachability
  evidence, not release evidence
