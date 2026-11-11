# Gate template (F1 gate rule, adopted 2026-11-10)

Every gate — a CI job, workflow, check script, hook, validator, or test whose name says
gate / guard / check / verify / required — gets one entry in this format, and the same
"real property" sentence goes in the gate file's own header. The rule itself (G-1…G-7) is in
the agent instructions (`AGENTS.md` / `CLAUDE.md`, section "Gate rule (F1, adopted 2026-11-10)").

A gate without a real property **and** a known-miss fixture that fails it is a **report**, not
a gate: name it "report"/"advisory" and never cite its green as evidence of the property.

## Template (copy one block per gate)

```yaml
- gate: <workflow file + job name, or script path>
  real_property: >-
    <ONE sentence, phrased as a claim about the world, e.g. "No withdrawn crisis number is
    callable from any cached page." Then: inputs = <what the predicate reads>.>
  known_miss_fixture: <path to the fixture/mutation, plus the miss it reproduces (report id or
    PR/incident), e.g. tests/fixtures/known_misses/D5-crisis-line-in-aftercare.json>
  # optional but recommended:
  required: <true|false>   # must match the ruleset; "required" in a name/doc needs true
  proxy: <none | "count/label/substring/db-key — why identity is unavailable; expires YYYY-MM-DD">
```

Field rules:

1. **gate** — exactly where it runs, so a reader can find it.
2. **real_property** — the property the green is *read as*, not the predicate it computes.
   "Protected-records check passes" is a name; "no record on the protected list changed any
   field without a guarded-writer approval" is a property.
3. **known_miss_fixture** — a concrete input built from a real past miss (or, for a new gate,
   the specific failure it exists to stop) on which the gate **must fail**. CI runs it
   expecting red, or the PR that adds the gate shows the red run. If the gate passes its own
   known-miss fixture, the gate is broken.

## Entries

<!-- Add one block per gate below. Leave this list empty rather than add an entry without a
     fixture; an entry with `known_miss_fixture: TODO` is a report, not a gate. -->
