// Logros: retos graciosos que se desbloquean jugando. Se ven en la app «Logros» del móvil.
import type { Game, System } from '../core/game';

interface Ach {
  id: string;
  icon: string;
  name: string;
  desc: string;
}

const LIST: Ach[] = [
  { id: 'primera', icon: '📦', name: 'Primer reembolso', desc: 'Entrega tu primer paquete.' },
  { id: 'diez', icon: '🔟', name: 'Repartidor de verdad', desc: 'Entrega 10 paquetes.' },
  { id: 'cincuenta', icon: '🏅', name: 'Máquina del reparto', desc: 'Entrega 50 paquetes.' },
  { id: 'perfecta', icon: '✨', name: 'Guante de seda', desc: 'Haz una entrega perfecta.' },
  { id: 'fragil', icon: '🍰', name: 'Ni un rasguño', desc: 'Entrega un paquete FRÁGIL al 100 %.' },
  { id: 'rico', icon: '💰', name: 'Nuevo rico', desc: 'Ten 10.000 € entre efectivo y banco.' },
  { id: 'millonario', icon: '🤑', name: 'Magnate del cartón', desc: 'Ten 100.000 €.' },
  { id: 'robo', icon: '🚗', name: 'Préstamo sin permiso', desc: 'Roba tu primer coche.' },
  { id: 'vuelo', icon: '🛫', name: 'Furgoneta voladora', desc: 'Pasa 2 segundos en el aire con un vehículo.' },
  { id: 'boom', icon: '💥', name: 'Fuegos artificiales', desc: 'Haz explotar un vehículo.' },
  { id: 'cinco', icon: '🚨', name: 'Enemigo público', desc: 'Llega a 5 sirenas.' },
  { id: 'pintura', icon: '🎨', name: 'Cambio de look', desc: 'Pierde a la policía en el taller de pintura.' },
  { id: 'devueltos10', icon: '↩️', name: 'Devolución al remitente', desc: 'Derriba a 10 de Los Devueltos.' },
  { id: 'coleccion', icon: '🔍', name: 'Cotilla profesional', desc: 'Encuentra los 20 paquetes perdidos.' },
  { id: 'fama5', icon: '⭐', name: 'Famoso de barrio', desc: 'Llega a fama nivel 5.' },
  { id: 'jefe', icon: '👑', name: 'Fin de la devolución', desc: 'Derrota a El Devolución.' },
  { id: 'agua', icon: '🌊', name: 'Los repartidores no nadan', desc: 'Cae al mar.' },
  { id: 'foto', icon: '📸', name: 'Postureo', desc: 'Guarda una foto en el modo foto.' },
  { id: 'perro', icon: '🐕', name: 'Amigo de Pancho', desc: 'Entrega a Mari y Pancho.' },
  { id: 'abuela', icon: '👵', name: 'Paciencia infinita', desc: 'Espera a que la abuela cuente todos los céntimos.' },
];

export class Achievements implements System {
  name = 'achievements';
  readonly unlocked = new Set<string>();
  private kills = 0;

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
    ev.on('vehicle:destroyed' as any, () => this.give('boom'));
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

  give(id: string) {
    if (this.unlocked.has(id)) return;
    const a = LIST.find((x) => x.id === id);
    if (!a) return;
    this.unlocked.add(id);
    this.game.events.emit('toast', { text: `🏆 LOGRO: ${a.icon} ${a.name}`, color: '#d4af37', time: 3 });
    this.game.mod.audio?.play('success', { volume: 0.7 });
    this.game.mod.economy?.addFame(10, 'logro');
  }

  private render(body: HTMLDivElement) {
    body.innerHTML = `<div class="cr-tarjeta"><h3>LOGROS</h3><div class="gordo">${this.unlocked.size}/${LIST.length}</div></div>`;
    for (const a of LIST) {
      const on = this.unlocked.has(a.id);
      const d = document.createElement('div');
      d.className = 'cr-tarjeta';
      d.style.opacity = on ? '1' : '0.55';
      d.innerHTML = `<div style="display:flex;gap:10px;align-items:center"><div style="font-size:30px">${on ? a.icon : '🔒'}</div><div><b style="font:900 14px system-ui">${a.name}</b><div style="font:600 12px system-ui">${a.desc}</div></div></div>`;
      body.appendChild(d);
    }
  }

  update() {}
}
