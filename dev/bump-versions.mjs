#!/usr/bin/env node
/* Sube automáticamente los números de versión (?v=N) de los archivos que cambiaron y la versión de
 * caché del service worker, para que los celulares descarguen siempre lo nuevo.
 *
 *   node dev/bump-versions.mjs            # súbelos si hubo cambios
 *   node dev/bump-versions.mjs --check    # solo muestra qué subiría, sin escribir nada
 *
 * Funcionamiento: guarda un hash de cada archivo referenciado en dev/.asset-hashes.json. Si el hash
 * actual difiere del guardado, incrementa su ?v= en index.html y sw.js, y sube CACHE ('league-hub-vN').
 * Archivos nuevos (sin hash guardado) solo se registran, no se suben.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HUB = path.join(ROOT, 'public/hub')
const MANIFEST = path.join(ROOT, 'dev/.asset-hashes.json')
const CHECK = process.argv.includes('--check')

const read = (f) => fs.readFileSync(path.join(HUB, f), 'utf8')
const hash = (buf) => crypto.createHash('sha1').update(buf).digest('hex')
const stripVersions = (text) => text.replace(/\?v=\d+/g, '').replace(/const CACHE = '[^']*'/, '')

let index = read('index.html')
let sw = read('sw.js')
const REF = /([\w./-]+\.(?:js|css|svg|json))\?v=(\d+)/g

const versions = new Map()
for (const text of [index, sw]) for (const [, file, v] of text.matchAll(REF)) versions.set(file, Math.max(versions.get(file) || 0, Number(v)))

const saved = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {}
const next = {}
const bumped = []

for (const [file, v] of versions) {
  const full = path.join(HUB, file)
  if (!fs.existsSync(full)) { console.warn(`! No existe ${file} (referenciado con ?v=${v})`); continue }
  const h = hash(fs.readFileSync(full))
  next[file] = h
  if (saved[file] && saved[file] !== h) bumped.push([file, v, v + 1])
}
// index.html y sw.js también cuentan (sin los números de versión), para decidir si hay que renovar la caché.
const shellHash = hash(stripVersions(index) + '\n---\n' + stripVersions(sw))
next['__shell__'] = shellHash
const shellChanged = !!saved['__shell__'] && saved['__shell__'] !== shellHash

if (!bumped.length && !shellChanged) {
  console.log('Sin cambios que versionar.')
  if (!CHECK) fs.writeFileSync(MANIFEST, JSON.stringify(next, null, 2) + '\n')
  process.exit(0)
}

for (const [file, from, to] of bumped) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`${escaped}\\?v=\\d+`, 'g')
  index = index.replace(re, `${file}?v=${to}`)
  sw = sw.replace(re, `${file}?v=${to}`)
  console.log(`  ${file}: v${from} -> v${to}`)
}
const cache = sw.match(/const CACHE = 'league-hub-v(\d+)'/)
if (cache) {
  const n = Number(cache[1]) + 1
  sw = sw.replace(cache[0], `const CACHE = 'league-hub-v${n}'`)
  console.log(`  service worker: league-hub-v${cache[1]} -> league-hub-v${n}`)
}

if (CHECK) { console.log('(--check: no se escribió nada)'); process.exit(0) }
fs.writeFileSync(path.join(HUB, 'index.html'), index)
fs.writeFileSync(path.join(HUB, 'sw.js'), sw)
// el hash del shell se recalcula con los nuevos números (no cambia: se ignoran), pero los de los assets no cambian de contenido
fs.writeFileSync(MANIFEST, JSON.stringify(next, null, 2) + '\n')
console.log('Listo.')
