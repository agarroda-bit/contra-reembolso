// Reto del día: cada día de juego, un reto nuevo con premio. Se ve en el móvil.
import type { Game, System } from '../core/game';
import { fmt } from './economy';

interface Challenge {
  id: string;
  text: string;
  goal: number;
  reward: number;
  /** Suma progreso según eventos. */
  hook: (game: Game, add: (n?: number) => void) => void;
}

const CHALLENGES: Challenge[] = [
  { id: 'perfectas', text: 'Haz 3 entregas perfectas', goal: 3, reward: 400, hook: (g, add) => g.events.on('job:done' as any, (e: any) => e.perfect && add()) },
  { id: 'entregas', text: 'Entrega 5 paquetes', goal: 5, reward: 350, hook: (g, add) => g.events.on('job:done' as any, () => add()) },
  { id: 'fragil', text: 'Entrega 2 paquetes FRÁGIL', goal: 2, reward: 450, hook: (g, add) => g.events.on('job:done' as any, (e: any) => e.job?.offer?.type === 'fragil' && add()) },
  { id: 'urgente', text: 'Entrega 2 paquetes URGENTES a tiempo', goal: 2, reward: 450, hook: (g, add) => g.events.on('job:done' as any, (e: any) => e.job?.offer?.type === 'urgente' && e.job.timeLeft > 0 && add()) },
  { id: 'devueltos', text: 'Derriba a 6 de Los Devueltos', goal: 6, reward: 500, hook: (g, add) => g.events.on('gang:killed' as any, () => add()) },
  { id: 'saltos', text: 'Pega 3 saltos de más de 1 segundo con un vehículo', goal: 3, reward: 300, hook: (g, add) => g.events.on('vehicle:landed' as any, (e: any) => e.air > 1 && e.vehicle === g.mod.vehicles?.current && add()) },
  { id: 'robos', text: 'Roba 3 coches (con estilo)', goal: 3, reward: 250, hook: (g, add) => g.events.on('vehicle:steal' as any, () => add()) },
  { id: 'ahorro', text: 'Ingresa 1.000 € en el banco de una vez', goal: 1, reward: 300, hook: (g, add) => g.events.on('toast', (e) => /^Ingresados ([\d.]+)/.test(e.text) && Number(e.text.match(/^Ingresados ([\d.]+)/)![1].replace(/\./g, '')) >= 1000 && add()) },
  { id: 'rompe', text: 'Rompe 15 cosas por la calle (vallas, cajas, puestos…)', goal: 15, reward: 200, hook: (g, add) => g.events.on('prop:broken' as any, (e: any) => e.byPlayer && add()) },
];

export class Daily implements System {
  name = 'daily';
  current: Challenge | null = null;
  progress = 0;
  done = false;
  private offs: (() => void)[] = [];

  constructor(private game: Game) {
    game.mod.daily = this;
    game.events.on('newday', (e) => this.pick(e.day));
    game.mod.phone?.extraApps.push({ id: 'reto', icon: '🎯', name: 'Reto del día', color: '#06d6a0', open: (body: HTMLDivElement) => this.render(body) });
    game.mod.save?.register({ key: 'daily', save: () => ({ id: this.current?.id, progress: this.progress, done: this.done }), load: (d: any) => {
      const c = CHALLENGES.find((x) => x.id === d?.id);
      if (c) this.set(c, d.progress ?? 0, !!d.done);
    } });
    this.pick(game.clock.day, true);
  }

  private pick(day: number, quiet = false) {
    const c = CHALLENGES[(day * 7 + 3) % CHALLENGES.length];
    this.set(c, 0, false);
    if (!quiet) this.game.mod.messages?.receive('reto', 'Reto del día', '🎯', `Nuevo reto: ${c.text}. Premio: ${fmt(c.reward)}.`);
  }

  private set(c: Challenge, progress: number, done: boolean) {
    for (const o of this.offs) o();
    this.offs = [];
    this.current = c;
    this.progress = progress;
    this.done = done;
    const add = (n = 1) => {
      if (this.done || this.current !== c) return;
      this.progress = Math.min(c.goal, this.progress + n);
      if (this.progress >= c.goal) {
        this.done = true;
        this.game.mod.economy?.addCash(c.reward, 'reto');
        this.game.mod.economy?.addFame(20, 'reto');
        this.game.events.emit('toast', { text: `🎯 ¡Reto del día cumplido! +${fmt(c.reward)}`, color: '#06d6a0', time: 3 });
        this.game.mod.audio?.play('success');
      }
    };
    const off = c.hook(this.game, add) as unknown as (() => void) | void;
    if (typeof off === 'function') this.offs.push(off);
  }

  private render(body: HTMLDivElement) {
    const c = this.current;
    body.innerHTML = c
      ? `<div class="cr-tarjeta"><h3>RETO DE HOY</h3><div style="font:900 20px system-ui">${c.text}</div>
         <div class="cr-barrafama"><i style="width:${(this.progress / c.goal) * 100}%"></i></div>
         <p style="font:700 13px system-ui">${this.progress} / ${c.goal} · Premio ${fmt(c.reward)} ${this.done ? '· ✅ ¡Cumplido!' : ''}</p></div>
         <div class="cr-tarjeta" style="font:600 13px system-ui">Cada día de juego (20 minutos) hay un reto nuevo.</div>`
      : '<div class="cr-tarjeta">Hoy no hay reto. Descansa, campeón.</div>';
  }
}
