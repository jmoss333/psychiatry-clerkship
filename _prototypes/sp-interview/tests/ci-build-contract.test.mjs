import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MANIFEST = path.join(
  ROOT,
  '13_Faculty_Resources/_automation/site_build/site_manifest.json',
);
const BUILD = path.join(
  ROOT,
  '13_Faculty_Resources/_automation/site_build/build_deploy.py',
);
const CHECKER = path.join(
  ROOT,
  '13_Faculty_Resources/_automation/site_build/check-static-site.mjs',
);
const CI = path.join(ROOT, '.github/workflows/ci.yml');

const EXPECTED_ASSETS = [
  ['_prototypes/sp-interview/sp-interview.pack.json', 'sp-interview.pack.json'],
  ['_prototypes/sp-interview/sp-interview.voice.js', 'sp-interview.voice.js'],
];

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
}

test('manifest drives both Interview Room runtime assets into a real site build', () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  assert.deepEqual(manifest.toolAssets, EXPECTED_ASSETS);
  for (const [source] of EXPECTED_ASSETS) {
    assert.equal(fs.existsSync(path.join(ROOT, source)), true, `missing source asset: ${source}`);
  }

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-build-contract-'));
  const output = path.join(temporary, 'site');
  try {
    const result = run('python3', [BUILD], {
      env: { ...process.env, OUT_DIR: output },
      timeout: 60_000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (const [, destination] of EXPECTED_ASSETS) {
      assert.equal(
        fs.existsSync(path.join(output, 'tools', destination)),
        true,
        `built site omitted tools/${destination}`,
      );
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
    fs.rmSync(`${output}.source-map.json`, { force: true });
  }
});

test('static QA rejects a missing relative script dependency', () => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-static-contract-'));
  const sourceMap = `${site}.source-map.json`;
  const tools = path.join(site, 'tools');
  fs.mkdirSync(tools);
  fs.writeFileSync(
    path.join(tools, 'fixture.html'),
    '<!doctype html><title>Fixture</title><meta name="viewport" content="width=device-width"><!-- [RC-META] --><script src="./missing.js"></script>',
  );
  fs.writeFileSync(
    path.join(site, 'nav.json'),
    JSON.stringify([{ section: 'Fixture', items: [{ k: 'tool', f: 'fixture.html' }] }]),
  );
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  fs.writeFileSync(
    sourceMap,
    JSON.stringify({ sources: [...manifest.tools, ...manifest.md].map(([source]) => source) }),
  );
  try {
    const missing = run(process.execPath, [CHECKER, site]);
    assert.equal(missing.status, 1, missing.stdout + missing.stderr);
    assert.match(missing.stdout + missing.stderr, /missing relative script source.*missing\.js/i);

    fs.writeFileSync(path.join(tools, 'missing.js'), 'export {};\n');
    const present = run(process.execPath, [CHECKER, site]);
    assert.equal(present.status, 0, present.stdout + present.stderr);
  } finally {
    fs.rmSync(site, { recursive: true, force: true });
    fs.rmSync(sourceMap, { force: true });
  }
});

// F24 — shipped JS toolAssets (e.g. sp-interview.voice.js) were never scanned;
// only tools/*.html was read. A CDN dependency inside a shipped script blanks
// the tool on offline/ward networks the same way one in the HTML would.
test('static QA rejects a CDN dependency inside a shipped JS asset', () => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-static-js-'));
  const sourceMap = `${site}.source-map.json`;
  const tools = path.join(site, 'tools');
  fs.mkdirSync(tools);
  fs.writeFileSync(
    path.join(tools, 'fixture.html'),
    '<!doctype html><title>Fixture</title><meta name="viewport" content="width=device-width"><!-- [RC-META] --><script src="./fixture.js"></script>',
  );
  fs.writeFileSync(
    path.join(tools, 'fixture.js'),
    'const cdn = "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js";\n',
  );
  fs.writeFileSync(
    path.join(site, 'nav.json'),
    JSON.stringify([{ section: 'Fixture', items: [{ k: 'tool', f: 'fixture.html' }] }]),
  );
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  fs.writeFileSync(
    sourceMap,
    JSON.stringify({ sources: [...manifest.tools, ...manifest.md].map(([source]) => source) }),
  );
  try {
    const flagged = run(process.execPath, [CHECKER, site]);
    assert.equal(flagged.status, 1, flagged.stdout + flagged.stderr);
    assert.match(flagged.stdout + flagged.stderr, /external CDN dependency in tools\/fixture\.js/i);

    fs.writeFileSync(path.join(tools, 'fixture.js'), 'export {};\n');
    const clean = run(process.execPath, [CHECKER, site]);
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  } finally {
    fs.rmSync(site, { recursive: true, force: true });
    fs.rmSync(sourceMap, { force: true });
  }
});

const SMOKE_LAUNCHER_COMMAND = 'bash tests/smoke/start-local-servers.sh';
const SMOKE_CONFIGURATION_PATTERN = /\bSMOKE_(?:MS3_PORT|RES_PORT|FACULTY_PORT|MS3_DIR|RES_DIR|FACULTY_DIR|READY_ATTEMPTS|READY_DELAY_SECONDS|READY_PATH|SERVER_STATE_DIR)\b/;

function leadingIndent(line) {
  return line.length - line.trimStart().length;
}

function extractRunSteps(source) {
  const sourceLines = source.split(/\r?\n/);
  const steps = [];
  for (let index = 0; index < sourceLines.length; index += 1) {
    const sourceLine = sourceLines[index];
    const blockRun = sourceLine.match(/^(\s*)(-\s+)?run:\s*([|>][+-]?)\s*$/);
    if (blockRun) {
      const runIndent = blockRun[1].length + (blockRun[2]?.length ?? 0);
      const lines = [];
      let endLine = index;
      for (let bodyIndex = index + 1; bodyIndex < sourceLines.length; bodyIndex += 1) {
        const bodyLine = sourceLines[bodyIndex];
        if (bodyLine.trim() && leadingIndent(bodyLine) <= runIndent) break;
        lines.push({ text: bodyLine.trim(), sourceLine: bodyIndex });
        endLine = bodyIndex;
      }
      steps.push({ startLine: index, endLine, lines });
      index = endLine;
      continue;
    }

    const inlineRun = sourceLine.match(/^(\s*)(-\s+)?run:\s+(.+?)\s*$/);
    if (!inlineRun) continue;
    steps.push({
      startLine: index,
      endLine: index,
      lines: [{ text: inlineRun[3], sourceLine: index }],
    });
  }
  return steps;
}

function countExactLines(lines, marker) {
  return lines.filter((line) => line.text === marker).length;
}

function hasExactLine(lines, marker) {
  return lines.some((line) => line.text === marker);
}

function countRunCommands(runSteps, command) {
  return runSteps.reduce(
    (count, step) => count + countExactLines(step.lines, command),
    0,
  );
}

function extractWorkflowJob(ci, jobName) {
  const lines = ci.split(/\r?\n/);
  const header = `  ${jobName}:`;
  const start = lines.findIndex((line) => line === header);
  assert.notEqual(start, -1, `${jobName} workflow job must exist`);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function uniqueCommandPosition(runSteps, command) {
  const matches = [];
  for (const step of runSteps) {
    for (const line of step.lines) {
      if (line.text === command) matches.push(line.sourceLine);
    }
  }
  assert.equal(matches.length, 1, `${command} must run exactly once in the smoke-tests job`);
  return matches[0];
}

function assertSmokeLauncherContract(ci) {
  const allRunSteps = extractRunSteps(ci);
  assert.equal(
    countRunCommands(allRunSteps, SMOKE_LAUNCHER_COMMAND),
    1,
    'tested smoke-server launcher must run exactly once in CI',
  );
  const activeCi = ci
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .join('\n');
  assert.doesNotMatch(
    activeCi,
    SMOKE_CONFIGURATION_PATTERN,
    'CI must use the launcher default ports, directories, and readiness controls',
  );
  for (const step of allRunSteps) {
    for (const line of step.lines) {
      if (line.text.startsWith('#')) continue;
      assert.doesNotMatch(
        line.text,
        /\bpython3\s+-m\s+http\.server(?:\s|$)/,
        'CI must not duplicate smoke-server startup outside the tested launcher',
      );
    }
  }

  const smokeJob = extractWorkflowJob(ci, 'smoke-tests');
  const smokeRunSteps = extractRunSteps(smokeJob);
  const ordered = [
    'bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3',
    'bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res',
    'npm ci',
    'npx playwright install chromium --with-deps',
    SMOKE_LAUNCHER_COMMAND,
    'npx playwright test --project=nav-ms3 --project=nav-res',
    'npx playwright test --project=interview-room',
    'npx playwright test --project=faculty-console',
    'npx playwright test --project=lfs',
    'npx playwright test --project=visual',
  ];
  let prior = -1;
  for (const command of ordered) {
    const position = uniqueCommandPosition(smokeRunSteps, command);
    assert.ok(position > prior, `${command} must follow the preceding smoke-job command`);
    prior = position;
  }
  assert.match(
    smokeJob,
    /SP_INTERVIEW_BASE_URL:\s*http:\/\/localhost:4200\/tools\//,
  );
}

test('CI gates and tested smoke launcher are structurally ordered', () => {
  const ci = fs.readFileSync(CI, 'utf8');
  const ciLines = ci.split(/\r?\n/);
  const managedGateOrder = [
    '- uses: actions/setup-node@v4',
    'node-version: "20"',
    'run: npm --prefix sp-proxy ci',
    'npm --prefix sp-proxy test',
    'bash _prototypes/sp-interview/tests/run-all.sh',
    'python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py',
    'run: bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3',
    'run: bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh res',
  ];
  let prior = -1;
  for (const marker of managedGateOrder) {
    const index = ciLines.findIndex((line) => line.trim() === marker);
    assert.ok(index > prior, `${marker} must occur after the preceding managed-SP gate`);
    prior = index;
  }
  assertSmokeLauncherContract(ci);
});

test('smoke launcher contract ignores labels and rejects boundary drift', () => {
  const ci = fs.readFileSync(CI, 'utf8');
  const relabeled = ci.replace(
    /(\n\s*- name: )[^\n]+(\n\s+run: bash tests\/smoke\/start-local-servers\.sh)/,
    '$1Arbitrary wording that must not affect behavior$2',
  );
  assert.notEqual(relabeled, ci, 'test fixture must relabel the launcher step');
  assert.doesNotThrow(() => assertSmokeLauncherContract(relabeled));

  const overridden = ci.replace(
    `        run: ${SMOKE_LAUNCHER_COMMAND}`,
    `        env:\n          SMOKE_MS3_PORT: "4300"\n        run: ${SMOKE_LAUNCHER_COMMAND}`,
  );
  assert.notEqual(overridden, ci, 'test fixture must add a launcher override');
  assert.throws(
    () => assertSmokeLauncherContract(overridden),
    /must use the launcher default ports, directories, and readiness controls/,
  );

  assert.throws(
    () => assertSmokeLauncherContract(ci.replace(SMOKE_LAUNCHER_COMMAND, 'echo launcher-removed')),
    /launcher must run exactly once/,
  );

  const duplicated = ci.replace(
    `run: ${SMOKE_LAUNCHER_COMMAND}`,
    `run: |\n          ${SMOKE_LAUNCHER_COMMAND}\n          ${SMOKE_LAUNCHER_COMMAND}`,
  );
  assert.throws(
    () => assertSmokeLauncherContract(duplicated),
    /launcher must run exactly once/,
  );

  const withoutLauncherStep = ci.replace(
    /\n\s*- name: [^\n]+\n\s+run: bash tests\/smoke\/start-local-servers\.sh\n/,
    '\n',
  );
  assert.notEqual(withoutLauncherStep, ci, 'test fixture must remove the launcher step');
  const movedBeforeBuild = withoutLauncherStep.replace(
    '          bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3',
    `          ${SMOKE_LAUNCHER_COMMAND}\n          bash 13_Faculty_Resources/_automation/site_build/build_and_check.sh ms3`,
  );
  assert.notEqual(movedBeforeBuild, withoutLauncherStep, 'test fixture must move the launcher before builds');
  assert.throws(
    () => assertSmokeLauncherContract(movedBeforeBuild),
    /must follow the preceding smoke-job command/,
  );

  for (const projectCommand of [
    'npx playwright test --project=nav-ms3 --project=nav-res',
    'npx playwright test --project=interview-room',
    'npx playwright test --project=faculty-console',
    'npx playwright test --project=lfs',
    'npx playwright test --project=visual',
  ]) {
    const movedProject = ci
      .replace(projectCommand, '')
      .replace(
        `run: ${SMOKE_LAUNCHER_COMMAND}`,
        `run: |\n          ${projectCommand}\n          ${SMOKE_LAUNCHER_COMMAND}`,
      );
    assert.throws(
      () => assertSmokeLauncherContract(movedProject),
      /must follow the preceding smoke-job command/,
    );
  }

  const duplicatedInlineServer = ci.replace(
    `run: ${SMOKE_LAUNCHER_COMMAND}`,
    `run: |\n          ${SMOKE_LAUNCHER_COMMAND}\n          cd _build/ms3 && python3   -m http.server 4200 &`,
  );
  assert.throws(
    () => assertSmokeLauncherContract(duplicatedInlineServer),
    /must not duplicate smoke-server startup/,
  );
});

// F26's other half: CI invoking run-all.sh (locked above) only helps if
// run-all.sh itself keeps every suite wired — deleting one line would
// silently re-orphan a test with CI green.
test('run-all.sh keeps the review-filter suite wired', () => {
  const runAll = fs.readFileSync(
    path.join(ROOT, '_prototypes/sp-interview/tests/run-all.sh'),
    'utf8',
  );
  assert.match(
    runAll,
    /node review-filter\.test\.mjs/,
    'review-filter.test.mjs must stay invoked by run-all.sh',
  );
});

// F25 — a gate that runs but can never fail the build is worse than no gate. The
// order test above does not catch a step neutered with `|| true` / continue-on-error.
function assertCiGatesFailClosed(ci) {
  assert.equal(/\|\|\s*true\b/.test(ci), false, 'no CI step may mask failure with "|| true"');
  assert.equal(/continue-on-error:\s*true/.test(ci), false, 'no CI step may continue-on-error');
  assert.equal(/^\s*set \+e\b/m.test(ci), false, 'no CI step may disable errexit with "set +e"');

  // The managed-proxy/interview gate runs all three suites in one errexit shell
  // (GitHub Actions default bash -e), so any single failure fails the job.
  const runSteps = extractRunSteps(ci);
  const commands = [
    'npm --prefix sp-proxy test',
    'bash _prototypes/sp-interview/tests/run-all.sh',
    'python3 13_Faculty_Resources/_automation/test_validate_attestation_consistency.py',
  ];
  for (const command of commands) {
    assert.equal(
      countRunCommands(runSteps, command),
      1,
      `SP gate must run ${command} exactly once`,
    );
  }
  const gates = runSteps.filter((step) => (
    commands.every((command) => hasExactLine(step.lines, command))
  ));
  assert.equal(gates.length, 1, 'SP managed-proxy gate commands must share one run block');
}

test('CI gates fail the build — no step swallows a nonzero exit', () => {
  const ci = fs.readFileSync(CI, 'utf8');
  assertCiGatesFailClosed(ci);
});

test('managed SP fail-closed gate ignores workflow labels', () => {
  const ci = fs.readFileSync(CI, 'utf8');
  const relabeled = ci
    .replace('Test — SP Interview and managed proxy', 'Arbitrary managed test wording')
    .replace('Build + static QA gate (ms3)', 'Arbitrary managed build wording');
  for (const label of [
    'Test — SP Interview and managed proxy',
    'Build + static QA gate (ms3)',
  ]) {
    assert.equal(relabeled.includes(label), false, `test fixture must relabel ${label}`);
  }
  assert.doesNotThrow(() => assertCiGatesFailClosed(relabeled));
});
