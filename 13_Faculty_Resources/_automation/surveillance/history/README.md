# Surveillance history — retention policy

Committed on main: `baselines/` (guideline content hashes), the monthly
`digest_YYYY-MM.md`, `guideline_delta_*.json`, and `last_run.json`.

Dated per-run reports (`link_audit_YYYY-MM-DD.{json,csv}`) are NOT tracked on
main. Each weekly run writes them into this directory at runtime, publishes them
to the `automation/surveillance-inbox` branch (report_branch.py), and uploads
them as workflow artifacts (90-day retention). Do not re-commit them here, and
do not gitignore them either — report_branch.py stages this directory without
`-f`, so an ignore rule would silently drop them from the inbox branch.
