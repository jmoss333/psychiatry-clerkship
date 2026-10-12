/* Aftercare packet, part 1: choose directory listings, order them, and complete a review before printing.
   Pure ES5. One sessionStorage key, tab-scoped, written only when the packet changes (never while typing).
   No network, durable storage, route state, analytics, patient fields or free text: the why-line is held until
   MaineHealth approval. Printing and the standard inserts arrive in the next release. Not patient-facing
   until FD_CARE_PACKET_ENABLED is changed by an owner-approved source edit. */

/* This gate has no URL, storage or learner-facing override. Tests flip the literal in served HTML. */
var FD_CARE_PACKET_ENABLED=false;
function fdCarePacketEnabled(){return FD_CARE_PACKET_ENABLED===true;}

var FD_CARE_PACKET_LIMIT=12,FD_CARE_PACKET_SUGGEST=8,FD_CARE_PACKET_KEY='fd_care_packet_v1';
/* The standard inserts (printed in the next release). Stored switches are limited to these names. */
var FD_CARE_PACKET_INSERTS=['intro','week','callback','warning','safety','family','national','insurance','meds','rights','card','notes'];
var FD_CARE_PACKET_GATES=[
  ['verification','I confirmed each listing with the service or its website'],
  ['region','The listings match where the patient will live'],
  ['identifiers','No patient identifiers were typed anywhere in this packet'],
  ['supervisor','My supervisor reviewed this packet']];

function fdCarePacketBlank(){return {ids:[],why:{},inserts:{},mode:'review'};}
function fdCarePacketGateBlank(){
  var gate={};
  for(var i=0;i<FD_CARE_PACKET_GATES.length;i++)gate[FD_CARE_PACKET_GATES[i][0]]=false;
  return gate;
}
function fdCarePacketCopy(state){
  var out=fdCarePacketBlank(),key;
  out.ids=state.ids.slice();
  out.mode=state.mode;
  for(key in state.inserts)if(Object.prototype.hasOwnProperty.call(state.inserts,key))out.inserts[key]=state.inserts[key];
  return out;
}
/* Storage is untrusted text: keep only short unique string ids, boolean insert switches and a known mode. */
function fdCarePacketNormalize(raw){
  var out=fdCarePacketBlank(),seen=Object.create(null),i,key;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
  var ids=Array.isArray(raw.ids)?raw.ids:[];
  for(i=0;i<ids.length&&out.ids.length<FD_CARE_PACKET_LIMIT;i++){
    var id=ids[i];
    if(typeof id==='string'&&id&&id.length<=120&&!seen[id]){seen[id]=true;out.ids.push(id);}
  }
  var ins=raw.inserts;
  if(ins&&typeof ins==='object'&&!Array.isArray(ins)){
    for(key in ins)if(Object.prototype.hasOwnProperty.call(ins,key)&&FD_CARE_PACKET_INSERTS.indexOf(key)!==-1&&typeof ins[key]==='boolean')out.inserts[key]=ins[key];
  }
  if(raw.mode==='final')out.mode='final';
  return out;
}
function fdCarePacketLoad(storage){
  try{
    var raw=storage?storage.getItem(FD_CARE_PACKET_KEY):null;
    return raw?fdCarePacketNormalize(JSON.parse(raw)):fdCarePacketBlank();
  }catch(_){return fdCarePacketBlank();}
}
function fdCarePacketSave(storage,state){
  try{
    if(!storage)return;
    var empty=!state.ids.length&&state.mode==='review',key;
    for(key in state.inserts)if(Object.prototype.hasOwnProperty.call(state.inserts,key))empty=false;
    if(empty)storage.removeItem(FD_CARE_PACKET_KEY);
    else storage.setItem(FD_CARE_PACKET_KEY,JSON.stringify({ids:state.ids,why:{},inserts:state.inserts,mode:state.mode}));
  }catch(_){}
}

function fdCarePacketRecords(data){
  var byId=Object.create(null);
  if(data&&Array.isArray(data.records))for(var i=0;i<data.records.length;i++)byId[data.records[i].id]=data.records[i];
  return byId;
}
/* Always filtered through the CURRENT directory, so an id the feed no longer lists never renders or counts. */
function fdCarePacketIds(state,data){
  var byId=fdCarePacketRecords(data),out=[];
  for(var i=0;i<state.ids.length;i++)if(byId[state.ids[i]])out.push(state.ids[i]);
  return out;
}
/* A COMPLETE feed that lacks an id means the listing is gone, so it is dropped on the next change. A
   PARTIAL feed (a category failed to load) proves nothing about the missing ids, so they are kept: they are
   hidden, not stale, and a transient load failure must never delete a trainee's saved listings. */
function fdCarePacketPrune(state,data){
  var next=fdCarePacketCopy(state);
  if(!(data&&data.partial))next.ids=fdCarePacketIds(state,data);
  return next;
}
/* How many slots the packet holds: hidden listings keep theirs while the feed is partial. */
function fdCarePacketHeld(state,data){
  return data&&data.partial?state.ids.length:fdCarePacketIds(state,data).length;
}
/* The order rows appear on screen: grouped by category (directory order), packet order within a group. */
function fdCarePacketDisplayOrder(state,data){
  var live=fdCarePacketIds(state,data),byId=fdCarePacketRecords(data),cats=(data&&data.categories)||[],out=[];
  for(var g=0;g<cats.length;g++)for(var i=0;i<live.length;i++)if(byId[live[i]].category===cats[g].id)out.push(live[i]);
  return out;
}
function fdCarePacketToggle(state,id,data){
  var at=state.ids.indexOf(id),next;
  if(at!==-1){next=fdCarePacketCopy(state);next.ids.splice(at,1);return {state:next,result:'removed'};}
  if(!fdCarePacketRecords(data)[id])return {state:state,result:'unknown'};
  next=fdCarePacketPrune(state,data);
  if(next.ids.length>=FD_CARE_PACKET_LIMIT)return {state:state,result:'full'};
  next.ids.push(id);
  return {state:next,result:'added'};
}
function fdCarePacketAddMany(state,ids,data){
  var byId=fdCarePacketRecords(data),next=fdCarePacketPrune(state,data),added=0,already=0,skipped=0;
  for(var i=0;i<ids.length;i++){
    var id=ids[i];
    if(!byId[id])continue;
    if(next.ids.indexOf(id)!==-1){already++;continue;}
    if(next.ids.length>=FD_CARE_PACKET_LIMIT){skipped++;continue;}
    next.ids.push(id);added++;
  }
  return {state:next,added:added,already:already,skipped:skipped};
}
function fdCarePacketRemove(state,id){
  var next=fdCarePacketCopy(state),at=next.ids.indexOf(id);
  if(at!==-1)next.ids.splice(at,1);
  return next;
}
/* Order only matters within a category (the printed pages group by category), so a move swaps with the
   nearest neighbour of the same category in the given direction. */
function fdCarePacketMove(state,id,delta,data){
  var byId=fdCarePacketRecords(data),at=state.ids.indexOf(id),step=delta<0?-1:1;
  if(at===-1||!byId[id])return state;
  for(var j=at+step;j>=0&&j<state.ids.length;j+=step){
    var other=byId[state.ids[j]];
    if(other&&other.category===byId[id].category){
      var next=fdCarePacketCopy(state),held=next.ids[at];
      next.ids[at]=next.ids[j];next.ids[j]=held;
      return next;
    }
  }
  return state;
}
function fdCarePacketCanPrint(state,data,gate){
  if(!gate)return false;
  for(var i=0;i<FD_CARE_PACKET_GATES.length;i++)if(gate[FD_CARE_PACKET_GATES[i][0]]!==true)return false;
  return fdCarePacketIds(state,data).length>0;
}
function fdCarePacketContext(state,data){
  var live=fdCarePacketIds(state,data),ids=Object.create(null);
  for(var i=0;i<live.length;i++)ids[live[i]]=true;
  return {ids:ids,count:live.length,full:fdCarePacketHeld(state,data)>=FD_CARE_PACKET_LIMIT};
}

function fdCarePacketButton(row,ctx){
  var packed=!!ctx.ids[row.id],locked=ctx.full&&!packed;
  /* The visible label never changes, so the accessible name always contains it (WCAG 2.5.3); the pressed
     state, the "In packet" tag and the card border carry the state. */
  return '<button type="button" class="fd-care-search__pack" data-fd-care-packet="'+fdEsc(row.id)+'" aria-pressed="'+(packed?'true':'false')+
    '" aria-label="'+fdEsc('Add to packet: '+row.name)+'"'+(locked?' disabled':'')+'>Add to packet</button>';
}
function fdCarePacketBulk(result,ctx){
  if(!result||result.idle||!result.total)return '';
  var page=0,all=0,i;
  for(i=0;i<result.rows.length;i++)if(!ctx.ids[result.rows[i].id])page++;
  for(i=0;i<result.allIds.length;i++)if(!ctx.ids[result.allIds[i]])all++;
  return '<div class="fd-care-search__bulk" role="group" aria-label="Add listings to the packet">'+
    '<button type="button" data-fd-care-packet-page'+(ctx.full||!page?' disabled':'')+'>Add this page ('+page+')</button>'+
    '<button type="button" data-fd-care-packet-all'+(ctx.full||!all?' disabled':'')+'>Add all results ('+all+')</button></div>';
}

function fdCarePacketTray(state,data,gate){
  gate=gate||{};
  var live=fdCarePacketIds(state,data),byId=fdCarePacketRecords(data),n=live.length,held=fdCarePacketHeld(state,data),i,g;
  var out='<section class="fd-care-packet" aria-labelledby="fd-care-packet-title"><header class="fd-care-packet__head">'+
    '<h3 id="fd-care-packet-title" tabindex="-1">Aftercare packet <span class="fd-care-packet__count">'+n+'</span></h3>';
  if(held>=FD_CARE_PACKET_LIMIT)out+='<p class="fd-care-packet__hint">Packet is full at '+FD_CARE_PACKET_LIMIT+'. Remove a listing to add another.</p>';
  else if(held>FD_CARE_PACKET_SUGGEST)out+='<p class="fd-care-packet__hint">Eight or fewer is easier to read. You can still add up to '+FD_CARE_PACKET_LIMIT+'.</p>';
  if(held>n)out+='<p class="fd-care-packet__hint">'+(held-n)+' saved listing'+(held-n===1?' is':'s are')+' hidden while the directory is incomplete.</p>';
  out+='</header>';
  if(!n){
    out+='<p class="fd-care-packet__empty">No listings yet. Choose “Add to packet” on a search result.</p>';
  }else{
    var cats=(data&&data.categories)||[];
    for(g=0;g<cats.length;g++){
      var members=[];
      for(i=0;i<live.length;i++)if(byId[live[i]].category===cats[g].id)members.push(live[i]);
      if(!members.length)continue;
      out+='<section class="fd-care-packet__group"><h4>'+fdEsc(cats[g].label)+'</h4><ol class="fd-care-packet__list">';
      for(i=0;i<members.length;i++){
        var id=members[i],name=byId[id].name;
        out+='<li class="fd-care-packet__item" data-fd-care-packet-item="'+fdEsc(id)+'"><span class="fd-care-packet__name">'+fdEsc(name)+'</span>'+
          '<span class="fd-care-packet__btns">'+
          '<button type="button" data-fd-care-packet-up="'+fdEsc(id)+'" aria-label="'+fdEsc('Move '+name+' up')+'"'+(i===0?' disabled':'')+'><span aria-hidden="true">↑</span></button>'+
          '<button type="button" data-fd-care-packet-down="'+fdEsc(id)+'" aria-label="'+fdEsc('Move '+name+' down')+'"'+(i===members.length-1?' disabled':'')+'><span aria-hidden="true">↓</span></button>'+
          '<button type="button" data-fd-care-packet-remove="'+fdEsc(id)+'" aria-label="'+fdEsc('Remove '+name+' from packet')+'">Remove</button></span></li>';
      }
      out+='</ol></section>';
    }
    out+='<button type="button" class="fd-care-packet__clear" data-fd-care-packet-clear>Clear packet</button>';
  }
  out+='<fieldset class="fd-care-packet__gate"><legend>Review before printing</legend>';
  for(i=0;i<FD_CARE_PACKET_GATES.length;i++){
    var key=FD_CARE_PACKET_GATES[i][0];
    /* Nothing to confirm in an empty packet. Confirmations also reset whenever a listing is added (controller). */
    out+='<label class="fd-care-packet__check"><input type="checkbox" data-fd-care-packet-gate="'+fdEsc(key)+'"'+(gate[key]===true?' checked':'')+(n?'':' disabled')+'> <span>'+
      fdEsc(FD_CARE_PACKET_GATES[i][1])+'</span></label>';
  }
  var ready=fdCarePacketCanPrint(state,data,gate);
  /* Plain text, not a live region: this node is recreated on every repaint, which screen readers announce
     unreliably. Readiness changes are announced through the one persistent shell announcer instead. */
  out+='</fieldset><p class="fd-care-packet__ready" data-fd-care-packet-ready="'+(ready?'true':'false')+'">'+
    (ready?'Review complete.':(n?'Finish the four review confirmations to continue.':'Add a listing to begin.'))+'</p></section>';
  return out;
}

function fdCreateCarePacket(options){
  var storage=null;
  if(options&&options.storage!==undefined)storage=options.storage;
  else{try{storage=typeof sessionStorage!=='undefined'?sessionStorage:null;}catch(_){storage=null;}}
  var state=null,gate=fdCarePacketGateBlank(),root=null,live=null,notify=null,sayTimer=null;
  var getData=function(){return null;};
  function current(){if(!state)state=fdCarePacketLoad(storage);return state;}
  function paint(){
    if(!root||root.isConnected===false)return;
    root.innerHTML=fdCarePacketTray(current(),getData(),gate);
  }
  /* The shared polite region is written AFTER the repaint and the focus move have settled: screen readers
     tend to cut a live message short when focus moves in the same task. Clearing first lets an identical
     message be announced again, and only the last of several quick messages is spoken. */
  function say(message){
    clearTimeout(sayTimer);
    if(live)live.textContent='';
    sayTimer=setTimeout(function(){
      sayTimer=null;
      if(live&&!(typeof document!=='undefined'&&document.querySelector('[role="dialog"][aria-modal="true"]')))live.textContent=message;
    },150);
  }
  function nameOf(id){var record=fdCarePacketRecords(getData())[id];return record?record.name:'listing';}
  function plural(n){return n+' listing'+(n===1?'':'s');}
  function count(){return fdCarePacketIds(current(),getData()).length;}
  function commit(next){
    state=next;fdCarePacketSave(storage,state);paint();
    if(notify)notify();
  }
  /* The four confirmations describe THE packet that was reviewed, so they reset whenever a listing is
     added or the packet is cleared (removing or reordering adds nothing unreviewed). Returns whether
     anything was cleared so the announcement can say why "ready" went away. */
  function resetGate(){
    var any=false,key;
    for(key in gate)if(gate[key]===true)any=true;
    gate=fdCarePacketGateBlank();
    return any;
  }
  function cleared(was){return was?' Review confirmations cleared.':'';}
  function toggle(id){
    var r=fdCarePacketToggle(current(),id,getData()),was=false;
    if(r.result==='added'||r.result==='removed'){
      if(r.result==='added')was=resetGate();
      commit(r.state);
      say((r.result==='added'?'Added ':'Removed ')+nameOf(id)+(r.result==='added'?' to':' from')+' the packet. '+plural(count())+' in packet.'+cleared(was));
    }else if(r.result==='full')say('The packet is full at '+FD_CARE_PACKET_LIMIT+'. Remove a listing to add another.');
    return r.result;
  }
  function addMany(ids){
    var r=fdCarePacketAddMany(current(),ids,getData()),was=false;
    if(r.added){was=resetGate();commit(r.state);}
    say('Added '+plural(r.added)+'.'+(r.already?' '+r.already+' already in the packet.':'')+
      (r.skipped?' '+r.skipped+' not added because the packet is full at '+FD_CARE_PACKET_LIMIT+'.':'')+' '+plural(count())+' in packet.'+cleared(was));
    return {added:r.added,already:r.already,skipped:r.skipped};
  }
  function move(id,delta){
    var next=fdCarePacketMove(current(),id,delta,getData());
    if(next!==state){commit(next);say('Moved '+nameOf(id)+(delta<0?' up':' down')+'.');}
  }
  function remove(id){commit(fdCarePacketRemove(current(),id));say('Removed '+nameOf(id)+' from the packet. '+plural(count())+' in packet.');}
  function clear(){var was=resetGate();commit(fdCarePacketBlank());say('Packet cleared.'+cleared(was));}
  function setGate(key,value){
    if(!Object.prototype.hasOwnProperty.call(gate,key))return false;
    if(value===true&&!count())return false;
    var before=fdCarePacketCanPrint(current(),getData(),gate);
    gate[key]=value===true;paint();
    var after=fdCarePacketCanPrint(current(),getData(),gate);
    if(before!==after)say(after?'Review complete.':'Review confirmations incomplete.');
    return true;
  }
  /* A click inside the tray or on an add button. Returns what to focus after the repaint, or null if it
     was not ours. Focus targets are attribute/value pairs so no id is ever spliced into a selector. */
  function handleClick(button){
    var id;
    if(button.hasAttribute('data-fd-care-packet')){
      id=button.getAttribute('data-fd-care-packet');toggle(id);
      return {attr:'data-fd-care-packet',id:id};
    }
    if(button.hasAttribute('data-fd-care-packet-up')||button.hasAttribute('data-fd-care-packet-down')){
      var up=button.hasAttribute('data-fd-care-packet-up'),attr=up?'data-fd-care-packet-up':'data-fd-care-packet-down';
      id=button.getAttribute(attr);move(id,up?-1:1);
      return {attr:attr,id:id,fallback:up?'data-fd-care-packet-down':'data-fd-care-packet-up'};
    }
    if(button.hasAttribute('data-fd-care-packet-remove')){
      id=button.getAttribute('data-fd-care-packet-remove');
      /* The next row ON SCREEN (grouped by category), not the next id in storage order. */
      var shown=fdCarePacketDisplayOrder(current(),getData()),at=shown.indexOf(id),neighbour=shown[at+1]||shown[at-1]||'';
      remove(id);
      return neighbour?{attr:'data-fd-care-packet-remove',id:neighbour}:{attr:'id',id:'fd-care-packet-title'};
    }
    if(button.hasAttribute('data-fd-care-packet-clear')){clear();return {attr:'id',id:'fd-care-packet-title'};}
    return null;
  }
  function handleChange(input){
    if(!input||!input.hasAttribute||!input.hasAttribute('data-fd-care-packet-gate'))return null;
    var key=input.getAttribute('data-fd-care-packet-gate');
    setGate(key,input.checked===true);
    return {attr:'data-fd-care-packet-gate',id:key};
  }
  return {
    mount:function(node,status,dataGetter,onChange){
      root=node||null;live=status||null;notify=onChange||null;
      getData=typeof dataGetter==='function'?dataGetter:function(){return null;};
      paint();
    },
    /* Leaving Care keeps the packet (tab-scoped by design), resets the review confirmations and drops any
       announcement still queued, so nothing is spoken about a surface the trainee has left. */
    leave:function(){clearTimeout(sayTimer);sayTimer=null;root=null;live=null;notify=null;getData=function(){return null;};gate=fdCarePacketGateBlank();},
    refresh:paint,
    toggle:toggle,addMany:addMany,move:move,remove:remove,clear:clear,setGate:setGate,
    handleClick:handleClick,handleChange:handleChange,
    ids:function(){return fdCarePacketIds(current(),getData());},
    context:function(){return fdCarePacketContext(current(),getData());},
    gate:function(){var copy={},key;for(key in gate)copy[key]=gate[key];return copy;},
    get mode(){return current().mode;}
  };
}
