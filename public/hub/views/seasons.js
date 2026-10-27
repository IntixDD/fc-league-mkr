;(() => {
  const H = window.Hub
  const { esc, crest } = H
  let miniBracketObserver = null
  document.addEventListener('app:sectionchange', (event) => {
    if (event.detail?.id !== 'seasons') {
      miniBracketObserver?.disconnect()
      miniBracketObserver = null
    }
  })

  const nextNumber = (s) => Math.max(0, s.current.number, ...s.seasons.map((x) => x.number)) + 1

  function summary(season) {
    const stats = H.seasonStats(season)
    const find = (prop) => stats.find((x) => x[prop])
    return { league: find('leagueChampion'), cup: find('cupChampion') }
  }

  const AWARD_SECTIONS = [
    {
      label: 'Títulos',
      awards: [
        ['Campeón de Torneo', 'cupChampion', 'trophy', 'gold'],
        ['Campeón de Liga', 'leagueChampion', 'crown', 'gold'],
        ['Campeón de Serie', 'seriesChampion', 'crown', 'green'],
        ['Subcampeón de Torneo', 'runnerUp', 'medal2', 'silver'],
        ['3er lugar', 'third', 'medal3', 'bronze'],
        ['4to lugar', 'fourth', 'medal4', 'plain'],
        ['Goleador de la temporada', 'seasonScorer', 'ball', 'gold'],
        ['Portería imbatible de la temporada', 'seasonCleanSheetAward', 'conceded', 'green'],
      ],
    },
    {
      label: 'Logros',
      awards: [
        ['Goleador de torneo', 'cupScorer', 'ball', 'accent'],
        ['Goleador de liga', 'leagueScorer', 'ball', 'accent'],
        ['Goleador de Serie', 'seriesScorer', 'ball', 'green'],
        ['Temporada perfecta', 'perfectSeason', 'star', 'gold'],
        ['Invicto en Liga', 'invincibleLeague', 'win', 'accent'],
        ['Invicto en Serie', 'invincibleSeries', 'win', 'green'],
        ['Temporada Legendaria', 'legendarySeason', 'trophy', 'gold'],
      ],
    },
  ]

  function awardSummary(season, open) {
    const stats = H.seasonStats(season)
    const groups = AWARD_SECTIONS.map(({ label, awards }) => {
      const items = awards.flatMap(([title, flag, icon, tone]) => {
        const winners = stats.filter((team) => team[flag])
        if (!winners.length) return []
        return [`<div class="season-award"><div class="season-award-heading"><span class="season-award-icon season-award-icon--${tone}">${H.ICONS[icon]}</span><span class="season-award-label">${title}</span></div><div class="season-award-winners">${winners.map((team) => `<span class="season-award-winner">${crest(team.logo, 'xs', team.name)}<span>${esc(team.name)}</span></span>`).join('')}</div></div>`]
      })
      return { label, items }
    })
    const count = groups.reduce((total, group) => total + group.items.length, 0)
    const content = count
      ? `<div class="season-award-groups">${groups.filter((group) => group.items.length).map((group) => `<section class="season-award-group"><h4>${group.label}</h4>${group.items.join('')}</section>`).join('')}</div>`
      : '<p class="season-awards-empty">Todavía no hay títulos ni logros registrados.</p>'
    return `<details class="season-awards" ${open ? 'open' : ''}><summary><span class="season-awards-heading">${H.ICONS.trophy}<span>Títulos y Logros</span></span><span class="season-awards-count">${count} distinciones</span><span class="season-awards-chevron" aria-hidden="true"></span></summary><div class="season-awards-content">${content}</div></details>`
  }

  const TABLE_ICON = '<svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16m6-16v16"/></svg>'
  const TICKET_ICON = '<svg class="stat-icon" viewBox="2 5 20 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 6L6 6C5.068 6 4.602 6 4.234 6.152 3.744 6.355 3.355 6.745 3.152 7.235 3 7.602 3 8.068 3 9 4.657 9 6 10.343 6 12s-1.343 3-3 3c0 .932 0 1.398.152 1.765.203.49.592.88 1.082 1.083C4.602 18 5.068 18 6 18h8m0-12h4c.932 0 1.398 0 1.765.152.49.203.88.593 1.083 1.083C21 7.602 21 8.068 21 9c-1.657 0-3 1.343-3 3s1.343 3 3 3c0 .932 0 1.398-.152 1.765-.203.49-.593.88-1.083 1.083C19.398 18 18.932 18 18 18h-4m0-12v12"/></svg>'

  function standingsTable(rows) {
    return `<div class="table-wrap season-standing-table-wrap"><table class="data-table season-standing-table">
      <thead><tr><th class="num">Pos</th><th class="club">Club</th><th class="num">PJ</th><th class="num">PG</th><th class="num">PE</th><th class="num">PP</th><th class="num">GF</th><th class="num">GC</th><th class="num">DG</th><th class="num pts">Puntos</th></tr></thead>
      <tbody>${rows.map((row, i) => `<tr><td class="num pos">${i + 1}</td><th scope="row" class="club"><span class="club-cell">${crest(row.team.logo, 'xs', row.team.name)}<span>${esc(row.team.name)}</span></span></th><td class="num">${row.pj}</td><td class="num">${row.pg}</td><td class="num">${row.pe}</td><td class="num">${row.pp}</td><td class="num">${row.gf}</td><td class="num">${row.gc}</td><td class="num">${row.dg > 0 ? `+${row.dg}` : row.dg}</td><td class="num pts">${row.pts}</td></tr>`).join('')}</tbody>
    </table></div>`
  }

  function standingsSummary(season) {
    const grouped = season.tableConfig?.type === 'two-series'
    const groups = grouped
      ? [
          ['Serie 1', H.computeTable(season, season.tableConfig.series1)],
          ['Serie 2', H.computeTable(season, season.tableConfig.series2)],
        ]
      : [['Tabla regular', H.computeTable(season)]]
    const count = grouped ? '2 series' : `${season.teams.length} equipos`
    const content = `<div class="season-standing-groups">${groups.map(([label, rows]) => `<section class="season-award-group"><h4>${label}<span>${rows.length} equipos</span></h4>${standingsTable(rows)}</section>`).join('')}</div>`
    return `<details class="season-awards season-standings"><summary><span class="season-awards-heading">${TABLE_ICON}<span>${grouped ? 'Series' : 'Tabla'}</span></span><span class="season-awards-count">${count}</span><span class="season-awards-chevron" aria-hidden="true"></span></summary><div class="season-awards-content">${content}</div></details>`
  }

  function fixtureSummary(season) {
    const fixtures = season.fixtures
    const rounds = fixtures?.rounds || []
    const matches = rounds.flat()
    const played = matches.filter(H.played).length
    const teams = new Map(season.teams.map((team) => [team.id, team]))
    const seriesFor = new Map()
    ;(fixtures?.series1 || []).forEach((id) => seriesFor.set(id, 'Serie 1'))
    ;(fixtures?.series2 || []).forEach((id) => seriesFor.set(id, 'Serie 2'))
    const roundCount = fixtures?.roundsPerLeg || (fixtures?.mode === 'double' ? rounds.length / 2 : 0)
    const content = rounds.length
      ? `<div class="season-fixture-rounds">${rounds.map((round, index) => {
          const done = round.filter(H.played).length
          const leg = fixtures.mode === 'double' ? ` · ${index < roundCount ? 'Ida' : 'Vuelta'}` : ''
          const games = round.map((match, matchIndex) => {
            const home = teams.get(match.home)
            const away = teams.get(match.away)
            const isPlayed = H.played(match)
            const outcome = isPlayed ? match.hg > match.ag ? 'home' : match.hg < match.ag ? 'away' : 'draw' : ''
            const field = season.fields ? (matchIndex % season.fields) + 1 : null
            return `<article class="season-fixture-match${isPlayed ? ` is-played is-${outcome}` : ''}">
              <span class="season-fixture-index" title="${field ? `Cancha ${field}` : `Partido ${matchIndex + 1}`}">${field || matchIndex + 1}</span>
              <span class="season-fixture-team season-fixture-home">${home ? crest(home.logo, 'xs', home.name) : '<span class="crest crest--xs crest--tbd"></span>'}<span>${esc(home?.name || '—')}</span>${seriesFor.has(match.home) ? `<small>${seriesFor.get(match.home)}</small>` : ''}</span>
              <strong class="season-fixture-score">${match.hg ?? '—'} <i>:</i> ${match.ag ?? '—'}</strong>
              <span class="season-fixture-team season-fixture-away">${away ? crest(away.logo, 'xs', away.name) : '<span class="crest crest--xs crest--tbd"></span>'}<span>${esc(away?.name || '—')}</span>${seriesFor.has(match.away) ? `<small>${seriesFor.get(match.away)}</small>` : ''}</span>
            </article>`
          }).join('')
          const rest = season.teams.filter((team) => !round.some((match) => match.home === team.id || match.away === team.id))
          return `<section class="season-fixture-round"><header><h4>Jornada ${index + 1}${leg}</h4><span>${done}/${round.length} partidos</span></header><div class="season-fixture-games">${games}</div>${rest.length ? `<p class="season-fixture-rest">Descansa: ${rest.map((team) => esc(team.name)).join(', ')}</p>` : ''}</section>`
        }).join('')}</div>`
      : '<p class="season-awards-empty">No se creó un fixture para esta temporada.</p>'
    const count = rounds.length ? `${played}/${matches.length} partidos` : 'No creado'
    return `<details class="season-awards season-fixture-details"><summary><span class="season-awards-heading">${TABLE_ICON}<span>Fixture</span></span><span class="season-awards-count">${count}</span><span class="season-awards-chevron" aria-hidden="true"></span></summary><div class="season-awards-content">${content}</div></details>`
  }

  function tournamentSummary(season) {
    const playoffs = season.playoffs
    const bracket = H.computeBracket(season)
    const teams = new Map(season.teams.map((team) => [team.id, team]))
    const allMatches = bracket ? [...bracket.rounds.flat(), bracket.third] : []
    const played = allMatches.filter((match) => match.played).length
    const miniMatch = (match, final = false) => `<article class="season-mini-match${final ? ' is-final season-mini-final-match' : ''}" data-bk="${esc(match.key)}">
      ${['home', 'away'].map((side) => {
        const id = match[side]
        const team = id ? teams.get(id) : null
        const score = side === 'home' ? match.hg : match.ag
        return `<div class="season-mini-team${match.winner === id && id ? ' is-winner' : ''}">${team ? crest(team.logo, 'xs', team.name) : '<span class="crest crest--xs crest--tbd"></span>'}<span>${team ? esc(team.name) : 'Por definir'}</span><strong>${score ?? '–'}</strong></div>`
      }).join('')}
      ${match.tied && match.decided ? `<span class="season-mini-pens">Pen. ${match.hp}–${match.ap}</span>` : ''}
    </article>`
    const miniSlot = (match) => `<div class="season-mini-slot">${miniMatch(match)}</div>`
    const sideColumn = (matches, side) => {
      const body = matches.length > 1
        ? Array.from({ length: matches.length / 2 }, (_, i) => `<div class="season-mini-pair">${miniSlot(matches[2 * i])}${miniSlot(matches[2 * i + 1])}</div>`).join('')
        : matches.map(miniSlot).join('')
      return `<section class="season-mini-col season-mini-col--${side}"><h4>${esc(matches[0]?.stage || 'Ronda')}</h4><div class="season-mini-slots">${body}</div></section>`
    }
    const miniMap = bracket ? (() => {
      const sideRounds = bracket.rounds.slice(0, -1)
      const left = sideRounds.map((round) => sideColumn(round.slice(0, round.length / 2), 'left')).join('')
      const right = sideRounds.map((round) => sideColumn(round.slice(round.length / 2), 'right')).reverse().join('')
      const champion = bracket.champion ? teams.get(bracket.champion) : null
      return `<div class="season-mini-bracket" data-rounds="${bracket.rounds.length}" role="region" tabindex="0" aria-label="Mapa de llaves de Tournament; desliza horizontalmente para ver todas las rondas">${left}
        <section class="season-mini-col season-mini-col--final"><h4>Final</h4><div class="season-mini-final-top">${champion ? `${crest(champion.logo, 'xs', champion.name)}<span>${esc(champion.name)}</span>` : '<span>Campeón por definir</span>'}</div>${miniMatch(bracket.final, true)}<div class="season-mini-third"><h5>Tercer Puesto</h5>${miniMatch(bracket.third)}</div></section>
        ${right}</div>`
    })() : ''
    const content = bracket
      ? miniMap
      : '<p class="season-awards-empty">No se creó Tournament en esta temporada.</p>'
    const count = playoffs ? `${played}/${allMatches.length} partidos` : 'No creado'
    return `<details class="season-awards season-tournament-details"><summary><span class="season-awards-heading">${H.ICONS.trophy}<span>Tournament</span></span><span class="season-awards-count">${count}</span><span class="season-awards-chevron" aria-hidden="true"></span></summary><div class="season-awards-content">${content}</div></details>`
  }

  function repechageSummary(season) {
    if (!season.playoffs?.repechage?.enabled) return ''
    const teams = new Map(season.teams.map((team) => [team.id, team]))
    const matches = H.computeRepechage(season)
    const played = matches.filter((match) => match.played).length
    const content = matches.length
      ? `<div class="feat-grid season-repechage-grid">${matches.map((match, index) => {
          const home = teams.get(match.home)
          const away = teams.get(match.away)
          return `<article class="feat-match season-repechage-match">
            <h3 class="feat-title">Repechaje ${index + 1}</h3>
            <div class="feat-score">
              <span class="feat-team">${home ? crest(home.logo, 'md', home.name) : '<span class="crest crest--md crest--tbd"></span>'}<span>${home ? esc(home.name) : 'Por definir'}</span></span>
              <span class="feat-result">${match.hg ?? '—'} - ${match.ag ?? '—'}</span>
              <span class="feat-team">${away ? crest(away.logo, 'md', away.name) : '<span class="crest crest--md crest--tbd"></span>'}<span>${away ? esc(away.name) : 'Por definir'}</span></span>
            </div>
            ${match.tied && match.decided ? `<p class="feat-pens">Penales ${match.hp}–${match.ap}</p>` : ''}
            ${match.field ? `<p class="feat-when">Cancha ${match.field}</p>` : ''}
          </article>`
        }).join('')}</div>`
      : '<p class="season-awards-empty">No hay cruces de repechaje registrados.</p>'
    return `<details class="season-awards season-tournament-details"><summary><span class="season-awards-heading">${TICKET_ICON}<span>Repechajes</span></span><span class="season-awards-count">${played}/${matches.length} partidos</span><span class="season-awards-chevron" aria-hidden="true"></span></summary><div class="season-awards-content">${content}</div></details>`
  }

  function drawMiniBracketConnectors(map, roundsCount) {
    map.querySelector('.season-mini-lines')?.remove()
    if (!map.offsetWidth) return
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.classList.add('season-mini-lines')
    svg.setAttribute('width', map.scrollWidth)
    svg.setAttribute('height', map.scrollHeight)
    const offsetWithin = (node, ancestor) => {
      let x = 0
      let y = 0
      let current = node
      while (current && current !== ancestor) {
        x += current.offsetLeft
        y += current.offsetTop
        current = current.offsetParent
      }
      return { x, y, w: node.offsetWidth, h: node.offsetHeight }
    }
    const finalMatch = map.querySelector('.season-mini-final-match')
    for (let round = 0; round < roundsCount - 1; round++) {
      map.querySelectorAll(`[data-bk^="r${round}-"]`).forEach((from) => {
        const index = Number(from.dataset.bk.split('-')[1])
        const finalRound = round === roundsCount - 2
        const to = finalRound ? finalMatch : map.querySelector(`[data-bk="r${round + 1}-${Math.floor(index / 2)}"]`)
        if (!to) return
        const a = offsetWithin(from, map)
        const b = offsetWithin(to, map)
        const leftSide = !!from.closest('.season-mini-col--left')
        const x1 = leftSide ? a.x + a.w : a.x
        const x2 = leftSide ? b.x : b.x + b.w
        const y1 = a.y + a.h / 2
        const y2 = b.y + b.h / 2
        const mid = (x1 + x2) / 2
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        path.setAttribute('d', `M${x1} ${y1}H${mid}V${y2}H${x2}`)
        path.setAttribute('class', `season-mini-line${from.querySelector('.is-winner') ? ' is-live' : ''}${finalRound ? ' is-final' : ''}`)
        svg.appendChild(path)
      })
    }
    map.prepend(svg)
  }

  function watchMiniBrackets(el) {
    miniBracketObserver?.disconnect()
    const maps = [...el.querySelectorAll('.season-tournament-details[open] .season-mini-bracket')]
    if (!maps.length || typeof ResizeObserver === 'undefined') return
    miniBracketObserver = new ResizeObserver((entries) => {
      entries.forEach(({ target }) => {
        requestAnimationFrame(() => drawMiniBracketConnectors(target, Number(target.dataset.rounds)))
      })
    })
    maps.forEach((map) => {
      miniBracketObserver.observe(map)
      map.querySelectorAll('.season-mini-match').forEach((match) => miniBracketObserver.observe(match))
      drawMiniBracketConnectors(map, Number(map.dataset.rounds))
    })
  }

  function save() {
    const s = H.state
    const cur = s.current
    if (cur.readOnly) return H.toast('Esta temporada está bloqueada para edición', 'error')
    if (!cur.teams.length) return H.toast('Registra equipos antes de guardar', 'error')
    if (s.seasons.some((x) => x.number === cur.number && x.id !== cur.id))
      return H.toast(`Ya existe una Temporada ${cur.number} guardada. Cambia el número.`, 'error')
    H.update((st) => {
      const c = st.current
      if (!c.id) c.id = H.uid()
      c.savedAt = new Date().toISOString()
      const copy = H.clone(c)
      const i = st.seasons.findIndex((x) => x.id === c.id)
      if (i >= 0) st.seasons[i] = copy
      else st.seasons.push(copy)
      st.seasons.sort((a, b) => a.number - b.number)
    })
    H.toast(`Temporada ${cur.number} guardada`)
  }

  async function guardDirty() {
    if (!H.isDirty()) return true
    return H.confirm('La temporada actual tiene cambios sin guardar que se perderán.', { confirmText: 'Continuar' })
  }

  async function newSeason() {
    if (!(await guardDirty())) return
    const keep = H.ui.newKeepTeams
    H.ui.round = 0
    H.update((st) => {
      const next = H.emptySeason(nextNumber(st))
      if (keep) next.teams = st.current.teams.map((t) => ({ id: H.uid(), name: t.name, logo: t.logo }))
      st.current = next
    })
    H.toast(keep ? 'Nueva temporada creada con los mismos clubes. Puedes cambiar sus escudos en Teams.' : 'Nueva temporada creada')
  }

  async function edit(id) {
    if (H.state.current.id === id) return H.toast('Esa temporada ya está abierta')
    const saved = H.state.seasons.find((x) => x.id === id)
    if (!saved) return
    if (saved.readOnly) return H.toast('Esta temporada está bloqueada para edición', 'error')
    if (!(await guardDirty())) return
    const latest = H.state.seasons.find((x) => x.id === id)
    if (!latest) return
    if (latest.readOnly) return H.toast('Esta temporada está bloqueada para edición', 'error')
    H.ui.round = 0
    H.ui.fxMode = null
    H.update((st) => (st.current = H.clone(latest)))
    H.toast(`Editando Temporada ${latest.number}`)
  }

  async function remove(id) {
    const saved = H.state.seasons.find((x) => x.id === id)
    if (!saved) return
    if (!(await H.confirm(`Se eliminará la Temporada ${saved.number} y sus estadísticas del historial.`, { confirmText: 'Eliminar' }))) return
    H.update((st) => {
      st.seasons = st.seasons.filter((x) => x.id !== id)
      if (st.current.id === id) {
        st.current.id = null
        st.current.readOnly = false
        st.current.librarySource = false
      }
    })
    H.toast(`Temporada ${saved.number} eliminada`)
  }

  async function removeAll() {
    if (!H.state.seasons.length) return
    if (!(await H.confirm('Se eliminarán todas las temporadas guardadas y el historial.', { confirmText: 'Eliminar todas' }))) return
    H.update((st) => {
      st.seasons = []
      st.current.id = null
      st.current.readOnly = false
      st.current.librarySource = false
    })
  }

  const payload = (seasons) => ({
    app: H.APP_ID,
    version: 1,
    exportedAt: new Date().toISOString(),
    readOnly: !!H.ui.lockSeasonExport,
    seasons: H.clone(seasons).map(({ readOnly, librarySource, ...season }) => season),
  })

  function exportOne(id) {
    const saved = H.state.seasons.find((x) => x.id === id)
    if (saved) H.download(`league-hub-temporada-${saved.number}.json`, payload([saved]))
  }

  function exportAll() {
    if (!H.state.seasons.length) return H.toast('No hay temporadas guardadas', 'error')
    H.download('league-hub-temporadas.json', payload(H.state.seasons))
  }

  async function importFile(file) {
    let data
    try {
      data = JSON.parse(await file.text())
    } catch {
      return H.toast('El archivo no es un JSON válido', 'error')
    }
    const list = Array.isArray(data?.seasons) ? data.seasons : Array.isArray(data) ? data : [data]
    const lockEditing = data?.readOnly === true || data?.lockEditing === true
    const seasons = list
      .map((raw) => H.sanitizeSeason(raw && { ...raw, id: raw.id || H.uid(), readOnly: lockEditing || raw.readOnly === true }))
      .filter(Boolean)
    if (!seasons.length) return H.toast('No se encontraron temporadas en el archivo', 'error')
    let added = 0
    let replaced = 0
    H.update((st) => {
      seasons.forEach((season) => {
        const i = st.seasons.findIndex((x) => x.id === season.id)
        if (i >= 0) {
          st.seasons[i] = season
          if (st.current.id === season.id) st.current = H.clone(season)
          replaced++
          return
        }
        if (st.seasons.some((x) => x.number === season.number)) season.number = Math.max(0, ...st.seasons.map((x) => x.number)) + 1
        season.savedAt = season.savedAt || new Date().toISOString()
        st.seasons.push(season)
        added++
      })
      st.seasons.sort((a, b) => a.number - b.number)
      const known = new Set(st.logos.map((l) => l.data))
      seasons.forEach((season) =>
        season.teams.forEach((t) => {
          if (t.logo && !known.has(t.logo)) {
            known.add(t.logo)
            st.logos.push({ id: H.uid(), data: t.logo })
          }
        }),
      )
    })
    H.toast([added && `${added} importada(s)`, replaced && `${replaced} actualizada(s)`].filter(Boolean).join(' · '))
  }

  H.view('seasons', {
    bind(el) {
      el.addEventListener('toggle', (e) => {
        if (e.target.matches('.season-tournament-details')) watchMiniBrackets(el)
      }, true)
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]')
        if (!btn) return
        const { action, id } = btn.dataset
        if (action === 'save') save()
        else if (action === 'new') newSeason()
        else if (action === 'edit') edit(id)
        else if (action === 'export') exportOne(id)
        else if (action === 'export-all') exportAll()
        else if (action === 'delete') remove(id)
        else if (action === 'delete-all') removeAll()
      })
      el.addEventListener('change', (e) => {
        const t = e.target
        if (t.name === 'keep-teams') H.ui.newKeepTeams = t.checked
        else if (t.name === 'lock-season-export') {
          H.ui.lockSeasonExport = t.checked
          H.render()
        } else if (t.name === 'season-number') {
          const n = parseInt(t.value, 10)
          if (!Number.isInteger(n) || n < 1 || n > 999) {
            H.toast('Número de temporada no válido', 'error')
            return H.render()
          }
          H.update((st) => (st.current.number = n))
        } else if (t.matches('[data-import]')) {
          const file = t.files[0]
          t.value = ''
          if (file) importFile(file)
        }
      })
    },

    render(el, s) {
      const cur = s.current
      const dirty = H.isDirty()
      const status = !cur.id ? 'Sin guardar' : dirty ? 'Cambios sin guardar' : 'Guardada'
      const statusCls = !cur.id || dirty ? 'badge--warn' : 'badge--ok'
      const { total, played } = H.stageCounts(cur)
      const sum = summary(cur)

      const current = `
        <article class="card">
          <header class="card-head">
            <div>
              <h2 class="card-title">Temporada actual</h2>
              <p class="card-sub"><span class="badge ${statusCls}">${status}</span>${cur.readOnly ? ' <span class="badge badge--warn">Solo lectura</span>' : ''}</p>
            </div>
          </header>
          <div class="current-season">
            <label class="field field--inline">
              <span class="field-label">Número</span>
              <input class="input input--num" type="number" min="1" max="999" name="season-number" data-key="season-number" value="${cur.number}">
            </label>
            <dl class="mini-stats">
              <div><dt>Equipos</dt><dd>${cur.teams.length}</dd></div>
              <div><dt>Liga</dt><dd>${total ? `${played}/${total}` : '—'}</dd></div>
              <div><dt>Tournament</dt><dd>${cur.playoffs ? `${cur.playoffs.size} equipos` : '—'}</dd></div>
            </dl>
          </div>
          ${sum.league || sum.cup ? `<p class="hint">${sum.league ? `Liga: <strong>${esc(sum.league.name)}</strong>` : ''}${sum.league && sum.cup ? ' · ' : ''}${sum.cup ? `Copa: <strong>${esc(sum.cup.name)}</strong>` : ''}</p>` : ''}
          <div class="row-actions">
            <button class="btn btn--primary" data-action="save" ${cur.readOnly ? 'disabled title="Edición bloqueada al importar"' : ''}>${cur.id ? 'Guardar cambios' : 'Guardar temporada'}</button>
            <button class="btn btn--ghost" data-action="new">Nueva temporada</button>
          </div>
          <label class="check">
            <input type="checkbox" name="keep-teams" ${H.ui.newKeepTeams ? 'checked' : ''}>
            <span>Conservar los clubes en la nueva temporada</span>
          </label>
        </article>`

      const io = `
        <article class="card">
          <header class="card-head"><h2 class="card-title">Importar / Exportar</h2></header>
          <div class="row-actions">
            <label class="btn btn--primary file-btn">
              <input type="file" accept="application/json,.json" class="sr-only" data-import>
              Importar .json
            </label>
            <button class="btn btn--ghost" data-action="export-all" ${s.seasons.length ? '' : 'disabled'}>Exportar todas</button>
          </div>
          <label class="check">
            <input type="checkbox" name="lock-season-export" ${H.ui.lockSeasonExport ? 'checked' : ''}>
            <span>Bloquear edición al exportar a JSON</span>
          </label>
          <p class="hint">Si importas una temporada que ya existe, se actualiza. Si su número está ocupado, se le asigna el siguiente libre.</p>
        </article>`

      const list = `
        <article class="card card--wide">
          <header class="card-head">
            <div><h2 class="card-title">Temporadas guardadas</h2><p class="card-sub">${s.seasons.length} en total</p></div>
            ${s.seasons.length ? '<button class="btn btn--danger btn--sm" data-action="delete-all">Eliminar todas</button>' : ''}
          </header>
          ${
            s.seasons.length
              ? `<ul class="season-list">${s.seasons
                  .map((season) => {
                    const open = season.id === cur.id
                    const selectedSeason = open ? cur : season
                    const sm = summary(selectedSeason)
                    return `
                  <li class="season-row${open ? ' is-open' : ''}">
                    <span class="season-num">T${season.number}</span>
                    <div class="season-info">
                      <span class="season-title">Temporada ${season.number}${open ? ' <span class="badge badge--accent">Abierta</span>' : ''}${season.readOnly ? ' <span class="badge badge--warn">Solo lectura</span>' : ''}</span>
                      <span class="season-meta">${selectedSeason.teams.length} equipos${season.savedAt ? ` · ${new Date(season.savedAt).toLocaleDateString('es')}` : ''}</span>
                    </div>
                    <div class="season-champs">
                      ${sm.league ? `<span class="champ" title="Campeón de liga">${crest(sm.league.logo, 'sm', sm.league.name)}<span>Liga</span></span>` : ''}
                      ${sm.cup ? `<span class="champ" title="Campeón de copa">${crest(sm.cup.logo, 'sm', sm.cup.name)}<span>Copa</span></span>` : ''}
                    </div>
                    <div class="team-actions">
                      <button class="btn btn--ghost btn--sm" data-action="edit" data-id="${esc(season.id)}" ${open || season.readOnly ? 'disabled' : ''} ${season.readOnly ? 'title="Edición bloqueada al importar"' : ''}>Editar</button>
                      <button class="btn btn--ghost btn--sm" data-action="export" data-id="${esc(season.id)}">Exportar</button>
                      <button class="btn btn--danger btn--sm" data-action="delete" data-id="${esc(season.id)}" aria-label="Eliminar Temporada ${season.number}">Eliminar</button>
                    </div>
                    ${standingsSummary(selectedSeason)}
                    ${fixtureSummary(selectedSeason)}
                    ${repechageSummary(selectedSeason)}
                    ${tournamentSummary(selectedSeason)}
                    ${awardSummary(selectedSeason, open)}
                  </li>`
                  })
                  .join('')}</ul>`
              : '<p class="empty">Aún no guardaste ninguna temporada.</p>'
          }
        </article>`

      el.innerHTML = `<div class="panel-grid panel-grid--even">${current}${io}${list}</div>`
      watchMiniBrackets(el)
    },
  })
})()
