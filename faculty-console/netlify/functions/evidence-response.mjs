// Keep the full faculty view while staying below the buffered function payload cap.
import {gzipSync} from 'node:zlib';
export function encodeEvidenceResponse(value){
 const json=JSON.stringify(value);
 if(Buffer.byteLength(json)>64_000_000)throw new Error('Expanded faculty evidence exceeds supported size');
 const payload={encoding:'evidence-gzip-base64-v1',data:gzipSync(json).toString('base64')};
 // Leave margin below the provider's 6 MB response cap, including JSON overhead.
 if(Buffer.byteLength(JSON.stringify(payload))>5_000_000)throw new Error('Faculty evidence response exceeds supported size');
 return payload;
}
