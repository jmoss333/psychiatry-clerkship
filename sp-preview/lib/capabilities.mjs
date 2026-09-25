// Public availability only. This reader must not create a provider, access a
// usage ledger, inspect an access phrase, or return deployment/configuration data.
export function previewCapabilities(environment,context){
 return {momentsEnabled:!!context?.deploy?.id&&environment.DANA_PREVIEW_ENABLED==='true'};
}

export function capabilitiesResponse(request,environment,context){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(request.method!=='GET')return new Response(null,{status:405,headers:{...headers,Allow:'GET'}});
 return Response.json(previewCapabilities(environment,context),{headers});
}
