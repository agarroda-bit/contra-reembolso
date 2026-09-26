// Edificios genéricos: bloques del Centro, casas encaladas del Viejo, chalets de la Colina y naves.
// Todo va a las mallas fusionadas por trozos (sólido + ventanas). Un colisor de caja por edificio.
import * as THREE from 'three';
import { GeoBuilder, SKIP, lin, Col } from './geo';
import type { Ctx } from './ctx';
import { Lot, lotPoint } from './layout';
import { OCC } from './occ';
import { Rng } from '../../core/rng';
import { shopSign, FONT_FUN, FONT, FONT_SERIF, FONT_IMPACT, fitText, roundRect } from './signs';
import { SHOPS, CHALET_NAMES, NAVE_COMPANIES } from './names';
import { adSign } from './ads';

export const PAL = {
  facade: ['#e07a4f', '#e8b448', '#f4a582', '#f3ede2', '#8fc9e3', '#9fd9b9', '#f2b4bd', '#dca45f', '#bfa8e0', '#f5e1b3', '#e9967a', '#b5d86f'],
  viejo: ['#f7f4ec', '#f7f4ec', '#f7f4ec', '#fbf2dc', '#f9e0e3', '#dff0f7', '#e5f3dc', '#fdf0c4', '#f7f4ec'],
  zocalo: ['#2f6fb0', '#e3a933', '#8a8f96', '#3f8f5a', '#c0563b', '#5a4a8a'],
  shutter: ['#3f7d4a', '#2f6fb0', '#7a4f2e', '#f3efe6', '#b33a2e', '#2f8f8a', '#d9a23a'],
  doorWood: ['#7a4f2e', '#5e3b22', '#2f6fb0', '#3f7d4a', '#b33a2e', '#2f8f8a', '#d9a23a'],
  awning: [['#e8394d', '#f7f4ec'], ['#2f7fcf', '#f7f4ec'], ['#3f9a5a', '#f7f4ec'], ['#f2a93b', '#f7f4ec'], ['#7c4dbb', '#f7f4ec'], ['#e8394d', '#f2a93b'], ['#1f9e9a', '#fbe7a1']],
  roofTile: ['#c65f36', '#b85532', '#d06d3c', '#a94e30'],
  roofFlat: ['#cdbfa9', '#c4b7a3', '#d6c8b0', '#bdb3a3'],
  nave: ['#9fb3c8', '#c9c2a8', '#a9c7a0', '#d0b48a', '#8a9bb0', '#e0d6c2', '#b7c9d6', '#d9a57a'],
  chalet: ['#fbf6ec', '#f7e6c8', '#f5d0c0', '#fdf3d6', '#e8f0e0', '#f9e3e8'],
};

const GLASS_A = lin('#2b4660').clone();
const GLASS_B = lin('#5d86a8').clone();
const WIN_WARM = ['#ffd27a', '#ffc15e', '#ffe3a3', '#ffb35c', '#fff0c8', '#bfe0ff'];

/** Emisión de una ventana: color cálido + umbral (se enciende cuando la noche lo supera). */
function winEmit(rng: Rng, shop = false): number[] {
  const c = lin(rng.pick(WIN_WARM));
  const th = shop ? rng.range(0.02, 0.25) : rng.range(0.08, 1.45);
  return [c.r, c.g, c.b, th];
}

/** Cristal de ventana (dos triángulos con reflejo) en el marco local, plano z = zf. */
export function glass(w: GeoBuilder, x: number, y: number, zf: number, ww: number, wh: number, emit: number[], a = GLASS_A, bcol = GLASS_B) {
  const x0 = x - ww / 2, x1 = x + ww / 2, y0 = y - wh / 2, y1 = y + wh / 2;
  w.triL(x0, y0, zf, x1, y0, zf, x0, y1, zf, a, emit);
  w.triL(x1, y0, zf, x1, y1, zf, x0, y1, zf, bcol, emit);
}

/** Pone el marco del constructor en la fachada k del solar (0 frente, 1 derecha, 2 detrás, 3 izquierda). */
export function facadeFrame(b: GeoBuilder, lot: Lot, k: number, y = lot.h): { half: number; dist: number } {
  const ang = lot.rot + (k * Math.PI) / 2;
  const dist = k % 2 === 0 ? lot.hd : lot.hw;
  const half = k % 2 === 0 ? lot.hw : lot.hd;
  b.frame(lot.x + Math.sin(ang) * dist, y, lot.z + Math.cos(ang) * dist, ang);
  return { half, dist };
}

/** ¿La fachada k da a un espacio abierto (no pegada a otro edificio)? */
export function exposed(ctx: Ctx, lot: Lot, k: number, probe = 1.6): boolean {
  if (k === 0) return true;
  const ang = lot.rot + (k * Math.PI) / 2;
  const dist = (k % 2 === 0 ? lot.hd : lot.hw) + probe;
  const half = k % 2 === 0 ? lot.hw : lot.hd;
  const fx = Math.sin(ang), fz = Math.cos(ang);
  const rx = Math.cos(ang), rz = -Math.sin(ang);
  let open = 0, n = 0;
  for (let t = -0.8; t <= 0.81; t += 0.4) {
    const x = lot.x + fx * dist + rx * half * t, z = lot.z + fz * dist + rz * half * t;
    const v = ctx.occ.get(x, z);
    n++;
    if (v !== OCC.BUILDING && v !== OCC.WATER) open++;
  }
  return open / n > 0.5;
}

/** Base del edificio: cuánto hay que bajar para tapar el terreno bajo el solar. */
export function baseDepth(ctx: Ctx, lot: Lot, margin = 0.3): number {
  const [mn] = ctx.terrain.rangeUnder(lot.x, lot.z, lot.hw + margin, lot.hd + margin, lot.rot);
  return Math.min(0, mn - lot.h) - 0.6;
}

function hash01(i: number) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ───────────────────────── Tejados y azoteas ─────────────────────────

export function flatRoof(b: GeoBuilder, ctx: Ctx, hw: number, hd: number, H: number, roofCol: Col | THREE.Color, parapetCol: Col | THREE.Color, rng: Rng, props = true, parapetH = 0.9) {
  b.quadL(-hw, H, hd, hw, H, hd, hw, H, -hd, -hw, H, -hd, roofCol);
  const t = 0.25;
  const ph = parapetH;
  b.box(0, H + ph / 2, hd - t / 2, hw * 2, ph, t, parapetCol, SKIP.NY);
  b.box(0, H + ph / 2, -hd + t / 2, hw * 2, ph, t, parapetCol, SKIP.NY);
  b.box(hw - t / 2, H + ph / 2, 0, t, ph, hd * 2 - 2 * t, parapetCol, SKIP.NY | SKIP.PZ | SKIP.NZ);
  b.box(-hw + t / 2, H + ph / 2, 0, t, ph, hd * 2 - 2 * t, parapetCol, SKIP.NY | SKIP.PZ | SKIP.NZ);
  if (!props) return;
  const n = rng.int(1, 3);
  const used: number[][] = [];
  const spot = (sx: number, sz: number): number[] | null => {
    for (let tries = 0; tries < 6; tries++) {
      const x = rng.range(-hw + sx / 2 + 0.6, hw - sx / 2 - 0.6), z = rng.range(-hd + sz / 2 + 0.6, hd - sz / 2 - 0.6);
      if (hw * 2 < sx + 1.4 || hd * 2 < sz + 1.4) return null;
      if (used.every((u) => Math.abs(u[0] - x) > (u[2] + sx) / 2 + 0.3 || Math.abs(u[1] - z) > (u[3] + sz) / 2 + 0.3)) {
        used.push([x, z, sx, sz]);
        return [x, z];
      }
    }
    return null;
  };
  for (let i = 0; i < n; i++) {
    const r = rng.next();
    if (r < 0.3) {
      // depósito de agua
      const p = spot(1.8, 1.8);
      if (!p) continue;
      b.box(p[0], H + 0.25, p[1], 1.3, 0.5, 1.3, '#8b8f96');
      b.cyl(p[0], H + 0.5, p[1], 0.75, 0.75, 1.5, 8, rng.pick(['#f1efe8', '#3b4048', '#d8d3c6', '#5d7fa6']), true);
    } else if (r < 0.5) {
      // caseta de la escalera
      const p = spot(2.8, 2.6);
      if (!p) continue;
      b.box(p[0], H + 1.2, p[1], 2.6, 2.4, 2.4, parapetCol, SKIP.NY);
      b.box(p[0], H + 2.45, p[1], 2.8, 0.12, 2.6, '#9a9a9a');
      b.panelZ(p[0], H + 1.0, p[1] + 1.21, 0.9, 2.0, '#6a4a32');
    } else if (r < 0.7) {
      // aire acondicionado
      const p = spot(1.2, 0.8);
      if (!p) continue;
      b.box(p[0], H + 0.35, p[1], 1.0, 0.7, 0.6, '#d9dcdf');
      b.panelZ(p[0] + 0.15, H + 0.35, p[1] + 0.31, 0.45, 0.45, '#6f757c');
    } else if (r < 0.85) {
      // antena
      const p = spot(0.6, 0.6);
      if (!p) continue;
      b.cyl(p[0], H, p[1], 0.04, 0.04, 3.2, 4, '#6c7078', false);
      b.box(p[0], H + 2.6, p[1], 1.4, 0.05, 0.05, '#6c7078');
      b.box(p[0], H + 2.2, p[1], 1.0, 0.05, 0.05, '#6c7078');
      b.box(p[0], H + 3.0, p[1], 0.8, 0.05, 0.05, '#6c7078');
    } else {
      // tendedero en la azotea
      const p = spot(3.4, 1.2);
      if (!p) continue;
      clothesline(b, rng, p[0] - 1.6, H, p[1], p[0] + 1.6, H, p[1], 1.6);
    }
  }
}

/** Tendedero entre dos puntos locales (con postes si `poles`). */
export function clothesline(b: GeoBuilder, rng: Rng, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hLine: number, poles = true) {
  const yl0 = y0 + hLine, yl1 = y1 + hLine;
  if (poles) {
    b.box(x0, y0 + hLine / 2, z0, 0.06, hLine, 0.06, '#8d8f93');
    b.box(x1, y1 + hLine / 2, z1, 0.06, hLine, 0.06, '#8d8f93');
  }
  const dx = x1 - x0, dz = z1 - z0;
  const L = Math.hypot(dx, dz);
  const ang = Math.atan2(dz, dx);
  // cuerda
  b.beam(b.wx(x0, z0), b.wy(yl0), b.wz(x0, z0), b.wx(x1, z1), b.wy(yl1), b.wz(x1, z1), 0.03, '#eeeeee');
  const n = Math.max(2, Math.floor(L / 0.9));
  const cols = ['#e8394d', '#2f7fcf', '#f2d13b', '#ffffff', '#3fae6a', '#f58ab0', '#7c4dbb', '#ff8c2a', '#56c1e8'];
  for (let i = 0; i < n; i++) {
    if (rng.chance(0.25)) continue;
    const t = (i + 0.5) / n;
    const x = x0 + dx * t, z = z0 + dz * t;
    const y = yl0 + (yl1 - yl0) * t - 0.05 - Math.sin(t * Math.PI) * 0.12;
    const w = rng.range(0.4, 0.7), h = rng.range(0.4, 0.8);
    const c = rng.pick(cols);
    const ux = Math.cos(ang), uz = -Math.sin(ang);
    // prenda a dos caras
    const ax = x - (dx / L) * w / 2, az = z - (dz / L) * w / 2, bx = x + (dx / L) * w / 2, bz = z + (dz / L) * w / 2;
    void ux;
    void uz;
    b.quadL(ax, y - h, az, bx, y - h, bz, bx, y, bz, ax, y, az, c);
    b.quadL(bx, y - h, bz, ax, y - h, az, ax, y, az, bx, y, bz, c);
  }
}

/** Tejado de tejas a cuatro o dos aguas con alero. */
export function tiledRoof(b: GeoBuilder, hw: number, hd: number, H: number, rng: Rng, wallCol: Col, color?: string, pitch = 0.42) {
  const c = color ?? rng.pick(PAL.roofTile);
  const eave = 0.35;
  const w = hw * 2 + eave * 2, d = hd * 2 + eave * 2;
  const h = Math.min(w, d) * 0.5 * pitch;
  b.box(0, H - 0.08, 0, w, 0.16, d, '#b8a58c', SKIP.PY);
  b.roof(0, H, 0, w, d, h, c, wallCol as string, rng.chance(0.35));
  return h;
}

// ───────────────────────── Bloque urbano (Centro, Puerto) ─────────────────────────

export interface UrbanOpts {
  floors: number;
  color?: string;
  shop?: boolean;
  shopName?: string;
  roof?: boolean;
  tiled?: boolean;
  /** Índice de anuncio para una valla en la azotea. */
  roofAd?: number;
}

export function urban(ctx: Ctx, lot: Lot, o: UrbanOpts) {
  const rng = ctx.rng;
  const b = ctx.solid.at(lot.x, lot.z);
  const w = ctx.win.at(lot.x, lot.z);
  const col = o.color ?? rng.pick(PAL.facade);
  const dark = lin(col).clone().multiplyScalar(0.72);
  const trim = rng.chance(0.5) ? '#f4efe6' : lin(col).clone().multiplyScalar(0.85);
  const y0 = baseDepth(ctx, lot);
  const gf = 4.2, fh = 3.15;
  const H = gf + (o.floors - 1) * fh;
  const hw = lot.hw, hd = lot.hd;
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  b.box(0, (y0 + H) / 2, 0, hw * 2, H - y0, hd * 2, col, SKIP.NY | SKIP.PY);
  const tiled = o.tiled ?? false;
  if (tiled) tiledRoof(b, hw, hd, H, rng, col);
  else flatRoof(b, ctx, hw, hd, H, rng.pick(PAL.roofFlat), trim, rng, o.roofAd === undefined);
  if (o.roofAd !== undefined && !tiled) {
    // valla publicitaria en la azotea, mirando a la calle
    const key = adSign(ctx, o.roofAd);
    const bw = Math.min(hw * 2 - 1.5, 9), bh = (bw * 3) / 8;
    const zc = hd - 2.2;
    b.frame(lot.x, lot.h, lot.z, lot.rot);
    for (const px of [-bw / 2 + 0.6, bw / 2 - 0.6]) b.box(px, H + 1.4, zc - 0.25, 0.25, 2.8, 0.25, '#5a5f66');
    b.box(0, H + 2.5 + bh / 2, zc - 0.32, bw + 0.3, bh + 0.3, 0.2, '#e8e8e8');
    ctx.signs.place(b, key, 0, H + 2.5 + bh / 2, zc - 0.21, bw, bh, 0.3);
  }
  const style = rng.pick(['balcon', 'balcon', 'ventana', 'mixto']);
  const shutter = rng.pick(PAL.shutter);
  const blind = rng.chance(0.5);
  for (let k = 0; k < 4; k++) {
    if (!exposed(ctx, lot, k)) continue;
    const { half } = facadeFrame(b, lot, k);
    facadeFrame(w, lot, k);
    const front = k === 0;
    // zócalo, franja entre plantas y cornisa
    b.panelZ(0, (y0 + 0.7) / 2, 0.03, half * 2 + 0.02, 0.7 - y0, dark);
    b.box(0, gf - 0.1, 0.08, half * 2 + 0.1, 0.22, 0.16, trim, SKIP.NZ);
    b.box(0, H - 0.2, 0.12, half * 2 + 0.24, 0.3, 0.24, trim, SKIP.NZ);
    const n = Math.max(1, Math.floor((half * 2 - 0.8) / 3.0));
    const sp = (half * 2) / n;
    // planta baja
    if (front && o.shop) shopfront(ctx, b, w, half, gf, rng, o.shopName, lot);
    else {
      for (let i = 0; i < n; i++) {
        const x = -half + sp * (i + 0.5);
        if (front && i === Math.floor(n / 2)) {
          portal(b, x, rng);
        } else {
          glass(w, x, 1.9, 0.04, 1.2, 1.5, winEmit(rng));
          grille(b, x, 1.9, 0.07, 1.2, 1.5);
        }
      }
    }
    // plantas altas (la fachada principal con todo el detalle; las demás, solo ventanas)
    for (let f = 1; f < o.floors; f++) {
      const yb = gf + (f - 1) * fh;
      for (let i = 0; i < n; i++) {
        const x = -half + sp * (i + 0.5);
        if (!front) {
          glass(w, x, yb + 1.6, 0.04, 1.2, 1.5, winEmit(rng));
          if (blind) b.panelZ(x, yb + 2.35 - 0.3, 0.07, 1.2, 0.5, '#efe7d6');
          continue;
        }
        const bal = style === 'balcon' || (style === 'mixto' && (f + i) % 2 === 0);
        if (bal) {
          glass(w, x, yb + 1.2, 0.04, 1.2, 2.2, winEmit(rng));
          if (blind) b.panelZ(x, yb + 2.3 - 0.35, 0.07, 1.2, 0.7, '#efe7d6');
          else {
            b.panelZ(x - 0.95, yb + 1.2, 0.06, 0.62, 2.2, shutter);
            b.panelZ(x + 0.95, yb + 1.2, 0.06, 0.62, 2.2, shutter);
          }
          balcony(b, x, yb, 2.3, 0.85, rng, f === 1 && rng.chance(0.3));
        } else {
          glass(w, x, yb + 1.6, 0.04, 1.2, 1.5, winEmit(rng));
          b.box(x, yb + 0.8, 0.1, 1.5, 0.1, 0.2, trim, SKIP.NZ | SKIP.NY);
          if (blind) b.panelZ(x, yb + 2.35 - 0.3, 0.07, 1.2, 0.5, '#efe7d6');
          else {
            b.panelZ(x - 0.92, yb + 1.6, 0.06, 0.6, 1.5, shutter);
            b.panelZ(x + 0.92, yb + 1.6, 0.06, 0.6, 1.5, shutter);
          }
        }
      }
    }
  }
  ctx.box(lot.x, lot.h + (y0 + H) / 2, lot.z, hw, (H - y0) / 2, hd, lot.rot);
  ctx.foot.push({ x: lot.x, z: lot.z, hw, hd, rot: lot.rot, color: col, height: H });
  lot.meta.height = H;
  lot.meta.color = col;
}

function portal(b: GeoBuilder, x: number, rng: Rng) {
  b.panelZ(x, 1.35, 0.04, 1.8, 2.7, '#3a2a20');
  b.panelZ(x, 1.3, 0.06, 1.5, 2.5, rng.pick(PAL.doorWood));
  b.panelZ(x, 2.85, 0.07, 2.0, 0.25, '#e9e1d0');
  b.box(x, 0.06, 0.35, 2.0, 0.12, 0.7, '#cfc6b8');
}

/** Reja de ventana de planta baja. */
function grille(b: GeoBuilder, x: number, y: number, zf: number, ww: number, wh: number) {
  const c = '#26282c';
  b.panelZ(x, y + wh / 2, zf, ww + 0.1, 0.06, c);
  b.panelZ(x, y - wh / 2, zf, ww + 0.1, 0.06, c);
  for (let i = 0; i <= 4; i++) b.panelZ(x - ww / 2 + (ww * i) / 4, y, zf, 0.05, wh, c);
}

/** Balcón: losa, barandilla de barrotes y, a veces, macetas. */
function balcony(b: GeoBuilder, x: number, yb: number, w: number, d: number, rng: Rng, awning: boolean) {
  const iron = '#2a2c31';
  b.box(x, yb + 0.07, d / 2, w, 0.14, d, '#d8d2c6', SKIP.NZ);
  b.box(x, yb + 1.02, d - 0.03, w, 0.05, 0.06, iron, SKIP.NZ | SKIP.NY);
  const nb = 5;
  for (let i = 0; i <= nb; i++) {
    const bx = x - w / 2 + 0.03 + ((w - 0.06) * i) / nb;
    b.quadL(bx - 0.025, yb + 0.14, d - 0.03, bx + 0.025, yb + 0.14, d - 0.03, bx + 0.025, yb + 1.0, d - 0.03, bx - 0.025, yb + 1.0, d - 0.03, iron);
  }
  for (const s of [-1, 1]) {
    const sx = x + s * (w / 2 - 0.03);
    b.quadL(sx, yb + 0.95, s > 0 ? d : 0, sx, yb + 0.95, s > 0 ? 0 : d, sx, yb + 1.05, s > 0 ? 0 : d, sx, yb + 1.05, s > 0 ? d : 0, iron);
  }
  if (rng.chance(0.4)) {
    const px = x + rng.range(-w / 2 + 0.3, w / 2 - 0.3);
    b.box(px, yb + 0.35, d - 0.3, 0.3, 0.3, 0.3, '#c8643b', SKIP.NY);
    b.box(px, yb + 0.58, d - 0.3, 0.36, 0.2, 0.36, rng.pick(['#e8394d', '#f25c8c', '#4f8f3f']), SKIP.NY);
  }
  if (awning) {
    const [c1, c2] = rng.pick(PAL.awning);
    stripedAwning(b, x, yb + 2.75, 0, w + 0.2, 1.0, 0.6, c1, c2, 5);
  }
}

/** Toldo a rayas: sale de la fachada (z = z0) en y = y0 hasta z0+depth bajando drop. */
export function stripedAwning(b: GeoBuilder, x: number, y0: number, z0: number, w: number, depth: number, drop: number, c1: Col, c2: Col, stripes = 6) {
  const y1 = y0 - drop, z1 = z0 + depth;
  for (let i = 0; i < stripes; i++) {
    const xa = x - w / 2 + (w * i) / stripes, xb = x - w / 2 + (w * (i + 1)) / stripes;
    const c = i % 2 ? c2 : c1;
    b.quadL(xa, y1, z1, xb, y1, z1, xb, y0, z0, xa, y0, z0, c);
    b.quadL(xb, y1 - 0.01, z1, xa, y1 - 0.01, z1, xa, y0 - 0.01, z0, xb, y0 - 0.01, z0, lin(c).clone().multiplyScalar(0.8));
    // faldón
    b.quadL(xa, y1 - 0.3, z1, xb, y1 - 0.3, z1, xb, y1, z1, xa, y1, z1, c);
    b.quadL(xb, y1 - 0.3, z1 - 0.01, xa, y1 - 0.3, z1 - 0.01, xa, y1, z1 - 0.01, xb, y1, z1 - 0.01, c);
  }
}

/** Escaparate de planta baja con toldo y rótulo. */
function shopfront(ctx: Ctx, b: GeoBuilder, w: GeoBuilder, half: number, gf: number, rng: Rng, name: string | undefined, lot: Lot) {
  const frame = rng.pick(['#2d3138', '#5a3a28', '#f4efe6', '#1f4d3a', '#7a1f2b']);
  const W = half * 2;
  b.panelZ(0, gf / 2 - 0.05, 0.035, W, gf - 0.1, frame);
  const shop = name ? SHOPS.find((s) => s.name === name) ?? rng.pick(SHOPS) : rng.pick(SHOPS);
  // cristaleras
  const doorX = rng.range(-half * 0.4, half * 0.4);
  const panes = Math.max(2, Math.floor(W / 2.6));
  const emit = winEmit(rng, true);
  for (let i = 0; i < panes; i++) {
    const x0 = -half + 0.35 + ((W - 0.7) * i) / panes, x1 = -half + 0.35 + ((W - 0.7) * (i + 1)) / panes;
    const cx = (x0 + x1) / 2;
    if (Math.abs(cx - doorX) < (x1 - x0) / 2) {
      glass(w, cx, 1.35, 0.05, x1 - x0 - 0.3, 2.5, emit, lin('#2a3a48').clone(), lin('#4a6a84').clone());
      b.panelZ(cx, 1.35, 0.07, 0.08, 2.5, frame);
    } else glass(w, cx, 1.75, 0.05, x1 - x0 - 0.2, 2.0, emit, lin('#35526b').clone(), lin('#79a4c4').clone());
  }
  // rótulo
  const key = 'shop:' + shop.name;
  ctx.signs.define(key, 4.4, 0.9, shopSign(shop.bg, shop.fg, shop.name, shop.sub, shop.font ?? FONT_FUN));
  const sw = Math.min(W - 0.8, 5.2);
  const [c1, c2] = shop.awning ?? rng.pick(PAL.awning);
  if (rng.chance(0.75)) {
    stripedAwning(b, 0, 3.1, 0.05, W - 0.4, 1.6, 0.55, c1, c2, Math.max(4, Math.round(W / 1.2)));
    ctx.signs.place(b, key, 0, 3.72, 0.08, sw, sw * (0.9 / 4.4), 0.35);
  } else {
    ctx.signs.place(b, key, 0, 3.55, 0.08, sw, sw * (0.9 / 4.4), 0.35);
  }
  lot.meta.shop = shop.name;
}

// ───────────────────────── Casa del Barrio Viejo ─────────────────────────

export function house(ctx: Ctx, lot: Lot, o: { floors: number; flatRoof?: boolean }) {
  const rng = ctx.rng;
  const b = ctx.solid.at(lot.x, lot.z);
  const w = ctx.win.at(lot.x, lot.z);
  const col = rng.pick(PAL.viejo);
  const zc = rng.pick(PAL.zocalo);
  const y0 = baseDepth(ctx, lot);
  const fh = 3.0;
  const H = o.floors * fh + 0.3;
  const hw = lot.hw, hd = lot.hd;
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  b.box(0, (y0 + H) / 2, 0, hw * 2, H - y0, hd * 2, col, SKIP.NY | SKIP.PY);
  const flat = o.flatRoof ?? rng.chance(0.55);
  if (flat) flatRoof(b, ctx, hw, hd, H, rng.pick(PAL.roofFlat), col, rng, true, 0.8);
  else tiledRoof(b, hw, hd, H, rng, col);
  lot.meta.flat = flat;
  const wood = rng.pick(PAL.doorWood);
  const shutter = rng.pick(PAL.shutter);
  for (let k = 0; k < 4; k++) {
    if (!exposed(ctx, lot, k)) continue;
    const { half } = facadeFrame(b, lot, k);
    facadeFrame(w, lot, k);
    const front = k === 0;
    // zócalo pintado
    b.panelZ(0, (y0 + 0.9) / 2, 0.03, half * 2 + 0.02, 0.9 - y0, zc);
    // cornisa sencilla
    b.box(0, H - 0.1, 0.07, half * 2 + 0.14, 0.2, 0.14, lin(col).clone().multiplyScalar(0.9), SKIP.NZ);
    const n = Math.max(1, Math.floor((half * 2 - 0.6) / 2.8));
    const sp = (half * 2) / n;
    const doorI = front ? Math.min(n - 1, Math.floor(rng.range(0, n))) : -1;
    for (let f = 0; f < o.floors; f++) {
      const yb = f * fh;
      for (let i = 0; i < n; i++) {
        const x = -half + sp * (i + 0.5);
        if (f === 0 && i === doorI) {
          // puerta de madera con escalón y dintel
          b.panelZ(x, 1.15, 0.04, 1.3, 2.35, '#e9e4d8');
          b.panelZ(x, 1.1, 0.06, 1.1, 2.2, wood);
          b.panelZ(x, 1.75, 0.075, 0.5, 0.5, lin(wood).clone().multiplyScalar(0.7));
          b.box(x, 0.08, 0.3, 1.5, 0.16, 0.6, '#d9d2c3');
          lot.meta.doorX = x;
          if (rng.chance(0.35)) ctx.props.add('pot', ...potAt(lot, x + 1.2, 0.5), rng.range(0, 6), 0.9);
          continue;
        }
        const wy = yb + (f === 0 ? 1.7 : 1.6);
        glass(w, x, wy, 0.04, 0.95, 1.25, winEmit(rng));
        if (!front) {
          if (f > 0 && rng.chance(0.5)) {
            b.panelZ(x - 0.72, wy, 0.06, 0.48, 1.25, shutter);
            b.panelZ(x + 0.72, wy, 0.06, 0.48, 1.25, shutter);
          }
          continue;
        }
        b.panelZ(x, wy, 0.035, 1.25, 1.55, '#ece6da');
        if (f === 0) grille(b, x, wy, 0.1, 0.95, 1.25);
        else if (rng.chance(0.4)) {
          // balconcillo con macetas
          balcony(b, x, yb, 1.6, 0.55, rng, false);
        } else {
          b.panelZ(x - 0.72, wy, 0.06, 0.48, 1.25, shutter);
          b.panelZ(x + 0.72, wy, 0.06, 0.48, 1.25, shutter);
          b.box(x, wy - 0.72, 0.1, 1.3, 0.08, 0.2, '#e9e1d0', SKIP.NZ | SKIP.NY);
          if (rng.chance(0.45)) {
            b.box(0 + x, wy - 0.55, 0.16, 0.9, 0.24, 0.22, '#c8643b', SKIP.NY | SKIP.NZ);
            b.box(x, wy - 0.38, 0.16, 0.95, 0.16, 0.26, rng.pick(['#e8394d', '#f25c8c', '#f2a93b', '#4f8f3f']), SKIP.NY | SKIP.NZ);
          }
        }
      }
    }
  }
  ctx.box(lot.x, lot.h + (y0 + H) / 2, lot.z, hw, (H - y0) / 2, hd, lot.rot);
  ctx.foot.push({ x: lot.x, z: lot.z, hw, hd, rot: lot.rot, color: col, height: H });
  lot.meta.height = H;
  lot.meta.color = col;
}

/** Posición (x, y, z) delante de la fachada principal a `out` metros. */
function potAt(lot: Lot, lx: number, out: number): [number, number, number] {
  const p = lotPoint(lot, lx, lot.hd + out);
  return [p.x, lot.h, p.z];
}

// ───────────────────────── Chalet de la Colina ─────────────────────────

export function chalet(ctx: Ctx, lot: Lot, name: string) {
  const rng = ctx.rng;
  const b = ctx.solid.at(lot.x, lot.z);
  const w = ctx.win.at(lot.x, lot.z);
  const col = rng.pick(PAL.chalet);
  const W = lot.hw * 2, D = lot.hd * 2;
  const hw = Math.min(lot.hw - 3, rng.range(5, 7.5)), hd = Math.min(D * 0.27, rng.range(4.5, 5.8));
  const zc = lot.hd - 4.5 - hd; // casa con jardín delante
  const floors = rng.chance(0.55) ? 2 : 1;
  const H = floors * 3.1 + 0.2;
  const houseLot: Lot = { ...lot, hw, hd, meta: {} };
  const hp = lotPoint(lot, 0, zc);
  houseLot.x = hp.x;
  houseLot.z = hp.z;
  const y0 = baseDepth(ctx, houseLot);
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  // casa
  b.box(0, (y0 + H) / 2, zc, hw * 2, H - y0, hd * 2, col, SKIP.NY | SKIP.PY);
  b.frame(hp.x, lot.h, hp.z, lot.rot);
  tiledRoof(b, hw, hd, H, rng, col, undefined, 0.5);
  const trim = rng.pick(['#8c5a3c', '#f4efe6', '#3f6f8f', '#6e8f4f']);
  for (let k = 0; k < 4; k++) {
    const { half } = facadeFrame(b, houseLot, k);
    facadeFrame(w, houseLot, k);
    b.panelZ(0, (y0 + 0.5) / 2, 0.03, half * 2 + 0.02, 0.5 - y0, '#cdbfa9');
    const n = Math.max(1, Math.floor((half * 2 - 1) / 3.2));
    const sp = (half * 2) / n;
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < n; i++) {
        const x = -half + sp * (i + 0.5);
        const yb = f * 3.1;
        if (k === 0 && f === 0 && i === Math.floor(n / 2)) {
          b.panelZ(x, 1.15, 0.05, 1.2, 2.3, '#6a4630');
          b.panelZ(x, 1.2, 0.06, 1.0, 2.1, '#8a5a3a');
          continue;
        }
        const big = f === 0 && k !== 1 && k !== 3;
        glass(w, x, yb + (big ? 1.3 : 1.6), 0.04, big ? 2.0 : 1.2, big ? 2.1 : 1.4, winEmit(rng));
        b.panelZ(x, yb + (big ? 1.3 : 1.6), 0.03, big ? 2.2 : 1.4, big ? 2.3 : 1.6, trim);
      }
    }
  }
  // porche con pérgola
  b.frame(hp.x, lot.h, hp.z, lot.rot);
  b.box(0, 0.1, hd + 1.4, hw * 1.2, 0.2, 2.8, '#d9cbb0');
  b.box(-hw * 0.6 + 0.15, 1.35, hd + 2.6, 0.2, 2.5, 0.2, '#f4efe6');
  b.box(hw * 0.6 - 0.15, 1.35, hd + 2.6, 0.2, 2.5, 0.2, '#f4efe6');
  b.box(0, 2.65, hd + 1.4, hw * 1.2 + 0.2, 0.18, 2.9, trim);
  ctx.box(hp.x, lot.h + (y0 + H) / 2, hp.z, hw, (H - y0) / 2, hd, lot.rot);
  ctx.foot.push({ x: hp.x, z: hp.z, hw, hd, rot: lot.rot, color: col, height: H });

  // piscina detrás de la casa
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  const backStart = zc - hd - 2.0;
  const pd = Math.min(5, backStart + lot.hd - 1.5), pw = Math.min(W - 6, rng.range(7, 10));
  if (pd > 3) {
    const pz = backStart - pd / 2;
    const px = rng.range(-lot.hw + pw / 2 + 2, lot.hw - pw / 2 - 2);
    b.box(px, 0.15, pz, pw + 1.2, 0.3, pd + 1.2, '#f2eee6', SKIP.NY);
    // agua (brilla un poco de noche: luces de la piscina)
    b.quadL(px - pw / 2, 0.32, pz + pd / 2, px + pw / 2, 0.32, pz + pd / 2, px + pw / 2, 0.32, pz - pd / 2, px - pw / 2, 0.32, pz - pd / 2, '#2fb8e6', [0.02, 0.35, 0.6, 0.0]);
    const pp = lotPoint(lot, px, pz);
    ctx.pools.push({ x: pp.x, z: pp.z, hw: pw / 2, hd: pd / 2, rot: lot.rot });
    // tumbonas y sombrilla
    const lz = pz + pd / 2 + 1.6;
    if (lz < zc - hd - 0.8) {
      for (let i = 0; i < 2; i++) {
        const lp = lotPoint(lot, px - pw / 2 + 1 + i * 1.4, pz - pd / 2 - 1.3);
        if (pz - pd / 2 - 2.2 > -lot.hd) ctx.props.add('lounger', lp.x, lot.h, lp.z, lot.rot + Math.PI, 1);
      }
    }
    const up = lotPoint(lot, px + pw / 2 + 1.5, pz);
    if (px + pw / 2 + 2.3 < lot.hw) ctx.props.add('umbrella', up.x, lot.h, up.z, rng.range(0, 6), 1);
    ctx.box(pp.x, lot.h + 0.15, pp.z, pw / 2 + 0.6, 0.15, pd / 2 + 0.6, lot.rot);
  }
  // seto alrededor con hueco para la cancela
  const hedge = '#3f7f3a';
  const hh = 1.35, ht = 0.8;
  const gate = 3.6;
  const segs: [number, number, number, number][] = [
    [-lot.hw + ht / 2, 0, ht, D],
    [lot.hw - ht / 2, 0, ht, D],
    [0, -lot.hd + ht / 2, W, ht],
    [-(lot.hw + gate / 2) / 2, lot.hd - ht / 2, lot.hw - gate / 2, ht],
    [(lot.hw + gate / 2) / 2, lot.hd - ht / 2, lot.hw - gate / 2, ht],
  ];
  for (const [sx, sz, sw, sd] of segs) {
    b.box(sx, hh / 2 - 0.3, sz, sw, hh + 0.6, sd, hedge, SKIP.NY);
    const p = lotPoint(lot, sx, sz);
    ctx.box(p.x, lot.h + hh / 2, p.z, sw / 2, hh / 2, sd / 2, lot.rot);
  }
  // pilares de la cancela con placa del nombre
  for (const s of [-1, 1]) {
    b.box(s * (gate / 2 + 0.3), 0.9, lot.hd - 0.4, 0.6, 1.8, 0.6, '#efe6d6');
    b.box(s * (gate / 2 + 0.3), 1.85, lot.hd - 0.4, 0.7, 0.1, 0.7, '#c65f36');
  }
  const key = 'villa:' + name;
  ctx.signs.define(key, 2.2, 0.6, (g, Wp, Hp) => {
    g.fillStyle = '#f7f1e3';
    roundRect(g, 0, 0, Wp, Hp, Hp * 0.2);
    g.fill();
    g.strokeStyle = '#2f5fa7';
    g.lineWidth = Hp * 0.08;
    roundRect(g, Hp * 0.08, Hp * 0.08, Wp - Hp * 0.16, Hp - Hp * 0.16, Hp * 0.14);
    g.stroke();
    fitText(g, name, Wp / 2, Hp / 2, Wp * 0.86, Hp * 0.55, FONT_SERIF, 'italic 700', '#2f5fa7');
  });
  ctx.signs.place(b, key, gate / 2 + 0.3, 1.35, lot.hd - 0.09 + 0.02, 1.1, 0.3, 0);
  // camino de entrada
  b.box(0, 0.03, (lot.hd + zc + hd + 2.8) / 2, 1.6, 0.1, lot.hd - zc - hd - 2.8, '#d9cbb0', SKIP.NY);
  // palmeras y arbustos del jardín
  const trees = rng.int(1, 3);
  for (let i = 0; i < trees; i++) {
    const tx = (rng.chance(0.5) ? -1 : 1) * rng.range(hw + 1.5, lot.hw - 1.5);
    const tz = rng.range(-lot.hd + 2, lot.hd - 2);
    if (lot.hw - hw < 3.5) continue;
    const tp = lotPoint(lot, tx, tz);
    ctx.props.add(rng.chance(0.6) ? 'palm' : rng.chance(0.5) ? 'olive' : 'cypress', tp.x, lot.h, tp.z, rng.range(0, 6), rng.range(0.85, 1.15));
  }
  for (const s of [-1, 1]) {
    const bp = lotPoint(lot, s * 2.6, lot.hd - 1.8);
    ctx.props.add('bush', bp.x, lot.h, bp.z, rng.range(0, 6), rng.range(0.7, 1));
  }
  ctx.paved.push({ x: lot.x, z: lot.z, hw: lot.hw, hd: lot.hd, rot: lot.rot, color: '#9ccf6a' });
  lot.meta.height = H;
  lot.meta.name = name;
}

// ───────────────────────── Nave industrial ─────────────────────────

export function nave(ctx: Ctx, lot: Lot, o: { name?: string; color?: string; H?: number; sign?: string } = {}) {
  const rng = ctx.rng;
  const b = ctx.solid.at(lot.x, lot.z);
  const w = ctx.win.at(lot.x, lot.z);
  const col = o.color ?? rng.pick(PAL.nave);
  const rib = lin(col).clone().multiplyScalar(0.82);
  const y0 = baseDepth(ctx, lot);
  const H = o.H ?? rng.range(7, 10);
  const hw = lot.hw, hd = lot.hd;
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  b.box(0, (y0 + H) / 2, 0, hw * 2, H - y0, hd * 2, col, SKIP.NY | SKIP.PY);
  // cubierta a dos aguas con la cumbrera en profundidad (hastial a la calle)
  const rh = Math.min(3.2, hw * 0.25);
  const roofC = '#b9bdc2';
  b.quadL(-hw - 0.3, H, hd + 0.3, 0, H + rh, hd + 0.3, 0, H + rh, -hd - 0.3, -hw - 0.3, H, -hd - 0.3, roofC);
  b.quadL(0, H + rh, hd + 0.3, hw + 0.3, H, hd + 0.3, hw + 0.3, H, -hd - 0.3, 0, H + rh, -hd - 0.3, lin(roofC).clone().multiplyScalar(0.9));
  b.triL(-hw, H, hd, hw, H, hd, 0, H + rh, hd, col);
  b.triL(hw, H, -hd, -hw, H, -hd, 0, H + rh, -hd, col);
  // lucernarios
  for (let z = -hd + 3; z < hd - 3; z += 6) {
    const t = 0.45;
    b.quadL(-hw * t - 1, H + rh * (1 - t) + 0.05, z + 1.2, -hw * t + 1, H + rh * (1 - t + 2 / hw) + 0.05, z + 1.2, -hw * t + 1, H + rh * (1 - t + 2 / hw) + 0.05, z - 1.2, -hw * t - 1, H + rh * (1 - t) + 0.05, z - 1.2, '#9fd3ef');
  }
  for (let k = 0; k < 4; k++) {
    if (!exposed(ctx, lot, k)) continue;
    const { half } = facadeFrame(b, lot, k);
    facadeFrame(w, lot, k);
    // chapa grecada: franjas verticales
    for (let x = -half + 0.6; x < half - 0.3; x += 1.2) b.panelZ(x, (H + 0.4) / 2, 0.03, 0.35, H - 0.4, rib);
    b.panelZ(0, (y0 + 0.6) / 2, 0.04, half * 2 + 0.02, 0.6 - y0, '#8c8f93');
    // ventanas altas corridas
    const n = Math.floor((half * 2 - 2) / 3.5);
    for (let i = 0; i < n; i++) glass(w, -half + 1 + 3.5 * (i + 0.5), H - 1.4, 0.06, 2.6, 0.8, winEmit(rng));
    if (k === 0) {
      // portón y puerta de oficina
      const dw = Math.min(half * 2 - 6, rng.range(5, 7));
      const dx = -half + dw / 2 + 1.5;
      rollerDoor(b, dx, dw, Math.min(5, H - 2));
      b.panelZ(half - 2.5, 1.1, 0.05, 1.0, 2.2, '#3f4a55');
      glass(w, half - 4.5, 1.7, 0.05, 2.0, 1.2, winEmit(rng, true));
      lot.meta.doorX = half - 2.5;
      if (o.sign) {
        ctx.signs.place(b, o.sign, 0, H - 0.6 + rh * 0.35, 0.1, Math.min(half * 1.6, 12), Math.min(half * 1.6, 12) * 0.2, 0.3);
      }
    }
  }
  ctx.box(lot.x, lot.h + (y0 + H) / 2, lot.z, hw, (H - y0) / 2, hd, lot.rot);
  ctx.box(lot.x, lot.h + H + rh / 2, lot.z, hw * 0.55, rh / 2, hd, lot.rot);
  ctx.foot.push({ x: lot.x, z: lot.z, hw, hd, rot: lot.rot, color: col, height: H });
  lot.meta.height = H;
}

/** Persiana metálica de garaje (fachada local +Z). */
export function rollerDoor(b: GeoBuilder, x: number, w: number, h: number, color = '#8e959c') {
  b.panelZ(x, h / 2, 0.05, w + 0.4, h + 0.2, '#50565d');
  b.panelZ(x, h / 2, 0.07, w, h, color);
  for (let y = 0.4; y < h; y += 0.45) b.panelZ(x, y, 0.08, w, 0.05, lin(color).clone().multiplyScalar(0.75));
  b.panelZ(x, h + 0.25, 0.09, w + 0.5, 0.35, '#50565d');
}

/** Cartel de empresa del polígono. */
export function companySign(ctx: Ctx, name: string, sub: string, bg: string, fg: string) {
  const key = 'nave:' + name;
  ctx.signs.define(key, 10, 2, (g, W, H) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = fg;
    g.fillRect(0, H * 0.84, W, H * 0.16);
    fitText(g, name, W / 2, H * 0.4, W * 0.92, H * 0.55, FONT_IMPACT, '400', fg);
    fitText(g, sub, W / 2, H * 0.92, W * 0.9, H * 0.13, FONT, '700', bg);
  });
  return key;
}

export { NAVE_COMPANIES, CHALET_NAMES, FONT };
export const _tmpVec = new THREE.Vector3();
