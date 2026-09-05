# Video library — drop exported .mp4s here

Source design files: `13_Faculty_Resources/Handoffs/Clerkship_video_handoff/` (MS3: intro trailer,
day-in-the-life, week stingers ×6, tool spotlights ×6 · Resident: onboarding trailer — all built as Design
Components on a timeline engine). Those `.dc.html` / `.jsx` files are **design references, not production
code** — they pull React/ReactDOM/Babel from `unpkg.com` at load time, which is exactly the CDN-on-ward-wifi
risk already fixed elsewhere in this repo (see `marked.min.js`, vendored locally for the same reason). Do
not embed the `.dc.html` files directly.

## Resident onboarding trailer — wired differently from the rest

`resident-onboarding.mp4` + `resident-onboarding-poster.jpg` (from "Resident Onboarding Video.dc.html" /
"Yours to Run.", ~87s, silent/kinetic-text) are **resident-only**, so they're copied by
`resident_section.py` directly, not by `build_deploy.py`'s `VIDEO_MEDIA` list below — MS3 doesn't need a
copy riding along unused. Embed lives in `14_Tracks/Resident/resident_welcome.md` → resident's `welcome.md`,
hero placement, click-to-play as a linear "watch once" narrative, not an ambient loop.

## What actually ships

Each video has a one-click **Export → Video** action in the design tool (Share menu, or the player's own
download button) that renders it to a real `.mp4` — a static asset, no React/Babel/CDN, no build step. That
`.mp4` is what belongs in this folder. This export step needs a human in the design tool (Dr. Moss, or
whoever owns this project); an agent cannot click the export button itself.

Drop each active MS3 export in this folder using **exactly** the filenames below, then rerun
`build_deploy.py` — `VIDEO_MEDIA` in that script copies matching active files into `<deploy>/media/`.

## Retired MS3 intro provenance

`intro-trailer.mp4` and `intro-trailer-poster.jpg` are retained design provenance. They are not copied into
or referenced by a generated learner site. Restoring or remixing the retired intro requires a separate
approved work package.

| Filename | Source | Placement |
|---|---|---|
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

The active MS3 videos listed here are silent.

## Git LFS

`.mp4` is tracked via Git LFS (`.gitattributes`) and no longer gitignored — same treatment as the site's
`.m4a` audio. Just `git add` the files normally; LFS handles the rest. Budget the bandwidth the same way as
the audio migration (see `13_Faculty_Resources/_automation/GIT_AND_DEPLOY_PLAN.md` §6) — this adds up to 9
more video files on top of the existing 100 audio files pulled on every CI build.

## Until the files land here

`build_deploy.py` prints `video library: 0 of 15 assets found` and the `<video>` tags on the pages above
simply have nothing to play (found files are copied into `<deploy>/media/`, missing ones are silently
skipped — no broken build, no placeholder blobs). Nothing else in the site depends on these existing.
