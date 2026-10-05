/*
 * Web Share Target handler (SHARE-003), imported by the generated service
 * worker. Files shared to Progressive Web Office (for example from QRShare)
 * arrive as a multipart POST; the first file (or the shared text) is kept in
 * a private cache and the app is opened to pick it up.
 */
const SHARE_CACHE = 'pwo-share-target';
const SHARED_ENTRY = 'shared-file';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.origin !== self.location.origin || !url.pathname.endsWith('/share-target')) return;
  event.respondWith(
    (async () => {
      const app = new URL('./', self.registration.scope);
      try {
        const form = await event.request.formData();
        const file = form.getAll('file').find((f) => typeof f !== 'string');
        let body;
        let name;
        let type;
        if (file) {
          body = file;
          name = file.name || 'shared';
          type = file.type || 'application/octet-stream';
        } else {
          const text = [form.get('title'), form.get('text'), form.get('url')].filter((v) => typeof v === 'string' && v).join('\n\n');
          if (!text) return Response.redirect(app.href, 303);
          body = text;
          name = 'shared.md';
          type = 'text/markdown';
        }
        const cache = await caches.open(SHARE_CACHE);
        await cache.put(new URL(SHARED_ENTRY, self.registration.scope).href, new Response(body, { headers: { 'content-type': type, 'x-file-name': encodeURIComponent(name) } }));
        app.searchParams.set('shared', '1');
      } catch {
        /* open the app without a file */
      }
      return Response.redirect(app.href, 303);
    })(),
  );
});

/*
 * NOTIF-001: a click on a reminder of an event brings the application
 * forward and opens the note of the event (or opens the application).
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data && event.notification.data.path;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = windows[0];
      if (client) {
        await client.focus();
        if (path) client.postMessage({ type: 'pwo-open-event', path });
        return;
      }
      await self.clients.openWindow(new URL('./', self.registration.scope).href);
    })(),
  );
});
