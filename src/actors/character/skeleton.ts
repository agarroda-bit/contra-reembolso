// Esqueleto del muñeco: huesos, jerarquía y posiciones de reposo (altura 1 = 1,75 m).
// El personaje mira a +Z; su izquierda es +X. Todos los huesos en reposo sin rotación.

/** Índices de huesos (el orden importa: coincide con BONE_DEFS). */
export const B = {
  hips: 0,
  spine: 1,
  neck: 2,
  head: 3,
  eyes: 4, // ojos normales (se escalan para parpadear)
  eyesX: 5, // ojos en X + lengua (solo al morir)
  browL: 6,
  browR: 7,
  mouth: 8,
  stars: 9, // estrellitas de mareo
  armL: 10,
  foreL: 11,
  handL: 12,
  armR: 13,
  foreR: 14,
  handR: 15,
  phone: 16, // móvil en la mano derecha
  thighL: 17,
  shinL: 18,
  footL: 19,
  thighR: 20,
  shinR: 21,
  footR: 22,
  ground: 23, // pegado al suelo (cinta de embalar)
} as const;

export const BONE_COUNT = 24;

/** [nombre, padre, x, y, z] con la posición relativa al padre. */
export const BONE_DEFS: [string, number, number, number, number][] = [
  ['hips', -1, 0, 0.95, 0],
  ['spine', B.hips, 0, 0.08, 0],
  ['neck', B.spine, 0, 0.38, 0],
  ['head', B.neck, 0, 0.05, 0],
  ['eyes', B.head, 0, 0.13, 0.136],
  ['eyesX', B.head, 0, 0.13, 0.136],
  ['browL', B.head, 0.056, 0.19, 0.137],
  ['browR', B.head, -0.056, 0.19, 0.137],
  ['mouth', B.head, 0, 0.05, 0.137],
  ['stars', B.head, 0, 0.44, 0],
  ['armL', B.spine, 0.235, 0.32, 0],
  ['foreL', B.armL, 0, -0.28, 0],
  ['handL', B.foreL, 0, -0.25, 0],
  ['armR', B.spine, -0.235, 0.32, 0],
  ['foreR', B.armR, 0, -0.28, 0],
  ['handR', B.foreR, 0, -0.25, 0],
  ['phone', B.handR, 0, -0.075, 0],
  ['thighL', B.hips, 0.1, -0.05, 0],
  ['shinL', B.thighL, 0, -0.4, 0],
  ['footL', B.shinL, 0, -0.41, 0],
  ['thighR', B.hips, -0.1, -0.05, 0],
  ['shinR', B.thighR, 0, -0.4, 0],
  ['footR', B.shinR, 0, -0.41, 0],
  ['ground', -1, 0, 0, 0],
];

/** Posición de reposo de cada hueso en el espacio del modelo. */
export const BIND_WORLD: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  for (let i = 0; i < BONE_DEFS.length; i++) {
    const [, parent, x, y, z] = BONE_DEFS[i];
    if (parent < 0) out.push([x, y, z]);
    else {
      const p = out[parent];
      out.push([p[0] + x, p[1] + y, p[2] + z]);
    }
  }
  return out;
})();

// Medidas de las piernas (para la cinemática inversa).
export const THIGH = 0.4;
export const SHIN = 0.41;
export const ANKLE = 0.09; // altura del tobillo sobre la suela
export const HIP_Y = 0.95; // altura de la cadera (hueso hips) en reposo
export const HIPJ = 0.05; // la articulación de la pierna está 5 cm por debajo del hueso hips
export const HIP_X = 0.1; // separación lateral de cada pierna
export const HEIGHT = 1.75;
// Medidas de los brazos (para la cinemática inversa de brazos).
export const ARM_UP = 0.28; // hombro → codo
export const ARM_FORE = 0.25; // codo → muñeca
export const SHOULDER_X = 0.235; // separación de cada hombro (espacio del pecho)
export const SHOULDER_Y = 0.32; // altura del hombro sobre el hueso spine
export const SPINE_Y = 0.08; // el hueso spine está 8 cm sobre el de la cadera

/**
 * Postura al volante (metros, espacio del personaje con los pies del root en y = 0).
 * seatY = altura de la superficie del asiento; el volante es un aro de radio wheelRadius
 * centrado en `wheel`, inclinado wheelTilt rad (la parte de arriba se aleja del conductor).
 */
export const DRIVE_LAYOUT = { seatY: 0.43, seatZ: -0.08, wheel: { x: 0, y: 0.96, z: 0.3 }, wheelRadius: 0.16, wheelTilt: 0.45 };
/** Postura en moto/patinete: altura del sillín y puños del manillar (en ±barHalfWidth). */
export const RIDE_LAYOUT = { seatY: 0.63, seatZ: -0.06, bar: { x: 0, y: 0.97, z: 0.47 }, barHalfWidth: 0.29 };
