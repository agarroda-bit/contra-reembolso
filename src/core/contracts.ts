// CONTRATOS compartidos entre módulos. Si cambias algo aquí, cambia todos los que lo usan.
// Sistema de coordenadas: X = este, Z = sur (el norte es -Z), Y = arriba. 1 unidad = 1 metro.
import type * as THREE from 'three';

// ─────────────────────────────── MUNDO ───────────────────────────────

export type DistrictId = 'puerto' | 'centro' | 'colina' | 'poligono' | 'viejo';

export interface District {
  id: DistrictId;
  name: string; // "El Puerto", "El Centro", "La Colina", "El Polígono", "El Barrio Viejo"
  color: string; // color de identidad para el mapa (#rrggbb)
  center: { x: number; z: number };
}

export type PoiKind =
  | 'office' // oficina de reparto (Puerto): tablón, garaje, cajero
  | 'atm' // cajero (hay 3: oficina + 2 más)
  | 'health' // centro de salud (reaparición)
  | 'garage' // taller y concesionario (Polígono)
  | 'paint' // taller de pintura: quita la búsqueda (Polígono)
  | 'gunshop' // armería (Polígono)
  | 'clothes' // tienda de ropa (Centro)
  | 'casino' // casino (Centro)
  | 'club' // club VIP (Centro)
  | 'weed' // vendedor de hierbas (Barrio Viejo)
  | 'attic' // el ático (Colina)
  | 'hideout' // guarida de Los Devueltos (Polígono)
  | 'junkyard' // desguace (Polígono)
  | 'fountain' // fuente de la plaza (Centro)
  | 'bar' // bar (Barrio Viejo)
  | 'shop'; // tiendas genéricas donde se recogen paquetes

export interface Poi {
  id: string; // único y estable, p.ej. 'office', 'atm-centro', 'casino'
  kind: PoiKind;
  name: string; // nombre visible: "Oficina de Reparto Contra Reembolso", "Casino La Suerte Loca"...
  district: DistrictId;
  /** Punto de la puerta, en la acera, donde el jugador pulsa E. */
  door: THREE.Vector3;
  /** Hacia dónde mira la fachada (radianes, 0 = mirando a +Z). */
  facing: number;
  /** Un sitio libre en la calzada/aparcamiento cercano para dejar un vehículo. */
  parking?: THREE.Vector3;
}

/** Nodo del grafo de calles (cruce o curva). */
export interface RoadNode {
  id: number;
  pos: THREE.Vector3; // centro de la calzada, y = altura del asfalto
}

/** Tramo recto de calle entre dos nodos. Doble sentido: un carril por sentido. */
export interface RoadEdge {
  id: number;
  a: number; // id de nodo
  b: number;
  width: number; // anchura de calzada (sin aceras), metros
  district: DistrictId;
  /** true si es un callejón (Barrio Viejo): sin tráfico de coches, solo peatones y motos. */
  alley?: boolean;
}

export interface RoadGraph {
  nodes: RoadNode[];
  edges: RoadEdge[];
  /** Para cada nodo, ids de las aristas que salen de él. */
  adjacency: number[][];
}

/** Punto de entrega: la puerta de una casa/portal donde un cliente recibe paquetes. */
export interface DeliverySpot {
  id: string;
  district: DistrictId;
  door: THREE.Vector3; // en la acera, delante de la puerta
  facing: number;
  label: string; // "Calle del Cartón, 7", "Chalet Villa Pepa"...
}

export interface ParkingSpot {
  pos: THREE.Vector3;
  heading: number; // radianes (0 = el coche mira a +Z)
  district: DistrictId;
}

export interface WorldData {
  /** Lado del cuadrado que contiene la isla (≈ 600). La isla va de -size/2 a size/2. */
  size: number;
  seaLevel: number; // y del mar (0)
  districts: District[];
  /** Altura del terreno/asfalto en (x, z) (sin contar edificios). Fuera de la isla, bajo el mar. */
  heightAt(x: number, z: number): number;
  districtAt(x: number, z: number): DistrictId | null; // null = mar
  /** ¿Está (x, z) sobre la calzada? */
  isRoad(x: number, z: number): boolean;
  /** ¿Es tierra firme transitable (no mar)? */
  isLand(x: number, z: number): boolean;
  pois: Poi[];
  roads: RoadGraph;
  deliverySpots: DeliverySpot[];
  parkingSpots: ParkingSpot[];
  /** 20 paquetes perdidos coleccionables. */
  collectibles: THREE.Vector3[];
  /** Posiciones de las bombillas de las farolas (para luces de noche). */
  lampPositions: THREE.Vector3[];
  /** Inicio del jugador: delante de la oficina. */
  playerSpawn: { pos: THREE.Vector3; heading: number };
  /** Rampas para saltos (por si otros sistemas quieren marcarlas). */
  ramps: { pos: THREE.Vector3; heading: number }[];
  /**
   * Sitios para cosas rompibles (las crea el sistema de destrucción, fase 2; el mundo solo
   * dice dónde van). kind: valla, caja, puesto de fruta, papelera, banco, cono.
   */
  breakableSpots: { kind: 'fence' | 'crate' | 'fruit' | 'bin' | 'bench' | 'cone'; pos: THREE.Vector3; rotY: number }[];
  /** Sitios para vehículos locos (fase 6): carrito, patinete, camión de basura, golf, grúa. */
  specialVehicleSpots: { kind: 'cart' | 'scooter_e' | 'garbage' | 'golf' | 'crane'; pos: THREE.Vector3; heading: number }[];
  /** Imagen del mapa vista desde arriba (para minimapa y mapa grande). 1 px = mapPixelSize m. */
  mapCanvas: HTMLCanvasElement;
  mapPixelSize: number;
  /**
   * Llamado cada frame por el ciclo día/noche. night = 0 (día) .. 1 (noche cerrada).
   * El mundo enciende ventanas, farolas y neones.
   */
  setNight(night: number): void;
  /** Actualización por frame (agua, grúas, banderas...). */
  update(dt: number, elapsed: number): void;
}

// ─────────────────────────────── PERSONAJES ───────────────────────────────

export type HairStyle = 'rapado' | 'corto' | 'largo' | 'cresta' | 'moño' | 'afro' | 'coleta' | 'calvo';

export interface CharacterLook {
  skin: string; // color de piel
  hair: HairStyle;
  hairColor: string;
  shirt: string; // color camiseta/uniforme
  pants: string;
  shoes: string;
  cap: boolean;
  capColor: string;
  /** Accesorios de ropa comprada. */
  glasses?: boolean;
  chain?: boolean; // cadena dorada
  jacket?: string | null; // chaqueta/chándal (color) encima de la camiseta
  /** Complexión: 1 = normal, 0.85 = flaco, 1.2 = grueso. */
  build?: number;
  /** Altura: 1 = 1,75 m aprox. */
  height?: number;
  /** Detalle en la espalda/pecho: logo del uniforme. */
  emblem?: 'reparto' | 'devueltos' | 'policia' | null;
}

/** Postura/acción que el animador procedural sabe hacer. */
export type CharacterPose =
  | 'normal' // andar/correr/parado según speed
  | 'drive' // sentado conduciendo
  | 'ride' // montado en moto/patinete
  | 'dance'
  | 'knocked' // sale volando / en el suelo
  | 'getup' // levantándose
  | 'dead' // derribado (sin sangre)
  | 'enter_car' // subiendo al coche
  | 'pull_out' // sacando a alguien del coche
  | 'pulled' // siendo sacado del coche
  | 'sit'
  | 'phone' // mirando el móvil
  | 'hands_up' // manos arriba (asustado)
  | 'taped' // pegado con cinta al suelo
  | 'stunned'; // aturdido (sellos)

export interface CharacterAnimParams {
  /** Velocidad horizontal en m/s (0 parado, ~2 andar, ~6 correr). */
  speed: number;
  grounded: boolean;
  /** Velocidad vertical (para salto/caída). */
  vy?: number;
  pose: CharacterPose;
  /** Apuntando con arma: brazos al frente. */
  aiming?: boolean;
  /** Inclinación del apuntado (radianes, + arriba). */
  aimPitch?: number;
  /** Tipo de arma en mano (cambia cómo se sujeta). */
  weapon?: 'none' | 'pistol' | 'rifle' | 'heavy' | 'throw';
  /** Pulso de disparo (poner true el frame en que dispara: retroceso de brazos). */
  shot?: boolean;
  /** Efecto "colocado": anda raro. 0..1 */
  wobble?: number;
  /** Escala de tiempo de la animación (por defecto 1). */
  timeScale?: number;
}

export type AttachSlot = 'handR' | 'handL' | 'head' | 'back' | 'chest';

export interface CharacterRig {
  /** Nodo raíz: ponlo en la escena y muévelo tú (pies en y = 0 del nodo). */
  readonly root: THREE.Object3D;
  readonly look: CharacterLook;
  /** Cambia el aspecto (ropa comprada, etc.). */
  setLook(look: CharacterLook): void;
  /** Avanza la animación procedural. */
  update(dt: number, p: CharacterAnimParams): void;
  /** Engancha un objeto (arma, paquete...) a un hueso. */
  attach(slot: AttachSlot, obj: THREE.Object3D): void;
  detach(obj: THREE.Object3D): void;
  /** Posición mundial de la mano derecha (boca del arma aproximada). */
  handWorldPosition(target: THREE.Vector3): THREE.Vector3;
  /** Liberar geometrías/materiales propios. */
  dispose(): void;
  /** Altura aproximada del personaje en metros. */
  readonly heightMeters: number;
}

// ─────────────────────────────── HUD ───────────────────────────────

/**
 * Estado que pinta la interfaz. Los sistemas escriben aquí (game.hud) y el HUD lo lee cada frame.
 * Así nadie depende de nadie.
 */
export interface HudState {
  visible: boolean;
  health: number; // 0..maxHealth
  maxHealth: number;
  armor: number; // 0..100
  stamina: number; // 0..100
  cash: number; // efectivo encima
  bank: number; // en el banco
  wanted: number; // 0..5 sirenas
  fame: number; // puntos de fama
  fameLevel: number;
  weapon: { name: string; icon: string; clip: number; reserve: number; infinite?: boolean } | null;
  /** boost: turbo que queda (0..1); si no viene, el HUD lo lee del vehículo del jugador. */
  vehicle: { name: string; speedKmh: number; health: number; packages?: number; capacity?: number; boost?: number } | null;
  radio: { station: string; show?: string } | null;
  /** Encargos activos (lista lateral). timeLeft en segundos o null; integrity 0..100 o null. */
  jobs: { id: string; title: string; timeLeft: number | null; integrity: number | null; color?: string }[];
  /** Pista de interacción ("E — Entrar al casino"). */
  hint: string | null;
  /** Retícula visible (apuntando). */
  crosshair: boolean;
  /** Marcador de objetivo para minimapa/mapa (GPS). */
  waypoint: { x: number; z: number; label?: string; color?: string } | null;
  /** Marcadores extra del minimapa (encargos, enemigos, guarida con botín...). */
  markers: { x: number; z: number; icon: string; color?: string; label?: string }[];
}

export function defaultHudState(): HudState {
  return {
    visible: true,
    health: 100, maxHealth: 100, armor: 0, stamina: 100,
    cash: 0, bank: 0, wanted: 0, fame: 0, fameLevel: 1,
    weapon: null, vehicle: null, radio: null, jobs: [],
    hint: null, crosshair: false, waypoint: null, markers: [],
  };
}

// ─────────────────────────────── EVENTOS ───────────────────────────────

/** Eventos del juego. Se amplía por fases. */
export interface GameEvents extends Record<string, unknown> {
  'notify': { title: string; text: string; icon?: string; from?: string }; // notificación del móvil
  'toast': { text: string; color?: string; time?: number }; // mensaje grande en pantalla
  'money': { cash: number; bank: number; delta: number; reason?: string };
  'district': { id: DistrictId; name: string };
  'player:hurt': { amount: number; source?: unknown };
  'player:died': { cause: string };
  'player:respawn': { where: string };
  'vehicle:enter': { vehicle: unknown };
  'vehicle:exit': { vehicle: unknown };
  'wanted': { level: number };
  'explosion': { pos: THREE.Vector3; radius: number; big?: boolean };
  'camera:shake': { amount: number };
  'daynight': { night: number; hour: number };
  'newday': { day: number };
  'settings': unknown;
}
