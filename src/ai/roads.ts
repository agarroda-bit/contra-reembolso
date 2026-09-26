// Utilidades sobre el grafo de calles: carriles, aceras, puntos cercanos y rutas.
import * as THREE from 'three';
import type { RoadGraph, RoadEdge, WorldData } from '../core/contracts';
import { fx as rnd } from '../core/rng';

const tmpA = new THREE.Vector3();

/**
 * Montículo binario de mínimos para el A* (nodo + prioridad), con los arrays reutilizados entre rutas.
 * Sacar el mejor cuesta log(n) en vez de ordenar la lista abierta entera en cada paso.
 */
class MinHeap {
  private nodes: number[] = [];
  private pri: number[] = [];
  size = 0;
  /** Prioridad del último nodo sacado con pop(). */
  lastPri = 0;
  clear() {
    this.size = 0;
  }
  push(node: number, p: number) {
    const n = this.nodes, f = this.pri;
    let i = this.size++;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (f[up] <= p) break;
      n[i] = n[up];
      f[i] = f[up];
      i = up;
    }
    n[i] = node;
    f[i] = p;
  }
  pop(): number {
    const n = this.nodes, f = this.pri;
    const top = n[0];
    this.lastPri = f[0];
    const last = --this.size;
    if (last > 0) {
      const ln = n[last], lf = f[last];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= last) break;
        if (c + 1 < last && f[c + 1] < f[c]) c++;
        if (f[c] >= lf) break;
        n[i] = n[c];
        f[i] = f[c];
        i = c;
      }
      n[i] = ln;
      f[i] = lf;
    }
    return top;
  }
}

export class Roads {
  readonly g: RoadGraph;
  private lengths: number[];
  // estado del A* (se reutiliza: `seen` marca qué nodos tienen datos de la búsqueda actual)
  private heap = new MinHeap();
  private gScore: Float64Array;
  private came: Int32Array;
  private seen: Uint32Array;
  private search = 0;

  constructor(private world: WorldData) {
    this.g = world.roads;
    this.lengths = this.g.edges.map((e) => this.g.nodes[e.a].pos.distanceTo(this.g.nodes[e.b].pos));
    const n = this.g.nodes.length;
    this.gScore = new Float64Array(n);
    this.came = new Int32Array(n);
    this.seen = new Uint32Array(n);
  }

  length(e: number) {
    return this.lengths[e];
  }

  /** Nodo inicial y final de una arista según el sentido (dir = 1: a→b, -1: b→a). */
  ends(e: RoadEdge, dir: 1 | -1): [THREE.Vector3, THREE.Vector3] {
    return [this.startOf(e, dir), this.endOf(e, dir)];
  }
  /** Punto de salida de la arista en ese sentido (sin crear nada). */
  startOf(e: RoadEdge, dir: 1 | -1): THREE.Vector3 {
    return this.g.nodes[dir === 1 ? e.a : e.b].pos;
  }
  /** Punto de llegada de la arista en ese sentido (sin crear nada). */
  endOf(e: RoadEdge, dir: 1 | -1): THREE.Vector3 {
    return this.g.nodes[dir === 1 ? e.b : e.a].pos;
  }

  /**
   * Punto del carril (o acera) a una fracción t (0..1) de la arista en el sentido dir.
   * offset > 0 = a la derecha del sentido de marcha (en metros desde el eje).
   */
  lanePoint(edgeId: number, dir: 1 | -1, t: number, offset: number, out: THREE.Vector3): THREE.Vector3 {
    const e = this.g.edges[edgeId];
    const a = this.startOf(e, dir), b = this.endOf(e, dir);
    out.lerpVectors(a, b, t);
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    // derecha del sentido de marcha: (−dz, dx) rotado... con +Z sur y +X este, la derecha de (dx,dz) es (−dz, dx)
    out.x += (-dz / len) * offset;
    out.z += (dx / len) * offset;
    out.y = this.world.heightAt(out.x, out.z);
    return out;
  }

  /** Rumbo (0 = +Z) de la arista en ese sentido. */
  heading(edgeId: number, dir: 1 | -1): number {
    const e = this.g.edges[edgeId];
    const a = this.startOf(e, dir), b = this.endOf(e, dir);
    return Math.atan2(b.x - a.x, b.z - a.z);
  }

  /** Elige la siguiente arista al llegar al nodo final (evita dar la vuelta si puede). */
  nextEdge(edgeId: number, dir: 1 | -1, cars = true): { edge: number; dir: 1 | -1 } {
    const e = this.g.edges[edgeId];
    const node = dir === 1 ? e.b : e.a;
    const options = (this.g.adjacency[node] ?? []).filter((id) => id !== edgeId && (!cars || !this.g.edges[id].alley));
    let next = edgeId;
    if (options.length) next = options[Math.floor(rnd.next() * options.length)];
    const ne = this.g.edges[next];
    const ndir: 1 | -1 = next === edgeId ? (dir === 1 ? -1 : 1) : ne.a === node ? 1 : -1;
    return { edge: next, dir: ndir };
  }

  /** Arista más cercana a un punto (y fracción t sobre ella). cars = sin callejones. */
  nearestEdge(p: THREE.Vector3, cars = true): { edge: number; t: number; dist: number } | null {
    let bestE = -1, bestT = 0, bestD = Infinity;
    for (const e of this.g.edges) {
      if (cars && e.alley) continue;
      const a = this.g.nodes[e.a].pos, b = this.g.nodes[e.b].pos;
      const abx = b.x - a.x, abz = b.z - a.z;
      const l2 = abx * abx + abz * abz || 1;
      let t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / l2;
      t = Math.max(0, Math.min(1, t));
      const x = a.x + abx * t, z = a.z + abz * t;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) {
        bestD = d;
        bestE = e.id;
        bestT = t;
      }
    }
    return bestE < 0 ? null : { edge: bestE, t: bestT, dist: bestD };
  }

  /** Aristas con algún punto entre rMin y rMax de p (para hacer aparecer tráfico/peatones). */
  edgesInRing(p: THREE.Vector3, rMin: number, rMax: number, cars = true): number[] {
    const out: number[] = [];
    for (const e of this.g.edges) {
      if (cars && e.alley) continue;
      const a = this.g.nodes[e.a].pos, b = this.g.nodes[e.b].pos;
      tmpA.lerpVectors(a, b, 0.5);
      const d = Math.hypot(tmpA.x - p.x, tmpA.z - p.z);
      if (d > rMin && d < rMax) out.push(e.id);
    }
    return out;
  }

  /**
   * Ruta más corta por el grafo (A*) de un punto a otro: lista de posiciones de nodos (y al final `to`).
   * cars = true: solo calles de coches (sin callejones), para rutas que va a seguir un vehículo.
   */
  route(from: THREE.Vector3, to: THREE.Vector3, cars = false): THREE.Vector3[] {
    const s = this.nearestEdge(from, cars);
    const t = this.nearestEdge(to, cars);
    if (!s || !t) return [to.clone()];
    const nodes = this.g.nodes;
    const edges = this.g.edges;
    const gScore = this.gScore, came = this.came, seen = this.seen, heap = this.heap;
    const stamp = ++this.search;
    heap.clear();
    const goalA = edges[t.edge].a, goalB = edges[t.edge].b;
    for (let k = 0; k < 2; k++) {
      const n = k === 0 ? edges[s.edge].a : edges[s.edge].b;
      const g0 = nodes[n].pos.distanceTo(from);
      if (seen[n] === stamp && gScore[n] <= g0) continue;
      seen[n] = stamp;
      gScore[n] = g0;
      came[n] = -1;
      heap.push(n, g0 + nodes[n].pos.distanceTo(to));
    }
    let found = -1;
    let guard = 0;
    while (heap.size && guard++ < 5000) {
      const cur = heap.pop();
      // entrada vieja (el nodo ya se mejoró después de meterla): se ignora
      if (heap.lastPri > gScore[cur] + nodes[cur].pos.distanceTo(to) + 1e-6) continue;
      if (cur === goalA || cur === goalB) {
        found = cur;
        break;
      }
      for (const eid of this.g.adjacency[cur] ?? []) {
        const e = edges[eid];
        if (cars && e.alley) continue;
        const nb = e.a === cur ? e.b : e.a;
        const tentative = gScore[cur] + this.lengths[eid];
        if (seen[nb] !== stamp || tentative < gScore[nb]) {
          seen[nb] = stamp;
          gScore[nb] = tentative;
          came[nb] = cur;
          heap.push(nb, tentative + nodes[nb].pos.distanceTo(to));
        }
      }
    }
    if (found < 0) return [to.clone()];
    const path: THREE.Vector3[] = [];
    for (let c = found; c >= 0; c = came[c]) path.push(nodes[c].pos.clone());
    path.reverse();
    path.push(to.clone());
    return path;
  }
}
