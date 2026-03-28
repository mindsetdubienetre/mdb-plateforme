const CACHE = 'mdb-v1';
const FILES = [
  '/index.html',
  '/MDB_membre_A.html',
  '/MDB_exercice.html',
  '/MDB_onboarding.html',
  '/MDB_celebration.html',
  '/MDB_admin_connected.html',
  '/manifest.json'
];
self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(FILES); }));
  self.skipWaiting();
});
self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(keys) {
    return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }));
});
self.addEventListener('fetch', function(e) {
  e.respondWith(caches.match(e.request).then(function(r) { return r || fetch(e.request); }));
});
