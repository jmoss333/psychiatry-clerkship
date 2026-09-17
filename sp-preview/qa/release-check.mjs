// Public-byte provenance only. Never authenticates or invokes a paid actor endpoint.
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

export const DEFAULT_URL = 'https://interview-room-faculty-preview.netlify.app';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const validFile = file => typeof file === 'string' && /^[a-zA-Z0-9_./-]+$/.test(file)
  && file.split('/').every(part => part && part !== '.' && part !== '..');

function validateInventory(expected) {
  if (!Array.isArray(expected) || !expected.length || !expected.some(a => a.file === 'index.html')
      || new Set(expected.map(a => a.file)).size !== expected.length
      || expected.some(a => !validFile(a.file) || !/^[a-f0-9]{64}$/.test(a.sha256))) {
    throw new Error('Invalid or empty public asset inventory.');
  }
}

export function readExpected({root = ROOT, revision}) {
  if (!/^[a-f0-9]{40}$/.test(revision || '')) throw new Error('Expected a full 40-character commit revision.');
  const git = args => execFileSync('git', args, {cwd:root, stdio:['ignore','pipe','pipe'], maxBuffer:16*1024*1024});
  let entries;
  try {
    // Require a commit, not a tree or blob. Enumerate the complete committed directory,
    // so a newly shipped file cannot silently escape a hard-coded nine-file check.
    if (git(['cat-file','-t',revision]).toString().trim() !== 'commit') throw new Error();
    entries = git(['ls-tree','-rz',revision,'--','sp-preview/public/']).toString().split('\0').filter(Boolean);
  } catch { throw new Error('Cannot read expected commit and its public asset inventory.'); }
  const expected = entries.map(entry => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\tsp-preview\/public\/(.+)$/.exec(entry);
    if (!match || !validFile(match[3])) throw new Error('Unsupported public asset inventory entry.');
    return {file:match[3], sha256:digest(git(['cat-file','blob',match[2]]))};
  });
  validateInventory(expected);
  return expected;
}

async function boundedBody(response, maxBytes) {
  const chunks = []; let size = 0;
  if (!response.body) throw new Error('No body');
  const reader = response.body.getReader();
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Oversized body');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
}

export async function checkRelease({expected, revision, url = DEFAULT_URL, fetchImpl = fetch,
  timeoutMs = 10000, maxBytes = 2*1024*1024}) {
  validateInventory(expected);
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('Release URL must be an HTTPS origin without credentials, path, query, or fragment.');
  }
  const assets = [];
  // Check / separately: a misrouted root can be stale while /index.html is correct.
  for (const item of [...expected, {...expected.find(a=>a.file==='index.html'), file:'/'}]) {
    const row = {file:item.file, expectedSha256:item.sha256, status:'unavailable'};
    try {
      const response = await fetchImpl(new URL(item.file === '/' ? '/' : `/${item.file}`, base), {
        method:'GET', redirect:'error', headers:{'Cache-Control':'no-cache'}, signal:AbortSignal.timeout(timeoutMs),
      });
      row.httpStatus = response.status;
      if (response.status === 200) {
        row.servedSha256 = digest(await boundedBody(response, maxBytes));
        row.status = row.servedSha256 === row.expectedSha256 ? 'matched' : 'mismatch';
      } else { await response.body?.cancel(); }
    } catch { /* Network errors and timeouts are unavailable, never an empty success. */ }
    assets.push(row);
  }
  return {schemaVersion:1, checkedAt:new Date().toISOString(), url:base.origin, expectedRevision:revision,
    scope:'public assets and root route; excludes function behavior and device validation',
    status:assets.every(a=>a.status==='matched') ? 'passed' : 'failed', assets};
}

async function main() {
  const {values} = parseArgs({options:{revision:{type:'string'},url:{type:'string',default:DEFAULT_URL},out:{type:'string'}}});
  if (!values.out) throw new Error('Specify --out for the release receipt.');
  let receipt;
  try {
    receipt = await checkRelease({expected:readExpected({revision:values.revision}), revision:values.revision, url:values.url});
  } catch (error) {
    receipt = {schemaVersion:1, checkedAt:new Date().toISOString(), url:values.url,
      expectedRevision:values.revision ?? null, status:'failed', error:error.message, assets:[]};
  }
  await mkdir(path.dirname(path.resolve(values.out)),{recursive:true});
  await writeFile(values.out,JSON.stringify(receipt,null,2)+'\n');
  const matched = receipt.assets.filter(a=>a.status==='matched').length;
  console.log(`Interview Room release ${receipt.status.toUpperCase()}: ${matched}/${receipt.assets.length} routes match ${receipt.expectedRevision || '(missing revision)'}.`);
  for (const item of receipt.assets.filter(a=>a.status!=='matched')) console.log(`  ${item.status}: ${item.file}`);
  if (receipt.error) console.error(receipt.error);
  process.exitCode = receipt.status === 'passed' ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(()=>{ console.error('Release check could not complete or write its receipt.'); process.exitCode=1; });
}
