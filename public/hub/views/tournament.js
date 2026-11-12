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
  let twoLeggedDraftSeason = null
  let twoLeggedDraft = null
  let supercupDraftSeason = null
  let supercupDraft = null

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
      // Keep same-place finishers from each series adjacent in seed order. The
      // randomized bracket map can then split every rank pair across its halves.
      const seeds = Array.from({ length: directPerSeries }, (_, i) => [first[i].team.id, second[i].team.id]).flat()
        .concat(Array(size - directPerSeries * 2).fill(null))
      const seedSlots = Array.from({ length: matchCount }, (_, i) => directPerSeries * 2 + i + 1)
      return { seeds, repechage: { enabled: true, pairs, seedSlots, fields: H.generateRepechageFields(matchCount, season.fields || 2, !!twoLeggedDraft), results: {} } }
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
        fields: H.generateRepechageFields(matchCount, season.fields || 2, !!twoLeggedDraft),
        results: {},
      },
    }
  }

  function repechageMinimum(size, grouped) {
    if (!grouped) return `${size + size / 4} equipos`
    const matchCount = size === 4 ? 2 : size / 4
    return `${size / 2 - matchCount / 2 + matchCount} equipos por serie`
  }

  function randomBracketOrder(size, repechageSlots = []) {
    const slots = new Set(repechageSlots)
    const sides = [[], []]
    for (let seed = 1; seed <= size; seed += 2) {
      const side = Math.random() < 0.5 ? 0 : 1
      sides[side].push(seed)
      sides[1 - side].push(seed + 1)
    }

    const shuffle = (values) => {
      for (let i = values.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[values[i], values[j]] = [values[j], values[i]]
      }
      return values
    }

    const targetRepsPerSide = repechageSlots.length / 2
    if (Number.isInteger(targetRepsPerSide) && targetRepsPerSide > 0) {
      for (let side = 0; side < 2; side += 1) {
        while (sides[side].filter((seed) => slots.has(seed)).length > targetRepsPerSide) {
          const other = 1 - side
          const rep = sides[side].find((seed) => slots.has(seed))
          const direct = sides[other].find((seed) => !slots.has(seed))
          if (rep == null || direct == null) break
          sides[side][sides[side].indexOf(rep)] = direct
          sides[other][sides[other].indexOf(direct)] = rep
        }
      }
    }

    sides.forEach(shuffle)
    if (size === 16 && repechageSlots.length === 4) {
      sides.forEach((side) => {
        const reps = side.filter((seed) => slots.has(seed))
        const direct = side.filter((seed) => !slots.has(seed))
        // One repechage winner per octavos llave: put each in a separate match.
        side.splice(0, side.length, reps[0], direct[0], reps[1], direct[1], ...direct.slice(2))
      })
    }
    return sides.flat()
  }

  const randomGoals = () => Math.floor(Math.random() * 6)
  const randomField = (count = 2) => Math.floor(Math.random() * Math.max(2, Math.trunc(Number(count)) || 2)) + 1
  const isMobileDevice = () => /android.*mobile|iphone|ipod|ipad|windows phone/i.test(navigator.userAgent)
    || window.matchMedia('(pointer: coarse) and (max-width: 767px)').matches

  function randomPenaltyResult(result) {
    result.hp = 3 + Math.floor(Math.random() * 4)
    do { result.ap = 3 + Math.floor(Math.random() * 4) } while (result.hp === result.ap)
  }

  function randomMatchResult(match) {
    const result = { pair: match.pair }
    if (match.twoLegged) {
      result.leg1hg = randomGoals()
      result.leg1ag = randomGoals()
      result.leg2hg = randomGoals()
      result.leg2ag = randomGoals()
      const homeGoals = result.leg1hg + result.leg2ag
      const awayGoals = result.leg1ag + result.leg2hg
      if (homeGoals === awayGoals) randomPenaltyResult(result)
    } else {
      result.hg = randomGoals()
      result.ag = randomGoals()
      if (result.hg === result.ag) randomPenaltyResult(result)
    }
    return result
  }

  function randomizeTournamentResults() {
    if (!H.state.current.playoffs) return H.toast('Primero crea un cuadro Tournament', 'error')
    H.update((s) => {
      const season = s.current
      const playoffs = season.playoffs
      playoffs.results = {}
      if (playoffs.repechage?.enabled) {
        playoffs.repechage.results = {}
        H.computeRepechage(season).forEach((match) => {
          if (match.pair) playoffs.repechage.results[match.key] = randomMatchResult(match)
        })
      }
      const roundsCount = Math.log2(playoffs.size)
      for (let round = 0; round < roundsCount; round += 1) {
        const bracket = H.computeBracket(season)
        bracket.rounds[round].forEach((match) => {
          if (match.pair) playoffs.results[match.key] = randomMatchResult(match)
        })
      }
      const bracket = H.computeBracket(season)
      if (bracket?.third?.pair) playoffs.results.third = randomMatchResult(bracket.third)
      if (season.tableConfig?.type !== 'groups' && playoffs.supercup?.enabled) {
        const supercup = H.supercupPair(season, bracket)
        if (supercup) {
          const result = { pair: supercup.pair, hg: randomGoals(), ag: randomGoals(), hp: null, ap: null }
          if (result.hg === result.ag) randomPenaltyResult(result)
          playoffs.supercup.result = result
        }
      }
    })
    H.toast('Resultados de Tournament aleatorizados')
  }

  async function generate() {
    const season = H.state.current
    const size = H.ui.poSize
    const groupStage = season.tableConfig?.type === 'groups'
    const grouped = season.tableConfig?.type === 'two-series'
    const useRepechage = !groupStage && !!repechageDraft
    const groupSemifinals = groupStage && season.tableConfig.count === 4 && size === 4
    if (groupStage && size !== season.tableConfig.count * 2 && !groupSemifinals) return H.toast(`La fase de ${season.tableConfig.count} grupos permite un cuadro de ${season.tableConfig.count * 2} equipos${season.tableConfig.count === 4 ? ' o uno de 4 con los ganadores de grupo' : ''}.`, 'error')
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
    if (season.playoffs && (Object.keys(season.playoffs.results).length || Object.keys(season.playoffs.repechage?.results || {}).length || !!season.playoffs.supercup?.result?.pair)) {
      if (!(await H.confirm('Se creará un nuevo cuadro y se perderán los resultados actuales de Tournament y Supercopa.', { confirmText: 'Crear' })))
        return
    }
    let seeds
    let repechage = null
    if (useRepechage) {
      const setup = repechageSetup(season, size, grouped)
      seeds = setup.seeds
      repechage = setup.repechage
    } else if (groupStage) {
      const tables = season.tableConfig.groups.map((ids) => H.computeTable(season, ids))
      if (tables.some((table) => table.length < 2)) return H.toast('Cada grupo necesita al menos 2 equipos.', 'error')
      if (size === 4) {
        seeds = tables.map((table) => table[0].team.id)
      } else {
        const seedPositions = Array(size).fill(null)
        const openingOrder = [1]
        while (openingOrder.length < size) {
          const sum = openingOrder.length * 2 + 1
          openingOrder.splice(0, openingOrder.length, ...openingOrder.flatMap((seed) => [seed, sum - seed]))
        }
        const winners = tables.map((table) => table[0].team.id)
        const runners = tables.map((table) => table[1].team.id)
        const groupPairs = Array.from({ length: tables.length / 2 }, (_, index) => [index * 2, index * 2 + 1])
        groupPairs.forEach(([first, second], pairIndex) => {
          const slots = openingOrder.slice(pairIndex * 4, pairIndex * 4 + 4)
          const teams = [winners[first], runners[second], winners[second], runners[first]]
          slots.forEach((seed, index) => { seedPositions[seed - 1] = teams[index] })
        })
        seeds = seedPositions
      }
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
      twoLegged: !!twoLeggedDraft,
      results: {},
      supercup: { enabled: !groupStage && !!supercupDraft, result: null, field: randomField(season.fields || 2) },
      fields: H.generateTournamentFields(size, season.fields || 2, !!twoLeggedDraft),
      ...(repechage ? { repechage: { ...repechage, twoLegged: !!twoLeggedDraft }, bracketOrder: randomBracketOrder(size, repechage.seedSlots) } : {}),
    }))
    H.toast('Tournament creado')
  }

  async function remove() {
    if (!(await H.confirm('Se eliminará el cuadro Tournament y sus resultados.', { confirmText: 'Eliminar' }))) return
    H.update((s) => (s.current.playoffs = null))
  }

  const SVG_NS = 'http://www.w3.org/2000/svg'
  let bracketObserver = null
  document.addEventListener('app:sectionchange', (event) => {
    if (event.detail?.id !== 'tournament') {
      bracketObserver?.disconnect()
      bracketObserver = null
    }
  })

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
      let supercupSettleTimer = 0
      const settleSupercup = () => {
        clearTimeout(supercupSettleTimer)
        supercupSettleTimer = setTimeout(() => {
          const active = document.activeElement
          if (active && el.contains(active) && active.matches('input, textarea, select')) return
          H.render()
        }, 150)
      }
      window.addEventListener('keydown', (e) => {
        if (!e.shiftKey || e.key.toLowerCase() !== 'r' || e.altKey || e.ctrlKey || e.metaKey || e.repeat || e.isComposing) return
        const section = el.closest('.section')
        if (!section || section.hidden || isMobileDevice()) return
        const editing = e.target.closest?.('input, textarea, select, [contenteditable="true"]')
        if (editing && !editing.matches('[data-match], [data-po], [data-supercup]')) return
        e.preventDefault()
        randomizeTournamentResults()
      })
      el.addEventListener('click', (e) => {
        const toggleCard = e.target.closest('[data-toggle-card]')
        if (toggleCard && !e.target.closest('input, label')) {
          const checkbox = toggleCard.querySelector('input[type="checkbox"]:not(:disabled)')
          checkbox?.click()
          return
        }
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
        const supercupInput = e.target.closest('[data-supercup]')
        if (supercupInput) {
          const { pair, field } = supercupInput.dataset
          const value = H.parseScore(supercupInput.value)
          H.update((s) => {
            const supercup = s.current.playoffs?.supercup
            if (!supercup?.enabled) return
            const previous = supercup.result
            const result = previous && previous.pair === pair ? previous : { pair, hg: null, ag: null, hp: null, ap: null }
            result[field] = value
            if (field === 'hg' || field === 'ag') { result.hp = null; result.ap = null }
            supercup.result = result
          }, { skip: 'tournament' })
          return
        }
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
        if (e.target.name === 'two-legged-enabled') {
          twoLeggedDraft = e.target.checked
          H.ui.tournamentTwoLegged = twoLeggedDraft
          H.render()
          return
        }
        if (e.target.name === 'supercup-enabled') {
          if (H.state.current.tableConfig?.type === 'groups') return
          supercupDraft = e.target.checked
          H.ui.supercupEnabled = supercupDraft
          if (H.state.current.playoffs) {
            H.update((s) => {
              const season = s.current
              if (season.tableConfig?.type === 'groups' || !season.playoffs) return
              const supercup = season.playoffs.supercup || {
                field: randomField(season.fields || 2),
                result: null,
              }
              supercup.enabled = supercupDraft
              if (!supercup.field) supercup.field = randomField(season.fields || 2)
              season.playoffs.supercup = supercup
            })
            return
          }
          H.render()
          return
        }
        if (e.target.closest('[data-po]')) H.render()
        else if (e.target.closest('[data-supercup]')) settleSupercup()
      })
      el.addEventListener('focusout', (e) => {
        if (e.target.closest?.('[data-supercup]')) settleSupercup()
      })
    },

    render(el, s) {
      const season = s.current
      const n = season.teams.length
      const po = season.playoffs
      if (po?.repechage?.enabled && !Array.isArray(po.bracketOrder)) {
        const draw = randomBracketOrder(po.size, po.repechage.seedSlots || [])
        H.update((st) => {
          if (st.current.playoffs === po) st.current.playoffs.bracketOrder = draw
        }, { skip: 'tournament' })
      }
      const groupStage = season.tableConfig?.type === 'groups'
      const grouped = season.tableConfig?.type === 'two-series'
      const available = groupStage ? season.tableConfig.count * 2 : grouped ? 2 * Math.min(season.tableConfig.series1.length, season.tableConfig.series2.length) : n
      const groupSemifinalsAllowed = groupStage && season.tableConfig.count === 4
      const groupSizeAllowed = (size) => size === available || (groupSemifinalsAllowed && size === 4)
      if (repechageDraftSeason !== season.id || repechageDraft == null || (!po && repechageDraft !== !!H.ui.repechageEnabled)) {
        repechageDraftSeason = season.id
        repechageDraft = po ? !!po.repechage?.enabled : !!H.ui.repechageEnabled
        H.ui.repechageEnabled = repechageDraft
      }
      if (twoLeggedDraftSeason !== season.id || twoLeggedDraft == null) {
        twoLeggedDraftSeason = season.id
        twoLeggedDraft = po ? !!po.twoLegged : !!H.ui.tournamentTwoLegged
        H.ui.tournamentTwoLegged = twoLeggedDraft
      }
      if (groupStage) {
        supercupDraftSeason = season.id
        supercupDraft = false
        H.ui.supercupEnabled = false
      } else if (supercupDraftSeason !== season.id || supercupDraft == null || (!po && supercupDraft !== !!H.ui.supercupEnabled)) {
        supercupDraftSeason = season.id
        supercupDraft = po ? !!po.supercup?.enabled : !!H.ui.supercupEnabled
        H.ui.supercupEnabled = supercupDraft
      }
      const repechageEnabled = groupStage ? false : repechageDraft
      const canRepechage = (size) => !groupStage && !!repechageSetup(season, size, grouped)
      const sizeDisabled = (size) => groupStage
        ? !groupSizeAllowed(size)
        : repechageEnabled
          ? !canRepechage(size)
          : available < size && !canRepechage(size)
      if (po) H.ui.poSize = po.size
      const groupWinnersOnly = groupSemifinalsAllowed && H.ui.poSize === 4
      const selectedAvailable = groupWinnersOnly ? 4 : available
      const groupHint = groupStage
        ? groupWinnersOnly
          ? 'Clasifica el ganador de cada grupo: Tournament se crea con 4 equipos.'
          : `Clasifican los dos primeros de cada grupo: Tournament se crea con ${available} equipos.`
        : ''
      const createDisabled = repechageEnabled ? !canRepechage(H.ui.poSize) : selectedAvailable < H.ui.poSize
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
                `<button class="seg-btn" data-action="size" data-size="${o.size}" aria-pressed="${H.ui.poSize === o.size}" ${sizeDisabled(o.size) ? 'disabled' : ''}>${o.label}<small>${o.size} equipos</small></button>`,
            ).join('')}
          </div>
          <div class="tournament-options">
            <div class="tournament-option-card tournament-toggle-card" data-toggle-card="repechage-enabled"><label class="series-choice tournament-repechage-toggle"><input type="checkbox" name="repechage-enabled" ${repechageEnabled ? 'checked' : ''} ${canRepechage(H.ui.poSize) ? '' : 'disabled'}> <span>Repechajes</span> <span class="hint">(mínimo ${repechageMinimum(H.ui.poSize, grouped)})</span></label></div>
            <div class="tournament-option-card tournament-toggle-card" data-toggle-card="two-legged-enabled"><label class="series-choice"><input type="checkbox" name="two-legged-enabled" ${twoLeggedDraft ? 'checked' : ''}> <span>Ida y vuelta</span></label></div>
            <div class="tournament-option-card tournament-toggle-card${groupStage ? ' is-disabled' : ''}" data-toggle-card="supercup-enabled"${groupStage ? ' aria-disabled="true"' : ''}><label class="series-choice"><input type="checkbox" name="supercup-enabled" ${!groupStage && supercupDraft ? 'checked' : ''} ${groupStage ? 'disabled' : ''}> <span>Supercopa</span></label>${groupStage ? '<small class="tournament-option-note">No disponible en Fase de Grupos</small>' : ''}</div>
          </div>
          ${po && !groupStage ? '<p class="hint">La opción de Supercopa se aplica al cuadro actual sin recrearlo.</p>' : ''}
          ${total && played < total ? `<p class="notice">La liga aún no termina (${played}/${total}). Los clasificados se toman de la tabla actual.</p>` : ''}
          <div class="row-actions">
            <button class="btn btn--primary" data-action="generate" ${createDisabled ? 'disabled' : ''}>${po ? 'Recrear cuadro' : 'Crear cuadro'}</button>
            ${po ? '<button class="btn btn--danger" data-action="remove">Eliminar</button>' : ''}
          </div>
          ${groupStage ? `<p class="hint">${groupHint}</p>` : available < 4 ? `<p class="hint">${grouped ? 'Necesitas al menos 2 equipos clasificados en cada serie para formar un cruce.' : 'Necesitas al menos 4 equipos registrados.'}</p>` : ''}
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
        const scoreInput = (scoreField, value, label = '', disabled = false) => `<input class="score-input" type="number" inputmode="numeric" min="0" max="99" value="${value ?? ''}"
          data-key="po:${m.key}:${scoreField}" data-po="${m.key}" data-pair="${esc(m.pair || '')}" data-field="${scoreField}" data-repechage="${m.stage === 'Repechaje'}"
          aria-label="${label ? `${label}, ` : ''}goles de ${esc(t?.name || 'por definir')}" ${m.pair && !disabled ? '' : 'disabled'}>`
        const legFields = side === 'home'
          ? [{ label: 'Ida', field: 'leg1hg', value: m.leg1?.hg }, { label: 'Vuelta', field: 'leg2ag', value: m.leg2?.ag, disabled: !m.leg1Played }]
          : [{ label: 'Ida', field: 'leg1ag', value: m.leg1?.ag }, { label: 'Vuelta', field: 'leg2hg', value: m.leg2?.hg, disabled: !m.leg1Played }]
        const scores = m.twoLegged
          ? `<span class="po-leg-inputs">${legFields.map((leg) => `<label class="po-leg-score"><span>${leg.label}</span>${scoreInput(leg.field, leg.value, leg.label, leg.disabled)}</label>`).join('')}</span>`
          : scoreInput(field, m[field])
        return `
          <div class="po-team${won ? ' is-winner' : ''}${lost ? ' is-loser' : ''}">
            <span class="po-seed">${t && seed && !po.bracketOrder ? seed : ''}</span>
            ${t ? crest(t.logo, 'sm', t.name) : '<span class="crest crest--sm crest--tbd"></span>'}
            <span class="po-name">${t ? esc(t.name) : 'Por definir'}</span>
            ${m.tied ? `<input class="score-input score-input--pen" type="number" inputmode="numeric" min="0" max="99" value="${m[pen] ?? ''}"
              data-key="po:${m.key}:${pen}" data-po="${m.key}" data-pair="${esc(m.pair)}" data-field="${pen}" data-repechage="${m.stage === 'Repechaje'}" aria-label="Penales de ${esc(t?.name)}" title="Penales">` : ''}
            ${scores}
          </div>`
      }

      const matchCard = (m, extra = '') => `
        <div class="po-match${m.decided ? ' is-decided' : ''} ${extra}" data-bk="${esc(m.key)}">
          ${m.twoLegged
            ? `<div class="po-leg-fields"><span class="po-field">Ida · Cancha ${m.leg1Field || '—'}</span><span class="po-field">Vuelta · Cancha ${m.leg2Field || '—'}</span></div>`
            : m.field ? `<span class="po-field">Cancha ${m.field}</span>` : ''}
          ${teamLine(m, 'home')}
          ${teamLine(m, 'away')}
          ${m.twoLegged ? `<p class="po-global">Global ${m.hg ?? '—'} – ${m.ag ?? '—'}</p>` : ''}
          ${m.tied ? `<p class="po-pens">${m.penaltiesTied ? 'Los penales no pueden terminar empatados' : m.decided ? 'Definido por penales' : 'Empate: ingresa la tanda de penales'}</p>` : ''}
        </div>`

      const repechageBySeed = new Map((po.repechage?.seedSlots || []).map((seed, index) => [seed, repechageMatches[index]]).filter(([, match]) => match))
      const feedsForMatch = (match) => match.key.startsWith('r0-')
        ? [repechageBySeed.get(match.homeSeed), repechageBySeed.get(match.awaySeed)].filter(Boolean)
        : []
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

      const repechageSideColumn = (matches, side) => {
        const maxFeeds = Math.max(0, ...matches.map((match) => feedsForMatch(match).length))
        if (!maxFeeds) return ''
        const slot = (match) => {
          const feeds = feedsForMatch(match)
          return `<div class="bk-slot bk-repechage-slot${feeds.length ? ' bk-repechage-slot--active' : ''}${feeds.length > 1 ? ' bk-repechage-slot--multi' : ''}">
            ${feeds.map((feed) => matchCard(feed, `po-match--repechage po-match--rep-${side}`)).join('')}
          </div>`
        }
        const body = matches.length > 1
          ? Array.from({ length: matches.length / 2 }, (_, i) => `<div class="bk-pair">${slot(matches[2 * i])}${slot(matches[2 * i + 1])}</div>`).join('')
          : matches.map(slot).join('')
        return `<div class="bk-col bk-col--repechage-feed bk-col--repechage-feed-${side}${maxFeeds > 1 ? ' bk-col--repechage-feed-multi' : ''}">
          <h3 class="bracket-stage">Repechaje</h3><div class="bk-slots">${body}</div>
        </div>`
      }

      const sideRounds = bracket.rounds.slice(0, -1)
      const leftRoundOne = bracket.rounds[0].slice(0, bracket.rounds[0].length / 2)
      const rightRoundOne = bracket.rounds[0].slice(bracket.rounds[0].length / 2)
      const leftCols = `${repechageSideColumn(leftRoundOne, 'left')}${sideRounds.map((r) => sideColumn(r.slice(0, r.length / 2), r[0].stage, 'left')).join('')}`
      const rightCols = sideRounds
        .map((r) => sideColumn(r.slice(r.length / 2), r[0].stage, 'right'))
        .reverse()
        .join('') + repechageSideColumn(rightRoundOne, 'right')
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

      const supercupPair = !groupStage && po.supercup?.enabled ? H.supercupPair(season, bracket) : null
      const supercupMatch = supercupPair ? H.supercupMatch(season, bracket) : null
      const provisionalGroupWinners = groupStage
        ? (season.tableConfig.groups || []).map((group) => H.computeTable(season, group)[0]).filter((row) => row && (row.pj || row.pts)).sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.team.name.localeCompare(b.team.name))
        : []
      const seasonAwards = H.seasonStats(season)
      const provisionalDomesticChampion = grouped
        ? seasonAwards.find((team) => team.seriesFinalChampion)?.id || null
        : groupStage
          ? provisionalGroupWinners[0]?.team.id || null
          : seasonAwards.find((team) => team.leagueChampion)?.id || null
      const provisionalDomesticRunnerUp = grouped
        ? seasonAwards.find((team) => team.seriesFinalRunnerUp)?.id || null
        : groupStage
          ? provisionalGroupWinners[1]?.team.id || null
          : H.computeTable(season)[1]?.team.id || null
      const displayedSupercupHome = supercupPair?.home || (bracket.champion && provisionalDomesticChampion === bracket.champion
        ? provisionalDomesticRunnerUp || provisionalDomesticChampion
        : provisionalDomesticChampion)
      const displayedSupercupAway = supercupPair?.away || bracket.champion || null
      const supercupHome = displayedSupercupHome ? teams.get(displayedSupercupHome) : null
      const supercupAway = displayedSupercupAway ? teams.get(displayedSupercupAway) : null
      const supercupInput = (field, team) => `<input class="score-input tournament-supercup-score" type="number" inputmode="numeric" min="0" max="99" value="${supercupMatch?.[field] ?? ''}"
        data-key="supercup:${field}" data-supercup="" data-pair="${esc(supercupPair?.pair || '')}" data-field="${field}" aria-label="Goles de ${esc(team?.name || 'por definir')}" ${supercupPair ? '' : 'disabled'}>`
      const supercupPenalty = (field, team) => `<label class="po-leg-score tournament-supercup-penalty"><span>Penales</span><input class="score-input score-input--pen" type="number" inputmode="numeric" min="0" max="99" value="${supercupMatch?.[field] ?? ''}"
        data-key="supercup:${field}" data-supercup="" data-pair="${esc(supercupPair?.pair || '')}" data-field="${field}" aria-label="Penales de ${esc(team?.name || 'por definir')}" ${supercupPair ? '' : 'disabled'}></label>`
      const supercupCard = !groupStage && po.supercup?.enabled ? `
        <article class="card card--wide tournament-supercup-panel" id="tournament-supercup-export">
          <header class="card-head">
            <div><h2 class="card-title">Supercopa</h2><p class="card-sub">Cancha ${supercupMatch?.field || po.supercup.field || '—'}</p></div>
            <div class="row-actions">${H.exportButton('#tournament-supercup-export', 'supercopa')}</div>
          </header>
          <div class="menu-match-card tournament-supercup-match">
            ${supercupHome?.logo ? `<img class="menu-crest-watermark menu-crest-watermark--home" src="${esc(supercupHome.logo)}" alt="" aria-hidden="true" loading="lazy" decoding="async">` : ''}
            ${supercupAway?.logo ? `<img class="menu-crest-watermark menu-crest-watermark--away" src="${esc(supercupAway.logo)}" alt="" aria-hidden="true" loading="lazy" decoding="async">` : ''}
            <h4 class="menu-match-title">${H.assetIcon('supercup.svg')}<span>Final de Supercopa</span></h4>
            <div class="tournament-supercup-fixture">
              <div class="tournament-supercup-team${supercupMatch?.winner === supercupPair?.home ? ' is-winner' : ''}">${supercupHome ? crest(supercupHome.logo, 'md', supercupHome.name) : '<span class="crest crest--md crest--tbd"></span>'}<span>${esc(supercupHome?.name || 'Por definir')}</span></div>
              <div class="tournament-supercup-scoreline">${supercupInput('hg', supercupHome)}<i>:</i>${supercupInput('ag', supercupAway)}</div>
              <div class="tournament-supercup-team tournament-supercup-team--away${supercupMatch?.winner === supercupPair?.away ? ' is-winner' : ''}">${supercupAway ? crest(supercupAway.logo, 'md', supercupAway.name) : '<span class="crest crest--md crest--tbd"></span>'}<span>${esc(supercupAway?.name || 'Por definir')}</span></div>
            </div>
            ${supercupMatch?.tied ? `<div class="tournament-supercup-penalties">${supercupPenalty('hp', supercupHome)}<span>:</span>${supercupPenalty('ap', supercupAway)}</div><p class="menu-match-pens">${supercupMatch.winner ? 'Definida por penales' : supercupMatch.penaltiesTied ? 'Los penales no pueden terminar empatados' : 'Empate: ingresa la tanda de penales'}</p>` : ''}
          </div>
          ${!supercupPair ? '<p class="hint">La Supercopa aparecerá cuando estén definidos el campeón de liga o Finalísima y el campeón de Tournament.</p>' : ''}
        </article>` : ''

      const place = (id, label, cls, icon) => {
        const t = id ? teams.get(id) : null
        return `
          <li class="podium-item ${cls}">
            ${t ? `<img class="podium-watermark" src="${esc(t.logo)}" alt="" aria-hidden="true" loading="lazy" decoding="async">` : ''}
            ${t ? crest(t.logo, 'md', t.name) : '<span class="crest crest--md crest--tbd"></span>'}
            <span class="podium-text">
              <span class="podium-label">${icon.endsWith('.svg') ? H.assetIcon(icon) : H.ICONS[icon]}<span>${label}</span></span>
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
              ${place(bracket.champion, 'Campeón', 'is-gold', 'tournament.svg')}
              ${place(bracket.runnerUp, 'Subcampeón', 'is-silver', 'medal_2.svg')}
              ${place(bracket.thirdPlace, '3er lugar', 'is-bronze', 'medal_3.svg')}
              ${place(bracket.fourth, '4to lugar', '', 'medal_4.svg')}
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
          ${supercupCard}
        </div>`
      watchBracket(el, bracket.rounds.length)
    },
  })
})()
