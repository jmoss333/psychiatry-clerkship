import test from 'node:test';
import assert from 'node:assert/strict';

import * as authority from '../faculty-console/care-profile-authority.mjs';
import * as service from '../faculty-console/care-profile-service.mjs';
const FIXTURE_OWNER_KEY = 'fixture-owner-only-credential-000000000000';
const FIXTURE_SIGNING_KEY = 'fixture-production-signing-key-000000000';
const origin = 'https://clerkship-faculty-attest.netlify.app';
const learner = 'https://une-ms3-psychiatry.netlify.app';
const now = '2026-10-13T12:00:00.000Z';
const candidate = () => ({ id: 'fictional-unit', label: 'Fictional unit', org: null,
  brandingApproved: false, unitName: 'Fictional unit', unitPhone: '207-555-0100',
  unitPurpose: 'Questions about discharge instructions', unitHours: 'Weekdays, morning hours',
  callbackProgram: false, callbackTeam: '', callbackPhone: '', callbackHours: '', callbackFallback: '',
  verification: ['identity', 'contact'].map(field => ({field, checkedOn: '2026-10-01',
    checkedBy: 'unit manager', evidence: 'Fictional test evidence only.'})) });

function storage() {
  let row = null, etag = 0;
  return { reads: [], writes: [],
    async getWithMetadata(key, options) { this.reads.push(options); return row && {data: structuredClone(row), etag: String(etag)}; },
    async setJSON(key, value, options) {
      if ((options.onlyIfNew && row) || (options.onlyIfMatch !== undefined && options.onlyIfMatch !== String(etag))) return {modified:false};
      row = structuredClone(value); etag++; this.writes.push(value); return {modified:true, etag:String(etag)};
    },
    tamper(fn) { row = fn(structuredClone(row)); },
    get row() { return row; },
  };
}
function harness(options = {}) {
  let profiles = [candidate()];
  const store = options.store || storage();
  const env = {CONTEXT:'production', CARE_PROFILE_OWNER_KEY:FIXTURE_OWNER_KEY,
    CARE_PROFILE_SIGNING_SECRET:FIXTURE_SIGNING_KEY, ...options.env};
  const handlers = service.createCareProfileHandlers({env, store, now: () => options.now || now,
    readCandidates: async () => ({commit:'a'.repeat(40), profiles:structuredClone(profiles)})});
  const owner = (body, key = FIXTURE_OWNER_KEY) => handlers.approvals(new Request(origin+'/.netlify/functions/care-profile-approvals', {
    method:body ? 'POST' : 'GET', headers:{Origin:origin,'x-care-profile-owner-key':key,'Content-Type':'application/json'},
    ...(body ? {body:JSON.stringify(body)} : {})}));
  const status = (revision, caller = learner, extra = '') => handlers.status(new Request(origin+'/.netlify/functions/care-profile-status?profileId=fictional-unit&revision='+revision+extra,{headers:{Origin:caller}}));
  return {store, owner, status, setProfiles: value => {profiles=value;}};
}
async function approve(h) {
  const loaded = await (await h.owner()).json();
  const row = loaded.profiles[0];
  return (await h.owner({action:'approve',profileId:row.profile.id,revision:row.revision,expectedVersion:row.authority.version})).json();
}

test('authority module is available', () => assert.equal(typeof authority.profileRevision, 'function'));
test('canonical revision covers private verification and ignores object key order only', () => {
  const p=candidate(), revision=authority.profileRevision(p);
  assert.match(revision,/^[0-9a-f]{64}$/);
  assert.equal(authority.profileRevision(Object.fromEntries(Object.entries(p).reverse())),revision);
  for (const key of Object.keys(p)) {
    const changed=structuredClone(p);
    if(key==='verification') changed.verification[0].evidence+=' More.';
    else if(typeof changed[key]==='boolean') continue;
    else if(key==='org') continue;
    else changed[key]+='x';
    assert.notEqual(authority.profileRevision(changed),revision,key);
  }
  // Independently calculated with Python json.dumps(sort_keys=True,separators=(',',':')).
  assert.equal(revision,'12593c3bedcda2a1fd49aabf5bf998997eece9d70cb4cba175d088c8d29c5aa5');
});
test('oldest grouped verification determines first invalid NY date across DST', () => {
  const p=candidate();p.verification[0].checkedOn='2026-08-06';
  assert.equal(authority.expiresOn(p),'2026-11-04');
  assert.equal(authority.newYorkDate('2026-11-04T04:59:59Z'),'2026-11-03');
  assert.equal(authority.newYorkDate('2026-11-04T05:00:00Z'),'2026-11-04');
  assert.throws(()=>authority.validateProfile({...p,verification:[{...p.verification[0],checkedOn:'2026-02-30'}]},now));
  assert.throws(()=>authority.validateProfile({...p,verification:p.verification.slice(0,1)},now));
  assert.throws(()=>authority.validateProfile({...p,approvedBy:'Joshua Moss, MD'},now));
});
test('unconfigured or preview service cannot approve; shared credential does not identify owner', async () => {
  for(const env of [{CARE_PROFILE_OWNER_KEY:''},{CARE_PROFILE_SIGNING_SECRET:''},{CONTEXT:'deploy-preview'}]) {
    const h=harness({env});assert.equal((await h.owner()).status,503);assert.equal(h.store.writes.length,0);
  }
  const h=harness({env:{FACULTY_ATTEST_PASSWORD:'shared-key',ATTESTER_NAME:'Joshua Moss, MD'}});
  assert.equal((await h.owner(undefined,'shared-key')).status,401);assert.equal(h.store.writes.length,0);
});
test('exact-version approval returns only independently read public fields; changed evidence invalidates', async () => {
  const h=harness(), result=await approve(h);assert.equal(result.ok,true);
  const response=await h.status(result.revision), body=await response.json();
  assert.equal(body.ok,true);assert.equal(body.approver,'Joshua Moss, MD');
  assert.equal(body.expiresOn,'2026-12-30');assert.equal(body.profile.verification,undefined);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(Object.keys(body).sort(),['ok','status','profileId','revision','expiresOn','checkedAt','approver','profile'].sort());
  assert.ok(h.store.reads.every(o=>o.consistency==='strong'));
  const p=candidate();p.verification[0].evidence='Changed evidence';h.setProfiles([p]);
  const changed=await (await h.status(result.revision)).json();assert.equal(changed.ok,false);assert.equal(changed.profile,null);
});
test('source edit while owner reviews refuses approval without saving authority', async () => {
  const h=harness(), loaded=await (await h.owner()).json(), row=loaded.profiles[0];
  const p=candidate();p.unitHours='Afternoons';h.setProfiles([p]);
  const response=await h.owner({action:'approve',profileId:p.id,revision:row.revision,expectedVersion:null});
  assert.equal(response.status,409);assert.equal(h.store.writes.length,0);
});
test('revoke and suspend immediately deny old revisions, and stale requests cannot restore them', async () => {
  for(const action of ['revoke','suspend']) {
    const h=harness(), approved=await approve(h);
    const response=await h.owner({action,profileId:'fictional-unit',revision:approved.revision,expectedVersion:approved.version});
    assert.equal(response.status,200);
    const body=await (await h.status(approved.revision)).json();assert.equal(body.status,action==='revoke'?'revoked':'suspended');assert.equal(body.ok,false);
    const stale=await h.owner({action:'approve',profileId:'fictional-unit',revision:approved.revision,expectedVersion:approved.version});
    assert.equal(stale.status,409);
  }
});
test('signed store tampering, expiry, read failures and unrecognized callers fail closed', async () => {
  const h=harness(), approved=await approve(h);
  h.store.tamper(row=>({...row,profileId:'another-unit'}));
  assert.equal((await (await h.status(approved.revision)).json()).ok,false);
  const expired=harness({now:'2026-12-30T05:00:00Z'});assert.equal((await approve(expired)).ok,false);
  assert.equal((await h.status(approved.revision,'https://evil.example')).status,403);
  assert.equal((await h.status(approved.revision,learner,'&patient=anything')).status,400);
  const offline=harness({store:{getWithMetadata:async()=>{throw Error('offline');}}});
  assert.equal((await offline.status(approved.revision)).status,503);
});
test('approval identity and signing metadata are server derived', async () => {
  const h=harness(), loaded=await (await h.owner()).json();
  const response=await h.owner({action:'approve',profileId:'fictional-unit',revision:loaded.profiles[0].revision,expectedVersion:null,approvedBy:'Joshua Moss, MD'});
  assert.equal(response.status,400);assert.equal(h.store.writes.length,0);
});
test('withdrawal does not depend on a still-valid source file', async () => {
  const h=harness(), approved=await approve(h);h.setProfiles([]);
  const response=await h.owner({action:'revoke',profileId:'fictional-unit',revision:approved.revision,expectedVersion:approved.version});
  assert.equal(response.status,200);assert.equal(h.store.row.status,'revoked');
});
test('simultaneous approval and revoke cannot silently overwrite each other', async () => {
  const h=harness(), approved=await approve(h);
  const body={profileId:'fictional-unit',revision:approved.revision,expectedVersion:approved.version};
  const responses=await Promise.all(['approve','revoke'].map(action=>h.owner({...body,action})));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
});
test('same-origin browser GET needs no Origin header, but an originless POST is rejected', async () => {
  const store=storage();const handlers=service.createCareProfileHandlers({env:{CONTEXT:'production',CARE_PROFILE_OWNER_KEY:FIXTURE_OWNER_KEY,CARE_PROFILE_SIGNING_SECRET:FIXTURE_SIGNING_KEY},store,
    now:()=>now,readCandidates:async()=>({commit:'a'.repeat(40),profiles:[]})});
  const url=origin+'/.netlify/functions/care-profile-approvals';
  assert.equal((await handlers.approvals(new Request(url,{headers:{'x-care-profile-owner-key':FIXTURE_OWNER_KEY}}))).status,200);
  assert.equal((await handlers.approvals(new Request(url,{method:'POST',headers:{'x-care-profile-owner-key':FIXTURE_OWNER_KEY}}))).status,403);
});
