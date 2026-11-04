;(() => {
  const H = window.Hub
  const { esc, crest } = H
  const STAGE = { 4: 'Semifinales', 8: 'Cuartos', 16: 'Octavos' }
  const EDIT_FIELDS = ['pg', 'pe', 'pp', 'gf', 'gc', 'pts']
  const autoPts = (r) => r.pg * 3 + r.pe

  function ensureRow(season, id) {
    season.manual ||= { rows: {}, finished: false }
    return (season.manual.rows[id] ||= { pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, pts: 0, ptsManual: false })
  }

  function setField(season, id, field, raw) {
    const row = ensureRow(season, id)
    if (field === 'pts') {
      row.ptsManual = raw !== ''
      row.pts = row.ptsManual ? H.toInt(raw, -99, 999) : autoPts(row)
    } else {
      row[field] = H.toInt(raw, 0, 999)
      if (!row.ptsManual) row.pts = autoPts(row)
    }
    return row
  }

  function paintRow(tr, row) {
    const set = (sel, v) => {
      const cell = tr.querySelector(sel)
      if (cell) cell.textContent = v
    }
    set('[data-cell="pj"]', row.pg + row.pe + row.pp)
    const dg = row.gf - row.gc
    const dgCell = tr.querySelector('[data-cell="dg"]')
    if (dgCell) {
      dgCell.textContent = dg > 0 ? `+${dg}` : String(dg)
      dgCell.classList.toggle('pos-val', dg > 0)
      dgCell.classList.toggle('neg-val', dg < 0)
    }
    const pts = tr.querySelector('[data-field="pts"]')
    if (pts && !row.ptsManual && document.activeElement !== pts) pts.value = row.pts
  }

  async function resetManual() {
    if (!(await H.confirm('Se borrarán todos los datos cargados manualmente en la tabla.', { confirmText: 'Reiniciar' }))) return
    H.update((s) => (s.current.manual = null))
  }

  function shuffle(ids) {
    const values = [...ids]
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[values[i], values[j]] = [values[j], values[i]]
    }
    return values
  }

  async function allowCompetitionReset() {
    const season = H.state.current
    if (!season.fixtures && !season.playoffs) return true
    return H.confirm('Cambiar el formato de la tabla reiniciará el calendario, sus resultados y el cuadro Tournament.', { confirmText: 'Cambiar formato' })
  }

  H.view('table', {
    bind(el) {
      el.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]')
        if (!btn) return
        if (btn.dataset.action === 'toggle-edit') {
          H.ui.tableEdit = !H.ui.tableEdit
          H.render()
        } else if (btn.dataset.action === 'reset-manual') resetManual()
        else if (btn.dataset.action === 'create-table') {
          const format = el.querySelector('[name="table-format"]')?.value
          const currentType = H.state.current.tableConfig?.type || 'regular'
          const targetType = format === 'groups' ? 'groups' : format
          if (targetType === currentType && (targetType !== 'groups' || Number(el.querySelector('[name="group-count"]')?.value) === H.state.current.tableConfig?.count)) return
          if (!H.validateSeasonCrests?.()) return
          if (!(await allowCompetitionReset())) return
          if (format === 'two-series') {
            const prior = H.state.current.tableConfig
            H.update((s) => {
              s.current.tableConfig = prior?.type === 'two-series' ? prior : { type: 'two-series', series1: [], series2: [] }
              s.current.fixtures = null
              s.current.playoffs = null
            })
          } else if (format === 'groups') {
            const count = Number(el.querySelector('[name="group-count"]')?.value) || 4
            const ids = shuffle(H.state.current.teams.map((t) => t.id))
            if (ids.length < count * 2) return H.toast(`Registra al menos ${count * 2} equipos para crear ${count} grupos.`, 'error')
            const groups = Array.from({ length: count }, () => [])
            ids.forEach((id, index) => groups[index % count].push(id))
            H.ui.poSize = count * 2
            H.update((s) => { s.current.tableConfig = { type: 'groups', count, groups }; s.current.fixtures = null; s.current.playoffs = null })
          } else H.update((s) => { s.current.tableConfig = null; s.current.fixtures = null; s.current.playoffs = null })
        } else if (btn.dataset.action === 'random-series') {
          if (!H.validateSeasonCrests?.()) return
          const ids = shuffle(H.state.current.teams.map((t) => t.id))
          if (ids.length < 4) return H.toast('Registra al menos 4 equipos para crear dos series.', 'error')
          const split = Math.ceil(ids.length / 2)
          if (!(await allowCompetitionReset())) return
          H.update((s) => { s.current.tableConfig = { type: 'two-series', series1: ids.slice(0, split), series2: ids.slice(split) }; s.current.fixtures = null; s.current.playoffs = null })
        } else if (btn.dataset.action === 'save-series') {
          if (!H.validateSeasonCrests?.()) return
          const first = [...el.querySelectorAll('[data-team-series="1"]')].filter((x) => x.checked).map((x) => x.value)
          const second = [...el.querySelectorAll('[data-team-series="2"]')].filter((x) => x.checked).map((x) => x.value)
          if (first.length < 2 || second.length < 2 || first.length + second.length !== H.state.current.teams.length) return H.toast('Asigna todos los equipos a una sola serie (mínimo 2 por serie).', 'error')
          const prior = H.state.current.tableConfig
          const changed = prior?.type !== 'two-series' || first.some((id) => !prior.series1.includes(id)) || second.some((id) => !prior.series2.includes(id))
          if (changed && !(await allowCompetitionReset())) return
          H.update((s) => { s.current.tableConfig = { type: 'two-series', series1: first, series2: second }; if (changed) { s.current.fixtures = null; s.current.playoffs = null } })
        } else if (btn.dataset.action === 'save-groups') {
          const config = H.state.current.tableConfig
          if (config?.type !== 'groups') return
          if (!H.validateSeasonCrests?.()) return
          const groups = Array.from({ length: config.count }, () => [])
          el.querySelectorAll('[data-team-group]').forEach((select) => groups[Number(select.value)]?.push(select.dataset.team))
          if (groups.some((group) => group.length < 2) || new Set(groups.flat()).size !== H.state.current.teams.length) return H.toast('Asigna todos los equipos y deja al menos 2 en cada grupo.', 'error')
          const changed = groups.some((group, index) => group.length !== config.groups[index].length || group.some((id) => !config.groups[index].includes(id)))
          if (changed && !(await allowCompetitionReset())) return
          H.update((s) => { s.current.tableConfig = { type: 'groups', count: groups.length, groups }; if (changed) { s.current.fixtures = null; s.current.playoffs = null } })
          H.toast(changed ? 'Asignación de grupos guardada' : 'Los grupos no cambiaron')
        }
      })
      el.addEventListener('input', (e) => {
        const input = e.target.closest('[data-field]')
        if (!input) return
        let row
        H.update((s) => (row = setField(s.current, input.dataset.team, input.dataset.field, input.value)), { skip: 'table' })
        paintRow(input.closest('tr'), row)
      })
      el.addEventListener('change', (e) => {
        if (e.target.name === 'table-repechage') {
          H.ui.repechageEnabled = e.target.checked
          H.render()
          return
        }
        if (e.target.name === 'table-format') {
          const twoSeries = H.state.current.tableConfig?.type === 'two-series'
          const groups = H.state.current.tableConfig?.type === 'groups'
          const selected = e.target.value
          const groupCountField = el.querySelector('[name="group-count"]')?.closest('.field')
          groupCountField?.classList.toggle('groups-count-field', selected !== 'groups')
          const create = el.querySelector('[data-action="create-table"]')
          if (create) {
            const alreadyActive = selected === (groups ? 'groups' : twoSeries ? 'two-series' : 'regular')
            create.disabled = alreadyActive
            create.textContent = alreadyActive ? (groups ? `${H.state.current.tableConfig.count} grupos activos` : twoSeries ? 'Tabla de 2 series activa' : 'Tabla regular activa') : `Crear ${selected === 'groups' ? 'fase de grupos' : selected === 'two-series' ? 'tabla de 2 series' : 'tabla regular'}`
          }
          return
        }
        if (e.target.name === 'season-mode') {
          H.update((s) => { s.current.seasonMode = e.target.value })
          return
        }
        if (e.target.name === 'group-count') {
          const select = el.querySelector('[name="table-format"]')
          if (select?.value === 'groups') {
            const create = el.querySelector('[data-action="create-table"]')
            if (create) {
              const config = H.state.current.tableConfig
              const same = config?.type === 'groups' && config.count === Number(e.target.value)
              create.disabled = !!same
              create.textContent = same ? `${e.target.value} grupos activos` : `Crear fase de ${e.target.value} grupos`
            }
          }
          return
        }
        const assignment = e.target.closest('[data-team-series]')
        if (assignment?.checked) {
          const other = assignment.dataset.teamSeries === '1' ? '2' : '1'
          const otherChoice = el.querySelector(`[data-team-series="${other}"][value="${CSS.escape(assignment.value)}"]`)
          if (otherChoice) otherChoice.checked = false
          return
        }
        if (e.target.closest('[data-field]')) return H.render()
        if (e.target.name === 'manual-finished') {
          const checked = e.target.checked
          H.update((s) => {
            s.current.manual ||= { rows: {}, finished: false }
            s.current.manual.finished = checked
          })
        }
      })
    },

    render(el, s) {
      const season = s.current
      if (!season.teams.length) {
        const modes = [['clubs', 'Modo clubes'], ['selections', 'Modo selecciones'], ['premier', 'Modo Premier'], ['laliga', 'Modo LaLiga']]
        el.innerHTML = `<article class="card"><header class="card-head"><h2 class="card-title">Modo de temporada</h2></header><label class="field"><span class="field-label">Escudos permitidos al registrar</span><select class="input" name="season-mode">${modes.map(([value, label]) => `<option value="${value}" ${(season.seasonMode || 'clubs') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><p class="hint">${season.seasonMode === 'selections' ? 'Solo podrás usar escudos de Selecciones.' : season.seasonMode === 'premier' ? 'Solo podrás usar escudos de Premier League.' : season.seasonMode === 'laliga' ? 'Solo podrás usar escudos de LaLiga.' : 'Los escudos de selecciones quedan deshabilitados.'}</p><p class="empty">Registra equipos en <a href="#teams">Teams</a> para crear la tabla.</p></article>`
        return
      }
      const manual = H.isManualTable(season)
      const editing = manual && H.ui.tableEdit
      const rows = H.computeTable(season)
      const groupStage = season.tableConfig?.type === 'groups'
      const twoSeries = season.tableConfig?.type === 'two-series' || groupStage
      const competitionGroups = groupStage ? season.tableConfig.groups : twoSeries ? [season.tableConfig.series1, season.tableConfig.series2] : []
      const seriesReady = twoSeries && competitionGroups.length >= 2 && competitionGroups.every((group) => group.length >= 2) && new Set(competitionGroups.flat()).size === season.teams.length
      const { total, played } = H.stageCounts(season)
      const n = season.teams.length
      const zone = season.playoffs
        ? season.playoffs.size
        : n >= H.ui.poSize
          ? H.ui.poSize
          : [16, 8, 4].find((size) => size <= n) || 0
      const stage = STAGE[zone]
      const availableForTournament = groupStage ? Math.floor(n / season.tableConfig.count) * season.tableConfig.count : twoSeries ? 2 * Math.min(season.tableConfig.series1.length, season.tableConfig.series2.length) : n
      const configuredTournamentSize = season.playoffs?.size || (twoSeries
        ? H.ui.poSize || [16, 8, 4].find((size) => size <= availableForTournament) || 0
        : zone || H.ui.poSize)
      const repechageMatches = configuredTournamentSize ? (twoSeries && configuredTournamentSize === 4 ? 2 : configuredTournamentSize / 4) : 0
      const directPerSeries = twoSeries ? configuredTournamentSize / 2 - repechageMatches / 2 : 0
      const directCount = configuredTournamentSize - repechageMatches
      const repechageEligible = groupStage ? false : twoSeries
        ? season.tableConfig.series1.length >= directPerSeries + repechageMatches && season.tableConfig.series2.length >= directPerSeries + repechageMatches
        : n >= configuredTournamentSize + repechageMatches
      const repechageEnabled = !groupStage && (season.playoffs
        ? !!season.playoffs.repechage?.enabled
        : !!H.ui.repechageEnabled && repechageEligible)
      const rowZone = groupStage
        ? 2
        : twoSeries
        ? repechageEnabled ? directPerSeries + repechageMatches : Math.floor(configuredTournamentSize / 2)
        : repechageEnabled ? configuredTournamentSize + repechageMatches : zone
      const directZone = groupStage ? rowZone : repechageEnabled ? (twoSeries ? directPerSeries : directCount) : rowZone
      const classifiedCount = groupStage
        ? competitionGroups.reduce((sum, group) => sum + Math.min(2, group.length), 0)
        : rowZone * (twoSeries ? 2 : 1)
      const signed = (v) => (v > 0 ? `+${v}` : String(v))
      const rowClass = (i) => (i === 0 ? 'is-winner' : i < directZone ? 'is-zone' : i < rowZone ? repechageEnabled ? 'is-repechage' : 'is-zone' : rowZone ? 'is-out' : '')
      const rowLabel = (i) => groupStage
        ? i === 0 ? 'Campeón de grupo' : i < rowZone ? 'Clasifica a Tournament' : 'Eliminado'
        : i === 0 ? (twoSeries ? 'Líder de la serie' : 'Líder de la liga') : repechageEnabled && i < rowZone
          ? twoSeries
            ? i < directPerSeries ? 'Clasifica directo a Tournament' : 'Juega repechaje'
            : i < directCount ? 'Clasifica directo a Tournament' : 'Juega repechaje'
          : i < rowZone ? `Clasifica a ${stage}` : rowZone ? 'Eliminado' : ''

      const sub = manual
        ? `Tabla manual${season.manual?.finished ? ' · liga finalizada' : ''}`
        : total
          ? `${played}/${total} partidos jugados`
          : 'Sin calendario'

      const cell = (r, field, label) => {
        if (!editing) return `<td class="num${field === 'pts' ? ' pts' : ''}">${r[field]}</td>`
        const manualRow = season.manual?.rows?.[r.team.id]
        const value = field === 'pts' && manualRow && !manualRow.ptsManual ? '' : r[field]
        return `<td class="num${field === 'pts' ? ' pts' : ''}">
          <input class="cell-input" type="number" inputmode="numeric" min="${field === 'pts' ? -99 : 0}" max="999"
            value="${value}" ${field === 'pts' ? `placeholder="${r.pts}"` : ''}
            data-key="tb:${esc(r.team.id)}:${field}" data-team="${esc(r.team.id)}" data-field="${field}"
            aria-label="${label} de ${esc(r.team.name)}">
        </td>`
      }

      const LABELS = { pg: 'Partidos ganados', pe: 'Partidos empatados', pp: 'Partidos perdidos', gf: 'Goles a favor', gc: 'Goles en contra', pts: 'Puntos' }

      const tableMarkup = (tableRows) => `<div class="table-wrap">
        <table class="data-table data-table--league${editing ? ' is-editing' : ''}">
          <thead><tr><th scope="col" class="num"><abbr title="Posición">Pos</abbr></th><th scope="col" class="club">Club</th><th scope="col" class="num"><abbr title="Partidos jugados">PJ</abbr></th><th scope="col" class="num"><abbr title="Partidos ganados">PG</abbr></th><th scope="col" class="num"><abbr title="Partidos empatados">PE</abbr></th><th scope="col" class="num"><abbr title="Partidos perdidos">PP</abbr></th><th scope="col" class="num"><abbr title="Goles a favor">GF</abbr></th><th scope="col" class="num"><abbr title="Goles en contra">GC</abbr></th><th scope="col" class="num"><abbr title="Diferencia de goles">DG</abbr></th><th scope="col" class="num pts">Puntos</th></tr></thead>
          <tbody>${tableRows.map((r, i) => `<tr class="${rowClass(i)}"><td class="num pos"${rowLabel(i) ? ` title="${rowLabel(i)}"` : ''}><span class="pos-num">${i + 1}</span></td><th scope="row" class="club"><span class="club-cell">${crest(r.team.logo, 'sm', r.team.name)}<span>${esc(r.team.name)}</span></span></th><td class="num" data-cell="pj">${r.pj}</td>${EDIT_FIELDS.slice(0, 5).map((f) => cell(r, f, LABELS[f])).join('')}<td class="num ${r.dg > 0 ? 'pos-val' : r.dg < 0 ? 'neg-val' : ''}" data-cell="dg">${signed(r.dg)}</td>${cell(r, 'pts', LABELS.pts)}</tr>`).join('')}</tbody>
        </table>
      </div>`

      const repechageMinimum = twoSeries
        ? `${directPerSeries + repechageMatches} equipos por serie`
        : `${configuredTournamentSize + repechageMatches} equipos`
      const repechageHelp = season.playoffs
        ? 'El cuadro actual ya está creado. Para cambiar este formato, recrea Tournament.'
        : groupStage
          ? 'No disponible durante la fase de grupos.'
          : `Mínimo ${repechageMinimum} para usar repechajes.`
      const modes = [['clubs', 'Modo clubes'], ['selections', 'Modo selecciones'], ['premier', 'Modo Premier'], ['laliga', 'Modo LaLiga']]
      const tableSetup = `<article class="card card--wide table-setup-card" data-export-hide>
        <header class="card-head"><h2 class="card-title">Crear tabla</h2></header>
        <div class="row-actions table-options"><label class="field"><span class="field-label">Modo de temporada</span><select class="input" name="season-mode">${modes.map(([value, label]) => `<option value="${value}" ${(season.seasonMode || 'clubs') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="field"><span class="field-label">Formato</span><select class="input table-format" id="table-format" name="table-format"><option value="regular" ${!twoSeries ? 'selected' : ''}>Tabla regular</option><option value="two-series" ${season.tableConfig?.type === 'two-series' ? 'selected' : ''}>2 Series</option><option value="groups" ${groupStage ? 'selected' : ''}>Fase de grupos</option></select></label><label class="field${groupStage ? '' : ' groups-count-field'}"><span class="field-label">Cantidad de grupos</span><select class="input" name="group-count"><option value="4" ${(season.tableConfig?.count || 4) === 4 ? 'selected' : ''}>4 grupos</option><option value="8" ${season.tableConfig?.count === 8 ? 'selected' : ''}>8 grupos</option></select></label><button class="btn btn--primary" data-action="create-table" ${(!groupStage && !twoSeries) ? 'disabled' : ''}>${groupStage ? `${season.tableConfig.count} grupos activos` : twoSeries ? 'Tabla de 2 series activa' : 'Tabla regular activa'}</button><label class="series-choice table-option-toggle"><input type="checkbox" name="table-repechage" ${repechageEnabled ? 'checked' : ''} ${!repechageEligible || season.playoffs ? 'disabled' : ''}><span class="table-option-copy"><strong>Usar repechajes en Tournament</strong><small>${repechageHelp}</small></span></label>${manual ? `<label class="series-choice table-option-toggle"><input type="checkbox" name="manual-finished" ${season.manual?.finished ? 'checked' : ''}><span class="table-option-copy"><strong>Liga finalizada</strong><small>El primer puesto será el campeón.</small></span></label>` : ''}</div>
        ${twoSeries && !groupStage ? `<p class="hint">Asigna cada equipo a una serie. Los partidos de liga se jugarán solo entre equipos de la misma serie.</p><div class="team-series-list">${season.teams.map((t) => `<div class="team-series-row"><span class="club-cell">${crest(t.logo, 'xs', t.name)}<span>${esc(t.name)}</span></span><label class="series-choice"><input type="checkbox" value="${esc(t.id)}" data-team-series="1" ${season.tableConfig.series1.includes(t.id) ? 'checked' : ''}> Serie 1</label><label class="series-choice"><input type="checkbox" value="${esc(t.id)}" data-team-series="2" ${season.tableConfig.series2.includes(t.id) ? 'checked' : ''}> Serie 2</label></div>`).join('')}</div><div class="row-actions"><button class="btn btn--ghost" data-action="random-series">Randomizar equipos</button><button class="btn btn--primary" data-action="save-series">Guardar series</button></div><p class="hint">Las series pueden tener tamaños distintos.${seriesReady ? '' : ' Asigna al menos 2 equipos a cada serie y guarda antes de generar el calendario.'}</p>` : ''}
        ${groupStage ? `<p class="hint">Asigna cada equipo a un grupo. Los dos primeros de cada grupo clasifican a Tournament.</p><div class="team-series-list group-assignment-list">${season.teams.map((team) => { const selectedGroup = competitionGroups.findIndex((group) => group.includes(team.id)); return `<div class="team-series-row"><span class="club-cell">${crest(team.logo, 'xs', team.name)}<span>${esc(team.name)}</span></span><label class="field field--inline"><span class="field-label">Grupo</span><select class="input" data-team-group data-team="${esc(team.id)}">${competitionGroups.map((_, index) => `<option value="${index}" ${index === selectedGroup ? 'selected' : ''}>Grupo ${String.fromCharCode(65 + index)}</option>`).join('')}</select></label></div>` }).join('')}</div><div class="row-actions"><button class="btn btn--primary" data-action="save-groups">Guardar grupos</button></div>` : ''}
      </article>`

      const tools = manual
        ? `<div class="table-tools" data-export-hide>
            <button class="btn ${editing ? 'btn--primary' : 'btn--ghost'} btn--sm" data-action="toggle-edit" aria-pressed="${editing}">
              ${editing ? 'Listo' : 'Editar tabla'}
            </button>
            ${season.manual ? '<button class="btn btn--danger btn--sm" data-action="reset-manual">Reiniciar</button>' : ''}
          </div>`
        : ''

      const seriesTables = groupStage
        ? competitionGroups.map((group, index) => `<section class="card card--wide"><header class="card-head"><div><h3 class="card-title">Grupo ${String.fromCharCode(65 + index)}</h3><p class="card-sub card-sub--meta">${group.length} equipos</p></div></header>${tableMarkup(H.computeTable(season, group))}</section>`).join('')
        : twoSeries ? `<section class="card card--wide"><header class="card-head"><div><h3 class="card-title">Serie 1</h3><p class="card-sub card-sub--meta">${season.tableConfig.series1.length} equipos</p></div></header>${tableMarkup(H.computeTable(season, season.tableConfig.series1))}</section><section class="card card--wide"><header class="card-head"><div><h3 class="card-title">Serie 2</h3><p class="card-sub card-sub--meta">${season.tableConfig.series2.length} equipos</p></div></header>${tableMarkup(H.computeTable(season, season.tableConfig.series2))}</section>`
        : tableMarkup(rows)
      el.innerHTML = `<article class="card card--wide" id="table-export">
          <header class="card-head">
            <div>
              <h2 class="card-title">Clasificación</h2>
              <p class="card-sub card-sub--meta">Temporada ${season.number} · ${sub}</p>
            </div>
            <div class="row-actions">
              ${tools}
              ${H.exportButton('#table-export', 'tabla')}
            </div>
          </header>
          ${
            manual
              ? `<div class="manual-bar" data-export-hide>
                  <p class="hint">No generaste un calendario: puedes cargar los datos de cada equipo a mano. Los puntos se calculan solos (3 por victoria, 1 por empate) salvo que escribas otro valor.</p>
                </div>`
              : ''
          }
          <ul class="legend-list" aria-label="Leyenda de posiciones">
            <li class="legend"><span class="legend-dot legend-dot--win"></span>Ganador</li>
            ${
              zone
                ? `<li class="legend"><span class="legend-dot legend-dot--po"></span>${groupStage ? 'Tournament · primeros 2 de cada grupo' : repechageEnabled ? twoSeries ? `Tournament · ${directPerSeries} directos + ${repechageMatches} repechaje por serie` : `Tournament · ${directCount} directos + ${repechageMatches * 2} en repechaje` : twoSeries ? `Tournament · primeros ${rowZone} de cada serie` : `Tournament · ${stage} (${zone > 1 ? `2.º–${zone}.º` : ''})`}</li>
                   ${repechageEnabled ? '<li class="legend"><span class="legend-dot legend-dot--repechage"></span>Repechaje</li>' : ''}
                   ${n > classifiedCount ? `<li class="legend"><span class="legend-dot legend-dot--out"></span>Eliminados (${n - classifiedCount})</li>` : ''}`
                : ''
            }
          </ul>
          ${twoSeries || groupStage ? `<div class="table-subtables${groupStage ? ' is-groups' : ' is-series'}">${seriesTables}</div>` : seriesTables}
          <p class="hint">${
            manual
              ? 'Desempate: puntos, diferencia de goles, goles a favor y orden alfabético. La tabla se reordena al salir de cada casilla.'
              : 'Desempate: puntos, diferencia de goles, goles a favor y orden alfabético. Se calcula con los resultados de Fixtures.'
          }</p>
        </article>${tableSetup}`
    },
  })
})()
