/* Aftercare packet, part 2: the printable sheet, as pure functions. Pure ES5; no network, storage or analytics; the
   only DOM use is the one measuring function, which runs only where a document exists. Nothing here is
   patient-facing until FD_CARE_PACKET_ENABLED is changed by an owner-approved source edit.

   What it renders: a header, the welcome, a crisis block built from the build payload (never typed here), the
   chosen directory listings grouped by category, then the optional standard pages, packed into numbered sheets by
   measured height. A unit is never split; a page that cannot be laid out safely is REFUSED, never clipped.

   This module names no crisis contact and no crisis id. Which lines are required, and what their numbers are,
   come from the payload (care_inserts_payload.py), and the sheet checks what it RENDERED against that list. */

var FD_CARE_PACKET_ORG='Maine Medical Center';
var FD_CARE_PACKET_TITLE='Your aftercare resources';
var FD_CARE_PACKET_BAND='Review copy · we will finalize this together before you leave';
/* Pixels held back at the foot of every sheet: a measured layout and a printed one can differ by a line or two. */
var FD_CARE_PACKET_SLACK=24;
/* Above this many modules a 0.9 in code has modules under 0.4 mm, which older phones struggle to scan. */
var FD_CARE_PACKET_QR_MAX_MODULES=49;
var FD_CARE_PACKET_BLANK='<span class="fd-packet-blank"><span class="fd-packet-vh">blank line to write in</span></span>';

/* ---- text hygiene ------------------------------------------------------------------------------------------- */
/* A scan-only view: width folded, format and bidi controls dropped, every dash a hyphen. The stored text is not changed. */
function fdCarePacketNorm(text){
  var s=String(text==null?'':text);
  if(typeof s.normalize==='function'){try{s=s.normalize('NFKC');}catch(ignoreNormalize){}}
  s=s.replace(/[­؀-؅؜۝܏᠎​-‏‪-‮⁠-⁤⁦-⁯﻿￹-￻]/g,'');
  return s.replace(/[‐-―−﹘﹣－]/g,'-');
}
/* For text that leaves the page (the copy): drop control and bidi characters but keep the words as written. */
function fdCarePacketStrip(text){
  return String(text==null?'':text).replace(/[\u0000-\u001f\u007f­؜​-‏‪-‮⁠-⁤⁦-⁯﻿]/g,'').replace(/\s+/g,' ').replace(/^ | $/g,'');
}
/* The validator's own pattern family (validate_care_inserts.py), kept in step by a parity test, plus verification
   WORDING, which feed prose carries and the validator's data does not. */
var FD_CARE_PACKET_DOSE_UNITS='(?:mgs?|mcgs?|[\\u00b5\\u03bcu]g|g|gm|grams?|mls?|cc|iu|meq|milligrams?|micrograms?|millilit(?:er|re)s?)';
var FD_CARE_PACKET_NUMBER_WORDS='(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|half|quarter)';
var FD_CARE_PACKET_FORBIDDEN=[
  new RegExp('\\b\\d+(?:[.,]\\d+)?\\s*-?\\s*'+FD_CARE_PACKET_DOSE_UNITS+'(?!\\w)','i'),
  /\b(?:milligram|microgram|millilit(?:er|re))s?\b/i,
  new RegExp('\\b'+FD_CARE_PACKET_NUMBER_WORDS+'(?:[\\s-]+(?:and\\s+|a\\s+)?'+FD_CARE_PACKET_NUMBER_WORDS+')*[\\s-]+(?:a\\s+)?'+FD_CARE_PACKET_DOSE_UNITS+'(?!\\w)','i'),
  /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|half)\s+(?:tablets?|pills?|capsules?)\b/i,
  /Verification due|verifiedDate|reviewAfter|L[1-4]\b/i,
  /\bverif(?:y|ies|ied|ying|ication)\b/i
];
function fdCarePacketForbidden(text){
  var s=fdCarePacketNorm(text),i;
  for(i=0;i<FD_CARE_PACKET_FORBIDDEN.length;i++)if(FD_CARE_PACKET_FORBIDDEN[i].test(s))return true;
  return false;
}

/* ---- numbers ------------------------------------------------------------------------------------------------ */
/* Every phone-like token in a text, as digits with a leading North American 1 removed. Compared as NUMBERS, so a
   short code is a whole token (never a fragment of a longer number) and a spaced-out short code still counts. */
function fdCarePacketNumbers(text){
  var s=fdCarePacketNorm(text),re=/\d[\d\-\s().]*\d/g,out=[],m,d;
  while((m=re.exec(s))){
    d=m[0].replace(/\D/g,'');
    if(d.length===11&&d.charAt(0)==='1')d=d.slice(1);
    if(d.length>=3)out.push(d);
  }
  return out;
}
function fdCarePacketCrisisNumbers(payload){
  var out=[],id,contacts=payload&&payload.contacts,n,i;
  if(!contacts||typeof contacts!=='object')return out;
  for(id in contacts){
    if(!Object.prototype.hasOwnProperty.call(contacts,id)||!contacts[id])continue;
    n=fdCarePacketNumbers(contacts[id].contact);
    for(i=0;i<n.length;i++)out.push(n[i]);
  }
  return out;
}
function fdCarePacketCrisisHit(text,payload){
  var registered=fdCarePacketCrisisNumbers(payload),found=fdCarePacketNumbers(text),i;
  for(i=0;i<found.length;i++)if(registered.indexOf(found[i])!==-1)return true;
  return false;
}

/* ---- the unit's own details (the ward's, never the patient's) ------------------------------------------------ */
function fdCarePacketUnitName(value){
  var raw=String(value==null?'':value),s;
  if(/[\u0000-\u001f\u007f]/.test(raw))return {ok:false,value:'',error:'Use letters, numbers and ordinary punctuation.'};
  s=raw.replace(/\s+/g,' ').replace(/^ | $/g,'');
  if(!s)return {ok:true,value:'',error:''};
  if(s.length>60)return {ok:false,value:'',error:'Use 60 characters or fewer.'};
  if(/[<>{}]/.test(s))return {ok:false,value:'',error:'Use letters, numbers and ordinary punctuation.'};
  if(fdCarePacketForbidden(s))return {ok:false,value:'',error:'That text cannot print on a patient page.'};
  return {ok:true,value:s,error:''};
}
function fdCarePacketUnitPhone(value,payload){
  var raw=String(value==null?'':value).replace(/^\s+|\s+$/g,''),d,i,crisis;
  if(!raw)return {ok:true,value:'',error:''};
  if(!/^[0-9\s().+\-]+$/.test(raw))return {ok:false,value:'',error:'Use digits only. Write an extension by hand.'};
  d=raw.replace(/\D/g,'');
  if(d.length===11&&d.charAt(0)==='1')d=d.slice(1);
  /* Area code and exchange both start 2-9, and neither is a three-digit service code (second and third digit alike). */
  if(!/^[2-9]\d\d[2-9]\d\d\d{4}$/.test(d)||d.slice(1,3)==='11'||d.slice(4,6)==='11')
    return {ok:false,value:'',error:'Enter the ten-digit number patients call, with the area code.'};
  crisis=fdCarePacketCrisisNumbers(payload);
  for(i=0;i<crisis.length;i++)if(crisis[i]===d)return {ok:false,value:'',error:'That is a crisis line number. Enter the unit’s own number.'};
  return {ok:true,value:'('+d.slice(0,3)+') '+d.slice(3,6)+'-'+d.slice(6),error:''};
}

/* ---- tokens ------------------------------------------------------------------------------------------------- */
/* Fills {{unitName}}, {{unitPhone}} and {{crisis:<id>}} and nothing else. Literal text is escaped in html mode. Any
   token it cannot fill, any blank contact, and any brace left over FAILS the call rather than print a hole. */
function fdCarePacketFill(text,ctx,mode){
  var html=mode!=='text',s=String(text==null?'':text),re=/\{\{([^{}]*)\}\}/g,out='',last=0,m,failed=false,crisis=false;
  function literal(piece){
    if(/\{\{|\}\}/.test(piece))failed=true;
    return html?fdEsc(piece):piece;
  }
  function token(inner){
    var c,id,v;
    if(inner==='unitName'||inner==='unitPhone'){
      v=ctx&&typeof ctx[inner]==='string'?ctx[inner]:'';
      if(v)return html?fdEsc(v):v;
      return html?FD_CARE_PACKET_BLANK:'______';
    }
    id=/^crisis:([a-z0-9_]+)$/.exec(inner);
    if(id){
      c=ctx&&ctx.contacts&&Object.prototype.hasOwnProperty.call(ctx.contacts,id[1])?ctx.contacts[id[1]]:null;
      if(c&&typeof c.contact==='string'&&/\S/.test(c.contact))return html?fdEsc(c.contact):c.contact;
      crisis=true;
    }else if(/^crisis:/.test(inner))crisis=true;
    failed=true;
    return '';
  }
  while((m=re.exec(s))){
    out+=literal(s.slice(last,m.index))+token(m[1]);
    last=re.lastIndex;
  }
  out+=literal(s.slice(last));
  return failed?{ok:false,out:'',crisis:crisis}:{ok:true,out:out,crisis:false};
}

/* ---- a directory listing as it prints ------------------------------------------------------------------------ */
/* The feed cuts descriptions at 420 characters, so a long one that does not end in a full stop is a FRAGMENT. Trim
   it back to its last complete sentence, or drop it (and point at the website). A short label is left alone. */
function fdCarePacketDescription(text,website){
  var raw=typeof text==='string'?text.replace(/\s+/g,' ').replace(/^ | $/g,''):'',res={text:'',moreOnWebsite:false,withheld:[]},cut=-1,re,m;
  if(!raw)return res;
  if(fdCarePacketForbidden(raw)){res.withheld.push({field:'description',reason:'It contains a verification note or a dose.'});return res;}
  if(raw.length>=400&&!/[.!?]["')\]’”]?$/.test(raw)){
    re=/[.!?]["')\]’”]?(?=\s|$)/g;
    while((m=re.exec(raw)))cut=m.index+m[0].length;
    raw=cut>0?raw.slice(0,cut):'';
    if(!raw&&website)res.moreOnWebsite=true;
  }
  res.text=raw;
  return res;
}
function fdCarePacketHost(website){
  var m=/^https?:\/\/([^\/?#:\s@]+)/i.exec(typeof website==='string'?website:'');
  return m?m[1].toLowerCase().replace(/^www\./,''):'';
}
/* The code, only for an https address and only while its modules stay big enough to scan at 0.9 in. */
function fdCarePacketQr(website,host){
  var qr,m,modules;
  if(typeof fdCarePackQrSvg!=='function'||!host||!/^https:\/\//i.test(website))return '';
  qr=fdCarePackQrSvg(website,'website '+host);
  if(!qr||!qr.ok)return '';
  m=/viewBox="0 0 (\d+) /.exec(qr.svg);
  modules=m?Number(m[1])/4-8:Infinity;
  return modules>0&&modules<=FD_CARE_PACKET_QR_MAX_MODULES?qr.svg:'';
}

/* ---- markup helpers ----------------------------------------------------------------------------------------- */
function fdCarePacketHn(base,level){var n=(base||1)-1+level;return n>6?6:n;}
function fdCarePacketHeading(base,level,cls,text){var n=fdCarePacketHn(base,level);return '<h'+n+' class="'+cls+'">'+fdEsc(text)+'</h'+n+'>';}
function fdCarePacketFillOr(text,ctx,st){
  var f=fdCarePacketFill(text,ctx,'html');
  if(!f.ok){if(f.crisis)st.crisis=true;else st.other=true;return '';}
  return f.out;
}
function fdCarePacketParagraphs(text,ctx,st){
  var parts=String(text).split(/\n\s*\n/),out='',i,piece;
  for(i=0;i<parts.length;i++){
    piece=parts[i].replace(/^\s+|\s+$/g,'');
    if(piece)out+='<p>'+fdCarePacketFillOr(piece,ctx,st)+'</p>';
  }
  return out;
}
function fdCarePacketBullets(list,ctx,st,warn){
  var out='<ul class="fd-packet-list'+(warn?' is-warn':'')+'">',i;
  for(i=0;i<list.length;i++)out+='<li>'+fdCarePacketFillOr(list[i],ctx,st)+'</li>';
  return out+'</ul>';
}
function fdCarePacketRows(labels){
  var out='<div class="fd-packet-rows">',i;
  for(i=0;i<labels.length;i++)out+='<div class="fd-packet-row">'+(labels[i]?'<span>'+fdEsc(labels[i])+'</span>':'')+'<i aria-hidden="true"></i></div>';
  return out+'</div>';
}
function fdCarePacketTable(ins,ctx,st){
  var out='<table class="fd-packet-table"><caption class="fd-packet-vh">'+fdEsc(ins.title)+'</caption><thead><tr><th scope="col">Who</th>'+
    '<th scope="col">Number</th><th scope="col">What they help with</th></tr></thead><tbody>',i,r;
  for(i=0;i<ins.table.length;i++){
    r=ins.table[i];
    out+='<tr><td>'+fdEsc(r.who)+'</td><td class="fd-packet-table__num"><b>'+fdEsc(r.number)+'</b></td><td>'+fdCarePacketFillOr(r.what,ctx,st)+'</td></tr>';
  }
  return out+'</tbody></table>';
}
function fdCarePacketUnit(key,group,keepNext,html,extra){
  var u={key:key,group:group,keepNext:!!keepNext,html:html,crisis:false,card:false},k;
  if(extra)for(k in extra)if(Object.prototype.hasOwnProperty.call(extra,k))u[k]=extra[k];
  return u;
}

/* ---- the crisis block and the wallet card ------------------------------------------------------------------- */
function fdCarePacketCrisisLine(line,contact,withWhen){
  return '<li data-fd-packet-crisis="'+fdEsc(line.ref)+'"><b class="fd-packet-crisis__num">'+fdEsc(contact.contact)+'</b>'+
    '<span class="fd-packet-crisis__label">'+fdEsc(line.label)+'</span>'+
    (withWhen?'<span class="fd-packet-crisis__when">'+(contact.availability?fdEsc(contact.availability)+' · ':'')+fdEsc(line.when)+'</span>':'')+'</li>';
}
function fdCarePacketCrisisUnit(payload,ctx,st,hb){
  var out='<section class="fd-packet-crisis" data-fd-packet-unit="crisis" aria-label="'+fdEsc(payload.crisisCopy.heading)+'">'+
    fdCarePacketHeading(hb,2,'fd-packet-crisis__title',payload.crisisCopy.heading)+'<ul class="fd-packet-crisis__lines">',i,line;
  for(i=0;i<payload.crisis.length;i++){
    line=payload.crisis[i];
    out+=fdCarePacketCrisisLine(line,payload.contacts[line.ref],true);
  }
  return fdCarePacketUnit('crisis',null,false,out+'</ul><p class="fd-packet-crisis__note">'+fdCarePacketFillOr(payload.crisisCopy.note,ctx,st)+'</p></section>',{crisis:true});
}
function fdCarePacketCardUnit(ins,payload,ctx,st,hb){
  var lines='',i,line;
  for(i=0;i<payload.crisis.length;i++){line=payload.crisis[i];lines+=fdCarePacketCrisisLine(line,payload.contacts[line.ref],false);}
  return fdCarePacketUnit('card-0',null,false,
    '<section class="fd-packet-ins fd-packet-cardwrap" data-fd-packet-unit="insert" data-fd-packet-insert="card">'+
    fdCarePacketHeading(hb,2,'fd-packet-ins__title',ins.title)+(ins.body?fdCarePacketParagraphs(ins.body,ctx,st):'')+
    '<div class="fd-packet-card" data-fd-packet-card>'+fdCarePacketHeading(hb,3,'fd-packet-card__title',payload.crisisCopy.cardHeading)+
    '<ul class="fd-packet-card__lines">'+lines+'</ul>'+(ins.rows?fdCarePacketRows(ins.rows):'')+'</div></section>',{card:true});
}

/* ---- the standard pages ------------------------------------------------------------------------------------- */
function fdCarePacketInsertOn(state,ins){
  var o=state&&state.inserts;
  if(ins.core===true)return true;
  if(o&&Object.prototype.hasOwnProperty.call(o,ins.id)&&typeof o[ins.id]==='boolean')return o[ins.id];
  return ins.defaultOn===true;
}
/* An insert is cut into parts at its legal split points (between the lead, each group, the rows, the table and the
   tip). The title rides with the first part. Each part is one unit. */
function fdCarePacketInsertUnits(ins,payload,ctx,st,hb,mode){
  var id=ins.id,parts=[],lead='',wrapOpen,units=[],i,g,gh,tail='';
  if(id==='card')return [fdCarePacketCardUnit(ins,payload,ctx,st,hb)];
  if(id==='intro'){
    lead=ins.body?fdCarePacketParagraphs(ins.body,ctx,st):'';
    if(mode==='review')lead+='<p class="fd-packet-review-note"><b>While you are still here:</b> read through this, tick the places you want to try, and cross out the ones that do not fit. We will print a final copy with your choices before you leave.</p>';
    if(ins.signoff)lead+='<p class="fd-packet-sign">'+fdCarePacketFillOr(ins.signoff,ctx,st)+'</p>';
    return [fdCarePacketUnit('intro-0',null,false,'<section class="fd-packet-ins fd-packet-intro" data-fd-packet-unit="insert" data-fd-packet-insert="intro">'+lead+'</section>')];
  }
  if(ins.body)lead+=fdCarePacketParagraphs(ins.body,ctx,st);
  if(ins.bullets)lead+=fdCarePacketBullets(ins.bullets,ctx,st,false);
  if(lead)parts.push(lead);
  if(ins.groups)for(i=0;i<ins.groups.length;i++){
    g=ins.groups[i];
    gh='<div class="fd-packet-group'+(g.tone==='warn'?' is-warn':'')+'">'+fdCarePacketHeading(hb,3,'fd-packet-group__title',g.heading);
    if(g.body)gh+=fdCarePacketParagraphs(g.body,ctx,st);
    if(g.bullets)gh+=fdCarePacketBullets(g.bullets,ctx,st,g.tone==='warn');
    if(g.rows)gh+=fdCarePacketRows(g.rows);
    parts.push(gh+'</div>');
  }
  if(ins.rows)parts.push(fdCarePacketRows(ins.rows));
  if(ins.table)parts.push(fdCarePacketTable(ins,ctx,st));
  if(ins.tip)tail+='<p class="fd-packet-tip">'+fdCarePacketFillOr(ins.tip,ctx,st)+'</p>';
  if(ins.signoff)tail+='<p class="fd-packet-sign">'+fdCarePacketFillOr(ins.signoff,ctx,st)+'</p>';
  if(tail)parts.push(tail);
  for(i=0;i<parts.length;i++){
    wrapOpen='<section class="fd-packet-ins" data-fd-packet-unit="insert" data-fd-packet-insert="'+fdEsc(id)+'">';
    units.push(fdCarePacketUnit(id+'-'+i,id,false,wrapOpen+(i===0?fdCarePacketHeading(hb,2,'fd-packet-ins__title',ins.title):'')+parts[i]+'</section>'));
  }
  return units;
}

/* ---- a listing as one unit ---------------------------------------------------------------------------------- */
function fdCarePacketListingUnit(row,index,payload,mode,hb,preview,out){
  var name=typeof row.name==='string'?row.name:'',phone=typeof row.phone==='string'?row.phone.replace(/\s+/g,' ').replace(/^ | $/g,''):'';
  var area=typeof row.area==='string'?row.area.replace(/\s+/g,' ').replace(/^ | $/g,''):'',host=fdCarePacketHost(row.website),desc,svg='',html;
  if(fdCarePacketForbidden(name)||fdCarePacketForbidden(phone)){
    out.blockers.push({code:'LISTING_TEXT',id:row.id,message:'“'+fdCarePacketStrip(name)+'” has text that cannot print on a patient page (a verification note or a dose). Remove it from the packet.'});
    return null;
  }
  if(fdCarePacketCrisisHit(phone,payload)){
    out.blockers.push({code:'CRISIS_NUMBER',id:row.id,message:'“'+fdCarePacketStrip(name)+'” lists a crisis line number. The crisis lines on page 1 are the only place they print. Remove it, or choose another listing.'});
    return null;
  }
  if(area&&fdCarePacketForbidden(area)){out.withheld.push({field:'area',id:row.id,name:name});area='';}
  if(host&&fdCarePacketForbidden(host)){out.withheld.push({field:'website',id:row.id,name:name});host='';}
  desc=fdCarePacketDescription(row.description,host?row.website:'');
  if(desc.withheld.length)out.withheld.push({field:'description',id:row.id,name:name});
  svg=fdCarePacketQr(row.website,host);
  html='<section class="fd-packet-res" data-fd-packet-unit="res" data-fd-packet-res>'+
    '<span class="'+(mode==='review'?'fd-packet-box':'fd-packet-box is-blank')+'" aria-hidden="true"></span>'+
    '<div class="fd-packet-res__main">'+fdCarePacketHeading(hb,4,'fd-packet-res__name',name)+
    (desc.text?'<p class="fd-packet-res__d">'+fdEsc(desc.text)+'</p>':'')+(desc.moreOnWebsite?'<p class="fd-packet-res__d">More details on the website.</p>':'')+
    '<p class="fd-packet-res__c">'+(phone?'<span class="fd-packet-res__phone">Call <b>'+fdEsc(phone)+'</b></span>':'')+(host?'<span>'+fdEsc(host)+'</span>':'')+
    (area?'<span>'+fdEsc(area)+'</span>':'')+'</p>'+
    (preview&&svg?'<p class="fd-packet-qrurl">Scan opens: '+fdEsc(row.website)+'</p>':'')+'</div>'+
    (svg?'<div class="fd-packet-qr">'+svg+'</div>':'')+'</section>';
  return fdCarePacketUnit('res-'+index,null,false,html);
}

/* ---- the model: every unit, in print order ------------------------------------------------------------------ */
function fdCarePacketPayloadOk(payload){
  var i,line,id;
  if(!payload||typeof payload!=='object'||!payload.contacts||typeof payload.contacts!=='object')return false;
  if(!Array.isArray(payload.required)||!payload.required.length||!Array.isArray(payload.crisis)||!payload.crisis.length)return false;
  if(!Array.isArray(payload.inserts)||!payload.crisisCopy||typeof payload.crisisCopy.heading!=='string')return false;
  for(i=0;i<payload.crisis.length;i++){
    line=payload.crisis[i];
    if(!line||!payload.contacts[line.ref]||typeof payload.contacts[line.ref].contact!=='string'||!/\S/.test(payload.contacts[line.ref].contact))return false;
  }
  for(i=0;i<payload.required.length;i++){
    id=payload.required[i];
    if(!payload.contacts[id]||typeof payload.contacts[id].contact!=='string'||!/\S/.test(payload.contacts[id].contact))return false;
    if(!payload.crisis.some(function(l){return l&&l.ref===id;}))return false;
  }
  return true;
}
/* What was RENDERED, not what was asked for: every required contact must be in the crisis block, and on the wallet
   card when there is one. Separate so a test can hand it a deliberately broken layout. */
function fdCarePacketCheckCrisis(units,payload){
  var i,j,needle,found;
  for(i=0;i<payload.required.length;i++){
    needle=fdEsc(payload.contacts[payload.required[i]].contact);
    found=false;
    for(j=0;j<units.length;j++){
      if(units[j].crisis&&units[j].html.indexOf(needle)!==-1)found=true;
      if(units[j].card&&units[j].html.indexOf(needle)===-1)return false;
    }
    if(!found)return false;
  }
  return true;
}
function fdCarePacketDate(stamp){
  var m=/^(\d{4}-\d{2}-\d{2})/.exec(typeof stamp==='string'?stamp:'');
  return m?m[1]:'';
}
function fdCarePacketFail(code,message){return {ok:false,code:code,message:message,pages:[],count:0,html:'',text:'',withheld:[],blockers:[]};}

function fdCarePacketBuild(state,data,payload,opts){
  var hb=(opts&&opts.headingBase)||1,preview=!!(opts&&opts.preview),mode=state&&state.mode==='final'?'final':'review';
  var live,byId,cats,ctx,unit,st={crisis:false,other:false},out={blockers:[],withheld:[]},units=[],i,j,k,ins,rest=[],made,row,label,firstCat=true,groupCount;
  var intro=null,week=null,crisisUnit;
  if(!fdCarePacketPayloadOk(payload))return fdCarePacketFail('CRISIS_UNAVAILABLE','The crisis lines did not load, so this packet cannot print. Reload the page and try again.');
  live=fdCarePacketDisplayOrder(state,data);
  if(!live.length)return fdCarePacketFail('EMPTY','Add a listing to the packet to preview it.');
  byId=fdCarePacketRecords(data);
  unit={name:fdCarePacketUnitName(state.unit&&state.unit.name),phone:fdCarePacketUnitPhone(state.unit&&state.unit.phone,payload)};
  ctx={unitName:unit.name.ok?unit.name.value:'',unitPhone:unit.phone.ok?unit.phone.value:'',contacts:payload.contacts};

  units.push(fdCarePacketUnit('p1-header',null,false,'<header class="fd-packet-head" data-fd-packet-unit="header"><p class="fd-packet-org">'+fdEsc(FD_CARE_PACKET_ORG)+
    (ctx.unitName?' · '+fdEsc(ctx.unitName):'')+'</p>'+fdCarePacketHeading(hb,1,'fd-packet-title',FD_CARE_PACKET_TITLE)+'</header>'));
  for(i=0;i<payload.inserts.length;i++){
    ins=payload.inserts[i];
    if(!fdCarePacketInsertOn(state,ins))continue;
    if(ins.id==='intro')intro=ins;else if(ins.id==='week')week=ins;else rest.push(ins);
  }
  if(intro)units=units.concat(fdCarePacketInsertUnits(intro,payload,ctx,st,hb,mode));
  crisisUnit=fdCarePacketCrisisUnit(payload,ctx,st,hb);
  units.push(crisisUnit);
  if(week)units=units.concat(fdCarePacketInsertUnits(week,payload,ctx,st,hb,mode));

  units.push(fdCarePacketUnit('res-head',null,true,fdCarePacketHeading(hb,2,'fd-packet-sec','Places that can help')));
  if(mode==='review')units.push(fdCarePacketUnit('res-tip',null,true,'<p class="fd-packet-tip" data-fd-packet-unit="tip"><b>Tick the ones you want to try.</b> Put an X through any that do not fit. We will keep what you tick for the final copy.</p>'));
  cats=(data&&data.categories)||[];
  for(i=0,k=0;i<cats.length;i++){
    made=[];
    for(j=0;j<live.length;j++){
      row=byId[live[j]];
      if(row.category!==cats[i].id)continue;
      made.push(fdCarePacketListingUnit(row,k++,payload,mode,hb,preview,out));
    }
    made=made.filter(function(u){return u;});
    if(!made.length)continue;
    label=cats[i].label||cats[i].id;
    units.push(fdCarePacketUnit('cat-'+i,null,true,fdCarePacketHeading(hb,3,'fd-packet-cat',label)));
    units=units.concat(made);
  }
  for(i=0;i<rest.length;i++){
    units=units.concat(fdCarePacketInsertUnits(rest[i],payload,ctx,st,hb,mode));
  }
  if(st.crisis)return fdCarePacketFail('CRISIS_UNAVAILABLE','A crisis contact in this packet could not be filled in, so it cannot print. Reload the page and try again.');
  if(st.other)return fdCarePacketFail('PAGES_UNAVAILABLE','A standard page could not be built, so this packet cannot print.');
  if(!fdCarePacketCheckCrisis(units,payload))return fdCarePacketFail('CRISIS_UNAVAILABLE','A required crisis line is missing from the packet, so it cannot print.');
  groupCount=state.ids.length;
  if(data&&data.partial&&groupCount>live.length)out.blockers.push({code:'HIDDEN_LISTINGS',id:'',message:(groupCount-live.length)+' saved listing'+(groupCount-live.length===1?' is':'s are')+' hidden while the directory is incomplete. Reload the directory before printing.'});
  if(mode==='final'&&!ctx.unitPhone)out.blockers.push({code:'UNIT_PHONE',id:'',message:'Enter the unit phone number so the Final copy can tell patients how to reach the unit.'});
  return {ok:true,mode:mode,units:units,blockers:out.blockers,withheld:out.withheld,ctx:ctx,live:live,hb:hb,
    date:fdCarePacketDate(data&&data.generatedAt),helplinesDate:typeof payload.generatedAt==='string'?payload.generatedAt:''};
}

/* ---- pagination --------------------------------------------------------------------------------------------- */
/* Greedy packing. A unit is never split. A unit with keepNext stays with the one after it. A standard page (units
   sharing a group) moves whole to a fresh sheet when it fits one, otherwise it is split at its parts. A unit that
   cannot fit a sheet, or a measurement that cannot be trusted, FAILS: nothing is clipped. */
function fdCarePacketPaginate(units,heights,capacity,opts){
  var slack=opts&&typeof opts.slack==='number'?opts.slack:FD_CARE_PACKET_SLACK,whole=!(opts&&opts.keepWhole===false);
  var n=units&&units.length,avail,pages=[],cur,i,j,k,runH,chainH,bad=function(code,message){return {ok:false,code:code,message:message,pages:[],count:0};};
  if(!n||!heights||heights.length!==n||typeof capacity!=='number'||!isFinite(capacity)||capacity<=0)return bad('MEASURE_FAILED','The packet could not be measured, so it cannot print.');
  for(i=0;i<n;i++)if(typeof heights[i]!=='number'||!isFinite(heights[i])||heights[i]<=0)return bad('MEASURE_FAILED','The packet could not be measured, so it cannot print.');
  avail=capacity-slack;
  if(avail<=0)return bad('MEASURE_FAILED','The packet could not be measured, so it cannot print.');
  cur={units:[],used:0,capacity:capacity};
  function place(index){cur.units.push(index);cur.used+=heights[index];}
  function next(){if(cur.units.length){pages.push(cur);cur={units:[],used:0,capacity:capacity};}}
  for(i=0;i<n;){
    if(units[i].group){
      j=i;runH=0;
      while(j<n&&units[j].group===units[i].group){runH+=heights[j];j++;}
      if(whole&&runH<=avail){
        if(cur.used+runH>avail)next();
        for(k=i;k<j;k++)place(k);
        i=j;
        continue;
      }
    }
    j=i;chainH=heights[i];
    while(units[j].keepNext&&j+1<n){j++;chainH+=heights[j];}
    if(chainH>avail)return bad('OVERFLOW','A section is too long for one page, so this packet cannot print.');
    if(cur.used+chainH>avail)next();
    for(k=i;k<=j;k++)place(k);
    i=j+1;
  }
  if(cur.units.length)pages.push(cur);
  return {ok:true,code:'',message:'',pages:pages,count:pages.length};
}

/* A deterministic stand-in for the DOM measurer: node tests and any environment without a document. Production
   measures the real layout (fdCarePacketMeasureDom is the default wherever a document exists). */
function fdCarePacketEstimate(units){
  var heights=[],i,plain,blocks;
  for(i=0;i<units.length;i++){
    plain=String(units[i].html).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
    blocks=(String(units[i].html).match(/<(?:p|li|tr|h[1-6])[\s>]|class="fd-packet-row"/g)||[]).length;
    heights.push(Math.max(24,Math.ceil(plain.length/96)*20+blocks*7+14));
  }
  return {heights:heights,capacity:880};
}
function fdCarePacketBandHtml(mode){
  return mode==='review'?'<div class="fd-packet-band">'+fdEsc(FD_CARE_PACKET_BAND)+'</div>':'<div class="fd-packet-band is-empty" aria-hidden="true"></div>';
}
function fdCarePacketFootHtml(model,n,total){
  return '<footer class="fd-packet-foot"><p>'+(model.date?'Listings copied from the ReConnect community directory on '+fdEsc(model.date)+'. ':'Listings copied from the ReConnect community directory. ')+
    'Call ahead to confirm hours, cost and availability. Not a medical record.</p>'+
    (model.helplinesDate?'<p>Helplines checked against each organization’s own website, '+fdEsc(model.helplinesDate)+'.</p>':'')+
    '<p class="fd-packet-pnum">Page '+n+' of '+total+'</p></footer>';
}
/* Measures the real layout in a hidden box with the page body's exact width and typography, and removes it in the
   same task. The empty body gives the capacity; the units give their heights. */
function fdCarePacketMeasureDom(units,info){
  var wrap,body,kids,heights=[],cap=0,html='',i;
  if(typeof document==='undefined'||!document.body)return null;
  wrap=document.createElement('div');
  wrap.className='fd-packet-measurewrap';
  wrap.setAttribute('aria-hidden','true');
  wrap.setAttribute('inert','');
  wrap.innerHTML='<div class="fd-packet-sheet fd-packet-sheet--paper"><article class="fd-packet-page">'+fdCarePacketBandHtml(info.mode)+
    '<div class="fd-packet-body"></div>'+fdCarePacketFootHtml(info,9,9)+'</article></div>';
  document.body.appendChild(wrap);
  try{
    body=wrap.querySelector('.fd-packet-body');
    cap=body.getBoundingClientRect().height;
    for(i=0;i<units.length;i++)html+=units[i].html;
    body.innerHTML=html;
    kids=body.children;
    if(kids.length!==units.length)return null;
    for(i=0;i<kids.length;i++)heights.push(kids[i].getBoundingClientRect().height);
  }finally{
    if(wrap.parentNode)wrap.parentNode.removeChild(wrap);
  }
  return {heights:heights,capacity:cap};
}

/* ---- the sheet ---------------------------------------------------------------------------------------------- */
function fdCarePacketSheet(state,data,payload,opts){
  var model=fdCarePacketBuild(state,data,payload,opts),measure,measured,pack,html='',i,p,j,crisisAt=-1,pageOf=-1,u;
  if(!model.ok)return model;
  measure=opts&&typeof opts.measure==='function'?opts.measure:(typeof document!=='undefined'?fdCarePacketMeasureDom:fdCarePacketEstimate);
  measured=measure(model.units,model);
  if(!measured)return fdCarePacketFail('MEASURE_FAILED','The packet could not be measured, so it cannot print.');
  pack=fdCarePacketPaginate(model.units,measured.heights,measured.capacity,{slack:opts&&typeof opts.slack==='number'?opts.slack:FD_CARE_PACKET_SLACK,keepWhole:!(opts&&opts.keepWhole===false)});
  if(!pack.ok)return fdCarePacketFail(pack.code,pack.message);
  for(i=0;i<model.units.length;i++)if(model.units[i].crisis)crisisAt=i;
  for(p=0;p<pack.pages.length;p++)for(j=0;j<pack.pages[p].units.length;j++)if(pack.pages[p].units[j]===crisisAt)pageOf=p;
  if(pageOf!==0)return fdCarePacketFail('CRISIS_NOT_PAGE_ONE','The crisis lines would not be on the first page, so this packet cannot print.');
  for(p=0;p<pack.pages.length;p++){
    html+='<article class="fd-packet-page" data-fd-packet-page aria-label="Page '+(p+1)+' of '+pack.count+'">'+fdCarePacketBandHtml(model.mode)+'<div class="fd-packet-body">';
    for(j=0;j<pack.pages[p].units.length;j++){u=model.units[pack.pages[p].units[j]];html+=u.html;}
    html+='</div>'+fdCarePacketFootHtml(model,p+1,pack.count)+'</article>';
  }
  return {ok:true,code:'',message:'',pages:pack.pages,count:pack.count,html:html,mode:model.mode,blockers:model.blockers,withheld:model.withheld};
}

/* ---- the copy for the After Visit Summary ------------------------------------------------------------------- */
/* Plain text, Final only: a Review draft never goes into the record. Raw strings (never escaped), control and bidi
   characters stripped, crisis lines first, no unit details. */
function fdCarePacketText(state,data,payload,opts){
  var model=fdCarePacketBuild(state,data,payload,opts),lines=[],i,j,k,row,cats,byId,t,desc,host,bits,line,contact,fillCtx,note;
  if(!model.ok)return model;
  if(model.mode!=='final')return fdCarePacketFail('NOT_FINAL','Switch to the Final copy to copy text for the After Visit Summary.');
  byId=fdCarePacketRecords(data);
  fillCtx={unitName:'',unitPhone:'',contacts:payload.contacts};
  note=fdCarePacketFill(payload.crisisCopy.note,fillCtx,'text');
  if(!note.ok)return fdCarePacketFail('CRISIS_UNAVAILABLE','A crisis contact could not be filled in, so this cannot be copied.');
  lines.push(FD_CARE_PACKET_TITLE,'',fdCarePacketStrip(payload.crisisCopy.heading));
  for(i=0;i<payload.crisis.length;i++){
    line=payload.crisis[i];contact=payload.contacts[line.ref];
    lines.push(fdCarePacketStrip(line.label)+': '+fdCarePacketStrip(contact.contact)+(contact.availability?' ('+fdCarePacketStrip(contact.availability)+')':''));
  }
  lines.push(fdCarePacketStrip(note.out),'','Places that can help');
  cats=(data&&data.categories)||[];
  for(i=0;i<cats.length;i++){
    t=[];
    for(j=0;j<model.live.length;j++){
      row=byId[model.live[j]];
      if(row.category!==cats[i].id)continue;
      if(fdCarePacketForbidden(row.name)||fdCarePacketForbidden(row.phone)||fdCarePacketCrisisHit(row.phone,payload))continue;
      bits=[fdCarePacketStrip(row.name)];
      if(row.phone)bits.push(fdCarePacketStrip(row.phone));
      host=fdCarePacketHost(row.website);
      if(host&&!fdCarePacketForbidden(host))bits.push(host);
      if(row.area&&!fdCarePacketForbidden(row.area))bits.push(fdCarePacketStrip(row.area));
      desc=fdCarePacketDescription(row.description,row.website);
      t.push('- '+bits.join(' · ')+(desc.text?'. '+fdCarePacketStrip(desc.text):''));
    }
    if(t.length){lines.push('',fdCarePacketStrip(cats[i].label||cats[i].id));for(k=0;k<t.length;k++)lines.push(t[k]);}
  }
  lines.push('',(model.date?'Listings copied from the ReConnect community directory on '+model.date+'. ':'Listings copied from the ReConnect community directory. ')+'Call ahead to confirm hours, cost and availability. Not a medical record.');
  return {ok:true,code:'',message:'',text:lines.join('\n'),blockers:model.blockers,withheld:model.withheld,mode:model.mode};
}
