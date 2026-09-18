// Independent loopback-only family audition. No learner-site or Netlify import.
import http from 'node:http';
import path from 'node:path';
import {readFile,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {familyCase,caseHash} from './family-visit-case.mjs';
import {normalizeDiagnostic} from './dana-openai-provider.mjs';
import {createRoomState,roomView,beginTurn,issueSegment,applyReceipt,advanceGroup,cancelGroup,changeChannel,finishRoom,createRetry,createActorContext,containsPrivatePhrase} from './family-visit-state.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../..');
const TTL=30*60*1000,BODY_LIMIT=8192,AUDIO_LIMIT=4000000;
const STATIC=new Set(['_prototypes/sp-interview/family-visit.html','_prototypes/sp-interview/family-visit.js',
  '_prototypes/sp-interview/family-information-replay.js',
  '_prototypes/sp-interview/sp-encounter-profiles.js','_prototypes/sp-interview/sp-encounter-rhythm.js','_prototypes/sp-interview/sp-encounter-ui.js',
  '_prototypes/sp-interview/sp-interview.turns.js','_prototypes/sp-interview/sp-interview.conversation.js',
  '_prototypes/sp-interview/sp-interview.local-cases.js','favicon.svg']);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const token=()=>randomBytes(24).toString('base64url');
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{32}$/.test(value);
const problem=(status,code)=>Object.assign(new Error(code),{status,code});
const validText=text=>typeof text==='string'&&text.trim().length>0&&text.length<=1200
  &&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
  &&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text);
const possiblePhi=text=>/\b(?:mrn|medical record|date of birth|dob)\s*[:#]?\s*[\d/.-]{3,}|\b\d{3}-\d{2}-\d{4}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
function keys(value,required,optional=[]){return value&&typeof value==='object'&&!Array.isArray(value)&&required.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>required.includes(key)||optional.includes(key));}
const wholeQuotation=text=>/^(?:"[\s\S]*"|“[\s\S]*”)$/.test(text.trim());
// Recover only the exact public metadata prefix this server puts in history.
// Never remove arbitrary brackets, private labels, speaker names, or repeats.
function audienceSpeech(text,channel){
  const prefix='[Shared conversation] ';
  return channel==='public'&&typeof text==='string'&&text.startsWith(prefix)?text.slice(prefix.length):text;
}
function spoken(text,{fragment=false}={}){
  if(!validText(text)||text.trim().length>900||/[{}\[\]`*_<>]/.test(text)
    || /(^|\n)\s*(?:#{1,6}\s|[-+]\s|\d+[.)]\s)/.test(text)
    || /^(?:Morgan|Maya|Dana|Marcus|Ray|Patient|Assistant|System)\s*:/i.test(text.trim())
    || /\((?:pause|sigh|nod|laugh|smile|whisper|look|long pause)\w*\b[^)]*\)/i.test(text)
    || !fragment&&wholeQuotation(text))throw problem(502,'invalid_reply');
  return text.trim();
}
function substantive(text){return spoken(text,{fragment:true})===text&&text.length>=20&&/[.!?][”’"']?$/.test(text)&&(text.match(/[\p{L}\p{N}_]+(?:['’][\p{L}\p{N}_]+)*/gu)||[]).length>=4;}
async function body(req){
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw problem(415,'json_required');
  if(Number(req.headers['content-length'])>BODY_LIMIT)throw problem(413,'body_too_large');
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>BODY_LIMIT)throw problem(413,'body_too_large');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw problem(400,'invalid_json');}
}

export function createFamilyServer({provider,rootDir=ROOT,now=Date.now,maxProviderTurns=60,maxSpeechOperations=60,turnTimeoutMs=65000}={}){
  if(!provider||(typeof provider.reply!=='function'&&typeof provider.replyStream!=='function')||(typeof provider.speak!=='function'&&typeof provider.speakStream!=='function'))throw new Error('A local family voice provider is required.');
  if(!Number.isInteger(maxProviderTurns)||maxProviderTurns<1||!Number.isInteger(maxSpeechOperations)||maxSpeechOperations<1||!Number.isInteger(turnTimeoutMs)||turnTimeoutMs<1||turnTimeoutMs>65000)throw new Error('Invalid local family limits.');
  const root=path.resolve(rootDir),sessions=new Map(),audio=new Map(),waiting=[];
  let actorUsed=0,speechUsed=0,actorReserved=0,speechReserved=0,activeCalls=0,closed=false,requestOrder=0;
  const headers=type=>({'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer'});
  function send(res,status,value,type='application/json'){
    if(res.destroyed||res.writableEnded)return;res.writeHead(status,headers(type));res.end(Buffer.isBuffer(value)?value:JSON.stringify(value));
  }
  const serverDiagnostics=[];
  function recordFailure(error,kind,stage,started,roleId){
    const entry={...normalizeDiagnostic(error,{kind,stage,elapsedMs:Date.now()-started})};
    if(roleId==='morgan'||roleId==='maya')entry.roleId=roleId;
    serverDiagnostics.push(entry);if(serverDiagnostics.length>12)serverDiagnostics.shift();
  }
  function errorCode(error){
    if(error?.status)return error.code;
    return new Set(['invalid_turn','stale_channel','invalid_target','retry_target_locked','invalid_channel','invalid_receipt','invalid_segment']).has(error?.code)?error.code:
      new Set(['room_finished','group_pending','turn_limit','unknown_group','receipt_required','retry_channel_locked','room_not_finished','retry_ineligible','retry_exists']).has(error?.code)?error.code:'provider_failed';
  }
  function errorStatus(error){
    if(error?.status)return error.status;
    const code=errorCode(error);return code==='provider_failed'?502:code==='turn_limit'?429:code.startsWith('invalid_')||code==='stale_channel'?400:409;
  }
  function safeError(error){return{type:'error',code:errorCode(error),message:'The family visit could not complete that response. Pause or try the next turn when ready.'};}
  function local(req){
    const host=req.headers.host||'',port=server.address()?.port;
    if(!['127.0.0.1','localhost','[::1]'].some(name=>host===`${name}:${port}`))throw problem(403,'local_host_required');
    const navigation=req.method==='GET'&&(req.url||'').split('?')[0]==='/_prototypes/sp-interview/family-visit.html'&&req.headers['sec-fetch-mode']==='navigate'&&req.headers['sec-fetch-dest']==='document';
    if(navigation)return;
    const origin=req.headers.origin,mutating=['POST','DELETE'].includes(req.method);
    if(mutating&&origin!==`http://${host}`||origin&&origin!==`http://${host}`||req.headers['sec-fetch-site']==='cross-site')throw problem(403,'same_origin_required');
  }
  function session(id){if(!validId(id)||!sessions.has(id))throw problem(404,'session_not_found');return sessions.get(id);}
  function addSession(room,parentId=null){const item={id:room.sessionId,room,parentId,created:now(),groups:new Map(),activeGroup:null,audio:new Set(),closed:false,lastCancelOrder:0};sessions.set(item.id,item);return item;}
  function reserve(roles){
    const actors=roles,speech=roles*2;
    if(actorUsed+actorReserved+actors>maxProviderTurns||speechUsed+speechReserved+speech>maxSpeechOperations)throw problem(429,'audition_limit');
    actorReserved+=actors;speechReserved+=speech;return{actors,speech,released:false};
  }
  function release(group){
    const budget=group.budget;if(budget.released)return;
    actorReserved-=budget.actors;speechReserved-=budget.speech;budget.actors=budget.speech=0;budget.released=true;
  }
  function consume(group,kind){
    const budget=group.budget,key=kind==='actor'?'actors':'speech';
    if(budget.released||budget[key]<1)throw problem(429,'audition_limit');
    budget[key]--;if(kind==='actor'){actorReserved--;actorUsed++;}else{speechReserved--;speechUsed++;}
  }
  function drain(){while(activeCalls<2&&waiting.length){const task=waiting.shift();if(task.signal.aborted){task.reject(problem(409,'group_cancelled'));continue;}activeCalls++;task.signal.removeEventListener('abort',task.abort);task.resolve();}}
  function slot(signal){return new Promise((resolve,reject)=>{if(signal.aborted)return reject(problem(409,'group_cancelled'));const task={signal,resolve,reject};task.abort=()=>{const index=waiting.indexOf(task);if(index>=0)waiting.splice(index,1);reject(problem(409,'group_cancelled'));};signal.addEventListener('abort',task.abort,{once:true});waiting.push(task);drain();});}
  async function call(group,kind,job){
    const signal=group.controller.signal;await slot(signal);
    if(signal.aborted){activeCalls--;drain();throw problem(409,'group_cancelled');}
    let pending;try{consume(group,kind);pending=Promise.resolve(job());}catch(error){activeCalls--;drain();throw error;}
    // Slots follow actual provider settlement. Ignored aborts remain uncertain
    // paid work and cannot silently permit excess concurrent provider calls.
    pending.then(()=>{activeCalls--;drain();},()=>{activeCalls--;drain();});
    let abort;const interrupted=new Promise((_,reject)=>{abort=()=>reject(problem(409,'group_cancelled'));signal.addEventListener('abort',abort,{once:true});});
    try{return await Promise.race([pending,interrupted]);}finally{signal.removeEventListener('abort',abort);}
  }
  function stopAudio(item,state='cancelled'){
    if(item.state==='failed'||item.state==='cancelled')return;item.state=state;
    for(const res of item.subscribers){if(res.headersSent)res.destroy();else send(res,502,{error:{code:'audio_unavailable',message:'This family reply is no longer available.'}});}item.subscribers.clear();item.chunks=[];item.size=0;
  }
  function checkPrefix(group,ids,{whole=false,validatedOnly=false,closedReceipt=false}={}){
    if(!Array.isArray(ids)||ids.length>group.items.length||ids.some((id,index)=>id!==group.items[index].segment.id))throw problem(400,'invalid_receipt');
    if(closedReceipt)return group.confirmedIds;
    if(ids.length<group.confirmedIds.length||group.confirmedIds.some((id,index)=>ids[index]!==id))throw problem(400,'invalid_receipt');
    if(validatedOnly){let length=0;while(length<ids.length&&group.items[length].audioComplete&&group.items[length].actorValid)length++;return ids.slice(0,length);}
    if(ids.some((_,index)=>!group.items[index].audioComplete||!group.items[index].actorValid))throw problem(409,'receipt_not_ready');
    if(whole&&(!group.actorDone||ids.length!==group.items.length||!ids.length))throw problem(409,'receipt_not_ready');
  }
  function cancel(item,group,ids=group.confirmedIds){
    if(group.cancelled||group.done){checkPrefix(group,ids,{closedReceipt:true});return roomView(item.room);}
    let validation;try{ids=checkPrefix(group,ids,{validatedOnly:true});}catch(error){validation=error;ids=group.confirmedIds;}
    group.cancelled=true;group.controller.abort();group.confirmedIds=[...ids];
    for(const entry of group.items)stopAudio(entry);
    for(const timer of group.timers)clearTimeout(timer);group.timers.clear();
    cancelGroup(item.room,{groupId:group.id,completedSegmentIds:ids});
    if(item.activeGroup===group)item.activeGroup=null;release(group);
    if(validation)throw validation;return roomView(item.room);
  }
  function drop(item){
    if(item.closed)return;item.closed=true;
    // The selected alternative remains consumed when its temporary data is
    // deleted. Keep that policy marker separate from a live child handle.
    if(item.parentId){const parent=sessions.get(item.parentId);if(parent?.childId===item.id)parent.retryClosed=true;}
    if(item.childId&&sessions.has(item.childId))drop(sessions.get(item.childId));
    if(item.activeGroup)cancel(item,item.activeGroup);
    for(const id of item.audio){const entry=audio.get(id);if(entry)stopAudio(entry);audio.delete(id);}item.audio.clear();
    item.groups.clear();item.room.events.length=0;item.room.snapshots.clear();item.room.retryChildren.clear();sessions.delete(item.id);
  }
  function prune(){for(const item of sessions.values())if(now()-item.created>=TTL)drop(item);}
  async function staticFile(req,res){
    let raw;try{raw=decodeURIComponent((req.url||'').split('?')[0]);}catch{throw problem(400,'invalid_path');}
    if(!raw.startsWith('/')||raw.includes('\\')||raw.includes('\0')||raw.split('/').some(part=>part.startsWith('.'))||!STATIC.has(raw.slice(1)))throw problem(404,'not_found');
    let file=root;try{for(const part of raw.slice(1).split('/')){file=path.join(file,part);if((await lstat(file)).isSymbolicLink())throw Error();}const stat=await lstat(file);if(!stat.isFile()||stat.size>16000000)throw Error();send(res,200,await readFile(file),MIME[path.extname(file)]||'application/octet-stream');}catch{throw problem(404,'not_found');}
  }
  function audioWrite(res,bytes){if(res.destroyed||res.writableEnded)return;if(!res.headersSent)res.writeHead(200,{...headers('audio/mpeg'),'Accept-Ranges':'none'});res.write(bytes);}
  function deliverAudio(entry,res){
    if(['failed','cancelled'].includes(entry.state))throw problem(409,'audio_unavailable');
    if(entry.state==='complete')return send(res,200,Buffer.concat(entry.chunks,entry.size),'audio/mpeg');
    entry.subscribers.add(res);res.once('close',()=>entry.subscribers.delete(res));for(const bytes of entry.chunks)audioWrite(res,bytes);
  }
  function speech(item,group,roleId,text,emit){
    if(group.controller.signal.aborted||item.closed)throw problem(409,'group_cancelled');
    const id=token(),segment={id,roleId,name:familyCase.participants[roleId].displayName,text,audioUrl:'/api/family/audio/'+id};
    issueSegment(item.room,{groupId:group.id,turnId:group.turnId,segmentId:id,roleId,text});
    const entry={segment,groupId:group.id,sessionId:item.id,chunks:[],size:0,state:'pending',audioComplete:false,actorValid:false,subscribers:new Set()};
    group.items.push(entry);audio.set(id,entry);item.audio.add(id);
    emit({type:'segment',groupId:group.id,turnId:group.turnId,segment});
    const onChunk=value=>{
      if(group.controller.signal.aborted||item.closed)return;
      if(!(value instanceof Uint8Array)||!value.byteLength||group.audioBytes+value.byteLength>AUDIO_LIMIT)throw problem(502,'invalid_audio');
      const bytes=Buffer.from(value);group.audioBytes+=bytes.length;entry.size+=bytes.length;entry.chunks.push(bytes);entry.state='streaming';
      for(const res of entry.subscribers)audioWrite(res,bytes);
    };
    const started=Date.now();
    entry.promise=call(group,'speech',async()=>{
      const args={text,caseId:familyCase.participants[roleId].speechCaseId,signal:group.controller.signal,onChunk};
      if(typeof provider.speakStream==='function')await provider.speakStream(args);else onChunk(await provider.speak(args));
      if(group.controller.signal.aborted||item.closed)throw problem(409,'group_cancelled');
      const prefix=Buffer.concat(entry.chunks).subarray(0,3);
      if(entry.size<100||!(prefix.toString()==='ID3'||prefix[0]===255&&(prefix[1]&224)===224))throw problem(502,'invalid_audio');
      entry.audioComplete=true;entry.state='complete';for(const res of entry.subscribers)res.end();entry.subscribers.clear();
    });
    entry.promise.catch(error=>{
      recordFailure(error,'speech','server_speech',started,roleId);
      if(group.cancelled||group.done||group.failed)return;
      if(!group.actorDone){cancel(item,group);return;}
      // Metadata may already be delivered and an earlier sentence may already
      // have ended in the native player. Stop every remaining operation now,
      // but let the ensuing /cancel supply its verified completed prefix.
      group.failed=true;group.controller.abort();for(const part of group.items)stopAudio(part);
      for(const timer of group.timers)clearTimeout(timer);group.timers.clear();release(group);
    });
    return entry;
  }
  async function actorResponse(item,group,res){
    if(group.busy||group.cancelled||group.done)throw problem(409,'group_pending');
    const roleId=group.roles[group.index],frames=[];group.busy=true;group.actorDone=false;group.receipted=false;
    const emit=value=>{frames.push(value);if(!res.destroyed&&!res.writableEnded){if(!res.headersSent)res.writeHead(200,headers('application/x-ndjson; charset=utf-8'));res.write(JSON.stringify(value)+'\n');}};
    const disconnected=()=>{if(!res.writableEnded&&!group.cancelled&&!group.done)cancel(item,group);};res.once('close',disconnected);
    const timer=setTimeout(()=>{if(!group.cancelled&&!group.done)cancel(item,group);},turnTimeoutMs);timer.unref?.();group.timers.add(timer);
    let rawLead=null,lead=null,holdFullReply=false,accepting=true,diagnosticStage='server_actor';const actorItems=[],started=Date.now();
    try{
      const context=createActorContext(item.room,roleId);
      const privateMemoryInPublic=item.room.channel==='public'&&context.privateMemory.length>0;
      const onLead=text=>{
        if(!accepting||group.controller.signal.aborted)return;
        if(rawLead!==null)throw problem(502,'invalid_reply_prefix');
        const cleaned=audienceSpeech(text,item.room.channel),recovered=cleaned!==text;
        // Recovered fragments never stream early, so they need not satisfy the
        // early-speech length heuristic. Their full reply is still required.
        if(recovered)spoken(cleaned,{fragment:true});
        else if(!substantive(cleaned))throw problem(502,'invalid_reply_prefix');
        rawLead=text;lead=cleaned;holdFullReply=recovered||wholeQuotation(cleaned);
        if(!privateMemoryInPublic&&!holdFullReply)actorItems.push(speech(item,group,roleId,cleaned,emit));
      };
      const args={system:context.system,messages:context.messages,signal:group.controller.signal,onLead};
      let reply;try{reply=await call(group,'actor',()=>typeof provider.replyStream==='function'?provider.replyStream(args):provider.reply(args));}finally{accepting=false;}
      if(group.controller.signal.aborted||item.closed)throw problem(409,'group_cancelled');
      diagnosticStage='validation';
      // Compare the provider's original bytes before any metadata recovery.
      if(rawLead!==null&&(typeof reply!=='string'||!reply.startsWith(rawLead)))throw problem(502,'invalid_reply_prefix');
      reply=spoken(audienceSpeech(reply,item.room.channel));
      if(lead!==null&&!reply.startsWith(lead))throw problem(502,'invalid_reply_prefix');
      // When the actor remembers private content, do not expose even lead text
      // or start speech until its entire reply passes the bounded phrase check.
      if(privateMemoryInPublic){
        if(containsPrivatePhrase(context,reply))throw problem(502,'private_reply_blocked');
        if(lead!==null&&!holdFullReply)actorItems.push(speech(item,group,roleId,lead,emit));
      }
      // Quotations and recovered audience metadata wait for the checked whole
      // answer, which is delivered once without a second actor request.
      if(holdFullReply)actorItems.push(speech(item,group,roleId,reply,emit));
      else if(lead!==null){const remainder=reply.slice(lead.length);if(remainder.trim()){spoken(remainder,{fragment:true});actorItems.push(speech(item,group,roleId,remainder,emit));}else if(remainder.length)throw problem(502,'invalid_reply_prefix');}
      else actorItems.push(speech(item,group,roleId,reply,emit));
      actorItems.forEach(entry=>{entry.actorValid=true;});group.actorDone=true;
      emit({type:'complete',groupId:group.id,turnId:group.turnId,roleId,remainingRoles:group.roles.slice(group.index+1),room:roomView(item.room)});
      group.frames.set(roleId,frames);res.end();
      Promise.all(actorItems.map(entry=>entry.promise)).finally(()=>{clearTimeout(timer);group.timers.delete(timer);}).catch(()=>{});
    }catch(error){
      recordFailure(error,'actor',diagnosticStage,started,roleId);
      if(!group.cancelled&&!group.done)cancel(item,group);
      emit(safeError(error));res.end();clearTimeout(timer);group.timers.delete(timer);
    }finally{group.busy=false;res.removeListener('close',disconnected);}
  }
  function replay(res,frames){res.writeHead(200,headers('application/x-ndjson; charset=utf-8'));for(const frame of frames)res.write(JSON.stringify(frame)+'\n');res.end();}
  const server=http.createServer(async(req,res)=>{
    const order=++requestOrder;
    try{
      if(closed)throw problem(503,'server_stopping');prune();local(req);const route=(req.url||'').split('?')[0];
      if(req.method==='GET'&&route==='/api/family/health')return send(res,200,{configured:provider.configured!==false,caseId:familyCase.id,caseHash,title:familyCase.title,participants:Object.values(familyCase.participants).map(p=>({id:p.id,name:p.displayName,pronouns:p.pronouns,voice:p.voice,description:p.description})),limits:{turns:10},localOnly:true,operations:{scope:'server-process',actorUsed,speechUsed,actorReserved,speechReserved,activeCalls,actorLimit:maxProviderTurns,speechLimit:maxSpeechOperations},usage:typeof provider.getUsage==='function'?provider.getUsage():null,providerDiagnostics:typeof provider.getDiagnostics==='function'?provider.getDiagnostics():null,serverDiagnostics});
      if(req.method==='POST'&&route==='/api/family/session'){
        if(!keys(await body(req),[]))throw problem(400,'invalid_request');if(provider.configured===false)throw problem(503,'provider_not_configured');if(sessions.size>=8)throw problem(429,'session_limit');
        const item=addSession(createRoomState({sessionId:token()}));return send(res,201,roomView(item.room));
      }
      const remove=route.match(/^\/api\/family\/session\/([A-Za-z0-9_-]{32})$/);
      if(req.method==='DELETE'&&remove){const item=session(remove[1]);drop(item);return send(res,200,{ok:true});}
      const audioRoute=route.match(/^\/api\/family\/audio\/([A-Za-z0-9_-]{32})$/);
      if(req.method==='GET'&&audioRoute){const entry=audio.get(audioRoute[1]);if(!entry)throw problem(404,'audio_not_found');return deliverAudio(entry,res);}
      if(req.method==='POST'&&['turn','receipt','continue','cancel','channel','finish','retry'].some(action=>route==='/api/family/'+action)){
        const input=await body(req),action=route.slice('/api/family/'.length);
        const schema={turn:[['sessionId','turnId','text','targetRoleId','channel'],[]],receipt:[['sessionId','groupId','completedSegmentIds','status'],[]],continue:[['sessionId','groupId'],[]],cancel:[['sessionId'],['groupId','completedSegmentIds']],channel:[['sessionId','channel'],[]],finish:[['sessionId'],[]],retry:[['sessionId','turnId'],[]]}[action];
        if(!keys(input,...schema)||Object.hasOwn(input,'groupId')&&!validId(input.groupId))throw problem(400,'invalid_request');
        const item=session(input.sessionId);
        if(action==='turn'){
          if(!Number.isInteger(input.turnId)||input.turnId<1||input.turnId>10||!validText(input.text)||input.text.trim()!==input.text)throw problem(400,'invalid_request');
          if(possiblePhi(input.text))throw problem(400,'fictional_practice_only');
          if(req.aborted||res.destroyed||order<item.lastCancelOrder)throw problem(409,'group_cancelled');
          const fingerprint=JSON.stringify([input.text,input.targetRoleId,input.channel]),existing=item.groups.get(input.turnId);
          if(existing){if(existing.fingerprint!==fingerprint)throw problem(409,'turn_id_conflict');if(existing.cancelled)throw problem(409,'group_cancelled');const frames=existing.frames.get(existing.roles[0]);if(!frames)throw problem(409,'group_pending');return replay(res,frames);}
          if(item.activeGroup)throw problem(409,'group_pending');
          const budget=reserve(input.targetRoleId==='both'?2:1),group={id:token(),turnId:input.turnId,fingerprint,budget,controller:new AbortController(),items:[],confirmedIds:[],frames:new Map(),timers:new Set(),index:0,audioBytes:0,busy:false,actorDone:false,receipted:false,cancelled:false,done:false};
          try{group.roles=beginTurn(item.room,{...input,groupId:group.id}).roles;}catch(error){release(group);throw error;}
          item.groups.set(input.turnId,group);item.activeGroup=group;return await actorResponse(item,group,res);
        }
        if(action==='cancel'){
          if(!input.groupId)item.lastCancelOrder=order;
          if(!item.activeGroup){const old=input.groupId&&[...item.groups.values()].find(group=>group.id===input.groupId);if(input.groupId&&!old)throw problem(404,'group_not_found');if(old)checkPrefix(old,input.completedSegmentIds===undefined?old.confirmedIds:input.completedSegmentIds,{closedReceipt:true});else if(input.completedSegmentIds!==undefined&&(!Array.isArray(input.completedSegmentIds)||input.completedSegmentIds.length))throw problem(400,'invalid_receipt');return send(res,200,roomView(item.room));}
          if(input.groupId&&item.activeGroup.id!==input.groupId){const old=[...item.groups.values()].find(group=>group.id===input.groupId);if(old){checkPrefix(old,input.completedSegmentIds===undefined?old.confirmedIds:input.completedSegmentIds,{closedReceipt:true});return send(res,200,roomView(item.room));}throw problem(404,'group_not_found');}
          item.lastCancelOrder=order;
          return send(res,200,cancel(item,item.activeGroup,input.completedSegmentIds));
        }
        if(action==='finish'){item.lastCancelOrder=order;if(item.activeGroup)cancel(item,item.activeGroup);return send(res,200,finishRoom(item.room));}
        if(action==='channel')return send(res,200,changeChannel(item.room,input.channel));
        if(action==='retry'){
          if(!Number.isInteger(input.turnId)||input.turnId<1||input.turnId>10)throw problem(400,'invalid_request');
          if(item.parentId)throw problem(409,'retry_unavailable');
          if(item.childId){
            if(item.childTurnId!==input.turnId)throw problem(409,'retry_already_selected');
            if(item.retryClosed||!sessions.has(item.childId))throw problem(409,'retry_unavailable');
            return send(res,200,roomView(sessions.get(item.childId).room));
          }
          if(sessions.size>=8)throw problem(429,'session_limit');const child=addSession(createRetry(item.room,{sessionId:token(),turnId:input.turnId}),item.id);item.childId=child.id;item.childTurnId=input.turnId;return send(res,201,roomView(child.room));
        }
        const group=item.activeGroup;
        if(!group||group.id!==input.groupId)throw problem(409,'group_not_pending');
        if(action==='receipt'){
          if(!['played','interrupted'].includes(input.status))throw problem(400,'invalid_receipt');
          checkPrefix(group,input.completedSegmentIds,{whole:input.status==='played'});
          if(input.status==='interrupted'){cancel(item,group,input.completedSegmentIds);return send(res,200,{room:roomView(item.room),canContinue:false});}
          const result=applyReceipt(item.room,input);group.confirmedIds=[...input.completedSegmentIds];group.receipted=true;
          if(!result.canContinue){advanceGroup(item.room,{groupId:group.id});group.done=true;item.activeGroup=null;release(group);}
          return send(res,200,{room:roomView(item.room),canContinue:result.canContinue});
        }
        if(action==='continue'){
          if(!group.receipted||!group.actorDone||group.busy||group.index>=group.roles.length-1)throw problem(409,'receipt_required');
          advanceGroup(item.room,{groupId:group.id});group.index++;return await actorResponse(item,group,res);
        }
      }
      if(route.startsWith('/api/'))throw problem(404,'not_found');if(req.method!=='GET')throw problem(405,'method_not_allowed');return await staticFile(req,res);
    }catch(error){send(res,errorStatus(error),{error:safeError(error)});}
  });
  server.requestTimeout=100000;server.headersTimeout=10000;
  const interval=setInterval(prune,30000);interval.unref();const close=server.close.bind(server);
  server.close=(...args)=>{closed=true;clearInterval(interval);for(const item of [...sessions.values()])drop(item);return close(...args);};
  server.on('close',()=>{clearInterval(interval);for(const item of [...sessions.values()])drop(item);});
  return server;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);if(args.length&&(args.length!==2||args[0]!=='--port'))throw new Error('Usage: node family-live-server.mjs [--port 4320]');
  const port=args.length?Number(args[1]):4320;if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid local port.');
  const {createOpenAIProvider}=await import('./dana-openai-provider.mjs');const server=createFamilyServer({provider:createOpenAIProvider()});
  server.listen(port,'127.0.0.1',()=>console.info(`Local family visit ready at http://127.0.0.1:${port}/_prototypes/sp-interview/family-visit.html`));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
}
