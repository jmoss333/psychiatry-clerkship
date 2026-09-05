# Interview Room conversation benchmark

This developer-only benchmark asks whether the Interview Room's feedback follows
what happened in a synthetic conversation. It runs the actual offline patient
engine and the server's actual deterministic scoring functions. A separate set of
paired transcripts passes through the real evaluation handler with a capturing
provider stub.

**The corpus is pending faculty review.** It contains three distinct kinds of
checks:

- **Existing-decision controls:** the recorded D12–D15 vocabulary decisions and
  current pack gate dependencies, exercised through conversations.
- **Proposed labels:** candidates for faculty adjudication. A disagreement is
  evidence for review, not an automatically established clinical defect.
- **Accepted limitations:** the third-person phrase explicitly accepted under
  D16. These remain visible without being counted as a new regression.

The benchmark itself does not change the learner application, pack, model, score,
attestation, or release state. It does not call an external provider. All dialogue
is synthetic and is unrelated to actual patients or learners.

The follow-up implementation corrects one unsupported claim in the application's
built-in strengths feedback and adds the local faculty exercise below. See the
[correction and calibration record](../../../docs/superpowers/plans/2026-09-04-interview-room-feedback-calibration.md).

## Run

From the repository root, with the existing proxy dependencies installed:

```bash
npm --prefix sp-proxy ci
node sp-proxy/benchmarks/interview-room/run.mjs
node sp-proxy/benchmarks/interview-room/run.mjs --json
node sp-proxy/benchmarks/interview-room/run.mjs --strict
node --test sp-proxy/tests/interview-benchmark.test.mjs
```

The default command writes Markdown to standard output; `--json` provides the full
turn-by-turn evidence, including setup exchanges, patient replies, client/server
coverage, gates, rapport, rubric, and narrative. Redirect output to a chosen file
to save a snapshot. There is no background collection or learner-data ingestion.

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Benchmark completed; existing-decision controls and client/server parity hold. **Proposed-label differences may still be present.** |
| 1 | Invalid fixture, incomplete execution, parity failure, or existing-decision control failure. |
| 2 | With `--strict`, execution completed but at least one proposed label differs. This is a review signal, not clinical policy. |

The infrastructure tests enter the existing `sp-proxy/tests/*.test.mjs` suite. They
check real execution, existing controls, rejected malformed fixtures, deliberate
wrong-expectation detection, historical-regression mutations, command-line exit
signals, and paired-transcript transport. Pending clinical
labels do not become build-blocking policy.

## What it measures

`corpus.json` includes 23 scenario definitions expanded into 49 persona runs. It
covers plain questions, vague wording, reflections, assertions, quotations,
third-person targets, leading wording, unfamiliar paraphrases, recovery,
deflection, reassurance, compound questions, sequencing, and context changes.

Each scenario creates a new `MockProvider` session. Every student turn is also
replayed through `sp.mjs`'s `deriveState`, and both real coverage functions are
compared after every turn. No replica scoring algorithm is used.

Three patient-response pairs compare an answer with a refusal, deflection, or
interruption. Only the final patient reply changes within each pair. The actual
evaluation handler builds the outbound transcript and coverage map; an injected
provider captures that request and returns deliberately uninformative transport
stub output. **The stub's output is not evaluated or presented as model behavior.**

The governance clock is pinned by `governanceAsOf` in the corpus to make the run
reproducible. It is a retrospective source benchmark, not evidence that the pack
is presently eligible for release. Raw source hashes and hashes of the evaluated
pack/corpus objects identify the inputs.

## How to use the findings

Read the [faculty decision packet](../../../docs/superpowers/plans/2026-09-04-interview-room-benchmark-findings.md)
and the [measured report](baseline-2026-09-04.md). The JSON output is available by
rerunning the command above.

Do not interpret the original baseline's 23 differing proposed checks as 23 independent bugs or a clinical
error rate. The cases were deliberately chosen to challenge known boundaries, and
several repeat the same issue across personas. Agreement between client and server
means they implement the same rule, not that the rule is clinically sound.

Before any subsequent vocabulary or feedback change:

1. Reproduce the relevant row on the intended source revision.
2. Review the complete exchange, the existing faculty decision, and the proposed
   interpretation. Preserve uncertainty where labels are debatable.
3. Record any new faculty decision separately. Do not turn this corpus's
   `pending-faculty-review` status into an attestation of the patient pack.
4. Make the smallest justified change and run both the existing suites and the
   benchmark. Model/pack/deployment changes still require the established release
   and red-team process.

D16 deliberately retains the closed vocabulary. This benchmark does not authorize
a semantic classifier or override its named reopening conditions.

## Faculty calibration exercise

Open [calibration.html](calibration.html) directly in a browser. It is a standalone,
offline worksheet with five pairs of synthetic conversations. Read the shared
context, make observations for conversations A and B, and then reveal the current
simulator labels. The three response-alternative pairs show actual evaluator-input
captures; they do not claim to show a live evaluator's interpretation.

The controls retain choices only while the page is open. Reset or reload clears
them; printing is optional. There is no submission, storage, network call, score,
faculty approval action, or connection to learner records. The worksheet is a
developer/faculty artifact and is not registered in learner navigation.

The page is generated from the current benchmark. Do not hand-edit it:

```bash
node sp-proxy/benchmarks/interview-room/calibration.mjs --write
node sp-proxy/benchmarks/interview-room/calibration.mjs --check
node --test sp-proxy/tests/interview-calibration.test.mjs
```

The generator includes actual source hashes rather than HEAD or wall-clock time,
so committing an otherwise unchanged artifact does not make it stale. Missing
evidence, control failures, or parity failures stop generation. The proxy test
suite checks artifact freshness and safe rendering.
