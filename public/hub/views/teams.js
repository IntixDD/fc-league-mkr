;(() => {
  const H = window.Hub
  const { esc, crest } = H
  const MAX_TEAMS = 32
  const MODE_LABEL = { clubs: 'clubes', selections: 'selecciones', premier: 'Premier League', laliga: 'LaLiga' }
  const MODE_CATEGORIES = {
    clubs: ['custom', 'premier', 'laliga', 'other'],
    selections: ['selections'],
    premier: ['premier'],
    laliga: ['laliga'],
  }
  const SEASON_MODE_OPTIONS = [
    ['clubs', 'Clubes'],
    ['selections', 'Selecciones'],
    ['premier', 'Premier League'],
    ['laliga', 'LaLiga'],
  ]
  const RANDOM_CREST_MODES = {
    clubs: [
      { value: 'custom', label: 'Custom', categories: ['custom'] },
      { value: 'clubs', label: 'Clubes', categories: ['premier', 'laliga', 'other'] },
    ],
    selections: [{ value: 'selections', label: 'Selecciones', categories: ['selections'] }],
    premier: [{ value: 'premier', label: 'Premier League', categories: ['premier'] }],
    laliga: [{ value: 'laliga', label: 'LaLiga', categories: ['laliga'] }],
  }

  H.logoCategoryAllowed = (category, mode = 'clubs') => (MODE_CATEGORIES[mode] || []).includes(category || 'custom')

  H.validateSeasonCrests = (season = H.state?.current) => {
    if (!season) return false
    const invalid = season.teams.filter((team) => {
      const category = H.state.logos.find((logo) => logo.data === team.logo)?.category || 'custom'
      return !H.logoCategoryAllowed(category, season.seasonMode || 'clubs')
    })
    if (!invalid.length) return true
    const mode = MODE_LABEL[season.seasonMode || 'clubs'] || 'clubes'
    H.toast(`Modo ${mode}: no se puede crear la competición porque ${invalid.length === 1 ? `el escudo de ${invalid[0].name}` : `los escudos de ${invalid.length} equipos`} no corresponde. Clasifica los escudos en Teams y vuelve a intentarlo.`, 'error')
    return false
  }

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
    const mode = H.state.current.seasonMode || 'clubs'
    return openLogoDialog(title, H.state.logos.filter((logo) => H.logoCategoryAllowed(logo.category, mode)), {
      empty: 'Tu galería está vacía. Importa escudos desde el recuadro «Galería de escudos».',
    })
  }
  H.pickLogo = pickLogo

  function chooseRandomCrestMode(seasonMode) {
    const dlg = document.getElementById('logo-dialog')
    const grid = dlg.querySelector('[data-grid]')
    const title = dlg.querySelector('[data-title]')
    const modes = RANDOM_CREST_MODES[seasonMode] || []
    if (!modes.length) return Promise.resolve(null)
    title.textContent = 'Randomizar escudos'
    grid.innerHTML = `
      <div class="crest-randomize-picker">
        <p class="crest-randomize-prompt">Elige qué tipo de escudos asignar a los equipos registrados.</p>
        <div class="crest-randomize-options">
          ${modes.map((mode) => `<button class="btn btn--ghost" value="${mode.value}">${mode.label}</button>`).join('')}
        </div>
      </div>`
    dlg.returnValue = ''
    dlg.showModal()
    return new Promise((resolve) => {
      dlg.addEventListener('close', () => resolve(dlg.returnValue || null), { once: true })
    })
  }

  function randomizeTeamCrests(mode) {
    const teams = H.state.current.teams
    const seasonMode = H.state.current.seasonMode || 'clubs'
    const selectedMode = (RANDOM_CREST_MODES[seasonMode] || []).find((item) => item.value === mode)
    if (!selectedMode || !teams.length) return
    const uniqueCrests = [...new Set(H.state.logos
      .filter((logo) => selectedMode.categories.includes(logo.category || 'custom') && H.logoCategoryAllowed(logo.category, seasonMode))
      .map((logo) => logo.data)
      .filter(Boolean))]
    if (uniqueCrests.length < teams.length) {
      H.toast(`Hay ${uniqueCrests.length} escudo(s) de ${selectedMode.label}; se necesitan ${teams.length}. No se cambió ningún equipo.`, 'error')
      return
    }
    for (let i = uniqueCrests.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[uniqueCrests[i], uniqueCrests[j]] = [uniqueCrests[j], uniqueCrests[i]]
    }
    H.update((state) => state.current.teams.forEach((team, index) => { team.logo = uniqueCrests[index] }))
    H.toast('Escudos aleatorizados sin repetir')
  }

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
    document.dispatchEvent(new CustomEvent('league:brandlogochange', { detail: { logo: data || 'logo.svg' } }))
    H.toast(data ? 'Logo de la liga actualizado' : 'Logo original restaurado')
  }

  function downloadLogosJson() {
    const s = H.state
    const logos = []
    const known = new Set()
    const add = (data, id = logos.length, category = 'custom') => {
      if (typeof data !== 'string' || !data.startsWith('data:image/') || known.has(data)) return
      known.add(data)
      logos.push({ id, data, category })
    }
    s.logos.forEach((logo) => add(logo.data, logo.id, logo.category || 'custom'))
    s.current.teams.forEach((team) => add(team.logo))
    s.seasons.forEach((season) => (season.teams || []).forEach((team) => add(team.logo)))
    add(s.brandLogo)
    if (!logos.length) return H.toast('No hay escudos para descargar', 'error')
    const data = { format: 'league-hub-logo-library', version: 1, logos }
    H.downloadBlob('escudos-league-hub.json', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    H.toast(`${logos.length} escudo(s) descargados en JSON`)
  }

  async function handleFiles(files, selectLast, expectJson = false) {
    const list = [...files]
    const zips = list.filter(H.isZipFile)
    const jsonFiles = list.filter((f) => /\.json$/i.test(f.name) || /^(application|text)\/json$/i.test(f.type) || (expectJson && !H.isZipFile(f) && !f.type.startsWith('image/')))
    const images = list.filter((f) => f.type.startsWith('image/') || /\.svg$/i.test(f.name || ''))
    const ids = []
    for (const file of jsonFiles) {
      let parsed
      try {
        parsed = JSON.parse(await H.readFileText(file))
      } catch {
        H.toast(`${file.name || 'Archivo'}: no se pudo leer como JSON`, 'error')
        continue
      }
      const entries = Array.isArray(parsed) ? parsed : parsed?.logos
      const seasonList = Array.isArray(parsed?.seasons)
        ? parsed.seasons
        : Array.isArray(parsed)
          ? parsed.filter((item) => Array.isArray(item?.teams))
          : Array.isArray(parsed?.teams)
            ? [parsed]
            : parsed?.season && Array.isArray(parsed.season.teams)
              ? [parsed.season]
              : []
      const seasonLogoEntries = seasonList.flatMap((season) => (season.teams || [])
        .filter((team) => typeof team?.logo === 'string' && team.logo.startsWith('data:image/'))
        .map((team) => ({ data: team.logo, category: 'custom' })))
      const logoEntries = Array.isArray(entries) && entries.length ? entries : seasonLogoEntries
      if (!Array.isArray(entries)) {
        if (!logoEntries.length) {
          H.toast(`${file.name || 'Archivo'}: no contiene escudos ni temporadas con escudos`, 'error')
          continue
        }
      } else if (!logoEntries.length) {
        H.toast(`${file.name || 'Archivo'}: no contiene escudos compatibles`, 'error')
        continue
      }
      let imported = H.importLogoData(logoEntries)
      if (!imported.length && seasonLogoEntries.length && logoEntries !== seasonLogoEntries) imported = H.importLogoData(seasonLogoEntries)
      if (!imported.length) H.toast(`${file.name || 'Archivo'}: no contiene escudos compatibles`, 'error')
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
    if (!H.logoCategoryAllowed(logo.category, s.current.seasonMode || 'clubs')) return H.toast('El escudo no corresponde al modo de temporada elegido en Teams.', 'error')
    H.ui.teamDraft = ''
    H.ui.selectedLogo = null
    const created = { id: H.uid(), name: name.slice(0, 40), logo: logo.data }
    H.update((st) => {
      st.current.teams.push(created)
      if (st.current.tableConfig?.type === 'groups') {
        const target = st.current.tableConfig.groups.reduce((best, group) => group.length < best.length ? group : best, st.current.tableConfig.groups[0])
        target?.push(created.id)
      }
    })
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
      } else if (st.current.tableConfig?.type === 'groups') {
        st.current.tableConfig.groups.forEach((group) => { const index = group.indexOf(id); if (index >= 0) group.splice(index, 1) })
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

  function reorderTeam(id, targetId, after = false) {
    if (!id || !targetId || id === targetId) return
    H.update((st) => {
      const teams = st.current.teams
      const from = teams.findIndex((team) => team.id === id)
      let to = teams.findIndex((team) => team.id === targetId)
      if (from < 0 || to < 0) return
      const [team] = teams.splice(from, 1)
      if (from < to) to -= 1
      if (after) to += 1
      teams.splice(to, 0, team)
    })
  }

  function moveTeam(id, direction) {
    const teams = H.state.current.teams
    const index = teams.findIndex((team) => team.id === id)
    const next = index + direction
    if (index < 0 || next < 0 || next >= teams.length) return
    H.update((st) => {
      const [team] = st.current.teams.splice(index, 1)
      st.current.teams.splice(next, 0, team)
    })
  }

  async function clearLogos() {
    if (!H.state.logos.length) return
    if (!(await H.confirm('Se vaciará la galería. Los equipos conservarán sus escudos actuales.', { confirmText: 'Vaciar' }))) return
    H.ui.selectedLogo = null
    H.update((st) => { st.logos = []; st.logoGalleryManual = true })
  }

  const fileButton = (label, mode, cls = 'btn btn--ghost', accept = 'image/*') =>
    `<button type="button" class="${cls}" data-pick="${mode}" data-accept="${mode === 'json' ? '*/*' : esc(accept)}" aria-label="${esc(label)}">${label}</button>`

  let pickBusy = false
  async function pickLogos(mode, accept) {
    if (pickBusy) return
    const files = await H.pickFiles({ accept: accept || 'image/*', multiple: mode !== 'json' })
    if (!files.length) return
    pickBusy = true
    H.toast(`Leyendo ${files.length === 1 ? (files[0].name || 'archivo') : `${files.length} archivos`}…`)
    try {
      await handleFiles(files, mode === 'select', mode === 'json')
    } catch (error) {
      H.toast(`No se pudo importar el archivo: ${error?.message || 'error de lectura'}`, 'error')
    } finally {
      pickBusy = false
    }
  }

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
        if (e.target.matches('[data-team-season-mode]')) {
          const mode = e.target.value
          if (!Object.prototype.hasOwnProperty.call(MODE_CATEGORIES, mode)) return
          H.update((state) => { state.current.seasonMode = mode })
          H.toast(`Modo de temporada: ${MODE_LABEL[mode]}`)
          return
        }
        if (e.target.matches('[data-selected-logo-category]')) {
          const id = e.target.dataset.selectedLogoCategory
          const category = e.target.value
          H.update((state) => { const logo = state.logos.find((item) => String(item.id) === id); if (logo) logo.category = category })
          return
        }
      })
      el.addEventListener('click', async (e) => {
        const pick = e.target.closest('[data-pick]')
        if (pick) { pickLogos(pick.dataset.pick, pick.dataset.accept); return }
        const btn = e.target.closest('[data-action]')
        if (!btn) return
        const { action, id } = btn.dataset
        if (action === 'select-logo') {
          H.ui.selectedLogo = String(H.ui.selectedLogo) === id ? null : id
          H.render()
        } else if (action === 'change-selected-category') {
          const picker = btn.parentElement.querySelector('[data-selected-logo-category]')
          if (picker) {
            btn.hidden = true
            picker.hidden = false
            picker.focus()
            picker.showPicker?.()
          }
        } else if (action === 'pick-logo') {
          const logo = await pickLogo()
          if (logo) {
            H.ui.selectedLogo = logo.id
            H.render()
          }
        } else if (action === 'delete-logo') {
          if (String(H.ui.selectedLogo) === id) H.ui.selectedLogo = null
          H.update((st) => { st.logoGalleryManual = true; st.logos = st.logos.filter((l) => String(l.id) !== id).map((logo, index) => ({ ...logo, id: index })) })
        } else if (action === 'clear-logos') clearLogos()
        else if (action === 'export-json-logos') downloadLogosJson()
        else if (action === 'delete-team') deleteTeam(id)
        else if (action === 'change-logo') changeLogo(id)
        else if (action === 'move-team-up') moveTeam(id, -1)
        else if (action === 'move-team-down') moveTeam(id, 1)
        else if (action === 'clear-teams') clearTeams()
        else if (action === 'randomize-team-crests') {
          const mode = await chooseRandomCrestMode(H.state.current.seasonMode || 'clubs')
          if (mode) randomizeTeamCrests(mode)
        }
      })
      let draggedTeamId = null
      el.addEventListener('dragstart', (e) => {
        const row = e.target.closest('.team-row[data-team-row]')
        if (!row) return
        draggedTeamId = row.dataset.teamRow
        row.classList.add('is-dragging')
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', draggedTeamId)
      })
      el.addEventListener('dragend', () => {
        draggedTeamId = null
        el.querySelectorAll('.team-row.is-dragging,.team-row.is-drop-target').forEach((row) => row.classList.remove('is-dragging', 'is-drop-target'))
      })
      el.addEventListener('dragover', (e) => {
        const row = e.target.closest('.team-row[data-team-row]')
        if (!row || !draggedTeamId || row.dataset.teamRow === draggedTeamId) return
        e.preventDefault()
        row.classList.add('is-drop-target')
      })
      el.addEventListener('dragleave', (e) => {
        const row = e.target.closest('.team-row[data-team-row]')
        if (row && !row.contains(e.relatedTarget)) row.classList.remove('is-drop-target')
      })
      el.addEventListener('drop', (e) => {
        const row = e.target.closest('.team-row[data-team-row]')
        if (!row || !draggedTeamId) return
        e.preventDefault()
        const after = e.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2
        reorderTeam(draggedTeamId, row.dataset.teamRow, after)
        draggedTeamId = null
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
      const categoryName = { custom: 'Custom', selections: 'Selecciones', premier: 'Premier League', laliga: 'LaLiga', other: 'Otras ligas' }
      const seasonMode = s.current.seasonMode || 'clubs'
      const filteredLogos = s.logos.filter((logo) => H.logoCategoryAllowed(logo.category, seasonMode))
      const roster = `
        <section class="team-roster" aria-label="Equipos registrados">
          <header class="team-roster-head">
            <div><h3>Equipos registrados</h3><span>${teams.length} ${teams.length === 1 ? 'club' : 'clubes'} · arrastra para reordenar</span></div>
            ${teams.length ? `<div class="team-roster-actions"><button class="btn btn--ghost btn--sm" data-action="randomize-team-crests">Randomizar escudos</button><button class="btn btn--danger btn--sm" data-action="clear-teams">Eliminar todos</button></div>` : ''}
          </header>
          ${teams.length
            ? `<ul class="team-list">${teams.map((t, i) => `
                <li class="team-row" data-team-row="${esc(t.id)}" draggable="true">
                  <span class="team-drag-handle" aria-hidden="true">⠿</span>
                  <span class="team-index">${i + 1}</span>
                  ${crest(t.logo, 'md', t.name)}
                  <span class="team-name">${esc(t.name)}</span>
                  <span class="team-order-actions">
                    <button class="btn btn--ghost btn--sm" data-action="move-team-up" data-id="${esc(t.id)}" aria-label="Subir ${esc(t.name)}" title="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
                    <button class="btn btn--ghost btn--sm" data-action="move-team-down" data-id="${esc(t.id)}" aria-label="Bajar ${esc(t.name)}" title="Bajar" ${i === teams.length - 1 ? 'disabled' : ''}>↓</button>
                  </span>
                  <span class="team-actions">
                    <button class="btn btn--ghost btn--sm" data-action="change-logo" data-id="${esc(t.id)}">Escudo</button>
                    <button class="btn btn--danger btn--sm" data-action="delete-team" data-id="${esc(t.id)}" aria-label="Eliminar ${esc(t.name)}">Eliminar</button>
                  </span>
                </li>`).join('')}</ul>`
            : '<p class="team-roster-empty">Aún no hay equipos. Registra tu primer club arriba para empezar a llenar la plantilla.</p>'}
        </section>`

      const register = `
        <article class="card teams-register-card">
          <header class="card-head">
            <div>
              <h2 class="card-title">Registrar club</h2>
              <p class="card-sub">Temporada ${s.current.number} · ${teams.length}/${MAX_TEAMS} equipos</p>
            </div>
            <label class="field team-season-mode">
              <span class="field-label">Modo de temporada</span>
              <select class="input" data-team-season-mode aria-label="Modo de temporada">
                ${SEASON_MODE_OPTIONS.map(([value, label]) => `<option value="${value}" ${seasonMode === value ? 'selected' : ''}>${label}</option>`).join('')}
              </select>
            </label>
          </header>
          <form class="register" data-form="team" novalidate>
            <button type="button" class="crest-picker" data-action="pick-logo" aria-label="Elegir escudo de la galería">
              ${selected && filteredLogos.some((l) => l.id === selected.id) ? `<img src="${esc(selected.data)}" alt="">` : '<span class="crest-picker-empty">Escudo*</span>'}
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
          ${roster}
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
                    ${selected ? `<span class="gallery-category-action"><button class="btn btn--ghost btn--sm" data-action="change-selected-category">Cambiar categoría</button><select class="input gallery-category-picker" data-selected-logo-category="${esc(selected.id)}" aria-label="Nueva categoría para el escudo seleccionado" hidden>${Object.entries(categoryName).map(([value, label]) => `<option value="${value}" ${(selected.category || 'custom') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></span>` : ''}
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
              ? `<div class="logo-category-groups">${['custom', 'selections', 'premier', 'laliga', 'other'].map((category) => { const logos = s.logos.filter((logo) => (logo.category || 'custom') === category); return logos.length ? `<section class="logo-category"><h3>${categoryName[category]}</h3><div class="logo-grid">${logos.map((l) => `
                <div class="logo-tile-wrap">
                  <button class="logo-tile${String(l.id) === String(H.ui.selectedLogo) ? ' is-selected' : ''}" data-action="select-logo" data-id="${esc(l.id)}" aria-pressed="${String(l.id) === String(H.ui.selectedLogo)}" aria-label="Seleccionar escudo"><img src="${esc(l.data)}" alt="" loading="lazy"></button>
                  <button class="logo-remove" data-action="delete-logo" data-id="${esc(l.id)}" aria-label="Quitar escudo de la galería">&times;</button>
                </div>`).join('')}</div></section>` : '' }).join('')}</div>`
              : '<p class="empty">Aún no hay escudos. Importa PNG, JPG, SVG o WEBP, un JSON de escudos o arrastra un ZIP antiguo.</p>'
          }
        </article>`

      el.innerHTML = `<div class="panel-grid panel-grid--even teams-page-grid">${register}${gallery}</div>`
    },
  })
})()
