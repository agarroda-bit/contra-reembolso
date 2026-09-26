// El Puerto: oficina de reparto, lonja, muelle de pescadores, monumento, contenedores, grúas,
// carguero con pasarela y faro en el espigón.
import * as THREE from 'three';
import type { Ctx } from './ctx';
import { GeoBuilder, SKIP, lin } from './geo';
import { OCC } from './occ';
import { QUAY_H, QUAY_Z } from './shape';
import { PlanCtx, Special, Out, manualLot, stairs, jumpRamp, collectible, makePoi, doorPoint, ground } from './special';
import { glass, rollerDoor, facadeFrame, baseDepth } from './buildings';
import { lotPoint, Lot } from './layout';
import { fitText, roundRect, FONT_IMPACT, FONT, FONT_FUN, FONT_SERIF } from './signs';
import { makeBeamMaterial } from './materials';

export const YELLOW = '#ffd23f';
export const NAVY = '#1b1030';
const CARDBOARD = '#c9955a';

export function planPort(p: PlanCtx): Special[] {
  const { layout, occ } = p;
  // todo el muelle queda reservado para el diseño a mano
  for (let z = 174; z < QUAY_Z; z += 1) {
    for (let x = -165; x < 200; x += 1) {
      if (occ.get(x + 0.5, z + 0.5) === OCC.FREE) occ.set(x + 0.5, z + 0.5, OCC.RESERVED);
    }
  }
  const office = manualLot(layout, -40, 206, 22, 12, Math.PI, QUAY_H, 'special', 'office');
  const lonja = manualLot(layout, -122, 196, 15, 9, Math.PI, QUAY_H, 'special', 'lonja');
  return [{ name: 'puerto', build: (ctx, out) => buildPort(ctx, out, office, lonja) }];
}

function buildPort(ctx: Ctx, out: Out, office: Lot, lonja: Lot) {
  // explanada del muelle (va primero en el mapa: lo demás se pinta encima)
  ctx.paved.push({ x: 15, z: 218, hw: 170, hd: 44, rot: 0, color: '#c9c3b6' });
  buildOffice(ctx, out, office);
  buildLonja(ctx, out, lonja);
  buildPier(ctx, out);
  buildMonument(ctx);
  buildContainers(ctx, out);
  buildCranes(ctx, out);
  buildShip(ctx, out);
  buildLighthouse(ctx, out);
  // norays en el borde del muelle
  for (let x = -146; x <= 182; x += 12) {
    if (x > -130 && x < -120) continue;
    ctx.props.add('noray', x, QUAY_H, QUAY_Z - 0.9, 0, 1);
  }
  // rampas del puerto
  jumpRamp(ctx, -84, 242, -Math.PI / 2, 9, 5, 1.9);
  jumpRamp(ctx, 98, 180, 0, 9, 5, 1.8);
  // grúa conducible
  ctx.specials.push({ kind: 'crane', pos: ground(ctx, 25, 248), heading: Math.PI / 2 });
  // cajas rompibles
  const crates: [number, number][] = [
    [-138, 208], [-136, 209.5], [-112, 209], [-110.5, 210.5], [-104, 250], [-102, 251.5],
    [-15, 226], [-13.5, 227], [-66, 226], [-64.5, 224.5], [30, 186], [31.5, 187.5], [150, 244], [151.5, 245.5], [42, 258], [-140, 255],
  ];
  for (const [x, z] of crates) ctx.breakables.push({ kind: 'crate', pos: ground(ctx, x, z), rotY: (x * 7) % 3 });
  for (let i = 0; i < 4; i++) ctx.breakables.push({ kind: 'cone', pos: ground(ctx, -63 + i * 1.6, 178), rotY: 0 });
  // palmeras del paseo portuario
  for (let x = -100; x <= 36; x += 17) {
    if (x > -66 && x < -14) continue;
    ctx.props.add('palm', x, QUAY_H, 176.5, x, 1.05);
  }
  // torres de iluminación y farolas del paseo del muelle
  for (const [x, z] of [[98, 214], [151, 214], [44, 214], [80, 244], [140, 244], [-40, 232], [-100, 232], [10, 188]] as const) {
    ctx.props.add('mast', x, QUAY_H, z, Math.atan2(-x + 60, -z + 215), 1);
  }
  for (let x = -145; x <= 35; x += 22) {
    if (x > -130 && x < -118) continue;
    ctx.props.add('lampOld', x, QUAY_H, QUAY_Z - 5.5, 0, 1);
  }
  for (const x of [-86, -74, 14, 26]) ctx.props.add('bin', x, QUAY_H, QUAY_Z - 3.2, 0, 1);
  // bancos mirando al mar
  for (const x of [-92, -80, 8, 20, 32]) ctx.props.add('bench', x, QUAY_H, QUAY_Z - 3, Math.PI, 1);
}

// ───────────────────────── Oficina de reparto ─────────────────────────

function officeSign(): (g: CanvasRenderingContext2D, W: number, H: number) => void {
  return (g, W, H) => {
    g.fillStyle = NAVY;
    roundRect(g, 0, 0, W, H, H * 0.12);
    g.fill();
    g.strokeStyle = YELLOW;
    g.lineWidth = H * 0.05;
    roundRect(g, H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12, H * 0.08);
    g.stroke();
    // caja con alas
    const bx = H * 0.55, by = H * 0.5, s = H * 0.5;
    g.fillStyle = CARDBOARD;
    g.fillRect(bx - s / 2, by - s / 2, s, s);
    g.fillStyle = '#e8d7a8';
    g.fillRect(bx - s * 0.08, by - s / 2, s * 0.16, s);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(bx - s * 0.5, by - s * 0.1);
    g.lineTo(bx - s * 1.0, by - s * 0.35);
    g.lineTo(bx - s * 0.9, by + s * 0.05);
    g.closePath();
    g.fill();
    fitText(g, 'CONTRA REEMBOLSO', W * 0.56, H * 0.4, W * 0.72, H * 0.46, FONT_IMPACT, '400', YELLOW, '#000', H * 0.05);
    fitText(g, 'Reparto a domicilio · Pagas al recibir', W * 0.56, H * 0.77, W * 0.7, H * 0.16, FONT, '800', '#ffffff');
  };
}

function buildOffice(ctx: Ctx, out: Out, lot: Lot) {
  const rng = ctx.rng;
  const b = ctx.solid.at(lot.x, lot.z);
  const w = ctx.win.at(lot.x, lot.z);
  const hw = lot.hw, hd = lot.hd;
  const H1 = 4.6, H = 9;
  const y0 = baseDepth(ctx, lot);
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  // el amarillo corporativo brilla un poco (la fachada mira al norte y casi siempre está en sombra)
  const glowY = [0.2, 0.14, 0.01, 1.0]; // nivel 1: el mismo brillo de día y de noche
  b.box(0, (y0 + H) / 2, 0, hw * 2, H - y0, hd * 2, YELLOW, SKIP.NY | SKIP.PY, glowY);
  b.quadL(-hw, H, hd, hw, H, hd, hw, H, -hd, -hw, H, -hd, '#cfc6b4');
  // peto azul marino
  for (const [x, z, sx, sz] of [[0, hd - 0.15, hw * 2, 0.3], [0, -hd + 0.15, hw * 2, 0.3], [hw - 0.15, 0, 0.3, hd * 2], [-hw + 0.15, 0, 0.3, hd * 2]]) {
    b.box(x, H + 0.5, z, sx, 1.0, sz, NAVY, SKIP.NY);
  }
  // caja gigante en la azotea con el logo
  b.box(7, H + 2.6, -2, 6, 5.2, 6, CARDBOARD, SKIP.NY);
  b.box(7, H + 5.22, -2, 1.1, 0.06, 6.04, '#ecdcae');
  b.box(7, H + 2.6, 1.02, 1.1, 5.24, 0.04, '#ecdcae');
  ctx.signs.define('office-box', 3, 3, (g, W, Hh) => {
    g.fillStyle = 'rgba(0,0,0,0)';
    g.clearRect(0, 0, W, Hh);
    g.fillStyle = NAVY;
    g.beginPath();
    g.arc(W / 2, Hh / 2, W * 0.46, 0, Math.PI * 2);
    g.fill();
    fitText(g, 'CR', W / 2, Hh * 0.47, W * 0.7, Hh * 0.5, FONT_IMPACT, '400', YELLOW);
    fitText(g, '€ al recibir', W / 2, Hh * 0.76, W * 0.6, Hh * 0.12, FONT, '800', '#fff');
  });
  ctx.signs.place(b, 'office-box', 5.2, H + 2.6, 1.05, 2.6, 2.6, 0.4);
  ctx.box(lotPoint(lot, 7, -2).x, lot.h + H + 2.6, lotPoint(lot, 7, -2).z, 3, 2.6, 3, lot.rot);
  ctx.box(lot.x, lot.h + (y0 + H) / 2, lot.z, hw, (H - y0) / 2, hd, lot.rot);

  for (let k = 0; k < 4; k++) {
    const { half } = facadeFrame(b, lot, k);
    facadeFrame(w, lot, k);
    b.panelZ(0, (y0 + 0.6) / 2, 0.03, half * 2 + 0.02, 0.6 - y0, NAVY);
    b.box(0, H1, 0.1, half * 2 + 0.1, 0.35, 0.2, NAVY, SKIP.NZ);
    if (k === 0) {
      // persiana del garaje
      rollerDoor(b, 13, 8, 4.1, '#c9ced4');
      ctx.signs.define('office-garage', 4, 0.6, (g, W, Hh) => {
        g.fillStyle = NAVY;
        g.fillRect(0, 0, W, Hh);
        fitText(g, 'GARAJE · NO APARCAR (EN SERIO)', W / 2, Hh / 2, W * 0.92, Hh * 0.6, FONT, '900', YELLOW);
      });
      ctx.signs.place(b, 'office-garage', 13, 4.95, 0.12, 5, 0.75, 0.3);
      // entrada acristalada con marquesina
      b.panelZ(-6, 1.55, 0.04, 3.6, 3.1, NAVY);
      glass(w, -6, 1.5, 0.06, 3.1, 2.9, [1, 0.85, 0.55, 0.05], lin('#35526b').clone(), lin('#8fb6d4').clone());
      b.panelZ(-6, 1.5, 0.08, 0.08, 2.9, NAVY);
      b.box(-6, 3.45, 1.2, 5, 0.25, 2.4, NAVY);
      b.box(-8.3, 1.7, 2.2, 0.15, 3.4, 0.15, '#dddddd');
      b.box(-3.7, 1.7, 2.2, 0.15, 3.4, 0.15, '#dddddd');
      // cajero automático en la pared
      b.panelZ(-1.2, 1.35, 0.05, 1.0, 1.9, '#2b3038');
      b.panelZ(-1.2, 1.55, 0.07, 0.6, 0.4, '#58d8ff', [0.2, 0.7, 1.0, 0.6]);
      b.box(-1.2, 1.1, 0.2, 0.7, 0.08, 0.3, '#3c434d');
      ctx.signs.define('atm', 1.2, 0.4, (g, W, Hh) => {
        g.fillStyle = '#1f9e5a';
        g.fillRect(0, 0, W, Hh);
        fitText(g, 'CAJERO', W / 2, Hh / 2, W * 0.86, Hh * 0.7, FONT, '900', '#ffffff');
      });
      ctx.signs.place(b, 'atm', -1.2, 2.55, 0.08, 1.0, 0.33, 0.8);
      // escaparate
      glass(w, -15.5, 2.1, 0.05, 9, 2.8, [1, 0.85, 0.55, 0.1], lin('#35526b').clone(), lin('#8fb6d4').clone());
      for (let x = -19.5; x <= -11.5; x += 2.25) b.panelZ(x, 2.1, 0.07, 0.1, 2.8, NAVY);
      // planta de arriba: ventanas a los lados del cartel
      for (const x of [-18.5, -14.5, 14.5, 18.5]) glass(w, x, 6.8, 0.05, 3, 2.0, [1, 0.85, 0.55, 0.2]);
      ctx.signs.define('office-main', 20, 3.2, officeSign());
      ctx.signs.place(b, 'office-main', 0, 6.9, 0.14, 20, 3.2, 0.8);
      // bombillas alrededor del cartel
      for (let i = 0; i <= 20; i++) {
        const x = -10.2 + i * 1.02;
        b.box(x, 8.65, 0.14, 0.18, 0.18, 0.12, '#fff3c4', SKIP.NZ, [1, 0.8, 0.4, 2 + (i % 2) * 0.5]);
        b.box(x, 5.15, 0.14, 0.18, 0.18, 0.12, '#fff3c4', SKIP.NZ, [1, 0.8, 0.4, 2 + ((i + 1) % 2) * 0.5]);
      }
    } else if (k === 2) {
      // muelle de carga trasero
      for (const x of [-12, 0, 12]) rollerDoor(b, x, 5, 4, '#b8bec5');
      b.box(0, 0.6, 1.5, half * 2 - 4, 1.2, 3, '#9a9a9a');
      const dp = lotPoint(lot, 0, -hd - 1.5);
      ctx.box(dp.x, lot.h + 0.6, dp.z, half - 2, 0.6, 1.5, lot.rot);
      for (let x = -18; x <= 18; x += 3) glass(w, x, 6.8, 0.05, 2.2, 1.6, [1, 0.85, 0.55, 0.3 + (x % 2) * 0.2]);
    } else {
      for (let x = -half + 2.5; x < half - 1; x += 3.5) {
        glass(w, x, 2.4, 0.05, 2.2, 1.6, [1, 0.85, 0.55, 0.25]);
        glass(w, x, 6.8, 0.05, 2.2, 1.6, [1, 0.85, 0.55, 0.3]);
      }
      // mural lateral
      const key = k === 1 ? 'office-mural-a' : 'office-mural-b';
      ctx.signs.define(key, 10, 3, (g, W, Hh) => {
        g.fillStyle = NAVY;
        roundRect(g, 0, 0, W, Hh, Hh * 0.1);
        g.fill();
        fitText(g, k === 1 ? '¿NO ESTABA? SE LO DEJAMOS AL VECINO' : 'SI NO PAGAS, NO HAY PAQUETE', W / 2, Hh * 0.42, W * 0.92, Hh * 0.36, FONT_IMPACT, '400', YELLOW);
        fitText(g, 'Contra Reembolso · Puerto Paquete', W / 2, Hh * 0.78, W * 0.8, Hh * 0.16, FONT, '800', '#fff');
      });
      ctx.signs.place(b, key, 0, 4.6, 0.12, 9, 2.7, 0.5);
    }
  }
  // mástil con bandera
  const fp = lotPoint(lot, -hw - 1.5, hd + 1.2);
  b.frame(fp.x, lot.h, fp.z, 0);
  b.cyl(0, 0, 0, 0.12, 0.08, 11, 6, '#e8e8e8', true);
  flag(ctx, out, fp.x, lot.h + 10.8, fp.z, 3.2, 2, 'flag-office', (g, W, Hh) => {
    g.fillStyle = YELLOW;
    g.fillRect(0, 0, W, Hh);
    g.fillStyle = NAVY;
    g.fillRect(0, Hh * 0.7, W, Hh * 0.3);
    fitText(g, 'CR', W * 0.5, Hh * 0.38, W * 0.6, Hh * 0.5, FONT_IMPACT, '400', NAVY);
  });
  ctx.cyl(fp.x, lot.h + 2, fp.z, 2, 0.15);
  // paquetes apilados junto al garaje
  for (let i = 0; i < 3; i++) {
    const pp = lotPoint(lot, 19 - i * 1.4, hd + 1.0);
    ctx.props.add('crateStack', pp.x, lot.h, pp.z, lot.rot + i, 1);
  }

  // explanada: asfalto, acera del porche y plazas de furgoneta
  const zf = lot.z - hd; // fachada (mira al norte)
  const pave = ctx.pave;
  pave.rect(pave.asphalt, lot.x, (173 + zf - 3.5) / 2, hw + 2, (zf - 3.5 - 173) / 2, 0, '#585d69');
  pave.rect(pave.walk, lot.x, zf - 1.75, hw + 2, 1.75, 0, '#e2d7c3');
  const bays = 8, bw = 5;
  for (let i = 0; i <= bays; i++) {
    const x = lot.x - (bays * bw) / 2 + i * bw;
    pave.rect(pave.paint, x, zf - 3.5 - 3.5, 0.08, 3.4, 0, YELLOW);
  }
  pave.rect(pave.paint, lot.x, zf - 3.5 - 7, (bays * bw) / 2, 0.08, 0, YELLOW);
  const vanBays: THREE.Vector3[] = [];
  for (let i = 0; i < bays; i++) {
    const x = lot.x - (bays * bw) / 2 + bw * (i + 0.5);
    const p = ground(ctx, x, zf - 3.5 - 3.5);
    vanBays.push(p);
    out.parking.push({ pos: p, heading: Math.PI, district: 'puerto' });
  }
  out.extra.officeVanBays = vanBays;
  ctx.paved.push({ x: lot.x, z: (173 + zf) / 2, hw: hw + 2, hd: (zf - 173) / 2, rot: 0, color: '#6a6f7a' });

  // POIs
  const door = makePoi(ctx, 'office', 'office', 'Oficina de Reparto Contra Reembolso', lot, -6, false, 1.6);
  door.parking = ground(ctx, lot.x, zf - 3.5 - 12);
  out.pois.push(door);
  const atm = makePoi(ctx, 'atm-oficina', 'atm', 'Cajero de la oficina', lot, -1.2, false, 1.2);
  atm.parking = door.parking.clone();
  out.pois.push(atm);
  const sp = doorPoint(ctx, lot, -2.5, 2.2);
  out.spawn = { pos: sp, heading: lot.rot };
  ctx.foot.push({ x: lot.x, z: lot.z, hw, hd, rot: lot.rot, color: YELLOW, height: H });
}

// ───────────────────────── Bandera animada ─────────────────────────

function flag(ctx: Ctx, out: Out, x: number, y: number, z: number, w: number, h: number, key: string, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = Math.round((128 * h) / w);
  const g = c.getContext('2d')!;
  draw(g, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(w, h, 8, 1);
  geo.translate(w / 2, -h / 2, 0);
  const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  const uTime = ctx.u.uTime;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nfloat k = position.x / ' + w.toFixed(2) + ';\ntransformed.z += sin(position.x * 2.2 - uTime * 6.0) * 0.28 * k;\ntransformed.y += sin(position.x * 1.3 - uTime * 4.0) * 0.08 * k;',
      );
  };
  mat.customProgramCacheKey = () => 'cr-flag';
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = Math.PI / 2;
  m.name = key;
  m.castShadow = true;
  ctx.game.scene.add(m);
  // se orienta despacio con el viento
  const base = m.rotation.y;
  out.animated.push((_dt, t) => {
    m.rotation.y = base + Math.sin(t * 0.13) * 0.4;
  });
}

// ───────────────────────── Lonja (azotea accesible) ─────────────────────────

function buildLonja(ctx: Ctx, out: Out, lot: Lot) {
  const b = ctx.solid.at(lot.x, lot.z);
  const w = ctx.win.at(lot.x, lot.z);
  const hw = lot.hw, hd = lot.hd;
  const H = 6.2;
  const y0 = baseDepth(ctx, lot);
  const white = '#f4f1ea', blue = '#2f6fb0';
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  b.box(0, (y0 + H) / 2, 0, hw * 2, H - y0, hd * 2, white, SKIP.NY | SKIP.PY);
  b.quadL(-hw, H, hd, hw, H, hd, hw, H, -hd, -hw, H, -hd, '#d4c9b4');
  ctx.box(lot.x, lot.h + (y0 + H) / 2, lot.z, hw, (H - y0) / 2, hd, lot.rot);
  for (let k = 0; k < 4; k++) {
    const { half } = facadeFrame(b, lot, k);
    facadeFrame(w, lot, k);
    b.panelZ(0, (y0 + 0.8) / 2, 0.03, half * 2 + 0.02, 0.8 - y0, blue);
    b.box(0, H - 0.25, 0.08, half * 2 + 0.1, 0.5, 0.16, blue, SKIP.NZ);
    const n = Math.floor((half * 2) / 5);
    for (let i = 0; i < n; i++) {
      const x = -half + (half * 2 * (i + 0.5)) / n;
      if (k === 0 && i % 2 === 0) {
        rollerDoor(b, x, 3.2, 3.2, '#5b86b8');
      } else {
        glass(w, x, 3.4, 0.05, 2.4, 2.2, [1, 0.85, 0.55, 0.3]);
        b.panelZ(x, 4.7, 0.06, 2.6, 0.3, blue);
      }
    }
    if (k === 0) {
      ctx.signs.define('lonja', 10, 1.6, (g, W, Hh) => {
        g.fillStyle = '#ffffff';
        roundRect(g, 0, 0, W, Hh, Hh * 0.2);
        g.fill();
        g.fillStyle = blue;
        roundRect(g, Hh * 0.08, Hh * 0.08, W - Hh * 0.16, Hh - Hh * 0.16, Hh * 0.15);
        g.fill();
        fitText(g, 'LONJA DE PESCADO', W / 2, Hh * 0.4, W * 0.9, Hh * 0.45, FONT_IMPACT, '400', '#ffffff');
        fitText(g, 'Subasta a grito pelado · desde las 5 de la mañana', W / 2, Hh * 0.76, W * 0.86, Hh * 0.17, FONT, '800', '#ffe7a0');
      });
      ctx.signs.place(b, 'lonja', 0, H + 0.1, 0.2, 11, 1.76, 0.2);
    }
  }
  // peto con hueco para la escalera (lado este: x local -hw)
  b.frame(lot.x, lot.h, lot.z, lot.rot);
  const ph = 1.0, t = 0.25;
  const P: [number, number, number, number][] = [
    [0, hd - t / 2, hw * 2, t],
    [0, -hd + t / 2, hw * 2, t],
    [hw - t / 2, 0, t, hd * 2 - 2 * t],
  ];
  // lado con hueco: de z local -hd a hd, hueco entre gz0 y gz1
  // la escalera sube pegada a la pared este (mundo), de norte a sur; llega arriba en z mundo ~ 199
  const gz0 = lot.z - 200.8, gz1 = lot.z - 197.2; // local z = (lot.z - zMundo) porque rot = PI
  P.push([-hw + t / 2, (-hd + t + gz0) / 2, t, gz0 - (-hd + t)]);
  P.push([-hw + t / 2, (gz1 + hd - t) / 2, t, hd - t - gz1]);
  for (const [x, z, sx, sz] of P) {
    b.box(x, H + ph / 2, z, sx, ph, sz, white, SKIP.NY);
    const wp = lotPoint(lot, x, z);
    ctx.box(wp.x, lot.h + H + ph / 2, wp.z, sx / 2, ph / 2, sz / 2, lot.rot);
  }
  // escalera exterior (pegada a la fachada este)
  const sx = lot.x + hw + 0.68;
  const st = stairs(ctx, b, sx, lot.h, 188.6, 0, H, 1.3, '#e6dfd2', '#2f6fb0');
  ctx.climbs.push({ name: 'lonja', a: new THREE.Vector3(sx, lot.h, 187.8), b: new THREE.Vector3(sx, lot.h + H, st.topZ + 0.8), c: new THREE.Vector3(lot.x, lot.h + H, lot.z) });
  // rellano arriba
  b.frame(0, 0, 0, 0);
  b.box(sx, lot.h + H - 0.1, st.topZ + 0.8, 1.3, 0.2, 1.6, '#e6dfd2');
  ctx.box(sx, lot.h + H - 0.1, st.topZ + 0.8, 0.65, 0.1, 0.8);
  // cosas en la azotea: cajas de pescado, redes, y un paquete perdido
  const b2 = ctx.solid.at(lot.x, lot.z);
  b2.frame(lot.x, lot.h + H, lot.z, lot.rot);
  b2.box(6, 0.3, 3, 2, 0.6, 1.2, '#3a7fc0');
  b2.box(6, 0.75, 3, 1.8, 0.3, 1.1, '#56a0e0');
  b2.box(-5, 0.12, -3, 4, 0.24, 3, '#6b8f5a');
  collectible(ctx, lot.x, lot.h + H, lot.z);
  out.extra.lonjaRoof = new THREE.Vector3(lot.x, lot.h + H, lot.z);
  out.delivery.push({ id: 'lonja', district: 'puerto', door: doorPoint(ctx, lot, 5, 1.4), facing: lot.rot, label: 'Lonja de Pescado, puesto 3' });
  ctx.foot.push({ x: lot.x, z: lot.z, hw, hd, rot: lot.rot, color: '#f4f1ea', height: H });
}

// ───────────────────────── Muelle de pescadores y barcas ─────────────────────────

function boatGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const L = 7, Wd = 2.4;
  const hull = '#ffffff';
  // casco: prisma con proa en punta (+z)
  const pts = [[-Wd / 2, -L / 2], [Wd / 2, -L / 2], [Wd / 2, L / 2 - 2], [0, L / 2], [-Wd / 2, L / 2 - 2]];
  const yb = -0.5, yt = 0.7;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], c = pts[(i + 1) % pts.length];
    b.quadW(a[0], yb, a[1], c[0], yb, c[1], c[0], yt, c[1], a[0], yt, a[1], hull);
    b.quadW(a[0] * 0.98, yt - 0.25, a[1] * 0.99, c[0] * 0.98, yt - 0.25, c[1] * 0.99, c[0] * 0.98, yt, c[1] * 0.99, a[0] * 0.98, yt, a[1] * 0.99, '#e8e8e8');
  }
  // cubierta
  b.triW(-Wd / 2, yt - 0.1, -L / 2, -Wd / 2, yt - 0.1, L / 2 - 2, Wd / 2, yt - 0.1, -L / 2, '#b58a5a');
  b.triW(Wd / 2, yt - 0.1, -L / 2, -Wd / 2, yt - 0.1, L / 2 - 2, Wd / 2, yt - 0.1, L / 2 - 2, '#b58a5a');
  b.triW(-Wd / 2, yt - 0.1, L / 2 - 2, 0, yt - 0.1, L / 2, Wd / 2, yt - 0.1, L / 2 - 2, '#b58a5a');
  // cabina, mástil y farol
  b.box(0, yt + 0.6, -0.8, 1.6, 1.2, 1.8, '#f4f1ea');
  b.box(0, yt + 1.25, -0.8, 1.8, 0.1, 2.0, '#2f6fb0');
  b.box(0, yt + 1.9, 0.6, 0.08, 2.4, 0.08, '#6b4a2a');
  return b.toGeometry();
}

function buildPier(ctx: Ctx, out: Out) {
  const x0 = -127, x1 = -123, zs = QUAY_Z, ze = 302, y = 2.1;
  const b = ctx.solid.at(-125, 280);
  b.frame(0, 0, 0, 0);
  for (let z = zs; z < ze; z += 0.6) {
    b.box(-125, y - 0.1, z + 0.3, x1 - x0, 0.2, 0.55, (Math.floor(z / 0.6) % 2) ? '#a9784a' : '#b98a58', SKIP.NY);
  }
  for (let z = zs + 3; z <= ze; z += 5) {
    for (const x of [x0 - 0.15, x1 + 0.15]) b.cyl(x, -4, z, 0.22, 0.22, y + 0.6 + 4, 6, '#6b4a2a', true);
  }
  ctx.box(-125, y - 0.2, (zs + ze) / 2, 2, 0.2, (ze - zs) / 2);
  ctx.paved.push({ x: -125, z: (zs + ze) / 2, hw: 2, hd: (ze - zs) / 2, rot: 0, color: '#b98a58' });
  collectible(ctx, -125, y, ze - 1.5);
  out.delivery.push({ id: 'muelle-pescadores', district: 'puerto', door: new THREE.Vector3(-125, y, 290), facing: Math.PI / 2, label: 'Muelle de Pescadores, barca La Sardinita' });
  // barcas que se mecen
  const boats: { x: number; z: number; r: number; c: string }[] = [
    { x: -131.5, z: 272, r: 0.05, c: '#2f7fcf' },
    { x: -131.8, z: 284, r: -0.04, c: '#e8394d' },
    { x: -118.5, z: 277, r: Math.PI + 0.03, c: '#3f9a5a' },
    { x: -118.3, z: 292, r: Math.PI - 0.05, c: '#f2a93b' },
    { x: -100, z: 266.5, r: Math.PI / 2 + 0.05, c: '#7c4dbb' },
    { x: -145, z: 266.8, r: -Math.PI / 2, c: '#1f9e9a' },
  ];
  const geo = boatGeo();
  const im = new THREE.InstancedMesh(geo, ctx.mat, boats.length);
  im.name = 'barcas';
  im.castShadow = true;
  im.receiveShadow = true;
  boats.forEach((bt, i) => im.setColorAt(i, lin(bt.c).clone().lerp(new THREE.Color(1, 1, 1), 0.15)));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const place = (t: number) => {
    boats.forEach((bt, i) => {
      e.set(Math.sin(t * 1.1 + i) * 0.05, bt.r, Math.cos(t * 0.9 + i * 2) * 0.07);
      q.setFromEuler(e);
      p.set(bt.x, Math.sin(t * 1.3 + i * 1.7) * 0.12, bt.z);
      im.setMatrixAt(i, m.compose(p, q, one));
    });
    im.instanceMatrix.needsUpdate = true;
  };
  place(0);
  im.computeBoundingSphere();
  ctx.game.scene.add(im);
  let fr = 0;
  out.animated.push((_dt, t) => {
    if (fr++ % 2 === 0) place(t);
  });
}

// ───────────────────────── Monumento al Repartidor Desconocido ─────────────────────────

function buildMonument(ctx: Ctx) {
  const x = 0, z = 212;
  const y = ctx.heightAt(x, z);
  ctx.pave.disc(ctx.pave.walk, x, z, 12, '#e4d8c2', 24);
  ctx.pave.disc(ctx.pave.paint, x, z, 4.6, '#cbbfa8', 16);
  const b = ctx.solid.at(x, z);
  b.frame(x, y, z, Math.PI);
  const stone = '#d8cfbf', bronze = '#b08d57', bronze2 = '#8c6d3f';
  b.cyl(0, 0, 0, 3.6, 3.6, 0.5, 12, stone, true);
  b.cyl(0, 0.5, 0, 2.6, 2.6, 0.5, 10, '#cbbfa8', true);
  b.box(0, 2.0, 0, 1.8, 2.5, 1.8, stone);
  // estatua: repartidor levantando un paquete
  const s = 1.25;
  const Y = 3.25;
  b.box(-0.22 * s, Y + 0.45 * s, 0, 0.26 * s, 0.9 * s, 0.3 * s, bronze2);
  b.box(0.22 * s, Y + 0.45 * s, 0.1 * s, 0.26 * s, 0.9 * s, 0.3 * s, bronze2);
  b.box(0, Y + 1.25 * s, 0, 0.8 * s, 0.8 * s, 0.45 * s, bronze);
  b.box(0, Y + 1.9 * s, 0, 0.42 * s, 0.45 * s, 0.42 * s, bronze);
  b.box(0, Y + 2.18 * s, 0.05 * s, 0.46 * s, 0.14 * s, 0.46 * s, bronze2);
  b.box(0, Y + 2.14 * s, 0.32 * s, 0.4 * s, 0.05 * s, 0.25 * s, bronze2);
  b.boxRot(-0.5 * s, Y + 1.85 * s, 0, 0.22 * s, 0.85 * s, 0.22 * s, 0, 0, 0.35, bronze);
  b.boxRot(0.5 * s, Y + 1.85 * s, 0, 0.22 * s, 0.85 * s, 0.22 * s, 0, 0, -0.35, bronze);
  b.box(0, Y + 2.75 * s, 0, 1.1 * s, 0.75 * s, 0.8 * s, bronze);
  b.box(0, Y + 3.13 * s, 0, 0.25 * s, 0.02, 0.82 * s, bronze2);
  ctx.signs.define('monumento', 3, 1, (g, W, H) => {
    g.fillStyle = '#6b5530';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#e8c25a';
    g.lineWidth = H * 0.05;
    g.strokeRect(H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12);
    fitText(g, 'AL REPARTIDOR DESCONOCIDO', W / 2, H * 0.38, W * 0.88, H * 0.3, FONT_SERIF, '700', '#f3e2b8');
    fitText(g, 'Que siempre llamó dos veces y nadie abrió', W / 2, H * 0.72, W * 0.86, H * 0.16, FONT_SERIF, 'italic 600', '#f3e2b8');
  });
  ctx.signs.place(b, 'monumento', 0, 2.0, 0.92, 1.6, 0.53, 0);
  ctx.cyl(x, y + 0.5, z, 0.5, 3.6);
  ctx.box(x, y + 2.5, z, 0.9, 2.5, 0.9);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    ctx.props.add('palm', x + Math.cos(a) * 9, y, z + Math.sin(a) * 9, a * 3, 1.1);
    ctx.props.add('bench', x + Math.cos(a + 0.4) * 7, y, z + Math.sin(a + 0.4) * 7, -(a + 0.4) + Math.PI / 2 + Math.PI, 1);
  }
  ctx.foot.push({ x, z, hw: 3.6, hd: 3.6, rot: 0, color: '#d8cfbf', height: 3 });
}

// ───────────────────────── Contenedores ─────────────────────────

function containerGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const L = 12.2, Hc = 2.6, Wc = 2.44;
  b.box(0, Hc / 2, 0, L, Hc, Wc, '#ffffff');
  const rib = '#d0d0d0';
  for (let x = -L / 2 + 0.5; x < L / 2 - 0.3; x += 0.9) {
    b.quadW(x - 0.12, 0.1, Wc / 2 + 0.03, x + 0.12, 0.1, Wc / 2 + 0.03, x + 0.12, Hc - 0.1, Wc / 2 + 0.03, x - 0.12, Hc - 0.1, Wc / 2 + 0.03, rib);
    b.quadW(x + 0.12, 0.1, -Wc / 2 - 0.03, x - 0.12, 0.1, -Wc / 2 - 0.03, x - 0.12, Hc - 0.1, -Wc / 2 - 0.03, x + 0.12, Hc - 0.1, -Wc / 2 - 0.03, rib);
  }
  // puertas
  b.quadW(L / 2 + 0.03, 0.1, Wc / 2 - 0.1, L / 2 + 0.03, 0.1, -Wc / 2 + 0.1, L / 2 + 0.03, Hc - 0.1, -Wc / 2 + 0.1, L / 2 + 0.03, Hc - 0.1, Wc / 2 - 0.1, '#bdbdbd');
  b.quadW(L / 2 + 0.04, 0.2, 0.04, L / 2 + 0.04, 0.2, -0.04, L / 2 + 0.04, Hc - 0.2, -0.04, L / 2 + 0.04, Hc - 0.2, 0.04, '#7a7a7a');
  return b.toGeometry();
}

const CONT_COLORS = ['#d6452f', '#2f6fb0', '#e8a01b', '#3f8f5a', '#8a4fb0', '#1f9e9a', '#c9c2b0', '#e8394d', '#5a6f8a', '#f07c2a'];

function buildContainers(ctx: Ctx, out: Out) {
  const rng = ctx.rng;
  const list: { x: number; y: number; z: number; r: number; c: string }[] = [];
  const blocks: [number, number, number][] = [
    [56.4, 3, 186], [110.4, 3, 186], [162.4, 2, 186],
  ];
  for (const [x0, cols, z0] of blocks) {
    for (let r = 0; r < 17; r++) {
      const z = z0 + r * 3.0;
      for (let c = 0; c < cols; c++) {
        const x = x0 + c * 13;
        const center = 1 - Math.abs(r - 8) / 9;
        let h = Math.floor(rng.range(0, 3.2) + center * 1.4);
        if (rng.chance(0.12)) h = 0;
        h = Math.min(4, h);
        if (h <= 0) continue;
        for (let k = 0; k < h; k++) list.push({ x, y: QUAY_H + k * 2.6, z, r: 0, c: rng.pick(CONT_COLORS) });
        ctx.box(x, QUAY_H + (h * 2.6) / 2, z, 6.1, (h * 2.6) / 2, 1.22);
        ctx.foot.push({ x, z, hw: 6.1, hd: 1.22, rot: 0, color: CONT_COLORS[(r + c) % CONT_COLORS.length], height: h * 2.6 });
      }
    }
  }
  // contenedores sobre el carguero
  for (let x = 80; x <= 140; x += 13) {
    for (let zz = 271; zz <= 285; zz += 2.8) {
      const h = rng.int(1, 3);
      for (let k = 0; k < h; k++) list.push({ x, y: 6.5 + k * 2.6, z: zz, r: 0, c: rng.pick(CONT_COLORS) });
      ctx.box(x, 6.5 + (h * 2.6) / 2, zz, 6.1, (h * 2.6) / 2, 1.22);
    }
  }
  const im = new THREE.InstancedMesh(containerGeo(), ctx.mat, list.length);
  im.name = 'contenedores';
  im.castShadow = true;
  im.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  list.forEach((it, i) => {
    im.setMatrixAt(i, m.compose(p.set(it.x, it.y, it.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.r), one));
    im.setColorAt(i, lin(it.c).clone());
  });
  im.computeBoundingSphere();
  ctx.game.scene.add(im);
  // pasillo del medio: coleccionable escondido entre contenedores
  collectible(ctx, 101, QUAY_H, 226);
  void out;
}

// ───────────────────────── Grúas portuarias ─────────────────────────

function craneTopGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const white = '#f4f1ea', blue = '#2f6fb0', yel = '#f2b233';
  b.cyl(0, 0, 0, 2.2, 2.2, 0.8, 10, '#5a5f66', true);
  b.box(0, 3.2, -1.2, 7, 5, 6.5, white);
  b.box(0, 1.2, -1.2, 7.04, 0.9, 6.54, blue);
  b.box(0, 5.8, -1.2, 7.2, 0.3, 6.7, '#9aa0a8');
  b.box(0, 3.4, 3.2, 2.6, 2.6, 2.6, white);
  b.box(0, 3.6, 4.52, 2.2, 1.3, 0.02, '#3b6d94', 0, [0.9, 0.8, 0.5, 0.0]);
  b.box(0, 2.2, -5.4, 5, 3.2, 2.6, '#6b7078');
  // castillete
  b.boxRot(-1.2, 8.5, -1.5, 0.35, 6, 0.35, 0.25, 0, 0.12, yel);
  b.boxRot(1.2, 8.5, -1.5, 0.35, 6, 0.35, 0.25, 0, -0.12, yel);
  // pluma inclinada
  const ang = 0.33, L = 30;
  const cy = 3 + Math.sin(ang) * L / 2, cz = 3.5 + Math.cos(ang) * L / 2;
  b.boxRot(-0.55, cy, cz, 0.3, 0.3, L, -ang, 0, 0, yel);
  b.boxRot(0.55, cy, cz, 0.3, 0.3, L, -ang, 0, 0, yel);
  b.boxRot(0, cy + 0.9, cz, 0.3, 0.3, L, -ang, 0, 0, yel);
  for (let i = 1; i < 10; i++) {
    const t = i / 10;
    const yy = 3 + Math.sin(ang) * L * t, zz = 3.5 + Math.cos(ang) * L * t;
    b.box(0, yy + 0.45, zz, 1.3, 0.12, 0.12, yel);
    b.boxRot(0, yy + 0.45, zz + 0.9, 0.12, 1.1, 0.12, 0.6, 0, 0, yel);
  }
  // cable y gancho
  const tipY = 3 + Math.sin(ang) * L, tipZ = 3.5 + Math.cos(ang) * L;
  b.box(0, tipY - 9, tipZ, 0.06, 18, 0.06, '#333');
  b.box(0, tipY - 18.4, tipZ, 0.8, 0.9, 0.5, '#e8394d');
  // tirantes
  b.boxRot(0, (11 + tipY) / 2 + 0.3, (-1.5 + tipZ) / 2, 0.08, 0.08, Math.hypot(tipZ + 1.5, tipY - 11), -Math.atan2(tipY - 11, tipZ + 1.5), 0, 0, '#555');
  return b.toGeometry();
}

function buildCranes(ctx: Ctx, out: Out) {
  const xs = [70, 118, 163];
  const zc = 254;
  const top = craneTopGeo();
  const b = ctx.solid.at(115, 254);
  b.frame(0, 0, 0, 0);
  // raíles
  for (const z of [zc - 4.2, zc + 4.2]) {
    ctx.pave.rect(ctx.pave.paint, 112, z, 75, 0.25, 0, '#5a5f66');
  }
  xs.forEach((x, i) => {
    const y = QUAY_H;
    const legH = 15;
    const yel = '#f2b233';
    for (const sx of [-5, 5]) {
      for (const sz of [-4.2, 4.2]) {
        b.box(x + sx, y + legH / 2, zc + sz, 0.9, legH, 0.9, yel);
        b.box(x + sx, y + 0.5, zc + sz, 1.6, 1.0, 2.4, '#4a4f56');
        ctx.box(x + sx, y + legH / 2, zc + sz, 0.5, legH / 2, 0.5);
      }
      b.box(x + sx, y + legH - 0.6, zc, 1.0, 1.2, 9.4, yel);
      b.boxRot(x + sx, y + legH / 2, zc, 0.3, 0.3, 11, 0.95, 0, 0, yel);
    }
    for (const sz of [-4.2, 4.2]) b.box(x, y + legH - 0.6, zc + sz, 11, 1.2, 1.0, yel);
    b.box(x, y + legH + 0.3, zc, 11, 0.6, 9.4, '#8a9098');
    const m = new THREE.Mesh(top, ctx.mat);
    m.name = 'grua-' + i;
    m.position.set(x, y + legH + 0.6, zc);
    const base = i === 1 ? Math.PI : i === 0 ? 0.4 : -0.3;
    m.rotation.y = base;
    m.castShadow = true;
    m.receiveShadow = true;
    ctx.game.scene.add(m);
    out.animated.push((_dt, t) => {
      m.rotation.y = base + Math.sin(t * 0.06 + i * 2.1) * 1.4;
    });
    ctx.foot.push({ x, z: zc, hw: 5.5, hd: 4.7, rot: 0, color: '#f2b233', height: 16, open: true });
  });
}

// ───────────────────────── Carguero ─────────────────────────

function buildShip(ctx: Ctx, out: Out) {
  const b = ctx.solid.at(115, 278);
  b.frame(0, 0, 0, 0);
  const x0 = 62, x1 = 168, zA = 267, zB = 289, zc = (zA + zB) / 2;
  const yb = -5, yd = 6.5;
  const hull = '#1f3f6f', red = '#b3342b';
  const pts = [[x0, zA], [x1 - 18, zA], [x1, zc], [x1 - 18, zB], [x0, zB]];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], c = pts[(i + 1) % pts.length];
    // exterior: los puntos van en sentido horario visto desde arriba -> caras hacia fuera
    b.quadW(c[0], yb, c[1], a[0], yb, a[1], a[0], 0.8, a[1], c[0], 0.8, c[1], red);
    b.quadW(c[0], 0.8, c[1], a[0], 0.8, a[1], a[0], yd - 0.5, a[1], c[0], yd - 0.5, c[1], hull);
    b.quadW(c[0], yd - 0.5, c[1], a[0], yd - 0.5, a[1], a[0], yd + 0.6, a[1], c[0], yd + 0.6, c[1], '#f4f1ea');
  }
  // cubierta
  const deck = '#6f7f6a';
  b.quadW(x0, yd, zB, x1 - 18, yd, zB, x1 - 18, yd, zA, x0, yd, zA, deck);
  b.triW(x1 - 18, yd, zB, x1, yd, zc, x1 - 18, yd, zA, deck);
  // puente de mando a popa
  b.box(70, yd + 6, zc, 12, 12, 16, '#f4f1ea');
  b.box(70, yd + 12.3, zc, 13, 0.6, 22, '#f4f1ea');
  b.box(70, yd + 12.8, zc, 12, 0.4, 16, '#c9c2b0');
  const w = ctx.win.at(70, zc);
  w.frame(76.05, yd, zc, Math.PI / 2);
  for (let f = 0; f < 3; f++) for (let i = -3; i <= 3; i++) glass(w, i * 2.1, 2 + f * 3.3, 0, 1.3, 1.1, [1, 0.85, 0.55, 0.2 + ((i + f) % 3) * 0.3]);
  glass(w, 0, 11.2, 0, 12, 1.4, [1, 0.9, 0.7, 0.1]);
  b.frame(0, 0, 0, 0);
  // chimenea
  b.box(64.5, yd + 15.5, zc, 4, 6, 4.5, '#e8394d');
  b.box(64.5, yd + 18.7, zc, 4.1, 0.6, 4.6, '#1b1b1b');
  // nombre en el casco
  ctx.signs.define('barco', 8, 1.2, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    fitText(g, 'BULTO VELOZ', W / 2, H * 0.42, W * 0.95, H * 0.62, FONT_IMPACT, '400', '#ffffff');
    fitText(g, 'PUERTO PAQUETE', W / 2, H * 0.86, W * 0.6, H * 0.2, FONT, '800', '#ffffff');
  });
  b.frame(150, 0, zA - 0.03, Math.PI);
  ctx.signs.place(b, 'barco', 0, 4.4, 0, 8, 1.2, 0);
  b.frame(150, 0, zB + 0.03, 0);
  ctx.signs.place(b, 'barco', 0, 4.4, 0, 8, 1.2, 0);
  // colisores: casco (se puede andar por la cubierta), puente
  ctx.box((x0 + x1 - 18) / 2, (yb + yd) / 2, zc, (x1 - 18 - x0) / 2, (yd - yb) / 2, (zB - zA) / 2);
  ctx.box(x1 - 9, (yb + yd) / 2, zc, 9, (yd - yb) / 2, 5.5);
  ctx.box(70, yd + 6, zc, 6, 6, 8);
  // amarras
  b.frame(0, 0, 0, 0);
  for (const [sx, qx] of [[66, 58], [158, 166], [110, 118]]) {
    b.beam(sx, yd + 0.4, zA - 0.2, qx, QUAY_H + 0.55, QUAY_Z - 0.9, 0.07, '#d9c9a0');
  }
  // pasarela desde el muelle hasta la cubierta
  // la pasarela llega a la altura de la cubierta justo en el borde del casco
  gangway(ctx, 100, QUAY_H, QUAY_Z - 5.5, 100, yd + 0.02, zA + 0.05, 1.4);
  ctx.climbs.push({ name: 'carguero', a: new THREE.Vector3(100, QUAY_H, QUAY_Z - 6.5), b: new THREE.Vector3(100, yd, zA + 1.5), c: new THREE.Vector3(146, yd, zA + 1.4) });
  collectible(ctx, 158, yd, zc);
  out.delivery.push({ id: 'carguero', district: 'puerto', door: ground(ctx, 100, QUAY_Z - 5), facing: 0, label: 'Carguero Bulto Veloz (pasarela)' });
  ctx.foot.push({ x: (x0 + x1) / 2, z: zc, hw: (x1 - x0) / 2, hd: 11, rot: 0, color: '#1f3f6f', height: 6 });
}

/** Pasarela inclinada entre dos puntos (misma x). */
function gangway(ctx: Ctx, xa: number, ya: number, za: number, xb: number, yb: number, zb: number, width: number) {
  const b = ctx.solid.at(xa, za);
  const dz = zb - za, dy = yb - ya;
  const L = Math.hypot(dz, dy);
  const ang = Math.atan2(dy, dz);
  b.frame(0, 0, 0, 0);
  b.boxRot((xa + xb) / 2, (ya + yb) / 2 + 0.05, (za + zb) / 2, width, 0.1, L, -ang, 0, 0, '#9aa0a8');
  for (const s of [-1, 1]) {
    b.boxRot((xa + xb) / 2 + (s * width) / 2, (ya + yb) / 2 + 1.0, (za + zb) / 2, 0.05, 0.05, L, -ang, 0, 0, '#e8e8e8');
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      b.box(xa + (s * width) / 2, ya + dy * t + 0.5, za + dz * t, 0.04, 1.0, 0.04, '#e8e8e8');
    }
  }
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-ang, 0, 0, 'YXZ'));
  ctx.boxQ((xa + xb) / 2, (ya + yb) / 2 - 0.05, (za + zb) / 2 + 0.1 * Math.sin(ang), width / 2, 0.1, L / 2, q);
}

// ───────────────────────── Espigón y faro ─────────────────────────

function buildLighthouse(ctx: Ctx, out: Out) {
  const x = 196, zs = 246, ze = 314, y = 2.6;
  const b = ctx.solid.at(x, 290);
  b.frame(0, 0, 0, 0);
  b.box(x, y - 3.5, (zs + ze) / 2, 9, 7, ze - zs, '#b9b3a6', SKIP.NY);
  b.box(x, y + 0.45, (zs + ze) / 2, 0.8, 0.9, ze - zs - 12, '#cfc8ba');
  ctx.box(x, y - 3.5, (zs + ze) / 2, 4.5, 3.5, (ze - zs) / 2);
  ctx.box(x, y + 0.45, (zs + ze) / 2, 0.4, 0.45, (ze - zs - 12) / 2);
  ctx.paved.push({ x, z: (zs + ze) / 2, hw: 4.5, hd: (ze - zs) / 2, rot: 0, color: '#b9b3a6' });
  const rng = ctx.rng;
  for (let z = zs + 6; z < ze + 3; z += 3.2) {
    for (const s of [-1, 1]) {
      b.blob(x + s * rng.range(5, 6.5), rng.range(-0.8, 0.8), z + rng.range(-1, 1), rng.range(1.4, 2.2), rng.range(1.2, 1.9), rng.range(1.4, 2.2), rng.pick(['#8e8a83', '#a39e94', '#7f7b75']), 0.2, z);
    }
  }
  // faro
  const lz = 306;
  b.cyl(x, y, lz, 5, 5, 1.0, 14, '#d8d2c6', true);
  const bands = 8, bh = 2.5;
  for (let i = 0; i < bands; i++) {
    const r0 = 2.4 - (0.7 * i) / bands, r1 = 2.4 - (0.7 * (i + 1)) / bands;
    b.cyl(x, y + 1 + i * bh, lz, r0, r1, bh, 12, i % 2 ? '#e8394d' : '#f7f4ec', false);
  }
  const ty = y + 1 + bands * bh;
  b.cyl(x, ty, lz, 2.5, 2.5, 0.35, 12, '#2d3138', true, true);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.box(x + Math.cos(a) * 2.4, ty + 0.85, lz + Math.sin(a) * 2.4, 0.07, 1.0, 0.07, '#2d3138');
  }
  b.cyl(x, ty + 1.3, lz, 2.45, 2.45, 0.06, 12, '#2d3138', false);
  b.cyl(x, ty + 0.35, lz, 1.3, 1.3, 2.2, 8, '#fff3c4', false, false, [1.6, 1.35, 0.7, 0.05]);
  b.cyl(x, ty + 2.55, lz, 1.6, 0.0, 1.4, 8, '#c0392b', false);
  b.box(x - 4.5, y + 1.6, lz + 0.5, 4, 3, 5, '#f7f4ec');
  b.roof(x - 4.5, y + 3.1, lz + 0.5, 4.4, 5.4, 1.2, '#c65f36', '#f7f4ec', true);
  ctx.cyl(x, ty / 2 + 1, lz, ty / 2, 2.4);
  ctx.cyl(x, y + 0.5, lz, 0.5, 5);
  ctx.box(x - 4.5, y + 1.6, lz + 0.5, 2, 1.5, 2.5);
  ctx.foot.push({ x, z: lz, hw: 2.4, hd: 2.4, rot: 0, color: '#e8394d', height: 22 });
  // haz de luz giratorio (solo de noche)
  const beamGeo = new THREE.ConeGeometry(4, 60, 10, 1, true);
  beamGeo.translate(0, -30, 0);
  beamGeo.rotateZ(Math.PI / 2);
  const beamMat = makeBeamMaterial('#fff1b0');
  const beam = new THREE.Group();
  for (const r of [0, Math.PI]) {
    const m = new THREE.Mesh(beamGeo, beamMat);
    m.rotation.y = r;
    beam.add(m);
  }
  beam.position.set(x, ty + 1.4, lz);
  beam.name = 'haz-faro';
  beam.visible = false;
  ctx.game.scene.add(beam);
  out.nightMeshes.push(beam);
  (beam as any).nightMat = beamMat;
  out.animated.push((dt) => {
    if (beam.visible) beam.rotation.y += dt * 0.9;
  });
  collectible(ctx, x, y, ze - 2.5);
  out.extra.lighthouse = new THREE.Vector3(x, ty + 1.4, lz);
  void FONT_FUN;
}
