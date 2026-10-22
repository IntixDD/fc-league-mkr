;(() => {
  const H = window.Hub
  const { esc, crest } = H

  const nextNumber = (s) => Math.max(0, s.current.number, ...s.seasons.map((x) => x.number)) + 1

  function summary(season) {
    const stats = H.seasonStats(season)
    const find = (prop) => stats.find((x) => x[prop])
    return { league: find('leagueChampion'), cup: find('cupChampion') }
  }

  function save() {
    const s = H.state
    const cur = s.current
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
    if (!(await guardDirty())) return
    const saved = H.state.seasons.find((x) => x.id === id)
    if (!saved) return
    H.ui.round = 0
    H.ui.fxMode = null
    H.update((st) => (st.current = H.clone(saved)))
    H.toast(`Editando Temporada ${saved.number}`)
  }

  async function remove(id) {
    const saved = H.state.seasons.find((x) => x.id === id)
    if (!saved) return
    if (!(await H.confirm(`Se eliminará la Temporada ${saved.number} y sus estadísticas del historial.`, { confirmText: 'Eliminar' }))) return
    H.update((st) => {
      st.seasons = st.seasons.filter((x) => x.id !== id)
      if (st.current.id === id) st.current.id = null
    })
    H.toast(`Temporada ${saved.number} eliminada`)
  }

  async function removeAll() {
    if (!H.state.seasons.length) return
    if (!(await H.confirm('Se eliminarán todas las temporadas guardadas y el historial.', { confirmText: 'Eliminar todas' }))) return
    H.update((st) => {
      st.seasons = []
      st.current.id = null
    })
  }

  const payload = (seasons) => ({ app: H.APP_ID, version: 1, exportedAt: new Date().toISOString(), seasons: H.clone(seasons) })

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
    const seasons = list.map((raw) => H.sanitizeSeason(raw && { ...raw, id: raw.id || H.uid() })).filter(Boolean)
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
        else if (t.name === 'season-number') {
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
              <p class="card-sub"><span class="badge ${statusCls}">${status}</span></p>
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
              <div><dt>Playoffs</dt><dd>${cur.playoffs ? `Top ${cur.playoffs.size}` : '—'}</dd></div>
            </dl>
          </div>
          ${sum.league || sum.cup ? `<p class="hint">${sum.league ? `Liga: <strong>${esc(sum.league.name)}</strong>` : ''}${sum.league && sum.cup ? ' · ' : ''}${sum.cup ? `Copa: <strong>${esc(sum.cup.name)}</strong>` : ''}</p>` : ''}
          <div class="row-actions">
            <button class="btn btn--primary" data-action="save">${cur.id ? 'Guardar cambios' : 'Guardar temporada'}</button>
            <button class="btn btn--ghost" data-action="new">Nueva temporada</button>
          </div>
          <label class="check">
            <input type="checkbox" name="keep-teams" ${H.ui.newKeepTeams ? 'checked' : ''}>
            <span>Conservar los clubes en la nueva temporada</span>
          </label>
        </article>`

      const io = `
        <article class="card">
          <header class="card-head"><div><h2 class="card-title">Importar / Exportar</h2><p class="card-sub">Archivos .json con temporadas y escudos</p></div></header>
          <div class="row-actions">
            <label class="btn btn--primary file-btn">
              <input type="file" accept="application/json,.json" class="sr-only" data-import>
              Importar .json
            </label>
            <button class="btn btn--ghost" data-action="export-all" ${s.seasons.length ? '' : 'disabled'}>Exportar todas</button>
          </div>
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
                    const sm = summary(season)
                    const open = season.id === cur.id
                    return `
                  <li class="season-row${open ? ' is-open' : ''}">
                    <span class="season-num">T${season.number}</span>
                    <div class="season-info">
                      <span class="season-title">Temporada ${season.number}${open ? ' <span class="badge badge--accent">Abierta</span>' : ''}</span>
                      <span class="season-meta">${season.teams.length} equipos${season.savedAt ? ` · ${new Date(season.savedAt).toLocaleDateString('es')}` : ''}</span>
                    </div>
                    <div class="season-champs">
                      ${sm.league ? `<span class="champ" title="Campeón de liga">${crest(sm.league.logo, 'sm', sm.league.name)}<span>Liga</span></span>` : ''}
                      ${sm.cup ? `<span class="champ" title="Campeón de copa">${crest(sm.cup.logo, 'sm', sm.cup.name)}<span>Copa</span></span>` : ''}
                    </div>
                    <div class="team-actions">
                      <button class="btn btn--ghost btn--sm" data-action="edit" data-id="${esc(season.id)}" ${open ? 'disabled' : ''}>Editar</button>
                      <button class="btn btn--ghost btn--sm" data-action="export" data-id="${esc(season.id)}">Exportar</button>
                      <button class="btn btn--danger btn--sm" data-action="delete" data-id="${esc(season.id)}" aria-label="Eliminar Temporada ${season.number}">Eliminar</button>
                    </div>
                  </li>`
                  })
                  .join('')}</ul>`
              : '<p class="empty">Aún no guardaste ninguna temporada.</p>'
          }
        </article>`

      el.innerHTML = `<div class="panel-grid">${current}${io}${list}</div>`
    },
  })
})()
