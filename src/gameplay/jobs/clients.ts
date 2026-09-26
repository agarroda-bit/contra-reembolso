// Clientes absurdos de Puerto Paquete. Todo inventado.
import type { ClientProfile } from './types';

export const CLIENTS: ClientProfile[] = [
  {
    id: 'puri', name: 'Doña Puri', avatar: '👵', look: 'abuela', quirk: 'abuela_centimos', voice: 1.3, districts: ['viejo', 'centro'],
    items: ['un juego de tazas con gatitos', 'tres kilos de pipas', 'una faja reductora', 'un marco de fotos que canta', 'lana para 40 bufandas'],
    ask: [
      'Hola hijo, soy la Puri. Me traes {item}? Te pago {precio}, en suelto que no tengo billetes 👵',
      'Buenas, me ha dicho mi nieto que esto se pide por aquí. {item}. {precio}. Y no corras que te matas.',
      'Cariño, {item} a {calle}. Tienes {tiempo}, que a las ocho empieza el concurso.',
    ],
    happy: ['¡Ay, qué majo! Toma, cuéntalo tú que yo ya no veo.', 'Qué rápido, hijo. Toma una galleta. Bueno, no, que es la última.'],
    late: ['Ya ha empezado el concurso. Muy mal. Muy mal todo.', 'Hijo, he envejecido esperando. Más.'],
    broken: ['Esto venía entero cuando lo compré. En la foto.', '¿Pero qué le has hecho a mis tazas? ¡Tenían nombre!'],
  },
  {
    id: 'vecino', name: 'Sergio "no estoy"', avatar: '🙈', look: 'civil', quirk: 'vecino_banda', voice: 0.9,
    items: ['un móvil de segunda mano', 'unas zapatillas de edición limitada', 'una caja misteriosa', 'un dron con una hélice'],
    ask: [
      'Oye mira, {item}, {precio}. Si no estoy déjaselo al vecino, que es de confianza 👍',
      'Traeme {item} a {calle}. Tienes {tiempo}. Si no abro, al vecino del bajo. Es majísimo.',
    ],
    happy: ['Gracias, tío. Oye, ¿el vecino te ha dicho algo raro?'],
    late: ['¿Dónde te habías metido? El vecino dice que te esperaba.'],
    broken: ['Viene abollado. El vecino dice que así venía. Qué raro todo.'],
  },
  {
    id: 'kevin', name: 'Kevin (cambia de sitio)', avatar: '🏃', look: 'fiestero', quirk: 'cambia_direccion', voice: 1.0,
    items: ['un altavoz con luces', 'una pizza congelada gigante', 'un flotador de unicornio', 'unas gafas de realidad virtual'],
    ask: [
      'Buenaaas, {item} porfa!! {precio} y te invito a una. Estoy en {calle}. De momento.',
      'Tío necesito {item} YA. {tiempo}. {precio}. Luego te digo dónde estoy exactamente jeje',
    ],
    happy: ['¡Máquina! ¿Te vienes a la fiesta? Es en otra calle.', 'Crack. Te dejo cinco estrellas. Bueno, cuatro.'],
    late: ['Ya se ha acabado la fiesta. Bueno, empieza otra en otro sitio.'],
    broken: ['Da igual, con luces no se nota.'],
  },
  {
    id: 'mari', name: 'Mari y Pancho 🐶', avatar: '🐕', look: 'civil', quirk: 'pijama_perro', voice: 1.1,
    items: ['pienso para perros (el caro)', 'un sofá para perro', 'una pelota que no rebota', 'un abrigo de perro con capucha'],
    ask: [
      'Hola! Soy Mari. Necesito {item} para Pancho. {precio}. Bajo en pijama, no me juzgues.',
      '{item} a {calle}. Pancho no muerde. Casi nunca. {tiempo}.',
    ],
    happy: ['¡Pancho, deja al señor! PANCHO. Perdona, es muy cariñoso.', 'Gracias! Pancho dice que le caes bien. Por eso te persigue.'],
    late: ['Pancho se ha comido el felpudo esperando. Lo pagas tú.'],
    broken: ['Pancho está decepcionado. Mira su cara.'],
  },
  {
    id: 'anselmo', name: 'Anselmo', avatar: '🤨', look: 'civil', quirk: 'no_he_pedido', voice: 0.75,
    items: ['una batidora industrial', 'un kayak hinchable', 'veinte rollos de papel de cocina', 'un cortacésped', 'un busto de Beethoven'],
    ask: [
      'Entrega para Anselmo en {calle}. {item}. {precio}. (Pedido automático)',
      'Paquete: {item}. Cliente: Anselmo. Cobrar: {precio}. Plazo: {tiempo}.',
    ],
    happy: ['...Ah, sí, esto sí lo pedí. Bueno, lo pidió el gato con mi móvil.'],
    late: ['Ya ni me acordaba de que no lo había pedido.'],
    broken: ['Encima de que no lo pedí, roto.'],
  },
  {
    id: 'yenni', name: 'Yenni Influencer ✨', avatar: '🤳', look: 'fiestero', quirk: 'influencer', voice: 1.4, districts: ['centro', 'colina'],
    items: ['un aro de luz gigante', 'un bolso que brilla en la oscuridad', 'una colección de pestañas', 'un trípode con otro trípode'],
    ask: [
      'Holiii repartidooor 💅 {item}, {precio}, y porfa ven guapo que te grabo para mis 3 millones de seguidores ✨',
      '{item} a {calle} en {tiempo}!!! Es para un directo!!! 📸📸',
    ],
    happy: ['¡Saluda a la cámara! Diles "contra reembolso, contra el aburrimiento" ✨', 'Chicos, este es mi repartidor favorito. Dale like.'],
    late: ['Se me ha cortado el directo esperándote. Te voy a funar un poquito.'],
    broken: ['¡Esto es contenido! "Unboxing de cosas rotas". Gracias, supongo.'],
  },
  {
    id: 'regateo', name: 'Paco "el Regateos"', avatar: '🧐', look: 'civil', quirk: 'regatea', voice: 0.85,
    items: ['una bicicleta estática sin sillín', 'un reloj de oro que parece de oro', 'una tele de 90 pulgadas', 'unas cortinas de terciopelo'],
    ask: [
      '{item}. Pone {precio} pero eso lo hablamos en persona, ¿eh? 😏',
      'Buenas. {item} a {calle}. {precio}... bueno, más o menos.',
    ],
    happy: ['Venga, lo que tú digas. Eres duro de pelar.', 'Me has ganado. Toma, y no se lo digas a nadie.'],
    late: ['Por llegar tarde, te pago la mitad. Es la ley del mercado.'],
    broken: ['Roto vale menos. Eso lo sabe todo el mundo.'],
  },
  {
    id: 'villamimosa', name: 'Los señores de Villa Mimosa', avatar: '🥂', look: 'rico', quirk: 'none', voice: 0.9, districts: ['colina'],
    items: ['una lámpara de araña', 'caviar de lata grande', 'un jarrón de la dinastía Ming (de Pekín, no de la dinastía)', 'un flamenco de bronce', 'un piano de juguete para el perro'],
    ask: [
      'Buenas tardes. Rogamos entrega de {item} en {calle}. Abonaremos {precio}. Discreción, por favor.',
      'El servicio está de vacaciones. {item}. {precio}. Tiene {tiempo}. Gracias.',
    ],
    happy: ['Impecable. Tome algo para usted. No, eso no, eso es un cenicero.', 'Qué eficacia. Le recomendaremos en el club de golf.'],
    late: ['La puntualidad es la cortesía de los reyes. Usted es un plebeyo.'],
    broken: ['Hemos recibido el jarrón en formato puzzle. Qué original.'],
  },
  {
    id: 'bar', name: 'Bar Casa Manolo', avatar: '🍺', look: 'civil', quirk: 'none', voice: 0.8, districts: ['viejo', 'puerto'],
    items: ['dos barriles de gaseosa', 'cien servilletas de papel', 'una máquina de hielo', 'la tapa de la freidora'],
    ask: [
      'Manolo al aparato. {item} para el bar YA, que se me acumulan los parroquianos. {precio}.',
      '¡Urgencia hostelera! {item}. {tiempo}. {precio}. Hay caña gratis si llegas.',
    ],
    happy: ['¡Olé! Caña y tapa de la casa. Bueno, la tapa no, que se ha acabado.'],
    late: ['Los parroquianos se han ido al bar de enfrente. Traidores.'],
    broken: ['Esto no enfría ni el ambiente.'],
  },
  {
    id: 'gimnasio', name: 'Músculo Feliz (gimnasio)', avatar: '💪', look: 'civil', quirk: 'none', voice: 0.7,
    items: ['cien kilos de pesas', 'batidos de proteína sabor chorizo', 'un espejo de cuerpo entero', 'una esterilla de yoga reforzada'],
    ask: ['¡VAMOS! {item}! {precio}! {tiempo}! ¡Sin excusas!', 'Entrega PESADA para el gimnasio. {item}. Si te cuesta, es entreno.'],
    happy: ['¡Eso es actitud! ¿Has entrenado pierna hoy? Se nota.'],
    late: ['Nos hemos enfriado. Y eso en un gimnasio es un drama.'],
    broken: ['Da igual, las pesas no se rompen. Bueno, estas sí.'],
  },
  {
    id: 'fiorella', name: 'Fiorella (pastelería)', avatar: '🎂', look: 'civil', quirk: 'none', voice: 1.25, districts: ['centro', 'viejo'],
    items: ['una tarta de boda de cinco pisos', 'doscientos cruasanes', 'una escultura de azúcar', 'un roscón con sorpresa dentro de la sorpresa'],
    ask: ['¡FRÁGIL! {item}. {precio}. Si se rompe, lloro. Si llega tarde, lloro más.', '{item} a {calle}. Llévala como si fuera un bebé. Un bebé de nata.'],
    happy: ['¡Perfecta! Eres un artista del volante. Toma un cruasán.'],
    late: ['La boda ya ha terminado. Se han casado sin tarta. Qué tristeza.'],
    broken: ['Me han entregado una tarta de un piso y muchos pedacitos.'],
  },
  {
    id: 'misterio', name: 'Número oculto', avatar: '🕶️', look: 'civil', quirk: 'none', voice: 0.65,
    items: ['un maletín que hace tic-tac', 'una caja que no se debe abrir', 'un sobre muy gordo', 'una estatuilla de un pato'],
    ask: ['No hagas preguntas. {item}. {precio}. {tiempo}. Nadie te sigue. Creo.', 'Paquete delicado. {item}. Pago triple: {precio}. Evita a los morados.'],
    happy: ['Esta conversación nunca ha existido. El dinero sí.'],
    late: ['Llegas tarde. Eso tiene consecuencias. O no. Ya veremos.'],
    broken: ['Espero que no hayas mirado dentro.'],
  },
  {
    id: 'profe', name: 'Profesor Bartolo', avatar: '🧑‍🏫', look: 'civil', quirk: 'none', voice: 0.95,
    items: ['treinta exámenes corregidos', 'un esqueleto de plástico', 'un globo terráqueo con Puerto Paquete', 'una pizarra de dos metros'],
    ask: ['Estimado repartidor: {item}. Remuneración: {precio}. Plazo: {tiempo}. Sea puntual, que le pongo falta.'],
    happy: ['Un diez. Bueno, un nueve con cinco, que ha pitado al llegar.'],
    late: ['Suspenso. Recuperación en septiembre.'],
    broken: ['Esto, técnicamente, ya no es un esqueleto. Es un puzzle.'],
  },
  {
    id: 'pescador', name: 'Tío Ramón (pescador)', avatar: '🎣', look: 'civil', quirk: 'none', voice: 0.8, districts: ['puerto'],
    items: ['cebo vivo (muy vivo)', 'una red nueva', 'un ancla pequeñita', 'hielo para el pescado'],
    ask: ['Chaval, {item} al muelle. {precio}. Corre que se me escapa la marea.', '{item} en {calle}. Huele un poco. Mucho. {precio}.'],
    happy: ['¡Así se hace, marinero! Toma una sardina. Es de ayer.'],
    late: ['Se me ha ido la marea y el cebo. El cebo andando.'],
    broken: ['El hielo roto sigue siendo hielo. Te salvas.'],
  },
  {
    id: 'hacker', name: 'Lucía_404', avatar: '💻', look: 'civil', quirk: 'none', voice: 1.15,
    items: ['un teclado mecánico que suena a máquina de escribir', 'cuarenta latas de bebida energética', 'una silla gamer con reposapiés', 'un ventilador para el ordenador'],
    ask: ['hola. {item}. {precio}. {tiempo} o me muero de sed. literal.', 'pedido urgente para {calle}. {item}. no llames al timbre que me asusto.'],
    happy: ['gg. te doy 5 estrellas y un gif de un gato.'],
    late: ['lag. mucho lag.'],
    broken: ['error 404: paquete entero no encontrado.'],
  },
  {
    id: 'concejal', name: 'El Concejal Pérez', avatar: '🎩', look: 'rico', quirk: 'regatea', voice: 0.85,
    items: ['una banda de "Hijo predilecto"', 'cien banderitas', 'unas tijeras gigantes para inaugurar cosas', 'una placa conmemorativa con errata'],
    ask: ['Desde el Ayuntamiento: {item}. {precio} (presupuesto aprobado, más o menos). {tiempo}.'],
    happy: ['El Ayuntamiento le agradece los servicios prestados. Y le debe una rotonda.'],
    late: ['Tendremos que inaugurar la fuente sin tijeras. Con los dientes.'],
    broken: ['Lo declaramos patrimonio roto de la humanidad.'],
  },
];

/** Tiendas donde se recogen paquetes, con nombre gracioso. */
export const PICKUP_NAMES: Record<string, string> = {
  office: 'la Oficina de Reparto',
};
