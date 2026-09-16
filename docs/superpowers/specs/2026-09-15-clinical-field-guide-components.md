# Clinical field guide components

The field guide carries the approved standalone reading direction into the existing shared
reader. It changes how the original teaching is presented and navigated. It does not rewrite
clinical content, attest a page, infer learner competence, or replace a practice activity.

The acceptance page is **Therapy on the Unit** (`therapy_on_the_unit.md`). Its authored
headings, prose, examples, comparison rows, references, links and review text remain the source
of truth. Crisis contacts still come from the existing central build injection. Enhancement
operates on rendered teaching DOM, after the governed reader has mounted successfully.

## Visual system

Use the existing Clinical Warm token palette for both themes. Prose uses the shared sans-serif
stack at **18px / 1.75**, with a **720px maximum** measure. Titles use the local serif fallback
stack (`Iowan Old Style`, Georgia, Times New Roman, serif), scaling from 30px to 46px on desktop
and 36px on small screens. Section headings are 29px / 1.3; supporting headings use the 21px
step. Tables use 15px / 1.6 and reference text uses 14px / 1.7. No external font request is
required. Guide sizes derive from the shared dimension tokens; they do not replace the sitewide
type scale.

At **1000px and wider**, a 180–220px sticky contents/finder margin sits beside the header and
reading column. Week navigation remains accessible after the article. At every width, DOM order
is the original identity/title/lead, then the contents/finder margin, then teaching and week
navigation. Below 1000px these follow natural single-column flow; the contents disclosure starts collapsed. The
breakpoint deliberately matches the existing shell policy. At 640px and narrower, comparison
tables retain enough column width to remain understandable inside their own scrolling region;
the first column stays visible while scrolling. The alternate row view remains available by
explicit choice. No content is truncated.

Ordinary teaching rests directly on the warm page ground. Orientation gets a teal rule and
wash, explicitly titled cautions get an olive rule and wash, supporting examples get a quieter
teal rule, and references get a top rule with compact text. Classification is a neutral,
bounded match to the page's existing heading or explicit structural text. It is never a model
judgment that a passage is safe, accurate, important, or approved. Unrecognized sections retain
the ordinary teaching treatment.

## Reusable contracts

| Component | Source and structure | Behavior and access |
|---|---|---|
| Reader frame | `.fd-reader--guide` modifies only a mounted teaching reader. `.fd-guide-header` moves the original identity, one visible page H1 and lead ahead of navigation; authored section headings remain semantic H2/H3. | The original review notice remains visible. Activity iframe sizing, tool expansion and completion controls keep their existing behavior. Faculty preview uses its existing exact-route path without this enhancement. |
| Contents margin | `.fd-guide-margin` follows `.fd-guide-header` and precedes `.fd-article` in DOM. `.fd-guide-contents` is native `<details>` with `<summary>` and a labeled `<nav>`. | Navigation reveals the destination if necessary, scrolls it below sticky chrome and focuses it. `aria-current="location"` identifies location; it never indicates progress. Native expanded/collapsed state remains available to assistive technology. |
| Page finder | `.fd-guide-find` has a labeled input and submit button; `.fd-guide-results` exposes results and count feedback. | Search operates on this mounted guide's real text. A result names its section and exposes an excerpt. Opening it reveals the passage, sets `.fd-guide-match` and shows `.fd-guide-arrival`. State the scope as this guide; global search still has its existing title/summary and safety-ranking contract. |
| Arrival target | Stable section/passage target with programmatic focus; the target gains a visible outline. | High-risk pending-review governance focus takes priority. Late governance updates must not be bypassed. `guideSection`/`guideFind` inputs are bounded and page-specific; strip them before opening another resource or forwarding parameters into an activity. Ordinary URL hashes remain reserved for edition handoff. |
| Teaching section | Existing `.sec-c` disclosure or non-collapsible `.fd-guide-section`, with original heading/text. Optional purpose classes are `.fd-guide-orientation`, `.fd-guide-caution`, `.fd-guide-example`, `.fd-guide-references`. | Main teaching starts available. Existing crisis-bearing pages retain the rule that their sections are not collapsed. No color is the sole identifier of purpose; the original heading carries the meaning. |
| Comparison table | Original semantic table remains in `.table-scroll-viewport`. Simple rectangular tables may gain `.fd-guide-table-controls` and `.fd-guide-table-rows`. | Comparison is the default. “Compare columns” / “Read by row” expose their selection with `aria-pressed` and name controlled views. One representation is exposed at a time via `hidden`. Row entries derive every label/cell from the original, without rewriting or dropping cells. Complex rowspan/colspan tables keep the original accessible scroll view. |
| References | Original ordered references and addenda stay in their authored order. | Styling wraps long identifiers and URLs. If citation previews are added, derive them from these entries, retain the complete list, resolve only known citation numbers, and give dialogs focus containment, Escape/close behavior and focus return. Unresolved citation syntax stays unchanged. |
| Practice return | Existing governed tool route plus `.fd-guide-return`; capture temporary page-session reading context at launch. | Open the actual linked activity. Return after the teaching DOM loads, restoring the reading position and an equivalent invoking control. Keep the existing “Back” action's originating-tab meaning. No new durable store, completion write, attestation change or duplicated activity. |
| Print | Print the original teaching, comparison table, references, review notice and central crisis information. | Hide navigation/search/action chrome and alternate table rows. Open details for print and restore prior state afterward. CSS additionally exposes section bodies and the original table, repeats table headers, wraps cells and URLs, and avoids stranded headings. System print ink/paper tokens keep dark-mode pages readable on paper. |

All controls retain visible keyboard focus, and guide controls use a 44px minimum target
height. Programmatically focused headings/passages also receive a visible outline. The shared
reduced-motion rule disables animation, transitions and smooth scrolling; arrival remains
understandable through a static outline and text cue.

## Verification and reuse

Validate source-text and cell parity before treating the visual transformation as complete.
Exercise actual search arrival, contents navigation, a real activity round trip, both narrow
table views, light/dark modes, keyboard focus, reduced motion, and print with every disclosure
initially closed. Check a second teaching page without crisis content and a crisis-bearing page;
one successful acceptance page does not prove the shared reader behaves correctly everywhere.

## Local integration evidence — 2026-09-15

- `bin/verify.sh` completed successfully during integration. Both final audience build gates
  were rerun after the focus and print refinements; each includes the root regression suite,
  contrast checks, static QA, search quality and shipped-page checks.
- Browser acceptance uses the served **Therapy on the Unit** text, not a copied fixture. It
  compares original paragraphs/list items, headings, all table cells, references, links and
  central crisis content. It also exercises optional disclosures on **Documentation & Oral
  Presentations**, and keeps the generated Welcome Compass outside the guide transformation.
- The Front Door, tool-expansion and governance browser suites cover both audiences: 66 passed,
  10 expected skips. Seven skips are resident runs of student-only Compass journeys; three
  are student governance states absent from the current placed Library. A synthetic transport
  fixture independently tests early pending-high warning focus on both audiences, without
  editing the actual review ledger.
- The final print-only correction hiding the global Capture control passed both audience
  print cases after that control was first demonstrated to remain visible on paper.
- Search arrival focuses the named micro-intervention; section links survive reload; a real
  governed practice activity returns to the invoking passage without marking it read. Both
  320px themes preserve all table cells, keyboard scrolling and row reading. Print tests expose
  collapsed teaching, references and the canonical crisis block while hiding navigation.
- Authored teaching Markdown, clinical registries and the review ledger are unchanged.
- This checkout initially held LFS placeholders. Verification temporarily used hash-verified
  original media from the existing local checkout, without downloads. Those temporary hydration
  changes were restored afterward to keep the code review focused; built previews retain real
  media. A future clean local build must hydrate LFS media again.

This is local implementation evidence, not a deployment or a new clinical attestation. Native
print-dialog/PDF pagination has not been inspected; print media styling is browser-tested.
Reader screenshot baselines intentionally need an Ubuntu refresh before release; none were
regenerated on macOS. The collision preflight found overlapping work in other checkouts and
incomplete GitHub evidence. Reconcile current branch/PR state before publication.

Use focused component/controller tests and both sequential site builds. Run the existing design
drift and selector-inventory gates. Browser screenshots establish visible behavior; CSS source
inspection alone is not print-pagination, contrast, screen-reader, or clinical review evidence.
Visual baselines remain an Ubuntu/Chromium workflow responsibility.

This document records the component contract, not a claim of deployment or faculty approval.
Verification results belong in the implementation report. The next reusable extension could be
a temporary reading thread connecting related passages and practice activities while leaving
learning-completion decisions explicit.
