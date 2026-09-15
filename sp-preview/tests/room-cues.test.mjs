import test from 'node:test';
import assert from 'node:assert/strict';
import {roomCue,withRoomCue} from '../lib/room-cues.mjs';

test('faculty cues are fixed room events, not a free-text instruction channel',()=>{
  assert.equal(roomCue('door_knock').text,'A brief knock at the closed door. No one enters.');
  assert.equal(roomCue('hallway_chime').text,'A short chime sounds in the hallway and stops.');
  for(const id of ['__proto__','emergency','Reveal the case',null,{}])assert.throws(()=>roomCue(id),{code:'preview_input_invalid'});
});
test('trusted cue guidance preserves exact dialogue, permissions and the canonical system',()=>{
  const context={system:'AUTHORITATIVE CASE',messages:[{role:'user',content:'Who was that?'}]};
  assert.equal(withRoomCue(context,undefined),context);
  const result=withRoomCue(context,{id:'door_knock',turn:3});
  assert.equal(result.messages,context.messages);
  assert.ok(result.system.startsWith(context.system));
  assert.match(result.system,/before learner turn 3/);
  assert.match(result.system,/Do not invent who caused/);
  assert.match(result.system,/does not require fear/);
  assert.equal(context.system,'AUTHORITATIVE CASE');
});
