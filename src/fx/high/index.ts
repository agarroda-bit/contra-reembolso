// El efecto de las hierbas del Barrio Viejo: pantalla psicodélica, cámara lenta, el repartidor
// andando raro, la cámara bamboleándose, la radio distorsionada y pensamientos muy profundos.
// Uso: const high = installHigh(game); high.start(60);
import * as THREE from 'three';
import type { Game, System } from '../../core/game';
import type { AudioEngine } from '../../audio/audio';
import { PsychePass } from './pass';
import { Thoughts } from './thoughts';
import { CosmicHum } from './sound';

export interface High {
  /** Empieza (o alarga) el efecto. Por defecto 60 s. */
  start(seconds?: number): void;
  /** Lo corta en seco. */
  stop(): void;
  /** Intensidad actual 0..1. */
  readonly level: number;
  readonly active: boolean;
}

const RISE = 3; // segundos en subir
const FALL = 8; // segundos finales bajando
const MAX_TOTAL = 300; // tope al ir alargando
const TIME_KEY = 'hierbas';

export class HighEffect implements High, System {
  readonly name = 'hierbas';
  level = 0;
  /** Segundos (reales) que quedan. */
  remaining = 0;
  private ramp = 0; // subida lineal 0..1
  private forced: number | null = null;
  private t = 0; // reloj del efecto (real) para las ondas
  private lastReal = 0;
  private readonly pass: PsychePass;
  readonly thoughts: Thoughts;
  readonly hum: CosmicHum;
  private hooked = false; // nuestro envoltorio está en la cadena de game.render
  private rendering = false; // el envoltorio aplica el efecto (si no, pasa de largo)
  private prevRender: () => void = () => {};
  private readonly wrapper = () => this.renderWrapped();
  private readonly drawPrev = () => this.prevRender.call(this.game);
  private readonly savedQuat = new THREE.Quaternion();
  private lastWobble = -1;
  private lastRadio = -1;

  constructor(private readonly game: Game) {
    this.pass = new PsychePass(game.renderer);
    this.pass.precompile();
    this.thoughts = new Thoughts(game.ui);
    this.hum = new CosmicHum(() => game.mod.audio as AudioEngine | undefined);
    this.thoughts.onSpawn = (text) => this.hum.blip(text);
    this.lastReal = game.time.real;
  }

  get active(): boolean {
    return this.remaining > 0 || this.level > 0 || this.forced !== null;
  }

  start(seconds = 60) {
    if (!(seconds > 0)) return;
    if (this.forced !== null) this.forced = null;
    if (this.remaining > 0) {
      // ya estaba colocado: si iba bajando, vuelve a subir desde donde está
      this.ramp = Math.min(this.ramp, this.remaining / FALL);
      this.remaining = Math.min(MAX_TOTAL, this.remaining + seconds);
      this.thoughts.extend();
      return;
    }
    this.remaining = Math.min(MAX_TOTAL, seconds);
    this.ramp = 0;
    this.t = 0;
    this.thoughts.begin();
  }

  stop() {
    this.forced = null;
    this.finish();
  }

  /** Para pruebas: fija el nivel (null = vuelve a lo normal). */
  forceLevel(v: number | null) {
    if (v === null) {
      this.forced = null;
      if (this.remaining <= 0) this.finish();
      return;
    }
    this.forced = THREE.MathUtils.clamp(v, 0, 1);
    this.level = this.forced;
    this.apply(0);
  }

  /** El render a pantalla completa está enganchado (para pruebas). */
  get hookedRender() {
    return this.rendering;
  }

  private realDt(): number {
    const real = this.game.time.real;
    const d = Math.min(0.1, Math.max(0, real - this.lastReal));
    this.lastReal = real;
    return d;
  }

  update() {
    const dt = this.realDt();
    if (!this.active) return;
    this.t += dt;
    if (this.forced !== null) {
      this.level = this.forced;
    } else {
      this.remaining = Math.max(0, this.remaining - dt);
      this.ramp = Math.min(1, this.ramp + dt / RISE);
      const lin = Math.min(this.ramp, this.remaining / FALL);
      this.level = lin * lin * (3 - 2 * lin);
      if (this.remaining <= 0) {
        this.finish();
        return;
      }
    }
    this.apply(dt);
  }

  pausedUpdate() {
    const dt = this.realDt();
    if (!this.active) return;
    this.t += dt; // las ondas siguen moviéndose detrás del menú
    this.thoughts.setHidden(true);
  }

  private apply(dt: number) {
    const g = this.game;
    const L = this.level;
    g.timeScaleMods.set(TIME_KEY, 1 - 0.4 * L);
    const p = g.mod.player;
    if (p) {
      p.wobble = L;
      this.lastWobble = L;
    }
    if (Math.abs(L - this.lastRadio) > 0.01) {
      g.mod.radio?.setDistortion?.(L);
      this.lastRadio = L;
    }
    if (L > 0.001 || this.forced !== null) this.hook();
    else this.unhook();
    this.thoughts.setHidden(false);
    if (this.forced === null) this.thoughts.update(dt, L, this.remaining, FALL);
    this.hum.update(dt, L);
  }

  /** Se acabó: todo vuelve a la normalidad y no se gasta nada más. */
  private finish() {
    const g = this.game;
    this.level = 0;
    this.remaining = 0;
    this.ramp = 0;
    this.t = 0;
    g.timeScaleMods.delete(TIME_KEY);
    const p = g.mod.player;
    if (p && this.lastWobble >= 0 && p.wobble === this.lastWobble) p.wobble = 0;
    this.lastWobble = -1;
    if (this.lastRadio > 0) g.mod.radio?.setDistortion?.(0);
    this.lastRadio = -1;
    this.unhook();
    this.pass.release();
    this.thoughts.clear();
    this.hum.stop();
  }

  private hook() {
    if (this.rendering) return;
    this.rendering = true;
    if (!this.hooked) {
      this.prevRender = this.game.render;
      this.game.render = this.wrapper;
      this.hooked = true;
    }
    this.game.renderer.info.autoReset = false;
  }

  private unhook() {
    if (!this.rendering) return;
    this.rendering = false;
    this.game.renderer.info.autoReset = true;
    // solo nos quitamos si nadie se ha enganchado encima; si no, nos quedamos pasando de largo
    if (this.hooked && this.game.render === this.wrapper) {
      this.game.render = this.prevRender;
      this.hooked = false;
    }
  }

  private renderWrapped() {
    const g = this.game;
    if (!this.rendering) {
      this.prevRender.call(g);
      return;
    }
    const L = this.level;
    const t = this.t;
    g.renderer.info.reset();
    // balanceo de cámara (roll) solo para este render: se deshace después, así no se acumula
    const cam = g.camera;
    this.savedQuat.copy(cam.quaternion);
    cam.rotateZ(L * (0.045 * Math.sin(t * 0.55) + 0.018 * Math.sin(t * 1.37)));
    this.pass.render(this.drawPrev, L, t);
    cam.quaternion.copy(this.savedQuat);
    cam.updateMatrixWorld();
  }
}

/** Crea el efecto, lo registra como sistema y lo deja en game.mod.high. */
export function installHigh(game: Game): High {
  const h = new HighEffect(game);
  game.addSystem(h);
  game.mod.high = h;
  return h;
}
