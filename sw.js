/*
 * Service worker cho Leverage Dashboard (PWA).
 * Nguyên tắc an toàn cho dashboard tài chính:
 *  - CHỈ cache vỏ tĩnh (icon, manifest) + thư viện CDN.
 *  - TOÀN BỘ dữ liệu Google Sheets luôn đi thẳng ra mạng, không bao giờ cache
 *    -> không có chuyện hiển thị số liệu cũ.
 *  - index.html dùng network-first: có mạng thì luôn lấy bản mới nhất,
 *    mất mạng mới lấy bản đã lưu để app vẫn mở được.
 */
const CACHE = "lv-dash-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => undefined))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Dữ liệu động (Google Sheets, API giá...) -> không đụng vào
  if (
    url.hostname.includes("google.com") ||
    url.hostname.includes("googleusercontent.com") ||
    url.hostname.includes("gstatic.com") ||
    url.hostname.includes("vps.com.vn") ||
    url.hostname.includes("vndirect.com.vn")
  ) {
    return;
  }

  const isDoc = req.mode === "navigate" || url.pathname.endsWith("/") ||
    url.pathname.endsWith("index.html");

  if (isDoc) {
    // Network-first cho trang chính
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // Tài nguyên tĩnh + CDN: cache-first
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && (url.origin === self.location.origin || url.hostname.includes("jsdelivr"))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
