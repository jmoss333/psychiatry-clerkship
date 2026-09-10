import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {previewCapabilities,capabilitiesResponse} from '../lib/capabilities.mjs';
import handler from '../netlify/functions/preview-capabilities.mjs';

const context={deploy:{id:'actual-runtime-deploy'}};
const enabled={DANA_PREVIEW_ENABLED:'true',DANA_MOMENTS_ENABLED:'true'};
const request=method=>new Request('https://preview.test/api/preview-capabilities',{method});

test('moment availability requires both exact runtime flags and a trusted invocation deployment',()=>{
 assert.deepEqual(previewCapabilities(enabled,context),{momentsEnabled:true});
 for(const key of Object.keys(enabled))for(const value of [undefined,'false','TRUE','1',true]){
  assert.deepEqual(previewCapabilities({...enabled,[key]:value},context),{momentsEnabled:false});
 }
 for(const missingContext of [undefined,{}, {deploy:{}}, {deploy:{id:''}}]){
  assert.deepEqual(previewCapabilities({...enabled,DEPLOY_ID:'stale-build-id'},missingContext),{momentsEnabled:false});
 }
});

test('public capability response exposes only availability and cannot inspect secrets or usage',async()=>{
 const environment=new Proxy(enabled,{get(target,key){assert.ok(Object.hasOwn(target,key),'must not inspect '+String(key));return target[key];}});
 const response=capabilitiesResponse(request('GET'),environment,{...context,site:{id:'private-site'},account:{id:'private-account'}});
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{momentsEnabled:true});
 assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 assert.equal(response.headers.get('access-control-allow-origin'),null);
});

test('capability reader refuses non-GET methods without inspecting configuration',async()=>{
 const unreadable=new Proxy({},{get(){throw new Error('configuration must not be read');}});
 for(const method of ['POST','PUT','PATCH','DELETE','HEAD','OPTIONS']){
  const response=capabilitiesResponse(request(method),unreadable,context);
  assert.equal(response.status,405);assert.equal(response.headers.get('allow'),'GET');
  assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(await response.text(),'');
 }
});

test('runtime function reads exactly the two flags and fails closed if configuration is unavailable',async()=>{
 const saved=Object.getOwnPropertyDescriptor(globalThis,'Netlify');const reads=[];
 try{
  globalThis.Netlify={env:{get(key){reads.push(key);assert.ok(Object.hasOwn(enabled,key));return enabled[key];}}};
  assert.deepEqual(await handler(request('GET'),context).json(),{momentsEnabled:true});
  assert.deepEqual(reads,['DANA_PREVIEW_ENABLED','DANA_MOMENTS_ENABLED']);reads.length=0;
  assert.equal(handler(request('POST'),context).status,405);assert.deepEqual(reads,[]);
  globalThis.Netlify={env:{get(){throw new Error('unavailable');}}};
  assert.deepEqual(await handler(request('GET'),context).json(),{momentsEnabled:false});
 }finally{if(saved)Object.defineProperty(globalThis,'Netlify',saved);else delete globalThis.Netlify;}
});

test('capability function bundles only its pure reader and uses the explicit same-origin rewrite',async()=>{
 const entry=new URL('../netlify/functions/preview-capabilities.mjs',import.meta.url);
 const result=await build({entryPoints:[entry.pathname],bundle:true,platform:'node',target:'node22',format:'esm',write:false,metafile:true,logLevel:'silent'});
 const inputs=Object.keys(result.metafile.inputs);
 assert.equal(inputs.length,2);assert.ok(inputs.every(file=>file.endsWith('/lib/capabilities.mjs')||file.endsWith('/netlify/functions/preview-capabilities.mjs')));
 const config=await readFile(new URL('../netlify.toml',import.meta.url),'utf8');
 assert.match(config,/from = "\/api\/preview-capabilities"\s+to = "\/\.netlify\/functions\/preview-capabilities"\s+status = 200\s+force = true/);
 assert.doesNotMatch(await readFile(entry,'utf8'),/export\s+const\s+config\s*=\s*\{[^}]*path\s*:/);
});
