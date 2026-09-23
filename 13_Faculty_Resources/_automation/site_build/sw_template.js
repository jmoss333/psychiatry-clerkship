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
function offlineVerifyUrls(input){
  if(!Array.isArray(input)||input.length<1||input.length>200)return null;
  var urls=[],seen=Object.create(null),url,hasRouteResource=false;
  for(var i=0;i<input.length;i++){
    url=input[i];
    if(typeof url!=='string'||!(url==='/'||url==='/search-index.json'||
      /^\/(?:content\/[A-Za-z0-9][A-Za-z0-9._-]*\.md|tools\/[A-Za-z0-9][A-Za-z0-9._-]*\.html)$/.test(url)))return null;
    if(url.indexOf('/content/')===0||url.indexOf('/tools/')===0)hasRouteResource=true;
    if(!seen[url]){ seen[url]=true; urls.push(url); }
  }
  return hasRouteResource?urls:null;
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
  if(!ev.data||ev.data.type!=='CW_OFFLINE_VERIFY'||!ev.ports||!ev.ports[0])return;
  var port=ev.ports[0],urls=offlineVerifyUrls(ev.data.urls);
  if(!urls){
    port.postMessage({version:VERSION,ready:false,present:[],missing:[]});
    return;
  }
  if(KILL){
    port.postMessage({version:VERSION,ready:false,present:[],missing:urls});
    return;
  }
  var task=Promise.resolve().then(function(){ return caches.open(CACHE); }).then(function(cache){
    return Promise.all(urls.map(function(url){
      return cache.match(url,{ignoreSearch:false}).then(function(hit){
        return {url:url,hit:!!hit};
      });
    }));
  }).then(function(rows){
    var present=[],missing=[];
    rows.forEach(function(row){ (row.hit?present:missing).push(row.url); });
    return {version:VERSION,ready:missing.length===0,present:present,missing:missing};
  }).catch(function(){
    return {version:VERSION,ready:false,present:[],missing:urls};
  }).then(function(response){ port.postMessage(response); });
  if(typeof ev.waitUntil==='function')ev.waitUntil(task);
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
