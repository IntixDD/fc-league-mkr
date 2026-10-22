;(() => {
  const H = window.Hub
  const { esc, crest } = H
  const SIZES = [
    { size: 4, label: 'Semifinales' },
    { size: 8, label: 'Cuartos de final' },
    { size: 16, label: 'Octavos de final' },
  ]

  async function generate() {
    const season = H.state.current
    const size = H.ui.poSize
    if (season.teams.length < size) return H.toast(`Necesitas al menos ${size} equipos`, 'error')
    if (season.playoffs && Object.keys(season.playoffs.results).length) {
      if (!(await H.confirm('Se creará un nuevo cuadro con la clasificación actual y se perderán los resultados de playoffs.', { confirmText: 'Crear' })))
        return
    }
    const seeds = H.computeTable(season).slice(0, size).map((r) => r.team.id)
    H.update((s) => (s.current.playoffs = { size, seeds, results: {} }))
    H.toast('Cuadro de playoffs creado')
  }

  async function remove() {
    if (!(await H.confirm('Se eliminará el cuadro de playoffs y sus resultados.', { confirmText: 'Eliminar' }))) return
    H.update((s) => (s.current.playoffs = null))
  }

  H.view('playoffs', {
    bind(el) {
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]')
        if (!btn) return
        const { action } = btn.dataset
        if (action === 'size') {
          H.ui.poSize = Number(btn.dataset.size)
          H.render()
        } else if (action === 'generate') generate()
        else if (action === 'remove') remove()
      })
      el.addEventListener('input', (e) => {
        const input = e.target.closest('[data-po]')
        if (!input) return
        const { po: key, pair, field } = input.dataset
        const value = H.parseScore(input.value)
        H.update(
          (s) => {
            const results = s.current.playoffs.results
            const prev = results[key]
            const r = prev && prev.pair === pair ? prev : { pair, hg: null, ag: null, hp: null, ap: null }
            r[field] = value
            results[key] = r
          },
          { skip: 'playoffs' },
        )
      })
      el.addEventListener('change', (e) => {
        if (e.target.closest('[data-po]')) H.render()
      })
    },

    render(el, s) {
      const season = s.current
      const n = season.teams.length
      const po = season.playoffs
      if (po) H.ui.poSize = po.size
      const teams = new Map(season.teams.map((t) => [t.id, t]))
      const { total, played } = H.stageCounts(season)

      const config = `
        <article class="card">
          <header class="card-head">
            <div>
              <h2 class="card-title">Crear cuadro</h2>
              <p class="card-sub">1º vs último clasificado, 2º vs penúltimo…</p>
            </div>
          </header>
          <div class="seg seg--wrap" role="group" aria-label="Ronda inicial">
            ${SIZES.map(
              (o) =>
                `<button class="seg-btn" data-action="size" data-size="${o.size}" aria-pressed="${H.ui.poSize === o.size}" ${n < o.size ? 'disabled' : ''}>${o.label}<small>${o.size} equipos</small></button>`,
            ).join('')}
          </div>
          ${total && played < total ? `<p class="notice">La liga aún no termina (${played}/${total}). Los clasificados se toman de la tabla actual.</p>` : ''}
          <div class="row-actions">
            <button class="btn btn--primary" data-action="generate" ${n < H.ui.poSize ? 'disabled' : ''}>${po ? 'Recrear cuadro' : 'Crear cuadro'}</button>
            ${po ? '<button class="btn btn--danger" data-action="remove">Eliminar</button>' : ''}
          </div>
          ${n < 4 ? '<p class="hint">Necesitas al menos 4 equipos registrados.</p>' : ''}
        </article>`

      if (!po) {
        el.innerHTML = `<div class="panel-grid">${config}<article class="card"><p class="empty">Elige la ronda inicial y crea el cuadro. Si una llave termina empatada se definirá por penales. Incluye partido por el tercer puesto.</p></article></div>`
        return
      }

      const bracket = H.computeBracket(season)

      const teamLine = (m, side) => {
        const id = m[side]
        const t = id ? teams.get(id) : null
        const seed = side === 'home' ? m.homeSeed : m.awaySeed
        const field = side === 'home' ? 'hg' : 'ag'
        const pen = side === 'home' ? 'hp' : 'ap'
        const won = m.winner && m.winner === id
        const lost = m.loser && m.loser === id
        return `
          <div class="po-team${won ? ' is-winner' : ''}${lost ? ' is-loser' : ''}">
            <span class="po-seed">${t && seed ? seed : ''}</span>
            ${t ? crest(t.logo, 'sm', t.name) : '<span class="crest crest--sm crest--tbd"></span>'}
            <span class="po-name">${t ? esc(t.name) : 'Por definir'}</span>
            ${m.tied ? `<input class="score-input score-input--pen" type="number" inputmode="numeric" min="0" max="99" value="${m[pen] ?? ''}"
              data-key="po:${m.key}:${pen}" data-po="${m.key}" data-pair="${esc(m.pair)}" data-field="${pen}" aria-label="Penales de ${esc(t?.name)}" title="Penales">` : ''}
            <input class="score-input" type="number" inputmode="numeric" min="0" max="99" value="${m[field] ?? ''}"
              data-key="po:${m.key}:${field}" data-po="${m.key}" data-pair="${esc(m.pair || '')}" data-field="${field}"
              aria-label="Goles de ${esc(t?.name || 'por definir')}" ${m.pair ? '' : 'disabled'}>
          </div>`
      }

      const matchCard = (m, extra = '') => `
        <div class="po-match${m.decided ? ' is-decided' : ''} ${extra}">
          ${teamLine(m, 'home')}
          ${teamLine(m, 'away')}
          ${m.tied ? `<p class="po-pens">${m.penaltiesTied ? 'Los penales no pueden terminar empatados' : m.decided ? 'Definido por penales' : 'Empate: ingresa la tanda de penales'}</p>` : ''}
        </div>`

      const columns = bracket.rounds
        .slice(0, -1)
        .map(
          (r) => `
          <div class="bracket-col">
            <h3 class="bracket-stage">${r[0].stage}</h3>
            <div class="bracket-matches">${r.map((m) => matchCard(m)).join('')}</div>
          </div>`,
        )
        .join('')

      const finalCol = `
        <div class="bracket-col bracket-col--final">
          <div class="bracket-matches">
            <div>
              <h3 class="bracket-stage bracket-stage--final">Final</h3>
              ${matchCard(bracket.final, 'po-match--final')}
            </div>
            <div>
              <h3 class="bracket-stage">Tercer Puesto</h3>
              ${matchCard(bracket.third)}
            </div>
          </div>
        </div>`

      const place = (id, label, cls) => {
        const t = id ? teams.get(id) : null
        return `
          <li class="podium-item ${cls}">
            ${t ? crest(t.logo, 'lg', t.name) : '<span class="crest crest--lg crest--tbd"></span>'}
            <span class="podium-label">${label}</span>
            <span class="podium-name">${t ? esc(t.name) : 'Por definir'}</span>
          </li>`
      }

      el.innerHTML = `
        <div class="panel-grid">
          ${config}
          <article class="card">
            <header class="card-head"><div><h2 class="card-title">Podio</h2><p class="card-sub">Temporada ${season.number}</p></div></header>
            <ol class="podium podium--compact">
              ${place(bracket.champion, 'Campeón', 'is-gold')}
              ${place(bracket.runnerUp, 'Subcampeón', 'is-silver')}
              ${place(bracket.thirdPlace, '3er lugar', 'is-bronze')}
              ${place(bracket.fourth, '4to lugar', '')}
            </ol>
          </article>
          <article class="card card--wide">
            <header class="card-head"><div><h2 class="card-title">Cuadro</h2><p class="card-sub">Ingresa los marcadores. Si hay empate aparece la casilla de penales (izquierda).</p></div></header>
            <div class="bracket-scroll" role="region" aria-label="Cuadro de playoffs deslizable" tabindex="0"><div class="bracket">${columns}${finalCol}</div></div>
          </article>
        </div>`
    },
  })
})()
