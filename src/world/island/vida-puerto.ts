// El Puerto con más vida: puestos de pescado delante de la lonja (con gatos al acecho), gaviotas
// posadas en los norays, el monumento y el espigón, nasas y redes junto al muelle de pescadores,
// barcas varadas en la playa y un contenedor reformado "se alquila".
import * as THREE from 'three';
import type { Ctx } from './ctx';
import type { Out } from './special';
import type { Guard } from './detalles';
import { OCC } from './occ';
import { QUAY_H, QUAY_Z } from './shape';
import { SKIP } from './geo';
import { Rng } from '../../core/rng';
import * as K from './kit';
import { marketStall } from './vida-centro';
import { definePuestos } from './murales';

export function vidaPuerto(ctx: Ctx, out: Out, g: Guard, rng: Rng) {
  fishMarket(ctx, rng);
  gulls(ctx, rng);
  pierStuff(ctx);
  beachBoats(ctx, g, rng);
  containerHome(ctx);
  void out;
}

/** Puestos de pescado delante de la lonja (fachada norte en z 187, puerta de entrega en x -127). */
function fishMarket(ctx: Ctx, rng: Rng) {
  const keys = definePuestos(ctx.signs);
  const z = 182.3;
  [[-133.5, 4], [-119.2, 5], [-114.6, 6]].forEach(([x, i]) => marketStall(ctx, x, z, Math.PI, 3.2, 1.3, i, keys, rng));
  ctx.mapLabels.push({ x: -124, z: 178, text: 'Mercado del pescado', color: '#1f4e8c' });
  // gatos al acecho del pescado
  const b = ctx.solid.at(-124, 182);
  K.cat(b, -121.3, QUAY_H, 180.4, 0.25, '#e8903a', 'sit');
  K.cat(b, -130.8, QUAY_H, 180.2, -0.6, '#2a2a2e', 'stretch');
  K.cat(b, -116.9, QUAY_H, 180.0, 0.9, '#f2eee6', 'sit', '#8a8a90');
}

function gulls(ctx: Ctx, rng: Rng) {
  // en uno de cada tres norays (los de port.ts: cada 12 m en el borde del muelle)
  let k = 0;
  for (let x = -146; x <= 182; x += 12) {
    if (x > -130 && x < -120) continue;
    if (k++ % 3) continue;
    K.gull(ctx.solid.at(x, QUAY_Z), x, QUAY_H + 0.69, QUAY_Z - 0.9, rng.range(0, 6.28));
  }
  // en la cabeza del monumento al repartidor (encima del paquete) y en la caja de la oficina
  K.gull(ctx.solid.at(0, 212), 0, ctx.heightAt(0, 212) + 7.16, 212, 1.1);
  K.gull(ctx.solid.at(-47, 208), -46.2, QUAY_H + 14.2, 207.3, -0.7, 1.2);
  K.gull(ctx.solid.at(-47, 208), -48.4, QUAY_H + 14.2, 209.1, 2.1, 1.2);
  // en el murete del espigón y en los postes del muelle de pescadores
  for (const z of [258, 263, 275, 288]) K.gull(ctx.solid.at(196, z), 196 + rng.range(-0.15, 0.15), 2.6 + 0.9, z, rng.range(0, 6.28));
  for (const [x, z] of [[-127.15, 270.4], [-122.85, 285.4], [-127.15, 295.4]]) K.gull(ctx.solid.at(x, z), x, 2.7, z, rng.range(0, 6.28));
}

/** Nasas, redes y boyas junto al arranque del muelle de pescadores. */
function pierStuff(ctx: Ctx) {
  const b = ctx.solid.at(-125, 258);
  const y = QUAY_H;
  // pila de nasas
  b.frame(-131.5, y, 257.6, 0.3);
  const nasa = (x: number, yy: number, z: number) => {
    b.cyl(x, yy, z, 0.34, 0.3, 0.6, 7, '#2f5a3a', true, true);
    b.cyl(x, yy + 0.2, z, 0.35, 0.35, 0.05, 7, '#d9c29a', false);
  };
  nasa(-0.4, 0, 0);
  nasa(0.35, 0, 0.1);
  nasa(0, 0, 0.72);
  nasa(0, 0.6, 0.35);
  ctx.box(-131.5, y + 0.45, 257.8, 0.8, 0.45, 0.8, 0.3);
  // red de pesca amontonada con boyas
  b.frame(-118.8, y, 258, 0);
  b.blob(0, 0, 0, 1.3, 0.35, 1.0, '#5a7a4a', 0.25, 3);
  b.blob(0.6, 0.1, 0.3, 0.8, 0.3, 0.6, '#6a8a5a', 0.2, 5);
  for (const [bx, bz, c] of [[-0.8, 0.5, '#ff8c2a'], [0.9, -0.4, '#e8394d'], [0.2, 0.8, '#ffd23f'], [1.3, 0.6, '#ff8c2a']] as const) {
    b.frame(-118.8 + bx, y, 258 + bz, 0);
    b.blob(0, 0.28, 0, 0.26, 0.26, 0.26, c, 0.05, 1);
  }
}

/** Barcas de remos varadas boca abajo en la playa al oeste del puerto. */
function beachBoats(ctx: Ctx, g: Guard, rng: Rng) {
  const cols = ['#2f7fcf', '#e8394d', '#3f9a5a', '#f2a93b'];
  const n = new THREE.Vector3();
  let placed = 0;
  for (let t = 0; t < 400 && placed < 3; t++) {
    const x = rng.range(-215, -168), z = rng.range(238, 262);
    const h = ctx.heightAt(x, z);
    if (h < 0.85 || h > 1.3 || ctx.terrain.slopeAt(x, z) > 0.2) continue;
    if (ctx.occ.get(x, z) === OCC.BUILDING || g.near(x, z, 2.5)) continue;
    ctx.terrain.normalAt(x, z, n);
    const toSea = Math.atan2(n.x, n.z);
    K.rowboat(ctx.solid.at(x, z), x, h - 0.05, z, toSea + rng.range(-0.4, 0.4), cols[placed % cols.length]);
    ctx.box(x, h + 0.3, z, 0.65, 0.3, 1.9, toSea);
    g.protect(x, z, 3);
    placed++;
  }
}

/** Contenedor reformado como "vivienda" (se alquila), en el rincón oeste de la explanada. */
function containerHome(ctx: Ctx) {
  const x = -151.5, z = 238, rot = Math.PI / 2; // la puerta (+Z local) mira al este, a la explanada
  const y = ctx.heightAt(x, z);
  const b = ctx.solid.at(x, z);
  b.frame(x, y, z, rot);
  const L = 12.2, W = 2.44, Hc = 2.6;
  b.box(0, Hc / 2, 0, L, Hc, W, '#3f8f5a', SKIP.NY);
  for (let lx = -L / 2 + 0.5; lx < L / 2 - 0.3; lx += 1.2) {
    b.panelZ(lx, Hc / 2, W / 2 + 0.02, 0.22, Hc - 0.2, '#357a4c');
  }
  // puerta, ventana con cortinas, felpudo y buzón
  b.panelZ(-2.5, 1.05, W / 2 + 0.04, 0.95, 2.1, '#f4f1ea');
  b.panelZ(-2.5, 1.05, W / 2 + 0.05, 0.8, 1.95, '#2f6fb0');
  b.panelZ(-2.2, 1.05, W / 2 + 0.06, 0.08, 0.08, '#e8c25a');
  b.panelZ(1.5, 1.5, W / 2 + 0.04, 1.6, 1.0, '#f4f1ea');
  b.panelZ(1.5, 1.5, W / 2 + 0.05, 1.4, 0.8, '#9fd3f0', [0.5, 0.4, 0.2, 0.05]);
  b.panelZ(1.0, 1.5, W / 2 + 0.06, 0.4, 0.8, '#ff8fbe');
  b.panelZ(2.0, 1.5, W / 2 + 0.06, 0.4, 0.8, '#ff8fbe');
  b.box(1.5, 0.95, W / 2 + 0.2, 1.6, 0.25, 0.3, '#c8643b');
  for (let i = 0; i < 4; i++) b.box(0.9 + i * 0.4, 1.12, W / 2 + 0.2, 0.3, 0.14, 0.26, ['#e8394d', '#ffd23f', '#f25c8c', '#ffffff'][i]);
  b.box(-2.5, 0.02, W / 2 + 0.55, 1.0, 0.04, 0.6, '#8a5a33');
  b.box(-4.2, 1.1, W / 2 + 0.15, 0.4, 0.3, 0.25, '#e8394d');
  b.box(-4.2, 0.5, W / 2 + 0.15, 0.06, 1.0, 0.06, '#666');
  // antena parabólica y maceta en el techo, silla de plástico en la "terraza"
  b.cyl(4.5, Hc, 0, 0.05, 0.05, 0.5, 4, '#aaaaaa', false);
  b.boxRot(4.5, Hc + 0.65, 0, 0.7, 0.7, 0.08, 0.5, 0.6, 0, '#e8e8e8');
  ctx.signs.place(b.frame(x, y, z, rot), 'se-alquila', 4.3, 1.4, W / 2 + 0.05, 1.5, 0.94, 0.05);
  K.chair(b, x + 1.9, y, z - 3.6, Math.PI / 2 - 0.4, '#f4f1ea');
  ctx.props.add('pot', x + 1.7, y, z + 3.6, 0, 0.9);
  ctx.box(x, y + Hc / 2, z, L / 2, Hc / 2, W / 2, rot);
  ctx.foot.push({ x, z, hw: L / 2, hd: W / 2, rot, color: '#3f8f5a', height: Hc });
  // un gato en el techo, claro
  K.cat(b, x - 0.3, y + Hc, z + 2.5, 1.2, '#e8903a', 'loaf');
}
