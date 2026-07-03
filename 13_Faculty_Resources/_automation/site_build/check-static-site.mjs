#!/usr/bin/env node
/**
 * check-static-site.mjs — Sprint-0 static QA harness
 * Satisfies audit Issue 1 (static deploy integrity) + feature-spec Definition of Done.
 * No dependencies. Node 18+.
 *
 * Usage:
 *   node check-static-site.mjs <siteDir>
 *   node check-static-site.mjs _build/ms3       # after build_deploy.py
 *   node check-static-site.mjs _build/res       # after resident_section.py
 *   STRICT=1 node check-static-site.mjs <dir>   # metadata/review coverage gaps also fail
 *
 * CI: invoked by build_and_check.sh (both Netlify site build commands) after the build;
 * a non-zero exit fails the Netlify build, so HARD findings block the deploy.
 *
 * Exit codes: 0 = pass, 1 = hard failures (see HARD FAILURES section).
 *
 * HARD failures (always non-zero):
 *   - invalid JSON in any *.json
 *   - nav.json references a missing content/tool file
 *   - search-index references a missing file
 *   - a dose literal in any tools/*.html or *.pack.json   (e.g. "5 mg")
 *   - a non-cw_-prefixed localStorage key in any tools/*.html
 *   - a tool HTML missing [RC-META], <title>, or viewport meta
 *   - a *.pack.json whose choiceBank tokenId is not defined in localPolicies
 * SOFT findings (warn; fail only under STRICT=1):
 *   - nav markdown files missing from topic_meta.json
 *   - nav items missing from reviewed.json
 *   - orphan tools/content not referenced by nav
 *   - LOCAL_POLICY tokens still unfilled (value:null)  [reported, never fails]
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const SITE = process.argv[2];
if (!SITE) { console.error('usage: node check-static-site.mjs <siteDir>'); process.exit(1); }
const STRICT = process.env.STRICT === '1';
const hard = [], soft = [], info = [];
const H = (m) => hard.push(m);
const S = (m) => soft.push(m);
const I = (m) => info.push(m);

const p = (...a) => join(SITE, ...a);
const readJSON = (f) => JSON.parse(readFileSync(f, 'utf8'));
const listHtml = (dir) => existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.html')) : [];
const DOSE = /\b\d+(?:\.\d+)?\s?(?:mg|mcg|mL|mg\/kg)\b/i;

if (!existsSync(SITE)) { console.error(`Site dir not found: ${SITE}`); process.exit(1); }

/* ---------- 1. JSON validity ---------- */
const jsonFiles = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const fp = join(d, f);
    const st = statSync(fp);
    if (st.isDirectory()) { if (!/node_modules|\.netlify|\.git/.test(fp)) walk(fp); }
    else if (f.endsWith('.json')) jsonFiles.push(fp);
  }
})(SITE);
const parsed = {};
for (const f of jsonFiles) {
  try { parsed[f] = readJSON(f); }
  catch (e) { H(`Invalid JSON: ${f.replace(SITE, '.')} — ${e.message}`); }
}

/* ---------- 2. nav.json target existence + collect nav sets ---------- */
let navMd = new Set(), navTools = new Set(), navItems = 0;
const navPath = p('nav.json');
if (existsSync(navPath) && parsed[navPath]) {
  for (const sec of parsed[navPath]) {
    for (const it of (sec.items || [])) {
      navItems++;
      if (it.k === 'md') { navMd.add(it.f); if (!existsSync(p('content', it.f))) H(`nav → missing content file: ${it.f}`); }
      else if (it.k === 'tool') { navTools.add(it.f); if (!existsSync(p('tools', it.f))) H(`nav → missing tool file: ${it.f}`); }
    }
  }
} else S('nav.json not found or unparsable (skipping nav checks)');

/* ---------- 3. search-index targets ---------- */
const siPath = p('search-index.json');
if (existsSync(siPath) && parsed[siPath]) {
  const docs = Array.isArray(parsed[siPath]) ? parsed[siPath] : (parsed[siPath].docs || []);
  for (const d of docs) {
    const f = d.f || d.file || d.path;
    if (!f) continue;
    const target = f.endsWith('.html') ? p('tools', f) : p('content', f);
    if (!existsSync(target) && !existsSync(p(f))) H(`search-index → missing target: ${f}`);
  }
}

/* ---------- 4. orphans, metadata coverage, review coverage ---------- */
const contentFiles = existsSync(p('content')) ? readdirSync(p('content')).filter(f => f.endsWith('.md')) : [];
const toolFiles = listHtml(p('tools'));
for (const f of contentFiles) if (navMd.size && !navMd.has(f)) S(`orphan content (not in nav): ${f}`);
for (const f of toolFiles) if (navTools.size && !navTools.has(f)) S(`orphan tool (not in nav): ${f}`);

const tmPath = p('topic_meta.json');
if (existsSync(tmPath) && parsed[tmPath]) {
  const meta = parsed[tmPath];
  for (const f of navMd) if (f && !(f in meta)) S(`metadata missing (topic_meta): ${f}`);
}
const rvPath = p('reviewed.json');
if (existsSync(rvPath) && parsed[rvPath]) {
  const rev = parsed[rvPath];
  for (const f of [...navMd, ...navTools]) if (f && !(f in rev)) S(`review status missing (reviewed.json): ${f}`);
}

/* ---------- 5. per-tool HTML checks (RC-META, title, viewport, dose, storage) ---------- */
for (const f of toolFiles) {
  const html = readFileSync(p('tools', f), 'utf8');
  if (!/\[RC-META\]/.test(html)) S(`tool missing [RC-META]: ${f}`);
  if (!/<title>/i.test(html)) H(`tool missing <title>: ${f}`);
  if (!/name=["']viewport["']/i.test(html)) H(`tool missing viewport meta: ${f}`);
  // Dose-literal rule scope: HARD for the new education/trainer layer (rp-*, *-trainer)
  // that must never read like an order set; SOFT elsewhere (validated instruments like
  // BFCRS/CIWA legitimately carry standard doses). A reviewed file may opt out of the
  // soft warning with a `QA-ALLOW-DOSE` comment marker.
  const doseHard = /^rp-/.test(f) || /-trainer\.html$/.test(f);
  const doseAllow = /QA-ALLOW-DOSE/.test(html);
  html.split('\n').forEach((line, i) => {
    if (!DOSE.test(line)) return;
    const msg = `dose literal in ${f}:${i + 1} → "${line.trim().slice(0, 70)}"`;
    if (doseHard) H(msg); else if (!doseAllow) S(msg + ' (validated-instrument? add QA-ALLOW-DOSE or route to LOCAL_POLICY)');
  });
  // Sanctioned localStorage namespaces: cw_* (shared hub) and rp_* (resident platform).
  const keys = [...html.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  for (const k of keys) if (!k.startsWith('cw_') && !k.startsWith('rp_')) H(`non-namespaced storage key in ${f}: "${k}" (use cw_* or rp_*)`);
}

/* ---------- 5b. <video> embeds must resolve to a shipped asset (no broken players) ---------- */
// content/*.md is rendered by the SPA at the site ROOT; tools/*.html is served at its own path.
const VIDEO_SRC = /<video\b[^>]*\bsrc=["']([^"']+)["'][^>]*>|<source\b[^>]*\bsrc=["']([^"']+)["']/gi;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg|ogv)$/i;
// md is rendered by the SPA at the site ROOT (media/x → SITE/media/x); tools are served from
// tools/ (../media/x → SITE/media/x — join() normalizes the ..). Query/hash stripped first.
const resolveMedia = (isMd, src) => {
  const clean = src.replace(/[?#].*$/, '');
  return isMd ? p(clean.replace(/^\.?\//, '')) : p('tools', clean);
};
for (const [dir, files] of [['content', contentFiles], ['tools', toolFiles]]) {
  const isMd = dir === 'content';
  for (const f of files) {
    for (const m of readFileSync(p(dir, f), 'utf8').matchAll(VIDEO_SRC)) {
      const src = m[1] || m[2];
      if (!src || !VIDEO_EXT.test(src.replace(/[?#].*$/, ''))) continue;
      if (!existsSync(resolveMedia(isMd, src)))
        H(`broken <video> in ${dir}/${f} → missing asset: ${src}  (export it or let the media guard strip the embed)`);
    }
  }
}

/* ---------- 6. *.pack.json checks (dose literals + token integrity + localization) ---------- */
for (const f of jsonFiles.filter(x => x.endsWith('.pack.json'))) {
  const raw = readFileSync(f, 'utf8');
  const rel = f.replace(SITE, '.');
  raw.split('\n').forEach((line, i) => { if (DOSE.test(line)) H(`dose literal in ${rel}:${i + 1}`); });
  const pack = parsed[f]; if (!pack) continue;
  const tokIds = new Set((pack.localPolicies || []).map(t => t.id));
  const banks = pack.choiceBanks || {};
  for (const g of Object.keys(banks)) for (const c of banks[g]) if (c.tokenId && !tokIds.has(c.tokenId)) H(`${rel}: choice "${c.id}" references unknown tokenId "${c.tokenId}"`);
  const unfilled = (pack.localPolicies || []).filter(t => t.value === null).map(t => t.id);
  if (unfilled.length) I(`${rel}: ${unfilled.length} LOCAL_POLICY token(s) awaiting faculty fill → ${unfilled.join(', ')}`);
  if (pack.status && pack.status !== 'reviewed') I(`${rel}: status="${pack.status}" (ships watermarked until attested)`);
}

/* ---------- report ---------- */
const line = '─'.repeat(64);
console.log(`\n${line}\nStatic QA — ${SITE}\n${line}`);
console.log(`nav items: ${navItems} · content md: ${contentFiles.length} · tools: ${toolFiles.length} · json files: ${jsonFiles.length}`);
if (info.length) { console.log(`\nℹ INFO (${info.length}):`); info.forEach(m => console.log('  · ' + m)); }
if (soft.length) { console.log(`\n△ SOFT ${STRICT ? '(fail: STRICT)' : '(warn)'} (${soft.length}):`); soft.forEach(m => console.log('  △ ' + m)); }
if (hard.length) { console.log(`\n✗ HARD FAILURES (${hard.length}):`); hard.forEach(m => console.log('  ✗ ' + m)); }
else console.log('\n✓ No hard failures.');

const failed = hard.length > 0 || (STRICT && soft.length > 0);
console.log(`\n${line}\n${failed ? '✗ FAIL' : '✓ PASS'} (hard:${hard.length} soft:${soft.length} info:${info.length})\n${line}\n`);
process.exit(failed ? 1 : 0);
