# PROGRESO — CONTRA REEMBOLSO

Enlace: https://agarroda-bit.github.io/contra-reembolso/

Si pierdes el contexto: relee `ENCARGO.md`, este archivo y `DECISIONES.md`, y sigue.

## Fase actual: 2 — Vehículos (integrando)

## Fase 1 — Isla y personaje ✅ (26/09, 06:15, publicada)
- Isla Puerto Paquete (≈600 × 600 m) con los cinco barrios: Puerto (oficina, muelles, grúas, contenedores, barco, faro), Centro (plaza, tiendas, casino, club), Colina (chalets con piscina, ático), Polígono (naves, taller, armería, desguace, guarida), Barrio Viejo (callejones, tendederos, bares).
- Terreno con cuestas y colisor exacto, calles con aceras y pasos de cebra, 24 sitios de interés, 84 puntos de entrega, 20 paquetes perdidos, farolas, neones y ventanas que se encienden de noche.
- Personaje articulado (un draw call) con animaciones por código; andar, correr con aguante, saltar; cámara en tercera persona que no atraviesa paredes.
- Cielo con ciclo de día y noche (20 min = un día), atardeceres, estrellas, nubes, sombras que siguen al jugador.
- HUD con dinero, fama, reloj, sirenas, minimapa giratorio y mapa grande (M).
- Pruebas: carga sin errores, andar y saltar, capturas de cada barrio, atardecer y noche (`capturas/fase-1/`).
- Fps: 60 fps con la GPU real (Apple M4), 104 draw calls, ~500 k triángulos.

## Fase 0 — Esqueleto y publicación ✅ (26/09, 04:00)
- Proyecto Vite + TypeScript + Three.js + Rapier.
- Página de prueba con un cubo que cae (física Rapier) y gira.
- Tests con Playwright (Chromium headless, WebGL por SwiftShader).
- Publicación en GitHub Pages desde la rama `gh-pages` con `npm run deploy` (ver DECISIONES).
- Comprobado: el enlace carga la versión publicada y el test pasa contra la web.

## Fase 1 — Isla y personaje (en marcha)
Hecho por mí (Claude, sesión principal):
- Núcleo del motor (`src/core`): bucle con física a 60 Hz, entrada por acciones, contratos entre módulos, depuración `?debug=1`, pantalla de carga con consejos, ajustes de calidad.
- Jugador con el controlador cinemático de Rapier (andar, correr con aguante, saltar, pendientes, escalones) y cámara en tercera persona que no atraviesa paredes (con hombro al apuntar).
- Herramienta de capturas `herramientas/captura.mjs` (SwiftShader o `--gpu` con la GPU real del Mac).

En paralelo (4 agentes, cada uno en su copia del repositorio):
- Isla Puerto Paquete con los cinco barrios, calles, edificios, mobiliario, mapa.
- Kit de personajes articulados con animaciones por código.
- Cielo, sol, luna, nubes y ciclo de día y noche.
- HUD, minimapa y mapa grande.
(Se cortó la conexión a las 04:51 y se reiniciaron solos; conservan lo que llevaban.)

## Adelantado (escrito y compilando, se activa en su fase)
- Fase 2: vehículos con física (furgoneta, scooter, utilitario, taxi, deportivo, todoterreno, furgón + policía, banda y locos), subir/bajar/robar con F, daño con abolladuras, humo, fuego y explosiones con piezas, partículas, sonido sintetizado (motores, derrapes, claxon, sirena, golpes…), tráfico con IA, peatones, cosas rompibles.
- Fase 3: armas (pistola, escopeta, subfusil, fusil, lanzapaquetes, cinta de embalar, paquete FRÁGIL, pistola de sellos), IA de combate justa (avisa, se cubre, flanquea), policía con 1-5 sirenas, controles, arrestos y taller de pintura, Los Devueltos (guarida, emboscadas, persecuciones en furgoneta), muerte y reaparición.
- Fase 4: encargos con clientes absurdos (16 clientes y 7 manías con escena propia), mensajes del móvil, integridad del paquete, cajeros, botín robado y guarida.
- Fase 5: guardado automático.

## Medidas de fps
- Núcleo con mundo provisional, GPU real (Apple M4): 60 fps.

## Problemas
- El token de GitHub de este Mac no tiene permiso `workflow`: publico por la rama `gh-pages` (ver DECISIONES).
