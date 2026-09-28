#!/usr/bin/env node
/**
 * bin/ledger_keygen.mjs — create the attestation ledger's signing key (ADR-003, activation step 1).
 *
 *   node bin/ledger_keygen.mjs --install            first key
 *   node bin/ledger_keygen.mjs --install --rotate   add a replacement key (the old one stays valid)
 *
 * WHAT IT DOES, IN ORDER, AND WHAT IT NEVER DOES:
 *   1. reads the target site through the Netlify CLI, and stops before any key exists if it
 *      cannot (not logged in, wrong account, unknown site);
 *   2. generates an Ed25519 key pair in memory;
 *   3. stores the PRIVATE half as the faculty console's `LEDGER_SIGNING_KEY` — a Netlify
 *      SECRET (write-only: the UI, CLI and API never show it again), PRODUCTION context only
 *      (deploy previews run pull-request code and must not be able to sign), functions scope
 *      only. It goes straight from memory to `netlify env:set`; it is never printed, never
 *      written to disk, and never passes through an AI session;
 *   4. confirms the write LANDED — the variable's `updated_at` moved, and it sits in production
 *      only — because a zero exit from `env:set` proves nothing (see netlify() below);
 *   5. only then appends the PUBLIC half to 13_Faculty_Resources/ledger/keys.json.
 *
 * Run it YOURSELF, on your own machine, logged in to the Netlify CLI. keys.json then goes to
 * main through one ordinary pull request (it is governance), and the console needs one
 * redeploy to see the new secret. Until both have happened the console refuses to sign, with
 * a message pointing here — it cannot sign with a key the builds cannot verify.
 */

import fs from 'node:fs';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { KEYS_PATH, keyIdOf, parseKeys } from '../faculty-console/ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONSOLE_SITE_ID = '295ae8dd-412c-47ad-aac3-7e7cd4b3110d'; // clerkship-faculty-attest
const SECRET_NAME = 'LEDGER_SIGNING_KEY';

/**
 * One netlify-cli call aimed at `site`.
 *
 * The site travels in NETLIFY_SITE_ID because netlify-cli 26 IGNORES `--site <id>` on `env:*`
 * outside a linked folder: exit 0, no output, nothing done. Probed 2026-09-27 — `netlify env:list
 * --site <console id>` printed nothing, `NETLIFY_SITE_ID=<console id> netlify env:list` listed the
 * console's variables. Trusting the exit code, this script used to report "stored" for a key it
 * never stored, write the public half to keys.json, and discard the private half — leaving a
 * console that refuses to start once ATTEST_LEDGER=on. `--site` stays on the argv for CLI versions
 * that honour it; the two agree (probed together, same site).
 */
function netlify(args, site) {
  return spawnSync('netlify', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NETLIFY_SITE_ID: site },
  });
}

/** `netlify api <method>`: the parsed response, `notFound`, or a failure. Never throws. */
function netlifyApi(method, data, site) {
  const result = netlify(['api', method, '--data', JSON.stringify(data)], site);
  if (result.status !== 0) {
    const said = `${result.stderr || ''}${result.stdout || ''}`;
    return { failed: true, notFound: /not found/i.test(said), missingCli: result.error?.code === 'ENOENT' };
  }
  try {
    return { json: JSON.parse(result.stdout) };
  } catch {
    return { failed: true };
  }
}

/** The site's name and account, or null when the CLI cannot read it. */
function readSite(site) {
  const response = netlifyApi('getSite', { site_id: site }, site);
  const accountId = response.json?.account_id;
  if (typeof accountId !== 'string' || !accountId) return null;
  return { name: String(response.json.name || site), accountId };
}

/**
 * The signing-key variable as Netlify describes it — when it last changed, whether it is a
 * secret, and in which contexts — or null when it does not exist. A secret's VALUE is never
 * readable (the API answers with a placeholder), so `updated_at` moving is the only evidence a
 * write landed. Throws when the variable cannot be read at all, which is not the same as absent.
 */
function readSecretState(site, accountId) {
  const response = netlifyApi('getEnvVar', { account_id: accountId, key: SECRET_NAME, site_id: site }, site);
  if (response.notFound) return null;
  if (response.failed) throw new Error(`could not read ${SECRET_NAME}`);
  const values = Array.isArray(response.json.values) ? response.json.values : [];
  return {
    updatedAt: typeof response.json.updated_at === 'string' ? response.json.updated_at : '',
    isSecret: response.json.is_secret === true,
    contexts: values.map(value => value?.context).filter(Boolean),
  };
}

function main(argv) {
  const install = argv.includes('--install');
  const rotate = argv.includes('--rotate');
  const siteIndex = argv.indexOf('--site');
  const site = siteIndex >= 0 ? argv[siteIndex + 1] : CONSOLE_SITE_ID;
  if (!install) {
    console.error('usage: node bin/ledger_keygen.mjs --install [--rotate] [--site <console site id>]');
    console.error('The private key is only ever handed straight to Netlify; there is no mode that prints it.');
    return 2;
  }

  const keysFile = path.join(ROOT, KEYS_PATH);
  const doc = JSON.parse(fs.readFileSync(keysFile, 'utf8'));
  parseKeys(doc); // refuse to extend a keys file that is already invalid
  const active = doc.keys.filter(key => !key.revokedAt);
  if (active.length && !rotate) {
    console.error(`keys.json already has an active key (${active.map(key => key.keyId).join(', ')}).`);
    console.error('Re-run with --rotate to add a replacement; the old key stays valid for what it already signed.');
    return 2;
  }

  // Read the target BEFORE a key exists: a CLI that cannot see the site would otherwise be
  // handed a key it will silently drop.
  const target = readSite(site);
  if (!target) {
    console.error(`Could not read Netlify site ${site}, so no key was made and nothing changed.`);
    console.error('Is the Netlify CLI installed, on PATH, and logged in to the account that owns the console? (`netlify status`)');
    return 1;
  }
  let before;
  try {
    before = readSecretState(site, target.accountId);
  } catch {
    console.error(`Could not read ${SECRET_NAME} on ${target.name}, so no key was made and nothing changed.`);
    return 1;
  }

  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const secret = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  const keyId = keyIdOf(publicKey);

  const result = netlify([
    'env:set', SECRET_NAME, secret,
    '--site', site, '--context', 'production', '--scope', 'functions', '--secret', '--force',
  ], site);
  if (result.status !== 0) {
    const said = `${result.stderr || ''}${result.stdout || ''}`.split(secret).join('[redacted]').trim();
    console.error('Could not store the signing key in Netlify, so nothing was changed. The key was discarded.');
    if (said) console.error(said.split('\n').slice(0, 6).join('\n'));
    if (result.error?.code === 'ENOENT') console.error('Is the Netlify CLI installed and on PATH?');
    return 1;
  }

  // A zero exit is not a write. Only a moved `updated_at` is (see netlify() above).
  let after = null;
  try {
    after = readSecretState(site, target.accountId);
  } catch {
    // Unreadable after the write is unconfirmed, and is refused below exactly like a no-op.
  }
  if (!after || !after.isSecret || !after.updatedAt || after.updatedAt === before?.updatedAt) {
    console.error(`Netlify reported success, but ${SECRET_NAME} did not land on ${target.name}:`
      + ` its last change is still ${before?.updatedAt || 'absent'}.`);
    console.error('Nothing was recorded in keys.json and the key was discarded. Check `netlify status`, then run this again.');
    return 1;
  }
  if (after.contexts.length === 0 || after.contexts.some(context => context !== 'production')) {
    console.error(`${SECRET_NAME} landed on ${target.name} in [${after.contexts.join(', ')}], not production`
      + ' only. Deploy previews run pull-request code and must not be able to sign. Remove it now:');
    console.error(`  NETLIFY_SITE_ID=${site} netlify env:unset LEDGER_SIGNING_KEY --force`);
    console.error('Nothing was recorded in keys.json and the key was discarded.');
    return 1;
  }

  // Routine rotation does NOT revoke the old key. Revocation refuses every event the old key
  // signs from the revocation time on — and the console keeps signing with the old key until
  // it is redeployed, so an automatic "revoked from now" would turn those sign-offs into a red
  // build. Revoke by hand, with the time the key was actually compromised, when that happens.
  const now = new Date().toISOString();
  doc.keys.push({
    keyId,
    algorithm: 'ed25519',
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    addedAt: now.slice(0, 10),
    revokedAt: null,
  });
  parseKeys(doc);
  fs.writeFileSync(keysFile, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

  console.log(`Signing key ${keyId} stored as a production-only Netlify secret on ${target.name}`
    + ` (confirmed: ${SECRET_NAME} updated ${after.updatedAt}).`);
  console.log(`Its public half was added to ${KEYS_PATH}.`);
  console.log('Next: open a pull request with that one file, and redeploy the console once it merges.');
  if (rotate) {
    console.log('The previous key stays valid. If it was COMPROMISED, set its "revokedAt" in keys.json to the');
    console.log('time of compromise (ISO, with milliseconds): builds then refuse anything it signed after that.');
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
