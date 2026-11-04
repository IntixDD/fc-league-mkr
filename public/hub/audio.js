/* Shared music + SFX engine.
 *
 * Everything is lazy: no AudioContext and no <audio> element is created at
 * script evaluation. A single AudioContext is shared by the music analyser and
 * the sound effects, the equalizer runs at ~30 fps and only while Settings is
 * on screen, and SFX have a voice cap so rapid taps cannot saturate a phone.
 */
;(() => {
  const P = window.HubPrefs
  const SFX_FILES = ['tap.wav', 'nav.wav']
  const SFX_MAX_VOICES = 3
  const METER_FPS = 30
  const METER_INTERVAL = 1000 / METER_FPS
  const ICONS = {
    previous: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M19 5 9 12l10 7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM15 5h4v14h-4z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.8v14.4a.8.8 0 0 0 1.2.7l11-7.2a.8.8 0 0 0 0-1.4l-11-7.2a.8.8 0 0 0-1.2.7z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5v14M5 5l10 7-10 7z"/></svg>',
  }

  let library = []
  let currentTrack = -1
  let audio = null
  let started = false
  let pausedByUser = false
  let waitingForNext = false
  let finishedCurrent = false
  let playbackError = false
  let autoplayTimer = 0
  let autoplayAt = 0
  let delayElapsed = false
  let advanceTimer = 0
  let resumeOnVisible = false
  let resumeNextOnVisible = false
  let initialized = false

  let context = null
  let analyser = null
  let mediaNode = null
  let capture = null
  let analyserPending = false
  let meterData = null
  let meterFrame = 0
  let meterLast = 0
  let meterActive = false
  let captureRequest = 0
  let captureSrc = ''
  const barLevels = []

  const sfxBuffers = new Map()
  const sfxLoading = new Map()
  const sfxFallbacks = new Map()
  let sfxVoices = 0
  let sfxPrimed = false
  let lastSfxTarget = null
  let lastSfxAt = 0

  const isIOS = () =>
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  function assetUrl(filename) {
    const safe = String(filename || '')
      .split('/')
      .filter((part) => part && part !== '.' && part !== '..')
      .map(encodeURIComponent)
      .join('/')
    return new URL(`media/music/${safe}`, document.baseURI).href
  }

  function sfxUrl(filename) {
    return new URL(`media/sfx/${encodeURIComponent(filename)}`, document.baseURI).href
  }

  const isPlaying = () => waitingForNext || !!(audio && !audio.paused && !audio.ended)

  function settingsVisible() {
    const section = document.getElementById('settings')
    return !!section && !section.hidden
  }

  /* ---------- Controls rendered in Settings ---------- */
  function syncControls() {
    const track = library[currentTrack] || null
    const playing = isPlaying()
    const cover = document.querySelector('[data-music-cover]')
    if (cover) {
      const url = track?.cover ? assetUrl(track.cover) : ''
      if (cover.dataset.src !== url) {
        cover.dataset.src = url
        cover.innerHTML = url
          ? `<img src="${escapeHtml(url)}" alt="">`
          : '<span class="music-current-placeholder" aria-hidden="true">♫</span>'
      }
    }
    const title = document.querySelector('[data-music-title]')
    if (title) title.textContent = track?.title || 'No hay canciones disponibles'
    const status = document.querySelector('[data-music-state]')
    if (status) {
      status.textContent = waitingForNext
        ? 'Preparando la siguiente canción'
        : playing
          ? 'Reproduciendo ahora'
          : playbackError
            ? 'El navegador no pudo reproducir esta canción'
            : audio?.src
              ? 'En pausa'
              : track
                ? 'Lista para reproducir'
                : 'Añade canciones a la biblioteca'
    }
    const player = document.querySelector('.music-current')
    player?.classList.toggle('is-playing', playing && !waitingForNext)
    if (!playing && player) player.classList.remove('has-audio-meter')

    const button = document.querySelector('[data-action="music-toggle"]')
    if (button) {
      button.innerHTML = `${playing ? ICONS.pause : ICONS.play}<span>${playing ? 'Pausar' : 'Reproducir'}</span>`
      button.setAttribute('aria-label', playing ? 'Pausar música' : 'Reproducir música')
      button.disabled = !library.length
    }
    document
      .querySelectorAll('.music-transport [data-action="music-next"], .music-transport [data-action="music-previous"]')
      .forEach((control) => {
        control.disabled = !library.length
      })
    updateMediaSession()
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
  }

  function notice(track) {
    if (!track) return
    let el = document.getElementById('music-notice')
    if (!el) {
      el = document.createElement('aside')
      el.id = 'music-notice'
      el.className = 'music-notice'
      el.setAttribute('role', 'status')
      document.body.appendChild(el)
    }
    const url = track.cover ? assetUrl(track.cover) : ''
    el.innerHTML = `${url ? `<img src="${escapeHtml(url)}" alt="">` : '<span class="music-cover-placeholder">♫</span>'}<span><strong>${escapeHtml(track.title)}</strong><small>Reproduciendo</small></span>`
    el.classList.add('is-visible')
    clearTimeout(el._timer)
    el._timer = setTimeout(() => el.classList.remove('is-visible'), 4400)
  }

  /* ---------- Media Session ---------- */
  let mediaSessionReady = false
  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return
    const track = library[currentTrack]
    if (!track) return
    try {
      const artwork = track.cover ? [{ src: assetUrl(track.cover), sizes: '512x512' }] : []
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: 'League Hub',
        album: 'League Hub',
        artwork,
      })
      if (mediaSessionReady) return
      mediaSessionReady = true
      const handlers = {
        play: () => play(),
        pause: () => pause(),
        previoustrack: () => previous(),
        nexttrack: () => next(),
      }
      Object.entries(handlers).forEach(([action, handler]) => {
        try {
          navigator.mediaSession.setActionHandler(action, handler)
        } catch {}
      })
    } catch {}
  }

  /* ---------- Audio element ---------- */
  function ensureAudio() {
    if (audio) return audio
    audio = new Audio()
    audio.preload = 'metadata'
    audio.volume = P.get().musicVolume ?? 0.15
    audio.addEventListener('ended', () => {
      stopMeter()
      finishedCurrent = true
      waitingForNext = true
      syncControls()
      clearTimeout(advanceTimer)
      advanceTimer = window.setTimeout(() => {
        advanceTimer = 0
        if (document.hidden) {
          resumeNextOnVisible = true
          return
        }
        waitingForNext = false
        playTrack(currentTrack + 1)
      }, 2000)
    })
    audio.addEventListener('play', () => {
      if (context?.state === 'suspended') context.resume().catch(() => {})
      syncControls()
      startMeter()
    })
    audio.addEventListener('pause', () => {
      stopMeter()
      syncControls()
    })
    audio.addEventListener('loadedmetadata', () => {
      playbackError = false
      syncControls()
    })
    audio.addEventListener('error', () => {
      if (!audio?.src) return
      playbackError = true
      started = false
      stopMeter()
      syncControls()
    })
    return audio
  }

  function playTrack(index) {
    if (!library.length) return
    ensureAudio()
    clearTimeout(advanceTimer)
    waitingForNext = false
    finishedCurrent = false
    currentTrack = ((index % library.length) + library.length) % library.length
    pausedByUser = false
    const track = library[currentTrack]
    playbackError = false
    audio.src = track.src
    try {
      audio.currentTime = 0
    } catch {}
    syncControls()
    // Must be reached from a user gesture for the analyser to be allowed.
    void ensureAnalyser()
    audio
      .play()
      .then(() => {
        started = true
        playbackError = false
        notice(track)
        syncControls()
        startMeter()
      })
      .catch(() => {
        started = false
        playbackError = true
        syncControls()
      })
  }

  function play() {
    if (!library.length) {
      if (window.Hub?.toast) window.Hub.toast('No hay canciones cargadas en la app')
      return
    }
    ensureAudio()
    if (!audio.src) return playTrack(currentTrack < 0 ? 0 : currentTrack)
    pausedByUser = false
    if (waitingForNext) {
      clearTimeout(advanceTimer)
      waitingForNext = false
      finishedCurrent = true
      started = false
      syncControls()
      return
    }
    if (finishedCurrent) return playTrack(currentTrack + 1)
    void ensureAnalyser()
    audio
      .play()
      .then(() => {
        started = true
        pausedByUser = false
        playbackError = false
        syncControls()
      })
      .catch(() => {
        playbackError = true
        syncControls()
      })
  }

  function pause() {
    pausedByUser = true
    started = false
    clearTimeout(advanceTimer)
    if (waitingForNext) {
      waitingForNext = false
      finishedCurrent = true
      syncControls()
      return
    }
    if (audio && !audio.paused) audio.pause()
    else syncControls()
  }

  function toggle() {
    if (isPlaying()) pause()
    else play()
  }

  function next() {
    if (!library.length) return
    playTrack(currentTrack + 1)
  }

  function previous() {
    if (!library.length) return
    playTrack(currentTrack - 1)
  }

  /* ---------- Shared AudioContext / analyser ---------- */
  function ensureContext() {
    if (context) return context
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null
    try {
      context = new AudioContextClass()
    } catch {
      context = null
    }
    return context
  }

  async function attachCapture(ctx, targetAnalyser) {
    if (!audio) return false
    const captureStream = audio.captureStream || audio.mozCaptureStream
    if (!captureStream) return false
    const src = audio.src
    const request = ++captureRequest
    if (audio.paused || audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise((resolve) => {
        let timer = 0
        const done = () => {
          clearTimeout(timer)
          audio.removeEventListener('playing', done)
          audio.removeEventListener('error', done)
          resolve()
        }
        audio.addEventListener('playing', done, { once: true })
        audio.addEventListener('error', done, { once: true })
        timer = window.setTimeout(done, 5000)
      })
    }
    if (request !== captureRequest || audio.paused || audio.src !== src) return false
    try {
      const stream = captureStream.call(audio)
      if (!stream.getAudioTracks().some((track) => track.readyState === 'live')) return false
      const source = ctx.createMediaStreamSource(stream)
      source.connect(targetAnalyser)
      // The element already outputs audio; keep the analyser tap silent.
      const silent = ctx.createGain()
      silent.gain.value = 0
      targetAnalyser.connect(silent)
      silent.connect(ctx.destination)
      capture?.source?.disconnect()
      capture?.stream?.getTracks().forEach((track) => track.stop())
      capture = { source, stream, src }
      return true
    } catch {
      return false
    }
  }

  async function ensureAnalyser() {
    if (analyser) {
      if (context?.state === 'suspended') context.resume().catch(() => {})
      startMeter()
      return true
    }
    if (analyserPending || !audio) return false
    // iOS may silence a media element routed through createMediaElementSource.
    // The CSS equalizer is smooth there, so keep native playback untouched.
    if (isIOS()) return false
    if (!navigator.userActivation?.isActive) return false
    analyserPending = true
    try {
      const ctx = ensureContext()
      if (!ctx) return false
      await ctx.resume()
      if (ctx.state !== 'running' || !audio) return false
      const node = ctx.createAnalyser()
      node.fftSize = 128
      node.smoothingTimeConstant = 0.72
      let connected = false
      if (!mediaNode) {
        try {
          mediaNode = ctx.createMediaElementSource(audio)
        } catch {
          mediaNode = null
        }
      }
      if (mediaNode) {
        mediaNode.connect(node)
        const output = ctx.createGain()
        output.gain.value = 1
        node.connect(output)
        output.connect(ctx.destination)
        connected = true
      } else if (location.protocol === 'file:') {
        connected = await attachCapture(ctx, node)
      }
      if (!connected) return false
      analyser = node
      meterData = new Uint8Array(node.frequencyBinCount)
      startMeter()
      syncControls()
      return true
    } catch {
      return false
    } finally {
      analyserPending = false
    }
  }

  function startMeter() {
    if (meterActive || !analyser || !meterData || !audio || audio.paused) return
    if (document.hidden || !settingsVisible()) return
    const bars = [...document.querySelectorAll('.music-equalizer i')]
    if (!bars.length) return
    meterActive = true
    meterLast = 0
    document.querySelector('.music-current')?.classList.add('has-audio-meter')
    const tick = (now) => {
      if (!meterActive) return
      meterFrame = requestAnimationFrame(tick)
      if (now - meterLast < METER_INTERVAL - 1) return
      meterLast = now
      if (!analyser || !audio || audio.paused || document.hidden || !settingsVisible()) {
        stopMeter()
        return
      }
      analyser.getByteFrequencyData(meterData)
      const buckets = bars.length
      for (let index = 0; index < buckets; index += 1) {
        const start = Math.floor((index * meterData.length) / buckets)
        const end = Math.max(start + 1, Math.floor(((index + 1) * meterData.length) / buckets))
        let total = 0
        for (let bin = start; bin < end; bin += 1) total += meterData[bin]
        const level = total / (end - start) / 255
        // Fast attack, slower release: lively but without flicker.
        const prev = barLevels[index] || 0
        barLevels[index] = level > prev ? prev + (level - prev) * 0.55 : prev + (level - prev) * 0.18
        bars[index].style.height = `${Math.round(18 + barLevels[index] * 82)}%`
      }
    }
    meterFrame = requestAnimationFrame(tick)
  }

  function stopMeter() {
    meterActive = false
    if (meterFrame) cancelAnimationFrame(meterFrame)
    meterFrame = 0
    document.querySelector('.music-current')?.classList.remove('has-audio-meter')
    document.querySelectorAll('.music-equalizer i').forEach((bar) => {
      bar.style.height = ''
    })
    barLevels.length = 0
  }

  function refreshMeter() {
    // Settings re-renders replace the equalizer nodes, so re-bind instead of
    // keeping the animation loop pointed at detached bars.
    if (analyser && audio && !audio.paused && settingsVisible() && !document.hidden) {
      stopMeter()
      startMeter()
    } else {
      stopMeter()
    }
  }

  /* ---------- SFX ---------- */
  function primeSfx() {
    if (sfxPrimed) return
    sfxPrimed = true
    const ctx = ensureContext()
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    SFX_FILES.forEach((file) => loadSfx(file, ctx))
  }

  async function loadSfx(file, ctx) {
    if (sfxBuffers.has(file) || sfxLoading.has(file)) return sfxLoading.get(file)
    const request = fetch(sfxUrl(file), { cache: 'force-cache' })
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .then((buffer) => (buffer ? ctx.decodeAudioData(buffer) : null))
      .then((decoded) => {
        if (decoded) sfxBuffers.set(file, decoded)
        return decoded
      })
      .catch(() => null)
    sfxLoading.set(file, request)
    await request
    sfxLoading.delete(file)
  }

  function playFallback(file, volume) {
    let sound = sfxFallbacks.get(file)
    if (!sound) {
      sound = new Audio(sfxUrl(file))
      sound.preload = 'auto'
      sfxFallbacks.set(file, sound)
    }
    sound.volume = volume
    try {
      sound.currentTime = 0
    } catch {}
    sound.play().catch(() => {})
  }

  function playSfx(file = 'tap.wav') {
    const volume = P.get().sfxVolume ?? 1
    if (!volume) return
    // Hard cap even on the HTMLAudio fallback path: rapid taps on a phone
    // should never stack dozens of overlapping sounds.
    if (sfxVoices >= SFX_MAX_VOICES) return
    primeSfx()
    const ctx = ensureContext()
    if (!ctx) return playFallback(file, volume)
    const playBuffer = () => {
      const buffer = sfxBuffers.get(file)
      if (!buffer || sfxVoices >= SFX_MAX_VOICES) return false
      try {
        const source = ctx.createBufferSource()
        const gain = ctx.createGain()
        source.buffer = buffer
        gain.gain.value = volume
        source.connect(gain)
        gain.connect(ctx.destination)
        sfxVoices += 1
        source.onended = () => {
          sfxVoices = Math.max(0, sfxVoices - 1)
          source.disconnect()
          gain.disconnect()
        }
        source.start(0)
        return true
      } catch {
        return false
      }
    }
    if (ctx.state === 'running') {
      if (playBuffer()) return
      // First tap before the small WAV finishes decoding.
      if (!sfxLoading.has(file)) loadSfx(file, ctx).then(() => playBuffer())
      return playFallback(file, volume)
    }
    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .then(() => {
          if (!playBuffer() && !sfxBuffers.has(file)) playFallback(file, volume)
        })
        .catch(() => playFallback(file, volume))
      return
    }
    playFallback(file, volume)
  }

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target.closest(
        '.nav-button, button, a[href], [role="button"], .file-btn, [data-action], [data-open-menu], .logo',
      )
      if (!target) return
      primeSfx()
      const now = performance.now()
      if (target === lastSfxTarget && now - lastSfxAt < 120) return
      lastSfxTarget = target
      lastSfxAt = now
      playSfx(target.closest('.nav-button') ? 'nav.wav' : 'tap.wav')
    },
    { passive: true },
  )

  /* ---------- Library + autoplay ---------- */
  function loadLibrary() {
    const entries = window.HUB_MUSIC_TRACKS
    library = Array.isArray(entries)
      ? entries
          .map((entry) => {
            const item = typeof entry === 'string' ? { file: entry } : entry
            if (!item?.file || !/\.mp3$/i.test(item.file)) return null
            return {
              title: item.title || item.file.split('/').pop().replace(/\.mp3$/i, ''),
              src: assetUrl(item.file),
              cover: item.cover || '',
            }
          })
          .filter(Boolean)
      : []
    if (library.length) currentTrack = 0
    syncControls()
  }

  function scheduleAutoplay() {
    if (autoplayTimer || delayElapsed || started || document.hidden || !library.length || P.get().musicAutoplay === false) return
    if (!autoplayAt) autoplayAt = Date.now() + 4000
    autoplayTimer = window.setTimeout(
      () => {
        autoplayTimer = 0
        delayElapsed = true
        if (pausedByUser) return
        play()
      },
      Math.max(0, autoplayAt - Date.now()),
    )
  }

  function cancelAutoplay() {
    clearTimeout(autoplayTimer)
    autoplayTimer = 0
  }

  function setAutoplay(enabled) {
    if (enabled) {
      autoplayAt = 0
      delayElapsed = false
      scheduleAutoplay()
    } else {
      cancelAutoplay()
      autoplayAt = 0
      delayElapsed = false
    }
  }

  /* ---------- Visibility / first gesture ---------- */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAutoplay()
      stopMeter()
      if (waitingForNext) {
        clearTimeout(advanceTimer)
        advanceTimer = 0
        resumeNextOnVisible = true
      } else if (audio && !audio.paused) {
        resumeOnVisible = true
        audio.pause()
      }
      return
    }
    if (resumeNextOnVisible) {
      resumeNextOnVisible = false
      advanceTimer = window.setTimeout(() => {
        advanceTimer = 0
        waitingForNext = false
        playTrack(currentTrack + 1)
      }, 1200)
    } else if (resumeOnVisible && audio && !pausedByUser) {
      resumeOnVisible = false
      audio.play().then(() => syncControls()).catch(() => {})
    }
    if (settingsVisible()) refreshMeter()
    scheduleAutoplay()
  })

  document.addEventListener(
    'pointerdown',
    (event) => {
      primeSfx()
      if (analyser) {
        if (context?.state === 'suspended') context.resume().catch(() => {})
        startMeter()
        return
      }
      if (delayElapsed && !started && !pausedByUser && library.length && !event.target.closest('.music-transport')) play()
      else if (started) void ensureAnalyser()
    },
    { capture: true, passive: true },
  )

  document.addEventListener('keydown', (event) => {
    primeSfx()
    if (analyser || !started) return
    if (event.key === 'Tab' || event.key === 'Enter' || event.key === ' ') void ensureAnalyser()
  }, { capture: true, passive: true })

  document.addEventListener('app:sectionchange', (event) => {
    if (event.detail?.id === 'settings') refreshMeter()
    else stopMeter()
  })
  document.addEventListener('app:sectionwillchange', (event) => {
    if (event.detail?.id !== 'settings') stopMeter()
  })

  /* ---------- Public API ---------- */
  window.HubAudio = {
    assetUrl,
    init() {
      if (initialized) return
      initialized = true
      loadLibrary()
      scheduleAutoplay()
    },
    get library() {
      return library
    },
    get current() {
      return library[currentTrack] || null
    },
    get playing() {
      return isPlaying()
    },
    get hasAnalyser() {
      return !!analyser
    },
    play,
    pause,
    toggle,
    next,
    previous,
    playTrack,
    syncControls,
    refreshMeter,
    setAutoplay,
    setMusicVolume(value) {
      const volume = Math.max(0, Math.min(1, Number(value) || 0))
      if (audio) audio.volume = volume
    },
  }

  window.HubAudio.init()
})()
