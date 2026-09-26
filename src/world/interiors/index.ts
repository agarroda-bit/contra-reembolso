// Interiores: sitios a los que se entra por una puerta (club VIP, ático, oficina...).
// Cada interior se construye lejos de la isla (x, z ≈ 4000) y el jugador se teletransporta dentro
// con un fundido. Dentro, E junto a la salida devuelve a la puerta de fuera.
import * as THREE from 'three';
import type { Game, System } from '../../core/game';
import type { Poi } from '../../core/contracts';
import { G } from '../../core/physics';

export interface InteriorContext {
  game: Game;
  /** Grupo donde añadir todo lo visual (ya colocado en el origen del interior). */
  root: THREE.Group;
  /** Origen del interior en el mundo (esquina del suelo, y = altura del suelo). */
  origin: THREE.Vector3;
  /** Colisor de caja estático en coordenadas LOCALES del interior (centro y medias medidas). */
  addBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotY?: number): void;
  /** Pasa de local a mundo. */
  toWorld(local: THREE.Vector3): THREE.Vector3;
}

export interface InteriorInstance {
  /** Dónde aparece el jugador (local) y hacia dónde mira. */
  spawn: THREE.Vector3;
  heading: number;
  /** Punto de salida (local): con E cerca de aquí se sale. */
  exit: THREE.Vector3;
  update?(dt: number, inside: boolean): void;
  onEnter?(): void;
  onExit?(): void;
  /** Pistas de interacción extra dentro (sofá, cama, barra...). Devuelve null si no hay nada cerca. */
  interact?(playerLocal: THREE.Vector3): { text: string; run: () => void } | null;
}

export interface InteriorDef {
  id: string;
  name: string;
  /** POI de la puerta de fuera (por id o por tipo). */
  poi: (p: Poi) => boolean;
  /** Se puede entrar (p. ej. el ático hay que comprarlo). Si devuelve un texto, es el motivo para no dejar. */
  canEnter?: () => true | string;
  /** Texto de la pista de la puerta. */
  doorText?: string;
  build(ctx: InteriorContext): InteriorInstance;
}

interface Built {
  def: InteriorDef;
  inst: InteriorInstance;
  root: THREE.Group;
  origin: THREE.Vector3;
  /** Shaders de dentro ya compilados ('pending' = en marcha). */
  warm: 'no' | 'pending' | 'yes';
  warming?: Promise<void>;
  /** Luces apagadas de relleno (ver swapLights). */
  pads: THREE.PointLight[];
}

const SPACING = 400;

export class Interiors implements System {
  name = 'interiors';
  private defs: InteriorDef[] = [];
  private built = new Map<string, Built>();
  current: Built | null = null;
  private returnPoi: Poi | null = null;
  private fade: HTMLDivElement;
  private busy = false;

  constructor(private game: Game) {
    game.mod.interiors = this;
    this.fade = document.createElement('div');
    this.fade.style.cssText = 'position:fixed;inset:0;background:#1b1030;opacity:0;pointer-events:none;transition:opacity .35s;z-index:45';
    game.ui.appendChild(this.fade);
    // pistas: puertas de fuera y cosas de dentro
    game.mod.interaction?.add(() => this.hint(), 8);
    // al cambiar la calidad (sombras, farolas) cambian los shaders: hay que volver a precompilarlos
    game.events.on('settings', () => {
      for (const b of this.built.values()) if (b.warm === 'yes') b.warm = 'no';
    });
  }

  register(def: InteriorDef) {
    this.defs.push(def);
  }

  get inside() {
    return !!this.current;
  }

  private ensureBuilt(def: InteriorDef): Built {
    let b = this.built.get(def.id);
    if (b) return b;
    const i = this.defs.indexOf(def);
    const origin = new THREE.Vector3(4000 + i * SPACING, 30, 4000);
    const root = new THREE.Group();
    root.position.copy(origin);
    this.game.scene.add(root);
    const ctx: InteriorContext = {
      game: this.game,
      root,
      origin,
      addBox: (cx, cy, cz, hx, hy, hz, rotY = 0) => {
        this.game.physics.addStaticBox(origin.x + cx, origin.y + cy, origin.z + cz, hx, hy, hz, rotY, G.STATIC);
      },
      toWorld: (l) => l.clone().add(origin),
    };
    const inst = def.build(ctx);
    b = { def, inst, root, origin, warm: 'no', pads: [] };
    this.built.set(def.id, b);
    return b;
  }

  private hint(): { text: string; run: () => void } | null {
    const g = this.game;
    const p = g.mod.player;
    if (!p || p.state !== 'foot' || this.busy) return null;
    if (this.current) {
      const local = p.position.clone().sub(this.current.origin);
      if (local.distanceTo(this.current.inst.exit) < 2.2) return { text: `Salir de ${this.current.def.name}`, run: () => this.exit() };
      return this.current.inst.interact?.(local) ?? null;
    }
    for (const def of this.defs) {
      const poi = g.world.pois.find(def.poi);
      if (!poi) continue;
      if (p.position.distanceTo(poi.door) < 3 && Math.abs(p.position.y - poi.door.y) < 3) {
        return { text: def.doorText ?? `Entrar en ${def.name}`, run: () => this.enter(def.id) };
      }
    }
    return null;
  }

  enter(id: string) {
    const def = this.defs.find((d) => d.id === id);
    if (!def || this.busy) return;
    const ok = def.canEnter ? def.canEnter() : true;
    if (ok !== true) {
      this.game.events.emit('toast', { text: ok, color: '#ff4f81', time: 2.5 });
      return;
    }
    const g = this.game;
    this.returnPoi = g.world.pois.find(def.poi) ?? null;
    this.transition(() => {
      const b = this.ensureBuilt(def);
      b.root.visible = false;
      // si entras antes de la precarga, sus shaders se piden ahora (en paralelo)
      if (b.warm === 'no') this.precompile(b);
      this.current = b;
      const p = g.mod.player;
      p.teleport(b.origin.clone().add(b.inst.spawn), b.inst.heading);
      b.inst.onEnter?.();
      // (onEnter enseña su grupo: sigue oculto hasta cambiar las luces de fuera por las de dentro)
      b.root.visible = false;
      g.events.emit('interior:enter' as any, { id } as any);
      g.mod.audio?.play('door');
      // si sus shaders aún se están compilando, se espera (con la pantalla fundida) sin dibujar el
      // interior, para que ningún frame se quede atascado esperando a uno
      if (b.warm === 'pending' && b.warming) return b.warming.then(() => this.show(b));
      this.show(b);
    });
  }

  /** Enseña el interior (y cambia las luces de fuera por las de dentro en el mismo frame). */
  private show(b: Built) {
    if (this.current !== b || b.root.visible) return;
    this.swapLights(b, true);
    b.root.visible = true;
  }

  // ───── Luces: mismo número dentro que fuera ─────
  //
  // three compila un shader distinto para cada número de luces puntuales en la escena. Si al entrar
  // se sumaran las del interior a las de fuera, habría que recompilar los shaders de todo lo que se
  // ve dentro (interior, personaje, gente, partículas...) en el primer frame: pantalla negra de 1 a
  // 10 s. Por eso, dentro, las luces puntuales de fuera (farolas cercanas, destello de explosiones;
  // están a kilómetros) se apagan y el interior usa exactamente las mismas: rellena con luces
  // apagadas si tiene menos, o apaga las más flojas si tiene más (calidad baja: fuera no hay
  // ninguna). Así los shaders de dentro son los de fuera y los propios del interior se precompilan
  // en segundo plano (precompile).
  private hiddenOutside: THREE.Light[] = [];
  private hiddenInside: THREE.Light[] = [];

  private swapLights(b: Built, inside: boolean) {
    if (!inside) {
      for (const l of this.hiddenOutside) l.visible = true;
      for (const l of this.hiddenInside) l.visible = true;
      this.hiddenOutside.length = 0;
      this.hiddenInside.length = 0;
      for (const l of b.pads) l.visible = false;
      return;
    }
    const g = this.game;
    // luces puntuales de fuera que se ven ahora (el interior aún está oculto)
    const outside = this.hiddenOutside;
    outside.length = 0;
    g.scene.traverseVisible((o) => {
      if ((o as THREE.PointLight).isPointLight) outside.push(o as THREE.Light);
    });
    for (const l of outside) l.visible = false;
    // las del interior (sin contar el relleno)
    const own: THREE.PointLight[] = [];
    const vis = b.root.visible;
    b.root.visible = true;
    b.root.traverseVisible((o) => {
      if ((o as THREE.PointLight).isPointLight && !b.pads.includes(o as THREE.PointLight)) own.push(o as THREE.PointLight);
    });
    b.root.visible = vis;
    const want = outside.length;
    if (own.length > want) {
      own.sort((a, c) => a.intensity - c.intensity);
      for (let i = 0; i < own.length - want; i++) {
        own[i].visible = false;
        this.hiddenInside.push(own[i]);
      }
    }
    const pad = Math.max(0, want - own.length);
    while (b.pads.length < pad) {
      const l = new THREE.PointLight('#000000', 0, 0.01, 2);
      l.name = 'relleno-luces';
      l.position.set(0, -20, 0);
      b.root.add(l);
      b.pads.push(l);
    }
    b.pads.forEach((l, i) => (l.visible = i < pad));
  }

  /**
   * Compila en segundo plano (en paralelo) los shaders del interior con las luces de fuera, que son
   * las mismas que habrá dentro (ver swapLights). Medido: fuera no da tirones, porque ningún frame
   * usa esos shaders hasta que entras.
   */
  private precompile(b: Built): Promise<void> {
    const g = this.game;
    const r = g.renderer;
    const done = () => {
      if (b.warm === 'pending') b.warm = 'yes';
    };
    if (typeof r.compileAsync !== 'function') {
      b.warm = 'yes';
      return Promise.resolve();
    }
    b.warm = 'pending';
    const vis = b.root.visible;
    let job: Promise<unknown>;
    try {
      // oculto: sus luces no cuentan y las de fuera sí, como quedarán dentro
      b.root.visible = false;
      job = r.compileAsync(b.root, g.camera, g.scene);
    } catch (e) {
      console.warn('[interiores] No se pudieron precompilar los shaders de', b.def.id, e);
      job = Promise.resolve();
    } finally {
      b.root.visible = vis;
    }
    const timeout = new Promise((res) => setTimeout(res, 8000));
    return (b.warming = Promise.race([job, timeout]).then(done, done));
  }

  exit() {
    const cur = this.current;
    if (!cur || this.busy) return;
    const g = this.game;
    this.transition(() => {
      cur.inst.onExit?.();
      cur.root.visible = false;
      this.swapLights(cur, false);
      this.current = null;
      const poi = this.returnPoi;
      const p = g.mod.player;
      if (poi) {
        const out = poi.door.clone().add(new THREE.Vector3(Math.sin(poi.facing) * 1.2, 0, Math.cos(poi.facing) * 1.2));
        p.teleport(out, poi.facing);
      } else p.teleport(g.world.playerSpawn.pos, g.world.playerSpawn.heading);
      g.events.emit('interior:exit' as any, { id: cur.def.id } as any);
      g.mod.audio?.play('door');
    });
  }

  /** Fundido a oscuro, `mid` a mitad (si devuelve una promesa, se espera a ella) y vuelta. */
  private transition(mid: () => void | Promise<void>) {
    this.busy = true;
    this.fade.style.opacity = '1';
    setTimeout(() => {
      let wait: void | Promise<void> = undefined;
      const done = () =>
        setTimeout(() => {
          this.fade.style.opacity = '0';
          this.busy = false;
        }, 120);
      try {
        wait = mid();
      } finally {
        if (wait) wait.then(done, done);
        else done();
      }
    }, 380);
  }

  private prebuildTimer = 10;
  /** Interiores cuyo fallo en update ya se avisó (para no llenar la consola cada frame). */
  private warned = new Set<string>();
  update(dt: number) {
    for (const b of this.built.values()) {
      // un fallo en los efectos de un interior no puede parar el juego entero (se congelaría la
      // pantalla y las teclas se quedarían pulsadas): se avisa una vez y se sigue
      try {
        b.inst.update?.(dt, b === this.current);
      } catch (e) {
        if (!this.warned.has(b.def.id)) {
          this.warned.add(b.def.id);
          console.warn(`[interiores] Fallo al actualizar ${b.def.id} (se sigue jugando):`, e);
        }
      }
    }
    // precarga: a los 10 s de juego se construye un interior cada 2 s (oculto) y, en el turno
    // siguiente, se compilan sus shaders en segundo plano, para que la primera vez que entres no
    // haya pantalla negra
    if (this.current) return;
    this.prebuildTimer -= dt;
    if (this.prebuildTimer <= 0) {
      this.prebuildTimer = 2;
      let busy = false;
      for (const b of this.built.values()) if (b.warm === 'pending') busy = true;
      let cold: Built | undefined;
      for (const b of this.built.values()) if (!cold && b.warm === 'no') cold = b;
      const next = this.defs.find((d) => !this.built.has(d.id));
      if (busy) this.prebuildTimer = 0.5;
      else if (cold) this.precompile(cold);
      else if (next) {
        try {
          const b = this.ensureBuilt(next);
          b.root.visible = false;
        } catch (e) {
          console.warn('No se pudo precargar el interior', next.id, e);
        }
      }
    }
  }
}
