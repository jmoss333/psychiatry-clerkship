import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';
import {encodeEvidenceResponse} from '../faculty-console/netlify/functions/evidence-response.mjs';
import {decodeEvidenceResponse} from '../faculty-console/evidence-response.mjs';
test('a faculty view larger than the provider response limit is restored exactly',async()=>{
 const snapshot={why:'Clinical teaching é — 😀. '.repeat(1000)};
 const value={packets:Array.from({length:300},(_,i)=>({revision:String(i),questionSnapshots:{q:snapshot},targets:[{current:snapshot,decision:{outcome:'defer',rationale:'Review needed'}}]})),decisions:{version:1,decisions:[{actor:'Faculty',rationale:'Keep this decision'}]}};
 assert.ok(Buffer.byteLength(JSON.stringify(value))>6_000_000);
 const transport=encodeEvidenceResponse(value);
 assert.ok(Buffer.byteLength(JSON.stringify(transport))<5_000_000);
 assert.deepEqual(await decodeEvidenceResponse(transport),value);
});
test('legacy responses remain readable and broken compressed data never yields partial evidence',async()=>{
 const original={packets:[],decisions:{decisions:[]}};assert.deepEqual(await decodeEvidenceResponse(original),original);
 await assert.rejects(()=>decodeEvidenceResponse({encoding:'evidence-gzip-base64-v1',data:'broken'}));
});
test('incompressible views fail explicitly before crossing the wire budget',()=>{
 assert.throws(()=>encodeEvidenceResponse({text:randomBytes(4_000_000).toString('base64')}),/response exceeds/);
});
