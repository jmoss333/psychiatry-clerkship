# Alex Tour Landing Page and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish one polished, public-by-link Alex Tour that guides a six-minute leadership
conversation through resident education, MS3 education and simulation, patient/family infrastructure,
a safe faculty-governance demonstration, and three concrete collaboration questions.

**Architecture:** Build a zero-dependency static page whose semantic anchors are the canonical link
registry. One inline stylesheet renders an editorial route line and one inline script adds progressive
enhancements, a read-only synthetic governance preview, endpoint copy, and printing. Exact CSP hashes
permit only those inline blocks while `connect-src 'none'` prevents the tour itself from making any
network request.

**Tech Stack:** Semantic HTML5, modern CSS, vanilla JavaScript, Node.js 18+ built-in tests, Netlify CLI
26, GitHub CLI, in-app Browser, ImageGen visual concepting.

## Global Constraints

- Complete `2026-07-13-alex-tour-supporting-sites.md` and
  `2026-07-13-alex-tour-sp-safety.md` before publishing this page.
- Do not place the standardized-patient passcode or faculty-console key anywhere in this page,
  repository, screenshots, test artifacts, commands, logs, or Netlify configuration.
- Do not add analytics, forms, cookies, tracking pixels, iframes, backends, external fonts, package
  dependencies, or persistent browser storage.
- Include no PHI, real patient scenarios, learner data, institutional claims, or unsupported outcome
  metrics.
- The faculty preview is synthetic and read-only; the production console remains unchanged and
  credential-gated.
- The page must work without JavaScript. JavaScript may enhance controls but may not inject or replace
  destination URLs.
- Every external destination appears once as a semantic anchor, opens in a new tab, and has
  `rel="noopener noreferrer"`.
- A `noindex` header limits discovery; it is not authentication. Write the page as safe if forwarded.
- Use the preferred Netlify slug `psychiatry-workforce-tour`; use
  `faculty-governed-psychiatry-tour` only if the preferred slug is unavailable at creation time.
- Stop for Joshua's approval of the generated full-page visual concept before writing production CSS.
- Stop publication if any link, CSP hash, header, build, keyboard path, or mobile layout check fails.

---

## File Structure

- Create: `13_Faculty_Resources/Outreach/alex-tour/index.html`
- Create: `13_Faculty_Resources/Outreach/alex-tour/netlify.toml`
- Create: `13_Faculty_Resources/Outreach/alex-tour/README.md`
- Create: `tests/alex-tour-static.test.mjs`
- Create outside Git for concept and comparison images:
  `/Users/jm/.codex/visualizations/2026/07/14/019f5dff-0b19-7e61-9bff-187adaedff58/alex-tour-concepts/`

---

## Task 1: Confirm Release Prerequisites

**Files:** Read only.

- [ ] **Step 1: Verify the two prior plans' outputs**

Run:

```bash
cd "/Users/jm/Psychiatry-Clerkship-Library-alex-tour"
node tests/family-companion-evergreen.test.mjs
bash _prototypes/sp-interview/tests/run-all.sh
```

Expected: the family companion is evergreen and all standardized-patient suites pass.

- [ ] **Step 2: Verify the renamed education-library URL**

Use the exact URL recorded by the supporting-sites plan. The preferred path is:

```bash
curl -fsSI https://mental-health-education-library.netlify.app/
```

Expected: HTTP 200. If the approved fallback was required, use
`https://mental-health-education-maine.netlify.app/` consistently in the test, page, and README.

- [ ] **Step 3: Verify all fixed external destinations**

Run:

```bash
for url in \
  https://mmc-psychiatry-residents-sanford.netlify.app/ \
  https://une-ms3-psychiatry.netlify.app/ \
  'https://une-ms3-psychiatry.netlify.app/?tool=sp-interview.html' \
  https://clerkship-faculty-attest.netlify.app/ \
  https://reconnect-tools.netlify.app/ \
  https://therapymatch-maine.netlify.app/ \
  https://family-therapy-seminar-companion.netlify.app/; do
  curl -fsSI "$url" >/dev/null || exit 1
done
```

Expected: every URL returns a successful response. Query-string routing must retain
`?tool=sp-interview.html`.

- [ ] **Step 4: Re-run the canonical baselines**

Run:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
git status --short --branch
```

Expected: both builds pass, with only the known unrelated `rapid_review.md` metadata warning if still
present. Repository state contains only the approved branch work.

---

## Task 2: Generate and Approve the Complete Visual Concept

**Skill requirements:** Announce and use `imagegen`, `build-web-apps:frontend-app-builder`, and
`frontend-design:frontend-design` before taking this action.

**Files:** Concept artifacts only, outside Git.

- [ ] **Step 1: Generate one complete desktop concept**

Use ImageGen with this exact prompt:

```text
Create a high-fidelity full-page desktop web design concept at 1440 px width for a private-by-link
leadership conversation titled “Faculty-governed psychiatry workforce education.” This is a quiet,
editorial six-minute guided itinerary, not a SaaS dashboard and not a grid of product cards. A single
functional route line connects three numbered two-minute stops: resident education, MS3 education
and simulation, and patient/family infrastructure. Between stops two and three, bend the line through
a faculty-governance checkpoint with a small read-only attestation-preview panel. End with three
large collaboration questions and a compact related-prototypes list.

Visual language: Deep Harbor #18323A, Tidal Teal #2F6F68, Fog Blue #DCE9E7, restrained Signal Clay
#B75C3D, Paper White #FBFCFA, Slate #5B686B. Use a distinctive humanist sans feel with system-font
realism, compact mono time markers, generous whitespace, strong accessible contrast, visible focus
states, and a memorable route line. Avoid cream-and-serif startup styling, gradients, glassmorphism,
stock photography, floating cards, excessive rounded rectangles, institutional logos, and implied
endorsement. The page should feel clinically rigorous, calm, direct, and suitable for a discussion
between senior psychiatry educators. Show the entire page from hero through footer; text may be
representative but hierarchy and layout must be production-realistic.
```

Store the result under:

```text
/Users/jm/.codex/visualizations/2026/07/14/019f5dff-0b19-7e61-9bff-187adaedff58/alex-tour-concepts/
```

- [ ] **Step 2: Inspect the concept at original detail**

Use the local image viewer at original resolution. Check that the full route, governance checkpoint,
related prototypes, and collaboration questions are visible and that the page is not a dashboard or
generic card grid.

- [ ] **Step 3: Present the concept to Joshua and pause**

Ask one high-leverage question only: approve this visual direction or name the single most important
change. Do not begin production CSS until Joshua approves the concept.

- [ ] **Step 4: Record accepted visual decisions without committing the bitmap**

The accepted concept guides layout, rhythm, and hierarchy. The repository remains code-native and
does not need the concept image at runtime.

---

## Task 3: Add the Failing Static Contract Test

**Files:**

- Create: `tests/alex-tour-static.test.mjs`
- Expected missing initially:
  `13_Faculty_Resources/Outreach/alex-tour/index.html`
- Expected missing initially:
  `13_Faculty_Resources/Outreach/alex-tour/netlify.toml`

- [ ] **Step 1: Write the complete test**

Create `tests/alex-tour-static.test.mjs` with:

```javascript
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(repo, '13_Faculty_Resources/Outreach/alex-tour');
const indexPath = path.join(source, 'index.html');
const configPath = path.join(source, 'netlify.toml');

const destinations = new Map([
  ['resident-library', 'https://mmc-psychiatry-residents-sanford.netlify.app/'],
  ['ms3-library', 'https://une-ms3-psychiatry.netlify.app/'],
  ['sp-interview', 'https://une-ms3-psychiatry.netlify.app/?tool=sp-interview.html'],
  ['faculty-console', 'https://clerkship-faculty-attest.netlify.app/'],
  ['reconnect-tools', 'https://reconnect-tools.netlify.app/'],
  ['therapy-match', 'https://therapymatch-maine.netlify.app/'],
  ['mental-health-library', 'https://mental-health-education-library.netlify.app/'],
  [
    'family-therapy-companion',
    'https://family-therapy-seminar-companion.netlify.app/',
  ],
]);

const questions = [
  [
    'Where should a workforce-education pilot begin: residents, MS3 learners,',
    'or faculty development?',
  ].join(' '),
  [
    'Could faculty attestation, visible review status, and auditable repository history',
    "be adapted to MaineHealth's governance requirements?",
  ].join(' '),
  [
    'What 60–90-day pilot could demonstrate learning value without creating',
    'substantial faculty or operational burden?',
  ].join(' '),
];

const html = fs.readFileSync(indexPath, 'utf8');
const netlify = fs.readFileSync(configPath, 'utf8');

function normalizeText(value) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const pageText = normalizeText(html);

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? match[1] : null;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('base64');
}

test('contains exactly one canonical anchor for every destination', () => {
  const tags = [...html.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
  const registered = tags
    .map((tag) => attribute(tag, 'data-destination'))
    .filter(Boolean)
    .sort();
  assert.deepEqual(registered, [...destinations.keys()].sort());
  for (const [id, href] of destinations) {
    const matches = tags.filter((tag) => attribute(tag, 'data-destination') === id);
    assert.equal(matches.length, 1, `${id} must appear exactly once`);
    assert.equal(attribute(matches[0], 'href'), href, `${id} URL changed`);
  }

  const external = tags.filter((tag) => (attribute(tag, 'href') || '').startsWith('https://'));
  for (const tag of external) {
    assert.equal(attribute(tag, 'target'), '_blank');
    const rel = new Set((attribute(tag, 'rel') || '').split(/\s+/));
    assert.ok(rel.has('noopener'));
    assert.ok(rel.has('noreferrer'));
  }

  const completeAnchors = [...html.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/g)];
  for (const match of completeAnchors) {
    const tag = match[1];
    if (!(attribute(tag, 'href') || '').startsWith('https://')) continue;
    const accessibleName = attribute(tag, 'aria-label') || normalizeText(match[2]);
    assert.ok(accessibleName, `External link has no accessible name: ${tag}`);
  }
});

test('preserves the approved route and questions', () => {
  for (const heading of [
    'Resident education — two minutes',
    'MS3 education and simulation — two minutes',
    'Patient and family infrastructure — two minutes',
  ]) {
    assert.ok(html.includes(heading), `Missing route heading: ${heading}`);
  }
  for (const question of questions) {
    assert.equal(
      pageText.split(question).length - 1,
      1,
      `Question changed or duplicated: ${question}`,
    );
  }
});

test('keeps the governance preview synthetic and read only', () => {
  const start = html.indexOf('<section id="governance-preview"');
  const end = html.indexOf('</section>', start);
  assert.ok(start >= 0 && end > start, 'Governance preview section missing');
  const preview = html.slice(start, end);
  assert.ok(
    preview.includes('Read-only demonstration — synthetic records; no repository access.'),
  );
  assert.ok(preview.includes('Reset demonstration'));
  assert.doesNotMatch(preview, /Save reviews|Submit attestation|Mark all shown reviewed/i);
  assert.ok(html.includes('Production console — faculty credential required'));
});

test('has no duplicate IDs or hidden data pathways', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const hiddenPathways = [
    'fetch\\s*\\(',
    'XMLHttpRequest',
    'sendBeacon',
    'WebSocket',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'document\\.cookie',
  ].join('|');
  assert.equal(new Set(ids).size, ids.length, 'Duplicate HTML id found');
  assert.doesNotMatch(html, /\sstyle="/i, 'Inline style attributes are forbidden');
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, new RegExp(hiddenPathways, 'i'));
  assert.doesNotMatch(html, /gtag\s*\(|google-analytics|plausible|segment\.com|mixpanel/i);
  assert.doesNotMatch(
    html,
    /x-student-key|cw_sp_passcode|GITHUB_TOKEN|FACULTY_ATTEST_PASSWORD/i,
  );
});

test('keeps the endpoint visible once and copies from visible text', () => {
  const endpoint = 'https://sp-interview-proxy.netlify.app/api/sp';
  assert.equal(html.split(endpoint).length - 1, 1);
  assert.match(html, /getElementById\(['"]sp-endpoint['"]\)\.textContent/);
});

test('uses one hashed style and one hashed script block', () => {
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(styles.length, 1);
  assert.equal(scripts.length, 1);
  assert.doesNotMatch(html, /<script\b[^>]+src=/i);

  const styleHash = `sha256-${sha256(styles[0][1])}`;
  const scriptHash = `sha256-${sha256(scripts[0][1])}`;
  assert.ok(netlify.includes(`'${styleHash}'`), `Missing style hash: ${styleHash}`);
  assert.ok(netlify.includes(`'${scriptHash}'`), `Missing script hash: ${scriptHash}`);
  assert.doesNotMatch(netlify, /unsafe-inline/);
});

test('declares accessibility, print, and browser-security contracts', () => {
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /@media\s+print/);
  for (const directive of [
    "default-src 'self'",
    "connect-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ]) {
    assert.ok(netlify.includes(directive), `Missing CSP directive: ${directive}`);
  }
  const headers = [
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['X-Content-Type-Options', 'nosniff'],
    ['X-Frame-Options', 'DENY'],
    ['X-Robots-Tag', 'noindex, nofollow'],
    ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()'],
  ];
  for (const [name, value] of headers) {
    assert.ok(netlify.includes(`${name} = "${value}"`), `Missing header: ${name}`);
  }
});
```

If the Netlify rename used the approved fallback, replace only the
`mental-health-library` URL in this test before its first run.

- [ ] **Step 2: Run the test and verify red**

Run:

```bash
node --test tests/alex-tour-static.test.mjs
```

Expected: `ENOENT` for the missing tour source. Do not weaken the test to make the empty state green.

---

## Task 4: Build the Semantic, No-JavaScript Tour Content

**Files:**

- Create: `13_Faculty_Resources/Outreach/alex-tour/index.html`

- [ ] **Step 1: Create the document shell**

Start with:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="description"
        content="A six-minute guided tour of faculty-governed psychiatry workforce education.">
  <title>Faculty-governed psychiatry workforce education | Joshua Moss, MD</title>
  <style>
  </style>
</head>
<body>
  <a class="skip-link" href="#tour">Skip to the tour</a>
  <header class="site-header" aria-label="Alex Tour introduction">
  </header>
  <main id="tour">
  </main>
  <footer>
    <p>Joshua Moss, MD | Psychiatrist</p>
    <p>Working prototypes for discussion. No patient data. No implied institutional endorsement.</p>
  </footer>
  <div id="tour-status" class="sr-only" aria-live="polite"></div>
  <script>
  </script>
</body>
</html>
```

Maintain exactly one inline `<style>` and one inline `<script>` for the CSP contract.

- [ ] **Step 2: Add the approved first viewport**

Use this exact visible copy:

```text
Faculty-governed psychiatry workforce education
A six-minute guided tour from supervised learning to accountable scale.
Joshua Moss, MD | Psychiatrist
Start the six-minute tour
Working prototypes for discussion. No patient data. No implied institutional endorsement.
```

The start action is an internal anchor to `#resident-education`. Preview the three stops as a compact
ordered itinerary, not three equal product cards.

- [ ] **Step 3: Add route 1**

The heading is exactly:

```text
Resident education — two minutes
```

Include these three observations:

1. Workflow-oriented navigation connects teaching to ward tasks.
2. Clinical reasoning and simulation sit beside reference content.
3. Visible review status distinguishes faculty-attested material from work in progress.

Add the single canonical anchor:

```html
<a href="https://mmc-psychiatry-residents-sanford.netlify.app/"
   data-destination="resident-library" target="_blank" rel="noopener noreferrer">
  Open the resident education library <span aria-hidden="true">↗</span>
</a>
```

- [ ] **Step 4: Add route 2 and the standardized-patient runbook**

The heading is exactly:

```text
MS3 education and simulation — two minutes
```

Add one anchor to the clerkship library and one to **The Interview Room**, using the exact URLs and
destination IDs in the static test. Present these seven instructions in order:

1. Open **The Interview Room**.
2. Select **⚙ setup**. On a fresh tab it opens automatically; the instruction remains useful on a
   returning tab.
3. Confirm **Live patient (LLM proxy)** mode.
4. Confirm the prefilled endpoint shown below.
5. Enter the passcode sent separately by Joshua.
6. Select **Save & test connection**.
7. After **Connected**, choose **Supported** or **Realistic**.

Render the endpoint once as visible text:

```html
<code id="sp-endpoint">https://sp-interview-proxy.netlify.app/api/sp</code>
<button id="copy-endpoint" type="button">Copy endpoint</button>
```

Add this safety note:

```text
Fictional supervised-learning simulation — not clinical decision support.
Do not enter real-patient information. The passcode is sent separately
and is not stored by this tour.
```

- [ ] **Step 5: Add the governance interlude**

Use `<section id="governance-preview">` and begin with this persistent banner:

```text
Read-only demonstration — synthetic records; no repository access.
```

Show the pipeline in visible text:

```text
Faculty reviews source → attestation state is recorded → auditable repository commit
→ learner sites rebuild → review status is visible to learners
```

Include two short columns:

```text
What the pilot proves
Governance is separate from the learner view; the repository remains the source of truth;
saves are auditable; faculty can preview learner-facing material.

What responsible scale would add
Organizational SSO or OAuth; role-based permissions; confirmation for bulk actions;
complete question and evidence review; protected or staged writes;
resident and MS3 preview links.
```

Add local filter controls for **All**, **Pages**, **Tools**, and **Question bank**, an empty container
`#governance-records`, and a **Reset demonstration** button. Add the single production-console anchor
after the demo, labeled exactly **Production console — faculty credential required**.

- [ ] **Step 6: Add route 3**

The heading is exactly:

```text
Patient and family infrastructure — two minutes
```

Explain that the linked work translates the same clinical knowledge into accessible patient, family,
and clinician support; it is downstream infrastructure, not a separate product pitch. Add the single
`reconnect-tools` anchor.

- [ ] **Step 7: Add the compact related-prototypes list**

Use these exact labels and canonical anchors:

- **Working prototype — access and referral navigation** — TherapyMatch Maine
- **Working library — patient and family education** — Mental Health Education Library
- **Teaching companion — family systems and supervision** — Family Therapy Seminar Companion

Do not show a TherapyMatch provider count on the tour.

- [ ] **Step 8: Add exactly three collaboration questions**

Use an ordered list with exactly:

```text
Where should a workforce-education pilot begin: residents, MS3 learners, or faculty development?
Could faculty attestation, visible review status, and auditable repository history be adapted to
MaineHealth's governance requirements?
What 60–90-day pilot could demonstrate learning value without creating substantial faculty or
operational burden?
```

Add a local **Print the meeting prompt** button. It invokes browser printing only and collects no
response.

- [ ] **Step 9: Run the static test**

Run:

```bash
node --test tests/alex-tour-static.test.mjs
```

Expected: content and link assertions begin to pass; style, script behavior, and missing Netlify
configuration remain red.

---

## Task 5: Implement the Accepted Visual System

**Files:**

- Modify: `13_Faculty_Resources/Outreach/alex-tour/index.html`

- [ ] **Step 1: Define the approved tokens**

Begin the inline stylesheet with:

```css
:root {
  color-scheme: light;
  --harbor: #18323A;
  --teal: #2F6F68;
  --fog: #DCE9E7;
  --clay: #B75C3D;
  --paper: #FBFCFA;
  --slate: #5B686B;
  --line: #AFCBC6;
  --measure: 72rem;
  --radius: 0.75rem;
  --shadow: 0 1rem 3rem rgba(24, 50, 58, 0.09);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", sans-serif;
}
```

No font request is made; `Inter` is only used if already installed.

- [ ] **Step 2: Build the editorial route rather than a card grid**

Implement:

- a centered `max-width: var(--measure)` reading column;
- a desktop two-column stop grid with the route marker/line in the narrow column and content in the
  wide column;
- alternating content alignment only where it preserves natural DOM order;
- a single teal route line connecting the three numbered stops;
- a bent/checkpoint treatment for governance using Fog Blue and a small Signal Clay marker;
- flat related-prototype rows separated by rules, not floating cards;
- clear `.external-link`, `.time-marker`, `.route-number`, `.governance-banner`, and `.question-list`
  styles;
- minimum 44-by-44-pixel interactive targets and a visible 3-pixel focus outline.

- [ ] **Step 3: Implement the mobile model**

At `max-width: 48rem`, change the route to one left rail and one content column. Preserve DOM order,
make long URLs wrap, and ensure no element exceeds `100%` viewport width.

- [ ] **Step 4: Add restrained motion and its complete fallback**

The route may draw once after page load by transitioning a scale transform. Add:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 5: Add print rules for a one-page meeting prompt**

Under `@media print`, hide navigation controls, external-action rows, governance interaction controls,
and related-prototype descriptions; show the title, attribution, three route labels, and the three
questions. Remove backgrounds and shadows and use black text on white.

- [ ] **Step 6: Compare the implementation skeleton with the approved concept**

Serve locally, capture a 1440-pixel-wide screenshot, and inspect it beside the concept using the
image viewer. Correct hierarchy, spacing, route-line continuity, and visual density before adding
behavior.

---

## Task 6: Add Progressive Enhancement and the Read-Only Governance Demo

**Files:**

- Modify: `13_Faculty_Resources/Outreach/alex-tour/index.html`

- [ ] **Step 1: Define a small synthetic dataset**

At the start of the inline script, use:

```javascript
(function () {
  'use strict';

  const initialRecords = [
    {
      id: 'mood-overview',
      type: 'Pages',
      audience: 'MS3',
      title: 'Mood disorders overview',
      status: 'Faculty reviewed',
    },
    {
      id: 'interview-room',
      type: 'Tools',
      audience: 'MS3 + resident',
      title: 'Standardized-patient interview',
      status: 'Ready for review',
    },
    {
      id: 'safety-question',
      type: 'Question bank',
      audience: 'MS3',
      title: 'Suicide risk interview item',
      status: 'Evidence check pending',
    },
    {
      id: 'acute-care',
      type: 'Pages',
      audience: 'Resident',
      title: 'Acute-care preparation pathway',
      status: 'Faculty reviewed',
    },
  ];
```

All records are generic and synthetic. Do not use real faculty, learner, patient, course-evaluation,
or production attestation data.

- [ ] **Step 2: Discover destination anchors from the DOM**

Use:

```javascript
  const destinations = [...document.querySelectorAll('a[data-destination]')];
  destinations.forEach((link) => {
    link.addEventListener('click', () => {
      document.getElementById('tour-status').textContent =
        `Opening ${link.textContent.trim()} in a new tab.`;
    });
  });
```

Do not create a JavaScript URL registry and do not replace `href` values.

- [ ] **Step 3: Implement endpoint copy from visible text**

Use:

```javascript
  const copyButton = document.getElementById('copy-endpoint');
  copyButton.addEventListener('click', async () => {
    const endpoint = document.getElementById('sp-endpoint').textContent.trim();
    try {
      await navigator.clipboard.writeText(endpoint);
      copyButton.textContent = 'Endpoint copied';
      document.getElementById('tour-status').textContent = 'Endpoint copied.';
    } catch (error) {
      copyButton.textContent = 'Select the endpoint to copy manually';
      document.getElementById('sp-endpoint').focus();
    }
  });
```

Give `#sp-endpoint` `tabindex="0"` so the fallback has a valid focus target. No secret is involved.

- [ ] **Step 4: Implement local-only governance state**

Use a mutable in-memory copy and render with DOM methods:

```javascript
  let records = initialRecords.map((record) => ({ ...record, demoReviewed: false }));
  let activeFilter = 'All';

  function visibleRecords() {
    return records.filter((record) => activeFilter === 'All' || record.type === activeFilter);
  }

  function renderRecords() {
    const container = document.getElementById('governance-records');
    container.replaceChildren();
    visibleRecords().forEach((record) => {
      const article = document.createElement('article');
      article.className = 'governance-record';

      const heading = document.createElement('h4');
      heading.textContent = record.title;
      article.appendChild(heading);

      const detail = document.createElement('p');
      detail.textContent = `${record.type} · ${record.audience} · ${record.status}`;
      article.appendChild(detail);

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'demo-toggle';
      toggle.setAttribute('aria-pressed', String(record.demoReviewed));
      toggle.textContent = record.demoReviewed
        ? 'Reviewed in demonstration'
        : 'Mark reviewed locally';
      toggle.addEventListener('click', () => {
        record.demoReviewed = !record.demoReviewed;
        renderRecords();
      });
      article.appendChild(toggle);
      container.appendChild(article);
    });
  }
```

Do not use `innerHTML`, network APIs, storage APIs, or production status names that imply a local
toggle has written an attestation.

- [ ] **Step 5: Wire filters and reset**

Give filter buttons `data-governance-filter` values that match the dataset. Then use:

```javascript
  document.querySelectorAll('[data-governance-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      activeFilter = button.dataset.governanceFilter;
      document.querySelectorAll('[data-governance-filter]').forEach((candidate) => {
        candidate.setAttribute('aria-pressed', String(candidate === button));
      });
      renderRecords();
    });
  });

  document.getElementById('reset-governance').addEventListener('click', () => {
    records = initialRecords.map((record) => ({ ...record, demoReviewed: false }));
    activeFilter = 'All';
    document.querySelectorAll('[data-governance-filter]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.governanceFilter === 'All'));
    });
    renderRecords();
    document.getElementById('tour-status').textContent = 'Demonstration reset.';
  });
```

- [ ] **Step 6: Add print and route-load enhancements**

Use:

```javascript
  document.getElementById('print-prompt').addEventListener('click', () => window.print());
  document.documentElement.classList.add('route-ready');
  renderRecords();
}());
```

The internal start anchor and every external link remain usable if this script fails or JavaScript is
disabled.

- [ ] **Step 7: Run the static test**

Run:

```bash
node --test tests/alex-tour-static.test.mjs
```

Expected: all HTML and behavior-source contracts pass except the missing Netlify configuration and
CSP hashes.

---

## Task 7: Add Exact Security Headers and CSP Hashes

**Files:**

- Create: `13_Faculty_Resources/Outreach/alex-tour/netlify.toml`
- Read: `13_Faculty_Resources/Outreach/alex-tour/index.html`

- [ ] **Step 1: Generate the complete configuration from the exact inline block contents**

Run this read-only command after the HTML is final. It prints a complete `netlify.toml` with literal
hashes derived from the current bytes:

```bash
cd "/Users/jm/Psychiatry-Clerkship-Library-alex-tour"
node --input-type=module <<'NODE'
import crypto from 'node:crypto';
import fs from 'node:fs';

const html = fs.readFileSync('13_Faculty_Resources/Outreach/alex-tour/index.html', 'utf8');
function hash(expression, label) {
  const match = html.match(expression);
  if (!match) throw new Error(`Missing ${label} block`);
  return crypto.createHash('sha256').update(match[1]).digest('base64');
}

const styleHash = hash(/<style>([\s\S]*?)<\/style>/, 'style');
const scriptHash = hash(/<script>([\s\S]*?)<\/script>/, 'script');
const policy = [
  "default-src 'self'",
  `script-src 'self' 'sha256-${scriptHash}'`,
  `style-src 'self' 'sha256-${styleHash}'`,
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

console.log(`[build]
  publish = "."

[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy = "${policy}"
    Referrer-Policy = "strict-origin-when-cross-origin"
    X-Content-Type-Options = "nosniff"
    X-Frame-Options = "DENY"
    X-Robots-Tag = "noindex, nofollow"
    Permissions-Policy = "camera=(), microphone=(), geolocation=(), payment=()"`);
NODE
```

Never put a temporary `unsafe-inline` policy into source.

- [ ] **Step 2: Create the Netlify configuration from the generated output**

Use `apply_patch` to create `netlify.toml` with the exact text printed in Step 1. Do not redirect shell
output into a tracked file. The committed configuration therefore contains literal current hashes and
no substitution marker.

- [ ] **Step 3: Prove the CSP is exact**

Run:

```bash
node --test tests/alex-tour-static.test.mjs
if rg -n "unsafe-inline" \
  13_Faculty_Resources/Outreach/alex-tour/netlify.toml; then
  exit 1
fi
```

Expected: all static tests pass and the placeholder/safety search returns no match.

- [ ] **Step 4: Recompute after every later inline edit**

Any CSS or JavaScript edit invalidates its hash. The static test is the mandatory final gate before
each deploy.

---

## Task 8: Add the Operational README and Commit the Page

**Files:**

- Create: `13_Faculty_Resources/Outreach/alex-tour/README.md`
- Test: `tests/alex-tour-static.test.mjs`

- [ ] **Step 1: Document the source-of-truth and safety contract**

Use this structure:

```markdown
# Alex Tour

Single-page, public-by-link discussion guide for Alex Keuroghlian.

## Canonical source

- `index.html`: complete semantic page, visual system, and local-only interactions
- `netlify.toml`: publish configuration and exact CSP hashes
- `tests/alex-tour-static.test.mjs`: link, privacy, content, and security contract

## Credential separation

The page never contains, stores, sends, or logs the standardized-patient passcode or the production
faculty-console key. Joshua shares the simulation passcode separately. The faculty console remains a
secondary credential-gated link; the embedded preview is synthetic and read only.

## Publication

- Preferred URL: `https://psychiatry-workforce-tour.netlify.app/`
- Fallback URL: `https://faculty-governed-psychiatry-tour.netlify.app/`
- Base directory: `13_Faculty_Resources/Outreach/alex-tour`
- Build command: none
- Publish directory: `.`
- Production branch after integration: `main`

`noindex` reduces discovery but is not access control. The page must remain safe if forwarded.

## Required checks

1. Run `node --test tests/alex-tour-static.test.mjs` from the repository root.
2. Run both canonical MS3 and resident builds.
3. Verify all destination URLs and deployed response headers.
4. Verify desktop, mobile, keyboard, reduced-motion, print, and no-JavaScript paths.
5. Joshua performs the real standardized-patient credential check manually.
```

After site creation, record the actual selected production URL and nonsecret Netlify site ID. Remove
the unused fallback line if the preferred slug succeeds.

- [ ] **Step 2: Run all local gates**

Run:

```bash
node --test tests/alex-tour-static.test.mjs
bash _prototypes/sp-interview/tests/run-all.sh
node tests/family-companion-evergreen.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
git diff --check
```

Expected: all targeted checks pass. Report the unrelated `rapid_review.md` soft warning separately.

- [ ] **Step 3: Review the staged scope**

Run:

```bash
git status --short
git diff --stat
git diff -- \
  13_Faculty_Resources/Outreach/alex-tour \
  tests/alex-tour-static.test.mjs
```

Expected: no generated site builds, screenshots, `.netlify` state, credentials, or unrelated files are
staged.

- [ ] **Step 4: Commit the landing page separately**

Run:

```bash
git add \
  13_Faculty_Resources/Outreach/alex-tour/index.html \
  13_Faculty_Resources/Outreach/alex-tour/netlify.toml \
  13_Faculty_Resources/Outreach/alex-tour/README.md \
  tests/alex-tour-static.test.mjs
git commit -m "feat: add faculty-governed Alex tour"
```

---

## Task 9: Perform Local Browser and Visual QA

**Skill requirements:** Announce and use `browser:control-in-app-browser` and
`build-web-apps:frontend-testing-debugging`. Use `view_image` for screenshot comparison.

- [ ] **Step 1: Serve with Netlify's real local configuration**

Run from the tour directory:

```bash
cd "/Users/jm/Psychiatry-Clerkship-Library-alex-tour/13_Faculty_Resources/Outreach/alex-tour"
netlify dev --offline --no-open --skip-gitignore --port 8891
```

Keep the process in a reusable terminal session. Do not start a second server on the same port.

- [ ] **Step 2: Inspect desktop at 1440 by 1000**

Verify:

1. The first viewport communicates the workforce-education thesis, six-minute duration, attribution,
   and prototype/no-endorsement disclosure.
2. The route line visibly connects all three stops and bends through governance.
3. Route headings, observations, instructions, and questions are readable without dense cards.
4. Every external link's visible label makes its destination clear.
5. There is no framework error overlay and no relevant console warning or error.

Capture a full-page screenshot outside Git and compare it with the approved concept. Correct material
fidelity gaps, then recompute CSP hashes and rerun static tests.

- [ ] **Step 3: Exercise every interaction**

Verify:

- **Start the six-minute tour** moves to route 1.
- **Copy endpoint** copies the visible endpoint or provides the manual-copy cue.
- Governance filters show the correct synthetic record types.
- Local review toggles change only in-memory demo labels.
- **Reset demonstration** restores all records and the All filter.
- **Print the meeting prompt** produces the title and exactly three questions.
- Browser network inspection shows zero requests initiated by governance controls.

- [ ] **Step 4: Verify keyboard and assistive semantics**

Tab through the full page. Confirm the skip link, visible focus, logical order, button names,
`aria-pressed` changes, live-region messages, headings, and external-link names. No interaction may
require hover.

- [ ] **Step 5: Inspect mobile at 390 by 844**

Confirm the route becomes a single left rail, URLs wrap, buttons remain at least 44 pixels tall, no
horizontal overflow exists, the governance records remain readable, and the three questions are in
natural order. Capture and inspect a full-page mobile screenshot.

- [ ] **Step 6: Verify reduced motion and no-JavaScript fallbacks**

Emulate reduced motion and confirm no route-draw animation remains. Disable JavaScript and confirm the
entire narrative and all eight destination anchors remain usable; only copy, filters, toggles, and
print enhancement may be unavailable.

- [ ] **Step 7: Stop the local server cleanly**

End the reusable process and verify no port listener remains.

---

## Task 10: Create the Netlify Project and Publish a Draft

**Skill requirement:** Announce and use `netlify:netlify-deploy` or `netlify-deploy` before external
publication.

**Files:**

- Local untracked state: `13_Faculty_Resources/Outreach/alex-tour/.netlify/state.json`
- Modify after creation: `13_Faculty_Resources/Outreach/alex-tour/README.md`

- [ ] **Step 1: Authenticate without exposing account details**

Run:

```bash
netlify sites:search psychiatry-workforce-tour --json
```

If the session is expired, run `netlify login` and complete the browser authorization. Do not print or
persist an auth token.

- [ ] **Step 2: Resolve slug availability immediately before creation**

Interpret the authenticated search result from Step 1. If it is empty, use the preferred name. If a
project already owns it and it is not this new tour, run:

```bash
netlify sites:search faculty-governed-psychiatry-tour --json
```

Use the fallback only if that result is empty. Do not repurpose an unrelated project.

- [ ] **Step 3: Create and link the empty project**

From the tour directory, run the command for the selected name:

```bash
cd "/Users/jm/Psychiatry-Clerkship-Library-alex-tour/13_Faculty_Resources/Outreach/alex-tour"
netlify sites:create --name psychiatry-workforce-tour --json | \
  /usr/bin/jq '{id,name,url,ssl_url}'
```

Use `faculty-governed-psychiatry-tour` only on the approved fallback path. Confirm `.netlify/state.json`
contains the returned site ID and remains ignored by Git.

- [ ] **Step 4: Publish a deterministic draft**

Run:

```bash
netlify deploy \
  --dir . \
  --no-build \
  --alias alex-review \
  --message "Alex tour review"
```

Expected: a draft URL beginning with `alex-review--`. Do not use `--prod` yet.

- [ ] **Step 5: Verify the draft response headers**

Run `curl -fsSI` against the exact draft URL and verify:

- `Content-Security-Policy` includes both current hashes and `connect-src 'none'`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `X-Content-Type-Options: nosniff`;
- `Permissions-Policy` disables camera, microphone, geolocation, and payment;
- frame embedding is denied;
- `X-Robots-Tag: noindex, nofollow`.

- [ ] **Step 6: Repeat the full browser smoke path on the draft**

Open the draft at desktop and mobile widths. Exercise start, copy, governance filters/toggles/reset,
print, every external anchor, and no-JavaScript readability. Verify no CSP violation or network write
appears.

- [ ] **Step 7: Record the actual project identity**

Update README with the selected URL and actual nonsecret site ID, delete the unused fallback line, run
`git diff --check`, and commit:

```bash
git add 13_Faculty_Resources/Outreach/alex-tour/README.md
git commit -m "docs: record Alex tour deployment"
```

---

## Task 11: Integrate, Verify Live Dependencies, and Publish Production

**Files:** All planned clerkship files and commits.

- [ ] **Step 1: Perform final branch verification**

Run:

```bash
node --test tests/alex-tour-static.test.mjs
bash _prototypes/sp-interview/tests/run-all.sh
node tests/family-companion-evergreen.test.mjs
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
git diff --check
git status --short --branch
```

Expected: targeted gates pass and the branch is clean.

- [ ] **Step 2: Push the clerkship branch and create a focused PR**

Run:

```bash
git push -u origin codex/alex-tour
gh -R jmoss333/psychiatry-clerkship pr create \
  --head codex/alex-tour \
  --base main \
  --title "Add faculty-governed Alex tour" \
  --body "Adds the approved six-minute leadership tour, synthetic read-only governance preview,
tab-scoped standardized-patient credential handling, and evergreen family-therapy framing.
Includes privacy, CSP, and link tests; the production faculty console remains unchanged."
gh -R jmoss333/psychiatry-clerkship pr checks --watch
```

Expected: all required checks pass. Do not bypass a red check or weaken protection.

- [ ] **Step 3: Present the verified draft and request final publication approval**

Provide Joshua the draft URL, the three supporting-site URLs, the exact SP setup sequence, and the
statement that no passcode or faculty key is embedded. Obtain final approval before merging or
publishing the production tour.

- [ ] **Step 4: Merge through the repository's normal review path**

After approval and green checks, merge the PR using the repository's normal strategy. Do not force
push to `main`. Confirm the merged commit is present on `origin/main`.

- [ ] **Step 5: Confirm the production MS3 site contains the safety change**

Wait for the normal learner-site deploy to finish. Open:

```text
https://une-ms3-psychiatry.netlify.app/?tool=sp-interview.html
```

In a fresh tab, verify Live mode, automatic setup, prefilled endpoint, tab-scoped explanation, and
**Clear passcode**. Use a synthetic invalid passcode to verify rejection and storage lifecycle. Joshua
alone performs the real passcode connection check.

- [ ] **Step 6: Configure connected deployment after integration**

From the linked tour directory, run:

```bash
netlify init --manual --git-remote-name origin
```

Select the already linked tour project and configure:

- repository: `jmoss333/psychiatry-clerkship`;
- production branch: `main`;
- base directory: `13_Faculty_Resources/Outreach/alex-tour`;
- build command: none;
- publish directory: `.`;
- deploy previews: enabled.

Inspect the resulting project settings and confirm no unexpected environment variables, build
plugins, or functions were added.

- [ ] **Step 7: Run the final destination health gate**

Immediately before production publication, open each destination visually and run direct HTTP checks
for all eight canonical links. Confirm the renamed education-library URL is the one in source and
that Family Therapy still shows the evergreen July 2026 framing.

- [ ] **Step 8: Publish the production tour**

From the tour directory, run:

```bash
netlify deploy \
  --dir . \
  --no-build \
  --prod \
  --message "Faculty-governed psychiatry workforce tour"
```

- [ ] **Step 9: Re-run deployed security and interaction gates**

Against the actual production URL:

1. Verify HTTP 200 and all six security/privacy headers.
2. Verify the deployed CSP hashes match the current source blocks.
3. Verify desktop, mobile, keyboard, reduced-motion, print, and no-JavaScript paths.
4. Verify governance controls generate no network requests.
5. Verify every destination opens the exact final URL.
6. Verify page source contains no passcode, faculty key, analytics, form, or storage call.

- [ ] **Step 10: Deliver the send-ready handoff**

Provide Joshua:

- the single production Alex Tour URL;
- the separate instruction to send the SP passcode out-of-band;
- the reminder that Alex should select **⚙ setup**, confirm Live mode and the endpoint, enter the
  separately sent passcode, select **Save & test connection**, then choose Supported or Realistic;
- confirmation that the production faculty console remains credential-gated and the embedded preview
  is synthetic/read-only;
- the three collaboration questions;
- a reminder to rotate the shared student passcode after the demonstration window.

---

## Innovative Follow-On (Out of Scope)

After the first conversation, add a no-storage presenter mode driven by CSS `:target` states. The
route line could advance one stop at a time during a live meeting without analytics, accounts, saved
state, or another application layer. Treat this as a separate design and implementation request; do
not add it to the first external share surface.
