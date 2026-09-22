/* Development-only private practice engine. It accepts caller-owned data and returns caller-owned
   state or markup without evaluating the learner's classifications. */

var FD_APP_PRACTICE_FORBIDDEN={
  score:true,threshold:true,pass:true,fail:true,passing:true,correct:true,answerkey:true,
  expectedcategory:true,result:true,evaluation:true,
  dose:true,dosage:true,freetext:true,textinput:true,proprietaryitem:true,itemtext:true,
  patientname:true,mrn:true,dateofbirth:true,dob:true
};

var FD_APP_PRACTICE_CATEGORIES=['still-known','changed','clarify'];

function fdAppPracticeOwn(value,key){
  return !!value&&Object.prototype.hasOwnProperty.call(value,key);
}

function fdAppPracticeObject(value){
  return !!value&&typeof value==='object'&&!Array.isArray(value);
}

function fdAppPracticeNonEmptyString(value,field){
  if(typeof value!=='string'||!value.trim()) throw new Error(field+' must be a non-empty string');
}

function fdAppPracticeKebabId(value,field){
  fdAppPracticeNonEmptyString(value,field);
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new Error(field+' must be kebab-case');
}

function fdAppPracticeExactKeys(value,keys,field){
  if(!fdAppPracticeObject(value)) throw new Error(field+' must be an object');
  var actual=Object.keys(value);
  if(actual.length!==keys.length) throw new Error(field+' must contain exactly '+keys.join(', '));
  for(var i=0;i<keys.length;i++){
    if(!fdAppPracticeOwn(value,keys[i])) throw new Error(field+' must contain exactly '+keys.join(', '));
  }
}

function fdAppPracticeRejectFields(value,path){
  if(!value||typeof value!=='object') return;
  if(Array.isArray(value)){
    for(var i=0;i<value.length;i++) fdAppPracticeRejectFields(value[i],path+'['+i+']');
    return;
  }
  for(var key in value){
    if(!fdAppPracticeOwn(value,key)) continue;
    var normalized=String(key).toLowerCase().replace(/[^a-z0-9]/g,'');
    if(FD_APP_PRACTICE_FORBIDDEN[normalized]){
      throw new Error('Forbidden field '+key+' at '+path);
    }
    fdAppPracticeRejectFields(value[key],path+'.'+key);
  }
}

function fdAppPracticeTextRows(rows,field){
  if(!Array.isArray(rows)||rows.length!==3) throw new Error(field+' must contain exactly three entries');
  var ids={};
  for(var i=0;i<rows.length;i++){
    var row=rows[i];
    fdAppPracticeExactKeys(row,['id','text'],field+' entry '+i);
    fdAppPracticeKebabId(row.id,field+' entry '+i+' id');
    if(ids[row.id]) throw new Error('Duplicate '+field+' id '+row.id);
    ids[row.id]=true;
    fdAppPracticeNonEmptyString(row.text,field+' entry '+row.id+' text');
  }
}

function fdAppPracticeValidate(pack){
  fdAppPracticeExactKeys(pack,['id','title','snapshot','change','statements','supervisorQuestions'],
    'Practice pack');
  fdAppPracticeRejectFields(pack,'pack');
  fdAppPracticeKebabId(pack.id,'Practice pack id');
  fdAppPracticeNonEmptyString(pack.title,'Practice pack title');
  if(!Array.isArray(pack.snapshot)||pack.snapshot.length<2||pack.snapshot.length>3){
    throw new Error('Practice pack snapshot must contain two or three strings');
  }
  for(var i=0;i<pack.snapshot.length;i++){
    fdAppPracticeNonEmptyString(pack.snapshot[i],'Practice pack snapshot '+i);
  }
  fdAppPracticeNonEmptyString(pack.change,'Practice pack change');
  fdAppPracticeTextRows(pack.statements,'statements');
  fdAppPracticeTextRows(pack.supervisorQuestions,'supervisorQuestions');
  return true;
}

function fdAppPracticeFind(packs,id){
  var list=Array.isArray(packs)?packs:[];
  for(var i=0;i<list.length;i++) if(list[i]&&list[i].id===id) return list[i];
  return null;
}

function fdAppPracticeCopy(value){
  var source=value||{},copy={};
  for(var key in source) if(fdAppPracticeOwn(source,key)) copy[key]=source[key];
  return copy;
}

function fdAppPracticeHasId(rows,id){
  for(var i=0;i<rows.length;i++) if(rows[i].id===id) return true;
  return false;
}

function fdAppPracticeAllClassified(session){
  for(var i=0;i<session.pack.statements.length;i++){
    if(!fdAppPracticeOwn(session.classifications,session.pack.statements[i].id)) return false;
  }
  return true;
}

function fdAppPracticeValidateSession(session){
  fdAppPracticeExactKeys(session,['pack','revealed','classifications','questionId'],'Practice session');
  fdAppPracticeValidate(session.pack);
  if(typeof session.revealed!=='boolean') throw new Error('Practice session revealed must be boolean');
  if(!fdAppPracticeObject(session.classifications)) throw new Error('Practice session classifications must be an object');
  for(var id in session.classifications){
    if(!fdAppPracticeOwn(session.classifications,id)) continue;
    if(!fdAppPracticeHasId(session.pack.statements,id)) throw new Error('Unknown statement '+id);
    if(FD_APP_PRACTICE_CATEGORIES.indexOf(session.classifications[id])<0){
      throw new Error('Unknown category '+session.classifications[id]);
    }
  }
  if(session.questionId!==null){
    if(typeof session.questionId!=='string'||!fdAppPracticeHasId(session.pack.supervisorQuestions,session.questionId)){
      throw new Error('Unknown supervision question '+session.questionId);
    }
    if(!fdAppPracticeAllClassified(session)) throw new Error('Classify every statement first');
  }
  return true;
}

function fdAppPracticeStart(pack){
  fdAppPracticeValidate(pack);
  return {pack:pack,revealed:false,classifications:{},questionId:null};
}

function fdAppPracticeReveal(session){
  fdAppPracticeValidateSession(session);
  return {pack:session.pack,revealed:true,
    classifications:fdAppPracticeCopy(session.classifications),questionId:session.questionId};
}

function fdAppPracticeClassify(session,statementId,categoryId){
  fdAppPracticeValidateSession(session);
  if(!session.revealed) throw new Error('Reveal the change before classifying statements');
  if(FD_APP_PRACTICE_CATEGORIES.indexOf(categoryId)<0) throw new Error('Unknown category '+categoryId);
  if(!fdAppPracticeHasId(session.pack.statements,statementId)) throw new Error('Unknown statement '+statementId);
  var classifications=fdAppPracticeCopy(session.classifications);
  classifications[statementId]=categoryId;
  return {pack:session.pack,revealed:true,classifications:classifications,questionId:null};
}

function fdAppPracticeChooseQuestion(session,questionId){
  fdAppPracticeValidateSession(session);
  if(!fdAppPracticeAllClassified(session)) throw new Error('Classify every statement first');
  if(!fdAppPracticeHasId(session.pack.supervisorQuestions,questionId)){
    throw new Error('Unknown supervision question '+questionId);
  }
  return {pack:session.pack,revealed:true,
    classifications:fdAppPracticeCopy(session.classifications),questionId:questionId};
}

function fdAppPracticeReset(session){
  fdAppPracticeValidateSession(session);
  return fdAppPracticeStart(session.pack);
}

function fdAppPracticeEsc(value){
  return String(value===undefined||value===null?'':value)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function fdAppPracticeCategoryLabel(category){
  if(category==='still-known') return 'Still known';
  if(category==='changed') return 'Changed';
  if(category==='clarify') return 'Need to clarify';
  return '';
}

function fdAppPracticeRender(session){
  fdAppPracticeValidateSession(session);
  var pack=session.pack,out='<section class="fd-app-practice'+
    (session.revealed?' is-revealed':'')+'" aria-labelledby="fd-app-practice-title">';
  out+='<div class="fd-app-practice__head"><div><span>One detail changes</span>'+
    '<h2 id="fd-app-practice-title">'+fdAppPracticeEsc(pack.title)+'</h2></div>'+
    '<button type="button" class="fd-app-practice__close" data-fd-app-practice-close>Close</button></div>';
  out+='<div class="fd-app-practice__snapshot"><h3>Starting snapshot</h3><ul>';
  for(var i=0;i<pack.snapshot.length;i++) out+='<li>'+fdAppPracticeEsc(pack.snapshot[i])+'</li>';
  out+='</ul></div>';
  if(!session.revealed){
    out+='<button type="button" class="fd-app-practice__action" data-fd-app-practice-reveal>'+
      'Reveal one change</button>';
  }else{
    out+='<div class="fd-app-practice__change"><div class="fd-app-practice__before">'+
      '<strong>Before</strong><p>'+fdAppPracticeEsc(pack.snapshot[pack.snapshot.length-1])+'</p></div>'+
      '<div class="fd-app-practice__seam" aria-hidden="true">Changed</div>'+
      '<div class="fd-app-practice__now"><strong>Now</strong><p>'+fdAppPracticeEsc(pack.change)+'</p></div></div>';
    for(var s=0;s<pack.statements.length;s++){
      var statement=pack.statements[s],selected=session.classifications[statement.id]||'';
      out+='<div class="fd-app-practice__row"><p>'+fdAppPracticeEsc(statement.text)+'</p>'+
        '<div class="fd-app-practice__choices" role="group" aria-label="Classify statement '+(s+1)+'">';
      for(var c=0;c<FD_APP_PRACTICE_CATEGORIES.length;c++){
        var category=FD_APP_PRACTICE_CATEGORIES[c];
        out+='<button type="button" data-fd-app-practice-classify="'+
          fdAppPracticeEsc(statement.id+':'+category)+'" aria-pressed="'+
          (selected===category?'true':'false')+'">'+fdAppPracticeCategoryLabel(category)+'</button>';
      }
      out+='</div></div>';
    }
    if(fdAppPracticeAllClassified(session)){
      out+='<p class="fd-app-practice__summary" role="status">You classified '+
        pack.statements.length+' statements.</p>';
      out+='<div class="fd-app-practice__questions" role="group" aria-label="Question to bring to supervision">';
      for(var q=0;q<pack.supervisorQuestions.length;q++){
        var question=pack.supervisorQuestions[q];
        out+='<button type="button" data-fd-app-practice-question="'+fdAppPracticeEsc(question.id)+
          '" aria-pressed="'+(session.questionId===question.id?'true':'false')+'">'+
          fdAppPracticeEsc(question.text)+'</button>';
      }
      out+='</div>';
    }
    if(session.questionId){
      out+='<p class="fd-app-practice__recap" role="status">Question selected for supervision.</p>';
    }
    out+='<button type="button" class="fd-app-practice__reset" data-fd-app-practice-reset>Start again</button>';
  }
  out+='<p class="fd-app-practice__privacy">Private rehearsal. No saved response, and nothing is sent.</p>';
  return out+'</section>';
}
