/* Session receipt — the one end-of-session shape every practice tool renders. Injected via
   /*__SESSION_RECEIPT__*\/ into question-bank-practice.html, review.html and shelf-mode.html.

   A receipt always does three things the tools used to leave to the learner:
     1. names what to re-read (spec.reread — the misses, with the page each one points at);
     2. offers ONE next action — the next step of a live timed block if there is one, else the
        tool's own primary (spec.actions) beside "Back to Today";
     3. marks the tool's Today item done (spec.ref → cw_progress_v1, the same {done,at} entry
        fdProgressToggle writes) so nobody has to go back and tick it. Only tools that ARE a
        week item pass a ref; Daily Review and Shelf Mode pass null.
   It also advances the timed block (spec.blockKind → blockMarkStep) when the block snippet
   is present; the receipt never requires it.

   Pure apart from those two writes: returns {html, marked, next}. Copy is audience-neutral
   (no MS3/clerkship/student/shelf/resident tokens) because it ships to both sites. Navigation
   inside a tool iframe goes through the shell's openPage message — a plain href would be
   caught by the in-iframe interceptor and lose its query, so the delegated listener below
   posts the full route instead; outside an iframe it falls back to a real navigation. */
function cwReceiptEsc(s){
  return String(s===undefined||s===null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function cwReceiptLocalDay(nowMs){
  var d=new Date(nowMs), m=d.getMonth()+1, day=d.getDate();
  return d.getFullYear()+'-'+(m<10?'0':'')+m+'-'+(day<10?'0':'')+day;
}
/* Writes the legacy {done:true,at} entry the front door reads. Returns true only when this
   call changed the store, so "Marked done on Today" is said once, not on every re-render. */
function cwReceiptMarkDone(ref, nowMs){
  if(!ref) return false;
  try{
    var p=JSON.parse(localStorage.getItem('cw_progress_v1')||'null');
    if(!p||typeof p!=='object') p={};
    if(p[ref]&&p[ref].done===true) return false;
    p[ref]={done:true,at:cwReceiptLocalDay(nowMs)};
    localStorage.setItem('cw_progress_v1', JSON.stringify(p));
    return true;
  }catch(_){ return false; }
}
function cwReceiptStepRoute(step){
  var s=step||{};
  if(s.kind==='review') return '?tool=review.html&block=1&limit='+encodeURIComponent(String(s.n||1));
  if(s.kind==='qb') return '?tool=question-bank-practice.html&block=1&n='+encodeURIComponent(String(s.n||5))+(s.cat?'&cat='+encodeURIComponent(String(s.cat)):'');
  return '?page='+encodeURIComponent(String(s.ref||''));
}
function cwReceiptNextStep(block, doneMap){
  var b=block||{}, list=b.steps||[], d=doneMap||{}, i, s, done=0;
  var next=null;
  for(i=0;i<list.length;i++){
    s=list[i]||{};
    var isDone=(s.kind==='page')?(d[s.ref]===true):(s.done===true);
    if(isDone) done++;
    else if(!next) next=s;
  }
  return {next:next, done:done, total:list.length};
}
function cwReceiptDoneMap(){
  var out={};
  try{
    var p=JSON.parse(localStorage.getItem('cw_progress_v1')||'null');
    if(p&&typeof p==='object'){ for(var k in p){ if(Object.prototype.hasOwnProperty.call(p,k)&&p[k]&&p[k].done===true) out[k]=true; } }
  }catch(_){ }
  return out;
}
var CW_RECEIPT_CSS='.cw-receipt{margin:0 0 18px;padding:20px 22px;background:var(--surface,#fff);border:1px solid var(--border,#ddd3c6);border-radius:14px;box-shadow:var(--shadow-sm,0 1px 3px rgba(59,51,44,.06));font-family:inherit;color:var(--text,#2f2924)}'+
  '.cw-receipt__eyebrow{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 6px;font-size:.72rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--primary-dark,#a84830)}'+
  '.cw-receipt__eyebrow span+span{color:var(--text-light,#665a4f);letter-spacing:0;text-transform:none;font-weight:600}'+
  '.cw-receipt__h{margin:0 0 6px;font-family:var(--font-head,Georgia,serif);font-size:1.5rem;line-height:1.22;font-weight:700;color:var(--text,#2f2924)}'+
  '.cw-receipt__sub{margin:0 0 14px;font-size:.98rem;line-height:1.55;color:var(--text-mid,#51473d)}'+
  '.cw-receipt__stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin:0 0 16px}'+
  '.cw-receipt__stat{padding:9px 11px;border-radius:10px;background:var(--bg-alt,#faf6f0);border:1px solid var(--border,#ddd3c6)}'+
  '.cw-receipt__stat.is-warn{background:var(--danger-light,#fbece9);border-color:var(--danger,#a34132)}'+
  '.cw-receipt__stat.is-good{background:var(--accent-light,#edf4f2);border-color:var(--accent,#2a6b5e)}'+
  '.cw-receipt__k{display:block;font-size:.68rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text-light,#665a4f)}'+
  '.cw-receipt__stat.is-warn .cw-receipt__k{color:var(--danger,#a34132)}.cw-receipt__stat.is-good .cw-receipt__k{color:var(--accent-dark,#1e5248)}'+
  '.cw-receipt__v{display:block;font-size:1.35rem;font-weight:700;line-height:1.1;margin-top:2px}'+
  '.cw-receipt__stat.is-warn .cw-receipt__v{color:var(--danger,#a34132)}.cw-receipt__stat.is-good .cw-receipt__v{color:var(--accent-dark,#1e5248)}'+
  '.cw-receipt__head{margin:0 0 2px;font-size:.72rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--text-light,#665a4f)}'+
  '.cw-receipt__item{display:flex;gap:12px;align-items:flex-start;padding:11px 0;border-top:1px solid var(--border2,var(--border,#ddd3c6))}'+
  '.cw-receipt__tag{flex:0 0 auto;margin-top:2px;padding:2px 8px;border-radius:999px;font-size:.68rem;font-weight:800;letter-spacing:.03em;white-space:nowrap;background:var(--bg-alt,#faf6f0);color:var(--text-mid,#51473d);border:1px solid var(--border,#ddd3c6)}'+
  '.cw-receipt__tag.is-warn{background:var(--danger-light,#fbece9);color:var(--danger,#a34132);border-color:transparent}'+
  '.cw-receipt__title{display:block;font-size:.95rem;font-weight:600;line-height:1.4}'+
  '.cw-receipt__note{display:block;font-size:.88rem;line-height:1.5;color:var(--text-mid,#51473d);margin-top:2px}'+
  '.cw-receipt__link{display:inline-block;margin-top:5px;font-size:.88rem;font-weight:700;color:var(--accent-dark,#1e5248);text-decoration:none}'+
  '.cw-receipt__link:hover{text-decoration:underline}'+
  '.cw-receipt__done{display:flex;gap:10px;align-items:center;margin:14px 0 0;padding:11px 13px;border-radius:10px;background:var(--accent-light,#edf4f2);border:1.5px solid var(--accent,#2a6b5e);font-size:.92rem;color:var(--accent-dark,#1e5248)}'+
  '.cw-receipt__done b{color:var(--accent-dark,#1e5248)}'+
  '.cw-receipt__actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:16px}'+
  '.cw-receipt__btn{font:inherit;font-size:.95rem;font-weight:700;padding:11px 18px;border-radius:9px;cursor:pointer;border:1px solid var(--border,#ddd3c6);background:var(--surface,#fff);color:var(--text,#2f2924)}'+
  '.cw-receipt__btn.is-primary{background:var(--primary,#c25a3c);border-color:var(--primary,#c25a3c);color:#fff}'+
  '.cw-receipt__btn.is-primary:hover{background:var(--primary-dark,#a84830)}'+
  '.cw-receipt__btn:hover{background:var(--bg-alt,#faf6f0)}'+
  '.cw-receipt__btn small{display:block;font-size:.72rem;font-weight:600;opacity:.85;margin-top:1px}'+
  '.cw-receipt__blockline{margin-left:auto;font-size:.82rem;color:var(--text-light,#665a4f)}'+
  '@media(max-width:520px){.cw-receipt{padding:16px}.cw-receipt__h{font-size:1.3rem}.cw-receipt__blockline{margin-left:0;flex:0 0 100%}}';
function cwReceiptEnsureStyle(){
  try{
    if(typeof document==='undefined'||!document.head||document.getElementById('cw-receipt-css')) return;
    var st=document.createElement('style'); st.id='cw-receipt-css'; st.textContent=CW_RECEIPT_CSS;
    document.head.appendChild(st);
  }catch(_){ }
}
var cwReceiptWired=false;
function cwReceiptNavigate(ref, search){
  var framed=false;
  try{ framed=(typeof window!=='undefined')&&window.self!==window.top; }catch(_){ framed=true; }
  if(framed){
    try{ window.parent.postMessage({type:'openPage',f:ref,search:search||''},'*'); return; }catch(_){ }
  }
  try{ location.href='../index.html'+(ref==='__home__'?'':(search||('?'+(/\.html$/.test(ref)?'tool':'page')+'='+encodeURIComponent(ref)))); }catch(_){ }
}
function cwReceiptWire(){
  if(cwReceiptWired||typeof document==='undefined') return;
  cwReceiptWired=true;
  document.addEventListener('click', function(ev){
    var t=ev.target&&ev.target.closest?ev.target.closest('[data-cw-receipt-home],[data-cw-receipt-next]'):null;
    if(!t) return;
    ev.preventDefault();
    if(t.hasAttribute('data-cw-receipt-home')){ cwReceiptNavigate('__home__',''); return; }
    cwReceiptNavigate(t.getAttribute('data-cw-receipt-ref')||'', t.getAttribute('data-cw-receipt-search')||'');
  }, true);
}
function cwReceipt(spec){
  var s=spec||{}, nowMs=(typeof s.nowMs==='number')?s.nowMs:Date.now(), i;
  cwReceiptEnsureStyle(); cwReceiptWire();
  var marked=cwReceiptMarkDone(s.ref, nowMs);
  var block=null, progress=null;
  if(typeof blockLoad==='function'){
    if(s.blockKind&&typeof blockMarkStep==='function') blockMarkStep(s.blockKind, nowMs);
    block=blockLoad(nowMs);
    if(block) progress=cwReceiptNextStep(block, cwReceiptDoneMap());
  }
  var h='<section class="cw-receipt" aria-label="Session receipt">';
  h+='<div class="cw-receipt__eyebrow"><span>Session receipt</span>';
  if(s.context) h+='<span>'+cwReceiptEsc(s.context)+'</span>';
  h+='</div>';
  if(s.headline) h+='<h2 class="cw-receipt__h">'+cwReceiptEsc(s.headline)+'</h2>';
  if(s.sub) h+='<p class="cw-receipt__sub">'+cwReceiptEsc(s.sub)+'</p>';
  var stats=s.stats||[];
  if(stats.length){
    h+='<div class="cw-receipt__stats">';
    for(i=0;i<stats.length;i++){
      var st=stats[i]||{}, tone=st.tone==='warn'?' is-warn':(st.tone==='good'?' is-good':'');
      h+='<div class="cw-receipt__stat'+tone+'"><span class="cw-receipt__k">'+cwReceiptEsc(st.label)+'</span><span class="cw-receipt__v">'+cwReceiptEsc(st.value)+'</span></div>';
    }
    h+='</div>';
  }
  var reread=s.reread||[];
  if(reread.length){
    h+='<div class="cw-receipt__head">Worth a second look</div>';
    for(i=0;i<reread.length;i++){
      var r=reread[i]||{};
      h+='<div class="cw-receipt__item">';
      if(r.tag) h+='<span class="cw-receipt__tag'+(r.warn?' is-warn':'')+'">'+cwReceiptEsc(r.tag)+'</span>';
      h+='<span style="flex:1;min-width:0"><span class="cw-receipt__title">'+cwReceiptEsc(r.title)+'</span>';
      if(r.note) h+='<span class="cw-receipt__note">'+cwReceiptEsc(r.note)+'</span>';
      if(r.ref) h+='<a class="cw-receipt__link" href="../index.html?page='+encodeURIComponent(String(r.ref))+'" data-cw-receipt-next data-cw-receipt-ref="'+cwReceiptEsc(r.ref)+'" data-cw-receipt-search="?page='+encodeURIComponent(String(r.ref))+'">Re-read: '+cwReceiptEsc(r.refTitle||r.ref)+' →</a>';
      h+='</span></div>';
    }
  }
  if(marked){
    h+='<div class="cw-receipt__done"><span aria-hidden="true">✓</span><span><b>Marked done on Today:</b> '+cwReceiptEsc(s.refTitle||s.ref)+'.</span></div>';
  }
  h+='<div class="cw-receipt__actions">';
  var next=progress&&progress.next;
  if(next){
    var route=cwReceiptStepRoute(next);
    h+='<button type="button" class="cw-receipt__btn is-primary" data-cw-receipt-next data-cw-receipt-ref="'+cwReceiptEsc(next.ref)+'" data-cw-receipt-search="'+cwReceiptEsc(route)+'">Next in your block: '+cwReceiptEsc(next.title)+(next.min?'<small>~'+cwReceiptEsc(next.min)+' min</small>':'')+'</button>';
  }else{
    var acts=s.actions||[];
    for(i=0;i<acts.length;i++){
      var a=acts[i]||{};
      h+='<button type="button" class="cw-receipt__btn'+(a.primary?' is-primary':'')+'"'+(a.id?' id="'+cwReceiptEsc(a.id)+'"':'')+'>'+cwReceiptEsc(a.label)+'</button>';
    }
  }
  h+='<button type="button" class="cw-receipt__btn" data-cw-receipt-home'+(s.homeId?' id="'+cwReceiptEsc(s.homeId)+'"':'')+'>Back to Today</button>';
  if(progress){
    h+='<span class="cw-receipt__blockline">'+(next?('Block · '+progress.done+' of '+progress.total+' done'):('Block complete · '+progress.total+' of '+progress.total+' done'))+'</span>';
    if(!next&&typeof blockClear==='function') blockClear();
  }
  h+='</div></section>';
  return {html:h, marked:marked, next:next||null};
}
