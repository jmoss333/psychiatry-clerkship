# EPA micro-assessment — UNSHIPPED DEMO (F6)

> **No real student data may ever be entered here.** The roster is fictional (Student A–F) and
> the tokens are made up. The page says so in a banner on every screen, and its only text field
> refuses anything that looks like a name, an email or an ID number.

**Purpose:** to let Josh and the UNE / MMC stakeholders try the bedside flow before anyone
decides where real data would live. The flow is QR on the badge → one-tap feedback →
competency timeline → template-drafted narrative. Designed for data minimisation; **compliance
review pending**. Nothing here is claimed FERPA-compliant, and it is **not the official
evaluation** (the same boundary as `13_Faculty_Resources/Feedback/feedback.html`).

## What the demo does

| View | What happens |
| --- | --- |
| 1 · Scan badge | Six synthetic badge cards. Each has an opaque token (`EPA-DEMO-XXXX`) and a QR drawn on the device by an inline encoder (no library, no network). "Simulate scan" opens Capture. The page also accepts a typed token, and honours `#t=<token>` in the URL, which is how a real QR would hand the token over. |
| 2 · Capture | Taps only: synthetic observer, Core EPA (1–13), supervision level (illustrative 1–5), one strength chip, one next-step chip. The observation is stamped to the **day**. There is **no free-text comment**, so no patient detail can be typed. |
| 3 · Timeline | One student's observations by day and by EPA, with the supervision-level trajectory, distinct observers and EPAs not yet observed. |
| 4 · Draft eval | A fixed-sentence template filled from the timeline's counts and chips, with copy-to-clipboard. **No LLM.** It is labelled DRAFT and "not the official evaluation". |

Storage is one literal key, `cw_epa_demo_v1`, in this browser's `localStorage`. Every access
is wrapped in `try/catch`, and the page falls back to memory if storage is blocked. "Wipe demo
data" clears it. Nothing is sent anywhere: no `fetch`, no beacons, no analytics.

Run it by opening `epa-micro.html` directly. It needs no server.

## EPA labels and scale

The EPA labels are the 13 titles of the AAMC *Core Entrustable Professional Activities for
Entering Residency* (2014), quoted with attribution — titles only. The 1–5 supervision scale
and its short labels are **illustrative**. **D-F6-6:** a real deployment should use whatever
the school's official EPA form and scale already use, so the data stays portable. Do not treat
this demo's scale as a proposal.

## The decisions it exists to inform (none taken here)

| Code | Decision | Plan's recommendation |
| --- | --- | --- |
| D-F6-1 | Host for real data: institutional evaluation system vs ClerkshipOS (private, RLS) vs faculty-console functions | Institutional system first; ClerkshipOS if the school has none |
| D-F6-2 | Who maps token → student and holds that key | Clerkship coordinator (non-grading), tokens rotated per block |
| D-F6-3 | Residents in scope | Separate GME determination; MS3 first |
| D-F6-4 | May an LLM touch faculty comments | No (the demo has no comments at all) |
| D-F6-5 | May F6 data feed the director dashboard (F8) or the L8 study | Aggregates only, n ≥ 5, per block |
| D-F6-6 | Scale / instrument | The school's official EPA form |

## Data flow under the three hosting options

```
(a) Institutional evaluation system  — recommended
    badge QR ──► school's mobile EPA form (school SSO) ──► school's record (FERPA custodian = school)
                                                          └─► aggregate export, n≥5 ──► F8 (optional, D-F6-5)

(b) ClerkshipOS (private repo; Supabase + RLS, dormant today)
    badge QR ──► capture page (auth) ──► observations table, RLS: faculty see own, student sees own,
                                         director sees all; token→name map held by coordinator only
                                                          └─► suppressed aggregate view ──► F8

(c) Faculty-console Netlify functions  — least recommended
    badge QR ──► console capture page ──► new per-student store beside attestation infrastructure
    (mixes the console's GitHub-App identity with student records; a new backend decision, D-X-4)
```

In every option the public library repo and the public learner sites hold **no** per-student
record. This demo stays device-local for that reason.

## How a real QR would work

The demo encodes only the bare token. A real card would encode
`https://<host chosen under D-F6-1>/capture#t=<token>`. The fragment never reaches the server
in the request line, and the capture page reads it after the observer signs in. Tokens are
opaque, rotated per block, and the token→student map never sits beside the observations. The
inline encoder (byte mode, level M, versions 1–3) is enough for that URL only if it stays under
42 bytes. A production build would use the host platform's own QR feature or a vetted library.

## Files

- `epa-micro.html` — the demo. It has these blocks:
  - `#epa-roster` — the synthetic roster as JSON.
  - `#epa-qr` — the QR encoder.
  - `#epa-engine` — the pure logic: token guard, observations, timeline and draft.
  - `#epa-ui` — the interface.
- `../../tests/epa-micro.test.mjs` — the tests. They cover:
  - the banner, the synthetic roster, no free text, the single storage key inside `try/catch`, and no network;
  - the token guard, the timeline and the draft;
  - a QR round-trip with Reed–Solomon bytes checked independently;
  - matrices pinned to ones a real decoder (OpenCV) read back;
  - and that the demo is not registered to ship.
- `../../docs/superpowers/specs/2026-10-27-epa-micro-assessment-design.md` — the design.
