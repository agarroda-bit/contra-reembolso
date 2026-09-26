// El Barrio Viejo con más vida: farolillos de fiesta en la Plaza del Matasellos, en la Calle Mayor y
// en los callejones, más tendederos y macetas, sillas "al fresco" en las puertas, gatos por todas
// partes y murales en el fondo de los dos callejones sin salida.
import type { Ctx } from './ctx';
import type { Out } from './special';
import type { Guard } from './detalles';
import { lotPoint, Lot } from './layout';
import { OCC } from './occ';
import { VIEJO_STUBS, districtRaw } from './plan';
import { pathAt, pathLength } from './network';
import { clothesline } from './buildings';
import { Rng } from '../../core/rng';
import * as K from './kit';

/** Plaza del Matasellos (mismas medidas que en viejo.ts). */
const PZ = { x: -179, z: 47.5, hw: 15.5, hd: 11 };

export function vidaViejo(ctx: Ctx, out: Out, g: Guard, lots: Lot[], rng: Rng) {
  plazuela(ctx, rng);
  deadEnds(ctx, lots, rng);
  alleys(ctx, g, rng);
  calleMayor(ctx, rng);
  chairs(ctx, g, lots, rng);
  void out;
}

function plazuela(ctx: Ctx, rng: Rng) {
  const { x: cx, z: cz, hw, hd } = PZ;
  const b = ctx.solid.at(cx, cz);
  const H = (x: number, z: number) => ctx.heightAt(x, z);
  // guirnaldas entre las cuatro farolas de las esquinas
  const c = [[cx - hw + 1, cz - hd + 1], [cx + hw - 1, cz - hd + 1], [cx + hw - 1, cz + hd - 1], [cx - hw + 1, cz + hd - 1]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4];
    K.lanterns(b, ax, H(ax, az) + 4.3, az, bx, H(bx, bz) + 4.3, bz, 0.7, rng);
  }
  // dos guirnaldas de norte a sur colgadas de mástiles de madera
  for (const sx of [-7.5, 7.5]) {
    const x = cx + sx, z0 = cz - hd + 0.4, z1 = cz + hd - 0.4;
    for (const z of [z0, z1]) {
      b.frame(x, H(x, z), z, 0);
      b.cyl(0, 0, 0, 0.08, 0.07, 4.9, 6, '#7a5230', false);
      b.blob(0, 4.95, 0, 0.12, 0.12, 0.12, '#ffd23f');
      ctx.cyl(x, H(x, z) + 2.4, z, 2.4, 0.08);
    }
    K.lanterns(b, x, H(x, z0) + 4.7, z0, x, H(x, z1) + 4.7, z1, 0.9, rng);
  }
  // banderitas cruzadas por encima del olivo
  K.bunting(b, c[0][0], H(c[0][0], c[0][1]) + 4.45, c[0][1], c[2][0], H(c[2][0], c[2][1]) + 4.45, c[2][1], -1.4, 0);
  K.bunting(b, c[1][0], H(c[1][0], c[1][1]) + 4.45, c[1][1], c[3][0], H(c[3][0], c[3][1]) + 4.45, c[3][1], -1.4, 3);
  // gatos: dos junto a la fuente, uno en el alcorque del olivo y otro en un banco
  const fx = cx - hw + 2.5;
  K.cat(b, fx + 1.6, H(fx + 1.6, cz + 2.1), cz + 2.1, Math.PI / 2 + 0.3, '#f2eee6', 'sit', '#e8903a');
  K.cat(b, fx + 1.8, H(fx + 1.8, cz - 2.2), cz - 2.2, 2.2, '#8a8a90', 'loaf');
  K.cat(b, cx + 1.9, H(cx, cz) + 0.47, cz + 0.9, -0.4, '#2a2a2e', 'loaf');
  K.cat(b, cx - 6.3, H(cx - 6, cz - hd + 1.2) + 0.5, cz - hd + 1.25, Math.PI / 2, '#e8903a', 'loaf');
  K.cat(b, cx + 9.5, H(cx + 9.5, cz + 4), cz + 4, -2.4, '#c9a27a', 'stretch');
}

/** Cara norte (la que mira a -Z) del edificio que cierra un callejón: z del plano y ancho útil. */
function endWall(ctx: Ctx, lots: Lot[], x: number, zFrom: number): { z: number; x0: number; x1: number } | null {
  let z = zFrom;
  while (z < zFrom + 12 && ctx.occ.get(x, z) !== OCC.BUILDING) z += 0.25;
  if (ctx.occ.get(x, z) !== OCC.BUILDING) return null;
  // solar que contiene el punto (solares alineados con los ejes en el Barrio Viejo)
  for (const l of lots) {
    const c = Math.abs(Math.cos(l.rot)), s = Math.abs(Math.sin(l.rot));
    const ex = c * l.hw + s * l.hd, ez = c * l.hd + s * l.hw;
    if (Math.abs(x - l.x) <= ex + 0.3 && Math.abs(z + 1.0 - l.z) <= ez + 0.3) return { z: l.z - ez, x0: l.x - ex, x1: l.x + ex };
  }
  return null;
}

function deadEnds(ctx: Ctx, lots: Lot[], rng: Rng) {
  const keys = ['mural-salida', 'mural-abuela'];
  VIEJO_STUBS.forEach(([, x, , zEnd], i) => {
    const w = endWall(ctx, lots, x, zEnd);
    if (!w) return;
    // el mural va en la parte de la pared de ese solar que se ve desde el callejón
    const lo = Math.max(w.x0 + 0.15, x - 3.2), hi = Math.min(w.x1 - 0.15, x + 3.2);
    const half = (hi - lo) / 2, mx = (lo + hi) / 2;
    if (half < 1.5) return;
    const y = ctx.heightAt(mx, w.z - 1);
    const b = ctx.solid.at(x, w.z);
    b.frame(mx, y, w.z - 0.14, Math.PI);
    const h = (half * 2 * 1.8) / 3.2;
    b.box(0, h / 2 + 0.25, 0.05, half * 2 + 0.2, h + 0.2, 0.1, '#e9dcc0');
    ctx.signs.place(b, keys[i % keys.length], 0, h / 2 + 0.25, 0.11, half * 2, h, 0.05);
    // colonia de gatos en el rincón (con su cuenco y su caja de cartón)
    if (i === 0) {
      const cz = w.z - 1.2;
      const cats: [number, number, number, string, 'sit' | 'loaf' | 'stretch'][] = [
        [-3.6, 0.4, 2.8, '#e8903a', 'sit'], [-1.8, -0.3, 3.4, '#2a2a2e', 'loaf'], [2.4, -0.1, -2.6, '#f2eee6', 'sit'], [3.9, 0.5, -3.3, '#8a8a90', 'stretch'],
      ];
      for (const [dx, dz, r, f, p] of cats) K.cat(b, x + dx, ctx.heightAt(x + dx, cz + dz), cz + dz, r, f, p, rng.chance(0.4) ? '#f2eee6' : undefined);
      b.frame(x + 0.6, ctx.heightAt(x + 0.6, cz - 1.2), cz - 1.2, 0);
      b.cyl(0, 0, 0, 0.16, 0.13, 0.08, 7, '#3f7fcf', true);
      b.cyl(0.4, 0, 0.1, 0.16, 0.13, 0.08, 7, '#e8394d', true);
      b.frame(x - 4.2, ctx.heightAt(x - 4.2, cz), cz + 0.2, 0.3);
      b.box(0, 0.25, 0, 0.7, 0.5, 0.5, '#c9955a');
      b.panelZ(0, 0.22, 0.251, 0.3, 0.3, '#3a2a14');
    }
  });
}

/** Más cosas en los callejones: farolillos, tendederos, macetas y gatos (entre los huecos de street.ts). */
function alleys(ctx: Ctx, g: Guard, rng: Rng) {
  const net = ctx.net;
  let cats = 0;
  for (let di = 0; di < net.defs.length; di++) {
    const def = net.defs[di];
    if (!def.alley) continue;
    const path = net.paths[di];
    const L = pathLength(path);
    let k = 0;
    for (let s = 8.5; s < L - 4; s += 7, k++) {
      const q = pathAt(path, s)!;
      const side = k % 2 ? -1 : 1;
      const nx = -q.dz * side, nz = q.dx * side;
      const wallLat = def.width / 2 + 0.5;
      const here = ctx.occ.get(q.x + nx * (wallLat + 0.6), q.z + nz * (wallLat + 0.6)) === OCC.BUILDING;
      const opp = ctx.occ.get(q.x - nx * (wallLat + 0.6), q.z - nz * (wallLat + 0.6)) === OCC.BUILDING;
      const gy = ctx.heightAt(q.x, q.z);
      const b = ctx.solid.at(q.x, q.z);
      const ax = q.x + nx * wallLat, az = q.z + nz * wallLat, cx = q.x - nx * wallLat, cz = q.z - nz * wallLat;
      const r = rng.next();
      if (here && opp && r < 0.24) {
        const y = gy + rng.range(5.7, 6.3);
        K.lanterns(b, ax, y, az, cx, y + rng.range(-0.3, 0.3), cz, 0.35, rng);
      } else if (here && opp && r < 0.42) {
        const y = gy + rng.range(4.7, 5.3);
        b.frame(0, 0, 0, 0);
        clothesline(b, rng, ax, y - 0.1, az, cx, y - 0.1, cz, 0.1, false);
        b.box(ax, y, az, 0.12, 0.12, 0.12, '#666');
        b.box(cx, y, cz, 0.12, 0.12, 0.12, '#666');
      } else if (here && r < 0.62) {
        const x = q.x + nx * (wallLat - 0.45), z = q.z + nz * (wallLat - 0.45);
        if (!g.near(x, z, -0.8)) ctx.props.add('pot', x, ctx.heightAt(x, z), z, rng.range(0, 6), rng.range(0.8, 1.05));
      }
      // algún gato pegado a la pared
      if (here && cats < 9 && rng.chance(0.09)) {
        const x = q.x + nx * (wallLat - 0.35) + q.dx * 1.2, z = q.z + nz * (wallLat - 0.35) + q.dz * 1.2;
        if (!g.near(x, z, -0.9)) {
          K.cat(b, x, ctx.heightAt(x, z), z, Math.atan2(-nx, -nz) + rng.range(-0.8, 0.8), rng.pick(K.FUR), rng.pick(['sit', 'loaf', 'sit', 'stretch'] as const), rng.chance(0.3) ? '#f2eee6' : undefined);
          cats++;
        }
      }
    }
  }
}

/** Guirnaldas de farolillos de fachada a fachada sobre la Calle Mayor del Viejo (bien altas: pasan camiones). */
function calleMayor(ctx: Ctx, rng: Rng) {
  const net = ctx.net;
  const di = net.defs.findIndex((d) => d.name === 'Calle Mayor del Viejo');
  if (di < 0) return;
  const path = net.paths[di];
  const L = pathLength(path);
  for (let s = 12; s < L - 8; s += 17) {
    const q = pathAt(path, s)!;
    const nx = -q.dz, nz = q.dx;
    // busca la fachada a cada lado
    const probe = (sgn: number) => {
      for (let d = 5; d < 14; d += 0.25) if (ctx.occ.get(q.x + nx * sgn * d, q.z + nz * sgn * d) === OCC.BUILDING) return d - 0.1;
      return -1;
    };
    const d1 = probe(1), d2 = probe(-1);
    if (d1 < 0 || d2 < 0) continue;
    const y = ctx.heightAt(q.x, q.z) + 6.6;
    const b = ctx.solid.at(q.x, q.z);
    K.lanterns(b, q.x + nx * d1, y, q.z + nz * d1, q.x - nx * d2, y, q.z - nz * d2, 0.8, rng, 1.0);
  }
}

/** Sillas "al fresco" junto a la puerta de algunas casas de los callejones (sin colisor: son de paja). */
function chairs(ctx: Ctx, g: Guard, lots: Lot[], rng: Rng) {
  let n = 0;
  for (const l of lots) {
    if (l.special || l.kind !== 'house' || districtRaw(l.x, l.z) !== 'viejo') continue;
    if (!(l.def >= 0 && ctx.net.defs[l.def]?.alley) || !rng.chance(0.14)) continue;
    const dx = l.meta.doorX ?? 0;
    const b = ctx.solid.at(l.x, l.z);
    let placed = 0;
    for (const side of [-1, 1]) {
      const p = lotPoint(l, dx + side * 1.05, l.hd + 0.42);
      const v = ctx.occ.get(p.x, p.z);
      if (v === OCC.BUILDING || g.near(p.x, p.z, -1.1)) continue;
      K.chair(b, p.x, ctx.heightAt(p.x, p.z), p.z, l.rot - side * 0.45, rng.pick(['#8a5a33', '#2f6f3a', '#2f5fa7']));
      placed++;
    }
    if (placed && rng.chance(0.35)) {
      const p = lotPoint(l, dx + 1.9, l.hd + 0.3);
      if (ctx.occ.get(p.x, p.z) !== OCC.BUILDING) K.cat(b, p.x, ctx.heightAt(p.x, p.z), p.z, l.rot + rng.range(-1, 1), rng.pick(K.FUR), 'loaf');
    }
    if (placed && ++n >= 16) break;
  }
}
