import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../dana-first-sentence-experiment.py',import.meta.url));
test('first-sentence experiment preserves exact text, waits past abbreviations and tiny acknowledgements, and rejects unfinished actor output',()=>{
  assert.ok(existsSync(script),'the standalone experiment must exist');
  const python=String.raw`
import importlib.util,sys,types,tempfile,pathlib,threading
spec=importlib.util.spec_from_file_location('experiment',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
assert m.first_substantive_sentence('Okay. ') is None
assert m.first_substantive_sentence('Okay. I have been feeling really tired.') is None
assert m.first_substantive_sentence('Okay. I have been feeling really tired. More')=='Okay. I have been feeling really tired.'
assert m.first_substantive_sentence('I spoke with Dr. ') is None
assert m.first_substantive_sentence('I spoke with Dr. Smith about everything. Next')=='I spoke with Dr. Smith about everything.'
assert m.first_substantive_sentence('I wake at 3 a.m. most nights. Next')=='I wake at 3 a.m. most nights.'
assert m.first_substantive_sentence('Well... ') is None
assert m.first_substantive_sentence('I have been feeling really tired.',final=True)=='I have been feeling really tired.'
text='Okay. I have been feeling really tired. Food has no taste lately.'
seen=[];lead_started=threading.Event()
class SpeechStream:
 def __enter__(self):return self
 def __exit__(self,*unused):return False
 def iter_bytes(self,chunk_size):yield b'ID3'+b'x'*197
def speech(**kwargs):
 seen.append(kwargs);lead_started.set();return SpeechStream()
def speech_factory():return types.SimpleNamespace(audio=types.SimpleNamespace(speech=types.SimpleNamespace(with_streaming_response=types.SimpleNamespace(create=speech))))
class Actor:
 def __init__(self,status='completed'):self.status=status
 def __enter__(self):return self
 def __exit__(self,*unused):return False
 def __iter__(self):
  yield types.SimpleNamespace(type='response.created')
  yield types.SimpleNamespace(type='response.output_text.delta',delta='Okay. I have been feeling really tired. ')
  assert lead_started.wait(2),'lead speech must start while actor is still streaming'
  yield types.SimpleNamespace(type='response.output_text.delta',delta='Food has no taste lately.')
 def get_final_response(self):return types.SimpleNamespace(status=self.status,output_text=text)
job={'system':'Synthetic context','messages':[{'role':'user','content':'How are you?'}],'instructions':'Speak exactly.'}
with tempfile.TemporaryDirectory() as directory:
 actor=types.SimpleNamespace(responses=types.SimpleNamespace(stream=lambda **kwargs:Actor()))
 result=m.run_experiment(job,actor,speech_factory,pathlib.Path(directory))
 assert result['status']=='completed' and result['full_text']==text
 assert result['lead_text']+result['remainder_text']==text
 assert result['lead_text']=='Okay. I have been feeling really tired.'
 assert len(seen)==3 and all(call['model']=='gpt-4o-mini-tts-2025-12-15' and call['voice']=='marin' for call in seen)
 assert set(path.name for path in pathlib.Path(directory).glob('*.mp3'))=={'lead.mp3','remainder.mp3','baseline.mp3'}
 assert all(result['speech'][name]['first_chunk_ms'] is not None for name in ['lead','remainder','baseline'])
seen.clear();lead_started.clear()
with tempfile.TemporaryDirectory() as directory:
 actor=types.SimpleNamespace(responses=types.SimpleNamespace(stream=lambda **kwargs:Actor('incomplete')))
 result=m.run_experiment(job,actor,speech_factory,pathlib.Path(directory))
 assert result['status']=='failed' and result['failure']=='actor_incomplete'
 assert len(seen)<=1,'an incomplete actor must never start remainder or baseline speech'
 assert not list(pathlib.Path(directory).glob('*.mp3')),'unvalidated early audio must not remain deliverable'
print('experiment contract passed')
`;
  assert.equal(execFileSync('python3',['-c',python,script],{encoding:'utf8',timeout:10000}).trim(),'experiment contract passed');
});
