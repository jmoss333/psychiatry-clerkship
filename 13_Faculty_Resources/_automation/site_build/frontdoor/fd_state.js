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
   copying them here would create two sources that silently desync. toolExpanded is shell layout,
   not clinical progress or route state, so this store is its single home. */
var FD_KEYS=['role','tab','viewWeek','openId','fromTab','scrollPos','toolExpanded'];

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

/* cw_progress_v1 keeps reading history in its original {done,at} shape. Repeated practice
   adds practiceWeeks:{1:{done:true,at:...}} to that SAME resource entry. Its old fields stay
   readable and intact; an unscoped historical completion cannot tell us which week was done,
   so it never awards all the repeated practice weeks. No second store or date-based guess. */
function fdProgressRecord(value){
  return !!value&&typeof value==='object'&&Object.prototype.toString.call(value)!=='[object Array]';
}

function fdProgressCopy(value){
  var out={};
  if(fdProgressRecord(value)){
    for(var key in value){ if(Object.prototype.hasOwnProperty.call(value,key)) out[key]=value[key]; }
  }
  return out;
}

function fdProgressWeekScoped(index, ref){
  var weeks=index&&index.weeks||[], count=0;
  for(var i=0;i<weeks.length;i++){
    var items=weeks[i]&&weeks[i].items||[];
    for(var j=0;j<items.length;j++){
      if(items[j]&&items[j].ref===ref&&items[j].kind==='tool'&&!items[j].rights){ count++; break; }
    }
  }
  return count>1;
}

function fdProgressWeek(state, index){
  var st=state||{};
  var inPath=st.tab==='path'||((st.openId||st.ref)&&st.fromTab==='path');
  var n=inPath?st.viewWeek:st.week;
  if(index&&!fdStateHasWeek(index.weeks,n)) return inPath&&index.weeks&&index.weeks.length?index.weeks[0].n:null;
  return typeof n==='number'&&isFinite(n)&&n%1===0&&n>0?n:null;
}

function fdProgressDoneMap(raw, index, week){
  var out={}, src=raw||{}, entry;
  if(!fdProgressRecord(src)) return out;
  for(var ref in src){
    if(Object.prototype.hasOwnProperty.call(src, ref)){
      entry=src[ref];
      if(!fdProgressRecord(entry)) continue;
      if(index&&fdProgressWeekScoped(index,ref)&&fdStateHasWeek(index.weeks,week)){
        var scoped=fdProgressRecord(entry.practiceWeeks)?entry.practiceWeeks[week]:null;
        out[ref]=fdProgressRecord(scoped)&&scoped.done===true;
      } else if(typeof entry.done==='boolean') out[ref]=entry.done;
    }
  }
  return out;
}

/* Older pure-render callers supply a boolean map. Live callers supply the raw record so
   Path can project six independent weeks and Today can always project its current week. */
function fdProgressForWeek(index, state, week){
  var st=state||{};
  return st.progressRaw!==undefined?fdProgressDoneMap(st.progressRaw,index,week):(st.done||{});
}

function fdProgressToggle(raw, ref, done, nowMs, index, week){
  var out=fdProgressCopy(raw);
  var entry=fdProgressCopy(out[ref]);
  var repeated=index&&fdProgressWeekScoped(index,ref);
  if(repeated&&fdStateHasWeek(index.weeks,week)){
    var practiceWeeks=fdProgressCopy(entry.practiceWeeks);
    if(done){
      practiceWeeks[week]={done:true,at:localDayStr(nowMs)};
      if(typeof entry.done!=='boolean'){ entry.done=true; entry.at=localDayStr(nowMs); }
    } else {
      delete practiceWeeks[week];
    }
    entry.practiceWeeks=practiceWeeks;
    out[ref]=entry;
    return out;
  }
  /* Browsing without a selected week still has a working history toggle. It changes only
     unscoped history, preserving every recorded practice week and any older entry fields. */
  if(repeated||fdProgressRecord(entry.practiceWeeks)){
    entry.done=done===true;
    if(done) entry.at=localDayStr(nowMs);
    out[ref]=entry;
    return out;
  }
  if(done) out[ref]={done:true,at:localDayStr(nowMs)};
  else delete out[ref];
  return out;
}

function fdStateHasWeek(weeks, n){
  var list=weeks||[];
  if(typeof n!=='number'||isNaN(n)||n%1!==0) return false;
  for(var i=0;i<list.length;i++){ if(list[i]&&list[i].n===n) return true; }
  return false;
}

function fdRotationWeek(rotationStart, weeks, nowMs){
  var list=weeks||[];
  if(!list.length||typeof shelfDaysUntil!=='function') return null;
  var du=shelfDaysUntil(rotationStart||'',nowMs);
  if(du===null) return null;
  if(du>0) return 0;
  var position=Math.floor(-du/7)+1;
  if(position<=list.length) return list[position-1].n;
  return list[list.length-1].n+1;
}

/* Recover a rotation's first Monday from a selected path week without rewriting an older stored
   start date. A zero means browsing rather than a rotation. */
function fdRotationStartForWeek(selectedWeek, weeks, nowMs){
  if(!fdStateHasWeek(weeks,selectedWeek)) return '';
  var d=new Date(nowMs||Date.now());
  d.setDate(d.getDate()-((d.getDay()+6)%7)-((selectedWeek-1)*7));
  return localDayStr(d.getTime());
}

/* The final two path weeks carry a countdown to the exam. Returns '' for every other week so
   callers can concatenate unconditionally.

   The stored cw_shelf_date wins whenever it is set: it is the actual date, and it is what the
   phase chip already counts against (phasePolicy), so the two surfaces cannot disagree.

   Without a stored date we fall back to the rotation grid, anchored to the Friday of the final
   path week —
   not to "the next Friday on the wall calendar". The wall-calendar form shipped in the
   prototype and is wrong: on the Saturday of week 5 it counted to the *following* week's
   Friday and then added another 7, yielding 13 where the real answer is 6 — so moving one day
   forward in time made the countdown grow, and past the exam it counted toward a phantom
   second one. Anchoring to a fixed point on the grid makes the value fall by exactly one per
   day. idx is the day's offset from Monday (Mon=0 … Sun=6); the exam sits at idx 4 of the final
   path week.

   Once the exam is behind us there is nothing to count down to, so we return '' rather than a
   negative day count or a wrapped-around next Friday.

   For a legacy stored rotation start that is not Monday-aligned, the fallback derives the fixed
   final-week Friday offset from that actual start rather than treating its weekday as Monday. */
function fdExamCountdown(week, weeks, nowMs, rotationStart){
  var list=weeks||[], last=list.length?list[list.length-1].n:null;
  if(last===null||!fdStateHasWeek(list,week)||week<last-1) return '';
  var stored=null;
  try{ stored=localStorage.getItem('cw_shelf_date'); }catch(_){ }
  var days=shelfDaysUntil(stored, nowMs);
  if(days===null){
    var fromStart=shelfDaysUntil(rotationStart, nowMs);
    if(fromStart!==null) days=((last-1)*7+4)+fromStart;
    else {
      var idx=(new Date(nowMs||Date.now()).getDay()+6)%7;
      days=(last-week)*7+(4-idx);
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

/* Seven-day activity strip -- the arithmetic behind Today's "Active N of the last 7 days" line.
   Reads the timestamps every tool already writes rather than adding a store: cw_srs_v1 card
   .last (ms) and stats.lastStudy (Y-M-D, unpadded), cw_qb_v1 .ts (ms), the cw_calib_v1 ledger
   .ts (ms), cw_comm_v1 .at and cw_reason_v1 .at/.updatedAt (ISO dates), cw_progress_v1 .at
   (local Y-M-D from localDayStr), cw_shelf_v1 attempts .at (ISO date), cw_quiz_v1 .last (ISO
   date), cw_orals_v1 reps .at (ISO datetime), cw_circle_v1 .lastTested (ISO date), cw_reflect_v1
   .savedAt (ISO datetime) and cw_capture_v1 .at (ms). Nothing here is persisted and
   nothing new is written, so the strip is correct retroactively for every learner on first
   deploy and the cw_frontdoor_v1 no-duplication contract (tests/fd-shell-boot) is untouched.

   Replaces the "N days in a row" streak clause: that number is written only by Daily Review
   (review.html bumpStreak), so a learner who did forty questions yesterday and a family
   scenario today read "0" -- and one missed call night reset whatever they had. A
   seven-day window survives a missed day and counts every tool the same.

   Pure. Returns seven booleans, OLDEST first, ending on the day that contains nowMs; a day is
   on when any accepted timestamp falls on it. Dates arrive in three shapes, so one normaliser
   handles all: a positive number is epoch ms; a string starting Y-M-D is a calendar day and is
   read as a LOCAL day at noon (the ISO-date writers slice a UTC string, which at worst shifts
   one evening's activity by a day -- acceptable, and no reader can do better with a date). */
function fdActivityDayIndex(value){
  if(typeof value==='number'&&isFinite(value)&&value>0) return localDayIndex(value);
  if(typeof value==='string'){
    var m=/^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
    if(m) return localDayIndex(new Date(+m[1],+m[2]-1,+m[3],12,0,0).getTime());
  }
  return null;
}

function fdActivityDays(stores, nowMs){
  var today=localDayIndex(nowMs), on={}, st=stores||{}, i, j, out=[];
  function mark(v){ var d=fdActivityDayIndex(v); if(d!==null&&d<=today&&d>today-7) on[d]=true; }
  function each(obj, fn){
    if(!obj||typeof obj!=='object') return;
    for(var key in obj){ if(Object.prototype.hasOwnProperty.call(obj,key)) fn(obj[key]); }
  }
  if(st.srs&&typeof st.srs==='object'){
    each(st.srs.cards, function(c){ if(c&&typeof c==='object') mark(c.last); });
    if(st.srs.stats&&typeof st.srs.stats==='object') mark(st.srs.stats.lastStudy);
  }
  each(st.qb, function(r){ if(r&&typeof r==='object') mark(r.ts); });
  if(st.calib&&typeof st.calib==='object'){
    var lists=[st.calib.qb, st.calib.rev];
    for(i=0;i<lists.length;i++){
      var list=Object.prototype.toString.call(lists[i])==='[object Array]'?lists[i]:[];
      for(j=0;j<list.length;j++){ if(list[j]&&typeof list[j]==='object') mark(list[j].ts); }
    }
  }
  each(st.comm, function(r){ if(r&&typeof r==='object') mark(r.at); });
  each(st.reason, function(r){
    if(r&&typeof r==='object'){ mark(r.updatedAt); each(r.steps, function(step){ if(step&&typeof step==='object') mark(step.at); }); }
  });
  each(st.progress, function(e){
    if(!e||typeof e!=='object') return;
    if(e.done===true) mark(e.at);
    each(e.practiceWeeks, function(w){ if(w&&typeof w==='object'&&w.done===true) mark(w.at); });
  });
  if(st.shelf&&typeof st.shelf==='object'){
    var attempts=Object.prototype.toString.call(st.shelf.attempts)==='[object Array]'?st.shelf.attempts:[];
    for(i=0;i<attempts.length;i++){ if(attempts[i]&&typeof attempts[i]==='object') mark(attempts[i].at); }
  }
  each(st.quiz, function(e){ if(e&&typeof e==='object') mark(e.last); });
  if(st.orals&&typeof st.orals==='object'){
    var reps=Object.prototype.toString.call(st.orals.reps)==='[object Array]'?st.orals.reps:[];
    for(i=0;i<reps.length;i++){ if(reps[i]&&typeof reps[i]==='object') mark(reps[i].at); }
  }
  if(st.circle&&typeof st.circle==='object') mark(st.circle.lastTested);
  if(st.reflect&&typeof st.reflect==='object') mark(st.reflect.savedAt);
  var caps=Object.prototype.toString.call(st.capture)==='[object Array]'?st.capture:[];
  for(i=0;i<caps.length;i++){ if(caps[i]&&typeof caps[i]==='object') mark(caps[i].at); }
  for(i=6;i>=0;i--){ out.push(on[today-i]===true); }
  return out;
}
