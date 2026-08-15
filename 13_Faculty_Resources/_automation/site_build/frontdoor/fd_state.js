/* Front door state + engagement mechanics. Injected via /*__FD_STATE__*\/ — see
   SNIPPET_MARKERS in common.py. Everything here is pure or storage-only so it can be
   unit-tested directly (tests/fd-state.test.mjs) instead of through a DOM.

   Depends on localDayStr/localDayIndex from the PHASE_POLICY snippet, which is injected
   into the same page. Day boundaries are LOCAL: the prototype used UTC, which moves a US
   Eastern student's daily pick to 7pm.

   Copy rule: strings here ship to BOTH sites unrebranded — audience-neutral, "Exam",
   never "Shelf" (tests/shell-copy.test.mjs). */
var FD_STORE='cw_frontdoor_v1';

/* Persisted keys are ONLY those with no existing home. done lives in cw_progress_v1,
   streak in cw_srs_v1.stats, and the rotation week in cw_rotation_start/cw_start_week —
   copying them here would create two sources that silently desync. */
var FD_KEYS=['role','tab','viewWeek','openId','fromTab','scrollPos'];

function fdLoad(){
  try{ return JSON.parse(localStorage.getItem(FD_STORE)||'{}')||{}; }catch(_){ return {}; }
}
function fdSave(o){
  var out={}, src=o||{};
  for(var i=0;i<FD_KEYS.length;i++){
    var k=FD_KEYS[i];
    if(src[k]!==undefined) out[k]=src[k];
  }
  try{ localStorage.setItem(FD_STORE, JSON.stringify(out)); }catch(_){ }
}

/* Weeks 5-6 carry a countdown to the Friday of week 6. Week 5 is one week further out,
   so it adds 7. Returns '' for every other week so callers can concatenate unconditionally. */
function fdExamCountdown(week, nowMs){
  if(week!==5&&week!==6) return '';
  var d=new Date(nowMs||Date.now());
  var days=((5-d.getDay())+7)%7 + (week===5?7:0);
  if(days===0) return '· exam day — good luck';
  return '· exam in ~'+days+' day'+(days===1?'':'s');
}

/* Deterministic per local calendar day, skipping anything already done. Candidates are
   supplied by the caller (the library-only reads) so this stays free of week membership. */
function fdDailyPick(candidates, doneMap, nowMs){
  var pool=[], done=doneMap||{};
  for(var i=0;i<(candidates||[]).length;i++){
    if(!done[candidates[i].ref]) pool.push(candidates[i]);
  }
  if(!pool.length) return null;
  return pool[localDayIndex(nowMs)%pool.length];
}

/* Cubic ease-out, matching the 600ms ring sweep in the design. Callers drive elapsed from
   rAF; keeping the easing pure is what makes the curve testable without a frame loop. */
function fdRingStep(from, to, elapsed, duration){
  var dur=duration||600;
  var k=Math.min(1,Math.max(0,elapsed/dur));
  var e=1-Math.pow(1-k,3);
  return Math.round(from+(to-from)*e);
}
