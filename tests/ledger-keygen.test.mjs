// ledger-keygen.test.mjs — bin/ledger_keygen.mjs is the one activation step of ADR-003 that only
// the owner runs, and it must never report a key it did not store.
//
// netlify-cli 26 exits 0 and does NOTHING for `env:* --site <id>` outside a linked folder. Probed
// 2026-09-27 on the owner's Mac: `netlify env:list --site <console id>` printed nothing and exited
// 0, while `NETLIFY_SITE_ID=<console id> netlify env:list` listed the console's variables. A keygen
// that trusted `env:set`'s exit code would therefore append the public half to keys.json, discard
// the private half, and leave a console that refuses to start once ATTEST_LEDGER=on — after the
// one step nobody else may run. The stub CLI below reproduces that behaviour, and never returns a
// secret's value (Netlify returns a placeholder), so the only proof a write landed is the
// variable's `updated_at` moving.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { keyIdOf } from '../faculty-console/ledger.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONSOLE_SITE_ID = '295ae8dd-412c-47ad-aac3-7e7cd4b3110d';
// The script resolves keys.json from its own location, so it runs from a sandboxed copy of
// itself and its imports; the repository's real keys.json is never opened for writing.
const COPIED = [
  'bin/ledger_keygen.mjs',
  'faculty-console/ledger.mjs',
  'faculty-console/attestation-hash.mjs',
];

// A stand-in for netlify-cli 26, driven by STUB_MODE:
//   cli26     — honours NETLIFY_SITE_ID; `--site` alone is ignored (exit 0, silent, nothing done)
//   noop      — `env:set` exits 0 and writes nothing, even with NETLIFY_SITE_ID
//   widen     — `env:set` lands, but in the `all` context whatever was asked for
//   loggedout — every `api` call fails the way netlify-cli does when no one is logged in
const STUB = String.raw`'use strict';
const fs = require('node:fs');
const argv = process.argv.slice(2);
const stateFile = process.env.STUB_STATE;
const mode = process.env.STUB_MODE || 'cli26';
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
state.calls.push({
  argv: argv.map(arg => (arg.length > 60 ? '<long>' : arg)),
  siteEnv: process.env.NETLIFY_SITE_ID || null,
});
save();

function values(flag) {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== flag) continue;
    for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j += 1) out.push(argv[j]);
  }
  return out;
}
function data() {
  return JSON.parse(argv[argv.indexOf('--data') + 1]);
}
function notFound() {
  process.stderr.write(' ›   JSONHTTPError: Not Found\n');
  process.exit(1);
}

if (argv[0] === 'api' && mode === 'loggedout') {
  process.stderr.write(' ›   Error: Not logged in. Please log in to run this command.\n');
  process.exit(1);
}

if (argv[0] === 'api' && argv[1] === 'getSite') {
  const site = state.sites[data().site_id];
  if (!site) notFound();
  process.stdout.write(JSON.stringify({ id: data().site_id, name: site.name, account_id: site.account_id }));
  process.exit(0);
}
if (argv[0] === 'api' && argv[1] === 'getEnvVar') {
  const query = data();
  const site = state.sites[query.site_id];
  if (!site || site.account_id !== query.account_id || !site.env[query.key]) notFound();
  const variable = site.env[query.key];
  process.stdout.write(JSON.stringify({
    key: query.key,
    is_secret: variable.is_secret,
    scopes: variable.scopes,
    updated_at: variable.updated_at,
    values: variable.contexts.map(context => ({
      context,
      value: variable.is_secret ? 'placeholder-not-the-value' : variable.value,
    })),
  }));
  process.exit(0);
}
if (argv[0] === 'env:set') {
  const siteId = process.env.NETLIFY_SITE_ID;
  if (!siteId || mode === 'noop') process.exit(0);
  const site = state.sites[siteId];
  if (!site) {
    process.stderr.write('Project not found\n');
    process.exit(1);
  }
  state.clock += 1;
  site.env[argv[1]] = {
    value: argv[2],
    is_secret: argv.includes('--secret'),
    scopes: values('--scope'),
    contexts: mode === 'widen' ? ['all'] : values('--context'),
    updated_at: new Date(Date.UTC(2026, 8, 27, 12, 0, state.clock)).toISOString(),
  };
  save();
  process.stdout.write('Set environment variable ' + argv[1] + '\n');
  process.exit(0);
}
process.stderr.write('stub: unhandled ' + argv.join(' ') + '\n');
process.exit(3);
`;

function consoleSite(env = {}) {
  return {
    [CONSOLE_SITE_ID]: { name: 'clerkship-faculty-attest', account_id: 'acct-1', env },
  };
}

function activeKeysDoc() {
  const { publicKey } = generateKeyPairSync('ed25519');
  return {
    version: 1,
    keys: [{
      keyId: keyIdOf(publicKey),
      algorithm: 'ed25519',
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
      addedAt: '2026-09-01',
      revokedAt: null,
    }],
  };
}

function fixture(t, {
  mode = 'cli26', sites = consoleSite(), keys = { version: 1, keys: [] }, cliOnPath = true,
} = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-keygen-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const rel of COPIED) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel));
  }
  const keysFile = path.join(dir, '13_Faculty_Resources/ledger/keys.json');
  fs.mkdirSync(path.dirname(keysFile), { recursive: true });
  fs.writeFileSync(keysFile, `${JSON.stringify(keys, null, 2)}\n`);

  const bin = path.join(dir, 'stubbin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'netlify-stub.cjs'), STUB);
  fs.writeFileSync(
    path.join(bin, 'netlify'),
    `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/netlify-stub.cjs" "$@"\n`,
    { mode: 0o755 },
  );
  const stateFile = path.join(dir, 'netlify-state.json');
  fs.writeFileSync(stateFile, JSON.stringify({ clock: 0, calls: [], sites }));

  // cliOnPath: false is the owner's 2026-09-28 run: a non-interactive shell that never read
  // ~/.zshrc, so no `netlify` anywhere on PATH. The script itself runs by absolute node path.
  const emptyBin = path.join(dir, 'emptybin');
  fs.mkdirSync(emptyBin);
  const env = { ...process.env, PATH: cliOnPath ? `${bin}${path.delimiter}${process.env.PATH}` : emptyBin };
  delete env.NETLIFY_SITE_ID;
  Object.assign(env, { STUB_STATE: stateFile, STUB_MODE: mode });
  return {
    keysFile,
    run: (...args) => spawnSync(process.execPath, [path.join(dir, 'bin/ledger_keygen.mjs'), ...args], {
      cwd: dir, encoding: 'utf8', env,
    }),
    state: () => JSON.parse(fs.readFileSync(stateFile, 'utf8')),
    keysText: () => fs.readFileSync(keysFile, 'utf8'),
  };
}

function publicKeyIdOfStored(stored) {
  const privateKey = createPrivateKey({
    key: Buffer.from(stored.value, 'base64'), format: 'der', type: 'pkcs8',
  });
  return keyIdOf(createPublicKey(privateKey));
}

test('stores the key on the console by NETLIFY_SITE_ID, then records its public half', t => {
  const f = fixture(t);
  const r = f.run('--install');
  assert.equal(r.status, 0, r.stderr);

  const stored = f.state().sites[CONSOLE_SITE_ID].env.LEDGER_SIGNING_KEY;
  assert.ok(stored, 'the private key reached the console site (netlify-cli 26 ignores --site)');
  assert.equal(stored.is_secret, true);
  assert.deepEqual(stored.contexts, ['production'], 'deploy previews must not be able to sign');
  assert.deepEqual(stored.scopes, ['functions']);

  const keys = JSON.parse(f.keysText()).keys;
  assert.equal(keys.length, 1);
  assert.equal(keys[0].keyId, publicKeyIdOfStored(stored),
    'keys.json holds the public half of exactly the key Netlify stored');
  assert.ok(!`${r.stdout}${r.stderr}`.includes(stored.value), 'the private key is never printed');
  assert.match(r.stdout, /clerkship-faculty-attest/, 'the confirmation names the site it wrote to');
});

test('a write that does not land leaves keys.json untouched and exits 1', t => {
  const f = fixture(t, { mode: 'noop' });
  const before = f.keysText();
  const r = f.run('--install');
  assert.equal(r.status, 1, `expected a refusal, got: ${r.stdout}`);
  assert.equal(f.keysText(), before, 'no public key is recorded for a key Netlify never stored');
  assert.match(r.stderr, /did not land/i);
});

test('an existing variable is not proof: a rotation must see updated_at move', t => {
  const existing = {
    value: 'old-secret', is_secret: true, scopes: ['functions'], contexts: ['production'],
    updated_at: '2026-09-01T00:00:00.000Z',
  };
  const f = fixture(t, { mode: 'noop', sites: consoleSite({ LEDGER_SIGNING_KEY: existing }), keys: activeKeysDoc() });
  const before = f.keysText();
  const r = f.run('--install', '--rotate');
  assert.equal(r.status, 1, `expected a refusal, got: ${r.stdout}`);
  assert.equal(f.keysText(), before);
});

test('a rotation that lands appends a second key and keeps the first', t => {
  const existing = {
    value: 'old-secret', is_secret: true, scopes: ['functions'], contexts: ['production'],
    updated_at: '2026-09-01T00:00:00.000Z',
  };
  const f = fixture(t, { sites: consoleSite({ LEDGER_SIGNING_KEY: existing }), keys: activeKeysDoc() });
  const r = f.run('--install', '--rotate');
  assert.equal(r.status, 0, r.stderr);
  const stored = f.state().sites[CONSOLE_SITE_ID].env.LEDGER_SIGNING_KEY;
  const keys = JSON.parse(f.keysText()).keys;
  assert.equal(keys.length, 2);
  assert.equal(keys[1].keyId, publicKeyIdOfStored(stored));
});

test('a secret that landed outside production is refused, with the way to remove it', t => {
  const f = fixture(t, { mode: 'widen' });
  const before = f.keysText();
  const r = f.run('--install');
  assert.equal(r.status, 1, `expected a refusal, got: ${r.stdout}`);
  assert.equal(f.keysText(), before);
  assert.match(r.stderr, /env:unset LEDGER_SIGNING_KEY/);
});

test('a site the CLI cannot read stops the run before any key exists', t => {
  const f = fixture(t, { sites: {} });
  const before = f.keysText();
  const r = f.run('--install');
  assert.equal(r.status, 1);
  assert.equal(f.keysText(), before);
  assert.equal(f.state().calls.some(call => call.argv[0] === 'env:set'), false,
    'nothing is stored when the target cannot even be read');
  // A refusal the owner can act on, not a crash that happens to exit 1 before the write.
  assert.match(r.stderr, /Could not read Netlify site .*no key was made/);
  assert.doesNotMatch(r.stderr, /TypeError|at main \(/);
});

test('a netlify CLI missing from PATH is named as the cause, not blamed on the site', t => {
  const f = fixture(t, { cliOnPath: false });
  const before = f.keysText();
  const r = f.run('--install');
  assert.equal(r.status, 1);
  assert.equal(f.keysText(), before);
  assert.match(r.stderr, /netlify CLI was not found on PATH/);
  assert.match(r.stderr, /~\/\.zshrc|interactive/, 'says why a working CLI can be invisible here');
});

test('a CLI that fails is quoted, so a logged-out CLI reads as logged out', t => {
  const f = fixture(t, { mode: 'loggedout' });
  const r = f.run('--install');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Not logged in/);
  assert.equal(f.state().calls.some(call => call.argv[0] === 'env:set'), false);
});

test('without --install it refuses, and there is still no mode that prints a key', t => {
  const f = fixture(t);
  const r = f.run();
  assert.equal(r.status, 2);
  assert.equal(f.state().calls.length, 0);
});
