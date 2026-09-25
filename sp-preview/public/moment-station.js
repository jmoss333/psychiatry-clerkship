/* Moment-specific display. Microphone and submission belong to the controller;
   private reflection exists only in this mounted panel and is cleared on dispose. */
(function(root,factory){
  'use strict';var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.MomentStation=api;
}(typeof window!=='undefined'?window:null,function(){
  'use strict';
  function chooseTransfer(profile,visited,enabled){
    return (profile.transferTargets||[]).find(function(id){return enabled.has(id)&&!visited.has(id);})||null;
  }
  function originalSources(profile,snapshot){
    var sources=[{id:'setup',label:profile.setupAttribution||'Scripted setup',text:profile.setup}],turn=0;
    (snapshot.messages||[]).forEach(function(row){
      if(row.alternative||row.retry||row.kind==='alternative')return;
      if(row.role==='you'){
        turn++;
        if(row.status==='submitted'&&turn<=4)sources.push({id:'l'+turn,turn:turn,label:'You · original response '+turn,text:row.text});
      }else if(row.role==='dana'||row.role==='patient'){
        var heard=row.status==='played'?row.text:(row.segments||[]).slice(0,row.completedSegments||0).join('');
        sources.push({id:'p'+turn,turn:turn,label:profile.displayName+' · '+(row.status==='played'?'heard':'heard portion only'),text:heard||'',unheard:!heard});
      }
    });
    if(snapshot.reviewAttempted&&snapshot.teamFormulation)sources.push({id:'team-summary',label:'Your submitted team formulation · included in AI feedback',text:snapshot.teamFormulation});
    return sources;
  }
  function mount(host,options){
    options=options||{};
    var doc=host&&host.ownerDocument,profile=options.profile;
    if(!doc||!profile)return null;
    var disposed=false,latest={},wasReflectionOpen=false,lastSources='',lastReport='',lastAlternativeContext='',lastChoiceIds='',sources=[],uncertainNodes=[],selectedTurn=0;
    function el(tag,text,parent,key){
      var node=doc.createElement(tag);
      if(text!==null&&text!==undefined)node.textContent=text;
      if(key)node.setAttribute('data-moment',key);
      if(parent)parent.appendChild(node);
      return node;
    }
    function button(label,parent,key,callback){
      var node=el('button',label,parent,key);node.setAttribute('type','button');
      node.addEventListener('click',function(){if(!disposed&&!node.disabled&&!node.hidden)callback();});return node;
    }
    function call(name){if(typeof options[name]==='function')options[name].apply(null,Array.prototype.slice.call(arguments,1));}
    function clear(node){node.replaceChildren();}
    function section(title,key){var node=el('section',null,host,key);node.setAttribute('class','panel moment-panel');el('h2',title,node);return node;}
    if(host.classList)host.classList.add('moment-station');
    var brief=section(profile.title,'brief');
    var draftLabel=el('p',profile.reviewLabel,brief,'draft-label');draftLabel.setAttribute('class','moment-draft-label');draftLabel.hidden=!profile.reviewLabel;
    el('p',profile.task,brief);el('p',profile.durationLabel+' · Up to '+profile.maxTurns+' responses. The estimate is not a cutoff.',brief);
    var setup=el('details',null,brief);setup.setAttribute('open','');el('summary',profile.setupAttribution||'Scripted setup',setup);el('p',profile.setup,setup);
    var status=el('p','',brief,'status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    var reflectOpen=button('Pause and reflect',brief,'reflect-open',function(){call('onReflectOpen');});reflectOpen.setAttribute('aria-expanded','false');reflectOpen.setAttribute('aria-controls','moment-private-reflection');
    var reflection=section('Pause and reflect','reflection');reflection.id='moment-private-reflection';reflection.hidden=true;reflection.setAttribute('aria-label','Private reflection');
    el('p','Private notes stay on this page. They are never submitted for AI feedback. Closing leaves the microphone paused; resume it when you choose.',reflection);
    var prompts=el('ul',null,reflection);(profile.reflectionPrompts||[]).forEach(function(prompt){el('li',prompt,prompts);});
    var reactionLabel=el('label','Optional: what are you noticing?',reflection);reactionLabel.setAttribute('for','moment-private-reaction');
    var reaction=el('select',null,reflection,'private-reaction');reaction.id='moment-private-reaction';
    ['Choose if useful','Rescue','Defend','Prove myself','Withdraw','Hurry','Something else','Nothing noticeable'].forEach(function(value,index){var item=el('option',value,reaction);item.value=index?value:'';});
    var reflectionLabel=el('label','Private reflection notes',reflection);reflectionLabel.setAttribute('for','moment-private-notes');
    var privateNotes=el('textarea',null,reflection,'private-reflection');privateNotes.id='moment-private-notes';privateNotes.setAttribute('maxlength','2000');
    button('Close reflection',reflection,'reflect-close',function(){call('onReflectClose');});
    reflection.addEventListener('keydown',function(event){if(event.key==='Escape'&&!reflection.hidden){event.preventDefault();event.stopPropagation();call('onReflectClose');}});
    var ending=section('Original conversation','ending');
    el('p','Review the captured words before requesting feedback. A flag records uncertainty without rewriting the conversation.',ending);
    var original=el('div',null,ending,'original');
    var summary=el('div',null,ending,'summary');
    el('h3','Optional team formulation · included in AI feedback',summary);
    el('p','The patient conversation has ended. This separate output is not sent to the patient. Recording keeps a local draft; Review this moment explicitly submits it for AI feedback. You may edit it or leave it blank.',summary);
    el('p',profile.summaryPrompt,summary);
    var summaryLabel=el('label','Team formulation for AI feedback (optional)',summary);summaryLabel.setAttribute('for','moment-team-formulation');
    var team=el('textarea',null,summary,'team-formulation');team.id='moment-team-formulation';team.setAttribute('maxlength','1200');
    team.addEventListener('input',function(){if(!team.disabled)call('onSummaryChange',String(team.value||'').slice(0,1200));});
    var summaryCapture=el('p','',summary,'summary-capture');summaryCapture.setAttribute('aria-live','polite');
    var recordSummary=button('Record team formulation',summary,'record-summary',function(){call('onRecordSummary');});
    var summaryFlagLabel=el('label',null,summary);summaryFlagLabel.setAttribute('class','moment-check');
    var summaryFlag=el('input',null,summaryFlagLabel,'summary-uncertain');summaryFlag.setAttribute('type','checkbox');el('span','These captured team formulation words may be wrong',summaryFlagLabel);
    summaryFlag.addEventListener('change',function(){if(!summaryFlag.disabled)call('onSummaryUncertain',summaryFlag.checked);});
    var zero=el('p','No response was submitted. There is no conversation to assess or try differently. You can use the reflection questions or choose another moment.',ending,'zero-turn');
    var reviewButton=button('Review this moment',ending,'review',function(){call('onReview');});
    var reviewSection=section('Review this moment','review-panel');
    el('p','AI feedback on observable wording, for practice. It is not a clinical judgment or a grade. These cases await faculty review.',reviewSection);
    var report=el('div',null,reviewSection,'report');
    var fallback=el('div',null,reviewSection,'review-fallback');el('h3','Review unavailable',fallback);el('p','No assessment is available. Keep the original dialogue in view and use these authored reflection questions. Failed or uncertain requests are not repeated automatically.',fallback);
    var fallbackPrompts=el('ul',null,fallback);(profile.reflectionPrompts||[]).forEach(function(prompt){el('li',prompt,fallbackPrompts);});
    var alternative=section('Try one response differently','alternative');
    el('p','Choose one original response. Your alternative gets one patient reply from that earlier context, then ends. It does not replace the original conversation and receives no second review.',alternative);
    var chooseLabel=el('label','Original response to revisit',alternative);chooseLabel.setAttribute('for','moment-alternative-turn');
    var choose=el('select',null,alternative,'alternative-turn');choose.id='moment-alternative-turn';
    choose.addEventListener('change',function(){selectedTurn=Number(choose.value);drawAlternativeContext();});
    var alternativeContext=el('div',null,alternative,'alternative-context');
    var alternativeLabel=el('label','Your alternative response',alternative);alternativeLabel.setAttribute('for','moment-alternative-text');
    var alternativeText=el('textarea',null,alternative,'alternative-text');alternativeText.id='moment-alternative-text';alternativeText.setAttribute('maxlength','1200');
    var recordAlternative=button('Record alternative',alternative,'record-alternative',function(){if(selectedTurn)call('onRecordAlternative',selectedTurn);});
    el('p','When recording, the usual quiet window or Space finishes and submits this one alternative.',alternative);
    var submitAlternative=button('Submit typed alternative',alternative,'submit-alternative',function(){var value=String(alternativeText.value||'').trim();if(selectedTurn&&value)call('onRetry',selectedTurn,value);});
    var alternativeCapture=el('p','',alternative,'alternative-capture');alternativeCapture.setAttribute('aria-live','polite');
    var alternativeResult=section('Alternative · separate from the original','alternative-result');var alternativeRows=el('div',null,alternativeResult);
    var transfer=section('A next step, if useful','transfer-panel');
    el('p','Another situation starts fresh and uses the normal shared allowance. Nothing from this conversation or reflection is carried into that patient’s context.',transfer);
    var transferButton=button('Try a different situation',transfer,'transfer',function(){call('onTransfer',chooseTransfer(profile,options.visitedMomentIds||new Set(),options.enabledMomentIds||new Set(profile.transferTargets||[])));});
    button("I’m done",transfer,'done',function(){call('onDone');});
    function drawAlternativeContext(){
      var before=sources.filter(function(source){return source.id==='setup'||(source.id==='p0')||(source.turn&&source.turn<=selectedTurn);});
      var signature=JSON.stringify([selectedTurn,before]);if(signature===lastAlternativeContext)return;lastAlternativeContext=signature;clear(alternativeContext);
      el('h3','Original context · response '+selectedTurn,alternativeContext);
      before.forEach(function(source){el('p',source.label+': '+(source.text||'No completed audio was heard.'),alternativeContext);});
      el('p','The new reply begins from just before your selected response. The original reply above remains labeled for comparison.',alternativeContext);
    }
    function drawSources(){
      var signature=JSON.stringify(sources);if(signature===lastSources)return;lastSources=signature;clear(original);uncertainNodes=[];
      sources.forEach(function(source){
        var row=el('div',null,original);el('p',source.label+': '+(source.text||'No completed audio was heard.'),row);
        if(source.id.charAt(0)==='l'){
          var label=el('label',null,row);label.setAttribute('class','moment-check');
          var flag=el('input',null,label,'uncertain-turn');flag.setAttribute('type','checkbox');flag.checked=(latest.uncertainTurnIds||[]).indexOf(source.turn)!==-1;flag.disabled=!!latest.reviewAttempted;uncertainNodes.push({turn:source.turn,node:flag});
          el('span','These captured words may be wrong · response '+source.turn,label);
          flag.addEventListener('change',function(){if(!disposed&&!flag.disabled)call('onUncertainTurn',source.turn,flag.checked);});
        }
      });
    }
    function drawReport(){
      var signature=JSON.stringify(latest.review||null);if(signature===lastReport)return;lastReport=signature;clear(report);
      var findings=latest.review&&latest.review.findings||[];
      findings.forEach(function(finding,index){
        var box;
        if(index){box=el('details',null,report);el('summary','Additional observation '+(index+1),box);}else box=el('div',null,report);
        el('h3',index?'Observation':'Main observation',box);el('p',finding.observationText,box);
        (finding.evidence||[]).forEach(function(citation){
          var source=sources.find(function(item){return item.id===citation.sourceId;});
          if(!source||!source.text||source.text.slice(citation.start,citation.end)!==citation.quote)return;
          var details=el('details',null,box,'quote-context');el('summary',source.label+' — “'+citation.quote+'”',details);el('p',source.text,details);
        });
        el('h3','Uncertainty',box);el('p',finding.uncertaintyText,box);el('h3','For your next attempt',box);el('p',finding.nextAttemptText,box);
      });
    }
    function update(snapshot){
      if(disposed)return;latest=snapshot||{};sources=originalSources(profile,latest);
      var stage=latest.momentStage||'dialogue',ended=stage!=='dialogue',locked=!!latest.reviewAttempted;
      var submitted=sources.filter(function(source){return source.id.charAt(0)==='l';}),hasTurns=submitted.length>0;
      var captureBusy=!!latest.reflectionOpen||latest.phase==='listening'||latest.phase==='connecting'||latest.phase==='responding'||latest.phase==='speaking';
      status.textContent=(latest.turn||0)+' of '+(latest.maxTurns||profile.maxTurns)+' responses · '+({dialogue:'Conversation',ending:'Patient conversation ended',reviewing:'Preparing review',reviewed:'Review complete',review_unavailable:'Review unavailable',alternative_done:'Alternative complete'}[stage]||'Moment ended');
      reflectOpen.disabled=!!latest.busy||latest.phase==='speaking'||latest.phase==='responding';
      reflection.hidden=!latest.reflectionOpen;reflectOpen.setAttribute('aria-expanded',String(!reflection.hidden));
      if(latest.reflectionOpen&&!wasReflectionOpen&&privateNotes.focus)privateNotes.focus();
      if(!latest.reflectionOpen&&wasReflectionOpen&&reflectOpen.focus)reflectOpen.focus();wasReflectionOpen=!!latest.reflectionOpen;
      ending.hidden=!ended;summary.hidden=!profile.summaryPrompt||!hasTurns;
      team.disabled=locked||latest.captureTarget==='team_formulation';summaryFlag.disabled=locked;
      if(team.value!==(latest.teamFormulation||''))team.value=latest.teamFormulation||'';
      summaryFlag.checked=!!latest.summaryUncertain;
      recordSummary.disabled=locked||!!latest.busy||captureBusy||!!latest.restartRequired;
      summaryCapture.textContent=latest.captureTarget==='team_formulation'?'Local team formulation recording: '+[latest.draft,latest.interim].filter(Boolean).join(' '):'';
      zero.hidden=hasTurns;reviewButton.hidden=!hasTurns;reviewButton.disabled=locked||!!latest.busy||captureBusy||!!latest.restartRequired;
      reviewSection.hidden=!ended||!hasTurns||(!locked&&!latest.review);fallback.hidden=stage!=='review_unavailable';
      drawSources();uncertainNodes.forEach(function(item){item.node.checked=(latest.uncertainTurnIds||[]).indexOf(item.turn)!==-1;item.node.disabled=locked;});drawReport();
      var ids=submitted.map(function(source){return source.turn;});var choiceSignature=JSON.stringify(ids);
      if(choiceSignature!==lastChoiceIds){lastChoiceIds=choiceSignature;clear(choose);submitted.forEach(function(source){var option=el('option','Response '+source.turn+': '+source.text.slice(0,100),choose);option.value=String(source.turn);});if(ids.indexOf(selectedTurn)<0)selectedTurn=ids[0]||0;choose.value=String(selectedTurn);}
      var eligible=hasTurns&&!!latest.closedReceiptAvailable&&!latest.retryUsed&&!latest.restartRequired&&(stage==='reviewed'||stage==='review_unavailable');
      alternative.hidden=!eligible;choose.disabled=!!latest.busy||captureBusy;alternativeText.disabled=!!latest.busy||captureBusy;recordAlternative.disabled=!!latest.busy||captureBusy;submitAlternative.disabled=!!latest.busy||captureBusy;
      drawAlternativeContext();alternativeCapture.textContent=latest.captureTarget==='alternative'?'Alternative recording: '+[latest.draft,latest.interim].filter(Boolean).join(' '):'';
      var altRows=(latest.messages||[]).filter(function(row){return row.alternative;});alternativeResult.hidden=!altRows.length;clear(alternativeRows);
      altRows.forEach(function(row){var heard=row.role==='you'||row.status==='played'?row.text:(row.segments||[]).slice(0,row.completedSegments||0).join('');el('p',(row.role==='you'?'You · alternative':profile.displayName+' · alternative heard reply')+': '+(heard||'No completed audio was heard.'),alternativeRows);});
      transfer.hidden=!ended;transferButton.textContent=chooseTransfer(profile,options.visitedMomentIds||new Set(),options.enabledMomentIds||new Set(profile.transferTargets||[]))?'Try a different situation':'Choose another moment';transferButton.disabled=!!latest.busy||captureBusy;
    }
    function dispose(){disposed=true;privateNotes.value='';reaction.value='';team.value='';alternativeText.value='';sources=[];latest={};clear(host);}
    update({});return {update:update,dispose:dispose};
  }
  return {mount:mount,chooseTransfer:chooseTransfer};
}));
