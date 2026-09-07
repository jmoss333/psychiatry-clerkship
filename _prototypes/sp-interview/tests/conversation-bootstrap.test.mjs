import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync(new URL('../sp-interview.html', import.meta.url), 'utf8');
function previewHelpers() {
  const context = { URLSearchParams, e: (tag, props, ...children) => ({tag, props, children}) };
  vm.createContext(context);
  for (const name of ['isLocalDanaPreview', 'isDanaConversationPreview', 'danaConversationPreviewEntry']) {
    const match = html.match(new RegExp('function ' + name + '\\(location, config\\)\\{[\\s\\S]*?\\n\\}'));
    assert.ok(match, 'explicit preview helper must exist: ' + name);
    vm.runInContext(match[0], context);
  }
  return context;
}
const helpers = previewHelpers();
const gate = (location, config) => helpers.isDanaConversationPreview(location, config);
const config = { generated: true, providerMode: 'mock' };
test('conversation requires local generated mock preview and explicit opt-in', () => {
  assert.equal(gate({hostname:'127.0.0.1', protocol:'http:', search:'?danaConversation=1'}, config), true);
  assert.equal(gate({hostname:'localhost', protocol:'http:', search:'?danaConversation=1'}, config), true);
  for (const hostname of ['une-ms3-psychiatry.netlify.app','localhost.example.com','192.168.1.4']) {
    assert.equal(gate({hostname, protocol:'https:', search:'?danaConversation=1'}, config), false);
  }
  assert.equal(gate({hostname:'localhost', protocol:'http:', search:''}, config), false);
  assert.equal(gate({hostname:'localhost', protocol:'http:', search:'?danaConversation=1'}, {generated:true,providerMode:'live'}), false);
  assert.equal(gate({hostname:'localhost', protocol:'http:', search:'?danaConversation=1'}, {}), false);
  assert.equal(gate({hostname:'', protocol:'file:', search:'?danaConversation=1'}, config), false);
});
test('prototype modules are absent from learner build output registry', () => {
  const shipped = fs.readFileSync(new URL('../../../13_Faculty_Resources/_automation/site_build/shipped_pages.json', import.meta.url), 'utf8');
  assert.equal(shipped.includes('sp-interview.conversation'), false);
  assert.equal(shipped.includes('sp-interview.turns'), false);
  assert.equal(shipped.includes('sp-interview.recordings'), false);
  assert.equal(shipped.includes('sp-interview.responses'), false);
  assert.equal(shipped.includes('sp-interview.live'), false);
  assert.equal(shipped.includes('sp-interview.retry'), false);
  assert.equal(shipped.includes('sp-interview.bookmarks'), false);
  assert.equal(shipped.includes('sp-interview.local-cases'), false);
  assert.equal(shipped.includes('sp-encounter-profiles'), false);
  assert.equal(shipped.includes('sp-encounter-rhythm'), false);
  assert.equal(shipped.includes('sp-encounter-ui'), false);
  assert.equal(shipped.includes('dana-live-server'), false);
  assert.equal(shipped.includes('output/speech/dana-marin'), false);
});

test('recorded playback is loaded only through the opt-in prototype bootstrap', () => {
  assert.ok(/loadPrototypeScript\('\.\/sp-interview\.recordings\.js'\)/.test(html), 'load recordings through the local-only gate');
  assert.doesNotMatch(html, /<script[^>]+src=["'][^"']*sp-interview\.recordings\.js/);
});

test('ordinary local mock preview offers a separate conversation without opting in', () => {
  const location = {hostname:'127.0.0.1', protocol:'http:', search:''};
  const entry = helpers.danaConversationPreviewEntry(location, config);
  const anchor = entry.children[2].children[0];
  assert.equal(anchor.tag, 'a');
  assert.equal(anchor.props.href, './sp-interview.preview.html?danaConversation=1');
  assert.equal(anchor.children[0], 'Talk with Dana');
  assert.match(entry.children[1].children[0], /separate practice encounter/);
  assert.equal(gate(location, config), false, 'the entry does not activate the speech sidecars');
  const loadedScripts = [], rendered = [];
  const context = previewHelpers();
  context.window = {location};
  context.previewConfig = config;
  context.App = function App() {};
  context.document = {
    getElementById: () => ({}),
    createElement: () => ({}),
    head: {appendChild: script => loadedScripts.push(script.src)},
  };
  context.ReactDOM = {createRoot: () => ({render: node => rendered.push(node)})};
  const bootstrap = html.slice(html.indexOf('if(isDanaConversationPreview(window.location,previewConfig)){'), html.lastIndexOf('\n})();\n</script>'));
  vm.runInContext(bootstrap, context);
  assert.equal(loadedScripts.length, 0, 'the ordinary bootstrap loads no conversation sidecars');
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].tag, context.App, 'the ordinary typing app still mounts');
  const selection = html.slice(html.indexOf("if(S.screen==='select'){"), html.indexOf('/* ---------- encounter ---------- */'));
  assert.match(selection, /danaConversationPreviewEntry\(window\.location,previewConfig\)/);
  assert.equal((html.match(/danaConversationPreviewEntry\(window\.location,previewConfig\)/g) || []).length, 1, 'entry appears only before starting a typing encounter');
  assert.equal(helpers.danaConversationPreviewEntry({...location,search:'?danaConversation=1'}, config), null);
});

test('conversation entry is absent outside local generated mock previews', () => {
  for (const hostname of ['une-ms3-psychiatry.netlify.app', 'localhost.example.com', '192.168.1.4']) {
    assert.equal(helpers.danaConversationPreviewEntry({hostname,protocol:'https:',search:''}, config), null);
  }
  for (const settings of [{}, {generated:false,providerMode:'mock'}, {generated:true,providerMode:'live'}]) {
    assert.equal(helpers.danaConversationPreviewEntry({hostname:'localhost',protocol:'http:',search:''}, settings), null);
  }
  assert.equal(helpers.danaConversationPreviewEntry({hostname:'',protocol:'file:',search:''}, config), null);
});

test('each opt-in page load refreshes local prototype scripts instead of reusing stale code', async () => {
  async function boot(time, live = false) {
    const context = previewHelpers(), scripts = [];
    context.Date = {now: () => time};
    context.window = {location: {hostname:'127.0.0.1',protocol:'http:',search:'?danaConversation=1' + (live ? '&danaLive=1' : '')},
      SPInterviewConversation: {mount: () => {}}, __SP_TEST__: {}, __SP_PACK__: {}};
    context.previewConfig = config;
    context.document = {getElementById: () => ({}), createElement: () => ({}),
      head: {appendChild: script => {scripts.push(script.src); script.onload();}}};
    const bootstrap = html.slice(html.indexOf('if(isDanaConversationPreview(window.location,previewConfig)){'), html.lastIndexOf('\n})();\n</script>'));
    vm.runInContext(bootstrap, context);
    await new Promise(resolve => setImmediate(resolve));
    return scripts;
  }
  const first = await boot(100), second = await boot(101);
  assert.equal(first.length, 8);
  assert.deepEqual(first.map(src => src.split('?')[0]), ['./sp-interview.turns.js','./sp-interview.local-dana.js','./sp-interview.recordings.js','./sp-interview.responses.js','./sp-encounter-profiles.js','./sp-encounter-rhythm.js','./sp-encounter-ui.js','./sp-interview.conversation.js']);
  assert.deepEqual(second.map(src => src.split('?')[0]), first.map(src => src.split('?')[0]));
  assert.ok(first.every((src, index) => src !== second[index]), 'a later page load must request fresh versions of all eight local scripts');
  const live = await boot(102, true);
  assert.deepEqual(live.map(src => src.split('?')[0]), [...first.map(src => src.split('?')[0]), './sp-interview.local-cases.js', './sp-interview.live.js', './sp-interview.retry.js', './sp-interview.bookmarks.js']);
});

test('draft registry is never loaded outside the explicit local live conversation bootstrap',async()=>{
  for(const [hostname,search,settings] of [
    ['127.0.0.1','?danaConversation=1',config],
    ['127.0.0.1','?danaLive=1&case=sp_alcohol_ambivalence_001',config],
    ['une-ms3-psychiatry.netlify.app','?danaConversation=1&danaLive=1',config],
    ['localhost','?danaConversation=1&danaLive=1',{generated:false,providerMode:'mock'}],
  ]){
    const context=previewHelpers(),scripts=[];
    context.window={location:{hostname,protocol:'http:',search},SPInterviewConversation:{mount(){}},__SP_TEST__:{},__SP_PACK__:{}};
    context.previewConfig=settings;context.App=function(){};context.ReactDOM={createRoot:()=>({render(){}})};
    context.document={getElementById:()=>({}),createElement:()=>({}),head:{appendChild(script){scripts.push(script.src);script.onload();}}};
    vm.runInContext(html.slice(html.indexOf('if(isDanaConversationPreview(window.location,previewConfig)){'),html.lastIndexOf('\n})();\n</script>')),context);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(scripts.some(src=>src.includes('local-cases')),false,hostname+search);
  }
});
