/* Shared released-card projection. Feed membership is the only eligibility authority;
   historical schedules are retained but cannot resurrect withdrawn/revised cards. */
function conceptCardsFromFeed(feed){
  if(!feed || feed.schemaVersion!==1 || !Array.isArray(feed.cards) || !feed.cards.length) throw Error('Concepts schema unavailable');
  var seen=Object.create(null);
  return feed.cards.map(function(c){
    if(!c || typeof c.id!=='string' || !/^CONCEPT#[A-Za-z0-9_:-]+@[1-9][0-9]*$/.test(c.id) || seen[c.id] ||
       !['q','reveal','page','source','topic'].every(function(k){return typeof c[k]==='string' && c[k].length>0 && c[k].length<20000;}) ||
       !/^[A-Za-z0-9_-]+\.md$/.test(c.page)) throw Error('Concepts card unavailable');
    seen[c.id]=true;
    return {id:c.id,kind:'recall',deck:'CONCEPT',deckTitle:'Concept · '+c.topic,q:c.q,reveal:c.reveal,page:c.page,source:c.source};
  });
}
function conceptIdEligible(id,cards){return Array.isArray(cards) && cards.some(function(c){return c.id===id;});}
function newConceptAllowed(card,activeWeekRefs,filter){return !card || (card.id&&!/^CONCEPT#/.test(card.id)) || filter!=='week' || (Array.isArray(activeWeekRefs)&&activeWeekRefs.indexOf(card.page)!==-1);}
async function conceptVerifyBytes(bytes,digest){
  if(!/^[a-f0-9]{64}$/.test(digest||'')) throw Error('Concepts build digest unavailable');
  var hash=await crypto.subtle.digest('SHA-256',bytes);
  var actual=Array.from(new Uint8Array(hash)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
  if(actual!==digest) throw Error('Concepts feed does not match this build');
  return conceptCardsFromFeed(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
}
function conceptWeekReply(data,nonce){
  if(!data || data.type!=='cw:concept-week-context' || data.nonce!==nonce || !/^[a-f0-9]{32}$/.test(nonce) ||
     !Number.isInteger(data.week) || data.week<1 || data.week>6 || !Array.isArray(data.refs) || data.refs.length>500 ||
     !data.refs.every(function(ref){return typeof ref==='string' && /^[A-Za-z0-9_-]+\.(md|html)$/.test(ref);})) return null;
  return data.refs.slice();
}
