/* Device-store rows composed around the pure Today renderer. Runtime code reads the stores and
   resolves capture matches; this module only receives normalized values and returns escaped,
   audience-neutral markup. */

var FD_CAPTURE_PURPOSE='Questions you captured on the unit. Open the matching page, schedule one for review, or copy the list to raise in supervision. Stays on this device — no patient details.';

function fdDueCount(breakdown){
  var b=breakdown||{}, names=['daily','qb','fam','other'], total=0;
  for(var i=0;i<names.length;i++){
    var row=b[names[i]]||{};
    if(typeof row.due==='number'&&row.due>0) total+=row.due;
  }
  return total;
}

function fdDueRow(breakdown){
  var b=breakdown||{}, total=fdDueCount(b), parts=[];
  if(!total) return '';
  if(b.daily&&b.daily.due) parts.push(b.daily.due+' daily');
  if(b.qb&&b.qb.due) parts.push(b.qb.due+' practice');
  if(b.fam&&b.fam.due) parts.push(b.fam.due+' family');
  if(b.other&&b.other.due) parts.push(b.other.due+' other');
  return '<button type="button" class="fd-due" data-fd-open="review.html">'+
    '<span class="fd-due__label">'+total+' review'+(total===1?'':'s')+' due</span>'+
    '<span class="fd-due__breakdown">'+fdEsc(parts.join(' · '))+'</span>'+
    '<span class="fd-due__action">Start review →</span>'+
  '</button>';
}

function fdResumeCard(capsule){
  var c=capsule||{};
  if(!Array.isArray(c.queueIds)||typeof c.idx!=='number'||c.idx%1!==0||
      c.idx<0||c.idx>c.queueIds.length) return '';
  var left=c.queueIds.length-c.idx;
  if(left<1) return '';
  var minutes=Math.max(1,Math.round(left*45/60));
  return '<section class="fd-resume"><h2 class="fd-sectionhead">Continue where you left off</h2>'+
    '<a class="fd-resume__link" href="?tool=question-bank-practice.html&amp;resume=1">'+
      '<span>Resume question bank — '+left+' left, ~'+minutes+' min</span>'+
      '<span>Resume →</span>'+
    '</a></section>';
}

function fdCaptureTriage(items){
  var list=items||[], open=[];
  for(var i=0;i<list.length;i++){
    if(list[i]&&list[i].triaged!==true) open.push(list[i]);
  }
  if(!open.length) return '';
  var out='<section class="fd-capture"><div class="fd-capture__head">'+
    '<h2 class="fd-sectionhead">Questions from the unit</h2>'+
    '<button type="button" class="fd-capture__new" data-capture-open>+ Capture</button></div>'+
    '<p class="fd-capture__purpose">'+fdEsc(FD_CAPTURE_PURPOSE)+'</p>';
  for(var j=0;j<open.length;j++){
    var item=open[j]||{}, id=fdEsc(item.id||''), match=item.match;
    out+='<div class="fd-capture__item"><p class="fd-capture__question">'+fdEsc(item.text||'')+'</p>';
    if(match&&match.ref){
      var ref=fdEsc(match.ref);
      out+='<button type="button" class="fd-capture__action" data-cap-open="'+id+'" data-cap-ref="'+ref+'">'+
        '<span>'+fdEsc(match.title||match.ref)+'</span><span>Open →</span></button>';
      if(match.hasQuiz){
        out+='<button type="button" class="fd-capture__action" data-cap-review="'+id+'" data-cap-ref="'+ref+'">'+
          '<span>Review this topic</span><span>Schedule →</span></button>';
      }
    }
    out+='<button type="button" class="fd-capture__action" data-cap-drop="'+id+'">'+
      '<span>Done with this one</span><span>Dismiss</span></button></div>';
  }
  out+='<button type="button" class="fd-capture__copy" data-cap-copy="1">Ask my attending</button>';
  return out+'</section>';
}
