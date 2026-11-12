const CACHE = 'league-hub-v209'

const BASE = new URL('./', self.location.href)

async function musicResponse(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(new Request(request.url))
  if (cached) {
    const range = request.headers.get('range')
    if (!range) return cached
    const parsed = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (!parsed) return cached
    const data = await cached.arrayBuffer()
    const size = data.byteLength
    const start = parsed[1] ? Number(parsed[1]) : Math.max(0, size - Number(parsed[2]))
    const end = parsed[2] && parsed[1] ? Math.min(Number(parsed[2]), size - 1) : size - 1
    if (start >= size || end < start) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    }
    const body = data.slice(start, end + 1)
    return new Response(body, {
      status: 206,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(body.byteLength),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
      },
    })
  }

  const response = await fetch(request)
  if (response.ok && !request.headers.has('range')) {
    cache.put(new Request(request.url), response.clone())
  }
  return response
}

const SHELL = [
  './',
  'index.html',
  'styles.css?v=25',
  'components.css?v=138',
  'prefs.js?v=29',
  'core.js?v=66',
  'views/teams.js?v=29',
  'views/table.js?v=31',
  'views/fixtures.js?v=23',
  'views/tournament.js?v=45',
  'icon-tournament.svg?v=5',
  'icons/tournament.svg',
  'icons/league.svg',
  'icons/finalisima.svg',
  'icons/supercup.svg',
  'icons/medal_2.svg',
  'icons/medal_4.svg',
  'icons/medal_3.svg',
  'icons/goleador_3.svg',
  'icons/glove.svg',
  'icons/crown_common.svg',
  'icons/premio4.svg',
  'icons/premio2.svg',
  'icons/goleador_2.svg',
  'icons/goleador.svg',
  'icons/trophy_3.svg',
  'icons/trophy_2.svg',
  'icons/trophy_common.svg',
  'icons/worldcup.svg',
  'icons/premio1.svg',
  'icons/premio3.svg',
  'icons/medal.svg',
  'icons/medal_1.svg',
  'icons/badge.svg',
  'icons/trophy_0.svg',
  'icons/zidane.svg',
  'icons/4inarow.svg',
  'icons/cine.svg',
  'icons/crown.svg',
  'icons/badge_2.svg',
  'views/seasons.js?v=63',
  'season-library/catalog.json',
  'season-library/seasons.json',
  'views/history.js?v=31',
  'views/performance.js?v=43',
  'views/badges.js?v=50',
  'views/settings.js?v=43',
  'views/menu.js?v=29',
  'app.js?v=39',
  'media/music/tracks.js?v=3',
  'media/music/FIFA WORLD CUP 2018 RUSSIA SONG - COLORS (COCA-COLA).mp3',
  'media/music/Hayya Hayya (Better Together) FIFA World Cup 2022™ Official Soundtrack.mp3',
  'media/music/INOHA - Seventh Heaven (Official Tour Lyric Video).mp3',
  'media/music/John Newman - Love Me Again.mp3',
  'media/music/Joy Crookes - Feet Dont Fail Me Now (Official Video).mp3',
  'media/music/LSD - Genius (Lyrics) ft. Sia, Diplo, Labrinth.mp3',
  'media/music/moa moa - Drive.mp3',
  'media/music/Myke Towers - Lala (Video Oficial).mp3',
  'media/music/Rex Orange County - Never Enough (Official Audio).mp3',
  'media/music/Rex Orange County - Sunflower (Official Audio).mp3',
  'media/music/Shakira, Burna Boy - Dai Dai (Audio).mp3',
  'media/music/SOFY - Big Talk (Official Video).mp3',
  'media/music/this is what heartbreak feels like (CG5 Remix)(MP3_160K).mp3',
  'media/music/Worms.mp3',
  'media/music/1.jpg',
  'media/music/2.jpg',
  'media/music/3.jpg',
  'media/music/4.jpg',
  'media/music/5.jpg',
  'media/music/6.jpg',
  'media/music/7.jpg',
  'media/music/8.png',
  'media/music/9.jpg',
  'media/music/10.jpg',
  'media/music/11.jpg',
  'media/music/12.jpg',
  'media/music/13.jpg',
  'media/music/14.jpg',
  'media/sfx/tap.wav',
  'media/sfx/nav.wav',
  'logo.svg',
  'grid.svg',
  'krona-one.woff2',
  'badge-icons/worldcup.svg',
  'badge-icons/champions-trophy.svg',
  'badge-icons/premier.svg',
  'badge-icons/laliga.svg',
  'badge-icons/doblete.svg',
  'badge-icons/facup.svg',
  'badge-icons/copadelrey.svg',
  'badge-icons/seriea.svg',
  'badge-icons/coppaitalia.svg',
  'badge-icons/supercopaespana.svg',
  'badge-icons/communityshield.svg',
  'badge-icons/supercopaitalia.svg',
  'backgrounds/estadio0.jpg',
  'backgrounds/estadio1.jpg',
  'backgrounds/santiagobernabeu.jpg',
  'backgrounds/campnou.jpg',
  'backgrounds/metropolitano.jpg',
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

  if (url.pathname.toLowerCase().endsWith('.mp3')) {
    event.respondWith(musicResponse(request))
    return
  }

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













