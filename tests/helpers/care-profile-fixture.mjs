// Synthetic authority response. The production service constructs this from its own approved candidate.
export const PUBLIC_PROFILE_FIELDS = ['id','label','org','brandingApproved','unitName','unitPhone','unitPurpose','unitHours',
  'callbackProgram','callbackTeam','callbackPhone','callbackHours','callbackFallback'];
export function profileReceipt(profile, now = Date.now()) {
  return {ok:true,status:'approved',profileId:profile.id,revision:profile.revision,expiresOn:profile.expiresOn,
    checkedAt:new Date(now).toISOString(),approver:'Joshua Moss, MD',
    profile:Object.fromEntries(PUBLIC_PROFILE_FIELDS.map(key => [key,profile[key]]))};
}
