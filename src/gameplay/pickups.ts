// Cosas que se recogen del suelo: dinero, paquetes caídos, munición, botiquines, chalecos
// y los 20 paquetes perdidos coleccionables de la isla.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import { GeoBuilder, vertexColorMaterial } from '../core/geo';

export type PickupKind = 'cash' | 'package' | 'ammo' | 'health' | 'armor' | 'collectible';

export interface Pickup {
  id: number;
  kind: PickupKind;
  pos: THREE.Vector3;
  amount: number;
  mesh: THREE.Object3D;
  t: number;
  life: number; // segundos (Infinity = siempre)
  data?: any;
  onTake?: (p: Pickup) => void;
}

const geos = new Map<PickupKind, THREE.BufferGeometry>();
function geoFor(kind: PickupKind): THREE.BufferGeometry {
  let g = geos.get(kind);
  if (g) return g;
  const b = new GeoBuilder();
  switch (kind) {
    case 'cash':
      b.box(0.45, 0.08, 0.25, '#4caf50', 0, 0, 0);
      b.box(0.46, 0.085, 0.08, '#ffd23f', 0, 0, 0);
      b.box(0.42, 0.08, 0.23, '#66bb6a', 0.02, 0.09, 0.01, 0, 0.3, 0);
      break;
    case 'package':
    case 'collectible':
      b.box(0.5, 0.4, 0.5, kind === 'collectible' ? '#ffd23f' : '#c8915a', 0, 0, 0);
      b.box(0.51, 0.08, 0.51, kind === 'collectible' ? '#ff4f81' : '#8f6238', 0, 0.05, 0);
      b.box(0.08, 0.41, 0.51, kind === 'collectible' ? '#ff4f81' : '#8f6238', 0, 0, 0);
      break;
    case 'ammo':
      b.box(0.4, 0.25, 0.3, '#556b2f', 0, 0, 0);
      b.box(0.41, 0.06, 0.31, '#ffd23f', 0, 0.06, 0);
      break;
    case 'health':
      b.box(0.45, 0.35, 0.2, '#ffffff', 0, 0, 0);
      b.box(0.3, 0.08, 0.21, '#e63946', 0, 0, 0);
      b.box(0.08, 0.26, 0.21, '#e63946', 0, 0, 0);
      break;
    case 'armor':
      b.box(0.45, 0.5, 0.18, '#1d3557', 0, 0, 0);
      b.box(0.2, 0.1, 0.19, '#ffd23f', 0, 0.12, 0);
      break;
  }
  g = b.build();
  geos.set(kind, g);
  return g;
}

let nextId = 1;
const tmpV = new THREE.Vector3();

export class Pickups implements System {
  name = 'pickups';
  readonly list: Pickup[] = [];
  collected = new Set<number>(); // índices de coleccionables ya cogidos
  private collectibleMeshes = new Map<number, Pickup>();

  constructor(private game: Game) {
    game.mod.pickups = this;
  }

  spawn(kind: PickupKind, pos: THREE.Vector3, amount = 1, life = 60, onTake?: (p: Pickup) => void, data?: any): Pickup {
    const mesh = new THREE.Mesh(geoFor(kind), vertexColorMaterial);
    mesh.castShadow = true;
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    const p: Pickup = { id: nextId++, kind, pos: pos.clone(), amount, mesh, t: Math.random() * 6, life, onTake, data };
    this.list.push(p);
    return p;
  }

  remove(p: Pickup) {
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
    this.game.scene.remove(p.mesh);
  }

  /** Coloca los 20 paquetes perdidos (salvo los ya cogidos). */
  placeCollectibles(already: number[] = []) {
    this.collected = new Set(already);
    const pts = this.game.world.collectibles;
    pts.forEach((pt, i) => {
      if (this.collected.has(i)) return;
      const p = this.spawn('collectible', pt.clone().setY(pt.y + 0.6), 1, Infinity, undefined, { index: i });
      this.collectibleMeshes.set(i, p);
    });
  }

  update(dt: number) {
    const g = this.game;
    const player = g.mod.player;
    if (!player) return;
    const inCar = player.state === 'vehicle';
    const ppos = inCar && g.mod.vehicles.current ? g.mod.vehicles.current.getPosition(tmpV) : player.position;
    const reach = inCar ? 2.8 : 1.4;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = p.pos.y + 0.35 + Math.sin(p.t * 3) * 0.12;
      if (p.life !== Infinity && p.t > p.life) {
        this.remove(p);
        continue;
      }
      if (player.state === 'dead') continue;
      const dx = p.pos.x - ppos.x, dz = p.pos.z - ppos.z, dy = p.pos.y - ppos.y;
      if (dx * dx + dz * dz < reach * reach && Math.abs(dy) < 2.5) this.take(p);
    }
  }

  private take(p: Pickup) {
    const g = this.game;
    const eco = g.mod.economy;
    const player = g.mod.player;
    this.remove(p);
    g.mod.particles?.emit(p.kind === 'cash' ? 'money' : 'stars', p.pos, { count: 8 });
    switch (p.kind) {
      case 'cash':
        eco?.addCash(p.amount, 'recogido');
        g.mod.audio?.play('coin');
        break;
      case 'health':
        player.heal(40);
        g.mod.audio?.play('pickup');
        g.events.emit('toast', { text: '+40 de vida', color: '#06d6a0', time: 1.2 });
        break;
      case 'armor':
        player.armor = Math.min(100, player.armor + 50);
        g.mod.audio?.play('pickup');
        g.events.emit('toast', { text: '+50 de chaleco', color: '#2060ff', time: 1.2 });
        break;
      case 'ammo': {
        const c = g.mod.combat;
        if (c && c.current !== 'fists') c.ammo[c.current].reserve += p.amount;
        g.mod.audio?.play('reload');
        break;
      }
      case 'package':
        g.mod.audio?.play('pickup');
        break;
      case 'collectible': {
        const idx = p.data?.index ?? -1;
        this.collected.add(idx);
        const n = this.collected.size;
        eco?.addCash(250, 'paquete perdido');
        eco?.addFame(15, 'coleccionable');
        g.mod.audio?.play('success');
        g.events.emit('toast', { text: `¡Paquete perdido ${n}/20! +250 €`, color: '#ffd23f', time: 2.5 });
        g.events.emit('collectible' as any, { index: idx, count: n } as any);
        if (n === 20) g.events.emit('notify', { title: '¡Los 20 paquetes perdidos!', text: 'Eres el repartidor más cotilla de la isla. Premio: 5.000 €.', from: 'Oficina', icon: '🏆' });
        if (n === 20) eco?.addCash(5000, 'coleccionables');
        break;
      }
    }
    p.onTake?.(p);
  }
}
