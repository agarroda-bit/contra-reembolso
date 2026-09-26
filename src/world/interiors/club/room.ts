// La sala del club: paredes, techo, cabina del DJ, barra, zona VIP con reservados y cordón dorado,
// tarimas, mesas altas, paquetería, photocall y letreros de neón. Todo fusionado en pocas mallas.
import * as THREE from 'three';
import type { RAPIER } from '../../../core/physics';
import { G } from '../../../core/physics';
import { GeoBuilder, vertexColorMaterial, shade } from '../../../core/geo';
import type { InteriorContext } from '../index';
import {
  ROOM, FLOOR, DJ, BAR, STOOLS, VIP, STAIRS, BOOTHS, MY_BOOTH, BOOTH, PODIUMS, PODIUM_R, PODIUM_H,
  HIGH_TABLES, BALL,
} from './layout';
import { neonCanvas, neonText, neonPath, SCRIPT_FONT, NEON_FONT } from './textures';

export const C = {
  floor: '#1a1224',
  wall: '#2b1843',
  panelA: '#37225a',
  panelB: '#2a1846',
  wains: '#1d1030',
  ceil: '#0e0a16',
  truss: '#4a4a5a',
  chrome: '#c3c7da',
  pink: '#ff2e88',
  cyan: '#19e6d2',
  purple: '#b44dff',
  gold: '#ffc43d',
  goldMetal: '#e3b341',
  velvet: '#9b1741',
  velvetDark: '#5e0c26',
  plum: '#3c1233',
  black: '#121018',
};

export interface RoomParts {
  /** Neones que laten con el bombo (se multiplica material.color). */
  pulseA: THREE.MeshBasicMaterial;
  /** Neones que laten a contratiempo. */
  pulseB: THREE.MeshBasicMaterial;
  /** Cordón del hueco de la escalera VIP (se abre al comprar la mesa). */
  gapRope: THREE.Group;
  gapCollider: RAPIER.Collider;
  /** Botellas de champán sobre tu mesa. */
  bottles: THREE.InstancedMesh;
  /** Letrero sobre tu reservado. */
  boothSign: ReturnType<typeof neonCanvas>;
  boothSignMat: THREE.MeshBasicMaterial;
  /** Letrero que parpadea (el de la barra). */
  flickerMat: THREE.MeshBasicMaterial;
  /** Conos de los altavoces (se empujan con el bombo). */
  speakerCones: THREE.Mesh;
  /** Puntas de las bengalas de las botellas (local). */
  bottleSlots: THREE.Vector3[];
  /** Posiciones de las botellas de las mesas de otros (para bengalas de ambiente). */
  dispose(): void;
}

const tmpQ = new THREE.Quaternion();

export function buildRoom(ctx: InteriorContext): RoomParts {
  const { root, game, origin } = ctx;
  const lit = new GeoBuilder();
  const shiny = new GeoBuilder(); // dorados y cromados (con brillo)
  const glow = new GeoBuilder(); // luces fijas (sin iluminar)
  const pulseA = new GeoBuilder();
  const pulseB = new GeoBuilder();
  const cones = new GeoBuilder();
  const H = ROOM.h;
  const W = ROOM.x1 - ROOM.x0;
  const D = ROOM.z1 - ROOM.z0;

  // ───────── Suelo, techo y paredes ─────────
  lit.box(W, 0.2, D, C.floor, 0, -0.1, 0);
  lit.box(W, 0.2, D, C.ceil, 0, H + 0.1, 0);
  lit.box(W + 0.6, H, 0.3, C.wall, 0, H / 2, ROOM.z0 - 0.15);
  lit.box(W + 0.6, H, 0.3, C.wall, 0, H / 2, ROOM.z1 + 0.15);
  lit.box(0.3, H, D, C.wall, ROOM.x0 - 0.15, H / 2, 0);
  lit.box(0.3, H, D, C.wall, ROOM.x1 + 0.15, H / 2, 0);
  ctx.addBox(0, -0.5, 0, W / 2 + 1, 0.5, D / 2 + 1);
  ctx.addBox(0, H + 0.5, 0, W / 2 + 1, 0.5, D / 2 + 1);
  ctx.addBox(0, H / 2, ROOM.z0 - 0.5, W / 2 + 1, H / 2 + 1, 0.5);
  ctx.addBox(0, H / 2, ROOM.z1 + 0.5, W / 2 + 1, H / 2 + 1, 0.5);
  ctx.addBox(ROOM.x0 - 0.5, H / 2, 0, 0.5, H / 2 + 1, D / 2 + 1);
  ctx.addBox(ROOM.x1 + 0.5, H / 2, 0, 0.5, H / 2 + 1, D / 2 + 1);

  // paneles acolchados, zócalo y barandilla cromada en las cuatro paredes
  // (verticals = distancias a lo largo de la pared donde va un tubo de neón vertical)
  const walls: { a: THREE.Vector3; dir: THREE.Vector3; n: THREE.Vector3; len: number; neon: string; verticals: number[] }[] = [
    { a: new THREE.Vector3(ROOM.x0, 0, ROOM.z0), dir: new THREE.Vector3(1, 0, 0), n: new THREE.Vector3(0, 0, 1), len: W, neon: C.pink, verticals: [2, 4.5, 7, 23, 25.5, 28] },
    { a: new THREE.Vector3(ROOM.x1, 0, ROOM.z1), dir: new THREE.Vector3(-1, 0, 0), n: new THREE.Vector3(0, 0, -1), len: W, neon: C.pink, verticals: [9, 11.5, 18.5, 21] },
    { a: new THREE.Vector3(ROOM.x0, 0, ROOM.z1), dir: new THREE.Vector3(0, 0, -1), n: new THREE.Vector3(1, 0, 0), len: D, neon: C.cyan, verticals: [3.6, 5.4] },
    { a: new THREE.Vector3(ROOM.x1, 0, ROOM.z0), dir: new THREE.Vector3(0, 0, 1), n: new THREE.Vector3(-1, 0, 0), len: D, neon: C.purple, verticals: [0.6, 5.2, 10, 15.2] },
  ];
  for (const w of walls) {
    const ry = Math.atan2(w.dir.x, w.dir.z) - Math.PI / 2;
    const at = (s: number, off: number, y: number) =>
      new THREE.Vector3().copy(w.a).addScaledVector(w.dir, s).addScaledVector(w.n, off).setY(y);
    // zócalo
    const mid = at(w.len / 2, 0.05, 0.55);
    lit.add(new THREE.BoxGeometry(w.len, 1.1, 0.1), C.wains, mid.x, mid.y, mid.z, 0, ry, 0);
    const rail = at(w.len / 2, 0.1, 1.14);
    shiny.add(new THREE.BoxGeometry(w.len, 0.06, 0.08), C.chrome, rail.x, rail.y, rail.z, 0, ry, 0);
    // paneles
    const n = Math.floor(w.len / 1.5);
    const pw = w.len / n;
    for (let i = 0; i < n; i++) {
      const p = at(pw * (i + 0.5), 0.04, 2.85);
      lit.add(new THREE.BoxGeometry(pw - 0.12, 3.1, 0.08), i % 2 ? C.panelA : C.panelB, p.x, p.y, p.z, 0, ry, 0);
    }
    w.verticals.forEach((d, i) => {
      const q = at(d, 0.1, 2.85);
      (i % 2 ? pulseB : pulseA).add(new THREE.BoxGeometry(0.06, 3.0, 0.06), w.neon, q.x, q.y, q.z, 0, ry, 0);
    });
    // tiras de neón horizontales
    const s1 = at(w.len / 2, 0.06, 4.62);
    pulseA.add(new THREE.BoxGeometry(w.len - 0.2, 0.07, 0.07), w.neon, s1.x, s1.y, s1.z, 0, ry, 0);
    const s2 = at(w.len / 2, 0.06, 7.4);
    pulseB.add(new THREE.BoxGeometry(w.len - 0.2, 0.05, 0.05), C.purple, s2.x, s2.y, s2.z, 0, ry, 0);
  }

  // ───────── Estructura de focos (truss) sobre la pista ─────────
  const tx0 = -7, tx1 = 7, tz0 = -8.5, tz1 = 3.5, ty = 6.9;
  const bar = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    lit.add(new THREE.BoxGeometry(len, 0.2, 0.2), C.truss, (x0 + x1) / 2, ty, (z0 + z1) / 2, 0, -Math.atan2(z1 - z0, x1 - x0), 0);
    lit.add(new THREE.BoxGeometry(len, 0.2, 0.2), C.truss, (x0 + x1) / 2, ty + 0.3, (z0 + z1) / 2, 0, -Math.atan2(z1 - z0, x1 - x0), 0);
  };
  bar(tx0, tz0, tx1, tz0);
  bar(tx0, tz1, tx1, tz1);
  bar(tx0, tz0, tx0, tz1);
  bar(tx1, tz0, tx1, tz1);
  bar(tx0, -2.5, tx1, -2.5);
  for (const [x, z] of [[tx0, tz0], [tx1, tz0], [tx0, tz1], [tx1, tz1]]) lit.cyl(0.04, 0.04, H - ty, 5, C.truss, x, (H + ty) / 2, z);
  // cabezas móviles (el haz lo pinta fx.ts)
  for (const [x, z] of BEAM_ORIGINS) {
    lit.box(0.32, 0.14, 0.32, '#26262e', x, ty - 0.17, z);
    lit.box(0.12, 0.3, 0.36, '#1d1d24', x, ty - 0.36, z);
  }
  // barra que sujeta la bola de espejos
  shiny.cyl(0.025, 0.025, H - BALL.y - 0.6, 5, C.chrome, BALL.x, (H + BALL.y + 0.6) / 2, BALL.z);

  // ───────── Pista de baile: marco cromado y tira de luz ─────────
  const fx0 = FLOOR.x0 - 0.12, fx1 = FLOOR.x1 + 0.12, fz0 = FLOOR.z0 - 0.12, fz1 = FLOOR.z1 + 0.12;
  shiny.box(fx1 - fx0 + 0.24, 0.1, 0.12, C.chrome, 0, 0.05, fz0);
  shiny.box(fx1 - fx0 + 0.24, 0.1, 0.12, C.chrome, 0, 0.05, fz1);
  shiny.box(0.12, 0.1, fz1 - fz0, C.chrome, fx0, 0.05, (fz0 + fz1) / 2);
  shiny.box(0.12, 0.1, fz1 - fz0, C.chrome, fx1, 0.05, (fz0 + fz1) / 2);
  pulseB.box(fx1 - fx0 + 0.5, 0.03, 0.06, C.cyan, 0, 0.02, fz1 + 0.14);
  pulseB.box(fx1 - fx0 + 0.5, 0.03, 0.06, C.cyan, 0, 0.02, fz0 - 0.14);
  pulseB.box(0.06, 0.03, fz1 - fz0 + 0.3, C.cyan, fx0 - 0.14, 0.02, (fz0 + fz1) / 2);
  pulseB.box(0.06, 0.03, fz1 - fz0 + 0.3, C.cyan, fx1 + 0.14, 0.02, (fz0 + fz1) / 2);

  // ───────── Cabina del DJ ─────────
  const djW = DJ.x1 - DJ.x0, djD = DJ.z1 - DJ.z0, djZ = (DJ.z0 + DJ.z1) / 2;
  lit.box(djW, DJ.h, djD, '#1b1426', 0, DJ.h / 2, djZ);
  ctx.addBox(0, DJ.h / 2, djZ, djW / 2, DJ.h / 2, djD / 2);
  pulseA.box(djW, 0.06, 0.05, C.pink, 0, DJ.h - 0.05, DJ.z1 + 0.02);
  pulseA.box(djW, 0.06, 0.05, C.pink, 0, 0.08, DJ.z1 + 0.02);
  // escalones laterales para subir a pinchar (por detrás de los altavoces no, por el lado)
  // mesa de mezclas
  const deskZ = -8.25;
  const dk = DJ.h - 0.15; // la mesa mide 90 cm: que se vea bien al DJ
  lit.box(4.6, 0.9, 0.85, '#231f31', 0, DJ.h + 0.45, deskZ);
  lit.box(4.8, 0.06, 1.0, '#0f0d16', 0, dk + 1.08, deskZ);
  // frontal con rayas de luz
  for (let i = 0; i < 4; i++) (i % 2 ? pulseB : pulseA).box(4.4, 0.05, 0.03, i % 2 ? C.cyan : C.purple, 0, DJ.h + 0.14 + i * 0.2, deskZ + 0.44);
  // platos, mezclador y portátil
  for (const s of [-1, 1]) {
    lit.box(0.75, 0.08, 0.6, '#2c2a36', s * 1.35, dk + 1.15, deskZ);
    lit.cyl(0.26, 0.26, 0.03, 16, '#0c0c10', s * 1.35, dk + 1.205, deskZ);
    glow.cyl(0.05, 0.05, 0.035, 8, C.cyan, s * 1.35, dk + 1.21, deskZ);
    shiny.box(0.03, 0.03, 0.3, C.chrome, s * 1.35 + 0.28, dk + 1.22, deskZ - 0.05, 0, s * 0.3, 0);
  }
  lit.box(0.8, 0.09, 0.55, '#2c2a36', 0, dk + 1.15, deskZ);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) glow.box(0.06, 0.03, 0.06, [C.pink, C.cyan, '#7cff4f', C.gold][i], -0.24 + i * 0.16, dk + 1.21, deskZ - 0.15 + j * 0.15);
  // portátil: la pantalla mira al DJ y por detrás lleva una cajita rosa
  lit.box(0.5, 0.03, 0.34, '#3a3a44', 0.75, dk + 1.13, deskZ + 0.02);
  lit.box(0.5, 0.32, 0.02, '#3a3a44', 0.75, dk + 1.28, deskZ + 0.2, 0.25, 0, 0);
  glow.box(0.44, 0.26, 0.01, '#8fd3ff', 0.75, dk + 1.28, deskZ + 0.185, 0.25, 0, 0);
  glow.box(0.1, 0.1, 0.01, C.pink, 0.75, dk + 1.29, deskZ + 0.215, 0.25, 0, 0);
  // marco de la pantalla LED (la pantalla la pone fx.ts)
  lit.box(9.0, 3.5, 0.18, '#0d0c12', 0, 3.55, ROOM.z0 + 0.09);

  // altavoces gigantes
  for (const s of [-1, 1]) {
    const x = s * 5.45, z = -9.9;
    lit.box(1.5, 1.3, 1.1, '#15141b', x, 0.65, z);
    lit.box(1.3, 1.7, 1.0, '#18171f', x, 2.15, z);
    ctx.addBox(x, 1.5, z, 0.75, 1.5, 0.55);
    const fz = z + 0.56;
    lit.cyl(0.52, 0.52, 0.04, 16, '#3a3946', x, 0.65, fz, Math.PI / 2, 0, 0);
    cones.cyl(0.44, 0.2, 0.08, 16, '#23222b', x, 0.65, fz + 0.02, Math.PI / 2, 0, 0);
    cones.cyl(0.1, 0.1, 0.05, 10, '#4a4956', x, 0.65, fz + 0.06, Math.PI / 2, 0, 0);
    lit.cyl(0.36, 0.36, 0.04, 14, '#3a3946', x, 2.45, fz - 0.05, Math.PI / 2, 0, 0);
    cones.cyl(0.3, 0.14, 0.08, 14, '#23222b', x, 2.45, fz - 0.03, Math.PI / 2, 0, 0);
    shiny.cyl(0.1, 0.1, 0.05, 10, C.chrome, x, 1.62, fz - 0.03, Math.PI / 2, 0, 0);
    glow.box(0.08, 0.04, 0.02, '#4dff88', x + 0.5, 2.9, fz - 0.03);
  }

  // ───────── Tarimas de los bailarines ─────────
  for (const p of PODIUMS) {
    lit.cyl(PODIUM_R, PODIUM_R * 1.05, PODIUM_H, 18, '#1d1529', p.x, PODIUM_H / 2, p.z);
    lit.cyl(PODIUM_R * 0.98, PODIUM_R * 0.98, 0.03, 18, '#2c2142', p.x, PODIUM_H + 0.01, p.z);
    pulseA.cyl(PODIUM_R + 0.03, PODIUM_R + 0.03, 0.05, 18, C.pink, p.x, PODIUM_H - 0.04, p.z);
    pulseB.cyl(PODIUM_R * 1.05 + 0.03, PODIUM_R * 1.05 + 0.03, 0.05, 18, C.cyan, p.x, 0.06, p.z);
    ctx.addBox(p.x, PODIUM_H / 2, p.z, PODIUM_R * 0.8, PODIUM_H / 2, PODIUM_R * 0.8);
  }

  // ───────── Barra ─────────
  const bx = (BAR.x0 + BAR.x1) / 2, bLen = BAR.z1 - BAR.z0, bz = (BAR.z0 + BAR.z1) / 2, bd = BAR.x1 - BAR.x0;
  lit.box(bd, BAR.h, bLen, '#2d1a40', bx, BAR.h / 2, bz);
  for (let i = 0; i < 14; i++) lit.box(0.04, BAR.h - 0.25, 0.42, '#3a2352', BAR.x1 + 0.02, 0.55, BAR.z0 + 0.4 + i * (bLen - 0.8) / 13);
  lit.box(bd + 0.35, 0.08, bLen + 0.3, '#15121e', bx + 0.1, BAR.h + 0.04, bz);
  pulseB.box(0.05, 0.05, bLen + 0.2, C.cyan, BAR.x1 + 0.3, BAR.h - 0.02, bz);
  pulseA.box(0.05, 0.05, bLen, C.pink, BAR.x1 + 0.03, 0.12, bz);
  shiny.box(0.05, 0.05, bLen, C.chrome, BAR.x1 + 0.28, 0.3, bz); // reposapiés
  ctx.addBox(bx, BAR.h / 2, bz, bd / 2 + 0.1, BAR.h / 2 + 0.05, bLen / 2);
  // cócteles de colores sobre la barra
  for (let i = 0; i < 7; i++) {
    const z = BAR.z0 + 0.8 + i * 1.55 + (i % 2) * 0.3;
    const col = [C.pink, C.cyan, C.gold, '#7cff4f', C.purple][i % 5];
    shiny.cyl(0.05, 0.035, 0.12, 8, '#dfe6ff', BAR.x1 + 0.05 - (i % 3) * 0.2, BAR.h + 0.14, z);
    glow.cyl(0.042, 0.03, 0.08, 8, col, BAR.x1 + 0.05 - (i % 3) * 0.2, BAR.h + 0.15, z);
  }
  // mueble de atrás: armario, espejo, baldas con botellas iluminadas
  lit.box(0.7, 1.05, bLen, '#24163a', ROOM.x0 + 0.35, 0.525, bz);
  lit.box(0.06, 2.3, bLen - 0.4, '#5b4b86', ROOM.x0 + 0.12, 2.35, bz);
  for (let s = 0; s < 3; s++) {
    const y = 1.55 + s * 0.72;
    lit.box(0.45, 0.05, bLen - 0.6, '#3a2a55', ROOM.x0 + 0.25, y, bz);
    glow.box(0.02, 0.02, bLen - 0.6, s === 1 ? C.pink : C.cyan, ROOM.x0 + 0.47, y - 0.04, bz);
    const colors = ['#2fa84f', '#e0a030', '#3a7bd5', '#d63a8a', '#9a5cff', '#e8e2c8', '#ff7b1a'];
    for (let i = 0; i < 24; i++) {
      const z = BAR.z0 + 0.6 + i * ((bLen - 1.2) / 23) + ((i * 7 + s * 3) % 5) * 0.03;
      const hgt = 0.26 + ((i * 13 + s) % 4) * 0.04;
      const col = colors[(i * 5 + s * 3) % colors.length];
      glow.cyl(0.045, 0.05, hgt, 6, shade(col, 0.75), ROOM.x0 + 0.26, y + 0.025 + hgt / 2, z);
      glow.cyl(0.018, 0.025, 0.1, 5, shade(col, 0.55), ROOM.x0 + 0.26, y + 0.025 + hgt + 0.05, z);
    }
  }
  ctx.addBox(ROOM.x0 + 0.35, 1.5, bz, 0.4, 1.5, bLen / 2);
  // taburetes
  for (const s of STOOLS) {
    shiny.cyl(0.24, 0.26, 0.03, 12, C.chrome, s.x, 0.015, s.z);
    shiny.cyl(0.035, 0.035, 0.72, 6, C.chrome, s.x, 0.38, s.z);
    shiny.cyl(0.17, 0.17, 0.025, 10, C.chrome, s.x, 0.32, s.z);
    lit.cyl(0.24, 0.22, 0.09, 12, C.velvet, s.x, 0.77, s.z);
  }

  // ───────── Zona VIP: tarima, escalones, cordón dorado ─────────
  const vw = VIP.x1 - VIP.x0, vd = VIP.z1 - VIP.z0, vx = (VIP.x0 + VIP.x1) / 2, vz = (VIP.z0 + VIP.z1) / 2;
  lit.box(vw, VIP.h, vd, C.plum, vx, VIP.h / 2, vz);
  lit.box(vw - 0.3, 0.02, vd - 0.3, '#4a1740', vx + 0.15, VIP.h + 0.01, vz - 0.15);
  ctx.addBox(vx, VIP.h / 2, vz, vw / 2, VIP.h / 2, vd / 2);
  glow.box(0.05, 0.04, vd, C.gold, VIP.x0 - 0.02, VIP.h - 0.03, vz);
  glow.box(vw, 0.04, 0.05, C.gold, vx, VIP.h - 0.03, VIP.z1 + 0.02);
  glow.box(0.04, 0.03, vd, C.gold, VIP.x0 - 0.02, 0.03, vz);
  glow.box(vw, 0.03, 0.04, C.gold, vx, 0.03, VIP.z1 + 0.02);
  // escalones (dos de 20 cm)
  const sz = (STAIRS.z0 + STAIRS.z1) / 2, sd = STAIRS.z1 - STAIRS.z0;
  const stepX = (STAIRS.x0 + STAIRS.x1) / 2;
  lit.box(STAIRS.x1 - STAIRS.x0, 0.2, sd, C.plum, stepX, 0.1, sz);
  lit.box((STAIRS.x1 - STAIRS.x0) / 2, 0.4, sd, C.plum, STAIRS.x1 - (STAIRS.x1 - STAIRS.x0) / 4, 0.2, sz);
  glow.box(0.04, 0.03, sd, C.gold, STAIRS.x0, 0.19, sz);
  glow.box(0.04, 0.03, sd, C.gold, stepX, 0.39, sz);
  ctx.addBox(stepX, 0.1, sz, (STAIRS.x1 - STAIRS.x0) / 2, 0.1, sd / 2);
  ctx.addBox(STAIRS.x1 - (STAIRS.x1 - STAIRS.x0) / 4, 0.2, sz, (STAIRS.x1 - STAIRS.x0) / 4, 0.2, sd / 2);
  // postes y cordón
  const postX = VIP.x0 + 0.22, ropeZ = VIP.z1 - 0.22;
  const westPosts = [-10.6, -8.1, -5.6, -3.1, -0.6, 1.8, 3.4];
  const gapA = new THREE.Vector3(postX, VIP.h, 3.4);
  const gapB = new THREE.Vector3(postX, VIP.h, 6.0);
  const posts: THREE.Vector3[] = [
    ...westPosts.slice(0, -1).map((z) => new THREE.Vector3(postX, VIP.h, z)),
    gapA,
    gapB,
    new THREE.Vector3(postX, VIP.h, ropeZ),
    new THREE.Vector3(11.2, VIP.h, ropeZ),
    new THREE.Vector3(13.1, VIP.h, ropeZ),
    new THREE.Vector3(14.75, VIP.h, ropeZ),
  ];
  const post = (p: THREE.Vector3) => {
    shiny.cyl(0.15, 0.17, 0.04, 12, C.goldMetal, p.x, p.y + 0.02, p.z);
    shiny.cyl(0.035, 0.035, 0.92, 6, C.goldMetal, p.x, p.y + 0.48, p.z);
    shiny.sphere(0.065, C.goldMetal, p.x, p.y + 0.96, p.z, 1);
  };
  for (const p of posts) post(p);
  const rope = (b: GeoBuilder, a: THREE.Vector3, c: THREE.Vector3, offset = new THREE.Vector3()) => {
    const A = a.clone().add(offset).setY(a.y + 0.9);
    const B = c.clone().add(offset).setY(c.y + 0.9);
    const M = A.clone().add(B).multiplyScalar(0.5);
    M.y -= 0.34;
    const tube = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(A, M, B), 12, 0.028, 5, false);
    b.add(tube, '#d9a531');
    tube.dispose();
  };
  for (let i = 0; i < posts.length - 1; i++) {
    if (posts[i] === gapA) continue;
    rope(shiny, posts[i], posts[i + 1]);
  }
  ctx.addBox(VIP.x0 + 0.2, 1.4, (VIP.z0 + gapA.z) / 2, 0.28, 1.4, (gapA.z - VIP.z0) / 2);
  ctx.addBox(VIP.x0 + 0.2, 1.4, (gapB.z + VIP.z1) / 2, 0.28, 1.4, (VIP.z1 - gapB.z) / 2);
  ctx.addBox(vx, 1.4, VIP.z1 - 0.2, vw / 2, 1.4, 0.28);
  // el tramo del hueco va aparte: se descuelga al comprar la mesa
  const gapRope = new THREE.Group();
  gapRope.position.set(gapA.x, gapA.y + 0.9, gapA.z);
  {
    const gb = new GeoBuilder();
    const rel = new THREE.Vector3(0, 0, 0);
    const relB = new THREE.Vector3(0, 0, gapB.z - gapA.z);
    const M = rel.clone().add(relB).multiplyScalar(0.5);
    M.y -= 0.34;
    const tube = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(rel, M, relB), 12, 0.03, 5, false);
    gb.add(tube, '#e2ad33');
    tube.dispose();
    gb.sphere(0.05, '#e2ad33', 0, 0, relB.z, 0); // mosquetón
    const m = new THREE.Mesh(gb.build(), shinyMaterial());
    gapRope.add(m);
  }
  root.add(gapRope);
  const gapCollider = game.physics.addStaticBox(
    origin.x + (STAIRS.x0 + VIP.x0 + 0.45) / 2, origin.y + 1.4, origin.z + (gapA.z + gapB.z) / 2,
    (VIP.x0 + 0.45 - STAIRS.x0 + 0.1) / 2, 1.4, (gapB.z - gapA.z) / 2, 0, G.STATIC,
  );

  // ───────── Reservados (sofás en U de terciopelo) ─────────
  const bottleSlots: THREE.Vector3[] = [];
  BOOTHS.forEach((z, bi) => {
    buildBooth(lit, shiny, glow, z, bi === 1 ? '#5a1a86' : C.velvet, bi === 1 ? '#34104f' : C.velvetDark);
    const y0 = VIP.h;
    // respaldos laterales de la U: separan los reservados (no se atraviesan)
    for (const s of [-1, 1]) ctx.addBox((BOOTH.sideX0 + 14.45) / 2, y0 + 0.65, z + s * 1.675, (14.45 - BOOTH.sideX0) / 2 + 0.2, 0.65, 0.23);
    ctx.addBox(14.7, y0 + 0.65, z, 0.2, 0.65, BOOTH.half);
    const ty0 = y0 + 0.46;
    // mesa baja redonda
    shiny.cyl(0.3, 0.36, 0.04, 14, C.goldMetal, BOOTH.tableX, y0 + 0.02, z);
    shiny.cyl(0.07, 0.07, 0.42, 8, C.goldMetal, BOOTH.tableX, y0 + 0.23, z);
    lit.cyl(0.58, 0.58, 0.05, 20, '#1a1422', BOOTH.tableX, ty0, z);
    glow.cyl(0.6, 0.6, 0.02, 20, C.gold, BOOTH.tableX, ty0 - 0.02, z);
    ctx.addBox(BOOTH.tableX, y0 + 0.24, z, 0.42, 0.24, 0.42);
    // cubitera con hielo
    shiny.cyl(0.13, 0.1, 0.2, 10, '#d7dbe8', BOOTH.tableX + 0.1, ty0 + 0.12, z - 0.18);
    lit.cyl(0.115, 0.115, 0.02, 10, '#e8f6ff', BOOTH.tableX + 0.1, ty0 + 0.21, z - 0.18);
    // copas
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const gx = BOOTH.tableX + Math.cos(a) * 0.36, gz = z + Math.sin(a) * 0.36;
      shiny.cyl(0.03, 0.03, 0.005, 6, '#e6ecff', gx, ty0 + 0.03, gz);
      shiny.cyl(0.006, 0.006, 0.09, 4, '#e6ecff', gx, ty0 + 0.075, gz);
      shiny.cyl(0.03, 0.012, 0.1, 6, '#e6ecff', gx, ty0 + 0.17, gz);
      glow.cyl(0.024, 0.01, 0.06, 6, '#ffe28a', gx, ty0 + 0.155, gz);
    }
    if (bi !== MY_BOOTH) {
      // las mesas de los demás ya tienen botella
      const bg = bottleGeometry();
      lit.add(bg, '#ffffff', BOOTH.tableX + 0.1, ty0 + 0.02, z - 0.18, 0.25, 0, 0.1);
      lit.add(bg, '#ffffff', BOOTH.tableX - 0.18, ty0, z + 0.12);
      bg.dispose();
    } else {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const r = k < 4 ? 0.2 : 0.34;
        bottleSlots.push(new THREE.Vector3(BOOTH.tableX - 0.08 + Math.cos(a + k * 0.4) * r, ty0, z + 0.1 + Math.sin(a + k * 0.4) * r));
      }
    }
  });
  // plantas entre reservados
  for (const [x, z] of [[14.35, (BOOTHS[0] + BOOTHS[1]) / 2], [14.35, (BOOTHS[1] + BOOTHS[2]) / 2], [14.3, 6.2], [9.9, -10.4]]) {
    palm(lit, shiny, x, VIP.h, z);
    ctx.addBox(x, VIP.h + 0.3, z, 0.26, 0.3, 0.26);
  }

  // ───────── Entrada: puertas acolchadas, alfombra roja ─────────
  const dz = ROOM.z1 - 0.06;
  shiny.box(3.3, 0.14, 0.14, C.chrome, 0, 3.05, dz);
  shiny.box(0.14, 3.1, 0.14, C.chrome, -1.6, 1.55, dz);
  shiny.box(0.14, 3.1, 0.14, C.chrome, 1.6, 1.55, dz);
  for (const s of [-1, 1]) {
    lit.box(1.5, 2.95, 0.1, '#5a0f25', s * 0.77, 1.5, dz - 0.02);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) {
      shiny.sphere(0.03, C.goldMetal, s * 0.77 + (i - 1.5) * 0.3 + (j % 2) * 0.15 - 0.075, 0.35 + j * 0.38, dz - 0.08, 0);
    }
    shiny.box(0.05, 0.6, 0.05, C.goldMetal, s * 0.12, 1.25, dz - 0.12);
  }
  pulseB.box(3.5, 0.05, 0.05, C.cyan, 0, 3.2, dz - 0.05);
  lit.box(2.6, 0.02, 4.3, '#b0103b', 0, 0.01, ROOM.z1 - 2.15);
  glow.box(0.05, 0.022, 4.3, C.gold, -1.3, 0.012, ROOM.z1 - 2.15);
  glow.box(0.05, 0.022, 4.3, C.gold, 1.3, 0.012, ROOM.z1 - 2.15);

  // ───────── Mesas altas ─────────
  for (const t of HIGH_TABLES) {
    shiny.cyl(0.28, 0.3, 0.03, 12, C.chrome, t.x, 0.015, t.z);
    shiny.cyl(0.04, 0.04, 1.05, 6, C.chrome, t.x, 0.53, t.z);
    lit.cyl(0.45, 0.45, 0.05, 16, '#15121e', t.x, 1.07, t.z);
    pulseA.cyl(0.47, 0.47, 0.025, 16, C.pink, t.x, 1.05, t.z);
    ctx.addBox(t.x, 0.55, t.z, 0.18, 0.55, 0.18);
    for (let k = 0; k < 2; k++) {
      const gx = t.x + (k ? 0.18 : -0.12), gz = t.z + (k ? -0.1 : 0.15);
      shiny.cyl(0.05, 0.035, 0.13, 8, '#dfe6ff', gx, 1.16, gz);
      glow.cyl(0.042, 0.03, 0.09, 8, k ? C.cyan : C.pink, gx, 1.16, gz);
    }
  }

  // ───────── Paquetería (guardarropa) ─────────
  const ccz = 9.0;
  lit.box(4.2, 1.05, 0.6, '#3a2150', -12.95, 0.525, ccz);
  lit.box(4.35, 0.06, 0.75, '#15121e', -12.95, 1.08, ccz);
  pulseB.box(4.2, 0.04, 0.04, C.cyan, -12.95, 1.0, ccz + 0.32);
  ctx.addBox(-12.95, 0.55, ccz, 2.1, 0.55, 0.3);
  shiny.sphere(0.06, C.goldMetal, -11.5, 1.14, ccz, 1); // timbre
  for (let s = 0; s < 3; s++) {
    const y = 0.75 + s * 0.8;
    lit.box(4.0, 0.05, 0.5, '#2a1a3a', -12.9, y, ROOM.z1 - 0.3);
    for (let i = 0; i < 7; i++) {
      const w = 0.35 + ((i * 7 + s * 5) % 4) * 0.08, h = 0.25 + ((i * 3 + s) % 3) * 0.1;
      const x = -14.6 + i * 0.55 + ((i + s) % 2) * 0.05;
      lit.box(w, h, 0.4, (i + s) % 3 ? '#b8834b' : '#cf9a5c', x, y + 0.025 + h / 2, ROOM.z1 - 0.3);
      lit.box(w + 0.005, 0.05, 0.405, '#e6d39a', x, y + 0.025 + h * 0.55, ROOM.z1 - 0.3);
    }
  }

  // ───────── Photocall ─────────
  {
    const tex = photocallTexture();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.2), new THREE.MeshLambertMaterial({ map: tex }));
    m.position.set(12.1, 1.75, ROOM.z1 - 0.15);
    m.rotation.y = Math.PI;
    root.add(m);
    lit.box(5.2, 0.12, 0.2, '#15121e', 12.1, 3.4, ROOM.z1 - 0.1);
    for (const x of [10.0, 14.2]) {
      shiny.cyl(0.02, 0.02, 1.9, 5, C.chrome, x, 0.95, 8.7);
      shiny.cyl(0.25, 0.25, 0.02, 3, C.chrome, x, 0.01, 8.7);
      lit.box(0.62, 0.62, 0.14, '#1b1b22', x, 2.05, 8.72, -0.25, x < 12 ? 0.4 : -0.4, 0);
      glow.box(0.54, 0.54, 0.02, '#fff5e0', x, 2.03, 8.8, -0.25, x < 12 ? 0.4 : -0.4, 0);
    }
  }

  // ───────── Mallas ─────────
  const addMesh = (b: GeoBuilder, mat: THREE.Material, name: string) => {
    const m = new THREE.Mesh(b.build(), mat);
    m.name = name;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    root.add(m);
    return m;
  };
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const pulseMatA = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const pulseMatB = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  addMesh(lit, vertexColorMaterial, 'club-sala');
  addMesh(shiny, shinyMaterial(), 'club-dorados');
  addMesh(glow, glowMat, 'club-luces');
  addMesh(pulseA, pulseMatA, 'club-neon-a');
  addMesh(pulseB, pulseMatB, 'club-neon-b');
  const speakerCones = new THREE.Mesh(cones.build(), vertexColorMaterial);
  speakerCones.name = 'club-conos';
  root.add(speakerCones);

  // ───────── Botellas de tu mesa (instanciadas) ─────────
  const bg = bottleGeometry();
  const bottles = new THREE.InstancedMesh(bg, vertexColorMaterial, 8);
  bottles.count = 0;
  bottles.frustumCulled = false; // (con count = 0 al principio, la esfera de recorte se quedaría vacía)
  bottles.name = 'club-botellas';
  root.add(bottles);

  // ───────── Letreros de neón ─────────
  const signs: THREE.Mesh[] = [];
  const sign = (tex: THREE.Texture, w: number, h: number, x: number, y: number, z: number, ry: number) => {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.renderOrder = 2;
    root.add(m);
    signs.push(m);
    return mat;
  };
  // el grande, sobre la pantalla del DJ
  const main = neonCanvas(1600, 420, (g, w) => {
    neonText(g, 'Club Reembolso', w / 2, 150, 200, C.pink, `200px ${SCRIPT_FONT}`);
    neonText(g, 'V · I · P', w / 2 + 10, 338, 96, C.gold, `italic 800 96px ${NEON_FONT}`);
    neonPath(g, C.cyan, 7, (g) => {
      g.moveTo(w / 2 - 330, 338);
      g.lineTo(w / 2 - 170, 338);
      g.moveTo(w / 2 + 190, 338);
      g.lineTo(w / 2 + 350, 338);
    });
  });
  sign(main.texture, 8.4, 2.2, 0, 6.2, ROOM.z0 + 0.1, 0);
  // barra: «Hoy no se fía, mañana sí»
  const barSign = neonCanvas(1200, 380, (g, w) => {
    neonText(g, 'HOY NO SE FÍA', w / 2, 120, 130, C.gold);
    neonText(g, 'mañana sí', w / 2 + 60, 285, 150, C.pink, `150px ${SCRIPT_FONT}`);
  });
  const flickerMat = sign(barSign.texture, 5.2, 1.65, ROOM.x0 + 0.1, 5.55, bz, Math.PI / 2);
  // zona VIP: corona y VIP
  const vipSign = neonCanvas(900, 520, (g, w) => {
    neonPath(g, C.gold, 9, (g) => {
      const cx = w / 2, y0 = 200, y1 = 70;
      g.moveTo(cx - 170, y0);
      g.lineTo(cx - 200, y1 + 30);
      g.lineTo(cx - 90, y1 + 90);
      g.lineTo(cx, y1);
      g.lineTo(cx + 90, y1 + 90);
      g.lineTo(cx + 200, y1 + 30);
      g.lineTo(cx + 170, y0);
      g.closePath();
    });
    neonText(g, 'VIP', w / 2, 360, 190, C.gold, `italic 900 190px ${NEON_FONT}`);
    neonText(g, 'solo gente importante (y tú)', w / 2, 480, 44, C.pink);
  });
  sign(vipSign.texture, 3.2, 1.85, ROOM.x1 - 0.1, 5.65, BOOTHS[1], -Math.PI / 2);
  // tu reservado
  const boothSign = neonCanvas(1024, 256, (g, w, h) => drawBoothSign(g, w, h, false));
  const boothSignMat = sign(boothSign.texture, 2.9, 0.72, ROOM.x1 - 0.1, 2.6, BOOTHS[MY_BOOTH], -Math.PI / 2);
  // paquetería
  const ccSign = neonCanvas(1024, 300, (g, w) => {
    neonPath(g, C.cyan, 6, (g) => {
      // una caja en perspectiva
      const x = 150, y = 150, s = 70;
      g.moveTo(x - s, y - s * 0.4);
      g.lineTo(x, y - s * 0.8);
      g.lineTo(x + s, y - s * 0.4);
      g.lineTo(x, y);
      g.closePath();
      g.moveTo(x - s, y - s * 0.4);
      g.lineTo(x - s, y + s * 0.6);
      g.lineTo(x, y + s);
      g.lineTo(x + s, y + s * 0.6);
      g.lineTo(x + s, y - s * 0.4);
      g.moveTo(x, y);
      g.lineTo(x, y + s);
    });
    neonText(g, 'PAQUETERÍA', w / 2 + 90, 120, 110, C.cyan);
    neonText(g, 'deja aquí tu abrigo (o tu paquete)', w / 2 + 90, 230, 44, C.pink);
  });
  sign(ccSign.texture, 3.9, 1.14, -12.9, 3.95, ROOM.z1 - 0.1, Math.PI);
  // encima de la puerta, por dentro
  const hourSign = neonCanvas(1024, 200, (g, w) => {
    neonText(g, 'aquí siempre son las 3:00', w / 2, 100, 96, C.purple, `110px ${SCRIPT_FONT}`);
  });
  sign(hourSign.texture, 4.4, 0.86, 0, 5.3, ROOM.z1 - 0.1, Math.PI);
  // SALIDA (cartel verde de emergencia, bien claro)
  {
    const s = neonCanvas(512, 160, (g, w, h) => {
      g.fillStyle = '#0fa84a';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#eafff1';
      g.lineWidth = 8;
      g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = '#ffffff';
      g.font = `900 92px ${NEON_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('SALIDA', w / 2 + 40, h / 2 + 4);
      // hombrecito corriendo hacia la puerta
      g.lineWidth = 11;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(70, 42, 12, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(66, 60);
      g.lineTo(58, 98);
      g.moveTo(58, 98);
      g.lineTo(80, 125);
      g.moveTo(58, 98);
      g.lineTo(36, 120);
      g.moveTo(64, 68);
      g.lineTo(88, 82);
      g.moveTo(64, 68);
      g.lineTo(42, 76);
      g.stroke();
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.47), new THREE.MeshBasicMaterial({ map: s.texture, toneMapped: false }));
    m.position.set(0, 3.55, ROOM.z1 - 0.1);
    m.rotation.y = Math.PI;
    root.add(m);
  }

  return {
    pulseA: pulseMatA,
    pulseB: pulseMatB,
    gapRope,
    gapCollider,
    bottles,
    boothSign,
    boothSignMat,
    flickerMat,
    speakerCones,
    bottleSlots,
    dispose() {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    },
  };
}

/** Orígenes de los haces de los focos móviles (x, z) colgados del truss. */
export const BEAM_ORIGINS: [number, number][] = [
  [-7, -8.5], [7, -8.5], [-7, 3.5], [7, 3.5], [-2.5, -8.5], [2.5, -8.5], [-7, -2.5], [7, -2.5],
];
export const BEAM_Y = 6.62;

let shinyMat: THREE.MeshPhongMaterial | null = null;
/** Dorados y cromados: Phong con brillo para que destellen con las luces del club. */
export function shinyMaterial(): THREE.MeshPhongMaterial {
  if (!shinyMat) {
    shinyMat = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 90, specular: new THREE.Color('#fff1c9') });
    shinyMat.name = 'club-dorado';
  }
  return shinyMat;
}

/** Botella de champán (el pie en y = 0). */
export function bottleGeometry(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0.048, 0.05, 0.2, 8, '#123d22', 0, 0.1, 0);
  b.cyl(0.02, 0.048, 0.08, 8, '#123d22', 0, 0.24, 0);
  b.cyl(0.02, 0.02, 0.06, 6, '#123d22', 0, 0.31, 0);
  b.cyl(0.024, 0.022, 0.07, 6, '#e3b341', 0, 0.335, 0);
  b.cyl(0.051, 0.051, 0.07, 8, '#f2ead0', 0, 0.1, 0);
  b.cyl(0.052, 0.052, 0.02, 8, '#e3b341', 0, 0.14, 0);
  return b.build();
}

function buildBooth(lit: GeoBuilder, shiny: GeoBuilder, glow: GeoBuilder, z: number, velvet: string, dark: string) {
  const y0 = VIP.h;
  const { backX0, backX1, sideX0, half, seatH } = BOOTH;
  const backFront = 14.45;
  // sofá del fondo
  lit.box(backX1 - backX0, 0.3, half * 2, dark, (backX0 + backX1) / 2, y0 + 0.15, z);
  lit.box(backFront - backX0 + 0.05, 0.16, half * 2 - 0.9, velvet, (backX0 + backFront) / 2, y0 + seatH - 0.07, z);
  lit.box(backX1 - backFront, 1.0, half * 2, velvet, (backFront + backX1) / 2, y0 + 0.3 + 0.5, z);
  shiny.box(0.06, 0.05, half * 2, '#d9a531', backFront + 0.03, y0 + 1.31, z);
  // capitoné: botones en rombo
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 12; i++) {
      const zz = z - half + 0.2 + i * ((half * 2 - 0.4) / 11) + (r % 2 ? 0.15 : 0);
      if (zz > z + half - 0.15) continue;
      lit.box(0.02, 0.04, 0.04, shade(velvet, 0.55), backFront - 0.005, y0 + 0.62 + r * 0.22, zz, Math.PI / 4, 0, 0);
    }
  }
  // brazos de la U
  for (const s of [-1, 1]) {
    const zOut = z + s * half;
    const zBack = z + s * (half - 0.45);
    const zSeat = z + s * (half - 0.45 - 0.33);
    lit.box(backX0 - sideX0, 0.3, 1.1, dark, (sideX0 + backX0) / 2, y0 + 0.15, z + s * (half - 0.55));
    lit.box(backX0 - sideX0, 0.16, 0.66, velvet, (sideX0 + backX0) / 2, y0 + seatH - 0.07, zSeat);
    lit.box(backX1 - sideX0 - (backX1 - backFront), 1.0, 0.45, velvet, (sideX0 + backFront) / 2, y0 + 0.8, (zOut + zBack) / 2);
    shiny.box(backFront - sideX0, 0.05, 0.06, '#d9a531', (sideX0 + backFront) / 2, y0 + 1.31, zBack);
    lit.cyl(0.23, 0.23, 1.3, 10, velvet, sideX0, y0 + 0.65, (zOut + zBack) / 2);
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 6; i++) {
        const xx = sideX0 + 0.25 + i * 0.36 + (r % 2 ? 0.18 : 0);
        if (xx > backFront - 0.1) continue;
        lit.box(0.04, 0.04, 0.02, shade(velvet, 0.55), xx, y0 + 0.62 + r * 0.22, zBack - s * 0.005, 0, 0, Math.PI / 4);
      }
    }
  }
  // luz dorada bajo el sofá
  glow.box(0.03, 0.03, half * 2 - 0.1, '#ffb347', backX0 - 0.02, y0 + 0.03, z);
}

function palm(lit: GeoBuilder, shiny: GeoBuilder, x: number, y: number, z: number) {
  shiny.cyl(0.26, 0.2, 0.55, 10, '#1d1a24', x, y + 0.275, z);
  shiny.cyl(0.265, 0.265, 0.05, 10, '#d9a531', x, y + 0.5, z);
  lit.cyl(0.05, 0.07, 1.3, 6, '#6b4a2e', x, y + 1.15, z, 0.05, 0, 0.04);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + x;
    const leaf = new THREE.BoxGeometry(0.9, 0.03, 0.22);
    leaf.translate(0.45, 0, 0);
    lit.add(leaf, i % 2 ? '#2f8f4e' : '#3aa65c', x, y + 1.78, z, 0, -a, -0.45 - (i % 3) * 0.12);
    leaf.dispose();
  }
}

/** Letrero del reservado: «RESERVADO» apagadito, o «MESA DEL JEFE» a tope si es tuya. */
export function drawBoothSign(g: CanvasRenderingContext2D, w: number, h: number, mine: boolean) {
  if (mine) {
    neonText(g, '★ MESA DEL JEFE ★', w / 2, h / 2, 104, C.gold);
  } else {
    neonText(g, 'RESERVADO', w / 2, h / 2, 110, '#b9a6d9');
  }
}

function photocallTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 660;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f6f1ff';
  g.fillRect(0, 0, c.width, c.height);
  for (let r = 0; r < 7; r++) {
    for (let i = 0; i < 5; i++) {
      const x = i * 230 + (r % 2) * 115 - 20, y = 50 + r * 95;
      if ((r + i) % 2) {
        g.fillStyle = '#6c3bd1';
        g.font = `italic 900 34px ${NEON_FONT}`;
        g.textAlign = 'center';
        g.fillText('CLUB REEMBOLSO', x + 80, y);
        g.fillStyle = '#ff2e88';
        g.font = `900 22px ${NEON_FONT}`;
        g.fillText('★ V I P ★', x + 80, y + 26);
      } else {
        // cajita dorada
        g.strokeStyle = '#d9a531';
        g.lineWidth = 5;
        g.strokeRect(x + 55, y - 32, 50, 42);
        g.beginPath();
        g.moveTo(x + 55, y - 20);
        g.lineTo(x + 105, y - 20);
        g.moveTo(x + 80, y - 32);
        g.lineTo(x + 80, y + 10);
        g.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

void tmpQ;
void STOOLS;
