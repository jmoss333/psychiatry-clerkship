# ADR-003 — The attestation ledger: sign-offs that never need a merge

**Status:** Phase 1 built and dark-launched (this PR). It changes nothing until activated.
**Date:** 2026-09-25 · **Owner:** Joshua Moss, MD · **Supersedes:** the rolling `attest/pending` PR as the route by which a sign-off reaches learners.

## 1. The problem, stated structurally

Until now a faculty sign-off was a **git promotion**. The console committed it to `attest/pending`, a rolling PR carried it, and it reached learners only when that PR passed CI and merged into `main`. Every failure on 2026-09-24/25 (rolling PR #781) came from that single fact:

| Symptom | Structural cause |
|---|---|
| The CI guard flagged 20+ content files the PR never touched | The rolling branch falls behind `main` whenever anyone merges anything |
| 9 sign-offs were bound to text that no longer shipped | The console hashed the page on the **branch**, while `main` moved underneath it |
| The 39 question sign-offs tripped L3 against themselves | A promotion is a diff, so every rule about diffs applies to it |
| Two node tests went red because faculty did their job | Governance state lived in the tree the tests read |
| The PR sat BLOCKED with auto-merge armed as squash | Getting a sign-off to learners depended on a merge method |

A sign-off is a **statement by a person about a text**. It is not a code change, and routing it through the code-change pipeline gives it every property of a code change: it goes stale, it can conflict, it has to merge, and it can be blocked by an unrelated test.

## 2. Decision

A sign-off becomes a **signed event appended to a ledger that is never merged**. The learner sites read that ledger at build time and rebuild on their own about 10 minutes after the last sign-off.

```
 faculty console ──sign──▶ attestations branch: ledger/events.jsonl   (append-only, never merged)
      │ (hash the page as it is on main)                 │
      │                                                  ▼
      └──── ~10 min quiet ──▶ build hooks ──▶ learner-site build: overlay events onto
                                                 reviewed.json / topic_meta / question_bank
                                                 BEFORE any validator runs ──▶ learners
```

* **Where it lives:** `ledger/events.jsonl` on an orphan branch called `attestations` in this repository. It has no shared history with `main`, is never merged, and has no PR. Pushes to it trigger nothing: CI runs on pushes to `main` only, and all five Netlify sites build `main` only (`allowed_branches: ["main"]`, verified 2026-09-25).
* **What an event is:** one JSON line holding a sequence number, the SHA-256 of the previous line, the action, the item, the attester, the content fingerprint, and an **Ed25519 signature**. The private key exists only in the console's production environment, as a write-only Netlify secret. The public key is committed on `main` in `13_Faculty_Resources/ledger/keys.json`, which is governance.
* **What the console does:** hashes each page **as it stands on `main`** (the text learners actually get, not a branch copy), signs, and appends. The action takes one GitHub API call and is live after the next publish.
* **What the build does:** `site_build/ledger_overlay.mjs` fetches the branch, verifies every signature and the whole hash chain, and projects the latest event for each item onto the working copies of `reviewed.json`, `topic_meta.json` and `question_bank.json`. It then lets every existing validator, projection and test run unchanged. Drift still works exactly as before: a signed fingerprint that no longer matches the text renders as pending.
* **How it gets published:** a Netlify scheduled function on the console site runs every 10 minutes. It compares the ledger head with the `ledger-receipt.json` each learner site serves, and fires that site's build hook once the ledger has been quiet for 10 minutes. The console also has a **Publish now** action.

`reviewed.json` on `main` does not go away. It remains the **registration** record: which pages exist, each page's risk class, and every review made before the ledger. It is the baseline the ledger overlays. Content PRs keep registering and demoting there exactly as now.

## 3. Invariants — what must stay true, and what enforces it

| # | Invariant | Enforced by | Pinned by |
|---|---|---|---|
| L-1 | Only the console can create a valid sign-off | Ed25519 signature. The key is in the console's **production** context only (not deploy previews, where PR code runs) and is marked secret (write-only: UI, CLI and API never return it) | `ledger.test.mjs`: forged, altered and wrong-key events are rejected |
| L-2 | The ledger is append-only | Every line carries `prev = sha256(previous line)` and `seq = previous + 1`, verified in full on every build. A ruleset on `attestations` blocks force-push and deletion | chain tests: reorder, delete, insert, edit, truncate-then-append |
| L-3 | A tampered ledger never ships | Any bad signature, broken link, unknown key or malformed line **fails the build**, and the last good deploy stays live. This is the same posture as a hand-edited `reviewed.json` | overlay CLI test: exits 1 on a tampered fixture |
| L-4 | An unreachable ledger can only *under*-claim | Fetch failure means baseline only, a loud warning, and `status: "baseline-only"` in the receipt. A page can then show pending when it is really signed, never the reverse | overlay test: unreachable leads to baseline, exit 0 |
| L-5 | A sign-off binds to the text learners get | The console hashes against `main`. The build re-derives the fingerprint from the text actually built, so a mismatch renders pending with the existing stale reason | overlay + existing projection tests |
| L-6 | No agent can sign | Needs the faculty password *and* the console's signing key. An agent that pushes a line to the branch without the key produces L-3, a red build and no ship | L-1/L-3 tests; the `bin/ledger.mjs verify` CLI |
| L-7 | Question sign-offs bind to question text | `itemHash = sha256(canonical item minus status)`. An edited question does not inherit the old signature | overlay tests |
| L-8 | The overlay changes only governance fields | Rows are rebuilt from the baseline with only `status/at/by/contentHash/reason` touched. `topic_meta` changes only `facultyReview`. Question items change only `status` | overlay tests; `reviewed.schema.json` still validates the result |

## 4. Event format (v1)

```json
{"v":1,"seq":12,"prev":"<64 hex>","ts":"2026-09-26T14:03:11.000Z","type":"attest","kind":"content",
 "id":"t_mood.md","by":"Joshua Moss, MD","contentHash":"<40 hex>","base":"<main commit sha>",
 "keyId":"<16 hex>","sig":"<base64 Ed25519 over the canonical JSON of every other field>"}
```

* `type`: `attest` or `reopen`. A reopen carries `reason` (at most 240 characters) and no hash.
* `kind`: `content` (pages and tools, id = slug) or `question` (id = question id; carries `itemHash`, a 64-hex SHA-256).
* Canonical JSON means keys sorted at every level, no whitespace, UTF-8. Each stored line *is* the canonical JSON of the whole event including `sig`, so `prev` is the SHA-256 of that exact line. The first event has `prev` = 64 zeros and `seq` = 1.
* The latest event per `(kind, id)` wins. Ledger events override the baseline for the same item, because the ledger is the newer system of record.

## 5. Failure modes

| What breaks | What learners see | What faculty see | Recovery |
|---|---|---|---|
| GitHub unreachable at build | Baseline only (ledger sign-offs look pending) | Receipt `baseline-only` | Next publish tick; "Publish now" |
| Tampered or corrupt ledger | Last good deploy (the build fails) | Deploy-failed email and the build log naming the line | Investigate; `CLERKSHIP_LEDGER=off` ships baseline-only in an emergency |
| Console down | Nothing changes | Cannot sign | The sites keep serving; nothing is lost |
| Build hook fails | Last deploy | Console shows "not yet published" | Retry windows at +60 min and +24 h; "Publish now" |
| Content PR changes a signed page | Pending (drift) | "Content changed since faculty review" | Re-sign in the console. No merge needed |
| Signing key leaked | Forgeries possible until rotation | — | Rotate: add a new key to `keys.json`, mark the old `revokedAt`, re-sign |

## 6. What this does NOT solve (honest limits)

* **Content still needs PRs.** Editing a page or a question is a code change and keeps its review pipeline. Only the *sign-off* leaves git.
* **In ledger mode the console cannot edit question drafts (v1).** It signs; wording changes arrive through a content PR. This is Phase 3 work: a draft edit could open its own small auto-merging content PR.
* **Local report tools read the baseline** (`what_needs_josh.py`, `check_attestation_hashes.py`, the weekly digest). Until Phase 3 they will over-report pending for ledger-signed pages. `node bin/ledger.mjs materialize` prints the true combined view.
* **GitHub is on the build's critical path** for freshness, not for correctness: see L-4.
* **The GitHub token in the console can write to the branch.** It still cannot sign, and the build rejects what it cannot verify. The one edit that verification cannot see is a commit that deletes lines off the *end*, because what remains is still a valid chain. That can only *under*-claim (sign-offs vanish; nothing false appears). The branch ruleset forbids force-pushes, so such a commit stays in history, and `node bin/ledger.mjs audit` fails on it. Phase 3 puts `audit` in the nightly canary.
* **Tools that carry their own review label in their source** (a CLERKSHIP-META `status`; today only The Interview Room and Interaction Cards, both `reviewed`) must keep that label equal to the ledger, because `validate_attestation_consistency.py` checks both directions. The label is part of the signed text, so it cannot follow a sign-off. The console therefore **refuses** a ledger change that would make them disagree: re-signing works, reopening is refused. The resident tools and the Post-Event Huddle already follow the one-way rule (the label may never claim *more* than the ledger; #799). **Whether to make these two tools one-way as well is an owner decision.** It is deliberately not taken here, because it touches the Interview Room's governance.
* **Changing the hash rule for `question_bank.json` (this PR).** The question bank is now hashed without any item's `status`, in both twins, pinned by the parity test. Otherwise every question sign-off would drift `question-bank-practice.html` and `shelf-mode.html`, and a build that overlays question sign-offs would drift them on every build. Those two pages were already drifted by #763, so the change costs no additional re-attestation.

## 7. Rollout

**Phase 1 — this PR (dark).** It adds the code, tests and docs. It changes nothing: every build path is gated on `CLERKSHIP_LEDGER=on`, and the console on `ATTEST_LEDGER=on`, both unset by default.

**Phase 2 — activation (about 10 minutes, Josh plus agent).** The runbook is `13_Faculty_Resources/ledger/ACTIVATION.md`:
1. Josh runs `node bin/ledger_keygen.mjs --install` once. It generates the key pair, stores the private half as a production-only Netlify secret without ever printing it, and writes the public half to `keys.json`. That public-key file lands through one ordinary PR.
2. Create the `attestations` orphan branch, plus a ruleset blocking force-push and deletion.
3. Set `CLERKSHIP_LEDGER=on` on both learner sites **first**. Their receipts then read `applied`, with 0 events.
4. Create the two build hooks, then set `ATTEST_LEDGER=on` and `LEDGER_BUILD_HOOKS` on the console and redeploy it.
5. Sign one page. Within about 10 minutes both receipts show `seq: 1` and the page badge turns reviewed. Acceptance: run `node bin/ledger.mjs verify` and it passes.

**Phase 3 — cleanup.** Retire `attest/pending` and its rolling PR, and make L2 forbid git promotions on every branch. Teach the report tools and the weekly digest to read the overlay. Add a nightly `bin/ledger.mjs verify` step to the production canary. Add question-draft edits via auto-PR.

## 8. Acceptance criteria (machine-checkable)

* `node --test tests/ledger*.test.mjs`: every invariant in §3 has at least one failing-if-broken test. Proven by breaking each guard and watching its test turn red.
* `bash bin/verify.sh`: ALL CHECKS PASSED, with the ledger off (default) and with a local fixture ledger on.
* Simulated end-to-end: fixture ledger → overlay → `build_and_check.sh ms3` passes, `governance.json` shows the signed page `reviewed`, and a tampered fixture fails the build.
* With both env vars unset, the `_build/` output is byte-identical to `main`'s.
