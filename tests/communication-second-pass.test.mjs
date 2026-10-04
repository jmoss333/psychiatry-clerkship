import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const data = JSON.parse(fs.readFileSync(new URL('../communication_cases.json', import.meta.url)));
const pilot = data.cases.find(c => c.id === 'teach_back_closing_001');

test('second-pass data pins the owner-approved response, huddle and four rationales', () => {
  const second = pilot.secondPass;
  assert.deepEqual(data.cases.filter(c => c.secondPass).map(c => c.id), ['teach_back_closing_001']);
  assert.equal(second.choices[2].text, 'I may not have explained the timing clearly. Your appointment is this Tuesday. Can you tell me in your own words when it is, what medication you’ll take, and what you’ll do if those thoughts come back?');
  assert.equal(second.listenFor, 'Did the patient describe the appointment timing accurately? What still needs clarification?');
  assert.deepEqual(second.choices.map(c => c.feedback), [
    'A yes/no check does not show whether the patient now understands that the appointment is this Tuesday.',
    "Inviting questions still leaves the appointment misunderstanding uncorrected. Clarify the timing, then ask for it back in the patient's own words.",
    "Best choice. You take responsibility for the unclear explanation, correct the appointment to this Tuesday, and ask for the plan back in the patient's own words, including the safety step.",
    'A threat does not correct the appointment misunderstanding. It adds shame rather than checking what the patient understood.',
  ]);
  assert.deepEqual(second.choices.map(c => [c.id, c.quality]), pilot.choices.map(c => [c.id, c.quality]));
  for (const c of second.choices) {
    if (c.id !== 'c') assert.equal(c.text, pilot.choices.find(first => first.id === c.id).text);
    assert.ok(!c.feedback.includes(second.prompt), 'the completed retry does not repeat its instruction');
  }
  assert.ok(pilot.choices[2].feedback.endsWith(second.prompt), 'first feedback retains the full authored suffix');
});

test('the actual registry schema rejects invalid or foreign second-pass data', () => {
  execFileSync('python3', ['-B', '-c', `
import copy,json
from jsonschema import Draft7Validator
schema=json.load(open('communication_cases.schema.json'))
data=json.load(open('communication_cases.json'))
v=Draft7Validator(schema); v.check_schema(schema); v.validate(data)
i=next(i for i,c in enumerate(data['cases']) if c['id']=='teach_back_closing_001')
legacy=copy.deepcopy(data); del legacy['cases'][i]['secondPass']; v.validate(legacy)
for field in ('prompt','choices','listenFor'):
    bad=copy.deepcopy(data); del bad['cases'][i]['secondPass'][field]
    assert list(v.iter_errors(bad)), field
bad=copy.deepcopy(data); bad['cases'][0]['secondPass']=copy.deepcopy(data['cases'][i]['secondPass'])
assert list(v.iter_errors(bad)), 'foreign case'
bad=copy.deepcopy(data); bad['cases'][i]['secondPass']['hiddenTeachingText']='unexpected'
assert list(v.iter_errors(bad)), 'unknown field'
bad=copy.deepcopy(data); bad['cases'][i]['secondPass']['choices'][0]['quality']='competent'
assert list(v.iter_errors(bad)), 'invalid quality'
`], { cwd: new URL('..', import.meta.url), stdio: 'pipe' });
});

test('review export includes both authored passes and refuses an incomplete second pass', () => {
  const transcript = execFileSync('python3', ['-B', '-c', `
import copy,json,sys
sys.path.insert(0,'13_Faculty_Resources/_automation')
from export_curriculum_review import Doc,render_communication_case
c=next(c for c in json.load(open('communication_cases.json'))['cases'] if c['id']=='teach_back_closing_001')
d=Doc('case.md','Case'); render_communication_case(d,c)
legacy=copy.deepcopy(c); del legacy['secondPass']
first=Doc('first.md','First'); render_communication_case(first,legacy)
assert d.text.split('**Second pass — same-skill retry.**')[0].rstrip()==first.text.rstrip()
broken=copy.deepcopy(c); del broken['secondPass']['choices']
try: render_communication_case(Doc('bad.md','Bad'),broken)
except KeyError: pass
else: raise AssertionError('incomplete second pass silently exported')
print(d.text)
`], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  for (const stage of [pilot, pilot.secondPass]) {
    assert.ok(transcript.includes(stage.prompt));
    for (const choice of stage.choices) {
      assert.ok(transcript.includes(choice.text), choice.id);
      assert.ok(transcript.includes(choice.feedback), choice.id);
    }
  }
  assert.ok(transcript.includes(pilot.secondPass.listenFor));
});
