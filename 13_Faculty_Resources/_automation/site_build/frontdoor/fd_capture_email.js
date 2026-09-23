/* Pure learner-controlled faculty email draft builder. Nothing here reads or writes storage,
   navigates, sends, records analytics, or infers a delivery result. */
var FD_EMAIL_DOMAIN='mainehealth.org';
var FD_EMAIL_LOCAL=/^(?:[A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9._+\-]{0,62}[A-Za-z0-9])$/;
var FD_EMAIL_MAX_LENGTH=1800;
var FD_EMAIL_INTRO='This is a learner-prepared teaching digest. It contains no patient information.';
var FD_EMAIL_ROUTES=[
  {route:'rounds',label:'Ask on rounds'},
  {route:'supervision',label:'Discuss in supervision'},
  {route:'later',label:'Look up later'},
  {route:null,label:'Unrouted'}
];
var FD_EMAIL_OWN=Object.prototype.hasOwnProperty;

function fdEmailLocalPart(value){
  if(typeof value!=='string'||!FD_EMAIL_LOCAL.test(value)||value.indexOf('..')!==-1
     ||value==='constructor'||value==='prototype'||value==='__proto__')return null;
  return value;
}

function fdEmailAddress(value){
  var local=fdEmailLocalPart(value);
  return local===null?null:local+'@'+FD_EMAIL_DOMAIN;
}

function fdEmailValidId(value){
  return typeof value==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(value)
    &&value!=='__proto__'&&value!=='constructor'&&value!=='prototype';
}

function fdEmailRoute(value){
  return value==='rounds'||value==='supervision'||value==='later'?value:null;
}

/* Return only fields the digest may use; neither timestamps nor learner state can leak through. */
function fdEmailSelection(items,ids){
  var selected=Object.create(null),seen=Object.create(null),out=[],i,item,id,copy;
  if(!Array.isArray(items)||!Array.isArray(ids))return out;
  for(i=0;i<ids.length;i++){
    id=FD_EMAIL_OWN.call(ids,i)?ids[i]:null;
    if(fdEmailValidId(id))selected[id]=true;
  }
  for(i=0;i<items.length;i++){
    if(!FD_EMAIL_OWN.call(items,i))continue;
    item=items[i];
    if(!item||typeof item!=='object'||Array.isArray(item)
       ||!FD_EMAIL_OWN.call(item,'id')||!FD_EMAIL_OWN.call(item,'text')
       ||!FD_EMAIL_OWN.call(item,'route')||!FD_EMAIL_OWN.call(item,'state'))continue;
    id=item.id;
    if(!fdEmailValidId(id)||!selected[id]||seen[id]||item.state!=='open'
       ||typeof item.text!=='string'||!item.text.trim()||item.text.length>280)continue;
    seen[id]=true;
    copy={id:id,text:item.text,route:fdEmailRoute(item.route),ctx:null};
    if(FD_EMAIL_OWN.call(item,'ctx')&&typeof item.ctx==='string')copy.ctx=item.ctx;
    out.push(copy);
  }
  return out;
}

function fdEmailCanonicalOrigin(origin){
  var parsed;
  if(typeof origin!=='string')return null;
  try{ parsed=new URL(origin); }catch(_){ return null; }
  return (parsed.protocol==='https:'||parsed.protocol==='http:')&&parsed.origin===origin
    ?parsed.origin:null;
}

function fdEmailSource(index,ctx,origin){
  var byRef,entry,base,kind,parameter;
  if(!index||typeof index!=='object'||!FD_EMAIL_OWN.call(index,'byRef')
     ||typeof ctx!=='string'||!FD_EMAIL_OWN.call(index.byRef||{},ctx)
     ||!(/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(ctx)
       ||/^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/.test(ctx))
     ||ctx.indexOf('..')!==-1)return null;
  byRef=index.byRef;
  entry=byRef[ctx];
  base=fdEmailCanonicalOrigin(origin);
  if(!base||!entry||typeof entry!=='object'||!FD_EMAIL_OWN.call(entry,'ref')
     ||!FD_EMAIL_OWN.call(entry,'kind')||!FD_EMAIL_OWN.call(entry,'title')||entry.ref!==ctx
     ||typeof entry.title!=='string'||!entry.title.trim())return null;
  kind=ctx.slice(-5)==='.html'?'tool':'read';
  if(entry.kind!==kind)return null;
  parameter=kind==='tool'?'tool':'page';
  return {title:entry.title,url:base+'/?'+parameter+'='+encodeURIComponent(ctx)};
}

function fdEmailDigest(index,items,origin){
  var list=Array.isArray(items)?items:[],groups=[[],[],[],[]],seen=Object.create(null);
  var i,j,item,route,source,body=[FD_EMAIL_INTRO],count=0;
  for(i=0;i<list.length;i++){
    if(!FD_EMAIL_OWN.call(list,i))continue;
    item=list[i];
    if(!item||typeof item!=='object'||Array.isArray(item)
       ||!FD_EMAIL_OWN.call(item,'id')||!FD_EMAIL_OWN.call(item,'text')
       ||!FD_EMAIL_OWN.call(item,'route')||!fdEmailValidId(item.id)
       ||seen[item.id]||typeof item.text!=='string'||!item.text.trim())continue;
    seen[item.id]=true;
    route=fdEmailRoute(item.route);
    for(j=0;j<FD_EMAIL_ROUTES.length;j++)if(FD_EMAIL_ROUTES[j].route===route)break;
    groups[j].push(item);
    count++;
  }
  for(i=0;i<groups.length;i++){
    if(!groups[i].length)continue;
    body.push('',FD_EMAIL_ROUTES[i].label);
    for(j=0;j<groups[i].length;j++){
      item=groups[i][j];
      body.push((j+1)+'. '+item.text);
      source=FD_EMAIL_OWN.call(item,'ctx')?fdEmailSource(index,item.ctx,origin):null;
      if(source)body.push('Source: '+source.title+' — '+source.url);
    }
  }
  return {subject:'Psychiatry learning questions ('+count+')',body:body.join('\n')};
}

function fdEmailMailto(localPart,digest,maxLength){
  var address=fdEmailAddress(localPart),href,limit;
  if(!address)return {ok:false,reason:'invalid-recipient'};
  if(!digest||typeof digest!=='object'||!FD_EMAIL_OWN.call(digest,'subject')
     ||!FD_EMAIL_OWN.call(digest,'body')
     ||typeof digest.subject!=='string'||!/^Psychiatry learning questions \([1-9][0-9]*\)$/.test(digest.subject)
     ||typeof digest.body!=='string'||!digest.body)return {ok:false,reason:'invalid-digest'};
  try{
    href='mailto:'+encodeURIComponent(address)+'?subject='+encodeURIComponent(digest.subject)
      +'&body='+encodeURIComponent(digest.body);
  }catch(_){ return {ok:false,reason:'invalid-digest'}; }
  limit=typeof maxLength==='number'&&isFinite(maxLength)&&maxLength>=0
    &&Math.floor(maxLength)===maxLength?maxLength:FD_EMAIL_MAX_LENGTH;
  if(href.length>limit)return {ok:false,reason:'too-long'};
  return {ok:true,href:href};
}
