const API='/.netlify/functions/care-profile-approvals';
const KEY='care_profile_owner_key';
const APPROVER='Joshua Moss, MD';
export function createOwnerReview({fetchImpl=globalThis.fetch,storage,onChange=()=>{}}={}) {
  let key='',generation=0;
  try{key=storage?.getItem(KEY)||'';}catch{}
  const state={unlocked:!!key,busy:false,profiles:null,notice:''};
  const publish=()=>onChange(state);
  async function request(method,body) {
    const response=await fetchImpl(API,{method,cache:'no-store',headers:{'x-care-profile-owner-key':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();
    if(!response.ok || data.ok!==true) throw Error(response.status===503?'Owner approval is unavailable. Enrollment or service setup is incomplete.':response.status===401?'The personal owner credential was not accepted.':'The saved state changed or could not be checked. Reload before deciding.');
    return data;
  }
  function lock(){generation++;key='';Object.assign(state,{unlocked:false,busy:false,profiles:null,notice:''});try{storage?.removeItem(KEY);}catch{}publish();}
  async function load(){
    const run=++generation;Object.assign(state,{busy:true,profiles:null,notice:''});publish();
    try{const data=await request('GET');if(run!==generation)return;
      if(data.approver!==APPROVER || !Array.isArray(data.profiles) || data.profiles.some(r=>!r.profile?.id || !/^[a-f0-9]{64}$/.test(r.revision) || !/^[a-f0-9]{40}$/.test(r.sourceCommit) || !r.authority))throw Error('The review response is incomplete. Reload before deciding.');
      state.profiles=data.profiles;
      if(!data.profiles.length)state.notice='No unit profiles are set up. Nothing has been approved.';
    }catch(error){if(run===generation)state.notice=error.message;}
    finally{if(run===generation){state.busy=false;publish();}}
  }
  async function unlock(value){key=value;state.unlocked=!!key;try{storage?.setItem(KEY,key);}catch{}return load();}
  async function decide(id,action,reviewed){
    const row=state.profiles?.find(r=>r.profile.id===id);
    if(state.busy || !row || !['approve','suspend','revoke'].includes(action) || action==='approve' && reviewed!==true)throw Error('Review this exact profile before approving.');
    if(action!=='approve' && !row.authority.version)throw Error('There is no approval to withdraw.');
    const revision=action==='approve'?row.revision:row.authority.revision;
    const body={action,profileId:id,revision,expectedVersion:row.authority.version,expectedSourceCommit:row.sourceCommit};
    const run=++generation;Object.assign(state,{busy:true,profiles:null,notice:''});publish();
    try{const saved=await request('POST',body);if(run!==generation)return;
      const expected=action==='approve'?'approved':action==='suspend'?'suspended':'revoked';
      if(saved.profileId!==id || saved.revision!==revision || saved.status!==expected || saved.approver!==APPROVER || typeof saved.version!=='string')throw Error('The decision receipt could not be checked. Reload before deciding.');
      state.notice=`Profile ${expected}. Reload to see the current saved state.`;
    }catch(error){if(run===generation)state.notice=error.message+' Reload before deciding.';}
    finally{if(run===generation){state.busy=false;publish();}}
  }
  return {state,unlock,load,lock,decide};
}

export function mountOwnerReview(document,storage,fetchImpl=globalThis.fetch){
  const root=document.querySelector('#care-profile-review');
  if(!root)return null;
  function el(tag,text,attrs={}){const n=document.createElement(tag);if(text!=null)n.textContent=String(text);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;}
  function data(value){
    if(Array.isArray(value)){const n=el('ul');for(const item of value){const li=el('li');li.append(data(item));n.append(li);}return n;}
    if(value&&typeof value==='object'){const n=el('dl');for(const [key,valuePart]of Object.entries(value)){const dd=el('dd');dd.append(data(valuePart));n.append(el('dt',key.replace(/([a-z])([A-Z])/g,'$1 $2')),dd);}return n;}
    return el('span',value===null?'None':typeof value==='boolean'?(value?'Yes':'No'):value);
  }
  const client=createOwnerReview({storage,fetchImpl,onChange:render});
  function render(){
    const state=client.state;root.replaceChildren(el('h1','Unit profile approvals'),el('p','Joshua Moss, MD reviews the exact unit details and their verification records. This page contains no patient information.'));
    root.setAttribute('aria-busy',String(state.busy));
    const notice=el('p',state.notice,{role:'status','aria-live':'polite'});root.append(notice);
    if(!state.unlocked){
      const form=el('form'),input=el('input',null,{id:'owner-key',type:'password',autocomplete:'current-password',required:''});
      form.append(el('label','Personal owner credential',{for:'owner-key'}),input,el('button','Open profile reviews',{type:'submit'}));
      form.addEventListener('submit',event=>{event.preventDefault();void client.unlock(input.value);});root.append(form,el('p','Use the personal owner credential. The shared faculty key cannot approve profiles. The credential stays in this tab until it is locked or closed.'));return;
    }
    const reload=el('button','Reload profiles',{type:'button'});reload.disabled=state.busy;reload.addEventListener('click',()=>void client.load());
    const lock=el('button','Lock',{type:'button'});lock.addEventListener('click',client.lock);root.append(reload,lock);
    for(const row of state.profiles||[]){
      const section=el('section'),check=el('input',null,{type:'checkbox',id:'review-'+row.profile.id});
      section.append(el('h2',row.profile.label),el('p','Saved status: '+row.authority.status),el('p','Expires at the start of '+row.expiresOn+' in America/New_York.'),data(row.profile),el('p','Exact revision: '+row.revision,{class:'revision'}));
      if(row.authority.revision && row.authority.revision!==row.revision)section.append(el('p','Previous approval covered a different revision: '+row.authority.revision,{class:'revision'}));
      const label=el('label',null,{for:check.id||'review-'+row.profile.id});label.append(check,el('span',' I reviewed these exact details and the actual verification records, including any callback and branding claims.'));
      const approve=el('button','Approve exact version',{type:'button'});approve.disabled=true;check.addEventListener('change',()=>{approve.disabled=!check.checked;});
      approve.addEventListener('click',()=>void client.decide(row.profile.id,'approve',check.checked));section.append(label,approve);
      if(row.authority.version)for(const [action,title]of [['suspend','Suspend approval'],['revoke','Revoke approval']]){const b=el('button',title,{type:'button'});b.addEventListener('click',()=>void client.decide(row.profile.id,action,false));section.append(b);}
      root.append(section);
    }
  }
  render();return client;
}
if(typeof document!=='undefined'){let storage;try{storage=globalThis.sessionStorage;}catch{}mountOwnerReview(document,storage);}
