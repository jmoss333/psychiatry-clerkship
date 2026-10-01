# ReConnect sync fixtures (synthetic)

These files are the fixtures for `13_Faculty_Resources/_automation/test_sync_from_reconnect.py`.
All of the data is invented, so CI never needs the network or a real ReConnect checkout.

- **Phone numbers.** Every phone number is a reserved fictional `555-01xx` number. None of them is a real crisis line.
- **Citations.** PMIDs `9000000x` and DOIs under `10.9999/` do not exist.
- **Drugs.** The drug names (Alphazine, Betamol, Gammatrol) are invented.
- **Therapies.** The modalities (Fixture Modality, FixTherapy-B, FixTherapy-C) and their guidelines (FIXTURE GUIDELINE 1/2) are invented.
- **Scales.** The screening tools (Fixscale-9, Fixscale-7, Fixscale-L) are invented; their `items` values are counts, never item text.
- **Dose-like fields.** The upstream fixture carries these fields only so the report can prove it flags them. Their values have no units, so they cannot match the library's dose-literal regex.

| Path | Stands in for |
|---|---|
| `upstream/` | a `reconnect-psychiatry-system` checkout (`databases/core/data_all.json`, `databases/evidence/staged-citations.json`) |
| `local/` | the clerkship registries (`crisis_resources.json`, `pharmacy.json`, `evidence_registry.json`) |
| `screening_tools_fieldmap.json` | the screening-tools field map (`_automation/screening_tools/reconnect_screening_tools_fieldmap.json`): a three-scale roster with one (Fixscale-X) missing upstream |
| `ebp_fieldmap.json` | the EBP field map (`_automation/therapies/reconnect_ebp_fieldmap.json`): a three-modality roster with one (FixTherapy-X) missing upstream |
| `fieldmap.json` | the G0 meds field map (`_automation/pharmacy/reconnect_meds_fieldmap.json`): a three-drug roster with one agent (Deltanol) missing upstream, and one mapped key (`half_life_hours`) absent upstream |
| `crisis_report.golden.txt` | the **legacy** crisis report, the parity oracle |

## How the golden file was made
`crisis_report.golden.txt` is the stdout of the **pre-refactor** `sync_crisis_from_reconnect.py`, taken from `main` at `deb2784`. That script was run against `upstream/`, with `local/crisis_resources.json` placed at a temporary repository root. The absolute upstream path in the output was then replaced with `<RECONNECT>/databases/core/data_all.json`.

The generalized engine must reproduce this output byte for byte. That parity is what shows the refactor changed nothing for the crisis dataset.

Do not regenerate the golden file from the new code, because then the new code would be checking itself. If the crisis report is ever meant to change, change it on purpose in its own PR and say so there.
