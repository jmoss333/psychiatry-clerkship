import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createDanaAudioCatalog} from '../dana-audio-catalog.mjs';

const pack = JSON.parse(fs.readFileSync(new URL('../sp-interview.pack.json', import.meta.url), 'utf8'));
const dana = pack.cases.find(c => c.id === 'sp_depression_gated_si_001');
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');
const cli = fileURLToPath(new URL('../dana-audio-catalog.mjs', import.meta.url));

test('catalog covers exactly the 77 canonical Dana patient lines', () => {
  const catalog = createDanaAudioCatalog(pack);
  const responseLines = Object.values(dana.responses).flatMap(bank => Object.values(bank).flat());
  const gatedLines = dana.gated.flatMap(gate => Object.entries(gate)
    .filter(([key]) => ['reveal', 'repeatAsk', 'deflectLowRapport', 'deflectIfLocked', 'deflectEuphemism'].includes(key))
    .map(([, text]) => text));
  assert.equal(responseLines.length, 64);
  // si_behavior_detail (WP-5m) contributes a reveal and a locked deflection.
  assert.equal(gatedLines.length, 12);
  const expected = [dana.persona.opening, ...responseLines, ...gatedLines];
  assert.equal(new Set(expected).size, 77);
  assert.equal(catalog.entries.length, 77);
  assert.deepEqual(new Set(catalog.entries.map(entry => entry.sourceText)), new Set(expected));
  assert.equal(catalog.caseId, dana.id);
  assert.equal(catalog.packVersion, pack.version);
  assert.ok(catalog.entries.every(entry => entry.spokenText.length > 0));
});

test('catalog excludes prompts, teaching points, other patients, and learner transcripts', () => {
  const fixture = structuredClone(pack);
  const target = fixture.cases.find(c => c.id === dana.id);
  target.learnerTranscript = 'PRIVATE LEARNER TEXT';
  target.prompts = {actor: 'INTERNAL ACTOR INSTRUCTIONS'};
  target.teachingPoints = ['FACULTY FEEDBACK'];
  target.gated[0].explanation = 'NOT A PATIENT LINE';
  fixture.cases.push({id: 'not-dana', persona: {opening: 'OTHER PATIENT'}});
  assert.deepEqual(createDanaAudioCatalog(fixture), createDanaAudioCatalog(pack));
});

test('text identities are deterministic and independent of source ordering', () => {
  const first = createDanaAudioCatalog(pack);
  assert.deepEqual(createDanaAudioCatalog(pack), first);
  const fixture = structuredClone(pack);
  const target = fixture.cases.find(c => c.id === dana.id);
  target.responses = Object.fromEntries(Object.entries(target.responses).reverse());
  const reordered = createDanaAudioCatalog(fixture);
  const identity = catalog => Object.fromEntries(catalog.entries.map(entry => [entry.sourceText, entry.id]));
  assert.deepEqual(identity(reordered), identity(first));
  assert.equal(new Set(first.entries.map(entry => entry.file)).size, 77);
  for (const entry of first.entries) {
    assert.equal(entry.id, digest(entry.sourceText));
    assert.equal(entry.sha256, entry.id, 'sha256 identifies source text, not audio bytes');
    assert.equal(entry.spokenHash, digest(entry.spokenText));
    assert.equal(entry.file, entry.id + '.mp3');
    assert.match(entry.file, /^[a-f0-9]{64}\.mp3$/);
  }
});

test('directions remain visual while spoken words and punctuation are preserved', () => {
  const fixture = structuredClone(pack);
  const target = fixture.cases.find(c => c.id === dana.id);
  target.persona.opening = ' [quiet] *looks up* Hi.\n Do  you hear me? [nods]';
  const entry = createDanaAudioCatalog(fixture).entries.find(item => item.sourceText === target.persona.opening);
  assert.equal(entry.spokenText, 'Hi. Do you hear me?');
  assert.notEqual(entry.id, entry.spokenHash);
  const canonical = createDanaAudioCatalog(pack);
  const reveal = canonical.entries.find(item => item.sourceText === dana.gated[0].reveal);
  assert.equal(reveal.spokenText, dana.gated[0].reveal.slice('*long pause* '.length));
  assert.equal(canonical.entries.find(item => item.sourceText === dana.gated[0].deflectEuphemism).spokenText,
    'Hurt myself? Like... what do you mean, hurt?');
});

test('invalid or missing Dana speech fails instead of silently making incomplete recordings', () => {
  assert.throws(() => createDanaAudioCatalog({version: '1', cases: []}), /Dana/i);
  const fixture = structuredClone(pack);
  fixture.cases.find(c => c.id === dana.id).persona.opening = '*silent direction only*';
  assert.throws(() => createDanaAudioCatalog(fixture), /spoken text/i);
});

test('CLI writes only to an explicitly requested output path', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dana-audio-catalog-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const inspect = spawnSync(process.execPath, [cli], {cwd: dir, encoding: 'utf8'});
  assert.equal(inspect.status, 0, inspect.stderr);
  assert.match(inspect.stdout, /77/);
  assert.deepEqual(fs.readdirSync(dir), []);
  const output = path.join(dir, 'catalog.json');
  const write = spawnSync(process.execPath, [cli, '--out', output], {cwd: dir, encoding: 'utf8'});
  assert.equal(write.status, 0, write.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), createDanaAudioCatalog(pack));
  assert.deepEqual(fs.readdirSync(dir), ['catalog.json']);
});
