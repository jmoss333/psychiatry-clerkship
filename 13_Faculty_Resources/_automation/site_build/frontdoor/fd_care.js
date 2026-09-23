/* Patient care resources: a quiet, governed launch shelf for stable external destinations.
   Pure ES5 renderer. All links are fixed curriculum URLs and open in a separate tab; no query,
   route state, or patient context is ever appended. This is navigation, not attested Clerkship
   content, completion work, or a substitute for supervision. */

function fdCareGroup(resources, group, title, intro){
  var rows=Array.isArray(resources)?resources:[], matched=[];
  for(var i=0;i<rows.length;i++) if(rows[i]&&rows[i].group===group) matched.push(rows[i]);
  if(!matched.length) return '';
  var out='<section class="fd-care-group" aria-labelledby="fd-care-'+fdEsc(group)+'">'+
    '<div class="fd-care-group__head"><h2 id="fd-care-'+fdEsc(group)+'">'+fdEsc(title)+'</h2>'+
    '<p>'+fdEsc(intro)+'</p></div><div class="fd-care-group__list">';
  for(var j=0;j<matched.length;j++){
    var item=matched[j];
    out+='<a class="fd-carelink" data-care-resource="'+fdEsc(item.id)+'" href="'+fdEsc(item.url)+'" target="_blank" rel="noopener noreferrer">'+
      '<span class="fd-carelink__mark" aria-hidden="true">↗</span><span class="fd-carelink__copy">'+
      '<span class="fd-carelink__title">'+fdEsc(item.title)+'</span>'+
      '<span class="fd-carelink__description">'+fdEsc(item.description)+'</span></span></a>';
  }
  return out+'</div></section>';
}

function fdCare(index){
  var idx=index||{}, resources=idx.careResources||[];
  return '<section class="fd-care-page" aria-labelledby="fd-care-title">'+
    '<header class="fd-care-page__head"><p class="fd-care-page__source">ReConnect collection</p>'+
    '<h1 id="fd-care-title">Patient care resources</h1>'+
    '<p class="fd-care-page__intro">Shortcuts for finding support, planning follow-up, and sharing understandable information during supervised care.</p>'+
    '<div class="fd-care-page__provenance" aria-label="Collection provenance"><strong>Created by Joshua Moss, MD</strong>'+
    '<span>Apps built from personally curated ReConnect databases developed over several years.</span></div></header>'+
    '<div class="fd-care-page__notice" role="note"><strong>Verify current details before sharing</strong><span>Resources open in a new tab. Do not enter patient-identifying information.</span></div>'+
    '<div class="fd-care-page__groups">'+
    fdCareGroup(resources,'support','Find support and follow-up','Use while planning services, recovery support, or discharge follow-up.')+
    fdCareGroup(resources,'education','Teach and share','Plain-language guides, curated listening, and books for patients and families.')+
    '</div></section>';
}
