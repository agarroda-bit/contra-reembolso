// LA RADIO de los vehículos: 3 emisoras con música generada por código (Web Audio),
// locutor escrito en pantalla (game.hud.radio) con cuñas de publicidad inventadas,
// ruido de sintonía al cambiar y efecto "colocado" (setDistortion) para las hierbas.
//
// Uso:  const radio = installRadio(game);   // se guarda en game.mod.radio
//       radio.next() / radio.prev() / radio.station = 1 / radio.setDistortion(0.8)
import type { Game, System } from '../../core/game';
import type { AudioEngine } from '../audio';
import { RadioSynth, type RadioStats } from './synth';
import { Station } from './station';
import { PerreoStation } from './stations/perreo';
import { ElectroStation } from './stations/electro';
import { RumbaStation } from './stations/rumba';
import { impulse, spec, type Spec } from './render';
import { STATION_TEXTS, ADS, TRIPPY, Bag } from './texts';

export interface Radio {
  /** Emisora elegida: 0, 1, 2 o -1 (apagada). */
  station: number;
  next(): void;
  prev(): void;
  /** Efecto de las hierbas: 0 = normal, 1 = muy colocado. */
  setDistortion(k: number): void;
  readonly stations: { name: string; dj: string; show: string }[];
}

/** Volumen general de la radio antes del bus de música (medido para que no tape el motor). */
const LEVEL = 0.24;
/** Cuánto se programa por adelantado (s). */
const LOOKAHEAD = 0.3;

/** Cadena de salida común: compresor, filtro, "wow" de cinta, eco y reverb. */
export interface RadioChain {
  /** Entrada de la música (se agacha cuando habla el locutor). */
  music: GainNode;
  /** Entrada de voces y ruidos (sin agachar). */
  voice: GainNode;
  /** Entrada de la reverb. */
  reverb: GainNode;
  out: GainNode;
  wow: DelayNode;
  lpf: BiquadFilterNode;
  echoSend: GainNode;
  conv: ConvolverNode;
  nodes: number;
}

/** Encargo de la respuesta al impulso de la reverb (1,5 s, estéreo). */
export const irSpec = (sr: number) => spec('ir', 'impulse', sr, 1.5);

/** `syncIr`: generar la reverb ya (pruebas offline); si no, se pone luego con `chain.conv.buffer`. */
export function buildChain(ctx: BaseAudioContext, dest: AudioNode, useComp = true, syncIr = true): RadioChain {
  const music = ctx.createGain();
  const voice = ctx.createGain();
  const reverb = ctx.createGain();
  const conv = ctx.createConvolver();
  if (syncIr) {
    const ir = impulse(ctx.sampleRate, 1.5);
    const irb = ctx.createBuffer(2, ir[0].length, ctx.sampleRate);
    irb.copyToChannel(ir[0] as Float32Array<ArrayBuffer>, 0);
    irb.copyToChannel(ir[1] as Float32Array<ArrayBuffer>, 1);
    conv.buffer = irb;
  }
  const revRet = ctx.createGain();
  revRet.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 10;
  comp.ratio.value = 3;
  comp.attack.value = 0.008;
  comp.release.value = 0.2;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 38;
  const wow = ctx.createDelay(0.1);
  wow.delayTime.value = 0.02;
  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 20000;
  lpf.Q.value = 0.7;
  const out = ctx.createGain();
  out.gain.value = 0;
  const pre: AudioNode = useComp ? comp : ctx.createGain();
  music.connect(pre);
  voice.connect(pre);
  reverb.connect(conv).connect(revRet).connect(music);
  pre.connect(hp).connect(wow).connect(lpf).connect(out).connect(dest);
  // eco (solo suena con la distorsión)
  const echoSend = ctx.createGain();
  echoSend.gain.value = 0;
  const echo = ctx.createDelay(1);
  echo.delayTime.value = 0.36;
  const echoLp = ctx.createBiquadFilter();
  echoLp.type = 'lowpass';
  echoLp.frequency.value = 2300;
  const echoFb = ctx.createGain();
  echoFb.gain.value = 0.45;
  lpf.connect(echoSend).connect(echo).connect(echoLp).connect(echoFb).connect(echo);
  echoLp.connect(out);
  return { music, voice, reverb, out, wow, lpf, echoSend, conv, nodes: 16 };
}

type Reason = 'tune' | 'enter' | 'exit' | 'override';

class RadioSystem implements System, Radio {
  name = 'radio';
  readonly stations = STATION_TEXTS.map((s) => ({ name: s.name, dj: s.dj, show: s.show }));
  /** Estadísticas de nodos (para pruebas). */
  get stats(): RadioStats | null {
    return this.rs?.stats ?? null;
  }
  private selected = -1;
  private everSelected = false;
  private playing = -1;
  private override: number | null = null;
  private inVehicle = false;
  private reason: Reason = 'enter';
  // audio
  private rs: RadioSynth | null = null;
  private chain: RadioChain | null = null;
  private st: Station[] = [];
  private jobs: Spec[] = [];
  /** Preparación en segundo plano, una cola por emisora (la que suena va primero). */
  private low: Spec[][] = [[], [], []];
  private outOn = false;
  // distorsión
  private distTarget = 0;
  private dist = 0;
  private distApplied = -1;
  private distTimer = 0;
  private lfos: { nodes: AudioNode[]; wowG: GainNode; flutG: GainNode; lpfG: GainNode } | null = null;
  private idleDist = 0;
  // locutor
  private hudTimer = 0;
  private offTimer = 0;
  private shownSong = '';
  private sinceText = 0;
  private lastReal = 0;
  private phraseBags = STATION_TEXTS.map((s) => new Bag(s.phrases));
  private adBag = new Bag(ADS);
  private trippyBag = new Bag(TRIPPY);
  private adsInRow = 0;
  private talk: (AudioBuffer | null)[] = [null, null, null];
  private adTalk: AudioBuffer | null = null;
  private talkPending = false;

  constructor(private game: Game) {}

  // ─────────── API ───────────

  get station() {
    return this.selected;
  }
  set station(i: number) {
    const v = i >= 0 && i < this.stations.length ? Math.floor(i) : -1;
    if (v === this.selected) return;
    this.selected = v;
    this.everSelected = true;
    this.reason = 'tune';
    this.onSelect();
  }
  next() {
    const i = this.selected < 0 ? 3 : this.selected;
    const n = (i + 1) % 4;
    this.station = n === 3 ? -1 : n;
  }
  prev() {
    const i = this.selected < 0 ? 3 : this.selected;
    const n = (i + 3) % 4;
    this.station = n === 3 ? -1 : n;
  }
  setDistortion(k: number) {
    this.distTarget = Math.max(0, Math.min(1, Number.isFinite(k) ? k : 0));
  }
  /**
   * Hace sonar una emisora aunque vayas a pie (club, menú...). null = volver a lo normal.
   * Si subes a un vehículo, manda la radio del coche. No toca el HUD. En pausa se silencia.
   */
  setOverride(i: number | null) {
    this.override = i === null || i < 0 ? null : Math.min(this.stations.length - 1, Math.floor(i));
    this.reason = 'override';
  }
  /** Qué suena ahora (para la interfaz o para depurar). */
  nowPlaying() {
    const s = this.playing >= 0 ? this.st[this.playing] : null;
    return s ? { station: this.stations[this.playing].name, ...s.info() } : null;
  }

  // ─────────── sistema ───────────

  update(_dt: number) {
    const g = this.game;
    const realDt = Math.min(0.1, Math.max(0, g.time.real - this.lastReal));
    this.lastReal = g.time.real;
    const inV = !!g.mod.vehicles?.current;
    if (inV !== this.inVehicle) {
      this.inVehicle = inV;
      if (inV) {
        if (!this.everSelected) {
          this.selected = Math.floor(Math.random() * this.stations.length);
          this.everSelected = true;
        }
        this.reason = 'enter';
        this.onSelect();
      } else this.reason = 'exit';
    }
    if (inV && g.input.enabled) {
      if (g.input.pressed('radioNext')) this.next();
      if (g.input.pressed('radioPrev')) this.prev();
    }
    this.audio(false, realDt);
    this.hud(realDt);
  }

  pausedUpdate(realDt: number) {
    this.lastReal = this.game.time.real;
    this.audio(true, realDt);
  }

  // ─────────── audio ───────────

  private build(eng: AudioEngine) {
    const ctx = eng.ctx!;
    const rs = new RadioSynth(ctx);
    this.rs = rs;
    rs.useWorker();
    this.chain = buildChain(ctx, eng.musicBus, true, false);
    rs.stats.fixed += this.chain.nodes;
    const conv = this.chain.conv;
    rs.prefetch(irSpec(rs.sr), (b) => (conv.buffer = b), false);
    const seed = (Math.random() * 1e9) | 0;
    this.st = [
      new PerreoStation(rs, this.chain.music, this.chain.reverb, seed + 1),
      new ElectroStation(rs, this.chain.music, this.chain.reverb, seed + 2),
      new RumbaStation(rs, this.chain.music, this.chain.reverb, seed + 3),
    ];
    // ir preparando las tres emisoras en segundo plano (worker) desde ya, sin prisa
    this.st.forEach((s, i) => {
      s.enqueue = (j) => this.low[i].push(...j);
      s.warm();
      s.enqueue = (j) => this.jobs.push(...j);
    });
  }

  private audio(paused: boolean, realDt: number) {
    const eng = this.game.mod.audio as AudioEngine | undefined;
    const ctx = eng?.ctx;
    if (!eng || !ctx) return;
    if (!this.rs) this.build(eng);
    const chain = this.chain!;
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    // en el coche manda la radio del coche; a pie, la emisora "forzada" (club, menú...) si la hay
    const want = this.inVehicle ? this.selected : (this.override ?? -1);
    if (want !== this.playing) this.switchTo(want, now);
    // volumen general: pausa y encendido
    const on = !paused && this.playing >= 0;
    if (on !== this.outOn) {
      this.outOn = on;
      chain.out.gain.cancelScheduledValues(now);
      chain.out.gain.setTargetAtTime(on ? LEVEL : 0, now, on ? 0.05 : paused ? 0.03 : 0.12);
    }
    if (!paused && this.playing >= 0) this.st[this.playing].tick(now, LOOKAHEAD);
    this.distortion(now, realDt);
    // tareas de pre-renderizado repartidas entre frames
    if (!paused) this.runJobs();
  }

  private runJobs() {
    const rs = this.rs!;
    // sin worker, se generan aquí como mucho 3 ms por frame
    rs.pumpJobs(3);
    // pocos encargos a la vez: así lo de la emisora que suena va siempre primero
    while (rs.busy < 3) {
      const q = this.jobs.length ? this.jobs : this.playing >= 0 && this.low[this.playing].length ? this.low[this.playing] : this.low.find((l) => l.length);
      if (!q) break;
      rs.prefetch(q.shift()!);
    }
  }

  private switchTo(want: number, now: number) {
    const reason = this.reason;
    const prev = this.playing;
    if (prev >= 0) this.st[prev].stop(now, reason === 'exit' ? 0.35 : 0.08);
    let delay = 0.02;
    if (want >= 0 && reason === 'tune') {
      this.tuning(now, 0.3, 0.2);
      delay = 0.26;
    } else if (want >= 0 && reason === 'enter') {
      this.tuning(now, 0.14, 0.09);
      delay = 0.1;
    } else if (want < 0 && reason === 'tune') this.tuning(now, 0.12, 0.12);
    if (want >= 0) this.st[want].start(now + delay, reason === 'tune' ? 0.2 : 0.35);
    this.playing = want;
  }

  /** Ruido de sintonía: estática con un silbido que barre (como buscar emisora). */
  private tuning(t: number, dur: number, vol: number) {
    const rs = this.rs!, ctx = rs.ctx, dest = this.chain!.voice;
    rs.owner = null;
    const src = ctx.createBufferSource();
    src.buffer = rs.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + dur * 0.4);
    bp.frequency.exponentialRampToValueAtTime(1400, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.setValueAtTime(vol, t + dur - 0.05);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(bp).connect(g).connect(dest);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
    rs.track(src, [bp, g]);
    // silbido de heterodino
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(1800 + Math.random() * 800, t);
    o.frequency.exponentialRampToValueAtTime(400 + Math.random() * 300, t + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(vol * 0.12, t + 0.03);
    og.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(og).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
    rs.track(o, [og]);
  }

  /** Aplica el efecto "colocado": ondulación de tono, filtro que respira y eco. */
  private distortion(now: number, realDt: number) {
    const chain = this.chain!, ctx = this.rs!.ctx;
    this.dist += (this.distTarget - this.dist) * Math.min(1, realDt * 1.5);
    if (Math.abs(this.dist - this.distTarget) < 0.002) this.dist = this.distTarget;
    const k = this.dist;
    if (k > 0 && !this.lfos) {
      // osciladores lentos (solo existen mientras dura el efecto)
      const wowO = ctx.createOscillator();
      wowO.frequency.value = 0.42;
      const flutO = ctx.createOscillator();
      flutO.frequency.value = 5.1;
      const lpfO = ctx.createOscillator();
      lpfO.frequency.value = 0.13;
      const wowG = ctx.createGain(), flutG = ctx.createGain(), lpfG = ctx.createGain();
      wowG.gain.value = flutG.gain.value = lpfG.gain.value = 0;
      wowO.connect(wowG).connect(chain.wow.delayTime);
      flutO.connect(flutG).connect(chain.wow.delayTime);
      lpfO.connect(lpfG).connect(chain.lpf.frequency);
      for (const o of [wowO, flutO, lpfO]) o.start();
      this.lfos = { nodes: [wowO, flutO, lpfO, wowG, flutG, lpfG], wowG, flutG, lpfG };
      this.rs!.stats.fixed += 6;
    }
    this.distTimer -= realDt;
    if (this.lfos && this.distTimer <= 0 && Math.abs(k - this.distApplied) > 0.001) {
      this.distTimer = 0.1;
      this.distApplied = k;
      const tc = 0.08;
      const base = 20000 * Math.pow(1900 / 20000, k);
      this.lfos.wowG.gain.setTargetAtTime(k * 0.0085, now, tc);
      this.lfos.flutG.gain.setTargetAtTime(k * 0.0005, now, tc);
      this.lfos.lpfG.gain.setTargetAtTime(base * 0.7 * k, now, tc);
      chain.lpf.frequency.setTargetAtTime(base, now, tc);
      chain.lpf.Q.setTargetAtTime(0.7 + 2.6 * k, now, tc);
      chain.echoSend.gain.setTargetAtTime(k * 0.45, now, tc);
    }
    // apagar los osciladores si lleva un rato sin efecto
    if (this.lfos && k === 0) {
      this.idleDist += realDt;
      if (this.idleDist > 2) {
        for (const n of this.lfos.nodes) {
          try { (n as OscillatorNode).stop?.(); } catch { /* */ }
          n.disconnect();
        }
        this.rs!.stats.fixed -= 6;
        this.lfos = null;
        this.distApplied = -1;
        chain.lpf.frequency.setTargetAtTime(20000, now, 0.05);
      }
    } else this.idleDist = 0;
  }

  // ─────────── locutor (texto en pantalla) ───────────

  private onSelect() {
    if (this.selected < 0) {
      this.offTimer = 3;
      if (this.inVehicle) this.game.hud.radio = { station: '📻 Radio apagada', show: 'Q / E para cambiar de emisora' };
    } else this.showStationIntro();
  }

  private showStationIntro() {
    const t = STATION_TEXTS[this.selected];
    this.setText(`🎙️ «${t.show}» con ${t.dj}`);
    this.hudTimer = 7;
    this.shownSong = '';
  }

  private setText(show: string) {
    const i = this.selected;
    if (i < 0 || !this.inVehicle) return;
    this.game.hud.radio = { station: this.stations[i].name, show };
    this.sinceText = 0;
  }

  private hud(dt: number) {
    const g = this.game;
    if (!this.inVehicle) {
      if (g.hud.radio) g.hud.radio = null;
      return;
    }
    if (this.selected < 0) {
      this.offTimer -= dt;
      const want = this.offTimer > 0;
      if (want && !g.hud.radio) g.hud.radio = { station: '📻 Radio apagada', show: 'Q / E para cambiar de emisora' };
      else if (!want && g.hud.radio) g.hud.radio = null;
      return;
    }
    if (!g.hud.radio) this.showStationIntro();
    this.hudTimer -= dt;
    this.sinceText += dt;
    const i = this.selected;
    const np = this.playing === i ? this.st[i]?.info() : null;
    const newSong = !!np && np.title !== this.shownSong;
    if (this.hudTimer <= 0 || (newSong && this.shownSong !== '' && this.sinceText > 10)) {
      this.hudTimer = 30 + Math.random() * 15;
      if (newSong) {
        // canción nueva (o la que suena al sintonizar): el locutor la presenta sobre la intro
        const changed = this.shownSong !== '';
        this.shownSong = np!.title;
        this.setText(`🎵 Ahora suena: «${np!.title}», de ${np!.artist}`);
        if (changed) this.speak(false);
        return;
      }
      const t = STATION_TEXTS[i];
      const trippy = this.dist > 0.3 && Math.random() < 0.6;
      const ad = !trippy && this.adsInRow < 2 && Math.random() < 0.4;
      if (trippy) this.setText(`🎙️ ${t.dj}: «${this.trippyBag.next()}»`);
      else if (ad) this.setText('📢 ' + this.adBag.next());
      else this.setText(`🎙️ ${t.dj}: «${this.phraseBags[i].next()}»`);
      this.adsInRow = ad ? this.adsInRow + 1 : 0;
      this.speak(ad);
    }
    // tener preparada la próxima voz del locutor (se genera en el worker)
    const rs = this.rs;
    if (rs && !this.talkPending && (!this.talk[i] || !this.adTalk)) {
      this.talkPending = true;
      const v = STATION_TEXTS[i].voice;
      const forAd = !!this.talk[i];
      const sp = forAd
        ? spec('talk', 'renderTalk', rs.sr, 1.8 + Math.random() * 0.8, 150, 1.06, 1.35, 1.5)
        : spec('talk', 'renderTalk', rs.sr, 1.6 + Math.random() * 1.2, v.base, v.fscale, 1.05, v.energy);
      rs.prefetch(sp, (b) => {
        this.talkPending = false;
        if (forAd) this.adTalk = b;
        else this.talk[i] = b;
      }, false);
    }
  }

  /** El locutor "habla" (balbuceo) un momento y la música se agacha. */
  private speak(ad: boolean) {
    const rs = this.rs, chain = this.chain;
    const i = this.playing;
    if (!rs || !chain || i < 0 || rs.ctx.state !== 'running' || this.game.paused) return;
    const buf = ad ? this.adTalk : this.talk[i];
    if (!buf) return;
    if (ad) this.adTalk = null;
    else this.talk[i] = null;
    const t = rs.ctx.currentTime + 0.05;
    rs.owner = null;
    rs.play(chain.voice, t, buf, 0.5);
    const d = chain.music.gain;
    d.cancelScheduledValues(t);
    d.setTargetAtTime(0.45, t - 0.03, 0.06);
    d.setTargetAtTime(1, t + buf.duration, 0.25);
  }
}

/** Crea la radio, la registra como sistema y la guarda en game.mod.radio. */
export function installRadio(game: Game): Radio {
  const r = new RadioSystem(game);
  game.addSystem(r);
  game.mod.radio = r;
  return r;
}

export type RadioSystemType = RadioSystem;

/**
 * Renderiza `secs` segundos de una emisora en un contexto offline (para análisis en pruebas).
 * Devuelve el AudioBuffer estéreo resultante y las estadísticas de nodos.
 */
export async function renderStationOffline(index: number, secs: number, sampleRate = 44100, seed = 12345, songIndex?: number, fromBar = 0, mute: string[] = [], useComp = true) {
  const off = new OfflineAudioContext(2, Math.ceil(secs * sampleRate), sampleRate);
  const rs = new RadioSynth(off);
  const chain = buildChain(off, off.destination, useComp, true);
  chain.out.gain.value = LEVEL;
  const Cls = [PerreoStation, ElectroStation, RumbaStation][index];
  const st = new Cls(rs, chain.music, chain.reverb, seed);
  if (songIndex !== undefined) st.songIndex = songIndex;
  st.warm();
  // silenciar pistas (para analizar solo la armonía, por ejemplo)
  for (const m of mute) {
    const c = (st as any).ch?.[m];
    if (c) c.input.gain.value = 0;
  }
  // desde el compás `fromBar` de la canción
  (st as any).timeline = true;
  (st as any).songStart = -fromBar * (240 / st.song.bpm);
  st.renderAhead(0, secs);
  const buf = await off.startRendering();
  return { buf, stats: { ...rs.stats }, info: st.info(), song: st.song };
}
