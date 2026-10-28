import {decodeEvidenceResponse} from './evidence-response.mjs';
import {reviewPriority} from './evidence-priority.mjs';
const api='/api/attest?view=evidence';
const inbox=document.querySelector('#inbox'),status=document.querySelector('#status');
let key='',state,loadVersion=0,draftVersion=0;
const openContexts=new Set();
const dirtyForms=new Set();
const resumeKey='cw_evidence_last_packet';
let resumeButton;
function lastPacket(){try{const value=localStorage.getItem(resumeKey);return /^[a-f0-9]{64}$/.test(value||'')?value:null;}catch{return null;}}
function rememberPacket(revision){
 if(!/^[a-f0-9]{64}$/.test(revision))return;
 try{localStorage.setItem(resumeKey,revision);}catch{/* Review remains available when storage is blocked. */}
 if(resumeButton)resumeButton.hidden=!lastPacket();
}
async function resumeReview(){
 const revision=lastPacket();if(!revision){status.textContent='No saved packet is available on this browser.';return;}
 if(dirtyForms.size){status.textContent='Save your unsaved notes before resuming. Your notes remain here.';return;}
 await load(revision,{resume:true});
}
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
async function request(body,params={}){const url=api+'&'+new URLSearchParams(params);const response=await fetch(url,{method:body?'POST':'GET',headers:{'x-faculty-key':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const value=await response.json();if(!response.ok)throw new Error(value.error?.message||'Evidence inbox unavailable. Retry after checking the collector.');return decodeEvidenceResponse(value);}
async function load(openRevision,{resume=false}={}){
 if(dirtyForms.size&&!window.confirm('Reloading will discard unsaved rationales. Continue?'))return;
 const drafts=draftVersion,version=++loadVersion,next=await request(null,{section:'index'});
 if(version!==loadVersion)return;
 if(drafts!==draftVersion){status.textContent='New typing was preserved. Reload again when ready.';return;}
 state=next;dirtyForms.clear();openContexts.clear();openContexts.add(state);render();status.textContent='Packet list loaded. Open a packet to check current teaching and review details.';
 if(openRevision){
  const button=[...inbox.querySelectorAll('button[data-packet]')].find(b=>b.dataset.packet===openRevision);
  if(!button){if(resume)status.textContent='Your saved packet is unavailable in the current inbox. All available packets and audit history remain below.';return;}
  const opened=await button.onclick();
  if(resume&&opened&&state===next){button.scrollIntoView({block:'start'});button.focus({preventScroll:true});status.textContent='Review resumed with freshly checked evidence, teaching, and decisions.';}
 }
}
function pins(context){return {reportCommit:context.reportCommit,teachingCommit:context.teachingCommit,decisionRevision:context.decisionRevision};}
function rawRecord(title,value){
 const details=node('details');details.append(node('summary',title));let rendered=false;
 details.ontoggle=()=>{if(details.open&&!rendered){details.append(node('pre',JSON.stringify(value,null,2)));rendered=true;}};
 return details;
}
function decisionHistory(decisions){
 const details=node('details');details.append(node('summary',`Decision history (${decisions.decisions.length})`));let rendered=false;
 details.ontoggle=()=>{if(!details.open||rendered)return;rendered=true;
  if(!decisions.decisions.length)details.append(node('p','No recorded decisions.'));
  for(const d of decisions.decisions){const entry=node('section');entry.append(node('h4',`${d.actor} · ${d.at||'Date unavailable'}`),node('p',`${d.itemKey} · ${d.outcome}`),node('blockquote',d.rationale),rawRecord('Full decision record',d));details.append(entry);}
 };return details;
}
function lazyPanel(parent,label,params,renderDetails,context,id){
 const button=node('button',label),panel=node('section');panel.id=id;panel.hidden=true;
 button.type='button';if(params.packetRevision)button.dataset.packet=params.packetRevision;button.setAttribute('aria-controls',id);button.setAttribute('aria-expanded','false');
 let loaded=false;
 button.onclick=async()=>{
  if(loaded){panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden&&params.packetRevision)rememberPacket(params.packetRevision);return;}
  button.disabled=true;button.textContent='Loading…';
  try{
   const details=await request(null,{...params,...pins(context)});
   if(state!==context)return;
   if(details.decisionRevision!==context.decisionRevision)throw new Error('Decisions changed while loading. Retry opening.');
   openContexts.add(details);
   panel.replaceChildren();renderDetails(panel,details);loaded=true;panel.hidden=false;button.setAttribute('aria-expanded','true');
   if(params.packetRevision)rememberPacket(params.packetRevision);
   return true;
  }catch(error){if(state===context){panel.replaceChildren(node('p',error.message,'failure'));panel.hidden=false;button.setAttribute('aria-expanded','true');}}
  finally{button.disabled=false;button.textContent=label;}
 };
 parent.append(button,panel);
}
function render(){
 const context=state;
 inbox.replaceChildren();const reload=node('button','Reload evidence');reload.onclick=()=>load().catch(e=>status.textContent=e.message);inbox.append(reload);
 resumeButton=node('button','Resume review');resumeButton.type='button';resumeButton.hidden=!lastPacket();resumeButton.onclick=()=>resumeReview().catch(e=>status.textContent=e.message);inbox.append(resumeButton);
 for(const failure of state.failures)inbox.append(node('p',`${failure.sourceId}: ${failure.reason}`,'failure'));
 if(!state.packets.length)inbox.append(node('p','No source-change packets yet. This does not establish clinical currency.'));
 lazyPanel(inbox,'Open audit history',{section:'history'},(panel,data)=>{
  panel.append(node('h2','Audit history'),node('p',`${data.packetRevisions.length} retained packets. Every packet can be opened from the list below.`),decisionHistory(data.decisions),rawRecord('Source snapshots, mapping receipts, and collection history',data.history));
 },context,'evidence-history');
 inbox.append(node('h2','Review first'),node('p','All retained packets are listed below, including earlier and replacement packets. Ordering uses the saved scan; open a packet to check current teaching and decisions. These hints are not a clinical risk score.'));
 state.packets.forEach((packet,index)=>{
  const article=node('article');article.append(node('h2',packet.sourceName),link('Open original source',packet.sourceUrl),node('p',`Observed ${packet.observedAt}`));
  const priority=packet.priority;article.append(node('strong',priority.label),node('p',`${priority.counts.questions} distinct questions · ${priority.counts.readings} distinct readings`));
  const reasons=node('ul');for(const reason of priority.reasons)reasons.append(node('li',reason));article.append(reasons);
  article.append(node('p',`${packet.decisionCount} recorded decisions. Current teaching and review status checked when opened.`));
  if(packet.replacementRevision)article.append(node('p','A newer replacement packet is also in this list. Earlier evidence remains available.'));
  lazyPanel(article,'Open packet',{section:'packet',packetRevision:packet.revision},(panel,data)=>{
   panel.append(node('h3','Packet details'),node('p',`Current review status: ${data.packet.status}`));
   renderPacket(panel,data.packet,data);
   panel.append(decisionHistory(data.decisions),rawRecord('Full retained packet evidence',data.retainedPacket));
  },context,'evidence-packet-'+index);
  inbox.append(article);
 });
}
function renderPacket(article,packet,context){
 const priority=reviewPriority(packet);
 article.append(node('strong',priority.label));
 for(const reason of priority.reasons)article.append(node('p',reason));
 article.append(node('small',`Question scan: ${packet.scanStatus}. Examined ${packet.coverage.scanned??'unknown'} of ${packet.coverage.active??'unknown'} active questions. Heuristic detection cannot establish clinical consistency.`));
  const comparison=node('div',undefined,'comparison'),source=node('section'),teaching=node('section');source.append(node('h3','Source change'));teaching.append(node('h3','Teaching to review'));comparison.append(source,teaching);article.append(comparison);
  for(const passage of packet.passages){source.append(node('h4','Previously'),node('blockquote',passage.old),node('h4','Now'),node('blockquote',passage.new,'changed'));}
  const fullDiff=node('details');fullDiff.append(node('summary','Source-wide comparison excerpt'),node('p','Display excerpt may be shortened. The scanner examines the complete snapshot changes; open the original source to review full context.'),node('pre',packet.diff||'No textual display diff available.'));source.append(fullDiff);
  if(!packet.passages.length)source.append(node('p','This change has not been localized to a mapped passage.'),node('pre',packet.diff||'Open the original source and collector report to inspect this change.'));
  for(const c of packet.candidates){const block=node('div',undefined,'candidate');block.append(node('strong',c.kind==='possible-contradiction'?'Possible contradiction':'Related teaching',c.kind==='possible-contradiction'?'flag':''),node('p',`${c.questionId} · ${c.fieldPath}`),node('p',c.context),node('blockquote',c.quote),node('p',c.reason));const target=packet.targets.find(t=>t.itemKey==='question:'+c.questionId);if(target?.current){if(target.revision!==c.itemRevision)block.append(node('strong','Question changed since the scan'));block.append(currentQuestion(target.current));}const current=field(target?.current,c.fieldPath);if(current===undefined)block.append(node('strong','The scanned field is no longer present in the current question'));if(current!==undefined&&current!==c.quote)block.append(node('strong','Current saved wording differs from the scan'),node('blockquote',String(current)));block.append(link('Review question in console',`./?item=${encodeURIComponent('question:'+c.questionId)}`));teaching.append(block);}
  for(const r of packet.readings){const section=node('details');section.append(node('summary',`Reading: ${r.page||r.source}`),node('blockquote',r.quote||'Broader citation association; review this reading in context.'));const target=packet.targets.find(t=>t.itemKey==='reading:'+r.source);section.append(node('pre',target?.current||'Reading unavailable'));teaching.append(section);}
  if(packet.replacementRevision)article.append(node('p','A restored mapping has a newer review packet. Review that replacement to complete this examination.'));
  for(const target of packet.replacementRevision?[]:packet.targets){
   const form=node('form',undefined,'candidate');form.append(node('h4',target.itemKey));
   const select=node('select');select.setAttribute('aria-label','Disposition');for(const [value,label] of [['no-change','Current teaching needs no change'],['needs-edit','Teaching needs editing'],['defer','Defer for further review']]){const option=node('option',label);option.value=value;select.append(option);}select.value=target.decision?.outcome||'defer';
   const label=node('label','Rationale'),area=node('textarea');area.setAttribute('aria-label','Rationale');area.required=true;area.maxLength=2000;label.append(area);const save=node('button','Save disposition');save.disabled=!target.revision;form.append(select,label,save);if(target.decision)form.append(node('p',`${target.decision.actor}: ${target.decision.rationale}`));
   form.addEventListener('input',()=>{dirtyForms.add(form);draftVersion++;});
   form.onsubmit=async event=>{event.preventDefault();save.disabled=true;select.disabled=true;area.readOnly=true;const submitted=context.decisionRevision;try{const result=await request({action:'evidence.decide',packetRevision:packet.revision,expectedReportCommit:context.reportCommit,expectedDecisionRevision:submitted,dispositions:[{itemKey:target.itemKey,itemRevision:target.revision,outcome:select.value,rationale:area.value}]});if(result.revision){for(const opened of openContexts)if(opened.decisionRevision===submitted&&opened.reportCommit===context.reportCommit&&opened.teachingCommit===context.teachingCommit)opened.decisionRevision=result.revision;}dirtyForms.delete(form);save.textContent='Saved';select.disabled=true;area.readOnly=true;let message='Disposition saved. Clinical attestation remains in the faculty console.';if(!dirtyForms.size){try{await load(packet.revision);}catch(error){message+=' Refresh failed: '+error.message;}}else{message+=' Other unsaved rationales remain ready to save. Reload afterward to refresh history.';}status.textContent=message;}catch(error){status.textContent=error.message+' Your rationale remains here; copy it before reloading.';}finally{save.disabled=save.textContent==='Saved';select.disabled=save.disabled;area.readOnly=save.disabled;}};article.append(form);
  }
}
document.querySelector('#login').onsubmit=async event=>{event.preventDefault();key=document.querySelector('#key').value;try{await load();document.querySelector('#login').hidden=true;document.querySelector('#key').value='';}catch(error){status.textContent=error.message;}};
