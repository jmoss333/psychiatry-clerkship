import {capabilitiesResponse} from '../../lib/capabilities.mjs';

export default function handler(request,context){
 if(request.method!=='GET')return capabilitiesResponse(request,{},context);
 try{
  return capabilitiesResponse(request,{
   DANA_PREVIEW_ENABLED:Netlify.env.get('DANA_PREVIEW_ENABLED'),
   DANA_MOMENTS_ENABLED:Netlify.env.get('DANA_MOMENTS_ENABLED'),
  },context);
 }catch{
  // Unknown availability never offers a mode whose endpoint may be disabled.
  return capabilitiesResponse(request,{},context);
 }
}
// Routing follows the existing TOML rewrites; no config.path disables the
// /.netlify/functions endpoint that the rewrite uses.
