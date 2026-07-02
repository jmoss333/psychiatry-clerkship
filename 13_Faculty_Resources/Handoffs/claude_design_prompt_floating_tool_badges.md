# Prompt for Claude Design — "Floating Tool Launcher" badges for the Psychiatry Clerkship Library

*Paste everything in the box below into Claude Design. It is self-contained. The sections after the box are notes for Dr. Moss (you) — do not paste those.*

---

> ## BRIEF: Build a set of "floating tool launcher" badges for a medical-education website
>
> ### Context
> I run a private inpatient-psychiatry clerkship library — a single-page app (SPA) with markdown teaching pages plus ~15 interactive HTML tools (assessment calculators, screeners, a spaced-repetition deck, etc.). Right now a student has to leave the page they're reading and hunt through the sidebar to open the matching tool. I want a small, elegant **floating launcher badge** I can drop onto any teaching page so the relevant tool is one tap away.
>
> ### What to build
> Deliver **one self-contained HTML file** that demonstrates and documents a reusable badge component in three forms:
> 1. **Inline tool chip** — a small pill (icon + short label) I paste mid-content, right next to the relevant passage (e.g., a "CIWA-Ar / COWS" chip beside the withdrawal-scoring paragraph). Flows with text; wraps gracefully.
> 2. **Floating dock (FAB)** — a fixed, bottom-right floating button that sits above the page and, on click/hover, expands upward into a short vertical stack of 1–3 tool badges relevant to that page. Collapses to a single circular button when idle. This is the "floating symbol" — always visible while reading, never in the way.
> 3. **Icon set** — a clean, original inline-SVG glyph for each tool (list below). Simple, single-color line icons that inherit `currentColor`. Do **not** copy any existing icon library's exact artwork; draw original minimal glyphs.
>
> The single file should render a styled gallery showing every tool's chip + icon, a live floating dock demo, a light/dark toggle, and — at the bottom — a **copy-paste snippet template** with clear instructions so I can drop a badge onto any page by changing one attribute.
>
> ### The tools (registry) — build one badge per row
> | key (data-tool) | Label | Surface it on pages about… | Icon concept |
> |---|---|---|---|
> | `mse.html` | Mental Status Exam | MSE, interviewing, documentation | head/profile with dotted "domains" |
> | `interview-circle.html` | Interview Circle | interviewing, intake, history-taking | radial/orbit circle |
> | `cssrs.html` | C-SSRS Suicide Screen | suicide risk, safety planning, discharge | shield + check |
> | `withdrawal.html` | CIWA-Ar / COWS | alcohol/opioid withdrawal, SUD | gauge/dial |
> | `bfcrs.html` | Bush-Francis Catatonia | catatonia | frozen/stillness figure |
> | `violence.html` | Violence Risk (FRST) | agitation, restraint, aggression | alert triangle + person |
> | `capacity.html` | Decisional Capacity | capacity, consent, refusal | balance scale |
> | `screeners.html` | PHQ-9 / GAD-7 | depression, anxiety, mood | checklist/bars |
> | `oral.html` | Rounding Prep + Timer | oral presentations, rounds | stopwatch |
> | `decision-aids.html` | Algorithms & Decision Aids | any decision-tree topic | branching flowchart |
> | `active-recall.html` | Active Recall (Self-Test) | landmark trials, evidence, exam prep | flashcard/refresh |
> | `shelf-mode.html` | Shelf Mode Exam Sim | COMAT/shelf prep | timed exam sheet |
> | `review.html` | Daily Review (Spaced Rep) | any topic (review workflow) | calendar + repeat arrows |
> | `reflection.html` | Reflection & Identity | professional identity, reflection | journal/pen |
>
> ### Interaction / routing contract (important)
> The badge lives inside a host SPA. On activation it must open the tool **in-app**, not a dead-end new tab. Implement this click logic, in order:
> 1. If a sidebar nav element exists, open in-app: `document.querySelector('.navitem[data-f="<data-tool>"]')?.click()`.
> 2. Else if inside an iframe, post to the parent: `window.parent.postMessage({type:'openTool', f:'<data-tool>'}, '*')`.
> 3. Else fall back to a normal link: navigate to `?tool=<data-tool>` (and as a last resort `tools/<data-tool>`).
> Wire this so the same snippet works whether it's rendered inside the SPA shell or opened standalone. Expose the target via a `data-tool="<key>"` attribute so I only change that one value per placement.
>
> ### House style — match this exactly (a "Clinical Warm" theme)
> Use these CSS custom properties (already defined by the host; your file should also define them at `:root` so the demo renders standalone), and a `[data-theme="dark"]` block that remaps them:
> ```
> --bg:#f6f3ee; --bg-alt:#faf6f0; --surface:#ffffff; --border:#ddd3c6;
> --primary:#c25a3c; --primary-dark:#a84830; --primary-light:#f3ebe5;
> --accent:#2a6b5e; --accent-dark:#1e5248; --accent-light:#edf4f2;
> --text:#3b332c; --text-mid:#64574b; --text-light:#87786a;
> --radius-pill:999px; --shadow-sm:0 1px 3px rgba(59,51,44,.06); --shadow-lg:0 8px 28px rgba(59,51,44,.10);
> --font-body:"Source Sans 3","Segoe UI",system-ui,sans-serif;
> --font-head:"Source Serif 4",Georgia,serif;
> ```
> - Idle chips/dock: `--accent` foreground on `--surface`/`--accent-light`, 1px `--border`, pill radius. Hover/active: lift to `--accent-dark` / subtle shadow. Use the accent (teal) family as the default; reserve `--primary` (terracotta) for one optional "safety" emphasis variant (C-SSRS, Violence).
> - Everything must theme correctly in **dark mode** via the `[data-theme="dark"]` remap — no hard-coded `#fff`/`#000`; use tokens. For focus/hover halos use `box-shadow:0 0 0 3px var(--surface)`, not white.
>
> ### Accessibility & motion (non-negotiable)
> - Real `<button>`/`<a>` elements; keyboard operable; visible focus ring; `aria-label` like "Open the CIWA-Ar / COWS tool". The floating dock's expand control has `aria-expanded`.
> - Touch targets ≥ 44×44px. Text contrast ≥ WCAG AA.
> - All transitions wrapped in `@media (prefers-reduced-motion: reduce){ … }` that disables movement.
> - The floating dock must not cover content on mobile (≤820px): shrink it, keep it clear of the bottom nav, and let it collapse.
>
> ### Hard constraints
> - **Vanilla only:** plain HTML + CSS + a small amount of vanilla JS. No build step, no frameworks, no external JS/CSS/icon libraries, no web fonts beyond the system stack above. Everything inline in the one file.
> - **Do not** use or emit any proprietary design-runtime, custom elements, or `data-*` framework directives — I need clean, portable markup I can hand-insert into plain HTML/markdown.
> - Original iconography only; no copied logos or icon-set artwork.
> - Keep it lightweight — this rides on top of existing pages.
>
> ### Deliverable
> One `.html` file that: (a) renders the full gallery (every tool's chip + icon, light & dark), (b) shows a working floating dock demo, (c) ends with a documented **copy-paste snippet** (chip form and dock form) where I change only `data-tool` and the label. Add 2–3 sentences on where each badge is meant to live.

---

## Notes for Dr. Moss (do not paste to Claude Design)

**Why this shape.** Two forms cover both use cases: the **inline chip** is best for a single obviously-relevant tool next to a passage; the **floating dock** is best when a page maps to 2–3 tools (e.g., the Suicide/Safety page → C-SSRS + Violence Risk + Decision Aids). You can use either or both per page.

**Routing note — one small host change I'll make.** The SPA's in-app link handler currently intercepts `?page=` links but not `?tool=`. The prompt's click logic (find `.navitem[data-f]` and click it) already works today, so the badges will function as-is. When you're ready to standardize, I can add `?tool=` to the SPA handler so plain `<a href="?tool=…">` links also open in-app — a one-line change on my side.

**Suggested page → tool placements** (for when we insert them):
- Withdrawal/SUD page → `withdrawal.html`
- Suicide & Safety, Discharge → `cssrs.html` (+ dock: Violence, Decision Aids)
- Catatonia → `bfcrs.html`
- Agitation & Restraint → `violence.html`
- Capacity/Consult → `capacity.html`
- Mood / Anxiety topics → `screeners.html`
- MSE / Interviewing / Brief Psychotherapy → `mse.html`, `interview-circle.html`
- Oral Presentation / Documentation → `oral.html`
- Landmark Trials / Evidence / Shelf prep → `active-recall.html`, `shelf-mode.html`, `review.html`

**After Claude Design returns it:** hand me the file. I'll recreate/clean it into the house build if needed, add the `?tool=` handler, wire the badges onto the matched pages above, and deploy to both sites — same pipeline as the other tools. Nothing about this changes the existing tools; it's an additive access layer.

*Prepared 2026-07-01 · Joshua Moss, MD | Psychiatrist*
