;(() => {
  const H = window.Hub
  const ACHIEVEMENT_FLAGS = ['cupScorer', 'leagueScorer', 'seriesScorer', 'perfectSeason', 'invincibleLeague', 'invincibleSeries', 'legendarySeason']
  const POINTS_BADGE_ICON = '<svg class="stat-icon badge-icon-svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 30.38 12 43l12-6 12 6-3-12.62"/><circle cx="24" cy="19" r="14"/><path d="m24 11 2.4 5 5.6.8-4 3.9.9 5.6-4.9-2.7-4.9 2.7.9-5.6-4-3.9 5.6-.8z"/></svg>'
  const ZIDANE_BADGE_ICON = '<svg class="stat-icon badge-icon-svg" viewBox="0 0 39 39" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g transform="matrix(1.750339,0,0,1.750339,-22.824292,-22.520363)"><g transform="matrix(1,0,0,1,12.039929,11.866289)"><path d="M6,9L4.5,9C3.129,9 2,7.871 2,6.5C2,5.129 3.129,4 4.5,4L6,4"/><path d="M18,9L19.5,9C20.871,9 22,7.871 22,6.5C22,5.129 20.871,4 19.5,4L18,4"/><path d="M4,22L20,22"/><path d="M10,14.66L10,17C10,17.55 9.53,17.98 9.03,18.21C7.85,18.75 7,20.24 7,22"/><path d="M14,14.66L14,17C14,17.55 14.47,17.98 14.97,18.21C16.15,18.75 17,20.24 17,22"/><path d="M18,2L6,2L6,9C6,12.292 8.708,15 12,15C15.292,15 18,12.292 18,9L18,2Z"/></g><g transform="matrix(1.305921,0,0,1.305921,20.773042,23.622801)"><path d="M4.086,-2.52C4.45,-2.787 4.711,-3.141 4.711,-3.553C4.711,-4.434 3.815,-5.019 2.515,-5.019C1.316,-5.019 0.468,-4.517 0.326,-3.511L1.832,-3.224C1.874,-3.358 2.057,-3.667 2.515,-3.667C2.844,-3.667 3.111,-3.551 3.111,-3.302C3.111,-3.074 2.844,-2.937 2.515,-2.937C2.513,-2.937 1.966,-2.942 1.966,-2.942L1.966,-1.982L2.459,-1.982C2.852,-1.982 3.17,-1.877 3.17,-1.607C3.17,-1.338 2.812,-1.233 2.459,-1.233C2.101,-1.233 1.789,-1.442 1.663,-1.644L0.161,-1.224C0.434,-0.394 1.191,0.119 2.459,0.119C3.651,0.119 4.769,-0.313 4.769,-1.473C4.769,-1.933 4.5,-2.28 4.086,-2.52Z" fill="currentColor" stroke="none"/></g></g></svg>'
  const GUARDIOLA_BADGE_ICON = '<svg class="stat-icon badge-icon-svg" viewBox="0 0 29 29" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g transform="matrix(1.285957,0,0,1.285957,-4.129296,-4.129296)"><g transform="matrix(1,0,0,1,2.439794,2.436716)"><path d="M11.562,3.266C11.65,3.107 11.818,3.007 12,3.007C12.182,3.007 12.35,3.107 12.438,3.266L15.39,8.87C15.565,9.192 15.903,9.393 16.269,9.393C16.501,9.393 16.727,9.312 16.906,9.164L21.183,5.5C21.272,5.428 21.384,5.388 21.498,5.388C21.773,5.388 21.998,5.614 21.998,5.888C21.998,5.932 21.993,5.976 21.981,6.019L19.147,16.265C19.028,16.695 18.637,16.995 18.191,16.999L5.81,16.999C5.364,16.996 4.972,16.695 4.853,16.265L2.02,6.02C2.008,5.977 2.003,5.933 2.003,5.889C2.003,5.615 2.228,5.389 2.503,5.389C2.617,5.389 2.729,5.429 2.818,5.501L7.094,9.165C7.273,9.313 7.499,9.394 7.731,9.394C8.097,9.394 8.435,9.193 8.61,8.871L11.562,3.266Z"/><path d="M5,21L19,21"/></g><g transform="matrix(0.50492,0,0,0.50492,3.301716,10.057809)"><path d="M22.547,3.732L25.57,3.732L25.57,10.67L27.953,10.67L27.953,13.256L25.57,13.256C25.57,13.816 25.336,14.225 24.867,14.482C24.685,14.566 24.515,14.607 24.359,14.607L22.273,14.607L22.273,13.264L14.289,13.264C14.284,13.264 14.281,13.262 14.281,13.26L14.281,13.248L14.273,13.248L14.273,11.325C14.273,10.96 14.364,10.673 14.547,10.464C14.625,10.365 14.742,10.253 14.898,10.128L22.039,3.943C22.2,3.834 22.37,3.764 22.547,3.732ZM18.547,10.67L22.273,10.67L22.273,7.436L18.547,10.67Z" fill="currentColor" stroke="none"/></g></g></svg>'
  const STEAUA_BADGE_ICON = '<svg class="stat-icon badge-icon-svg" viewBox="0 0 39 39" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g transform="matrix(1.697331,0,0,1.697331,-24.559933,-8.971734)"><g transform="matrix(0.542864,0,0,0.542864,19.345527,11.24595)"><path d="M11.562,3.266C11.65,3.107 11.818,3.007 12,3.007C12.182,3.007 12.35,3.107 12.438,3.266L15.39,8.87C15.565,9.192 15.903,9.393 16.269,9.393C16.501,9.393 16.727,9.312 16.906,9.164L21.183,5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" stroke-width="3.2"/></g><g transform="matrix(1,0,0,1,13.86017,4.676222)"><circle cx="12" cy="12" r="10" stroke-width="2"/></g></g></svg>'
  const BADGE_ART = {
    ball: '<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 5h-5L8 10l4-3zM12 7V3m4 7 5-2m-6.5 7.5 3 4M9.5 15.5l-3 4M8 10l-5-2"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4m-4 2v4m-5 4h10m-8-4h6"/>',
    cup: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4m-4 2v4m-5 4h10m-8-4h6"/>',
    league: '<path d="m3 8 5 4 4-7 4 7 5-4-2 11H5L3 8zM7 22h10"/>',
    series: '<path d="M4 5h6v6H4zM14 5h6v6h-6zM9 17h6v4H9zM7 11v3h10v-3m-5 3v3"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
    legendary: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9zM5 3v2m14-2v2"/>',
    achievement: '<circle cx="12" cy="9" r="6"/><path d="m8 14-2 7 6-3 6 3-2-7m-4-8 1.2 2.2 2.5.4-1.8 1.7.4 2.5L12 12l-2.3 1.2.4-2.5-1.8-1.7 2.5-.4z"/>',
    draws: '<path d="M5 8h14M5 12h14M5 16h14M8 5v14m8-14v14"/>',
    noGoals: '<path d="M3 21V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v15M7 21V9h10v12M3 12h18M12 9v12M5 5l14 14"/>',
  }

  function badgeIcon(badge) {
    if (badge.icon.startsWith('points')) return POINTS_BADGE_ICON
    if (badge.icon === 'zidane') return ZIDANE_BADGE_ICON
    if (badge.icon === 'guardiola') return GUARDIOLA_BADGE_ICON
    if (badge.icon === 'steaua') return STEAUA_BADGE_ICON
    const sharedIcons = {
      ball: H.ICONS.ball,
      league: H.ICONS.crown,
      series: H.ICONS.crown,
      draw: H.ICONS.draw,
      noGoals: H.ICONS.conceded,
      legendary: H.ICONS.trophy,
      achievement: H.ICONS.win,
    }
    if (sharedIcons[badge.icon]) return sharedIcons[badge.icon]
    const art = badge.icon === 'draws' ? BADGE_ART.series : BADGE_ART[badge.icon] || BADGE_ART.achievement
    return `<svg class="stat-icon badge-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${art}</svg>`
  }

  function badgeCatalog(record) {
    const totals = H.teamTotals(record)
    const TITLE_FLAGS = ['cupChampion', 'leagueChampion', 'seriesChampion', 'runnerUp', 'third', 'fourth', 'seasonScorer', 'seasonCleanSheetAward']
    const titles = record.seasons.reduce((sum, season) => sum + TITLE_FLAGS.reduce((count, flag) => count + Number(!!season[flag]), 0), 0)
    const achievements = record.seasons.reduce((sum, season) => sum + ACHIEVEMENT_FLAGS.reduce((n, flag) => n + Number(season[flag]), 0), 0)
    const perfect = record.seasons.filter((season) => season.perfectSeason).length
    const legendary = record.seasons.filter((season) => season.legendarySeason).length
    const tournamentByDraws = record.seasons.some((season) => season.tournamentQualifiedByDraws)
    const scorelessTournament = record.seasons.some((season) => season.cupChampion && (season.cup?.gf || 0) === 0)
    const centuryComeback = record.seasons.some((season) => season.centuryComeback)
    const perfectPoints = record.seasons.some((season) =>
      (season.leagueChampion || season.seriesChampion) &&
      season.league.pj > 0 &&
      season.league.pts === season.league.pj * 3,
    )
    const maxTournamentGoals = Math.max(0, ...record.seasons.map((season) => season.cup?.gf || 0))
    const tournamentWins = new Set(record.seasons.filter((season) => season.cupChampion).map((season) => Number(season.number)))
    const threeTournamentStreak = [...tournamentWins].some((season) =>
      Number.isFinite(season) && tournamentWins.has(season + 1) && tournamentWins.has(season + 2),
    )
    const leagueSeriesWins = new Set(record.seasons.filter((season) => season.leagueChampion || season.seriesChampion).map((season) => Number(season.number)))
    const fourLeagueSeriesStreak = [...leagueSeriesWins].some((season) =>
      Number.isFinite(season) && leagueSeriesWins.has(season + 1) && leagueSeriesWins.has(season + 2) && leagueSeriesWins.has(season + 3),
    )
    const chronologicalLeagueMatches = record.seasons
      .flatMap((season) => season.matches
        .filter((match) => match.type === 'league')
        .map((match, index) => ({
          ...match,
          season: Number(match.season ?? season.number),
          round: Number(match.label.match(/^Jornada ([0-9]+)/)?.[1]) || 0,
          order: index,
        })))
      .sort((a, b) => a.season - b.season || a.round - b.round || a.order - b.order)
    let currentUnbeaten = 0
    let longestUnbeaten = 0
    chronologicalLeagueMatches.forEach((match) => {
      currentUnbeaten = match.gf >= match.ga ? currentUnbeaten + 1 : 0
      longestUnbeaten = Math.max(longestUnbeaten, currentUnbeaten)
    })
    const thresholdBadges = (category, icon, tone, value, entries) => entries.map(([target, name, description]) => ({
      category,
      name,
      description,
      icon,
      tone,
      value,
      target,
      earned: value >= target,
      progress: `${value}/${target}`,
    }))

    return [
      ...thresholdBadges('Goles', 'ball', 'blue', totals.goals, [[10, 'Primer rugido', 'Marca 10 goles en cualquier competición.'], [50, 'Cazagoles', 'Acumula 50 goles entre Liga/Serie y Tournament.'], [100, 'Centurión del gol', 'Llega a 100 goles totales.'], [200, 'Doble artillería', 'Alcanza 200 goles en tu historial.'], [500, 'Leyenda goleadora', 'Anota 500 goles totales con el equipo.']]),
      ...thresholdBadges('Títulos', 'trophy', 'gold', titles, [[1, 'Primera corona', 'Gana tu primer título oficial.'], [5, 'Coleccionista de copas', 'Acumula 5 títulos oficiales.'], [10, 'Palmarés de élite', 'Acumula 10 títulos oficiales.'], [20, 'Dinastía campeona', 'Llega a 20 títulos oficiales.'], [50, 'Leyenda del palmarés', 'Consigue 50 títulos oficiales.'], [100, 'Inmortal de los títulos', 'Alcanza 100 títulos oficiales.']]),
      { category: 'Títulos', name: 'Reyes del Tournament', description: 'Conquista Tournament al menos una vez.', icon: 'cup', tone: 'gold', value: totals.cups, target: 1, earned: totals.cups > 0, progress: `${totals.cups}/1` },
      { category: 'Títulos', name: 'Corona de Liga', description: 'Termina una liga en el primer lugar.', icon: 'league', tone: 'green', value: totals.leagues, target: 1, earned: totals.leagues > 0, progress: `${totals.leagues}/1` },
      { category: 'Títulos', name: 'Soberanos de Serie', description: 'Gana el primer lugar de una serie.', icon: 'series', tone: 'green', value: totals.series, target: 1, earned: totals.series > 0, progress: `${totals.series}/1` },
      ...thresholdBadges('Temporadas perfectas', 'star', 'gold', perfect, [[1, 'La temporada perfecta', 'Completa una temporada perfecta: gana Tournament y Liga/Serie, y lidera sus goleos y porterías a cero.'], [5, 'Quinteto perfecto', 'Consigue 5 temporadas perfectas.'], [10, 'Perfección absoluta', 'Consigue 10 temporadas perfectas.'], [20, 'Veinte veces perfectos', 'Consigue 20 temporadas perfectas.']]),
      ...thresholdBadges('Temporadas legendarias', 'legendary', 'purple', legendary, [[1, 'Nace una leyenda', 'Gana una temporada perfecta sin recibir goles durante el juego en ninguna competición. Los penales de las tandas no cuentan.'], [2, 'Leyenda consagrada', 'Completa 2 temporadas legendarias.'], [5, 'Linaje legendario', 'Completa 5 temporadas legendarias.'], [10, 'Mito del fútbol', 'Completa 10 temporadas legendarias.']]),
      ...thresholdBadges('Logros', 'achievement', 'accent', achievements, [[10, 'Cazador de hazañas', 'Acumula 10 logros de temporada.'], [20, 'Coleccionista de logros', 'Acumula 20 logros de temporada.'], [50, 'Palmarés de proezas', 'Acumula 50 logros de temporada.'], [100, 'Centenario de hazañas', 'Alcanza 100 logros de temporada.']]),
      ...thresholdBadges('Puntos', 'points25', 'blue', totals.points, [[25, 'Primer botín', 'Suma 25 puntos en Liga/Serie a lo largo de tus temporadas.'], [50, 'Cosecha de puntos', 'Acumula 50 puntos en Liga/Serie.'], [100, 'Centenario de puntos', 'Alcanza 100 puntos en Liga/Serie.'], [200, 'Imperio de puntos', 'Acumula 200 puntos en Liga/Serie.']]).map((badge, index) => ({ ...badge, icon: ['points25', 'points50', 'points100', 'points200'][index] })),
      { category: 'Especiales', name: 'Pase de acero', description: 'Clasifica a Tournament tras empatar todos los partidos de Liga/Serie; el empate que se define por penales también cuenta.', icon: 'draw', tone: 'cyan', earned: tournamentByDraws, progress: tournamentByDraws ? 'Obtenida' : 'Pendiente' },
      { category: 'Especiales', name: 'Campeón sin pólvora', description: 'Gana Tournament sin marcar goles durante los partidos; puedes avanzar y ganar mediante tandas de penales.', icon: 'noGoals', tone: 'slate', earned: scorelessTournament, progress: scorelessTournament ? 'Obtenida' : 'Pendiente' },
      { category: 'Especiales', name: '¡Como Zidane!', description: 'Gana Tournament en tres temporadas consecutivas.', icon: 'zidane', tone: 'gold', earned: threeTournamentStreak, progress: threeTournamentStreak ? 'Obtenida' : 'Pendiente' },
      { category: 'Especiales', name: '4 in a row', description: 'Gana el título de Liga o Serie en cuatro temporadas consecutivas.', icon: 'guardiola', tone: 'gold', earned: fourLeagueSeriesStreak, progress: fourLeagueSeriesStreak ? 'Obtenida' : 'Pendiente' },
      { category: 'Especiales', name: 'Mister Tournament', description: 'Consigue 17 goles en una sola edición de Tournament.', icon: 'ball', tone: 'gold', value: maxTournamentGoals, target: 17, earned: maxTournamentGoals >= 17, progress: `${maxTournamentGoals}/17` },
      { category: 'Especiales', name: 'Invicto de Bucarest', description: 'Completa 105 partidos consecutivos sin perder en Liga/Serie, sumando todas las temporadas.', icon: 'steaua', tone: 'gold', value: longestUnbeaten, target: 105, earned: longestUnbeaten >= 105, progress: `${longestUnbeaten}/105` },
      { category: 'Especiales', name: 'Puntuación Perfecta', description: 'Gana una Liga o Serie consiguiendo todos los puntos posibles: 3 por cada partido jugado.', icon: 'star', tone: 'gold', earned: perfectPoints, progress: perfectPoints ? 'Obtenida' : 'Pendiente' },
      { category: 'Especiales', name: 'El milagro del siglo', description: 'Avanza en Tournament tras perder 0–4 en la Ida y remontar en la Vuelta. También cuenta si empatas el global y clasificas por penales.', icon: 'achievement', tone: 'gold', earned: centuryComeback, progress: centuryComeback ? 'Obtenida' : 'Pendiente' },
    ]
  }

  H.badgeCatalog = badgeCatalog
  H.badgeIcon = badgeIcon
})()
