import test from 'node:test';
import assert from 'node:assert/strict';
import * as ui from '../faculty-console/care-profiles.mjs';
const row={profile:{id:'fixture'},revision:'a'.repeat(64),expiresOn:'2026-12-30',authority:{status:'unapproved',version:null,revision:null}};
const snapshot={ok:true,approver:'Joshua Moss, MD',profiles:[row]};
function harness(fetchImpl) {const values=new Map();const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};return ui.createOwnerReview({fetchImpl,storage});}
test('owner console requires deliberate review before sending exact saved version',async()=>{
  const calls=[], client=harness(async(url,options)=>{calls.push(options);return new Response(JSON.stringify(options.method==='GET'?snapshot:{ok:true,status:'approved',profileId:'fixture',revision:row.revision,version:'fixture-version',approver:'Joshua Moss, MD'}));});
  await client.unlock('fixture-owner-key');
  await assert.rejects(client.decide('fixture','approve',false),/Review/);assert.equal(calls.length,1);
  await client.decide('fixture','approve',true);
  assert.deepEqual(JSON.parse(calls[1].body),{action:'approve',profileId:'fixture',revision:row.revision,expectedVersion:null});
  assert.equal(calls[1].headers['x-faculty-key'],undefined);assert.equal(calls[1].cache,'no-store');
  assert.equal(client.state.profiles,null);
});
test('locking during a pending load discards the response and saved credential',async()=>{
  let release;const client=harness(()=>new Promise(resolve=>{release=resolve;}));
  const pending=client.unlock('fixture-owner-key');client.lock();release(new Response(JSON.stringify(snapshot)));await pending;
  assert.equal(client.state.profiles,null);assert.equal(client.state.unlocked,false);
});
test('a conflict clears review state and never retries or reports successful approval',async()=>{
  let calls=0;const client=harness(async()=>{calls++;return new Response(JSON.stringify(calls===1?snapshot:{ok:false,status:'approval-changed'}),{status:calls===1?200:409});});
  await client.unlock('fixture-owner-key');await client.decide('fixture','approve',true);
  assert.equal(calls,2);assert.equal(client.state.profiles,null);assert.match(client.state.notice,/Reload/);
});
