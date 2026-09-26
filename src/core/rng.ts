// Generador aleatorio con semilla (mulberry32). Mismo resultado en cada partida.
export class Rng {
  private s: number;
  constructor(seed: number | string = 1) {
    this.s = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
  }
  /** Número en [0, 1). */
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** Copia independiente que sigue desde el estado actual. */
  fork(salt: number | string = 0): Rng {
    return new Rng((this.s ^ (typeof salt === 'string' ? hashString(salt) : salt * 2654435761)) >>> 0);
  }
}

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Aleatorio global no determinista (para efectos que no importan). */
export const fx = new Rng((Date.now() ^ 0x5bd1e995) >>> 0);
