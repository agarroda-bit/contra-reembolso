// Emisora 1: PERREO PAQUETERO FM — reguetón a ~95 BPM con dembow, 808, marimba y coros.
import { Station, type Song, type Step, type Section } from '../station';
import { Channel, softClipCurve } from '../synth';
import { spec, type Spec } from '../render';
import { chantSpec, chantKey, sungSpec, type ChantName } from '../voices';
import {
  makeRng, pick, chance, irand, prog, chordPcs, voiceChord, scaleFor, scaleStep, snapToPcs,
  makeMotif, varyMotif, tuneRate, ftom, MINOR, type Chord, type MotifNote,
} from '../theory';
import { PERREO_SONGS } from '../texts';

type ChordInst = 'mallet' | 'pluck' | 'keys';
type LeadInst = 'whistle' | 'accordion' | 'saw' | 'mallet';

interface PerreoSong extends Song {
  snarePat: number;
  bassPat: number;
  hatPat: number;
  stabPat: number;
  chordInst: ChordInst;
  leadInst: LeadInst;
  motifs: MotifNote[][]; // frase de 8 compases = 4 motivos de 2
  arpPat: number[];
  /** Afinación de la percusión a la tonalidad (velocidad de reproducción). */
  tune: Record<string, number>;
}

// Dembow: caja en la última semicorchea del 1 y en el "y" del 2 (3+3+2).
const SNARES: [number, number][][] = [
  [[3, 0.95], [6, 0.9], [11, 0.95], [14, 0.9]],
  [[3, 0.95], [6, 0.9], [7, 0.35], [11, 0.95], [14, 0.9], [15, 0.4]],
  [[3, 0.9], [6, 0.95], [10, 0.4], [11, 0.9], [14, 0.95]],
];
// Bajo: [semicorchea, duración, grado (0 fundamental, 7 quinta, 12 octava)]
const BASSES: [number, number, number][][] = [
  [[0, 7, 0], [8, 6, 0], [14, 2, 7]],
  [[0, 3, 0], [3, 3, 0], [6, 2, 0], [8, 3, 0], [11, 3, 0], [14, 2, 7]],
  [[0, 3, 0], [3, 3, 0], [6, 4, 0], [10, 2, 7], [12, 4, 0]],
  [[0, 6, 0], [6, 2, 12], [8, 6, 0], [14, 2, 7]],
];
// Ritmos de los acordes cortos
const STABS: number[][] = [
  [0, 3, 6, 8, 11, 14],
  [3, 6, 11, 14],
  [0, 3, 6, 10, 12],
  [2, 6, 10, 14],
];
const ARPS: number[][] = [
  [0, 1, 2, 1, 0, 2],
  [2, 1, 0, 1, 2, 3],
  [0, 2, 1, 3, 2, 1],
];

export class PerreoStation extends Station<PerreoSong> {
  readonly id = 'perreo';
  private ch!: Record<'kick' | 'snare' | 'clap' | 'hat' | 'perc' | 'bass' | 'chords' | 'pad' | 'lead' | 'vox' | 'fx', Channel>;
  private lastBass = 36;
  private prevVoicing: number[] | undefined;
  private phrase: { step: number; midi: number; len: number; vel: number }[] = [];
  private prevLead: number | null = null;
  private vib: { osc: OscillatorNode; g: GainNode } | null = null;
  private fillKind = 0;

  protected setup() {
    const rs = this.rs, ctx = rs.ctx, bus = this.bus, rev = this.rev;
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve(2.4);
    shaper.oversample = '2x';
    const bassLp = ctx.createBiquadFilter();
    bassLp.type = 'lowpass';
    bassLp.frequency.value = 1100;
    const bassPost = ctx.createGain();
    bassPost.gain.value = 0.8;
    const mk = (gain: number, pan: number, reverb: number, pre?: AudioNode[]) => new Channel(rs, bus, { gain, pan, reverb, revDest: rev, pre });
    this.ch = {
      kick: mk(0.42, 0, 0),
      snare: mk(0.68, 0.04, 0.12),
      clap: mk(0.6, -0.06, 0.2),
      hat: mk(0.5, 0.28, 0.05),
      perc: mk(0.75, -0.3, 0.16),
      bass: mk(0.2, 0, 0, [shaper, bassLp, bassPost]),
      chords: mk(0.8, -0.18, 0.22),
      pad: mk(0.22, 0.12, 0.4),
      lead: mk(0.8, 0.12, 0.28),
      vox: mk(0.75, 0, 0.3),
      fx: mk(0.4, 0, 0.35),
    };
  }

  prepJobs(): Spec[] {
    const sr = this.rs.sr;
    const jobs: Spec[] = [
      spec('pr:kick', 'kick', sr, { f0: 150, f1: 47, pd: 0.035, ad: 0.26, len: 0.55, click: 0.3, drive: 1.7 }),
      spec('pr:snare', 'snare', sr, { tone: 215, td: 0.05, nd: 0.12, hp: 1500, lp: 9500, len: 0.28, toneAmt: 0.65, noiseAmt: 0.85 }),
      spec('pr:clap', 'clap', sr, 1250, 0.12),
      spec('pr:hat', 'hat', sr, false),
      spec('pr:hato', 'hat', sr, true),
      spec('pr:rim', 'rim', sr, 1800),
      spec('pr:tim1', 'tom', sr, 540, 0.17, 0.55),
      spec('pr:tim2', 'tom', sr, 690, 0.15, 0.55),
      spec('pr:tim3', 'tom', sr, 860, 0.13, 0.55),
      spec('crash', 'crash', sr),
    ];
    for (const c of ['eh', 'dale', 'yeh', 'prra', 'uh', 'wepa'] as ChantName[]) jobs.push(chantSpec(sr, c));
    return jobs;
  }

  protected songJobs(song: PerreoSong): Spec[] {
    // jingle "pe-rre-o" en el tono de la canción: quinta, tercera y tónica aguda
    const base = 55 + ((song.key - 7 + 12) % 12);
    return [sungSpec(this.rs.sr, `pr:jingle:${song.key}`, [[['p', 0.05], ['e', 0.17]], [['R', 0.12], ['e', 0.16]], [['o', 0.55]]], [base + 7, base + 3, base + 12], 4)];
  }

  protected makeSong(index: number): PerreoSong {
    const r = makeRng(this.seed * 7919 + index * 104729);
    const PROGS = ['0m 8M 3M 10M', '0m 10M 8M 10M', '0m 5m 10M 3M', '8M 10M 0m 0m', '0m 8M 5m 7M', '0m 5m 8M 7M', '0m 3M 10M 5m'];
    const verse = prog(pick(r, PROGS));
    const chorus = chance(r, 0.45) ? verse : prog(pick(r, PROGS));
    const pre = prog(pick(r, ['5m 5m 10M 10M', '8M 8M 10M 10M', '5m 8M 10M 7M']));
    const bridge = prog(pick(r, ['8M 10M 0m 0m', '5m 5m 8M 10M', '3M 10M 8M 8M', '8M 8M 5m 7M']));
    const S = (kind: Section['kind'], bars: number, chords: Chord[]): Section => ({ kind, bars, chords, n: 0 });
    const sections: Section[] = [S('intro', 4, chorus), S('verse', 8, verse), S('pre', 4, pre), S('chorus', 8, chorus), S('verse', 8, verse)];
    if (chance(r, 0.6)) sections.push(S('pre', 4, pre));
    sections.push(S('chorus', 8, chorus), S('bridge', chance(r, 0.5) ? 4 : 8, bridge), S('chorus', 8, chorus), S('outro', 4, chorus), S('jingle', 2, prog('0m 0m')));
    const a = makeMotif(r);
    const b = chance(r, 0.5) ? varyMotif(r, a) : makeMotif(r);
    const meta = PERREO_SONGS[index % PERREO_SONGS.length];
    const key = pick(r, [9, 1, 6, 7, 11, 4, 2, 5]);
    const tune = {
      'pr:kick': tuneRate(ftom(47), key),
      'pr:snare': tuneRate(ftom(215), key, [0, 3, 7]),
      'pr:tim1': tuneRate(ftom(540), key, MINOR),
      'pr:tim2': tuneRate(ftom(690), key, MINOR),
      'pr:tim3': tuneRate(ftom(860), key, MINOR),
      'pr:rim': tuneRate(ftom(1800), key, MINOR),
    };
    return this.finishSong({
      index,
      seed: index,
      title: meta[0],
      artist: meta[1],
      bpm: irand(r, 90, 98),
      key,
      sections,
      snarePat: irand(r, 0, SNARES.length - 1),
      bassPat: irand(r, 0, BASSES.length - 1),
      hatPat: irand(r, 0, 2),
      stabPat: irand(r, 0, STABS.length - 1),
      chordInst: pick(r, ['mallet', 'pluck', 'keys'] as ChordInst[]),
      leadInst: pick(r, ['whistle', 'accordion', 'saw', 'mallet'] as LeadInst[]),
      motifs: [a, varyMotif(r, a), a, b],
      arpPat: pick(r, ARPS),
      tune,
    });
  }

  protected onStop() {
    if (this.vib) {
      try { this.vib.osc.stop(); } catch { /* */ }
      this.vib.osc.disconnect();
      this.vib.g.disconnect();
      this.vib = null;
      this.rs.stats.fixed -= 2;
    }
    this.prevLead = null;
  }

  private vibrato(): AudioNode {
    if (!this.vib) {
      const ctx = this.rs.ctx;
      const osc = ctx.createOscillator();
      osc.frequency.value = 5.6;
      const g = ctx.createGain();
      g.gain.value = 16; // cents
      osc.connect(g);
      osc.start();
      this.vib = { osc, g };
      this.rs.stats.fixed += 2;
    }
    return this.vib.g;
  }

  private bassMidi(key: number, c: Chord, deg: number) {
    const pc = (key + c.root) % 12;
    let m = 33 + ((pc - 9 + 12) % 12);
    if (deg === 7) m += m + 7 > 45 ? -5 : 7;
    else if (deg === 12) m += 12;
    return m;
  }

  /** Prepara la frase melódica de 2 compases del estribillo. */
  private realize(st: Step<PerreoSong>) {
    const song = st.song;
    const unit = (st.barInSec >> 1) % 4;
    const motif = song.motifs[unit];
    const key = song.key;
    const center = 66;
    const c0 = st.chord;
    // ancla: nota del acorde cercana al centro
    const pcs0 = chordPcs(key, c0);
    const anchor = snapToPcs(center, pcs0);
    this.phrase = motif.map((n) => {
      const barOff = n.step >= 16 ? 1 : 0;
      const chord = st.sec.chords[(st.barInSec + barOff) % st.sec.chords.length];
      const sc = scaleFor(key, chord);
      let m = scaleStep(snapToPcs(anchor, sc), n.contour, sc);
      if (n.step % 8 === 0 || n.len >= 4) m = snapToPcs(m, chordPcs(key, chord));
      return { step: n.step, midi: m, len: n.len, vel: 0.55 + n.accent * 0.35 };
    });
  }

  protected onResume(st: Step<PerreoSong>) {
    this.prevVoicing = voiceChord(st.song.key, st.chord, 64, 3);
    const k = st.sec.kind;
    this.phrase = [];
    if (k === 'chorus' || k === 'intro' || k === 'outro') this.realize(st);
    this.fillKind = (st.bar * 7 + st.song.index) % 3;
  }

  protected onBar(st: Step<PerreoSong>, t: number) {
    const { sec, song, barInSec } = st;
    if ((sec.kind === 'chorus' || sec.kind === 'intro' || (sec.kind === 'outro' && barInSec < 2)) && barInSec % 2 === 0) this.realize(st);
    if (st.fill) this.fillKind = (st.bar * 7 + song.index) % 3;
    // subida de ruido al final de la intro y antes del estribillo
    if (sec.kind === 'intro' && st.lastBar) this.rs.sweep(this.ch.fx.input, t, st.barDur, 600, 6000, 0.4, true, 1.5);
    if (sec.kind === 'pre' && barInSec === 0) this.rs.sweep(this.ch.fx.input, t, st.barDur * sec.bars, 400, 7000, 0.5, true, 1.5);
    if (sec.kind === 'chorus' && barInSec === 0) {
      const cr = this.rs.maybe('crash');
      if (cr) this.rs.play(this.ch.fx.input, t, cr, 0.55);
      this.rs.sweep(this.ch.fx.input, t, st.barDur * 0.75, 6000, 300, 0.35, false, 1.2);
    }
  }

  protected play(st: Step<PerreoSong>, t: number) {
    const rs = this.rs, ch = this.ch;
    const { sec, song, s, barInSec, chord, stepDur } = st;
    const key = song.key;
    const k = sec.kind;
    const buf = (name: string) => rs.maybe(name);
    const hit = (c: Channel, name: string, vel: number, rate = 1) => {
      const b = buf(name);
      if (b) rs.play(c.input, t + (Math.random() - 0.5) * 0.004, b, vel, rate * (song.tune[name] ?? 1));
    };

    if (k === 'jingle') return this.jingle(st, t);

    const full = k === 'chorus' || (k === 'outro' && barInSec < 2);
    const drums = k !== 'intro' || barInSec >= 1;
    const breakdown = k === 'bridge' && barInSec < sec.bars / 2;
    const fill = st.fill && k !== 'intro';
    const preRoll = k === 'pre' && st.lastBar && s >= 8;

    // ── batería ──
    if (drums && !breakdown) {
      const kickHere = s % 4 === 0 && !(fill && s >= 12) && !(preRoll && s >= 12) && !(k === 'intro');
      if (kickHere) hit(ch.kick, 'pr:kick', s === 0 ? 1 : 0.9);
      if (k !== 'intro') {
        if (preRoll) {
          hit(ch.snare, 'pr:snare', 0.35 + ((s - 8) / 8) * 0.6);
          if (s >= 12) hit(ch.snare, 'pr:snare', 0.4 + ((s - 12) / 4) * 0.5, 1.06);
        } else if (fill && s >= 12) {
          this.fill(st, t);
        } else {
          for (const [ss, v] of SNARES[song.snarePat]) {
            if (ss === s) {
              hit(ch.snare, 'pr:snare', v * (k === 'verse' ? 0.85 : 1));
              if (full && (s === 6 || s === 14)) hit(ch.clap, 'pr:clap', 0.7);
            }
          }
        }
      }
    }
    if (drums) {
      // charles
      const hp = song.hatPat;
      let hv = 0;
      if (s % 2 === 0) hv = s % 4 === 0 ? 0.55 : 0.8;
      if (hp === 1 && (s === 7 || s === 15)) hv = 0.4;
      if ((full || hp === 2) && s % 2 === 1) hv = 0.3;
      if (breakdown && s % 4 !== 2) hv = 0;
      if (hv > 0 && !(k === 'intro' && s % 4 !== 2)) {
        if (full && s % 8 === 6 && hp !== 1) hit(ch.hat, 'pr:hato', 0.5);
        else hit(ch.hat, 'pr:hat', hv * (0.85 + Math.random() * 0.3));
      }
      if (full && (s === 2 || s === 10)) hit(ch.perc, 'pr:rim', 0.45);
    }

    // ── bajo ──
    if (k !== 'intro' || barInSec === sec.bars - 1) {
      const pat = k === 'bridge' ? [[0, 16, 0]] as [number, number, number][] : k === 'pre' ? [[0, 6, 0], [8, 6, 0], [14, 2, 7]] as [number, number, number][] : BASSES[song.bassPat];
      for (const [ss, len, deg] of pat) {
        if (ss !== s) continue;
        if (fill && ss >= 12 && k !== 'bridge') continue;
        const m = this.bassMidi(key, chord, deg);
        const glide = s === 0 && m !== this.lastBass && chance(Math.random, 0.5) ? this.lastBass : undefined;
        rs.bass808(ch.bass.input, t, m, len * stepDur, s === 0 ? 1 : 0.85, glide);
        this.lastBass = m;
      }
    }

    // ── acordes ──
    if (s === 0) this.prevVoicing = voiceChord(key, chord, 64, 3, this.prevVoicing);
    const vc = this.prevVoicing!;
    const stabSteps = STABS[song.stabPat];
    if (k === 'intro' || full || k === 'pre' || k === 'bridge') {
      if (song.chordInst === 'keys' || k === 'bridge') {
        if (s === 0) rs.stab(ch.chords.input, t, vc, 0.55, { type: 'triangle', decay: st.barDur * 0.5, cutoff: 2600, envAmt: 1500 });
        if (s === 8 && k !== 'bridge') rs.stab(ch.chords.input, t, vc, 0.4, { type: 'triangle', decay: st.barDur * 0.4, cutoff: 2600, envAmt: 1500 });
      } else if (stabSteps.includes(s)) {
        const v = s % 4 === 0 ? 0.65 : 0.5;
        if (song.chordInst === 'mallet') for (const m of vc) rs.mallet(ch.chords.input, t, m + 12, v * 0.55, 0.3);
        else rs.stab(ch.chords.input, t, vc, v, { type: 'sawtooth', decay: 0.2, cutoff: 700, envAmt: 3200, q: 2 });
      }
    } else if (k === 'verse') {
      // estrofa: arpegio suave sobre el dembow
      const steps = [0, 3, 6, 8, 11, 14];
      const i = steps.indexOf(s);
      if (i >= 0 && !(barInSec % 4 === 3 && s >= 11)) {
        const note = vc[song.arpPat[i] % vc.length] + (song.arpPat[i] >= vc.length ? 12 : 0) + 12;
        if (song.chordInst === 'pluck') rs.stab(ch.chords.input, t, [note], 0.4, { type: 'square', decay: 0.18, cutoff: 900, envAmt: 2500 });
        else rs.mallet(ch.chords.input, t, note, 0.32, 0.28);
      }
    }
    // pad en estribillo y puente
    if (s === 0 && (full || k === 'bridge' || k === 'intro' || (k === 'pre' && barInSec >= 2))) {
      const soft = k === 'bridge' || k === 'intro';
      rs.pad(ch.pad.input, t, voiceChord(key, chord, 60, 4), st.barDur, soft ? 0.8 : 0.6, { cutoff: soft ? 1100 : 1600, attack: soft ? 0.5 : 0.12, release: 0.5, voices: 2, detune: 10 });
    }

    // ── melodía (gancho del estribillo) ──
    if (full || (k === 'intro' && barInSec >= 2)) {
      const off = (barInSec & 1) * 16 + s;
      for (const n of this.phrase) {
        if (n.step !== off) continue;
        const dur = n.len * stepDur * 0.92;
        const vel = n.vel * (k === 'intro' ? 0.6 : 1);
        const legato = this.prevLead !== null && Math.abs(this.prevLead - n.midi) <= 4 && song.leadInst === 'saw' && chance(Math.random, 0.4);
        if (song.leadInst === 'mallet') rs.mallet(ch.lead.input, t, n.midi + 12, vel * 0.7, 0.4);
        else rs.lead(ch.lead.input, t, n.midi, dur, vel, { type: song.leadInst, glideFrom: legato ? this.prevLead! : undefined, vib: song.leadInst === 'whistle' || song.leadInst === 'accordion' ? this.vibrato() : null });
        this.prevLead = n.midi;
      }
    }

    // ── voces ──
    let chant: ChantName | null = null;
    if (k === 'chorus' && barInSec === 0 && s === 0) chant = 'eh';
    else if (k === 'chorus' && barInSec === 4 && s === 14) chant = pick(Math.random, ['dale', 'yeh', 'wepa'] as ChantName[]);
    else if (k === 'verse' && barInSec % 4 === 3 && s === 12 && chance(Math.random, 0.55)) chant = pick(Math.random, ['yeh', 'prra', 'dale'] as ChantName[]);
    else if (k === 'intro' && barInSec === 1 && s === 8) chant = 'prra';
    else if (k === 'bridge' && barInSec % 4 === 0 && s === 0) chant = 'uh';
    else if (k === 'pre' && st.lastBar && s === 12) chant = 'wepa';
    if (chant) {
      const b = rs.maybe(chantKey(chant));
      if (b) rs.play(ch.vox.input, t, b, chant === 'eh' ? 0.9 : 0.75);
    }
  }

  private fill(st: Step<PerreoSong>, t: number) {
    const ch = this.ch, rs = this.rs, s = st.s;
    const kind = this.fillKind;
    const tn = st.song.tune;
    const b = (n: string) => rs.maybe(n);
    if (kind === 0) {
      // redoble de timbales descendente
      const name = ['pr:tim3', 'pr:tim3', 'pr:tim2', 'pr:tim1'][s - 12];
      const x = b(name);
      if (x) rs.play(ch.perc.input, t, x, 0.55 + (s - 12) * 0.1, tn[name]);
      if (s === 14) { const y = b('pr:tim2'); if (y) rs.play(ch.perc.input, t + st.stepDur / 2, y, 0.5, tn['pr:tim2']); }
    } else if (kind === 1) {
      // caja en semicorcheas que crece
      const x = b('pr:snare');
      if (x) rs.play(ch.snare.input, t, x, 0.4 + (s - 12) * 0.15, tn['pr:snare']);
    } else {
      // hueco: solo un "¡eh!" y un golpe de timbal al final
      if (s === 12) { const v = b(chantKey('yeh')); if (v) rs.play(ch.vox.input, t, v, 0.6); }
      if (s === 15) { const x = b('pr:tim1'); if (x) rs.play(ch.perc.input, t, x, 0.7, tn['pr:tim1']); }
    }
  }

  private jingle(st: Step<PerreoSong>, t: number) {
    const rs = this.rs, ch = this.ch, key = st.song.key;
    if (st.barInSec === 0 && st.s === 0) {
      const b = rs.maybe(`pr:jingle:${key}`);
      if (b) rs.play(ch.vox.input, t, b, 0.8);
      rs.pad(ch.pad.input, t, voiceChord(key, st.chord, 62, 4), st.barDur * 1.5, 0.8, { cutoff: 2200, attack: 0.05, release: 1, voices: 2 });
      rs.bass808(ch.bass.input, t, this.bassMidi(key, st.chord, 0), st.barDur, 0.9);
      const c = rs.maybe('crash');
      if (c) rs.play(ch.fx.input, t, c, 0.4);
    }
    // el dembow vuelve a entrar en la última negra
    if (st.barInSec === 1 && st.s >= 12) {
      const nm = st.s % 2 ? 'pr:tim2' : 'pr:tim3';
      const x = rs.maybe(nm);
      if (x) rs.play(ch.perc.input, t, x, 0.6, st.song.tune[nm]);
    }
    if (st.barInSec === 1 && st.s === 0) rs.sweep(ch.fx.input, t, st.barDur, 500, 6000, 0.35, true, 1.5);
  }
}

