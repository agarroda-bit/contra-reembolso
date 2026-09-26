// Sonido sintetizado con Web Audio: nada de archivos. Efectos, motores con revoluciones y bucles.
import * as THREE from 'three';
import type { Game, System } from '../core/game';

export type Sfx =
  | 'shot_pistol' | 'shot_shotgun' | 'shot_smg' | 'shot_rifle' | 'shot_launcher' | 'shot_tape' | 'shot_stamp'
  | 'empty' | 'reload' | 'explosion' | 'explosion_big' | 'crash' | 'crash_small' | 'glass' | 'wood'
  | 'horn' | 'horn_truck' | 'horn_scooter' | 'phone' | 'cash' | 'coin' | 'step' | 'punch' | 'hit' | 'hurt'
  | 'pickup' | 'drop' | 'click' | 'ui' | 'error' | 'success' | 'fail' | 'whoosh' | 'dog' | 'splash'
  | 'door' | 'jump' | 'land' | 'cheer' | 'boo' | 'slot' | 'chip' | 'card' | 'pop' | 'spray' | 'bell' | 'shell';

export interface PlayOpts {
  volume?: number;
  pitch?: number; // multiplicador
  pos?: THREE.Vector3 | null; // posición en el mundo (se atenúa con la distancia)
  voice?: number; // para balbuceos: tono de voz
}

interface EngineVoice {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
  lastSeen: number;
  electric: boolean;
}

interface LoopVoice {
  nodes: AudioNode[];
  gain: GainNode;
  pan: StereoPannerNode;
  set?: (p: number) => void;
  lastSeen: number;
}

const tmpV = new THREE.Vector3();
const tmpR = new THREE.Vector3();

export class AudioEngine implements System {
  name = 'audio';
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  private noise!: AudioBuffer;
  private engines = new Map<number, EngineVoice>();
  private loops = new Map<string, LoopVoice>();
  private listener = new THREE.Vector3();
  private listenerRight = new THREE.Vector3(1, 0, 0);
  private lastPlay = new Map<string, number>();

  constructor(private game: Game) {
    game.mod.audio = this;
    const unlock = () => {
      this.ensure();
      if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    game.events.on('settings', () => this.applyVolumes());
    this.wireEvents();
  }

  /** Crea el contexto de audio (solo tras un gesto del usuario). */
  ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return null;
      const ctx: AudioContext = new Ctx();
      this.ctx = ctx;
      this.master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      this.game.events.emit('audio:ready' as any, {} as any);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.game.settings;
    this.master.gain.value = s.volMaster;
    this.sfxBus.gain.value = s.volSfx;
    this.musicBus.gain.value = s.volMusic;
  }

  /** Volumen y panorama según la posición respecto a la cámara. */
  private spatial(pos: THREE.Vector3 | null | undefined, maxDist = 140): { gain: number; pan: number } {
    if (!pos) return { gain: 1, pan: 0 };
    const d = tmpV.copy(pos).sub(this.listener);
    const dist = d.length();
    if (dist > maxDist) return { gain: 0, pan: 0 };
    const gain = 1 / Math.pow(1 + dist / 12, 1.4);
    const pan = dist > 0.5 ? THREE.MathUtils.clamp(d.normalize().dot(this.listenerRight), -1, 1) * 0.8 : 0;
    return { gain, pan };
  }

  private out(gain: number, pan: number): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = gain;
    if (pan !== 0) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.sfxBus);
    } else g.connect(this.sfxBus);
    return g;
  }

  private noiseSrc(dur: number, rate = 1): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = rate;
    s.start(ctx.currentTime, Math.random() * 1.5, dur + 0.05);
    return s;
  }

  private env(g: GainNode, t: number, attack: number, peak: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, dest: AudioNode, delay = 0, attack = 0.005) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, attack, vol, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + attack + 0.05);
  }

  private burst(dur: number, vol: number, dest: AudioNode, filterType: BiquadFilterType, f0: number, f1: number, q = 1, delay = 0, rate = 1) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const n = this.noiseSrc(dur + delay, rate);
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.002, vol, dur);
    n.connect(f).connect(g).connect(dest);
  }

  /** Reproduce un efecto. */
  play(name: Sfx, opts: PlayOpts = {}) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    // evitar ametralladora de sonidos idénticos en el mismo frame
    const now = ctx.currentTime;
    const last = this.lastPlay.get(name) ?? -1;
    if (now - last < 0.025 && name !== 'shot_smg') return;
    this.lastPlay.set(name, now);
    const { gain, pan } = this.spatial(opts.pos);
    if (gain < 0.01) return;
    const v = (opts.volume ?? 1) * gain;
    const p = opts.pitch ?? 1;
    const o = this.out(v, pan);
    const r = () => 0.9 + Math.random() * 0.2;
    switch (name) {
      case 'shot_pistol':
        this.burst(0.18, 0.9, o, 'lowpass', 5000 * p, 300, 0.7);
        this.tone('square', 180 * p * r(), 60, 0.08, 0.35, o);
        break;
      case 'shot_shotgun':
        this.burst(0.45, 1, o, 'lowpass', 3500 * p, 120, 0.6);
        this.tone('sawtooth', 110 * p, 40, 0.2, 0.5, o);
        break;
      case 'shot_smg':
        this.burst(0.09, 0.7, o, 'bandpass', 3000 * p * r(), 800, 0.8);
        this.tone('square', 240 * p * r(), 90, 0.05, 0.25, o);
        break;
      case 'shot_rifle':
        this.burst(0.3, 1, o, 'lowpass', 7000 * p, 200, 0.8);
        this.tone('sawtooth', 150 * p, 45, 0.12, 0.45, o);
        this.burst(0.6, 0.25, o, 'bandpass', 900, 300, 0.5, 0.05);
        break;
      case 'shot_launcher':
        this.tone('sine', 190 * p, 55, 0.25, 0.9, o);
        this.burst(0.2, 0.5, o, 'lowpass', 900, 100, 0.5);
        break;
      case 'shot_tape':
        this.burst(0.35, 0.6, o, 'bandpass', 600 * p, 4000, 3);
        this.tone('triangle', 300, 900, 0.3, 0.2, o);
        break;
      case 'shot_stamp':
        for (let i = 0; i < 3; i++) {
          this.burst(0.03, 0.6, o, 'highpass', 3000, 2000, 1, i * 0.06);
          this.tone('sine', 1200 * p * r(), 700, 0.05, 0.25, o, i * 0.06);
        }
        break;
      case 'empty':
        this.burst(0.03, 0.4, o, 'highpass', 4000, 3000, 1);
        break;
      case 'reload':
        this.burst(0.04, 0.5, o, 'bandpass', 2500, 2000, 4);
        this.burst(0.05, 0.6, o, 'bandpass', 1800, 1500, 4, 0.25);
        this.tone('square', 900, 700, 0.03, 0.15, o, 0.27);
        break;
      case 'shell':
        this.tone('sine', 3200 * r(), 2600, 0.06, 0.12, o);
        this.tone('sine', 4100 * r(), 3600, 0.05, 0.08, o, 0.08);
        break;
      case 'explosion':
      case 'explosion_big': {
        const big = name === 'explosion_big';
        const d = big ? 2.4 : 1.4;
        this.burst(d, 1, o, 'lowpass', 3000, 60, 0.7);
        this.tone('sine', 90, 30, d * 0.8, 1, o);
        this.burst(d * 0.6, 0.4, o, 'bandpass', 500, 150, 0.8, 0.1);
        if (big) this.tone('sawtooth', 60, 25, 1.2, 0.5, o, 0.05);
        break;
      }
      case 'crash':
      case 'crash_small': {
        const k = name === 'crash' ? 1 : 0.45;
        this.burst(0.4 * k + 0.1, 0.9, o, 'lowpass', 2500, 200, 0.6);
        for (const f of [320, 517, 833, 1210]) this.tone('triangle', f * p * r(), f * 0.8, 0.25 * k + 0.1, 0.12 * k, o);
        this.tone('sine', 70, 40, 0.3, 0.6 * k, o);
        break;
      }
      case 'glass':
        this.burst(0.4, 0.5, o, 'highpass', 3000, 6000, 0.7);
        for (let i = 0; i < 6; i++) this.tone('sine', 2500 + Math.random() * 4000, 2000, 0.15, 0.08, o, Math.random() * 0.25);
        break;
      case 'wood':
        this.burst(0.25, 0.8, o, 'bandpass', 700 * p, 300, 1.2);
        this.tone('triangle', 180 * r(), 90, 0.15, 0.4, o);
        break;
      case 'horn':
      case 'horn_truck':
      case 'horn_scooter': {
        const base = name === 'horn_truck' ? 220 : name === 'horn_scooter' ? 620 : 390;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 2200;
        f.connect(o);
        for (const m of [1, 1.26]) {
          const osc = ctx.createOscillator();
          osc.type = 'square';
          osc.frequency.value = base * m * p;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, now);
          g.gain.linearRampToValueAtTime(0.18, now + 0.02);
          g.gain.setValueAtTime(0.18, now + 0.42);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
          osc.connect(g).connect(f);
          osc.start(now);
          osc.stop(now + 0.55);
        }
        break;
      }
      case 'phone':
        this.tone('sine', 988, 988, 0.09, 0.35, o);
        this.tone('sine', 1319, 1319, 0.12, 0.35, o, 0.11);
        this.tone('sine', 1760, 1760, 0.1, 0.2, o, 0.24);
        break;
      case 'cash':
        this.burst(0.12, 0.4, o, 'bandpass', 2000, 1500, 2);
        this.tone('sine', 2093, 2093, 0.6, 0.3, o, 0.08);
        this.tone('sine', 2637, 2637, 0.7, 0.25, o, 0.1);
        this.tone('sine', 3136, 3136, 0.5, 0.15, o, 0.12);
        break;
      case 'coin':
        this.tone('square', 988 * p, 988, 0.06, 0.18, o);
        this.tone('square', 1319 * p, 1319, 0.25, 0.18, o, 0.06);
        break;
      case 'step':
        this.burst(0.05, 0.25, o, 'lowpass', 900 * p * r(), 300, 1);
        break;
      case 'punch':
      case 'hit':
        this.tone('sine', 140 * p * r(), 50, 0.12, 0.8, o);
        this.burst(0.08, 0.6, o, 'lowpass', 1800, 300, 0.8);
        break;
      case 'hurt':
        this.babble(o, 3, opts.voice ?? 0.8, 0.9);
        break;
      case 'pickup':
        this.tone('triangle', 520 * p, 1040, 0.12, 0.3, o);
        this.tone('triangle', 780 * p, 1560, 0.12, 0.2, o, 0.07);
        break;
      case 'drop':
        this.tone('sine', 300, 120, 0.15, 0.4, o);
        this.burst(0.1, 0.3, o, 'lowpass', 1200, 200, 0.7);
        break;
      case 'click':
      case 'ui':
        this.tone('sine', 1400 * p, 1200, 0.04, 0.2, o);
        break;
      case 'error':
        this.tone('square', 220, 200, 0.12, 0.15, o);
        this.tone('square', 180, 160, 0.16, 0.15, o, 0.13);
        break;
      case 'success':
        [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.18, 0.25, o, i * 0.08));
        break;
      case 'fail':
        [392, 349, 311, 262].forEach((f, i) => this.tone('sawtooth', f, f * 0.97, 0.22, 0.12, o, i * 0.14));
        break;
      case 'whoosh':
        this.burst(0.4, 0.5, o, 'bandpass', 300, 2500, 1.5);
        break;
      case 'dog':
        for (let i = 0; i < 2; i++) {
          this.tone('sawtooth', 420 * r(), 260, 0.1, 0.35, o, i * 0.18);
          this.burst(0.08, 0.3, o, 'bandpass', 1200, 800, 3, i * 0.18);
        }
        break;
      case 'splash':
        this.burst(0.8, 0.8, o, 'lowpass', 4000, 300, 0.5);
        this.burst(0.5, 0.4, o, 'highpass', 2000, 5000, 0.5, 0.1);
        break;
      case 'door':
        this.burst(0.1, 0.5, o, 'lowpass', 900, 200, 1);
        this.tone('sine', 120, 70, 0.1, 0.5, o, 0.02);
        break;
      case 'jump':
        this.burst(0.06, 0.15, o, 'lowpass', 800, 300, 1);
        break;
      case 'land':
        this.tone('sine', 110, 50, 0.12, 0.5, o);
        this.burst(0.1, 0.3, o, 'lowpass', 700, 150, 1);
        break;
      case 'cheer':
        for (let i = 0; i < 10; i++) this.babble(o, 2, 0.8 + Math.random() * 0.8, 0.25, Math.random() * 0.5);
        this.burst(1.2, 0.3, o, 'bandpass', 1500, 1200, 0.5);
        break;
      case 'boo':
        for (let i = 0; i < 6; i++) this.tone('sawtooth', 160 + Math.random() * 60, 120, 1, 0.06, o, Math.random() * 0.2, 0.2);
        break;
      case 'slot':
        this.tone('square', 660 * r(), 660, 0.04, 0.12, o);
        break;
      case 'chip':
        this.burst(0.05, 0.5, o, 'bandpass', 3500 * r(), 3000, 3);
        this.burst(0.04, 0.4, o, 'bandpass', 4200 * r(), 3500, 3, 0.05);
        break;
      case 'card':
        this.burst(0.08, 0.35, o, 'highpass', 2500, 4000, 0.8);
        break;
      case 'pop':
        this.tone('sine', 600 * p, 1500, 0.08, 0.4, o);
        break;
      case 'spray':
        this.burst(0.9, 0.3, o, 'highpass', 4000, 5000, 0.5);
        break;
      case 'bell':
        this.tone('sine', 1568, 1568, 0.9, 0.3, o);
        this.tone('sine', 2349, 2349, 0.7, 0.15, o);
        break;
    }
  }

  /** Voz tipo balbuceo (gente quejándose, clientes). voice: 0.6 grave .. 1.6 aguda. */
  babble(dest: AudioNode | null = null, syllables = 5, voice = 1, vol = 0.5, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const o = dest ?? this.out(1, 0);
    const vowels = [[730, 1090], [270, 2290], [300, 870], [530, 1840], [570, 840]];
    let t = ctx.currentTime + delay;
    for (let i = 0; i < syllables; i++) {
      const dur = 0.07 + Math.random() * 0.09;
      const [f1, f2] = vowels[Math.floor(Math.random() * vowels.length)];
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const pitch = (140 + Math.random() * 60) * voice;
      osc.frequency.setValueAtTime(pitch, t);
      osc.frequency.linearRampToValueAtTime(pitch * (0.85 + Math.random() * 0.35), t + dur);
      const b1 = ctx.createBiquadFilter();
      b1.type = 'bandpass';
      b1.frequency.value = f1 * (0.9 + voice * 0.1);
      b1.Q.value = 6;
      const b2 = ctx.createBiquadFilter();
      b2.type = 'bandpass';
      b2.frequency.value = f2 * (0.9 + voice * 0.1);
      b2.Q.value = 8;
      const g = ctx.createGain();
      this.env(g, t, 0.015, vol, dur);
      osc.connect(b1).connect(g);
      osc.connect(b2).connect(g);
      g.connect(o);
      osc.start(t);
      osc.stop(t + dur + 0.05);
      t += dur + 0.02 + Math.random() * 0.05;
    }
  }

  /** Voz balbuceando en una posición del mundo. */
  say(pos: THREE.Vector3 | null, syllables = 5, voice = 1, vol = 0.6) {
    if (!this.ctx) return;
    const { gain, pan } = this.spatial(pos, 60);
    if (gain < 0.02) return;
    this.babble(this.out(gain, pan), syllables, voice, vol);
  }

  // ─────────── Motores ───────────

  /** Llamar cada frame para cada vehículo audible. rpm01 = 0..1; throttle 0..1. */
  engine(id: number, kind: string, pos: THREE.Vector3, rpm01: number, throttle: number, vol = 1) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    let e = this.engines.get(id);
    const electric = kind === 'escooter' || kind === 'cart' || kind === 'golf';
    if (!e) {
      if (this.engines.size >= 5) return;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = electric ? 'sine' : 'sawtooth';
      osc2.type = electric ? 'triangle' : 'square';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 2;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain).connect(pan).connect(this.sfxBus);
      osc1.start();
      osc2.start();
      e = { osc1, osc2, filter, gain, pan, lastSeen: 0, electric };
      this.engines.set(id, e);
    }
    e.lastSeen = ctx.currentTime;
    const base =
      kind === 'scooter' ? 55 : kind === 'sports' ? 38 : kind === 'truck' || kind === 'garbage' || kind === 'crane' || kind === 'armored' ? 20 : kind === 'van' || kind === 'gangvan' || kind === 'policevan' ? 26 : 30;
    const f = electric ? 200 + rpm01 * 900 : base + rpm01 * base * 4.2;
    const t = ctx.currentTime + 0.05;
    e.osc1.frequency.linearRampToValueAtTime(f, t);
    e.osc2.frequency.linearRampToValueAtTime(electric ? f * 1.5 : f * 0.5, t);
    e.filter.frequency.linearRampToValueAtTime(electric ? 2500 : 250 + throttle * 1400 + rpm01 * 900, t);
    const { gain, pan } = this.spatial(pos, 90);
    const g = gain * vol * (electric ? 0.05 : 0.11 + throttle * 0.08);
    e.gain.gain.linearRampToValueAtTime(g, t);
    e.pan.pan.linearRampToValueAtTime(pan, t);
  }

  // ─────────── Bucles (sirena, derrape, fuego) ───────────

  /** Mantiene un bucle sonando mientras se llame cada frame. */
  loop(key: string, kind: 'siren' | 'skid' | 'fire' | 'alarm', pos: THREE.Vector3 | null, vol = 1, param = 0) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    let l = this.loops.get(key);
    if (!l) {
      if (this.loops.size > 8) return;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      gain.connect(pan).connect(this.sfxBus);
      const nodes: AudioNode[] = [];
      let set: ((p: number) => void) | undefined;
      if (kind === 'siren' || kind === 'alarm') {
        const osc = ctx.createOscillator();
        osc.type = kind === 'siren' ? 'sine' : 'square';
        const lfo = ctx.createOscillator();
        lfo.frequency.value = kind === 'siren' ? 0.6 : 3;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = kind === 'siren' ? 320 : 150;
        osc.frequency.value = kind === 'siren' ? 950 : 800;
        lfo.connect(lfoGain).connect(osc.frequency);
        const g2 = ctx.createGain();
        g2.gain.value = kind === 'siren' ? 0.35 : 0.12;
        osc.connect(g2).connect(gain);
        osc.start();
        lfo.start();
        nodes.push(osc, lfo);
      } else {
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = kind === 'skid' ? 'bandpass' : 'lowpass';
        f.frequency.value = kind === 'skid' ? 1800 : 600;
        f.Q.value = kind === 'skid' ? 4 : 0.7;
        src.connect(f).connect(gain);
        src.start();
        nodes.push(src);
        set = (p) => (f.frequency.value = kind === 'skid' ? 1400 + p * 900 : 500 + p * 300);
      }
      l = { nodes, gain, pan, set, lastSeen: 0 };
      this.loops.set(key, l);
    }
    l.lastSeen = ctx.currentTime;
    const { gain, pan } = this.spatial(pos, 160);
    const t = ctx.currentTime + 0.05;
    l.gain.gain.linearRampToValueAtTime(gain * vol, t);
    l.pan.pan.linearRampToValueAtTime(pan, t);
    l.set?.(param);
  }

  postUpdate() {
    const ctx = this.ctx;
    if (!ctx) return;
    // oyente = cámara
    const cam = this.game.camera;
    this.listener.copy(cam.position);
    tmpR.set(1, 0, 0).applyQuaternion(cam.quaternion);
    this.listenerRight.copy(tmpR);
    // apagar motores y bucles que ya no se piden
    const now = ctx.currentTime;
    for (const [id, e] of this.engines) {
      if (now - e.lastSeen > 0.25) {
        e.gain.gain.linearRampToValueAtTime(0, now + 0.1);
        e.osc1.stop(now + 0.15);
        e.osc2.stop(now + 0.15);
        this.engines.delete(id);
      }
    }
    for (const [key, l] of this.loops) {
      if (now - l.lastSeen > 0.25) {
        l.gain.gain.linearRampToValueAtTime(0, now + 0.1);
        for (const n of l.nodes) (n as any).stop?.(now + 0.15);
        this.loops.delete(key);
      }
    }
  }

  pausedUpdate() {
    // en pausa: silenciar motores y bucles
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const e of this.engines.values()) e.gain.gain.setTargetAtTime(0, now, 0.05);
    for (const l of this.loops.values()) l.gain.gain.setTargetAtTime(0, now, 0.05);
  }

  /** Conecta eventos del juego con sonidos. */
  private wireEvents() {
    const ev = this.game.events;
    const pos = (v: any) => {
      try {
        return v?.getPosition ? v.getPosition(new THREE.Vector3()) : null;
      } catch {
        return null;
      }
    };
    ev.on('vehicle:impact' as any, (e: any) => {
      const dv = e.dv as number;
      this.play(dv > 11 ? 'crash' : 'crash_small', { pos: pos(e.vehicle), volume: Math.min(1, dv / 16) });
      if (dv > 14) this.play('glass', { pos: pos(e.vehicle), volume: 0.6 });
    });
    ev.on('vehicle:horn' as any, (e: any) => {
      const k = e.vehicle?.spec?.kind;
      this.play(k === 'scooter' || k === 'escooter' ? 'horn_scooter' : k === 'truck' || k === 'garbage' || k === 'crane' ? 'horn_truck' : 'horn', { pos: pos(e.vehicle) });
    });
    ev.on('vehicle:enter', () => this.play('door', { volume: 0.7 }));
    ev.on('vehicle:exit', () => this.play('door', { volume: 0.6 }));
    ev.on('vehicle:landed' as any, (e: any) => this.play('land', { pos: pos(e.vehicle), volume: Math.min(1, e.air) }));
    ev.on('vehicle:sink' as any, (e: any) => this.play('splash', { pos: pos(e.vehicle) }));
    ev.on('explosion', (e) => this.play(e.big ? 'explosion_big' : 'explosion', { pos: e.pos }));
    ev.on('notify', () => this.play('phone', { volume: 0.7 }));
    ev.on('money', (e) => {
      if (e.delta > 0 && e.reason !== 'banco') this.play('cash', { volume: 0.8 });
    });
    ev.on('player:hurt', (e) => {
      if (e.amount > 3) this.play('hurt', { voice: 0.9 });
    });
    ev.on('player:jump' as any, () => this.play('jump'));
  }
}
