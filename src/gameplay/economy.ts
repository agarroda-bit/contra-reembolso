// Dinero: EFECTIVO (encima, se puede perder) y BANCO (seguro). También la FAMA.
import type { Game, System } from '../core/game';

// Puntos de fama para cada nivel (nivel 1 = 0). Hechos a medida del ritmo de juego:
// una entrega da 3-15 puntos (perfecta 15) y cada misión del tablón 100-400. Jugando bien
// (~35 entregas por hora, más de la mitad perfectas, algún capricho) el nivel 2 (primera misión)
// llega hacia el minuto 13 y el 6 (jefe final) hacia la hora y media; con calma, en unas 2 h 20.
// Del 7 al 10 son metas largas (lujos, ático, empresa): cada nivel sube un 12 % lo que pagan los encargos.
export const FAME_LEVELS = [0, 80, 250, 500, 800, 1200, 2000, 3000, 4500, 6500];

/** Puntos que hacen falta para llegar a un nivel (más allá del último, la barra se queda llena). */
export function fameThreshold(level: number): number {
  const i = Math.max(0, Math.min(level, FAME_LEVELS.length) - 1);
  return FAME_LEVELS[i];
}

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

  /** Dinero que entra directamente en el banco (regalos, sueldos de la empresa). */
  addBank(amount: number, reason = 'ingreso') {
    if (amount <= 0) return;
    this.bank = Math.round((this.bank + amount) * 100) / 100;
    this.stats.earned += amount;
    this.game.events.emit('money', { cash: this.cash, bank: this.bank, delta: 0, reason });
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

  private hudLinked = false;

  update() {
    // la barra de fama del HUD usa los mismos umbrales que los niveles (antes llevaba otra cuenta)
    if (!this.hudLinked && this.game.mod.hud) {
      this.hudLinked = true;
      this.game.mod.hud.fameThreshold = fameThreshold;
    }
    const h = this.game.hud;
    h.cash = this.cash;
    h.bank = this.bank;
    h.fame = this.fame;
    h.fameLevel = this.fameLevel;
  }
}

/** 1234 → "1.234 €" (con punto de miles siempre, también en números de 4 cifras). */
export function fmt(euros: number): string {
  const n = Math.round(euros);
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 ? '−' : '') + s + ' €';
}
