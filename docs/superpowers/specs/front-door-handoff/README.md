# Front Door — design handoff reference

Source: Claude Design project `9d05222d-1bec-4365-9202-6ef2affa6297`,
file `Front Door - Hi-Fi v2.dc.html`. Fidelity is **high** — colors, typography, spacing, copy,
and interactions in the prototype are final.

`Front-Door-Hi-Fi-v2.dc.html` in this directory is a verbatim copy of that prototype and is the
**normative source for every visual value**: colors, type scale, spacing, radii, shadows, and
animation curves/durations are the literal values in its inline styles. When this repo's spec and
the prototype disagree on a *visual* value, the prototype wins. When they disagree on *behaviour*,
[`../2026-08-15-front-door-design.md`](../2026-08-15-front-door-design.md) wins — it records the
deviations forced by this codebase, and each one says why.

## Reading the prototype

It is a `.dc.html` design-tool document, not runnable application code:

- `<x-dc>…</x-dc>` (lines 1–453) is template markup in the design tool's own syntax
  (`<sc-if value="{{ … }}">`, `{{ expr }}` interpolation). Read it for structure and styling, not
  as HTML to copy.
- `<script type="text/x-dc" data-dc-script>` (line 454 onward) holds the data and a
  `class Component extends DCLogic` carrying the behaviour.
- `support.js` in the design project is the tool's generated React runtime (`dc-runtime`). It is
  harness, contains nothing design-specific, and is deliberately not copied here.

Section markers make navigation easy — search for `══`:

| Line | Section |
|---|---|
| 34 | First-run · step 1 (role) |
| 60 | First-run · step 2 (week) |
| 83 | App shell — header, tabs, Today, Path, Library, reading pane |
| 358 | Search overlay |
| 384 | Side sheet (safety kit / protocol / item preview) |
| 455 | `WEEKS`, `ITEMS`, `PROTOCOLS`, `KIT`, `LIB_COLS`, `ROLES`, `SYN` data |
| 563 | `Component` — state, keyboard map, animations, render helpers |

## What is NOT normative

The prototype's **data** is illustrative and has been superseded:

- Its 44 `ITEMS` are invented. Real items come from `curriculum.json` joined to `topic_meta.json`.
- Its `PROTOCOLS` steps are superseded by `topic_meta[slug].safetySteps` / `safetyDoc`, which are
  faculty-attested. The prototype's `withdrawal.src` of "Acute & Safety / Toxidromes" was an
  invented path and is **wrong** for this repo — `toxidromes.md` is the hyperthermia page; the
  withdrawal protocol lives on `t_sud.md`.
- Its `STORE = 'pcl-frontdoor-v1'` violates this repo's `cw_*`/`rp_*` namespace rule. The real key
  is `cw_frontdoor_v1`, and it holds only state with no existing home.
- Its shelf countdown wording and arithmetic are both superseded — see the design spec §2.6 (copy
  must be audience-neutral: "Exam", never "Shelf") and §2.3 (dates are local, not UTC).

Read the design spec's §2 "Deviations from the prototype" before implementing anything from here.
