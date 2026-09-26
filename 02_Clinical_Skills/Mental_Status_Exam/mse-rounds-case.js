/* One canonical fictional teaching case for the MSE comparison and rounds handoff.
 * Faculty review lives in reviewed.json for both parent tools. No free-text input or clinical inference.
 * Bump the case id when the meaning of any selectable finding changes.
 */
(function(window){
  'use strict';
  var caseData={id:'mse-change-v1',reviewSlugs:['mse.html','oral.html'],title:'One patient, two mornings',rows:[
    {id:'speech',label:'Speech',source:'Observed',yesterday:'Speech is rapid and difficult to interrupt.',today:'Speech is slower. The interviewer can ask a question without speaking over the patient.',summary:'Speech is slower and easier to interrupt today.'},
    {id:'activity',label:'Activity',source:'Observed',yesterday:'Paces throughout the interview.',today:'Sits through most of the interview; stands twice.',summary:'The patient sits through most of today\'s interview, compared with pacing throughout yesterday.'},
    {id:'mood',label:'Mood',source:'Patient report',yesterday:'“I feel unstoppable.”',today:'“I feel less wound up.”',summary:'The patient reports feeling “less wound up” today, compared with “unstoppable” yesterday.'},
    {id:'belief',label:'Belief',source:'Patient report',yesterday:'Describes having a special mission.',today:'Again describes having a special mission.',summary:'The patient still describes having a special mission.'},
    {id:'attention',label:'Attention',source:'Not assessed',yesterday:'Attention was not assessed during this interview.',today:'Attention was not assessed during this interview.',summary:'Attention was not assessed in either excerpt; a comparison is unavailable.'}
  ]};
  function normalize(ids){
    if(!Array.isArray(ids)||ids.length>10)return [];
    var known=caseData.rows.map(function(r){return r.id;});
    if(ids.some(function(id){return known.indexOf(id)<0;}))return [];
    return known.filter(function(id){return ids.indexOf(id)>=0;});
  }
  function read(search){
    var result={present:false,valid:false,ids:[]};
    try{
      var p=new URLSearchParams(search);
      result.present=p.has('msecase')||p.has('msepicks');
      if(p.getAll('msecase').length!==1||p.get('msecase')!==caseData.id||p.getAll('msepicks').length!==1)return result;
      var raw=p.get('msepicks');if(!raw||raw.length>100)return result;
      var ids=normalize(raw.split(','));if(!ids.length)return result;
      result.valid=true;result.ids=ids;
    }catch(ignore){}
    return result;
  }
  function token(ids){var clean=normalize(ids);return clean.length?caseData.id+':'+clean.join(','):null;}
  function link(tool,ids,embedded){
    var clean=normalize(ids);
    if(['oral.html','mse.html'].indexOf(tool)<0||!clean.length)return null;
    var p=new URLSearchParams();
    if(embedded)p.set('tool',tool);
    if(tool==='oral.html'){p.set('format','rounds');p.set('view','guided');}
    p.set('msecase',caseData.id);p.set('msepicks',clean.join(','));
    return (embedded?'../':tool)+'?'+p.toString();
  }
  window.MSERounds={caseData:caseData,normalize:normalize,read:read,token:token,link:link};
})(window);
