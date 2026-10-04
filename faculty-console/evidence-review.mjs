const api='/api/attest?view=evidence';
const inbox=document.querySelector('#inbox'),status=document.querySelector('#status');
let key='',state;
const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
function link(text,href){const e=node('a',text);const u=new URL(href,location.href);if(u.protocol==='https:'||u.origin===location.origin){e.href=u.href;}return e;}
function field(item,path){try{return path.slice(1).split('/').reduce((v,k)=>v[k.replace(/~1/g,'/').replace(/~0/g,'~')],item);}catch{return undefined;}}
function currentQuestion(question){
 const details=node('details');details.open=true;details.append(node('summary','Current committed question'));
 details.append(node('p',question.stem||'Question stem unavailable'));
 const teaching=(obj)=>{for(const name of ['why','evidence','pearl'])if(obj[name])details.append(node('p',obj[name]));
 for(const option of obj.options||obj.o||[]){details.append(node('p',(option.c?'Correct answer: ':'Option: ')+(option.t||'')));if(option.trap?.note||option.note)details.append(node('blockquote',option.trap?.note||option.note));}};
 teaching(question);if(question.tier2){details.append(node('p',question.tier2.q||'Second-tier question'));teaching(question.tier2);}return details;
}
async function request(body){const response=await fetch(api,{method:body?'POST':'GET',headers:{'x-faculty-key':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const value=await response.json();if(!response.ok)throw new Error(value.error?.message||'Evidence inbox unavailable. Retry after checking the collector.');return value;}
async function load(){state=await request();render();status.textContent='Evidence inbox loaded.';}
function render(){
 inbox.replaceChildren();const reload=node('button','Reload evidence');reload.onclick=()=>load().catch(e=>status.textContent=e.message);inbox.append(reload);
 for(const failure of state.failures)inbox.append(node('p',`${failure.sourceId}: ${failure.reason}`,'failure'));
 if(!state.packets.length)inbox.append(node('p','No source-change packets yet. This does not establish clinical currency.'));
 for(const packet of state.packets){
  const article=node('article');article.append(node('h2',packet.sourceName),link('Open original source',packet.sourceUrl),node('p',`${packet.status} · observed ${packet.observedAt}`));
  article.append(node('small',`Question scan: ${packet.scanStatus}. Examined ${packet.coverage.scanned??'unknown'} of ${packet.coverage.active??'unknown'} active questions. Heuristic detection cannot establish clinical consistency.`));
  const comparison=node('div',undefined,'comparison'),source=node('section'),teaching=node('section');source.append(node('h3','Source change'));teaching.append(node('h3','Teaching to review'));comparison.append(source,teaching);article.append(comparison);
  for(const passage of packet.passages){source.append(node('h4','Previously'),node('blockquote',passage.old),node('h4','Now'),node('blockquote',passage.new,'changed'));}
  const fullDiff=node('details');fullDiff.append(node('summary','Source-wide comparison excerpt'),node('p','Display excerpt may be shortened. The scanner examines the complete snapshot changes; open the original source to review full context.'),node('pre',packet.diff||'No textual display diff available.'));source.append(fullDiff);
  if(!packet.passages.length)source.append(node('p','This change has not been localized to a mapped passage.'),node('pre',packet.diff||'Open the original source and collector report to inspect this change.'));
  for(const c of packet.candidates){const block=node('div',undefined,'candidate');block.append(node('strong',c.kind==='possible-contradiction'?'Possible contradiction':'Related teaching',c.kind==='possible-contradiction'?'flag':''),node('p',`${c.questionId} · ${c.fieldPath}`),node('p',c.context),node('blockquote',c.quote),node('p',c.reason));const target=packet.targets.find(t=>t.itemKey==='question:'+c.questionId);if(target?.current){if(target.revision!==c.itemRevision)block.append(node('strong','Question changed since the scan'));block.append(currentQuestion(target.current));}const current=field(target?.current,c.fieldPath);if(current===undefined)block.append(node('strong','The scanned field is no longer present in the current question'));if(current!==undefined&&current!==c.quote)block.append(node('strong','Current saved wording differs from the scan'),node('blockquote',String(current)));block.append(link('Review question in console',`./?item=${encodeURIComponent('question:'+c.questionId)}`));teaching.append(block);}
  for(const r of packet.readings){const section=node('details');section.append(node('summary',`Reading: ${r.page||r.source}`),node('blockquote',r.quote||'Broader citation association; review this reading in context.'));const target=packet.targets.find(t=>t.itemKey==='reading:'+r.source);section.append(node('pre',target?.current||'Reading unavailable'));teaching.append(section);}
  if(packet.replacementRevision)article.append(node('p','A restored mapping has a newer review packet below. Review that replacement to complete this examination.'));
  for(const target of packet.replacementRevision?[]:packet.targets){
   const form=node('form',undefined,'candidate');form.append(node('h4',target.itemKey));
   const select=node('select');select.setAttribute('aria-label','Disposition');for(const [value,label] of [['no-change','Current teaching needs no change'],['needs-edit','Teaching needs editing'],['defer','Defer for further review']]){const option=node('option',label);option.value=value;select.append(option);}select.value=target.decision?.outcome||'defer';
   const label=node('label','Rationale'),area=node('textarea');area.setAttribute('aria-label','Rationale');area.required=true;area.maxLength=2000;label.append(area);const save=node('button','Save disposition');save.disabled=!target.revision;form.append(select,label,save);if(target.decision)form.append(node('p',`${target.decision.actor}: ${target.decision.rationale}`));
   form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{await request({action:'evidence.decide',packetRevision:packet.revision,expectedReportCommit:state.reportCommit,expectedDecisionRevision:state.decisionRevision,dispositions:[{itemKey:target.itemKey,itemRevision:target.revision,outcome:select.value,rationale:area.value}]});await load();status.textContent='Disposition saved. Clinical attestation remains in the faculty console.';}catch(error){status.textContent=error.message+' Your rationale remains here; copy it before reloading.';}finally{save.disabled=false;}};article.append(form);
  }
  inbox.append(article);
 }
}
document.querySelector('#login').onsubmit=async event=>{event.preventDefault();key=document.querySelector('#key').value;try{await load();document.querySelector('#login').hidden=true;document.querySelector('#key').value='';}catch(error){status.textContent=error.message;}};
