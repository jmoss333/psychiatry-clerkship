import {createHash} from 'node:crypto';
const fail=code=>{throw Object.assign(new Error(code),{code,status:400});};
export function assertEvidenceReferences(statements,units){
 if(!Array.isArray(statements)||!Array.isArray(units)) fail('invalid_evidence');
 const ids=new Set(units.map(u=>u?.id));
 for(const s of statements){
  if(!s||typeof s.text!=='string'||!s.text.trim()||s.text.length>600||!Array.isArray(s.evidenceIds)||s.evidenceIds.length<1||s.evidenceIds.length>3||new Set(s.evidenceIds).size!==s.evidenceIds.length) fail('invalid_evidence');
  for(const id of s.evidenceIds) if(typeof id!=='string'||!ids.has(id)) fail('unknown_evidence');
 }
 return statements;
}
export function contextDigest(value){
 const seen=new Set();
 function canonical(v,top=false){
  if(v===null||typeof v==='string'||typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v))) return v;
  if(typeof v!=='object'||seen.has(v)||(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype)) fail('invalid_context');
  seen.add(v);
  const result=Array.isArray(v)?v.map(x=>canonical(x)):Object.fromEntries(Object.keys(v).sort().filter(k=>!(top&&k==='contextDigest')).map(k=>[k,canonical(v[k])]));
  seen.delete(v); return result;
 }
 return createHash('sha256').update(JSON.stringify(canonical(value,true))).digest('hex');
}
