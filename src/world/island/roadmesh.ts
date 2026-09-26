// Mallas de las calles: aceras, asfalto (o empedrado) y marcas viales. Van pegadas al terreno y se
// ordenan con polygonOffset (así no parpadean y no flotan).
import * as THREE from 'three';
import { GeoBuilder, lin } from './geo';
import { RoadNet, REdge, SIDEWALK_VIS, BAY } from './network';

export const ROAD_COLORS = {
  asphalt: '#4a4f5c',
  asphaltColina: '#51535d',
  cobble: '#b8a386',
  sidewalk: '#d9cfc0',
  sidewalkViejo: '#e0cfb2',
  curb: '#bdb7ad',
  paint: '#f4f1e8',
  bay: '#565a66',
};

const LIFT = 0.02;

export class RoadMeshes {
  readonly walk = new GeoBuilder();
  readonly asphalt = new GeoBuilder();
  readonly paint = new GeoBuilder();

  constructor(private net: RoadNet, private heightAt: (x: number, z: number) => number) {}

  /** Tira a lo largo de un tramo entre dos distancias laterales (derecha positiva). */
  ribbon(b: GeoBuilder, e: REdge, lat0: number, lat1: number, s0: number, s1: number, color: string, step = 3, lift = LIFT) {
    if (s1 - s0 < 0.05) return;
    const A = this.net.nodes[e.a];
    const rx = -e.dz, rz = e.dx;
    const c = lin(color).clone();
    const across = Math.abs(lat1 - lat0) > 7 ? 2 : 1;
    // Bajo la calle el terreno es un plano (la altura de la calle es lineal a lo largo del tramo), así que
    // en el centro del tramo bastan trozos largos; cerca de los cruces, trozos cortos.
    const cuts: number[] = [s0];
    for (let s = s0; s < s1 - 0.01; ) {
      const nearEnd = s < 11 || s > e.len - 11 || e.district === 'colina';
      s = Math.min(s1, s + (nearEnd ? step : Math.max(step, 12)));
      cuts.push(s);
    }
    for (let i = 0; i < cuts.length - 1; i++) {
      const sa = cuts[i], sb = cuts[i + 1];
      for (let k = 0; k < across; k++) {
        const la = lat0 + ((lat1 - lat0) * k) / across, lb = lat0 + ((lat1 - lat0) * (k + 1)) / across;
        const p = (s: number, l: number) => {
          const x = A.x + e.dx * s + rx * l, z = A.z + e.dz * s + rz * l;
          return [x, this.heightAt(x, z) + lift, z];
        };
        // ordenar para que la normal mire arriba
        const [q0, q1] = lat0 < lat1 ? [la, lb] : [lb, la];
        const a = p(sa, q0), bb = p(sa, q1), cc = p(sb, q1), d = p(sb, q0);
        b.quadW(a[0], a[1], a[2], bb[0], bb[1], bb[2], cc[0], cc[1], cc[2], d[0], d[1], d[2], c);
      }
    }
  }

  /** Disco horizontal pegado al terreno. */
  disc(b: GeoBuilder, x: number, z: number, r: number, color: string, seg = 16, lift = LIFT) {
    const c = lin(color).clone();
    const rings = r > 5 ? 2 : 1;
    for (let ring = 0; ring < rings; ring++) {
      const r0 = (r * ring) / rings, r1 = (r * (ring + 1)) / rings;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
        const P = (a: number, rr: number) => {
          const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
          return [px, this.heightAt(px, pz) + lift, pz];
        };
        const o0 = P(a0, r1), o1 = P(a1, r1);
        if (ring === 0) {
          const cc = [x, this.heightAt(x, z) + lift, z];
          b.triW(cc[0], cc[1], cc[2], o1[0], o1[1], o1[2], o0[0], o0[1], o0[2], c);
        } else {
          const i0 = P(a0, r0), i1 = P(a1, r0);
          b.quadW(i0[0], i0[1], i0[2], i1[0], i1[1], i1[2], o1[0], o1[1], o1[2], o0[0], o0[1], o0[2], c);
        }
      }
    }
  }

  /** Polígono plano (rectángulo girado) pegado al terreno, subdividido. */
  rect(b: GeoBuilder, x: number, z: number, hw: number, hd: number, rot: number, color: string, step = 3, lift = LIFT) {
    const c = lin(color).clone();
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const nx = Math.max(1, Math.ceil((hw * 2) / step)), nz = Math.max(1, Math.ceil((hd * 2) / step));
    const P = (lx: number, lz: number) => {
      const px = x + lx * cs + lz * sn, pz = z - lx * sn + lz * cs;
      return [px, this.heightAt(px, pz) + lift, pz];
    };
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x0 = -hw + (2 * hw * i) / nx, x1 = -hw + (2 * hw * (i + 1)) / nx;
        const z0 = -hd + (2 * hd * j) / nz, z1 = -hd + (2 * hd * (j + 1)) / nz;
        const a = P(x0, z0), bb = P(x0, z1), cc = P(x1, z1), d = P(x1, z0);
        b.quadW(a[0], a[1], a[2], bb[0], bb[1], bb[2], cc[0], cc[1], cc[2], d[0], d[1], d[2], c);
      }
    }
  }

  build() {
    const net = this.net;
    for (const e of net.edges) {
      const hw = e.width / 2;
      const colina = e.district === 'colina';
      const viejo = e.district === 'viejo';
      const road = e.alley ? ROAD_COLORS.cobble : colina ? ROAD_COLORS.asphaltColina : ROAD_COLORS.asphalt;
      const walkCol = viejo ? ROAD_COLORS.sidewalkViejo : ROAD_COLORS.sidewalk;
      // calzada
      this.ribbon(this.asphalt, e, -hw, hw, 0, e.len, road, 3);
      if (!e.noSidewalk) {
        for (const side of [1, -1] as const) {
          this.ribbon(this.walk, e, side * hw, side * (hw + SIDEWALK_VIS), 0, e.len, walkCol, 3);
          const bit = side > 0 ? 1 : 2;
          if (e.bays & bit) {
            const [s0, s1] = e.bayRange;
            // bahía de aparcamiento + acera desplazada
            this.ribbon(this.asphalt, e, side * (hw - 0.05), side * (hw + BAY), s0, s1, ROAD_COLORS.bay, 3);
            this.ribbon(this.walk, e, side * (hw + BAY), side * (hw + BAY + SIDEWALK_VIS), s0 - 2, s1 + 2, walkCol, 3);
            // separadores de plazas
            for (let s = s0; s <= s1 + 0.01; s += 6) {
              this.ribbon(this.paint, e, side * hw, side * (hw + BAY - 0.25), s - 0.07, s + 0.07, ROAD_COLORS.paint, 3);
            }
            // rampitas en los extremos (triángulos de acera)
          }
        }
      } else if (e.alley) {
        // bordes de los callejones: una franja de piedra más clara
        for (const side of [1, -1] as const) {
          this.ribbon(this.walk, e, side * (hw - 0.6), side * (hw + 0.6), 0, e.len, '#d8c6a4', 3);
        }
      }
      // marcas: línea central discontinua y bordes
      if (!e.alley && !e.noSidewalk) {
        const tA = net.trimAt(e, e.a), tB = net.trimAt(e, e.b);
        const zA = this.zebraAt(e, e.a), zB = this.zebraAt(e, e.b);
        const sStart = tA + (zA ? 4.2 : 1.5), sEnd = e.len - tB - (zB ? 4.2 : 1.5);
        for (let s = sStart; s + 3 <= sEnd; s += 6) this.ribbon(this.paint, e, -0.09, 0.09, s, s + 3, ROAD_COLORS.paint, 3);
        // líneas de borde (se cortan en las bahías)
        for (const side of [1, -1] as const) {
          const bit = side > 0 ? 1 : 2;
          const segs: [number, number][] = [];
          if (e.bays & bit) {
            segs.push([tA + 0.5, e.bayRange[0]], [e.bayRange[1], e.len - tB - 0.5]);
          } else segs.push([tA + 0.5, e.len - tB - 0.5]);
          for (const [a, b] of segs) this.ribbon(this.paint, e, side * (hw - 0.45), side * (hw - 0.3), a, b, '#dcd8cc', 4);
        }
        // pasos de cebra
        if (zA) this.zebra(e, tA + 0.4);
        if (zB) this.zebra(e, e.len - tB - 3.4);
      }
    }
    // discos en los nodos
    for (const n of net.nodes) {
      let maxW = 0, anyAlley = true, allNoWalk = true, colina = false, viejo = false;
      for (const id of n.edges) {
        const e = net.edges[id];
        maxW = Math.max(maxW, e.width);
        if (!e.alley) anyAlley = false;
        if (!e.noSidewalk) allNoWalk = false;
        if (e.district === 'colina') colina = true;
        if (e.district === 'viejo') viejo = true;
      }
      const col = anyAlley ? ROAD_COLORS.cobble : colina ? ROAD_COLORS.asphaltColina : ROAD_COLORS.asphalt;
      this.disc(this.asphalt, n.x, n.z, maxW / 2 + 0.05, col, 16);
      if (!allNoWalk) this.disc(this.walk, n.x, n.z, maxW / 2 + SIDEWALK_VIS, viejo ? ROAD_COLORS.sidewalkViejo : ROAD_COLORS.sidewalk, 20);
    }
  }

  private zebraAt(e: REdge, nodeId: number): boolean {
    const n = this.net.nodes[nodeId];
    return e.zebra && n.edges.length >= 3;
  }

  /** Paso de cebra en la posición s (3 m de largo) a lo ancho de la calzada. */
  private zebra(e: REdge, s: number) {
    const hw = e.width / 2 - 0.6;
    for (let l = -hw; l + 0.55 <= hw + 0.01; l += 1.1) this.ribbon(this.paint, e, l, l + 0.55, s, s + 3, ROAD_COLORS.paint, 3);
  }

  meshes(): THREE.Mesh[] {
    const mk = (b: GeoBuilder, name: string, factor: number, units: number) => {
      const m = new THREE.Mesh(
        b.toGeometry(),
        new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: factor, polygonOffsetUnits: units }),
      );
      m.name = name;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      return m;
    };
    return [mk(this.walk, 'aceras', -1, -2), mk(this.asphalt, 'asfalto', -2, -4), mk(this.paint, 'marcas', -3, -6)];
  }
}
