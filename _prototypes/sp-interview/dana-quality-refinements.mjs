/* Separate synthetic refinement review; dry-run default, text-only live opt-in. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {buildReviewPacket,loadScenarios,loadCaseDefinition} from './dana-quality-benchmark.mjs';
import {createContext,validateReply} from './dana-live-context.mjs';
import {createOpenAIProvider} from './dana-openai-provider.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const FILE=path.join(HERE,'fixtures/dana-quality-refinements.json');
const COUNT=12;
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=()=>{throw new Error('Dana refinement fixtures or context are invalid.');};
export async function loadRefinements(file=FILE){
  try{
    const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>100000)fail();
    const value=JSON.parse(await fs.readFile(file,'utf8'));
    if(value.schemaVersion!==1||value.synthetic!==true||Object.keys(value).sort().join(',')!=='scenarios,schemaVersion,synthetic')fail();
    return value.scenarios;
  }catch{fail();}
}
export async function prepare({scenarios,caseDef,contextBuilder=createContext}={}){
  scenarios??=await loadRefinements();caseDef??=await loadCaseDefinition();
  if(!Array.isArray(scenarios)||scenarios.length!==COUNT||new Set(scenarios.map(x=>x?.id)).size!==COUNT||typeof contextBuilder!=='function')fail();
  const baseline=await loadScenarios();
  // Reuse the original exact-source, history and canonical-gate validators.
  // This baseline slot has no unique required coverage tag. Substituting only
  // in memory leaves the original twenty fixtures and benchmark unchanged.
  const slot=baseline.findIndex(x=>x.id==='opening-question');
  if(slot<0)fail();
  const cases=[];
  for(const scenario of scenarios){
    const batch=baseline.slice();batch[slot]=scenario;
    const item=buildReviewPacket({caseDef,scenarios:batch}).cases[slot];
    const transcript=[...item.priorTranscript.map(x=>({...x})),{who:'me',text:item.currentLearnerUtterance}];
    const learnerTexts=transcript.filter(x=>x.who==='me').map(x=>x.text);
    const canonical=createContext(caseDef,learnerTexts,transcript);
    let context;try{context=await contextBuilder(structuredClone(caseDef),learnerTexts.slice(),structuredClone(transcript));}catch{fail();}
    // Prompt experiments may alter wording, never historical words or gates.
    if(!context||typeof context.system!=='string'||!context.system.trim()||context.system.length>100000
      ||JSON.stringify(context.messages)!==JSON.stringify(canonical.messages)
      ||JSON.stringify(context.state)!==JSON.stringify(canonical.state))fail();
    item.modelInput={system:context.system,messages:context.messages};cases.push(item);
  }
  return cases;
}
async function directory(outDir){
  try{
    if(typeof outDir!=='string'||!outDir.trim()||outDir.length>4096||outDir.includes('\0'))throw new Error();
    const target=path.resolve(outDir);
    for(let parent=path.dirname(target);;parent=path.dirname(parent)){
      try{if((await fs.lstat(parent)).isSymbolicLink())throw new Error();}catch(error){if(error.code!=='ENOENT')throw error;}
      if(parent===path.dirname(parent))break;
    }
    await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});await fs.mkdir(target,{mode:0o700});return target;
  }catch{throw new Error('Dana refinement output requires a new writable directory without symbolic links.');}
}
function markdown(packet){
  const lines=['# Dana refinement review','',packet.interpretation,'',`Mode: ${packet.mode}. Planned text calls: ${packet.callsPlanned}. Attempted: ${packet.callsAttempted}. Speech calls: 0.`,''];
  for(const item of packet.cases){
    lines.push(`## ${item.title} — repeat ${item.repeat}`,'',`ID: ${item.id}`,'');
    for(const entry of item.priorTranscript)lines.push(`${entry.who==='me'?'Learner':'Dana'}: ${entry.text}`,'');
    lines.push(`Learner now: ${item.currentLearnerUtterance}`,'',`Dana: ${item.reply??'(No reply recorded.)'}`,'',`Structural outcome: ${item.structuralStatus}. Semantic review: not_reviewed.`,'','Expected:','');
    for(const value of item.expectations.should)lines.push('- '+value);
    lines.push('','Must not:','');for(const value of item.expectations.mustNot)lines.push('- '+value);
    lines.push('','Exact canonical source facts:','');for(const value of item.sourceReferences)lines.push(`- ${value.id}: ${value.text}`);
    lines.push('',`Canonical unlocked gates: ${item.canonicalState.unlockedGates.join(', ')||'none'}`,'','Human reviewer notes: ____________________','');
  }
  return lines.join('\n');
}
export async function run({live=false,outDir,repeats=2,provider,scenarios,caseDef,contextBuilder=createContext,contextLabel='current',contextSourceSha256}={}){
  if(typeof live!=='boolean'||!Number.isInteger(repeats)||repeats<1||repeats>3||(live&&!outDir))throw new Error('Use explicit live output and one to three repeats.');
  if(typeof contextLabel!=='string'||!/^[A-Za-z0-9_.-]{1,80}$/.test(contextLabel)||(contextSourceSha256!==undefined&&!/^[a-f0-9]{64}$/.test(contextSourceSha256)))throw new Error('Invalid context provenance.');
  const prepared=await prepare({scenarios,caseDef,contextBuilder});
  const target=outDir?await directory(outDir):null;
  const provenance={};
  for(const name of ['sp-interview.pack.json','dana-live-context.mjs','dana-openai-provider.mjs','dana-openai-worker.py','dana-quality-benchmark.mjs','dana-quality-refinements.mjs','fixtures/dana-quality-refinements.json'])provenance[name]=hash(await fs.readFile(path.join(HERE,name)));
  const packet={schemaVersion:1,benchmark:'Dana targeted quality refinements',synthetic:true,textOnly:true,mode:live?'live_text_only':'dry_run',scenarioCount:COUNT,repeats,callsPlanned:COUNT*repeats,callsAttempted:0,semanticReview:'not_reviewed',createdAt:new Date().toISOString(),
    interpretation:'Mechanical checks do not establish conversational quality. Human review must assess relevance, unsupported elaboration, explicit hearing questions, negation and repair; gates and exact source facts remain authoritative. No semantic score, automatic pass, or retry.',
    provenance,context:{label:contextLabel,injected:contextBuilder!==createContext,functionSha256:hash(String(contextBuilder)),sourceSha256:contextSourceSha256??(contextBuilder===createContext?provenance['dana-live-context.mjs']:null)},
    fixtureContentSha256:hash(JSON.stringify(prepared.map(({modelInput,...item})=>item))),cases:[]};
  for(let repeat=1;repeat<=repeats;repeat++)for(const item of prepared)packet.cases.push({...structuredClone(item),repeat});
  if(live){
    const actor=provider??createOpenAIProvider();
    for(const item of packet.cases){
      packet.callsAttempted++;
      let reply;try{reply=await actor.reply(item.modelInput);}catch{item.structuralStatus='provider_error';item.errorCode='reply_request_failed';continue;}
      try{item.reply=validateReply(reply);item.structuralStatus='reply_recorded';}catch{item.structuralStatus='invalid_spoken_reply';item.errorCode='reply_shape_invalid';}
    }
  }
  if(target){try{
    await fs.writeFile(path.join(target,'review.json'),JSON.stringify(packet,null,2)+'\n',{flag:'wx',mode:0o600});
    await fs.writeFile(path.join(target,'review.md'),markdown(packet),{flag:'wx',mode:0o600});
  }catch{throw new Error('Dana refinement review could not be saved.');}}
  return packet;
}
async function main(){
  let live=false,outDir,repeats=2,seenRepeats=false;const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help'){process.stdout.write('Dry-run: node dana-quality-refinements.mjs\nLive text only: node dana-quality-refinements.mjs --live --out <new-directory> [--repeats 1|2|3]\nDefault repeats: 2 (24 text calls). No speech or automatic retries.\n');return;}
  for(let i=0;i<args.length;i++){
    if(args[i]==='--live'&&!live)live=true;
    else if(args[i]==='--out'&&!outDir&&args[i+1]&&!args[i+1].startsWith('--'))outDir=args[++i];
    else if(args[i]==='--repeats'&&!seenRepeats&&/^[123]$/.test(args[i+1]||'')){repeats=Number(args[++i]);seenRepeats=true;}
    else throw new Error('Invalid refinement options.');
  }
  const packet=await run({live,outDir,repeats});process.stdout.write(JSON.stringify({mode:packet.mode,scenarios:packet.scenarioCount,repeats,callsPlanned:packet.callsPlanned,callsAttempted:packet.callsAttempted,humanReviewRequired:true})+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{process.stderr.write('Dana refinement review could not complete. Check fixtures, context and output setup.\n');process.exitCode=1;});
