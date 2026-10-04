# Manual Firecrawl comparison probe

The normal Monday collector and faculty inbox remain unchanged. To investigate provider-side change tracking, manually dispatch `surveillance-firecrawl.yml` with `comparison_probe=true`. The separate job has only `contents: read`, does not persist checkout credentials, and uploads `firecrawl-comparison-probe-<run>-<attempt>` for 90 days. Its title excludes it from the production failure/recovery signal; workflow heartbeat already examines scheduled runs only.

The probe makes two sequential requests for each of the five registered guideline URLs, at most ten requests with no retries. Each source receives a unique per-run tag. The first response must report `new` with no prior scrape. The second must report `same` or `changed`, with its previous-scrape timestamp within the first fetch window (five-second clock tolerance). This supports alignment, not a cryptographic guarantee of provider lineage. Missing, unexpected, removed, or failed observations are inconclusive. `removed` is retained for review; nothing is deleted.

`report.json` keeps approved-source markdown, selected retrieval metadata, provider tracking status/diff, request timestamps, exact and normalized hashes, and explicit coverage. Arbitrary response metadata, request headers, and credentials are excluded. Do not publish or paste the full report indiscriminately; it contains retained publisher text. The five targets currently permit full-text surveillance. Production history paths and existing output directories are refused.

Outcomes: agreement, normalization-difference (provider and exact text agree on a change but our whitespace-normalized text is unchanged), candidate-disagreement, or inconclusive. A short-interval quiet run proves integration only, not sensitivity to future clinical changes. Summaries include every requested target; an incomplete set cannot report success. An interrupted job retains the last completed pair with `status=incomplete` and `requestCountComplete=false`; the recorded count can omit in-flight calls, while the overall ten-request cap still holds.

Exit codes: 0 for complete examination without candidate disagreements; 1 for a complete examination needing disagreement review; 2 for incomplete examination. No clinical content, faculty decision, attestation, source-review credit, or production inbox is modified.

Local use requires a securely configured `FIRECRAWL_API_KEY` and a new output directory:

```sh
python3 13_Faculty_Resources/_automation/surveillance/bin/run_firecrawl_probe.py --out-dir /tmp/firecrawl-comparison-run
```

Reference: [Firecrawl change tracking](https://github.com/firecrawl/firecrawl-docs/blob/main/features/change-tracking.mdx). Provider reports use raw scraped markdown; our existing collector collapses whitespace. Tags and extraction options must stay identical across a pair.
