# Prompt — Claude Design: intro-trailer poster frame

**Repo:** `~/Psychiatry-Clerkship-Library` (branch `fix/vendor-and-video-asset-deploy`)
**Design source files:** `13_Faculty_Resources/Handoffs/Clerkship_video_handoff/`
**Authoritative handoff:** `13_Faculty_Resources/Handoffs/HANDOFF_video-library.md`

---

## What is already shipped — do not redo

All four video files are committed to Git LFS and will be live after the next push:

| File | Location | Placed on |
|---|---|---|
| `intro-trailer.mp4` (20MB) | `_prototypes/video-library/` | Hero, top of `welcome.md` |
| `day-in-the-life.mp4` (17MB) | `_prototypes/video-library/` | Ambient loop in `orientation.md` |
| `week-stingers-reel.mp4` (3.7MB) | `_prototypes/video-library/` | Not yet placed on a page |
| `tool-spotlight-reel.mp4` (23MB) | `_prototypes/video-library/` | Not yet placed on a page |

Individual per-week and per-tool exports are **not in scope** — omit them.

Page embeds for the intro trailer and day-in-the-life are already wired in the source files. Do not edit any `*.md` or `*.html` files.

---

## One remaining task — intro-trailer poster frame

The intro trailer embed in `welcome.md` references `media/intro-trailer-poster.jpg`:

```html
<video src="media/intro-trailer.mp4" controls playsinline poster="media/intro-trailer-poster.jpg" …>
```

Without the poster, browsers show a black frame before the user presses play — functional but unfriendly. Generate it from the video's actual first frame:

```bash
cd ~/Psychiatry-Clerkship-Library
ffmpeg -ss 0 -i _prototypes/video-library/intro-trailer.mp4 -frames:v 1 -q:v 2 _prototypes/video-library/intro-trailer-poster.jpg
```

**If ffmpeg fails** (known broken `libx265` dependency on this machine): skip — the video plays fine without it. Do not screenshot the `.dc.html` source as a substitute; the animated first frame of the exported `.mp4` differs slightly.

If generated, add and commit:

```bash
git add _prototypes/video-library/intro-trailer-poster.jpg
git commit -m "feat: add intro-trailer poster frame"
```

Then rebuild both sites and confirm `hard:0`:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Verify `_build/ms3/media/intro-trailer-poster.jpg` exists in the output.

**Do not push or merge.**

---

## Voiceover (separate human task — out of scope here)

`VO Script - Hub Trailer.dc.html` in the handoff folder contains 8 timed cues (~160 words) for Dr. Moss to record. Once recorded and mixed, re-export the trailer and replace `_prototypes/video-library/intro-trailer.mp4` (LFS will handle the new binary). Until then the silent version is fine — the hero embed has `controls` so students can scrub it.
