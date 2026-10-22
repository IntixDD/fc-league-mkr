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

  const SVG_NS = 'http://www.w3.org/2000/svg'
  let bracketObserver = null

  // offsetLeft/Top are layout pixels, so the lines stay correct under the "-1" UI zoom too.
  function offsetWithin(node, ancestor) {
    let x = 0
    let y = 0
    let cur = node
    while (cur && cur !== ancestor) {
      x += cur.offsetLeft
      y += cur.offsetTop
      cur = cur.offsetParent
    }
    return { x, y, w: node.offsetWidth, h: node.offsetHeight }
  }

  function drawConnectors(bracket, roundsCount) {
    bracket.querySelector('.bk-lines')?.remove()
    if (!bracket.offsetWidth) return
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.classList.add('bk-lines')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('width', bracket.scrollWidth)
    svg.setAttribute('height', bracket.scrollHeight)
    const finalEl = bracket.querySelector('.po-match--final')

    for (let r = 0; r < roundsCount - 1; r++) {
      bracket.querySelectorAll(`[data-bk^="r${r}-"]`).forEach((from) => {
        const i = Number(from.dataset.bk.split('-')[1])
        const to = r === roundsCount - 2 ? finalEl : bracket.querySelector(`[data-bk="r${r + 1}-${Math.floor(i / 2)}"]`)
        if (!to) return
        const a = offsetWithin(from, bracket)
        const b = offsetWithin(to, bracket)
        const leftSide = !!from.closest('.bk-col--left')
        const x1 = leftSide ? a.x + a.w : a.x
        const x2 = leftSide ? b.x : b.x + b.w
        const y1 = a.y + a.h / 2
        const y2 = b.y + b.h / 2
        const xm = (x1 + x2) / 2
        const path = document.createElementNS(SVG_NS, 'path')
        path.setAttribute('d', `M${x1} ${y1}H${xm}V${y2}H${x2}`)
        path.setAttribute('class', `bk-line${from.classList.contains('is-decided') ? ' is-live' : ''}${to === finalEl ? ' is-final' : ''}`)
        svg.appendChild(path)
      })
    }
    bracket.prepend(svg)
  }

  function watchBracket(el, roundsCount) {
    bracketObserver?.disconnect()
    const bracket = el.querySelector('.bracket--map')
    if (!bracket) return
    const draw = () => drawConnectors(bracket, roundsCount)
    bracketObserver = new ResizeObserver(() => requestAnimationFrame(draw))
    bracketObserver.observe(bracket)
    bracket.querySelectorAll('.po-match').forEach((m) => bracketObserver.observe(m))
    requestAnimationFrame(draw)
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
        bracketObserver?.disconnect()
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
        <div class="po-match${m.decided ? ' is-decided' : ''} ${extra}" data-bk="${esc(m.key)}">
          ${teamLine(m, 'home')}
          ${teamLine(m, 'away')}
          ${m.tied ? `<p class="po-pens">${m.penaltiesTied ? 'Los penales no pueden terminar empatados' : m.decided ? 'Definido por penales' : 'Empate: ingresa la tanda de penales'}</p>` : ''}
        </div>`

      const slot = (m) => `<div class="bk-slot">${matchCard(m)}</div>`
      const sideColumn = (matches, stage, side) => {
        const body =
          matches.length > 1
            ? Array.from(
                { length: matches.length / 2 },
                (_, i) => `<div class="bk-pair">${slot(matches[2 * i])}${slot(matches[2 * i + 1])}</div>`,
              ).join('')
            : matches.map(slot).join('')
        return `
          <div class="bk-col bk-col--${side}">
            <h3 class="bracket-stage">${stage}</h3>
            <div class="bk-slots">${body}</div>
          </div>`
      }

      const sideRounds = bracket.rounds.slice(0, -1)
      const leftCols = sideRounds.map((r) => sideColumn(r.slice(0, r.length / 2), r[0].stage, 'left')).join('')
      const rightCols = sideRounds
        .map((r) => sideColumn(r.slice(r.length / 2), r[0].stage, 'right'))
        .reverse()
        .join('')
      const champ = bracket.champion ? teams.get(bracket.champion) : null

      const finalCol = `
        <div class="bk-col bk-col--final">
          <h3 class="bracket-stage bracket-stage--final">Final</h3>
          <div class="bk-slots">
            <div class="bk-final-top">
              <div class="bk-trophy${champ ? ' has-champion' : ''}">
                ${champ ? crest(champ.logo, 'md', champ.name) : '<span class="crest crest--md crest--tbd"></span>'}
                <span class="bk-trophy-label">${champ ? esc(champ.name) : 'Campeón'}</span>
              </div>
            </div>
            <div class="bk-slot bk-slot--final">${matchCard(bracket.final, 'po-match--final')}</div>
            <div class="bk-final-bottom">
              <h3 class="bracket-stage">Tercer Puesto</h3>
              ${matchCard(bracket.third)}
            </div>
          </div>
        </div>`

      const place = (id, label, cls) => {
        const t = id ? teams.get(id) : null
        return `
          <li class="podium-item ${cls}">
            ${t ? crest(t.logo, 'md', t.name) : '<span class="crest crest--md crest--tbd"></span>'}
            <span class="podium-text">
              <span class="podium-label">${label}</span>
              <span class="podium-name">${t ? esc(t.name) : 'Por definir'}</span>
            </span>
          </li>`
      }

      el.innerHTML = `
        <div class="panel-grid panel-grid--even">
          ${config}
          <article class="card">
            <header class="card-head"><div><h2 class="card-title">Podio</h2><p class="card-sub">Temporada ${season.number}</p></div></header>
            <ol class="podium">
              ${place(bracket.champion, 'Campeón', 'is-gold')}
              ${place(bracket.runnerUp, 'Subcampeón', 'is-silver')}
              ${place(bracket.thirdPlace, '3er lugar', 'is-bronze')}
              ${place(bracket.fourth, '4to lugar', '')}
            </ol>
          </article>
          <article class="card card--wide" id="playoffs-export">
            <header class="card-head">
              <div><h2 class="card-title">Cuadro</h2><p class="card-sub" data-export-hide>Ingresa los marcadores. Si hay empate aparece la casilla de penales (izquierda).</p></div>
              <div class="row-actions">
                <span class="hint" data-export-hide>Desliza para recorrer el cuadro</span>
                ${H.exportButton('#playoffs-export', 'playoffs')}
              </div>
            </header>
            <div class="bracket bracket--map bracket--${po.size}" data-scroll="bracket" role="region" aria-label="Cuadro de playoffs" tabindex="0">
              ${leftCols}${finalCol}${rightCols}
            </div>
          </article>
        </div>`
      watchBracket(el, bracket.rounds.length)
    },
  })
})()
