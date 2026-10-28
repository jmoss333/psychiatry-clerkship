# EPA micro-assessments (F6) — demo design

**Date:** 2026-10-27 · **Status:** unshipped demo, synthetic data, device-local · **Plan:** F-wave
WP-F6-demo.

## Goal

Make the bedside flow tangible for the hosting / custodian decisions (D-F6-1…6): QR on the badge,
15-second one-tap feedback, a per-student competency timeline, and an end-of-clerkship narrative
that drafts itself from timestamped observations. Store nothing real anywhere.

## Constraints

- The public repo and the public learner sites never hold a per-student record. The demo
  therefore uses a fictional roster (Student A–F, `_synthetic: true`) and one device-local key,
  `cw_epa_demo_v1`. Every storage access is wrapped in `try/catch`, with an in-memory fallback.
- No free text. Feedback is taps only, which closes off PHI entry. The one text input is the
  token field. It is pattern-limited, and a guard refuses name-, email- and ID-shaped input with
  a reminder.
- No network, analytics, backend, LLM or new dependency. The QR encoder is inline: byte mode,
  level M, versions 1–3.
- AAMC Core EPA titles are quoted, titles only, with attribution. The scale is illustrative,
  pending D-F6-6.
- Not registered (`site_manifest.json`, `site_extras.py`, nav). `standards.json` and
  `13_Faculty_Resources/Feedback/` are untouched.

## Shape

- An observation is `{token, faculty, epa 1–13, level 1–5, strength chip, next-step chip, day}`.
  The set is closed: `makeObservation` drops any other field and rejects values not on the lists.
  The day is the finest time grain.
- The timeline sorts by day and reports a per-EPA trajectory (first / latest / range), the number
  of distinct observers, the EPAs not yet observed, and tallies of strengths and next steps.
- The draft is a fixed-sentence template over the timeline. It is deterministic for the same
  input, labelled DRAFT and "not the official evaluation", and flags a single-observer record.

## Verification

- `node --test tests/epa-micro.test.mjs` (14 tests). The QR tests:
  - read the payload back from the matrix;
  - compare its Reed–Solomon bytes with an independent implementation;
  - pin the auto-masked matrices for the six tokens, which OpenCV decoded back to their tokens
    at authoring time under all eight masks.
- `node --test tests/*.test.mjs`
- `bash bin/verify.sh --push`
- `shipped_pages.py --check`, which must be unchanged because nothing is registered.

## Known limits

- The token guard is a deterrent, not a classifier: a determined user can type anything that
  fits `EPA-DEMO-XXXX`. With no free-text field, nothing else can be typed at all.
- `localStorage` on a shared device is readable by anyone using that browser profile. That is
  acceptable for synthetic data only, and is one reason real data needs a host (D-F6-1).
