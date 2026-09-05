import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const welcomePath = join(
  repoRoot,
  "13_Faculty_Resources/Outreach/MS3_Inpatient_Rotation_OnePager.md",
);
const orientationPath = join(
  repoRoot,
  "14_Tracks/MS3/Student_Ready_Pack/01_orientation/MS3_orientation_packet.md",
);
const topicMetaPath = join(repoRoot, "topic_meta.json");
const reviewedPath = join(repoRoot, "13_Faculty_Resources/reviewed.json");
const crisisResourcesPath = join(repoRoot, "crisis_resources.json");
const instrumentRightsPath = join(repoRoot, "instrument_rights.json");
const mediaManifestPath = join(repoRoot, "media_manifest.json");
const buildDeployPath = join(
  repoRoot,
  "13_Faculty_Resources/_automation/site_build/build_deploy.py",
);
const retiredIntroPaths = [
  "_prototypes/video-library/intro-trailer.mp4",
  "_prototypes/video-library/intro-trailer-poster.jpg",
];
const optionalOrientationPaths = new Set([
  "tools/orientation-video.html",
  "tools/Inpatient_Psych_Orientation.mp4",
  "tools/Inpatient_Psych_Orientation.vtt",
  "tools/poster.jpg",
]);

const COMPASS_MARKER = "<!-- ms3-six-week-compass -->";
const SAFETY_START = "<!-- single-safety-rule:start -->";
const SAFETY_END = "<!-- single-safety-rule:end -->";
const SUBTITLE =
  "### UNE COM third-year clerkship · with Joshua Moss, MD · Maine Medical Center – Sanford";
const FIRST_RETAINED_PARAGRAPH =
  "Welcome. This rotation is built as a **structured six-week arc**";
const SAFETY_RULE =
  "If you are worried about immediate safety, tell the resident or attending now. " +
  "Do not wait for rounds. Do not carry it alone.";
const SCOPE_COPY =
  "This map supports orientation, supervised practice, and reflection. It is not a checklist, " +
  "clinical protocol, or measure of readiness. Using or viewing this map does not establish " +
  "competence, entrustment, or permission to act independently.";
// Independent literal allowlist copied from the approved design specification. The renderer
// under test does not build or supply this expectation.
const EXPECTED_COMPASS_FRAGMENT =
  '<div data-ms3-compass-root>' +
  '<aside data-ms3-compass-safety role="note">' +
  '<p>If you are worried about immediate safety, tell the resident or attending now. ' +
  'Do not wait for rounds. Do not carry it alone.</p>' +
  '<a href="?page=orientation.md">Open the Orientation Packet</a></aside>' +
  '<p data-ms3-compass-scope>This map supports orientation, supervised practice, and reflection. ' +
  'It is not a checklist, clinical protocol, or measure of readiness. Using or viewing this map ' +
  'does not establish competence, entrustment, or permission to act independently.</p>' +
  '<section class="ms3-compass" data-ms3-compass aria-labelledby="ms3-compass-title">' +
  '<h2 id="ms3-compass-title">Six-Week Compass</h2>' +
  '<ol class="ms3-compass__weeks" data-ms3-compass-weeks>' +
  '<li data-ms3-compass-week="1"><span>Week 1</span><h3>Foundations &amp; the MSE</h3>' +
  '<a data-ms3-compass-link href="?page=week1.md">Open Week 1</a></li>' +
  '<li data-ms3-compass-week="2"><span>Week 2</span><h3>Mood, Psychosis &amp; Pharm</h3>' +
  '<a data-ms3-compass-link href="?page=week2.md">Open Week 2</a></li>' +
  '<li data-ms3-compass-week="3"><span>Week 3</span><h3>Psychotherapy &amp; Personality</h3>' +
  '<a data-ms3-compass-link href="?page=week3.md">Open Week 3</a></li>' +
  '<li data-ms3-compass-week="4"><span>Week 4</span><h3>Family Systems &amp; EE</h3>' +
  '<a data-ms3-compass-link href="?page=week4.md">Open Week 4</a></li>' +
  '<li data-ms3-compass-week="5"><span>Week 5</span><h3>Acute &amp; Emergency</h3>' +
  '<a data-ms3-compass-link href="?page=week5.md">Open Week 5</a></li>' +
  '<li data-ms3-compass-week="6"><span>Week 6</span><h3>Integration &amp; Exam</h3>' +
  '<a data-ms3-compass-link href="?page=week6.md">Open Week 6</a></li>' +
  '</ol></section>' +
  '<p data-ms3-compass-prompt>Choose the week or task you are preparing to discuss with your ' +
  'supervising team.</p>' +
  '<a data-ms3-compass-orientation href="?tool=orientation-video.html">Optional: watch the ' +
  'captioned orientation overview (transcript available)</a>' +
  '</div>';

const EXPECTED_WELCOME = `# Inpatient Psychiatry — Your 6-Week MS3 Rotation
### UNE COM third-year clerkship · with Joshua Moss, MD · Maine Medical Center – Sanford

<!-- ms3-six-week-compass -->

Welcome. This rotation is built as a **structured six-week arc** so that wherever you are in the year, you get the same strong foundation in inpatient psychiatry — and prepare for the shelf and a future sub-internship.

The hub is meant to be useful in the moment: a structured sequence from foundations to integration, plus bedside tools, clinical one-pagers, and readings you can navigate by week, topic, or tool. Use it when it helps you prepare for rounds, understand a patient, practice a skill, or review for the exam.

**What you'll do.** Work as part of the treatment team on the inpatient unit: interview and follow patients, build differentials and formulations, present on rounds, participate in family meetings, and practice safe, evidence-based management under direct supervision.

**Also included:** short teaching one-pagers for the core diagnoses, a differential-diagnosis "can't-miss" guide, a landmark-article reading pathway, practice OSCE stations, and a shelf high-yield review.

**How you'll be supported & evaluated.** Direct supervision with frequent formative feedback, observed interviews and presentations, case discussion, and teaching rounds. Clear expectations and entrustment levels so you always know what "doing well" looks like.

Next: [open the Orientation Packet](?page=orientation.md).

*Educational overview for students. Fictional composites only; no PHI. Joshua Moss, MD | Psychiatrist.*
`;

const EXPECTED_WELCOME_SUMMARY = {
  tldr: "Start with the Six-Week Compass and Orientation Packet, then choose the resource relevant to the task you are preparing to discuss with your supervising team.",
  points: [
    "The Compass is a wayfinding map, not a checklist, clinical protocol, or measure of readiness.",
    "Review the Orientation Packet's safety and supervision boundaries before using bedside tools.",
    "Use the optional captioned orientation overview when a narrated walkthrough helps; the transcript provides the non-video route.",
  ],
};

// Literal projection copied independently from commit
// 7eb4ace0301e163139208e8dc9f05b3aab5f79ea.
const BASELINE_WELCOME_NEIGHBORS = {
  read: 3,
  workflowStages: ["encounter", "team", "exam"],
  workflowModes: ["ward", "5min", "shelf"],
  relatedTools: ["review.html", "communication-practice.html", "oral.html"],
  communicationCases: [
    "guardedness_privacy_001",
    "suicide_direct_question_001",
  ],
  clinicalWorkflow: {
    ask: "Before you open a patient page, ask what you need right now: orientation, bedside action, communication rehearsal, rounds prep, or shelf review.",
    mse: "Use the MSE tool when you need language for what you actually observed rather than a generic descriptor.",
    safety: "If the question is immediate suicide, violence, withdrawal, delirium, catatonia, or capacity, escalate to supervision before studying around it.",
    say: "I am using the hub to prepare my questions and presentation, but I will bring safety or treatment decisions to the supervising team.",
    collateral: "Keep patient identifiers out of notes, tools, search, AI, or exports; use fictional or fully de-identified practice only.",
    rounds: "Pick one page, one tool, and one question to bring to the team rather than trying to read the whole library.",
    exam: "Use shelf mode and daily review for retrieval practice; use patient pages to organize the facts.",
    actions: [
      { label: "Open orientation", href: "?page=orientation.md" },
      { label: "Open daily review", href: "?tool=review.html" },
    ],
  },
};

const welcome = readFileSync(welcomePath, "utf8");
const orientation = readFileSync(orientationPath, "utf8");
const topicMeta = JSON.parse(readFileSync(topicMetaPath, "utf8"));
const reviewed = JSON.parse(readFileSync(reviewedPath, "utf8"));
const crisisResources = JSON.parse(readFileSync(crisisResourcesPath, "utf8"));
const instrumentRights = JSON.parse(readFileSync(instrumentRightsPath, "utf8"));
const mediaManifest = JSON.parse(readFileSync(mediaManifestPath, "utf8"));
const buildDeploy = readFileSync(buildDeployPath, "utf8");
const crisisContactSignatures = crisisResources.resources
  .flatMap((resource) => [resource.contact, resource.alsoAvailable])
  .filter((value) => typeof value === "string" && value.trim());
const crisisNumericContactTokens = [
  ...new Set(
    crisisContactSignatures.flatMap((signature) =>
      (signature.match(/\+?\d[\d(). -]*\d|\d/g) ?? [])
        .map((token) => token.replace(/\D/g, ""))
        .filter((token) => token.length >= 3),
    ),
  ),
];
const governedInstrumentSignatures = instrumentRights.instruments
  .flatMap((instrument) => instrument.signatures ?? [])
  .filter((value) => typeof value === "string" && value.trim());

function occurrenceCount(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function normalizeWhitespace(value) {
  return value.trim().replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

function normalizedVisibleText(markup) {
  return normalizeWhitespace(
    markup
      .replace(/<[^>]*>/g, " ")
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&#x27;", "'"),
  ).toLocaleLowerCase("en-US");
}

let renderedCompass;

function renderCompass() {
  if (renderedCompass !== undefined) return renderedCompass;
  const rendererDir = join(
    repoRoot,
    "13_Faculty_Resources/_automation/site_build",
  );
  const script = `
import sys
sys.path.insert(0, sys.argv[1])
import welcome_compass as compass
cards = tuple(
    compass.CompassCard(n, title, "week%d.md" % n)
    for n, title in (
        (1, "Foundations & the MSE"),
        (2, "Mood, Psychosis & Pharm"),
        (3, "Psychotherapy & Personality"),
        (4, "Family Systems & EE"),
        (5, "Acute & Emergency"),
        (6, "Integration & Exam"),
    )
)
print(compass.render_compass(cards, ${JSON.stringify(SAFETY_RULE)}))
`;
  renderedCompass = execFileSync("python3", ["-c", script, rendererDir], {
    encoding: "utf8",
  }).trim();
  return renderedCompass;
}

function assertIsoCalendarDate(value) {
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/);
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  assert.equal(parsed.getUTCFullYear(), year, "ISO year must round-trip through UTC");
  assert.equal(parsed.getUTCMonth(), month - 1, "ISO month must round-trip through UTC");
  assert.equal(parsed.getUTCDate(), day, "ISO day must round-trip through UTC");
}

function assertNoGovernanceLeaks(compass) {
  assert.ok(compass.includes(SCOPE_COPY));
  assert.ok(compass.includes("clinical protocol"));
  assert.ok(compass.includes("permission to act independently"));

  const withoutRequiredNegativeScope = compass.replace(SCOPE_COPY, "");
  const visibleText = normalizedVisibleText(withoutRequiredNegativeScope);
  const visibleDigits = visibleText.replace(/\D/g, "");
  for (const signature of crisisContactSignatures) {
    assert.ok(
      !visibleText.includes(normalizeWhitespace(signature).toLocaleLowerCase("en-US")),
      `Compass must not contain crisis contact signature: ${signature}`,
    );
  }
  for (const token of crisisNumericContactTokens) {
    assert.ok(
      !visibleDigits.includes(token),
      `Compass must not contain crisis contact numeric token: ${token}`,
    );
  }
  for (const signature of governedInstrumentSignatures) {
    assert.ok(
      !visibleText.includes(normalizeWhitespace(signature).toLocaleLowerCase("en-US")),
      `Compass must not contain governed instrument signature: ${signature}`,
    );
  }
  const forbiddenPatterns = [
    /\b(?:C-SSRS|Columbia Suicide Severity Rating Scale|BFCRS|CIWA-Ar|COWS|Stanley-Brown)\b/i,
    /<(?:form|input|textarea|select|option)\b/i,
    /\b(?:patient[_ -]?(?:name|id)|medical record number|MRN|date of birth|DOB)\b/i,
    /\b(?:localStorage|sessionStorage|indexedDB|sendBeacon|XMLHttpRequest|analytics|telemetry)\b/i,
    /\bfetch\s*\(/i,
    /<(?:progress|meter)\b/i,
    /\b(?:data|name|id)-?(?:progress|score|streak|completion)\s*=/i,
    /\b(?:you (?:may|can|should)|permission is granted to) act independently\b/i,
    /\bgrants? permission to act independently\b/i,
  ];
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(withoutRequiredNegativeScope, pattern);
  }
}

test("Welcome has one Compass marker between the subtitle and retained prose", () => {
  assert.equal(occurrenceCount(welcome, COMPASS_MARKER), 1);
  const subtitleIndex = welcome.indexOf(SUBTITLE);
  const markerIndex = welcome.indexOf(COMPASS_MARKER);
  const retainedIndex = welcome.indexOf(FIRST_RETAINED_PARAGRAPH);
  assert.ok(subtitleIndex >= 0, "audience subtitle must remain present");
  assert.ok(markerIndex > subtitleIndex, "Compass marker must follow the subtitle");
  assert.ok(
    markerIndex < retainedIndex,
    "Compass marker must precede the retained Welcome paragraph",
  );
});

test("Welcome removes the retired intro hierarchy and readiness claim", () => {
  for (const forbidden of [
    "intro-trailer.mp4",
    "intro-trailer-poster.jpg",
    "Your weekly arc",
    "Tools you'll actually use at the bedside",
    "**Start here:**",
    "leave ready for the shelf and your sub-internship",
  ]) {
    assert.ok(!welcome.includes(forbidden), `Welcome must not contain ${forbidden}`);
  }
  assert.ok(
    welcome.includes("prepare for the shelf and a future sub-internship"),
    "Welcome must use the approved neutral preparation phrase",
  );
});

test("retired intro remains source provenance but is absent from generated media configuration", () => {
  for (const relativePath of retiredIntroPaths) {
    assert.ok(statSync(join(repoRoot, relativePath)).size > 0, `${relativePath} must remain non-empty`);
  }
  const videoMediaBlock = buildDeploy.match(/VIDEO_MEDIA=\[[\s\S]*?\n\]/)?.[0] ?? "";
  for (const retiredName of ["intro-trailer.mp4", "intro-trailer-poster.jpg"]) {
    assert.ok(!videoMediaBlock.includes(retiredName), `VIDEO_MEDIA must not copy ${retiredName}`);
  }
});

test("media manifest records exactly one unserved retired intro and no orientation package", () => {
  const retired = mediaManifest.video.filter((entry) => entry.kind === "retired-intro-trailer");
  assert.deepEqual(retired, [
    {
      file: "_prototypes/video-library/intro-trailer.mp4",
      poster: "_prototypes/video-library/intro-trailer-poster.jpg",
      kind: "retired-intro-trailer",
      onDisk: true,
      assetShipped: false,
      served: false,
      retired: true,
      captions: false,
      textAlt: null,
      note: "The source MP4 and _prototypes/video-library/intro-trailer-poster.jpg both remain on disk for provenance; neither is copied into or referenced by either generated learner site.",
    },
  ]);
  assert.equal(
    mediaManifest.video.filter(
      (entry) => Object.values(entry).some(
        (value) => typeof value === "string" && optionalOrientationPaths.has(value),
      ),
    ).length,
    0,
    "the optional orientation package is not a media-manifest record regardless of served state",
  );
});

test("Welcome matches the approved retained-content shape exactly", () => {
  assert.equal(welcome, EXPECTED_WELCOME);
});

test("Orientation Packet preserves one exact marked Single Safety Rule", () => {
  assert.equal(occurrenceCount(orientation, SAFETY_START), 1);
  assert.equal(occurrenceCount(orientation, SAFETY_END), 1);
  const start = orientation.indexOf(SAFETY_START) + SAFETY_START.length;
  const end = orientation.indexOf(SAFETY_END);
  assert.ok(start < end, "Single Safety Rule markers must be ordered");
  assert.equal(normalizeWhitespace(orientation.slice(start, end)), SAFETY_RULE);
});

test("Welcome metadata uses the approved summary and preserves neighboring fields", () => {
  const actual = topicMeta["welcome.md"];
  assert.deepEqual(
    { tldr: actual.tldr, points: actual.points },
    EXPECTED_WELCOME_SUMMARY,
  );
  assert.deepEqual(
    {
      read: actual.read,
      workflowStages: actual.workflowStages,
      workflowModes: actual.workflowModes,
      relatedTools: actual.relatedTools,
      communicationCases: actual.communicationCases,
      clinicalWorkflow: actual.clinicalWorkflow,
    },
    BASELINE_WELCOME_NEIGHBORS,
  );
});

test("Welcome governance is pending without claimed human approval", () => {
  const actual = reviewed["welcome.md"];
  assert.deepEqual(
    {
      status: actual.status,
      risk: actual.risk,
      reason: actual.reason,
      by: actual.by,
    },
    {
      status: "pending",
      risk: { kind: "general", level: "low" },
      reason: "Six-Week Compass and onboarding hierarchy awaiting faculty review.",
      by: "Pending faculty review",
    },
  );
  assertIsoCalendarDate(actual.at);
});

test("Compass markup remains wayfinding-only and preserves negative scope language", () => {
  const compass = renderCompass();
  assert.equal(compass, EXPECTED_COMPASS_FRAGMENT);
  assertNoGovernanceLeaks(compass);
});

const GOVERNANCE_MUTATIONS = [
  ["canonical crisis contact", "<p>Text HOME to 741741</p>"],
  ["protected item signature", "<p>wished you were dead</p>"],
  ["patient identifier", '<input name="patientId">'],
  ["storage or tracking API", "<script>localStorage.setItem('week', '1')</script>"],
  ["progress or score field", '<progress id="score" max="6"></progress>'],
  ["affirmative independent-action", "<p>You may act independently.</p>"],
];

for (const [label, insertion] of GOVERNANCE_MUTATIONS) {
  test(`Compass governance guard rejects mutation: ${label}`, () => {
    assert.throws(() => assertNoGovernanceLeaks(`${renderCompass()}${insertion}`));
  });
}

test("Compass governance guard accepts the required negative scope phrases", () => {
  assert.doesNotThrow(() => assertNoGovernanceLeaks(renderCompass()));
});

test("Compass governance guard rejects every canonical crisis contact", () => {
  for (const signature of crisisContactSignatures) {
    assert.throws(() =>
      assertNoGovernanceLeaks(`${renderCompass()}<p>${escapeHtml(signature)}</p>`),
    );
  }
  for (const token of crisisNumericContactTokens) {
    assert.throws(() =>
      assertNoGovernanceLeaks(`${renderCompass()}<p>${token}</p>`),
    );
  }
});

test("Compass governance guard rejects every governed instrument signature", () => {
  for (const signature of governedInstrumentSignatures) {
    assert.throws(() =>
      assertNoGovernanceLeaks(`${renderCompass()}<p>${escapeHtml(signature)}</p>`),
    );
  }
});

test("pending review date guard rejects impossible calendar dates", () => {
  assert.throws(() => assertIsoCalendarDate("2026-02-31"));
});
