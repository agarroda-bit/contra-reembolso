# 🎮 JUEGA AQUÍ → https://agarroda-bit.github.io/contra-reembolso/

Ábrelo en Chrome o Safari en el MacBook. Haz clic dentro del juego para que el ratón mueva la cámara. «Continuar» recupera tu partida (se guarda sola).

---

## ⚠️ LO QUE FALTA O NO HA SALIDO BIEN (léelo primero)

- **Sesión parada por ti el 27/09.** Lo publicado en el enlace (fases 0 a 9) está probado y funciona. Quedó **a medias la segunda ronda de mejoras de la fase 9**, guardada en seis ramas de GitHub (`fase9/…`) sin mezclar con el juego ni probar:
  - Vehículos locos nuevos: silla de la yaya, paella-móvil, sofá del rastro y carretilla del puerto.
  - Sucesos nuevos: boda, gallina, turista y atraco.
  - 8 clientes y 8 logros nuevos.
  - 11 prendas y 8 lujos del ático.
  - Animaciones con más gracia.
  - Detalles del mapa.
  - Mando jugando.

  Cómo retomarla: apartado «Cómo retomar» de `PROGRESO.md`.

- **El Mac se durmió de 08:12 a 14:20** y el trabajo se paró esas seis horas. Después lo mantuve despierto con `caffeinate` solo durante la sesión; ya está quitado.
- **Nadie lo ha jugado con las manos todavía.** Lo han probado agentes con scripts: uno jugó la partida entera de principio a fin, con las cinco misiones, las tiendas, el casino, el ático y guardar y continuar. Pero la sensación real de conducir y disparar hay que probarla.
- **La música y los sonidos nadie los ha oído.** Están hechos por código y comprobados por análisis (volumen, sin saturar), no de oído.
- **La publicación automática de GitHub (Actions) no está activada.** El GitHub de este Mac no tiene permiso para subir workflows, así que publico con `npm run deploy` (rama `gh-pages`). Funciona igual. Si quieres la automática: `gh auth refresh -s workflow` y mover `herramientas/github-actions-deploy.yml` a `.github/workflows/`.
- **Juego no apuntado todavía en tu Lanzador de apps** (tarea pendiente del vault).
- **Con mando:** funciona en los menús, el móvil y las tiendas, y hay pantalla de controles de mando. Jugando está puesto pero se ha probado poco.

---

## Cómo se juega (en cinco líneas)
1. Te llegan encargos al móvil (**Tab**). Acéptalos con el botón o **Enter**.
2. Recoge el paquete (📦 en el mapa, columna de luz en la puerta) y llévalo sin romperlo a la casa del cliente (🏠).
3. En la puerta pulsa **E**: el cliente (siempre raro) te paga en efectivo.
4. Ingresa el efectivo en un cajero 🏧: si te matan o te pillan, lo pierdes.
5. Gasta en vehículos, armas, ropa, tu empresa y lujos. Cuidado con Los Devueltos (morados) y la policía. Con fama, el tablón de la oficina abre las cinco misiones de la historia.

## Controles
| Tecla | Acción |
|---|---|
| WASD o flechas | Moverse / conducir |
| Ratón | Cámara (clic en el juego para capturarlo) |
| Shift | Correr / turbo |
| Espacio | Saltar / freno de mano |
| C | Agacharse |
| Clic izq. / der. | Disparar / apuntar |
| F | Subir, bajar y robar coches |
| E | Interactuar: entregar, cobrar, tiendas, puertas |
| R | Recargar |
| 1-5 y rueda | Cambiar de arma |
| Tab | Móvil (encargos, banco, garaje, reto del día) |
| M | Mapa grande |
| H | Claxon |
| Q / E en vehículo | Cambiar de emisora de radio |
| K | Modo foto |
| Esc o P | Pausa (opciones, controles, guardar) |

Con mando: Start pausa, A acepta, B vuelve; la pantalla de Controles enseña el resto.

---

## Qué hay hecho (por fases)
Todas las fases, de la 0 a la 9, están publicadas en el enlace. El detalle está en `PROGRESO.md`.

- **Fase 0 — Esqueleto:** proyecto, pruebas automáticas y publicación en GitHub Pages.
- **Fase 1 — Isla y personaje:** Puerto Paquete con cinco barrios (Puerto, Centro, Colina, Polígono, Barrio Viejo), día y noche de 20 minutos con farolas y neones, repartidor que anda, corre, salta y se agacha.
- **Fase 2 — Vehículos:** furgoneta de reparto, 16 vehículos, tráfico y peatones, robar coches, rampas, cosas que romper, caer al mar.
- **Fase 3 — Armas y enemigos:** pistola, subfusil, escopeta, fusil y armas locas (lanzapaquetes, cinta de embalar, paquete FRÁGIL, pistola de sellos). Los Devueltos con guarida y furgonetas. Policía de 1 a 5 sirenas, detenciones y taller de pintura. Sin sangre: los derribados salen volando en una nube de cartón y confeti.
- **Fase 4 — Encargos y dinero:** móvil con mensajería, 32 clientes con manías (la abuela que cuenta céntimos, el perro Pancho, el que regatea…), encargos normales, urgentes, frágiles, pesados y sospechosos. Efectivo y banco con cajeros.
- **Fase 5 — Tiendas y progreso:** menú, creación del repartidor, concesionario y taller, armería, tienda de ropa, tu empresa con empleados y flota, fama, guardado automático y tutorial de Don Remigio.
- **Fase 6 — Vida de lujo:** casino con tragaperras, ruleta y blackjack; club VIP con mesa y champán; el de las hierbas (efecto psicodélico); ático que se compra y se decora; interior de la oficina; radio con tres emisoras; vehículos locos (carrito del súper, patinete, camión de la basura, carrito de golf, grúa).
- **Fase 7 — Historia:** cinco misiones en el tablón de la oficina, jefe final «El Devolución» en su camión blindado y créditos.
- **Fase 8 — Pulido:**
  - Conducción con saltos que lucen, frenos firmes, freno de mano controlable y tráfico que no se atasca.
  - Combate más justo (enemigos que no atraviesan paredes, aviso de dónde te disparan) y economía equilibrada (unos 4.000-5.500 €/h, historia en 1,5-2,5 h).
  - Interfaz más clara y mando en los menús.
  - 60 fps en las tres calidades con la GPU del Mac.
  - Un agente jugó la partida entera y encontró 18 fallos: **arreglados todos** y comprobados por otro agente.
- **Fase 9 — Mejoras:** eventos aleatorios (ladrón de bolsos, camión que pierde paquetes, carrera callejera), modo foto, 20 logros y reto del día. *(La segunda ronda quedó a medias: ver arriba.)*

## Fallos conocidos (pequeños)
- Al entrar por primera vez en un interior puede notarse un tirón corto (menos de medio segundo) dentro del fundido.
- En calidad baja los interiores se ven algo más planos (sin luces puntuales).
- Algún roce de la cámara con balcones altos al mirar muy hacia abajo pegado a una fachada.
- En La Colina alguna patrulla de policía puede quedarse parada unos segundos antes de seguirte.
- Tras un atropello, el peatón se enfada un par de segundos en la calzada antes de irse.

## Ideas para la siguiente noche (de más a menos impacto)
1. **Que lo juegues tú 20 minutos** y me digas qué no te divierte: es lo que más cambia el juego.
2. Terminar, probar y publicar la segunda ronda de la fase 9 que quedó en las ramas `fase9/…` (lo más avanzado: vehículos locos y sucesos).
3. Más misiones de historia (una segunda banda, un jefe en barco) y encargos en cadena con un mismo cliente.
4. Música de verdad para la radio (más canciones y locutores) y voces graciosas generadas.
5. Versión para móvil (controles táctiles), para enseñarlo por WhatsApp.
6. Un modo «carreras» con récords.
7. Multijugador sencillo: ver el récord de dinero de otros.

## Capturas
![Isla al atardecer](capturas/destacadas/isla-atardecer.png)
![Conduciendo](capturas/destacadas/conduciendo.png)
![Tiroteo con Los Devueltos](capturas/destacadas/tiroteo.png)
![Casino de noche](capturas/destacadas/casino-noche.png)
