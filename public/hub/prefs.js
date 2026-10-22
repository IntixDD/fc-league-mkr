// Loaded synchronously in <head> so theme, scale and background mode apply before first paint.
;(() => {
  const KEY = 'league-hub:prefs'
  const DESKTOP_WIDTH = 1100
  const THEMES = {
    magenta: { label: 'Magenta', accent: '238 143 255', hover: '#f4b2ff', line: '#d77ff0', ind: '122 22 144', g1: '255 0 255', g2: '170 0 190', g3: '90 0 100', gg: '0 150 40' },
    azul: { label: 'Azul', accent: '130 182 255', hover: '#b3d1ff', line: '#6fa2f0', ind: '24 62 150', g1: '0 110 255', g2: '0 70 190', g3: '0 30 100', gg: '0 190 200' },
    cian: { label: 'Cian', accent: '110 232 240', hover: '#b0f3f7', line: '#5ccbd4', ind: '10 104 124', g1: '0 210 255', g2: '0 140 190', g3: '0 60 90', gg: '150 0 255' },
    verde: { label: 'Verde', accent: '120 238 160', hover: '#b4f6c9', line: '#5fcf8a', ind: '14 104 56', g1: '0 220 110', g2: '0 150 80', g3: '0 70 40', gg: '190 210 0' },
    rojo: { label: 'Rojo', accent: '255 128 128', hover: '#ffb3b3', line: '#ee6a6a', ind: '140 22 32', g1: '255 30 50', g2: '190 0 24', g3: '100 0 12', gg: '255 140 0' },
    naranja: { label: 'Naranja', accent: '255 184 96', hover: '#ffd3a0', line: '#ef9f45', ind: '140 74 10', g1: '255 130 0', g2: '200 80 0', g3: '100 40 0', gg: '255 40 90' },
    oro: { label: 'Oro', accent: '255 214 110', hover: '#ffe6a8', line: '#e2b84a', ind: '128 92 10', g1: '255 190 20', g2: '190 130 0', g3: '96 62 0', gg: '255 90 40' },
    gris: { label: 'Grafito', accent: '220 222 232', hover: '#f0f1f6', line: '#a8abb8', ind: '70 72 86', g1: '150 150 175', g2: '100 100 125', g3: '50 50 64', gg: '110 120 140' },
  }
  const DEFAULTS = { scale: 0, theme: 'magenta', bgDim: 0.45, bgGrid: true, hasBg: false, activeBg: null }

  const standalone =
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  document.documentElement.classList.toggle('is-standalone', standalone)

  // Avoid requestFullscreen() on taps: mobile browsers can briefly blank the
  // viewport when fullscreen changes while an input is being focused.
  // The PWA manifest already defines the app's fullscreen/standalone display mode.

  function read() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
    } catch {
      return { ...DEFAULTS }
    }
  }

  let prefs = read()
  const root = document.documentElement

  function applyScale() {
    const desktop = prefs.scale === -1 && window.innerWidth < DESKTOP_WIDTH
    root.classList.toggle('ui-desktop', desktop)
    if (desktop) {
      const z = window.innerWidth / DESKTOP_WIDTH
      root.style.zoom = String(z)
      root.style.setProperty('--app-h', `${window.innerHeight / z}px`)
    } else {
      root.style.zoom = ''
      root.style.removeProperty('--app-h')
    }
  }

  function apply() {
    const t = THEMES[prefs.theme] || THEMES.magenta
    const vars = {
      '--accent-rgb': t.accent,
      '--accent-hover': t.hover,
      '--accent-line': t.line,
      '--indicator-rgb': t.ind,
      '--glow-1': t.g1,
      '--glow-2': t.g2,
      '--glow-3': t.g3,
      '--glow-g': t.gg,
      '--bg-dim': String(prefs.bgDim),
    }
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
    root.classList.toggle('hide-grid', !prefs.bgGrid)
    root.classList.toggle('has-custom-bg', !!prefs.hasBg)
    applyScale()
  }

  window.addEventListener('resize', applyScale)
  window.addEventListener('orientationchange', applyScale)

  window.HubPrefs = {
    THEMES,
    DEFAULTS,
    get: () => prefs,
    set(patch) {
      prefs = { ...prefs, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(prefs))
      } catch {}
      apply()
    },
  }
  apply()
})()
