# Task 6A — Governance badge preservation report

## Scope

Restore the already-governed compact badge triplet from final annotated navigation through the
private Front Door projection, synchronous index join, Library, and Search. No governance policy,
CSS, fetch, storage, content, crisis, workflow, dependency, or build-output changes were made.

## Root cause

`annotate_navigation()` puts the validated `{status,riskKind,riskLevel}` triplet on final site-nav
items. `frontdoor_catalog.py` flattened those items to only `(title, kind)`, so the build-injected
`FD_SITE_MANIFEST` lost governance before `fdBuildIndex()` and the two live browse renderers could
call the existing `governanceBadge()` helper.

## RED — recorded before production edits

Commands run after test-only edits:

```text
python3 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py
node --test tests/fd-data.test.mjs tests/fd-library.test.mjs tests/fd-search.test.mjs tests/surface-governance-ui.test.mjs
```

Observed expected behavioral failures:

- Python: projected entries had no tuple element `3`; missing, malformed, extra-key, and conflicting
  governance were not rejected.
- Data join: `item.governance` was `undefined` for a projected four-field tuple.
- Library and Search: deterministic helper stubs received zero triplets because neither renderer
  called the retained global helper.
- Integration contract: neither live renderer contained its required helper invocation.

The only post-implementation test correction placed `t.html` in the small data-join fixture; the
failure was a fixture lookup error, not production behavior.

## GREEN and regression evidence

Focused gates passed:

```text
python3 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py
# 11 tests OK

node --test tests/fd-data.test.mjs tests/fd-library.test.mjs tests/fd-search.test.mjs tests/surface-governance-ui.test.mjs
# 85 tests, 85 pass, 0 fail
```

Full gate passed with local loopback permission (the ordinary sandbox run failed only on the eight
existing smoke-server launcher cases with `listen EPERM`):

```text
node --test tests/*.test.mjs
# 1,056 tests, 1,056 pass, 0 fail
```

Sequential build gates passed:

```text
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
# build_and_check: ms3 OK; 81 placed; static QA hard:0; LFS 105 real files/no pointers

bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
# build_and_check: res OK; 90 placed; static QA hard:0; LFS 105 real files/no pointers
```

## Built-artifact inspection

Both `_build/ms3/index.html` and `_build/res/index.html` have only four-element
`FD_SITE_MANIFEST` entries. Their joined Library and Search outputs were inspected with the actual
built `governanceBadge()` function:

| Example | Triplet | Result |
| --- | --- | --- |
| `interaction-cards.html` | pending, formulary, high | `Pending review · High risk` in both rows |
| `anki.md` | pending, general, low | `Pending review` in both rows |
| `welcome.md` | reviewed, general, low | no badge in either row |

Library output places the helper result directly after `.fd-collink__label`. Search output places
it directly between `.fd-result__title` and `.fd-result__meta`. The rendered artifact checks also
confirmed MS3 81 and resident 90 placed rows.

## Contract and boundary review

- `frontdoor_catalog.py` fails closed unless every catalog item has exactly `status`, `riskKind`,
  and `riskLevel`, with the required finite values. Duplicate refs with a different triplet fail.
- The projection deep-copies governance, leaving both curriculum and final annotated catalog input
  unchanged.
- `fdBuildIndex()` accepts canonical three-field manifest entries and sets `item.governance` to
  `null`; private projected four-field entries pass their exact triplet through.
- Library/Search reuse the existing global `governanceBadge()` only. No helper copy, fetch,
  search-index request, async rerender, status store, class, CSS, or policy label was added.
- Existing focused tests preserve ranking, cap, protocol dedup, and open-attribute behavior.
- `git diff --check` passed. Only the four production files and five requested test files changed;
  this ignored report is the sole additional force-added file.

## Concerns

No task-specific concerns. Existing static-QA soft warnings (7 MS3, 10 resident) are unchanged
baseline findings; both builds have zero hard failures.
