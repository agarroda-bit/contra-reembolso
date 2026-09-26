// Voces sintetizadas por formantes: gritos de ánimo, coros y jingles de las emisoras.
// Nada de grabaciones: todo sale de una sierra filtrada como un tracto vocal.
import { spec, type Seg, type PitchPt, type Spec } from './render';
import { mtof } from './theory';

export type ChantName =
  | 'eh' | 'dale' | 'yeh' | 'prra' | 'uh' | 'wepa'
  | 'hey' | 'ah' | 'oh'
  | 'ole' | 'ay' | 'arsa' | 'esoes' | 'toma';

interface ChantDef {
  segs: Seg[];
  pitch: PitchPt[];
  voices: number;
  fscale?: number;
  breath?: number;
  vib?: number;
}

/** Gritos (no afinados: el tono se desliza, así no chocan con la armonía). */
const CHANTS: Record<ChantName, ChantDef> = {
  eh: { segs: [['e', 0.34]], pitch: [[0, 190], [0.07, 245], [0.34, 175]], voices: 4, breath: 0.25 },
  dale: { segs: [['d', 0.04], ['a', 0.15], ['l', 0.05], ['e', 0.22]], pitch: [[0, 205], [0.16, 240], [0.46, 165]], voices: 1, breath: 0.18 },
  yeh: { segs: [['y', 0.07], ['e', 0.32]], pitch: [[0, 175], [0.12, 235], [0.39, 160]], voices: 2, breath: 0.2 },
  prra: { segs: [['p', 0.05], ['R', 0.3], ['a', 0.2]], pitch: [[0, 230], [0.3, 215], [0.55, 150]], voices: 1, breath: 0.15 },
  uh: { segs: [['u', 0.3]], pitch: [[0, 150], [0.3, 118]], voices: 3, breath: 0.2 },
  wepa: { segs: [['w', 0.06], ['e', 0.14], ['p', 0.06], ['a', 0.24]], pitch: [[0, 210], [0.18, 260], [0.5, 190]], voices: 2, breath: 0.2 },
  hey: { segs: [['h', 0.05], ['e', 0.16], ['i', 0.09]], pitch: [[0, 261.6]], voices: 1, fscale: 1.16, breath: 0.12 },
  ah: { segs: [['a', 0.42]], pitch: [[0, 261.6]], voices: 1, fscale: 1.16, breath: 0.06, vib: 0.08 },
  oh: { segs: [['o', 0.42]], pitch: [[0, 261.6]], voices: 1, fscale: 1.16, breath: 0.06, vib: 0.08 },
  ole: { segs: [['o', 0.16], ['l', 0.06], ['e', 0.36]], pitch: [[0, 185], [0.15, 195], [0.25, 285], [0.58, 225]], voices: 5, breath: 0.2 },
  ay: { segs: [['a', 0.24], ['i', 0.14]], pitch: [[0, 250], [0.12, 300], [0.38, 215]], voices: 1, breath: 0.2, vib: 0.2 },
  arsa: { segs: [['a', 0.13], ['r', 0.03], ['s', 0.08], ['a', 0.24]], pitch: [[0, 225], [0.16, 265], [0.48, 185]], voices: 1, breath: 0.2 },
  esoes: { segs: [['e', 0.09], ['s', 0.07], ['o', 0.13], ['_', 0.03], ['e', 0.09], ['s', 0.13]], pitch: [[0, 215], [0.2, 255], [0.54, 205]], voices: 1, breath: 0.18 },
  toma: { segs: [['t', 0.05], ['o', 0.15], ['m', 0.07], ['a', 0.25]], pitch: [[0, 220], [0.15, 250], [0.52, 175]], voices: 3, breath: 0.2 },
};

export function chantKey(name: ChantName) {
  return 'chant:' + name;
}

/** Encargo para generar un grito. */
export function chantSpec(sr: number, name: ChantName): Spec {
  const d = CHANTS[name];
  return spec(chantKey(name), 'renderChoir', sr, d.segs, d.pitch, d.voices, { fscale: d.fscale, breath: d.breath, vib: d.vib ?? 0.05, mix: 0.35 });
}

/** Frecuencia base de los "chops" afinados (hey/ah/oh): do central. */
export const CHOP_BASE = 60;

/**
 * Coro cantado sobre notas: sílabas + notas MIDI. Devuelve la clave de caché.
 * Cada sílaba es una lista de segmentos; la nota se aplica a toda la sílaba.
 */
export function sungSpec(sr: number, key: string, syllables: Seg[][], notes: number[], voices: number, o: { fscale?: number; vib?: number } = {}): Spec {
  const segs: Seg[] = [];
  const pitch: PitchPt[] = [];
  let t = 0;
  syllables.forEach((syl, i) => {
    const f = mtof(notes[Math.min(i, notes.length - 1)]);
    const dur = syl.reduce((a, s) => a + s[1], 0);
    // pequeño portamento entre notas
    pitch.push([t + 0.02, f]);
    pitch.push([t + dur - 0.03, f]);
    segs.push(...syl);
    t += dur;
  });
  return spec(key, 'renderChoir', sr, segs, pitch, voices, { fscale: o.fscale ?? 1.05, breath: 0.08, vib: o.vib ?? 0.12, mix: 0.5, spread: 10 });
}

/**
 * Quejío flamenco: un "¡aaay!" largo con melisma. `line` = [nota MIDI, segundos].
 */
export function quejioSpec(sr: number, key: string, line: [number, number][]): Spec {
  const pitch: PitchPt[] = [];
  let t = 0;
  for (const [m, d] of line) {
    pitch.push([t + 0.04, mtof(m)]);
    pitch.push([t + d - 0.03, mtof(m)]);
    t += d;
  }
  const segs: Seg[] = [['h', 0.05], ['a', t - 0.4], ['i', 0.35]];
  return spec(key, 'renderChoir', sr, segs, pitch, 1, { fscale: 1, breath: 0.22, vib: 0.3, vibRate: 5.8 });
}
