"""Pages and tools that ship OUTSIDE site_manifest.json's shared lists.

WHY THIS MODULE EXISTS: "what ships" is not one list. site_manifest.json carries
the shared md/tools both learner sites publish, but four more routes reach a
built site without touching it:

  1. build_deploy.py copies the MS3 orientation video tool from _prototypes/.
  2. resident_section.py copies resident-only markdown (RES_EXTRA).
  3. resident_section.py copies three resident-only role-play tools (PROTO_TOOLS).
  4. resident_section.py copies the resident onboarding media
     (RESIDENT_ONBOARDING_MEDIA) into <deploy>/media/.

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
titles are the ones the two site navs use. RESIDENT_ONBOARDING_MEDIA is the
exception: its entries are ``(source path, built filename)`` pairs, because its
files are media the onboarding page plays, not pages, so they have no nav title.

Fifth route, deliberately NOT here: the Case-of-the-Week pages, which are
registry-driven and derived by cotw_slug.py.

The bottom of this module answers a different question -- not "which pages ship" but
"which files does a shipped TOOL render from". A tool's attestation hashes its .html;
the scenarios, packs and decks it fetches are separate files, and until 2026-09-24
no hash covered them (peer-review WP-5 #770 and WP-10 #773 found it). shipped_pages.py
records each one as an `extraSources` entry of every slug that renders it. Three of the
four routes are derived from lists the builds already use; TOOL_SHARED_DATA is the one
declared by hand, because for shared data the tool-to-file relation exists only inside
the tool's own fetch() call. test_shipped_pages.py reads those calls and fails when a
tool fetches data nothing here registers.

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
    "resident_tool_pack",
    "RESIDENT_TOOLS_WITH_PACK",
    "TOOL_DATA_SUFFIXES",
    "TOOL_SHARED_DATA",
    "TOOL_DATA_NOT_BOUND",
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


def resident_tool_pack(source):
    """The sibling content pack resident_section.py copies beside a resident tool.

    `<dir>/<name>.html` -> `<dir>/<name>.pack.json` (the _TEMPLATE.html convention). It
    ships only when the file exists; the tool fetches it as `./<name>.pack.json`.
    """
    return source[: -len(".html")] + ".pack.json"


# The resident tools whose sibling pack exists, and therefore ships. DECLARED rather than
# probed so shipped_pages.derive() stays a pure function of its producer files -- a fixture
# holding only the producers must derive the same listing as the repository.
# test_shipped_pages.py fails when this disagrees with the tree in either direction.
RESIDENT_TOOLS_WITH_PACK = ("rp-agitation.html", "rp-brief-psych.html")


# ---- the data a shipped tool renders -------------------------------------------
# Suffixes of a text data file a tool renders. A rider asset with any other suffix is
# code or media and stays OUT of the attestation manifest:
#   .js   -- code (sp-interview.voice.js: speech I/O and its error strings), like the
#            vendored React bundles;
#   .mp4  -- Git-LFS. The console hashes from the git tree, where an LFS file is its
#            ~133-byte pointer, while attestation_hash.py reads the smudged bytes on
#            disk, so the two digests could never agree;
#   .jpg  -- the orientation video's poster frame.
TOOL_DATA_SUFFIXES = (".json", ".vtt")

# Shared data files a tool reaches by relative URL, as
#   slug -> [(repo source, the name the tool fetches it by)].
# The build copies each to that name: build_deploy.py puts the four case/scenario files
# at the site root ("../x.json" from tools/) and the landmark deck at tools/quizzes.json;
# resident_section.py then overwrites the root reasoning_cases.json with
# reasoning_cases_resident.json, which is why a shared slug lists BOTH -- one per site,
# and the digest takes the union, like a resident page override.
TOOL_SHARED_DATA = {
    "communication-practice.html": [
        ("communication_cases.json", "communication_cases.json"),
    ],
    "diagnostic-reasoning.html": [
        ("reasoning_cases.json", "reasoning_cases.json"),
        ("reasoning_cases_resident.json", "reasoning_cases.json"),
    ],
    "family-systems.html": [
        ("family_systems_scenarios.json", "family_systems_scenarios.json"),
    ],
    "one-patient-six-weeks.html": [
        ("longitudinal_case.json", "longitudinal_case.json"),
    ],
    # The spaced-review deck renders cards from the landmark-trial quizzes and from all
    # three scenario sets, so an edit to any of them changes what it shows.
    "review.html": [
        ("07_Evidence_and_Reading/Landmark_Trials/quizzes.json", "quizzes.json"),
        ("communication_cases.json", "communication_cases.json"),
        ("family_systems_scenarios.json", "family_systems_scenarios.json"),
        ("reasoning_cases.json", "reasoning_cases.json"),
        ("reasoning_cases_resident.json", "reasoning_cases.json"),
    ],
    # tools/quizzes.json is the landmark deck, not _prototypes/canon-quiz/quizzes.json
    # (an unshipped local-preview copy that has drifted from it).
    "rp-canon-quiz.html": [
        ("07_Evidence_and_Reading/Landmark_Trials/quizzes.json", "quizzes.json"),
    ],
}

# Data a shipped tool fetches that is deliberately NOT an extraSource, with why.
# Both files are registries check_governance_separation.py reads PROMOTIONS from, and
# its L3 fails a promotion in a diff that also changes CONTENT. Registering either
# would make it content, so a legitimate attestation on attest/pending would fail L3
# against the very file it attests.
TOOL_DATA_NOT_BOUND = {
    "question_bank.json": (
        "attested item by item (status: attested); an attested item cannot change "
        "without a promotion, which Gate B confines to attest/pending"
    ),
    "topic_meta.json": (
        "each slug's own record is already a line in that slug's manifest "
        "(attestation_hash.manifest_for_slug); the whole file would drift review.html "
        "on every metadata edit anywhere"
    ),
}
