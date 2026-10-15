import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Root tests also run in dependency-free learner builds. Load the real entrypoint,
// service and authority modules; replace only the external storage boundary. No
// production injection seam, installed package, inherited credential or network is needed.
const PROBE = String.raw`
  import {readFileSync} from 'node:fs';
  import * as crypto from 'node:crypto';
  import {pathToFileURL} from 'node:url';
  import {createContext, SourceTextModule, SyntheticModule} from 'node:vm';
  const input = JSON.parse(process.argv[1]);
  const env = {
    CARE_PROFILE_OWNER_KEY:'synthetic-owner-key-0000000000000000000',
    CARE_PROFILE_SIGNING_SECRET:'synthetic-signing-key-00000000000000000',
    SITE_ID:'11111111-1111-4111-8111-111111111111',
    CARE_PROFILE_STORE_SITE_ID:'22222222-2222-4222-8222-222222222222',
    CARE_PROFILE_STORE_TOKEN:'synthetic-store-token-00000000000000000',
    ...input.env,
  };
  let storeOpens = 0, storeReads = 0, storeWrites = 0, networkCalls = 0;
  const diagnostics = [];
  const sandbox = createContext({process:{env}, Buffer, Request, Response, URL,
    console:{error:(...args)=>diagnostics.push(args)},
    structuredClone, AbortSignal, fetch:async()=>{
      networkCalls++; throw new Error('Runtime probe forbids network access');
    }});
  const modules = new Map();
  function moduleFor(specifier, parent) {
    const id = specifier.startsWith('.') ? new URL(specifier,parent.identifier).href : specifier;
    if (modules.has(id)) return modules.get(id);
    let module;
    if (id === 'node:crypto') {
      const names = ['randomUUID','createHash','createHmac','timingSafeEqual'];
      module = new SyntheticModule(names,function(){
        for(const name of names)this.setExport(name,crypto[name]);
      },{context:sandbox,identifier:id});
    } else if (id === '@netlify/blobs') {
      if(input.failure==='import')throw new Error('private-dependency-error '+env.CARE_PROFILE_STORE_TOKEN);
      module = new SyntheticModule(['getStore'],function(){
        this.setExport('getStore',()=>{
          storeOpens++;
          if(input.failure==='store')throw new Error('private-dependency-error '+env.CARE_PROFILE_STORE_TOKEN);
          return {
            getWithMetadata:async()=>{storeReads++;throw new Error('Unexpected store read');},
            setJSON:async()=>{storeWrites++;throw new Error('Unexpected store write');},
          };
        });
      },{context:sandbox,identifier:id});
    } else {
      if (!id.startsWith('file:')) throw new Error('Unexpected module '+id);
      module = new SourceTextModule(readFileSync(new URL(id),'utf8'),{
        context:sandbox,identifier:id,
        importModuleDynamically:async(specifier,parent)=>{
          const dependency = moduleFor(specifier,parent);
          if(dependency.status==='unlinked')await dependency.link(moduleFor);
          if(dependency.status==='linked')await dependency.evaluate();
          return dependency;
        },
      });
    }
    modules.set(id,module);
    return module;
  }
  const url = pathToFileURL(process.cwd()+'/faculty-console/netlify/functions/care-profile-'+input.route+'.mjs').href;
  const entrypoint = moduleFor(url);
  await entrypoint.link(moduleFor);
  await entrypoint.evaluate();
  const request = new Request('https://clerkship-faculty-attest.netlify.app/.netlify/functions/care-profile-'+input.route,{
    headers:input.route==='status'?{Origin:'https://une-ms3-psychiatry.netlify.app'}:{},
  });
  const response = await entrypoint.namespace.default(request,input.context);
  console.log(JSON.stringify({status:response.status,body:await response.json(),
    storeOpens,storeReads,storeWrites,networkCalls,diagnostics}));
`;

function probe(route, context, env = {}, failure) {
  const child = spawnSync(process.execPath,
    ['--experimental-vm-modules','--no-warnings','--input-type=module','-e',PROBE,JSON.stringify({route,context,env,failure})],
    {cwd:ROOT,env:{},encoding:'utf8',timeout:10000});
  assert.equal(child.status,0,child.error?.message||child.stderr);
  assert.equal(child.stderr,'');
  assert.doesNotMatch(child.stdout,/synthetic-owner|synthetic-signing|synthetic-store|private-dependency-error/,
    'neither credentials nor arbitrary dependency error text may reach output');
  const result = JSON.parse(child.stdout);
  assert.equal(result.networkCalls,0,'configuration and unauthenticated validation need no network');
  assert.equal(result.storeReads,0);
  assert.equal(result.storeWrites,0);
  return result;
}

const contextOf = context => ({deploy:{context,id:'synthetic-deploy',published:context==='production',skewProtectionToken:''}});
for (const route of ['approvals','status']) {
  // Missing forwarding or falling back to an environment value rejects real production.
  for (const env of [{},{CONTEXT:'deploy-preview'}]) {
    test(`${route}: platform production context reaches request validation when env CONTEXT is ${env.CONTEXT||'absent'}`,()=>{
      const result = probe(route,contextOf('production'),env);
      assert.equal(result.status,route==='approvals'?401:400);
      assert.equal(result.body.status,route==='approvals'?'unauthorized':'invalid-request');
      assert.equal(result.storeOpens,1,'positive control: configured production opens its store');
      assert.deepEqual(result.diagnostics,[],'normal request denials are not startup failures');
    });
  }
  // Removing the context guard, using env.CONTEXT or defaulting a missing value to
  // production must fail these cases before the production store is even opened.
  for (const [label,context] of [['missing',undefined],['missing deploy',{}],
    ...['deploy-preview','branch-deploy','dev','unknown'].map(value=>[value,contextOf(value)])]) {
    test(`${route}: ${label} platform context refuses a spoofed production environment before opening storage`,()=>{
      const result = probe(route,context,{CONTEXT:'production'});
      assert.equal(result.status,503);
      assert.equal(result.body.status,'authority-unavailable');
      assert.equal(result.storeOpens,0);
      assert.deepEqual(result.diagnostics,[['care-profile-startup','configuration','context-not-production']]);
    });
  }
  for (const [label,env,stage,reasons] of [
    ['missing owner key',{CARE_PROFILE_OWNER_KEY:null},'configuration',['owner-key-missing']],
    ['empty owner key',{CARE_PROFILE_OWNER_KEY:''},'configuration',['owner-key-missing']],
    ['short owner key',{CARE_PROFILE_OWNER_KEY:'synthetic-owner-short'},'configuration',['owner-key-too-short']],
    ['missing signing secret',{CARE_PROFILE_SIGNING_SECRET:null},'configuration',['signing-secret-missing']],
    ['short signing secret',{CARE_PROFILE_SIGNING_SECRET:'synthetic-signing-short'},'configuration',['signing-secret-too-short']],
    ['reused signing secret',{CARE_PROFILE_SIGNING_SECRET:'synthetic-owner-key-0000000000000000000'},'configuration',['owner-signing-key-reused']],
    ['reused faculty password',{FACULTY_ATTEST_PASSWORD:'synthetic-owner-key-0000000000000000000'},'configuration',['owner-faculty-key-reused']],
    ['invalid console site ID',{SITE_ID:'synthetic-site-id'},'store-configuration',['console-site-id-invalid']],
    ['missing console site ID',{SITE_ID:null},'store-configuration',['console-site-id-invalid']],
    ['invalid store site ID',{CARE_PROFILE_STORE_SITE_ID:'synthetic-site-id'},'store-configuration',['store-site-id-invalid']],
    ['same site IDs',{CARE_PROFILE_STORE_SITE_ID:'11111111-1111-4111-8111-111111111111'},'store-configuration',['store-site-not-isolated']],
    ['missing store token',{CARE_PROFILE_STORE_TOKEN:null},'store-configuration',['store-token-missing']],
    ['short store token',{CARE_PROFILE_STORE_TOKEN:'synthetic-store-short'},'store-configuration',['store-token-too-short']],
    ['both owner secrets missing',{CARE_PROFILE_OWNER_KEY:null,CARE_PROFILE_SIGNING_SECRET:null},'configuration',['owner-key-missing','signing-secret-missing']],
  ]) {
    test(`${route}: ${label} logs only fixed startup reasons and preserves public denial`,()=>{
      const result=probe(route,contextOf('production'),env);
      assert.equal(result.status,503);
      assert.deepEqual(result.body,{ok:false,status:'authority-unavailable',profileId:null,revision:null,
        expiresOn:null,checkedAt:null,approver:null,profile:null});
      assert.equal(result.storeOpens,0,'invalid configuration must not open authority storage');
      assert.deepEqual(result.diagnostics,[['care-profile-startup',stage,...reasons]]);
    });
  }
  for(const [failure,stage,storeOpens] of [['import','dependency-import',0],['store','store-open',1]]) {
    test(`${route}: ${stage} failure logs its stage without exposing the dependency error`,()=>{
      const result=probe(route,contextOf('production'),{},failure);
      assert.equal(result.status,503);
      assert.deepEqual(result.body,{ok:false,status:'authority-unavailable',profileId:null,revision:null,
        expiresOn:null,checkedAt:null,approver:null,profile:null});
      assert.equal(result.storeOpens,storeOpens);
      assert.deepEqual(result.diagnostics,[['care-profile-startup',stage]]);
    });
  }
}
