// El corazón del juego: render, física, entrada, sistemas y bucle principal.
import * as THREE from 'three';
import { Physics } from './physics';
import { Input } from './input';
import { EventBus } from './events';
import { loadSettings, saveSettings, QUALITY, type Settings, type QualityPreset } from './settings';
import { defaultHudState, type GameEvents, type WorldData, type HudState } from './contracts';
import type { FrameProfiler } from './debug';

// fases del bucle (para llamar a los sistemas sin crear funciones por frame)
const FIXED = 0, UPDATE = 1, POST = 2, PAUSED = 3;

/**
 * Un sistema del juego. Todos los métodos son opcionales.
 * - fixedUpdate: 60 veces por segundo, justo antes de cada paso de física (movimiento, fuerzas).
 * - update: una vez por frame (lógica, IA, animaciones).
 * - postUpdate: después de update (cámara, interfaz).
 * - pausedUpdate: una vez por frame mientras el juego está en pausa (menús).
 */
export interface System {
  name: string;
  fixedUpdate?(dt: number): void;
  update?(dt: number): void;
  postUpdate?(dt: number): void;
  pausedUpdate?(realDt: number): void;
}

export const DAY_LENGTH_SECONDS = 20 * 60; // un día de juego = 20 minutos reales

export class Game {
  static current: Game;

  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly physics = new Physics();
  readonly input: Input;
  readonly events = new EventBus<GameEvents>();
  readonly debug: boolean;
  readonly params: URLSearchParams;
  settings: Settings;
  /** Capa HTML por encima del canvas para la interfaz. */
  readonly ui: HTMLElement;

  /** Tiempo: `scale` < 1 = cámara lenta. */
  readonly time = { elapsed: 0, real: 0, dt: 0, scale: 1, frame: 0 };
  /** Reloj del mundo: hora 0..24 y número de día. */
  readonly clock = { hour: 8.5, day: 1, frozen: false };

  paused = false;
  world!: WorldData;
  /** Lo que pinta la interfaz (ver HudState en contracts.ts). */
  readonly hud: HudState = defaultHudState();
  /** Referencias que van rellenando los módulos (tipadas en cada módulo). */
  readonly systems: System[] = [];
  /** Registro abierto de subsistemas (player, cameraRig, vehicles, hud...). */
  readonly mod: Record<string, any> = {};

  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private accumulator = 0;
  private last = performance.now();
  private slowMoTimer = 0;
  private slowMoTarget = 1;
  /** Multiplicadores externos de la escala de tiempo (efectos): se multiplican entre sí. */
  readonly timeScaleMods = new Map<string, number>();
  shake = 0;
  running = false;
  /** Medidor de tiempos por sistema y del render (lo pone debug.ts con ?debug=1). null = no mide nada. */
  profiler: FrameProfiler | null = null;

  constructor(container: HTMLElement, ui: HTMLElement) {
    Game.current = this;
    this.params = new URLSearchParams(location.search);
    this.debug = this.params.get('debug') === '1';
    this.settings = loadSettings();
    // ?calidad=baja|media|alta fuerza la calidad (pruebas), sin guardarla
    const q0 = this.params.get('calidad');
    if (q0 === 'baja' || q0 === 'media' || q0 === 'alta') this.settings.quality = q0;
    const q = this.quality;
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.settings.quality !== 'baja',
      powerPreference: 'high-performance',
      stencil: false,
      preserveDrawingBuffer: this.params.has('capturas'),
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.tabIndex = 0;
    this.ui = ui;

    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.1, q.drawDistance + 80);
    this.scene.add(this.camera);
    this.scene.fog = new THREE.Fog('#bcd7f0', q.drawDistance * 0.35, q.drawDistance);
    this.input = new Input(this.renderer.domElement);

    window.addEventListener('resize', () => this.onResize());
    this.events.on('camera:shake', ({ amount }) => (this.shake = Math.min(1.5, this.shake + amount)));
  }

  get quality(): QualityPreset {
    return QUALITY[this.settings.quality];
  }

  applySettings(s: Partial<Settings>) {
    this.settings = { ...this.settings, ...s };
    saveSettings(this.settings);
    const q = this.quality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
    this.camera.fov = this.settings.fov;
    this.camera.far = q.drawDistance + 80;
    this.camera.updateProjectionMatrix();
    const fog = this.scene.fog as THREE.Fog;
    fog.near = q.drawDistance * 0.35;
    fog.far = q.drawDistance;
    this.onResize();
    this.events.emit('settings', this.settings);
  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  addSystem(sys: System): System {
    this.systems.push(sys);
    return sys;
  }

  removeSystem(sys: System) {
    const i = this.systems.indexOf(sys);
    if (i >= 0) this.systems.splice(i, 1);
  }

  /** Cámara lenta durante `seconds` (tiempo real) a escala `scale`. */
  slowMo(seconds: number, scale = 0.3) {
    this.slowMoTimer = Math.max(this.slowMoTimer, seconds);
    this.slowMoTarget = Math.min(this.slowMoTarget, scale);
  }

  /** 0 = día, 1 = noche cerrada (lo calcula el ciclo día/noche). */
  night = 0;

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  /** Llama a una fase de todos los sistemas (midiendo cada uno si hay medidor). */
  private runSystems(phase: number, dt: number) {
    const list = this.systems;
    const prof = this.profiler;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const fn = phase === FIXED ? s.fixedUpdate : phase === UPDATE ? s.update : phase === POST ? s.postUpdate : s.pausedUpdate;
      if (!fn) continue;
      if (prof) {
        const t0 = performance.now();
        fn.call(s, dt);
        prof.add(s.name, performance.now() - t0);
      } else fn.call(s, dt);
    }
  }

  private frame(now: number) {
    const prof = this.profiler;
    prof?.beginFrame(now);
    const realDt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time.real += realDt;
    this.time.frame++;

    // fps (media de medio segundo)
    this.fpsAcc += realDt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }

    this.input.pollGamepad(realDt);

    if (!this.paused) {
      // escala de tiempo: cámara lenta + modificadores (hierbas, etc.)
      if (this.slowMoTimer > 0) {
        this.slowMoTimer -= realDt;
        if (this.slowMoTimer <= 0) this.slowMoTarget = 1;
      }
      let scale = this.slowMoTimer > 0 ? this.slowMoTarget : 1;
      for (const m of this.timeScaleMods.values()) scale *= m;
      this.time.scale += (scale - this.time.scale) * Math.min(1, realDt * 8);
      const dt = realDt * this.time.scale;
      this.time.dt = dt;
      this.time.elapsed += dt;
      if (!this.clock.frozen) {
        this.clock.hour += (dt * 24) / DAY_LENGTH_SECONDS;
        if (this.clock.hour >= 24) {
          this.clock.hour -= 24;
          this.clock.day++;
          this.events.emit('newday', { day: this.clock.day });
        }
      }

      const fixed = this.physics.fixedDt;
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= fixed && steps < 5) {
        this.runSystems(FIXED, fixed);
        if (prof) {
          const t0 = performance.now();
          this.physics.step();
          prof.add('física (Rapier)', performance.now() - t0);
        } else this.physics.step();
        this.accumulator -= fixed;
        steps++;
      }
      if (steps >= 5) this.accumulator = 0;

      this.runSystems(UPDATE, dt);
      this.runSystems(POST, dt);
      if (prof) {
        const t0 = performance.now();
        this.world?.update(dt, this.time.elapsed);
        prof.add('mundo', performance.now() - t0);
      } else this.world?.update(dt, this.time.elapsed);
    } else {
      this.runSystems(PAUSED, realDt);
    }

    // temblor de cámara
    if (this.shake > 0.001) {
      const a = this.shake * 0.25;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
      this.camera.position.z += (Math.random() - 0.5) * a;
      this.shake = Math.max(0, this.shake - realDt * 2.5);
    }

    if (prof) {
      prof.beginRender();
      this.render();
      prof.endRender();
    } else this.render();
    this.input.endFrame();
    prof?.endFrame();
  }

  /** Se puede sustituir (efectos de pantalla completa, fase 6). */
  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
