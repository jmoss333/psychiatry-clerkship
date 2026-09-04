#!/usr/bin/env python3
"""Find clinical claims asserted in many places that no registry slot owns.

WHY THIS EXISTS
---------------
canonical_claims.json enforces claims a human has already identified. It is
blind in the other direction: a claim asserted in nine hand-authored places that
nobody has slotted is exactly the RSAF-F001 shape, and the registry cannot see
it, because the registry only knows what it was told.

This runs the inverse query. It does not judge whether an assertion is right --
it counts how many independent hand-authored copies of it exist, and reports the
clusters no registry slot covers, most-copied first. The ranking is the point:

  a claim asserted once cannot drift;
  a claim asserted six times with no canonical statement is the next correction
  that will reach one copy and miss five.

Three buckets, because they mean different things:

  PARTIAL  some copies are inside a registry scope pointer and some are not.
           The registry knows this claim and is missing copies of it. Worst
           case of the three: the gate is green and the drift is live.
  ORPHAN   no copy is governed at all. A candidate for a new slot.
  COVERED  every copy is governed. Shown only with --all.

HOW IT GROUPS
-------------
By rare CO-OCCURRENCE, not by string similarity and not by rare words. A group
is the set of loci containing one token pair -- (antipsychotic, catatonia) --
that appears in at most 60 loci corpus-wide. The pair names the group, so every
finding arrives already labelled with the concept it is about.

Two earlier designs failed, and the failures are why it is built this way:

  Rare single tokens (the check_qbank_coherence.py signature) work on a 189-item
  bank and fail on a library. At 2358 loci the clinically decisive nouns are
  common by construction -- a psychiatry library says "catatonia" constantly --
  so they were filtered out as ordinary vocabulary and the grouping ran on words
  like "giving" and "looks". The two 'cant' fields faculty had already attested
  as ONE claim shared exactly one rare token.

  Transitive clustering on shared pairs then chained 7 of those 8 known loci
  together with sixty unrelated ones, because single linkage lets A-B and B-C
  imply A-C. Tightening to break the chain dropped the known case instead.

So there is no transitivity here. Nothing chains, a locus that asserts two
claims lands in two groups, and each group can be read on its own.

The stemmer is load-bearing, not cosmetic: one page says "Antipsychotics" and
another "an antipsychotic", and without suffix stripping those never meet.

Known limit, stated rather than hidden: a pair in more than the ceiling of loci
is dropped as vocabulary, so a claim asserted more often than that goes
invisible. --pair-ceiling moves the line.

VALIDATION
----------
--self-test is hermetic and pins the harvest rules and the three buckets.
--known-answer runs against the real corpus and requires the eight loci that
RSAF-F001 and PR #483 found drifting -- the ones faculty then attested as one
claim -- to land in one group. A heuristic that cannot find the defect it was
built for should not be believed about anything else, so that check is the
first thing to run after changing any threshold here.

WHAT IT HARVESTS
----------------
Hand-authored clinical assertions only. Generated files are out: a generated
copy is a rendering of a locus, not an independent one. Question-bank
distractors are out too -- a distractor is deliberately wrong, and clustering
deliberate falsehoods with the teaching they contradict manufactures findings.
The keyed answer and the trap notes are in, because those teach. Vignette stems
are out; they are cases, not claims.

WHAT IT IS NOT
--------------
Not a gate. It exits 0 on every finding and is deliberately not wired into
verify.sh: the grouping is a heuristic and a heuristic must not block a push.
Every group needs a human read before it becomes a registry slot.

The two buckets are not equally trustworthy, and it would be dishonest to
present them as if they were. PARTIAL is precise: the registry already names the
claim, so "here are copies of it the scope pointers miss" is a checkable
statement about a claim faculty have defined. ORPHAN has a real noise floor.
It ranks co-occurrences, and a co-occurrence that is strong, clinical and
repeated can still be a topic rather than a claim -- "delirium + withdrawal"
names a whole area of the library, not one sentence that could drift. Read
ORPHAN as a browsing order over the corpus, not a list of defects.

Siblings, so they are not confused:
  sweep_unlicensed_claims.py  page assertions carrying no attribution
  check_qbank_coherence.py    two bank items that contradict each other
  this                        one claim living in many files with no owner

    python3 bin/claim_exposure.py                 # ranked PARTIAL + ORPHAN
    python3 bin/claim_exposure.py --detail        # every locus, with its text
    python3 bin/claim_exposure.py --all           # include COVERED groups
    python3 bin/claim_exposure.py --min 8         # only claims with 8+ copies
    python3 bin/claim_exposure.py --json PATH     # machine-readable report
    python3 bin/claim_exposure.py --self-test     # hermetic
    python3 bin/claim_exposure.py --known-answer  # against the real corpus
"""
import argparse
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY = os.path.join(ROOT, "13_Faculty_Resources", "canonical_claims.json")

TOPIC_META = "topic_meta.json"
QUESTION_BANK = "question_bank.json"
PACKS = [
    "_prototypes/agitation-trainer/agitation.pack.json",
    "_prototypes/agitation-trainer/rp-agitation.pack.json",
    "_prototypes/sp-interview/sp-interview.pack.json",
]

# Shorter than this is a label, a heading or a stub, not an assertion.
MIN_CHARS = 45

PAIR_DF_CEILING = 60        # a CO-OCCURRENCE seen in more loci than this is
                            # the library's ordinary vocabulary, not a claim
MIN_OWNERS = 2              # one owner cannot drift away from itself
MAX_TOKENS_FOR_PAIRS = 22   # longest loci contribute their rarest tokens only
MIN_PMI = 1.0               # the pair must co-occur at least e times more often
                            # than two independent words of those frequencies
                            # would. Without this the top of the report is
                            # "plan+safety" and "based+evidence" -- the library's
                            # teaching vocabulary, which co-occurs constantly and
                            # asserts nothing.

STOP = set("""
a an the and or of to in for with on at as by from is are was were be been being
this that these those it its his her their they them he she you your we our not
no if then than when while into onto over under after before during about which
who whom whose what where how why any all both each few more most other some such
only own same so too very can will just should now do does did done has have had
patient patients next step best following consider consider start starts started
""".split())

# Words about the ACT of teaching or documenting rather than about medicine.
# PMI cannot remove these -- "safety plan" and "evidence based" are real
# collocations, so they score well; they are simply not clinical claims. The
# line is drawn at pedagogy and paperwork: "catatonia" and "haloperidol" stay,
# "vignette" and "shelf" go. Clinically load-bearing words are NOT here, even
# when they are common: "risk", "safety", "management" and "assessment" all
# remain, because a claim can turn on them.
STOP |= set("""
plan plans present presents presenting presentation evidence based document
documents documentation chart charting note notes shelf student students
resident residents attending question questions answer answers option options
learner learners teaching teach case cases vignette rotation clerkship week
weeks module lecture reading readings objective objectives
""".split())


def stem(word):
    """Crude suffix stripping, enough to make 'antipsychotics', 'antipsychotic',
    'excluded', 'excluding' and 'exclude' meet. Without it the two loci the
    registry already governs share ONE token, because one page says
    'Antipsychotics' and the other says 'an antipsychotic'."""
    for suffix, keep in (("ies", "y"), ("ing", ""), ("ed", ""), ("es", ""), ("s", "")):
        if word.endswith(suffix) and len(word) - len(suffix) >= 4:
            return word[:len(word) - len(suffix)] + keep
    return word


def norm_tokens(text):
    out = []
    for word in re.findall(r"[a-z0-9]+", (text or "").lower()):
        if len(word) <= 3 or word in STOP:
            continue
        root = stem(word)
        # Check the stem too, so "documented" is dropped by "document".
        if root not in STOP:
            out.append(root)
    return out


def jptr(*parts):
    """Build a JSON pointer, escaping per RFC 6901 so output pastes into scope."""
    out = ""
    for p in parts:
        s = str(p).replace("~", "~0").replace("/", "~1")
        out += "/" + s
    return out


def _add(loci, path, pointer, label, text, owner):
    """owner is the thing a reader encounters as one unit -- a topic page, a bank
    item, a trainer scenario. Two fields of one question are not two copies of a
    claim; they are one item saying it twice, and counting them as two copies is
    how a report like this manufactures alarming numbers out of nothing."""
    if isinstance(text, str) and len(text.strip()) >= MIN_CHARS:
        loci.append({"path": path, "pointer": pointer, "label": label,
                     "owner": "{}#{}".format(path, owner),
                     "text": " ".join(text.split())})


TM_SCALARS = ("cant", "tldr", "firstMove", "familyOverlay")
TM_LISTS = ("points", "ruleOut", "safetySteps", "shelfBlueprint")
TM_WORKFLOW = ("ask", "mse", "safety", "say", "collateral", "rounds", "exam")


def harvest_topic_meta(data, path=TOPIC_META):
    loci = []
    for topic, meta in data.items():
        if topic.startswith("_") or not isinstance(meta, dict):
            continue
        for field in TM_SCALARS:
            _add(loci, path, jptr(topic, field), "{} {}".format(topic, field),
                 meta.get(field), topic)
        for field in TM_LISTS:
            for i, item in enumerate(meta.get(field) or []):
                _add(loci, path, jptr(topic, field, i),
                     "{} {}[{}]".format(topic, field, i), item, topic)
        for field in TM_WORKFLOW:
            _add(loci, path, jptr(topic, "clinicalWorkflow", field),
                 "{} workflow.{}".format(topic, field),
                 (meta.get("clinicalWorkflow") or {}).get(field), topic)
        quiz = meta.get("quiz") or {}
        for field in ("q", "why"):
            _add(loci, path, jptr(topic, "quiz", field),
                 "{} quiz.{}".format(topic, field), quiz.get(field), topic)
        for i, opt in enumerate(quiz.get("o") or []):
            # Keyed answer only. A distractor is deliberately wrong; clustering
            # it with the teaching it contradicts manufactures findings.
            if isinstance(opt, dict) and opt.get("c"):
                _add(loci, path, jptr(topic, "quiz", "o", i, "t"),
                     "{} quiz.answer".format(topic), opt.get("t"), topic)
    return loci


def _qb_options(loci, path, base, label, options, owner):
    for j, opt in enumerate(options or []):
        if not isinstance(opt, dict):
            continue
        if opt.get("c"):
            _add(loci, path, jptr(*base, "options", j, "t"),
                 "{} answer".format(label), opt.get("t"), owner)
        note = (opt.get("trap") or {}).get("note")
        _add(loci, path, jptr(*base, "options", j, "trap", "note"),
             "{} trap[{}]".format(label, j), note, owner)


def harvest_question_bank(data, path=QUESTION_BANK):
    loci = []
    for i, item in enumerate(data.get("items") or []):
        if not isinstance(item, dict) or item.get("status") == "retired":
            continue
        qid = item.get("id") or "items[{}]".format(i)
        for field in ("pearl", "why"):
            _add(loci, path, jptr("items", i, field),
                 "{} {}".format(qid, field), item.get(field), qid)
        _qb_options(loci, path, ("items", i), qid, item.get("options"), qid)
        tier2 = item.get("tier2") or {}
        _add(loci, path, jptr("items", i, "tier2", "why"),
             "{} tier2.why".format(qid), tier2.get("why"), qid)
        _qb_options(loci, path, ("items", i, "tier2"),
                    "{} tier2".format(qid), tier2.get("options"), qid)
    return loci


# Pack fields that teach. 'label' and 'stem' are deliberately absent: a choice
# label names an option, a stem describes a case; neither asserts a claim.
PACK_KEYS = {"text", "note", "why", "rationale", "feedback", "teaching", "reveal"}
PACK_LISTS = {"debriefTeachingPoints", "anchors", "guarded"}


def harvest_pack(data, path):
    """Walk a pack, keeping only the string leaves that teach.

    hazardIf is matched by ancestry rather than by key name: its keys are the
    condition ("catatonia", "qtc"), so the field name that matters is the parent.
    """
    loci = []

    def label_for(trail):
        return " ".join(str(t) for t in trail[-3:])

    def owner_for(trail):
        """The unit a learner meets: one scenario, one case, one choice."""
        for i, seg in enumerate(trail):
            if seg in ("scenarios", "cases") and i + 1 < len(trail):
                return "{}[{}]".format(seg, trail[i + 1])
        if trail and trail[0] == "choiceBanks" and len(trail) > 2:
            return "choiceBanks/{}[{}]".format(trail[1], trail[2])
        return "/".join(str(t) for t in trail[:2])

    def walk(node, trail, in_hazard, in_list):
        if isinstance(node, dict):
            for k, v in node.items():
                walk(v, trail + [k], in_hazard or k == "hazardIf", None)
        elif isinstance(node, list):
            for i, v in enumerate(node):
                walk(v, trail + [i], in_hazard, trail[-1] if trail else None)
        elif isinstance(node, str):
            key = trail[-1] if trail else ""
            keep = in_hazard or key in PACK_KEYS or in_list in PACK_LISTS
            if keep:
                _add(loci, path, jptr(*trail), label_for(trail), node,
                     owner_for(trail))

    walk(data, [], False, None)
    return loci


def load_json(rel):
    full = os.path.join(ROOT, rel)
    if not os.path.isfile(full):
        return None
    with open(full, encoding="utf-8") as fh:
        return json.load(fh)


def harvest_all():
    loci = []
    tm = load_json(TOPIC_META)
    if tm:
        loci += harvest_topic_meta(tm)
    qb = load_json(QUESTION_BANK)
    if qb:
        loci += harvest_question_bank(qb)
    for rel in PACKS:
        pack = load_json(rel)
        if pack:
            loci += harvest_pack(pack, rel)
    return loci


def registry_coverage(registry):
    """path -> [(scope pointer, claim id)], and path -> [claim id] with no scope.

    A file-level entry is NOT treated as covering a locus. Narrowing is the whole
    point of scope: on a file that holds one claim per topic, an unscoped entry
    says the claim lives somewhere in there, which is what the registry was built
    to stop saying. Unscoped harvested files are reported instead.
    """
    scoped = defaultdict(list)
    unscoped = defaultdict(list)
    for cid, claim in (registry.get("claims") or {}).items():
        for entry in claim.get("appliesTo") or []:
            path = entry.get("path")
            if entry.get("scope"):
                for pointer in entry["scope"]:
                    scoped[path].append((pointer, cid))
            else:
                unscoped[path].append(cid)
    return scoped, unscoped


def covering_claims(locus, scoped):
    out = set()
    for pointer, cid in scoped.get(locus["path"], []):
        if locus["pointer"] == pointer or locus["pointer"].startswith(pointer + "/"):
            out.add(cid)
    return out


def concept_pairs(tokens, df, limit=MAX_TOKENS_FOR_PAIRS):
    """Unordered co-occurring token pairs, from a locus's rarest tokens."""
    picked = sorted(tokens, key=lambda t: (df[t], t))[:limit]
    picked.sort()
    return {(picked[a], picked[b])
            for a in range(len(picked)) for b in range(a + 1, len(picked))}


def group_by_pair(loci, pair_ceiling=PAIR_DF_CEILING, min_owners=MIN_OWNERS,
                  min_pmi=MIN_PMI):
    """Group loci by the rare CO-OCCURRENCE they share. A group per pair.

    Two earlier designs failed here and both failures are instructive.

    Rare single tokens, copied from check_qbank_coherence.py, work on a 189-item
    bank and fail on a library: at 2358 loci the clinically decisive nouns are
    common by construction -- a psychiatry library says "catatonia" and
    "antipsychotic" constantly -- so both were filtered out as ordinary
    vocabulary and the grouping ran on words like "giving" and "looks". Measured
    against the one case with a known answer, the two 'cant' fields the registry
    already governs together shared exactly ONE rare token.

    Co-occurrence fixes the level -- "catatonia" is common, "antipsychotic" is
    common, the pair is not -- but transitive clustering on shared pairs then
    chained 7 of the 8 known loci together with sixty unrelated ones, because
    single linkage lets A-B and B-C imply A-C. Raising thresholds to break the
    chain dropped the known case instead.

    So: no transitivity. A group IS the set of loci containing one rare pair.
    Nothing chains, the group carries its own name -- (antipsychotic, catatonia)
    -- and a locus that asserts two claims appears in two groups, which is
    correct rather than a defect. Groups whose membership is a subset of another
    are dropped as the vaguer statement of the same finding.
    """
    n = len(loci)
    if n < 2:
        return [], {}
    tokens = [set(norm_tokens(l["text"])) for l in loci]
    df = Counter()
    for s in tokens:
        df.update(s)
    idf = {t: math.log(n / c) for t, c in df.items()}

    inverted = defaultdict(list)
    for i, s in enumerate(tokens):
        for pair in concept_pairs(s, df):
            inverted[pair].append(i)

    raw = []
    for pair, members in inverted.items():
        if not 2 <= len(members) <= pair_ceiling:
            continue
        # Pointwise mutual information: is this pair a claim, or just two words
        # the library happens to use a lot? "plan" and "safety" co-occur 39 times
        # and that is FEWER than chance predicts for two words that common.
        expected = df[pair[0]] * df[pair[1]] / n
        if expected and math.log(len(members) / expected) < min_pmi:
            continue
        owners = {loci[i]["owner"] for i in members}
        if len(owners) < min_owners:
            continue
        raw.append({"pair": pair, "members": sorted(members),
                    "owner_set": frozenset(owners)})

    # Collapse: identical membership means one finding named several ways, and a
    # strict subset is the same finding stated more narrowly.
    by_members = {}
    for group in raw:
        key = tuple(group["members"])
        if key in by_members:
            by_members[key]["pairs"].append(group["pair"])
        else:
            by_members[key] = {"pairs": [group["pair"]],
                               "members": group["members"],
                               "owner_set": group["owner_set"]}
    groups = sorted(by_members.values(), key=lambda g: -len(g["members"]))
    kept, kept_by_member = [], defaultdict(list)
    for group in groups:
        members = set(group["members"])
        # Only a group already kept that shares a member can be a superset, so
        # the containment check runs against those, not against all 12k groups.
        anchor = group["members"][0]
        if any(members < set(k["members"]) for k in kept_by_member[anchor]):
            continue
        kept.append(group)
        for i in group["members"]:
            kept_by_member[i].append(group)
    return kept, idf


def signature(members, loci, idf, size=5):
    """The highest-information tokens carried by most of the cluster."""
    counts = Counter()
    for i in members:
        counts.update(set(norm_tokens(loci[i]["text"])))
    quorum = max(2, (len(members) + 1) // 2)
    common = [t for t, c in counts.items() if c >= quorum]
    common.sort(key=lambda t: -idf.get(t, 0))
    return common[:size]


def slot_hints(members, loci, registry):
    """Pending slots whose id vocabulary shows up in the cluster. A hint only."""
    text = " ".join(loci[i]["text"].lower() for i in members)
    hits = []
    for cid, claim in sorted((registry.get("claims") or {}).items()):
        if claim.get("status") != "pending":
            continue
        parts = [p for p in cid.split("-") if len(p) > 3 and p not in STOP]
        matched = [p for p in parts if p in text]
        if len(matched) >= 2 or (matched and len(parts) <= 2):
            hits.append(cid)
    return hits


def build_report(loci, registry, **tuning):
    scoped, unscoped = registry_coverage(registry)
    groups, idf = group_by_pair(loci, **tuning)
    clusters = []
    for group in groups:
        members = group["members"]
        governed = {i: sorted(covering_claims(loci[i], scoped)) for i in members}
        owners = {}
        for i in members:
            owners.setdefault(loci[i]["owner"], []).append(i)
        # A copy is an OWNER, not a locus: one bank item whose pearl, why and two
        # trap notes all restate its own teaching is one copy, not four.
        if len(owners) < 2:
            continue
        n_gov_owners = sum(1 for idxs in owners.values()
                           if all(governed[i] for i in idxs))
        if n_gov_owners == 0:
            bucket = "ORPHAN"
        elif n_gov_owners == len(owners):
            bucket = "COVERED"
        else:
            bucket = "PARTIAL"
        paths = sorted({loci[i]["path"] for i in members})
        clusters.append({
            "bucket": bucket,
            "copies": len(owners),
            "loci_count": len(members),
            "files": len(paths),
            "paths": paths,
            "governed": n_gov_owners,
            "pairs": ["{}+{}".format(*p) for p in sorted(group["pairs"])[:4]],
            "signature": signature(members, loci, idf),
            "slotHints": slot_hints(members, loci, registry),
            "owners": sorted(owners),
            "loci": [{"path": loci[i]["path"], "pointer": loci[i]["pointer"],
                      "label": loci[i]["label"], "owner": loci[i]["owner"],
                      "governedBy": governed[i], "text": loci[i]["text"]}
                     for i in sorted(members, key=lambda k: loci[k]["owner"])],
        })
    order = {"PARTIAL": 0, "ORPHAN": 1, "COVERED": 2}
    clusters.sort(key=lambda c: (order[c["bucket"]], -c["copies"], -c["files"]))
    return clusters, unscoped


def render(clusters, unscoped, loci_count, args):
    shown = [c for c in clusters
             if c["copies"] >= args.min and (args.all or c["bucket"] != "COVERED")]
    for path, cids in sorted(unscoped.items()):
        if path in [TOPIC_META, QUESTION_BANK] + PACKS:
            print("NOTE  {} is in appliesTo with no scope ({}) -- the guard "
                  "covers the whole file, so it narrows nothing".format(
                      path, ", ".join(cids)))
    for c in shown[:args.limit]:
        head = "{:7s} {:2d} copies / {} file(s) / {} loci".format(
            c["bucket"], c["copies"], c["files"], c["loci_count"])
        if c["bucket"] == "PARTIAL":
            head += "  [{} governed, {} NOT]".format(
                c["governed"], c["copies"] - c["governed"])
        print(head)
        print("        shared: {}".format(", ".join(c["pairs"])))
        print("        signature: {}".format(" ".join(c["signature"]) or "-"))
        if c["slotHints"]:
            print("        pending slot(s): {}".format(", ".join(c["slotHints"])))
        last = None
        for item in c["loci"]:
            if item["owner"] != last:
                print("        - {}".format(item["owner"]))
                last = item["owner"]
            mark = "gov " if item["governedBy"] else "    "
            print("            {}{}".format(mark, item["pointer"]))
            if args.detail:
                print("                 {}".format(item["text"][:200]))
        print()
    counts = Counter(c["bucket"] for c in clusters)
    big = [c for c in clusters if c["copies"] >= args.min]
    print("claim exposure: {} loci harvested, {} shared-pair groups, "
          "{} with {}+ copies".format(
              loci_count, len(clusters), len(big), args.min))
    print("claim exposure: at {}+ copies -- {} partial, {} orphan, {} covered"
          .format(args.min,
                  sum(1 for c in big if c["bucket"] == "PARTIAL"),
                  sum(1 for c in big if c["bucket"] == "ORPHAN"),
                  sum(1 for c in big if c["bucket"] == "COVERED")))
    if counts["PARTIAL"]:
        print("claim exposure: {} PARTIAL group(s) overall -- a governed claim "
              "with copies the registry does not reach".format(counts["PARTIAL"]))
    if len(shown) > args.limit:
        print("claim exposure: {} more not shown (--limit)".format(
            len(shown) - args.limit))


# A minimal reconstruction of the RSAF-F001 shape: one claim, three hand-authored
# copies in two files, plus an unrelated locus that must not join them. If a
# future edit to the heuristics stops finding this, it stops finding the defect
# the registry exists for.
FIXTURE_TOPIC_META = {
    "_note": "fixture",
    "agitation.md": {"cant": "Reaching for an antipsychotic in excited catatonia -- which "
                             "looks like agitation -- can precipitate malignant catatonia or NMS."},
    "catatonia.md": {"cant": "Giving an antipsychotic before catatonia is excluded can "
                             "precipitate malignant catatonia or NMS; hold it until excluded."},
    "delirium.md": {"cant": "Sedating the confusion and never looking for the cause. Delirium "
                            "is a symptom of a medical illness, so the workup is the treatment."},
}

FIXTURE_PACK = {
    "choiceBanks": {"pharmApproach": [
        {"id": "sga", "label": "Olanzapine",
         "hazardIf": {"catatonia": "An antipsychotic in suspected catatonia can precipitate "
                                   "malignant catatonia or NMS -- exclude catatonia first."}},
    ]},
}

FIXTURE_BANK = {"items": [{
    "id": "qb_fix_001", "stem": "A 40-year-old is mute and rigid. Best next step?",
    "pearl": "Exclude catatonia before an antipsychotic; it can precipitate malignant "
             "catatonia or NMS.",
    "options": [
        {"key": "A", "t": "Give haloperidol now to settle the agitation",
         "trap": {"name": "Excited catatonia read as agitation",
                  "note": "Excited catatonia read as ordinary agitation is how this "
                          "mistake is usually made on the ward."}},
        {"key": "B", "t": "Lorazepam challenge first", "c": True},
    ],
}]}


def self_test():
    failures = []

    def check(ok, what):
        if not ok:
            failures.append(what)

    loci = (harvest_topic_meta(FIXTURE_TOPIC_META)
            + harvest_pack(FIXTURE_PACK, "fixture.pack.json")
            + harvest_question_bank(FIXTURE_BANK, "fixture_bank.json"))

    texts = {l["text"] for l in loci}
    check(not any("haloperidol now" in t.lower() for t in texts),
          "a question-bank distractor was harvested; distractors must stay out")
    check(any("usually made on the ward" in t for t in texts),
          "a trap note was dropped; trap notes teach and must be harvested")
    check(not any(t.startswith("A 40-year-old is mute") for t in texts),
          "a vignette stem was harvested; stems are cases, not claims")

    # PMI is a corpus-scale filter and is meaningless on a five-locus fixture,
    # where every word is "common". It is validated by --known-answer instead.
    tuning = {"min_pmi": 0.0}
    empty = {"claims": {}}
    clusters, _ = build_report(loci, empty, **tuning)
    big = [c for c in clusters if c["copies"] >= 3]
    check(len(big) == 1, "expected exactly one cluster of 3+, got {}".format(len(big)))
    if big:
        members = {(l["path"], l["pointer"]) for l in big[0]["loci"]}
        check(("topic_meta.json", "/agitation.md/cant") in members,
              "the agitation copy did not cluster")
        check(("topic_meta.json", "/catatonia.md/cant") in members,
              "the catatonia copy did not cluster")
        check(("fixture.pack.json", "/choiceBanks/pharmApproach/0/hazardIf/catatonia")
              in members, "the pack hazard did not cluster")
        check(("topic_meta.json", "/delirium.md/cant") not in members,
              "an unrelated locus joined the cluster")
        check(big[0]["bucket"] == "ORPHAN",
              "with an empty registry the cluster must be ORPHAN, got {}".format(
                  big[0]["bucket"]))

    partial_registry = {"claims": {"fixture-claim": {"status": "reviewed", "appliesTo": [
        {"path": "topic_meta.json", "scope": ["/catatonia.md/cant"]}]}}}
    clusters, _ = build_report(loci, partial_registry, **tuning)
    big = [c for c in clusters if c["copies"] >= 3]
    check(big and big[0]["bucket"] == "PARTIAL",
          "one governed copy out of three must read PARTIAL, not {}".format(
              big[0]["bucket"] if big else "no cluster"))

    full_scope = ["/catatonia.md/cant", "/agitation.md/cant"]
    full_registry = {"claims": {"fixture-claim": {"status": "reviewed", "appliesTo": [
        {"path": "topic_meta.json", "scope": full_scope},
        {"path": "fixture.pack.json",
         "scope": ["/choiceBanks/pharmApproach/0/hazardIf/catatonia"]},
        {"path": "fixture_bank.json", "scope": ["/items/0/pearl"]}]}}}
    clusters, _ = build_report(loci, full_registry, **tuning)
    big = [c for c in clusters if c["copies"] >= 3]
    check(big and big[0]["bucket"] == "COVERED",
          "every copy governed must read COVERED, not {}".format(
              big[0]["bucket"] if big else "no cluster"))

    # An unscoped entry must not silently count as coverage.
    unscoped_registry = {"claims": {"fixture-claim": {"status": "reviewed", "appliesTo": [
        {"path": "topic_meta.json"}]}}}
    clusters, unscoped = build_report(loci, unscoped_registry, **tuning)
    big = [c for c in clusters if c["copies"] >= 3]
    check(big and big[0]["bucket"] == "ORPHAN",
          "a file-level appliesTo must not count as covering a locus")
    check("topic_meta.json" in unscoped, "the unscoped file was not reported")

    for failure in failures:
        print("FAIL  {}".format(failure))
    print("claim exposure self-test: {}".format(
        "FAILED ({} problem(s))".format(len(failures)) if failures else "OK"))
    return 1 if failures else 0


# The one case in this repo with a known answer. PR #483 and RSAF-F001 found the
# same claim drifting across these eight loci, and faculty then attested them as
# one claim. If the clustering cannot put them in one cluster, it cannot find the
# defect it exists for, and its other output should not be believed.
GROUND_TRUTH = [
    ("topic_meta.json", "/agitation.md/cant"),
    ("topic_meta.json", "/catatonia.md/cant"),
    ("_prototypes/agitation-trainer/agitation.pack.json",
     "/choiceBanks/pharmApproach/0/hazardIf/catatonia"),
    ("_prototypes/agitation-trainer/agitation.pack.json",
     "/choiceBanks/pharmApproach/1/hazardIf/catatonia"),
    ("_prototypes/agitation-trainer/agitation.pack.json",
     "/choiceBanks/pharmApproach/3/hazardIf/catatonia"),
    ("_prototypes/agitation-trainer/rp-agitation.pack.json",
     "/choiceBanks/pharmApproach/0/hazardIf/catatonia"),
    ("_prototypes/agitation-trainer/rp-agitation.pack.json",
     "/choiceBanks/pharmApproach/1/hazardIf/catatonia"),
    ("_prototypes/agitation-trainer/rp-agitation.pack.json",
     "/choiceBanks/pharmApproach/3/hazardIf/catatonia"),
]


def known_answer(loci, registry, tuning):
    clusters, _ = build_report(loci, registry, **tuning)
    want = set(GROUND_TRUTH)
    best, hit = None, 0
    for c in clusters:
        found = sum(1 for l in c["loci"] if (l["path"], l["pointer"]) in want)
        if found > hit:
            best, hit = c, found
    print("known answer: {}/{} governed loci in one cluster".format(hit, len(want)))
    if best:
        found = {(l["path"], l["pointer"]) for l in best["loci"]}
        for path, pointer in GROUND_TRUTH:
            print("  {} {} {}".format(
                "hit " if (path, pointer) in found else "MISS", path, pointer))
        extra = [l for l in best["loci"] if (l["path"], l["pointer"]) not in want]
        for l in extra:
            print("  also {} {}{}".format(
                l["path"], l["pointer"],
                "  [governed]" if l["governedBy"] else "  <- NOT governed"))
    if hit < len(want):
        print("known answer: FAILED -- the clustering misses the case it exists for")
        return 1
    print("known answer: OK")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--detail", action="store_true", help="print each locus text")
    ap.add_argument("--all", action="store_true", help="include COVERED clusters")
    ap.add_argument("--min", type=int, default=4,
                    help="minimum copies to show (default %(default)s); a "
                         "two-owner co-occurrence at this scale is mostly chance")
    ap.add_argument("--limit", type=int, default=25, help="clusters to print")
    ap.add_argument("--json", metavar="PATH", help="write the full report as JSON")
    ap.add_argument("--pair-ceiling", type=int, default=PAIR_DF_CEILING,
                    help="loci a pair may appear in and stay rare (default %(default)s)")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--known-answer", action="store_true",
                    help="check the corpus against the RSAF-F001 ground truth")
    args = ap.parse_args()

    if args.self_test:
        return self_test()

    registry = load_json(os.path.relpath(REGISTRY, ROOT))
    if registry is None:
        print("FAIL  registry not found: {}".format(REGISTRY))
        return 1

    loci = harvest_all()
    if not loci:
        print("claim exposure: nothing harvested -- run from the repo")
        return 0

    tuning = dict(pair_ceiling=args.pair_ceiling)
    if args.known_answer:
        return known_answer(loci, registry, tuning)

    clusters, unscoped = build_report(loci, registry, **tuning)
    render(clusters, unscoped, len(loci), args)

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump({"loci": len(loci), "clusters": clusters}, fh, indent=1)
        print("claim exposure: wrote {}".format(args.json))
    return 0


if __name__ == "__main__":
    sys.exit(main())
