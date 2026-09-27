/* Shared released-card projection. Feed membership is the only eligibility authority;
   historical schedules are retained but cannot resurrect withdrawn/revised cards. */
function conceptCardsFromFeed(feed){
  if(!feed || feed.schemaVersion!==1 || !Array.isArray(feed.cards) || !feed.cards.length) throw Error('Concepts schema unavailable');
  var seen=Object.create(null);
  return feed.cards.map(function(c){
    if(!c || typeof c.id!=='string' || !/^CONCEPT#[A-Za-z0-9_:-]+@[1-9][0-9]*$/.test(c.id) || seen[c.id] ||
       !['q','reveal','page','source','topic'].every(function(k){return typeof c[k]==='string' && c[k].length>0 && c[k].length<20000;}) ||
       !/^[A-Za-z0-9_-]+\.md$/.test(c.page)) throw Error('Concepts card unavailable');
    if(c.evidence!==undefined && (!Array.isArray(c.evidence) || c.evidence.length>50 || !c.evidence.every(function(v){
      if(!v || typeof v.id!=='string' || !v.id || typeof v.url!=='string' || /\s/.test(v.url))return false;
      try{var u=new URL(v.url);return u.protocol==='https:' && !!u.hostname && !u.username && !u.password;}catch(_){return false;}
    })))throw Error('Concepts evidence unavailable');
    seen[c.id]=true;
    return {id:c.id,kind:'recall',deck:'CONCEPT',deckTitle:'Concept · '+c.topic,q:c.q,reveal:c.reveal,page:c.page,source:c.source,evidence:c.evidence||[]};
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
/* Ambiguous build metadata is an integrity failure even when both tags agree. */
function conceptDigestFromDocument(doc){
  var tags=doc.querySelectorAll('meta[name="cw-concept-digest"]');
  if(tags.length!==1 || !/^[a-f0-9]{64}$/.test(tags[0].content||'')) throw Error('Concepts build digest unavailable or ambiguous');
  return tags[0].content;
}
/* Explicit learner-triggered recovery. The worker does not clients.claim(), so
   activation of the replacement (not controllerchange alone) permits reload. */
function conceptRecoverWorker(serviceWorker,timeoutMs){
  if(!serviceWorker)return Promise.resolve();
  return new Promise(function(resolve,reject){
    var done=false,reg=null,worker=null;
    var timer=setTimeout(function(){finish(Error('Concepts recovery timed out. Check your connection and try again.'));},timeoutMs||10000);
    function finish(error){
      if(done)return;done=true;clearTimeout(timer);
      if(worker)worker.removeEventListener('statechange',stateChanged);
      if(reg)reg.removeEventListener('updatefound',inspect);
      serviceWorker.removeEventListener('controllerchange',stateChanged);
      if(error)reject(error);else resolve();
    }
    function stateChanged(){
      if(!worker||done)return;
      if(worker.state==='activated')return finish();
      if(worker.state==='redundant')return finish(Error('Concepts update failed. Try again when online.'));
      if(worker.state==='installed')worker.postMessage({type:'SKIP_WAITING'});
    }
    function inspect(){
      if(done)return;
      var next=reg.waiting||reg.installing;
      if(!next)return;
      if(worker!==next){if(worker)worker.removeEventListener('statechange',stateChanged);worker=next;worker.addEventListener('statechange',stateChanged);}
      stateChanged();
    }
    serviceWorker.addEventListener('controllerchange',stateChanged);
    Promise.resolve().then(function(){return serviceWorker.getRegistration();}).then(function(value){
      if(done)return;
      reg=value;if(!reg){finish();return;}
      reg.addEventListener('updatefound',inspect);
      return reg.update().then(function(){
        if(done)return;inspect();
        if(!worker)finish(Error('No updated Concepts cache is available. Check your connection and try again later.'));
      });
    }).catch(function(){finish(Error('Could not update Concepts. Check your connection and try again.'));});
  });
}

/* A stalled Concepts request must not hold the other Daily Review sources hostage.
   Reject independently of fetch settling: abort alone is not a completion guarantee. */
function conceptFetchBytes(timeoutMs){
  return new Promise(function(resolve,reject){
    var controller=new AbortController();
    var timer=setTimeout(function(){controller.abort();reject(Error('Concepts request timed out'));},timeoutMs||10000);
    Promise.resolve().then(function(){return fetch('/tools/concepts.json',{signal:controller.signal,cache:'no-cache'});})
      .then(function(response){if(!response.ok)throw Error('Concepts unavailable');return response.arrayBuffer();})
      .then(function(bytes){clearTimeout(timer);resolve(bytes);},function(error){clearTimeout(timer);reject(error);});
  });
}

/* Try this build first: a transient request failure needs no worker replacement.
   Stale bytes never enter the queue. An activated replacement requires reload so
   the page and feed acquire their new digest together. */
async function conceptRetry(digest,serviceWorker,timeoutMs){
  try{return await conceptVerifyBytes(await conceptFetchBytes(timeoutMs),digest);}
  catch(error){
    if(!serviceWorker)throw error;
    await conceptRecoverWorker(serviceWorker,timeoutMs);
    return null;
  }
}
function conceptCounts(cards,schedules,refs,filter,now){
  var counts={available:0,due:0,neu:0};
  (cards||[]).forEach(function(card){
    if(card.deck!=='CONCEPT')return;
    counts.available++;
    var schedule=(schedules||{})[card.id];
    if(schedule){if(schedule.due<=now)counts.due++;}
    else if(newConceptAllowed(card,refs,filter))counts.neu++;
  });
  return counts;
}
