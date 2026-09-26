# PROGRESO — CONTRA REEMBOLSO

Enlace: https://agarroda-bit.github.io/contra-reembolso/

Si pierdes el contexto: relee `ENCARGO.md`, este archivo y `DECISIONES.md`, y sigue.

## Fase actual: 6 — La vida de lujo (integrando)

## Fase 5 — Tiendas y progreso ✅ (26/09, 07:25, publicada)
- Menú principal con la isla de fondo (Continuar / Nueva partida / Opciones / Controles), creación del repartidor (nombre, piel, peinado, color de pelo, uniforme, gorra) con vista previa girando, pausa (Esc) y opciones (sensibilidad, invertir eje, volúmenes, calidad baja/media/alta, campo de visión).
- Tiendas físicas (E en la puerta): Talleres Manolo (concesionario de 6 vehículos, mejoras de motor/frenos/blindaje/neumáticos/maletero/nitro, reparación y pintura), Armería El Gatillo Alegre (armas, munición, chaleco, botiquín), Moda Paquetona (uniformes, gorras, gafas, cadena, zapatillas, chándal: se ve en el personaje).
- Tu empresa (E en la oficina): ampliar la oficina por niveles (se ve fuera: cartel luminoso, estanterías, furgonetas aparcadas), comprar furgonetas para la flota, contratar repartidores que ingresan dinero cada día (y a veces piden ayuda por el móvil porque los asalta la banda), lujos de oficina.
- FAMA por niveles: sube con entregas perfectas, compras y lujos; desbloquea tiendas, vehículos y la historia.
- Garaje en el móvil: tus vehículos comprados te los traen a la calle más cercana.
- Guardado automático cada 45 s y al salir (dinero, banco, fama, armas, vehículos y mejoras, ropa, empresa, historia, coleccionables).
- Tutorial suave: Don Remigio te guía por el móvil (moverse, subir a la furgoneta, aceptar el primer encargo, recoger, entregar, ingresar en el cajero).
- Pruebas: + menú y creación, + las cuatro tiendas (`capturas/fase-5/`), + guardar y continuar (`herramientas/prueba-guardado.mjs`).

## Fase 4 — Encargos y dinero ✅ (26/09, 07:10, publicada)
- Móvil «Pomelo» (Tab) con la app de mensajería inventada «PaqueChat»: van llegando encargos de clientes con qué quieren, dónde, cuánto pagan y el tiempo; se aceptan con un botón o Enter. Apps de Banco, Fama y Ayuda.
- Encargos: recoger en la oficina o en tiendas (📦 en el mapa y columna de luz en la puerta), llevar sin romper (la integridad baja con golpes y saltos), entregar con E y cobrar en EFECTIVO; propina si llega rápido y entero, menos dinero si llega roto o tarde.
- Tipos: FRÁGIL, URGENTE, SOSPECHOSO (triple y emboscada), PESADO (solo furgoneta o furgón). Capacidad según vehículo; a pie, un paquete.
- 16 clientes absurdos con muchas frases y 7 manías con escena: la abuela que cuenta céntimos, el «déjaselo al vecino» (que es de la banda y te lo roba), el que cambia de dirección al llegar, la de pijama con el perro Pancho que te persigue, el que dice que no ha pedido nada, la influencer que te graba y el que regatea (E acepta, Q regatea).
- Cajeros 🏧 (3) para ingresar el efectivo. Si te matan Los Devueltos, se llevan tu efectivo y tus paquetes a su guarida: tienes un día de juego para asaltarla y abrir la caja fuerte. Las embestidas de la furgoneta morada tiran paquetes al suelo, y si paras, te sacan del vehículo.
- Pruebas: + abrir el móvil y aceptar un encargo (`capturas/fase-4/`).

## Fase 3 — Armas y enemigos ✅ (26/09, 07:00, publicada)
- Armas normales: pistola (empiezas con ella), escopeta, subfusil y fusil; locas: lanzapaquetes (cajas que rebotan y tumban) y pistola de cinta de embalar (deja pegados al suelo). Hay una tirada en cada barrio, más botiquines y un chaleco; reaparecen a los 3 min.
- Apuntado al hombro con retícula (clic derecho), retroceso, fogonazo, trazadoras, casquillos, chispas; rueda de armas (1-5 y rueda del ratón); marca de impacto; disparo desde el vehículo hacia los lados y atrás.
- Los Devueltos: guardias en su guarida del Polígono, emboscadas, persecuciones en furgoneta morada (embisten, disparan por la ventanilla, te sacan del vehículo). IA justa: avisan antes del primer tiro, se cubren, flanquean y fallan más de lejos. Al caer: nube de cartón y confeti, y a veces sueltan dinero o munición.
- Policía con 1-5 sirenas: sube por robar coches delante de ellos, disparar, atropellar o agredir; coches patrulla que te persiguen por las calles, furgones y controles desde 3 sirenas; con 1-2 sirenas intentan detenerte (barra de arresto); se pierde escapando un rato o en el taller de pintura.
- Muerte («¡TE HAN DEVUELTO!») y arresto («¡TE HAN PILLADO!») con pérdida del efectivo; reapareces en el centro de salud o la oficina. Caer al mar: te saca un pescador. La vida se recupera sola hasta 60.
- Pruebas: + disparar y tiroteo (`capturas/fase-3/`). 19 fallos encontrados por un revisor, arreglados.

## Fase 2 — Vehículos ✅ (26/09, 06:40, publicada)
- Furgoneta de reparto (6 paquetes), scooter (2) y coches de calle: utilitario, taxi, deportivo, todoterreno y furgón. Física de Rapier con ruedas por rayos y ayudas arcade (turbo con Shift, freno de mano con Espacio, se enderezan solos).
- Subir y bajar con F; junto a un coche con conductor, F lo roba sacando al conductor con animación; tirarse en marcha te hace rodar.
- Tráfico con IA (≈16 coches alrededor del jugador) que sigue su carril, frena si te pones delante y pita; coches aparcados; peatones que pasean, miran el móvil, huyen y se levantan cabreados si los atropellas.
- Daño visible: abolladuras, humo, fuego y explosión con piezas volando; cosas rompibles (vallas, cajas, puestos de fruta, papeleras, bancos, conos).
- Sonido sintetizado: motores con revoluciones, derrapes, claxon, golpes, cristales, explosiones.
- Pruebas: todas las de la fase 1 + subir a la furgoneta y conducir 10 s (`capturas/fase-2/`).
- Fps: 60 con GPU real (≈150-290 draw calls con tráfico).

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
