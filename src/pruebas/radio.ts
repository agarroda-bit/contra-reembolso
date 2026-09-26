// Banco de pruebas de la RADIO: cambia de emisora, sube/baja del "coche", pausa, distorsión,
// medidores de nivel, espectrograma en vivo y análisis offline (espectrograma + cromagrama).
// Parámetros: ?emisora=0..2  ?fuera=1 (empieza fuera del coche)
//   ?analisis=0..2&seg=20&cancion=N&desde=compás&mute=kick,bass  (render offline + cromagrama)
// Desde la consola: __voces(), __sanity(), __stems(i, seg), __loud(), __bench(), __stats(), __levels()
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../core/game';
import { installDebug } from '../core/debug';
import { buildPlaceholderWorld } from '../world/placeholder';
import { AudioEngine } from '../audio/audio';
import { installRadio, renderStationOffline, type Radio } from '../audio/radio';
import * as RR from '../audio/radio/render';
import { RadioSynth } from '../audio/radio/synth';
import { buildChain } from '../audio/radio';
import { PerreoStation } from '../audio/radio/stations/perreo';
import { ElectroStation } from '../audio/radio/stations/electro';
import { RumbaStation } from '../audio/radio/stations/rumba';
import { chantSpec, quejioSpec } from '../audio/radio/voices';

const CSS = `
.rp{position:fixed;left:18px;top:18px;width:470px;max-height:calc(100vh - 36px);overflow:auto;background:#fff7e6;border:4px solid #1b1030;border-radius:24px;
  box-shadow:10px 10px 0 rgba(27,16,48,.7);padding:16px;color:#1b1030;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;pointer-events:auto}
.rp h1{margin:0 0 10px;font:900 26px system-ui;letter-spacing:-.5px}
.rp h1 span{background:#ffd23f;border:3px solid #1b1030;border-radius:10px;padding:0 8px;margin-right:6px}
.rp .pantalla{background:#1b1030;border-radius:16px;padding:12px 14px;color:#7dffb0;font:800 15px ui-monospace,Menlo,monospace;min-height:92px;box-shadow:inset 0 0 0 3px #2b1d4a}
.rp .pantalla .em{font:900 22px system-ui;color:#ffd23f;margin-bottom:6px}
.rp .pantalla .sh{font:700 14px/1.35 system-ui;color:#fff}
.rp .pantalla .np{margin-top:8px;font:700 12px/1.45 ui-monospace,Menlo,monospace;color:#2ec4b6;white-space:pre-line}
.rp .fila{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.rp button{flex:1;min-width:90px;border:3px solid #1b1030;border-radius:14px;background:#ffd23f;color:#1b1030;font:900 16px system-ui;padding:10px 8px;cursor:pointer;box-shadow:3px 3px 0 #1b1030}
.rp button:active{transform:translate(2px,2px);box-shadow:1px 1px 0 #1b1030}
.rp button.on{background:#2ec4b6}
.rp button.rosa{background:#ff4f81;color:#fff}
.rp button.morado{background:#6c3bd1;color:#fff}
.rp button.naranja{background:#ff7b54}
.rp .lbl{font:900 12px system-ui;text-transform:uppercase;letter-spacing:.6px;margin-top:12px;opacity:.7}
.rp .stats{font:700 12px/1.5 ui-monospace,Menlo,monospace;background:#fff;border:3px solid #1b1030;border-radius:12px;padding:8px 10px;margin-top:10px;white-space:pre}
.rp .medidor{height:16px;border:3px solid #1b1030;border-radius:9px;background:#fff;overflow:hidden;margin-top:6px;position:relative}
.rp .medidor i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#2ec4b6,#ffd23f 70%,#ff4f81)}
.rp input[type=range]{width:100%;accent-color:#6c3bd1}
.espec{position:fixed;right:18px;top:18px;width:min(700px,calc(100vw - 560px));background:#1b1030;border:4px solid #1b1030;border-radius:18px;box-shadow:10px 10px 0 rgba(27,16,48,.7);overflow:hidden;pointer-events:auto}
.espec canvas{display:block;width:100%}
.espec .t{font:900 13px system-ui;color:#ffd23f;padding:6px 10px}
`;

async function main() {
  await RAPIER.init();
  document.getElementById('carga')?.remove();
  const game = new Game(document.getElementById('app')!, document.getElementById('ui')!);
  game.world = buildPlaceholderWorld(game);
  installDebug(game);
  game.scene.background = new THREE.Color('#ffb38a');
  game.scene.add(new THREE.HemisphereLight('#fff2d0', '#5a3a7a', 1.3));
  const sun = new THREE.DirectionalLight('#ffffff', 1.6);
  sun.position.set(30, 50, 20);
  game.scene.add(sun);
  game.camera.position.set(30, 22, 48);
  game.camera.lookAt(0, 0, 0);

  const params = new URLSearchParams(location.search);
  const audio = new AudioEngine(game);
  game.addSystem(audio);
  // vehículo falso: la radio solo suena "en el coche"
  const fakeCar = {};
  game.mod.vehicles = { current: params.get('fuera') === '1' ? null : fakeCar };
  const radio = installRadio(game) as Radio & { stats: any; nowPlaying(): any; setOverride(i: number | null): void };
  if (params.has('emisora')) radio.station = Number(params.get('emisora'));

  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  const panel = document.createElement('div');
  panel.className = 'rp';
  panel.innerHTML = `
    <h1><span>📻</span>La radio del coche</h1>
    <div class="pantalla"><div class="em">—</div><div class="sh"></div><div class="np"></div></div>
    <div class="fila"><button data-a="prev">◀ Q</button><button data-a="next">E ▶</button></div>
    <div class="fila">
      <button data-s="0" class="rosa">Perreo</button><button data-s="1" class="morado">Electro</button><button data-s="2" class="naranja">Rumba</button><button data-s="-1">Apagar</button>
    </div>
    <div class="lbl">Situación</div>
    <div class="fila"><button data-a="coche" class="on">🚐 En el coche</button><button data-a="pausa">⏸ Pausa</button></div>
    <div class="lbl">Hierbas (distorsión): <b class="dk">0</b></div>
    <div class="fila"><button data-d="0">Normal</button><button data-d="0.4">Un poco</button><button data-d="1">Colocado</button></div>
    <input type="range" min="0" max="1" step="0.01" value="0" class="dist">
    <div class="lbl">Nivel de salida (bus de música)</div>
    <div class="medidor"><i class="rms"></i></div>
    <div class="stats"></div>`;
  game.ui.appendChild(panel);
  panel.addEventListener('mousedown', (e) => e.stopPropagation());
  const $ = <T extends HTMLElement>(sel: string) => panel.querySelector(sel) as T;
  const em = $('.em'), sh = $('.sh'), np = $('.np'), stats = $('.stats'), rmsBar = $('.rms'), dk = $('.dk');
  const distInput = $('.dist') as HTMLInputElement;
  const cocheBtn = panel.querySelector('[data-a=coche]') as HTMLButtonElement;
  const pausaBtn = panel.querySelector('[data-a=pausa]') as HTMLButtonElement;
  const syncCoche = () => {
    const on = !!game.mod.vehicles.current;
    cocheBtn.classList.toggle('on', on);
    cocheBtn.textContent = on ? '🚐 En el coche' : '🚶 A pie';
  };
  syncCoche();
  panel.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b) return;
    audio.ensure();
    audio.ctx?.resume();
    if (b.dataset.a === 'prev') radio.prev();
    if (b.dataset.a === 'next') radio.next();
    if (b.dataset.s !== undefined) radio.station = Number(b.dataset.s);
    if (b.dataset.a === 'coche') {
      game.mod.vehicles.current = game.mod.vehicles.current ? null : fakeCar;
      syncCoche();
    }
    if (b.dataset.a === 'pausa') {
      game.paused = !game.paused;
      pausaBtn.classList.toggle('on', game.paused);
    }
    if (b.dataset.d !== undefined) {
      radio.setDistortion(Number(b.dataset.d));
      distInput.value = b.dataset.d;
    }
    b.blur();
  });
  distInput.addEventListener('input', () => radio.setDistortion(Number(distInput.value)));

  // espectrograma en vivo
  const box = document.createElement('div');
  box.className = 'espec';
  box.innerHTML = `<div class="t">Espectrograma en vivo (grave abajo · agudo arriba)</div>`;
  const cv = document.createElement('canvas');
  cv.width = 760;
  cv.height = 260;
  box.appendChild(cv);
  game.ui.appendChild(box);
  const g2 = cv.getContext('2d')!;
  g2.fillStyle = '#1b1030';
  g2.fillRect(0, 0, cv.width, cv.height);

  let analyser: AnalyserNode | null = null;
  let freq: Uint8Array<ArrayBuffer> | null = null;
  let wave: Float32Array<ArrayBuffer> | null = null;
  const lv = { frames: 0, sumSq: 0, peak: 0, maxLive: 0, samples: [] as number[] };
  (window as any).__levels = () => {
    const rms = lv.frames ? Math.sqrt(lv.sumSq / lv.frames) : 0;
    const out = { rmsDb: +(20 * Math.log10(rms + 1e-9)).toFixed(1), peakDb: +(20 * Math.log10(lv.peak + 1e-9)).toFixed(1), frames: lv.frames };
    lv.frames = 0; lv.sumSq = 0; lv.peak = 0;
    return out;
  };
  (window as any).__radio = radio;
  (window as any).__game = game;
  (window as any).__stats = () => ({ ...radio.stats, now: radio.nowPlaying(), hud: game.hud.radio, ctx: audio.ctx?.state });

  // intentar arrancar el audio (en las pruebas el navegador lo permite sin gesto)
  audio.ensure();
  audio.ctx?.resume().catch(() => {});

  game.addSystem({
    name: 'radio-banco',
    postUpdate: () => ui(),
    pausedUpdate: () => ui(),
  });

  function ui() {
    const r = game.hud.radio;
    em.textContent = r ? r.station : !game.mod.vehicles.current ? '(a pie: la radio no suena)' : radio.station < 0 ? '📻 (apagada)' : '—';
    sh.textContent = r?.show ?? '';
    const n = radio.nowPlaying();
    np.textContent = n ? `${n.title} · ${n.artist}\n${SECCION[n.section] ?? n.section} · compás ${n.bar + 1}/${n.bars} · ${n.bpm} BPM · ${NOTAS[n.key]} menor` : '';
    // lo que tiene pedido la radio (también si se cambia desde la consola o desde otro módulo)
    dk.textContent = ((radio as any).distTarget ?? 0).toFixed(2);
    const s = radio.stats;
    if (s) stats.textContent = `nodos vivos: ${s.live}  (máx ${s.peak})\nfuentes vivas: ${s.sources}\nnodos fijos: ${s.fixed}\ncreados en total: ${s.created}\nmuestras: ${s.buffers} (${s.bufferMB.toFixed(1)} MB)\naudio: ${audio.ctx?.state ?? 'sin crear'} · fps ${game.fps.toFixed(0)}`;
    // medidor + espectrograma
    const ctx = audio.ctx;
    if (ctx && !analyser && audio.musicBus) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      audio.musicBus.connect(analyser);
      freq = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      wave = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    }
    if (analyser && freq && wave && ctx) {
      analyser.getFloatTimeDomainData(wave);
      let sq = 0, pk = 0;
      for (let i = 0; i < wave.length; i++) {
        sq += wave[i] * wave[i];
        pk = Math.max(pk, Math.abs(wave[i]));
      }
      const rms = Math.sqrt(sq / wave.length);
      lv.frames++;
      lv.sumSq += rms * rms;
      lv.peak = Math.max(lv.peak, pk);
      const db = 20 * Math.log10(rms + 1e-9);
      rmsBar.style.width = Math.max(0, Math.min(100, ((db + 60) / 60) * 100)) + '%';
      analyser.getByteFrequencyData(freq);
      // desplazar y pintar una columna (eje de frecuencia logarítmico 30 Hz - 16 kHz)
      g2.drawImage(cv, -2, 0);
      const H = cv.height, sr = ctx.sampleRate, N = analyser.frequencyBinCount;
      for (let y = 0; y < H; y++) {
        const f = 30 * Math.pow(16000 / 30, 1 - y / H);
        const v = freq[Math.min(N - 1, Math.round((f / (sr / 2)) * N))] / 255;
        g2.fillStyle = heat(v);
        g2.fillRect(cv.width - 2, y, 2, 1);
      }
    }
  }

  game.start();
  (window as any).__ready = true;

  // análisis offline (para las pruebas: ?analisis=0&seg=20)
  const an = params.get('analisis');
  (window as any).__analizar = (idx: number, secs: number, song?: number, from = 0, mute: string[] = []) => analyze(idx, secs, song, from, mute);
  if (an !== null) {
    panel.style.display = 'none';
    box.style.display = 'none';
    await analyze(Number(an), Number(params.get('seg') ?? 20), params.has('cancion') ? Number(params.get('cancion')) : undefined, Number(params.get('desde') ?? 0), (params.get('mute') ?? '').split(',').filter(Boolean));
  }
}

/**
 * Revisa TODAS las muestras que piden las emisoras (varias canciones de cada una):
 * que no haya NaN, que no saturen y que no estén mudas.
 */
(window as any).__sanity = (songs = 6) => {
  const off = new OfflineAudioContext(2, 44100, 44100);
  const rs = new RadioSynth(off);
  const chain = buildChain(off, off.destination, true, false);
  const specs = new Map<string, RR.Spec>();
  const add = (l: RR.Spec[]) => l.forEach((sp) => specs.set(sp.key, sp));
  for (const Cls of [PerreoStation, ElectroStation, RumbaStation]) {
    const st: any = new Cls(rs, chain.music, chain.reverb, 99);
    st.enqueue = add;
    st.warm();
    for (let i = 0; i < songs; i++) add(st.songJobs(st.makeSong(i)));
  }
  add([RR.spec('talk', 'renderTalk', 44100, 2.5, 130, 1, 1, 1.2), RR.spec('ad', 'renderTalk', 44100, 2.5, 150, 1.06, 1.35, 1.5)]);
  const bad: string[] = [];
  let worstPeak = 0, quietest = 0, n = 0;
  for (const sp of specs.values()) {
    const out = RR.runSpec(sp);
    const chans = Array.isArray(out) ? out : [out];
    let pk = 0, sq = 0, len = 0, nan = false;
    for (const c of chans) {
      for (let i = 0; i < c.length; i++) {
        const v = c[i];
        if (!Number.isFinite(v)) nan = true;
        pk = Math.max(pk, Math.abs(v));
        sq += v * v;
      }
      len += c.length;
    }
    const rms = 10 * Math.log10(sq / len + 1e-12);
    n++;
    worstPeak = Math.max(worstPeak, pk);
    quietest = Math.min(quietest, rms);
    if (nan || pk > 1 || rms < -45) bad.push(`${sp.key}: pico ${pk.toFixed(2)} rms ${rms.toFixed(1)}${nan ? ' NaN' : ''}`);
  }
  return { muestras: n, peorPico: +worstPeak.toFixed(2), rmsMasBajo: +quietest.toFixed(1), malas: bad };
};

/** Pinta el espectrograma de varias voces (gritos, quejío, locutor) para revisarlas a ojo. */
(window as any).__voces = () => {
  const sr = 22050;
  const list: [string, RR.Spec][] = [
    ['¡eh! (coro)', chantSpec(sr, 'eh')],
    ['¡dale!', chantSpec(sr, 'dale')],
    ['¡prrra!', chantSpec(sr, 'prra')],
    ['¡olé! (coro)', chantSpec(sr, 'ole')],
    ['¡arsa!', chantSpec(sr, 'arsa')],
    ['¡eso es!', chantSpec(sr, 'esoes')],
    ['ah (corte)', chantSpec(sr, 'ah')],
    ['quejío', quejioSpec(sr, 'q', [[64, 0.6], [65, 0.4], [64, 0.4], [62, 1.2], [60, 1.2]])],
    ['locutor', RR.spec('t', 'renderTalk', sr, 2.4, 130, 1, 1, 1.2)],
    ['cuña', RR.spec('t2', 'renderTalk', sr, 2.4, 150, 1.06, 1.35, 1.5)],
  ];
  const cv = document.createElement('canvas');
  cv.width = 1240;
  cv.height = 680;
  cv.style.cssText = 'position:fixed;left:20px;top:20px;z-index:80;border:4px solid #1b1030;border-radius:12px;background:#1b1030';
  document.body.appendChild(cv);
  const g = cv.getContext('2d')!;
  g.fillStyle = '#1b1030';
  g.fillRect(0, 0, cv.width, cv.height);
  const N = 512, hop = 128, H = 120, W = 240;
  list.forEach(([name, sp], idx) => {
    const out = RR.runSpec(sp);
    const d = Array.isArray(out) ? out[0] : out;
    const x0 = (idx % 5) * (W + 8) + 4, y0 = Math.floor(idx / 5) * (H + 200) + 24;
    const cols = Math.min(W, Math.floor((d.length - N) / hop));
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let c = 0; c < cols; c++) {
      for (let i = 0; i < N; i++) { re[i] = d[c * hop + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))); im[i] = 0; }
      fft(re, im);
      for (let y = 0; y < H; y++) {
        const f = (1 - y / H) * 5000;
        const k = Math.round((f / sr) * N);
        const v = (20 * Math.log10(Math.hypot(re[k], im[k]) + 1e-9) + 10) / 55;
        g.fillStyle = heat(v);
        g.fillRect(x0 + c, y0 + y, 1, 1);
      }
    }
    // forma de onda
    g.strokeStyle = '#2ec4b6';
    g.beginPath();
    for (let x = 0; x < W; x++) {
      const i = Math.floor((x / W) * d.length);
      const y = y0 + H + 40 - d[i] * 35;
      if (x === 0) g.moveTo(x0 + x, y); else g.lineTo(x0 + x, y);
    }
    g.stroke();
    g.fillStyle = '#ffd23f';
    g.font = '800 13px system-ui';
    g.fillText(`${name} · ${(d.length / sr).toFixed(2)} s`, x0, y0 - 6);
  });
  return list.length;
};

/** Cuánto tarda cada generador de muestras (ms), para vigilar tirones. */
(window as any).__bench = () => {
  const sr = 48000;
  const time = (f: () => unknown) => { const a = performance.now(); f(); return +(performance.now() - a).toFixed(1); };
  return {
    kick: time(() => RR.kick(sr, { f0: 150, f1: 47, pd: 0.035, ad: 0.26, len: 0.55, click: 0.3, drive: 1.7 })),
    hatOpen: time(() => RR.hat(sr, true)),
    crash: time(() => RR.crash(sr)),
    pluckOpen: time(() => RR.pluck(sr, 110, { t60: 2.2, bright: 0.62, len: 1.1, pos: 0.17, body: 0.6 })),
    pluck6: time(() => { for (let i = 0; i < 6; i++) RR.pluck(sr, 110 * (1 + i * 0.2), { t60: 2.2, bright: 0.62, len: 1.1, pos: 0.17, body: 0.6 }); }),
    ole5: time(() => RR.renderChoir(sr, [['o', 0.16], ['l', 0.06], ['e', 0.36]], [[0, 185], [0.58, 225]], 5, {})),
    eh4: time(() => RR.renderChoir(sr, [['e', 0.34]], [[0, 190], [0.34, 175]], 4, {})),
    quejio: time(() => RR.renderChoir(sr, [['h', 0.05], ['a', 4.2], ['i', 0.35]], [[0, 200], [4.6, 180]], 1, {})),
    talk: time(() => RR.renderTalk(sr, 2.6, 130, 1, 1, 1)),
    impulse: time(() => RR.impulse(sr, 1.7)),
  };
};

const NOTAS = ['Do', 'Do#', 'Re', 'Mi♭', 'Mi', 'Fa', 'Fa#', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];
const SECCION: Record<string, string> = {
  intro: 'intro', verse: 'estrofa', pre: 'preestribillo', chorus: 'estribillo', bridge: 'puente', build: 'subidón',
  drop: 'drop', break: 'parón', groove: 'groove', solo: 'solo de guitarra', outro: 'final', jingle: 'sintonía',
};
const CHANNELS = [
  ['kick', 'snare', 'clap', 'hat', 'perc', 'bass', 'chords', 'pad', 'lead', 'vox', 'fx'],
  ['kick', 'clap', 'hat', 'shaker', 'perc', 'bass', 'pad', 'arp', 'vox', 'fx'],
  ['guitar', 'requinto', 'bass', 'cajon', 'palmaL', 'palmaR', 'vox', 'fx'],
];
/** Nivel total (RMS/pico dBFS) por emisora con la cadena completa. */
(window as any).__loud = async (secs = 30) => {
  const res: any[] = [];
  for (let idx = 0; idx < 3; idx++) {
    for (const [song, from] of [[3, 12], [5, 20], [8, 30]]) {
      const b = (await renderStationOffline(idx, secs, 22050, 777 + idx, song, from)).buf;
      const L = b.getChannelData(0), R = b.getChannelData(1);
      let sq = 0, pk = 0;
      for (let i = 0; i < L.length; i++) { sq += ((L[i] + R[i]) / 2) ** 2; pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); }
      res.push([idx, song, from, +(10 * Math.log10(sq / L.length)).toFixed(1), +(20 * Math.log10(pk)).toFixed(1)]);
    }
  }
  return res;
};
/** Nivel (RMS dBFS) de cada pista sola, para equilibrar la mezcla. */
(window as any).__stems = async (idx: number, secs: number, song?: number, from = 0, comp = false) => {
  const names = CHANNELS[idx];
  const out: Record<string, number> = {};
  const rms = (b: AudioBuffer) => {
    const L = b.getChannelData(0), R = b.getChannelData(1);
    let sq = 0;
    for (let i = 0; i < L.length; i++) sq += ((L[i] + R[i]) / 2) ** 2;
    return +(10 * Math.log10(sq / L.length + 1e-12)).toFixed(1);
  };
  out.TODO = rms((await renderStationOffline(idx, secs, 22050, 777 + idx, song, from, [], comp)).buf);
  for (const n of names) out[n] = +(rms((await renderStationOffline(idx, secs, 22050, 777 + idx, song, from, names.filter((x) => x !== n), comp)).buf) - out.TODO).toFixed(1);
  return out;
};

function heat(v: number) {
  const x = Math.max(0, Math.min(1, v));
  const r = Math.round(255 * Math.min(1, x * 2));
  const g = Math.round(255 * Math.max(0, Math.min(1, x * 2 - 0.5)));
  const b = Math.round(120 * (1 - x) + 60 * Math.max(0, x - 0.8) * 5);
  return `rgb(${r},${g},${b})`;
}

/** FFT compleja in situ (radix 2). */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

async function analyze(idx: number, secs: number, song?: number, from = 0, mute: string[] = []) {
  const sr = 22050;
  const t0 = performance.now();
  const { buf, stats, song: s } = await renderStationOffline(idx, secs, sr, 777 + idx, song, from, mute);
  const ms = performance.now() - t0;
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const n = L.length;
  const mono = new Float32Array(n);
  let peak = 0, sq = 0;
  for (let i = 0; i < n; i++) {
    mono[i] = (L[i] + R[i]) / 2;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    sq += mono[i] * mono[i];
  }
  const W = 1240, SPH = 300, CH = 180, LH = 110;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = SPH + CH + LH + 40;
  cv.style.cssText = 'position:fixed;left:20px;top:20px;z-index:80;border:4px solid #1b1030;border-radius:12px;background:#1b1030';
  document.body.appendChild(cv);
  const g = cv.getContext('2d')!;
  g.fillStyle = '#1b1030';
  g.fillRect(0, 0, cv.width, cv.height);
  const N = 4096, hop = Math.max(256, Math.floor(n / W));
  const re = new Float64Array(N), im = new Float64Array(N);
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const chromaTot = new Float64Array(12);
  const cols: Float64Array[] = [];
  let maxC = 1e-9;
  const levels: number[] = [];
  for (let x = 0; x < W; x++) {
    const off = x * hop;
    if (off + N > n) break;
    let e = 0;
    for (let i = 0; i < N; i++) { re[i] = mono[off + i] * win[i]; im[i] = 0; e += mono[off + i] ** 2; }
    levels.push(10 * Math.log10(e / N + 1e-12));
    fft(re, im);
    const mag = new Float64Array(N / 2);
    for (let k = 0; k < N / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
    // espectrograma (log frecuencia)
    for (let y = 0; y < SPH; y++) {
      const f = 30 * Math.pow(11000 / 30, 1 - y / SPH);
      const k = Math.round((f / (sr / 2)) * (N / 2));
      const v = (20 * Math.log10(mag[Math.min(N / 2 - 1, k)] + 1e-9) + 20) / 70;
      g.fillStyle = heat(v);
      g.fillRect(x, y, 1, 1);
    }
    // cromagrama (80 Hz - 2 kHz)
    const c = new Float64Array(12);
    for (let k = Math.ceil((80 / sr) * N); k < (2000 / sr) * N; k++) {
      const f = (k * sr) / N;
      const pc = ((Math.round(12 * Math.log2(f / 440)) % 12) + 12 + 9) % 12;
      c[pc] += mag[k] * mag[k];
    }
    for (let p = 0; p < 12; p++) { chromaTot[p] += c[p]; maxC = Math.max(maxC, c[p]); }
    cols.push(c);
  }
  cols.forEach((c, x) => {
    const m = Math.max(...c) + 1e-12;
    for (let p = 0; p < 12; p++) {
      g.fillStyle = heat(Math.pow(c[p] / m, 0.8));
      g.fillRect(x, SPH + 20 + (11 - p) * (CH / 12), 1, CH / 12);
    }
  });
  // nivel
  const base = SPH + CH + 30;
  g.strokeStyle = '#ffd23f';
  g.beginPath();
  levels.forEach((l, x) => {
    const y = base + LH - ((l + 60) / 60) * LH;
    if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
  });
  g.stroke();
  g.fillStyle = '#fff';
  g.font = '700 12px system-ui';
  const names = 'C C# D D# E F F# G G# A A# B'.split(' ');
  names.forEach((nm, p) => g.fillText(nm, W - 26, SPH + 20 + (11 - p) * (CH / 12) + 11));
  // marcas de compás
  const barDur = (60 / s.bpm) * 4;
  g.fillStyle = 'rgba(255,255,255,.35)';
  for (let b = 0; b * barDur < secs; b++) g.fillRect(((b * barDur * sr) / hop) | 0, SPH, 1, 20);
  const rmsDb = 10 * Math.log10(sq / n + 1e-12);
  const order = [...chromaTot].map((v, p) => [v, p] as [number, number]).sort((a, b) => b[0] - a[0]).slice(0, 7).map(([, p]) => names[p]);
  const summary = {
    station: idx, song: s.title, key: names[s.key], bpm: s.bpm, secs, from, renderMs: Math.round(ms),
    rmsDb: +rmsDb.toFixed(1), peakDb: +(20 * Math.log10(peak + 1e-9)).toFixed(1),
    topPitchClasses: order, nodesCreated: stats.created, sections: s.sections.map((x: any) => x.kind + x.bars).join(' '),
  };
  g.fillText(`${summary.song} · ${summary.key} menor · ${s.bpm} BPM · RMS ${summary.rmsDb} dBFS · pico ${summary.peakDb} dBFS · notas: ${order.join(' ')}`, 8, SPH + 14);
  (window as any).__analysis = summary;
  return summary;
}

main();
