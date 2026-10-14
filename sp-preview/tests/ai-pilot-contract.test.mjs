import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertEvidenceReferences,contextDigest} from '../lib/ai-pilot/contract.mjs';
test('rejects invented references and missing attribution',()=>{
 for(const points of [[{text:'Claim',evidenceIds:['missing']}],[{text:'Claim',evidenceIds:[]}],[{text:'x'.repeat(601),evidenceIds:['a']}],[{text:1,evidenceIds:['a']}]]) assert.throws(()=>assertEvidenceReferences(points,[{id:'a'}]));
 assert.deepEqual(assertEvidenceReferences([{text:'Claim',evidenceIds:['a']}],[{id:'a'}]),[{text:'Claim',evidenceIds:['a']}]);
});
test('canonical digest sorts nested objects but retains array order and nested digest',()=>{
 const literal='{"a":[{"contextDigest":"keep","z":2},1],"b":3}';
 assert.equal(contextDigest({b:3,contextDigest:'omit',a:[{z:2,contextDigest:'keep'},1]}),createHash('sha256').update(literal).digest('hex'));
 assert.notEqual(contextDigest([1,2]),contextDigest([2,1]));
 assert.throws(()=>contextDigest({x:undefined}));
});
