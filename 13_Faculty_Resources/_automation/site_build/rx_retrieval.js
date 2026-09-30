/* Pharmacy retrieval cards — the one definition of what an RX# card is, for any consumer.

   The deck itself (prompts + verbatim reveals) is DERIVED by
   13_Faculty_Resources/_automation/pharmacy/build_rx_deck.py from attested drug cards, so this
   file carries no clinical wording and nothing here needs faculty attestation. What it owns is
   the ID CONTRACT a learner's schedule is keyed on: RX#<drug>#<prompt>, stored in the shared
   cw_srs_v1 store (srs_store.js) beside QB#, FAM#, COMM#, REASON#. spa_index.html's srsBucket
   must learn the RX# prefix in the same PR that first ships a consumer.

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
