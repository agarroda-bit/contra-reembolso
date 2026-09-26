// Emisora 2: ELECTRO CARTÓN 101.5 — house/electro a ~124 BPM: bombo a negras, bajo con
// "sidechain" (bombeo), arpegios con eco, pads y cortes de voz afinados.
import { Station, type Song, type Step, type Section } from '../station';
import { Channel, softClipCurve } from '../synth';
import { spec, type Spec } from '../render';
import { chantSpec, chantKey, sungSpec, CHOP_BASE, type ChantName } from '../voices';
import {
  makeRng, pick, chance, irand, prog, chordPcs, voiceChord, scaleFor, scaleStep, snapToPcs,
  makeMotif, varyMotif, tuneRate, ftom, MINOR, type Chord, type MotifNote,
} from '../theory';
import { ELECTRO_SONGS } from '../texts';

interface ElectroSong extends Song {
  bassPat: number;
  arpPat: number[];
  percPat: number[];
  motifs: MotifNote[][];
  chop1: ChantName;
  chop2: ChantName;
  padVoices: number;
  tune: Record<string, number>;
}

const ARPS: number[][] = [
  [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5],
  [0, 2, 4, 2, 5, 2, 4, 2, 0, 2, 4, 2, 5, 3, 4, 1],
  [0, -1, 2, 3, -1, 4, 2, -1, 5, -1, 4, 3, -1, 2, 1, -1],
  [5, 3, 1, 3, 4, 2, 0, 2, 5, 3, 1, 3, 4, 2, 1, 0],
  [0, 0, 3, 0, 4, 0, 3, 5, 0, 0, 3, 0, 4, 2, 1, 2],
];
const PERCS: number[][] = [[3, 10], [6, 11, 14], [3, 7, 10, 15], [2, 11]];

export class ElectroStation extends Station<ElectroSong> {
  readonly id = 'electro';
  private ch!: Record<'kick' | 'clap' | 'hat' | 'shaker' | 'perc' | 'bass' | 'pad' | 'arp' | 'vox' | 'fx', Channel>;
  private pumpG!: GainNode;
  private arpF!: BiquadFilterNode;
  private echo!: DelayNode;
  private phrase: { step: number; midi: number; len: number; vel: number }[] = [];
  private pool: number[] = [];

  protected setup() {
    const rs = this.rs, ctx = rs.ctx, bus = this.bus, rev = this.rev;
    bus.gain.value = 1.25; // igualar volumen con las otras emisoras
    // bombeo tipo sidechain: bajo, pads y arpegio pasan por aquí
    this.pumpG = ctx.createGain();
    this.pumpG.connect(bus);
    // eco de corchea con puntillo para arpegio y voces
    this.echo = ctx.createDelay(2);
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const echoLp = ctx.createBiquadFilter();
    echoLp.type = 'lowpass';
    echoLp.frequency.value = 2800;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.echo.connect(echoLp).connect(fb).connect(this.echo);
    echoLp.connect(wet).connect(this.pumpG);
    this.arpF = ctx.createBiquadFilter();
    this.arpF.type = 'lowpass';
    this.arpF.frequency.value = 2500;
    this.arpF.Q.value = 3;
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve(1.6);
    rs.stats.fixed += 7;
    const mk = (dest: AudioNode, gain: number, pan: number, reverb: number, pre?: AudioNode[]) => new Channel(rs, dest, { gain, pan, reverb, revDest: rev, pre });
    this.ch = {
      kick: mk(bus, 0.36, 0, 0),
      clap: mk(bus, 0.82, 0.05, 0.22),
      hat: mk(bus, 0.45, 0.25, 0.06),
      shaker: mk(bus, 0.3, -0.3, 0.05),
      perc: mk(bus, 0.5, -0.22, 0.2),
      bass: mk(this.pumpG, 0.3, 0, 0, [shaper]),
      pad: mk(this.pumpG, 0.3, 0, 0.4),
      arp: mk(this.pumpG, 0.5, 0.15, 0.18, [this.arpF]),
      vox: mk(bus, 0.24, -0.08, 0.35),
      fx: mk(bus, 0.4, 0, 0.35),
    };
    // envíos al eco
    const arpSend = ctx.createGain();
    arpSend.gain.value = 0.35;
    this.ch.arp.pan.connect(arpSend).connect(this.echo);
    const voxSend = ctx.createGain();
    voxSend.gain.value = 0.3;
    this.ch.vox.pan.connect(voxSend).connect(this.echo);
    rs.stats.fixed += 2;
  }

  prepJobs(): Spec[] {
    const sr = this.rs.sr;
    const jobs: Spec[] = [
      spec('el:kick', 'kick', sr, { f0: 210, f1: 50, pd: 0.022, ad: 0.19, len: 0.42, click: 0.45, drive: 2.2 }),
      spec('el:clap', 'clap', sr, 1050, 0.16),
      spec('el:hat', 'hat', sr, false, 1.05),
      spec('el:hato', 'hat', sr, true, 1.05),
      spec('el:shaker', 'shaker', sr),
      spec('el:rim', 'rim', sr, 1500),
      spec('crash', 'crash', sr),
      spec('el:snare', 'snare', sr, { tone: 190, td: 0.05, nd: 0.1, hp: 1200, lp: 8000, len: 0.22, toneAmt: 0.5, noiseAmt: 0.9 }),
    ];
    for (const c of ['hey', 'ah', 'oh'] as ChantName[]) jobs.push(chantSpec(sr, c));
    return jobs;
  }

  protected songJobs(song: ElectroSong): Spec[] {
    const base = 55 + ((song.key - 7 + 12) % 12);
    // "e-lec-tro" cantado: tónica, tercera, quinta
    return [sungSpec(this.rs.sr, `el:jingle:${song.key}`, [[['e', 0.18]], [['l', 0.05], ['e', 0.12], ['k', 0.05]], [['t', 0.04], ['r', 0.03], ['o', 0.55]]], [base + 12, base + 15, base + 19], 3, { fscale: 1.12, vib: 0.06 })];
  }

  protected makeSong(index: number): ElectroSong {
    const r = makeRng(this.seed * 6007 + index * 92821);
    const PROGS = ['0m 8M 3M 10M', '0m 10M 8M 10M', '8M 10M 0m 0m', '0m 7m 8M 5m', '0m 3M 10M 8M', '0m 8M 10M 5m'];
    const main = prog(pick(r, PROGS));
    const slow: Chord[] = [];
    for (const c of main) slow.push(c, c);
    const tonic = prog(chance(r, 0.5) ? '0m' : '0m 0m 8M 8M');
    const S = (kind: Section['kind'], bars: number, chords: Chord[]): Section => ({ kind, bars, chords, n: 0 });
    const sections: Section[] = [S('intro', 8, tonic), S('build', 8, main), S('drop', 16, main)];
    if (chance(r, 0.6)) sections.push(S('groove', 8, tonic));
    sections.push(S('break', 8, slow), S('build', 4, main), S('drop', 16, main), S('outro', 8, tonic), S('jingle', 2, prog('0m 0m')));
    const a = makeMotif(r);
    const meta = ELECTRO_SONGS[index % ELECTRO_SONGS.length];
    const key = pick(r, [5, 7, 9, 0, 2, 4, 10]);
    const tune = {
      'el:kick': tuneRate(ftom(50), key),
      'el:snare': tuneRate(ftom(190), key, [0, 3, 7]),
      'el:rim': tuneRate(ftom(1500), key, MINOR),
    };
    return this.finishSong({
      index,
      seed: index,
      title: meta[0],
      artist: meta[1],
      bpm: irand(r, 120, 128),
      key,
      sections,
      bassPat: irand(r, 0, 2),
      arpPat: pick(r, ARPS),
      percPat: pick(r, PERCS),
      motifs: [a, varyMotif(r, a), a, chance(r, 0.5) ? makeMotif(r) : varyMotif(r, a)],
      chop1: pick(r, ['ah', 'oh'] as ChantName[]),
      chop2: pick(r, ['hey', 'oh', 'ah'] as ChantName[]),
      padVoices: chance(r, 0.6) ? 3 : 2,
      tune,
    });
  }

  protected cutoff(sec: Section, barInSec: number, frac: number) {
    if (sec.kind === 'break') return 1800 * Math.pow(18000 / 1800, Math.min(1, (barInSec + frac) / sec.bars) ** 2);
    return super.cutoff(sec, barInSec, frac);
  }

  private realize(st: Step<ElectroSong>) {
    const song = st.song, key = song.key;
    const motif = song.motifs[(st.barInSec >> 1) % 4];
    const anchor = snapToPcs(67, chordPcs(key, st.chord));
    this.phrase = motif.map((n) => {
      const chord = st.sec.chords[(st.barInSec + (n.step >= 16 ? 1 : 0)) % st.sec.chords.length];
      const sc = scaleFor(key, chord);
      let m = scaleStep(snapToPcs(anchor, sc), n.contour, sc);
      if (n.step % 8 === 0 || n.len >= 4) m = snapToPcs(m, chordPcs(key, chord));
      return { step: n.step, midi: m, len: Math.min(n.len, 3), vel: 0.6 + n.accent * 0.3 };
    });
  }

  protected onResume(st: Step<ElectroSong>) {
    const v = voiceChord(st.song.key, st.chord, 69, 3);
    this.pool = [...v, ...v.map((m) => m + 12)];
    this.phrase = [];
    if (st.sec.kind === 'drop' || st.sec.kind === 'groove') this.realize(st);
  }

  protected onBar(st: Step<ElectroSong>, t: number) {
    const { sec, barInSec, barDur, song } = st;
    const k = sec.kind;
    // eco a corchea con puntillo
    this.echo.delayTime.setValueAtTime(st.stepDur * 3, t);
    // pool del arpegio: acorde en dos octavas
    const v = voiceChord(song.key, st.chord, 69, 3);
    this.pool = [...v, ...v.map((m) => m + 12)];
    // filtro del arpegio según la sección
    const f = this.arpF.frequency;
    const p0 = barInSec / sec.bars, p1 = (barInSec + 1) / sec.bars;
    const curve = (p: number) =>
      k === 'build' ? 500 * Math.pow(10, p) : k === 'break' ? 700 * Math.pow(7, p) : k === 'drop' ? 3800 : k === 'groove' ? 1400 : 900;
    f.setValueAtTime(curve(p0), t);
    f.linearRampToValueAtTime(curve(p1), t + barDur);
    if ((k === 'drop' || k === 'groove') && barInSec % 2 === 0) this.realize(st);
    if (k === 'build' && barInSec === 0) this.rs.sweep(this.ch.fx.input, t, barDur * sec.bars, 300, 9000, 0.55, true, 1.3);
    if (k === 'break' && barInSec === sec.bars - 4) this.rs.sweep(this.ch.fx.input, t, barDur * 4, 400, 8000, 0.45, true, 1.5);
    if (k === 'drop' && barInSec === 0) {
      const c = this.rs.maybe('crash');
      if (c) this.rs.play(this.ch.fx.input, t, c, 0.6);
      this.rs.sweep(this.ch.fx.input, t, barDur, 5000, 200, 0.4, false, 1);
    }
  }

  protected play(st: Step<ElectroSong>, t: number) {
    const rs = this.rs, ch = this.ch;
    const { sec, song, s, barInSec, chord, stepDur } = st;
    const k = sec.kind, key = song.key;
    const hit = (c: Channel, name: string, vel: number, dt = 0) => {
      const b = rs.maybe(name);
      if (b) rs.play(c.input, t + dt, b, vel, song.tune[name] ?? 1);
    };
    if (k === 'jingle') return this.jingle(st, t);
    const drop = k === 'drop';
    const buildEnd = k === 'build' && barInSec >= sec.bars - 2;
    const kickOn = k === 'intro' || k === 'drop' || k === 'groove' || k === 'outro' || (k === 'build' && !buildEnd);
    const fill = st.fill && (drop || k === 'groove');

    // ── bombo + bombeo ──
    if (s % 4 === 0) {
      const lastBeatFill = fill && s === 12 && st.lastBar;
      if (kickOn && !lastBeatFill && !(k === 'outro' && st.lastBar && s >= 8)) {
        hit(ch.kick, 'el:kick', s === 0 ? 1 : 0.92);
        rs.pump(this.pumpG.gain, t, drop ? 0.7 : 0.55, stepDur * 3.2);
      }
    }
    // ── palmas / caja ──
    if (k === 'build') {
      // redoble que se acelera: negras → corcheas → semicorcheas
      const left = sec.bars - barInSec;
      const div = left > 4 ? 4 : left > 2 ? 2 : 1;
      if (barInSec >= sec.bars - 4 && s % div === 0) {
        const prog01 = (barInSec + s / 16 - (sec.bars - 4)) / 4;
        hit(ch.clap, 'el:snare', 0.25 + prog01 * 0.6);
      } else if (barInSec < sec.bars - 4 && (s === 4 || s === 12)) hit(ch.clap, 'el:clap', 0.8);
    } else if ((drop || k === 'groove' || (k === 'intro' && barInSec >= 4) || k === 'outro') && (s === 4 || s === 12)) {
      hit(ch.clap, 'el:clap', 0.85);
    }
    if (fill && s >= 13) hit(ch.clap, 'el:snare', 0.3 + (s - 13) * 0.2);

    // ── charles, shaker, percusión ──
    const hatsOn = (k === 'intro' && barInSec >= 4) || k === 'build' || drop || k === 'groove' || k === 'outro';
    if (hatsOn) {
      if (s % 4 === 2) {
        if (drop) hit(ch.hat, 'el:hato', 0.55);
        else hit(ch.hat, 'el:hat', 0.85);
      } else if (drop && s % 2 === 1) hit(ch.hat, 'el:hat', 0.25 + Math.random() * 0.1);
    }
    if ((drop || k === 'groove') && !(fill && s >= 12)) {
      hit(ch.shaker, 'el:shaker', [0.35, 0.15, 0.55, 0.2][s % 4]);
      if (song.percPat.includes(s)) hit(ch.perc, 'el:rim', 0.5);
    }
    if (k === 'break' && s % 8 === 4 && barInSec < sec.bars - 4) hit(ch.perc, 'el:rim', 0.35);

    // ── bajo ──
    const bassOn = (k === 'intro' && barInSec >= 4) || drop || k === 'groove' || (k === 'build' && !buildEnd) || (k === 'outro' && barInSec < 4);
    if (bassOn) {
      const pc = (key + chord.root) % 12;
      const root = 33 + ((pc - 9 + 12) % 12);
      const cut = k === 'intro' ? 180 + barInSec * 60 : drop ? 520 : 380;
      const env = drop ? 1600 : 900;
      const bp = song.bassPat;
      if (bp === 0 && s % 4 === 2) rs.sawBass(ch.bass.input, t, root, stepDur * 1.7, 0.9, cut, env);
      else if (bp === 1 && s % 4 !== 0) rs.sawBass(ch.bass.input, t, root + (s % 4 === 2 && drop ? 12 : 0), stepDur * 0.85, s % 4 === 2 ? 0.9 : 0.65, cut, env);
      else if (bp === 2 && s % 4 === 2) rs.sawBass(ch.bass.input, t, root + (s % 8 === 6 ? 12 : 0), stepDur * 1.6, 0.9, cut, env);
    }

    // ── pads ──
    if (s === 0) {
      const v = voiceChord(key, chord, 62, 4);
      if (drop) rs.pad(ch.pad.input, t, v, st.barDur * 0.98, 0.75, { cutoff: 3000, attack: 0.01, release: 0.2, voices: song.padVoices, detune: 14 });
      else if (k === 'break' && barInSec % 2 === 0) rs.pad(ch.pad.input, t, v, st.barDur * 2, 0.9, { cutoff: 1500, attack: 0.9, release: 1.2, voices: song.padVoices, detune: 16, sweep: 1.8 });
      else if (k === 'build' && barInSec >= sec.bars / 2) rs.pad(ch.pad.input, t, v, st.barDur, 0.55, { cutoff: 1200, attack: 0.2, release: 0.3, voices: 2, sweep: 2.5 });
      else if (k === 'outro' && barInSec >= 4 && barInSec % 2 === 0) rs.pad(ch.pad.input, t, v, st.barDur * 2, 0.8, { cutoff: 1400, attack: 0.6, release: 1, voices: song.padVoices, detune: 16 });
    }

    // ── arpegio ──
    const arpOn = k === 'build' || drop || k === 'break' || (k === 'groove' && barInSec >= 4);
    if (arpOn && this.pool.length) {
      const idx = song.arpPat[s];
      if (idx >= 0) {
        const m = this.pool[idx % this.pool.length];
        rs.arp(ch.arp.input, t, m, stepDur, s % 4 === 0 ? 0.85 : 0.6, 1800, drop ? 'sawtooth' : 'square');
      }
    }

    // ── cortes de voz afinados (la "melodía") ──
    if ((drop && (sec.n > 0 || barInSec >= 8)) || k === 'groove') {
      const off = (barInSec & 1) * 16 + s;
      const chop = sec.n > 0 || k === 'groove' ? song.chop2 : song.chop1;
      const b = rs.maybe(chantKey(chop));
      if (b) {
        for (const n of this.phrase) {
          if (n.step !== off) continue;
          const rate = Math.pow(2, (n.midi - CHOP_BASE) / 12);
          rs.play(ch.vox.input, t, b, n.vel * 0.9, rate, Math.min(n.len * stepDur, b.duration / rate - 0.03));
        }
      }
    }
    if (k === 'break' && barInSec === 0 && s === 0) {
      const b = rs.maybe(chantKey('hey'));
      if (b) rs.play(ch.vox.input, t, b, 0.7, Math.pow(2, (60 + key - CHOP_BASE - (key > 5 ? 12 : 0)) / 12));
    }
  }

  private jingle(st: Step<ElectroSong>, t: number) {
    const rs = this.rs, ch = this.ch, key = st.song.key;
    if (st.barInSec === 0 && st.s === 0) {
      const b = rs.maybe(`el:jingle:${key}`);
      if (b) rs.play(ch.vox.input, t, b, 0.75);
      rs.pad(ch.pad.input, t, voiceChord(key, st.chord, 64, 4), st.barDur * 1.6, 0.9, { cutoff: 2500, attack: 0.05, release: 1, voices: 3, detune: 15 });
      const c = rs.maybe('crash');
      if (c) rs.play(ch.fx.input, t, c, 0.45);
      const kk = rs.maybe('el:kick');
      if (kk) rs.play(ch.kick.input, t, kk, 1, st.song.tune['el:kick']);
    }
    if (st.barInSec === 1 && st.s === 0) rs.sweep(ch.fx.input, t, st.barDur, 300, 8000, 0.4, true, 1.4);
    if (st.barInSec === 1 && st.s >= 8 && st.s % 2 === 0) {
      const sn = rs.maybe('el:snare');
      if (sn) rs.play(ch.clap.input, t, sn, 0.3 + (st.s - 8) * 0.07, st.song.tune['el:snare']);
    }
  }
}
