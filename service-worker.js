importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDVWKRCtjg7ppR-D8ZNs-TfSwPlWdXXQ5Q",
  authDomain: "greek-vocab-leaderboard.firebaseapp.com",
  projectId: "greek-vocab-leaderboard",
  storageBucket: "greek-vocab-leaderboard.firebasestorage.app",
  messagingSenderId: "473409624300",
  appId: "1:473409624300:web:8288c792af4f3c32586dc9"
});

const messaging = firebase.messaging();

// No manual showNotification — Firebase auto-displays from the notification
// field in the payload. Calling showNotification here caused iOS to show
// two notifications (APNs auto-display + our manual call).
messaging.onBackgroundMessage(function () {
  try { navigator.setAppBadge?.(); } catch {}
});

// Handle taps on notifications shown via registration.showNotification() in
// the foreground path. Firebase's own handler covers its background notifications
// (those have FCM_MSG in their data); skip those to avoid double-handling.
self.addEventListener("notificationclick", (event) => {
  if (event.notification.data?.FCM_MSG) return; // let Firebase handle it
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = data.open === "calendar" && data.action === "commit" && data.eventId
    ? `./?open=calendar&action=commit&eventId=${encodeURIComponent(data.eventId)}&msgId=${encodeURIComponent(data.msgId || "")}`
    : "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      const appClient = clients.find(c => c.visibilityState === "visible") || clients[0];
      if (appClient) {
        if ("navigate" in appClient) return appClient.navigate(targetUrl).then(client => client?.focus());
        return appClient.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

const CACHE_NAME = "disciple-builder-v3.0.456";

// Rhema data files use pinned data versions (RHEMA_DATA_VERSIONS in app.js).
// Only update these when the underlying dataset actually changes — not on every
// app version bump — so users don't re-download 50 MB of Bible data unnecessarily.
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css?v=3.0.456",
  "./vocab.js?v=3.0.8",
  "./app.js?v=3.0.456",
  "./bible-threads.js?v=3.0.402",
  "./bible-intros.js?v=3.0.418",
  "./rhema-english-dictionary.js?v=3.0.417",
  "./bible-atlas.js?v=3.0.349",
  "./bible-map.js?v=3.0.406",
  "./verse-structure.js?v=3.0.429",
  "./vs-structure.js?v=3.0.450",
  // Self-hosted fonts (icons + skin fonts) — pinned, they effectively never change
  "./assets/fonts/fonts.css?v=3.0.415",
  "./assets/fonts/ms-outlined-0.woff2",
  "./assets/fonts/ms-rounded-0.woff2",
  "./assets/fonts/ms-sharp-0.woff2",
  "./assets/fonts/playfair-0.woff2",
  "./assets/fonts/playfair-1.woff2",
  "./assets/fonts/playfair-2.woff2",
  "./assets/fonts/playfair-3.woff2",
  "./assets/fonts/patrick-hand-0.woff2",
  "./assets/fonts/patrick-hand-1.woff2",
  "./assets/fonts/patrick-hand-2.woff2",
  // Rhema Greek text (pinned data versions)
  "./rhema-nt.js?v=3.0.65",
  "./rhema-critical.js?v=3.0.23",
  "./rhema-critical-fallbacks.js?v=3.0.177",
  "./rhema-ot-hebrew.js?v=3.0.81",
  "./rhema-hebrew-lexicon.js?v=3.0.81",
  "./rhema-hebrew-bdb.js?v=3.0.379",
  "./rhema-lxx.js?v=3.0.65",
  // Rhema English translations (pinned)
  "./rhema-msb.js?v=3.0.65",
  "./rhema-bsb.js?v=3.0.65",
  // Rhema support data (pinned)
  "./rhema-lexicon.js?v=3.0.65",
  "./rhema-mm.js?v=3.0.65",
  "./rhema-syntax.js?v=3.0.65",
  "./rhema-crossrefs.js?v=3.0.65",
  "./rhema-scripture-notes.js?v=3.0.160",
  "./rhema-bible-dictionary.js?v=3.0.389",
  "./rhema-crossrefs-ui.js?v=3.0.363",
  "./greek-verbs.js?v=3.0.152",
  "./bible-quiz.js?v=3.0.440",
  "./bible-quiz.css?v=3.0.438",
  "./firebase-lb.js?v=3.0.440",
  "./assets/home-backgrounds/abstract.jpg",
  "./assets/home-backgrounds/ancient-scroll.jpg",
  "./assets/home-backgrounds/city.jpg",
  "./assets/home-backgrounds/clouds.jpg",
  "./assets/home-backgrounds/desert.jpg",
  "./assets/home-backgrounds/forest.jpg",
  "./assets/home-backgrounds/garden.jpg",
  "./assets/home-backgrounds/greek-columns.jpg",
  "./assets/home-backgrounds/leaves.jpg",
  "./assets/home-backgrounds/mountains.jpg",
  "./assets/icons/quick-study-library.png?v=3.0.439",
  "./assets/icons/quick-memorize.png?v=3.0.439",
  "./assets/icons/quick-vocab.png?v=3.0.439",
  "./assets/icons/quick-translate.png?v=3.0.439",
  "./assets/icons/quick-test.png?v=3.0.439",
  "./assets/icons/93e0a332-e620-43eb-931e-5f238f039ace.png?v=3.0.439",
  "./assets/icons/quick-reading-plan.png?v=3.0.439",
  "./assets/icons/quick-threads.png?v=3.0.439",
  "./assets/icons/ChatGPT Image Jun 23, 2026, 10_26_34 PM.png",
  "./assets/icons/habit-builder-art.png",
  "./assets/icons/studies-bookshelf.png?v=3.0.238",
  "./assets/icons/study-book-cover.png?v=3.0.241",
  "./assets/home-backgrounds/night-sky.jpg",
  "./assets/home-backgrounds/ocean.jpg",
  "./assets/home-backgrounds/sunrise.jpg",
  "./assets/home-backgrounds/waves.jpg",
  "./assets/home-backgrounds/abstract-thumb.jpg",
  "./assets/home-backgrounds/ancient-scroll-thumb.jpg",
  "./assets/home-backgrounds/city-thumb.jpg",
  "./assets/home-backgrounds/clouds-thumb.jpg",
  "./assets/home-backgrounds/desert-thumb.jpg",
  "./assets/home-backgrounds/forest-thumb.jpg",
  "./assets/home-backgrounds/garden-thumb.jpg",
  "./assets/home-backgrounds/greek-columns-thumb.jpg",
  "./assets/home-backgrounds/leaves-thumb.jpg",
  "./assets/home-backgrounds/mountains-thumb.jpg",
  "./assets/home-backgrounds/night-sky-thumb.jpg",
  "./assets/home-backgrounds/ocean-thumb.jpg",
  "./assets/home-backgrounds/sunrise-thumb.jpg",
  "./assets/home-backgrounds/waves-thumb.jpg",
  "./manifest.json",
  "./PWAicon.png",
  "./assets/icons/disciple-builder-icon-180.png?v=3.0.255",
  "./assets/icons/disciple-builder-icon-192.png?v=3.0.255",
  "./assets/icons/disciple-builder-icon-512.png?v=3.0.255",
  "./assets/icons/disciple-builder-icon-1024.png?v=3.0.255",
  "./assets/icons/disciple-builder-splash.png?v=3.0.257"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const file of FILES_TO_CACHE) {
        try {
          await cache.add(file);
          console.log("Cached:", file);
        } catch (error) {
          console.warn("Skipped cache file:", file, error);
        }
      }
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Let Firebase and external CDN requests pass through
  if (
    event.request.url.includes("firebaseapp.com") ||
    event.request.url.includes("googleapis.com") ||
    event.request.url.includes("gstatic.com") ||
    event.request.url.includes("fcmregistrations.googleapis.com")
  ) {
    return;
  }

  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const shouldCache =
          response &&
          response.status === 200 &&
          response.type === "basic" &&
          !event.request.url.endsWith(".mp4");

        if (shouldCache) {
          const responseClone = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }

        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
