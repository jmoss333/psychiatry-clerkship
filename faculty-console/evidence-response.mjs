// Explicit JSON transport avoids relying on provider-specific binary response handling.
export async function decodeEvidenceResponse(value){
 if(value?.encoding!=='evidence-gzip-base64-v1')return value;
 if(typeof value.data!=='string'||value.data.length>5_000_000)throw new Error('Evidence response unavailable');
 const bytes=Uint8Array.from(atob(value.data),c=>c.charCodeAt(0));
 const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
 const chunks=[];let length=0;
 try{
  while(true){const {value:chunk,done}=await reader.read();if(done)break;
   length+=chunk.byteLength;if(length>64_000_000)throw new Error('Expanded evidence response exceeds supported size');chunks.push(chunk);
  }
 }finally{await reader.cancel();reader.releaseLock();}
 return JSON.parse(await new Blob(chunks).text());
}
