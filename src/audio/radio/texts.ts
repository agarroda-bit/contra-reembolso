// Textos de la radio: emisoras, locutores, frases, cuñas de publicidad y canciones.
// Todo inventado: ninguna marca, emisora, artista ni persona real.

export interface StationText {
  name: string;
  dj: string;
  show: string;
  /** Tono de voz del locutor balbuceando (Hz) y timbre (1 hombre, 1.15 mujer). */
  voice: { base: number; fscale: number; energy: number };
  phrases: string[];
}

export const STATION_TEXTS: StationText[] = [
  {
    name: 'Perreo Paquetero FM',
    dj: 'DJ Albarán',
    show: 'El Perreo de las Entregas',
    voice: { base: 132, fscale: 1, energy: 1.3 },
    phrases: [
      '¡Buenas, Puerto Paquete! Aquí DJ Albarán, el único que entrega el perreo en mano y sin firmar.',
      'Saludos a los repartidores que conducen con una mano y cobran con la otra. Así no, familia.',
      'Me escribe un oyente: “Mi cliente dice que no ha pedido nada”. Hermano, ese siempre ha pedido algo.',
      'Aviso: Los Devueltos rondan por el Polígono. Si ves una furgoneta morada, sube el volumen y pisa a fondo.',
      'El tiempo en Puerto Paquete: sol, 31 grados y un 90 % de probabilidad de que tu paquete llegue abollado.',
      'La policía me pide que os recuerde que el semáforo en rojo no es una sugerencia. Yo solo leo lo que me dan.',
      'Dedicatoria de la abuela del Barrio Viejo para su repartidor: “Tardas mucho, pero bailas bonito”.',
      'Si estás atascado en la rotonda del Centro, perrea sentado. Es legal. Creo.',
      'Me llama un cliente en pijama con un perro. Dice que el perro también quiere canción. Va por ti, Toby.',
      'Recordad: el cartón no se moja si vas lo bastante rápido. Eso es ciencia, mi gente.',
      '¿Qué es más rápido que un repartidor con prisa? Nada. Bueno, la grúa municipal.',
      'Un influencer ha grabado a su repartidor entregando. Pide que no lo compartáis. No, espera, que sí.',
      'FRÁGIL significa frágil. No significa “a ver si bota”. Lo digo por alguien que yo me sé.',
      'Hoy en el muelle han visto a una gaviota robando un paquete. Los Devueltos ya la han fichado.',
      'Si tu cliente regatea el reembolso, ponle este tema. Nadie regatea con el perreo sonando.',
      'Un saludo a los de la Colina que piden sushi a las tres de la tarde y abren en albornoz.',
      'Previsión para esta noche: neones, fiesta y algún retrovisor volando. Lo normal.',
      'Me dicen que en el casino La Suerte Loca hoy las tragaperras están generosas. Me lo dicen ellos, claro.',
      '¿Se puede perrear en moto? Se puede, pero luego no nos llames desde el centro de salud.',
      'Los Devueltos han mandado una canción. La hemos devuelto. Con acuse de recibo.',
      'Consejo del día: ingresa el efectivo en el cajero. El bolsillo no es un banco, por mucho que te lo creas.',
      'Tráfico: retenciones en el Puerto por una grúa que conduce alguien que no sabe conducir grúas.',
      'Si has llegado hasta aquí sin chocar, eres una leyenda. Si has chocado, también. Aquí no juzgamos.',
      'Esta va para el vecino que recoge los paquetes de todo el edificio. Héroe sin capa.',
      'Si te persigue la poli, que sea al ritmo del dembow. Por estilo, más que nada.',
    ],
  },
  {
    name: 'Electro Cartón 101.5',
    dj: 'Vero Voltio',
    show: 'Sesión Palé',
    voice: { base: 205, fscale: 1.15, energy: 0.8 },
    phrases: [
      'Estás escuchando Electro Cartón 101.5. Música sin letra para repartidores sin tiempo.',
      'El bombo sigue a 124 pulsaciones. Tu corazón, a 180 si llevas un FRÁGIL en el asiento.',
      'Un oyente dice que ha entregado una vajilla entera sin romper nada. Mentira, pero te pinchamos igual.',
      'Tráfico: un carrito de supermercado con motor circula en dirección contraria por el Centro. No es broma.',
      'El tiempo: brisa marina, cielo despejado y olor a embrague quemado en toda la Colina.',
      'La policía busca a un repartidor que se ha saltado catorce semáforos. Si eres tú, sube el volumen.',
      'Dato: el 80 % de los paquetes llega bien. El otro 20 % lo lleva alguien que escucha esta emisora.',
      'Si en la próxima curva derrapas al ritmo del bombo, cuenta como baile.',
      'Mandadnos fotos de vuestra furgoneta abollada. Montamos exposición: “Arte Contemporáneo de Reparto”.',
      'Los Devueltos dicen que esta música es para gente que no sabe bailar. Ellos no saben entregar. Empate.',
      'Este tema dura lo que tarda un cliente en encontrar las llaves. O sea, mucho.',
      'Un cliente de la Colina quiere que su paquete llegue “con más energía”. Pues ya va de camino.',
      'Recordatorio: el turbo no se come la furgoneta. La pared, sí.',
      'Esta noche hay mesa libre en el club VIP. Bueno, había. Se la ha quedado alguien con más fama que tú.',
      'Si ves a alguien pegado al suelo con cinta de embalar, no preguntes. Sigue tu ruta.',
      'Encuesta: ¿la pizza con piña se paga contra reembolso o por adelantado? Líneas abiertas.',
      'Previsión: esta noche sube la marea y sube el drop. Agarrad bien el volante.',
      'Un minuto de silencio por los retrovisores perdidos esta semana. Bueno, medio. Que hay prisa.',
      'Me dicen que en el Polígono alguien ha pintado su furgoneta de morado. Mala idea, créeme.',
      'Si tu GPS dice “gire a la derecha” y ahí está el mar, no le hagas caso. Va por el de ayer.',
      'La electrónica es como el reparto: repetir lo mismo hasta que se vuelve bonito.',
      'Saludos al abuelo que baila en la fuente de la plaza. Tú sí que sabes, Evaristo.',
      'Hoy el paquete perdido número 20 sigue perdido. Como mi paciencia con el tráfico del Centro.',
    ],
  },
  {
    name: 'Rumba del Muelle',
    dj: 'El Niño Remache',
    show: 'Arsa y Reembolso',
    voice: { base: 118, fscale: 0.97, energy: 1.1 },
    phrases: [
      '¡Arsa, Puerto Paquete! Aquí el Niño Remache con la rumba más fresquita del muelle.',
      'Esta rumba va para los repartidores que suben la cuesta de la Colina con la furgoneta echando humo.',
      'Dice mi primo que Los Devueltos no tienen ritmo. Normal: van siempre marcha atrás.',
      'El tiempo en el Barrio Viejo: tendederos al sol, gatos a la sombra y un cliente que no abre la puerta.',
      'A la señora del quinto sin ascensor: su paquete va para arriba. El repartidor, de momento, no.',
      'Aviso de la policía: no se puede tocar el claxon al compás de la rumba. Yo no he dicho nada.',
      'Si te paran los guardias, tú sonríe y di que vas a la verbena.',
      'Olé por el repartidor que ha entregado una tarta de tres pisos en moto. Olé y olé.',
      'Consejo de mi abuela: el dinero, al cajero, que en el bolsillo se evapora.',
      'Un cliente paga en monedas de céntimo. Le dedicamos una rumba larguita, que va para rato.',
      'Hoy en el muelle hay pescaíto, contenedores y una grúa que va sola. Cuidadito.',
      'Esta noche, verbena en la plaza. Traed palmas, que las guitarras ya las ponemos nosotros.',
      '¿Que se lo dejes al vecino? Mira bien al vecino antes, que a veces es de Los Devueltos.',
      'Con esta rumba hasta la furgoneta más vieja coge ritmo. La mía va a pedales, pero con arte.',
      'Saludos al taller de Manolo, que me ha dejado el coche como nuevo. Bueno, distinto.',
      'La previsión: calorcito, levante flojo y paquetes volando en la rotonda del Centro.',
      '¿La rumba ayuda a conducir mejor? No, pero ayuda a chocar con más gracia.',
      'Si hoy te han robado el botín, no llores: se recupera en la guarida. Con palmas se entra mejor.',
      'Esto es la Rumba del Muelle: aquí se baila, se entrega y se cobra. En ese orden.',
      'Me dicen que el cliente del pijama y el perro ha vuelto a salir. Corred, repartidores, corred.',
      'Lo que tú llamas frenar, en el Barrio Viejo lo llamamos pensárselo.',
      'Una rumba para los enamorados, para los despistados y para el que ha aparcado encima de la fuente.',
      'Si la guitarra suena a paquete aplastado es que la ha afinado mi cuñado. Paciencia.',
    ],
  },
];

/** Cuñas de publicidad (se reparten entre las tres emisoras). */
export const ADS: string[] = [
  'Seguros El Golpe: ¿has chocado? ¿Han chocado contigo? ¿Has chocado contigo mismo? Te cubrimos. Casi todo.',
  'Pizzería Mamma Mía Qué Caro: la pizza más cara de Puerto Paquete. ¡Pero con mucho orégano!',
  'Gimnasio Músculo Feliz: levanta cajas como un campeón. La primera semana, gratis. La segunda, te duele todo.',
  'Casino La Suerte Loca: hoy puede ser tu día. Estadísticamente no, pero puede.',
  'Talleres Chapa y Pintura Manolo: lo que tú abollas, Manolo lo desabolla. Y si te busca la policía, te lo pintamos de otro color.',
  'Moda Paquetona: chándal de lujo, cadenas doradas y gafas de sol para conducir de noche. Elegancia de reparto.',
  'Armería El Gatillo Alegre: si Los Devueltos te miran mal, tú mira bien. Pregunta por la pistola de sellos.',
  'Autoescuela Frena Tú: aprende para qué sirve el pedal del medio. Clases teóricas y prácticas. Sobre todo teóricas.',
  'Abogados Pleito Exprés: ¿te han multado por aparcar en la fuente? Recurrimos en 24 horas o te regalamos la fuente.',
  'Cerrajería Abro Todo: abrimos puertas, portales y furgonetas. Solo las tuyas. Casi siempre.',
  'Clínica Dental Muerde Bien: sonríe al cobrar. Un repartidor sin dientes cobra menos propina.',
  'Colchones El Siestón: duerme como un repartidor en domingo. Segundo colchón a mitad de siesta.',
  'Cinta de Embalar Pegamás: pega cajas, pega sobres y pega a quien haga falta. No apta para bigotes.',
  'Churrería Aceite Viejo: churros crujientes desde 1987. El aceite, también desde 1987.',
  'Inmobiliaria Ático o Nada: áticos en la Colina con jacuzzi, vistas al mar y vecinos que no piden paquetes.',
  'Club VIP Burbujas: mesa, champán y luces. Si tienes que preguntar el precio, pide otro refresco.',
  'Ferretería El Tornillo Suelto: tenemos de todo. Lo que no tengamos es que no existe.',
  'Lavadero Espumita: dejamos tu furgoneta tan limpia que ni Los Devueltos la reconocen. Bueno, sí.',
  'Óptica Veo Veo: si no ves la señal de stop, a lo mejor no es culpa de la señal.',
  'Agencia de Viajes Me Piro: escápate de Puerto Paquete en barco, avión o furgoneta de mudanza.',
];

/** Frases del locutor cuando vas "colocado" (efecto de las hierbas). */
export const TRIPPY: string[] = [
  '¿Esto lo estoy diciendo yo o lo estás leyendo tú? Qué profundo, hermano.',
  'Las nubes de Puerto Paquete tienen forma de paquete. Todas. Míralas.',
  '¿Y si los paquetes nos reparten a nosotros? Piénsalo. No, mejor no lo pienses.',
  'El bombo va más lento... ¿o eres tú el que va más lento? Misterio.',
  'Acabo de darme cuenta de que “contra reembolso” suena a nombre de dragón.',
  'El semáforo me ha guiñado un ojo. El verde. El rojo no me habla.',
  'Si miras la furgoneta mucho rato, la furgoneta te mira a ti.',
  'Esta canción está hecha de colores. Sobre todo de morado. Qué miedo, el morado.',
];

/** [título, artista] de cada emisora. */
export const PERREO_SONGS: [string, string][] = [
  ['Perreo en la Rotonda', 'MC Precinto'],
  ['Déjaselo al Vecino', 'La Chunga del Muelle'],
  ['Mi Paquete Tiene Flow', 'DJ Albarán y Yeyo Frágil'],
  ['Contra Reembolso de Amor', 'Brenda Burofax'],
  ['Firma Aquí, Mami', 'Los Primos del Cartón'],
  ['Furgoneta Tuneá', 'Yeyo Frágil'],
  ['Me Dejaste en Visto (y en Reparto)', 'Brenda Burofax'],
  ['Dembow del Albarán', 'MC Precinto'],
  ['Seguimiento en Tiempo Real', 'La Chunga del Muelle'],
  ['Tú Eres Mi Entrega Urgente', 'Kike Kilo y Brenda Burofax'],
];
export const ELECTRO_SONGS: [string, string][] = [
  ['Cinta Transportadora', 'Palé Kollektiv'],
  ['Código Postal 00000', 'Vero Voltio'],
  ['Burbujas de Plástico', 'Hermanos Píxel'],
  ['Almacén a las 4 AM', 'Palé Kollektiv'],
  ['Frágil (Remezcla sin Romper)', 'DJ Cúter'],
  ['Escáner de Código de Barras', 'Hermanos Píxel'],
  ['Marea Alta', 'Luz de Grúa'],
  ['Ruta Óptima', 'DJ Cúter'],
  ['Neón en el Muelle', 'Luz de Grúa'],
  ['Paquete Perdido Nº 20', 'Vero Voltio'],
];
export const RUMBA_SONGS: [string, string][] = [
  ['Rumba del Repartidor', 'Los Remaches'],
  ['Ay, Mi Furgoneta', 'La Niña del Cajón'],
  ['Que Te Lo Firme Tu Madre', 'Los Primos del Muelle'],
  ['Olé Tu Albarán', 'El Niño Remache'],
  ['La Cuesta de la Colina', 'La Niña del Cajón'],
  ['Tangos del Paquete Roto', 'Los Remaches'],
  ['Me Robaron el Botín', 'Los Primos del Muelle'],
  ['Verbena en la Plaza', 'Rumba Exprés'],
  ['Bulerías del Reembolso', 'El Niño Remache'],
  ['Qué Arte Tiene el Cartero', 'Rumba Exprés'],
];

/** Baraja sin repetir hasta agotar (y no repite la última al rebarajar). */
export class Bag<T> {
  private queue: T[] = [];
  private last: T | undefined;
  constructor(private items: readonly T[]) {}
  next(): T {
    if (!this.queue.length) {
      this.queue = this.items.slice();
      for (let i = this.queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
      }
      if (this.queue.length > 1 && this.queue[this.queue.length - 1] === this.last) this.queue.unshift(this.queue.pop()!);
    }
    this.last = this.queue.pop()!;
    return this.last;
  }
}
