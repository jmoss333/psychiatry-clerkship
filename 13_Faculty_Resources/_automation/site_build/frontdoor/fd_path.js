/* Path -- the projected learning-path timeline (left column) and the selected week's detail card (right
   column). See CLASS-INVENTORY.md section 4 and the prototype's Path section
   (Front-Door-Hi-Fi-v2.dc.html, search "══", line 287) for the markup this ports.

   Injected via /*__FD_PATH__*\/ once a later plan registers the marker (see SNIPPET_MARKERS
   in common.py) -- this task does not register it or touch that file. ES5 only: var/function,
   no const/let/arrow functions/template literals -- matches the other frontdoor/ modules.

   Pure: no DOM, no browser storage, no clock access -- state arrives fully resolved.

   state.week is the student's actual rotation week; state.viewWeek is whichever week the
   detail card is currently showing. They differ whenever a student browses ahead or back
   without changing their real week, so the two are read independently throughout: the
   timeline's is-current dot state and the "you are here" flag/pill both key off state.week,
   while the selected row (is-sel) and everything the detail card shows key off state.viewWeek.
   With no week set (state.week is not a number) nothing in the timeline may claim to be
   current -- the isNow guard below is false for every row in that case, though the detail
   card still renders normally (Path is a browsing surface, reachable with no week set) and
   "Set as my week" still offers to set one.

   A row's done dot is derived from fdTodayProgress(fdItemsForWeek(index, n), state.done)
   .pct===100 -- never from week ordering or a week-number comparison. A student can finish
   week 4 before week 3, and the timeline has to say so truthfully (tests/fd-path.test.mjs).
   Completion beats "current" when both would apply, matching the prototype's own
   allDone-first branch order: a finished current week gets is-done, not is-current.

   Reuses rather than reimplements: fdEsc / fdItemsForWeek / fdFindWeek (fd_data.js, the join
   layer both this file and fd_today.js depend on) and fdTodayProgress / fdRow (fd_today.js).
   fd_today.js's fdRow takes an optional trailing `compact` flag for exactly this file's detail
   rows (CLASS-INVENTORY's ".fd-row.is-compact") -- a straight duplicate of that function used
   to live here and was hoisted out in Task 5 review to remove the drift risk of two copies of
   an escaping-sensitive row template.

   Copy rule: every string here ships to BOTH sites unrebranded -- audience-neutral, no
   MS3/clerkship/student/shelf/resident/UNE/MMC/Sanford. */

/* Route geometry -- ONE source for the road and the stops. Stops alternate between two heights
   inside a fixed band; frontdoor.css reads the same numbers as --fd-path-band / --fd-path-y-low /
   --fd-path-y-high on .fd-pathroute (tests/fd-path-route.test.mjs pins that they agree). x is in
   a 1000-wide viewBox stretched to the weeks grid (gap:0), so stop i of n sits at the centre of
   column i at any width; y is 1:1 with CSS px. The road stays neutral (#743): it is geometry
   only and never derives from week, viewWeek or progress. */
var FD_PATH_BAND=190, FD_PATH_Y_LOW=118, FD_PATH_Y_HIGH=72, FD_PATH_VIEW_W=1000;

function fdPathR2(v){ return Math.round(v*100)/100; }
function fdPathStopX(i, n){ return fdPathR2(FD_PATH_VIEW_W*(i+0.5)/n); }
function fdPathStopY(i){ return i%2===0?FD_PATH_Y_LOW:FD_PATH_Y_HIGH; }

function fdPathConnectorD(n){
  if(!(n>0)) return '';
  var h=FD_PATH_VIEW_W/(2*n), d='M'+fdPathStopX(0,n)+' '+fdPathStopY(0), i, x0, y0, x1, y1;
  for(i=1;i<n;i++){
    x0=fdPathStopX(i-1,n); y0=fdPathStopY(i-1); x1=fdPathStopX(i,n); y1=fdPathStopY(i);
    d+=' C'+fdPathR2(x0+h)+' '+y0+' '+fdPathR2(x1-h)+' '+y1+' '+x1+' '+y1;
  }
  return d;
}

function fdPathDotCls(isDone, isNow){
  if(isDone) return 'fd-dot is-done';
  if(isNow) return 'fd-dot is-current';
  return 'fd-dot';
}

function fdPathViewWeek(index, state){
  var idx=index||{weeks:[]},weeks=idx.weeks||[];
  var found=fdFindWeek(idx,state&&state.viewWeek);
  return found?found.n:(weeks[0]?weeks[0].n:null);
}

/* A pure roving-tab calculation shared by the renderer tests and the controller. Supporting both
   axes lets the same controls behave naturally on the desktop curve and the phone's vertical
   rail. Arrow movement wraps; Home and End jump to the projected audience's real endpoints. */
function fdPathMoveWeek(index, current, key){
  var weeks=index&&index.weeks||[],at=-1,i;
  if(!weeks.length) return null;
  if(key==='Home') return weeks[0].n;
  if(key==='End') return weeks[weeks.length-1].n;
  if(key!=='ArrowLeft'&&key!=='ArrowRight'&&key!=='ArrowUp'&&key!=='ArrowDown') return null;
  for(i=0;i<weeks.length;i++){ if(weeks[i].n===current){ at=i;break; } }
  if(at<0) at=0;
  if(key==='ArrowLeft'||key==='ArrowUp') at=(at+weeks.length-1)%weeks.length;
  else at=(at+1)%weeks.length;
  return weeks[at].n;
}

/* Observable skills mirror the Orientation Packet's "What Students Should Practice Each
   Week" table. The short feedback requests apply its "one behavior at a time" guidance.
   These are practice suggestions, never assignments or a competence assessment. */
var FD_PATH_PRACTICE=[
  null,
  {skill:'Present a focused interview/MSE and name what you would escalate immediately',
    feedback:'Can you watch my MSE language today?'},
  {skill:'Build a differential beyond the primary psychiatric diagnosis',
    feedback:'Can you review whether my differential shows reasoning?'},
  {skill:'Explain why one non-medication intervention fits the formulation and complete a supervised collaborative safety plan',
    feedback:'Can you review my rationale for this treatment plan?'},
  {skill:'Draft a family-meeting agenda and discharge barrier map',
    feedback:'Can you review my family-meeting agenda and discharge barriers?'},
  {skill:'Deepen the suicide/violence risk formulation practised since Week 1 (and used for Week 3 safety planning), recognize delirium/catatonia/withdrawal, and document supervised escalation reasoning',
    feedback:'Can you tell me if my risk formulation separates chronic and acute risk?'},
  {skill:'Present a full case with formulation, risk reasoning, and plan',
    feedback:'Can you help me make my presentation more concise?'}
];

/* The six-week path keeps its Orientation-sourced constant above. Every other path reads the
   viewed week's practice from curriculum.json (week.practice, schema since #774), carried into
   the index by fdBuildIndex: since 2026-09-26 the four-week path maps each week to the rotation
   plan's "Demonstrate across the block" list. Same callout, same class; a suggestion to bring to
   supervision, never an assignment or a competence assessment. Since 2026-09-26 the data-driven
   callout also holds the learner's own notes of what the supervisor said (fdPathFeedback below):
   private, on this device, and never progress, a checkmark or an assessment. */
function fdPathPractice(index, week, state){
  if(!index.path) return '';
  if(index.path.id==='ms3-six-week'){
    var practice=FD_PATH_PRACTICE[week];
    if(!practice) return '';
    return '<div class="fd-detail__practice">'+
      '<p><strong>Practice one skill</strong><br>'+fdEsc(practice.skill)+'.</p>'+
      '<p><strong>Ask for feedback</strong><br>“'+fdEsc(practice.feedback)+'”</p>'+
      '<a href="?page=orientation.md">Open Orientation →</a>'+
    '</div>';
  }
  var wk=fdFindWeek(index,week), row=wk&&wk.practice;
  if(!row||!row.skill||!row.feedback) return '';
  return '<div class="fd-detail__practice">'+
    '<p><strong>Demonstrate this week</strong><br>'+fdEsc(row.skill)+'</p>'+
    '<p><strong>Ask your supervisor</strong><br>“'+fdEsc(row.feedback)+'”</p>'+
    fdPathFeedback(index.path.id, week, state)+
  '</div>';
}

/* Local month and day for a note's timestamp ("Sep 26"). Formats a time it is given and never
   reads the clock, so the renderer stays pure. */
var FD_FEEDBACK_MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fdFeedbackDay(at){
  var d=new Date(typeof at==='number'&&isFinite(at)?at:0);
  return FD_FEEDBACK_MONTHS[d.getMonth()]+' '+d.getDate();
}

/* "Log what they said": one tap opens a short note under the supervisor question; the saved
   notes for this week list beneath it, newest first. state.feedbackLog is the stored list
   (fdFeedbackRead, read fresh on every render); state.feedbackDraft is the open note, which is
   visit-only and never saved as route state. A draft held for possible patient details shows the
   same fail-closed choice the question capture shows: edit it, or confirm there are none. */
function fdPathFeedback(pathId, week, state){
  var st=state||{}, draft=st.feedbackDraft, notice=st.feedbackNotice;
  var notes=fdFeedbackForWeek(st.feedbackLog, pathId, week);
  var open=!!draft&&draft.week===week, out='<div class="fd-feedback">';
  if(open){
    out+='<label class="fd-feedback__label" for="fdFeedbackText">What did they say?</label>'+
      '<textarea id="fdFeedbackText" class="fd-feedback__text" rows="3" maxlength="'+FD_FEEDBACK_MAX+'"'+
      ' aria-describedby="fdFeedbackHint" placeholder="The one thing to keep doing, or to change">'+
      fdEsc(draft.text||'')+'</textarea>'+
      '<p class="fd-feedback__hint" id="fdFeedbackHint">The feedback, not the patient. No names, '+
      'initials, room or bed numbers, dates, or MRNs. Stays on this device.</p>';
    if(draft.failed){
      out+='<p class="fd-feedback__error" role="alert">Couldn\'t save on this device. Copy your note '+
        'before you leave this page.</p>';
    }
    if(draft.hold){
      out+='<div class="fd-feedback__hold" role="alert"><p><strong>This may contain patient details.'+
        '</strong></p><div class="fd-feedback__acts">'+
        '<button type="button" class="fd-btn fd-btn--accent" data-fd-feedback-edit>Edit</button>'+
        '<button type="button" class="fd-btn fd-btn--ghost" data-fd-feedback-confirm>No patient details — save</button>'+
        '</div></div>';
    } else {
      out+='<div class="fd-feedback__acts">'+
        '<button type="button" class="fd-btn fd-btn--ghost" data-fd-feedback-cancel>Cancel</button>'+
        '<button type="button" class="fd-btn fd-btn--accent" data-fd-feedback-save>Save note</button>'+
        '</div>';
    }
  } else {
    out+='<button type="button" class="fd-btn fd-btn--ghost fd-feedback__open" data-fd-feedback-open="'+
      fdEsc(week)+'">Log what they said</button>';
    if(notice&&notice.week===week&&notice.text){
      out+='<p class="fd-feedback__status" role="status">'+fdEsc(notice.text)+'</p>';
    }
  }
  if(notes.length){
    out+='<p class="fd-feedback__h"><strong>What they said</strong></p><ul class="fd-feedback__list">';
    for(var i=0;i<notes.length;i++){
      var day=fdFeedbackDay(notes[i].at);
      out+='<li class="fd-feedback__item"><span class="fd-feedback__day">'+fdEsc(day)+'</span>'+
        '<span class="fd-feedback__note">'+fdEsc(notes[i].text)+'</span>'+
        '<button type="button" class="fd-feedback__delete" data-fd-feedback-delete="'+fdEsc(notes[i].id)+'"'+
        ' aria-label="Delete the note from '+fdEsc(day)+'">Delete</button></li>';
    }
    out+='</ul>';
  }
  return out+'</div>';
}

/* One timeline row. .fd-timeline__line is emitted unconditionally on every row, including the
   last -- frontdoor.css hides it there via :last-child, and skipping it in markup instead
   would break the spine on any row the CSS selector does not happen to cover (CLASS-INVENTORY
   ⚠). data-fd-view-week carries the row's browsing target; data-fd-week remains setup-only. */
function fdPathTimelineRow(index, w, state){
  var items=fdItemsForWeek(index, w.n);
  var progress=fdTodayProgress(items, fdProgressForWeek(index,state,w.n));
  var isNow=(typeof state.week==='number'&&!isNaN(state.week))&&state.week===w.n;
  var isSel=fdPathViewWeek(index,state)===w.n;
  var isDone=progress.total>0&&progress.pct===100;
  var rowCls=isSel?'fd-timeline__row is-sel':'fd-timeline__row';
  var nLabel='Week '+fdEsc(w.n);
  var status=isDone?(isNow?'Complete · Current':'Complete'):(isNow?'Current':'');
  return '<button type="button" class="'+rowCls+'" data-fd-view-week="'+fdEsc(w.n)+'"'+
    ' id="fd-path-week-'+fdEsc(w.n)+'" role="tab" aria-selected="'+(isSel?'true':'false')+'"'+
    ' tabindex="'+(isSel?'0':'-1')+'" aria-controls="fd-path-detail"'+
    (isNow?' aria-current="step"':'')+'>'+
    '<span class="fd-timeline__gutter">'+
      '<span class="'+fdPathDotCls(isDone, isNow)+'"></span>'+
      '<span class="fd-timeline__line"></span>'+
    '</span>'+
    '<span class="fd-timeline__body">'+
      '<span class="fd-timeline__n">'+nLabel+'</span>'+
      '<span class="fd-timeline__number" aria-hidden="true">'+fdEsc(w.n)+'</span>'+
      '<span class="fd-timeline__title">'+fdEsc(w.title)+'</span>'+
      '<span class="fd-timeline__theme">'+fdEsc(w.theme||'')+'</span>'+
      (status?'<span class="fd-timeline__status">'+status+'</span>':'')+
    '</span>'+
    '<span class="fd-timeline__count">'+progress.done+'/'+progress.total+'</span>'+
  '</button>';
}

function fdPathRoute(index, state){
  var idx=index||{weeks:[]},weeks=idx.weeks||[];
  var count=fdPathWeekCount(idx),out='';
  out+='<nav class="fd-pathroute" aria-label="Explore the Path">';
  out+='<svg class="fd-pathroute__curve" viewBox="0 0 '+FD_PATH_VIEW_W+' '+FD_PATH_BAND+'" preserveAspectRatio="none" aria-hidden="true" focusable="false">';
  out+='<path class="fd-pathroute__connector" d="'+fdPathConnectorD(weeks.length)+'"></path>';
  out+='</svg>';
  out+='<div class="fd-pathroute__weeks fd-pathroute__weeks--'+fdEsc(count)+'" role="tablist" aria-label="Path weeks">';
  for(var i=0;i<weeks.length;i++){ out+=fdPathTimelineRow(idx,weeks[i],state); }
  out+='</div></nav>';
  return out;
}

/* The detail card for whichever week state.viewWeek names. Falls back to the index's first
   week when viewWeek is not a number (an unset/uninitialised caller) so the card always has
   something to show -- Path is reachable with no rotation week set. */
function fdPathDetail(index, state){
  var idx=index||{weeks:[]};
  var weeks=idx.weeks||[];
  var wk=fdFindWeek(idx,fdPathViewWeek(idx,state))||weeks[0]||null;
  var viewN=wk?wk.n:null;
  var items=fdItemsForWeek(idx, viewN);
  var done=fdProgressForWeek(idx,state,viewN);
  var isCurrent=(typeof state.week==='number'&&!isNaN(state.week))&&state.week===viewN;

  var out='<div class="fd-detail" id="fd-path-detail" role="tabpanel" aria-labelledby="fd-path-week-'+fdEsc(viewN)+'" aria-live="polite">';
  out+='<div class="fd-detail__head">';
  out+='<span class="fd-eyebrow">Week '+fdEsc(viewN)+'</span>';
  if(isCurrent) out+='<span class="fd-detail__here">you are here</span>';
  out+='</div>';
  out+='<h2 class="fd-detail__h2">'+fdEsc(wk?wk.title:'')+'</h2>';
  out+=fdPathPractice(idx,viewN,state);
  out+='<div class="fd-detail__list">';
  for(var i=0;i<items.length;i++){ out+=fdRow(items[i], i, done, true); }
  out+='</div>';
  if(!isCurrent){
    out+='<button type="button" class="fd-btn fd-btn--accent" data-fd-setweek="'+fdEsc(viewN)+'">'+
      'Set as my week</button>';
  }
  out+='</div>';
  return out;
}

function fdPath(index, state){
  var st=state||{};
  var idx=index||{weeks:[]};
  if(!fdActivePathValid(idx)) return fdPathFallback('path');
  var suggested=idx.path.id==='ms3-six-week';
  var out='<section class="fd-path">';
  out+='<h1 class="fd-path__h1">'+(suggested?'Suggested learning plan':'Your '+fdEsc(fdPathWeekCount(idx))+'-week path')+'</h1>';
  if(suggested) out+='<p class="fd-path__intro">Six weeks of suggested practice. Confirm required work with your supervising team. Checkmarks record completed activities; your supervising team assesses clinical skills.</p>';
  out+=fdPathRoute(idx,st);
  out+='<div class="fd-path__cols">';
  out+=fdPathDetail(idx, st);
  out+='</div>';
  out+='</section>';
  return out;
}
