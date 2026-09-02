import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Drives every Claude Code hook in .claude/hooks/ with canned tool-call JSON and asserts the
// decision it returns, so the hooks are under the same node suite as everything else.
// Contract: PreToolUse hooks print a permissionDecision JSON or nothing (allow); PostToolUse
// and Stop hooks print {"decision":"block"} or additionalContext or nothing.

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hooks = path.join(repo, '.claude', 'hooks');
const settingsPath = path.join(repo, '.claude', 'settings.json');

function runHook(script, input, { env = {}, cwd = repo } = {}) {
  const proc = spawnSync('python3', [path.join(hooks, script)], {
    cwd,
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: cleanEnv({ CLAUDE_PROJECT_DIR: cwd, ...env }),
    timeout: 120_000,
  });
  assert.equal(proc.status, 0, `${script} exited ${proc.status}: ${proc.stderr}`);
  const out = proc.stdout.trim();
  return out ? JSON.parse(out) : null;
}

const decision = (result) => result?.hookSpecificOutput?.permissionDecision ?? 'allow';
const reason = (result) => result?.hookSpecificOutput?.permissionDecisionReason ?? '';

function editCall(file, newString, cwd = repo) {
  return { hook_event_name: 'PreToolUse', tool_name: 'Edit', cwd, tool_input: { file_path: path.join(cwd, file), old_string: 'x', new_string: newString } };
}

// The crisis number under test is read from the data file so this test never hard-codes one.
const crisis = JSON.parse(fs.readFileSync(path.join(repo, 'crisis_resources.json'), 'utf8'));
const lifeline = crisis.resources.find((r) => /lifeline/i.test(r.name));
const lifelineDigits = lifeline.contact.match(/\d{3,}/)[0];

// Git exports GIT_DIR and friends into hooks; a fixture repo must not inherit them or its
// writes land in the real repository (bin/verify.sh documents the 2026-08-20 incident).
function cleanEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  return env;
}

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clerkship-hooks-'));
  const git = (...args) => {
    const p = spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: cleanEnv() });
    assert.equal(p.status, 0, `git ${args.join(' ')} failed: ${p.stderr}`);
    return p.stdout;
  };
  git('init', '-q');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Fixture');
  git('config', 'commit.gpgsign', 'false');
  return { dir, git };
}

const POINTER = 'version https://git-lfs.github.com/spec/v1\noid sha256:' + 'a'.repeat(64) + '\nsize 12345\n';

// ---------------------------------------------------------------- settings.json

test('settings.json wires every hook to a script that exists', () => {
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const events = Object.keys(settings.hooks);
  assert.deepEqual(events.sort(), ['PostToolUse', 'PreToolUse', 'SessionStart', 'Stop']);
  for (const [event, groups] of Object.entries(settings.hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) {
        assert.equal(hook.type, 'command');
        const m = hook.command.match(/\.claude\/hooks\/([\w.]+)/);
        assert.ok(m, `${event}: command must reference a script under .claude/hooks/: ${hook.command}`);
        assert.ok(fs.existsSync(path.join(hooks, m[1])), `${event}: ${m[1]} missing`);
        assert.ok(hook.command.includes('$CLAUDE_PROJECT_DIR'), `${event}: use $CLAUDE_PROJECT_DIR for the path`);
        assert.equal(typeof hook.timeout, 'number');
      }
    }
  }
});

test('hook scripts carry no hard-coded crisis numbers or machine paths', () => {
  const scripts = fs.readdirSync(hooks).filter((f) => /\.(py|sh)$/.test(f));
  assert.ok(scripts.length >= 6, 'expected the hook scripts to be present');
  for (const file of scripts) {
    const text = fs.readFileSync(path.join(hooks, file), 'utf8');
    assert.ok(!text.includes(lifelineDigits), `${file}: crisis numbers are derived from crisis_resources.json at runtime`);
    assert.doesNotMatch(text, /\/(Users|sessions)\/[a-z]/, `${file}: no machine-specific paths`);
  }
});

// ---------------------------------------------------------------- pre_edit_guard

test('pre_edit_guard denies a crisis contact on a learner surface', () => {
  const r = runHook('pre_edit_guard.py', editCall('03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md', `Call ${lifelineDigits} now.`));
  assert.equal(decision(r), 'deny');
  assert.match(reason(r), /crisis-contact/);
  assert.match(reason(r), /crisis-block/);
});

test('pre_edit_guard allows the same number inside crisis_resources.json and in docs', () => {
  assert.equal(decision(runHook('pre_edit_guard.py', editCall('crisis_resources.json', `"contact": "Call or text ${lifelineDigits}"`))), 'allow');
  assert.equal(decision(runHook('pre_edit_guard.py', editCall('docs/superpowers/specs/x.md', `Deny ${lifelineDigits} in content.`))), 'allow');
});

test('pre_edit_guard denies dose literals only where the QA gate is hard', () => {
  assert.equal(decision(runHook('pre_edit_guard.py', editCall('tools/rp-taper-planner.html', 'start at 5 mg nightly'))), 'deny');
  assert.equal(decision(runHook('pre_edit_guard.py', editCall('_prototypes/sp-interview/sp-interview.pack.json', '"line": "I take 10 mg"'))), 'deny');
  assert.equal(decision(runHook('pre_edit_guard.py', editCall('tools/other-tool.html', 'start at 5 mg nightly'))), 'allow');
});

test('pre_edit_guard denies localStorage keys outside cw_/rp_', () => {
  assert.equal(decision(runHook('pre_edit_guard.py', editCall('tools/x.html', "localStorage.setItem('progress', 1)"))), 'deny');
  assert.equal(decision(runHook('pre_edit_guard.py', editCall('tools/x.html', "localStorage.setItem('cw_progress', 1); localStorage.getItem('rp_flags')"))), 'allow');
  assert.equal(decision(runHook('pre_edit_guard.py', editCall('tests/x.test.mjs', "localStorage.setItem('progress', 1)"))), 'allow');
});

test('pre_edit_guard asks on the PHI heuristic but ignores bibliographic identifiers', () => {
  const phi = runHook('pre_edit_guard.py', editCall('08_Cases_and_Simulation/case-of-the-week/x.md', 'Chart note: MRN on file, DOB recorded.'));
  assert.equal(decision(phi), 'ask');
  assert.match(reason(phi), /phi-heuristic/);
  assert.ok(!/MRN on file/.test(reason(phi)), 'reason must not echo the matched text');
  assert.equal(decision(runHook('pre_edit_guard.py', editCall('08_Cases_and_Simulation/case-of-the-week/x.md', 'See PMID 29792475 and doi:10.1037/pst0000172.'))), 'allow');
});

test('pre_edit_guard asks when an instrument name meets item-shaped text', () => {
  const items = ['PHQ-9 administration notes', '1. first made-up stem used only by this test', '2. second made-up stem used only by this test', '3. third made-up stem used only by this test'].join('\n');
  const r = runHook('pre_edit_guard.py', editCall('02_Clinical_Skills/Screeners/x.md', items));
  assert.equal(decision(r), 'ask');
  assert.match(reason(r), /instrument-reproduction/);
  assert.equal(decision(runHook('pre_edit_guard.py', editCall('02_Clinical_Skills/Screeners/x.md', 'Teach how to give the PHQ-9 and what a negative result fails to rule out.'))), 'allow');
});

test('pre_edit_guard denies machine paths in tracked python', () => {
  const machine = '/' + 'Users' + '/someone/repo';
  assert.equal(decision(runHook('pre_edit_guard.py', editCall('bin/tool.py', `ROOT = "${machine}"`))), 'deny');
  assert.equal(decision(runHook('pre_edit_guard.py', editCall('docs/notes.md', `ROOT = "${machine}"`))), 'allow');
});

test('pre_edit_guard ignores files outside the repository (scratchpad scripts)', () => {
  const machine = '/' + 'Users' + '/someone/repo';
  const outside = path.join(os.tmpdir(), 'clerkship-scratch', 'helper.py');
  const call = { hook_event_name: 'PreToolUse', tool_name: 'Write', cwd: repo, tool_input: { file_path: outside, content: `ROOT = "${machine}"\nprint(${lifelineDigits})` } };
  assert.equal(decision(runHook('pre_edit_guard.py', call)), 'allow');
});

test('pre_edit_guard PHI pass skips script code and the governed shell', () => {
  const tool = '<p>Synthetic case.</p><script>var cacheMs = 86400000; var seed = 12345678;</script>';
  assert.equal(decision(runHook('pre_edit_guard.py', editCall('tools/x.html', tool))), 'allow');
  assert.equal(decision(runHook('pre_edit_guard.py', editCall('13_Faculty_Resources/_automation/site_build/spa_index.html', 'var id = 12345678;'))), 'allow');
  assert.equal(decision(runHook('pre_edit_guard.py', editCall('13_Faculty_Resources/_automation/site_build/frontdoor/fd_data.js', 'var id = 12345678;'))), 'allow');
  assert.equal(decision(runHook('pre_edit_guard.py', editCall('tools/x.html', '<p>Chart MRN 12345678</p>'))), 'ask');
});

test('pre_edit_guard reads Write content and MultiEdit edits, and denies win over asks', () => {
  const write = { hook_event_name: 'PreToolUse', tool_name: 'Write', cwd: repo, tool_input: { file_path: path.join(repo, 'tools/rp-new.html'), content: 'dose 2 mg; MRN noted' } };
  const r = runHook('pre_edit_guard.py', write);
  assert.equal(decision(r), 'deny');
  assert.match(reason(r), /dose-literal/);
  const multi = { hook_event_name: 'PreToolUse', tool_name: 'MultiEdit', cwd: repo, tool_input: { file_path: path.join(repo, 'tools/x.html'), edits: [{ old_string: 'a', new_string: 'fine' }, { old_string: 'b', new_string: "localStorage.setItem('bad', 1)" }] } };
  assert.equal(decision(runHook('pre_edit_guard.py', multi)), 'deny');
});

test('pre_edit_guard allows on malformed or empty input', () => {
  assert.equal(runHook('pre_edit_guard.py', { tool_input: {} }), null);
  assert.equal(runHook('pre_edit_guard.py', editCall('03_Core_Topics/x.md', '')), null);
});

// ---------------------------------------------------------------- lfs_guard

test('lfs_guard denies bulk git staging when git-lfs is absent and media phantoms exist', () => {
  const { dir, git } = tmpRepo();
  fs.writeFileSync(path.join(dir, 'brief.m4a'), POINTER);
  fs.writeFileSync(path.join(dir, 'README.md'), '# fixture\n');
  git('add', '.');
  git('commit', '-q', '-m', 'seed');
  fs.appendFileSync(path.join(dir, 'brief.m4a'), '\n');
  const call = (command) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: dir, tool_input: { command } });
  const env = { CLERKSHIP_FORCE_NO_LFS: '1' };
  assert.equal(decision(runHook('lfs_guard.py', call('git add -A && git commit -m x'), { env, cwd: dir })), 'deny');
  assert.equal(decision(runHook('lfs_guard.py', call('git add brief.m4a'), { env, cwd: dir })), 'deny');
  assert.equal(decision(runHook('lfs_guard.py', call('git checkout -- .'), { env, cwd: dir })), 'deny');
  assert.equal(decision(runHook('lfs_guard.py', call('git add README.md'), { env, cwd: dir })), 'allow');
  assert.equal(decision(runHook('lfs_guard.py', call('git status'), { env, cwd: dir })), 'allow');
  assert.equal(decision(runHook('lfs_guard.py', call('ls -la'), { env, cwd: dir })), 'allow');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------- post_edit_validate

test('post_edit_validate re-syncs AGENTS.md from CLAUDE.md and blocks direct AGENTS.md edits', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clerkship-parity-'));
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# guide v2\n');
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# guide v1\n');
  const call = (file) => ({ hook_event_name: 'PostToolUse', tool_name: 'Edit', cwd: dir, tool_input: { file_path: path.join(dir, file), old_string: 'a', new_string: 'b' }, tool_response: {} });
  const synced = runHook('post_edit_validate.py', call('CLAUDE.md'), { cwd: dir });
  assert.match(synced.hookSpecificOutput.additionalContext, /re-synced/);
  assert.equal(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), '# guide v2\n');
  const blocked = runHook('post_edit_validate.py', call('AGENTS.md'), { cwd: dir });
  assert.equal(blocked.decision, 'block');
  assert.match(blocked.reason, /CLAUDE\.md/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('post_edit_validate runs the registry validator for an edited registry', () => {
  const call = { hook_event_name: 'PostToolUse', tool_name: 'Edit', cwd: repo, tool_input: { file_path: path.join(repo, 'crisis_resources.json'), old_string: 'a', new_string: 'b' }, tool_response: {} };
  const r = runHook('post_edit_validate.py', call);
  assert.ok(r, 'expected a validator note');
  assert.match(r.hookSpecificOutput?.additionalContext ?? r.reason ?? '', /validate_crisis_resources\.py/);
  assert.notEqual(r.decision, 'block', `crisis validator should pass on the committed data: ${r.reason}`);
});

test('post_edit_validate reminds about evidence spans when new text asserts a finding', () => {
  const call = { hook_event_name: 'PostToolUse', tool_name: 'Edit', cwd: repo, tool_input: { file_path: path.join(repo, '03_Core_Topics/Mood/mood_disorders_inpatient_teaching.md'), old_string: 'a', new_string: 'The trial showed a 40% reduction in relapse.' }, tool_response: {} };
  const r = runHook('post_edit_validate.py', call);
  assert.match(r.hookSpecificOutput?.additionalContext ?? '', /sourceSpan/);
  assert.match(r.hookSpecificOutput?.additionalContext ?? '', /attestation|reviewed\.json|sourceSpan/);
});

// ---------------------------------------------------------------- precommit_gate

test('precommit_gate blocks raw media, parity drift, and machine paths in staged content', () => {
  const { dir, git } = tmpRepo();
  const run = () => spawnSync('python3', [path.join(hooks, 'precommit_gate.py')], { cwd: dir, encoding: 'utf8', env: cleanEnv() });

  fs.writeFileSync(path.join(dir, 'raw.mp3'), Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x11, 0x22]));
  git('add', 'raw.mp3');
  let p = run();
  assert.equal(p.status, 1);
  assert.match(p.stdout, /raw media/);
  git('reset', '-q', 'raw.mp3');

  fs.writeFileSync(path.join(dir, 'pointer.mp3'), POINTER);
  git('add', 'pointer.mp3');
  assert.equal(run().status, 0);

  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# v2\n');
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# v1\n');
  git('add', 'CLAUDE.md', 'AGENTS.md');
  p = run();
  assert.equal(p.status, 1);
  assert.match(p.stdout, /parity/);
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# v2\n');
  git('add', 'AGENTS.md');
  assert.equal(run().status, 0);

  fs.writeFileSync(path.join(dir, 'tool.py'), 'ROOT = "' + '/' + 'Users' + '/someone/x"\n');
  git('add', 'tool.py');
  p = run();
  assert.equal(p.status, 1);
  assert.match(p.stdout, /machine-path/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('precommit_gate passes with nothing staged', () => {
  const { dir } = tmpRepo();
  const p = spawnSync('python3', [path.join(hooks, 'precommit_gate.py')], { cwd: dir, encoding: 'utf8', env: cleanEnv() });
  assert.equal(p.status, 0, p.stdout + p.stderr);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------- stop_quick_gate

test('stop_quick_gate blocks once on parity drift and respects stop_hook_active', () => {
  const { dir, git } = tmpRepo();
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# v1\n');
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# v1\n');
  git('add', '.');
  git('commit', '-q', '-m', 'seed');
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# v2\n');
  const call = (active) => ({ hook_event_name: 'Stop', cwd: dir, stop_hook_active: active });
  const r = runHook('stop_quick_gate.py', call(false), { cwd: dir });
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /AGENTS\.md/);
  assert.equal(runHook('stop_quick_gate.py', call(true), { cwd: dir }), null);
  assert.equal(runHook('stop_quick_gate.py', call(false), { cwd: dir, env: { CLERKSHIP_STOP_GATE: 'off' } }), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('install-hooks.sh installs a pre-commit that calls the gate', () => {
  const text = fs.readFileSync(path.join(repo, 'bin', 'install-hooks.sh'), 'utf8');
  assert.match(text, /HOOK_DIR\/pre-commit/);
  assert.match(text, /precommit_gate\.py/);
});
