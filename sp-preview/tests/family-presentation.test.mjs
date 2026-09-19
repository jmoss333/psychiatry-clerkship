import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import encounterProfiles from '../../_prototypes/sp-interview/sp-encounter-profiles.js';
import {familyRole, FAMILY_CASE_ID} from '../lib/family.mjs';
import {hostedSpeechProfile} from '../lib/portrayal.mjs';

// Load the actual classic browser script, just as the station tests do.
const stationModule={exports:{}};
vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/station-content.js',import.meta.url),'utf8')+'\n})')(stationModule,stationModule.exports);
const stationContent=stationModule.exports;

test('family casting agrees across public identity, canonical role and every synthesis preset',()=>{
  const profile=stationContent.getProfile(FAMILY_CASE_ID);
  assert.equal(profile.voice,'Marin and Coral');
  for(const person of profile.participants){
    const role=familyRole(person.id),expected=person.id==='maya'?'coral':'marin';
    assert.equal(person.voice.toLowerCase(),expected);
    assert.equal(role.voice,expected);
    for(const intensity of ['gentle','standard','expressive']){
      const speech=hostedSpeechProfile(role.speechCaseId,intensity);
      assert.equal(speech.voice,expected);
      assert.match(speech.instructions,/Speak only the supplied dialogue, exactly/);
    }
  }
});

test('family observations reproduce authored visible cues and distinguish illustrative seating',()=>{
  const profile=stationContent.getProfile(FAMILY_CASE_ID),authored=encounterProfiles.getProfile(FAMILY_CASE_ID);
  for(const person of profile.participants){
    assert.equal(person.observation,authored.participants.find(p=>p.id===person.id).cues.opening);
    assert.doesNotMatch(person.observation,/trust|defensi|ready|hostil|angry|empathy|agree/i);
  }
  assert.match(profile.roomLayout.label,/illustrative/i);
  assert.match(profile.roomLayout.text,/do not establish how close the family feels/);
  assert.doesNotMatch(JSON.stringify(profile),/privateFacts|fear that a limit|four to six beers/i);
});
