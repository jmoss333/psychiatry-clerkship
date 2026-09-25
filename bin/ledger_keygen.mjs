#!/usr/bin/env node
/**
 * bin/ledger_keygen.mjs — create the attestation ledger's signing key (ADR-003, activation step 1).
 *
 *   node bin/ledger_keygen.mjs --install            first key
 *   node bin/ledger_keygen.mjs --install --rotate   add a replacement key (the old one stays valid)
 *
 * WHAT IT DOES, IN ORDER, AND WHAT IT NEVER DOES:
 *   1. generates an Ed25519 key pair in memory;
 *   2. stores the PRIVATE half as the faculty console's `LEDGER_SIGNING_KEY` — a Netlify
 *      SECRET (write-only: the UI, CLI and API never show it again), PRODUCTION context only
 *      (deploy previews run pull-request code and must not be able to sign), functions scope
 *      only. It goes straight from memory to `netlify env:set`; it is never printed, never
 *      written to disk, and never passes through an AI session;
 *   3. only if that succeeded, appends the PUBLIC half to 13_Faculty_Resources/ledger/keys.json.
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

  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const secret = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  const keyId = keyIdOf(publicKey);

  const result = spawnSync('netlify', [
    'env:set', 'LEDGER_SIGNING_KEY', secret,
    '--site', site, '--context', 'production', '--scope', 'functions', '--secret', '--force',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    const said = `${result.stderr || ''}${result.stdout || ''}`.split(secret).join('[redacted]').trim();
    console.error('Could not store the signing key in Netlify, so nothing was changed. The key was discarded.');
    if (said) console.error(said.split('\n').slice(0, 6).join('\n'));
    if (result.error?.code === 'ENOENT') console.error('Is the Netlify CLI installed and on PATH?');
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

  console.log(`Signing key ${keyId} stored as a production-only Netlify secret on the faculty console.`);
  console.log(`Its public half was added to ${KEYS_PATH}.`);
  console.log('Next: open a pull request with that one file, and redeploy the console once it merges.');
  if (rotate) {
    console.log('The previous key stays valid. If it was COMPROMISED, set its "revokedAt" in keys.json to the');
    console.log('time of compromise (ISO, with milliseconds): builds then refuse anything it signed after that.');
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
