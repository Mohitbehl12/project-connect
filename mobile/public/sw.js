// Service worker for the home-screen web app: shows push notifications and opens the right screen
// when one is tapped. It deliberately doesn't cache anything, so the app is never stuck on an old version.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Links in notifications use the server's paths; map them to the app's screens.
function appUrl(link) {
  if (!link || typeof link !== "string" || !link.startsWith("/")) return "/app/";
  const chat = link.match(/^\/matches\/([\w-]+)/);
  if (chat) return "/app/chat/" + chat[1];
  return "/app" + link;
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Project Connect", body: event.data && event.data.text() }; }
  const title = data.title || "Project Connect";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "/app/icons/icon-192.png",
    badge: "/app/icons/icon-192.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: appUrl(data.link) },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/app/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).pathname.startsWith("/app")) { await c.focus(); if ("navigate" in c) return c.navigate(url); return; }
    }
    return self.clients.openWindow(url);
  })());
});
