// Emisora 3: RUMBA DEL MUELLE — rumba flamenca: guitarra rasgueada (cuerdas Karplus-Strong),
// cadencia andaluza, palmas a compás, cajón, bajo, requinto y "¡olé!".
import { Station, type Song, type Step, type Section } from '../station';
import { Channel } from '../synth';
import { spec, type Spec } from '../render';
import { chantSpec, chantKey, sungSpec, quejioSpec, type ChantName } from '../voices';
import {
  makeRng, pick, chance, irand, prog, chordPcs, guitarVoicing, scaleFor, scaleStep, snapToPcs,
  makeMotif, varyMotif, tuneRate, ftom, MINOR, type Chord, type MotifNote,
} from '../theory';
import { RUMBA_SONGS } from '../texts';

type Stroke = 'D' | 'U' | 'M' | 'R';
interface RumbaSong extends Song {
  strum: number;
  cajon: number;
  motifs: MotifNote[][];
  quejio: [number, number][];
  tune: Record<string, number>;
}

// [semicorchea, golpe, intensidad]  D abajo, U arriba, M apagado (golpe), R rasgueo de 4 dedos
const STRUMS: [number, Stroke, number][][] = [
  [[0, 'D', 1], [2, 'U', 0.55], [4, 'M', 0.9], [6, 'U', 0.6], [7, 'D', 0.45], [8, 'D', 0.85], [10, 'U', 0.55], [12, 'M', 0.9], [14, 'U', 0.6], [15, 'U', 0.4]],
  [[0, 'D', 1], [2, 'U', 0.5], [3, 'D', 0.5], [4, 'M', 0.9], [5, 'U', 0.4], [6, 'U', 0.6], [8, 'D', 0.9], [10, 'U', 0.5], [11, 'D', 0.5], [12, 'M', 0.9], [13, 'U', 0.4], [14, 'U', 0.6]],
  [[0, 'D', 1], [3, 'U', 0.5], [4, 'M', 0.9], [6, 'U', 0.55], [8, 'D', 0.8], [10, 'U', 0.5], [11, 'U', 0.4], [12, 'M', 0.95], [14, 'U', 0.6]],
];
const SPARSE: [number, Stroke, number][] = [[0, 'D', 1], [4, 'M', 0.7], [6, 'U', 0.45], [8, 'D', 0.8], [12, 'M', 0.7], [14, 'U', 0.45]];
const FILL: [number, Stroke, number][] = [[0, 'D', 1], [2, 'U', 0.55], [4, 'M', 0.9], [6, 'U', 0.6], [8, 'D', 0.85], [10, 'U', 0.55], [12, 'R', 0.9], [14, 'D', 1], [15, 'M', 0.85]];
// cajón: B grave, S agudo (slap), g golpecito fantasma
const CAJONES: [number, 'B' | 'S' | 'g', number][][] = [
  [[0, 'B', 1], [3, 'g', 0.25], [4, 'S', 0.9], [6, 'B', 0.55], [8, 'B', 0.9], [11, 'g', 0.25], [12, 'S', 0.95], [14, 'g', 0.3], [15, 'g', 0.35]],
  [[0, 'B', 1], [4, 'S', 0.9], [7, 'g', 0.3], [8, 'B', 0.8], [10, 'B', 0.6], [12, 'S', 0.95], [13, 'g', 0.25], [15, 'g', 0.35]],
];

type Voice = { src: AudioScheduledSourceNode; g: GainNode };

export class RumbaStation extends Station<RumbaSong> {
  readonly id = 'rumba';
  private ch!: Record<'guitar' | 'requinto' | 'bass' | 'cajon' | 'palmaL' | 'palmaR' | 'vox' | 'fx', Channel>;
  private strings: (Voice | null)[] = [null, null, null, null, null, null];
  private bassV: Voice | null = null;
  private reqV: Voice | null = null;
  private phrase: { step: number; midi: number; len: number; vel: number }[] = [];
  private run: { step: number; midi: number; vel: number; len: number }[] = [];

  protected setup() {
    const rs = this.rs, bus = this.bus, rev = this.rev;
    bus.gain.value = 5.2; // las cuerdas punteadas tienen poca energía media: igualar volumen
    const mk = (gain: number, pan: number, reverb: number) => new Channel(rs, bus, { gain, pan, reverb, revDest: rev });
    this.ch = {
      guitar: mk(0.47, -0.18, 0.2),
      requinto: mk(0.46, 0.3, 0.3),
      bass: mk(0.35, 0, 0.05),
      cajon: mk(0.25, 0.05, 0.12),
      palmaL: mk(0.65, -0.5, 0.25),
      palmaR: mk(0.65, 0.5, 0.25),
      vox: mk(0.36, 0, 0.3),
      fx: mk(0.4, 0, 0.3),
    };
    this.swing = 0.06;
  }

  prepJobs(): Spec[] {
    const sr = this.rs.sr;
    const jobs: Spec[] = [spec('ru:cb', 'cajonBass', sr), spec('ru:cs', 'cajonSlap', sr), spec('ru:golpe', 'golpe', sr)];
    for (let v = 0; v < 3; v++) jobs.push(spec('ru:pc' + v, 'palma', sr, true, v), spec('ru:ps' + v, 'palma', sr, false, v));
    for (const c of ['ole', 'ay', 'arsa', 'esoes', 'toma'] as ChantName[]) jobs.push(chantSpec(sr, c));
    return jobs;
  }

  protected songJobs(song: RumbaSong): Spec[] {
    const rs = this.rs, key = song.key;
    const jobs: Spec[] = [];
    // notas de guitarra de todos los acordes de la canción
    const seen = new Set<string>();
    for (const sec of song.sections) {
      for (const c of sec.chords) {
        const id = c.root + c.q;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const m of guitarVoicing(key, c)) jobs.push(rs.stringSpec(m, 'open'), rs.stringSpec(m, 'mute'));
      }
    }
    // bajo: todas las notas de su registro (incluye las de paso cromáticas)
    for (let m = 33; m <= 45; m++) jobs.push(rs.stringSpec(m, 'bass'));
    // notas del requinto: la escala (con sensible) entre do4 y re6
    const scale = new Set([...MINOR, 11].map((i) => (key + i) % 12));
    for (let m = 60; m <= 86; m++) if (scale.has(m % 12)) jobs.push(rs.stringSpec(m, 'bright'));
    jobs.push(quejioSpec(rs.sr, `ru:quejio:${song.index}`, song.quejio));
    const base = 52 + ((key - 4 + 12) % 12);
    jobs.push(sungSpec(rs.sr, `ru:jingle:${key}`, [[['R', 0.1], ['u', 0.22], ['m', 0.08]], [['b', 0.04], ['a', 0.6]]], [base + 7, base + 12], 4, { fscale: 1, vib: 0.2 }));
    return jobs;
  }

  protected makeSong(index: number): RumbaSong {
    const r = makeRng(this.seed * 4513 + index * 65537);
    const key = pick(r, [9, 4, 2, 11, 7, 6]);
    const andaluza = prog(chance(r, 0.5) ? '0m 10M 8M 7M' : '0m 10M 8M 7');
    const chorus = prog(pick(r, ['5m 10M 3M 8M 5m 7 0m 7', '8M 10M 0m 0m 8M 10M 7 7', '0m 5m 10M 3M 8M 5m 7 7', '5m 5m 0m 0m 10M 10M 7 7']));
    const S = (kind: Section['kind'], bars: number, chords: Chord[]): Section => ({ kind, bars, chords, n: 0 });
    const sections: Section[] = [S('intro', 4, andaluza), S('verse', 8, andaluza), S('chorus', 8, chorus), S('verse', 8, andaluza), S('chorus', 8, chorus)];
    if (chance(r, 0.7)) sections.push(S('solo', 8, andaluza));
    sections.push(S('chorus', 8, chorus), S('outro', 4, andaluza), S('jingle', 2, prog('0m 0m')));
    const a = makeMotif(r);
    const bpm = irand(r, 100, 116);
    const beat = 60 / bpm;
    // quejío sobre la cadencia andaluza: quinta, sexta menor, quinta, cuarta, tercera, segunda
    const hi = 50 + ((key - 2 + 12) % 12); // tónica entre re3 y do#4 (voz de hombre)
    const q: [number, number][] = [[hi + 7, beat * 1.6], [hi + 8, beat * 1.2], [hi + 7, beat * 1.2], [hi + 5, beat * 4], [hi + 3, beat * 4], [hi + 2, beat * 3], [hi + 1, beat * 1.2], [hi + 2, beat * 2]];
    const meta = RUMBA_SONGS[index % RUMBA_SONGS.length];
    return this.finishSong({
      index,
      seed: index,
      title: meta[0],
      artist: meta[1],
      bpm,
      key,
      sections,
      strum: irand(r, 0, STRUMS.length - 1),
      cajon: irand(r, 0, CAJONES.length - 1),
      motifs: [a, varyMotif(r, a), a, chance(r, 0.5) ? makeMotif(r) : varyMotif(r, a)],
      quejio: q,
      tune: { 'ru:cb': tuneRate(ftom(68), key), 'ru:cs': tuneRate(ftom(290), key, [0, 3, 7]) },
    });
  }

  protected onStop() {
    this.strings.fill(null);
    this.bassV = this.reqV = null;
  }

  private bassMidi(key: number, c: Chord) {
    return 33 + ((((key + c.root) % 12) - 9 + 12) % 12);
  }

  // ── guitarra ──

  private strum(t: number, chord: Chord, key: number, dir: Stroke, vel: number) {
    const rs = this.rs, ch = this.ch.guitar.input;
    const v = guitarVoicing(key, chord);
    const n = v.length;
    const off = 6 - n; // cuerdas graves que no suenan
    if (dir === 'R') {
      // rasgueo: cuatro dedos seguidos
      for (let f = 0; f < 4; f++) this.strum(t + f * 0.032, chord, key, 'D', vel * (0.55 + f * 0.12));
      return;
    }
    const mute = dir === 'M';
    const spacing = (mute ? 0.005 : 0.013 - vel * 0.005) * (0.8 + Math.random() * 0.4);
    const idx: number[] = [];
    if (dir === 'U') for (let i = n - 1; i >= Math.max(0, n - 4); i--) idx.push(i);
    else for (let i = 0; i < n; i++) idx.push(i);
    idx.forEach((i, k) => {
      const tt = t + k * spacing;
      const s = i + off;
      const prev = this.strings[s];
      if (prev) rs.choke(prev, tt, mute ? 0.012 : 0.03);
      const buf = rs.maybeString(v[i], mute ? 'mute' : 'open');
      if (!buf) return;
      // las graves en los golpes hacia abajo suenan más; hacia arriba, las agudas
      const w = dir === 'U' ? 0.75 : i < 2 ? 1 : 0.85;
      const voice = rs.play(ch, tt, buf, vel * w * (0.8 + Math.random() * 0.3) * 0.5);
      this.strings[s] = mute ? null : voice;
    });
    if (mute) {
      const g = rs.maybe('ru:golpe');
      if (g) rs.play(ch, t, g, vel * 0.5);
    }
  }

  // ── requinto (guitarra solista) ──

  private note(t: number, midi: number, vel: number) {
    const rs = this.rs;
    const buf = rs.maybeString(midi, 'bright');
    if (!buf) return;
    if (this.reqV) rs.choke(this.reqV, t, 0.02);
    this.reqV = rs.play(this.ch.requinto.input, t, buf, vel);
  }

  private realize(st: Step<RumbaSong>) {
    const song = st.song, key = song.key;
    const motif = song.motifs[(st.barInSec >> 1) % 4];
    const anchor = snapToPcs(71, chordPcs(key, st.chord));
    this.phrase = motif.map((n) => {
      const chord = st.sec.chords[(st.barInSec + (n.step >= 16 ? 1 : 0)) % st.sec.chords.length];
      const sc = scaleFor(key, chord);
      let m = scaleStep(snapToPcs(anchor, sc), n.contour, sc);
      if (n.step % 8 === 0 || n.len >= 4) m = snapToPcs(m, chordPcs(key, chord));
      return { step: n.step, midi: m, len: n.len, vel: 0.6 + n.accent * 0.3 };
    });
  }

  /** Escala rápida (picado) que acaba en nota del acorde siguiente. */
  private makeRun(st: Step<RumbaSong>, full: boolean) {
    const key = st.song.key;
    const r = Math.random;
    const sc = scaleFor(key, st.chord);
    const target = snapToPcs(64 + (r() * 10) | 0, chordPcs(key, st.nextChord));
    const notes: { step: number; midi: number; vel: number; len: number }[] = [];
    if (full) {
      // compás entero: nota larga con trémolo y luego bajada rápida
      const top = snapToPcs(target + 7 + ((r() * 5) | 0), chordPcs(key, st.chord));
      for (let s = 0; s < 6; s++) notes.push({ step: s, midi: top, vel: s === 0 ? 0.9 : 0.5, len: 1 });
      let m = scaleStep(snapToPcs(top, sc), 1, sc);
      for (let s = 6; s < 16; s++) {
        notes.push({ step: s, midi: m, vel: s % 4 === 0 ? 0.85 : 0.6, len: 1 });
        m = scaleStep(m, chance(r, 0.8) ? -1 : 1, sc);
      }
    } else {
      // remate: 4 notas que bajan hasta el acorde siguiente
      let m = scaleStep(snapToPcs(target, sc), 4, sc);
      for (let s = 12; s < 16; s++) {
        m = scaleStep(m, -1, sc);
        notes.push({ step: s, midi: m, vel: 0.55 + (s - 12) * 0.08, len: 1 });
      }
    }
    this.run = notes;
  }

  protected onResume(st: Step<RumbaSong>) {
    this.phrase = [];
    this.run = [];
    if (st.sec.kind === 'chorus') this.realize(st);
  }

  protected onBar(st: Step<RumbaSong>, t: number) {
    const k = st.sec.kind;
    this.run = [];
    if (k === 'chorus' && st.barInSec % 2 === 0) this.realize(st);
    if (k === 'solo') this.makeRun(st, true);
    else if (k === 'verse' && st.barInSec % 2 === 1 && st.sec.n > 0) this.makeRun(st, false);
    if (k === 'chorus' && st.barInSec === 0) this.rs.sweep(this.ch.fx.input, t, st.barDur * 0.5, 4000, 400, 0.25, false, 1);
  }

  protected play(st: Step<RumbaSong>, t: number) {
    const rs = this.rs, ch = this.ch;
    const { sec, song, s, barInSec, chord, stepDur } = st;
    const k = sec.kind, key = song.key;
    const hz = (x: number) => t + (Math.random() - 0.5) * x;
    const hit = (c: Channel, name: string, vel: number, dt = 0) => {
      const b = rs.maybe(name);
      if (b) rs.play(c.input, hz(0.008) + dt, b, vel, song.tune[name] ?? 1);
    };
    if (k === 'jingle') return this.jingle(st, t);

    // ── guitarra ──
    const pat = k === 'intro' || (k === 'outro' && barInSec >= 2) ? SPARSE : st.fill ? FILL : STRUMS[song.strum];
    for (const [ss, dir, v] of pat) if (ss === s) this.strum(hz(0.006), chord, key, dir, v * (k === 'solo' ? 0.8 : 1));
    if (k === 'outro' && st.lastBar && s === 0) this.strum(t + stepDur * 8, chord, key, 'R', 1);

    // ── cajón ──
    const perc = k !== 'intro' && !(k === 'outro' && barInSec >= 2);
    if (perc) {
      if (st.fill && s >= 12) {
        hit(ch.cajon, 'ru:cs', 0.5 + (s - 12) * 0.15);
        if (s === 14) hit(ch.cajon, 'ru:cs', 0.6, stepDur / 2);
      } else {
        for (const [ss, kind, v] of CAJONES[song.cajon]) {
          if (ss !== s) continue;
          if (kind === 'B') hit(ch.cajon, 'ru:cb', v);
          else hit(ch.cajon, 'ru:cs', kind === 'S' ? v : v * (0.7 + Math.random() * 0.6));
        }
      }
    }

    // ── palmas ──
    const palmasOn = (k === 'intro' && barInSec >= 2) || (k !== 'intro' && !(k === 'outro' && barInSec >= 3));
    if (palmasOn) {
      const chorus = k === 'chorus';
      const v = (Math.random() * 3) | 0;
      if (s === 4 || s === 12) {
        hit(ch.palmaL, 'ru:pc' + v, 0.85);
        hit(ch.palmaR, 'ru:pc' + ((v + 1) % 3), 0.75, 0.007);
      }
      if (s % 4 === 2 && k !== 'intro') hit(chorus ? ch.palmaR : ch.palmaL, (chorus ? 'ru:pc' : 'ru:ps') + v, chorus ? 0.55 : 0.6);
      if (chorus && (s === 7 || s === 15)) hit(ch.palmaL, 'ru:pc' + v, 0.6);
      if (k === 'verse' && s % 4 === 2) hit(ch.palmaR, 'ru:ps' + ((v + 2) % 3), 0.45, 0.01);
    }

    // ── bajo ──
    if (k !== 'intro' && !(k === 'outro' && barInSec >= 3)) {
      const root = this.bassMidi(key, chord);
      const nextRoot = this.bassMidi(key, st.nextChord);
      let m: number | null = null, vel = 0.9;
      if (s === 0) m = root;
      else if (s === 6) { m = root; vel = 0.6; }
      else if (s === 8) { m = root + 7 > 45 ? root - 5 : root + 7; vel = 0.75; }
      else if (s === 14 && nextRoot !== root) { m = nextRoot + (nextRoot < root ? 1 : -1); vel = 0.65; }
      else if (s === 14) { m = root + 12 > 45 ? root : root + 12; vel = 0.55; }
      const bb = m !== null ? rs.maybeString(m, 'bass') : undefined;
      if (bb) {
        if (this.bassV) rs.choke(this.bassV, t, 0.03);
        this.bassV = rs.play(ch.bass.input, t, bb, vel);
      }
    }

    // ── requinto ──
    if (k === 'chorus') {
      const off = (barInSec & 1) * 16 + s;
      for (const n of this.phrase) {
        if (n.step !== off) continue;
        // adorno: mordente desde la nota de arriba
        if (n.len >= 3 && chance(Math.random, 0.35)) {
          const sc = scaleFor(key, chord);
          this.note(t, scaleStep(n.midi, 1, sc), n.vel * 0.7);
          this.note(t + 0.045, n.midi, n.vel);
        } else this.note(t, n.midi, n.vel);
        // trémolo en las notas largas (picado)
        if (n.len >= 4) for (let j = 2; j < n.len; j += 2) this.note(t + j * stepDur, n.midi, n.vel * 0.55);
      }
    }
    for (const n of this.run) if (n.step === s) this.note(t, n.midi, n.vel);

    // ── voces ──
    let chant: ChantName | null = null;
    if (k === 'chorus' && barInSec === 0 && s === 0) chant = 'ole';
    else if (st.fill && s === 14 && k !== 'intro' && chance(Math.random, 0.5)) chant = pick(Math.random, ['arsa', 'esoes', 'toma', 'ay'] as ChantName[]);
    else if (k === 'solo' && barInSec === 4 && s === 0) chant = 'esoes';
    else if (k === 'outro' && st.lastBar && s === 8) chant = 'ole';
    if (chant) {
      const b = rs.maybe(chantKey(chant));
      if (b) rs.play(ch.vox.input, t, b, chant === 'ole' ? 0.85 : 0.7);
    }
    // quejío en la intro (y a veces en la segunda estrofa)
    if ((k === 'intro' || (k === 'verse' && sec.n === 1 && barInSec === 4)) && barInSec % 8 === (k === 'intro' ? 0 : 4) && s === 0) {
      const b = rs.maybe(`ru:quejio:${song.index}`);
      if (b) rs.play(ch.vox.input, t + stepDur * 2, b, k === 'intro' ? 0.8 : 0.6);
    }
  }

  private jingle(st: Step<RumbaSong>, t: number) {
    const rs = this.rs, ch = this.ch, key = st.song.key;
    if (st.barInSec === 0 && st.s === 0) {
      this.strum(t, st.chord, key, 'R', 1);
      const b = rs.maybe(`ru:jingle:${key}`);
      if (b) rs.play(ch.vox.input, t + 0.15, b, 0.8);
    }
    if (st.barInSec === 0 && st.s === 8) this.strum(t, st.chord, key, 'D', 0.8);
    if (st.barInSec === 0 && st.s === 12) this.strum(t, st.chord, key, 'M', 0.7);
    if (st.barInSec === 0 && st.s === 14) this.strum(t, st.chord, key, 'U', 0.5);
    if (st.barInSec === 1) {
      // la guitarra sigue marcando el compás mientras entra la siguiente
      for (const [ss, dir, v] of SPARSE) if (ss === st.s) this.strum(t, st.chord, key, dir, v * 0.8);
      // palmas que llaman a la siguiente
      if (st.s % 4 === 0 || st.s >= 12) {
        const b = rs.maybe('ru:pc' + (st.s % 3));
        if (b) rs.play(ch.palmaL.input, t, b, 0.5 + st.s * 0.02);
      }
      if (st.s === 12) {
        const c = rs.maybe(chantKey('arsa'));
        if (c) rs.play(ch.vox.input, t, c, 0.7);
      }
    }
  }
}

