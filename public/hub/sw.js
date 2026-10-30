const CACHE = 'league-hub-v88'

const BASE = new URL('./', self.location.href)

const SHELL = [
  './',
  'index.html',
  'styles.css?v=12',
  'components.css?v=55',
  'prefs.js?v=12',
  'core.js?v=31',
  'views/teams.js?v=12',
  'views/table.js?v=18',
  'views/fixtures.js?v=14',
  'views/tournament.js?v=21',
  'icon-tournament.svg?v=5',
  'views/seasons.js?v=29',
  'season-library/catalog.json',
  'season-library/seasons.json',
  'views/history.js?v=16',
  'views/performance.js?v=24',
  'views/badges.js?v=23',
  'views/settings.js?v=12',
  'app.js?v=20',
  'logo.svg',
  'grid.svg',
  'krona-one.woff2',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) =>
        Promise.allSettled(
          SHELL.map((path) => cache.add(new URL(path, BASE).href))
        )
      )
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.href.startsWith(BASE.href)) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(async () => {
        const hit = await caches.match(request)
        if (hit) return hit

        if (request.mode === 'navigate') {
          return (await caches.match(new URL('index.html', BASE).href))
            || Response.error()
        }

        return Response.error()
      })
  )
})













