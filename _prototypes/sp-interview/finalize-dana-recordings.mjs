import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createDanaAudioCatalog} from './dana-audio-catalog.mjs';

const MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_AUDIO_DIR = fileURLToPath(new URL('../../output/speech/dana-marin-v1/', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');

function checkPlan(pack, catalog, plan) {
  if (!plan || plan.schemaVersion !== 1 || plan.caseId !== catalog.caseId ||
      plan.packVersion !== catalog.packVersion || plan.packHash !== digest(JSON.stringify(pack)) ||
      plan.voice !== 'marin' || plan.model !== 'gpt-4o-mini-tts-2025-12-15' ||
      plan.expectedFiles !== catalog.entries.length || typeof plan.instructions !== 'string' ||
      !plan.instructions.trim() || plan.instructionsHash !== digest(plan.instructions)) {
    throw new Error('The generation plan does not match the current pack, voice, model, instructions, or complete line inventory. Review and regenerate the plan before finalizing.');
  }
}

/** Assemble a complete manifest from inspected bytes; this function writes nothing. */
export async function createDanaRecordingManifest({pack, plan, inspect, generatedAt = new Date().toISOString()}) {
  const catalog = createDanaAudioCatalog(pack);
  checkPlan(pack, catalog, plan);
  if (typeof inspect !== 'function') throw new Error('A recording inspector is required.');
  if (typeof generatedAt !== 'string' || !Number.isFinite(Date.parse(generatedAt))) throw new Error('The recording manifest timestamp is invalid.');
  const entries = [];
  for (const entry of catalog.entries) {
    const result = await inspect(entry);
    if (!Buffer.isBuffer(result?.audioBytes) || result.audioBytes.length < 1 || result.audioBytes.length > MAX_BYTES ||
        result.codec !== 'mp3' || !Number.isFinite(result.durationSeconds) || result.durationSeconds <= 0 || result.durationSeconds > 90) {
      throw new Error(`Invalid recording ${entry.file}: expected a nonempty MP3 no larger than 10 MB and no longer than 90 seconds.`);
    }
    entries.push({...entry, audioSha256: digest(result.audioBytes), bytes: result.audioBytes.length, durationSeconds: result.durationSeconds});
  }
  return {
    schemaVersion: 1, caseId: catalog.caseId, packVersion: catalog.packVersion,
    packHash: plan.packHash, voice: plan.voice, model: plan.model, generatedAt,
    instructionsHash: plan.instructionsHash, entries,
  };
}

/** Read and probe a real file; never generates or repairs audio. */
export async function inspectDanaRecording(filename) {
  let before;
  try { before = fs.lstatSync(filename); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Missing recording ${path.basename(filename)}. All scripted lines are required; no manifest was written.`);
    throw error;
  }
  if (before.isSymbolicLink() || !before.isFile()) throw new Error(`Recording ${path.basename(filename)} must be a regular non-symlink file.`);
  if (before.size < 1 || before.size > MAX_BYTES) throw new Error(`Recording ${path.basename(filename)} has an invalid size; expected 1 byte through 10 MB.`);
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  let audioBytes;
  try {
    const opened = fs.fstatSync(fd);
    if (opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size) throw new Error('Recording changed while it was opened. Try again after generation finishes.');
    audioBytes = fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
  if (audioBytes.length !== before.size) throw new Error('Recording changed while it was read. Try again after generation finishes.');
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,duration:format=duration',
    '-of', 'json', '-i', filename,
  ], {encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 30000});
  if (probe.error?.code === 'ENOENT') throw new Error('ffprobe is required to inspect MP3 recordings. Install it before finalizing.');
  if (probe.error || probe.status !== 0) throw new Error(`Recording ${path.basename(filename)} failed ffprobe inspection.`);
  let metadata;
  try { metadata = JSON.parse(probe.stdout); }
  catch { throw new Error(`Recording ${path.basename(filename)} returned invalid ffprobe metadata.`); }
  const stream = metadata.streams?.[0];
  const durationSeconds = Number(stream?.duration || metadata.format?.duration);
  const after = fs.lstatSync(filename);
  if (after.isSymbolicLink() || !after.isFile() || ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].some(key => before[key] !== after[key])) {
    throw new Error('Recording changed during inspection. Try again after generation finishes.');
  }
  return {audioBytes, codec: stream?.codec_name, durationSeconds};
}

/** Write once, atomically, only after every recording passes. The plan is untouched. */
export async function finalizeDanaRecordings({audioDir = DEFAULT_AUDIO_DIR, pack, inspectFile = inspectDanaRecording, generatedAt} = {}) {
  const manifestPath = path.join(audioDir, 'manifest.json');
  try {
    fs.lstatSync(manifestPath);
    throw new Error('manifest.json already exists. Review and move the existing manifest explicitly before finalizing a replacement.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const sourcePack = pack || JSON.parse(fs.readFileSync(new URL('./sp-interview.pack.json', import.meta.url), 'utf8'));
  const plan = JSON.parse(fs.readFileSync(path.join(audioDir, 'generation-plan.json'), 'utf8'));
  const manifest = await createDanaRecordingManifest({pack: sourcePack, plan, generatedAt,
    inspect: entry => inspectFile(path.join(audioDir, entry.file))});
  const temporaryPath = path.join(audioDir, `.manifest-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(manifest, null, 2) + '\n', {encoding: 'utf8', flag: 'wx', mode: 0o600});
    // A hard link publishes the completed file atomically and refuses a concurrent overwrite.
    fs.linkSync(temporaryPath, manifestPath);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('manifest.json already exists. No existing manifest was replaced.');
    throw error;
  } finally {
    try { fs.unlinkSync(temporaryPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return manifest;
}

async function main(args) {
  if (args.length && (args.length !== 2 || args[0] !== '--audio-dir' || !args[1] || args[1].startsWith('--'))) {
    throw new Error('Usage: node finalize-dana-recordings.mjs [--audio-dir <directory>]');
  }
  const manifest = await finalizeDanaRecordings({audioDir: args.length ? path.resolve(args[1]) : DEFAULT_AUDIO_DIR});
  console.log(`Verified ${manifest.entries.length} local MP3 recordings and wrote manifest.json. No audio was generated; the generation plan is unchanged.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
