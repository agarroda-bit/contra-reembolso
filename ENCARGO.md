# CONTRA REEMBOLSO — encargo para toda la noche

Vas a construir tú solo, sin supervisión, un juego 3D de acción en tercera persona para navegador. Yo me voy a dormir y no voy a contestar nada hasta mañana. Trabaja toda la noche. Cuando me levante quiero abrir un enlace y jugar.

Todo el juego (textos, menús, mensajes, diálogos) va en **castellano de España**. Los informes que me dejes también, con frases cortas y sin tecnicismos: no soy programador.

---

## 0. Cómo tienes que trabajar (lee esto dos veces)

1. **No me preguntes nada.** Si algo no está definido, decide tú lo que haga el juego más divertido y apúntalo en `DECISIONES.md`.
2. **Por fases, y cada fase termina jugable.** No empieces la siguiente hasta que la actual funcione, pase las pruebas y esté subida. Si la noche se acaba a mitad, lo que haya tiene que funcionar.
3. **Lleva un `PROGRESO.md`** en la raíz: fase actual, qué está hecho, qué falta, problemas. Actualízalo después de cada tarea. Si pierdes el contexto o se compacta la conversación, lo primero es releer `PROGRESO.md`, `DECISIONES.md` y este encargo (guárdalo como `ENCARGO.md`) y seguir desde ahí.
4. **Commit pequeño después de cada cosa que funcione**, con mensaje claro en castellano. Push frecuente. Intenta trabajar y hacer push directamente en `main`; si no puedes, usa tu rama y deja todo listo para fusionar.
5. **Nunca rompas lo que ya funciona.** Si una mejora estropea algo, vuelve atrás y hazlo de otra forma.
6. **Si algo te bloquea más de 30-40 minutos** (una librería que no instala, una física que no sale), simplifícalo, apúntalo en `PROGRESO.md` y sigue. No te quedes atascado en una sola cosa.
7. **No pares cuando acabes las fases.** Al terminar la fase 8 entra en la fase 9 (mejoras sin fin) y sigue mejorando hasta que se acabe el tiempo. Dar el trabajo por terminado antes de tiempo es el peor resultado posible.
8. Antes de acabar la sesión, deja siempre escrito `INFORME-MAÑANA.md` (apartado 16) y todo subido.

---

## 1. El juego en pocas líneas

Eres un repartidor de paquetes contra reembolso en **Puerto Paquete**, una isla-ciudad mediterránea pequeña, densa y caótica. Te llegan encargos al móvil. Recoges paquetes, los entregas en furgoneta, moto o lo que robes por la calle, cobras en efectivo a clientes absurdos y te defiendes a tiros de **Los Devueltos**, una banda de repartidores de la competencia que quiere quitarte la carga y el dinero. Si la lías demasiado, viene la policía. Con lo que ganas mejoras vehículos y armas, te vistes, te compras lujos, juegas en el casino, pillas mesa VIP en el club y haces crecer tu empresa de reparto hasta tener tu propia flota.

- **Tono:** humor gamberro. Clientes ridículos, frases con gracia, física exagerada, caos. Violencia de dibujos animados: sin sangre; cuando un enemigo cae, sale volando con una nube de cartón y confeti y desaparece.
- **Estilo visual:** low-poly colorido, sombreado plano, colores saturados, atardeceres bonitos. Nada de marcas reales.
- **Estructura:** mundo libre. Nada de niveles cerrados: paseas por la isla y aceptas encargos cuando quieres.
- **Plataforma:** navegador de ordenador (Chrome y Safari en un MacBook Air). Teclado y ratón. Mando opcional como extra.

---

## 2. Tecnología (obligatoria)

- **Vite + TypeScript + Three.js.** Física con **Rapier** (`@dimforge/rapier3d-compat`): controlador cinemático para el personaje y vehículos con ray-cast. Si Rapier te da problemas de verdad, física arcade propia; lo importante es que conducir sea divertido.
- **Todo tiene que funcionar sin descargar nada de internet salvo paquetes npm.** Tu entorno puede tener la red limitada, así que:
  - **Modelos 3D generados por código** a partir de primitivas (cajas, cilindros, conos) combinadas y con sombreado plano: personajes, coches, edificios, árboles, farolas, mobiliario. Crea un pequeño "kit" de funciones generadoras (`makeCar()`, `makeBuilding()`, `makeCharacter()`…) con variaciones aleatorias con semilla.
  - **Personajes articulados** (cabeza, torso, brazos, piernas por piezas) con **animaciones procedurales por código**: andar, correr, saltar, apuntar, disparar, caer, subir al coche, sacar a alguien del coche, bailar.
  - **Sonido sintetizado con Web Audio**: motores que cambian con las revoluciones, disparos, golpes, claxon, sirena, notificaciones del móvil y música de radio generada por código.
  - Si la red lo permite, puedes añadir modelos libres CC0 (Quaternius, Kenney) como mejora, pero el juego tiene que verse bien sin ellos.
- **Rendimiento:** 60 fps en un MacBook Air. Instancing para lo repetido, pocos draw calls, una luz direccional con sombras, niebla para ocultar lo lejano, `pixelRatio` máximo 1,5, tráfico y peatones que desaparecen lejos del jugador. Selector de calidad (baja / media / alta) en opciones.
- **Guardado** automático en `localStorage` (dinero, banco, vehículos, armas, ropa, mejoras, empleados, progreso de misiones) y botón "Continuar" en el menú.
- **Modo depuración** con `?debug=1`: fps, teletransporte a cada zona, dinero infinito, invencible, subir o bajar búsqueda. Te servirá para las pruebas.

---

## 3. Controles

| Tecla | Acción |
|---|---|
| WASD | Moverse / conducir |
| Ratón | Cámara (pointer lock) |
| Shift | Correr / turbo del vehículo |
| Espacio | Saltar / freno de mano (derrape) |
| Clic izquierdo | Disparar |
| Clic derecho | Apuntar (cámara al hombro, retícula) |
| F | Entrar y salir de vehículos; junto a un coche con conductor, **robarlo** |
| E | Interactuar (entregar, cobrar, tiendas, puertas) |
| R | Recargar |
| 1-5 y rueda | Cambiar de arma |
| Tab | Abrir el móvil |
| M | Mapa grande |
| H | Claxon |
| Q / E en vehículo | Cambiar de emisora de radio |
| Esc | Pausa |

Pantalla de controles accesible desde pausa. Mando con la Gamepad API si da tiempo (fase 9).

---

## 4. El mundo: Puerto Paquete

Isla pequeña y densa (unos 600 × 600 m), rodeada de mar, con calles estrechas, cuestas, escaleras, azoteas y atajos. Cinco barrios con personalidad propia:

1. **El Puerto:** tu **oficina de reparto** (punto de partida, tablón de encargos grandes, garaje, cajero para ingresar dinero), muelles, grúas, contenedores.
2. **El Centro:** tiendas, plaza con fuente, tienda de ropa, el **casino** y el **club VIP**, mucho tráfico y peatones.
3. **La Colina:** chalets, piscinas y el **ático** que puedes comprar. Clientes ricos y entregas caras.
4. **El Polígono:** **taller y concesionario**, **armería**, desguace, naves. Aquí está la **guarida de Los Devueltos**.
5. **El Barrio Viejo:** callejones, tendederos, bares, el "vendedor de hierbas" y mucho cliente raro.

Además:
- **Ciclo de día y noche** (un día de juego = 20 minutos reales), con farolas y neones de noche.
- **Tráfico con IA** que respeta más o menos el carril, frena si te pones delante y pita. **Peatones** que pasean, huyen de los tiros y se enfadan si los atropellas (sin sangre: salen rodando y se levantan cabreados).
- **Minimapa** en una esquina y **mapa grande** con la M, con iconos: oficina, tiendas, casino, club, ático, guarida, encargos activos.
- Rampas, cosas que romper (vallas, cajas, puestos de fruta, papeleras) y algún secreto escondido: 20 **paquetes perdidos** coleccionables por la isla.

---

## 5. El protagonista

- **Al empezar partida:** pantalla de creación. Nombre, tono de piel, peinado, color del uniforme, gorra sí/no. Vista previa girando.
- Estadísticas: vida, chaleco (armadura), aguante al correr.
- La ropa que compres después se ve en el personaje.

---

## 6. El bucle principal: encargos, dinero y robos

**Encargos por el móvil (lo normal).** Con la Tab se abre un móvil en pantalla con una app de mensajería inventada (sin imitar ninguna real). Van entrando mensajes de clientes cada poco tiempo. Cada uno dice qué quiere, a dónde, cuánto paga, el tiempo límite y cómo es el cliente. Aceptas uno o varios (según la capacidad del vehículo), se marcan en el mapa y en pantalla, recoges el paquete en la oficina o en una tienda y lo entregas.

- Al entregar, **cobras en efectivo**. El importe va a "dinero encima", no al banco.
- **Integridad del paquete:** baja con los golpes y los saltos. Si llega destrozado, el cliente paga menos y se queja. Si llega rápido y entero, propina.
- **Paquetes especiales:** "FRÁGIL" (una vajilla: no puedes ni rozar), "URGENTE" (tiempo muy corto), "SOSPECHOSO" (paga el triple, pero Los Devueltos lo saben y te esperan), "PESADO" (solo cabe en la furgoneta).
- **Clientes absurdos**, con decenas de mensajes y reacciones escritos por ti, por ejemplo: la abuela que paga en monedas de céntimo y tarda un minuto en contarlas; el que "no está, déjaselo al vecino" y el vecino es de la banda; el que cambia la dirección cuando estás llegando; el que baja en pijama con un perro que te persigue; el que dice que él no ha pedido nada y luego sí; el influencer que te graba mientras entregas; el que regatea el reembolso.

**Encargos grandes en el tablón de la oficina.** Misiones con historia (fase 7).

**Ingresar el dinero.** El efectivo encima se puede perder. Para asegurarlo hay que llevarlo al **cajero de la oficina** (o a otros dos cajeros de la isla). En el HUD se ven siempre los dos: EFECTIVO y BANCO.

**Si te matan o te roban:**
- Pierdes el efectivo que no habías ingresado y los paquetes que llevabas.
- Apareces en el centro de salud o en la oficina.
- **La banda se lleva lo robado a su guarida** en el Polígono. Aparece un aviso en el móvil ("Os hemos pillado el botín, repartidor 😂") y un marcador. Tienes un tiempo (un día de juego) para asaltar la guarida y recuperarlo. Si no vas, lo pierdes del todo.
- Los Devueltos también pueden robarte sin matarte: te sacan de la furgoneta o te embisten hasta tirar paquetes, que puedes recoger del suelo si eres rápido.

---

## 7. Vehículos

Todos con daño visible (abollones, humo, fuego, explosión con piezas que salen volando), derrapes, saltos y conducción arcade divertida. Cámara de persecución que se aleja con la velocidad.

- **Furgoneta de reparto (la tuya):** lenta, pesada, aguanta mucho. Caben 6 paquetes. Mejorable.
- **Scooter / moto:** rápida, se cuela entre coches, caben 2 paquetes. Si chocas fuerte, sales volando.
- **Coches de la calle:** varios tipos (utilitario, taxi, deportivo, todoterreno, furgón). Te acercas, pulsas F y **sacas al conductor** con una animación. Si la policía te ve, sube la búsqueda.
- **Vehículos locos** repartidos por el mapa: carrito de supermercado con motor, patinete eléctrico, camión de la basura (lo arrasa todo), carrito de golf del casino, una grúa del puerto que se conduce fatal. Cada uno con su gracia al conducirlo.
- Los vehículos comprados se guardan en tu garaje y se pueden pedir desde el móvil.
- **Disparar desde el vehículo** (hacia los lados y hacia atrás) con subfusil o pistola.

---

## 8. Armas

Apuntado en tercera persona con retícula y cámara al hombro, retroceso, fogonazo, casquillos, impacto con chispas. Munición limitada; se compra.

- **Normales:** pistola, escopeta, subfusil, fusil.
- **Locas:**
  - **Lanzapaquetes:** dispara cajas que rebotan y tumban a la gente.
  - **Pistola de cinta de embalar:** deja a los enemigos pegados al suelo unos segundos.
  - **Paquete "FRÁGIL" explosivo:** granada con forma de caja.
  - **Pistola de sellos:** dispara ráfagas de sellos que aturden.
- Cambio de arma con 1-5 y rueda, rueda de armas en pantalla.

---

## 9. Enemigos: Los Devueltos y la policía

**Los Devueltos** (uniforme morado, furgonetas moradas con un logo de flecha hacia atrás):
- Emboscadas en la calle y en el punto de entrega, sobre todo con paquetes "SOSPECHOSOS".
- Persecuciones en coche: te embisten, te disparan desde la ventanilla e intentan sacarte del vehículo.
- Controlan el Polígono: si entras en su zona, te atacan.
- Su **guarida** es un almacén que se puede asaltar (con guardias, cajas y la caja fuerte con el botín robado).
- Su jefe, **"El Devolución"**, aparece al final de la historia (fase 7).

**La policía** con nivel de búsqueda de 1 a 5 **sirenas** en el HUD:
- Sube por robar coches delante de ellos, disparar, atropellar o destrozar cosas.
- 1-2 sirenas: un coche patrulla que te sigue. 3: varios coches y controles. 4-5: furgones, más agentes, bloqueos de calle.
- Se pierde escapando fuera de su vista un rato, o pasando por el **taller de pintura** del Polígono (cambia el color del coche y quita la búsqueda, cuesta dinero).
- Si la policía te pilla, pierdes el efectivo y las armas pequeñas.

Los enemigos tienen que ser listos pero justos: se cubren, flanquean y avisan antes de disparar. Nada de acertarte desde el otro lado del mapa.

---

## 10. En qué se gasta el dinero

Todas las tiendas son lugares físicos del mapa: entras, se abre un menú bonito y compras.

1. **Taller y concesionario (Polígono):** comprar vehículos, motor, frenos, blindaje, neumáticos, maletero más grande (más paquetes), nitro, pintura.
2. **Armería (Polígono):** armas, munición, chaleco.
3. **Tienda de ropa (Centro):** uniformes, gorras, gafas de sol, cadenas, zapatillas, chándal de lujo. Se ve en el personaje.
4. **Tu empresa (oficina del Puerto):**
   - Ampliar la oficina (por niveles, se ve el cambio: más estanterías, cartel luminoso, furgonetas aparcadas).
   - **Contratar repartidores** que aparecen con su furgoneta por el mapa y generan dinero cada día de juego (y a veces los roba la banda y te piden ayuda por el móvil).
   - Comprar furgonetas para la flota.
   - Lujos de oficina: máquina de café, sillón de jefe, acuario, cuadro tuyo gigante, mesa de billar.
5. **Casino (Centro):** tragaperras, ruleta y blackjack sencillos, con animaciones y sonido. Un minijuego de cada, jugable de verdad.
6. **Club VIP (Centro):** comprar mesa VIP y botellas de champán. Al hacerlo: fiesta con luces, música, gente bailando (bailarines y bailarinas animados) y una subida de **FAMA**. **Sin contenido sexual explícito de ningún tipo.**
7. **Vendedor de hierbas (Barrio Viejo):** comprar marihuana. Al fumar: efecto visual de colores psicodélicos y ondas en pantalla, cámara lenta un rato (ayuda a apuntar), el personaje anda raro, la radio suena distorsionada y aparecen frases graciosas. Todo en tono de humor.
8. **El ático (Colina):** tu casa. Se compra y se decora con lujos que se ven al entrar: sofá gigante, tele enorme, jacuzzi, acuario, estatua dorada, cuadros, luces de neón, colección de coches en el garaje. Dormir en la cama pasa al día siguiente y guarda la partida.

**FAMA:** sube con entregas perfectas, lujos y mesas VIP. Por niveles desbloquea encargos mejor pagados, vehículos y la historia del tablón.

---

## 11. Pantalla (HUD) y menús

- **HUD:** vida y chaleco, EFECTIVO y BANCO, munición y arma, sirenas de búsqueda, minimapa, encargos activos con tiempo restante, integridad del paquete, notificaciones del móvil que entran por un lado, velocímetro en vehículo, emisora de radio.
- **Menú principal** con fondo 3D animado de la isla, logo "CONTRA REEMBOLSO", Nueva partida / Continuar / Opciones / Controles.
- **Pausa**, **opciones** (sensibilidad del ratón, invertir eje, volumen general/música/efectos, calidad gráfica, campo de visión), **pantalla de carga** con consejos graciosos.
- **Tutorial suave** en los primeros minutos: el jefe de la oficina te explica por el móvil cómo moverte, subir a la furgoneta, hacer tu primera entrega y cobrar.
- Todo el texto de interfaz con tipografía grande, legible y con estilo (fuentes del sistema, nada de descargas).

---

## 12. Sonido y radio

- Efectos: pasos, motor por tipo de vehículo, derrapes, choques, disparos por arma, recargas, explosiones, cristales, sirena, claxon, caja registradora al cobrar, notificación del móvil, gente quejándose (sonidos de "voz" tipo balbuceo, no voces reales).
- **Radio en los vehículos** con 3 emisoras de música generada por código (una reguetonera, una electrónica, una de rumba o flamenquito), cada una con su nombre gracioso y un locutor escrito en texto que sale en pantalla con cuñas de publicidad inventadas.

---

## 13. Fases (en este orden; cada una termina jugable, probada, con commit y publicada)

- **Fase 0 — Esqueleto y publicación.** Proyecto Vite + TS + Three + Rapier. Workflow de GitHub Actions que construye y publica en GitHub Pages en cada push a `main` (`base: './'` en Vite). Página de prueba con un cubo girando **publicada y funcionando en el enlace** antes de seguir. Tests con Playwright montados (apartado 14).
- **Fase 1 — Isla y personaje.** Generación de la isla con los cinco barrios, colisiones, personaje con andar/correr/saltar, cámara en tercera persona sin atravesar paredes, ciclo día/noche, minimapa.
- **Fase 2 — Vehículos.** Furgoneta, scooter y 4 coches de calle, entrar y salir, robar con animación, tráfico con IA, peatones, daño y explosiones.
- **Fase 3 — Armas y enemigos.** Las armas normales y dos locas, apuntado, Los Devueltos a pie y en coche, policía con sirenas, muerte y reaparición.
- **Fase 4 — Encargos y dinero.** Móvil con mensajes, encargos con tiempo e integridad, cobro en efectivo, cajeros, robo y guarida para recuperarlo, clientes absurdos.
- **Fase 5 — Tiendas y progreso.** Taller, armería, ropa, empresa (ampliar y contratar), FAMA, guardado, menú principal, pausa, opciones, creación de personaje, tutorial.
- **Fase 6 — La vida de lujo.** Casino con sus tres juegos, club VIP, hierbas, ático decorable, vehículos locos, resto de armas locas, radio.
- **Fase 7 — La historia del tablón.** Cinco encargos grandes con guion y humor, por ejemplo: (1) "El reloj de la señora Puri": llevar un reloj de lujo carísimo a la Colina con Los Devueltos persiguiéndote; (2) "Mudanza exprés": mover los muebles de un cliente en la furgoneta en 3 minutos sin romper nada; (3) "El paquete que hace tic-tac"; (4) "Asalto a la guarida": recuperar los paquetes de toda la isla; (5) **jefe final: "El Devolución"** en su camión blindado por toda la isla, con fases y un final con créditos graciosos. Después del final, el mundo libre sigue.
- **Fase 8 — Pulido.** Sensaciones al jugar (golpes con temblor de cámara, cámara lenta en explosiones grandes, partículas, números de dinero que saltan al cobrar), equilibrio de precios y dificultad, rendimiento, arreglar todos los fallos que encuentres.
- **Fase 9 — Mejoras sin fin (hasta que se acabe el tiempo).** Sigue esta lista y, si la acabas, inventa más: más clientes y mensajes, más vehículos locos, eventos aleatorios por la isla (carrera callejera, persecución de un ladrón de bolsos, paquete que se cae de un camión), más ropa, más decoración, mando, logros, fotos con modo foto, reto diario, mejores animaciones, más calles y detalles en el mapa. Revisa el juego jugándolo en los tests y arregla lo que chirríe.

---

## 14. Cómo comprobar que funciona (obligatorio en cada fase)

- `npm run build` y `tsc` sin errores.
- **Playwright** con Chromium en modo headless (WebGL con SwiftShader):
  - el juego carga sin errores en consola;
  - saca capturas del menú, de cada barrio, de día y de noche, conduciendo y en un tiroteo, y **míralas tú** para comprobar que se ve bien (nada negro, nada flotando, el personaje no atraviesa paredes);
  - simula teclas: andar hacia delante, subir a la furgoneta, conducir 10 segundos, disparar, abrir el móvil, aceptar un encargo;
  - mide los fps con `?debug=1` y apúntalos en `PROGRESO.md`.
- Guarda las capturas en `capturas/fase-N/` y súbelas. Las mejores, en el README.
- Después de publicar, comprueba que el enlace de GitHub Pages carga la última versión.

---

## 15. Límites de contenido

- Humor gamberro, sí. Violencia de dibujos animados sin sangre ni vísceras.
- El club VIP es fiesta, música, baile y champán, **sin ningún contenido sexual ni desnudos**.
- La marihuana solo como efecto cómico, estilo videojuego de acción.
- Ninguna marca, logo ni persona real. Todos los nombres inventados.

---

## 16. Lo que quiero encontrar mañana

`INFORME-MAÑANA.md` en la raíz y el mismo texto al final de tu último mensaje, en castellano sencillo:

1. **El enlace para jugar** (arriba del todo, en grande).
2. Cómo se juega en cinco líneas y los controles.
3. Qué hay hecho, por fases.
4. **Lo que falta o no ha salido bien**, en su propio apartado y bien visible.
5. Fallos conocidos.
6. Ideas para la siguiente noche, ordenadas por lo que más mejoraría el juego.
7. Tres o cuatro capturas.

Empieza ya por la fase 0. Buena noche de trabajo.
