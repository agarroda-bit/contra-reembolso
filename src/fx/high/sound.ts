// Zumbido cósmico mientras dura el efecto: un acorde grave que respira, con un filtro
// que hace «guau-guau» y que viaja de un oído a otro. Todo por Web Audio, volumen prudente.
import type { AudioEngine } from '../../audio/audio';

const MAX_GAIN = 0.07; // volumen del zumbido a tope (antes del bus de efectos)

export class CosmicHum {
  private out: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private oscs: OscillatorNode[] = [];
  private lastSet = -1;
  private retry = 0;
  /** Nodos vivos creados por el zumbido (para comprobar que se liberan). */
  live = 0;

  constructor(private readonly getAudio: () => AudioEngine | undefined) {}

  private build(): boolean {
    const a = this.getAudio();
    const ctx = a?.ctx;
    if (!a || !ctx || ctx.state !== 'running' || !a.sfxBus) return false;
    const now = ctx.currentTime;
    const track = <T extends AudioNode>(n: T): T => {
      this.nodes.push(n);
      if (n instanceof OscillatorNode) this.oscs.push(n);
      return n;
    };
    const osc = (type: OscillatorType, f: number, detune = 0) => {
      const o = track(ctx.createOscillator());
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      return o;
    };
    const gain = (v: number) => {
      const g = track(ctx.createGain());
      g.gain.value = v;
      return g;
    };

    const out = gain(0);
    out.connect(a.sfxBus);
    // paneo que viaja de lado a lado
    const pan = track(ctx.createStereoPanner());
    pan.connect(out);
    const panLfo = osc('sine', 0.09);
    panLfo.connect(gain(0.7)).connect(pan.pan);
    // filtro «guau-guau»
    const filter = track(ctx.createBiquadFilter());
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.Q.value = 2;
    filter.connect(pan);
    const fLfo = osc('sine', 0.17);
    fLfo.connect(gain(420)).connect(filter.frequency);
    // trémolo lento
    const trem = gain(0.75);
    trem.connect(filter);
    const tLfo = osc('sine', 3.3);
    tLfo.connect(gain(0.22)).connect(trem.gain);
    // el acorde: sol grave, re y sol (quinta y octava), un pelín desafinados
    osc('sine', 98).connect(gain(0.5)).connect(trem);
    osc('sawtooth', 147, 8).connect(gain(0.12)).connect(trem);
    osc('triangle', 196, -7).connect(gain(0.25)).connect(trem);

    for (const o of this.oscs) o.start(now);
    this.out = out;
    this.live = this.nodes.length;
    this.lastSet = -1;
    return true;
  }

  /** Llamar cada frame mientras dura el efecto. */
  update(realDt: number, level: number) {
    if (!this.out) {
      // el audio puede no estar desbloqueado todavía: reintento cada segundo
      this.retry -= realDt;
      if (this.retry > 0 || level <= 0.01) return;
      this.retry = 1;
      if (!this.build()) return;
    }
    // no saturar el reloj de audio: solo si cambia algo de verdad
    if (Math.abs(level - this.lastSet) < 0.02) return;
    this.lastSet = level;
    const ctx = this.out!.context;
    this.out!.gain.setTargetAtTime(MAX_GAIN * level, ctx.currentTime, 0.15);
  }

  /** Apaga con un fundido corto y libera todos los nodos. */
  stop() {
    const out = this.out;
    this.retry = 0;
    if (!out) return;
    const ctx = out.context;
    const now = ctx.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setValueAtTime(out.gain.value, now);
    out.gain.linearRampToValueAtTime(0, now + 0.35);
    const nodes = this.nodes;
    const oscs = this.oscs;
    this.nodes = [];
    this.oscs = [];
    this.out = null;
    let pending = oscs.length;
    const done = () => {
      if (--pending > 0) return;
      for (const n of nodes) n.disconnect();
      this.live = Math.max(0, this.live - nodes.length);
    };
    for (const o of oscs) {
      o.onended = done;
      o.stop(now + 0.4);
    }
    if (!oscs.length) done();
  }

  /** «¡Plop!» y un murmullo cuando aparece una frase. */
  blip(text: string) {
    const a = this.getAudio();
    if (!a?.ctx || a.ctx.state !== 'running') return;
    a.play('pop', { pitch: 0.45 + Math.random() * 0.3, volume: 0.3 });
    const words = text.split(' ').length;
    a.babble(null, Math.min(7, 2 + Math.ceil(words / 2)), 0.7 + Math.random() * 0.25, 0.16, 0.08);
  }
}
