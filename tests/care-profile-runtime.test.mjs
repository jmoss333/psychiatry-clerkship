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
  const sandbox = createContext({process:{env}, Buffer, Request, Response, URL,
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
      module = new SyntheticModule(['getStore'],function(){
        this.setExport('getStore',()=>{
          storeOpens++;
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
    storeOpens,storeReads,storeWrites,networkCalls}));
`;

function probe(route, context, env = {}) {
  const child = spawnSync(process.execPath,
    ['--experimental-vm-modules','--no-warnings','--input-type=module','-e',PROBE,JSON.stringify({route,context,env})],
    {cwd:ROOT,env:{},encoding:'utf8',timeout:10000});
  assert.equal(child.status,0,child.error?.message||child.stderr);
  assert.equal(child.stderr,'');
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
    });
  }
}
