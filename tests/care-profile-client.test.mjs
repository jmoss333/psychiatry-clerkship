import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
const file = new URL('../13_Faculty_Resources/_automation/site_build/frontdoor/fd_care_profile.js', import.meta.url);
const source = existsSync(file) ? readFileSync(file, 'utf8') : '';
const api = new Function(source + ';return typeof fdCareProfileReceipt === "function" ? {receipt:fdCareProfileReceipt,date:fdCareProfileDate,request:fdCareProfileRequest,days:typeof fdCareProfileDaysRemaining === "function" ? fdCareProfileDaysRemaining : null} : {};')();
const profile = { id:'fixture-unit',label:'Fixture',org:null,brandingApproved:false,unitName:'Fixture Unit',unitPhone:'(207) 555-0142',
  unitPurpose:'questions about discharge paperwork',unitHours:'Monday to Friday, 9 a.m. to 5 p.m. Eastern',callbackProgram:false,
  callbackTeam:'',callbackPhone:'',callbackHours:'',callbackFallback:'',revision:'a'.repeat(64),expiresOn:'2026-10-13',usableThrough:'2026-10-12' };
const now = Date.parse('2026-10-13T03:59:59.000Z');
const publicProfile = Object.fromEntries(Object.entries(profile).filter(([k]) => !['revision','expiresOn','usableThrough'].includes(k)));
const receipt = () => ({ok:true,status:'approved',profileId:profile.id,revision:profile.revision,expiresOn:profile.expiresOn,
  checkedAt:new Date(now).toISOString(),approver:'Joshua Moss, MD',profile:{...publicProfile}});
test('approval expires at New York midnight, including daylight and standard time', () => {
  assert.equal(typeof api.date, 'function');
  for (const [instant,want] of [['2026-10-13T03:59:59Z','2026-10-12'],['2026-10-13T04:00:00Z','2026-10-13'],
    ['2026-12-13T04:59:59Z','2026-12-12'],['2026-12-13T05:00:00Z','2026-12-13']]) assert.equal(api.date(Date.parse(instant)),want);
  assert.equal(api.receipt(profile,receipt(),now),true);
  assert.equal(api.receipt(profile,receipt(),now+1000),false);
});
test('only a fresh exact-version receipt can authorize all the public profile fields', () => {
  assert.equal(typeof api.receipt, 'function');
  assert.equal(api.receipt(profile,receipt(),now),true);
  for (const key of Object.keys(publicProfile)) {
    const changed = structuredClone(receipt());
    changed.profile[key] = typeof changed.profile[key] === 'boolean' ? !changed.profile[key] : 'changed';
    assert.equal(api.receipt(profile,changed,now),false,key);
  }
  for (const patch of [{ok:false},{status:'revoked'},{status:'suspended'},{revision:'b'.repeat(64)},
    {profileId:'another-unit'},{expiresOn:'2099-01-01'},{checkedAt:new Date(now-60001).toISOString()},
    {checkedAt:new Date(now+5001).toISOString()},{checkedAt:'not a date'},{approver:'a typed name'},{profile:null}]) {
    assert.equal(api.receipt(profile,{...receipt(),...patch},now),false,JSON.stringify(patch));
  }
});
test('status request sends only the profile identity and version and bypasses caches', async () => {
  assert.equal(typeof api.request, 'function');
  let observed;
  const result = await api.request(profile, async (url,options) => { observed={url:new URL(url),options}; return {ok:true,json:async()=>receipt()}; });
  assert.equal(result.status,'approved');
  assert.equal(observed.url.origin,'https://clerkship-faculty-attest.netlify.app');
  assert.deepEqual([...observed.url.searchParams.keys()],['profileId','revision']);
  assert.equal(observed.options.cache,'no-store');
  assert.equal(observed.options.credentials,'omit');
  assert.equal(observed.options.redirect,'error');
  assert.equal(observed.options.body,undefined);
  assert.equal((await api.request(profile,async()=>{throw new Error('offline');})).ok,false);
  assert.equal((await api.request(profile,async()=>({ok:false}))).ok,false);
});
test('expiry warning counts calendar days in New York across the daylight saving boundary', () => {
  assert.equal(typeof api.days,'function');
  assert.equal(api.days('2026-11-02',Date.parse('2026-11-01T04:01:00Z')),1);
  assert.equal(api.days('2026-11-02',Date.parse('2026-11-02T04:59:59Z')),1);
  assert.equal(api.days('2026-11-02',Date.parse('2026-11-02T05:00:00Z')),0);
  assert.equal(api.days('2026-02-30',now),null);
  assert.equal(api.days('2026-11-02',NaN),null);
});
