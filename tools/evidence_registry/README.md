# Evidence Registry and Zotero Workflow

The repository is authoritative for curriculum meaning: stable evidence IDs,
bibliographic decisions, faculty-approved week mappings, appraisals, and review
governance live in `evidence_registry.json`. Zotero is authoritative for the
faculty member's reference items, tags, observed collection membership, and
licensed attachments. A local report describes Zotero as observed; it never
becomes curriculum authority and never rewrites a repository week assignment.

## Offline gate

This dependency-free command is safe for CI and normal site builds. It does not
import the Zotero bridge or contact Zotero, PubMed, Crossref, or any other
network service.

```bash
python3 tools/evidence_registry/validate.py --check-generated
```

## Explicit local, read-only Zotero commands

Run these only on a faculty workstation with Zotero Desktop open:

```bash
python3 tools/evidence_registry/zotero_reconcile.py status
python3 tools/evidence_registry/zotero_reconcile.py snapshot
python3 tools/evidence_registry/zotero_reconcile.py check
python3 tools/evidence_registry/zotero_reconcile.py check --attachments
python3 tools/evidence_registry/zotero_reconcile.py report --xlsx
```

The bridge uses HTTP GET against an exact allowlist of local Zotero routes. It
has no import, save, update, or delete operation, so the workflow is read-only.
`check --attachments` is the only command above that requests attachment-child
metadata and locally checks PDF existence, size, and signature. It never copies
the file or extracts article text. Attachment state from a prior explicit check
is preserved when a later metadata-only snapshot or report is generated.

`report --xlsx` creates a Tier 1-only compatibility workbook. If the optional
dependency is unavailable, install it locally with:

```bash
python3 -m pip install -r tools/evidence_registry/requirements-local.txt
```

## Identity and faculty-local links

A Zotero parent item key such as `KL5HP3MU` identifies one record in the local
library. It is not a BibTeX citation key. Faculty can open a known parent record
locally with `zotero://select/library/items/<parentKey>`; this is a workstation
convenience, not a portable learner link or a curriculum identifier.

## Privacy and Git boundary

All snapshots and reports are generated under `outputs/evidence_registry/`,
which Git ignores. They may contain stable evidence IDs, parent item keys,
bibliographic metadata, tags, collection keys, and path-free attachment states.
They must not contain attachment child keys, absolute or `file://` paths,
file-view URLs, PDFs, extracted/indexed full text, or licensed article content.

Generated local artifacts are non-canonical and must never be staged or
committed. The tracked evidence registry and its generated Tier 1 Markdown views
remain the source of truth reviewed through normal repository changes.
