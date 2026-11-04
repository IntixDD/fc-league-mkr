(() => {
  const DEFAULT_SECTION = 'menu'
  const buttons = Array.from(document.querySelectorAll('.nav-button:not(.mobile-menu-nav-button)'))
  const sections = Array.from(document.querySelectorAll('.section'))
  const indicator = document.querySelector('.nav-indicator')
  const list = document.querySelector('.nav-list')
  const ids = buttons.map((b) => b.dataset.section)
  let current = null

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
    indicator.style.transform = `translate(${button.offsetLeft}px, ${button.offsetTop}px)`
    indicator.style.opacity = '1'
  }

  // Reinicia una animación de clase. La clase se retira sola al terminar (animationend de `animation`),
  // así que en el caso normal basta con añadirla: antes cada navegación forzaba 3 reflows síncronos
  // (void el.offsetWidth). Solo si la animación sigue en curso (navegación muy rápida) se reinicia con reflow.
  function replay(el, className, animation) {
    if (el.classList.contains(className)) {
      el.classList.remove(className)
      void el.offsetWidth
    }
    el.classList.add(className)
    if (!el._replayDone) {
      el._replayDone = new Map()
      el.addEventListener('animationend', (event) => {
        const name = el._replayDone.get(event.animationName)
        if (name) el.classList.remove(name)
      })
    }
    el._replayDone.set(animation, className)
  }

  function activate(id, { animate = true } = {}) {
    if (id === 'playoffs') id = 'tournament'
    if (id !== 'menu' && !ids.includes(id)) id = DEFAULT_SECTION
    if (id === current) return
    current = id

    const button = ids.includes(id) ? buttons[ids.indexOf(id)] : null
    buttons.forEach((b) => b.toggleAttribute('aria-current', b === button))
    if (button) button.setAttribute('aria-current', 'page')
    document.querySelector('[data-menu-nav]')?.toggleAttribute('aria-current', id === 'menu')

    // Todo lo que LEE layout (indicador, scrollIntoView, scrollTop) va antes de cambiar de sección:
    // así el layout aún está limpio y no se fuerza un reflow de la sección nueva con contenido viejo
    // que el render va a reemplazar enseguida.
    // .content is shared by every section: start each one at the top instead of inheriting the previous scroll.
    const scroller = document.querySelector('.content')
    if (scroller) scroller.scrollTop = 0
    if (button) {
      moveIndicator(button)
      button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: animate ? 'smooth' : 'auto' })
    } else indicator.style.opacity = '0'

    sections.forEach((section) => {
      const active = section.id === id
      section.hidden = !active
      if (active && animate) {
        const chars = section.querySelectorAll('.char')
        chars.forEach((c) => { c.style.animation = 'none' })
        replay(section, 'is-entering', 'section-in')
        chars.forEach((c) => { c.style.animation = '' })
      }
    })

    document.dispatchEvent(new CustomEvent('app:sectionchange', { detail: { id } }))
    window.Hub?.render?.()

    if (animate && button) {
      replay(indicator, 'is-moving', 'indicator-stretch')
      replay(button, 'is-popping', 'icon-pop')
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
    button.addEventListener('click', (event) => {
      event.preventDefault()
      spawnRipple(button, event)
      const id = button.dataset.section
      if (location.hash !== `#${id}`) history.pushState(null, '', `#${id}`)
      activate(id)
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
    if (location.hash !== '#menu') history.pushState(null, '', '#menu')
    activate('menu')
  }))
  document.querySelector('[data-menu-nav]')?.addEventListener('click', (event) => {
    event.preventDefault()
    spawnRipple(event.currentTarget, event)
    if (location.hash !== '#menu') history.pushState(null, '', '#menu')
    activate('menu')
  })

  window.addEventListener('popstate', () => activate(location.hash.slice(1)))
  window.addEventListener('hashchange', () => activate(location.hash.slice(1)))

  new ResizeObserver(() => {
    const button = buttons[ids.indexOf(current)]
    if (button) moveIndicator(button)
  }).observe(list)

  if (location.hash !== '#menu') {
    try { history.replaceState(null, '', '#menu') } catch {}
  }
  activate('menu', { animate: false })
  requestAnimationFrame(() => indicator.classList.add('is-ready'))

  if (window.Hub) window.Hub.init()
})()
