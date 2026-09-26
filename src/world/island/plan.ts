// Plano de Puerto Paquete: barrios y trazado de calles (norte = -Z).
import type { District, DistrictId } from '../../core/contracts';
import { RoadNet, pathLength } from './network';

export const DISTRICTS: District[] = [
  { id: 'puerto', name: 'El Puerto', color: '#2ec4b6', center: { x: 0, z: 222 } },
  { id: 'centro', name: 'El Centro', color: '#ff9f1c', center: { x: 0, z: 32 } },
  { id: 'colina', name: 'La Colina', color: '#7bc043', center: { x: 0, z: -190 } },
  { id: 'poligono', name: 'El Polígono', color: '#6c8ebf', center: { x: 190, z: 30 } },
  { id: 'viejo', name: 'El Barrio Viejo', color: '#ff6b9a', center: { x: -175, z: 30 } },
];

/** Barrio por posición (sin mirar si es mar). */
export function districtRaw(x: number, z: number): DistrictId {
  const cb = -101 + 5 * Math.sin(x * 0.021);
  if (z < cb) return 'colina';
  if (z > 139 && x > -168 && x < 206) return 'puerto';
  if (x < -104) return 'viejo';
  if (x > 104) return 'poligono';
  return 'centro';
}

// Retícula del Centro
export const X_AVES = [-100, -50, 0, 50, 100];
export const Z_STREETS = [-95, -45, 5, 60, 115];
export const PORT_Z = 165;
export const RING_X = 245;
export const POL_X = 172;

// Callejones del Barrio Viejo: líneas este-oeste y, por fila, los callejones norte-sur
export const VIEJO_ROWS = [-95, -66, -37, 5, 33, 62, 92, 122, 165];
export const VIEJO_COLS: number[][] = [
  [-212, -175, -135],
  [-222, -190, -150],
  [-205, -165, -128],
  [-215, -182, -140],
  [-198, -160, -125],
  [-220, -185, -145],
  [-208, -170, -132],
  [-195, -150],
];
/** Callejones sin salida: [fila, x, desde z, hasta z] */
export const VIEJO_STUBS: [number, number, number, number][] = [
  [2, -146, -37, -19],
  [5, -203, 62, 79],
];

export const ALLEY_W = 5.5;

const ALLEY_NAMES_EW = [
  'Callejón del Sello Mojado',
  'Callejón del Remitente',
  'Callejón del Acuse de Recibo',
  'Callejón de la Etiqueta Rota',
  'Callejón del Matasellos',
  'Callejón del Buzón Lleno',
];
const ALLEY_NAMES_NS = [
  'Callejón del Burofax',
  'Callejón del Porte Debido',
  'Travesía del Franqueo',
  'Callejón de la Cinta Aislante',
  'Pasaje del Albarán Perdido',
  'Callejón del Código de Barras',
  'Travesía del Bubble Wrap',
  'Callejón del No Estaba',
];

/** Define todas las calles de la isla. */
export function defineRoads(net: RoadNet) {
  // Anillo y ejes principales
  net.add({ name: 'Paseo del Muelle', pts: [[-RING_X, PORT_Z], [RING_X, PORT_Z]], width: 10, bays: 'left', zebra: true });
  net.add({ name: 'Avenida del Poniente', pts: [[-RING_X, PORT_Z], [-RING_X, -95]], width: 10 });
  net.add({ name: 'Avenida de Levante', pts: [[RING_X, PORT_Z], [RING_X, -95]], width: 10 });
  net.add({
    name: 'Carretera de los Acantilados',
    pts: [
      [RING_X, -95], [243, -150], [226, -200], [186, -240], [130, -262], [65, -272], [0, -275],
      [-65, -272], [-130, -262], [-186, -240], [-226, -200], [-243, -150], [-RING_X, -95],
    ],
    width: 10,
    curve: true,
  });
  const arcIdx = net.defs.length - 1;
  net.add({ name: 'Avenida de la Colina', pts: [[-RING_X, -95], [RING_X, -95]], width: 10, zebra: true });

  // Centro: avenidas norte-sur
  const aveNames: Record<number, string> = {
    [-100]: 'Avenida del Albarán',
    [-50]: 'Calle del Precinto',
    [50]: 'Calle del Celo',
    [100]: 'Avenida del Palé',
  };
  for (const x of X_AVES) {
    if (x === 0) {
      net.add({ name: 'Avenida del Reembolso', pts: [[0, -95], [0, 5]], width: 10, zebra: true });
      net.add({ name: 'Avenida del Reembolso', pts: [[0, 60], [0, PORT_Z]], width: 10, zebra: true });
    } else {
      net.add({ name: aveNames[x], pts: [[x, -95], [x, PORT_Z]], width: 10, zebra: true, bays: Math.abs(x) === 50 ? 'both' : undefined });
    }
  }
  // Centro: calles este-oeste
  net.add({ name: 'Calle del Cartón', pts: [[-100, -45], [100, -45]], width: 10, zebra: true });
  net.add({ name: 'Calle de la Nave', pts: [[100, -45], [RING_X, -45]], width: 11 });
  net.add({ name: 'Calle Mayor del Viejo', pts: [[-RING_X, 5], [-100, 5]], width: 9, bays: 'left' });
  net.add({ name: 'Calle del Código Postal', pts: [[-100, 5], [100, 5]], width: 10, zebra: true });
  net.add({ name: 'Avenida de la Chapa', pts: [[100, 5], [RING_X, 5]], width: 11 });
  net.add({ name: 'Calle de la Etiqueta', pts: [[-100, 60], [100, 60]], width: 10, zebra: true });
  net.add({ name: 'Calle del Desguace', pts: [[100, 60], [RING_X, 60]], width: 11, bays: 'left' });
  net.add({ name: 'Calle del Sello', pts: [[-100, 115], [100, 115]], width: 10, zebra: true, bays: 'both' });
  net.add({ name: 'Calle del Montacargas', pts: [[100, 115], [RING_X, 115]], width: 11 });
  // Polígono
  net.add({ name: 'Avenida de la Carretilla', pts: [[POL_X, -95], [POL_X, PORT_Z]], width: 11 });

  // La Colina
  net.add({
    name: 'Camino de las Mimosas',
    pts: [
      [0, -95], [18, -112], [50, -124], [88, -132], [112, -146], [119, -163], [101, -177], [62, -183],
      [22, -186], [-20, -188], [-60, -192], [-95, -200], [-115, -214], [-103, -230], [-66, -238], [-30, -242], [0, -244],
    ],
    width: 9,
    curve: true,
  });
  const snap = (x: number, z: number) => nearestOnPath(net.paths[arcIdx], x, z);
  const top = snap(0, -275);
  net.add({ name: 'Subida del Mirador', pts: [[0, -244], top], width: 9 });
  net.add({
    name: 'Calle de los Geranios',
    pts: [[-100, -95], [-122, -116], [-158, -133], [-200, -145], snap(-240, -152)],
    width: 9,
    curve: true,
  });
  net.add({
    name: 'Calle de las Buganvillas',
    pts: [[100, -95], [122, -116], [158, -133], [200, -145], snap(240, -152)],
    width: 9,
    curve: true,
  });

  // Barrio Viejo: callejones
  for (let r = 1; r < VIEJO_ROWS.length - 1; r++) {
    const z = VIEJO_ROWS[r];
    if (z === 5) continue; // Calle Mayor
    net.add({ name: ALLEY_NAMES_EW[(r - 1) % ALLEY_NAMES_EW.length], pts: [[-RING_X, z], [-100, z]], width: ALLEY_W, alley: true });
  }
  let nsi = 0;
  for (let r = 0; r < VIEJO_COLS.length; r++) {
    const z0 = VIEJO_ROWS[r], z1 = VIEJO_ROWS[r + 1];
    for (const x of VIEJO_COLS[r]) {
      net.add({ name: ALLEY_NAMES_NS[nsi++ % ALLEY_NAMES_NS.length], pts: [[x, z0], [x, z1]], width: ALLEY_W, alley: true });
    }
  }
  for (const [, x, za, zb] of VIEJO_STUBS) {
    net.add({ name: 'Callejón Sin Salida (de verdad)', pts: [[x, za], [x, zb]], width: ALLEY_W, alley: true });
  }
}

export function nearestOnPath(path: number[][], x: number, z: number): number[] {
  let best = [path[0][0], path[0][1]], bd = 1e9;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - a[0]) * dx + (z - a[1]) * dz) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = a[0] + dx * t, pz = a[1] + dz * t;
    const d = Math.hypot(px - x, pz - z);
    if (d < bd) {
      bd = d;
      best = [px, pz];
    }
  }
  return best;
}

export { pathLength };
