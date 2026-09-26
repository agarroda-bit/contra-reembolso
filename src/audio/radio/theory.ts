// Teoría musical mínima para la radio: azar con semilla, notas, escalas, acordes y melodías.

/** Generador pseudoaleatorio con semilla (mulberry32). */
export type Rng = () => number;
export function makeRng(seed: number): Rng {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = <T>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length) % arr.length];
export const chance = (r: Rng, p: number) => r() < p;
export const rand = (r: Rng, a: number, b: number) => a + (b - a) * r();
export const irand = (r: Rng, a: number, b: number) => Math.floor(a + (b - a + 1) * r());

/** Nota MIDI → hercios. */
export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export type Quality = 'm' | 'M' | '7' | 'm7' | 'M7' | 'sus4' | 'sus2' | 'add9' | 'm9';

/** Acorde relativo a la tónica de la canción. */
export interface Chord {
  root: number; // semitonos sobre la tónica (0..11)
  q: Quality;
}

const INTERVALS: Record<Quality, number[]> = {
  m: [0, 3, 7],
  M: [0, 4, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  M7: [0, 4, 7, 11],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  add9: [0, 4, 7, 14],
  m9: [0, 3, 7, 10, 14],
};

export const chordIntervals = (q: Quality) => INTERVALS[q];
export const isMinor = (q: Quality) => q === 'm' || q === 'm7' || q === 'm9';

/** Clases de altura (0..11) del acorde en la tonalidad `key`. */
export function chordPcs(key: number, c: Chord): number[] {
  return INTERVALS[c.q].map((i) => (key + c.root + i) % 12);
}

/** Parse "0m 8M 3M 10M" → acordes. */
export function prog(s: string): Chord[] {
  return s
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const m = /^(\d+)(.*)$/.exec(tok)!;
      return { root: Number(m[1]) % 12, q: (m[2] || 'M') as Quality };
    });
}

export const MINOR = [0, 2, 3, 5, 7, 8, 10];
export const HARM_MINOR = [0, 2, 3, 5, 7, 8, 11];
export const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/**
 * Escala para melodías sobre un acorde en tonalidad menor: si el acorde es el V mayor
 * (dominante), sube la séptima (sensible), que es lo que da el sabor flamenco/latino.
 */
export function scaleFor(key: number, c: Chord): number[] {
  const base = c.root === 7 && !isMinor(c.q) ? HARM_MINOR : MINOR;
  return base.map((i) => (key + i) % 12);
}

/** Nota MIDI de la escala más cercana a `m`. */
export function snapToPcs(m: number, pcs: number[]): number {
  let best = m, bd = 99;
  for (let d = 0; d <= 6; d++) {
    for (const s of d === 0 ? [0] : [-d, d]) {
      const n = m + s;
      if (pcs.includes(((n % 12) + 12) % 12) && Math.abs(s) < bd) {
        bd = Math.abs(s);
        best = n;
      }
    }
    if (bd < 99) break;
  }
  return best;
}

/** Avanza `steps` grados de escala desde `m` (que debe estar en la escala). */
export function scaleStep(m: number, steps: number, pcs: number[]): number {
  let n = m;
  const dir = Math.sign(steps);
  for (let i = 0; i < Math.abs(steps); i++) {
    do n += dir;
    while (!pcs.includes(((n % 12) + 12) % 12));
  }
  return n;
}

/**
 * Voicing cerrado de un acorde cerca de `center` (para teclados, pads y stabs).
 * Prueba todas las inversiones y, si hay acorde previo, elige la que menos se mueve.
 */
export function voiceChord(key: number, c: Chord, center: number, count = 4, prev?: number[]): number[] {
  const pcs = chordPcs(key, c).slice(0, Math.max(3, Math.min(count, 4)));
  let best: number[] = [], bestCost = Infinity;
  for (let inv = 0; inv < pcs.length; inv++) {
    for (const base of [center - 12, center]) {
      // primera nota: la clase pcs[inv] en la octava que empieza en `base - 5`
      let n = base - 5 + ((pcs[inv] - (base - 5)) % 12 + 12) % 12;
      const v = [n];
      for (let k = 1; k < count; k++) {
        const pc = pcs[(inv + k) % pcs.length];
        n = n + 1 + ((pc - (n + 1)) % 12 + 12) % 12;
        v.push(n);
      }
      const mid = (v[0] + v[v.length - 1]) / 2;
      let cst = Math.abs(mid - center) * 1.2;
      if (prev && prev.length) cst += cost(v, prev) * 0.6;
      if (cst < bestCost) { bestCost = cst; best = v; }
    }
  }
  return best;
}
function cost(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - (b[i] ?? b[b.length - 1]));
  return s;
}

/** Voicing de guitarra tipo cejilla (grave → agudo), sin pasar de A4 arriba. */
export function guitarVoicing(key: number, c: Chord): number[] {
  const r = 40 + ((((key + c.root) % 12) - 4 + 12) % 12); // fundamental entre E2 (40) y D#3 (51)
  const third = isMinor(c.q) ? 15 : 16;
  let v: number[];
  switch (c.q) {
    case '7': v = [r, r + 7, r + 10, r + 16, r + 19, r + 24]; break;
    case 'm7': v = [r, r + 7, r + 10, r + 15, r + 19, r + 24]; break;
    case 'M7': v = [r, r + 7, r + 11, r + 16, r + 19, r + 24]; break;
    case 'sus4': v = [r, r + 7, r + 12, r + 17, r + 19, r + 24]; break;
    case 'sus2': v = [r, r + 7, r + 12, r + 14, r + 19, r + 24]; break;
    default: v = [r, r + 7, r + 12, r + third, r + 19, r + 24];
  }
  return v.filter((m) => m <= 70);
}

/** Una nota de un motivo melódico (en semicorcheas). */
export interface MotifNote {
  step: number; // posición dentro del motivo (0..31 para 2 compases)
  len: number; // duración en semicorcheas
  contour: number; // grados de escala respecto al ancla
  accent: number; // 0..1
}

/** Ritmos de un compás (semicorcheas, duración) para ganchos melódicos. */
const HOOK_RHYTHMS: [number, number][][] = [
  [[0, 3], [3, 3], [6, 2], [8, 2], [10, 2], [12, 4]],
  [[0, 2], [2, 2], [4, 3], [7, 3], [10, 2], [12, 2], [14, 2]],
  [[2, 2], [4, 2], [6, 3], [9, 3], [12, 4]],
  [[0, 3], [3, 3], [6, 4], [10, 2], [12, 2], [14, 2]],
  [[0, 4], [6, 2], [8, 3], [11, 3], [14, 2]],
  [[0, 2], [3, 3], [6, 2], [8, 2], [11, 2], [13, 3]],
];

/**
 * Motivo de 2 compases: ritmo sincopado + contorno por grados. La segunda mitad
 * responde a la primera (pregunta-respuesta) y termina en nota larga.
 */
export function makeMotif(r: Rng): MotifNote[] {
  const a = pick(r, HOOK_RHYTHMS);
  const b = chance(r, 0.5) ? a : pick(r, HOOK_RHYTHMS);
  const notes: MotifNote[] = [];
  let c = 0;
  a.forEach(([s, l], i) => {
    if (i > 0) c += pick(r, [-1, -1, 1, 1, 0, 2, -2]);
    c = Math.max(-3, Math.min(4, c));
    notes.push({ step: s, len: l, contour: c, accent: s % 4 === 0 ? 1 : 0.7 });
  });
  // respuesta: empieza donde acabó la pregunta y resuelve hacia 0
  b.forEach(([s, l], i) => {
    const last = i === b.length - 1;
    if (last) c = pick(r, [0, 0, 2, -1]);
    else if (i > 0) c += pick(r, [-1, -1, 1, 0, -2]);
    c = Math.max(-3, Math.min(4, c));
    notes.push({ step: 16 + s, len: last ? Math.max(l, 16 - s) : l, contour: c, accent: s % 4 === 0 ? 1 : 0.7 });
  });
  return notes;
}

/** Variación de un motivo: cambia algunos contornos y quita o añade alguna nota. */
export function varyMotif(r: Rng, m: MotifNote[]): MotifNote[] {
  const out = m.map((n) => ({ ...n }));
  for (const n of out) if (n.step >= 16 && chance(r, 0.4)) n.contour += pick(r, [-1, 1, 2]);
  if (out.length > 5 && chance(r, 0.5)) out.splice(1 + Math.floor(r() * (out.length - 2)), 1);
  return out;
}

/**
 * Velocidad de reproducción para afinar una muestra de percusión (tono base `baseMidi`)
 * a la nota más cercana de la tonalidad entre los intervalos `targets` (por defecto tónica o quinta).
 */
export function tuneRate(baseMidi: number, key: number, targets: number[] = [0, 7]): number {
  let best = 0, bd = 99;
  for (const iv of targets) {
    const pc = (key + iv) % 12;
    let d = (((pc - baseMidi) % 12) + 12) % 12;
    if (d > 6) d -= 12;
    if (Math.abs(d) < bd) { bd = Math.abs(d); best = d; }
  }
  return Math.pow(2, best / 12);
}
/** Hercios → nota MIDI (con decimales). */
export const ftom = (f: number) => 69 + 12 * Math.log2(f / 440);
