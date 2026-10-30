;(() => {
  const H = window.Hub
  const { esc, crest } = H
  const MAX_TEAMS = 32

  function openLogoDialog(title, logos, { empty, selected = null, extra = null } = {}) {
    const dlg = document.getElementById('logo-dialog')
    const grid = dlg.querySelector('[data-grid]')
    const actions = dlg.querySelector('.dialog-actions')
    dlg.querySelector('[data-title]').textContent = title
    grid.innerHTML = logos.length
      ? logos
          .map(
            (l) =>
              `<button class="logo-tile${l.data === selected ? ' is-selected' : ''}" value="${esc(l.id)}" aria-label="Usar este escudo"><img src="${esc(l.data)}" alt=""></button>`,
          )
          .join('')
      : `<p class="empty">${empty}</p>`
    let extraBtn = null
    if (extra) {
      extraBtn = document.createElement('button')
      extraBtn.className = 'btn btn--ghost'
      extraBtn.value = extra.value
      extraBtn.textContent = extra.label
      actions.prepend(extraBtn)
    }
    dlg.returnValue = ''
    dlg.showModal()
    return new Promise((resolve) => {
      dlg.addEventListener(
        'close',
        () => {
          extraBtn?.remove()
          const value = dlg.returnValue
          resolve(extra && value === extra.value ? extra.value : logos.find((l) => String(l.id) === value) || null)
        },
        { once: true },
      )
    })
  }

  function pickLogo(title = 'Elegir escudo') {
    return openLogoDialog(title, H.state.logos, {
      empty: 'Tu galería está vacía. Importa escudos desde el recuadro «Galería de escudos».',
    })
  }
  H.pickLogo = pickLogo

  function allLoadedLogos(s) {
    const seen = new Set()
    const out = []
    const add = (data) => {
      if (!data || seen.has(data)) return
      seen.add(data)
      out.push({ id: `b${out.length}`, data })
    }
    s.logos.forEach((l) => add(l.data))
    s.current.teams.forEach((t) => add(t.logo))
    s.seasons.forEach((season) => (season.teams || []).forEach((t) => add(t.logo)))
    return out
  }

  const RESET_BRAND = '__default'

  H.pickBrand = async () => {
    const s = H.state
    if (!s) return
    const result = await openLogoDialog('Logo de la liga', allLoadedLogos(s), {
      empty: 'Aún no hay escudos cargados. Importa escudos o registra equipos en «Teams».',
      selected: s.brandLogo,
      extra: s.brandLogo ? { value: RESET_BRAND, label: 'Restaurar original' } : null,
    })
    if (!result) return
    const data = result === RESET_BRAND ? null : result.data
    H.update((st) => (st.brandLogo = data))
    H.toast(data ? 'Logo de la liga actualizado' : 'Logo original restaurado')
  }

  function downloadLogosJson() {
    const s = H.state
    const logos = []
    const known = new Set()
    const add = (data, id = logos.length) => {
      if (typeof data !== 'string' || !data.startsWith('data:image/') || known.has(data)) return
      known.add(data)
      logos.push({ id, data })
    }
    s.logos.forEach((logo) => add(logo.data, logo.id))
    s.current.teams.forEach((team) => add(team.logo))
    s.seasons.forEach((season) => (season.teams || []).forEach((team) => add(team.logo)))
    add(s.brandLogo)
    if (!logos.length) return H.toast('No hay escudos para descargar', 'error')
    const data = { format: 'league-hub-logo-library', version: 1, logos }
    H.downloadBlob('escudos-league-hub.json', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    H.toast(`${logos.length} escudo(s) descargados en JSON`)
  }

  async function handleFiles(files, selectLast) {
    const list = [...files]
    const zips = list.filter(H.isZipFile)
    const jsonFiles = list.filter((f) => /\.json$/i.test(f.name) || f.type === 'application/json')
    const images = list.filter((f) => f.type.startsWith('image/'))
    const ids = []
    for (const file of jsonFiles) {
      let parsed
      try {
        parsed = JSON.parse(await file.text())
      } catch {
        H.toast(`${file.name}: el archivo no es un JSON válido`, 'error')
        continue
      }
      const entries = Array.isArray(parsed) ? parsed : parsed?.logos
      if (!Array.isArray(entries)) {
        H.toast(`${file.name}: no contiene una galería de escudos`, 'error')
        continue
      }
      const imported = H.importLogoData(entries)
      if (!imported.length) H.toast(`${file.name}: no contiene escudos compatibles`, 'error')
      ids.push(...imported)
    }
    for (const zip of zips) {
      try {
        H.toast(`Leyendo ZIP antiguo ${zip.name}…`)
        const found = await H.unzipImages(zip)
        if (!found.length) H.toast(`${zip.name} no contiene imágenes`, 'error')
        images.push(...found)
      } catch (err) {
        H.toast(`${zip.name}: ${err.message}`, 'error')
      }
    }
    if (images.length) ids.push(...await H.importLogos(images))
    if (!ids.length) return
    if (selectLast || H.ui.selectedLogo == null) H.ui.selectedLogo = ids[ids.length - 1]
    H.toast(ids.length === 1 ? 'Escudo guardado en la galería' : `${ids.length} escudos guardados en la galería`)
    H.render()
  }

  function addTeam() {
    const s = H.state
    const name = H.ui.teamDraft.trim().replace(/\s+/g, ' ')
    if (!name) return H.toast('Escribe el nombre del club', 'error')
    if (s.current.teams.length >= MAX_TEAMS) return H.toast(`Máximo ${MAX_TEAMS} equipos por temporada`, 'error')
    if (s.current.teams.some((t) => H.norm(t.name) === H.norm(name)))
      return H.toast('Ya existe un club con ese nombre', 'error')
    const logo = s.logos.find((l) => String(l.id) === String(H.ui.selectedLogo))
    if (!logo) return H.toast('Selecciona un escudo para el club', 'error')
    H.ui.teamDraft = ''
    H.ui.selectedLogo = null
    H.update((st) => st.current.teams.push({ id: H.uid(), name: name.slice(0, 40), logo: logo.data }))
    H.toast(`${name} registrado`)
  }

  const resetsCompetition = (s) => !!(s.current.fixtures || s.current.playoffs)

  async function deleteTeam(id) {
    const s = H.state
    const team = s.current.teams.find((t) => t.id === id)
    if (!team) return
    const extra = resetsCompetition(s) ? ' El calendario y el cuadro Tournament de esta temporada se reiniciarán.' : ''
    if (!(await H.confirm(`Se eliminará «${team.name}».${extra}`, { confirmText: 'Eliminar' }))) return
    H.update((st) => {
      st.current.teams = st.current.teams.filter((t) => t.id !== id)
      if (st.current.tableConfig?.type === 'two-series') {
        st.current.tableConfig.series1 = st.current.tableConfig.series1.filter((teamId) => teamId !== id)
        st.current.tableConfig.series2 = st.current.tableConfig.series2.filter((teamId) => teamId !== id)
      }
      if (extra) {
        st.current.fixtures = null
        st.current.playoffs = null
      }
    })
    H.toast(`${team.name} eliminado`)
  }

  async function clearTeams() {
    const s = H.state
    if (!s.current.teams.length) return
    const extra = resetsCompetition(s) ? ' También se borrarán el calendario y el cuadro Tournament.' : ''
    if (!(await H.confirm(`Se eliminarán los ${s.current.teams.length} equipos registrados.${extra}`, { confirmText: 'Eliminar todos' })))
      return
    H.update((st) => {
      st.current.teams = []
      st.current.fixtures = null
      st.current.playoffs = null
      st.current.tableConfig = null
    })
    H.toast('Equipos eliminados')
  }

  async function changeLogo(id) {
    const team = H.state.current.teams.find((t) => t.id === id)
    if (!team) return
    const logo = await pickLogo(`Nuevo escudo para ${team.name}`)
    if (!logo) return
    H.update((st) => {
      const t = st.current.teams.find((x) => x.id === id)
      if (t) t.logo = logo.data
    })
    H.toast(`Escudo de ${team.name} actualizado`)
  }

  async function clearLogos() {
    if (!H.state.logos.length) return
    if (!(await H.confirm('Se vaciará la galería. Los equipos conservarán sus escudos actuales.', { confirmText: 'Vaciar' }))) return
    H.ui.selectedLogo = null
    H.update((st) => (st.logos = []))
  }

  const fileButton = (label, mode, cls = 'btn btn--ghost', accept = 'image/*') =>
    `<label class="${cls} file-btn">
      <input type="file" accept="${accept}" multiple class="sr-only" data-logo-input="${mode}">
      ${label}
    </label>`

  H.view('teams', {
    bind(el) {
      el.addEventListener('input', (e) => {
        if (e.target.name === 'team-name') H.ui.teamDraft = e.target.value
      })
      el.addEventListener('submit', (e) => {
        if (!e.target.matches('[data-form="team"]')) return
        e.preventDefault()
        addTeam()
      })
      el.addEventListener('change', (e) => {
        const input = e.target.closest('[data-logo-input]')
        if (!input) return
        const files = [...input.files]
        input.value = ''
        if (files.length) handleFiles(files, input.dataset.logoInput === 'select')
      })
      el.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]')
        if (!btn) return
        const { action, id } = btn.dataset
        if (action === 'select-logo') {
          H.ui.selectedLogo = String(H.ui.selectedLogo) === id ? null : id
          H.render()
        } else if (action === 'pick-logo') {
          const logo = await pickLogo()
          if (logo) {
            H.ui.selectedLogo = logo.id
            H.render()
          }
        } else if (action === 'delete-logo') {
          if (String(H.ui.selectedLogo) === id) H.ui.selectedLogo = null
          H.update((st) => (st.logos = st.logos.filter((l) => String(l.id) !== id).map((logo, index) => ({ ...logo, id: index }))))
        } else if (action === 'clear-logos') clearLogos()
        else if (action === 'export-json-logos') downloadLogosJson()
        else if (action === 'delete-team') deleteTeam(id)
        else if (action === 'change-logo') changeLogo(id)
        else if (action === 'clear-teams') clearTeams()
      })
      el.addEventListener('dragover', (e) => {
        const zone = e.target.closest('.dropzone')
        if (!zone) return
        e.preventDefault()
        zone.classList.add('is-over')
      })
      el.addEventListener('dragleave', (e) => {
        const zone = e.target.closest('.dropzone')
        if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('is-over')
      })
      el.addEventListener('drop', (e) => {
        const zone = e.target.closest('.dropzone')
        if (!zone) return
        e.preventDefault()
        zone.classList.remove('is-over')
        if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files, false)
      })
    },

    render(el, s) {
      const selected = s.logos.find((l) => String(l.id) === String(H.ui.selectedLogo))
      const teams = s.current.teams

      const register = `
        <article class="card">
          <header class="card-head">
            <div>
              <h2 class="card-title">Registrar club</h2>
              <p class="card-sub">Temporada ${s.current.number} · ${teams.length}/${MAX_TEAMS} equipos</p>
            </div>
          </header>
          <form class="register" data-form="team" novalidate>
            <button type="button" class="crest-picker" data-action="pick-logo" aria-label="Elegir escudo de la galería">
              ${selected ? `<img src="${esc(selected.data)}" alt="">` : '<span class="crest-picker-empty">Escudo*</span>'}
            </button>
            <div class="register-fields">
              <label class="field">
                <span class="field-label">Nombre*</span>
                <input class="input" name="team-name" data-key="team-name" maxlength="40" autocomplete="off"
                  placeholder="Ej. Atlético Neón" value="${esc(H.ui.teamDraft)}" required>
              </label>
              <div class="row-actions">
                <button type="button" class="btn btn--ghost" data-action="pick-logo">Elegir de la galería</button>
                ${fileButton('Subir escudo', 'select')}
              </div>
            </div>
            <button type="submit" class="btn btn--primary register-submit">Registrar</button>
          </form>
          <p class="hint">* Campos obligatorios. El escudo se toma de tu galería.</p>
        </article>`

      const gallery = `
        <article class="card">
          <header class="card-head">
            <div>
              <h2 class="card-title">Galería de escudos</h2>
              <p class="card-sub">${s.logos.length} guardados</p>
            </div>
            ${
              s.logos.length || teams.length
                ? `<div class="row-actions row-actions--tight">
                    <button class="btn btn--ghost btn--sm" data-action="export-json-logos">Descargar JSON</button>
                    ${s.logos.length ? '<button class="btn btn--ghost btn--sm" data-action="clear-logos">Vaciar</button>' : ''}
                  </div>`
                : ''
            }
          </header>
          <div class="dropzone">
            <p>Arrastra imágenes, un JSON de escudos o un ZIP antiguo aquí o</p>
            <div class="row-actions row-actions--tight">
              ${fileButton('Importar imágenes', 'gallery', 'btn btn--primary btn--sm')}
              ${fileButton('Importar JSON', 'json', 'btn btn--ghost btn--sm', '.json,application/json')}
            </div>
          </div>
          ${
            s.logos.length
              ? `<div class="logo-grid">${s.logos
                  .map(
                    (l) => `
                <div class="logo-tile-wrap">
                    <button class="logo-tile${String(l.id) === String(H.ui.selectedLogo) ? ' is-selected' : ''}" data-action="select-logo"
                    data-id="${esc(l.id)}" aria-pressed="${String(l.id) === String(H.ui.selectedLogo)}" aria-label="Seleccionar escudo">
                    <img src="${esc(l.data)}" alt="" loading="lazy">
                  </button>
                  <button class="logo-remove" data-action="delete-logo" data-id="${esc(l.id)}" aria-label="Quitar escudo de la galería">&times;</button>
                </div>`,
                  )
                  .join('')}</div>`
              : '<p class="empty">Aún no hay escudos. Importa PNG, JPG, SVG o WEBP, un JSON de escudos o arrastra un ZIP antiguo.</p>'
          }
        </article>`

      const list = `
        <article class="card card--wide">
          <header class="card-head">
            <div>
              <h2 class="card-title">Equipos registrados</h2>
              <p class="card-sub">${teams.length} ${teams.length === 1 ? 'club' : 'clubes'}</p>
            </div>
            ${teams.length ? '<button class="btn btn--danger btn--sm" data-action="clear-teams">Eliminar todos</button>' : ''}
          </header>
          ${
            teams.length
              ? `<ul class="team-list">${teams
                  .map(
                    (t, i) => `
                <li class="team-row">
                  <span class="team-index">${i + 1}</span>
                  ${crest(t.logo, 'md', t.name)}
                  <span class="team-name">${esc(t.name)}</span>
                  <span class="team-actions">
                    <button class="btn btn--ghost btn--sm" data-action="change-logo" data-id="${esc(t.id)}">Escudo</button>
                    <button class="btn btn--danger btn--sm" data-action="delete-team" data-id="${esc(t.id)}" aria-label="Eliminar ${esc(t.name)}">Eliminar</button>
                  </span>
                </li>`,
                  )
                  .join('')}</ul>`
              : '<p class="empty">Registra tu primer club con nombre y escudo.</p>'
          }
        </article>`

      el.innerHTML = `<div class="panel-grid panel-grid--even">${register}${gallery}${list}</div>`
    },
  })
})()
