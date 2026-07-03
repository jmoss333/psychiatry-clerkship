# Video library — drop exported .mp4s here

Source design files: `13_Faculty_Resources/Handoffs/Clerkship_video_handoff/` (intro trailer, day-in-the-life,
week stingers ×6, tool spotlights ×6 — built as Design Components on a timeline engine). Those `.dc.html` /
`.jsx` files are **design references, not production code** — they pull React/ReactDOM/Babel from `unpkg.com`
at load time, which is exactly the CDN-on-ward-wifi risk already fixed elsewhere in this repo (see
`marked.min.js`, vendored locally for the same reason). Do not embed the `.dc.html` files directly.

## What actually ships

Each video has a one-click **Export → Video** action in the design tool (Share menu, or the player's own
download button) that renders it to a real `.mp4` — a static asset, no React/Babel/CDN, no build step. That
`.mp4` is what belongs in this folder. This export step needs a human in the design tool (Dr. Moss, or
whoever owns this project); an agent cannot click the export button itself.

Drop each exported file in this folder using **exactly** these filenames, then rerun `build_deploy.py` —
`VIDEO_MEDIA` in that script copies whatever it finds here into `<deploy>/media/`, and the page embeds
already wired into `welcome.md`, `orientation.md`, `week1.md`–`week6.md`, and the six tool pages will pick
them up automatically. Nothing else needs to change.

| Filename | Source | Placement |
|---|---|---|
| `intro-trailer.mp4` | Clerkship Hub Intro Video | Hero, top of `welcome.md`. **Needs its voiceover mixed in first** — see `VO Script - Hub Trailer.dc.html` in the handoff package (8 cues, ~160 words, timecodes matched to the video's on-screen beats). Until the VO is mixed and re-exported, the hero still renders with `controls` (click-to-play) — it will just be silent. |
| `intro-trailer-poster.jpg` | first frame of the trailer, once exported | Poster for the hero video. Generate with `ffmpeg -ss 0 -i intro-trailer.mp4 -frames:v 1 intro-trailer-poster.jpg` — don't screenshot the `.dc.html` source, fonts settle in ~0.3s after the real first frame. |
| `day-in-the-life.mp4` | Clerkship Day in the Life | Inline in `orientation.md`, after the intro paragraph. Muted autoplay loop. |
| `week-intro-1.mp4` … `week-intro-6.mp4` | Week Intro Stingers, exported per-week (Tweaks panel → set `week` 1–6 → Export) | Small banner under the `<h1>` of `week1.md`–`week6.md`. Muted autoplay loop. |
| `week-stingers-reel.mp4` | Week Intro Stingers, full 36s reel | Optional showcase reel (not yet placed on a page). |
| `tool-spotlight-interview-circle.mp4` | Tool Spotlight Series, `only=1` | Collapsible "See it in action" panel on `tools/interview-circle.html`. |
| `tool-spotlight-capacity.mp4` | Tool Spotlight Series, `only=2` | Same, on `tools/capacity.html`. |
| `tool-spotlight-violence.mp4` | Tool Spotlight Series, `only=3` | Same, on `tools/violence.html`. |
| `tool-spotlight-withdrawal.mp4` | Tool Spotlight Series, `only=4` | Same, on `tools/withdrawal.html`. |
| `tool-spotlight-bfcrs.mp4` | Tool Spotlight Series, `only=5` | Same, on `tools/bfcrs.html`. |
| `tool-spotlight-decision-aids.mp4` | Tool Spotlight Series, `only=6` | Same, on `tools/decision-aids.html`. |
| `tool-spotlight-reel.mp4` | Tool Spotlight Series, full 88.5s reel | Optional showcase reel (not yet placed on a page). |

All are silent except the intro trailer — no audio track unless recorded and mixed in.

## Git LFS

`.mp4` is tracked via Git LFS (`.gitattributes`) and no longer gitignored — same treatment as the site's
`.m4a` audio. Just `git add` the files normally; LFS handles the rest. Budget the bandwidth the same way as
the audio migration (see `13_Faculty_Resources/_automation/GIT_AND_DEPLOY_PLAN.md` §6) — this adds up to 9
more video files on top of the existing 100 audio files pulled on every CI build.

## Until the files land here

`build_deploy.py` prints `video library: 0 of 17 assets found` and the `<video>` tags on the pages above
simply have nothing to play (found files are copied into `<deploy>/media/`, missing ones are silently
skipped — no broken build, no placeholder blobs). Nothing else in the site depends on these existing.
