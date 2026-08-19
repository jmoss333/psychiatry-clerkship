/* Rotation-edition trust boundary. Pure: no DOM, storage, clock, or network access. */
var FD_EDITION_RULES=(function(){
  function freeze(value){
    var key;
    if(value&&typeof value==='object'&&!Object.isFrozen(value)){
      Object.freeze(value);
      for(key in value){ if(Object.prototype.hasOwnProperty.call(value,key)) freeze(value[key]); }
    }
    return value;
  }
  return freeze({
    format:'cw-rotation-edition',schemaVersion:1,
    maxConfigBytes:12288,maxUrlChars:16000,maxQrChars:1800,
    maxChecklist:24,maxResources:12,maxUrl:2048,
    maxTitle:100,maxRationale:280,maxOrientation:600,
    priorities:['required','recommended','optional'],
    paths:{ms3:{id:'ms3-six-week',weeks:6,code:'MS3'},
           resident:{id:'resident-four-week',weeks:4,code:'RES'}},
    patterns:{locationCode:'^[A-Z0-9]{2,8}$',revision:'^[0-9a-f]{40}$'}
  });
}());

var FD_EDITION_DANGEROUS=(function(){
  var keys=Object.create(null);
  keys.__proto__=true; keys.constructor=true; keys.prototype=true;
  return keys;
}());
var FD_EDITION_MAX_ARRAY_ITEMS=FD_EDITION_RULES.maxConfigBytes;
var FD_EDITION_URL_DECODE_PASSES=4;
var FD_EDITION_CONFIG_FIELDS=['audience','pathId','editionNumber','createdAgainstCoreRevision','card','pathItems','localOrientation','changeNote'];
var FD_EDITION_CARD_FIELDS=['title','locationName','locationCode','curatorName','curatorRole','rotationStart','rotationEnd','lastVerified'];
var FD_EDITION_PATH_FIELDS=['instanceId','ref','week','order','priority','rationale'];
var FD_EDITION_ORIENTATION_FIELDS=['firstDayArrival','dailySchedule','roundsWorkflow','presentationExpectations','documentationExpectations','attendanceExpectations','feedbackProcess','accessPreparation','contacts','checklist','resources'];
var FD_EDITION_CONTACT_FIELDS=['role','directoryUrl'];
var FD_EDITION_CHECKLIST_FIELDS=['id','label','priority'];
var FD_EDITION_RESOURCE_FIELDS=['id','title','url','priority','week','rationale'];

function fdEditionFinding(code,path,message,blocking){
  return {code:code,path:path,message:message,blocking:blocking!==false};
}

function fdEditionObject(value){
  if(value===null||typeof value!=='object') return false;
  try{ return !Array.isArray(value); }
  catch(ignoreArrayClassification){ return false; }
}

function fdEditionPointer(path,part){
  return path+'/'+String(part).replace(/~/g,'~0').replace(/\//g,'~1');
}

function fdEditionAllowedMap(fields){
  var map=Object.create(null),i;
  for(i=0;i<fields.length;i++) map[fields[i]]=true;
  return map;
}

function fdEditionOwnKeys(value){
  return Reflect.ownKeys(value);
}

function fdEditionReadObject(value,fields,path,errors){
  var out={},allowed=fdEditionAllowedMap(fields),present=Object.create(null),keys,i,key,descriptor;
  if(!fdEditionObject(value)){
    errors.push(fdEditionFinding('EDITION_SCHEMA',path,'An object with the required fields is required.'));
    return null;
  }
  try{ keys=fdEditionOwnKeys(value); }
  catch(ignore){ errors.push(fdEditionFinding('EDITION_SCHEMA',path,'The object could not be read safely.')); return null; }
  for(i=0;i<keys.length;i++){
    key=keys[i];
    if(typeof key!=='string'||FD_EDITION_DANGEROUS[key]||!allowed[key]){
      errors.push(fdEditionFinding('EDITION_SCHEMA',path,'Only documented fields are allowed.'));
      continue;
    }
    try{ descriptor=Object.getOwnPropertyDescriptor(value,key); }
    catch(ignoreDescriptor){ descriptor=null; }
    if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value')){
      errors.push(fdEditionFinding('EDITION_SCHEMA',path,'Fields must be plain data values.'));
      continue;
    }
    present[key]=true;
    out[key]=descriptor.value;
  }
  for(i=0;i<fields.length;i++){
    if(!present[fields[i]]){
      errors.push(fdEditionFinding('EDITION_SCHEMA',path,'All required fields must be present.'));
    }
  }
  return out;
}

function fdEditionString(value,path,errors){
  if(typeof value!=='string'){
    errors.push(fdEditionFinding('EDITION_SCHEMA',path,'A text value is required.'));
    return '';
  }
  try{ return value.replace(/\r\n?/g,'\n').trim().normalize('NFC'); }
  catch(ignore){ errors.push(fdEditionFinding('EDITION_SCHEMA',path,'The text value is not valid Unicode.')); return ''; }
}

function fdEditionArray(value,path,errors){
  var keys,out,i,key,descriptor,lengthDescriptor,length,data=Object.create(null),isArray=false;
  try{ isArray=Array.isArray(value); }
  catch(ignoreArrayClassification){ isArray=false; }
  if(!isArray){
    errors.push(fdEditionFinding('EDITION_SCHEMA',path,'A list is required.'));
    return [];
  }
  try{ lengthDescriptor=Object.getOwnPropertyDescriptor(value,'length'); }
  catch(ignoreLength){ lengthDescriptor=null; }
  if(!lengthDescriptor||!Object.prototype.hasOwnProperty.call(lengthDescriptor,'value')||
     typeof lengthDescriptor.value!=='number'||!isFinite(lengthDescriptor.value)||
     Math.floor(lengthDescriptor.value)!==lengthDescriptor.value||lengthDescriptor.value<0){
    errors.push(fdEditionFinding('EDITION_SCHEMA',path,'The list length is invalid.'));
    return [];
  }
  length=lengthDescriptor.value;
  if(length>FD_EDITION_MAX_ARRAY_ITEMS){
    errors.push(fdEditionFinding('EDITION_SIZE',path,'The list is too large to process safely.'));
    return [];
  }
  try{ keys=fdEditionOwnKeys(value); }
  catch(ignoreKeys){ errors.push(fdEditionFinding('EDITION_SCHEMA',path,'The list could not be read safely.')); return []; }
  for(i=0;i<keys.length;i++){
    key=keys[i];
    if(key==='length') continue;
    if(typeof key!=='string'||!/^(?:0|[1-9][0-9]*)$/.test(key)||Number(key)>=length){
      errors.push(fdEditionFinding('EDITION_SCHEMA',path,'Lists must not contain named fields.'));
      continue;
    }
    try{ descriptor=Object.getOwnPropertyDescriptor(value,key); }
    catch(ignoreDescriptor){ descriptor=null; }
    if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value'))
      errors.push(fdEditionFinding('EDITION_SCHEMA',path,'Lists must contain plain data values.'));
    else data[key]=descriptor.value;
  }
  out=[];
  for(i=0;i<length;i++){
    if(!Object.prototype.hasOwnProperty.call(data,String(i))){
      errors.push(fdEditionFinding('EDITION_SCHEMA',path,'Lists must contain plain data values.'));
      out.push(undefined);
    }else out.push(data[String(i)]);
  }
  return out;
}

function fdEditionNumber(value,path,errors){
  if(typeof value!=='number'||!isFinite(value)||Math.floor(value)!==value){
    errors.push(fdEditionFinding('EDITION_SCHEMA',path,'A whole number is required.'));
    return 0;
  }
  return value;
}

function fdEditionNormalizeConfig(config){
  var errors=[],source=fdEditionReadObject(config,FD_EDITION_CONFIG_FIELDS,'/config',errors),out={};
  var card,orientation,list,item,i;
  if(!source) return {ok:false,errors:errors};
  out.audience=fdEditionString(source.audience,'/config/audience',errors);
  out.pathId=fdEditionString(source.pathId,'/config/pathId',errors);
  out.editionNumber=fdEditionNumber(source.editionNumber,'/config/editionNumber',errors);
  out.createdAgainstCoreRevision=fdEditionString(source.createdAgainstCoreRevision,'/config/createdAgainstCoreRevision',errors);

  source.card=fdEditionReadObject(source.card,FD_EDITION_CARD_FIELDS,'/config/card',errors);
  if(source.card){
    card={};
    for(i=0;i<FD_EDITION_CARD_FIELDS.length;i++){
      item=FD_EDITION_CARD_FIELDS[i];
      card[item]=fdEditionString(source.card[item],fdEditionPointer('/config/card',item),errors);
    }
    card.locationCode=card.locationCode.toUpperCase();
    out.card=card;
  }

  out.pathItems=[];
  list=fdEditionArray(source.pathItems,'/config/pathItems',errors);
  for(i=0;i<list.length;i++){
    item=fdEditionReadObject(list[i],FD_EDITION_PATH_FIELDS,fdEditionPointer('/config/pathItems',i),errors);
    if(item) out.pathItems.push({
      instanceId:fdEditionString(item.instanceId,fdEditionPointer('/config/pathItems/'+i,'instanceId'),errors),
      ref:fdEditionString(item.ref,fdEditionPointer('/config/pathItems/'+i,'ref'),errors),
      week:fdEditionNumber(item.week,fdEditionPointer('/config/pathItems/'+i,'week'),errors),
      order:fdEditionNumber(item.order,fdEditionPointer('/config/pathItems/'+i,'order'),errors),
      priority:fdEditionString(item.priority,fdEditionPointer('/config/pathItems/'+i,'priority'),errors),
      rationale:fdEditionString(item.rationale,fdEditionPointer('/config/pathItems/'+i,'rationale'),errors)
    });
  }

  source.localOrientation=fdEditionReadObject(source.localOrientation,FD_EDITION_ORIENTATION_FIELDS,'/config/localOrientation',errors);
  if(source.localOrientation){
    orientation={};
    for(i=0;i<8;i++){
      item=FD_EDITION_ORIENTATION_FIELDS[i];
      orientation[item]=fdEditionString(source.localOrientation[item],fdEditionPointer('/config/localOrientation',item),errors);
    }
    orientation.contacts=[];
    list=fdEditionArray(source.localOrientation.contacts,'/config/localOrientation/contacts',errors);
    for(i=0;i<list.length;i++){
      item=fdEditionReadObject(list[i],FD_EDITION_CONTACT_FIELDS,fdEditionPointer('/config/localOrientation/contacts',i),errors);
      if(item) orientation.contacts.push({
        role:fdEditionString(item.role,'/config/localOrientation/contacts/'+i+'/role',errors),
        directoryUrl:fdEditionString(item.directoryUrl,'/config/localOrientation/contacts/'+i+'/directoryUrl',errors)
      });
    }
    orientation.checklist=[];
    list=fdEditionArray(source.localOrientation.checklist,'/config/localOrientation/checklist',errors);
    for(i=0;i<list.length;i++){
      item=fdEditionReadObject(list[i],FD_EDITION_CHECKLIST_FIELDS,fdEditionPointer('/config/localOrientation/checklist',i),errors);
      if(item) orientation.checklist.push({
        id:fdEditionString(item.id,'/config/localOrientation/checklist/'+i+'/id',errors),
        label:fdEditionString(item.label,'/config/localOrientation/checklist/'+i+'/label',errors),
        priority:fdEditionString(item.priority,'/config/localOrientation/checklist/'+i+'/priority',errors)
      });
    }
    orientation.resources=[];
    list=fdEditionArray(source.localOrientation.resources,'/config/localOrientation/resources',errors);
    for(i=0;i<list.length;i++){
      item=fdEditionReadObject(list[i],FD_EDITION_RESOURCE_FIELDS,fdEditionPointer('/config/localOrientation/resources',i),errors);
      if(item) orientation.resources.push({
        id:fdEditionString(item.id,'/config/localOrientation/resources/'+i+'/id',errors),
        title:fdEditionString(item.title,'/config/localOrientation/resources/'+i+'/title',errors),
        url:fdEditionString(item.url,'/config/localOrientation/resources/'+i+'/url',errors),
        priority:fdEditionString(item.priority,'/config/localOrientation/resources/'+i+'/priority',errors),
        week:fdEditionNumber(item.week,'/config/localOrientation/resources/'+i+'/week',errors),
        rationale:fdEditionString(item.rationale,'/config/localOrientation/resources/'+i+'/rationale',errors)
      });
    }
    out.localOrientation=orientation;
  }
  out.changeNote=fdEditionString(source.changeNote,'/config/changeNote',errors);
  return errors.length?{ok:false,errors:errors}:{ok:true,value:out};
}

function fdEditionCanonicalJson(value){
  var seen=[];
  function encode(current,depth){
    var keys,out,i,key,descriptor,lengthDescriptor,length,data;
    if(depth>64) throw new Error('Canonical JSON depth is invalid.');
    if(current===null) return 'null';
    if(typeof current==='string'||typeof current==='boolean') return JSON.stringify(current);
    if(typeof current==='number'){
      if(!isFinite(current)) throw new Error('Canonical JSON number is invalid.');
      return JSON.stringify(current);
    }
    if(typeof current!=='object') throw new Error('Canonical JSON value is invalid.');
    if(seen.indexOf(current)!==-1) throw new Error('Canonical JSON cycle is invalid.');
    seen.push(current);
    try{ descriptor=Array.isArray(current); }
    catch(ignoreArrayClassification){ throw new Error('Canonical JSON value is invalid.'); }
    if(descriptor){
      try{ lengthDescriptor=Object.getOwnPropertyDescriptor(current,'length'); }
      catch(ignoreLength){ lengthDescriptor=null; }
      if(!lengthDescriptor||!Object.prototype.hasOwnProperty.call(lengthDescriptor,'value')||
         lengthDescriptor.value>FD_EDITION_MAX_ARRAY_ITEMS) throw new Error('Canonical JSON array is invalid.');
      length=lengthDescriptor.value; data=Object.create(null); out=[];
      try{ keys=fdEditionOwnKeys(current); }
      catch(ignoreArrayKeys){ throw new Error('Canonical JSON array is invalid.'); }
      for(i=0;i<keys.length;i++){
        key=keys[i];
        if(key==='length') continue;
        if(typeof key!=='string'||!/^(?:0|[1-9][0-9]*)$/.test(key)||Number(key)>=length)
          throw new Error('Canonical JSON array key is invalid.');
        try{ descriptor=Object.getOwnPropertyDescriptor(current,key); }
        catch(ignoreArrayDescriptor){ descriptor=null; }
        if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value'))
          throw new Error('Canonical JSON array value is invalid.');
        data[key]=descriptor.value;
      }
      for(i=0;i<length;i++){
        if(!Object.prototype.hasOwnProperty.call(data,String(i))) throw new Error('Canonical JSON sparse array is invalid.');
        out.push(encode(data[String(i)],depth+1));
      }
      seen.pop();
      return '['+out.join(',')+']';
    }
    try{ keys=fdEditionOwnKeys(current); }
    catch(ignoreObjectKeys){ throw new Error('Canonical JSON object is invalid.'); }
    for(i=0;i<keys.length;i++) if(typeof keys[i]!=='string') throw new Error('Canonical JSON symbol key is invalid.');
    keys.sort(); out=[];
    for(i=0;i<keys.length;i++){
      key=keys[i];
      if(FD_EDITION_DANGEROUS[key]) throw new Error('Canonical JSON key is invalid.');
      try{ descriptor=Object.getOwnPropertyDescriptor(current,key); }
      catch(ignoreObjectDescriptor){ descriptor=null; }
      if(!descriptor||!descriptor.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))
        throw new Error('Canonical JSON object value is invalid.');
      out.push(JSON.stringify(key)+':'+encode(descriptor.value,depth+1));
    }
    seen.pop();
    return '{'+out.join(',')+'}';
  }
  return encode(value,0);
}

function fdEditionBase64urlEncode(bytes){
  var binary='',i,valid=false;
  try{ valid=ArrayBuffer.isView(bytes)&&bytes instanceof Uint8Array; }
  catch(ignoreByteClassification){ valid=false; }
  if(!valid) throw new Error('Base64url input must be bytes.');
  try{
    for(i=0;i<bytes.length;i++) binary+=String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }catch(ignoreBytes){ throw new Error('Base64url input must be bytes.'); }
}

function fdEditionBase64urlDecode(text,maxBytes){
  var padded,binary,out,i;
  if(typeof text!=='string'||!text||!/^[A-Za-z0-9_-]+$/.test(text)||text.length%4===1)
    throw new Error('Invalid base64url payload.');
  padded=text.replace(/-/g,'+').replace(/_/g,'/');
  while(padded.length%4) padded+='=';
  try{ binary=atob(padded); }catch(ignore){ throw new Error('Invalid base64url payload.'); }
  if(typeof maxBytes==='number'&&binary.length>maxBytes) throw new Error('Invalid base64url size.');
  out=new Uint8Array(binary.length);
  for(i=0;i<binary.length;i++) out[i]=binary.charCodeAt(i);
  if(fdEditionBase64urlEncode(out)!==text) throw new Error('Invalid base64url payload.');
  return out;
}

function fdEditionDigest(preDigestObject,subtle){
  var bytes,digestMethod,request;
  try{ digestMethod=subtle&&subtle.digest; }
  catch(ignoreMethod){ return Promise.reject(new Error('SHA-256 is unavailable.')); }
  if(typeof digestMethod!=='function') return Promise.reject(new Error('SHA-256 is unavailable.'));
  try{ bytes=new TextEncoder().encode(fdEditionCanonicalJson(preDigestObject)); }
  catch(error){ return Promise.reject(new Error('Digest input is invalid.')); }
  try{ request=digestMethod.call(subtle,'SHA-256',bytes); }
  catch(ignoreDigest){ return Promise.reject(new Error('SHA-256 is unavailable.')); }
  return Promise.resolve(request).then(function(buffer){
    if(!(buffer instanceof ArrayBuffer)||buffer.byteLength!==32) throw new Error('SHA-256 result is invalid.');
    return 'sha256-'+fdEditionBase64urlEncode(new Uint8Array(buffer));
  },function(){ throw new Error('SHA-256 is unavailable.'); });
}

function fdEditionDigestEqual(expected,actual){
  var left,right,diff=0,i;
  if(typeof expected!=='string'||typeof actual!=='string'||expected.indexOf('sha256-')!==0||actual.indexOf('sha256-')!==0) return false;
  try{
    left=fdEditionBase64urlDecode(expected.slice(7),32);
    right=fdEditionBase64urlDecode(actual.slice(7),32);
  }catch(ignore){ return false; }
  if(left.length!==32||right.length!==32) return false;
  for(i=0;i<32;i++) diff|=left[i]^right[i];
  return diff===0;
}

function fdEditionFingerprint(config,digest){
  var bytes,value,alphabet='0123456789ABCDEFGHJKMNPQRSTVWXYZ',token='',i,path;
  var audienceDescriptor,cardDescriptor,locationDescriptor,card;
  if(typeof digest!=='string'||digest.indexOf('sha256-')!==0||!fdEditionObject(config)) return '';
  try{ bytes=fdEditionBase64urlDecode(digest.slice(7),32); }
  catch(ignore){ return ''; }
  try{
    audienceDescriptor=Object.getOwnPropertyDescriptor(config,'audience');
    cardDescriptor=Object.getOwnPropertyDescriptor(config,'card');
  }catch(ignoreConfig){ return ''; }
  if(bytes.length!==32||!audienceDescriptor||!Object.prototype.hasOwnProperty.call(audienceDescriptor,'value')||
     !cardDescriptor||!Object.prototype.hasOwnProperty.call(cardDescriptor,'value')||!fdEditionObject(cardDescriptor.value)) return '';
  card=cardDescriptor.value;
  try{ locationDescriptor=Object.getOwnPropertyDescriptor(card,'locationCode'); }
  catch(ignoreCard){ return ''; }
  if(typeof audienceDescriptor.value!=='string'||!Object.prototype.hasOwnProperty.call(FD_EDITION_RULES.paths,audienceDescriptor.value)) return '';
  path=FD_EDITION_RULES.paths[audienceDescriptor.value];
  if(!path||!locationDescriptor||!Object.prototype.hasOwnProperty.call(locationDescriptor,'value')||typeof locationDescriptor.value!=='string') return '';
  value=Math.floor((bytes[0]*16777216+bytes[1]*65536+bytes[2]*256+bytes[3])/4);
  for(i=5;i>=0;i--) token+=alphabet.charAt(Math.floor(value/Math.pow(32,i))%32);
  return locationDescriptor.value.replace(/\s/g,'').toUpperCase()+'-'+path.code+'-'+token;
}

function fdEditionAdd(errors,condition,code,path,message){
  if(condition) errors.push(fdEditionFinding(code,path,message));
}

function fdEditionValidDate(value){
  var match,date;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  match=value.split('-');
  date=new Date(Date.UTC(Number(match[0]),Number(match[1])-1,Number(match[2])));
  return date.getUTCFullYear()===Number(match[0])&&date.getUTCMonth()===Number(match[1])-1&&date.getUTCDate()===Number(match[2]);
}

function fdEditionTextLength(value){
  return Array.from(value).length;
}

function fdEditionCheckLabel(value,path,errors){
  fdEditionAdd(errors,!value||fdEditionTextLength(value)>FD_EDITION_RULES.maxTitle,'EDITION_SCHEMA',path,'Text must contain 1 to 100 characters.');
}

function fdEditionCheckRationale(value,path,errors){
  fdEditionAdd(errors,fdEditionTextLength(value)>FD_EDITION_RULES.maxRationale,'EDITION_SCHEMA',path,'Text must contain at most 280 characters.');
}

function fdEditionCheckIdentifier(value,path,errors){
  fdEditionAdd(errors,!value||value.length>160||!/^[\x21-\x7E]+$/.test(value),'EDITION_SCHEMA',path,'The identifier must use 1 to 160 visible ASCII characters.');
}

function fdEditionHostnameValid(hostname){
  var labels,i;
  if(!hostname) return false;
  if(/^\[[0-9a-f:.]+\]$/i.test(hostname)) return true;
  if(hostname.length>253) return false;
  labels=hostname.split('.');
  for(i=0;i<labels.length;i++){
    if(!labels[i]||labels[i].length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(labels[i])) return false;
  }
  return true;
}

function fdEditionCheckPriority(value,path,errors){
  fdEditionAdd(errors,FD_EDITION_RULES.priorities.indexOf(value)===-1,'EDITION_SCHEMA',path,'Priority must be required, recommended, or optional.');
}

function fdEditionDecodeUrlComponent(value,queryMode){
  var current=value,next,i;
  for(i=0;i<FD_EDITION_URL_DECODE_PASSES;i++){
    if(queryMode) current=current.replace(/\+/g,' ');
    try{ next=decodeURIComponent(current); }
    catch(ignoreEncoding){ return {ok:false,value:''}; }
    if(next===current) return {ok:true,value:current};
    if(i===FD_EDITION_URL_DECODE_PASSES-1) return {ok:false,value:''};
    current=next;
  }
  return {ok:false,value:''};
}

function fdEditionCheckUrl(value,path,errors,warnings){
  var parsed=null,decoded='',pathPart,queryPart,hashPart;
  try{ parsed=new URL(value); }catch(ignoreUrl){ parsed=null; }
  fdEditionAdd(errors,fdEditionTextLength(value)>FD_EDITION_RULES.maxUrl,'EDITION_URL',path,'URLs must contain at most 2048 characters.');
  fdEditionAdd(errors,!/^https:\/\/[^\s]+$/i.test(value),'EDITION_URL',path,'Only absolute HTTPS URLs are allowed.');
  fdEditionAdd(errors,!parsed||parsed.protocol!=='https:'||!fdEditionHostnameValid(parsed.hostname)||parsed.username!==''||parsed.password!=='','EDITION_URL',path,'The HTTPS URL must contain a valid hostname and no embedded credentials.');
  fdEditionAdd(errors,/[\u0000-\u001f\u007f]/.test(value)||/^https:\/\/[^/\s@]+@/i.test(value),'EDITION_URL',path,'URLs must not contain control characters or embedded credentials.');
  fdEditionAdd(errors,/^(?:javascript|data|vbscript|blob):/i.test(value),'EDITION_URL',path,'Executable and embedded-data URL schemes are not allowed.');
  fdEditionScreenText(value,path,errors,warnings);
  if(parsed){
    pathPart=fdEditionDecodeUrlComponent(parsed.pathname,false);
    queryPart=fdEditionDecodeUrlComponent(parsed.search,true);
    hashPart=fdEditionDecodeUrlComponent(parsed.hash,false);
    if(!pathPart.ok||!queryPart.ok||!hashPart.ok){
      errors.push(fdEditionFinding('EDITION_URL',path,'URL encoding must be valid and contain no excessive nested layers.'));
      return;
    }
    decoded=pathPart.value+'\n'+queryPart.value+'\n'+hashPart.value;
    fdEditionScreenText(decoded,path,errors,warnings);
  }
}

function fdEditionScreenText(value,path,errors,warnings){
  var blocking=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|<\/?[a-z][^>]*>|\bon[a-z]+\s*=|(?:javascript|data|vbscript|blob):|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:pager\s*[:#-]?\s*\d{4,}|(?:call|phone|tel(?:ephone)?)?\s*\+?\d[\d(). -]{6,}\d)\b|\b(?:password|passcode|credential|username|login|api[_ -]?key|secret|token)\s*(?::|=|\bis\b|\bare\b)\s*\S+|\b(?:access|door|badge)\s+code\s*(?::|=|\bis\b|\bare\b)\s*\S+|\bpin\s*(?::|=|\bis\b)\s*\d+|\b\d+(?:\.\d+)?\s*(?:mg|mcg|\u00b5g|g|ml|milligrams?|micrograms?|grams?|millilit(?:er|re)s?|units?|iu)\b/i;
  var advisory=/\b(?:patient\s+(?:identifier|name|record)|credentials?|password|passcode|username|login|api[_ -]?key|secret|token|(?:access|door|badge)\s+code|pin|protocols?|dos(?:e|ing|age)|medication)\b/i;
  if(blocking.test(value)) errors.push(fdEditionFinding('EDITION_TEXT_RISK',path,'Text must not contain direct contact, access, credential, dose, control, HTML, event-handler, or executable content.'));
  else if(advisory.test(value)) warnings.push(fdEditionFinding('EDITION_TEXT_RISK',path,'Review this text for sensitive identifiers, credentials, protocols, or dosing details before publication.',false));
}

function fdEditionValidateConfig(config,index,siteContext){
  var normalized=fdEditionNormalizeConfig(config),errors=[],warnings=[],value,pathRule,i,item,key,seenIds=Object.create(null),orders=Object.create(null),canonicalBytes=0,indexPathValid=true;
  var humanTexts=[];
  if(!normalized.ok) return {ok:false,value:null,errors:normalized.errors,warnings:warnings,canonicalBytes:0};
  value=normalized.value;
  pathRule=FD_EDITION_RULES.paths[value.audience];
  fdEditionAdd(errors,!pathRule,'EDITION_AUDIENCE','/config/audience','The audience must match a supported site.');
  fdEditionAdd(errors,!pathRule||value.pathId!==pathRule.id,'EDITION_AUDIENCE','/config/pathId','The path must match the selected audience.');
  fdEditionAdd(errors,!siteContext||value.audience!==siteContext.audience||value.pathId!==siteContext.pathId,'EDITION_AUDIENCE','/config','The edition must match the current audience and path.');
  indexPathValid=!!(index&&index.path&&pathRule&&index.path.id===pathRule.id&&index.path.weekCount===pathRule.weeks&&Array.isArray(index.weeks)&&index.weeks.length===pathRule.weeks);
  if(indexPathValid){
    for(i=0;i<index.weeks.length;i++){
      if(!index.weeks[i]||index.weeks[i].n!==i+1){ indexPathValid=false; break; }
    }
  }
  fdEditionAdd(errors,!indexPathValid,'EDITION_AUDIENCE','/config/pathId','The current catalog path and duration must match the audience.');
  fdEditionAdd(errors,value.editionNumber<1,'EDITION_SCHEMA','/config/editionNumber','Edition number must be at least 1.');
  fdEditionAdd(errors,!new RegExp(FD_EDITION_RULES.patterns.revision).test(value.createdAgainstCoreRevision),'EDITION_SCHEMA','/config/createdAgainstCoreRevision','The core revision must be a 40-character lowercase hexadecimal revision.');

  if(value.card){
    for(i=0;i<5;i++){ key=FD_EDITION_CARD_FIELDS[i]; fdEditionCheckLabel(value.card[key],'/config/card/'+key,errors); humanTexts.push([value.card[key],'/config/card/'+key]); }
    fdEditionAdd(errors,!new RegExp(FD_EDITION_RULES.patterns.locationCode).test(value.card.locationCode),'EDITION_SCHEMA','/config/card/locationCode','Location code must contain 2 to 8 uppercase letters or digits.');
    for(i=5;i<8;i++) fdEditionAdd(errors,!fdEditionValidDate(value.card[FD_EDITION_CARD_FIELDS[i]]),'EDITION_SCHEMA','/config/card/'+FD_EDITION_CARD_FIELDS[i],'A real calendar date in YYYY-MM-DD form is required.');
    fdEditionAdd(errors,fdEditionValidDate(value.card.rotationStart)&&fdEditionValidDate(value.card.rotationEnd)&&value.card.rotationEnd<value.card.rotationStart,'EDITION_SCHEMA','/config/card/rotationEnd','Rotation end must not be before rotation start.');
  }

  for(i=0;i<value.pathItems.length;i++){
    item=value.pathItems[i];
    fdEditionCheckIdentifier(item.instanceId,'/config/pathItems/'+i+'/instanceId',errors);
    fdEditionCheckIdentifier(item.ref,'/config/pathItems/'+i+'/ref',errors);
    fdEditionAdd(errors,!pathRule||item.week<1||item.week>pathRule.weeks,'EDITION_WEEK','/config/pathItems/'+i+'/week','Week must be within the audience path duration.');
    fdEditionAdd(errors,item.order<1,'EDITION_SCHEMA','/config/pathItems/'+i+'/order','Order must be a positive whole number.');
    fdEditionCheckPriority(item.priority,'/config/pathItems/'+i+'/priority',errors);
    fdEditionCheckRationale(item.rationale,'/config/pathItems/'+i+'/rationale',errors);
    humanTexts.push([item.rationale,'/config/pathItems/'+i+'/rationale']);
    fdEditionAdd(errors,seenIds[item.instanceId],'EDITION_SCHEMA','/config/pathItems/'+i+'/instanceId','Every instance and local identifier must be unique.');
    seenIds[item.instanceId]=true;
    fdEditionAdd(errors,!index||!index.byRef||!Object.prototype.hasOwnProperty.call(index.byRef,item.ref),'EDITION_REF','/config/pathItems/'+i+'/ref','Every core reference must exist in the current catalog.');
    key=String(item.week)+':'+String(item.order);
    fdEditionAdd(errors,orders[key],'EDITION_SCHEMA','/config/pathItems/'+i+'/order','Order values must be unique within each week.');
    orders[key]=true;
  }
  if(pathRule){
    for(i=1;i<=pathRule.weeks;i++){
      var weekOrders=value.pathItems.filter(function(entry){return entry.week===i;}).map(function(entry){return entry.order;}).sort(function(a,b){return a-b;});
      for(var o=0;o<weekOrders.length;o++) fdEditionAdd(errors,weekOrders[o]!==o+1,'EDITION_SCHEMA','/config/pathItems','Order values must be contiguous within each week.');
    }
  }

  if(value.localOrientation){
    for(i=0;i<8;i++){
      key=FD_EDITION_ORIENTATION_FIELDS[i];
      fdEditionAdd(errors,fdEditionTextLength(value.localOrientation[key])>FD_EDITION_RULES.maxOrientation,'EDITION_SCHEMA','/config/localOrientation/'+key,'Orientation text must contain at most 600 characters.');
      humanTexts.push([value.localOrientation[key],'/config/localOrientation/'+key]);
    }
    fdEditionAdd(errors,value.localOrientation.checklist.length>FD_EDITION_RULES.maxChecklist,'EDITION_SIZE','/config/localOrientation/checklist','At most 24 checklist items are allowed.');
    fdEditionAdd(errors,value.localOrientation.resources.length>FD_EDITION_RULES.maxResources,'EDITION_SIZE','/config/localOrientation/resources','At most 12 local resources are allowed.');
    for(i=0;i<value.localOrientation.contacts.length;i++){
      item=value.localOrientation.contacts[i];
      fdEditionCheckLabel(item.role,'/config/localOrientation/contacts/'+i+'/role',errors);
      fdEditionCheckUrl(item.directoryUrl,'/config/localOrientation/contacts/'+i+'/directoryUrl',errors,warnings);
      humanTexts.push([item.role,'/config/localOrientation/contacts/'+i+'/role']);
    }
    for(i=0;i<value.localOrientation.checklist.length;i++){
      item=value.localOrientation.checklist[i];
      fdEditionCheckIdentifier(item.id,'/config/localOrientation/checklist/'+i+'/id',errors);
      fdEditionCheckLabel(item.label,'/config/localOrientation/checklist/'+i+'/label',errors);
      fdEditionCheckPriority(item.priority,'/config/localOrientation/checklist/'+i+'/priority',errors);
      fdEditionAdd(errors,seenIds[item.id],'EDITION_SCHEMA','/config/localOrientation/checklist/'+i+'/id','Every instance and local identifier must be unique.');
      seenIds[item.id]=true; humanTexts.push([item.label,'/config/localOrientation/checklist/'+i+'/label']);
    }
    for(i=0;i<value.localOrientation.resources.length;i++){
      item=value.localOrientation.resources[i];
      fdEditionCheckIdentifier(item.id,'/config/localOrientation/resources/'+i+'/id',errors);
      fdEditionCheckLabel(item.title,'/config/localOrientation/resources/'+i+'/title',errors);
      fdEditionCheckUrl(item.url,'/config/localOrientation/resources/'+i+'/url',errors,warnings);
      fdEditionCheckPriority(item.priority,'/config/localOrientation/resources/'+i+'/priority',errors);
      fdEditionAdd(errors,!pathRule||item.week<1||item.week>pathRule.weeks,'EDITION_WEEK','/config/localOrientation/resources/'+i+'/week','Week must be within the audience path duration.');
      fdEditionCheckRationale(item.rationale,'/config/localOrientation/resources/'+i+'/rationale',errors);
      fdEditionAdd(errors,seenIds[item.id],'EDITION_SCHEMA','/config/localOrientation/resources/'+i+'/id','Every instance and local identifier must be unique.');
      seenIds[item.id]=true;
      humanTexts.push([item.title,'/config/localOrientation/resources/'+i+'/title'],[item.rationale,'/config/localOrientation/resources/'+i+'/rationale']);
    }
  }
  fdEditionCheckRationale(value.changeNote,'/config/changeNote',errors);
  humanTexts.push([value.changeNote,'/config/changeNote']);
  for(i=0;i<humanTexts.length;i++) fdEditionScreenText(humanTexts[i][0],humanTexts[i][1],errors,warnings);
  try{ canonicalBytes=new TextEncoder().encode(fdEditionCanonicalJson(value)).length; }
  catch(ignoreCanonical){ errors.push(fdEditionFinding('EDITION_SCHEMA','/config','The configuration cannot be serialized safely.')); }
  fdEditionAdd(errors,canonicalBytes>FD_EDITION_RULES.maxConfigBytes,'EDITION_SIZE','/config','The canonical configuration must be at most 12 KiB.');
  return {ok:errors.length===0,value:value,errors:errors,warnings:warnings,canonicalBytes:canonicalBytes};
}

function fdEditionFailure(code,path,message,warnings,canonicalBytes){
  return {ok:false,envelope:null,payload:null,config:null,fingerprint:'',canonicalBytes:canonicalBytes||0,errors:[fdEditionFinding(code,path,message)],warnings:warnings||[]};
}

function fdEditionCreateEnvelope(config,index,siteContext,subtle){
  var checked=fdEditionValidateConfig(config,index,siteContext),pre;
  if(!checked.ok) return Promise.resolve({ok:false,envelope:null,payload:null,config:null,fingerprint:'',canonicalBytes:checked.canonicalBytes,errors:checked.errors,warnings:checked.warnings});
  pre={format:FD_EDITION_RULES.format,schemaVersion:FD_EDITION_RULES.schemaVersion,config:checked.value};
  return fdEditionDigest(pre,subtle).then(function(digest){
    var envelope={format:pre.format,schemaVersion:pre.schemaVersion,config:pre.config,digest:digest};
    var payload=fdEditionBase64urlEncode(new TextEncoder().encode(fdEditionCanonicalJson(envelope)));
    return {ok:true,envelope:envelope,payload:payload,config:checked.value,fingerprint:fdEditionFingerprint(checked.value,digest),canonicalBytes:checked.canonicalBytes,errors:[],warnings:checked.warnings};
  },function(){ return fdEditionFailure('EDITION_DIGEST','/digest','SHA-256 is unavailable in this browser.',checked.warnings,checked.canonicalBytes); });
}

function fdEditionValidateEnvelope(envelope,index,siteContext,subtle){
  var errors=[],source=fdEditionReadObject(envelope,['format','schemaVersion','config','digest'],'/',errors),checked,normalized,digestPattern=/^sha256-[A-Za-z0-9_-]{43}$/;
  if(!source) return Promise.resolve({ok:false,envelope:null,config:null,fingerprint:'',errors:errors,warnings:[]});
  if(typeof source.format!=='string'||source.format!==FD_EDITION_RULES.format) errors.push(fdEditionFinding('EDITION_SCHEMA','/format','The edition format is unsupported.'));
  if(source.schemaVersion!==FD_EDITION_RULES.schemaVersion) errors.push(fdEditionFinding('EDITION_SCHEMA','/schemaVersion','The edition schema version is unsupported.'));
  if(typeof source.digest!=='string'||!digestPattern.test(source.digest)) errors.push(fdEditionFinding('EDITION_DIGEST','/digest','The SHA-256 digest has an invalid form.'));
  checked=fdEditionValidateConfig(source.config,index,siteContext);
  errors=errors.concat(checked.errors);
  normalized={format:source.format,schemaVersion:source.schemaVersion,config:checked.value,digest:source.digest};
  if(errors.length) return Promise.resolve({ok:false,envelope:normalized,config:checked.value,fingerprint:'',errors:errors,warnings:checked.warnings});
  return fdEditionDigest({format:normalized.format,schemaVersion:normalized.schemaVersion,config:normalized.config},subtle).then(function(actual){
    var valid=fdEditionDigestEqual(normalized.digest,actual);
    var digestErrors=valid?[]:[fdEditionFinding('EDITION_DIGEST','/digest','The edition digest does not match its content.')];
    return {ok:valid,envelope:normalized,config:normalized.config,fingerprint:valid?fdEditionFingerprint(normalized.config,normalized.digest):'',errors:digestErrors,warnings:checked.warnings};
  },function(){ return {ok:false,envelope:normalized,config:normalized.config,fingerprint:'',errors:[fdEditionFinding('EDITION_DIGEST','/digest','SHA-256 is unavailable in this browser.')],warnings:checked.warnings}; });
}

function fdEditionDecodePayload(payload,index,siteContext,subtle,totalUrlLength){
  var bytes,text,envelope;
  if(typeof totalUrlLength!=='number'||!isFinite(totalUrlLength)||Math.floor(totalUrlLength)!==totalUrlLength||totalUrlLength<0||totalUrlLength>FD_EDITION_RULES.maxUrlChars)
    return Promise.resolve(fdEditionFailure('EDITION_URL','/','The complete edition URL must contain at most 16000 characters.'));
  if(typeof payload==='string'&&(payload.length>totalUrlLength||payload.length>FD_EDITION_RULES.maxUrlChars))
    return Promise.resolve(fdEditionFailure('EDITION_URL','/','The edition payload length must fit within the complete URL limit.'));
  try{
    bytes=fdEditionBase64urlDecode(payload,FD_EDITION_RULES.maxUrlChars);
    text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    envelope=JSON.parse(text);
  }catch(ignore){ return Promise.resolve(fdEditionFailure('EDITION_SCHEMA','/','The edition payload is malformed.')); }
  return fdEditionValidateEnvelope(envelope,index,siteContext,subtle);
}

function fdEditionDiagnosticVersion(result){
  var envelopeDescriptor,versionDescriptor,value;
  if(!fdEditionObject(result)) return null;
  try{ envelopeDescriptor=Object.getOwnPropertyDescriptor(result,'envelope'); }
  catch(ignoreEnvelope){ return null; }
  if(!envelopeDescriptor||!Object.prototype.hasOwnProperty.call(envelopeDescriptor,'value')||
     !fdEditionObject(envelopeDescriptor.value)) return null;
  try{ versionDescriptor=Object.getOwnPropertyDescriptor(envelopeDescriptor.value,'schemaVersion'); }
  catch(ignoreVersion){ return null; }
  if(!versionDescriptor||!Object.prototype.hasOwnProperty.call(versionDescriptor,'value')) return null;
  value=versionDescriptor.value;
  if(typeof value!=='number'||!isFinite(value)||Math.floor(value)!==value||value<1||value>2147483647) return null;
  return value;
}

function fdEditionDiagnostic(result,siteContext){
  var code='EDITION_SCHEMA',fingerprint='',currentCoreRevision='';
  var errorsDescriptor,lengthDescriptor,firstDescriptor,codeDescriptor,fingerprintDescriptor,revisionDescriptor,isArray=false;
  var allowedCodes=Object.create(null),allowedList=['EDITION_SCHEMA','EDITION_DIGEST','EDITION_AUDIENCE','EDITION_REF',
    'EDITION_WEEK','EDITION_SIZE','EDITION_URL','EDITION_TEXT_RISK'],allowedIndex;
  for(allowedIndex=0;allowedIndex<allowedList.length;allowedIndex++) allowedCodes[allowedList[allowedIndex]]=true;
  if(fdEditionObject(result)){
    try{
      errorsDescriptor=Object.getOwnPropertyDescriptor(result,'errors');
      fingerprintDescriptor=Object.getOwnPropertyDescriptor(result,'fingerprint');
    }catch(ignoreResult){ errorsDescriptor=null; fingerprintDescriptor=null; }
    if(errorsDescriptor&&Object.prototype.hasOwnProperty.call(errorsDescriptor,'value')){
      try{ isArray=Array.isArray(errorsDescriptor.value); }
      catch(ignoreErrorsArray){ isArray=false; }
      if(isArray){
        try{ lengthDescriptor=Object.getOwnPropertyDescriptor(errorsDescriptor.value,'length'); }
        catch(ignoreErrorsLength){ lengthDescriptor=null; }
        if(lengthDescriptor&&lengthDescriptor.value===0) code='EDITION_OK';
        else if(lengthDescriptor&&typeof lengthDescriptor.value==='number'&&lengthDescriptor.value>0){
          try{ firstDescriptor=Object.getOwnPropertyDescriptor(errorsDescriptor.value,'0'); }
          catch(ignoreFirst){ firstDescriptor=null; }
          if(firstDescriptor&&Object.prototype.hasOwnProperty.call(firstDescriptor,'value')&&fdEditionObject(firstDescriptor.value)){
            try{ codeDescriptor=Object.getOwnPropertyDescriptor(firstDescriptor.value,'code'); }
            catch(ignoreCode){ codeDescriptor=null; }
            if(codeDescriptor&&Object.prototype.hasOwnProperty.call(codeDescriptor,'value')&&
               typeof codeDescriptor.value==='string'&&allowedCodes[codeDescriptor.value]) code=codeDescriptor.value;
          }
        }
      }
    }
    if(fingerprintDescriptor&&Object.prototype.hasOwnProperty.call(fingerprintDescriptor,'value')&&
       typeof fingerprintDescriptor.value==='string'&&/^[A-Z0-9]{2,8}-(?:MS3|RES)-[0-9A-HJKMNP-TV-Z]{6}$/.test(fingerprintDescriptor.value))
      fingerprint=fingerprintDescriptor.value;
  }
  if(fdEditionObject(siteContext)){
    try{ revisionDescriptor=Object.getOwnPropertyDescriptor(siteContext,'coreRevision'); }
    catch(ignoreContext){ revisionDescriptor=null; }
    if(revisionDescriptor&&Object.prototype.hasOwnProperty.call(revisionDescriptor,'value')&&typeof revisionDescriptor.value==='string'&&
       new RegExp(FD_EDITION_RULES.patterns.revision).test(revisionDescriptor.value)) currentCoreRevision=revisionDescriptor.value;
  }
  return {
    code:code,
    schemaVersion:fdEditionDiagnosticVersion(result),
    fingerprint:fingerprint,
    currentCoreRevision:currentCoreRevision
  };
}
