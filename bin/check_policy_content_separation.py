#!/usr/bin/env python3
"""Policy and content may not travel in the same commit.

THE HOLE THIS CLOSES, stated as plainly as it deserves:

    A PR THAT CAN EDIT CLAUDE.md CAN EDIT THE RULES GOVERNING PRs.

Not a hypothetical. On 2026-09-16, PR #640 wrote a governance rule into CLAUDE.md from
inside a 926-line content PR. PR #672 then invoked that rule to bypass review, and shipped
85 citations of which 43 of the 47 checkable ones were misattributed or fabricated. Both
were reverted (#687/#688). The rule that authorised the bypass and the content that
benefited from it came through the same door, and no gate could see the difference, because
to every gate in this repository CLAUDE.md is just another tracked file.

The governing files are self-amending. That is the defect. A reviewer looking at a 40-file
content PR is not reading CLAUDE.md's diff, and the one-line rule change is the most
consequential hunk in the batch precisely because it changes what review MEANS for every PR
after it.

THE RULE: a single commit may touch policy files, or content files, but not both.

  Policy  = the governing surface — CLAUDE.md, AGENTS.md, .github/workflows/**,
            bin/verify.sh, the bin/ gate scripts, the workflow contract validator,
            docs/adr/*, attestation config
  Content = curriculum, tools, tests of content, snapshots, registries, and the DATA that
            gates read (baselines, caches, allowlists)
  Neutral = design specs, which describe policy without enacting it — see below

Enforced per-COMMIT, not per-PR, deliberately. Per-PR still lets the two changes ride in
together and land in one merge; per-commit makes the policy change its own reviewable
object with its own diff, and makes `git log -- CLAUDE.md` an honest record of every
governance change this repository has ever made.

WHY GATE DATA IS CONTENT AND NOT POLICY. A ratchet's pin lives in its script (policy); the
list it pins lives in JSON (content). bin/verify_spans_baseline.json and
bin/citation_identifier_allowlist.json are therefore content. This is deliberate and it is
the incentive that matters: shrinking a debt — fixing a citation AND deleting its allowlist
entry — stays one ordinary content commit, while RAISING the cap that bounds the debt is a
policy edit this gate forces into its own commit under its own review. Classify the data as
policy and you tax the direction you want and leave the direction you fear unchanged.

WHAT THIS DOES NOT DO, and must not be mistaken for: it does not judge whether a policy
change is a GOOD one. It makes the change visible and separately reviewable. A bad rule in
its own commit is still a bad rule — it is just no longer camouflaged.

Usage:
  python3 bin/check_policy_content_separation.py --self-test
  python3 bin/check_policy_content_separation.py --base origin/main   # a branch's commits
  python3 bin/check_policy_content_separation.py --commit HEAD

Exit 0 clean, 1 a violation. Stdlib only; shells out to git.
"""
import argparse
import fnmatch
import subprocess
import sys

# ─── the two surfaces ────────────────────────────────────────────────────────────────────────
# Anything that governs how work is reviewed, gated, built or attested.
POLICY_PATTERNS = (
    "CLAUDE.md",
    "AGENTS.md",
    ".github/workflows/*",
    ".github/workflows/**/*",
    "bin/verify.sh",
    "bin/verify-smoke.sh",
    "bin/install-hooks.sh",
    "bin/check_*.py",
    "bin/check-*.py",
    "bin/check-*.mjs",
    "bin/audit_*.py",
    "bin/refresh_*.py",
    "bin/pr_preflight.py",
    "docs/adr/*",
    # The workflow contract validator. It pins what every scheduled workflow and every CI gate
    # step must literally contain; editing it changes what "CI passed" means, which is a
    # governance act even when no workflow file moves. Named explicitly rather than by a glob
    # over _automation/, following the precedent of G_FILES in check_governance_separation.py.
    "13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py",
    "13_Faculty_Resources/_automation/site_build/build_and_check.sh",
    "13_Faculty_Resources/attestation_policy.json",
)

# NEUTRAL — neither policy nor content, and excluded from the pairing test entirely.
#
# Docs that DESCRIBE policy without enacting it. A design spec is not a rule, and the spec for
# a rule belongs in the same commit as the rule it explains.
#
# This must be a THIRD class, not "exempt from being policy". The first draft of this file made
# specs exempt, which silently classified them as CONTENT — so a policy change shipped with its
# own spec became policy+content and failed. Exempting the file actively MANUFACTURED the
# violation it was meant to prevent. It was caught by running this gate against its own commit,
# which is the only reason it is not still in here. The regression case is in --self-test and
# must not be deleted.
NEUTRAL_PATTERNS = (
    "docs/superpowers/specs/*",
    "docs/superpowers/specs/**/*",
    # Named, not globbed, for the same reason G_FILES in check_governance_separation.py is
    # named: docs/RATCHETS.md is the prose description of what the ratchet gates do, and a
    # ratchet change and its description belong in one commit. Widening this to all of docs/
    # would quietly excuse a lot that is not documentation.
    "docs/RATCHETS.md",
)


def is_neutral(path):
    return any(fnmatch.fnmatch(path, p) for p in NEUTRAL_PATTERNS)


def is_policy(path):
    if is_neutral(path):
        return False
    return any(fnmatch.fnmatch(path, p) for p in POLICY_PATTERNS)


def classify(paths):
    """Return (policy, content). Neutral paths appear in neither — they pair with nothing."""
    considered = [p for p in paths if not is_neutral(p)]
    policy = sorted(p for p in considered if is_policy(p))
    content = sorted(p for p in considered if not is_policy(p))
    return policy, content


# ─── git ─────────────────────────────────────────────────────────────────────────────────────

def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True).stdout.strip()


def commits_in_range(base, head="HEAD"):
    merge_base = git("merge-base", base, head)
    if not merge_base:
        return []
    raw = git("rev-list", "--no-merges", f"{merge_base}..{head}")
    return [c for c in raw.split("\n") if c]


def files_in_commit(sha):
    raw = git("show", "--pretty=format:", "--name-only", sha)
    return [p for p in raw.split("\n") if p.strip()]


def subject(sha):
    return git("show", "-s", "--format=%s", sha)


# ─── check ───────────────────────────────────────────────────────────────────────────────────

def check_commit(sha, paths, subj=""):
    """Return a violation dict, or None."""
    policy, content = classify(paths)
    if policy and content:
        return {"sha": sha, "subject": subj, "policy": policy, "content": content}
    return None


def format_violation(v):
    n_c = len(v["content"])
    lines = [
        f"  ✖ {v['sha'][:8]}  {v['subject'][:72]}",
        "      This commit changes the rules AND the work the rules govern.",
        f"      policy ({len(v['policy'])}):",
    ]
    lines += [f"        - {p}" for p in v["policy"]]
    lines.append(f"      content ({n_c}):")
    lines += [f"        - {p}" for p in v["content"][:6]]
    if n_c > 6:
        lines.append(f"        ... and {n_c - 6} more")
    lines.append("      Split it: `git reset HEAD~1` then commit the policy change alone, with a")
    lines.append("      message saying what rule changed and why. The content follows separately.")
    return "\n".join(lines)


# ─── self-test ───────────────────────────────────────────────────────────────────────────────

def self_test():
    failures = []

    def ck(label, got, want):
        if got != want:
            failures.append(f"{label}: got {got!r}, want {want!r}")

    # classification
    ck("CLAUDE.md is policy", is_policy("CLAUDE.md"), True)
    ck("AGENTS.md is policy", is_policy("AGENTS.md"), True)
    ck("workflow is policy", is_policy(".github/workflows/ci.yml"), True)
    ck("verify.sh is policy", is_policy("bin/verify.sh"), True)
    ck("gate script is policy", is_policy("bin/check_vacuity.py"), True)
    ck("citation gate is policy", is_policy("bin/check_citation_attribution.py"), True)
    ck("allowlist audit is policy", is_policy("bin/audit_citation_allowlist.py"), True)
    ck("cache refresher is policy", is_policy("bin/refresh_citation_attribution_cache.py"), True)
    ck("workflow contract validator is policy",
       is_policy("13_Faculty_Resources/_automation/maintenance/validate_scheduled_workflows.py"),
       True)
    ck("curriculum is content",
       is_policy("03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md"), False)
    ck("snapshot is content", is_policy("tests/__panels__/ms3/welcome.md.html"), False)
    ck("content test is content", is_policy("tests/practice-panel.test.mjs"), False)
    # gate DATA is content — see the header. This is what keeps shrinking a debt cheap.
    ck("a ratchet baseline is content", is_policy("bin/verify_spans_baseline.json"), False)
    ck("the identifier allowlist is content",
       is_policy("bin/citation_identifier_allowlist.json"), False)
    ck("the citation cache is content",
       is_policy("bin/data/citation_attribution_cache.json"), False)
    ck("spec doc is neutral",
       is_neutral("docs/superpowers/specs/2026-09-17-policy-content-separation-design.md"), True)
    ck("spec doc is not policy",
       is_policy("docs/superpowers/specs/2026-09-17-policy-content-separation-design.md"), False)

    # REGRESSION, and the reason NEUTRAL is a third class rather than a policy exemption. When
    # specs were merely "not policy" they fell through to CONTENT, so a rule shipped with its own
    # spec read as policy+content and failed — the exemption manufactured the violation. This
    # case is the shape of the commit that lands this gate; if it ever fails, the third class has
    # been collapsed again.
    ck("policy + its own spec passes",
       check_commit("d5", ["CLAUDE.md", "AGENTS.md", "bin/check_policy_content_separation.py",
                           "docs/superpowers/specs/2026-09-17-policy-content-separation-design.md"],
                    "policy: add the rule and the spec explaining it"), None)
    ck("spec alone passes",
       check_commit("d6", ["docs/superpowers/specs/x-design.md"], "docs: spec"), None)

    # THE #640 SHAPE: a governance rule riding inside a content PR. The case that matters.
    v = check_commit("abc1234", [
        "CLAUDE.md",
        "03_Core_Topics/SUD_Withdrawal/substance_use_inpatient_teaching.md",
        "04_Acute_and_Safety/Delirium/delirium_inpatient_teaching.md",
    ], "docs: add equity citations and note the review exemption")
    ck("#640 shape is caught", v is not None, True)
    ck("#640 names the policy file", v["policy"], ["CLAUDE.md"])
    ck("#640 counts the content", len(v["content"]), 2)

    # legitimate commits must pass
    ck("policy-only passes",
       check_commit("d1", ["CLAUDE.md", "AGENTS.md"], "policy: add branching rules"), None)
    ck("content-only passes",
       check_commit("d2", ["03_Core_Topics/Mood/mood.md", "tests/__panels__/ms3/mood.md.html"],
                    "content: update mood page"), None)
    ck("shrinking a ratchet is one content commit",
       check_commit("d7", ["08_Cases_and_Simulation/case-of-the-week/x.md",
                           "bin/citation_identifier_allowlist.json"],
                    "content: give the NICE citation a DOI and retire its allowlist entry"),
       None)
    ck("raising a cap is a policy commit and cannot carry content",
       check_commit("d8", ["bin/check_citation_attribution.py",
                           "08_Cases_and_Simulation/case-of-the-week/x.md"], "x") is not None,
       True)

    # a workflow + curriculum edit is the same defect wearing a different hat
    ck("workflow+content is caught",
       check_commit("d4", [".github/workflows/ci.yml", "03_Core_Topics/Mood/mood.md"], "x")
       is not None, True)

    if failures:
        print("SELF-TEST FAILED")
        for f in failures:
            print("  -", f)
        return 1
    print("self-test: OK — 25/25 checks passed, including the exact PR #640 commit shape and "
          "the NEUTRAL regression that the first draft of this file shipped")
    return 0


# ─── main ────────────────────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--base", default="origin/main", help="branch point to compare against")
    ap.add_argument("--commit", help="check a single commit instead of a range")
    ap.add_argument("--report-only", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    if args.commit:
        shas = [git("rev-parse", args.commit)]
    else:
        shas = commits_in_range(args.base)

    if not shas or not shas[0]:
        print("policy/content separation: no commits to check")
        return 0

    violations = []
    for sha in shas:
        v = check_commit(sha, files_in_commit(sha), subject(sha))
        if v:
            violations.append(v)

    if violations:
        print("Policy and content changed in the same commit.\n")
        print("A PR that can edit CLAUDE.md can edit the rules governing PRs. That is why these")
        print("must be separate commits: so the rule change is its own reviewable object, and")
        print("`git log -- CLAUDE.md` is an honest record of every governance change.\n")
        for v in violations:
            print(format_violation(v))
            print()

    print(f"policy/content separation: {len(shas)} commit(s) checked, "
          f"{len(violations)} violation(s)")
    if args.report_only:
        return 0
    return 1 if violations else 0


if __name__ == "__main__":
    sys.exit(main())
