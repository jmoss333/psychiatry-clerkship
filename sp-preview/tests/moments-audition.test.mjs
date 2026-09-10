import test from 'node:test';import assert from 'node:assert/strict';
import {configuration,MAX_STARTS,MAX_UNITS} from '../qa/moments-audition.mjs';
test('paid audition opt-in rejects unsafe targets before reading access or fetching',()=>{
 const base={DANA_QA_MODE:'moments',DANA_QA_URL:'https://dana--interview-room-faculty-preview.netlify.app/',DANA_QA_ACCESS_FILE:'/fixture/not-read'};
 assert.equal(configuration(base).url,'https://dana--interview-room-faculty-preview.netlify.app');assert.equal(MAX_STARTS,3);assert.equal(MAX_UNITS,51);
 for(const extra of [{DANA_QA_URL:'https://interview-room-faculty-preview.netlify.app/'},{DANA_QA_MODE:''},{DANA_QA_ACCESS_FILE:''},{DANA_QA_URL:'https://une-ms3-psychiatry.netlify.app/'},{DANA_QA_URL:'https://interview-room-faculty-preview.netlify.app.evil.test/'},{DANA_QA_URL:'http://interview-room-faculty-preview.netlify.app/'},{DANA_QA_URL:'https://user:secret@interview-room-faculty-preview.netlify.app/'}])assert.throws(()=>configuration({...base,...extra}));
});
