// Tutorial suave: el jefe de la oficina explica por el móvil cómo moverse, subir a la furgoneta,
// hacer la primera entrega, cobrar e ingresar el dinero. Cada paso sale también fijo en la lista
// de encargos del HUD (las notificaciones se cortan y desaparecen; el objetivo no).
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { Messages } from './messages';
import type { Jobs } from './jobs/jobs';
import { CLIENTS } from './jobs/clients';

const BOSS = { id: 'jefe', name: 'Don Remigio (el jefe)', avatar: '🧔' };

/** Lo que hay que hacer en cada paso, en corto (se ve siempre arriba a la izquierda). */
const GOALS: Record<number, string> = {
  1: '🎓 Muévete con WASD (clic en el juego para usar el ratón)',
  2: '🎓 Súbete a tu furgoneta amarilla con F',
  3: '🎓 Abre el móvil con Tab y acepta el encargo',
  4: '🎓 Bájate (F) y pulsa E en la puerta de la oficina 📦',
  5: '🎓 Sigue el GPS hasta la casa 🏠 y pulsa E en la puerta',
  6: '🎓 Ingresa el dinero: E en el cajero 🏧 de la oficina',
};

/** Recordatorios si el jugador se entretiene más de un minuto en un paso. */
const REMINDERS: Record<number, string> = {
  2: 'La furgoneta amarilla, chaval. Acércate y pulsa F.',
  3: 'Tab para abrir el móvil y «Aceptar». O Enter, que es más rápido.',
  4: 'El paquete está en la puerta de la oficina (📦 en el minimapa). Bájate con F y pulsa E allí.',
  5: 'Sigue la flecha del minimapa hasta la casa 🏠 y pulsa E en la puerta.',
  6: 'El cajero 🏧 está al lado de la puerta de la oficina. E para ingresar. Y ya estás.',
};

export class Tutorial implements System {
  name = 'tutorial';
  step = 0;
  done = false;
  private t = 0;
  private start = new THREE.Vector3();
  private waiting = false;
  /** Id de la oferta del tutorial (para mandarla otra vez si se pierde). */
  private offerId = -1;
  private resendAt = -1;
  /** Consejo de compras que llega un rato después de acabar. */
  private tipAt = -1;
  private readonly goal = { id: 'tutorial', title: '', timeLeft: null as number | null, integrity: null as number | null, color: '#06d6a0' };

  constructor(private game: Game) {
    game.mod.tutorial = this;
    const ev = game.events;
    ev.on('vehicle:enter', () => this.advanceFrom(2));
    ev.on('job:accepted' as any, () => this.advanceFrom(3));
    ev.on('job:pickup' as any, () => this.advanceFrom(4));
    ev.on('job:done' as any, () => this.advanceFrom(5));
    ev.on('money', (e) => {
      if (e.reason === 'banco') this.advanceFrom(6);
    });
  }

  private get msgs(): Messages {
    return this.game.mod.messages;
  }
  private get jobs(): Jobs {
    return this.game.mod.jobs;
  }

  private say(text: string) {
    this.msgs?.receive(BOSS.id, BOSS.name, BOSS.avatar, text);
  }

  /** Empieza el tutorial (partida nueva). */
  begin() {
    this.step = 1;
    this.t = 0;
    this.done = false;
    this.waiting = false;
    this.offerId = -1;
    this.resendAt = -1;
    this.tipAt = -1;
    this.start.copy(this.game.mod.player.position);
    if (this.jobs) this.jobs.autoOffers = false;
    if (this.game.mod.gang) this.game.mod.gang.calm = true;
    setTimeout(() => this.say('Muévete con WASD y mira con el ratón (haz clic en el juego para usarlo). Soy Don Remigio, tu jefe. ¡Bienvenido a Contra Reembolso, chaval!'), 1500);
  }

  skip() {
    this.finish(false);
  }

  /**
   * Sigue el tutorial de una partida guardada a medias. Los encargos no se guardan, así que si iba
   * por el encargo de Doña Puri (pasos 3 a 5) se le manda otro. Si no se sabe el paso (partidas
   * antiguas, que solo guardaban si estaba hecho), se da por terminado con el regalo del jefe.
   */
  resume(step: number) {
    if (this.done) return;
    if (!(step >= 1 && step <= 6)) {
      this.finish(true);
      return;
    }
    this.step = step >= 3 && step <= 5 ? 3 : step;
    this.t = 0;
    this.waiting = false;
    this.offerId = -1;
    this.resendAt = -1;
    this.tipAt = -1;
    this.start.copy(this.game.mod.player.position);
    if (this.jobs) this.jobs.autoOffers = false;
    if (this.game.mod.gang) this.game.mod.gang.calm = true;
    const s = this.step;
    const lines: Record<number, string> = {
      1: 'Seguimos donde lo dejamos, chaval. Muévete con WASD y mira con el ratón (haz clic en el juego para usarlo).',
      2: 'Seguimos donde lo dejamos, chaval. Súbete a tu furgoneta amarilla con F. Está aparcada delante de la oficina.',
      3: 'Seguimos donde lo dejamos, chaval. El encargo de antes se ha perdido: te mando otro. Tab y «Aceptar».',
      6: 'Seguimos donde lo dejamos, chaval. Ingresa lo cobrado en un cajero 🏧 con E (hay uno en la puerta de la oficina).',
    };
    setTimeout(() => {
      if (this.done || this.step !== s) return;
      this.say(lines[s]);
      if (s === 3) this.sendOffer();
    }, 1800);
  }

  /** Manda (o vuelve a mandar) el encargo del tutorial: Doña Puri, cerquita de la oficina. */
  private sendOffer() {
    const g = this.game;
    const puri = CLIENTS.find((c) => c.id === 'puri')!;
    const office = g.world.pois.find((p) => p.kind === 'office');
    const spots = g.world.deliverySpots
      .filter((d) => office && d.door.distanceTo(office.door) > 90 && d.door.distanceTo(office.door) < 200)
      .sort((a, b) => a.door.distanceTo(office!.door) - b.door.distanceTo(office!.door));
    const o = this.jobs?.createOffer({ client: { ...puri, quirk: 'none' }, type: 'normal', dest: spots[0], pickup: office, pay: 60, time: 240 });
    this.offerId = o ? o.id : -1;
  }

  private advanceFrom(step: number) {
    if (this.done || this.step !== step) return;
    this.step++;
    this.t = 0;
    this.waiting = false;
    switch (this.step) {
      case 3: {
        this.say('Abre el móvil con Tab y acepta el encargo que te mando (o pulsa Enter). Tu primera entrega.');
        setTimeout(() => {
          if (!this.done && this.step === 3) this.sendOffer();
        }, 1800);
        break;
      }
      case 4:
        this.say('Paquete listo. Bájate con F y pulsa E en la puerta de la oficina (📦). Si la furgoneta está cerca, se carga sola.');
        break;
      case 5:
        this.say('Sigue la flecha del GPS hasta la casa 🏠 y pulsa E en la puerta. Conduce fino: los golpes y los saltos rompen el paquete.');
        break;
      case 6:
        this.say('¡Cobrado! Ingrésalo en un cajero 🏧 con E (hay uno en la puerta de la oficina). El efectivo se pierde si te pasa algo.');
        break;
      case 7:
        this.finish(true);
        break;
    }
  }

  private finish(complete: boolean) {
    if (this.done) return;
    this.done = true;
    this.step = 99;
    if (this.jobs) {
      this.jobs.autoOffers = true;
      this.jobs.nextOfferIn(complete ? 8 : 6);
    }
    if (this.game.mod.gang) this.game.mod.gang.calm = false;
    if (complete) {
      this.game.mod.economy?.addBank(100, 'regalo del jefe');
      this.say('Ya sabes lo básico. Te he dejado 100 € en el banco de regalo. Te irán llegando encargos al móvil. Ojo con Los Devueltos (los de morado 💜) y con la policía.');
      this.tipAt = this.game.time.elapsed + 45;
    }
    this.game.events.emit('tutorial:done' as any, {} as any);
  }

  update(dt: number) {
    const g = this.game;
    // consejo de compras, un rato después de acabar
    if (this.tipAt > 0 && g.time.elapsed > this.tipAt) {
      this.tipAt = -1;
      this.say('Consejo: con 900 € te compras una scooter en Talleres Manolo (Polígono), y en Moda Paquetona (Centro) hay gorras y gafas. Con fama 2 te daré encargos gordos en el tablón de la oficina.');
    }
    if (this.done || this.step === 0) return;
    this.t += dt;
    const p = g.mod.player;
    if (this.step === 1) {
      if (p.position.distanceTo(this.start) > 8 || this.t > 25) {
        this.step = 2;
        this.t = 0;
        this.waiting = false;
        this.say('Súbete a tu furgoneta amarilla con F. Está aparcada delante de la oficina.');
      }
    }
    // ya iba montado (se subió antes de tiempo): no hace falta bajar y volver a subir
    if (this.step === 2 && p.state === 'vehicle') this.advanceFrom(2);
    // el encargo del tutorial se ha perdido (rechazado, caducado, cancelado o robado): se manda otro
    if ((this.step === 3 || this.step === 4 || this.step === 5) && this.offerId >= 0) {
      const jobs = this.jobs;
      const alive = !!jobs && (jobs.offers.some((o) => o.id === this.offerId) || jobs.active.some((a) => a.offer.id === this.offerId && a.state !== 'failed'));
      if (!alive && this.resendAt < 0) {
        this.resendAt = g.time.elapsed + 3;
      } else if (!alive && g.time.elapsed > this.resendAt) {
        this.resendAt = -1;
        this.step = 3;
        this.t = 0;
        this.waiting = false;
        this.say('Ese encargo se ha perdido, pero no pasa nada: te mando otro. Tab y «Aceptar».');
        this.sendOffer();
      } else if (alive) this.resendAt = -1;
    }
    // si el jugador se entretiene, recordatorio suave
    if (this.t > 60 && !this.waiting) {
      this.waiting = true;
      if (REMINDERS[this.step]) this.say(REMINDERS[this.step]);
    }
    if (this.step === 6 && this.t > 90) this.finish(true);
    // objetivo fijo en el HUD
    const goal = GOALS[this.step];
    if (goal) {
      this.goal.title = goal;
      g.hud.jobs.unshift(this.goal);
    }
  }
}
