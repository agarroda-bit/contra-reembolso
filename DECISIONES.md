# DECISIONES

Lo que no estaba definido en el encargo y he decidido yo.

- **26/09 · Carpeta del proyecto:** `Downloads/GOLDENO1/contra-reembolso` (junto a `el-mandato`), fuera del vault de Obsidian para que no indexe miles de archivos de `node_modules`.
- **26/09 · Versiones:** Three.js 0.186, Rapier 0.21 (`@dimforge/rapier3d-compat`, que trae el WASM dentro del JS y no necesita descargar nada aparte), Vite 8, TypeScript 7.
- **26/09 · Publicación sin GitHub Actions:** la sesión de GitHub de este ordenador no tiene el permiso `workflow`, y GitHub rechaza cualquier push que traiga un archivo de `.github/workflows/`. Así que publico con `npm run deploy`, que construye el juego y lo sube a la rama `gh-pages`; Pages sirve esa rama. El workflow está preparado en `herramientas/github-actions-deploy.yml`: para activarlo, dar el permiso (`gh auth refresh -s workflow`), moverlo a `.github/workflows/deploy.yml` y poner Pages en «GitHub Actions».
