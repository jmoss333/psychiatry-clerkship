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
