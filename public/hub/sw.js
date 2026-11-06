const CACHE = 'league-hub-v167'

const BASE = new URL('./', self.location.href)

const SHELL = [
  './',
  'index.html',
  'styles.css?v=23',
  'components.css?v=109',
  'prefs.js?v=25',
  'core.js?v=47',
  'views/teams.js?v=25',
  'views/table.js?v=25',
  'views/fixtures.js?v=18',
  'views/tournament.js?v=33',
  'icon-tournament.svg?v=5',
  'views/seasons.js?v=43',
  'season-library/catalog.json',
  'season-library/seasons.json',
  'views/history.js?v=19',
  'views/performance.js?v=28',
  'views/badges.js?v=26',
  'views/settings.js?v=32',
  'views/menu.js?v=25',
  'app.js?v=37',
  'media/music/tracks.js?v=3',
  'media/sfx/tap.wav',
  'media/sfx/nav.wav',
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













