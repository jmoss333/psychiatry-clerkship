# Teaching files belong to their tool's review

A reviewed tool's HTML can stay unchanged while its loaded case pack changes.
`shipped_pages.py` therefore derives `extraSources` from the tool's local data
references, using `teaching_dependencies.py`. The existing Python and JavaScript
attestation hash implementations already hash the union of `source` and
`extraSources`; the faculty console and learner governance projection both use
that same listing.

Changing a covered pack makes an older review render **pending**, with its
original review date and hash retained. No ledger entries or clinical wording
are rewritten by this mechanism. Adding previously omitted dependencies also
makes old HTML-only reviews pending; faculty must review the expanded scope.

## Dependency discovery and build checks

- Scan inline scripts for static fetch URLs, plus script/track `src` attributes. A fetch argument must itself be a literal;
  variable and computed arguments fail rather than guessing at JavaScript scope. Follow declared first-party scripts regardless of filename suffix. Resolve fetch URLs relative to the deployed HTML document.
- Resolve source files through the manifest's `toolAssets`, orientation media,
  the resident sibling-pack copy rule, and the builder's root-data/quiz routes.
  Never guess from a same-named file next to a prototype. In particular, the
  Canon Quiz uses the canonical Landmark Trials quiz file.
- Include the union of MS3 and resident inputs for a shared tool. The resident
  reasoning-case override is therefore covered as well as the MS3 case file.
- Fail `shipped_pages.py --check` when dependencies change without regenerating
  the listing, or when a referenced local teaching file has no build mapping.
- During both real builds, scan the finished tools too. Fail for missing assets,
  untracked source dependencies, or copied bytes that disagree with their source.
  Quiz JSON is compared structurally, excluding only the three deck-level audio
  enrichment fields (`audio`, `audioDur`, `oe`) written by the builder.

`topic_meta.json` is excluded as a whole-file dependency because its per-page
record already participates in the hash without `facultyReview`. Including the
generated review projection would make signing a review invalidate itself.
Vendored runtime scripts, service endpoints and remote URLs are outside this
local teaching-file contract.

## Adding a loader

Use a complete, unescaped static URL in the loader; single quotes,
double quotes and static template literals work. Put the literal directly in
`fetch(...)`; variable aliases require scope-aware discovery support first. Query strings and fragments
do not change source identity. Declare new copied assets in `toolAssets`, or
extend the copy-route resolver when adding a different builder route. Regenerate:

```sh
python3 13_Faculty_Resources/_automation/site_build/shipped_pages.py --write
```

The scanner is conservative: loader examples in comments count too. Ordinary
labels and download filenames are not treated as teaching requests. Unresolved fetch expressions, computed templates, module scripts,
imports, CommonJS loaders and XMLHttpRequest fail until discovery is extended.
The three dynamic Interview Room service expressions have explicit, source-scoped
exemptions; other dynamic service calls require the same review. This is not a
general JavaScript evaluator: runtime-created script tags and arbitrary binary
media are outside this static contract, as are remote teaching responses. New
loader mechanisms need an explicit extension to discovery and its regression
tests; do not infer their coverage from a green static check.

The existing `test_shipped_pages.py` gate exercises pack-only review drift,
renamed assets, first-party loaders, both audience sources, unmapped/missing
inputs, built-only loaders and incorrect copies. No new CI job is needed.
