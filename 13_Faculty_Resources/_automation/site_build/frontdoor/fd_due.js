/* Device-store rows composed around the pure Today renderer. Runtime code reads the stores and
   resolves capture matches; this module only receives normalized values and returns escaped,
   audience-neutral markup. */

var FD_CAPTURE_PURPOSE='Questions you captured on the unit. Open the matching page, schedule one for review, or copy the list to raise in supervision. Stays on this device — no patient details.';

function fdDueCount(breakdown){
  var b=breakdown||{}, names=['daily','qb','fam','comm','reason','other'], total=0;
  for(var i=0;i<names.length;i++){
    var row=b[names[i]]||{};
    if(typeof row.due==='number'&&row.due>0) total+=row.due;
  }
  return total;
}

/* primary===true marks the row as Today's one primary action: it gains is-primary and a
   kicker naming the move. Anything else renders the row exactly as before. */
function fdDueRow(breakdown, primary){
  var b=breakdown||{}, total=fdDueCount(b), parts=[], isPrimary=primary===true;
  if(!total) return '';
  if(b.daily&&b.daily.due) parts.push(b.daily.due+' daily');
  if(b.qb&&b.qb.due) parts.push(b.qb.due+' practice');
  if(b.fam&&b.fam.due) parts.push(b.fam.due+' family');
  if(b.comm&&b.comm.due) parts.push(b.comm.due+' communication');
  if(b.reason&&b.reason.due) parts.push(b.reason.due+' reasoning');
  if(b.other&&b.other.due) parts.push(b.other.due+' other');
  return '<button type="button" class="'+(isPrimary?'fd-due is-primary':'fd-due')+'" data-fd-open="review.html">'+
    (isPrimary?'<span class="fd-due__kicker">Clear what’s due</span>':'')+
    '<span class="fd-due__label">'+total+' review'+(total===1?'':'s')+' due</span>'+
    '<span class="fd-due__breakdown">'+fdEsc(parts.join(' · '))+'</span>'+
    '<span class="fd-due__action">Start review →</span>'+
  '</button>';
}

/* Questions left in a capsule, or 0 for anything malformed. The shape rule lives here once so
   the resume card and the Today picker (fd_today.js) agree on what "resumable" means. */
function fdCapsuleLeft(capsule){
  var c=capsule||{};
  if(!Array.isArray(c.queueIds)||typeof c.idx!=='number'||c.idx%1!==0||
      c.idx<0||c.idx>c.queueIds.length) return 0;
  return c.queueIds.length-c.idx;
}

function fdResumeCard(capsule, primary, block){
  var left=fdCapsuleLeft(capsule), isPrimary=primary===true, c=capsule||{}, b=block||null;
  if(left<1) return '';
  var minutes=Math.max(1,Math.round(left*45/60));
  /* A set the timed block opened resumes AS the block's step: the route carries block=1&n[&cat]
     so the receipt can mark it, and the card says where the block stands. The route is built by
     fdBlockResumeSearch (fd_block.js, injected after this module -- hence the typeof guard) so
     the shell's Continue and this link can never drift apart. Without a block status, or when
     the block's next step is not the question set, the card is exactly what it was. */
  var resumeSearch=(c.fromBlock===true&&b&&b.next&&b.next.kind==='qb'&&typeof fdBlockResumeSearch==='function')?fdBlockResumeSearch(b.next,c):null;
  var href=resumeSearch?resumeSearch.replace(/&/g,'&amp;'):'?tool=question-bank-practice.html&amp;resume=1';
  var blockLine=resumeSearch?'<span class="fd-resume__block">Block · '+b.done+' of '+b.total+' done</span>':'';
  return '<section class="'+(isPrimary?'fd-resume is-primary':'fd-resume')+'">'+
    '<h2 class="fd-sectionhead">'+(isPrimary?'Pick up where you left off':'Continue where you left off')+'</h2>'+
    '<a class="fd-resume__link" href="'+href+'">'+
      '<span>Resume question bank — '+left+' left, ~'+minutes+' min'+blockLine+'</span>'+
      '<span>Resume →</span>'+
    '</a></section>';
}

/* "You were reading" -- the last opened item when it is an undone read from this week that is
   not already the Continue target (the shell resolves that through fdTodayLastRead). Tools
   never render here: a tool is not reading, and a live block or a capsule already covers the
   unfinished-practice case. */
function fdLastReadRow(item, primary){
  var it=item||{}, isPrimary=primary===true;
  if(typeof it.ref!=='string'||!it.ref||it.kind!=='read') return '';
  var min=(typeof it.minutes==='number')?(' — '+it.minutes+' min'):'';
  return '<button type="button" class="'+(isPrimary?'fd-lastread is-primary':'fd-lastread')+'" data-fd-open="'+fdEsc(it.ref)+'">'+
    (isPrimary?'<span class="fd-lastread__kicker">Pick up where you left off</span>':'')+
    '<span class="fd-lastread__title">You were reading: '+fdEsc(it.title||it.ref)+fdEsc(min)+'</span>'+
    '<span class="fd-lastread__action">Open →</span>'+
  '</button>';
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
