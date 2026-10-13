// Decode the collector's lossless envelope before applying faculty review rules.
import {createHash} from 'node:crypto';
const limit=64_000_000;
const fields=new Set(['candidates','questionSnapshots','passages','diff','readings']);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const fail=()=>{throw new Error('Shared evidence snapshot unavailable or invalid');};
export function decodeEvidenceStorage(stored){
 if(!object(stored))fail();
 if(!Object.hasOwn(stored,'storageVersion'))return structuredClone(stored);
 if(stored.storageVersion!==1||Object.keys(stored).sort().join(',')!=='references,snapshots,state,storageVersion')fail();
 if(!object(stored.state)||Object.hasOwn(stored.state,'storageVersion')||!object(stored.snapshots)||!Array.isArray(stored.references))fail();
 const state=structuredClone(stored.state),parsed=new Map(),used=new Set();
 for(const [digest,value] of Object.entries(stored.snapshots)){
  if(typeof value!=='string'||createHash('sha256').update(value,'utf8').digest('hex')!==digest)fail();
  parsed.set(digest,JSON.parse(value));
 }
 let expanded=bytes(state);
 for(const ref of stored.references){
  if(!object(ref)||Object.keys(ref).sort().join(',')!=='path,snapshot'||!parsed.has(ref.snapshot)||!Array.isArray(ref.path)||ref.path.length!==3)fail();
  const [group,key,field]=ref.path;let target;
  if(group==='packets'&&Number.isInteger(key)&&key>=0&&Array.isArray(state.packets)&&key<state.packets.length&&fields.has(field))target=state.packets[key];
  else if(group==='latestValid'&&typeof key==='string'&&object(state.latestValid)&&Object.hasOwn(state.latestValid,key)&&field==='text')target=state.latestValid[key];
  else fail();
  if(!object(target)||Object.hasOwn(target,field))fail();
  expanded+=Buffer.byteLength(stored.snapshots[ref.snapshot],'utf8')+bytes(field)+2;
  if(expanded>limit)fail();
  target[field]=structuredClone(parsed.get(ref.snapshot));used.add(ref.snapshot);
 }
 if(used.size!==parsed.size)fail();
 return state;
}
