/* Mover elementos entre categorías SIN controles fijos sobre ellos.
 *
 * Uso (ver views/teams.js):
 *   const mover = Hub.createMover(rootEl, {
 *     itemSelector: '.logo-tile-wrap[data-logo-id]',   // cada elemento movible
 *     idOf: (item) => item.dataset.logoId,
 *     categories: [{ value: 'custom', label: 'Custom' }, ...],
 *     categoryOf: (id) => 'custom',                    // categoría actual del elemento
 *     thumbOf: (id) => 'data:image/...',               // miniatura que se muestra en la barra
 *     onMove: (id, category) => {},                    // aplicar el cambio (p. ej. con Hub.update)
 *   })
 *   mover.sync()   // llamar al final de cada render de la vista
 *
 * Interacción:
 *   - Mouse: arrastrar el elemento (más de 5 px) -> aparece la barra; soltar sobre una categoría.
 *   - Táctil: mantener presionado ~0.4 s; sin soltar se puede arrastrar a la categoría, o soltar y tocarla.
 *   - Teclado: tecla M sobre el elemento enfocado, elegir categoría con Tab/Enter, Esc cancela.
 * La barra vive fuera de la vista (no se destruye al volver a dibujar) y solo existe mientras se mueve algo.
 */
;(() => {
  const H = window.Hub
  const HOLD_MS = 380
  const TOUCH_SLOP = 10
  const MOUSE_SLOP = 5

  H.createMover = function createMover(root, options) {
    const { itemSelector, idOf, categories, categoryOf, thumbOf, onMove, label = 'Mover a' } = options
    let grabbedId = null
    let press = null
    let bar = null
    let suppressUntil = 0

    const labelOf = (value) => categories.find((c) => c.value === value)?.label || value
    const items = () => [...root.querySelectorAll(itemSelector)]
    const itemFor = (id) => items().find((item) => String(idOf(item)) === String(id)) || null

    function ensureBar() {
      if (bar) return bar
      bar = document.createElement('div')
      bar.className = 'mover-bar'
      bar.hidden = true
      bar.setAttribute('role', 'toolbar')
      bar.setAttribute('aria-label', label)
      bar.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-move-to]')
        if (chip && !chip.disabled) commit(chip.dataset.moveTo)
        else if (e.target.closest('[data-move-cancel]')) end(true)
      })
      // Mismo contenedor que los avisos, para heredar la escala/rotación de la app en celulares.
      ;(document.getElementById('toasts')?.parentNode || document.body).appendChild(bar)
      return bar
    }

    function showBar(id) {
      const current = categoryOf(id)
      const thumb = thumbOf?.(id)
      const el = ensureBar()
      el.innerHTML =
        `<span class="mover-bar-title">${thumb ? `<span class="mover-bar-thumb"><img src="${H.esc(thumb)}" alt=""></span>` : ''}${H.esc(label)}</span>` +
        categories
          .map((c) => `<button type="button" class="btn btn--ghost btn--sm mover-chip${c.value === current ? ' is-current' : ''}" data-move-to="${H.esc(c.value)}"${c.value === current ? ' disabled aria-current="true"' : ''}>${H.esc(c.label)}</button>`)
          .join('') +
        '<button type="button" class="mover-cancel" data-move-cancel aria-label="Cancelar">&times;</button>'
      el.hidden = false
    }

    const chipAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('[data-move-to]') || null

    function hoverAt(x, y) {
      const over = chipAt(x, y)
      bar?.querySelectorAll('.mover-chip.is-over').forEach((chip) => chip !== over && chip.classList.remove('is-over'))
      if (over && !over.disabled) over.classList.add('is-over')
    }

    function mark() {
      items().forEach((item) => item.classList.toggle('is-grabbed', grabbedId != null && String(idOf(item)) === String(grabbedId)))
    }

    const blockTouchScroll = (e) => e.cancelable && e.preventDefault()
    const onOutsidePointerDown = (e) => {
      if (grabbedId != null && !bar?.contains(e.target)) end()
    }
    const onEscape = (e) => {
      if (e.key === 'Escape' && grabbedId != null) {
        e.preventDefault()
        end(true)
      }
    }

    function startGrab(id, viaPointer, focusBar = false) {
      grabbedId = id
      if (press) press.dragging = !!viaPointer
      mark()
      showBar(id)
      navigator.vibrate?.(12)
      if (viaPointer && press?.touch) document.addEventListener('touchmove', blockTouchScroll, { passive: false })
      document.addEventListener('pointerdown', onOutsidePointerDown, true)
      document.addEventListener('keydown', onEscape)
      if (focusBar) bar.querySelector('.mover-chip:not([disabled])')?.focus()
    }

    function end(restoreFocus = false) {
      const id = grabbedId
      grabbedId = null
      document.removeEventListener('touchmove', blockTouchScroll)
      document.removeEventListener('pointerdown', onOutsidePointerDown, true)
      document.removeEventListener('keydown', onEscape)
      if (bar) {
        bar.hidden = true
        bar.innerHTML = ''
      }
      mark()
      if (restoreFocus && id != null) itemFor(id)?.querySelector('button')?.focus({ preventScroll: true })
    }

    function commit(category) {
      const id = grabbedId
      end()
      if (id != null && category !== categoryOf(id)) onMove(id, category)
    }

    function cleanupPress() {
      if (!press) return
      clearTimeout(press.timer)
      document.removeEventListener('pointermove', onDocMove)
      document.removeEventListener('pointerup', onDocUp)
      document.removeEventListener('pointercancel', onDocCancel)
      press = null
    }

    function onDocMove(e) {
      if (!press || e.pointerId !== press.pointerId) return
      if (grabbedId != null) {
        if (press.dragging) hoverAt(e.clientX, e.clientY)
        return
      }
      const dist = Math.hypot(e.clientX - press.x, e.clientY - press.y)
      if (press.touch) {
        if (dist > TOUCH_SLOP) cleanupPress() // el dedo se mueve antes de tiempo: es un desplazamiento
      } else if (dist > MOUSE_SLOP) {
        clearTimeout(press.timer)
        startGrab(press.id, true)
        hoverAt(e.clientX, e.clientY)
      }
    }

    function onDocUp(e) {
      if (!press || e.pointerId !== press.pointerId) return
      const dragged = press.dragging
      cleanupPress()
      if (!dragged || grabbedId == null) return
      suppressUntil = Date.now() + 500 // evita que el "click" de soltar seleccione el escudo
      const chip = chipAt(e.clientX, e.clientY)
      if (chip && !chip.disabled) commit(chip.dataset.moveTo)
      else bar?.querySelectorAll('.mover-chip.is-over').forEach((c) => c.classList.remove('is-over')) // sigue abierta: tocar una categoría
    }

    function onDocCancel(e) {
      if (!press || e.pointerId !== press.pointerId) return
      if (press.dragging) suppressUntil = Date.now() + 500
      cleanupPress()
    }

    root.addEventListener('pointerdown', (e) => {
      const item = e.target.closest(itemSelector)
      if (!item || e.button > 0 || e.target.closest('[data-no-move]')) return
      cleanupPress()
      const touch = e.pointerType !== 'mouse'
      const id = idOf(item)
      press = { id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, touch, dragging: false, timer: 0 }
      if (touch) press.timer = setTimeout(() => press && startGrab(press.id, true), HOLD_MS)
      document.addEventListener('pointermove', onDocMove)
      document.addEventListener('pointerup', onDocUp)
      document.addEventListener('pointercancel', onDocCancel)
    })

    // La pulsación larga abriría el menú contextual / la vista previa del navegador.
    root.addEventListener('contextmenu', (e) => {
      if (e.target.closest(itemSelector)) e.preventDefault()
    })

    root.addEventListener(
      'click',
      (e) => {
        if (Date.now() < suppressUntil && e.target.closest(itemSelector)) {
          e.preventDefault()
          e.stopPropagation()
        }
      },
      true,
    )

    root.addEventListener('keydown', (e) => {
      if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const item = e.target.closest?.(itemSelector)
        if (!item || e.target.matches('input, textarea, select')) return
        e.preventDefault()
        if (grabbedId != null) end()
        startGrab(idOf(item), false, true)
      }
    })

    return {
      isGrabbed: (id) => grabbedId != null && String(grabbedId) === String(id),
      cancel: () => end(),
      /* Llamar al final de cada render: vuelve a marcar el elemento y cancela si desapareció. */
      sync() {
        if (grabbedId == null) return
        if (!itemFor(grabbedId)) end()
        else mark()
      },
    }
  }
})()
