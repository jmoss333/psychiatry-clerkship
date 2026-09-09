// This proves citation provenance and authored output shape, never clinical meaning.
const SHARED=['not_assessable','transcription_uncertain','simulation_drift','specific_opportunity_unanswered'];
const STATUSES=['observed','opportunity_not_taken','unclear','not_assessable'];
const trustedSchemas=new WeakSet();
const invalid=()=>new Error('moment_review_invalid');
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/u.test(value)&&wellFormed(value);
function wellFormed(value){for(let i=0;i<value.length;i++){const n=value.charCodeAt(i);if(n>=0xd800&&n<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}else if(n>=0xdc00&&n<=0xdfff)return false;}return true;}
const order=s=>s.id==='setup'?-1:s.id==='team-summary'?10:s.turn*2-(s.kind==='learner'?1:0);
const learner=s=>s.kind==='learner';
const formulation=s=>learner(s)||s.kind==='team_formulation';
const patient=s=>s.kind==='patient_heard';
const setup=s=>s.kind==='scripted_setup';
const before=(a,b)=>order(a)<order(b);
const chain=(ss,...predicates)=>{function find(from,index){if(index===predicates.length)return true;for(let i=from;i<ss.length;i++)if(predicates[index](ss[i])&&find(i+1,index+1))return true;return false;}return find(0,0);};
export function validateReviewSources(sources){
  if(!Array.isArray(sources)||sources.length>11)throw invalid();
  let total=0,previous=-2;
  for(const s of sources){
    if(!exact(s,['id','kind','speaker','text','turn','uncertain'])||!text(s.text,2000)||typeof s.uncertain!=='boolean')throw invalid();
    if(s.id==='setup'){
      if(s.kind!=='scripted_setup'||!['previous_student','setup'].includes(s.speaker)||s.turn!==null||s.uncertain)throw invalid();
    }else if(s.id==='team-summary'){
      if(s.kind!=='team_formulation'||s.speaker!=='learner'||s.turn!==null)throw invalid();
    }else if(typeof s.id==='string'&&/^[pl][0-4]$/.test(s.id)){
      const pt=s.id[0]==='p';
      if(!Number.isInteger(s.turn)||s.turn!==Number(s.id[1])||(!pt&&s.turn===0)||s.kind!==(pt?'patient_heard':'learner')||s.speaker!==(pt?'patient':'learner'))throw invalid();
    }else throw invalid();
    if(order(s)<=previous)throw invalid();
    previous=order(s);total+=s.text.length;
  }
  if(total>14000)throw invalid();
  return sources;
}
export function buildEvidenceSources(definition,finalizedHistory,{teamFormulation='',summaryUncertain=false,uncertainTurnIds=[]}={}){
  if(!Array.isArray(finalizedHistory)||finalizedHistory.length>9||typeof teamFormulation!=='string'||teamFormulation.length>1200||typeof summaryUncertain!=='boolean'||(!teamFormulation&&summaryUncertain)||!Array.isArray(uncertainTurnIds)||uncertainTurnIds.length>4||uncertainTurnIds.some((n,i)=>!Number.isInteger(n)||n<1||n>4||(i>0&&n<=uncertainTurnIds[i-1])))throw invalid();
  const ss=[];
  if(definition.learner.setup)ss.push({id:'setup',kind:'scripted_setup',speaker:definition.learner.setupAttribution?'previous_student':'setup',text:definition.learner.setup,turn:null,uncertain:false});
  const submitted=new Set();
  finalizedHistory.forEach((entry,index)=>{
    if(!entry||entry.who!==(index%2?'me':'pt')||!text(entry.text,2000))throw invalid();
    if(entry.who==='me'){
      const turn=(index+1)/2;submitted.add(turn);
      ss.push({id:`l${turn}`,kind:'learner',speaker:'learner',text:entry.text,turn,uncertain:uncertainTurnIds.includes(turn)});
    }else{
      if(!['played','pending','interrupted'].includes(entry.playbackStatus))throw invalid();
      // Finalization already sliced completed segments into entry.text. Pending or
      // zero-heard interrupted entries retain generated text: never expose it.
      if(entry.playbackStatus==='played')ss.push({id:`p${index/2}`,kind:'patient_heard',speaker:'patient',text:entry.text,turn:index/2,uncertain:false});
    }
  });
  if(uncertainTurnIds.some(id=>!submitted.has(id)))throw invalid();
  if(teamFormulation)ss.push({id:'team-summary',kind:'team_formulation',speaker:'learner',text:teamFormulation,turn:null,uncertain:summaryUncertain});
  return validateReviewSources(ss);
}
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
function freeze(value){Object.values(value).forEach(v=>{if(v&&typeof v==='object')freeze(v);});return Object.freeze(value);}
export function reviewSchema(definition){
  const criteria=definition.criteria.map(c=>c.id);
  const observationIds=[...new Set([...definition.criteria.flatMap(c=>c.observationIds),...SHARED])];
  const schema=object({schemaVersion:{type:'integer',const:1},scenarioId:{type:'string',const:definition.id},findings:{type:'array',minItems:1,maxItems:3,items:object({criterionId:{type:'string',enum:criteria},status:{type:'string',enum:STATUSES},observationId:{type:'string',enum:observationIds},evidence:{type:'array',minItems:0,maxItems:4,items:object({sourceId:{type:'string',enum:['setup','p0','l1','p1','l2','p2','l3','p3','l4','p4','team-summary']},start:{type:'integer',minimum:0,maximum:1999},end:{type:'integer',minimum:1,maximum:2000},quote:{type:'string',minLength:1,maxLength:300}})},uncertaintyId:{type:'string',enum:[...new Set([...definition.allowedUncertaintyIds,'simulation_fact_uncertain'])]},nextAttemptId:{type:'string',enum:definition.allowedNextAttemptIds}})}});
  freeze(schema);trustedSchemas.add(schema);return schema;
}
export const isReviewSchema=schema=>!!schema&&typeof schema==='object'&&trustedSchemas.has(schema);
function requiredEvidence(id,ss){
  switch(id){
    case 'earlier_miss_addressed':return chain(ss,s=>setup(s)&&s.speaker==='previous_student',learner);
    case 'positive_reframe_repeated':return chain(ss,s=>setup(s)||patient(s),learner);
    case 'rent_meaning_explored':return chain(ss,learner,patient)||chain(ss,patient,learner);
    case 'pause_respected':case 'questioning_after_pause':case 'concern_retained':case 'concern_distorted':case 'misunderstanding_addressed':case 'barrier_recognized':case 'barrier_answered_with_repetition':return chain(ss,patient,learner);
    case 'correction_carried_forward':case 'correction_not_carried':return chain(ss,learner,patient,formulation);
    case 'accurate_account_retained':return chain(ss,learner,patient,s=>s.kind==='team_formulation');
    case 'fear_kept_as_fear':return chain(ss,patient,formulation);
    case 'pending_status_explained':case 'booking_asserted':return chain(ss,setup,learner);
    case 'understanding_demonstrated':return chain(ss,patient,learner,patient);
    case 'understanding_not_demonstrated':return chain(ss,learner,patient);
    case 'unestablished_effect_asserted':case 'unknown_history_preserved':return ss.some(formulation);
    case 'attention_returned':case 'reassurance_requested':case 'outcome_promised':case 'correction_invited':case 'own_words_invited':case 'next_step_bounded':case 'logistics_promised':return ss.some(learner);
    default:return false;
  }
}
function resolve(map,id){if(!Object.hasOwn(map,id)||!text(map[id],400))throw invalid();return map[id];}
export function validateDebrief(report,sources,definition,{endReason}={}){
  validateReviewSources(sources);
  if(endReason!==undefined&&!['turn_limit','learner_end','technical_interruption'].includes(endReason))throw invalid();
  if(!exact(report,['schemaVersion','scenarioId','findings'])||report.schemaVersion!==1||report.scenarioId!==definition.id||!Array.isArray(report.findings)||report.findings.length<1||report.findings.length>3)throw invalid();
  const byId=new Map(sources.map(s=>[s.id,s])),seen=new Set();let totalQuote=0;
  const findings=report.findings.map(f=>{
    if(!exact(f,['criterionId','status','observationId','evidence','uncertaintyId','nextAttemptId'])||!STATUSES.includes(f.status)||seen.has(f.criterionId))throw invalid();
    seen.add(f.criterionId);
    const criterion=definition.criteria.find(c=>c.id===f.criterionId);
    if(!criterion||![...criterion.observationIds,...SHARED].includes(f.observationId)||!Array.isArray(f.evidence)||f.evidence.length>4||!definition.allowedNextAttemptIds.includes(f.nextAttemptId)||![...definition.allowedUncertaintyIds,'simulation_fact_uncertain'].includes(f.uncertaintyId))throw invalid();
    const cited=[];
    for(const c of f.evidence){
      if(!exact(c,['sourceId','start','end','quote']))throw invalid();
      const s=byId.get(c.sourceId);
      if(!s||!Number.isInteger(c.start)||!Number.isInteger(c.end)||c.start<0||c.end<=c.start||c.end>s.text.length||!text(c.quote,300)||c.quote!==s.text.slice(c.start,c.end))throw invalid();
      cited.push(s);totalQuote+=c.quote.length;
    }
    // Evidence must itself be ordered; repeated citations to a source may quote
    // separate spans, but cannot manufacture an additional before/after turn.
    if(cited.some((s,i)=>i>0&&order(s)<order(cited[i-1])))throw invalid();
    const distinct=[...new Map(cited.map(s=>[s.id,s])).values()];
    if(f.observationId==='not_assessable'){
      if(f.status!=='not_assessable'||f.evidence.length)throw invalid();
    }else if(f.observationId==='transcription_uncertain'){
      if(f.status!=='unclear'||f.uncertaintyId!=='capture_uncertain'||!distinct.some(s=>s.uncertain)||distinct.some(s=>formulation(s)&&!s.uncertain))throw invalid();
    }else if(f.observationId==='simulation_drift'){
      if(f.status!=='not_assessable'||f.uncertaintyId!=='simulation_fact_uncertain'||!distinct.length||distinct.some(s=>!patient(s)||s.uncertain))throw invalid();
    }else{
      const expected=f.observationId==='specific_opportunity_unanswered'?'opportunity_not_taken':f.observationId==='understanding_not_demonstrated'?'unclear':'observed';
      if(f.status!==expected||distinct.some(s=>s.uncertain))throw invalid();
      // A flagged intervening response must not be skipped to create certainty.
      if(distinct.length&&sources.some(s=>s.uncertain&&order(s)>=order(distinct[0])&&order(s)<=order(distinct.at(-1))))throw invalid();
      if(['P_REVISION','P_RETENTION'].includes(f.criterionId)&&sources.some(s=>s.kind==='team_formulation'&&s.uncertain))throw invalid();
      if(f.observationId==='specific_opportunity_unanswered'){
        if(!distinct.some(op=>patient(op)&&distinct.some(response=>learner(response)&&before(op,response))))throw invalid();
      }else if(!requiredEvidence(f.observationId,distinct))throw invalid();
    }
    if((f.uncertaintyId==='simulation_fact_uncertain')!==(f.observationId==='simulation_drift'))throw invalid();
    if(f.uncertaintyId==='capture_uncertain'&&f.observationId!=='transcription_uncertain')throw invalid();
    return {...f,evidence:f.evidence.map(c=>({...c})),observationText:resolve(definition.templates.observations,f.observationId),uncertaintyText:resolve(definition.templates.uncertainties,f.uncertaintyId),nextAttemptText:resolve(definition.templates.nextAttempts,f.nextAttemptId)};
  });
  if(totalQuote>1200)throw invalid();
  return {schemaVersion:1,scenarioId:definition.id,findings};
}
