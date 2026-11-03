var CACHE = 'signage-v1';
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(e){
  var u = new URL(e.request.url);
  if(e.request.method !== 'GET') return;
  var cacheable = u.pathname.indexOf('/storage/v1/object/public/') === 0 || u.origin === location.origin || u.host === 'fonts.googleapis.com' || u.host === 'fonts.gstatic.com';
  if(!cacheable) return;
  e.respondWith(caches.open(CACHE).then(function(c){
    return fetch(e.request).then(function(r){ if(r && r.ok) c.put(e.request, r.clone()); return r; })
      .catch(function(){ return c.match(e.request).then(function(m){ return m || Response.error(); }); });
  }));
});
