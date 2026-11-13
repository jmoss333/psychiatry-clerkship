import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const build = new URL('../13_Faculty_Resources/_automation/site_build/', import.meta.url);
const source = readFileSync(new URL('frontdoor/fd_library_reading.js', build), 'utf8');
const make = vm.runInNewContext(source + '\nfdCreateLibraryReading', {URL});
const origin = 'https://os.example.test';
const page = 'agitation.md';
const oldPage = 't_mood.md';
const tick = () => new Promise(resolve => setImmediate(resolve));

function browser() {
  const values = new Map();
  const events = new Map();
  const accounts = new Map();
  const calls = [];
  const popup = {};
  let sequence = 0, dest, failure = 0, hold, release;
  const win = {
    location:{origin:'https://library.example.test'}, navigator:{},
    localStorage:{getItem:k => values.get(k), setItem:(k,v) => values.set(k,v),
      removeItem:k => values.delete(k)},
    crypto:{randomUUID:() => 'id-' + ++sequence},
    addEventListener:(k,fn) => events.set(k,fn),
    open(url) { dest = new URL(url); return popup; },
    async fetch(url, options) {
      assert.equal(url, origin + '/api/library-reading');
      assert.equal(options.credentials, 'omit');
      const grant = options.headers.Authorization.slice(7);
      const payload = options.body && JSON.parse(options.body);
      calls.push({grant, method:options.method, payload});
      if (hold && options.method === 'PUT') {
        hold = false;
        await new Promise(resolve => { release = resolve; });
      }
      if (failure) return {ok:false,status:failure};
      const pages = accounts.get(grant) || new Set();
      accounts.set(grant, pages);
      if (payload) {
        assert.deepEqual(Object.keys(payload).sort(), ['page','read']);
        if (payload.read) pages.add(payload.page); else pages.delete(payload.page);
      }
      return {ok:true,json:async () => ({pages:[...pages].map(page => ({page}))})};
    }
  };
  const bridge = make({origin,pages:[page,oldPage]}, win, () => {});
  function confirm(grant, event = {}) {
    events.get('message')({origin,source:popup,data:{type:'clerkshipos.reading.connected',
      grant,state:dest.searchParams.get('state'),label:'Test learner'},...event});
  }
  return {bridge, calls, accounts, confirm, events, values, dest:() => dest,
    fail(code) { failure = code; }, hold() { hold = true; }, release() { release(); }};
}

test('pairing needs the same popup, exact origin and one-time state before exposing a reading grant',async () => {
  const b = browser();
  b.bridge.ask(null);
  assert.equal(b.dest().pathname,'/library-connect.html');
  assert.equal(b.dest().searchParams.get('origin'),'https://library.example.test');
  b.confirm('A',{source:{}}); b.confirm('A',{origin:'https://other.example.test'});
  b.confirm('A',{data:{type:'clerkshipos.reading.connected',state:'wrong',grant:'A'}});
  assert.equal(b.bridge.status().connected,false); assert.equal(b.calls.length,0);
  b.confirm('A'); b.confirm('B'); await tick();
  assert.deepEqual(b.calls.map(x=>[x.method,x.grant]),[['GET','A']]);
});

test('unpaired toggles stay local; only a newly marked page explicitly offered for pairing is sent',async () => {
  const b = browser();
  const local = {[oldPage]:{done:true},'tool.html':{done:true}};
  b.bridge.record(page,true); b.bridge.record('tool.html',true);
  assert.equal(b.calls.length,0);
  assert.equal(b.bridge.canOffer(oldPage),false); assert.equal(b.bridge.canOffer(page),true);
  b.bridge.ask(page); b.confirm('A'); await tick();
  assert.deepEqual(b.calls.filter(x=>x.method==='PUT').map(x=>x.payload),[{page,read:true}]);
  assert.equal(b.bridge.view(local)[page].done,true);
  assert.equal(b.bridge.view(local)[oldPage],undefined);
  assert.equal(b.bridge.view(local)['tool.html'].done,true);
  await b.bridge.disconnect();
  assert.equal(b.bridge.view(local),local);
  b.bridge.ask(oldPage); b.confirm('B'); await tick();
  assert.equal(b.calls.filter(x=>x.method==='PUT' && x.grant==='B').length,0);
});

test('remote marks project as reading only; queued retry sends the newest toggle and excludes tools',async () => {
  const b = browser();
  b.accounts.set('A',new Set([oldPage]));
  b.bridge.ask(null); b.confirm('A'); await tick();
  assert.equal(b.bridge.view({})[oldPage].done,true);
  b.fail(503); await b.bridge.record(oldPage,false);
  await b.bridge.record(page,true); await b.bridge.record('tool.html',true);
  assert.equal(b.bridge.view({})[oldPage],undefined);
  assert.equal(b.bridge.view({})[page].done,true); assert.equal(b.bridge.status().failed,true);
  b.fail(0); await b.bridge.sync(); assert.deepEqual([...b.accounts.get('A')],[page]);
  b.hold(); const inFlight = b.bridge.record(page,false);
  b.bridge.record(page,true); b.release(); await inFlight;
  assert.deepEqual([...b.accounts.get('A')],[page]);
  assert.equal(b.calls.filter(x=>x.payload?.page==='tool.html').length,0);
});

test('an expired grant discards the former queue; a replacement identity starts clean',async () => {
  const b = browser();
  b.bridge.ask(null); b.confirm('A'); await tick();
  b.fail(401); await b.bridge.record(page,true);
  assert.equal(b.bridge.status().connected,false);
  assert.match(b.bridge.status().text,/expired/);
  b.fail(0); b.bridge.ask(page); b.confirm('B'); await tick();
  assert.equal(b.calls.filter(x=>x.grant==='B' && x.payload).length,0);
  assert.equal(b.bridge.view({})[page],undefined);
});

test('actually shipped reader control and classic toggle use the paired controller',() => {
  const shell=readFileSync(new URL('spa_index.html',build),'utf8');
  const reader=readFileSync(new URL('frontdoor/fd_reader.js',build),'utf8');
  const wire=readFileSync(new URL('frontdoor/fd_wire.js',build),'utf8');
  assert.match(reader,/!station&&!isTool.*osReadingMarkup\(item.ref,true\)/);
  assert.match(shell,/saveReadToggle\(mf,!\(pp\[mf\]&&pp\[mf\].done\)\)/);
  assert.match(shell,/fdOSReading.record\(effect.ref,effect.done\)/);
  assert.match(wire,/if\(o.recordToggle\)o.recordToggle\(result.effect\)/);
  assert.match(shell,/facultyPreviewRequest\|\|!FD_OS_READING_CONFIG\?null:/);
});
