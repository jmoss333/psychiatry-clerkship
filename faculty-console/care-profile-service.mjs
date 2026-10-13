import {randomUUID} from 'node:crypto';
import {APPROVER,PRINCIPAL,PROFILE_PATH,PROFILE_ID,REVISION,AuthorityError,requireThat,exactKeys,
  profileRevision,publicProfile,validateProfile,expiresOn,newYorkDate,secretEqual,signAuthority,verifyAuthority} from './care-profile-authority.mjs';

export const CONSOLE_ORIGIN='https://clerkship-faculty-attest.netlify.app';
export const LEARNER_ORIGINS=Object.freeze(['https://une-ms3-psychiatry.netlify.app','https://mmc-psychiatry-residents-sanford.netlify.app']);
const MAX_BODY=2048;
function json(value,status,origin='') {
  return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin}: {})}});
}
function configured(env) {
  requireThat(env.CONTEXT==='production' && typeof env.CARE_PROFILE_OWNER_KEY==='string' && env.CARE_PROFILE_OWNER_KEY.length>=32
    && typeof env.CARE_PROFILE_SIGNING_SECRET==='string' && env.CARE_PROFILE_SIGNING_SECRET.length>=32
    && !secretEqual(env.CARE_PROFILE_OWNER_KEY,env.CARE_PROFILE_SIGNING_SECRET)
    && !secretEqual(env.CARE_PROFILE_OWNER_KEY,env.FACULTY_ATTEST_PASSWORD));
}
function requestShape(request,owner) {
  const url=new URL(request.url), origin=request.headers.get('Origin');
  requireThat(url.origin===CONSOLE_ORIGIN && (owner?(origin===CONSOLE_ORIGIN || request.method==='GET' && !origin):LEARNER_ORIGINS.includes(origin)),403,'origin-not-allowed');
  return {url,origin};
}
export function createCareProfileHandlers({env,store,readCandidates,now=()=>new Date().toISOString(),newVersion=randomUUID}) {
  async function snapshot(at) {
    const result=await readCandidates();
    requireThat(result && /^[a-f0-9]{40}$/.test(result.commit) && Array.isArray(result.profiles) && result.profiles.length<=12);
    const ids=new Set();
    for(const p of result.profiles){validateProfile(p,at);requireThat(!ids.has(p.id),503,'invalid-profile');ids.add(p.id);}
    return result;
  }
  async function stored(profileId) {
    const value=await store.getWithMetadata('profile/'+profileId,{type:'json',consistency:'strong'});
    if(value===null) return null;
    requireThat(value && typeof value.etag==='string' && value.etag.length>0);
    const data=verifyAuthority(value.data,env.CARE_PROFILE_SIGNING_SECRET);
    requireThat(data.profileId===profileId);
    return {data,etag:value.etag};
  }
  function result(profileId,revision,at,status,profile=null,expiry=null) {
    const ok=status==='approved';
    return {ok,status,profileId,revision,expiresOn:expiry,checkedAt:at,approver:ok?APPROVER:null,profile:ok?publicProfile(profile):null};
  }
  async function status(request) {
    let origin='',id='',revision='',at=null;
    try {
      const shape=requestShape(request,false);origin=shape.origin;
      requireThat(request.method==='GET',405,'method-not-allowed');
      const params=shape.url.searchParams;
      requireThat([...params.keys()].length===2 && params.has('profileId') && params.has('revision'),400,'invalid-request');
      id=params.get('profileId');revision=params.get('revision');
      requireThat(PROFILE_ID.test(id) && REVISION.test(revision),400,'invalid-request');
      configured(env);at=now();newYorkDate(at);
      const current=await snapshot(at), profile=current.profiles.find(p=>p.id===id);
      if(!profile) return json(result(id,revision,at,'missing'),200,origin);
      const value=await stored(id);
      if(!value) return json(result(id,revision,at,'unapproved'),200,origin);
      const authority=value.data;
      if(authority.status!=='approved') return json(result(id,revision,at,authority.status),200,origin);
      if(authority.revision!==revision || profileRevision(profile)!==revision || authority.sourceCommit!==current.commit) return json(result(id,revision,at,'changed'),200,origin);
      const expiry=expiresOn(profile);
      requireThat(authority.expiresOn===expiry && authority.approvedAt<=at && authority.changedAt<=at);
      if(newYorkDate(at)>=expiry) return json(result(id,revision,at,'expired',null,expiry),200,origin);
      return json(result(id,revision,at,'approved',profile,expiry),200,origin);
    } catch(error) {
      return json(result(PROFILE_ID.test(id)?id:null,REVISION.test(revision)?revision:null,at,error instanceof AuthorityError?error.code:'authority-unavailable'),error instanceof AuthorityError?error.status:503,origin);
    }
  }
  async function approvals(request) {
    let origin='';
    try {
      const shape=requestShape(request,true);origin=shape.origin;
      requireThat(['GET','POST'].includes(request.method),405,'method-not-allowed');
      requireThat(shape.url.search==='',400,'invalid-request');
      configured(env);
      requireThat(secretEqual(request.headers.get('x-care-profile-owner-key'),env.CARE_PROFILE_OWNER_KEY),401,'unauthorized');
      const at=now();newYorkDate(at);
      if(request.method==='GET') {
        const current=await snapshot(at), profiles=[];
        for(const profile of current.profiles){const value=await stored(profile.id), revision=profileRevision(profile), expiry=expiresOn(profile);
          let status=value?.data.status||'unapproved';
          if(status==='approved')status=value.data.revision!==revision || value.data.sourceCommit!==current.commit?'changed':newYorkDate(at)>=expiry?'expired':'approved';
          profiles.push({profile,revision,sourceCommit:current.commit,expiresOn:expiry,
            authority:{status,version:value?.data.version||null,revision:value?.data.revision||null}});}
        return json({ok:true,profiles,approver:APPROVER},200,origin);
      }
      requireThat(request.headers.get('Content-Type')?.split(';')[0]==='application/json',400,'invalid-request');
      const text=await request.text();requireThat(Buffer.byteLength(text)<=MAX_BODY,413,'request-too-large');
      let body;try{body=JSON.parse(text);}catch{throw new AuthorityError(400,'invalid-request');}
      requireThat(exactKeys(body,['action','profileId','revision','expectedVersion','expectedSourceCommit']) && ['approve','suspend','revoke'].includes(body.action)
        && PROFILE_ID.test(body.profileId) && REVISION.test(body.revision)
        && typeof body.expectedSourceCommit==='string' && /^[a-f0-9]{40}$/.test(body.expectedSourceCommit)
        && (body.expectedVersion===null || typeof body.expectedVersion==='string' && /^[a-f0-9-]{36}$/.test(body.expectedVersion)),400,'invalid-request');
      const previous=await stored(body.profileId);
      requireThat((previous?.data.version||null)===body.expectedVersion,409,'approval-changed');
      let value;
      if(body.action==='approve') {
        const current=await snapshot(at), profile=current.profiles.find(p=>p.id===body.profileId);
        requireThat(profile && profileRevision(profile)===body.revision && current.commit===body.expectedSourceCommit,409,'profile-changed');
        const expiry=expiresOn(profile);requireThat(newYorkDate(at)<expiry,409,'expired');
        value={schemaVersion:1,profileId:body.profileId,revision:body.revision,status:'approved',version:newVersion(),approvedAt:at,changedAt:at,
          principal:PRINCIPAL,expiresOn:expiry,sourceCommit:current.commit};
        // Re-read at save time; unrelated main commits do not invalidate the reviewed digest.
        const latest=await snapshot(at), latestProfile=latest.profiles.find(p=>p.id===body.profileId);
        requireThat(latestProfile && profileRevision(latestProfile)===body.revision && latest.commit===body.expectedSourceCommit,409,'profile-changed');
      } else {
        requireThat(previous!==null && previous.data.revision===body.revision,409,'approval-changed');
        const {signature,...old}=previous.data;
        value={...old,status:body.action==='suspend'?'suspended':'revoked',version:newVersion(),changedAt:at};
      }
      const signed=signAuthority(value,env.CARE_PROFILE_SIGNING_SECRET);
      verifyAuthority(signed,env.CARE_PROFILE_SIGNING_SECRET);
      const write=await store.setJSON('profile/'+body.profileId,signed,previous?{onlyIfMatch:previous.etag}:{onlyIfNew:true});
      requireThat(write?.modified===true,409,'approval-changed');
      requireThat(typeof write.etag==='string' && write.etag.length>0);
      const saved=await stored(body.profileId);requireThat(saved?.data.version===value.version,409,'approval-changed');
      return json({ok:true,status:value.status,profileId:body.profileId,revision:body.revision,expiresOn:value.expiresOn,checkedAt:at,approver:APPROVER,version:value.version},200,origin);
    } catch(error) {
      return json({ok:false,status:error instanceof AuthorityError?error.code:'authority-unavailable'},error instanceof AuthorityError?error.status:503,origin);
    }
  }
  return {status,approvals};
}

// No candidate or authority is bundled into a deploy. Source is read from one immutable main snapshot.
export function githubCandidates({env,fetchImpl=globalThis.fetch}) {
  return async () => {
    requireThat(typeof env.GITHUB_TOKEN==='string' && env.GITHUB_TOKEN.length>0);
    const repo=env.GITHUB_REPO||'jmoss333/psychiatry-clerkship';
    requireThat(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo));
    async function get(path) {
      const response=await fetchImpl('https://api.github.com/repos/'+repo+path,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+env.GITHUB_TOKEN,'X-GitHub-Api-Version':'2026-03-10'},cache:'no-store',signal:AbortSignal.timeout(10000)});
      requireThat(response.ok);const text=await response.text();requireThat(Buffer.byteLength(text)<=256*1024);return JSON.parse(text);
    }
    const ref=await get('/git/ref/heads/main'), commit=ref?.object?.sha;
    requireThat(typeof commit==='string' && /^[a-f0-9]{40}$/.test(commit));
    const history=await get('/commits?path='+encodeURIComponent(PROFILE_PATH)+'&sha='+commit+'&per_page=1');
    requireThat(Array.isArray(history) && history.length===1 && /^[a-f0-9]{40}$/.test(history[0]?.sha));
    const file=await get('/contents/'+PROFILE_PATH+'?ref='+commit);
    requireThat(file?.encoding==='base64' && typeof file.content==='string');
    const source=JSON.parse(Buffer.from(file.content,'base64').toString('utf8'));
    requireThat(exactKeys(source,['schemaVersion','profiles']) && source.schemaVersion===1 && Array.isArray(source.profiles));
    // Conservatively bind all profiles to this file's last change commit. Returning old bytes
    // in a later commit cannot resurrect an approval, while unrelated main commits leave it valid.
    return {commit:history[0].sha,profiles:source.profiles};
  };
}
export function authorityStoreOptions(env) {
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  requireThat(typeof env.SITE_ID==='string' && uuid.test(env.SITE_ID)
    && typeof env.CARE_PROFILE_STORE_SITE_ID==='string' && uuid.test(env.CARE_PROFILE_STORE_SITE_ID)
    && env.CARE_PROFILE_STORE_SITE_ID.toLowerCase()!==env.SITE_ID.toLowerCase()
    && typeof env.CARE_PROFILE_STORE_TOKEN==='string' && env.CARE_PROFILE_STORE_TOKEN.length>=32);
  return {name:'care-profile-authority-v1',siteID:env.CARE_PROFILE_STORE_SITE_ID,token:env.CARE_PROFILE_STORE_TOKEN,consistency:'strong'};
}
export async function productionHandlers(env=process.env) {
  // Do not even open the production store from a preview or unconfigured deploy.
  configured(env);
  const options=authorityStoreOptions(env);
  const {getStore}=await import('@netlify/blobs');
  const store=getStore(options);
  return createCareProfileHandlers({env,store,readCandidates:githubCandidates({env})});
}
export async function routeProduction(request,route) {
  try{return await (await productionHandlers())[route](request);}
  catch{return json({ok:false,status:'authority-unavailable',profileId:null,revision:null,expiresOn:null,checkedAt:null,approver:null,profile:null},503);}
}
