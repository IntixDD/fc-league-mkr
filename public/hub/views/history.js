;(() => {
  const H = window.Hub
  const { esc, crest } = H

  const COLS = [
    { key: 'cups', label: 'Copas', title: 'Campeón de Tournament' },
    { key: 'leagues', label: 'Ligas', title: 'Campeón de liga' },
    { key: 'series', label: 'Series', title: 'Campeón de Serie' },
    { key: 'runnerUp', label: 'Subcamp.', title: 'Subcampeonatos (Tournament)' },
    { key: 'third', label: '3ros', title: '3er lugar (Tournament)' },
    { key: 'fourth', label: '4tos', title: '4to lugar (Tournament)' },
    { key: 'leagueGoals', label: 'GF Liga', title: 'Goles a favor en liga' },
    { key: 'cupGoals', label: 'GF Camp.', title: 'Goles a favor en campeonatos (Tournament)' },
    { key: 'goals', label: 'Goles', title: 'Goles totales' },
    { key: 'points', label: 'Puntos', title: 'Puntos totales (solo liga)' },
  ]
  const TIEBREAK = ['cups', 'leagues', 'series', 'runnerUp', 'third', 'fourth', 'points', 'goals']
  let compareTeams = ['', '']

  function selectedTeams(records) {
    const keys = records.map((record) => record.key)
    const first = keys.includes(compareTeams[0]) ? compareTeams[0] : keys[0]
    const second = keys.includes(compareTeams[1]) && compareTeams[1] !== first ? compareTeams[1] : keys.find((key) => key !== first) || ''
    compareTeams = [first || '', second]
    return compareTeams.map((key) => records.find((record) => record.key === key)).filter(Boolean)
  }

  function compareCard(records) {
    if (records.length < 2) {
      return `<article class="card card--wide compare-card"><header class="card-head"><h2 class="card-title">Compare</h2></header><p class="empty">Necesitas al menos dos clubes para compararlos.</p></article>`
    }
    const [teamA, teamB] = selectedTeams(records)
    const matches = teamA.seasons
      .flatMap((season) => season.matches
        .filter((match) => H.norm(match.opp) === teamB.key)
        .map((match) => ({ ...match, teamName: season.name, logo: season.logo })),
      )
      .sort((a, b) => b.season - a.season)
    const winsA = matches.filter((match) => match.gf > match.ga).length
    const draws = matches.filter((match) => match.gf === match.ga).length
    const winsB = matches.filter((match) => match.gf < match.ga).length
    const total = matches.length
    const pct = (value) => total ? `${(value / total) * 100}%` : '0%'
    const select = (team, index) => `
      <label class="field">
        <span class="field-label">Equipo ${index + 1}</span>
        <select class="input" name="compare-team" data-compare-index="${index}">
          ${records.map((record) => `<option value="${esc(record.key)}" ${record.key === team.key ? 'selected' : ''} ${record.key === compareTeams[1 - index] ? 'disabled' : ''}>${esc(record.name)}</option>`).join('')}
        </select>
      </label>`
    const cards = matches.map((match) => `
      <article class="feat-match">
        <h3 class="feat-title">Enfrentamiento</h3>
        <div class="feat-score">
          <span class="feat-team">${crest(match.logo, 'md', match.teamName)}<span>${esc(match.teamName)}</span></span>
          <span class="feat-result">${match.gf} - ${match.ga}</span>
          <span class="feat-team">${crest(match.oppLogo, 'md', match.opp)}<span>${esc(match.opp)}</span></span>
        </div>
        ${match.pens ? `<p class="feat-pens">Penales ${esc(match.pens)}</p>` : ''}
        <p class="feat-when">${esc(match.label)}</p>
      </article>`).join('')

    return `
      <article class="card card--wide compare-card" id="history-compare-export">
        <header class="card-head">
          <h2 class="card-title">Compare</h2>
          ${H.exportButton('#history-compare-export', 'compare')}
        </header>
        <div class="compare-pickers">${select(teamA, 0)}${select(teamB, 1)}</div>
        <section class="compare-summary" aria-label="Victorias, empates y victorias">
          <div class="compare-summary-teams">
            <div class="compare-summary-team">${crest(teamA.logos[0], 'md', teamA.name)}<strong>${esc(teamA.name)}</strong><span>${winsA} victorias</span></div>
            <div class="compare-summary-score"><strong>${winsA} - ${draws} - ${winsB}</strong><span>Victorias · Empates · Victorias</span></div>
            <div class="compare-summary-team">${crest(teamB.logos[0], 'md', teamB.name)}<strong>${esc(teamB.name)}</strong><span>${winsB} victorias</span></div>
          </div>
          <div class="compare-bar" role="img" aria-label="${esc(teamA.name)} ${winsA} victorias, ${draws} empates, ${winsB} victorias ${esc(teamB.name)}">
            <span class="compare-bar-a" style="width:${pct(winsA)}"></span>
            <span class="compare-bar-draw" style="width:${pct(draws)}"></span>
            <span class="compare-bar-b" style="width:${pct(winsB)}"></span>
          </div>
          <p class="compare-total">${total} partido(s) disputado(s)</p>
        </section>
        <section class="compare-matches">
          <header class="compare-matches-head"><h3 class="card-title">Todos los enfrentamientos</h3><span>${total} partido(s)</span></header>
          ${total ? `<div class="feat-grid">${cards}</div>` : `<p class="empty">Todavía no hay partidos disputados entre ${esc(teamA.name)} y ${esc(teamB.name)}.</p>`}
        </section>
      </article>`
  }

  function applyQuery(el) {
    const q = H.norm(H.ui.historyQuery || '')
    el.querySelectorAll('tbody tr[data-name]').forEach((tr) => (tr.hidden = !!q && !tr.dataset.name.includes(q)))
  }

  H.view('history', {
    bind(el) {
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-sort]')
        if (!btn) return
        const key = btn.dataset.sort
        if (H.ui.historySort === key) H.ui.historyDir = H.ui.historyDir === 'desc' ? 'asc' : 'desc'
        else {
          H.ui.historySort = key
          H.ui.historyDir = 'desc'
        }
        H.render()
      })
      el.addEventListener('change', (e) => {
        if (e.target.name === 'compare-team') {
          const index = Number(e.target.dataset.compareIndex)
          compareTeams[index] = e.target.value
          if (compareTeams[index] === compareTeams[1 - index]) {
            const next = H.teamRecords().find((record) => record.key !== compareTeams[index])
            compareTeams[1 - index] = next?.key || ''
          }
          H.render()
        } else if (e.target.name === 'history-sort') {
          H.ui.historySort = e.target.value
          H.render()
        } else if (e.target.name === 'history-dir') {
          H.ui.historyDir = e.target.value
          H.render()
        }
      })
      el.addEventListener('input', (e) => {
        if (e.target.name !== 'history-query') return
        H.ui.historyQuery = e.target.value
        applyQuery(el)
      })
    },

    render(el) {
      const records = H.teamRecords().map((r) => ({ ...r, t: H.teamTotals(r) }))
      const seasons = H.statSeasons()
      if (!records.length) {
        el.innerHTML = `<article class="card"><p class="empty">El historial se construye con las temporadas guardadas en <a href="#seasons">Seasons</a> y la temporada en curso.</p></article>`
        return
      }
      const sortKey = H.ui.historySort
      const dir = H.ui.historyDir === 'asc' ? 1 : -1
      records.sort((a, b) => {
        const primary = sortKey === 'neutral' ? 'cups' : sortKey
        const d = (a.t[primary] - b.t[primary]) * dir
        if (d) return d
        for (const k of TIEBREAK) if (b.t[k] !== a.t[k]) return b.t[k] - a.t[k]
        return a.name.localeCompare(b.name)
      })

      const head = COLS.map((c) => {
        const active = c.key === sortKey
        const aria = active ? (dir === 1 ? 'ascending' : 'descending') : 'none'
        const st = H.STAT_STYLE[c.key]
        return `<th scope="col" class="num ${st.cls}" aria-sort="${aria}"><button class="sort-btn${active ? ' is-active' : ''}" data-sort="${c.key}" title="${c.title}">${H.ICONS[st.icon]}<span>${c.label}</span><span class="sort-arrow" aria-hidden="true">${active ? (dir === 1 ? '↑' : '↓') : ''}</span></button></th>`
      }).join('')

      el.innerHTML = `
        <article class="card card--wide" id="history-export">
          <header class="card-head">
            <div>
              <h2 class="card-title">Historial de clubes</h2>
              <p class="card-sub">${seasons.length} temporada(s)</p>
            </div>
            <div class="row-actions">${H.exportButton('#history-export', 'historial')}</div>
          </header>
          <div class="filters" data-export-hide>
            <label class="field field--inline">
              <span class="field-label">Buscar</span>
              <input class="input" type="search" name="history-query" data-key="history-query" placeholder="Nombre del club" value="${esc(H.ui.historyQuery || '')}" autocomplete="off">
            </label>
            <label class="field field--inline">
              <span class="field-label">Filtrar por</span>
              <select class="input" name="history-sort">
                <option value="neutral" ${sortKey === 'neutral' ? 'selected' : ''}>General</option>
                ${COLS.map((c) => `<option value="${c.key}" ${c.key === sortKey ? 'selected' : ''}>${c.title}</option>`).join('')}
              </select>
            </label>
            <label class="field field--inline">
              <span class="field-label">Orden</span>
              <select class="input" name="history-dir">
                <option value="desc" ${dir === -1 ? 'selected' : ''}>Mayor a menor</option>
                <option value="asc" ${dir === 1 ? 'selected' : ''}>Menor a mayor</option>
              </select>
            </label>
          </div>
          <div class="table-wrap">
            <table class="data-table data-table--history">
              <thead><tr><th scope="col" class="num">Pos</th><th scope="col" class="club">Club</th>${head}</tr></thead>
              <tbody>
                ${records
                  .map(
                    (r, i) => `
                  <tr data-name="${esc(r.key)}">
                    <td class="num pos${i < 3 ? ` pos-top pos-${i + 1}` : ''}"><span class="pos-badge">${i + 1}</span></td>
                    <th scope="row" class="club">
                      <span class="history-club">
                        <span class="history-name">${esc(r.name)}</span>
                        <span class="logo-strip">${r.logos.map((l) => `<span class="crest crest--xs"><img src="${esc(l)}" alt="" loading="lazy"></span>`).join('')}</span>
                      </span>
                    </th>
                    ${COLS.map((c) => `<td class="num ${H.STAT_STYLE[c.key].cls}${c.key === sortKey ? ' is-sorted' : ''}${r.t[c.key] ? '' : ' is-zero'}">${r.t[c.key]}</td>`).join('')}
                  </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
          <p class="hint" data-export-hide>Haz clic en el encabezado de una columna para ordenar por esa categoría.</p>
        </article>`
      el.insertAdjacentHTML('beforeend', compareCard(records))
      applyQuery(el)
    },
  })
})()
