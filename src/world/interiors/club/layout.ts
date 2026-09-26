// Plano del Club Reembolso VIP (coordenadas LOCALES del interior, en metros).
// El centro de la sala es (0, 0, 0): X = este, Z = sur, Y = arriba. La entrada está al sur.
import * as THREE from 'three';

/** La sala: 30 × 22 m y 7,5 m de techo. */
export const ROOM = { x0: -15, x1: 15, z0: -11, z1: 11, h: 7.5 };

/** Pista de baile: 10 × 8 baldosas de 1,2 m. */
export const FLOOR = { x0: -6, z0: -7, cols: 10, rows: 8, tile: 1.2, x1: 6, z1: 2.6 };

/** Cabina del DJ (tarima al norte, con la pantalla LED detrás). */
export const DJ = { x0: -4.5, x1: 4.5, z0: -11, z1: -7.6, h: 0.9 };
export const DJ_SPOT = new THREE.Vector3(0, DJ.h, -8.98);

/** Barra (pared oeste). */
export const BAR = { x0: -12.4, x1: -11.3, z0: -6.5, z1: 4.5, h: 1.1 };
export const BARMAN_SPOT = new THREE.Vector3(-13.25, 0, -1.2);
export const STOOLS = [-5.4, -3.6, -1.8, 0, 1.8, 3.6].map((z) => new THREE.Vector3(-10.6, 0, z));

/** Zona VIP elevada (pared este) tras el cordón dorado. */
export const VIP = { x0: 9, x1: 15, z0: -11, z1: 7, h: 0.6 };
/** Escalones de subida a la zona VIP (hueco del cordón). */
export const STAIRS = { x0: 7.9, x1: 9, z0: 3.6, z1: 5.8 };
export const PORTERO_SPOT = new THREE.Vector3(8.15, 0, 6.55);
/** Cava de champán de la zona VIP (junto a la escalera) y dónde espera la camarera. */
export const FRIDGE = new THREE.Vector3(9.95, VIP.h, 6.3);
export const WAITRESS_SPOT = new THREE.Vector3(10.85, VIP.h, 5.55);
/** Camino de la camarera hasta tu mesa (el último punto es donde deja la botella). */
export const WAITRESS_PATH = [
  new THREE.Vector3(10.85, VIP.h, 5.55),
  new THREE.Vector3(10.95, VIP.h, 3.65),
  new THREE.Vector3(11.5, VIP.h, 2.4),
];
/** Hacia dónde mira la camarera al dejar la botella (hacia la mesa). */
export const WAITRESS_SERVE_HEADING = Math.atan2(12.7 - 11.5, 1.4 - 2.4);

/** Reservados VIP: sofás en U contra la pared este. El último (el más cercano a la escalera) es el tuyo. */
export const BOOTHS = [-8.2, -3.4, 1.4];
export const MY_BOOTH = 2;
export const BOOTH = {
  backX0: 13.8, // borde delantero del asiento del sofá del fondo
  backX1: 14.9,
  sideX0: 11.9, // los brazos de la U llegan hasta aquí
  half: 1.9, // media anchura de la U
  seatH: 0.45, // altura del asiento (sobre la tarima)
  tableX: 12.7,
};
/** Dónde se sienta alguien en el sofá del fondo (mirando al oeste). */
export function boothBackSeat(boothZ: number, k: number): THREE.Vector3 {
  return new THREE.Vector3(14.12, VIP.h, boothZ + k);
}
/** Dónde se sienta alguien en un brazo de la U (side = -1 norte, +1 sur), mirando hacia dentro. */
export function boothSideSeat(boothZ: number, side: number, xOff: number): THREE.Vector3 {
  return new THREE.Vector3(BOOTH.tableX + xOff, VIP.h, boothZ + side * 1.15);
}

/** Tarimas de los bailarines. */
export const PODIUMS = [new THREE.Vector3(-7.9, 0, -7.6), new THREE.Vector3(7.7, 0, -7.6)];
export const PODIUM_R = 1.0;
export const PODIUM_H = 1.0;

/** Mesas altas junto a la entrada. */
export const HIGH_TABLES = [new THREE.Vector3(-5.2, 0, 6.4), new THREE.Vector3(4.6, 0, 6.8)];

/** Bola de espejos. */
export const BALL = new THREE.Vector3(0, 5.6, -2.2);

/** Entrada/salida (pared sur). */
export const SPAWN = new THREE.Vector3(0, 0, 7.6);
export const SPAWN_HEADING = Math.PI; // mirando al norte, hacia el DJ
export const EXIT = new THREE.Vector3(0, 0, 10.1);

/** Altura del suelo en un punto (la tarima VIP está más alta). */
export function floorAt(x: number, z: number): number {
  if (x > VIP.x0 && z < VIP.z1) return VIP.h;
  if (x > DJ.x0 && x < DJ.x1 && z < DJ.z1) return DJ.h;
  return 0;
}

export function onDanceFloor(x: number, z: number): boolean {
  return x > FLOOR.x0 - 0.2 && x < FLOOR.x1 + 0.2 && z > FLOOR.z0 - 0.2 && z < FLOOR.z1 + 0.2;
}

/** La noche de juego: de 8:00 a 8:00 (la madrugada cuenta como la noche anterior). */
export function nightKey(day: number, hour: number): number {
  return hour < 8 ? day - 1 : day;
}

export const BPM = 124;
export const BEAT = 60 / BPM;
