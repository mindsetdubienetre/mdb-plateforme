const CACHE = 'mdb-v3';
const FILES = [
  '/index.html',
  '/MDB_membre_A.html',
  '/MDB_semaine.html',
  '/MDB_exercice.html',
  '/MDB_onboarding.html',
  '/MDB_celebration.html',
  '/MDB_checkin.html',
  '/MDB_admin_connected.html',
  '/therapies-respiration.html',
  '/therapies-eft.html',
  '/therapies-meditations.html',
  '/therapies-hypnose.html',
  '/assets/mdb.css',
  '/manifest.json',
  '/icon.svg'
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
  // Network-first pour les requêtes Supabase (pour avoir les données fraîches)
  if (e.request.url.includes('supabase.co')) {
    e.respondWith(fetch(e.request).catch(function(){ return caches.match(e.request); }));
    return;
  }
  // Cache-first pour les assets statiques
  e.respondWith(caches.match(e.request).then(function(r) { return r || fetch(e.request); }));
});
