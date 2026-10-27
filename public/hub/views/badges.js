;(() => {
  const H = window.Hub
  const ACHIEVEMENT_FLAGS = ['cupScorer', 'leagueScorer', 'seriesScorer', 'perfectSeason', 'invincibleLeague', 'invincibleSeries', 'legendarySeason']
  const POINTS_BADGE_ICON = '<svg class="stat-icon badge-icon-svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 30.38 12 43l12-6 12 6-3-12.62"/><circle cx="24" cy="19" r="14"/><path d="m24 11 2.4 5 5.6.8-4 3.9.9 5.6-4.9-2.7-4.9 2.7.9-5.6-4-3.9 5.6-.8z"/></svg>'
  const ZIDANE_BADGE_ICON = '<svg class="stat-icon badge-icon-svg" viewBox="9.5 9.5 29 29" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g transform="matrix(1.312754,0,0,1.312754,-7.558507,-7.33056)"><g transform="matrix(1,0,0,1,12.039929,11.866289)"><path d="M6,9L4.5,9C3.129,9 2,7.871 2,6.5C2,5.129 3.129,4 4.5,4L6,4"/></g><g transform="matrix(1,0,0,1,12.039929,11.866289)"><path d="M18,9L19.5,9C20.871,9 22,7.871 22,6.5C22,5.129 20.871,4 19.5,4L18,4"/></g><g transform="matrix(1,0,0,1,12.039929,11.866289)"><path d="M4,22L20,22"/></g><g transform="matrix(1,0,0,1,12.039929,11.866289)"><path d="M10,14.66L10,17C10,17.55 9.53,17.98 9.03,18.21C7.85,18.75 7,20.24 7,22"/></g><g transform="matrix(1,0,0,1,12.039929,11.866289)"><path d="M14,14.66L14,17C14,17.55 14.47,17.98 14.97,18.21C16.15,18.75 17,20.24 17,22"/></g><g transform="matrix(1,0,0,1,12.039929,11.866289)"><path d="M18,2L6,2L6,9C6,12.292 8.708,15 12,15C15.292,15 18,12.292 18,9L18,2Z"/></g><g transform="matrix(1.305921,0,0,1.305921,24.04568,23.622801)"><text x="-2.506px" y="0px" fill="currentColor" stroke="none" font-family="MilkerRegular, Milker, system-ui, sans-serif" font-size="7px">3</text></g></g></svg>'
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
    const sharedIcons = {
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
    const perfectPoints = record.seasons.some((season) =>
      (season.leagueChampion || season.seriesChampion) &&
      season.league.pj > 0 &&
      season.league.pts === season.league.pj * 3,
    )
    const tournamentWins = new Set(record.seasons.filter((season) => season.cupChampion).map((season) => Number(season.number)))
    const threeTournamentStreak = [...tournamentWins].some((season) =>
      Number.isFinite(season) && tournamentWins.has(season + 1) && tournamentWins.has(season + 2),
    )
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
      { category: 'Especiales', name: 'Puntuación Perfecta', description: 'Gana una Liga o Serie consiguiendo todos los puntos posibles: 3 por cada partido jugado.', icon: 'star', tone: 'gold', earned: perfectPoints, progress: perfectPoints ? 'Obtenida' : 'Pendiente' },
    ]
  }

  H.badgeCatalog = badgeCatalog
  H.badgeIcon = badgeIcon
})()
