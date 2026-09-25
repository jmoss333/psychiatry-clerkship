#!/usr/bin/env python3
"""Behavior tests for the claim-anchor validator.

Each test builds a synthetic repository so the assertions describe the CONTRACT,
not the current state of the real curriculum — the real content moves every week
and a test pinned to it would only ever measure drift.
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VALIDATOR = Path(__file__).with_name("validate_claim_anchors.py")

REGISTRY_TOOLS = ROOT / "tools" / "evidence_registry"


def write_synthetic_repository(root: Path, page_body: str, evidence_ids):
    """Minimal repo the validator can run against: listing, meta, registry, page.

    The validator asks site_build/shipped_pages.json what ships (ADR-002), so the
    synthetic repo carries that listing rather than the producers behind it.
    """
    shipped_path = root / "13_Faculty_Resources/_automation/site_build/shipped_pages.json"
    shipped_path.parent.mkdir(parents=True, exist_ok=True)
    shipped_path.write_text(
        json.dumps(
            {
                "version": 1,
                "pages": [
                    {
                        "slug": "t_synthetic.md",
                        "kind": "page",
                        "sites": ["ms3", "res"],
                        "title": "Synthetic",
                        "source": "03_Core_Topics/Synthetic/page.md",
                        "producer": "site_manifest",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    page = root / "03_Core_Topics/Synthetic/page.md"
    page.parent.mkdir(parents=True, exist_ok=True)
    page.write_text(page_body, encoding="utf-8")

    (root / "topic_meta.json").write_text(
        json.dumps({"t_synthetic.md": {"safetyLevel": "high", "evidenceIds": list(evidence_ids)}}),
        encoding="utf-8",
    )

    # The validator loads ids through the real registry library, so the synthetic
    # registry has to satisfy the real schema. Copy the shipped one and keep only
    # what the test needs to name.
    real = json.loads((ROOT / "evidence_registry.json").read_text(encoding="utf-8"))
    (root / "evidence_registry.json").write_text(
        json.dumps(real, indent=2) + "\n", encoding="utf-8"
    )

    # registry.py is imported from tools/evidence_registry relative to the repo root.
    tools = root / "tools" / "evidence_registry"
    tools.mkdir(parents=True, exist_ok=True)
    for name in ("registry.py",):
        (tools / name).write_text(
            (REGISTRY_TOOLS / name).read_text(encoding="utf-8"), encoding="utf-8"
        )


def run(root: Path):
    return subprocess.run(
        [sys.executable, str(VALIDATOR), str(root)],
        capture_output=True,
        text=True,
    )


REAL_IDS = ["wesseloo-2016-postpartum-relapse", "vanderkruik-2017-postpartum-psychosis-prevalence"]


class ClaimAnchorContract(unittest.TestCase):
    def test_page_without_anchors_is_not_failed(self):
        """Opt-in: unconverted pages must keep building while anchors spread."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_synthetic_repository(root, "Relapse is 35%.\n", REAL_IDS)
            result = run(root)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_anchor_to_unknown_source_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_synthetic_repository(
                root, "Relapse is 35%[^not-a-real-source].\n", REAL_IDS
            )
            result = run(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("not a source in evidence_registry.json", result.stdout)

    def test_anchor_not_declared_on_the_page_fails(self):
        """A real source anchored on a page that never declared it is still a gap."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_synthetic_repository(
                root,
                "Relapse is 35%[^wesseloo-2016-postpartum-relapse].\n",
                ["vanderkruik-2017-postpartum-psychosis-prevalence"],
            )
            result = run(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("is not in t_synthetic.md's evidenceIds", result.stdout)

    def test_half_anchored_page_fails(self):
        """The core rule: partial anchoring implies the rest was checked."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_synthetic_repository(
                root,
                "Relapse is 35%[^wesseloo-2016-postpartum-relapse]. Incidence is 2 per 1000.\n",
                REAL_IDS,
            )
            result = run(root)
            self.assertEqual(result.returncode, 1)
            self.assertIn("never used as an anchor", result.stdout)
            self.assertIn("vanderkruik-2017-postpartum-psychosis-prevalence", result.stdout)

    def test_fully_anchored_page_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_synthetic_repository(
                root,
                "Relapse is 35%[^wesseloo-2016-postpartum-relapse]. "
                "Incidence 0.9-2.6/1000[^vanderkruik-2017-postpartum-psychosis-prevalence].\n",
                REAL_IDS,
            )
            result = run(root)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("claim anchors OK", result.stdout)

    def test_real_repository_is_clean(self):
        """The shipped curriculum must satisfy the contract it just adopted."""
        result = run(ROOT)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


class AnchorStripping(unittest.TestCase):
    def test_build_strips_anchors_from_shipped_markdown(self):
        """Anchors are reviewer bookkeeping — a learner must never see them."""
        sys.path.insert(0, str(ROOT / "13_Faculty_Resources/_automation/site_build"))
        import common

        with tempfile.TemporaryDirectory() as tmp:
            content = Path(tmp) / "content"
            content.mkdir()
            page = content / "t_synthetic.md"
            page.write_text(
                "Relapse is 35%[^wesseloo-2016-postpartum-relapse] in that group.\n",
                encoding="utf-8",
            )
            changed = common.strip_claim_anchors(tmp, REAL_IDS)
            self.assertEqual(changed, 1)
            self.assertEqual(
                page.read_text(encoding="utf-8"),
                "Relapse is 35% in that group.\n",
            )

    def test_strip_leaves_ordinary_markdown_alone(self):
        sys.path.insert(0, str(ROOT / "13_Faculty_Resources/_automation/site_build"))
        import common

        with tempfile.TemporaryDirectory() as tmp:
            content = Path(tmp) / "content"
            content.mkdir()
            # `arr[^2]` and the regex `[^a-z]` both match the validator's
            # permissive pattern. The build-time strip must leave them alone.
            original = "See [the guide](?page=x.md), `arr[^2]`, `[^a-z]`, and [^Uppercase].\n"
            page = content / "t_synthetic.md"
            page.write_text(original, encoding="utf-8")
            self.assertEqual(common.strip_claim_anchors(tmp, REAL_IDS), 0)
            self.assertEqual(page.read_text(encoding="utf-8"), original)


if __name__ == "__main__":
    unittest.main(verbosity=2)
