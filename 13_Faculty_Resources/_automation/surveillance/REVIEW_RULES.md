# Surveillance Review Rules

How findings are triaged, routed, and closed. These rules keep the system
**high-signal** and **defensible**, and enforce the human gate. They are the
governance layer for `config/finding.schema.json`.

## 1. Severity → action

| Severity | Definition | Routing | SLA |
|---|---|---|---|
| **P0** | Patient-safety or high-traffic breakage: FDA boxed warning / REMS change touching a taught drug; guideline retraction; dead link under `00_START_HERE/**`, `04_Acute_and_Safety/**`, or `index.html` | GitHub issue **immediately** + notify owner | Review ≤ 72h |
| **P1** | Guideline revision; USPSTF grade change; new APA guideline; 301 redirect on a cited source; broken link on a normal page | GitHub issue | Review ≤ 2 weeks |
| **P2** | Candidate resource; minor/cosmetic source change; SAMHSA/AACAP low-urgency updates | **Batched monthly digest** (no per-item issue) | Review monthly |

Escalation override: any finding whose `affects[]` includes a path in
`04_Acute_and_Safety/**` is bumped one level (P2→P1, P1→P0).

## 2. Idempotency (no duplicate issues)

- Every finding carries a stable `fingerprint = hash(source_id + change_type + change_signature)`.
- Before opening an issue, the sync **searches open+closed issues** for that
  fingerprint (carried in a hidden `<!-- fp:... -->` marker and a label).
  - Match found & open → **comment/update**, do not create.
  - Match found & **dismissed/closed-as-wontfix** → **do nothing** (a dismissed
    fingerprint is not reopened; the source must produce a *new* signature to re-fire).
- Issue title format (also aids human dedup): `[P0][fda-drug-safety] <summary>`.

## 3. Human gate (hard rule)

- The system **never edits curriculum content.** It opens issues and writes datasets.
- Resolution path: human reviews → updates the teaching page **manually** if needed →
  re-stamps the page in `../../reviewed.json` (`{status:"reviewed", at, by}`) →
  closes the issue. Re-stamping is what marks content current again.
- This mirrors the existing `topic_meta.json` / `reviewed.json` attestation model
  ("AI-drafted … pending faculty attestation").

## 4. "Last verified" / anti-false-currency

- An automated monitor can create a **false sense** that content is current. Counter it:
  - Each source in the registry gets a `last_checked` stamp written to
    `history/last_run.json` each run.
  - A page is only "current" when its `reviewed.json` date is **≥** the newest
    `detected_at` among findings that `affect` it. The digest lists any page failing
    this test as **"review overdue."**

## 5. Copyright / ToS (signal_only sources)

- `modality: signal_only` sources (DSM-5-TR, journals) are monitored by
  **version / errata / table-of-contents / metadata hash only.**
- For these, `evidence.diff_excerpt` **must be empty**; store hashes and dates, never
  the copyrighted text. Respect `robots.txt` and paywalls.

## 6. Alert-fatigue & reliability controls

- **Retry-before-flag:** transient failures (timeouts, 429) are retried
  (`defaults.retry_before_flag`) before any finding is emitted.
- **Dead-scraper alarm:** if a guideline source that historically yields content
  returns **0 extracted characters** (or the crawler errors), emit a **P1
  "scraper health"** finding instead of silently reporting "no change." Silence must
  never be mistaken for stability.
- **Browser-required sources:** if a registry source sets `link_check:
  browser_required`, stdlib/curl `401`, `403`, or no-response results are treated as
  checker limitations rather than broken-link findings. A definitive `404`/`410`
  still flags. Verify these sources with browser/Apify before acting.
- **Redirect nuance:** `301` on a cited source → P1 update (URL moved); `302` → pass.
- **Soft-404:** HTTP 200 whose body matches not-found patterns is treated as broken.
- **Digest batching:** P2 items never page anyone; they accumulate into one monthly
  `resource_intake` / low-severity digest.

## 7. What closes a finding

`status` lifecycle: `new → triaged → issue-open → actioned → dismissed`.
A finding is `actioned` only when either (a) the affected page(s) were re-stamped in
`reviewed.json`, or (b) a human explicitly confirmed no change was warranted (logged in
the issue). Nothing auto-closes.
