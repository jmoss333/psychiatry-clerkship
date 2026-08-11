/* Calibration ledger cw_calib_v1 — append-only judgment-vs-outcome history. Enum fields +
   existing ids ONLY; no free text ever (PHI firewall is structural). cw_qb_v1 stays the
   current-state store; this is the history store; no reader joins both into one number
   (spec: 2026-08-05-shared-state-spine-design.md). Writers: qbank qbRecord (re flag),
   review.html grade() (sug/rq). cw_practice_events_v1 remains reserved for sim process
   events — a different thing. */
function calibLog(evt){
  try{
    var S={qb:['guess','likely','certain'],rev:['Again','Hard','Good','Easy']};
    if(!evt || !S[evt.s] || S[evt.s].indexOf(evt.p)<0) return;
    var d=null;
    try{ d=JSON.parse(localStorage.getItem('cw_calib_v1')||'null'); }catch(_e){ d=null; }
    if(!d || d.v!==1 || !Array.isArray(d.qb) || !Array.isArray(d.rev)) d={v:1,qb:[],rev:[]};
    var ring=d[evt.s==='qb'?'qb':'rev'];
    ring.push(evt);
    while(ring.length>400) ring.shift();
    localStorage.setItem('cw_calib_v1', JSON.stringify(d));
  }catch(_){ }
}
function calibRead(){
  try{
    var d=JSON.parse(localStorage.getItem('cw_calib_v1')||'null');
    if(d && d.v===1 && Array.isArray(d.qb) && Array.isArray(d.rev)) return d;
  }catch(_){ }
  return {v:1,qb:[],rev:[]};
}
function calibClear(){ try{ localStorage.removeItem('cw_calib_v1'); }catch(_){ } }
