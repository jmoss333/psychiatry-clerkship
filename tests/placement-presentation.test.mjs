import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync(new URL('../13_Faculty_Resources/_automation/site_build/spa_index.html',import.meta.url),'utf8');
const form=source.match(/function renderPretestForm\(\)\{[^\n]+/)[0];
const counter=source.match(/function updatePtCount\(\)\{[^\n]+/)[0];
function render(count, answers={}) {
  const root={innerHTML:''}, status={textContent:''};
  const document={getElementById:id=>id==='ptRoot'?root:status};
  const items=Array.from({length:count},(_,i)=>({stem:'Vignette '+i,options:[{key:'A',t:'Answer'}]}));
  new Function('document','PRETEST_POOL','ptAnswers','esc',counter+';'+form+';renderPretestForm();')(document,items,answers,s=>s);
  return {html:root.innerHTML,status:status.textContent};
}
test('formative presentation derives visible total and ordinal from the loaded pool',()=>{
  for(const count of [3,12]){
    const view=render(count,{0:'A',2:'A'});
    assert.match(view.html,new RegExp(count+'-question formative placement'));
    assert.match(view.html,new RegExp(count+' of '+count+'\\. Vignette'));
    assert.equal(view.status,'2 of '+count+' answered');
    assert.match(view.html,/not a grade or a measure of clinical readiness/);
    assert.match(view.html,/Unsubmitted answers are not saved/);
    assert.match(view.html,/role="status" aria-live="polite" aria-atomic="true"/);
  }
});
test('empty pool keeps existing unavailable fallback and no invented count',()=>{
  const view=render(0);assert.match(view.html,/Placement unavailable/);assert.doesNotMatch(view.html,/question formative/);
});
test('learner placement labels do not promise a completion time',()=>{
  assert.doesNotMatch(source,/2-minute placement/);
  assert.match(source,/Retake the formative placement/);
});

test('an older delayed load cannot reset a reopened attempt',async()=>{
  const start=source.match(/function startPretest\(\)\{[^\n]+/)[0];
  const pending=[];
  const F=new Function('fetch',`var currentItem=null,PRETEST_POOL=null,ptAnswers={},ptRequest=0;
    var contentEl={className:'',innerHTML:''};function setLearnerTitle(){}function renderPretestForm(){}
    ${start};return {start:startPretest,answer:function(){ptAnswers[0]='A';},answers:function(){return ptAnswers;}};`)(()=>new Promise(resolve=>pending.push(resolve)));
  F.start();F.start();
  pending[1]({ok:true,json:()=>Promise.resolve({items:[{}]})});
  await new Promise(resolve=>setImmediate(resolve));F.answer();
  pending[0]({ok:true,json:()=>Promise.resolve({items:[{}]})});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(F.answers()[0],'A');
});
