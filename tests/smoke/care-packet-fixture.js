// Explicit test-only opt-in for the aftercare packet (default OFF in production).
// Ordinary browser tests exercise the unmodified production default; only this fixture flips the literal
// in the served HTML, and it fails loudly if that literal ever stops being unique.
import { expect } from '@playwright/test';

export function enableCarePacketHtml(html) {
  const flag = 'var FD_CARE_PACKET_ENABLED=false;';
  expect(html.split(flag)).toHaveLength(2);
  return html.replace(flag, 'var FD_CARE_PACKET_ENABLED=true;');
}

export async function enableCarePacket(page) {
  await page.route(url => url.pathname === '/', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: enableCarePacketHtml(await response.text()) });
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
