;(() => {
  const H = window.Hub
  const { esc } = H

  const COLS = [
    { key: 'cups', label: 'Copas', title: 'Campeón de playoffs' },
    { key: 'leagues', label: 'Ligas', title: 'Campeón de liga' },
    { key: 'runnerUp', label: 'Subcamp.', title: 'Subcampeonatos (Playoffs)' },
    { key: 'third', label: '3ros', title: '3er lugar (Playoffs)' },
    { key: 'fourth', label: '4tos', title: '4to lugar (Playoffs)' },
    { key: 'leagueGoals', label: 'GF Liga', title: 'Goles a favor en liga' },
    { key: 'cupGoals', label: 'GF Camp.', title: 'Goles a favor en campeonatos (playoffs)' },
    { key: 'goals', label: 'Goles', title: 'Goles totales' },
    { key: 'points', label: 'Puntos', title: 'Puntos totales (solo liga)' },
  ]
  const TIEBREAK = ['cups', 'leagues', 'runnerUp', 'third', 'fourth', 'points', 'goals']

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
        if (e.target.name === 'history-sort') {
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
        const d = (a.t[sortKey] - b.t[sortKey]) * dir
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
              <p class="card-sub">${seasons.length} temporada(s) · las estadísticas se acumulan por nombre de club</p>
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
      applyQuery(el)
    },
  })
})()
