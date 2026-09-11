/* Service worker dell'app agenti: riceve le notifiche push anche ad app chiusa. Non mette in cache le pagine. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: "Carminello", body: e.data ? e.data.text() : "" }; }
  const p = [self.registration.showNotification(d.title || "Carminello Agenti", {
    body: d.body || "", icon: "assets/icons/icon-192.png", badge: "assets/icons/icon-192.png", tag: d.tag || ("carminello-" + Date.now()), renotify: true, vibrate: [200, 100, 200], requireInteraction: false, data: { url: d.url || "#/clienti" }
  })];
  e.waitUntil(Promise.all(p));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL("./index.html" + (e.notification.data && e.notification.data.url || ""), self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const w = list.find(c => c.url.startsWith(self.registration.scope));
    if (w) { w.navigate(url); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
