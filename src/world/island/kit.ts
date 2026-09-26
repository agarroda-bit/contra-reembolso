// Kit de detalles pequeños para dar vida a los barrios: gatos, gaviotas, palomas, flamencos, farolillos,
// pizarras, puestos de mercado, sillas, cosas de playa y de obra... Todo se dibuja en la geometría
// fusionada del trozo (GeoBuilder), sin mallas ni materiales nuevos: no añade llamadas de dibujo.
// Convención: cada pieza pone el marco del constructor en (x, y, z, rot) y dibuja en coordenadas
// locales (+Z local = hacia donde mira la pieza). Después de llamarlas, el marco queda cambiado.
import { GeoBuilder, SKIP, emitOf, lin } from './geo';
import { Rng } from '../../core/rng';

export const FUR = ['#e8903a', '#2a2a2e', '#f2eee6', '#8a8a90', '#c9a27a', '#5a4a3a'];

/** Gato callejero. pose: sentado, hecho una barra de pan (tumbado) o estirándose. */
export function cat(b: GeoBuilder, x: number, y: number, z: number, rot: number, fur: string, pose: 'sit' | 'loaf' | 'stretch' = 'sit', patch?: string) {
  b.frame(x, y, z, rot);
  const eye = [0.55, 0.7, 0.1, 0.05] as const; // ojos amarillos que brillan un poco de noche
  const pink = '#f29aa8';
  if (pose === 'sit') {
    b.boxRot(0, 0.17, -0.02, 0.24, 0.3, 0.3, -0.35, 0, 0, fur);
    if (patch) b.box(0.07, 0.22, -0.02, 0.12, 0.14, 0.2, patch, SKIP.NY);
    b.box(-0.07, 0.04, 0.12, 0.06, 0.08, 0.1, fur, SKIP.NY);
    b.box(0.07, 0.04, 0.12, 0.06, 0.08, 0.1, fur, SKIP.NY);
    b.box(0, 0.4, 0.07, 0.2, 0.17, 0.17, fur);
    b.box(-0.06, 0.52, 0.07, 0.05, 0.08, 0.05, fur, SKIP.NY);
    b.box(0.06, 0.52, 0.07, 0.05, 0.08, 0.05, fur, SKIP.NY);
    b.panelZ(-0.045, 0.42, 0.157, 0.035, 0.03, '#f2d13b', eye);
    b.panelZ(0.045, 0.42, 0.157, 0.035, 0.03, '#f2d13b', eye);
    b.panelZ(0, 0.385, 0.158, 0.03, 0.02, pink);
    // cola enroscada en el suelo
    b.box(0.13, 0.03, -0.12, 0.05, 0.05, 0.22, fur, 0, undefined, 0.4);
    b.box(0.08, 0.03, 0.05, 0.05, 0.05, 0.16, fur, 0, undefined, -0.5);
  } else if (pose === 'loaf') {
    b.box(0, 0.1, 0, 0.26, 0.2, 0.42, fur, SKIP.NY);
    if (patch) b.box(0.05, 0.2, -0.05, 0.16, 0.02, 0.18, patch);
    b.box(0, 0.16, 0.25, 0.19, 0.15, 0.13, fur);
    b.box(-0.06, 0.26, 0.26, 0.05, 0.07, 0.04, fur, SKIP.NY);
    b.box(0.06, 0.26, 0.26, 0.05, 0.07, 0.04, fur, SKIP.NY);
    // ojos cerrados (rayitas) y cola alrededor
    b.panelZ(-0.045, 0.17, 0.316, 0.04, 0.01, '#222');
    b.panelZ(0.045, 0.17, 0.316, 0.04, 0.01, '#222');
    b.box(0.15, 0.03, -0.05, 0.05, 0.05, 0.36, fur, 0, undefined, 0.15);
  } else {
    // estirándose: el culo en pompa
    b.boxRot(0, 0.2, -0.05, 0.22, 0.18, 0.45, 0.35, 0, 0, fur);
    b.box(0, 0.12, 0.22, 0.18, 0.15, 0.14, fur);
    b.box(-0.06, 0.22, 0.23, 0.05, 0.07, 0.04, fur, SKIP.NY);
    b.box(0.06, 0.22, 0.23, 0.05, 0.07, 0.04, fur, SKIP.NY);
    b.box(0, 0.03, 0.34, 0.2, 0.05, 0.14, fur);
    for (const sx of [-0.07, 0.07]) b.box(sx, 0.13, -0.22, 0.06, 0.26, 0.06, fur);
    b.boxRot(0, 0.42, -0.33, 0.05, 0.05, 0.3, -1.1, 0, 0, fur);
    b.panelZ(-0.045, 0.14, 0.292, 0.035, 0.03, '#f2d13b', eye);
    b.panelZ(0.045, 0.14, 0.292, 0.035, 0.03, '#f2d13b', eye);
  }
}

/** Gaviota posada (blanca con alas grises y pico amarillo). */
export function gull(b: GeoBuilder, x: number, y: number, z: number, rot: number, s = 1) {
  b.frame(x, y, z, rot);
  b.box(0, 0.2 * s, 0, 0.16 * s, 0.16 * s, 0.34 * s, '#f4f4f0', SKIP.NY);
  b.box(0, 0.24 * s, -0.04 * s, 0.18 * s, 0.08 * s, 0.3 * s, '#9aa3ad', SKIP.NY);
  b.box(0, 0.25 * s, -0.24 * s, 0.1 * s, 0.05 * s, 0.14 * s, '#2a2a2e');
  b.box(0, 0.33 * s, 0.16 * s, 0.11 * s, 0.11 * s, 0.12 * s, '#f4f4f0');
  b.box(0, 0.32 * s, 0.26 * s, 0.035 * s, 0.035 * s, 0.1 * s, '#f2b233');
  b.box(-0.04 * s, 0.06 * s, 0, 0.02 * s, 0.12 * s, 0.02 * s, '#e0a060');
  b.box(0.04 * s, 0.06 * s, 0, 0.02 * s, 0.12 * s, 0.02 * s, '#e0a060');
}

/** Paloma (gris con cuello tornasolado). `peck`: con la cabeza agachada picoteando. */
export function pigeon(b: GeoBuilder, x: number, y: number, z: number, rot: number, peck = false) {
  b.frame(x, y, z, rot);
  b.box(0, 0.12, 0, 0.13, 0.12, 0.24, '#8e939c', SKIP.NY);
  b.box(0, 0.14, -0.17, 0.08, 0.04, 0.1, '#5c616a');
  if (peck) {
    b.box(0, 0.08, 0.15, 0.08, 0.08, 0.09, '#6d7f8a');
    b.box(0, 0.04, 0.21, 0.025, 0.025, 0.05, '#e0a060');
  } else {
    b.box(0, 0.2, 0.1, 0.08, 0.12, 0.08, '#6d7f8a');
    b.box(0, 0.25, 0.15, 0.025, 0.025, 0.05, '#e0a060');
  }
}

/** Flamenco rosa de jardín (de plástico, a la pata coja). */
export function flamingo(b: GeoBuilder, x: number, y: number, z: number, rot: number) {
  b.frame(x, y, z, rot);
  const pink = '#ff6fa8';
  b.box(0, 0.4, 0, 0.02, 0.8, 0.02, '#3a2a2e');
  b.boxRot(0, 0.52, 0.02, 0.02, 0.02, 0.3, 0.9, 0, 0, '#3a2a2e');
  b.boxRot(0, 0.88, 0, 0.2, 0.2, 0.42, -0.2, 0, 0, pink);
  b.boxRot(0, 0.86, -0.22, 0.12, 0.1, 0.14, -0.6, 0, 0, '#ff8fbe');
  b.box(0, 1.18, 0.16, 0.05, 0.42, 0.05, pink);
  b.box(0, 1.4, 0.2, 0.09, 0.09, 0.14, pink);
  b.boxRot(0, 1.36, 0.3, 0.04, 0.04, 0.09, 0.7, 0, 0, '#1b1b1b');
}

/** Enanito de jardín (gorro rojo y barba). */
export function gnome(b: GeoBuilder, x: number, y: number, z: number, rot: number) {
  b.frame(x, y, z, rot);
  b.box(0, 0.12, 0, 0.2, 0.24, 0.16, '#2f6fb0', SKIP.NY);
  b.box(0, 0.3, 0, 0.16, 0.14, 0.14, '#f0c8a0');
  b.box(0, 0.26, 0.06, 0.15, 0.12, 0.05, '#f4f4f0');
  b.cyl(0, 0.37, 0, 0.1, 0, 0.22, 4, '#e8394d', false, true, undefined, Math.PI / 4);
}

const LANTERN_COLS = ['#ff4f6b', '#ffd23f', '#3fc1ff', '#7cf06a', '#ff8c2a', '#c07cff', '#ff6fd0'];

/**
 * Guirnalda de farolillos de fiesta entre dos puntos de MUNDO (con catenaria). Brillan un poco de día y
 * mucho de noche.
 */
export function lanterns(b: GeoBuilder, ax: number, ay: number, az: number, bx: number, by: number, bz: number, sag: number, rng: Rng, spacing = 0.9) {
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.round(L / spacing));
  const seg = 4;
  let px = ax, py = ay, pz = az;
  b.frame(0, 0, 0, 0);
  for (let i = 1; i <= seg; i++) {
    const t = i / seg;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t - Math.sin(t * Math.PI) * sag;
    b.beam(px, py, pz, x, y, z, 0.025, '#3a3530');
    px = x;
    py = y;
    pz = z;
  }
  const off = rng.int(0, LANTERN_COLS.length - 1);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t - Math.sin(t * Math.PI) * sag;
    const c = LANTERN_COLS[(i + off) % LANTERN_COLS.length];
    const round = (i + off) % 3 === 0;
    b.frame(x, y, z, 0);
    // (farolillos cilíndricos y de bola; sin tapa de arriba, que casi nunca se ve)
    if (round) b.cyl(0, -0.27, 0, 0.2, 0.2, 0.24, 6, c, false, true, emitOf(c, 0.15, 1.5));
    else b.cyl(0, -0.38, 0, 0.15, 0.15, 0.34, 5, c, false, true, emitOf(c, 0.15, 1.5));
  }
  b.frame(0, 0, 0, 0);
}

/** Banderitas de colores (triángulos) entre dos puntos de mundo. */
export function bunting(b: GeoBuilder, ax: number, ay: number, az: number, bx: number, by: number, bz: number, sag: number, off = 0) {
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.round(L / 0.55));
  const ux = (bx - ax) / L, uz = (bz - az) / L;
  b.frame(0, 0, 0, 0);
  const yAt = (t: number) => ay + (by - ay) * t - Math.sin(t * Math.PI) * sag;
  for (let i = 0; i < 4; i++) {
    const t0 = i / 4, t1 = (i + 1) / 4;
    b.beam(ax + (bx - ax) * t0, yAt(t0), az + (bz - az) * t0, ax + (bx - ax) * t1, yAt(t1), az + (bz - az) * t1, 0.02, '#eeeeee');
  }
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = yAt(t);
    const c = LANTERN_COLS[(i + off) % LANTERN_COLS.length];
    const w = 0.18;
    b.triW(x - ux * w, y, z - uz * w, x + ux * w, y, z + uz * w, x, y - 0.32, z, c);
    b.triW(x + ux * w, y, z + uz * w, x - ux * w, y, z - uz * w, x, y - 0.32, z, c);
  }
}

/** Silla de enea (baja, de madera y asiento de paja). */
export function chair(b: GeoBuilder, x: number, y: number, z: number, rot: number, color = '#8a5a33') {
  b.frame(x, y, z, rot);
  b.box(0, 0.4, 0, 0.4, 0.06, 0.4, '#d9b56a');
  for (const [sx, sz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) b.box(sx, 0.2, sz, 0.04, 0.4, 0.04, color);
  b.box(-0.17, 0.72, -0.18, 0.04, 0.6, 0.04, color);
  b.box(0.17, 0.72, -0.18, 0.04, 0.6, 0.04, color);
  b.box(0, 0.88, -0.18, 0.38, 0.06, 0.03, color);
  b.box(0, 0.7, -0.18, 0.38, 0.05, 0.03, color);
}

/** Pizarra de caballete en la acera (el texto va en el atlas de carteles con la clave `key`). */
export function chalkboard(b: GeoBuilder, x: number, y: number, z: number, rot: number) {
  b.frame(x, y, z, rot);
  const wood = '#7a5230';
  b.boxRot(0, 0.52, 0.16, 0.62, 1.05, 0.04, -0.28, 0, 0, wood);
  b.boxRot(0, 0.52, -0.16, 0.62, 1.05, 0.04, 0.28, 0, 0, wood);
}

/**
 * Puesto de mercadillo (mesa, postes y género encima; el toldo y el rótulo los pone quien lo llama).
 * El cliente se pone en +Z local. `fish`: pescado sobre hielo en vez de fruta.
 */
export function stallFrame(b: GeoBuilder, x: number, y: number, z: number, rot: number, w: number, d: number, goods: string[], rng: Rng, fish = false) {
  b.frame(x, y, z, rot);
  const wood = '#8a5a33';
  b.box(0, 0.82, 0, w, 0.08, d, '#b98a58');
  b.box(0, 0.45, d / 2 - 0.02, w, 0.7, 0.04, fish ? '#dfe9ef' : '#e9dcc0', SKIP.NZ);
  for (const sx of [-w / 2 + 0.06, w / 2 - 0.06]) {
    b.box(sx, 1.6, -d / 2 + 0.06, 0.07, 3.2, 0.07, wood);
    b.box(sx, 0.43, d / 2 - 0.06, 0.07, 0.86, 0.07, wood);
  }
  // cajas con género
  const n = Math.max(2, Math.floor(w / 0.6));
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + (w * (i + 0.5)) / n;
    const c = goods[i % goods.length];
    if (fish) {
      b.box(cx, 0.93, 0.05, w / n - 0.06, 0.14, d - 0.35, '#f4f8fa');
      for (let k = 0; k < 3; k++) b.box(cx - 0.12 + k * 0.12, 1.03, 0.05 + (k - 1) * 0.12, 0.08, 0.05, 0.34, c, 0, undefined, rng.range(-0.3, 0.3));
    } else {
      b.box(cx, 0.94, 0.05, w / n - 0.06, 0.16, d - 0.35, '#c8915a');
      for (let k = 0; k < 3; k++) b.blob(cx - 0.12 + k * 0.12, 1.06, 0.05 + (k % 2 ? 0.12 : -0.1), 0.08, 0.06, 0.08, c, 0.1, i * 3 + k);
    }
  }
  // cartelito con el precio
  b.box(w / 2 - 0.3, 1.25, d / 2 - 0.1, 0.36, 0.22, 0.02, '#f4f1ea');
  // travesaño de arriba (donde va el rótulo)
  b.box(0, 3.0, -d / 2 + 0.06, w, w * 0.18, 0.05, '#f4f1ea');
}

/** Toalla con rayas tumbada en el suelo (se dibuja como caja fina). */
export function towel(b: GeoBuilder, x: number, y: number, z: number, rot: number, c1: string, c2: string) {
  b.frame(x, y, z, rot);
  for (let i = 0; i < 4; i++) b.box(0, 0.015, -0.75 + i * 0.5, 0.8, 0.03, 0.5, i % 2 ? c2 : c1, SKIP.NY);
}

/** Castillo de arena con cubo y pala. */
export function sandcastle(b: GeoBuilder, x: number, y: number, z: number, rot: number) {
  b.frame(x, y, z, rot);
  const sand = '#e2c98e';
  b.box(0, 0.12, 0, 0.7, 0.24, 0.7, sand, SKIP.NY);
  for (const [sx, sz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) b.cyl(sx, 0, sz, 0.12, 0.1, 0.42, 6, sand, true);
  b.cyl(0, 0.24, 0, 0.16, 0.14, 0.3, 6, sand, true);
  b.box(0, 0.62, 0, 0.01, 0.16, 0.01, '#8a5a33');
  b.triL(0, 0.7, 0, 0.14, 0.65, 0, 0, 0.6, 0, '#e8394d');
  b.cyl(0.7, 0, 0.2, 0.12, 0.09, 0.2, 7, '#2f9fe0', true);
  b.boxRot(0.6, 0.06, -0.25, 0.08, 0.02, 0.35, 0, 0.6, 0, '#ffd23f');
}

/** Torre de socorrista (de madera, con sombrilla y bandera). */
export function lifeguard(b: GeoBuilder, x: number, y: number, z: number, rot: number, flag = '#3fae4a') {
  b.frame(x, y, z, rot);
  const wood = '#f4f1ea';
  for (const [sx, sz] of [[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.5], [0.6, 0.5]]) b.boxRot(sx, 1.0, sz, 0.1, 2.1, 0.1, sz > 0 ? -0.12 : 0.12, 0, 0, wood);
  b.box(0, 2.0, 0, 1.5, 0.1, 1.2, '#e8394d');
  b.box(0, 2.35, -0.45, 1.2, 0.6, 0.08, '#e8394d');
  b.box(0, 2.3, 0, 0.9, 0.08, 0.6, wood);
  for (let i = 0; i < 5; i++) b.box(0, 0.25 + i * 0.4, 0.75 + i * -0.02, 0.8, 0.05, 0.12, wood);
  b.box(0.65, 3.0, -0.45, 0.05, 2.0, 0.05, '#dddddd');
  b.box(0.95, 3.7, -0.45, 0.55, 0.4, 0.02, flag, 0);
  // sombrilla
  b.cyl(-0.55, 2.0, -0.4, 0.03, 0.03, 1.4, 4, '#dddddd', false);
  b.cyl(-0.55, 3.25, -0.4, 0.9, 0.0, 0.35, 8, '#ffd23f', false);
}

/** Patín de pedales con tobogán (varado en la orilla). */
export function pedalo(b: GeoBuilder, x: number, y: number, z: number, rot: number, color = '#ffffff') {
  b.frame(x, y, z, rot);
  for (const sx of [-0.7, 0.7]) {
    b.box(sx, 0.2, 0, 0.45, 0.4, 2.8, color);
    b.boxRot(sx, 0.25, 1.5, 0.45, 0.3, 0.5, -0.5, 0, 0, color);
  }
  b.box(0, 0.45, 0.2, 1.6, 0.1, 1.2, '#2f7fcf');
  b.box(0, 0.7, -0.35, 1.2, 0.5, 0.1, '#2f7fcf');
  // tobogán amarillo
  b.boxRot(0, 1.05, -0.2, 0.55, 0.06, 1.9, 0.75, 0, 0, '#ffd23f');
  b.box(0, 0.95, -0.95, 0.5, 1.0, 0.08, '#ffd23f');
}

/** Barca de remos varada boca abajo (casco de colores). */
export function rowboat(b: GeoBuilder, x: number, y: number, z: number, rot: number, color: string) {
  b.frame(x, y, z, rot);
  const L = 3.6, W = 1.3;
  // casco boca abajo: dos faldones inclinados y la quilla
  b.quadL(-W / 2, 0.05, -L / 2, 0, 0.62, -L / 2, 0, 0.62, L / 2 - 0.4, -W / 2, 0.05, L / 2 - 0.4, color);
  b.quadL(0, 0.62, -L / 2, W / 2, 0.05, -L / 2, W / 2, 0.05, L / 2 - 0.4, 0, 0.62, L / 2 - 0.4, color);
  b.triL(-W / 2, 0.05, L / 2 - 0.4, 0, 0.62, L / 2 - 0.4, 0, 0.3, L / 2 + 0.2, lin(color).clone().multiplyScalar(0.85));
  b.triL(0, 0.62, L / 2 - 0.4, W / 2, 0.05, L / 2 - 0.4, 0, 0.3, L / 2 + 0.2, lin(color).clone().multiplyScalar(0.85));
  b.quadL(W / 2, 0.05, -L / 2, 0, 0.62, -L / 2, -W / 2, 0.05, -L / 2, 0, 0.05, -L / 2, '#f4f1ea');
  b.box(0, 0.64, 0, 0.08, 0.06, L - 0.3, '#f4f1ea');
  // remos al lado
  b.boxRot(W / 2 + 0.3, 0.04, 0, 0.06, 0.04, 2.2, 0, 0.1, 0, '#b98a58');
  b.boxRot(W / 2 + 0.3, 0.04, 1.05, 0.16, 0.03, 0.4, 0, 0.1, 0, '#b98a58');
}

/** Barrera de hormigón de obra (new jersey) a rayas rojas y blancas. */
export function barrier(b: GeoBuilder, x: number, y: number, z: number, rot: number, i = 0) {
  b.frame(x, y, z, rot);
  b.box(0, 0.2, 0, 2.0, 0.4, 0.6, i % 2 ? '#e8394d' : '#f4f1ea', SKIP.NY);
  b.box(0, 0.6, 0, 2.0, 0.4, 0.3, i % 2 ? '#f4f1ea' : '#e8394d');
}

/** Retroexcavadora pequeña (amarilla, aparcada con el brazo recogido). */
export function digger(b: GeoBuilder, x: number, y: number, z: number, rot: number) {
  b.frame(x, y, z, rot);
  const yel = '#f2b233', dark = '#2a2c31';
  for (const sx of [-1.0, 1.0]) b.box(sx, 0.4, 0, 0.55, 0.8, 3.2, dark);
  b.box(0, 1.1, 0, 2.2, 0.6, 2.6, yel);
  b.box(0.3, 1.95, -0.3, 1.3, 1.1, 1.3, yel);
  b.box(0.3, 2.0, 0.37, 1.1, 0.8, 0.02, '#8fd0f0', 0, [0.1, 0.15, 0.2, 0]);
  b.box(-0.6, 1.5, -1.1, 0.8, 0.5, 0.6, '#3a3f47');
  // brazo: pluma, balancín y cazo
  b.boxRot(-0.55, 2.4, 1.6, 0.35, 0.35, 2.4, -0.7, 0, 0, yel);
  b.boxRot(-0.55, 2.2, 3.0, 0.3, 0.3, 1.8, 0.9, 0, 0, yel);
  b.box(-0.55, 0.75, 3.45, 0.9, 0.55, 0.6, dark);
  b.box(0.3, 2.53, -0.3, 1.4, 0.06, 1.4, '#e8a01b');
  b.box(0.85, 2.75, -0.5, 0.12, 0.3, 0.12, '#ff8c2a', 0, [1.2, 0.5, 0.05, 2]);
}

/** Retrete portátil de obra (azul, con media luna). */
export function toilet(b: GeoBuilder, x: number, y: number, z: number, rot: number) {
  b.frame(x, y, z, rot);
  b.box(0, 1.15, 0, 1.1, 2.3, 1.1, '#2f7fcf', SKIP.NY);
  b.box(0, 2.35, 0, 1.2, 0.1, 1.2, '#f4f1ea');
  b.panelZ(0, 1.05, 0.56, 0.8, 1.9, '#2a6db3');
  b.panelZ(0, 1.75, 0.57, 0.2, 0.2, '#ffd23f');
  b.box(0.3, 1.05, 0.58, 0.06, 0.2, 0.04, '#f4f1ea');
}

/** Montón de arena, grava o tierra. */
export function pile(b: GeoBuilder, x: number, y: number, z: number, r: number, h: number, color: string, seed = 1) {
  b.frame(x, y - 0.1, z, 0);
  b.blob(0, 0, 0, r, h, r * 0.85, color, 0.12, seed);
}

/** Tubos de obra apilados (horizontales, a lo largo de +Z local). */
export function pipes(b: GeoBuilder, x: number, y: number, z: number, rot: number) {
  b.frame(x, y, z, rot);
  const c = '#8a9098';
  for (const [px, py] of [[-0.45, 0.3], [0.2, 0.3], [0.85, 0.3], [-0.12, 0.84], [0.52, 0.84]]) {
    b.boxRot(px, py, 0, 0.55, 0.55, 4.0, 0, 0, Math.PI / 4, c);
    b.boxRot(px, py, 0, 0.55, 0.55, 4.0, 0, 0, 0, lin(c).clone().multiplyScalar(0.9));
  }
}

/** Canasta de baloncesto (poste, tablero y aro) mirando a +Z local. */
export function hoop(b: GeoBuilder, x: number, y: number, z: number, rot: number) {
  b.frame(x, y, z, rot);
  b.box(0, 1.6, -0.6, 0.14, 3.2, 0.14, '#2f3540');
  b.boxRot(0, 3.2, -0.3, 0.1, 0.1, 0.8, 0.5, 0, 0, '#2f3540');
  b.box(0, 3.35, 0, 1.8, 1.05, 0.06, '#f4f1ea');
  b.panelZ(0, 3.2, 0.035, 0.6, 0.45, '#e8394d');
  b.panelZ(0, 3.2, 0.036, 0.5, 0.35, '#f4f1ea');
  // aro (octógono de barritas) y red
  const r = 0.23;
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
    const x0 = Math.cos(a0) * r, z0 = 0.3 + Math.sin(a0) * r, x1 = Math.cos(a1) * r, z1 = 0.3 + Math.sin(a1) * r;
    b.beam(b.wx(x0, z0), b.wy(3.05), b.wz(x0, z0), b.wx(x1, z1), b.wy(3.05), b.wz(x1, z1), 0.025, '#ff6a1a');
    if (i % 2 === 0) b.beam(b.wx(x0, z0), b.wy(3.05), b.wz(x0, z0), b.wx(x0 * 0.6, 0.3 + (z0 - 0.3) * 0.6), b.wy(2.7), b.wz(x0 * 0.6, 0.3 + (z0 - 0.3) * 0.6), 0.015, '#f4f4f4');
  }
}

/** Bidón de chapa (de pie). */
export function drum(b: GeoBuilder, x: number, y: number, z: number, color: string, fire = false) {
  b.frame(x, y, z, 0);
  b.cyl(0, 0, 0, 0.3, 0.3, 0.9, 8, color, true);
  b.cyl(0, 0.3, 0, 0.31, 0.31, 0.05, 8, lin(color).clone().multiplyScalar(0.8), false);
  b.cyl(0, 0.6, 0, 0.31, 0.31, 0.05, 8, lin(color).clone().multiplyScalar(0.8), false);
  if (fire) {
    // hoguera dentro del bidón (brilla de noche, parpadea)
    b.cyl(0, 0.88, 0, 0.22, 0.02, 0.35, 5, '#ff8c2a', false, false, [1.6, 0.6, 0.1, 0.5]);
    b.cyl(0.05, 0.88, 0.04, 0.12, 0.0, 0.5, 4, '#ffd23f', false, false, [1.6, 1.1, 0.2, 0.6]);
  }
}

/** Estatua humana dorada sobre un cajón (con sombrero para las monedas). */
export function humanStatue(b: GeoBuilder, x: number, y: number, z: number, rot: number) {
  b.frame(x, y, z, rot);
  const gold = '#e0b84a', gold2 = '#c49a34';
  b.box(0, 0.35, 0, 0.8, 0.7, 0.8, '#6b4a2a');
  b.box(0, 0.72, 0, 0.84, 0.04, 0.84, '#8a6a3a');
  const Y = 0.74;
  b.box(-0.12, Y + 0.42, 0, 0.16, 0.84, 0.18, gold2);
  b.box(0.12, Y + 0.42, 0, 0.16, 0.84, 0.18, gold2);
  b.box(0, Y + 1.12, 0, 0.46, 0.6, 0.26, gold);
  b.box(0, Y + 1.56, 0, 0.26, 0.28, 0.26, gold);
  // brazo señalando al cielo y otro en la cadera
  b.boxRot(0.32, Y + 1.62, 0, 0.12, 0.62, 0.12, 0, 0, -0.25, gold2);
  b.boxRot(-0.3, Y + 1.05, 0.02, 0.12, 0.5, 0.12, 0, 0, 0.5, gold2);
  // chistera
  b.cyl(0, Y + 1.7, 0, 0.2, 0.2, 0.05, 8, gold2, true);
  b.cyl(0, Y + 1.74, 0, 0.13, 0.13, 0.28, 8, gold2, true);
  // sombrero en el suelo con monedas
  b.cyl(0.2, 0, 0.75, 0.2, 0.2, 0.04, 8, '#2a2a2e', true);
  b.cyl(0.2, 0.04, 0.75, 0.13, 0.12, 0.1, 8, '#2a2a2e', false);
  for (let i = 0; i < 4; i++) b.cyl(0.12 + i * 0.06, 0.05, 0.72 + (i % 2) * 0.06, 0.035, 0.035, 0.02, 6, '#e8c25a', true);
}

/** Maceta grande de barro con geranios (para plazas, sin colisor aparte). */
export function bigPot(b: GeoBuilder, x: number, y: number, z: number, flower: string) {
  b.frame(x, y, z, 0);
  b.cyl(0, 0, 0, 0.36, 0.48, 0.7, 7, '#c8643b', false);
  b.cyl(0, 0.62, 0, 0.5, 0.5, 0.1, 7, '#b0552f', true);
  b.blob(0, 0.85, 0, 0.45, 0.28, 0.45, '#4f8f3f', 0.12, Math.round(x * 3 + z));
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26;
    b.box(Math.cos(a) * 0.25, 1.02 + (i % 2) * 0.06, Math.sin(a) * 0.25, 0.14, 0.12, 0.14, flower, SKIP.NY);
  }
}

/** Mesa de pícnic de madera con bancos. */
export function picnicTable(b: GeoBuilder, x: number, y: number, z: number, rot: number) {
  b.frame(x, y, z, rot);
  const wood = '#a8784a';
  b.box(0, 0.74, 0, 1.8, 0.07, 0.8, wood);
  for (const s of [-1, 1]) {
    b.box(0, 0.44, s * 0.68, 1.8, 0.06, 0.3, wood);
    for (const sx of [-0.7, 0.7]) b.boxRot(sx, 0.37, s * 0.3, 0.07, 0.8, 0.07, s * 0.6, 0, 0, '#7a5230');
  }
}

/** Columpio doble (estructura en A y dos asientos). */
export function swings(b: GeoBuilder, x: number, y: number, z: number, rot: number) {
  b.frame(x, y, z, rot);
  const c = '#e8394d';
  for (const sx of [-1.6, 1.6]) {
    b.boxRot(sx, 1.1, -0.45, 0.1, 2.4, 0.1, 0.35, 0, 0, c);
    b.boxRot(sx, 1.1, 0.45, 0.1, 2.4, 0.1, -0.35, 0, 0, c);
  }
  b.box(0, 2.25, 0, 3.4, 0.1, 0.1, c);
  for (const sx of [-0.7, 0.7]) {
    b.box(sx - 0.2, 1.45, 0, 0.02, 1.6, 0.02, '#cccccc');
    b.box(sx + 0.2, 1.45, 0, 0.02, 1.6, 0.02, '#cccccc');
    b.box(sx, 0.62, 0, 0.5, 0.05, 0.22, '#ffd23f');
  }
}

/** Tobogán con escalerilla. */
export function slide(b: GeoBuilder, x: number, y: number, z: number, rot: number) {
  b.frame(x, y, z, rot);
  b.box(0, 0.9, -1.2, 0.8, 0.08, 0.8, '#2f7fcf');
  for (const sx of [-0.35, 0.35]) for (const sz of [-1.55, -0.85]) b.box(sx, 0.45, sz, 0.07, 0.9, 0.07, '#2f7fcf');
  b.boxRot(0, 0.5, -0.1, 0.6, 0.06, 2.3, 0.42, 0, 0, '#ffd23f');
  for (const sx of [-0.3, 0.3]) b.boxRot(sx, 0.6, -0.1, 0.05, 0.16, 2.3, 0.42, 0, 0, '#ffb000');
  for (const sx of [-0.35, 0.35]) b.boxRot(sx, 0.55, -1.95, 0.06, 1.2, 0.06, -0.35, 0, 0, '#aaaaaa');
  for (let i = 0; i < 4; i++) b.box(0, 0.18 + i * 0.22, -2.0 + i * 0.08, 0.7, 0.04, 0.06, '#aaaaaa');
}

/** Balancín. */
export function seesaw(b: GeoBuilder, x: number, y: number, z: number, rot: number) {
  b.frame(x, y, z, rot);
  b.box(0, 0.25, 0, 0.3, 0.5, 0.3, '#3f9a5a');
  b.boxRot(0, 0.45, 0, 0.3, 0.07, 3.2, 0.14, 0, 0, '#ff6fb5');
  for (const s of [-1, 1]) b.box(0, 0.45 - s * 0.2 + 0.15, s * 1.4, 0.36, 0.2, 0.04, '#7c4dbb');
}
