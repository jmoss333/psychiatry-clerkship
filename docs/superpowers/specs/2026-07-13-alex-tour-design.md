# Alex Tour landing page — design

**Date:** 2026-07-13
**Author:** Joshua Moss, MD (with Codex)
**Canonical repository:** `jmoss333/psychiatry-clerkship`
**Primary audience:** Alex Keuroghlian, MD, MPH
**Status:** approved design, pending implementation plan

## Purpose

Create one shareable Netlify landing page that turns a broad portfolio review into a focused
leadership conversation about **faculty-governed psychiatry workforce education**.

The page has one job: guide Alex through three two-minute pathways, make the governance model
concrete, let him safely try the AI standardized-patient experience, and end with three specific
collaboration questions. It is a **public-by-link** discussion artifact that must be safe if
forwarded. It is not access-controlled, a public marketing site, a clinical tool, or an
institutional endorsement page. `noindex` reduces discovery but is not treated as access control.

## Success criteria

The page succeeds when Alex can, without additional orientation:

1. Understand the unifying workforce-education thesis in the first viewport.
2. Complete the resident, MS3, and patient/family pathways in roughly six minutes.
3. Open every relevant live surface in one click and return to the tour without losing his place.
4. Understand how faculty review becomes a visible, auditable learner-facing attestation.
5. Explore a synthetic, read-only version of the faculty console without production credentials.
6. Open the standardized-patient tool, enter a separately supplied passcode, verify the connection,
   and begin a fictional encounter.
7. Enter the conversation with three concrete choices about pilot scope, governance, and evaluation.

## Approaches considered

### 1. Guided six-minute tour — selected

Three connected two-minute stops, a governance interlude, and three collaboration questions. This
approach provides enough structure to guide a live conversation while preserving links for deeper
exploration.

### 2. Executive portfolio one-pager

Faster to scan, but it would flatten curriculum, governance, and simulation into equivalent product
tiles. It would show breadth without explaining how the pieces form one workforce-development
system.

### 3. Product dashboard

Could appear more technically sophisticated, but would invite unverified metrics and shift the
conversation toward product analytics rather than education, governance, and pilot design.

## Decisions locked with the user

1. The primary thesis is **workforce education**.
2. The three two-minute pathways remain:
   - resident education;
   - MS3 education;
   - patient and family infrastructure.
3. The faculty attestation console is presented as the governance model for scaling educational
   content responsibly.
4. Alex receives a synthetic read-only governance preview inside the tour, not the production
   faculty key.
5. The production faculty-console login remains available as a secondary transparency link.
6. The standardized-patient passcode is never stored in the tour page, source repository, URL, or
   analytics. Joshua sends it separately.
7. TherapyMatch Maine, the Mental Health Education Library, and the Family Therapy Seminar
   Companion appear as contextual related prototypes rather than extra primary pathways.
8. The page explicitly labels the linked surfaces as working prototypes and does not imply
   MaineHealth endorsement.

## Information architecture

### First viewport — thesis and invitation

Visible content:

- Title: **Faculty-governed psychiatry workforce education**
- Supporting line: **A six-minute guided tour from supervised learning to accountable scale.**
- Attribution: **Joshua Moss, MD | Psychiatrist**
- Primary action: **Start the six-minute tour**
- Quiet disclosure: **Working prototypes for discussion. No patient data. No implied institutional
  endorsement.**

The first viewport previews the three stops so the scope is understood before any click.

### Route 1 — resident education (two minutes)

Primary link:

- `https://mmc-psychiatry-residents-sanford.netlify.app/`

Framing:

- Show how the platform supports resident clinical reasoning, supervised simulation, acute-care
  preparation, and progressive independence.
- Give two or three specific observations rather than a feature list.
- Open the live site in a new tab with `rel="noopener noreferrer"`.

Suggested observations:

1. Workflow-oriented navigation connects teaching to ward tasks.
2. Clinical reasoning and simulation are embedded beside reference content.
3. Review status remains visible so a learner can distinguish attested material from work in
   progress.

### Route 2 — MS3 education and simulation (two minutes)

Primary links:

- Clerkship: `https://une-ms3-psychiatry.netlify.app/`
- Standardized patient:
  `https://une-ms3-psychiatry.netlify.app/?tool=sp-interview.html`

Framing:

- Show the same underlying curriculum architecture adapted to a six-week undergraduate learner
  journey.
- Make the standardized-patient experience the memorable interaction within this route.

The tour must display these current production instructions exactly in substance:

1. Open **The Interview Room**.
2. Select **⚙ setup**. On a fresh tab the tool opens the setup panel automatically. Keep the
   instruction visible because a returning browser may already have state.
3. Confirm the tool is in **Live patient (LLM proxy)** mode.
4. Confirm the prefilled endpoint is
   `https://sp-interview-proxy.netlify.app/api/sp`.
5. Enter the passcode sent separately by Joshua.
6. Select **Save & test connection**.
7. After the connected confirmation, choose **Supported** or **Realistic** mode.

The page includes a **Copy endpoint** control and a concise reminder that the case is fictional,
the experience is for supervised learning, and no real-patient information may be entered.

Before this link is shared externally, the standardized-patient tool changes passcode handling:

- keep the public endpoint in `localStorage` for convenience;
- keep the passcode in `sessionStorage`, not `localStorage`, so closing the tab clears it;
- remove any legacy `cw_sp_passcode` value from `localStorage` during initialization;
- provide a visible **Clear passcode** control in setup; and
- tell Joshua to rotate the shared student passcode after the external demonstration window.

### Governance interlude — faculty attestation

Production console:

- `https://clerkship-faculty-attest.netlify.app/`

Read-only preview:

- Same-page fragment: `#governance-preview`

The tour explains the pipeline in plain language:

```text
Faculty reviews source
        ↓
Attestation state is recorded
        ↓
An auditable repository commit is created
        ↓
Learner sites rebuild
        ↓
Review status is visible to learners
```

The governance section opens the on-page read-only preview first. The production console appears as
a secondary link labeled **Production console — faculty credential required**.

#### Read-only demo behavior

The tour contains a self-contained governance preview:

- Loads a small embedded synthetic dataset representing pages, tools, and question-bank items.
- Shows a persistent banner:
  **Read-only demonstration — synthetic records; no repository access.**
- Allows filters and local toggles so the interaction model can be understood.
- Uses **Reset demonstration** instead of a save action.
- Contains no production credential and initiates no API request.
- Runs under the tour's `connect-src 'none'` content-security policy, so client-side network access
  is blocked even if later code drifts.
- Leaves the production faculty console unchanged.

This local preview demonstrates the governance pattern without granting Alex write access. The
existing shared key remains appropriate only for the current small faculty group; broader deployment
would require authenticated identity such as organizational SSO or OAuth, role-based permissions,
and non-self-asserted attribution.

#### Console review incorporated into the tour

The tour presents the console as a strong **pilot governance pattern**, not a finished enterprise
authorization system.

What the current model demonstrates well:

- governance is separated from the learner experience;
- the repository remains the source of truth;
- the GitHub credential remains server-side and is scoped to one repository;
- every save creates an auditable commit and triggers the normal learner-site rebuild; and
- faculty can see status counts and open the learner-facing item before attesting it.

What a MaineHealth-scale version would add:

- organizational SSO or OAuth instead of a shared key and self-entered attester name;
- role-based permissions and confirmation for bulk actions;
- full question, rationale, and evidence review before question-bank attestation;
- a staged approval or protected-branch option instead of unrestricted direct writes to `main`; and
- audience-aware preview links for both the MS3 and resident libraries rather than one configured
  student-site destination.

The visible tour copy summarizes this as **what the pilot proves** and
**what responsible scale would add**. It does not describe the present console as institutionally
validated.

### Route 3 — patient and family infrastructure (two minutes)

Primary link:

- `https://reconnect-tools.netlify.app/`

Framing:

- Show how the same clinical knowledge can be translated into accessible patient, family, and
  clinician support.
- Keep this route subordinate to the workforce-education thesis: it demonstrates downstream
  translation rather than a separate product pitch.
- The tour must not repeat or imply institutional sponsorship. Before publication, verify any
  MaineHealth attribution shown within the linked ReConnect site is authorized.

### Related prototypes

These appear as a compact list after the three routes, not as an equal-weight grid.

#### TherapyMatch Maine

- Current link: `https://therapymatch-maine.netlify.app/`
- Canonical repository: `/Users/jm/Code/therapy-match/TherapyMatch App`
- Netlify site ID: `69c8ac0c-fdbc-48ea-8488-30fb09fa4145`
- Label: **Working prototype — access and referral navigation**
- Before publication, reconcile the current 306-versus-307 provider discrepancy using the active,
  verified production provider dataset as the authoritative source.
- Update all visible claims and repository documentation to the same verified count. Do not choose
  the larger number for presentation value.
- If different counts describe different populations, label each denominator explicitly instead of
  forcing false agreement.

#### Mental Health Education Library

- Current link: `https://clinical-warm-staging-28882.netlify.app/`
- Canonical clinical content: `/Users/jm/Clinical/Patient-Resources/New Education Library`
- Current generated deploy directory: `/Users/jm/clinical-warm-site`
- Netlify site ID: `91005fbc-3ba1-4cfc-88a2-3c401f306286`
- Rename the existing Netlify site to `mental-health-education-library` before the tour links it.
- If that Netlify slug is unavailable, use `mental-health-education-maine` as the deterministic
  fallback.
- Verify the final URL and update the tour only after the renamed site returns HTTP 200.
- Label: **Working library — patient and family education**
- This iteration changes the Netlify project name only. It does not edit generated HTML or treat the
  deploy directory as a new clinical-content source of truth.

#### Family Therapy Seminar Companion

- Current link: `https://family-therapy-seminar-companion.netlify.app/`
- Canonical source:
  `06_Family_and_Relational/_source/index.html` in `jmoss333/psychiatry-clerkship`
- Current generated deploy copy:
  `/Users/jm/Clinical/Presentations:Meeting/Family-Therapy-Didactic-June16/deploy-site/index.html`
- Netlify site ID: `2150f5cf-18d8-41a2-b51c-f3d8e7e1a679`
- Replace the expired event-date treatment with:
  **Evergreen faculty teaching companion · Updated July 2026**.
- Preserve provenance in secondary copy:
  **Developed from a June 2026 family-therapy seminar.**
- Label: **Teaching companion — family systems and supervision**
- Edit the canonical repository file first, copy it mechanically to the deploy directory, and verify
  SHA-256 equality before deployment. Commit this cleanup separately from the tour page.

## Collaboration questions

The page ends with exactly three questions:

1. **Where should a workforce-education pilot begin: residents, MS3 learners, or faculty
   development?**
2. **Could faculty attestation, visible review status, and auditable repository history be adapted
   to MaineHealth's governance requirements?**
3. **What 60–90-day pilot could demonstrate learning value without creating substantial faculty or
   operational burden?**

A small print-friendly action exposes these questions as a one-page meeting prompt; it does not
collect responses.

## Visual direction

### Concept

The page is a quiet guided itinerary, not a product-card portfolio. A single route line connects
three stops and bends through the governance interlude. The line is functional: it communicates
sequence and the relationship between curriculum, attestation, and downstream translation.

### Palette

- **Deep Harbor** `#18323A` — primary text and navigation
- **Tidal Teal** `#2F6F68` — actions and route progress
- **Fog Blue** `#DCE9E7` — quiet supporting surfaces
- **Signal Clay** `#B75C3D` — restrained emphasis and cautions
- **Paper White** `#FBFCFA` — page background
- **Slate** `#5B686B` — secondary text

The design avoids the common cream/serif/terracotta landing-page default. Signal Clay is used only
as a minor functional accent, not the page's dominant identity.

### Typography

- Display: a distinctive, highly legible humanist or editorial sans chosen during visual concepting.
- Body: a neutral sans optimized for long-form screen reading.
- Utility/time markers: a compact mono or tabular-numeral face.

All fonts must be locally hosted or use a privacy-preserving system stack; no third-party font
request may introduce tracking or a runtime dependency.

### Signature element

The memorable element is the **six-minute route line**: each two-minute stop marks progress, while
the attestation interlude appears as a visible checkpoint rather than a fourth product. Motion is
limited to one page-load draw of the route and small focus/hover transitions, with a complete
`prefers-reduced-motion` fallback.

### Responsive model

- Desktop: route line and stop content alternate in an editorial two-column rhythm.
- Mobile: the route becomes a single left rail with content in natural reading order.
- No horizontal carousels, hidden critical content, or hover-only explanations.

## Architecture

### Canonical source

Create the source at:

```text
13_Faculty_Resources/Outreach/alex-tour/
  index.html
  netlify.toml
  README.md
```

`index.html` is the complete code-native page: semantic HTML, CSS, and minimal JavaScript in one
file. `netlify.toml` provides deployment and security headers. `README.md` records the canonical
URLs, pre-publication checklist, deployment linkage, and passcode-separation rule.

The page uses no application framework, package dependency, build step, backend, analytics, form,
cookie, or persistent local storage. This keeps the share surface small and auditable.

### Link model

Semantic HTML anchors are the canonical destination registry. Each destination appears once as an
`href` and carries a stable `data-destination` identifier. JavaScript discovers these anchors from
the DOM when it adds progressive enhancements; it does not inject or replace URLs. The endpoint
copy control reads the visible endpoint text by element ID rather than duplicating the value.

All external links:

- open in a new tab;
- include `rel="noopener noreferrer"`;
- are visibly identified as leaving the tour;
- remain fully usable without JavaScript.

### Netlify publication

Create a new Netlify site with the preferred slug `psychiatry-workforce-tour`. If unavailable, use
`faculty-governed-psychiatry-tour`.

Configuration:

- Base directory: `13_Faculty_Resources/Outreach/alex-tour`
- Build command: none
- Publish directory: `.`
- Production branch: `main` after integration
- Deploy previews: enabled for the feature branch

Security headers:

- `Content-Security-Policy` with `default-src 'self'`, `connect-src 'none'`,
  `frame-ancestors 'none'`, `base-uri 'none'`, and `form-action 'none'`. The one inline stylesheet
  and one inline script use exact SHA-256 source hashes recorded in `netlify.toml`; inline style
  attributes are prohibited so the single-file implementation does not require `unsafe-inline`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `X-Content-Type-Options: nosniff`;
- `Permissions-Policy` disabling camera, microphone, geolocation, and payment;
- `X-Frame-Options: DENY` or equivalent `frame-ancestors 'none'`;
- `X-Robots-Tag: noindex, nofollow` because this public-by-link page is a directed discussion
  artifact rather than a discovery surface. This header is not presented as authentication.

## Safety, privacy, and claims

1. No PHI, patient-identifiable scenarios, real patient details, or user-entered data are included.
2. The standardized patient is explicitly labeled a fictional supervised-learning simulation, not
   clinical decision support.
3. The tour never stores, transmits, prepopulates, or logs a passcode.
4. No provider, learner, usage, outcome, or quality metric is displayed unless verified against its
   current source.
5. Product status uses plain language: **working prototype**, **working library**, or **teaching
   companion**.
6. Institutional names describe the linked site's context only. The tour explicitly states that it
   does not imply MaineHealth or UNE endorsement.
7. The read-only attestation demonstration uses synthetic records, contains no production
   credential, initiates no API request, and runs under `connect-src 'none'`.

## Error handling and graceful degradation

- If JavaScript is unavailable, the full tour copy and all primary links remain usable.
- Copy-endpoint failure leaves the endpoint visibly selectable and gives a short manual-copy cue.
- External sites are never embedded in iframes, so their authentication and content-security rules
  remain intact.
- Link-health verification is a release gate; a failed or redirected destination blocks publication
  until its intended final URL is confirmed.
- The tour does not claim that an external interaction succeeded. The user verifies the simulation
  through its own **Connected** state.

## Testing and verification

### Existing-repository baseline

Before implementation, both canonical builds must pass:

```bash
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res
```

Known baseline soft warning: `rapid_review.md` lacks `topic_meta` metadata. This is unrelated to the
tour and is not weakened or hidden.

### Static tour checks

1. Validate HTML structure and the absence of duplicate IDs.
2. Assert all required destinations exist once as semantic anchors with stable destination IDs.
3. Assert the page contains no passcode-like literal, secret, analytics script, form submission, or
   persistent-storage call.
4. Assert every external link has `noopener noreferrer` and a meaningful accessible name.
5. Assert the three route headings and three collaboration questions remain exactly present.
6. Verify security headers from the deployed response.

### Governance-preview checks

1. The production console URL still shows the key gate and rejects an invalid key without console
   errors.
2. The tour preview displays the synthetic-data banner and makes no network request.
3. Preview filters and toggles respond locally.
4. The preview has no production save control; its content-security policy blocks network writes.
5. The production console source and behavior remain unchanged.

### Browser and visual checks

1. Use the in-app Browser for desktop and mobile verification.
2. Verify page identity, meaningful content, no framework overlay, and no relevant console warnings
   or errors.
3. Exercise the complete tour: start → three stops → governance preview → related prototypes
   → collaboration questions.
4. Confirm external links open the intended current URLs.
5. Verify the standardized-patient route displays the prefilled endpoint and passcode field. Confirm
   wrong-key rejection without recording a credential. Joshua performs the final live-credential
   connection check manually so the passcode never enters agent output, test artifacts, or logs.
6. Confirm the passcode is stored only in `sessionStorage`, **Clear passcode** removes it, closing
   the tab clears it, and initialization removes the legacy `localStorage` passcode key.
7. Generate and approve a complete visual concept before implementation; compare the final desktop
   and mobile screenshots against that accepted concept using the frontend fidelity workflow.
8. Check keyboard navigation, visible focus, heading order, color contrast, reduced motion, and no
   mobile overflow.

### Supporting-site release checks

1. TherapyMatch's verified provider count is consistent across the live page, its source, and the
   repository documentation.
2. The renamed Mental Health Education Library URL returns HTTP 200 and the former staging URL is
   either redirected or documented as retired.
3. The Family Therapy Companion shows the evergreen July 2026 framing and retains its June 2026
   provenance note.
4. Every linked production site is visually opened once immediately before publishing the tour.

## Rollout order

1. Reconcile the TherapyMatch provider count.
2. Rename and verify the Mental Health Education Library site.
3. Refresh and redeploy the Family Therapy Companion.
4. Harden the standardized-patient passcode storage and verify its setup flow.
5. Generate and approve the Alex Tour visual concept.
6. Implement the static tour page, including its local governance preview, and run local checks.
7. Create the new Netlify site and publish a deploy preview.
8. Perform desktop/mobile visual QA and link-health verification.
9. Publish production only after every supporting link and safety statement is current.

## Out of scope

- Sending email or other external communication to Alex.
- Sharing the production faculty key or standardized-patient passcode.
- Adding analytics, lead capture, scheduling, comments, or a response form.
- Claiming educational outcomes, adoption, institutional approval, or product readiness.
- Refactoring the learner sites beyond the passcode-storage hardening needed for the simulation
  handoff.
- Replacing the faculty console's shared-secret production model in this iteration. SSO/OAuth and
  role-based authorization are the next governance phase, not a prerequisite for the read-only
  demonstration.

## Concrete next phase

After this specification is reviewed, create an implementation plan that separates the three
supporting-site cleanups, standardized-patient passcode hardening, local governance preview, visual
concept, static tour implementation, Netlify publication, and final verification into independently
checkable tasks.
