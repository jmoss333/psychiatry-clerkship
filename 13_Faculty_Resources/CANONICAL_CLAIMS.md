# Canonical clinical claims

## The problem this exists for

The library asserts the same clinical fact on many pages. When one copy is
corrected, the others keep the old version.

This is documented in our own record. `how_we_know_teaching.json` carries the
Modini mis-attribution: a viewpoint paper cited for a statistic it never
reported, **"at four places in the library. The worst of the four was a quiz
answer, which is the version students actually memorise."** PR #483 is the same
shape — catatonia corrections that missed copies.

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

## Why these 30

Chosen for being high-consequence **and** asserted in more than one place — the
intersection is what matters, since a fact stated once cannot drift. Spread:
22 high / 8 moderate risk; 27 clinical, 2 legal, 1 formulary.

Numeric and threshold claims are over-represented on purpose. They are quizzed,
memorised, and re-typed rather than referenced, which is exactly the population
that drifts and the population where drift is most harmful.
