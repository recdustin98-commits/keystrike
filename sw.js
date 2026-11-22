// Minimal service worker so the game can be installed as an app. Always uses the network (no stale versions).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
