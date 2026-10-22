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

  H.view('table', {
    bind(el) {
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]')
        if (!btn) return
        if (btn.dataset.action === 'toggle-edit') {
          H.ui.tableEdit = !H.ui.tableEdit
          H.render()
        } else if (btn.dataset.action === 'reset-manual') resetManual()
      })
      el.addEventListener('input', (e) => {
        const input = e.target.closest('[data-field]')
        if (!input) return
        let row
        H.update((s) => (row = setField(s.current, input.dataset.team, input.dataset.field, input.value)), { skip: 'table' })
        paintRow(input.closest('tr'), row)
      })
      el.addEventListener('change', (e) => {
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
        el.innerHTML = `<article class="card"><p class="empty">Registra equipos en <a href="#teams">Teams</a> para ver la tabla.</p></article>`
        return
      }
      const manual = H.isManualTable(season)
      const editing = manual && H.ui.tableEdit
      const rows = H.computeTable(season)
      const { total, played } = H.stageCounts(season)
      const n = season.teams.length
      const zone = season.playoffs
        ? season.playoffs.size
        : n >= H.ui.poSize
          ? H.ui.poSize
          : [16, 8, 4].find((size) => size <= n) || 0
      const stage = STAGE[zone]
      const signed = (v) => (v > 0 ? `+${v}` : String(v))
      const rowClass = (i) => (i === 0 ? 'is-winner' : i < zone ? 'is-zone' : zone ? 'is-out' : '')
      const rowLabel = (i) =>
        i === 0 ? 'Líder de la liga' : i < zone ? `Clasifica a ${stage}` : zone ? 'Eliminado' : ''

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

      const tools = manual
        ? `<div class="table-tools" data-export-hide>
            <button class="btn ${editing ? 'btn--primary' : 'btn--ghost'} btn--sm" data-action="toggle-edit" aria-pressed="${editing}">
              ${editing ? 'Listo' : 'Editar tabla'}
            </button>
            ${season.manual ? '<button class="btn btn--danger btn--sm" data-action="reset-manual">Reiniciar</button>' : ''}
          </div>`
        : ''

      el.innerHTML = `
        <article class="card card--wide" id="table-export">
          <header class="card-head">
            <div>
              <h2 class="card-title">Clasificación</h2>
              <p class="card-sub">Temporada ${season.number} · ${sub}</p>
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
                  <label class="check check--inline">
                    <input type="checkbox" name="manual-finished" ${season.manual?.finished ? 'checked' : ''}>
                    Liga finalizada (el 1.º es campeón)
                  </label>
                </div>`
              : ''
          }
          <ul class="legend-list" aria-label="Leyenda de posiciones">
            <li class="legend"><span class="legend-dot legend-dot--win"></span>Ganador</li>
            ${
              zone
                ? `<li class="legend"><span class="legend-dot legend-dot--po"></span>Playoffs · ${stage} (${zone > 1 ? `2.º–${zone}.º` : ''})</li>
                   ${n > zone ? `<li class="legend"><span class="legend-dot legend-dot--out"></span>Eliminados (${n - zone})</li>` : ''}`
                : ''
            }
          </ul>
          <div class="table-wrap">
            <table class="data-table data-table--league${editing ? ' is-editing' : ''}">
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
                  <tr class="${rowClass(i)}">
                    <td class="num pos"${rowLabel(i) ? ` title="${rowLabel(i)}"` : ''}><span class="pos-num">${i + 1}</span></td>
                    <th scope="row" class="club"><span class="club-cell">${crest(r.team.logo, 'sm', r.team.name)}<span>${esc(r.team.name)}</span></span></th>
                    <td class="num" data-cell="pj">${r.pj}</td>
                    ${EDIT_FIELDS.slice(0, 5).map((f) => cell(r, f, LABELS[f])).join('')}
                    <td class="num ${r.dg > 0 ? 'pos-val' : r.dg < 0 ? 'neg-val' : ''}" data-cell="dg">${signed(r.dg)}</td>
                    ${cell(r, 'pts', LABELS.pts)}
                  </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
          <p class="hint">${
            manual
              ? 'Desempate: puntos, diferencia de goles, goles a favor y orden alfabético. La tabla se reordena al salir de cada casilla.'
              : 'Desempate: puntos, diferencia de goles, goles a favor y orden alfabético. Se calcula con los resultados de Fixtures.'
          }</p>
        </article>`
    },
  })
})()
