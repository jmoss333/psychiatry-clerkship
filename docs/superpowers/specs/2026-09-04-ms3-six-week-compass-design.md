# MS3 Six-Week Compass and visual-learning roadmap — design

**Date:** 2026-09-04
**Status:** Concept A approved in conversation; written-spec review required before planning
**Release status:** Not faculty re-attested, implemented, merged, or deployed
**Baseline:** `origin/main` at `87e6c82751e30dd3d1d2ddab08cce25b651ec61b`

---

## Plain-language summary

Replace the silent, dark-poster welcome trailer with a calm six-card map of the rotation. Each
card comes from the existing curriculum registry and opens that week's existing page. Learners
see the safety/supervision boundary before the map and may choose an accessible orientation video
afterward. The map never acts like a checklist, score, protocol, or sign that someone is ready to
work independently.

The learner-facing map remains real web text and links. Adobe is used where it adds value: an
optional InDesign print companion reviewed in Acrobat, and later faculty-approved vector or video
derivatives. An Adobe image must not become the only carrier of instructional meaning.

## 1. Why this change

The current MS3 Welcome source begins with `media/intro-trailer.mp4`. The checked-in asset is a
78-second, 1920×1080 H.264 stream with no audio stream; its checked-in 1920×1080 poster is almost
entirely dark. The media handoff still says the trailer needs voiceover. The page then repeats the
six-week sequence as a dense hand-maintained list.

The repository already has a stronger optional orientation experience:

- `orientation-video.html` links a 7-minute-51-second MP4 with audio;
- the player has controls and does not autoplay;
- it includes a VTT caption track, chapters, and an interactive transcript; and
- the Orientation Packet supplies the authoritative safety and supervision language.

The current Welcome route is recorded as reviewed/general/low-risk on 2026-06-29. That record
describes the current copy, not this change. Any revised learner-facing Welcome must return to
pending until faculty reviews the exact rendered result.

### Design basis

- Reduce extraneous media and signal the small number of ideas learners need first.
- Keep related labels and destinations together.
- Give learners control over pacing; optional media must never block orientation.
- Use a stable spatial scaffold for recognition, then support later retrieval and transfer with
  separate, focused diagrams.
- Preserve equivalent text, captions, transcript access, keyboard use, and a meaningful reading
  order.

These choices follow multimedia-learning guidance on coherence, signaling, spatial contiguity,
segmenting, and pacing; health-professions evidence supporting retrieval and distributed
practice; W3C guidance for transcripts; and CAST's multiple-means and transfer principles:

- <https://pubmed.ncbi.nlm.nih.gov/33716467/>
- <https://pubmed.ncbi.nlm.nih.gov/37615780/>
- <https://www.w3.org/WAI/media/av/transcripts/>
- <https://udlguidelines.cast.org/>

## 2. Goals

1. Let an MS3 understand the six-week shape of the rotation without playing media.
2. Give every week one accurate, direct starting point.
3. Put the existing immediate-safety escalation rule before the map.
4. Keep the existing captioned/transcribed orientation overview available as optional support.
5. Remove the unused silent trailer and poster from generated MS3 and resident artifacts without
   deleting their historical source assets.
6. Use one structural source for card order, title, and route.
7. Establish a governed Adobe pathway for an optional print companion and later visual-learning
   work without making Adobe files canonical curriculum sources.

## 3. Non-goals

The first work package does **not**:

- add progress, completion, current-week inference, streaks, unlocks, quizzes, self-ratings,
  analytics, or local storage;
- establish competence, readiness, entrustment, or permission to act independently;
- add a diagnostic, treatment, capacity, medication, risk-score, or disposition algorithm;
- add crisis-resource injection to Welcome, which is not itself a risk-work surface;
- reproduce any protected instrument item, anchor, field label, or fillable form;
- add patient, staff, unit, whiteboard, monitor, badge, or chart photography;
- add a web font, external CDN, Adobe embed, rasterized text, or new runtime dependency;
- redesign Today, Path, Library, One Patient, Interview Circle, the Orientation Packet, or the
  resident Welcome; or
- remix, re-record, or restore audio to the retired intro trailer.

The later diagram and Adobe items in section 11 are roadmap work packages, not hidden scope in
the Compass implementation.

## 4. Approved learner experience

### 4.1 Reading and visual order

The MS3 Welcome reads in this order:

1. Existing page title and audience subtitle.
2. Safety/supervision note.
3. Purpose and non-readiness statement.
4. Six-Week Compass.
5. A short prompt to choose the relevant week or task.
6. Optional captioned orientation-overview link.
7. Concise retained welcome/support copy and the existing Orientation Packet route.

CSS may change columns but may not change this DOM order.

### 4.2 Exact safety and scope language

The safety note reproduces the Orientation Packet's existing Single Safety Rule exactly:

> If you are worried about immediate safety, tell the resident or attending now. Do not wait for
> rounds. Do not carry it alone.

It links to `?page=orientation.md`. It does not repeat the trigger list, branch to independent
actions, or render a crisis-resource block.

The map's exact scope statement is:

> This map supports orientation, supervised practice, and reflection. It is not a checklist,
> clinical protocol, or measure of readiness. Using or viewing this map does not establish
> competence, entrustment, or permission to act independently.

The prompt below the cards is:

> Choose the week or task you are preparing to discuss with your supervising team.

The optional-media link is:

> Optional: watch the captioned orientation overview (transcript available)

It targets `?tool=orientation-video.html`.

### 4.3 Card contract

Each card contains only:

- visible `Week N`;
- the canonical `learningPaths.ms3.weeks[].title`;
- one link labeled `Open Week N`; and
- optional decoration that carries no meaning.

The cards do not display `theme`, `items`, `focusCategories`, minutes, progress, or completion.

| Order | Canonical title | Structural destination |
|---:|---|---|
| 1 | Foundations & the MSE | `week1.md` |
| 2 | Mood, Psychosis & Pharm | `week2.md` |
| 3 | Psychotherapy & Personality | `week3.md` |
| 4 | Family Systems & EE | `week4.md` |
| 5 | Acute & Emergency | `week5.md` |
| 6 | Integration & Exam | `week6.md` |

These values document the approved current mapping; implementation does not copy this table into
another renderer.

### 4.4 Existing Welcome copy

Implementation removes:

- the `intro-trailer.mp4` player;
- the hand-maintained `Your weekly arc` list, because the generated Compass replaces it;
- the brittle enumerated `Tools you'll actually use at the bedside` sentence, which can drift
  from rights and route governance; and
- the old `Start here` sentence where it duplicates or conflicts with the new hierarchy.

The page retains its title/subtitle, concise rotation purpose, supervised-team framing, support
and feedback description, Orientation Packet link, and no-PHI footer. Any editing of those
retained paragraphs remains faculty-controlled.

`topic_meta.json["welcome.md"]` changes only enough to describe the new first-visit route and
remove the stale `Today / Progress` wording. The exact replacement is:

```json
{
  "tldr": "Start with the Six-Week Compass and Orientation Packet, then choose the resource relevant to the task you are preparing to discuss with your supervising team.",
  "points": [
    "The Compass is a wayfinding map, not a checklist, clinical protocol, or measure of readiness.",
    "Review the Orientation Packet's safety and supervision boundaries before using bedside tools.",
    "Use the optional captioned orientation overview when a narrated walkthrough helps; the transcript provides the non-video route."
  ]
}
```

The existing `read`, `workflowStages`, `workflowModes`, `relatedTools`, `communicationCases`, and
`clinicalWorkflow` values remain exactly unchanged. Any proposed change to those fields returns
for review.

## 5. Visual and interaction specification

### 5.1 Layout

- The component is a labelled `<section>` containing an `<ol>` of six `<li>` cards.
- `.ms3-compass` is the named inline-size container; the ordered list is its queryable descendant.
- The list uses a `0.75rem` gap and `minmax(0, 1fr)` tracks.
- Below a measured Compass-container width of `22rem`, cards form one column.
- From `22rem` through less than `30rem`, cards form a 2×3 grid.
- At `30rem` and wider, cards form a 3×2 grid.
- No horizontal scrolling is introduced.
- Ordered numbering carries sequence; the first release adds no connector line or icon.

Use CSS container queries, not viewport-media-query guesses. Browser checks at 390px, 561px, and
736px viewports must first measure the actual `.ms3-compass` inline size, then assert the matching
1-, 2-, or 3-column contract above. A six-card single row is never a production state, even though
it was useful in the wide concept comparison.

### 5.2 Visual language

- Reuse the existing Clinical Warm front-door tokens in `clinical-warm.css`: warm page/surface,
  dark-brown text, terracotta emphasis, teal links, and the existing danger/focus roles.
- Add component rules to `frontdoor/frontdoor.css`; do not place style attributes in generated
  markup.
- Reuse the existing Georgia/system-sans typography; do not add a font.
- Use text and numbers as the primary anchors. Icons are unnecessary in the first release.
- Do not animate the component. Existing shell navigation motion remains outside this scope.

### 5.3 Accessibility

- The map remains complete with CSS disabled.
- Links have descriptive visible labels and native semantics.
- Tab order follows the DOM from Week 1 through Week 6, then optional orientation.
- Existing focus tokens provide a visible focus indicator; the component must not suppress it.
- Color, position, connector lines, and decoration never carry unique meaning.
- Text reflows at 200% zoom and 320px without clipping or overlap.
- There is no required motion, hover-only disclosure, drag interaction, or pointer-only target.
- Link targets are at least 44×44 CSS pixels on coarse pointers.

## 6. Source-of-truth and build architecture

### 6.1 Structural data

`curriculum.json` remains structural only. Add an optional `landingRef` property to the week
schema, and require it on every MS3 week. Set the six MS3 values to `week1.md` through `week6.md`.
Resident weeks may omit the field until a separately approved resident design needs it.

The schema and `validate_curriculum.py` run before final navigation exists. They reject an MS3
Compass contract when:

- there are not exactly six contiguous week numbers 1–6;
- `landingRef` is absent, duplicated, or not a non-empty string;
- a `landingRef` does not resolve to a manifest-registered MS3 destination; or
- a resolved destination is not Markdown.

After navigation is constructed, `build_deploy.py` performs the audience-specific check: every
MS3 `landingRef` must appear exactly once in the finalized `nav` projection with `k: "md"`. The
hidden Orientation week rows are generated from the same `n`, `title`, and `landingRef` values as
the Compass (`Week N — {title}`), replacing their current hand-authored title/route list. A missing,
duplicate, wrong-kind, or mismatched derived row aborts before `nav.json` is written.

The visible title comes from the same week object. The renderer has no hand-authored list of
titles or routes.

### 6.2 Safety-copy source

Add invisible boundary comments around the existing Single Safety Rule in the Orientation Packet:

```md
<!-- single-safety-rule:start -->
If you are worried about immediate safety, tell the resident or attending now.
Do not wait for rounds. Do not carry it alone.
<!-- single-safety-rule:end -->
```

The visible Orientation Packet wording does not change. The Compass renderer extracts the one
marked block, normalizes whitespace, HTML-escapes it, and renders it as one paragraph. This keeps
the packet human-readable and authoritative without putting clinical prose in `curriculum.json`
or a second registry.

Missing, repeated, empty, or nested markers fail the build. The renderer never searches for an
unmarked sentence or heading.

### 6.3 Rendering owner

Create `13_Faculty_Resources/_automation/site_build/welcome_compass.py` as the only rendering
owner. It exposes pure functions that:

1. validate/prepare six card records from the MS3 learning path;
2. extract the marked Single Safety Rule;
3. render escaped semantic HTML; and
4. replace exactly one `<!-- ms3-six-week-compass -->` marker.

`MS3_Inpatient_Rotation_OnePager.md` contains the marker, not six hand-maintained cards.
The marker sits immediately after the existing audience subtitle and before the retained Welcome
prose, so the generated safety/scope/map sequence is the first instructional content on the page.

`build_deploy.py` loads `curriculum.json` once before the Markdown copy loop, injects the Compass
only when the destination is `welcome.md`, and reuses the same parsed curriculum later for the
front-door payload. Injection happens after the source is copied and before static QA. Generated
HTML is written only to `_build/ms3/content/welcome.md`; no generated HTML is written back to the
source tree.

### 6.4 Built-output contract

The generated structure has stable test hooks:

```html
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
```

Each card link carries `data-ms3-compass-link` and the exact href `?page=weekN.md`. The MS3 output
contains exactly one root, one safety note, one labelled section, one ordered list, six uniquely
numbered cards, six week links in order, one prompt, and one optional-video link. Classes own
presentation; `data-*` attributes own deterministic tests.

The resident build begins from the MS3 artifact but replaces `welcome.md` with
`resident_welcome.md`. A build assertion verifies resident `welcome.md` contains no
`data-ms3-compass-root`; resident source, rendered copy, route, and onboarding video are otherwise
unchanged. Only the unreferenced retired MS3 trailer assets are excluded from resident generated
media.

## 7. Media lifecycle

Removing only the page embed would leave unused LFS media in every generated site. Retirement is
therefore a deploy-state requirement:

1. Remove the Welcome embed.
2. Remove `intro-trailer.mp4` and `intro-trailer-poster.jpg` from `VIDEO_MEDIA`.
3. Keep the checked-in source assets and design provenance; deletion is outside this work package.
4. Update the video-library README so it no longer says the intro is a live hero or needs a new
   voiceover for release.
5. Add this exact unserved retirement record to `media_manifest.json`'s `video` array and amend
   `_note` to distinguish retained source assets from generated-site assets:

   ```json
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
   ```

   Do not add the orientation MP4 as `served: true` in this work package. It currently ships under
   `/tools/`, while the production canary intentionally accepts monitored media only under
   `/audio/`, `/audio_oe/`, or `/media/`. Direct build, static, and Playwright checks cover the
   orientation package here; changing its storage or expanding canary scope requires a separate
   design decision and tests.
6. Verify neither generated site's media directory, service worker, preload list, nor page source
   contains the retired trailer or poster.

`day-in-the-life.mp4` remains unchanged. The tool-spotlight backlog remains unchanged.

The optional orientation route is allowed only when all four package files are present and real,
not LFS pointer stubs:

- `orientation-video.html`
- `Inpatient_Psych_Orientation.mp4`
- `Inpatient_Psych_Orientation.vtt`
- `poster.jpg`

Its player remains controls-first and non-autoplay. This is a deliberate contract: the overview is
optional for learners, but once the Welcome page links it, the package is a required intact
destination. A broken or incomplete package fails the build rather than producing a dead optional
link; the static Compass still provides the complete orientation route without requiring playback.

Before learner release, a named faculty reviewer listens through the full MP4 while checking every
VTT cue, confirms that the interactive transcript is generated from that reviewed VTT, and records
the outcome in `docs/pilots/ms3-six-week-compass-review.md`. The evidence packet is created only
after the work occurs—never pre-filled—and records the reviewer, ISO date, commit, preview, SHA-256
of the MP4 and VTT, full-duration check, material discrepancies found, and approved/not-approved
outcome. If a discrepancy requires a VTT edit, the Welcome-link release stops for a separately
scoped caption correction and orientation-tool re-review; this work package does not silently edit
reviewed media.

## 8. Governance and privacy

- When implementation changes the Welcome source, replace its ledger record with `status:
  "pending"`, retain `risk: {"kind": "general", "level": "low"}`, set `reason` exactly to
  `Six-Week Compass and onboarding hierarchy awaiting faculty review.`, set `by` exactly to
  `Pending faculty review`, and set `at` to the actual ISO date it enters review.
- After a named faculty reviewer reviews the exact generated MS3 page and metadata, that human may
  set `status` to `reviewed`, remove `reason`, set `at` to the actual review date, and set `by` to
  their real reviewer label. An agent or green build must not invent or apply that decision.
- Faculty review covers the six titles/routes, Single Safety Rule reproduction, non-readiness
  copy, optional-video framing, retained Welcome copy, and the rendered mobile/desktop result.
- Technical checks, Adobe review, a green PR, or a Netlify preview do not equal clinical or release
  approval.
- No patient data, clinical-system content, free-text capture, analytics, or learner-performance
  state is introduced.
- The Compass teaches navigation. Faculty and the supervising team retain authority for clinical
  decisions, feedback, assessment, and entrustment.
- No protected instrument content appears in the Compass or its Adobe derivatives.

## 9. Failure behavior

The build fails with a targeted message when:

- the Welcome marker is missing or repeated;
- the safety-copy markers are missing, repeated, empty, or malformed;
- the MS3 learning path is absent or is not exactly six contiguous weeks;
- a card title or `landingRef` is invalid or unresolved;
- rendering leaves an unconsumed marker;
- the optional orientation route is configured but its player/media/caption/poster package is
  incomplete;
- a retired intro reference or copied asset survives in generated output; or
- the Compass leaks into resident Welcome.

The renderer escapes all registry and extracted text. It adds no browser storage, network fetch,
or client-side rendering path, so there is no runtime loading state to recover from. If the build
cannot produce a trustworthy map, it must not silently fall back to the old video or a partial
card set.

## 10. Verification and release evidence

### 10.1 Automated checks

- Unit-test the renderer with valid, missing, repeated, reordered, maliciously escaped, and
  unresolved inputs.
- Extend curriculum schema/validator tests for required MS3 `landingRef` behavior.
- Assert exactly six generated links match the MS3 week number/title/order and resolve to shipped
  destinations.
- Assert exact equality between the normalized marked safety block and generated safety text.
- Assert the tracked Welcome source retains exactly one marker; built MS3 Welcome retains zero
  unconsumed markers and contains exactly one `data-ms3-compass-root`.
- Assert no old trailer reference or asset exists in either generated site.
- Assert the orientation player and MP4/VTT/poster package exist in MS3 output.
- Assert resident Welcome has no Compass content while resident-specific orientation remains.
- Run `node --test tests/*.test.mjs` and the Python contract suites.
- Run `bash bin/verify.sh` without `--quick`.
- Build `ms3` and then `res` sequentially with `build_and_check.sh`.

### 10.2 Browser and assistive-technology checks

- 736px visual/layout review with a measured Compass container at or above `30rem` and three
  columns.
- 561px review with a measured Compass container from `22rem` to less than `30rem` and two columns.
- 390px and 320px layout with no horizontal overflow.
- Keyboard-only reading and activation in Week 1→6 order.
- 200% zoom and text reflow.
- Light/dark contrast and visible focus.
- Reduced-motion setting, confirming the Compass adds no motion.
- Pending preview: confirm the shell's pending-governance notice is announced, then confirm the
  Compass's internal order is safety → scope → ordered six-week list → prompt → optional
  orientation → retained support copy.
- Post-review release: confirm the shell's reviewed receipt and page title are announced, then the
  same internal Compass order. The shell receipt is not part of the generated Compass component.
- Optional-video route: controls, captions, transcript, chapter controls, and back navigation.
- Fresh learner and returning learner states, confirming the map does not infer or show current,
  completed, or future weeks.

The repository's current visual-baseline project intentionally targets the resident site, so this
focused MS3 change does not repurpose it or add misleading resident screenshots. Deterministic
MS3 DOM/geometry checks live in `front-door.spec.js`; the evidence packet retains full-page review
screenshots at 736px, 561px, 390px, and 320px. A future stored MS3 baseline project would require a
separate workflow-contract change and Ubuntu/Chromium refresh. Manual screen-reader evidence
remains distinct from automated DOM tests.

### 10.3 Pilot

First obtain clerkship/faculty confirmation that the activity is authorized as educational quality
improvement, or obtain the appropriate local determination. Then ask five or six volunteer MS3
learners to complete three predefined synthetic prompts. At least one named faculty reviewer
separately verifies copy, routes, safety framing, and optional-media framing. Do not record patient
information, accounts, or individual behavioral analytics; retain only an anonymous aggregate
tally in `docs/pilots/ms3-six-week-compass-review.md`.

The three learner prompts are:

1. “You are concerned about immediate safety. Who does this page tell you to contact, and when?”
2. “You are preparing to discuss an acute or emergency topic with your supervising team. Find the
   relevant week and open one next resource.”
3. “Without playing the video, explain what the map does and does not say about your readiness.”

Pass criteria:

- 100% identify the resident or attending as the immediate escalation destination.
- At least 80% of participating MS3 learners find the relevant week and one next resource without
  playing video.
- Every participating MS3 answers “no,” without prompting or clarification, to “Is this page a
  clinical protocol?”, “Does using it show you are ready to act independently?”, and “Does it
  track your completion?” Clarification may diagnose a failed first impression but cannot convert
  it into a release pass; revise and repeat the pilot.
- Faculty judges the labels, links, safety framing, and optional-media framing accurate enough for
  an actual teaching conversation.
- Accessibility checks in section 10.2 produce no blocking finding. A blocking finding is any
  failure of keyboard operation, meaningful reading order, visible focus, caption/transcript
  access, text reflow, required contrast, or complete non-video access to the map's meaning.

If the pilot fails, revise copy or layout and repeat the review. Do not add animation, scoring, or
new media as a shortcut.

## 11. Adobe and visual-learning roadmap

### 11.1 Web MVP

No Adobe-generated asset is required. The six-card map is semantic HTML/CSS because links,
reading order, reflow, dark mode, and assistive technology are functional requirements. A raster
image of the Compass is not an acceptable substitute.

### 11.2 Optional print companion — separate approval after web acceptance

- **Authoring:** Adobe InDesign 2026.
- **Master:** `MS3_Six_Week_Compass_v1.0.0.indd` plus
  `MS3_Six_Week_Compass_v1.0.0.idml` and packaged assets. Include font files only when their
  licenses permit redistribution.
- **Format:** US Letter portrait, 8.5×11 inches, 0.5-inch safe margins, six live-text cards in a
  3×2 grid.
- **Minimum type:** 12pt card titles and 10pt supporting text; use two pages rather than shrink.
- **Label:** supplemental orientation aid; local requirements and supervision govern.
- **Provenance:** source commit, `curriculum.json` digest, safety-copy source revision, reviewer,
  export filename, and SHA-256.
- **Export:** tagged/searchable PDF with title, language, embedded fonts, and link annotations.
- **QA:** Acrobat accessibility/preflight plus manual tag order, reading order, contrast, links,
  font embedding, and printed-page inspection. Render every PDF page to PNG and inspect the proof.
- **Release:** review-only until a separate distribution decision. It never becomes canonical
  curriculum and never blocks the web release.

The non-deployed design package lives in an institutionally approved Adobe Creative Cloud folder
named `Psychiatry Clerkship Library/Six-Week Compass/v1.0.0`, not in the web build. It contains the
INDD, IDML, packaged assets, `MS3_Six_Week_Compass_v1.0.0_review.pdf`,
`MS3_Six_Week_Compass_v1.0.0_acrobat-report.pdf`,
`MS3_Six_Week_Compass_v1.0.0_proof-page-01.png`, and `manifest.json`. The manifest records each
filename and SHA-256 plus the source commit, curriculum digest, safety-copy revision, reviewer,
review date, Acrobat result, print-proof result, and distribution decision. Its font inventory
records family, version, approved install source, redistribution status, and every InDesign Package
warning; when a font cannot be redistributed, the package records the approved install source and
prohibits unreviewed substitution. Because PDFs are
globally ignored in this repository, a later authorized distribution decision must explicitly add
a governed source/location and build-copy rule; an Adobe Cloud file is never silently treated as a
learner download.

Illustrator may supply a text-free six-waypoint decorative motif only after the live-text design
is accepted. Adobe Express is appropriate for optional promotional collateral, not the
instructional map itself.

### 11.3 Later retention diagrams — each requires its own spec and faculty approval

1. **One Patient, Six Weeks evolving-story timeline**
   Four lanes: patient words/observations, new information, working hypothesis, and question for
   supervision. It shows revision and unresolved uncertainty, never an inevitable diagnosis or
   performance score.

2. **Rounds-update retrieval strip**
   A just-in-time sequence cue for hospital day/problem, overnight data, patient/MSE change,
   safety/risk, and the plan question. It is a memory aid, not an automated assessment.

3. **Supervised safety-support map**
   Its first visible step reproduces “If you are worried about immediate safety, tell the resident
   or attending now.” All later assessment, communication, documentation, and debrief branches are
   explicitly supervised. It contains no medication, dose, threshold, score, capacity, treatment,
   or disposition branch.

Web versions remain semantic and text-complete. Illustrator can create vector masters for
approved decorative structure; InDesign can create printable derivatives; Acrobat validates PDFs.
No Adobe file becomes the clinical source.

### 11.4 Optional microvideo and photography — evidence-gated

After the static pilot, a separate decision may test a 20–30-second Compass teaser in Adobe
Express or Premiere/Quick Cut. It must be learner-controlled, non-autoplay, captioned, transcribed,
and redundant with the static map. It uses abstract/vector motion, not distressed-patient imagery
or simulated crisis scenes. The removed voiceover is not restored by default.

Lightroom is used only if faculty and institutional policy approve de-identified environmental
photography. Empty rooms can still expose names, badges, whiteboards, monitors, location details,
reflections, or metadata; every image therefore requires privacy review and metadata removal.
Photography is not planned for the first release.

### 11.5 Collaboration and release surfaces

- **Canva:** optional comment/storyboard surface for non-clinical stakeholders. It is never the
  source for safety copy, week data, final web markup, or a learner download; accepted feedback is
  applied to the governed source and re-reviewed there.
- **Visualize:** the concept comparison already used in conversation is a decision aid, not a
  shipped or review-attested artifact.
- **GitHub:** the isolated branch and, only when separately authorized, a pull request carry code,
  tests, the written evidence packet, and human review discussion. A green check is not faculty or
  release approval.
- **Netlify:** only a separately authorized deploy preview may support rendered review. It remains
  a preview; production deployment follows the human merge/release decision.

## 12. Expected implementation surface

The later implementation plan may modify only the focused set below unless new evidence requires
another approval:

- `13_Faculty_Resources/Outreach/MS3_Inpatient_Rotation_OnePager.md`
- `14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md` (marker comments only)
- `curriculum.json`
- `curriculum.schema.json`
- `13_Faculty_Resources/_automation/validate_curriculum.py`
- `13_Faculty_Resources/_automation/test_validate_curriculum.py`
- `topic_meta.json` (`welcome.md` metadata only)
- `13_Faculty_Resources/reviewed.json` (`welcome.md` status only until faculty action)
- `13_Faculty_Resources/_automation/site_build/welcome_compass.py` (new)
- `13_Faculty_Resources/_automation/site_build/test_welcome_compass.py` (new)
- `13_Faculty_Resources/_automation/site_build/build_and_check.sh` (run both new Python suites
  before their production code/validator)
- `13_Faculty_Resources/_automation/site_build/build_deploy.py`
- `13_Faculty_Resources/_automation/site_build/resident_section.py` (resident-absence assertion)
- `13_Faculty_Resources/_automation/site_build/frontdoor/frontdoor.css`
- `_prototypes/video-library/README.md`
- `media_manifest.json`
- `tests/smoke/front-door.spec.js`
- `docs/pilots/ms3-six-week-compass-review.md`, created only after human evidence is collected

The checked-in MP4/poster source files are not deleted. No Netlify, GitHub, Adobe, or Canva
external state changes are part of implementation without separate authorization.

## 13. Delivery sequence and authority gates

1. User reviews this written specification.
2. Write a separate implementation plan from the reviewed spec.
3. Implement in an isolated branch with test-first changes.
4. Generate MS3 then resident outputs and collect automated/manual evidence.
5. Present the exact rendered MS3 preview to faculty; keep `welcome.md` pending.
6. A named faculty reviewer confirms the exact pending copy, routes, and safety framing are
   appropriate to show in a limited pilot; separately, the appropriate local authority determines
   whether and how the educational-QI activity may proceed.
7. Run the pilot, record only aggregate evidence, and revise/repeat if a criterion fails.
8. Faculty reviews the final rendered behavior and pilot evidence, then may re-attest and approve
   broad learner release.
9. Open or update a GitHub PR only when authorized.
10. Use a Netlify deploy preview for review only when authorized.
11. Merge and production deployment remain human decisions; later diagram and Adobe packages
    retain separate approval gates.

## 14. Acceptance contract

The Compass work package is complete only when all of the following are true:

- neither generated site contains `/media/intro-trailer.mp4` or
  `/media/intro-trailer-poster.jpg`, no generated HTML/Markdown/CSS/JS references either path, and
  `VIDEO_MEDIA` lists neither file;
- MS3 Welcome contains exactly one semantic six-card map sourced from `curriculum.json`;
- all six routes resolve and their order/title match the canonical registry;
- the exact Single Safety Rule is sourced from the marked Orientation Packet text;
- the non-readiness statement is visible and no progress/authority behavior exists;
- the optional orientation link is not primary and its accessible media package is intact;
- the map works at required widths, zoom, themes, keyboard, and screen-reader order;
- resident Welcome source, rendered copy, route, and onboarding video are unchanged, while the
  retired MS3 trailer assets remain absent from resident generated media;
- technical gates pass without dismissing report-only findings;
- the locally authorized pilot meets its predefined thresholds and the human evidence packet is
  complete;
- faculty reviews the exact revised learner surface and pilot evidence before broad release; and
- any InDesign/PDF/video/diagram derivative remains non-canonical and separately approved.

## 15. Next-best and innovative options

**Next-best option:** if the Compass pilot shows that learners understand the rotation arc but
still cannot orient to a first day, design a separate Day-on-the-Unit map from the existing daily
rhythm. It must state that the supervising team sets sequence and patient-care priorities.

**Innovative option:** generate both the web Compass and an InDesign-ready merge record from the
same approved structural projection and safety-copy revision. A proof manifest can bind the print
export to the exact source commit and digest, preventing quiet drift between web, PDF, and faculty
review.
