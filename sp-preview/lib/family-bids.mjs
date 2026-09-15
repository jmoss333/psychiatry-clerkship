import {familyCase} from '../../_prototypes/sp-interview/family-visit-case.mjs';

export const FAMILY_BID_TEXT='Could I add something?';
const ROLES=Object.freeze(Object.keys(familyCase.participants));
const STATUSES=Object.freeze(['pending','played','interrupted']);
const bad=()=>Object.assign(new Error('preview_state_invalid'),{status:400,code:'preview_state_invalid'});
const role=value=>ROLES.includes(value);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));

// A conservative turn-taking cue, not a classifier of clinical risk, emotion,
// insight, rapport, or learner performance. Patient-generated text does not earn
// a bid or become a source of facts. The request itself contains no case facts.
const SHARED_TOPIC=/\b(?:support|help|care|caring|relationship|family|daughter|parent|boundar(?:y|ies)|limits?|choices?|perspective|calls?|breakfast|plans?|planning|next steps?|meeting|hoping|hope|matters?|important)\b/i;
const HOLD_FLOOR=/\b(?:suicid\w*|self[- ]?harm|kill\w*|die|dying|dead|death|overdos\w*|weapons?|guns?|violence|abus\w*|assault\w*|withdrawal|seizures?|emergency|urgent|pain|safe|safety|privat\w*|alone|confidential\w*|wait|overwhelm\w*|cry\w*|terrified|panic\w*|afraid|hopeless\w*|grief|griev\w*|bereav\w*)\b|\b(?:hurt(?:ing)? (?:yourself|myself|themselves|someone|somebody)|just (?:you|us)|without (?:maya|morgan)|leave the room|hold on|not (?:yet|now)|one at a time|let .{0,30} finish)\b/i;

function checkedHistory(history){
 if(!Array.isArray(history)||history.length<1||history.length>21)throw bad();
 for(const [index,entry] of history.entries()){
  const patient=index%2===0;
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||entry.who!==(patient?'pt':'me')
   ||typeof entry.text!=='string'||!entry.text.trim()||entry.text.length>1200
   ||!role(patient?entry.speakerId:entry.targetRoleId)
   ||patient&&!STATUSES.includes(entry.playbackStatus))throw bad();
  if(Object.hasOwn(entry,'familyBid')){
   const bid=entry.familyBid;
   if(!patient||!exact(bid,['speakerId','text','playbackStatus'])||!role(bid.speakerId)||bid.speakerId===entry.speakerId
    ||bid.text!==FAMILY_BID_TEXT||!STATUSES.includes(bid.playbackStatus))throw bad();
  }
 }
 return history;
}

// Call only for ordinary family turns after finalizing the previous playback.
// Start and the one alternative do not schedule bids. The caller must preserve
// authenticated bid metadata even when interrupted, so a failed/declined offer
// cannot purchase another one. Spoken bid text stays separate from main text.
export function recommendFamilyBid(history,targetRoleId){
 checkedHistory(history);
 if(!role(targetRoleId))throw bad();
 const latest=history.at(-1);
 if(latest.who!=='me')return null;
 if(latest.targetRoleId!==targetRoleId)throw bad();
 const turn=history.filter(entry=>entry.who==='me').length;
 if(turn<2||turn>8)return null;
 const previousQuestion=history.at(-3);
 if(previousQuestion?.who!=='me'||previousQuestion.targetRoleId!==targetRoleId)return null;
 if(!SHARED_TOPIC.test(latest.text)||HOLD_FLOOR.test(latest.text))return null;
 const speakerId=ROLES.find(id=>id!==targetRoleId);
 const offers=history.flatMap((entry,index)=>entry.familyBid?[{speakerId:entry.familyBid.speakerId,turn:index/2}]:[]);
 if(offers.length>=2||offers.some(offer=>offer.speakerId===speakerId))return null;
 if(offers.length&&turn-offers.at(-1).turn<2)return null;
 return Object.freeze({speakerId,text:FAMILY_BID_TEXT});
}

// Only a completed bid at the current edge of the heard conversation is a
// request the learner can accept. Never search backward and revive an old bid.
export function pendingFamilyBid(history){
 checkedHistory(history);
 const latest=history.at(-1);
 if(latest.who!=='pt'||latest.playbackStatus!=='played'||latest.familyBid?.playbackStatus!=='played')return null;
 return Object.freeze({speakerId:latest.familyBid.speakerId,text:FAMILY_BID_TEXT});
}
