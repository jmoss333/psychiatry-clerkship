# Controlled Firecrawl change test

Manually dispatch `firecrawl-known-change.yml` to test a known, nonclinical edit. This workflow has no schedule and is not enrolled in production failure/recovery reporting. It does not run the faculty collector, modify the production inbox, or give review credit.

Each run creates a unique orphan branch under `automation/firecrawl-fixture/`. Its entire tree is one public `fixture.md` file: a clearly labeled fictional library-sorting instruction. Version A uses shelf Cedar; version B uses shelf Maple. The raw GitHub URL remains identical for all observations. No clinical material is published. The branch is retained as an audit fixture, with both commit IDs recorded in the artifact; it can be removed manually after evidence retention is no longer needed.

The four Firecrawl requests share a unique tracking tag and the production extraction settings (`maxAge: 0`, `storeInCache: false`, main-content markdown). The expected provider sequence is `new`, `same`, `changed`, `same`. Direct HTTP checks first require the exact expected public bytes. These checks wait at most 25 attempts with 15-second spacing per observation for CDN propagation; they consume no Firecrawl requests. A stale provider response, missing identity/version, unusable retrieval, or unaligned baseline makes the result inconclusive. There are no Firecrawl retries, and at most four requests are attempted.

The provider baseline timestamp must align within five seconds of an earlier observed fetch window whose text matches the immediately preceding version. This accommodates providers retaining a content-identical earlier observation, without accepting an unknown history. Alignment is evidence, not a cryptographic lineage guarantee.

A pass requires all four valid observations, the expected statuses, and exact and normalized text changes matching the controlled sequence. A complete mismatch is `disagreement` (exit 1); incomplete coverage is `inconclusive` (exit 2). An initial receipt and pre-request checkpoint keep interrupted runs visibly incomplete and count any attempted request. Artifacts retain only synthetic text and allowlisted provider metadata for 90 days.

The GitHub token needs `contents: write` to publish the fixture; GitHub does not restrict that token to a single branch. The script restricts writes to its newly generated fixture ref, creates no parent tree from main, uses no force update, and refuses a foreign head. Checkout credentials are not persisted. Firecrawl and GitHub credentials never enter the artifact.

A successful test demonstrates detection of this one synthetic sentence change. It does not establish sensitivity to real guideline changes, reliably distinguish layout from recommendations, or validate clinical teaching. Those remain separate evaluations with faculty governance.
