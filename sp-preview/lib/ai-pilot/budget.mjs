import {createHash} from 'node:crypto';
const DAY=86400000,WINDOW=1800000,RETENTION=15*DAY;
const hash=v=>createHash('sha256').update(v).digest('hex');
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=(code,status=503)=>{throw Object.assign(new Error(code),{code,status});};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function createPilotBudget({store,namespace,dailyLimit,windowLimit,now=Date.now}={}){
 const kind=namespace?.split('/').at(-1),max=kind==='reader'?[20,5]:kind==='faculty'?[10,2]:null;
 if(!max||!store||typeof store.getWithMetadata!=='function'||typeof store.set!=='function'||typeof namespace!=='string'||namespace.length>128||!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)+$/.test(namespace)||!Number.isInteger(dailyLimit)||dailyLimit<1||dailyLimit>max[0]||!Number.isInteger(windowLimit)||windowLimit<1||windowLimit>max[1]||typeof now!=='function')fail('invalid_budget_configuration',500);
 const key=`${namespace}/ai-pilot-paid-operations-v1`;
 return Object.freeze({async reserve(input){
  if(!exact(input,['requestId','contextDigest'])||typeof input.requestId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)||!digest(input.contextDigest))fail('invalid_budget_request',400);
  const id=hash(input.requestId.toLowerCase()),binding=input.contextDigest;
  for(let attempt=0;attempt<5;attempt++){
   let existing,time;try{existing=await store.getWithMetadata(key,{type:'json',consistency:'strong'});time=now();}catch{fail('budget_unavailable');}
   if(!Number.isSafeInteger(time)||time<0)fail('budget_unavailable');
   let operations={};
   if(existing!==null){
    const r=existing?.data;
    if(typeof existing?.etag!=='string'||!existing.etag||!exact(r,['schemaVersion','namespace','dailyLimit','windowLimit','updatedAt','operations'])||r.schemaVersion!==1||r.namespace!==namespace||r.dailyLimit!==dailyLimit||r.windowLimit!==windowLimit||!Number.isSafeInteger(r.updatedAt)||r.updatedAt<0||r.updatedAt>time||!r.operations||typeof r.operations!=='object'||Array.isArray(r.operations)||Object.keys(r.operations).length>max[0]*16)fail('budget_unavailable');
    operations=structuredClone(r.operations);
    for(const [h,o]of Object.entries(operations))if(!digest(h)||!exact(o,['contextDigest','reservedAt'])||!digest(o.contextDigest)||!Number.isSafeInteger(o.reservedAt)||o.reservedAt<0||o.reservedAt>r.updatedAt)fail('budget_unavailable');
   }
   if(operations[id])fail(operations[id].contextDigest===binding?'already_submitted':'request_conflict',409);
   let daily=0,window=0;
   for(const [h,o]of Object.entries(operations)){
    if(o.reservedAt<time-RETENTION){delete operations[h];continue;}
    if(Math.floor(o.reservedAt/DAY)===Math.floor(time/DAY))daily++;
    if(o.reservedAt>time-WINDOW)window++;
   }
   if(daily>=dailyLimit||window>=windowLimit||Object.keys(operations).length>=max[0]*16)fail('budget_exhausted',429);
   operations[id]={contextDigest:binding,reservedAt:time};
   const record={schemaVersion:1,namespace,dailyLimit,windowLimit,updatedAt:time,operations};
   let result;try{result=await store.set(key,JSON.stringify(record),existing===null?{onlyIfNew:true}:{onlyIfMatch:existing.etag});}catch{fail('budget_unavailable');}
   if(result?.modified===false)continue;
   if(result?.modified!==true||typeof result.etag!=='string'||!result.etag)fail('budget_unavailable');
   return Object.freeze({reserved:true});
  }
  fail('budget_unavailable');
 }});
}
