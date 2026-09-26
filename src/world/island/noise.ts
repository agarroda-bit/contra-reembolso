// Ruido de valor 2D con semilla (suave y barato) y utilidades matemáticas.
import { Rng } from '../../core/rng';

export class ValueNoise {
  private p = new Uint16Array(512);
  private v = new Float32Array(256);
  constructor(seed: string | number) {
    const r = new Rng(seed);
    const perm = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r.next() * (i + 1));
      const t = perm[i];
      perm[i] = perm[j];
      perm[j] = t;
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
    for (let i = 0; i < 256; i++) this.v[i] = r.next() * 2 - 1;
  }
  /** Ruido en [-1, 1]. */
  noise(x: number, y: number): number {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    const X = xi & 255, Y = yi & 255;
    const p = this.p, v = this.v;
    const a = v[p[p[X] + Y]], b = v[p[p[X + 1] + Y]];
    const c = v[p[p[X] + Y + 1]], d = v[p[p[X + 1] + Y + 1]];
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  }
  fbm(x: number, y: number, oct = 3): number {
    let s = 0, amp = 1, f = 1, n = 0;
    for (let i = 0; i < oct; i++) {
      s += this.noise(x * f + i * 17.3, y * f - i * 9.1) * amp;
      n += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return s / n;
  }
}

export function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
export function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Distancia de un punto a un segmento; devuelve también el parámetro t (0..1). */
export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number, out: { t: number; d: number }) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qz = az + dz * t - pz;
  out.t = t;
  out.d = Math.sqrt(qx * qx + qz * qz);
  return out;
}
