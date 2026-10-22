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
    historySort: 'cups',
    historyDir: 'desc',
    newKeepTeams: true,
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

  function persist() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveState().catch((err) => toast(`No se pudo guardar: ${err.message}`, 'error'))
    }, 200)
  }

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
      awards: { leagueScorer: null, cupScorer: null },
      savedAt: null,
    }
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

    let fixtures = null
    if (raw.fixtures && Array.isArray(raw.fixtures.rounds)) {
      fixtures = {
        mode: raw.fixtures.mode === 'double' ? 'double' : 'single',
        rounds: raw.fixtures.rounds
          .map((r) =>
            (Array.isArray(r) ? r : [])
              .filter((m) => m && ids.has(m.home) && ids.has(m.away))
              .map((m) => ({ id: String(m.id || uid()), home: m.home, away: m.away, hg: sc(m.hg), ag: sc(m.ag) })),
          )
          .filter((r) => r.length),
      }
    }

    let playoffs = null
    if (raw.playoffs && [4, 8, 16].includes(raw.playoffs.size) && Array.isArray(raw.playoffs.seeds)) {
      playoffs = {
        size: raw.playoffs.size,
        seeds: raw.playoffs.seeds.map((id) => (ids.has(id) ? id : null)),
        results: {},
      }
      Object.entries(raw.playoffs.results || {}).forEach(([key, r]) => {
        if (r && typeof r.pair === 'string') {
          playoffs.results[key] = { pair: r.pair, hg: sc(r.hg), ag: sc(r.ag), hp: sc(r.hp), ap: sc(r.ap) }
        }
      })
    }

    const awards = raw.awards || {}
    return {
      id: raw.id ? String(raw.id) : null,
      number: Math.max(1, parseInt(raw.number, 10) || 1),
      teams,
      fixtures,
      playoffs,
      awards: {
        leagueScorer: ids.has(awards.leagueScorer) ? awards.leagueScorer : null,
        cupScorer: ids.has(awards.cupScorer) ? awards.cupScorer : null,
      },
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

  function computeTable(season) {
    const rows = new Map(season.teams.map((t) => [t.id, { team: t, ...zero() }]))
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
    const m = {
      key,
      stage,
      home,
      away,
      homeSeed,
      awaySeed,
      pair,
      hg: res ? res.hg : null,
      ag: res ? res.ag : null,
      hp: res ? res.hp : null,
      ap: res ? res.ap : null,
    }
    m.played = !!pair && played(m)
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

  function computeBracket(season) {
    const po = season.playoffs
    if (!po) return null
    const order = seedOrder(po.size)
    const roundsCount = Math.log2(po.size)
    const rounds = []
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
          home = po.seeds[homeSeed - 1] ?? null
          away = po.seeds[awaySeed - 1] ?? null
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
        key: norm(t.name),
        name: t.name,
        logo: t.logo,
        number: season.number,
        position: null,
        league: zero(),
        cup: zero(),
        matches: [],
        leagueChampion: false,
        cupChampion: false,
        runnerUp: false,
        third: false,
        fourth: false,
        leagueScorer: false,
        cupScorer: false,
      }),
    )

    const record = (m, type, label, pens) => {
      const h = byId.get(m.home)
      const a = byId.get(m.away)
      if (!h || !a) return
      addResult(h[type], m.hg, m.ag, type === 'league')
      addResult(a[type], m.ag, m.hg, type === 'league')
      const base = { season: season.number, label: `${label} - Temporada ${season.number}`, type }
      h.matches.push({ ...base, gf: m.hg, ga: m.ag, opp: a.name, oppLogo: a.logo, pens: pens ? `${m.hp}-${m.ap}` : null })
      a.matches.push({ ...base, gf: m.ag, ga: m.hg, opp: h.name, oppLogo: h.logo, pens: pens ? `${m.ap}-${m.hp}` : null })
    }

    const league = leagueMatches(season)
    league.filter(played).forEach((m) => record(m, 'league', `Jornada ${m.round}`, false))
    const table = computeTable(season)
    table.forEach((row, i) => (byId.get(row.team.id).position = i + 1))
    if (league.length && league.every(played) && table[0]) byId.get(table[0].team.id).leagueChampion = true

    const bracket = computeBracket(season)
    if (bracket) {
      ;[...bracket.rounds.flat(), bracket.third].forEach((m) => {
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
    if (league.length && league.every(played)) award('league', 'leagueScorer')
    if (bracket && bracket.champion) award('cup', 'cupScorer')
    return all
  }

  const stageCounts = (season) => {
    const matches = leagueMatches(season)
    return { total: matches.length, played: matches.filter(played).length }
  }

  function statSeasons() {
    const cur = state.current
    const list = state.seasons.map((s) => (cur.id && s.id === cur.id ? cur : s))
    if (!cur.id && (cur.fixtures || cur.playoffs)) list.push(cur)
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
    if (!saved) return cur.teams.length > 0 || !!cur.fixtures || !!cur.playoffs
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
    if (!state) return
    const active = document.activeElement
    const key = active && active.dataset ? active.dataset.key : null
    Object.entries(views).forEach(([id, v]) => {
      if (id === skip) return
      const el = document.getElementById(`${id}-body`)
      if (!el) return
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

  function teamTotals(rec) {
    const t = { cups: 0, leagues: 0, runnerUp: 0, third: 0, fourth: 0, leagueScorer: 0, cupScorer: 0, league: zero(), cup: zero() }
    rec.seasons.forEach((s) => {
      if (s.cupChampion) t.cups++
      if (s.leagueChampion) t.leagues++
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
    try {
      state = sanitizeState(await loadState())
    } catch (err) {
      state = defaultState()
      toast('Almacenamiento no disponible: los datos no se guardarán', 'error')
    }
    Object.entries(views).forEach(([id, v]) => {
      const el = document.getElementById(`${id}-body`)
      if (el && v.bind) v.bind(el)
    })
    renderAll()
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
    generateRounds,
    leagueMatches,
    computeTable,
    computeBracket,
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
