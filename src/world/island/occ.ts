// Mapa de ocupación a 1 m: sirve para colocar edificios, árboles y mobiliario sin que se pisen.
import { HALF } from './shape';
import { RoadNet } from './network';
import { segDist } from './noise';

export const OCC = {
  FREE: 0,
  ROAD: 1,
  WALK: 2, // acera, bahía
  BUILDING: 3,
  RESERVED: 4, // plazas, patios, rampas...
  PROP: 5, // árbol, farola, banco
  WATER: 6,
  YARD: 7, // jardín o patio privado (se puede plantar)
} as const;

const _sd = { t: 0, d: 0 };

export class Occupancy {
  readonly n = HALF * 2;
  readonly data = new Uint8Array(this.n * this.n);

  idx(x: number, z: number): number {
    const i = Math.floor(x + HALF), j = Math.floor(z + HALF);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return -1;
    return j * this.n + i;
  }
  get(x: number, z: number): number {
    const k = this.idx(x, z);
    return k < 0 ? OCC.WATER : this.data[k];
  }
  set(x: number, z: number, v: number) {
    const k = this.idx(x, z);
    if (k >= 0) this.data[k] = v;
  }

  /** Recorre las celdas dentro de un rectángulo girado (centro, medias medidas, giro Y). */
  forRect(x: number, z: number, hw: number, hd: number, rot: number, fn: (k: number) => boolean | void): boolean {
    const c = Math.cos(rot), s = Math.sin(rot);
    const rad = Math.hypot(hw, hd);
    const i0 = Math.max(0, Math.floor(x - rad + HALF)), i1 = Math.min(this.n - 1, Math.ceil(x + rad + HALF));
    const j0 = Math.max(0, Math.floor(z - rad + HALF)), j1 = Math.min(this.n - 1, Math.ceil(z + rad + HALF));
    for (let j = j0; j <= j1; j++) {
      const wz = j - HALF + 0.5 - z;
      for (let i = i0; i <= i1; i++) {
        const wx = i - HALF + 0.5 - x;
        const lx = wx * c - wz * s, lz = wx * s + wz * c;
        if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) {
          if (fn(j * this.n + i) === false) return false;
        }
      }
    }
    return true;
  }

  /** ¿Todas las celdas del rectángulo (más margen) están en un valor permitido? */
  rectFree(x: number, z: number, hw: number, hd: number, rot: number, margin = 0, allowed: readonly number[] = [OCC.FREE]): boolean {
    return this.forRect(x, z, hw + margin, hd + margin, rot, (k) => allowed.includes(this.data[k]));
  }
  markRect(x: number, z: number, hw: number, hd: number, rot: number, v: number) {
    this.forRect(x, z, hw, hd, rot, (k) => {
      this.data[k] = v;
    });
  }
  circleFree(x: number, z: number, r: number, allowed: readonly number[] = [OCC.FREE]): boolean {
    const i0 = Math.max(0, Math.floor(x - r + HALF)), i1 = Math.min(this.n - 1, Math.ceil(x + r + HALF));
    const j0 = Math.max(0, Math.floor(z - r + HALF)), j1 = Math.min(this.n - 1, Math.ceil(z + r + HALF));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = i - HALF + 0.5 - x, dz = j - HALF + 0.5 - z;
        if (dx * dx + dz * dz <= r * r && !allowed.includes(this.data[j * this.n + i])) return false;
      }
    }
    return true;
  }
  markCircle(x: number, z: number, r: number, v: number) {
    const i0 = Math.max(0, Math.floor(x - r + HALF)), i1 = Math.min(this.n - 1, Math.ceil(x + r + HALF));
    const j0 = Math.max(0, Math.floor(z - r + HALF)), j1 = Math.min(this.n - 1, Math.ceil(z + r + HALF));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = i - HALF + 0.5 - x, dz = j - HALF + 0.5 - z;
        if (dx * dx + dz * dz <= r * r) this.data[j * this.n + i] = v;
      }
    }
  }

  /** Pinta calzadas y aceras de la red. */
  rasterRoads(net: RoadNet) {
    for (const e of net.edges) {
      const A = net.nodes[e.a], B = net.nodes[e.b];
      const maxExt = e.width / 2 + net.sideExtent(e, 1, e.len / 2) + net.sideExtent(e, -1, e.len / 2) + 3;
      const x0 = Math.min(A.x, B.x) - maxExt, x1 = Math.max(A.x, B.x) + maxExt;
      const z0 = Math.min(A.z, B.z) - maxExt, z1 = Math.max(A.z, B.z) + maxExt;
      for (let j = Math.max(0, Math.floor(z0 + HALF)); j <= Math.min(this.n - 1, Math.ceil(z1 + HALF)); j++) {
        const z = j - HALF + 0.5;
        for (let i = Math.max(0, Math.floor(x0 + HALF)); i <= Math.min(this.n - 1, Math.ceil(x1 + HALF)); i++) {
          const x = i - HALF + 0.5;
          segDist(x, z, A.x, A.z, B.x, B.z, _sd);
          const k = j * this.n + i;
          if (_sd.d <= e.width / 2 + 0.3) {
            this.data[k] = OCC.ROAD;
            continue;
          }
          // lado: producto vectorial con la dirección
          const side = (x - A.x) * -e.dz + (z - A.z) * e.dx >= 0 ? 1 : -1;
          const ext = net.sideExtent(e, side as 1 | -1, _sd.t * e.len);
          if (_sd.d <= e.width / 2 + ext + 0.2 && this.data[k] !== OCC.ROAD) this.data[k] = OCC.WALK;
        }
      }
    }
  }
}
