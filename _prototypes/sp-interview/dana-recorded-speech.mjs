/* Exact reuse of verified local Marin recordings. No provider calls or disk writes. */
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createDanaAudioCatalog} from './dana-audio-catalog.mjs';

const PACK = '_prototypes/sp-interview/sp-interview.pack.json';
const AUDIO = 'output/speech/dana-marin-v1';
const MANIFEST = AUDIO + '/manifest.json';
const MAX_AUDIO = 10 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const signature = stat => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
function invalid() { throw new Error('The local recording is not verified.'); }

async function fileInfo(root, relative, maximum) {
  if (await fs.realpath(root) !== root) invalid();
  const rootStat = await fs.lstat(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) invalid();
  const parts = relative.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) invalid();
  let current = root, stat;
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    stat = await fs.lstat(current, {bigint:true});
    if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) invalid();
  }
  if (stat.size <= 0n || stat.size > BigInt(maximum)) invalid();
  return {relative, full:current, size:Number(stat.size), signature:signature(stat)};
}

async function readFile(root, relative, maximum) {
  const info = await fileInfo(root, relative, maximum);
  const handle = await fs.open(info.full, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    if (signature(await handle.stat({bigint:true})) !== info.signature) invalid();
    // Read only the validated size, even if the path changes while being read.
    const bytes = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!result.bytesRead) invalid();
      offset += result.bytesRead;
    }
    if (signature(await handle.stat({bigint:true})) !== info.signature
      || (await fileInfo(root, relative, maximum)).signature !== info.signature) invalid();
    return {...info, bytes};
  } finally { await handle.close(); }
}

async function loadLibrary(root) {
  const [packFile, manifestFile] = await Promise.all([
    readFile(root, PACK, 4 * 1024 * 1024), readFile(root, MANIFEST, 1024 * 1024),
  ]);
  const pack = JSON.parse(packFile.bytes.toString('utf8'));
  const catalog = createDanaAudioCatalog(pack);
  const manifest = JSON.parse(manifestFile.bytes.toString('utf8'));
  if (catalog.entries.length !== 75 || manifest.schemaVersion !== 1
    || manifest.caseId !== catalog.caseId || manifest.packVersion !== pack.version
    || manifest.packHash !== digest(JSON.stringify(pack))
    || manifest.voice !== 'marin' || manifest.model !== 'gpt-4o-mini-tts-2025-12-15'
    || !Array.isArray(manifest.entries) || manifest.entries.length !== 75) invalid();
  const canonical = new Map(catalog.entries.map(entry => [entry.id, entry]));
  const entries = new Map(), seen = new Set();
  for (const entry of manifest.entries) {
    const source = entry && canonical.get(entry.id);
    if (!source || seen.has(entry.id) || entries.has(entry.spokenText)
      || ['id','sourceText','spokenText','sha256','spokenHash','file'].some(field => entry[field] !== source[field])
      || !HASH.test(entry.audioSha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || entry.bytes > MAX_AUDIO
      || !Number.isFinite(entry.durationSeconds) || entry.durationSeconds <= 0 || entry.durationSeconds > 90) invalid();
    seen.add(entry.id);
    entries.set(entry.spokenText, {file:entry.file, bytes:entry.bytes, audioSha256:entry.audioSha256});
  }
  return {entries, packFile, manifestFile};
}

export function createRecordedSpeech(rootDir) {
  if (typeof rootDir !== 'string' || !rootDir.trim()) return async () => null;
  const root = path.resolve(rootDir), cache = new Map();
  let loading;
  return async function recordedSpeech(text) {
    if (typeof text !== 'string' || !text) return null;
    try {
      loading ||= loadLibrary(root).catch(() => null);
      const library = await loading;
      const entry = library && library.entries.get(text);
      if (!entry) return null;
      const [packInfo, manifestInfo, audioInfo] = await Promise.all([
        fileInfo(root, PACK, 4 * 1024 * 1024), fileInfo(root, MANIFEST, 1024 * 1024),
        fileInfo(root, AUDIO + '/' + entry.file, MAX_AUDIO),
      ]);
      if (packInfo.signature !== library.packFile.signature || manifestInfo.signature !== library.manifestFile.signature) return null;
      const cached = cache.get(entry.file);
      if (cached && cached.signature === audioInfo.signature) return Buffer.from(cached.bytes);
      const audio = await readFile(root, AUDIO + '/' + entry.file, MAX_AUDIO);
      if (audio.bytes.length !== entry.bytes || digest(audio.bytes) !== entry.audioSha256) return null;
      cache.set(entry.file, {signature:audio.signature, bytes:audio.bytes});
      return Buffer.from(audio.bytes);
    } catch { return null; }
  };
}
