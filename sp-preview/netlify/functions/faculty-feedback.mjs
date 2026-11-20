import {getStore} from '@netlify/blobs';
import {createFacultyFeedbackHandler,FACULTY_FEEDBACK_STORE} from '../../lib/faculty-feedback.mjs';
import {runtimeEnvironment} from './dana-preview.mjs';

export default async function handler(request,context){
 try{
  const env=runtimeEnvironment(process.env,context);
  if(!env.DEPLOY_ID||env.DANA_PREVIEW_ENABLED!=='true')throw new Error('unavailable');
  const store=getStore({name:FACULTY_FEEDBACK_STORE,consistency:'strong'});
  return await createFacultyFeedbackHandler({env,store})(request);
 }catch{
  return Response.json({error:'feedback_unavailable'},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
 }
}
// The explicit /api/faculty-feedback rewrite retains the default function path.
