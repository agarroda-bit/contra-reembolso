// Cajeros (ingresar el efectivo) y el botín robado por Los Devueltos, que se puede recuperar
// asaltando su guarida del Polígono antes de un día de juego.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { Interaction } from './interact';
import type { Economy } from './economy';
import { fmt } from './economy';
import { DAY_LENGTH_SECONDS } from '../core/game';

export class Loot implements System {
  name = 'loot';
  cash = 0;
  packages = 0;
  /** Tiempo de juego (s) en que se pierde el botín. */
  deadline = 0;
  private lastLabelCash = -1;

  constructor(private game: Game) {
    game.mod.loot = this;
    game.events.on('loot:stolen' as any, (e: any) => this.stolen(e.cash ?? 0, e.packages ?? 0, !!e.byGang));
    const it = game.mod.interaction as Interaction;
    // cajeros
    it.addPoi(
      (p) => p.kind === 'atm',
      () => {
        const eco = game.mod.economy as Economy;
        return eco.cash > 0 ? `Ingresar ${fmt(eco.cash)} en el banco` : `Cajero · Banco: ${fmt(eco.bank)}`;
      },
      () => {
        const eco = game.mod.economy as Economy;
        if (eco.cash > 0) eco.deposit();
        else game.events.emit('toast', { text: `Tienes ${fmt(eco.bank)} en el banco. El efectivo, a salvo.`, color: '#2ec4b6' });
      },
      2.6,
      5,
    );
    // caja fuerte de la guarida
    it.addPoi(
      'hideout',
      () => (this.cash > 0 || this.packages > 0 ? `Abrir la caja fuerte (${fmt(this.cash)} robados)` : 'Guarida de Los Devueltos'),
      () => this.tryOpenSafe(),
      4,
      6,
    );
  }

  private stolen(cash: number, packages: number, byGang: boolean) {
    const g = this.game;
    if (!byGang || (cash <= 0 && packages <= 0)) return;
    this.cash += cash;
    this.packages += packages;
    this.deadline = g.time.elapsed + DAY_LENGTH_SECONDS;
    g.mod.messages?.receive(
      'devueltos',
      'Los Devueltos',
      '↩️',
      `Os hemos pillado el botín, repartidor 😂 ${fmt(this.cash)}${this.packages ? ` y ${this.packages} paquete${this.packages > 1 ? 's' : ''}` : ''}. Está en nuestra guarida del Polígono. Tienes hasta mañana. Si te atreves.`,
    );
  }

  private tryOpenSafe() {
    const g = this.game;
    if (this.cash <= 0 && this.packages <= 0) {
      g.events.emit('toast', { text: 'La caja fuerte está vacía. Solo hay un bocadillo de chóped.', time: 2 });
      return;
    }
    const guards = (g.mod.gang?.members ?? []).filter((m: any) => m.alive && m.position.distanceTo(g.mod.player.position) < 28);
    if (guards.length) {
      g.events.emit('toast', { text: `Quedan ${guards.length} de Los Devueltos vigilando. Encárgate de ellos primero.`, color: '#6c3bd1', time: 2.2 });
      return;
    }
    const eco = g.mod.economy as Economy;
    const total = this.cash + this.packages * 40;
    eco.addCash(total, 'botín');
    eco.addFame(25, 'asalto guarida');
    g.mod.particles?.emit('money', g.mod.player.position.clone().setY(g.mod.player.position.y + 1.5), { count: 30 });
    g.mod.audio?.play('success');
    g.events.emit('toast', { text: `¡Botín recuperado! +${fmt(total)}`, color: '#ffd23f', time: 3 });
    g.mod.messages?.receive('devueltos', 'Los Devueltos', '↩️', '¡¿Pero qué?! ¡Eso era nuestro! Bueno, tuyo. Bueno, NUESTRO. 😡');
    g.events.emit('loot:recovered' as any, { amount: total } as any);
    this.cash = 0;
    this.packages = 0;
  }

  private readonly marker = { x: 0, z: 0, icon: '💰', color: '#6c3bd1', label: '', loot: true };
  private markerOn = false;
  private hideout: { door: THREE.Vector3 } | null | undefined;

  update() {
    const g = this.game;
    if (this.hideout === undefined && g.world) this.hideout = g.world.pois.find((p) => p.kind === 'hideout') ?? null;
    const h = this.hideout;
    // quitar el marcador del botín (sin crear una lista nueva cada frame)
    if (this.markerOn) {
      const i = g.hud.markers.indexOf(this.marker as any);
      if (i >= 0) g.hud.markers.splice(i, 1);
      this.markerOn = false;
    }
    if (this.cash <= 0 && this.packages <= 0) return;
    if (g.time.elapsed > this.deadline) {
      g.mod.messages?.receive('devueltos', 'Los Devueltos', '↩️', `Se acabó el plazo. Nos hemos gastado tus ${fmt(this.cash)} en cartón y cinta. Gracias 😘`);
      this.cash = 0;
      this.packages = 0;
      return;
    }
    if (h) {
      const m = this.marker;
      m.x = h.door.x;
      m.z = h.door.z;
      if (!m.label || this.lastLabelCash !== this.cash) {
        this.lastLabelCash = this.cash;
        m.label = `Botín: ${fmt(this.cash)}`;
      }
      g.hud.markers.push(m as any);
      this.markerOn = true;
    }
  }
}

void THREE;
