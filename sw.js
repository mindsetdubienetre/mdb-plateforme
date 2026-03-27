const CACHE='mdb-v3';
const FILES=['/index.html','/MDB_membre_A.html','/MDB_onboarding.html','/MDB_exercice.html','/MDB_celebration.html','/MDB_admin_connected.html','/manifest.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)))});
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
