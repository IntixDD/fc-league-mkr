;(() => {
  const H = window.Hub
  const { esc, crest } = H
  const ROTATE_MS = 4500
  const bg = { key: null, index: 0 }

  setInterval(() => {
    const list = [...document.querySelectorAll('#performance-body .perf-bg-logo')]
    if (list.length < 2 || document.getElementById('performance').hidden) return
    const prev = list[bg.index % list.length]
    bg.index = (bg.index + 1) % list.length
    prev.classList.remove('is-active')
    list[bg.index].classList.add('is-active')
  }, ROTATE_MS)

  function matchBox(title, m, rec, kind) {
    if (!m) return `<div class="feat-match"><h3 class="feat-title">${title}</h3><p class="empty">Sin partidos jugados.</p></div>`
    return `
      <div class="feat-match feat-match--${kind}">
        <h3 class="feat-title">${title}</h3>
        <div class="feat-score">
          <span class="feat-team">${crest(m.logo, 'md', rec.name)}<span>${esc(rec.name)}</span></span>
          <span class="feat-result">${m.gf} - ${m.ga}</span>
          <span class="feat-team">${crest(m.oppLogo, 'md', m.opp)}<span>${esc(m.opp)}</span></span>
        </div>
        ${m.pens ? `<p class="feat-pens">Penales ${esc(m.pens)}</p>` : ''}
        <p class="feat-when">${esc(m.label)}</p>
      </div>`
  }

  H.view('performance', {
    bind(el) {
      el.addEventListener('change', (e) => {
        if (e.target.name !== 'perf-team') return
        H.ui.perfTeam = e.target.value
        H.render()
      })
    },

    render(el) {
      const records = H.teamRecords().sort((a, b) => a.name.localeCompare(b.name))
      if (!records.length) {
        el.innerHTML = `<article class="card"><p class="empty">Juega partidos o guarda temporadas para ver el rendimiento de cada club.</p></article>`
        return
      }
      let rec = records.find((r) => r.key === H.ui.perfTeam)
      if (!rec) {
        rec = records[0]
        H.ui.perfTeam = rec.key
      }
      if (bg.key !== rec.key) {
        bg.key = rec.key
        bg.index = 0
      }
      const bgIndex = bg.index % Math.max(1, rec.logos.length)
      const t = H.teamTotals(rec)
      const matches = rec.seasons.flatMap((s) => s.matches.map((m) => ({ ...m, logo: s.logo })))
      const bestFor = [...matches].sort((a, b) => b.gf - a.gf || b.gf - b.ga - (a.gf - a.ga) || b.season - a.season)[0]
      const worstAgainst = [...matches].sort((a, b) => b.ga - a.ga || b.ga - b.gf - (a.ga - a.gf) || b.season - a.season)[0]
      const isWin = (match) => {
        if (match.gf !== match.ga) return match.gf > match.ga
        if (!match.pens) return false
        const [forPens, againstPens] = match.pens.split('-').map(Number)
        return Number.isFinite(forPens) && Number.isFinite(againstPens) && forPens > againstPens
      }
      const finalsWon = matches.filter((match) => match.type === 'cup' && match.label.startsWith('Final -') && isWin(match)).sort((a, b) => b.season - a.season)[0]
      const thirdPlacesWon = matches.filter((match) => match.type === 'cup' && match.label.startsWith('Tercer Puesto -') && isWin(match)).sort((a, b) => b.season - a.season)[0]

      const picker = `
        <label class="field field--inline perf-picker">
          <span class="field-label">Club</span>
          <select class="input" name="perf-team" data-key="perf-team">
            ${records.map((r) => `<option value="${esc(r.key)}" ${r.key === rec.key ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
          </select>
        </label>`

      const hero = `
        <article class="card card--wide perf-hero">
          <div class="perf-bg" aria-hidden="true">
            ${rec.logos.map((l, i) => `<img class="perf-bg-logo${i === bgIndex ? ' is-active' : ''}" src="${esc(l)}" alt="" decoding="async">`).join('')}
          </div>
          <div class="perf-hero-inner">
            <p class="perf-eyebrow">${rec.seasons.length} temporada(s) · ${rec.logos.length} escudo(s)</p>
            <h2 class="perf-name">${esc(rec.name)}</h2>
            <div class="logo-strip logo-strip--lg">${rec.logos.map((l) => `<span class="crest crest--md"><img src="${esc(l)}" alt=""></span>`).join('')}</div>
          </div>
        </article>`

      const COLS = [
        { label: 'PJ', title: 'Partidos jugados', tone: 'slate', icon: 'calendar', get: (l, c) => l.pj + c.pj },
        { label: 'PG', title: 'Partidos ganados', tone: 'green', icon: 'win', get: (l, c) => l.pg + c.pg },
        { label: 'PE', title: 'Partidos empatados', tone: 'gold', icon: 'draw', get: (l, c) => l.pe + c.pe },
        { label: 'PP', title: 'Partidos perdidos', tone: 'red', icon: 'loss', get: (l, c) => l.pp + c.pp },
        { label: 'GF L+S', title: 'Goles a favor en liga y series', tone: 'lime', icon: 'ball', get: (l) => l.gf },
        { label: 'GC L+S', title: 'Goles en contra en liga y series', tone: 'rose', icon: 'conceded', get: (l) => l.gc },
        { label: 'GF Torneo', title: 'Goles a favor en torneo', tone: 'blue', icon: 'ball', get: (l, c) => c.gf },
        { label: 'GC Torneo', title: 'Goles en contra en torneo', tone: 'orange', icon: 'conceded', get: (l, c) => c.gc },
        { label: 'GF Total', title: 'Goles a favor totales', tone: 'cyan', icon: 'trophy', get: (l, c) => l.gf + c.gf },
        { label: 'Puntos', title: 'Puntos (solo liga)', tone: 'accent', icon: 'star', get: (l) => l.pts },
      ]
      const cell = (col, v, tag = 'td') => `<${tag} class="num tone tone-${col.tone}${v ? '' : ' is-zero'}">${v}</${tag}>`

      const rows = rec.seasons
        .map(
          (s) => `
          <tr>
            <td>${crest(s.logo, 'sm', s.name)}</td>
            <th scope="row" class="num"><span class="season-chip">T${s.number}</span></th>
            ${COLS.map((col) => cell(col, col.get(s.league, s.cup))).join('')}
          </tr>`,
        )
        .join('')
      const L = t.league
      const C = t.cup
      const totals = [L.pj + C.pj, L.pg + C.pg, L.pe + C.pe, L.pp + C.pp, L.gf, L.gc, C.gf, C.gc, t.goals, t.points]

      const table = `
        <article class="card card--wide">
          <header class="card-head"><h2 class="card-title">Temporada por temporada</h2></header>
          <div class="table-wrap">
            <table class="data-table data-table--perf">
              <thead>
                <tr>
                  <th scope="col">Escudo</th>
                  <th scope="col" class="num">Temp.</th>
                  ${COLS.map((col) => `<th scope="col" class="num tone tone-${col.tone}"><abbr class="th-stat" title="${col.title}">${H.ICONS[col.icon]}<span>${col.label}</span></abbr></th>`).join('')}
                </tr>
              </thead>
              <tbody>${rows}</tbody>
              <tfoot>
                <tr>
                  <th scope="row" colspan="2">Total</th>
                  ${COLS.map((col, i) => cell(col, totals[i])).join('')}
                </tr>
              </tfoot>
            </table>
          </div>
        </article>`

      const featured = `
        <article class="card">
          <header class="card-head"><h2 class="card-title">Partidos destacados</h2></header>
          <div class="feat-grid">
            ${matchBox('Más goles a favor', bestFor, rec, 'for')}
            ${matchBox('Más goles en contra', worstAgainst, rec, 'against')}
            ${matchBox('Finales ganadas', finalsWon, rec, 'for')}
            ${matchBox('Terceros lugares ganados', thirdPlacesWon, rec, 'for')}
          </div>
        </article>`

      const titles = [
        { label: 'Campeón de Torneo', flag: 'cupChampion', tone: 'gold', icon: 'trophy' },
        { label: 'Campeón de Liga', flag: 'leagueChampion', tone: 'gold', icon: 'crown' },
        { label: 'Campeón de Serie', flag: 'seriesChampion', tone: 'green', icon: 'crown' },
        { label: 'Subcampeón de Torneo', flag: 'runnerUp', tone: 'silver', icon: 'medal2' },
        { label: '3er lugar', flag: 'third', tone: 'bronze', icon: 'medal3' },
        { label: '4to lugar', flag: 'fourth', tone: 'plain', icon: 'medal4' },
        { label: 'Goleador de la temporada', flag: 'seasonScorer', tone: 'gold', icon: 'ball' },
        { label: 'Portería imbatible de la temporada', flag: 'seasonCleanSheetAward', tone: 'green', icon: 'conceded' },
      ]
      const achievements = [
        { label: 'Goleador de torneo', flag: 'cupScorer', tone: 'accent', icon: 'ball', emptyLabel: 'Sin logros' },
        { label: 'Goleador de liga', flag: 'leagueScorer', tone: 'accent', icon: 'ball', emptyLabel: 'Sin logros' },
        { label: 'Goleador de Serie', flag: 'seriesScorer', tone: 'green', icon: 'ball', emptyLabel: 'Sin logros' },
        { label: 'Temporada perfecta', flag: 'perfectSeason', tone: 'gold', icon: 'star', emptyLabel: 'Sin logros' },
        { label: 'Invicto en Liga', flag: 'invincibleLeague', tone: 'accent', icon: 'win', emptyLabel: 'Sin logros' },
        { label: 'Invicto en Serie', flag: 'invincibleSeries', tone: 'green', icon: 'win', emptyLabel: 'Sin logros' },
        { label: 'Temporada Legendaria', flag: 'legendarySeason', tone: 'gold', icon: 'trophy', emptyLabel: 'Sin logros' },
      ]
      const trophyCard = (tr) => {
        const won = rec.seasons.filter((s) => s[tr.flag]).sort((a, b) => a.number - b.number)
        const seasons = won.length
          ? `<ul class="trophy-seasons" aria-label="Temporadas">${won.map((s) => `<li class="trophy-season">T${s.number}</li>`).join('')}</ul>`
          : `<p class="trophy-none">${tr.emptyLabel || 'Sin títulos'}</p>`
        return `
          <div class="trophy trophy--${tr.tone}${won.length ? '' : ' is-zero'}">
            <div class="trophy-top">
              <span class="trophy-icon">${H.ICONS[tr.icon] || H.ICONS.trophy}</span>
              <dd class="trophy-count">${won.length}</dd>
            </div>
            <dt class="trophy-label">${tr.label}</dt>
            ${seasons}
          </div>`
      }
      const trophySection = (label, items) => `<section class="trophy-section"><h3 class="card-title trophy-section-title">${label}</h3><dl class="trophy-grid">${items.map(trophyCard).join('')}</dl></section>`
      const palmares = `
        <article class="card">
          <header class="card-head"><h2 class="card-title">Palmarés histórico</h2></header>
          ${trophySection('Títulos', titles)}
          ${trophySection('Logros', achievements)}
        </article>`

      const fileName = `rendimiento-${rec.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'club'}`
      el.innerHTML = `
        <div class="perf-toolbar">${picker}${H.exportButton('#performance-export', fileName, 'Exportar rendimiento PNG')}</div>
        <div id="performance-export" class="perf-export"><div class="panel-grid panel-grid--even">${hero}${featured}${palmares}${table}</div></div>`
    },
  })
})()
