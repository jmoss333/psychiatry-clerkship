  /* ===== Pre/post knowledge check: DRAFT scaffold (L8 outcomes design, 2026-10-16) =====
     Ships ONLY when the build runs with CLERKSHIP_PREPOST=on (default off). Otherwise the
     shell's marker expands to nothing and the two typeof-guarded hooks in spa_index.html
     are no-ops. Not approved for use with learners until the ethics determination is on file.

     Local-only by construction: answers live in this browser under cw_prepost_v1 and are
     never transmitted. The learner may export a file and submit it through the channel the
     approved information sheet names. The file holds a random code, the form order, per-item
     right/wrong, scores and the DATE of each sitting. It holds no name, email, free text or
     timestamp finer than a day. The forms come from prepost_forms.json: two parallel 12-item
     forms of faculty-attested question-bank items, one per blueprint category, disjoint from
     each other and from the placement. Counterbalanced: the code decides A-then-B or B-then-A.
     No answer feedback is shown, so the check does not teach its own items. */
  var PP_FORMS=null, ppAnswers={}, ppPhase=null, ppRequest=0;
  function ppLoad(){ try{ var d=JSON.parse(localStorage.getItem('cw_prepost_v1')||'null'); if(d&&d.v===1&&typeof d.code==='string')return d; }catch(_){ } return null; }
  function ppSave(d){ try{ localStorage.setItem('cw_prepost_v1',JSON.stringify(d)); }catch(_){ } }
  function ppWipe(){ try{ localStorage.removeItem('cw_prepost_v1'); }catch(_){ } }
  var PP_CODE_RE=/^PP-[A-HJKMNP-Z2-9]{6}$/;
  function ppNewCode(){ var A='ABCDEFGHJKMNPQRSTUVWXYZ23456789',b=[],s='PP-',i; try{ var u=new Uint8Array(6); window.crypto.getRandomValues(u); for(i=0;i<6;i++)b.push(u[i]); }catch(_){ for(i=0;i<6;i++)b.push(Math.floor(Math.random()*256)); } for(i=0;i<6;i++)s+=A.charAt(b[i]%A.length); return s; }
  function ppOrder(code){ return (code.charCodeAt(code.length-1)%2===0)?['A','B']:['B','A']; }
  function ppToday(){ return new Date().toISOString().slice(0,10); }
  function ppDays(a,b){ var x=Date.parse(a),y=Date.parse(b); return (isNaN(x)||isNaN(y))?0:Math.round((y-x)/86400000); }
  function ppShell(title,body){ if(contentEl){ contentEl.className='fd-main'; contentEl.innerHTML='<article class="fd-reader fd-progress-reader"><button type="button" class="fd-reader__back" data-progress-action="progress">‹ Progress</button><div class="hm" id="ppRoot"><h1>'+esc(title)+'</h1>'+body+'</div></article>'; } }
  function fdPrepostSectionHtml(){
    var d=ppLoad(), h='<div class="hm-sec" data-prepost-section><h2>Knowledge check <span style="font-weight:400;color:var(--text-light)">· optional · draft</span></h2>';
    h+='<div class="sub" style="margin:0 0 8px">Two short, ungraded 12-question checks, one at the start of the rotation and one at the end. Answers stay on this device unless you choose to export them.</div>';
    if(!d){ h+='<button class="hm-li" data-prepost="about"><span class="t">Read about it and decide</span><span class="sec">→</span></button>'; h+='<button class="hm-li" data-prepost="restore"><span class="t">I already have a code from another device</span><span class="sec">→</span></button>'; }
    else {
      if(!d.pre&&!d.restored){ h+='<button class="hm-li" data-prepost="start-pre"><span class="t">Take the start-of-rotation check</span><span class="sec">12 questions →</span></button>'; }
      else if(!d.post){ if(d.pre){ var days=ppDays(d.pre.on,ppToday()); h+='<div class="sub" style="margin:0 0 6px">Start check done '+days+' day'+(days===1?'':'s')+' ago. Take the end check in your last week.</div>'; } h+='<button class="hm-li" data-prepost="start-post"><span class="t">Take the end-of-rotation check</span><span class="sec">12 questions →</span></button>'; }
      else { h+='<div class="sub" style="margin:0 0 6px">'+(d.pre?'Start: '+d.pre.score+'/'+d.pre.n+' · ':'')+'End: '+d.post.score+'/'+d.post.n+'</div>'; }
      h+='<button class="hm-li" data-prepost="export"><span class="t">Export my knowledge-check file</span><span class="sec">Export ↓</span></button>';
      h+='<div class="sub" style="margin:4px 0 6px">Your code: <strong>'+esc(d.code)+'</strong>. Write it down if you might switch devices.</div>';
      h+='<button class="hm-li" data-prepost="withdraw"><span class="t">Stop and delete my knowledge-check answers</span><span class="sec">Delete</span></button>';
    }
    return h+'<div id="ppMsg" class="hm-empty" role="status" aria-live="polite" style="margin-top:6px"></div></div>';
  }
  function ppRenderAbout(){
    var b='<p class="sub"><strong>Draft for ethics review.</strong> This wording is a placeholder until the information sheet is approved.</p>';
    b+='<ul class="sub" style="margin:0 0 12px;padding-left:18px">';
    b+='<li>Two checks of 12 questions each, from this site’s faculty-reviewed question bank. About 10 minutes each.</li>';
    b+='<li>Taking part is your choice. It is not graded and has no effect on your evaluation. Your preceptor and clerkship director cannot see your answers.</li>';
    b+='<li>Nothing is sent anywhere. Your answers stay in this browser.</li>';
    b+='<li>If you choose, you can export a file holding a random code, which questions you got right, your scores and the dates. It has no name, email or patient information.</li>';
    b+='<li>[Where to submit the file, who holds it, and how to withdraw: to be filled from the approved information sheet.]</li>';
    b+='</ul><button class="hm-btn" data-prepost="consent">Yes, I’ll take part</button> <button class="hm-btn" data-progress-action="progress">No thanks</button>';
    ppShell('About the knowledge check',b);
  }
  function ppRenderRestore(){
    var b='<p class="sub">Enter the code from your other device (for example PP-7KQ2MX). Your earlier answers stay on that device; this keeps the same code so both files can be paired.</p>';
    b+='<p><input id="ppCodeIn" type="text" inputmode="text" autocomplete="off" maxlength="9" aria-label="Your knowledge-check code" style="font:inherit;padding:6px 8px;text-transform:uppercase"> <button class="hm-btn" data-prepost="restore-save">Use this code</button></p><div id="ppMsg" class="hm-empty" role="status" aria-live="polite"></div>';
    ppShell('Use an existing code',b);
  }
  function ppStart(phase){
    var d=ppLoad(); if(!d)return; var request=++ppRequest; ppPhase=phase; ppAnswers={};
    ppShell(phase==='pre'?'Start-of-rotation check':'End-of-rotation check','<p class="sub">Loading…</p>');
    var go=function(forms){ if(request!==ppRequest)return; PP_FORMS=forms; ppRenderForm(); };
    if(PP_FORMS){ go(PP_FORMS); return; }
    fetch('prepost_forms.json').then(function(r){return r.ok?r.json():null;}).then(function(j){ go(j&&j.forms?j.forms:null); }).catch(function(){ go(null); });
  }
  function ppFormFor(d,phase){ var o=ppOrder(d.code); return phase==='pre'?o[0]:o[1]; }
  function ppRenderForm(){
    var root=document.getElementById('ppRoot'), d=ppLoad(); if(!root||!d)return;
    var form=ppFormFor(d,ppPhase), items=(PP_FORMS&&PP_FORMS[form])||[];
    if(!items.length){ root.innerHTML='<h1>Check unavailable</h1><p class="sub">The questions didn’t load. Try again later.</p>'; return; }
    var h='<h1>'+(ppPhase==='pre'?'Start':'End')+'-of-rotation check</h1><p class="sub">Pick the best answer. No feedback is shown, so the check stays fair for the end-of-rotation sitting. Unsubmitted answers are not saved.</p>';
    items.forEach(function(it,qi){ h+='<div class="pt-q"><div class="pt-stem">'+(qi+1)+' of '+items.length+'. '+esc(it.stem)+'</div>'; (it.options||[]).forEach(function(o){ h+='<button class="pt-opt" data-pp-qi="'+qi+'" data-key="'+esc(o.key)+'"><b>'+esc(o.key)+'.</b> '+esc(o.t)+'</button>'; }); h+='</div>'; });
    h+='<div style="margin-top:6px"><button class="hm-btn" data-prepost="submit">Submit</button> <span id="ppCount" class="hm-empty" role="status" aria-live="polite" aria-atomic="true"></span></div>';
    root.innerHTML=h; ppUpdateCount();
  }
  function ppUpdateCount(){ var el=document.getElementById('ppCount'),d=ppLoad(); if(!el||!d)return; var t=((PP_FORMS&&PP_FORMS[ppFormFor(d,ppPhase)])||[]).length,n=0,k; for(k in ppAnswers){ if(ppAnswers.hasOwnProperty(k))n++; } el.textContent=n+' of '+t+' answered'; }
  function ppSubmit(){
    var d=ppLoad(); if(!d||!ppPhase)return; var form=ppFormFor(d,ppPhase), items=(PP_FORMS&&PP_FORMS[form])||[], res=[], score=0;
    items.forEach(function(it,qi){ var k=ppAnswers[qi]||null, ok=false; (it.options||[]).forEach(function(o){ if(k&&o.key===k&&o.c)ok=true; }); if(ok)score++; res.push({id:it.id,cat:it.cat,a:k?(ok?1:0):null}); });
    d[ppPhase]={form:form,on:ppToday(),n:items.length,score:score,items:res}; ppSave(d);
    ppShell('Saved','<p class="sub">You scored '+score+' of '+items.length+'. '+(ppPhase==='pre'?'See you at the end of the rotation.':'Thank you.')+'</p><button class="hm-btn" data-progress-action="progress">Back to Progress</button>');
    ppPhase=null;
  }
  function ppExport(){
    var d=ppLoad(); if(!d)return;
    var payload={schema:'clerkship-prepost-v1',status:'draft',code:d.code,order:ppOrder(d.code).join(''),restored:!!d.restored,pre:d.pre||null,post:d.post||null};
    var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download='knowledge_check_'+d.code+'.json'; document.body.appendChild(a); a.click(); a.remove();
    var m=document.getElementById('ppMsg'); if(m)m.textContent='Exported. The file is on your device; nothing was sent.';
  }
  function fdPrepostHandleClick(target,event){
    var el=target.closest&&target.closest('[data-pp-qi]');
    if(el){ event.preventDefault(); var qi=el.getAttribute('data-pp-qi'); ppAnswers[qi]=el.getAttribute('data-key'); var sib=contentEl.querySelectorAll('[data-pp-qi="'+qi+'"]'); for(var i=0;i<sib.length;i++)sib[i].classList.remove('sel'); el.classList.add('sel'); ppUpdateCount(); return true; }
    el=target.closest&&target.closest('[data-prepost]'); if(!el)return false;
    event.preventDefault(); if(typeof facultyPreviewRequest!=='undefined'&&facultyPreviewRequest)return true;
    var act=el.getAttribute('data-prepost'), d=ppLoad();
    if(act==='about')ppRenderAbout();
    else if(act==='consent'){ if(!d){ ppSave({v:1,code:ppNewCode(),consentedOn:ppToday(),pre:null,post:null}); } ppStart('pre'); }
    else if(act==='restore')ppRenderRestore();
    else if(act==='restore-save'){ var inp=document.getElementById('ppCodeIn'),c=inp?String(inp.value||'').trim().toUpperCase():'',m=document.getElementById('ppMsg'); if(!PP_CODE_RE.test(c)){ if(m)m.textContent='That does not look like a code (PP- then six letters or digits).'; return true; } ppSave({v:1,code:c,consentedOn:ppToday(),restored:true,pre:null,post:null}); ppShell('Code saved','<p class="sub">Code '+esc(c)+' saved on this device.</p><button class="hm-btn" data-progress-action="progress">Back to Progress</button>'); }
    else if(act==='start-pre')ppStart('pre');
    else if(act==='start-post')ppStart('post');
    else if(act==='submit')ppSubmit();
    else if(act==='export')ppExport();
    else if(act==='withdraw'){ ppWipe(); var mm=document.getElementById('ppMsg'); if(mm)mm.textContent='Deleted from this device. Any file you already submitted is withdrawn through the contact on the information sheet.'; }
    return true;
  }
