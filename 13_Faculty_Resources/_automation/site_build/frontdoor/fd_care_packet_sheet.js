/* Aftercare packet, part 2: the printable sheet, as pure functions. Pure ES5; no network, storage or analytics; the only
   DOM use is the two measuring functions at the bottom, which run only where a document exists. Nothing here is
   patient-facing until FD_CARE_PACKET_ENABLED is changed by an owner-approved source edit.

   What it renders: a header, the welcome, a crisis block built from the build payload (never typed here), the chosen
   directory listings grouped by category, then the optional standard pages, packed into numbered sheets by measured
   height. A unit is never split; a page that cannot be laid out safely is REFUSED, never clipped.

   This module names no crisis contact and no crisis id. Which lines are required, and what their numbers are, come
   from the payload (care_inserts_payload.py), and the sheet checks what it RENDERED against that list.

   Invisible characters are never written into this file as themselves (nobody reviewing it could see them). Which
   characters count as invisible, as a dash or as a digit comes from the engine's own Unicode tables, below. */

var FD_CARE_PACKET_ORG='Maine Medical Center';
var FD_CARE_PACKET_TITLE='Your aftercare resources';
var FD_CARE_PACKET_BAND='Review copy · we will finalize this together before you leave';
/* Pixels held back at the foot of every sheet: a measured layout and a printed one can differ by a line or two. */
var FD_CARE_PACKET_SLACK=24;
/* Above this many modules a 0.9 in code has modules under 0.4 mm, which older phones struggle to scan. */
var FD_CARE_PACKET_QR_MAX_MODULES=49;
/* A Letter sheet is 11 in tall; CSS pixels are 96 to the inch in print as well as on screen. */
var FD_CARE_PACKET_SHEET_PX=1056;
var FD_CARE_PACKET_BLANK='<span class="fd-packet-blank"><span class="fd-packet-vh">blank line to write in</span></span>';

/* ---- text hygiene ------------------------------------------------------------------------------------------- */
function fdCarePacketChar(code){return String.fromCharCode(code);}
function fdCarePacketClass(ranges){
  var out='[',i;
  for(i=0;i<ranges.length;i++){
    out+=fdCarePacketChar(ranges[i][0]);
    if(ranges[i][1]!==ranges[i][0])out+='-'+fdCarePacketChar(ranges[i][1]);
  }
  return out+']';
}
var FD_CARE_PACKET_CONTROL_RE=new RegExp(fdCarePacketClass([[0,0x1f],[0x7f,0x7f]]),'g');
/* What is invisible (format characters, Cf), a control (Cc), a dash (Pd) or a decimal digit (Nd) is decided by the
   engine's own Unicode tables: the same general categories the validator's Python reads, so the two scans cannot
   disagree over a character that a hand-written list forgot (tag characters, musical and hieroglyph format controls,
   every script's digits). An engine without property escapes cannot run this scan, and then the sheet refuses to
   build (CHECK_UNAVAILABLE): nothing prints on a scan that did not happen. */
var FD_CARE_PACKET_UNICODE=(function(){
  try{
    return {cf:new RegExp('\\p{Cf}','gu'),cc:new RegExp('\\p{Cc}','gu'),pd:new RegExp('\\p{Pd}','gu'),nd:new RegExp('\\p{Nd}','gu'),one:new RegExp('^\\p{Nd}$','u')};
  }catch(unsupported){return null;}
})();
/* The value of a decimal digit of any script. Decimal digits come in runs of ten that start at zero (some runs sit
   back to back, in tens), so the value is the distance from the start of the run, modulo ten. */
function fdCarePacketDigitValue(ch){
  var code=ch.codePointAt(0),start=code,steps=0;
  while(steps<100&&start>0&&FD_CARE_PACKET_UNICODE.one.test(String.fromCodePoint(start-1))){start-=1;steps+=1;}
  return String((code-start)%10);
}
/* A scan-only view: width folded, format characters dropped, controls made spaces, every script's digits made ASCII,
   every dash a hyphen (the validator's normalise() plus the digits its Unicode-aware patterns read directly). What
   PRINTS is fdCarePacketStrip, so what would hide a dose from this scan never reaches paper. */
function fdCarePacketNorm(text){
  var s=String(text==null?'':text),u=FD_CARE_PACKET_UNICODE;
  if(typeof s.normalize==='function'){try{s=s.normalize('NFKC');}catch(ignoreNormalize){}}
  if(!u)return s;
  return s.replace(u.cf,'').replace(u.cc,' ').replace(u.nd,fdCarePacketDigitValue).replace(u.pd,'-').replace(new RegExp(fdCarePacketChar(0x2212),'g'),'-');
}
/* For text that prints or leaves the page: format and control characters out, whitespace collapsed. */
function fdCarePacketStrip(text){
  var s=String(text==null?'':text),u=FD_CARE_PACKET_UNICODE;
  s=u?s.replace(u.cf,'').replace(u.cc,' '):s.replace(FD_CARE_PACKET_CONTROL_RE,' ');
  return s.replace(/\s+/g,' ').replace(/^ | $/g,'');
}
/* The validator's own pattern family (validate_care_inserts.py), kept in step by a parity test, plus verification
   WORDING, which feed prose carries and the validator's data does not. */
var FD_CARE_PACKET_DOSE_UNITS='(?:mgs?|mcgs?|['+fdCarePacketChar(0xb5)+fdCarePacketChar(0x3bc)+'u]g|g|gm|grams?|mls?|cc|iu|meq|milligrams?|micrograms?|millilit(?:er|re)s?)';
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
/* Every phone number in a text, as digits. A ten-digit North American number (with or without the leading 1, in any
   of the usual shapes) is taken whole FIRST and removed, so its groups are never read again as short codes and a number
   followed by "(24/7)" is still that number. What is left is read for short codes: a standalone run of 3 to 6 digits,
   or 3 to 4 single digits spaced by one repeated separator. Compared as numbers, a short code is never found inside a
   longer one (a year, a four-digit extension or a toll-free number that merely contains the code is not that code). */
function fdCarePacketNumbers(text){
  var s=fdCarePacketNorm(text),out=[],m,re;
  s=s.replace(/\+?1?[ .\-]?\(?(\d{3})\)?[ .\-]?(\d{3})[ .\-]?(\d{4})/g,function(whole,a,b,c,at,all){
    if(at>0&&/\d/.test(all.charAt(at-1)))return whole;
    if(/\d/.test(all.charAt(at+whole.length)))return whole;
    out.push(a+b+c);
    return ' ';
  });
  re=/(^|[^0-9])([0-9]{3,6})(?![0-9])/g;
  while((m=re.exec(s))){out.push(m[2]);re.lastIndex=m.index+m[0].length-1;}
  re=/(^|[^0-9])([0-9])([ .\-])([0-9])\3([0-9])(?:\3([0-9]))?(?!\3?[0-9])/g;
  while((m=re.exec(s)))out.push(m[2]+m[4]+m[5]+(m[6]||''));
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
/* Seven or more digits joined only by separators is a phone number, in any format. */
function fdCarePacketPhoneLike(text){return /(^|[^0-9])[0-9](?:[\s\-.\/()]*[0-9]){6,}(?![0-9])/.test(fdCarePacketNorm(text));}

/* ---- the unit's own details (the ward's, never the patient's) ------------------------------------------------ */
function fdCarePacketUnitName(value,payload){
  var raw=String(value==null?'':value),s;
  if(FD_CARE_PACKET_CONTROL_RE.test(raw)){FD_CARE_PACKET_CONTROL_RE.lastIndex=0;return {ok:false,value:'',error:'Use letters, numbers and ordinary punctuation.'};}
  FD_CARE_PACKET_CONTROL_RE.lastIndex=0;
  s=fdCarePacketStrip(raw);
  if(!s)return {ok:true,value:'',error:''};
  if(s.length>60)return {ok:false,value:'',error:'Use 60 characters or fewer.'};
  if(/[<>{}]/.test(s))return {ok:false,value:'',error:'Use letters, numbers and ordinary punctuation.'};
  if(fdCarePacketPhoneLike(s))return {ok:false,value:'',error:'Put the phone number in the phone field, not the name.'};
  if(fdCarePacketCrisisHit(s,payload))return {ok:false,value:'',error:'That is a crisis line number. The crisis lines print on page 1 by themselves.'};
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
   it back to its last complete sentence, or drop it (and point at the website). A short label is left alone. The
   length is taken BEFORE whitespace is collapsed, because the cut was made on the original text. */
function fdCarePacketDescription(text,website){
  var original=typeof text==='string'?text:'',raw=fdCarePacketStrip(original),res={text:'',moreOnWebsite:false,withheld:[]},cut=-1,re,m;
  if(!raw)return res;
  if(fdCarePacketForbidden(raw)){res.withheld.push({field:'description',reason:'note'});return res;}
  if(original.length>=400&&!/[.!?]["')\]’”]?$/.test(raw)){
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
/* A write-in row with a label is read by its label; an unlabelled one says what it is, so a screen reader does not
   announce a heading and then nothing. */
function fdCarePacketRows(labels){
  var out='<div class="fd-packet-rows">',i;
  for(i=0;i<labels.length;i++)out+='<div class="fd-packet-row">'+(labels[i]?'<span>'+fdEsc(labels[i])+'</span>':'<span class="fd-packet-vh">blank line to write in</span>')+'<i aria-hidden="true"></i></div>';
  return out+'</div>';
}
function fdCarePacketTable(ins,ctx,st){
  /* Explicit roles: the narrow-screen layout changes the cells' display, which some engines read as "not a table". */
  var out='<table class="fd-packet-table" role="table"><caption class="fd-packet-vh">'+fdEsc(ins.title)+'</caption><thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Who</th>'+
    '<th scope="col" role="columnheader">Number</th><th scope="col" role="columnheader">What they help with</th></tr></thead><tbody role="rowgroup">',i,r;
  for(i=0;i<ins.table.length;i++){
    r=ins.table[i];
    out+='<tr role="row"><td role="cell">'+fdEsc(r.who)+'</td><td role="cell" class="fd-packet-table__num"><b>'+fdEsc(r.number)+'</b></td><td role="cell">'+fdCarePacketFillOr(r.what,ctx,st)+'</td></tr>';
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
/* A unit spaces itself with padding, because the measurer reads boxes and margins are not in a box. So the bordered
   part is an inner element, and the unit's own bottom padding stays outside the border. */
function fdCarePacketCrisisUnit(payload,ctx,st,hb){
  var out='<section class="fd-packet-crisis" data-fd-packet-unit="crisis" aria-label="'+fdEsc(payload.crisisCopy.heading)+'"><div class="fd-packet-crisis__box">'+
    fdCarePacketHeading(hb,2,'fd-packet-crisis__title',payload.crisisCopy.heading)+'<ul class="fd-packet-crisis__lines">',i,line;
  for(i=0;i<payload.crisis.length;i++){
    line=payload.crisis[i];
    out+=fdCarePacketCrisisLine(line,payload.contacts[line.ref],true);
  }
  return fdCarePacketUnit('crisis',null,false,out+'</ul><p class="fd-packet-crisis__note">'+fdCarePacketFillOr(payload.crisisCopy.note,ctx,st)+'</p></div></section>',{crisis:true});
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

/* ---- listings: cleaned ONCE, used by the paper and by the copy ---------------------------------------------- */
/* What prints is what was scanned: control and format characters are removed from every feed string before it is
   checked, so a bidirectional trick cannot hide a dose or a crisis number from a scan and then show it on paper.
   A listing whose NAME or PHONE holds a verification note, a dose or a crisis number is not printed at all (and
   printing is blocked, naming it). A DESCRIPTION or AREA that does is left off and noted. */
function fdCarePacketListing(row,payload,out){
  var name=fdCarePacketStrip(row.name),phone=fdCarePacketStrip(row.phone),area=fdCarePacketStrip(row.area),host=fdCarePacketHost(row.website),desc,svg,addr='';
  if(fdCarePacketForbidden(name)||fdCarePacketForbidden(phone)){
    out.blockers.push({code:'LISTING_TEXT',id:row.id,message:'“'+name+'” has text that cannot print on a patient page (a verification note or a dose). Remove it from the packet.'});
    return null;
  }
  if(fdCarePacketCrisisHit(name,payload)||fdCarePacketCrisisHit(phone,payload)){
    out.blockers.push({code:'CRISIS_NUMBER',id:row.id,message:'“'+name+'” lists a crisis line number. The crisis lines on page 1 are the only place they print. Remove it, or choose another listing.'});
    return null;
  }
  if(area&&(fdCarePacketForbidden(area)||fdCarePacketCrisisHit(area,payload))){out.withheld.push({field:'area',id:row.id,name:name,reason:fdCarePacketForbidden(area)?'note':'crisis'});area='';}
  if(host&&fdCarePacketForbidden(host)){out.withheld.push({field:'website',id:row.id,name:name,reason:'note'});host='';}
  desc=fdCarePacketDescription(row.description,host?row.website:'');
  if(desc.text&&fdCarePacketCrisisHit(desc.text,payload)){desc={text:'',moreOnWebsite:!!host,withheld:[{field:'description',reason:'crisis'}]};}
  if(desc.withheld.length)out.withheld.push({field:'description',id:row.id,name:name,reason:desc.withheld[0].reason});
  svg=fdCarePacketQr(row.website,host);
  if(svg)addr=String(row.website);
  return {id:row.id,name:name,phone:phone,area:area,host:host,desc:desc,svg:svg,address:addr};
}
function fdCarePacketListingUnit(item,index,mode,hb){
  return fdCarePacketUnit('res-'+index,null,false,'<section class="fd-packet-res" data-fd-packet-unit="res" data-fd-packet-res>'+
    '<span class="'+(mode==='review'?'fd-packet-box':'fd-packet-box is-blank')+'" aria-hidden="true"></span>'+
    '<div class="fd-packet-res__main">'+fdCarePacketHeading(hb,3,'fd-packet-res__name',item.name)+
    (item.desc.text?'<p class="fd-packet-res__d">'+fdEsc(item.desc.text)+'</p>':'')+(item.desc.moreOnWebsite?'<p class="fd-packet-res__d">More details on the website.</p>':'')+
    '<p class="fd-packet-res__c">'+(item.phone?'<span class="fd-packet-res__phone">Call <b>'+fdEsc(item.phone)+'</b></span>':'')+(item.host?'<span>'+fdEsc(item.host)+'</span>':'')+
    (item.area?'<span>'+fdEsc(item.area)+'</span>':'')+'</p></div>'+
    (item.svg?'<div class="fd-packet-qr">'+item.svg+'</div>':'')+'</section>');
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
function fdCarePacketFail(code,message){return {ok:false,code:code,message:message,pages:[],count:0,html:'',text:'',withheld:[],blockers:[],addresses:[]};}

function fdCarePacketBuild(state,data,payload,opts){
  if(!FD_CARE_PACKET_UNICODE)return fdCarePacketFail('CHECK_UNAVAILABLE','This browser cannot check the listings for text that must not print, so it cannot print the packet. Use Chrome or Edge.');
  var hb=(opts&&opts.headingBase)||1,mode=state&&state.mode==='final'?'final':'review';
  var live,byId,cats,ctx,unit,st={crisis:false,other:false},out={blockers:[],withheld:[]},units=[],i,j,k,ins,rest=[],item,label,groupCount;
  var intro=null,week=null,crisisUnit,groups=[],members,addresses=[];
  if(!fdCarePacketPayloadOk(payload))return fdCarePacketFail('CRISIS_UNAVAILABLE','The crisis lines did not load, so this packet cannot print. Reload the page and try again.');
  live=fdCarePacketDisplayOrder(state,data);
  if(!live.length)return fdCarePacketFail('EMPTY','Add a listing to the packet to preview it.');
  byId=fdCarePacketRecords(data);
  unit={name:fdCarePacketUnitName(state.unit&&state.unit.name,payload),phone:fdCarePacketUnitPhone(state.unit&&state.unit.phone,payload)};
  ctx={unitName:unit.name.ok?unit.name.value:'',unitPhone:unit.phone.ok?unit.phone.value:'',contacts:payload.contacts};

  units.push(fdCarePacketUnit('p1-header',null,false,'<header class="fd-packet-head" data-fd-packet-unit="header"><div class="fd-packet-head__box"><p class="fd-packet-org">'+fdEsc(FD_CARE_PACKET_ORG)+
    (ctx.unitName?' · '+fdEsc(ctx.unitName):'')+'</p>'+fdCarePacketHeading(hb,1,'fd-packet-title',FD_CARE_PACKET_TITLE)+'</div></header>'));
  for(i=0;i<payload.inserts.length;i++){
    ins=payload.inserts[i];
    if(!fdCarePacketInsertOn(state,ins))continue;
    if(ins.id==='intro')intro=ins;else if(ins.id==='week')week=ins;else rest.push(ins);
  }
  if(intro)units=units.concat(fdCarePacketInsertUnits(intro,payload,ctx,st,hb,mode));
  crisisUnit=fdCarePacketCrisisUnit(payload,ctx,st,hb);
  units.push(crisisUnit);
  if(week)units=units.concat(fdCarePacketInsertUnits(week,payload,ctx,st,hb,mode));

  /* A bordered element is never a unit root: the unit is a plain wrapper that keeps its own bottom padding, because the
     measurer reads boxes and a margin is not in one. */
  units.push(fdCarePacketUnit('res-head',null,true,'<div class="fd-packet-sechead">'+fdCarePacketHeading(hb,2,'fd-packet-sec','Places that can help')+'</div>'));
  if(mode==='review')units.push(fdCarePacketUnit('res-tip',null,true,'<div class="fd-packet-tipwrap" data-fd-packet-unit="tip"><p class="fd-packet-tip"><b>Tick the ones you want to try.</b> Put an X through any that do not fit. We will keep what you tick for the final copy.</p></div>'));
  cats=(data&&data.categories)||[];
  for(i=0,k=0;i<cats.length;i++){
    members=[];
    for(j=0;j<live.length;j++){
      if(byId[live[j]].category!==cats[i].id)continue;
      item=fdCarePacketListing(byId[live[j]],payload,out);
      if(item)members.push(item);
    }
    if(!members.length)continue;
    label=fdCarePacketStrip(cats[i].label||cats[i].id);
    if(fdCarePacketForbidden(label)||fdCarePacketCrisisHit(label,payload))label='Other resources';
    groups.push({label:label,items:members});
    units.push(fdCarePacketUnit('cat-'+i,null,true,'<p class="fd-packet-cat" data-fd-packet-unit="cat">'+fdEsc(label)+'</p>'));
    for(j=0;j<members.length;j++){
      units.push(fdCarePacketListingUnit(members[j],k++,mode,hb));
      if(members[j].address)addresses.push({name:members[j].name,url:members[j].address});
    }
  }
  for(i=0;i<rest.length;i++)units=units.concat(fdCarePacketInsertUnits(rest[i],payload,ctx,st,hb,mode));
  if(st.crisis)return fdCarePacketFail('CRISIS_UNAVAILABLE','A crisis contact in this packet could not be filled in, so it cannot print. Reload the page and try again.');
  if(st.other)return fdCarePacketFail('PAGES_UNAVAILABLE','A standard page could not be built, so this packet cannot print.');
  if(!fdCarePacketCheckCrisis(units,payload))return fdCarePacketFail('CRISIS_UNAVAILABLE','A required crisis line is missing from the packet, so it cannot print.');
  groupCount=state.ids.length;
  if(data&&data.partial&&groupCount>live.length)out.blockers.push({code:'HIDDEN_LISTINGS',id:'',message:(groupCount-live.length)+' saved listing'+(groupCount-live.length===1?' is':'s are')+' hidden while the directory is incomplete. Reload the directory before printing.'});
  if(mode==='final'&&!ctx.unitPhone)out.blockers.push({code:'UNIT_PHONE',id:'',message:'Enter the unit phone number so the Final copy can tell patients how to reach the unit.'});
  return {ok:true,mode:mode,units:units,groups:groups,blockers:out.blockers,withheld:out.withheld,addresses:addresses,ctx:ctx,live:live,hb:hb,
    date:fdCarePacketDate(data&&data.generatedAt),checkedOn:fdCarePacketDate(payload.checkedOn)};
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
    (model.checkedOn?'<p>Helpline numbers checked against official sources, as of '+fdEsc(model.checkedOn)+'.</p>':'')+
    '<p class="fd-packet-pnum">Page '+n+' of '+total+'</p></footer>';
}
/* A hidden box with the sheet's exact width and typography, in the same CSS context the paper uses. It is
   zero-sized and clipped, so no screen reader reads it and it adds no scroll, and it is gone before the task ends. */
function fdCarePacketHidden(inner){
  var wrap;
  if(typeof document==='undefined'||!document.body)return null;
  wrap=document.createElement('div');
  wrap.className='fd-packet-measurewrap';
  wrap.setAttribute('aria-hidden','true');
  wrap.setAttribute('inert','');
  wrap.innerHTML='<div class="fd-packet-sheet fd-packet-sheet--paper">'+inner+'</div>';
  document.body.appendChild(wrap);
  return wrap;
}
function fdCarePacketDrop(wrap){if(wrap&&wrap.parentNode)wrap.parentNode.removeChild(wrap);}
/* The empty body gives the capacity; the units give their heights. */
function fdCarePacketMeasureDom(units,info){
  var wrap=fdCarePacketHidden('<article class="fd-packet-page">'+fdCarePacketBandHtml(info.mode)+'<div class="fd-packet-body"></div>'+fdCarePacketFootHtml(info,9,9)+'</article>'),body,kids,heights=[],cap=0,html='',i;
  if(!wrap)return null;
  try{
    body=wrap.querySelector('.fd-packet-body');
    cap=body.getBoundingClientRect().height;
    for(i=0;i<units.length;i++)html+=units[i].html;
    body.innerHTML=html;
    kids=body.children;
    if(kids.length!==units.length)return null;
    for(i=0;i<kids.length;i++)heights.push(kids[i].getBoundingClientRect().height);
  }finally{
    fdCarePacketDrop(wrap);
  }
  return {heights:heights,capacity:cap};
}
/* The check after layout: the pages as they will print, laid out once more, must each be no taller than a sheet and
   no wider than one. Pages are min-height, so a page that outgrew its sheet GROWS (it is never clipped) and this is
   what notices. (A scrollHeight test on the body would be vacuous: the body grows with its content.) null = could
   not check. Without a document there is nothing to check, which is not a failure. */
function fdCarePacketVerifyDom(html,count){
  var wrap,pages,i,ok=true;
  if(typeof document==='undefined'||!document.body)return {ok:true,checked:false};
  wrap=fdCarePacketHidden(html);
  try{
    pages=wrap.querySelectorAll('.fd-packet-page');
    if(pages.length!==count)return null;
    for(i=0;i<pages.length;i++)if(pages[i].getBoundingClientRect().height>FD_CARE_PACKET_SHEET_PX+1||pages[i].scrollWidth>pages[i].clientWidth+1)ok=false;
  }finally{
    fdCarePacketDrop(wrap);
  }
  return {ok:ok,checked:true};
}

/* ---- the sheet ---------------------------------------------------------------------------------------------- */
function fdCarePacketSheet(state,data,payload,opts){
  var model=fdCarePacketBuild(state,data,payload,opts),measure,measured,pack,html='',i,p,j,crisisAt=-1,pageOf=-1,u,checked;
  if(!model.ok)return model;
  measure=opts&&typeof opts.measure==='function'?opts.measure:(typeof document!=='undefined'?fdCarePacketMeasureDom:fdCarePacketEstimate);
  /* Layout touches the document; anything it throws is a failure to measure, which refuses, never an exception in a handler. */
  try{measured=measure(model.units,model);}catch(measureError){measured=null;}
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
  if(!(opts&&opts.verify===false)){
    try{checked=fdCarePacketVerifyDom(html,pack.count);}catch(verifyError){checked=null;}
    if(!checked)return fdCarePacketFail('MEASURE_FAILED','The packet could not be checked after layout, so it cannot print.');
    if(!checked.ok)return fdCarePacketFail('OVERFLOW','A page does not fit its sheet, so this packet cannot print.');
  }
  return {ok:true,code:'',message:'',pages:pack.pages,count:pack.count,html:html,mode:model.mode,blockers:model.blockers,withheld:model.withheld,addresses:model.addresses};
}

/* ---- the copy for the After Visit Summary ------------------------------------------------------------------- */
/* Plain text, Final only: a Review draft never goes into the record. Raw strings (never escaped), the same cleaned
   listings as the paper, crisis lines first, no unit details. It is going INTO the medical record, so it does not
   say the page is "not a medical record". */
function fdCarePacketText(state,data,payload,opts){
  var model=fdCarePacketBuild(state,data,payload,opts),lines=[],i,j,g,item,bits,line,contact,note;
  if(!model.ok)return model;
  if(model.mode!=='final')return fdCarePacketFail('NOT_FINAL','Switch to the Final copy to copy text for the After Visit Summary.');
  note=fdCarePacketFill(payload.crisisCopy.note,{unitName:'',unitPhone:'',contacts:payload.contacts},'text');
  if(!note.ok)return fdCarePacketFail('CRISIS_UNAVAILABLE','A crisis contact could not be filled in, so this cannot be copied.');
  lines.push(FD_CARE_PACKET_TITLE,'',fdCarePacketStrip(payload.crisisCopy.heading));
  for(i=0;i<payload.crisis.length;i++){
    line=payload.crisis[i];contact=payload.contacts[line.ref];
    lines.push(fdCarePacketStrip(line.label)+': '+fdCarePacketStrip(contact.contact)+(contact.availability?' ('+fdCarePacketStrip(contact.availability)+')':''));
  }
  lines.push(fdCarePacketStrip(note.out),'','Places that can help');
  for(g=0;g<model.groups.length;g++){
    lines.push('',model.groups[g].label);
    for(j=0;j<model.groups[g].items.length;j++){
      item=model.groups[g].items[j];
      bits=[item.name];
      if(item.phone)bits.push(item.phone);
      if(item.host)bits.push(item.host);
      if(item.area)bits.push(item.area);
      lines.push('- '+bits.join(' · ')+(item.desc.text?'. '+item.desc.text:''));
    }
  }
  lines.push('',(model.date?'Listings copied from the ReConnect community directory on '+model.date+'. ':'Listings copied from the ReConnect community directory. ')+'Call ahead to confirm hours, cost and availability.');
  return {ok:true,code:'',message:'',text:lines.join('\n'),blockers:model.blockers,withheld:model.withheld,mode:model.mode};
}
