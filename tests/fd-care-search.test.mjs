import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
const base = '../13_Faculty_Resources/_automation/site_build/frontdoor/';
const path = new URL(base + 'fd_care_search.js', import.meta.url);
const src = existsSync(path) ? readFileSync(path, 'utf8') : '';
const data = readFileSync(new URL(base + 'fd_data.js', import.meta.url), 'utf8');
const F = new Function(data + src + ';return typeof fdCareDirectoryValidate === "function" ? {validate:fdCareDirectoryValidate,search:fdCareDirectorySearch,results:fdCareDirectoryResults,shell:fdCareSearch} : null;')();
const ids = ['aftercare','crisis','peer_support','basic_needs','community_services','housing_shelters','recovery_meetings','telehealth_providers'];
const row = (n, more={}) => ({id:'a'+n,category:'aftercare',name:'Support '+n,
  description:'Counseling and recovery',details:'Adults',area:'York',regions:['Southern Maine'],
  phone:'207-700-0123',contactHref:'tel:2077000123',website:'https://example.org/',
  verifiedDate:'2026-10-01',reviewAfter:'2027-03-30',verificationRequired:false,...more});
const feed = records => ({schemaVersion:1,generatedAt:'2026-10-12T00:00:00Z',sourceHash:'a'.repeat(64),
  categories:ids.map(id=>({id,label:id,available:true,count:records.filter(r=>r.category===id).length})),
  regionOptions:['Statewide','Southern Maine','NH'],records});

test('validates feed schema and distinguishes missing category coverage',()=>{
  assert.ok(F, 'native Care directory module exists');
  assert.throws(()=>F.validate({schemaVersion:2}));
  const partial=feed([row(1)]);partial.categories[2].available=false;
  assert.equal(F.validate(partial).partial,true);
  assert.equal(F.validate(feed([])).partial,false);
  const truncated=feed([row(1)]);truncated.categories[0].count=12;
  assert.equal(F.validate(truncated).partial,true);
});
test('searches all terms locally, combines filters and returns five rows per page',()=>{
  const rows=Array.from({length:12},(_,i)=>row(i));
  rows.push(row(99,{category:'peer_support',regions:['NH']}));
  const data=F.validate(feed(rows));
  const first=F.search(data,'support recovery','aftercare','Southern Maine',1);
  assert.equal(first.total,12);assert.equal(first.rows.length,5);assert.equal(first.pages,3);
  assert.equal(F.search(data,'support recovery','aftercare','Southern Maine',3).rows.length,2);
  assert.equal(F.search(data,'missing','aftercare','',1).total,0);
  assert.equal(F.search(data,'','peer_support','NH',1).total,1);
  assert.equal(F.search(data,'','','',1).idle,true);
});
test('includes statewide Maine listings only with matching Maine filters',()=>{
  const data=F.validate(feed([row(1,{regions:['Statewide']})]));
  assert.equal(F.search(data,'support','','Southern Maine',1).total,1);
  assert.equal(F.search(data,'support','','NH',1).total,0);
});
test('ranks whole resource names ahead of incidental substring matches',()=>{
  const data=F.validate(feed([row(1,{name:'Dynamic support'}),row(2,{name:'NAMI support'}),
    row(3,{name:'Family group (NAMI)'})]));
  assert.deepEqual(F.search(data,'nami','','',1).rows.map(r=>r.id),['a3','a2','a1']);
  assert.equal(F.search(data,'[nami]','','',1).total,0);
});
test('escapes directory text and drops unsafe actions without hiding the listing',()=>{
  const data=F.validate(feed([row(1,{name:'<img src=x onerror=alert(1)>',phone:'<b>phone</b>',
    contactHref:'javascript:alert(1)',website:'https://user:pass@example.org/'})]));
  const result=F.search(data,'','aftercare','',1);
  const html=F.results(data,result,'2026-10-12');
  assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|javascript:|user:pass|href="tel:/);
});
test('shows dates as recorded metadata and overdue notices without disabling calls',()=>{
  const data=F.validate(feed([row(1,{verifiedDate:'2020-01-01',reviewAfter:'2020-06-29'})]));
  const html=F.results(data,F.search(data,'','aftercare','',1),'2026-10-12');
  assert.match(html,/2020-01-01/);assert.match(html,/Verification due/);assert.match(html,/tel:2077000123/);
  assert.doesNotMatch(html,/Available now|accepting patients|faculty.verified/i);
  const boundary=F.validate(feed([row(1,{reviewAfter:'2026-10-12'})]));
  assert.match(F.results(boundary,F.search(boundary,'','aftercare','',1),'2026-10-12'),/Verification due/);
});
test('shell has explicit labels, no form action or named query, and fixed Finder fallback',()=>{
  const html=F.shell({careResources:[{id:'resource-finder',url:'https://reconnect-tools.netlify.app/tools/reconnect-resource-finder-v7.html'}]});
  assert.match(html,/<label[^>]+for="fd-care-directory-query"/);
  assert.match(html,/<label[^>]+for="fd-care-directory-region"/);
  assert.match(html,/autocomplete="off"/);assert.doesNotMatch(html,/\s(?:action|name)=|geolocation/i);
  assert.match(html,/href="https:\/\/reconnect-tools.netlify.app\/tools\/reconnect-resource-finder-v7.html"/);
});
