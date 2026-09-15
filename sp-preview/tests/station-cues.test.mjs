import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

// Faculty-authored observation cues are the only learner-visible text in the room that
// describes the patient rather than quoting them. This guard exists because placeholder
// text shipped once under an "Authored note" label (Morgan, family case; Slice C brief,
// 2026-09-14). Every rule here is from AGENTS.md / the Interview Room spec: observable,
// not interpretive; third person; nothing invented; never filler.

const source=fs.readFileSync(new URL('../public/station-content.js',import.meta.url),'utf8');
const contentModule={exports:{}};
vm.runInThisContext('(function(module,exports){'+source+'\n})',{filename:'station-content.js'})(contentModule,contentModule.exports);
const {getProfile}=contentModule.exports;

// Enumerate from the source, not a hand-kept list: a new case cannot skip this guard.
const REGISTERED=[...new Set([...source.matchAll(/caseId:'([a-z0-9_]+)'/g)].map(m=>m[1]))];
assert.ok(REGISTERED.length>=5,'expected the five shipped cases at minimum');

const REQUIRED=['opening','interrupted','repair','closing'];
const OPTIONAL=['turn5','turn8'];            // absent ⇒ the room renders nothing; present ⇒ a real sentence
const ALLOWED=new Set([...REQUIRED,...OPTIONAL]);

// The eight strings that shipped as filler. Kept verbatim so their return is a named failure.
const SHIPPED_PLACEHOLDERS=new Set([
  'Morgan is in the conversation.','The reply was interrupted.','The conversation can continue.','The conversation has ended.',
  'Morgan and Maya are both in the shared meeting.',
  'The current reply was interrupted; both participants remain in the shared meeting.',
  'The shared conversation can continue.','The shared meeting has ended.'
]);
// Filler describes the software's state, not people in a room.
const STATE_NOUNS=/\b(conversation|meeting|reply|participants?|encounter|session|interview|turn)\b/i;

// Mood attribution and clinical reads. A camera cannot record any of these.
const INTERPRETIVE=[
  /\bseems?\b/i,/\bappears?\b/i,/\brelax/i,/\btrust/i,/\banxious/i,/\bnervous/i,/\bcalm/i,/\bwarm/i,/\bcomfortabl/i,
  /\btense\b/i,/\bsad\b/i,/\bagitat/i,/\bengag/i,/\bopens? up\b/i,/\bsoften/i,/\bguarded\b/i,/\bsuspicious/i,
  /\bhostile/i,/\bfrighten/i,/\bafraid/i,/\bwary\b/i,/\bsettl/i,/\bhesitant/i,/\breluctant/i,/\bwilling/i,
  /\bbetter\b/i,/\bworse\b/i,/\bprogress/i,/\bwell\b/i,/\bbadly\b/i,/\bsmil/i,/\bfrown/i,/\bsigh/i,/\bcr(y|ies)\b/i,
  /\btears?\b/i,/\blaugh/i,/\bnods?\b/i,/\bslow(ly)?\b/i,/\bflat\b/i,/\brestless/i,/\bfidget/i
];
// Objects the room drawing does not establish. The chair, the door and the hallway are the room.
const INVENTED=[/\bclock\b/i,/\bwindow\b/i,/\bphone\b/i,/\bbed\b/i,/\btable\b/i,/\bpapers?\b/i,/\bcup\b/i,/\bblanket/i,
  /\bIV\b/,/\bbandage/i,/\bcast\b/i,/\bwheelchair/i,/\bcrutch/i,/\bwalker\b/i,/\barmrest/i,/\bbadge\b/i,/\bchart\b/i];
// Turn 8 must not narrate how the conversation is going; the room cannot know.
const PROGRESS=[/\buncross/i,/\bleans? in\b/i,/\bsits? back\b/i,/\bturns? away\b/i,/\bmore\b/i,/\bless\b/i,/\bnow\b/i,/\bfinally\b/i,/\bstill\b/i];
// First-person register belongs to persona.opening, never to a cue.
const FIRST_PERSON=/\b(I|I'm|I’m|I'll|my|me|we|we're|our)\b/;
const POSTURE_VERB='(shifts|leans|crosses|uncrosses|folds|turns|looks|glances|sits|straightens|rests|keeps|watches|lifts|lowers|stops|pauses|breaks)';

function participantNames(profile){
  return profile.participants?profile.participants.map(p=>p.displayName):[profile.displayName];
}

test('every cue slot is a real, third-person, observable sentence',()=>{
  const bad=[];
  for(const caseId of REGISTERED){
    const profile=getProfile(caseId);
    assert.ok(profile&&profile.cues&&typeof profile.cues==='object',caseId+' has cues');
    for(const key of Object.keys(profile.cues))if(!ALLOWED.has(key))bad.push(caseId+' has an unknown cue slot "'+key+'" (a typo renders nothing, silently)');
    for(const slot of REQUIRED)if(!Object.hasOwn(profile.cues,slot))bad.push(caseId+' is missing cues.'+slot);
    const names=participantNames(profile);
    for(const [slot,text] of Object.entries(profile.cues)){
      const where=caseId+' cues.'+slot,q=JSON.stringify(text);
      if(typeof text!=='string'){bad.push(where+' must be a string');continue;}
      if(!text.trim())bad.push(where+' is empty — omit the slot instead; an empty slot must render nothing');
      if(text!==text.trim())bad.push(where+' has leading/trailing whitespace');
      if(SHIPPED_PLACEHOLDERS.has(text))bad.push(where+' is the placeholder text that shipped: '+q);
      else if(STATE_NOUNS.test(text))bad.push(where+' describes the software, not the room: '+q);
      if((text.match(/[.!?]/g)||[]).length!==1)bad.push(where+' must be exactly one sentence: '+q);
      if(FIRST_PERSON.test(text))bad.push(where+' is first person — that register belongs to persona.opening: '+q);
      for(const rule of INTERPRETIVE)if(rule.test(text))bad.push(where+' is interpretive ('+rule+'): '+q);
      for(const rule of INVENTED)if(rule.test(text))bad.push(where+' names an object the room does not establish ('+rule+'): '+q);
      if(slot==='turn8')for(const rule of PROGRESS)if(rule.test(text))bad.push(where+' narrates progress ('+rule+'): '+q);
      if(!names.some(n=>text.includes(n))&&!/\bboth\b/i.test(text))bad.push(where+' names no participant: '+q);
    }
  }
  assert.deepEqual(bad,[],'cue violations:\n  '+bad.join('\n  '));
});

test('shared-meeting cues never attribute a posture to one participant or a gaze between them',()=>{
  const bad=[];
  for(const caseId of REGISTERED){
    const profile=getProfile(caseId);
    if(!profile.participants)continue;
    const names=profile.participants.map(p=>p.displayName);
    for(const [slot,text] of Object.entries(profile.cues)){
      const where=caseId+' cues.'+slot,q=JSON.stringify(text);
      for(const name of names){
        const single=new RegExp('\\b'+name+'\\b (?!and )'+POSTURE_VERB,'i');
        if(single.test(text)&&!/\bboth\b/i.test(text))bad.push(where+' attributes a posture to '+name+' alone: '+q);
        if(new RegExp('\\b(toward|at|from) '+name+'\\b','i').test(text))bad.push(where+' directs a gaze at '+name+': '+q);
      }
      if(/\b(each other|one another)\b/i.test(text))bad.push(where+' describes the participants relative to each other: '+q);
    }
  }
  assert.deepEqual(bad,[],'shared-meeting violations:\n  '+bad.join('\n  '));
});

test('the placeholder blocklist itself is not stale',()=>{
  // If someone rewrites a placeholder into new filler, STATE_NOUNS still catches it; this only
  // proves the named list is still recognisable as filler by the generic rule.
  for(const text of SHIPPED_PLACEHOLDERS)assert.ok(STATE_NOUNS.test(text),'generic filler rule no longer matches '+JSON.stringify(text));
});
