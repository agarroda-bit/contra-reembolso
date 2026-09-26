// Sonidos propios de los vehículos: un claxon distinto para cada tipo, el motor de los vehículos locos
// nuevos y la música de feria de la paella-móvil. Todo sintetizado con el contexto de audio del juego.
import * as THREE from 'three';
import type { Game } from '../core/game';
import type { Vehicle } from './vehicle';

const tmpV = new THREE.Vector3();
const tmpR = new THREE.Vector3();

interface Out {
  ctx: AudioContext;
  node: GainNode;
  t: number;
}

/** Volumen y panorama según la distancia a la cámara (igual que los efectos del juego). */
function spatial(game: Game, pos: THREE.Vector3 | null, maxDist = 140): { gain: number; pan: number } {
  if (!pos) return { gain: 1, pan: 0 };
  const cam = game.camera;
  const d = tmpV.copy(pos).sub(cam.position);
  const dist = d.length();
  if (dist > maxDist) return { gain: 0, pan: 0 };
  const gain = 1 / Math.pow(1 + dist / 12, 1.4);
  tmpR.set(1, 0, 0).applyQuaternion(cam.quaternion);
  const pan = dist > 0.5 ? THREE.MathUtils.clamp(d.normalize().dot(tmpR), -1, 1) * 0.8 : 0;
  return { gain, pan };
}

function audioOf(game: Game): { ctx: AudioContext; bus: GainNode } | null {
  const a = game.mod.audio;
  const ctx: AudioContext | null = a?.ctx ?? null;
  if (!ctx || ctx.state !== 'running' || !a.sfxBus) return null;
  return { ctx, bus: a.sfxBus };
}

/** Salida de un sonido suelto en una posición (null si no se oye). */
function open(game: Game, pos: THREE.Vector3 | null, vol = 1, maxDist = 140): Out | null {
  const a = audioOf(game);
  if (!a) return null;
  const { gain, pan } = spatial(game, pos, maxDist);
  if (gain * vol < 0.01) return null;
  const g = a.ctx.createGain();
  g.gain.value = gain * vol;
  if (pan !== 0) {
    const p = a.ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(a.bus);
  } else g.connect(a.bus);
  return { ctx: a.ctx, node: g, t: a.ctx.currentTime };
}

/** Una nota con envolvente (ataque, mantenida y caída). */
function note(o: Out, type: OscillatorType, f0: number, f1: number, delay: number, dur: number, vol: number, dest: AudioNode = o.node, attack = 0.01) {
  const { ctx } = o;
  const t = o.t + delay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur * 0.7));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Campanita (timbre, ascensor): golpe y caída larga. */
function bell(o: Out, f: number, delay: number, vol: number, decay = 0.6) {
  const { ctx } = o;
  const t = o.t + delay;
  for (const [m, v] of [[1, 1], [2.76, 0.35], [5.4, 0.12]] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f * m;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol * v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay / m ** 0.3);
    osc.connect(g).connect(o.node);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }
}

function lowpass(o: Out, f: number, q = 0.8): BiquadFilterNode {
  const flt = o.ctx.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.value = f;
  flt.Q.value = q;
  flt.connect(o.node);
  return flt;
}

/** Claxon de dos tonos (el de siempre, con otro timbre y duración). */
function dualHorn(o: Out, type: OscillatorType, f: number, dur: number, vol: number, cut: number, delay = 0) {
  const flt = lowpass(o, cut);
  note(o, type, f, f, delay, dur, vol, flt, 0.02);
  note(o, type, f * 1.26, f * 1.26, delay, dur, vol, flt, 0.02);
}

type HornFn = (o: Out) => void;

/** Claxon de cada tipo. Los que no están aquí usan el del juego (evento 'vehicle:horn'). */
const HORNS: Partial<Record<string, HornFn>> = {
  // la furgoneta de reparto: ¡ding-dong! como el timbre de una casa
  van: (o) => {
    note(o, 'triangle', 659, 659, 0, 0.45, 0.32);
    note(o, 'sine', 1318, 1318, 0, 0.3, 0.08);
    note(o, 'triangle', 523, 523, 0.34, 0.75, 0.32);
    note(o, 'sine', 1046, 1046, 0.34, 0.5, 0.08);
  },
  scooter: (o) => {
    note(o, 'square', 720, 700, 0, 0.1, 0.12);
    note(o, 'square', 720, 700, 0.15, 0.12, 0.12);
  },
  // el taxi: dos pitidos cortos y con prisa
  taxi: (o) => {
    dualHorn(o, 'square', 430, 0.13, 0.15, 2000);
    dualHorn(o, 'square', 430, 0.2, 0.15, 2000, 0.2);
  },
  sports: (o) => dualHorn(o, 'sawtooth', 540, 0.55, 0.13, 3200),
  suv: (o) => dualHorn(o, 'square', 300, 0.5, 0.17, 1600),
  // la policía: un «¡uuip!» de sirena
  police: (o) => {
    note(o, 'sine', 520, 1500, 0, 0.3, 0.3);
    note(o, 'sine', 1500, 700, 0.3, 0.22, 0.3);
  },
  policevan: (o) => {
    note(o, 'sine', 420, 1200, 0, 0.34, 0.3);
    note(o, 'sine', 1200, 560, 0.34, 0.25, 0.3);
  },
  // Los Devueltos se burlan: «wah, wah, wah, waaah»
  gangvan: (o) => {
    const flt = lowpass(o, 1300, 2);
    [392, 370, 349].forEach((f, i) => note(o, 'sawtooth', f, f * 0.97, i * 0.26, 0.24, 0.2, flt, 0.03));
    note(o, 'sawtooth', 330, 300, 0.8, 0.8, 0.22, flt, 0.03);
  },
  // juguete que chirría
  cart: (o) => {
    for (const d of [0, 0.2]) {
      note(o, 'sine', 900, 1900, d, 0.08, 0.25);
      note(o, 'sine', 1900, 1100, d + 0.08, 0.09, 0.25);
    }
  },
  // timbre de bici (como dice el cartel del patinete)
  escooter: (o) => {
    bell(o, 2350, 0, 0.18, 0.5);
    bell(o, 2350, 0.16, 0.18, 0.6);
  },
  garbage: (o) => dualHorn(o, 'square', 175, 0.95, 0.2, 1300),
  // música de ascensor: ding, ding, ding
  golf: (o) => {
    bell(o, 1047, 0, 0.16, 0.9);
    bell(o, 1319, 0.2, 0.16, 0.9);
    bell(o, 1568, 0.4, 0.16, 1.2);
  },
  // sirena de barco
  crane: (o) => {
    const flt = lowpass(o, 520, 1.2);
    note(o, 'sawtooth', 98, 94, 0, 1.4, 0.4, flt, 0.1);
    note(o, 'sawtooth', 147, 141, 0, 1.4, 0.25, flt, 0.1);
  },
  armored: (o) => dualHorn(o, 'square', 150, 0.8, 0.2, 1100),
  // la yaya: «¡piii, piii!»
  granny: (o) => {
    note(o, 'sine', 1760, 1760, 0, 0.13, 0.22);
    note(o, 'sine', 1760, 1760, 0.2, 0.2, 0.22);
  },
  // bocina de payaso (pera de goma)
  sofa: (o) => {
    const flt = o.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 900;
    flt.Q.value = 1.4;
    flt.connect(o.node);
    note(o, 'square', 330, 250, 0, 0.2, 0.55, flt, 0.02);
    note(o, 'square', 290, 220, 0.26, 0.26, 0.55, flt, 0.02);
  },
  // avisador de marcha atrás: pi, pi, pi
  forklift: (o) => {
    for (let i = 0; i < 3; i++) note(o, 'square', 1050, 1050, i * 0.22, 0.12, 0.1);
  },
  // la paella-móvil: fanfarria de feria (la música entera la pone el vehículo loco)
  paella: (o) => {
    const flt = lowpass(o, 2600);
    [392, 523, 659, 784].forEach((f, i) => note(o, 'square', f, f, i * 0.09, 0.12, 0.1, flt));
    note(o, 'square', 1047, 1047, 0.36, 0.3, 0.1, flt);
  },
};

/**
 * Pita el vehículo con su claxon. Los que tienen claxon propio suenan aquí; el resto, con el del
 * juego (evento 'vehicle:horn', que lo pone el sistema de audio).
 */
export function honk(game: Game, v: Vehicle) {
  const fn = HORNS[v.spec.kind];
  if (!fn) {
    game.events.emit('vehicle:horn' as any, { vehicle: v } as any);
    return;
  }
  const o = open(game, v.getPosition(tmpV).clone(), 1);
  if (o) fn(o);
}

/** Pitido corto (marcha atrás de la carretilla, la silla de la yaya). */
export function beep(game: Game, pos: THREE.Vector3, freq = 1050, vol = 0.1, dur = 0.12) {
  const o = open(game, pos, 1, 60);
  if (o) note(o, 'square', freq, freq, 0, dur, vol);
}

// ─────────── Música de feria de la paella-móvil ───────────

/** Melodía (nota MIDI, duración en corcheas). Inventada: un pasodoble de verbena. */
const TUNE: [number, number][] = [
  [76, 1], [76, 1], [77, 1], [76, 1], [74, 2], [72, 2],
  [74, 1], [74, 1], [76, 1], [74, 1], [72, 2], [71, 2],
  [72, 1], [76, 1], [79, 1], [76, 1], [81, 2], [79, 2],
  [77, 1], [76, 1], [74, 1], [71, 1], [72, 4],
];
/** Bajo por compás (4 corcheas): tónica y quinta alternando. */
const BASS: [number, number][] = [[48, 55], [43, 50], [48, 55], [43, 48]];
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
export const PAELLA_TUNE_SECONDS = 32 * 0.17 + 0.3;

/** Toca la música de la paella-móvil (unos 5,7 s) en la posición del vehículo. */
export function paellaMusic(game: Game, pos: THREE.Vector3) {
  const o = open(game, pos, 1, 160);
  if (!o) return;
  const e = 0.17; // corchea
  const lead = lowpass(o, 2800);
  let t = 0;
  for (const [n, d] of TUNE) {
    const f = midi(n);
    note(o, 'square', f, f, t, d * e * 0.92, 0.07, lead);
    note(o, 'triangle', f * 2, f * 2, t, d * e * 0.8, 0.035, lead);
    t += d * e;
  }
  // oom-pah: bajo en las partes fuertes, acorde en las débiles, y pandereta
  for (let bar = 0; bar < 8; bar++) {
    const [root, fifth] = BASS[bar % 4];
    for (let q = 0; q < 2; q++) {
      const tb = (bar * 4 + q * 2) * e;
      note(o, 'triangle', midi(q ? fifth : root), midi(q ? fifth : root), tb, e * 0.9, 0.16, lead);
      note(o, 'square', midi(root + 12), midi(root + 12), tb + e, e * 0.5, 0.03, lead);
      note(o, 'square', midi(root + 16), midi(root + 16), tb + e, e * 0.5, 0.025, lead);
      // pandereta: chasquido agudo
      note(o, 'square', 5200 + q * 400, 4800, tb + e, 0.04, 0.02);
    }
  }
}

// ─────────── Motores propios de los vehículos locos nuevos ───────────

interface Voice {
  kind: string;
  a: OscillatorNode;
  b: OscillatorNode;
  lfo: OscillatorNode | null;
  lfoGain: GainNode | null;
  noise: AudioBufferSourceNode | null;
  noiseGain: GainNode | null;
  filter: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
  last: number;
}

/** Tipos con motor propio (el resto usa los motores del sistema de audio). */
export const CUSTOM_ENGINES = new Set(['granny', 'paella', 'sofa', 'forklift']);
const MAX_VOICES = 3;
const voices = new Map<number, Voice>();
let noiseBuf: AudioBuffer | null = null;

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function makeVoice(ctx: AudioContext, bus: GainNode, kind: string): Voice {
  const a = ctx.createOscillator();
  const b = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 1.5;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const pan = ctx.createStereoPanner();
  a.connect(filter);
  b.connect(filter);
  filter.connect(gain).connect(pan).connect(bus);
  let lfo: OscillatorNode | null = null;
  let lfoGain: GainNode | null = null;
  let noise: AudioBufferSourceNode | null = null;
  let noiseGain: GainNode | null = null;
  if (kind === 'granny') {
    // motorcito eléctrico: zumbido fino con un poco de vibrato
    a.type = 'sine';
    b.type = 'triangle';
  } else if (kind === 'forklift') {
    // eléctrico grave con silbido de engranajes
    a.type = 'triangle';
    b.type = 'sawtooth';
  } else {
    // sofá (cortacésped de dos tiempos) y paella-móvil (diésel viejo): explosiones con pulso
    a.type = 'sawtooth';
    b.type = 'square';
    lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfoGain = ctx.createGain();
    lfoGain.gain.value = 0;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start();
  }
  if (kind === 'paella') {
    // la paella chisporrotea en el techo
    noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx);
    noise.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 5200;
    hp.Q.value = 0.8;
    noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noise.connect(hp).connect(noiseGain).connect(pan);
    noise.start();
  }
  a.start();
  b.start();
  return { kind, a, b, lfo, lfoGain, noise, noiseGain, filter, gain, pan, last: 0 };
}

/**
 * Motor propio de un vehículo loco nuevo: se llama cada frame mientras se oye (como audio.engine).
 * rpm 0..1, thr 0..1. false si no hay sitio o no hay audio (entonces no suena).
 */
export function customEngine(game: Game, v: Vehicle, rpm: number, thr: number, vol: number, extra = 0): boolean {
  const au = audioOf(game);
  if (!au) return false;
  const { ctx, bus } = au;
  let e = voices.get(v.id);
  if (!e) {
    if (voices.size >= MAX_VOICES) return false;
    e = makeVoice(ctx, bus, v.spec.kind);
    voices.set(v.id, e);
  }
  e.last = ctx.currentTime;
  const t = ctx.currentTime + 0.05;
  const { gain, pan } = spatial(game, v.getPosition(tmpV), 90);
  let g = 0;
  switch (e.kind) {
    case 'granny': {
      const f = 380 + rpm * 620 + Math.sin(ctx.currentTime * 30) * 12;
      e.a.frequency.linearRampToValueAtTime(f, t);
      e.b.frequency.linearRampToValueAtTime(f * 2.02, t);
      e.filter.frequency.linearRampToValueAtTime(2600, t);
      g = gain * vol * (0.02 + thr * 0.035);
      break;
    }
    case 'forklift': {
      const f = 90 + rpm * 260;
      e.a.frequency.linearRampToValueAtTime(f, t);
      e.b.frequency.linearRampToValueAtTime(f * 3 + extra * 500, t);
      e.filter.frequency.linearRampToValueAtTime(700 + thr * 900 + extra * 1800, t);
      g = gain * vol * (0.05 + thr * 0.05 + extra * 0.05);
      break;
    }
    case 'sofa': {
      // cortacésped: el pulso va con las revoluciones (put-put-put… ¡brrrrr!)
      const f = 55 + rpm * 120;
      e.a.frequency.linearRampToValueAtTime(f, t);
      e.b.frequency.linearRampToValueAtTime(f * 0.5, t);
      e.lfo!.frequency.linearRampToValueAtTime(9 + rpm * 26, t);
      e.filter.frequency.linearRampToValueAtTime(500 + thr * 1500 + rpm * 600, t);
      g = gain * vol * (0.06 + thr * 0.06);
      e.lfoGain!.gain.linearRampToValueAtTime(g * 0.9, t);
      break;
    }
    default: {
      // paella-móvil: diésel viejo que traquetea
      const f = 26 + rpm * 95;
      e.a.frequency.linearRampToValueAtTime(f, t);
      e.b.frequency.linearRampToValueAtTime(f * 0.5, t);
      e.lfo!.frequency.linearRampToValueAtTime(6 + rpm * 14, t);
      e.filter.frequency.linearRampToValueAtTime(260 + thr * 1200 + rpm * 700, t);
      g = gain * vol * (0.1 + thr * 0.08);
      e.lfoGain!.gain.linearRampToValueAtTime(g * 0.45, t);
      e.noiseGain!.gain.linearRampToValueAtTime(gain * vol * 0.03, t);
    }
  }
  e.gain.gain.linearRampToValueAtTime(g, t);
  e.pan.pan.linearRampToValueAtTime(pan, t);
  return true;
}

function stopVoice(ctx: AudioContext, e: Voice) {
  const now = ctx.currentTime;
  e.gain.gain.cancelScheduledValues(now);
  e.gain.gain.linearRampToValueAtTime(0, now + 0.1);
  e.noiseGain?.gain.linearRampToValueAtTime(0, now + 0.1);
  e.lfoGain?.gain.cancelScheduledValues(now);
  e.lfoGain?.gain.linearRampToValueAtTime(0, now + 0.1);
  for (const n of [e.a, e.b, e.lfo, e.noise]) n?.stop(now + 0.15);
}

/** Apaga los motores propios que ya no se piden (llamar una vez por frame). */
export function sweepEngines(game: Game) {
  const ctx: AudioContext | null = game.mod.audio?.ctx ?? null;
  if (!ctx || !voices.size) return;
  const now = ctx.currentTime;
  for (const [id, e] of voices) {
    if (now - e.last > 0.25) {
      stopVoice(ctx, e);
      voices.delete(id);
    }
  }
}

/** En pausa: silencio. */
export function muteEngines(game: Game) {
  const ctx: AudioContext | null = game.mod.audio?.ctx ?? null;
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const e of voices.values()) {
    e.gain.gain.setTargetAtTime(0, now, 0.05);
    e.lfoGain?.gain.setTargetAtTime(0, now, 0.05);
    e.noiseGain?.gain.setTargetAtTime(0, now, 0.05);
  }
}
