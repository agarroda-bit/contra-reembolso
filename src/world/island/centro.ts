// El Centro: plaza con fuente, casino, club VIP, tienda de ropa, centro de salud, banco con cajero,
// supermercado (carrito loco) y un parking con rampa hasta la azotea.
import * as THREE from 'three';
import type { Ctx } from './ctx';
import { GeoBuilder, SKIP, lin } from './geo';
import { OCC } from './occ';
import { PlanCtx, Special, Out, collectible, makePoi, poiAt, ground, doorPoint, curbParking, curbGap, plazaPad } from './special';
import { glass, rollerDoor, facadeFrame, baseDepth, stripedAwning, awningCollider, overhangCollider, flatRoof, PAL } from './buildings';
import { lotPoint, Lot } from './layout';
import { fitText, roundRect, neonSign, shopSign, FONT_IMPACT, FONT, FONT_SCRIPT, FONT_SERIF, FONT_FUN } from './signs';
import { makeBeamMaterial } from './materials';
import { bankSecret } from './secretos';

const GOLD = '#e8c25a';

export function planCentro(p: PlanCtx): Special[] {
  const { layout, occ } = p;
  // la plaza: toda la manzana entre z 5..60 y x -50..50
  for (let z = 5; z < 60; z++) for (let x = -50; x < 50; x++) if (occ.get(x + 0.5, z + 0.5) === OCC.FREE) occ.set(x + 0.5, z + 0.5, OCC.RESERVED);
  // el suelo de la plaza es un plano que empalma con las cuatro calles (sin aristas bajo el pavimento)
  p.pads.push(plazaPad(p, -50, 5, 50, 60, 0, 32.5, 41, 21));
  const L = (x: number, z: number, W: number, D: number, id: string, road: string) => {
    const l = layout.lotNear(x, z, W, D, { kind: 'special' }, id, road);
    if (!l) console.warn('[isla] no cabe', id);
    return l;
  };
  const casino = L(24, -14, 30, 20, 'casino', 'Calle del Código Postal');
  const club = L(-24, -14, 30, 20, 'club', 'Calle del Código Postal');
  const clothes = L(-66, 32, 28, 14, 'clothes', 'Calle del Precinto');
  const health = L(67, 32, 30, 16, 'health', 'Calle del Celo');
  const bank = L(-25, 76, 20, 14, 'bank', 'Calle de la Etiqueta');
  const market = L(25, 76, 24, 15, 'market', 'Calle de la Etiqueta');
  const parking = L(76, 86, 30, 29, 'parking', 'Calle del Celo');
  return [
    {
      name: 'centro',
      build: (ctx, out) => {
        buildPlaza(ctx, out);
        if (casino) buildCasino(ctx, out, casino);
        if (club) buildClub(ctx, out, club);
        if (clothes) buildClothes(ctx, out, clothes);
        if (health) buildHealth(ctx, out, health);
        if (bank) buildBank(ctx, out, bank);
        if (market) buildMarket(ctx, out, market);
        if (parking) buildParking(ctx, out, parking);
      },
    },
  ];
}

// ───────────────────────── Plaza del Reembolso ─────────────────────────

function buildPlaza(ctx: Ctx, out: Out) {
  const cx = 0, cz = 32.5;
  const pave = ctx.pave;
  pave.rect(pave.walk, cx, cz, 41, 21, 0, '#e9dfcb', 1.6);
  // dibujo del pavimento: cruz y anillos
  pave.rect(pave.paint, cx, cz, 41, 1.2, 0, '#d4c3a3', 1.6);
  pave.rect(pave.paint, cx, cz, 1.2, 21, 0, '#d4c3a3', 1.6);
  pave.disc(pave.paint, cx, cz, 10.5, '#d9c9aa', 28);
  ctx.paved.push({ x: cx, z: cz, hw: 41, hd: 21, rot: 0, color: '#e9dfcb' });
  const y = ctx.heightAt(cx, cz);
  const b = ctx.solid.at(cx, cz);
  b.frame(cx, y, cz, 0);
  // fuente de dos pisos
  const stone = '#e6ddcc';
  b.cyl(0, -0.2, 0, 6.2, 6.2, 0.9, 20, stone, false);
  b.cyl(0, 0.62, 0, 6.35, 6.35, 0.12, 20, '#d4c8b2', true);
  b.cyl(0, 0.3, 0, 5.7, 5.7, 0.2, 20, '#3fb5e0', true, false, [0.05, 0.3, 0.55, 0.15]);
  b.cyl(0, 0, 0, 1.0, 0.8, 2.6, 10, stone, false);
  b.cyl(0, 2.4, 0, 1.0, 2.4, 0.5, 14, stone, false);
  b.cyl(0, 2.85, 0, 2.2, 2.2, 0.12, 14, '#4fc3ea', true, false, [0.05, 0.3, 0.55, 0.2]);
  b.cyl(0, 2.9, 0, 0.35, 0.3, 1.4, 8, stone, false);
  b.blob(0, 4.55, 0, 0.55, 0.55, 0.55, GOLD);
  // chorros de agua
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.beam(b.wx(Math.cos(a) * 1.9, Math.sin(a) * 1.9), y + 2.95, b.wz(Math.cos(a) * 1.9, Math.sin(a) * 1.9), b.wx(Math.cos(a) * 3.8, Math.sin(a) * 3.8), y + 0.55, b.wz(Math.cos(a) * 3.8, Math.sin(a) * 3.8), 0.12, '#bfeaff', [0.2, 0.5, 0.7, 0.2]);
  }
  ctx.cyl(cx, y + 0.3, cz, 0.45, 6.2);
  ctx.cyl(cx, y + 2, cz, 2, 1.0);
  ctx.foot.push({ x: cx, z: cz, hw: 6.2, hd: 6.2, rot: 0, color: '#3fb5e0', height: 1 });
  out.pois.push(poiAt(ctx, 'fountain', 'fountain', 'Fuente de la Plaza del Reembolso', cx, cz + 8.5, 0));
  // parterres con flores en las cuatro esquinas
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = cx + sx * 27, pz = cz + sz * 12;
      b.frame(px, ctx.heightAt(px, pz), pz, 0);
      b.box(0, 0.25, 0, 14, 0.5, 6, '#d8ccb4', SKIP.NY);
      b.box(0, 0.52, 0, 13.4, 0.08, 5.4, '#4f8f3f');
      for (let i = 0; i < 16; i++) b.box(-6 + (i % 8) * 1.7, 0.66, -1.6 + Math.floor(i / 8) * 3.2, 0.5, 0.25, 0.5, ['#e8394d', '#f2d13b', '#f25c8c', '#ffffff'][i % 4], SKIP.NY);
      ctx.box(px, ctx.heightAt(px, pz) + 0.3, pz, 7, 0.3, 3);
      ctx.props.add('orange', px + 4.5, ctx.heightAt(px, pz) + 0.5, pz, px, 1);
      ctx.props.add('orange', px - 4.5, ctx.heightAt(px, pz) + 0.5, pz, pz, 1);
      ctx.foot.push({ x: px, z: pz, hw: 7, hd: 3, rot: 0, color: '#6fa84f', height: 0.5 });
    }
  }
  // palmeras y farolas alrededor de la fuente
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const px = cx + Math.cos(a) * 14, pz = cz + Math.sin(a) * 11.5;
    ctx.props.add(i % 2 ? 'palm' : 'lampOld', px, ctx.heightAt(px, pz), pz, a, i % 2 ? 1.1 : 1);
  }
  // bancos mirando a la fuente
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const px = cx + Math.cos(a) * 9.2, pz = cz + Math.sin(a) * 9.2;
    ctx.props.add('bench', px, ctx.heightAt(px, pz), pz, Math.atan2(-Math.cos(a), -Math.sin(a)), 1);
  }
  // bolardos en los bordes de la plaza
  for (let x = -39; x <= 39; x += 3) {
    if (Math.abs(x) < 4) continue;
    for (const z of [cz - 20.2, cz + 20.2]) ctx.props.add('bollard', x, ctx.heightAt(x, z), z, 0, 1);
  }
  // papeleras fijas
  for (const [dx, dz] of [[-16, -8], [16, -8], [-16, 8], [16, 8], [-36, 0], [36, 0]]) ctx.props.add('bin', cx + dx, ctx.heightAt(cx + dx, cz + dz), cz + dz, 0, 1);
  // quiosco de prensa
  const kx = -30, kz = cz - 3;
  const ky = ctx.heightAt(kx, kz);
  b.frame(kx, ky, kz, Math.PI / 2);
  b.box(0, 1.3, 0, 3.2, 2.6, 2.4, '#2f6f3a', SKIP.NY);
  b.box(0, 2.75, 0, 3.8, 0.3, 3.0, '#244f2c');
  b.box(0, 3.1, 0, 1.2, 0.4, 1.2, '#244f2c');
  glass(ctx.win.at(kx, kz).frame(kx, ky, kz, Math.PI / 2), 0, 1.6, 1.22, 2.6, 1.0, [1, 0.85, 0.55, 0.2]);
  ctx.signs.define('quiosco', 3, 0.6, shopSign('#c0392b', '#ffffff', 'Quiosco El Cotilleo', undefined, FONT_FUN));
  ctx.signs.place(b, 'quiosco', 0, 2.3, 1.24, 3, 0.55, 0.3);
  ctx.box(kx, ky + 1.3, kz, 1.6, 1.3, 1.2, Math.PI / 2);
  // puestos de fruta (rompibles) en un lado de la plaza
  for (let i = 0; i < 3; i++) ctx.breakables.push({ kind: 'fruit', pos: ground(ctx, 18 + i * 4.5, cz + 16.5), rotY: Math.PI });
  for (let i = 0; i < 2; i++) ctx.breakables.push({ kind: 'bench', pos: ground(ctx, -12 + i * 24, cz + 17), rotY: Math.PI });
  // carrito de golf del casino, al borde de la plaza frente al casino
  ctx.specials.push({ kind: 'golf', pos: ground(ctx, 30, 15.5), heading: -Math.PI / 2 });
  // dentro de la fuente, sobre el agua (el colisor del vaso llega a y + 0,75)
  collectible(ctx, cx + 3.6, y + 0.75, cz);
}

// ───────────────────────── Casino La Suerte Loca ─────────────────────────

function buildCasino(ctx: Ctx, out: Out, lot: Lot) {
  const b = ctx.solid.at(lot.x, lot.z);
  const w = ctx.win.at(lot.x, lot.z);
  const hw = lot.hw, hd = lot.hd, H = 13;
  const y0 = baseDepth(ctx, lot);
  const red = '#a8102a', dark = '#6a0a1a';
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  b.box(0, (y0 + H) / 2, 0, hw * 2, H - y0, hd * 2, red, SKIP.NY | SKIP.PY);
  flatRoof(b, ctx, hw, hd, H, '#5a2030', GOLD, ctx.rng, false, 0.8);
  ctx.box(lot.x, lot.h + (y0 + H) / 2, lot.z, hw, (H - y0) / 2, hd, lot.rot);
  for (let k = 0; k < 4; k++) {
    if (k !== 0 && !exposedSide(ctx, lot, k)) continue;
    const { half } = facadeFrame(b, lot, k);
    facadeFrame(w, lot, k);
    b.panelZ(0, (y0 + 0.8) / 2, 0.03, half * 2, 0.8 - y0, dark);
    b.box(0, H - 0.3, 0.15, half * 2 + 0.3, 0.6, 0.3, GOLD, SKIP.NZ);
    b.box(0, 4.6, 0.1, half * 2 + 0.1, 0.25, 0.2, GOLD, SKIP.NZ);
    if (k !== 0) {
      for (let x = -half + 2; x < half - 1; x += 3.2) glass(w, x, 8.5, 0.05, 1.6, 3.2, [1, 0.5, 0.7, 0.1]);
      continue;
    }
    // columnas doradas y puertas (la marquesina no pasa del bordillo)
    const gap = curbGap(lot);
    const colZ = Math.min(4.2, gap - 0.5), md = colZ + 0.3;
    for (const x of [-9, -3, 3, 9]) {
      b.cyl(x, 0, colZ, 0.35, 0.35, 4.3, 8, GOLD, false);
      const cp = lotPoint(lot, x, hd + colZ);
      ctx.cyl(cp.x, lot.h + 2.15, cp.z, 2.15, 0.35);
    }
    glass(w, 0, 1.6, 0.05, 7, 3.2, [1, 0.8, 0.5, 0.02], lin('#3a1020').clone(), lin('#8a4060').clone());
    for (const x of [-3.5, -1.2, 1.2, 3.5]) b.panelZ(x, 1.6, 0.07, 0.12, 3.2, GOLD);
    for (const x of [-12, -7.5, 7.5, 12]) glass(w, x, 2.2, 0.05, 3, 2.6, [1, 0.6, 0.3, 0.02], lin('#3a1020').clone(), lin('#7a3050').clone());
    // marquesina con bombillas
    b.box(0, 4.45, md / 2, 20, 0.5, md, dark, 0);
    b.box(0, 4.75, md / 2, 20.2, 0.12, md + 0.2, GOLD);
    for (let x = -9.5; x <= 9.5; x += 0.8) {
      b.box(x, 4.15, md - 0.05, 0.2, 0.2, 0.12, '#fff3c4', SKIP.NZ, [1.2, 0.9, 0.4, 2 + (Math.round(x / 0.8) % 2 ? 0.5 : 0)]);
      for (let z = 0.6; z < md - 0.3; z += 1.2) b.box(x, 4.18, z, 0.15, 0.06, 0.15, '#fff3c4', SKIP.PY, [1.2, 0.9, 0.4, 0.3]);
    }
    // gran cartel de neón con marco de bombillas
    ctx.signs.define('casino', 18, 4, (g, W, Hh) => {
      g.fillStyle = '#1a0610';
      roundRect(g, 0, 0, W, Hh, Hh * 0.14);
      g.fill();
      g.shadowColor = '#ffcf40';
      g.shadowBlur = Hh * 0.1;
      g.strokeStyle = '#ffcf40';
      g.lineWidth = Hh * 0.04;
      roundRect(g, Hh * 0.08, Hh * 0.08, W - Hh * 0.16, Hh - Hh * 0.16, Hh * 0.1);
      g.stroke();
      g.shadowColor = '#ff3b6b';
      g.shadowBlur = Hh * 0.12;
      fitText(g, 'CASINO', W / 2, Hh * 0.34, W * 0.5, Hh * 0.38, FONT_IMPACT, '400', '#ffd23f', '#ff3b6b', Hh * 0.04);
      g.shadowColor = '#ff3b6b';
      fitText(g, 'La Suerte Loca', W / 2, Hh * 0.72, W * 0.8, Hh * 0.34, FONT_SCRIPT, '700', '#ff7aa8');
      g.shadowBlur = 0;
      // tréboles y dados
      for (const [x, s] of [[W * 0.1, '♣'], [W * 0.9, '♦']]) fitText(g, s as string, x as number, Hh * 0.5, Hh * 0.5, Hh * 0.5, FONT, '900', '#ffd23f');
    });
    ctx.signs.place(b, 'casino', 0, 8.4, 0.22, 18, 4, 1);
    for (let i = 0; i <= 24; i++) {
      const x = -9.3 + (18.6 * i) / 24;
      for (const yy of [6.2, 10.6]) b.box(x, yy, 0.25, 0.22, 0.22, 0.14, '#fff3c4', SKIP.NZ, [1.2, 0.95, 0.5, 2 + ((i + (yy > 8 ? 1 : 0)) % 2) * 0.5]);
    }
    // alfombra roja hasta el bordillo
    const rp = lotPoint(lot, 0, hd + gap / 2);
    ctx.pave.rect(ctx.pave.paint, rp.x, rp.z, 1.8, gap / 2 - 0.08, lot.rot, '#b0102a', 2);
  }
  // dado gigante y naipe en la azotea
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  b.boxRot(-7, H + 2.3, -2, 4, 4, 4, 0.25, 0.4, 0.15, '#f4f1ea');
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0.4, 0.15, 'YXZ'));
  const fm = b.frameMatrix(new THREE.Matrix4());
  const dots: [number, number, number][] = [[0, 0, 2.02], [1, 1, 2.02], [-1, -1, 2.02], [2.02, 1, 1], [2.02, -1, -1], [0, 2.02, 0], [1, 2.02, 1], [-1, 2.02, -1], [1, 2.02, -1], [-1, 2.02, 1]];
  const m = new THREE.Matrix4(), s = new THREE.Vector3(0.7, 0.7, 0.7), pp = new THREE.Vector3();
  for (const [dx, dy, dz] of dots) {
    pp.set(dx, dy, dz).applyQuaternion(q).add(new THREE.Vector3(-7, H + 2.3, -2));
    const sc = new THREE.Vector3(Math.abs(dx) > 2 ? 0.08 : 0.7, Math.abs(dy) > 2 ? 0.08 : 0.7, Math.abs(dz) > 2 ? 0.08 : 0.7);
    m.compose(pp, q, sc);
    b.boxMat(fm.clone().multiply(m), '#c0102a');
  }
  void s;
  ctx.signs.define('naipe', 2, 3, (g, W, Hh) => {
    g.fillStyle = '#ffffff';
    roundRect(g, 0, 0, W, Hh, W * 0.12);
    g.fill();
    g.strokeStyle = '#333';
    g.lineWidth = W * 0.03;
    roundRect(g, W * 0.04, W * 0.04, W - W * 0.08, Hh - W * 0.08, W * 0.1);
    g.stroke();
    fitText(g, 'A', W * 0.2, Hh * 0.12, W * 0.3, Hh * 0.14, FONT_SERIF, '700', '#c0102a');
    fitText(g, '♥', W / 2, Hh / 2, W * 0.7, Hh * 0.45, FONT, '900', '#c0102a');
  });
  b.frame(lotPoint(lot, 6, -1).x, lot.h + H, lotPoint(lot, 6, -1).z, lot.rot + 0.3);
  b.box(0, 2.4, -0.12, 3.4, 5, 0.2, '#ffffff', SKIP.PZ);
  ctx.signs.place(b, 'naipe', 0, 2.4, 0.0, 3.2, 4.8, 0.5);
  out.pois.push(makePoi(ctx, 'casino', 'casino', 'Casino La Suerte Loca', lot, 0, true, Math.min(1.8, curbGap(lot) - 0.7)));
  // focos que barren el cielo por la noche
  searchlights(ctx, out, lotPoint(lot, -12, -6), lot.h + H + 0.8, '#fff2c0');
  ctx.foot.push({ x: lot.x, z: lot.z, hw, hd, rot: lot.rot, color: red, height: H });
}

function exposedSide(ctx: Ctx, lot: Lot, k: number): boolean {
  const ang = lot.rot + (k * Math.PI) / 2;
  const dist = (k % 2 === 0 ? lot.hd : lot.hw) + 1.6;
  const v = ctx.occ.get(lot.x + Math.sin(ang) * dist, lot.z + Math.cos(ang) * dist);
  return v !== OCC.BUILDING;
}

/** Dos haces de luz que barren el cielo de noche. */
function searchlights(ctx: Ctx, out: Out, p: { x: number; z: number }, y: number, color: string) {
  const geo = new THREE.ConeGeometry(6, 90, 12, 1, true);
  geo.rotateX(Math.PI);
  geo.translate(0, 45, 0);
  const mat = makeBeamMaterial(color);
  const g = new THREE.Group();
  const beams: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(i * 3 - 1.5, 0, 0);
    beams.push(m);
    g.add(m);
  }
  g.position.set(p.x, y, p.z);
  g.visible = false;
  g.name = 'focos';
  (g as any).nightMat = mat;
  ctx.game.scene.add(g);
  out.nightMeshes.push(g);
  out.animated.push((_dt, t) => {
    if (!g.visible) return;
    beams[0].rotation.set(Math.sin(t * 0.7) * 0.5, 0, Math.cos(t * 0.5) * 0.45);
    beams[1].rotation.set(Math.cos(t * 0.6) * 0.5, 0, -Math.sin(t * 0.8) * 0.45);
  });
  const b = ctx.solid.at(p.x, p.z);
  b.frame(p.x, y - 0.8, p.z, 0);
  b.box(-1.5, 0.4, 0, 1, 0.8, 1, '#333');
  b.box(1.5, 0.4, 0, 1, 0.8, 1, '#333');
}

// ───────────────────────── Club Reembolso VIP ─────────────────────────

function buildClub(ctx: Ctx, out: Out, lot: Lot) {
  const b = ctx.solid.at(lot.x, lot.z);
  const hw = lot.hw, hd = lot.hd, H = 10;
  const y0 = baseDepth(ctx, lot);
  const black = '#1a1026';
  const purple = [0.55, 0.15, 1.2, 0.35], pink = [1.3, 0.2, 0.7, 0.35];
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  b.box(0, (y0 + H) / 2, 0, hw * 2, H - y0, hd * 2, black, SKIP.NY | SKIP.PY);
  flatRoof(b, ctx, hw, hd, H, '#2a2036', black, ctx.rng, false, 0.8);
  ctx.box(lot.x, lot.h + (y0 + H) / 2, lot.z, hw, (H - y0) / 2, hd, lot.rot);
  // laterales a la vista: dos tiras de neón y un rombo (que de noche no sea un bloque negro)
  for (let k = 1; k < 4; k++) {
    if (!exposedSide(ctx, lot, k)) continue;
    const f = facadeFrame(b, lot, k);
    b.box(0, H - 0.35, 0.1, f.half * 2, 0.18, 0.1, '#b36bff', SKIP.NZ, purple);
    b.box(0, 5.4, 0.1, f.half * 2, 0.14, 0.1, '#ff5fb8', SKIP.NZ, pink);
    b.boxRot(0, 7.6, 0.12, 1.4, 1.4, 0.1, 0, 0, Math.PI / 4, '#b36bff', 0, purple);
    b.boxRot(0, 7.6, 0.18, 1.0, 1.0, 0.1, 0, 0, Math.PI / 4, black);
  }
  const { half } = facadeFrame(b, lot, 0);
  // tiras de neón
  b.box(0, H - 0.35, 0.12, half * 2, 0.22, 0.12, '#b36bff', SKIP.NZ, purple);
  b.box(0, 5.4, 0.12, half * 2, 0.16, 0.12, '#ff5fb8', SKIP.NZ, pink);
  b.box(0, 0.6, 0.12, half * 2, 0.12, 0.12, '#b36bff', SKIP.NZ, purple);
  for (const x of [-half + 0.15, half - 0.15]) b.box(x, H / 2, 0.12, 0.16, H - 0.4, 0.14, '#ff5fb8', SKIP.NZ, pink);
  // rombos de neón decorativos
  for (const x of [-11, -7, 7, 11]) {
    b.boxRot(x, 7.6, 0.14, 1.4, 1.4, 0.1, 0, 0, Math.PI / 4, '#b36bff', 0, purple);
    b.boxRot(x, 7.6, 0.2, 1.0, 1.0, 0.1, 0, 0, Math.PI / 4, black);
  }
  // puerta y marquesina
  b.panelZ(0, 1.6, 0.05, 3.6, 3.2, '#0d0812');
  b.panelZ(0, 1.5, 0.07, 2.8, 2.9, '#241634');
  b.panelZ(0, 1.5, 0.09, 0.08, 2.9, GOLD);
  const gap = curbGap(lot);
  const md = Math.min(3.2, gap - 0.2);
  b.box(0, 3.6, md / 2, 6, 0.3, md, black);
  b.box(0, 3.45, md - 0.05, 6, 0.08, 0.1, '#ff5fb8', 0, pink);
  ctx.signs.define('club', 14, 3, neonSign('Club Reembolso', '#ff4fb0', 'V I P · solo gente importante (y tú)', '#c68bff', '#12091c'));
  ctx.signs.place(b, 'club', 0, 7.5, 0.2, 13, 2.8, 1);
  // alfombra roja con cordón (de la puerta al bordillo, sin invadir la calzada)
  const rp = lotPoint(lot, 0, hd + gap / 2);
  ctx.pave.rect(ctx.pave.paint, rp.x, rp.z, 1.3, gap / 2 - 0.08, lot.rot, '#b0102a', 2);
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  const posts = 3, step = (gap - 0.9) / (posts - 1);
  for (const s of [-1, 1]) {
    for (let i = 0; i < posts; i++) {
      const z = hd + 0.5 + i * step;
      b.cyl(s * 1.9, 0, z, 0.06, 0.06, 1.0, 6, GOLD, true);
      b.cyl(s * 1.9, 0, z, 0.2, 0.2, 0.06, 8, GOLD, true);
      b.blob(s * 1.9, 1.05, z, 0.09, 0.09, 0.09, GOLD);
      if (i < posts - 1) b.beam(b.wx(s * 1.9, z), lot.h + 0.92, b.wz(s * 1.9, z), b.wx(s * 1.9, z + step), lot.h + 0.92, b.wz(s * 1.9, z + step), 0.07, '#c0102a');
    }
  }
  // estrella VIP en la azotea
  b.frame(lot.x, lot.h + H, lot.z, lot.rot);
  ctx.signs.define('club-star', 3, 3, (g, W, Hh) => {
    g.clearRect(0, 0, W, Hh);
    g.shadowColor = '#ff4fb0';
    g.shadowBlur = W * 0.08;
    g.fillStyle = '#ffd23f';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? W * 0.2 : W * 0.46;
      g.lineTo(W / 2 + Math.cos(a) * r, Hh / 2 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    fitText(g, 'VIP', W / 2, Hh * 0.54, W * 0.34, Hh * 0.2, FONT_IMPACT, '400', '#6a0a8a');
  });
  b.box(0, 2.2, -hd + 3, 0.2, 4.4, 0.2, '#333');
  ctx.signs.place(b, 'club-star', 0, 4.2, -hd + 3.12, 4, 4, 1);
  out.pois.push(makePoi(ctx, 'club', 'club', 'Club Reembolso VIP', lot, 0, true, Math.min(1.8, gap - 0.7)));
  searchlights(ctx, out, lotPoint(lot, 10, -4), lot.h + H + 0.8, '#e0a0ff');
  ctx.foot.push({ x: lot.x, z: lot.z, hw, hd, rot: lot.rot, color: black, height: H });
}

// ───────────────────────── Moda Paquetona ─────────────────────────

function buildClothes(ctx: Ctx, out: Out, lot: Lot) {
  const b = ctx.solid.at(lot.x, lot.z);
  const w = ctx.win.at(lot.x, lot.z);
  const hw = lot.hw, hd = lot.hd, H = 11.5;
  const y0 = baseDepth(ctx, lot);
  const white = '#fbf7f2', pink = '#e05aa0';
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  b.box(0, (y0 + H) / 2, 0, hw * 2, H - y0, hd * 2, white, SKIP.NY | SKIP.PY);
  flatRoof(b, ctx, hw, hd, H, '#d8cfc4', pink, ctx.rng, true, 0.8);
  ctx.box(lot.x, lot.h + (y0 + H) / 2, lot.z, hw, (H - y0) / 2, hd, lot.rot);
  for (let k = 0; k < 4; k++) {
    if (k !== 0 && !exposedSide(ctx, lot, k)) continue;
    const { half } = facadeFrame(b, lot, k);
    facadeFrame(w, lot, k);
    b.panelZ(0, (y0 + 0.6) / 2, 0.03, half * 2, 0.6 - y0, '#1b1b1b');
    b.box(0, 4.3, 0.1, half * 2 + 0.1, 0.3, 0.2, pink, SKIP.NZ);
    for (let f = 0; f < 2; f++) {
      for (let x = -half + 2.2; x < half - 1; x += 3.4) {
        glass(w, x, 6.2 + f * 3.3, 0.05, 1.5, 1.9, [1, 0.8, 0.9, 0.2 + f * 0.3]);
        b.panelZ(x, 6.2 + f * 3.3, 0.04, 1.8, 2.2, pink);
      }
    }
    if (k !== 0) continue;
    // escaparates con maniquíes
    for (const x of [-9, 9]) {
      glass(w, x, 2.0, 0.05, 8, 3.2, [1, 0.9, 0.95, 0.02], lin('#3a3440').clone(), lin('#a090b0').clone());
      for (let i = -1; i <= 1; i++) {
        const mx = x + i * 2.4;
        const c = ['#e8394d', '#ffd23f', '#2f7fcf'][i + 1];
        b.box(mx, 0.9, -0.3, 0.5, 1.2, 0.3, '#222');
        b.box(mx, 1.9, -0.3, 0.7, 0.9, 0.35, c);
        b.box(mx, 2.55, -0.3, 0.3, 0.35, 0.3, '#f0d0b0');
      }
    }
    b.panelZ(0, 1.5, 0.05, 3.4, 3.0, '#1b1b1b');
    glass(w, 0, 1.45, 0.07, 2.8, 2.8, [1, 0.9, 0.95, 0.02]);
    stripedAwning(b, 0, 3.9, 0.05, half * 2 - 1, 1.5, 0.5, '#1b1b1b', '#fbf7f2', 14);
    awningCollider(ctx, b, 0, 3.9, 0.05, half * 2 - 1, 1.5);
    ctx.signs.define('moda', 12, 2.2, (g, W, Hh) => {
      g.fillStyle = '#1b1b1b';
      roundRect(g, 0, 0, W, Hh, Hh * 0.2);
      g.fill();
      g.shadowColor = '#ff4fb0';
      g.shadowBlur = Hh * 0.08;
      fitText(g, 'Moda Paquetona', W / 2, Hh * 0.42, W * 0.9, Hh * 0.6, FONT_SCRIPT, '700', '#ff6fb8');
      g.shadowBlur = 0;
      fitText(g, 'Ropa para entregar con estilo (y ligar un poco)', W / 2, Hh * 0.82, W * 0.86, Hh * 0.15, FONT, '700', '#ffffff');
    });
    ctx.signs.place(b, 'moda', 0, 4.95, 0.22, 11, 2.0, 0.7);
    ctx.signs.define('rebajas', 1.4, 5, (g, W, Hh) => {
      g.fillStyle = '#e8394d';
      g.fillRect(0, 0, W, Hh);
      g.save();
      g.translate(W / 2, Hh / 2);
      g.rotate(-Math.PI / 2);
      fitText(g, 'REBAJAS -70%', 0, 0, Hh * 0.92, W * 0.62, FONT_IMPACT, '400', '#ffffff');
      g.restore();
    });
    ctx.signs.place(b, 'rebajas', half - 1.2, 8.3, 0.25, 1.3, 4.8, 0.4);
    ctx.signs.place(b, 'rebajas', -half + 1.2, 8.3, 0.25, 1.3, 4.8, 0.4);
  }
  out.pois.push(makePoi(ctx, 'clothes', 'clothes', 'Moda Paquetona', lot, 0, true));
  ctx.foot.push({ x: lot.x, z: lot.z, hw, hd, rot: lot.rot, color: pink, height: H });
}

// ───────────────────────── Centro de Salud Tiritas ─────────────────────────

function buildHealth(ctx: Ctx, out: Out, lot: Lot) {
  const b = ctx.solid.at(lot.x, lot.z);
  const w = ctx.win.at(lot.x, lot.z);
  const hw = lot.hw, hd = lot.hd, H = 12;
  const y0 = baseDepth(ctx, lot);
  const white = '#f7f7f5', green = '#1e9e5a';
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  b.box(0, (y0 + H) / 2, 0, hw * 2, H - y0, hd * 2, white, SKIP.NY | SKIP.PY);
  flatRoof(b, ctx, hw, hd, H, '#cfd4d0', green, ctx.rng, true, 0.9);
  ctx.box(lot.x, lot.h + (y0 + H) / 2, lot.z, hw, (H - y0) / 2, hd, lot.rot);
  for (let k = 0; k < 4; k++) {
    if (k !== 0 && !exposedSide(ctx, lot, k)) continue;
    const { half } = facadeFrame(b, lot, k);
    facadeFrame(w, lot, k);
    b.panelZ(0, (y0 + 0.6) / 2, 0.03, half * 2, 0.6 - y0, '#8a9a90');
    b.box(0, 4.1, 0.1, half * 2 + 0.1, 0.5, 0.2, green, SKIP.NZ);
    for (let f = 0; f < 2; f++) {
      b.panelZ(0, 6.1 + f * 3.2, 0.03, half * 2 - 1, 1.8, '#dfe8e4');
      for (let x = -half + 1.8; x < half - 1; x += 2.6) glass(w, x, 6.1 + f * 3.2, 0.05, 2.0, 1.5, [0.8, 0.95, 1.0, 0.3 + f * 0.3]);
    }
    if (k !== 0) continue;
    // entrada, urgencias y cruz verde
    b.panelZ(-5, 1.55, 0.04, 5, 3.1, '#5a6a64');
    glass(w, -5, 1.5, 0.06, 4.6, 2.9, [0.85, 1, 0.95, 0.02]);
    b.box(-5, 3.35, 1.6, 7, 0.25, 3.2, green);
    overhangCollider(ctx, b, -5, 3.35, 1.6, 3.5, 0.125, 1.6); // marquesina: que la cámara no se meta
    for (let x = 1; x < half - 1; x += 3) glass(w, x, 2.0, 0.05, 2.4, 2.2, [0.85, 1, 0.95, 0.1]);
    ctx.signs.define('salud', 12, 1.8, (g, W, Hh) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, W, Hh);
      g.fillStyle = green;
      g.fillRect(0, 0, Hh, Hh);
      g.fillStyle = '#ffffff';
      g.fillRect(Hh * 0.38, Hh * 0.15, Hh * 0.24, Hh * 0.7);
      g.fillRect(Hh * 0.15, Hh * 0.38, Hh * 0.7, Hh * 0.24);
      fitText(g, 'Centro de Salud Tiritas', (W + Hh) / 2, Hh * 0.4, W - Hh * 1.3, Hh * 0.5, FONT, '900', green);
      fitText(g, 'Curamos rasguños, sustos y resacas', (W + Hh) / 2, Hh * 0.78, W - Hh * 1.4, Hh * 0.2, FONT, '700', '#5a6a64');
    });
    ctx.signs.place(b, 'salud', 2, H - 1.2, 0.2, 12, 1.8, 0.5);
    ctx.signs.define('urgencias', 4, 0.8, (g, W, Hh) => {
      g.fillStyle = '#d6312b';
      g.fillRect(0, 0, W, Hh);
      fitText(g, 'URGENCIAS', W / 2, Hh / 2, W * 0.9, Hh * 0.7, FONT, '900', '#ffffff');
    });
    ctx.signs.place(b, 'urgencias', 6, 3.3, 0.2, 4, 0.8, 1);
    // cruz verde de neón en voladizo
    b.box(half - 1.2, 8.5, 0.6, 0.15, 0.15, 1.2, '#666');
    b.box(half - 1.2, 8.5, 1.2, 0.5, 1.8, 0.3, '#2ee07a', 0, [0.1, 1.2, 0.4, 0.4]);
    b.box(half - 1.2, 8.5, 1.2, 0.5, 0.5, 1.4, '#2ee07a', 0, [0.1, 1.2, 0.4, 0.4]);
  }
  // plaza de ambulancia
  const ap = curbParking(ctx, lot, 6);
  ctx.pave.rect(ctx.pave.paint, ap.pos.x, ap.pos.z, 1.4, 3.2, ap.heading, '#f2d13b', 2);
  out.pois.push(makePoi(ctx, 'health', 'health', 'Centro de Salud Tiritas', lot, -5, true));
  out.extra.ambulance = ap;
  ctx.foot.push({ x: lot.x, z: lot.z, hw, hd, rot: lot.rot, color: '#e0f0e8', height: H });
}

// ───────────────────────── Banco con cajero ─────────────────────────

function buildBank(ctx: Ctx, out: Out, lot: Lot) {
  const b = ctx.solid.at(lot.x, lot.z);
  const w = ctx.win.at(lot.x, lot.z);
  const hw = lot.hw, hd = lot.hd, H = 10;
  const y0 = baseDepth(ctx, lot);
  const stone = '#e6d8ba', trim = '#cdbd98';
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  b.box(0, (y0 + H) / 2, 0, hw * 2, H - y0, hd * 2, stone, SKIP.NY | SKIP.PY);
  // azotea secreta (pasaje, escalera de incendios y piscina de monedas); si no encaja, la de siempre
  if (!bankSecret(ctx, out, lot, H)) flatRoof(b, ctx, hw, hd, H, '#c9bfa8', trim, ctx.rng, false, 1.0);
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  ctx.box(lot.x, lot.h + (y0 + H) / 2, lot.z, hw, (H - y0) / 2, hd, lot.rot);
  const { half } = facadeFrame(b, lot, 0);
  facadeFrame(w, lot, 0);
  b.box(0, 0.35, 0.8, half * 2, 0.7, 1.6, trim);
  for (const x of [-7, -3.5, 3.5, 7]) {
    b.cyl(x, 0.7, 1.1, 0.45, 0.4, 6.3, 10, '#f3ead6', false);
    // columnas macizas con colisor de caja (uno de cilindro fino lo ignoraría la cámara y se quedaba detrás)
    ctx.box(b.wx(x, 1.1), b.wy(3.85), b.wz(x, 1.1), 0.42, 3.15, 0.42, b.frameRot);
  }
  b.box(0, 7.2, 1.0, half * 2 - 2, 0.8, 2.0, trim);
  b.roof(0, 7.6, 1.0, half * 2 - 2, 2.0, 1.8, '#d8c9a8', '#d8c9a8', true);
  overhangCollider(ctx, b, 0, 8.1, 1.0, half - 1, 1.3, 1.0, false); // frontón del pórtico (alto: siempre encendido)
  b.panelZ(0, 1.9, 0.05, 2.8, 3.4, '#5a3a22');
  glass(w, 0, 1.9, 0.07, 2.2, 3.0, [1, 0.85, 0.55, 0.05]);
  for (const x of [-5.2, 5.2]) glass(w, x, 3.6, 0.05, 1.6, 3.2, [1, 0.85, 0.55, 0.1]);
  // cajero
  b.panelZ(-8.3, 1.4, 0.05, 1.1, 2.0, '#2b3038');
  b.panelZ(-8.3, 1.6, 0.07, 0.62, 0.42, '#58d8ff', [0.2, 0.7, 1.0, 0.6]);
  ctx.signs.place(b, 'atm', -8.3, 2.7, 0.08, 1.0, 0.33, 0.8);
  ctx.signs.define('banco', 10, 1.2, (g, W, Hh) => {
    g.fillStyle = '#1f3f6f';
    g.fillRect(0, 0, W, Hh);
    fitText(g, 'CAJA DE AHORROS LA HUCHA ROTA', W / 2, Hh * 0.42, W * 0.92, Hh * 0.46, FONT_SERIF, '700', '#f3e2b8');
    fitText(g, 'Tu dinero, a salvo (casi siempre)', W / 2, Hh * 0.8, W * 0.8, Hh * 0.2, FONT_SERIF, 'italic 600', '#f3e2b8');
  });
  ctx.signs.place(b, 'banco', 0, 8.4, 2.05, 10, 1.2, 0.3);
  out.pois.push(makePoi(ctx, 'atm-centro', 'atm', 'Cajero de la Caja La Hucha Rota', lot, -8.3, true, 2.2));
  out.delivery.push({ id: 'banco', district: 'centro', door: doorPoint(ctx, lot, 0, 2.2), facing: lot.rot, label: 'Caja de Ahorros La Hucha Rota' });
  ctx.foot.push({ x: lot.x, z: lot.z, hw, hd, rot: lot.rot, color: stone, height: H });
}

// ───────────────────────── Supermercado El Carrito Loco ─────────────────────────

function buildMarket(ctx: Ctx, out: Out, lot: Lot) {
  const b = ctx.solid.at(lot.x, lot.z);
  const w = ctx.win.at(lot.x, lot.z);
  const hw = lot.hw, hd = lot.hd, H = 7;
  const y0 = baseDepth(ctx, lot);
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  b.box(0, (y0 + H) / 2, 0, hw * 2, H - y0, hd * 2, '#f4f1ea', SKIP.NY | SKIP.PY);
  flatRoof(b, ctx, hw, hd, H, '#cfc8bc', '#e8394d', ctx.rng, true, 0.9);
  ctx.box(lot.x, lot.h + (y0 + H) / 2, lot.z, hw, (H - y0) / 2, hd, lot.rot);
  const { half } = facadeFrame(b, lot, 0);
  facadeFrame(w, lot, 0);
  b.panelZ(0, H - 1.3, 0.04, half * 2, 2.2, '#e8394d');
  glass(w, 0, 1.8, 0.05, half * 2 - 2, 3.2, [1, 1, 0.95, 0.02], lin('#40586c').clone(), lin('#a0c4dc').clone());
  for (let x = -half + 1; x <= half - 1; x += 2.75) b.panelZ(x, 1.8, 0.07, 0.12, 3.2, '#b8b8b8');
  ctx.signs.define('super', 12, 1.8, shopSign('#e8394d', '#ffffff', 'Supermercado El Carrito Loco', 'Ofertas que dan vértigo', FONT_IMPACT));
  ctx.signs.place(b, 'super', 0, H - 1.3, 0.1, 12, 1.8, 0.6);
  // carritos aparcados en la acera
  const cart = ground(ctx, lotPoint(lot, half + 1.5, hd + 1.5).x, lotPoint(lot, half + 1.5, hd + 1.5).z);
  ctx.specials.push({ kind: 'cart', pos: cart, heading: lot.rot + Math.PI / 2 });
  out.pois.push(makePoi(ctx, 'shop-super', 'shop', 'Supermercado El Carrito Loco', lot, 0, true));
  for (let i = 0; i < 2; i++) ctx.breakables.push({ kind: 'fruit', pos: ground(ctx, lotPoint(lot, -half + 2 + i * 3, hd + 1.4).x, lotPoint(lot, -half + 2 + i * 3, hd + 1.4).z), rotY: lot.rot });
  ctx.foot.push({ x: lot.x, z: lot.z, hw, hd, rot: lot.rot, color: '#f4f1ea', height: H });
}

// ───────────────────────── Parking con rampa a la azotea ─────────────────────────

function buildParking(ctx: Ctx, out: Out, lot: Lot) {
  const b = ctx.solid.at(lot.x, lot.z);
  const hw = lot.hw, hd = lot.hd, H = 4.6;
  const y0 = baseDepth(ctx, lot);
  const grey = '#b9b6ae';
  const rampW = 5.5;
  // edificio bajo (ocupa todo menos la franja de la rampa, en el lado -x local)
  const bx0 = -hw + rampW, bw = hw * 2 - rampW;
  const bcx = (bx0 + hw) / 2;
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  b.box(bcx, (y0 + H) / 2, 0, bw, H - y0, hd * 2, grey, SKIP.NY | SKIP.PY);
  b.quadL(bx0, H, hd, hw, H, hd, hw, H, -hd, bx0, H, -hd, '#6f737a');
  // plazas pintadas en la azotea
  for (let z = -hd + 3; z < hd - 5; z += 2.8) {
    b.quadL(bx0 + 1, H + 0.02, z + 0.06, bx0 + 6, H + 0.02, z + 0.06, bx0 + 6, H + 0.02, z - 0.06, bx0 + 1, H + 0.02, z - 0.06, '#f4f1ea');
    b.quadL(hw - 6, H + 0.02, z + 0.06, hw - 1, H + 0.02, z + 0.06, hw - 1, H + 0.02, z - 0.06, hw - 6, H + 0.02, z - 0.06, '#f4f1ea');
  }
  const bc = lotPoint(lot, bcx, 0);
  ctx.box(bc.x, lot.h + (y0 + H) / 2, bc.z, bw / 2, (H - y0) / 2, hd, lot.rot);
  // peto alrededor de la azotea (abierto donde llega la rampa, al fondo del lado -x)
  const walls: [number, number, number, number][] = [
    [bcx, hd - 0.15, bw, 0.3],
    [bcx + rampW / 2 - 0.01, -hd + 0.15, bw - rampW, 0.3],
    [hw - 0.15, 0, 0.3, hd * 2],
  ];
  for (const [x, z, sx, sz] of walls) {
    b.box(x, H + 0.55, z, sx, 1.1, sz, '#d8d4cc', SKIP.NY);
    const p = lotPoint(lot, x, z);
    ctx.box(p.x, lot.h + H + 0.55, p.z, sx / 2, 0.55, sz / 2, lot.rot);
  }
  // rampa: sube desde la fachada (+z local) hacia el fondo (-z) por el lado -x
  const rx = -hw + rampW / 2;
  const land = 6.5; // rellano arriba (para girar el coche hacia la azotea)
  const L = hd * 2 - land;
  const z0 = hd, z1 = z0 - L;
  const ang = Math.atan2(H, L);
  b.quadL(rx - rampW / 2, 0.03, z0, rx + rampW / 2, 0.03, z0, rx + rampW / 2, H, z1, rx - rampW / 2, H, z1, '#5d6068');
  b.quadL(rx - rampW / 2, 0.03, z0 + 0.01, rx - rampW / 2, H, z1, rx - rampW / 2, 0.03, z1, rx - rampW / 2, 0.03, z0, '#a9a59c');
  b.box(rx - rampW / 2 + 0.1, H * 0.5 + 0.5, (z0 + z1) / 2, 0.2, H + 1, L, '#d8d4cc');
  b.box(rx, H - 0.1, z1 - land / 2, rampW, 0.2, land, '#6f737a');
  b.box(rx, H + 0.55, -hd + 0.15, rampW, 1.1, 0.3, '#d8d4cc');
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6;
    b.quadL(rx - 0.1, 0.05 + H * t, z0 - L * t + 0.8, rx + 0.1, 0.05 + H * t, z0 - L * t + 0.8, rx + 0.1, 0.05 + H * t + 0.1, z0 - L * t - 0.4, rx - 0.1, 0.05 + H * t + 0.1, z0 - L * t - 0.4, '#f4f1ea');
  }
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(ang, lot.rot, 0, 'YXZ'));
  const rc = lotPoint(lot, rx, (z0 + z1) / 2 - 0.12 * Math.sin(ang));
  ctx.boxQ(rc.x, lot.h + H / 2 - 0.12 * Math.cos(ang), rc.z, rampW / 2, 0.12, Math.hypot(L, H) / 2, q);
  const lc = lotPoint(lot, rx, z1 - land / 2);
  ctx.box(lc.x, lot.h + H - 0.1, lc.z, rampW / 2, 0.1, land / 2, lot.rot);
  const bwc = lotPoint(lot, rx, -hd + 0.15);
  ctx.box(bwc.x, lot.h + H + 0.55, bwc.z, rampW / 2, 0.55, 0.15, lot.rot);
  const wc = lotPoint(lot, rx - rampW / 2 + 0.1, (z0 + z1) / 2);
  ctx.box(wc.x, lot.h + H * 0.5 + 0.5, wc.z, 0.1, H / 2 + 0.5, L / 2, lot.rot);
  // fachada
  const { half } = facadeFrame(b, { ...lot, hw: bw / 2, x: bc.x, z: bc.z } as Lot, 0);
  void half;
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  for (let x = bx0 + 2; x < hw - 1; x += 4) b.panelZ(x, 2.4, hd + 0.03, 2.8, 1.2, '#4a4e56');
  rollerDoor(b, hw - 6, 5, 3.4, '#8e959c');
  ctx.signs.define('parking', 6, 1.6, (g, W, Hh) => {
    g.fillStyle = '#1f5fbf';
    roundRect(g, 0, 0, W, Hh, Hh * 0.15);
    g.fill();
    g.fillStyle = '#ffffff';
    g.fillRect(Hh * 0.12, Hh * 0.12, Hh * 0.76, Hh * 0.76);
    fitText(g, 'P', Hh / 2, Hh / 2, Hh * 0.6, Hh * 0.66, FONT, '900', '#1f5fbf');
    fitText(g, 'Parking El Imposible', (W + Hh) / 2, Hh * 0.38, W - Hh * 1.2, Hh * 0.36, FONT, '900', '#ffffff');
    fitText(g, 'Subida a la azotea → ¡salta si te atreves!', (W + Hh) / 2, Hh * 0.74, W - Hh * 1.2, Hh * 0.2, FONT, '700', '#ffe14a');
  });
  ctx.signs.place(b, 'parking', bcx, H - 1.0, hd + 0.08, 6, 1.6, 0.5);
  collectible(ctx, lotPoint(lot, hw - 3, -hd + 3).x, lot.h + H, lotPoint(lot, hw - 3, -hd + 3).z);
  {
    const a = lotPoint(lot, rx, hd + 1.5), top = lotPoint(lot, rx, z1 - land / 2), roof = lotPoint(lot, bx0 + 4, z1 - land / 2);
    ctx.climbs.push({ name: 'parking', a: new THREE.Vector3(a.x, lot.h, a.z), b: new THREE.Vector3(top.x, lot.h + H, top.z), c: new THREE.Vector3(roof.x, lot.h + H, roof.z) });
  }
  out.extra.parkingRoof = ground(ctx, lot.x, lot.z, H);
  ctx.foot.push({ x: bc.x, z: bc.z, hw: bw / 2, hd, rot: lot.rot, color: grey, height: H });
  ctx.foot.push({ x: lotPoint(lot, rx, 0).x, z: lotPoint(lot, rx, 0).z, hw: rampW / 2, hd, rot: lot.rot, color: '#5d6068', height: 2 });
  void out;
}

export { GeoBuilder };
