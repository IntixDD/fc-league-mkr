;(() => {
  const H = window.Hub
  const { esc, crest } = H
  let miniBracketObserver = null
  let libraryExportName = 'Temporadas'
  let libraryExportIcon = ''
  let publishedLibraryEntries = null
  let publishedLibraryLoading = false
  let publishedLibraryError = ''
  let publishedLibraryVisible = false
  const JSON_FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M8.5 12h7M8.5 15.5h7M8.5 19h4"/></svg>'
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
    const series = season.tableConfig?.type === 'two-series'
      ? [
          ['Serie 1', season.tableConfig.series1],
          ['Serie 2', season.tableConfig.series2],
        ].map(([label, ids]) => ({ label, team: stats.find((team) => team.seriesChampion && ids?.includes(team.id)) })).filter((item) => item.team)
      : []
    return { league: find('leagueChampion'), cup: find('cupChampion'), series }
  }

  const AWARD_SECTIONS = [
    {
      label: 'Títulos',
      awards: [
        ['Campeón de Torneo', 'cupChampion', 'tournament.svg', 'gold'],
        ['Campeón de Liga', 'leagueChampion', 'league.svg', 'cyan'],
        ['Campeón de la Finalísima', 'seriesFinalChampion', 'finalisima.svg', 'gold'],
        ['Campeón de la Supercopa', 'supercupChampion', 'supercup.svg', 'gold'],
        ['Subcampeón de Torneo', 'runnerUp', 'medal_2.svg', 'silver'],
        ['3er lugar', 'third', 'medal_3.svg', 'bronze'],
        ['4to lugar', 'fourth', 'medal_4.svg', 'plain'],
        ['Goleador de la temporada', 'seasonScorer', 'goleador_3.svg', 'gold'],
        ['Portería imbatible de la temporada', 'seasonCleanSheetAward', 'glove.svg', 'accent'],
      ],
    },
    {
      label: 'Logros',
      awards: [
        ['Goleador de torneo', 'cupScorer', 'goleador.svg', 'accent'],
        ['Goleador de Liga', 'leagueScorer', 'goleador_2.svg', 'cyan'],
        ['Goleador de Serie', 'seriesScorer', 'goleador_2.svg', 'green'],
        ['Campeón de Serie', 'seriesChampion', 'crown_common.svg', 'green'],
        ['Campeón de grupo', 'groupChampion', 'crown_common.svg', 'purple'],
        ['Temporada perfecta', 'perfectSeason', 'premio3.svg', 'gold'],
        ['Invicto en Liga', 'invincibleLeague', 'premio4.svg', 'cyan'],
        ['Invicto en Serie', 'invincibleSeries', 'premio4.svg', 'green'],
        ['Temporada Legendaria', 'legendarySeason', 'premio1.svg', 'gold'],
      ],
    },
  ]

  function awardSummary(season, open, lazy = false) {
    const stats = H.seasonStats(season)
    const groups = AWARD_SECTIONS.map(({ label, awards }) => {
      const items = awards.flatMap(([title, flag, icon, tone]) => {
        const winners = stats.filter((team) => team[flag])
        if (!winners.length) return []
        const iconMarkup = icon.endsWith('.svg') ? H.assetIcon(icon) : H.ICONS[icon]
        return [`<div class="season-award"><div class="season-award-heading"><span class="season-award-icon season-award-icon--${tone}">${iconMarkup}</span><span class="season-award-label">${title}</span></div><div class="season-award-winners">${winners.map((team) => `<span class="season-award-winner">${crest(team.logo, 'xs', team.name)}<span>${esc(team.name)}</span></span>`).join('')}</div></div>`]
      })
      return { label, items }
    })
    const count = groups.reduce((total, group) => total + group.items.length, 0)
    const content = count
      ? `<div class="season-award-groups">${groups.filter((group) => group.items.length).map((group) => `<section class="season-award-group"><h4>${group.label}</h4>${group.items.join('')}</section>`).join('')}</div>`
      : '<p class="season-awards-empty">Todavía no hay títulos ni logros registrados.</p>'
    return `<details class="season-awards" data-season-detail="awards" data-season-id="${esc(season.id || '')}" ${open ? 'open data-hydrated="true"' : ''}><summary><span class="season-awards-heading">${H.ICONS.win}<span>Títulos y Logros</span></span><span class="season-awards-count">${count} distinciones</span><span class="season-awards-chevron" aria-hidden="true"></span></summary><div class="season-awards-content">${lazy && !open ? '' : content}</div></details>`
  }

  const TABLE_ICON = '<svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16m6-16v16"/></svg>'

  function standingsRowClass(season, index, rowCount) {
    const type = season.tableConfig?.type
    if (type === 'groups') {
      const qualifiersPerGroup = season.tableConfig.count === 4 && season.playoffs?.size === 4 ? 1 : 2
      return index < Math.min(qualifiersPerGroup, rowCount) ? 'is-zone' : 'is-out'
    }

    const isSeries = type === 'two-series'
    const playoffSize = Number(season.playoffs?.size) || 0
    if (!playoffSize) return index === 0 ? 'is-winner' : ''

    const repechageEnabled = !!season.playoffs?.repechage?.enabled
    const repechageMatches = playoffSize === 4 ? 2 : playoffSize / 4
    const directPerSeries = playoffSize / 2 - repechageMatches / 2
    const rowZone = isSeries
      ? repechageEnabled ? directPerSeries + repechageMatches : Math.floor(playoffSize / 2)
      : repechageEnabled ? playoffSize + repechageMatches : playoffSize
    const directZone = repechageEnabled
      ? isSeries ? directPerSeries : playoffSize - repechageMatches
      : rowZone

    if (index === 0) return 'is-winner'
    if (index < directZone) return 'is-zone'
    if (repechageEnabled && index < rowZone) return 'is-repechage'
    if (index < rowZone) return 'is-zone'
    return rowZone ? 'is-out' : ''
  }

  function standingsTable(season, rows) {
    return `<div class="table-wrap season-standing-table-wrap"><table class="data-table data-table--league season-standing-table">
      <thead><tr><th class="num">Pos</th><th class="club">Club</th><th class="num">PJ</th><th class="num">PG</th><th class="num">PE</th><th class="num">PP</th><th class="num">GF</th><th class="num">GC</th><th class="num">DG</th><th class="num pts">Puntos</th></tr></thead>
      <tbody>${rows.map((row, i) => `<tr class="${standingsRowClass(season, i, rows.length)}"><td class="num pos"><span class="pos-num">${i + 1}</span></td><th scope="row" class="club"><span class="club-cell">${crest(row.team.logo, 'xs', row.team.name)}<span>${esc(row.team.name)}</span></span></th><td class="num">${row.pj}</td><td class="num">${row.pg}</td><td class="num">${row.pe}</td><td class="num">${row.pp}</td><td class="num">${row.gf}</td><td class="num">${row.gc}</td><td class="num">${row.dg > 0 ? `+${row.dg}` : row.dg}</td><td class="num pts">${row.pts}</td></tr>`).join('')}</tbody>
    </table></div>`
  }

  function standingsSummary(season, lazy = false) {
    const grouped = ['two-series', 'groups'].includes(season.tableConfig?.type)
    const groups = lazy
      ? []
      : season.tableConfig?.type === 'groups'
      ? season.tableConfig.groups.map((ids, index) => [`Grupo ${String.fromCharCode(65 + index)}`, H.computeTable(season, ids)])
      : grouped
      ? [
          ['Serie 1', H.computeTable(season, season.tableConfig.series1)],
          ['Serie 2', H.computeTable(season, season.tableConfig.series2)],
        ]
      : [['Tabla regular', H.computeTable(season)]]
    const count = season.tableConfig?.type === 'groups' ? `${season.tableConfig.count} grupos` : grouped ? '2 series' : `${season.teams.length} equipos`
    const content = lazy ? '' : `<div class="season-standing-groups">${groups.map(([label, rows]) => `<section class="season-award-group"><h4>${label}<span>${rows.length} equipos</span></h4>${standingsTable(season, rows)}</section>`).join('')}</div>`
    const standingsLabel = season.tableConfig?.type === 'groups' ? 'Grupos' : grouped ? 'Series' : 'Tabla'
    return `<details class="season-awards season-standings" data-season-detail="standings" data-season-id="${esc(season.id || '')}"><summary><span class="season-awards-heading">${TABLE_ICON}<span>${standingsLabel}</span></span><span class="season-awards-count">${count}</span><span class="season-awards-chevron" aria-hidden="true"></span></summary><div class="season-awards-content">${content}</div></details>`
  }

  function fixtureSummary(season, lazy = false) {
    const fixtures = season.fixtures
    const rounds = fixtures?.rounds || []
    const matches = lazy ? [] : rounds.flat()
    const played = matches.filter(H.played).length
    const teams = new Map(season.teams.map((team) => [team.id, team]))
    const seriesFor = new Map()
    ;(fixtures?.series1 || []).forEach((id) => seriesFor.set(id, 'Serie 1'))
    ;(fixtures?.series2 || []).forEach((id) => seriesFor.set(id, 'Serie 2'))
    ;(fixtures?.groups || []).forEach((group, index) => group.forEach((id) => seriesFor.set(id, `Grupo ${String.fromCharCode(65 + index)}`)))
    const roundCount = fixtures?.roundsPerLeg || (fixtures?.mode === 'double' ? rounds.length / 2 : 0)
    const content = lazy ? '' : rounds.length
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
    const count = rounds.length ? lazy ? `${rounds.length} jornadas` : `${played}/${matches.length} partidos` : 'No creado'
    return `<details class="season-awards season-fixture-details" data-season-detail="fixture" data-season-id="${esc(season.id || '')}"><summary><span class="season-awards-heading">${TABLE_ICON}<span>Fixture</span></span><span class="season-awards-count">${count}</span><span class="season-awards-chevron" aria-hidden="true"></span></summary><div class="season-awards-content">${content}</div></details>`
  }

  function menuFixtureSummary(season) {
    const fixtures = season.fixtures
    const rounds = fixtures?.rounds || []
    if (!rounds.length) return '<p class="empty">No hay Fixtures guardados.</p>'
    const teams = new Map(season.teams.map((team) => [team.id, team]))
    const roundCount = fixtures.roundsPerLeg || (fixtures.mode === 'double' ? rounds.length / 2 : 0)
    return `<div class="menu-fixture-rounds">${rounds.map((round, index) => {
      const leg = fixtures.mode === 'double' ? ` · ${index < roundCount ? 'Ida' : 'Vuelta'}` : ''
      const matches = round.map((match) => {
        const home = teams.get(match.home)
        const away = teams.get(match.away)
        return `<article class="menu-fixture-match"><span class="menu-fixture-team menu-fixture-home">${home ? crest(home.logo, 'xs', home.name) : '<span class="crest crest--xs crest--tbd"></span>'}<span>${esc(home?.name || '—')}</span></span><strong class="menu-fixture-score">${match.hg ?? '—'} <i>:</i> ${match.ag ?? '—'}</strong><span class="menu-fixture-team menu-fixture-away">${away ? crest(away.logo, 'xs', away.name) : '<span class="crest crest--xs crest--tbd"></span>'}<span>${esc(away?.name || '—')}</span></span></article>`
      }).join('')
      return `<section class="menu-fixture-round"><h4>Jornada ${index + 1}${leg}</h4><div class="menu-fixture-games">${matches}</div></section>`
    }).join('')}</div>`
  }

  function tournamentSummary(season, lazy = false) {
    const playoffs = season.playoffs
    const bracket = lazy ? null : H.computeBracket(season)
    const repechageMatches = bracket ? H.computeRepechage(season) : []
    const teams = new Map(season.teams.map((team) => [team.id, team]))
    const allMatches = bracket ? [...repechageMatches, ...bracket.rounds.flat(), bracket.third] : []
    const played = allMatches.reduce((count, match) => count + (match.twoLegged ? Number(match.leg1Played) + Number(match.leg2Played) : Number(match.played)), 0)
    const totalMatches = allMatches.reduce((count, match) => count + (match.twoLegged ? 2 : 1), 0)
    const miniMatch = (match, final = false, extraAttrs = '') => `<article class="season-mini-match${final ? ' is-final season-mini-final-match' : ''}${match.stage === 'Repechaje' ? ' is-repechage' : ''}" data-bk="${esc(match.key)}" ${extraAttrs}>
      ${['home', 'away'].map((side) => {
        const id = match[side]
        const team = id ? teams.get(id) : null
        const score = side === 'home' ? match.hg : match.ag
        return `<div class="season-mini-team${match.winner === id && id ? ' is-winner' : ''}">${team ? crest(team.logo, 'xs', team.name) : '<span class="crest crest--xs crest--tbd"></span>'}<span>${team ? esc(team.name) : 'Por definir'}</span><strong>${score ?? '–'}</strong></div>`
      }).join('')}
      ${match.twoLegged ? `<div class="season-mini-leg-columns"><div class="season-mini-leg"><span>Ida</span><strong>${match.leg1?.hg ?? '–'}–${match.leg1?.ag ?? '–'}</strong></div><div class="season-mini-leg"><span>Vuelta</span><strong>${match.leg2?.hg ?? '–'}–${match.leg2?.ag ?? '–'}</strong></div></div>` : ''}
      ${match.tied && match.decided ? `<span class="season-mini-pens">Pen. ${match.hp}–${match.ap}</span>` : ''}
    </article>`
    const miniSlot = (match) => `<div class="season-mini-slot">${miniMatch(match)}</div>`
    const sideColumn = (matches, side) => {
      const body = matches.length > 1
        ? Array.from({ length: matches.length / 2 }, (_, i) => `<div class="season-mini-pair">${miniSlot(matches[2 * i])}${miniSlot(matches[2 * i + 1])}</div>`).join('')
        : matches.map(miniSlot).join('')
      return `<section class="season-mini-col season-mini-col--${side}"><h4>${esc(matches[0]?.stage || 'Ronda')}</h4><div class="season-mini-slots">${body}</div></section>`
    }
    const repechageBySeed = new Map((playoffs?.repechage?.seedSlots || []).map((seed, index) => [seed, repechageMatches[index]]).filter(([, match]) => match))
    const feedsForMatch = (match) => match.key.startsWith('r0-')
      ? [repechageBySeed.get(match.homeSeed), repechageBySeed.get(match.awaySeed)].filter(Boolean)
      : []
    const repechageSideColumn = (matches, side) => {
      if (!matches.some((match) => feedsForMatch(match).length)) return ''
      const slot = (match) => {
        const feeds = feedsForMatch(match)
        return `<div class="season-mini-slot">${feeds.map((feed) => miniMatch(feed, false, `data-feed-to="${esc(match.key)}" data-feed-side="${side}"`)).join('')}</div>`
      }
      const body = matches.length > 1
        ? Array.from({ length: matches.length / 2 }, (_, i) => `<div class="season-mini-pair">${slot(matches[2 * i])}${slot(matches[2 * i + 1])}</div>`).join('')
        : matches.map(slot).join('')
      return `<section class="season-mini-col season-mini-col--${side} season-mini-col--repechage"><h4>Repechaje</h4><div class="season-mini-slots">${body}</div></section>`
    }
    const miniMap = !lazy && bracket ? (() => {
      const sideRounds = bracket.rounds.slice(0, -1)
      const leftRoundOne = bracket.rounds[0].slice(0, bracket.rounds[0].length / 2)
      const rightRoundOne = bracket.rounds[0].slice(bracket.rounds[0].length / 2)
      const left = `${repechageSideColumn(leftRoundOne, 'left')}${sideRounds.map((round) => sideColumn(round.slice(0, round.length / 2), 'left')).join('')}`
      const right = `${sideRounds.map((round) => sideColumn(round.slice(round.length / 2), 'right')).reverse().join('')}${repechageSideColumn(rightRoundOne, 'right')}`
      const champion = bracket.champion ? teams.get(bracket.champion) : null
      return `<div class="season-mini-bracket" data-rounds="${bracket.rounds.length}" role="region" tabindex="0" aria-label="Mapa de llaves de Tournament; desliza horizontalmente para ver todas las rondas">${left}
        <section class="season-mini-col season-mini-col--final"><h4>Final</h4><div class="season-mini-final-top">${champion ? `${crest(champion.logo, 'xs', champion.name)}<span>${esc(champion.name)}</span>` : '<span>Campeón por definir</span>'}</div>${miniMatch(bracket.final, true)}<div class="season-mini-third"><h5>Tercer Puesto</h5>${miniMatch(bracket.third)}</div></section>
        ${right}</div>`
    })() : ''
    const content = lazy ? '' : bracket
      ? miniMap
      : '<p class="season-awards-empty">No se creó Tournament en esta temporada.</p>'
    const count = playoffs ? lazy ? `${playoffs.size} equipos` : `${played}/${totalMatches} partidos` : 'No creado'
    return `<details class="season-awards season-tournament-details" data-season-detail="tournament" data-season-id="${esc(season.id || '')}"><summary><span class="season-awards-heading">${H.ICONS.trophy}<span>Tournament</span></span><span class="season-awards-count">${count}</span><span class="season-awards-chevron" aria-hidden="true"></span></summary><div class="season-awards-content">${content}</div></details>`
  }

  function finalsSummary(season, lazy = false) {
    const hasSeriesFinal = season.tableConfig?.type === 'two-series'
    const hasSupercup = !!season.playoffs?.supercup?.enabled
    if (!hasSeriesFinal && !hasSupercup) return ''

    const expected = Number(hasSeriesFinal) + Number(!!season.playoffs) + Number(hasSupercup)
    const matches = []
    const teams = new Map(season.teams.map((team) => [team.id, team]))
    if (!lazy) {
      if (hasSeriesFinal) matches.push(['Finalísima de Series', H.finalissimaMatch(season)])
      const bracket = season.playoffs ? H.computeBracket(season) : null
      if (bracket?.final) matches.push(['Final de Tournament', bracket.final])
      if (hasSupercup) matches.push(['Final de Supercopa', H.supercupMatch(season, bracket)])
    }

    const card = ([title, match]) => {
      const home = match?.home ? teams.get(match.home) : null
      const away = match?.away ? teams.get(match.away) : null
      const score = (value) => value ?? '—'
      return `<article class="menu-match-card season-finals-match">
        ${home?.logo ? `<img class="menu-crest-watermark menu-crest-watermark--home" src="${esc(home.logo)}" alt="" aria-hidden="true" loading="lazy" decoding="async">` : ''}
        ${away?.logo ? `<img class="menu-crest-watermark menu-crest-watermark--away" src="${esc(away.logo)}" alt="" aria-hidden="true" loading="lazy" decoding="async">` : ''}
        ${match?.field ? `<span class="season-finals-field">Cancha ${match.field}</span>` : ''}
        <h4>${title}</h4>
        <div class="season-finals-score-row">
          <span class="season-finals-team">${home ? crest(home.logo, 'sm', home.name) : '<span class="crest crest--sm crest--tbd"></span>'}<span>${esc(home?.name || 'Por definir')}</span></span>
          <strong class="season-finals-score"><span class="${match?.winner === match?.home ? 'is-champion' : ''}">${score(match?.hg)}</span> <i>:</i> <span class="${match?.winner === match?.away ? 'is-champion' : ''}">${score(match?.ag)}</span></strong>
          <span class="season-finals-team season-finals-team--away">${away ? crest(away.logo, 'sm', away.name) : '<span class="crest crest--sm crest--tbd"></span>'}<span>${esc(away?.name || 'Por definir')}</span></span>
        </div>
        ${match?.tied && match.decided ? `<div class="season-finals-meta"><span class="season-finals-pens">Penales ${match.hp}–${match.ap}</span></div>` : ''}
      </article>`
    }
    const content = lazy
      ? ''
      : `<div class="season-finals-grid">${matches.map(card).join('')}</div>`
    const played = matches.filter(([, match]) => match?.played).length
    const count = lazy ? `${expected} finales` : `${played}/${expected} disputadas`
    return `<details class="season-awards season-finals-details" data-season-detail="finals" data-season-id="${esc(season.id || '')}"><summary><span class="season-awards-heading">${H.ICONS.trophy}<span>Finales</span></span><span class="season-awards-count">${count}</span><span class="season-awards-chevron" aria-hidden="true"></span></summary><div class="season-awards-content">${content}</div></details>`
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
    map.querySelectorAll('.season-mini-match[data-feed-to]').forEach((from) => {
      const to = map.querySelector(`[data-bk="${from.dataset.feedTo}"]`)
      if (!to) return
      const a = offsetWithin(from, map)
      const b = offsetWithin(to, map)
      const leftSide = from.dataset.feedSide === 'left'
      const x1 = leftSide ? a.x + a.w : a.x
      const x2 = leftSide ? b.x : b.x + b.w
      const y1 = a.y + a.h / 2
      const y2 = b.y + b.h / 2
      const mid = (x1 + x2) / 2
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', `M${x1} ${y1}H${mid}V${y2}H${x2}`)
      path.setAttribute('class', `season-mini-line${from.querySelector('.is-winner') ? ' is-live' : ''}`)
      svg.appendChild(path)
    })
    map.prepend(svg)
  }

  function watchMiniBrackets(el) {
    miniBracketObserver?.disconnect()
    const maps = [...el.querySelectorAll('.season-mini-bracket')]
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

  const payload = (seasons, library = null) => ({
    app: H.APP_ID,
    version: 1,
    exportedAt: new Date().toISOString(),
    readOnly: !!H.ui.lockSeasonExport,
    ...(library ? { library } : {}),
    seasons: H.clone(seasons).map(({ readOnly, librarySource, ...season }) => season),
  })

  function exportOne(id) {
    const saved = H.state.seasons.find((x) => x.id === id)
    if (saved) H.download(`league-hub-temporada-${saved.number}.json`, payload([saved]))
  }

  const safeLibraryFileName = (name) =>
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'temporadas'

  function exportAll(el) {
    if (!H.state.seasons.length) return H.toast('No hay temporadas guardadas', 'error')
    libraryExportName = el.querySelector('[name="library-export-name"]')?.value.trim() || libraryExportName || 'Temporadas'
    const name = libraryExportName.slice(0, 48)
    H.download(`league-hub-${safeLibraryFileName(name)}.json`, payload(H.state.seasons, { name, icon: libraryExportIcon }))
  }

  async function chooseLibraryIcon() {
    if (!H.pickAnyLogo) return H.toast('No se pudo abrir la galería de escudos', 'error')
    const logo = await H.pickAnyLogo('Escudo del archivo JSON')
    if (!logo) return
    libraryExportIcon = logo.data
    H.render()
  }

  async function loadPublishedLibrary() {
    publishedLibraryLoading = true
    publishedLibraryError = ''
    H.render()
    try {
      const catalogResponse = await fetch(new URL('season-library/catalog.json', location.href), { cache: 'no-store' })
      if (!catalogResponse.ok) throw new Error('No se pudo cargar la biblioteca publicada')
      const catalog = await catalogResponse.json()
      if (catalog?.app && catalog.app !== H.APP_ID) throw new Error('La biblioteca no corresponde a League Hub')
      const entries = Array.isArray(catalog?.files) ? catalog.files : []
      const loaded = await Promise.all(entries.map(async (entry) => {
        const file = typeof entry === 'string' ? entry : entry?.file
        if (typeof file !== 'string' || !/^[\w.-]+\.json$/i.test(file) || file.toLowerCase() === 'catalog.json') return null
        try {
          const response = await fetch(new URL(`season-library/${encodeURIComponent(file)}`, location.href), { cache: 'no-store' })
          if (!response.ok) return null
          const data = await response.json()
          if (data?.app && data.app !== H.APP_ID) return null
          const seasons = Array.isArray(data?.seasons) ? data.seasons : Array.isArray(data) ? data : []
          if (!seasons.length) return null
          const metadata = !Array.isArray(data) && data && typeof data === 'object' ? data.library : null
          const metadataName = typeof metadata?.name === 'string' ? metadata.name.trim() : ''
          const icon = typeof metadata?.icon === 'string' && metadata.icon.startsWith('data:image/')
            ? metadata.icon
            : typeof entry?.icon === 'string' && entry.icon.startsWith('data:image/') ? entry.icon : ''
          return {
            file,
            name: metadataName || (typeof entry?.name === 'string' && entry.name.trim()) || file,
            icon,
            data,
          }
        } catch {
          return null
        }
      }))
      publishedLibraryEntries = loaded.filter(Boolean)
    } catch (error) {
      publishedLibraryEntries = null
      publishedLibraryError = error.message || 'No se pudo cargar la biblioteca publicada'
    } finally {
      publishedLibraryLoading = false
      H.render()
    }
  }

  async function togglePublishedLibrary() {
    publishedLibraryVisible = !publishedLibraryVisible
    H.render()
    if (publishedLibraryVisible && (publishedLibraryEntries === null || publishedLibraryError)) await loadPublishedLibrary()
  }

  function importData(data) {
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
            st.logos.push({ id: st.logos.length, data: t.logo })
          }
        }),
      )
    })
    H.toast([added && `${added} importada(s)`, replaced && `${replaced} actualizada(s)`].filter(Boolean).join(' · '))
  }

  async function importFile(file) {
    let data
    try {
      data = JSON.parse(await H.readFileText(file))
    } catch {
      return H.toast(`${file.name || 'Archivo'}: no se pudo leer como JSON`, 'error')
    }
    const logoEntries = Array.isArray(data?.logos) ? data.logos : []
    const seasons = Array.isArray(data?.seasons) ? data.seasons : Array.isArray(data) ? data : Array.isArray(data?.teams) ? [data] : []
    if (logoEntries.length) {
      const importedLogos = H.importLogoData(logoEntries)
      if (!seasons.length) {
        if (importedLogos.length) H.toast(`${importedLogos.length} escudo(s) cargados en la galería`)
        else H.toast('El JSON no contiene escudos compatibles', 'error')
        return
      }
    }
    if (!seasons.length) return H.toast('El JSON no contiene temporadas ni una galería de escudos', 'error')
    importData(data)
  }

  let importBusy = false
  async function pickSeasonJson() {
    if (importBusy) return
    const [file] = await H.pickFiles({ accept: '*/*' })
    if (!file) return
    importBusy = true
    H.toast(`Leyendo ${file.name || 'archivo'}…`)
    try {
      await importFile(file)
    } catch (error) {
      H.toast(`No se pudo importar ${file.name || 'el archivo'}: ${error?.message || 'error de lectura'}`, 'error')
    } finally {
      importBusy = false
    }
  }

  H.seasonMenuParts = (season) => {
    const unwrap = (markup) => {
      const wrapper = '<div class="season-awards-content">'
      const start = markup.indexOf(wrapper)
      const end = markup.lastIndexOf('</div></details>')
      return start >= 0 && end > start ? `<div class="menu-season-content">${markup.slice(start + wrapper.length, end)}</div>` : ''
    }
    return {
      table: unwrap(standingsSummary(season)),
      fixtures: menuFixtureSummary(season),
      tournament: unwrap(tournamentSummary(season)),
    }
  }
  H.watchMiniBrackets = watchMiniBrackets

  H.view('seasons', {
    bind(el) {
      el.addEventListener('toggle', (e) => {
        const detail = e.target
        if (detail.matches('details[data-season-detail]') && detail.open && !detail.dataset.hydrated) {
          const season = H.state.current.id === detail.dataset.seasonId
            ? H.state.current
            : H.state.seasons.find((item) => item.id === detail.dataset.seasonId)
          if (season) {
            const renderers = {
              awards: (item) => awardSummary(item, true),
              standings: standingsSummary,
              fixture: fixtureSummary,
              tournament: tournamentSummary,
              finals: finalsSummary,
            }
            const renderDetail = renderers[detail.dataset.seasonDetail]
            if (renderDetail) {
              const template = document.createElement('template')
              template.innerHTML = renderDetail(season)
              const hydrated = template.content.firstElementChild
              if (hydrated) {
                hydrated.open = true
                hydrated.dataset.hydrated = 'true'
                detail.replaceWith(hydrated)
              }
            }
          }
        }
        if (detail.matches('.season-tournament-details')) watchMiniBrackets(el)
      }, true)
      el.addEventListener('click', (e) => {
        const keepCard = e.target.closest('[data-toggle-card="keep-teams"]')
        if (keepCard && !e.target.closest('input, label')) {
          keepCard.querySelector('input[type="checkbox"]')?.click()
          return
        }
        const btn = e.target.closest('[data-action]')
        if (!btn) return
        const { action, id } = btn.dataset
        if (action === 'save') save()
        else if (action === 'new') newSeason()
        else if (action === 'edit') edit(id)
        else if (action === 'export') exportOne(id)
        else if (action === 'export-all') exportAll(el)
        else if (action === 'import-json') pickSeasonJson()
        else if (action === 'choose-json-icon') chooseLibraryIcon()
        else if (action === 'toggle-published-library') togglePublishedLibrary()
        else if (action === 'load-published') {
          const entry = publishedLibraryEntries?.[Number(btn.dataset.index)]
          if (entry) {
            publishedLibraryVisible = false
            importData(entry.data)
          }
        } else if (action === 'delete') remove(id)
        else if (action === 'delete-all') removeAll()
      })
      el.addEventListener('input', (e) => {
        if (e.target.name === 'library-export-name') libraryExportName = e.target.value
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
          <div class="tournament-option-card tournament-toggle-card season-keep-teams-card" data-toggle-card="keep-teams">
            <label class="series-choice season-keep-teams-choice">
              <input type="checkbox" name="keep-teams" ${H.ui.newKeepTeams ? 'checked' : ''}>
              <span><strong>Conservar clubes</strong><small>Incluirlos al crear la próxima temporada</small></span>
            </label>
          </div>
        </article>`

      const io = `
        <article class="card">
          <header class="card-head"><h2 class="card-title">Importar / Exportar</h2></header>
          <div class="row-actions">
            <button type="button" class="btn btn--primary" data-action="import-json">Importar .json</button>
            <button class="btn btn--ghost" data-action="toggle-published-library">${publishedLibraryVisible ? 'Ocultar archivos' : 'Cargar desde GitHub'}</button>
            <button class="btn btn--ghost" data-action="export-all" ${s.seasons.length ? '' : 'disabled'}>Exportar todas</button>
          </div>
          <div class="season-json-export-settings">
            <button type="button" class="season-json-icon-control" data-action="choose-json-icon" aria-label="Elegir escudo del JSON">
              <span class="season-json-icon-preview">${libraryExportIcon ? `<img src="${esc(libraryExportIcon)}" alt="">` : JSON_FILE_ICON}</span>
            </button>
            <label class="field">
              <span class="field-label">Nombre del archivo</span>
              <input class="input" type="text" name="library-export-name" maxlength="48" value="${esc(libraryExportName)}">
            </label>
          </div>
          ${publishedLibraryVisible ? `<div class="season-library-list" aria-live="polite">
            ${publishedLibraryLoading
              ? '<p class="season-library-empty">Cargando archivos…</p>'
              : publishedLibraryError
                ? `<p class="season-library-empty">${esc(publishedLibraryError)}</p>`
                : publishedLibraryEntries?.length
                  ? publishedLibraryEntries.map((entry, index) => `<button class="season-library-entry" data-action="load-published" data-index="${index}">
                      <span class="season-library-entry-icon">${entry.icon ? `<img src="${esc(entry.icon)}" alt="">` : JSON_FILE_ICON}</span>
                      <span class="season-library-entry-name"><strong>${esc(entry.name)}</strong><small>${esc(entry.file)}</small></span>
                      <span class="season-library-entry-action">Cargar</span>
                    </button>`).join('')
                  : '<p class="season-library-empty">No hay temporadas publicadas en la biblioteca.</p>'}
          </div>` : ''}
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
                      ${sm.series.map(({ label, team }) => `<span class="champ" title="Campeón de ${label}">${crest(team.logo, 'sm', team.name)}<span>${label}</span></span>`).join('')}
                    </div>
                    <div class="team-actions">
                      <button class="btn btn--ghost btn--sm" data-action="edit" data-id="${esc(season.id)}" ${open || season.readOnly ? 'disabled' : ''} ${season.readOnly ? 'title="Edición bloqueada al importar"' : ''}>Editar</button>
                      <button class="btn btn--ghost btn--sm" data-action="export" data-id="${esc(season.id)}">Exportar</button>
                      <button class="btn btn--danger btn--sm" data-action="delete" data-id="${esc(season.id)}" aria-label="Eliminar Temporada ${season.number}">Eliminar</button>
                    </div>
                    ${standingsSummary(selectedSeason, true)}
                    ${fixtureSummary(selectedSeason, true)}
                    ${tournamentSummary(selectedSeason, true)}
                    ${finalsSummary(selectedSeason, true)}
                    ${awardSummary(selectedSeason, open, true)}
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
