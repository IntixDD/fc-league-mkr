(() => {
  const DEFAULT_SECTION = 'teams'
  const buttons = Array.from(document.querySelectorAll('.nav-button'))
  const sections = Array.from(document.querySelectorAll('.section'))
  const indicator = document.querySelector('.nav-indicator')
  const list = document.querySelector('.nav-list')
  const ids = buttons.map((b) => b.dataset.section)
  let current = null

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
        replay(section, 'is-entering')
        section.querySelectorAll('.char').forEach((c) => {
          c.style.animation = 'none'
          void c.offsetWidth
          c.style.animation = ''
        })
      }
    })

    moveIndicator(button)
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
      const vertical = window.matchMedia('(min-width: 768px)').matches
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

  window.addEventListener('popstate', () => activate(location.hash.slice(1)))
  window.addEventListener('hashchange', () => activate(location.hash.slice(1)))

  new ResizeObserver(() => {
    const button = buttons[ids.indexOf(current)]
    if (button) moveIndicator(button)
  }).observe(list)

  activate(location.hash.slice(1), { animate: false })
  requestAnimationFrame(() => indicator.classList.add('is-ready'))

  if (window.Hub) {
    window.Hub.init()
    const brand = document.querySelector('.logo')
    const dlg = document.getElementById('logo-dialog')
    brand?.addEventListener('click', () => {
      const grid = dlg.querySelector('[data-grid]')
      dlg.querySelector('[data-title]').textContent = 'Logo de la liga'
      grid.innerHTML = window.Hub.state.logos.length
        ? window.Hub.state.logos.map((l) => `<button class="logo-tile" value="${String(l.id).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}" aria-label="Usar como logo de liga"><img src="${l.data}" alt=""></button>`).join('')
        : '<p class="empty">Primero importa escudos en Teams → Galería de escudos.</p>'
      dlg.returnValue = ''
      dlg.showModal()
      dlg.addEventListener('close', () => {
        const selected = window.Hub.state.logos.find((l) => l.id === dlg.returnValue)
        if (selected) window.Hub.update((st) => { st.brandLogo = selected.data })
      }, { once: true })
    })
  }
})()
