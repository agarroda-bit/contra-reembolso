// Interacción con E: entregar, recoger, cajeros, tiendas, puertas... Cada módulo registra un proveedor.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { Poi } from '../core/contracts';

export interface InteractOption {
  text: string;
  run: () => void;
}

export type Provider = () => InteractOption | null;

export class Interaction implements System {
  name = 'interaction';
  private providers: { fn: Provider; priority: number }[] = [];
  current: InteractOption | null = null;
  /** Pista fija de alguna escena (regateo...) que manda sobre todo. */
  override: string | null = null;

  constructor(private game: Game) {
    game.mod.interaction = this;
  }

  add(fn: Provider, priority = 0) {
    this.providers.push({ fn, priority });
    this.providers.sort((a, b) => b.priority - a.priority);
  }

  /** Atajo: una puerta/POI con una acción. */
  addPoi(kind: Poi['kind'] | ((p: Poi) => boolean), text: string | ((p: Poi) => string), run: (p: Poi) => void, radius = 3, priority = 0) {
    this.add(() => {
      const g = this.game;
      const pl = g.mod.player;
      if (!pl || pl.state !== 'foot' || !g.world) return null;
      for (const poi of g.world.pois) {
        const ok = typeof kind === 'function' ? kind(poi) : poi.kind === kind;
        if (!ok) continue;
        if (pl.position.distanceTo(poi.door) < radius && Math.abs(pl.position.y - poi.door.y) < 3) {
          return { text: typeof text === 'function' ? text(poi) : text, run: () => run(poi) };
        }
      }
      return null;
    }, priority);
  }

  update() {
    const g = this.game;
    const pl = g.mod.player;
    this.current = null;
    if (pl && pl.state === 'foot' && g.input.enabled) {
      for (const p of this.providers) {
        const o = p.fn();
        if (o) {
          this.current = o;
          break;
        }
      }
    }
    if (this.override) {
      // pista de una escena (regateo, abuela…): manda sobre todo y la E la gestiona la escena
      g.hud.hint = this.override;
      return;
    }
    const vHint: string | null = g.mod.vehicles?.hintText ?? null;
    const eHint = this.current ? `E — ${this.current.text}` : null;
    g.hud.hint = eHint && vHint ? `${eHint}   ·   ${vHint}` : eHint ?? vHint;
    if (this.current && g.input.enabled && g.input.pressed('interact')) {
      const o = this.current;
      o.run();
      g.mod.audio?.play('click', { volume: 0.6 });
    }
  }
}

void THREE;
