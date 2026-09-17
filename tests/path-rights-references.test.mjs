// A rights reference is a page that exists to say an instrument is NOT reproduced here
// (curriculum.rightsReferences, kept in lockstep with instrument_rights.json). It belongs in the
// Library — the custodian route INV-IR2 requires — but it is not a learning-path STEP: a
// checklist row that opens a "this page no longer reproduces the scale" stub is a dead end the
// learner is asked to tick. The 2026-08-27 production audit found both stubs sitting on the
// paths (cssrs.html on MS3 Week 5, bfcrs.html on resident Week 1); this pins them off.
//
// Reads the REAL curriculum.json, not a fixture: the contract is about the shipped paths.
// validate_curriculum.py enforces the same rule at build time; this is the node-suite twin so a
// red shows up in `node --test` before anyone reaches the build.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const CUR = JSON.parse(readFileSync(new URL('../curriculum.json', import.meta.url), 'utf8'));

test('no rights reference is a learning-path item on either audience', () => {
  const rights = new Set(CUR.rightsReferences || []);
  assert.ok(rights.size > 0, 'the rights contract must name at least one page');
  const offenders = [];
  for (const [site, path] of Object.entries(CUR.learningPaths || {})) {
    for (const week of path.weeks || []) {
      for (const item of week.items || []) {
        if (rights.has(item.ref)) offenders.push(`${site} week ${week.n}: ${item.ref}`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'rights references may live in the Library, never on a path');
});

test('every rights reference stays reachable from a Library column', () => {
  // Removing a stub from the path must not remove the route: the official form and training
  // links live on these pages, and dropping them from the Library too would strand them.
  const placed = new Set();
  for (const column of CUR.libraryColumns || []) for (const ref of column.refs || []) placed.add(ref);
  for (const ref of CUR.rightsReferences || []) {
    assert.ok(placed.has(ref), `${ref} must be placed in a Library column`);
  }
});
