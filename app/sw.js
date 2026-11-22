/* Early Days app-shell cache. Makes the app usable offline after the first load. */

const CACHE = 'early-days-app-v2'
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
]

async function cacheShell() {
  const cache = await caches.open(CACHE)
  await cache.addAll(SHELL)
  try {
    // The Vite build hashes JS/CSS filenames. Read the built index and cache whatever it actually references.
    const html = await (await fetch('./index.html')).text()
    const urls = new Set()
    for (const match of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) urls.add(match[1])
    await Promise.all([...urls].map((url) => cache.add(url).catch(() => {})))
  } catch {
    /* the app still works online */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {})
          return res
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('./index.html')),
        ),
    )
    return
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {})
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
