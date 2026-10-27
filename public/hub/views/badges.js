;(() => {
  const H = window.Hub
  const ACHIEVEMENT_FLAGS = ['cupScorer', 'leagueScorer', 'seriesScorer', 'perfectSeason', 'invincibleLeague', 'invincibleSeries', 'legendarySeason']
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
    const sharedIcons = {
      league: H.ICONS.crown,
      series: H.ICONS.crown,
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
    const thresholdBadges = (category, icon, tone, value, entries) => entries.map(([target, name]) => ({
      category,
      name,
      icon,
      tone,
      value,
      target,
      earned: value >= target,
      progress: `${value}/${target}`,
    }))

    return [
      ...thresholdBadges('Goles', 'ball', 'blue', totals.goals, [[10, 'Mete 10 goles'], [50, 'Mete 50 goles'], [100, 'Mete 100 goles'], [200, 'Mete 200 goles'], [500, 'Mete 500 goles totales']]),
      ...thresholdBadges('Títulos', 'trophy', 'gold', titles, [[1, 'Gana tu primer título'], [5, 'Gana 5 títulos'], [10, 'Gana 10 títulos'], [20, 'Gana 20 títulos'], [50, 'Gana 50 títulos'], [100, 'Gana 100 títulos']]),
      { category: 'Títulos', name: 'Gana tu primer torneo', icon: 'cup', tone: 'gold', value: totals.cups, target: 1, earned: totals.cups > 0, progress: `${totals.cups}/1` },
      { category: 'Títulos', name: 'Gana tu primera liga', icon: 'league', tone: 'green', value: totals.leagues, target: 1, earned: totals.leagues > 0, progress: `${totals.leagues}/1` },
      { category: 'Títulos', name: 'Gana tu primera serie', icon: 'series', tone: 'green', value: totals.series, target: 1, earned: totals.series > 0, progress: `${totals.series}/1` },
      ...thresholdBadges('Temporadas perfectas', 'star', 'gold', perfect, [[1, 'Gana una temporada perfecta'], [5, 'Gana 5 temporadas perfectas'], [10, 'Gana 10 temporadas perfectas'], [20, 'Gana 20 temporadas perfectas']]),
      ...thresholdBadges('Temporadas legendarias', 'legendary', 'purple', legendary, [[1, 'Gana una temporada legendaria'], [2, 'Gana 2 temporadas legendarias'], [5, 'Gana 5 temporadas legendarias'], [10, 'Gana 10 temporadas legendarias']]),
      ...thresholdBadges('Logros', 'achievement', 'accent', achievements, [[10, 'Consigue 10 logros'], [20, 'Consigue 20 logros'], [50, 'Consigue 50 logros'], [100, 'Consigue 100 logros totales']]),
      { category: 'Especiales', name: 'Clasifica a Tournament con puros empates', icon: 'draws', tone: 'cyan', earned: tournamentByDraws, progress: tournamentByDraws ? 'Obtenida' : 'Pendiente' },
      { category: 'Especiales', name: 'Gana un torneo sin meter goles', icon: 'noGoals', tone: 'slate', earned: scorelessTournament, progress: scorelessTournament ? 'Obtenida' : 'Pendiente' },
    ]
  }

  H.badgeCatalog = badgeCatalog
  H.badgeIcon = badgeIcon
})()
