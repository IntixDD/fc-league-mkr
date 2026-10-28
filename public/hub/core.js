window.Hub = (() => {
  const DB_NAME = 'league-hub'
  const STORE = 'kv'
  const KEY = 'state'
  const APP_ID = 'league-hub'
  const views = {}
  const ui = {
    selectedLogo: null,
    teamDraft: '',
    fxMode: null,
    round: 0,
    poSize: 8,
    perfTeam: '',
    historySort: 'neutral',
    historySortVersion: 1,
    historyDir: 'desc',
    newKeepTeams: true,
    repechageEnabled: null,
    lockSeasonExport: false,
    tournamentTwoLegged: false,
  }
  let state = null
  let saveTimer = 0
  let renderQueued = false
  let pendingSkip = null
  let dbPromise = null

  /* ---------- Persistence (IndexedDB) ---------- */
  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = () => req.result.createObjectStore(STORE)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    }
    return dbPromise
  }

  async function idb(mode, fn) {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req.result)
      tx.onerror = () => reject(tx.error)
    })
  }

  const loadState = () => idb('readonly', (s) => s.get(KEY))
  const saveState = () => idb('readwrite', (s) => s.put(state, KEY))

  // IndexedDB is the primary store (handles large logo galleries); localStorage is a
  // synchronous mirror so the latest edit survives a reload even if the async write is cut off.
  const LS_STATE = 'league-hub:state'
  const LS_UI = 'league-hub:ui'
  const UI_KEYS = ['fxMode', 'poSize', 'perfTeam', 'historySort', 'historySortVersion', 'historyDir', 'historyQuery', 'newKeepTeams', 'tableEdit', 'repechageEnabled', 'lockSeasonExport', 'tournamentTwoLegged']
  let dirty = false
  let lastUi = ''

  function readLocal() {
    try {
      return JSON.parse(localStorage.getItem(LS_STATE) || 'null')
    } catch {
      return null
    }
  }

  function writeLocal() {
    try {
      localStorage.setItem(LS_STATE, JSON.stringify(state))
      return true
    } catch {
      return false
    }
  }

  function loadUi() {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_UI) || 'null')
      if (saved) UI_KEYS.forEach((k) => k in saved && (ui[k] = saved[k]))
      if (!saved || saved.historySortVersion !== 1) {
        ui.historySort = 'neutral'
        ui.historySortVersion = 1
      }
    } catch {
      /* ignore corrupt ui prefs */
    }
  }

  function saveUi() {
    const json = JSON.stringify(Object.fromEntries(UI_KEYS.map((k) => [k, ui[k]])))
    if (json === lastUi) return
    lastUi = json
    try {
      localStorage.setItem(LS_UI, json)
    } catch {
      /* quota: ui prefs are optional */
    }
  }

  function flush() {
    clearTimeout(saveTimer)
    saveTimer = 0
    if (!state || !dirty) return
    dirty = false
    state.updatedAt = Date.now()
    const local = writeLocal()
    saveState().catch((err) => {
      if (!local) toast(`No se pudo guardar: ${err.message}`, 'error')
    })
  }

  function persist() {
    dirty = true
    clearTimeout(saveTimer)
    saveTimer = setTimeout(flush, 120)
  }

  addEventListener('pagehide', flush)
  addEventListener('beforeunload', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
    else scheduleRender()
  })

  /* ---------- Helpers ---------- */
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c])
  const clone = (value) => JSON.parse(JSON.stringify(value))
  const isScore = (v) => Number.isInteger(v) && v >= 0 && v <= 99
  const played = (m) => isScore(m.hg) && isScore(m.ag)
  const sc = (v) => (isScore(v) ? v : null)

  function parseScore(value) {
    if (value === '' || value == null) return null
    const n = Number(value)
    return isScore(n) ? n : null
  }

  function crest(logo, size = 'md', name = '') {
    const inner = logo
      ? `<img src="${esc(logo)}" alt="" loading="lazy" decoding="async">`
      : `<span class="crest-initial">${esc((name || '?').trim().charAt(0).toUpperCase() || '?')}</span>`
    return `<span class="crest crest--${size}">${inner}</span>`
  }

  function emptySeason(number = 1) {
    return {
      id: null,
      number,
      teams: [],
      fixtures: null,
      playoffs: null,
      fields: null,
      tableConfig: null,
      manual: null,
      awards: { leagueScorer: null, cupScorer: null },
      savedAt: null,
    }
  }

  const MANUAL_FIELDS = ['pg', 'pe', 'pp', 'gf', 'gc', 'pts']
  const toInt = (v, min, max) => {
    const n = Math.trunc(Number(v))
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0
  }

  function sanitizeManual(raw, ids) {
    if (!raw || typeof raw !== 'object') return null
    const rows = {}
    Object.entries(raw.rows || {}).forEach(([id, r]) => {
      if (!ids.has(id) || !r || typeof r !== 'object') return
      const row = { ptsManual: !!r.ptsManual }
      MANUAL_FIELDS.forEach((k) => (row[k] = k === 'pts' ? toInt(r[k], -99, 999) : toInt(r[k], 0, 999)))
      rows[id] = row
    })
    return { rows, finished: !!raw.finished }
  }

  function defaultState() {
    return { logos: [], brandLogo: null, current: emptySeason(1), seasons: [] }
  }

  function sanitizeSeason(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.teams)) return null
    const teams = raw.teams
      .filter((t) => t && typeof t.name === 'string' && t.name.trim())
      .map((t) => ({
        id: String(t.id || uid()),
        name: t.name.trim().replace(/\s+/g, ' ').slice(0, 40),
        logo: typeof t.logo === 'string' && t.logo.startsWith('data:image/') ? t.logo : '',
      }))
    const ids = new Set(teams.map((t) => t.id))
    const fields = Number.isInteger(Number(raw.fields)) && Number(raw.fields) >= 2 ? Math.min(999, Number(raw.fields)) : null

    let fixtures = null
    if (raw.fixtures && Array.isArray(raw.fixtures.rounds)) {
      fixtures = {
        mode: raw.fixtures.mode === 'double' ? 'double' : 'single',
        roundsPerLeg: Math.max(0, Number(raw.fixtures.roundsPerLeg) || 0),
        series1: Array.isArray(raw.fixtures.series1) ? raw.fixtures.series1.filter((id) => ids.has(id)) : null,
        series2: Array.isArray(raw.fixtures.series2) ? raw.fixtures.series2.filter((id) => ids.has(id)) : null,
        rounds: raw.fixtures.rounds
          .map((r) =>
            (Array.isArray(r) ? r : [])
              .filter((m) => m && ids.has(m.home) && ids.has(m.away))
              .map((m) => ({ id: String(m.id || uid()), home: m.home, away: m.away, hg: sc(m.hg), ag: sc(m.ag) })),
          )
          .filter((r) => r.length),
      }
    }

    let tableConfig = null
    if (raw.tableConfig?.type === 'two-series') {
      const one = [...new Set((Array.isArray(raw.tableConfig.series1) ? raw.tableConfig.series1 : []).filter((id) => ids.has(id))) ]
      const two = [...new Set((Array.isArray(raw.tableConfig.series2) ? raw.tableConfig.series2 : []).filter((id) => ids.has(id) && !one.includes(id))) ]
      tableConfig = { type: 'two-series', series1: one, series2: two }
    }

    let playoffs = null
    if (raw.playoffs && [4, 8, 16].includes(raw.playoffs.size) && Array.isArray(raw.playoffs.seeds)) {
      playoffs = {
        size: raw.playoffs.size,
        seeds: raw.playoffs.seeds.map((id) => (ids.has(id) ? id : null)),
        twoLegged: raw.playoffs.twoLegged === true,
        bracketOrder: Array.isArray(raw.playoffs.bracketOrder) && raw.playoffs.bracketOrder.length === raw.playoffs.size && new Set(raw.playoffs.bracketOrder).size === raw.playoffs.size && raw.playoffs.bracketOrder.every((seed) => Number.isInteger(seed) && seed >= 1 && seed <= raw.playoffs.size)
          ? raw.playoffs.bracketOrder.slice()
          : null,
        results: {},
        fields: generateTournamentFields(raw.playoffs.size, fields || 2, raw.playoffs.twoLegged === true),
      }
      Object.entries(raw.playoffs.fields || {}).forEach(([key, value]) => {
        const field = Number(value)
        if (Number.isInteger(field) && field >= 1 && field <= (fields || 2)) playoffs.fields[key] = field
      })
      if (playoffs.twoLegged) {
        const fieldCount = fields || 2
        const roundsCount = Math.log2(playoffs.size)
        for (let round = 0; round < roundsCount - 1; round++) {
          const matchCount = playoffs.size / 2 ** (round + 1)
          for (let i = 0; i < matchCount; i++) {
            const key = `r${round}-${i}`
            const firstLegField = playoffs.fields[key] || 1
            const secondLegKey = `${key}-leg2`
            const secondLegField = playoffs.fields[secondLegKey]
            if (!secondLegField || secondLegField === firstLegField) {
              playoffs.fields[secondLegKey] = (firstLegField % fieldCount) + 1
            }
          }
        }
      }
      Object.entries(raw.playoffs.results || {}).forEach(([key, r]) => {
        if (r && typeof r.pair === 'string') {
          playoffs.results[key] = {
            pair: r.pair,
            hg: sc(r.hg),
            ag: sc(r.ag),
            hp: sc(r.hp),
            ap: sc(r.ap),
            leg1hg: sc(r.leg1hg),
            leg1ag: sc(r.leg1ag),
            leg2hg: sc(r.leg2hg),
            leg2ag: sc(r.leg2ag),
          }
        }
      })
      const rawRepechage = raw.playoffs.repechage
      if (rawRepechage?.enabled && Array.isArray(rawRepechage.pairs)) {
        playoffs.repechage = {
          enabled: true,
          pairs: rawRepechage.pairs
            .filter((pair) => Array.isArray(pair) && pair.length === 2 && pair.every((id) => ids.has(id)))
            .map((pair) => [pair[0], pair[1]]),
          seedSlots: Array.isArray(rawRepechage.seedSlots) ? rawRepechage.seedSlots.map((seed) => toInt(seed, 1, raw.playoffs.size)) : [],
          fields: {},
          results: {},
        }
        const fieldCount = fields || 2
        Object.entries(rawRepechage.fields || {}).forEach(([key, value]) => {
          const field = Number(value)
          if (Number.isInteger(field) && field >= 1 && field <= fieldCount) playoffs.repechage.fields[key] = field
        })
        Object.entries(rawRepechage.results || {}).forEach(([key, r]) => {
          if (r && typeof r.pair === 'string') {
            playoffs.repechage.results[key] = { pair: r.pair, hg: sc(r.hg), ag: sc(r.ag), hp: sc(r.hp), ap: sc(r.ap) }
          }
        })
      }
    }

    const awards = raw.awards || {}
    return {
      id: raw.id ? String(raw.id) : null,
      number: Math.max(1, parseInt(raw.number, 10) || 1),
      teams,
      fixtures,
      playoffs,
      fields,
      tableConfig,
      manual: sanitizeManual(raw.manual, ids),
      awards: {
        leagueScorer: ids.has(awards.leagueScorer) ? awards.leagueScorer : null,
        cupScorer: ids.has(awards.cupScorer) ? awards.cupScorer : null,
      },
      readOnly: raw.readOnly === true,
      librarySource: raw.librarySource === true,
      savedAt: raw.savedAt || null,
    }
  }

  function sanitizeState(raw) {
    if (!raw || typeof raw !== 'object') return defaultState()
    return {
      logos: Array.isArray(raw.logos)
        ? raw.logos.filter((l) => l && typeof l.data === 'string' && l.data.startsWith('data:image/'))
        : [],
      brandLogo: typeof raw.brandLogo === 'string' && raw.brandLogo.startsWith('data:image/') ? raw.brandLogo : null,
      current: sanitizeSeason(raw.current) || emptySeason(1),
      seasons: Array.isArray(raw.seasons) ? raw.seasons.map(sanitizeSeason).filter((s) => s && s.id) : [],
    }
  }

  function readImage(file, max = 256) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) return reject(new Error('El archivo no es una imagen'))
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        const w0 = img.naturalWidth || max
        const h0 = img.naturalHeight || max
        const scale = Math.min(1, max / Math.max(w0, h0))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(w0 * scale))
        canvas.height = Math.max(1, Math.round(h0 * scale))
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Imagen no válida'))
      }
      img.src = url
    })
  }

  async function importLogos(files) {
    const added = []
    for (const file of files) {
      try {
        const data = await readImage(file)
        const existing = state.logos.find((l) => l.data === data)
        if (existing) {
          added.push(existing.id)
          continue
        }
        const id = uid()
        state.logos.push({ id, data })
        added.push(id)
      } catch (err) {
        toast(`${file.name}: ${err.message}`, 'error')
      }
    }
    persist()
    scheduleRender()
    return added
  }

  const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp' }
  const isZipFile = (f) => /zip/.test(f.type) || /\.zip$/i.test(f.name)

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Tu navegador no puede descomprimir ZIP')
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }

  async function unzipImages(file) {
    const buf = new Uint8Array(await file.arrayBuffer())
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    let eocd = -1
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) {
        eocd = i
        break
      }
    }
    if (eocd < 0) throw new Error('El archivo ZIP no es válido')
    const count = dv.getUint16(eocd + 10, true)
    let ptr = dv.getUint32(eocd + 16, true)
    const decoder = new TextDecoder()
    const out = []
    for (let n = 0; n < count && ptr + 46 <= buf.length; n++) {
      if (dv.getUint32(ptr, true) !== 0x02014b50) break
      const flags = dv.getUint16(ptr + 8, true)
      const method = dv.getUint16(ptr + 10, true)
      const size = dv.getUint32(ptr + 20, true)
      const nameLen = dv.getUint16(ptr + 28, true)
      const extraLen = dv.getUint16(ptr + 30, true)
      const commentLen = dv.getUint16(ptr + 32, true)
      const offset = dv.getUint32(ptr + 42, true)
      const path = decoder.decode(buf.subarray(ptr + 46, ptr + 46 + nameLen))
      ptr += 46 + nameLen + extraLen + commentLen
      const base = path.split('/').pop()
      const mime = IMAGE_MIME[(base.split('.').pop() || '').toLowerCase()]
      if (!mime || base.startsWith('.') || path.includes('__MACOSX/') || flags & 1) continue
      const start = offset + 30 + dv.getUint16(offset + 26, true) + dv.getUint16(offset + 28, true)
      const raw = buf.subarray(start, start + size)
      let bytes
      if (method === 0) bytes = raw
      else if (method === 8) bytes = await inflateRaw(raw)
      else continue
      out.push({ path, file: new File([bytes], base, { type: mime }) })
    }
    return out
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }))
      .map((e) => e.file)
  }

  /* ---------- PNG export ---------- */
  let exporterPromise = null
  function loadExporter() {
    if (window.htmlToImage) return Promise.resolve(window.htmlToImage)
    if (!exporterPromise) {
      exporterPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'vendor/html-to-image.js'
        s.onload = () => resolve(window.htmlToImage)
        s.onerror = () => {
          exporterPromise = null
          reject(new Error('No se pudo cargar el exportador'))
        }
        document.head.appendChild(s)
      })
    }
    return exporterPromise
  }

  async function exportPng(node, filename) {
    const lib = await loadExporter()
    // Widen the node so horizontally scrolled tables/brackets are captured entirely.
    const scrollers = [node, ...node.querySelectorAll('.table-wrap, .bracket, [data-scroll]')]
    const extra = Math.max(0, ...scrollers.map((s) => s.scrollWidth - s.clientWidth))
    const prevWidth = node.style.width
    node.classList.add('is-exporting')
    node.style.width = `${node.offsetWidth + extra}px`
    try {
      if (document.fonts) await document.fonts.ready
      const width = node.scrollWidth
      const height = node.scrollHeight
      const pixelRatio = Math.max(1, Math.min(2, 16000 / Math.max(width, height)))
      const url = await lib.toPng(node, {
        width,
        height,
        pixelRatio,
        backgroundColor: '#0d0612',
        style: { margin: '0', transform: 'none' },
        filter: (n) => !(n.dataset && 'exportHide' in n.dataset),
      })
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
    } finally {
      node.classList.remove('is-exporting')
      node.style.width = prevWidth
    }
  }

  const exportButton = (target, name, label = 'Exportar PNG') =>
    `<button type="button" class="btn btn--ghost btn--sm btn--export" data-export="${esc(target)}" data-export-name="${esc(name)}" data-export-hide>
      <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>
      ${label}
    </button>`

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-export]')
    if (!btn || btn.disabled) return
    const node = document.querySelector(btn.dataset.export)
    if (!node) return toast('No hay nada para exportar', 'error')
    btn.disabled = true
    try {
      const n = state?.current?.number ?? ''
      await exportPng(node, `${btn.dataset.exportName || 'league-hub'}${n ? `-temporada-${n}` : ''}.png`)
      toast('Imagen PNG descargada')
    } catch (err) {
      toast(`No se pudo exportar: ${err.message || err}`, 'error')
    } finally {
      btn.disabled = false
    }
  })

  /* ---------- Stat icons & colors (History / Performance) ---------- */
  const SVG = (body) =>
    `<svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
  const medal = (n) =>
    SVG(
      `<path d="M8 2.5 11 8"/><path d="M16 2.5 13 8"/><circle cx="12" cy="14.5" r="6.5"/><text x="12" y="17.6" text-anchor="middle" font-size="9" font-weight="800" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">${n}</text>`,
    )
  const ICONS = {
    trophy: SVG(
      '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    ),
    crown: SVG(
      '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
    ),
    medal2: medal(2),
    medal3: medal(3),
    medal4: medal(4),
    ball: SVG(
      '<circle cx="12" cy="12" r="10"/><path d="m12 7.2 4.4 3.2-1.7 5.1H9.3l-1.7-5.1z" fill="currentColor"/><path d="M12 7.2V2.2M16.4 10.4l4.7-1.5M14.7 15.5l2.9 4.1M9.3 15.5l-2.9 4.1M7.6 10.4 2.9 8.9"/>',
    ),
    calendar: SVG(
      '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
    ),
    win: SVG('<circle cx="12" cy="12" r="10"/><path d="m8.5 12.5 2.5 2.5 5-5.5"/>'),
    draw: SVG('<circle cx="12" cy="12" r="10"/><path d="M8 10h8M8 14h8"/>'),
    loss: SVG('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>'),
    conceded: SVG(
      '<path d="M2 20V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v14"/><path d="M6 20V8h12v12"/><path d="M6 12h12M6 16h12M10 8v12M14 8v12"/>',
    ),
    star: SVG(
      '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    ),
  }
  // col-* tints the whole column; txt-* only colors the header label and numbers.
  const STAT_STYLE = {
    series: { icon: 'crown', cls: 'tone tone-green' },
    cups: { icon: 'trophy', cls: 'tone tone-gold' },
    leagues: { icon: 'crown', cls: 'tone tone-green' },
    runnerUp: { icon: 'medal2', cls: 'tone tone-silver' },
    third: { icon: 'medal3', cls: 'tone tone-bronze' },
    fourth: { icon: 'medal4', cls: 'tone tone-slate' },
    leagueGoals: { icon: 'ball', cls: 'tone tone-lime' },
    cupGoals: { icon: 'ball', cls: 'tone tone-blue' },
    goals: { icon: 'ball', cls: 'tone tone-cyan' },
    points: { icon: 'star', cls: 'tone tone-accent' },
  }

  /* ---------- League logic ---------- */
  function shuffle(list) {
    const a = [...list]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  function generateRounds(teamIds, double) {
    const ids = shuffle(teamIds)
    if (ids.length % 2) ids.push(null)
    const n = ids.length
    const rounds = []
    for (let r = 0; r < n - 1; r++) {
      const matches = []
      for (let i = 0; i < n / 2; i++) {
        const a = ids[i]
        const b = ids[n - 1 - i]
        if (!a || !b) continue
        const flip = i === 0 ? r % 2 === 1 : (r + i) % 2 === 1
        matches.push(flip ? { home: b, away: a } : { home: a, away: b })
      }
      rounds.push(matches)
      ids.splice(1, 0, ids.pop())
    }
    const all = double ? [...rounds, ...rounds.map((r) => r.map((m) => ({ home: m.away, away: m.home })))] : rounds
    return all.map((r) => r.map((m) => ({ id: uid(), ...m, hg: null, ag: null })))
  }

  function generateSeriesRounds(series, double) {
    const firstLegs = series.map((ids) => generateRounds(ids, false))
    const roundsPerLeg = Math.max(0, ...firstLegs.map((rounds) => rounds.length))
    const rounds = Array.from({ length: roundsPerLeg }, (_, i) => firstLegs.flatMap((leg) => leg[i] || []))
    if (double) {
      for (let i = 0; i < roundsPerLeg; i++) {
        rounds.push(rounds[i].map((m) => ({ id: uid(), home: m.away, away: m.home, hg: null, ag: null })))
      }
    }
    return { rounds, roundsPerLeg }
  }

  function generateTournamentFields(size, fieldCount, twoLegged = false) {
    const count = Math.max(2, Math.min(999, Math.trunc(Number(fieldCount)) || 2))
    const roundsCount = Math.log2(size)
    const fields = {}
    for (let round = 0; round < roundsCount; round++) {
      const matchCount = size / 2 ** (round + 1)
      const order = shuffle(Array.from({ length: count }, (_, i) => i + 1))
      const legOffset = twoLegged && round < roundsCount - 1 ? 1 + Math.floor(Math.random() * (count - 1)) : 0
      for (let i = 0; i < matchCount; i++) {
        const key = `r${round}-${i}`
        fields[key] = order[i % order.length]
        if (twoLegged && round < roundsCount - 1) fields[`${key}-leg2`] = order[(i + legOffset) % order.length]
      }
    }
    const lastRound = roundsCount - 1
    const finalAndThird = shuffle(Array.from({ length: count }, (_, i) => i + 1)).slice(0, 2)
    fields[`r${lastRound}-0`] = finalAndThird[0]
    fields.third = finalAndThird[1]
    return fields
  }

  function generateRepechageFields(matchCount, fieldCount) {
    const count = Math.max(2, Math.min(999, Math.trunc(Number(fieldCount)) || 2))
    const order = shuffle(Array.from({ length: count }, (_, i) => i + 1))
    return Object.fromEntries(Array.from({ length: matchCount }, (_, i) => [`rep-${i}`, order[i % order.length]]))
  }

  function leagueMatches(season) {
    if (!season.fixtures) return []
    return season.fixtures.rounds.flatMap((r, ri) => r.map((m) => ({ ...m, round: ri + 1 })))
  }

  const zero = () => ({ pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0 })

  function addResult(rec, gf, ga, withPoints) {
    rec.pj++
    rec.gf += gf
    rec.gc += ga
    if (gf > ga) {
      rec.pg++
      if (withPoints) rec.pts += 3
    } else if (gf === ga) {
      rec.pe++
      if (withPoints) rec.pts += 1
    } else {
      rec.pp++
    }
  }

  const isManualTable = (season) => !season.fixtures

  function manualRecord(season, id) {
    const r = season.manual?.rows?.[id]
    if (!r) return zero()
    return { pj: r.pg + r.pe + r.pp, pg: r.pg, pe: r.pe, pp: r.pp, gf: r.gf, gc: r.gc, pts: r.pts }
  }

  function computeTable(season, teamIds = null) {
    const selected = teamIds ? new Set(teamIds) : null
    const teams = selected ? season.teams.filter((t) => selected.has(t.id)) : season.teams
    if (isManualTable(season)) {
      return teams
        .map((t) => {
          const r = manualRecord(season, t.id)
          return { team: t, ...r, dg: r.gf - r.gc }
        })
        .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.team.name.localeCompare(b.team.name))
    }
    const rows = new Map(teams.map((t) => [t.id, { team: t, ...zero() }]))
    leagueMatches(season).forEach((m) => {
      if (!played(m)) return
      const h = rows.get(m.home)
      const a = rows.get(m.away)
      if (!h || !a) return
      addResult(h, m.hg, m.ag, true)
      addResult(a, m.ag, m.hg, true)
    })
    return [...rows.values()]
      .map((r) => ({ ...r, dg: r.gf - r.gc }))
      .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.team.name.localeCompare(b.team.name))
  }

  function seedOrder(n) {
    let order = [1]
    while (order.length < n) {
      const sum = order.length * 2 + 1
      order = order.flatMap((s) => [s, sum - s])
    }
    return order
  }

  const STAGES = { 16: 'Octavos', 8: 'Cuartos', 4: 'Semifinales', 2: 'Final' }
  const stageName = (teamsInRound) => STAGES[teamsInRound] || `Ronda de ${teamsInRound}`

  function resolveMatch(po, key, home, away, homeSeed, awaySeed, stage) {
    const pair = home && away ? `${home}|${away}` : null
    const raw = po.results[key]
    const res = raw && pair && raw.pair === pair ? raw : null
    const twoLegged = po.twoLegged === true && ['Octavos', 'Cuartos', 'Semifinales'].includes(stage)
    const leg1 = twoLegged ? { hg: sc(res?.leg1hg), ag: sc(res?.leg1ag) } : null
    const leg2 = twoLegged ? { hg: sc(res?.leg2hg), ag: sc(res?.leg2ag) } : null
    const leg1Played = !!pair && !!leg1 && played(leg1)
    const leg2Played = !!pair && !!leg2 && played(leg2)
    const anyLegPlayed = leg1Played || leg2Played
    const m = {
      key,
      stage,
      twoLegged,
      leg1,
      leg2,
      leg1Played,
      leg2Played,
      field: po.fields?.[key] || null,
      leg1Field: twoLegged ? po.fields?.[key] || null : null,
      leg2Field: twoLegged ? po.fields?.[`${key}-leg2`] || null : null,
      home,
      away,
      homeSeed,
      awaySeed,
      pair,
      hg: twoLegged ? (anyLegPlayed ? (leg1Played ? leg1.hg : 0) + (leg2Played ? leg2.ag : 0) : null) : res ? res.hg : null,
      ag: twoLegged ? (anyLegPlayed ? (leg1Played ? leg1.ag : 0) + (leg2Played ? leg2.hg : 0) : null) : res ? res.ag : null,
      hp: res ? res.hp : null,
      ap: res ? res.ap : null,
    }
    m.played = !!pair && (twoLegged ? leg1Played && leg2Played : played(m))
    m.tied = m.played && m.hg === m.ag
    let side = null
    if (m.played) {
      if (m.hg > m.ag) side = 'home'
      else if (m.ag > m.hg) side = 'away'
      else if (isScore(m.hp) && isScore(m.ap) && m.hp !== m.ap) side = m.hp > m.ap ? 'home' : 'away'
    }
    m.decided = !!side
    m.penaltiesTied = m.tied && isScore(m.hp) && isScore(m.ap) && m.hp === m.ap
    m.winner = side === 'home' ? home : side === 'away' ? away : null
    m.loser = side === 'home' ? away : side === 'away' ? home : null
    m.winnerSeed = side === 'home' ? homeSeed : side === 'away' ? awaySeed : null
    m.loserSeed = side === 'home' ? awaySeed : side === 'away' ? homeSeed : null
    return m
  }

  function computeRepechage(season) {
    const repechage = season.playoffs?.repechage
    if (!repechage?.enabled) return []
    return repechage.pairs.map(([home, away], i) => resolveMatch(
      repechage,
      `rep-${i}`,
      home,
      away,
      null,
      null,
      'Repechaje',
    ))
  }

  function computeBracket(season) {
    const po = season.playoffs
    if (!po) return null
    const order = Array.isArray(po.bracketOrder) && po.bracketOrder.length === po.size ? po.bracketOrder : seedOrder(po.size)
    const roundsCount = Math.log2(po.size)
    const rounds = []
    const seeds = po.seeds.slice()
    const repechage = computeRepechage(season)
    if (po.repechage?.enabled) {
      repechage.forEach((match, i) => {
        const seed = po.repechage.seedSlots[i]
        if (match.winner && seed) seeds[seed - 1] = match.winner
      })
    }
    let prev = null
    for (let r = 0; r < roundsCount; r++) {
      const count = po.size / 2 ** (r + 1)
      const matches = []
      for (let i = 0; i < count; i++) {
        let home
        let away
        let homeSeed
        let awaySeed
        if (r === 0) {
          homeSeed = order[2 * i]
          awaySeed = order[2 * i + 1]
          home = seeds[homeSeed - 1] ?? null
          away = seeds[awaySeed - 1] ?? null
        } else {
          const a = prev[2 * i]
          const b = prev[2 * i + 1]
          home = a.winner
          away = b.winner
          homeSeed = a.winnerSeed
          awaySeed = b.winnerSeed
          if (homeSeed && awaySeed && awaySeed < homeSeed) {
            ;[home, away] = [away, home]
            ;[homeSeed, awaySeed] = [awaySeed, homeSeed]
          }
        }
        matches.push(resolveMatch(po, `r${r}-${i}`, home, away, homeSeed, awaySeed, stageName(count * 2)))
      }
      rounds.push(matches)
      prev = matches
    }
    const semis = rounds[roundsCount - 2]
    const third = resolveMatch(
      po,
      'third',
      semis[0].loser,
      semis[1].loser,
      semis[0].loserSeed,
      semis[1].loserSeed,
      'Tercer Puesto',
    )
    const final = rounds[roundsCount - 1][0]
    return {
      rounds,
      third,
      final,
      champion: final.winner,
      runnerUp: final.loser,
      thirdPlace: third.winner,
      fourth: third.loser,
    }
  }

  function seasonStats(season) {
    const byId = new Map()
    season.teams.forEach((t) =>
      byId.set(t.id, {
        id: t.id,
        key: norm(t.name),
        name: t.name,
        logo: t.logo,
        number: season.number,
        position: null,
        leaguePosition: null,
        league: zero(),
        cup: zero(),
        matches: [],
        tournamentQualifiedByDraws: false,
        leagueChampion: false,
        seriesChampion: false,
        cupChampion: false,
        runnerUp: false,
        third: false,
        fourth: false,
        leagueScorer: false,
        seriesScorer: false,
        cupScorer: false,
        seasonScorer: false,
        seasonCleanSheetAward: false,
        invincibleLeague: false,
        invincibleSeries: false,
        perfectSeason: false,
        legendarySeason: false,
        centuryComeback: false,
        leagueCleanSheets: 0,
        cupCleanSheets: 0,
      }),
    )

    const record = (m, type, label, pens) => {
      const h = byId.get(m.home)
      const a = byId.get(m.away)
      if (!h || !a) return
      addResult(h[type], m.hg, m.ag, true)
      addResult(a[type], m.ag, m.hg, true)
      if (type === 'league') {
        if (m.ag === 0) h.leagueCleanSheets++
        if (m.hg === 0) a.leagueCleanSheets++
      } else if (type === 'cup') {
        if (m.ag === 0) h.cupCleanSheets++
        if (m.hg === 0) a.cupCleanSheets++
      }
      const base = { season: season.number, label: `${label} - Temporada ${season.number}`, type }
      h.matches.push({ ...base, gf: m.hg, ga: m.ag, opp: a.name, oppLogo: a.logo, pens: pens ? `${m.hp}-${m.ap}` : null })
      a.matches.push({ ...base, gf: m.ag, ga: m.hg, opp: h.name, oppLogo: h.logo, pens: pens ? `${m.ap}-${m.hp}` : null })
    }

    const league = leagueMatches(season)
    league.filter(played).forEach((m) => record(m, 'league', `Jornada ${m.round}`, false))
    const manual = isManualTable(season) && season.manual
    if (manual) byId.forEach((s, id) => (s.league = manualRecord(season, id)))
    const leagueDone = manual ? manual.finished : league.length > 0 && league.every(played)
    const table = computeTable(season)
    table.forEach((row, i) => (byId.get(row.team.id).position = i + 1))
    const twoSeries = season.tableConfig?.type === 'two-series'
    const seriesGroups = twoSeries ? [season.tableConfig.series1, season.tableConfig.series2] : []
    const assignedSeriesTeams = new Set(seriesGroups.flat())
    const validSeries = twoSeries && seriesGroups.every((series) => series.length >= 2) && assignedSeriesTeams.size === season.teams.length && season.teams.every((team) => assignedSeriesTeams.has(team.id))
    if (leagueDone && twoSeries && validSeries) {
      seriesGroups.forEach((series) => {
        const rows = computeTable(season, series)
        rows.forEach((row, i) => (byId.get(row.team.id).leaguePosition = i + 1))
        const winner = rows[0]
        if (winner && (winner.pj || winner.pts)) byId.get(winner.team.id).seriesChampion = true
        const maxGoals = Math.max(0, ...rows.map((row) => row.gf))
        if (maxGoals > 0) rows.filter((row) => row.gf === maxGoals).forEach((row) => (byId.get(row.team.id).seriesScorer = true))
        rows.filter((row) => row.pj > 0 && row.pp === 0).forEach((row) => (byId.get(row.team.id).invincibleSeries = true))
      })
    } else if (leagueDone && !twoSeries && table[0] && (table[0].pj || table[0].pts)) {
      table.forEach((row, i) => (byId.get(row.team.id).leaguePosition = i + 1))
      byId.get(table[0].team.id).leagueChampion = true
      table.filter((row) => row.pj > 0 && row.pp === 0).forEach((row) => (byId.get(row.team.id).invincibleLeague = true))
    }

    const bracket = computeBracket(season)
    const repechageMatches = computeRepechage(season)
    const tournamentMatches = bracket ? [...repechageMatches, ...bracket.rounds.flat(), bracket.third] : []
    const tournamentDone = !!bracket?.champion && tournamentMatches.every((match) => match.played)
    if (bracket) {
      const qualified = new Set(bracket.rounds[0].flatMap((match) => [match.home, match.away]).filter(Boolean))
      byId.forEach((team) => {
        if (!qualified.has(team.id)) return
        const phaseMatches = league.filter((match) => match.home === team.id || match.away === team.id)
        const repMatches = repechageMatches.filter((match) => match.home === team.id || match.away === team.id)
        // Repechage games decided by penalties remain draws for this badge.
        team.tournamentQualifiedByDraws = phaseMatches.length > 0 &&
          phaseMatches.every((match) => played(match) && match.hg === match.ag) &&
          repMatches.every((match) => match.played && match.hg === match.ag)
      })
      tournamentMatches.forEach((m) => {
        if (m.twoLegged) {
          if (m.played && m.winner) {
            const teamThatLostTheFirstLeg = m.leg1.hg === 0 && m.leg1.ag === 4
              ? m.home
              : m.leg1.hg === 4 && m.leg1.ag === 0
                ? m.away
                : null
            if (teamThatLostTheFirstLeg && m.winner === teamThatLostTheFirstLeg) {
              byId.get(teamThatLostTheFirstLeg).centuryComeback = true
            }
          }
          if (m.leg1Played) {
            record({ home: m.home, away: m.away, hg: m.leg1.hg, ag: m.leg1.ag }, 'cup', `${m.stage} · Ida`, false)
          }
          if (m.leg2Played) {
            record({ home: m.away, away: m.home, hg: m.leg2.hg, ag: m.leg2.ag }, 'cup', `${m.stage} · Vuelta`, false)
          }
          return
        }
        if (m.played) record(m, 'cup', m.stage, m.tied && m.decided)
      })
      const flag = (id, prop) => id && byId.has(id) && (byId.get(id)[prop] = true)
      flag(bracket.champion, 'cupChampion')
      flag(bracket.runnerUp, 'runnerUp')
      flag(bracket.thirdPlace, 'third')
      flag(bracket.fourth, 'fourth')
    }

    // "Goleador" awards go to the highest-scoring club once the competition is finished.
    const all = [...byId.values()]
    const award = (type, prop) => {
      const max = Math.max(0, ...all.map((s) => s[type].gf))
      if (max > 0) all.forEach((s) => (s[prop] = s[type].gf === max))
    }
    if (leagueDone && !twoSeries) award('league', 'leagueScorer')
    if (tournamentDone) {
      award('cup', 'cupScorer')
    }
    if (leagueDone && tournamentDone) {
      const candidates = all.filter((team) => team.league.pj + team.cup.pj > 0)
      const goalsFor = (team) => team.league.gf + team.cup.gf
      const goalsAgainst = (team) => team.league.gc + team.cup.gc
      const leaguePoints = (team) => team.league.pts
      const leagueWins = (team) => team.league.pg
      const leaguePosition = (team) => team.leaguePosition || Number.POSITIVE_INFINITY

      const scorers = [...candidates].sort((a, b) =>
        goalsFor(b) - goalsFor(a) ||
        goalsAgainst(a) - goalsAgainst(b) ||
        leaguePoints(b) - leaguePoints(a) ||
        leagueWins(b) - leagueWins(a) ||
        leaguePosition(a) - leaguePosition(b) ||
        a.name.localeCompare(b.name),
      )
      if (scorers[0] && goalsFor(scorers[0]) > 0) scorers[0].seasonScorer = true

      if (league.some(played)) {
        const cleanSheetWinner = [...candidates]
          .filter((team) => team.league.pj > 0)
          .sort((a, b) =>
            b.leagueCleanSheets + b.cupCleanSheets - (a.leagueCleanSheets + a.cupCleanSheets) ||
            goalsAgainst(a) - goalsAgainst(b) ||
            (b.league.pts + b.cup.pts) - (a.league.pts + a.cup.pts) ||
            a.name.localeCompare(b.name),
          )[0]
        if (cleanSheetWinner) cleanSheetWinner.seasonCleanSheetAward = true
      }
    }
    all.forEach((team) => {
      team.perfectSeason = !!(
        team.cupChampion &&
        (team.leagueChampion || team.seriesChampion) &&
        team.cupScorer &&
        (team.leagueScorer || team.seriesScorer) &&
        team.seasonCleanSheetAward
      )
      team.legendarySeason = team.perfectSeason && team.league.gc + team.cup.gc === 0
    })
    return all
  }

  const stageCounts = (season) => {
    const matches = leagueMatches(season)
    return { total: matches.length, played: matches.filter(played).length }
  }

  function statSeasons() {
    const cur = state.current
    const list = state.seasons.map((s) => (cur.id && s.id === cur.id ? cur : s))
    if (!cur.id && (cur.fixtures || cur.playoffs || cur.manual)) list.push(cur)
    return list.sort((a, b) => a.number - b.number)
  }

  function teamRecords() {
    const map = new Map()
    statSeasons().forEach((season) =>
      seasonStats(season).forEach((s) => {
        if (!map.has(s.key)) map.set(s.key, { key: s.key, name: s.name, logos: [], seasons: [] })
        const rec = map.get(s.key)
        rec.name = s.name
        if (s.logo && !rec.logos.includes(s.logo)) rec.logos.push(s.logo)
        rec.seasons.push(s)
      }),
    )
    return [...map.values()]
  }

  function savedCopy() {
    return state.current.id ? state.seasons.find((s) => s.id === state.current.id) : null
  }

  function isDirty() {
    const saved = savedCopy()
    const cur = state.current
    if (!saved) return cur.teams.length > 0 || !!cur.fixtures || !!cur.playoffs || !!cur.manual
    return JSON.stringify(saved) !== JSON.stringify(cur)
  }

  /* ---------- UI utilities ---------- */
  function toast(message, type = 'ok') {
    const host = document.getElementById('toasts')
    if (!host) return
    const el = document.createElement('div')
    el.className = `toast toast--${type}`
    el.setAttribute('role', type === 'error' ? 'alert' : 'status')
    el.textContent = message
    host.appendChild(el)
    setTimeout(() => {
      el.classList.add('is-leaving')
      el.addEventListener('animationend', () => el.remove(), { once: true })
    }, 2800)
  }

  function confirmDialog(message, { confirmText = 'Confirmar', danger = true } = {}) {
    const dlg = document.getElementById('confirm-dialog')
    dlg.querySelector('[data-msg]').textContent = message
    const ok = dlg.querySelector('[data-ok]')
    ok.textContent = confirmText
    ok.className = `btn ${danger ? 'btn--danger' : 'btn--primary'}`
    dlg.returnValue = ''
    dlg.showModal()
    return new Promise((resolve) => {
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true })
    })
  }

  function download(filename, data) {
    downloadBlob(filename, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  }

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c >>> 0
    }
    return t
  })()

  function crc32(bytes) {
    let c = 0xffffffff
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }

  function dataUrlBytes(url) {
    const comma = url.indexOf(',')
    const meta = url.slice(5, comma)
    const body = url.slice(comma + 1)
    const mime = meta.split(';')[0]
    if (meta.includes(';base64')) {
      const bin = atob(body)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return { mime, bytes }
    }
    return { mime, bytes: new TextEncoder().encode(decodeURIComponent(body)) }
  }

  // Uncompressed ("stored") ZIP: images are already compressed, so deflate would gain little.
  function makeZip(files) {
    const enc = new TextEncoder()
    const now = new Date()
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
    const parts = []
    const central = []
    let offset = 0
    for (const f of files) {
      const name = enc.encode(f.name)
      const size = f.bytes.length
      const crc = crc32(f.bytes)
      const local = new DataView(new ArrayBuffer(30))
      local.setUint32(0, 0x04034b50, true)
      local.setUint16(4, 20, true)
      local.setUint16(6, 0x0800, true)
      local.setUint16(10, time, true)
      local.setUint16(12, date, true)
      local.setUint32(14, crc, true)
      local.setUint32(18, size, true)
      local.setUint32(22, size, true)
      local.setUint16(26, name.length, true)
      parts.push(local, name, f.bytes)
      const cen = new DataView(new ArrayBuffer(46))
      cen.setUint32(0, 0x02014b50, true)
      cen.setUint16(4, 20, true)
      cen.setUint16(6, 20, true)
      cen.setUint16(8, 0x0800, true)
      cen.setUint16(12, time, true)
      cen.setUint16(14, date, true)
      cen.setUint32(16, crc, true)
      cen.setUint32(20, size, true)
      cen.setUint32(24, size, true)
      cen.setUint16(28, name.length, true)
      cen.setUint32(42, offset, true)
      central.push(cen, name)
      offset += 30 + name.length + size
    }
    const centralSize = central.reduce((n, p) => n + p.byteLength, 0)
    const end = new DataView(new ArrayBuffer(22))
    end.setUint32(0, 0x06054b50, true)
    end.setUint16(8, files.length, true)
    end.setUint16(10, files.length, true)
    end.setUint32(12, centralSize, true)
    end.setUint32(16, offset, true)
    return new Blob([...parts, ...central, end], { type: 'application/zip' })
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  /* ---------- Render loop ---------- */
  function view(id, def) {
    views[id] = def
  }

  function renderAll() {
    renderQueued = false
    const skip = pendingSkip
    pendingSkip = null
    if (!state || document.visibilityState === 'hidden') return
    const active = document.activeElement
    const key = active && active.dataset ? active.dataset.key : null
    Object.entries(views).forEach(([id, v]) => {
      if (id === skip) return
      const el = document.getElementById(`${id}-body`)
      if (!el) return
      if (el.closest('.section')?.hidden) return
      const scrolls = [...el.querySelectorAll('[data-scroll]')].map((s) => [s.dataset.scroll, s.scrollTop, s.scrollLeft])
      v.render(el, state)
      scrolls.forEach(([name, top, left]) => {
        const s = el.querySelector(`[data-scroll="${name}"]`)
        if (s) {
          s.scrollTop = top
          s.scrollLeft = left
        }
      })
    })
    renderBrand()
    saveUi()
    if (key) {
      const el = document.querySelector(`[data-key="${CSS.escape(key)}"]`)
      if (el && !el.disabled) {
        el.focus({ preventScroll: true })
        if (el.select && el.type === 'number') el.select()
      }
    }
  }

  function renderBrand() {
    const brand = document.querySelector('.logo')
    if (!brand) return
    const custom = state.brandLogo
    brand.classList.toggle('is-custom', !!custom)
    brand.style.backgroundImage = custom ? `url("${custom.replace(/"/g, '%22')}")` : ''
  }

  function scheduleRender(skip = null) {
    if (renderQueued) {
      if (pendingSkip !== skip) pendingSkip = null
      return
    }
    pendingSkip = skip
    renderQueued = true
    setTimeout(renderAll, 0)
  }

  function update(mutator, { skip = null } = {}) {
    mutator(state)
    persist()
    scheduleRender(skip)
  }

  async function syncPublishedSeasons() {
    let data
    try {
      const url = new URL('season-library/seasons.json', location.href)
      const response = await fetch(url, { cache: 'no-store' })
      if (!response.ok) return
      data = await response.json()
    } catch {
      return
    }
    if (data?.app && data.app !== APP_ID) return
    if (!Array.isArray(data?.seasons) && !Array.isArray(data)) return

    const rawSeasons = Array.isArray(data?.seasons) ? data.seasons : Array.isArray(data) ? data : []
    const lockEditing = data?.readOnly === true || data?.lockEditing === true
    const incoming = rawSeasons
      .map((raw, index) => {
        if (!raw || typeof raw !== 'object') return null
        const number = Math.max(1, parseInt(raw.number, 10) || index + 1)
        return sanitizeSeason({
          ...raw,
          id: raw.id || `published-season-${number}`,
          readOnly: lockEditing || raw.readOnly === true,
          librarySource: true,
        })
      })
      .filter((season) => season?.id)
    if (rawSeasons.length && !incoming.length) return

    const previous = JSON.stringify(state.seasons)
    const previousCurrent = JSON.stringify(state.current)
    const oldPublished = new Map(state.seasons.filter((season) => season.librarySource).map((season) => [season.id, season]))
    const incomingIds = new Set(incoming.map((season) => season.id))
    const next = state.seasons.filter((season) => !season.librarySource && !incomingIds.has(season.id))
    let nextNumber = Math.max(0, ...next.map((existing) => existing.number), ...incoming.map((season) => season.number)) + 1
    incoming.forEach((season) => {
      if (next.some((existing) => existing.number === season.number)) {
        const old = oldPublished.get(season.id)
        if (old && !next.some((existing) => existing.number === old.number)) season.number = old.number
        else {
          while (next.some((existing) => existing.number === nextNumber)) nextNumber++
          season.number = nextNumber++
        }
      }
      next.push(season)
    })
    next.sort((a, b) => a.number - b.number)
    const currentPublished = incoming.find((season) => season.id === state.current.id)
    if (currentPublished?.readOnly) {
      state.current = clone(currentPublished)
    } else if (currentPublished) {
      state.current.readOnly = false
      state.current.librarySource = true
    } else if (state.current.librarySource) {
      state.current.readOnly = false
      state.current.librarySource = false
    }

    const knownLogos = new Set(state.logos.map((logo) => logo.data))
    let logosChanged = false
    incoming.forEach((season) =>
      season.teams.forEach((team) => {
        if (team.logo && !knownLogos.has(team.logo)) {
          knownLogos.add(team.logo)
          state.logos.push({ id: uid(), data: team.logo })
          logosChanged = true
        }
      }),
    )
    state.seasons = next
    if (logosChanged || previous !== JSON.stringify(state.seasons) || previousCurrent !== JSON.stringify(state.current)) {
      persist()
      scheduleRender()
    }
  }

  function teamTotals(rec) {
    const t = { cups: 0, leagues: 0, series: 0, runnerUp: 0, third: 0, fourth: 0, leagueScorer: 0, cupScorer: 0, league: zero(), cup: zero() }
    rec.seasons.forEach((s) => {
      if (s.cupChampion) t.cups++
      if (s.leagueChampion) t.leagues++
      if (s.seriesChampion) t.series++
      if (s.runnerUp) t.runnerUp++
      if (s.third) t.third++
      if (s.fourth) t.fourth++
      if (s.leagueScorer) t.leagueScorer++
      if (s.cupScorer) t.cupScorer++
      Object.keys(t.league).forEach((k) => {
        t.league[k] += s.league[k]
        t.cup[k] += s.cup[k]
      })
    })
    t.leagueGoals = t.league.gf
    t.cupGoals = t.cup.gf
    t.goals = t.league.gf + t.cup.gf
    t.points = t.league.pts
    return t
  }

  async function init() {
    loadUi()
    let fromDb = null
    let dbOk = true
    try {
      fromDb = await loadState()
    } catch {
      dbOk = false
    }
    const fromLocal = readLocal()
    const newest = (fromLocal?.updatedAt || 0) > (fromDb?.updatedAt || 0) ? fromLocal : fromDb || fromLocal
    state = sanitizeState(newest)
    if (newest?.updatedAt) state.updatedAt = newest.updatedAt
    if (!dbOk && !writeLocal()) toast('Almacenamiento no disponible: los datos no se guardarán', 'error')
    navigator.storage?.persist?.().catch(() => {})
    Object.entries(views).forEach(([id, v]) => {
      const el = document.getElementById(`${id}-body`)
      if (el && v.bind) v.bind(el)
    })
    renderAll()
    void syncPublishedSeasons()
  }

  return {
    APP_ID,
    ui,
    get state() {
      return state
    },
    view,
    init,
    update,
    render: scheduleRender,
    uid,
    norm,
    esc,
    clone,
    crest,
    played,
    parseScore,
    emptySeason,
    sanitizeSeason,
    importLogos,
    unzipImages,
    isZipFile,
    exportButton,
    ICONS,
    STAT_STYLE,
    isManualTable,
    toInt,
    generateRounds,
    generateSeriesRounds,
    generateTournamentFields,
    generateRepechageFields,
    leagueMatches,
    computeTable,
    computeBracket,
    computeRepechage,
    seasonStats,
    statSeasons,
    teamRecords,
    teamTotals,
    stageCounts,
    savedCopy,
    isDirty,
    toast,
    confirm: confirmDialog,
    download,
    downloadBlob,
    dataUrlBytes,
    makeZip,
  }
})()
