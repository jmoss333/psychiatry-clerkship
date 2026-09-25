# Adopting this library at your clerkship

This guide is for a clerkship director who wants to run this library for their own learners: what
to change, which safeguards to keep, and how to build and publish it.

## What it is

This is a six-week adult inpatient psychiatry curriculum kept as one source tree. The tree builds
two static websites:

- a **student site** for third-year medical students (MS3), and
- a **resident site**, which is the student site plus resident-only pages.

Both sites carry topic pages, reasoning tools, cases, a question bank with spaced review,
landmark-paper audio and a weekly path. Three companion services are optional: a **faculty
console** for reviewing what ships, **The Interview Room** (a standardized patient powered by a
language model), and **usage counts**.

The library was written for one program in Maine. Local names, policies and phone numbers run
through it, and you need to replace them before your learners see it.

## Licence, in brief

The content is under CC BY-NC-SA 4.0 and the code is under MIT. You may use and adapt the content
for non-commercial teaching if you credit the source, note your changes and share your adaptation
under the same licence. Third-party instruments, quoted papers, AI-generated media, vendored
libraries and institution names are **not** covered. Read
[Licensing and third-party material](../README.md#licensing-and-third-party-material) in the README
and [`LICENSE-content`](../LICENSE-content), then check with your institution before you publish.

## What to swap

**1. Site names and branding.** The student-site title is in
`13_Faculty_Resources/_automation/site_build/spa_index.html`. The resident site's name ("MMC
Psychiatry") and description are set by the rebrand list in `site_build/resident_section.py`. The
original Netlify site names (`une-ms3-psychiatry`, `mmc-psychiatry-residents-sanford`) appear in
`media_manifest.json` and in the monitoring workflows that check the live sites. Point those at
your own sites or turn them off. The feature that drafts an email to a faculty member only
accepts `@mainehealth.org` addresses. Change that domain in
`site_build/frontdoor/fd_capture_email.js` and in the matching hint text in `spa_index.html`.

**2. Local references.** Content pages mention the original sites and units (Maine, MMC, UNE,
Sanford, BHU2) about 175 times in total. To list them:

```bash
grep -rnwE "Maine|MaineHealth|MMC|UNE|Sanford|BHU2" 0*_*/ 1[0-4]_*/
```

For now, edit them by hand. A `<!-- local:KEY -->` marker, filled from a `local_policy.json` file
so that each site keeps its local text in one place, is **proposed but not built**. Also review
the orientation packet (`14_Tracks/MS3/Student_Ready_Pack/01_orientation/`), which describes the
daily routine and expectations for the rotation. Pages deliberately defer medication dosing to
local protocol, so make sure your learners know where your protocols live.

**3. Crisis resources.** Crisis phone and text lines live in **one file only**,
[`crisis_resources.json`](../crisis_resources.json). The build copies them into every
safety-facing page. Replace the state line (`maine_crisis_line`) with yours, and keep the national
entries. Re-verify every number against its official source and record the date you checked it.
Never type a crisis number into a page.

**4. Who attested what.** [`13_Faculty_Resources/reviewed.json`](../13_Faculty_Resources/reviewed.json)
records that a named faculty member reviewed each page on a given date. The existing rows are the
original author's judgments, not your faculty's. Before your learners rely on the library, have
your own faculty review each page in your own faculty console, with its `ATTESTER_NAME` set to your
reviewer's name. Plan that reset with a developer rather than editing the file by hand. The ledger,
the page records in `topic_meta.json` and several tests move together. For example, the five
safety-kit pages must stay attested for the build to pass.

**5. Media.** The audio overviews and the orientation video were generated with NotebookLM and are
not covered by the licence. Either keep them after your own rights review, or replace them. Note
that the build currently **requires** `12_Media/audio_oe/` and the orientation-video package, and
stops if they are missing. Removing them therefore needs a small build change.

**6. Feedback form.** The "Share feedback" form is a Netlify form. Submissions appear in each
Netlify site's Forms tab. Turn on notifications there, or remove the banner from
`site_build/frontdoor/fd_today.js` when your testing period ends.

## The minimum governance to keep

The build enforces these rules because each one has caught a real error. Keep all five. The full
rulebook is [`CLAUDE.md`](../CLAUDE.md). It is written for coding assistants, but people can read
it too.

1. **Faculty attestation.** Every page that ships has a row in the attestation ledger. Only a named
   faculty reviewer marks a page reviewed, through the faculty console
   ([`faculty-console/README.md`](../faculty-console/README.md)). Each attestation is tied to the
   exact text reviewed. If someone edits a page afterwards, the learner site shows that page as
   awaiting review until faculty look again. Never hand-edit a row to `reviewed`.
2. **Evidence in the paper's own words.** Any sentence that says what a study found must have the
   paper's own supporting sentence stored in `evidence_annotations.json`, and a validator checks
   it. Write claims from the results section, not from the title or abstract conclusion.
3. **Link to instruments; do not copy them.** Teach how to administer a scale and link to the
   custodian's official form. Do not reproduce copyrighted items, anchors or forms.
   [`instrument_rights.json`](../instrument_rights.json) records each instrument's status, and the
   build fails if a retired instrument's text comes back.
4. **The crisis block.** Pages where learners assess or plan for risk carry a
   `<!-- crisis-block -->` marker. The build fills it from `crisis_resources.json` and fails if a
   required safety page loses it.
5. **No patient information.** Every case is synthetic or de-identified. Never commit anything
   that could identify a patient, including in feedback, notes or examples.

## How to build

You need Git with **Git LFS**, Python 3.11 and Node 22 (versions are pinned in
`runtime_versions.json`). The repository's [Dev Container](../.devcontainer/devcontainer.json)
provides all three.

```bash
git lfs install && git lfs pull            # download the real audio and video
python3 -m pip install -r requirements.txt
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3   # student site → _build/ms3
bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res   # resident site → _build/res
```

Each command runs the validators and tests, builds the site, and runs a quality gate over the
result. Any failure stops the build. To preview a site, serve the folder, for example
`python3 -m http.server -d _build/ms3 8000`. Before you publish changes, run the full local check
with `bash bin/verify.sh`.

## How to deploy

- **Create two Netlify sites from the same repository.** In each site's Netlify settings, set the
  build command to the matching line above (`… ms3` or `… res`) and the publish directory to
  `_build/ms3` or `_build/res`. These settings live in the Netlify dashboard on purpose, not in
  `netlify.toml`, because one file cannot describe two sites.
- **Media travels by Git LFS.** The build refuses to publish placeholder "pointer" files in place
  of real audio or video. GitHub meters LFS bandwidth per account, so frequent rebuilds can use up
  the monthly allowance. See
  [`NETLIFY_LFS_RUNBOOK.md`](../13_Faculty_Resources/_automation/site_build/NETLIFY_LFS_RUNBOOK.md)
  and [`GIT_AND_DEPLOY_PLAN.md`](../13_Faculty_Resources/_automation/GIT_AND_DEPLOY_PLAN.md).
- **Every push to `main` rebuilds both sites.** Pull requests get preview sites.
- **Optional companions** each run as their own Netlify site with their own secrets, which are
  never stored in the repository:
  - the faculty console needs a GitHub token, a faculty key and `ATTESTER_NAME`
    ([setup](../faculty-console/README.md));
  - The Interview Room needs a language-model API key and a student passcode
    ([`sp-proxy/README.md`](../sp-proxy/README.md)); run its
    [red-team checklist](../sp-proxy/REDTEAM_CHECKLIST.md) after every deploy;
  - usage counts are off unless you set `CLERKSHIP_ANALYTICS`.
- **Scheduled maintenance** (live-site checks and literature surveillance) is described in the
  [operations runbook](../13_Faculty_Resources/_automation/maintenance/README.md). Retarget those
  jobs at your sites or disable them.
