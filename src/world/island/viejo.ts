// El Barrio Viejo: plazuela del Matasellos, dos bares con terraza, casa con escalera a la azotea,
// el rincón hippie del vendedor de hierbas, callejón sin salida y la playa del poniente.
import * as THREE from 'three';
import type { Ctx } from './ctx';
import { GeoBuilder, SKIP, lin } from './geo';
import { OCC } from './occ';
import { PlanCtx, Special, Out, collectible, makePoi, ground, doorPoint, stairs, stairRun, poiAt, jumpRamp } from './special';
import { glass, facadeFrame, baseDepth, stripedAwning, house, PAL } from './buildings';
import { lotPoint, Lot } from './layout';
import { fitText, roundRect, neonSign, FONT, FONT_SCRIPT, FONT_FUN, FONT_SERIF } from './signs';
import { BAR_NAMES } from './names';
import { findFree } from './colina';

export function planViejo(p: PlanCtx): Special[] {
  const { layout, occ } = p;
  // plazuela: la manzana entre los callejones x -198 / -160 y z 33 / 62
  const px0 = -194.5, px1 = -163.5, pz0 = 36.5, pz1 = 58.5;
  for (let z = pz0; z < pz1; z++) for (let x = px0; x < px1; x++) if (occ.get(x + 0.5, z + 0.5) === OCC.FREE) occ.set(x + 0.5, z + 0.5, OCC.RESERVED);
  const bar1 = layout.lotNear(-172, 27, 12, 9, { kind: 'special' }, 'bar1');
  const bar2 = layout.lotNear(-146, -6, 14, 9, { kind: 'special' }, 'bar2', 'Calle Mayor del Viejo');
  const roofHouse = layout.lotNear(-150, 45, 12, 10, { kind: 'special' }, 'casa-azotea');
  if (!bar1 || !bar2 || !roofHouse) console.warn('[isla] Viejo: falta algún solar', !!bar1, !!bar2, !!roofHouse);
  // rincón hippie junto a la playa del poniente
  const hip = findFree(occ, -270, 40, 20, 9);
  if (hip) occ.markCircle(hip.x, hip.z, 9, OCC.RESERVED);
  const rampSpot = findFree(occ, -268, -30, 25, 7);
  if (rampSpot) occ.markCircle(rampSpot.x, rampSpot.z, 7, OCC.RESERVED);
  return [
    {
      name: 'viejo',
      build: (ctx, out) => {
        buildPlazuela(ctx, out, (px0 + px1) / 2, (pz0 + pz1) / 2, (px1 - px0) / 2, (pz1 - pz0) / 2);
        if (bar1) buildBar(ctx, out, bar1, 0, 'bar-1');
        if (bar2) buildBar(ctx, out, bar2, 1, 'bar-2');
        if (roofHouse) buildRoofHouse(ctx, out, roofHouse);
        if (hip) buildHippie(ctx, out, hip.x, hip.z);
        if (rampSpot) jumpRamp(ctx, rampSpot.x, rampSpot.z, -Math.PI / 2, 9, 5, 1.8);
        // callejón sin salida (de verdad)
        collectible(ctx, -146, ctx.heightAt(-146, -20.5), -20.5);
        // patinete eléctrico en las plazas de la Calle Mayor
        ctx.specials.push({ kind: 'scooter_e', pos: ground(ctx, -205, -0.8), heading: Math.PI / 2 });
        // playa del poniente
        beachSpot(ctx, -1);
        beachSpot(ctx, 1);
      },
    },
  ];
}

// ───────────────────────── Plazuela del Matasellos ─────────────────────────

function buildPlazuela(ctx: Ctx, out: Out, cx: number, cz: number, hw: number, hd: number) {
  const pave = ctx.pave;
  pave.rect(pave.walk, cx, cz, hw, hd, 0, '#d9c29a', 2.5);
  // empedrado a cuadros
  for (let i = -3; i <= 3; i++) pave.rect(pave.paint, cx + i * 4.4, cz, 0.12, hd - 0.5, 0, '#c4a87a', 2.5);
  for (let j = -2; j <= 2; j++) pave.rect(pave.paint, cx, cz + j * 4.4, hw - 0.5, 0.12, 0, '#c4a87a', 2.5);
  ctx.paved.push({ x: cx, z: cz, hw, hd, rot: 0, color: '#d9c29a' });
  const y = ctx.heightAt(cx, cz);
  const b = ctx.solid.at(cx, cz);
  b.frame(cx, y, cz, 0);
  // olivo centenario en un alcorque redondo
  b.cyl(0, 0, 0, 2.2, 2.2, 0.45, 12, '#e9e1cf', true);
  b.cyl(0, 0.45, 0, 1.9, 1.9, 0.02, 12, '#7a5a3a', true);
  ctx.props.add('olive', cx, y + 0.45, cz, 0.5, 1.6);
  ctx.cyl(cx, y + 0.25, cz, 0.25, 2.2);
  // fuente de pueblo con caño
  const fx = cx - hw + 2.5;
  b.frame(fx, ctx.heightAt(fx, cz), cz, Math.PI / 2);
  b.box(0, 0.35, 0.8, 2.6, 0.7, 1.4, '#cfc3ab');
  b.box(0, 0.62, 0.8, 2.3, 0.1, 1.1, '#46b2dc', 0, [0.05, 0.3, 0.55, 0.1]);
  b.box(0, 1.2, 0, 1.4, 2.4, 0.5, '#d9cdb5');
  b.box(0, 1.3, 0.35, 0.12, 0.12, 0.4, '#8a6a3a');
  b.box(0, 2.5, 0, 1.6, 0.3, 0.6, '#c4b89e');
  ctx.box(fx, ctx.heightAt(fx, cz) + 0.9, cz, 0.9, 0.9, 1.3, Math.PI / 2);
  // bancos, farolas y macetas
  for (const [dx, dz, r] of [[-6, -hd + 1.2, 0], [6, -hd + 1.2, 0], [-6, hd - 1.2, Math.PI], [6, hd - 1.2, Math.PI]] as const) {
    ctx.props.add('bench', cx + dx, ctx.heightAt(cx + dx, cz + dz), cz + dz, r, 1);
  }
  for (const [dx, dz] of [[-hw + 1, -hd + 1], [hw - 1, -hd + 1], [-hw + 1, hd - 1], [hw - 1, hd - 1]]) {
    ctx.props.add('lampOld', cx + dx, ctx.heightAt(cx + dx, cz + dz), cz + dz, 0, 1);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.props.add('pot', cx + Math.cos(a) * 3.2, y, cz + Math.sin(a) * 3.2, a, 0.8);
  }
  ctx.props.add('bin', cx - 10, ctx.heightAt(cx - 10, cz + hd - 1), cz + hd - 1, 0, 1);
  ctx.props.add('bin', cx + 10, ctx.heightAt(cx + 10, cz - hd + 1), cz - hd + 1, 0, 1);
  // terraza del bar: mesas con sombrilla en la mitad norte
  for (let i = 0; i < 4; i++) {
    const tx = cx - 9 + i * 6, tz = cz - hd + 5;
    ctx.props.add('barTable', tx, ctx.heightAt(tx, tz), tz, 0, 1);
    if (i % 2 === 0) ctx.props.add('umbrella', tx, ctx.heightAt(tx, tz), tz, 0.3, 1);
  }
  // puestos de fruta del mercadillo (rompibles)
  for (let i = 0; i < 3; i++) ctx.breakables.push({ kind: 'fruit', pos: ground(ctx, cx + 5 + i * 3.6, cz + hd - 3.2), rotY: Math.PI });
  collectible(ctx, cx + 1.4, y + 0.45, cz + 1.2);
  // placa con el nombre
  ctx.signs.define('plazuela', 2.2, 0.8, (g, W, H) => {
    g.fillStyle = '#f4efe2';
    roundRect(g, 0, 0, W, H, H * 0.1);
    g.fill();
    g.strokeStyle = '#2f5fa7';
    g.lineWidth = H * 0.06;
    roundRect(g, H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12, H * 0.08);
    g.stroke();
    fitText(g, 'Plaza del Matasellos', W / 2, H / 2, W * 0.86, H * 0.5, FONT_SERIF, '700', '#2f5fa7');
  });
  b.frame(cx, y, cz, 0);
  b.box(hw - 0.5, 1.2, hd - 0.5, 0.08, 2.4, 0.08, '#333');
  ctx.signs.placeDouble(b, 'plazuela', hw - 0.5, 2.3, hd - 0.5, 1.6, 0.58, 0);
  out.extra.plazuela = new THREE.Vector3(cx, y, cz);
}

// ───────────────────────── Bares con terraza ─────────────────────────

function buildBar(ctx: Ctx, out: Out, lot: Lot, i: number, id: string) {
  const bar = BAR_NAMES[i];
  const rng = ctx.rng;
  const b = ctx.solid.at(lot.x, lot.z);
  const w = ctx.win.at(lot.x, lot.z);
  const hw = lot.hw, hd = lot.hd;
  const floors = 2, fh = 3.1;
  const H = floors * fh + 0.3;
  const y0 = baseDepth(ctx, lot);
  const col = i === 0 ? '#f7f4ec' : '#f5e1b3';
  const zc = i === 0 ? '#2f6fb0' : '#8a3a2a';
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  b.box(0, (y0 + H) / 2, 0, hw * 2, H - y0, hd * 2, col, SKIP.NY | SKIP.PY);
  b.box(0, H - 0.08, 0, hw * 2 + 0.7, 0.16, hd * 2 + 0.7, '#b8a58c', SKIP.PY);
  b.roof(0, H, 0, hw * 2 + 0.7, hd * 2 + 0.7, 2.2, '#c65f36', col, false);
  ctx.box(lot.x, lot.h + (y0 + H) / 2, lot.z, hw, (H - y0) / 2, hd, lot.rot);
  const { half } = facadeFrame(b, lot, 0);
  facadeFrame(w, lot, 0);
  b.panelZ(0, (y0 + 1) / 2, 0.03, half * 2, 1 - y0, zc);
  // puerta y ventanales de bar
  b.panelZ(-2, 1.3, 0.04, 1.6, 2.6, '#5e3b22');
  glass(w, -2, 1.3, 0.06, 1.2, 2.3, [1, 0.8, 0.45, 0.02]);
  glass(w, 2.5, 1.7, 0.05, 3.6, 1.8, [1, 0.8, 0.45, 0.02], lin('#40302a').clone(), lin('#a08060').clone());
  b.panelZ(2.5, 1.7, 0.04, 3.9, 2.1, '#5e3b22');
  stripedAwning(b, 0, 3.0, 0.05, half * 2 - 0.6, 1.8, 0.6, i === 0 ? '#2f7fcf' : '#3f9a5a', '#f7f4ec', 8);
  // ventanas de arriba
  for (const x of [-3, 3]) {
    glass(w, x, fh + 1.6, 0.04, 1.0, 1.3, [1, 0.85, 0.55, 0.4]);
    b.panelZ(x - 0.75, fh + 1.6, 0.06, 0.5, 1.3, '#3f7d4a');
    b.panelZ(x + 0.75, fh + 1.6, 0.06, 0.5, 1.3, '#3f7d4a');
    b.box(x, fh + 0.85, 0.16, 1.1, 0.22, 0.24, '#c8643b', SKIP.NY | SKIP.NZ);
    b.box(x, fh + 1.0, 0.16, 1.1, 0.16, 0.26, '#e8394d', SKIP.NY | SKIP.NZ);
  }
  // letrero de neón
  const key = 'bar:' + bar.name;
  ctx.signs.define(key, 5, 1.3, neonSign(bar.name, i === 0 ? '#ffb347' : '#7fffb0', bar.sub, '#ffffff', '#221610', i === 0 ? FONT_SCRIPT : FONT_SERIF));
  ctx.signs.place(b, key, 0, 3.75, 0.12, 4.6, 1.2, 1);
  // farolillo y barril en la puerta
  b.cyl(-4.2, 0, 0.8, 0.35, 0.35, 0.9, 8, '#7a5230', true);
  b.cyl(-4.2, 0.9, 0.8, 0.45, 0.45, 0.04, 8, '#5e3b22', true);
  // terraza en la acera
  for (let k = 0; k < 2; k++) {
    const tp = lotPoint(lot, 1.5 + k * 3.2, hd + 1.4);
    if (ctx.occ.get(tp.x, tp.z) !== OCC.BUILDING) ctx.props.add('barTable', tp.x, ctx.heightAt(tp.x, tp.z), tp.z, lot.rot + Math.PI / 2, 0.9);
  }
  const poi = makePoi(ctx, id, 'bar', bar.name, lot, -2, true, 1.3);
  out.pois.push(poi);
  void rng;
  ctx.foot.push({ x: lot.x, z: lot.z, hw, hd, rot: lot.rot, color: col, height: H });
}

// ───────────────────────── Casa con escalera a la azotea ─────────────────────────

function buildRoofHouse(ctx: Ctx, out: Out, lot: Lot) {
  const b = ctx.solid.at(lot.x, lot.z);
  const w = ctx.win.at(lot.x, lot.z);
  const hw = lot.hw, hd = lot.hd;
  const H = 6.3;
  const y0 = baseDepth(ctx, lot);
  const col = '#f9e0e3', zc = '#5a4a8a';
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  b.box(0, (y0 + H) / 2, 0, hw * 2, H - y0, hd * 2, col, SKIP.NY | SKIP.PY);
  b.quadL(-hw, H, hd, hw, H, hd, hw, H, -hd, -hw, H, -hd, '#cdbfa9');
  ctx.box(lot.x, lot.h + (y0 + H) / 2, lot.z, hw, (H - y0) / 2, hd, lot.rot);
  for (let k = 0; k < 4; k++) {
    const { half } = facadeFrame(b, lot, k);
    facadeFrame(w, lot, k);
    b.panelZ(0, (y0 + 0.9) / 2, 0.03, half * 2, 0.9 - y0, zc);
    if (k !== 0) continue;
    b.panelZ(3.5, 1.1, 0.05, 1.1, 2.2, '#2f6fb0');
    for (const x of [-3.5, 0]) {
      glass(w, x, 1.7, 0.05, 0.95, 1.25, [1, 0.85, 0.55, 0.3]);
      glass(w, x + 3.5 * (x < 0 ? 0 : 1), 4.6, 0.05, 0.95, 1.25, [1, 0.85, 0.55, 0.6]);
    }
  }
  // escalera exterior pegada a la fachada, subiendo a lo largo de ella
  const run = stairRun(H);
  const sx = -hw + 0.3; // empieza en un extremo de la fachada
  const start = lotPoint(lot, sx + 0.0, hd + 0.7);
  // dirección a lo largo de la fachada (+x local)
  const dir = lot.rot + Math.PI / 2;
  stairs(ctx, b, start.x, lot.h, start.z, dir, H, 1.3, '#f4efe6', '#2a2c31', -1, false);
  const top = lotPoint(lot, sx + run + 0.9, hd + 0.7);
  {
    const a = lotPoint(lot, sx - 0.8, hd + 0.7), roof = lotPoint(lot, 0, 0);
    ctx.climbs.push({ name: 'casa-azotea', a: new THREE.Vector3(a.x, lot.h, a.z), b: new THREE.Vector3(top.x, lot.h + H, top.z), c: new THREE.Vector3(roof.x, lot.h + H, roof.z) });
  }
  b.frame(0, 0, 0, 0);
  b.box(top.x, lot.h + H - 0.1, top.z, 1.8, 0.2, 1.8, '#f4efe6');
  ctx.box(top.x, lot.h + H - 0.1, top.z, 0.9, 0.1, 0.9);
  // peto con hueco sobre el rellano
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  const t = 0.25, ph = 0.9;
  const gx0 = sx + run - 0.2, gx1 = sx + run + 2.0;
  const walls: [number, number, number, number][] = [
    [(-hw + gx0) / 2, hd - t / 2, gx0 + hw, t],
    [(gx1 + hw) / 2, hd - t / 2, hw - gx1, t],
    [0, -hd + t / 2, hw * 2, t],
    [hw - t / 2, 0, t, hd * 2 - 2 * t],
    [-hw + t / 2, 0, t, hd * 2 - 2 * t],
  ];
  for (const [x, z, sxx, szz] of walls) {
    if (sxx <= 0.05) continue;
    b.box(x, H + ph / 2, z, sxx, ph, szz, col, SKIP.NY);
    const P = lotPoint(lot, x, z);
    ctx.box(P.x, lot.h + H + ph / 2, P.z, sxx / 2, ph / 2, szz / 2, lot.rot);
  }
  // azotea: tendedero, macetas, hamaca y el paquete perdido
  const rng = ctx.rng;
  b.frame(lot.x, lot.h + H, lot.z, lot.rot);
  const clx = -hw + 1.5;
  b.box(clx, 0.8, -hd + 1, 0.06, 1.6, 0.06, '#8d8f93');
  b.box(clx + 5, 0.8, -hd + 1, 0.06, 1.6, 0.06, '#8d8f93');
  const cl0 = lotPoint(lot, clx, -hd + 1), cl1 = lotPoint(lot, clx + 5, -hd + 1);
  b.frame(0, 0, 0, 0);
  const cy = lot.h + H;
  b.beam(cl0.x, cy + 1.55, cl0.z, cl1.x, cy + 1.55, cl1.z, 0.03, '#eeeeee');
  for (let i = 0; i < 5; i++) {
    const tt = (i + 0.5) / 5;
    const px = cl0.x + (cl1.x - cl0.x) * tt, pz = cl0.z + (cl1.z - cl0.z) * tt;
    b.frame(px, cy, pz, lot.rot);
    b.box(0, 1.2, 0, 0.55, 0.65, 0.02, ['#e8394d', '#ffffff', '#2f7fcf', '#f2d13b', '#3fae6a'][i]);
  }
  for (let i = 0; i < 4; i++) {
    const pp = lotPoint(lot, hw - 1, -hd + 1.5 + i * 1.8);
    ctx.props.add('pot', pp.x, lot.h + H, pp.z, rng.range(0, 6), 0.8);
  }
  const lp = lotPoint(lot, 1, 0);
  ctx.props.add('lounger', lp.x, lot.h + H, lp.z, lot.rot, 1);
  const cp = lotPoint(lot, -1.5, -1);
  collectible(ctx, cp.x, lot.h + H, cp.z);
  out.delivery.push({ id: 'casa-azotea', district: 'viejo', door: doorPoint(ctx, lot, 3.5, 1.2), facing: lot.rot, label: 'Casa de la Escalera Azul, 1' });
  ctx.foot.push({ x: lot.x, z: lot.z, hw, hd, rot: lot.rot, color: col, height: H });
}

// ───────────────────────── Rincón hippie del vendedor de hierbas ─────────────────────────

function vanGeo(b: GeoBuilder) {
  // furgoneta hippie de dos tonos
  b.box(0, 0.75, 0, 2.0, 1.0, 4.6, '#f2e6c8');
  b.box(0, 1.75, -0.2, 1.95, 1.0, 4.2, '#f28c28');
  b.box(0, 1.25, 0, 2.02, 0.12, 4.62, '#ffffff');
  b.box(0, 1.75, 1.95, 1.8, 0.8, 0.05, '#3b6d94');
  for (const z of [-1.4, 1.4]) for (const s of [-1, 1]) b.cyl(s * 1.0, 0.0, z, 0.38, 0.38, 0.3, 8, '#1b1b1b', true, true);
  b.box(0, 2.35, -0.3, 1.6, 0.15, 3.0, '#6b4a2a');
  // flores pintadas
  const fl = ['#e8394d', '#ffd23f', '#3f9a5a', '#7c4dbb', '#2f7fcf'];
  for (let i = 0; i < 5; i++) {
    for (const s of [-1, 1]) b.box(s * 1.01, 0.8 + (i % 2) * 0.25, -1.8 + i * 0.9, 0.02, 0.35, 0.35, fl[i]);
  }
}

function buildHippie(ctx: Ctx, out: Out, x: number, z: number) {
  const y = ctx.heightAt(x, z);
  const b = ctx.solid.at(x, z);
  const rot = Math.PI / 2; // la furgo mira al este (a la calle)
  b.frame(x, y, z, rot);
  vanGeo(b);
  ctx.box(x, y + 1.2, z, 2.3, 1.2, 1.0, rot);
  // toldo con estructura
  b.frame(x, y, z, rot);
  stripedAwning(b, 2.4, 2.4, -1.0, 4.2, 3.2, 0.5, '#7c4dbb', '#ffd23f', 7);
  b.box(0.4, 1.0, 2.2, 0.08, 2.0, 0.08, '#6b4a2a');
  b.box(4.4, 1.0, 2.2, 0.08, 2.0, 0.08, '#6b4a2a');
  // puesto: mesa con macetas de "hierbas aromáticas"
  b.box(2.4, 0.45, 1.2, 2.6, 0.9, 0.9, '#b98a58');
  for (let i = 0; i < 5; i++) {
    b.box(1.4 + i * 0.5, 1.0, 1.2, 0.3, 0.22, 0.3, '#c8643b');
    b.box(1.4 + i * 0.5, 1.2, 1.2, 0.36, 0.25, 0.36, '#3f9a3c');
  }
  ctx.box(lotLike(x, z, rot, 2.4, 1.2).x, y + 0.45, lotLike(x, z, rot, 2.4, 1.2).z, 1.3, 0.45, 0.45, rot);
  // pufs de colores y banderitas
  const cols = ['#e8394d', '#ffd23f', '#3f9a5a', '#2f7fcf', '#ff6fb5'];
  for (let i = 0; i < 3; i++) b.blob(1 + i * 1.6, 0.3, 3.4, 0.5, 0.35, 0.5, cols[i + 1], 0.1, i);
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    b.triL(-2 + t * 7, 2.9, -2.3, -1.6 + t * 7, 2.9, -2.3, -1.8 + t * 7, 2.4, -2.3, cols[i % cols.length]);
    b.triL(-1.6 + t * 7, 2.9, -2.32, -2 + t * 7, 2.9, -2.32, -1.8 + t * 7, 2.4, -2.32, cols[i % cols.length]);
  }
  ctx.signs.define('hierbas', 4, 1.4, (g, W, H) => {
    g.fillStyle = '#2f8f4a';
    roundRect(g, 0, 0, W, H, H * 0.3);
    g.fill();
    g.fillStyle = '#ffd23f';
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.arc(W * (0.08 + i * 0.14), H * 0.12, H * 0.05, 0, 7);
      g.fill();
    }
    fitText(g, 'Hierbas El Colocón', W / 2, H * 0.45, W * 0.9, H * 0.42, FONT_FUN, '900', '#fff45a', '#1b4a2a', H * 0.05);
    fitText(g, 'Aromáticas. Muy aromáticas. Guiño, guiño.', W / 2, H * 0.78, W * 0.88, H * 0.17, FONT, '800', '#ffffff');
  });
  b.frame(x, y, z, rot);
  b.box(4.6, 1.2, -0.5, 0.1, 2.4, 0.1, '#6b4a2a');
  ctx.signs.placeDouble(b, 'hierbas', 4.6, 2.5, -0.5, 2.4, 0.84, 0.3);
  const door = lotLike(x, z, rot, 2.4, 2.8);
  out.pois.push(poiAt(ctx, 'weed', 'weed', 'Hierbas El Colocón', door.x, door.z, rot, ground(ctx, lotLike(x, z, rot, 7, 2).x, lotLike(x, z, rot, 7, 2).z)));
  const cp = lotLike(x, z, rot, -3.4, -1.2);
  collectible(ctx, cp.x, ctx.heightAt(cp.x, cp.z), cp.z);
  ctx.props.add('palm', lotLike(x, z, rot, -3, 3).x, y - 0.1, lotLike(x, z, rot, -3, 3).z, 1, 1.1);
  ctx.foot.push({ x, z, hw: 1.1, hd: 2.3, rot, color: '#f28c28', height: 2.4 });
}

/** Punto local (lx, lz) de un marco (x, z, rot). */
function lotLike(x: number, z: number, rot: number, lx: number, lz: number) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return { x: x + lx * c + lz * s, z: z - lx * s + lz * c };
}

/** Paquete perdido en la arena de una playa (side -1 poniente, +1 levante). */
function beachSpot(ctx: Ctx, side: number) {
  for (let t = 0; t < 120; t++) {
    const z = (side < 0 ? 60 : 120) + (t % 12) * 6 - 30;
    const x0 = side * 250;
    for (let d = 0; d < 70; d += 2) {
      const x = x0 + side * d;
      const h = ctx.heightAt(x, z);
      if (h < 1.25 && h > 0.5) {
        collectible(ctx, x, h, z);
        return;
      }
    }
  }
}

export { house, PAL, FONT_SCRIPT };
