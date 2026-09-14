import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';
import {isDeliveryIntensity} from './portrayal.mjs';
import {isRoomCue} from './room-cues.mjs';

export const hash = value => createHash('sha256').update(value).digest('hex');
export const problem = (status, code) => Object.assign(new Error(code), {status, code});
const bad = () => problem(400, 'preview_state_invalid');
const FAMILY_CASE_ID='family_morgan_maya_001';
const clinicianFirst=value=>value.openingMode==='clinician';
// Legacy encounters have a patient opening at index zero; a clinician-first
// family conversation begins directly with its first learner question.
export const learnerHistoryIndex=(state,turnId)=>(turnId-1)*2+(clinicianFirst(state)?0:1);
function validFamilyBids(value){
  const speakers=new Set();
  for(const entry of value.history){
    if(!entry||typeof entry!=='object'||!Object.hasOwn(entry,'familyBid'))continue;
    const bid=entry.familyBid;
    if(value.caseId!=='family_morgan_maya_001'||entry.who!=='pt'||!['morgan','maya'].includes(entry.speakerId)
      ||!bid||typeof bid!=='object'||Array.isArray(bid)||Object.keys(bid).sort().join(',')!=='playbackStatus,speakerId,text'
      ||!['morgan','maya'].includes(bid.speakerId)||bid.speakerId===entry.speakerId||bid.text!=='Could I add something?'
      ||!['pending','played','interrupted'].includes(bid.playbackStatus)||bid.playbackStatus==='played'&&entry.playbackStatus!=='played')return false;
    if(speakers.has(bid.speakerId))return false;
    speakers.add(bid.speakerId);
  }
  const tail=value.history.at(-1);
  return !tail?.familyBid||(value.segments.length===2&&value.segments[0]===tail.text&&value.segments[1]===' '+tail.familyBid.text);
}
export function createStateCodec({key, binding, now=Date.now,withDeliveryIntensity=false}) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(key) || Buffer.from(key,'base64url').length!==32 || !binding || typeof withDeliveryIntensity!=='boolean') throw problem(503,'preview_unavailable');
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
      ||(Object.hasOwn(value,'openingMode')&&(value.openingMode!=='clinician'||value.caseId!==FAMILY_CASE_ID))
      ||!Array.isArray(value.history)||value.history.length!==value.turn*2+(clinicianFirst(value)?0:1)
      ||!Array.isArray(value.segments)||value.segments.length<(clinicianFirst(value)&&value.turn===0?0:1)||value.segments.length>2
      ||(clinicianFirst(value)&&value.turn===0&&(value.segments.length!==0||value.completed!==0))
      ||!Number.isInteger(value.completed)||value.completed<0||value.completed>value.segments.length
      // The encounter's case, authoritative and authenticated. The codec binding
      // already separates cases; this makes that invariant explicit and testable.
      ||typeof value.caseId!=='string'||!value.caseId||value.caseId.length>64
      // Chosen once at Start. An old receipt without the field means standard;
      // an authenticated but invalid value is not silently repaired.
      ||(Object.hasOwn(value,'deliveryIntensity')&&!isDeliveryIntensity(value.deliveryIntensity))
      ||(Object.hasOwn(value,'roomCue')&&(!value.roomCue||Object.keys(value.roomCue).sort().join(',')!=='id,turn'||!isRoomCue(value.roomCue.id)||!Number.isInteger(value.roomCue.turn)||value.roomCue.turn<1||value.roomCue.turn>value.turn))
      // One alternative per encounter, carried in the sealed state so a reload
      // cannot restore it. Present means spent; any value but true is a forgery.
      ||(Object.hasOwn(value,'retried')&&value.retried!==true))throw bad();
    if(!validFamilyBids(value))throw bad();
    if(now()>=value.expires)throw problem(410,'preview_session_expired');
    // Full encounters opt in; Moment receipts retain their exact existing shape.
    return withDeliveryIntensity?{...value,deliveryIntensity:Object.hasOwn(value,'deliveryIntensity')?value.deliveryIntensity:'standard'}:value;
  }
  return {seal,open};
}

export function initialState(opening,now=Date.now,caseId,speakerId,deliveryIntensity,openingMode) {
  if(deliveryIntensity!==undefined&&!isDeliveryIntensity(deliveryIntensity))throw problem(400,'preview_input_invalid');
  if(openingMode!==undefined&&(openingMode!=='clinician'||caseId!==FAMILY_CASE_ID))throw problem(400,'preview_input_invalid');
  return {v:1,caseId,...(deliveryIntensity!==undefined?{deliveryIntensity}:{}),sid:randomBytes(16).toString('hex'),nonce:randomBytes(16).toString('hex'),expires:now()+1800000,turn:0,
    ...(openingMode?{openingMode}:{}),history:openingMode?[]:[{who:'pt',text:opening,playbackStatus:'pending',...(speakerId?{speakerId}:{})}],segments:openingMode?[]:[opening],completed:0};
}
export function nextHistory(state,{text,previousPlayback,previousCompletedSegments,targetRoleId}) {
  // The optional alternative is a single response, not a new interview branch.
  // Its turn number may be early in the original encounter, so turn>=10 alone
  // would permit extra paid questions through direct API requests.
  if(state.turn>=10||state.retried===true)throw problem(409,'preview_encounter_finished');
  if(typeof text!=='string'||!text.trim()||text.length>1200||/[\u0000-\u001f\u007f]/.test(text)
    ||!['played','interrupted'].includes(previousPlayback)||!Number.isInteger(previousCompletedSegments)||previousCompletedSegments<0||previousCompletedSegments>state.completed)throw problem(400,'preview_input_invalid');
  const history=finalizePlayback(state,{previousPlayback,previousCompletedSegments});
  history.push({who:'me',text:text.trim(),...(targetRoleId?{targetRoleId}:{})});
  return history;
}
export function finalizePlayback(state,{previousPlayback,previousCompletedSegments}) {
  if(!['played','interrupted'].includes(previousPlayback)||!Number.isInteger(previousCompletedSegments)||previousCompletedSegments<0||previousCompletedSegments>state.completed)throw problem(400,'preview_input_invalid');
  const history=structuredClone(state.history), previous=history.at(-1);
  if(clinicianFirst(state)&&state.turn===0&&history.length===0&&state.segments.length===0&&state.completed===0)return history;
  const heard=state.segments.slice(0,previousCompletedSegments);
  if(previous.familyBid){
    // A separate person's request is never folded into the primary speaker's
    // words. Issued audio and actually completed audio remain separate facts.
    previous.playbackStatus=heard.length?'played':'interrupted';
    previous.familyBid.playbackStatus=heard.length===2?'played':'interrupted';
    delete previous.omittedTail;
    return history;
  }
  if(heard.length){previous.text=heard.join('');previous.playbackStatus='played';if(heard.length<state.segments.length)previous.omittedTail=true;}
  else previous.playbackStatus='interrupted';
  return history;
}
export function issuedState(previous,history,reply,segments,speakerId) {
  return {...previous,nonce:randomBytes(16).toString('hex'),turn:previous.turn+1,history:[...history,{who:'pt',text:reply,playbackStatus:'pending',...(speakerId?{speakerId}:{})}],segments,completed:0};
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
  const history=structuredClone(state.history).slice(0,learnerHistoryIndex(state,turnId));
  const tail=history.at(-1);
  // The tail's own playback status decides whether it was heard. nextHistory only
  // rewrites an entry's TEXT to the heard prefix when at least one segment played;
  // a zero-heard reply keeps its full generated text and is marked interrupted.
  // Claiming completed:1 unconditionally would launder that unheard text into heard
  // history and hand it to the actor.
  const heard=tail?.playbackStatus==='played'?1:0;
  // A prior bid may be heard independently of its primary reply. Retain both
  // segments when replaying the history boundary; never mark an unheard bid heard.
  const segments=tail?(tail.familyBid?[tail.text,' '+tail.familyBid.text]:[tail.text]):[];
  const completed=tail?.familyBid?.playbackStatus==='played'?2:heard;
  const child={...state,sid,nonce:randomBytes(16).toString('hex'),turn:turnId-1,history,segments,completed};
  if(child.roomCue?.turn>turnId)delete child.roomCue;
  // DELETED, not set to undefined: codec.open uses Object.hasOwn, and a sealed
  // `undefined` would not survive the JSON round trip as an absent key.
  delete child.retried;
  return child;
}
