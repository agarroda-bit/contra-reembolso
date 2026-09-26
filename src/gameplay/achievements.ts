// Logros: retos graciosos que se desbloquean jugando. Se ven en la app «Logros» del móvil
// (conseguidos arriba, luego los que faltan; los secretos salen como «???» hasta que los consigues).
import type { Game, System } from '../core/game';
import { fmt } from './economy';

interface Ach {
  id: string;
  icon: string;
  name: string;
  desc: string;
  /** Secreto: en el móvil sale como «???» hasta conseguirlo. */
  secret?: boolean;
  /** Progreso para los que van por cuenta (actual, meta, texto opcional). */
  progress?: (s: Stats) => [number, number, string?];
}

/** Lo que miran las barras de progreso de los logros. */
interface Stats {
  deliveries: number;
  money: number;
  kills: number;
  collected: number;
  fameLevel: number;
}

const LIST: Ach[] = [
  { id: 'primera', icon: '📦', name: 'Primer reembolso', desc: 'Entrega tu primer paquete.' },
  { id: 'diez', icon: '🔟', name: 'Repartidor de verdad', desc: 'Entrega 10 paquetes.', progress: (a) => [a.deliveries, 10] },
  { id: 'cincuenta', icon: '🏅', name: 'Máquina del reparto', desc: 'Entrega 50 paquetes.', progress: (a) => [a.deliveries, 50] },
  { id: 'perfecta', icon: '✨', name: 'Guante de seda', desc: 'Haz una entrega perfecta.' },
  { id: 'fragil', icon: '🍰', name: 'Ni un rasguño', desc: 'Entrega un paquete FRÁGIL al 100 %.' },
  { id: 'rico', icon: '💰', name: 'Nuevo rico', desc: 'Ten 10.000 € entre efectivo y banco.', progress: (a) => [a.money, 10000, fmt(a.money)] },
  { id: 'millonario', icon: '🤑', name: 'Magnate del cartón', desc: 'Ten 100.000 €.', progress: (a) => [a.money, 100000, fmt(a.money)] },
  { id: 'robo', icon: '🚗', name: 'Préstamo sin permiso', desc: 'Roba tu primer coche.' },
  { id: 'vuelo', icon: '🛫', name: 'Furgoneta voladora', desc: 'Pasa 2 segundos en el aire con un vehículo.' },
  { id: 'boom', icon: '💥', name: 'Fuegos artificiales', desc: 'Haz explotar un vehículo tú mismo (a tiros, a golpes o con un paquete FRÁGIL).' },
  { id: 'cinco', icon: '🚨', name: 'Enemigo público', desc: 'Llega a 5 sirenas.' },
  { id: 'pintura', icon: '🎨', name: 'Cambio de look', desc: 'Pierde a la policía en el taller de pintura.' },
  { id: 'devueltos10', icon: '↩️', name: 'Devolución al remitente', desc: 'Derriba a 10 de Los Devueltos.', progress: (a) => [a.kills, 10] },
  { id: 'coleccion', icon: '🔍', name: 'Cotilla profesional', desc: 'Encuentra los 20 paquetes perdidos.', progress: (a) => [a.collected, 20] },
  { id: 'fama5', icon: '⭐', name: 'Famoso de barrio', desc: 'Llega a fama nivel 5.', progress: (a) => [a.fameLevel, 5] },
  { id: 'jefe', icon: '👑', name: 'Fin de la devolución', desc: 'Derrota a El Devolución.' },
  { id: 'agua', icon: '🌊', name: 'Los repartidores no nadan', desc: 'Cae al mar.', secret: true },
  { id: 'foto', icon: '📸', name: 'Postureo', desc: 'Guarda una foto en el modo foto.' },
  { id: 'perro', icon: '🐕', name: 'Amigo de Pancho', desc: 'Entrega a Mari y Pancho.' },
  { id: 'abuela', icon: '👵', name: 'Paciencia infinita', desc: 'Espera a que la abuela cuente todos los céntimos.', secret: true },
  // ───── Fase 9: sucesos de la isla y cosas raras ─────
  { id: 'carrera', icon: '🏁', name: 'Más rápido que el Nitro', desc: 'Gana una carrera callejera.' },
  { id: 'bolso', icon: '👜', name: 'Justiciero de bolsos', desc: 'Devuelve un bolso robado a su dueña.' },
  { id: 'boda', icon: '🎂', name: 'Sí, quiero (la tarta)', desc: 'Salva una boda llevando la tarta a tiempo.' },
  { id: 'gallina', icon: '🐔', name: 'Cazagallinas', desc: 'Atrapa a la gallina fugitiva del mercado.' },
  { id: 'taxi', icon: '🗼', name: 'Taxista de rebote', desc: 'Lleva a la turista perdida hasta el faro.' },
  { id: 'atraco', icon: '🛡️', name: 'Héroe de barrio', desc: 'Frustra un atraco de Los Devueltos a una tienda.' },
  { id: 'baile', icon: '💃', name: 'Dos pies derechos', desc: 'Clava los tres pasos de baile de Yoli Zumba.', secret: true },
  { id: 'claxon', icon: '📯', name: 'Concierto para claxon', desc: 'Pita 20 veces en menos de 15 segundos.', secret: true },
];

/** Segundos que el jugador «tiene la culpa» de un vehículo que ha dañado (arde unos segundos antes de explotar). */
const BLAME_TIME = 20;

export class Achievements implements System {
  name = 'achievements';
  readonly unlocked = new Set<string>();
  private kills = 0;
  /** Vehículos que ha dañado el jugador hace poco → cuándo (solo cuenta el logro si lo revienta él). */
  private blame = new WeakMap<object, number>();
  /** Vida de los vehículos justo antes de un disparo o explosión del jugador (para saber a cuál ha dado). */
  private readonly shotSnap = new Map<any, number>();
  private snapPending = false;
  /** Momentos de las últimas pitadas del jugador (logro del claxon). */
  private honks: number[] = [];

  constructor(private game: Game) {
    game.mod.achievements = this;
    const ev = game.events;
    ev.on('job:done' as any, (e: any) => {
      const n = game.mod.economy?.stats.deliveries ?? 0;
      this.give('primera');
      if (n >= 10) this.give('diez');
      if (n >= 50) this.give('cincuenta');
      if (e.perfect) this.give('perfecta');
      if (e.job?.offer?.type === 'fragil' && e.job.integrity >= 99.5) this.give('fragil');
      if (e.job?.offer?.client?.id === 'mari') this.give('perro');
      // la abuela ha contado todos los céntimos (aunque el paquete llegara tocado y se cobrase menos)
      if (e.job?.offer?.client?.quirk === 'abuela_centimos' && (e.why === 'paciencia' || (e.why === undefined && e.pay >= e.job.offer.pay))) this.give('abuela');
      if (e.why === 'baile-perfecto') this.give('baile');
    });
    ev.on('money', (e) => {
      const t = e.cash + e.bank;
      if (t >= 10000) this.give('rico');
      if (t >= 100000) this.give('millonario');
    });
    ev.on('vehicle:steal' as any, () => this.give('robo'));
    ev.on('vehicle:landed' as any, (e: any) => {
      if (e.air >= 2 && e.vehicle === game.mod.vehicles?.current) this.give('vuelo');
    });
    // «Fuegos artificiales»: solo si lo ha reventado el jugador (antes contaba cualquier coche que
    // explotase en la isla: uno al que disparaba la policía, el camión de una misión...)
    ev.on('weapon:shot' as any, (e: any) => {
      if (e.shooter?.kind === 'player') this.snapshot();
    });
    ev.on('vehicle:impact' as any, (e: any) => this.onImpact(e.vehicle));
    ev.on('explosion', (e) => this.onExplosion(e.pos, e.radius));
    ev.on('vehicle:destroyed' as any, (e: any) => {
      if (this.playerDid(e.vehicle)) this.give('boom');
    });
    ev.on('wanted', (e) => {
      if (e.level >= 5) this.give('cinco');
    });
    ev.on('gang:killed' as any, () => {
      this.kills++;
      if (this.kills >= 10) this.give('devueltos10');
    });
    ev.on('collectible' as any, (e: any) => {
      if (e.count >= 20) this.give('coleccion');
    });
    ev.on('fame:level' as any, (e: any) => {
      if (e.level >= 5) this.give('fama5');
    });
    ev.on('story:done' as any, (e: any) => {
      if (e.id === 'jefe') this.give('jefe');
    });
    ev.on('player:water' as any, () => this.give('agua'));
    ev.on('photo:taken' as any, () => this.give('foto'));
    // sucesos de la isla (randomEvents)
    const byEvent: Record<string, string> = { race: 'carrera', thief: 'bolso', boda: 'boda', gallina: 'gallina', turista: 'taxi', atraco: 'atraco' };
    ev.on('event:done' as any, (e: any) => {
      if (e.ok && byEvent[e.kind]) this.give(byEvent[e.kind]);
    });
    ev.on('vehicle:horn' as any, (e: any) => {
      const vm = game.mod.vehicles;
      if (!vm || e.vehicle !== vm.current || game.mod.player?.state !== 'vehicle') return;
      const now = game.time.real;
      this.honks.push(now);
      while (this.honks.length && now - this.honks[0] > 15) this.honks.shift();
      if (this.honks.length >= 20) this.give('claxon');
    });
    game.mod.phone?.extraApps.push({ id: 'logros', icon: '🏆', name: 'Logros', color: '#d4af37', open: (body: HTMLDivElement) => this.render(body) });
    game.mod.save?.register({ key: 'achievements', save: () => ({ list: [...this.unlocked], kills: this.kills }), load: (d: any) => {
      for (const x of d?.list ?? []) this.unlocked.add(x);
      this.kills = d?.kills ?? 0;
    } });
    // pintura: al limpiar la búsqueda en el taller
    ev.on('toast', (e) => {
      if (e.text.startsWith('¡Pintado nuevo')) this.give('pintura');
    });
  }

  // ─────────── ¿Lo ha reventado el jugador? ───────────

  private now() {
    return this.game.time.elapsed;
  }

  private blamed(v: any): boolean {
    const t = this.blame.get(v);
    return t !== undefined && this.now() - t < BLAME_TIME;
  }

  /** Disparo o explosión del jugador: se apunta la vida de los vehículos; al acabar el frame se ve a cuál ha dado. */
  private snapshot() {
    const list = this.game.mod.vehicles?.list;
    if (!list) return;
    if (!this.snapPending) this.shotSnap.clear();
    for (const v of list) if (!v.destroyed && !this.shotSnap.has(v)) this.shotSnap.set(v, v.health);
    this.snapPending = true;
  }

  /** Choques: si va conduciendo el jugador, la culpa es suya (de su vehículo y de aquel contra el que choca). */
  private onImpact(v: any) {
    const vm = this.game.mod.vehicles;
    const cur = vm?.current;
    if (!v || !cur || this.game.mod.player?.state !== 'vehicle') return;
    if (v === cur) {
      this.blame.set(cur, this.now());
      return;
    }
    const a = v.body.translation();
    const b = cur.body.translation();
    const reach = Math.max(v.spec.half.x, v.spec.half.z) + Math.max(cur.spec.half.x, cur.spec.half.z) + 2;
    if ((a.x - b.x) ** 2 + (a.z - b.z) ** 2 < reach * reach) this.blame.set(v, this.now());
  }

  /** Un vehículo que ha reventado por culpa del jugador salpica a los de alrededor (reacción en cadena). */
  private onExplosion(pos: { x: number; z: number }, radius: number) {
    const list = this.game.mod.vehicles?.list;
    if (!list) return;
    let guilty = false;
    for (const v of list) {
      if (!v.destroyed) continue;
      const p = v.body.translation();
      if ((p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 < 4 && (this.blamed(v) || this.shotSnap.has(v))) {
        guilty = true;
        break;
      }
    }
    if (!guilty) return;
    const r = radius + 3;
    for (const v of list) {
      if (v.destroyed) continue;
      const p = v.body.translation();
      if ((p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 < r * r) this.blame.set(v, this.now());
    }
  }

  private playerDid(v: any): boolean {
    if (!v) return false;
    if (this.blamed(v)) return true;
    // le ha dado un disparo o una explosión del jugador en este mismo frame
    return this.snapPending && this.shotSnap.has(v);
  }

  update() {
    if (!this.snapPending) return;
    this.snapPending = false;
    const t = this.now();
    for (const [v, hp] of this.shotSnap) if (v.health < hp - 0.01) this.blame.set(v, t);
    this.shotSnap.clear();
  }

  // ─────────── Dar y enseñar ───────────

  give(id: string) {
    if (this.unlocked.has(id)) return;
    const a = LIST.find((x) => x.id === id);
    if (!a) return;
    this.unlocked.add(id);
    this.game.events.emit('toast', { text: `🏆 LOGRO${a.secret ? ' SECRETO' : ''}: ${a.icon} ${a.name}`, color: '#d4af37', time: 3 });
    this.game.mod.audio?.play('success', { volume: 0.7 });
    this.game.mod.economy?.addFame(a.secret ? 20 : 10, 'logro');
    this.game.events.emit('achievement' as any, { id } as any);
  }

  /** Datos para las barras de progreso. */
  private stats(): Stats {
    const e = this.game.mod.economy;
    return {
      deliveries: e?.stats.deliveries ?? 0,
      money: e ? e.cash + e.bank : 0,
      kills: this.kills,
      collected: this.game.mod.pickups?.collected?.size ?? 0,
      fameLevel: e?.fameLevel ?? 1,
    };
  }

  private render(body: HTMLDivElement) {
    ensureCss();
    const st = this.stats();
    const total = LIST.length;
    const got = LIST.filter((a) => this.unlocked.has(a.id)).length;
    const secretsLeft = LIST.filter((a) => a.secret && !this.unlocked.has(a.id)).length;
    body.innerHTML = `<div class="cr-tarjeta cr-logros-cab"><div class="cr-logros-copa">🏆</div><div style="flex:1">
      <h3>LOGROS</h3><div class="gordo">${got}<small>/${total}</small></div>
      <div class="cr-barrafama"><i style="width:${(got / total) * 100}%"></i></div>
      <p>${secretsLeft ? `Quedan ${secretsLeft} secretos por descubrir 🤫` : '¡Has descubierto todos los secretos!'}</p></div></div>`;
    const section = (title: string, list: Ach[]) => {
      if (!list.length) return;
      const h = document.createElement('div');
      h.className = 'cr-logros-sec';
      h.textContent = title;
      body.appendChild(h);
      for (const a of list) body.appendChild(this.row(a, st));
    };
    section(`✅ Conseguidos (${got})`, LIST.filter((a) => this.unlocked.has(a.id)));
    // por conseguir: primero los que tienen barra de progreso (los más cerca), los secretos al final
    const left = LIST.filter((a) => !this.unlocked.has(a.id));
    const k = (a: Ach) => (a.secret ? 2 : a.progress ? 0 : 1);
    left.sort((x, y) => k(x) - k(y));
    section(`🔒 Por conseguir (${left.length})`, left);
  }

  private row(a: Ach, st: Stats): HTMLElement {
    const on = this.unlocked.has(a.id);
    const hidden = a.secret && !on;
    const d = document.createElement('div');
    d.className = 'cr-logro' + (on ? ' on' : '') + (hidden ? ' secreto' : '');
    const icon = hidden ? '❔' : a.icon;
    const name = hidden ? '???' : a.name;
    const desc = hidden ? 'Logro secreto. Sigue haciendo el cabra por la isla.' : a.desc;
    let bar = '';
    if (!on && a.progress) {
      const [cur, goal, txt] = a.progress(st);
      const f = Math.max(0, Math.min(1, cur / goal));
      bar = `<div class="cr-logro-barra"><i style="width:${(f * 100).toFixed(1)}%"></i></div><div class="cr-logro-num">${txt ?? Math.min(cur, goal)} / ${txt ? fmt(goal) : goal}</div>`;
    }
    d.innerHTML = `<div class="cr-logro-ico">${icon}</div><div class="cr-logro-tx"><b></b><span></span>${bar}</div>${on && a.secret ? '<em>SECRETO</em>' : ''}`;
    (d.querySelector('b') as HTMLElement).textContent = name;
    (d.querySelector('span') as HTMLElement).textContent = desc;
    return d;
  }
}

let cssDone = false;
function ensureCss() {
  if (cssDone) return;
  cssDone = true;
  const st = document.createElement('style');
  st.textContent = `
.cr-logros-cab{display:flex;gap:12px;align-items:center}
.cr-logros-cab .gordo small{font:900 18px system-ui;opacity:.55}
.cr-logros-cab p{margin:6px 0 0;font:700 12px system-ui;opacity:.75}
.cr-logros-copa{font-size:44px;filter:drop-shadow(2px 3px 0 rgba(27,16,48,.3))}
.cr-logros-sec{font:900 12px system-ui;letter-spacing:.06em;text-transform:uppercase;margin:14px 4px 4px;opacity:.75}
.cr-logro{display:flex;gap:10px;align-items:center;background:rgba(255,255,255,.55);border:2px solid rgba(27,16,48,.35);border-radius:14px;padding:8px 10px;margin:6px 0;position:relative}
.cr-logro.on{background:#fff8dc;border-color:#1b1030;box-shadow:2px 3px 0 rgba(27,16,48,.3)}
.cr-logro.secreto{background:rgba(27,16,48,.12);border-style:dashed}
.cr-logro-ico{font-size:26px;width:34px;text-align:center;flex:none}
.cr-logro:not(.on) .cr-logro-ico{filter:grayscale(1);opacity:.6}
.cr-logro-tx{flex:1;min-width:0}
.cr-logro-tx b{display:block;font:900 13.5px system-ui}
.cr-logro-tx span{display:block;font:600 11.5px/1.3 system-ui;opacity:.8}
.cr-logro em{position:absolute;top:-7px;right:8px;background:#6c3bd1;color:#fff;font:900 9px system-ui;font-style:normal;letter-spacing:.08em;padding:2px 6px;border-radius:8px;border:2px solid #1b1030}
.cr-logro-barra{height:7px;border-radius:5px;background:rgba(27,16,48,.25);overflow:hidden;margin-top:5px}
.cr-logro-barra i{display:block;height:100%;background:linear-gradient(90deg,#ffd23f,#ff4f81)}
.cr-logro-num{font:800 10.5px system-ui;opacity:.7;margin-top:2px;text-align:right}
`;
  document.head.appendChild(st);
}
