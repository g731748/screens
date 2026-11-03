var CACHE = 'signage-v2';
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); })); }).then(function(){ return self.clients.claim(); }));
});
function good(r){ return r && (r.ok || r.type === 'opaque'); }
self.addEventListener('fetch', function(e){
  var u = new URL(e.request.url);
  if(e.request.method !== 'GET') return;
  var isImg = u.pathname.indexOf('/storage/v1/object/public/') === 0;
  var cacheable = isImg || u.origin === location.origin || u.host === 'fonts.googleapis.com' || u.host === 'fonts.gstatic.com';
  if(!cacheable) return;
  e.respondWith(caches.open(CACHE).then(function(c){
    if(isImg){
      /* images never change under the same name, so serve from cache first and save bandwidth */
      return c.match(e.request).then(function(m){
        if(m) return m;
        return fetch(e.request).then(function(r){ if(good(r)) c.put(e.request, r.clone()); return r; });
      });
    }
    return fetch(e.request).then(function(r){ if(good(r)) c.put(e.request, r.clone()); return r; })
      .catch(function(){ return c.match(e.request).then(function(m){ return m || Response.error(); }); });
  }));
});
