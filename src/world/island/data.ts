// Datos del contrato que salen de los solares y las calles: portales de entrega, plazas de
// aparcamiento en las bahías y tiendas donde recoger paquetes.
import * as THREE from 'three';
import type { DeliverySpot, ParkingSpot, DistrictId, Poi } from '../../core/contracts';
import type { Ctx } from './ctx';
import type { Out } from './special';
import { doorPoint, curbParking, makePoi } from './special';
import { Lot } from './layout';
import { BAY } from './network';
import { districtRaw } from './plan';
import { OCC } from './occ';

const PISOS = ['Bajo', '1º A', '1º B', '2º izquierda', '2º derecha', '3º B', '4º C', '5º A (el del perro)', 'Ático', 'Portería', '3º A (timbre roto)', 'Entresuelo'];

/** Elige ~n solares repartidos (orden espacial) de una lista. */
function spread<T extends { x: number; z: number }>(list: T[], n: number): T[] {
  if (list.length <= n) return list.slice();
  const sorted = list.slice().sort((a, b) => Math.round(a.z / 40) - Math.round(b.z / 40) || a.x - b.x);
  const out: T[] = [];
  const step = sorted.length / n;
  for (let i = 0; i < n; i++) out.push(sorted[Math.floor(i * step + step / 2)]);
  return out;
}

export function deliverySpots(ctx: Ctx, lots: Lot[], out: Out) {
  const rng = ctx.rng;
  const want: Record<DistrictId, number> = { centro: 24, viejo: 24, colina: 14, puerto: 8, poligono: 8 };
  const byD: Record<string, Lot[]> = {};
  for (const l of lots) {
    if (l.special) continue;
    const d = districtRaw(l.x, l.z);
    (byD[d] ??= []).push(l);
  }
  const res: DeliverySpot[] = [];
  const used = new Set<string>();
  for (const d of Object.keys(want) as DistrictId[]) {
    const pick = spread(byD[d] ?? [], want[d]);
    for (const l of pick) {
      let door: THREE.Vector3;
      let label: string;
      if (l.kind === 'chalet') {
        door = doorPoint(ctx, l, 0, 1.2);
        label = 'Chalet ' + (l.meta.name ?? 'Villa Sin Nombre');
      } else if (l.kind === 'house') {
        door = doorPoint(ctx, l, l.meta.doorX ?? 0, 0.9);
        label = `${l.street}, ${l.number}`;
      } else if (l.kind === 'nave') {
        door = doorPoint(ctx, l, l.meta.doorX ?? 0, 1.3);
        label = `Nave ${l.number}, ${l.street}`;
      } else {
        door = doorPoint(ctx, l, 0, 1.3);
        label = `${l.street}, ${l.number}, ${rng.pick(PISOS)}`;
      }
      if (used.has(label)) label += ' bis';
      used.add(label);
      // la puerta tiene que quedar fuera de los edificios
      const v = ctx.occ.get(door.x, door.z);
      if (v === OCC.BUILDING) continue;
      res.push({ id: `${d}-${l.id}`, district: d, door, facing: l.rot, label });
    }
  }
  out.delivery.push(...res);
}

/** Plazas de aparcamiento en las bahías de las calles (una de cada dos). */
export function bayParking(ctx: Ctx, out: Out) {
  const net = ctx.net;
  const res: ParkingSpot[] = [];
  for (const e of net.edges) {
    if (!e.bays) continue;
    const A = net.nodes[e.a];
    const rx = -e.dz, rz = e.dx;
    for (const side of [1, -1] as const) {
      const bit = side > 0 ? 1 : 2;
      if (!(e.bays & bit)) continue;
      let k = 0;
      for (let s = e.bayRange[0] + 3; s <= e.bayRange[1] - 3 + 0.01; s += 6, k++) {
        if (k % 2) continue;
        const lat = side * (e.width / 2 + BAY / 2);
        const x = A.x + e.dx * s + rx * lat, z = A.z + e.dz * s + rz * lat;
        const heading = side > 0 ? Math.atan2(e.dx, e.dz) : Math.atan2(-e.dx, -e.dz);
        res.push({ pos: new THREE.Vector3(x, ctx.heightAt(x, z), z), heading, district: e.district });
      }
    }
  }
  out.parking.push(...res);
}

/** Tiendas genéricas (POI 'shop') para recoger paquetes: se eligen escaparates repartidos. */
export function shopPois(ctx: Ctx, lots: Lot[], out: Out) {
  const cands = lots.filter((l) => !l.special && l.meta.shop);
  const want: [DistrictId, number][] = [['centro', 3], ['puerto', 2]];
  const taken = new Set<string>();
  const pois: Poi[] = [];
  for (const [d, n] of want) {
    const list = spread(cands.filter((l) => districtRaw(l.x, l.z) === d && !taken.has(l.meta.shop)), n * 2);
    let c = 0;
    for (const l of list) {
      if (c >= n || taken.has(l.meta.shop)) continue;
      taken.add(l.meta.shop);
      const poi = makePoi(ctx, `shop-${pois.length + 1}`, 'shop', l.meta.shop, l, 0, true, 1.3);
      pois.push(poi);
      c++;
    }
  }
  out.pois.push(...pois);
}

export { curbParking };
