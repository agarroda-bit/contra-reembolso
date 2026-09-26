// Emisora = secuenciador con planificación anticipada sobre el reloj de audio.
// Cada emisora tiene su "línea de tiempo virtual": aunque no la escuches, sigue sonando
// (como una radio de verdad). Al volver, entra por donde vaya la canción.
import type { RadioSynth } from './synth';
import type { Spec } from './render';
import { makeRng, type Chord, type Rng } from './theory';

export type SectionKind =
  | 'intro' | 'verse' | 'pre' | 'chorus' | 'bridge' | 'build' | 'drop' | 'break' | 'groove' | 'solo' | 'outro' | 'jingle';

export interface Section {
  kind: SectionKind;
  bars: number;
  /** Un acorde por compás (si hay menos, se repiten en bucle). */
  chords: Chord[];
  /** Cuántas veces ha salido ya este tipo de sección antes (0 = primera). */
  n: number;
}

export interface Song {
  index: number;
  seed: number;
  title: string;
  artist: string;
  bpm: number;
  /** Tónica (clase de altura: 0 = do, 9 = la). */
  key: number;
  sections: Section[];
  bars: number;
}

/** Todo lo que un paso (semicorchea) necesita saber para tocar. */
export interface Step<S extends Song = Song> {
  song: S;
  sec: Section;
  secIdx: number;
  bar: number;
  barInSec: number;
  /** Semicorchea dentro del compás (0..15). */
  s: number;
  chord: Chord;
  nextChord: Chord;
  /** Último compás de una frase de 8 o de la sección: toca redoble. */
  fill: boolean;
  lastBar: boolean;
  next: Section | null;
  stepDur: number;
  barDur: number;
}

const FULL = 18000;

export abstract class Station<S extends Song = Song> {
  abstract readonly id: string;
  /** Volumen de la emisora (fundidos al cambiar). */
  readonly out: GainNode;
  /** Mezcla de canales antes del filtro de intro/outro. */
  readonly bus: GainNode;
  readonly filter: BiquadFilterNode;
  /** Envío a la reverb común (se funde junto con `out`). */
  readonly rev: GainNode;
  /** Fuentes programadas o sonando de esta emisora (para cortarlas al cambiar). */
  readonly active = new Set<AudioScheduledSourceNode>();
  song!: S;
  songIndex: number;
  running = false;
  /** Encargos de muestras: la radio los manda al worker (por defecto, se generan ya). */
  enqueue: (specs: Spec[]) => void = (specs) => specs.forEach((sp) => this.rs.need(sp));
  protected swing = 0;
  protected rng: Rng;
  private songStart = 0;
  private stepPos = 0;
  private nextTime = 0;
  private barSec: number[] = [];
  private barIn: number[] = [];
  private secCount = new Map<string, number>();
  private ready = false;
  private timeline = false;
  private resumed = false;
  private st!: Step<S>;

  constructor(readonly rs: RadioSynth, dest: AudioNode, revIn: AudioNode, readonly seed: number) {
    const ctx = rs.ctx;
    this.bus = ctx.createGain();
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = FULL;
    this.filter.Q.value = 0.9;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.bus.connect(this.filter).connect(this.out).connect(dest);
    this.rev = ctx.createGain();
    this.rev.gain.value = 0;
    this.rev.connect(revIn);
    rs.stats.fixed += 4;
    this.rng = makeRng(seed);
    this.songIndex = Math.floor(this.rng() * 1000);
  }

  /** Crea los canales de mezcla (una vez, al primer uso). */
  protected abstract setup(): void;
  protected abstract makeSong(index: number): S;
  /** Toca lo que corresponda en este paso, a la hora `t` (con swing ya aplicado). */
  protected abstract play(st: Step<S>, t: number): void;
  /** Muestras fijas que conviene tener listas (batería, voces...). */
  abstract prepJobs(): Spec[];
  /** Muestras que dependen de la canción (notas de guitarra, voces en su tono...). */
  protected songJobs(_song: S): Spec[] {
    return [];
  }
  /** Se llama al empezar cada compás (automatizaciones). */
  protected onBar(_st: Step<S>, _t: number): void {}
  /** Se llama al parar la emisora (soltar referencias). */
  protected onStop(): void {}
  /** Se llama al arrancar a mitad de compás: recalcular el estado del compás (acorde, frase...). */
  protected onResume(_st: Step<S>): void {}

  /** Frecuencia del filtro general según la posición (intros que se abren, outros que se cierran). */
  protected cutoff(sec: Section, barInSec: number, frac: number): number {
    const p = (barInSec + frac) / sec.bars;
    if (sec.kind === 'intro' && sec.n === 0) return 600 * Math.pow(FULL / 600, Math.min(1, p * 1.15));
    if (sec.kind === 'outro') return FULL * Math.pow(900 / FULL, p);
    return FULL;
  }

  get bpm() {
    return this.song?.bpm ?? 100;
  }
  stepDur(song: S = this.song) {
    return 60 / song.bpm / 4;
  }
  songDur(song: S = this.song) {
    return song.bars * 16 * this.stepDur(song);
  }

  /** Construye una canción añadiendo el número de aparición a cada sección y el jingle final. */
  protected finishSong(song: Omit<S, 'bars'> & { bars?: number }): S {
    this.secCount.clear();
    for (const sec of song.sections) {
      const c = this.secCount.get(sec.kind) ?? 0;
      sec.n = c;
      this.secCount.set(sec.kind, c + 1);
    }
    (song as S).bars = song.sections.reduce((a, s) => a + s.bars, 0);
    return song as S;
  }

  private load(song: S, prepare: boolean) {
    this.song = song;
    this.barSec.length = 0;
    this.barIn.length = 0;
    song.sections.forEach((sec, i) => {
      for (let b = 0; b < sec.bars; b++) {
        this.barSec.push(i);
        this.barIn.push(b);
      }
    });
    if (prepare) this.enqueue(this.songJobs(song));
  }

  private advanceSong(prepare: boolean) {
    this.songIndex++;
    this.load(this.makeSong(this.songIndex), prepare);
  }

  /** Prepara canales, muestras y la primera canción sin sonar (para que el cambio sea instantáneo). */
  warm() {
    if (!this.ready) {
      this.setup();
      this.ready = true;
      this.enqueue(this.prepJobs());
    }
    if (!this.song) {
      this.load(this.makeSong(this.songIndex), false);
      this.enqueue(this.songJobs(this.song));
    }
  }

  /** Arranca en `t`, entrando por donde vaya la canción. */
  start(t: number, fadeIn = 0.25) {
    this.warm();
    if (!this.timeline) {
      // la primera vez, a mitad de canción (como al encender la radio)
      this.songStart = t - this.rng() * 0.6 * this.songDur();
      this.timeline = true;
    }
    let hops = 0;
    while (t >= this.songStart + this.songDur() && hops++ < 500) {
      this.songStart += this.songDur();
      this.advanceSong(false);
    }
    if (hops) this.enqueue(this.songJobs(this.song));
    this.align(t);
    this.running = true;
    const ctx = this.rs.ctx;
    for (const p of [this.out.gain, this.rev.gain]) {
      p.cancelScheduledValues(ctx.currentTime);
      p.setValueAtTime(0, t);
      p.linearRampToValueAtTime(1, t + fadeIn);
    }
    // filtro en su sitio para la posición actual
    const bar = Math.floor(this.stepPos / 16);
    const secIdx = this.barSec[Math.min(bar, this.barSec.length - 1)];
    const f = this.cutoff(this.song.sections[secIdx], this.barIn[Math.min(bar, this.barIn.length - 1)], (this.stepPos % 16) / 16);
    this.filter.frequency.cancelScheduledValues(ctx.currentTime);
    this.filter.frequency.setValueAtTime(f, t);
  }

  /** Para con un fundido corto y corta todo lo programado. */
  stop(t: number, fade = 0.08) {
    if (!this.running) return;
    this.running = false;
    for (const p of [this.out.gain, this.rev.gain]) {
      p.cancelScheduledValues(t);
      p.setTargetAtTime(0, t, fade / 3);
    }
    const end = t + fade + 0.05;
    for (const src of this.active) {
      try {
        src.stop(end);
      } catch {
        /* no había empezado o ya paró */
      }
    }
    this.onStop();
  }

  private align(t: number) {
    const sd = this.stepDur();
    this.stepPos = Math.max(0, Math.ceil((t - this.songStart) / sd - 1e-6));
    if (this.stepPos >= this.song.bars * 16) {
      this.songStart += this.songDur();
      this.advanceSong(true);
      this.stepPos = 0;
    }
    this.nextTime = this.songStart + this.stepPos * this.stepDur();
    this.resumed = true;
  }

  /** Programa todo lo que caiga antes de `now + ahead`. */
  tick(now: number, ahead: number) {
    if (!this.running) return;
    if (this.nextTime < now - 0.1) {
      // nos hemos quedado atrás (pestaña oculta, tirón): saltar sin amontonar notas
      let hops = 0;
      while (now >= this.songStart + this.songDur() && hops++ < 500) {
        this.songStart += this.songDur();
        this.advanceSong(false);
      }
      this.enqueue(this.songJobs(this.song));
      this.align(now + 0.03);
    }
    this.rs.owner = this.active;
    let guard = 0;
    while (this.nextTime < now + ahead && guard++ < 512) this.emit();
    this.rs.owner = null;
  }

  /** Rellena el paso reutilizable con la posición `stepPos` de la canción actual. */
  private fillStep(stepPos: number): Step<S> {
    const song = this.song;
    const sd = this.stepDur();
    const bar = Math.min(stepPos >> 4, this.barSec.length - 1);
    const s = stepPos & 15;
    const secIdx = this.barSec[bar];
    const sec = song.sections[secIdx];
    const barInSec = this.barIn[bar];
    const next = song.sections[secIdx + 1] ?? null;
    const st = (this.st ??= {} as Step<S>);
    st.song = song;
    st.sec = sec;
    st.secIdx = secIdx;
    st.bar = bar;
    st.barInSec = barInSec;
    st.s = s;
    st.chord = sec.chords[barInSec % sec.chords.length];
    if (barInSec + 1 < sec.bars) st.nextChord = sec.chords[(barInSec + 1) % sec.chords.length];
    else st.nextChord = next ? next.chords[0] : st.chord;
    st.lastBar = barInSec === sec.bars - 1;
    st.fill = barInSec % 8 === 7 || st.lastBar;
    st.next = next;
    st.stepDur = sd;
    st.barDur = sd * 16;
    return st;
  }

  private emit() {
    if (this.stepPos >= this.song.bars * 16) {
      this.songStart += this.songDur();
      this.advanceSong(true);
      this.stepPos = 0;
    }
    const st = this.fillStep(this.stepPos);
    const grid = this.nextTime;
    if (st.s === 0) {
      const c0 = this.cutoff(st.sec, st.barInSec, 0), c1 = this.cutoff(st.sec, st.barInSec, 1);
      const fp = this.filter.frequency;
      fp.setValueAtTime(c0, grid);
      if (Math.abs(c1 - c0) > 1) fp.exponentialRampToValueAtTime(c1, grid + st.barDur);
      this.onBar(st, grid);
    } else if (this.resumed) this.onResume(st);
    this.resumed = false;
    const t = grid + (st.s & 1 ? this.swing * st.stepDur : 0);
    this.play(st, t);
    this.stepPos++;
    this.nextTime = this.songStart + this.stepPos * st.stepDur;
  }

  /** Posición actual (para depurar y para el texto del locutor). */
  info() {
    if (!this.song) return null;
    const bar = Math.min(this.stepPos >> 4, this.barSec.length - 1);
    const sec = this.song.sections[this.barSec[bar]];
    return {
      title: this.song.title,
      artist: this.song.artist,
      bpm: this.song.bpm,
      key: this.song.key,
      section: sec?.kind,
      bar,
      bars: this.song.bars,
      index: this.song.index,
    };
  }

  /** Programa en un contexto offline `secs` segundos seguidos (para análisis). */
  renderAhead(t0: number, secs: number) {
    this.start(t0, 0.01);
    this.tick(t0, secs);
  }
}
