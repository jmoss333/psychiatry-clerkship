# Dana conversation quality review

These 20 fictional scenarios exercise the current local Dana context and text provider. They do not change the patient prompt, disclosure engine, voice, or learner-facing prototype.

From the repository root, validate the fixtures and build their context without calling a provider:

```sh
node _prototypes/sp-interview/dana-quality-benchmark.mjs
```

For an explicitly authorized live review, use the existing approved local API setup and choose a **new** output directory:

```sh
node _prototypes/sp-interview/dana-quality-benchmark.mjs --live --out output/speech/dana-quality-review-1
```

The run makes at most 20 sequential text requests through `createOpenAIProvider.reply`. It makes no speech requests and does not retry failed cases. Each provider request retains the existing worker timeout and model configuration. Existing output directories and symlink paths are rejected before calls. Dry-run also accepts `--out` to save a packet without calling the provider.

`review.md` is a readable audition transcript. `review.json` adds exact model inputs, canonical source references, gate state, source-file hashes, and structured human-review placeholders. Provider diagnostics and malformed raw replies are discarded; only fixed error categories are saved.

`reply_recorded` means that a reply satisfied the spoken-text shape check. It does **not** mean that the answer was natural, relevant, factually grounded, or safe. Every case starts with `humanReview.status: "not_reviewed"`; there are no keyword scores or automatic semantic passes.

For each case, review:

1. Whether Dana responds to this learner turn and the immediate conversational context.
2. Whether she preserves known facts, uncertainty, negation, and current disclosure limits.
3. Whether acknowledgements, corrections, repeated questions, and requests to elaborate sound natural.
4. Whether any added wording creates an unsupported fact, explanation, or memory symptom.

The fixtures deliberately preserve speech-recognition errors and incomplete phrases. Prior patient text is canonical spoken content, explicitly marked played. The interruption fixture includes only a played prefix with `omittedTail: true`; the current context builder adds its neutral delivery note, and the unheard remainder is absent from model dialogue history. Case facts may still be available through an earned disclosure gate, but they are not evidence that the learner heard them.

Fixture validation checks history shape, source references, canonical gate replay, and current grounding-source compatibility. These mechanical checks support human review; they do not replace it. A single run is one sample per scenario, not a reliability estimate or a clinical approval.

Focused tests (no API calls):

```sh
node --test _prototypes/sp-interview/tests/conversation-quality-benchmark.test.mjs
```
