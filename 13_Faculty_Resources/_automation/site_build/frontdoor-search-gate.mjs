/** Command-search coverage, evaluated against the actual audience payload after build.
 * No second scorer: execute the exact pure join/search snippets present in the built HTML.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/* Track-specific pages withheld from one site's search (C2, 2026-10-17), recomputed here from the
 * canonical curriculum -- NOT read back from the builder's own `searchTrackExclude` -- so the gate
 * can disagree with the build. Same rule as frontdoor_catalog.build_frontdoor_payload: another
 * track's path landing pages plus this site's siteLibrary exclusions, never a page this site
 * places in its Library or Path. */
export function trackExclusions(canonical, projected, site) {
  const key = site === 'res' ? 'resident' : site;
  const own = new Set([
    ...(projected.libraryColumns || []).flatMap(c => c.refs || []),
    ...(projected.weeks || []).flatMap(w => [w.landingRef, ...(w.items || []).map(i => i.ref)]),
  ].filter(Boolean));
  const out = new Set(canonical.siteLibrary?.[key]?.exclusions || []);
  for (const [other, path] of Object.entries(canonical.learningPaths || {})) {
    if (other === key) continue;
    for (const week of path.weeks || []) if (typeof week.landingRef === 'string') out.add(week.landingRef);
  }
  return [...out].filter(ref => !own.has(ref)).sort();
}

export function searchCoverageErrors(index, shipped, site, exclusions, trackOnly = []) {
  if (!['ms3','res'].includes(site)) return ['unknown search audience'];
  const errors = [], pages = shipped.pages;
  if (!Array.isArray(pages) || !pages.length) return ['missing shipped search universe'];
  const all = new Set(pages.map(p => p.slug));
  const expected = new Set(pages.filter(p => p.sites.includes(site)).map(p => p.slug));
  const excluded = new Set();
  for (const e of exclusions || []) {
    if (!all.has(e.ref) || !e.reason?.trim() || excluded.has(e.ref)) errors.push(`invalid search exclusion: ${e.ref}`);
    excluded.add(e.ref);
    expected.delete(e.ref);
  }
  // A track-specific page must stay reachable by link even though search withholds it.
  for (const ref of trackOnly) {
    if (expected.delete(ref) && !index.known?.[ref]) errors.push(`track-specific page lost its link target: ${ref}`);
  }
  const actual = new Set(Object.values(index.byRef).filter(i => !i.readerOnly).map(i => i.ref));
  for (const ref of expected) if (!actual.has(ref)) errors.push(`shipped resource omitted from command search: ${ref}`);
  for (const ref of actual) if (!expected.has(ref)) errors.push(`unexpected command search resource: ${ref}`);
  return errors;
}

/* Golden learner queries (C2, 2026-10-17): tests/fixtures/search-golden.json. Each row names the
 * pages that answer a query on a site and how high one of them must rank; `before` names a page
 * the answer must outrank; `minTotal` guards recall. `track` rows name pages a site's search must
 * never return. `search(query)` runs the real ranking with the page-text index attached, so the
 * same rows gate the built sites here and the source projection in tests/search-golden.test.mjs. */
export function goldenErrors(fixture, site, search, known = () => true) {
  const errors = [];
  const own = ref => ref.replace('{site}', site);  // a case twin: cotw_<date>_<topic>_{site}.md
  for (const row of fixture.queries || []) {
    const raw = row.sites?.[site] || (row.sites?.both ? row.sites.both : null);
    if (!raw) continue;
    const expect = { ...raw, acceptable: raw.acceptable.map(own), before: (raw.before || []).map(own) };
    const rows = search(row.query);
    const refs = rows.map(r => r.item.ref);
    const acceptable = expect.acceptable.filter(known);
    if (!acceptable.length) { errors.push(`golden ${site} ${JSON.stringify(row.query)}: no acceptable page ships`); continue; }
    const rank = refs.findIndex(ref => acceptable.includes(ref));
    if (rank < 0 || rank >= expect.maxRank)
      errors.push(`golden ${site} ${JSON.stringify(row.query)}: wanted one of ${acceptable.join('/')} in the top ${expect.maxRank}, got [${refs.slice(0, expect.maxRank + 2).join(', ')}]`);
    for (const later of expect.before || []) {
      const at = refs.indexOf(later);
      if (at >= 0 && rank >= 0 && at < rank)
        errors.push(`golden ${site} ${JSON.stringify(row.query)}: ${later} (#${at + 1}) outranks the answer (#${rank + 1})`);
    }
    if (expect.minTotal && rows.length < expect.minTotal)
      errors.push(`golden ${site} ${JSON.stringify(row.query)}: only ${rows.length} matches, want >= ${expect.minTotal}`);
  }
  const leak = fixture.track?.[site];
  if (leak) {
    const banned = new Set(leak.neverReturn || []);
    const pattern = leak.neverReturnPattern ? new RegExp(leak.neverReturnPattern) : null;
    for (const query of leak.queries || []) {
      for (const r of search(query)) {
        if (banned.has(r.item.ref) || (pattern && pattern.test(r.item.ref)))
          errors.push(`track leak ${site} ${JSON.stringify(query)}: returned ${r.item.ref}`);
      }
    }
  }
  return errors;
}

export function checkBuiltSearch(siteDir, buildDir) {
  try {
    const html = readFileSync(join(siteDir,'index.html'),'utf8');
    // Small legacy QA fixtures have no Front Door. A real shell must carry every payload.
    if (!html.includes('var FD_CURRICULUM=')) {
      return /fdApp|FD_AUDIENCE|fdBuildIndex/.test(html)
        ? ['Front Door shell missing FD_CURRICULUM'] : [];
    }
    const get = name => {
      const match = html.match(new RegExp('var '+name+'=([^\\n]+);'));
      if (!match) throw new Error(`missing ${name}`);
      return JSON.parse(match[1]);
    };
    const cur = get('FD_CURRICULUM'), audience = get('FD_AUDIENCE');
    const site = audience === 'resident' ? 'res' : audience;
    const snippets = ['fd_data.js','fd_search.js'].map(name => {
      const source = readFileSync(join(buildDir,'frontdoor',name),'utf8');
      if (!html.includes(source)) throw new Error(`built search differs from ${name}`);
      return source;
    }).join('\n');
    const f = new Function('governanceBadge', snippets+'\nreturn {fdBuildIndex,fdSearchResults};')(() => '');
    const index = f.fdBuildIndex(cur,get('FD_TOPIC_META'),get('FD_TOOL_REGISTRY'),get('FD_SITE_MANIFEST'));
    const canonical = JSON.parse(readFileSync(join(buildDir,'../../../curriculum.json'),'utf8'));
    const shipped = JSON.parse(readFileSync(join(buildDir,'shipped_pages.json'),'utf8'));
    const errors = searchCoverageErrors(index,shipped,site,canonical.searchExclude,
      trackExclusions(canonical,cur,site));
    for (const item of Object.values(index.byRef).filter(i => !i.readerOnly)) {
      if (!existsSync(join(siteDir,item.kind === 'tool' ? 'tools' : 'content',item.ref)))
        errors.push(`command search destination missing: ${item.ref}`);
      const named = f.fdSearchResults(index,item.searchTitle || item.title,cur.synonyms,{});
      if (!named.some(r => r.item.ref === item.ref))
        errors.push(`command search cannot retrieve its displayed title: ${item.ref}`);
    }
    // These are end-to-end gates over emitted metadata, not only hand-built test fixtures.
    for (const [query,ref] of [['prepare for rounds','oral.html'],['hearing voices','t_psychosis.md'],
      ['PHQ9','screeners.html'],['SI?','pg_suicide.md']]) {
      const rows = f.fdSearchResults(index,query,cur.synonyms,{});
      if (!rows.slice(0,3).some(r => r.item.ref === ref)) errors.push(`command search regression: ${query}`);
    }
    const exactNames = [
      ['One Patient, Six Weeks','one-patient-six-weeks.html'],
      [`First-Episode Psychosis (Sep 7) — ${site === 'res' ? 'Resident' : 'MS3'}`,`cotw_20260907_fep_${site}.md`],
      // The typed title carries the word "catatonia", the authored trigger of the catatonia
      // protocol (#1087), so that protocol leads the established safety prefix.
      [`Catatonia [Aug 31] — ${site === 'res' ? 'Resident' : 'MS3'}?`,`cotw_20260831_catatonia_${site}.md`,['catatonia.md','exp_consult.md']],
      ...(site === 'res' ? [['Post-Event Learning Huddle (2 min)','rp-post-event-huddle.html']] : []),
    ];
    for (const [query,ref,protocols = []] of exactNames) {
      const rows = f.fdSearchResults(index,query,cur.synonyms,{});
      // A named resource follows any established safety prefix; punctuation must not add one.
      if (rows.find(r => r.kind === 'item')?.item.ref !== ref ||
          JSON.stringify(rows.filter(r => r.kind === 'protocol').map(r => r.item.ref)) !== JSON.stringify(protocols) ||
          rows.slice(0,protocols.length).some(r => r.kind !== 'protocol'))
        errors.push(`command search exact-name destination regression: ${query}`);
    }
    // Golden queries against THIS build's page-text index -- what the learner's search reads.
    const goldenPath = join(buildDir,'../../../tests/fixtures/search-golden.json');
    const bodyPath = join(siteDir,'search-index.json');
    if (existsSync(goldenPath) && existsSync(bodyPath)) {
      const golden = JSON.parse(readFileSync(goldenPath,'utf8'));
      const bodyIndex = JSON.parse(readFileSync(bodyPath,'utf8'));
      const search = q => f.fdSearchResults(index,q,cur.synonyms,{bodyIndex,searchExpanded:true});
      errors.push(...goldenErrors(golden,site,search,ref => !!index.byRef[ref]));
    } else if (!existsSync(goldenPath)) {
      errors.push('golden search fixture missing: tests/fixtures/search-golden.json');
    }
    return errors;
  } catch (error) {
    return [`command search validation failed: ${error.message}`];
  }
}
