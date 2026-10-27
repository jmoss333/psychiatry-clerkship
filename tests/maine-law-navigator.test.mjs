// Maine law & capacity navigator (WP-F7-nav, 2026-10-27).
//
// Legal content is only as good as its citations, so these pins read the two committed sources
// and hold the contract the plan set: every statute card links the official Revisor page and
// carries its extraction date; the markdown never puts statutes under `## References` (the
// citation gate requires a DOI/PMID there, and statutes have neither); both surfaces carry the
// same not-legal-advice banner; the tool stores nothing and fetches nothing. Committed files
// only — no live governance state, no _build reads.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const MD = read('03_Core_Topics/Ethics_Legal/maine_law_capacity_navigator.md');
const HTML = read('03_Core_Topics/Ethics_Legal/maine-law-navigator.html');
const BANNER = 'Educational summary — not legal advice — hospital policy and counsel govern.';
const OFFICIAL = /^https:\/\/legislature\.maine\.gov\/statutes\/[0-9A-Z-]+\/title[0-9A-Z-]+sec[0-9A-Z-]+\.html$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function toolData() {
  const m = HTML.match(/<script type="application\/json" id="mln-data">([\s\S]*?)<\/script>/);
  assert.ok(m, 'the navigator embeds its data inline as application/json');
  return JSON.parse(m[1]);
}

test('the tool opens with the CLERKSHIP-META header and titles itself', () => {
  assert.match(HTML, /^<!DOCTYPE html>\s*<html[^>]*>\s*<head>\s*<!-- \[CLERKSHIP-META v1\] tool="Maine Law Navigator"/);
  assert.match(HTML, /<h1>Maine Law Navigator<\/h1>/);
});

test('every statute card cites an official Revisor URL, an extraction date and a short excerpt', () => {
  const data = toolData();
  assert.match(data.verifiedOn, ISO);
  const cards = Object.entries(data.statutes);
  assert.ok(cards.length >= 10, 'the navigator carries its statute cards');
  for (const [id, s] of cards) {
    assert.match(s.url, OFFICIAL, `${id}: url must be the official legislature.maine.gov page`);
    assert.match(s.extractedOn, ISO, `${id}: extractedOn must be an ISO date`);
    assert.ok(s.cite && s.title && s.meaning, `${id}: cite, title and meaning are required`);
    assert.ok(s.excerpt && s.excerpt.length <= 600, `${id}: excerpt present and short`);
    const sentences = s.excerpt.split(/(?<=[.;:])\s+(?=[A-Z(])/).filter((x) => /[.]$/.test(x));
    assert.ok(sentences.length <= 2, `${id}: excerpt is at most two sentences`);
  }
});

test('every question resolves to a pathway and every pathway cites known statute cards', () => {
  const data = toolData();
  assert.ok(data.questions.length >= 5 && data.questions.length <= 12);
  for (const q of data.questions) assert.ok(data.pathways[q.pathway], `${q.id} → ${q.pathway}`);
  for (const [pid, p] of Object.entries(data.pathways)) {
    assert.ok(p.statutes.length > 0, `${pid} cites at least one statute`);
    for (const sid of p.statutes) assert.ok(data.statutes[sid], `${pid} → unknown statute ${sid}`);
    assert.ok(p.pitfalls.length > 0, `${pid} names a pitfall`);
  }
});

test('the markdown keeps statutes out of a References list and links only official pages', () => {
  assert.doesNotMatch(MD, /^##\s+References\b/m, 'statutes must not sit under ## References');
  assert.match(MD, /^## Statutes and official sources$/m);
  const section = MD.split(/^## Statutes and official sources$/m)[1];
  const urls = section.match(/https:\/\/\S+/g) || [];
  assert.ok(urls.length >= 10, 'the sources section lists the statutes');
  for (const u of urls) assert.match(u, OFFICIAL);
  assert.match(section, /2026-10-26/, 'the date the statutes were read is recorded');
  assert.match(section, /extracted on 10\/05\/2026/, 'the Revisor extraction date is recorded');
});

test('both surfaces carry the not-legal-advice banner', () => {
  assert.ok(MD.includes(BANNER), 'markdown banner');
  assert.ok(HTML.includes(BANNER), 'tool banner');
});

test('the tool stores nothing, fetches nothing and keeps to the no-dose rule', () => {
  assert.doesNotMatch(HTML, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(HTML, /\bfetch\s*\(/);
  assert.doesNotMatch(HTML, /<textarea|<input[^>]*type="text"/i);
  for (const src of [HTML, MD]) assert.doesNotMatch(src, /\b\d+(\.\d+)?\s?(mg|mcg|µg|g\/kg|mg\/kg|units?)\b/i);
});

test('duty-to-warn text stays within what the Maine statute says', () => {
  assert.match(MD, /we have not verified Maine case law/);
  assert.match(HTML, /not settled by the text alone/);
});
