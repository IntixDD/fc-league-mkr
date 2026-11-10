;(() => {
  const H = window.Hub
  const P = window.HubPrefs
  const LEGACY_BG_KEY = 'ui:background'
  const LIBRARY_KEY = 'ui:bg-library'
  const MAX_RAW_BYTES = 6 * 1024 * 1024
  const MAX_SIDE = 2560
  const MAX_BACKGROUNDS = 12
  const PRELOADED_BACKGROUNDS = [
    { id: 'preset-estadio-atardecer', label: 'Stadio Diego Armando Maradona', src: 'backgrounds/estadio0.jpg' },
    { id: 'preset-estadio-cielo-abierto', label: 'Etihad Stadium', src: 'backgrounds/estadio1.jpg' },
  ]
  const MUSIC_ICONS = {
    previous: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M19 5 9 12l10 7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM15 5h4v14h-4z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.8v14.4a.8.8 0 0 0 1.2.7l11-7.2a.8.8 0 0 0 0-1.4l-11-7.2a.8.8 0 0 0-1.2.7z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14M5 5l10 7-10 7z"/></svg>',
  }
  let library = []
  let musicLibrary = []
  let currentTrack = -1
  let musicOrder = []
  let musicOrderPosition = -1
  let previousMusicOrder = []
  let musicStarted = false
  let musicDelayElapsed = false
  let musicPausedByUser = false
  let audio = null
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

  function shuffleMusicOrder() {
    const makeOrder = () => {
      const order = musicLibrary.map((_, index) => index)
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[order[i], order[j]] = [order[j], order[i]]
      }
      return order
    }
    let order = makeOrder()
    if (order.length > 1 && previousMusicOrder.length === order.length) {
      const lastPrevious = previousMusicOrder[previousMusicOrder.length - 1]
      let attempts = 0
      while (
        attempts < 24 &&
        (order[0] === lastPrevious || order.every((index, i) => index === previousMusicOrder[i]))
      ) {
        order = makeOrder()
        attempts++
      }
      if (order[0] === lastPrevious || order.every((index, i) => index === previousMusicOrder[i])) {
        order = [...previousMusicOrder.slice(1), previousMusicOrder[0]]
      }
    }
    previousMusicOrder = [...order]
    return order
  }

  function ensureMusicOrder() {
    if (!musicOrder.length) musicOrder = shuffleMusicOrder()
    if (musicOrderPosition >= musicOrder.length - 1) {
      musicOrder = shuffleMusicOrder()
      musicOrderPosition = -1
    }
  }

  function nextMusicTrack() {
    if (!musicLibrary.length) return -1
    ensureMusicOrder()
    musicOrderPosition += 1
    return musicOrder[musicOrderPosition]
  }

  function playRandomTrack() {
    if (!musicLibrary.length) return
    playTrack(nextMusicTrack())
  }

  function playPreviousTrack() {
    if (musicOrderPosition < 0) {
      playRandomTrack()
      return
    }
    if (!finishedCurrentTrack && currentTrack >= 0 && audio && audio.currentTime > 3) {
      playTrack(currentTrack)
      return
    }
    if (musicOrderPosition > 0) {
      musicOrderPosition -= 1
      playTrack(musicOrder[musicOrderPosition])
    } else if (currentTrack >= 0) playTrack(currentTrack)
  }

  function updateMusicControls() {
    updateCurrentTrack()
    const button = document.querySelector('[data-action="music-toggle"]')
    if (!button) return
    const active = (!!audio && !audio.paused) || waitingForNext
    const available = musicLibrary.length > 0
    button.innerHTML = `${active ? MUSIC_ICONS.pause : MUSIC_ICONS.play}<span>${active ? 'Pausar' : 'Reproducir'}</span>`
    button.setAttribute('aria-label', active ? 'Pausar música' : 'Reproducir música')
    button.disabled = !available
    document.querySelectorAll('.music-transport [data-action="music-next"], .music-transport [data-action="music-previous"]').forEach((control) => { control.disabled = !available })
  }

  function updateCurrentTrack(track = musicLibrary[currentTrack]) {
    const display = document.getElementById('music-current-track')
    if (!display) return
    if (!track) {
      display.innerHTML = '<span class="music-current-cover music-cover-placeholder" aria-hidden="true">♫</span><span class="music-current-meta"><strong>Sin canción seleccionada</strong><small>La biblioteca está vacía</small></span>'
      return
    }
    const coverUrl = track.cover ? musicAssetUrl(track.cover) : ''
    const status = waitingForNext ? 'Siguiente canción…' : audio?.src && !audio.paused ? 'Reproduciendo ahora' : audio?.src ? 'En pausa' : 'Lista para reproducir'
    display.innerHTML = `${coverUrl ? `<img class="music-current-cover" src="${H.esc(coverUrl)}" alt="Portada de ${H.esc(track.title)}">` : '<span class="music-current-cover music-cover-placeholder" aria-hidden="true">♫</span>'}<span class="music-current-meta"><small>${status}</small><strong title="${H.esc(track.title)}">${H.esc(track.title)}</strong></span>`
  }

  function ensureAudio() {
    if (audio) return
    audio = new Audio()
    audio.volume = P.get().musicVolume ?? 0.15
    audio.addEventListener('ended', () => {
      finishedCurrentTrack = true
      waitingForNext = true
      updateMusicControls()
      clearTimeout(musicAdvanceTimer)
      musicAdvanceTimer = window.setTimeout(() => {
        waitingForNext = false
        playRandomTrack()
      }, 2000)
    })
    audio.addEventListener('play', updateMusicControls)
    audio.addEventListener('pause', updateMusicControls)
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
    updateCurrentTrack(track)
    audio.src = track.src
    audio.currentTime = 0
    audio.play().then(() => {
      musicStarted = true
      musicNotice(track)
      updateMusicControls()
    }).catch(() => {
      musicStarted = false
      updateMusicControls()
    })
  }

  function playMusic() {
    if (!musicLibrary.length || musicStarted) return
    if (musicOrderPosition < 0) playRandomTrack()
    else playTrack(currentTrack)
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
          title: item.title || item.file.split('/').pop().replace(/\.mp3$/i, ''),
          src: musicAssetUrl(item.file),
          cover: item.cover || '',
        }
      }).filter(Boolean) : []
    musicOrder = []
    musicOrderPosition = -1
    previousMusicOrder = []
    musicOrder = shuffleMusicOrder()
    currentTrack = musicOrder[0] ?? -1
    updateMusicControls()
    if (musicLibrary.length && P.get().musicAutoplay !== false) {
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
          playRandomTrack()
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

  function ensureSfxContext() {
    if (sfxContext) return sfxContext
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null
    try {
      sfxContext = new AudioContextClass()
      Promise.all(SFX_FILES.map(async (file) => {
        try {
          const response = await fetch(new URL(`media/sfx/${file}`, document.baseURI), { cache: 'force-cache' })
          if (!response.ok) return
          const buffer = await response.arrayBuffer()
          sfxBuffers.set(file, await sfxContext.decodeAudioData(buffer))
        } catch {}
      }))
    } catch {
      sfxContext = null
    }
    return sfxContext
  }

  function playSfxBuffer(file, volume) {
    if (!sfxContext || sfxContext.state !== 'running') return false
    const buffer = sfxBuffers.get(file)
    if (!buffer) return false
    try {
      const source = sfxContext.createBufferSource()
      const gain = sfxContext.createGain()
      source.buffer = buffer
      gain.gain.value = volume
      source.connect(gain)
      gain.connect(sfxContext.destination)
      source.start(0)
      return true
    } catch {
      return false
    }
  }

  function playSfx(file = 'tap.wav') {
    const volume = P.get().sfxVolume ?? 1
    if (!volume) return
    const context = ensureSfxContext()
    if (context && sfxBuffers.has(file)) {
      if (context.state === 'running' && playSfxBuffer(file, volume)) return
      if (context.state === 'suspended') {
        context.resume().then(() => { if (!playSfxBuffer(file, volume)) playSfxFallback(file, volume) }).catch(() => playSfxFallback(file, volume))
        return
      }
    }
    playSfxFallback(file, volume)
  }

  function playSfxFallback(file, volume) {
    let sound = sfxPlayers.get(file)
    if (!sound) {
      sound = new Audio(`media/sfx/${file}`)
      sound.preload = 'auto'
      sound.load()
      sfxPlayers.set(file, sound)
    }
    sound.volume = volume
    try { sound.currentTime = 0 } catch {}
    sound.play().catch(() => {})
  }
  SFX_FILES.forEach((file) => {
    const sound = new Audio(`media/sfx/${file}`)
    sound.preload = 'auto'
    sound.load()
    sfxPlayers.set(file, sound)
  })
  ensureSfxContext()
  let lastSfxControl = null
  let lastSfxAt = 0
  const SFX_CONTROL_SELECTOR = '.nav-button, button, a[href], [role="button"], .file-btn, [data-action], [data-open-menu], [data-toggle-card], .logo, summary'
  function playControlSfx(event) {
    const origin = event.target instanceof Element ? event.target : event.target?.parentElement
    const target = origin?.closest(SFX_CONTROL_SELECTOR)
    if (!target) return
    const now = performance.now()
    if (target === lastSfxControl && now - lastSfxAt < 450) return
    lastSfxControl = target
    lastSfxAt = now
    if (target.closest('.nav-button')) playSfx('nav.wav')
    else playSfx()
  }
  document.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'touch') playControlSfx(event)
  }, { capture: true, passive: true })
  document.addEventListener('click', playControlSfx)

  const urlFor = (item) => {
    if (item.src) return item.src
    if (!urls.has(item.id)) urls.set(item.id, URL.createObjectURL(item.blob))
    return urls.get(item.id)
  }
  const backgroundById = (id) => PRELOADED_BACKGROUNDS.find((item) => item.id === id) || library.find((item) => item.id === id)
  const forgetUrl = (id) => {
    const u = urls.get(id)
    if (u) URL.revokeObjectURL(u)
    urls.delete(id)
  }
  const newId = () => `bg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

  function paintBackground() {
    const layer = document.querySelector('.bg-custom')
    const active = backgroundById(P.get().activeBg)
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
    if (P.get().activeBg && !backgroundById(P.get().activeBg)) P.set({ activeBg: null })
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
      <header class="card-head"><h2 class="card-title">${title}</h2></header>
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
      ...PRELOADED_BACKGROUNDS.map((background) => `<li><button class="bg-tile bg-tile--preset" data-action="bg-select" data-id="${background.id}" aria-pressed="${p.activeBg === background.id}" style="background-image:url('${urlFor(background)}')"><span class="bg-tile-label">${background.label}</span></button></li>`),
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
        })}

        ${card({
          title: 'Música y sonidos',
          sub: `${musicLibrary.length} canción(es) disponibles en la app`,
          body: `<div class="music-current-track" id="music-current-track" aria-live="polite"></div><div class="audio-controls"><label class="field range-field"><span class="field-label">Música <output>${Math.round((p.musicVolume ?? .15) * 100)}%</output></span><input type="range" name="music-volume" min="0" max="1" step="0.05" value="${p.musicVolume ?? .15}"></label><label class="field range-field"><span class="field-label">SFX <output>${Math.round((p.sfxVolume ?? 1) * 100)}%</output></span><input type="range" name="sfx-volume" min="0" max="1" step="0.05" value="${p.sfxVolume ?? 1}"></label></div><div class="tournament-option-card tournament-toggle-card music-autoplay-card" data-toggle-card="music-autoplay"><label class="series-choice music-autoplay-choice"><input type="checkbox" name="music-autoplay" ${p.musicAutoplay !== false ? 'checked' : ''}><span><strong>Reproducir música al iniciar la app</strong><small>La app elegirá una canción al azar</small></span></label></div><div class="music-transport" role="group" aria-label="Controles de música"><button class="btn btn--ghost" type="button" data-action="music-previous" aria-label="Canción anterior">${MUSIC_ICONS.previous}<span>Anterior</span></button><button class="btn btn--primary music-toggle" type="button" data-action="music-toggle" aria-label="Pausar música">${MUSIC_ICONS.pause}<span>Pausar</span></button><button class="btn btn--ghost" type="button" data-action="music-next" aria-label="Siguiente canción">${MUSIC_ICONS.next}<span>Siguiente</span></button></div>`,
        })}

        ${card({
          title: 'Escala de la interfaz',
          sub: 'Cómo se ajusta la app a tu pantalla',
          body: `<div class="seg" role="group" aria-label="Escala de la interfaz">
              <button class="seg-btn" data-action="scale" data-scale="-1" aria-pressed="${p.scale === -1}">-1 · Vista PC<small>Toda la interfaz en pantalla</small></button>
              <button class="seg-btn" data-action="scale" data-scale="0" aria-pressed="${p.scale === 0}">0 · Predeterminada<small>Adaptada al celular</small></button>
            </div>
            <p class="hint">Con <strong>-1</strong> la app usa el diseño de computadora y lo reduce para que entre entero en la pantalla del celular. En pantallas grandes no cambia nada.</p>`,
        })}

        ${card({
          title: 'Tema',
          sub: 'Color de acento y brillo del fondo',
          body: `<div class="theme-grid" role="group" aria-label="Tema de la app">${themes}</div>`,
        })}

        ${card({
          title: 'Fondos',
          sub: `${library.length} de ${MAX_BACKGROUNDS} fondos propios guardados · ${p.activeBg ? 'Fondo elegido activo' : 'Fondo original activo'}`,
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
          body: '<p class="credit-line">Creado por <strong>IntixD</strong></p><div class="about-version"><span>Versión</span><strong>v0.0.0-beta-4.0</strong><span class="about-build">Beta Build</span></div>',
        })}
      </div>`
    updateMusicControls()
  }

  function bind() {
    const el = document.getElementById('settings-body')
    if (!el) return
    document.addEventListener('league:brandlogochange', () => render())
    el.addEventListener('click', async (e) => {
      const autoplayCard = e.target.closest('[data-toggle-card="music-autoplay"]')
      if (autoplayCard && !e.target.closest('input, label')) {
        autoplayCard.querySelector('input[type="checkbox"]')?.click()
        return
      }
      const btn = e.target.closest('[data-action]')
      if (!btn) return
      const { action } = btn.dataset
      if (action === 'pick-brand') H.pickBrand?.()
      else if (action === 'music-toggle') {
        if (!musicLibrary.length) return H.toast('No hay canciones cargadas en la app')
        if (!audio || !audio.src) {
          if (musicOrderPosition < 0) playRandomTrack()
          else playTrack(currentTrack)
        }
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
        } else if (finishedCurrentTrack) playRandomTrack()
        else audio.play().then(() => { musicStarted = true; musicPausedByUser = false; updateMusicControls() }).catch(() => {})
        updateMusicControls()
      } else if (action === 'music-next' || action === 'music-previous') {
        if (!musicLibrary.length) return H.toast('No hay canciones cargadas en la app')
        if (action === 'music-next') playRandomTrack()
        else playPreviousTrack()
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
