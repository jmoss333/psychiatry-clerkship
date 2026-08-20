/* Closed rotation-edition catalog boundary. Deliberately has no browser I/O. */
var FD_EDITION_CATALOG=(function(){
  'use strict';

  function fdEditionCatalogMarker(){}

  var EXPECTED_REVISION='__FD_CATALOG_EXPECTED_REVISION__';
  var own=Object.prototype.hasOwnProperty;
  var promiseThen=Promise.prototype.then;
  var arrayBufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
  var branded=new WeakSet();
  var privateIndex=new WeakMap();

  var MAX_ARRAY=4096;
  var MAX_OBJECT_KEYS=128;
  var MAX_DEPTH=64;
  var MAX_PROJECTION_BYTES=2*1024*1024;
  var MAX_CONFIG_BYTES=12*1024;

  var KEY=/^[a-z0-9][a-z0-9._:-]{0,126}@v[1-9][0-9]{0,5}$/;
  var DIGEST=/^sha256-[A-Za-z0-9_-]{43}$/;
  var CORE=/^[0-9a-f]{40}$/;
  var IDENTIFIER=/^[\x21-\x7e]{1,160}$/;
  var TIME=/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
  var DATE=/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
  var HOSTNAME=/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;
  var TEXT_CONTROL=/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069<>&]/;

  var AUDIENCES=['ms3','resident'];
  var RECORD_KINDS=['trainingLocation','curatorProfile','place','officialLink','phraseSet','choice','localPreset'];
  var LOCATION_TYPES=['inpatient','outpatient','consult-liaison','emergency','community','mixed'];
  var PRIORITIES=['required','recommended','optional'];
  var PURPOSE_CODES=['arrival-map','orientation','access-training','documentation-policy','attendance-policy','feedback-policy','directory','parking-transit','official-clinical-policy','reviewed-operational'];
  var CHOICE_KINDS=[
    'reason','activity','role','checklist','daySet','roundsPreparation','roundsParticipation',
    'roundsFollowUp','presentationFormat','presentationTiming','presentationElement',
    'documentationWorkflow','documentationTiming','feedbackCadence','feedbackInitiator',
    'feedbackSetting','accessItem','duePoint'
  ];
  var CHANGE_KINDS=[
    'initial','edition-context','curriculum-selection','curriculum-priority','curriculum-reason',
    'schedule','arrival','workflow','access','contacts','checklist','resources'
  ];
  var LOCAL_CATEGORIES=[
    'arrival','schedule','rounds','presentation','documentation','attendance','feedback',
    'accessItems','contacts','checklistItems','resources'
  ];
  var TEMPLATE_TOKENS={
    arrival:['timing','time','place','role'],
    scheduleWindow:['dayStart','dayEnd','endQualifier'],
    scheduleRangeWithPlace:['daySet','startTime','endTime','activity','place','priority'],
    scheduleRangeWithoutPlace:['daySet','startTime','endTime','activity','priority'],
    schedulePointWithPlace:['daySet','startTime','activity','place','priority'],
    schedulePointWithoutPlace:['daySet','startTime','activity','priority'],
    rounds:['preparation','participation','followUp'],
    presentation:['format','timing','elements'],
    documentation:['workflow','timing'],
    attendance:['events','absenceRole'],
    feedback:['cadence','initiator','setting'],
    access:['item','due'],
    contact:['role'],
    checklist:['item','priority'],
    resourceWithReason:['title','priority','week','reason','hostname'],
    resourceWithoutReason:['title','priority','week','hostname'],
    changeSummary:['kinds','count']
  };
  var AUTHORITY={
    coreLabel:'Reviewed clerkship Library',
    localLabel:'Local rotation guidance',
    requiredLabel:'Required by this local rotation',
    recommendedLabel:'Recommended by this local rotation',
    optionalLabel:'Optional for this local rotation',
    resourceLabel:'Locally curated official resource',
    localBoundary:'Local rotation guidance does not replace current institutional policy or supervision.',
    documentationGuardrail:'Use only the approved institutional record. Do not place patient information in this site. Complete documentation only with supervisor guidance and review.'
  };

  function fail(){ throw new Error('invalid'); }
  function oneOf(value,allowed){ return allowed.indexOf(value)>=0; }
  function failure(code,path){
    return {
      code:code||'CATALOG_INVALID',
      path:path||'/',
      message:'The reviewed rotation catalog is unavailable.',
      blocking:true
    };
  }
  function snapshotFailure(code){ return {ok:false,snapshot:null,errors:[failure(code||'CATALOG_INVALID','/')]}; }
  function resolveFailure(){ return {ok:false,resolved:null,referenceSetDigest:'',displayModel:null,errors:[failure('CATALOG_RESOLUTION','/')]}; }

  function plainCopy(value,seen,depth){
    var proto,isArray,keys,lengthDescriptor,length,out,i,key,descriptor;
    if(value===null||typeof value==='string'||typeof value==='boolean') return value;
    if(typeof value==='number'){
      if(!isFinite(value)||Math.floor(value)!==value) fail();
      return value;
    }
    if(!value||typeof value!=='object'||depth>MAX_DEPTH) fail();
    if(seen.indexOf(value)>=0) fail();
    seen.push(value);
    try{
      isArray=Array.isArray(value);
      proto=Object.getPrototypeOf(value);
    }catch(ignorePrototype){ fail(); }
    if(isArray){
      if(proto!==Array.prototype) fail();
      try{
        lengthDescriptor=Object.getOwnPropertyDescriptor(value,'length');
        keys=Reflect.ownKeys(value);
      }catch(ignoreArrayShape){ fail(); }
      if(!lengthDescriptor||!own.call(lengthDescriptor,'value')||typeof lengthDescriptor.value!=='number') fail();
      length=lengthDescriptor.value;
      if(Math.floor(length)!==length||length<0||length>MAX_ARRAY||keys.length!==length+1) fail();
      out=[];
      for(i=0;i<keys.length;i++){
        key=keys[i];
        if(typeof key!=='string'||(key!=='length'&&(!/^(?:0|[1-9][0-9]*)$/.test(key)||Number(key)>=length))) fail();
      }
      for(i=0;i<length;i++){
        try{ descriptor=Object.getOwnPropertyDescriptor(value,String(i)); }
        catch(ignoreArrayDescriptor){ fail(); }
        if(!descriptor||!descriptor.enumerable||!own.call(descriptor,'value')) fail();
        out.push(plainCopy(descriptor.value,seen,depth+1));
      }
    }else{
      if(proto!==Object.prototype&&proto!==null) fail();
      try{ keys=Reflect.ownKeys(value); }
      catch(ignoreObjectKeys){ fail(); }
      if(keys.length>MAX_OBJECT_KEYS) fail();
      out=Object.create(null);
      for(i=0;i<keys.length;i++){
        key=keys[i];
        if(typeof key!=='string'||key==='__proto__'||key==='constructor'||key==='prototype') fail();
        try{ descriptor=Object.getOwnPropertyDescriptor(value,key); }
        catch(ignoreObjectDescriptor){ fail(); }
        if(!descriptor||!descriptor.enumerable||!own.call(descriptor,'value')) fail();
        out[key]=plainCopy(descriptor.value,seen,depth+1);
      }
    }
    seen.pop();
    return out;
  }

  function copy(value){ return plainCopy(value,[],0); }

  function deepFreeze(value){
    var keys,i;
    if(value&&typeof value==='object'&&!Object.isFrozen(value)){
      keys=Object.keys(value);
      for(i=0;i<keys.length;i++) deepFreeze(value[keys[i]]);
      Object.freeze(value);
    }
    return value;
  }

  function canonical(value){
    var keys,out=[],i;
    if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number') return JSON.stringify(value);
    if(Array.isArray(value)){
      for(i=0;i<value.length;i++) out.push(canonical(value[i]));
      return '['+out.join(',')+']';
    }
    keys=Object.keys(value).sort();
    for(i=0;i<keys.length;i++) out.push(JSON.stringify(keys[i])+':'+canonical(value[keys[i]]));
    return '{'+out.join(',')+'}';
  }

  function utf8(value){
    var out=[],i=0,code,next;
    while(i<value.length){
      code=value.charCodeAt(i++);
      if(code>=0xd800&&code<=0xdbff){
        if(i>=value.length) fail();
        next=value.charCodeAt(i++);
        if(next<0xdc00||next>0xdfff) fail();
        code=0x10000+((code-0xd800)<<10)+(next-0xdc00);
      }else if(code>=0xdc00&&code<=0xdfff){
        fail();
      }
      if(code<=0x7f){ out.push(code); }
      else if(code<=0x7ff){ out.push(0xc0|(code>>6),0x80|(code&0x3f)); }
      else if(code<=0xffff){ out.push(0xe0|(code>>12),0x80|((code>>6)&0x3f),0x80|(code&0x3f)); }
      else{ out.push(0xf0|(code>>18),0x80|((code>>12)&0x3f),0x80|((code>>6)&0x3f),0x80|(code&0x3f)); }
    }
    return new Uint8Array(out);
  }

  function canonicalBytes(value){ return utf8(canonical(value)); }

  function base64url(buffer){
    var bytes=new Uint8Array(buffer),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',out='',i,n;
    for(i=0;i<bytes.length;i+=3){
      n=(bytes[i]<<16)|((i+1<bytes.length?bytes[i+1]:0)<<8)|(i+2<bytes.length?bytes[i+2]:0);
      out+=alphabet.charAt((n>>18)&63)+alphabet.charAt((n>>12)&63);
      if(i+1<bytes.length) out+=alphabet.charAt((n>>6)&63);
      if(i+2<bytes.length) out+=alphabet.charAt(n&63);
    }
    return out;
  }

  function dataMethod(value,name){
    var cursor=value,descriptor,depth=0;
    if(!cursor||(typeof cursor!=='object'&&typeof cursor!=='function')) return null;
    while(cursor&&depth<16){
      try{ descriptor=Object.getOwnPropertyDescriptor(cursor,name); }
      catch(ignoreDescriptor){ return null; }
      if(descriptor){
        if(!own.call(descriptor,'value')||typeof descriptor.value!=='function') return null;
        return descriptor.value;
      }
      try{ cursor=Object.getPrototypeOf(cursor); }
      catch(ignorePrototype){ return null; }
      depth+=1;
    }
    return null;
  }

  function digest(value,subtle){
    return new Promise(function(resolve,reject){
      var method=dataMethod(subtle,'digest'),pending;
      if(!method){ reject(new Error('digest')); return; }
      try{ pending=method.call(subtle,'SHA-256',canonicalBytes(value)); }
      catch(ignoreCall){ reject(new Error('digest')); return; }
      try{
        promiseThen.call(pending,function(result){
          var length,encoded;
          try{
            length=arrayBufferLength.call(result);
            if(length!==32) fail();
            encoded='sha256-'+base64url(result);
            if(!DIGEST.test(encoded)) fail();
          }catch(ignoreResult){ reject(new Error('digest')); return; }
          resolve(encoded);
        },function(){ reject(new Error('digest')); });
      }catch(ignorePromiseBrand){ reject(new Error('digest')); }
    });
  }

  function exact(value,required,optional){
    var allowed=Object.create(null),keys,i;
    if(!value||typeof value!=='object'||Array.isArray(value)) return false;
    for(i=0;i<required.length;i++) allowed[required[i]]=true;
    for(i=0;i<optional.length;i++) allowed[optional[i]]=true;
    keys=Object.keys(value);
    for(i=0;i<keys.length;i++) if(!allowed[keys[i]]) return false;
    for(i=0;i<required.length;i++) if(!own.call(value,required[i])) return false;
    return true;
  }

  function scalarLength(value){
    var count=0,i=0,code,next;
    if(typeof value!=='string') return -1;
    while(i<value.length){
      code=value.charCodeAt(i++);
      if(code>=0xd800&&code<=0xdbff){
        if(i>=value.length) return -1;
        next=value.charCodeAt(i++);
        if(next<0xdc00||next>0xdfff) return -1;
      }else if(code>=0xdc00&&code<=0xdfff){
        return -1;
      }
      count+=1;
    }
    return count;
  }

  function plainText(value,maximum){
    var length=scalarLength(value);
    return length>=1&&length<=maximum&&value===value.trim()&&!TEXT_CONTROL.test(value);
  }

  function safeString(value,minimum,maximum){
    var length=scalarLength(value);
    return length>=minimum&&length<=maximum&&!/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(value);
  }

  function realDate(value){
    var year,month,day,days,leap;
    if(typeof value!=='string'||!DATE.test(value)) return false;
    year=Number(value.slice(0,4));
    month=Number(value.slice(5,7));
    day=Number(value.slice(8,10));
    if(year<1||month<1||month>12) return false;
    leap=year%4===0&&(year%100!==0||year%400===0);
    days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
    return day>=1&&day<=days[month-1];
  }

  function timeMinutes(value){
    if(typeof value!=='string'||!TIME.test(value)) fail();
    return Number(value.slice(0,2))*60+Number(value.slice(3,5));
  }

  function sortedUnique(values,minimum,maximum,validator){
    var i;
    if(!Array.isArray(values)||values.length<minimum||values.length>maximum) return false;
    for(i=0;i<values.length;i++){
      if(!validator(values[i])||(i>0&&values[i-1]>=values[i])) return false;
    }
    return true;
  }

  function validKey(value){ return typeof value==='string'&&KEY.test(value); }
  function validIdentifier(value){ return typeof value==='string'&&IDENTIFIER.test(value); }
  function validAudience(value){ return typeof value==='string'&&oneOf(value,AUDIENCES); }
  function validHostname(value){ return typeof value==='string'&&value.length<=253&&HOSTNAME.test(value)&&value===value.toLowerCase(); }

  function officialUrl(record){
    var match,authority,host,colon,port;
    if(!safeString(record.url,1,2048)||!validHostname(record.visibleHostname)) return false;
    match=/^https:\/\/([^\/?#]+)(\/[^?#]*)?$/.exec(record.url);
    if(!match) return false;
    authority=match[1];
    if(authority.indexOf('@')>=0||authority!==authority.toLowerCase()) return false;
    host=authority;
    colon=authority.lastIndexOf(':');
    if(colon>=0){
      if(authority.indexOf(':')!==colon) return false;
      host=authority.slice(0,colon);
      port=authority.slice(colon+1);
      if(!/^[0-9]{1,5}$/.test(port)||Number(port)<1||Number(port)>65535) return false;
    }
    return host===record.visibleHostname&&validHostname(host);
  }

  function templateSetValid(templates){
    var names=Object.keys(TEMPLATE_TOKENS).sort(),actual,i,j,name,row,tokens,remainder,placeholder;
    if(!templates||typeof templates!=='object'||Array.isArray(templates)) return false;
    actual=Object.keys(templates).sort();
    if(actual.length!==names.length) return false;
    for(i=0;i<names.length;i++) if(actual[i]!==names[i]) return false;
    for(i=0;i<names.length;i++){
      name=names[i];
      row=templates[name];
      tokens=TEMPLATE_TOKENS[name];
      if(!exact(row,['text','tokens'],[])||!plainText(row.text,512)||!Array.isArray(row.tokens)||row.tokens.length!==tokens.length||row.tokens.length>16) return false;
      remainder=row.text;
      for(j=0;j<tokens.length;j++){
        if(row.tokens[j]!==tokens[j]) return false;
        placeholder='{'+tokens[j]+'}';
        if(row.text.split(placeholder).length!==2) return false;
        remainder=remainder.replace(placeholder,'');
      }
      if(/[{}]/.test(remainder)) return false;
    }
    return true;
  }

  function recordShape(record){
    var kind=record.kind,required,optional=[];
    var base=['key','kind','contentDigest','audiences','verifiedOn'];
    if(kind==='trainingLocation') required=base.concat(['displayName','locationCode','locationTypeCode','officialHostnames']);
    else if(kind==='curatorProfile') required=base.concat(['displayName','roleKey','locationKeys']);
    else if(kind==='place') required=base.concat(['displayName','locationKeys']);
    else if(kind==='officialLink') required=base.concat(['title','url','visibleHostname','purposeCode','locationKeys']);
    else if(kind==='phraseSet'){ required=base.concat(['displayName','templates']); optional=['locationKeys']; }
    else if(kind==='choice'){ required=base.concat(['choiceKind','label','fragment']); optional=['locationKeys']; }
    else if(kind==='localPreset') required=base.concat(['displayName','localPlan','locationKeys','phraseSetKey']);
    else return false;
    if(!exact(record,required,optional)||!validKey(record.key)||typeof record.contentDigest!=='string'||!DIGEST.test(record.contentDigest)) return false;
    if(!sortedUnique(record.audiences,1,2,validAudience)||record.audiences.indexOf('ms3')<0&&record.audiences.indexOf('resident')<0||!realDate(record.verifiedOn)) return false;
    if(own.call(record,'locationKeys')&&!sortedUnique(record.locationKeys,1,64,validKey)) return false;
    if(own.call(record,'displayName')&&!plainText(record.displayName,120)) return false;
    if(kind==='trainingLocation'){
      return typeof record.locationCode==='string'&&/^[A-Z0-9]{2,8}$/.test(record.locationCode)&&
        oneOf(record.locationTypeCode,LOCATION_TYPES)&&sortedUnique(record.officialHostnames,0,32,validHostname);
    }
    if(kind==='curatorProfile') return validKey(record.roleKey);
    if(kind==='place') return true;
    if(kind==='officialLink') return plainText(record.title,120)&&oneOf(record.purposeCode,PURPOSE_CODES)&&officialUrl(record);
    if(kind==='phraseSet') return templateSetValid(record.templates);
    if(kind==='choice') return oneOf(record.choiceKind,CHOICE_KINDS)&&plainText(record.label,80)&&plainText(record.fragment,240);
    if(kind==='localPreset'){
      if(!validKey(record.phraseSetKey)) return false;
      try{ validateLocalPlan(record.localPlan,record.audiences.indexOf('resident')>=0?4:6,Object.create(null),null); }
      catch(ignorePlan){ return false; }
      return true;
    }
    return false;
  }

  function validateLocalPlan(plan,maxWeek,ids,lookup){
    var keys,i,j,value,row,start,events,scheduleIds=Object.create(null),tuples=Object.create(null),seen=Object.create(null),count;
    function reference(key,kind,choiceKinds,purposes){
      if(!validKey(key)) fail();
      return lookup?lookup(key,kind,choiceKinds,purposes):null;
    }
    function uniqueId(id){
      if(!validIdentifier(id)||ids[id]) fail();
      ids[id]=true;
    }
    function priority(code){ if(!oneOf(code,PRIORITIES)) fail(); }
    if(!plan||typeof plan!=='object'||Array.isArray(plan)) fail();
    keys=Object.keys(plan);
    for(i=0;i<keys.length;i++) if(!oneOf(keys[i],LOCAL_CATEGORIES)) fail();

    if(own.call(plan,'arrival')){
      value=plan.arrival;
      if(!exact(value,['timingCode','time','placeKey','checkInRoleKey'],['linkKey'])||!oneOf(value.timingCode,['at','by'])) fail();
      timeMinutes(value.time);
      reference(value.placeKey,'place',null,null);
      reference(value.checkInRoleKey,'choice',['role'],null);
      if(own.call(value,'linkKey')) reference(value.linkKey,'officialLink',null,['arrival-map']);
    }

    if(own.call(plan,'schedule')){
      value=plan.schedule;
      if(!exact(value,['dayStart','dayEnd','endQualifierCode','events'],[])||!oneOf(value.endQualifierCode,['at','about','no-later-than'])) fail();
      if(timeMinutes(value.dayStart)>=timeMinutes(value.dayEnd)||!Array.isArray(value.events)||value.events.length<1||value.events.length>24) fail();
      for(i=0;i<value.events.length;i++){
        row=value.events[i];
        if(!exact(row,['instanceId','daySetKey','startTime','activityKey','priority'],['endTime','placeKey'])) fail();
        uniqueId(row.instanceId);
        scheduleIds[row.instanceId]=true;
        start=timeMinutes(row.startTime);
        if(own.call(row,'endTime')&&timeMinutes(row.endTime)<=start) fail();
        priority(row.priority);
        reference(row.daySetKey,'choice',['daySet'],null);
        reference(row.activityKey,'choice',['activity'],null);
        if(own.call(row,'placeKey')) reference(row.placeKey,'place',null,null);
        value.events[i]=row;
        events=[row.daySetKey,row.startTime,own.call(row,'endTime')?row.endTime:'',row.activityKey,own.call(row,'placeKey')?row.placeKey:''].join('\u0000');
        if(tuples[events]) fail();
        tuples[events]=true;
      }
    }

    if(own.call(plan,'rounds')){
      value=plan.rounds;
      if(!exact(value,['preparationKey','participationKey','followUpKey'],[])) fail();
      reference(value.preparationKey,'choice',['roundsPreparation'],null);
      reference(value.participationKey,'choice',['roundsParticipation'],null);
      reference(value.followUpKey,'choice',['roundsFollowUp'],null);
    }
    if(own.call(plan,'presentation')){
      value=plan.presentation;
      if(!exact(value,['formatKey','timingKey','elementKeys'],[])||!Array.isArray(value.elementKeys)||value.elementKeys.length<1||value.elementKeys.length>8) fail();
      reference(value.formatKey,'choice',['presentationFormat'],null);
      reference(value.timingKey,'choice',['presentationTiming'],null);
      seen=Object.create(null);
      for(i=0;i<value.elementKeys.length;i++){
        if(seen[value.elementKeys[i]]) fail();
        seen[value.elementKeys[i]]=true;
        reference(value.elementKeys[i],'choice',['presentationElement'],null);
      }
    }
    if(own.call(plan,'documentation')){
      value=plan.documentation;
      if(!exact(value,['workflowKey','timingKey'],['policyLinkKey'])) fail();
      reference(value.workflowKey,'choice',['documentationWorkflow'],null);
      reference(value.timingKey,'choice',['documentationTiming'],null);
      if(own.call(value,'policyLinkKey')) reference(value.policyLinkKey,'officialLink',null,['documentation-policy']);
    }
    if(own.call(plan,'attendance')){
      value=plan.attendance;
      if(!exact(value,['eventInstanceIds','absenceRoleKey'],['policyLinkKey'])||!Array.isArray(value.eventInstanceIds)||value.eventInstanceIds.length<1||value.eventInstanceIds.length>24) fail();
      seen=Object.create(null);
      for(i=0;i<value.eventInstanceIds.length;i++){
        if(!validIdentifier(value.eventInstanceIds[i])||seen[value.eventInstanceIds[i]]||!scheduleIds[value.eventInstanceIds[i]]) fail();
        seen[value.eventInstanceIds[i]]=true;
      }
      reference(value.absenceRoleKey,'choice',['role'],null);
      if(own.call(value,'policyLinkKey')) reference(value.policyLinkKey,'officialLink',null,['attendance-policy']);
    }
    if(own.call(plan,'feedback')){
      value=plan.feedback;
      if(!exact(value,['cadenceKey','initiatorKey','settingKey'],[])) fail();
      reference(value.cadenceKey,'choice',['feedbackCadence'],null);
      reference(value.initiatorKey,'choice',['feedbackInitiator'],null);
      reference(value.settingKey,'choice',['feedbackSetting'],null);
    }

    if(own.call(plan,'accessItems')){
      value=plan.accessItems;
      if(!Array.isArray(value)||value.length>12) fail();
      for(i=0;i<value.length;i++){
        row=value[i];
        if(!exact(row,['instanceId','itemKey','dueKey'],['linkKey'])) fail();
        uniqueId(row.instanceId);
        reference(row.itemKey,'choice',['accessItem'],null);
        reference(row.dueKey,'choice',['duePoint'],null);
        if(own.call(row,'linkKey')) reference(row.linkKey,'officialLink',null,['access-training','parking-transit','reviewed-operational']);
      }
    }
    if(own.call(plan,'contacts')){
      value=plan.contacts;
      if(!Array.isArray(value)||value.length>8) fail();
      for(i=0;i<value.length;i++){
        row=value[i];
        if(!exact(row,['instanceId','roleKey'],['linkKey'])) fail();
        uniqueId(row.instanceId);
        reference(row.roleKey,'choice',['role'],null);
        if(own.call(row,'linkKey')) reference(row.linkKey,'officialLink',null,['directory']);
      }
    }
    if(own.call(plan,'checklistItems')){
      value=plan.checklistItems;
      if(!Array.isArray(value)||value.length>24) fail();
      for(i=0;i<value.length;i++){
        row=value[i];
        if(!exact(row,['instanceId','itemKey','priority'],[])) fail();
        uniqueId(row.instanceId);
        priority(row.priority);
        reference(row.itemKey,'choice',['checklist'],null);
      }
    }
    if(own.call(plan,'resources')){
      value=plan.resources;
      if(!Array.isArray(value)||value.length>12) fail();
      for(i=0;i<value.length;i++){
        row=value[i];
        if(!exact(row,['instanceId','linkKey','priority','week'],['reasonKey'])) fail();
        uniqueId(row.instanceId);
        priority(row.priority);
        if(typeof row.week!=='number'||Math.floor(row.week)!==row.week||row.week<1||row.week>maxWeek) fail();
        reference(row.linkKey,'officialLink',null,null);
        if(own.call(row,'reasonKey')) reference(row.reasonKey,'choice',['reason'],null);
      }
    }
    count=(own.call(plan,'arrival')?1:0)+(own.call(plan,'accessItems')?plan.accessItems.length:0)+(own.call(plan,'checklistItems')?plan.checklistItems.length:0);
    if(count>24) fail();
  }

  function audienceSubset(source,target){
    var i;
    for(i=0;i<source.length;i++) if(target.indexOf(source[i])<0) return false;
    return true;
  }

  function locationSubset(source,target){
    var i;
    for(i=0;i<source.length;i++) if(target.indexOf(source[i])<0) return false;
    return true;
  }

  function catalogLookup(records,key,kind,choiceKinds,purposes,audiences,locations){
    var target=records[key];
    if(!target||target.kind!==kind||!audienceSubset(audiences,target.audiences)) fail();
    if(choiceKinds&&!oneOf(target.choiceKind,choiceKinds)) fail();
    if(purposes&&!oneOf(target.purposeCode,purposes)) fail();
    if(own.call(target,'locationKeys')&&!locationSubset(locations,target.locationKeys)) fail();
    return target;
  }

  function referenceKeys(value,field,found){
    var keys,i,key;
    if(Array.isArray(value)){
      for(i=0;i<value.length;i++) referenceKeys(value[i],field,found);
      return;
    }
    if(!value||typeof value!=='object') return;
    keys=Object.keys(value);
    for(i=0;i<keys.length;i++){
      key=keys[i];
      if(key==='key') continue;
      if(/Key$/.test(key)&&typeof value[key]==='string'&&validKey(value[key])) found[value[key]]=true;
      else if(/Keys$/.test(key)&&Array.isArray(value[key])){
        value[key].forEach(function(item){ if(typeof item==='string'&&validKey(item)) found[item]=true; });
      }else referenceKeys(value[key],key,found);
    }
  }

  function validateCatalogRelations(records){
    var keys=Object.keys(records),i,j,record,locations,target,edges=Object.create(null),visiting=Object.create(null),visited=Object.create(null),found;
    for(i=0;i<keys.length;i++){
      record=records[keys[i]];
      locations=record.locationKeys||[];
      for(j=0;j<locations.length;j++) catalogLookup(records,locations[j],'trainingLocation',null,null,record.audiences,[]);
      if(record.kind==='curatorProfile') catalogLookup(records,record.roleKey,'choice',['role'],null,record.audiences,locations);
      if(record.kind==='officialLink'){
        for(j=0;j<locations.length;j++){
          target=records[locations[j]];
          if(!target||target.officialHostnames.indexOf(record.visibleHostname)<0) fail();
        }
      }
      if(record.kind==='localPreset'){
        catalogLookup(records,record.phraseSetKey,'phraseSet',null,null,record.audiences,locations);
        validateLocalPlan(record.localPlan,record.audiences.indexOf('resident')>=0?4:6,Object.create(null),function(key,kind,choiceKinds,purposes){
          return catalogLookup(records,key,kind,choiceKinds,purposes,record.audiences,locations);
        });
      }
      found=Object.create(null);
      referenceKeys(record,'',found);
      edges[record.key]=Object.keys(found);
      for(j=0;j<edges[record.key].length;j++) if(!records[edges[record.key][j]]) fail();
    }
    function visit(key){
      var children,k;
      if(visiting[key]) fail();
      if(visited[key]) return;
      visiting[key]=true;
      children=edges[key]||[];
      for(k=0;k<children.length;k++) visit(children[k]);
      delete visiting[key];
      visited[key]=true;
    }
    for(i=0;i<keys.length;i++) visit(keys[i]);
  }

  function snapshotShape(value,expectedAudience){
    return exact(value,['schemaVersion','audience','revision','projectionDigest','rotationEditionV2','selectionKeys','resolutionRecords','blockedKeys'],[])&&
      value.schemaVersion===1&&value.audience===expectedAudience&&oneOf(value.audience,AUDIENCES)&&
      typeof value.revision==='string'&&DIGEST.test(value.revision)&&value.revision===EXPECTED_REVISION&&
      typeof value.projectionDigest==='string'&&DIGEST.test(value.projectionDigest)&&
      oneOf(value.rotationEditionV2,['disabled','enabled']);
  }

  function prepare(projection,expectedAudience,subtle){
    var value,records=Object.create(null),selection=Object.create(null),blocked=Object.create(null),i,record,bare,projectionBare,tasks=[];
    if(!oneOf(expectedAudience,AUDIENCES)) return Promise.resolve(snapshotFailure('CATALOG_SNAPSHOT'));
    try{
      value=copy(projection);
      if(!snapshotShape(value,expectedAudience)||canonicalBytes(value).length>MAX_PROJECTION_BYTES) fail();
      if(!sortedUnique(value.selectionKeys,0,4096,validKey)||!sortedUnique(value.blockedKeys,0,4096,validKey)||!Array.isArray(value.resolutionRecords)||value.resolutionRecords.length>4096) fail();
      for(i=0;i<value.resolutionRecords.length;i++){
        record=value.resolutionRecords[i];
        if(!recordShape(record)||record.audiences.indexOf(expectedAudience)<0||records[record.key]||(i>0&&value.resolutionRecords[i-1].key>=record.key)) fail();
        records[record.key]=record;
      }
      for(i=0;i<value.selectionKeys.length;i++){
        if(!records[value.selectionKeys[i]]||blocked[value.selectionKeys[i]]) fail();
        selection[value.selectionKeys[i]]=true;
      }
      for(i=0;i<value.blockedKeys.length;i++){
        if(records[value.blockedKeys[i]]||selection[value.blockedKeys[i]]) fail();
        blocked[value.blockedKeys[i]]=true;
      }
      validateCatalogRelations(records);
      for(i=0;i<value.resolutionRecords.length;i++){
        (function(current){
          bare=copy(current);
          delete bare.contentDigest;
          tasks.push(digest(bare,subtle).then(function(actual){ if(actual!==current.contentDigest) fail(); }));
        }(value.resolutionRecords[i]));
      }
      projectionBare=copy(value);
      delete projectionBare.projectionDigest;
      tasks.push(digest(projectionBare,subtle).then(function(actual){ if(actual!==value.projectionDigest) fail(); }));
    }catch(ignoreShape){ return Promise.resolve(snapshotFailure('CATALOG_SNAPSHOT')); }
    return Promise.all(tasks).then(function(){
      var trusted=deepFreeze(value);
      branded.add(trusted);
      privateIndex.set(trusted,{records:records,selection:selection,blocked:blocked});
      return {ok:true,snapshot:trusted,errors:[]};
    },function(){ return snapshotFailure('CATALOG_DIGEST'); });
  }

  function internalRecord(snapshot,key,mode,kind,location,choiceKinds,purposes,refs){
    var index,record;
    if(!branded.has(snapshot)||!validKey(key)||!validKey(location)||!oneOf(mode,['builder','learner'])||!oneOf(kind,RECORD_KINDS)) fail();
    index=privateIndex.get(snapshot);
    if(index.blocked[key]) throw new Error('CATALOG_BLOCKED');
    record=index.records[key];
    if(!record||record.kind!==kind) fail();
    if(mode==='builder'&&!index.selection[key]) throw new Error('CATALOG_RESELECTION_REQUIRED');
    if(record.kind==='trainingLocation'){
      if(record.key!==location) fail();
    }else if(own.call(record,'locationKeys')&&record.locationKeys.indexOf(location)<0) fail();
    if(record.audiences.indexOf(snapshot.audience)<0) fail();
    if(choiceKinds&&!oneOf(record.choiceKind,choiceKinds)) fail();
    if(purposes&&!oneOf(record.purposeCode,purposes)) fail();
    if(refs) refs[record.key]=record.contentDigest;
    return record;
  }

  function recordFor(snapshot,key,mode,kind,location){
    var record;
    try{ record=internalRecord(snapshot,key,mode,kind,location,null,null,null); }
    catch(error){
      return {ok:false,record:null,error:error&&error.message==='CATALOG_BLOCKED'?'CATALOG_BLOCKED':error&&error.message==='CATALOG_RESELECTION_REQUIRED'?'CATALOG_RESELECTION_REQUIRED':'CATALOG_UNAVAILABLE'};
    }
    return {ok:true,record:deepFreeze(copy(record)),error:''};
  }

  function validateChangeSummary(summary,editionNumber){
    var codes,i,prior=-1,index;
    if(!exact(summary,['kindCodes','changedItemCount'],[])||!Array.isArray(summary.kindCodes)||summary.kindCodes.length<1||summary.kindCodes.length>12) fail();
    codes=summary.kindCodes;
    for(i=0;i<codes.length;i++){
      index=CHANGE_KINDS.indexOf(codes[i]);
      if(index<0||index<=prior) fail();
      prior=index;
    }
    if(typeof summary.changedItemCount!=='number'||Math.floor(summary.changedItemCount)!==summary.changedItemCount||summary.changedItemCount<0||summary.changedItemCount>255) fail();
    if(editionNumber===1){
      if(codes.length!==1||codes[0]!=='initial'||summary.changedItemCount!==0) fail();
    }else if(codes[0]==='initial'||summary.changedItemCount<1){
      fail();
    }
  }

  function validateConfig(value){
    var labels,maxWeek,ids=Object.create(null),orders=Object.create(null),weekCounts=Object.create(null),i,item,lastWeek=0,lastOrder=0,key,keys,j;
    if(canonicalBytes(value).length>MAX_CONFIG_BYTES) fail();
    if(!exact(value,['audience','pathId','editionNumber','createdAgainstCoreRevision','createdAgainstLocalCatalogRevision','context','phraseSetKey','pathItems','localPlan','changeSummary'],[])) fail();
    labels=value.audience==='ms3'&&value.pathId==='ms3-six-week'?['MS3','6 weeks']:value.audience==='resident'&&value.pathId==='resident-four-week'?['Resident','4 weeks']:null;
    if(!labels) fail();
    maxWeek=value.audience==='ms3'?6:4;
    if(typeof value.editionNumber!=='number'||Math.floor(value.editionNumber)!==value.editionNumber||value.editionNumber<1||value.editionNumber>2147483647) fail();
    if(typeof value.createdAgainstCoreRevision!=='string'||!CORE.test(value.createdAgainstCoreRevision)||typeof value.createdAgainstLocalCatalogRevision!=='string'||!DIGEST.test(value.createdAgainstLocalCatalogRevision)||!validKey(value.phraseSetKey)) fail();
    if(!exact(value.context,['trainingLocationKey','curatorProfileKey','rotationStart','rotationEnd','editionCheckedOn'],[])||!validKey(value.context.trainingLocationKey)||!validKey(value.context.curatorProfileKey)||!realDate(value.context.rotationStart)||!realDate(value.context.rotationEnd)||value.context.rotationEnd<value.context.rotationStart||!realDate(value.context.editionCheckedOn)) fail();
    if(!Array.isArray(value.pathItems)||value.pathItems.length<1||value.pathItems.length>96) fail();
    for(i=0;i<value.pathItems.length;i++){
      item=value.pathItems[i];
      if(!exact(item,['instanceId','ref','week','order','priority'],['reasonKey'])||!validIdentifier(item.instanceId)||!validIdentifier(item.ref)||KEY.test(item.ref)||ids[item.instanceId]) fail();
      ids[item.instanceId]=true;
      if(typeof item.week!=='number'||Math.floor(item.week)!==item.week||item.week<1||item.week>maxWeek||typeof item.order!=='number'||Math.floor(item.order)!==item.order||item.order<1||!oneOf(item.priority,PRIORITIES)) fail();
      if(own.call(item,'reasonKey')&&!validKey(item.reasonKey)) fail();
      if(item.week<lastWeek||item.week===lastWeek&&item.order<=lastOrder) fail();
      lastWeek=item.week;
      lastOrder=item.order;
      key=String(item.week);
      if(!orders[key]) orders[key]=Object.create(null);
      if(orders[key][item.order]) fail();
      orders[key][item.order]=true;
      weekCounts[key]=(weekCounts[key]||0)+1;
    }
    keys=Object.keys(weekCounts);
    for(i=0;i<keys.length;i++) for(j=1;j<=weekCounts[keys[i]];j++) if(!orders[keys[i]][j]) fail();
    validateLocalPlan(value.localPlan,maxWeek,ids,null);
    validateChangeSummary(value.changeSummary,value.editionNumber);
    return labels;
  }

  function contextValue(value){
    var copied;
    try{ copied=copy(value); }
    catch(ignoreCopy){ return null; }
    if(!exact(copied,['audience','localCatalogRevision','rotationEditionV2','coreRevision'],[])||!oneOf(copied.audience,AUDIENCES)||typeof copied.localCatalogRevision!=='string'||!DIGEST.test(copied.localCatalogRevision)||!oneOf(copied.rotationEditionV2,['enabled','disabled'])||typeof copied.coreRevision!=='string'||!CORE.test(copied.coreRevision)) return null;
    return copied;
  }

  function buildGraph(value,snapshot,mode,labels){
    var refs=Object.create(null),location,curator,role,phrases,graph,plan=value.localPlan,i,row;
    function need(key,kind,choiceKinds,purposes){ return internalRecord(snapshot,key,mode,kind,location.key,choiceKinds,purposes,refs); }
    location=internalRecord(snapshot,value.context.trainingLocationKey,mode,'trainingLocation',value.context.trainingLocationKey,null,null,refs);
    curator=need(value.context.curatorProfileKey,'curatorProfile',null,null);
    role=need(curator.roleKey,'choice',['role'],null);
    phrases=need(value.phraseSetKey,'phraseSet',null,null);
    graph={config:value,labels:labels,location:location,curator:curator,curatorRole:role,phrases:phrases,pathItems:[],plan:Object.create(null),refs:refs};
    for(i=0;i<value.pathItems.length;i++){
      row=value.pathItems[i];
      graph.pathItems.push({value:row,reason:own.call(row,'reasonKey')?need(row.reasonKey,'choice',['reason'],null):null});
    }
    if(own.call(plan,'arrival')) graph.plan.arrival={value:plan.arrival,place:need(plan.arrival.placeKey,'place',null,null),role:need(plan.arrival.checkInRoleKey,'choice',['role'],null),link:own.call(plan.arrival,'linkKey')?need(plan.arrival.linkKey,'officialLink',null,['arrival-map']):null};
    if(own.call(plan,'schedule')){
      graph.plan.schedule={value:plan.schedule,events:[]};
      for(i=0;i<plan.schedule.events.length;i++){
        row=plan.schedule.events[i];
        graph.plan.schedule.events.push({value:row,daySet:need(row.daySetKey,'choice',['daySet'],null),activity:need(row.activityKey,'choice',['activity'],null),place:own.call(row,'placeKey')?need(row.placeKey,'place',null,null):null});
      }
    }
    if(own.call(plan,'rounds')) graph.plan.rounds={value:plan.rounds,preparation:need(plan.rounds.preparationKey,'choice',['roundsPreparation'],null),participation:need(plan.rounds.participationKey,'choice',['roundsParticipation'],null),followUp:need(plan.rounds.followUpKey,'choice',['roundsFollowUp'],null)};
    if(own.call(plan,'presentation')){
      graph.plan.presentation={value:plan.presentation,format:need(plan.presentation.formatKey,'choice',['presentationFormat'],null),timing:need(plan.presentation.timingKey,'choice',['presentationTiming'],null),elements:[]};
      for(i=0;i<plan.presentation.elementKeys.length;i++) graph.plan.presentation.elements.push(need(plan.presentation.elementKeys[i],'choice',['presentationElement'],null));
    }
    if(own.call(plan,'documentation')) graph.plan.documentation={value:plan.documentation,workflow:need(plan.documentation.workflowKey,'choice',['documentationWorkflow'],null),timing:need(plan.documentation.timingKey,'choice',['documentationTiming'],null),link:own.call(plan.documentation,'policyLinkKey')?need(plan.documentation.policyLinkKey,'officialLink',null,['documentation-policy']):null};
    if(own.call(plan,'attendance')) graph.plan.attendance={value:plan.attendance,role:need(plan.attendance.absenceRoleKey,'choice',['role'],null),link:own.call(plan.attendance,'policyLinkKey')?need(plan.attendance.policyLinkKey,'officialLink',null,['attendance-policy']):null};
    if(own.call(plan,'feedback')) graph.plan.feedback={value:plan.feedback,cadence:need(plan.feedback.cadenceKey,'choice',['feedbackCadence'],null),initiator:need(plan.feedback.initiatorKey,'choice',['feedbackInitiator'],null),setting:need(plan.feedback.settingKey,'choice',['feedbackSetting'],null)};
    if(own.call(plan,'accessItems')){
      graph.plan.accessItems=[];
      for(i=0;i<plan.accessItems.length;i++){ row=plan.accessItems[i]; graph.plan.accessItems.push({value:row,item:need(row.itemKey,'choice',['accessItem'],null),due:need(row.dueKey,'choice',['duePoint'],null),link:own.call(row,'linkKey')?need(row.linkKey,'officialLink',null,['access-training','parking-transit','reviewed-operational']):null}); }
    }
    if(own.call(plan,'contacts')){
      graph.plan.contacts=[];
      for(i=0;i<plan.contacts.length;i++){ row=plan.contacts[i]; graph.plan.contacts.push({value:row,role:need(row.roleKey,'choice',['role'],null),link:own.call(row,'linkKey')?need(row.linkKey,'officialLink',null,['directory']):null}); }
    }
    if(own.call(plan,'checklistItems')){
      graph.plan.checklistItems=[];
      for(i=0;i<plan.checklistItems.length;i++){ row=plan.checklistItems[i]; graph.plan.checklistItems.push({value:row,item:need(row.itemKey,'choice',['checklist'],null)}); }
    }
    if(own.call(plan,'resources')){
      graph.plan.resources=[];
      for(i=0;i<plan.resources.length;i++){ row=plan.resources[i]; graph.plan.resources.push({value:row,link:need(row.linkKey,'officialLink',null,null),reason:own.call(row,'reasonKey')?need(row.reasonKey,'choice',['reason'],null):null}); }
    }
    return graph;
  }

  function priorityLabel(value){ return {required:'Required',recommended:'Recommended',optional:'Optional'}[value]; }

  function englishList(values){
    if(!values.length) fail();
    if(values.length===1) return values[0];
    if(values.length===2) return values[0]+' and '+values[1];
    return values.slice(0,-1).join(', ')+', and '+values[values.length-1];
  }

  function displayTime(value){
    var hour=Number(value.slice(0,2)),minute=value.slice(3),suffix=hour<12?'AM':'PM';
    hour=hour%12||12;
    return hour+':'+minute+' '+suffix;
  }

  function dateParts(value){
    var months=['January','February','March','April','May','June','July','August','September','October','November','December'];
    return {year:value.slice(0,4),month:months[Number(value.slice(5,7))-1],day:String(Number(value.slice(8,10)))};
  }

  function displayDate(value){ var part=dateParts(value); return part.month+' '+part.day+', '+part.year; }

  function displayDateRange(start,end){
    var first=dateParts(start),last=dateParts(end);
    if(first.year===last.year) return first.month+' '+first.day+' – '+last.month+' '+last.day+', '+last.year;
    return first.month+' '+first.day+', '+first.year+' – '+last.month+' '+last.day+', '+last.year;
  }

  function safeLearnerValue(value){
    return typeof value==='string'&&scalarLength(value)>=1&&value===value.trim()&&!TEXT_CONTROL.test(value)&&!KEY.test(value);
  }

  function renderTemplate(phrases,name,values){
    var row=phrases.templates[name],tokens=TEMPLATE_TOKENS[name],keys,i,token,value,output;
    if(!row||!tokens||!exact(row,['text','tokens'],[])||row.tokens.length!==tokens.length) fail();
    keys=Object.keys(values).sort();
    if(keys.length!==tokens.length) fail();
    output=row.text;
    for(i=0;i<tokens.length;i++){
      token=tokens[i];
      if(row.tokens[i]!==token||!own.call(values,token)) fail();
      value=String(values[token]);
      if(!safeLearnerValue(value)||output.split('{'+token+'}').length!==2) fail();
      output=output.replace('{'+token+'}',value);
    }
    if(/[{}]/.test(output)||!safeLearnerValue(output)) fail();
    return output;
  }

  function linkView(record){ return {title:record.title,url:record.url,visibleHostname:record.visibleHostname,purposeCode:record.purposeCode}; }

  function renderGraph(graph,snapshot,context){
    var value=graph.config,location=graph.location,curator=graph.curator,role=graph.curatorRole,phrases=graph.phrases,plan=graph.plan,labels=graph.labels;
    var provenanceSeen=Object.create(null),scheduleText=Object.create(null),i,item,row,text,priority,link,reason,model;
    function provenance(record){
      if(provenanceSeen[record.key]) return;
      provenanceSeen[record.key]=true;
      model.card.provenance.push({recordKind:record.kind,displayLabel:record.kind==='officialLink'?record.title:record.displayName,verifiedOn:record.verifiedOn});
    }
    function linked(record){ provenance(record); return linkView(record); }
    function phrase(name,values){ return renderTemplate(phrases,name,values); }
    model={
      card:{
        title:location.locationCode+' '+labels[0]+' psychiatry rotation',
        locationName:location.displayName,
        locationCode:location.locationCode,
        locationTypeLabel:{inpatient:'Inpatient',outpatient:'Outpatient','consult-liaison':'Consult-liaison',emergency:'Emergency',community:'Community',mixed:'Mixed'}[location.locationTypeCode],
        curatorName:curator.displayName,
        curatorRole:role.fragment,
        audienceLabel:labels[0],
        durationLabel:labels[1],
        rotationDates:displayDateRange(value.context.rotationStart,value.context.rotationEnd),
        editionCheckedOn:displayDate(value.context.editionCheckedOn),
        editionCheckedOnLabel:'Self-attested',
        editionNumber:value.editionNumber,
        fingerprintPrefix:location.locationCode+'-'+(value.audience==='ms3'?'MS3':'RES')+'-',
        fingerprint:'',
        identityNotice:'Curator identity and institutional endorsement are not digitally verified by this link.',
        fingerprintNotice:'Compare this fingerprint with the curator. Matching codes confirm the same edition content, not identity or institutional approval.',
        provenance:[]
      },
      revisions:{
        createdAgainstCoreRevision:value.createdAgainstCoreRevision,
        currentCoreRevision:context.coreRevision,
        coreMatches:value.createdAgainstCoreRevision===context.coreRevision,
        createdAgainstCatalogRevision:value.createdAgainstLocalCatalogRevision,
        currentCatalogRevision:snapshot.revision,
        catalogMatches:value.createdAgainstLocalCatalogRevision===snapshot.revision
      },
      pathItems:[],
      firstDay:{arrival:null,accessItems:[],contacts:[],checklistItems:[]},
      typicalDay:null,
      workflow:{rounds:null,presentation:null,documentation:null},
      attendanceFeedback:{attendance:null,feedback:null},
      resources:[],
      authority:{
        coreLabel:AUTHORITY.coreLabel,
        localLabel:AUTHORITY.localLabel,
        requiredLabel:AUTHORITY.requiredLabel,
        recommendedLabel:AUTHORITY.recommendedLabel,
        optionalLabel:AUTHORITY.optionalLabel,
        resourceLabel:AUTHORITY.resourceLabel,
        localBoundary:AUTHORITY.localBoundary,
        documentationGuardrail:AUTHORITY.documentationGuardrail
      },
      changeSummary:{kindCodes:value.changeSummary.kindCodes.slice(),changedItemCount:value.changeSummary.changedItemCount,text:'',provenanceLabel:'Locally supplied edition summary; change lineage is not authenticated.'},
      emptyLocalPlan:Object.keys(value.localPlan).length===0
    };
    provenance(location);
    provenance(curator);
    provenance(phrases);
    for(i=0;i<graph.pathItems.length;i++){
      row=graph.pathItems[i];
      item={instanceId:row.value.instanceId,ref:row.value.ref,week:row.value.week,order:row.value.order,priority:row.value.priority,priorityLabel:priorityLabel(row.value.priority)};
      if(row.reason) item.reasonText=row.reason.fragment;
      model.pathItems.push(item);
    }
    if(plan.arrival){
      text=phrase('arrival',{timing:plan.arrival.value.timingCode,time:displayTime(plan.arrival.value.time),place:plan.arrival.place.displayName,role:plan.arrival.role.fragment});
      model.firstDay.arrival={text:text};
      if(plan.arrival.link) model.firstDay.arrival.link=linked(plan.arrival.link);
      model.firstDay.checklistItems.push({id:'local:generated:arrival',text:text,priority:'required',priorityLabel:'Required',sourceCode:'arrival'});
    }
    if(plan.schedule){
      model.typicalDay={summaryText:phrase('scheduleWindow',{dayStart:displayTime(plan.schedule.value.dayStart),dayEnd:displayTime(plan.schedule.value.dayEnd),endQualifier:{at:'at',about:'about','no-later-than':'no later than'}[plan.schedule.value.endQualifierCode]}),eventItems:[]};
      for(i=0;i<plan.schedule.events.length;i++){
        row=plan.schedule.events[i];
        priority=priorityLabel(row.value.priority);
        item={daySet:row.daySet.fragment,startTime:displayTime(row.value.startTime),activity:row.activity.fragment,priority:priority};
        if(own.call(row.value,'endTime')) item.endTime=displayTime(row.value.endTime);
        if(row.place) item.place=row.place.displayName;
        text=phrase(own.call(row.value,'endTime')?(row.place?'scheduleRangeWithPlace':'scheduleRangeWithoutPlace'):(row.place?'schedulePointWithPlace':'schedulePointWithoutPlace'),item);
        scheduleText[row.value.instanceId]=text;
        model.typicalDay.eventItems.push({id:row.value.instanceId,text:text,priority:row.value.priority,priorityLabel:priority});
      }
    }
    if(plan.rounds) model.workflow.rounds={text:phrase('rounds',{preparation:plan.rounds.preparation.fragment,participation:plan.rounds.participation.fragment,followUp:plan.rounds.followUp.fragment})};
    if(plan.presentation) model.workflow.presentation={text:phrase('presentation',{format:plan.presentation.format.fragment,timing:plan.presentation.timing.fragment,elements:englishList(plan.presentation.elements.map(function(record){ return record.fragment; }))})};
    if(plan.documentation){
      model.workflow.documentation={text:phrase('documentation',{workflow:plan.documentation.workflow.fragment,timing:plan.documentation.timing.fragment}),guardrailText:AUTHORITY.documentationGuardrail};
      if(plan.documentation.link) model.workflow.documentation.link=linked(plan.documentation.link);
    }
    if(plan.attendance){
      model.attendanceFeedback.attendance={text:phrase('attendance',{events:englishList(plan.attendance.value.eventInstanceIds.map(function(id){ return scheduleText[id]; })),absenceRole:plan.attendance.role.fragment})};
      if(plan.attendance.link) model.attendanceFeedback.attendance.link=linked(plan.attendance.link);
    }
    if(plan.feedback) model.attendanceFeedback.feedback={text:phrase('feedback',{cadence:plan.feedback.cadence.fragment,initiator:plan.feedback.initiator.fragment,setting:plan.feedback.setting.fragment})};
    if(plan.accessItems){
      for(i=0;i<plan.accessItems.length;i++){
        row=plan.accessItems[i];
        text=phrase('access',{item:row.item.fragment,due:row.due.fragment});
        item={id:row.value.instanceId,text:text,checklistId:'local:generated:access:'+row.value.instanceId};
        if(row.link) item.link=linked(row.link);
        model.firstDay.accessItems.push(item);
        model.firstDay.checklistItems.push({id:item.checklistId,text:text,priority:'required',priorityLabel:'Required',sourceCode:'access'});
      }
    }
    if(plan.contacts){
      for(i=0;i<plan.contacts.length;i++){
        row=plan.contacts[i];
        item={id:row.value.instanceId,text:phrase('contact',{role:row.role.fragment})};
        if(row.link) item.link=linked(row.link);
        model.firstDay.contacts.push(item);
      }
    }
    if(plan.checklistItems){
      for(i=0;i<plan.checklistItems.length;i++){
        row=plan.checklistItems[i];
        priority=priorityLabel(row.value.priority);
        model.firstDay.checklistItems.push({id:row.value.instanceId,text:phrase('checklist',{item:row.item.fragment,priority:priority}),priority:row.value.priority,priorityLabel:priority,sourceCode:'selected'});
      }
    }
    if(plan.resources){
      for(i=0;i<plan.resources.length;i++){
        row=plan.resources[i];
        priority=priorityLabel(row.value.priority);
        reason=row.reason;
        text=phrase(reason?'resourceWithReason':'resourceWithoutReason',reason?{title:row.link.title,priority:priority,week:String(row.value.week),reason:reason.fragment,hostname:row.link.visibleHostname}:{title:row.link.title,priority:priority,week:String(row.value.week),hostname:row.link.visibleHostname});
        item={id:row.value.instanceId,text:text,title:row.link.title,url:row.link.url,visibleHostname:row.link.visibleHostname,purposeCode:row.link.purposeCode,priority:row.value.priority,priorityLabel:priority,week:row.value.week,authorityLabel:AUTHORITY.resourceLabel};
        if(reason) item.reasonText=reason.fragment;
        model.resources.push(item);
        linked(row.link);
      }
    }
    model.changeSummary.text=phrase('changeSummary',{kinds:englishList(value.changeSummary.kindCodes.map(function(code){ return {initial:'Initial edition','edition-context':'Edition details','curriculum-selection':'Curriculum selection','curriculum-priority':'Curriculum priority','curriculum-reason':'Curriculum reason',schedule:'Schedule',arrival:'Arrival',workflow:'Team workflow',access:'Access preparation',contacts:'Contacts',checklist:'Checklist',resources:'Official resources'}[code]; })),count:String(value.changeSummary.changedItemCount)});
    return model;
  }

  function resolve(config,snapshot,mode,siteContext,subtle){
    var value,context,labels,graph,pairs;
    if(!branded.has(snapshot)||!oneOf(mode,['builder','learner'])) return Promise.resolve(resolveFailure());
    try{
      value=copy(config);
      context=contextValue(siteContext);
      if(!context||context.audience!==snapshot.audience||context.localCatalogRevision!==snapshot.revision||context.rotationEditionV2!==snapshot.rotationEditionV2) fail();
      labels=validateConfig(value);
      if(value.audience!==snapshot.audience) fail();
      graph=buildGraph(value,snapshot,mode,labels);
      pairs=Object.keys(graph.refs).sort().map(function(key){ return [key,graph.refs[key]]; });
    }catch(ignoreValidation){ return Promise.resolve(resolveFailure()); }
    return digest(pairs,subtle).then(function(referenceSetDigest){
      var model,resolved;
      try{
        model=renderGraph(graph,snapshot,context);
        resolved={config:deepFreeze(copy(value)),location:deepFreeze(copy(graph.location)),curator:deepFreeze(copy(graph.curator)),phraseSet:deepFreeze(copy(graph.phrases))};
        return {ok:true,resolved:deepFreeze(resolved),referenceSetDigest:referenceSetDigest,displayModel:deepFreeze(model),errors:[]};
      }catch(ignoreRender){ return resolveFailure(); }
    },function(){ return resolveFailure(); });
  }

  return {
    snapshot:prepare,
    record:recordFor,
    resolve:resolve,
    enabled:function(snapshot){ return branded.has(snapshot)&&snapshot.rotationEditionV2==='enabled'; }
  };
}());
var fdEditionCatalogSnapshot=FD_EDITION_CATALOG.snapshot;
var fdEditionCatalogRecord=FD_EDITION_CATALOG.record;
var fdEditionCatalogResolve=FD_EDITION_CATALOG.resolve;
var fdEditionPublicationEnabled=FD_EDITION_CATALOG.enabled;
