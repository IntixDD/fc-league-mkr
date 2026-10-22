const CACHE = 'league-hub-v10'
const SHELL = [
  './',
  'index.html',
  'styles.css?v=8',
  'components.css?v=8',
  'prefs.js?v=8',
  'core.js?v=8',
  'views/teams.js?v=8',
  'views/table.js?v=8',
  'views/fixtures.js?v=8',
  'views/playoffs.js?v=8',
  'views/seasons.js?v=8',
  'views/history.js?v=8',
  'views/performance.js?v=8',
  'views/settings.js?v=8',
  'app.js?v=8',
  'logo.svg',
  'grid.svg',
  'krona-one.woff2',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Network-first so updates show up immediately; the cache keeps the app usable offline.
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/hub/')) return
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return res
      })
      .catch(() =>
        caches.match(request).then((hit) => hit || (request.mode === 'navigate' ? caches.match('index.html') : Response.error())),
      ),
  )
})
