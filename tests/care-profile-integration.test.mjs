import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createCareProfileHandlers, CONSOLE_ORIGIN, LEARNER_ORIGINS} from '../faculty-console/care-profile-service.mjs';

const buildDir = fileURLToPath(new URL('../13_Faculty_Resources/_automation/site_build/', import.meta.url));
const source = readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_care_profile.js', import.meta.url), 'utf8');
const client = new Function(source+';return {request:fdCareProfileRequest,receipt:fdCareProfileReceipt};')();

// Exercise the actual Python serialization, service response and browser consumer together.
// All credentials, verification records and storage below are synthetic and remain in memory.
test('built profile crosses the real approval service/browser boundary and loses approval on withdrawal, expiry or source replacement', async () => {
  const candidate = {
    id:'integration-unit', label:'Synthetic integration unit', org:null, brandingApproved:false,
    unitName:'Synthetic unit', unitPhone:'207-555-0100', unitPurpose:'Questions about discharge paperwork',
    unitHours:'Weekdays, morning hours', callbackProgram:false, callbackTeam:'', callbackPhone:'',
    callbackHours:'', callbackFallback:'',
    verification:['identity','contact'].map(field => ({field,checkedOn:'2026-10-01',
      checkedBy:'Synthetic verifier',evidence:'Integration test only'})),
  };
  const built = spawnSync('python3', ['-B','-c',
    'import json,sys; import care_inserts_payload as p; print(json.dumps(p._shipped_profile(json.load(sys.stdin))))'],
    {cwd:buildDir,input:JSON.stringify(candidate),encoding:'utf8',timeout:30000});
  assert.equal(built.status,0,built.stderr);
  const profile = JSON.parse(built.stdout);
  assert.equal(Object.hasOwn(profile,'verification'),false);

  let now='2026-10-13T12:00:00.000Z', sourceCommit='a'.repeat(40), saved=null, etag=0;
  const ownerKey='synthetic-integration-owner-key-0000000000';
  const handlers = createCareProfileHandlers({
    env:{CONTEXT:'production',CARE_PROFILE_OWNER_KEY:ownerKey,
      CARE_PROFILE_SIGNING_SECRET:'synthetic-integration-signing-key-000000'},
    now:()=>now,
    readCandidates:async()=>({commit:sourceCommit,profiles:[structuredClone(candidate)]}),
    store:{
      async getWithMetadata(){return saved && {data:structuredClone(saved),etag:String(etag)};},
      async setJSON(key,value,options){
        assert.equal(key,'profile/'+profile.id);
        if(options.onlyIfNew && saved || options.onlyIfMatch!==undefined && options.onlyIfMatch!==String(etag)) return {modified:false};
        saved=structuredClone(value); etag++;
        return {modified:true,etag:String(etag)};
      },
    },
  });
  async function act(action){
    const response=await handlers.approvals(new Request(CONSOLE_ORIGIN+'/.netlify/functions/care-profile-approvals',{
      method:'POST',headers:{Origin:CONSOLE_ORIGIN,'Content-Type':'application/json','x-care-profile-owner-key':ownerKey},
      body:JSON.stringify({action,profileId:profile.id,revision:profile.revision,
        expectedVersion:saved?.version||null,expectedSourceCommit:sourceCommit}),
    }));
    assert.equal(response.status,200);
    assert.equal((await response.json()).ok,true);
  }
  async function check(expectedStatus,allowed){
    for(const origin of LEARNER_ORIGINS){
      const receipt=await client.request(profile,async(url,options)=>{
        assert.equal(options.credentials,'omit');
        assert.equal(options.body,undefined);
        const response=await handlers.status(new Request(url,{...options,headers:{Origin:origin}}));
        assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
        return response;
      });
      assert.equal(receipt.status,expectedStatus);
      assert.equal(client.receipt(profile,receipt,Date.parse(now)),allowed);
      if(!allowed) assert.equal(receipt.profile,null);
    }
  }
  await check('unapproved',false);
  await act('approve');
  await check('approved',true);
  await act('suspend');
  await check('suspended',false);
  await act('approve');
  await act('revoke');
  await check('revoked',false);
  await act('approve');
  sourceCommit='b'.repeat(40); // Same bytes in a later source revision must not revive approval.
  await check('changed',false);
  await act('approve');
  now=profile.expiresOn+'T04:59:59.000Z'; // December: New York midnight is 05:00 UTC.
  await check('approved',true);
  now=profile.expiresOn+'T05:00:00.000Z';
  await check('expired',false);
});
