/* ---- cw_srs_v1 store adapter (shared) ------------------------------------
   Every tool that schedules a card writes the SAME store under the SAME shape.
   This file is the one definition of that shape; `applyGrade` (the SM-2 step
   itself) is a separate snippet, sm2_apply_grade.js, and stays that way.

   Why this is shared rather than copied into each tool: `srsFresh` fixes the
   store's version tag, its `day`/`stats`/`settings` sub-objects and the
   newPerDay default. A tool carrying its own slightly older copy would, on a
   browser whose store had never been written, create a store the other tools
   then read as authoritative — silently resetting a learner's daily allowance
   or dropping a stats field the dashboard reads. The failure is invisible and
   arrives only for learners who happen to open the wrong tool first.

   Card id namespaces live in the consumers, not here: deck# and TOPIC# (Daily
   Review), QB# (question bank), FAM# (family retrieval, fam_retrieval.js),
   COMM# and REASON# (the two tools below). spa_index.html's `srsBucket` is the
   registry of which prefix belongs to which bucket. */
var SRS_KEY='cw_srs_v1';
var DAY = 86400000;
function srsFresh(){return {v:1,cards:{},day:{lastDay:'',newToday:0},stats:{streak:0,lastStudy:'',totalReviews:0,correct:0,seen:0},settings:{newPerDay:12}};}
function srsLoadStore(){try{var s=JSON.parse(localStorage.getItem(SRS_KEY)||'null');if(s&&s.v===1){s.cards=s.cards||{};s.stats=s.stats||srsFresh().stats;return s;}}catch(_){}return srsFresh();}
function srsSaveStore(s){try{localStorage.setItem(SRS_KEY,JSON.stringify(s));}catch(_){}}

/* Schedule one card by id. Writes `cards` only — never `stats`: review.html
   renders Retention as correct/seen over cards it actually served, and a grade
   inferred inside another tool has no place in that denominator. */
function srsGradeCard(id,grade){
  if(!id) return null;
  var s=srsLoadStore();
  var card=s.cards[id]||{ease:2.5,ivl:0,reps:0,lapses:0,due:Date.now(),last:0};
  s.cards[id]=applyGrade(card,grade,{fuzzKey:id});
  srsSaveStore(s);
  return s.cards[id];
}

/* The tools below record a CHOICE, not a self-rating, so the grade is derived
   from the option's authored quality rather than asked for. `best` is a clean
   recall (Good, not Easy — Easy would stretch the interval on a four-way
   recognition task the learner may well have guessed); `partial` is a hesitant
   one; anything worse is a lapse. Unknown qualities fail to a lapse so a new
   quality added to the data can never quietly lengthen an interval. */
function srsGradeForQuality(quality){
  if(quality==='best') return 3;
  if(quality==='partial') return 2;
  return 1;
}
