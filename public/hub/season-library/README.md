# Biblioteca pública de temporadas

`seasons.json` se sincroniza automáticamente al abrir la app. También puedes publicar más archivos JSON y cargarlos manualmente desde **Seasons → Importar / Exportar → Cargar desde GitHub**.

Para publicar un archivo adicional:

1. En la app, escribe el nombre del archivo, elige un escudo y pulsa **Exportar todas**.
2. Sube el JSON descargado a esta carpeta.
3. Agrega su nombre de archivo a la lista `files` de `catalog.json`, por ejemplo: `{ "file": "league-hub-temporada-final.json" }`.
4. Espera a que GitHub Pages publique los cambios. El archivo aparecerá en **Cargar desde GitHub** con el nombre y el escudo incluidos al exportarlo.

Si activas **Bloquear edición al exportar a JSON**, las temporadas importadas mostrarán **Solo lectura** y el botón **Editar** estará deshabilitado.

La app conserva sus datos locales si no hay conexión. Para actualizar una temporada publicada, reemplaza su JSON en GitHub y vuelve a cargarlo desde la biblioteca.
