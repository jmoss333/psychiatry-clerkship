/* Due row + capture triage -- the two Today surfaces that read RUNTIME STORES rather than the
   build-injected curriculum index, which is why no Plan 2 module could build them and why
   fd_today.js's own header comment records the scope correction rather than an omission.

   Injected via /*__FD_DUE__*\/ -- registered in SNIPPET_MARKERS (common.py), placed between
   /*__FD_DATA__*\/ (fdEsc) and /*__FD_TODAY__*\/ (which calls both functions here). ES5 only:
   var/function, no const/let/arrow functions/template literals -- matches the other frontdoor/
   modules.

   ---- Pure, and the reads that feed them are not -------------------------------------------
   Both functions take ALREADY-READ data. The review queue is read by fdDueState() and the ward
   capture list by fdCaptureState(), both in fd_wire.js, the one impure module in this
   directory (the store keys are named there, as string literals the QA gate can scan). That
   split is what lets a zero-due day, a singular/plural boundary and an unmatched capture be
   tested directly instead of through a synthesised storage layer.

   `purpose` arrives as a parameter for the same reason: CAP_PURPOSE is declared once, in
   spa_index.html, and tests/shell-copy.test.mjs extracts it from that declaration as part of the
   PHI enforcement surface. Re-declaring the sentence here would create a second copy of copy
   that must never drift, and the extractor would still be reading the first one.

   ---- Ported markup, restyled ----------------------------------------------------------------
   Structure and copy come from the deleted dueStripHtml()/dueSubstatHtml()/capTriageHtml()
   (spa_index.html @098ad50), re-expressed on --fd-* tokens with the classes in
   CLASS-INVENTORY.md section 3. Two things are deliberately NOT ported:
     - `data-act="review"` became data-fd-open="review.html". The old attribute rode a generic
       [data-act] delegate that no longer exists; the ref is the same destination.
     - The triage controls keep their data-cap-* attributes exactly. fd_wire.js routes them
       through fdCaptureClick() rather than fdDispatch(), because "open the page AND mark this
       capture triaged" is two acts, and a bare data-fd-open would do only the first -- the same
       reason the deleted card refused to emit data-f (tests/ward-capture-store.test.mjs T12a).

   Copy rule: every string here ships to BOTH sites unrebranded -- audience-neutral, no
   MS3/clerkship/student/shelf/resident/UNE/MMC/Sanford. */

/* "Also scheduled: 3 in the question bank · 1 in family practice". The daily bucket is excluded
   on purpose -- it is the number stated large one line above, and restating it here as a
   footnote to itself is how the old dashboard managed to print the same count three times. */
function fdDueSubstat(bd){
  var parts=[];
  if(bd.qb.due) parts.push(bd.qb.due+' in the question bank');
  if(bd.fam.due) parts.push(bd.fam.due+' in family practice');
  if(bd.other.due) parts.push(bd.other.due+' in other practice tools');
  if(!parts.length) return '';
  return '<span class="fd-due__also">Also scheduled: '+fdEsc(parts.join(' · '))+'</span>';
}

/* '' when nothing is due for Daily Review, and that empty return is the whole design: promoting
   a zero is worse than not promoting a count. A caught-up day and a fresh device both see
   nothing here rather than a "Due today 0" banner they have to read and dismiss mentally.

   Counts are integers from the store and are interpolated without fdEsc, deliberately: they come
   from `b[k].due++` in dueBreakdown(), never from text. Everything that IS text goes through
   fdEsc, including the joined substat above. */
function fdDueRow(breakdown){
  var bd=breakdown;
  if(!bd||!bd.daily||!bd.daily.due) return '';
  var n=bd.daily.due, over=bd.daily.overdue;
  return '<button type="button" class="fd-due" data-fd-open="review.html">'+
    '<span class="fd-due__k">Due today</span>'+
    '<span class="fd-due__n">'+n+'</span>'+
    '<span class="fd-due__label">'+(n===1?'card':'cards')+'</span>'+
    (over?('<span class="fd-due__over">'+over+' overdue</span>'):'')+
    '<span class="fd-due__go">Start review →</span>'+
    fdDueSubstat(bd)+
  '</button>';
}

/* One captured question. `hit` is the page the impure layer matched it to, or null when nothing
   matched -- in which case the row still renders with its dismiss control, because a question
   nothing matched is exactly the kind worth taking to supervision.

   hit.quiz gates the "Review this topic" control: seedSRS() refuses to schedule a page with no
   servable quiz, so offering the button there would be a control that silently does nothing.
   That guard lived in the deleted card too (tests/ward-capture-store.test.mjs T12a). */
function fdCaptureRow(it){
  var out='<div class="fd-capture__item">'+
    '<p class="fd-capture__q">'+fdEsc(it.text)+'</p>'+
    '<div class="fd-capture__acts">';
  if(it.hit){
    out+='<button type="button" class="fd-capture__act" data-cap-open="'+fdEsc(it.id)+'" '+
      'data-cap-f="'+fdEsc(it.hit.ref)+'">Open '+fdEsc(it.hit.title)+' →</button>';
    if(it.hit.quiz){
      out+='<button type="button" class="fd-capture__act" data-cap-review="'+fdEsc(it.id)+'" '+
        'data-cap-f="'+fdEsc(it.hit.ref)+'">Schedule this topic for review</button>';
    }
  }
  out+='<button type="button" class="fd-capture__act" data-cap-drop="'+fdEsc(it.id)+'">'+
    'Done with this one</button>';
  out+='</div></div>';
  return out;
}

/* capture = {items, matching, purpose}. '' when nothing is waiting -- same rule as the due row:
   an empty section that explains what it would show if it had anything is chrome, not content.
   `matching:false` is the honest degraded branch the deleted card had (`if(!SI)`): the questions
   are still listed and still dismissible, only the page-matching is missing, and saying so is
   better than rendering rows that look like matching simply found nothing. */
function fdCaptureTriage(capture){
  var c=capture||{}, items=c.items||[];
  if(!items.length) return '';
  var out='<section class="fd-capture">'+
    '<h2 class="fd-sectionhead">Questions from the unit · '+items.length+' waiting</h2>'+
    '<p class="fd-capture__purpose">'+fdEsc(c.purpose||'')+'</p>';
  if(!c.matching){
    out+='<p class="fd-capture__degraded">Matching is unavailable right now — your questions are '+
      'safe on this device.</p>';
  }
  for(var i=0;i<items.length;i++){ out+=fdCaptureRow(items[i]); }
  out+='<div class="fd-capture__foot">'+
    '<button type="button" class="fd-btn fd-btn--ghost" data-cap-copy="1">Ask my attending</button>'+
    '</div>';
  out+='</section>';
  return out;
}

/* The capture ENTRY POINT. Omitted entirely -- not disabled -- on a faculty-preview route: that
   is rule 1 of the two the deleted capWire() enforced, restated at the read site in
   spa_index.html. A capture control in a reviewer's frame offers to write LEARNER state from a
   reviewer's seat, and a disabled-but-focusable control still sits in the preview's tab order.
   aria-haspopup/aria-expanded match what capOpen()/capClose() maintain. */
function fdCaptureButton(preview){
  if(preview) return '';
  return '<button type="button" class="fd-capturebtn" data-fd-capture '+
    'aria-haspopup="dialog" aria-expanded="false">+ Capture a question</button>';
}
