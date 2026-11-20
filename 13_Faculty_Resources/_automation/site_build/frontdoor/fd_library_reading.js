/* Only an explicit page toggle can enter the outbox. Device progress, practice receipts and
   free text never cross this boundary. The grant and all cached state belong to one pairing. */
function fdCreateLibraryReading(config, win, onChange) {
  if (!config || !config.origin) return null;
  var pages = new Set(config.pages);
  var pairKey = 'cw_os_reading_pair_v1';
  var prefix = 'cw_os_reading_v1_';
  var popup = null, pairing = null, wantedPage = null;
  var busy = false, requested = false, notice = '', failed = false;
  var localCandidate = null, viewCache = null;
  var storage;
  try { storage = win.localStorage; } catch (_) { return null; }

  function load(key) {
    try { return JSON.parse(storage.getItem(key)); } catch (_) { return null; }
  }
  function pair() {
    var p = load(pairKey);
    return p && p.origin === config.origin && typeof p.id === 'string' && p.grant ? p : null;
  }
  function key(p, part) { return prefix + p.id + '_' + part; }
  function set(keyName, value) { storage.setItem(keyName, JSON.stringify(value)); }
  function markKey(p, page) { return key(p, 'mark_' + page); }
  function active(p) { var current = pair(); return current && current.id === p.id; }
  function view(local) {
    var p = pair();
    if (!p) return local;
    if (!viewCache || viewCache.id !== p.id) {
      var saved = load(key(p, 'read')) || {}, reads = {};
      pages.forEach(function(page) {
        var entry = load(markKey(p, page));
        if (entry ? entry.read : saved[page]) {
          reads[page] = {done:true, at:(entry && entry.at) || (saved[page] || {}).at || ''};
        }
      });
      viewCache = {id:p.id, reads:reads};
    }
    var result = Object.assign({}, local);
    Object.keys(result).forEach(function(page) { if (pages.has(page)) delete result[page]; });
    return Object.assign(result, viewCache.reads);
  }
  function forget(p) {
    viewCache = null;
    if (active(p)) storage.removeItem(pairKey);
    storage.removeItem(key(p, 'read'));
    pages.forEach(function(page) { storage.removeItem(markKey(p, page)); });
  }
  function ask(actionPage) {
    if (pair()) return;
    pairing = win.crypto.randomUUID();
    wantedPage = localCandidate === actionPage ? actionPage : null;
    var url = new URL('/library-connect.html', config.origin);
    url.searchParams.set('origin', win.location.origin);
    url.searchParams.set('state', pairing);
    popup = win.open(url.href, 'clerkshipos_reading_pair');
    notice = popup ? 'Confirm in ClerkshipOS, then return here.' : 'Allow the connection window and try again.';
    onChange();
  }
  function receive(event) {
    var d = event.data;
    if (!popup || event.source !== popup || event.origin !== config.origin || !d ||
        d.type !== 'clerkshipos.reading.connected' || d.state !== pairing ||
        typeof d.grant !== 'string' || !d.grant || pair()) return;
    var p = {id:pairing, origin:config.origin, grant:d.grant, label:String(d.label || '').slice(0, 100)};
    var page = wantedPage;
    popup = null; pairing = null; wantedPage = null; localCandidate = null;
    try { set(pairKey, p); }
    catch (_) { notice = 'Allow storage on this device to connect.'; onChange(); return; }
    notice = ''; failed = false;
    if (page) record(page, true);
    else sync();
  }
  async function request(p, method, body) {
    var options = {method:method, credentials:'omit', redirect:'error', cache:'no-store',
      headers:{Authorization:'Bearer ' + p.grant}};
    if (body) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
    var response = await win.fetch(config.origin + '/api/library-reading', options);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        if (active(p)) {
          forget(p);
          notice = 'Connection expired. Sync stopped. Local reading history is still available.';
        }
      }
      throw new Error('Reading sync unavailable');
    }
    return response;
  }
  async function transfer(p) {
    if (!active(p)) return;
    for (var page of pages) {
      var itemKey = markKey(p, page), entry = load(itemKey);
      while (entry && active(p)) {
        await request(p, 'PUT', {page:page, read:entry.read});
        if (!active(p)) return;
        var latest = load(itemKey);
        if (latest && latest.id === entry.id) {
          var saved = load(key(p, 'read')) || {};
          if (entry.read) saved[page] = {at:entry.at}; else delete saved[page];
          set(key(p, 'read'), saved);
          storage.removeItem(itemKey);
        }
        entry = load(itemKey);
      }
    }
    var response = await request(p, 'GET');
    var data = await response.json();
    if (!active(p)) return;
    if (!data || !Array.isArray(data.pages)) throw new Error('Invalid reading response');
    var prior = load(key(p, 'read')) || {}, fresh = {};
    data.pages.forEach(function(row) {
      if (row && pages.has(row.page)) fresh[row.page] = prior[row.page] || {};
    });
    set(key(p, 'read'), fresh);
    viewCache = null;
  }
  async function sync() {
    var p = pair();
    if (!p) return;
    if (busy) { requested = true; return; }
    busy = true; failed = false; notice = ''; onChange();
    try {
      if (win.navigator.locks) {
        await win.navigator.locks.request(key(p, 'send'), function() { return transfer(p); });
      } else await transfer(p);
    } catch (_) {
      if (active(p)) {
        failed = true;
        notice = 'Could not sync. Your changes are saved on this device.';
      }
    } finally {
      busy = false; onChange();
      if (requested) { requested = false; return sync(); }
    }
  }
  function record(page, read) {
    var p = pair();
    if (!pages.has(page)) return;
    if (!p) { localCandidate = read ? page : null; return; }
    viewCache = null;
    try {
      set(markKey(p, page), {id:win.crypto.randomUUID(), read:read === true,
        at:new Date().toISOString().slice(0, 10)});
    } catch (_) { failed = true; notice = 'Storage is full. This change could not be queued.'; onChange(); return; }
    return sync();
  }
  async function disconnect() {
    var p = pair();
    if (!p) return;
    forget(p); notice = ''; failed = false; onChange();
    try { await request(p, 'DELETE'); }
    catch (_) {
      if (!pair()) { notice = 'Disconnected here. Server revocation could not be confirmed.'; onChange(); }
    }
  }
  function status() {
    var p = pair();
    return {connected:!!p, failed:failed, text:notice || (p ?
      (busy ? 'Syncing reading…' : 'Reading synced') + (p.label ? ' · ' + p.label : ' to ClerkshipOS') :
      'Reading saved on this device.')};
  }
  win.addEventListener('message', receive);
  win.addEventListener('online', sync);
  win.addEventListener('focus', sync);
  win.addEventListener('storage', function(event) {
    if (event.key === pairKey || event.key === null) {
      viewCache = null; localCandidate = null; notice = ''; failed = false; onChange(); sync();
    } else if (event.key.indexOf(prefix) === 0) { viewCache = null; onChange(); }
  });
  return {ask:ask, view:view, record:record, sync:sync, disconnect:disconnect,
    status:status, canOffer:function(page) { return !pair() && page === localCandidate; },
    allowed:function(page) { return pages.has(page); }};
}
