self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

async function cacheThenNetwork(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    console.log("Found response in cache:", cachedResponse);
    return cachedResponse;
  }
  console.log("Falling back to network");
  return fetch(request);
}

self.addEventListener('fetch', event => {
    console.log('Request:', event.request.url);
    
    // Source - https://stackoverflow.com/a/49719964
    // Posted by rjbultitude, modified by community. See post 'Timeline' for change history
    // Retrieved 2026-06-16, License - CC BY-SA 3.0

    if (event.request.cache === 'only-if-cached' && event.request.mode !== 'same-origin') {
        return;
    }

   event.respondWith(cacheThenNetwork(event.request));
});