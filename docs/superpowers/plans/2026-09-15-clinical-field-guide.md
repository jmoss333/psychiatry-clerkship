# Clinical field guide — local integration

Approved direction: carry the standalone Clinical Warm reading prototype into the shared learner reader. Keep this work local for review; no push, pull request, merge, deployment, clinical rewriting, or attestation changes.

## Design and scope

Use the existing rendered teaching DOM as the only source. A quiet serif-led reading column sits beside a useful section margin on desktop. On mobile the contents and search controls precede the original teaching order. Keep the live tool iframe, progress controls, canonical review notice and centrally injected crisis block intact. The acceptance page is **Therapy on the Unit** (`therapy_on_the_unit.md`), with its original table, references, self-checks and linked practice tools. Enhancements also need to degrade safely on other reading pages.

The reusable interface consists of section navigation, a page-scoped passage finder, contextual section treatments, table/row reading modes, and a temporary practice bookmark. All added UI is navigation, not authored clinical material. Use existing Clinical Warm tokens, semantic headings, explicit disclosure state, visible focus and reduced-motion behavior. Printing exposes the complete text and safety/review context.

## Implementation steps

1. Establish focused reader/controller/governance baseline; audit concurrent scope. Baseline: 215 focused tests passed. Collision evidence is incomplete and flags other worktrees; preserve their work and do not publish this branch.
2. Add behavioral tests for guide navigation, passage arrival, real practice return, narrow tables, source parity and print. Demonstrate a failing feature test before implementation.
3. Add a separate ES5 DOM enhancer (`frontdoor/fd_guide.js`) and inject it through `common.py` and `spa_index.html`. Keep `fd_reader.js` pure. Scope enhancement to learner markdown readers; leave faculty-preview rendering unchanged. Preserve section IDs during existing disclosure enhancement.
4. Add scoped guide styles to `frontdoor.css` and update the class inventory. Keep tool layout rules unchanged. Use the existing shared palette in light/dark; fit a comfortable reading measure and mobile text size.
5. Connect mount/teardown, pending-high focus priority, transient practice return and bounded `guideFind`/`guideSection` arrival parameters. Strip guide parameters before forwarding routes into activities. No new persistent store, clinical registry or published route.
6. Run focused tests, both build gates sequentially and the local verification gate. Exercise the actual browser journeys on both audiences. Do not regenerate visual baselines on macOS; report that Ubuntu refresh is still needed before release.
7. Document the reusable components and exact verification results, including unavailable checks. Present local review links and next release step.

## Acceptance evidence

- Teaching wording, authored links, references, crisis content and ledger files are unchanged.
- Search arrival and section navigation reveal and focus the intended passage while review warnings retain priority.
- Practice opens the real governed tool, and returning restores context without marking it read.
- Narrow light/dark views contain all table cells without document overflow; comparison and row views are keyboard operable.
- Print styling reveals collapsed content, references and safety information while removing navigation chrome.
- Existing tool expansion, study progress, faculty preview and crisis visibility tests remain passing.
