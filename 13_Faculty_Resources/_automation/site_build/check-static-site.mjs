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
 *   UPDATE_BASELINE=1 node check-static-site.mjs <dir>   # rewrite qa-baseline.json from
 *                                                          this run's soft-finding counts
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
 *   - a tool HTML with a malformed, conflicting, or multiple recognized metadata marker
 *   - a *.pack.json whose choiceBank tokenId is not defined in localPolicies
 *   - a content-convention source page not wired into the build's source map
 *     (<siteDir>.source-map.json, emitted by build_deploy.py / resident_section.py)
 *   - a shipped file that is a Git-LFS pointer stub instead of real bytes
 *   - a duplicate (or missing) item id in question_bank.json
 *   - a relative/root-local <script src> whose shipped target is absent
 *   - a shell (index.html) literal map (LAB/ICON/PRACTICE_LABELS/PAGE_TOOLS/
 *     PRACTICE_PAGE_TOOLS/DASH_CONFIG) referencing a tool file the build doesn't ship
 *   - a shell CASE_TITLES/FAMILY_SCENARIO_TITLES id missing from communication_cases.json
 *     / family_systems_scenarios.json
 *   - a `?page=`/`?tool=` reference in shipped content/*.md that doesn't resolve
 *   - a soft-finding class (see qa-baseline.json) whose count exceeds its baseline
 * SOFT findings (warn; fail only under STRICT=1):
 *   - a tool HTML missing both recognized metadata markers ([CLERKSHIP-META v1] / [RC-META])
 *   - near-duplicate question stems in question_bank.json (≥85% token overlap)
 *   - nav markdown files missing from topic_meta.json
 *   - nav items missing from reviewed.json
 *   - orphan tools/content not referenced by nav
 *   - LOCAL_POLICY tokens still unfilled (value:null)  [reported, never fails]
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = process.argv[2];
if (!SITE) { console.error('usage: node check-static-site.mjs <siteDir>'); process.exit(1); }
const STRICT = process.env.STRICT === '1';
const hard = [], soft = [], info = [];
const legacyMetadataPaths = [];
const H = (m) => hard.push(m);
const S = (m) => soft.push(m);
const I = (m) => info.push(m);

const p = (...a) => join(SITE, ...a);
const readJSON = (f) => JSON.parse(readFileSync(f, 'utf8'));
const listHtml = (dir) => existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.html')) : [];
const DOSE = /\b\d+(?:\.\d+)?\s?(?:mg|mcg|mL|mg\/kg)\b/i;
const CDN_HOST = /\b(?:cdnjs\.cloudflare\.com|unpkg\.com|jsdelivr\.net)\b/i;

/* classify(msg): map a soft-finding message to a stable class for the ratchet (section 9).
 * Regexes are ordered most-specific first and matched against the literal S() message
 * text — keep this in sync with the file's S() call sites (grep `S(\``). A soft message
 * that matches nothing here still counts, just under "other", which has its own baseline
 * key rather than silently going unratcheted. */
function classify(msg) {
  if (/^computed localStorage key\(s\) in /.test(msg)) return 'computed-key';
  if (/^dose literal in /.test(msg)) return 'dose-soft';
  if (/^near-duplicate question stems: /.test(msg)) return 'near-dup';
  if (/^blueprint gap: /.test(msg)) return 'blueprint-gap';
  if (/^pretest pool /.test(msg)) return 'pretest-gap';
  if (/^metadata missing \(topic_meta\): /.test(msg)) return 'metadata';
  if (/^tool missing recognized metadata marker: /.test(msg)) return 'metadata';
  if (/^legacy metadata warning: /.test(msg)) return 'legacy-metadata';
  if (/^review status missing \(reviewed\.json\): /.test(msg)) return 'review-coverage';
  if (/^Git-LFS pointer stub shipped /.test(msg)) return 'lfs-stub-soft';
  return 'other';
}

if (!existsSync(SITE)) { console.error(`Site dir not found: ${SITE}`); process.exit(1); }

/* ---------- 1. JSON validity ---------- */
const jsonFiles = [], allFiles = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const fp = join(d, f);
    const st = statSync(fp);
    if (st.isDirectory()) { if (!/node_modules|\.netlify|\.git/.test(fp)) walk(fp); }
    else { allFiles.push({ fp, size: st.size }); if (f.endsWith('.json')) jsonFiles.push(fp); }
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
for (const f of contentFiles) if (navMd.size && !navMd.has(f)) H(`orphan content (not in nav): ${f} — add to nav in build_deploy.py or resident_section.py`);
for (const f of toolFiles) if (navTools.size && !navTools.has(f)) H(`orphan tool (not in nav): ${f} — add to nav in build_deploy.py or resident_section.py`);

const tmPath = p('topic_meta.json');
if (existsSync(tmPath) && parsed[tmPath]) {
  const meta = parsed[tmPath];
  for (const f of navMd) if (f && !(f in meta)) S(`metadata missing (topic_meta): ${f}`);
  const missingWorkflow = [...navMd]
    .filter(f => f && meta[f])
    .filter(f => {
      const m = meta[f] || {};
      const stages = Array.isArray(m.workflowStages) && m.workflowStages.length;
      const workflow = m.clinicalWorkflow && typeof m.clinicalWorkflow === 'object';
      return !stages || !workflow;
    })
    .sort();
  const withWorkflow = [...navMd].filter(f => {
    const m = meta[f] || {};
    return Array.isArray(m.workflowStages) && m.workflowStages.length && m.clinicalWorkflow && typeof m.clinicalWorkflow === 'object';
  }).length;
  if (navMd.size) {
    I(`workflow metadata coverage: ${withWorkflow}/${navMd.size} nav markdown pages` +
      (missingWorkflow.length ? ` (missing: ${missingWorkflow.join(', ')})` : ''));
  }
}
const rvPath = p('reviewed.json');
if (existsSync(rvPath) && parsed[rvPath]) {
  const rev = parsed[rvPath];
  for (const f of [...navMd, ...navTools]) if (f && !(f in rev)) S(`review status missing (reviewed.json): ${f}`);
}

/* ---------- 4a2. curriculum crosswalk coverage gaps (SOFT) ----------
 * For each shelfBlueprint code, warn if no ATTESTED nav page is tagged with it, or no
 * ATTESTED question-bank item is in that category. Soft on purpose: the epa/shelf mapping
 * ships as a proposed teaching default (CROSSWALK_TAXONOMY.md); promote to hard once faculty
 * attests the crosswalk. Blueprint codes == question_bank categories, so the two join directly. */
{
  const SHELF_VOCAB = ['mood','psychosis','anxiety','substance','neurocog','pharm',
    'safety','personality','childdev','otherdx','ethics','relational'];
  const meta = (existsSync(tmPath) && parsed[tmPath]) ? parsed[tmPath] : null;
  const rev = (existsSync(rvPath) && parsed[rvPath]) ? parsed[rvPath] : {};
  const qbP = p('question_bank.json');
  const qb = (existsSync(qbP) && parsed[qbP]) ? (parsed[qbP].items || []) : null;
  const isAttestedPage = (slug) => rev[slug] && rev[slug].status === 'reviewed';
  if (meta && navMd.size) {
    const pageCov = Object.create(null), itemCov = Object.create(null);
    for (const c of SHELF_VOCAB) { pageCov[c] = 0; itemCov[c] = 0; }
    for (const slug of navMd) {
      const m = meta[slug]; if (!m || !Array.isArray(m.shelfBlueprint)) continue;
      if (!isAttestedPage(slug)) continue;
      for (const c of m.shelfBlueprint) if (c in pageCov) pageCov[c]++;
    }
    if (qb) for (const it of qb) if (it && it.status === 'attested' && it.category in itemCov) itemCov[it.category]++;
    let tagged = 0; for (const slug of navMd) { const m = meta[slug]; if (m && Array.isArray(m.shelfBlueprint) && m.shelfBlueprint.length) tagged++; }
    I(`crosswalk coverage: ${tagged} nav pages carry shelfBlueprint tags across ${SHELF_VOCAB.length} blueprint codes`);
    for (const c of SHELF_VOCAB) {
      if (pageCov[c] === 0) S(`blueprint gap: no attested page tagged shelfBlueprint "${c}"`);
      if (qb && itemCov[c] === 0) S(`blueprint gap: no attested question-bank item in category "${c}"`);
    }
  }
}

/* ---------- 4a3. diagnostic pretest pool (SOFT) ----------
 * Build emits pretest_pool.json (1 attested, scoreable item per blueprint category).
 * Warn if it doesn't cover all 12 codes or an item isn't scoreable. Soft: the SPA
 * degrades gracefully (a missing category is just not probed). */
{
  const ppP = p('pretest_pool.json');
  if (existsSync(ppP) && parsed[ppP]) {
    const items = parsed[ppP].items || [];
    const SHELF_VOCAB = ['mood','psychosis','anxiety','substance','neurocog','pharm',
      'safety','personality','childdev','otherdx','ethics','relational'];
    const seen = new Set(items.map(it => it && it.cat));
    const missing = SHELF_VOCAB.filter(c => !seen.has(c));
    if (missing.length) S(`pretest pool missing categories: ${missing.join(', ')}`);
    for (const it of items) {
      const nc = (it.options || []).filter(o => o && o.c === true).length;
      if (nc !== 1) S(`pretest pool item "${it && it.id}" (${it && it.cat}) not scoreable (${nc} correct options)`);
    }
  }
}

/* ---------- 4b. topic_meta.json cta hrefs must resolve to a shipped tool/page ---------- */
if (existsSync(tmPath) && parsed[tmPath]) {
  for (const [key, m] of Object.entries(parsed[tmPath])) {
    if (navMd.size && !navMd.has(key)) continue; // topic_meta.json is shared across sites; only validate ctas for pages this build actually ships
    if (!m || typeof m !== 'object' || !m.cta) continue;
    const ctas = Array.isArray(m.cta) ? m.cta : [m.cta];
    for (const c of ctas) {
      if (!c || !c.href) continue;
      const routeMatch = c.href.match(/^\.?\/?\?(page|tool)=([^&#]+)(?:[&#].*)?$/);
      if (routeMatch) {
        const target = decodeURIComponent(routeMatch[2]);
        const dir = routeMatch[1] === 'tool' ? 'tools' : 'content';
        if (!existsSync(p(dir, target))) H(`topic_meta cta for ${key} → missing target: ${c.href}`);
        continue;
      }
      const rel = c.href.replace(/^\.?\//, '');
      if (!existsSync(p(rel))) H(`topic_meta cta for ${key} → missing target: ${c.href}`);
    }
  }
}

/* ---------- 5a. shipped JS assets (toolAssets) must vendor locally, no CDN ---------- */
// toolAssets (e.g. sp-interview.voice.js) ship verbatim to tools/ but were never
// scanned — only tools/*.html was read. A CDN dependency inside a shipped script
// blanks the tool on offline/ward networks just as one in the HTML would.
const jsAssets = existsSync(p('tools'))
  ? readdirSync(p('tools')).filter(f => f.endsWith('.js'))
  : [];
for (const f of jsAssets) {
  const js = readFileSync(p('tools', f), 'utf8');
  if (CDN_HOST.test(js)) H(`external CDN dependency in tools/${f} — vendor the script locally so bedside/offline use does not blank the tool`);
}

/* ---------- 5. per-tool HTML checks (metadata, title, viewport, dose, storage) ---------- */
for (const f of toolFiles) {
  const html = readFileSync(p('tools', f), 'utf8');
  if (CDN_HOST.test(html)) H(`external CDN dependency in tools/${f} — vendor the script locally so bedside/offline use does not blank the tool`);
  for (const match of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi)) {
    const source = match[2].trim();
    if (!source || /^(?:https?:)?\/\//i.test(source) || /^(?:data|blob):/i.test(source)) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(source)) {
      H(`unsupported script source in ${f}: ${source}`);
      continue;
    }
    const clean = source.split(/[?#]/, 1)[0];
    const target = clean.startsWith('/')
      ? resolve(SITE, clean.slice(1))
      : resolve(dirname(p('tools', f)), clean);
    const targetRelative = relative(resolve(SITE), target);
    if (targetRelative.startsWith('..') || targetRelative === '') {
      H(`relative script source escapes the built site in ${f}: ${source}`);
    } else if (!existsSync(target)) {
      H(`missing relative script source in ${f}: ${source}`);
    }
  }
  const preferredStarts = html.match(/<!--\s*\[CLERKSHIP-META v1\]/g) || [];
  const legacyStarts = html.match(/<!--\s*\[RC-META\]/g) || [];
  const preferredMarkers = html.match(/<!--\s*\[CLERKSHIP-META v1\]\s*[^]*?-->/g) || [];
  const legacyMarkers = html.match(/<!--\s*\[RC-META\]\s*[^]*?-->/g) || [];
  if (
    preferredStarts.length !== preferredMarkers.length
    || legacyStarts.length !== legacyMarkers.length
  ) {
    H(`malformed metadata marker: ${f}`);
  } else if (preferredMarkers.length === 0 && legacyMarkers.length === 0) {
    S(`tool missing recognized metadata marker: ${f}`);
  } else if (preferredMarkers.length > 0 && legacyMarkers.length > 0) {
    H(`conflicting metadata markers: ${f}`);
  } else if (preferredMarkers.length + legacyMarkers.length !== 1) {
    H(`multiple metadata markers: ${f}`);
  } else if (legacyMarkers.length === 1) {
    legacyMetadataPaths.push(`tools/${f}`);
  }
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
  // WP-03 remainder: bare accent text (--primary #c25a3c, ~3.9:1 light) fails AA for
  // normal-size text. The build polish pass repoints every bare usage to
  // var(--primary-dark,#a84830); a bare occurrence in shipped output means the rewrite
  // regressed or a new pattern slipped past it.
  if (/color:\s*var\(--primary\)/.test(html)) {
    H(`bare color:var(--primary) in tools/${f} — AA contrast: polish pass must rewrite to var(--primary-dark,#a84830)`);
  }
  // Computed keys bypass the literal-only namespace regex above; surface the
  // indirection so it gets a human look (SOFT: build_and_check.sh runs non-STRICT).
  const computedKeys = [...html.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*(?!['"])/g)];
  if (computedKeys.length) S(`computed localStorage key(s) in ${f} (${computedKeys.length}) — namespace rule cannot verify indirection; prefer literal cw_*/rp_* keys`);
  // Dark-mode regression gate (audit WS4): a hard-coded light background in a page
  // that takes its dark tokens from clinical-warm.css renders light-on-light in dark
  // mode (WCAG 1.4.3 — measured 2.05-2.43:1). Pages shipping their own
  // [data-theme="dark"] block manage their own backgrounds and are exempt.
  if (html.includes('clinical-warm.css') && !html.includes('[data-theme="dark"]')) {
    for (const m of html.matchAll(/background(?:-color)?\s*:\s*(#[ef][0-9a-fA-F]{2}(?:[0-9a-fA-F]{3})?)\b/g)) {
      H(`light background literal ${m[1]} in ${f} — renders light-on-light in dark mode; use a token (var(--surface)/var(--*-light)) with a light fallback`);
    }
  }
}
if (legacyMetadataPaths.length) {
  S(`legacy metadata warning: ${legacyMetadataPaths.sort().join(', ')}`);
}

/* ---------- 5c. SPA shell (index.html) — CDN + storage-namespace scans ---------- */
// The shell is the single largest JS surface shipped (all quiz/SRS/pretest logic,
// 38 localStorage references) but was exempt from every per-page check: an
// un-namespaced key or a CDN script added to spa_index.html shipped ungated.
// Tool-specific checks (metadata markers, dose literals, viewport) stay tools-only.
const shellPath = p('index.html');
if (existsSync(shellPath)) {
  const shell = readFileSync(shellPath, 'utf8');
  if (CDN_HOST.test(shell)) H('external CDN dependency in index.html — vendor the script locally so bedside/offline use does not blank the shell');
  const shellKeys = [...shell.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  for (const k of shellKeys) if (!k.startsWith('cw_') && !k.startsWith('rp_')) H(`non-namespaced storage key in index.html: "${k}" (use cw_* or rp_*)`);
  const shellComputed = [...shell.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(\s*(?!['"])/g)];
  if (shellComputed.length) S(`computed localStorage key(s) in index.html (${shellComputed.length}) — namespace rule cannot verify indirection; prefer literal cw_*/rp_* keys`);
} else {
  H('index.html missing from built site');
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

/* ---------- 6b. question_bank.json integrity (dup ids HARD, near-dup stems SOFT) ---------- */
// Item ids key attestation (cw_qbank_attest_v1) and SRS state — a collision silently
// merges two items' records. Near-duplicate stems flag the copy-drift pattern (an item
// duplicated from a _build copy or re-angled without retiring the original) for review.
const qbPath = p('question_bank.json');
if (existsSync(qbPath) && parsed[qbPath]) {
  const qItems = parsed[qbPath].items || [];
  const qSeen = new Map();
  // Learner links: link.href "?page=X.md" must resolve to a built content/ page, or the
  // student clicks into a 404. The bank stores the BUILT slug (e.g. t_anxiety.md), not the
  // source filename — build_deploy.py renames pages on copy, so a source-style name here is
  // a silent dead link. HARD (same class as a broken nav target). Guards regressions of the
  // 2026-07 fix that corrected ~44 items pointing at source filenames.
  const contentSet = new Set(contentFiles);
  qItems.forEach((it, i) => {
    if (!it.id) { H(`question_bank item[${i}] missing id`); return; }
    if (qSeen.has(it.id)) H(`duplicate question_bank id "${it.id}" (items ${qSeen.get(it.id)} and ${i})`);
    else qSeen.set(it.id, i);
    const href = it.link && it.link.href;
    if (href) {
      const m = /[?&]page=([^&#]+\.md)/.exec(href);
      if (m && !contentSet.has(m[1]))
        H(`question_bank "${it.id}" link.href points to missing content page "${m[1]}" (use the built slug, not the source filename)`);
    }
  });
  const stemToks = qItems.map(it =>
    new Set((it.stem || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2)));
  for (let a = 0; a < qItems.length; a++) {
    for (let b = a + 1; b < qItems.length; b++) {
      const A = stemToks[a], B = stemToks[b];
      if (!A.size || !B.size) continue;
      let inter = 0; for (const w of A) if (B.has(w)) inter++;
      const jac = inter / (A.size + B.size - inter);
      if (jac >= 0.85) S(`near-duplicate question stems: ${qItems[a].id} vs ${qItems[b].id} (${Math.round(jac * 100)}% token overlap)`);
    }
  }
}

/* ---------- 7. orphaned source pages (HARD) ---------- */
// The build emits its wired source list to <siteDir>.source-map.json (a SIBLING of the
// publish dir — never shipped). Any source-tree markdown that follows the learner-content
// naming conventions but is absent from that map is a page the build silently drops —
// the "10 pages dropped at git cutover" failure class. Fails CLOSED: a missing map is
// itself a hard failure (old build_deploy.py, or checker run against a stale build).
const LIBROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const srcMapPath = SITE.replace(/[\/\\]+$/, '') + '.source-map.json';
if (!existsSync(srcMapPath)) {
  H(`source map not found: ${srcMapPath} — rebuild with current build_deploy.py (orphaned-source check cannot run)`);
} else {
  const wired = new Set(JSON.parse(readFileSync(srcMapPath, 'utf8')).sources || []);
  // Content conventions: teaching pages, pocket guides/cards, and week READMEs. Scoped to
  // the NN_Category/ tree; _-prefixed segments (_source/, _automation/, …) and archive/meta
  // dirs are working material, not site content.
  const CONTENT_PAGE = [/_inpatient(?:_teaching)?\.md$/, /_pocket_(?:guide|card)\.md$/];
  const isWeekReadme = (rel) => /^01_Six_Week_Curriculum\/Week_[^/]+\/README\.md$/.test(rel);
  const orphanSources = [];
  (function scan(d) {
    for (const f of readdirSync(d)) {
      const fp = join(d, f);
      const rel = relative(LIBROOT, fp).split('\\').join('/');
      const seg = basename(fp);
      if (seg.startsWith('_') || seg.startsWith('.')) continue;
      if (statSync(fp).isDirectory()) {
        const top = rel.split('/')[0];
        if (rel === top && !(/^\d{2}_/.test(top)) ) continue;          // only NN_Category/ roots
        if (top === '00_START_HERE' || top === '99_Archive') continue; // meta/archive, not content
        scan(fp);
      } else if (f.endsWith('.md') && (CONTENT_PAGE.some(rx => rx.test(f)) || isWeekReadme(rel))) {
        if (!wired.has(rel)) orphanSources.push(rel);
      }
    }
  })(LIBROOT);
  for (const o of orphanSources.sort())
    H(`orphaned source page (not wired into build): ${o} — register it in build_deploy.py or rename it out of the content convention`);
}

/* ---------- 7b. shell-reference integrity scan (HARD) ----------
 * index.html (the SPA shell) carries several hand-maintained literal maps that point at
 * shipped tool files, communication-case ids, and family-scenario ids. Earlier tasks in
 * this branch (sp-interview.html, one-patient-six-weeks.html) added entries to these maps
 * by hand — nothing upstream verifies the entries still resolve once shipped. This section
 * closes that gap: a tool filename, case id, scenario id, or `?page=`/`?tool=` reference
 * the build ships but doesn't back with a real file is a dead end a student can click into.
 *
 * Extraction approach (fragile by construction — flagged here on purpose): the shell
 * literals are ordinary JS object literals baked into index.html, not JSON, so a real
 * parser isn't available without adding a dependency this dependency-free gate deliberately
 * avoids. `extractVarBlock` isolates each `var NAME={...};` block with a quote-aware brace
 * counter (needed because DASH_CONFIG nests a per-mode object inside the outer one);
 * regexes then pull `'*.html'` string literals or bare-identifier object keys out of that
 * block. This breaks if the build ever reformats these vars — e.g. switches `var` to
 * `const`/`let`, quotes the CASE_TITLES/FAMILY_SCENARIO_TITLES keys, or a label string
 * picks up an unescaped matching quote. The `shell literal map "X" not found` HARD failure
 * below is the tripwire for that regression class: it means the scan went blind, not that
 * the shell is fine — treat it as a bug in this section, not a pass. Also note: the
 * `'*.html'`/bare-key regexes read raw characters, not tokens — a quoted `'*.html'`-looking
 * string or a `word:'...'`-looking fragment sitting inside a "//" or block-comment inside
 * one of these var blocks would be picked up as a phantom reference. No such comment
 * exists in these blocks today (verified) — flagged here as a known blind spot, not a bug.
 *
 * Escape hatch: a specific reference that's a genuine, reviewed exception (not a bug) can
 * be listed here instead of fixed, with a comment explaining why. Empty as of this task —
 * the (a)/(b)/(c) checks below found zero pre-existing violations against the current
 * build, so nothing needed it.
 *
 * Tri-state presence gate (added after CI caught this scan hard-failing the SP-interview
 * contract suite's synthetic fixture sites, whose stub index.html deliberately carries
 * none of these maps — it's testing the checker's *other* rules, not the real shell):
 *   - all 8 maps present  → scan runs normally (the real shell always carries all 8).
 *   - zero of 8 present   → this isn't a shell that's supposed to have these maps at all
 *     (a test fixture, a non-SPA site) — section 7b is skipped entirely (a, b, and c) with
 *     an I() note, not a HARD failure.
 *   - some but not all present → real drift or regex rot on an actual shell (which always
 *     ships all 8 together) — kept as HARD failures per missing map, unchanged. Do NOT
 *     special-case known fixtures by path/name; the all-or-nothing marker count is the
 *     only signal used, so a real shell that loses a map still fails loudly.
 */
const SHELL_REF_ALLOWLIST = new Set([
  // 'tool-name.html',   // example shape — reason it's allowlisted instead of fixed
]);
{
  const extractVarBlock = (src, varName) => {
    const marker = `var ${varName}=`;
    const start = src.indexOf(marker);
    if (start === -1) return null;
    let i = src.indexOf('{', start);
    if (i === -1) return null;
    let depth = 0, inStr = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
      if (c === "'" || c === '"') { inStr = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    }
    return null; // ran off the end without closing — extraction failed
  };
  const htmlNamesIn = (block) => new Set([...block.matchAll(/(['"])([^'"]+\.html)\1/g)].map(m => m[2]));
  const bareKeysIn = (block) => new Set([...block.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*'/g)].map(m => m[1]));
  const TOOL_MAP_VARS = ['LAB', 'ICON', 'PRACTICE_LABELS', 'PAGE_TOOLS', 'PRACTICE_PAGE_TOOLS', 'DASH_CONFIG'];
  const ALL_SHELL_MAP_VARS = [...TOOL_MAP_VARS, 'CASE_TITLES', 'FAMILY_SCENARIO_TITLES'];

  const shellHtml = existsSync(shellPath) ? readFileSync(shellPath, 'utf8') : null;
  if (shellHtml === null) {
    H('index.html missing from built site (shell-reference scan cannot run)');
  } else {
    const presentMapVars = ALL_SHELL_MAP_VARS.filter(v => shellHtml.includes(`var ${v}=`));
    if (presentMapVars.length === 0) {
      I('no shell literal maps in index.html — 7b scan skipped (fixture or non-SPA site)');
    } else {
      // (a) tool filenames referenced across the six shell maps must exist in tools/.
      const toolRefs = new Map(); // toolName -> Set(varName it was found in)
      for (const varName of TOOL_MAP_VARS) {
        const block = extractVarBlock(shellHtml, varName);
        if (block === null) { H(`shell literal map "${varName}" not found in index.html (extraction failed — see comment above)`); continue; }
        for (const name of htmlNamesIn(block)) {
          if (!toolRefs.has(name)) toolRefs.set(name, new Set());
          toolRefs.get(name).add(varName);
        }
      }
      for (const [name, vars] of [...toolRefs].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (SHELL_REF_ALLOWLIST.has(name)) continue;
        if (!existsSync(p('tools', name)))
          H(`shell references missing tool "${name}" (in ${[...vars].sort().join(', ')}) — index.html`);
      }

      // (b) CASE_TITLES / FAMILY_SCENARIO_TITLES ids must exist in the shipped case/scenario data.
      const idBlockCheck = (varName, dataFile, dataKey) => {
        const block = extractVarBlock(shellHtml, varName);
        if (block === null) { H(`shell literal map "${varName}" not found in index.html (extraction failed — see comment above)`); return; }
        const target = p(dataFile);
        if (!existsSync(target) || !parsed[target]) { H(`${dataFile} not found or unparsable in built site (cannot verify ${varName} ids)`); return; }
        const knownIds = new Set((parsed[target][dataKey] || []).map(x => x && x.id).filter(Boolean));
        for (const id of bareKeysIn(block)) {
          if (knownIds.has(id) || SHELL_REF_ALLOWLIST.has(id)) continue;
          H(`shell ${varName} references missing id "${id}" — not in ${dataFile}`);
        }
      };
      idBlockCheck('CASE_TITLES', 'communication_cases.json', 'cases');
      idBlockCheck('FAMILY_SCENARIO_TITLES', 'family_systems_scenarios.json', 'scenarios');

      // (c) `?page=`/`?tool=` references in shipped content/*.md must resolve to a shipped
      // content slug / tool file. Target is read up to the next &, quote, close-paren, or
      // whitespace, so both markdown `(...)` links and raw `href="..."` attributes match. A
      // trailing `#fragment` (e.g. `?page=shelf.md#section`) is stripped after decoding —
      // without it, a future in-page anchor link would false-positive as a missing file.
      // decodeURIComponent throws on a malformed `%` escape; caught below and reported as
      // a finding, not an uncaught crash of the whole gate.
      const contentSetC = new Set(contentFiles);
      const toolSetC = new Set(toolFiles);
      const ROUTE_REF = /\?(page|tool)=([^&"')\s]+)/g;
      for (const f of contentFiles) {
        const text = readFileSync(p('content', f), 'utf8');
        for (const m of text.matchAll(ROUTE_REF)) {
          const kind = m[1];
          let target;
          try { target = decodeURIComponent(m[2]); }
          catch (e) { H(`content/${f} → ?${kind}= reference has an undecodable target "${m[2]}" (${e.message})`); continue; }
          target = target.replace(/#.*$/, '');
          if (SHELL_REF_ALLOWLIST.has(target)) continue;
          const ok = kind === 'page' ? contentSetC.has(target) : toolSetC.has(target);
          if (!ok) H(`content/${f} → ?${kind}= references missing ${kind === 'page' ? 'content page' : 'tool'}: ${target}`);
        }
      }
    }
  }
}

/* ---------- 7c. service-worker integrity scan (tri-state) ----------
 * Tasks 5-7 (this branch) added a per-site sw.js (common.py emit_service_worker(),
 * embedding a PRECACHE manifest between /*__PRECACHE_START__*\/ ... /*__PRECACHE_END__*\/
 * markers) and a shell-injected registration call — `function registerClerkshipSW(){`,
 * expanded into index.html from sw_register.js via the /*__SW_REGISTER__*\/ marker. The
 * two halves are only useful together: a shell that calls registerClerkshipSW() with no
 * sw.js on disk registers nothing (silent no-op — .catch(function(){}) swallows the 404);
 * an sw.js shipped with nothing calling navigator.serviceWorker.register() is dead code
 * that never installs. This section HARD-fails a half-shipped pair, then — only once both
 * halves are confirmed present — validates the precache manifest and sw.js's own contents.
 *
 * Tri-state presence gate (same shape as 7b's all-or-nothing marker check, for the same
 * reason: the SP-interview contract suite's synthetic fixture sites
 * (_prototypes/sp-interview/tests/ci-build-contract.test.mjs, FIXTURE_INDEX_HTML) ship a
 * bare stub index.html with neither sw.js nor a registration call — a valid pre-SW/fixture
 * site, not a broken one):
 *   - neither sw.js NOR `registerClerkshipSW(` in index.html → I() skip, no HARD.
 *   - exactly one of the two present → HARD (partial wiring).
 *   - both present → validate below.
 *
 * This section produces HARD findings only (I() for the skip case) — no new S() class,
 * so it never touches the section-9 soft-finding ratchet or qa-baseline.json.
 */
{
  const swPath = p('sw.js');
  const swExists = existsSync(swPath);
  // Re-read index.html independently (mirrors 7b's own shellHtml read) rather than
  // reaching into section 5c's block-scoped `shell` const, keeping this section
  // standalone-runnable if 5c is ever reordered or removed.
  const shellHtmlForSw = existsSync(shellPath) ? readFileSync(shellPath, 'utf8') : null;
  const shellRegistersSw = shellHtmlForSw !== null && shellHtmlForSw.includes('registerClerkshipSW(');

  if (!swExists && !shellRegistersSw) {
    I('sw: not present — section skipped (fixture or pre-SW site)');
  } else if (swExists !== shellRegistersSw) {
    H('sw: partial wiring — sw.js and shell registration must ship together' +
      (swExists ? ' (sw.js shipped, but index.html never calls registerClerkshipSW())'
                : ' (index.html calls registerClerkshipSW(), but sw.js was not shipped)'));
  } else {
    const sw = readFileSync(swPath, 'utf8');

    // PRECACHE manifest: a JSON array embedded between build-time markers. Unparsable
    // means the template substitution in emit_service_worker() failed or the shipped
    // file was hand-edited into invalid JSON — either way, the browser can't consume it.
    const START = '/*__PRECACHE_START__*/', END = '/*__PRECACHE_END__*/';
    const startAt = sw.indexOf(START), endAt = sw.indexOf(END);
    let precache = null;
    if (startAt === -1 || endAt === -1 || endAt < startAt) {
      H(`sw: PRECACHE markers not found in sw.js (expected ${START}[...]${END})`);
    } else {
      try { precache = JSON.parse(sw.slice(startAt + START.length, endAt)); }
      catch (e) { H(`sw: PRECACHE array between markers is not valid JSON — ${e.message}`); }
    }

    if (Array.isArray(precache)) {
      // Mirrors common.py's own build-time exclusion contract (SW_EXCLUDE_PREFIXES /
      // SW_EXCLUDE_EXTS in emit_service_worker()) — the FOUR prefixes the build deliberately
      // never precaches (Range-request/streamed by the browser, or too large/inert to be
      // worth it — see that function's module docstring), not sw_template.js's runtime
      // isMedia() (which only special-cases three of the four at fetch time; anki/ decks
      // are excluded from PRECACHE at build time but not given special fetch handling,
      // since nothing in the shell ever issues a range-style request for them). Keep these
      // two constants in sync with SW_EXCLUDE_PREFIXES / SW_EXCLUDE_EXTS in common.py — a
      // manifest entry that slipped past that exclusion means the generator regressed, not
      // that a browser can safely precache it.
      const MEDIA_PREFIX = ['/audio/', '/audio_oe/', '/media/', '/anki/'];
      const MEDIA_EXT = /\.(mp4|vtt|m4a|mp3|wav)$/i;
      let totalBytes = 0;
      for (const entry of precache) {
        if (typeof entry !== 'string' || !entry.startsWith('/')) {
          H(`sw: PRECACHE entry is not a root-relative path: ${JSON.stringify(entry)}`);
          continue;
        }
        if (MEDIA_PREFIX.some(prefix => entry.startsWith(prefix)) || MEDIA_EXT.test(entry)) {
          H(`sw: PRECACHE entry is media (must never be precached — Range semantics belong to the network): ${entry}`);
          continue;
        }
        // "/" is the precache key for the shell (_sw_precache_url() in common.py never
        // keys "/index.html" — a navigate request for "/" must hit this entry offline).
        const target = entry === '/' ? p('index.html') : p(entry.slice(1));
        if (!existsSync(target)) {
          H(`sw: PRECACHE entry does not exist on disk: ${entry}`);
          continue;
        }
        totalBytes += statSync(target).size;
      }
      const SW_PRECACHE_BUDGET_BYTES = 10 * 1024 * 1024;
      if (totalBytes > SW_PRECACHE_BUDGET_BYTES) {
        H(`sw: precache budget exceeded — ${totalBytes} bytes precached > ${SW_PRECACHE_BUDGET_BYTES} byte (10 MB) budget`);
      }
    }

    // sw.js's own contents: no importScripts() (pulls in code this dependency-free audit
    // never sees) and no bare http(s):// URL outside the leading generated-by comment
    // block. sw.js lives at the site root, not under tools/, so neither the 5a toolAssets
    // CDN scan nor the 5c shell CDN scan ever reads it. This check is also stricter than
    // those two: 5a/5c only flag a narrow CDN_HOST allowlist (cdnjs/unpkg/jsdelivr), while
    // this bans any absolute http(s):// URL in sw.js, full stop — a service worker has no
    // legitimate reason to reference any external origin. The leading comment (sw_template.js's
    // own "/* Generated per-site by common.py ... */" header, which documents the __VERSION__/
    // __KILL__ token mechanism in prose) is exempted so the scan doesn't flag its own docs.
    if (/importScripts\s*\(/.test(sw)) {
      H('sw: importScripts() call in sw.js — the shipped service worker must be self-contained');
    }
    const leadingComment = sw.match(/^\s*\/\*[\s\S]*?\*\//);
    const swAfterLeadingComment = leadingComment ? sw.slice(leadingComment[0].length) : sw;
    if (/https?:\/\//.test(swAfterLeadingComment)) {
      H('sw: bare http(s):// URL in sw.js outside the leading comment block — vendor/precache the target locally so offline/ward use never silently fetches cross-origin');
    }
  }
}

/* ---------- 8. Git-LFS pointer stubs ---------- */
// A pointer stub means the deploy fetched the LFS *pointer* (~130 bytes of
// "version https://git-lfs…") instead of the real media bytes — the orientation-video
// bug. Any shipped file this small that opens with the LFS header is a broken asset.
// HARD on the real Netlify production deploy (LFS is fetched there — a stub is a
// genuine broken deploy, e.g. the MS3 site's stale-cache incident found 2026-07-06).
// SOFT under GitHub Actions (ci.yml checks out with `lfs: false` on purpose — bandwidth
// cost, see netlify-ignore.sh) and SOFT on Netlify deploy-preview builds (this repo's
// PR previews don't fetch real LFS bytes either — confirmed 2026-07-06 investigating
// PR #122). Hard-failing either would permanently red every future PR.
const lfsIsExpectedStub = process.env.GITHUB_ACTIONS === 'true' || process.env.CONTEXT === 'deploy-preview';
for (const { fp, size } of allFiles) {
  if (size > 512) continue;
  if (readFileSync(fp, 'latin1').startsWith('version https://git-lfs')) {
    const msg = `Git-LFS pointer stub shipped (not real bytes): ${fp.replace(SITE, '.')} — re-fetch LFS objects (deploy without cache) before building`;
    if (lfsIsExpectedStub) S(msg); else H(msg);
  }
}

/* ---------- 9. soft-finding ratchet ----------
 * SOFT findings warn but never fail build_and_check.sh (STRICT is off there — see the
 * usage header). Left alone, a soft class can grow silently forever. This gives soft
 * findings a one-way floor: qa-baseline.json records the max count ever accepted per
 * class per site (classify(), defined near the top of the file, buckets each soft
 * message). A run whose class count exceeds its baseline is promoted to a HARD failure
 * naming the class/count/baseline — the class grew and nobody looked at it. A run that
 * comes in under baseline gets an I() nudge to lower the baseline — the class shrank,
 * lock the improvement in so it can't silently regress back up.
 *
 * Keyed per-site (`{"ms3":{...},"res":{...}}`), not a single shared baseline: generating
 * it (2026-08-04) showed computed-key alone differs by 3 between builds — res ships 3 more
 * rp-*.html tools using the LS.flags/FLAGS_KEY indirection than ms3 does, a structural
 * difference, not drift. A shared ceiling would just mask ms3 regressions inside res's
 * slack. Site key = basename(SITE) when it's "ms3" or "res"; any other build dir (a local
 * experiment, a future third site, a renamed/copied checkout of one of the two) has no
 * committed history under that name, so it gets treated exactly like a missing baseline
 * file below — ratchet skipped with an I() note, never a spurious HARD failure.
 *
 * Missing qa-baseline.json, OR a baseline file with no entry for this run's site key =
 * skip the ratchet with an I() note, not a HARD failure. A run against an unrecognized or
 * not-yet-seeded site key must not manufacture "grew past baseline 0" failures for every
 * soft finding — that would both violate the standalone-runnable contract (a copied/
 * renamed build dir must still just report, not fabricate failures) and misrepresent what
 * happened (nothing grew; there's simply no history yet). UPDATE_BASELINE=1 rewrites the
 * current site's counts into the file (merging into, not clobbering, any other site's
 * key) — for deliberate adoption after a real, reviewed change to a soft-finding count,
 * not something to run reflexively on failure; it's also how a new site key gets seeded
 * the first time.
 *
 * RATCHET_EXEMPT_CLASSES: "lfs-stub-soft" is excluded from ratchet counting entirely.
 * Section 8 already deliberately downgrades LFS pointer stubs from HARD to SOFT only in
 * environments that never fetch real LFS bytes on purpose (GITHUB_ACTIONS==='true' —
 * ci.yml checks out with lfs:false for bandwidth — and Netlify deploy previews). That
 * SOFT count is a function of how many media files the site ships in those environments
 * (105 today), not a quality signal to ratchet: it would swing with every media file
 * added regardless of whether anything is broken, and — critically — CI's first run of
 * any PR that ships more media than the committed baseline would hard-fail on a
 * downgrade that section 8 intentionally made non-blocking, defeating that contract (see
 * PR #122). The real "is this actually a broken deploy" check already has its own direct
 * HARD path in section 8 (`lfsIsExpectedStub` false — real Netlify production). Seeding
 * the baseline with the current stub count instead of exempting the class was considered
 * and rejected: it would mute the signal in the one place it's environment-driven noise
 * and still break the moment a media file is added.
 */
const RATCHET_EXEMPT_CLASSES = new Set(['lfs-stub-soft']);
{
  const baselinePath = join(dirname(fileURLToPath(import.meta.url)), 'qa-baseline.json');
  const siteBase = basename(resolve(SITE));
  const siteKey = (siteBase === 'ms3' || siteBase === 'res') ? siteBase : 'default';
  const counts = Object.create(null);
  for (const m of soft) {
    const c = classify(m);
    if (RATCHET_EXEMPT_CLASSES.has(c)) continue;
    counts[c] = (counts[c] || 0) + 1;
  }

  if (process.env.UPDATE_BASELINE === '1') {
    let all = {};
    if (existsSync(baselinePath)) { try { all = JSON.parse(readFileSync(baselinePath, 'utf8')); } catch { all = {}; } }
    all[siteKey] = counts;
    writeFileSync(baselinePath, JSON.stringify(all, null, 2) + '\n');
    I(`qa-baseline.json updated for "${siteKey}" → ${JSON.stringify(counts)}`);
  } else if (!existsSync(baselinePath)) {
    I('qa-baseline.json not found — soft-finding ratchet skipped (run UPDATE_BASELINE=1 to create it)');
  } else {
    let all = null;
    try { all = JSON.parse(readFileSync(baselinePath, 'utf8')); }
    catch (e) { I(`qa-baseline.json unparsable (${e.message}) — soft-finding ratchet skipped`); }
    if (all && !(siteKey in all)) {
      I(`soft-finding ratchet: no baseline entry for site "${siteKey}" — ratchet skipped (run UPDATE_BASELINE=1 against this build to seed one)`);
    } else if (all) {
      const baseline = all[siteKey];
      const classes = new Set([...Object.keys(counts), ...Object.keys(baseline)]
        .filter(c => !RATCHET_EXEMPT_CLASSES.has(c)));
      for (const c of [...classes].sort()) {
        const n = counts[c] || 0, max = baseline[c] || 0;
        if (n > max) H(`soft-finding ratchet: class "${c}" grew to ${n} (baseline ${max}) — review the new soft findings, then rerun with UPDATE_BASELINE=1 once accepted`);
        else if (n < max) I(`soft-finding ratchet: class "${c}" is ${n}, below baseline ${max} — consider UPDATE_BASELINE=1 to lock in the improvement`);
      }
    }
  }
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
