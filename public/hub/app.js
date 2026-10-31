(() => {
  const DEFAULT_SECTION = 'teams'
  const buttons = Array.from(document.querySelectorAll('.nav-button'))
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
        const viewportWidth = Math.max(1, svgRect?.width || window.visualViewport?.width || window.innerWidth || 1200)
        const viewportHeight = Math.max(1, svgRect?.height || window.visualViewport?.height || window.innerHeight || 800)
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
              mesh.appendChild(triangle)
            })
          }
        }

        triangles
          .sort((a, b) => ((viewportWidth - a.centerX) + (viewportHeight - a.centerY)) - ((viewportWidth - b.centerX) + (viewportHeight - b.centerY))
            || b.centerY - a.centerY
            || b.centerX - a.centerX
            || a.part - b.part)
          .forEach(({ triangle }, order) => triangle.style.setProperty('--triangle-delay', `${order * 1.9 / triangles.length}s`))
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

  function replay(el, className) {
    el.classList.remove(className)
    void el.offsetWidth
    el.classList.add(className)
  }

  function activate(id, { animate = true } = {}) {
    if (id === 'playoffs') id = 'tournament'
    if (!ids.includes(id)) id = DEFAULT_SECTION
    if (id === current) return
    current = id

    const button = buttons[ids.indexOf(id)]
    buttons.forEach((b) => b.toggleAttribute('aria-current', b === button))
    button.setAttribute('aria-current', 'page')

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

    moveIndicator(button)
    button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: animate ? 'smooth' : 'auto' })
    if (animate) {
      replay(indicator, 'is-moving')
      replay(button, 'is-popping')
    }

    document.title = `${button.getAttribute('aria-label')} · League Hub`
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

  const brand = document.querySelector('[data-brand-picker]')
  if (brand) brand.addEventListener('click', () => window.Hub?.pickBrand?.())

  window.addEventListener('popstate', () => activate(location.hash.slice(1)))
  window.addEventListener('hashchange', () => activate(location.hash.slice(1)))

  new ResizeObserver(() => {
    const button = buttons[ids.indexOf(current)]
    if (button) moveIndicator(button)
  }).observe(list)

  activate(location.hash.slice(1), { animate: false })
  requestAnimationFrame(() => indicator.classList.add('is-ready'))

  if (window.Hub) window.Hub.init()
})()
