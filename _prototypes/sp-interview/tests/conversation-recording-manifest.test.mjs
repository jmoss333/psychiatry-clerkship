import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createDanaAudioCatalog} from '../dana-audio-catalog.mjs';
import {createDanaRecordingManifest, finalizeDanaRecordings, inspectDanaRecording} from '../finalize-dana-recordings.mjs';

const pack = JSON.parse(fs.readFileSync(new URL('../sp-interview.pack.json', import.meta.url), 'utf8'));
const digest = value => createHash('sha256').update(value).digest('hex');
const catalog = createDanaAudioCatalog(pack);
const instructions = 'Synthetic instructions for manifest unit tests.';
const plan = {
  schemaVersion: 1, caseId: catalog.caseId, packVersion: pack.version,
  packHash: digest(JSON.stringify(pack)), voice: 'marin', model: 'gpt-4o-mini-tts-2025-12-15',
  instructions, instructionsHash: digest(instructions), expectedFiles: 75,
  status: 'awaiting-api-credit', generatedFiles: 0,
};
// These bytes and inspector are unit-test data only; no pretend audio files are written.
const sampleBytes = Buffer.from('synthetic inspection fixture, not an MP3');
const inspected = () => ({audioBytes: sampleBytes, codec: 'mp3', durationSeconds: 2.75});
const generatedAt = '2026-09-04T18:00:00.000Z';
const cli = fileURLToPath(new URL('../finalize-dana-recordings.mjs', import.meta.url));
function temporaryDirectory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dana-recording-manifest-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  fs.writeFileSync(path.join(dir, 'generation-plan.json'), JSON.stringify(plan));
  return dir;
}

test('all 75 inspections produce exact source identities and byte-derived audio integrity', async () => {
  const calls = [];
  const manifest = await createDanaRecordingManifest({pack, plan, generatedAt, inspect: async entry => {
    calls.push(entry.file); return inspected();
  }});
  assert.deepEqual(calls, catalog.entries.map(entry => entry.file));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.entries.length, 75);
  assert.equal(manifest.packHash, plan.packHash);
  assert.equal(manifest.instructionsHash, plan.instructionsHash);
  assert.equal(manifest.voice, 'marin');
  assert.equal(manifest.model, plan.model);
  assert.equal(manifest.generatedAt, generatedAt);
  for (let index = 0; index < manifest.entries.length; index++) {
    assert.deepEqual(manifest.entries[index], {...catalog.entries[index],
      audioSha256: digest(sampleBytes), bytes: sampleBytes.length, durationSeconds: 2.75});
  }
});

test('pack, instructions, and inventory drift fail before inspecting recordings', async () => {
  for (const changed of [
    {...plan, packHash: '0'.repeat(64)}, {...plan, packVersion: 'different'},
    {...plan, instructions: instructions + ' changed'}, {...plan, expectedFiles: 74},
    {...plan, caseId: 'other'}, {...plan, voice: 'other'}, {...plan, model: 'other'},
  ]) {
    await assert.rejects(createDanaRecordingManifest({pack, plan: changed, inspect() {
      assert.fail('No files should be inspected for a stale generation plan.');
    }}), /generation plan/i);
  }
});

test('invalid bytes, codec, and durations never produce a manifest', async () => {
  const variants = [
    {audioBytes: Buffer.alloc(0)}, {audioBytes: Buffer.alloc(10 * 1024 * 1024 + 1)},
    {codec: 'aac'}, {durationSeconds: 0}, {durationSeconds: 90.01}, {durationSeconds: NaN},
  ];
  for (const variant of variants) {
    await assert.rejects(createDanaRecordingManifest({pack, plan, inspect: () => ({...inspected(), ...variant})}), /recording/i);
  }
});

test('a late missing recording leaves no partial manifest or temporary files', async t => {
  const audioDir = temporaryDirectory(t);
  let count = 0;
  await assert.rejects(finalizeDanaRecordings({audioDir, pack, generatedAt, inspectFile() {
    if (++count === 75) throw new Error('Missing final recording');
    return inspected();
  }}), /Missing final recording/);
  assert.equal(count, 75);
  assert.deepEqual(fs.readdirSync(audioDir), ['generation-plan.json']);
});

test('successful finalization writes once atomically and preserves the generation plan', async t => {
  const audioDir = temporaryDirectory(t);
  const before = fs.readFileSync(path.join(audioDir, 'generation-plan.json'), 'utf8');
  const manifest = await finalizeDanaRecordings({audioDir, pack, generatedAt, inspectFile: inspected});
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(audioDir, 'manifest.json'), 'utf8')), manifest);
  assert.equal(fs.readFileSync(path.join(audioDir, 'generation-plan.json'), 'utf8'), before);
  assert.deepEqual(fs.readdirSync(audioDir).sort(), ['generation-plan.json', 'manifest.json']);
  await assert.rejects(finalizeDanaRecordings({audioDir, pack, inspectFile() {
    assert.fail('An existing manifest must be refused before inspection.');
  }}), /already exists/i);
});

test('actual inspection rejects symbolic links and empty files before probing', async t => {
  const dir = temporaryDirectory(t);
  const empty = path.join(dir, 'empty.mp3');
  fs.writeFileSync(empty, '');
  const link = path.join(dir, 'linked.mp3');
  fs.symlinkSync(empty, link);
  await assert.rejects(inspectDanaRecording(empty), /recording.*size/i);
  await assert.rejects(inspectDanaRecording(link), /regular.*non.?symlink/i);
});

test('CLI with missing recordings creates no manifest and no audio', t => {
  const dir = temporaryDirectory(t);
  const result = spawnSync(process.execPath, [cli, '--audio-dir', dir], {encoding: 'utf8'});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing recording/i);
  assert.deepEqual(fs.readdirSync(dir), ['generation-plan.json']);
});
