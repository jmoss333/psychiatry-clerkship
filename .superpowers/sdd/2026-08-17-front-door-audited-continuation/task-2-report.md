# Task 2 report — site-specific Front Door payloads

## Outcome

The existing learner shell remains live and unchanged in its visible structure. The build now prepares dormant Front Door modules and site-specific data: MS3 receives 81 placed library references and resident receives 90, including the six resident markdown pages and three `rp-*` tools. Titles and kinds are derived from each final site's navigation, not duplicated in curriculum data.

## RED evidence

- `python3 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py` initially failed with `ModuleNotFoundError: No module named 'frontdoor_catalog'`.
- `python3 13_Faculty_Resources/_automation/site_build/test_common.py` initially failed because `/*__FD_DATA__*/` was not registered.
- `node --test tests/fd-inject.test.mjs tests/parallel-ceilings.test.mjs` initially failed because the shell lacked the Front Door markers/data needles and `SNIPPET_MARKERS` still had 7 entries.
- `python3 13_Faculty_Resources/_automation/test_validate_curriculum.py` initially failed both new `siteLibrary` negative controls because unknown-column and duplicate additions were accepted.
- Artifact inspection then exposed a real resident replacement defect: a semicolon inside the injected `curriculum.json` note truncated the regex-based replacement. A regression test reproduced this and failed before the JSON-aware replacement was implemented.

## GREEN evidence

- `python3 13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py` — 6 tests passed, including the semicolon-safe resident replacement regression.
- `python3 13_Faculty_Resources/_automation/test_validate_curriculum.py` — 41 tests passed.
- `python3 13_Faculty_Resources/_automation/site_build/test_common.py` — 53 tests passed.
- `node --test tests/fd-inject.test.mjs tests/parallel-ceilings.test.mjs` — 5 tests passed.
- `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3` — passed; static QA had 0 hard failures and the LFS media preflight passed: 105 media files, no pointer stubs.
- `bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res` — passed sequentially after MS3; static QA had 0 hard failures and the LFS media preflight passed: 105 media files, no pointer stubs.
- Built artifact inspection parsed every injected JSON global and confirmed: MS3 `placed=81`, `manifestRefs=81`, roles `student/subi/staff`; resident `placed=90`, `manifestRefs=90`, roles `pgy1/pgy2/staff`; both builds contain `frontdoor.css`.
- Inline JavaScript syntax compilation passed for both built `index.html` files.
- `git diff --check` passed.

The first non-escalated build attempt hit sandbox-only `listen EPERM` failures in smoke-server tests. The required rerun with loopback permission passed all 969 root Node tests; this was an execution-environment limitation, not a code failure.

## Changed files

- New projection/injection implementation and tests: `13_Faculty_Resources/_automation/site_build/frontdoor_catalog.py`, `13_Faculty_Resources/_automation/site_build/test_frontdoor_catalog.py`.
- Curriculum structure/schema/semantic validation: `curriculum.json`, `curriculum.schema.json`, `13_Faculty_Resources/_automation/validate_curriculum.py`, `13_Faculty_Resources/_automation/test_validate_curriculum.py`.
- Build wiring and dormant module registration: `13_Faculty_Resources/_automation/site_build/build_deploy.py`, `13_Faculty_Resources/_automation/site_build/resident_section.py`, `13_Faculty_Resources/_automation/site_build/common.py`, `13_Faculty_Resources/_automation/site_build/spa_index.html`.
- Marker contracts: `13_Faculty_Resources/_automation/site_build/test_common.py`, `tests/fd-inject.test.mjs`, `tests/parallel-ceilings.test.mjs`.

## Self-review

- Confirmed the resident payload is rebuilt after resident extras, final nav, and topic-meta overlays, replacing all five copied MS3 globals rather than retaining any student payload.
- Confirmed projected `libraryColumns[].refs` remain string-only arrays; the projection rejects duplicate or absent final-nav references and does not mutate its input.
- Confirmed no `_build` files, media, credentials, crisis copy, or clinical content were changed. The new stylesheet link is inert until a later task mounts Front Door markup.
- Known baseline soft QA warnings remain unchanged: metadata coverage and computed localStorage-key advisories. Neither build has a hard failure.

## Plain-language outcome

The current site looks the same to learners, but it now carries a checked, site-appropriate catalog behind the scenes. That means a later Front Door rollout can use correct resident-only links and labels without accidentally showing the student catalog on the resident site.

## Next option

Proceed with Task 3: finish Front Door reader typography and pre-wire accessibility semantics while leaving the current shell in place.

## Innovative follow-up

Add a small build-time payload receipt (`frontdoor-payload.json`, generated and ignored from source) that records placed references, role IDs, and catalog hashes per site. A later visual/controller task could compare that receipt before activating the new shell, making site-crossing regressions immediately visible without inspecting the full HTML payload.
