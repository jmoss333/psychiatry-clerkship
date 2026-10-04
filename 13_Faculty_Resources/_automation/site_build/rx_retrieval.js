/* Pharmacy retrieval cards — the one definition of what an RX# card is, for any consumer.

   The deck itself (prompts + verbatim reveals) is DERIVED by
   13_Faculty_Resources/_automation/pharmacy/build_rx_deck.py from attested drug cards, so this
   file carries no clinical wording and nothing here needs faculty attestation. What it owns is
   the ID CONTRACT a learner's schedule is keyed on: RX#<drug>#<prompt>, stored in the shared
   cw_srs_v1 store (srs_store.js) beside QB#, FAM#, COMM#, REASON#. spa_index.html's srsBucket
   reads the RX# prefix as the 'rx' bucket (tests/srs-home-counters.test.mjs).

   Pure: no DOM, no storage, no clock (callers pass `now`), no escaping. ES5 only, matching the
   other injected snippets. */
var RX_PREFIX='RX#';

function rxCardId(drugId,promptId){return RX_PREFIX+drugId+'#'+promptId;}

function rxIsCard(id){return typeof id==='string'&&id.indexOf(RX_PREFIX)===0&&id.split('#').length===3;}

/* The deck's cards for one drug, in deck order. Unknown drug -> []. */
function rxCardsFor(deck,drugId){
  var out=[],cards=(deck&&deck.cards)||[];
  for(var i=0;i<cards.length;i++){if(cards[i].drug===drugId)out.push(cards[i]);}
  return out;
}

/* What is due now, oldest-due first, then up to `newLimit` never-seen cards in deck order.
   A store card whose id is no longer in the deck (a card withdrawn at review) is ignored,
   never resurrected: the deck, not the store, decides what exists. */
function rxDue(deck,store,now,newLimit){
  var cards=(deck&&deck.cards)||[],sched=(store&&store.cards)||{},due=[],fresh=[];
  for(var i=0;i<cards.length;i++){
    var c=cards[i],s=sched[c.id];
    if(s){if(s.due<=now)due.push({card:c,due:s.due});}
    else fresh.push(c);
  }
  due.sort(function(a,b){return a.due-b.due||(a.card.id<b.card.id?-1:1);});
  var out=[];
  for(var j=0;j<due.length;j++)out.push(due[j].card);
  var lim=typeof newLimit==='number'?newLimit:fresh.length;
  for(var k=0;k<fresh.length&&k<lim;k++)out.push(fresh[k]);
  return out;
}

/* ---- consumers of pharmacy_public.json (pharmacy.html, review.html) ----
   The build is the gate: build_pharmacy_public.py admits a drug only while its faculty review
   hash matches its text, and it ships nothing else. These helpers are the second line: a page
   renders a drug only if it carries a review stamp, and a card only if its drug is rendered.
   A file that fails the shape check is refused whole, never partly rendered. */

function rxReviewStamped(agent){
  var r=agent&&agent.review;
  return !!(agent&&typeof agent.id==='string'&&agent.id&&r&&typeof r.reviewer==='string'&&r.reviewer&&
    typeof r.lastReviewed==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.lastReviewed));
}

/* Throws unless the feed is whole and every item in it is admissible. Returns the feed. */
function rxVerifiedPublic(data){
  if(!data||data.schemaVersion!==1||Object.prototype.toString.call(data.agents)!=='[object Array]'||
     Object.prototype.toString.call(data.cards)!=='[object Array]')throw Error('pharmacy feed incomplete');
  var shown={},i;
  for(i=0;i<data.agents.length;i++){
    if(!rxReviewStamped(data.agents[i]))throw Error('pharmacy drug without a faculty review');
    shown[data.agents[i].id]=true;
  }
  for(i=0;i<data.cards.length;i++){
    var c=data.cards[i];
    if(!c||!rxIsCard(c.id)||!shown[c.drug]||c.id.split('#')[1]!==c.drug||typeof c.prompt!=='string'||
       Object.prototype.toString.call(c.reveal)!=='[object Array]'||!c.reveal.length)
      throw Error('pharmacy card incomplete or not backed by a reviewed drug');
  }
  return data;
}

/* A card's reveal as plain lines, label first: ["Boxed warning: ...", ...]. */
function rxRevealLines(card){
  var out=[],blocks=(card&&card.reveal)||[];
  for(var i=0;i<blocks.length;i++){
    var b=blocks[i]||{},lines=b.lines||[];
    for(var j=0;j<lines.length;j++)out.push((b.label?b.label+': ':'')+lines[j]);
  }
  return out;
}

/* Daily Review's view of the deck. seededOnly: Review serves an RX# card only after the learner
   has met it on the pharmacy page (the FAM# rule), so this never springs a drug on anyone cold. */
function rxRecallCards(data){
  var out=[],cards=(data&&data.cards)||[],names={},agents=(data&&data.agents)||[],i;
  for(i=0;i<agents.length;i++)if(rxReviewStamped(agents[i]))names[agents[i].id]=agents[i].generic||agents[i].id;
  for(i=0;i<cards.length;i++){
    var c=cards[i];
    if(!c||!rxIsCard(c.id)||!names[c.drug])continue;
    var lines=rxRevealLines(c); if(!lines.length)continue;
    out.push({id:c.id,deck:'RX',deckTitle:'Pharmacy · '+names[c.drug],kind:'recall',seededOnly:true,
      q:c.prompt,reveal:lines,page:null});
  }
  return out;
}
