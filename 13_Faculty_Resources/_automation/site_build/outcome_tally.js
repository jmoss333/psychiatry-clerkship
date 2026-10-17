/* Outcome tally: aggregate engagement counters for the question bank and Daily Review.
   DRAFT (L8 outcomes design, 2026-10-16). It is not approved for use with learners.

   OFF unless BOTH build gates are on:
     - CLERKSHIP_OUTCOMES (default off) stamps the CW_OUTCOMES global into pages carrying
       this snippet (common.apply_outcomes_flag);
     - CLERKSHIP_ANALYTICS (default off) ships the emitter that defines cwAnalytics.
   If either is off this function returns on its first line and nothing leaves the page.

   What it can send: fixed, allowlisted keys naming a threshold this page visit crossed.
   The emitter's record function dedups each key per visit and honours DNT, GPC and the
   learner's opt-out. (Do not write that function's call form in a comment here: the
   static-site literal-argument rule scans comments too and would read it as a bad call.) What it never sends: an item id, category, answer, confidence, score, count or
   timestamp. The running counts below live in memory for this page visit and are never stored.
   Every record() argument is a string literal, so check-static-site.mjs's literal-argument
   rule keeps covering it.

   Called from calibLog() (calib_log.js) after that function validates its event, so its
   inputs are already enum-checked. calibLog's own storage behaviour is unchanged. */
var cwOutcomeVisit = { qb: { n: 0, c: 0 }, rev: { n: 0 } };
function cwOutcomeTally(evt){
  try{
    var w = (typeof window !== 'undefined') ? window : null;
    if(!w || w.CW_OUTCOMES !== 1 || !w.cwAnalytics || typeof w.cwAnalytics.record !== 'function') return;
    if(!evt) return;
    if(evt.s === 'qb'){
      var q = cwOutcomeVisit.qb;
      q.n += 1; if(evt.a === 1) q.c += 1;
      if(q.n === 5) w.cwAnalytics.record('tool:qbank:answered-5');
      if(q.n === 10){
        w.cwAnalytics.record('tool:qbank:answered-10');
        /* Accuracy band over the first ten answers of this visit, sent as one of three keys. */
        if(q.c < 5) w.cwAnalytics.record('tool:qbank:first10-lt50');
        else if(q.c < 8) w.cwAnalytics.record('tool:qbank:first10-50to79');
        else w.cwAnalytics.record('tool:qbank:first10-80up');
      }
      if(q.n === 20) w.cwAnalytics.record('tool:qbank:answered-20');
    } else if(evt.s === 'rev'){
      var r = cwOutcomeVisit.rev;
      r.n += 1;
      if(r.n === 1) w.cwAnalytics.record('tool:daily-review:graded-1');
      if(r.n === 10) w.cwAnalytics.record('tool:daily-review:graded-10');
      if(r.n === 25) w.cwAnalytics.record('tool:daily-review:graded-25');
    }
  }catch(_){ /* silent by contract: analytics must never disturb the tool */ }
}
