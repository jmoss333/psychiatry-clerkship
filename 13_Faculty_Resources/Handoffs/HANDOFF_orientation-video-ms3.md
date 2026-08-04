# Handoff — Orientation Video: move to MS3, remove from Resident

**For:** Claude Cowork / Claude Code — repo `jmoss333/psychiatry-clerkship`
**Prepared:** 2026-07-03 · for Joshua Moss, MD
**Source of the full investigation trail:** `Video-and-Repo-Incorporation-Plan_2026-07-03.md` in the design project — this file is the trimmed, ready-to-execute version of that finding.

---

## ⚠️ Read before applying any handoff in this package

Everything below edits **library source + build scripts**, never a deploy folder directly. `clerkship-hub-deploy` and `mmc-resident-deploy` are **generated output** — `build_deploy.py` starts with `shutil.rmtree(OUT)`, so a hand-edit to the deploy folder is silently destroyed on the next rebuild. Edit the numbered-folder source and the two scripts under `13_Faculty_Resources/_automation/site_build/`, then rebuild. (Earlier handoffs in this package — tool launcher badges, UX concepts — predate this discovery and were written against `clerkship-hub-deploy/` directly; re-target them the same way before applying.)

## Summary

- The orientation video (`_prototypes/orientation-video/` — NotebookLM AI-narrated, ~7:51, captions + transcript + chapters already built) is currently wired into the **Resident** build only (`resident_section.py`), not MS3.
- Its own narration is MS3-scoped ("welcome to your inpatient psychiatry **clerkship**") — it belongs on MS3. Moving it, not duplicating it.
- Independent bug found in the process: the current Resident wiring copies only `orientation-video.html` into `tools/`, never the `.mp4`/`.vtt`/`poster.jpg` it references — the deployed player 404s on its own video today. This handoff fixes that by wiring the assets correctly on the MS3 side, rather than patching it in place on Resident.

## Why (context)

`Design-Plan-Alignment-and-Video_2026-07-02.md` (now archived at 99_Archive/root-planning-2026-07/) evaluated this video *for the MS3 `orientation.md` page*. It ended up wired into `resident_section.py`'s `PROTO_TOOLS` instead — likely grouped in with the other 3 hand-built resident prototypes (`rp-agitation`, `rp-brief-psych`, `rp-canon-quiz`) without re-checking audience fit.

## Changes

### 1. `13_Faculty_Resources/_automation/site_build/build_deploy.py` — ADD

Insert immediately after the existing tool-copy loop (`for src,dst,_ in tools: shutil.copy2(...)`):
```python
# ---- orientation video (MS3 "start here") ----
ORIENT_VIDEO=[
 ("_prototypes/orientation-video/orientation-video.html","orientation-video.html"),
 ("_prototypes/orientation-video/Inpatient_Psych_Orientation.mp4","Inpatient_Psych_Orientation.mp4"),
 ("_prototypes/orientation-video/Inpatient_Psych_Orientation.vtt","Inpatient_Psych_Orientation.vtt"),
 ("_prototypes/orientation-video/poster.jpg","poster.jpg"),
]
for src,dst in ORIENT_VIDEO:
    p=os.path.join(LIB,src)
    if os.path.exists(p): shutil.copy2(p, OUT+"/tools/"+dst)
    else: print("  WARN: orientation video asset missing from source:",src)
```

Change the `"Start here"` section of `nav=[...]` from:
```python
{"section":"Start here","items":[{"t":"Welcome to the Rotation","f":"welcome.md","k":"md"},{"t":"Core Reading List","f":"core_readings.md","k":"md"},{"t":"Orientation Packet","f":"orientation.md","k":"md"}]},
```
to:
```python
{"section":"Start here","items":[{"t":"Orientation Video (start here)","f":"orientation-video.html","k":"tool"},{"t":"Welcome to the Rotation","f":"welcome.md","k":"md"},{"t":"Core Reading List","f":"core_readings.md","k":"md"},{"t":"Orientation Packet","f":"orientation.md","k":"md"}]},
```

In `build_search_index()`, add to the `TOOLKW` dict:
```python
"orientation-video.html":"orientation video start here inpatient unit welcome introduction onboarding tour first day",
```

### 2. `13_Faculty_Resources/_automation/site_build/resident_section.py` — REMOVE

Delete the orientation-video line from `PROTO_TOOLS`:
```python
PROTO_TOOLS=[
 ("_prototypes/agitation-trainer/rp-agitation.html","rp-agitation.html"),
 ("_prototypes/brief-psych/rp-brief-psych.html","rp-brief-psych.html"),
 ("_prototypes/canon-quiz/rp-canon-quiz.html","rp-canon-quiz.html"),
]
```
Delete its entry from the `"Start here"` section of `nav` (keep `welcome.md`, `rotation.md`, `core_readings.md`). Delete its line from `TOOLKW`.

Because `resident_section.py` opens with `shutil.copytree(MS3, OUT)`, the 4 files would otherwise ride along unused post-move (~35MB dead weight, eats the Git LFS quota flagged in `GIT_AND_DEPLOY_PLAN.md` §6). Strip them explicitly right after the copytree line:
```python
for _f in ["orientation-video.html","Inpatient_Psych_Orientation.mp4","Inpatient_Psych_Orientation.vtt","poster.jpg"]:
    _p=os.path.join(OUT,"tools",_f)
    if os.path.exists(_p): os.remove(_p)
```

### 3. Git LFS — track the new binary

`Inpatient_Psych_Orientation.mp4` is ~35MB. Track it exactly like the existing `.m4a` audio (`GIT_AND_DEPLOY_PLAN.md` §6):
```bash
git lfs track "*.mp4"
```
Confirm `*.mp4` isn't still excluded in `.gitignore` — the audio types were explicitly un-ignored there when LFS was set up; `.mp4` needs the same treatment.

### 4. `13_Faculty_Resources/reviewed.json` — attest

Add, alongside the other `.html` tool entries:
```json
  "orientation-video.html": {
    "status": "reviewed",
    "at": "2026-07-03",
    "by": "Joshua Moss, MD"
  },
```

### 5. `_prototypes/orientation-video/orientation-video.html` — sync status

Its own `[RC-META]` tag currently reads `status="draft-pending-attestation"` — update to `status="reviewed"` so the source tag and the ledger agree.

## Verification / acceptance checklist

- [ ] Test-rebuild MS3 (`OUT_DIR=/tmp/ms3-test python3 build_deploy.py`) — `/tmp/ms3-test/tools/orientation-video.html` + its 3 siblings exist; `nav.json`'s `"Start here"` lists it first.
- [ ] Open the built `orientation-video.html` directly — video plays (not a 404), captions toggle, chapters jump, transcript scroll-syncs.
- [ ] Rebuild resident after — `orientation-video.html` and its 3 siblings are **absent** from the resident output's `tools/`; resident `nav.json`'s `"Start here"` no longer lists it.
- [ ] `git lfs ls-files` shows the `.mp4` tracked, not a raw blob.
- [ ] MS3 search surfaces it for "orientation video" / "first day"; resident search does not.
- [ ] No dangling reference to `orientation-video.html` left in any resident-only content page.

## Rollback

Revert the 3 changed files (`build_deploy.py`, `resident_section.py`, `reviewed.json`) via git — no destructive or irreversible step; the source video at `_prototypes/orientation-video/` is untouched throughout.
