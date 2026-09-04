/**
 * The learner's search scorer lives in spa_index.html. A second copy lives in
 * site_build/check_search_quality.py, which is the gate that decides whether search
 * still answers the queries students type on the unit.
 *
 * Two copies of a scorer is a drift risk with a specific, quiet failure mode: tune one
 * and not the other, and every case in the gate starts asserting against a ranking no
 * learner ever sees. The gate stays green while search gets worse. This is the same
 * shape common.py already de-duplicated for the tokenizer, the stopword set and the
 * synonym table — 22 of 37 synonym groups had silently diverged between the two sites
 * before that extraction.
 *
 * Full behavioural parity across a JS and a Python implementation is a bigger job than
 * one test file. What this pins is the parameter that will actually be edited: the
 * length-normalisation pivot introduced in WP-6b, and the fields it reads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPA = join(ROOT, "13_Faculty_Resources/_automation/site_build/spa_index.html");
const GATE = join(ROOT, "13_Faculty_Resources/_automation/site_build/check_search_quality.py");

const spa = readFileSync(SPA, "utf8");
const gate = readFileSync(GATE, "utf8");

test("the length-normalisation pivot is the same number in both scorers", () => {
  const inSpa = spa.match(/var\s+LEN_NORM_B\s*=\s*([0-9.]+)\s*;/);
  const inGate = gate.match(/^LEN_NORM_B\s*=\s*([0-9.]+)\s*$/m);
  assert.ok(inSpa, "spa_index.html must declare `var LEN_NORM_B=<number>;`");
  assert.ok(inGate, "check_search_quality.py must declare `LEN_NORM_B = <number>`");
  assert.equal(
    Number(inSpa[1]),
    Number(inGate[1]),
    "LEN_NORM_B diverged: the gate would assert against a ranking learners never see",
  );
});

test("the pivot is a real pivot — b in (0, 1]", () => {
  const b = Number(spa.match(/var\s+LEN_NORM_B\s*=\s*([0-9.]+)\s*;/)[1]);
  assert.ok(b > 0 && b <= 1, `LEN_NORM_B must be in (0, 1], got ${b}`);
});

test("both scorers read the same two index fields", () => {
  for (const [label, text, avg, len] of [
    ["spa_index.html", spa, "SI.avgLen", "d.L"],
    ["check_search_quality.py", gate, 'index.get("avgLen")', '.get("L")'],
  ]) {
    assert.ok(text.includes(avg), `${label} must read the index's avgLen`);
    assert.ok(text.includes(len), `${label} must read each doc's L (token count)`);
  }
});

test("both scorers fall back to no normalisation on a pre-avgLen index", () => {
  // A cached search-index.json built before WP-6b has neither avgLen nor L. Both
  // scorers must then divide by 1 and reproduce the old ranking exactly, rather
  // than dividing by zero or by an undefined that poisons every score to NaN.
  assert.match(spa, /if\s*\(\s*avg\s*<=\s*0\s*\|\|\s*L\s*<=\s*0\s*\)\s*return\s+1\s*;/);
  assert.match(gate, /if\s+avg_len\s*<=\s*0\s+or\s+length\s*<=\s*0\s*:\s*\n\s*return\s+1\.0/);
});
