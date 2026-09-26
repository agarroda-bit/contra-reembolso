// El Polígono: guarida de Los Devueltos, desguace, taller y concesionario Manolo (con cajero),
// túnel de pintura Pintamóvil Exprés, armería, nave con escalera a la azotea y un descampado con rampas.
import * as THREE from 'three';
import type { Ctx } from './ctx';
import { GeoBuilder, SKIP, lin } from './geo';
import { OCC } from './occ';
import { PlanCtx, Special, Out, collectible, makePoi, ground, doorPoint, stairs, stairRun, jumpRamp, curbParking } from './special';
import { glass, rollerDoor, facadeFrame, baseDepth } from './buildings';
import { lotPoint, Lot } from './layout';
import { fitText, roundRect, FONT_IMPACT, FONT, FONT_SCRIPT, FONT_FUN, shade } from './signs';

export const PURPLE = '#6a2bb3';

export function planPoligono(p: PlanCtx): Special[] {
  const { layout, occ } = p;
  const L = (x: number, z: number, W: number, D: number, id: string, road: string) => {
    const l = layout.lotNear(x, z, W, D, { kind: 'special' }, id, road);
    if (!l) console.warn('[isla] no cabe', id);
    return l;
  };
  const hideout = L(208, -70, 52, 32, 'hideout', 'Calle de la Nave');
  const junk = L(208, 88, 36, 54, 'junkyard', 'Avenida de la Carretilla');
  const garage = L(136, -20, 50, 30, 'garage', 'Avenida de la Chapa');
  const paint = L(150, 30, 14, 24, 'paint', 'Avenida de la Carretilla');
  const gun = L(200, 30, 24, 16, 'gunshop', 'Avenida de la Carretilla');
  const naveS = L(136, 95, 40, 24, 'nave-escalera', 'Calle del Montacargas');
  // patio de maniobras detrás del túnel de pintura y descampado con rampas
  if (paint) {
    const back = lotPoint(paint, 0, -paint.hd - 12);
    layout.reserve(back.x, back.z, 14, 11, paint.rot);
  }
  for (let z = -36; z < -4; z++) for (let x = 181; x < 237; x++) if (occ.get(x + 0.5, z + 0.5) === OCC.FREE) occ.set(x + 0.5, z + 0.5, OCC.RESERVED);
  return [
    {
      name: 'poligono',
      build: (ctx, out) => {
        if (hideout) buildHideout(ctx, out, hideout);
        if (junk) buildJunkyard(ctx, out, junk);
        if (garage) buildGarage(ctx, out, garage);
        if (paint) buildPaint(ctx, out, paint);
        if (gun) buildGunshop(ctx, out, gun);
        if (naveS) buildStairNave(ctx, out, naveS);
        buildWasteland(ctx, out);
      },
    },
  ];
}

// ───────────────────────── Guarida de Los Devueltos ─────────────────────────

function devueltosLogo(): (g: CanvasRenderingContext2D, W: number, H: number) => void {
  return (g, W, H) => {
    g.clearRect(0, 0, W, H);
    const r = Math.min(W, H) * 0.47;
    g.fillStyle = PURPLE;
    g.beginPath();
    g.arc(W / 2, H / 2, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = r * 0.22;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(W / 2 + r * 0.05, H / 2 + r * 0.08, r * 0.5, -Math.PI * 0.95, Math.PI * 0.55);
    g.stroke();
    // punta de la flecha (hacia atrás, a la izquierda)
    g.fillStyle = '#ffffff';
    g.beginPath();
    const ax = W / 2 - r * 0.46, ay = H / 2 - r * 0.02;
    g.moveTo(ax - r * 0.3, ay + r * 0.02);
    g.lineTo(ax + r * 0.22, ay - r * 0.34);
    g.lineTo(ax + r * 0.18, ay + r * 0.3);
    g.closePath();
    g.fill();
  };
}

function buildHideout(ctx: Ctx, out: Out, lot: Lot) {
  const b = ctx.solid.at(lot.x, lot.z);
  const hw = lot.hw, hd = lot.hd;
  const wz0 = -hd, wz1 = -hd + 19; // almacén al fondo
  const H = 10;
  const whLot: Lot = { ...lot, hd: (wz1 - wz0) / 2, hw: hw - 2, meta: {} };
  const wc = lotPoint(lot, 0, (wz0 + wz1) / 2);
  whLot.x = wc.x;
  whLot.z = wc.z;
  const y0 = baseDepth(ctx, whLot);
  const wall = '#4a4452', trim = PURPLE;
  b.frame(wc.x, lot.h, wc.z, lot.rot);
  b.box(0, (y0 + H) / 2, 0, whLot.hw * 2, H - y0, whLot.hd * 2, wall, SKIP.NY | SKIP.PY);
  b.quadL(-whLot.hw, H, whLot.hd, whLot.hw, H, whLot.hd, whLot.hw, H, -whLot.hd, -whLot.hw, H, -whLot.hd, '#3a3542');
  ctx.box(wc.x, lot.h + (y0 + H) / 2, wc.z, whLot.hw, (H - y0) / 2, whLot.hd, lot.rot);
  for (let k = 0; k < 4; k++) {
    const { half } = facadeFrame(b, whLot, k);
    for (let x = -half + 0.6; x < half - 0.3; x += 1.2) b.panelZ(x, H / 2, 0.03, 0.3, H - 0.4, '#3e3946');
    b.box(0, H - 0.3, 0.1, half * 2 + 0.1, 0.6, 0.2, trim, SKIP.NZ);
    b.panelZ(0, (y0 + 0.6) / 2, 0.04, half * 2, 0.6 - y0, '#2a2630');
    if (k === 0) {
      rollerDoor(b, -8, 8, 5, '#5a5364');
      rollerDoor(b, 8, 8, 5, '#5a5364');
      b.panelZ(16, 1.2, 0.05, 1.2, 2.4, '#2a2630');
      ctx.signs.define('devueltos-logo', 4, 4, devueltosLogo());
      ctx.signs.place(b, 'devueltos-logo', 0, 7.2, 0.12, 4.4, 4.4, 0.8);
      ctx.signs.define('devueltos-rotulo', 12, 1.5, (g, W, Hh) => {
        g.clearRect(0, 0, W, Hh);
        g.shadowColor = '#b36bff';
        g.shadowBlur = Hh * 0.2;
        fitText(g, 'LOS DEVUELTOS', W / 2, Hh * 0.45, W * 0.95, Hh * 0.8, FONT_IMPACT, '400', '#d9b8ff', '#2a0a4a', Hh * 0.08);
        g.shadowBlur = 0;
      });
      ctx.signs.place(b, 'devueltos-rotulo', -12.5, 7.4, 0.12, 9, 1.2, 1);
      ctx.signs.define('devueltos-grafiti', 6, 2, (g, W, Hh) => {
        g.clearRect(0, 0, W, Hh);
        g.save();
        g.rotate(-0.06);
        fitText(g, 'AQUÍ NO SE DEVUELVE NADA', W / 2, Hh * 0.45, W * 0.9, Hh * 0.4, FONT_IMPACT, '400', '#ff5fb8', '#1b0a2a', Hh * 0.06);
        g.restore();
      });
      ctx.signs.place(b, 'devueltos-grafiti', 13, 4.2, 0.12, 6, 2, 0.2);
    } else {
      ctx.signs.place(b, 'devueltos-logo', 0, 6.5, 0.12, 3.6, 3.6, 0.8);
    }
  }
  // tira de neón morada
  b.frame(wc.x, lot.h, wc.z, lot.rot);
  b.box(0, H - 1.0, whLot.hd + 0.14, whLot.hw * 2 - 1, 0.14, 0.08, '#b36bff', 0, [0.55, 0.15, 1.2, 0.3]);
  // valla con alambre de espino y portón
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  const fz = hd - 0.3, fh = 2.6, gate0 = -12, gate1 = -3;
  const fence = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      b.box(x0 + (x1 - x0) * t, fh / 2 - 0.3, z0 + (z1 - z0) * t, 0.12, fh + 0.6, 0.12, '#7a7f86');
    }
    // malla (dos caras)
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const ang = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
    b.boxRot(mx, fh / 2, mz, len, fh - 0.2, 0.04, 0, ang, 0, '#9aa3ac');
    b.boxRot(mx, fh + 0.15, mz, len, 0.06, 0.06, 0, ang, 0, '#5a5f66');
    const P0 = lotPoint(lot, x0, z0), P1 = lotPoint(lot, x1, z1);
    const c = { x: (P0.x + P1.x) / 2, z: (P0.z + P1.z) / 2 };
    const wang = Math.atan2(P1.x - P0.x, P1.z - P0.z) + Math.PI / 2;
    ctx.box(c.x, lot.h + fh / 2, c.z, len / 2, fh / 2 + 0.3, 0.12, wang);
  };
  fence(-hw + 0.3, fz, gate0, fz);
  fence(gate1, fz, hw - 0.3, fz);
  fence(-hw + 0.3, fz, -hw + 0.3, wz1);
  fence(hw - 0.3, fz, hw - 0.3, wz1);
  // portón abierto (hoja girada)
  b.boxRot(gate0 + 0.2, fh / 2, fz + 2.3, 0.1, fh, 4.4, 0, 0.1, 0, '#6a6f76');
  // patio: cajas, palés y una torre de vigilancia
  const rng = ctx.rng;
  for (let i = 0; i < 14; i++) {
    const x = rng.range(-hw + 3, hw - 3), z = rng.range(wz1 + 2, fz - 2.5);
    if (x > gate0 - 1 && x < gate1 + 1) continue;
    const p = lotPoint(lot, x, z);
    if (i % 2) ctx.breakables.push({ kind: 'crate', pos: ground(ctx, p.x, p.z), rotY: rng.range(0, 3) });
    else ctx.props.add('crateStack', p.x, lot.h, p.z, rng.range(0, 3), rng.range(1, 1.4));
  }
  const tp = lotPoint(lot, hw - 3.5, fz - 3.5);
  b.frame(tp.x, lot.h, tp.z, lot.rot);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(sx * 1.2, 2.8, sz * 1.2, 0.2, 5.6, 0.2, '#5a4a3a');
  b.box(0, 5.7, 0, 3.2, 0.2, 3.2, '#6a5a48');
  b.box(0, 6.4, 1.55, 3.2, 1.2, 0.1, '#6a5a48');
  b.box(0, 7.4, 0, 3.6, 0.15, 3.6, PURPLE);
  ctx.box(tp.x, lot.h + 2.8, tp.z, 1.4, 2.8, 1.4, lot.rot);
  // coleccionable escondido detrás de las cajas
  const cp = lotPoint(lot, -hw + 2.5, wz1 + 1.5);
  collectible(ctx, cp.x, lot.h, cp.z);
  const poi = makePoi(ctx, 'hideout', 'hideout', 'Guarida de Los Devueltos', lot, (gate0 + gate1) / 2, true, 1.2);
  out.pois.push(poi);
  const yc = lotPoint(lot, 0, (wz1 + fz) / 2);
  out.extra.hideoutYard = { x: yc.x, z: yc.z, hw: hw - 1, hd: (fz - wz1) / 2, rot: lot.rot };
  out.extra.hideoutDoor = doorPoint(ctx, whLot, 8, 1.5);
  ctx.foot.push({ x: wc.x, z: wc.z, hw: whLot.hw, hd: whLot.hd, rot: lot.rot, color: '#4a4452', height: H });
  ctx.paved.push({ x: yc.x, z: yc.z, hw: hw, hd: (fz - wz1) / 2, rot: lot.rot, color: '#8d8578' });
}

// ───────────────────────── Desguace ─────────────────────────

function crushedCarGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.box(0, 0.45, 0, 4.2, 0.9, 1.9, '#ffffff');
  b.box(0.2, 1.0, 0, 2.2, 0.35, 1.7, '#e0e0e0');
  b.box(0.2, 1.0, 0.86, 1.8, 0.25, 0.02, '#445566');
  b.box(0.2, 1.0, -0.86, 1.8, 0.25, 0.02, '#445566');
  for (const [x, z] of [[-1.4, 0.95], [1.4, 0.95], [-1.4, -0.95], [1.4, -0.95]]) b.box(x, 0.3, z, 0.6, 0.6, 0.05, '#1b1b1b');
  return b.toGeometry();
}

function buildJunkyard(ctx: Ctx, out: Out, lot: Lot) {
  const b = ctx.solid.at(lot.x, lot.z);
  const rng = ctx.rng;
  const hw = lot.hw, hd = lot.hd;
  const fh = 3.2;
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  const y0 = baseDepth(ctx, lot) + 0.4;
  // valla de chapa oxidada con portón
  const rust = ['#8a5a3a', '#7a6a5a', '#9a6a4a', '#6f5f52', '#8f7a5f'];
  const gate0 = -5, gate1 = 5;
  const panelRun = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2.4));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0, bx = x0 + (x1 - x0) * t1, bz = z0 + (z1 - z0) * t1;
      const c = rust[(i * 7 + Math.round(ax)) % rust.length];
      b.quadL(ax, y0, az, bx, y0, bz, bx, fh + (i % 3) * 0.15, bz, ax, fh + (i % 3) * 0.15, az, c);
      b.quadL(bx, y0, bz, ax, y0, az, ax, fh + (i % 3) * 0.15, az, bx, fh + (i % 3) * 0.15, bz, lin(c).clone().multiplyScalar(0.85));
    }
    const P0 = lotPoint(lot, x0, z0), P1 = lotPoint(lot, x1, z1);
    const wang = Math.atan2(P1.x - P0.x, P1.z - P0.z) + Math.PI / 2;
    ctx.box((P0.x + P1.x) / 2, lot.h + fh / 2, (P0.z + P1.z) / 2, len / 2, fh / 2 + 0.4, 0.15, wang);
  };
  panelRun(-hw + 0.2, hd - 0.2, gate0, hd - 0.2);
  panelRun(gate1, hd - 0.2, hw - 0.2, hd - 0.2);
  panelRun(hw - 0.2, hd - 0.2, hw - 0.2, -hd + 0.2);
  panelRun(hw - 0.2, -hd + 0.2, -hw + 0.2, -hd + 0.2);
  panelRun(-hw + 0.2, -hd + 0.2, -hw + 0.2, hd - 0.2);
  for (const x of [gate0, gate1]) b.box(x, 2.2, hd - 0.2, 0.5, 4.4, 0.5, '#555');
  ctx.signs.define('desguace', 10, 1.6, (g, W, Hh) => {
    g.fillStyle = '#ffd23f';
    g.fillRect(0, 0, W, Hh);
    g.fillStyle = '#1b1b1b';
    for (let x = -Hh; x < W; x += Hh * 0.6) {
      g.beginPath();
      g.moveTo(x, Hh);
      g.lineTo(x + Hh * 0.3, Hh);
      g.lineTo(x + Hh * 0.55, Hh * 0.82);
      g.lineTo(x + Hh * 0.25, Hh * 0.82);
      g.fill();
    }
    fitText(g, 'DESGUACE EL SINIESTRO TOTAL', W / 2, Hh * 0.36, W * 0.94, Hh * 0.46, FONT_IMPACT, '400', '#1b1b1b');
    fitText(g, 'Compramos tu coche aunque sea un churro', W / 2, Hh * 0.66, W * 0.8, Hh * 0.16, FONT, '800', '#1b1b1b');
  });
  b.box(0, 4.3, hd - 0.2, 11, 1.8, 0.2, '#555');
  ctx.signs.place(b, 'desguace', 0, 4.3, hd - 0.08, 10.6, 1.7, 0.3);
  ctx.signs.place(b.frame(lot.x, lot.h, lot.z, lot.rot + Math.PI), 'desguace', 0, 4.3, -hd + 0.32, 10.6, 1.7, 0.3);
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  // pilas de coches aplastados
  const cars: { x: number; y: number; z: number; r: number; c: string }[] = [];
  const colors = ['#c0392b', '#2f6fb0', '#e8a01b', '#3f8f5a', '#dddddd', '#555a60', '#8a4fb0', '#1f9e9a', '#b38a5a'];
  const piles: [number, number][] = [];
  for (let px = -hw + 6; px <= hw - 6; px += 9) for (let pz = -hd + 5; pz <= hd - 12; pz += 7.5) piles.push([px + rng.range(-1, 1), pz]);
  for (const [px, pz] of piles) {
    if (rng.chance(0.18)) continue;
    const h = rng.int(2, 5);
    const r0 = rng.range(-0.3, 0.3);
    for (let k = 0; k < h; k++) {
      const p = lotPoint(lot, px + rng.range(-0.25, 0.25), pz + rng.range(-0.2, 0.2));
      cars.push({ x: p.x, y: lot.h + k * 1.12, z: p.z, r: lot.rot + Math.PI / 2 + r0 + rng.range(-0.15, 0.15), c: rng.pick(colors) });
    }
    const pc = lotPoint(lot, px, pz);
    ctx.box(pc.x, lot.h + (h * 1.12) / 2, pc.z, 2.2, (h * 1.12) / 2, 1.1, lot.rot + Math.PI / 2 + r0);
    ctx.foot.push({ x: pc.x, z: pc.z, hw: 2.1, hd: 1.0, rot: lot.rot + Math.PI / 2 + r0, color: '#8a7a6a', height: h });
  }
  const im = new THREE.InstancedMesh(crushedCarGeo(), ctx.mat, cars.length);
  im.name = 'coches-aplastados';
  im.castShadow = true;
  im.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  cars.forEach((c, i) => {
    e.set(rng.range(-0.05, 0.05), c.r, rng.range(-0.05, 0.05));
    im.setMatrixAt(i, m.compose(p.set(c.x, c.y, c.z), q.setFromEuler(e), one));
    im.setColorAt(i, lin(c.c).clone());
  });
  im.computeBoundingSphere();
  ctx.game.scene.add(im);
  // grúa con electroimán
  const cp = lotPoint(lot, hw - 8, hd - 10);
  b.frame(cp.x, lot.h, cp.z, lot.rot + 0.7);
  b.box(0, 0.8, 0, 3, 1.6, 4.5, '#e8a01b');
  b.box(0, 2.1, -0.8, 2.4, 1.2, 2, '#e8a01b');
  b.box(0, 2.1, 0.6, 1.6, 1.2, 1.2, '#445566');
  b.boxRot(0, 6.5, 4.5, 0.5, 0.5, 11, -0.75, 0, 0, '#d98a10');
  b.box(0, 7.6, 8.4, 0.05, 3.4, 0.05, '#333');
  b.cyl(0, 5.6, 8.4, 1.1, 1.1, 0.4, 10, '#3a3a3a', true, true);
  ctx.box(cp.x, lot.h + 1.4, cp.z, 1.6, 1.4, 2.4, lot.rot + 0.7);
  // caseta de obra (oficina)
  const op = lotPoint(lot, -hw + 5, hd - 7);
  b.frame(op.x, lot.h, op.z, lot.rot + Math.PI / 2);
  b.box(0, 1.35, 0, 6, 2.7, 2.6, '#f4f1ea', SKIP.NY);
  b.box(0, 2.75, 0, 6.2, 0.1, 2.8, '#b8b8b8');
  glass(ctx.win.at(op.x, op.z).frame(op.x, lot.h, op.z, lot.rot + Math.PI / 2), 1.2, 1.6, 1.32, 1.6, 0.9, [1, 0.85, 0.55, 0.2]);
  b.panelZ(-1.6, 1.05, 1.32, 0.9, 2.0, '#6a6f76');
  ctx.box(op.x, lot.h + 1.35, op.z, 3, 1.35, 1.3, lot.rot + Math.PI / 2);
  // neumáticos
  for (let i = 0; i < 6; i++) {
    const tp = lotPoint(lot, -hw + 3 + i * 1.1, -hd + 3);
    ctx.props.add('tyres', tp.x, lot.h, tp.z, 0, 1);
  }
  // camión de la basura aparcado dentro y coleccionable detrás de las pilas
  const gp = lotPoint(lot, 2, hd - 6);
  ctx.specials.push({ kind: 'garbage', pos: ground(ctx, gp.x, gp.z), heading: lot.rot + Math.PI / 2 });
  const hp = lotPoint(lot, hw - 2.5, -hd + 2.5);
  collectible(ctx, hp.x, lot.h, hp.z);
  jumpRamp(ctx, lotPoint(lot, -6, hd - 14).x, lotPoint(lot, -6, hd - 14).z, lot.rot + Math.PI, 8, 4.5, 1.6);
  out.pois.push(makePoi(ctx, 'junkyard', 'junkyard', 'Desguace El Siniestro Total', lot, 0, true, 1.2));
  ctx.paved.push({ x: lot.x, z: lot.z, hw, hd, rot: lot.rot, color: '#9a8f7c' });
  for (let i = 0; i < 3; i++) {
    const fp = lotPoint(lot, -hw + 8 + i * 3, hd + 0.9);
    void fp;
  }
}

// ───────────────────────── Talleres Chapa y Pintura Manolo ─────────────────────────

function buildGarage(ctx: Ctx, out: Out, lot: Lot) {
  const b = ctx.solid.at(lot.x, lot.z);
  const w = ctx.win.at(lot.x, lot.z);
  const hw = lot.hw, hd = lot.hd;
  const back = -hd + 16; // edificios al fondo, explanada delante
  const H = 8;
  const bl: Lot = { ...lot, hd: 8, meta: {} };
  const bc = lotPoint(lot, 0, -hd + 8);
  bl.x = bc.x;
  bl.z = bc.z;
  const y0 = baseDepth(ctx, bl);
  const blue = '#1f5fbf', white = '#f4f1ea';
  b.frame(bc.x, lot.h, bc.z, lot.rot);
  // taller (derecha) y exposición acristalada (izquierda)
  b.box(8, (y0 + H) / 2, 0, hw * 2 - 16, H - y0, 16, white, SKIP.NY | SKIP.PY);
  b.quadL(-hw + 16, H, 8, hw, H, 8, hw, H, -8, -hw + 16, H, -8, '#b9bdc2');
  b.box(-hw + 8, (y0 + 6) / 2, 0, 16, 6 - y0, 16, '#dfe9f2', SKIP.NY | SKIP.PY);
  b.quadL(-hw, 6, 8, -hw + 16, 6, 8, -hw + 16, 6, -8, -hw, 6, -8, '#9aa3ac');
  const sc = lotPoint(bl, 8, 0), gc = lotPoint(bl, -hw + 8, 0);
  ctx.box(sc.x, lot.h + (y0 + H) / 2, sc.z, hw - 8, (H - y0) / 2, 8, lot.rot);
  ctx.box(gc.x, lot.h + (y0 + 6) / 2, gc.z, 8, (6 - y0) / 2, 8, lot.rot);
  // fachada del taller
  b.frame(bc.x, lot.h, bc.z, lot.rot);
  b.box(8, H - 0.4, 8.1, hw * 2 - 16, 0.8, 0.2, blue, SKIP.NZ);
  facadeFrame(b, bl, 0);
  rollerDoor(b, 2, 6, 4.4, '#9aa3ac');
  b.frame(bc.x, lot.h, bc.z, lot.rot);
  // persiana abierta: hueco oscuro y elevador
  b.panelZ(12, 2.3, 8.03, 6, 4.6, '#26292e');
  b.box(12, 0.05, 7.4, 4, 0.1, 1.2, '#e8a01b');
  b.box(10.4, 0.9, 7.4, 0.3, 1.8, 0.3, '#e8394d');
  b.box(13.6, 0.9, 7.4, 0.3, 1.8, 0.3, '#e8394d');
  // exposición acristalada
  const wv = ctx.win.at(lot.x, lot.z);
  wv.frame(bc.x, lot.h, bc.z, lot.rot);
  glass(wv, -hw + 8, 2.9, 8.05, 15, 5.2, [1, 1, 0.95, 0.02], lin('#3a5068').clone(), lin('#a8c8e0').clone());
  for (let x = -hw + 1; x <= -hw + 15.1; x += 3.5) b.panelZ(x, 2.9, 8.07, 0.14, 5.4, '#8a939c');
  b.box(-hw + 8, 6.05, 8.1, 16.2, 0.3, 0.3, blue, SKIP.NZ);
  // podio con coche girando (solo el podio; los coches los pone otro módulo)
  b.cyl(-hw + 8, 0, 3, 3.2, 3.2, 0.3, 16, '#d0d4d8', true);
  ctx.signs.define('manolo', 16, 2.4, (g, W, Hh) => {
    g.fillStyle = blue;
    roundRect(g, 0, 0, W, Hh, Hh * 0.12);
    g.fill();
    g.fillStyle = '#ffd23f';
    g.fillRect(0, Hh * 0.8, W, Hh * 0.08);
    fitText(g, 'TALLERES CHAPA Y PINTURA MANOLO', W / 2, Hh * 0.36, W * 0.94, Hh * 0.44, FONT_IMPACT, '400', '#ffffff');
    fitText(g, 'Concesionario · Si no lo arreglamos, lo pintamos', W / 2, Hh * 0.66, W * 0.84, Hh * 0.18, FONT, '800', '#ffd23f');
  });
  ctx.signs.place(b, 'manolo', 4, H + 1.3, 7.9, 16, 2.4, 0.5);
  b.box(-4, H + 0.3, 7.7, 0.2, 0.6, 0.2, '#555');
  b.box(12, H + 0.3, 7.7, 0.2, 0.6, 0.2, '#555');
  // cajero en la exposición
  b.panelZ(-hw + 17.2, 1.4, 8.05, 1.0, 1.9, '#2b3038');
  b.panelZ(-hw + 17.2, 1.6, 8.07, 0.6, 0.4, '#58d8ff', [0.2, 0.7, 1.0, 0.6]);
  ctx.signs.place(b, 'atm', -hw + 17.2, 2.7, 8.08, 1.0, 0.33, 0.8);
  // explanada con plazas de venta y banderines
  const pave = ctx.pave;
  const fc = lotPoint(lot, 0, back + (hd - back) / 2);
  pave.rect(pave.asphalt, fc.x, fc.z, hw, (hd - back) / 2, lot.rot, '#555a66');
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  const bays: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i++) {
    const x = -hw + 4 + i * ((hw * 2 - 8) / 5);
    const p = lotPoint(lot, x, back + 4.5);
    pave.rect(pave.paint, p.x, p.z, 1.3, 2.6, lot.rot, '#f4f1ea', 2);
    bays.push(ground(ctx, p.x, p.z));
  }
  out.extra.garageBays = bays;
  // banderines de colores entre postes
  const fy = 5.2;
  for (const s of [-1, 1]) b.box(s * (hw - 0.5), fy / 2, hd - 1.5, 0.15, fy, 0.15, '#9aa3ac');
  const n = 26;
  const flagCols = ['#e8394d', '#ffd23f', '#1f5fbf', '#3f9a5a', '#ffffff'];
  for (let i = 0; i < n; i++) {
    const x = -hw + 0.5 + ((hw * 2 - 1) * (i + 0.5)) / n;
    const sag = Math.sin(((i + 0.5) / n) * Math.PI) * 0.8;
    b.triL(x - 0.35, fy - sag, hd - 1.5, x + 0.35, fy - sag, hd - 1.5, x, fy - sag - 0.6, hd - 1.5, flagCols[i % flagCols.length]);
    b.triL(x + 0.35, fy - sag, hd - 1.52, x - 0.35, fy - sag, hd - 1.52, x, fy - sag - 0.6, hd - 1.52, flagCols[i % flagCols.length]);
  }
  b.beam(b.wx(-hw + 0.5, hd - 1.5), lot.h + fy, b.wz(-hw + 0.5, hd - 1.5), b.wx(0, hd - 1.5), lot.h + fy - 0.8, b.wz(0, hd - 1.5), 0.03, '#333');
  b.beam(b.wx(0, hd - 1.5), lot.h + fy - 0.8, b.wz(0, hd - 1.5), b.wx(hw - 0.5, hd - 1.5), lot.h + fy, b.wz(hw - 0.5, hd - 1.5), 0.03, '#333');
  for (let i = 0; i < 4; i++) {
    const tp = lotPoint(lot, hw - 2 - i * 1.1, back + 1);
    ctx.props.add('tyres', tp.x, lot.h, tp.z, 0, 1);
  }
  const poi = makePoi(ctx, 'garage', 'garage', 'Talleres Chapa y Pintura Manolo', lot, -hw + 8, true, 1.3);
  out.pois.push(poi);
  const atm = makePoi(ctx, 'atm-poligono', 'atm', 'Cajero del concesionario Manolo', lot, -hw + 17.2, true, 1.3);
  // las puertas están al fondo de la explanada: el punto de la puerta va junto a la fachada
  const dg = lotPoint(bl, -hw + 8, 9.4), da = lotPoint(bl, -hw + 17.2, 9.2);
  poi.door.set(dg.x, ctx.heightAt(dg.x, dg.z), dg.z);
  atm.door.set(da.x, ctx.heightAt(da.x, da.z), da.z);
  out.pois.push(atm);
  ctx.foot.push({ x: bc.x, z: bc.z, hw, hd: 8, rot: lot.rot, color: white, height: H });
  ctx.paved.push({ x: fc.x, z: fc.z, hw, hd: (hd - back) / 2, rot: lot.rot, color: '#6a6f7a' });
}

// ───────────────────────── Pintamóvil Exprés (túnel) ─────────────────────────

function buildPaint(ctx: Ctx, out: Out, lot: Lot) {
  const b = ctx.solid.at(lot.x, lot.z);
  const hw = lot.hw, hd = lot.hd;
  const tw = 9, H = 5.6, len = 16;
  const z0 = hd - 1, z1 = z0 - len; // el túnel va desde la fachada hacia el fondo
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  const cols = ['#e8394d', '#ffd23f', '#2f7fcf', '#3f9a5a', '#ff6fb5', '#7c4dbb', '#f28c28'];
  for (const s of [-1, 1]) {
    const x = s * (tw / 2 + 0.4);
    b.box(x, H / 2 - 0.3, (z0 + z1) / 2, 0.8, H + 0.6, len, '#f4f1ea', SKIP.NY);
    // franjas de pintura
    for (let i = 0; i < 7; i++) {
      const zz = z0 - 1 - i * 2.2;
      b.panelX(zz, 1.4 + (i % 3) * 0.9, x + s * 0.41, 1.6, 1.2 + (i % 2) * 0.8, s, cols[i % cols.length]);
      b.panelX(zz, 1.4 + (i % 3) * 0.9, x - s * 0.41, 1.6, 1.2 + (i % 2) * 0.8, -s, cols[(i + 3) % cols.length]);
    }
    const P = lotPoint(lot, x, (z0 + z1) / 2);
    ctx.box(P.x, lot.h + H / 2, P.z, 0.4, H / 2 + 0.3, len / 2, lot.rot);
  }
  // techo con luces de colores dentro
  b.box(0, H + 0.3, (z0 + z1) / 2, tw + 1.6, 0.6, len, '#e0dcd4');
  for (let i = 0; i < 6; i++) b.box(0, H - 0.05, z0 - 1.5 - i * 2.6, tw - 1, 0.1, 0.3, cols[i], SKIP.PY, [...lin(cols[i]).toArray(), 0.5]);
  const rc = lotPoint(lot, 0, (z0 + z1) / 2);
  ctx.box(rc.x, lot.h + H + 0.3, rc.z, tw / 2 + 0.8, 0.3, len / 2, lot.rot);
  // boquillas de pintura
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) b.box(s * (tw / 2 - 0.1), 3.2, z0 - 3 - i * 3.5, 0.3, 0.3, 0.3, '#333');
  // gran cartel encima
  ctx.signs.define('pintamovil', 12, 2.6, (g, W, Hh) => {
    const grd = g.createLinearGradient(0, 0, W, 0);
    ['#e8394d', '#f28c28', '#ffd23f', '#3f9a5a', '#2f7fcf', '#7c4dbb'].forEach((c, i, a) => grd.addColorStop(i / (a.length - 1), c));
    g.fillStyle = grd;
    roundRect(g, 0, 0, W, Hh, Hh * 0.25);
    g.fill();
    fitText(g, 'PINTAMÓVIL EXPRÉS', W / 2, Hh * 0.4, W * 0.92, Hh * 0.5, FONT_IMPACT, '400', '#ffffff', '#1b1b1b', Hh * 0.06);
    fitText(g, 'Tu coche de otro color en 10 segundos. La poli ya no te conoce.', W / 2, Hh * 0.78, W * 0.9, Hh * 0.15, FONT, '800', '#ffffff');
  });
  b.box(0, H + 1.9, z0 - 0.3, 11.5, 2.6, 0.2, '#f4f1ea');
  ctx.signs.place(b, 'pintamovil', 0, H + 1.9, z0 - 0.18, 11.4, 2.5, 0.8);
  // bombillas en la entrada
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const x = -tw / 2 + tw * t;
    b.box(x, H - 0.2, z0 + 0.05, 0.2, 0.2, 0.15, '#fff3c4', 0, [1.2, 0.9, 0.4, 2 + (i % 2) * 0.5]);
  }
  // suelo del túnel
  const tc = lotPoint(lot, 0, (z0 + z1) / 2);
  ctx.pave.rect(ctx.pave.asphalt, tc.x, tc.z, tw / 2, len / 2, lot.rot, '#5b6070', 2);
  ctx.pave.rect(ctx.pave.paint, tc.x, tc.z, 0.12, len / 2 - 1, lot.rot, '#ffd23f', 2);
  // patio de maniobras detrás
  const bk = lotPoint(lot, 0, -hd - 12);
  ctx.pave.rect(ctx.pave.asphalt, bk.x, bk.z, 14, 11, lot.rot, '#646872', 3);
  ctx.paved.push({ x: bk.x, z: bk.z, hw: 14, hd: 11, rot: lot.rot, color: '#6a6f7a' });
  jumpRamp(ctx, lotPoint(lot, -8, -hd - 14).x, lotPoint(lot, -8, -hd - 14).z, lot.rot + Math.PI, 8, 4.5, 1.5);
  const poi = makePoi(ctx, 'paint', 'paint', 'Pintamóvil Exprés', lot, 0, false, 1.2);
  const inside = lotPoint(lot, 0, (z0 + z1) / 2);
  poi.parking = ground(ctx, inside.x, inside.z);
  out.pois.push(poi);
  out.extra.paintBooth = { x: inside.x, z: inside.z, hw: tw / 2, hd: len / 2, rot: lot.rot };
  ctx.foot.push({ x: rc.x, z: rc.z, hw: tw / 2 + 0.8, hd: len / 2, rot: lot.rot, color: '#ff6fb5', height: H, open: true });
}

// ───────────────────────── Armería El Gatillo Alegre ─────────────────────────

function buildGunshop(ctx: Ctx, out: Out, lot: Lot) {
  const b = ctx.solid.at(lot.x, lot.z);
  const w = ctx.win.at(lot.x, lot.z);
  const hw = lot.hw, hd = lot.hd, H = 6;
  const y0 = baseDepth(ctx, lot);
  const olive = '#6b7a52', dark = '#3d4630';
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  b.box(0, (y0 + H) / 2, 0, hw * 2, H - y0, hd * 2, olive, SKIP.NY | SKIP.PY);
  b.quadL(-hw, H, hd, hw, H, hd, hw, H, -hd, -hw, H, -hd, '#5a6448');
  ctx.box(lot.x, lot.h + (y0 + H) / 2, lot.z, hw, (H - y0) / 2, hd, lot.rot);
  for (let k = 0; k < 4; k++) {
    const { half } = facadeFrame(b, lot, k);
    facadeFrame(w, lot, k);
    // camuflaje: manchas
    for (let i = 0; i < 6; i++) b.panelZ(-half + 1.5 + i * (half * 2 - 3) / 5, 2.2 + (i % 2) * 1.6, 0.03, 1.8, 1.1, i % 2 ? dark : '#8a8f5a');
    b.box(0, H - 0.2, 0.1, half * 2 + 0.1, 0.4, 0.2, '#1b1b1b', SKIP.NZ);
    b.box(0, H - 0.55, 0.1, half * 2 + 0.1, 0.3, 0.2, '#ffd23f', SKIP.NZ);
    if (k !== 0) continue;
    b.panelZ(0, 1.4, 0.05, 2.2, 2.8, '#1b1b1b');
    b.panelZ(0, 1.35, 0.07, 1.8, 2.6, '#4a3a2a');
    for (const x of [-6, 6]) {
      glass(w, x, 2.1, 0.05, 3.4, 1.8, [1, 0.8, 0.4, 0.1]);
      for (let i = 0; i <= 6; i++) b.panelZ(x - 1.7 + (3.4 * i) / 6, 2.1, 0.09, 0.07, 1.8, '#1b1b1b');
    }
    ctx.signs.define('armeria', 12, 2, (g, W, Hh) => {
      g.fillStyle = '#1b1b1b';
      g.fillRect(0, 0, W, Hh);
      g.fillStyle = '#ffd23f';
      g.fillRect(Hh * 0.08, Hh * 0.08, W - Hh * 0.16, Hh - Hh * 0.16);
      // pistola de dibujos
      g.fillStyle = '#1b1b1b';
      const px = Hh * 0.25, py = Hh * 0.3;
      g.fillRect(px, py, Hh * 1.0, Hh * 0.25);
      g.fillRect(px, py, Hh * 0.28, Hh * 0.6);
      g.fillStyle = '#e8394d';
      g.fillRect(px + Hh * 1.0, py + Hh * 0.02, Hh * 0.12, Hh * 0.2);
      fitText(g, 'ARMERÍA EL GATILLO ALEGRE', W * 0.57, Hh * 0.38, W * 0.78, Hh * 0.42, FONT_IMPACT, '400', '#1b1b1b');
      fitText(g, 'Pistolas de agua, de sellos y de las otras', W * 0.57, Hh * 0.72, W * 0.76, Hh * 0.18, FONT, '800', '#1b1b1b');
    });
    ctx.signs.place(b, 'armeria', 0, 4.4, 0.14, 11.5, 1.9, 0.5);
  }
  // pistola gigante de juguete en la azotea
  b.frame(lot.x, lot.h + H, lot.z, lot.rot);
  b.box(-1, 2.4, 0, 7, 1.6, 1.2, '#2a2d33');
  b.box(-3.6, 0.9, 0, 1.6, 3, 1.1, '#6b4a2a');
  b.box(2.9, 2.4, 0, 0.8, 1.0, 0.9, '#f28c28');
  b.boxRot(-2.3, 1.2, 0, 0.3, 1.0, 0.3, 0, 0, 0.4, '#2a2d33');
  b.box(-1, 0.2, 0, 1, 0.4, 1, '#555');
  // dianas
  ctx.signs.define('diana', 1, 1, (g, W, Hh) => {
    g.clearRect(0, 0, W, Hh);
    for (let i = 5; i > 0; i--) {
      g.fillStyle = i % 2 ? '#e8394d' : '#ffffff';
      g.beginPath();
      g.arc(W / 2, Hh / 2, (W / 2) * (i / 5), 0, 7);
      g.fill();
    }
  });
  for (const s of [-1, 1]) {
    b.frame(lot.x, lot.h, lot.z, lot.rot + (s * Math.PI) / 2);
    ctx.signs.place(b, 'diana', 0, 3, hd > hw ? hw + 0.06 : hw + 0.06, 2.2, 2.2, 0.2);
  }
  out.pois.push(makePoi(ctx, 'gunshop', 'gunshop', 'Armería El Gatillo Alegre', lot, 0, true, 1.3));
  ctx.foot.push({ x: lot.x, z: lot.z, hw, hd, rot: lot.rot, color: olive, height: H });
}

// ───────────────────────── Nave con escalera a la azotea ─────────────────────────

function buildStairNave(ctx: Ctx, out: Out, lot: Lot) {
  const b = ctx.solid.at(lot.x, lot.z);
  const w = ctx.win.at(lot.x, lot.z);
  const hw = lot.hw - 1.8, hd = lot.hd; // deja sitio a la escalera en el lado +x
  const H = 7.2;
  const nl: Lot = { ...lot, hw, meta: {} };
  const c = lotPoint(lot, -1.8, 0);
  nl.x = c.x;
  nl.z = c.z;
  const y0 = baseDepth(ctx, nl);
  const col = '#c9a46a';
  b.frame(c.x, lot.h, c.z, lot.rot);
  b.box(0, (y0 + H) / 2, 0, hw * 2, H - y0, hd * 2, col, SKIP.NY | SKIP.PY);
  b.quadL(-hw, H, hd, hw, H, hd, hw, H, -hd, -hw, H, -hd, '#b7bcc2');
  ctx.box(c.x, lot.h + (y0 + H) / 2, c.z, hw, (H - y0) / 2, hd, lot.rot);
  for (let k = 0; k < 4; k++) {
    const { half } = facadeFrame(b, nl, k);
    facadeFrame(w, nl, k);
    for (let x = -half + 0.6; x < half - 0.3; x += 1.2) b.panelZ(x, H / 2, 0.03, 0.35, H - 0.4, shade(col, -0.18));
    b.panelZ(0, (y0 + 0.6) / 2, 0.04, half * 2, 0.6 - y0, '#8c8f93');
    for (let x = -half + 2.5; x < half - 2; x += 4) glass(w, x, H - 1.3, 0.06, 2.6, 0.8, [1, 0.85, 0.55, 0.4]);
    if (k === 0) {
      rollerDoor(b, -8, 6, 4.6, '#b7bcc2');
      rollerDoor(b, 4, 6, 4.6, '#b7bcc2');
      b.panelZ(hw - 2.5, 1.1, 0.05, 1.0, 2.2, '#3f4a55');
      ctx.signs.define('nave:CAJA FELIZ', 10, 2, (g, W, Hh) => {
        g.fillStyle = '#c9955a';
        g.fillRect(0, 0, W, Hh);
        g.fillStyle = '#3a2a14';
        g.fillRect(0, Hh * 0.84, W, Hh * 0.16);
        fitText(g, 'CARTONAJES LA CAJA FELIZ', W / 2, Hh * 0.4, W * 0.92, Hh * 0.5, FONT_IMPACT, '400', '#3a2a14');
        fitText(g, 'Cajas para tus cajas', W / 2, Hh * 0.92, W * 0.6, Hh * 0.13, FONT, '800', '#c9955a');
      });
      ctx.signs.place(b, 'nave:CAJA FELIZ', -2, H - 1.6, 0.1, 11, 2.2, 0.3);
    }
  }
  // peto con hueco donde llega la escalera
  b.frame(c.x, lot.h, c.z, lot.rot);
  const t = 0.25, ph = 1.0;
  const topZ = hd - 1.5 - stairRun(H);
  const gz0 = topZ - 2.6, gz1 = topZ + 0.2; // hueco donde llega la escalera (lado +x)
  const walls: [number, number, number, number][] = [
    [0, hd - t / 2, hw * 2, t],
    [0, -hd + t / 2, hw * 2, t],
    [-hw + t / 2, 0, t, hd * 2 - 2 * t],
    [hw - t / 2, (gz1 + hd - t) / 2, t, hd - t - gz1],
    [hw - t / 2, (-hd + t + gz0) / 2, t, gz0 - (-hd + t)],
  ];
  for (const [x, z, sx, sz] of walls) {
    if (sz <= 0.05) continue;
    b.box(x, H + ph / 2, z, sx, ph, sz, col, SKIP.NY);
    const P = lotPoint(nl, x, z);
    ctx.box(P.x, lot.h + H + ph / 2, P.z, sx / 2, ph / 2, sz / 2, lot.rot);
  }
  // escalera metálica pegada al lado +x, subiendo de delante hacia atrás
  const sx = hw + 0.75;
  const start = lotPoint(nl, sx, hd - 1.5);
  const st = stairs(ctx, b, start.x, lot.h, start.z, lot.rot + Math.PI, H, 1.3, '#8a9098', '#e8a01b', -1, false);
  {
    const a = lotPoint(nl, sx, hd - 0.7), top = lotPoint(nl, sx, hd - 1.5 - st.run - 1.2), roof = lotPoint(nl, 0, -hd + 4);
    ctx.climbs.push({ name: 'nave', a: new THREE.Vector3(a.x, lot.h, a.z), b: new THREE.Vector3(top.x, lot.h + H, top.z), c: new THREE.Vector3(roof.x, lot.h + H, roof.z) });
  }
  const land = lotPoint(nl, sx, hd - 1.5 - st.run - 1.2);
  b.frame(0, 0, 0, 0);
  b.box(land.x, lot.h + H - 0.1, land.z, 1.3, 0.2, 2.4, '#8a9098');
  ctx.box(land.x, lot.h + H - 0.1, land.z, 0.65, 0.1, 1.2, lot.rot);
  // azotea: palés y coleccionable
  const rp = lotPoint(nl, -hw + 4, -hd + 4);
  collectible(ctx, rp.x, lot.h + H, rp.z);
  ctx.props.add('crateStack', lotPoint(nl, -hw + 6, -hd + 3).x, lot.h + H, lotPoint(nl, -hw + 6, -hd + 3).z, 0.4, 1.2);
  out.delivery.push({ id: 'caja-feliz', district: 'poligono', door: doorPoint(ctx, nl, hw - 2.5, 1.3), facing: lot.rot, label: 'Cartonajes La Caja Feliz (recepción)' });
  ctx.foot.push({ x: c.x, z: c.z, hw, hd, rot: lot.rot, color: col, height: H });
}

// ───────────────────────── Descampado con rampas ─────────────────────────

function buildWasteland(ctx: Ctx, out: Out) {
  const cx = 208, cz = -20;
  ctx.paved.push({ x: cx, z: cz, hw: 27, hd: 15, rot: 0, color: '#b3a58a' });
  // dos rampas en carriles paralelos (una hacia el este y otra hacia el oeste): nadie aterriza contra la otra
  jumpRamp(ctx, cx - 14, cz - 6, Math.PI / 2, 9, 5, 2.0);
  jumpRamp(ctx, cx + 14, cz + 6, -Math.PI / 2, 9, 5, 1.6);
  // paquete en lo alto de la rampa grande (su tapa está a ~1,85 m a 3,8 m del centro)
  collectible(ctx, cx - 14 + 3.8, ctx.heightAt(cx - 14, cz - 6) + 1.85, cz - 6);
  const rng = ctx.rng;
  for (let i = 0; i < 6; i++) {
    // neumáticos y matorrales solo en los bordes, fuera de los carriles de salto
    const x = cx + rng.range(-24, 24), z = cz + (i % 2 ? 1 : -1) * rng.range(12, 13.5);
    ctx.props.add(i % 2 ? 'tyres' : 'bush', x, ctx.heightAt(x, z), z, rng.range(0, 6), 1);
  }
  // fila de conos y vallas entre los dos carriles de salto
  for (let i = 0; i < 6; i++) ctx.breakables.push({ kind: i % 2 ? 'cone' : 'fence', pos: ground(ctx, cx - 6 + i * 2.4, cz), rotY: 0 });
  void out;
}

export { FONT_SCRIPT, FONT_FUN, curbParking };
