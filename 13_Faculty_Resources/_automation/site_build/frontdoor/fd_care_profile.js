/* Care profile approval is independent of the editable build payload. No patient information is sent. */
var FD_CARE_PROFILE_FIELDS=['id','label','org','brandingApproved','unitName','unitPhone','unitPurpose','unitHours','callbackProgram','callbackTeam','callbackPhone','callbackHours','callbackFallback'];
function fdCareProfileDate(now){
  var parts,out={},i;
  if(typeof now!=='number'||!isFinite(now))return '';
  try{
    parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
    for(i=0;i<parts.length;i++)out[parts[i].type]=parts[i].value;
    return out.year+'-'+out.month+'-'+out.day;
  }catch(ignoreClockFailure){return '';}
}
function fdCareProfileDaysRemaining(expiresOn,now){
  var day=fdCareProfileDate(now),end=Date.parse(expiresOn+'T00:00:00Z');
  if(!day||!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn||'')||!isFinite(end)||new Date(end).toISOString().slice(0,10)!==expiresOn)return null;
  return Math.round((end-Date.parse(day+'T00:00:00Z'))/86400000);
}
function fdCareProfileReceipt(profile,receipt,now){
  var day=fdCareProfileDate(now),checked,i,key;
  if(!profile||!receipt||receipt.ok!==true||receipt.status!=='approved'||receipt.approver!=='Joshua Moss, MD'||!receipt.profile)return false;
  if(!/^[a-f0-9]{64}$/.test(profile.revision||'')||receipt.profileId!==profile.id||receipt.revision!==profile.revision||receipt.expiresOn!==profile.expiresOn)return false;
  if(!day||!/^\d{4}-\d{2}-\d{2}$/.test(receipt.expiresOn||'')||day>=receipt.expiresOn)return false;
  checked=Date.parse(receipt.checkedAt);
  if(!isFinite(checked)||checked>now+5000||now-checked>60000)return false;
  if(Object.keys(receipt.profile).length!==FD_CARE_PROFILE_FIELDS.length)return false;
  for(i=0;i<FD_CARE_PROFILE_FIELDS.length;i++){
    key=FD_CARE_PROFILE_FIELDS[i];
    if(!Object.prototype.hasOwnProperty.call(profile,key)||receipt.profile[key]!==profile[key])return false;
  }
  return true;
}
function fdCareProfileRequest(profile,fetcher){
  var send=fetcher||(typeof window!=='undefined'&&typeof window.fetch==='function'?window.fetch.bind(window):null);
  var unavailable={ok:false,status:'unavailable'},controller=typeof AbortController==='function'?new AbortController():null;
  if(!send||!profile||!/^[a-z0-9-]{1,40}$/.test(profile.id||'')||!/^[a-f0-9]{64}$/.test(profile.revision||''))return Promise.resolve(unavailable);
  return new Promise(function(resolve){
    var done=false,timer;
    function finish(value){if(done)return;done=true;clearTimeout(timer);resolve(value);}
    timer=setTimeout(function(){if(controller)controller.abort();finish(unavailable);},8000);
    try{
      Promise.resolve(send('https://clerkship-faculty-attest.netlify.app/.netlify/functions/care-profile-status?profileId='+encodeURIComponent(profile.id)+'&revision='+encodeURIComponent(profile.revision),
        {method:'GET',cache:'no-store',credentials:'omit',redirect:'error',signal:controller?controller.signal:undefined})).then(function(response){
          if(!response||!response.ok)return unavailable;
          return response.json();
        }).then(finish,function(){finish(unavailable);});
    }catch(ignoreNetworkFailure){finish(unavailable);}
  });
}
