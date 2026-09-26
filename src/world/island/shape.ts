// Forma de la isla y relieve base (antes de allanar calles y solares).
import { ValueNoise, smoothstep, clamp, lerp } from './noise';

export const SIZE = 640; // lado del cuadrado del mundo
export const HALF = SIZE / 2;
export const CELL = 3.2; // resolución del terreno (m)
export const GRID_N = SIZE / CELL; // 200 celdas por lado
export const QUAY_Z = 262.4; // borde del muelle (coincide con una línea de la rejilla)
export const QUAY_X0 = -150;
export const QUAY_X1 = 185;
export const QUAY_H = 2.4; // altura del muelle
const R = 296; // "radio" de la isla
const P = 3.4; // superelipse: más alto = más cuadrada

export class IslandShape {
  readonly noise: ValueNoise;
  constructor(seed: string) {
    this.noise = new ValueNoise(seed + ':costa');
  }

  /** Distancia aproximada a la costa en metros (positiva en tierra). */
  coastDist(x: number, z: number): number {
    const ax = Math.abs(x) / R, az = Math.abs(z) / R;
    const s = Math.pow(Math.pow(ax, P) + Math.pow(az, P), 1 / P);
    let d = (1 - s) * R;
    d += this.noise.fbm(x * 0.011, z * 0.011, 3) * 11;
    return Math.min(d, this.quayDist(x, z));
  }

  /** Distancia a la línea del muelle (la bahía del puerto). */
  quayDist(x: number, z: number): number {
    const out = Math.max(QUAY_X0 - x, x - QUAY_X1, 0);
    return QUAY_Z - z + 45 * smoothstep(0, 22, out);
  }

  /** ¿Este punto pertenece al muelle recto (perfil vertical)? */
  isQuay(x: number, z: number): boolean {
    return x >= QUAY_X0 && x <= QUAY_X1 && z > 200;
  }

  /** Altura tierra adentro: llano en el sur, subida suave, y La Colina al norte. */
  inland(x: number, z: number): number {
    let h = QUAY_H + 3.2 * smoothstep(118, -95, z);
    const ax = Math.abs(x);
    const t = clamp((250 - ax) / 220, 0, 1);
    const hx = t * 0.6 + t * t * (3 - 2 * t) * 0.4;
    const hz = smoothstep(-95, -215, z);
    h += 22.5 * hx * hz;
    h += this.noise.fbm(x * 0.02 + 50, z * 0.02 - 20, 2) * 1.6 * hz;
    return h;
  }

  /** Relieve base con playa, acantilados y fondo marino. */
  base(x: number, z: number): number {
    const H = this.inland(x, z);
    const dq = this.quayDist(x, z);
    if (this.isQuay(x, z)) {
      // muelle: pared vertical (entre dos líneas de la rejilla)
      return dq >= -0.001 ? H : Math.max(-11, Math.min(-6, 0.35 + dq * 0.6));
    }
    const dc = this.coastDist(x, z);
    if (dc >= 0) {
      const beach = lerp(16, 5, smoothstep(-150, -235, z));
      const t = smoothstep(0, beach, dc);
      return 0.35 + (H - 0.35) * t;
    }
    return Math.max(-11, 0.35 + dc * 0.95);
  }
}
