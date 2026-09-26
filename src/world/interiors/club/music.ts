// Música de club generada con Web Audio: house a 124 BPM (bombo a negras, palmas, charles, bajo a
// contratiempo, acordes, arpegio y parones cada 32 compases). Planificación con margen (lookahead),
// como en un secuenciador: un temporizador cada 25 ms deja programadas las notas de los próximos 150 ms.
import { BPM } from './layout';

const STEP = 60 / BPM / 4; // semicorchea
const LOOKAHEAD = 0.16;

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Progresión en La menor: Am9 · Fmaj9 · C · G6 (un acorde por compás). */
const CHORDS = [
  [57, 60, 64, 67, 71],
  [53, 57, 60, 64, 67],
  [55, 60, 64, 67, 72],
  [55, 59, 62, 64, 67],
];
const ROOTS = [45, 41, 48, 43];
/** Bajo: semicorchea → desplazamiento en semitonos (null = nada). */
const BASS: (number | null)[] = [null, null, 0, null, null, null, 0, 12, null, null, 0, null, null, 7, 0, null];
const STABS_A = [3, 6, 11];
const STABS_B = [3, 8, 14];

export interface AudioLike {
  ctx: AudioContext | null;
  musicBus?: GainNode;
  ensure?: () => AudioContext | null;
}

export class ClubMusic {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private mix: GainNode | null = null;
  private lp: BiquadFilterNode | null = null;
  private pump: GainNode | null = null;
  private verbIn: GainNode | null = null;
  private delayIn: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | null = null;
  private t0 = 0;
  private step = 0;
  /** Compases que le quedan al modo fiesta (palmas en todos los pulsos, agitador...). */
  private partyBars = 0;
  private nodesToClose: AudioNode[] = [];
  running = false;

  constructor(private getAudio: () => AudioLike | undefined) {}

  /** Arranca la música (devuelve false si no hay audio todavía). */
  start(): boolean {
    if (this.running) return true;
    const a = this.getAudio();
    const ctx = a?.ensure?.() ?? a?.ctx ?? null;
    if (!ctx || !a?.musicBus) return false;
    this.ctx = ctx;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 1.2);
    out.connect(a.musicBus);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 18000;
    lp.Q.value = 0.7;
    lp.connect(out);
    const mix = ctx.createGain();
    mix.gain.value = 0.8;
    mix.connect(lp);
    const pump = ctx.createGain();
    pump.connect(mix);
    // reverberación corta con un impulso de ruido que se apaga
    const verb = ctx.createConvolver();
    verb.buffer = this.impulse(ctx, 1.6);
    const verbIn = ctx.createGain();
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.3;
    verbIn.connect(verb).connect(verbOut).connect(mix);
    // eco a 3/16
    const delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.36;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 2400;
    const delayIn = ctx.createGain();
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.28;
    delayIn.connect(delay);
    delay.connect(dlp).connect(fb).connect(delay);
    dlp.connect(delayOut).connect(mix);

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.out = out;
    this.lp = lp;
    this.mix = mix;
    this.pump = pump;
    this.verbIn = verbIn;
    this.delayIn = delayIn;
    this.nodesToClose = [out, lp, mix, pump, verb, verbIn, verbOut, delay, fb, dlp, delayIn, delayOut];
    this.t0 = ctx.currentTime + 0.12;
    this.step = 0;
    this.running = true;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
    return true;
  }

  /** Para la música con un fundido y libera los nodos. */
  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    const ctx = this.ctx!;
    const out = this.out!;
    const now = ctx.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setValueAtTime(out.gain.value, now);
    out.gain.linearRampToValueAtTime(0.0001, now + 0.5);
    const nodes = this.nodesToClose;
    this.nodesToClose = [];
    window.setTimeout(() => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* ya desconectado */
        }
      }
    }, 900);
    this.out = this.mix = this.pump = this.verbIn = this.delayIn = this.lp = null;
  }

  /** Pulsos desde que empezó (con decimales), o null si no suena. */
  beat(): number | null {
    if (!this.running || !this.ctx) return null;
    return Math.max(0, (this.ctx.currentTime - this.t0) / (STEP * 4));
  }

  /** Amortigua la música (menús abiertos). */
  setMuffled(on: boolean) {
    if (!this.lp || !this.ctx) return;
    const f = this.lp.frequency;
    const now = this.ctx.currentTime;
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.value, now);
    f.exponentialRampToValueAtTime(on ? 700 : 18000, now + 0.25);
  }

  /** ¡Fiesta! Bocina, platillo, subidón y 8 compases con todo. */
  party(bars = 8) {
    this.partyBars = Math.max(this.partyBars, bars);
    if (!this.running || !this.ctx) return;
    const t = this.ctx.currentTime + 0.03;
    this.airhorn(t);
    this.crash(t);
  }

  /** Chorro de CO2 (ffffsshhh). */
  co2() {
    if (!this.running || !this.ctx || !this.mix) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const src = this.noiseSrc(t, 1.3);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.setValueAtTime(1500, t);
    f.frequency.exponentialRampToValueAtTime(4000, t + 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    src.connect(f).connect(g).connect(this.mix);
  }

  /** Parón (sin bombo) del compás 28 al 31 de cada bloque de 32. */
  static isBreak(bar: number): boolean {
    const s = bar % 32;
    return s >= 28;
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.running) return;
    const now = ctx.currentTime;
    // si la pestaña estuvo dormida, saltamos lo perdido sin amontonar notas
    const due = Math.floor((now - this.t0) / STEP);
    if (due > this.step + 4) this.step = due;
    while (this.t0 + this.step * STEP < now + LOOKAHEAD) {
      const t = Math.max(now, this.t0 + this.step * STEP);
      this.playStep(this.step, t);
      this.step++;
    }
  }

  private playStep(s: number, t: number) {
    const bar = Math.floor(s / 16);
    const st = s % 16;
    const sec = bar % 32;
    const brk = ClubMusic.isBreak(bar);
    const party = this.partyBars > 0;
    const ci = bar % 4;
    if (st === 0 && party && s > 0) this.partyBars--;

    // bombo a negras
    if (!brk && st % 4 === 0) this.kick(t);
    // palmas en 2 y 4 (y en todos los pulsos si hay fiesta)
    if ((sec >= 4 && !brk) || party) {
      if (st === 4 || st === 12) this.clap(t, 0.5);
      else if (party && (st === 0 || st === 8)) this.clap(t, 0.25);
    }
    // charles abierto a contratiempo y cerrados en semicorcheas
    if (!brk || sec >= 30) {
      if (st % 4 === 2) this.hat(t, true, 0.16);
      else if (sec % 16 >= 8 || party) this.hat(t, false, st % 2 ? 0.05 : 0.08);
    }
    if (party && st % 2 === 1) this.shaker(t);
    // bajo
    const bn = BASS[st];
    if (bn !== null && (!brk || sec >= 31)) this.bass(t, ROOTS[ci] + bn, STEP * 1.6);
    // acordes
    const stabs = bar % 2 ? STABS_B : STABS_A;
    if (!brk && stabs.includes(st)) this.stab(t, CHORDS[ci], 0.26);
    // colchón (más presente en el parón)
    if (st === 0) this.pad(t, CHORDS[ci], STEP * 16, brk ? 0.05 : 0.022);
    // arpegio
    if (sec % 16 >= 8 || party || brk) {
      const ch = CHORDS[ci];
      const order = [0, 2, 1, 3, 4, 2, 3, 1];
      this.pluck(t, ch[order[st % order.length]] + 12, brk ? 0.045 : 0.035);
    }
    // subidón antes de volver y platillo al entrar
    if (sec === 30 && st === 0) this.riser(t, STEP * 32);
    if (sec === 0 && st === 0 && bar > 0) this.crash(t);
  }

  // ───────── Instrumentos ─────────

  private noiseSrc(t: number, dur: number): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start(t, Math.random() * 0.8);
    src.stop(t + dur + 0.05);
    return src;
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g).connect(this.mix!);
    o.start(t);
    o.stop(t + 0.45);
    // chasquido del parche
    const n = this.noiseSrc(t, 0.02);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2500;
    const gn = ctx.createGain();
    this.env(gn, t, 0.001, 0.25, 0.015);
    n.connect(f).connect(gn).connect(this.mix!);
    // «bombeo»: el bajo y los acordes se agachan con cada bombo
    const p = this.pump!.gain;
    p.cancelScheduledValues(t);
    p.setValueAtTime(0.25, t);
    p.linearRampToValueAtTime(1, t + 0.22);
  }

  private clap(t: number, vol: number) {
    const ctx = this.ctx!;
    const n = this.noiseSrc(t, 0.25);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1150;
    f.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (const k of [0, 0.011, 0.022]) {
      g.gain.setValueAtTime(vol, t + k);
      g.gain.exponentialRampToValueAtTime(vol * 0.12, t + k + 0.009);
    }
    g.gain.setValueAtTime(vol * 0.85, t + 0.033);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    n.connect(f).connect(g);
    g.connect(this.mix!);
    g.connect(this.verbIn!);
  }

  private hat(t: number, open: boolean, vol: number) {
    const ctx = this.ctx!;
    const d = open ? 0.17 : 0.035;
    const n = this.noiseSrc(t, d);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = open ? 7000 : 8500;
    const g = ctx.createGain();
    this.env(g, t, 0.001, vol, d);
    n.connect(f).connect(g).connect(this.mix!);
  }

  private shaker(t: number) {
    const ctx = this.ctx!;
    const n = this.noiseSrc(t, 0.06);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 5200;
    f.Q.value = 1.5;
    const g = ctx.createGain();
    this.env(g, t, 0.012, 0.09, 0.05);
    n.connect(f).connect(g).connect(this.mix!);
  }

  private bass(t: number, midi: number, dur: number) {
    const ctx = this.ctx!;
    const fr = mtof(midi);
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = fr;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = fr / 2;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 7;
    f.frequency.setValueAtTime(1300, t);
    f.frequency.exponentialRampToValueAtTime(220, t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.004, 0.24, dur);
    const g2 = ctx.createGain();
    this.env(g2, t, 0.004, 0.32, dur);
    o1.connect(f).connect(g).connect(this.pump!);
    o2.connect(g2).connect(this.pump!);
    o1.start(t);
    o2.start(t);
    o1.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  private stab(t: number, notes: number[], dur: number) {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(900, t + dur);
    f.Q.value = 2;
    const g = ctx.createGain();
    this.env(g, t, 0.004, 0.07, dur);
    f.connect(g);
    g.connect(this.pump!);
    g.connect(this.delayIn!);
    for (const m of notes) {
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  private pad(t: number, notes: number[], dur: number, vol: number) {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.35);
    g.gain.setValueAtTime(vol, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g);
    g.connect(this.pump!);
    g.connect(this.verbIn!);
    for (const m of notes.slice(0, 4)) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = mtof(m);
      o.detune.value = (m % 3) * 4 - 4;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private pluck(t: number, midi: number, vol: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = mtof(midi);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3400, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.12);
    const g = ctx.createGain();
    this.env(g, t, 0.002, vol, 0.14);
    o.connect(f).connect(g);
    g.connect(this.mix!);
    g.connect(this.delayIn!);
    o.start(t);
    o.stop(t + 0.2);
  }

  private riser(t: number, dur: number) {
    const ctx = this.ctx!;
    const n = this.noiseSrc(t, dur);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22, t + dur * 0.95);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(this.mix!);
  }

  private crash(t: number) {
    const ctx = this.ctx!;
    const n = this.noiseSrc(t, 1.8);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 4200;
    const g = ctx.createGain();
    this.env(g, t, 0.003, 0.3, 1.7);
    n.connect(f).connect(g);
    g.connect(this.mix!);
    g.connect(this.verbIn!);
  }

  /** Bocina de discoteca: ¡PA-PA-PAAAA! */
  private airhorn(t: number) {
    const ctx = this.ctx!;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 3);
    }
    shaper.curve = curve;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    shaper.connect(bp).connect(g);
    g.connect(this.mix!);
    g.connect(this.verbIn!);
    const hits: [number, number][] = [[0, 0.13], [0.17, 0.13], [0.34, 0.62]];
    for (const [off, len] of hits) {
      const s = t + off;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(0.16, s + 0.015);
      g.gain.setValueAtTime(0.16, s + len - 0.04);
      g.gain.linearRampToValueAtTime(0.0001, s + len);
      for (const fr of [466, 470, 587]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(fr, s);
        o.frequency.setValueAtTime(fr, s + len - 0.08);
        o.frequency.linearRampToValueAtTime(fr * 0.92, s + len);
        o.connect(shaper);
        o.start(s);
        o.stop(s + len + 0.02);
      }
    }
  }

  private impulse(ctx: AudioContext, seconds: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }
}
