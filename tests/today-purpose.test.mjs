import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const base=new URL('../13_Faculty_Resources/_automation/site_build/',import.meta.url);
const data=fs.readFileSync(new URL('frontdoor/fd_data.js',base),'utf8');
const today=fs.readFileSync(new URL('frontdoor/fd_today.js',base),'utf8');
const shell=fs.readFileSync(new URL('spa_index.html',base),'utf8');
const F=new Function(data+'\n'+today+'\nreturn {options:fdTodayPurposeOptions,render:fdTodayPurpose};')();
const index={byRef:{'oral.html':{title:'Oral presentation coach'},'pg_interview.md':{title:'Interview pocket card'},'family_playbook.md':{title:'Family Meeting Playbook'}}};
test('purpose reuses only the three existing resource refs plus the one existing planner',()=>{
 assert.deepEqual(F.options(index).map(x=>[x.id,x.ref]),[['rounds','oral.html'],['interview','pg_interview.md'],['family','family_playbook.md'],['study',null]]);
 assert.match(F.render(index,'study',true),/data-today-planner/);
 assert.doesNotMatch(F.render(index,'study',true),/data-block-start/);
});
test('missing, rights and search-only targets are omitted rather than replaced',()=>{
 const missing={byRef:{'oral.html':{rights:true},'pg_interview.md':{searchOnly:true}}};
 assert.deepEqual(F.options(missing).map(x=>x.id),['study']);
 assert.doesNotMatch(F.render(missing,'family',true),/data-fd-open|Suggested because/);
});
test('default is optional and closed; regular Today is the explicit escape',()=>{
 const html=F.render(index,'',false);
 assert.match(html,/<details class="fd-purpose">/);
 assert.match(html,/data-today-purpose="" aria-pressed="true">Regular Today/);
 assert.doesNotMatch(html,/Suggested because|data-fd-open/);
 assert.match(html,/resets on reload/);
});
test('active purpose explains learner choice, escapes the existing title and has one selection',()=>{
 const html=F.render({byRef:{...index.byRef,'pg_interview.md':{title:'Interview "guide" <check>'}}},'interview',true);
 assert.match(html,/Suggested because you chose Interview\./);
 assert.match(html,/data-fd-open="pg_interview.md"/);
 assert.match(html,/Interview &quot;guide&quot; &lt;check&gt;/);
 assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);
 assert.doesNotMatch(html,/weakest|competence|clinical readiness/);
});
test('unrecognized purpose cannot inject a destination or change the default',()=>{
 const html=F.render(index,'other" onclick="alert(1)',true);
 assert.doesNotMatch(html,/onclick|alert|data-fd-open|Suggested because/);
 assert.match(html,/data-today-purpose="" aria-pressed="true"/);
});
test('session purpose is outside persisted state; shell owns guarded auxiliary actions',()=>{
 assert.match(shell,/var fdTodayPurposeId='',fdTodayPurposeOpen=false/);
 assert.match(shell,/if\(!facultyPreviewRequest\)also\+=fdTodayPurpose/);
 assert.match(shell,/if\(!purposeValid\)return/);
 assert.match(shell,/fdTodayPurposeId=purposeId;fdTodayPurposeOpen=purposeId!=='';specialRefresh\(\)/);
 const purposeHandlers=shell.slice(shell.indexOf("el=target.closest&&target.closest('[data-today-purpose-toggle]')"),shell.indexOf("el=target.closest&&target.closest('[data-block-minutes]')"));
 assert.doesNotMatch(purposeHandlers,/localStorage|sessionStorage|setItem|history\.|fetch\(|blockSave|fdBlockStart/);
 assert.match(purposeHandlers,/plannerFocus\.focus\(\)/);
 assert.match(purposeHandlers,/if\(facultyPreviewRequest\)return/);
});
