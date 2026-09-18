# automation-captures/

Dated, verbatim captures of what an automation can actually **reach** — its connector
list, its tool inventory, its device binding, the exact line a creation call returned.

These exist for the same reason `rights-captures/` does. A permission sentence on a web
page can change without notice, so we capture it with a date. An automation is worse: it
never announces that it lost a capability, and a task created without the connector it
needs looks identical, forever, to one that works.

`research_returns.json` findings may carry a `followUp` block naming a mechanism and the
capabilities it `requires`. `bin/research-dock.py` verifies that **every** required
capability literally appears in the capture named by `evidence`. A capture that does not
name what the automation needs fails the gate — the follow-up is asserted, not proven.

Rules:

- One file per mechanism per verification date. Never edit an old capture; add a new one.
- Paste the tool or platform output **verbatim**, including the lines that report failure.
  The failure lines are usually the load-bearing ones.
- Name the file `<mechanism>-<what>-<YYYY-MM-DD>.txt`.
- Say plainly what the capture does NOT show. An absent capability is a finding.
