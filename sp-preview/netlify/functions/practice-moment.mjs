import {getStore} from '@netlify/blobs';
import {createOpenAIProvider} from '../../lib/openai-provider.mjs';
import {createMomentHandler} from '../../lib/moments/handler.mjs';
import {runtimeEnvironment,runtimeBudget} from './dana-preview.mjs';
export default async function handler(request,context){
 try{
  const env=runtimeEnvironment(process.env,context);
  if(!env.DEPLOY_ID||env.DANA_PREVIEW_ENABLED!=='true')return Response.json({error:'preview_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
  const budget=runtimeBudget(getStore({name:'dana-preview-attempts',consistency:'strong'}),env);
  return await createMomentHandler({env,budget,provider:createOpenAIProvider({env,timeoutMs:30000})})(request);
 }catch{return Response.json({error:'preview_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
