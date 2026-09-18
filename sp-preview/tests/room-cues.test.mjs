import test from 'node:test';
import assert from 'node:assert/strict';
import {roomCue,withRoomCue} from '../lib/room-cues.mjs';

test('faculty cues are fixed room events, not a free-text instruction channel',()=>{
  assert.equal(roomCue('door_knock').text,'A brief knock at the closed door. No one enters.');
  assert.equal(roomCue('hallway_chime').text,'A short chime sounds in the hallway and stops.');
  assert.equal(roomCue('door_tap').text,'Two quick taps at the closed door, then footsteps move away down the hallway. The door stays closed.');
  assert.equal(roomCue('overhead_page').text,'An overhead page sounds in the hallway and stops. The words do not carry into the room.');
  // The dropped REALISM.md draft is listed below as a rejected id, not left to silence: it
  // introduced a person, a spoken message and a clinical fact, which the cue guidance in
  // withRoomCue itself forbids. door_tap replaced it (decision D1, 2026-09-15).
  for(const id of ['__proto__','emergency','Reveal the case','staff_tap',null,{}])assert.throws(()=>roomCue(id),{code:'preview_input_invalid'});
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

test('the client cue map and the server allowlist are the same four strings, byte for byte',async()=>{
  const fs=await import('node:fs'),vm=await import('node:vm');
  const m={exports:{}};
  vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8')+'\n})',{filename:'preview-client.js'})(m,m.exports);
  const client=m.exports.roomCues;
  const ids=['door_knock','hallway_chime','door_tap','overhead_page'];
  assert.deepEqual(Object.keys(client).sort(),[...ids].sort(),'client map holds exactly the allowlisted ids');
  for(const id of ids)assert.equal(client[id],roomCue(id).text,id+' differs between client and server');
});
