/* Local synthetic conversation review. Dry-run by default; never requests speech. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createContext, validateReply} from './dana-live-context.mjs';
import {createOpenAIProvider} from './dana-openai-provider.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CASE_ID = 'sp_depression_gated_si_001';
const SCENARIO_COUNT = 20;
const FIXTURES = path.join(HERE, 'fixtures', 'dana-quality');
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const FACT_BANKS = new Set(['greeting_agenda','open_invite','mood','anhedonia','sleep','appetite','energy','concentration','guilt','psychosis_screen','substance','meds_medical','prior_episodes','work_stressor','family_social']);
export const REQUIRED_COVERAGE = Object.freeze(['screenshot','greeting','reassurance','empathy','purpose','offer_to_help','reflective_pause','topic_follow_up','recognition_noise','correction','repeated_question','unsupported_name','unsupported_quantity','leading_premise','negation','locked_disclosure','interrupted_prefix']);

const fail = () => { throw new Error('Dana benchmark fixtures or case context are invalid.'); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max=1200) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !CONTROL.test(value);
const strings = (value, max=20) => Array.isArray(value) && value.length <= max && value.every(item => text(item,600));
const keys = (value, required, optional=[]) => object(value) && required.every(key => Object.hasOwn(value,key)) && Object.keys(value).every(key => [...required,...optional].includes(key));
const spokenSource = value => value.replace(/\*[^*]*\*/g,'').trim();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function resolveFact(caseDef, id, unlocked) {
  if (typeof id !== 'string') fail();
  const parts=id.split('.');
  let value;
  if (parts.length===2 && parts[0]==='persona' && ['displayName','ageBand','presentingContext','voice','opening'].includes(parts[1])) value=caseDef.persona[parts[1]];
  else if (parts.length===4 && parts[0]==='responses' && FACT_BANKS.has(parts[1]) && ['open','guarded'].includes(parts[2]) && /^\d+$/.test(parts[3])) value=caseDef.responses[parts[1]]?.[parts[2]]?.[Number(parts[3])];
  else if (parts.length===3 && parts[0]==='gated' && ['reveal','repeatAsk'].includes(parts[2])) {
    const gate=caseDef.gated.find(item=>item.id===parts[1]);
    if (gate && (!unlocked || unlocked[gate.id])) value=gate[parts[2]];
  }
  if (!text(value,4000)) fail();
  return value;
}

export async function loadScenarios(directory=FIXTURES) {
  try {
    const names=(await fs.readdir(directory)).filter(name=>name.endsWith('.json')).sort();
    if (names.length!==SCENARIO_COUNT) fail();
    const scenarios=[];
    for (const name of names) {
      const source=path.join(directory,name), stat=await fs.lstat(source);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size>30000) fail();
      scenarios.push(JSON.parse(await fs.readFile(source,'utf8')));
    }
    return scenarios;
  } catch { fail(); }
}

export async function loadCaseDefinition() {
  try {
    const pack=JSON.parse(await fs.readFile(path.join(HERE,'sp-interview.pack.json'),'utf8'));
    const caseDef=pack.cases.find(item=>item.id===CASE_ID);
    if (!caseDef) fail();
    return caseDef;
  } catch { fail(); }
}

function prepareScenario(caseDef, scenario) {
  if (!keys(scenario,['id','title','synthetic','tags','priorTranscript','currentLearnerUtterance','expectations','sourceFactIds','relevantGates','expectedUnlockedGates'],['deliveryContext'])
    || !/^[a-z][a-z0-9-]{2,70}$/.test(scenario.id) || !text(scenario.title,160) || scenario.synthetic!==true
    || !strings(scenario.tags) || !scenario.tags.length || !text(scenario.currentLearnerUtterance)
    || !keys(scenario.expectations,['should','mustNot']) || !strings(scenario.expectations.should) || !scenario.expectations.should.length
    || !strings(scenario.expectations.mustNot) || !scenario.expectations.mustNot.length
    || !strings(scenario.sourceFactIds) || !scenario.sourceFactIds.length
    || !strings(scenario.relevantGates) || !strings(scenario.expectedUnlockedGates)
    || !Array.isArray(scenario.priorTranscript) || scenario.priorTranscript.length>18) fail();
  const gateIds=caseDef.gated.map(gate=>gate.id);
  if ([...scenario.relevantGates,...scenario.expectedUnlockedGates].some(id=>!gateIds.includes(id))
    || new Set(scenario.sourceFactIds).size!==scenario.sourceFactIds.length) fail();
  scenario.sourceFactIds.forEach(id=>resolveFact(caseDef,id));
  if (scenario.deliveryContext && (!keys(scenario.deliveryContext,['kind','sourceFactId'])
    || scenario.deliveryContext.kind!=='interrupted_after_played_prefix'
    || !scenario.sourceFactIds.includes(scenario.deliveryContext.sourceFactId))) fail();

  const prior=[], learnerTexts=[];
  for (let index=0;index<scenario.priorTranscript.length;index++) {
    const entry=scenario.priorTranscript[index];
    if (!keys(entry,['who','text'],['playbackStatus','omittedTail']) || !['me','pt'].includes(entry.who) || !text(entry.text)) fail();
    if (Object.hasOwn(entry,'omittedTail') && (entry.omittedTail!==true || entry.who!=='pt' || !scenario.deliveryContext || index!==scenario.priorTranscript.length-1)) fail();
    if (entry.who==='me') {
      if (Object.hasOwn(entry,'playbackStatus')) fail();
      learnerTexts.push(entry.text);
    } else {
      if (entry.playbackStatus!=='played') fail();
      const priorState=createContext(caseDef,learnerTexts,prior).state;
      const sources=scenario.sourceFactIds.filter(id=>!id.startsWith('gated.') || priorState.unlocked[id.split('.')[1]])
        .map(id=>spokenSource(resolveFact(caseDef,id,priorState.unlocked)));
      const prefix=scenario.deliveryContext && index===scenario.priorTranscript.length-1
        ? spokenSource(resolveFact(caseDef,scenario.deliveryContext.sourceFactId,priorState.unlocked)) : null;
      if (!sources.includes(entry.text) && !(prefix && prefix.startsWith(entry.text) && prefix.length>entry.text.length)) fail();
    }
    prior.push({...entry});
  }
  if (scenario.deliveryContext) {
    const last=prior.at(-1), source=spokenSource(resolveFact(caseDef,scenario.deliveryContext.sourceFactId));
    if (last?.who!=='pt' || last.omittedTail!==true || !source.startsWith(last.text) || source.length<=last.text.length) fail();
  }
  const transcript=[...prior,{who:'me',text:scenario.currentLearnerUtterance}];
  learnerTexts.push(scenario.currentLearnerUtterance);
  const context=createContext(caseDef,learnerTexts,transcript);
  const unlocked=gateIds.filter(id=>context.state.unlocked[id]);
  if (JSON.stringify([...scenario.expectedUnlockedGates].sort())!==JSON.stringify([...unlocked].sort())) fail();
  // Mechanical fixture/gate checks are not a judgement of conversational quality.
  return {
    id:scenario.id, title:scenario.title, tags:[...scenario.tags], synthetic:true,
    priorTranscript:prior, currentLearnerUtterance:scenario.currentLearnerUtterance,
    expectations:structuredClone(scenario.expectations), sourceFactIds:[...scenario.sourceFactIds],
    sourceReferences:scenario.sourceFactIds.map(id=>({id,text:resolveFact(caseDef,id,context.state.unlocked)})),
    relevantGates:[...scenario.relevantGates],
    canonicalState:{rapport:context.state.rapport,unlockedGates:unlocked},
    deliveryContext:scenario.deliveryContext ? {...scenario.deliveryContext} : null,
    modelInput:{system:context.system,messages:context.messages},
    structuralStatus:'context_ready', reply:null, errorCode:null,
    humanReview:{status:'not_reviewed',notes:null},
  };
}

export function buildReviewPacket({caseDef,scenarios}) {
  try {
    if (caseDef?.id!==CASE_ID || !Array.isArray(scenarios) || scenarios.length!==SCENARIO_COUNT) fail();
    if (new Set(scenarios.map(item=>item.id)).size!==SCENARIO_COUNT) fail();
    const cases=scenarios.map(scenario=>prepareScenario(caseDef,scenario));
    const coverage=new Set(cases.flatMap(item=>item.tags));
    if (REQUIRED_COVERAGE.some(tag=>!coverage.has(tag))) fail();
    return {
      schemaVersion:1, benchmark:'Dana synthetic conversation quality review', synthetic:true,
      caseId:CASE_ID, mode:'dry_run', textOnly:true, scenarioCount:SCENARIO_COUNT, callsAttempted:0,
      semanticReview:'not_reviewed',
      interpretation:'Structural checks only. No keyword score or automatic semantic pass. A human must review relevance, naturalness, factual fidelity, negation, disclosure boundaries, and conversation continuity.',
      createdAt:new Date().toISOString(), coverage:[...coverage].sort(), provenance:null, cases,
    };
  } catch { fail(); }
}

async function outputDirectory(outDir) {
  try {
    if (typeof outDir!=='string' || !outDir.trim() || outDir.length>4096 || outDir.includes('\0')) throw new Error();
    const target=path.resolve(outDir);
    // A fresh directory avoids overwriting a prior review or following links.
    let parent=path.dirname(target);
    while (true) {
      try { if ((await fs.lstat(parent)).isSymbolicLink()) throw new Error(); }
      catch (error) { if (error.code!=='ENOENT') throw error; }
      if (parent===path.dirname(parent)) break;
      parent=path.dirname(parent);
    }
    await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
    await fs.mkdir(target,{mode:0o700});
    return target;
  } catch { throw new Error('Dana benchmark output requires a new writable directory without symbolic links.'); }
}

function reviewMarkdown(packet) {
  const lines=['# Dana conversation review','',packet.interpretation,'',
    `Mode: ${packet.mode}. Scenarios: ${packet.scenarioCount}. Text calls attempted: ${packet.callsAttempted}. Speech calls: 0.`,
    '', 'The full packet includes exact model input and canonical source references. The items below require human review.',''];
  for (const item of packet.cases) {
    lines.push(`## ${item.title}`, '', `ID: ${item.id}`, '', 'Prior played conversation:', '');
    for (const entry of item.priorTranscript) lines.push(`${entry.who==='me'?'Learner':'Dana'}: ${entry.text}`, '');
    if (item.deliveryContext) lines.push('Playback note: only the last displayed Dana prefix was played. The unheard remainder is absent from dialogue history.','');
    lines.push(`Learner now: ${item.currentLearnerUtterance}`, '', `Dana reply: ${item.reply ?? '(No reply recorded.)'}`, '',
      `Structural outcome: ${item.structuralStatus}. Human review: not reviewed.`, '', 'Look for:', '');
    for (const expectation of item.expectations.should) lines.push(`- ${expectation}`);
    lines.push('', 'Avoid:', '');
    for (const expectation of item.expectations.mustNot) lines.push(`- ${expectation}`);
    lines.push('', `Source facts: ${item.sourceFactIds.join(', ')}`, `Unlocked gates: ${item.canonicalState.unlockedGates.join(', ') || 'none'}`, '', 'Reviewer notes: ____________________', '');
  }
  return lines.join('\n');
}

export async function runBenchmark({live=false,outDir,provider,scenarios,caseDef}={}) {
  if (typeof live!=='boolean' || (live && !outDir)) throw new Error('Live Dana benchmark requires an explicit output directory.');
  const packet=buildReviewPacket({caseDef:caseDef ?? await loadCaseDefinition(),scenarios:scenarios ?? await loadScenarios()});
  const target=outDir ? await outputDirectory(outDir) : null;
  packet.provenance={};
  for (const name of ['sp-interview.pack.json','dana-live-context.mjs','dana-openai-provider.mjs','dana-openai-worker.py']) {
    packet.provenance[name]=sha(await fs.readFile(path.join(HERE,name)));
  }
  if (live) {
    packet.mode='live_text_only';
    const actor=provider ?? createOpenAIProvider();
    for (const item of packet.cases) {
      packet.callsAttempted++;
      let reply;
      try { reply=await actor.reply(item.modelInput); }
      catch { item.structuralStatus='provider_error';item.errorCode='reply_request_failed';continue; }
      try { item.reply=validateReply(reply);item.structuralStatus='reply_recorded'; }
      catch { item.structuralStatus='invalid_spoken_reply';item.errorCode='reply_shape_invalid'; }
    }
  }
  if (target) {
    try {
      await fs.writeFile(path.join(target,'review.json'),JSON.stringify(packet,null,2)+'\n',{flag:'wx',mode:0o600});
      await fs.writeFile(path.join(target,'review.md'),reviewMarkdown(packet),{flag:'wx',mode:0o600});
    } catch { throw new Error('Dana benchmark could not save the review packet.'); }
  }
  return packet;
}

async function main() {
  let live=false,outDir;
  const args=process.argv.slice(2);
  for (let index=0;index<args.length;index++) {
    if (args[index]==='--live' && !live) live=true;
    else if (args[index]==='--out' && !outDir && args[index+1] && !args[index+1].startsWith('--')) outDir=args[++index];
    else if (args.length===1 && args[index]==='--help') {
      process.stdout.write('Dry-run: node dana-quality-benchmark.mjs\nLive text only: node dana-quality-benchmark.mjs --live --out <new-directory>\n');return;
    } else throw new Error('Invalid benchmark options.');
  }
  const packet=await runBenchmark({live,outDir});
  process.stdout.write(JSON.stringify({mode:packet.mode,scenarios:packet.scenarioCount,callsAttempted:packet.callsAttempted,repliesRecorded:packet.cases.filter(item=>item.reply!==null).length,humanReviewRequired:true})+'\n');
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(()=>{process.stderr.write('Dana quality benchmark could not complete. Check the fixture, runtime, and output setup.\n');process.exitCode=1;});
}
