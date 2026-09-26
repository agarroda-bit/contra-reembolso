// Muerte, arresto y caída al mar: pantalla graciosa, pérdidas y reaparición.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { Player } from '../actors/player';

const DEATH_LINES = [
  'Paquete devuelto al remitente.',
  'Tu cliente ha marcado el pedido como «no entregado».',
  'Hoy no era tu día. Mañana tampoco pinta bien.',
  'Te han puesto una estrella en la app. Una.',
  'El seguro no cubre «tiroteo con cajas de cartón».',
  'Los Devueltos celebran tu baja con confeti.',
];
const BUSTED_LINES = [
  'Multa, sermón y te quitan el efectivo «como prueba».',
  'La policía se queda tus armas pequeñas. Y tu dignidad.',
  'Te sueltan en la puerta de la oficina con una advertencia.',
];

export class Respawn implements System {
  name = 'respawn';
  private overlay: HTMLDivElement;
  private timer = -1;
  private kind: 'dead' | 'busted' | 'water' = 'dead';
  private killerGang = false;

  constructor(private game: Game) {
    game.mod.respawn = this;
    this.overlay = document.createElement('div');
    this.overlay.className = 'cr-muerte';
    this.overlay.style.cssText =
      'position:fixed;inset:0;z-index:40;display:none;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;' +
      'background:radial-gradient(circle at 50% 50%, rgba(27,16,48,.35), rgba(27,16,48,.85));font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:0 16px';
    game.ui.appendChild(this.overlay);

    game.events.on('player:died', (e) => this.onDeath(e.cause));
    game.events.on('player:busted' as any, () => this.onBusted());
    game.events.on('player:water' as any, () => this.onWater());
  }

  private get player(): Player {
    return this.game.mod.player;
  }

  private show(title: string, sub: string, color: string) {
    this.overlay.innerHTML = '';
    const h = document.createElement('div');
    h.textContent = title;
    h.style.cssText = `font-size:clamp(44px,9vw,110px);font-weight:900;color:${color};text-shadow:6px 6px 0 #1b1030;transform:rotate(-4deg);letter-spacing:-2px;animation:cr-bote .5s cubic-bezier(.2,1.6,.4,1)`;
    const s = document.createElement('div');
    s.textContent = sub;
    s.style.cssText = 'margin-top:20px;font-size:22px;font-weight:700;color:#ffffff;text-shadow:2px 2px 0 #1b1030;max-width:700px';
    this.overlay.append(h, s);
    this.overlay.style.display = 'flex';
    if (!document.getElementById('cr-bote-kf')) {
      const st = document.createElement('style');
      st.id = 'cr-bote-kf';
      st.textContent = '@keyframes cr-bote{0%{transform:scale(.2) rotate(-12deg);opacity:0}100%{transform:scale(1) rotate(-4deg);opacity:1}}';
      document.head.appendChild(st);
    }
  }

  private onDeath(cause: string) {
    // si estaba en la pantalla de "al agua", la muerte manda
    if (this.timer >= 0 && this.kind !== 'water') return;
    const p = this.player;
    this.kind = 'dead';
    this.killerGang = /bala|caja|puñetazo|explosi/.test(cause) && (this.game.mod.gang?.members?.some((m: any) => m.alive && m.position.distanceTo(p.position) < 60) ?? false);
    if (this.game.mod.vehicles?.current) this.game.mod.vehicles.forceExit();
    p.state = 'dead';
    p.pose = 'dead';
    this.game.slowMo(1.2, 0.3);
    this.game.mod.audio?.play('fail');
    this.show('¡TE HAN DEVUELTO!', DEATH_LINES[Math.floor(Math.random() * DEATH_LINES.length)], '#ff4f81');
    this.timer = 3.5;
  }

  private onBusted() {
    if (this.timer >= 0) return;
    const p = this.player;
    this.kind = 'busted';
    if (this.game.mod.vehicles?.current) this.game.mod.vehicles.forceExit();
    p.state = 'dead';
    p.pose = 'hands_up';
    this.game.mod.audio?.play('fail');
    this.show('¡TE HAN PILLADO!', BUSTED_LINES[Math.floor(Math.random() * BUSTED_LINES.length)], '#2ec4ff');
    this.timer = 3.2;
  }

  private onWater() {
    if (this.timer >= 0 || this.player.state !== 'foot') return;
    this.kind = 'water';
    this.game.mod.audio?.play('splash');
    this.show('¡AL AGUA!', 'Un pescador te saca con la red. Los repartidores no nadan.', '#2ec4b6');
    this.player.state = 'busy';
    this.timer = 2;
  }

  update(dt: number) {
    if (this.timer < 0) return;
    // en tiempo real (aunque haya cámara lenta)
    this.timer -= dt / Math.max(0.2, this.game.time.scale);
    if (this.timer > 0) return;
    this.timer = -1;
    this.overlay.style.display = 'none';
    this.respawn();
  }

  private respawn() {
    const g = this.game;
    const p = this.player;
    const w = g.world;
    const eco = g.mod.economy;
    let where = 'la oficina';
    let pos: THREE.Vector3;
    let heading = w.playerSpawn.heading;
    if (this.kind === 'water') {
      // a la orilla más cercana: el nodo de calle más cercano
      const nodes = w.roads.nodes;
      let best = w.playerSpawn.pos;
      let bd = Infinity;
      for (const n of nodes) {
        const d = n.pos.distanceToSquared(p.position);
        if (d < bd) {
          bd = d;
          best = n.pos;
        }
      }
      pos = best.clone();
      p.health = Math.max(1, p.health - 10);
      where = 'la orilla';
    } else if (this.kind === 'busted') {
      pos = w.playerSpawn.pos.clone();
      const lost = eco?.loseCash('multa') ?? 0;
      g.mod.combat?.loseSmallWeapons();
      g.events.emit('notify', { title: 'Policía de Puerto Paquete', text: `Te hemos requisado ${Math.round(lost)} € y las armas pequeñas. Pórtate bien.`, from: 'Comisaría', icon: '🚓' });
    } else {
      // centro de salud más cercano o la oficina
      const health = w.pois.filter((x) => x.kind === 'health' || x.kind === 'office');
      let best = health[0];
      let bd = Infinity;
      for (const h of health) {
        const d = h.door.distanceToSquared(p.position);
        if (d < bd) {
          bd = d;
          best = h;
        }
      }
      pos = best ? best.door.clone() : w.playerSpawn.pos.clone();
      if (best) heading = best.facing;
      where = best?.kind === 'health' ? 'el Centro de Salud' : 'la oficina';
      const lost = eco?.loseCash('muerte') ?? 0;
      const packages = g.mod.jobs?.loseAll?.() ?? 0;
      if (lost > 0 || packages > 0) {
        g.events.emit('loot:stolen' as any, { cash: lost, packages, byGang: this.killerGang } as any);
      }
      g.events.emit('notify', { title: 'Centro de Salud Tiritas', text: `Te hemos recompuesto con cinta de embalar. Has perdido ${Math.round(lost)} € de efectivo.`, from: 'Doctora Venda', icon: '🩹' });
    }
    if (this.kind !== 'water') p.health = p.maxHealth;
    // soltar cualquier vehículo o animación de subir a medias
    const vm = g.mod.vehicles;
    vm?.cancelTransition?.();
    if (vm?.current) vm.forceExit();
    p.seated = false;
    if (p.root.parent !== g.scene) g.scene.add(p.root);
    p.state = 'foot';
    p.pose = 'normal';
    p.poseTimer = 0;
    p.push.set(0, 0, 0);
    p.setActive(true);
    p.teleport(pos, heading);
    // unos segundos sin que te puedan hacer daño (y parpadeando) para poder situarte
    p.shield = 3;
    g.mod.police?.clear?.();
    g.events.emit('player:respawn', { where });
  }
}
