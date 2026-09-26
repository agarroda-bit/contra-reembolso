// Dinero: EFECTIVO (encima, se puede perder) y BANCO (seguro). También la FAMA.
import type { Game, System } from '../core/game';

export const FAME_LEVELS = [0, 100, 300, 650, 1200, 2000, 3200, 5000, 7500, 11000];

export function fameLevel(fame: number): number {
  let lvl = 1;
  for (let i = 0; i < FAME_LEVELS.length; i++) if (fame >= FAME_LEVELS[i]) lvl = i + 1;
  return lvl;
}

export class Economy implements System {
  name = 'economy';
  cash = 0;
  bank = 0;
  fame = 0;
  /** Estadísticas para logros e informe. */
  stats = { earned: 0, spent: 0, lost: 0, deliveries: 0, perfect: 0, tips: 0 };

  constructor(private game: Game) {
    game.mod.economy = this;
  }

  get fameLevel() {
    return fameLevel(this.fame);
  }

  addCash(amount: number, reason = 'cobro') {
    if (!amount) return;
    this.cash = Math.max(0, Math.round((this.cash + amount) * 100) / 100);
    if (amount > 0) this.stats.earned += amount;
    this.emit(amount, reason);
  }

  /** Paga primero con efectivo y, si no llega, con el banco. Devuelve false si no hay bastante. */
  spend(amount: number, reason = 'compra'): boolean {
    if (this.cash + this.bank < amount) {
      this.game.mod.audio?.play('error');
      this.game.events.emit('toast', { text: 'No te llega el dinero', color: '#ff4f81', time: 1.8 });
      return false;
    }
    const fromCash = Math.min(this.cash, amount);
    this.cash -= fromCash;
    this.bank -= amount - fromCash;
    this.stats.spent += amount;
    this.emit(-amount, reason);
    return true;
  }

  /** Ingresa todo el efectivo en el banco (cajero). */
  deposit(): number {
    const a = this.cash;
    if (a <= 0) return 0;
    this.cash = 0;
    this.bank += a;
    this.emit(0, 'banco');
    this.game.events.emit('toast', { text: `Ingresados ${fmt(a)} en el banco`, color: '#2ec4b6' });
    this.game.mod.audio?.play('cash');
    return a;
  }

  withdraw(amount: number): boolean {
    const a = Math.min(amount, this.bank);
    if (a <= 0) return false;
    this.bank -= a;
    this.cash += a;
    this.emit(0, 'banco');
    return true;
  }

  /** Pierde el efectivo (muerte, robo, arresto). Devuelve cuánto se ha perdido. */
  loseCash(reason: string): number {
    const lost = this.cash;
    if (lost <= 0) return 0;
    this.cash = 0;
    this.stats.lost += lost;
    this.emit(-lost, reason);
    return lost;
  }

  addFame(points: number, reason?: string) {
    const before = this.fameLevel;
    this.fame = Math.max(0, this.fame + points);
    const after = this.fameLevel;
    if (after > before) {
      this.game.events.emit('toast', { text: `¡FAMA nivel ${after}!`, color: '#ffd23f', time: 3 });
      this.game.events.emit('fame:level' as any, { level: after, reason } as any);
      this.game.mod.audio?.play('success');
    }
  }

  private emit(delta: number, reason: string) {
    this.game.events.emit('money', { cash: this.cash, bank: this.bank, delta, reason });
  }

  update() {
    const h = this.game.hud;
    h.cash = this.cash;
    h.bank = this.bank;
    h.fame = this.fame;
    h.fameLevel = this.fameLevel;
  }
}

export function fmt(euros: number): string {
  return Math.round(euros).toLocaleString('es-ES') + ' €';
}
