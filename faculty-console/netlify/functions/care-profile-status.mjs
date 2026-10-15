import {routeProduction} from '../../care-profile-service.mjs';
export default async function handler(request,context) {return routeProduction(request,'status',context);}
