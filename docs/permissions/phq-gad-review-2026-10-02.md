# PHQ-9/GAD-7 correction — exact content and rights review packet

Prepared 2026-10-02 for Joshua Moss, MD. **Draft preparation and source verification only.**
Base: `77297674a512ac8a5750e241e33a9308641d5184`. No faculty/clinical attestation, final
rights disposition, merge, ready-for-review action or production release is claimed.

## Authorization and scope

Josh's 2026-10-02 01:25 UTC reply “1 yes 2 yes” to the 01:02 UTC two-part request
(message `Sentinel_09d227d1a1f88191b1338216eae96497`) approves preparing the PHQ/GAD
wording/audit correction for review. Its separate answer 1 concerns existing attestations;
it does not authorize new signatures here.

The support draft corrects the historical audit, the dated permission interpretation and
owner-queue copy. The dependent content draft changes only the screener and focused tests.
L1 forbids placing `bin/` or the rights registry in the same PR range as shipped content.
The content PR must target the support branch while stacked, then be rechecked against main
after support lands. Neither draft is an attestation or a route around L1.

`instrument_rights.json` is held for #932 coordination and remains unchanged in this draft.
AGENTS/CLAUDE remain unchanged at the parent's explicit instruction. Their stale COWS
paragraph is a separate policy-document correction, not a rule amended by this content fix.
Existing #932 route-verification and #915 policy-document work must be preserved.

## Official references and dated snapshots

Retrieved directly from the official host on 2026-10-02 using HTTPS; form pages and manual
page 8 were also rendered and visually inspected. Selector labels/URLs were read from the
live page's `ul_to_dropdownvfinal.js`. Adobe could not accept the public URL format, so local
Poppler extraction/rendering was used. Source PDFs and raw HTML/selector snapshots are
retained in the task's review directory, not mirrored into a learner-facing route.

| Source / selected version | Official URL | SHA-256 of downloaded original |
|---|---|---|
| Selector permission statement | [Official source](https://www.phqscreeners.com/select-screener) | `e553a443b530713b1fdcdc8446519f529b9f964e15d37edbd4974f946dc3cac4` |
| Selector version map | [Official source](https://www.phqscreeners.com/js/ul_to_dropdownvfinal.js) | `b393ac814d6ee4f05f1cbfe2159e30623435c8d3b71ccbe8283fd4d117acd7ff` |
| Official instructions (9 pages) | [Official source](https://www.phqscreeners.com/images/sites/g/files/g10016261/f/201412/instructions.pdf) | `6ed2f00f97e438c1168cd702d38d31fc923031445c720653005f138aa424228a` |
| PHQ-9 — “English” (proposed reference) | [Official source](https://www.phqscreeners.com/images/sites/g/files/g10060481/f/201412/PHQ-9_English.pdf) | `e3fb5b8853e3530c9025c822b99fd4f4bc17da49eefda5ed689c49238c132a46` |
| PHQ-9 — “English for US original” (comparison only) | [Official source](https://www.phqscreeners.com/images/sites/g/files/g10060481/f/201412/PHQ-9_AU1.0_English-US%20original.pdf) | `926d390a8f84dfc4aa4ef59a1e4924382656d58c54cdd91ac32b19641c24e9bb` |
| GAD-7 — “English for the USA” (proposed reference) | [Official source](https://www.phqscreeners.com/images/sites/g/files/g10060481/f/201412/GAD7_English%20for%20the%20USA_0.pdf) | `cf604ec707550465cd192171e75631c2288b4f2c303dcf61b989281cae1ac933` |

The selector states: “no permission is required to reproduce, translate, display or distribute
them.” The manual's page 8 states: “All of the measures included in Table 1 are in the public
domain.” Both proposed reference forms print the four-verb no-permission footer.

**Version discrepancy preserved:** the older PHQ-9 US-original file has a 2008 file stamp
and prints “Copyright © Pfizer Inc. All rights reserved.” The current “English” download
prints the explicit no-permission footer instead. Their nine stems, response options,
timeframe and difficulty question agree when line breaks/spacing are normalized; titles,
layout, office-coding blanks and footer differ. This packet selects the current “English”
PHQ-9 with the explicit permission footer, not the legacy footer. The site/manual's broader
current statements are recorded alongside the older notice; they are not a newly invented
grant or a claim of exclusive copyright ownership.

## Proposed rights disposition and historical correction

Retain the two scales and their official wording. Primary-source reproduction evidence is
verified; recommend recording clearance only after Josh explicitly resolves the governance
disposition. Preparation approval is not such a resolution. The registry currently stays
`provisional`; no `interimWaiver` exists. The public-domain statement and listed permissions
support reproduction. They do not justify claiming a categorical legal ban on every
modification. Faithful wording, options, order and timeframe are a conservative clinical
quality and governance choice; a modified scale would need its own validation/description.

COWS is already retired under the genuine 2026-09-10 `cows-anchors-retired` decision, which
supersedes `cows-interim-waiver`. The audit's old flagged/waiver statements describe prior
dates. No new COWS grant, waiver extension or clinical content change is made here.

## Complete wording comparison

PHQ-9 prompt: **Over the last 2 weeks, how often have you been bothered by any of the
following problems?** GAD-7 USA prompt: **Over the last 2 weeks, how often have you been
bothered by the following problems?** Both print **(Use “✔” to indicate your answer)**.
The old shared prompt omitted “problems” and PHQ's “any of”; the proposed per-scale prompts
restore both. Interactive selections show a check mark; the original paper instruction is
preserved without pretending this browser layout is the paper form.

| PHQ-9 item | Official wording after correction | Comparison with main |
|---|---|---|
| 1 | Little interest or pleasure in doing things | Exact wording already matches |
| 2 | Feeling down, depressed, or hopeless | Exact wording already matches |
| 3 | Trouble falling or staying asleep, or sleeping too much | Exact wording already matches |
| 4 | Feeling tired or having little energy | Exact wording already matches |
| 5 | Poor appetite or overeating | Exact wording already matches |
| 6 | Feeling bad about yourself — or that you are a failure or have let yourself or your family down | Exact wording already matches |
| 7 | Trouble concentrating on things, such as reading the newspaper or watching television | Restores “the newspaper” |
| 8 | Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual | Restores “other people”, the question/split, “Or the opposite”, “or restless”, and “have been moving” |
| 9 | Thoughts that you would be better off dead or of hurting yourself in some way | Removes extra comma after “dead” |

| GAD-7 item | Official USA wording after correction | Comparison with main |
|---|---|---|
| 1 | Feeling nervous, anxious or on edge | Removes comma after “anxious” |
| 2 | Not being able to stop or control worrying | Exact wording already matches |
| 3 | Worrying too much about different things | Exact wording already matches |
| 4 | Trouble relaxing | Exact wording already matches |
| 5 | Being so restless that it is hard to sit still | Exact wording already matches |
| 6 | Becoming easily annoyed or irritable | Exact wording already matches |
| 7 | Feeling afraid as if something awful might happen | Removes comma after “afraid” |

| Form element | Comparison and proposed behavior |
|---|---|
| Timeframe | Both retain the official last 2 weeks. |
| Response options / values | Both already match: Not at all = 0; Several days = 1; More than half the days = 2; Nearly every day = 3. All remain in the official order. |
| PHQ-9 difficulty | Restore “If you checked off any problems, how difficult have these problems made it for you to do your work, take care of things at home, or get along with other people?” with Not difficult at all / Somewhat difficult / Very difficult / Extremely difficult. Separate, optional and explicitly **not scored**; changing it never affects total, completion count or severity. |
| GAD-7 difficulty | None on the selected USA form, so none is added. |
| Totals / coding | The paper office-coding blanks are replaced by the existing live tally. Only 9 or 7 symptom answers contribute; maxima remain 27 / 21. The difficulty answer is never a tenth item. |
| Severity bands | Existing PHQ bands 0–4 / 5–9 / 10–14 / 15–19 / 20–27 and GAD bands 0–4 / 5–9 / 10–14 / 15–21 agree with the manual's cutpoints. They describe symptom severity; they do not establish diagnosis, suicide-risk clearance, fitness or readiness. |
| Attribution / permission | Restore the forms' full developer acknowledgment and no-permission notice, with Pfizer described as educational-grant supporter. Keep the official form route and add precise selected PDF/manual links. |
| Safety / educational notices | Preserve direct item-9 assessment escalation, clinical interview/team-protocol boundary, static crisis marker and no-PHI/no-storage promise. Correct the obsolete link label to the official C-SSRS form/training destination. A zero score or negative item 9 never establishes safety. |
| Interactive layout | Preserve existing cards, buttons, live score, reset and trainee context. Add check marks and pressed states for the official selection instruction. Neither the paper layout nor its blank office-coding lines is recreated as a clinical document. |

The manual, p2, distinguishes functional impairment from the numerical PHQ score and any
diagnostic calculation. Pages 3 and 6 confirm the two totals, scoring values and symptom
severity thresholds. The draft makes no new diagnosis or treatment recommendation.

## Clinical review and re-attestation

The screener's authored source changes, so its existing review hash will drift and effective
built governance must show pending review. The source ledger, topic-meta review fields and
`attest/pending` are untouched. Genuine faculty-console re-attestation remains necessary
for `screeners.html` after review/landing; source verification and tests cannot substitute
for it. This is separate from the parent's delivery of previously completed attestations.

Actual unresolved decisions: Josh's final recorded PHQ/GAD rights disposition, acceptance of
the selected exact versions and clinical review of the restored form/educational interface.
No rights-holder outreach is required by the verified reproduction statement; none was made.

## Verification and delivery

The final local handoff records tested branch SHAs, full gate logs, exact support/content
patches, browser evidence and draft PR URLs. Remote CI covers only the published exact heads;
local/source evidence alone must never be called remote CI or clinical attestation.
