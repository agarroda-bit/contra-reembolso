// Vehículos locos repartidos por la isla, cada uno con su gracia al conducirlo.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import type { Vehicle } from './vehicle';
import type { VehicleManager } from './manager';
import { fx as rnd } from '../core/rng';

const INTRO: Record<string, string> = {
  cart: '🛒 Carrito del súper con motor: gira raro porque tiene una rueda loca. Como todos.',
  escooter: '🛴 Patinete eléctrico: silencioso, ecológico y muy lento. El claxon es un timbre.',
  garbage: '🚛 Camión de la basura: lo arrasa todo. TODO.',
  golf: '⛳ Carrito de golf del casino: elegante, lento y con música de ascensor.',
  crane: '🏗️ Grúa del puerto: se conduce fatal. A veces el volante va al revés. No es un fallo, es una característica.',
};

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

export class CrazyVehicles implements System {
  name = 'crazyVehicles';
  readonly list: Vehicle[] = [];
  private seen = new Set<string>();
  private craneFlip = 1;
  private craneTimer = 5;
  private respawnTimer = 10;

  constructor(private game: Game) {
    game.mod.crazy = this;
    this.spawnAll();
    game.events.on('vehicle:enter', (e: any) => {
      const k = e.vehicle?.spec?.kind as string;
      if (INTRO[k] && !this.seen.has(k)) {
        this.seen.add(k);
        game.events.emit('toast', { text: INTRO[k], color: '#06d6a0', time: 4 });
        game.mod.economy?.addFame(5, 'vehículo loco');
      }
    });
    // el camión de la basura manda a volar lo que toca
    game.events.on('vehicle:impact' as any, (e: any) => {
      const v = e.vehicle as Vehicle;
      if (v.spec.kind !== 'garbage' || Math.abs(v.speed) < 4) return;
      const vm = game.mod.vehicles as VehicleManager;
      v.getPosition(tmpV);
      for (const o of vm.list) {
        if (o === v || o.destroyed) continue;
        const d = o.getPosition(tmpV2).distanceTo(tmpV);
        if (d < v.spec.half.z + o.spec.half.z + 1) {
          const dir = tmpV2.clone().sub(tmpV).setY(0).normalize();
          o.body.applyImpulse({ x: dir.x * o.spec.mass * 9, y: o.spec.mass * 5, z: dir.z * o.spec.mass * 9 }, true);
          o.body.applyTorqueImpulse({ x: o.spec.mass * 2, y: 0, z: o.spec.mass * 3 }, true);
          o.damage(o.spec.health * 0.3);
        }
      }
    });
  }

  private get vm(): VehicleManager {
    return this.game.mod.vehicles;
  }

  private spawnAll() {
    for (const s of this.game.world.specialVehicleSpots) {
      if (this.list.some((v) => v.spec.kind === s.kind && !v.destroyed)) continue;
      const kind = s.kind === 'scooter_e' ? 'escooter' : s.kind;
      const v = this.vm.spawn(kind as any, s.pos, s.heading);
      v.transient = false;
      (v as any).homeSpot = s;
      this.list.push(v);
    }
  }

  /** Lo llama el gestor de vehículos justo después de leer los mandos del jugador. */
  modifyControls(v: Vehicle) {
    const k = v.spec.kind;
    if (k === 'cart') {
      // rueda loca: el volante tiembla
      v.controls.steer += Math.sin(this.game.time.elapsed * 7) * 0.35 + (rnd.next() - 0.5) * 0.3;
    } else if (k === 'crane') {
      v.controls.steer *= this.craneFlip;
    }
  }

  update(dt: number) {
    const g = this.game;
    const cur = this.vm.current;
    if (cur) {
      const k = cur.spec.kind;
      if (k === 'cart') {
        if (Math.abs(cur.speed) > 3 && rnd.next() < dt * 2) g.mod.audio?.play('slot', { volume: 0.25, pitch: 2.2 });
      } else if (k === 'crane') {
        this.craneTimer -= dt;
        if (this.craneTimer <= 0) {
          this.craneTimer = 4 + rnd.next() * 5;
          this.craneFlip = rnd.next() < 0.45 ? -1 : 1;
          if (this.craneFlip < 0) g.events.emit('toast', { text: '¡El volante de la grúa va al revés!', color: '#ff7b54', time: 1.6 });
        }
        // la pluma se balancea
        const boom = cur.mesh.body;
        boom.rotation.z = Math.sin(g.time.elapsed * 1.3) * 0.03 * Math.min(1, Math.abs(cur.speed) / 5);
      } else if (k === 'golf') {
        // bota un poco
        cur.mesh.body.position.y = Math.abs(Math.sin(g.time.elapsed * 9)) * 0.04 * Math.min(1, Math.abs(cur.speed) / 4);
      }
    }
    // reponer los que se destruyen, cuando el jugador está lejos
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.respawnTimer = 20;
      const p = g.mod.player?.position;
      for (let i = this.list.length - 1; i >= 0; i--) {
        const v = this.list[i];
        const home = (v as any).homeSpot;
        if ((v.destroyed || v.sinking) && p && home && home.pos.distanceTo(p) > 120 && v !== cur) {
          this.vm.remove(v);
          this.list.splice(i, 1);
        }
      }
      if (p) this.spawnAll();
    }
  }
}
