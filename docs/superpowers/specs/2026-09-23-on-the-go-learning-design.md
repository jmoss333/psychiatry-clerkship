# On-the-go learning: adaptive dock, reading place, question routing, and offline readiness

**Date:** 2026-09-23
**Status:** designed, not implemented. Approved in visual brainstorming; awaiting written-spec
review, then an implementation plan.

**Audience:** shared learner shell for MS3, resident, and APP entry modes.
**Clinical scope:** none. This design changes navigation, device-local learning state, question
organization, user-initiated email drafting, and offline-status reporting. It does not add or
rewrite clinical content, policy, dosing, assessment, attestation, or readiness thresholds.

## The problem

The Front Door has strong reading, search, path, and Capture-a-Question surfaces, but using them
during a shift still asks learners to remember where each action lives. Mobile also currently has
two competing fixed surfaces: `.fd-tabs` owns the bottom edge while `#fdCaptureMount` floats above
it. Readers add a third mobile pattern, `.fd-actionbar`.

This design makes the high-frequency actions reachable with one thumb, remembers a learner's
place without adding visual checkpoints, converts captured questions into a small action queue,
and tells the truth about what will work on an unreliable network.

The four approved strategies are:

1. an adaptive five-slot mobile dock;
2. quiet, automatic reading-place persistence;
3. save-first question routing plus a learner-controlled faculty email draft; and
4. verified offline readiness using the service worker that already ships.

NotebookLM audio/video production is deliberately **not** part of this design. That is the
separately deferred strategy 8 and requires its own inventory, prompts, upload workflow, and
external-service review.

## Existing contracts this design must preserve

- `site_build/frontdoor/` is the shared shell for both learner sites. Shared copy remains
  audience-neutral unless existing build data supplies the audience label.
- Mobile currently has `.fd-tabs`, `#fdCaptureMount`, and reader-only `.fd-actionbar` fixed
  surfaces. The replacement must have one bottom-edge owner, preserve safe-area clearance, and
  update `docs/superpowers/specs/front-door-handoff/CLASS-INVENTORY.md` in the same change.
- Front Door state is allowlisted through `FD_KEYS` in `fd_state.js`; device keys must remain in
  the `cw_*` or `rp_*` namespaces.
- `cw_capture_v1` is device-local, bounded to 50 items and 280 characters each, has a fail-closed
  PHI heuristic, and currently saves before offering a matching resource or supervision action.
- The APP invitation changes entry context without changing identity or clinical-governance
  behavior. APP practice responses are not persisted.
- The service worker already atomically precaches every shipped non-media file within a 10 MB
  budget. Audio, video, Anki packages, `tool-governance.json`, and a small set of shell files are
  deliberately excluded. Media remains network-only because of Range-request semantics.
- Faculty preview remains non-mutating: no learner storage writes, capture launcher, email export,
  or readiness mutation appears there.

## Decision 1 — one adaptive mobile dock

### Layout

At the existing phone breakpoint (`max-width: 640px`), replace `.fd-tabs`, the floating global
capture launcher, and the reader-only fixed action bar with one dock. Desktop and tablet layouts
remain unchanged.

The five slots are:

| Slot | MS3 / resident | APP mode | Behavior |
|---|---|---|---|
| 1 | Today | On shift | Opens the audience's landing surface. |
| 2 | Path | The Essentials | Opens the audience's structural learning view. |
| 3 | Context action | Context action | Raised primary action described below. |
| 4 | Search | Search | Opens the existing search panel and focuses its input. |
| 5 | Capture | Capture | Opens the existing Capture-a-Question dialog. |

For MS3/resident users, full Library browsing remains reachable through an explicit **Browse the
Library** action at the top of the search panel and through the header/route menu. The design must
not make search results the only route to Library content. APP mode retains direct access to The
Essentials in slot 2 because it has no six-week Path.

### Context action

The center slot is not a second recommendation engine. It projects the action the current shell
already considers primary:

- on Today/On shift, use the winner from the existing `fdTodayPrimary()` inputs;
- on a reading, use the reader's existing primary action (`Mark read`, `Next`, or the bounded
  handoff to practice questions);
- on a resumable tool or question capsule, use the existing resume route;
- when no valid action exists, render a non-raised **Browse** action rather than inventing work.

This keeps Today, the dock, the reader, and timed-block behavior from producing contradictory
next steps. The dock delegates to existing dispatch descriptors; it does not reproduce their
business rules.

### Reader behavior

The fixed `.fd-actionbar` is absorbed into the dock at phone widths. Its primary action becomes
slot 3; Back stays in the reader header. Any secondary reader action that is not equivalent to
Back remains available in the article's inline action area. There must never be two fixed bars.

### Accessibility and layout

- The dock is a labelled `<nav>` and every control retains visible text, not icon-only meaning.
- Each target is at least 44 by 44 CSS pixels and respects `env(safe-area-inset-bottom)`.
- The raised center control may change label but may not animate when reduced motion is requested.
- Main content reserves enough bottom space for the dock at every phone route.
- Search and Capture keep their current dialog semantics, focus traps, Escape behavior, and focus
  restoration.
- Keyboard shortcuts and desktop tab navigation remain unchanged.

## Decision 2 — quiet, automatic reading place

### Learner-facing behavior

There are no “safe to stop” markers, progress interruptions, badges, or save buttons inside the
article. Each reading ends with one understated line:

> Reading place saved on this device only

If storage is unavailable, the line must instead say that the place could not be saved. The UI
must never claim a successful save it cannot verify.

Opening the same reading through Continue restores the most recent meaningful position after the
markdown and enhancements finish rendering. Opening a page from search or Library still resumes
by default, with a small **Start at top** action available near the restored position.

### Stored shape

Extend the existing `cw_frontdoor_v1` state through its `FD_KEYS` allowlist with a bounded
`readingPlaces` record. A record contains only:

```json
{
  "page-ref.md": {
    "heading": "deterministic-heading-id",
    "offset": 184,
    "updatedAt": 1790160000000
  }
}
```

- Key by canonical shipped page reference, never by title or learner text.
- Store the nearest deterministic heading id plus a clamped offset from that heading; raw viewport
  pixels alone are too fragile across phone sizes and font settings.
- Keep at most 50 page records, evicting the least recently updated record first.
- Write on a debounced scroll/visibility boundary and page exit, not on every scroll event.
- If the heading no longer exists after a content update, discard that page's place and open at
  the top.
- Do not put reading place in the URL, analytics, email, or faculty surfaces.
- Do not store tool inputs, APP practice answers, question-bank answers, or clinical-calibration
  responses under this feature.

The existing `scrollPos` field is not repurposed: it preserves the originating Today/Path/Library
list position and has different semantics.

### Rendering and announcement

The build/runtime assigns deterministic ids to rendered headings without changing authored
markdown. Automatic saves are silent; an `aria-live` announcement on every scroll would be
disruptive. Restoration moves focus only when initiated through Continue. Ordinary page opening
restores scroll without stealing focus from the document heading.

## Decision 3 — save first, then route captured questions

### Capture sequence

The existing fail-closed PHI check remains before the first device write. Once that check passes:

1. save the question immediately;
2. confirm **Saved on this device**;
3. offer the optional one-tap routes **Ask on rounds**, **Discuss in supervision**, and
   **Look up later**; and
4. allow Done without requiring a route.

If the learner is interrupted after step 1, the item remains safely stored as unrouted. Today/On
shift surfaces only the **oldest unrouted** item in a compact follow-up card, plus **View all N**.
The complete question inbox remains available from Capture so no retained text becomes invisible.

### Data migration

Move capture storage to a versioned shape while reading `cw_capture_v1` defensively. Keep routing
separate from lifecycle so “Look up later” is not silently equated with scheduling an SRS card.

```json
{
  "v": 2,
  "items": [{
    "id": "c_...",
    "text": "learner-authored question",
    "at": 1790160000000,
    "ctx": "page-ref.md",
    "route": "rounds",
    "state": "open"
  }]
}
```

Allowed `route` values are `rounds`, `supervision`, `later`, or `null`. Allowed `state` values are
`open` and `done`; Done removes the item as the current interface does unless a future retention
design is separately approved.

Legacy mapping:

- `new` → `route: null`, `state: open`;
- `supervision` → `route: supervision`, `state: open`;
- `scheduled` → `route: later`, `state: open`, preserving any independently seeded SRS record;
- `triaged` → `route: null`, `state: open`, with no invented destination.

The 50-item and 280-character caps remain. Eviction continues to prefer already routed items.
Every mutation is escaped on render and remains device-local.

### Resource matching

The current local search match remains a suggestion, not an answer to the learner's question.
Opening a matched page does not assign a route. **Look up later** places the item in that route;
**Schedule review** remains a separate explicit action when a matched page has a quiz.

### Privacy copy

Because user-initiated email is now possible, the old absolute statement “never sent anywhere” is
no longer accurate. Replace it with a truthful boundary:

> Saved on this device. Nothing leaves unless you choose Copy or Email. No patient details.

The point-of-entry PHI warning, ward-location heuristic, deletion controls, and Erase all remain.

## Learner-controlled faculty email draft

### Entry and selection

The question inbox adds **Email selected questions**. Nothing is preselected. The learner may
select open questions across routes; the preview groups them under:

- Ask on rounds
- Discuss in supervision
- Look up later
- Unrouted

Each item includes the learner-authored question and, when available, the canonical source-page
title and public route. It does not include answers, completion state, practice results, reading
position, timestamps, role identity, or inferred patient/context data.

### Recipient

The learner enters only the local part of the faculty address. The suffix is visible and
non-editable:

```text
[ faculty.name           ] @mainehealth.org
```

- The local part is required and validated for a conservative email-safe character set; whitespace,
  control characters, separators for multiple recipients, and a second `@` are rejected.
- The UI cannot verify that the mailbox exists and says so plainly in the mail-app handoff.
- The recipient is never persisted, added to history state, emitted to analytics, or sent to a
  site backend.
- One draft has exactly one recipient. Multiple-recipient or group-email behavior is out of scope.

### Required review and handoff

Before enabling **Open email draft**, require the learner to affirm:

> I reviewed these questions and removed patient names, identifying details, and other PHI.

The button creates a URL-encoded `mailto:` draft and opens the learner's configured mail app. The
mail app owns From identity, final recipient display, editing, queuing, delivery, and Send. The
site does not claim the message was sent and does not mark questions shared automatically.

The subject is neutral, for example `Psychiatry learning questions (3)`. The body begins with a
plain statement that this is a learner-prepared teaching digest and contains no patient
information, followed by the grouped questions and source links.

### Fallbacks

- If no mail handler opens, offer **Copy email text**.
- If clipboard access fails, reveal a read-only selectable text area.
- If the encoded draft exceeds a conservative, browser-tested URI threshold, do not truncate
  silently. Ask the learner to reduce the selection or use the copy fallback.
- Creating the draft while offline is allowed; sending depends on the learner's mail client and
  connection. The site does not promise delivery.

There is no email API, server submission, faculty dashboard, delivery pixel, receipt, or automatic
faculty notification.

## Decision 4 — verified offline shift readiness

### Why this is verification, not another downloader

`common.py` already emits a versioned service worker whose install uses `cache.addAll(PRECACHE)`.
For a successfully activated version, the non-media precache is atomic. A second “download Week
2” cache would duplicate bytes, introduce another stale-version problem, and misleadingly imply
that only selected weeks work offline.

The approved surface is therefore **Shift-ready check**, not **Download shift pack**.

### Readiness card

Today/On shift exposes a compact status that opens a detailed card. The card scopes its inventory
to the learner's current Path week or APP route while verifying against the site's active cache.
It has four states:

| State | Meaning |
|---|---|
| Checking | Waiting for service-worker control/status response. Never shown as ready. |
| Ready | The active version's required non-media route files are present. |
| Update available | Current files work offline, but a newer worker is waiting. |
| Not ready | No controlling worker, missing required files, failed install, unsupported browser, or verification timeout. |

The detailed inventory distinguishes:

- readings, shell/navigation, search data, and bundled tools — eligible for offline verification;
- saved place and captured questions — local device state, not part of the network cache;
- audio, video, live Interview Room/services, external links, and actual email sending — connection
  required.

No item may display “offline” merely because its link exists in `FD_INDEX`.

### Service-worker handshake

Add a same-origin `MessageChannel` request that asks the active worker to verify a supplied list of
current-route URLs against its current versioned cache. The response contains only:

```json
{
  "version": "build-derived-version",
  "ready": true,
  "present": ["/content/example.md"],
  "missing": []
}
```

No learner state or content text is sent to the worker. The UI derives the requested current-route
URLs from the same build-injected index used by Path/Essentials; the service worker is the authority
for whether those URLs are actually cached.

**Refresh offline copy** calls `registration.update()` while online and then uses the existing
update-available flow. It must not force-reload or destroy an active tool session. When offline,
the action explains that the existing verified copy remains available and refresh must wait.

The readiness check writes no analytics and needs no persistent timestamp. “Checked just now” is
session UI, not a durable claim. On the next visit, verification runs again.

## State and data-flow summary

```text
mobile dock ──dispatches──> existing Front Door routes/actions
     │
     ├─ Continue ─────────> existing Today/reader primary action
     ├─ Search ───────────> existing search panel
     └─ Capture ──────────> cw_capture_v1 (device only)
                                │
                                ├─ route locally
                                └─ selected questions ──user click──> mailto draft

reader scroll ──debounced──> cw_frontdoor_v1.readingPlaces (device only)

Shift-ready check ──same-origin MessageChannel──> active service worker/cache
```

No flow sends learner state to analytics, an AI service, a supervisor dashboard, or the faculty
console.

## Failure behavior

| Failure | Required behavior |
|---|---|
| localStorage unavailable/full | Do not claim a reading place or question was saved; keep content usable and offer copy for unsaved question text. |
| Stored reading heading missing | Drop only that stale place and open the page at the top. |
| Capture v1 malformed | Recover valid bounded items only; never widen text/status values. |
| Recipient invalid | Inline error; do not create a `mailto:` URL. |
| Mail app unavailable | Clipboard fallback, then selectable text fallback. |
| Offline cache unsupported/uncontrolled | Show Not ready with ordinary online browsing unchanged. |
| Readiness response times out | Show Not ready/Unable to verify, never optimistic Ready. |
| Media requested offline | Leave browser-native failure behavior and label it connection-required; never serve partial media from the cache. |
| New worker waiting during a tool session | Preserve the existing Later path; never reload automatically. |

## Verification contract

### Unit and contract tests

- `fd_state`: reading-place validation, cap/eviction, deterministic update, stale-heading removal,
  and storage-failure result.
- `fd_shell` / `fd_wire`: audience-specific slot 2, one context-action source, Search/Capture
  dispatch, APP mode, and no simultaneous mobile fixed bars.
- `fd_reader`: footer success/failure copy, deterministic heading ids, restoration timing, Start at
  top, and no practice-answer persistence.
- capture store: v1→v2 migration, route allowlist, save-before-route, oldest-unrouted selection,
  bounds, escape behavior, and malformed-store recovery.
- email builder: no default selection, fixed domain, single-recipient validation, encoding,
  deterministic grouping, PHI affirmation gate, no persisted recipient, length fallback, clipboard
  fallback, and absence of learner text/recipient in analytics calls.
- service worker: readiness message validation, current-cache matching, missing-file failure,
  timeout/unsupported states, media exclusion, atomic version semantics, and update behavior.
- `CLASS-INVENTORY.md` updated with the new dock nesting/state classes and retired fixed-surface
  selectors.

### Browser checks

Run the affected smoke paths for both built audiences and the non-persistent APP invitation:

- 375×812 and a wider phone viewport;
- top-level navigation, reader, tool, search, Capture dialog, question inbox, and email preview;
- fixed-dock clearance at the final focusable element;
- exact reading-place resume after reload and safe fallback after a changed heading fixture;
- device-store failure fixture;
- offline reload with verified non-media route files;
- media/live-service connection-required copy;
- update waiting while a tool is active;
- keyboard and reduced-motion behavior.

The full local verification gate and sequential MS3/resident builds remain required before any
push. Ubuntu/Chromium visual baselines must be refreshed through the existing workflow, never on
macOS. Native VoiceOver, mail-client handoff, and real unreliable-network behavior remain manual
evidence; green CI cannot claim them.

## Rollout boundaries

1. Implement pure state/builders and tests first: dock action derivation, reading-place records,
   capture v2 migration, email-body builder, and readiness response parsing.
2. Integrate the single mobile dock and remove the superseded phone fixed surfaces.
3. Add quiet reading-place persistence and restoration.
4. Add capture routes and the oldest-unrouted Today card.
5. Add the learner-controlled MaineHealth email draft and fallbacks.
6. Add the service-worker readiness handshake and Shift-ready card.
7. Verify both audiences and APP mode, then obtain native-device accessibility/mail-client proof.

This sequence is implementation guidance, not merge or deployment approval. No analytics flag,
deployment setting, faculty record, attestation hash, or clinical content changes as part of this
work.

## Rejected alternatives

**A second fixed quick-action bar:** rejected because the current phone chrome already demonstrates
the clearance and competition cost of multiple bottom surfaces.

**Manual “Save my place” or inline stopping markers:** rejected by the author. Persistence is
automatic and the only persistent disclosure is the page-bottom device-only line.

**Route-before-save capture:** rejected because an interruption between typing and classification
could lose the question.

**Site-operated faculty email:** rejected. It would require a backend, delivery/security policy,
recipient governance, and a materially different privacy review. The learner's mail app owns Send.

**Free-form email domain or multiple recipients:** rejected for this version. The visible locked
domain is `@mainehealth.org`, and each draft has one learner-entered local part.

**Selective week download:** rejected because the current service worker already precaches the
non-media site atomically. Verification is more honest and less complex than a parallel cache.

**Claiming full offline support:** rejected. Media, live services, external links, and email
delivery remain connection-dependent and must be labelled that way.
