/* Patient resource pack: canonical Care resources in, escaped printable markup out.
   Pure ES5. No patient fields, persistence, route state, analytics, clock, or network access.
   Crisis HTML is the trusted build artifact from the shell's injected fdCrisisTemplate. */

var FD_CARE_PACK_LIMIT=3;

function fdCarePackSafeId(value){
  return typeof value==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)&&
    value!=='constructor'&&value!=='prototype';
}

function fdCarePackResources(index){
  var rows=index&&Array.isArray(index.careResources)?index.careResources:[];
  var seen=Object.create(null),out=[],item;
  for(var i=0;i<rows.length;i++){
    item=rows[i];
    if(!item||!fdCarePackSafeId(item.id)||seen[item.id]||
       typeof item.title!=='string'||!item.title||
       typeof item.description!=='string'||!item.description||
       typeof item.url!=='string'||!/^https:\/\/[^\s]+$/.test(item.url)) continue;
    seen[item.id]=true;
    out.push(item);
  }
  return out;
}

function fdCarePackIds(index,ids){
  var requested=Array.isArray(ids)?ids:[],resources=fdCarePackResources(index);
  var valid=Object.create(null),wanted=Object.create(null),out=[],i,id;
  for(i=0;i<resources.length;i++) valid[resources[i].id]=true;
  for(i=0;i<requested.length;i++){
    id=requested[i];
    if(fdCarePackSafeId(id)&&valid[id]) wanted[id]=true;
  }
  for(i=0;i<resources.length&&out.length<FD_CARE_PACK_LIMIT;i++){
    if(wanted[resources[i].id]) out.push(resources[i].id);
  }
  return out;
}

function fdCarePackToggle(index,ids,id){
  var current=fdCarePackIds(index,ids),resources=fdCarePackResources(index);
  var valid=false,next=[],found=false,i;
  if(!fdCarePackSafeId(id)) return current;
  for(i=0;i<resources.length;i++) if(resources[i].id===id){valid=true;break;}
  if(!valid) return current;
  for(i=0;i<current.length;i++){
    if(current[i]===id) found=true;
    else next.push(current[i]);
  }
  if(found) return next;
  if(current.length>=FD_CARE_PACK_LIMIT) return current;
  current.push(id);
  return fdCarePackIds(index,current);
}

function fdCarePackQrSvg(url,label){
  if(typeof url!=='string'||!/^https:\/\/[^\s]+$/.test(url)||typeof qrcode!=='function'){
    return {ok:false,code:'QR_UNAVAILABLE',svg:''};
  }
  try{
    var qr=qrcode(0,'M'),count,row,column,size,svg;
    qr.addData(url,'Byte');
    qr.make();
    count=qr.getModuleCount();
    size=(count+8)*4;
    svg='<svg viewBox="0 0 '+size+' '+size+'" role="img" aria-label="'+
      fdEsc('QR code for '+String(label||'resource'))+'" xmlns="http://www.w3.org/2000/svg">'+
      '<rect width="100%" height="100%" fill="white"/>';
    for(row=0;row<count;row++){
      for(column=0;column<count;column++){
        if(qr.isDark(row,column)) svg+='<rect x="'+((column+4)*4)+'" y="'+
          ((row+4)*4)+'" width="4" height="4" fill="black"/>';
      }
    }
    return {ok:true,code:'QR_READY',svg:svg+'</svg>'};
  }catch(ignoreQrFailure){
    return {ok:false,code:'QR_UNAVAILABLE',svg:''};
  }
}

function fdCarePackResource(item){
  var qr=fdCarePackQrSvg(item.url,item.title);
  return '<section class="fd-care-pack__resource">'+
    '<div class="fd-care-pack__resource-copy"><h4>'+fdEsc(item.title)+'</h4><p>'+
    fdEsc(item.description)+'</p><a href="'+fdEsc(item.url)+'" target="_blank" rel="noopener noreferrer">'+
    fdEsc(item.url)+'</a></div><div class="fd-care-pack__scan">'+
    (qr.ok?'<div class="fd-care-pack__qr">'+qr.svg+'</div><span>Scan to open</span>':
      '<span class="fd-care-pack__qr-fallback">QR unavailable</span>')+
    '</div></section>';
}

function fdCarePack(index,ids,crisisHtml){
  var resources=fdCarePackResources(index),selectedIds=fdCarePackIds(index,ids);
  var selected=Object.create(null),byId=Object.create(null),limit=selectedIds.length>=FD_CARE_PACK_LIMIT;
  var hasCrisis=typeof crisisHtml==='string'&&/class=["']crisis-block["']/.test(crisisHtml);
  var printReady=selectedIds.length>0&&hasCrisis;
  var out='',i,item,isSelected,disabled;
  for(i=0;i<selectedIds.length;i++) selected[selectedIds[i]]=true;
  for(i=0;i<resources.length;i++) byId[resources[i].id]=resources[i];

  out+='<section class="fd-care-pack'+(printReady?' is-print-ready':'')+'" aria-labelledby="fd-care-pack-title">'+
    '<header class="fd-care-pack__head"><div><h2 id="fd-care-pack-title">Build a resource handout</h2>'+
    '<p>Choose up to three resources. No patient details are collected or saved.</p></div>'+
    (hasCrisis?'<p class="fd-care-pack__included"><span aria-hidden="true">✓</span> Crisis resources are included automatically</p>':
      '<p class="fd-care-pack__crisis-failure" role="alert">This handout is unavailable because its crisis-resource block did not load.</p>')+'</header>'+
    '<div class="fd-care-pack__workbench"><section class="fd-care-pack__picker" aria-labelledby="fd-care-pack-picker-title">'+
    '<h3 id="fd-care-pack-picker-title">Choose resources</h3><div class="fd-care-pack__choices">';
  for(i=0;i<resources.length;i++){
    item=resources[i];
    isSelected=!!selected[item.id];
    disabled=limit&&!isSelected;
    out+='<button type="button" class="fd-care-pack__choice'+(isSelected?' is-selected':'')+'" '+
      'data-fd-care-pack="'+fdEsc(item.id)+'" aria-pressed="'+(isSelected?'true':'false')+'" '+
      'aria-describedby="fd-care-pack-limit"'+(disabled?' disabled':'')+'><span class="fd-care-pack__check" aria-hidden="true">✓</span>'+
      '<span><strong>'+fdEsc(item.title)+'</strong><small>'+fdEsc(item.description)+'</small></span></button>';
  }
  out+='</div><div class="fd-care-pack__picker-foot"><p id="fd-care-pack-limit"><strong>'+selectedIds.length+
    ' of '+FD_CARE_PACK_LIMIT+' selected</strong>'+(limit?' · Remove one to choose another.':'')+'</p>'+
    '<button type="button" class="fd-care-pack__clear" data-fd-care-pack-clear'+
    (selectedIds.length?'':' disabled')+'>Clear</button></div></section>'+
    '<article class="fd-care-pack__sheet" aria-labelledby="fd-care-pack-sheet-title">'+
    '<header class="fd-care-pack__sheet-head"><p>ReConnect collection</p><h3 id="fd-care-pack-sheet-title">Patient care resources</h3>'+
    '<span>Verify current details before using or sharing these resources.</span></header>';
  if(selectedIds.length){
    out+='<div class="fd-care-pack__resources">';
    for(i=0;i<selectedIds.length;i++){
      item=byId[selectedIds[i]];
      if(item) out+=fdCarePackResource(item);
    }
    out+='</div>';
  }else{
    out+='<p class="fd-care-pack__empty">Choose at least one resource to prepare the handout.</p>';
  }
  if(hasCrisis){
    out+='<details class="fd-care-pack__crisis"><summary>Crisis resources included automatically</summary>'+
      String(crisisHtml)+'</details>';
  }
  out+='<footer class="fd-care-pack__provenance">Created by Joshua Moss, MD from personally curated ReConnect databases.</footer>'+
    '</article></div><div class="fd-care-pack__actions"><p>Your choices stay only on this screen.</p>'+
    '<button type="button" class="fd-care-pack__print" data-fd-care-pack-print'+
    (!selectedIds.length||!hasCrisis?' disabled':'')+'>Print handout</button></div></section>';
  return out;
}
