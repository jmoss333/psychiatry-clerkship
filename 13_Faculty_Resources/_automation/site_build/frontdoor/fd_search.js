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
   mentions suicide. Results are capped at 8 total, protocols included in that cap -- ported
   from the prototype's own [...protoMatches, ...pool].slice(0, 8), which means an over-full
   result set silently drops from the END of the list, not evenly. This module preserves that
   same "drop the tail" behaviour deliberately: what matters is that the protocol never gets
   pushed out (it is always concatenated first), not that every non-critical extra fits.

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

   ---- Sheet-vs-navigate signalling (task-8-brief.md's flagged divergence) ----
   Every other row in this codebase that carries data-fd-open="<ref>" NAVIGATES (fd_today.js's
   .fd-row__open/.fd-pick/.fd-quicktool, fd_library.js's .fd-collink, fd_reader.js's
   .fd-prevnext__btn/.fd-railnav__row). Search results must NOT: the overlay's own footer copy
   promises "opens as a side sheet -- whatever you're doing stays put", and Task 7's review
   already flagged that reusing data-fd-open unchanged gives the wiring layer no way to tell a
   search pick apart from a normal row. Two established conventions cover the two result kinds
   without inventing a new "open an item" attribute name:
     - protocol results reuse data-fd-safety="<ref>" UNCHANGED -- fd_today.js's fdKitCard already
       established this exact payload ("a kit ref opens that protocol's sheet directly"), so a
       protocol search hit is indistinguishable, on the wire, from clicking its safety-kit card.
     - item results keep data-fd-open="<ref>" (same attribute, same meaning: "this is the ref")
       and add a bare boolean modifier, data-fd-sheet, alongside it. The wiring layer's existing
       data-fd-open handler branches on whether that modifier is present on the SAME element
       before deciding sheet-vs-navigate, rather than a second attribute name carrying the ref a
       second time. Task 9 (fd_sheet.js) is the consumer of both signals.

   Copy rule: every string here ships to BOTH sites unrebranded -- audience-neutral, no
   MS3/clerkship/student/shelf/resident/UNE/MMC/Sanford. */

var FD_SEARCH_PINNED = ['mse.html', 'withdrawal.html', 'pg_interview.md'];

/* Per-word synonym expansion. The ORIGINAL word always survives in the output (appended before
   its expansion, never replacing it) so a literal match on the abbreviation itself still works
   -- an unknown word passes through untouched. Lowercased internally so the synonyms map (all
   lowercase keys) matches regardless of how the caller's query was cased; callers that need the
   user's original casing (e.g. for display) keep their own copy of the raw string rather than
   reading it back out of this function. */
function fdExpandQuery(q, synonyms){
  var syn=synonyms||{};
  var words=String(q||'').toLowerCase().split(/\s+/);
  var out=[];
  for(var i=0;i<words.length;i++){
    var w=words[i];
    if(!w) continue;
    out.push(syn[w]?(w+' '+syn[w]):w);
  }
  return out.join(' ');
}

/* hay is already lowercased by the caller. Matches on either the raw (unexpanded) query as a
   whole substring, or any single expanded word of length > 1 -- single-letter expanded words
   would match almost everything and are excluded, same guard the prototype uses. */
function fdSearchHits(hay, rawQuery, expandedWords){
  var h=hay||'';
  if(rawQuery&&h.indexOf(rawQuery)!==-1) return true;
  for(var i=0;i<expandedWords.length;i++){
    if(expandedWords[i].length>1&&h.indexOf(expandedWords[i])!==-1) return true;
  }
  return false;
}

function fdSearchHaystack(item){
  return (item.title+' '+item.ref+' '+item.summary).toLowerCase();
}

function fdSearchItemMeta(item){
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

function fdSearchResults(index, query, synonyms, state){
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

  var protoResults=[];
  for(var kk=0;kk<kit.length;kk++){
    var kitItem=kit[kk].item;
    if(fdSearchHits(fdSearchHaystack(kitItem), rawQuery, qw)){
      protoResults.push({ item: kitItem, kind:'protocol', meta:'safety · protocol' });
      seenRefs[kitItem.ref]=true;
    }
  }

  /* for..in order over byRef is insertion order in every engine this repo targets, but this file
     does not lean on that -- refs are sorted for a deterministic, engine-independent order,
     matching fd_data.js's own fdLibraryOnlyReads precedent. */
  var refs=[];
  for(var ref in idx.byRef){ refs.push(ref); }
  refs.sort(function(a,b){ return a<b?-1:(a>b?1:0); });

  var itemResults=[];
  for(var r=0;r<refs.length;r++){
    if(seenRefs[refs[r]]) continue;
    var it=idx.byRef[refs[r]];
    if(fdSearchHits(fdSearchHaystack(it), rawQuery, qw)){
      itemResults.push({ item: it, kind:'item', meta: fdSearchItemMeta(it) });
    }
  }

  return protoResults.concat(itemResults).slice(0,8);
}

/* See the header note "Sheet-vs-navigate signalling" -- protocol rows carry data-fd-safety
   (the established kit-card payload), item rows carry data-fd-open plus the bare data-fd-sheet
   modifier so the SAME attribute keeps meaning "this is the ref" everywhere in the codebase. */
function fdSearchResultRow(r){
  var it=r.item;
  var isProto=(r.kind==='protocol');
  var dotCls='fd-result__dot';
  if(isProto) dotCls+=' is-safety';
  else if(it.kind==='tool') dotCls+=' is-tool';
  var openAttrs=isProto
    ?(' data-fd-safety="'+fdEsc(it.ref)+'"')
    :(' data-fd-open="'+fdEsc(it.ref)+'" data-fd-sheet');
  return '<button type="button" class="fd-result"'+openAttrs+'>'+
    '<span class="'+dotCls+'"></span>'+
    '<span class="fd-result__title">'+fdEsc(it.title)+'</span>'+
    '<span class="fd-result__meta">'+fdEsc(r.meta)+'</span>'+
  '</button>';
}

function fdSearchOverlay(index, query, synonyms, state){
  var q=String(query||'');
  var trimmed=q.trim();
  var results=fdSearchResults(index, q, synonyms, state);

  var out='<div class="fd-search" role="dialog" aria-modal="true" aria-label="Search">';
  out+='<div class="fd-searchpanel">';
  out+='<div class="fd-searchpanel__head">';
  out+='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" '+
    'stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle>'+
    '<path d="M21 21l-4-4"></path></svg>';
  out+='<input type="text" class="fd-searchpanel__input" value="'+fdEsc(q)+'" '+
    'placeholder="Symptom, drug, tool, or task…">';
  out+='<button type="button" class="fd-searchpanel__esc" data-fd-close-search aria-label="Close search">esc</button>';
  out+='</div>';
  out+='<div class="fd-searchpanel__body">';
  /* Empty-state only replaces the results when the user actually typed something and it matched
     nothing -- an empty query always has defaults (see fdSearchResults), so there is nothing to
     apologise for on first open. Matches the prototype's own noResults = q.length>0 && !results. */
  if(trimmed&&!results.length){
    out+='<div class="fd-searchpanel__empty">Nothing for “'+fdEsc(trimmed)+'” '+
      '— try a symptom, scale, or drug class.</div>';
  } else {
    for(var i=0;i<results.length;i++){ out+=fdSearchResultRow(results[i]); }
  }
  out+='</div>';
  out+='<div class="fd-searchpanel__foot">↵ opens as a side sheet — whatever you\'re '+
    'doing stays put.</div>';
  out+='</div>';
  out+='</div>';
  return out;
}
