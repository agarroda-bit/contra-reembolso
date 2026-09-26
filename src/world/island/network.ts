// Red de calles: se define con polilíneas, se "planariza" (cruces reales = nodos) y se le dan alturas
// con pendiente máxima limitada.
import type { DistrictId } from '../../core/contracts';
import { segDist } from './noise';

export const SIDEWALK = 2.8; // acera transitable (m)
export const SIDEWALK_VIS = 3.2; // acera dibujada (se mete un poco bajo las fachadas)
export const BAY = 2.5; // ancho de bahía de aparcamiento
export const MAX_GRADE = 0.11;

export interface RoadDef {
  name: string;
  pts: number[][];
  width: number;
  alley?: boolean;
  /** Bahías de aparcamiento: 'right' / 'left' respecto al sentido de la polilínea. */
  bays?: 'right' | 'left' | 'both';
  /** Suavizar con Catmull-Rom (calles con curvas). */
  curve?: boolean;
  /** Sin aceras (caminos, muelle). */
  noSidewalk?: boolean;
  /** Pasos de cebra en sus cruces. */
  zebra?: boolean;
}

export interface RNode {
  id: number;
  x: number;
  z: number;
  h: number;
  edges: number[];
}

export interface REdge {
  id: number;
  a: number;
  b: number;
  width: number;
  alley: boolean;
  noSidewalk: boolean;
  zebra: boolean;
  name: string;
  def: number;
  /** bit 1 = bahía a la derecha (a->b), bit 2 = a la izquierda */
  bays: number;
  bayRange: [number, number];
  district: DistrictId;
  len: number;
  dx: number;
  dz: number;
}

const _sd = { t: 0, d: 0 };

export class RoadNet {
  nodes: RNode[] = [];
  edges: REdge[] = [];
  defs: RoadDef[] = [];
  /** Polilíneas ya muestreadas por definición (para colocar solares a lo largo). */
  paths: number[][][] = [];
  private hashCell = 16;
  private hashN = 0;
  private hashHalf = 380;
  private hash: number[][] = [];

  add(def: RoadDef) {
    const di = this.defs.length;
    this.defs.push(def);
    const pts = def.curve ? catmull(def.pts, 12) : def.pts.map((p) => [p[0], p[1]]);
    this.paths.push(pts);
    let prev = -1;
    for (const p of pts) {
      const n = this.nodeAt(p[0], p[1], 1.5);
      if (prev >= 0 && prev !== n) this.addEdge(prev, n, def, di);
      prev = n;
    }
  }

  private nodeAt(x: number, z: number, merge: number): number {
    for (const n of this.nodes) if (Math.hypot(n.x - x, n.z - z) < merge) return n.id;
    const id = this.nodes.length;
    this.nodes.push({ id, x, z, h: 0, edges: [] });
    return id;
  }

  private addEdge(a: number, b: number, def: RoadDef, di: number, bays?: number): REdge {
    // evitar duplicados
    for (const e of this.edges) if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return e;
    const na = this.nodes[a], nb = this.nodes[b];
    const len = Math.hypot(nb.x - na.x, nb.z - na.z);
    const e: REdge = {
      id: this.edges.length,
      a, b,
      width: def.width,
      alley: !!def.alley,
      noSidewalk: !!def.noSidewalk || !!def.alley,
      zebra: !!def.zebra,
      name: def.name,
      def: di,
      bays: bays ?? (def.bays === 'both' ? 3 : def.bays === 'right' ? 1 : def.bays === 'left' ? 2 : 0),
      bayRange: [0, 0],
      district: 'centro',
      len,
      dx: (nb.x - na.x) / (len || 1),
      dz: (nb.z - na.z) / (len || 1),
    };
    this.edges.push(e);
    return e;
  }

  /** Parte la arista e en el nodo n. */
  private split(e: REdge, n: number) {
    const def = this.defs[e.def];
    const b = e.b;
    // reutiliza e como (a, n)
    const na = this.nodes[e.a], nn = this.nodes[n];
    e.b = n;
    e.len = Math.hypot(nn.x - na.x, nn.z - na.z);
    e.dx = (nn.x - na.x) / (e.len || 1);
    e.dz = (nn.z - na.z) / (e.len || 1);
    const e2 = this.addEdge(n, b, def, e.def, e.bays);
    e2.width = e.width;
  }

  /** Convierte cruces y T en nodos reales. */
  planarize() {
    // T: nodo sobre una arista
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      for (const n of this.nodes) {
        for (const e of [...this.edges]) {
          if (e.a === n.id || e.b === n.id) continue;
          const A = this.nodes[e.a], B = this.nodes[e.b];
          segDist(n.x, n.z, A.x, A.z, B.x, B.z, _sd);
          if (_sd.d < 1.2 && _sd.t > 0.01 && _sd.t < 0.99) {
            this.split(e, n.id);
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    // X: cruces entre aristas
    for (let pass = 0; pass < 8; pass++) {
      let changed = false;
      const E = this.edges.length;
      for (let i = 0; i < E; i++) {
        for (let j = i + 1; j < E; j++) {
          const e = this.edges[i], f = this.edges[j];
          if (e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b) continue;
          const A = this.nodes[e.a], B = this.nodes[e.b], C = this.nodes[f.a], D = this.nodes[f.b];
          const hit = segInter(A.x, A.z, B.x, B.z, C.x, C.z, D.x, D.z);
          if (!hit) continue;
          const [t, u] = hit;
          if (t < 0.01 || t > 0.99 || u < 0.01 || u > 0.99) continue;
          const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t;
          const n = this.nodeAt(x, z, 0.5);
          this.split(e, n);
          this.split(f, n);
          changed = true;
        }
      }
      if (!changed) break;
    }
    // adyacencia
    for (const n of this.nodes) n.edges = [];
    for (const e of this.edges) {
      this.nodes[e.a].edges.push(e.id);
      this.nodes[e.b].edges.push(e.id);
    }
  }

  /** Alturas: relieve base en cada nodo y luego limitar la pendiente. */
  computeHeights(base: (x: number, z: number) => number, minH = 1.9) {
    for (const n of this.nodes) n.h = Math.max(minH, base(n.x, n.z));
    for (let it = 0; it < 400; it++) {
      let worst = 0;
      for (const e of this.edges) {
        const A = this.nodes[e.a], B = this.nodes[e.b];
        const maxd = MAX_GRADE * e.len;
        const d = B.h - A.h;
        const ex = Math.abs(d) - maxd;
        if (ex > 0.001) {
          const s = Math.sign(d) * ex * 0.5;
          A.h += s;
          B.h -= s;
          worst = Math.max(worst, ex);
        }
      }
      if (worst < 0.002) break;
    }
  }

  /** Recorte en un extremo: si es un cruce, lo que ocupan las otras calles. */
  trimAt(e: REdge, nodeId: number): number {
    const n = this.nodes[nodeId];
    if (n.edges.length <= 2) {
      if (n.edges.length === 2) {
        // curva: si el ángulo es fuerte, un poco de recorte
        return 0;
      }
      return 0;
    }
    let w = 0;
    for (const id of n.edges) if (id !== e.id) w = Math.max(w, this.edges[id].width / 2);
    return w + (this.edges[e.id].noSidewalk ? 0.5 : SIDEWALK_VIS * 0.5);
  }

  /** Tramos de bahías de aparcamiento (lejos de los cruces). */
  computeBays() {
    for (const e of this.edges) {
      if (!e.bays) continue;
      const s0 = this.nodes[e.a].edges.length > 2 ? this.trimAt(e, e.a) + 7 : 3;
      const s1 = e.len - (this.nodes[e.b].edges.length > 2 ? this.trimAt(e, e.b) + 7 : 3);
      if (s1 - s0 < 11.5) {
        e.bays = 0;
        continue;
      }
      e.bayRange = [s0, s1];
    }
  }

  /** Índice espacial para consultas rápidas. */
  buildHash(pad: number) {
    this.hashN = Math.ceil((this.hashHalf * 2) / this.hashCell);
    this.hash = Array.from({ length: this.hashN * this.hashN }, () => []);
    for (const e of this.edges) {
      const A = this.nodes[e.a], B = this.nodes[e.b];
      const r = e.width / 2 + pad;
      const x0 = Math.min(A.x, B.x) - r, x1 = Math.max(A.x, B.x) + r;
      const z0 = Math.min(A.z, B.z) - r, z1 = Math.max(A.z, B.z) + r;
      const i0 = this.cellI(x0), i1 = this.cellI(x1), j0 = this.cellI(z0), j1 = this.cellI(z1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.hash[j * this.hashN + i].push(e.id);
    }
  }
  private cellI(v: number) {
    return Math.max(0, Math.min(this.hashN - 1, Math.floor((v + this.hashHalf) / this.hashCell)));
  }
  candidates(x: number, z: number): number[] {
    return this.hash[this.cellI(z) * this.hashN + this.cellI(x)] ?? [];
  }

  /** ¿(x, z) está sobre la calzada? (distancia a algún tramo <= ancho/2) */
  isRoad(x: number, z: number): boolean {
    const c = this.candidates(x, z);
    for (let i = 0; i < c.length; i++) {
      const e = this.edges[c[i]];
      const A = this.nodes[e.a], B = this.nodes[e.b];
      segDist(x, z, A.x, A.z, B.x, B.z, _sd);
      if (_sd.d <= e.width / 2) return true;
    }
    return false;
  }

  /** Tramo más cercano: devuelve id, distancia, t y altura de la calzada en la proyección. */
  nearest(x: number, z: number, out: { id: number; d: number; t: number; h: number }, filter?: (e: REdge) => boolean) {
    out.id = -1;
    out.d = 1e9;
    const c = this.candidates(x, z);
    for (let i = 0; i < c.length; i++) {
      const e = this.edges[c[i]];
      if (filter && !filter(e)) continue;
      const A = this.nodes[e.a], B = this.nodes[e.b];
      segDist(x, z, A.x, A.z, B.x, B.z, _sd);
      if (_sd.d < out.d) {
        out.d = _sd.d;
        out.id = e.id;
        out.t = _sd.t;
        out.h = A.h + (B.h - A.h) * _sd.t;
      }
    }
    return out;
  }

  /** Lado extra ocupado por aceras/bahías a cada lado de un tramo, en una posición s. */
  sideExtent(e: REdge, side: 1 | -1, s: number): number {
    if (e.alley) return 0.3;
    if (e.noSidewalk) return 0.8;
    let ext = SIDEWALK;
    const bit = side > 0 ? 1 : 2;
    if (e.bays & bit && s >= e.bayRange[0] - 2 && s <= e.bayRange[1] + 2) ext += BAY;
    return ext;
  }
}

/** Intersección de segmentos: [t, u] o null. */
function segInter(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): [number, number] | null {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den;
  const u = ((cx - ax) * rz - (cz - az) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [t, u];
}

/** Catmull-Rom centrípeta muestreada cada ~step metros (incluye los extremos). */
export function catmull(pts: number[][], step: number): number[][] {
  if (pts.length < 3) return pts.map((p) => [p[0], p[1]]);
  const out: number[][] = [];
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(1, Math.round(segLen / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  return out;
}

/** Recorre una polilínea: punto y dirección a una distancia s. */
export function pathAt(path: number[][], s: number): { x: number; z: number; dx: number; dz: number } | null {
  let acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + l >= s) {
      const t = l > 0 ? (s - acc) / l : 0;
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / (l || 1), dz: (b[1] - a[1]) / (l || 1) };
    }
    acc += l;
  }
  return null;
}

export function pathLength(path: number[][]): number {
  let acc = 0;
  for (let i = 0; i < path.length - 1; i++) acc += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
  return acc;
}
