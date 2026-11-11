// Ratchet from the 2026-11-10 clinical-claims audit.
//
// ROOT CAUSE IT TARGETS. A question's `evidence` field often QUOTES the page it teaches from. When a
// remediation PR rewrites the page (the lithium/suicide hedge, the Stanley 45% figure), nothing re-opens
// the questions that quote the old sentence: the item's attestation hash covers the item, not the page.
// On 2026-11-10 that is how qb_rel_007 still "quoted" brief_psychotherapy.md as saying ~50% after the
// page said ~45%, and qb_mood_007 / qb_pha_005 still quoted lithium sentences the pages no longer contain.
//
// WHAT IT MEASURES. Live items whose evidence carries a quote-length passage (>= 12 words after the dash)
// attributed to shipped page slug(s), where under 25% of the passage's 8-word windows occur in those
// pages' current source. Topical pointers ("t_anxiety.md -- Exam treatment anchors: ...") are short and
// are not counted. The count is PINNED in qbank-page-quote-drift.baseline.json: a rise fails, a fall
// prints a note. It does not judge clinical content and reads no attestation state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
let ROOT = HERE;
while (!fs.existsSync(path.join(ROOT, 'question_bank.json'))) { const up = path.dirname(ROOT); if (up === ROOT) throw new Error('repo root not found'); ROOT = up; }
const OVERLAY = process.env.CLERKSHIP_OVERLAY || '';
const read = rel => { const o = OVERLAY && path.join(OVERLAY, rel); return fs.readFileSync(o && fs.existsSync(o) ? o : path.join(ROOT, rel), 'utf8'); };
const words = s => s.toLowerCase().replace(/≥/g, ' greater than or equal to ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
export function drifted() {
  const sp = JSON.parse(read('13_Faculty_Resources/_automation/site_build/shipped_pages.json'));
  const src = Object.fromEntries((Array.isArray(sp) ? sp : sp.pages).filter(p => p.source).map(p => [p.slug, p.source]));
  const cache = {};
  const page = slug => (cache[slug] ??= src[slug] ? ' ' + words(read(src[slug])).join(' ') + ' ' : null);
  const out = []; let quoted = 0;
  for (const it of JSON.parse(read('question_bank.json')).items) {
    if (it.retired === true || typeof it.evidence !== 'string') continue;
    const slugs = [...new Set(it.evidence.match(/[A-Za-z0-9_.-]+\.md(?![A-Za-z0-9_.-])/g) || [])].filter(page);
    const body = it.evidence.includes('—') ? it.evidence.slice(it.evidence.indexOf('—') + 1) : '';
    const w = words(body.replace(/[A-Za-z0-9_.-]+\.md/g, ' '));
    if (!slugs.length || w.length < 12) continue;
    quoted++;
    const text = slugs.map(page).join(' ');
    let hit = 0, tot = 0;
    for (let i = 0; i + 8 <= w.length; i++) { tot++; if (text.includes(' ' + w.slice(i, i + 8).join(' ') + ' ')) hit++; }
    if (tot && hit / tot < 0.25) out.push({ id: it.id, overlap: +(hit / tot).toFixed(2), evidence: it.evidence.slice(0, 110) });
  }
  return { quoted, out };
}
test('question evidence that quotes a page still matches that page (ratchet: the count may only fall)', () => {
  const { quoted, out } = drifted();
  assert.ok(quoted >= 50, `only ${quoted} quote-length evidence fields found -- refusing to pass over nothing`);
  const pin = JSON.parse(fs.readFileSync(path.join(HERE, 'qbank-page-quote-drift.baseline.json'), 'utf8')).max;
  if (out.length < pin) console.log(`note: page-quote drift improved ${pin} -> ${out.length}; lower "max" in qbank-page-quote-drift.baseline.json to lock it in`);
  assert.ok(out.length <= pin, `${out.length} live questions quote page text the page no longer contains (pin ${pin}):\n  ` + out.map(o => `${o.id} (${o.overlap}) ${o.evidence}`).join('\n  '));
});
if (process.argv.includes('--list')) { const { quoted, out } = drifted(); console.log(JSON.stringify({ quoted, drifted: out.length, items: out }, null, 1)); }
