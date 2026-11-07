(() => {
  const DEFAULT_SECTION = 'menu'
  const buttons = Array.from(document.querySelectorAll('.nav-button:not(.mobile-menu-nav-button)'))
  const sections = Array.from(document.querySelectorAll('.section'))
  const indicator = document.querySelector('.nav-indicator')
  const list = document.querySelector('.nav-list')
  const menuNav = document.querySelector('[data-menu-nav]')
  const ids = buttons.map((b) => b.dataset.section)
  const mobileBackExit = window.matchMedia('(pointer: coarse)').matches || /android|iphone|ipad|ipod|windows phone/i.test(navigator.userAgent)
  let current = null
  let lastBackPress = 0

  const intro = document.getElementById('app-intro')
  if (intro) {
    const mesh = intro.querySelector('.intro-triangle-mesh')
    if (mesh) {
        const namespace = 'http://www.w3.org/2000/svg'
        const svg = mesh.ownerSVGElement
        const svgRect = svg?.getBoundingClientRect()
        const rotatedPortrait = document.documentElement.classList.contains('force-landscape')
        const renderedWidth = svgRect?.width || window.visualViewport?.width || window.innerWidth || 1200
        const renderedHeight = svgRect?.height || window.visualViewport?.height || window.innerHeight || 800
        const viewportWidth = Math.max(1, rotatedPortrait ? renderedHeight : renderedWidth)
        const viewportHeight = Math.max(1, rotatedPortrait ? renderedWidth : renderedHeight)
        svg?.setAttribute('viewBox', `0 0 ${viewportWidth} ${viewportHeight}`)
        const lowPowerDevice = window.matchMedia('(max-width: 767px)').matches
          || (navigator.deviceMemory && navigator.deviceMemory <= 4)
          || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
        const shortestSide = Math.min(viewportWidth, viewportHeight)
        const side = lowPowerDevice
          ? Math.max(116, Math.min(144, shortestSide / 4.7))
          : Math.max(164, Math.min(196, shortestSide / 5.4))
        const halfSide = side / 2
        const rowHeight = side * Math.sqrt(3) / 2
        const rows = Math.ceil(viewportHeight / rowHeight) + 1
        const columns = Math.ceil(viewportWidth / side) + 2
        const triangles = []
        const triangleFragment = document.createDocumentFragment()
        for (let row = 0; row < rows; row += 1) {
          const topOffset = row % 2 === 0 ? 0 : halfSide
          const y = row * rowHeight
          for (let column = -1; column < columns; column += 1) {
            const x = column * side + topOffset
            const shapes = [
              [[x, y], [x + side, y], [x + halfSide, y + rowHeight]],
              [[x, y], [x - halfSide, y + rowHeight], [x + halfSide, y + rowHeight]],
            ]

            shapes.forEach((vertices, part) => {
              const triangle = document.createElementNS(namespace, 'polygon')
              triangle.setAttribute('points', vertices.map((point) => point.join(',')).join(' '))
              triangle.setAttribute('class', 'intro-triangle')
              const centerX = vertices.reduce((sum, point) => sum + point[0], 0) / 3
              const centerY = vertices.reduce((sum, point) => sum + point[1], 0) / 3
              triangles.push({ triangle, centerX, centerY, part })
            })
          }
        }

        const orderedTriangles = triangles
          .sort((a, b) => ((viewportWidth - a.centerX) + (viewportHeight - a.centerY)) - ((viewportWidth - b.centerX) + (viewportHeight - b.centerY))
            || b.centerY - a.centerY
            || b.centerX - a.centerX
            || a.part - b.part)
        orderedTriangles.forEach(({ triangle }, order) => {
          triangle.style.setProperty('--triangle-delay', `${order * 1.9 / triangles.length}s`)
          triangleFragment.appendChild(triangle)
        })
        mesh.appendChild(triangleFragment)
    }
    let closing = false
    const finishIntro = () => {
      if (closing) return
      closing = true
      intro.classList.add('is-closing')
      window.setTimeout(() => {
        intro.remove()
        document.querySelector('.shell')?.removeAttribute('inert')
      }, 2600)
    }
    document.querySelector('.shell')?.setAttribute('inert', '')
    requestAnimationFrame(() => intro.classList.add('is-playing'))
    window.setTimeout(finishIntro, 4500)
  }

  sections.forEach((section) => {
    const title = section.querySelector('.section-title')
    if (!title) return
    const text = title.textContent.trim()
    title.setAttribute('aria-label', text)
    title.textContent = ''
    Array.from(text).forEach((letter, i) => {
      const span = document.createElement('span')
      span.className = 'char'
      span.setAttribute('aria-hidden', 'true')
      span.style.setProperty('--i', i)
      span.textContent = letter
      title.appendChild(span)
    })
  })

  function moveIndicator(button) {
    indicator.style.width = `${button.offsetWidth}px`
    indicator.style.height = `${button.offsetHeight}px`
    indicator.style.transform = `translate3d(${button.offsetLeft}px, ${button.offsetTop}px, 0)`
    indicator.style.opacity = '1'
  }

  function navigateFromButton(button, event) {
    lastBackPress = 0
    spawnRipple(button, event)
    const id = button.dataset.section
    if (location.hash !== `#${id}`) history.pushState(null, '', `#${id}`)
    activate(id)
  }

  function replay(el, className) {
    el.classList.remove(className)
    void el.offsetWidth
    el.classList.add(className)
  }

  function activeNavButton() {
    if (ids.includes(current)) return buttons[ids.indexOf(current)]
    return current === 'menu' && menuNav?.getClientRects().length ? menuNav : null
  }

  function activate(id, { animate = true } = {}) {
    if (id === 'playoffs') id = 'tournament'
    if (id !== 'menu' && !ids.includes(id)) id = DEFAULT_SECTION
    if (id === current) return
    current = id

    const button = ids.includes(id) ? buttons[ids.indexOf(id)] : null
    buttons.forEach((b) => {
      if (b === button) b.setAttribute('aria-current', 'page')
      else b.removeAttribute('aria-current')
    })
    if (menuNav) {
      if (id === 'menu') menuNav.setAttribute('aria-current', 'page')
      else menuNav.removeAttribute('aria-current')
    }

    sections.forEach((section) => {
      const active = section.id === id
      section.hidden = !active
      if (active && animate) {
        const chars = section.querySelectorAll('.char')
        chars.forEach((c) => { c.style.animation = 'none' })
        replay(section, 'is-entering')
        chars.forEach((c) => { c.style.animation = '' })
      }
    })

    document.dispatchEvent(new CustomEvent('app:sectionchange', { detail: { id } }))
    window.Hub?.render?.()

    const navButton = activeNavButton()
    if (navButton) {
      moveIndicator(navButton)
      const nav = navButton.closest('.nav')
      const navRect = nav.getBoundingClientRect()
      const buttonRect = navButton.getBoundingClientRect()
      const behavior = animate ? 'smooth' : 'auto'
      if (buttonRect.left < navRect.left) nav.scrollBy({ left: buttonRect.left - navRect.left - 8, behavior })
      else if (buttonRect.right > navRect.right) nav.scrollBy({ left: buttonRect.right - navRect.right + 8, behavior })
      if (buttonRect.top < navRect.top) nav.scrollBy({ top: buttonRect.top - navRect.top - 8, behavior })
      else if (buttonRect.bottom > navRect.bottom) nav.scrollBy({ top: buttonRect.bottom - navRect.bottom + 8, behavior })
    } else indicator.style.opacity = '0'
    if (animate && navButton) {
      replay(navButton, 'is-popping')
    }

    document.title = `${button?.getAttribute('aria-label') || 'Menú'} · League Hub`
  }

  function spawnRipple(button, event) {
    const rect = button.getBoundingClientRect()
    const x = event.clientX ? event.clientX - rect.left : rect.width / 2
    const y = event.clientY ? event.clientY - rect.top : rect.height / 2
    const ripple = document.createElement('span')
    ripple.className = 'ripple'
    ripple.style.left = `${x}px`
    ripple.style.top = `${y}px`
    button.appendChild(ripple)
    ripple.addEventListener('animationend', () => ripple.remove())
  }

  buttons.forEach((button, index) => {
    let touchStart = null
    let suppressTouchClickUntil = 0
    button.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch') return
      touchStart = { x: event.clientX, y: event.clientY, id: event.pointerId }
    }, { passive: true })
    button.addEventListener('pointercancel', () => { touchStart = null })
    button.addEventListener('pointerup', (event) => {
      if (event.pointerType !== 'touch' || !touchStart || touchStart.id !== event.pointerId) return
      const moved = Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y)
      touchStart = null
      if (moved > 12 || !button.contains(event.target)) return
      event.preventDefault()
      suppressTouchClickUntil = Date.now() + 700
      navigateFromButton(button, event)
    })
    button.addEventListener('click', (event) => {
      event.preventDefault()
      if (event.detail > 0 && Date.now() < suppressTouchClickUntil) return
      navigateFromButton(button, event)
    })

    button.addEventListener('keydown', (event) => {
      const vertical =
        document.documentElement.classList.contains('ui-desktop') || window.matchMedia('(min-width: 768px)').matches
      const next = vertical ? 'ArrowDown' : 'ArrowRight'
      const prev = vertical ? 'ArrowUp' : 'ArrowLeft'
      let target = null
      if (event.key === next) target = buttons[(index + 1) % buttons.length]
      else if (event.key === prev) target = buttons[(index - 1 + buttons.length) % buttons.length]
      else if (event.key === 'Home') target = buttons[0]
      else if (event.key === 'End') target = buttons[buttons.length - 1]
      if (target) {
        event.preventDefault()
        target.focus()
      }
    })
  })

  const tip = document.createElement('div')
  tip.className = 'nav-tooltip'
  tip.setAttribute('aria-hidden', 'true')
  document.body.appendChild(tip)
  let tipOwner = null
  let tipTimer = null

  function showTip(button) {
    if (tipTimer) clearTimeout(tipTimer)
    tipOwner = button
    const rect = button.getBoundingClientRect()
    tip.textContent = button.getAttribute('aria-label') || ''
    tip.style.left = '0px'
    tip.style.top = '0px'
    const tipRect = tip.getBoundingClientRect()
    const gap = 10
    const canShowRight = rect.right + gap + tipRect.width <= window.innerWidth - 8
    const right = canShowRight || rect.left < tipRect.width + gap + 8
    const left = right
      ? Math.min(window.innerWidth - tipRect.width - 8, rect.right + gap)
      : Math.max(8, rect.left - tipRect.width - gap)
    const top = Math.max(8, Math.min(window.innerHeight - tipRect.height - 8, rect.top + (rect.height - tipRect.height) / 2))
    const rootZoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1
    tip.classList.toggle('is-left', !right)
    tip.style.left = `${left / rootZoom}px`
    tip.style.top = `${top / rootZoom}px`
    tip.classList.add('is-visible')
    // Keep the label brief, especially after a touch on mobile.
    tipTimer = setTimeout(() => hideTip(button), 1600)
  }

  function hideTip(button) {
    if (button && button !== tipOwner) return
    if (tipTimer) clearTimeout(tipTimer)
    tipTimer = null
    tipOwner = null
    tip.classList.remove('is-visible')
  }

  buttons.forEach((button) => {
    button.addEventListener('mouseenter', () => showTip(button))
    button.addEventListener('pointerdown', (event) => event.pointerType !== 'mouse' && showTip(button))
    button.addEventListener('mouseleave', () => hideTip(button))
    button.addEventListener('focus', () => button.matches(':focus-visible') && showTip(button))
    button.addEventListener('blur', () => hideTip(button))
  })
  document.querySelector('.nav').addEventListener('scroll', () => hideTip(), { passive: true })
  window.addEventListener('resize', () => hideTip(), { passive: true })
  window.visualViewport?.addEventListener('resize', () => hideTip(), { passive: true })

  document.querySelectorAll('[data-open-menu]').forEach((brand) => brand.addEventListener('click', () => {
    lastBackPress = 0
    if (location.hash !== '#menu') history.pushState(null, '', '#menu')
    activate('menu')
  }))
  document.querySelector('[data-menu-nav]')?.addEventListener('click', (event) => {
    event.preventDefault()
    lastBackPress = 0
    spawnRipple(event.currentTarget, event)
    if (location.hash !== '#menu') history.pushState(null, '', '#menu')
    activate('menu')
  })

  function exitApp() {
    try {
      if (typeof navigator.app?.exitApp === 'function') {
        navigator.app.exitApp()
        return
      }
    } catch {}
    try { window.close() } catch {}
    window.setTimeout(() => {
      if (history.length > 1) history.back()
    }, 80)
  }

  function requestAppExit() {
    const now = Date.now()
    if (lastBackPress && now - lastBackPress <= 2000) {
      lastBackPress = 0
      exitApp()
      return
    }
    lastBackPress = now
    window.Hub?.toast?.('Presiona Atrás otra vez para salir')
  }

  window.addEventListener('popstate', (event) => {
    if (mobileBackExit && event.state?.leagueHubRoot) {
      if (lastBackPress && Date.now() - lastBackPress <= 2000) {
        lastBackPress = 0
        exitApp()
      } else {
        lastBackPress = Date.now()
        history.pushState({ leagueHubBackGuard: true }, '', '#menu')
        window.Hub?.toast?.('Presiona Atrás otra vez para salir')
      }
      return
    }
    lastBackPress = 0
    activate(location.hash.slice(1))
  })
  window.addEventListener('hashchange', () => activate(location.hash.slice(1)))
  document.addEventListener('backbutton', (event) => {
    if (!mobileBackExit) return
    event.preventDefault()
    if (current && current !== 'menu') history.back()
    else requestAppExit()
  })

  new ResizeObserver(() => {
    const button = activeNavButton()
    if (button) moveIndicator(button)
    else indicator.style.opacity = '0'
  }).observe(list)

  if (mobileBackExit) {
    try {
      history.replaceState({ leagueHubRoot: true }, '', '#menu')
      history.pushState({ leagueHubBackGuard: true }, '', '#menu')
    } catch {}
  } else if (location.hash !== '#menu') {
    try { history.replaceState(null, '', '#menu') } catch {}
  }
  activate('menu', { animate: false })
  requestAnimationFrame(() => indicator.classList.add('is-ready'))

  if (window.Hub) window.Hub.init()
})()
