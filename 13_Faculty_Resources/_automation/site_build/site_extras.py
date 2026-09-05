"""Pages and tools that ship OUTSIDE site_manifest.json's shared lists.

WHY THIS MODULE EXISTS: "what ships" is not one list. site_manifest.json carries
the shared md/tools both learner sites publish, but three more routes reach a
built site without touching it:

  1. build_deploy.py copies the MS3 orientation video tool from _prototypes/.
  2. resident_section.py copies resident-only markdown (RES_EXTRA).
  3. resident_section.py copies three resident-only role-play tools (PROTO_TOOLS).

Until 2026-09 each list was a literal inside the build script that used it, so
nothing outside that script could enumerate the real shipped set without
executing a build -- and both build scripts have heavy import-time side effects
(directory deletion, file copies, a ledger validation that does not yet pass),
so nothing could. shipped_pages.py needs exactly these lists and must not
re-type them; hoisting them here is what makes the derivation a read rather
than a transcription.

Entries use the same 3-tuple shape as site_manifest.json --
``(source path relative to the repo root, built filename, display title)`` --
so a reader that already understands the manifest understands these too. The
titles are the ones the two site navs use.

Fourth route, deliberately NOT here: the Case-of-the-Week pages, which are
registry-driven and derived by cotw_slug.py.

DECISION: shipped-pages-single-source
"""

__all__ = [
    "MS3_ORIENT_VIDEO",
    "MS3_EXTRA_TOOLS",
    "RESIDENT_ONBOARDING_MEDIA",
    "RESIDENT_COTW_INDEX",
    "RESIDENT_TRACK_PAGES",
    "RESIDENT_EXTRA_PAGES",
    "RESIDENT_PROTO_TOOLS",
]

# ---- MS3-only: the orientation video tool and the media it plays ---------------
# The .html is a shipped, attestable tool; the three media files ride along with
# it and are not pages. build_deploy.py copies all four; shipped_pages.py takes
# the .html entries only (MS3_EXTRA_TOOLS below).
MS3_ORIENT_VIDEO = [
    (
        "_prototypes/orientation-video/orientation-video.html",
        "orientation-video.html",
        "Orientation Video",
    ),
    (
        "_prototypes/orientation-video/Inpatient_Psych_Orientation.mp4",
        "Inpatient_Psych_Orientation.mp4",
        None,
    ),
    (
        "_prototypes/orientation-video/Inpatient_Psych_Orientation.vtt",
        "Inpatient_Psych_Orientation.vtt",
        None,
    ),
    ("_prototypes/orientation-video/poster.jpg", "poster.jpg", None),
]

# The subset of the above that is a shipped tool rather than a media asset.
# resident_section.py strips these from the resident build, so they are MS3-only.
MS3_EXTRA_TOOLS = [entry for entry in MS3_ORIENT_VIDEO if entry[1].endswith(".html")]

# ---- resident-only onboarding media ("Yours to Run.", ~87s, silent/kinetic-text) ----
# Copied by resident_section.py into <deploy>/media/; not a page. welcome_compass.py
# derives the resident output contract from this list, so it is declared once.
RESIDENT_ONBOARDING_MEDIA = [
    ("_prototypes/video-library/resident-onboarding.mp4", "resident-onboarding.mp4"),
    ("_prototypes/video-library/resident-onboarding-poster.jpg", "resident-onboarding-poster.jpg"),
]

# ---- resident-only markdown ---------------------------------------------------
# Two of these deliberately reuse a slug the manifest already ships
# (cotw_index.md, welcome.md): the resident build OVERWRITES the inherited MS3
# page rather than adding a new one, so they are not new shipped pages. The
# other six are resident-only and ship nowhere else.
#
# Split in two because the Case-of-the-Week resident pages are spliced in
# between the index override and the track pages, exactly as they were before
# this list was hoisted out of resident_section.py.
RESIDENT_COTW_INDEX = [
    (
        "08_Cases_and_Simulation/case-of-the-week/index_resident.md",
        "cotw_index.md",
        "Index — All Cases",
    ),
]

RESIDENT_TRACK_PAGES = [
    ("14_Tracks/Resident/resident_welcome.md", "welcome.md", "Welcome to the Rotation"),
    ("14_Tracks/Resident/resident_curriculum.md", "rotation.md", "4-Week Rotation Plan"),
    (
        "14_Tracks/Resident/adv_psychopharmacology.md",
        "adv_psychopharm.md",
        "Advanced Psychopharmacology",
    ),
    (
        "14_Tracks/Resident/systems_medlegal.md",
        "systems_medlegal.md",
        "Inpatient Systems & Med-Legal",
    ),
    (
        "14_Tracks/Resident/supervision_teaching.md",
        "supervision_teaching.md",
        "Supervision, EPAs & Teaching",
    ),
    ("14_Tracks/Resident/canon_200.md", "canon_200.md", "The Psychiatry Canon (200)"),
    (
        "14_Tracks/Resident/cl_reference.md",
        "cl_reference.md",
        "C-L: Emergencies, Tox & Capacity (Numbers)",
    ),
]

RESIDENT_EXTRA_PAGES = RESIDENT_COTW_INDEX + RESIDENT_TRACK_PAGES

# ---- resident-only prototype tools --------------------------------------------
# These DO ship: they are in _build/res/tools/ on every resident deploy. They are
# not in site_manifest.json's shared tools list because the MS3 site does not
# serve them. surface_governance.py's _ADDITIONAL_TOOL_SOURCES and
# validate_tool_governance.py's SITE_EXTRAS carry the same three source paths for
# their own purposes; those are Phase-2 migrations (ADR-002).
RESIDENT_PROTO_TOOLS = [
    (
        "_prototypes/agitation-trainer/rp-agitation.html",
        "rp-agitation.html",
        "Agitation Ladder — PRN Trainer",
    ),
    (
        "_prototypes/brief-psych/rp-brief-psych.html",
        "rp-brief-psych.html",
        "Five Good Minutes — Brief Psych Coach",
    ),
    (
        "_prototypes/canon-quiz/rp-canon-quiz.html",
        "rp-canon-quiz.html",
        "Canon Quiz — 200-Paper Spine",
    ),
    # Post-Event Learning Huddle (2026-09-04): single-file, no pack.json, no storage,
    # no requests. Design: docs/superpowers/specs/2026-09-04-post-event-learning-huddle-design.md
    (
        "_prototypes/post-event-huddle/rp-post-event-huddle.html",
        "rp-post-event-huddle.html",
        "Post-Event Learning Huddle (2 min)",
    ),
]
