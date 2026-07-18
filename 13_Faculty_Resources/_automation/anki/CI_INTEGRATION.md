# pcl_anki CI Integration — Status and Wiring Guide

## Current CI gate (active)

`test_qbank.py` in `09_Exam_Prep/shelf_comat_bank/engine/` runs in the fast
pre-merge gate (stdlib only, no install required):

```yaml
- name: Unit — shelf/COMAT question bank data-quality gate
  run: python3 09_Exam_Prep/shelf_comat_bank/engine/test_qbank.py
```

## pcl_anki pytest suite (deferred — requires anki==26.5 + genanki)

The full `tests/anki/` pytest suite tests actual Anki SQLite deck structure.
It requires CPython 3.11 + the locked deps in `requirements.lock` (anki 26.5,
genanki). These cannot run in the bare `ubuntu-latest` runner without a
`pip install --require-hashes` step.

**To add when ready:**

```yaml
- name: Install — governed Anki environment
  run: |
    python3.11 -m venv _build/anki-venv
    _build/anki-venv/bin/pip install \
      --disable-pip-version-check \
      --require-hashes \
      --requirement 13_Faculty_Resources/_automation/anki/requirements.lock

- name: Unit — pcl_anki governed release tests (excludes anki-library tests)
  run: |
    _build/anki-venv/bin/python -m pytest tests/anki/ \
      --ignore=tests/anki/test_render.py \
      --ignore=tests/anki/test_migration.py \
      --ignore=tests/anki/test_identity.py \
      -q
```

`test_render.py`, `test_migration.py`, `test_identity.py` import the `anki`
C-extension library directly and require `anki==26.5` (also in the lock) — add
them once those are confirmed stable in the CI venv on ubuntu-latest.

## Local development

Run all pcl_anki tests locally via:

```bash
cd 13_Faculty_Resources/_automation/anki
bash run_python.sh -m pytest ../../../tests/anki/ -q
```

The script auto-creates a CPython 3.11 venv keyed to `requirements.lock`.
Set `ANKI_LOCK=min` to test against anki 23.10.1 (minimum supported version).

## .apkg regeneration

Deck `.apkg` files in `09_Exam_Prep/anki_export/` are NOT auto-regenerated in
this PR. Regenerate via:

```bash
bash run_python.sh build_release.py --output 09_Exam_Prep/anki_export/
```

Requires the governed Anki environment above. Gate result (`build_and_check.sh`)
falls back to committed `.apkg` when genanki is unavailable.
