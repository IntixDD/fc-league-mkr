;(() => {
  const H = window.Hub
  const P = window.HubPrefs
  const BG_KEY = 'ui:background'
  const MAX_RAW_BYTES = 6 * 1024 * 1024
  const MAX_SIDE = 2560
  let bgUrl = null
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
  const getBg = () => idb('readonly', (s) => s.get(BG_KEY))
  const putBg = (blob) => idb('readwrite', (s) => s.put(blob, BG_KEY))
  const delBg = () => idb('readwrite', (s) => s.delete(BG_KEY))

  function showBg(blob) {
    const layer = document.querySelector('.bg-custom')
    if (bgUrl) URL.revokeObjectURL(bgUrl)
    bgUrl = blob ? URL.createObjectURL(blob) : null
    if (layer) layer.style.backgroundImage = bgUrl ? `url("${bgUrl}")` : ''
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

  async function setBackground(file) {
    if (!file || !file.type.startsWith('image/')) return H.toast('Elige un archivo de imagen', 'error')
    try {
      const blob = await shrink(file)
      await putBg(blob)
      showBg(blob)
      P.set({ hasBg: true })
      render()
      H.toast('Fondo actualizado')
    } catch {
      H.toast('No se pudo guardar la imagen', 'error')
    }
  }

  async function resetBackground() {
    await delBg().catch(() => {})
    showBg(null)
    P.set({ hasBg: false })
    render()
    H.toast('Fondo predeterminado restaurado')
  }

  /* ---------- Install (PWA) ---------- */
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
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
  function installCard() {
    let body
    if (isStandalone()) {
      body = '<p class="notice notice--ok">La app ya está instalada y la estás usando en modo aplicación.</p>'
    } else if (installEvent) {
      body = `<p class="hint">Instala League Hub en tu pantalla de inicio: se abre a pantalla completa, sin barra del navegador, y funciona sin conexión.</p>
        <div class="row-actions"><button class="btn btn--primary" data-action="install">Instalar app</button></div>`
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
        </ol>
        <p class="hint">Si tu navegador lo permite, aquí aparecerá un botón para instalarla con un toque.</p>`
    }
    return `
      <article class="card">
        <header class="card-head"><div><h2 class="card-title">Instalar app</h2><p class="card-sub">Úsala como una aplicación en tu celular</p></div></header>
        ${body}
      </article>`
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
      <div class="panel-grid">
        <article class="card">
          <header class="card-head"><div><h2 class="card-title">Escala de la interfaz</h2><p class="card-sub">Cómo se ajusta la app a tu pantalla</p></div></header>
          <div class="seg" role="group" aria-label="Escala de la interfaz">
            <button class="seg-btn" data-action="scale" data-scale="-1" aria-pressed="${p.scale === -1}">-1 · Vista PC<small>Toda la interfaz en pantalla</small></button>
            <button class="seg-btn" data-action="scale" data-scale="0" aria-pressed="${p.scale === 0}">0 · Predeterminada<small>Adaptada al celular</small></button>
          </div>
          <p class="hint">Con <strong>-1</strong> la app usa el diseño de computadora (barra lateral y tablas completas) y lo reduce para que entre entero en la pantalla del celular. En pantallas grandes no cambia nada.</p>
        </article>

        <article class="card">
          <header class="card-head"><div><h2 class="card-title">Tema</h2><p class="card-sub">Color de acento y brillo del fondo</p></div></header>
          <div class="theme-grid" role="group" aria-label="Tema de la app">${themes}</div>
        </article>

        <article class="card">
          <header class="card-head"><div><h2 class="card-title">Fondo</h2><p class="card-sub">${p.hasBg ? 'Imagen personalizada' : 'Fondo predeterminado'}</p></div></header>
          <div class="bg-preview${p.hasBg ? ' is-custom' : ''}" aria-hidden="true" style="${p.hasBg && bgUrl ? `background-image:url('${bgUrl}')` : ''}; --dim: ${p.bgDim}">
            <span class="bg-preview-grid${p.bgGrid ? '' : ' is-off'}"></span>
          </div>
          <div class="row-actions">
            <label class="btn btn--primary file-btn">
              Elegir imagen
              <input class="sr-only" type="file" accept="image/*" name="bg-file">
            </label>
            <button class="btn btn--ghost" data-action="bg-reset" ${p.hasBg ? '' : 'disabled'}>Usar predeterminado</button>
          </div>
          ${
            p.hasBg
              ? `<label class="field range-field">
                  <span class="field-label">Oscurecer imagen <output>${Math.round(p.bgDim * 100)}%</output></span>
                  <input type="range" name="bg-dim" min="0" max="0.85" step="0.05" value="${p.bgDim}">
                </label>`
              : ''
          }
          <label class="check">
            <input type="checkbox" name="bg-grid" ${p.bgGrid ? 'checked' : ''}>
            Mostrar la cuadrícula sobre el fondo
          </label>
          <p class="hint">La imagen se guarda solo en este dispositivo.</p>
        </article>

        ${installCard()}

        <article class="card">
          <header class="card-head"><div><h2 class="card-title">Restablecer</h2><p class="card-sub">Vuelve a la apariencia original</p></div></header>
          <p class="hint">Restaura escala, tema y fondo predeterminados. Tus equipos, temporadas y resultados no se tocan.</p>
          <div class="row-actions"><button class="btn btn--danger" data-action="reset-all">Restablecer ajustes</button></div>
        </article>
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
      } else if (action === 'bg-reset') resetBackground()
      else if (action === 'install') install()
      else if (action === 'reset-all') {
        if (!(await H.confirm('Se restablecerán la escala, el tema y el fondo.', { confirmText: 'Restablecer' }))) return
        await delBg().catch(() => {})
        showBg(null)
        P.set({ ...P.DEFAULTS })
        render()
        H.toast('Ajustes restablecidos')
      }
    })
    el.addEventListener('change', (e) => {
      const { name } = e.target
      if (name === 'bg-file') {
        setBackground(e.target.files?.[0])
        e.target.value = ''
      } else if (name === 'bg-grid') {
        P.set({ bgGrid: e.target.checked })
        render()
      }
    })
    el.addEventListener('input', (e) => {
      if (e.target.name !== 'bg-dim') return
      const v = Number(e.target.value)
      P.set({ bgDim: v })
      const out = e.target.closest('.range-field')?.querySelector('output')
      if (out) out.textContent = `${Math.round(v * 100)}%`
      el.querySelector('.bg-preview')?.style.setProperty('--dim', v)
    })
  }

  async function init() {
    bind()
    render()
    if (P.get().hasBg) {
      const blob = await getBg().catch(() => null)
      if (blob) showBg(blob)
      else P.set({ hasBg: false })
      render()
    }
  }

  init()
})()
