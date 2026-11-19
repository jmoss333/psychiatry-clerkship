/* Encounter-local reflection on heard words. This view never interprets the
   patient's priorities or sends, saves, or scores the review. */
(function(root,factory){
  'use strict';var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PriorityReview=api;
}(typeof window!=='undefined'?window:null,function(){
  'use strict';
  var CASES={sp_depression_gated_si_001:'Dana',sp_alcohol_ambivalence_001:'Morgan'},serial=0;
  var JUDGMENTS=['','Addressed','Partly addressed','Still open'];
  function patient(message){return message&&message.role==='dana';}
  function heard(message){
    if(!patient(message)||typeof message.text!=='string'||!message.text.trim())return null;
    if(message.status==='played')return {text:message.text,partial:false};
    var segments=message.segments,completed=message.completedSegments;
    // A completion count cannot make a pending/failed row a full played quote.
    // Keep exact segment boundaries, including whitespace; never guess a tail.
    if(!Array.isArray(segments)||!segments.length||!segments.every(function(part){return typeof part==='string';})||
      segments.join('')!==message.text||!Number.isInteger(completed)||completed<=0||completed>=segments.length)return null;
    var prefix=segments.slice(0,completed).join('');
    return prefix.trim()&&prefix!==message.text?{text:prefix,partial:true}:null;
  }
  function evidence(snapshot){
    var messages=Array.isArray(snapshot.messages)?snapshot.messages:[],limit=messages.length;
    for(var i=0;i<messages.length;i++){
      if(messages[i]&&messages[i].alternative===true){
        limit=i;
        // Older retry snapshots may flag only the patient half of the retry.
        if(patient(messages[i])&&i>0&&messages[i-1]&&messages[i-1].role==='you')limit--;
        break;
      }
    }
    var patients=[],learners=[],timeline=[],learnerOrdinal=0,patientOrdinal=0;
    for(var index=0;index<limit;index++){
      var message=messages[index];
      if(!message){timeline.push({kind:'other'});continue;}
      if(message.role==='you'){
        learnerOrdinal++;
        var response=message.status==='submitted'&&typeof message.text==='string'&&message.text.trim()
          ?{id:'learner-'+index,messageIndex:index,ordinal:learnerOrdinal,text:message.text}:null;
        if(response)learners.push(response);
        timeline.push({kind:'learner',quote:response});
      }else if(patient(message)){
        patientOrdinal++;
        var words=heard(message),quote=words?{id:'patient-'+index,messageIndex:index,ordinal:patientOrdinal,opening:learnerOrdinal===0,text:words.text,partial:words.partial}:null;
        if(quote)patients.push(quote);
        timeline.push({kind:'patient',quote:quote});
      }else timeline.push({kind:'other'});
    }
    return {patients:patients,learners:learners,timeline:timeline};
  }
  function copy(value){return value?Object.assign({},value):null;}
  function optionWords(text){return text.length>90?text.slice(0,87)+'…':text;}
  function createReview(env,host,options){
    options=options||{};
    var doc=env&&env.document,caseId=options.caseId;
    if(!doc||!host||!Object.prototype.hasOwnProperty.call(CASES,caseId))return null;
    var name=typeof options.patientName==='string'&&options.patientName.trim()?options.patientName:CASES[caseId];
    var prefix='priority-review-'+(++serial),disposed=false,frozen=null,selectedPatient=null,selectedLearner=null,judgment='',note='',listeners=[];
    function node(tag,parent,attrs,text){
      var item=doc.createElement(tag);
      Object.keys(attrs||{}).forEach(function(key){item.setAttribute(key,attrs[key]);});
      if(text!==undefined)item.textContent=text;
      if(parent)parent.appendChild(item);return item;
    }
    function listen(item,type,callback){
      item.addEventListener(type,callback);
      listeners.push(function(){item.removeEventListener(type,callback);});
    }
    function empty(item){while(item.firstChild)item.removeChild(item.firstChild);}
    function label(parent,id,text){return node('label',parent,{for:id},text);}
    var card=node('section',host,{class:'priority-review','aria-labelledby':prefix+'-title'});card.hidden=true;
    node('h3',card,{id:prefix+'-title'},'Did we address what mattered?');
    node('p',card,{class:'priority-help'},'Choose words you heard and a later response you submitted. Their order does not show whether the concern was addressed.');
    var noEvidence=node('p',card,{class:'priority-empty'},'No patient words were confirmed heard in this encounter. There is no quote to review.');
    var fields=node('div',card,{class:'priority-review-fields'});
    var patientField=node('div',fields,{class:'priority-field'});
    label(patientField,prefix+'-patient','Patient words to review');
    var patientSelect=node('select',patientField,{id:prefix+'-patient',class:'priority-select','aria-describedby':prefix+'-patient-status'});
    var patientStatus=node('p',patientField,{id:prefix+'-patient-status',class:'priority-status'});
    var patientQuote=node('blockquote',patientField,{class:'priority-quote'});
    var learnerField=node('div',fields,{class:'priority-field'});
    label(learnerField,prefix+'-learner','Your later response');
    var learnerSelect=node('select',learnerField,{id:prefix+'-learner',class:'priority-select','aria-describedby':prefix+'-learner-status'});
    var learnerStatus=node('p',learnerField,{id:prefix+'-learner-status',class:'priority-status'});
    var learnerQuote=node('blockquote',learnerField,{class:'priority-quote'});
    var nextTurn=node('details',fields,{class:'priority-next-turn'});
    node('summary',nextTurn,{},'Show the immediate next patient turn');
    var nextStatus=node('p',nextTurn,{class:'priority-status'});
    var nextQuote=node('blockquote',nextTurn,{class:'priority-quote'});
    var judgmentField=node('div',fields,{class:'priority-field'});
    label(judgmentField,prefix+'-judgment','Your judgment');
    var judgmentSelect=node('select',judgmentField,{id:prefix+'-judgment',class:'priority-select','aria-describedby':prefix+'-judgment-help'});
    JUDGMENTS.forEach(function(value){node('option',judgmentSelect,{value:value},value||'Choose a judgment');});
    node('p',judgmentField,{id:prefix+'-judgment-help',class:'priority-help'},'Reviewer judgment, not an automated score. Patient words alone cannot confirm what they felt or whether a concern was resolved.');
    var noteField=node('div',fields,{class:'priority-field'});
    label(noteField,prefix+'-note','What remains to ask or clarify');
    var noteInput=node('textarea',noteField,{id:prefix+'-note',class:'priority-note',rows:'3',maxlength:'1200','aria-describedby':prefix+'-note-help'});
    node('p',noteField,{id:prefix+'-note-help',class:'priority-help'},'Optional · up to 1,200 characters. This review stays on this page and clears with a new encounter or when you leave.');
    node('p',card,{class:'priority-help'},'Draft debrief · faculty preview');
    function laterResponses(){return frozen&&selectedPatient?frozen.learners.filter(function(item){return item.messageIndex>selectedPatient.messageIndex;}):[];}
    function nextReply(){
      if(!frozen||!selectedLearner)return {status:'none',quote:null};
      var next=frozen.timeline[selectedLearner.messageIndex+1];
      return !next||next.kind!=='patient'?{status:'none',quote:null}:next.quote?{status:'heard',quote:next.quote}:{status:'unheard',quote:null};
    }
    function clearJudgment(){judgment='';note='';judgmentSelect.value='';noteInput.value='';nextTurn.open=false;}
    function renderSelected(){
      patientStatus.textContent=selectedPatient?(selectedPatient.opening?'Opening words':'Patient turn '+selectedPatient.ordinal)+(selectedPatient.partial?' · partial: completed audio only':' · heard in full'):'';
      patientQuote.textContent=selectedPatient?selectedPatient.text:'';
      learnerQuote.hidden=!selectedLearner;learnerQuote.textContent=selectedLearner?selectedLearner.text:'';
      learnerStatus.textContent=selectedLearner?'Submitted response '+selectedLearner.ordinal+' · later in the conversation':laterResponses().length?'No response selected.':'No submitted learner response follows these patient words.';
      nextTurn.hidden=!selectedLearner;
      var next=nextReply();nextQuote.hidden=!next.quote;nextQuote.textContent=next.quote?next.quote.text:'';
      nextStatus.textContent=next.quote?(next.quote.partial?'Partial patient turn · completed audio only':'Patient turn · heard in full'):next.status==='unheard'?'The immediate next patient turn has no confirmed heard words.':'No patient turn immediately follows this response.';
      judgmentSelect.value=judgment;noteInput.value=note;
    }
    function renderResponses(){
      empty(learnerSelect);node('option',learnerSelect,{value:''},'No response selected');
      laterResponses().forEach(function(item){node('option',learnerSelect,{value:item.id},'Response '+item.ordinal+' · '+optionWords(item.text));});
      learnerSelect.value=selectedLearner?selectedLearner.id:'';renderSelected();
    }
    listen(patientSelect,'change',function(){
      if(disposed||!frozen)return;
      var chosen=frozen.patients.find(function(item){return item.id===patientSelect.value;});
      if(!chosen||chosen===selectedPatient)return;
      selectedPatient=chosen;selectedLearner=laterResponses()[0]||null;clearJudgment();renderResponses();
    });
    listen(learnerSelect,'change',function(){
      if(disposed||!frozen)return;
      var chosen=laterResponses().find(function(item){return item.id===learnerSelect.value;})||null;
      if(chosen===selectedLearner)return;
      selectedLearner=chosen;clearJudgment();renderSelected();
    });
    listen(judgmentSelect,'change',function(){
      if(disposed||!selectedPatient)return;
      judgment=JUDGMENTS.indexOf(judgmentSelect.value)>=0?judgmentSelect.value:'';judgmentSelect.value=judgment;
    });
    listen(noteInput,'input',function(){
      if(disposed||!selectedPatient)return;
      note=noteInput.value.slice(0,1200);noteInput.value=note;
    });
    function update(snapshot){
      if(disposed)return;
      snapshot=snapshot||{};
      var matching=snapshot.caseId===caseId&&snapshot.mode==='full';
      card.hidden=!matching||snapshot.phase!=='ended'||!!snapshot.busy;
      if(!matching||snapshot.phase!=='ended'||snapshot.busy||frozen)return;
      frozen=evidence(snapshot);selectedPatient=frozen.patients[0]||null;selectedLearner=laterResponses()[0]||null;
      noEvidence.hidden=!!selectedPatient;fields.hidden=!selectedPatient;
      empty(patientSelect);
      frozen.patients.forEach(function(item){node('option',patientSelect,{value:item.id},(item.opening?'Opening words':'Patient turn '+item.ordinal)+(item.partial?' · partial':'')+' · '+optionWords(item.text));});
      patientSelect.value=selectedPatient?selectedPatient.id:'';renderResponses();
    }
    function getReview(){
      if(disposed||!frozen)return null;
      var next=nextReply();
      return {caseId:caseId,patientName:name,patientQuotes:frozen.patients.map(copy),learnerResponses:frozen.learners.map(copy),patientQuote:copy(selectedPatient),learnerResponse:copy(selectedLearner),nextPatientReply:copy(next.quote),nextReplyStatus:next.status,judgment:judgment,note:note};
    }
    function dispose(){
      if(disposed)return;disposed=true;listeners.forEach(function(remove){remove();});listeners=[];
      frozen=null;selectedPatient=selectedLearner=null;clearJudgment();
      patientQuote.textContent=learnerQuote.textContent=nextQuote.textContent='';
      empty(patientSelect);empty(learnerSelect);patientSelect.value=learnerSelect.value='';
      empty(card);if(card.parentNode)card.parentNode.removeChild(card);
    }
    return {update:update,dispose:dispose,getReview:getReview};
  }
  return {createReview:createReview};
}));
