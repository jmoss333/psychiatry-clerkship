/* Side sheet -- the safety kit list, a single protocol view, an item preview, and the nudge toast
   raised after a protocol closes. See CLASS-INVENTORY.md section 8 and the prototype's side-sheet
   section (Front-Door-Hi-Fi-v2.dc.html, search "══", line 384).

   Injected via /*__FD_SHEET__*\/ once a later plan registers the marker (see SNIPPET_MARKERS in
   common.py) -- this task does not register it or touch that file. ES5 only: var/function, no
   arrow functions or template literals -- matches the other frontdoor/ modules.

   Pure: fdSheet(index, topicMeta, state) -> string and fdNudge(item) -> string. No DOM, no browser
   storage, no clock access. Protocol state also carries the shell's build-injected `crisisHtml`
   and an owner-approved `protocolFailureCopy`; `done` is accepted (the interface brief's shape)
   but never read here -- whether a protocol's page is unread is what decides if the CALLER raises
   fdNudge at all, not anything this renderer draws. This module is a pure renderer of
   already-resolved state: it draws whichever surface state.sheet names and does no event
   handling. The data-fd-* attributes it emits are read by the wiring layer, not by anything here.

   *** The single rule this file exists to keep: protocol content comes only from topic_meta. ***
   Steps render from topicMeta[ref].safetySteps and the Document callout from
   topicMeta[ref].safetyDoc. Not one clinical string is a literal in this file, and none may ever
   be added. Those fields carry the repo's high-safety governance bundle and faculty attestation
   (design spec §4); a copy pasted in here would be unreviewed clinical text on the one surface
   whose entire purpose is being correct under time pressure. tests/fd-sheet.test.mjs pins this
   twice: no real step or doc line may appear as a substring of this file, and a list of
   distinctive clinical tokens is banned from it outright, comments included.

   The prototype's own PROTOCOLS object is SUPERSEDED and must not be copied from (handoff
   README, "What is NOT normative"): it is an earlier draft of this content, and its withdrawal
   protocol was attached to the wrong page. curriculum.json's safetyKit names the five refs and
   their subtitles; topic_meta.json owns everything else.

   *** The attested affordance must never over-claim. *** item.attested is fd_data.js's projection
   of facultyReview.status === 'reviewed', and it gates BOTH attested affordances:
     - protocol view: the teal .fd-sheet__attribution line ("✓ From: … · faculty-attested").
     - item preview: the .fd-attested pill.
   Neither has a "probably reviewed" middle state. Where a structurally valid 3–5-step protocol is
   not attested this file still shows its provenance -- the same ref, in the explicit
   .fd-sheet__pending state -- because naming the source is a true statement, while the teal ✓
   treatment reads as an endorsement and would be a false one. Missing, malformed, or wrong-length
   protocol data renders neither state; it takes the owner-controlled failure path instead. A pill
   asserting a review that did not happen is worse than no pill.

   ---- Attributes: reused conventions, one addition -------------------------------------------
     - data-fd-safety (bare)     -- open the kit. fd_shell.js's .fd-safetybtn already means exactly
                                    this, so the "‹ kit" back button reuses it rather than naming a
                                    second back action; data-fd-back means "leave the reader for
                                    its originating tab" and is a different thing.
     - data-fd-safety="<ref>"    -- open that protocol. fd_today.js's .fd-kitcard payload, reused
                                    verbatim for the kit rows.
     - data-fd-open="<ref>"      -- navigate to the page. Both "Open the full page →" buttons and
                                    the nudge's "Read it".
     - data-fd-close-sheet       -- close. On the backdrop and the ✕, matching fd_search.js's
                                    data-fd-close-search naming.
     - data-fd-close-nudge       -- dismiss the toast, same naming family.
     - data-fd-step="<index>"    -- the one new action. Toggling a step check is genuinely distinct
                                    from data-fd-toggle (which marks an ITEM done, keyed by ref and
                                    persisted): step checks are keyed by position within one
                                    protocol, are session-only, and reset every time the sheet
                                    opens. Overloading data-fd-toggle with a bare index risks a
                                    numeric key colliding with the persisted progress map.

   ---- Two borrowed classes, flagged for review ------------------------------------------------
   frontdoor.css is frozen for this plan, so nothing here invents a class. Two spots in the item
   preview need small dim label text that CLASS-INVENTORY's section-8 outline does not name a class
   for -- the meta line ("4 min · Week 1") and the "Source:" label. Both reuse .fd-row__min, whose
   rule is unscoped and whose Shared-Components entry is that exact treatment ("12 min", 12px dim).
   The alternative was inventing .fd-sheet__meta, which the freeze forbids. Flagged rather than
   passed over in silence: if the reviewer would rather have a dedicated class, it is a one-line
   rule plus a rename here.

   Two other prototype details are deliberately dropped, both for the same reason: the kit row's
   trailing "›" chevron and the sheet head's close-button hover wash exist in the prototype only as
   raw-hex inline colour, which markup here may not carry, and neither has a class. The kit rows
   already read as tappable from .fd-kitrow's border and hover rule.

   Copy rule: every string here ships to BOTH sites unrebranded -- audience-neutral, no
   MS3/clerkship/student/shelf/resident/UNE/MMC/Sanford. */

var FD_SHEET_ITEM_PREFIX='item:';

/* The kit entry ({item, sub}) for a ref, or null when the ref names no protocol. Membership of
   index.kit -- curriculum.json's safetyKit, in order -- is what makes a ref a protocol; a page
   that merely happens to carry safetySteps is not one. */
function fdSheetKitEntry(index, ref){
  var kit=(index&&index.kit)||[];
  for(var i=0;i<kit.length;i++){
    if(kit[i].item.ref===ref) return kit[i];
  }
  return null;
}

/* Week number containing ref, or null for a library-only page. The prototype read this off its
   items' own `w` field; this repo's items carry no week (curriculum.json owns that structure), so
   it is a lookup rather than a property read. */
function fdSheetWeekOf(index, ref){
  var weeks=(index&&index.weeks)||[];
  for(var w=0;w<weeks.length;w++){
    var items=weeks[w].items||[];
    for(var i=0;i<items.length;i++){
      if(items[i].ref===ref) return weeks[w].n;
    }
  }
  return null;
}

/* Same degradation fd_reader.js uses for a ref the index does not carry: a titled shell rather
   than a throw. renderHome()'s history in this repo is that one unguarded throw blanks the whole
   surface. */
function fdSheetMissingItem(ref){
  return {
    ref: ref||'', kind:'read', title: ref||'', minutes:null, summary:'',
    points:[], attested:false, toolRef:null, risk:null, href:'',
  };
}

function fdSheetHead(title, hasBack){
  var out='<div class="fd-sheet__head">';
  /* Bare data-fd-safety: "open the kit", the same payload-free form fd_shell.js's header button
     carries. Rendered only for a protocol reached FROM the kit -- the label names a specific place
     to return to, so a protocol opened from a kit card or a search hit shows nothing here. */
  if(hasBack) out+='<button type="button" class="fd-sheet__back" data-fd-safety>‹ kit</button>';
  out+='<span class="fd-sheet__title">'+fdEsc(title)+'</span>';
  out+='<button type="button" class="fd-sheet__close" data-fd-close-sheet '+
    'aria-label="Close side sheet" title="Close — you’ll land exactly where you were">✕</button>';
  out+='</div>';
  return out;
}

/* Kit rows are emitted as DIRECT siblings with no wrapper between them: frontdoor.css spaces them
   with `.fd-kitrow + .fd-kitrow{margin-top:9px}` (CLASS-INVENTORY's adjacent-sibling trap), where
   the prototype used a flex container with a gap. The leading .fd-sheet__intro paragraph is not a
   .fd-kitrow, so the first row correctly gets no top margin. */
function fdSheetKitBody(index){
  var kit=(index&&index.kit)||[];
  var out='<p class="fd-sheet__intro">For the moment on the unit. Each opens right here — '+
    'your page underneath doesn’t move.</p>';
  for(var i=0;i<kit.length;i++){
    var k=kit[i];
    out+='<button type="button" class="fd-kitrow" data-fd-safety="'+fdEsc(k.item.ref)+'">'+
      '<span class="fd-kitrow__dot"></span>'+
      /* Bare grouping span: flex:1;min-width:0 keeps a long title from overflowing the row. Same
         structural, non-colour inline style fd_today.js's .fd-kitcard uses for the same grouping;
         no class in frontdoor.css covers it. */
      '<span style="flex:1;min-width:0">'+
        '<span class="fd-kitrow__title">'+fdEsc(k.item.title)+'</span>'+
        '<span class="fd-kitrow__sub">'+fdEsc(k.sub)+'</span>'+
      '</span>'+
    '</button>';
  }
  return out;
}

/* The check is a <span>, not a <button>: .fd-step is itself the button and a nested button is
   invalid HTML (the prototype has the same shape). .fd-check's rule sets cursor/padding
   explicitly, so it needs no button element to look right, and the 20px size comes from the
   ancestor-keyed `.fd-step .fd-check` rule -- there is no size modifier class and none may be
   invented. is-just-done is not applied here: it is a transient "the user just clicked this" flag
   with no field in this renderer's state shape.

   ---- Why the glyph is aria-hidden and the state lives on the button --------------------------
   The ✓ glyph is emitted in BOTH states and .fd-check's CSS colours it (transparent vs filled),
   so a screenshot at any state still has the character to colour -- the same idiom fd_today.js's
   row check uses. Visually that is right; announced literally it is a lie, because a screen
   reader reads the character regardless of colour and an UNCHECKED step would be announced as
   "✓ <step text>". On an ordinary list that is untidy; on a safety checklist it inverts the
   meaning of the item, telling someone a step is complete when it is not. So the glyph carries
   aria-hidden="true" (it is decoration -- the colour, not the character, is what conveys state)
   and the real state moves to aria-pressed on the .fd-step button itself, which is the toggle.
   Keeping the character in the DOM preserves the visual exactly; hiding it from the a11y tree
   removes the false claim. */
function fdSheetStep(text, i, stepsDone){
  var on=!!(stepsDone||{})[i];
  var checkCls=on?'fd-check is-done':'fd-check';
  return '<button type="button" class="fd-step" data-fd-step="'+i+'" '+
    'aria-pressed="'+(on?'true':'false')+'">'+
    '<span class="'+checkCls+'" aria-hidden="true">✓</span>'+
    '<span class="fd-step__text">'+fdEsc(text)+'</span>'+
  '</button>';
}

/* Classify before rendering so reviewed, pending, and failed-load states are mutually exclusive.
   Runtime checks remain strict even though the build validator rejects malformed current kit
   data: an interrupted payload or stale browser artifact must fail closed too. */
function fdSheetProtocolData(entry, topicMeta){
  var item=entry.item;
  var meta=(topicMeta||{})[item.ref]||{};
  var sourceSteps=meta.safetySteps;
  var doc=(typeof meta.safetyDoc==='string')?meta.safetyDoc:'';
  if(!Array.isArray(sourceSteps)||sourceSteps.length<3||sourceSteps.length>5||!doc.trim()){
    return {kind:'missing'};
  }
  var steps=[];
  for(var i=0;i<sourceSteps.length;i++){
    if(typeof sourceSteps[i]!=='string'||!sourceSteps[i].trim())return {kind:'missing'};
    steps.push(sourceSteps[i]);
  }
  return {kind:item.attested===true?'reviewed':'pending',steps:steps,doc:doc};
}

function fdSheetProtocolFailure(copy, crisisHtml){
  if(typeof copy!=='string'||!copy.trim()){
    throw new Error('Owner-approved protocol failure copy is required');
  }
  return '<p class="fd-sheet__failure" role="alert">'+fdEsc(copy)+'</p>'+String(crisisHtml||'');
}

/* Every clinical value below is read from topicMeta[ref]; the crisis block is a trusted build
   artifact passed through the shell's inert template. Neither is defaulted to clinical text. */
function fdSheetProtocolBody(entry, topicMeta, stepsDone, crisisHtml, failureCopy){
  var item=entry.item;
  var protocol=fdSheetProtocolData(entry,topicMeta);
  if(protocol.kind==='missing')return fdSheetProtocolFailure(failureCopy,crisisHtml);
  var steps=protocol.steps;
  var out='';
  /* Wrapper carries only the 16px gap down to the callout (the prototype's own step container).
     The steps stay siblings of each other inside it, so the + rule above still applies. */
  out+='<div style="margin-bottom:16px">';
  for(var i=0;i<steps.length;i++){ out+=fdSheetStep(steps[i], i, stepsDone); }
  out+='</div>';
  out+='<div class="fd-doccallout"><b>Document:</b> '+fdEsc(protocol.doc)+'</div>';
  if(protocol.kind==='reviewed'){
    out+='<div class="fd-sheet__attribution">✓ From: '+fdEsc(item.ref)+' · faculty-attested</div>';
  } else {
    out+='<p class="fd-sheet__pending">Not yet faculty-reviewed · From: '+fdEsc(item.ref)+'</p>';
  }
  out+='<button type="button" class="fd-btn fd-btn--ghost" style="margin-top:16px" '+
    'data-fd-open="'+fdEsc(item.ref)+'">Open the full page →</button>';
  out+=String(crisisHtml||'');
  return out;
}

function fdSheetItemBody(item, index){
  var isTool=(item.kind==='tool');
  var typeCls=isTool?'fd-chip is-tool':'fd-chip';
  var typeLabel=isTool?'tool':'read';
  var metaText=isTool?'self-paced':((typeof item.minutes==='number')?(item.minutes+' min'):'');
  var wk=fdSheetWeekOf(index, item.ref);
  if(wk!==null) metaText=metaText?(metaText+' · Week '+wk):('Week '+wk);

  /* Bare grouping divs (structural inline styles only, no colour) for the chip row and the source
     row -- CLASS-INVENTORY's section-8 outline names the chips and the .fd-src chip but no
     container for either, same as fd_shell.js's grouping spans. */
  var out='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px">';
  out+='<span class="'+typeCls+'">'+typeLabel+'</span>';
  if(metaText) out+='<span class="fd-row__min">'+fdEsc(metaText)+'</span>';
  if(item.attested) out+='<span class="fd-attested">✓ faculty-attested</span>';
  out+='</div>';
  out+='<p class="fd-sheet__lead">'+fdEsc(item.summary)+'</p>';
  /* font-weight:600 on the label matches the prototype, which .fd-row__min does not carry. Inline
     rather than a new class: the freeze bars inventing classes and emitting colour, not weight. */
  out+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:18px">'+
    '<span class="fd-row__min" style="font-weight:600">Source:</span>'+
    '<span class="fd-src">'+fdEsc(item.ref)+'</span>'+
  '</div>';
  out+='<button type="button" class="fd-btn fd-btn--primary" data-fd-open="'+fdEsc(item.ref)+'">'+
    'Open the full page →</button>';
  out+='<p class="fd-sheet__note">Or ✕ to close — you’ll land exactly where you were.</p>';
  return out;
}

/* state.sheet is 'kit', a kit ref, or 'item:<ref>'. Anything else -- absent, null, or a ref that
   names no protocol -- renders the empty string, so a caller can concatenate the result
   unconditionally and a stale sheet key degrades to "no sheet" rather than to an empty protocol
   shell with a title and no content. */
function fdSheet(index, topicMeta, state){
  var idx=index||{byRef:{}, weeks:[], columns:[], kit:[]};
  var st=state||{};
  var sheet=st.sheet;
  if(!sheet) return '';

  var title='', body='', hasBack=false;
  if(sheet==='kit'){
    title='Safety kit';
    body=fdSheetKitBody(idx);
  } else if(String(sheet).indexOf(FD_SHEET_ITEM_PREFIX)===0){
    var iref=String(sheet).slice(FD_SHEET_ITEM_PREFIX.length);
    var item=(idx.byRef||{})[iref]||fdSheetMissingItem(iref);
    title=item.title;
    body=fdSheetItemBody(item, idx);
  } else {
    var entry=fdSheetKitEntry(idx, sheet);
    if(!entry) return '';
    title=entry.item.title;
    hasBack=(st.sheetFrom==='kit');
    body=fdSheetProtocolBody(
      entry, topicMeta, st.stepsDone, st.crisisHtml, st.protocolFailureCopy
    );
  }

  /* Two elements, not one: .fd-sheetbackdrop is a separate sibling emitted BEFORE the panel and
     carries the click-to-close. Only the search overlay merges scrim and layout into one element
     (CLASS-INVENTORY's ⚠ trap -- do not mirror one pattern onto the other). */
  return '<div class="fd-sheetbackdrop" data-fd-close-sheet></div>'+
    '<aside class="fd-sheet" role="dialog" aria-modal="true" aria-label="'+fdEsc(title)+'">'+
      fdSheetHead(title, hasBack)+
      '<div class="fd-sheet__body">'+body+'</div>'+
    '</aside>';
}

/* The toast raised when a protocol closes over a page the reader has not read yet -- whether to
   raise it at all is the caller's decision (it owns the done map and the 8s timer); this renders
   one for whichever item it is handed. The minute clause is omitted rather than guessed when the
   page carries no read time. */
function fdNudge(item){
  if(!item||!item.ref) return '';
  var mins=(typeof item.minutes==='number')?(' — '+item.minutes+' min'):'';
  return '<div class="fd-nudge">'+
    '<span class="fd-nudge__text">“'+fdEsc(item.title)+'” is the full read'+mins+'.</span>'+
    '<button type="button" class="fd-nudge__go" data-fd-open="'+fdEsc(item.ref)+'">Read it</button>'+
    '<button type="button" class="fd-nudge__dismiss" data-fd-close-nudge aria-label="Dismiss alert">✕</button>'+
  '</div>';
}
