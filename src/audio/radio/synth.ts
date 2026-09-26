// Motor de síntesis en vivo de la radio: canales de mezcla, instrumentos con osciladores
// y reproducción de muestras pre-renderizadas. Cuenta los nodos vivos para vigilar fugas.
import { mtof } from './theory';
import { runSpec, spec, type Spec } from './render';

export interface RadioStats {
  /** Nodos de notas vivos ahora mismo (fuentes + su cadena). */
  live: number;
  /** Fuentes (osciladores/muestras) vivas. */
  sources: number;
  /** Máximo de nodos vivos visto. */
  peak: number;
  /** Total de nodos creados para notas desde el principio. */
  created: number;
  /** Nodos fijos de la mezcla (canales, reverb, efectos). */
  fixed: number;
  /** Muestras en caché y su memoria aproximada (MB). */
  buffers: number;
  bufferMB: number;
  /** Tareas de pre-renderizado hechas y la más lenta (ms): para vigilar tirones. */
  jobs: number;
  jobMaxMs: number;
}

/** Canal de mezcla: ganancia → (efectos) → panorama → destino, con envío a reverb. */
export class Channel {
  readonly input: GainNode;
  readonly pan: StereoPannerNode;
  readonly send: GainNode | null;
  constructor(rs: RadioSynth, dest: AudioNode, o: { gain?: number; pan?: number; reverb?: number; revDest?: AudioNode | null; pre?: AudioNode[] }) {
    const ctx = rs.ctx;
    this.input = ctx.createGain();
    this.input.gain.value = o.gain ?? 1;
    this.pan = ctx.createStereoPanner();
    this.pan.pan.value = o.pan ?? 0;
    let n: AudioNode = this.input;
    for (const p of o.pre ?? []) { n.connect(p); n = p; }
    n.connect(this.pan);
    this.pan.connect(dest);
    rs.stats.fixed += 2 + (o.pre?.length ?? 0);
    if (o.reverb && o.revDest) {
      this.send = ctx.createGain();
      this.send.gain.value = o.reverb;
      this.pan.connect(this.send);
      this.send.connect(o.revDest);
      rs.stats.fixed++;
    } else this.send = null;
  }
}

/** Curva de saturación suave (tanh) para bajos que se oigan en altavoces pequeños. */
export function softClipCurve(drive: number, n = 1024): Float32Array<ArrayBuffer> {
  const c = new Float32Array(new ArrayBuffer(n * 4));
  const k = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * drive) / k;
  }
  return c;
}

type Src = AudioScheduledSourceNode;
type Job = { sp: Spec; cb?: (b: AudioBuffer) => void; cache: boolean };
export type StringVariant = 'open' | 'mute' | 'bright' | 'bass' | 'harp';

export class RadioSynth {
  readonly sr: number;
  readonly noise: AudioBuffer;
  readonly stats: RadioStats = { live: 0, sources: 0, peak: 0, created: 0, fixed: 0, buffers: 0, bufferMB: 0, jobs: 0, jobMaxMs: 0 };
  /** Conjunto de fuentes del que está programando ahora (cada emisora pone el suyo). */
  owner: Set<Src> | null = null;
  /** Caché LRU: el Map conserva el orden de uso (se reinserta al usar). */
  private cache = new Map<string, AudioBuffer>();
  /** Límite de memoria de muestras (MB): se tiran las menos usadas (nunca la batería ni los gritos). */
  maxMB = 36;
  private worker: Worker | null = null;
  private reqId = 0;
  private waiting = new Map<number, Job>();
  private inflight = new Set<string>();
  private mainQueue: Job[] = [];

  constructor(readonly ctx: BaseAudioContext) {
    this.sr = ctx.sampleRate;
    const len = Math.floor(this.sr * 2);
    this.noise = ctx.createBuffer(1, len, this.sr);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  // ─────────── worker (generar muestras sin tirones) ───────────

  /** Arranca el worker que genera muestras. Si el navegador no puede, se hace aquí poco a poco. */
  useWorker() {
    try {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id: number; chans?: Float32Array[]; error?: string }>) => this.fromWorker(e.data);
      w.onerror = () => this.dropWorker();
      this.worker = w;
    } catch {
      this.worker = null;
    }
  }
  private dropWorker() {
    this.worker?.terminate();
    this.worker = null;
    for (const j of this.waiting.values()) this.mainQueue.push(j);
    this.waiting.clear();
  }
  private fromWorker(d: { id: number; chans?: Float32Array[]; error?: string }) {
    const job = this.waiting.get(d.id);
    if (!job) return;
    this.waiting.delete(d.id);
    if (!d.chans) {
      this.mainQueue.push(job);
      return;
    }
    const a = performance.now();
    this.finish(job, this.toBuffer(d.chans));
    this.timing(performance.now() - a);
  }
  private timing(ms: number) {
    this.stats.jobs++;
    if (ms > this.stats.jobMaxMs) this.stats.jobMaxMs = ms;
  }
  private finish(job: Job, b: AudioBuffer) {
    if (job.cache) {
      this.inflight.delete(job.sp.key);
      const have = this.cache.get(job.sp.key);
      if (have) b = have;
      else this.store(job.sp.key, b);
    }
    job.cb?.(b);
  }
  /** Encargos pendientes (en el worker o en la cola del hilo principal). */
  get busy() {
    return this.waiting.size + this.mainQueue.length;
  }

  /**
   * Encarga una muestra: en el worker si lo hay; si no, en el hilo principal con `pumpJobs()`.
   * `cache = false`: no se guarda (voces del locutor de un solo uso), solo se entrega a `cb`.
   */
  prefetch(sp: Spec, cb?: (b: AudioBuffer) => void, cache = true) {
    if (cache) {
      const have = this.cache.get(sp.key);
      if (have) { cb?.(have); return; }
      if (this.inflight.has(sp.key)) return;
      this.inflight.add(sp.key);
    }
    const job: Job = { sp, cb, cache };
    if (this.worker) {
      const id = ++this.reqId;
      this.waiting.set(id, job);
      this.worker.postMessage({ id, spec: sp });
    } else this.mainQueue.push(job);
  }

  /** Sin worker: hace encargos durante `budgetMs` como mucho (al menos uno por llamada). */
  pumpJobs(budgetMs: number) {
    const t0 = performance.now();
    let n = 0;
    while (this.mainQueue.length && (n++ === 0 || performance.now() - t0 < budgetMs)) {
      const job = this.mainQueue.shift()!;
      const a = performance.now();
      if (job.cache && this.cache.has(job.sp.key)) {
        this.finish(job, this.cache.get(job.sp.key)!);
        continue;
      }
      this.finish(job, this.toBuffer(runSpec(job.sp)));
      this.timing(performance.now() - a);
    }
  }

  // ─────────── caché de muestras ───────────

  /** Solo se pueden tirar las muestras que dependen de la canción (notas, jingles, quejíos). */
  private static evictable(key: string) {
    return key.startsWith('ks:') || key.includes(':jingle:') || key.includes(':quejio:');
  }
  private static mb(b: AudioBuffer) {
    return (b.length * b.numberOfChannels * 4) / 1048576;
  }
  private toBuffer(data: Float32Array | Float32Array[]): AudioBuffer {
    const chans = Array.isArray(data) ? data : [data];
    const b = this.ctx.createBuffer(chans.length, chans[0].length, this.sr);
    for (let c = 0; c < chans.length; c++) b.copyToChannel(chans[c] as Float32Array<ArrayBuffer>, c);
    return b;
  }
  private store(key: string, b: AudioBuffer) {
    this.cache.set(key, b);
    this.stats.bufferMB += RadioSynth.mb(b);
    if (this.stats.bufferMB > this.maxMB) {
      for (const [k, ob] of this.cache) {
        if (this.stats.bufferMB <= this.maxMB * 0.85) break;
        if (k === key || !RadioSynth.evictable(k)) continue;
        this.cache.delete(k);
        this.stats.bufferMB -= RadioSynth.mb(ob);
      }
    }
    this.stats.buffers = this.cache.size;
  }

  has(key: string) {
    return this.cache.has(key);
  }
  /** Devuelve la muestra del encargo, generándola ahora mismo si aún no existe (bloquea). */
  need(sp: Spec): AudioBuffer {
    const hit = this.maybe(sp.key);
    if (hit) return hit;
    const b = this.toBuffer(runSpec(sp));
    this.store(sp.key, b);
    return b;
  }
  /** La muestra si ya está lista (si no, undefined: no bloquea). Marca su uso. */
  maybe(key: string): AudioBuffer | undefined {
    const b = this.cache.get(key);
    if (b && RadioSynth.evictable(key)) {
      this.cache.delete(key);
      this.cache.set(key, b);
    }
    return b;
  }

  /** Encargo de una cuerda punteada por nota y variante. */
  stringSpec(midi: number, variant: StringVariant): Spec {
    const m = Math.round(midi);
    const f = mtof(m), sr = this.sr;
    const key = `ks:${variant}:${m}`;
    switch (variant) {
      case 'mute': return spec(key, 'pluck', sr, f, { t60: 0.08, bright: 0.45, len: 0.14, mute: true, body: 0.7 });
      case 'bright': return spec(key, 'pluck', sr, f, { t60: 1.3, bright: 0.85, len: 0.9, pos: 0.12, body: 0.45 });
      case 'bass': return spec(key, 'pluck', sr, f, { t60: 1.6, bright: 0.3, len: 1.0, pos: 0.25, body: 0.25 });
      case 'harp': return spec(key, 'pluck', sr, f, { t60: 2.2, bright: 0.6, len: 1.4, pos: 0.3, body: 0.2 });
      default: return spec(key, 'pluck', sr, f, { t60: m < 52 ? 3 : 2.2, bright: 0.62, len: 1.1, pos: 0.17, body: 0.6 });
    }
  }
  /** Cuerda punteada (si no estaba lista, se genera ahora). */
  string(midi: number, variant: StringVariant): AudioBuffer {
    return this.need(this.stringSpec(midi, variant));
  }
  /**
   * Cuerda punteada sin bloquear: si no está lista y hay worker, la encarga y devuelve
   * undefined (esa nota no suena); sin worker, se genera ya.
   */
  maybeString(midi: number, variant: StringVariant): AudioBuffer | undefined {
    const sp = this.stringSpec(midi, variant);
    const b = this.maybe(sp.key);
    if (b) return b;
    if (!this.worker) return this.need(sp);
    this.prefetch(sp);
    return undefined;
  }

  // ─────────── seguimiento de nodos ───────────

  /** Registra una fuente y su cadena: al acabar, se desconecta todo y se descuenta. */
  track(src: Src, chain: AudioNode[]) {
    const n = 1 + chain.length;
    const st = this.stats;
    st.live += n;
    st.sources++;
    st.created += n;
    if (st.live > st.peak) st.peak = st.live;
    const owner = this.owner;
    owner?.add(src);
    src.onended = () => {
      st.live -= n;
      st.sources--;
      owner?.delete(src);
      try {
        src.disconnect();
        for (const c of chain) c.disconnect();
      } catch {
        /* ya desconectado */
      }
    };
  }

  /** Envolvente ADSR sencilla sobre un AudioParam. */
  env(p: AudioParam, t: number, peak: number, a: number, d: number, s: number, end: number, r: number) {
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + a);
    p.setTargetAtTime(peak * s, t + a, d / 3);
    p.setTargetAtTime(0, Math.max(t + a, end), r / 4);
  }

  // ─────────── instrumentos ───────────

  /** Reproduce una muestra. Devuelve la fuente y su ganancia (para cortarla antes). */
  play(dest: AudioNode, t: number, buf: AudioBuffer, vel: number, rate = 1, dur?: number): { src: AudioBufferSourceNode; g: GainNode } {
    const ctx = this.ctx;
    t = Math.max(0, t);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (rate !== 1) src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = vel;
    src.connect(g).connect(dest);
    src.start(t);
    if (dur !== undefined) {
      g.gain.setValueAtTime(vel, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.03);
      src.stop(t + dur + 0.05);
    }
    this.track(src, [g]);
    return { src, g };
  }

  /** Corta una nota que suena (cuerda que se vuelve a pulsar, fin de emisora...). */
  choke(v: { src: AudioScheduledSourceNode; g: GainNode }, t: number, fade = 0.02) {
    try {
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setTargetAtTime(0, t, fade / 3);
      v.src.stop(t + fade + 0.02);
    } catch {
      /* ya parada */
    }
  }

  /** Bajo 808: seno con golpe de tono y saturación en el canal. */
  bass808(dest: AudioNode, t: number, midi: number, dur: number, vel: number, glideFrom?: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const f = mtof(midi);
    if (glideFrom !== undefined) {
      o.frequency.setValueAtTime(mtof(glideFrom), t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    } else {
      o.frequency.setValueAtTime(f * 1.5, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.035);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.004);
    g.gain.setTargetAtTime(vel * 0.55, t + 0.03, 0.25);
    g.gain.setTargetAtTime(0, t + Math.max(0.05, dur - 0.02), 0.015);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.1);
    this.track(o, [g]);
  }

  /** Bajo de sierra con filtro (house, electro). */
  sawBass(dest: AudioNode, t: number, midi: number, dur: number, vel: number, cutoff: number, envAmt: number, q = 3) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi);
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = mtof(midi - 12);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(cutoff + envAmt, t);
    f.frequency.setTargetAtTime(cutoff, t + 0.005, 0.05);
    const g = ctx.createGain();
    this.env(g.gain, t, vel, 0.003, 0.15, 0.75, t + dur - 0.02, 0.05);
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    o.connect(f);
    o2.connect(g2).connect(f);
    f.connect(g).connect(dest);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.1);
    o2.stop(t + dur + 0.1);
    this.track(o, [f, g]);
    this.track(o2, [g2]);
  }

  /** Pad: varias sierras desafinadas por nota, un filtro y una envolvente lenta. */
  pad(dest: AudioNode, t: number, notes: number[], dur: number, vel: number, o: { cutoff?: number; attack?: number; release?: number; voices?: number; detune?: number; type?: OscillatorType; sweep?: number } = {}) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.8;
    const cut = o.cutoff ?? 1800;
    f.frequency.setValueAtTime(cut * (o.sweep ? 0.5 : 1), t);
    if (o.sweep) f.frequency.linearRampToValueAtTime(cut * o.sweep, t + dur);
    const g = ctx.createGain();
    const voices = o.voices ?? 2;
    const peak = vel / Math.sqrt(notes.length * voices);
    const attack = o.attack ?? 0.3, release = o.release ?? 0.6;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + Math.max(attack, dur - 0.01));
    g.gain.setTargetAtTime(0, t + Math.max(attack, dur), release / 4);
    f.connect(g).connect(dest);
    const end = t + dur + release * 1.2;
    const det = o.detune ?? 12;
    let firstDone = false;
    for (const m of notes) {
      for (let v = 0; v < voices; v++) {
        const osc = ctx.createOscillator();
        osc.type = o.type ?? 'sawtooth';
        osc.frequency.value = mtof(m);
        osc.detune.value = voices === 1 ? 0 : ((v / (voices - 1)) * 2 - 1) * det;
        osc.connect(f);
        osc.start(t);
        osc.stop(end);
        // el filtro y la ganancia se cuentan con la primera fuente
        this.track(osc, firstDone ? [] : [f, g]);
        firstDone = true;
      }
    }
  }

  /** Acorde corto de sintetizador (stab / pluck / marimba / piano eléctrico). */
  stab(dest: AudioNode, t: number, notes: number[], vel: number, o: { type?: OscillatorType; decay?: number; cutoff?: number; envAmt?: number; q?: number; detune?: number } = {}) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = o.q ?? 1.5;
    const cut = o.cutoff ?? 900;
    f.frequency.setValueAtTime(cut + (o.envAmt ?? 3000), t);
    f.frequency.setTargetAtTime(cut, t + 0.002, (o.decay ?? 0.25) / 4);
    const g = ctx.createGain();
    const dec = o.decay ?? 0.25;
    const peak = vel / Math.sqrt(notes.length);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.003);
    g.gain.setTargetAtTime(0, t + 0.004, dec / 3.5);
    f.connect(g).connect(dest);
    const end = t + dec * 1.6 + 0.05;
    let first = true;
    for (const m of notes) {
      const osc = ctx.createOscillator();
      osc.type = o.type ?? 'sawtooth';
      osc.frequency.value = mtof(m);
      if (o.detune) osc.detune.value = (Math.random() - 0.5) * o.detune;
      osc.connect(f);
      osc.start(t);
      osc.stop(end);
      this.track(osc, first ? [f, g] : []);
      first = false;
    }
  }

  /** Marimba/"piano" de reguetón: seno + parcial agudo que se apaga rápido. */
  mallet(dest: AudioNode, t: number, midi: number, vel: number, decay = 0.35) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const o1 = ctx.createOscillator();
    o1.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.frequency.value = f * 4;
    const g1 = ctx.createGain(), g2 = ctx.createGain();
    g1.gain.setValueAtTime(0, t);
    g1.gain.linearRampToValueAtTime(vel, t + 0.002);
    g1.gain.setTargetAtTime(0, t + 0.003, decay / 3.5);
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(vel * 0.35, t + 0.001);
    g2.gain.setTargetAtTime(0, t + 0.002, 0.012);
    o1.connect(g1).connect(dest);
    o2.connect(g2).connect(dest);
    o1.start(t);
    o2.start(t);
    o1.stop(t + decay * 1.6 + 0.05);
    o2.stop(t + 0.12);
    this.track(o1, [g1]);
    this.track(o2, [g2]);
  }

  /** Voz solista de sinte (silbido, acordeón, sierra...), con vibrato opcional. */
  lead(dest: AudioNode, t: number, midi: number, dur: number, vel: number, o: { type: 'whistle' | 'accordion' | 'saw' | 'square'; glideFrom?: number; vib?: AudioNode | null; cutoff?: number }) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const g = ctx.createGain();
    const oscs: OscillatorNode[] = [];
    const mk = (type: OscillatorType, det: number) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      if (o.glideFrom !== undefined) {
        osc.frequency.setValueAtTime(mtof(o.glideFrom), t);
        osc.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      } else osc.frequency.value = f;
      osc.detune.value = det;
      if (o.vib) o.vib.connect(osc.detune);
      oscs.push(osc);
      return osc;
    };
    let chainTop: AudioNode = g;
    let filt: BiquadFilterNode | null = null;
    if (o.type === 'whistle') {
      mk('sine', 0).connect(g);
      const h = mk('triangle', 3);
      const hg = ctx.createGain();
      hg.gain.value = 0.18;
      h.connect(hg).connect(g);
      this.env(g.gain, t, vel, 0.025, 0.2, 0.85, t + dur - 0.03, 0.08);
      g.connect(dest);
      this.track(oscs[0], [g]);
      this.track(oscs[1], [hg]);
    } else {
      filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.Q.value = o.type === 'accordion' ? 2 : 1;
      const cut = o.cutoff ?? (o.type === 'accordion' ? 2400 : 2000);
      filt.frequency.setValueAtTime(cut * 1.8, t);
      filt.frequency.setTargetAtTime(cut, t, 0.08);
      const type: OscillatorType = o.type === 'saw' ? 'sawtooth' : 'square';
      mk(type, o.type === 'accordion' ? -7 : -5).connect(filt);
      mk(o.type === 'accordion' ? 'square' : 'sawtooth', o.type === 'accordion' ? 7 : 5).connect(filt);
      filt.connect(g).connect(dest);
      this.env(g.gain, t, vel * 0.7, o.type === 'accordion' ? 0.03 : 0.008, 0.25, 0.7, t + dur - 0.03, 0.07);
      this.track(oscs[0], [filt, g]);
      this.track(oscs[1], []);
      chainTop = filt;
    }
    void chainTop;
    for (const osc of oscs) {
      osc.start(t);
      osc.stop(t + dur + 0.15);
    }
  }

  /** Nota de arpegio (pluck de sinte muy corto). */
  arp(dest: AudioNode, t: number, midi: number, dur: number, vel: number, cutoff: number, type: OscillatorType = 'sawtooth') {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = mtof(midi);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(cutoff * 2.5, t);
    f.frequency.setTargetAtTime(cutoff * 0.6, t + 0.002, 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.002);
    g.gain.setTargetAtTime(0, t + 0.004, Math.min(dur, 0.25) / 3);
    o.connect(f).connect(g).connect(dest);
    o.start(t);
    o.stop(t + Math.min(dur, 0.25) * 1.5 + 0.05);
    this.track(o, [f, g]);
  }

  /** Barrido de ruido (subida antes del estribillo, bajada después). */
  sweep(dest: AudioNode, t: number, dur: number, f0: number, f1: number, vol: number, up: boolean, q = 2) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    if (up) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
    } else {
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
    this.track(src, [f, g]);
  }

  /** "Bombeo" de sidechain: baja la ganancia en cada bombo y la recupera. */
  pump(p: AudioParam, t: number, depth: number, release: number) {
    p.setValueAtTime(1, t);
    p.linearRampToValueAtTime(1 - depth, t + 0.008);
    p.linearRampToValueAtTime(1, t + release);
  }
}
