import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {selectCase,mount}=require('../sp-interview.conversation.js');
const pack=require('../sp-interview.pack.json');
const core={isCaseReviewed:()=>true};
const morganId='sp_alcohol_ambivalence_001';
const localRegistry={cases:[{id:morganId,title:'Morgan — ambivalence about alcohol',persona:{displayName:'Morgan'},reviewStatus:'draft'}],profiles:{[morganId]:{name:'Morgan',slug:'morgan',voice:'Marin',practice:'Explore what Morgan wants from a conversation about alcohol.'}}};

test('a local draft is selectable only from its exact live registry entry without changing canonical review rules',()=>{
  const before=JSON.stringify(pack);
  const selected=selectCase(pack,{isCaseReviewed(){assert.fail('Draft selection must not impersonate canonical review');}},morganId,true,localRegistry);
  assert.equal(selected.patient,localRegistry.cases[0]);assert.equal(selected.localDraft,true);
  assert.equal(selected.slug,'morgan');assert.equal(selected.voice,'Marin');
  assert.throws(()=>selectCase(pack,core,morganId,false,localRegistry),/only in the live/);
  assert.throws(()=>selectCase(pack,core,morganId,true,null),/not supported/);
  const collision={cases:[{...localRegistry.cases[0],id:'sp_mania_redirect_001'}],profiles:{sp_mania_redirect_001:localRegistry.profiles[morganId]}};
  assert.throws(()=>selectCase(pack,{isCaseReviewed:()=>false},'sp_mania_redirect_001',true,collision),/unavailable/);
  assert.equal(JSON.stringify(pack),before);assert.equal(pack.cases.some(item=>item.id===morganId),false);
});

test('browser conversation module works without a local registry and never invents a draft case',()=>{
  const env={window:{}};vm.createContext(env);
  vm.runInContext(fs.readFileSync(new URL('../sp-interview.conversation.js',import.meta.url),'utf8'),env);
  assert.equal(env.window.SPInterviewConversation.selectCase(pack,core,null,true).patient.id,pack.cases[0].id);
  assert.throws(()=>env.window.SPInterviewConversation.selectCase(pack,core,morganId,true),/not supported/);
});

test('Node selection uses the separately authored Morgan draft while the embedded canonical pack stays unchanged',()=>{
  const registry=require('../sp-interview.local-cases.js'),before=JSON.stringify(pack);
  const selected=selectCase(pack,core,morganId,true);
  assert.equal(selected.patient,registry.cases.find(item=>item.id===morganId));
  assert.equal(selected.patient.persona.pronouns,'they/them');
  assert.equal(selected.voice,'Marin');assert.equal(selected.localDraft,true);
  assert.equal(selected.patient.facultyReview.status,'reviewed');
  assert.equal(pack.cases.length,3);assert.equal(JSON.stringify(pack),before);
});

test('live selection maps only the three canonical cases to their own person, goal, context, and voice',()=>{
  const before=JSON.stringify(pack);
  const expected=[['sp_depression_gated_si_001','Dana','dana','Marin'],['sp_mania_redirect_001','Marcus','marcus','Cedar'],['sp_psychosis_paranoid_001','Ray','ray','Cedar']];
  for(const [id,name,slug,voice] of expected){
    const selected=selectCase(pack,core,id,true),source=pack.cases.find(item=>item.id===id);
    assert.equal(selected.patient.id,id);assert.equal(selected.patient.persona.displayName,name);
    assert.equal(selected.slug,slug);assert.equal(selected.voice,voice);
    assert.equal(selected.patient.learnerGoal,source.learnerGoal);assert.equal(selected.patient.persona.presentingContext,source.persona.presentingContext);
    assert.ok(selected.practice.length>20);
  }
  assert.equal(new Set(expected.map(([id])=>selectCase(pack,core,id,true).practice)).size,3);
  assert.equal(JSON.stringify(pack),before);
});

test('Dana is the default while unsupported, unavailable, or unreviewed cases cannot silently fall back',()=>{
  assert.equal(selectCase(pack,core,null,true).patient.persona.displayName,'Dana');
  assert.equal(selectCase(pack,core,undefined,false).voice,'Marin');
  for(const id of ['', 'marcus','sp_mania_redirect_002','<script>','sp_depression_gated_si_001 '])assert.throws(()=>selectCase(pack,core,id,true),/not supported/);
  assert.throws(()=>selectCase(pack,{isCaseReviewed:()=>false},'sp_mania_redirect_001',true),/unavailable/);
  assert.throws(()=>selectCase({cases:[]},core,'sp_psychosis_paranoid_001',true),/unavailable/);
  assert.throws(()=>selectCase(pack,core,'sp_mania_redirect_001',false),/only in the live/);
});

test('unsupported case URLs render a visible error without creating a client or loading speech',()=>{
  const children=[];
  const root={replaceChildren(){children.length=0;},appendChild(node){children.push(node);}};
  const doc={createElement:tag=>({tag,setAttribute(name,value){this[name]=value;}})};
  const env={document:doc,location:{href:'http://127.0.0.1:4318/_prototypes/sp-interview/sp-interview.preview.html?danaConversation=1&danaLive=1&case=unknown'},
    SPInterviewLive:{createClient(){assert.fail('An unsupported case must not create a live client');}},
    SPInterviewRecordings:{loadLibrary(){assert.fail('An unsupported case must not load recordings');}}};
  assert.equal(mount({window:env,core,pack,root,live:true}),null);
  assert.equal(children[0].role,'alert');assert.match(children[0].textContent,/not supported/);
  assert.equal(children[0].id,'conversation-case-error');assert.equal(children[1].tag,'a');
});
