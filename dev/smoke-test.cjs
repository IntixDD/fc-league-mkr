/* Prueba de humo de League Hub. Uso:  node dev/smoke-test.cjs   (necesita `playwright`, ver ARQUITECTURA.md)
 * Sirve public/hub con un servidor propio, así que no hay que levantar nada antes. */
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const HUB = path.resolve(__dirname, '../public/hub')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' }
let pass = 0
let fail = 0
const check = (name, cond, extra = '') => {
  cond ? pass++ : fail++
  console.log(`${cond ? 'OK   ' : 'FALLA'} ${name}${extra ? '  ' + extra : ''}`)
}

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (p.endsWith('/')) p += 'index.html'
  const file = path.join(HUB, p)
  if (!file.startsWith(HUB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})

;(async () => {
  await new Promise((r) => server.listen(0, r))
  const base = `http://localhost:${server.address().port}/index.html`
  const library = fs.readdirSync(path.join(HUB, 'season-library')).find((f) => /^league-hub-.*\.json$/.test(f))
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)))
  const go = (id) => page.evaluate((id) => (document.querySelector(`[data-section="${id}"]`) || document.querySelector('[data-menu-nav]')).click(), id)

  await page.goto(base)
  await page.waitForSelector('#app-intro', { state: 'detached', timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(500)
  check('arranca sin errores', errors.length === 0, errors.join(' | '))

  if (library) {
    await go('seasons')
    await page.waitForTimeout(300)
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#seasons-body').getByText('Importar .json').first().click()])
    await chooser.setFiles(path.join(HUB, 'season-library', library))
    await page.waitForTimeout(2500)
    check('importar .json de temporadas', (await page.evaluate(() => Hub.state.seasons.length)) > 0)
  }

  for (const id of ['menu', 'teams', 'table', 'fixtures', 'tournament', 'seasons', 'history', 'performance', 'badges', 'settings']) {
    await go(id)
    await page.waitForTimeout(350)
  }
  check('recorrer todos los apartados sin errores', errors.length === 0, errors.join(' | '))

  await page.evaluate(() => Hub.update((s) => { s.current.number = 71 }))
  await page.evaluate(() => { Hub.update((s) => { s.current.number = 72 }); window.dispatchEvent(new Event('pagehide')) })
  await page.reload()
  await page.waitForSelector('#app-intro', { state: 'detached', timeout: 15000 }).catch(() => {}) // la intro tapa la pantalla unos segundos
  await page.waitForTimeout(500)
  check('guardado: sobrevive a recargar y a un cierre brusco', (await page.evaluate(() => Hub.state.current.number)) === 72)

  await go('teams')
  await page.waitForTimeout(500)
  const tile = page.locator('#teams-body .logo-tile-wrap').first()
  if (await tile.count()) {
    const id = await tile.getAttribute('data-logo-id')
    await tile.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(200)
    const box = await tile.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 14, box.y + box.height / 2 + 14, { steps: 4 })
    const chip = await page.locator('.mover-chip:not([disabled])').first().boundingBox()
    const target = await page.locator('.mover-chip:not([disabled])').first().getAttribute('data-move-to')
    await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(400)
    check('mover un escudo de categoría arrastrándolo', (await page.evaluate((id) => Hub.state.logos.find((l) => String(l.id) === id)?.category, id)) === target)
  }
  check('sin errores al final', errors.length === 0, errors.join(' | '))

  console.log(`\n${pass} correctas, ${fail} con fallos`)
  await browser.close()
  server.close()
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error(e); server.close(); process.exit(1) })
