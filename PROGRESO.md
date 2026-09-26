# PROGRESO — CONTRA REEMBOLSO

Enlace: https://agarroda-bit.github.io/contra-reembolso/

Si pierdes el contexto: relee `ENCARGO.md`, este archivo y `DECISIONES.md`, y sigue.

## Fase actual: 8 — Pulido

## Fase 8 — Pulido (en curso)
Nota: el Mac se durmió de 08:12 a 14:20 y el trabajo se paró esas horas; ahora queda despierto con `caffeinate` mientras dura la sesión.

Cinco agentes pulieron una parte cada uno y un sexto jugó la partida entera como un jugador, apuntando fallos:
- **Conducción:** saltos más largos y aterrizando plano (rampa del Puerto: de 25 a 40 m), frenos más firmes (90 → 0 km/h en 24-32 m), freno de mano que gira sin trompo, sales volando de la moto en choques fuertes, cámara que tiembla en los choques y no se mete en las paredes. Tráfico que sigue su carril en las curvas, adelanta a los 7 s si algo le bloquea y no aparece delante de la cámara. Ruedas compartidas: los vehículos pasan de 132 a 52 draw calls.
- **Combate:** los enemigos ya no atraviesan paredes, van por las calles y rodean; policía y furgonetas que se atascaban ahora maniobran; la búsqueda sube menos al defenderte (0,3 por disparo); con 1-2 sirenas no disparan. Sensaciones: arco rojo que señala de dónde te disparan, imán suave al apuntar, gritos de aviso antes de disparar, derribos con más vuelo y confeti. Arreglado un cuelgue al morir mientras disparaba un policía.
- **Economía:** tiempos de los encargos calculados por el camino real (normal 90-100 s), 16 clientes nuevos (32 en total), fama por niveles nuevos (primera misión hacia el minuto 15-20, final de la historia en 1,5-2,5 h), tutorial que no se atasca y arreglos en las cinco misiones.
- **Interfaz:** avisos que no se pisan, cartel del barrio arriba y breve, minimapa dentro de los edificios, números de dinero más vistosos, pantalla de controles con mando, **mando en los menús** (Start, cruceta, A/B), menús que caben en 720 px.
- **Rendimiento:** medidor de tiempos con `?debug=1` (botón «⏱ tiempos»), CPU por fotograma de 3,6 a 2,5 ms en media, sin el parón de medio segundo del primer tiro (una sola luz de destello), shaders compilados al empezar, la mitad de objetos en la escena y peatones reciclados (de 48 a 5 creados por minuto conduciendo).
- **Probador:** encontró 18 fallos (5 graves: la partida se machacaba desde el menú, bucle de muertes en la oficina, premio de la misión final perdido, puñetazos que contaban como disparos, error en el club). En arreglo ahora, con verificación de otro agente por cada área.

## Fase 7 — La historia del tablón ✅ (26/09, 06:53, publicada)
- Tablón de encargos grandes en la oficina (dentro, en la pared), con cinco misiones que se desbloquean por fama y en orden:
  1. «El reloj de la señora Puri» (fama 2): reloj de oro de la joyería del Centro a la Colina, con dos furgonetas moradas persiguiéndote y emboscada al llegar; si el reloj se rompe, fallas.
  2. «Mudanza exprés» (fama 3): cargar los muebles de Kevin en la furgoneta y llevarlos en 3 minutos sin romper nada (cada golpe rompe algo: «¡El flamenco!»).
  3. «El paquete que hace tic-tac» (fama 4): un «despertador» para el casino… que resulta ser una bomba; hay que tirarla al mar al final del muelle antes de que explote (los golpes aceleran el tic-tac).
  4. «Asalto a la guarida» (fama 5): derribar a los guardias, abrir el almacén de Los Devueltos y volver a la oficina con dos sirenas y la banda detrás.
  5. «El Devolución» (fama 6): jefe final en su camión blindado recorriendo la isla; al 60 % llama a sus furgonetas y suelta paquetes FRÁGIL; al 25 % se baja y pelea a pie con lanzapaquetes. Final con créditos graciosos; después, el mundo libre sigue.
- Pruebas: + la misión del reloj de principio a fin (`capturas/fase-7/`); el resto probadas a mano con scripts (jefe final y bomba completas).

## Fase 6 — La vida de lujo ✅ (26/09, 06:50, publicada)
- Casino «La Suerte Loca» (Centro): vestíbulo y tres juegos de verdad con animaciones y sonido: tragaperras «La Paquetera», ruleta europea y blackjack «El 21 del Puerto». Apuestas de 10 a 500 € con el dinero del juego.
- Club Reembolso VIP (Centro): interior con pista de baile de colores, DJ, focos, bola de espejos y gente bailando; mesa VIP (1.500 €) y botellas de champán (300 €): fiesta con luces, confeti y subida de FAMA. Sin contenido sexual.
- El de las hierbas (Barrio Viejo): 50 €; efecto psicodélico de pantalla (colores, ondas), cámara lenta, el personaje anda raro, la radio suena distorsionada y salen frases graciosas.
- El ático (Colina): se compra por 25.000 € y se decora desde la tablet (sofá gigante, tele enorme, jacuzzi, acuario, estatua dorada, cuadros, neones, colección de coches); dormir en la cama pasa al día siguiente, cura y guarda.
- Interior de la oficina con el tablón de encargos, que cambia con el nivel de la empresa y enseña los lujos comprados (café, sillón, acuario, cuadro, billar).
- Radio en los vehículos con 3 emisoras de música generada por código (reguetón, electrónica y rumba), locutores y anuncios inventados; Q/E cambia de emisora.
- Vehículos locos repartidos por la isla: carrito del súper con motor (rueda loca), patinete eléctrico, camión de la basura (lo arrasa todo), carrito de golf y grúa del puerto (el volante va al revés a ratos).
- Resto de armas locas: paquete FRÁGIL explosivo y pistola de sellos (en la armería y tiradas por la isla).
- Pruebas: + casino, club, hierbas y vehículos locos (`capturas/fase-6/`).

## Fase 5 — Tiendas y progreso ✅ (26/09, 06:44, publicada)
- Menú principal con la isla de fondo (Continuar / Nueva partida / Opciones / Controles), creación del repartidor (nombre, piel, peinado, color de pelo, uniforme, gorra) con vista previa girando, pausa (Esc) y opciones (sensibilidad, invertir eje, volúmenes, calidad baja/media/alta, campo de visión).
- Tiendas físicas (E en la puerta): Talleres Manolo (concesionario de 6 vehículos, mejoras de motor/frenos/blindaje/neumáticos/maletero/nitro, reparación y pintura), Armería El Gatillo Alegre (armas, munición, chaleco, botiquín), Moda Paquetona (uniformes, gorras, gafas, cadena, zapatillas, chándal: se ve en el personaje).
- Tu empresa (E en la oficina): ampliar la oficina por niveles (se ve fuera: cartel luminoso, estanterías, furgonetas aparcadas), comprar furgonetas para la flota, contratar repartidores que ingresan dinero cada día (y a veces piden ayuda por el móvil porque los asalta la banda), lujos de oficina.
- FAMA por niveles: sube con entregas perfectas, compras y lujos; desbloquea tiendas, vehículos y la historia.
- Garaje en el móvil: tus vehículos comprados te los traen a la calle más cercana.
- Guardado automático cada 45 s y al salir (dinero, banco, fama, armas, vehículos y mejoras, ropa, empresa, historia, coleccionables).
- Tutorial suave: Don Remigio te guía por el móvil (moverse, subir a la furgoneta, aceptar el primer encargo, recoger, entregar, ingresar en el cajero).
- Pruebas: + menú y creación, + las cuatro tiendas (`capturas/fase-5/`), + guardar y continuar (`herramientas/prueba-guardado.mjs`).

## Fase 4 — Encargos y dinero ✅ (26/09, 06:38, publicada)
- Móvil «Pomelo» (Tab) con la app de mensajería inventada «PaqueChat»: van llegando encargos de clientes con qué quieren, dónde, cuánto pagan y el tiempo; se aceptan con un botón o Enter. Apps de Banco, Fama y Ayuda.
- Encargos: recoger en la oficina o en tiendas (📦 en el mapa y columna de luz en la puerta), llevar sin romper (la integridad baja con golpes y saltos), entregar con E y cobrar en EFECTIVO; propina si llega rápido y entero, menos dinero si llega roto o tarde.
- Tipos: FRÁGIL, URGENTE, SOSPECHOSO (triple y emboscada), PESADO (solo furgoneta o furgón). Capacidad según vehículo; a pie, un paquete.
- 16 clientes absurdos con muchas frases y 7 manías con escena: la abuela que cuenta céntimos, el «déjaselo al vecino» (que es de la banda y te lo roba), el que cambia de dirección al llegar, la de pijama con el perro Pancho que te persigue, el que dice que no ha pedido nada, la influencer que te graba y el que regatea (E acepta, Q regatea).
- Cajeros 🏧 (3) para ingresar el efectivo. Si te matan Los Devueltos, se llevan tu efectivo y tus paquetes a su guarida: tienes un día de juego para asaltarla y abrir la caja fuerte. Las embestidas de la furgoneta morada tiran paquetes al suelo, y si paras, te sacan del vehículo.
- Pruebas: + abrir el móvil y aceptar un encargo (`capturas/fase-4/`).

## Fase 3 — Armas y enemigos ✅ (26/09, 06:30, publicada)
- Armas normales: pistola (empiezas con ella), escopeta, subfusil y fusil; locas: lanzapaquetes (cajas que rebotan y tumban) y pistola de cinta de embalar (deja pegados al suelo). Hay una tirada en cada barrio, más botiquines y un chaleco; reaparecen a los 3 min.
- Apuntado al hombro con retícula (clic derecho), retroceso, fogonazo, trazadoras, casquillos, chispas; rueda de armas (1-5 y rueda del ratón); marca de impacto; disparo desde el vehículo hacia los lados y atrás.
- Los Devueltos: guardias en su guarida del Polígono, emboscadas, persecuciones en furgoneta morada (embisten, disparan por la ventanilla, te sacan del vehículo). IA justa: avisan antes del primer tiro, se cubren, flanquean y fallan más de lejos. Al caer: nube de cartón y confeti, y a veces sueltan dinero o munición.
- Policía con 1-5 sirenas: sube por robar coches delante de ellos, disparar, atropellar o agredir; coches patrulla que te persiguen por las calles, furgones y controles desde 3 sirenas; con 1-2 sirenas intentan detenerte (barra de arresto); se pierde escapando un rato o en el taller de pintura.
- Muerte («¡TE HAN DEVUELTO!») y arresto («¡TE HAN PILLADO!») con pérdida del efectivo; reapareces en el centro de salud o la oficina. Caer al mar: te saca un pescador. La vida se recupera sola hasta 60.
- Pruebas: + disparar y tiroteo (`capturas/fase-3/`). 19 fallos encontrados por un revisor, arreglados.

## Fase 2 — Vehículos ✅ (26/09, 06:22, publicada)
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

## Medidas de fps
- Núcleo con mundo provisional, GPU real (Apple M4): 60 fps.

## Problemas
- El token de GitHub de este Mac no tiene permiso `workflow`: publico por la rama `gh-pages` (ver DECISIONES).
