/* Generated per-site by common.py emit_service_worker() — do not edit built copies.
   Template tokens: __VERSION__, __KILL__, and the PRECACHE array between markers. */
var VERSION='__VERSION__';
var KILL=__KILL__;
var PRECACHE=/*__PRECACHE_START__*/[]/*__PRECACHE_END__*/;
var CACHE='cw-precache-'+VERSION;
var MEDIA_PREFIX=['/audio/','/audio_oe/','/media/'];
var MEDIA_EXT=/\.(mp4|vtt|m4a|mp3|wav)$/i;
var NET_TIMEOUT_MS=3000;

function isMedia(pathname){
  if(MEDIA_EXT.test(pathname)) return true;
  for(var i=0;i<MEDIA_PREFIX.length;i++){ if(pathname.indexOf(MEDIA_PREFIX[i])===0) return true; }
  return false;
}
function raceNetwork(request){
  return new Promise(function(resolve,reject){
    var timer=setTimeout(function(){ reject(new Error('sw-timeout')); }, NET_TIMEOUT_MS);
    fetch(request).then(function(r){ clearTimeout(timer); resolve(r); },
                        function(e){ clearTimeout(timer); reject(e); });
  });
}

self.addEventListener('install', function(ev){
  if(KILL) return;
  ev.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(PRECACHE); }));
});
self.addEventListener('activate', function(ev){
  ev.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.map(function(k){
      if(k.indexOf('cw-precache-')===0 && (KILL || k!==CACHE)) return caches.delete(k);
    }));
  }).then(function(){ if(KILL && self.registration) return self.registration.unregister(); }));
});
self.addEventListener('message', function(ev){
  if(ev.data && ev.data.type==='SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', function(ev){
  if(KILL) return;
  var url=new URL(ev.request.url);
  if(url.origin!==self.location.origin) return;         /* sp-proxy etc: browser-native */
  if(isMedia(url.pathname)) return;                     /* Range semantics: never respondWith */
  if(ev.request.mode==='navigate'){
    ev.respondWith(raceNetwork(ev.request).catch(function(){
      return caches.open(CACHE).then(function(c){ return c.match('/'); });
    }));
    return;
  }
  ev.respondWith(caches.open(CACHE).then(function(c){
    return c.match(ev.request,{ignoreSearch:true}).then(function(hit){
      return hit || raceNetwork(ev.request);
    });
  }));
});
