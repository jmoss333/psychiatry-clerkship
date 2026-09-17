/** Command-search coverage, evaluated against the actual audience payload after build.
 * No second scorer: execute the exact pure join/search snippets present in the built HTML.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function searchCoverageErrors(index, shipped, site, exclusions) {
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
  const actual = new Set(Object.values(index.byRef).filter(i => !i.readerOnly).map(i => i.ref));
  for (const ref of expected) if (!actual.has(ref)) errors.push(`shipped resource omitted from command search: ${ref}`);
  for (const ref of actual) if (!expected.has(ref)) errors.push(`unexpected command search resource: ${ref}`);
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
    const errors = searchCoverageErrors(index,shipped,site,canonical.searchExclude);
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
      [`Catatonia [Aug 31] — ${site === 'res' ? 'Resident' : 'MS3'}?`,`cotw_20260831_catatonia_${site}.md`,['exp_consult.md']],
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
    return errors;
  } catch (error) {
    return [`command search validation failed: ${error.message}`];
  }
}
