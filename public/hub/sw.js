const CACHE = 'league-hub-v173'

const BASE = new URL('./', self.location.href)

const SHELL = [
  './',
  'index.html',
  'styles.css?v=22',
  'components.css?v=134',
  'prefs.js?v=22',
  'core.js?v=51',
  'views/teams.js?v=26',
  'views/table.js?v=27',
  'views/fixtures.js?v=18',
  'views/tournament.js?v=31',
  'icon-tournament.svg?v=5',
  'views/seasons.js?v=45',
  'season-library/catalog.json',
  'season-library/seasons.json',
  'views/history.js?v=23',
  'views/performance.js?v=29',
  'views/badges.js?v=26',
  'views/settings.js?v=41',
  'views/menu.js?v=26',
  'app.js?v=39',
  'media/music/tracks.js?v=3',
  'audio.js?v=1',
  'icon-teams.svg?v=4',
  'icon-table.svg?v=4',
  'icon-fixtures.svg?v=4',
  'icon-seasons.svg?v=4',
  'icon-history.svg?v=4',
  'icon-performance.svg?v=4',
  'icon-settings.svg?v=4',
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

  const refresh = async () => {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE)
      await cache.put(request, response.clone())
    }
    return response
  }

  // Published seasons can change independently of an app release. Check that
  // small data file online first, while app assets render from cache at once.
  const isLiveData = url.pathname.endsWith('/season-library/seasons.json')
  event.respondWith((async () => {
    const cached = await caches.match(request)
    if (isLiveData) {
      try { return await refresh() } catch { return cached || Response.error() }
    }
    // The shell cache is replaced atomically when a new service-worker version
    // installs, so fetching every script and stylesheet again on each launch is
    // unnecessary network work for installed phones.
    if (cached) return cached
    try { return await refresh() } catch {
      if (request.mode === 'navigate') {
        return (await caches.match(new URL('index.html', BASE).href)) || Response.error()
      }
      return Response.error()
    }
  })())
})













