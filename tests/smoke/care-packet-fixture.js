// Explicit test-only opt-in for the aftercare packet (default OFF in production).
// Ordinary browser tests exercise the unmodified production default; only this fixture flips the literal
// in the served HTML, and it fails loudly if that literal ever stops being unique.
import { expect } from '@playwright/test';
import fs from 'node:fs';

export const UNIT_PROFILE_FIXTURE = JSON.parse(fs.readFileSync(new URL('../fixtures/care-unit-profile.json', import.meta.url), 'utf8'));
export const PROFILE_AUTHORITY_URL = 'https://clerkship-faculty-attest.netlify.app/.netlify/functions/care-profile-status';
const PUBLIC_PROFILE_FIELDS = ['id', 'label', 'org', 'brandingApproved', 'unitName', 'unitPhone', 'unitPurpose', 'unitHours',
  'callbackProgram', 'callbackTeam', 'callbackPhone', 'callbackHours', 'callbackFallback'];

// This independent authority is a test fixture, never an approval field in the served candidate.
// The mutable verdict lets a test withdraw approval after Load without reloading the learner tab.
export async function pinCareProfileAuthority(page, { profiles = [UNIT_PROFILE_FIXTURE.profile, UNIT_PROFILE_FIXTURE.expired], status = 'approved' } = {}) {
  const authority = { status, requests: [] };
  await page.route(url => url.origin + url.pathname === PROFILE_AUTHORITY_URL, async route => {
    const request = route.request(), url = new URL(request.url());
    expect(request.method(), 'authority checks are reads').toBe('GET');
    expect([...url.searchParams.keys()].sort(), 'only profile identity and exact revision leave the page').toEqual(['profileId', 'revision']);
    expect(request.postData(), 'no patient information or editable profile fields are sent').toBeNull();
    const profileId = url.searchParams.get('profileId'), revision = url.searchParams.get('revision');
    expect(profileId).toMatch(/^[a-z0-9-]{1,40}$/);
    expect(revision).toMatch(/^[a-f0-9]{64}$/);
    authority.requests.push({ profileId, revision });
    const profile = profiles.find(item => item.id === profileId);
    const checkedAt = await page.evaluate(() => new Date().toISOString());
    const today = await page.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
    const verdict = !profile ? 'missing' : profile.revision !== revision ? 'changed' : today >= profile.expiresOn ? 'expired' : authority.status;
    const ok = verdict === 'approved';
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': request.headers().origin || new URL(page.url()).origin, 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok, status: verdict, profileId, revision, expiresOn: profile?.expiresOn || null, checkedAt,
        approver: ok ? 'Joshua Moss, MD' : null, profile: ok ? Object.fromEntries(PUBLIC_PROFILE_FIELDS.map(key => [key, profile[key]])) : null }) });
  });
  return authority;
}

export function enableCarePacketHtml(html) {
  const flag = 'var FD_CARE_PACKET_ENABLED=false;';
  expect(html.split(flag)).toHaveLength(2);
  return html.replace(flag, 'var FD_CARE_PACKET_ENABLED=true;');
}

export async function enableCarePacket(page) {
  await pinCareProfileAuthority(page);
  await page.route(url => url.pathname === '/', async route => {
    const response = await route.fetch();
    const html = enableCarePacketHtml(await response.text());
    const match = html.match(/var FD_CARE_INSERTS=(.*);\n/);
    expect(match, 'the packet fixture supplies candidates in the real payload').toBeTruthy();
    const payload = JSON.parse(match[1]);
    payload.unitProfiles = [UNIT_PROFILE_FIXTURE.profile, UNIT_PROFILE_FIXTURE.expired];
    await route.fulfill({ response, body: html.replace(match[0], () => 'var FD_CARE_INSERTS=' + JSON.stringify(payload) + ';\n') });
  });
}

// 20 aftercare listings plus 3 peer-support ones, enough to cross the 12-listing cap and to group.
export function packetFeed(base) {
  const records = Array.from({ length: 20 }, (_, i) => ({ ...base.records[i % base.records.length],
    id: 'p-' + i, name: 'Example Support ' + String(i + 1).padStart(2, '0'), category: 'aftercare',
    phone: '207-700-0123', contactHref: 'tel:2077000123', website: 'https://example.org/', verificationRequired: false }));
  records.push(...Array.from({ length: 3 }, (_, i) => ({ ...records[0], id: 'peer-' + i, category: 'peer_support',
    name: 'Example Peer Group ' + (i + 1) })));
  const count = id => records.filter(r => r.category === id).length;
  return { ...base, records, categories: base.categories.map(c => ({ ...c, count: count(c.id) })) };
}

// A directory of eight listings across five categories by default, for the print tests (`count` takes 1 to 12, the packet's
// limit, and the extra four keep to the same five categories). `long` gives each a description near the feed's 420-character
// cut, which is what makes pages fill; the default is a short realistic one. details/verifiedDate/reviewAfter carry sentinels
// that must never reach a sheet. Phones and addresses are placeholders; no crisis number appears. Every listing matches the
// search "southern maine" (its area), so "Add all results (count)" adds all of them.
const SHORT_DESCRIPTION = 'Counseling and medication follow-up for adults leaving the hospital. Intake within a week.';
const LONG_DESCRIPTION = 'Outpatient counseling and medication follow-up for adults leaving the hospital. Appointments are offered within seven days of discharge, including evenings. Telehealth visits are available for people without transportation, and staff can help with insurance questions, prior authorization and finding a pharmacy close to home. Walk-in intake is open weekday mornings.';
export const PRINT_LISTINGS = [
  ['aftercare', 'Harbor Counseling Center'], ['aftercare', 'Casco Bay Outpatient Care'], ['aftercare', 'Southern Maine Wellness Clinic'],
  ['peer_support', 'Harbor Peer Recovery Center'], ['peer_support', 'Warmline Peer Support'], ['basic_needs', 'York County Community Ride'],
  ['recovery_meetings', 'SMART Recovery Maine'], ['community_services', 'Southern Maine Benefits Navigation'],
];
const MORE_LISTINGS = [
  ['aftercare', 'Riverside Counseling Group'], ['peer_support', 'Lighthouse Peer Center'], ['basic_needs', 'Coastal Food Pantry'],
  ['community_services', 'Portland Housing Navigation'],
];
export function printFeed(base, { long = false, hostile = false, count = PRINT_LISTINGS.length } = {}) {
  const all = PRINT_LISTINGS.concat(MORE_LISTINGS);
  if (!(Number.isInteger(count) && count >= 1 && count <= all.length)) throw new Error(`printFeed: count must be 1 to ${all.length}`);
  const records = all.slice(0, count).map(([category, name], i) => ({
    id: 'r-' + i, category,
    name: hostile ? name + ' ' + 'N'.repeat(170 - name.length) : name,
    description: hostile ? LONG_DESCRIPTION + ' ' + LONG_DESCRIPTION.slice(0, 140) : (long ? LONG_DESCRIPTION : SHORT_DESCRIPTION),
    details: 'SENTINEL-DETAILS-7f3a', area: hostile ? 'Southern Maine and the surrounding counties, including rural and island communities' : 'Southern Maine',
    regions: ['Southern Maine'], phone: hostile ? '207-555-01' + String(i).padStart(2, '0') + ' ext. 4 (' + 'weekdays '.repeat(14) + ')' : '207-555-01' + String(i).padStart(2, '0'),
    contactHref: 'tel:20755501' + String(i).padStart(2, '0'),
    website: hostile ? 'https://' + 'a'.repeat(60) + '.example.org/programs/' + 'b'.repeat(80) : 'https://example.org/resources/' + (i + 1),
    verifiedDate: '2031-02-03', reviewAfter: '2032-04-05', verificationRequired: false,
  }));
  const inCategory = id => records.filter(r => r.category === id).length;
  return { ...base, records, categories: base.categories.map(c => ({ ...c, available: true, count: inCategory(c.id) })) };
}
