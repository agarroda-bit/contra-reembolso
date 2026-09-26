// Sonido del casino: usa los efectos del AudioEngine (game.mod.audio.play) y añade unos pocos
// propios sintetizados (golpe de rodillo, palanca, monedas, fanfarria, bola de la ruleta) y una
// música de salón hortera que suena mientras el casino está abierto. Todo con ganancias prudentes.
import type { Game } from '../../core/game';
import type { AudioEngine, Sfx, PlayOpts } from '../../audio/audio';

// Progresión de salón: Cmaj7 – Am7 – Dm7 – G7 (notas MIDI)
const ACORDES = [
  { raiz: 48, notas: [60, 64, 67, 71] },
  { raiz: 45, notas: [57, 60, 64, 67] },
  { raiz: 50, notas: [62, 65, 69, 72] },
  { raiz: 43, notas: [59, 62, 65, 67] },
];
const PENTA = [72, 74, 76, 79, 81, 84];
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class SonidoCasino {
  private musica: GainNode | null = null;
  private musicaCtx: AudioContext | null = null;
  private siguiente = 0;
  private pulso = 0;
  musicaActiva = true;
  private ruido: AudioBuffer | null = null;
  private ruidoCtx: AudioContext | null = null;
  /** Fuentes propias sonando ahora mismo (para comprobar que se liberan). */
  vivas = 0;
  creadas = 0;
  private ultimoTic = 0;

  constructor(private game: Game) {}

  private get audio(): AudioEngine | undefined {
    return this.game.mod.audio as AudioEngine | undefined;
  }

  /** Contexto de audio si está listo y sonando. */
  private ctx(): AudioContext | null {
    const c = this.audio?.ctx;
    return c && c.state === 'running' ? c : null;
  }

  /** Intenta despertar el audio (tras un gesto del jugador). */
  despertar() {
    const a = this.audio;
    if (!a) return;
    try {
      a.ensure();
      if (a.ctx?.state === 'suspended') a.ctx.resume().catch(() => {});
    } catch {
      /* sin audio */
    }
  }

  /** Efecto del motor de audio del juego. */
  play(name: Sfx, opts?: PlayOpts) {
    try {
      this.audio?.play(name, opts);
    } catch {
      /* sin audio: que no falle */
    }
  }

  // ─────────── utilidades ───────────

  private salida(ctx: AudioContext, vol: number): GainNode {
    const g = ctx.createGain();
    g.gain.value = vol;
    g.connect(this.audio!.sfxBus);
    return g;
  }

  private seguir(src: AudioScheduledSourceNode) {
    this.vivas++;
    this.creadas++;
    src.onended = () => {
      this.vivas--;
      try {
        src.disconnect();
      } catch {
        /* ya desconectado */
      }
    };
  }

  private tono(ctx: AudioContext, dest: AudioNode, tipo: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number, ataque = 0.005) {
    const o = ctx.createOscillator();
    o.type = tipo;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ataque + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + ataque + dur + 0.03);
    this.seguir(o);
  }

  private bufferRuido(ctx: AudioContext): AudioBuffer {
    if (this.ruido && this.ruidoCtx === ctx) return this.ruido;
    const len = Math.floor(ctx.sampleRate * 1);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.ruido = b;
    this.ruidoCtx = ctx;
    return b;
  }

  private chasquido(ctx: AudioContext, dest: AudioNode, t: number, dur: number, vol: number, frec: number, q = 2, tipo: BiquadFilterType = 'bandpass') {
    const s = ctx.createBufferSource();
    s.buffer = this.bufferRuido(ctx);
    const f = ctx.createBiquadFilter();
    f.type = tipo;
    f.frequency.value = frec;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 0.8, dur + 0.05);
    this.seguir(s);
  }

  // ─────────── efectos propios ───────────

  /** Tic del rodillo (limitado para que no sea una ametralladora). */
  tic(vol = 0.5) {
    const c = this.ctx();
    if (!c) return;
    if (c.currentTime - this.ultimoTic < 0.06) return;
    this.ultimoTic = c.currentTime;
    this.play('slot', { volume: vol });
  }

  /** Golpe seco del rodillo al parar. */
  golpeRodillo() {
    const c = this.ctx();
    if (!c) return;
    const o = this.salida(c, 0.5);
    const t = c.currentTime;
    this.tono(c, o, 'sine', 150, 55, t, 0.12, 0.45);
    this.chasquido(c, o, t, 0.05, 0.25, 1400, 1.5);
  }

  /** Palanca: carraca y muelle. */
  palanca() {
    const c = this.ctx();
    if (!c) return;
    const o = this.salida(c, 0.4);
    const t = c.currentTime;
    for (let i = 0; i < 6; i++) this.chasquido(c, o, t + i * 0.035, 0.03, 0.4, 2600 - i * 180, 4);
    this.tono(c, o, 'triangle', 320, 140, t + 0.25, 0.25, 0.25);
  }

  /** Lluvia de monedas (n tintineos). */
  monedas(n: number) {
    const c = this.ctx();
    if (!c) return;
    const o = this.salida(c, 0.3);
    const t = c.currentTime + 0.05;
    const k = Math.min(18, Math.max(1, n));
    for (let i = 0; i < k; i++) {
      const f = i % 2 ? 1319 : 988;
      this.tono(c, o, 'square', f * (0.98 + Math.random() * 0.04), f, t + i * 0.075, 0.09, 0.12);
      this.tono(c, o, 'sine', f * 2, f * 2, t + i * 0.075 + 0.02, 0.12, 0.06);
    }
  }

  /** Fanfarria de premio gordo. */
  fanfarria() {
    const c = this.ctx();
    if (!c) return;
    const o = this.salida(c, 0.35);
    const t = c.currentTime + 0.05;
    const notas = [60, 64, 67, 72, 67, 72, 76, 79];
    notas.forEach((n, i) => {
      this.tono(c, o, 'square', midi(n), midi(n), t + i * 0.1, 0.16, 0.12);
      this.tono(c, o, 'triangle', midi(n - 12), midi(n - 12), t + i * 0.1, 0.16, 0.12);
    });
    const fin = t + notas.length * 0.1;
    for (const n of [72, 76, 79, 84]) {
      this.tono(c, o, 'square', midi(n), midi(n), fin, 0.9, 0.07, 0.02);
      this.tono(c, o, 'sine', midi(n) * 1.005, midi(n), fin, 1.1, 0.06, 0.02);
    }
  }

  /** Tensión: trémolo que sube (el tercer rodillo tarda...). */
  suspense(dur = 1) {
    const c = this.ctx();
    if (!c) return;
    const o = this.salida(c, 0.25);
    const t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(330, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + dur);
    const g = c.createGain();
    const lfo = c.createOscillator();
    lfo.frequency.value = 14;
    const lg = c.createGain();
    lg.gain.value = 0.08;
    g.gain.value = 0.1;
    lfo.connect(lg).connect(g.gain);
    osc.connect(g).connect(o);
    g.gain.setValueAtTime(0.1, t + dur - 0.05);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
    this.seguir(osc);
    this.seguir(lfo);
  }

  /** Barajar: ráfaga de naipes. */
  barajar() {
    const c = this.ctx();
    if (!c) return;
    const o = this.salida(c, 0.35);
    const t = c.currentTime;
    for (let i = 0; i < 16; i++) this.chasquido(c, o, t + i * 0.045 + Math.random() * 0.01, 0.04, 0.3, 3500 + Math.random() * 1500, 0.8, 'highpass');
  }

  /**
   * La bola de la ruleta: rodar por la pista (ruido que se va apagando y agravando) hasta
   * `tCaida`, y golpecitos en los instantes de `golpes` (segundos desde ahora).
   */
  bolaRuleta(tCaida: number, golpes: { t: number; v: number }[]) {
    const c = this.ctx();
    if (!c) return;
    const o = this.salida(c, 0.6);
    const t0 = c.currentTime + 0.02;
    // rodar
    const s = c.createBufferSource();
    s.buffer = this.bufferRuido(c);
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(2600, t0);
    f.frequency.exponentialRampToValueAtTime(700, t0 + tCaida + 0.4);
    const trem = c.createGain();
    trem.gain.value = 0.7;
    const lfo = c.createOscillator();
    lfo.frequency.setValueAtTime(9, t0);
    lfo.frequency.linearRampToValueAtTime(4, t0 + tCaida);
    const lg = c.createGain();
    lg.gain.value = 0.3;
    lfo.connect(lg).connect(trem.gain);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.16, t0 + 0.15);
    g.gain.linearRampToValueAtTime(0.1, t0 + tCaida);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + tCaida + 0.5);
    s.connect(f).connect(trem).connect(g).connect(o);
    s.start(t0);
    s.stop(t0 + tCaida + 0.6);
    lfo.start(t0);
    lfo.stop(t0 + tCaida + 0.6);
    this.seguir(s);
    this.seguir(lfo);
    // golpes contra rombos y trastes
    let n = 0;
    for (const gp of golpes) {
      if (n++ > 40) break;
      const v = Math.min(1, gp.v);
      const tt = t0 + gp.t;
      this.chasquido(c, o, tt, 0.035, 0.12 + 0.35 * v, 2200 + Math.random() * 1400, 3);
      this.tono(c, o, 'sine', 1900 + Math.random() * 600, 1500, tt, 0.04, 0.05 + 0.1 * v);
    }
  }

  // ─────────── música de salón ───────────

  /** Llamar cada frame mientras el casino está abierto: programa la música con antelación. */
  tick() {
    const c = this.ctx();
    if (!c || !this.audio) return;
    if (!this.musicaActiva) return;
    if (!this.musica || this.musicaCtx !== c) {
      this.musica = c.createGain();
      this.musica.gain.value = 0.0001;
      this.musica.gain.linearRampToValueAtTime(0.9, c.currentTime + 1.2);
      this.musica.connect(this.audio.musicBus);
      this.musicaCtx = c;
      this.siguiente = c.currentTime + 0.1;
      this.pulso = 0;
    }
    const negra = 60 / 104;
    if (this.siguiente < c.currentTime - 0.2) this.siguiente = c.currentTime + 0.05; // volvemos de segundo plano
    while (this.siguiente < c.currentTime + 0.25) {
      this.programarPulso(c, this.musica, this.siguiente, this.pulso, negra);
      this.siguiente += negra;
      this.pulso++;
    }
  }

  private programarPulso(c: AudioContext, dest: AudioNode, t: number, p: number, negra: number) {
    const compas = Math.floor(p / 4) % ACORDES.length;
    const tiempo = p % 4;
    const ac = ACORDES[compas];
    const swing = negra * 0.62;
    // contrabajo andando (raíz, tercera, quinta, aproximación)
    const pasos = [0, 4, 7, tiempo === 3 ? 11 : 9];
    const nb = ac.raiz + pasos[tiempo] - 12;
    this.tono(c, dest, 'triangle', midi(nb), midi(nb), t, negra * 0.8, 0.13, 0.01);
    this.tono(c, dest, 'sine', midi(nb + 12), midi(nb + 12), t, negra * 0.5, 0.03, 0.01);
    // piano eléctrico: acorde en el 1 y en el "y" del 2
    if (tiempo === 0 || tiempo === 1) {
      const tt = tiempo === 0 ? t : t + swing;
      for (const n of ac.notas) {
        this.tono(c, dest, 'sine', midi(n), midi(n), tt, negra * (tiempo === 0 ? 1.2 : 0.5), 0.028, 0.01);
        this.tono(c, dest, 'triangle', midi(n) * 2.001, midi(n) * 2, tt, negra * 0.25, 0.006, 0.005);
      }
    }
    // platillo con escobilla (ride con swing) y charles en 2 y 4
    this.chasquido(c, dest, t, 0.09, 0.022, 7000, 0.7, 'highpass');
    this.chasquido(c, dest, t + swing, 0.06, 0.014, 7500, 0.7, 'highpass');
    if (tiempo === 1 || tiempo === 3) this.chasquido(c, dest, t, 0.05, 0.03, 5000, 1, 'bandpass');
    // vibráfono: alguna nota suelta
    if (Math.random() < 0.3) {
      const n = PENTA[Math.floor(Math.random() * PENTA.length)];
      const tt = t + (Math.random() < 0.5 ? 0 : swing);
      this.tono(c, dest, 'sine', midi(n), midi(n), tt, negra * 1.4, 0.035, 0.005);
      this.tono(c, dest, 'sine', midi(n) * 4, midi(n) * 4, tt, negra * 0.3, 0.006, 0.003);
    }
  }

  /** Apaga la música con un fundido. */
  pararMusica() {
    const m = this.musica;
    const c = this.musicaCtx;
    this.musica = null;
    this.musicaCtx = null;
    if (!m || !c) return;
    try {
      m.gain.cancelScheduledValues(c.currentTime);
      m.gain.setValueAtTime(m.gain.value, c.currentTime);
      m.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.35);
    } catch {
      /* nada */
    }
    setTimeout(() => {
      try {
        m.disconnect();
      } catch {
        /* nada */
      }
    }, 600);
  }

  alternarMusica(): boolean {
    this.musicaActiva = !this.musicaActiva;
    if (!this.musicaActiva) this.pararMusica();
    return this.musicaActiva;
  }
}
