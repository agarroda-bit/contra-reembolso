// Parcelas: coloca solares de edificios a lo largo de las calles usando el mapa de ocupación.
// Un solar es un rectángulo girado con la fachada (lado +Z local) mirando a la calle.
import type { DistrictId } from '../../core/contracts';
import { Rng } from '../../core/rng';
import { RoadNet, pathAt, pathLength } from './network';
import { Occupancy, OCC } from './occ';
import { districtRaw } from './plan';

export type LotKind = 'urban' | 'house' | 'chalet' | 'nave' | 'port' | 'special';

export interface Lot {
  id: number;
  kind: LotKind;
  /** Centro del rectángulo. */
  x: number;
  z: number;
  /** Media anchura (fachada) y media profundidad. */
  hw: number;
  hd: number;
  /** Rumbo de la fachada (0 = mira a +Z). */
  rot: number;
  /** Altura del suelo (solar allanado). */
  h: number;
  district: DistrictId;
  street: string;
  number: number;
  def: number;
  side: 1 | -1;
  /** Centro de la fachada (en la línea de fachada). */
  fx: number;
  fz: number;
  /** Punto del eje de la calle frente a la fachada y dirección de la polilínea. */
  rx: number;
  rz: number;
  dirx: number;
  dirz: number;
  roadW: number;
  /** Separación entre la línea de fachada y el borde de la acera (jardines). */
  setback: number;
  special?: string;
  /** Datos libres del generador de edificios. */
  meta: Record<string, any>;
}

export interface FillParams {
  kind: LotKind;
  wMin: number;
  wMax: number;
  dMin: number;
  dMax: number;
  setback?: number;
  /** Se permite empujar el solar hacia fuera (calles con curvas). */
  push?: boolean;
  gap?: number;
  /** Solo en [s0, s1] del recorrido. */
  s0?: number;
  s1?: number;
  /** Filtro por barrio del solar. */
  districts?: DistrictId[];
  /** Marca el solar entero como YARD y deja que el constructor marque la casa. */
  yard?: boolean;
}

const FREEISH = [OCC.FREE] as const;

export class Layout {
  lots: Lot[] = [];
  private numbers = new Map<string, number>();

  constructor(
    readonly net: RoadNet,
    readonly occ: Occupancy,
    readonly rng: Rng,
    readonly roadH: (x: number, z: number) => number,
  ) {}

  /** Distancia desde el eje hasta el primer punto que no es calzada ni acera, en la normal n. */
  probe(px: number, pz: number, nx: number, nz: number, w: number): { d: number; v: number } {
    let d = w / 2;
    const lim = w / 2 + 12;
    while (d < lim) {
      const v = this.occ.get(px + nx * d, pz + nz * d);
      if (v !== OCC.ROAD && v !== OCC.WALK) return { d, v };
      d += 0.25;
    }
    return { d, v: OCC.WALK };
  }

  private nextNumber(street: string, side: number): number {
    const key = street + (side > 0 ? '+' : '-');
    const n = (this.numbers.get(key) ?? (side > 0 ? -1 : 0)) + 2;
    this.numbers.set(key, n);
    return n;
  }

  /** Rellena un lado de una calle (definición `di`) con solares. */
  fillPath(di: number, side: 1 | -1, p: FillParams): Lot[] {
    const def = this.net.defs[di];
    const path = this.net.paths[di];
    const L = pathLength(path);
    const w = def.width;
    const s0 = Math.max(0, p.s0 ?? 0), s1 = Math.min(L, p.s1 ?? L);
    const step = 0.5;
    // 1) tramos libres
    const runs: [number, number, number][] = []; // s inicio, s fin, fachada
    let cur: [number, number, number] | null = null;
    for (let s = s0; s <= s1; s += step) {
      const q = pathAt(path, Math.min(s, L - 0.01));
      if (!q) break;
      const nx = -q.dz * side, nz = q.dx * side;
      const pr = this.probe(q.x, q.z, nx, nz, w);
      let ok = pr.v === OCC.FREE && pr.d < w / 2 + 7.5;
      if (ok) {
        // un poco de fondo libre
        const bx = q.x + nx * (pr.d + 3), bz = q.z + nz * (pr.d + 3);
        if (this.occ.get(bx, bz) !== OCC.FREE) ok = false;
      }
      if (ok && p.districts && !p.districts.includes(districtRaw(q.x + nx * (pr.d + 5), q.z + nz * (pr.d + 5)))) ok = false;
      if (ok && cur && Math.abs(pr.d - cur[2]) < 0.8) {
        cur[1] = s;
        cur[2] = Math.max(cur[2], pr.d);
      } else {
        if (cur && cur[1] - cur[0] >= p.wMin) runs.push(cur);
        cur = ok ? [s, s, pr.d] : null;
      }
    }
    if (cur && cur[1] - cur[0] >= p.wMin) runs.push(cur);

    // 2) partir cada tramo en solares
    const out: Lot[] = [];
    const gap = p.gap ?? 0;
    for (const [ra, rb] of runs) {
      const len = rb - ra;
      const avg = (p.wMin + p.wMax) / 2;
      let n = Math.max(1, Math.round((len + gap) / (avg + gap)));
      while (n > 1 && (len - gap * (n - 1)) / n < p.wMin) n--;
      const widths: number[] = [];
      let tot = 0;
      for (let i = 0; i < n; i++) {
        const v = this.rng.range(0.75, 1.25);
        widths.push(v);
        tot += v;
      }
      const usable = len - gap * (n - 1);
      let s = ra;
      for (let i = 0; i < n; i++) {
        const W = Math.min(p.wMax * 1.3, (widths[i] / tot) * usable);
        const lot = this.placeSpan(di, side, s, s + W, p);
        if (lot) out.push(lot);
        s += W + gap;
      }
    }
    return out;
  }

  /** Coloca un solar entre sa y sb del recorrido di. */
  placeSpan(di: number, side: 1 | -1, sa: number, sb: number, p: FillParams, special?: string, forceDepth?: number): Lot | null {
    const def = this.net.defs[di];
    const path = this.net.paths[di];
    const L = pathLength(path);
    const A = pathAt(path, Math.max(0, Math.min(L - 0.01, sa)));
    const B = pathAt(path, Math.max(0, Math.min(L - 0.01, sb)));
    if (!A || !B) return null;
    let tx = B.x - A.x, tz = B.z - A.z;
    const W = Math.hypot(tx, tz);
    if (W < 2) return null;
    tx /= W;
    tz /= W;
    const nx = -tz * side, nz = tx * side;
    // fachada = la acera más ancha a lo largo del tramo
    let front = 0;
    for (let k = 0; k <= 4; k++) {
      const q = pathAt(path, Math.max(0, Math.min(L - 0.01, sa + ((sb - sa) * k) / 4)))!;
      const qn = { x: -q.dz * side, z: q.dx * side };
      const pr = this.probe(q.x, q.z, qn.x, qn.z, def.width);
      // distancia de la línea de fachada al punto medio de la cuerda
      const off = pr.d + ((q.x - A.x) * nx + (q.z - A.z) * nz);
      front = Math.max(front, off);
    }
    const setback = p.setback ?? 0;
    const hw = W / 2;
    const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
    const rot = Math.atan2(-nx, -nz);
    const allowed = FREEISH as readonly number[];
    const pushes = p.push ? 6 : 1;
    for (let push = 0; push < pushes; push++) {
      const f = front + setback + push * 1.0 + 0.05;
      const depths: number[] = [];
      if (forceDepth) depths.push(forceDepth);
      else for (let D = p.dMax; D >= p.dMin - 0.01; D -= 1) depths.push(D);
      for (const D of depths) {
        const cx = mx + nx * (f + D / 2), cz = mz + nz * (f + D / 2);
        if (!this.occ.rectFree(cx, cz, hw, D / 2, rot, 0, allowed)) continue;
        const fx = mx + nx * f, fz = mz + nz * f;
        const street = def.name;
        const lot: Lot = {
          id: this.lots.length,
          kind: p.kind,
          x: cx,
          z: cz,
          hw,
          hd: D / 2,
          rot,
          h: this.roadH(mx, mz),
          district: districtRaw(cx, cz),
          street,
          number: this.nextNumber(street, side),
          def: di,
          side,
          fx,
          fz,
          rx: mx,
          rz: mz,
          dirx: tx,
          dirz: tz,
          roadW: def.width,
          setback: f - front,
          special,
          meta: {},
        };
        this.occ.markRect(cx, cz, hw, D / 2, rot, p.yard ? OCC.YARD : OCC.BUILDING);
        this.lots.push(lot);
        return lot;
      }
    }
    return null;
  }

  /** Solar especial junto al punto (px, pz): busca la calle más cercana y se coloca frente a ella. */
  lotNear(px: number, pz: number, W: number, D: number, p: Partial<FillParams> & { kind?: LotKind }, special?: string, road?: string): Lot | null {
    let best = -1, bestS = 0, bestD = 1e9, bestSide: 1 | -1 = 1;
    for (let di = 0; di < this.net.defs.length; di++) {
      const def = this.net.defs[di];
      if (road && def.name !== road) continue;
      if (!road && def.alley && !p.kind) continue;
      const path = this.net.paths[di];
      let acc = 0;
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i], b = path[i + 1];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const l = Math.hypot(dx, dz);
        let t = l > 0 ? ((px - a[0]) * dx + (pz - a[1]) * dz) / (l * l) : 0;
        t = Math.max(0, Math.min(1, t));
        const qx = a[0] + dx * t, qz = a[1] + dz * t;
        const d = Math.hypot(px - qx, pz - qz);
        if (d < bestD) {
          bestD = d;
          best = di;
          bestS = acc + l * t;
          const cross = (px - a[0]) * -dz + (pz - a[1]) * dx; // lado derecho = (-dz, dx)
          bestSide = cross >= 0 ? 1 : -1;
        }
        acc += l;
      }
    }
    if (best < 0) return null;
    const params: FillParams = { kind: p.kind ?? 'special', wMin: W, wMax: W, dMin: D, dMax: D, setback: p.setback ?? 0, push: p.push, yard: p.yard };
    return this.placeSpan(best, bestSide, bestS - W / 2, bestS + W / 2, params, special, D);
  }

  /** Marca a mano una zona reservada (plazas, patios, rampas...). */
  reserve(x: number, z: number, hw: number, hd: number, rot = 0, v: number = OCC.RESERVED) {
    this.occ.markRect(x, z, hw, hd, rot, v);
  }
}

/** Punto del mundo a partir de coordenadas locales de un solar (x a lo ancho, z hacia la calle). */
export function lotPoint(l: Lot, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(l.rot), s = Math.sin(l.rot);
  return { x: l.x + lx * c + lz * s, z: l.z - lx * s + lz * c };
}
