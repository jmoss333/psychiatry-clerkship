import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewPriority,orderPackets} from '../faculty-console/evidence-priority.mjs';
const candidate=(overrides={})=>({questionId:'q1',kind:'possible-contradiction',quote:'Synthetic overdose teaching requires review.',itemRevision:'a',...overrides});
const packet=(revision,overrides={})=>({revision,status:'pending',scanStatus:'complete',coverage:{active:2,scanned:2,errors:[]},observedAt:'2026-10-04',candidates:[],readings:[],targets:[],...overrides});
test('safety terms elevate only possible contradictions in quoted teaching',()=>{
 assert.equal(reviewPriority(packet('a',{candidates:[candidate()]})).rank,1);
 assert.equal(reviewPriority(packet('b',{candidates:[candidate({kind:'related-teaching'})]})).rank,3);
 assert.equal(reviewPriority(packet('c',{candidates:[candidate({quote:'Synthetic duration teaching.',context:'Overdose context'})]})).rank,2);
 assert.match(reviewPriority(packet('a',{candidates:[candidate()]})).reasons.join(' '),/overdose/i);
});
test('incomplete, unavailable and mismatched coverage never look routine',()=>{
 for(const overrides of [{scanStatus:'incomplete'},{mappingStatus:'unavailable'},{coverage:{}},{coverage:{active:2,scanned:1,errors:[]}},{coverage:{active:0,scanned:0,errors:[]}}])
  assert.equal(reviewPriority(packet('a',overrides)).rank,0);
});
test('stale or removed teaching is flagged for recheck',()=>{
 for(const revision of ['b',null]) assert.equal(reviewPriority(packet('a',{candidates:[candidate()],targets:[{itemKey:'question:q1',revision}]})).rank,0);
 assert.equal(reviewPriority(packet('a',{readings:[{source:'reading.md',revision:'a'}],targets:[{itemKey:'reading:reading.md',revision:'b'}]})).rank,0);
});
test('counts distinct questions and readings rather than matching fields',()=>{
 const p=reviewPriority(packet('a',{candidates:[candidate(),candidate(),candidate({questionId:'q2'})],readings:[{source:'a.md'},{source:'a.md'},{source:'b.md'}]}));
 assert.deepEqual(p.counts,{questions:2,readings:2});
});
test('orders by review lane then reach then oldest and retains every packet without mutation',()=>{
 const input=[packet('routine'),packet('resolved',{status:'resolved',candidates:[candidate()]}),packet('safety',{candidates:[candidate()]}),packet('unknown',{scanStatus:'incomplete'}),packet('broader',{candidates:[candidate({questionId:'q2'}),candidate()]}),packet('older',{candidates:[candidate()],observedAt:'2026-10-01'}),packet('superseded',{status:'superseded'})];
 const before=JSON.stringify(input);const sorted=orderPackets(input);
 assert.deepEqual(sorted.map(p=>p.revision),['unknown','broader','older','safety','routine','resolved','superseded']);
 assert.equal(JSON.stringify(input),before);assert.equal(new Set(sorted).size,input.length);
});
test('missing observation dates are explicit and sort ahead within equal reach',()=>{
 const p=packet('unknown-date',{observedAt:'bad'});
 assert.match(reviewPriority(p).reasons.join(' '),/Observation date unavailable/);
 assert.equal(orderPackets([packet('dated'),p])[0],p);
});
test('priority calculation preserves decisions and never labels low risk',()=>{
 const decision={outcome:'needs-edit',rationale:'Faculty rationale'};
 const p=packet('x',{targets:[{itemKey:'source:s',revision:'x',decision}]});
 orderPackets([p]); assert.equal(p.targets[0].decision,decision);
 assert.doesNotMatch(JSON.stringify(reviewPriority(p)),/low risk|safe to publish/i);
});
