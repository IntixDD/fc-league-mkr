;(() => {
  const H = window.Hub
  const { esc, crest } = H

  function teamsChanged(season) {
    if (!season.fixtures) return false
    const inFixtures = new Set(H.leagueMatches(season).flatMap((m) => [m.home, m.away]))
    return season.teams.length !== inFixtures.size || season.teams.some((t) => !inFixtures.has(t.id))
  }

  async function generate() {
    const season = H.state.current
    const mode = H.ui.fxMode || season.fixtures?.mode || 'single'
    if (season.teams.length < 2) return H.toast('Necesitas al menos 2 equipos', 'error')
    if (!H.validateSeasonCrests?.()) return
    const config = ['two-series', 'groups'].includes(season.tableConfig?.type) ? season.tableConfig : null
    const groups = config?.type === 'groups' ? config.groups : config ? [config.series1, config.series2] : []
    if (config && (groups.some((group) => group.length < 2) || new Set(groups.flat()).size !== season.teams.length)) {
      return H.toast('Asigna todos los equipos a grupos o series (mínimo 2 equipos por grupo).', 'error')
    }
    const hasResults = H.leagueMatches(season).some(H.played) || H.played(season.fixtures?.finalissima || {})
    if (season.fixtures) {
      const msg = hasResults
        ? 'Se generará un calendario nuevo y se perderán los resultados de liga cargados.'
        : 'Se reemplazará el calendario actual.'
      if (!(await H.confirm(msg, { confirmText: 'Generar' }))) return
    } else if (season.manual && Object.keys(season.manual.rows).length) {
      if (!(await H.confirm('La tabla editada manualmente se reemplazará por los resultados del calendario.', { confirmText: 'Generar' }))) return
    }
    H.update((s) => {
      if (config) {
        const generated = H.generateSeriesRounds(groups, mode === 'double')
        s.current.fixtures = { mode, roundsPerLeg: generated.roundsPerLeg, series1: config.series1 ? [...config.series1] : null, series2: config.series2 ? [...config.series2] : null, groups: config.type === 'groups' ? groups.map((group) => [...group]) : null, finalissima: config.type === 'two-series' ? { pair: '', hg: null, ag: null, hp: null, ap: null, field: randomField(s.current.fields || 2) } : null, rounds: generated.rounds }
      } else s.current.fixtures = { mode, roundsPerLeg: 0, rounds: H.generateRounds(s.current.teams.map((t) => t.id), mode === 'double') }
    })
    H.toast('Calendario generado')
  }

  async function removeFixtures() {
    if (!(await H.confirm('Se eliminará el calendario y todos sus resultados.', { confirmText: 'Eliminar' }))) return
    H.update((s) => (s.current.fixtures = null))
  }

  function findMatch(s, id) {
    for (const r of s.current.fixtures?.rounds || []) {
      const m = r.find((x) => x.id === id)
      if (m) return m
    }
    return null
  }

  function refreshBlock(block) {
    const rows = [...block.querySelectorAll('.fx-match')]
    let done = 0
    rows.forEach((row) => {
      const ok = [...row.querySelectorAll('input')].every((i) => H.parseScore(i.value) != null)
      row.classList.toggle('is-played', ok)
      if (ok) done++
    })
    block.classList.toggle('is-done', done === rows.length)
    const count = block.querySelector('.round-block-count')
    if (count) count.textContent = `${done}/${rows.length}`
    const bar = block.querySelector('.fx-round-progress > span')
    if (bar) bar.style.width = `${rows.length ? Math.round((done / rows.length) * 100) : 0}%`
  }

  const randomGoals = () => Math.floor(Math.random() * 6)
  const randomField = (count = 2) => Math.floor(Math.random() * Math.max(2, Math.trunc(Number(count)) || 2)) + 1
  const isMobileDevice = () => /android.*mobile|iphone|ipod|ipad|windows phone/i.test(navigator.userAgent)
    || window.matchMedia('(pointer: coarse) and (max-width: 767px)').matches

  function randomizeFixtureResults() {
    const rounds = H.state.current.fixtures?.rounds
    if (!rounds?.some((round) => round.length)) return H.toast('Primero genera un calendario de Fixtures', 'error')
    H.update((s) => {
      s.current.fixtures.rounds.forEach((round) => round.forEach((match) => {
        match.hg = randomGoals()
        match.ag = randomGoals()
      }))
      const final = H.finalissimaMatch(s.current)
      if (final?.pair) {
        const result = { pair: final.pair, hg: randomGoals(), ag: randomGoals(), hp: null, ap: null, field: s.current.fixtures.finalissima?.field || randomField(s.current.fields || 2) }
        if (result.hg === result.ag) { result.hp = 5; result.ap = 4 }
        s.current.fixtures.finalissima = result
      }
    })
    H.toast('Resultados de Fixtures aleatorizados')
  }

  H.view('fixtures', {
    bind(el) {
      window.addEventListener('keydown', (e) => {
        if (!e.shiftKey || e.key.toLowerCase() !== 'r' || e.altKey || e.ctrlKey || e.metaKey || e.repeat || e.isComposing) return
        const section = el.closest('.section')
        if (!section || section.hidden || isMobileDevice()) return
        const editing = e.target.closest?.('input, textarea, select, [contenteditable="true"]')
        if (editing && !editing.matches('[data-match], [data-po], [data-finalissima]')) return
        e.preventDefault()
        randomizeFixtureResults()
      })
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]')
        if (!btn) return
        const { action } = btn.dataset
        if (action === 'mode') {
          H.ui.fxMode = btn.dataset.mode
          H.render()
        } else if (action === 'generate') generate()
        else if (action === 'remove') removeFixtures()
        else if (action === 'save-fields') {
          const raw = el.querySelector('[name="field-count"]')?.value
          const count = Number(raw)
          if (!Number.isInteger(count) || count < 2 || count > 999) return H.toast('Indica un número entero de canchas entre 2 y 999.', 'error')
          H.update((s) => {
            s.current.fields = count
            if (s.current.playoffs) {
              s.current.playoffs.fields = H.generateTournamentFields(s.current.playoffs.size, count, !!s.current.playoffs.twoLegged)
              if (s.current.playoffs.supercup) s.current.playoffs.supercup.field = randomField(count)
              if (s.current.playoffs.repechage) s.current.playoffs.repechage.fields = H.generateRepechageFields(s.current.playoffs.repechage.pairs.length, count, !!s.current.playoffs.repechage.twoLegged)
            }
            if (s.current.fixtures.finalissima) s.current.fixtures.finalissima.field = randomField(count)
          })
          H.toast('Canchas guardadas')
        } else if (action === 'clear-fields') {
          H.update((s) => {
            s.current.fields = null
            if (s.current.playoffs) {
              s.current.playoffs.fields = H.generateTournamentFields(s.current.playoffs.size, 2, !!s.current.playoffs.twoLegged)
              if (s.current.playoffs.supercup) s.current.playoffs.supercup.field = randomField(2)
              if (s.current.playoffs.repechage) s.current.playoffs.repechage.fields = H.generateRepechageFields(s.current.playoffs.repechage.pairs.length, 2, !!s.current.playoffs.repechage.twoLegged)
            }
            if (s.current.fixtures.finalissima) s.current.fixtures.finalissima.field = randomField(2)
          })
          H.toast('Asignación de canchas eliminada')
        } else if (action === 'jump') {
          el.querySelector(`#fx-round-${btn.dataset.round}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        } else if (action === 'clear-round') {
          const ri = Number(btn.dataset.round)
          H.update((s) => s.current.fixtures.rounds[ri]?.forEach((m) => ((m.hg = null), (m.ag = null))))
        }
      })
      el.addEventListener('input', (e) => {
        const finalInput = e.target.closest('[data-finalissima]')
        if (finalInput) {
          const value = H.parseScore(finalInput.value)
          H.update((s) => {
            const current = s.current.fixtures?.finalissima
            if (!current || current.pair !== finalInput.dataset.pair) s.current.fixtures.finalissima = { pair: finalInput.dataset.pair, hg: null, ag: null, hp: null, ap: null, field: current?.field || randomField(s.current.fields || 2) }
            s.current.fixtures.finalissima[finalInput.dataset.side] = value
            if (finalInput.dataset.side === 'hg' || finalInput.dataset.side === 'ag') {
              s.current.fixtures.finalissima.hp = null
              s.current.fixtures.finalissima.ap = null
            }
          }, { skip: 'fixtures' })
          const block = finalInput.closest('.fx-round')
          if (block) refreshBlock(block)
          return
        }
        const input = e.target.closest('[data-match]')
        if (!input) return
        const value = H.parseScore(input.value)
        H.update(
          (s) => {
            const m = findMatch(s, input.dataset.match)
            if (m) m[input.dataset.side] = value
          },
          { skip: 'fixtures' },
        )
        const block = input.closest('.fx-round')
        if (block) refreshBlock(block)
      })
      // Re-rendering on `change` replaced the score input the user had just tapped (change fires on
      // blur, i.e. while focus is moving to the next input), which dismissed/reopened the mobile
      // keyboard and flashed the screen. Only re-render once focus has really left the score inputs.
      let settleTimer = 0
      const settle = () => {
        clearTimeout(settleTimer)
        settleTimer = setTimeout(() => {
          const active = document.activeElement
          if (active && el.contains(active) && active.matches('input, textarea, select')) return
          H.render()
        }, 150)
      }
      el.addEventListener('change', (e) => {
        if (e.target.closest('[data-match], [data-finalissima]')) settle()
      })
      el.addEventListener('focusout', (e) => {
        if (e.target.closest?.('[data-match], [data-finalissima]')) settle()
      })
    },

    render(el, s) {
      const season = s.current
      const teams = new Map(season.teams.map((t) => [t.id, t]))
      const mode = H.ui.fxMode || season.fixtures?.mode || 'single'
      const n = season.teams.length
      const groupMode = season.tableConfig?.type === 'groups'
      const twoSeries = season.tableConfig?.type === 'two-series' || groupMode
      const counts = groupMode ? season.tableConfig.groups.map((group) => group.length) : twoSeries ? [season.tableConfig.series1.length, season.tableConfig.series2.length] : [n]
      const assignedGroups = groupMode ? season.tableConfig.groups : twoSeries ? [season.tableConfig.series1, season.tableConfig.series2] : []
      const seriesReady = !twoSeries || (counts.every((count) => count >= 2) && new Set(assignedGroups.flat()).size === n)
      const roundsFor = (m) => (twoSeries ? Math.max(0, ...counts.map((count) => count < 2 ? 0 : count % 2 ? count : count - 1)) : n < 2 ? 0 : n % 2 ? n : n - 1) * (m === 'double' ? 2 : 1)
      const matchesFor = (m) => (twoSeries ? counts.reduce((sum, count) => sum + (count * (count - 1)) / 2, 0) : (n * (n - 1)) / 2) * (m === 'double' ? 2 : 1)

      const config = `
        <article class="card">
          <header class="card-head">
            <div>
              <h2 class="card-title">Calendario</h2>
              <p class="card-sub">Temporada ${season.number} · ${n} equipos${groupMode ? ` · ${season.tableConfig.count} grupos` : twoSeries ? ' · 2 series' : ''}</p>
            </div>
          </header>
          <div class="seg" role="group" aria-label="Formato">
            <button class="seg-btn" data-action="mode" data-mode="single" aria-pressed="${mode === 'single'}">Solo ida</button>
            <button class="seg-btn" data-action="mode" data-mode="double" aria-pressed="${mode === 'double'}">Ida y vuelta</button>
          </div>
          <p class="hint">${n < 2 ? 'Registra al menos 2 equipos.' : `${roundsFor(mode)} jornadas · ${matchesFor(mode)} partidos${groupMode ? ' · solo juegan equipos del mismo grupo' : twoSeries ? ' · solo juegan equipos de la misma serie' : n % 2 ? ' · un equipo descansa por jornada' : ''}`}</p>
          <div class="row-actions">
            <button class="btn btn--primary" data-action="generate" ${n < 2 || !seriesReady ? 'disabled' : ''}>${season.fixtures ? 'Regenerar calendario' : 'Generar calendario'}</button>
            ${season.fixtures ? '<button class="btn btn--danger" data-action="remove">Eliminar</button>' : ''}
          </div>
          ${!seriesReady ? `<p class="notice">Completa y guarda la asignación de todos los equipos a ${groupMode ? 'los grupos' : 'las dos series'} en Table antes de generar el calendario.</p>` : ''}
          ${teamsChanged(season) ? '<p class="notice">Los equipos cambiaron desde que se generó el calendario. Regenera para incluirlos a todos.</p>' : ''}
        </article>`

      const fieldsCard = `
        <article class="card">
          <header class="card-head">
            <h2 class="card-title">Fields</h2>
          </header>
          <label class="field">
            <span class="field-label">Número de canchas (mínimo 2)</span>
            <input class="input" type="number" inputmode="numeric" min="2" max="999" step="1" name="field-count" value="${season.fields ?? ''}" placeholder="Opcional">
          </label>
          <div class="row-actions">
            <button class="btn btn--primary" data-action="save-fields">Guardar canchas</button>
            ${season.fields ? '<button class="btn btn--ghost" data-action="clear-fields">Quitar</button>' : ''}
          </div>
          <p class="hint">Opcional. Sin asignación, Fixtures conserva el número de orden de cada partido. En Tournament se asignan canchas aleatorias usando al menos 2.</p>
        </article>`

      if (!season.fixtures) {
        el.innerHTML = `<div class="panel-grid panel-grid--even">${config}${fieldsCard}</div>`
        return
      }

      const rounds = season.fixtures.rounds
      const half = season.fixtures.mode === 'double' ? (season.fixtures.roundsPerLeg || rounds.length / 2) : Infinity
      const all = H.leagueMatches(season)

      const team = (t, away) => {
        const name = `<span class="fx-name" title="${esc(t?.name || '')}">${esc(t?.name || '—')}</span>`
        const logo = crest(t?.logo, 'sm', t?.name)
        return `<span class="fx-team fx-team--${away ? 'away' : 'home'}">${away ? logo + name : name + logo}</span>`
      }

      const score = (m, sideKey, t) =>
        `<input class="score-input score-input--sm" type="number" inputmode="numeric" min="0" max="99" value="${m[sideKey] ?? ''}"
          data-key="fx:${esc(m.id)}:${sideKey}" data-match="${esc(m.id)}" data-side="${sideKey}" aria-label="Goles de ${esc(t?.name)}">`

      const finalissimaIds = H.seriesChampionIds(season)
      const finalissima = finalissimaIds ? H.finalissimaMatch(season) : null
      const finalissimaTeams = finalissimaIds?.map((id) => teams.get(id)) || []
      const finalScore = (side, t) => `<input class="score-input tournament-supercup-score" type="number" inputmode="numeric" min="0" max="99" value="${finalissima?.[side] ?? ''}"
        data-key="finalissima:${side}" data-finalissima="" data-pair="${esc(finalissima?.pair || '')}" data-side="${side}" aria-label="Goles de ${esc(t?.name || 'por definir')}" ${finalissima?.pair ? '' : 'disabled'}>`
      const finalPenalty = (side, t) => `<label class="po-leg-score tournament-supercup-penalty"><span>Penales</span><input class="score-input score-input--pen" type="number" inputmode="numeric" min="0" max="99" value="${finalissima?.[side] ?? ''}"
        data-key="finalissima:${side}" data-finalissima="" data-pair="${esc(finalissima?.pair || '')}" data-side="${side}" aria-label="Penales de ${esc(t?.name || 'por definir')}" ${finalissima?.pair ? '' : 'disabled'}></label>`

      const finalissimaBlock = season.tableConfig?.type === 'two-series' ? `
        <article class="menu-match-card tournament-supercup-match fx-finalissima-match-card">
          ${finalissimaTeams[0]?.logo ? `<img class="menu-crest-watermark menu-crest-watermark--home" src="${esc(finalissimaTeams[0].logo)}" alt="" aria-hidden="true" loading="lazy" decoding="async">` : ''}
          ${finalissimaTeams[1]?.logo ? `<img class="menu-crest-watermark menu-crest-watermark--away" src="${esc(finalissimaTeams[1].logo)}" alt="" aria-hidden="true" loading="lazy" decoding="async">` : ''}
          <h4>Finalísima de Series</h4>
          <div class="tournament-supercup-fixture">
            <div class="tournament-supercup-team${finalissima?.winner === finalissimaIds?.[0] ? ' is-winner' : ''}">${finalissimaTeams[0] ? crest(finalissimaTeams[0].logo, 'md', finalissimaTeams[0].name) : '<span class="crest crest--md crest--tbd"></span>'}<span>${esc(finalissimaTeams[0]?.name || 'Campeón Serie 1')}</span></div>
            <div class="tournament-supercup-scoreline">${finalScore('hg', finalissimaTeams[0])}<i>:</i>${finalScore('ag', finalissimaTeams[1])}</div>
            <div class="tournament-supercup-team tournament-supercup-team--away${finalissima?.winner === finalissimaIds?.[1] ? ' is-winner' : ''}">${finalissimaTeams[1] ? crest(finalissimaTeams[1].logo, 'md', finalissimaTeams[1].name) : '<span class="crest crest--md crest--tbd"></span>'}<span>${esc(finalissimaTeams[1]?.name || 'Campeón Serie 2')}</span></div>
          </div>
          <p class="fx-finalissima-meta">Cancha ${finalissima?.field || season.fixtures.finalissima?.field || '—'} · ${finalissima?.played ? finalissima.winner ? finalissima.tied ? 'Definida por penales' : 'Finalizada' : 'Empate: define por penales' : finalissima?.pair ? 'En juego' : 'Esperando campeones de serie'}</p>
          ${finalissima?.tied ? `<div class="tournament-supercup-penalties">${finalPenalty('hp', finalissimaTeams[0])}<span>:</span>${finalPenalty('ap', finalissimaTeams[1])}</div>${finalissima.penaltiesTied ? '<p class="menu-match-pens">Los penales no pueden terminar empatados</p>' : ''}` : ''}
        </article>` : ''

      const currentIndex = rounds.findIndex((r) => r.some((m) => !H.played(m)))

      const roundBlock = (r, i) => {
        const rest = season.teams.filter((t) => !r.some((m) => m.home === t.id || m.away === t.id))
        const playedCount = r.filter(H.played).length
        const done = playedCount === r.length
        const pct = r.length ? Math.round((playedCount / r.length) * 100) : 0
        const state = done ? ' is-done' : i === currentIndex ? ' is-current' : ''
        return `
          <section class="fx-round${state}" id="fx-round-${i}" aria-labelledby="rb-${i}">
            <header class="fx-round-head">
              <span class="fx-round-num" aria-hidden="true">${i + 1}</span>
              <div class="fx-round-info">
                <h3 id="rb-${i}" class="fx-round-title">Jornada ${i + 1}</h3>
                <span class="fx-round-status">${done ? 'Completada' : i === currentIndex ? 'En juego' : playedCount ? 'En curso' : 'Pendiente'}</span>
              </div>
              <div class="fx-round-progress" aria-hidden="true"><span style="width:${pct}%"></span></div>
              <span class="fx-round-tools">
                <span class="fx-round-count round-block-count">${playedCount}/${r.length}</span>
                ${playedCount ? `<button class="fx-icon-btn" data-action="clear-round" data-round="${i}" data-export-hide aria-label="Limpiar jornada ${i + 1}" title="Limpiar jornada">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
                </button>` : ''}
              </span>
            </header>
            <ul class="fx-list">
              ${r
                .map((m, mi) => {
                  const h = teams.get(m.home)
                  const a = teams.get(m.away)
                  const played = H.played(m)
                  const res = played ? (m.hg > m.ag ? 'home' : m.hg < m.ag ? 'away' : 'draw') : ''
                  const field = season.fields ? (mi % season.fields) + 1 : mi + 1
                  return `<li class="fx-match${played ? ` is-played is-${res}` : ''}" aria-label="${esc(h?.name || '')} contra ${esc(a?.name || '')}${season.fields ? `, cancha ${field}` : ''}">
                    <span class="fx-idx${season.fields ? ' is-field' : ''}" title="${season.fields ? `Cancha ${field}` : `Partido ${mi + 1}`}">${field}</span>
                    ${team(h)}
                    <span class="fx-score">${score(m, 'hg', h)}<span class="fx-sep" aria-hidden="true">:</span>${score(m, 'ag', a)}</span>
                    ${team(a, true)}
                  </li>`
                })
                .join('')}
            </ul>
            ${
              rest.length
                ? `<p class="fx-rest"><span class="fx-rest-label">Descansa</span>${rest
                    .map((t) => `<span class="fx-rest-team">${crest(t.logo, 'xs', t.name)}<span>${esc(t.name)}</span></span>`)
                    .join('')}</p>`
                : ''
            }
          </section>`
      }

      const phaseHead = (label, from, to) => {
        const ms = rounds.slice(from, to).flat()
        return `<h3 class="fx-phase"><span>${label}</span><small>Jornadas ${from + 1}–${to} · ${ms.filter(H.played).length}/${ms.length} jugados</small></h3>`
      }

      const blocks =
        season.fixtures.mode === 'double'
          ? `${phaseHead('Ida', 0, half)}${rounds.slice(0, half).map((r, i) => roundBlock(r, i)).join('')}
             ${phaseHead('Vuelta', half, rounds.length)}${rounds.slice(half).map((r, i) => roundBlock(r, i + half)).join('')}`
          : rounds.map(roundBlock).join('')

      const jump = `
        <nav class="fx-jump" aria-label="Ir a jornada" data-export-hide>
          ${rounds
            .map((r, i) => {
              const done = r.every(H.played)
              return `<button type="button" class="fx-jump-btn${done ? ' is-done' : ''}${i === currentIndex ? ' is-current' : ''}" data-action="jump" data-round="${i}" aria-label="Ir a jornada ${i + 1}">${i + 1}</button>`
            })
            .join('')}
        </nav>`

      el.innerHTML = `
        <div class="panel-grid panel-grid--even">
          ${config}
          ${fieldsCard}
          <article class="card card--wide" id="fx-export">
            <header class="card-head">
              <div>
                <h2 class="card-title">Todas las jornadas</h2>
                <p class="card-sub">Temporada ${season.number} · ${rounds.length} jornadas · ${all.filter(H.played).length}/${all.length} partidos jugados</p>
              </div>
              <div class="row-actions">
                ${H.exportButton('#fx-export', 'fixture')}
              </div>
            </header>
            ${jump}
            <div class="fx-rounds">${blocks}${finalissimaBlock}</div>
            <p class="hint" data-export-hide>Escribe los goles directamente en cada partido: la tabla se actualiza al instante y todo queda guardado.</p>
          </article>
        </div>`
    },
  })
})()
