#!/usr/bin/env python3
"""Shared checks for the Claude Code hooks (.claude/settings.json) and the pre-commit gate.

stdlib only, no network, sub-second. Every check mirrors a rule that already exists
somewhere slower in this repo (the build's static QA gate, CI's path lint, the crisis
data contract), so a hook never invents policy — it moves an existing gate to the moment
of the edit. Where a rule is a judgment call (PHI, instrument reproduction) the check
returns an ASK, never a DENY.

Findings are (severity, rule, message) tuples. severity is "deny" or "ask".
Messages never echo the matched text: a PHI hit is reported by pattern name only.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

MEDIA_EXTS = {".m4a", ".mp3", ".wav", ".mp4"}
LFS_POINTER_HEADER = b"version https://git-lfs"

# Numbered curriculum source dirs (content, not build output). 13_Faculty_Resources/_automation
# is tooling and is excluded from learner-surface rules.
CONTENT_DIR_RE = re.compile(r"^(0\d|1[0-4]|99)_[^/]+/")
TOOLING_PREFIX = "13_Faculty_Resources/_automation/"
SHELL_PREFIXES = (
    TOOLING_PREFIX + "site_build/frontdoor/",
    TOOLING_PREFIX + "site_build/spa_index.html",
    TOOLING_PREFIX + "site_build/question-bank-practice.html",
)
LEARNER_PREFIXES = ("tools/", "_prototypes/", "faculty-console/", "sp-proxy/")
TEST_DIR_RE = re.compile(r"(^|/)(tests?|fixtures|__tests__)/")

# Mirrors DOSE in site_build/check-static-site.mjs. The gate is HARD for rp-* and *-trainer
# tools and for *.pack.json; soft elsewhere, so the hook only denies on the hard set.
DOSE_RE = re.compile(r"\b\d+(?:\.\d+)?\s?(?:mg|mcg|mL|mg/kg)\b", re.I)
DOSE_HARD_RE = re.compile(r"(^|/)(rp-[^/]*\.html|[^/]*-trainer\.html|[^/]*\.pack\.json)$")

# Mirrors the key extraction in check-static-site.mjs. Sanctioned namespaces: cw_* (shared
# hub) and rp_* (resident platform).
STORAGE_KEY_RE = re.compile(r"localStorage\.(?:getItem|setItem|removeItem)\(\s*['\"]([^'\"]+)['\"]")
STORAGE_PREFIXES = ("cw_", "rp_")

# CI lints tracked *.py for machine paths. Assembled from pieces so this file passes the
# very lint it enforces.
MACHINE_PATH_RE = re.compile("/" + "(Users|sessions)" + "/[a-z]")

# Mirrors PHI_PATTERNS in site_build/phi_heuristic.js (kept byte-identical there by a test).
PHI_PATTERNS = (
    ("six-plus-digit-run", re.compile(r"\b\d{6,}\b")),
    ("slash-date", re.compile(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b")),
    ("mrn", re.compile(r"\bmrn\b", re.I)),
    ("my-patient", re.compile(r"\bmy patient\b", re.I)),
    ("date-of-birth", re.compile(r"\bdate of birth\b", re.I)),
    ("dob", re.compile(r"\bdob\b", re.I)),
)
# Bibliographic identifiers legitimately carry long digit runs; strip them before the PHI
# pass so a PMID in a citation is not mistaken for an MRN.
IDENTIFIER_CONTEXT_RE = re.compile(
    r"\b(?:PMID|PMCID|PMC|NCT|ISBN|ISSN|DOI|doi|https?://\S+|10\.\d{4,}/\S+)[\s:#-]*[\w./-]*",
)

# Instrument names whose item stems or anchor ladders must not be reproduced (CLAUDE.md:
# the library teaches administration; it does not reproduce instruments). The sentinel
# fires only when a name co-occurs with item-shaped text, and it ASKS rather than denies:
# scope is a governance decision recorded in the instrument audit, not an agent's call.
INSTRUMENT_NAME_RE = re.compile(
    r"\b(C-SSRS|Columbia[- ]Suicide|PHQ-9|PHQ-2|GAD-7|CIWA(?:-Ar)?|COWS|BFCRS|Bush[- ]Francis|"
    r"Stanley[- ]Brown|MoCA|MMSE|AIMS|AUDIT(?:-C)?|CAGE|MDQ|PCL-5|Y-BOCS|HAM-D|MADRS|"
    r"CAM(?:-ICU)?|SLUMS|BPRS|PANSS|SAD ?PERSONS)\b"
)
INSTRUMENT_ITEM_RE = re.compile(
    r"(?m)^\s*(?:(?:\d{1,2}|[A-Z])[.)]\s+\S.{8,}$|[0-4]\s*=\s*\S|\(?[0-4]\)\s+\S.{8,}$)"
)
INSTRUMENT_MIN_ITEMS = 3

CRISIS_EXEMPT = (
    "crisis_resources.json",
    "crisis_resources.schema.json",
    TOOLING_PREFIX + "site_build/crisis_block.py",
    TOOLING_PREFIX + "sync_crisis_from_reconnect.py",
    TOOLING_PREFIX + "validate_crisis_resources.py",
)
# Every contact registered in crisis_resources.json is enforced, the emergency-services number
# included: the rule is single-source injection, not "only the obscure numbers". Short codes
# (three or four digits) match either contiguously or with ONE separator repeated between every
# digit ("9-1-1", "9 1 1"), so an ICD code such as F91.1, a year such as 1911, or a mixed run
# such as "F9 1.1" cannot trip the guard; longer numbers may carry any separators.
CRISIS_SHORT_CODE_MAX = 4
CRISIS_SHORT_SEPARATORS = r"[ .\-]"
SCRIPT_TAG_RE = re.compile(r"</?script\b", re.I)

REGISTRY_SCHEMAS = TOOLING_PREFIX + "validate_registry_schemas.py"
REGISTRY_VALIDATORS = {
    "topic_meta.json": [TOOLING_PREFIX + "validate_topic_meta.py"],
    "question_bank.json": [REGISTRY_SCHEMAS],
    "communication_cases.json": [REGISTRY_SCHEMAS],
    "family_systems_scenarios.json": [REGISTRY_SCHEMAS],
    "evidence_registry.json": [REGISTRY_SCHEMAS, "tools/evidence_registry/validate.py"],
    "tool_registry.json": [REGISTRY_SCHEMAS, TOOLING_PREFIX + "validate_tool_governance.py"],
    "curriculum.json": [REGISTRY_SCHEMAS, TOOLING_PREFIX + "validate_curriculum.py"],
    "instrument_rights.json": [REGISTRY_SCHEMAS],
    "evidence_annotations.json": [REGISTRY_SCHEMAS, TOOLING_PREFIX + "validate_evidence_annotations.py"],
    "crisis_resources.json": [TOOLING_PREFIX + "validate_crisis_resources.py"],
    "longitudinal_case.json": [TOOLING_PREFIX + "test_longitudinal_case.py"],
    "13_Faculty_Resources/reviewed.json": [TOOLING_PREFIX + "validate_attestation_consistency.py"],
    TOOLING_PREFIX + "site_build/site_manifest.json": [TOOLING_PREFIX + "validate_attestation_consistency.py"],
}

# The producers "what ships" is derived from (ADR-002). Editing one of these without
# regenerating site_build/shipped_pages.json leaves the tracked listing stale, which is
# the one new failure mode that ADR introduces; post_edit_validate.py runs
# shipped_pages.py --check after any edit to one of them.
SHIPPED_PAGES_PRODUCERS = frozenset({
    TOOLING_PREFIX + "site_build/site_manifest.json",
    TOOLING_PREFIX + "site_build/site_extras.py",
    "08_Cases_and_Simulation/case-of-the-week/cotw_registry.json",
})

# A sentence that asserts what a paper found. Pairs with evidence_annotations.json's rule
# that every such claim needs the paper's own words as a stored sourceSpan.
FINDING_RE = re.compile(
    r"\b(found|showed|shown|demonstrated|reported|reduced|increased|improved|associated with|"
    r"NNT|NNH|odds ratio|hazard ratio|relative risk|effect size|meta-analys[ie]s|"
    r"randomi[sz]ed|Cochrane|\d+(?:\.\d+)?\s?%)\b",
    re.I,
)


# --------------------------------------------------------------------------- paths

def repo_root(hook_input: dict | None = None) -> Path:
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env:
        return Path(env).resolve()
    if hook_input and hook_input.get("cwd"):
        return Path(hook_input["cwd"]).resolve()
    return Path.cwd().resolve()


def relpath(path: str, root: Path) -> str:
    """Repo-relative POSIX path, or the input unchanged when it lies outside the repo."""
    try:
        return Path(path).resolve().relative_to(root).as_posix()
    except (ValueError, OSError):
        return path.replace(os.sep, "/")


def is_outside_repo(rel: str) -> bool:
    """relpath() passes an absolute path through unchanged when the file is not under the
    repo root (scratchpad scripts, /tmp fixtures). No repo rule applies to those."""
    return os.path.isabs(rel) or rel.startswith(("../", "..\\"))


def is_test_path(rel: str) -> bool:
    return bool(TEST_DIR_RE.search(rel)) or rel.endswith((".test.mjs", ".spec.js", "_test.py"))


def is_content_source(rel: str) -> bool:
    return bool(CONTENT_DIR_RE.match(rel)) and not rel.startswith(TOOLING_PREFIX)


def is_learner_surface(rel: str) -> bool:
    """A file whose text can reach a learner: content sources, tools, prototypes, the shell."""
    if is_test_path(rel):
        return False
    if is_content_source(rel):
        return True
    if rel.startswith(LEARNER_PREFIXES):
        return True
    if rel.startswith(SHELL_PREFIXES):
        return True
    return rel == "index.html"


# --------------------------------------------------------------------------- crisis

def crisis_patterns(root: Path) -> list[tuple[str, re.Pattern]]:
    """(resource name, regex) for every contact number in crisis_resources.json.

    Derived at runtime so the hook never hard-codes a crisis number itself.
    """
    try:
        data = json.loads((root / "crisis_resources.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    out = []
    for resource in data.get("resources", []):
        for field in ("contact", "alsoAvailable"):
            for token in re.findall(r"\d[\d\-\s().]*\d", str(resource.get(field, ""))):
                digits = re.sub(r"\D", "", token)
                if len(digits) < 3:
                    continue
                if len(digits) <= CRISIS_SHORT_CODE_MAX:
                    contiguous = re.escape(digits) + r"(?!\d)"
                    spaced = (
                        r"(?<!\d" + CRISIS_SHORT_SEPARATORS + r")"
                        + re.escape(digits[0])
                        + r"(?P<sep>" + CRISIS_SHORT_SEPARATORS + r")"
                        + r"(?P=sep)".join(re.escape(d) for d in digits[1:])
                        + r"(?!(?P=sep)?\d)"
                    )
                    pattern = r"(?<!\d)(?:" + contiguous + r"|" + spaced + r")"
                else:
                    pattern = r"(?<!\d)" + r"[\s.\-()]*".join(re.escape(d) for d in digits) + r"(?!\d)"
                out.append((str(resource.get("name", "crisis resource")), re.compile(pattern)))
    return out


def check_crisis(text: str, rel: str, root: Path) -> list[tuple[str, str, str]]:
    if not is_learner_surface(rel) or rel in CRISIS_EXEMPT:
        return []
    hits = []
    for name, pattern in crisis_patterns(root):
        if pattern.search(text):
            hits.append(name)
    if not hits:
        return []
    return [(
        "deny",
        "crisis-contact",
        "Hard-coded crisis contact (%s). Crisis contacts live only in crisis_resources.json; "
        "opt the page in with the <!-- crisis-block --> marker (<!-- crisis-block-html --> in tools) "
        "and the build injects the rendered block." % ", ".join(sorted(set(hits))),
    )]


# --------------------------------------------------------------------------- dose

def check_dose(text: str, rel: str) -> list[tuple[str, str, str]]:
    if is_test_path(rel) or not DOSE_HARD_RE.search(rel):
        return []
    lines = [i + 1 for i, line in enumerate(text.splitlines()) if DOSE_RE.search(line)]
    if not lines:
        return []
    return [(
        "deny",
        "dose-literal",
        "Dose literal in an rp-*/-trainer tool or *.pack.json (new text line%s %s). The QA gate "
        "hard-fails these; teach the decision, not the number, or route to LOCAL_POLICY."
        % ("s" if len(lines) > 1 else "", ", ".join(map(str, lines[:5]))),
    )]


# --------------------------------------------------------------------------- storage

def check_storage_keys(text: str, rel: str) -> list[tuple[str, str, str]]:
    if is_test_path(rel) or not rel.endswith((".html", ".js", ".mjs")):
        return []
    if not is_learner_surface(rel):
        return []
    bad = sorted({k for k in STORAGE_KEY_RE.findall(text) if not k.startswith(STORAGE_PREFIXES)})
    if not bad:
        return []
    return [(
        "deny",
        "localstorage-namespace",
        "localStorage key(s) outside the cw_*/rp_* namespaces: %s. Item-id collisions silently "
        "corrupt attestation and SRS state; the QA gate hard-fails any other prefix." % ", ".join(bad),
    )]


# --------------------------------------------------------------------------- machine paths

def check_machine_paths(text: str, rel: str) -> list[tuple[str, str, str]]:
    if not rel.endswith(".py") or is_test_path(rel):
        return []
    if not MACHINE_PATH_RE.search(text):
        return []
    return [(
        "deny",
        "machine-path",
        "Hard-coded machine path in a tracked .py (CI lints for /Users and /sessions). "
        "Derive paths from __file__.",
    )]


# --------------------------------------------------------------------------- PHI

SCRIPT_BLOCK_RE = re.compile(r"<script\b[^>]*>.*?</script>", re.I | re.S)


def check_phi(text: str, rel: str) -> list[tuple[str, str, str]]:
    if not is_learner_surface(rel):
        return []
    # Prose surfaces only. Script code (the governed shell, *.js, <script> blocks inside a
    # tool) carries long numeric literals — timeouts, cache keys — that are not identifiers,
    # and a recurring false warn teaches people to ignore the class.
    if rel.startswith(SHELL_PREFIXES) or not rel.endswith((".md", ".html", ".json", ".txt")):
        return []
    if rel.endswith(".html"):
        text = SCRIPT_BLOCK_RE.sub(" ", text)
    scrubbed = IDENTIFIER_CONTEXT_RE.sub(" ", text)
    hits = [name for name, pattern in PHI_PATTERNS if pattern.search(scrubbed)]
    if not hits:
        return []
    return [(
        "ask",
        "phi-heuristic",
        "Text matches the PHI heuristic (%s), the same patterns site_build/phi_heuristic.js uses "
        "at runtime. Clinical content must be synthetic and de-identified. If this is a synthetic "
        "vignette or a teaching reference to the concept, confirm; otherwise remove the identifier."
        % ", ".join(hits),
    )]


# --------------------------------------------------------------------------- instruments

def check_instrument(text: str, rel: str) -> list[tuple[str, str, str]]:
    if not is_learner_surface(rel):
        return []
    names = sorted({m.group(0) for m in INSTRUMENT_NAME_RE.finditer(text)})
    if not names:
        return []
    if len(INSTRUMENT_ITEM_RE.findall(text)) < INSTRUMENT_MIN_ITEMS:
        return []
    return [(
        "ask",
        "instrument-reproduction",
        "Mentions %s alongside item- or anchor-shaped text. THE LIBRARY TEACHES ADMINISTRATION; IT "
        "DOES NOT REPRODUCE INSTRUMENTS: no verbatim item stems, anchor ladders, or field labels, "
        "and no tool that functions as a fillable copy. Scope is recorded in the instrument audit "
        "(docs/superpowers/plans/2026-08-20-instrument-reproduction-audit.md); stop and ask rather "
        "than inferring an exemption." % ", ".join(names),
    )]


# --------------------------------------------------------------------------- claims

def mentions_finding(text: str, rel: str) -> bool:
    return is_learner_surface(rel) and rel.endswith((".md", ".html")) and bool(FINDING_RE.search(text))


# --------------------------------------------------------------------------- all

def run_text_checks(text: str, rel: str, root: Path, *, skip_phi: bool = False) -> list[tuple[str, str, str]]:
    """skip_phi: the caller has established the text lands inside script code (an Edit whose
    old_string sits within a <script> block), where the prose PHI heuristic does not apply."""
    if is_outside_repo(rel):
        return []
    findings = []
    findings += check_crisis(text, rel, root)
    findings += check_dose(text, rel)
    findings += check_storage_keys(text, rel)
    findings += check_machine_paths(text, rel)
    if not skip_phi:
        findings += check_phi(text, rel)
    findings += check_instrument(text, rel)
    return findings


def edit_inside_script(root: Path, rel: str, edits: list[tuple[str, str]]) -> bool:
    """True when every (old_string, new_string) of an Edit/MultiEdit on an .html file replaces
    a range that lies wholly inside one <script>…</script> block on disk and the replacement
    cannot leave it. An Edit's new_string arrives as a bare fragment, so the only way to know
    it is script code is to find where it lands. Unknown -> False (scan)."""
    if not rel.endswith(".html") or not edits:
        return False
    try:
        html = (root / rel).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return False
    lowered = html.lower()
    for old, new in edits:
        if not old:
            return False
        # A range that contains a script tag straddles the boundary; a replacement that
        # contains one could open or close a block. Either way the prose pass must run.
        if SCRIPT_TAG_RE.search(old) or SCRIPT_TAG_RE.search(new):
            return False
        idx = html.find(old)
        if idx < 0:
            return False
        while idx >= 0:  # every occurrence, in case the edit replaces all of them
            before = lowered[:idx]
            if before.count("<script") <= before.count("</script"):
                return False
            idx = html.find(old, idx + len(old))
    return True


def is_lfs_pointer(blob: bytes) -> bool:
    return blob.startswith(LFS_POINTER_HEADER) and len(blob) < 400


def manifest_sources(root: Path) -> dict[str, str]:
    """source path -> shipped slug, from site_build/site_manifest.json."""
    path = root / TOOLING_PREFIX / "site_build" / "site_manifest.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    out = {}
    for group in ("tools", "md", "toolAssets"):
        for entry in data.get(group, []):
            if isinstance(entry, list) and len(entry) >= 2:
                out[entry[0]] = entry[1]
    return out


def attestation_status(rel: str, root: Path) -> str | None:
    slug = manifest_sources(root).get(rel)
    if not slug:
        return None
    try:
        ledger = json.loads((root / "13_Faculty_Resources" / "reviewed.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    row = ledger.get(slug)
    return row.get("status") if isinstance(row, dict) else None
