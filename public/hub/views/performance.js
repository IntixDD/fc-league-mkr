;(() => {
  const H = window.Hub
  const { esc, crest } = H
  const ROTATE_MS = 3500

  setInterval(() => {
    const logos = document.querySelectorAll('#performance-body .perf-bg-logo')
    if (logos.length < 2 || document.getElementById('performance').hidden) return
    const list = [...logos]
    const i = Math.max(0, list.findIndex((l) => l.classList.contains('is-active')))
    list[i].classList.remove('is-active')
    list[(i + 1) % list.length].classList.add('is-active')
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
      const t = H.teamTotals(rec)
      const matches = rec.seasons.flatMap((s) => s.matches.map((m) => ({ ...m, logo: s.logo })))
      const bestFor = [...matches].sort((a, b) => b.gf - a.gf || b.gf - b.ga - (a.gf - a.ga) || b.season - a.season)[0]
      const worstAgainst = [...matches].sort((a, b) => b.ga - a.ga || b.ga - b.gf - (a.ga - a.gf) || b.season - a.season)[0]

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
            ${rec.logos.map((l, i) => `<img class="perf-bg-logo${i === 0 ? ' is-active' : ''}" src="${esc(l)}" alt="">`).join('')}
          </div>
          <div class="perf-hero-inner">
            <p class="perf-eyebrow">${rec.seasons.length} temporada(s) · ${rec.logos.length} escudo(s)</p>
            <h2 class="perf-name">${esc(rec.name)}</h2>
            <div class="logo-strip logo-strip--lg">${rec.logos.map((l) => `<span class="crest crest--md"><img src="${esc(l)}" alt=""></span>`).join('')}</div>
          </div>
        </article>`

      const rows = rec.seasons
        .map((s) => {
          const l = s.league
          const c = s.cup
          return `
          <tr>
            <td>${crest(s.logo, 'sm', s.name)}</td>
            <th scope="row" class="num">T${s.number}</th>
            <td class="num">${l.pj + c.pj}</td>
            <td class="num">${l.pg + c.pg}</td>
            <td class="num">${l.pe + c.pe}</td>
            <td class="num">${l.pp + c.pp}</td>
            <td class="num">${l.gf}</td>
            <td class="num">${l.gc}</td>
            <td class="num">${c.gf}</td>
            <td class="num">${c.gc}</td>
            <td class="num">${l.gf + c.gf}</td>
            <td class="num pts">${l.pts}</td>
          </tr>`
        })
        .join('')
      const L = t.league
      const C = t.cup

      const table = `
        <article class="card card--wide">
          <header class="card-head"><div><h2 class="card-title">Temporada por temporada</h2><p class="card-sub">Liga + torneo (playoffs)</p></div></header>
          <div class="table-wrap">
            <table class="data-table data-table--perf">
              <thead>
                <tr>
                  <th scope="col">Escudo</th>
                  <th scope="col" class="num">Temp.</th>
                  <th scope="col" class="num"><abbr title="Partidos jugados">PJ</abbr></th>
                  <th scope="col" class="num"><abbr title="Partidos ganados">PG</abbr></th>
                  <th scope="col" class="num"><abbr title="Partidos empatados">PE</abbr></th>
                  <th scope="col" class="num"><abbr title="Partidos perdidos">PP</abbr></th>
                  <th scope="col" class="num"><abbr title="Goles a favor en liga">GF Liga</abbr></th>
                  <th scope="col" class="num"><abbr title="Goles en contra en liga">GC Liga</abbr></th>
                  <th scope="col" class="num"><abbr title="Goles a favor en torneo">GF Torneo</abbr></th>
                  <th scope="col" class="num"><abbr title="Goles en contra en torneo">GC Torneo</abbr></th>
                  <th scope="col" class="num"><abbr title="Goles a favor totales">GF Total</abbr></th>
                  <th scope="col" class="num pts">Puntos</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
              <tfoot>
                <tr>
                  <th scope="row" colspan="2">Total</th>
                  <td class="num">${L.pj + C.pj}</td>
                  <td class="num">${L.pg + C.pg}</td>
                  <td class="num">${L.pe + C.pe}</td>
                  <td class="num">${L.pp + C.pp}</td>
                  <td class="num">${L.gf}</td>
                  <td class="num">${L.gc}</td>
                  <td class="num">${C.gf}</td>
                  <td class="num">${C.gc}</td>
                  <td class="num">${t.goals}</td>
                  <td class="num pts">${t.points}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </article>`

      const featured = `
        <article class="card">
          <header class="card-head"><div><h2 class="card-title">Partidos destacados</h2><p class="card-sub">Récords de goles</p></div></header>
          <div class="feat-grid">
            ${matchBox('Más goles a favor', bestFor, rec, 'for')}
            ${matchBox('Más goles en contra', worstAgainst, rec, 'against')}
          </div>
        </article>`

      const trophies = [
        ['Torneos', t.cups, 'gold'],
        ['Ligas', t.leagues, 'gold'],
        ['Subcampeonatos', t.runnerUp, 'silver'],
        ['3eros lugares', t.third, 'bronze'],
        ['4tos lugares', t.fourth, ''],
        ['Goleador de Liga', t.leagueScorer, 'accent'],
        ['Goleador del Torneo', t.cupScorer, 'accent'],
      ]
      const palmares = `
        <article class="card">
          <header class="card-head"><div><h2 class="card-title">Palmarés histórico</h2><p class="card-sub">Goleador = club con más goles de la competición</p></div></header>
          <dl class="trophy-grid">
            ${trophies.map(([label, n, tone]) => `<div class="trophy trophy--${tone || 'plain'}${n ? '' : ' is-zero'}"><dd>${n}</dd><dt>${label}</dt></div>`).join('')}
          </dl>
        </article>`

      el.innerHTML = `${picker}<div class="panel-grid">${hero}${featured}${palmares}${table}</div>`
    },
  })
})()
