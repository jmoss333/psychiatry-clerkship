# Outreach operations dashboard design

**Date:** 2026-09-21

**Owner:** Joshua Moss, MD

**Status:** Approved design; implementation pending final specification review

## Purpose

Create one private coordination system for Psychiatry Clerkship Library learner outreach. It will connect the source correspondence in Gmail to rotation dates, unsent outreach drafts, and reminders so the next required action is visible without rereading multiple forwarded threads.

The system supports three audiences:

- UNECOM medical students assigned to the Sanford psychiatry rotation;
- MaineHealth psychiatry residents assigned to the Sanford BHU; and
- education stakeholders asked to review or pilot the Library, initially Kaitlin Taplinger.

## Authority and safety boundaries

- Gmail and the attached schedules are the source evidence for names, addresses, dates, and assignments. The dashboard summarizes them but does not replace them.
- Every email remains an unsent Gmail draft until Dr. Moss explicitly sends it.
- Calendar entries remind Dr. Moss to review and send; they do not send email automatically.
- The SP Interview credential may appear in the controlled email drafts but must not appear in the dashboard, the repository, Calendar descriptions, or dashboard exports.
- No learner email address, credential, or other private coordination data will be committed to this repository.
- Clinical claims and learner expectations must match the existing sites. Outreach will describe the Library as suggested support, not required coursework, unless a coordinator explicitly establishes a requirement.
- Blank or ambiguous schedule cells remain `Unconfirmed`; names and addresses will not be inferred.

## Source catalog

The private dashboard will catalog each relevant source with:

- evidence date;
- sender and audience;
- subject;
- evidence type, such as coordinator roster, updated schedule, stakeholder feedback, prior draft, or sent message;
- Gmail link;
- the operational facts extracted from it;
- supersession state; and
- a short limitation note.

The initial catalog includes the Daniel Rich learner roster and block instructions, Mary Liberty's current Sanford BHU schedule and GME documents, the Kaitlin Taplinger review thread, relevant sent outreach, and existing project-related drafts. Automated GitHub and Netlify notifications are excluded because they do not coordinate learners.

## Private dashboard

The dashboard will be a private Google Sheet with four operational views.

### Rotation queue

One row per confirmed rotation:

- audience;
- learner or resident;
- verified email, when present in source evidence;
- start and end dates;
- source link and source date;
- T-10 and T-7 reminder dates;
- draft link;
- outreach status;
- next action; and
- notes or unresolved questions.

Supported statuses are `Unconfirmed`, `Needs draft`, `Needs review`, `Ready to send`, `Sent`, and `Waiting`.

### Action dashboard

The opening view shows:

- the next learner or resident arrival;
- actions due now or within fourteen days;
- missing addresses or unconfirmed assignments;
- drafts awaiting review; and
- the single recommended next action.

This is an operational queue, not an analytics report. Counts summarize work state only.

### Source catalog

This view preserves traceability to the exact Gmail messages and makes superseded schedules visible instead of silently overwriting them.

### Template register

This view records the current student, resident, and stakeholder email templates, their last-reviewed dates, and the corresponding Gmail draft links. It stores no SP credential.

## Email drafts

### Student pre-arrival email

The student draft will include:

- the confirmed rotation dates and first-day direction available from the coordinator;
- the MS3 Library URL;
- a short first-day path: start with Welcome/Orientation and Week 1, then use search and Active Recall as helpful;
- the SP Interview link, credential, and concise connection steps;
- a statement that the Library is suggested support rather than a substitute for assigned reading, Canvas, supervision, or coordinator instructions; and
- a request to report access trouble before arrival.

It will not restate details that differ from the coordinator's current message without flagging them for review.

### Resident pre-arrival email

The resident draft will include:

- the confirmed Sanford BHU block dates;
- the resident Library URL;
- a first-day path focused on orientation, inpatient workflow, and the Interview Room;
- the SP Interview link, credential, and concise connection steps; and
- an invitation to use the Library selectively and provide feedback.

Resident email addresses must be verified from a reliable source before a draft is addressed. If an address is unavailable, the draft will remain safely addressed to Dr. Moss with a visible recipient-verification note.

### Kaitlin Taplinger update

The Kaitlin draft will reply to the existing review conversation and remain concise. It will:

- thank her for prior testing and confirm that her case feedback informed the work;
- summarize the current Interview Room improvements only after verifying them in the present implementation;
- invite her to explore the complete Library as well as the Interview Room;
- mention the student-facing first-day path and stronger navigation/findability where currently true;
- ask for focused feedback from her or interested MS3/MS4 learners; and
- respond to her MS4 AI experience question without committing to a placement or institutional process that has not been approved.

## Reminder cadence

For each confirmed rotation, create two private Google Calendar reminders in `America/New_York`:

- **T-10:** verify the latest schedule, address, site availability, and credential before finalizing the draft;
- **T-7:** review and send the appropriate Gmail draft.

Past-due reminders are not backdated. When a rotation is already inside the window, create one immediate review reminder and preserve the intended milestone in its notes.

Calendar descriptions may contain the learner name, audience, rotation dates, dashboard link, source-message link, and draft link. They must not contain the SP credential.

## Data flow

1. Read the coordinator or stakeholder message and its supported attachments.
2. Record a source-catalog entry with a direct Gmail link.
3. Add or update only confirmed rotation-queue facts.
4. Verify the current learner-facing and resident-facing site instructions.
5. Create an unsent Gmail draft from the audience template.
6. Re-read the exact draft and verify recipient, subject, body, and `DRAFT` state.
7. Create the T-10 and T-7 Calendar reminders.
8. Add the draft and reminder links to the queue.
9. Leave the row in `Needs review` until Dr. Moss approves it.

## Error handling

- Conflicting schedules: retain both sources, mark the older one superseded, and use the newest explicit update.
- Missing address: do not guess; use the safe self-addressed draft pattern with a recipient-verification note.
- Blank schedule block: keep it `Unconfirmed` and create no audience draft or reminder.
- Site or Interview Room behavior not verified: remove the unsupported instruction from the draft and flag it for review.
- Duplicate draft or Calendar reminder: update the existing item rather than creating another.
- Gmail or Calendar write failure: leave the dashboard item as `Needs draft` or `Needs reminder` and record the failure without claiming completion.

## Verification

Before handoff:

- reconcile every confirmed dashboard row with its Gmail or PDF source;
- confirm dates and names visually for schedule PDFs whose layout affects interpretation;
- verify every created Gmail draft by rereading it in full;
- verify each Calendar reminder's date, timezone, title, and description;
- verify that no email was sent;
- verify that no credential appears in the Sheet, Calendar, repository, or exported files;
- verify that no unconfirmed rotation received a draft or reminder; and
- inspect the private Sheet's opening view for a clear next action and working Gmail/draft links.

## Deliverables

- one private Google Sheet dashboard;
- a source catalog linked to the relevant Gmail evidence;
- one verified unsent draft per confirmed upcoming student and resident with a verified address, plus safe review drafts where an address is missing;
- one verified unsent update draft to Kaitlin Taplinger;
- T-10 and T-7 Calendar reminders for confirmed future rotations; and
- a concise handoff naming ready items, unresolved schedule/address gaps, and the next best action.

## Deliberate exclusions

- sending any email;
- automatic scheduled sending;
- publishing the dashboard;
- storing the SP credential outside controlled draft bodies;
- committing learner identities or addresses to Git;
- inventing resident addresses or rotation assignments; and
- changing clinical content, the sites, or the Interview Room as part of this outreach task.
