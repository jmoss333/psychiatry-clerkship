/* Qbank session capsule cw_sess_v1 — per-tool checkpoint store for an interrupted session.
   Checkpointed at question boundaries only (advance/skip), never mid-question — the caller's
   job, not this snippet's (design spec §PR-3). sessLoad owns load-validate-expire so two
   hand-rolled expiry copies can't drift between the future home-card reader and the qbank
   itself; an expired or malformed per-tool entry is pruned from the store on load, not just
   hidden, so a stale slot never lingers past its own read. No consumer wires this yet — the
   marker exists so a future resume UI has one seam to write to (sessSave/sessClear included
   for that reader, unused by any build today). */
function sessLoad(tool, nowMs){
  try{
    var d=JSON.parse(localStorage.getItem('cw_sess_v1')||'null');
    if(!d || d.v!==1 || !d.sessions || typeof d.sessions!=='object') return null;
    var s=d.sessions[tool];
    if(!s || typeof s!=='object'){ return null; }
    var now=(nowMs===undefined||nowMs===null)?Date.now():nowMs;
    if(typeof s.expiresAt!=='number' || now>s.expiresAt){
      delete d.sessions[tool];
      localStorage.setItem('cw_sess_v1', JSON.stringify(d));
      return null;
    }
    return s;
  }catch(_){
    return null;
  }
}
function sessSave(tool, session){
  try{
    var d=JSON.parse(localStorage.getItem('cw_sess_v1')||'null');
    if(!d || d.v!==1 || !d.sessions || typeof d.sessions!=='object') d={v:1,sessions:{}};
    d.sessions[tool]=session;
    localStorage.setItem('cw_sess_v1', JSON.stringify(d));
  }catch(_){ }
}
function sessClear(tool){
  try{
    var d=JSON.parse(localStorage.getItem('cw_sess_v1')||'null');
    if(!d || d.v!==1 || !d.sessions || typeof d.sessions!=='object') return;
    delete d.sessions[tool];
    localStorage.setItem('cw_sess_v1', JSON.stringify(d));
  }catch(_){ }
}
