;(() => {
  const H = window.Hub
  const { esc, crest } = H

  H.view('table', {
    render(el, s) {
      const season = s.current
      if (!season.teams.length) {
        el.innerHTML = `<article class="card"><p class="empty">Registra equipos en <a href="#teams">Teams</a> para ver la tabla.</p></article>`
        return
      }
      const rows = H.computeTable(season)
      const { total, played } = H.stageCounts(season)
      const zone = season.playoffs ? season.playoffs.size : [4, 8, 16].includes(H.ui.poSize) && season.teams.length >= H.ui.poSize ? H.ui.poSize : 0
      const signed = (n) => (n > 0 ? `+${n}` : String(n))

      el.innerHTML = `
        <article class="card card--wide">
          <header class="card-head">
            <div>
              <h2 class="card-title">Clasificación</h2>
              <p class="card-sub">Temporada ${season.number} · ${
                total ? `${played}/${total} partidos jugados` : 'Sin calendario: genera las jornadas en Fixtures'
              }</p>
            </div>
            ${zone ? `<span class="legend"><span class="legend-dot"></span>Playoffs: ${zone} clasificados</span>` : ''}
          </header>
          <div class="table-wrap">
            <table class="data-table data-table--league">
              <thead>
                <tr>
                  <th scope="col" class="num"><abbr title="Posición">Pos</abbr></th>
                  <th scope="col" class="club">Club</th>
                  <th scope="col" class="num"><abbr title="Partidos jugados">PJ</abbr></th>
                  <th scope="col" class="num"><abbr title="Partidos ganados">PG</abbr></th>
                  <th scope="col" class="num"><abbr title="Partidos empatados">PE</abbr></th>
                  <th scope="col" class="num"><abbr title="Partidos perdidos">PP</abbr></th>
                  <th scope="col" class="num"><abbr title="Goles a favor">GF</abbr></th>
                  <th scope="col" class="num"><abbr title="Goles en contra">GC</abbr></th>
                  <th scope="col" class="num"><abbr title="Diferencia de goles">DG</abbr></th>
                  <th scope="col" class="num pts">Puntos</th>
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (r, i) => `
                  <tr class="${i === 0 ? 'is-champion' : i < zone ? 'is-zone' : 'is-out'}">
                    <td class="num pos">${i + 1}</td>
                    <th scope="row" class="club"><span class="club-cell">${crest(r.team.logo, 'sm', r.team.name)}<span>${esc(r.team.name)}</span></span></th>
                    <td class="num">${r.pj}</td>
                    <td class="num">${r.pg}</td>
                    <td class="num">${r.pe}</td>
                    <td class="num">${r.pp}</td>
                    <td class="num">${r.gf}</td>
                    <td class="num">${r.gc}</td>
                    <td class="num ${r.dg > 0 ? 'pos-val' : r.dg < 0 ? 'neg-val' : ''}">${signed(r.dg)}</td>
                    <td class="num pts">${r.pts}</td>
                  </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
          <p class="hint">Desempate: puntos, diferencia de goles, goles a favor y orden alfabético.</p>
        </article>`
    },
  })
})()
