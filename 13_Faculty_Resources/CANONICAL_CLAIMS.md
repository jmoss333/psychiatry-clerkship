# Canonical clinical claims

## The problem this exists for

The library asserts the same clinical fact on many pages. When one copy is
corrected, the others keep the old version.

This is documented in our own record, twice.

`how_we_know_teaching.json` carries the Modini mis-attribution: a viewpoint paper
cited for a statistic it never reported, **"at four places in the library. The
worst of the four was a quiz answer, which is the version students actually
memorise."**

PR #483 is the same shape in the agitation material. The RSAF F001/F002
corrections landed in `topic_meta.json` and `rp-agitation.pack.json`, and missed
the MS3 twin pack, the preview snapshot, and — worst — the skill exemplar at
`.claude/skills/topic-meta-author/references/voice-and-exemplars.md`, which as
that PR puts it **"is hand-authored, so no regeneration would ever reach it, and
it is what an agent is told to imitate when writing the next one."** A stale
claim there does not just sit wrong; it seeds every topic written afterwards.

At 997 HTML pages this is structural, not carelessness. No amount of care makes
997 independently-maintained copies of a fact stay equal.

## What it changes

Maintenance is inverted. Instead of every page needing to stay right on its own,
a small set of faculty-attested statements is enforced across the pages that
assert them. Attestation becomes a **per-fact** cost rather than a per-page one —
which is the only thing on the roadmap that makes the review bottleneck
structurally smaller instead of moving work around.

## How this differs from claim anchors

`validate_claim_anchors.py` already binds a claim to the source that backs it —
`[^source-id]` — and exists because of three mis-attributions where a number sat
beside correctly-sourced numbers, visually indistinguishable.

That is **provenance**, asked once per instance: *is this claim sourced, and does
the source say it?*

This registry asks a different question: **consistency**, across instances —
*do all the pages asserting this fact say the same thing?*

The Modini case needs both. An anchor catches that the citation does not support
the statistic. Only a canonical claim catches that fixing one of the four copies
leaves three wrong. Neither subsumes the other, and `evidence[].sourceId` here
uses the same source ids as the evidence registry, so an attested claim can carry
its anchor.

## Files

| File | Role |
|---|---|
| `canonical_claims.json` | The registry — one slot per fact |
| `canonical_claims.schema.json` | Shape; vocabulary mirrors `reviewed.schema.json` |
| `bin/validate_canonical_claims.py` | Enforcement; runs in `bin/verify.sh` |

## Filling a slot

The registry ships seeded with 30 `pending` slots and **no statements**. The
canonical statement is a faculty assertion — it was deliberately left unwritten.

To attest one:

1. **Write `statement`.** One sentence, learner-facing, the version you want
   every page to agree with.
2. **List `appliesTo`.** Every page that asserts this fact. Record each page's
   `contentHashAtReview` (`shasum -a 256 <path>`).
3. **Add `evidence`.** At least one `{sourceId, tier}`, ideally with a
   `sourceSpan`, tying to the Landmark Library.
4. **Add `guards`** where a phrasing is known-wrong. `forbidden` patterns are how
   a fixed error becomes permanent — once caught, it cannot come back silently.
   If the error is already in `how_we_know_teaching.json`, set
   `supersedesCorrection` to that correction's id.
5. Set `status: "reviewed"`, `by: "Joshua Moss, MD"`, and `at` to today.

## What the validator can and cannot check

Two mechanisms, because a machine can check one kind of drift and not the other:

- **`guards`** — regex. Mechanical and exact. Catches known-wrong phrasings.
- **`appliesTo`** — content hashes. A page whose hash no longer matches the one
  recorded at attestation is reported as `DRIFT` and needs a human re-read.

Semantic agreement is *not* machine-checkable. Turning it into change detection
is the honest approximation: the validator does not claim a page still agrees, it
claims the page has not changed since a human said it agreed.

`DRIFT` is a notice and exits 0. Broken references, failed guards, and a
`reviewed` claim governing no pages are failures and exit 1. A `pending` slot with
no `appliesTo` and no `guards` is inert by design, so the registry ships green and
begins enforcing only as slots are filled.

## Why these 31

Chosen for being high-consequence **and** asserted in more than one place — the
intersection is what matters, since a fact stated once cannot drift. Spread:
23 high / 8 moderate risk; 28 clinical, 2 legal, 1 formulary.

Thirty were seeded from clinical judgement about what a clerkship library
repeats. The thirty-first, `antipsychotics-in-suspected-catatonia`, was found by
looking: `topic_meta.json` asserts it three times in three phrasings
(`agitation.md`, `catatonia.md`, `toxidromes.md`), the skill exemplar carries a
fourth, and both agitation packs carry a fifth and sixth. It is the only slot
that ships with a populated `appliesTo`, because the copies were verified rather
than assumed.

**Start here, not with a slot chosen by intuition.** `catatonia-lorazepam-challenge`
looks like the obvious first fill and is not: a search of the library found it
asserted substantively on exactly one page. A fact stated once cannot drift,
which by this registry's own selection rule makes it a poor first demonstration.

Numeric and threshold claims are over-represented on purpose. They are quizzed,
memorised, and re-typed rather than referenced, which is exactly the population
that drifts and the population where drift is most harmful.

## Which slot to fill next: `bin/claim_exposure.py`

The registry enforces claims someone has already identified. It is blind in the
other direction — a claim asserted in nine places that nobody has slotted is the
RSAF-F001 shape exactly, and the registry cannot see it because the registry only
knows what it was told.

`bin/claim_exposure.py` runs that inverse query. It harvests the hand-authored
clinical assertions from `topic_meta.json`, `question_bank.json` and the three
packs, groups them by the rare concept co-occurrence they share, and sorts by how
many **owners** (topic pages, bank items, trainer scenarios) carry each one.

```
python3 bin/claim_exposure.py                 # ranked, PARTIAL first
python3 bin/claim_exposure.py --detail        # with the text of each locus
python3 bin/claim_exposure.py --known-answer  # validate against RSAF-F001
```

Three buckets:

| bucket | meaning | trust |
|---|---|---|
| `PARTIAL` | some copies sit inside a `scope` pointer and some do not — the registry knows this claim and is missing copies | high; checkable against a defined claim |
| `ORPHAN` | no copy is governed | a browsing order, not a defect list |
| `COVERED` | every copy is governed | — |

**Read PARTIAL first.** It is the case where the gate is green and the drift is
live, and it is precise because the claim is already defined. ORPHAN ranks
co-occurrences, and a co-occurrence that is strong, clinical and repeated can
still be a topic rather than a claim: "delirium + withdrawal" names an area of
the library, not one sentence that could drift.

It is **not a gate** and is not wired into `verify.sh`. A heuristic must not
block a push, and every group needs a human read before it becomes a slot.

### Why it is validated against a known answer

The first two versions of the grouping were wrong in ways that looked right.
Clustering on rare single tokens — the `check_qbank_coherence.py` signature —
reported 132 confident clusters while being unable to find the one case with a
known answer, because at library scale "catatonia" and "antipsychotic" are common
words and got filtered out as ordinary vocabulary. Switching to co-occurrence and
then clustering transitively chained seven of the eight known loci together with
sixty unrelated ones.

`--known-answer` requires the eight loci that RSAF-F001 and PR #483 found
drifting — the ones faculty then attested as one claim — to land in one group.
Run it first after changing any threshold in that file: a heuristic that cannot
find the defect it was built for should not be believed about anything else.
