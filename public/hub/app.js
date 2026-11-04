(() => {
  const DEFAULT_SECTION = 'menu'
  const buttons = Array.from(document.querySelectorAll('.nav-button:not(.mobile-menu-nav-button)'))
  const sections = Array.from(document.querySelectorAll('.section'))
  const indicator = document.querySelector('.nav-indicator')
  const list = document.querySelector('.nav-list')
  const ids = buttons.map((b) => b.dataset.section)
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const touchUi = () => window.matchMedia('(pointer: coarse)').matches
  let current = null
  let indicatorFrame = 0

  const intro = document.getElementById('app-intro')
  if (intro) {
    const mobileOrReducedMotion = window.matchMedia('(pointer: coarse)').matches || reduceMotion()
    // Phones should show the usable app immediately and skip the animated SVG mesh.
    if (mobileOrReducedMotion) intro.remove()
    else {
      intro.style.pointerEvents = 'none'
      requestAnimationFrame(() => intro.classList.add('is-playing'))
      window.setTimeout(() => {
        intro.style.transition = 'opacity .18s ease-out'
        intro.style.opacity = '0'
        window.setTimeout(() => intro.remove(), 200)
      }, 650)
    }
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
    if (!button) {
      indicator.style.opacity = '0'
      return
    }
    indicator.style.width = `${button.offsetWidth}px`
    indicator.style.height = `${button.offsetHeight}px`
    indicator.style.transform = `translate(${button.offsetLeft}px, ${button.offsetTop}px)`
    indicator.style.opacity = '1'
  }

  function scheduleIndicator() {
    if (indicatorFrame) return
    indicatorFrame = requestAnimationFrame(() => {
      indicatorFrame = 0
      moveIndicator(buttons[ids.indexOf(current)])
    })
  }

  function replay(el, className) {
    el.classList.remove(className)
    // Reading layout here is cheap for the small nav elements and guarantees the
    // CSS animation restarts. Large content areas use the Web Animations API below.
    void el.offsetWidth
    el.classList.add(className)
  }

  // Web Animations avoid a forced synchronous layout after every section switch.
  // With History/Performance open the old code relaid out the whole page (and all
  // its SVGs) for each letter of the title, which caused visible jank on phones.
  function animateSection(section) {
    const chars = section.querySelectorAll('.char')
    if (reduceMotion()) {
      section.classList.remove('is-entering')
      chars.forEach((c) => {
        c.style.animation = 'none'
        c.style.opacity = '1'
        c.style.transform = 'none'
      })
      return
    }
    section.getAnimations().forEach((animation) => {
      if (animation.id === 'section-enter') animation.cancel()
    })
    const enter = section.animate(
      [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'translateX(0)' }],
      { duration: 450, easing: 'ease-out' },
    )
    enter.id = 'section-enter'
    chars.forEach((c, i) => {
      c.getAnimations().forEach((animation) => {
        if (animation.id === 'char-enter') animation.cancel()
      })
      c.style.animation = 'none'
      const animation = c.animate(
        [{ opacity: 0, transform: 'translateY(0.45em)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 550, delay: i * 38, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'both' },
      )
      animation.id = 'char-enter'
    })
  }

  function activate(id, { animate = true } = {}) {
    if (id === 'playoffs') id = 'tournament'
    if (id !== 'menu' && !ids.includes(id)) id = DEFAULT_SECTION
    if (id === current) return
    current = id

    // Announce the destination before hiding/showing sections. prefs.js uses this
    // to pick the right layout mode in the same frame, so Settings does not rotate
    // after it is already visible.
    document.dispatchEvent(new CustomEvent('app:sectionwillchange', { detail: { id } }))

    const button = ids.includes(id) ? buttons[ids.indexOf(id)] : null
    buttons.forEach((b) => b.toggleAttribute('aria-current', b === button))
    if (button) button.setAttribute('aria-current', 'page')
    document.querySelector('[data-menu-nav]')?.toggleAttribute('aria-current', id === 'menu')

    sections.forEach((section) => {
      const active = section.id === id
      section.hidden = !active
      if (active && animate) animateSection(section)
      else if (active) section.classList.remove('is-entering')
    })

    // .content is shared by every section: start each one at the top instead of inheriting the previous scroll.
    const scroller = document.querySelector('.content')
    if (scroller) scroller.scrollTop = 0

    document.dispatchEvent(new CustomEvent('app:sectionchange', { detail: { id } }))
    // "renderVisible" only redraws a view when its data changed. Revisiting
    // History/Performance or Settings is instant instead of rebuilding large tables.
    if (window.Hub?.renderVisible) window.Hub.renderVisible()
    else window.Hub?.render?.()

    requestAnimationFrame(() => {
      if (!button) {
        indicator.style.opacity = '0'
        return
      }
      moveIndicator(button)
      button.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: animate ? 'smooth' : 'auto' })
      if (animate) {
        replay(indicator, 'is-moving')
        replay(button, 'is-popping')
      }
    })

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
      if (!touchUi()) spawnRipple(button, event)
      const id = button.dataset.section
      if (location.hash !== `#${id}`) history.pushState(null, '', `#${id}`)
      activate(id, { animate: !touchUi() })
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
    button.addEventListener('mouseleave', () => hideTip(button))
    button.addEventListener('focus', () => button.matches(':focus-visible') && showTip(button))
    button.addEventListener('blur', () => hideTip(button))
  })
  document.querySelector('.nav').addEventListener('scroll', () => hideTip(), { passive: true })
  window.addEventListener('resize', () => hideTip(), { passive: true })
  window.visualViewport?.addEventListener('resize', () => hideTip(), { passive: true })

  document.querySelectorAll('[data-open-menu]').forEach((brand) => brand.addEventListener('click', () => {
    if (location.hash !== '#menu') history.pushState(null, '', '#menu')
    activate('menu', { animate: !touchUi() })
  }))
  document.querySelector('[data-menu-nav]')?.addEventListener('click', (event) => {
    event.preventDefault()
    if (!touchUi()) spawnRipple(event.currentTarget, event)
    if (location.hash !== '#menu') history.pushState(null, '', '#menu')
    activate('menu', { animate: !touchUi() })
  })

  window.addEventListener('popstate', () => activate(location.hash.slice(1)))
  window.addEventListener('hashchange', () => activate(location.hash.slice(1)))

  new ResizeObserver(scheduleIndicator).observe(list)

  if (location.hash !== '#menu') {
    try { history.replaceState(null, '', '#menu') } catch {}
  }
  activate('menu', { animate: false })
  requestAnimationFrame(() => indicator.classList.add('is-ready'))

  if (window.Hub) window.Hub.init()
})()
