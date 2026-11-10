;(() => {
  const H = window.Hub
  const { esc, crest } = H
  const timers = { summary: 0, records: 0 }
  const resumeTimers = { summary: 0, records: 0 }
  const brandImageCache = new Map()
  const POINTS_BADGE_ICON = '<svg class="stat-icon badge-icon-svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 30.38 12 43l12-6 12 6-3-12.62"/><circle cx="24" cy="19" r="14"/><path d="m24 11 2.4 5 5.6.8-4 3.9.9 5.6-4.9-2.7-4.9 2.7.9-5.6-4-3.9 5.6-.8z"/></svg>'
  const ARROW_UP_RIGHT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>'
  const ARROW_RIGHT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16m-7-7 7 7-7 7"/></svg>'
  let restartVisibleTimers = () => {}
  let heroLogoTimer = 0
  let heroLogoIndex = 0
  let heroFirstChangePending = true
  let heroMenuRoot = null

  function shuffled(items) {
    const result = [...items]
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1))
      ;[result[index], result[other]] = [result[other], result[index]]
    }
    return result
  }

  function stopHeroLogoRotation() {
    clearTimeout(heroLogoTimer)
    heroLogoTimer = 0
  }

  function scheduleHeroLogoRotation(el) {
    stopHeroLogoRotation()
    const root = el || heroMenuRoot
    const section = document.getElementById('menu')
    if (document.hidden || !section || section.hidden || !root?.isConnected) return
    let logos = [...root.querySelectorAll('.menu-hero-logo')]
    if (logos.length < 2) return
    heroLogoTimer = window.setTimeout(() => {
      heroLogoTimer = 0
      let current = [...root.querySelectorAll('.menu-hero-logo')]
      if (document.hidden || section.hidden || !root.isConnected || current.length < 2) return
      let nextIndex = heroLogoIndex + 1
      if (nextIndex >= current.length) {
        const brand = current[0]
        const active = current.find((image) => image.classList.contains('is-active'))
        const teams = shuffled(current.slice(1))
        if (teams.length === 1) nextIndex = 0
        else if (teams[0].dataset.logoSource === active?.dataset.logoSource) {
          ;[teams[0], teams[1]] = [teams[1], teams[0]]
        }
        if (teams.length > 1) {
          root.querySelector('.menu-emblem-orbit')?.append(brand, ...teams)
          current = [brand, ...teams]
          nextIndex = 1
        }
      }
      const next = current[nextIndex]
      let activated = false
      const activateNext = () => {
        if (activated || document.hidden || section.hidden || !next.isConnected) return
        activated = true
        root.querySelector('.menu-hero-logo.is-active')?.classList.remove('is-active')
        heroLogoIndex = nextIndex
        if (nextIndex !== 0) heroFirstChangePending = false
        next.classList.add('is-active')
        scheduleHeroLogoRotation(root)
      }
      if (!next.getAttribute('src') && next.dataset.src) {
        next.addEventListener('load', activateNext, { once: true })
        next.addEventListener('error', activateNext, { once: true })
        next.src = next.dataset.src
        if (next.complete && next.naturalWidth) activateNext()
      } else activateNext()
    }, heroFirstChangePending ? 15000 : 6800)
  }

  function initializeHeroLogoRotation(el) {
    stopHeroLogoRotation()
    heroMenuRoot = el
    heroLogoIndex = 0
    heroFirstChangePending = true
    scheduleHeroLogoRotation()
  }
  document.addEventListener('app:sectionchange', (event) => {
    if (event.detail?.id !== 'menu') {
      stopHeroLogoRotation()
      Object.keys(timers).forEach((key) => {
        clearInterval(timers[key])
        clearTimeout(resumeTimers[key])
        timers[key] = 0
      })
    }
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      stopHeroLogoRotation()
      Object.keys(timers).forEach((key) => {
        clearInterval(timers[key])
        clearTimeout(resumeTimers[key])
        timers[key] = 0
      })
    } else {
      restartVisibleTimers()
      scheduleHeroLogoRotation()
    }
  })

  const lastLogo = (record) => record.seasons.at(-1)?.logo || record.logos.at(-1) || ''
  const rankSlide = (title, icon, records, value) => `<article class="menu-slide"><h3 class="menu-slide-title">${icon === 'points25' ? POINTS_BADGE_ICON : H.ICONS[icon]}<span>${title}</span></h3>${records.length ? `<ol>${records.map((record) => `<li>${crest(lastLogo(record), 'xs', record.name)}<span>${esc(record.name)}</span><strong>${value(record)}</strong></li>`).join('')}</ol>` : '<p class="empty">Aún no hay datos.</p>'}</article>`

  function sharpenBrandImage(el, source) {
    if (!source || source.startsWith('data:image/svg+xml') || /\.svg(?:[?#]|$)/i.test(source)) return
    const image = el.querySelector('.menu-hero-logo')
    if (!image || !source.startsWith('data:image/')) return
    if (brandImageCache.has(source)) {
      image.src = brandImageCache.get(source)
      return
    }
    const original = new Image()
    original.onload = () => {
      if (!original.naturalWidth || Math.max(original.naturalWidth, original.naturalHeight) >= 1024) return
      try {
        const scale = 1024 / Math.max(original.naturalWidth, original.naturalHeight)
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(original.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(original.naturalHeight * scale))
        const context = canvas.getContext('2d')
        if (!context) return
        context.imageSmoothingEnabled = true
        context.imageSmoothingQuality = 'high'
        context.drawImage(original, 0, 0, canvas.width, canvas.height)
        const highResolution = canvas.toDataURL('image/png')
        brandImageCache.set(source, highResolution)
        if (brandImageCache.size > 3) brandImageCache.delete(brandImageCache.keys().next().value)
        const currentImage = el.querySelector('.menu-hero-logo')
        if (currentImage?.src === source) currentImage.src = highResolution
      } catch {}
    }
    original.src = source
  }

  function honorsTile(label, team) {
    return `<div class="menu-honor-tile"><span class="menu-honor-label">${label}</span>${team ? `<span class="menu-honor-team">${crest(team.logo, 'sm', team.name)}<strong>${esc(team.name)}</strong></span>` : '<strong class="menu-honor-pending">Por decidir</strong>'}</div>`
  }

  function honorsTeamsTile(label, teams) {
    return `<div class="menu-honor-tile"><span class="menu-honor-label">${label}</span>${teams.length ? `<span class="menu-honor-winners">${teams.map((team) => `<span class="menu-honor-team" title="${esc(team.name)}">${crest(team.logo, 'xs', team.name)}<strong>${esc(team.name)}</strong></span>`).join('')}</span>` : '<strong class="menu-honor-pending">Por decidir</strong>'}</div>`
  }

  function heroMarkup(state, season, stats) {
    const current = state.current || {}
    const currentTeams = current.teams || []
    const groups = season?.tableConfig?.type === 'groups'
    const leagueWinner = stats.find((team) => team.leagueChampion || team.seriesChampion)
    const groupWinners = stats.filter((team) => team.groupChampion)
    const seriesWinners = stats.filter((team) => team.seriesChampion)
    const logo = state.brandLogo || 'logo.svg'
    const recentSeasonLogos = [...state.seasons]
      .sort((a, b) => b.number - a.number)
      .flatMap((saved) => (saved.teams || []).map((team) => team.logo))
    const teamLogos = [...currentTeams.map((team) => team.logo), ...recentSeasonLogos]
    const logoSources = [logo, ...shuffled([...new Set(teamLogos.filter((source) => source && source !== logo))].slice(0, 17))].filter(Boolean)
    const logoMarkup = logoSources.map((source, index) => `<img class="menu-hero-logo${index === 0 ? ' is-active' : ''}" data-logo-source="${esc(source)}" ${index === 0 ? `src="${esc(source)}"` : `data-src="${esc(source)}"`} alt="" decoding="async">`).join('')
    const leagueHonors = groups
      ? honorsTeamsTile('Campeones de grupo', groupWinners)
      : season?.tableConfig?.type === 'two-series'
        ? honorsTeamsTile('Campeones de serie', seriesWinners)
        : honorsTile('Campeón de liga', leagueWinner)
    return `<section class="menu-hero"><div class="menu-hero-copy"><p class="menu-hero-kicker">LEAGUE HUB</p><h2>La temporada<br><em>inicia</em></h2><div class="menu-hero-meta"><span class="menu-season-chip">TEMPORADA ${esc(String(current.number || season?.number || '—'))}</span><span>${currentTeams.length} equipos registrados</span></div><div class="menu-hero-actions"><a class="menu-hero-button menu-hero-button--primary" href="#teams">Continuar temporada <span class="menu-arrow-icon">${ARROW_UP_RIGHT}</span></a><a class="menu-hero-button" href="#table">Ver clasificación <span class="menu-arrow-icon">${ARROW_RIGHT}</span></a></div></div><div class="menu-hero-showcase" aria-hidden="true"><div class="menu-emblem-orbit">${logoMarkup}</div></div><div class="menu-honors"><span class="menu-honors-heading">ÚLTIMA GLORIA <i>${season ? `TEMPORADA ${esc(String(season.number))}` : 'SIN TEMPORADAS'}</i></span>${honorsTile('Campeón de Tournament', stats.find((team) => team.cupChampion))}${leagueHonors}</div></section>`
  }

  function metricsMarkup(state, records) {
    const current = state.current || {}
    const totals = records.reduce((sum, record) => ({ titles: sum.titles + record.total.titles, achievements: sum.achievements + record.total.achievements }), { titles: 0, achievements: 0 })
    const metrics = [
      ['calendar', 'Temporada actual', current.number || '—', 'EN PREPARACIÓN'],
      ['teams', 'Equipos activos', (current.teams || []).length, 'EN LA LIGA'],
      ['trophy', 'Títulos históricos', totals.titles, 'EN EL PALMARÉS'],
      ['star', 'Logros acumulados', totals.achievements, 'HITOS DE TEMPORADA'],
    ]
    return `<section class="menu-intel"><header class="menu-section-head"><div><span class="menu-section-kicker">PANEL DE TEMPORADA</span><h2>Datos de la liga</h2></div></header><div class="menu-stat-grid">${metrics.map(([icon, label, value, caption], index) => `<article class="menu-stat-card menu-stat-card--${index + 1}"><span class="menu-stat-icon${icon === 'teams' ? ' menu-stat-icon--teams' : ''}">${icon === 'teams' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.1"/><path d="M3.5 19v-1.2a5.5 5.5 0 0 1 11 0V19z"/><path d="M16 5.2a3 3 0 0 1 0 5.7M17 14a4.5 4.5 0 0 1 3.5 4.4V19h-3"/></svg>' : H.ICONS[icon]}</span><div class="menu-stat-reading"><span class="menu-stat-label">${label}</span><div class="menu-stat-value"><strong>${value}</strong><small>${caption}</small></div></div></article>`).join('')}</div></section>`
  }

  function quickDeck() {
    const links = [
      ['teams', 'Registrar equipos', 'Arma la próxima jornada'],
      ['table', 'Clasificación', 'La carrera por el título'],
      ['tournament', 'Tournament', 'Todo se decide aquí'],
      ['history', 'History', 'El legado de la liga'],
      ['performance', 'Performance', 'Números de cada club'],
      ['settings', 'Settings', 'Ajustes de la app'],
    ]
    return `<section class="menu-command"><header class="menu-section-head"><div><span class="menu-section-kicker">PUNTO DE PARTIDA</span><h2>Acceso rápido</h2></div><span class="menu-command-hint">ELIGE TU PRÓXIMA JUGADA</span></header><nav class="menu-quick">${links.map(([href, label, sub], index) => `<a class="menu-quick-card" href="#${href}"><span class="menu-quick-number">0${index + 1}</span><span class="menu-quick-copy"><strong>${label}</strong><small>${sub}</small></span><span class="menu-quick-arrow" aria-hidden="true">${ARROW_UP_RIGHT}</span></a>`).join('')}</nav></section>`
  }

  function matchPanel(label, match, season) {
    const home = season.teams.find((team) => team.id === match?.home)
    const away = season.teams.find((team) => team.id === match?.away)
    const penalties = match?.tied && match?.decided ? `<div class="menu-match-pens">Penales ${match.hp}–${match.ap}</div>` : ''
    return `<article class="menu-match-card"><h4>${label}</h4>${home ? `<img class="menu-crest-watermark menu-crest-watermark--home" src="${esc(home.logo)}" alt="" loading="lazy">` : ''}${away ? `<img class="menu-crest-watermark menu-crest-watermark--away" src="${esc(away.logo)}" alt="" loading="lazy">` : ''}<div class="menu-match-score"><span class="${match?.winner === match?.home ? 'is-champion' : ''}">${match?.hg ?? '–'}</span> <i>:</i> <span class="${match?.winner === match?.away ? 'is-champion' : ''}">${match?.ag ?? '–'}</span></div><div class="menu-match-names"><span>${esc(home?.name || 'Por definir')}</span><span>${esc(away?.name || 'Por definir')}</span></div>${penalties}</article>`
  }

  function render(el, state) {
    Object.keys(timers).forEach((key) => {
      clearInterval(timers[key])
      clearTimeout(resumeTimers[key])
      timers[key] = 0
    })
    const season = [...state.seasons].sort((a, b) => b.number - a.number)[0]
    const stats = season ? H.seasonStats(season) : []
    const records = H.teamRecords().map((record) => ({ ...record, total: H.teamTotals(record) }))
    if (!season) {
      el.innerHTML = `<div class="menu-stage">${heroMarkup(state, null, [])}${metricsMarkup(state, records)}<article class="menu-first-season"><div class="menu-first-season-icon">${H.ICONS.trophy}</div><div><span class="menu-section-kicker">NUEVA CAMPAÑA</span><h2>Escribe el primer capítulo.</h2><p>Registra tus equipos y prepara una liga que todos recordarán.</p></div><a class="menu-hero-button menu-hero-button--primary" href="#teams">Crear temporada <span>↗</span></a></article>${quickDeck()}</div>`
      sharpenBrandImage(el, state.brandLogo)
      initializeHeroLogoRotation(el)
      return
    }

    const bracket = H.computeBracket(season)
    const finalissima = H.finalissimaMatch(season)
    const supercup = season.playoffs?.supercup?.enabled ? H.supercupMatch(season, bracket) : null
    const specialFinals = finalissima?.played && supercup?.played
      ? `${matchPanel('Finalísima de Series', finalissima, season)}${matchPanel('Supercopa', supercup, season)}`
      : ''
    const parts = H.seasonMenuParts?.(season)
    const topTitles = [...records].sort((a, b) => b.total.titles - a.total.titles).slice(0, 5)
    const topAchievements = [...records].sort((a, b) => b.total.achievements - a.total.achievements).slice(0, 5)
    const topBadges = [...records].map((record) => ({ ...record, badgeTotal: H.badgeCount?.(record) || 0 })).sort((a, b) => b.badgeTotal - a.badgeTotal).slice(0, 5)
    const topScorers = [...records].sort((a, b) => b.total.goals - a.total.goals).slice(0, 5)
    const topPoints = [...records].sort((a, b) => b.total.points - a.total.points).slice(0, 5)
    const finalSlides = [
      `<article class="menu-slide"><h3>Tabla · Temporada ${season.number}</h3>${parts?.table || `<ol>${H.computeTable(season).slice(0, 5).map((row) => `<li>${crest(row.team.logo, 'xs', row.team.name)}<span>${esc(row.team.name)}</span><strong>${row.pts} pts</strong></li>`).join('')}</ol>`}</article>`,
      `<article class="menu-slide"><h3>Fixtures · Temporada ${season.number}</h3>${parts?.fixtures || '<p class="empty">No hay Fixtures guardados.</p>'}</article>`,
      `<article class="menu-slide"><h3>Tournament · Temporada ${season.number}</h3>${parts?.tournament || '<p class="empty">No hay Tournament guardado.</p>'}</article>`,
      `<article class="menu-slide"><h3>Final y tercer lugar</h3><div class="menu-final-pair">${bracket ? `${matchPanel('Final', bracket.final, season)}${matchPanel('Tercer lugar', bracket.third, season)}${specialFinals}` : '<p class="empty">No hay resultados de Tournament guardados.</p>'}</div></article>`,
    ]
    const recordSlides = [
      rankSlide('Top 5 · Títulos', 'trophy', topTitles, (record) => record.total.titles),
      rankSlide('Top 5 · Logros', 'star', topAchievements, (record) => record.total.achievements),
      rankSlide('Top 5 · Insignias', 'medal1', topBadges, (record) => record.badgeTotal),
      rankSlide('Top 5 · Goleadores', 'ball', topScorers, (record) => record.total.goals),
      rankSlide('Top 5 · Puntos', 'points25', topPoints, (record) => `${record.total.points} pts`),
    ]
    el.innerHTML = `<div class="menu-stage">${heroMarkup(state, season, stats)}${metricsMarkup(state, records)}<div class="panel-grid menu-layout"><article class="card menu-feature-card menu-feature-card--season"><header class="card-head"><div><span class="menu-section-kicker">ARCHIVO DE CAMPAÑA</span><h2 class="card-title">Última temporada</h2><p class="card-sub">Temporada ${season.number} · ${season.teams.length} equipos</p></div><div class="menu-dots" data-dots="summary" role="group" aria-label="Apartados de Última temporada"></div></header><div class="menu-carousel" data-carousel="summary">${finalSlides.join('')}</div></article><div class="menu-side-stack"><article class="card menu-feature-card menu-feature-card--records"><header class="card-head"><div><span class="menu-section-kicker">HALL OF FAME</span><h2 class="card-title">Récords de la liga</h2></div><div class="menu-dots" data-dots="records" role="group" aria-label="Récords de la liga"></div></header><div class="menu-carousel" data-carousel="records">${recordSlides.join('')}</div></article>${quickDeck()}</div></div></div>`
    sharpenBrandImage(el, state.brandLogo)
    initializeHeroLogoRotation(el)

    const indexes = { summary: 0, records: 0 }
    const draw = (key, direction = 0) => {
      const carousel = el.querySelector(`[data-carousel="${key}"]`)
      const slides = [...carousel.children]
      carousel.dataset.motion = direction < 0 ? 'backward' : 'forward'
      slides.forEach((slide, index) => slide.classList.toggle('is-active', index === indexes[key]))
      const dots = el.querySelector(`[data-dots="${key}"]`)
      dots.innerHTML = slides.map((_, index) => `<button type="button" class="menu-dot${index === indexes[key] ? ' is-active' : ''}" data-slide-to="${index}" aria-label="Mostrar apartado ${index + 1}" aria-pressed="${index === indexes[key]}"><span></span></button>`).join('')
      if (key === 'summary' && indexes.summary === 2) {
        requestAnimationFrame(() => {
          const map = carousel.querySelector('.is-active .season-mini-bracket')
          const finalColumn = map?.querySelector('.season-mini-col--final')
          if (!map || !finalColumn) return
          const target = finalColumn.offsetLeft - (map.clientWidth - finalColumn.offsetWidth) / 2
          map.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
        })
      }
    }
    const move = (key, direction) => {
      const count = el.querySelector(`[data-carousel="${key}"]`).children.length
      indexes[key] = (indexes[key] + direction + count) % count
      draw(key, direction)
    }
    const startAuto = (key) => {
      if (document.visibilityState === 'hidden' || document.getElementById('menu')?.hidden) return
      clearInterval(timers[key])
      timers[key] = window.setInterval(() => move(key, 1), 6500)
    }
    restartVisibleTimers = () => {
      if (document.getElementById('menu')?.hidden) return
      Object.keys(timers).forEach((key) => startAuto(key))
    }
    const pauseAuto = (key) => {
      clearInterval(timers[key])
      clearTimeout(resumeTimers[key])
      timers[key] = 0
    }
    const resumeAuto = (key) => {
      clearTimeout(resumeTimers[key])
      resumeTimers[key] = window.setTimeout(() => startAuto(key), 8000)
    }
    ;['summary', 'records'].forEach((key) => {
      el.querySelector(`[data-dots="${key}"]`).addEventListener('click', (event) => {
        const dot = event.target.closest('[data-slide-to]')
        if (!dot) return
        pauseAuto(key)
        const next = Number(dot.dataset.slideTo)
        const direction = next === indexes[key] ? 0 : next > indexes[key] ? 1 : -1
        indexes[key] = next
        draw(key, direction)
        resumeAuto(key)
      })
    })
    ;['summary', 'records'].forEach((key) => {
      draw(key)
      const carousel = el.querySelector(`[data-carousel="${key}"]`)
      let startX = null
      let startY = null
      let touchGesture = null
      const findHorizontalScroller = (target) => {
        let node = target instanceof Element ? target : target?.parentElement
        const directScroller = node?.closest('.season-mini-bracket, .bracket--map, .season-standing-table-wrap, .table-wrap')
        if (directScroller && carousel.contains(directScroller)) return directScroller
        while (node && node !== carousel) {
          const overflowX = getComputedStyle(node).overflowX
          if (node.scrollWidth > node.clientWidth + 2 && (overflowX === 'auto' || overflowX === 'scroll')) return node
          node = node.parentElement
        }
        return null
      }
      carousel.querySelectorAll('.season-mini-bracket').forEach((map) => {
        let pointerDrag = null
        map.addEventListener('pointerdown', (event) => {
          if (event.pointerType !== 'mouse' || event.button !== 0) return
          pointerDrag = { pointerId: event.pointerId, x: event.clientX, scrollLeft: map.scrollLeft }
          map.dataset.dragging = 'true'
          map.setPointerCapture?.(event.pointerId)
        })
        map.addEventListener('pointermove', (event) => {
          if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return
          map.scrollLeft = pointerDrag.scrollLeft - (event.clientX - pointerDrag.x)
          if (event.cancelable) event.preventDefault()
        })
        const finishPointerDrag = (event) => {
          if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return
          pointerDrag = null
          delete map.dataset.dragging
        }
        map.addEventListener('pointerup', finishPointerDrag)
        map.addEventListener('pointercancel', finishPointerDrag)
        map.addEventListener('lostpointercapture', finishPointerDrag)
      })
      carousel.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'mouse') return
        pauseAuto(key)
        if (event.button != null && event.button !== 0) return
        if (findHorizontalScroller(event.target)) return
        startX = event.clientX
        startY = event.clientY
      }, { passive: true })
      carousel.addEventListener('pointermove', (event) => {
        if (startX == null || startY == null) return
        const dx = event.clientX - startX
        const dy = event.clientY - startY
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          carousel.dataset.dragging = 'true'
          event.preventDefault()
        }
      })
      carousel.addEventListener('pointerup', (event) => {
        if (event.pointerType !== 'mouse') return
        const delta = startX == null ? 0 : event.clientX - startX
        startX = null
        startY = null
        delete carousel.dataset.dragging
        if (Math.abs(delta) > 48) move(key, delta < 0 ? 1 : -1)
        resumeAuto(key)
      }, { passive: true })
      carousel.addEventListener('pointercancel', (event) => {
        if (event.pointerType !== 'mouse') return
        startX = null
        startY = null
        delete carousel.dataset.dragging
        resumeAuto(key)
      }, { passive: true })
      carousel.addEventListener('touchstart', (event) => {
        if (event.touches.length !== 1) { touchGesture = null; return }
        const touch = event.touches[0]
        pauseAuto(key)
        const horizontalScroller = findHorizontalScroller(event.target)
        touchGesture = { x: touch.clientX, y: touch.clientY, lastY: touch.clientY, target: event.target, horizontalScroller, scrollLeft: horizontalScroller?.scrollLeft || 0 }
      }, { passive: true })
      carousel.addEventListener('touchmove', (event) => {
        if (!touchGesture || event.touches.length !== 1) return
        const touch = event.touches[0]
        const dx = touch.clientX - touchGesture.x
        const dy = touch.clientY - touchGesture.y
        // A nested map owns its horizontal gesture. Let the WebView perform
        // native scrolling instead of cancelling the touch and emulating it.
        if (touchGesture.horizontalScroller?.matches('.season-mini-bracket, .bracket--map')) {
          touchGesture.lastY = touch.clientY
          return
        }
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          if (touchGesture.horizontalScroller) {
            touchGesture.innerHorizontal = true
            event.preventDefault()
            touchGesture.horizontalScroller.scrollLeft = touchGesture.scrollLeft - dx
          } else {
            touchGesture.horizontal = true
            event.preventDefault()
          }
        } else if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          const slide = carousel.querySelector('.menu-slide.is-active')
          const canScrollSlide = slide && (dy < 0
            ? slide.scrollTop + slide.clientHeight < slide.scrollHeight - 1
            : slide.scrollTop > 0)
          if (!canScrollSlide) {
            event.preventDefault()
            const content = document.querySelector('.content')
            if (content) content.scrollTop -= touch.clientY - touchGesture.lastY
          }
        }
        touchGesture.lastY = touch.clientY
      }, { passive: false })
      carousel.addEventListener('touchend', (event) => {
        const gesture = touchGesture
        touchGesture = null
        if (gesture && !gesture.horizontalScroller && gesture.horizontal && event.changedTouches.length) {
          const delta = event.changedTouches[0].clientX - gesture.x
          if (Math.abs(delta) > 48) move(key, delta < 0 ? 1 : -1)
        }
        resumeAuto(key)
      }, { passive: true })
      carousel.addEventListener('touchcancel', () => { touchGesture = null; resumeAuto(key) }, { passive: true })
      carousel.addEventListener('scroll', () => { pauseAuto(key); resumeAuto(key) }, { passive: true, capture: true })
      carousel.addEventListener('wheel', () => { pauseAuto(key); resumeAuto(key) }, { passive: true })
      carousel.addEventListener('focusin', () => pauseAuto(key))
      carousel.addEventListener('focusout', () => resumeAuto(key))
      startAuto(key)
    })
    H.watchMiniBrackets?.(el)
  }
  H.view('menu', { bind() {}, render })
})()
