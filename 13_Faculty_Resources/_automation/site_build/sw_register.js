/* Service-worker registration + update toast. Injected via SW_REGISTER marker (shell only —
   never tools: each iframe would re-register). Toast is suppressed on ?tool= routes (a reload
   mid-session destroys session state) and re-arms every page load (A2HS users have no refresh
   affordance). Kill/rollback: see GIT_AND_DEPLOY_PLAN.md (SW_KILL=1 rebuild).

   Scope note (verified against spa_index.html, not assumed): facultyPreviewRequest is declared
   with `var` at top level of the SAME <script> block this marker lands in (script 1 — there is
   no wrapping IIFE), so it IS in scope here and the direct `typeof` guard below is correct and
   sufficient — no document-level fallback signal is needed. The one thing that matters is ORDER:
   that `var` is assigned partway through script 1's boot sequence, and a hoisted `var` reads as
   `undefined` (not a ReferenceError, but also not the real value) at any point in the same script
   that runs before its assignment executes. So the marker must be placed AFTER
   `facultyPreviewRequest=readFacultyPreviewRequest()` runs, not at the script's very top — see
   the placement comment at the call site in spa_index.html. */
function registerClerkshipSW(){
  try{
    if(!('serviceWorker' in navigator)) return;
    if(typeof facultyPreviewRequest!=='undefined' && facultyPreviewRequest) return;
    navigator.serviceWorker.register('/sw.js').then(function(reg){
      reg.addEventListener('updatefound', function(){
        var w=reg.installing; if(!w) return;
        w.addEventListener('statechange', function(){
          if(w.state!=='installed' || !navigator.serviceWorker.controller) return;
          if(new URLSearchParams(location.search).get('tool')) return;
          var t=document.createElement('div');
          t.className='sw-toast';
          t.setAttribute('role','status');
          t.innerHTML='Updated content available · ';
          var b=document.createElement('button'); b.type='button'; b.textContent='Refresh';
          b.addEventListener('click', function(){ w.postMessage({type:'SKIP_WAITING'}); });
          var x=document.createElement('button'); x.type='button'; x.textContent='Later';
          x.setAttribute('aria-label','Dismiss update notice');
          x.addEventListener('click', function(){ if(t.parentNode) t.parentNode.removeChild(t); });
          t.appendChild(b); t.appendChild(x); document.body.appendChild(t);
        });
      });
      var reloaded=false;
      navigator.serviceWorker.addEventListener('controllerchange', function(){
        if(reloaded) return; reloaded=true; location.reload();
      });
    }).catch(function(){});
  }catch(_){ }
}
registerClerkshipSW();
