# Structural UX gaps — phone chrome, panel-first reading, Library hints, path stubs

Date: 2026-09-16 · Branch: `claude/user-experience-improvements-04b721`

Source: a fresh-state walkthrough of both live sites on 2026-09-16 (desktop and 375px phone),
checked against the shell source. Four structural gaps were approved for repair in one PR.
Everything here is learner-facing shell work; no clinical content changes, no ledger changes.

## 1. Phone chrome eats the first screen

Measured on a 375×812 phone opening `?page=t_mood.md`: header 154px, capture bar bottom at
210px, article `h1` top at 382px. Nearly half the first screen is chrome.

**Change (CSS only, `@media (max-width:640px)`):**
- `.fd-tabs` docks to the bottom of the viewport as a fixed tab bar (Today · Path · Library).
  The header keeps brand, search, week pill, Safety and Settings — the two-row layout the
  2026-08 audit pinned (brand name visible, search label ≥ 44px, every control 44×44, no
  collisions) is untouched.
- When a reader with the fixed action bar is open (`.fd-shell:has(.fd-actionbar)`), the bottom
  tabs hide (the action bar owns the bottom), and the reader's top `‹ Today` back link and tool
  toolbar hide too — the action bar's `‹` is the same control. The Progress page and the
  not-found surface have no action bar, so their top back link stays.
- `.fd-main` gains bottom clearance for the tab bar; article padding and top padding tighten.
- The capture launcher keeps its 44px target; only its top margin shrinks.

Target: `h1` top ≤ 35% of the viewport on a 390×844 phone. Pinned by a node test on the CSS
and a Playwright check in `front-door.spec.js`.

## 2. The "On the Unit" panel is collapsed on phones

`buildTpl()` emits `<details class="topic-tpl practice-panel">` with no `open` (deliberate
since 3b3156d; D-1 in `practice-panel.test.mjs` pins the closed default so the desktop visual
baselines hold). On a handheld the panel — Can't-miss, Do this next, In 30 seconds, On the
unit, Test yourself, Tools — is the point-of-need content and it sits behind a click.

**Change:** `buildTpl(m, file, opts)` accepts `opts.open`; the reader's `parseMarkdown` passes
`{open: fdHandheld()}` where `fdHandheld()` is `matchMedia('(max-width:999px)')` — the shell's
own "not desktop" threshold (rails and the desktop action pair appear at ≥1000px). Desktop
render is byte-identical. The prose still follows the panel; nothing is hidden behind a second
disclosure.

Consequence: the mobile reader visual baselines change (`front-door-reader-mobile.png` and the
archetype mobile shots). Refresh via the "Refresh visual baselines" workflow after merge.

## 3. Library rows carry no description

83 (MS3) / 100+ (resident) bare titles; 23–26 tools whose names do not say what they do.

**Change:** `curriculum.json` gains `libraryHints` — one audience-neutral line per placed
`.html` ref ("use this when…"). `validate_curriculum.py` requires a hint for every column-placed
tool (both directions: no unknown keys, no placed tool without a hint), so adding a tool means
writing its hint. `fd_data.js` joins `hint`; `fd_library.js` renders `.fd-collink__hint` under
the label. Reads keep bare titles (their tldr is clinical, not navigational).

Grouping tools by job is NOT done here: the registry has no use-mode taxonomy and 10 of 22
tools have no registry entry (22f2d30). That is a governance decision.

## 4. Retired instrument stubs are learning-path steps

`cssrs.html` (MS3 Week 5) and `bfcrs.html` (resident Week 1) are rights references — pages
that exist to say the instrument is not reproduced here. As path items they are checklist
steps that lead nowhere.

**Change:** remove both from `learningPaths`; they stay in the Library's "Acute & safety"
column, so the custodian route INV-IR2 requires is intact. `validate_curriculum.py` gains the
rule "a rights reference is never a path item". MS3 Week 5 goes 8→7 items, resident Week 1
9→8.

## Out of scope (author decisions)
- Merge of PR #671 (guest deep link) and promotion of Practice a Moment.
- A use-mode taxonomy for grouping tools.
- Enabling usage analytics.
