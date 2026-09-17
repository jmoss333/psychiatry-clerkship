# Production revision parity

The two learner sites should serve the same source revision. An HTTP 200 response
or a successful build alone does not establish that. The daily **Maintenance —
Production Learner Canary** reads each public site's `/tool-governance.json`, using the URLs in
`maintenance_config.json`. Each builder supplies the same captured Git revision to
both the app's `FD_CORE_REVISION` and every manifest item's `source.revision`.
The guard requires every item to carry the canonical repository and one common,
valid revision. It never reads `contract.revision`, which identifies a different
repository's schema. No site-builder change is needed.

The check runs at the existing **09:20 UTC daily** schedule and on manual workflow
dispatch. It does not require a Netlify credential or change a deployment. It runs
independently of browser setup, crawling, and the Netlify API health check.

## Results

| Exit | Status | Meaning |
| --- | --- | --- |
| 0 | `matched` | Both served manifests contain one valid, equal 40-character source revision. |
| 1 | `mismatch` | Both revisions were readable but still differed after the final observation. |
| 2 | `unavailable` | Configuration, either response, revision metadata, or receipt writing could not be verified. |

Mismatch and unavailable results fail the workflow and emit a GitHub error annotation.
The existing workflow-failure/heartbeat monitoring can then surface the failed run.
They never produce a green result by comparing two missing values or examining only
one site. Redirects, non-JSON responses, empty or malformed manifests, duplicate JSON keys or
item IDs, mixed/missing/invalid source revisions, and responses larger than 4 MiB
fail closed. Only revision observations are saved; manifest content is not stored.
This is a comparison of served build provenance. It does not independently establish
that the root HTML agrees with the manifest; browser/root checks remain separate.

The workflow makes at most three observations, with 60 seconds between unsuccessful
observations. Each observation reads **both** sites again. This tolerates brief rollout
skew and transient request failures. If the sites converge, the run passes and keeps
the initial mismatch in the receipt. Longer skew fails and should be inspected, not
silenced by increasing the retry window without evidence.

`production-revision-parity.json` is uploaded with the existing canary evidence even
on failure. It records each observation's UTC time, site names/URLs, revision or
bounded error code, final status, and exit code. It contains no page content.

## Run and investigate

```bash
python3 13_Faculty_Resources/_automation/maintenance/production_revision_parity.py \
  --attempts 1 --out /tmp/production-revision-parity.json
python3 -m unittest tests.maintenance.test_production_revision_parity -v
```

For a mismatch, inspect the two revisions and the corresponding production deploys.
One deploy may still be running, may have failed, or may have published another branch.
For `unavailable`, inspect the recorded error and restore the missing evidence before
calling either site healthy. Rerun the workflow after the underlying condition clears.
The guard does not roll back, trigger a deploy, or approve a release.

**Equality is not freshness.** Both sites can match on an older release. The checker
deliberately does not require equality to its own checkout or to a moving main tip;
that would mistake normal deployment lag for a broken site. To verify a particular
merge, check that both served revisions contain that merge in Git history. Existing
Netlify deploy-health checks remain responsible for failed production deployments.
