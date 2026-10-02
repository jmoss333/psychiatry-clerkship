import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const source=readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/spa_index.html',import.meta.url),'utf8');
const render=source.match(/window\.renderProgress=function\(\)\{[\s\S]*?\n  \};/)[0];
function run(rows){
 return new Function('rows', `
 var window={}, FD_INDEX={};
 function fdActivePathValid(){return true;}
 function navScan(){return {cov:{},hy:[]};}
 function masteryByBlueprint(){return rows;}
 function LS(){return '';}
 function fdLoadPlan(){return null;}
 function fdPathWeekCount(){return 6;}
 function weakTopics(){return [];}
 function renderCalibPanel(){return '';}
 function calibrationSummary(){return {total:0};}
 function esc(s){return String(s);}
 ${render}
 return window.renderProgress();`)(rows);
}
test('no-answer areas are invitations to start, never evidence of weakness',()=>{
 const html=run([{c:'mood',label:'Mood',score:null,miss:0}]);
 assert.match(html, /Try an unpracticed area/);
 assert.match(html, /No practice answers yet/);
 assert.doesNotMatch(html, /Practice your weakest areas/);
 assert.match(html, /data-practice="mood"/);
});
test('missed practiced areas and unpracticed areas have separate headings and unchanged targets',()=>{
 const html=run([{c:'psychosis',label:'Psychosis',score:40,miss:2},{c:'mood',label:'Mood',score:null,miss:0}]);
 assert.match(html, /Practice your weakest areas/);
 assert.match(html, /Try an unpracticed area/);
 assert.match(html, /data-practice="psychosis"[^]*40% · practice/);
 assert.match(html, /data-practice="mood"/);
});
test('a small perfect sample is not labelled weak',()=>{
 assert.doesNotMatch(run([{c:'mood',label:'Mood',score:63,miss:0}]), /Practice your weakest areas|Try an unpracticed area/);
});
