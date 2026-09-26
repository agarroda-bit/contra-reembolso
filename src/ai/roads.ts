// Utilidades sobre el grafo de calles: carriles, aceras, puntos cercanos y rutas.
import * as THREE from 'three';
import type { RoadGraph, RoadEdge, WorldData } from '../core/contracts';
import { fx as rnd } from '../core/rng';

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

export class Roads {
  readonly g: RoadGraph;
  private lengths: number[];

  constructor(private world: WorldData) {
    this.g = world.roads;
    this.lengths = this.g.edges.map((e) => this.g.nodes[e.a].pos.distanceTo(this.g.nodes[e.b].pos));
  }

  length(e: number) {
    return this.lengths[e];
  }

  /** Nodo inicial y final de una arista según el sentido (dir = 1: a→b, -1: b→a). */
  ends(e: RoadEdge, dir: 1 | -1): [THREE.Vector3, THREE.Vector3] {
    const a = this.g.nodes[e.a].pos, b = this.g.nodes[e.b].pos;
    return dir === 1 ? [a, b] : [b, a];
  }

  /**
   * Punto del carril (o acera) a una fracción t (0..1) de la arista en el sentido dir.
   * offset > 0 = a la derecha del sentido de marcha (en metros desde el eje).
   */
  lanePoint(edgeId: number, dir: 1 | -1, t: number, offset: number, out: THREE.Vector3): THREE.Vector3 {
    const e = this.g.edges[edgeId];
    const [a, b] = this.ends(e, dir);
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
    const [a, b] = this.ends(e, dir);
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

  /** Arista más cercana a un punto (y fracción t sobre ella). */
  nearestEdge(p: THREE.Vector3, cars = true): { edge: number; t: number; dist: number } | null {
    let best: { edge: number; t: number; dist: number } | null = null;
    for (const e of this.g.edges) {
      if (cars && e.alley) continue;
      const a = this.g.nodes[e.a].pos, b = this.g.nodes[e.b].pos;
      const abx = b.x - a.x, abz = b.z - a.z;
      const l2 = abx * abx + abz * abz || 1;
      let t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / l2;
      t = Math.max(0, Math.min(1, t));
      const x = a.x + abx * t, z = a.z + abz * t;
      const d = Math.hypot(p.x - x, p.z - z);
      if (!best || d < best.dist) best = { edge: e.id, t, dist: d };
    }
    return best;
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
      void tmpB;
    }
    return out;
  }

  /** Ruta más corta por el grafo (A*) de un punto a otro: lista de posiciones de nodos. */
  route(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    const s = this.nearestEdge(from, false);
    const t = this.nearestEdge(to, false);
    if (!s || !t) return [to.clone()];
    const nodes = this.g.nodes;
    const startNodes = [this.g.edges[s.edge].a, this.g.edges[s.edge].b];
    const goalNodes = new Set([this.g.edges[t.edge].a, this.g.edges[t.edge].b]);
    const gScore = new Map<number, number>();
    const came = new Map<number, number>();
    const open: { n: number; f: number }[] = [];
    for (const n of startNodes) {
      const g0 = nodes[n].pos.distanceTo(from);
      gScore.set(n, g0);
      open.push({ n, f: g0 + nodes[n].pos.distanceTo(to) });
    }
    let found = -1;
    let guard = 0;
    while (open.length && guard++ < 5000) {
      open.sort((x, y) => x.f - y.f);
      const cur = open.shift()!.n;
      if (goalNodes.has(cur)) {
        found = cur;
        break;
      }
      for (const eid of this.g.adjacency[cur] ?? []) {
        const e = this.g.edges[eid];
        const nb = e.a === cur ? e.b : e.a;
        const tentative = (gScore.get(cur) ?? Infinity) + this.lengths[eid];
        if (tentative < (gScore.get(nb) ?? Infinity)) {
          gScore.set(nb, tentative);
          came.set(nb, cur);
          open.push({ n: nb, f: tentative + nodes[nb].pos.distanceTo(to) });
        }
      }
    }
    if (found < 0) return [to.clone()];
    const path: THREE.Vector3[] = [to.clone()];
    let c: number | undefined = found;
    while (c !== undefined) {
      path.unshift(nodes[c].pos.clone());
      c = came.get(c);
    }
    return path;
  }
}
