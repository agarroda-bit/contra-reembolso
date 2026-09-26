// Utilidades comunes para los sitios especiales (POIs, aparcamientos, escaleras, rampas...).
import * as THREE from 'three';
import type { Poi, PoiKind, ParkingSpot, DeliverySpot, DistrictId } from '../../core/contracts';
import { Rng } from '../../core/rng';
import type { Ctx } from './ctx';
import { Lot, lotPoint, Layout } from './layout';
import { Occupancy } from './occ';
import { RoadNet } from './network';
import { IslandShape } from './shape';
import { GeoBuilder, SKIP } from './geo';
import { districtRaw } from './plan';
import type { Pad } from './terrain';

export interface PlanCtx {
  layout: Layout;
  occ: Occupancy;
  net: RoadNet;
  rng: Rng;
  shape: IslandShape;
  pads: Pad[];
  roadH(x: number, z: number): number;
}

export interface Out {
  pois: Poi[];
  parking: ParkingSpot[];
  delivery: DeliverySpot[];
  spawn?: { pos: THREE.Vector3; heading: number };
  /** Datos extra para otros sistemas (no están en el contrato). */
  extra: Record<string, unknown>;
  /** Cosas que se animan en update(). */
  animated: ((dt: number, t: number) => void)[];
  /** Mallas que se encienden de noche aparte (haz del faro...). */
  nightMeshes: THREE.Object3D[];
}

export interface Special {
  name: string;
  build(ctx: Ctx, out: Out): void;
}

/** Punto en la acera delante de la fachada del solar (x local = lx). */
export function doorPoint(ctx: Ctx, lot: Lot, lx = 0, out = 1.4): THREE.Vector3 {
  const p = lotPoint(lot, lx, lot.hd + out);
  return new THREE.Vector3(p.x, ctx.heightAt(p.x, p.z), p.z);
}

/** Sitio para aparcar junto al bordillo (o en la bahía si la hay) frente al solar. */
export function curbParking(ctx: Ctx, lot: Lot, lx = 0): { pos: THREE.Vector3; heading: number } {
  const P = lotPoint(lot, lx, lot.hd);
  const t = (P.x - lot.rx) * lot.dirx + (P.z - lot.rz) * lot.dirz;
  const rx = lot.rx + lot.dirx * t, rz = lot.rz + lot.dirz * t;
  const fx = Math.sin(lot.rot), fz = Math.cos(lot.rot); // de la fachada hacia la calle
  const facadeOff = Math.hypot(P.x - rx, P.z - rz) - lot.setback;
  const bays = facadeOff > lot.roadW / 2 + 4.3;
  const lat = bays ? lot.roadW / 2 + 1.25 : lot.roadW / 2 - 1.3;
  const x = rx - fx * lat, z = rz - fz * lat;
  const heading = Math.atan2(-Math.cos(lot.rot), Math.sin(lot.rot));
  return { pos: new THREE.Vector3(x, ctx.heightAt(x, z), z), heading };
}

/** Metros de acera entre la fachada del solar y el bordillo (para no sacar cosas a la calzada). */
export function curbGap(lot: Lot): number {
  const fx = Math.sin(lot.rot), fz = Math.cos(lot.rot);
  const d = (lot.rx - lot.fx) * fx + (lot.rz - lot.fz) * fz;
  return Math.max(1.2, d - lot.roadW / 2);
}

export function makePoi(ctx: Ctx, id: string, kind: PoiKind, name: string, lot: Lot, lx = 0, parking = true, out = 1.4): Poi {
  const door = doorPoint(ctx, lot, lx, out);
  return {
    id,
    kind,
    name,
    district: districtRaw(door.x, door.z),
    door,
    facing: lot.rot,
    parking: parking ? curbParking(ctx, lot, lx).pos : undefined,
  };
}

export function poiAt(ctx: Ctx, id: string, kind: PoiKind, name: string, x: number, z: number, facing: number, parking?: THREE.Vector3, district?: DistrictId): Poi {
  return { id, kind, name, district: district ?? districtRaw(x, z), door: new THREE.Vector3(x, ctx.heightAt(x, z), z), facing, parking };
}

/**
 * Explanada plana (en rampa suave si hace falta) entre cuatro esquinas de calle: ajusta un plano a las alturas
 * de las calles en las esquinas para que el suelo no haga aristas bajo el pavimento (plazas).
 */
export function plazaPad(p: PlanCtx, x0: number, z0: number, x1: number, z1: number, cx: number, cz: number, hw: number, hd: number): Pad {
  const h00 = p.roadH(x0, z0), h10 = p.roadH(x1, z0), h01 = p.roadH(x0, z1), h11 = p.roadH(x1, z1);
  const gx = (h10 + h11 - h00 - h01) / (2 * (x1 - x0));
  const gz = (h01 + h11 - h00 - h10) / (2 * (z1 - z0));
  const hm = (h00 + h10 + h01 + h11) / 4;
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  return { x: cx, z: cz, hw, hd, rot: 0, h: hm + gx * (cx - mx) + gz * (cz - mz), blend: 4, gx, gz };
}

/** Solar fabricado a mano (rectángulo girado). */
export function manualLot(layout: Layout, x: number, z: number, hw: number, hd: number, rot: number, h: number, kind: Lot['kind'], special: string, mark = true, v?: number): Lot {
  const fx = x + Math.sin(rot) * hd, fz = z + Math.cos(rot) * hd;
  const lot: Lot = {
    id: layout.lots.length,
    kind,
    x, z, hw, hd, rot, h,
    district: districtRaw(x, z),
    street: special,
    number: 0,
    def: -1,
    side: 1,
    fx, fz,
    rx: fx + Math.sin(rot) * 8,
    rz: fz + Math.cos(rot) * 8,
    dirx: Math.cos(rot),
    dirz: -Math.sin(rot),
    roadW: 10,
    setback: 0,
    special,
    meta: {},
  };
  if (mark) layout.occ.markRect(x, z, hw, hd, rot, v ?? 3);
  layout.lots.push(lot);
  return lot;
}

/**
 * Escalera exterior pegada a una pared: sube desde (x0, y0, z0) en la dirección `dir` (rumbo) hasta subir `rise`.
 * Dibuja peldaños y pone una rampa lisa como colisor (pendiente ~32°) + barandilla.
 */
export function stairs(ctx: Ctx, b: GeoBuilder, x0: number, y0: number, z0: number, dir: number, rise: number, width = 1.3, color = '#d8d2c6', rail = '#2a2c31', railSide = 1, solid = true) {
  const stepH = 0.2, stepD = 0.32;
  const n = Math.ceil(rise / stepH);
  const run = n * stepD;
  const fx = Math.sin(dir), fz = Math.cos(dir);
  b.frame(x0, y0, z0, dir);
  const L = Math.hypot(run, rise);
  const ang = Math.atan2(rise, run);
  for (let i = 0; i < n; i++) {
    const top = (i + 1) * (rise / n);
    if (solid) b.box(0, top / 2, i * stepD + stepD / 2, width, top, stepD, color, SKIP.NY | SKIP.NZ);
    else b.box(0, top - 0.09, i * stepD + stepD / 2, width, 0.18, stepD, color);
  }
  if (!solid) {
    // zancas bajo los peldaños
    for (const sx of [-width / 2 + 0.08, width / 2 - 0.08]) b.boxRot(sx, rise / 2 - 0.25, run / 2, 0.12, 0.3, L, -ang, 0, 0, rail);
    b.box(0, rise / 2 - 0.2, run - 0.3, 0.16, rise - 0.4, 0.16, rail);
  }
  // barandilla del lado libre (+x local)
  const rx = railSide * (width / 2 - 0.03);
  b.boxRot(rx, rise / 2 + 0.95, run / 2, 0.05, 0.05, L, -ang, 0, 0, rail);
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    b.box(rx, rise * t + 0.5, run * t, 0.04, 1.0, 0.04, rail);
  }
  // colisor: rampa lisa sobre los peldaños
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-ang, dir, 0, 'YXZ'));
  const off = run / 2 + 0.12 * Math.sin(ang);
  const cx = x0 + fx * off, cz = z0 + fz * off;
  const cy = y0 + rise / 2 + 0.1 - 0.12 * Math.cos(ang);
  ctx.boxQ(cx, cy, cz, width / 2, 0.12, L / 2, q);
  return { run, topX: x0 + fx * run, topZ: z0 + fz * run, topY: y0 + rise };
}

/** Rampa de salto para coches: cuña con rayas amarillas y negras. Rumbo = hacia dónde se salta. */
export function jumpRamp(ctx: Ctx, x: number, z: number, heading: number, len = 9, width = 5, height = 1.9) {
  const y = ctx.heightAt(x, z);
  const b = ctx.solid.at(x, z);
  const fx = Math.sin(heading), fz = Math.cos(heading);
  // el centro (x, z) es el centro de la cuña; la parte alta hacia `heading`
  b.frame(x, y, z, heading);
  const hl = len / 2;
  // tapa inclinada con rayas
  const stripes = 6;
  for (let i = 0; i < stripes; i++) {
    const x0 = -width / 2 + (width * i) / stripes, x1 = -width / 2 + (width * (i + 1)) / stripes;
    b.quadL(x0, 0.02, -hl, x0, height, hl, x1, height, hl, x1, 0.02, -hl, i % 2 ? '#1d1d1f' : '#ffcc1a');
  }
  // laterales y trasera
  b.triL(width / 2, 0, -hl, width / 2, height, hl, width / 2, 0, hl, '#8a8f96');
  b.triL(-width / 2, 0, hl, -width / 2, height, hl, -width / 2, 0, -hl, '#8a8f96');
  b.quadL(-width / 2, 0, hl, width / 2, 0, hl, width / 2, height, hl, -width / 2, height, hl, '#6c7078');
  b.box(0, -0.25, 0, width, 0.5, len, '#6c7078', SKIP.PY);
  const ang = Math.atan2(height, len);
  const L = Math.hypot(len, height);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-ang, heading, 0, 'YXZ'));
  const th = 0.25;
  // la cara superior del colisor coincide con la tapa
  const cy = y + height / 2 - (th / 2) * Math.cos(ang);
  const cx = x + fx * (th / 2) * Math.sin(ang), cz = z + fz * (th / 2) * Math.sin(ang);
  ctx.boxQ(cx, cy, cz, width / 2, th / 2, L / 2, q, 1 << 1);
  // pared trasera (para que no se entre por detrás)
  ctx.box(x + fx * (hl - 0.2), y + height / 2, z + fz * (hl - 0.2), width / 2, height / 2, 0.2, heading);
  ctx.ramps.push({ pos: new THREE.Vector3(x - fx * hl, y, z - fz * hl), heading });
  ctx.foot.push({ x, z, hw: width / 2, hd: hl, rot: heading, color: '#ffcc1a', height: 1 });
}

/** Longitud horizontal que ocupa una escalera de `rise` metros. */
export function stairRun(rise: number): number {
  return Math.ceil(rise / 0.2) * 0.32;
}

/** Paquete perdido coleccionable (el marcador lo pinta otro módulo; aquí solo la posición). */
export function collectible(ctx: Ctx, x: number, y: number, z: number) {
  ctx.collectibles.push(new THREE.Vector3(x, y + 0.6, z));
}

/** Vector3 en el suelo. */
export function ground(ctx: Ctx, x: number, z: number, dy = 0): THREE.Vector3 {
  return new THREE.Vector3(x, ctx.heightAt(x, z) + dy, z);
}
