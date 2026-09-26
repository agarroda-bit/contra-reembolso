// Planificación de la ciudad: qué solares hay y de qué tipo, antes de construir el terreno.
import type { DistrictId } from '../../core/contracts';
import { Rng } from '../../core/rng';
import { Layout, FillParams, Lot } from './layout';
import { Occupancy, OCC } from './occ';
import { RoadNet } from './network';
import { IslandShape, HALF } from './shape';
import { districtRaw } from './plan';

/** Marca como agua (no edificable) el mar, la playa y los acantilados. */
export function maskWater(occ: Occupancy, shape: IslandShape) {
  const step = 2;
  for (let z = -HALF; z < HALF; z += step) {
    for (let x = -HALF; x < HALF; x += step) {
      const cx = x + step / 2, cz = z + step / 2;
      const h = shape.base(cx, cz);
      const dc = shape.coastDist(cx, cz);
      let bad = h < 1.4 || dc < 6;
      if (!bad) {
        const e = 2;
        const sl = Math.hypot(shape.base(cx + e, cz) - shape.base(cx - e, cz), shape.base(cx, cz + e) - shape.base(cx, cz - e)) / (2 * e);
        if (sl > 0.45) bad = true;
      }
      if (bad) {
        for (let j = 0; j < step; j++) for (let i = 0; i < step; i++) if (occ.get(x + i + 0.5, z + j + 0.5) === OCC.FREE) occ.set(x + i + 0.5, z + j + 0.5, OCC.WATER);
      }
    }
  }
}

const PARAMS: Record<DistrictId, FillParams> = {
  centro: { kind: 'urban', wMin: 9, wMax: 15, dMin: 9, dMax: 14 },
  puerto: { kind: 'urban', wMin: 10, wMax: 16, dMin: 9, dMax: 14 },
  viejo: { kind: 'house', wMin: 5.5, wMax: 9, dMin: 6, dMax: 11.2 },
  colina: { kind: 'chalet', wMin: 19, wMax: 28, dMin: 18, dMax: 26, setback: 1.2, push: true, yard: true, tol: 4 },
  poligono: { kind: 'nave', wMin: 20, wMax: 34, dMin: 16, dMax: 28, gap: 4 },
};

/** Rellena todas las calles con solares genéricos. */
export function fillGeneric(layout: Layout, net: RoadNet, rng: Rng) {
  // orden: calles anchas primero, luego callejones
  const order = net.defs.map((d, i) => i).sort((a, b) => {
    const da = net.defs[a], db = net.defs[b];
    if (!!da.alley !== !!db.alley) return da.alley ? 1 : -1;
    return db.width - da.width;
  });
  const districts: DistrictId[] = ['puerto', 'centro', 'poligono', 'colina', 'viejo'];
  for (const d of districts) {
    for (const di of order) {
      const def = net.defs[di];
      if (d !== 'viejo' && def.alley) continue;
      for (const side of [1, -1] as const) {
        const p = { ...PARAMS[d], districts: [d] };
        if (d === 'viejo' && !def.alley) {
          p.wMin = 6;
          p.wMax = 10;
        }
        layout.fillPath(di, side, p);
      }
    }
  }
  void rng;
}

export function lotDistrict(l: Lot): DistrictId {
  return districtRaw(l.x, l.z);
}
