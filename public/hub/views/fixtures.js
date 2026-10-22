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
    } else if (season.manual && Object.keys(season.manual.rows).length) {
      if (!(await H.confirm('La tabla editada manualmente se reemplazará por los resultados del calendario.', { confirmText: 'Generar' }))) return
    }
    H.update((s) => {
      s.current.fixtures = { mode, rounds: H.generateRounds(s.current.teams.map((t) => t.id), mode === 'double') }
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
        else if (action === 'jump') {
          el.querySelector(`#fx-round-${btn.dataset.round}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        } else if (action === 'clear-round') {
          const ri = Number(btn.dataset.round)
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
        const block = input.closest('.fx-round')
        if (block) refreshBlock(block)
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
        el.innerHTML = `<div class="panel-grid">${config}<article class="card"><p class="empty">Elige el formato y genera las jornadas. Los resultados que cargues actualizarán la tabla en vivo. Si prefieres no usar calendario, puedes editar la tabla a mano en <a href="#table">Table</a>.</p></article></div>`
        return
      }

      const rounds = season.fixtures.rounds
      const half = season.fixtures.mode === 'double' ? rounds.length / 2 : Infinity
      const all = H.leagueMatches(season)

      const team = (t, away) => {
        const name = `<span class="fx-name" title="${esc(t?.name || '')}">${esc(t?.name || '—')}</span>`
        const logo = crest(t?.logo, 'sm', t?.name)
        return `<span class="fx-team fx-team--${away ? 'away' : 'home'}">${away ? logo + name : name + logo}</span>`
      }

      const score = (m, sideKey, t) =>
        `<input class="score-input score-input--sm" type="number" inputmode="numeric" min="0" max="99" value="${m[sideKey] ?? ''}"
          data-key="fx:${esc(m.id)}:${sideKey}" data-match="${esc(m.id)}" data-side="${sideKey}" aria-label="Goles de ${esc(t?.name)}">`

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
                  return `<li class="fx-match${played ? ` is-played is-${res}` : ''}" aria-label="${esc(h?.name || '')} contra ${esc(a?.name || '')}">
                    <span class="fx-idx" aria-hidden="true">${mi + 1}</span>
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
        <div class="panel-grid">
          ${config}
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
            <div class="fx-rounds">${blocks}</div>
            <p class="hint" data-export-hide>Escribe los goles directamente en cada partido: la tabla se actualiza al instante y todo queda guardado.</p>
          </article>
        </div>`
    },
  })
})()
