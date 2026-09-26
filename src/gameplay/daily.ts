// Reto del día: cada día de juego, un reto nuevo con premio. Se ve en el móvil.
import type { Game, System } from '../core/game';
import { fmt } from './economy';

/** Datos propios de un reto (barrios ya visitados, récord de velocidad...). Se guardan con la partida. */
type State = Record<string, any>;

interface Challenge {
  id: string;
  text: string;
  goal: number;
  reward: number;
  /** Cómo se escribe el progreso (por defecto, el número tal cual). */
  unit?: (n: number) => string;
  /** Suma progreso según eventos. Devuelve la función para dejar de escuchar. */
  hook: (game: Game, add: (n?: number) => void, st: State) => (() => void) | void;
  /** Comprobación en cada frame (retos de velocidad...). */
  tick?: (game: Game, add: (n?: number) => void, st: State) => void;
  /** Una línea extra en el móvil (tu récord de hoy...). */
  extra?: (st: State) => string;
}

const DISTRICT_NAMES: Record<string, string> = { puerto: 'El Puerto', centro: 'El Centro', colina: 'La Colina', poligono: 'El Polígono', viejo: 'El Barrio Viejo' };

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
  // ───── Fase 9 ─────
  {
    id: 'barrios', text: 'Entrega paquetes en 3 barrios distintos', goal: 3, reward: 400,
    hook: (g, add, st) => g.events.on('job:done' as any, (e: any) => {
      const d = e.job?.offer?.dest?.district;
      const list: string[] = (st.barrios ??= []);
      if (d && !list.includes(d)) {
        list.push(d);
        add();
      }
    }),
    extra: (st) => (st.barrios?.length ? `Ya has entregado en: ${st.barrios.map((d: string) => DISTRICT_NAMES[d] ?? d).join(', ')}.` : ''),
  },
  {
    id: 'sucesos', text: 'Resuelve 2 sucesos de la isla (bodas, gallinas, atracos, carreras…)', goal: 2, reward: 450,
    hook: (g, add) => g.events.on('event:done' as any, (e: any) => e.ok && add()),
    extra: () => 'Los sucesos salen solos cada pocos minutos: estate atento al móvil y a los gritos.',
  },
  {
    id: 'propinas', text: 'Consigue 100 € en propinas', goal: 100, reward: 350, unit: (n) => fmt(n),
    hook: (g, add) => g.events.on('job:done' as any, (e: any) => e.tip > 0 && add(e.tip)),
    extra: () => 'Las propinas salen con las entregas perfectas: rápido y sin un golpe.',
  },
  {
    id: 'fotos', text: 'Haz 3 fotos con el modo foto (tecla K)', goal: 3, reward: 200,
    hook: (g, add) => g.events.on('photo:taken' as any, () => add()),
  },
  {
    id: 'aire', text: 'Vuela 6 segundos en total con vehículos', goal: 6, reward: 350, unit: (n) => `${n.toFixed(1).replace('.', ',')} s`,
    hook: (g, add) => g.events.on('vehicle:landed' as any, (e: any) => e.air > 0.3 && e.vehicle === g.mod.vehicles?.current && add(e.air)),
    extra: () => 'Las rampas del puerto y del polígono ayudan. Los baches, también.',
  },
  {
    id: 'velocidad', text: 'Ponte a 130 km/h con cualquier vehículo', goal: 1, reward: 250,
    hook: () => {},
    tick: (g, add, st) => {
      const v = g.mod.vehicles?.current;
      if (!v || g.mod.player?.state !== 'vehicle') return;
      const kmh = Math.abs(v.speed) * 3.6;
      if (kmh > (st.best ?? 0)) st.best = Math.round(kmh);
      if (kmh >= 130) add();
    },
    extra: (st) => `Tu récord de hoy: ${st.best ?? 0} km/h. (La furgoneta no llega: roba algo con más motor.)`,
  },
];

export class Daily implements System {
  name = 'daily';
  current: Challenge | null = null;
  progress = 0;
  done = false;
  /** Retos cumplidos en toda la partida. */
  total = 0;
  private st: State = {};
  private offs: (() => void)[] = [];
  private add: ((n?: number) => void) | null = null;

  constructor(private game: Game) {
    game.mod.daily = this;
    game.events.on('newday', (e) => this.pick(e.day));
    game.mod.phone?.extraApps.push({ id: 'reto', icon: '🎯', name: 'Reto del día', color: '#06d6a0', open: (body: HTMLDivElement) => this.render(body) });
    game.mod.save?.register({ key: 'daily', save: () => ({ id: this.current?.id, progress: this.progress, done: this.done, st: this.st, total: this.total }), load: (d: any) => {
      // (las partidas viejas no traen st ni total: se empieza de cero con eso)
      this.total = d?.total ?? 0;
      const c = CHALLENGES.find((x) => x.id === d?.id);
      if (c) this.set(c, d.progress ?? 0, !!d.done, d.st ?? {});
    } });
    this.pick(game.clock.day, true);
  }

  private pick(day: number, quiet = false) {
    const c = CHALLENGES[(day * 7 + 3) % CHALLENGES.length];
    this.set(c, 0, false, {});
    if (!quiet) this.game.mod.messages?.receive('reto', 'Reto del día', '🎯', `Nuevo reto: ${c.text}. Premio: ${fmt(c.reward)}.`);
  }

  private set(c: Challenge, progress: number, done: boolean, st: State) {
    for (const o of this.offs) o();
    this.offs = [];
    this.current = c;
    this.progress = progress;
    this.done = done;
    this.st = st && typeof st === 'object' ? st : {};
    const add = (n = 1) => {
      if (this.done || this.current !== c) return;
      const before = this.progress;
      this.progress = Math.min(c.goal, this.progress + n);
      if (this.progress >= c.goal) {
        this.done = true;
        this.total++;
        this.game.mod.economy?.addCash(c.reward, 'reto');
        this.game.mod.economy?.addFame(20, 'reto');
        this.game.events.emit('toast', { text: `🎯 ¡Reto del día cumplido! +${fmt(c.reward)}`, color: '#06d6a0', time: 3 });
        this.game.mod.audio?.play('success');
        this.game.events.emit('daily:done' as any, { id: c.id, total: this.total } as any);
      } else if (c.goal <= 15 && !c.unit && Math.floor(this.progress) > Math.floor(before)) {
        // en los de contar cosas, un aviso pequeño con cada paso
        this.game.events.emit('toast', { text: `🎯 Reto del día: ${Math.floor(this.progress)}/${c.goal}`, color: '#06d6a0', time: 1.4 });
      }
    };
    this.add = add;
    const off = c.hook(this.game, add, this.st);
    if (typeof off === 'function') this.offs.push(off);
  }

  update() {
    const c = this.current;
    if (c?.tick && !this.done && this.add) c.tick(this.game, this.add, this.st);
  }

  private fmtProgress(c: Challenge, n: number): string {
    return c.unit ? c.unit(n) : String(Math.floor(n));
  }

  private render(body: HTMLDivElement) {
    const c = this.current;
    if (!c) {
      body.innerHTML = '<div class="cr-tarjeta">Hoy no hay reto. Descansa, campeón.</div>';
      return;
    }
    // minutos reales que quedan hasta el día siguiente (un día de juego = 20 minutos)
    const left = Math.max(1, Math.ceil(((24 - this.game.clock.hour) / 24) * 20));
    const pct = Math.min(100, (this.progress / c.goal) * 100);
    const extra = c.extra?.(this.st) ?? '';
    body.innerHTML = `<div class="cr-tarjeta" style="${this.done ? 'background:#e7fff4' : ''}"><h3>RETO DE HOY</h3>
      <div class="reto-tx" style="font:900 19px/1.25 system-ui"></div>
      <div class="cr-barrafama"><i style="width:${pct}%;${this.done ? 'background:linear-gradient(90deg,#06d6a0,#2ec4b6)' : ''}"></i></div>
      <p style="font:800 13px system-ui;margin:8px 0 0">${this.fmtProgress(c, this.progress)} / ${this.fmtProgress(c, c.goal)} · Premio ${fmt(c.reward)} y ⭐ 20</p>
      ${this.done ? '<p style="font:900 15px system-ui;margin:8px 0 0;color:#0a8f68">✅ ¡Cumplido! Mañana, otro.</p>' : ''}</div>
      ${extra ? '<div class="cr-tarjeta reto-extra" style="font:600 13px/1.45 system-ui"></div>' : ''}
      <div class="cr-tarjeta" style="font:600 13px/1.5 system-ui">⏳ Cambia de reto en <b>${left} min</b> (cada día de juego, 20 minutos).<br>🏅 Retos cumplidos en total: <b>${this.total}</b></div>`;
    (body.querySelector('.reto-tx') as HTMLElement).textContent = c.text;
    const ex = body.querySelector('.reto-extra') as HTMLElement | null;
    if (ex) ex.textContent = extra;
  }
}
