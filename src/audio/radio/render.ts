// Síntesis "en diferido" en JavaScript: genera muestras (Float32Array) una sola vez y se
// reutilizan con un AudioBufferSourceNode por golpe. Así cada nota cuesta 2 nodos.
// Aquí están: batería, cajón y palmas, cuerdas punteadas (Karplus-Strong),
// voces por formantes (¡eh!, ¡olé!, coros, el locutor balbuceando) y la respuesta de la reverb.

const TAU = Math.PI * 2;

// ─────────── utilidades ───────────

let seedN = 22222;
/** Ruido blanco rápido (-1..1). */
function nz(): number {
  seedN = (seedN * 1664525 + 1013904223) >>> 0;
  return seedN / 2147483648 - 1;
}

/** Filtro biquad (fórmulas RBJ) para procesar muestras en JS. */
export class Biquad {
  b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0;
  x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  constructor(private sr: number) {}
  private set(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number) {
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  lp(f: number, q = 0.707) {
    const w = (TAU * Math.min(f, this.sr * 0.45)) / this.sr, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    return this.set((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al);
  }
  hp(f: number, q = 0.707) {
    const w = (TAU * Math.min(f, this.sr * 0.45)) / this.sr, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    return this.set((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al);
  }
  bp(f: number, q = 1) {
    const w = (TAU * Math.min(f, this.sr * 0.45)) / this.sr, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    return this.set(al, 0, -al, 1 + al, -2 * c, 1 - al);
  }
  peak(f: number, q: number, db: number) {
    const A = Math.pow(10, db / 40);
    const w = (TAU * Math.min(f, this.sr * 0.45)) / this.sr, c = Math.cos(w), al = Math.sin(w) / (2 * q);
    return this.set(1 + al * A, -2 * c, 1 - al * A, 1 + al / A, -2 * c, 1 - al / A);
  }
  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
  process(buf: Float32Array) {
    for (let i = 0; i < buf.length; i++) buf[i] = this.run(buf[i]);
    return buf;
  }
}

function fadeEdges(buf: Float32Array, sr: number, fadeOut = 0.02, fadeIn = 0) {
  const nOut = Math.min(buf.length, Math.floor(fadeOut * sr));
  for (let i = 0; i < nOut; i++) buf[buf.length - 1 - i] *= i / nOut;
  const nIn = Math.min(buf.length, Math.floor(fadeIn * sr));
  for (let i = 0; i < nIn; i++) buf[i] *= i / nIn;
  return buf;
}

export function normalize(buf: Float32Array | Float32Array[], peak = 0.9) {
  const arr = Array.isArray(buf) ? buf : [buf];
  let m = 1e-9;
  for (const b of arr) for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(b[i]));
  const k = peak / m;
  for (const b of arr) for (let i = 0; i < b.length; i++) b[i] *= k;
  return buf;
}

// ─────────── batería ───────────

export interface KickOpts { f0: number; f1: number; pd: number; ad: number; len: number; click: number; drive: number }

/** Bombo: seno con caída de tono rápida + clic + saturación suave. */
export function kick(sr: number, o: KickOpts): Float32Array {
  const n = Math.floor(o.len * sr), out = new Float32Array(n);
  const lp = new Biquad(sr).lp(4000, 0.7);
  const td = Math.tanh(o.drive);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = o.f1 + (o.f0 - o.f1) * Math.exp(-t / o.pd);
    ph += (TAU * f) / sr;
    const env = Math.min(1, t / 0.0015) * Math.exp(-t / o.ad);
    let s = Math.sin(ph) * env;
    s += lp.run(nz()) * o.click * Math.exp(-t / 0.003);
    out[i] = Math.tanh(s * o.drive) / td;
  }
  return normalize(fadeEdges(out, sr, 0.03), 0.95) as Float32Array;
}

export interface SnareOpts { tone: number; td: number; nd: number; hp: number; lp: number; len: number; toneAmt: number; noiseAmt: number }

/** Caja: cuerpo tonal + ruido filtrado (bordonero). */
export function snare(sr: number, o: SnareOpts): Float32Array {
  const n = Math.floor(o.len * sr), out = new Float32Array(n);
  const hp = new Biquad(sr).hp(o.hp, 0.7), lp = new Biquad(sr).lp(o.lp, 0.7);
  let ph1 = 0, ph2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = o.tone * (1 + 0.6 * Math.exp(-t / 0.008));
    ph1 += (TAU * f) / sr;
    ph2 += (TAU * f * 1.62) / sr;
    const tone = (Math.sin(ph1) + 0.45 * Math.sin(ph2)) * Math.exp(-t / o.td) * o.toneAmt;
    const noise = lp.run(hp.run(nz())) * Math.exp(-t / o.nd) * o.noiseAmt;
    out[i] = Math.tanh((tone + noise) * Math.min(1, t / 0.0008) * 1.4);
  }
  return normalize(fadeEdges(out, sr, 0.02), 0.9) as Float32Array;
}

/** Palmada de caja de ritmos: 4 ráfagas seguidas + cola. */
export function clap(sr: number, bpF = 1150, tail = 0.13, len = 0.45): Float32Array {
  const n = Math.floor(len * sr), out = new Float32Array(n);
  const bp = new Biquad(sr).bp(bpF, 1.1), hp = new Biquad(sr).hp(500, 0.7);
  const starts = [0, 0.0105, 0.0205, 0.031];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let env = 0;
    for (const s of starts) if (t >= s) env = Math.max(env, Math.exp(-(t - s) / 0.0038));
    if (t >= 0.031) env = Math.max(env, 0.6 * Math.exp(-(t - 0.031) / tail));
    out[i] = hp.run(bp.run(nz())) * env;
  }
  return normalize(fadeEdges(out, sr, 0.03), 0.9) as Float32Array;
}

const HAT_F = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];
/** Charles metálico estilo caja de ritmos clásica (6 cuadradas desafinadas + filtros). */
export function hat(sr: number, open: boolean, tone = 1): Float32Array {
  const len = open ? 0.55 : 0.09;
  const n = Math.floor(len * sr), out = new Float32Array(n);
  const bp = new Biquad(sr).bp(9500 * tone, 0.9), hp = new Biquad(sr).hp(7000 * tone, 0.7), hp2 = new Biquad(sr).hp(8000, 0.7);
  const ph = HAT_F.map(() => Math.random());
  const inc = HAT_F.map((f) => (f * 1.9 * tone) / sr);
  const dec = open ? 0.17 : 0.016;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let m = 0;
    for (let k = 0; k < 6; k++) {
      let p = ph[k] + inc[k];
      if (p >= 1) p -= 1;
      ph[k] = p;
      m += p < 0.5 ? 1 : -1;
    }
    const env = Math.min(1, t / 0.0008) * Math.exp(-t / dec);
    out[i] = (hp.run(bp.run(m / 6)) + hp2.run(nz()) * 0.35) * env;
  }
  return normalize(fadeEdges(out, sr, open ? 0.08 : 0.01), 0.8) as Float32Array;
}

/** Maraca/shaker. */
export function shaker(sr: number): Float32Array {
  const n = Math.floor(0.12 * sr), out = new Float32Array(n);
  const bp = new Biquad(sr).bp(6500, 1.1);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = t < 0.012 ? t / 0.012 : Math.exp(-(t - 0.012) / 0.035);
    out[i] = bp.run(nz()) * env;
  }
  return normalize(fadeEdges(out, sr, 0.02), 0.8) as Float32Array;
}

/** Platillo (crash) largo. */
export function crash(sr: number): Float32Array {
  const n = Math.floor(1.8 * sr), out = new Float32Array(n);
  const hp = new Biquad(sr).hp(4200, 0.6), bp = new Biquad(sr).bp(7000, 0.5);
  const ph = HAT_F.map(() => Math.random());
  const inc = HAT_F.map((f) => (f * 2.7) / sr);
  let lpS = 0;
  const kd = Math.exp(-1 / (0.55 * sr));
  let env = 1;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let k = 0; k < 6; k++) {
      let p = ph[k] + inc[k];
      if (p >= 1) p -= 1;
      ph[k] = p;
      m += p < 0.5 ? 1 : -1;
    }
    const x = hp.run(nz() * 0.8 + bp.run(m / 6) * 0.6);
    // se oscurece al apagarse
    const a = 0.25 + 0.75 * env;
    lpS += a * (x - lpS);
    env *= kd;
    out[i] = lpS * Math.min(1, i / (0.002 * sr)) * env;
  }
  return normalize(fadeEdges(out, sr, 0.3), 0.7) as Float32Array;
}

/** Rimshot / clave corto. */
export function rim(sr: number, f = 1750): Float32Array {
  const n = Math.floor(0.07 * sr), out = new Float32Array(n);
  const bp = new Biquad(sr).bp(3200, 2);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const s = (Math.sin(TAU * f * t) + 0.6 * Math.sin(TAU * f * 0.31 * t)) * Math.exp(-t / 0.011) + bp.run(nz()) * Math.exp(-t / 0.003) * 0.8;
    out[i] = s;
  }
  return normalize(fadeEdges(out, sr, 0.01), 0.85) as Float32Array;
}

/** Timbal/tom con parciales inarmónicos y golpe de baqueta. */
export function tom(sr: number, f: number, dec = 0.22, metal = 0.3): Float32Array {
  const len = dec * 2.2 + 0.05;
  const n = Math.floor(len * sr), out = new Float32Array(n);
  const hp = new Biquad(sr).hp(2500, 0.7);
  let p1 = 0, p2 = 0, p3 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const ff = f * (1 + 0.12 * Math.exp(-t / 0.025));
    p1 += (TAU * ff) / sr;
    p2 += (TAU * ff * 1.51) / sr;
    p3 += (TAU * ff * 2.33) / sr;
    const s =
      Math.sin(p1) * Math.exp(-t / dec) +
      metal * Math.sin(p2) * Math.exp(-t / (dec * 0.6)) +
      metal * 0.6 * Math.sin(p3) * Math.exp(-t / (dec * 0.35)) +
      hp.run(nz()) * Math.exp(-t / 0.004) * 0.7;
    out[i] = s * Math.min(1, t / 0.001);
  }
  return normalize(fadeEdges(out, sr, 0.04), 0.85) as Float32Array;
}

/** Cajón: grave (el centro de la tapa). */
export function cajonBass(sr: number): Float32Array {
  const n = Math.floor(0.4 * sr), out = new Float32Array(n);
  const lp = new Biquad(sr).lp(350, 0.8), body = new Biquad(sr).peak(120, 2, 6);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 68 + 45 * Math.exp(-t / 0.012);
    ph += (TAU * f) / sr;
    const s = Math.sin(ph) * Math.exp(-t / 0.11) + lp.run(nz()) * Math.exp(-t / 0.018) * 0.9;
    out[i] = body.run(s) * Math.min(1, t / 0.001);
  }
  return normalize(fadeEdges(out, sr, 0.05), 0.9) as Float32Array;
}

/** Cajón: agudo (el borde, con bordones). */
export function cajonSlap(sr: number): Float32Array {
  const n = Math.floor(0.28 * sr), out = new Float32Array(n);
  const bp = new Biquad(sr).bp(2100, 0.8), hp = new Biquad(sr).hp(3500, 0.7);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const s =
      bp.run(nz()) * Math.exp(-t / 0.03) +
      hp.run(nz()) * Math.exp(-t / 0.085) * 0.4 +
      Math.sin(TAU * 290 * t) * Math.exp(-t / 0.025) * 0.5;
    out[i] = s * Math.min(1, t / 0.0006);
  }
  return normalize(fadeEdges(out, sr, 0.04), 0.9) as Float32Array;
}

/** Palmas flamencas: claras (secas y brillantes) o sordas (huecas, graves). */
export function palma(sr: number, clara: boolean, variant = 0): Float32Array {
  const n = Math.floor(0.14 * sr), out = new Float32Array(n);
  const f = clara ? 2300 + variant * 260 : 700 + variant * 90;
  const bp = new Biquad(sr).bp(f, clara ? 1.3 : 0.9);
  const res = new Biquad(sr).peak(clara ? 1100 + variant * 120 : 420, 4, clara ? 5 : 8);
  const lp = new Biquad(sr).lp(clara ? 9000 : 1500, 0.7);
  const second = 0.0012 + variant * 0.0006;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let env = Math.exp(-t / (clara ? 0.011 : 0.018));
    if (t > second) env = Math.max(env, 0.8 * Math.exp(-(t - second) / (clara ? 0.014 : 0.022)));
    out[i] = lp.run(res.run(bp.run(nz()))) * env;
  }
  return normalize(fadeEdges(out, sr, 0.03), 0.85) as Float32Array;
}

/** Golpe en la tapa de la guitarra (en los rasgueos de rumba). */
export function golpe(sr: number): Float32Array {
  const n = Math.floor(0.12 * sr), out = new Float32Array(n);
  const bp = new Biquad(sr).bp(900, 1);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    out[i] = Math.sin(TAU * 125 * t) * Math.exp(-t / 0.028) * 0.8 + bp.run(nz()) * Math.exp(-t / 0.008);
  }
  return normalize(fadeEdges(out, sr, 0.02), 0.8) as Float32Array;
}

/** Chasquido de dedos. */
export function snap(sr: number): Float32Array {
  const n = Math.floor(0.08 * sr), out = new Float32Array(n);
  const bp = new Biquad(sr).bp(2900, 3.5);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    out[i] = bp.run(nz()) * Math.exp(-t / 0.011) + Math.sin(TAU * 2100 * t) * Math.exp(-t / 0.006) * 0.3;
  }
  return normalize(fadeEdges(out, sr, 0.01), 0.85) as Float32Array;
}

/** Respuesta al impulso para la reverb (estéreo, se va oscureciendo). */
export function impulse(sr: number, secs = 1.6, predelay = 0.012): Float32Array[] {
  const n = Math.floor(secs * sr);
  const chans: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    const out = new Float32Array(n);
    let lpS = 0;
    const pd = Math.floor(predelay * sr);
    for (let i = pd; i < n; i++) {
      const t = (i - pd) / sr;
      const a = 0.12 + 0.8 * Math.exp(-t / 0.35);
      lpS += a * (nz() - lpS);
      out[i] = lpS * Math.exp((-t * 6.9) / secs) * Math.min(1, t / 0.004);
    }
    // primeras reflexiones
    for (const [dt, g] of [[0.011, 0.5], [0.019, 0.35], [0.027, 0.3], [0.041, 0.22]]) {
      const k = pd + Math.floor((dt + c * 0.0017) * sr);
      if (k < n) out[k] += g * (c ? -1 : 1);
    }
    chans.push(out);
  }
  return chans;
}

// ─────────── cuerdas punteadas (Karplus-Strong) ───────────

export interface PluckOpts {
  t60: number; // segundos hasta -60 dB
  bright: number; // 0..1 (brillo de la púa/uña)
  len: number; // duración renderizada (s)
  mute?: boolean; // apagada con la palma (golpe de rumba)
  pos?: number; // posición de pulsación 0..0.5
  body?: number; // resonancia de caja de guitarra 0..1
}

/** Cuerda punteada con afinación fina (paso todo fraccional) y caja de resonancia. */
export function pluck(sr: number, freq: number, o: PluckOpts): Float32Array {
  const total = Math.floor(o.len * sr);
  const out = new Float32Array(total);
  const damp = o.mute ? 0.72 : 0.5; // más peso al pasado = más amortiguado
  // retardo total del lazo = L + d (paso todo) + retardo del promediado (= damp muestras)
  const loopDelay = sr / freq - damp;
  let L = Math.floor(loopDelay);
  let d = loopDelay - L;
  if (d < 0.25) { L -= 1; d += 1; }
  L = Math.max(2, L);
  const C = (1 - d) / (1 + d);
  const line = new Float32Array(L);
  // excitación: ruido suavizado según el brillo
  let lpS = 0;
  const a = 0.08 + 0.9 * o.bright * o.bright;
  for (let i = 0; i < L; i++) {
    lpS += a * (nz() - lpS);
    line[i] = lpS;
  }
  // posición de pulsación (filtro peine): quita armónicos múltiplos de 1/pos
  const P = Math.max(1, Math.floor((o.pos ?? 0.18) * L));
  const exc = line.slice();
  for (let i = 0; i < L; i++) line[i] = exc[i] - 0.9 * exc[(i + P) % L];
  // quitar continua
  let mean = 0;
  for (let i = 0; i < L; i++) mean += line[i];
  mean /= L;
  for (let i = 0; i < L; i++) line[i] -= mean;
  const g = Math.pow(10, -3 / (o.t60 * freq));
  let idx = 0, prev = 0, apx = 0, apy = 0;
  for (let n = 0; n < total; n++) {
    const y = line[idx];
    const avg = (1 - damp) * y + damp * prev;
    prev = y;
    const ap = C * avg + apx - C * apy;
    apx = avg;
    apy = ap;
    line[idx] = ap * g;
    out[n] = y;
    if (++idx >= L) idx = 0;
  }
  // caja de guitarra: resonancias graves y un pelín de ataque de uña
  const body = o.body ?? 0.6;
  if (body > 0) {
    const r1 = new Biquad(sr).bp(105, 2.5), r2 = new Biquad(sr).bp(215, 3), r3 = new Biquad(sr).bp(430, 3);
    const lp = new Biquad(sr).lp(o.mute ? 2600 : 5200, 0.7), hp = new Biquad(sr).hp(2500, 0.7);
    for (let n = 0; n < total; n++) {
      const x = out[n];
      const t = n / sr;
      const nail = hp.run(nz()) * Math.exp(-t / 0.003) * 0.25 * o.bright;
      out[n] = lp.run(x + body * (0.9 * r1.run(x) + 0.6 * r2.run(x) + 0.35 * r3.run(x)) + nail);
    }
  }
  if (o.mute) for (let n = 0; n < total; n++) out[n] *= Math.exp(-n / sr / 0.045);
  return normalize(fadeEdges(out, sr, Math.min(0.06, o.len * 0.3)), 0.8) as Float32Array;
}

// ─────────── voces por formantes (sin voces reales) ───────────

interface Ph {
  f: [number, number, number];
  v: number; // sonoridad (cuerdas vocales)
  n: number; // fricación (ruido)
  nf?: number; // centro del ruido
  nq?: number;
  trill?: boolean;
  stop?: boolean; // oclusiva: silencio + explosión
}

const PH: Record<string, Ph> = {
  a: { f: [760, 1250, 2600], v: 1, n: 0 },
  e: { f: [470, 1900, 2550], v: 1, n: 0 },
  i: { f: [300, 2250, 2950], v: 0.9, n: 0 },
  o: { f: [500, 900, 2500], v: 1, n: 0 },
  u: { f: [340, 760, 2400], v: 0.85, n: 0 },
  l: { f: [380, 1250, 2700], v: 0.5, n: 0 },
  m: { f: [270, 1050, 2300], v: 0.32, n: 0 },
  n: { f: [270, 1600, 2600], v: 0.32, n: 0 },
  r: { f: [450, 1400, 2500], v: 0.22, n: 0 },
  R: { f: [450, 1400, 2500], v: 0.7, n: 0, trill: true },
  y: { f: [290, 2200, 3000], v: 0.7, n: 0.03, nf: 3200, nq: 1 },
  w: { f: [320, 740, 2400], v: 0.7, n: 0 },
  d: { f: [350, 1700, 2600], v: 0.2, n: 0 },
  b: { f: [300, 800, 2200], v: 0.16, n: 0 },
  g: { f: [300, 1900, 2400], v: 0.16, n: 0 },
  s: { f: [400, 1800, 2600], v: 0, n: 0.3, nf: 6200, nq: 1.3 },
  x: { f: [400, 1400, 2600], v: 0, n: 0.28, nf: 1800, nq: 1.6 },
  f: { f: [400, 1400, 2600], v: 0, n: 0.1, nf: 5000, nq: 0.6 },
  h: { f: [650, 1400, 2600], v: 0, n: 0.1, nf: 1500, nq: 0.5 },
  p: { f: [400, 900, 2400], v: 0, n: 0.35, nf: 900, nq: 0.5, stop: true },
  t: { f: [400, 1700, 2600], v: 0, n: 0.4, nf: 4200, nq: 1, stop: true },
  k: { f: [400, 1800, 2500], v: 0, n: 0.45, nf: 2100, nq: 1.3, stop: true },
  _: { f: [500, 1500, 2500], v: 0, n: 0 },
};

/** Segmento: fonema y duración en segundos. */
export type Seg = [string, number];
/** Punto del contorno de tono: [segundos, hercios]. */
export type PitchPt = [number, number];

export interface VoiceOpts {
  fscale?: number; // 1 hombre, 1.15 mujer, 1.3 niño
  vib?: number; // vibrato en semitonos
  vibRate?: number;
  breath?: number; // aire 0..1
  detune?: number; // cents
  delay?: number; // s
  gain?: number;
}

/** Expande oclusivas en cierre + explosión. */
function expand(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const [p, d] of segs) {
    const ph = PH[p] ?? PH._;
    if (ph.stop) {
      out.push(['_', Math.max(0.01, d - 0.018)]);
      out.push([p, 0.018]);
    } else out.push([p, d]);
  }
  return out;
}

/** Sintetiza una voz sobre `outs` (suma). Fuente diente de sierra + formantes en cascada. */
function renderVoiceInto(sr: number, segs: Seg[], pitch: PitchPt[], o: VoiceOpts, outs: Float32Array[], pans: number[]) {
  const s2 = expand(segs);
  const fs = o.fscale ?? 1;
  const detune = Math.pow(2, (o.detune ?? 0) / 1200);
  const vib = o.vib ?? 0, vibRate = o.vibRate ?? 5.5, breath = o.breath ?? 0.08, gain = o.gain ?? 1;
  const start = Math.floor((o.delay ?? 0) * sr);
  // segmentos precalculados (nada de buscar en objetos por muestra)
  const nSeg = s2.length;
  const segEnd = new Float64Array(nSeg), segBeg = new Float64Array(nSeg);
  const phs: Ph[] = [];
  let acc = 0;
  for (let k = 0; k < nSeg; k++) {
    segBeg[k] = acc;
    acc += s2[k][1];
    segEnd[k] = acc;
    phs.push(PH[s2[k][0]] ?? PH._);
  }
  const total = Math.floor(acc * sr);
  const BLOCK = 32;
  const kF = 1 - Math.exp(-BLOCK / (0.016 * sr));
  const kA = 1 - Math.exp(-1 / (0.005 * sr));
  let F1 = phs[0].f[0] * fs, F2 = phs[0].f[1] * fs, F3 = phs[0].f[2] * fs;
  const F4 = 3400 * fs;
  let vA = 0, nA = 0, nf = phs[0].nf ?? 3000;
  let a1 = 0, b1 = 0, c1 = 0, a2 = 0, b2 = 0, c2 = 0, a3 = 0, b3 = 0, c3 = 0, a4 = 0, b4 = 0, c4 = 0;
  let y11 = 0, y12 = 0, y21 = 0, y22 = 0, y31 = 0, y32 = 0, y41 = 0, y42 = 0;
  const fric = new Biquad(sr).bp(nf, 1);
  const tilt = new Biquad(sr).lp(3800 * fs, 0.6);
  let seg = 0, phase = Math.random(), pi = 0;
  const vibPh = Math.random() * TAU;
  let dt = 0, targetV = 0, targetN = 0, isStop = false;
  const coef = (f: number, bw: number) => {
    const r = Math.exp((-Math.PI * bw * (1 + f / 4000)) / sr);
    const C = -r * r;
    const B = 2 * r * Math.cos((TAU * f) / sr);
    return [1 - B - C, B, C];
  };
  const nOut = outs.length;
  for (let i = 0; i < total; i++) {
    if (i % BLOCK === 0) {
      // ── cosas lentas: una vez cada 32 muestras ──
      const t = i / sr;
      while (seg < nSeg - 1 && t >= segEnd[seg]) seg++;
      const ph = phs[seg];
      isStop = !!ph.stop;
      F1 += kF * (ph.f[0] * fs - F1);
      F2 += kF * (ph.f[1] * fs - F2);
      F3 += kF * (ph.f[2] * fs - F3);
      const edge = Math.min(1, t / 0.012, (acc - t) / 0.03);
      targetV = ph.v * edge;
      if (ph.trill) targetV *= 0.25 + 0.75 * (0.5 + 0.5 * Math.cos(TAU * 26 * (t - segBeg[seg])));
      targetN = ph.n * edge;
      if (ph.nf && Math.abs(ph.nf - nf) > 1) { nf = ph.nf; fric.bp(nf, ph.nq ?? 1); }
      while (pi < pitch.length - 2 && t >= pitch[pi + 1][0]) pi++;
      const p0 = pitch[pi], p1 = pitch[Math.min(pitch.length - 1, pi + 1)];
      const u = p1[0] > p0[0] ? Math.min(1, Math.max(0, (t - p0[0]) / (p1[0] - p0[0]))) : 0;
      const jit = (Math.random() - 0.5) * 0.008;
      const f0 = p0[1] * Math.pow(p1[1] / p0[1], u) * detune * (1 + jit) * Math.pow(2, (vib * Math.sin(vibPh + TAU * vibRate * t) * Math.min(1, t / 0.25)) / 12);
      dt = f0 / sr;
      let c = coef(F1, 80); a1 = c[0]; b1 = c[1]; c1 = c[2];
      c = coef(F2, 100); a2 = c[0]; b2 = c[1]; c2 = c[2];
      c = coef(F3, 140); a3 = c[0]; b3 = c[1]; c3 = c[2];
      c = coef(F4, 200); a4 = c[0]; b4 = c[1]; c4 = c[2];
    }
    vA += (isStop ? 1 : kA) * (targetV - vA);
    nA += (isStop ? 0.5 : kA) * (targetN - nA);
    // fuente: diente de sierra con polyBLEP
    phase += dt;
    if (phase >= 1) phase -= 1;
    let saw = 2 * phase - 1;
    if (phase < dt) { const x = phase / dt; saw -= x + x - x * x - 1; }
    else if (phase > 1 - dt) { const x = (phase - 1) / dt; saw -= x * x + x + x + 1; }
    let s = vA > 1e-5 ? tilt.run(-saw) * vA + nz() * breath * vA * 0.5 : tilt.run(0);
    // cascada F1..F4
    let y = a1 * s + b1 * y11 + c1 * y12; y12 = y11; y11 = y; s = y;
    y = a2 * s + b2 * y21 + c2 * y22; y22 = y21; y21 = y; s = y;
    y = a3 * s + b3 * y31 + c3 * y32; y32 = y31; y31 = y; s = y;
    y = a4 * s + b4 * y41 + c4 * y42; y42 = y41; y41 = y; s = y;
    if (nA > 1e-4) s += fric.run(nz()) * nA * 3;
    const outS = s * gain;
    const j = start + i;
    for (let ch = 0; ch < nOut; ch++) {
      const oc = outs[ch];
      if (j < oc.length) oc[j] += outS * pans[ch];
    }
  }
}

/** Duración total de unos segmentos. */
export const segsDur = (segs: Seg[]) => segs.reduce((a, s) => a + s[1], 0);

/**
 * Coro: `voices` voces con pequeñas diferencias (tono, retardo, timbre), en estéreo.
 * Devuelve [izquierda, derecha].
 */
export function renderChoir(sr: number, segs: Seg[], pitch: PitchPt[], voices: number, o: VoiceOpts & { spread?: number; mix?: number } = {}): Float32Array[] {
  const dur = segsDur(segs) + 0.08;
  const n = Math.floor(dur * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let v = 0; v < voices; v++) {
    const pan = voices === 1 ? 0 : (v / (voices - 1)) * 2 - 1;
    const female = voices > 1 && (o.mix ?? 0.4) > Math.random();
    renderVoiceInto(sr, segs, pitch, {
      ...o,
      fscale: (o.fscale ?? 1) * (female ? 1.14 : 1) * (0.97 + Math.random() * 0.06),
      detune: (Math.random() - 0.5) * 2 * (o.spread ?? (voices > 1 ? 14 : 0)),
      delay: voices > 1 ? Math.random() * 0.028 : 0,
      vibRate: (o.vibRate ?? 5.5) * (0.9 + Math.random() * 0.2),
      gain: 1 / Math.sqrt(voices),
    }, [L, R], [Math.sqrt(0.5 - pan * 0.4), Math.sqrt(0.5 + pan * 0.4)]);
  }
  const hp = new Biquad(sr).hp(110, 0.7), hp2 = new Biquad(sr).hp(110, 0.7);
  hp.process(L);
  hp2.process(R);
  return normalize([L, R], 0.85) as Float32Array[];
}

const CONS = ['t', 'd', 's', 'n', 'l', 'r', 'k', 'm', 'p', 'b', 't', 's', 'n', 'l', 'k', 'x'];
const VOW = ['a', 'a', 'a', 'e', 'e', 'e', 'o', 'o', 'o', 'i', 'i', 'u'];
const CODA = ['n', 's', 'r', 'l', 's', 'n'];

/**
 * El locutor "hablando" (galimatías con sonido de castellano). base = tono medio (Hz).
 * speed > 1 = más rápido (cuñas de publicidad).
 */
export function renderTalk(sr: number, secs: number, base: number, fscale: number, speed = 1, energy = 1): Float32Array {
  const segs: Seg[] = [];
  const pitch: PitchPt[] = [];
  let t = 0;
  const r = Math.random;
  while (t < secs - 0.3) {
    // una frase de 4-9 sílabas
    const nSyl = 4 + Math.floor(r() * 6);
    const ask = r() < 0.2, excl = !ask && r() < 0.35;
    const t0 = t;
    for (let s = 0; s < nSyl; s++) {
      const stressed = s % 3 === 1 || s === nSyl - 2;
      const k = 1 / speed;
      if (r() < 0.85) {
        const c = CONS[Math.floor(r() * CONS.length)];
        const cd = (c === 's' || c === 'x' ? 0.07 : c === 'r' ? 0.03 : 'ptk'.includes(c) ? 0.05 : 0.05) * k;
        segs.push([c, cd]);
        t += cd;
      }
      const vd = (0.07 + r() * 0.04) * k * (stressed ? 1.45 : 1) * (s === nSyl - 1 ? 1.5 : 1);
      segs.push([VOW[Math.floor(r() * VOW.length)], vd]);
      // tono: declinación a lo largo de la frase, acento en sílabas tónicas
      const prog = s / nSyl;
      let f = base * (1.12 - 0.22 * prog) * (stressed ? 1 + 0.16 * energy : 1);
      if (s === nSyl - 1) f *= ask ? 1.35 : excl ? 1.12 : 0.88;
      pitch.push([t + vd * 0.5, f * (0.97 + r() * 0.06)]);
      t += vd;
      if (r() < 0.18) {
        const cd = 0.05 * k;
        segs.push([CODA[Math.floor(r() * CODA.length)], cd]);
        t += cd;
      }
    }
    if (t - t0 > 0) {
      const pause = 0.1 + r() * 0.16;
      segs.push(['_', pause]);
      t += pause;
    }
  }
  pitch.unshift([0, pitch[0]?.[1] ?? base]);
  const n = Math.floor((t + 0.1) * sr);
  const out = new Float32Array(n);
  renderVoiceInto(sr, segs, pitch, { fscale, vib: 0.05, vibRate: 5, breath: 0.12 }, [out], [1]);
  // sonido de micro de radio: banda recortada y un poco de saturación
  const hp = new Biquad(sr).hp(220, 0.7), lp = new Biquad(sr).lp(4200, 0.7), pk = new Biquad(sr).peak(2400, 1, 4);
  for (let i = 0; i < n; i++) out[i] = pk.run(lp.run(hp.run(out[i])));
  // primero a escala y luego una saturación suave (si no, satura muchísimo y suena a zumbido)
  normalize(out, 0.8);
  const k = Math.tanh(1.4);
  for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * 1.4) / k;
  return normalize(fadeEdges(out, sr, 0.05), 0.8) as Float32Array;
}

// ─────────── registro (para el worker) ───────────

export const RENDER = { kick, snare, clap, hat, shaker, crash, rim, tom, cajonBass, cajonSlap, palma, golpe, snap, impulse, pluck, renderChoir, renderTalk };
export type RenderFn = keyof typeof RENDER;
/** Encargo de renderizado serializable: se puede hacer aquí o en el worker. */
export interface Spec {
  key: string;
  fn: RenderFn;
  args: unknown[];
}
export const spec = (key: string, fn: RenderFn, ...args: unknown[]): Spec => ({ key, fn, args });
export function runSpec(sp: Spec): Float32Array | Float32Array[] {
  return (RENDER[sp.fn] as (...a: unknown[]) => Float32Array | Float32Array[])(...sp.args);
}
