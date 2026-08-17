/* Front door state + engagement mechanics. Injected via /*__FD_STATE__*\/ — see
   SNIPPET_MARKERS in common.py. Everything here is pure or storage-only so it can be
   unit-tested directly (tests/fd-state.test.mjs) instead of through a DOM.

   Depends on localDayStr/localDayIndex/shelfDaysUntil from the PHASE_POLICY snippet, which
   is injected into the same page. Day boundaries are LOCAL: the prototype used UTC, which
   moves a US Eastern student's daily pick to 7pm. Date STRINGS are parsed only by
   shelfDaysUntil() — the repo's single sanctioned local-midnight parse site — so this file
   never spells a midnight suffix itself (tests/phase-chip.test.mjs bans the idiom, in code
   and in comments alike).

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

/* cw_progress_v1 predates Front Door and stores objects, not booleans. Renderers receive the
   small boolean projection below; writes retain the legacy {done,at} entry so the old shell's
   progLoad()/entry.done contract continues to read every learner's saved progress. */
function fdProgressDoneMap(raw){
  var out={}, src=raw||{}, entry;
  if(typeof src!=='object') return out;
  for(var ref in src){
    if(Object.prototype.hasOwnProperty.call(src, ref)){
      entry=src[ref];
      if(entry&&typeof entry==='object'&&typeof entry.done==='boolean') out[ref]=entry.done;
    }
  }
  return out;
}

function fdProgressToggle(raw, ref, done, nowMs){
  var out={}, src=raw||{};
  if(src&&typeof src==='object'){
    for(var key in src){
      if(Object.prototype.hasOwnProperty.call(src, key)) out[key]=src[key];
    }
  }
  if(done) out[ref]={done:true,at:localDayStr(nowMs)};
  else delete out[ref];
  return out;
}

/* Recover a rotation's first Monday from a selected week without rewriting an older stored
   start date. A zero means browsing rather than a rotation. */
function fdRotationStartForWeek(selectedWeek, nowMs){
  if(typeof selectedWeek!=='number'||selectedWeek<1||selectedWeek>6||selectedWeek%1!==0) return '';
  var d=new Date(nowMs||Date.now());
  d.setDate(d.getDate()-((d.getDay()+6)%7)-((selectedWeek-1)*7));
  return localDayStr(d.getTime());
}

/* Weeks 5-6 carry a countdown to the exam. Returns '' for every other week so callers can
   concatenate unconditionally.

   The stored cw_shelf_date wins whenever it is set: it is the actual date, and it is what the
   phase chip already counts against (phasePolicy), so the two surfaces cannot disagree.

   Without a stored date we fall back to the rotation grid, anchored to the FRIDAY OF WEEK 6 —
   not to "the next Friday on the wall calendar". The wall-calendar form shipped in the
   prototype and is wrong: on the Saturday of week 5 it counted to the *following* week's
   Friday and then added another 7, yielding 13 where the real answer is 6 — so moving one day
   forward in time made the countdown grow, and past the exam it counted toward a phantom
   second one. Anchoring to a fixed point on the grid makes the value fall by exactly one per
   day. idx is the day's offset from Monday (Mon=0 … Sun=6); the exam sits at idx 4 of week 6.

   Once the exam is behind us there is nothing to count down to, so we return '' rather than a
   negative day count or a wrapped-around next Friday.

   For a legacy stored rotation start that is not Monday-aligned, the fallback derives the fixed
   week-six Friday offset from that actual start rather than treating its weekday as Monday. */
function fdExamCountdown(week, nowMs, rotationStart){
  if(week!==5&&week!==6) return '';
  var stored=null;
  try{ stored=localStorage.getItem('cw_shelf_date'); }catch(_){ }
  var days=shelfDaysUntil(stored, nowMs);
  if(days===null){
    var fromStart=shelfDaysUntil(rotationStart, nowMs);
    if(fromStart!==null) days=39+fromStart;
    else {
      var idx=(new Date(nowMs||Date.now()).getDay()+6)%7;
      days=(6-week)*7+(4-idx);
    }
  }
  if(days<0) return '';
  if(days===0) return '· exam day — good luck';
  return '· exam in ~'+days+' day'+(days===1?'':'s');
}

/* Deterministic per local calendar day, skipping anything already done. Candidates are
   supplied by the caller (the library-only reads) so this stays free of week membership. */
function fdDailyPick(candidates, doneMap, nowMs){
  var pool=[], done=doneMap||{};
  for(var i=0;i<(candidates||[]).length;i++){
    if(done[candidates[i].ref]!==true) pool.push(candidates[i]);
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
