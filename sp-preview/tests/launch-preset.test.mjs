import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const clientModule={exports:{}};
vm.runInThisContext('(function(module,exports){'+fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8')+'\n})',{filename:'preview-client.js'})(clientModule,clientModule.exports);
const {applyLaunchPreset}=clientModule.exports;

function control(value){
  return {value,changes:0,dispatchEvent(event){
    assert.equal(event.type,'change');
    this.changes++;
  }};
}

test('the trainee link explicitly selects a full encounter with student coaching',()=>{
  const format=control('moment'),coachingDepth=control('resident');
  assert.equal(applyLaunchPreset('?preset=trainee',{format,coachingDepth}),true);
  assert.equal(format.value,'full');
  assert.equal(coachingDepth.value,'student');
  assert.equal(format.changes,1);
  assert.equal(coachingDepth.changes,1);
});

test('unknown or missing presets leave the learner entry choices unchanged',()=>{
  for(const search of ['', '?preset=unknown', '?preset=TRAINEE']){
    const format=control('moment'),coachingDepth=control('resident');
    assert.equal(applyLaunchPreset(search,{format,coachingDepth}),false);
    assert.equal(format.value,'moment');
    assert.equal(coachingDepth.value,'resident');
    assert.equal(format.changes,0);
    assert.equal(coachingDepth.changes,0);
  }
});

test('the trainee preset ignores passcode and microphone query parameters',()=>{
  const format=control('moment'),coachingDepth=control('resident');
  assert.equal(applyLaunchPreset('?preset=trainee&passcode=do-not-read&voice=1',{format,coachingDepth}),true);
  assert.deepEqual({format:format.value,coachingDepth:coachingDepth.value},{format:'full',coachingDepth:'student'});
});

function stationControls(){
  function select(value,choices){
    return Object.assign(control(value),{options:choices.map(option=>({value:option}))});
  }
  return {
    format:select('full',['full','moment']),
    patient:select('sp_depression_gated_si_001',['sp_depression_gated_si_001','sp_alcohol_ambivalence_001','sp_psychosis_paranoid_001','family_morgan_maya_001']),
    expression:select('standard',['gentle','standard','expressive']),
    goal:select('ray_needs',['ray_needs']),
    coachingDepth:select('student',['student','resident']),
    concernInitiative:select('natural',['invited','natural','forthcoming'])
  };
}

test('the family door selects both participants and keeps student coaching',()=>{
  const controls=stationControls();
  assert.equal(applyLaunchPreset('?preset=family',controls),true);
  assert.equal(controls.patient.value,'family_morgan_maya_001');
  assert.equal(controls.coachingDepth.value,'student');
});

test('setup links restore concern initiative only for supported patients and menu choices',()=>{
  for(const patient of ['dana','morgan'])for(const value of ['invited','natural','forthcoming']){
    const controls=stationControls();
    assert.equal(applyLaunchPreset(`?preset=station&patient=${patient}&concerns=${value}`,controls),true);
    assert.equal(controls.concernInitiative.value,value);
    assert.equal(controls.concernInitiative.changes,1);
  }
  for(const search of ['?preset=station&patient=ray&concerns=forthcoming','?preset=station&patient=family&concerns=invited','?preset=family&concerns=forthcoming','?preset=station&patient=dana&concerns=unrestricted']){
    const controls=stationControls();applyLaunchPreset(search,controls);
    assert.equal(controls.concernInitiative.value,'natural');
    assert.equal(controls.concernInitiative.changes,0);
  }
});

test('station selections apply only to available menu options',()=>{
  const controls=stationControls();
  applyLaunchPreset('?preset=station&patient=ray&expression=gentle&goal=ray_needs&depth=resident',controls);
  assert.equal(controls.patient.value,'sp_psychosis_paranoid_001');
  assert.equal(controls.expression.value,'gentle');
  assert.equal(controls.goal.changes,1);
  assert.equal(controls.coachingDepth.value,'resident');
  const fresh=stationControls();
  assert.equal(applyLaunchPreset('?preset=station&patient=constructor',fresh),false);
  assert.equal(fresh.format.changes,0);
  applyLaunchPreset('?preset=station&patient=ray&expression=louder&goal=another_case&depth=faculty',fresh);
  assert.equal(fresh.expression.changes,0);
  assert.equal(fresh.goal.changes,0);
  assert.equal(fresh.coachingDepth.changes,0);
});
