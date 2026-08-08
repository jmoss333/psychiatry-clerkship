/* Rotation phase policy — cw_shelf_date finally governs the study diet.
   shelfDaysUntil() is THE local-midnight date helper: spa_index.html's two prior inline
   copies (countdown card + shelfIntensityHtml) now call this so the phase chip and the
   countdown can never disagree at a boundary. phasePolicy() is pure derivation; the cap
   floor (5) stays inside the Daily Review slider's range. Copy rule: labels ship to both
   sites — audience-neutral, "Exam", never "Shelf". */
function shelfDaysUntil(shelfStr, nowMs){
  if(!shelfStr) return null;
  var t=new Date(shelfStr+'T00:00:00').getTime();
  if(isNaN(t)) return null;
  return Math.ceil((t-(nowMs||Date.now()))/86400000);
}
function phasePolicy(nowMs){
  var shelf=null;
  try{ shelf=localStorage.getItem('cw_shelf_date'); }catch(_){ }
  var days=shelfDaysUntil(shelf, nowMs);
  if(days===null) return {phase:'unset',daysToShelf:null,newPerDayCap:12,label:'Set an exam date on Start-here to guide pacing.'};
  if(days<0)  return {phase:'post',daysToShelf:days,newPerDayCap:12,label:'Exam date passed — review mode.'};
  if(days<=7) return {phase:'taper',daysToShelf:days,newPerDayCap:5,label:'Exam in '+days+' day'+(days===1?'':'s')+' — taper new cards, review daily.'};
  if(days<=14)return {phase:'consolidate',daysToShelf:days,newPerDayCap:8,label:'Exam in '+days+' days — consolidate: fewer new cards, more retrieval.'};
  if(days<=28)return {phase:'interleave',daysToShelf:days,newPerDayCap:12,label:'Exam in '+days+' days — mix topics as you practice.'};
  return {phase:'encode',daysToShelf:days,newPerDayCap:12,label:'Exam in '+days+' days — steady building.'};
}
