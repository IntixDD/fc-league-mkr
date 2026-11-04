# Arquitectura de League Hub

App web sin build: HTML + JS + CSS planos en `public/hub/` (el resto del proyecto es el contenedor Next.js).
Para probarla basta servir esa carpeta (`python3 -m http.server` o `npx serve public/hub`).

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Carcasa: navegación lateral y una `<section id="X">` con `<div id="X-body">` por apartado. Carga los scripts en orden. |
| `prefs.js` | Preferencias visuales (escala, tema, fondos). Se guardan en `localStorage`. |
| `core.js` | **Toda la lógica compartida** (objeto global `Hub`): estado, guardado, tablas, llaves, utilidades, avisos, exportaciones. |
| `mover.js` | Componente reutilizable «mantén presionado/arrastra para mover entre categorías» (lo usa Teams). |
| `views/*.js` | Una vista por apartado (`teams`, `table`, `fixtures`, `tournament`, `seasons`, `history`, `performance`, `badges`, `settings`, `menu`). |
| `app.js` | Navegación entre apartados, intro, tooltips del menú lateral. |
| `sw.js` | Service worker (modo sin conexión). Lista de archivos en `SHELL`. |
| `components.css` / `styles.css` | Estilos. `components.css` va por capas: lo último que se escribe gana. |
| `season-library/` | Temporadas publicadas (se sincronizan al abrir). |
| `dev/` | Herramientas de desarrollo (ver abajo). |

## Flujo de datos (lo más importante)

```
acción del usuario ──► Hub.update(mutador) ──► muta Hub.state ──► persist() (guardado diferido 250 ms)
                                           └─► scheduleRender() ──► renderAll() ──► view.render(el, state)
```

* **Un solo estado** (`Hub.state`): `{ logos: [{id,data,category}], logoGalleryManual, brandLogo, current: <temporada>, seasons: [<temporada>] }`.
* **Las vistas no guardan estado propio**: leen `state` y devuelven HTML (`el.innerHTML = ...`). Solo se redibujan las visibles.
* **Estado de interfaz** que no es dato de la liga (pestaña, ronda elegida…) va en `Hub.ui`. Lo que deba sobrevivir a recargas se añade a `UI_KEYS` en `core.js`.
* **`sanitizeState` / `sanitizeSeason`** (core.js) dejan pasar *solo* los campos conocidos. **Si añades un campo nuevo a una temporada y no lo incluyes ahí, se pierde al recargar.**
* `Hub.update(fn, { skip: 'idVista' })` evita redibujar una vista (útil si ya actualizaste el DOM a mano, p. ej. mientras se escribe en un input).

## Guardado (formato v2)

* IndexedDB `league-hub/kv`: `state2` (estado **sin imágenes**, ~20-100 KB) + `logos2` (tabla de escudos únicos, solo se reescribe cuando cambian los escudos).
* Espejo en `localStorage` (`league-hub:state2`) para sobrevivir a un cierre brusco. Si IndexedDB falla, se usa un espejo completo (`league-hub:state`).
* El formato antiguo (`state` completo) se sigue leyendo y se migra solo. Gana siempre el registro con `updatedAt` más reciente.
* **No guardes ni compares imágenes a mano**: dentro del estado siguen siendo `data:image/...` normales; el empaquetado es transparente.

## Reglas de rendimiento (para no volver al lag)

1. **Nunca incrustes un `data:` URL en el HTML.** Usa `Hub.crest(logo, size, name)` o `Hub.imgSrc(dataUrl)` (devuelve un `blob:` corto en caché). Un escudo pesa ~100 KB: el Menú llegó a generar 7.5 MB de HTML por esto.
2. **No uses `JSON.stringify` para comparar o clonar estados grandes** en un render (usa `sameData` o compara campos). Para copiar una temporada, `Hub.clone` está bien fuera de renders.
3. **No pongas `<input type="file">` dentro de una vista**: al volver del selector en celular la app se redibuja y el input desaparece antes de entregar el archivo. Usa `Hub.pickFiles({ accept, multiple })` desde un clic (ver `views/seasons.js`).
4. Limpia `setInterval`/`setTimeout`/observers al cambiar de vista (ver `menu.js`).

## Cómo añadir…

### Un apartado nuevo (p. ej. «Records»)
1. `index.html`: botón en el menú (`<a class="nav-button" href="#records" data-section="records">`) y la sección:
   `<section id="records" class="section" hidden><h1 id="records-title" class="section-title">Records</h1><div id="records-body" class="section-body"></div></section>`
2. `views/records.js`:
   ```js
   ;(() => {
     const H = window.Hub
     const { esc, crest } = H
     H.view('records', {
       bind(el) {                      // una sola vez: listeners delegados
         el.addEventListener('click', (e) => {
           const btn = e.target.closest('[data-action]')
           if (btn?.dataset.action === 'hacer-algo') H.update((s) => { /* mutar s */ })
         })
       },
       render(el, state) {             // cada cambio: devolver HTML
         el.innerHTML = `<article class="card"><h2 class="card-title">Records</h2>...</article>`
       },
     })
   })()
   ```
3. Cargar el script en `index.html` (después de `core.js`) y añadirlo a `SHELL` en `sw.js`.
4. `node dev/bump-versions.mjs` antes de empaquetar.

### Un campo nuevo en la temporada
`emptySeason` → `sanitizeSeason` (core.js) → úsalo en la vista con `H.update`. Los tres pasos son obligatorios.

### Mover/clasificar elementos sin botones fijos
`Hub.createMover(el, { itemSelector, idOf, categories, categoryOf, thumbOf, onMove })` (ver cabecera de `mover.js`).

## Versionado y caché

Cada archivo se referencia como `archivo.js?v=N` en `index.html` y `sw.js`. **No los subas a mano**:
`node dev/bump-versions.mjs` detecta qué archivos cambiaron (por hash), sube su `?v=` en ambos sitios y renueva `CACHE`. `--check` solo muestra el plan.

## Pruebas

`dev/smoke-test.cjs` abre la app en Chromium, importa una temporada, recorre todos los apartados vigilando errores,
comprueba el guardado (recarga y cierre brusco) y el movimiento de escudos entre categorías.

```
npm i -D playwright && npx playwright install chromium
node dev/smoke-test.cjs            # CHROME_PATH=/ruta/a/chrome si usas otro navegador
```
