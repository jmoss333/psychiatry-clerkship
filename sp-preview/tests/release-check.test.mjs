import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readExpected, checkRelease, DEFAULT_URL} from '../qa/release-check.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const files = {'index.html':'<h1>Room</h1>', 'app.js':'new room', 'styles.css':'body{}'};
const expected = Object.entries(files).map(([file, body]) => ({file, sha256:hash(body)}));
const revision = 'a'.repeat(40);
function fetcher(change = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({url, options});
    const file = new URL(url).pathname.slice(1) || 'index.html';
    if (change[file] instanceof Error) throw change[file];
    return new Response(change[file] ?? files[file], {status:change[file] === null ? 404 : 200});
  };
  return {calls, fetchImpl};
}

test('checks every public asset and the actual root route without actor calls', async () => {
  const {calls, fetchImpl} = fetcher();
  const result = await checkRelease({expected, revision, fetchImpl});
  assert.equal(result.status, 'passed');
  assert.equal(result.assets.length, 4);
  assert.deepEqual(calls.map(c => new URL(c.url).pathname), ['/index.html','/app.js','/styles.css','/']);
  assert.ok(calls.every(c => c.options.redirect === 'error' && c.options.headers['Cache-Control'] === 'no-cache'));
});

test('one stale file fails even when every other request is green', async () => {
  const {fetchImpl} = fetcher({'app.js':'old room'});
  const result = await checkRelease({expected, revision, fetchImpl});
  assert.equal(result.status, 'failed');
  assert.equal(result.assets.find(a => a.file === 'app.js').status, 'mismatch');
  assert.equal(result.assets.find(a => a.file === 'app.js').expectedSha256, hash('new room'));
});

test('a missing asset or network failure fails closed and still checks the remaining files', async () => {
  const {fetchImpl, calls} = fetcher({'app.js':null, 'styles.css':new Error('private provider details')});
  const result = await checkRelease({expected, revision, fetchImpl});
  assert.equal(result.status, 'failed');
  assert.equal(calls.length, 4);
  assert.equal(result.assets.find(a => a.file === 'app.js').status, 'unavailable');
  assert.equal(result.assets.find(a => a.file === 'styles.css').status, 'unavailable');
  assert.ok(!JSON.stringify(result).includes('private provider details'));
});

test('an independently stale root route fails even when index.html matches', async () => {
  const result = await checkRelease({expected, revision, fetchImpl:async url =>
    new Response(new URL(url).pathname === '/' ? 'old index' : files[new URL(url).pathname.slice(1)])});
  assert.equal(result.status, 'failed');
  assert.equal(result.assets.at(-1).status, 'mismatch');
});

test('empty, partial, duplicate, or unsafe inventories never report success', async () => {
  for (const inventory of [[], expected.slice(1), [...expected,expected[0]], [{file:'../private',sha256:hash('x')}], [{file:'index.html',sha256:'bad'}]]) {
    await assert.rejects(checkRelease({expected:inventory, revision}), /inventory/);
  }
  for (const url of ['http://example.com','https://user:secret@example.com','https://example.com/?token=x']) {
    await assert.rejects(checkRelease({expected, revision, url}), /URL/);
  }
});

test('oversized response is rejected rather than hashed as a valid asset', async () => {
  const result = await checkRelease({expected, revision, maxBytes:8, fetchImpl:fetcher().fetchImpl});
  assert.equal(result.status, 'failed');
  assert.equal(result.assets[0].status, 'unavailable');
});

test('expected bytes and inventory come from the pinned commit, including new files, never the dirty checkout', async () => {
  const root = await mkdtemp(path.join(tmpdir(),'room-release-test-'));
  const git = (...args) => execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  try {
    git('init','-q');
    await mkdir(path.join(root,'sp-preview/public'),{recursive:true});
    for (const [file,body] of Object.entries(files)) await writeFile(path.join(root,'sp-preview/public',file),body);
    await writeFile(path.join(root,'sp-preview/public','new-module.js'),'must also be checked');
    git('add','.');
    git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','fixture');
    const commit = git('rev-parse','HEAD');
    await writeFile(path.join(root,'sp-preview/public/app.js'),'dirty checkout');
    const result = readExpected({root,revision:commit});
    assert.equal(result.length,4);
    assert.equal(result.find(a=>a.file==='app.js').sha256,hash('new room'));
    assert.ok(result.some(a=>a.file==='new-module.js'));
    assert.throws(()=>readExpected({root,revision:'main'}),/40-character/);
    assert.throws(()=>readExpected({root,revision:'0'.repeat(40)}),/commit/);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('CLI writes a failure receipt and exits nonzero when the requested commit cannot be read', async () => {
  const root = await mkdtemp(path.join(tmpdir(),'room-release-cli-'));
  try {
    const out = path.join(root,'receipt.json');
    const script = fileURLToPath(new URL('../qa/release-check.mjs',import.meta.url));
    const run = spawnSync(process.execPath,[script,'--revision','0'.repeat(40),'--out',out],{encoding:'utf8'});
    assert.equal(run.status,1);
    const {readFile} = await import('node:fs/promises');
    const receipt = JSON.parse(await readFile(out,'utf8'));
    assert.equal(receipt.status,'failed');
    assert.equal(receipt.url,DEFAULT_URL);
    assert.equal(receipt.expectedRevision,'0'.repeat(40));
    assert.equal(receipt.assets.length,0);
    assert.ok(receipt.error);
  } finally { await rm(root,{recursive:true,force:true}); }
});
