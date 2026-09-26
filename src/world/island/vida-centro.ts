// El Centro con más vida: terraza de café en la Plaza del Reembolso, mercadillo, estatua humana,
// palomas, macetones y gatos; pizarras con menús graciosos en la puerta de las tiendas.
import * as THREE from 'three';
import type { Ctx } from './ctx';
import type { Out } from './special';
import type { Guard } from './detalles';
import { lotPoint, Lot } from './layout';
import { OCC } from './occ';
import { districtRaw } from './plan';
import { stripedAwning, awningCollider } from './buildings';
import { Rng } from '../../core/rng';
import * as K from './kit';
import { definePizarras, definePuestos, PUESTOS } from './murales';
import type { GeoBuilder } from './geo';

const PLAZA = { x: 0, z: 32.5 };

/** Puesto de mercadillo con toldo (con colisores) y rótulo. rot: hacia donde está el cliente. */
export function marketStall(ctx: Ctx, x: number, z: number, rot: number, w: number, d: number, i: number, keys: string[], rng: Rng) {
  const y = ctx.heightAt(x, z);
  const b = ctx.solid.at(x, z);
  const p = PUESTOS[i % PUESTOS.length];
  K.stallFrame(b, x, y, z, rot, w, d, p.goods, rng, p.fish);
  // toldo de rayas desde los postes de atrás hacia delante (capa de toldos) y su colisor
  b.frame(x, y, z, rot);
  stripedAwning(b, 0, 2.55, -d / 2, w + 0.3, d + 0.5, 0.45, p.bg, '#f7f4ec', 6);
  awningCollider(ctx, b, 0, 2.55, -d / 2, w + 0.3, d + 0.5);
  ctx.signs.placeDouble(b, keys[i % keys.length], 0, 3.0, -d / 2 + 0.06, w - 0.12, (w - 0.12) * (0.45 / 2.6), 0.25);
  // la mesa se choca
  ctx.box(x, y + 0.45, z, w / 2, 0.45, d / 2, rot);
  ctx.foot.push({ x, z, hw: w / 2 + 0.15, hd: d / 2 + 0.25, rot, color: p.bg, height: 2.5, open: true });
}

export function vidaCentro(ctx: Ctx, out: Out, g: Guard, lots: Lot[], rng: Rng) {
  plaza(ctx, rng);
  chalkboards(ctx, g, lots, rng);
  void out;
}

function plaza(ctx: Ctx, rng: Rng) {
  const cx = PLAZA.x, cz = PLAZA.z;
  const y = ctx.heightAt(cx, cz);
  // ── terraza del café (lado este, entre los parterres) ──
  const umb = ['#9be29b', '#a0c8ff', '#ffe27a', '#ffb0c8'];
  let n = 0;
  for (const tx of [22.5, 27.5, 32.5]) {
    for (const tz of [27, 32.5, 38]) {
      const x = cx + tx, z = tz;
      ctx.props.add('barTable', x, ctx.heightAt(x, z), z, rng.range(-0.3, 0.3) + (n % 2 ? Math.PI / 2 : 0), 1);
      if (n % 2 === 0) ctx.props.add('umbrella', x, ctx.heightAt(x, z), z, rng.range(0, 6), 1.05, new THREE.Color(umb[(n / 2) % umb.length]));
      ctx.mapDots.push({ x, z, r: 1.2, color: '#c0392b' });
      n++;
    }
  }
  // pizarra de la terraza y un camarero de cartón (bueno, un cartel)
  const pz = definePizarras(ctx.signs);
  {
    const x = cx + 37.5, z = 32.5 + 3.2;
    const b = ctx.solid.at(x, z);
    easel(ctx, b, pz[2], x, ctx.heightAt(x, z), z, -Math.PI / 2);
  }
  // ── mercadillo en el lado norte (junto a los puestos de fruta) ──
  const keys = definePuestos(ctx.signs);
  const stallsX = [-36.5, -32.3, -28.1, -23.9];
  stallsX.forEach((sx, i) => marketStall(ctx, cx + sx, cz + 17.3, Math.PI, 3.6, 1.3, i, keys, rng));
  ctx.mapLabels.push({ x: cx - 30, z: cz + 22.5, text: 'Mercadillo', color: '#c0306a' });
  // ── estatua humana dorada (mirando a la fuente) ──
  {
    const x = cx - 22, z = 36.5;
    const yy = ctx.heightAt(x, z);
    const rot = Math.atan2(cx - x, cz - z);
    const b = ctx.solid.at(x, z);
    K.humanStatue(b, x, yy, z, rot);
    b.frame(x, yy, z, rot);
    ctx.signs.place(b, 'estatua', 0, 0.45, 0.42, 0.7, 0.2, 0);
    ctx.box(x, yy + 0.35, z, 0.42, 0.35, 0.42, rot);
    ctx.cyl(x, yy + 1.6, z, 0.9, 0.3);
    ctx.foot.push({ x, z, hw: 0.4, hd: 0.4, rot, color: '#e0b84a', height: 2 });
  }
  // ── palomas: un corrillo junto a un banco y alguna en la fuente ──
  const b = ctx.solid.at(cx, cz);
  for (let i = 0; i < 11; i++) {
    const a = rng.range(0.4, 2.6), r = rng.range(7.3, 8.4);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    K.pigeon(b, x, ctx.heightAt(x, z), z, rng.range(0, 6.28), rng.chance(0.5));
  }
  // migas de pan
  b.frame(cx, y, cz, 0);
  for (let i = 0; i < 10; i++) b.box(Math.cos(i * 1.9) * 7.8, 0.02, Math.sin(i * 1.3 + 0.4) * 1.5 + 7.8, 0.06, 0.03, 0.06, '#e8d09a');
  // una paloma en lo alto de la bola dorada de la fuente y otra en el borde
  K.pigeon(b, cx, y + 5.08, cz, 0.6, false);
  K.pigeon(b, cx + 4.5, y + 0.68, cz + 4.3, 2.2, true);
  // ── macetones con geranios en las esquinas ──
  for (const [dx, dz] of [[-39.3, -17.6], [39.3, -17.6], [39.3, 17.3]] as const) {
    const x = cx + dx, z = cz + dz;
    K.bigPot(b, x, ctx.heightAt(x, z), z, rng.pick(['#e8394d', '#f25c8c', '#ffffff']));
    ctx.cyl(x, ctx.heightAt(x, z) + 0.5, z, 0.5, 0.5);
  }
  // ── gatos: uno tomando el sol en un banco y otro vigilando las palomas ──
  {
    const a = (1 / 6) * Math.PI * 2, r = 9.2;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    K.cat(b, x, ctx.heightAt(x, z) + 0.5, z, Math.atan2(-Math.cos(a), -Math.sin(a)) + 1.3, '#e8903a', 'loaf');
    K.cat(b, cx + 3.2, ctx.heightAt(cx + 3.2, cz + 12) , cz + 12.2, Math.PI + 0.5, '#2a2a2e', 'sit');
  }
}

/** Pizarra de pie (caballete vertical con patas) con un texto del atlas por las dos caras. */
export function easel(ctx: Ctx, b: GeoBuilder, key: string, x: number, y: number, z: number, rot: number) {
  b.frame(x, y, z, rot);
  const wood = '#7a5230';
  b.box(0, 0.95, 0, 0.66, 0.9, 0.05, wood);
  for (const sx of [-0.27, 0.27]) {
    b.boxRot(sx, 0.5, 0.12, 0.05, 1.0, 0.05, 0.25, 0, 0, wood);
    b.boxRot(sx, 0.5, -0.12, 0.05, 1.0, 0.05, -0.25, 0, 0, wood);
  }
  ctx.signs.placeDouble(b, key, 0, 0.95, 0, 0.6, 0.8, 0.15);
}

/** Pizarras con menús y avisos graciosos en la acera, junto a la puerta de algunas tiendas. */
function chalkboards(ctx: Ctx, g: Guard, lots: Lot[], rng: Rng) {
  const keys = definePizarras(ctx.signs);
  let k = 0, placed = 0;
  for (const l of lots) {
    if (l.special || !l.meta.shop) continue;
    const d = districtRaw(l.x, l.z);
    if (d !== 'centro' && d !== 'puerto') continue;
    if (k++ % 2) continue;
    for (const side of rng.chance(0.5) ? [1, -1] : [-1, 1]) {
      const lx = side * (l.hw - 1.0);
      const p = lotPoint(l, lx, l.hd + 0.55);
      if (ctx.occ.get(p.x, p.z) !== OCC.WALK || !g.free(p.x, p.z, 0.45, [OCC.WALK])) continue;
      const y = ctx.heightAt(p.x, p.z);
      easel(ctx, ctx.solid.at(p.x, p.z), keys[placed % keys.length], p.x, y, p.z, l.rot + side * 0.35);
      g.protect(p.x, p.z, 0.6);
      placed++;
      break;
    }
    if (placed >= 14) break;
  }
}
