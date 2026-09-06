/* "I have N minutes" — the timed-block planner and its Today card. Pure: no DOM, no storage,
   no clock (nowMs arrives from the caller; the store is read by the shell and passed in).

   fdBlockPlan packs a 5-, 10- or 20-minute window from what is due and what is next, in the
   order a between-rounds pocket of time is best spent: retrieval first (the due reviews, which
   decay fastest), then one unread page from this week, then practice questions aimed at the
   weakest blueprint area. Every step carries its own minute estimate so the card can say what
   the window buys. Estimates are deliberately coarse and rounded up — a block that finishes
   early is a pleasant surprise; one that runs over is a broken promise.

   Assumptions the numbers encode: a review card ≈ 30 s (fd_due's resume math uses 45 s per
   fresh question; graded cards are quicker), a practice question ≈ 45 s, a page = its
   topic_meta read minutes. Copy is audience-neutral — this file ships to both sites.

   The card has two faces: the PLANNER (chips + preview + Start) when no block is live, and the
   BLOCK (steps with done marks + Continue / End) while one is. A page step's done state is
   derived from the progress map, never stored, so ticking the page from Today, the reader or
   the receipt all count; review and question steps are marked by the receipt inside the tool.
   Wiring (spa_index.html) owns the clicks: data-block-minutes / -start / -continue / -end —
   deliberately outside the data-fd-* namespace, which fd_wire's controller contract owns. */

var FD_BLOCK_MINUTES=[5,10,20];
var FD_BLOCK_REVIEW_SEC=30;
var FD_BLOCK_QUESTION_SEC=45;

function fdBlockBudget(minutes){
  var m=Number(minutes);
  for(var i=0;i<FD_BLOCK_MINUTES.length;i++){ if(FD_BLOCK_MINUTES[i]===m) return m; }
  return 10;
}

/* The buckets review.html actually builds a queue from. Keep this list in step with the card
   sources in 07_Evidence_and_Reading/Landmark_Trials/review.html: promising a card the review
   session cannot show lets the receipt mark the step done after unrelated ones, and omitting a
   bucket it does serve hides a review step from a learner who has work waiting.

   `qb` is deliberately absent: due question-bank cards are served first by the question bank's
   own session (startSession, question-bank-practice.html), so the block reaches them through
   its question step instead. `other` is absent because nothing writes it — an id landing there
   is an unrouted namespace, which is a bug in srsBucket, not a card to promise. */
var FD_BLOCK_REVIEW_BUCKETS=['daily','fam','comm','reason'];

function fdBlockDueTotal(breakdown){
  var b=breakdown||{}, total=0;
  for(var i=0;i<FD_BLOCK_REVIEW_BUCKETS.length;i++){
    var row=b[FD_BLOCK_REVIEW_BUCKETS[i]]||{};
    if(typeof row.due==='number'&&row.due>0) total+=row.due;
  }
  return total;
}

function fdBlockPlan(index, state, minutes, inputs){
  var budget=fdBlockBudget(minutes), inp=inputs||{}, st=state||{};
  var steps=[], remaining=budget, i, n, min;

  var due=fdBlockDueTotal(inp.due);
  if(due>0){
    var reviewMin=budget>=20?4:2;
    n=Math.min(due, Math.floor(reviewMin*60/FD_BLOCK_REVIEW_SEC));
    if(n<1) n=1;
    min=Math.max(1, Math.ceil(n*FD_BLOCK_REVIEW_SEC/60));
    steps.push({kind:'review', ref:'review.html', n:n, min:min,
      title:n+' review'+(n===1?'':'s')+' that '+(n===1?'is':'are')+' due'});
    remaining-=min;
  }

  var wk=(typeof st.week==='number')?fdItemsForWeek(index||{byRef:{},weeks:[]}, st.week):[];
  var done=st.done||{}, unread=[];
  for(i=0;i<wk.length;i++){
    var it=wk[i];
    if(it&&it.kind==='read'&&done[it.ref]!==true&&!it.rights) unread.push(it);
  }
  var page=null;
  for(i=0;i<unread.length;i++){
    var m=(typeof unread[i].minutes==='number')?unread[i].minutes:5;
    if(m<=remaining){ page=unread[i]; min=m; break; }
  }
  /* Nothing fits in week order? Take the shortest unread page if IT fits — never one that runs
     the window over. A five-minute block with four reviews due has three minutes left; a
     four-minute page is not a three-minute page, so the block goes to questions instead. */
  if(!page&&unread.length){
    var shortest=null, shortestMin=Infinity;
    for(i=0;i<unread.length;i++){
      var mm=(typeof unread[i].minutes==='number')?unread[i].minutes:5;
      if(mm<shortestMin){ shortest=unread[i]; shortestMin=mm; }
    }
    if(shortest&&shortestMin<=remaining){ page=shortest; min=shortestMin; }
  }
  if(page){
    steps.push({kind:'page', ref:page.ref, min:min, title:page.title||page.ref});
    remaining-=min;
  }

  if(remaining*60>=FD_BLOCK_QUESTION_SEC*2){
    n=Math.floor(remaining*60/FD_BLOCK_QUESTION_SEC);
    if(n>10) n=10;
    if(n<2) n=2;
    min=Math.max(1, Math.ceil(n*FD_BLOCK_QUESTION_SEC/60));
    var weak=inp.weakest&&inp.weakest.c?inp.weakest:null;
    steps.push({kind:'qb', ref:'question-bank-practice.html', n:n, min:min, cat:weak?weak.c:null,
      title:n+' practice question'+(n===1?'':'s')+(weak?(' on '+(weak.label||weak.c)+', your weakest area'):'')});
    remaining-=min;
  }

  var total=0;
  for(i=0;i<steps.length;i++) total+=steps[i].min;
  return {minutes:budget, steps:steps, total:total};
}

function fdBlockRouteForStep(step){
  var s=step||{};
  if(s.kind==='review') return '?tool=review.html&block=1&limit='+encodeURIComponent(String(s.n||1));
  if(s.kind==='qb') return '?tool=question-bank-practice.html&block=1&n='+encodeURIComponent(String(s.n||5))+(s.cat?'&cat='+encodeURIComponent(String(s.cat)):'');
  return '?page='+encodeURIComponent(String(s.ref||''))+'&block=1';
}

/* The page's primary action records this reading and follows the saved block, even when the
   ordinary weekly auto-advance preference is off. A matching page is required: browsing away
   from a live block must not turn an unrelated resource into one of its steps. Derive the
   prospective status without mutating the saved block or the caller's progress map. */
function fdBlockPageHandoff(block, ref, doneMap){
  var steps=block&&block.steps||[], found=false, done={}, i, key;
  for(i=0;i<steps.length;i++){
    if(steps[i]&&steps[i].kind==='page'&&steps[i].ref===ref){ found=true; break; }
  }
  if(!found) return null;
  for(key in (doneMap||{})){
    if(Object.prototype.hasOwnProperty.call(doneMap,key)) done[key]=doneMap[key];
  }
  done[ref]=true;
  return fdBlockStatus(block, done);
}

function fdBlockHandoffLabel(handoff){
  var next=handoff&&handoff.next;
  if(!next) return 'Finish block →';
  if(next.kind==='qb') return 'Continue to your '+next.n+' question'+(next.n===1?'':'s')+' →';
  if(next.kind==='review') return 'Continue to your '+next.n+' review'+(next.n===1?'':'s')+' →';
  return 'Continue: '+next.title+' →';
}

/* Done state per step, page steps derived from the progress map. */
function fdBlockStatus(block, doneMap){
  var b=block||{}, list=b.steps||[], d=doneMap||{}, out=[], done=0, next=null;
  for(var i=0;i<list.length;i++){
    var s=list[i]||{};
    var isDone=(s.kind==='page')?(d[s.ref]===true):(s.done===true);
    if(isDone) done++;
    else if(!next) next=s;
    out.push({step:s, done:isDone});
  }
  return {steps:out, done:done, total:list.length, next:next, complete:list.length>0&&done===list.length};
}

function fdBlockDot(kind){
  return '<span class="fd-block__dot is-'+fdEsc(kind)+'"></span>';
}

function fdBlockCard(plan, minutes, block, doneMap){
  var budget=fdBlockBudget(minutes), i;
  if(block&&block.steps&&block.steps.length){
    var status=fdBlockStatus(block, doneMap);
    /* The section is named by its kicker, so a screen reader hears "Your 10-minute block" (or
       "Block complete"), not the first step's title. Each step's done state is spoken through a
       visually-hidden prefix — the check glyph is decoration and the strike-through is CSS. */
    var out='<section class="fd-block is-live" aria-labelledby="fdBlockTitle">';
    out+='<div class="fd-block__head"><span class="fd-block__kicker" id="fdBlockTitle">'+(status.complete?'Block complete':'Your '+fdEsc(block.minutes)+'-minute block')+'</span>'+
      '<span class="fd-block__count">'+status.done+' of '+status.total+' done</span></div>';
    out+='<div class="fd-block__steps">';
    for(i=0;i<status.steps.length;i++){
      var row=status.steps[i], s=row.step;
      out+='<div class="fd-block__step'+(row.done?' is-done':'')+'">'+
        '<span class="fd-block__check" aria-hidden="true">✓</span>'+
        '<span class="fd-block__title"><span class="fd-visually-hidden">'+(row.done?'Done: ':'Not yet: ')+'</span>'+fdEsc(s.title)+'</span>'+
        '<span class="fd-block__min">~'+fdEsc(s.min)+' min</span></div>';
    }
    out+='</div><div class="fd-block__actions">';
    if(status.next){
      out+='<button type="button" class="fd-btn fd-btn--primary" data-block-continue="1">Continue: '+fdEsc(status.next.title)+' →</button>';
    }else{
      out+='<span class="fd-block__doneline">'+(status.total===1?'The one step is done.':'All '+status.total+' steps done.')+' Tomorrow’s block will be built from tomorrow’s dues.</span>';
    }
    out+='<button type="button" class="fd-btn fd-btn--ghost" data-block-end="1">'+(status.next?'End block':'Clear')+'</button>';
    out+='</div></section>';
    return out;
  }
  var p=plan||{steps:[],total:0,minutes:budget};
  var h='<section class="fd-block" aria-labelledby="fdBlockTitle">';
  h+='<div class="fd-block__head"><span class="fd-block__kicker" id="fdBlockTitle">I have…</span>';
  h+='<div class="fd-block__chips" role="group" aria-label="Minutes available">';
  for(i=0;i<FD_BLOCK_MINUTES.length;i++){
    var m=FD_BLOCK_MINUTES[i];
    h+='<button type="button" class="fd-block__chip'+(m===budget?' is-sel':'')+'" data-block-minutes="'+m+'" aria-pressed="'+(m===budget?'true':'false')+'">'+m+' min</button>';
  }
  h+='</div><span class="fd-block__hint">Between rounds? Today packs the window from what is due and what is next.</span></div>';
  if(!p.steps.length){
    h+='<p class="fd-block__empty">Nothing is due and this week is read through. Open the question bank for a fresh set.</p>';
  }else{
    h+='<div class="fd-block__steps">';
    for(i=0;i<p.steps.length;i++){
      var step=p.steps[i];
      h+='<div class="fd-block__step">'+fdBlockDot(step.kind)+'<span class="fd-block__title">'+fdEsc(step.title)+'</span><span class="fd-block__min">~'+fdEsc(step.min)+' min</span></div>';
    }
    h+='</div><div class="fd-block__actions">';
    h+='<button type="button" class="fd-btn fd-btn--primary" data-block-start="'+budget+'">Start the '+budget+'-minute block</button>';
    h+='<span class="fd-block__hint">Runs as one session; the receipt at the end marks the page done for you.</span>';
    h+='</div>';
  }
  h+='</section>';
  return h;
}
