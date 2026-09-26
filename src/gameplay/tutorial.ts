// Tutorial suave: el jefe de la oficina explica por el móvil cómo moverse, subir a la furgoneta,
// hacer la primera entrega, cobrar e ingresar el dinero.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { Messages } from './messages';
import type { Jobs } from './jobs/jobs';
import { CLIENTS } from './jobs/clients';

const BOSS = { id: 'jefe', name: 'Don Remigio (el jefe)', avatar: '🧔' };

export class Tutorial implements System {
  name = 'tutorial';
  step = 0;
  done = false;
  private t = 0;
  private start = new THREE.Vector3();
  private waiting = false;

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
    this.start.copy(this.game.mod.player.position);
    if (this.jobs) this.jobs.autoOffers = false;
    if (this.game.mod.gang) this.game.mod.gang.calm = true;
    setTimeout(() => this.say('¡Bienvenido a Contra Reembolso, chaval! Soy Don Remigio, tu jefe. Muévete con WASD y mira con el ratón (haz clic en la pantalla para capturarlo).'), 1500);
  }

  skip() {
    this.finish(false);
  }

  private advanceFrom(step: number) {
    if (this.done || this.step !== step) return;
    this.step++;
    this.t = 0;
    this.waiting = false;
    const g = this.game;
    switch (this.step) {
      case 3: {
        this.say('¡Eso es! Ahora tu primer encargo. Te lo mando al móvil: ábrelo con Tab y dale a «Aceptar» (o pulsa Enter).');
        setTimeout(() => {
          const puri = CLIENTS.find((c) => c.id === 'puri')!;
          const office = g.world.pois.find((p) => p.kind === 'office');
          const spots = g.world.deliverySpots
            .filter((d) => office && d.door.distanceTo(office.door) > 90 && d.door.distanceTo(office.door) < 200)
            .sort((a, b) => a.door.distanceTo(office!.door) - b.door.distanceTo(office!.door));
          this.jobs?.createOffer({ client: { ...puri, quirk: 'none' }, type: 'normal', dest: spots[0], pickup: office, pay: 60, time: 240 });
        }, 1800);
        break;
      }
      case 4:
        this.say('Bien. El paquete está en la oficina. Bájate (F), acércate a la puerta y pulsa E. Si tienes la furgoneta cerca, se carga sola.');
        break;
      case 5:
        this.say('Ahora sigue el GPS del minimapa hasta la casa (🏠). Conduce con cuidado: los golpes y los saltos estropean el paquete. En la puerta, pulsa E.');
        break;
      case 6:
        this.say('¡Cobrado en efectivo! Pero ojo: el efectivo se pierde si te pasa algo. Ingrésalo en un cajero 🏧 (hay uno en la oficina) con E.');
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
    if (this.jobs) this.jobs.autoOffers = true;
    if (this.game.mod.gang) this.game.mod.gang.calm = false;
    if (complete) {
      this.say('Ya sabes lo básico. Te irán llegando encargos por aquí. Cuidado con Los Devueltos, los de morado 💜, y con la policía. En la oficina tienes el tablón con encargos gordos. ¡A repartir!');
      this.game.mod.economy?.addCash(100, 'regalo del jefe');
    }
    this.game.events.emit('tutorial:done' as any, {} as any);
  }

  update(dt: number) {
    if (this.done || this.step === 0) return;
    this.t += dt;
    const p = this.game.mod.player;
    if (this.step === 1) {
      if (p.position.distanceTo(this.start) > 8 || this.t > 25) {
        this.step = 2;
        this.t = 0;
        this.say('Muy bien. Tu furgoneta amarilla está aparcada delante de la oficina. Acércate y súbete con F.');
      }
    }
    // si el jugador se entretiene, recordatorio suave
    if (this.t > 60 && !this.waiting) {
      this.waiting = true;
      const hints: Record<number, string> = {
        2: 'La furgoneta amarilla, chaval. F para subir.',
        3: 'Tab para abrir el móvil, y «Aceptar».',
        4: 'El paquete está en la puerta de la oficina (📦 en el minimapa). E para recoger.',
        5: 'Sigue la flecha del minimapa hasta la casa 🏠 y pulsa E en la puerta.',
        6: 'Cajero 🏧 de la oficina, E para ingresar. Y ya estás.',
      };
      if (hints[this.step]) this.say(hints[this.step]);
    }
    if (this.step === 6 && this.t > 90) this.finish(true);
  }
}
