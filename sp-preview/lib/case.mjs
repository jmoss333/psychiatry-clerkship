import pack from '../../_prototypes/sp-interview/sp-interview.pack.json' with {type:'json'};
import localDana from '../../_prototypes/sp-interview/sp-interview.local-dana.js';
import {createContext} from '../../_prototypes/sp-interview/dana-live-context.mjs';
import {hash} from './state.mjs';
export const dana=localDana.applyCase(pack.cases.find(item=>item.id==='sp_depression_gated_si_001'));
export const caseBinding=hash(JSON.stringify(dana));
// Check source drift during startup, before accepting any paid request.
createContext(dana,[],[{who:'pt',text:dana.persona.opening,playbackStatus:'pending'}]);
