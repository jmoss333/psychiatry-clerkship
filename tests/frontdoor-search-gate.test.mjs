import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { searchCoverageErrors, checkBuiltSearch } from '../13_Faculty_Resources/_automation/site_build/frontdoor-search-gate.mjs';

test('removing the entire payload from a real Front Door shell fails closed', () => {
  const dir = mkdtempSync(join(tmpdir(),'search-payload-'));
  try {
    writeFileSync(join(dir,'index.html'), '<main id="fdApp"></main><script>var FD_AUDIENCE="ms3";</script>');
    assert.match(checkBuiltSearch(dir,'.').join('\n'), /FD_CURRICULUM/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

const listing = {pages:[
  {slug:'shared.md',sites:['ms3','res']},
  {slug:'case-ms3.md',sites:['ms3']},
  {slug:'case-res.md',sites:['res']},
  {slug:'feedback.html',sites:['ms3','res']},
]};
const excluded = [{ref:'feedback.html',reason:'utility'}];
const index = {byRef:{'shared.md':{ref:'shared.md'},'case-ms3.md':{ref:'case-ms3.md'}}};

test('search coverage catches a shipped case disappearing even when its index page remains', () => {
  assert.deepEqual(searchCoverageErrors(index,listing,'ms3',excluded),[]);
  const missing = structuredClone(index);
  delete missing.byRef['case-ms3.md'];
  assert.match(searchCoverageErrors(missing,listing,'ms3',excluded).join('\n'),/case-ms3.md/);
  const hidden = structuredClone(index);
  hidden.byRef['case-ms3.md'].readerOnly = true;
  assert.match(searchCoverageErrors(hidden,listing,'ms3',excluded).join('\n'),/case-ms3.md/);
});

test('coverage rejects wrong audiences, unknown exclusions and blank exclusion reasons', () => {
  const leaked = structuredClone(index);
  leaked.byRef['case-res.md'] = {ref:'case-res.md'};
  assert.match(searchCoverageErrors(leaked,listing,'ms3',excluded).join('\n'),/case-res.md/);
  assert.ok(searchCoverageErrors(index,listing,'ms3',[{ref:'ghost.md',reason:'utility'}]).length);
  assert.ok(searchCoverageErrors(index,listing,'ms3',[{ref:'feedback.html',reason:''}]).length);
  assert.ok(searchCoverageErrors(index,listing,'unknown',excluded).length);
});
