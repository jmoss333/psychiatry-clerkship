"""Pages and tools that ship OUTSIDE site_manifest.json's shared lists.

WHY THIS MODULE EXISTS: "what ships" is not one list. site_manifest.json carries
the shared md/tools both learner sites publish, but more routes reach a built
site without touching it:

  1. MS3-only tools (MS3_EXTRA_TOOLS). Empty since 2026-09-25, when the MS3
     orientation video tool (_prototypes/orientation-video/) was retired from
     both sites along with the welcome and orientation videos; the route is
     kept so a future MS3-only tool has one declared home.
  2. resident_section.py copies resident-only markdown (RES_EXTRA).
  3. resident_section.py copies the resident-only role-play tools (PROTO_TOOLS).

Until 2026-09 each list was a literal inside the build script that used it, so
nothing outside that script could enumerate the real shipped set without
executing a build -- and both build scripts have heavy import-time side effects
(directory deletion, file copies, a ledger validation that does not yet pass),
so nothing could. shipped_pages.py needs exactly these lists and must not
re-type them; hoisting them here is what makes the derivation a read rather
than a transcription.

Page and tool entries use the same 3-tuple shape as site_manifest.json --
``(source path relative to the repo root, built filename, display title)`` --
so a reader that already understands the manifest understands these too. The
titles are the ones the two site navs use.

Fifth route, deliberately NOT here: the Case-of-the-Week pages, which are
registry-driven and derived by cotw_slug.py.

DECISION: shipped-pages-single-source
"""

__all__ = [
    "MS3_EXTRA_TOOLS",
    "RESIDENT_COTW_INDEX",
    "RESIDENT_TRACK_PAGES",
    "RESIDENT_EXTRA_PAGES",
    "RESIDENT_PROTO_TOOLS",
]

# ---- MS3-only tools ---------------------------------------------------------------
# Shipped, attestable tools the MS3 site serves and the resident build does not.
# resident_section.py strips these from the resident build. Empty since 2026-09-25:
# the orientation video tool it held was retired with the welcome/orientation videos.
MS3_EXTRA_TOOLS = []

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
# serve them. surface_governance.py and validate_tool_governance.py used to carry
# hand-synced copies of these source paths (_ADDITIONAL_TOOL_SOURCES, SITE_EXTRAS);
# both were migrated to shipped_pages.json in ADR-002 Phase 2 and deleted, so this
# is now the only place the resident-only tool sources are written down.
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
