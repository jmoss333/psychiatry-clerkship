/* Search -- synonym-expanded ranking and the ⌘K overlay. See CLASS-INVENTORY.md section 7 and
   the prototype's Search overlay section (Front-Door-Hi-Fi-v2.dc.html, search "══", line 358).

   Injected via /*__FD_SEARCH__*\/ once a later plan registers the marker (see SNIPPET_MARKERS
   in common.py) -- this task does not register it or touch that file. ES5 only: var/function,
   no const/let/arrow functions/template literals -- matches the other frontdoor/ modules.

   Pure: fdSearchResults(index, query, synonyms, state) -> [result] and
   fdSearchOverlay(index, query, synonyms, state) -> string. No DOM, no browser storage, no
   clock access. Synonyms are NOT hardcoded here -- they come from curriculum.json's `synonyms`
   map, joined into `index` by nothing in particular (fd_data.js does not carry them), so the
   caller passes the map through as its own parameter on every call, same shape as the
   prototype's SYN constant: { abbrev: 'expansion words' }.

   ---- Ranking is a safety contract, not a preference (task-8-brief.md) ----
   Protocols (index.kit) are matched and ranked FIRST, ahead of ordinary items, so a student
   typing "suicide" mid-shift gets the C-SSRS protocol sheet before a topic page that merely
   mentions suicide. The initial view shows the top 8 results. A learner may reveal all
   matches for a typed query; expansion changes only the visible count, never the ranking.
   Empty-query suggestions remain capped at 8 and have no expansion control.

   ---- Dedup the prototype didn't need (repo-specific) ----
   The prototype's ITEMS and PROTOCOLS/KIT were disjoint id spaces, so a query could never match
   the same thing twice. This repo's data does not have that luxury: every safetyKit ref (e.g.
   pg_suicide.md) is ALSO a regular week item, so an unguarded search would show "Suicide Risk &
   Safety Card" twice for the query "suicide" -- once as the protocol, once as a plain item, with
   two different (and contradictory-looking) meta strings. Every ref that already matched as a
   protocol is excluded from the item pass (`seenRefs` below), and the same dedup guards the
   empty-query defaults against a next-unread item that happens to already be a kit ref.

   ---- Empty-query defaults ----
   Ported from the prototype's own default pool -- KIT, then the current week's next-unread
   item (if any), then three pinned reference tools -- with the SAME real refs standing in for
   the prototype's invented 'mse-builder' / 'ciwa-cows' / 'pocket-card' ids (its README already
   flags those 44 ITEMS as invented and superseded). The mapping is a judgement call, recorded
   here because nothing in curriculum.json names them explicitly:
     - 'mse-builder'  -> mse.html        (site_manifest: "Mental Status Exam")
     - 'ciwa-cows'    -> withdrawal.html (site_manifest: "Withdrawal: CIWA-Ar/COWS" -- literally
                                          the CIWA/COWS tool)
     - 'pocket-card'  -> pg_interview.md (week1.md's own `cta` in topic_meta.json points here
                                          and names it "the Interview & MSE Pocket Guide"; it is
                                          also curriculum.json's week-1 pocket reference, matching
                                          the prototype item's `w: 1` placement -- the closest real
                                          analogue to its invented "Top-20 pocket card")
   With no week set (state.week absent), next-unread is null and the defaults are exactly
   5 protocols + 3 pinned tools = 8, landing precisely at the cap with nothing dropped. With a
   week set, the raw candidate count can reach 9 and the cap trims the last pinned tool -- see
   the header note above; this is the prototype's own behaviour, not a bug introduced here.

   ---- Search destinations ----
   Ordinary results navigate directly via data-fd-open, like the library and weekly rows.
   Safety results retain data-fd-safety and its established quick-access protocol panel.
   The explicit data-fd-sheet modifier remains available to other preview surfaces.

   Copy rule: every string here ships to BOTH sites unrebranded -- audience-neutral, no
   MS3/clerkship/student/shelf/resident/UNE/MMC/Sanford. */

var FD_SEARCH_PINNED = ['mse.html', 'withdrawal.html', 'pg_interview.md'];

/* Discovery aliases never expand the safety haystack. Short ambiguous abbreviations must
   be the entire query. Normalize punctuation so PHQ-9 / PHQ 9 and trailing ? work alike. */
function fdSearchNormalize(q){
  return String(q||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}

function fdSearchAliasHit(item, query){
  var q=fdSearchNormalize(query), aliases=item.searchAliases||[];
  for(var i=0;i<aliases.length;i++){
    var alias=fdSearchNormalize(aliases[i]);
    if(alias&&(alias.length<=3?q===alias:(' '+q+' ').indexOf(' '+alias+' ')!==-1)) return true;
  }
  return false;
}

/* Medication names add ordinary reading matches, never priority aliases or safety
   evidence. Whole names prevent look-alike/substring substitutions. An exact name
   can rank its overview first among ordinary readings; added clinical context
   keeps the usual title/summary ranking (e.g. Ativan catatonia -> Catatonia). */
function fdSearchMedicationMatch(item, query){
  var q=fdSearchNormalize(query), terms=item.medicationTerms||[], match=0;
  for(var i=0;i<terms.length;i++){
    var term=fdSearchNormalize(terms[i]);
    if(term&&q===term) return 2;
    if(term&&(' '+q+' ').indexOf(' '+term+' ')!==-1) match=1;
  }
  return match;
}

/* Words that carry no topic signal. Unguarded, "on" matched 70 of 83 items and "the" 59 --
   including as substrings inside other words -- so any multi-word query degenerated into a
   near-wildcard and the cap-at-8 dropped the intended page. The raw-query substring check in
   fdSearchHits still sees the full phrase, so exact-title queries keep working. */
var FD_SEARCH_STOPWORDS={
  'a':1,'an':1,'and':1,'are':1,'as':1,'at':1,'be':1,'by':1,'for':1,'from':1,'has':1,'in':1,
  'is':1,'it':1,'of':1,'on':1,'or':1,'that':1,'the':1,'to':1,'was':1,'what':1,'when':1,
  'which':1,'who':1,'with':1,'you':1,'your':1,
  /* "patient" carries no topic signal in a library where every page is about one: it sits in a
     quarter of all haystacks and, being in delirium.md's summary, put Delirium second for
     "patient refuses medication" (#429). Safety-kit triggers read the RAW query, so a crisis
     phrase that starts with "patient" still routes ("patient is suicidal" -> pg_suicide.md). */
  'patient':1,'patients':1
};

/* Drops stopwords, but never returns empty: a query made only of stopwords keeps its words so
   it still behaves as before rather than silently matching nothing. */
function fdSearchContentWords(words){
  var out=[],i;
  for(i=0;i<words.length;i++){
    if(words[i]&&words[i].length>1&&!FD_SEARCH_STOPWORDS[words[i]]) out.push(words[i]);
  }
  return out.length?out:words;
}

/* Does `text` (lowercased) contain the search word `w`? A word longer than three characters
   matches anywhere, as it always has -- "lith" still finds lithium, "psych" still finds
   psychosis. A SHORT word may not match inside another word: until 2026-09-24 every haystack
   test was a bare substring, so "im" in "haldol im" matched "claim" and "time" and pulled two
   safety protocols to the top of a medication question, and "ect" matched every page that says
   "effect". Two characters or fewer must be a whole word (the route abbreviations im / iv / po /
   pr, and si / hi / od, which the synonyms map expands anyway). Exactly three characters must
   START a word, so "del" typed on the way to "delirium" still shows Delirium on that keystroke --
   search re-runs per keystroke, and a whole-word rule would blank the list mid-word -- while
   "ect" no longer matches "effect". Words are the runs of [a-z0-9]: "c-ssrs" is "c" and "ssrs",
   "pg_suicide.md" is "pg", "suicide" and "md".

   `loose` restores the old bare-substring test. The safety-kit haystack pass uses it, and that
   exemption is deliberate, not an oversight: measured on 2026-09-24, "cut her wrist", "she cut
   herself" and "cut myself" reach the suicide protocol ONLY because "cut" sits inside "acute" in
   that page's summary, and "pulled out iv" reaches the agitation protocol the same way. Strict
   matching there would silently delete those routes. Making them explicit is a crisis-vocabulary
   change to curriculum.json's safetyKit triggers, which is a faculty decision, so until it is
   made the protocol rows are exactly what they were and only ordinary results get the rule. */
var FD_SEARCH_SHORT_WORD=3;
function fdSearchWordIn(text, w, loose){
  if(!w) return false;
  if(loose||w.length>FD_SEARCH_SHORT_WORD) return text.indexOf(w)!==-1;
  var words=text.split(/[^a-z0-9]+/);
  for(var i=0;i<words.length;i++){
    if(w.length<FD_SEARCH_SHORT_WORD?words[i]===w:words[i].indexOf(w)===0) return true;
  }
  return false;
}

/* Higher is better. Title evidence outranks ref evidence outranks summary evidence, so an exact
   title match cannot be displaced by a page that merely mentions the phrase in prose. */
function fdSearchScore(item, rawQuery, contentWords, loose){
  var title=String(item.searchTitle||item.title||'').toLowerCase();
  var ref=String(item.ref||'').toLowerCase();
  var summary=String(item.summary||'').toLowerCase();
  var score=0,i,w;
  if(rawQuery){
    if(fdSearchNormalize(title)===fdSearchNormalize(rawQuery)) score+=100;
    else if(fdSearchWordIn(title, rawQuery, loose)) score+=70;
    if(fdSearchWordIn(ref, rawQuery, loose)) score+=25;
    if(fdSearchWordIn(summary, rawQuery, loose)) score+=10;
  }
  for(i=0;i<contentWords.length;i++){
    w=contentWords[i];
    if(fdSearchWordIn(title, w, loose)) score+=12;
    else if(fdSearchWordIn(ref, w, loose)) score+=6;
    else if(fdSearchWordIn(summary, w, loose)) score+=2;
  }
  return score;
}

/* Per-word synonym expansion. The ORIGINAL word always survives in the output (appended before
   its expansion, never replacing it) so a literal match on the abbreviation itself still works
   -- an unknown word passes through untouched. Lowercased internally so the synonyms map (all
   lowercase keys) matches regardless of how the caller's query was cased; callers that need the
   user's original casing (e.g. for display) keep their own copy of the raw string rather than
   reading it back out of this function. */
function fdExpandQuery(q, synonyms){
  var syn=synonyms||{};
  var raw=String(q||'').toLowerCase();
  var words=raw.split(/\s+/);
  var out=[];
  for(var i=0;i<words.length;i++){
    var w=words[i];
    if(!w) continue;
    out.push(syn[w]?(w+' '+syn[w]):w);
  }
  /* PHRASE pass. A synonyms key containing a space is matched whole-phrase against the
     space-padded raw query -- the same shape as the safetyKit triggers -- and is inert to the
     per-word loop above, so adding one cannot change any existing single-word behaviour.

     This exists because per-word expansion cannot express the Fresh Eyes Audit's A5 gaps without
     real collateral, which was measured before the mechanism was built: a synonym on "first"
     fixes "first shift" but hijacks "first line treatment" AND "first episode psychosis" (both
     push the orientation page above the correct one), and narrowing to "shift" alone still
     breaks "night shift sleep" while leaving "first day" unfixed. A phrase key fires only on the
     phrase, so those three queries are untouched -- tests/fd-search.test.mjs pins all three,
     because they are what the cheap fix would have broken. */
  var padded=' '+raw+' ';
  for(var key in syn){
    if(key.indexOf(' ')===-1) continue;
    if(padded.indexOf(' '+key+' ')!==-1) out.push(syn[key]);
  }
  return out.join(' ');
}

/* hay is already lowercased by the caller. Matches on either the raw (unexpanded) query as a
   whole substring, or any single expanded word of length > 1 -- single-letter expanded words
   would match almost everything and are excluded, same guard the prototype uses. A short raw
   query or word follows fdSearchWordIn's whole-word / word-start rule unless `loose`. */
function fdSearchHits(hay, rawQuery, expandedWords, loose){
  var h=hay||'';
  if(rawQuery&&fdSearchWordIn(h, rawQuery, loose)) return true;
  for(var i=0;i<expandedWords.length;i++){
    if(expandedWords[i].length>1&&fdSearchWordIn(h, expandedWords[i], loose)) return true;
  }
  return false;
}

function fdSearchHaystack(item){
  return (item.title+' '+item.ref+' '+item.summary).toLowerCase();
}

/* ---- The one bidirectional synonym list (C2, 2026-10-17) ------------------------------------
   idx.synonymGroups comes from site_build/data/search-synonyms.v1.json: each group is a list of
   normalised phrasings for one thing ("qtc", "qt prolongation", ...). A typed query that contains
   a group term is ALSO scored as each alternative query with that term swapped for another member
   of its group -- in both directions, which the older one-way `synonyms` map could not express
   ("nms" found Toxidromes; "neuroleptic malignant" did not). Alternatives are phrases, not loose
   words, so "decision making capacity" cannot widen into every page that says "making".

   Alternatives feed ORDINARY page matches only. They never enter the safety-protocol pass, so a
   group can neither create nor reorder a protocol row (the crisis contract above keeps its own
   trigger vocabulary), and they never create an exact-title match. Their score is discounted by
   FD_SEARCH_ALT_WEIGHT so the words the learner actually typed still win a tie. */
var FD_SEARCH_ALT_WEIGHT=0.9;
var FD_SEARCH_MAX_ALTERNATIVES=12;
function fdSearchAlternatives(query, groups){
  var base=fdSearchNormalize(query), padded=' '+base+' ', out=[], seen={}, list=groups||[];
  seen[base]=true;
  for(var g=0;g<list.length;g++){
    var terms=list[g]||[], hit=null;
    /* Longest term first: "qtc prolongation" must swap as a whole, not as "qtc" + a stray word. */
    var ordered=terms.slice().sort(function(a,b){
      return (b.length-a.length)||(a<b?-1:(a>b?1:0));
    });
    for(var t=0;t<ordered.length;t++){
      if(ordered[t]&&padded.indexOf(' '+ordered[t]+' ')!==-1){ hit=ordered[t]; break; }
    }
    if(!hit) continue;
    for(var u=0;u<terms.length;u++){
      if(!terms[u]||terms[u]===hit) continue;
      var alt=padded.replace(' '+hit+' ',' '+terms[u]+' ').trim();
      if(!seen[alt]){ seen[alt]=true; out.push(alt); }
    }
  }
  return out.slice(0,FD_SEARCH_MAX_ALTERNATIVES);
}

/* ---- Page-text hits (C2, 2026-10-17) ----------------------------------------------------------
   Both sites already download search-index.json -- an inverted index over every shipped page's
   title, headings and body text (common.py build_search_index) -- but until now only the ＋Ask
   matcher read it, so this search matched titles and summaries alone: "QTc" returned one page
   while fourteen discuss it. The shell hands that index in as state.bodyIndex; without it (not yet
   loaded, offline before first fetch, every unit test that predates this) search behaves exactly
   as it did.

   Scoring mirrors the shell's ＋Ask scorer (spa_index.html runSearch) so the two cannot drift
   into different ideas of relevance: tf divided by the same BM25 length pivot (b = 0.5,
   LEN_NORM_B there), times idf. Two deliberate differences, both toward precision: the words of
   a phrase must ALL occur on the page (a page carrying only "first" or only "episode" is not a
   first-episode-psychosis page; partial matches count at a quarter), and a prefix variant needs
   five typed characters ("catatoni" finds catatonic, "lith" does not fan out).

   Blending, with titles and summaries weighted higher. The text score is normalised to the best
   page for this query and contributes at most FD_SEARCH_BODY_WEIGHT -- below a single title word
   (12) and below a summary phrase (10) in fdSearchScore -- so text evidence orders pages that
   already match and adds pages that only the text mentions, but cannot lift a passing mention
   above a page whose title or summary names the topic. Text-only pages also need at least
   FD_SEARCH_BODY_FLOOR of the best page's evidence, and at most FD_SEARCH_BODY_MAX of them are
   added. Safety-kit pages are never added from text: protocol rows come only from the trigger and
   haystack routes above, and a kit page appearing as a plain item would contradict its protocol
   row (the dedup note at the top of this file). */
var FD_SEARCH_BODY_WEIGHT=8;
var FD_SEARCH_BODY_FLOOR=0.25;
var FD_SEARCH_BODY_MAX=10;
var FD_SEARCH_BODY_PREFIX=5;
var FD_SEARCH_BODY_PARTIAL=0.25;
var FD_SEARCH_BODY_LEN_B=0.5;
var FD_SEARCH_BODY_STOP={
  'a':1,'an':1,'and':1,'are':1,'as':1,'at':1,'be':1,'by':1,'for':1,'from':1,'has':1,'in':1,
  'is':1,'it':1,'of':1,'on':1,'or':1,'that':1,'the':1,'to':1,'was':1,'with':1,'you':1,'your':1
};
function fdSearchBodyTokens(text){
  var words=fdSearchNormalize(text).split(' '), out=[];
  for(var i=0;i<words.length;i++){
    if(words[i].length>=2&&!FD_SEARCH_BODY_STOP[words[i]]) out.push(words[i]);
  }
  return out;
}
/* Sorted vocabulary + slug -> doc id, computed once per index object and kept beside it. */
function fdSearchBodyPrep(si){
  if(!si||typeof si!=='object'||!si.postings||!Array.isArray(si.docs)) return null;
  if(si.__fdPrep) return si.__fdPrep;
  var byF={};
  for(var i=0;i<si.docs.length;i++){ if(si.docs[i]&&si.docs[i].f) byF[si.docs[i].f]=i; }
  var prep={vocab:Object.keys(si.postings).sort(), byF:byF};
  try{ Object.defineProperty(si,'__fdPrep',{value:prep,enumerable:false}); }catch(_){ si.__fdPrep=prep; }
  return prep;
}
function fdSearchBodyVariants(si, prep, term){
  var out={};
  if(si.postings[term]) out[term]=1;
  if(term.length>=FD_SEARCH_BODY_PREFIX){
    var v=prep.vocab, lo=0, hi=v.length;
    while(lo<hi){ var mid=(lo+hi)>>1; if(v[mid]<term) lo=mid+1; else hi=mid; }
    for(var k=lo;k<v.length&&v[k].indexOf(term)===0;k++){ if(!out[v[k]]) out[v[k]]=0.5; }
  }
  return out;
}
function fdSearchBodyPhrase(si, prep, tokens, weight, acc){
  if(!tokens.length) return;
  var sum={}, cover={}, avg=si.avgLen||0;
  for(var t=0;t<tokens.length;t++){
    var variants=fdSearchBodyVariants(si, prep, tokens[t]), hit={};
    for(var v in variants){
      var post=si.postings[v]||[], idf=Math.log(1+(si.n||1)/((si.df&&si.df[v])||1));
      for(var p=0;p<post.length;p++){
        var id=post[p][0], doc=si.docs[id], L=doc&&doc.L||0;
        var norm=(avg>0&&L>0)?((1-FD_SEARCH_BODY_LEN_B)+FD_SEARCH_BODY_LEN_B*(L/avg)):1;
        sum[id]=(sum[id]||0)+(post[p][1]/norm)*idf*variants[v];
        hit[id]=1;
      }
    }
    for(var h in hit) cover[h]=(cover[h]||0)+1;
  }
  for(var d in sum){
    var s=sum[d]*weight*(cover[d]===tokens.length?1:FD_SEARCH_BODY_PARTIAL*cover[d]/tokens.length);
    if(!(acc[d]>=s)) acc[d]=s;
  }
}
/* -> { ref: {norm: 0..1, rank: 0-based} } for this query, or {} without an index. */
function fdSearchBodyScores(si, query, alternatives){
  var prep=fdSearchBodyPrep(si), out={};
  if(!prep) return out;
  var acc={}, alts=alternatives||[];
  fdSearchBodyPhrase(si, prep, fdSearchBodyTokens(query), 1, acc);
  for(var a=0;a<alts.length;a++) fdSearchBodyPhrase(si, prep, fdSearchBodyTokens(alts[a]), FD_SEARCH_ALT_WEIGHT, acc);
  var ids=[], best=0;
  for(var id in acc){ if(acc[id]>0){ ids.push(id); if(acc[id]>best) best=acc[id]; } }
  if(!(best>0)) return out;
  ids.sort(function(x,y){
    var fx=si.docs[x].f, fy=si.docs[y].f;
    return (acc[y]-acc[x])||(fx<fy?-1:(fx>fy?1:0));
  });
  for(var r=0;r<ids.length;r++) out[si.docs[ids[r]].f]={norm:acc[ids[r]]/best, rank:r};
  return out;
}

/* Crisis routing for the protocol pass. Triggers are matched against the SPACE-PADDED raw query
   rather than the word list, which buys whole-word/phrase matching without a regex: " diet and
   nutrition " does not contain " die ", and a multi-word trigger can be authored the way a
   learner types it ("wants to die") instead of in filtered form ("wants die"). The raw query is
   used, not the expanded one, so a synonym expansion can never conjure a crisis match that the
   learner did not type. */
function fdSearchTriggerHit(triggers, paddedQuery){
  var list=triggers||[];
  for(var i=0;i<list.length;i++){
    if(list[i]&&paddedQuery.indexOf(' '+list[i]+' ')!==-1) return true;
  }
  return false;
}

/* Care vocabulary is deliberately separate from synonyms and safety triggers. A match only
   selects a static, canonical URL; the typed phrase never becomes a query parameter or fragment. */
function fdSearchCareHit(resource, normalizedQuery){
  var padded=' '+normalizedQuery+' ', terms=resource.searchTerms||[];
  for(var i=0;i<terms.length;i++){
    var term=fdSearchNormalize(terms[i]);
    if(term&&padded.indexOf(' '+term+' ')!==-1) return true;
  }
  return false;
}

function fdSearchItemMeta(item){
  /* Say so in the result row itself: a learner searching "catatonia scale" mid-shift should learn
     from the list, not from opening the page, that the scale is not reproduced here. Checked
     BEFORE the tool branch, since a rights page is still kind 'tool'. */
  if(item.rights) return 'reference · not reproduced';
  if(item.kind==='tool') return 'tool';
  return (typeof item.minutes==='number')?(item.minutes+' min read'):'';
}

/* First not-done item in the student's CURRENT week (state.week), matching the prototype's own
   nextItem lookup (first week item whose id is not in the done map). No week set (state.week not
   a number) or every item already done both yield null, so an empty-query render with no
   rotation week configured yet just quietly omits this slot rather than throwing. */
function fdSearchNextUnread(index, state){
  var st=state||{};
  if(typeof st.week!=='number'||isNaN(st.week)) return null;
  var items=fdItemsForWeek(index, st.week);
  var done=st.done||{};
  for(var i=0;i<items.length;i++){
    if(!done[items[i].ref]) return items[i];
  }
  return null;
}

function fdSearchMatches(index, query, synonyms, state){
  var idx=index||{byRef:{}, weeks:[], columns:[], kit:[]};
  var kit=idx.kit||[];
  var rawQuery=String(query||'').trim().toLowerCase();
  var seenRefs={};

  if(!rawQuery){
    var out=[];
    for(var k=0;k<kit.length;k++){
      out.push({ item: kit[k].item, kind:'protocol', meta:'safety · protocol' });
      seenRefs[kit[k].item.ref]=true;
    }
    var next=fdSearchNextUnread(idx, state);
    if(next&&!seenRefs[next.ref]){
      out.push({ item: next, kind:'item', meta: fdSearchItemMeta(next) });
      seenRefs[next.ref]=true;
    }
    for(var p=0;p<FD_SEARCH_PINNED.length;p++){
      var pinned=idx.byRef[FD_SEARCH_PINNED[p]];
      if(pinned&&!seenRefs[pinned.ref]){
        out.push({ item: pinned, kind:'item', meta: fdSearchItemMeta(pinned) });
        seenRefs[pinned.ref]=true;
      }
    }
    return out.slice(0,8);
  }

  var expandedWords=fdExpandQuery(rawQuery, synonyms).split(/\s+/);
  var qw=[];
  for(var e=0;e<expandedWords.length;e++){ if(expandedWords[e]) qw.push(expandedWords[e]); }
  var contentWords=fdSearchContentWords(qw);
  /* Share punctuation boundaries between reading discovery and literal safety triggers.
     Resource filenames stay literal: splitting their shared .md/.html extension would
     match almost the whole library, even when the requested filename does not exist. */
  var readingQuery=/\.(md|html)\b/.test(rawQuery)?rawQuery:fdSearchNormalize(rawQuery);

  /* Two ways into the safety kit, both deliberate.

     (1) an explicit TRIGGER phrase -- the crisis vocabulary each protocol carries in
         curriculum.json's safetyKit. This is what routes the way a learner actually types
         mid-shift ("i want to kill myself", "she said she wants to die").
     (2) the ordinary haystack match, now on the FILTERED word list.

     Until 2026-08-28 there was only (2), on the UNFILTERED list, and the comment here claimed
     that WAS the safety contract. It was not: measured against the real index, the only token in
     "i want to kill myself" that matched pg_suicide.md was the stopword "to", found inside
     "thoughts" in that page's tldr -- the haystack carries none of kill/myself/die/suicidal and
     the synonyms map has no crisis terms. So the same mechanism produced both the crisis route
     and the leak where "on"/"the" wildcard-matched all five protocols and buried the page the
     learner named (the 2026-08-27 audit's A1: typing the exact title "therapy on the unit" and
     pressing Enter opened the suicide sheet). Removing one removed the other; filtering alone
     returned zero protocols for every plain-language crisis query.

     Splitting them makes the safety contract explicit and testable, and stops it depending on a
     copy-edit: rewording a tldr can no longer silently delete the kit from a suicide query.
     fdSearchContentWords never returns empty, so an all-stopword query still surfaces the kit --
     fail-safe, and pinned by test. */
  var paddedQuery=' '+rawQuery+' ';
  /* Retain original safety evidence. Punctuation may recover an explicit trigger or a
     curated synonym expansion, never arbitrary new substring evidence ("min" in a title
     must not match "thiamine", nor "Sep" in a date match "separate"). */
  // Preserve compound names (CIWA-Ar, self-harm); splitting them creates noisy short tokens.
  var normalizedQuery=rawQuery.replace(/[^a-z0-9' -]+/g,' ').trim().replace(/\s+/g,' ');
  var safetyWords=[], safetySynonyms=synonyms||{}, normalizedPadded=' '+normalizedQuery+' ';
  if(normalizedQuery!==rawQuery){
    for(var safetyKey in safetySynonyms){
      if(normalizedPadded.indexOf(' '+safetyKey+' ')!==-1){
        safetyWords=safetyWords.concat(fdSearchContentWords(safetySynonyms[safetyKey].split(/\s+/)));
      }
    }
  }
  /* Additional separator recovery may expose an authored abbreviation (patient-si) or
     phrase (refuses-medication). Its expansion is discovery evidence, not a new crisis
     trigger: keep the curated capacity alias ahead of the consult sheet it also finds. */
  var recoveredSafetyWords=[], readingPadded=' '+readingQuery+' ';
  if(readingQuery!==normalizedQuery){
    for(var recoveredKey in safetySynonyms){
      if(readingPadded.indexOf(' '+recoveredKey+' ')!==-1&&
         normalizedPadded.indexOf(' '+recoveredKey+' ')===-1){
        recoveredSafetyWords=recoveredSafetyWords.concat(fdSearchContentWords(safetySynonyms[recoveredKey].split(/\s+/)));
      }
    }
  }
  /* Two tiers of protocol row, both placed by position rather than by score. Route (1) -- the
     explicit trigger vocabulary and the punctuation-recovered safety synonyms -- is the crisis
     contract and always comes first. Route (2), an ordinary haystack match on a content word, is
     discovery: still ahead of every scored item, but BELOW an item the curated search aliases
     name for this exact phrasing. Before #429 route (2) outranked those aliases too, so "patient
     refuses medication" listed the Consult Questions sheet (its title carries "capacity", the
     synonym expansion of "refuses medication") above the Decisional Capacity tool that answers
     the question. An alias is a recorded faculty statement that a phrasing means a resource; a
     topic word in a protocol's title is not. Crisis triggers are untouched by this. */
  var protoResults=[], hayProtocols=[];
  for(var kk=0;kk<kit.length;kk++){
    var kitItem=kit[kk].item;
    var triggered=fdSearchTriggerHit(kit[kk].triggers, paddedQuery)||
       fdSearchTriggerHit(kit[kk].triggers, ' '+normalizedQuery+' ')||
       fdSearchTriggerHit(kit[kk].triggers, ' '+readingQuery+' ')||
       fdSearchHits(fdSearchHaystack(kitItem), '', safetyWords, true);
    /* loose: see fdSearchWordIn. Protocol rows keep the pre-2026-09-24 substring test. */
    var byHaystack=fdSearchHits(fdSearchHaystack(kitItem), rawQuery, contentWords, true)||
       fdSearchHits(fdSearchHaystack(kitItem), '', recoveredSafetyWords, true);
    if(triggered){
      protoResults.push({ item: kitItem, kind:'protocol', meta:'safety · protocol' });
      seenRefs[kitItem.ref]=true;
    } else if(byHaystack){
      hayProtocols.push({ item: kitItem, kind:'protocol', meta:'safety · protocol' });
      seenRefs[kitItem.ref]=true;
    }
  }

  var careResults=[], care=idx.careResources||[];
  for(var ci=0;ci<care.length;ci++){
    if(fdSearchCareHit(care[ci],normalizedQuery)){
      careResults.push({item:care[ci],kind:'care',meta:'External care resource'});
    }
  }

  /* Refs are sorted first so the sort below is deterministic across engines: equal scores keep
     alphabetical order, matching fd_data.js's fdLibraryOnlyReads precedent. */
  var refs=[];
  for(var ref in idx.byRef){ if(!idx.byRef[ref].readerOnly) refs.push(ref); }
  refs.sort(function(a,b){ return a<b?-1:(a>b?1:0); });

  /* Reading discovery also sees punctuation-separated words. Keep the original query's
     matches and score for compound names. Only literal phrases can recover an authored
     safety trigger above; these expanded words never feed the protocol haystack. */
  var readingWords=fdSearchContentWords(fdExpandQuery(readingQuery, synonyms).split(/\s+/));
  /* Synonym-group alternatives and page-text evidence (see the two notes above fdSearchAlternatives
     and fdSearchBodyScores). Both are ordinary-item evidence only; neither touches protoResults. */
  /* A typed file name ("t_mood.md") asks for that file: no synonym swaps and no page-text tier,
     whose tokens ("mood", "md") would otherwise match every page that links another page. */
  var literalFile=readingQuery===rawQuery&&/\.(md|html)\b/.test(rawQuery);
  var alternatives=literalFile?[]:fdSearchAlternatives(readingQuery, idx.synonymGroups);
  var altWords=[];
  for(var aw=0;aw<alternatives.length;aw++){
    altWords.push(fdSearchContentWords(fdExpandQuery(alternatives[aw], synonyms).split(/\s+/)));
  }
  var body=literalFile?{}:fdSearchBodyScores(state&&state.bodyIndex, readingQuery, alternatives);
  var kitRefs={};
  for(var kr=0;kr<kit.length;kr++){ if(kit[kr].item) kitRefs[kit[kr].item.ref]=true; }
  var itemResults=[], bodyOnly=[];
  for(var r=0;r<refs.length;r++){
    if(seenRefs[refs[r]]) continue;
    var it=idx.byRef[refs[r]];
    var aliasHit=fdSearchAliasHit(it, rawQuery);
    var medicationMatch=fdSearchMedicationMatch(it, rawQuery);
    var searchHay=fdSearchHaystack(it)+' '+String(it.searchTitle||'').toLowerCase();
    var literal=aliasHit||medicationMatch||fdSearchHits(searchHay, rawQuery, contentWords)||
       fdSearchHits(searchHay, readingQuery, readingWords);
    var score=literal?Math.max(fdSearchScore(it, rawQuery, contentWords), fdSearchScore(it, readingQuery, readingWords)):0;
    var altHit=false, altAlias=false;
    for(var ai=0;ai<alternatives.length;ai++){
      var thisAlias=fdSearchAliasHit(it, alternatives[ai]);
      if(thisAlias||fdSearchHits(searchHay, alternatives[ai], altWords[ai])){
        altHit=true;
        if(thisAlias) altAlias=true;
        score=Math.max(score, FD_SEARCH_ALT_WEIGHT*fdSearchScore(it, alternatives[ai], altWords[ai]));
      }
    }
    var text=body[it.ref], textScore=text?FD_SEARCH_BODY_WEIGHT*text.norm:0;
    if(literal||altHit){
      /* An alias reached only through a synonym group ("neuroleptic malignant" -> "nms" ->
         Toxidromes) earns the alias SCORE, discounted, but never the alias TIER: only an alias
         the learner typed may outrank a haystack-matched safety protocol (#429, and the held
         placements in tests/fixtures/search-ward.json's `deferred` -- "neuroleptic malignant
         syndrome" must not move the Substance Use protocol). */
      var aliasBonus=aliasHit?120:(altAlias?FD_SEARCH_ALT_WEIGHT*120:0);
      itemResults.push({
        item: it, kind:'item', meta: fdSearchItemMeta(it),
        _score: score+textScore+aliasBonus+(medicationMatch===2?90:0), _alias: !!aliasHit
      });
    } else if(text&&text.norm>=FD_SEARCH_BODY_FLOOR&&!kitRefs[it.ref]){
      bodyOnly.push({ item: it, kind:'item', meta: fdSearchItemMeta(it), body:true, _score: textScore, _alias:false });
    }
  }
  bodyOnly.sort(function(a,b){
    return (b._score-a._score)||(a.item.ref<b.item.ref?-1:(a.item.ref>b.item.ref?1:0));
  });
  itemResults=itemResults.concat(bodyOnly.slice(0,FD_SEARCH_BODY_MAX));
  /* Ties break on ref rather than on Array.prototype.sort stability, which ES5 does not
     guarantee: on an engine that reorders equal scores the tail of the list would shuffle and
     the cap-at-8 would drop a different page in different browsers. Protocols are concatenated
     ahead of every item and are never reordered -- the safety contract is positional, not
     score-based. */
  itemResults.sort(function(a,b){
    return (b._score-a._score) ||
      (a.item.ref<b.item.ref?-1:(a.item.ref>b.item.ref?1:0));
  });
  /* Item tiers, by position. ALIAS: a recorded faculty statement that a phrasing means a
     resource (#429) -- it outranks a protocol that merely carries the topic word in its title.
     EXACT: the learner typed a resource's whole name (normalised like the title: punctuation,
     dates and audience suffix stripped), the strongest statement a query can make about what
     it wants. Then everything else by score.
     The exact tier exists because of the diagnosis aliases added 2026-10-17: a one-word alias
     ("psychosis" -> the psychosis guide) also sits inside other pages' titles ("First-Episode
     Psychosis (Sep 7)"), and with aliases as the only tier the guide hijacked that page's own
     exact title -- tests/search-discovery.test.mjs's generated title variants are the pin.
     Ordering (see the return below), with the safety prefix always intact:
       - an exact item that is ALSO an alias hit keeps the alias privilege and leads the alias
         tier ("decisional capacity" -> the capacity tool, above the consult sheet, #429);
       - an exact item that is NOT an alias ("Catatonia [Aug 31] -- MS3?") follows the haystack
         protocols -- a named resource never displaces the safety prefix
         (frontdoor-search-gate.mjs) -- and precedes every other alias item;
       - with no exact item the order is unchanged: alias, haystack protocols, rest. */
  var exactQuery=fdSearchNormalize(rawQuery), exactReading=fdSearchNormalize(readingQuery);
  var exactAlias=[], exactOnly=[], aliasItems=[], rest=[];
  for(var s=0;s<itemResults.length;s++){
    var exactTitle=fdSearchNormalize(itemResults[s].item.searchTitle||itemResults[s].item.title||'');
    var isExact=!!exactTitle&&(exactTitle===exactQuery||exactTitle===exactReading);
    (isExact?(itemResults[s]._alias?exactAlias:exactOnly):(itemResults[s]._alias?aliasItems:rest)).push(itemResults[s]);
    delete itemResults[s]._score; delete itemResults[s]._alias;
  }
  /* Haystack-matched protocols rank among themselves by the same score as items (with the same
     explicit tiebreak), not by kit order: typing "delirium" should list the Delirium sheet
     before the Consult Questions sheet whose title merely contains the word. Trigger-matched
     protocols stay in kit order -- that block is the crisis contract and is never reordered. */
  for(var hp=0;hp<hayProtocols.length;hp++){
    hayProtocols[hp]._score=Math.max(fdSearchScore(hayProtocols[hp].item, rawQuery, contentWords, true),
      fdSearchScore(hayProtocols[hp].item, '', recoveredSafetyWords, true));
  }
  hayProtocols.sort(function(a,b){
    return (b._score-a._score) ||
      (a.item.ref<b.item.ref?-1:(a.item.ref>b.item.ref?1:0));
  });
  for(var hq=0;hq<hayProtocols.length;hq++){ delete hayProtocols[hq]._score; }

  if(exactOnly.length) return protoResults.concat(careResults, exactAlias, hayProtocols, exactOnly, aliasItems, rest);
  return protoResults.concat(careResults, exactAlias, aliasItems, hayProtocols, rest);
}

/* Keep one matching/ranking pass for both the honest total and the visible rows. The keyboard
   shortcut uses this same order, so revealing the tail cannot change what Enter opens. */
function fdSearchResults(index, query, synonyms, state){
  var matches=fdSearchMatches(index, query, synonyms, state);
  return state&&state.searchExpanded===true?matches:matches.slice(0,8);
}

/* ---- Result rows and groups (one-thread redesign, Phase 2; spec section 6) ----------------
   Rows are shown in three groups -- Safety protocols, Pages, Tools (plus Patient care resources
   when a care match exists) -- each with its own meta line:
     protocol  the kit's own cue line (curriculum.safetyKit `sub`), red dot
     page      "Reading · <section> · Weeks…" (section = the libraryColumns column), outlined dot
     tool      the existing hint (curriculum.libraryHints), teal dot; a rights reference keeps its
               "Reference · not reproduced" line so the row itself says the scale is not here
   `ctx` carries the index for the section and kit lookups; a caller without one (older tests,
   other surfaces) gets the result's own `meta` string exactly as before. */
function fdSearchRowMeta(r, ctx){
  var it=r.item, idx=ctx&&ctx.index;
  if(!idx||r.kind==='care') return r.meta||'';
  if(r.kind==='protocol'){
    var kit=idx.kit||[];
    for(var k=0;k<kit.length;k++){ if(kit[k].item&&kit[k].item.ref===it.ref&&kit[k].sub) return String(kit[k].sub); }
    return r.meta||'';
  }
  /* The rights line is the existing string, unchanged (front-door.spec.js pins it by name). */
  if(it.rights) return 'reference · not reproduced';
  if(it.kind==='tool') return it.hint||'Tool';
  var parts=['Reading'], cols=idx.columns||[], c, j;
  for(c=0;c<cols.length;c++){
    var items=cols[c].items||[], hit=false;
    for(j=0;j<items.length;j++){ if(items[j].ref===it.ref) hit=true; }
    if(hit){ parts.push(cols[c].name); break; }
  }
  var weeks=[], ws=idx.weeks||[], w, i;
  for(w=0;w<ws.length;w++){
    var wi=ws[w].items||[];
    for(i=0;i<wi.length;i++){ if(wi[i].ref===it.ref){ weeks.push(ws[w].n); break; } }
  }
  if(weeks.length===1) parts.push('Week '+weeks[0]);
  else if(weeks.length>1) parts.push('Weeks '+weeks.slice(0,weeks.length-1).join(', ')+' and '+weeks[weeks.length-1]);
  return parts.join(' · ');
}

/* Protocol rows keep the safety panel; ordinary results open the resource directly. */
function fdSearchResultRow(r, ctx){
  var it=r.item, c=ctx||{};
  var meta=fdSearchRowMeta(r,c);
  /* A page found only by its text says so, so the row does not read like a title match. */
  if(r.body) meta=meta?meta+' · mentioned in the text':'Mentioned in the text';
  if(r.kind==='care'){
    return '<a class="fd-result is-care" data-care-resource="'+fdEsc(it.id)+'" href="'+fdEsc(it.url)+'" target="_blank" rel="noopener noreferrer">'+
      '<span class="fd-result__dot is-care"></span><span class="fd-result__title">'+fdEsc(it.title)+'</span>'+
      '<span class="fd-result__meta">'+fdEsc(meta)+'</span></a>';
  }
  var isProto=(r.kind==='protocol');
  var dotCls='fd-result__dot';
  if(isProto) dotCls+=' is-safety';
  else if(it.kind==='tool'&&!it.rights) dotCls+=' is-tool';
  var openAttrs=isProto
    ?(' data-fd-safety="'+fdEsc(it.ref)+'"')
    :(' data-fd-open="'+fdEsc(it.ref)+'"');
  return '<button type="button" class="fd-result'+(c.first?' is-first':'')+'"'+openAttrs+'>'+
    '<span class="'+dotCls+'"></span>'+
    '<span class="fd-result__title">'+fdEsc(it.searchTitle||it.title)+'</span>'+
    governanceBadge(it.governance)+
    '<span class="fd-result__meta">'+fdEsc(meta)+'</span>'+
  '</button>';
}

/* Groups appear in the order their best-ranked member holds in `results`, so the first rendered
   row is always results[0] -- the row Enter opens (fd_wire.js). A crisis query puts a trigger
   protocol first by contract, so Safety protocols lead exactly as the spec draws; an alias query
   such as "patient refuses medication" (#429) keeps its tool ahead of a protocol that merely
   shares a word, which a fixed Safety-first order would have undone. Only a leading protocol
   wears the danger-wash `is-first` background. */
var FD_SEARCH_GROUPS={
  protocol:{cls:'is-safety',label:'Safety protocols'},
  page:{cls:'',label:'Pages'},
  tool:{cls:'',label:'Tools'},
  care:{cls:'is-care',label:'Patient care resources'}
};
function fdSearchGroupOf(r){
  if(r.kind==='protocol'||r.kind==='care') return r.kind;
  return (r.item&&r.item.kind==='tool')?'tool':'page';
}
function fdSearchGroupedRows(results, index){
  var order=[], byGroup={}, i, g;
  for(i=0;i<results.length;i++){
    g=fdSearchGroupOf(results[i]);
    if(!byGroup[g]){ byGroup[g]=[]; order.push(g); }
    byGroup[g].push(results[i]);
  }
  var out='';
  for(i=0;i<order.length;i++){
    g=order[i];
    var meta=FD_SEARCH_GROUPS[g];
    out+='<p class="fd-searchpanel__group'+(meta.cls?' '+meta.cls:'')+'">'+meta.label+'</p>';
    for(var j=0;j<byGroup[g].length;j++){
      out+=fdSearchResultRow(byGroup[g][j],{index:index,first:i===0&&j===0&&g==='protocol'});
    }
  }
  return out;
}

function fdSearchOverlay(index, query, synonyms, state){
  var q=String(query||'');
  var trimmed=q.trim();
  var matches=fdSearchMatches(index, q, synonyms, state);
  var expanded=!!(trimmed&&state&&state.searchExpanded===true);
  var results=expanded?matches:matches.slice(0,8);
  var overflow=!!trimmed&&matches.length>8;
  var count=overflow
    ?(expanded?'Showing all '+matches.length+' matches':'Showing the top 8 of '+matches.length+' matches')
    :matches.length+' match'+(matches.length===1?'':'es');

  var out='<div class="fd-search" role="dialog" aria-modal="true" aria-label="Search">';
  out+='<div class="fd-searchpanel">';
  out+='<div class="fd-searchpanel__head">';
  out+='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" '+
    'stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle>'+
    '<path d="M21 21l-4-4"></path></svg>';
  out+='<input type="text" class="fd-searchpanel__input" value="'+fdEsc(q)+'" '+
    'aria-label="Search resources" placeholder="Symptom, drug, tool, or task…">';
  out+='<button type="button" class="fd-searchpanel__esc" data-fd-close-search aria-label="Close search">Close</button>';
  out+='</div>';
  if(!(state&&state.appMode===true)&&(!trimmed||matches.length)){
    out+='<div class="fd-searchpanel__browse">'+
      '<button type="button" class="fd-btn" data-fd-tab="library">Browse the Library</button></div>';
  }
  /* Results replace themselves on every keystroke with no visual transition a screen reader can
     observe, so the region announces its own size. aria-label carries the count rather than a
     visually-hidden node: the panel is rebuilt wholesale on each render, and an attribute cannot
     drift out of sync with the rows the way a separate element can. */
  out+='<div class="fd-searchpanel__body" id="fd-search-results" role="region" aria-live="polite" '+
    'aria-label="'+(overflow?count:results.length+' result'+(results.length===1?'':'s'))+'">';
  if(trimmed){
    out+='<div class="fd-searchpanel__summary"><p>'+count+'</p>';
    if(overflow){
      out+='<button type="button" class="fd-btn" data-fd-search-expand="" '+
        'aria-expanded="'+expanded+'" aria-controls="fd-search-results">'+
        (expanded?'Show top 8':'Show all matches')+'</button>';
    }
    out+='</div>';
  }
  /* Empty-state only replaces the results when the user actually typed something and it matched
     nothing -- an empty query always has defaults (see fdSearchResults), so there is nothing to
     apologise for on first open. Matches the prototype's own noResults = q.length>0 && !results. */
  if(trimmed&&!results.length){
    out+='<div class="fd-searchpanel__empty">Nothing for “'+fdEsc(trimmed)+'” '+
      '— try a symptom, scale, or drug class.</div>';
    out+='<div class="fd-searchpanel__recovery" role="group" aria-label="Search recovery">'+
      '<button type="button" class="fd-btn fd-btn--primary" data-fd-search="">Edit search</button>';
    if(!(state&&state.appMode===true))out+='<button type="button" class="fd-btn fd-btn--ghost" data-fd-tab="library">Browse the Library</button>';
    if(!(state&&state.facultyPreview===true))out+='<button type="button" class="fd-btn fd-btn--ghost" data-capture-open="" aria-haspopup="dialog" aria-expanded="false">Save a question for supervision</button>';
    out+='</div>';
  } else {
    if(/\bcalculator\b/i.test(q)&&!results.some(function(r){
      return /\bcalculator\b/i.test(fdSearchHaystack(r.item));
    })) out+='<p class="fd-searchpanel__empty">No matching calculator found. Related teaching resources:</p>';
    out+=fdSearchGroupedRows(results,index);
  }
  out+='</div>';
  out+='<div class="fd-searchpanel__foot">Searches page and tool titles, summaries, related terms, and page text. Not here? <strong>＋ Ask a question</strong> saves it for supervision.</div>';
  out+='</div>';
  out+='</div>';
  return out;
}
