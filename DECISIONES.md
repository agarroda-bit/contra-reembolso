# DECISIONES

Lo que no estaba definido en el encargo y he decidido yo.

## Técnicas
- **26/09 · Carpeta del proyecto:** `Downloads/GOLDENO1/contra-reembolso` (junto a `el-mandato`), fuera del vault de Obsidian para que no indexe miles de archivos de `node_modules`.
- **26/09 · Versiones:** Three.js 0.186, Rapier 0.21 (`@dimforge/rapier3d-compat`, que trae el WASM dentro del JS y no necesita descargar nada aparte), Vite 8, TypeScript 7.
- **26/09 · Publicación sin GitHub Actions:** la sesión de GitHub de este ordenador no tiene el permiso `workflow`, y GitHub rechaza cualquier push que traiga un archivo de `.github/workflows/`. Así que publico con `npm run deploy`, que construye el juego y lo sube a la rama `gh-pages`; Pages sirve esa rama. El workflow está preparado en `herramientas/github-actions-deploy.yml`: para activarlo, dar el permiso (`gh auth refresh -s workflow`), moverlo a `.github/workflows/deploy.yml` y poner Pages en «GitHub Actions».
- **26/09 · Trabajo en paralelo:** para aprovechar la noche, varios agentes construyen módulos a la vez, cada uno en su copia del repositorio, y yo los junto. Mientras ellos hacían la fase 1, yo adelanté código de las fases 2 a 5 **sin activarlo**; cada fase se activa, se prueba y se publica en orden, como pide el encargo.
- **26/09 · Contratos:** los módulos se hablan por `src/core/contracts.ts` (mundo, personajes, HUD, eventos). Así un agente puede hacer la isla sin saber nada del resto.
- **26/09 · Ejes:** X = este, Z = sur (el norte es −Z), 1 unidad = 1 metro.
- **26/09 · Personajes en un solo draw call** (malla con esqueleto y colores por vértice) para poder tener muchos peatones a 60 fps.
- **26/09 · Vehículos:** física de Rapier con ruedas por rayos, más ayudas arcade (no vuelcan fácil, se enderezan solos a los 2,5 s, control en el aire, carga aerodinámica). Frenos, motor y giro medidos con un banco de pruebas (`pruebas/vehiculos.html?medir`): el utilitario hace 0-100 en 5 s y gira a ~1,5 g. Fase 8: frena de 90 km/h en ~28 m (antes 35 m); en el aire la gravedad es 0,62 y las rampas dan un empujón para que los saltos luzcan; el freno de mano ayuda a girar y frena el trompo al soltarlo; en moto o patinete sales despedido en los choques fuertes.
- **26/09 · Fps reales:** además de SwiftShader (lo que pide el encargo para las pruebas), mido con el Chromium completo usando la GPU del Mac (`--gpu`), que da cifras parecidas a las del MacBook Air.

## De juego
- **Los civiles no mueren nunca:** si les das o les atropellas, salen rodando y se levantan cabreados (encargo). Solo los de la banda y la policía «caen» (nube de cartón y confeti).
- **Arrestos:** con 1-2 sirenas la policía intenta detenerte sin disparar; desde 3 sirenas disparan. Si te quedas quieto junto a un policía 2 segundos, te pillan.
- **Taller de pintura:** cuesta 150 € + 150 € por sirena, cambia el color y quita la búsqueda.
- **Caída al mar:** «¡Al agua!» y apareces en la orilla más cercana con un poco menos de vida (no se pierde el dinero).
- **Encargos:** si se acaba el tiempo, aún puedes entregar con retraso (cobras la mitad) durante 60 s; luego el cliente cancela.
- **Paquetes FRÁGIL:** cualquier roce los daña mucho. **SOSPECHOSO:** paga el triple y hay emboscada cerca del destino. **PESADO:** solo en la furgoneta o el furgón. **URGENTE:** mitad de tiempo.
- **Botín robado:** solo si te matan Los Devueltos (o te matan con ellos cerca). Tienes un día de juego (20 min) para asaltar la guarida; la caja fuerte solo se abre sin guardias cerca.
- **Armas antes de la armería:** como la armería llega en la fase 5, desde la fase 3 empiezas con una pistola («el jefe te la da por si acaso») y hay un arma tirada en cada barrio (Puerto: lanzapaquetes, Centro: cinta de embalar, Viejo: subfusil, Polígono: escopeta, Colina: fusil), más botiquines y un chaleco; reaparecen a los 3 minutos. Desde la fase 6 también el paquete FRÁGIL (desguace) y la pistola de sellos (un bar).
- **Dificultad:** pensada para jugar tranquilo. Los enemigos hacen un 30-35 % del daño de tu misma arma, fallan más de lejos y descansan entre ráfagas; la vida se recupera sola hasta 60 si pasas 8 s sin recibir daño. Fase 8: la puntería enemiga va por probabilidad (40 % de cerca y parados, policía 46 %; menos de lejos, si corres o si vas en coche) y los fallos pasan silbando; la pistola hace 30 (dos tiros a un Devuelto, tres a un policía); imán suave al apuntar, que no actúa con policías que solo quieren detenerte.
- **Búsqueda policial (fase 8):** cada disparo suma 0,3 de búsqueda (antes 1); sin un policía delante no pasa de 2 sirenas.
- **Tiempos de los encargos (fase 8):** salen del camino real por calle: 35 s de paradas + el camino a 6,5 m/s (normal 90-100 s). URGENTE 70 % del normal; FRÁGIL y PESADO ×1,2; SOSPECHOSO ×1,35 (incluye la emboscada).
- **Dinero y fama (fase 8):** un encargo paga de media ~130 € con fama 1 y un 12 % más por nivel; ~4.000-5.500 €/h jugando con calma. Niveles de fama: 0 / 80 / 250 / 500 / 800 / 1.200 / 2.000 / 3.000 / 4.500 / 6.500; entrega perfecta 15 puntos, normal 8, mala 3. Premios de las misiones: 1.500 / 1.800 (+500 si los muebles llegan enteros) / 2.500 / 3.500 / 10.000 €; repetir una misión paga el 40 %. El ático (25.000 €) y la empresa completa quedan como metas de 3 a 6 horas.
- **Empleados (fase 8):** cada repartidor gana ~340 € por día de juego y lo ingresa al acabar el día (dormir ya no da un sueldo entero de golpe).
- **Daño de los vehículos:** un choque frontal a 90 km/h quita ~25 % de la vida a un coche; la furgoneta aguanta mucho.
- **Oficina:** hasta la fase 5 la empresa se gestiona desde la puerta; desde la fase 6 se entra dentro y el tablón de la pared abre la gestión y la historia.
- **Interiores** (club, ático, oficina): son escenarios aparte a los que se entra por la puerta con un fundido; se precargan en segundo plano a los pocos segundos de empezar para que no haya pantalla negra.
- **Menú:** mientras estás en el menú no llegan encargos ni persecuciones.
- **Empiezas con 0 €** en partida nueva; el jefe te da 100 € al acabar el tutorial.
- **Fases en la web:** el juego publicado activa las fases terminadas. Con `?fase=N` en el enlace se puede probar otra fase (útil para pruebas).
- **Pruebas con SwiftShader:** Chromium sin GPU va a 1-2 fps con la isla, así que las pruebas usan `?calidad=baja` y esperan a que pasen las cosas en vez de esperar un tiempo fijo. Los fps de verdad se miden con la GPU del Mac (`captura.mjs --gpu`).
