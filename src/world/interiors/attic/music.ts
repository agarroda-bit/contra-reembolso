// Música de fiesta sintetizada (bombo, palmas, charles, bajo y acordes) para el modo fiesta del ático.
// Va por el bus de música del motor de audio, así respeta el volumen de las opciones.

interface AudioLike {
  ctx: AudioContext | null;
  musicBus?: GainNode;
  ensure?: () => AudioContext | null;
}

const BASS = [45, 45, 57, 45, 48, 48, 60, 50, 43, 43, 55, 43, 47, 47, 59, 52]; // notas MIDI (La menor, rollo reguetón-disco)
const CHORDS = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]];

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class PartyMusic {
  private timer: number | null = null;
  private next = 0;
  private step = 0;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private ctx: AudioContext | null = null;
  readonly bpm = 118;

  get playing() {
    return this.timer !== null;
  }

  start(audio: AudioLike | undefined) {
    if (this.timer !== null || !audio) return;
    const ctx = audio.ensure?.() ?? audio.ctx;
    if (!ctx || !audio.musicBus) return;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.0001;
    this.out.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + 0.4);
    this.out.connect(audio.musicBus);
    if (!this.noise) {
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    this.next = ctx.currentTime + 0.08;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), 40);
  }

  stop() {
    if (this.timer === null) return;
    window.clearInterval(this.timer);
    this.timer = null;
    const ctx = this.ctx, out = this.out;
    if (ctx && out) {
      out.gain.cancelScheduledValues(ctx.currentTime);
      out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
      window.setTimeout(() => out.disconnect(), 900);
    }
    this.out = null;
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const sixteenth = 60 / this.bpm / 4;
    while (this.next < ctx.currentTime + 0.18) {
      this.note(this.step, this.next);
      this.next += sixteenth;
      this.step++;
    }
  }

  private note(s: number, t: number) {
    const ctx = this.ctx!;
    const out = this.out!;
    const bar = Math.floor(s / 16);
    const i = s % 16;
    // bombo en negras (con el "dembow" en el 3 y el 7)
    if (i % 4 === 0) this.kick(t);
    if (i === 3 || i === 11 || i === 6 || i === 14) this.snare(t, i === 6 || i === 14 ? 0.35 : 0.2);
    if (i % 2 === 1) this.hat(t, i % 4 === 3 ? 0.14 : 0.07);
    // bajo
    if (i % 2 === 0) {
      const n = BASS[(bar % 2) * 8 + i / 2];
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midi(n);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(180, t + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(f).connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.25);
    }
    // acordes a contratiempo
    if (i === 2 || i === 10) {
      const ch = CHORDS[bar % 4];
      for (const n of ch) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = midi(n + 12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.2);
      }
    }
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(this.out!);
    o.start(t);
    o.stop(t + 0.3);
  }

  private noiseHit(t: number, vol: number, dur: number, type: BiquadFilterType, freq: number) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.out!);
    s.start(t, Math.random() * 0.5, dur + 0.02);
  }

  private snare(t: number, vol: number) {
    this.noiseHit(t, vol, 0.14, 'bandpass', 1800);
  }

  private hat(t: number, vol: number) {
    this.noiseHit(t, vol, 0.04, 'highpass', 7000);
  }
}
