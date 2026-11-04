;(() => {
  const H = window.Hub
  const P = window.HubPrefs
  const LEGACY_BG_KEY = 'ui:background'
  const LIBRARY_KEY = 'ui:bg-library'
  const MAX_RAW_BYTES = 6 * 1024 * 1024
  const MAX_SIDE = 2560
  const MAX_BACKGROUNDS = 12
  const MUSIC_ICONS = {
    previous: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M19 5 9 12l10 7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM15 5h4v14h-4z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.8v14.4a.8.8 0 0 0 1.2.7l11-7.2a.8.8 0 0 0 0-1.4l-11-7.2a.8.8 0 0 0-1.2.7z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14M5 5l10 7-10 7z"/></svg>',
  }
  let library = []
  let musicLibrary = []
  let currentTrack = 0
  let musicStarted = false
  let musicDelayElapsed = false
  let musicPausedByUser = false
  let audio = null
  let musicMeterFrame = 0
  let musicMeterLast = 0
  let musicBars = []
  let musicPlayToken = 0
  const musicEnvelopes = new Map()
  let musicPlaybackError = false
  const musicBarLevels = [0, 0, 0, 0]
  let musicAdvanceTimer = 0
  let musicStartTimer = 0
  let musicStartAt = 0
  let waitingForNext = false
  let finishedCurrentTrack = false
  let resumeMusicOnVisible = false
  let resumeNextTrackOnVisible = false
  const sfxPlayers = new Map()
  const sfxBuffers = new Map()
  const SFX_FILES = ['tap.wav', 'nav.wav']
  let sfxContext = null
  const urls = new Map()
  let installEvent = null

  /* ---------- Background storage (IndexedDB, same DB as the app data) ---------- */
  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('league-hub', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('kv')
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const tx = req.result.transaction('kv', mode)
        const r = fn(tx.objectStore('kv'))
        tx.oncomplete = () => resolve(r.result)
        tx.onerror = () => reject(tx.error)
      }
    })
  }
  const idbGet = (key) => idb('readonly', (s) => s.get(key))
  const idbPut = (key, value) => idb('readwrite', (s) => s.put(value, key))
  const idbDel = (key) => idb('readwrite', (s) => s.delete(key))
  const saveLibrary = () => idbPut(LIBRARY_KEY, library)

  function musicNotice(track) {
    let notice = document.getElementById('music-notice')
    if (!notice) {
      notice = document.createElement('aside')
      notice.id = 'music-notice'
      notice.className = 'music-notice'
      notice.setAttribute('role', 'status')
      document.body.appendChild(notice)
    }
    const coverUrl = track.cover ? musicAssetUrl(track.cover) : ''
    notice.innerHTML = `${coverUrl ? `<img src="${H.esc(coverUrl)}" alt="">` : '<span class="music-cover-placeholder">♫</span>'}<span><strong>${H.esc(track.title)}</strong><small>Reproduciendo</small></span>`
    notice.classList.add('is-visible')
    clearTimeout(notice._timer)
    notice._timer = setTimeout(() => notice.classList.remove('is-visible'), 4400)
  }

  function musicAssetUrl(filename) {
    const safePath = String(filename || '').split('/').filter((part) => part && part !== '.' && part !== '..').map(encodeURIComponent).join('/')
    return new URL(`media/music/${safePath}`, document.baseURI).href
  }

  function updateMusicControls() {
    const track = musicLibrary[currentTrack]
    const playing = (!!audio && !audio.paused) || waitingForNext
    const cover = document.querySelector('[data-music-cover]')
    if (cover) {
      const coverUrl = track?.cover ? musicAssetUrl(track.cover) : ''
      if (cover.dataset.src !== coverUrl) {
        cover.dataset.src = coverUrl
        cover.innerHTML = coverUrl
          ? `<img src="${H.esc(coverUrl)}" alt="">`
          : '<span class="music-current-placeholder" aria-hidden="true">♫</span>'
      }
    }
    const title = document.querySelector('[data-music-title]')
    if (title) title.textContent = track?.title || 'No hay canciones disponibles'
    const status = document.querySelector('[data-music-state]')
    if (status) status.textContent = waitingForNext
      ? 'Preparando la siguiente canción'
      : playing
        ? 'Reproduciendo ahora'
        : musicPlaybackError
          ? 'El navegador no pudo reproducir esta canción'
          : audio?.src
          ? 'En pausa'
          : track
            ? 'Lista para reproducir'
            : 'Añade canciones a la biblioteca'
    const player = document.querySelector('.music-current')
    player?.classList.toggle('is-playing', playing && !waitingForNext)
    player?.classList.add('has-audio-meter')
    if (playing && !waitingForNext) startMusicMeter()

    const button = document.querySelector('[data-action="music-toggle"]')
    if (!button) return
    const available = musicLibrary.length > 0
    button.innerHTML = `${playing ? MUSIC_ICONS.pause : MUSIC_ICONS.play}<span>${playing ? 'Pausar' : 'Reproducir'}</span>`
    button.setAttribute('aria-label', playing ? 'Pausar música' : 'Reproducir música')
    button.disabled = !available
    document.querySelectorAll('.music-transport [data-action="music-next"], .music-transport [data-action="music-previous"]').forEach((control) => { control.disabled = !available })
  }

  /* ---------- Barritas de música ----------
     Se animan con una envolvente precalculada (media/music/bars.js) leída según audio.currentTime.
     No pasan el audio por Web Audio, así que funcionan igual en cualquier navegador/dispositivo
     (incluido file://) y no añaden carga ni crujidos al sonido. Si una canción no tiene envolvente,
     se usa una animación suave de respaldo. */
  function musicEnvelope(track) {
    const pack = window.HUB_MUSIC_BARS
    const key = track?.file
    if (!pack || !key) return null
    if (musicEnvelopes.has(key)) return musicEnvelopes.get(key)
    let data = null
    try {
      const raw = pack.data?.[key]
      if (raw) {
        const bin = atob(raw)
        data = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i)
      }
    } catch { data = null }
    musicEnvelopes.set(key, data)
    return data
  }

  function stopMusicMeter() {
    if (musicMeterFrame) cancelAnimationFrame(musicMeterFrame)
    musicMeterFrame = 0
    musicBarLevels.fill(0)
    document.querySelectorAll('.music-equalizer i').forEach((bar) => { bar.style.transform = '' })
  }

  function startMusicMeter() {
    if (musicMeterFrame || !audio || audio.paused || document.hidden) return
    const draw = (now) => {
      musicMeterFrame = 0
      if (!audio || audio.paused || document.hidden) return stopMusicMeter()
      if (!musicBars.length || !musicBars[0].isConnected) musicBars = [...document.querySelectorAll('.music-equalizer i')]
      // Sin barras visibles (otro apartado abierto): se detiene y vuelve con app:sectionchange.
      if (!musicBars.length || musicBars[0].offsetParent === null) { musicMeterLast = 0; return }
      if (now - musicMeterLast >= 32) {
        musicMeterLast = now
        const pack = window.HUB_MUSIC_BARS
        const data = musicEnvelope(musicLibrary[currentTrack])
        const bands = pack?.bands || 4
        const pos = Math.max(0, audio.currentTime) * (pack?.fps || 20)
        const i0 = Math.floor(pos)
        const frac = pos - i0
        const frames = data ? Math.floor(data.length / bands) : 0
        const live = data && i0 + 1 < frames
        musicBars.forEach((bar, index) => {
          let target
          if (live) {
            const a = data[i0 * bands + index]
            const b = data[(i0 + 1) * bands + index]
            target = (a + (b - a) * frac) / 255
          } else {
            const t = now / 1000
            target = .5 + .3 * Math.sin(t * (2.1 + index * .7) + index * 1.9) + .15 * Math.sin(t * (5.3 + index) + index)
          }
          // Curva exagerada: los valles bajan casi a cero y los picos llegan al tope.
          const shaped = Math.min(1, Math.pow(Math.max(0, target), 2.4) * 1.5)
          const prev = musicBarLevels[index]
          musicBarLevels[index] = prev + (shaped - prev) * (shaped > prev ? .8 : .32)
          bar.style.transform = `scaleY(${(.08 + musicBarLevels[index] * .92).toFixed(3)})`
        })
      }
      musicMeterFrame = requestAnimationFrame(draw)
    }
    musicMeterFrame = requestAnimationFrame(draw)
  }

  document.addEventListener('app:sectionchange', () => requestAnimationFrame(startMusicMeter))

  function ensureAudio() {
    if (!audio) {
      audio = new Audio()
      audio.preload = 'auto'
      audio.volume = P.get().musicVolume ?? 0.15
      audio.addEventListener('ended', () => {
        stopMusicMeter()
        finishedCurrentTrack = true
        waitingForNext = true
        updateMusicControls()
        clearTimeout(musicAdvanceTimer)
        musicAdvanceTimer = window.setTimeout(() => {
          waitingForNext = false
          playTrack(currentTrack + 1)
        }, 2000)
      })
      audio.addEventListener('play', () => {
        updateMusicControls()
        startMusicMeter()
      })
      audio.addEventListener('pause', () => {
        stopMusicMeter()
        updateMusicControls()
      })
      audio.addEventListener('error', () => {
        stopMusicMeter()
        if (!audio.src) return
        musicStarted = false
        musicPlaybackError = true
        updateMusicControls()
      })
    }
  }

  function playTrack(index) {
    if (!musicLibrary.length) return
    ensureAudio()
    clearTimeout(musicAdvanceTimer)
    waitingForNext = false
    finishedCurrentTrack = false
    currentTrack = (index + musicLibrary.length) % musicLibrary.length
    musicPausedByUser = false
    const track = musicLibrary[currentTrack]
    musicPlaybackError = false
    const token = ++musicPlayToken
    audio.src = track.src
    updateMusicControls()
    audio.play().then(() => {
      if (token !== musicPlayToken) return
      musicStarted = true
      musicPlaybackError = false
      musicNotice(track)
      updateMusicControls()
    }).catch((error) => {
      // Un cambio rápido de canción interrumpe el play() anterior: no es un error real.
      if (token !== musicPlayToken || error?.name === 'AbortError') return
      musicStarted = false
      musicPlaybackError = true
      updateMusicControls()
    })
  }

  function playMusic() {
    if (!musicLibrary.length || musicStarted) return
    playTrack(currentTrack)
  }

  function scheduleInitialMusic() {
    if (musicStartTimer || musicDelayElapsed || musicStarted || document.hidden || !musicLibrary.length || P.get().musicAutoplay === false) return
    if (!musicStartAt) musicStartAt = Date.now() + 4000
    musicStartTimer = window.setTimeout(() => {
      musicStartTimer = 0
      musicDelayElapsed = true
      playMusic()
    }, Math.max(0, musicStartAt - Date.now()))
  }

  async function loadMusic() {
    const entries = window.HUB_MUSIC_TRACKS
    musicLibrary = Array.isArray(entries) ? entries.map((entry) => {
        const item = typeof entry === 'string' ? { file: entry } : entry
        if (!item?.file || !/\.mp3$/i.test(item.file)) return null
        return {
          file: item.file,
          title: item.title || item.file.split('/').pop().replace(/\.mp3$/i, ''),
          src: musicAssetUrl(item.file),
          cover: item.cover || '',
        }
      }).filter(Boolean) : []
    if (musicLibrary.length && P.get().musicAutoplay !== false) {
      currentTrack = 0
      scheduleInitialMusic()
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(musicStartTimer)
      musicStartTimer = 0
      if (waitingForNext) {
        clearTimeout(musicAdvanceTimer)
        musicAdvanceTimer = 0
        resumeNextTrackOnVisible = true
      } else if (audio && !audio.paused) {
        resumeMusicOnVisible = true
        audio.pause()
      }
      return
    }
    if (resumeNextTrackOnVisible) {
      resumeNextTrackOnVisible = false
      musicAdvanceTimer = window.setTimeout(() => {
        musicAdvanceTimer = 0
        waitingForNext = false
        playTrack(currentTrack + 1)
      }, 2000)
    } else if (resumeMusicOnVisible && audio && !musicPausedByUser) {
      resumeMusicOnVisible = false
      audio.play().then(() => { musicStarted = true; updateMusicControls() }).catch(() => {})
    }
    scheduleInitialMusic()
  })

  document.addEventListener('pointerdown', (event) => {
    if (!musicDelayElapsed || musicStarted || musicPausedByUser || !musicLibrary.length || event.target.closest('.music-transport')) return
    playMusic()
  }, { capture: true, passive: true })

  /* ---------- SFX ----------
     Web Audio con buffers decodificados (latencia mínima, sin recrear elementos <audio>).
     Máximo de voces simultáneas para que los toques rápidos no se acumulen ni saturen,
     y <audio> como respaldo solo si Web Audio o la carga de archivos no está disponible. */
  const SFX_MAX_VOICES = 4
  const sfxVoices = []
  const sfxLastPlayed = new Map()

  function prepareSfxFallback(file) {
    if (sfxPlayers.has(file)) return sfxPlayers.get(file)
    const sound = new Audio(`media/sfx/${file}`)
    sound.preload = 'auto'
    sfxPlayers.set(file, sound)
    return sound
  }

  function loadSfxBuffer(file) {
    const context = sfxContext
    fetch(new URL(`media/sfx/${file}`, document.baseURI), { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error('sfx')
        return response.arrayBuffer()
      })
      .then((buffer) => context.decodeAudioData(buffer))
      .then((decoded) => { if (context === sfxContext) sfxBuffers.set(file, decoded) })
      .catch(() => prepareSfxFallback(file))
  }

  function ensureSfxContext() {
    if (sfxContext && sfxContext.state !== 'closed') return sfxContext
    sfxContext = null
    sfxBuffers.clear()
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null
    try {
      sfxContext = new AudioContextClass({ latencyHint: 'interactive' })
    } catch {
      try { sfxContext = new AudioContextClass() } catch { sfxContext = null }
    }
    if (sfxContext) SFX_FILES.forEach(loadSfxBuffer)
    return sfxContext
  }

  function playSfxBuffer(file, volume) {
    if (!sfxContext || sfxContext.state !== 'running') return false
    const buffer = sfxBuffers.get(file)
    if (!buffer) return false
    try {
      while (sfxVoices.length >= SFX_MAX_VOICES) {
        const oldest = sfxVoices.shift()
        try { oldest.source.stop() } catch {}
      }
      const source = sfxContext.createBufferSource()
      const gain = sfxContext.createGain()
      source.buffer = buffer
      gain.gain.value = volume
      source.connect(gain)
      gain.connect(sfxContext.destination)
      const voice = { source }
      sfxVoices.push(voice)
      source.onended = () => {
        const at = sfxVoices.indexOf(voice)
        if (at >= 0) sfxVoices.splice(at, 1)
        source.disconnect()
        gain.disconnect()
      }
      source.start(0)
      return true
    } catch {
      return false
    }
  }

  function playSfx(file = 'tap.wav') {
    const volume = P.get().sfxVolume ?? 1
    if (!volume) return
    const now = performance.now()
    if (now - (sfxLastPlayed.get(file) || 0) < 40) return
    sfxLastPlayed.set(file, now)
    const context = ensureSfxContext()
    if (context && sfxBuffers.has(file)) {
      if (context.state === 'running') {
        if (playSfxBuffer(file, volume)) return
      } else {
        context.resume().then(() => { if (!playSfxBuffer(file, volume)) playSfxFallback(file, volume) }).catch(() => playSfxFallback(file, volume))
        return
      }
    }
    playSfxFallback(file, volume)
  }

  function playSfxFallback(file, volume) {
    const sound = prepareSfxFallback(file)
    sound.volume = volume
    try { sound.currentTime = 0 } catch {}
    sound.play().catch(() => {})
  }

  ensureSfxContext()
  // Despierta el contexto en el primer toque (antes del click) para que el primer sonido no llegue tarde.
  const unlockSfx = () => {
    const context = ensureSfxContext()
    if (context && context.state !== 'running') context.resume().catch(() => {})
  }
  document.addEventListener('pointerdown', unlockSfx, { capture: true, passive: true })
  document.addEventListener('keydown', unlockSfx, { capture: true, passive: true })
  let lastSfxControl = null
  let lastSfxAt = 0
  document.addEventListener('click', (event) => {
    const target = event.target.closest('.nav-button, button, a[href], [role="button"], .file-btn, [data-action], [data-open-menu], .logo')
    if (!target) return
    const now = performance.now()
    if (target === lastSfxControl && now - lastSfxAt < 120) return
    lastSfxControl = target
    lastSfxAt = now
    if (target.closest('.nav-button')) playSfx('nav.wav')
    else playSfx()
  })

  const urlFor = (item) => {
    if (!urls.has(item.id)) urls.set(item.id, URL.createObjectURL(item.blob))
    return urls.get(item.id)
  }
  const forgetUrl = (id) => {
    const u = urls.get(id)
    if (u) URL.revokeObjectURL(u)
    urls.delete(id)
  }
  const newId = () => `bg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

  function paintBackground() {
    const layer = document.querySelector('.bg-custom')
    const active = library.find((b) => b.id === P.get().activeBg)
    if (layer) layer.style.backgroundImage = active ? `url("${urlFor(active)}")` : ''
    if (!!active !== !!P.get().hasBg) P.set({ hasBg: !!active })
  }

  async function shrink(file) {
    if (file.size <= MAX_RAW_BYTES) return file
    const bitmap = await createImageBitmap(file)
    const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * k)
    canvas.height = Math.round(bitmap.height * k)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
  }

  async function addBackgrounds(files) {
    const images = [...files].filter((f) => f.type.startsWith('image/'))
    if (!images.length) return H.toast('Elige un archivo de imagen', 'error')
    const room = MAX_BACKGROUNDS - library.length
    if (room <= 0) return H.toast(`Máximo ${MAX_BACKGROUNDS} fondos. Elimina alguno primero.`, 'error')
    try {
      let lastId = null
      for (const file of images.slice(0, room)) {
        const blob = await shrink(file)
        lastId = newId()
        library.push({ id: lastId, blob, added: Date.now() })
      }
      await saveLibrary()
      P.set({ activeBg: lastId, hasBg: true })
      paintBackground()
      render()
      H.toast(images.length > room ? `Se guardaron ${room} fondos (límite alcanzado)` : 'Fondo guardado y aplicado')
    } catch {
      H.toast('No se pudo guardar la imagen', 'error')
    }
  }

  function selectBackground(id) {
    P.set({ activeBg: id, hasBg: !!id })
    paintBackground()
    render()
  }

  async function deleteBackground(id) {
    if (!(await H.confirm('Este fondo se eliminará de tu galería.', { confirmText: 'Eliminar' }))) return
    library = library.filter((b) => b.id !== id)
    forgetUrl(id)
    await saveLibrary().catch(() => {})
    if (P.get().activeBg === id) P.set({ activeBg: null, hasBg: false })
    paintBackground()
    render()
    H.toast('Fondo eliminado')
  }

  async function loadLibrary() {
    const stored = await idbGet(LIBRARY_KEY).catch(() => null)
    library = Array.isArray(stored) ? stored.filter((b) => b && b.id && b.blob) : []
    const legacy = await idbGet(LEGACY_BG_KEY).catch(() => null)
    if (legacy) {
      const id = newId()
      library.push({ id, blob: legacy, added: Date.now() })
      await saveLibrary().catch(() => {})
      await idbDel(LEGACY_BG_KEY).catch(() => {})
      if (P.get().hasBg) P.set({ activeBg: id })
    }
    if (P.get().activeBg && !library.some((b) => b.id === P.get().activeBg)) P.set({ activeBg: null })
    paintBackground()
  }

  /* ---------- Install (PWA) ---------- */
  const isStandalone = () =>
    matchMedia('(display-mode: fullscreen)').matches ||
    matchMedia('(display-mode: standalone)').matches ||
    navigator.standalone === true
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const inFrame = () => {
    try {
      return window.self !== window.top
    } catch {
      return true
    }
  }

  async function install() {
    if (!installEvent) return
    installEvent.prompt()
    const { outcome } = await installEvent.userChoice
    installEvent = null
    if (outcome === 'accepted') H.toast('Instalando League Hub…')
    render()
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installEvent = e
    render()
  })
  window.addEventListener('appinstalled', () => {
    installEvent = null
    H.toast('League Hub se instaló en tu dispositivo')
    render()
  })

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {}))
  }

  /* ---------- View ---------- */
  const card = ({ title, sub, body, actions = '', wide = false, extraClass = '' }) => `
    <article class="card set-card${wide ? ' card--wide' : ''}${extraClass ? ` ${extraClass}` : ''}">
      <header class="card-head"><div><h2 class="card-title">${title}</h2>${sub ? `<p class="card-sub">${sub}</p>` : ''}</div></header>
      <div class="set-body">${body}</div>
      ${actions ? `<div class="set-actions">${actions}</div>` : ''}
    </article>`

  function installCard() {
    let body
    let actions = ''
    if (isStandalone()) {
      body = '<p class="notice notice--ok">La app ya está instalada y se abre a pantalla completa, sin las barras del sistema.</p>'
    } else if (installEvent) {
      body = '<p class="hint">Instala League Hub en tu pantalla de inicio: se abre a pantalla completa, sin barra del navegador ni barras del sistema, y funciona sin conexión.</p>'
      actions = '<button class="btn btn--primary" data-action="install">Instalar app</button>'
    } else if (isIOS()) {
      body = `<ol class="steps">
          <li>Abre esta página en <strong>Safari</strong>.</li>
          <li>Toca el botón <strong>Compartir</strong> (el cuadrado con la flecha).</li>
          <li>Elige <strong>Agregar a pantalla de inicio</strong> y confirma.</li>
        </ol>`
    } else {
      body = `<ol class="steps">
          ${inFrame() ? '<li>Abre la app en su propia pestaña del navegador (no dentro de la vista previa).</li>' : ''}
          <li>Abre el menú del navegador (<strong>⋮</strong>).</li>
          <li>Toca <strong>Instalar aplicación</strong> o <strong>Agregar a pantalla de inicio</strong>.</li>
        </ol>`
    }
    return card({ title: 'Instalar app', sub: 'Úsala como una aplicación en tu celular', body, actions })
  }

  function galleryTiles(p) {
    const tiles = [
      `<li><button class="bg-tile bg-tile--default" data-action="bg-select" data-id="" aria-pressed="${!p.activeBg}">
          <span class="bg-tile-label">Original</span>
        </button></li>`,
      ...library.map(
        (b, i) => `<li class="bg-tile-wrap">
          <button class="bg-tile" data-action="bg-select" data-id="${b.id}" aria-pressed="${p.activeBg === b.id}" style="background-image:url('${urlFor(b)}')">
            <span class="sr-only">Usar fondo ${i + 1}</span>
          </button>
          <button class="bg-tile-del" data-action="bg-delete" data-id="${b.id}" aria-label="Eliminar fondo ${i + 1}">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
          </button>
        </li>`,
      ),
    ]
    if (library.length < MAX_BACKGROUNDS) {
      tiles.push(`<li><label class="bg-tile bg-tile--add file-btn">
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
          <span class="bg-tile-label">Añadir</span>
          <input class="sr-only" type="file" accept="image/*" multiple name="bg-file">
        </label></li>`)
    }
    return tiles.join('')
  }

  function render() {
    const el = document.getElementById('settings-body')
    if (!el) return
    const p = P.get()
    const track = musicLibrary[currentTrack]
    const themes = Object.entries(P.THEMES)
      .map(
        ([id, t]) => `
        <button class="theme-swatch" data-action="theme" data-theme="${id}" aria-pressed="${p.theme === id}" style="--sw: rgb(${t.accent}); --sw-glow: rgb(${t.g1}); --sw-2: rgb(${t.gg})">
          <span class="theme-dot" aria-hidden="true"></span>
          <span>${t.label}</span>
        </button>`,
      )
      .join('')
    const leagueLogo = H.state?.brandLogo || 'logo.svg'

    el.innerHTML = `
      <div class="panel-grid set-grid">
        ${card({
          title: 'Logo de la liga',
          sub: 'El escudo que aparece en la barra lateral y abre Menú',
          body: `<div class="brand-settings"><img class="brand-settings-preview" src="${H.esc(leagueLogo)}" alt="Logo actual de la liga"><p class="hint">Puedes elegir un escudo de los ya cargados en tu galería.</p></div>`,
          actions: '<button class="btn btn--ghost" data-action="pick-brand">Cambiar logo</button>',
          extraClass: 'set-logo',
        })}

        ${card({
          title: 'Música y sonidos',
          sub: `${musicLibrary.length} canción(es) disponibles en la app`,
          body: `<div class="music-current" aria-live="polite"><div class="music-current-cover" data-music-cover>${track?.cover ? `<img src="${H.esc(musicAssetUrl(track.cover))}" alt="">` : '<span class="music-current-placeholder" aria-hidden="true">♫</span>'}</div><div class="music-current-info"><span class="music-current-kicker">Ahora en reproducción</span><strong data-music-title>${H.esc(track?.title || (musicLibrary.length ? 'Preparando biblioteca' : 'No hay canciones disponibles'))}</strong><small data-music-state>${musicLibrary.length ? 'Lista para reproducir' : 'Añade canciones a la biblioteca'}</small></div><span class="music-equalizer" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div><div class="audio-controls"><label class="field range-field"><span class="field-label">Volumen de la música <output>${Math.round((p.musicVolume ?? .15) * 100)}%</output></span><input type="range" name="music-volume" min="0" max="1" step="0.05" value="${p.musicVolume ?? .15}"></label><label class="field range-field"><span class="field-label">Volumen de los SFX <output>${Math.round((p.sfxVolume ?? 1) * 100)}%</output></span><input type="range" name="sfx-volume" min="0" max="1" step="0.05" value="${p.sfxVolume ?? 1}"></label></div><label class="check music-autoplay-setting"><input type="checkbox" name="music-autoplay" ${p.musicAutoplay !== false ? 'checked' : ''}> Reproducir música al iniciar la app</label><div class="music-transport" role="group" aria-label="Controles de música"><button class="btn btn--ghost" type="button" data-action="music-previous" aria-label="Canción anterior">${MUSIC_ICONS.previous}<span>Anterior</span></button><button class="btn btn--primary music-toggle" type="button" data-action="music-toggle" aria-label="Pausar música">${MUSIC_ICONS.pause}<span>Pausar</span></button><button class="btn btn--ghost" type="button" data-action="music-next" aria-label="Siguiente canción">${MUSIC_ICONS.next}<span>Siguiente</span></button></div>`,
          extraClass: 'set-music',
        })}

        ${card({
          title: 'Escala de la interfaz',
          sub: 'Cómo se ajusta la app a tu pantalla',
          body: `<div class="seg" role="group" aria-label="Escala de la interfaz">
              <button class="seg-btn" data-action="scale" data-scale="-1" aria-pressed="${p.scale === -1}">-1 · Vista PC<small>Interfaz completa ajustada a la pantalla</small></button>
              <button class="seg-btn" data-action="scale" data-scale="0" aria-pressed="${p.scale === 0}">0 · Predeterminada<small>Adaptada al celular</small></button>
            </div>
            <p class="hint">Con <strong>-1</strong> la app usa el diseño de computadora y lo reduce para que entre entero en la pantalla del celular. En pantallas grandes no cambia nada.</p>`,
          extraClass: 'set-scale',
        })}

        ${card({
          title: 'Tema',
          sub: 'Color de acento y brillo del fondo',
          body: `<div class="theme-grid" role="group" aria-label="Tema de la app">${themes}</div>`,
          extraClass: 'set-theme',
        })}

        ${card({
          title: 'Fondos',
          sub: `${library.length} de ${MAX_BACKGROUNDS} guardados · ${p.activeBg ? 'Imagen personalizada activa' : 'Fondo predeterminado activo'}`,
          wide: true,
          body: `<ul class="bg-gallery" role="list">${galleryTiles(p)}</ul>
            <div class="bg-controls">
              <label class="field range-field${p.activeBg ? '' : ' is-disabled'}">
                <span class="field-label">Oscurecer imagen <output>${Math.round(p.bgDim * 100)}%</output></span>
                <input type="range" name="bg-dim" min="0" max="0.85" step="0.05" value="${p.bgDim}" ${p.activeBg ? '' : 'disabled'}>
              </label>
              <label class="check">
                <input type="checkbox" name="bg-grid" ${p.bgGrid ? 'checked' : ''}>
                Mostrar la cuadrícula sobre el fondo
              </label>
            </div>
            <p class="hint">Toca un fondo para aplicarlo. Las imágenes se guardan solo en este dispositivo.</p>`,
        })}

        ${installCard()}

        ${card({
          title: 'Restablecer',
          sub: 'Vuelve a la apariencia original',
          body: '<p class="hint">Restaura escala, tema y fondo predeterminados. Tus fondos guardados, equipos, temporadas y resultados no se tocan.</p>',
          actions: '<button class="btn btn--danger" data-action="reset-all">Restablecer ajustes</button>',
        })}

        ${card({
          title: 'Acerca de',
          sub: 'League Hub',
          wide: true,
          extraClass: 'set-about',
          body: '<p class="credit-line">Creado por <strong>IntixD</strong></p><div class="about-version"><span>Versión</span><strong>v0.0.0-beta-3.2</strong><span class="about-build">Beta Build</span></div>',
        })}
      </div>`
    updateMusicControls()
  }

  function bind() {
    const el = document.getElementById('settings-body')
    if (!el) return
    document.addEventListener('league:brandlogochange', () => render())
    el.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]')
      if (!btn) return
      const { action } = btn.dataset
      if (action === 'pick-brand') H.pickBrand?.()
      else if (action === 'music-toggle') {
        if (!musicLibrary.length) return H.toast('No hay canciones cargadas en la app')
        ensureAudio()
        if (!audio || !audio.src) playTrack(currentTrack < 0 ? 0 : currentTrack)
        else if (waitingForNext) {
          clearTimeout(musicAdvanceTimer)
          waitingForNext = false
          finishedCurrentTrack = true
          musicStarted = false
          musicPausedByUser = true
        } else if (!audio.paused) {
          audio.pause()
          musicStarted = false
          musicPausedByUser = true
        } else if (finishedCurrentTrack) playTrack(currentTrack + 1)
        else {
          audio.play().then(() => { musicStarted = true; musicPausedByUser = false; updateMusicControls() }).catch(() => {})
        }
        updateMusicControls()
      } else if (action === 'music-next' || action === 'music-previous') {
        if (!musicLibrary.length) return H.toast('No hay canciones cargadas en la app')
        const direction = action === 'music-next' ? 1 : -1
        const nextTrack = currentTrack < 0 ? (direction < 0 ? musicLibrary.length - 1 : 0) : currentTrack + direction
        playTrack(nextTrack)
      }
      else if (action === 'scale') {
        P.set({ scale: Number(btn.dataset.scale) })
        render()
      } else if (action === 'theme') {
        P.set({ theme: btn.dataset.theme })
        render()
      } else if (action === 'bg-select') selectBackground(btn.dataset.id || null)
      else if (action === 'bg-delete') deleteBackground(btn.dataset.id)
      else if (action === 'install') install()
      else if (action === 'reset-all') {
        if (!(await H.confirm('Se restablecerán la escala, el tema y el fondo activo.', { confirmText: 'Restablecer' }))) return
        P.set({ ...P.DEFAULTS, musicVolume: P.get().musicVolume, sfxVolume: P.get().sfxVolume })
        paintBackground()
        render()
        H.toast('Ajustes restablecidos')
      }
    })
    el.addEventListener('change', (e) => {
      const { name } = e.target
      if (name === 'bg-file') {
        addBackgrounds(e.target.files || [])
        e.target.value = ''
      } else if (name === 'bg-grid') {
        P.set({ bgGrid: e.target.checked })
      } else if (name === 'music-autoplay') {
        P.set({ musicAutoplay: e.target.checked })
        if (e.target.checked) scheduleInitialMusic()
        else {
          clearTimeout(musicStartTimer)
          musicStartTimer = 0
          musicStartAt = 0
        }
      }
    })
    el.addEventListener('input', (e) => {
      if (e.target.name === 'music-volume' || e.target.name === 'sfx-volume') {
        const key = e.target.name === 'music-volume' ? 'musicVolume' : 'sfxVolume'
        const value = Number(e.target.value)
        P.set({ [key]: value })
        const out = e.target.closest('.range-field')?.querySelector('output')
        if (out) out.textContent = `${Math.round(value * 100)}%`
        if (key === 'musicVolume' && audio) audio.volume = value
        return
      }
      if (e.target.name !== 'bg-dim') return
      const v = Number(e.target.value)
      P.set({ bgDim: v })
      const out = e.target.closest('.range-field')?.querySelector('output')
      if (out) out.textContent = `${Math.round(v * 100)}%`
    })
  }

  async function init() {
    bind()
    render()
    void loadMusic()
    await loadLibrary()
    render()
  }

  init()
})()
