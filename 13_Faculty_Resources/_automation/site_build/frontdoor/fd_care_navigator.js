/* Fixed-choice Care navigator. Pure ES5: curriculum in, escaped HTML out. */

function fdCareNavigatorEntries(index){
  var idx=index||{}, resources=Array.isArray(idx.careResources)?idx.careResources:[];
  var intents=Array.isArray(idx.careNavigator)?idx.careNavigator:[], byId={}, out=[];
  var seenIntents={};
  var idPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var i,j,intent,primary,alternatives,seen,alternative;
  for(i=0;i<resources.length;i++){
    if(resources[i]&&typeof resources[i].id==='string'&&idPattern.test(resources[i].id)&&
       typeof resources[i].title==='string'&&resources[i].title&&
       typeof resources[i].description==='string'&&resources[i].description&&
       typeof resources[i].url==='string'&&/^https:\/\//.test(resources[i].url)){
      byId[resources[i].id]=resources[i];
    }
  }
  for(i=0;i<intents.length;i++){
    intent=intents[i];
    if(!intent||typeof intent.id!=='string'||!idPattern.test(intent.id)||
       typeof intent.label!=='string'||!intent.label||
       typeof intent.explanation!=='string'||!intent.explanation||seenIntents[intent.id]) continue;
    seenIntents[intent.id]=true;
    primary=byId[intent.primaryResourceId];
    if(!primary) continue;
    alternatives=[];
    seen={};
    seen[primary.id]=true;
    for(j=0;j<(intent.alternativeResourceIds||[]).length&&alternatives.length<2;j++){
      alternative=byId[intent.alternativeResourceIds[j]];
      if(!alternative||seen[alternative.id]) continue;
      seen[alternative.id]=true;
      alternatives.push(alternative);
    }
    out.push({
      id:intent.id,
      label:intent.label,
      explanation:intent.explanation,
      primary:primary,
      alternatives:alternatives
    });
  }
  return out;
}

function fdCareNavigatorSelection(index,selectedIntentId){
  var entries=fdCareNavigatorEntries(index), selected=String(selectedIntentId||'');
  for(var i=0;i<entries.length;i++) if(entries[i].id===selected) return entries[i];
  return null;
}

function fdCareNavigatorLink(item,kicker){
  return '<a class="fd-care-navigator__link" data-care-recommendation="'+fdEsc(item.id)+'" '+
    'data-care-resource="'+fdEsc(item.id)+'" href="'+fdEsc(item.url)+'" target="_blank" '+
    'rel="noopener noreferrer"><span class="fd-care-navigator__kicker">'+fdEsc(kicker)+'</span>'+
    '<span class="fd-care-navigator__link-title">'+fdEsc(item.title)+'</span>'+
    '<span class="fd-care-navigator__link-description">'+fdEsc(item.description)+'</span></a>';
}

function fdCareNavigator(index,selectedIntentId){
  var entries=fdCareNavigatorEntries(index);
  if(!entries.length) return '';
  var selected=fdCareNavigatorSelection(index,selectedIntentId), out='';
  out+='<section class="fd-care-navigator" aria-labelledby="fd-care-navigator-title">'+
    '<div class="fd-care-navigator__head"><h2 id="fd-care-navigator-title">What are you trying to do?</h2>'+
    '<p>Choose the task—not patient details.</p></div><div class="fd-care-navigator__choices">';
  for(var i=0;i<entries.length;i++){
    var active=!!selected&&selected.id===entries[i].id;
    out+='<button type="button" class="fd-care-navigator__choice'+(active?' is-selected':'')+'" '+
      'data-fd-care-intent="'+fdEsc(entries[i].id)+'" aria-pressed="'+(active?'true':'false')+'">'+
      '<span class="fd-care-navigator__check" aria-hidden="true">✓</span>'+
      '<span>'+fdEsc(entries[i].label)+'</span></button>';
  }
  out+='</div>';
  if(selected){
    out+='<span class="fd-visually-hidden" role="status" aria-live="polite">Selected '+
      fdEsc(selected.label)+'. Best starting point: '+fdEsc(selected.primary.title)+'.</span>'+
      '<section class="fd-care-navigator__result" aria-labelledby="fd-care-navigator-result-title">'+
      '<div class="fd-care-navigator__result-head"><h3 id="fd-care-navigator-result-title">Your starting point</h3>'+
      '<p>'+fdEsc(selected.explanation)+'</p></div>'+
      fdCareNavigatorLink(selected.primary,'Best starting point');
    if(selected.alternatives.length){
      out+='<div class="fd-care-navigator__alternatives" aria-label="Also useful">';
      for(var j=0;j<selected.alternatives.length;j++){
        out+=fdCareNavigatorLink(selected.alternatives[j],'Also useful');
      }
      out+='</div>';
    }
    out+='<button type="button" class="fd-care-navigator__clear" data-fd-care-clear>Clear choice</button></section>';
  }
  return out+'</section>';
}
