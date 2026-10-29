# Care packet Revision 4: approved wording and independent unit approval

Revision 4 supersedes the profile, medication-restart, unit-contact, callback and contact-freshness rules in Revisions 2–3 of `2026-10-12-care-packet-owner-directions.md`. The owner approved these decisions in the review chat before this implementation. This record is not approval of any real profile or patient use.

`FD_CARE_PACKET_ENABLED` remains `false`; real unit profiles remain empty. G-B was closed by explicit owner approval on 2026-10-13; see [the closure record](2026-10-13-care-packet-gb-decisions.md). G-C and G-D remain open. The older `fd_care_pack.js` print workflow is unchanged. “Making home safer” remains off by default.

## Approved clinical copy

The two medication bullets are:

> If you miss a dose or have a break from a medicine, follow the instructions for missed doses or restarting in your After Visit Summary. If those instructions are missing or unclear, call your pharmacist or the person who prescribes it before taking it again.
>
> Do not take extra medicine to catch up on your own. Some medicines need a different dose after even a short break.

Unit contact uses only the approved purpose, name, phone and staffed hours:

> For [confirmed purpose], call [unit name] at [confirmed phone] during [confirmed hours].
>
> This is not a crisis line. For a mental health crisis, use the crisis contacts on page 1.

The callback page is off by default. A verified program alone is insufficient: staff must also confirm a call arranged for this discharge, a complete agreed plan, and contact/message preferences agreed through the clinical workflow. Its text is:

> Your planned follow-up call
>
> [Team] plans to call you [agreed day or time window] to check how you are doing after leaving the hospital.
>
> If you miss the call, or have not heard from the team by [agreed deadline], call [confirmed return number] during [confirmed hours].
>
> If you cannot reach the team, [confirmed fallback instructions].
>
> For an emergency or a mental health crisis, use the instructions on page 1. Do not wait for this call.

The window and deadline are handwritten or recorded in the After Visit Summary. The app holds only three transient confirmation checkboxes, never patient call details. Changes to the packet clear those confirmations and the four general review confirmations.

## Technical approval boundary

Both Review and Final Print, and Final Copy, require an independent, current approval matching every public field of the selected profile. Unapproved, expired, revoked, suspended, missing or unreachable authority leaves an editable draft. Candidate phone details are visible in the staff controls but withheld from the patient preview and output. Review Copy remains unavailable for the After Visit Summary.

Profile data does not contain an approval switch. The candidate's digest covers all contact, purpose, hours, callback, branding and verification evidence fields. Evidence includes actual verification dates, verifier and evidence references; build and approval dates cannot renew contact verification.

The oldest required verification date starts a **90-calendar-day** validity period. `expiresOn` is its date plus 90; it becomes invalid at the start of that date in **America/New_York**. `usableThrough` is the preceding date. The preview shows the exact expiry date and warns during its last 14 calendar days. Crisis-contact and ordinary listing freshness policies are separate and unchanged.

The approval endpoint is implemented separately in governance [PR #1040](https://github.com/jmoss333/psychiatry-clerkship/pull/1040). It requires the owner's independently enrolled personal credential, a signing secret, and a separate production-only authority store; editable candidate facts cannot approve themselves. No credentials, store, real approval or activation were created by this change. Missing configuration denies output.

The service also binds approval to the last commit that changed the candidate file. Editing and then restoring the old text cannot revive approval. This conservative first implementation requires reapproval of all profiles when that file changes. Removed profiles cannot authorize output; withdrawing a removed record currently requires the owner API and its known revision, because the owner screen lists current candidates only.

The browser sends only profile ID and revision to the fixed authority origin, without credentials or patient data. Each output rechecks approval. An old tab checks when opened, focused or made visible and periodically while open. Pending output is invalidated by edits or changed directory data. Delayed clipboard results cannot restore fallback text after expiry or changes. Print staging is consumed once and rechecks current approval at the native print event; native Print inside the packet otherwise produces a notice. Printing from elsewhere keeps its original behavior.

## Acceptance evidence and remaining gates

Automated acceptance covers:

- Exact medication and callback copy; no unsupported unit promise; only approved purpose/phone/hours render.
- Both modes refuse absent or mismatched authority, including changed public fields, revoked and suspended status, old receipts and unavailable service.
- New York midnight in daylight and standard time, malformed dates, and calendar-day warning behavior.
- Callback program without discharge confirmations refuses output; patient details and confirmation flags are not saved in browser storage.
- Revocation after Load, edits while approval is pending, delayed clipboard completion after expiry, a fresh approval check before delayed manual-copy fallback, and one-use print staging.
- Ordinary print isolation, clear/reload behavior, keyboard controls, layout overflow and page-count matrix on both sites.

The current PR body records results at the tested revision. Previous mutation totals are historical reports, not evidence that Revision 4 has had a new exhaustive mutation pass. Build and browser evidence do not establish clinical approval, physical printer behavior, VoiceOver behavior or production activation.

G-B (#1034 workflow) is closed for the reviewed revision; this does not approve a merge or activation. Still for human review: G-C (ward printer, nurse and peer specialist, screen reader and other browsers), and G-D activation. Upstream closed/withdrawn status and crisis-service categorization remain feed limitations; this implementation does not claim to identify every crisis-type service in other categories. No new decision was made about those categories or the “Making home safer” default.


## Implementation and merge authorization — 2026-10-13

After explicitly closing G-B, the owner instructed this chat to complete the remaining implementation, push and merge without further approval requests. This authorizes technical integration of #1034, #1040 and #1036 after checks pass. It supersedes the earlier merge hold, while retaining the explicit flag-off requirement. Main was refreshed to `87759b2478a7` before integration; the core and authority branches were combined using ordinary merges, without rebasing.

The integrated acceptance adds a cross-language/service/browser test using the actual Python profile projection, actual approval handlers and actual learner receipt check. Synthetic in-memory credentials and storage exercise unapproved, approved, suspended, revoked, source-replaced and expired states for both learner origins. No real credentials, approval store or unit profile are created.

G-C remains an evidence gate for actual ward printing, nurse/peer-specialist review, native screen readers and other browsers. Technical merge authorization does not assert that those observations occurred. G-D remains open: the feature stays off, profiles stay empty, and service enrollment/configuration remain prerequisites to activation. Deferred UX ideas and the separate #1008 branch are outside this integration.


Final local integration acceptance: 222 browser checks passed across both learner sites, including the new packet, directory and retained resource-pack workflow. The first run had 221 passes and one local JSON-load connection reset; repeated diagnosis isolated the standard Python server's five-connection listen backlog. Raising only the local server backlog to 128 passed 30 repetitions of that failure case, all 24 launcher lifecycle tests, and the full 222-check rerun with unchanged product code and assertions. The normal pre-push gate is required again for this launcher change; current GitHub results remain exact-head evidence, recorded in the PR.
