// Explicit opt-in paid proof that the retry action works through the real hosted
// Function and provider. Never part of npm test.
//
// Budget: start (1) + two turns (3 each) + one retry (3) = 10 reserved units of
// the 72-per-half-hour ceiling. The refused second retry costs nothing: retryState
// throws before budget.reserve is reached.
//
// This proves the action works end to end. It does NOT prove the truncation
// property — that the actor sees nothing from the retried turn onward — which is
// unobservable from outside and is pinned by the node handler tests instead.
import fs from 'node:fs';
const PREVIEW_URL=process.env.DANA_QA_URL;
const ACCESS=process.env.DANA_QA_ACCESS_FILE;
if(!PREVIEW_URL||!ACCESS)throw new Error('Explicit DANA_QA_URL and DANA_QA_ACCESS_FILE are required; this proof makes paid API requests.');
const output=process.env.DANA_QA_OUTPUT_DIR||new URL('../test-results/',import.meta.url).pathname;
fs.mkdirSync(output,{recursive:true});
const REPORT=output+'/hosted-retry-report.json';
const MAX_PAID=4;                                   // start + 2 turns + 1 retry
const passcode=fs.readFileSync(ACCESS,'utf8').trim().split(/\r?\n/).at(-1);
const report={success:false,stage:'setup',paidRequests:0,reservedUnits:0,statuses:[],turns:[],startedAt:new Date().toISOString()};
let paid=0;
function verify(condition,stage){if(!condition){report.stage=stage;throw new Error('verification_failed');}}

async function call(body,{paidRequest=true}={}){
  if(paidRequest){
    if(++paid>MAX_PAID)throw new Error('paid request cap reached — refusing to spend more');
    report.paidRequests=paid;report.reservedUnits+=body.action==='start'?1:3;
  }
  const response=await fetch(new URL('/api/dana-preview',PREVIEW_URL),{
    method:'POST',headers:{'Content-Type':'application/json','x-preview-key':passcode,'Origin':new URL(PREVIEW_URL).origin},
    body:JSON.stringify(body),cache:'no-store',referrerPolicy:'no-referrer'});
  report.statuses.push(response.status);
  if(response.status!==200)return {status:response.status,error:(await response.json().catch(()=>({}))).error};
  const events=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));
  return {status:200,events,reply:events.find(e=>e.type==='reply'),state:events.at(-1).state};
}

try{
  verify(!!passcode&&passcode.length>=15,'access_file');
  report.stage='start';
  const opening=await call({action:'start',requestId:crypto.randomUUID()});
  verify(opening.status===200&&opening.reply.turn===0,'start');
  let state=opening.state;

  report.stage='turns';
  for(const [n,text] of [[1,'Could you tell me what led to coming to the hospital?'],[2,'What has that been like for you?']]){
    const turn=await call({action:'turn',state,text,previousPlayback:'played',previousCompletedSegments:n===1?1:2});
    verify(turn.status===200&&turn.reply.turn===n,'turn_'+n);
    report.turns.push({turn:n,segments:turn.reply.segments.length});
    state=turn.state;
  }

  report.stage='retry';
  const retry=await call({action:'retry',state,turnId:2,text:'Let me ask that a different way — what mattered most to you about coming in?'});
  verify(retry.status===200,'retry_status');
  // The alternative answers the turn it returned to, not a new one at the end.
  verify(retry.reply.turn===2,'retry_turn');
  report.retryTurn=retry.reply.turn;
  report.retrySegments=retry.reply.segments.length;

  report.stage='second_retry_refused';
  const second=await call({action:'retry',state:retry.state,turnId:1,text:'A second alternative'},{paidRequest:false});
  verify(second.status===409&&second.error==='preview_encounter_finished','second_retry_refused');
  report.secondRetryError=second.error;

  // The receipt the retry was asked from must be spent for every kind of
  // continuation, or a turn from it would branch without the retried flag and a
  // second alternative could be asked. This check found exactly that on 2026-09-07.
  report.stage='pre_retry_receipt_refused';
  const replay=await call({action:'turn',state,text:'Continuing from before the alternative',previousPlayback:'played',previousCompletedSegments:2},{paidRequest:false});
  verify(replay.status>=400,'pre_retry_receipt_refused');
  report.preRetryReceiptError=replay.error;

  report.success=true;report.stage='complete';report.finishedAt=new Date().toISOString();
  fs.writeFileSync(REPORT,JSON.stringify(report,null,2));
  console.log(`PASS: retry verified through the hosted Function. ${report.reservedUnits} units reserved. Content-free report: ${REPORT}`);
}catch(error){
  report.failureName=error?.name;report.failureHint=String(error?.message||'').split('\n')[0].replace(/[A-Za-z0-9_-]{24,}/g,'[redacted]');
  report.finishedAt=new Date().toISOString();fs.writeFileSync(REPORT,JSON.stringify(report,null,2));
  console.error('Hosted retry proof did not finish at '+report.stage+'. Content-free report: '+REPORT);process.exitCode=1;
}
