// Mobiliario urbano: farolas, farolillos, semáforos, árboles de calle, papeleras, marquesinas,
// vallas publicitarias, tendederos entre fachadas y vegetación suelta por el campo.
import * as THREE from 'three';
import type { Ctx } from './ctx';
import type { Out } from './special';
import { ground } from './special';
import { OCC } from './occ';
import { SIDEWALK, pathAt, pathLength } from './network';
import { PropType } from './props';
import { SKIP, lin } from './geo';
import { clothesline, glass } from './buildings';
import { ADS } from './names';
import { fitText, roundRect, FONT_IMPACT, FONT } from './signs';
import { districtRaw } from './plan';
import { findFree } from './colina';

/** Rejilla para no poner dos cosas demasiado cerca. */
class Spacing {
  private cells = new Map<number, { x: number; z: number }[]>();
  constructor(private cell = 8) {}
  private key(i: number, j: number) {
    return (i + 1000) * 4000 + (j + 1000);
  }
  near(x: number, z: number, r: number): boolean {
    const i0 = Math.floor((x - r) / this.cell), i1 = Math.floor((x + r) / this.cell);
    const j0 = Math.floor((z - r) / this.cell), j1 = Math.floor((z + r) / this.cell);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const arr = this.cells.get(this.key(i, j));
        if (arr) for (const p of arr) if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r) return true;
      }
    return false;
  }
  add(x: number, z: number) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let arr = this.cells.get(k);
    if (!arr) this.cells.set(k, (arr = []));
    arr.push({ x, z });
  }
}

export function adSign(ctx: Ctx, i: number): string {
  const ad = ADS[i % ADS.length];
  const key = 'ad:' + ad.title;
  ctx.signs.define(key, 8, 3, (g, W, H) => {
    g.fillStyle = ad.bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = ad.accent;
    g.beginPath();
    g.arc(W * 0.14, H * 0.5, H * 0.34, 0, Math.PI * 2);
    g.fill();
    drawIcon(g, ad.icon, W * 0.14, H * 0.5, H * 0.28, ad.bg, ad.fg);
    fitText(g, ad.title, W * 0.6, H * 0.36, W * 0.72, H * 0.34, FONT_IMPACT, '400', ad.fg);
    fitText(g, ad.sub, W * 0.6, H * 0.72, W * 0.72, H * 0.16, FONT, '800', ad.fg);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = H * 0.04;
    g.strokeRect(0, 0, W, H);
  });
  return key;
}

function drawIcon(g: CanvasRenderingContext2D, icon: string, x: number, y: number, r: number, bg: string, fg: string) {
  g.save();
  g.translate(x, y);
  g.fillStyle = bg;
  g.strokeStyle = bg;
  g.lineWidth = r * 0.18;
  switch (icon) {
    case 'coche':
      g.fillRect(-r, -r * 0.1, r * 2, r * 0.6);
      g.fillRect(-r * 0.55, -r * 0.55, r * 1.1, r * 0.5);
      g.fillStyle = fg;
      g.beginPath();
      g.arc(-r * 0.55, r * 0.55, r * 0.25, 0, 7);
      g.arc(r * 0.55, r * 0.55, r * 0.25, 0, 7);
      g.fill();
      break;
    case 'pizza':
      g.beginPath();
      g.moveTo(0, -r);
      g.lineTo(r * 0.9, r * 0.7);
      g.lineTo(-r * 0.9, r * 0.7);
      g.closePath();
      g.fill();
      g.fillStyle = fg;
      for (const [a, b] of [[0, 0], [-0.3, 0.4], [0.35, 0.35]]) {
        g.beginPath();
        g.arc(a * r, b * r, r * 0.14, 0, 7);
        g.fill();
      }
      break;
    case 'pesa':
      g.fillRect(-r, -r * 0.1, r * 2, r * 0.2);
      g.fillRect(-r, -r * 0.5, r * 0.3, r);
      g.fillRect(r * 0.7, -r * 0.5, r * 0.3, r);
      break;
    case 'caja':
      g.fillStyle = '#c9955a';
      g.fillRect(-r * 0.8, -r * 0.7, r * 1.6, r * 1.4);
      g.fillStyle = '#ecdcae';
      g.fillRect(-r * 0.15, -r * 0.7, r * 0.3, r * 1.4);
      break;
    case 'sol':
      g.beginPath();
      g.arc(0, 0, r * 0.5, 0, 7);
      g.fill();
      for (let i = 0; i < 8; i++) {
        g.beginPath();
        g.moveTo(Math.cos((i * Math.PI) / 4) * r * 0.65, Math.sin((i * Math.PI) / 4) * r * 0.65);
        g.lineTo(Math.cos((i * Math.PI) / 4) * r, Math.sin((i * Math.PI) / 4) * r);
        g.stroke();
      }
      break;
    case 'luna':
      g.beginPath();
      g.arc(0, 0, r * 0.8, 0, 7);
      g.fill();
      g.fillStyle = fg;
      g.beginPath();
      g.arc(r * 0.35, -r * 0.2, r * 0.7, 0, 7);
      g.fill();
      break;
    default:
      g.beginPath();
      g.arc(0, 0, r * 0.7, 0, 7);
      g.fill();
      g.fillStyle = fg;
      fitText(g, '!', 0, 0, r, r * 1.2, FONT_IMPACT, '400', fg);
  }
  g.restore();
}

export function streetFurniture(ctx: Ctx, out: Out) {
  const { net, props, rng } = ctx;
  const lamps = new Spacing(8);
  const trees = new Spacing(6);
  const nodeW = (id: number) => {
    let w = 0;
    for (const eid of net.nodes[id].edges) w = Math.max(w, net.edges[eid].width);
    return w;
  };
  const nearCrossing = (x: number, z: number, pad: number) => {
    for (const eid of net.candidates(x, z)) {
      const e = net.edges[eid];
      for (const nid of [e.a, e.b]) {
        const n = net.nodes[nid];
        if (n.edges.length < 3) continue;
        if (Math.hypot(n.x - x, n.z - z) < nodeW(nid) / 2 + pad) return true;
      }
    }
    return false;
  };
  const nearE = { id: -1, d: 0, t: 0, h: 0 };
  const office = (x: number, z: number) => x > -66 && x < -14 && z > 165 && z < 176;

  // ── farolas a lo largo de las calles ──
  for (let di = 0; di < net.defs.length; di++) {
    const def = net.defs[di];
    const path = net.paths[di];
    const L = pathLength(path);
    if (def.alley) continue;
    const spacing = def.width >= 11 ? 30 : 25;
    for (const side of [1, -1] as const) {
      for (let s = side > 0 ? 6 : 6 + spacing / 2; s < L - 3; s += spacing) {
        const q = pathAt(path, s)!;
        const nx = -q.dz * side, nz = q.dx * side;
        net.nearest(q.x, q.z, nearE);
        if (nearE.id < 0) continue;
        const e = net.edges[nearE.id];
        const sAlong = nearE.t * e.len;
        const eSide = (nx * -e.dz + nz * e.dx) >= 0 ? 1 : -1;
        const ext = net.sideExtent(e, eSide as 1 | -1, sAlong);
        const lat = def.width / 2 + ext - SIDEWALK + 0.5;
        const x = q.x + nx * lat, z = q.z + nz * lat;
        if (ctx.occ.get(x, z) !== OCC.WALK) continue;
        if (nearCrossing(x, z, 3) || lamps.near(x, z, 11) || office(x, z)) continue;
        const d = districtRaw(x, z);
        const type: PropType = d === 'viejo' ? 'lampOld' : 'lamp';
        const rot = Math.atan2(nz, -nx); // el brazo (+x local) apunta a la calzada
        props.add(type, x, ctx.heightAt(x, z), z, rot, 1);
        lamps.add(x, z);
        ctx.occ.set(x, z, OCC.PROP);
        // árbol de alineación entre farolas
        const s2 = s + spacing / 2;
        if (s2 < L - 6 && (d === 'centro' || d === 'puerto' || (d === 'colina' && rng.chance(0.6)))) {
          const q2 = pathAt(path, s2)!;
          const tx = q2.x + (-q2.dz * side) * (def.width / 2 + ext - SIDEWALK + 0.9), tz = q2.z + (q2.dx * side) * (def.width / 2 + ext - SIDEWALK + 0.9);
          if (ctx.occ.get(tx, tz) === OCC.WALK && !nearCrossing(tx, tz, 4) && !lamps.near(tx, tz, 5) && !office(tx, tz)) {
            const tt: PropType = d === 'puerto' || def.name.startsWith('Avenida') ? 'palm' : d === 'colina' ? 'cypress' : 'orange';
            props.add(tt, tx, ctx.heightAt(tx, tz), tz, rng.range(0, 6), rng.range(0.9, 1.1));
            trees.add(tx, tz);
            ctx.occ.set(tx, tz, OCC.PROP);
          }
        }
      }
    }
  }

  // ── farolillos de pared, tendederos y macetas en los callejones ──
  for (let di = 0; di < net.defs.length; di++) {
    const def = net.defs[di];
    if (!def.alley) continue;
    const path = net.paths[di];
    const L = pathLength(path);
    let k = 0;
    for (let s = 5; s < L - 4; s += 7) {
      const q = pathAt(path, s)!;
      const side = k % 2 ? 1 : -1;
      const nx = -q.dz * side, nz = q.dx * side;
      const wallLat = def.width / 2 + 0.5;
      const bx = q.x + nx * (wallLat + 0.6), bz = q.z + nz * (wallLat + 0.6);
      const opp = ctx.occ.get(q.x - nx * (wallLat + 0.6), q.z - nz * (wallLat + 0.6)) === OCC.BUILDING;
      const here = ctx.occ.get(bx, bz) === OCC.BUILDING;
      if (k % 2 === 0 && here && !lamps.near(q.x, q.z, 9)) {
        const x = q.x + nx * wallLat, z = q.z + nz * wallLat;
        props.add('lampWall', x, ctx.heightAt(x, z) + 3.4, z, Math.atan2(-nx, -nz), 1);
        lamps.add(q.x, q.z);
      } else if (here && opp && rng.chance(0.55)) {
        // tendedero de fachada a fachada
        const y = ctx.heightAt(q.x, q.z) + rng.range(4.6, 5.6);
        const b = ctx.solid.at(q.x, q.z);
        b.frame(0, 0, 0, 0);
        const ax = q.x + nx * wallLat, az = q.z + nz * wallLat, cx = q.x - nx * wallLat, cz = q.z - nz * wallLat;
        clothesline(b, rng, ax, y - 0.1, az, cx, y - 0.1, cz, 0.1, false);
        b.box(ax, y, az, 0.12, 0.12, 0.12, '#666');
        b.box(cx, y, cz, 0.12, 0.12, 0.12, '#666');
      } else if (here && rng.chance(0.35)) {
        const x = q.x + nx * (wallLat - 0.45), z = q.z + nz * (wallLat - 0.45);
        props.add('pot', x, ctx.heightAt(x, z), z, rng.range(0, 6), rng.range(0.8, 1.05));
      }
      k++;
    }
  }

  // ── semáforos en los cruces del Centro ──
  for (const n of net.nodes) {
    if (n.edges.length < 3) continue;
    const d = districtRaw(n.x, n.z);
    if (d !== 'centro' && !(d === 'puerto' && n.z < 170)) continue;
    if (n.edges.some((id) => net.edges[id].alley)) continue;
    for (const eid of n.edges) {
      const e = net.edges[eid];
      const other = e.a === n.id ? net.nodes[e.b] : net.nodes[e.a];
      let dx = other.x - n.x, dz = other.z - n.z;
      const l = Math.hypot(dx, dz);
      dx /= l;
      dz /= l;
      let wOther = 0;
      for (const id of n.edges) if (id !== eid) wOther = Math.max(wOther, net.edges[id].width);
      const x = n.x + dx * (wOther / 2 + 1.4) + dz * (e.width / 2 + 1.0);
      const z = n.z + dz * (wOther / 2 + 1.4) - dx * (e.width / 2 + 1.0);
      if (ctx.occ.get(x, z) !== OCC.WALK && ctx.occ.get(x, z) !== OCC.PROP) continue;
      props.add('tlight', x, ctx.heightAt(x, z), z, Math.atan2(dx, dz), 1);
      ctx.occ.set(x, z, OCC.PROP);
    }
  }

  // ── papeleras (rompibles), bocas de riego y bancos en las aceras ──
  let bins = 0;
  for (let di = 0; di < net.defs.length; di++) {
    const def = net.defs[di];
    if (def.alley) continue;
    const path = net.paths[di];
    const L = pathLength(path);
    for (let s = 14; s < L - 10; s += 55) {
      const side = (Math.floor(s / 55) % 2) ? 1 : -1;
      const q = pathAt(path, s)!;
      const nx = -q.dz * side, nz = q.dx * side;
      const pr = probeFacade(ctx, q.x, q.z, nx, nz, def.width);
      if (pr < 0) continue;
      const x = q.x + nx * (pr - 0.6), z = q.z + nz * (pr - 0.6);
      if (nearCrossing(x, z, 2) || ctx.occ.get(x, z) !== OCC.WALK || lamps.near(x, z, 1.5) || office(x, z)) continue;
      const d = districtRaw(x, z);
      if (bins % 3 === 2 && d === 'centro') props.add('hydrant', x, ctx.heightAt(x, z), z, 0, 1);
      else ctx.breakables.push({ kind: 'bin', pos: ground(ctx, x, z), rotY: Math.atan2(nx, nz) });
      ctx.occ.set(x, z, OCC.PROP);
      bins++;
    }
  }

  // ── marquesinas de autobús con anuncio ──
  const stops: [string, number][] = [
    ['Paseo del Muelle', 0.3], ['Paseo del Muelle', 0.72], ['Avenida del Reembolso', 0.35], ['Avenida de la Colina', 0.3],
    ['Avenida de la Colina', 0.72], ['Avenida de la Chapa', 0.5], ['Avenida del Poniente', 0.45], ['Calle Mayor del Viejo', 0.5],
  ];
  stops.forEach(([name, t], i) => {
    const di = net.defs.findIndex((d) => d.name === name);
    if (di < 0) return;
    const path = net.paths[di];
    const L = pathLength(path);
    for (let tries = 0; tries < 6; tries++) {
      const s = L * t + tries * 7;
      const q = pathAt(path, s);
      if (!q) break;
      const side = i % 2 ? 1 : -1;
      const nx = -q.dz * side, nz = q.dx * side;
      const pr = probeFacade(ctx, q.x, q.z, nx, nz, net.defs[di].width);
      if (pr < 0) continue;
      const x = q.x + nx * (pr - 1.2), z = q.z + nz * (pr - 1.2);
      if (nearCrossing(x, z, 6) || lamps.near(x, z, 3) || office(x, z)) continue;
      busStop(ctx, x, z, Math.atan2(-nx, -nz), i);
      break;
    }
  });

  // ── vallas publicitarias en el campo, junto a la carretera de circunvalación ──
  let adI = 0;
  const boards: [number, number, number][] = [
    [-262, 110, Math.PI / 2], [-262, -40, Math.PI / 2], [262, 30, -Math.PI / 2], [262, 135, -Math.PI / 2],
    [150, -262, 0.1], [-150, -262, -0.1], [215, 187, -0.6], [-215, 188, 0.6], [-40, -105, 0], [120, 180, Math.PI],
  ];
  for (const [bx, bz, rot] of boards) {
    const fx = Math.sin(rot), fz = Math.cos(rot);
    // se busca un sitio libre cerca
    let px = bx, pz = bz, ok = false;
    for (let t = 0; t < 12 && !ok; t++) {
      ok = ctx.occ.rectFree(px, pz, 5, 1.2, rot, 0, [OCC.FREE, OCC.WATER, OCC.RESERVED]) && ctx.heightAt(px, pz) > 1.6;
      if (!ok) {
        px += fx * 2;
        pz += fz * 2;
      }
    }
    if (!ok) continue;
    billboard(ctx, px, pz, rot, adI++);
    ctx.occ.markRect(px, pz, 5, 1.2, rot, OCC.PROP);
  }

  // ── obras con conos y vallas (rompibles) en solares libres ──
  const works: [number, number][] = [[-100, 226], [60, -140], [-230, 150], [240, -60], [-60, 150]];
  for (const [wx0, wz0] of works) {
    const spot = findFree(ctx.occ, wx0, wz0, 24, 6);
    if (!spot) continue;
    for (let i = -2; i <= 2; i++) {
      const x = spot.x + i * 2.2, z = spot.z;
      ctx.breakables.push({ kind: i % 2 ? 'cone' : 'fence', pos: ground(ctx, x, z), rotY: 0 });
    }
    ctx.occ.markRect(spot.x, spot.z, 6, 1, 0, OCC.PROP);
  }

  // ── vegetación suelta: pinos, olivos, palmeras y arbustos donde hay campo libre ──
  scatterVegetation(ctx, trees);
  void out;
}

/** Distancia desde el eje hasta la fachada (primer edificio) o -1 si no hay acera clara. */
function probeFacade(ctx: Ctx, x: number, z: number, nx: number, nz: number, w: number): number {
  let d = w / 2 + 0.5;
  let sawWalk = false;
  while (d < w / 2 + 9) {
    const v = ctx.occ.get(x + nx * d, z + nz * d);
    if (v === OCC.WALK || v === OCC.PROP) sawWalk = true;
    else if (v !== OCC.ROAD) return sawWalk ? d : -1;
    d += 0.25;
  }
  return -1;
}

/** Anuncio vertical (mupi) de marquesina. */
export function mupiSign(ctx: Ctx, i: number): string {
  const ad = ADS[i % ADS.length];
  const key = 'mupi:' + ad.title;
  ctx.signs.define(key, 1.2, 1.8, (g, W, H) => {
    g.fillStyle = ad.bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = ad.accent;
    g.beginPath();
    g.arc(W / 2, H * 0.3, W * 0.3, 0, Math.PI * 2);
    g.fill();
    drawIcon(g, ad.icon, W / 2, H * 0.3, W * 0.24, ad.bg, ad.fg);
    const words = ad.title.split(' ');
    const mid = Math.ceil(words.length / 2);
    fitText(g, words.slice(0, mid).join(' '), W / 2, H * 0.6, W * 0.9, H * 0.1, FONT_IMPACT, '400', ad.fg);
    fitText(g, words.slice(mid).join(' '), W / 2, H * 0.7, W * 0.9, H * 0.1, FONT_IMPACT, '400', ad.fg);
    fitText(g, ad.sub, W / 2, H * 0.85, W * 0.92, H * 0.06, FONT, '800', ad.fg);
  });
  return key;
}

function busStop(ctx: Ctx, x: number, z: number, rot: number, i: number) {
  const y = ctx.heightAt(x, z);
  const b = ctx.solid.at(x, z);
  b.frame(x, y, z, rot);
  const c = '#2d6f8f';
  b.box(-1.9, 1.25, -0.6, 0.1, 2.5, 0.1, c);
  b.box(1.9, 1.25, -0.6, 0.1, 2.5, 0.1, c);
  b.box(0, 2.55, 0, 4.2, 0.12, 1.6, c);
  b.box(0, 2.62, 0, 4.0, 0.04, 1.4, '#e8394d');
  b.box(0, 1.3, -0.62, 3.8, 2.0, 0.04, '#bfe3f2', 0, [0.05, 0.1, 0.12, 0.3]);
  b.box(0, 0.45, -0.35, 2.6, 0.08, 0.45, '#b8b8b8');
  b.box(0, 0.22, -0.35, 0.1, 0.44, 0.1, c);
  b.box(2.1, 1.3, -0.6, 0.1, 2.3, 1.3, c);
  ctx.signs.place(b.frame(x, y, z, rot + Math.PI / 2), mupiSign(ctx, i + 3), 0.6, 1.35, 2.17, 1.15, 1.75, 0.6);
  ctx.signs.define('bus', 1, 1, (g, W, H) => {
    g.fillStyle = '#2d6f8f';
    roundRect(g, 0, 0, W, H, W * 0.2);
    g.fill();
    fitText(g, 'BUS', W / 2, H * 0.42, W * 0.8, H * 0.4, FONT, '900', '#ffffff');
    fitText(g, 'Línea 7 · Cuando quiera', W / 2, H * 0.78, W * 0.86, H * 0.12, FONT, '700', '#ffffff');
  });
  b.frame(x, y, z, rot);
  b.box(-1.9, 2.9, -0.6, 0.06, 0.7, 0.06, c);
  ctx.signs.placeDouble(b, 'bus', -1.9, 3.3, -0.6, 0.6, 0.6, 0.3);
  ctx.box(x, y + 1.3, z, 2.0, 1.3, 0.2, rot);
  ctx.foot.push({ x, z, hw: 2.1, hd: 0.8, rot, color: c, height: 2.6 });
}

function billboard(ctx: Ctx, x: number, z: number, rot: number, i: number) {
  const y = ctx.heightAt(x, z);
  const b = ctx.solid.at(x, z);
  b.frame(x, y, z, rot);
  const c = '#5a5f66';
  for (const px of [-2.6, 2.6]) b.box(px, 3, 0, 0.35, 6, 0.35, c);
  b.box(0, 7.6, 0, 9.0, 3.6, 0.3, '#e8e8e8');
  b.box(0, 5.7, 0.5, 9.0, 0.1, 0.9, c);
  const key = adSign(ctx, i);
  ctx.signs.place(b, key, 0, 7.6, 0.17, 8.6, 3.2, 0.25);
  ctx.signs.place(b.frame(x, y, z, rot + Math.PI), adSign(ctx, i + 5), 0, 7.6, 0.17, 8.6, 3.2, 0.25);
  // focos
  b.frame(x, y, z, rot);
  for (const px of [-3, 0, 3]) b.box(px, 5.85, 0.9, 0.4, 0.2, 0.3, '#333', 0, [1, 0.9, 0.6, 0.0]);
  ctx.box(x, y + 3, z, 2.8, 3, 0.2, rot);
  ctx.foot.push({ x, z, hw: 4.5, hd: 0.3, rot, color: '#e8e8e8', height: 9 });
}

function scatterVegetation(ctx: Ctx, trees: Spacing) {
  const rng = ctx.rng;
  const { props } = ctx;
  let n = 0;
  for (let tries = 0; tries < 9000 && n < 420; tries++) {
    const x = rng.range(-310, 310), z = rng.range(-310, 310);
    const v = ctx.occ.get(x, z);
    if (v !== OCC.FREE && v !== OCC.WATER) continue;
    const h = ctx.heightAt(x, z);
    if (h < 1.7) continue;
    if (ctx.terrain.slopeAt(x, z) > 0.8) continue;
    if (x > -165 && x < 200 && z > 170 && z < 263) continue; // el muelle
    // lejos de calles y edificios
    let clear = true;
    for (const [dx, dz] of [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]]) {
      const w = ctx.occ.get(x + dx, z + dz);
      if (w === OCC.ROAD || w === OCC.WALK || w === OCC.BUILDING || w === OCC.RESERVED) clear = false;
    }
    if (!clear || trees.near(x, z, 5.5)) continue;
    const d = districtRaw(x, z);
    let t: PropType;
    const r = rng.next();
    if (d === 'colina') t = r < 0.55 ? 'pine' : r < 0.75 ? 'cypress' : r < 0.9 ? 'olive' : 'bush';
    else if (d === 'viejo') t = r < 0.45 ? 'olive' : r < 0.7 ? 'palm' : r < 0.85 ? 'pine' : 'bush';
    else if (d === 'poligono') t = r < 0.4 ? 'bush' : r < 0.7 ? 'pine' : 'olive';
    else t = r < 0.4 ? 'palm' : r < 0.7 ? 'pine' : r < 0.85 ? 'bush' : 'olive';
    if (h < 3 && ctx.heightAt(x, z) < 3.2 && d !== 'colina' && rng.chance(0.6)) t = 'palm';
    props.add(t, x, h - 0.1, z, rng.range(0, 6.28), rng.range(0.8, 1.25), new THREE.Color().setHSL(0.28, 0.1, rng.range(0.85, 1.0)));
    trees.add(x, z);
    ctx.occ.set(x, z, OCC.PROP);
    n++;
  }
}

export { lin, SKIP, glass };
