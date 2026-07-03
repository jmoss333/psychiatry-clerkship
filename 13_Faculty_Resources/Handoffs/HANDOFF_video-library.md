# Handoff — Video Library → Clerkship Hub

**For:** Claude Cowork / Claude Code (integration into the deployed SPA)
**Source artifacts:** 4 motion pieces built as Design Components (`.dc.html` + `.jsx` scene files)
**Prepared:** 2026-07-02 · for Joshua Moss, MD
**Goal:** get four orientation/explainer videos out of the prototyping tool and into `clerkship-hub-deploy` as lightweight, offline-safe `<video>` embeds — with zero new runtime dependency on the deployed site.

---

## 0 · About these files — read this first

The `.dc.html` / `.jsx` files in this package are **design references, not production code.** They run on a prototyping runtime (`support.js`) that fetches **React, ReactDOM, and Babel from `unpkg.com` at load time** — that's fine inside the design tool, but it is exactly the kind of CDN dependency already flagged as a risk elsewhere in this project (see `HANDOFF_README.md` §Origin, item 2: `marked` loading from a CDN blanks the hub on ward wifi). Don't embed the `.dc.html` files directly in the deployed shell.

**The integration path is simpler than the source looks:**

1. Each video is built on a timeline engine with a one-click **Export → Video** action (in the design tool's Share menu, or the player's own download button) that renders the on-screen animation to a real **`.mp4`** file — no audio track unless one has been recorded and mixed in (only the intro trailer has a script for that; see §4).
2. That `.mp4` is what actually ships. It's a static asset — no React, no Babel, no CDN, no build step. It drops into `clerkship-hub-deploy` exactly like any other static file and plays with a plain `<video>` tag.
3. **This export step needs a human in the design tool** (Dr. Moss, or whoever owns this project) — Claude Code cannot click the export button itself. If this package arrives before the `.mp4` files exist yet, scaffold the integration below with placeholder `src` paths and the exact target filenames, and it'll just work the moment the real files land in those paths.

## Fidelity

High-fidelity. Every visual, color, and timing beat in the `.dc.html` files is final — recreate the exported video's on-screen look exactly (trivial, since you're embedding the rendered file itself, not rebuilding the animation).

---

## 1 · The four videos

| # | File (source) | What it is | Duration | Loop? |
|---|---|---|---|---|
| 1 | `Clerkship Hub Intro Video.dc.html` | Welcome trailer — hook → "everything in one place" → 6-week arc → guided tour of the hub UI → close. Has a full **voiceover script** ready to record (`VO Script - Hub Trailer.dc.html`). | 0:78 | No — a "watch" piece, not a background loop |
| 2 | `Clerkship Day in the Life.dc.html` | Five timestamped moments (6:45a–7:15p) each pairing a real situation with the hub tool that fits, acted out on an animated iPhone. Silent/kinetic-text, no VO. | 1:26 | Yes, fine as ambient loop |
| 3 | `Week Intro Stingers.dc.html` | Six 6-second bumpers (one per curriculum week), each with its own accent color, title, and topic chips. Ships as one 36s reel **or** any single week in isolation. Silent. | 0:36 (reel) / 0:06 (single week) | Yes |
| 4 | `Tool Spotlight Series.dc.html` | Six ~13s spotlights, one per bedside tool (Interview Circle, Decisional Capacity, Violence Risk, Withdrawal, Catatonia, Decision Aids), each recreated inside a browser-window frame with one live interaction. Ships as one 88.5s reel **or** any single tool in isolation. Silent. | 1:28.5 (reel) / 0:13.5 (single tool) | Yes |

All four: **1920×1080**, background `#2f2924` (dark) or `#f6f3ee` (light, intro only), fonts **Source Serif 4** + **Source Sans 3** (Google Fonts — already loaded site-wide, no new font dependency).

---

## 2 · Isolating a single week or tool (already built in)

Videos 3 and 4 support pulling out one segment instead of the full reel — useful because a 36s or 88.5s reel is a poor fit for the top of a single week/tool page, but a 6s or 13.5s single-segment clip is perfect there.

**In the design tool:** open the Tweaks panel → set `week` (1–6) on the Stingers video, or `only` (1–6) on the Tool Spotlight video → the player now shows just that one segment on loop → Export → Video.

**Or via URL, if you're pointing an iframe at the hosted `.dc.html` instead of an exported file:** append `?week=3` / `?tool=2` to the URL. The component reads it with no extra host code.

Tool Spotlight's `only` index maps to: **1** Interview Circle · **2** Decisional Capacity · **3** Violence Risk (FRST) · **4** Withdrawal (CIWA-Ar/COWS) · **5** Bush-Francis Catatonia · **6** Algorithms & Decision Aids.

**Recommended exported filenames** (so §3's embed map "just works"):
`week-intro-1.mp4` … `week-intro-6.mp4`, `tool-spotlight-interview-circle.mp4`, `tool-spotlight-capacity.mp4`, `tool-spotlight-violence.mp4`, `tool-spotlight-withdrawal.mp4`, `tool-spotlight-bfcrs.mp4`, `tool-spotlight-decision-aids.mp4`, plus `intro-trailer.mp4`, `day-in-the-life.mp4`, and the two full reels `week-stingers-reel.mp4` / `tool-spotlight-reel.mp4` for showcase placements.

---

## 3 · Placement map

| Page (in `nav.json`) | Video | Placement | Autoplay behavior |
|---|---|---|---|
| `welcome.md` — Welcome to the Rotation | `intro-trailer.mp4` | Hero, top of page | Click-to-play with sound (has VO) — **not** autoplay/muted |
| `orientation.md` — Orientation Packet | `day-in-the-life.mp4` | Inline, after the intro paragraph | Muted autoplay loop |
| `week1.md` … `week6.md` — each week page | matching `week-intro-N.mp4` | Small banner under the page `<h1>` | Muted autoplay loop |
| `tools/interview-circle.html`, `capacity.html`, `violence.html`, `withdrawal.html`, `bfcrs.html`, `decision-aids.html` | matching `tool-spotlight-*.mp4` | Collapsible "See it in action" panel above the tool | Muted autoplay loop, paused until expanded (don't compete with the live tool below it) |
| `welcome.md`, or a new "Tour" nav item | `tool-spotlight-reel.mp4` and/or `week-stingers-reel.mp4` | Optional showcase reel for a first-run walkthrough | Muted autoplay loop |

The other 8 tool pages (`mse.html`, `oral.html`, `cssrs.html`, `screeners.html`, `reflection.html`, `active-recall.html`, `shelf-mode.html`, `review.html`) have no spotlight yet — out of scope here, not a gap to fix.

---

## 4 · The intro trailer needs a voiceover

`VO Script - Hub Trailer.dc.html` (included) is a timed, cue-by-cue recording script — 8 cues, ~160 words, targeting the existing 78s cut, plus recording notes (mic setup, pacing, takes). Once Dr. Moss records it:

1. Mix the VO under the trailer's built-in cue timing (the script's timecodes already match the video's on-screen beats — no re-editing the visual should be needed).
2. Re-export via the design tool so the exported `.mp4` carries the mixed audio track.
3. Only then is `intro-trailer.mp4` ready for the click-to-play hero placement in §3. Until it exists, either hold that placement or drop in the video muted with a visible "🔊 tap for sound" affordance as a stopgap.

---

## 5 · Embed pattern

Plain HTML, no JS framework needed — matches the vanilla-SPA, no-build nature of `clerkship-hub-deploy`:

```html
<!-- Ambient / muted-loop placements (Day in the Life, Week Stingers, Tool Spotlight) -->
<video
  src="media/week-intro-3.mp4"
  autoplay muted loop playsinline
  aria-label="Week 3 preview: Psychotherapy & Personality — the therapeutic relationship, DBT-informed care, and safety planning."
  style="width:100%; max-width:960px; aspect-ratio:16/9; border-radius:12px; display:block;">
</video>

<!-- Click-to-play hero (Intro trailer, has voiceover) -->
<video
  src="media/intro-trailer.mp4"
  controls playsinline poster="media/intro-trailer-poster.jpg"
  style="width:100%; max-width:1200px; aspect-ratio:16/9; border-radius:12px; display:block;">
</video>
```

Suggested location: new `clerkship-hub-deploy/media/` folder, sibling to `tools/` and `audio/`. Generate each poster frame from the video's first frame (any `ffmpeg -ss 0 -i in.mp4 -frames:v 1 out.jpg` equivalent) — do not screenshot the `.dc.html` source for this, the exported `.mp4`'s actual first frame may differ slightly (fonts settle in over ~0.3s).

**Accessibility:** these are silent, text-driven motion pieces — anything conveyed only as on-screen text in the video (week titles/chips, tool names, timestamps) is invisible to screen readers. The `aria-label` above covers the gist; for the two reels and the trailer, also keep the equivalent information available as ordinary page text nearby (the week/tool pages already have this — the video is a supplement, not a replacement).

---

## 6 · Design tokens (already in the deployed shell — nothing new)

Ink `#2f2924` · warm paper `#f6f3ee` · terracotta `#c25a3c` / `#a84830` (dark) · teal `#2a6b5e` / `#1e5248` (dark) · gold/ochre `#7a6234` · Source Serif 4 (display/headings) · Source Sans 3 (body/UI). These match the tokens the shell already defines (`--accent`, `--primary`, etc. per `HANDOFF_README.md` §House style) — if you re-derive posters or any static frame, pull hex values from here, not by eyeballing the video.

---

## 7 · New `localStorage` keys

Each video persists its own scrub position while being edited in the design tool: `cw-intro`, `cw-day`, `cw-stingers` (or `cw-stinger-w1`…`cw-stinger-w6` for solo exports), `cw-tools` (or `cw-tool-1`…`cw-tool-6`). **These are design-tool-only keys** — they're irrelevant once you're embedding exported `.mp4` files (a plain `<video>` tag has no such state), so no action needed in the deployed app.

---

## 8 · Files in this package

- `Clerkship Hub Intro Video.dc.html` + `intro-video.jsx` — trailer source
- `VO Script - Hub Trailer.dc.html` — printable voiceover script for the trailer
- `Clerkship Day in the Life.dc.html` + `day-video.jsx` + `ios-frame.jsx` — day-in-the-life source
- `Week Intro Stingers.dc.html` + `weekstinger-video.jsx` — week bumpers source
- `Tool Spotlight Series.dc.html` + `toolspotlight-video.jsx` + `browser-window.jsx` — tool spotlight source
- `animations.jsx` — shared timeline engine all four are built on
- `support.js` — DC runtime (only needed if you open the `.dc.html` files directly in a browser to re-scrub/re-export; not part of the deployed app)

## 9 · Acceptance checklist

- [ ] All four `.mp4` exports obtained (or placeholders scaffolded, paths matching §2's filenames).
- [ ] `media/` folder added to `clerkship-hub-deploy`, videos placed per §3.
- [ ] Muted-loop videos actually have `muted` set (browsers block unmuted autoplay silently — a missing `muted` attr looks like a broken/frozen video, not an error).
- [ ] Intro trailer is click-to-play, not autoplay, once the VO is mixed in.
- [ ] `aria-label` / adjacent text present for each ambient video per §5.
- [ ] No new console errors on any page a video was added to.
- [ ] Regression: no existing page layout shifted by the added video block.
