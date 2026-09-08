import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';

export const hash = value => createHash('sha256').update(value).digest('hex');
export const problem = (status, code) => Object.assign(new Error(code), {status, code});
const bad = () => problem(400, 'preview_state_invalid');
export function createStateCodec({key, binding, now=Date.now}) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(key) || Buffer.from(key,'base64url').length!==32 || !binding) throw problem(503,'preview_unavailable');
  const bytes=Buffer.from(key,'base64url'), aad=Buffer.from(binding);
  function seal(value) {
    const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',bytes,iv);
    cipher.setAAD(aad);
    const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
  }
  function open(token) {
    if(typeof token!=='string'||token.length<40||token.length>120000||!/^[A-Za-z0-9_-]+$/.test(token))throw bad();
    let value;
    try {
      const data=Buffer.from(token,'base64url'), cipher=createDecipheriv('aes-256-gcm',bytes,data.subarray(0,12));
      cipher.setAAD(aad);cipher.setAuthTag(data.subarray(12,28));
      value=JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8'));
    }catch{throw bad();}
    if(!value||value.v!==1||typeof value.sid!=='string'||!/^[a-f0-9]{32}$/.test(value.sid)||typeof value.nonce!=='string'||!/^[a-f0-9]{32}$/.test(value.nonce)
      ||!Number.isSafeInteger(value.expires)||!Number.isInteger(value.turn)||value.turn<0||value.turn>10
      ||!Array.isArray(value.history)||value.history.length!==value.turn*2+1||!Array.isArray(value.segments)||value.segments.length<1||value.segments.length>2
      ||!Number.isInteger(value.completed)||value.completed<0||value.completed>value.segments.length
      // The encounter's case, authoritative and authenticated. The codec binding
      // already separates cases; this makes that invariant explicit and testable.
      ||typeof value.caseId!=='string'||!value.caseId||value.caseId.length>64
      // One alternative per encounter, carried in the sealed state so a reload
      // cannot restore it. Present means spent; any value but true is a forgery.
      ||(Object.hasOwn(value,'retried')&&value.retried!==true))throw bad();
    if(now()>=value.expires)throw problem(410,'preview_session_expired');
    return value;
  }
  return {seal,open};
}

export function initialState(opening,now=Date.now,caseId) {
  return {v:1,caseId,sid:randomBytes(16).toString('hex'),nonce:randomBytes(16).toString('hex'),expires:now()+1800000,turn:0,
    history:[{who:'pt',text:opening,playbackStatus:'pending'}],segments:[opening],completed:0};
}
export function nextHistory(state,{text,previousPlayback,previousCompletedSegments}) {
  // The optional alternative is a single response, not a new interview branch.
  // Its turn number may be early in the original encounter, so turn>=10 alone
  // would permit extra paid questions through direct API requests.
  if(state.turn>=10||state.retried===true)throw problem(409,'preview_encounter_finished');
  if(typeof text!=='string'||!text.trim()||text.length>1200||/[\u0000-\u001f\u007f]/.test(text)
    ||!['played','interrupted'].includes(previousPlayback)||!Number.isInteger(previousCompletedSegments)||previousCompletedSegments<0||previousCompletedSegments>state.completed)throw problem(400,'preview_input_invalid');
  const history=structuredClone(state.history), previous=history.at(-1);
  const heard=state.segments.slice(0,previousCompletedSegments);
  if(heard.length){previous.text=heard.join('');previous.playbackStatus='played';if(heard.length<state.segments.length)previous.omittedTail=true;}
  else previous.playbackStatus='interrupted';
  history.push({who:'me',text:text.trim()});
  return history;
}
export function issuedState(previous,history,reply,segments) {
  return {...previous,nonce:randomBytes(16).toString('hex'),turn:previous.turn+1,history:[...history,{who:'pt',text:reply,playbackStatus:'pending'}],segments,completed:0};
}
// A retry is a child session, not a replayed receipt: re-presenting an earlier
// receipt is what the budget ledger refuses, and that refusal is a control worth
// keeping. The parent's own history already records what was HEARD rather than
// what was generated — nextHistory rewrites each patient entry to its completed
// segments and marks omittedTail — so truncating it is exactly "only the
// information heard at that moment", with nothing extra to track.
export function retryState(state,turnId,sid) {
  if(state.retried===true)throw problem(409,'preview_encounter_finished');
  if(!Number.isInteger(turnId)||turnId<1||turnId>state.turn)throw problem(400,'preview_input_invalid');
  const history=structuredClone(state.history).slice(0,turnId*2-1);
  const tail=history.at(-1);
  // The tail's own playback status decides whether it was heard. nextHistory only
  // rewrites an entry's TEXT to the heard prefix when at least one segment played;
  // a zero-heard reply keeps its full generated text and is marked interrupted.
  // Claiming completed:1 unconditionally would launder that unheard text into heard
  // history and hand it to the actor.
  const heard=tail.playbackStatus==='played'?1:0;
  const child={...state,sid,nonce:randomBytes(16).toString('hex'),turn:turnId-1,history,segments:[tail.text],completed:heard};
  // DELETED, not set to undefined: codec.open uses Object.hasOwn, and a sealed
  // `undefined` would not survive the JSON round trip as an absent key.
  delete child.retried;
  return child;
}
