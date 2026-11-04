self.window = self
self.document = { addEventListener() {} }

importScripts('core.js?v=57')

self.addEventListener('message', (event) => {
  const { id, season } = event.data || {}
  if (!season || !Array.isArray(season.teams)) {
    self.postMessage({ id, stats: null })
    return
  }

  try {
    const stats = self.Hub.seasonStats(season)
    self.postMessage({ id, stats })
  } catch (error) {
    self.postMessage({ id, error: error?.message || 'No se pudieron calcular las estadísticas' })
  }
})
