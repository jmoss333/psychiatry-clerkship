# ADR 008 — SIR Schema Lock at v0.1.0

- **Status:** Accepted
- **Date:** 2026-05-12
- **Deciders:** Josh Moss (clinical owner), Claude Code session `claude/setup-rc-dx-synth-Z6rKn`
- **Blueprint reference:** [`docs/architecture/2026-05-11-dx-synth-blueprint-v1.md`](../architecture/2026-05-11-dx-synth-blueprint-v1.md) §2.2
- **Backlog ticket:** §9 ticket 1.2

## Context

The Discharge Synthesizer architecture rests on a **Structured Intermediate
Representation (SIR)** — the JSON contract between LLM extraction, resource
matching, and template-driven output assembly. The blueprint TL;DR puts it
plainly: this is "the single architectural choice [that] collapses the
hallucination problem from 'constant clinical risk' to 'rare and bounded.'"

A SIR shape that drifts every PR has the inverse property: it makes the
extraction prompt, the resource-matching code, the template slot vocabulary,
the QA harness golden files, and the audit-export format all moving targets
simultaneously. The system becomes unowned.

## Decision

Lock the SIR shape at **schema_version `0.1.0`**, defined verbatim from
blueprint §2.2, with the following invariants:

1. **Two artifacts, kept in lockstep:**
   - `tools-suite/tools/rc-dx-synth/src/types/sir.ts` (TypeScript source)
   - `tools-suite/tools/rc-dx-synth/src/types/sir.schema.json` (JSON Schema
     draft 2020-12 mirror)

2. **`schema_version` is a literal `const "0.1.0"`** in both files. The
   schema rejects any SIR with a different version.

3. **Any change to the SIR shape is a breaking change** and requires:
   - A version bump (semver — increment major for breaking, minor for
     additive-required, patch for additive-optional or doc-only).
   - A new ADR that names the bump, lists the changed fields, and gives the
     migration story for in-flight session state.
   - A bump-matched update to the extraction prompt
     (`prompts/extract_sir.md`) so the LLM output continues to validate.
   - A bump-matched update to template slot references — the template linter
     (deferred to a later PR) gates this.

4. **The blueprint §2.2 interface is reproduced verbatim** in `sir.ts`,
   including comments. Editorial improvements ("could we rename
   `target_loc` to `target_level_of_care`?") wait for a future ADR; in this
   session we lock and ship.

### What's covered at v0.1.0

The full SIR per blueprint §2.2, plus minimal definitions for the auxiliary
types the blueprint references but leaves under-specified (`RedactionEvent`,
`Symptom`, `MedChange`, `Allergy`, `SubstanceEntry`). The auxiliary type
shapes are intentionally minimal: each carries the single mandatory field
the rest of the system needs (`med_name`, `substance`, etc.) plus optional
evidence-span and severity hints, and nothing more. They expand under a
schema bump when extraction prompt v1 (`§9 ticket 3.2`) and clinical review
identify concrete subfields.

### Validation guarantees at landing

- The JSON Schema compiles clean under Ajv 2020-12 (`strict: false`,
  `allowUnionTypes: true`).
- A minimal SIR fixture exercising every required field validates true.
- Negative test (deleting `safety`) fails with exactly one error.

## Alternatives considered

### A — Defer the schema until prompt v1 is written

**Rejected.** This is the failure mode the blueprint TL;DR warns against:
"Lock it early; version it." The extraction prompt, matching engine, and
template renderer all depend on a stable SIR contract. Building any of them
without a frozen shape forces a re-write when the shape stabilizes.

### B — Hand-author only TypeScript; skip the JSON Schema

**Rejected.** The LLM extraction call uses Anthropic tool-use with a JSON
Schema as the tool's `input_schema` — that schema must exist as JSON, not
TypeScript. Generating JSON Schema from TS via `ts-json-schema-generator`
or `typescript-json-schema` was considered; hand-authoring the v0.1.0 mirror
was faster, has no devDependency cost, and makes the schema independently
inspectable (and reviewable) in a PR. The generation path becomes worth its
weight once the SIR has 50+ fields and several breaking changes behind it.

### C — Auto-generate the schema from `sir.ts` in CI

**Deferred.** Plausible for v0.2+ when we have a real build step in the
tool's directory. At v0.1.0 there is no build step (single-file React UMD
convention) and adding one for the schema alone is over-engineered.

### D — Use Zod / TypeBox / Valibot instead of JSON Schema

**Rejected for the SIR.** Same reason as the resource schema (ADR 007):
the schema crosses a language boundary (LLM proxy is Node; future Python
maintenance scripts may want to read SIR exports). JSON Schema is the
neutral wire format. TS-native validators may be layered on top per consumer.

## Consequences

### Positive

- The extraction prompt has a fixed target. Iterating the prompt becomes a
  bounded engineering problem rather than a schema-design problem.
- The matching engine, template renderer, QA harness, and audit export can
  be built in parallel against the same contract.
- A SIR JSON file produced today will still validate (and still make sense)
  when v0.1.0 is the historical record next year.

### Negative

- We will discover gaps. The SIR almost certainly under-specifies some
  clinical edge cases (e.g., perinatal status, recent forensic involvement,
  IDD-specific accommodation needs). These will arrive as v0.2.0 / v0.3.0
  bumps with ADRs documenting the additions.
- The minimal auxiliary types (`RedactionEvent`, `Symptom`, `MedChange`,
  `Allergy`, `SubstanceEntry`) are likely to expand. Each expansion is a
  schema bump, not a silent edit.

### Risks

- **Mismatch between `sir.ts` and `sir.schema.json`:** mitigated by file
  headers explicitly cross-referencing each other and by the (future) test
  that round-trips an example SIR through both. Until that test lands, code
  review is the gate.
- **Premature lock:** if the extraction prompt forces a redesign of, say,
  `confidence` or `ambiguous_flags`, we'll pay for the v0.1.0 → v0.2.0
  migration. Mitigation: keep the migration story documented in the next
  ADR; the in-memory SIR state during a clinical session is not persisted
  across sessions in Phase 1 (blueprint §5.5), so the migration window is
  per-session, not per-clinician.

## Implementation notes

- Bumping the lock:
  1. Edit both `sir.ts` and `sir.schema.json`; bump the `schema_version`
     literal in both.
  2. Write a new ADR (e.g., `009-sir-schema-bump-0.2.0.md`) listing the
     changed fields and the migration story.
  3. Update `prompts/extract_sir.md` and re-run the QA harness fixtures.
  4. Update this ADR's status to `Superseded by 009`.
- The literal `0.1.0` appears as a `const` in the JSON Schema and a string
  literal type in the TS interface. Either grep find both; CI should
  eventually assert they match.
