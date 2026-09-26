// Guardado automático en localStorage: dinero, banco, vehículos, armas, ropa, mejoras, empresa, fama,
// historia, coleccionables, decoración... Cada módulo aporta su parte con register().
import type { Game, System } from '../core/game';

const KEY = 'contra-reembolso:partida';
const VERSION = 1;

export interface SaveSection {
  key: string;
  save(): unknown;
  load(data: any): void;
}

export class SaveSystem implements System {
  name = 'save';
  private sections: SaveSection[] = [];
  private timer = 30;
  /** Datos leídos al arrancar (los módulos que se crean tarde los recogen con pending()). */
  private loaded: Record<string, any> | null = null;
  enabled = true;

  constructor(private game: Game) {
    game.mod.save = this;
    window.addEventListener('beforeunload', () => this.save());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.save();
    });
  }

  static exists(): boolean {
    try {
      return !!localStorage.getItem(KEY);
    } catch {
      return false;
    }
  }

  static peek(): { day: number; cash: number; bank: number; fame: number; savedAt: string; name?: string } | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return { day: d.meta?.day ?? 1, cash: d.economy?.cash ?? 0, bank: d.economy?.bank ?? 0, fame: d.economy?.fame ?? 0, savedAt: d.meta?.savedAt ?? '', name: d.profile?.look?.name };
    } catch {
      return null;
    }
  }

  static wipe() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nada */
    }
  }

  register(s: SaveSection) {
    this.sections = this.sections.filter((x) => x.key !== s.key);
    this.sections.push(s);
    // si ya había partida cargada, aplicar ahora
    if (this.loaded && this.loaded[s.key] !== undefined) {
      try {
        s.load(this.loaded[s.key]);
      } catch (e) {
        console.warn('No se pudo cargar', s.key, e);
      }
    }
  }

  /** Lee la partida guardada (no la aplica: se aplica al registrar cada sección). */
  readFromStorage(): boolean {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || d.v !== VERSION) return false;
      this.loaded = d;
      const g = this.game;
      if (d.meta) {
        g.clock.hour = d.meta.hour ?? g.clock.hour;
        g.clock.day = d.meta.day ?? 1;
      }
      for (const s of this.sections) if (d[s.key] !== undefined) s.load(d[s.key]);
      return true;
    } catch (e) {
      console.warn('Partida guardada dañada', e);
      return false;
    }
  }

  /**
   * En el menú principal y en la creación del personaje todavía no hay partida en juego: guardar ahí
   * machacaría la partida buena con una vacía (0 €, sin nada). Tampoco al cambiar de pestaña o cerrar.
   */
  private get inMenu(): boolean {
    const mode = this.game.mod.menus?.mode;
    return mode === 'main' || mode === 'create';
  }

  save(silent = true) {
    if (!this.enabled || this.inMenu) return;
    const g = this.game;
    const data: Record<string, any> = {
      v: VERSION,
      meta: { day: g.clock.day, hour: g.clock.hour, savedAt: new Date().toISOString() },
    };
    for (const s of this.sections) {
      try {
        data[s.key] = s.save();
      } catch (e) {
        console.warn('No se pudo guardar', s.key, e);
      }
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      if (!silent) g.events.emit('toast', { text: '💾 Partida guardada', color: '#2ec4b6', time: 1.5 });
      g.events.emit('saved' as any, {} as any);
    } catch {
      /* sin espacio o sin localStorage */
    }
  }

  update(dt: number) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 45;
      const p = this.game.mod.player;
      if (p && p.state !== 'dead') this.save();
    }
  }
}
