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

// Two caches, so an app update never throws away the big offline datasets:
//
//  • SHELL_CACHE (renamed every release) holds only the HTML entry points.
//  • DATA_CACHE (stable name) holds every versioned (?v=…) or static asset:
//    code, styles, fonts, images and the ~80 MB of Rhema Bible data. A URL that
//    carries ?v= is immutable, so it is served straight from cache with no
//    background re-download; a real change ships under a new ?v= and replaces
//    the old copy (same path, different version) when it lands.
//
// Before this split, every release renamed the one cache and `activate`
// deleted the old one, so each update re-downloaded all of the Bible data, and
// stale-while-revalidate re-fetched multi-megabyte files on every open.
const APP_SW_VERSION = "3.0.543";
const SHELL_CACHE = "disciple-builder-v" + APP_SW_VERSION;
const DATA_CACHE = "disciple-builder-data-v1";
const KEEP_CACHES = new Set([SHELL_CACHE, DATA_CACHE]);
// Canonical app-shell entry we always fall back to when a navigation can't be
// served from the network (e.g. airplane mode) — keeps deep links / query
// strings working offline.
const SHELL_URL = "./index.html";
// How long a launch waits on the network for a fresh index.html before
// opening the cached copy instead (a slow or flaky connection shouldn't hold
// the whole app hostage; the fresh copy still lands in cache for next time).
const SHELL_NETWORK_TIMEOUT_MS = 3000;

// Rhema data files use pinned data versions (RHEMA_DATA_VERSIONS in app.js).
// Only update these when the underlying dataset actually changes — not on every
// app version bump — so users don't re-download 50 MB of Bible data unnecessarily.
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css?v=3.0.543",
  "./vocab.js?v=3.0.8",
  "./rhema-align.js?v=3.0.543",
  "./app.js?v=3.0.543",
  "./rhema-word-study.js?v=3.0.543",
  "./bible-threads.js?v=3.0.402",
  "./bible-intros.js?v=3.0.543",
  "./rhema-english-dictionary.js?v=3.0.417",
  "./assets/vendor/wink-nlp-en.js?v=3.0.104",
  "./bible-atlas.js?v=3.0.349",
  "./bible-genealogy.js?v=3.0.476",
  "./bible-regions.js?v=3.0.472",
  "./verse-structure.js?v=3.0.429",
  "./vs-structure.js?v=3.0.543",
  "./sermon-notes.js?v=3.0.460",
  "./sermon-notes.css?v=3.0.460",
  // Self-hosted fonts (icons + skin fonts) — pinned, they effectively never change
  "./assets/fonts/fonts.css?v=3.0.415",
  "./assets/fonts/ms-outlined-0.woff2",
  "./assets/mascot/guide-body.webp",
  "./assets/mascot/guide-spark.webp",
  "./assets/mascot/guide-wow.webp",
  "./assets/mascot/guide-cheer.webp",
  "./assets/mascot/guide-thumbs.webp",
  "./assets/mascot/guide-inspect.webp",
  "./assets/mascot/guide-think.webp",
  "./assets/mascot/guide-ouch.webp",
  "./assets/mascot/guide-peek.webp",
  "./assets/mascot/guide-lean.webp",
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
  "./rhema-bsb-align.js?v=3.0.2",
  "./rhema-bible-dictionary.js?v=3.0.385",
  "./rhema-crossrefs-ui.js?v=3.0.543",
  "./greek-verbs.js?v=3.0.152",
  "./bible-quiz.js?v=3.0.473",
  "./bible-quiz.css?v=3.0.473",
  "./firebase-lb.js?v=3.0.543",
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

// Multi-megabyte datasets. On a brand-new install these are NOT fetched during
// `install` (the page is already downloading the ones it needs, and fetching
// them twice at once is what made first launches crawl). The page asks for the
// rest once the reader has settled ("warm-offline" message below).
function _swIsBigData(path) {
  return /\/(rhema-(?!crossrefs-ui|align|word-study)[^/]+|bible-threads|bible-intros)\.js$/.test(path);
}

// HTML entry points + the manifest live in the per-release shell cache.
function _swIsShellPath(path) {
  return path === "/" || path.endsWith("/") || path.endsWith("index.html") || path.endsWith("manifest.json");
}

function _swCacheFor(url) {
  return _swIsShellPath(url.pathname) ? SHELL_CACHE : DATA_CACHE;
}

// Immutable = safe to serve from cache with no revalidation.
function _swIsImmutable(url) {
  return url.searchParams.has("v") ||
    url.pathname.includes("/assets/") ||
    /\.(woff2?|png|jpe?g|webp|svg)$/i.test(url.pathname);
}

// Store a response, evicting older versions of the same path (?v=old).
async function _swPut(cacheName, request, response) {
  if (!response || response.status !== 200 || (response.type !== "basic" && response.type !== "cors")) return;
  const cache = await caches.open(cacheName);
  const url = new URL(typeof request === "string" ? request : request.url, self.location.href);
  if (url.searchParams.has("v")) {
    try {
      const siblings = await cache.keys(url.href, { ignoreSearch: true });
      await Promise.all(siblings.filter(r => r.url !== url.href).map(r => cache.delete(r)));
    } catch {}
  }
  await cache.put(request, response);
}

// Run async jobs with a small concurrency cap.
async function _swPool(items, limit, fn) {
  const queue = items.slice();
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try { await fn(item); } catch (error) { console.warn("SW cache step skipped:", item, error); }
    }
  });
  await Promise.all(workers);
}

// Make sure one precache URL is in its cache. Versioned files unchanged since
// the previous release are copied from the old caches instead of downloaded.
async function _swEnsureCached(file, { allowNetwork }) {
  const url = new URL(file, self.location.href);
  const cacheName = _swCacheFor(url);
  const cache = await caches.open(cacheName);
  if (_swIsShellPath(url.pathname)) {
    // Always take the shell fresh from the network at install time.
    const response = await fetch(url.href, { cache: "no-cache" });
    if (response.ok) await cache.put(file, response);
    return;
  }
  if (await cache.match(url.href)) return;
  const existing = await caches.match(url.href);
  if (existing) { await _swPut(cacheName, url.href, existing); return; }
  if (!allowNetwork) return;
  const response = await fetch(url.href);
  await _swPut(cacheName, url.href, response);
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    // Is there an earlier copy of the big data anywhere (an update, not a
    // first install)? Then copying/refreshing it now is cheap and correct.
    const priorCaches = (await caches.keys()).filter(name => name !== SHELL_CACHE);
    const firstInstall = priorCaches.length === 0;
    await _swPool(FILES_TO_CACHE, 6, (file) => {
      const path = new URL(file, self.location.href).pathname;
      return _swEnsureCached(file, { allowNetwork: !(firstInstall && _swIsBigData(path)) });
    });
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => !KEEP_CACHES.has(name)).map(name => caches.delete(name)));
    // Drop data-cache entries for listed files whose pinned version moved on.
    try {
      const wanted = new Map(FILES_TO_CACHE.map(f => {
        const u = new URL(f, self.location.href);
        return [u.pathname, u.href];
      }));
      const cache = await caches.open(DATA_CACHE);
      const keys = await cache.keys();
      await Promise.all(keys.map(req => {
        const u = new URL(req.url);
        const want = wanted.get(u.pathname);
        return want && want !== u.href ? cache.delete(req) : null;
      }));
    } catch {}
    await self.clients.claim();
  })());
});

// The page posts {type:"warm-offline"} once the reader is idle, so everything
// for full offline use is pulled down in the background — after, not during,
// the launch.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "warm-offline") return;
  event.waitUntil(_swPool(FILES_TO_CACHE, 2, (file) => _swEnsureCached(file, { allowNetwork: true })));
});

function _swShellResponse(req) {
  const network = fetch(req).then((response) => {
    // Keep the canonical shell copy current for offline launches.
    if (response && response.status === 200 && response.type === "basic") {
      const clone = response.clone();
      caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, clone)).catch(() => {});
    }
    return response;
  });
  const cached = () => caches.match(req)
    .then((r) => r || caches.match(SHELL_URL))
    .then((r) => r || caches.match("./"));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (r) => { if (!settled && r) { settled = true; resolve(r); } };
    // Slow network: open the cached shell after a short wait.
    const timer = setTimeout(() => { cached().then(finish); }, SHELL_NETWORK_TIMEOUT_MS);
    network.then((r) => { clearTimeout(timer); finish(r); })
      .catch(() => {
        clearTimeout(timer);
        cached().then((r) => { if (r) finish(r); else if (!settled) reject(new Error("offline")); });
      });
  });
}

// Firebase SDK modules: pinned version in the path, so they are immutable and
// can be cached — sign-in (which gates the launch screen) no longer waits on a
// CDN round-trip for ~400 KB of SDK on every open.
const FIREBASE_SDK_PREFIX = "https://www.gstatic.com/firebasejs/10.14.1/";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  if (url.href.startsWith(FIREBASE_SDK_PREFIX)) {
    event.respondWith(
      caches.open(DATA_CACHE).then((cache) => cache.match(req).then((cached) =>
        cached || fetch(req).then((response) => {
          if (response && response.ok) cache.put(req, response.clone()).catch(() => {});
          return response;
        })
      ))
    );
    return;
  }

  // Other cross-origin requests (Firebase APIs, Google sign-in, map tiles, other
  // CDNs) are never intercepted — let the network handle them so nothing here
  // breaks when an external service changes.
  if (url.origin !== self.location.origin) return;

  // Large streamed media we deliberately keep off the cache: the install video
  // and the ~56 MB offline map data. These stay network-only (map features are
  // inherently online, as noted to the user).
  if (url.pathname.endsWith(".mp4") || url.pathname.endsWith(".pmtiles")) return;

  // ── App shell (the HTML document): network-first, with a timeout ──────────
  // So a freshly deployed index.html — which points at the new ?v= asset URLs —
  // is picked up the moment the app is opened online. When the network is gone
  // or crawling, we fall back to the cached shell, keeping deep links working.
  const isShell =
    req.mode === "navigate" ||
    url.pathname === "/" ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("index.html");

  if (isShell) {
    event.respondWith(_swShellResponse(req));
    return;
  }

  // ── Versioned / static assets: cache-first, no revalidation ───────────────
  // The URL changes whenever the content does, so a cached copy is always right.
  if (_swIsImmutable(url)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          _swPut(_swCacheFor(url), req, clone).catch(() => {});
        }
        return response;
      }))
    );
    return;
  }

  // ── Anything else same-origin: stale-while-revalidate ─────────────────────
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            _swPut(_swCacheFor(url), req, clone).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
