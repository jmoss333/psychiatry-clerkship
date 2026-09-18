import {getStore} from '@netlify/blobs';
import {createOpenAIProvider} from '../../lib/openai-provider.mjs';
import {createPreviewBudget} from '../../lib/budget.mjs';
import {createHandler} from '../../lib/handler.mjs';

// Modern Fetch handler: every streamed request owns its provider work through
// completion/cancellation. No transcript/audio storage and no warm-instance Map.
export function runtimeEnvironment(environment,context) {
 // DEPLOY_ID is a build variable, not a Function runtime variable. The modern
 // trusted invocation context supplies the actual deploy identity.
 return {...environment,DEPLOY_ID:context?.deploy?.id,URL:context?.site?.url||environment.URL};
}
export function runtimeBudget(store,environment) {
 // Set once to the original production ledger. A deploy ID fallback would
 // silently reopen the allowance every time the room is updated.
 return createPreviewBudget({store,namespace:environment.DANA_PREVIEW_BUDGET_NAMESPACE,limit:680,windowLimit:340,startLimit:20});
}
export default async function handler(request,context) {
 try{
  const env=runtimeEnvironment(process.env,context);
  if(!env.DEPLOY_ID||env.DANA_PREVIEW_ENABLED!=='true')return Response.json({error:'preview_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
  const store=getStore({name:'dana-preview-attempts',consistency:'strong'});
  const budget=runtimeBudget(store,env);
  const provider=createOpenAIProvider({env,timeoutMs:30000});
  return await createHandler({env,provider,budget})(request);
 }catch{return Response.json({error:'preview_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
// Keep the default function endpoint available for the explicit TOML rewrite.
// Modern Functions with config.path disable that default endpoint; combining
// both mechanisms would rewrite our API to an endpoint that returns 404.
