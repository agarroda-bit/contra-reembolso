// Modo depuración (?debug=1): fps, tiempos por sistema, teletransporte, trucos. También expone
// window.__cr para las pruebas.
import * as THREE from 'three';
import type { Game } from './game';

/** Nombre con el que game.ts apunta cada paso de física. */
const PHYSICS = 'física (Rapier)';

/** Tiempos acumulados de un tramo (se reinicia cuando se quiere medir desde cero). */
class PerfWindow {
  frames = 0;
  /** Tiempo real entre frames (ms): con vsync, 16,7 si va a 60 fps. */
  interval = 0;
  maxInterval = 0;
  /** Frames que tardaron más de 25 ms (tirones que se notan). */
  hitches = 0;
  /** CPU de todo el frame (lógica + envío del render), sin contar la espera del vsync. */
  cpu = 0;
  maxCpu = 0;
  renderCpu = 0;
  gpu = 0;
  gpuSamples = 0;
  calls = 0;
  tris = 0;
  /** Pasos de física (a 60 fps, uno por frame; a 30 fps, dos: la lógica fija cuesta el doble por frame). */
  steps = 0;
  readonly sys = new Float64Array(256);

  reset() {
    this.frames = this.interval = this.maxInterval = this.hitches = this.steps = 0;
    this.cpu = this.maxCpu = this.renderCpu = this.gpu = this.gpuSamples = this.calls = this.tris = 0;
    this.sys.fill(0);
  }
}

export interface PerfSnapshot {
  frames: number;
  fps: number;
  /** ms por frame de media (tiempo real, incluye la espera del vsync). */
  intervalo: number;
  intervaloMax: number;
  tirones: number;
  /** ms de CPU por frame (lógica + render). */
  cpu: number;
  cpuMax: number;
  /** ms de CPU del render (preparar y enviar lo que se pinta). */
  renderCpu: number;
  /** ms de GPU por frame (consultas de tiempo; -1 si el navegador no deja medir). */
  gpu: number;
  draws: number;
  tris: number;
  /** Pasos de física por frame. */
  pasos: number;
  /** ms de CPU por frame de cada sistema, de más a menos. */
  sistemas: [string, number][];
}

/**
 * Mide cuánto tarda cada sistema (CPU), la física, el mundo, el render (CPU y GPU), las draw calls
 * y los triángulos. Solo funciona si está enganchado a game.profiler (con ?debug=1 lo está).
 * En la consola: __cr.perf.reset(); … __cr.perf.snapshot().
 */
export class FrameProfiler {
  private readonly names: string[] = [];
  private readonly index = new Map<string, number>();
  /** Para el panel (se reinicia cada segundo). */
  readonly win = new PerfWindow();
  /** Para medir desde fuera (reset()/snapshot()). */
  readonly total = new PerfWindow();
  private readonly both = [this.win, this.total];
  /** Lo de este frame (para saber quién tiene la culpa de un tirón). */
  private readonly cur = new Float64Array(256);
  private curRender = 0;
  /** Últimos frames lentos (> 25 ms de CPU) con lo que más tardó. */
  readonly slowFrames: { t: number; ms: number; render: number; top: string }[] = [];
  private frameT0 = 0;
  private renderT0 = 0;
  private lastNow = -1;
  private readonly gl: WebGL2RenderingContext | null;
  private readonly ext: any;
  private readonly pending: WebGLQuery[] = [];
  private readonly free: WebGLQuery[] = [];
  private query: WebGLQuery | null = null;

  constructor(private readonly game: Game) {
    const gl = game.renderer.getContext();
    const gl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? gl : null;
    this.gl = gl2;
    this.ext = gl2 ? gl2.getExtension('EXT_disjoint_timer_query_webgl2') : null;
  }

  /** ¿Se puede medir la GPU en este navegador? */
  get gpuTimer() {
    return !!this.ext;
  }

  private slot(name: string): number {
    let i = this.index.get(name);
    if (i === undefined) {
      i = this.names.length;
      if (i >= this.win.sys.length) return this.win.sys.length - 1; // (no pasa: hay pocos sistemas)
      this.names.push(name);
      this.index.set(name, i);
    }
    return i;
  }

  add(name: string, ms: number) {
    if (name === PHYSICS) {
      this.win.steps++;
      this.total.steps++;
    }
    const i = this.slot(name);
    this.win.sys[i] += ms;
    this.total.sys[i] += ms;
    this.cur[i] += ms;
  }

  beginFrame(now: number) {
    this.frameT0 = performance.now();
    this.cur.fill(0);
    this.curRender = 0;
    if (this.lastNow >= 0) {
      const d = now - this.lastNow;
      for (const w of this.both) {
        w.frames++;
        w.interval += d;
        if (d > w.maxInterval) w.maxInterval = d;
        if (d > 25) w.hitches++;
      }
    }
    this.lastNow = now;
  }

  beginRender() {
    this.renderT0 = performance.now();
    const gl = this.gl, ext = this.ext;
    if (gl && ext && !this.query) {
      const q = this.free.pop() ?? gl.createQuery();
      if (q) {
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        this.query = q;
      }
    }
  }

  endRender() {
    const ms = performance.now() - this.renderT0;
    this.curRender = ms;
    const gl = this.gl, ext = this.ext;
    if (gl && ext && this.query) {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      this.pending.push(this.query);
      this.query = null;
    }
    const info = this.game.renderer.info.render;
    for (const w of this.both) {
      w.renderCpu += ms;
      w.calls += info.calls;
      w.tris += info.triangles;
    }
    this.pollGpu();
  }

  endFrame() {
    const ms = performance.now() - this.frameT0;
    for (const w of this.both) {
      w.cpu += ms;
      if (ms > w.maxCpu) w.maxCpu = ms;
    }
    if (ms > 25) {
      // tirón: se apunta quién tardó más (solo pasa de vez en cuando, aquí sí se puede reservar memoria)
      const idx: number[] = [];
      for (let i = 0; i < this.names.length; i++) if (this.cur[i] > 1) idx.push(i);
      idx.sort((a, b) => this.cur[b] - this.cur[a]);
      const top = idx.slice(0, 4).map((i) => `${this.names[i]} ${this.cur[i].toFixed(1)}`).join(', ');
      this.slowFrames.push({ t: Math.round(this.game.time.real * 10) / 10, ms: Math.round(ms), render: Math.round(this.curRender), top });
      if (this.slowFrames.length > 30) this.slowFrames.shift();
    }
  }

  /** Recoge las consultas de GPU que ya tienen resultado (llegan uno o dos frames tarde). */
  private pollGpu() {
    const gl = this.gl, ext = this.ext;
    if (!gl || !ext) return;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    while (this.pending.length) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      if (!disjoint) {
        const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        for (const w of this.both) {
          w.gpu += ms;
          w.gpuSamples++;
        }
      }
      this.free.push(q);
    }
    // (si se acumulan muchas sin respuesta, se sueltan: no deben crecer sin fin)
    while (this.pending.length > 8) this.free.push(this.pending.shift()!);
  }

  reset() {
    this.total.reset();
  }

  private snap(w: PerfWindow): PerfSnapshot {
    const n = Math.max(1, w.frames);
    const r = (x: number) => Math.round(x * 100) / 100;
    const sistemas: [string, number][] = [];
    for (let i = 0; i < this.names.length; i++) if (w.sys[i] > 0) sistemas.push([this.names[i], r(w.sys[i] / n)]);
    sistemas.sort((a, b) => b[1] - a[1]);
    return {
      frames: w.frames,
      fps: w.interval > 0 ? r((1000 * w.frames) / w.interval) : 0,
      intervalo: r(w.interval / n),
      intervaloMax: r(w.maxInterval),
      tirones: w.hitches,
      cpu: r(w.cpu / n),
      cpuMax: r(w.maxCpu),
      renderCpu: r(w.renderCpu / n),
      gpu: w.gpuSamples ? r(w.gpu / w.gpuSamples) : -1,
      draws: Math.round(w.calls / n),
      tris: Math.round(w.tris / n),
      pasos: r(w.steps / n),
      sistemas,
    };
  }

  /** Medias por frame desde el último reset(). */
  snapshot(): PerfSnapshot {
    return this.snap(this.total);
  }

  /** Medias del último segundo (lo que enseña el panel). */
  windowSnapshot(reset = true): PerfSnapshot {
    const s = this.snap(this.win);
    if (reset) this.win.reset();
    return s;
  }

  /** Cuántas cosas hay vivas (para buscar fugas: no deben crecer sin parar). */
  counts() {
    const g = this.game;
    let objects = 0;
    g.scene.traverse(() => objects++);
    const w = g.physics.world;
    const mem = g.renderer.info.memory;
    return {
      objetosEscena: objects,
      cuerpos: w.bodies.len(),
      colisores: w.colliders.len(),
      npcs: g.mod.npcs?.list?.length ?? 0,
      peatones: g.mod.pedestrians?.peds?.length ?? 0,
      vehiculos: g.mod.vehicles?.list?.length ?? 0,
      geometrias: mem.geometries,
      texturas: mem.textures,
      programas: g.renderer.info.programs?.length ?? 0,
      heapMB: Math.round(((performance as any).memory?.usedJSHeapSize ?? 0) / 1048576),
    };
  }
}

export function installDebug(game: Game) {
  (window as any).__cr = game;
  (window as any).THREE = THREE;
  if (!game.debug) return;
  const perf = new FrameProfiler(game);
  game.profiler = perf;
  (game as any).perf = perf;
  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.style.cssText =
    'position:fixed;left:8px;bottom:250px;z-index:50;background:rgba(0,0,0,.72);color:#fff;font:12px/1.4 ui-monospace,monospace;padding:8px 10px;border-radius:8px;max-width:340px;pointer-events:auto';
  const info = document.createElement('div');
  info.style.whiteSpace = 'pre';
  panel.appendChild(info);
  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px';
  panel.appendChild(btns);
  const addBtn = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'font:11px system-ui;padding:2px 6px;border-radius:4px;border:0;background:#ffd23f;cursor:pointer';
    b.onclick = (e) => {
      e.stopPropagation();
      fn();
      (document.activeElement as HTMLElement)?.blur?.();
    };
    btns.appendChild(b);
  };
  (game as any).debugAddButton = addBtn;
  game.ui.appendChild(panel);

  const tp = (x: number, z: number) => {
    const y = (game.world?.heightAt(x, z) ?? 0) + 1.5;
    game.mod.player?.teleport?.(new THREE.Vector3(x, y, z));
  };
  // desglose de tiempos: se abre y se cierra con el botón ⏱
  let detail = false;
  // Botones de zonas: los añade el mundo cuando existe
  setTimeout(() => {
    for (const d of game.world?.districts ?? []) addBtn('→ ' + d.name, () => tp(d.center.x, d.center.z));
    addBtn('☀ día', () => (game.clock.hour = 12));
    addBtn('🌅 tarde', () => (game.clock.hour = 19.2));
    addBtn('🌙 noche', () => (game.clock.hour = 23));
    addBtn('⏸ hora', () => (game.clock.frozen = !game.clock.frozen));
    // trucos que pide el encargo: dinero, invencible y búsqueda
    const toast = (text: string) => game.events.emit('toast', { text, color: '#ffd23f', time: 1.5 });
    addBtn('💶 +10.000 €', () => game.mod.economy?.addCash?.(10000, 'trucos'));
    addBtn('🛡 invencible', () => {
      const p = game.mod.player;
      if (!p) return;
      p.invincible = !p.invincible;
      if (p.invincible) p.health = p.maxHealth ?? 100;
      toast(p.invincible ? 'Invencible: SÍ' : 'Invencible: NO');
    });
    addBtn('🚨 +1', () => game.mod.police?.setWanted?.(Math.min(5, (game.mod.police.wanted ?? 0) + 1)));
    addBtn('🚨 −1', () => game.mod.police?.setWanted?.(Math.max(0, (game.mod.police.wanted ?? 0) - 1)));
    addBtn('⏱ tiempos', () => (detail = !detail));
  }, 0);

  const pos = new THREE.Vector3();
  let lastText = 0;
  let line = '';
  game.addSystem({
    name: 'debug',
    postUpdate: () => {
      if (game.time.frame % 10) return;
      const p = game.mod.player?.position ?? pos;
      const d = game.world?.districtAt(p.x, p.z) ?? '-';
      // tiempos: media del último segundo
      if (game.time.real - lastText >= 1) {
        lastText = game.time.real;
        const s = perf.windowSnapshot();
        const gpu = s.gpu >= 0 ? `${s.gpu.toFixed(1)}` : '?';
        line =
          `${s.fps.toFixed(0)} fps · CPU ${s.cpu.toFixed(1)} ms (render ${s.renderCpu.toFixed(1)}) · GPU ${gpu} ms\n` +
          `${s.draws} draws · ${(s.tris / 1000).toFixed(0)}k tris · tirones ${s.tirones}`;
        if (detail) {
          const top = s.sistemas.slice(0, 10).map(([n, ms]) => `  ${n.padEnd(18).slice(0, 18)} ${ms.toFixed(2)}`);
          line += '\n' + top.join('\n');
        }
      }
      info.textContent = `${line}\npos ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)} · ${d} · ${game.clock.hour.toFixed(2)}h`;
    },
  });
}
