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

function fdPathDotCls(isDone, isNow){
  if(isDone) return 'fd-dot is-done';
  if(isNow) return 'fd-dot is-current';
  return 'fd-dot';
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
  {skill:'Explain why a medication and one non-medication intervention fit the formulation',
    feedback:'Can you review my rationale for this treatment plan?'},
  {skill:'Draft a family-meeting agenda and discharge barrier map',
    feedback:'Can you review my family-meeting agenda and discharge barriers?'},
  {skill:'Formulate suicide/violence risk, recognize delirium/catatonia/withdrawal, and document supervised escalation reasoning',
    feedback:'Can you tell me if my risk formulation separates chronic and acute risk?'},
  {skill:'Present a full case with formulation, risk reasoning, and plan',
    feedback:'Can you help me make my presentation more concise?'}
];

function fdPathPractice(index, week){
  if(!index.path||index.path.id!=='ms3-six-week') return '';
  var practice=FD_PATH_PRACTICE[week];
  if(!practice) return '';
  return '<div class="fd-detail__practice">'+
    '<p><strong>Practice one skill</strong><br>'+fdEsc(practice.skill)+'.</p>'+
    '<p><strong>Ask for feedback</strong><br>“'+fdEsc(practice.feedback)+'”</p>'+
    '<a href="?page=orientation.md">Open Orientation →</a>'+
  '</div>';
}

/* One timeline row. .fd-timeline__line is emitted unconditionally on every row, including the
   last -- frontdoor.css hides it there via :last-child, and skipping it in markup instead
   would break the spine on any row the CSS selector does not happen to cover (CLASS-INVENTORY
   ⚠). data-fd-view-week carries the row's browsing target; data-fd-week remains setup-only. */
function fdPathTimelineRow(index, w, state){
  var items=fdItemsForWeek(index, w.n);
  var progress=fdTodayProgress(items, fdProgressForWeek(index,state,w.n));
  var isNow=(typeof state.week==='number'&&!isNaN(state.week))&&state.week===w.n;
  var isSel=state.viewWeek===w.n;
  var isDone=progress.total>0&&progress.pct===100;
  var rowCls=isSel?'fd-timeline__row is-sel':'fd-timeline__row';
  var nLabel='Week '+fdEsc(w.n)+(isNow?' · you are here':'');
  return '<button type="button" class="'+rowCls+'" data-fd-view-week="'+fdEsc(w.n)+'">'+
    '<span class="fd-timeline__gutter">'+
      '<span class="'+fdPathDotCls(isDone, isNow)+'"></span>'+
      '<span class="fd-timeline__line"></span>'+
    '</span>'+
    '<span class="fd-timeline__body">'+
      '<span class="fd-timeline__n">'+nLabel+'</span>'+
      '<span class="fd-timeline__title">'+fdEsc(w.title)+'</span>'+
    '</span>'+
    '<span class="fd-timeline__count">'+progress.done+'/'+progress.total+'</span>'+
  '</button>';
}

/* The detail card for whichever week state.viewWeek names. Falls back to the index's first
   week when viewWeek is not a number (an unset/uninitialised caller) so the card always has
   something to show -- Path is reachable with no rotation week set. */
function fdPathDetail(index, state){
  var idx=index||{weeks:[]};
  var weeks=idx.weeks||[];
  var wk=fdFindWeek(idx,state.viewWeek)||weeks[0]||null;
  var viewN=wk?wk.n:null;
  var items=fdItemsForWeek(idx, viewN);
  var done=fdProgressForWeek(idx,state,viewN);
  var isCurrent=(typeof state.week==='number'&&!isNaN(state.week))&&state.week===viewN;

  var out='<div class="fd-detail">';
  out+='<div class="fd-detail__head">';
  out+='<span class="fd-eyebrow">Week '+fdEsc(viewN)+'</span>';
  if(isCurrent) out+='<span class="fd-detail__here">you are here</span>';
  out+='</div>';
  out+='<h2 class="fd-detail__h2">'+fdEsc(wk?wk.title:'')+'</h2>';
  out+=fdPathPractice(idx,viewN);
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
  var weeks=idx.weeks||[];
  if(!fdActivePathValid(idx)) return fdPathFallback('path');
  var suggested=idx.path.id==='ms3-six-week';
  var out='<section class="fd-path">';
  out+='<h1 class="fd-path__h1">'+(suggested?'Suggested learning plan':'Your '+fdEsc(fdPathWeekCount(idx))+'-week path')+'</h1>';
  if(suggested) out+='<p class="fd-path__intro">Six weeks of suggested practice. Confirm required work with your supervising team. Checkmarks record completed activities; your supervising team assesses clinical skills.</p>';
  out+='<div class="fd-path__cols">';
  out+=fdPathDetail(idx, st);
  out+='<div class="fd-timeline">';
  for(var i=0;i<weeks.length;i++){ out+=fdPathTimelineRow(idx, weeks[i], st); }
  out+='</div>';
  out+='</div>';
  out+='</section>';
  return out;
}
