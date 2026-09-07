# MS3 Six-Week Compass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the unused silent MS3 Welcome trailer with a semantic, accessible six-card
rotation map sourced from the canonical curriculum; preserve an optional captioned orientation
route; retire the old trailer from both generated sites; and leave the revised Welcome visibly
pending until a named faculty reviewer makes a separate attestation decision.

**Architecture:** A pure Python renderer owns validation, safety-copy extraction, HTML escaping,
and marker replacement. curriculum.json owns each card's week number, title, and landingRef.
shipped_pages.json is the derived authority for whether each landingRef is an MS3 Markdown page.
build_deploy.py loads those sources once, injects the component into only the generated MS3
welcome.md, derives the hidden MS3 week navigation from the same card records, and fails closed on
any mismatch. The resident builder replaces Welcome as it does today and adds a final isolation
assertion. Component-scoped CSS provides the responsive layout; Playwright verifies the rendered
DOM and measured geometry.

**Tech Stack:** Python 3 standard library, JSON Schema draft-07, static Markdown plus semantic HTML,
Clinical Warm CSS tokens, Node.js node:test, Playwright/Chromium, the existing dual-site build and
Netlify QA gates.

**Spec:** docs/superpowers/specs/2026-09-04-ms3-six-week-compass-design.md

## Plain-language implementation

The build will replace one invisible marker in the Welcome source with six ordinary web cards.
The cards are real text and links, so they still work with zoom, a keyboard, a screen reader, dark
mode, or no video. The safety sentence is copied from the marked Orientation Packet text at build
time, not retyped. If a week route, safety marker, video file, or audience boundary is wrong, the
build stops instead of publishing a partial or misleading page.

## Global Constraints

- Work only in the isolated worktree
  /Users/jm/Psychiatry-Clerkship-Library/.worktrees/ms3-six-week-compass-design on branch
  codex/ms3-six-week-compass-design. Preserve unrelated changes in every other checkout.
- The implementation baseline is origin/main commit
  7eb4ace0301e163139208e8dc9f05b3aab5f79ea plus the approved specification on this branch.
  Before Task 1, run git status --short --branch and stop if the worktree contains changes not
  described by this plan.
- Do not edit generated files under _build by hand. Every generated assertion runs after its source
  build.
- Do not add a direct read of site_manifest.json or cotw_registry.json for the new Compass
  contract. Use load_shipped_pages() from site_build/shipped_pages.py. The build script remains an
  existing producer and may continue its current manifest read.
- Do not add or remove a shipped page producer. welcome.md, week1.md through week6.md, and
  orientation-video.html are already represented in shipped_pages.json.
- Do not change CLAUDE.md or AGENTS.md. If an unforeseen instruction edit becomes necessary, update
  CLAUDE.md first and byte-copy it to AGENTS.md in the same commit.
- Do not add crisis-block markers to Welcome, crisis numbers to source copy, protected instrument
  text, dose literals, PHI, patient/staff/unit photography, analytics, storage, scoring, progress,
  readiness inference, or entrustment inference.
- Do not edit the visible Single Safety Rule. Only add the two invisible source-boundary comments.
- Do not edit resident_welcome.md, resident onboarding media, visual-regression.spec.js,
  playwright.config.js, ci.yml, or a stored visual baseline.
- Keep the existing orientation player controls-first and non-autoplay. Do not edit its MP4, VTT,
  transcript code, poster, chapters, or player copy in this work package.
- Do not create an Adobe, Canva, Netlify, or GitHub external artifact while executing Tasks 1-7.
  The Adobe and release work in Task 8 is a separately authorized human gate.
- Every code task is test-first: add a failing test, run it and confirm the stated failure, make the
  smallest implementation, rerun to green, then commit only the listed paths.
- Build the sites sequentially: MS3 first, resident second. Never run the two site builders in
  parallel because the resident build consumes the MS3 output.
- A green build proves technical integrity only. It does not restore faculty review, authorize a
  pilot, permit learner release, or establish clinical readiness.

## File and responsibility map

| File | Responsibility in this plan |
|---|---|
| 13_Faculty_Resources/_automation/site_build/welcome_compass.py | The only Compass validation/rendering owner; pure functions plus final build assertions |
| 13_Faculty_Resources/_automation/site_build/test_welcome_compass.py | Unit tests for marker cardinality, escaping, week validation, nav parity, media integrity, and audience isolation |
| curriculum.json | Canonical MS3 week number, title, and landingRef |
| curriculum.schema.json | Allows landingRef on a week and requires it on every MS3 week only |
| 13_Faculty_Resources/_automation/validate_curriculum.py | Pre-build rejection of an invalid Compass projection using shipped_pages.json |
| 13_Faculty_Resources/_automation/test_validate_curriculum.py | Synthetic contract tests for valid, absent, duplicate, non-page, and unshipped landingRef values |
| 14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md | Human-readable authority for the marked Single Safety Rule; visible words unchanged |
| 13_Faculty_Resources/Outreach/MS3_Inpatient_Rotation_OnePager.md | One Compass marker plus retained Welcome prose; no card duplication or intro-video embed |
| topic_meta.json | Approved first-visit summary for welcome.md |
| 13_Faculty_Resources/reviewed.json | Pending/general/low record while revised Welcome awaits faculty review |
| 13_Faculty_Resources/_automation/site_build/build_deploy.py | Load once, inject once, derive nav once, require orientation package, and assert final MS3 output |
| 13_Faculty_Resources/_automation/site_build/resident_section.py | Assert final resident Welcome has no Compass and keeps resident onboarding |
| _prototypes/video-library/README.md | Accurately records the MS3 intro as retained provenance, not a live hero awaiting voiceover |
| media_manifest.json | Exact unserved retirement record for the retained intro source and poster |
| 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css | Component-scoped Clinical Warm styling and container-query layout |
| tests/welcome-compass-contract.test.mjs | Tracked-source, metadata, governance, and retirement contracts |
| tests/smoke/front-door.spec.js | Final semantic, keyboard, theme, reduced-motion, target-size, and measured-layout behavior |
| 13_Faculty_Resources/_automation/site_build/build_and_check.sh | Makes the two new Python suites part of every Netlify and CI-backed site build |
| bin/verify.sh | Makes both new unit suites visible in the fast local verification inventory |

---

### Task 1: Create the pure Compass contract and renderer

**Files:**

- Create: 13_Faculty_Resources/_automation/site_build/welcome_compass.py
- Create: 13_Faculty_Resources/_automation/site_build/test_welcome_compass.py
- Modify: 14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md

**Interfaces:**

- Consumes: learningPaths.ms3.weeks from curriculum.json; the parsed shipped_pages.json document;
  Orientation Packet Markdown; Welcome Markdown; finalized nav objects.
- Produces:
  - CompassContractError
  - CompassCard(n: int, title: str, landing_ref: str)
  - prepare_cards(ms3_weeks, shipped_document) -> tuple[CompassCard, ...]
  - extract_safety_rule(packet_markdown: str) -> str
  - render_compass(cards, safety_text: str) -> str
  - inject_compass(welcome_markdown: str, fragment: str) -> tuple[str, bool]
  - assert_nav_projection(nav, cards) -> None
- Stable constants:
  - COMPASS_MARKER = "<!-- ms3-six-week-compass -->"
  - SAFETY_START = "<!-- single-safety-rule:start -->"
  - SAFETY_END = "<!-- single-safety-rule:end -->"
  - LFS_HEADER = b"version https://git-lfs"

- [ ] **Step 1: Add failing unit tests.** Cover all of the following in
  test_welcome_compass.py:

  1. six valid, ordered cards are accepted;
  2. wrong count, missing/reordered/boolean week number, blank title, missing/blank/duplicate
     landingRef, an HTML tool target, a resident-only target, and an unknown target raise
     CompassContractError with the failing field in the message;
  3. one correctly marked safety block normalizes line breaks and repeated whitespace to the exact
     approved sentence;
  4. missing, repeated, reversed, empty, and nested safety markers raise targeted errors;
  5. one Welcome marker is replaced and zero or two markers fail;
  6. title and extracted-text payloads containing ampersands, angle brackets, double quotes, and
     apostrophes are HTML-escaped;
  7. the rendered fragment contains exactly one root, one safety note, one scope element, one
     labelled section, one ordered list, six ordered card attributes, six exact links, one prompt,
     and one optional-video link;
  8. the fragment does not contain theme, focusCategories, items, minutes, progress, complete,
     score, protocol steps, storage, script, style, video, or img markup;
  9. the final nav projection accepts each week exactly once as hidden Markdown with title
     "Week N — {canonical title}" and rejects missing, duplicate, wrong-kind, visible, or
     mismatched-title rows.

  Use an in-memory shipped document with page rows for week1.md through week6.md on site ms3 and
  negative rows for one HTML tool and one resident-only page. Do not read the real curriculum from
  these unit tests.

- [ ] **Step 2: Run the new suite and confirm the red state.**

  ~~~bash
  python3 13_Faculty_Resources/_automation/site_build/test_welcome_compass.py
  ~~~

  Expected: non-zero with ModuleNotFoundError naming welcome_compass because the implementation
  module does not yet exist.

- [ ] **Step 3: Implement the pure types and card validation.** Use a frozen dataclass and reject
  malformed inputs before rendering:

  ~~~python
  from dataclasses import dataclass
  from html import escape

  COMPASS_MARKER = "<!-- ms3-six-week-compass -->"
  SAFETY_START = "<!-- single-safety-rule:start -->"
  SAFETY_END = "<!-- single-safety-rule:end -->"
  LFS_HEADER = b"version https://git-lfs"

  class CompassContractError(ValueError):
      pass

  @dataclass(frozen=True)
  class CompassCard:
      n: int
      title: str
      landing_ref: str

  def prepare_cards(ms3_weeks, shipped_document):
      if not isinstance(ms3_weeks, list) or len(ms3_weeks) != 6:
          raise CompassContractError("MS3 Compass requires exactly six weeks")
      pages = shipped_document.get("pages") if isinstance(shipped_document, dict) else None
      if not isinstance(pages, list):
          raise CompassContractError("shipped_pages.json must contain pages")
      by_slug = {}
      for page in pages:
          if not isinstance(page, dict) or not isinstance(page.get("slug"), str):
              raise CompassContractError("shipped_pages.json contains a malformed page")
          if page["slug"] in by_slug:
              raise CompassContractError("shipped_pages.json contains duplicate slug %s" % page["slug"])
          by_slug[page["slug"]] = page

      cards = []
      seen_refs = set()
      for expected_n, week in enumerate(ms3_weeks, start=1):
          if not isinstance(week, dict):
              raise CompassContractError("MS3 week %d must be an object" % expected_n)
          n = week.get("n")
          if isinstance(n, bool) or n != expected_n:
              raise CompassContractError(
                  "MS3 Compass week numbers must be exactly 1..6 in order"
              )
          title = week.get("title")
          if (
              not isinstance(title, str)
              or not title.strip()
              or title != title.strip()
          ):
              raise CompassContractError(
                  "MS3 week %d title must be a non-empty trimmed string" % n
              )
          landing_ref = week.get("landingRef")
          if (
              not isinstance(landing_ref, str)
              or not landing_ref.strip()
              or landing_ref != landing_ref.strip()
          ):
              raise CompassContractError(
                  "MS3 week %d landingRef must be a non-empty trimmed string" % n
              )
          if landing_ref in seen_refs:
              raise CompassContractError("MS3 landingRef %s is duplicated" % landing_ref)
          seen_refs.add(landing_ref)
          page = by_slug.get(landing_ref)
          if (
              page is None
              or page.get("kind") != "page"
              or "ms3" not in (page.get("sites") or [])
              or not landing_ref.endswith(".md")
          ):
              raise CompassContractError(
                  "MS3 week %d landingRef %s is not a shipped MS3 Markdown page"
                  % (n, landing_ref)
              )
          cards.append(CompassCard(n=n, title=title, landing_ref=landing_ref))
      return tuple(cards)
  ~~~

- [ ] **Step 4: Implement exact marker extraction and replacement.** Normalize only whitespace;
  never alter or infer clinical wording:

  ~~~python
  def extract_safety_rule(packet_markdown):
      if packet_markdown.count(SAFETY_START) != 1 or packet_markdown.count(SAFETY_END) != 1:
          raise CompassContractError(
              "Single Safety Rule requires exactly one start marker and one end marker"
          )
      start = packet_markdown.index(SAFETY_START) + len(SAFETY_START)
      end = packet_markdown.index(SAFETY_END)
      if end <= start:
          raise CompassContractError("Single Safety Rule markers are reversed or nested")
      body = packet_markdown[start:end]
      if SAFETY_START in body or SAFETY_END in body:
          raise CompassContractError("Single Safety Rule markers may not be nested")
      normalized = " ".join(body.split())
      if not normalized:
          raise CompassContractError("Single Safety Rule marked block is empty")
      return normalized

  def inject_compass(welcome_markdown, fragment):
      count = welcome_markdown.count(COMPASS_MARKER)
      if count != 1:
          raise CompassContractError(
              "MS3 Welcome requires exactly one Compass marker; found %d" % count
          )
      rendered = welcome_markdown.replace(COMPASS_MARKER, fragment, 1)
      if COMPASS_MARKER in rendered:
          raise CompassContractError("MS3 Compass marker remained after injection")
      return rendered, True
  ~~~

- [ ] **Step 5: Implement the exact semantic renderer and nav assertion.** Keep all instructional
  copy as module constants matching the approved specification. Build list items only from
  CompassCard values and pass every title, link, and extracted sentence through html.escape with
  quote=True. The renderer must emit this structure and no inline style or script:

  ~~~html
  <div data-ms3-compass-root>
    <aside data-ms3-compass-safety role="note">
      <p>If you are worried about immediate safety, tell the resident or attending now. Do not wait for rounds. Do not carry it alone.</p>
      <a href="?page=orientation.md">Open the Orientation Packet</a>
    </aside>
    <p data-ms3-compass-scope>This map supports orientation, supervised practice, and reflection. It is not a checklist, clinical protocol, or measure of readiness. Using or viewing this map does not establish competence, entrustment, or permission to act independently.</p>
    <section class="ms3-compass" data-ms3-compass aria-labelledby="ms3-compass-title">
      <h2 id="ms3-compass-title">Six-Week Compass</h2>
      <ol class="ms3-compass__weeks" data-ms3-compass-weeks>
        <li data-ms3-compass-week="1"><span>Week 1</span><h3>Foundations &amp; the MSE</h3><a data-ms3-compass-link href="?page=week1.md">Open Week 1</a></li>
        <li data-ms3-compass-week="2"><span>Week 2</span><h3>Mood, Psychosis &amp; Pharm</h3><a data-ms3-compass-link href="?page=week2.md">Open Week 2</a></li>
        <li data-ms3-compass-week="3"><span>Week 3</span><h3>Psychotherapy &amp; Personality</h3><a data-ms3-compass-link href="?page=week3.md">Open Week 3</a></li>
        <li data-ms3-compass-week="4"><span>Week 4</span><h3>Family Systems &amp; EE</h3><a data-ms3-compass-link href="?page=week4.md">Open Week 4</a></li>
        <li data-ms3-compass-week="5"><span>Week 5</span><h3>Acute &amp; Emergency</h3><a data-ms3-compass-link href="?page=week5.md">Open Week 5</a></li>
        <li data-ms3-compass-week="6"><span>Week 6</span><h3>Integration &amp; Exam</h3><a data-ms3-compass-link href="?page=week6.md">Open Week 6</a></li>
      </ol>
    </section>
    <p data-ms3-compass-prompt>Choose the week or task you are preparing to discuss with your supervising team.</p>
    <a data-ms3-compass-orientation href="?tool=orientation-video.html">Optional: watch the captioned orientation overview (transcript available)</a>
  </div>
  ~~~

  Each generated list item is exactly:

  ~~~python
  (
      '<li data-ms3-compass-week="%d"><span>Week %d</span>'
      '<h3>%s</h3><a data-ms3-compass-link href="?page=%s">Open Week %d</a></li>'
      % (
          card.n,
          card.n,
          escape(card.title, quote=True),
          escape(card.landing_ref, quote=True),
          card.n,
      )
  )
  ~~~

  assert_nav_projection() must flatten nav section items and require exactly one matching row for
  each landing_ref with k equal to md, hidden equal to True, and t equal to
  "Week %d — %s" % (card.n, card.title).

- [ ] **Step 6: Add the two invisible comments around the existing visible safety text.**

  ~~~markdown
  <!-- single-safety-rule:start -->
  If you are worried about immediate safety, tell the resident or attending now.
  Do not wait for rounds. Do not carry it alone.
  <!-- single-safety-rule:end -->
  ~~~

  Verify that git diff --word-diff shows no changed visible word between the comments.

- [ ] **Step 7: Run the unit suite and confirm green.**

  ~~~bash
  python3 13_Faculty_Resources/_automation/site_build/test_welcome_compass.py
  git diff --check
  ~~~

  Expected final line: all unittest cases pass. Expected git diff --check output: empty.

- [ ] **Step 8: Commit Task 1.**

  ~~~bash
  git add 13_Faculty_Resources/_automation/site_build/welcome_compass.py \
    13_Faculty_Resources/_automation/site_build/test_welcome_compass.py \
    14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md
  git commit -m "feat(ms3): add pure six-week compass renderer"
  ~~~

### Task 2: Add canonical landing routes and pre-build validation

**Files:**

- Modify: curriculum.schema.json
- Modify: curriculum.json
- Modify: 13_Faculty_Resources/_automation/validate_curriculum.py
- Modify: 13_Faculty_Resources/_automation/test_validate_curriculum.py
- Verify only: tests/shipped-pages-readers.test.mjs

**Interfaces:**

- Consumes: prepare_cards() from Task 1 and
  site_build/shipped_pages.load_shipped_pages(root).
- Produces: optional week.landingRef in the shared schema, required on every MS3 week; six exact
  MS3 values week1.md through week6.md; a fifth optional validator CLI argument naming the
  shipped-pages fixture root for isolated tests.
- Does not migrate validate_curriculum.py's existing Phase-2 manifest logic. The new landingRef
  validation alone uses the derived shipped-page document, so this task neither adds a direct
  producer read nor expands the frozen direct-reader allowlist.

- [ ] **Step 1: Extend the synthetic curriculum fixture before adding production data.** Change
  _weeks() so only the MS3 fixture receives landingRef by default:

  ~~~python
  def _weeks(count, first_items=None, landing_refs=False):
      weeks = []
      for n in range(1, count + 1):
          week = {
              "n": n,
              "title": "T%d" % n,
              "theme": "Th%d" % n,
              "focusCategories": ["safety"],
              "items": list(first_items or []) if n == 1 else [],
          }
          if landing_refs:
              week["landingRef"] = "week%d.md" % n
          weeks.append(week)
      return weeks
  ~~~

  In _curriculum(), call _weeks(6, items, landing_refs=True) for ms3 and leave resident at
  _weeks(4). In _write(), create a synthetic
  13_Faculty_Resources/_automation/site_build/shipped_pages.json under the temporary root with
  version 1 and six kind "page" rows whose sites include "ms3". Make _run() pass that temporary
  root as validator argument 5.

- [ ] **Step 2: Add failing validator tests.** Add tests that reject each of these independently:

  - missing landingRef on one MS3 week;
  - empty or non-string landingRef;
  - duplicated landingRef;
  - unshipped ghost.md;
  - a kind "tool" HTML target;
  - a page whose sites are only ["res"].

  Add one passing test proving all six MS3 landingRef values are accepted and the resident path
  remains valid without landingRef.

- [ ] **Step 3: Run the focused tests and confirm red.**

  ~~~bash
  python3 13_Faculty_Resources/_automation/test_validate_curriculum.py
  ~~~

  Expected: the new negative tests fail because the current validator ignores landingRef.

- [ ] **Step 4: Extend the schema.** Add this optional property to definitions.week:

  ~~~json
  "landingRef": { "type": "string", "minLength": 1 }
  ~~~

  In properties.learningPaths.properties.ms3.allOf[1].properties.weeks, keep minItems and maxItems
  at 6 and add an items allOf that references definitions.week and requires landingRef:

  ~~~json
  "items": {
    "allOf": [
      { "$ref": "#/definitions/week" },
      { "required": ["landingRef"] }
    ]
  }
  ~~~

  Do not require landingRef in definitions.week or on the resident learning path.

- [ ] **Step 5: Add the six canonical data values.**

  ~~~text
  Week 1 -> "landingRef": "week1.md"
  Week 2 -> "landingRef": "week2.md"
  Week 3 -> "landingRef": "week3.md"
  Week 4 -> "landingRef": "week4.md"
  Week 5 -> "landingRef": "week5.md"
  Week 6 -> "landingRef": "week6.md"
  ~~~

  Do not change n, title, theme, focusCategories, or items.

- [ ] **Step 6: Wire the validator to the derived shipped-page contract.** Add the site_build
  directory to sys.path, import CompassContractError and prepare_cards from welcome_compass, and
  import ShippedPagesError and load_shipped_pages from shipped_pages. Read the optional fifth CLI
  argument as shipped_root, defaulting to REPO:

  ~~~python
  SITE_BUILD = os.path.join(HERE, "site_build")
  if SITE_BUILD not in sys.path:
      sys.path.insert(0, SITE_BUILD)

  from shipped_pages import ShippedPagesError, load_shipped_pages  # noqa: E402
  from welcome_compass import CompassContractError, prepare_cards  # noqa: E402
  ~~~

  ~~~python
  shipped_root = argv[4] if len(argv) > 4 else REPO
  try:
      shipped_document = load_shipped_pages(shipped_root)
  except ShippedPagesError as error:
      print("curriculum INVALID")
      print(" - shipped_pages.json: %s" % error)
      return 1
  ~~~

  After the existing MS3 weeks have been structurally inspected, call prepare_cards() and append a
  normal validator error rather than throwing a traceback:

  ~~~python
  if site == "ms3":
      try:
          prepare_cards(weeks, shipped_document)
      except CompassContractError as error:
          bad(label, str(error))
  ~~~

  Update the usage docstring to show the fifth shipped-root argument. Do not catch unexpected
  exceptions.

- [ ] **Step 7: Run schema, fixture, reader-ratchet, and real-data checks.**

  ~~~bash
  python3 13_Faculty_Resources/_automation/test_validate_curriculum.py
  python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
  python3 13_Faculty_Resources/_automation/validate_curriculum.py
  node --test tests/shipped-pages-readers.test.mjs
  ~~~

  Expected: every command exits 0; the reader-ratchet list is unchanged.

- [ ] **Step 8: Commit Task 2.**

  ~~~bash
  git add curriculum.schema.json curriculum.json \
    13_Faculty_Resources/_automation/validate_curriculum.py \
    13_Faculty_Resources/_automation/test_validate_curriculum.py
  git commit -m "feat(curriculum): add MS3 compass landing routes"
  ~~~

### Task 3: Replace the Welcome source hierarchy and return it to pending review

**Files:**

- Modify: 13_Faculty_Resources/Outreach/MS3_Inpatient_Rotation_OnePager.md
- Modify: topic_meta.json
- Modify: 13_Faculty_Resources/reviewed.json
- Create: tests/welcome-compass-contract.test.mjs

**Interfaces:**

- Consumes: COMPASS_MARKER from Task 1 and the exact copy approved in the specification.
- Produces: one marker immediately after the audience subtitle; the exact welcome.md metadata
  projection; a pending/general/low governance entry with no claimed human approval.

- [ ] **Step 1: Add failing tracked-source tests.** In tests/welcome-compass-contract.test.mjs,
  parse topic_meta.json and reviewed.json and read both Markdown sources. Assert:

  - the Welcome source has exactly one Compass marker;
  - the marker occurs after the subtitle and before the first retained Welcome paragraph;
  - intro-trailer.mp4, intro-trailer-poster.jpg, "Your weekly arc",
    "Tools you'll actually use at the bedside", and "**Start here:**" are absent;
  - the former phrase "leave ready for the shelf and your sub-internship" is absent and the exact
    neutral phrase "prepare for the shelf and a future sub-internship" is present;
  - the Orientation Packet has exactly one start and one end safety marker, with the exact
    normalized visible sentence between them;
  - topic_meta.json["welcome.md"].tldr and points equal the approved object exactly;
  - read, workflowStages, workflowModes, relatedTools, communicationCases, and clinicalWorkflow
    still equal explicit baseline constants copied into the test from commit
    7eb4ace0301e163139208e8dc9f05b3aab5f79ea;
  - reviewed.json["welcome.md"] is pending, general, low, has by equal to
    "Pending faculty review", has the exact reason below, and has an ISO date;
  - no Compass markup contains a crisis number, protected-form item text, patient identifier,
    storage/tracking API, progress or score field, or wording that grants independent action.
    The negative scope phrases "clinical protocol" and "permission to act independently" must
    remain present and must not be blocked by a naive forbidden-word test.

- [ ] **Step 2: Run the source test and confirm red.**

  ~~~bash
  node --test tests/welcome-compass-contract.test.mjs
  ~~~

  Expected: failures identify the old video embed, missing marker, stale topic metadata, and
  reviewed ledger state.

- [ ] **Step 3: Replace the Welcome source with exactly this retained-content shape.**

  ~~~markdown
  # Inpatient Psychiatry — Your 6-Week MS3 Rotation
  ### UNE COM third-year clerkship · with Joshua Moss, MD · Maine Medical Center – Sanford

  <!-- ms3-six-week-compass -->

  Welcome. This rotation is built as a **structured six-week arc** so that wherever you are in the year, you get the same strong foundation in inpatient psychiatry — and prepare for the shelf and a future sub-internship.

  The hub is meant to be useful in the moment: a structured sequence from foundations to integration, plus bedside tools, clinical one-pagers, and readings you can navigate by week, topic, or tool. Use it when it helps you prepare for rounds, understand a patient, practice a skill, or review for the exam.

  **What you'll do.** Work as part of the treatment team on the inpatient unit: interview and follow patients, build differentials and formulations, present on rounds, participate in family meetings, and practice safe, evidence-based management under direct supervision.

  **Also included:** short teaching one-pagers for the core diagnoses, a differential-diagnosis "can't-miss" guide, a landmark-article reading pathway, practice OSCE stations, and a shelf high-yield review.

  **How you'll be supported & evaluated.** Direct supervision with frequent formative feedback, observed interviews and presentations, case discussion, and teaching rounds. Clear expectations and entrustment levels so you always know what "doing well" looks like.

  Next: [open the Orientation Packet](?page=orientation.md).

  *Educational overview for students. Fictional composites only; no PHI. Joshua Moss, MD | Psychiatrist.*
  ~~~

  This removes only the elements listed in the approved specification and applies its one narrow
  readiness-language correction. Do not otherwise rewrite the retained paragraphs during
  implementation; further copy editing is a faculty decision.

- [ ] **Step 4: Replace only tldr and points for topic_meta.json["welcome.md"].**

  ~~~json
  {
    "tldr": "Start with the Six-Week Compass and Orientation Packet, then choose the resource relevant to the task you are preparing to discuss with your supervising team.",
    "points": [
      "The Compass is a wayfinding map, not a checklist, clinical protocol, or measure of readiness.",
      "Review the Orientation Packet's safety and supervision boundaries before using bedside tools.",
      "Use the optional captioned orientation overview when a narrated walkthrough helps; the transcript provides the non-video route."
    ]
  }
  ~~~

  Preserve every other welcome.md metadata field byte-for-byte in meaning and value.

- [ ] **Step 5: Move the Welcome ledger entry to pending.** Preserve risk kind general and level
  low. Set status to "pending", reason to
  "Six-Week Compass and onboarding hierarchy awaiting faculty review.", and by to
  "Pending faculty review". Immediately before editing at, run:

  ~~~bash
  date +%F
  ~~~

  Write that exact ISO date as at. Do not reuse the former review date, name a reviewer, or change
  status to reviewed.

- [ ] **Step 6: Run the tracked-source and governance checks.**

  ~~~bash
  node --test tests/welcome-compass-contract.test.mjs
  python3 13_Faculty_Resources/_automation/validate_topic_meta.py
  python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
  node faculty-console/check_pending_visible.mjs
  ~~~

  Expected: all commands exit 0; the faculty-console check includes welcome.md in the visible
  derived universe rather than an exclusion.

- [ ] **Step 7: Commit Task 3.**

  ~~~bash
  git add 13_Faculty_Resources/Outreach/MS3_Inpatient_Rotation_OnePager.md \
    topic_meta.json 13_Faculty_Resources/reviewed.json \
    tests/welcome-compass-contract.test.mjs
  git commit -m "feat(ms3): replace intro with compass source contract"
  ~~~

### Task 4: Integrate the Compass and canonical week nav into the MS3 builder

**Files:**

- Modify: 13_Faculty_Resources/_automation/site_build/welcome_compass.py
- Modify: 13_Faculty_Resources/_automation/site_build/test_welcome_compass.py
- Modify: 13_Faculty_Resources/_automation/site_build/build_deploy.py

**Interfaces:**

- Consumes: Task 1 renderer; Task 2 curriculum and shipped document; the marked Orientation Packet;
  site_extras.MS3_ORIENT_VIDEO; the existing Markdown crisis and pairing transforms.
- Produces: exactly one rendered Compass in _build/ms3/content/welcome.md; six hidden Orientation
  nav rows derived from the same cards; an intact optional orientation package; final MS3
  assertions after service-worker generation. Source paths and built paths are projected
  separately from the same site_extras entries.

- [ ] **Step 1: Add failing tests for required source assets and final output.** Extend
  test_welcome_compass.py with temporary-directory tests for:

  - require_real_files(root, relative_paths) accepting four non-empty normal files when passed
    relative path strings rather than site_extras triples;
  - missing, directory-instead-of-file, empty, unreadable, and LFS-pointer inputs failing with all
    bad paths named;
  - assert_ms3_output(out_dir, cards, safety_text, built_orientation_paths) requiring the exact
    rendered fragment, zero raw markers, and all four built orientation destination files.

- [ ] **Step 2: Run the suite and confirm red.**

  ~~~bash
  python3 13_Faculty_Resources/_automation/site_build/test_welcome_compass.py
  ~~~

  Expected: AttributeError or ImportError for require_real_files and assert_ms3_output.

- [ ] **Step 3: Implement the media and final-output helpers.** require_real_files() must accept a
  root plus an iterable of relative path strings and collect every fault before raising one
  CompassContractError. A file is real only when it is a regular file, size is greater than zero,
  readable, and its first len(LFS_HEADER) bytes do not equal LFS_HEADER. assert_ms3_output() must
  call require_real_files(out_dir, built_orientation_paths), compare the expected
  render_compass() fragment directly with built Welcome, and reject a raw Compass or safety marker.
  Retirement scanning is deliberately added in Task 5, after VIDEO_MEDIA changes.

- [ ] **Step 4: Move Compass inputs into the build preflight before OUT is deleted.** At the import
  and bootstrap region of build_deploy.py, add:

  ~~~python
  import shipped_pages
  import welcome_compass
  from site_extras import MS3_ORIENT_VIDEO as ORIENT_VIDEO
  ~~~

  Define the two required source documents and include them in the existing bootstrap inventory:

  ~~~python
  CURRICULUM = os.path.join(LIB, "curriculum.json")
  ORIENTATION_PACKET = os.path.join(
      LIB,
      "14_Tracks",
      "MS3",
      "Student_Ready_Pack",
      "01_orientation",
      "MS3_orientation_packet.md",
  )
  _bootstrap_missing = [
      path
      for path in [
          MANIFEST,
          SPA,
          MARKED,
          CLINICAL_CSS,
          FRONTDOOR_CSS,
          CURRICULUM,
          ORIENTATION_PACKET,
      ]
      if not os.path.exists(path)
  ]
  _abort_missing(_bootstrap_missing)
  ~~~

  Next, while the old OUT directory is still intact, project the source and destination path lists
  and validate every Compass input in one targeted preflight:

  ~~~python
  _orientation_source_paths = [src for src, _dst, _title in ORIENT_VIDEO]
  _orientation_built_paths = [
      os.path.join("tools", dst) for _src, dst, _title in ORIENT_VIDEO
  ]
  try:
      _curriculum = json.load(open(CURRICULUM, encoding="utf-8"))
      _shipped_document = shipped_pages.load_shipped_pages(LIB)
      _compass_cards = welcome_compass.prepare_cards(
          _curriculum["learningPaths"]["ms3"]["weeks"],
          _shipped_document,
      )
      _safety_text = welcome_compass.extract_safety_rule(
          open(ORIENTATION_PACKET, encoding="utf-8").read()
      )
      _compass_fragment = welcome_compass.render_compass(_compass_cards, _safety_text)
      welcome_compass.require_real_files(LIB, _orientation_source_paths)
  except (
      OSError,
      UnicodeError,
      json.JSONDecodeError,
      KeyError,
      TypeError,
      shipped_pages.ShippedPagesError,
      welcome_compass.CompassContractError,
  ) as error:
      print("BUILD ABORTED — MS3 Compass:", error)
      raise SystemExit(1)
  ~~~

  Only after this block succeeds may the script delete and recreate OUT. Remove the later
  ORIENT_VIDEO import and warning-only missing branch. After OUT/tools exists, copy and harden all
  four destinations exactly once:

  ~~~python
  _missing_orientation = []
  for src, dst, _title in ORIENT_VIDEO:
      out_path = os.path.join(OUT, "tools", dst)
      _copy_required(os.path.join(LIB, src), out_path, _missing_orientation)
      if os.path.isfile(out_path):
          os.chmod(out_path, 0o644)
  _abort_missing(_missing_orientation)
  ~~~

- [ ] **Step 5: Inject after existing Markdown transforms and include the Compass result in the
  write condition.** Replace the copy-loop core with the equivalent of:

  ~~~python
  _t = open(p, encoding="utf-8").read()
  _t, _did = _crisis.inject_markdown(_t, _crisis_data)
  _t, _pdid = _pairings.inject_markdown(_t, _pair_data, dst, "ms3")
  _compass_did = False
  if dst == "welcome.md":
      _t, _compass_did = welcome_compass.inject_compass(_t, _compass_fragment)
  if _did or _pdid or _compass_did:
      open(OUT + "/content/" + dst, "w", encoding="utf-8").write(_t)
  ~~~

  This write condition is load-bearing: omitting _compass_did would leave the copied source marker
  in generated output.

- [ ] **Step 6: Replace the hard-coded _week_items expression.**

  ~~~python
  _week_items = [
      _md("Week %d — %s" % (card.n, card.title), card.landing_ref, True)
      for card in _compass_cards
  ]
  ~~~

  After nav is sorted and before surface-governance annotation, call:

  ~~~python
  welcome_compass.assert_nav_projection(nav, _compass_cards)
  ~~~

  Replace the second json.load(open(LIB + "/curriculum.json")) in
  frontdoor_catalog.build_frontdoor_payload() with _curriculum so the file is loaded once.

- [ ] **Step 7: Add the final artifact assertion after common.emit_service_worker(OUT).**

  ~~~python
  welcome_compass.assert_ms3_output(
      OUT,
      _compass_cards,
      _safety_text,
      _orientation_built_paths,
  )
  ~~~

  Running after service-worker generation checks the completed artifact rather than an
  intermediate tree. Task 5 extends this same assertion with the retired-media scan, including
  sw.js.

- [ ] **Step 8: Run unit and direct MS3 build checks.**

  ~~~bash
  python3 13_Faculty_Resources/_automation/site_build/test_welcome_compass.py
  OUT_DIR="_build/ms3" python3 13_Faculty_Resources/_automation/site_build/build_deploy.py
  python3 13_Faculty_Resources/_automation/site_build/check_lfs_media.py _build/ms3
  node 13_Faculty_Resources/_automation/site_build/check-static-site.mjs _build/ms3
  ~~~

  Expected: the build reports six derived Compass cards, copies all four orientation files, and
  exits 0 with no unconsumed marker.

- [ ] **Step 9: Commit Task 4.**

  ~~~bash
  git add 13_Faculty_Resources/_automation/site_build/welcome_compass.py \
    13_Faculty_Resources/_automation/site_build/test_welcome_compass.py \
    13_Faculty_Resources/_automation/site_build/build_deploy.py
  git commit -m "feat(build): inject canonical MS3 six-week compass"
  ~~~

### Task 5: Retire the old intro from generated artifacts and protect the resident build

**Files:**

- Modify: 13_Faculty_Resources/_automation/site_build/build_deploy.py
- Modify: 13_Faculty_Resources/_automation/site_build/resident_section.py
- Modify: 13_Faculty_Resources/_automation/site_build/welcome_compass.py
- Modify: 13_Faculty_Resources/_automation/site_build/test_welcome_compass.py
- Modify: _prototypes/video-library/README.md
- Modify: media_manifest.json
- Modify: tests/welcome-compass-contract.test.mjs

**Interfaces:**

- Consumes: completed MS3 output and the resident builder's existing MS3-copy/Welcome-override
  sequence.
- Produces: retained source provenance for the old MP4/poster, zero generated copies/references in
  either site, and a final resident assertion that its Welcome remains resident-only.

- [ ] **Step 1: Add failing retirement and resident tests.** Extend assert_ms3_output() and the
  Python and Node contract suites to require:

  - VIDEO_MEDIA contains neither intro-trailer.mp4 nor intro-trailer-poster.jpg;
  - the two prototype source files still exist and are non-empty;
  - media_manifest.json contains exactly one exact retired-intro-trailer row;
  - no orientation-video record is added as served true;
  - the completed MS3 output contains no old trailer/poster file and no retired filename in any
    .md, .html, .json, .js, .css, _headers, or sw.js text output;
  - assert_resident_output() rejects any data-ms3-compass-root, Compass scope/prompt copy, MS3
    optional-orientation package file, retired intro file/reference, missing
    media/resident-onboarding.mp4 or poster, an LFS pointer in either resident onboarding asset,
    or missing resident-onboarding video/poster reference in resident Welcome.

- [ ] **Step 2: Run the tests and confirm red.**

  ~~~bash
  python3 13_Faculty_Resources/_automation/site_build/test_welcome_compass.py
  node --test tests/welcome-compass-contract.test.mjs
  ~~~

  Expected: failures name the two live VIDEO_MEDIA entries, the absent retirement record, and the
  not-yet-implemented resident assertion.

- [ ] **Step 3: Remove only the two retired names from VIDEO_MEDIA.** Keep
  day-in-the-life.mp4, all week stingers, all tool spotlights, and both reel names unchanged.
  Do not delete or modify the prototype MP4/poster.

- [ ] **Step 4: Update the video-library README.** Make these exact factual changes:

  - identify the MS3 intro MP4 and poster as retained design provenance that are not copied to a
    generated site;
  - delete the two live placement-table rows for the intro and poster;
  - delete the claim that Welcome already references every listed media file;
  - delete the claim that the intro still needs voiceover for release;
  - preserve the resident onboarding, day-in-the-life, week-stinger, tool-spotlight, export, and
    Git LFS guidance;
  - state that restoring or remixing the retired intro requires a separate approved work package.

- [ ] **Step 5: Amend media_manifest.json.** Replace _note with:

  ~~~text
  Media accessibility manifest (WP-13): text-alternative / caption status per media asset. Generated 2026-07-16, corrected after build verification showed the OE paper-overview audio (review.html) is live for 50/79 quiz decks. "onDisk" means matching source bytes exist in the working tree; "assetShipped" means the file is copied into a generated learner site; "served" means a built learner page references it. A retired provenance asset may therefore be onDisk true while assetShipped and served are false. Served media still requires a text alternative or captions/transcript as recorded per entry.
  ~~~

  Add this exact video entry:

  ~~~json
  {
    "file": "_prototypes/video-library/intro-trailer.mp4",
    "poster": "_prototypes/video-library/intro-trailer-poster.jpg",
    "kind": "retired-intro-trailer",
    "onDisk": true,
    "assetShipped": false,
    "served": false,
    "retired": true,
    "captions": false,
    "textAlt": null,
    "note": "The source MP4 and _prototypes/video-library/intro-trailer-poster.jpg both remain on disk for provenance; neither is copied into or referenced by either generated learner site."
  }
  ~~~

  Do not add the orientation MP4 to the manifest in this work package.

- [ ] **Step 6: Implement resident final-output validation.** Add
  assert_resident_output(out_dir) to welcome_compass.py and call it immediately after the resident
  common.emit_service_worker(OUT) call. It must inspect the final content/welcome.md, tools, media,
  text outputs, and sw.js. It must call require_real_files() for
  media/resident-onboarding.mp4 and media/resident-onboarding-poster.jpg so a missing, empty,
  unreadable, or LFS-pointer build artifact fails as an audience-isolation regression. It must not
  inspect or modify resident source assets.

  ~~~python
  import welcome_compass
  ~~~

  ~~~python
  welcome_compass.assert_resident_output(OUT)
  ~~~

- [ ] **Step 7: Build sequentially and inspect the actual generated trees.**

  ~~~bash
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
  find _build/ms3 _build/res -type f \
    \( -name "intro-trailer.mp4" -o -name "intro-trailer-poster.jpg" \) -print
  rg -n --glob "*.md" --glob "*.html" --glob "*.json" --glob "*.js" \
    "intro-trailer|data-ms3-compass-root" _build/ms3 _build/res
  ~~~

  Expected: both builds pass; find prints nothing; rg finds the Compass root only in
  _build/ms3/content/welcome.md and finds no intro-trailer reference.

- [ ] **Step 8: Recheck the derived shipped-page artifact.**

  ~~~bash
  python3 13_Faculty_Resources/_automation/site_build/shipped_pages.py --check
  ~~~

  Expected: shipped_pages OK. Do not regenerate it because this task changes no page producer.

- [ ] **Step 9: Commit Task 5.**

  ~~~bash
  git add 13_Faculty_Resources/_automation/site_build/build_deploy.py \
    13_Faculty_Resources/_automation/site_build/resident_section.py \
    13_Faculty_Resources/_automation/site_build/welcome_compass.py \
    13_Faculty_Resources/_automation/site_build/test_welcome_compass.py \
    _prototypes/video-library/README.md media_manifest.json \
    tests/welcome-compass-contract.test.mjs
  git commit -m "feat(media): retire MS3 intro from learner builds"
  ~~~

### Task 6: Add the responsive Clinical Warm presentation and browser behavior checks

**Files:**

- Modify: 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css
- Modify: tests/smoke/front-door.spec.js
- Verify only: tests/smoke/visual-regression.spec.js
- Verify only: tests/smoke/playwright.config.js

**Interfaces:**

- Consumes: Task 1 data attributes and existing --fd-* color, surface, line, shadow, focus, and
  typography tokens.
- Produces: one-column layout below 22rem measured component width, two columns from 22rem to below
  30rem, three columns at 30rem and above; 0.75rem gaps; 44 by 44 CSS-pixel coarse-pointer links;
  no animation, icon, connector, inline style, or global reader override.

- [ ] **Step 1: Add failing MS3/resident Playwright assertions.** Add a test with the signature
  `async ({ page, browser }, testInfo)` that runs in both nav-ms3 and nav-res projects, opens
  /?page=welcome.md, and:

  - on resident, requires zero data-ms3-compass-root and requires the resident onboarding video
    reference;
  - on MS3, requires the exact root-child order safety, scope, Compass section, prompt, optional
    video;
  - requires the exact six ordered rows:

  ~~~javascript
  [
    { n: "1", title: "Foundations & the MSE", href: "?page=week1.md", label: "Open Week 1" },
    { n: "2", title: "Mood, Psychosis & Pharm", href: "?page=week2.md", label: "Open Week 2" },
    { n: "3", title: "Psychotherapy & Personality", href: "?page=week3.md", label: "Open Week 3" },
    { n: "4", title: "Family Systems & EE", href: "?page=week4.md", label: "Open Week 4" },
    { n: "5", title: "Acute & Emergency", href: "?page=week5.md", label: "Open Week 5" },
    { n: "6", title: "Integration & Exam", href: "?page=week6.md", label: "Open Week 6" }
  ]
  ~~~

  - requires one role note, a section labelled by ms3-compass-title, one ordered list, exact safety,
    scope, prompt, and optional-link copy;
  - requires one compact "Pending faculty review" status and no reviewed receipt on the MS3
    Welcome;
  - focuses Week 1, presses Tab through Week 6 and then the optional-video link, asserting focused
    href after each keypress;
  - at viewport widths 736, 561, 390, and 320, measures .ms3-compass width and root font size,
    derives the expected column count from 22rem and 30rem, counts computed grid tracks, and
    requires both document and component scrollWidth to be no greater than clientWidth;
  - before navigating for the dark-theme check, calls
    `seedApp(page, testInfo, { storage: { cw_theme: "dark" } })`, then confirms
    data-theme="dark" and a visible nonzero focus outline;
  - under prefers-reduced-motion: reduce, confirms the Compass and its cards have animationName
    "none" and transitionDuration "0s";
  - on MS3 only, creates an isolated touch context with
    `browser.newContext({ baseURL: testInfo.project.use.baseURL, hasTouch: true })`, creates its
    page, calls seedApp() before navigating to /?page=welcome.md, and requires every Compass and
    optional-orientation link box to be at least 44 pixels in each dimension. Wrap page use in
    try/finally and close the context in finally so no browser state leaks.

- [ ] **Step 2: Run only the new browser spec against the unstyled build and confirm red.**

  ~~~bash
  SPECS="front-door.spec.js" bash bin/verify-smoke.sh
  ~~~

  Expected: semantic assertions pass after Task 5, while grid-column and coarse-target assertions
  fail before the CSS is added.

- [ ] **Step 3: Add this component-scoped CSS block near the Reader rules.**

  ~~~css
  [data-ms3-compass-root]{
    display:grid;
    gap:18px;
    margin:0 0 24px;
  }
  [data-ms3-compass-safety]{
    margin:0;
    padding:14px 16px;
    border:1px solid var(--fd-line-strong);
    border-left:4px solid var(--fd-danger);
    border-radius:10px;
    background:var(--fd-danger-wash);
    color:var(--fd-text);
  }
  [data-ms3-compass-safety] p,
  [data-ms3-compass-scope],
  [data-ms3-compass-prompt]{margin:0}
  .ms3-compass{container:ms3-compass / inline-size}
  .ms3-compass > h2{margin:0 0 12px}
  .ms3-compass__weeks{
    display:grid;
    grid-template-columns:minmax(0,1fr);
    gap:.75rem;
    margin:0;
    padding-left:1.5rem;
  }
  .ms3-compass__weeks > li{
    min-width:0;
    margin:0;
    padding:14px;
    border:1px solid var(--fd-line);
    border-top:3px solid var(--fd-terracotta);
    border-radius:10px;
    background:var(--fd-surface-warm);
    box-shadow:var(--fd-shadow-sm);
  }
  .ms3-compass__weeks > li > span{
    display:block;
    color:var(--fd-terracotta-dark);
    font-size:11px;
    font-weight:700;
    letter-spacing:.08em;
    text-transform:uppercase;
  }
  .ms3-compass__weeks h3{
    margin:4px 0 10px;
    overflow-wrap:anywhere;
  }
  [data-ms3-compass-link],
  [data-ms3-compass-orientation]{
    display:inline-flex;
    align-items:center;
  }
  @container ms3-compass (min-width:22rem){
    .ms3-compass__weeks{grid-template-columns:repeat(2,minmax(0,1fr))}
  }
  @container ms3-compass (min-width:30rem){
    .ms3-compass__weeks{grid-template-columns:repeat(3,minmax(0,1fr))}
  }
  @media (pointer:coarse){
    [data-ms3-compass-link],
    [data-ms3-compass-orientation]{
      min-inline-size:44px;
      min-block-size:44px;
    }
  }
  ~~~

  If contrast-check rejects a token pairing, use an existing passing --fd-* role with the same
  semantic purpose; do not add a raw color. Do not add list-style:none because ordered numbering
  is part of the meaning.

- [ ] **Step 4: Rerun focused behavior and contrast checks.**

  ~~~bash
  node tests/contrast-check.mjs
  SPECS="front-door.spec.js" bash bin/verify-smoke.sh
  ~~~

  Expected: both nav-ms3 and nav-res projects pass. The test must report measured component widths,
  not infer columns from viewport values.

- [ ] **Step 5: Confirm the resident-only baseline project was not changed.**

  ~~~bash
  git diff --exit-code origin/main -- \
    tests/smoke/visual-regression.spec.js \
    tests/smoke/playwright.config.js \
    .github/workflows/refresh-baselines.yml
  ~~~

  Expected output: empty. Do not run an update-snapshots command locally.

- [ ] **Step 6: Commit Task 6.**

  ~~~bash
  git add 13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css \
    tests/smoke/front-door.spec.js
  git commit -m "feat(ui): style and verify the six-week compass"
  ~~~

### Task 7: Wire the tests into the gates and complete local technical verification

**Files:**

- Modify: 13_Faculty_Resources/_automation/site_build/build_and_check.sh
- Modify: bin/verify.sh
- Verify: all Task 1-6 paths
- Do not modify: .github/workflows/ci.yml

**Interfaces:**

- Consumes: both new Python unit suites and all existing repository gates.
- Produces: Netlify/CI-backed site builds that cannot skip Compass unit contracts; quick local
  verification that reports both suites explicitly; full dual-site and browser evidence.

- [ ] **Step 1: Add the two unit suites to build_and_check.sh before their production validators.**

  ~~~bash
  python3 "$LIB/13_Faculty_Resources/_automation/test_validate_curriculum.py"
  python3 "$HERE/test_welcome_compass.py"
  python3 "$LIB/13_Faculty_Resources/_automation/validate_topic_meta.py"
  python3 "$LIB/13_Faculty_Resources/_automation/validate_curriculum.py"
  ~~~

  This uses the existing CI and Netlify build step; do not add a ci.yml step or trigger workflow
  inventory/digest churn.

- [ ] **Step 2: Add both suites to bin/verify.sh's Python unit inventory.**

  ~~~bash
  step "unit — curriculum contract"            python3 $A/test_validate_curriculum.py
  step "unit — MS3 welcome compass"            python3 $A/site_build/test_welcome_compass.py
  ~~~

  bin/verify.sh is allowed to be a superset of ci.yml. Do not weaken or remove an existing step.

- [ ] **Step 3: Run the fast full-source checks.**

  ~~~bash
  python3 13_Faculty_Resources/_automation/test_validate_curriculum.py
  python3 13_Faculty_Resources/_automation/site_build/test_welcome_compass.py
  python3 13_Faculty_Resources/_automation/validate_registry_schemas.py
  python3 13_Faculty_Resources/_automation/validate_topic_meta.py
  python3 13_Faculty_Resources/_automation/validate_curriculum.py
  python3 13_Faculty_Resources/_automation/validate_attestation_consistency.py
  python3 13_Faculty_Resources/_automation/site_build/shipped_pages.py --check
  node faculty-console/check_pending_visible.mjs
  node --test tests/*.test.mjs
  node tests/contrast-check.mjs
  bash bin/verify.sh --quick
  ~~~

  Expected: every command exits 0. Read report-only span/qbank output even when the quick gate ends
  PASS.

- [ ] **Step 4: Run the two full site builds sequentially.**

  ~~~bash
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
  bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
  ~~~

  Expected: MS3 and resident each end with build_and_check OK, shipped-pages parity is exact, the
  MS3 output has one Compass, and the resident output has none.

- [ ] **Step 5: Run the focused nonvisual browser suite with servers owned by this worktree.**

  ~~~bash
  SPECS="front-door.spec.js governance-warnings.spec.js lfs-integrity.spec.js" \
    bash bin/verify-smoke.sh
  ~~~

  Expected: every selected nav-ms3, nav-res, and lfs test passes. If ports 4200-4202 are occupied,
  identify the owning PIDs and stop; never trust or reuse another worktree's server.

- [ ] **Step 6: Run the repository's full local gate.**

  ~~~bash
  bash bin/verify.sh
  ~~~

  Expected final line: ALL CHECKS PASSED. This command repeats the sequential site builds by design.
  A pre-existing failure must be reproduced on clean origin/main before it is classified as
  unrelated.

- [ ] **Step 7: Inspect the uncommitted gate-wiring diff.**

  ~~~bash
  git diff --check
  git status --short --branch
  ~~~

  Confirm the only uncommitted paths are build_and_check.sh and bin/verify.sh and that neither diff
  contains whitespace errors.

- [ ] **Step 8: Commit the gate wiring.**

  ~~~bash
  git add 13_Faculty_Resources/_automation/site_build/build_and_check.sh bin/verify.sh
  git commit -m "test(ms3): gate the six-week compass contract"
  ~~~

- [ ] **Step 9: Re-run the two gate-coverage checks after the commit.**

  ~~~bash
  python3 bin/check-verify-coverage.py
  python3 13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py
  ~~~

  Expected: both exit 0 without editing ci.yml or a scheduled-workflow digest.

- [ ] **Step 10: Inspect the complete committed scope and diff integrity.**

  ~~~bash
  git diff --check origin/main...HEAD
  git status --short --branch
  git diff --name-status origin/main...HEAD
  git log --oneline --decorate origin/main..HEAD
  ~~~

  Confirm the worktree is clean, no LFS media appears modified, no _build file is tracked, no
  Adobe/Canva artifact exists, and only the paths named in Tasks 1-7 changed.

### Task 8: Human release, pilot, and Adobe follow-on gates

**Files:**

Create only after the named human work actually occurs:

- docs/pilots/ms3-six-week-compass-review.md
- An institutionally approved Adobe Creative Cloud folder:
  Psychiatry Clerkship Library/Six-Week Compass/v1.0.0

**Interfaces:**

- Consumes: the exact technically verified commit from Task 7, an authorized review surface, named
  faculty judgment, local educational-QI determination, and later separate Adobe approval.
- Produces: real review evidence and a release decision. It does not produce an automatic
  attestation or infer learner readiness.

- [ ] **Step 1: Stop the agentic implementation.** Do not push, open a PR, create a Netlify preview,
  change welcome.md back to reviewed, contact learners, or create Adobe files without the user's
  next explicit authorization.

- [ ] **Step 2: When preview creation is separately authorized, record its exact commit and URL.**
  A named faculty reviewer must inspect the exact pending MS3 Welcome at 736, 561, 390, and 320
  pixels; keyboard order; 200 percent zoom/reflow; light/dark focus and contrast; reduced motion;
  screen-reader announcement order; exact six routes/titles; exact safety copy; scope statement;
  optional-video framing; and retained Welcome copy. The resident Welcome must be checked as an
  audience non-regression.

- [ ] **Step 3: Perform the full orientation-media review.** The named reviewer listens through the
  entire MP4 while checking every VTT cue and confirms the interactive transcript is generated
  from that reviewed VTT. Record reviewer, ISO date, commit, preview URL, SHA-256 of the MP4 and
  VTT, full-duration completion, discrepancies, and approved/not-approved outcome. If correction
  is needed, stop for a separately scoped caption repair and repeat review.

- [ ] **Step 4: Create the evidence packet only after Steps 2-3 occur.** The file
  docs/pilots/ms3-six-week-compass-review.md must contain observed facts, not blank headings,
  projected outcomes, or invented identities. Only the named human may decide whether to update
  reviewed.json to reviewed and supply their real reviewer label/date.

- [ ] **Step 5: Obtain the appropriate local educational-QI determination before recruiting.**
  Then run the approved no-tracking pilot with five or six volunteer MS3 learners and these exact
  synthetic prompts:

  1. "You are concerned about immediate safety. Who does this page tell you to contact, and when?"
  2. "You are preparing to discuss an acute or emergency topic with your supervising team. Find
     the relevant week and open one next resource."
  3. "Without playing the video, explain what the map does and does not say about your readiness."

  Retain anonymous aggregate tallies only. Do not record names, quotes, accounts, patient data,
  individualized performance, or behavior analytics. Release passes only if: 100 percent identify
  the resident or attending as the immediate escalation destination; at least 80 percent find the
  relevant week and one next resource without video; every participant answers "no" without
  prompting to whether the page is a clinical protocol, shows readiness to act independently, or
  tracks completion; faculty judges the labels, links, safety, and optional-media framing accurate;
  and accessibility review finds no keyboard, reading-order, focus, caption/transcript, reflow,
  contrast, or complete non-video-access blocker. Clarification after a wrong first impression may
  diagnose the failure but cannot convert it into a pass.

- [ ] **Step 6: Decide release from separate gates.** Technical green, faculty content approval,
  orientation-media approval, accessibility review, QI/pilot authorization, pilot outcome, merge,
  and production deployment remain separate decisions. A failure returns to the relevant task and
  repeats review; it is not offset with animation, scoring, a quiz, or more media.

- [ ] **Step 7: If the user separately approves the print companion after web acceptance, create it
  in Adobe InDesign 2026 and review it in Acrobat.** Follow specification section 11.2 exactly:
  US Letter portrait with 0.5-inch safe margins, live text, 3 by 2 cards, at least 12pt card titles
  and 10pt supporting text, tagged/searchable PDF, licensed font inventory, INDD plus IDML, Acrobat
  accessibility/preflight report, rendered PNG proof, printed-page inspection, and manifest.json
  binding every file hash to source commit, curriculum digest, safety-copy revision, reviewer,
  review date, and distribution decision.
  Name the source files MS3_Six_Week_Compass_v1.0.0.indd and
  MS3_Six_Week_Compass_v1.0.0.idml; name the review artifacts
  MS3_Six_Week_Compass_v1.0.0_review.pdf,
  MS3_Six_Week_Compass_v1.0.0_acrobat-report.pdf, and
  MS3_Six_Week_Compass_v1.0.0_proof-page-01.png. Keep the Adobe Cloud package noncanonical and
  nondeployed until a separate distribution decision.

- [ ] **Step 8: Keep the later creative tools evidence-gated.** Illustrator may supply only a
  text-free decorative motif after the live-text print design is accepted. Adobe Express or
  Premiere/Quick Cut may test a 20-30 second captioned, transcribed, non-autoplay teaser only after
  the static pilot. Lightroom may process only institutionally approved, PHI-free environment
  photography after metadata/privacy review. Canva may hold comments or a storyboard, never the
  canonical curriculum.

## Completion boundary

Tasks 1-7 complete the local technical implementation. The learner release remains pending at the
start of Task 8. Do not describe the Compass as shipped, faculty approved, piloted, or deployed
unless the corresponding human/external evidence exists.

## Spec coverage self-audit

| Approved-spec area | Plan coverage |
|---|---|
| Reading order and exact copy | Tasks 1, 3, and 6 |
| Six canonical week titles/routes | Tasks 1, 2, and 4 |
| Container-query layout and accessibility | Task 6 |
| Safety source and failure behavior | Tasks 1 and 4 |
| Single structural source and final-nav parity | Tasks 2 and 4 |
| Built MS3 and resident contracts | Tasks 4, 5, and 7 |
| Trailer retirement and orientation-package integrity | Tasks 4 and 5 |
| Pending governance and privacy | Tasks 3, 7, and 8 |
| Automated, browser, and human verification | Tasks 1-8 |
| Pilot thresholds | Task 8 |
| Adobe print/video/photo governance | Task 8 |
| Later retention diagrams | Deferred below |

## Deferred work packages

- One Patient, Six Weeks evolving-story timeline: separate clinical copy, uncertainty, and
  supervision specification.
- Rounds-update retrieval strip: separate memory-aid specification and workflow test.
- Supervised safety-support map: separate high-safety specification; first visible step must be the
  exact safety rule, every branch must remain supervised, and it may contain no medication, dose,
  threshold, score, capacity, treatment, or disposition decision.
- Stored MS3 screenshot baselines: separate CI/workflow-contract change with Ubuntu/Chromium
  baseline generation.

## Concrete next-best option

If the pilot shows that learners understand the six-week arc but still cannot orient themselves on
Day 1, specify a small "Day on the Unit" map next. It should link observed moments—pre-rounds,
interview, team discussion, documentation, feedback—to existing resources without becoming a
checklist, schedule mandate, or readiness measure.

## Innovative follow-on

After faculty accepts the web Compass, build one governed structural projection that emits both
semantic web data and an InDesign-ready CSV/JSON derivative. Bind both to the same curriculum
digest and safety-copy revision in a proof manifest. This lets future print and web versions drift
loudly rather than silently while keeping curriculum.json and the marked Orientation Packet as the
only instructional sources.
