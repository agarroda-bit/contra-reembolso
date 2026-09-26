// Tipos de vehículo: física, capacidad y aspecto base.
// Ejes locales: +Z = delante, +Y = arriba, +X = izquierda del conductor (mirando hacia +Z).

export type VehicleKind =
  | 'van' // furgoneta de reparto (la tuya)
  | 'scooter' // moto/scooter
  | 'compact' // utilitario
  | 'taxi'
  | 'sports' // deportivo
  | 'suv' // todoterreno
  | 'truck' // furgón
  | 'police' // coche patrulla
  | 'policevan' // furgón policial (búsqueda 4-5)
  | 'gangvan' // furgoneta morada de Los Devueltos
  | 'cart' // carrito de supermercado con motor
  | 'escooter' // patinete eléctrico
  | 'garbage' // camión de la basura
  | 'golf' // carrito de golf del casino
  | 'crane' // grúa del puerto
  | 'armored' // camión blindado de El Devolución
  | 'granny' // silla eléctrica de la yaya (fase 9)
  | 'paella' // paella-móvil (fase 9)
  | 'sofa' // sofá con motor del rastro (fase 9)
  | 'forklift'; // carretilla elevadora del puerto (fase 9)

export interface VehicleSpec {
  kind: VehicleKind;
  name: string; // nombre visible en castellano
  /** Medias extensiones del chasis (colisor). */
  half: { x: number; y: number; z: number };
  mass: number;
  /** Ruedas: x lateral (media vía), z delantera y trasera, y del anclaje. */
  wheelX: number;
  wheelZFront: number;
  wheelZBack: number;
  wheelY: number;
  wheelRadius: number;
  suspension: number; // longitud en reposo
  stiffness: number;
  damping: number;
  friction: number; // frictionSlip: más bajo = derrapa más
  engine: number; // fuerza por rueda motriz (N)
  maxSpeed: number; // m/s
  reverseSpeed: number;
  brake: number;
  steer: number; // ángulo máximo de giro (rad)
  drive: 'rwd' | 'fwd' | 'awd';
  health: number;
  capacity: number; // paquetes que caben
  twoWheels?: boolean; // se dibuja con 2 ruedas (físicamente 4 muy juntas)
  camDistance: number;
  camHeight: number;
  /** Asiento del conductor (local). */
  seat: { x: number; y: number; z: number };
  /** Pose del conductor. */
  pose: 'drive' | 'ride';
  /** Lo arrasa todo (camión basura, blindado): no recibe daño por golpes pequeños. */
  tough?: boolean;
  /** Colores posibles de carrocería. */
  colors: string[];
  price?: number; // en el concesionario
  heavy?: boolean; // admite paquetes PESADOS
  /** Agarre lateral de las ruedas (1 = normal; más bajo = va de lado todo el rato). */
  sideGrip?: number;
  /** Agarre lateral de las de atrás respecto a las de delante (menos de 1 = la cola se va: derrapa). */
  rearGrip?: number;
  /** Cuánto frena el trompo la ayuda arcade al soltar el freno de mano (2,5 = normal). */
  spinDamp?: number;
  /** Derrapa siempre al girar, sin freno de mano: giro (rad/s) al que tiende con el volante a tope. */
  drifty?: number;
  /** Gira con las ruedas de atrás (carretilla elevadora). */
  rearSteer?: boolean;
  /** No recibe daño de nada (la silla de la yaya). */
  invulnerable?: boolean;
  /** Rebote del chasis contra lo que choca (0,1 = normal). */
  restitution?: number;
}

const CIVIL_COLORS = ['#e63946', '#f1faee', '#457b9d', '#2a9d8f', '#e9c46a', '#f4a261', '#8d99ae', '#3d405b', '#81b29a', '#f2cc8f', '#6d597a', '#ff6b6b'];

export const VEHICLES: Record<VehicleKind, VehicleSpec> = {
  van: {
    kind: 'van', name: 'Furgoneta de reparto',
    half: { x: 1.0, y: 0.95, z: 2.45 }, mass: 1900,
    wheelX: 0.92, wheelZFront: 1.6, wheelZBack: -1.55, wheelY: -0.55, wheelRadius: 0.42,
    suspension: 0.38, stiffness: 26, damping: 3.2, friction: 2.4,
    engine: 5200, maxSpeed: 31, reverseSpeed: 9, brake: 90, steer: 0.62, drive: 'rwd',
    health: 1600, capacity: 6, camDistance: 8.5, camHeight: 3.0,
    seat: { x: 0.45, y: 0.05, z: 1.05 }, pose: 'drive',
    colors: ['#ffd23f'], heavy: true, price: 0,
  },
  scooter: {
    kind: 'scooter', name: 'Scooter',
    half: { x: 0.32, y: 0.45, z: 0.95 }, mass: 260,
    wheelX: 0.28, wheelZFront: 0.72, wheelZBack: -0.68, wheelY: -0.28, wheelRadius: 0.3,
    suspension: 0.28, stiffness: 30, damping: 3.5, friction: 3.2,
    engine: 900, maxSpeed: 36, reverseSpeed: 4, brake: 25, steer: 0.42, drive: 'rwd',
    health: 400, capacity: 2, twoWheels: true, camDistance: 5.2, camHeight: 2.0,
    seat: { x: 0, y: 0.15, z: -0.15 }, pose: 'ride',
    colors: ['#ff4f81', '#2ec4b6', '#ffd23f', '#f1faee', '#6c3bd1'], price: 900,
  },
  compact: {
    kind: 'compact', name: 'Utilitario',
    half: { x: 0.85, y: 0.6, z: 1.85 }, mass: 1050,
    wheelX: 0.78, wheelZFront: 1.2, wheelZBack: -1.2, wheelY: -0.3, wheelRadius: 0.34,
    suspension: 0.32, stiffness: 30, damping: 3.4, friction: 2.6,
    engine: 2600, maxSpeed: 36, reverseSpeed: 9, brake: 55, steer: 0.62, drive: 'fwd',
    health: 900, capacity: 3, camDistance: 6.8, camHeight: 2.3,
    seat: { x: 0.38, y: -0.05, z: -0.05 }, pose: 'drive',
    colors: CIVIL_COLORS, price: 2500,
  },
  taxi: {
    kind: 'taxi', name: 'Taxi',
    half: { x: 0.9, y: 0.62, z: 2.15 }, mass: 1300,
    wheelX: 0.82, wheelZFront: 1.4, wheelZBack: -1.4, wheelY: -0.32, wheelRadius: 0.35,
    suspension: 0.32, stiffness: 30, damping: 3.4, friction: 2.6,
    engine: 3100, maxSpeed: 40, reverseSpeed: 9, brake: 60, steer: 0.6, drive: 'rwd',
    health: 1000, capacity: 3, camDistance: 7, camHeight: 2.3,
    seat: { x: 0.4, y: -0.05, z: 0.05 }, pose: 'drive',
    colors: ['#f7f7f2'], price: 4000,
  },
  sports: {
    kind: 'sports', name: 'Deportivo',
    half: { x: 0.95, y: 0.48, z: 2.2 }, mass: 1250,
    wheelX: 0.86, wheelZFront: 1.45, wheelZBack: -1.4, wheelY: -0.22, wheelRadius: 0.36,
    suspension: 0.26, stiffness: 40, damping: 4.2, friction: 3.0,
    engine: 5200, maxSpeed: 55, reverseSpeed: 10, brake: 80, steer: 0.6, drive: 'rwd',
    health: 800, capacity: 1, camDistance: 6.8, camHeight: 2.0,
    seat: { x: 0.42, y: -0.15, z: -0.2 }, pose: 'drive',
    colors: ['#e63946', '#ffd23f', '#1d3557', '#06d6a0', '#ff7b54', '#111111'], price: 18000,
  },
  suv: {
    kind: 'suv', name: 'Todoterreno',
    half: { x: 1.0, y: 0.8, z: 2.25 }, mass: 1900,
    wheelX: 0.92, wheelZFront: 1.45, wheelZBack: -1.45, wheelY: -0.4, wheelRadius: 0.44,
    suspension: 0.42, stiffness: 26, damping: 3.2, friction: 2.8,
    engine: 4200, maxSpeed: 40, reverseSpeed: 10, brake: 85, steer: 0.58, drive: 'awd',
    health: 1400, capacity: 4, camDistance: 7.6, camHeight: 2.7,
    seat: { x: 0.42, y: 0.05, z: 0.1 }, pose: 'drive',
    colors: ['#3d405b', '#81b29a', '#f1faee', '#264653', '#bc6c25'], price: 9000,
  },
  truck: {
    kind: 'truck', name: 'Furgón',
    half: { x: 1.1, y: 1.15, z: 2.9 }, mass: 2800,
    wheelX: 1.0, wheelZFront: 2.0, wheelZBack: -1.9, wheelY: -0.75, wheelRadius: 0.46,
    suspension: 0.4, stiffness: 24, damping: 3.2, friction: 2.4,
    engine: 6500, maxSpeed: 28, reverseSpeed: 8, brake: 120, steer: 0.58, drive: 'rwd',
    health: 2000, capacity: 10, camDistance: 9.5, camHeight: 3.4,
    seat: { x: 0.5, y: 0.2, z: 1.7 }, pose: 'drive',
    colors: ['#f1faee', '#457b9d', '#e76f51', '#8d99ae'], heavy: true, price: 12000,
  },
  police: {
    kind: 'police', name: 'Coche patrulla',
    half: { x: 0.92, y: 0.62, z: 2.2 }, mass: 1450,
    wheelX: 0.84, wheelZFront: 1.42, wheelZBack: -1.42, wheelY: -0.32, wheelRadius: 0.36,
    suspension: 0.3, stiffness: 34, damping: 3.8, friction: 2.9,
    engine: 4300, maxSpeed: 46, reverseSpeed: 10, brake: 80, steer: 0.6, drive: 'rwd',
    health: 1300, capacity: 2, camDistance: 7, camHeight: 2.3,
    seat: { x: 0.4, y: -0.05, z: 0.05 }, pose: 'drive',
    colors: ['#1d3557'],
  },
  policevan: {
    kind: 'policevan', name: 'Furgón policial',
    half: { x: 1.05, y: 1.05, z: 2.6 }, mass: 2600,
    wheelX: 0.95, wheelZFront: 1.75, wheelZBack: -1.7, wheelY: -0.62, wheelRadius: 0.44,
    suspension: 0.38, stiffness: 28, damping: 3.4, friction: 2.6,
    engine: 6200, maxSpeed: 36, reverseSpeed: 9, brake: 110, steer: 0.5, drive: 'rwd',
    health: 2200, capacity: 6, camDistance: 9, camHeight: 3.2,
    seat: { x: 0.48, y: 0.1, z: 1.3 }, pose: 'drive',
    colors: ['#1d3557'], heavy: true,
  },
  gangvan: {
    kind: 'gangvan', name: 'Furgoneta de Los Devueltos',
    half: { x: 1.0, y: 0.95, z: 2.45 }, mass: 2000,
    wheelX: 0.92, wheelZFront: 1.6, wheelZBack: -1.55, wheelY: -0.55, wheelRadius: 0.42,
    suspension: 0.38, stiffness: 28, damping: 3.3, friction: 2.5,
    engine: 5600, maxSpeed: 36, reverseSpeed: 9, brake: 95, steer: 0.52, drive: 'rwd',
    health: 1500, capacity: 6, camDistance: 8.5, camHeight: 3.0,
    seat: { x: 0.45, y: 0.05, z: 1.05 }, pose: 'drive',
    colors: ['#6c3bd1'], heavy: true,
  },
  cart: {
    kind: 'cart', name: 'Carrito del súper con motor',
    half: { x: 0.35, y: 0.45, z: 0.55 }, mass: 160,
    wheelX: 0.28, wheelZFront: 0.42, wheelZBack: -0.42, wheelY: -0.35, wheelRadius: 0.1,
    suspension: 0.15, stiffness: 45, damping: 4.5, friction: 1.6,
    engine: 520, maxSpeed: 22, reverseSpeed: 6, brake: 10, steer: 0.9, drive: 'awd',
    health: 300, capacity: 2, camDistance: 4.6, camHeight: 1.9,
    seat: { x: 0, y: 0.35, z: -0.1 }, pose: 'ride',
    colors: ['#c0c0c0'],
  },
  escooter: {
    kind: 'escooter', name: 'Patinete eléctrico',
    half: { x: 0.2, y: 0.25, z: 0.55 }, mass: 110,
    wheelX: 0.16, wheelZFront: 0.48, wheelZBack: -0.48, wheelY: -0.2, wheelRadius: 0.12,
    suspension: 0.15, stiffness: 40, damping: 4, friction: 2.2,
    engine: 330, maxSpeed: 17, reverseSpeed: 3, brake: 8, steer: 0.7, drive: 'rwd',
    health: 150, capacity: 1, twoWheels: true, camDistance: 4.4, camHeight: 1.9,
    seat: { x: 0, y: -0.05, z: 0 }, pose: 'ride',
    colors: ['#06d6a0'],
  },
  garbage: {
    kind: 'garbage', name: 'Camión de la basura',
    half: { x: 1.25, y: 1.4, z: 3.6 }, mass: 7000,
    wheelX: 1.1, wheelZFront: 2.5, wheelZBack: -2.3, wheelY: -1.0, wheelRadius: 0.58,
    suspension: 0.45, stiffness: 24, damping: 3.2, friction: 2.4,
    engine: 17000, maxSpeed: 26, reverseSpeed: 7, brake: 300, steer: 0.45, drive: 'awd',
    health: 5000, capacity: 12, tough: true, camDistance: 11.5, camHeight: 4.2,
    seat: { x: 0.55, y: 0.5, z: 2.6 }, pose: 'drive',
    colors: ['#2a9d8f'], heavy: true,
  },
  golf: {
    kind: 'golf', name: 'Carrito de golf del casino',
    half: { x: 0.65, y: 0.5, z: 1.15 }, mass: 420,
    wheelX: 0.58, wheelZFront: 0.78, wheelZBack: -0.78, wheelY: -0.3, wheelRadius: 0.22,
    suspension: 0.2, stiffness: 36, damping: 4, friction: 2.2,
    engine: 800, maxSpeed: 16, reverseSpeed: 6, brake: 20, steer: 0.62, drive: 'rwd',
    health: 500, capacity: 2, camDistance: 5.6, camHeight: 2.2,
    seat: { x: 0.28, y: 0.02, z: -0.1 }, pose: 'drive',
    colors: ['#f1faee'],
  },
  crane: {
    kind: 'crane', name: 'Grúa del puerto',
    half: { x: 1.3, y: 1.0, z: 3.2 }, mass: 9000,
    wheelX: 1.15, wheelZFront: 2.2, wheelZBack: -2.2, wheelY: -0.7, wheelRadius: 0.6,
    suspension: 0.4, stiffness: 20, damping: 3.2, friction: 1.8,
    engine: 12000, maxSpeed: 12, reverseSpeed: 6, brake: 250, steer: 0.35, drive: 'awd',
    health: 5000, capacity: 1, tough: true, camDistance: 13, camHeight: 5.5,
    seat: { x: 0.6, y: 0.9, z: 1.9 }, pose: 'drive',
    colors: ['#ff7b54'],
  },
  armored: {
    kind: 'armored', name: 'Camión blindado de El Devolución',
    half: { x: 1.3, y: 1.35, z: 3.4 }, mass: 8000,
    wheelX: 1.15, wheelZFront: 2.3, wheelZBack: -2.2, wheelY: -0.9, wheelRadius: 0.6,
    suspension: 0.45, stiffness: 26, damping: 3.4, friction: 2.6,
    engine: 18000, maxSpeed: 32, reverseSpeed: 8, brake: 300, steer: 0.45, drive: 'awd',
    health: 9000, capacity: 20, tough: true, camDistance: 12, camHeight: 4.5,
    seat: { x: 0.55, y: 0.5, z: 2.4 }, pose: 'drive',
    colors: ['#4a2a8a'], heavy: true,
  },
  granny: {
    kind: 'granny', name: 'Silla eléctrica de la yaya',
    half: { x: 0.42, y: 0.42, z: 0.72 }, mass: 380,
    wheelX: 0.34, wheelZFront: 0.5, wheelZBack: -0.46, wheelY: -0.22, wheelRadius: 0.16,
    suspension: 0.16, stiffness: 44, damping: 4.5, friction: 2.8,
    engine: 300, maxSpeed: 6, reverseSpeed: 2.2, brake: 14, steer: 0.8, drive: 'rwd',
    health: 1000, capacity: 1, camDistance: 4.6, camHeight: 2.0,
    seat: { x: 0, y: 0, z: -0.12 }, pose: 'drive', invulnerable: true, tough: true,
    colors: ['#e63946', '#7b2cbf', '#2a9d8f', '#3a86ff'],
  },
  paella: {
    kind: 'paella', name: 'Paella-móvil',
    half: { x: 0.95, y: 1.0, z: 2.1 }, mass: 1700,
    wheelX: 0.86, wheelZFront: 1.35, wheelZBack: -1.3, wheelY: -0.6, wheelRadius: 0.38,
    suspension: 0.36, stiffness: 26, damping: 3.2, friction: 2.4,
    engine: 3900, maxSpeed: 26, reverseSpeed: 8, brake: 75, steer: 0.6, drive: 'rwd',
    health: 1300, capacity: 4, camDistance: 8, camHeight: 3.0,
    seat: { x: 0.42, y: 0.05, z: 0.95 }, pose: 'drive',
    colors: ['#ff9f1c'],
  },
  sofa: {
    kind: 'sofa', name: 'Sofá con motor del rastro',
    half: { x: 0.95, y: 0.42, z: 0.5 }, mass: 260,
    wheelX: 0.78, wheelZFront: 0.34, wheelZBack: -0.34, wheelY: -0.24, wheelRadius: 0.14,
    suspension: 0.16, stiffness: 40, damping: 4.2, friction: 1.5,
    engine: 700, maxSpeed: 16, reverseSpeed: 5, brake: 16, steer: 0.55, drive: 'rwd',
    health: 600, capacity: 3, camDistance: 5.4, camHeight: 2.2,
    seat: { x: 0, y: 0, z: -0.05 }, pose: 'drive', sideGrip: 0.08, rearGrip: 0.6, drifty: 2.2, spinDamp: 1.2,
    colors: ['#7f5539', '#588157', '#bc4749', '#6d597a'],
  },
  forklift: {
    kind: 'forklift', name: 'Carretilla elevadora del puerto',
    half: { x: 0.62, y: 0.62, z: 1.45 }, mass: 2600,
    wheelX: 0.5, wheelZFront: 0.42, wheelZBack: -0.95, wheelY: -0.3, wheelRadius: 0.28,
    suspension: 0.2, stiffness: 55, damping: 5, friction: 2.4,
    engine: 4200, maxSpeed: 11, reverseSpeed: 10, brake: 110, steer: 0.85, drive: 'fwd',
    health: 3000, capacity: 2, tough: true, rearSteer: true, camDistance: 7, camHeight: 3.0,
    seat: { x: 0, y: 0.1, z: -0.45 }, pose: 'drive',
    colors: ['#ffc300'],
  },
};

/**
 * Dónde va el muñeco del conductor (raíz = pies) dentro del vehículo, en ejes locales, y a qué escala.
 * Sentado (drive): pies en el suelo del habitáculo, algo más pequeño para que no asome por el techo.
 * Montado (ride): de pie o en el sillín de la moto.
 */
export function seatTransform(s: VehicleSpec): { x: number; y: number; z: number; scale: number } {
  if (s.pose === 'ride') {
    const lift = s.kind === 'escooter' ? 0.12 : s.kind === 'cart' ? 0.18 : 0.2;
    return { x: s.seat.x, y: -s.half.y + lift, z: s.seat.z, scale: 1 };
  }
  const tall = s.kind === 'garbage' || s.kind === 'crane' || s.kind === 'armored' || s.kind === 'truck' || s.kind === 'policevan';
  return { x: s.seat.x, y: -s.half.y + 0.03 + (tall ? 0.35 : 0), z: s.seat.z, scale: 0.9 };
}

/** Coches que aparecen como tráfico normal. */
export const TRAFFIC_KINDS: VehicleKind[] = ['compact', 'compact', 'compact', 'taxi', 'sports', 'suv', 'truck', 'scooter'];

/** Vehículos locos que de vez en cuando se ven circulando (poco frecuentes). */
export const CRAZY_TRAFFIC_KINDS: VehicleKind[] = ['granny', 'paella', 'sofa', 'forklift', 'golf'];
