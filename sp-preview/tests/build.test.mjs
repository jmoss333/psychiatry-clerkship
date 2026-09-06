import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import {runtimeEnvironment} from '../netlify/functions/dana-preview.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('runtime deployment binding comes from trusted invocation context, not build-only variables',()=>{
 const env=runtimeEnvironment({DEPLOY_ID:'stale-build',DANA_PREVIEW_ENABLED:'true'},{deploy:{id:'actual-deploy'},site:{url:'https://preview.test'}});
 assert.equal(env.DEPLOY_ID,'actual-deploy');assert.equal(env.URL,'https://preview.test');assert.equal(env.DANA_PREVIEW_ENABLED,'true');
 assert.equal(runtimeEnvironment({DEPLOY_ID:'build-only'},{}).DEPLOY_ID,undefined);
});
test('only the three explicit browser files ship; private case and keys remain outside dist',async()=>{
 const run=spawnSync(process.execPath,['build.mjs'],{cwd:root,encoding:'utf8'});assert.equal(run.status,0,run.stderr);
 assert.deepEqual((await readdir(path.join(root,'dist'))).sort(),['app.js','index.html','styles.css']);
 const publicText=(await Promise.all(['app.js','index.html','styles.css'].map(file=>readFile(path.join(root,'dist',file),'utf8')))).join('\n');
 for(const forbidden of ['OPENAI_API_KEY','DANA_PREVIEW_STATE_KEY','hiddenAgenda','Tom has a sleep medication','ordinaryFacts','sp-interview.pack.json'])assert.ok(!publicText.includes(forbidden),forbidden);
 const config=await readFile(path.join(root,'netlify.toml'),'utf8');
 assert.match(config,/publish = "dist"/);assert.match(config,/from = "\/api\/dana-preview"/);assert.match(config,/force = true/);assert.match(config,/microphone=\(self\)/);assert.match(config,/Cache-Control = "no-store"/);
});
test('the modern function bundles with its private grounding and no Python runtime',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'dana-hosted-bundle-'));
 try{
  const result=await build({entryPoints:[path.join(root,'netlify/functions/dana-preview.mjs')],outfile:path.join(dir,'dana.mjs'),bundle:true,platform:'node',target:'node22',format:'esm',write:false,metafile:true,external:['@netlify/blobs'],logLevel:'silent'});
  assert.equal(result.errors.length,0);assert.ok(result.outputFiles[0].text.includes('hosted-dana-v1'));
  assert.ok(!Object.keys(result.metafile.inputs).some(file=>file.includes('dana-openai-worker.py')||file.includes('dana-live-server.mjs')));
 }finally{await rm(dir,{recursive:true,force:true});}
 const entry=await readFile(path.join(root,'netlify/functions/dana-preview.mjs'),'utf8');
 assert.doesNotMatch(entry,/export\s+const\s+config\s*=\s*\{[^}]*path\s*:/);
});
