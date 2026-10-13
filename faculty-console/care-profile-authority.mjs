// Care-profile approval is separate from editable profile facts and the shared faculty key.
import {createHash, createHmac, timingSafeEqual} from 'node:crypto';

export const APPROVER = 'Joshua Moss, MD';
export const PRINCIPAL = 'joshua-moss';
export const PUBLIC_FIELDS = Object.freeze(['id','label','org','brandingApproved','unitName','unitPhone',
  'unitPurpose','unitHours','callbackProgram','callbackTeam','callbackPhone','callbackHours','callbackFallback']);
export const PROFILE_PATH = '13_Faculty_Resources/_automation/site_build/data/care-unit-profiles.v1.json';
export const PROFILE_ID = /^[a-z0-9-]{1,40}$/;
export const REVISION = /^[a-f0-9]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export class AuthorityError extends Error {
  constructor(status, code) {super(code);this.status=status;this.code=code;}
}
export function requireThat(condition, status=503, code='authority-unavailable') {
  if(!condition) throw new AuthorityError(status,code);
}
export function exactKeys(value, keys) {
  return record(value) && Object.keys(value).length===keys.length && keys.every(k=>Object.hasOwn(value,k));
}
export function canonicalJson(value) {
  if(value===null || typeof value==='string' || typeof value==='boolean') return JSON.stringify(value);
  if(Number.isSafeInteger(value)) return String(value);
  if(Array.isArray(value)) return '['+value.map(canonicalJson).join(',')+']';
  if(record(value)) return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(value[k])).join(',')+'}';
  throw new AuthorityError(503,'invalid-profile');
}
export function publicProfile(profile) {
  return Object.fromEntries(PUBLIC_FIELDS.map(field=>[field,profile[field]]));
}
export function profileRevision(profile) {
  const covered={...publicProfile(profile),verification:profile.verification.map(v=>({...v})).sort((a,b)=>a.field.localeCompare(b.field,'en'))};
  return createHash('sha256').update(canonicalJson({policyVersion:1,profile:covered})).digest('hex');
}
export function parseDate(value) {
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date=new Date(value+'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value ? date : null;
}
export function newYorkDate(value) {
  const date=new Date(value);requireThat(Number.isFinite(date.getTime()));
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function expiresOn(profile) {
  const oldest=profile.verification.map(v=>v.checkedOn).sort()[0], date=parseDate(oldest);
  requireThat(date!==null,503,'invalid-profile');
  date.setUTCDate(date.getUTCDate()+90);
  return date.toISOString().slice(0,10);
}
export function validateProfile(profile, now) {
  requireThat(exactKeys(profile,[...PUBLIC_FIELDS,'verification']),503,'invalid-profile');
  requireThat(PROFILE_ID.test(profile.id) && typeof profile.brandingApproved==='boolean' && typeof profile.callbackProgram==='boolean',503,'invalid-profile');
  for(const field of PUBLIC_FIELDS.filter(k=>!['org','brandingApproved','callbackProgram'].includes(k))) {
    requireThat(typeof profile[field]==='string' && profile[field].length<=500 && !CONTROL.test(profile[field]) && !/[<>]/.test(profile[field]),503,'invalid-profile');
  }
  for(const field of ['label','unitName','unitPhone','unitPurpose','unitHours']) requireThat(profile[field].trim().length>0,503,'invalid-profile');
  requireThat(profile.brandingApproved ? typeof profile.org==='string' && profile.org.trim().length>0 && profile.org.length<=120 && !CONTROL.test(profile.org) && !/[<>]/.test(profile.org) : profile.org===null,503,'invalid-profile');
  for(const field of ['callbackTeam','callbackPhone','callbackHours','callbackFallback']) requireThat(profile.callbackProgram ? profile[field].trim().length>0 : profile[field]==='',503,'invalid-profile');
  const groups=['identity','contact',...(profile.callbackProgram?['callback']:[]),...(profile.brandingApproved?['branding']:[])].sort();
  requireThat(Array.isArray(profile.verification) && profile.verification.length===groups.length,503,'invalid-profile');
  const today=newYorkDate(now);
  for(const v of profile.verification) {
    requireThat(exactKeys(v,['field','checkedOn','checkedBy','evidence']),503,'invalid-profile');
    requireThat(groups.includes(v.field) && parseDate(v.checkedOn)!==null && v.checkedOn>='2026-01-01' && v.checkedOn<=today,503,'invalid-profile');
    for(const k of ['checkedBy','evidence']) requireThat(typeof v[k]==='string' && v[k].trim().length>0 && v[k].length<=2000 && !CONTROL.test(v[k]),503,'invalid-profile');
  }
  requireThat(new Set(profile.verification.map(v=>v.field)).size===groups.length,503,'invalid-profile');
  return profile;
}
export function secretEqual(a,b) {
  if(typeof a!=='string' || typeof b!=='string' || !a || a.length>4096 || !b) return false;
  return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
}
const ENVELOPE_FIELDS=['schemaVersion','profileId','revision','status','version','approvedAt','changedAt','principal','expiresOn','sourceCommit'];
export function signAuthority(value,secret) {
  requireThat(exactKeys(value,ENVELOPE_FIELDS));
  return {...value,signature:createHmac('sha256',secret).update('care-profile-authority/v1\n'+canonicalJson(value)).digest('hex')};
}
export function verifyAuthority(value,secret) {
  requireThat(exactKeys(value,[...ENVELOPE_FIELDS,'signature']));
  const {signature,...unsigned}=value;
  requireThat(value.schemaVersion===1 && PROFILE_ID.test(value.profileId) && REVISION.test(value.revision)
    && ['approved','suspended','revoked'].includes(value.status) && value.principal===PRINCIPAL
    && /^[a-f0-9-]{36}$/.test(value.version) && /^[a-f0-9]{40}$/.test(value.sourceCommit)
    && parseDate(value.expiresOn)!==null && Number.isFinite(Date.parse(value.approvedAt))
    && Number.isFinite(Date.parse(value.changedAt)) && value.changedAt>=value.approvedAt
    && secretEqual(signature,signAuthority(unsigned,secret).signature));
  return value;
}
