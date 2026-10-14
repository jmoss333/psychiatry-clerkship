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
