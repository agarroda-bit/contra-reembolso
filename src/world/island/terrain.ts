// Terreno: rejilla de alturas de 3,2 m. heightAt interpola exactamente los mismos triángulos que la
// malla visual y el colisor (trimesh de Rapier).
import * as THREE from 'three';
import { HALF, CELL, GRID_N, IslandShape } from './shape';
import { RoadNet, SIDEWALK_VIS, BAY } from './network';
import { smoothstep, lerp } from './noise';
import { ChunkSet, lin } from './geo';

/** Solar allanado: rectángulo girado con su altura y una transición suave. */
export interface Pad {
  x: number;
  z: number;
  hw: number;
  hd: number;
  rot: number;
  h: number;
  blend: number;
}

export class Terrain {
  readonly n = GRID_N;
  readonly r = GRID_N + 1;
  readonly h: Float32Array;

  constructor(shape: IslandShape, net: RoadNet, pads: Pad[]) {
    const r = this.r;
    this.h = new Float32Array(r * r);
    const padW = new Float32Array(r * r);
    const padH = new Float32Array(r * r);
    // solares
    for (const p of pads) {
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      const rad = Math.hypot(p.hw, p.hd) + p.blend;
      const i0 = Math.max(0, Math.floor((p.x - rad + HALF) / CELL)), i1 = Math.min(this.n, Math.ceil((p.x + rad + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((p.z - rad + HALF) / CELL)), j1 = Math.min(this.n, Math.ceil((p.z + rad + HALF) / CELL));
      for (let j = j0; j <= j1; j++) {
        const z = -HALF + j * CELL - p.z;
        for (let i = i0; i <= i1; i++) {
          const x = -HALF + i * CELL - p.x;
          const lx = x * c - z * s, lz = x * s + z * c;
          const dx = Math.max(Math.abs(lx) - p.hw, 0), dz = Math.max(Math.abs(lz) - p.hd, 0);
          const d = Math.hypot(dx, dz);
          const w = d <= 0 ? 1 : smoothstep(p.blend, 0, d);
          const k = j * r + i;
          if (w > padW[k]) {
            padW[k] = w;
            padH[k] = p.h;
          }
        }
      }
    }
    // relieve + solares + calles
    const near = { id: -1, d: 0, t: 0, h: 0 };
    for (let j = 0; j <= this.n; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i <= this.n; i++) {
        const x = -HALF + i * CELL;
        const k = j * r + i;
        let b = shape.base(x, z);
        if (padW[k] > 0) b = lerp(b, padH[k], padW[k]);
        net.nearest(x, z, near);
        if (near.id >= 0) {
          const e = net.edges[near.id];
          const core = e.width / 2 + (e.alley ? 1.5 : e.noSidewalk ? 2 : SIDEWALK_VIS + (e.bays ? BAY : 0) + 1.2);
          const blend = 12;
          if (near.d < core + blend) {
            const w = near.d <= core ? 1 : smoothstep(core + blend, core, near.d);
            b = lerp(b, near.h, w);
          }
        }
        this.h[k] = b;
      }
    }
  }

  /** Altura exacta de la malla en (x, z). Fuera de la rejilla: fondo marino. */
  heightAt(x: number, z: number): number {
    let gx = (x + HALF) / CELL, gz = (z + HALF) / CELL;
    if (gx < 0 || gz < 0 || gx > this.n || gz > this.n) return -11;
    if (gx >= this.n) gx = this.n - 1e-6;
    if (gz >= this.n) gz = this.n - 1e-6;
    const i = gx | 0, j = gz | 0;
    const fx = gx - i, fz = gz - j;
    const r = this.r, k = j * r + i, h = this.h;
    const h00 = h[k], h10 = h[k + 1], h01 = h[k + r], h11 = h[k + r + 1];
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  /** Pendiente aproximada (tangente) en (x, z). */
  slopeAt(x: number, z: number): number {
    const e = 1.6;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  normalAt(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const e = 1.6;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-dx / (2 * e), 1, -dz / (2 * e)).normalize();
  }

  /** Mínimo y máximo del terreno bajo un rectángulo girado. */
  rangeUnder(x: number, z: number, hw: number, hd: number, rot: number): [number, number] {
    const c = Math.cos(rot), s = Math.sin(rot);
    let mn = 1e9, mx = -1e9;
    const nx = Math.max(2, Math.ceil((hw * 2) / 3)), nz = Math.max(2, Math.ceil((hd * 2) / 3));
    for (let a = 0; a <= nx; a++) {
      for (let b = 0; b <= nz; b++) {
        const lx = -hw + (2 * hw * a) / nx, lz = -hd + (2 * hd * b) / nz;
        const h = this.heightAt(x + lx * c + lz * s, z - lx * s + lz * c);
        if (h < mn) mn = h;
        if (h > mx) mx = h;
      }
    }
    return [mn, mx];
  }

  /** Malla visual troceada (sin los triángulos que quedan bajo el agua). */
  buildMesh(chunks: ChunkSet, colorAt: (x: number, z: number, h: number, slope: number) => THREE.Color, hidden?: (x: number, z: number) => boolean) {
    const r = this.r, h = this.h;
    const tmp = new THREE.Color();
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const k = j * r + i;
        const x0 = -HALF + i * CELL, z0 = -HALF + j * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
        const h00 = h[k], h10 = h[k + 1], h01 = h[k + r], h11 = h[k + r + 1];
        const b = chunks.at(x0 + CELL / 2, z0 + CELL / 2);
        // triángulo 1: v00, v01, v10 (se omite si queda entero bajo un edificio)
        const hid00 = hidden ? hidden(x0 + 0.2, z0 + 0.2) : false, hid11 = hidden ? hidden(x1 - 0.2, z1 - 0.2) : false;
        const hid01 = hidden ? hidden(x0 + 0.2, z1 - 0.2) : false, hid10 = hidden ? hidden(x1 - 0.2, z0 + 0.2) : false;
        if ((h00 > -0.7 || h01 > -0.7 || h10 > -0.7) && !(hid00 && hid01 && hid10)) {
          const cx = x0 + CELL / 3, cz = z0 + CELL / 3;
          const hm = (h00 + h01 + h10) / 3;
          const sl = Math.hypot(h10 - h00, h01 - h00) / CELL;
          tmp.copy(colorAt(cx, cz, hm, sl));
          b.triW(x0, h00, z0, x0, h01, z1, x1, h10, z0, tmp);
        }
        // triángulo 2: v10, v01, v11
        if ((h10 > -0.7 || h01 > -0.7 || h11 > -0.7) && !(hid10 && hid01 && hid11)) {
          const cx = x0 + (2 * CELL) / 3, cz = z0 + (2 * CELL) / 3;
          const hm = (h10 + h01 + h11) / 3;
          const sl = Math.hypot(h11 - h01, h11 - h10) / CELL;
          tmp.copy(colorAt(cx, cz, hm, sl));
          b.triW(x1, h10, z0, x0, h01, z1, x1, h11, z1, tmp);
        }
      }
    }
  }

  /** Vértices e índices para el colisor (rejilla completa). */
  colliderData(): { vertices: Float32Array; indices: Uint32Array } {
    const r = this.r;
    const vertices = new Float32Array(r * r * 3);
    for (let j = 0; j < r; j++) {
      for (let i = 0; i < r; i++) {
        const k = j * r + i;
        vertices[k * 3] = -HALF + i * CELL;
        vertices[k * 3 + 1] = this.h[k];
        vertices[k * 3 + 2] = -HALF + j * CELL;
      }
    }
    const indices = new Uint32Array(this.n * this.n * 6);
    let o = 0;
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const k = j * r + i;
        indices[o++] = k;
        indices[o++] = k + r;
        indices[o++] = k + 1;
        indices[o++] = k + 1;
        indices[o++] = k + r;
        indices[o++] = k + r + 1;
      }
    }
    return { vertices, indices };
  }
}

export { lin };
