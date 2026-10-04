// Project Hub service worker — only so the browser offers "Install" (taskbar icon + jump list).
// It caches nothing: every request goes to the network as usual, so data is never stale.
// Registered with scope /project_hub_01, so it never touches the other pages on the server.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
