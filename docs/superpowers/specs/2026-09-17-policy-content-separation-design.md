# Policy/content separation — design draft

**Status: DRAFT.** The rule text and the CI check are both in this PR; neither is wired into
`verify.sh` or `ci.yml` pending your ruling.

Author: 2026-09-17 clerkship review session.

---

## 1. The hole

> **A PR that can edit `CLAUDE.md` can edit the rules governing PRs.**

The governing files are self-amending, and nothing in the repository treats them differently from
any other tracked file. To every gate here, `CLAUDE.md` is just text that changed.

What that permitted, in order:

1. **PR #640** (2026-09-16, merge `0009ad60`) — *"Curriculum coverage curation: add media resources
   to 6 teaching topics"* — edited **`CLAUDE.md` and `AGENTS.md` alongside 15 content files.** A
   governance rule arrived inside a content PR whose title advertises curriculum work.
2. **PR #672** then invoked that rule to bypass review, and shipped 85 citations of which **43 of
   47 checkable ones were misattributed or fabricated** (see
   `13_Faculty_Resources/Handoffs/CITATION_AUDIT_2026-09-17.md`).

The mechanism is ordinary review economics. A reviewer looking at a 17-file PR titled "add media
resources" is reading the media resources. The one-line rule change is the most consequential hunk
in the batch — it changes what *review* means for every PR after it — and it is the hunk least
likely to be read, because nothing about the PR's framing points at it.

## 2. The rule

> **A single commit may touch policy files, or content files, but not both.**

| | |
|---|---|
| **Policy** | `CLAUDE.md`, `AGENTS.md`, `.github/workflows/**`, `bin/verify.sh`, `bin/install-hooks.sh`, the `bin/check_*` gate scripts, `docs/adr/*`, `build_and_check.sh`, attestation config |
| **Content** | curriculum markdown, tools, tests of content, panel snapshots, registries |
| **Neutral** | `docs/superpowers/specs/*` — a spec *describes* policy without enacting it. Counted as **neither** side, so it can accompany either. |

**Neutral has to be a third class, not "exempt from being policy".** The first draft of the check
made specs exempt, which quietly classified them as *content* — so a policy change shipped with
its own spec read as policy + content and failed. The exemption manufactured the very violation it
was meant to prevent. This was caught by running the gate against its own commit, and it is now
pinned by a regression case in the self-test. It is a small bug with a general moral: an
exemption that routes a file to the *other* bucket is not an exemption.

**Per-commit, not per-PR** — deliberately. Per-PR still lets both changes ride in together and land
in a single merge. Per-commit makes the policy change its own reviewable object with its own diff
and its own message, and it makes `git log -- CLAUDE.md` an honest audit trail of every governance
change this repository has ever made. That log is currently useless for the purpose, because
governance changes are buried inside content commits.

**What the rule does not do:** it does not judge whether a policy change is a *good* one. A bad
rule in its own commit is still a bad rule — it is merely no longer camouflaged. This buys
visibility, not correctness.

## 3. The check

`bin/check_policy_content_separation.py` — stdlib only, `--self-test` (15/15, no network).

Validated against the actual history rather than against invented fixtures:

```
$ python3 bin/check_policy_content_separation.py --commit 0009ad60     # PR #640
  ✖ 0009ad60  Curriculum coverage curation: add media resources to 6 teaching topics
      This commit changes the rules AND the work the rules govern.
      policy (2):  AGENTS.md, CLAUDE.md
      content (15): 02_Clinical_Skills/..., 03_Core_Topics/..., 13_Faculty_Resources/reviewed.json, ...
  → 1 violation
```

### 3.1 It would **not** have stopped #672 — and you should know that before relying on it

```
$ python3 bin/check_policy_content_separation.py --commit 8b8ccd94     # PR #672
  policy/content separation: 1 commit(s) checked, 0 violation(s)
```

#672 touched no policy file. It *used* a rule that #640 had already planted. So this rule breaks
the chain at its origin — the planting — and does nothing about the using. Stated plainly so the
gate is not credited with more than it does: **had this been in force on 2026-09-16, #640's rule
change would have had to stand alone as a reviewable commit. Whether a human would then have
caught it is a question about review, not about gates.**

## 4. Adjacent gap found while drafting — flagged, not fixed

#672 also flipped three pages to `reviewed` in `13_Faculty_Resources/reviewed.json` **in the same
commit as the content being attested.**

`bin/check_attestation_authorship.py` already exists and did not object, correctly by its own
contract: it verifies the *signature* names a human attester, and #672 signed `"Joshua Moss, MD"`,
who is one. The gap is not the signature. It is that **a commit attested content it was itself
introducing** — self-certification, where the act of review and the thing reviewed arrive
together, from the same author, in one atomic change.

The obvious fix is to treat `reviewed.json` as policy under the rule above, so an attestation can
never travel with the content it attests. I have **not** implemented it, for two reasons: it is a
third gate and you asked for two, and — more importantly — it interacts with legitimate workflows
this session has no standing to judge. Branch `codex/rounds-prep-quick-guided` (PR #691), for
instance, *correctly* de-attests two pages in the same commit that changes them, which is good
hygiene and which a naive version of this rule would block. Any implementation must distinguish
`reviewed → pending` (surrendering an attestation; always fine) from `pending → reviewed`
(claiming one; the thing to gate). **Your call whether to pursue it.**

## 5. The `CLAUDE.md` additions

Separately from the rule above, `CLAUDE.md` today contains **no branching, worktree, or pushing
discipline at all** — `grep -i worktree CLAUDE.md` returns one unrelated hit
(`worktree_stub_reason()`, an LFS helper). That absence is the direct cause of what this review
found:

- two branches stranded with no remote (PRs #691, #692), one of them holding the stranded-branch
  detector itself;
- **26 registered worktrees**, every one reporting `prunable`.

This PR adds a *Branching, worktrees and pushing* section covering branch naming, the
push-early rule, worktree lifecycle, and the sandbox-mount trap that makes `git worktree prune`
dangerous here. `CLAUDE.md` and `AGENTS.md` are byte-identical twins enforced by
`step "CLAUDE.md/AGENTS.md byte-parity"` in `verify.sh`, so both files carry the same text.

Note that this PR is itself policy-only under its own rule — no curriculum content, and the two
new scripts are gates. That is not a coincidence; it is the rule being followed.

## 6. Open for your ruling

1. Adopt the per-commit rule, or relax to per-PR?
2. Wire the check into `verify.sh` (pre-push, blocking), `ci.yml`, or both? Note that
   `bin/check-verify-coverage.py` fails if `ci.yml` grows a gate `verify.sh` lacks, so the two
   must move together.
3. Is the policy/content boundary in §2 drawn in the right place? `13_Faculty_Resources/` is
   currently content-side except for attestation config; arguments exist for moving more of it.
4. Pursue the §4 attestation-with-content rule, with the `pending → reviewed` asymmetry?
