;(() => {
  const H = window.Hub
  const { esc, crest } = H
  const SIZES = [
    { size: 4, label: 'Semifinales' },
    { size: 8, label: 'Cuartos de final' },
    { size: 16, label: 'Octavos de final' },
  ]
  let repechageDraftSeason = null
  let repechageDraft = null

  function repechageSetup(season, size, grouped) {
    if (grouped) {
      const first = H.computeTable(season, season.tableConfig.series1)
      const second = H.computeTable(season, season.tableConfig.series2)
      const matchCount = size === 4 ? 2 : size / 4
      const directPerSeries = size / 2 - matchCount / 2
      if (first.length < directPerSeries + matchCount || second.length < directPerSeries + matchCount) return null
      const pairs = Array.from({ length: matchCount }, (_, i) => [
        first[directPerSeries + i].team.id,
        second[directPerSeries + matchCount - i - 1].team.id,
      ])
      const seeds = Array(size).fill(null)
      let order = [1]
      while (order.length < size) {
        const next = order.length * 2 + 1
        order = order.flatMap((seed) => [seed, next - seed])
      }
      const teamsPerSide = size / 2
      for (let i = 0; i < teamsPerSide; i++) {
        if (i < directPerSeries) seeds[order[2 * i] - 1] = first[i].team.id
        const secondRank = teamsPerSide - i - 1
        if (secondRank < directPerSeries) seeds[order[2 * i + 1] - 1] = second[secondRank].team.id
      }
      const repechagePerSide = matchCount / 2
      const seedSlots = [
        ...Array.from({ length: repechagePerSide }, (_, i) => order[2 * (directPerSeries + i)]),
        ...Array.from({ length: repechagePerSide }, (_, i) => order[2 * i + 1]),
      ]
      return { seeds, repechage: { enabled: true, pairs, seedSlots, fields: H.generateRepechageFields(matchCount, season.fields || 2), results: {} } }
    }
    const table = H.computeTable(season)
    const matchCount = size / 4
    const directCount = size - matchCount
    if (table.length < size + matchCount) return null
    const participants = table.slice(directCount, directCount + matchCount * 2)
    const pairs = Array.from({ length: matchCount }, (_, i) => [
      participants[i].team.id,
      participants[participants.length - i - 1].team.id,
    ])
    return {
      seeds: [...table.slice(0, directCount).map((row) => row.team.id), ...Array(matchCount).fill(null)],
      repechage: {
        enabled: true,
        pairs,
        seedSlots: Array.from({ length: matchCount }, (_, i) => directCount + i + 1),
        fields: H.generateRepechageFields(matchCount, season.fields || 2),
        results: {},
      },
    }
  }

  function repechageMinimum(size, grouped) {
    if (!grouped) return `${size + size / 4} equipos`
    const matchCount = size === 4 ? 2 : size / 4
    return `${size / 2 - matchCount / 2 + matchCount} equipos por serie`
  }

  function randomBracketOrder(size) {
    const order = Array.from({ length: size }, (_, i) => i + 1)
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    return order
  }

  async function generate() {
    const season = H.state.current
    const size = H.ui.poSize
    const grouped = season.tableConfig?.type === 'two-series'
    const useRepechage = !!repechageDraft
    if (grouped) {
      const first = H.computeTable(season, season.tableConfig.series1)
      const second = H.computeTable(season, season.tableConfig.series2)
      const assigned = season.tableConfig.series1.length + season.tableConfig.series2.length === season.teams.length
      if (!assigned || (useRepechage ? !repechageSetup(season, size, true) : size / 2 > Math.min(first.length, second.length))) {
        return H.toast(useRepechage ? 'No hay suficientes equipos asignados a ambas series para el repechaje.' : `Para un cuadro de ${size}, cada serie necesita al menos ${size / 2} equipos.`, 'error')
      }
    } else if (season.teams.length < size) return H.toast(`Necesitas al menos ${size} equipos`, 'error')
    if (useRepechage && !grouped && !repechageSetup(season, size, false)) {
      return H.toast(`Con repechaje se necesitan al menos ${size + size / 4} equipos.`, 'error')
    }
    if (season.playoffs && (Object.keys(season.playoffs.results).length || Object.keys(season.playoffs.repechage?.results || {}).length)) {
      if (!(await H.confirm('Se creará un nuevo cuadro y se perderán los resultados actuales de Tournament.', { confirmText: 'Crear' })))
        return
    }
    let seeds
    let repechage = null
    if (useRepechage) {
      const setup = repechageSetup(season, size, grouped)
      seeds = setup.seeds
      repechage = setup.repechage
    } else if (grouped) {
      const first = H.computeTable(season, season.tableConfig.series1)
      const second = H.computeTable(season, season.tableConfig.series2)
      let order = [1]
      while (order.length < size) {
        const next = order.length * 2 + 1
        order = order.flatMap((seed) => [seed, next - seed])
      }
      seeds = Array(size).fill(null)
      for (let i = 0; i < size / 2; i++) {
        seeds[order[2 * i] - 1] = first[i].team.id
        seeds[order[2 * i + 1] - 1] = second[second.length - 1 - i].team.id
      }
    } else seeds = H.computeTable(season).slice(0, size).map((r) => r.team.id)
    H.update((s) => (s.current.playoffs = {
      size,
      seeds,
      results: {},
      fields: H.generateTournamentFields(size, season.fields || 2),
      ...(repechage ? { repechage, bracketOrder: randomBracketOrder(size) } : {}),
    }))
    H.toast('Tournament creado')
  }

  async function remove() {
    if (!(await H.confirm('Se eliminará el cuadro Tournament y sus resultados.', { confirmText: 'Eliminar' }))) return
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
    // html-to-image drops class-based SVG styles, which leaves paths with the default black fill.
    // Baking the resolved values into attributes keeps the PNG export identical to the screen.
    svg.querySelectorAll('path').forEach((p) => {
      const cs = getComputedStyle(p)
      p.setAttribute('fill', 'none')
      p.setAttribute('stroke', cs.stroke)
      p.setAttribute('stroke-width', parseFloat(cs.strokeWidth) || 2)
      p.setAttribute('stroke-linejoin', 'round')
    })
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

  H.view('tournament', {
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
            const results = input.dataset.repechage === 'true' ? s.current.playoffs.repechage.results : s.current.playoffs.results
            const prev = results[key]
            const r = prev && prev.pair === pair ? prev : { pair, hg: null, ag: null, hp: null, ap: null }
            r[field] = value
            results[key] = r
          },
          { skip: 'tournament' },
        )
      })
      el.addEventListener('change', (e) => {
        if (e.target.name === 'repechage-enabled') {
          repechageDraft = e.target.checked
          H.ui.repechageEnabled = repechageDraft
          H.render()
          return
        }
        if (e.target.closest('[data-po]')) H.render()
      })
    },

    render(el, s) {
      const season = s.current
      const n = season.teams.length
      const po = season.playoffs
      if (po?.repechage?.enabled && !Array.isArray(po.bracketOrder)) {
        const draw = randomBracketOrder(po.size)
        H.update((st) => {
          if (st.current.playoffs === po) st.current.playoffs.bracketOrder = draw
        }, { skip: 'tournament' })
      }
      const grouped = season.tableConfig?.type === 'two-series'
      const available = grouped ? 2 * Math.min(season.tableConfig.series1.length, season.tableConfig.series2.length) : n
      if (repechageDraftSeason !== season.id || repechageDraft == null) {
        repechageDraftSeason = season.id
        repechageDraft = po ? !!po.repechage?.enabled : !!H.ui.repechageEnabled
        H.ui.repechageEnabled = repechageDraft
      }
      const repechageEnabled = repechageDraft
      const canRepechage = (size) => !!repechageSetup(season, size, grouped)
      if (po) H.ui.poSize = po.size
      const teams = new Map(season.teams.map((t) => [t.id, t]))
      const { total, played } = H.stageCounts(season)

      const config = `
        <article class="card">
          <header class="card-head">
            <div>
              <h2 class="card-title">Crear Tournament</h2>
            </div>
          </header>
          <div class="seg seg--wrap" role="group" aria-label="Ronda inicial">
            ${SIZES.map(
              (o) =>
                `<button class="seg-btn" data-action="size" data-size="${o.size}" aria-pressed="${H.ui.poSize === o.size}" ${repechageEnabled ? !canRepechage(o.size) ? 'disabled' : '' : available < o.size && !canRepechage(o.size) ? 'disabled' : ''}>${o.label}<small>${o.size} equipos</small></button>`,
            ).join('')}
          </div>
          <label class="series-choice tournament-repechage-toggle"><input type="checkbox" name="repechage-enabled" ${repechageEnabled ? 'checked' : ''} ${canRepechage(H.ui.poSize) ? '' : 'disabled'}> Repechajes <span class="hint">(mínimo ${repechageMinimum(H.ui.poSize, grouped)})</span></label>
          ${total && played < total ? `<p class="notice">La liga aún no termina (${played}/${total}). Los clasificados se toman de la tabla actual.</p>` : ''}
          <div class="row-actions">
            <button class="btn btn--primary" data-action="generate" ${repechageEnabled ? !canRepechage(H.ui.poSize) ? 'disabled' : '' : available < H.ui.poSize ? 'disabled' : ''}>${po ? 'Recrear cuadro' : 'Crear cuadro'}</button>
            ${po ? '<button class="btn btn--danger" data-action="remove">Eliminar</button>' : ''}
          </div>
          ${available < 4 ? `<p class="hint">${grouped ? 'Necesitas al menos 2 equipos clasificados en cada serie para formar un cruce.' : 'Necesitas al menos 4 equipos registrados.'}</p>` : ''}
        </article>`

      if (!po) {
        bracketObserver?.disconnect()
        el.innerHTML = `<div class="panel-grid">${config}</div>`
        return
      }

      const bracket = H.computeBracket(season)
      const repechageMatches = H.computeRepechage(season)

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
            <span class="po-seed">${t && seed && !po.bracketOrder ? seed : ''}</span>
            ${t ? crest(t.logo, 'sm', t.name) : '<span class="crest crest--sm crest--tbd"></span>'}
            <span class="po-name">${t ? esc(t.name) : 'Por definir'}</span>
            ${m.tied ? `<input class="score-input score-input--pen" type="number" inputmode="numeric" min="0" max="99" value="${m[pen] ?? ''}"
              data-key="po:${m.key}:${pen}" data-po="${m.key}" data-pair="${esc(m.pair)}" data-field="${pen}" data-repechage="${m.stage === 'Repechaje'}" aria-label="Penales de ${esc(t?.name)}" title="Penales">` : ''}
            <input class="score-input" type="number" inputmode="numeric" min="0" max="99" value="${m[field] ?? ''}"
              data-key="po:${m.key}:${field}" data-po="${m.key}" data-pair="${esc(m.pair || '')}" data-field="${field}" data-repechage="${m.stage === 'Repechaje'}"
              aria-label="Goles de ${esc(t?.name || 'por definir')}" ${m.pair ? '' : 'disabled'}>
          </div>`
      }

      const matchCard = (m, extra = '') => `
        <div class="po-match${m.decided ? ' is-decided' : ''} ${extra}" data-bk="${esc(m.key)}">
          ${m.field ? `<span class="po-field">Cancha ${m.field}</span>` : ''}
          ${teamLine(m, 'home')}
          ${teamLine(m, 'away')}
          ${m.tied ? `<p class="po-pens">${m.penaltiesTied ? 'Los penales no pueden terminar empatados' : m.decided ? 'Definido por penales' : 'Empate: ingresa la tanda de penales'}</p>` : ''}
        </div>`

      const repechageCard = po.repechage?.enabled ? `
        <article class="card card--wide repechage-card" id="repechage-export">
          <header class="card-head"><h2 class="card-title">Repechajes</h2><div class="row-actions">${H.exportButton('#repechage-export', 'repechajes')}</div></header>
          <div class="repechage-grid">${repechageMatches.map((match) => matchCard(match)).join('')}</div>
        </article>` : ''

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
            <header class="card-head"><h2 class="card-title">Podio · Temporada ${season.number}</h2></header>
            <ol class="podium">
              ${place(bracket.champion, 'Campeón', 'is-gold')}
              ${place(bracket.runnerUp, 'Subcampeón', 'is-silver')}
              ${place(bracket.thirdPlace, '3er lugar', 'is-bronze')}
              ${place(bracket.fourth, '4to lugar', '')}
            </ol>
          </article>
          <article class="card card--wide" id="tournament-export">
            <header class="card-head">
              <div><h2 class="card-title">Cuadro</h2></div>
              <div class="row-actions">
                <span class="hint" data-export-hide>Desliza para recorrer el cuadro</span>
                ${H.exportButton('#tournament-export', 'tournament')}
              </div>
            </header>
            <div class="bracket bracket--map bracket--${po.size}" data-scroll="bracket" role="region" aria-label="Cuadro Tournament" tabindex="0">
              ${leftCols}${finalCol}${rightCols}
            </div>
          </article>
          ${repechageCard}
        </div>`
      watchBracket(el, bracket.rounds.length)
    },
  })
})()
