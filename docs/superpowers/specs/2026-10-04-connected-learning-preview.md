# Connected learning preview

Initial base inspected: `66785d0` (main, 2026-10-04 UTC). Synchronized with `d6ae706`
after preparation #958 and dose-guard #965 merged. Preview only; no production publish.

The learning workspace connects Today, Library and the existing Path while retaining the
current primary-action priority, routing, preparation disclosure and device-local state.

## Visual direction

Reuse Clinical Warm: page #f6f3ee, surface #ffffff, text #3b332c, teal #3a7d6e,
olive #8b7040 and safety #a34132. The existing dark tokens supply the dark equivalent.
Source Serif 4 gives learning titles hierarchy; Inter carries controls and supporting text.
Left-align content. Use one leading action, continuous reading rows and a quiet supporting
rail. Borders indicate groups or selected state, rather than putting every item in a card.

```
Today                   Library                     Path
Heading + context       Essentials / Everything     Heading + boundaries
Quiet pilot notice      Heading + search            Existing interactive route
Primary action          Sections | Readings         Practice | Activities
Existing prep/review              | Tool preview
Week preview map
Weekly activities
```

The map uses only actual projected weeks. It previews a week via the existing action, never
sets the current week or implies completion from position. Real progress stays in Continue
and Path. Library uses the existing search dialog, transient section selection and tool
preview tabs. On phones, the section index scrolls horizontally and readings stay first.
The existing Path road, arrow/Home/End keyboard navigation, status words and counts remain.

The first design pass rejected more overview cards and invented dashboard statistics:
learners need a next action, a place to find resources and a clear view of the path. The
visual emphasis is on that path and the reading titles, not decorative metrics.

## Bounded implementation

- `frontdoor/fd_today.js`: compact actual-week preview map below existing primary/secondary actions.
- `frontdoor/fd_library.js`: shared search entry; wrappers for responsive section/results layout.
- `frontdoor/fd_path.js`: clarify preview versus current-week selection above the route.
- `frontdoor/frontdoor.css`: quiet Today rows, responsive Library workspace, paired Path detail.
- Targeted renderer/browser checks and CSS class inventory.

Inspected overlapping work: #941 pharmacy page (excluded); #949 mobile title cleanup and
historical prototype; #951 single-file tool colors (excluded); #958 preparation/Case Journeys
(subsequently merged into main and preserved during synchronization; no unmerged code imported). Original checkout and its dirty files remain untouched.
No clinical text, signatures, governance hashes, rights notices, registry or policy changes.

## Validation plan

Targeted renderer and action-contract tests first. After the coordinated heavy-test window:
both full site gates, responsive light/dark browser checks, before/after captures using synthetic
local learner state, independent review, exact-head CI and both automated Netlify previews.
Do not regenerate visual baselines on macOS. Screenshots are evidence, not baseline replacements.
