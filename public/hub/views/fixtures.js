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
    const hasResults = H.leagueMatches(season).some(H.played)
    if (season.fixtures) {
      const msg = hasResults
        ? 'Se generará un calendario nuevo y se perderán los resultados de liga cargados.'
        : 'Se reemplazará el calendario actual.'
      if (!(await H.confirm(msg, { confirmText: 'Generar' }))) return
    }
    H.ui.round = 0
    H.update((s) => {
      s.current.fixtures = { mode, rounds: H.generateRounds(s.current.teams.map((t) => t.id), mode === 'double') }
    })
    H.toast('Calendario generado')
  }

  async function removeFixtures() {
    if (!(await H.confirm('Se eliminará el calendario y todos sus resultados.', { confirmText: 'Eliminar' }))) return
    H.ui.round = 0
    H.update((s) => (s.current.fixtures = null))
  }

  function findMatch(s, id) {
    for (const r of s.current.fixtures?.rounds || []) {
      const m = r.find((x) => x.id === id)
      if (m) return m
    }
    return null
  }

  H.view('fixtures', {
    bind(el) {
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]')
        if (!btn) return
        const { action } = btn.dataset
        if (action === 'mode') {
          H.ui.fxMode = btn.dataset.mode
          H.render()
        } else if (action === 'generate') generate()
        else if (action === 'remove') removeFixtures()
        else if (action === 'round') {
          H.ui.round = Number(btn.dataset.round)
          H.render()
        } else if (action === 'clear-round') {
          const ri = H.ui.round
          H.update((s) => s.current.fixtures.rounds[ri]?.forEach((m) => ((m.hg = null), (m.ag = null))))
        }
      })
      el.addEventListener('input', (e) => {
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
        const card = input.closest('.match')
        if (card) card.classList.toggle('is-played', [...card.querySelectorAll('input')].every((i) => H.parseScore(i.value) != null))
      })
      el.addEventListener('change', (e) => {
        if (e.target.closest('[data-match]')) H.render()
      })
    },

    render(el, s) {
      const season = s.current
      const teams = new Map(season.teams.map((t) => [t.id, t]))
      const mode = H.ui.fxMode || season.fixtures?.mode || 'single'
      const n = season.teams.length
      const roundsFor = (m) => (n < 2 ? 0 : (n % 2 ? n : n - 1) * (m === 'double' ? 2 : 1))
      const matchesFor = (m) => (n < 2 ? 0 : ((n * (n - 1)) / 2) * (m === 'double' ? 2 : 1))

      const config = `
        <article class="card">
          <header class="card-head">
            <div>
              <h2 class="card-title">Calendario</h2>
              <p class="card-sub">Temporada ${season.number} · ${n} equipos</p>
            </div>
          </header>
          <div class="seg" role="group" aria-label="Formato">
            <button class="seg-btn" data-action="mode" data-mode="single" aria-pressed="${mode === 'single'}">Solo ida</button>
            <button class="seg-btn" data-action="mode" data-mode="double" aria-pressed="${mode === 'double'}">Ida y vuelta</button>
          </div>
          <p class="hint">${n < 2 ? 'Registra al menos 2 equipos.' : `${roundsFor(mode)} jornadas · ${matchesFor(mode)} partidos${n % 2 ? ' · un equipo descansa por jornada' : ''}`}</p>
          <div class="row-actions">
            <button class="btn btn--primary" data-action="generate" ${n < 2 ? 'disabled' : ''}>${season.fixtures ? 'Regenerar calendario' : 'Generar calendario'}</button>
            ${season.fixtures ? '<button class="btn btn--danger" data-action="remove">Eliminar</button>' : ''}
          </div>
          ${teamsChanged(season) ? '<p class="notice">Los equipos cambiaron desde que se generó el calendario. Regenera para incluirlos a todos.</p>' : ''}
        </article>`

      if (!season.fixtures) {
        el.innerHTML = `<div class="panel-grid">${config}<article class="card"><p class="empty">Elige el formato y genera las jornadas. Los resultados que cargues actualizarán la tabla en vivo.</p></article></div>`
        return
      }

      const rounds = season.fixtures.rounds
      const ri = Math.min(H.ui.round, rounds.length - 1)
      H.ui.round = ri
      const round = rounds[ri]
      const half = season.fixtures.mode === 'double' ? rounds.length / 2 : Infinity

      const nav = `
        <nav class="round-nav" aria-label="Jornadas">
          ${rounds
            .map((r, i) => {
              const done = r.every(H.played)
              const some = r.some(H.played)
              return `<button class="round-chip${done ? ' is-done' : some ? ' is-partial' : ''}" data-action="round" data-round="${i}"
                aria-current="${i === ri}" aria-label="Jornada ${i + 1}${done ? ', completa' : ''}">${i + 1}</button>`
            })
            .join('')}
        </nav>`

      const side = (team) => `
        <span class="match-team">${crest(team?.logo, 'sm', team?.name)}<span class="match-name">${esc(team?.name || '—')}</span></span>`

      const matches = round
        .map((m) => {
          const h = teams.get(m.home)
          const a = teams.get(m.away)
          return `
            <li class="match${H.played(m) ? ' is-played' : ''}">
              ${side(h)}
              <span class="score">
                <input class="score-input" type="number" inputmode="numeric" min="0" max="99" value="${m.hg ?? ''}"
                  data-key="fx:${esc(m.id)}:hg" data-match="${esc(m.id)}" data-side="hg" aria-label="Goles de ${esc(h?.name)}">
                <span class="score-sep" aria-hidden="true">-</span>
                <input class="score-input" type="number" inputmode="numeric" min="0" max="99" value="${m.ag ?? ''}"
                  data-key="fx:${esc(m.id)}:ag" data-match="${esc(m.id)}" data-side="ag" aria-label="Goles de ${esc(a?.name)}">
              </span>
              <span class="match-team match-team--away">${crest(a?.logo, 'sm', a?.name)}<span class="match-name">${esc(a?.name || '—')}</span></span>
            </li>`
        })
        .join('')

      const resting = season.teams.filter((t) => !round.some((m) => m.home === t.id || m.away === t.id))

      const allRounds = `
        <article class="card card--wide">
          <header class="card-head"><div><h2 class="card-title">Todas las jornadas</h2><p class="card-sub">Desliza para consultar el calendario completo y los equipos que descansan</p></div></header>
          <div class="all-rounds-scroll" data-scroll="all-rounds">
            ${rounds.map((r, idx) => {
              const rests = season.teams.filter((t) => !r.some((m) => m.home === t.id || m.away === t.id))
              return `<section class="round-summary"><h3>Jornada ${idx + 1}</h3><p class="round-summary-meta">${r.filter(H.played).length}/${r.length} partidos jugados</p>
                <ul>${r.map((m) => `<li><span>${esc(teams.get(m.home)?.name || '—')}</span><b>${H.played(m) ? `${m.hg} - ${m.ag}` : 'vs'}</b><span>${esc(teams.get(m.away)?.name || '—')}</span></li>`).join('')}</ul>
                <p class="round-rest">${rests.length ? `Descansa: ${rests.map(t => esc(t.name)).join(', ')}` : 'Nadie descansa'}</p>
                <button class="btn btn--ghost btn--sm" data-action="round" data-round="${idx}">Editar jornada</button>
              </section>`
            }).join('')}
          </div>
        </article>`
      el.innerHTML = `
        <div class="panel-grid">
          ${config}
          <article class="card card--wide">
            <header class="card-head">
              <div>
                <h2 class="card-title">Jornada ${ri + 1}</h2>
                <p class="card-sub">${season.fixtures.mode === 'double' ? (ri < half ? 'Ida' : 'Vuelta') : 'Solo ida'} · ${round.filter(H.played).length}/${round.length} jugados</p>
              </div>
              <div class="row-actions">
                <button class="btn btn--ghost btn--sm" data-action="round" data-round="${Math.max(0, ri - 1)}" ${ri === 0 ? 'disabled' : ''} aria-label="Jornada anterior">Anterior</button>
                <button class="btn btn--ghost btn--sm" data-action="round" data-round="${Math.min(rounds.length - 1, ri + 1)}" ${ri === rounds.length - 1 ? 'disabled' : ''} aria-label="Jornada siguiente">Siguiente</button>
              </div>
            </header>
            ${nav}
            <ul class="match-list">${matches}</ul>
            <div class="card-foot">
              <p class="hint">${resting.length ? `Descansa: ${resting.map((t) => esc(t.name)).join(', ')}` : 'Los resultados se reflejan en la tabla al instante.'}</p>
              ${round.some(H.played) ? '<button class="btn btn--ghost btn--sm" data-action="clear-round">Limpiar jornada</button>' : ''}
            </div>
          </article>
          ${allRounds}
        </div>`
    },
  })
})()
