// Authored environmental cues. Learner dialogue cannot supply their wording.
const CUES=Object.freeze({
  door_knock:Object.freeze({id:'door_knock',text:'A brief knock at the closed door. No one enters.'}),
  hallway_chime:Object.freeze({id:'hallway_chime',text:'A short chime sounds in the hallway and stops.'})
});
export const isRoomCue=id=>typeof id==='string'&&Object.hasOwn(CUES,id);
export function roomCue(id){
  if(!isRoomCue(id))throw Object.assign(new Error('preview_input_invalid'),{status:400,code:'preview_input_invalid'});
  return CUES[id];
}
export function withRoomCue(context,cue){
  if(!cue)return context;
  const event=roomCue(cue.id);
  if(!Number.isInteger(cue.turn)||cue.turn<1||cue.turn>10)throw new Error('Invalid authenticated room cue.');
  return {...context,system:context.system+`\nAUTHORED FACULTY ROOM EVENT: Once, immediately before learner turn ${cue.turn}, this event occurred: ${event.text}\nThis is a brief environmental event, not new clinical information. It does not require fear, anger, agreement, or loss of focus. If relevant to the current dialogue, acknowledge it briefly in this person's established manner; otherwise continue the conversation. Do not invent who caused it, a message, a person entering or leaving, danger, or a new clinical fact. Do not replay the event on later turns. A redirect may restore the topic while the person's existing feelings and portrayal persist. Canonical facts, uncertainty, disclosure rules and direct safety questions take precedence.`};
}
