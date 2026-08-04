/* ==== Canonical SM-2 grader (build-injected — do not edit inside consumer files) ====
   Source of truth: 13_Faculty_Resources/_automation/site_build/sm2_apply_grade.js.
   Consumers carry a SM2_APPLY_GRADE marker comment that common.py's
   inject_shared_snippets() expands at build time (same mechanism as crisis blocks).
   Grades are the strings 'Again' | 'Hard' | 'Good' | 'Easy'. Semantics: ease floor
   1.3, Easy ease ceiling 4.0, interval cap 365 d, lapse halves the interval (min
   1 d) and re-dues the card immediately. Requires `var DAY = 86400000` in scope.
   Behaviour is pinned by tests/sm2-behavior.test.mjs; consumer wiring is pinned by
   tests/family-srs-parity.test.mjs.

   cw_srs_v1 STATS CONTRACT — who may write stats.seen / stats.correct:
   - question-bank-practice.html srsUpdate(): YES (ground-truth correctness).
   - review.html grade(): YES (ground-truth correctness).
   - family-systems-practice.html srsGradeFamily(): NO — cards only. A self-rating
     has no ground truth, and review.html renders Retention as correct/seen.
   - Practice sims write cw_practice_events_v1 instead — never cw_srs_v1.stats. */
function applyGrade(card, grade){
  /* SM-2 variant: ease floor 1.3, interval cap 365 d */
  var c = Object.assign({}, card);
  c.reps = (c.reps||0) + 1;
  if(c.ivl===0){
    /* first encounter */
    if(grade==='Again'){ c.lapses=(c.lapses||0)+1; c.ivl=1; c.due=Date.now(); }
    else if(grade==='Hard'){ c.ivl=1; c.due=Date.now()+DAY; }
    else if(grade==='Good'){ c.ivl=1; c.due=Date.now()+DAY; }
    else { c.ivl=4; c.due=Date.now()+4*DAY; }  /* Easy */
  } else {
    if(grade==='Again'){
      c.lapses=(c.lapses||0)+1;
      c.ease=Math.max(1.3, (c.ease||2.5)-0.2);
      c.ivl=Math.max(1, Math.round(c.ivl*0.5));
      c.due=Date.now();
    } else if(grade==='Hard'){
      c.ease=Math.max(1.3, (c.ease||2.5)-0.15);
      c.ivl=Math.max(1, Math.round(c.ivl*1.2));
      c.due=Date.now()+Math.min(365,c.ivl)*DAY;
    } else if(grade==='Good'){
      c.ivl=Math.max(1, Math.round(c.ivl*(c.ease||2.5)));
      c.ivl=Math.min(365,c.ivl);
      c.due=Date.now()+c.ivl*DAY;
    } else {  /* Easy */
      c.ease=Math.min(4, (c.ease||2.5)+0.15);
      c.ivl=Math.max(1, Math.round(c.ivl*(c.ease)*1.3));
      c.ivl=Math.min(365,c.ivl);
      c.due=Date.now()+c.ivl*DAY;
    }
  }
  c.last=Date.now();
  return c;
}
