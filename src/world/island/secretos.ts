// Secretos de fase 9:
//  1. El Pasaje del Paquete Perdido: una tapia con murales a lo largo de la Avenida del Reembolso cierra
//     el hueco que había junto a la Caja de Ahorros La Hucha Rota. Por un arco escondido se entra a un
//     pasillo y a un patio trasero, y de ahí sube una escalera de incendios hasta la azotea del banco.
//  2. La azotea escondida: la piscina de monedas del director (se puede "nadar" en monedas).
//  3. El Salto del Mirador: una rampa con vistas al mar en lo alto de La Colina, con carrerilla y zona de
//     aterrizaje libres (reservadas en el plan: no caen árboles).
import * as THREE from 'three';
import type { Ctx } from './ctx';
import type { Out } from './special';
import { stairs, stairRun, jumpRamp } from './special';
import { lotPoint, Lot } from './layout';
import { OCC } from './occ';
import { SKIP } from './geo';
import { Rng } from '../../core/rng';
import * as K from './kit';

/** Rampa con vistas: centro de la cuña, rumbo del salto y metros libres detrás (carrerilla) y delante. */
export const BONUS_RAMP = { x: -48, z: -256, heading: -Math.PI / 2, runIn: 34, landing: 50 };

const METAL = '#8a9098', RED = '#c0392b';

/**
 * Azotea del banco (sustituye a su azotea normal): peto con hueco y colisores, escalera de incendios por
 * la fachada este (sube desde el patio trasero), la piscina de monedas y la tapia del pasaje. Lo llama
 * buildBank (centro.ts) con el solar del banco (fachada al norte) y la altura del edificio.
 */
export function bankSecret(ctx: Ctx, out: Out, lot: Lot, H: number): boolean {
  const b = ctx.solid.at(lot.x, lot.z);
  const hw = lot.hw, hd = lot.hd;
  // solo si el banco mira al norte, como en el plano (si no, azotea normal)
  if (Math.abs(Math.cos(lot.rot) + 1) > 0.01) return false;
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  b.quadL(-hw, H, hd, hw, H, hd, hw, H, -hd, -hw, H, -hd, '#c9bfa8');
  // escalera de incendios pegada a la fachada lateral -x del solar (la del este, que da al pasillo):
  // arranca en el patio trasero y sube hacia la fachada principal
  const sx = -hw - 0.75;
  let startLz = -hd - 4.2;
  let s0 = lotPoint(lot, sx, startLz);
  let y0 = ctx.heightAt(s0.x, s0.z);
  let run = stairRun(lot.h + H - y0);
  if (startLz + run > hd - 1.9) {
    // (si el patio está más bajo, la escalera es más larga: se empieza más atrás)
    startLz = hd - 1.9 - run;
    s0 = lotPoint(lot, sx, startLz);
    y0 = ctx.heightAt(s0.x, s0.z);
    run = stairRun(lot.h + H - y0);
  }
  const rise = lot.h + H - y0;
  const topLz = startLz + run;
  const dir = lot.rot; // hacia +z local (la fachada)
  // barandilla por fuera (lado contrario a la pared)
  const rightX = Math.cos(dir), rightZ = -Math.sin(dir);
  const toWallX = Math.cos(lot.rot), toWallZ = -Math.sin(lot.rot); // la pared está hacia +x local
  const railSide = rightX * toWallX + rightZ * toWallZ > 0 ? -1 : 1;
  stairs(ctx, b, s0.x, y0, s0.z, dir, rise, 1.3, METAL, RED, railSide, false);
  // rellano arriba
  const land = lotPoint(lot, sx, topLz + 0.7);
  b.frame(land.x, lot.h + H, land.z, lot.rot);
  b.box(0, -0.1, 0, 1.3, 0.2, 1.4, METAL);
  b.box(-0.62, 0.5, 0, 0.05, 1.0, 1.4, RED);
  b.box(0, 0.5, 0.68, 1.3, 1.0, 0.05, RED);
  ctx.box(land.x, lot.h + H - 0.1, land.z, 0.65, 0.1, 0.7, lot.rot);
  {
    const a = lotPoint(lot, sx, startLz - 0.9), top = land, roof = lotPoint(lot, 0, 0);
    ctx.climbs.push({ name: 'azotea-banco', a: new THREE.Vector3(a.x, y0, a.z), b: new THREE.Vector3(top.x, lot.h + H, top.z), c: new THREE.Vector3(roof.x, lot.h + H, roof.z) });
  }
  // peto (con colisores) y hueco donde llega la escalera
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  const t = 0.25, ph = 1.0;
  const gz0 = topLz - 0.1, gz1 = topLz + 1.5;
  const walls: [number, number, number, number][] = [
    [0, hd - t / 2, hw * 2, t],
    [0, -hd + t / 2, hw * 2, t],
    [hw - t / 2, 0, t, hd * 2 - 2 * t],
    [-hw + t / 2, (gz1 + hd - t) / 2, t, hd - t - gz1],
    [-hw + t / 2, (-hd + t + gz0) / 2, t, gz0 - (-hd + t)],
  ];
  const trim = '#cdbd98';
  for (const [x, z, sxx, szz] of walls) {
    if (sxx <= 0.05 || szz <= 0.05) continue;
    b.box(x, H + ph / 2, z, sxx, ph, szz, trim, SKIP.NY);
    const P = lotPoint(lot, x, z);
    ctx.box(P.x, lot.h + H + ph / 2, P.z, sxx / 2, ph / 2, szz / 2, lot.rot);
  }
  coinPool(ctx, lot, H);
  pasaje(ctx, out, lot);
  return true;
}

/** La piscina de monedas del director, con trampolín, tumbonas, un patito dorado y un gato. */
function coinPool(ctx: Ctx, lot: Lot, H: number) {
  const b = ctx.solid.at(lot.x, lot.z);
  const px = 2.8, pz = -0.8, pw = 7, pd = 4.2;
  b.frame(lot.x, lot.h + H, lot.z, lot.rot);
  const gold: number[] = [0.9, 0.62, 0.15, 0.18];
  // vaso: fondo lleno de monedas y bordillo blanco que asoma por encima
  b.box(px, 0.3, pz, pw, 0.6, pd, '#e8c25a', SKIP.NY, gold);
  for (const [x, z, sxx, szz] of [[px, pz - pd / 2 - 0.15, pw + 0.6, 0.3], [px, pz + pd / 2 + 0.15, pw + 0.6, 0.3], [px - pw / 2 - 0.15, pz, 0.3, pd], [px + pw / 2 + 0.15, pz, 0.3, pd]]) {
    b.box(x, 0.45, z, sxx, 0.9, szz, '#f2eee6', SKIP.NY);
  }
  const rng = new Rng('monedas');
  for (let i = 0; i < 22; i++) {
    const x = px + rng.range(-pw / 2 + 0.3, pw / 2 - 0.3), z = pz + rng.range(-pd / 2 + 0.3, pd / 2 - 0.3);
    if (i % 5 === 0) b.box(x, 0.65, z, 0.34, 0.1, 0.16, '#f2c94a', 0, gold, rng.range(0, 3));
    else b.cyl(x, 0.6, z, 0.13, 0.13, 0.03 + (i % 3) * 0.03, 6, '#f5d36a', true, false, gold);
  }
  // montañita de monedas en el centro
  b.cyl(px - 0.6, 0.6, pz + 0.3, 1.2, 0.2, 0.55, 8, '#e8c25a', true, false, gold);
  // trampolín
  b.box(px + pw / 2 + 0.9, 0.45, pz, 0.6, 0.9, 0.6, '#2f6fb0');
  b.box(px + pw / 2 - 0.4, 0.95, pz, 2.4, 0.08, 0.55, '#f4f1ea');
  // escalerilla
  for (const sz of [-0.3, 0.3]) b.box(px - pw / 2 - 0.25, 0.75, pz + sz, 0.05, 1.5, 0.05, '#c0c4c8');
  for (let i = 0; i < 3; i++) b.box(px - pw / 2 - 0.25, 0.3 + i * 0.35, pz, 0.05, 0.05, 0.6, '#c0c4c8');
  // patito dorado y gato durmiendo encima del dinero
  b.frame(lotPoint(lot, px + 1.6, pz - 1).x, lot.h + H + 0.6, lotPoint(lot, px + 1.6, pz - 1).z, lot.rot + 0.8);
  b.box(0, 0.12, 0, 0.36, 0.24, 0.46, '#f2c94a', 0, gold);
  b.box(0, 0.36, 0.14, 0.24, 0.22, 0.22, '#f2c94a', 0, gold);
  b.box(0, 0.33, 0.3, 0.12, 0.06, 0.12, '#ff8c2a');
  const cp = lotPoint(lot, px - 2.2, pz + 1.1);
  K.cat(b, cp.x, lot.h + H + 0.6, cp.z, lot.rot + 2.2, '#e8903a', 'loaf');
  // tumbonas, sombrilla y cartel
  for (let i = 0; i < 2; i++) {
    const lp = lotPoint(lot, -3.2 - i * 1.4, -4.2);
    ctx.props.add('lounger', lp.x, lot.h + H, lp.z, lot.rot, 1);
  }
  const up = lotPoint(lot, -5.9, -5.2);
  ctx.props.add('umbrella', up.x, lot.h + H, up.z, 0.4, 1, new THREE.Color('#ffe27a'));
  const sp = lotPoint(lot, -3.5, 3.6);
  b.frame(sp.x, lot.h + H, sp.z, lot.rot - Math.PI / 2);
  for (const sx of [-1.2, 1.2]) b.box(sx, 0.9, -0.05, 0.08, 1.8, 0.08, '#6b4a2a');
  b.box(0, 1.35, -0.06, 2.7, 0.95, 0.04, '#1f3f6f');
  ctx.signs.place(b, 'piscina-monedas', 0, 1.35, -0.03, 2.6, 0.9, 0.2);
  const pc = lotPoint(lot, px, pz);
  ctx.box(pc.x, lot.h + H + 0.3, pc.z, pw / 2, 0.3, pd / 2, lot.rot);
  for (const [x, z, hx, hz] of [[px, pz - pd / 2 - 0.15, pw / 2 + 0.3, 0.15], [px, pz + pd / 2 + 0.15, pw / 2 + 0.3, 0.15], [px - pw / 2 - 0.15, pz, 0.15, pd / 2], [px + pw / 2 + 0.15, pz, 0.15, pd / 2]]) {
    const q = lotPoint(lot, x, z);
    ctx.box(q.x, lot.h + H + 0.45, q.z, hx, 0.45, hz, lot.rot);
  }
}

/** Tapia con murales, arco escondido y pasillo hasta el patio trasero del banco. */
function pasaje(ctx: Ctx, out: Out, lot: Lot) {
  // esquinas del banco en el mundo (fachada norte = z mínima, fachada este = x máxima)
  const cs = [lotPoint(lot, -lot.hw, -lot.hd), lotPoint(lot, lot.hw, -lot.hd), lotPoint(lot, lot.hw, lot.hd), lotPoint(lot, -lot.hw, lot.hd)];
  const bankE = Math.max(...cs.map((c) => c.x)), bankN = Math.min(...cs.map((c) => c.z)), bankS = Math.max(...cs.map((c) => c.z));
  const WX = -8.75; // línea de la tapia (justo detrás de la acera de la Avenida del Reembolso)
  // el edificio del sur (el que cierra el patio): se baja por una columna que lo cruza hasta que se acaba
  const colX = WX - 3.75;
  let zS = bankS + 0.5;
  while (zS < bankS + 40 && ctx.occ.get(colX, zS) !== OCC.BUILDING) zS += 0.5;
  while (zS < bankS + 60 && ctx.occ.get(colX, zS) === OCC.BUILDING) zS += 0.5;
  const zEnd = zS - 0.25;
  // su cara este (la tapia del sur va de ahí a la tapia larga)
  let xSouth = WX - 0.5;
  while (xSouth > WX - 10 && ctx.occ.get(xSouth, zEnd - 0.5) !== OCC.BUILDING) xSouth -= 0.25;
  xSouth += 0.25;
  if (bankE > WX - 3 || zEnd - bankN < 20 || zEnd - bankN > 50 || xSouth < WX - 9) {
    console.warn('[isla] pasaje del banco: el hueco no es como se esperaba', bankE, bankN, zEnd, xSouth);
    return;
  }
  const Hw = 3.0, T = 0.3;
  const y = (x: number, z: number) => ctx.heightAt(x, z);
  const b = ctx.solid.at(WX, (bankN + zEnd) / 2);
  const wallCol = '#e9dfcb', cap = '#cdbd98';
  const seg = (x0: number, z0: number, x1: number, z1: number) => {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, L = Math.hypot(x1 - x0, z1 - z0);
    const rot = Math.atan2(x1 - x0, z1 - z0);
    const gy = Math.min(y(x0, z0), y(x1, z1), y(cx, cz)) - 0.3;
    const top = Math.max(y(x0, z0), y(x1, z1)) + Hw;
    b.frame(cx, gy, cz, rot);
    b.box(0, (top - gy) / 2, 0, T, top - gy, L, wallCol, SKIP.NY);
    b.box(0, top - gy + 0.06, 0, T + 0.12, 0.12, L + 0.1, cap);
    ctx.box(cx, (gy + top) / 2, cz, T / 2, (top - gy) / 2, L / 2, rot);
    ctx.foot.push({ x: cx, z: cz, hw: T / 2, hd: L / 2, rot, color: wallCol, height: Hw });
  };
  // tapia larga (con murales hacia la avenida)
  seg(WX, bankN + 0.05, WX, zEnd);
  // tapia del sur
  seg(xSouth + 0.1, zEnd, WX, zEnd);
  // tapia del norte con el arco (hueco de 1,8 m)
  const ax0 = -12.1, ax1 = -10.3;
  seg(bankE, bankN + 0.2, ax0, bankN + 0.2);
  seg(ax1, bankN + 0.2, WX, bankN + 0.2);
  {
    const ax = (ax0 + ax1) / 2, az = bankN + 0.2, gy = y(ax, az);
    b.frame(ax, gy, az, 0);
    // dintel y arco de ladrillo
    b.box(0, 2.55, 0, ax1 - ax0 + 0.2, 0.25, T + 0.1, '#c65f36');
    b.box(0, 2.8, 0, ax1 - ax0 + 0.2, 0.25, T, wallCol);
    for (const s of [-1, 1]) b.box(s * ((ax1 - ax0) / 2 - 0.05), 2.35, 0, 0.2, 0.2, T + 0.08, '#c65f36');
    ctx.box(ax, gy + 2.8, az, (ax1 - ax0) / 2 + 0.1, 0.35, T / 2);
    b.frame(ax, gy, az, Math.PI);
    ctx.signs.place(b, 'pasaje', 0, 3.25, T / 2 + 0.02, 1.9, 0.4, 0.1);
    // enredadera junto al arco, para disimular
    for (let i = 0; i < 10; i++) b.blob(-1.4 - (i % 3) * 0.35, 0.3 + i * 0.28, T / 2 + 0.12, 0.28, 0.24, 0.12, i % 2 ? '#3f8f3a' : '#4f9f45', 0.2, i);
  }
  // murales en la cara que da a la avenida (mirando al este)
  const keys = ['mural-atardecer', 'mural-tags', 'mural-caja', 'mural-gato'];
  const L = zEnd - bankN - 0.3;
  const w = Math.min(8.1, (L - 0.8 * 3) / 4), h = (w * 1.6) / 5;
  keys.forEach((k, i) => {
    const zc = bankN + 0.2 + w / 2 + i * (w + 0.8);
    const gy = y(WX + 1, zc);
    b.frame(WX, gy, zc, Math.PI / 2);
    ctx.signs.place(b, k, 0, Math.min(h / 2 + 0.3, 2.9 - h / 2), T / 2 + 0.02, w, Math.min(h, 2.6), 0.05);
  });
  // pasillo y patio: sin árboles sueltos (y algo de vida)
  ctx.occ.forRect((bankE + WX) / 2, (bankN + zEnd) / 2, (WX - bankE) / 2, (zEnd - bankN) / 2, 0, (k) => {
    if (ctx.occ.data[k] === OCC.FREE) ctx.occ.data[k] = OCC.RESERVED;
  });
  ctx.occ.forRect((xSouth + WX) / 2 - 6, bankS + 3.5, 12, 3.5, 0, (k) => {
    if (ctx.occ.data[k] === OCC.FREE) ctx.occ.data[k] = OCC.RESERVED;
  });
  const bp = ctx.solid.at(-12, 85);
  for (const [x, z] of [[-10.2, 80.5], [-10.2, 83.5], [-20, bankS + 5.2]]) ctx.props.add('pot', x, y(x, z), z, x, 1.1);
  ctx.props.add('crateStack', -24, y(-24, bankS + 5), bankS + 5, 0.4, 1);
  K.cat(bp, -10.6, y(-10.6, 88), 88, 2.6, '#2a2a2e', 'sit');
  out.extra.bankRoof = new THREE.Vector3(lot.x, lot.h + 10, lot.z);
}

/** Rampa con vistas en lo alto de La Colina (el corredor ya está reservado en el plan). */
export function secretos(ctx: Ctx, out: Out, lots: Lot[], rng: Rng) {
  const R = BONUS_RAMP;
  const fx = Math.sin(R.heading), fz = Math.cos(R.heading), rx = Math.cos(R.heading), rz = -Math.sin(R.heading);
  jumpRamp(ctx, R.x, R.z, R.heading, 9, 5, 1.9);
  const b = ctx.solid.at(R.x, R.z);
  const P = (s: number, lat: number) => ({ x: R.x + fx * s + rx * lat, z: R.z + fz * s + rz * lat });
  // banderitas a los lados de la carrerilla, en mástiles
  for (const side of [-1, 1]) {
    let prev: { x: number; z: number; y: number } | null = null;
    for (let s = -30; s <= -6; s += 8) {
      const p = P(s, side * 4.8);
      const yy = ctx.heightAt(p.x, p.z);
      b.frame(p.x, yy, p.z, 0);
      b.cyl(0, 0, 0, 0.07, 0.06, 3.2, 5, '#f4f1ea', false);
      ctx.cyl(p.x, yy + 1.6, p.z, 1.6, 0.07);
      const cur = { x: p.x, z: p.z, y: yy + 3.1 };
      if (prev) K.bunting(b, prev.x, prev.y, prev.z, cur.x, cur.y, cur.z, 0.5, s);
      prev = cur;
    }
  }
  // cartel junto a la entrada de la rampa, mirando a quien llega
  {
    const p = P(-7, -6.5);
    const yy = ctx.heightAt(p.x, p.z);
    b.frame(p.x, yy, p.z, R.heading + Math.PI);
    for (const sx of [-1.1, 1.1]) b.box(sx, 1.1, 0, 0.12, 2.2, 0.12, '#5a5f66');
    ctx.signs.placeDouble(b, 'salto', 0, 2.0, 0, 2.4, 1.0, 0.15);
    ctx.cyl(p.x + rx * 1.1, yy + 1.1, p.z + rz * 1.1, 1.1, 0.08);
    ctx.cyl(p.x - rx * 1.1, yy + 1.1, p.z - rz * 1.1, 1.1, 0.08);
  }
  // pacas de paja al final de la zona de aterrizaje (por si acaso)
  for (let i = -2; i <= 2; i++) {
    const p = P(R.landing + 4 + (i % 2) * 0.6, i * 1.5);
    const yy = ctx.heightAt(p.x, p.z);
    b.frame(p.x, yy, p.z, R.heading + rng.range(-0.1, 0.1));
    b.box(0, 0.45, 0, 1.4, 0.9, 1.0, '#e8c86a', SKIP.NY);
    b.box(0, 0.45, 0, 1.42, 0.08, 1.02, '#b8983a');
    ctx.box(p.x, yy + 0.45, p.z, 0.7, 0.45, 0.5, R.heading);
  }
  ctx.mapLabels.push({ x: R.x - 8, z: R.z - 6, text: 'Salto del Mirador', color: '#c0392b' });
  void out;
  void lots;
}
