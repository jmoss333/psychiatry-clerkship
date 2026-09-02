/* Timed-block store cw_block_v1 — the one "I have N minutes" plan a learner is working
   through. Written by the front door when a block starts; read by the front door (to render
   the block's progress on Today) and by the session receipt inside a tool (to mark the step
   that just finished and offer the next one). Injected via /*__BLOCK_STORE__*\/ so the shell
   and every tool share one implementation.

   Shape: {v:1, minutes, createdAt, steps:[{kind:'review'|'page'|'qb', ref, title, min, n?,
   cat?, done?, doneAt?}]}. A page step is never marked here — its done state is derived from
   cw_progress_v1 at render time, so ticking the page anywhere counts. A block older than
   CW_BLOCK_TTL_MS is pruned on load: a plan built for one morning's dues and next-page must
   not resurface stale the next day. Nothing here reads the clock directly except as the
   default for an omitted nowMs, so tests pass time in. */
var CW_BLOCK_TTL_MS=12*60*60*1000;
function blockLoad(nowMs){
  try{
    var b=JSON.parse(localStorage.getItem('cw_block_v1')||'null');
    if(!b||b.v!==1||Object.prototype.toString.call(b.steps)!=='[object Array]'||!b.steps.length) return null;
    var now=(nowMs===undefined||nowMs===null)?Date.now():nowMs;
    if(typeof b.createdAt!=='number'||now-b.createdAt>CW_BLOCK_TTL_MS||b.createdAt>now+60000){
      localStorage.removeItem('cw_block_v1');
      return null;
    }
    return b;
  }catch(_){ return null; }
}
function blockSave(block){
  try{ localStorage.setItem('cw_block_v1', JSON.stringify(block)); }catch(_){ }
}
function blockClear(){
  try{ localStorage.removeItem('cw_block_v1'); }catch(_){ }
}
/* Marks the FIRST undone step of the given kind (a block never holds two of one kind today,
   but the rule stays well-defined if it ever does). Returns the updated block, or null when
   there was no live block or nothing of that kind was left to mark. */
function blockMarkStep(kind, nowMs){
  var b=blockLoad(nowMs);
  if(!b) return null;
  var now=(nowMs===undefined||nowMs===null)?Date.now():nowMs;
  for(var i=0;i<b.steps.length;i++){
    var s=b.steps[i];
    if(s&&s.kind===kind&&s.done!==true){
      s.done=true; s.doneAt=now;
      blockSave(b);
      return b;
    }
  }
  return null;
}
