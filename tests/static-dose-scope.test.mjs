import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = path.join(
  ROOT,
  '13_Faculty_Resources/_automation/site_build/check-static-site.mjs',
);
const MANIFEST = path.join(
  ROOT,
  '13_Faculty_Resources/_automation/site_build/site_manifest.json',
);
const META = '<!-- [CLERKSHIP-META v1] tool="Synthetic" version="1.0" built="2026-08-19" category="test" audience="faculty" settings="self-study" time="1min" clinicalClaim="false" summary="Synthetic dose-scope fixture." -->';
const START = '/* QA-ALLOW-DOSE-START: canonical-topic-meta */';
const END = '/* QA-ALLOW-DOSE-END: canonical-topic-meta */';

function runTool(filename, body) {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'dose-scope-'));
  try {
    fs.mkdirSync(path.join(site, 'tools'));
    fs.writeFileSync(
      path.join(site, 'index.html'),
      '<!doctype html><title>Fixture</title><meta name="viewport" content="width=device-width">',
    );
    fs.writeFileSync(
      path.join(site, 'tools', filename),
      `<!doctype html><title>Fixture</title><meta name="viewport" content="width=device-width">${META}\n<script>\n${body}\n</script>`,
    );
    fs.writeFileSync(
      path.join(site, 'nav.json'),
      JSON.stringify([{ section: 'Fixture', items: [{ t: 'Tool', f: filename, k: 'tool' }] }]),
    );
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    const sources = [...manifest.tools, ...manifest.md, ...(manifest.toolAssets || [])]
      .map(([source]) => source);
    fs.writeFileSync(`${site}.source-map.json`, JSON.stringify({ sources }));
    const result = spawnSync(process.execPath, [CHECKER, site], { encoding: 'utf8' });
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    fs.rmSync(site, { recursive: true, force: true });
    fs.rmSync(`${site}.source-map.json`, { force: true });
  }
}

function doseFindings(output) {
  return output.match(/dose literal in [^\n]+/g) || [];
}

test('ignores only one valid canonical FD_TOPIC_META assignment in the curator', () => {
  const result = runTool(
    'rotation-curator.html',
    `${START}\nvar FD_TOPIC_META={"synthetic":"5 mg canonical teaching metadata"};\n${END}`,
  );
  assert.equal(result.status, 0, result.output);
  assert.deepEqual(doseFindings(result.output), []);
});

test('still reports dose text before and after the canonical payload', () => {
  const result = runTool(
    'rotation-curator.html',
    `var localDefault="4 mg";\n${START}\nvar FD_TOPIC_META={"synthetic":"5 mg canonical teaching metadata"};\n${END}\nvar futureEditorText="6 mg";`,
  );
  const findings = doseFindings(result.output);
  assert.equal(findings.length, 2, result.output);
  assert.match(result.output, /4 mg/);
  assert.match(result.output, /6 mg/);
  assert.doesNotMatch(result.output, /5 mg canonical/);
});

for (const [name, body] of [
  ['missing end', `${START}\nvar FD_TOPIC_META={"synthetic":"5 mg"};`],
  ['missing start', `var FD_TOPIC_META={"synthetic":"5 mg"};\n${END}`],
  ['duplicate pair', `${START}\nvar FD_TOPIC_META={"synthetic":"5 mg"};\n${END}\n${START}\nvar FD_TOPIC_META={"synthetic":"6 mg"};\n${END}`],
  ['nested start', `${START}\n${START}\nvar FD_TOPIC_META={"synthetic":"5 mg"};\n${END}\n${END}`],
  ['non-JSON assignment', `${START}\nvar FD_TOPIC_META={synthetic:"5 mg"};\n${END}`],
]) {
  test(`malformed canonical waiver fails closed: ${name}`, () => {
    const result = runTool('rotation-curator.html', body);
    assert.notEqual(result.status, 0, result.output);
    assert.ok(doseFindings(result.output).length >= 1, result.output);
    assert.match(result.output, /invalid dose-waiver sentinel/i);
  });
}

test('canonical sentinel in an unapproved tool fails and does not waive its dose', () => {
  const result = runTool(
    'other-tool.html',
    `${START}\nvar FD_TOPIC_META={"synthetic":"5 mg"};\n${END}`,
  );
  assert.notEqual(result.status, 0, result.output);
  assert.equal(doseFindings(result.output).length, 1, result.output);
  assert.match(result.output, /invalid dose-waiver sentinel/i);
});

test('legacy whole-file QA-ALLOW-DOSE text cannot waive dose findings', () => {
  const result = runTool(
    'other-tool.html',
    '<!-- QA-ALLOW-DOSE: old broad waiver -->\nvar futureEditorText="5 mg";',
  );
  assert.equal(doseFindings(result.output).length, 1, result.output);
});

test('the retired validated-instrument-line context no longer waives a bfcrs dose line', () => {
  // The context was retired 2026-08-27 with the instrument-rights gate: #400 removed the
  // BFCRS reproduction it waived, so the surviving context could only ever have validated a
  // NEW dose line smuggled back under its sentinels. Both the sentinel and the dose must fail.
  const result = runTool(
    'bfcrs.html',
    '/* QA-ALLOW-DOSE-START: validated-instrument-line */\nvar challenge="lorazepam 2 mg IV";\n/* QA-ALLOW-DOSE-END: validated-instrument-line */',
  );
  assert.notEqual(result.status, 0, result.output);
  assert.equal(doseFindings(result.output).length, 1, result.output);
  assert.match(result.output, /invalid dose-waiver sentinel/i);
});
