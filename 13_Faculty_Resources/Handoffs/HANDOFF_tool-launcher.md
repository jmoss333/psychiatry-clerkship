# Handoff — Floating Tool Launcher badges → Clerkship Hub

**For:** Claude Cowork (integration into the deployed SPA)
**Source artifact:** `Tool Launcher Badges.html` (self-contained demo + copy-paste snippets)
**Prepared:** 2026-07-01 · for Joshua Moss, MD
**Goal:** wire the launcher badges onto the matched teaching pages so the relevant interactive tool is one tap away, without touching any existing tool.

---

## 0 · Verified against the deployed shell (clerkship-hub-deploy)

The routing was checked against `clerkship-hub-deploy/index.html` — **no guessing required.** Findings:

1. **Sidebar selector is real.** Nav buttons are built with `b.className='navitem'` and `b.setAttribute('data-f', it.f)`, where `it.f` is the file name (e.g. `cssrs.html`). Tools are the items with `it.k==='tool'` (they render a `tool` tag). So `document.querySelector('.navitem[data-f="cssrs.html"]').click()` resolves exactly, and **branch 1 works with no host change.** All 14 tool filenames in the registry (§4) exist under `/tools`.
2. **`?tool=` already boots in-app.** On load the shell reads `new URLSearchParams(location.search).get('page')||get('tool')` and calls `openByFile()`; `popstate` does the same. So a plain `<a href="?tool=cssrs.html">` that triggers a full navigation **does** open the tool in-app on the new load. The in-*content* click handler only intercepts `?page=` (regex `/[?&]page=/`) — exactly as Dr. Moss noted — but that only means the `?tool=` link reloads rather than doing a soft SPA swap.
3. **postMessage type — the one correction made.** The shell's `message` listener handles `{type:'openPage', f}` (plus `openLibrary` / `search` / `theme` / `ic-size`). It does **not** listen for `openTool`. The existing tools (`tools/learning-path.html`) already post `{type:'openPage', f}` for tools too — that's the house convention. **The artifact has been updated so branch 2 posts `openPage`,** which means iframed badges work with **zero host change**.
4. **Tokens match.** The shell defines `--surface`, `--accent`, `--accent-dark`, `--primary-light`, `--on-brand`, `--text`, etc.; the badge CSS uses only tokens the host already provides.

**Net: no host change is strictly required.** The optional `?tool=` soft-swap in §1 is a nice-to-have, not a blocker.

---

## 1 · What the routing does (three ordered branches)

From the shared script in the artifact:

```js
function launchTool(el, tool){
  var nav = document.querySelector('.navitem[data-f="'+tool+'"]');
  if(nav){ nav.click(); return true; }                 // 1 · in-app via sidebar (primary path in the SPA)
  if(window.parent && window.parent !== window){        // 2 · embedded in iframe (shell listens for 'openPage')
    window.parent.postMessage({type:"openPage", f:tool}, "*"); return true;
  }
  if(el && el.getAttribute("href")) return false;       // 3a · let <a href="?tool="> navigate
  window.location.href = "tools/" + tool; return true;  // 3b · last resort
}
```

- **Branch 1** is what fires inside the live SPA today — no host change required.
- **Branch 2** fires when a badge is rendered inside an iframe. It posts `{type:'openPage', f}`, which the shell's existing `message` listener already handles (it clicks the matching `.navitem`). No host change needed — this matches the convention the other tools use.
- **Branch 3** is the standalone fallback (page opened directly). Optional host improvement below.

### Optional host change (soft-swap for `?tool=`)
Standing behavior: a `?tool=` link inside content does a full page reload, and the shell's boot code opens the tool in-app on that load — so it already works, just not as a soft SPA swap. If you want `?tool=` to swap without a reload (like `?page=` does), extend the in-content click handler's regex from `/[?&]page=/` to also match `tool` and route it through `openByFile()`. One-line change; the badges need no edits (they already emit `href="?tool=<key>"`).

---

## 2 · Integration steps

1. **Add the CSS** — copy the `.tl-chip`, `.tl-dock*`, `.tl-fab*` rules (and the `@media (max-width:820px)` + `@media (prefers-reduced-motion)` blocks) into the global stylesheet. They rely only on the existing house tokens (`--accent`, `--surface`, `--border`, etc.), which the host already defines — do **not** re-declare the tokens in the global sheet.
2. **Add the shared script once** (snippet "Shared" in the artifact) to the app bundle — it delegates clicks for `[data-tool]` and wires every `[data-dock]` FAB. Idempotent and framework-free.
3. **Verify token parity** — the artifact defines the same tokens at `:root` for standalone rendering; confirm the host's dark-mode values are equivalent (the artifact's `[data-theme="dark"]` remap is a reference, not authoritative — match the host's real dark palette).
4. **Place badges** per the map in §3.
5. **Icons** — each tool has an original inline `<svg>` glyph in the artifact's registry (`G` object) and on each gallery card. Lift the glyph you need per placement; they inherit `currentColor`.

---

## 3 · Per-page placement map

Inline chip = single obvious tool next to a passage. Dock = page maps to 2–3 tools.

| Page / topic | Badge | Form | Safety variant |
|---|---|---|---|
| SUD / Withdrawal | `withdrawal.html` | inline chip | — |
| Suicide & Safety, Discharge | `cssrs.html` (+ dock: `violence.html`, `decision-aids.html`) | dock | yes (cssrs, violence) |
| Catatonia | `bfcrs.html` | inline chip | — |
| Agitation & Restraint | `violence.html` | inline chip | yes |
| Capacity / Consult | `capacity.html` | inline chip | — |
| Mood / Anxiety | `screeners.html` | inline chip | — |
| MSE / Interviewing / Brief Psychotherapy | `mse.html`, `interview-circle.html` | dock or two chips | — |
| Oral Presentation / Documentation | `oral.html` | inline chip | — |
| Landmark Trials / Evidence / Shelf prep | `active-recall.html`, `shelf-mode.html`, `review.html` | dock | — |
| Any decision-tree topic | `decision-aids.html` | inline chip | — |
| Reflection / Professional identity | `reflection.html` | inline chip | — |

`is-safety` (terracotta) is reserved for **C-SSRS** and **Violence Risk** only.

---

## 4 · Full tool registry (key → label)

`mse.html` Mental Status Exam · `interview-circle.html` Interview Circle · `cssrs.html` C-SSRS Suicide Screen ⚠ · `withdrawal.html` CIWA-Ar / COWS · `bfcrs.html` Bush-Francis Catatonia · `violence.html` Violence Risk (FRST) ⚠ · `capacity.html` Decisional Capacity · `screeners.html` PHQ-9 / GAD-7 · `oral.html` Rounding Prep + Timer · `decision-aids.html` Algorithms & Decision Aids · `active-recall.html` Active Recall · `shelf-mode.html` Shelf Mode Exam Sim · `review.html` Daily Review · `reflection.html` Reflection & Identity

---

## 5 · Acceptance checklist

- [ ] `.navitem[data-f]` selector confirmed against the deployed shell (or `launchTool` selector updated).
- [ ] Clicking a chip **in the live SPA** opens the tool in-app (no new tab, no dead end).
- [ ] Dock: FAB idle = single circle; click/hover/Enter expands upward; Esc + outside-click collapse; `aria-expanded` flips.
- [ ] Keyboard-only: every badge reachable, visible focus halo, activates on Enter.
- [ ] Touch targets ≥ 44×44 on mobile; dock shrinks ≤820px and clears the bottom nav.
- [ ] Dark mode: all badges recolor via tokens — no hard-coded `#fff`/`#000`, focus halos use `var(--surface)`.
- [ ] `prefers-reduced-motion`: expansion/hover movement disabled, state still changes.
- [ ] No console errors on any wired page.
- [ ] Regression: existing ~15 tools unchanged — this is an additive access layer only.

---

## 6 · Notes

- Nothing here modifies existing tools; badges are additive.
- Keep the SVG glyphs inline (they inherit `currentColor`); do not swap to an icon font/library — originals were drawn to avoid third-party artwork.
- If you standardize on the `?tool=` host handler (§1), the inline `href` fallback becomes the primary standalone path and branch 3b (`tools/<tool>`) can be dropped.
