import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const base = new URL('../13_Faculty_Resources/_automation/site_build/', import.meta.url);
const read = n => readFileSync(new URL('frontdoor/' + n, base), 'utf8');
const optional = n => existsSync(new URL('frontdoor/' + n, base)) ? read(n) : '';
let payload = null;
if (existsSync(new URL('care_inserts_payload.py', base))) {
  const r = spawnSync('python3', ['-B', '-c', 'import json,sys; sys.path.insert(0,".."); import care_inserts_payload as p; print(json.dumps(p.build_payload()))'], {cwd:fileURLToPath(base), encoding:'utf8', timeout:60000});
  assert.equal(r.status, 0, r.stderr); payload = JSON.parse(r.stdout);
}
const P = new Function(read('fd_data.js') + optional('fd_care_profile.js') + read('fd_care_packet.js') + optional('fd_care_packet_sheet.js') + `;return {
blank:fdCarePacketBlank, normalize:fdCarePacketNormalize, add:fdCarePacketAddMany, context:fdCarePacketContext,
button:fdCarePacketButton, bulk:fdCarePacketBulk, tray:fdCarePacketTray, create:fdCreateCarePacket};`)();
const data = {categories:[{id:'aftercare',label:'Aftercare'}], records:Array.from({length:16},(_,i)=>({id:'a'+i,category:'aftercare',name:'Support '+i,phone:'207-700-0123',contactHref:'tel:2077000123',website:'https://example.org/'}))};
const state = n => ({...P.blank(),ids:Array.from({length:n},(_,i)=>'a'+i)});
const make = () => {const m=new Map(); const c=P.create({payload,storage:{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}}); c.mount(null,null,()=>data);return {c,m};};

test('selected cards describe removal in both the visible label and accessible name',()=>{
  const html=P.button(data.records[0],P.context(state(1),data,payload));
  assert.match(html,/>Remove from packet<\/button>/);
  assert.match(html,/aria-label="Remove from packet: Support 0"/);
  assert.doesNotMatch(html,/disabled/);
});
test('bulk capacity preview counts new matches and held slots before the action',()=>{
  const result={rows:data.records.slice(8,13),allIds:data.records.map(r=>r.id),total:16};
  const html=P.bulk(result,P.context(state(10),data,payload));
  assert.match(html,/Add from this page/);assert.match(html,/Add from all results/);
  assert.match(html,/2 spaces remaining/);assert.match(html,/2 of 3 new matches will fit/);assert.match(html,/2 of 6 new matches will fit/);
  const partial={...data,partial:true,records:data.records.slice(1)};
  assert.match(P.bulk(result,P.context(state(10),partial,payload)),/2 spaces remaining/);
});
test('bulk result identifies every omitted listing and distinguishes unavailable from full',()=>{
  const r=P.add(state(10),['a0','a10','a11','a12','gone','a13','a10'],data,payload);
  assert.deepEqual(r.state.ids,[...state(10).ids,'a10','a11']);assert.equal(r.added,2);assert.equal(r.already,1);
  assert.equal(r.skipped,2);assert.equal(r.unavailable,1);
  assert.deepEqual(r.omitted.map(x=>[x.id,x.reason]),[['a12','capacity'],['gone','unavailable'],['a13','capacity']]);
});
test('no-op bulk preserves the packet, while reorder and removal update the saved listing order',()=>{
  const {c,m}=make();c.addMany(['a0','a1','a2']);
  const before=m.get('fd_care_packet_v1');
  c.addMany(['a0','a1']);assert.equal(m.get('fd_care_packet_v1'),before);
  c.move('a1',-1);assert.deepEqual(c.ids(),['a1','a0','a2']);
  c.remove('a2');assert.deepEqual(c.ids(),['a1','a0']);c.leave();
});

test('bulk outcome is visibly retained in the tray, safely escaped, and cleared with the packet',()=>{
  const {c,m}=make();const root={isConnected:true,innerHTML:''};c.mount(root,null,()=>data);
  c.addMany(data.records.map(r=>r.id));assert.match(root.innerHTML,/Added 12 listings/);
  assert.match(root.innerHTML,/See what wasn’t added/);assert.match(root.innerHTML,/Support 12/);assert.match(root.innerHTML,/packet is full/);
  assert.doesNotMatch(m.get('fd_care_packet_v1'),/omitted|bulkResult/);
  c.clear();assert.doesNotMatch(root.innerHTML,/See what wasn’t added/);assert.equal(m.size,0);c.leave();
});
test('review wording and category-order guidance are presented, and unexpected rationale is discarded',()=>{
  const html=P.tray(state(1),data,{payload});
  for(const copy of ["Check these resources with the patient before sharing. Do not enter patient-identifying information.","Listings are grouped by service type."])assert.ok(html.includes(copy),copy);
  assert.doesNotMatch(html,/data-fd-care-packet-gate|Review complete/);
  assert.deepEqual(P.normalize({...state(1),why:{a0:'private rationale'}}).why,{});
});

test('a later individual change removes an obsolete bulk outcome from the tray',()=>{
  const {c}=make();const root={isConnected:true,innerHTML:''};c.mount(root,null,()=>data);
  c.addMany(data.records.map(r=>r.id));assert.match(root.innerHTML,/Added 12 listings/);
  c.toggle('a0');assert.doesNotMatch(root.innerHTML,/Added 12 listings|See what wasn’t added/);c.leave();
});
