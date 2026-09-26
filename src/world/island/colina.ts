// La Colina: la torre del Ático (con terraza arriba), el mirador de la cima y rincones con vistas.
import * as THREE from 'three';
import type { Ctx } from './ctx';
import { SKIP, lin } from './geo';
import { OCC } from './occ';
import { PlanCtx, Special, Out, collectible, makePoi, ground } from './special';
import { glass, facadeFrame, baseDepth, stripedAwning, overhangCollider } from './buildings';
import { lotPoint, Lot } from './layout';
import { fitText, roundRect, FONT_SERIF, FONT } from './signs';

export function planColina(p: PlanCtx): Special[] {
  const { layout, occ, shape } = p;
  const attic = layout.lotNear(-40, -206, 22, 18, { kind: 'special' }, 'attic', 'Camino de las Mimosas');
  if (!attic) console.warn('[isla] no cabe el ático');
  // mirador en lo alto
  const mir = findFree(occ, 22, -258, 12, 11);
  if (mir) occ.markCircle(mir.x, mir.z, 11, OCC.RESERVED);
  const hair = findFree(occ, 134, -160, 12, 4);
  if (hair) occ.markCircle(hair.x, hair.z, 4, OCC.RESERVED);
  void shape;
  return [
    {
      name: 'colina',
      build: (ctx, out) => {
        if (attic) buildAttic(ctx, out, attic);
        if (mir) buildMirador(ctx, out, mir.x, mir.z);
        if (hair) {
          // banco con paquete junto a la curva: se busca el rellano más plano cerca (la ladera es empinada)
          let bx = hair.x, bz = hair.z, best = 1e9;
          for (let r = 0; r <= 14; r += 2) {
            for (let a = 0; a < 12; a++) {
              const x = hair.x + Math.cos((a / 12) * Math.PI * 2) * r, z = hair.z + Math.sin((a / 12) * Math.PI * 2) * r;
              const v = ctx.occ.get(x, z), v2 = ctx.occ.get(x + 1.5, z);
              if ((v !== OCC.FREE && v !== OCC.RESERVED) || (v2 !== OCC.FREE && v2 !== OCC.RESERVED)) continue;
              const sl = Math.max(ctx.terrain.slopeAt(x, z), ctx.terrain.slopeAt(x + 1.5, z)) + r * 0.004;
              if (sl < best) {
                best = sl;
                bx = x;
                bz = z;
              }
            }
          }
          ctx.props.add('bench', bx, ctx.heightAt(bx, bz), bz, Math.PI / 2, 1);
          collectible(ctx, bx + 1.5, ctx.heightAt(bx + 1.5, bz), bz);
          ctx.occ.markCircle(bx, bz, 3, OCC.RESERVED);
        }
        cliffSpot(ctx);
      },
    },
  ];
}

/** Busca un sitio libre (círculo de radio r) cerca de (x, z). */
export function findFree(occ: { circleFree(x: number, z: number, r: number, a?: readonly number[]): boolean }, x: number, z: number, search: number, r: number): { x: number; z: number } | null {
  for (let d = 0; d <= search; d += 2) {
    const n = Math.max(1, Math.round((d * Math.PI * 2) / 3));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (occ.circleFree(px, pz, r, [OCC.FREE])) return { x: px, z: pz };
    }
  }
  return null;
}

// ───────────────────────── Residencial Las Vistas (el Ático) ─────────────────────────

function buildAttic(ctx: Ctx, out: Out, lot: Lot) {
  const b = ctx.solid.at(lot.x, lot.z);
  const w = ctx.win.at(lot.x, lot.z);
  const hw = lot.hw, hd = lot.hd;
  const floors = 8, fh = 3.2, gf = 4;
  const H = gf + (floors - 1) * fh;
  const y0 = baseDepth(ctx, lot);
  const white = '#f7f5f0', stone = '#d9cdb8', glassRail = '#9fd6ef';
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  b.box(0, (y0 + H) / 2, 0, hw * 2, H - y0, hd * 2, white, SKIP.NY | SKIP.PY);
  b.quadL(-hw, H, hd, hw, H, hd, hw, H, -hd, -hw, H, -hd, '#cfc6b4');
  ctx.box(lot.x, lot.h + (y0 + H) / 2, lot.z, hw, (H - y0) / 2, hd, lot.rot);
  for (let k = 0; k < 4; k++) {
    const { half } = facadeFrame(b, lot, k);
    facadeFrame(w, lot, k);
    b.panelZ(0, (y0 + gf) / 2, 0.03, half * 2, gf - y0, stone);
    for (let f = 1; f < floors; f++) {
      const yb = gf + (f - 1) * fh;
      // balcones corridos con barandilla de cristal
      b.box(0, yb + 0.08, 0.7, half * 2 + 0.4, 0.16, 1.4, '#e9e5dc', SKIP.NZ);
      b.box(0, yb + 0.6, 1.38, half * 2 + 0.4, 0.9, 0.05, glassRail, SKIP.NZ, [0.05, 0.12, 0.16, 0.2]);
      for (let x = -half + 1.6; x < half - 1; x += 3.2) glass(w, x, yb + 1.35, 0.05, 2.4, 2.3, [1, 0.85, 0.6, 0.15 + ((f + Math.round(x)) % 4) * 0.25]);
    }
    b.box(0, H - 0.15, 0.2, half * 2 + 0.5, 0.3, 0.4, '#e9e5dc', SKIP.NZ);
    if (k === 0) {
      // portal con marquesina
      b.panelZ(0, 1.6, 0.04, 4.4, 3.2, '#8c7a5c');
      glass(w, 0, 1.55, 0.06, 3.8, 3.0, [1, 0.85, 0.6, 0.02], lin('#3a4a58').clone(), lin('#9ab8cc').clone());
      b.box(0, 3.45, 1.4, 6, 0.25, 2.8, '#3a3a3a');
      overhangCollider(ctx, b, 0, 3.45, 1.4, 3, 0.125, 1.4); // marquesina: que la cámara no se meta
      ctx.signs.define('vistas', 7, 1.1, (g, W, Hh) => {
        g.fillStyle = '#2a2a2a';
        roundRect(g, 0, 0, W, Hh, Hh * 0.2);
        g.fill();
        fitText(g, 'Residencial Las Vistas', W / 2, Hh * 0.4, W * 0.9, Hh * 0.46, FONT_SERIF, 'italic 700', '#e8c25a');
        fitText(g, 'Áticos de lujo · se vende el de arriba', W / 2, Hh * 0.77, W * 0.86, Hh * 0.18, FONT, '700', '#ffffff');
      });
      ctx.signs.place(b, 'vistas', 0, 3.85, 0.12, 5.2, 0.82, 0.8);
      for (const s of [-1, 1]) ctx.props.add('pot', lotPoint(lot, s * 3.2, hd + 0.9).x, lot.h, lotPoint(lot, s * 3.2, hd + 0.9).z, 0, 1.3);
    }
  }
  // ÁTICO: planta retranqueada con terraza, pérgola, jacuzzi y plantas
  const ah = 3.4;
  const ahw = hw - 3.5, ahd = hd - 3.2;
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  b.box(-1.5, H + ah / 2, -1.2, ahw * 2, ah, ahd * 2, '#fbfaf6', SKIP.NY);
  b.box(-1.5, H + ah + 0.15, -1.2, ahw * 2 + 1.2, 0.3, ahd * 2 + 1.2, '#e9e5dc');
  const wa = ctx.win.at(lot.x, lot.z);
  wa.frame(lot.x, lot.h, lot.z, lot.rot);
  for (let x = -1.5 - ahw + 1.3; x < -1.5 + ahw - 1; x += 2.6) glass(wa, x, H + 1.6, -1.2 + ahd + 0.02, 2.2, 2.8, [1, 0.8, 0.5, 0.05]);
  // barandilla de cristal alrededor de la terraza
  for (const [x, z, sx, sz] of [[0, hd - 0.1, hw * 2, 0.08], [0, -hd + 0.1, hw * 2, 0.08], [hw - 0.1, 0, 0.08, hd * 2], [-hw + 0.1, 0, 0.08, hd * 2]]) {
    b.box(x, H + 0.55, z, sx, 1.1, sz, glassRail, 0, [0.05, 0.12, 0.16, 0.2]);
  }
  // suelo de madera en la terraza delantera
  b.quadL(-hw + 0.2, H + 0.03, hd - 0.2, hw - 0.2, H + 0.03, hd - 0.2, hw - 0.2, H + 0.03, -1.2 + ahd, -hw + 0.2, H + 0.03, -1.2 + ahd, '#b98a58');
  // pérgola
  for (const x of [-hw + 1, hw - 1]) for (const z of [hd - 1, -1.2 + ahd + 0.5]) b.box(x, H + 1.35, z, 0.18, 2.7, 0.18, '#6b4a32');
  for (let x = -hw + 1; x <= hw - 1; x += 1.1) b.box(x, H + 2.75, (hd - 1 + (-1.2 + ahd + 0.5)) / 2, 0.12, 0.12, hd - 1 - (-1.2 + ahd + 0.5) + 0.6, '#6b4a32');
  // jacuzzi
  b.cyl(hw - 3, H, hd - 2.4, 1.5, 1.5, 0.7, 12, '#f4f1ea', true);
  b.cyl(hw - 3, H + 0.55, hd - 2.4, 1.3, 1.3, 0.2, 12, '#3fc9f0', true, false, [0.05, 0.4, 0.7, 0.3]);
  // tumbonas y plantas
  ctx.props.add('lounger', lotPoint(lot, -hw + 2.5, hd - 1.6).x, lot.h + H, lotPoint(lot, -hw + 2.5, hd - 1.6).z, lot.rot, 1);
  ctx.props.add('lounger', lotPoint(lot, -hw + 4, hd - 1.6).x, lot.h + H, lotPoint(lot, -hw + 4, hd - 1.6).z, lot.rot, 1);
  ctx.props.add('umbrella', lotPoint(lot, -hw + 6, hd - 1.8).x, lot.h + H, lotPoint(lot, -hw + 6, hd - 1.8).z, 0, 1);
  for (const s of [-1, 1]) ctx.props.add('palm', lotPoint(lot, s * (hw - 1.2), -hd + 1.2).x, lot.h + H, lotPoint(lot, s * (hw - 1.2), -hd + 1.2).z, s, 0.55);
  // colisores de la terraza (barandilla)
  const T = (x: number, z: number, hx: number, hz: number) => {
    const p = lotPoint(lot, x, z);
    ctx.box(p.x, lot.h + H + 0.55, p.z, hx, 0.55, hz, lot.rot);
  };
  T(0, hd - 0.1, hw, 0.05);
  T(0, -hd + 0.1, hw, 0.05);
  T(hw - 0.1, 0, 0.05, hd);
  T(-hw + 0.1, 0, 0.05, hd);
  const ac = lotPoint(lot, -1.5, -1.2);
  ctx.box(ac.x, lot.h + H + ah / 2, ac.z, ahw, ah / 2, ahd, lot.rot);
  out.pois.push(makePoi(ctx, 'attic', 'attic', 'Ático de Residencial Las Vistas', lot, 0, true, 1.4));
  out.extra.atticTerrace = new THREE.Vector3(lotPoint(lot, 0, hd - 2).x, lot.h + H, lotPoint(lot, 0, hd - 2).z);
  ctx.foot.push({ x: lot.x, z: lot.z, hw, hd, rot: lot.rot, color: white, height: H + ah });
}

// ───────────────────────── Mirador de la Colina ─────────────────────────

function buildMirador(ctx: Ctx, out: Out, x: number, z: number) {
  const y = ctx.heightAt(x, z);
  ctx.pave.disc(ctx.pave.walk, x, z, 10, '#e6dcc6', 20);
  ctx.pave.disc(ctx.pave.paint, x, z, 3, '#c9a46a', 12);
  ctx.paved.push({ x, z, hw: 10, hd: 10, rot: 0, color: '#e6dcc6' });
  const b = ctx.solid.at(x, z);
  b.frame(x, y, z, 0);
  // barandilla en el lado que mira al mar (norte) y bancos
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    const r = 9.6;
    b.box(Math.cos(a) * r, 0.5, Math.sin(a) * r, 0.12, 1.0, 0.12, '#3a3f47');
    if (i < 12) {
      const a2 = Math.PI + ((i + 1) / 12) * Math.PI;
      b.beam(x + Math.cos(a) * r, y + 1.0, z + Math.sin(a) * r, x + Math.cos(a2) * r, y + 1.0, z + Math.sin(a2) * r, 0.07, '#3a3f47');
    }
  }
  // catalejo de monedas
  b.cyl(2, 0, -5, 0.12, 0.1, 1.2, 6, '#2f6f3a', true);
  b.boxRot(2, 1.35, -5.2, 0.25, 0.25, 0.9, 0.25, 0, 0, '#2f6f3a');
  ctx.cyl(x + 2, y + 0.6, z - 5, 0.6, 0.2);
  for (let i = 0; i < 3; i++) {
    const a = Math.PI * 1.25 + i * 0.25 * Math.PI;
    ctx.props.add('bench', x + Math.cos(a) * 6, y, z + Math.sin(a) * 6, -a - Math.PI / 2, 1);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    ctx.props.add(i % 2 ? 'cypress' : 'pine', x + Math.cos(a) * 12.5, ctx.heightAt(x + Math.cos(a) * 12.5, z + Math.sin(a) * 12.5), z + Math.sin(a) * 12.5, a, 1);
  }
  ctx.signs.define('mirador', 3, 1, (g, W, H) => {
    g.fillStyle = '#6b4a32';
    roundRect(g, 0, 0, W, H, H * 0.15);
    g.fill();
    fitText(g, 'Mirador de la Colina', W / 2, H * 0.4, W * 0.9, H * 0.42, FONT_SERIF, '700', '#f3e2b8');
    fitText(g, 'Prohibido tirar paquetes al mar', W / 2, H * 0.78, W * 0.86, H * 0.18, FONT, '700', '#f3e2b8');
  });
  b.frame(x, y, z, Math.PI);
  b.box(-4, 0.9, 7.5, 0.12, 1.8, 0.12, '#6b4a32');
  b.box(-2, 0.9, 7.5, 0.12, 1.8, 0.12, '#6b4a32');
  ctx.signs.placeDouble(b, 'mirador', -3, 1.6, 7.5, 2.4, 0.8, 0);
  collectible(ctx, x, y, z);
  out.extra.mirador = new THREE.Vector3(x, y, z);
}

/** Paquete perdido en un saliente sobre el acantilado (noroeste). */
function cliffSpot(ctx: Ctx) {
  for (let t = 0; t < 60; t++) {
    const a = -2.3 + t * 0.01;
    const r = 262 + (t % 6) * 3;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (ctx.occ.get(x, z) !== OCC.FREE && ctx.occ.get(x, z) !== OCC.PROP) continue;
    if (ctx.heightAt(x, z) < 8 || ctx.terrain.slopeAt(x, z) > 0.5) continue;
    ctx.props.add('bench', x, ctx.heightAt(x, z), z, a + Math.PI / 2, 1);
    collectible(ctx, x - Math.sin(a) * 1.6, ctx.heightAt(x - Math.sin(a) * 1.6, z + Math.cos(a) * 1.6), z + Math.cos(a) * 1.6);
    return;
  }
  // si no hay sitio, junto al mirador
  collectible(ctx, 0, ctx.heightAt(0, -262), -262);
}

export { stripedAwning, ground };
