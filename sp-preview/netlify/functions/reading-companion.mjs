import {getStore} from '@netlify/blobs';
import pack from '../../generated/reading-companion.json' with {type:'json'};
import {createPilotProvider} from '../../lib/ai-pilot/provider.mjs';
import {createPilotBudget} from '../../lib/ai-pilot/budget.mjs';
import {createReadingHandler} from '../../lib/reading-companion/handler.mjs';

// Credentials are server-only. Reuse the owner's existing provider credential;
// a dedicated override is optional and never returned to the browser.
export default async function handler(request,context){
 const env={...process.env,URL:context?.site?.url||process.env.URL,
  AI_PILOT_PROVIDER_KEY:process.env.AI_PILOT_PROVIDER_KEY||process.env.OPENAI_API_KEY};
 // Lazy dependencies: disabled/invalid requests never open the store or provider.
 const budget={reserve:input=>createPilotBudget({
  store:getStore({name:'ai-pilot-attempts',consistency:'strong'}),
  namespace:`${env.AI_PILOT_BUDGET_NAMESPACE}/reader`,dailyLimit:20,windowLimit:5,
 }).reserve(input)};
 const provider={generate:input=>createPilotProvider({apiKey:env.AI_PILOT_PROVIDER_KEY}).generate(input)};
 return createReadingHandler({env,pack,budget,provider})(request);
}
// Explicit TOML rewrite keeps the default function endpoint; no config.path.
