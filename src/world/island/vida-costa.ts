// La costa y La Colina con más vida: toallas, castillos de arena, balones, neveras, torres de socorrista
// y patines de pedales en las playas; flamencos de plástico, enanitos y patitos en las piscinas de los
// chalets; y el Parque de la Siesta (estanque con un pato gigante, columpios, merenderos) al suroeste.
import * as THREE from 'three';
import type { Ctx } from './ctx';
import type { Out } from './special';
import type { Guard } from './detalles';
import { OCC } from './occ';
import { Rng } from '../../core/rng';
import * as K from './kit';
import type { GeoBuilder } from './geo';

/** Parque de la Siesta (entre las casas del Paseo del Muelle y la playa del suroeste). */
export const PARK = { x: -202, z: 216, hw: 34, hd: 30 };

export function vidaCosta(ctx: Ctx, out: Out, g: Guard, rng: Rng) {
  beaches(ctx, g, rng);
  pools(ctx, rng);
  park(ctx, rng);
  void out;
}

const TOWELS = ['#e8394d', '#2f7fcf', '#ffd23f', '#3fae6a', '#ff6fb5', '#7c4dbb', '#ff8c2a', '#56c1e8'];

function beaches(ctx: Ctx, g: Guard, rng: Rng) {
  const list = ctx.props.list.get('umbrella') ?? [];
  const n = new THREE.Vector3();
  let k = 0, towers = 0, pedalos = 0;
  const pave = ctx.pave;
  for (const u of list.slice()) {
    const h = ctx.heightAt(u.x, u.z);
    if (h > 1.4 || Math.hypot(u.x, u.z) < 200) continue;
    ctx.mapDots.push({ x: u.x, z: u.z, r: 1.4, color: u.tint ? '#' + u.tint.getHexString() : '#e8394d' });
    ctx.terrain.normalAt(u.x, u.z, n);
    const toSea = Math.atan2(n.x, n.z);
    const fx = Math.sin(toSea), fz = Math.cos(toSea), rx = Math.cos(toSea), rz = -Math.sin(toSea);
    const b = ctx.solid.at(u.x, u.z);
    // toallas en la arena, hacia el mar
    if (rng.chance(0.75)) {
      for (const s of [-1, 1]) {
        if (s > 0 && rng.chance(0.35)) continue;
        const x = u.x + fx * 2.3 + rx * s * 0.8, z = u.z + fz * 2.3 + rz * s * 0.8;
        if (ctx.heightAt(x, z) < 0.55) continue;
        pave.rect(pave.paint, x, z, 0.42, 0.85, toSea + rng.range(-0.2, 0.2), rng.pick(TOWELS), 2);
      }
    }
    const r = rng.next();
    const px = u.x + fx * 3.6 + rx * rng.range(-1.5, 1.5), pz = u.z + fz * 3.6 + rz * rng.range(-1.5, 1.5);
    const ph = ctx.heightAt(px, pz);
    if (ph > 0.6) {
      if (r < 0.28) K.sandcastle(b, px, ph - 0.03, pz, rng.range(0, 6));
      else if (r < 0.5) {
        b.frame(px, ph, pz, 0);
        b.blob(0, 0.2, 0, 0.2, 0.2, 0.2, rng.pick(['#e8394d', '#2f7fcf', '#ffd23f']), 0, k);
        b.box(0, 0.2, 0, 0.41, 0.06, 0.06, '#ffffff');
      } else if (r < 0.65) {
        b.frame(u.x - fx * 1.2, h, u.z - fz * 1.2, toSea);
        b.box(0, 0.22, 0, 0.6, 0.44, 0.4, '#2f7fcf', SKIP_NY);
        b.box(0, 0.47, 0, 0.62, 0.08, 0.42, '#ffffff');
      }
    }
    // torre de socorrista cada tantas sombrillas
    if (k % 11 === 5 && towers < 4) {
      const x = u.x + rx * 6 - fx * 0.5, z = u.z + rz * 6 - fz * 0.5;
      const th = ctx.heightAt(x, z);
      if (th > 0.8 && th < 1.6 && !g.near(x, z, 2)) {
        K.lifeguard(b, x, th - 0.05, z, toSea, rng.pick(['#3fae4a', '#ffd23f', '#e8394d']));
        ctx.box(x, th + 1.1, z, 0.8, 1.1, 0.7, toSea);
        ctx.mapDots.push({ x, z, r: 1.6, color: '#e8394d' });
        g.protect(x, z, 2);
        towers++;
      }
    }
    // patín de pedales en la orilla
    if (k % 9 === 2 && pedalos < 4) {
      for (let d = 3; d < 14; d += 0.5) {
        const x = u.x + fx * d + rx * 3, z = u.z + fz * d + rz * 3;
        const wh = ctx.heightAt(x, z);
        if (wh < 0.45 && wh > 0.1) {
          K.pedalo(b, x, wh - 0.15, z, toSea + rng.range(-0.3, 0.3), rng.pick(['#ffffff', '#ffe27a', '#ff9fc0']));
          pedalos++;
          break;
        }
      }
    }
    k++;
  }
}

const SKIP_NY = 8;

/** Flamencos de plástico, enanitos y patitos de goma en las piscinas de los chalets. */
function pools(ctx: Ctx, rng: Rng) {
  for (const p of ctx.pools) {
    const ux = Math.cos(p.rot), uz = -Math.sin(p.rot), vx = Math.sin(p.rot), vz = Math.cos(p.rot);
    const y = ctx.heightAt(p.x, p.z);
    const b = ctx.solid.at(p.x, p.z);
    const at = (lx: number, lz: number) => ({ x: p.x + ux * lx + vx * lz, z: p.z + uz * lx + vz * lz });
    if (rng.chance(0.6)) {
      for (let i = 0; i < (rng.chance(0.5) ? 2 : 1); i++) {
        const q = at(-p.hw - 1.3 - i * 0.2, (i ? -0.6 : 0.5) * p.hd);
        if (ctx.occ.get(q.x, q.z) !== OCC.YARD) continue;
        K.flamingo(b, q.x, ctx.heightAt(q.x, q.z), q.z, p.rot + rng.range(0.5, 2.5));
      }
    }
    if (rng.chance(0.45)) {
      const q = at(-p.hw - 1.0, -p.hd - 0.9);
      if (ctx.occ.get(q.x, q.z) === OCC.YARD) K.gnome(b, q.x, ctx.heightAt(q.x, q.z), q.z, p.rot + Math.PI + rng.range(-0.5, 0.5));
    }
    if (rng.chance(0.55)) {
      const q = at(rng.range(-p.hw + 1, p.hw - 1), rng.range(-p.hd + 0.8, p.hd - 0.8));
      duck(b, q.x, y + 0.32, q.z, rng.range(0, 6.28), 1);
    }
  }
}

/** Patito de goma (s = escala: 1 = de bañera grande, 6 = el del estanque del parque). */
function duck(b: GeoBuilder, x: number, y: number, z: number, rot: number, s: number) {
  b.frame(x, y, z, rot);
  const yel = '#ffd23f';
  b.box(0, 0.09 * s, 0, 0.26 * s, 0.18 * s, 0.34 * s, yel);
  b.box(0, 0.15 * s, -0.16 * s, 0.14 * s, 0.1 * s, 0.1 * s, yel);
  b.box(0, 0.27 * s, 0.1 * s, 0.17 * s, 0.17 * s, 0.16 * s, yel);
  b.box(0, 0.25 * s, 0.22 * s, 0.1 * s, 0.05 * s, 0.1 * s, '#ff8c2a');
  for (const sx of [-1, 1]) b.box(sx * 0.086 * s, 0.3 * s, 0.14 * s, 0.01 * s, 0.035 * s, 0.035 * s, '#1b1b1b');
}

function park(ctx: Ctx, rng: Rng) {
  const cx = -202, cz = 214;
  const pave = ctx.pave;
  const H = (x: number, z: number) => ctx.heightAt(x, z);
  const PATH = '#e6d5ae';
  // césped (en el mapa), caminos y plazoleta del estanque
  ctx.paved.push({ x: -199, z: 214, hw: 29, hd: 26, rot: 0, color: '#a8d77e' });
  pave.rect(pave.walk, -198.5, cz, 32.5, 1.6, 0, PATH, 2);
  pave.rect(pave.walk, cx, 215, 1.6, 28, 0, PATH, 2);
  pave.disc(pave.walk, cx, cz, 9, PATH, 24);
  ctx.paved.push({ x: -198.5, z: cz, hw: 32.5, hd: 1.6, rot: 0, color: PATH });
  ctx.paved.push({ x: cx, z: 215, hw: 1.6, hd: 28, rot: 0, color: PATH });
  // estanque con bordillo de piedra, patos y el Pato Gigante
  const y = H(cx, cz);
  const b = ctx.solid.at(cx, cz);
  pave.disc(pave.paint, cx, cz, 5.6, '#46b2dc', 20);
  b.frame(cx, y, cz, 0);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    b.box(Math.cos(a) * 5.85, 0.14, Math.sin(a) * 5.85, 0.5, 0.36, 2.35, '#d9d0bd', SKIP_NY, undefined, -a);
  }
  duck(b, cx, y - 0.1, cz, 0.7, 6.5);
  ctx.cyl(cx, y + 1, cz, 1, 1.2);
  for (let i = 0; i < 4; i++) {
    const a = 1.1 + i * 1.4, r = 3.3 + (i % 2) * 0.8;
    b.frame(cx + Math.cos(a) * r, y + 0.03, cz + Math.sin(a) * r, a + Math.PI / 2);
    b.box(0, 0.1, 0, 0.18, 0.14, 0.3, i % 2 ? '#8a6a4a' : '#f4f4f0');
    b.box(0, 0.22, 0.12, 0.1, 0.12, 0.1, i % 2 ? '#2f7f5a' : '#f4f4f0');
    b.box(0, 0.2, 0.2, 0.06, 0.03, 0.08, '#ff8c2a');
  }
  ctx.mapDots.push({ x: cx, z: cz, r: 5.6, color: '#46b2dc' });
  // columpios, tobogán, balancín y carrito de helados
  const px = -187, pz = 199;
  pave.disc(pave.paint, px, pz, 6.5, '#ecd9a4', 18);
  ctx.mapDots.push({ x: px, z: pz, r: 6.5, color: '#ecd9a4' });
  K.swings(b, px - 2.5, H(px - 2.5, pz - 1.5), pz - 1.5, 0);
  for (const sx of [-1.6, 1.6]) ctx.cyl(px - 2.5 + sx, H(px, pz) + 1.1, pz - 1.5, 1.1, 0.12);
  K.slide(b, px + 3.2, H(px + 3.2, pz + 2), pz + 2, -Math.PI / 2 + 0.3);
  ctx.box(px + 3.2 + Math.sin(-Math.PI / 2 + 0.3) * -1.2, H(px, pz) + 0.5, pz + 2 + Math.cos(-Math.PI / 2 + 0.3) * -1.2, 0.45, 0.5, 0.45, -Math.PI / 2 + 0.3);
  K.seesaw(b, px - 2, H(px - 2, pz + 3.8), pz + 3.8, 0.4 + Math.PI / 2);
  {
    const x = -196.5, z = 205.5, yy = H(x, z);
    b.frame(x, yy, z, 0.5);
    b.box(0, 0.75, 0, 1.6, 0.8, 0.9, '#f4f4f0');
    b.box(0, 0.75, 0.46, 1.4, 0.5, 0.02, '#8fd3f0');
    b.box(0, 1.2, 0, 1.65, 0.1, 0.95, '#f58ab0');
    for (const [sx, sz] of [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.4], [0.6, 0.4]]) b.cyl(sx, 0, sz, 0.18, 0.18, 0.36, 6, '#2a2a2e', true);
    b.boxRot(1.05, 0.95, 0, 0.9, 0.05, 0.05, 0, 0, 0.4, '#aaaaaa');
    ctx.props.add('umbrella', x - 0.2, yy + 0.2, z, 0.3, 0.8, new THREE.Color('#8fd3f0'));
    ctx.box(x, yy + 0.6, z, 0.85, 0.6, 0.5, 0.5);
  }
  // merenderos (con un gato durmiendo en uno)
  const tables: [number, number, number][] = [[-222, 202, 0.3], [-226, 226, -0.2], [-214, 234, 1.2]];
  tables.forEach(([x, z, r], i) => {
    if (H(x, z) < 1.6) return;
    K.picnicTable(b, x, H(x, z), z, r);
    ctx.box(x, H(x, z) + 0.4, z, 0.95, 0.4, 0.95, r);
    if (i === 1) K.cat(b, x + 0.2, H(x, z) + 0.78, z, r + 1.2, '#8a8a90', 'loaf', '#f2eee6');
  });
  // bancos y farolas a lo largo de los caminos
  const benches: [number, number, number][] = [[-222, 212.1, 0], [-186, 215.9, Math.PI], [-212, 215.9, Math.PI], [-205.9, 196, Math.PI / 2], [-198.1, 232, -Math.PI / 2], [-176, 212.1, 0]];
  for (const [x, z, r] of benches) ctx.props.add('bench', x, H(x, z), z, r, 1);
  for (const [x, z] of [[-219, 216.3], [-189, 211.7], [-206.3, 199], [-197.7, 229], [-173, 216.3]]) ctx.props.add('lampOld', x, H(x, z), z, 0, 1);
  // árboles bien puestos (los sueltos no caen aquí: la zona está reservada)
  const trees: [number, number, 'pine' | 'palm' | 'orange' | 'olive'][] = [
    [-226, 196, 'pine'], [-231, 208, 'pine'], [-217, 193, 'olive'], [-177, 226, 'pine'], [-182, 238, 'pine'], [-195, 240, 'palm'],
    [-214, 224, 'palm'], [-190, 226, 'orange'], [-173, 197, 'palm'], [-196, 190, 'orange'], [-226, 219, 'orange'], [-211, 205, 'olive'],
    [-184, 190, 'palm'], [-221, 237, 'palm'], [-170, 232, 'olive'],
  ];
  for (const [x, z, t] of trees) {
    if (H(x, z) < 1.7) continue;
    ctx.props.add(t, x, H(x, z) - 0.05, z, rng.range(0, 6.28), rng.range(0.9, 1.15));
  }
  // cartel en la entrada del este (viniendo del puerto)
  {
    const x = -167.5, z = 210.6, yy = H(x, z);
    b.frame(x, yy, z, Math.PI / 2);
    for (const sx of [-1.2, 1.2]) b.box(sx, 1.1, 0, 0.12, 2.2, 0.12, '#6b4a32');
    ctx.signs.placeDouble(b, 'parque', 0, 1.75, 0, 2.6, 0.9, 0.1);
    ctx.cyl(x, yy + 1.1, z - 1.2, 1.1, 0.08);
    ctx.cyl(x, yy + 1.1, z + 1.2, 1.1, 0.08);
  }
  ctx.mapLabels.push({ x: -202, z: 226, text: 'Parque de la Siesta', color: '#2f6f3a' });
}
