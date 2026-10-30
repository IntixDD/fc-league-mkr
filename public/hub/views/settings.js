;(() => {
  const H = window.Hub
  const P = window.HubPrefs
  const LEGACY_BG_KEY = 'ui:background'
  const LIBRARY_KEY = 'ui:bg-library'
  const MAX_RAW_BYTES = 6 * 1024 * 1024
  const MAX_SIDE = 2560
  const MAX_BACKGROUNDS = 12
  let library = []
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

    el.innerHTML = `
      <div class="panel-grid set-grid">
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
          body: '<p class="credit-line">Creado por <strong>IntixD</strong></p><div class="about-version"><span>Versión</span><strong>v0.0.0-beta-2.6</strong><span class="about-build">Beta Build</span></div>',
        })}
      </div>`
  }

  function bind() {
    const el = document.getElementById('settings-body')
    if (!el) return
    el.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]')
      if (!btn) return
      const { action } = btn.dataset
      if (action === 'scale') {
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
        P.set({ ...P.DEFAULTS })
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
      }
    })
    el.addEventListener('input', (e) => {
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
    await loadLibrary()
    render()
  }

  init()
})()
