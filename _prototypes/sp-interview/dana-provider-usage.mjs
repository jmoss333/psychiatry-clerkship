// Content-free, in-memory observations. These are partial token totals, never a bill.
const FIELDS=['inputTokens','cachedInputTokens','cacheWriteTokens','outputTokens','reasoningTokens','totalTokens'];
const count=value=>Number.isSafeInteger(value)&&value>=0;
export function normalizeUsage(value) {
  if(!value || typeof value!=='object' || Array.isArray(value))return null;
  const usage=Object.fromEntries(FIELDS.map(field=>[field,count(value[field])?value[field]:null]));
  for(const [detail,parent] of [['cachedInputTokens','inputTokens'],['cacheWriteTokens','inputTokens'],['reasoningTokens','outputTokens']]) {
    if(usage[detail]!==null && usage[parent]!==null && usage[detail]>usage[parent])usage[detail]=null;
  }
  if(usage.inputTokens!==null && usage.outputTokens!==null && usage.totalTokens!==null && usage.inputTokens+usage.outputTokens!==usage.totalTokens)usage.totalTokens=null;
  return FIELDS.some(field=>usage[field]!==null)?usage:null;
}
function bucket() {
  return {started:0,inFlight:0,completed:0,failed:0,cancelled:0,usageReported:0,usageMissing:0,
    tokens:Object.fromEntries(FIELDS.map(field=>[field,null])),tokenReports:Object.fromEntries(FIELDS.map(field=>[field,0]))};
}
export function createUsageCounter() {
  const state={scope:'provider-instance-memory',costUsd:null,actor:bucket(),speech:bucket(),recordedSpeechHits:0};
  return {
    start(kind) {
      const target=state[kind];target.started++;target.inFlight++;
      let finished=false;
      return (error,rawUsage)=>{
        if(finished)return;finished=true;target.inFlight--;
        target[error?(error.name==='AbortError'?'cancelled':'failed'):'completed']++;
        const usage=normalizeUsage(rawUsage);
        if(!usage){target.usageMissing++;return;}
        target.usageReported++;
        for(const field of FIELDS)if(usage[field]!==null){
          const total=(target.tokens[field]??0)+usage[field];
          // Never round a total past JavaScript's exact integer range.
          if(Number.isSafeInteger(total)){target.tokens[field]=total;target.tokenReports[field]++;}
        }
      };
    },
    recordingHit(){state.recordedSpeechHits++;},
    snapshot(){return structuredClone(state);},
  };
}
