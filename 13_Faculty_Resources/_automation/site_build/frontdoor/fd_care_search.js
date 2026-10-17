/* Public community resource directory. ES5; query, filters and page are visit-only memory.
   Fixed feed URL, no query transmission, storage, geolocation or clinical ranking. */
var FD_CARE_DIRECTORY_URL='/care-directory.v1.json';
var FD_CARE_DIRECTORY_CATEGORIES=['aftercare','crisis','peer_support','basic_needs','community_services','housing_shelters','recovery_meetings','telehealth_providers'];

function fdCareDirectoryText(value,max){return typeof value==='string'?value.slice(0,max||600):'';}
function fdCareDirectoryWebsite(value){
  if(typeof value!=='string'||!/^https?:\/\//i.test(value)||/[\x00-\x20\x7f\\]/.test(value))return '';
  try{var url=new URL(value);return url.username||url.password?'':url.href;}catch(_){return '';}
}
function fdCareDirectoryContact(value){
  return typeof value==='string'&&/^(?:tel:\+?\d{3,15}|sms:\+?\d{5,15}(?:\?body=[A-Z0-9%]{1,80})?)$/.test(value)?value:'';
}
function fdCareDirectoryDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';
  var date=new Date(value+'T00:00:00Z');
  return isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:'';
}
function fdCareDirectoryValidate(raw){
  if(!raw||raw.schemaVersion!==1||!Array.isArray(raw.records)||raw.records.length>15000||
      !Array.isArray(raw.categories)||!Array.isArray(raw.regionOptions)||typeof raw.generatedAt!=='string'||
      !isFinite(Date.parse(raw.generatedAt)))throw new Error('Directory format unavailable');
  var out={records:[],categories:[],regionOptions:[],generatedAt:raw.generatedAt,partial:false},known=Object.create(null),seen=Object.create(null);
  for(var c=0;c<FD_CARE_DIRECTORY_CATEGORIES.length;c++){
    var id=FD_CARE_DIRECTORY_CATEGORIES[c],source=null;
    for(var k=0;k<raw.categories.length;k++)if(raw.categories[k]&&raw.categories[k].id===id)source=raw.categories[k];
    var available=!!(source&&source.available===true);
    known[id]=available;out.partial=out.partial||!available;
    out.categories.push({id:id,label:source?fdCareDirectoryText(source.label,80):id.replace(/_/g,' '),available:available,
      expected:source&&typeof source.count==='number'&&source.count>=0&&Math.floor(source.count)===source.count?source.count:null});
  }
  for(var r=0;r<raw.regionOptions.length&&r<30;r++){
    var region=fdCareDirectoryText(raw.regionOptions[r],80);
    if(region&&out.regionOptions.indexOf(region)===-1)out.regionOptions.push(region);
  }
  for(var i=0;i<raw.records.length;i++){
    var row=raw.records[i];
    if(!row||!known[row.category]||typeof row.name!=='string'||!row.name.trim()||
        typeof row.id!=='string'||seen[row.id]||!Array.isArray(row.regions)) {out.partial=true;continue;}
    seen[row.id]=true;
    var item={id:row.id,category:row.category,name:fdCareDirectoryText(row.name,200),
      description:fdCareDirectoryText(row.description,420),details:fdCareDirectoryText(row.details,600),
      area:fdCareDirectoryText(row.area,150),regions:row.regions.filter(function(v){return out.regionOptions.indexOf(v)!==-1;}),
      phone:fdCareDirectoryText(row.phone,180),contactHref:fdCareDirectoryContact(row.contactHref),
      website:fdCareDirectoryWebsite(row.website),verifiedDate:fdCareDirectoryDate(row.verifiedDate),
      reviewAfter:fdCareDirectoryDate(row.reviewAfter),verificationRequired:row.verificationRequired!==false};
    item.searchText=(item.name+' '+item.description+' '+item.details+' '+item.area).toLowerCase();
    out.records.push(item);
  }
  if(raw.records.length&&!out.records.length)throw new Error('Directory records unavailable');
  for(var x=0;x<out.categories.length;x++){
    var cat=out.categories[x],count=out.records.filter(function(row){return row.category===cat.id;}).length;
    if(cat.available&&(cat.expected===null||cat.expected!==count))out.partial=true;
  }
  return out;
}
function fdCareDirectorySearch(data,query,category,region,page){
  var q=String(query||'').trim().toLowerCase(),tokens=q.split(/\s+/).filter(Boolean),matches=[];
  var namePhrase=q?new RegExp('(^|[^a-z0-9])'+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^a-z0-9])'):null;
  if(!q&&!category&&!region)return {idle:true,total:0,rows:[],allIds:[],page:1,pages:0};
  var maine=region&&region!=='NH'&&region!=='VT/Other NE';
  for(var i=0;i<data.records.length;i++){
    var row=data.records[i];
    if(category&&row.category!==category)continue;
    if(region&&row.regions.indexOf(region)===-1&&!(maine&&row.regions.indexOf('Statewide')!==-1))continue;
    if(!tokens.every(function(token){return row.searchText.indexOf(token)!==-1;}))continue;
    matches.push(row);
  }
  matches.sort(function(a,b){
    var ar=namePhrase&&namePhrase.test(a.name.toLowerCase())?0:1,br=namePhrase&&namePhrase.test(b.name.toLowerCase())?0:1;
    return ar-br||a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
  });
  var pages=Math.ceil(matches.length/5),current=Math.min(Math.max(1,page||1),pages||1);
  /* allIds spans every page: "Add all results" means all matches, not just the visible five. */
  return {idle:false,total:matches.length,page:current,pages:pages,rows:matches.slice((current-1)*5,current*5),
    allIds:matches.map(function(row){return row.id;})};
}
function fdCareDirectorySummary(result){
  if(result.idle)return 'Search by resource name or service, or choose a category or region.';
  if(!result.total)return 'No matching listings. Try fewer words, another category, or a wider region.';
  return ((result.page-1)*5+1)+'–'+Math.min(result.page*5,result.total)+' of '+result.total+' listings';
}
/* ctx is optional (the aftercare-packet context). Without it the markup is exactly what shipped before. */
function fdCareDirectoryResults(data,result,today,ctx){
  var out='<h3 class="fd-care-search__count" id="fd-care-directory-count" tabindex="-1">'+fdEsc(fdCareDirectorySummary(result))+'</h3>';
  if(result.idle||!result.total)return out;
  if(ctx)out+=fdCarePacketBulk(result,ctx);
  out+='<ol class="fd-care-search__list" start="'+((result.page-1)*5+1)+'">';
  for(var i=0;i<result.rows.length;i++){
    var row=result.rows[i],label=row.category;
    for(var c=0;c<data.categories.length;c++)if(data.categories[c].id===row.category)label=data.categories[c].label;
    var date=row.verifiedDate&&row.verifiedDate<=today?row.verifiedDate:'';
    var due=!date||row.verificationRequired||!row.reviewAfter||row.reviewAfter<=today;
    var packed=!!(ctx&&ctx.ids[row.id]);
    out+='<li class="fd-care-search__result"><article'+(packed?' class="is-packed"':'')+'><p class="fd-care-search__meta">'+fdEsc(label)+' · '+fdEsc(row.area||'Area not recorded')+
      (packed?' · <span class="fd-care-search__packed">In packet</span>':'')+'</p>'+
      '<h4>'+fdEsc(row.name)+'</h4>'+(row.description?'<p>'+fdEsc(row.description)+'</p>':'')+
      (row.details?'<p class="fd-care-search__details">'+fdEsc(row.details)+'</p>':'')+
      '<p class="fd-care-search__verification">'+(date?'Recorded verification: <time datetime="'+date+'">'+date+'</time>. ':'Verification date not recorded. ')+
      (due?'<strong>Verification due.</strong> ':'')+'Confirm current details with the service.</p>'+
      '<div class="fd-care-search__actions">';
    if(row.contactHref)out+='<a href="'+fdEsc(row.contactHref)+'" aria-label="'+fdEsc((row.contactHref.indexOf('sms:')===0?'Text ':'Call ')+row.name)+'">'+
      (row.contactHref.indexOf('sms:')===0?'Text':'Call')+' <span>'+fdEsc(row.phone)+'</span></a>';
    else if(row.phone)out+='<span class="fd-care-search__contact">Contact listed: '+fdEsc(row.phone)+'</span>';
    if(row.website)out+='<a href="'+fdEsc(row.website)+'" target="_blank" rel="noopener noreferrer" aria-label="'+fdEsc('Website for '+row.name+' (opens in a new tab)')+'">Website <span aria-hidden="true">↗</span></a>';
    if(!row.contactHref&&!row.website)out+='<span class="fd-care-search__contact">No usable contact link listed.</span>';
    if(ctx)out+=fdCarePacketButton(row,ctx);
    out+='</div></article></li>';
  }
  out+='</ol>';
  if(result.pages>1)out+='<nav class="fd-care-search__pages" aria-label="Directory result pages">'+
    '<button type="button" data-care-directory-page="'+(result.page-1)+'"'+(result.page===1?' disabled':'')+'>Previous</button>'+
    '<span>Page '+result.page+' of '+result.pages+'</span><button type="button" data-care-directory-page="'+(result.page+1)+'"'+
    (result.page===result.pages?' disabled':'')+'>Next</button></nav>';
  return out;
}
function fdCareSearch(index){
  var resources=index&&index.careResources||[],finder='';
  for(var i=0;i<resources.length;i++)if(resources[i].id==='resource-finder')finder=resources[i].url;
  return '<section class="fd-care-search" data-care-directory aria-labelledby="fd-care-search-title">'+
    '<header class="fd-care-search__head"><div><p class="fd-care-search__eyebrow">Community directory</p><h2 id="fd-care-search-title">Find community resources</h2>'+
    '<p>Aftercare, recovery support, housing and other community services.</p></div>'+
    (finder?'<a class="fd-care-search__finder" href="'+fdEsc(finder)+'" target="_blank" rel="noopener noreferrer">Open full Finder <span aria-hidden="true">↗</span><span class="vh-live"> (opens in a new tab)</span></a>':'')+'</header>'+
    '<form class="fd-care-search__form" role="search" aria-label="Community resources" autocomplete="off">'+
    '<div class="fd-care-search__query"><label for="fd-care-directory-query">Resource name or service</label><input id="fd-care-directory-query" type="search" autocomplete="off" spellcheck="false" maxlength="120" placeholder="Try peer support or counseling" aria-describedby="fd-care-directory-privacy"></div>'+
    '<div class="fd-care-search__filters"><div><label for="fd-care-directory-category">Category</label><select id="fd-care-directory-category"><option value="">All categories</option></select></div>'+
    '<div><label for="fd-care-directory-region">Region</label><select id="fd-care-directory-region"><option value="">All regions</option></select></div>'+
    '<button type="button" data-care-directory-clear>Clear</button></div></form>'+
    '<p class="fd-care-search__privacy" id="fd-care-directory-privacy">Use resource names or services. Keep patient details out of search. Your search stays in this tab.</p>'+
    '<div class="fd-care-search__notice" data-care-directory-notice></div><div data-care-directory-results aria-busy="true"><p>Loading directory…</p></div>'+
    /* The packet tray sits after the results and outside their mount, so typing never repaints it. */
    (typeof fdCarePacketEnabled==='function'&&fdCarePacketEnabled()?'<div class="fd-care-search__tray" data-fd-care-packet-tray></div>'+
      /* The preview region is always present while the packet exists, hidden when closed, so the tray button's aria-controls never dangles. */
      '<div class="fd-care-search__preview" id="fd-care-packet-preview" data-fd-care-packet-preview hidden></div>':'')+
    '<p class="fd-care-search__foot">Listings do not confirm availability, eligibility or referral acceptance. Maine region filters also include statewide listings. Use Safety for urgent guidance.</p></section>';
}

/* Owns one visit, separate from fdWire history/persistence. Only the result mount
   changes while typing; native inputs and their focus/caret stay in place. */
function fdCreateCareDirectory(packet){
  var data=null,error=false,loading=false,query='',category='',region='',page=1,lastResult=null;
  var root=null,status=null,timer=null,timeout=null,abort=null,generation=0;
  function announce(message){if(status&&!(document.querySelector('[role="dialog"][aria-modal="true"]')))status.textContent=message;}
  /* quiet: a packet change repaints the results without replacing the packet's own announcement. */
  function paint(focus,quiet){
    if(!root||!root.isConnected)return;
    var mount=root.querySelector('[data-care-directory-results]'),notice=root.querySelector('[data-care-directory-notice]');
    if(!mount)return;
    mount.setAttribute('aria-busy',loading?'true':'false');
    if(loading){mount.innerHTML='<p>Loading directory…</p>';announce('Loading directory…');return;}
    if(error||!data){notice.textContent='';mount.innerHTML='<p>Directory search is unavailable. Try again or open the full Finder.</p><button class="fd-care-search__retry" type="button" data-care-directory-retry>Try again</button>';announce('Directory search is unavailable.');return;}
    var old=Date.now()-Date.parse(data.generatedAt)>7*86400000;
    var warning=(data.partial?'Some categories or listings could not be loaded. These results are incomplete. ':'')+
      (old?'This directory snapshot is more than a week old. ':'');
    notice.textContent=warning+'Directory snapshot: '+data.generatedAt.slice(0,10)+'.';
    var result=fdCareDirectorySearch(data,query,category,region,page);page=result.page;lastResult=result;
    mount.innerHTML=fdCareDirectoryResults(data,result,new Date().toISOString().slice(0,10),packet?packet.context():null);
    if(!quiet)announce(warning+fdCareDirectorySummary(result));
    if(focus){var count=mount.querySelector('#fd-care-directory-count');if(count)count.focus();}
  }
  function options(){
    if(!root||!data)return;
    var cat=root.querySelector('#fd-care-directory-category'),reg=root.querySelector('#fd-care-directory-region');
    cat.innerHTML='<option value="">All categories</option>'+data.categories.map(function(c){return '<option value="'+fdEsc(c.id)+'"'+(!c.available?' disabled':'')+'>'+fdEsc(c.label)+(c.available?'':' — unavailable')+'</option>';}).join('');
    reg.innerHTML='<option value="">All regions</option>'+data.regionOptions.map(function(r){return '<option value="'+fdEsc(r)+'">'+fdEsc(r)+'</option>';}).join('');
    cat.value=category;reg.value=region;
  }
  function load(){
    if(loading)return;
    loading=true;error=false;var token=++generation;paint(false);
    abort=typeof AbortController==='function'?new AbortController():null;
    function fail(){if(token!==generation)return;clearTimeout(timeout);loading=false;error=true;paint(false);}
    timeout=setTimeout(function(){if(token!==generation)return;if(abort)abort.abort();fail();generation++;},10000);
    if(typeof fetch!=='function'){fail();return;}
    fetch(FD_CARE_DIRECTORY_URL,{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:abort?abort.signal:undefined})
      .then(function(response){if(!response.ok)throw new Error('Directory request failed');return response.text();})
      .then(function(body){if(token!==generation)return;if(body.length>8000000)throw new Error('Directory too large');data=fdCareDirectoryValidate(JSON.parse(body));clearTimeout(timeout);loading=false;error=false;options();paint(false);if(packet)packet.refresh();})
      .catch(fail);
  }
  /* Put focus back after a repaint. A hit names an attribute and the value to find (never spliced into a
     selector, so an id can hold any character); fallbacks cover a button that became disabled. */
  function focusAt(hit){
    if(!root||!hit||!hit.attr)return;
    var found=null,attrs=[hit.attr],i,nodes;
    if(hit.attr==='id')found=root.querySelector('#'+hit.id);
    else{
      if(hit.fallback)attrs.push(hit.fallback);
      attrs.push('data-fd-care-packet-remove');
      for(var a=0;a<attrs.length&&!found;a++){
        nodes=root.querySelectorAll('['+attrs[a]+']');
        for(i=0;i<nodes.length;i++)if(nodes[i].getAttribute(attrs[a])===hit.id&&!nodes[i].disabled){found=nodes[i];break;}
      }
    }
    /* No preventScroll: on a phone the browser must be free to honour the shell's scroll-padding, or a
       restored control can end up under the fixed bottom tab bar (WCAG 2.4.11). */
    if(found)found.focus();
  }
  function mount(node,live){
    root=node;status=live;if(!root)return;
    root.querySelector('#fd-care-directory-query').value=query;options();
    root.oninput=function(event){
      if(packet&&packet.handleInput(event.target))return;
      if(event.target.id!=='fd-care-directory-query')return;query=event.target.value;page=1;clearTimeout(timer);timer=setTimeout(function(){paint(false);},180);};
    /* The packet's own controls: a hit with keep:true is a control the packet patches in place, which keeps its focus (a
       change event also fires when the trainee tabs AWAY from a field, so refocusing it would steal focus). */
    root.onkeydown=function(event){
      var hit=packet?packet.handleKey(event):null;
      if(hit)focusAt(hit);
    };
    root.onchange=function(event){
      if(packet&&packet.owns(event.target)){
        var owned=packet.handleChange(event.target);
        if(owned&&!owned.keep)focusAt(owned);
        return;
      }
      if(event.target.id==='fd-care-directory-category')category=event.target.value;else if(event.target.id==='fd-care-directory-region')region=event.target.value;else return;page=1;paint(false);};
    root.querySelector('form').onsubmit=function(event){event.preventDefault();clearTimeout(timer);paint(false);};
    root.onclick=function(event){
      var target=event.target.closest('button');if(!target||!root.contains(target))return;
      if(packet){
        if(target.hasAttribute('data-fd-care-packet-page')||target.hasAttribute('data-fd-care-packet-all')){
          var every=target.hasAttribute('data-fd-care-packet-all');
          packet.addMany(every?lastResult.allIds:lastResult.rows.map(function(row){return row.id;}));
          var again=root.querySelector(every?'[data-fd-care-packet-all]:not([disabled])':'[data-fd-care-packet-page]:not([disabled])');
          /* When both bulk buttons are now disabled, the tray heading is the useful place for focus: its
             name carries the new packet count. */
          (again||root.querySelector('#fd-care-packet-title')||root.querySelector('#fd-care-directory-count')).focus();
          return;
        }
        var hit=packet.handleClick(target);
        if(hit){if(!hit.keep)focusAt(hit);return;}
      }
      if(target.hasAttribute('data-care-directory-clear')){query='';category='';region='';page=1;root.querySelector('#fd-care-directory-query').value='';options();paint(false);root.querySelector('#fd-care-directory-query').focus();}
      else if(target.hasAttribute('data-care-directory-retry')){root.querySelector('#fd-care-directory-query').focus({preventScroll:true});load();}
      else if(target.hasAttribute('data-care-directory-page')){page=Number(target.getAttribute('data-care-directory-page'));paint(true);}
    };
    if(packet)packet.mount(root.querySelector('[data-fd-care-packet-tray]'),status,function(){return data;},function(){paint(false,true);},root.querySelector('[data-fd-care-packet-preview]'));
    if(!data&&!loading&&!error)load();else paint(false);
  }
  function leave(){if(packet)packet.leave();generation++;if(abort)abort.abort();clearTimeout(timeout);clearTimeout(timer);data=null;query='';category='';region='';page=1;loading=false;error=false;root=null;if(status)status.textContent='';status=null;}
  return {mount:mount,leave:leave};
}
