import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createDanaAudioCatalog} from '../dana-audio-catalog.mjs';
const pack=JSON.parse(fs.readFileSync(new URL('../sp-interview.pack.json',import.meta.url),'utf8'));
const catalog=createDanaAudioCatalog(pack);
const digest=value=>createHash('sha256').update(value).digest('hex');
const modulePath=new URL('../dana-recorded-speech.mjs',import.meta.url);
async function api(){assert.ok(fs.existsSync(modulePath),'the exact recorded speech reuse module must exist');return import(modulePath.href);}
function fixture(t){
  const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'dana-recorded-speech-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const source=path.join(root,'_prototypes/sp-interview'),audio=path.join(root,'output/speech/dana-marin-v1');
  fs.mkdirSync(source,{recursive:true});fs.mkdirSync(audio,{recursive:true});
  fs.writeFileSync(path.join(source,'sp-interview.pack.json'),JSON.stringify(pack));
  const bytes=catalog.entries.map((_,index)=>Buffer.from('Unit-test integrity fixture, not real MP3 audio: '+index));
  const manifest={schemaVersion:1,caseId:catalog.caseId,packVersion:pack.version,packHash:digest(JSON.stringify(pack)),voice:'marin',model:'gpt-4o-mini-tts-2025-12-15',instructionsHash:'1'.repeat(64),entries:catalog.entries.map((entry,index)=>({...entry,audioSha256:digest(bytes[index]),bytes:bytes[index].length,durationSeconds:2}))};
  function writeManifest(){fs.writeFileSync(path.join(audio,'manifest.json'),JSON.stringify(manifest));}
  writeManifest();
  for(let index=0;index<catalog.entries.length;index++)fs.writeFileSync(path.join(audio,catalog.entries[index].file),bytes[index]);
  return {root,source,audio,manifest,bytes,writeManifest};
}

test('exact spoken text returns verified canonical bytes, while formatting and semantic near-matches do not',async t=>{
  const {createRecordedSpeech}=await api(),f=fixture(t),get=createRecordedSpeech(f.root);
  for(const index of [0,1,20,74])assert.deepEqual(await get(catalog.entries[index].spokenText),f.bytes[index]);
  const line=catalog.entries[0].spokenText;
  for(const other of [' '+line,line+' ',line.toLowerCase(),line.replace('?', '.'),'Okay, I understand.',null])assert.equal(await get(other),null);
  const staged=catalog.entries.find(entry=>entry.sourceText!==entry.spokenText);
  assert.equal(await get(staged.sourceText),null,'stage directions are not fuzzy-matched into recorded speech');
  assert.ok(Buffer.isBuffer(await get(staged.spokenText)));
});

test('pack, model, voice and complete canonical manifest integrity are required before reuse',async t=>{
  const {createRecordedSpeech}=await api();
  const mutations=[
    m=>m.packHash='0'.repeat(64),m=>m.packVersion='old',m=>m.voice='other',m=>m.model='other',m=>m.caseId='other',
    m=>m.entries.pop(),m=>m.entries[1]={...m.entries[0]},m=>m.entries[2].sourceText='Invented patient fact',
    m=>m.entries[2].spokenHash='0'.repeat(64),m=>m.entries[2].sha256='0'.repeat(64),
    m=>m.entries[2].file='../outside.mp3',m=>m.entries[2].bytes=0,m=>m.entries[2].audioSha256='invalid',
    m=>m.entries[2].durationSeconds=91
  ];
  for(const mutate of mutations){const f=fixture(t);mutate(f.manifest);f.writeManifest();assert.equal(await createRecordedSpeech(f.root)(catalog.entries[0].spokenText),null);}
});

test('missing files and changed audio bytes fail closed with null',async t=>{
  const {createRecordedSpeech}=await api(),f=fixture(t),entry=catalog.entries[0];
  fs.writeFileSync(path.join(f.audio,entry.file),Buffer.alloc(f.bytes[0].length));
  assert.equal(await createRecordedSpeech(f.root)(entry.spokenText),null);
  fs.unlinkSync(path.join(f.audio,entry.file));
  assert.equal(await createRecordedSpeech(f.root)(entry.spokenText),null);
  fs.unlinkSync(path.join(f.audio,'manifest.json'));
  assert.equal(await createRecordedSpeech(f.root)(entry.spokenText),null);
});

test('symbolic links for audio, manifest, directories and the root are refused',async t=>{
  const {createRecordedSpeech}=await api();
  for(const kind of ['audio','manifest','directory','root']){
    const f=fixture(t);let root=f.root;
    const original=kind==='audio'?path.join(f.audio,catalog.entries[0].file):kind==='manifest'?path.join(f.audio,'manifest.json'):kind==='directory'?f.audio:f.root;
    const moved=original+'.real';fs.renameSync(original,moved);fs.symlinkSync(moved,original);
    if(kind==='root')t.after(()=>fs.rmSync(moved,{recursive:true,force:true}));
    assert.equal(await createRecordedSpeech(root)(catalog.entries[0].spokenText),null,kind);
  }
});

test('cached buffers cannot be corrupted by callers and runtime file drift is not trusted',async t=>{
  const {createRecordedSpeech}=await api(),f=fixture(t),get=createRecordedSpeech(f.root),entry=catalog.entries[0];
  const first=await get(entry.spokenText);first.fill(0);
  assert.deepEqual(await get(entry.spokenText),f.bytes[0]);
  fs.writeFileSync(path.join(f.audio,entry.file),'corrupted');
  assert.equal(await get(entry.spokenText),null);
  f.manifest.voice='other';f.writeManifest();
  assert.equal(await get(catalog.entries[1].spokenText),null);
});

test('catalog comes from the current root pack rather than an imported older pack',async t=>{
  const {createRecordedSpeech}=await api(),f=fixture(t);
  const changed=structuredClone(pack);changed.version+='-changed';
  fs.writeFileSync(path.join(f.source,'sp-interview.pack.json'),JSON.stringify(changed));
  assert.equal(await createRecordedSpeech(f.root)(catalog.entries[0].spokenText),null);
});
