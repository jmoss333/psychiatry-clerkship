(function(){
 'use strict';
 var byId=function(id){return document.getElementById(id);},key='',loading=false,active=null;
 var names={sp_depression_gated_si_001:'Dana',sp_alcohol_ambivalence_001:'Morgan'};
 var settings={natural:'Natural openings',invited:'Wait for an invitation',forthcoming:'More forthcoming'};
 if(location.hash){key=location.hash.slice(1);history.replaceState(null,'',location.pathname+location.search);}
 function node(tag,text,parent){var item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(parent)parent.appendChild(item);return item;}
 function validQuote(value,limit){return value&&typeof value.text==='string'&&value.text.length>0&&value.text.length<=limit;}
 function valid(row){return row&&Object.hasOwn(names,row.caseId)&&/^[a-f0-9]{32}$/.test(row.reference)&&['Addressed','Partly addressed','Still open'].includes(row.judgment)&&typeof row.note==='string'&&row.note.length<=1200&&typeof row.savedAt==='string'&&Number.isFinite(Date.parse(row.savedAt))&&row.settings&&Object.hasOwn(settings,row.settings.concernInitiative)&&validQuote(row.patient,1200)&&(row.learner===null||validQuote(row.learner,1200))&&(row.patientReply===null||validQuote(row.patientReply,1200));}
 function quote(parent,label,value){node('h3',label,parent);node('blockquote',value.text,parent);if(value.omittedTail)node('p','Partial reply · completed audio only',parent).className='fine';}
 async function refresh(){
  if(loading)return;
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(key)){byId('feedback-status').textContent='Open your private review link or enter its review key.';return;}
  loading=true;byId('feedback-refresh').disabled=true;byId('feedback-status').textContent='Loading saved feedback…';
  active=new AbortController();var operation=active,timer=setTimeout(function(){operation.abort();},15000);
  try{
   var response=await fetch('/api/faculty-feedback',{headers:{Authorization:'Bearer '+key},credentials:'omit',cache:'no-store',signal:operation.signal});
   if(!response.ok)throw Error(response.status===403?'The private review key was not accepted.':'Feedback could not be loaded. Try Refresh feedback.');
   var data=await response.json();if(!data||!Array.isArray(data.records)||data.records.length>200||typeof data.truncated!=='boolean'||!data.records.every(valid))throw Error('The saved feedback could not be verified. Try Refresh feedback.');
   if(active!==operation)return;
   byId('feedback-records').replaceChildren();
   data.records.forEach(function(row){
    var card=node('article',undefined,byId('feedback-records'));card.className='panel priority-review';
    node('h2',names[row.caseId]+' · '+row.judgment,card);
    node('p',settings[row.settings.concernInitiative]+' · '+new Date(row.savedAt).toLocaleString(),card).className='fine';
    node('h3','What remains to ask or clarify',card);node('p',row.note||'No note supplied.',card).className='feedback-note';
    var details=node('details',undefined,card);node('summary','Selected exchange',details);quote(details,names[row.caseId]+' said',row.patient);
    if(row.learner)quote(details,'Learner response',row.learner);else node('p','No later learner response selected.',details);
    if(row.patientReply)quote(details,'Immediate patient reply',row.patientReply);
    node('p','Reference '+row.reference.slice(0,8),card).className='fine';
   });
   byId('feedback-unlock').hidden=true;byId('feedback-actions').hidden=false;
   byId('feedback-status').textContent=data.records.length+' saved '+(data.records.length===1?'review':'reviews')+'.'+(data.truncated?' More feedback is available than this page can display.':'');
  }catch(error){if(active===operation){byId('feedback-records').replaceChildren();byId('feedback-status').textContent=error.name==='AbortError'?'Loading took too long. Try opening feedback again.':error.message;}}
  finally{clearTimeout(timer);if(active===operation){active=null;loading=false;byId('feedback-refresh').disabled=false;}}
 }
 byId('feedback-unlock').addEventListener('submit',function(event){event.preventDefault();key=byId('feedback-key').value.trim();byId('feedback-key').value='';refresh();});
 byId('feedback-refresh').addEventListener('click',refresh);
 byId('feedback-lock').addEventListener('click',function(){if(active)active.abort();active=null;loading=false;key='';byId('feedback-records').replaceChildren();byId('feedback-key').value='';byId('feedback-unlock').hidden=false;byId('feedback-actions').hidden=true;byId('feedback-refresh').disabled=false;byId('feedback-status').textContent='Private view closed.';});
 if(key)refresh();
}());
