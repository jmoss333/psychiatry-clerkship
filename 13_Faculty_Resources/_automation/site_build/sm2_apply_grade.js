/* ==== Canonical SM-2 grader (build-injected — do not edit inside consumer files) ====
   Source of truth: 13_Faculty_Resources/_automation/site_build/sm2_apply_grade.js.
   Consumers carry a SM2_APPLY_GRADE marker comment that common.py's
   inject_shared_snippets() expands at build time (same mechanism as crisis blocks).
   Grades are the strings 'Again' | 'Hard' | 'Good' | 'Easy'. Semantics: ease floor
   1.3, Easy ease ceiling 4.0, interval cap 365 d, lapse halves the interval (min
   1 d) and re-dues the card immediately. Requires `var DAY = 86400000` in scope.
   Behaviour is pinned by tests/sm2-behavior.test.mjs; consumer wiring is pinned by
   tests/family-srs-parity.test.mjs.

   applyGrade(card, grade, opts) — opts is optional; opts.fuzzKey (string, usually
   the card id) enables deterministic ±15% interval fuzz (see sm2Fuzz below) so
   cohort-seeded cards de-synchronize instead of avalanching due on the same day.
   Omitting opts (or fuzzKey) is byte-identical to the pre-fuzz grader — every
   existing caller keeps its exact legacy schedule until it opts in.

   cw_srs_v1 STATS CONTRACT — who may write stats.seen / stats.correct:
   - question-bank-practice.html srsUpdate(): YES (ground-truth correctness).
   - review.html grade(): YES (ground-truth correctness).
   - family-systems-practice.html srsGradeFamily(): NO — cards only. A self-rating
     has no ground truth, and review.html renders Retention as correct/seen.
   - Practice sims write cw_practice_events_v1 instead — never cw_srs_v1.stats. */

/* Deterministic ±15% interval fuzz (opts.fuzzKey): de-synchronizes cohort-seeded
   cards so due-load avalanches spread out. No fuzzKey (legacy callers) = no fuzz.
   Also a no-op below ivl 3 d (too short to meaningfully fuzz). Always clamped
   to [1, 365] regardless of the input interval's own bounds. */
function sm2Fuzz(ivl, key, reps){
  if(ivl < 3 || !key) return ivl;
  var h = 2166136261, s = key + ':' + reps;
  for(var i=0;i<s.length;i++){ h = (h ^ s.charCodeAt(i)) * 16777619 >>> 0; }
  var f = ((h % 2001) / 1000) - 1;               /* [-1, 1] */
  return Math.min(365, Math.max(1, Math.round(ivl + ivl * 0.15 * f)));
}

function applyGrade(card, grade, opts){
  /* SM-2 variant: ease floor 1.3, interval cap 365 d */
  var c = Object.assign({}, card);
  var fuzzKey = opts && opts.fuzzKey;
  c.reps = (c.reps||0) + 1;
  if(c.ivl===0){
    /* first encounter */
    if(grade==='Again'){ c.lapses=(c.lapses||0)+1; c.ivl=1; c.due=Date.now(); }
    else if(grade==='Hard'){ c.ivl=1; c.due=Date.now()+DAY; }
    else if(grade==='Good'){ c.ivl=1; c.due=Date.now()+DAY; }
    else { c.ivl=sm2Fuzz(4, fuzzKey, c.reps); c.due=Date.now()+c.ivl*DAY; }  /* Easy */
  } else {
    if(grade==='Again'){
      /* Again is never fuzzed — lapses re-due immediately regardless of fuzzKey. */
      c.lapses=(c.lapses||0)+1;
      c.ease=Math.max(1.3, (c.ease||2.5)-0.2);
      c.ivl=Math.max(1, Math.round(c.ivl*0.5));
      c.due=Date.now();
    } else if(grade==='Hard'){
      c.ease=Math.max(1.3, (c.ease||2.5)-0.15);
      c.ivl=Math.max(1, Math.round(c.ivl*1.2));
      c.ivl=sm2Fuzz(c.ivl, fuzzKey, c.reps);
      c.due=Date.now()+Math.min(365,c.ivl)*DAY;
    } else if(grade==='Good'){
      c.ivl=Math.max(1, Math.round(c.ivl*(c.ease||2.5)));
      c.ivl=Math.min(365,c.ivl);
      c.ivl=sm2Fuzz(c.ivl, fuzzKey, c.reps);
      c.due=Date.now()+c.ivl*DAY;
    } else {  /* Easy */
      c.ease=Math.min(4, (c.ease||2.5)+0.15);
      c.ivl=Math.max(1, Math.round(c.ivl*(c.ease)*1.3));
      c.ivl=Math.min(365,c.ivl);
      c.ivl=sm2Fuzz(c.ivl, fuzzKey, c.reps);
      c.due=Date.now()+c.ivl*DAY;
    }
  }
  c.last=Date.now();
  return c;
}
