// Tráfico con IA: coches que siguen su carril, frenan ante obstáculos, pitan y se van si están lejos.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import { Roads } from './roads';
import type { VehicleManager } from '../vehicles/manager';
import type { Vehicle } from '../vehicles/vehicle';
import type { NpcManager } from '../actors/npcManager';
import { TRAFFIC_KINDS } from '../vehicles/types';
import { G } from '../core/physics';
import { fx as rnd, Rng } from '../core/rng';
import { randomLookFor } from '../actors/looks';

export interface CarBrain {
  edge: number;
  dir: 1 | -1;
  t: number;
  next: { edge: number; dir: 1 | -1 } | null;
  cruise: number; // velocidad de crucero (m/s)
  blocked: number; // segundos parado por un obstáculo
  stuck: number;
  reverse: number;
  honked: number;
  /** Modo: seguir la calle, o perseguir/huir (lo usan policía y banda). */
  mode: 'lane' | 'chase' | 'flee' | 'park';
  chaseTarget?: THREE.Vector3;
}

const tmpV = new THREE.Vector3();
const tmpT = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpL = new THREE.Vector3();

export class Traffic implements System {
  name = 'traffic';
  roads: Roads;
  readonly cars: Vehicle[] = [];
  readonly parked: Vehicle[] = [];
  private spawnTimer = 0;
  private rng = new Rng('trafico');
  enabled = true;

  constructor(private game: Game) {
    game.mod.traffic = this;
    this.roads = new Roads(game.world);
  }

  private get vm(): VehicleManager {
    return this.game.mod.vehicles;
  }
  private get npcs(): NpcManager {
    return this.game.mod.npcs;
  }

  get target(): number {
    return Math.round(16 * this.game.quality.density);
  }

  /** Crea un coche con conductor en una arista. */
  spawnCar(edge: number, dir: 1 | -1, t: number, kind = TRAFFIC_KINDS[Math.floor(rnd.next() * TRAFFIC_KINDS.length)]): Vehicle | null {
    const e = this.roads.g.edges[edge];
    const pos = this.roads.lanePoint(edge, dir, t, e.width / 4, new THREE.Vector3());
    // no aparecer encima de otro vehículo
    if (this.vm.nearest(pos, 7)) return null;
    const v = this.vm.spawn(kind, pos, this.roads.heading(edge, dir));
    const driver = this.npcs.spawn('driver', randomLookFor(this.rng, 'civil'), pos);
    driver.enterVehicle(v);
    const brain: CarBrain = {
      edge, dir, t, next: null,
      cruise: (e.district === 'centro' || e.district === 'viejo' ? 10 : 13) * (0.85 + rnd.next() * 0.3),
      blocked: 0, stuck: 0, reverse: 0, honked: 0, mode: 'lane',
    };
    (v as any).brain = brain;
    this.cars.push(v);
    return v;
  }

  /** Coche aparcado sin conductor. */
  spawnParked(): void {
    const w = this.game.world;
    const cam = this.game.camera.position;
    const spots = w.parkingSpots.filter((s) => {
      const d = s.pos.distanceTo(cam);
      return d > 50 && d < 140;
    });
    if (!spots.length) return;
    const s = spots[Math.floor(rnd.next() * spots.length)];
    if (this.vm.nearest(s.pos, 5)) return;
    const kinds = ['compact', 'compact', 'suv', 'taxi', 'sports', 'scooter', 'truck'] as const;
    const v = this.vm.spawn(kinds[Math.floor(rnd.next() * kinds.length)], s.pos, s.heading);
    this.parked.push(v);
  }

  update(dt: number) {
    if (!this.enabled || !this.game.world) return;
    const cam = this.game.camera.position;
    const player = this.game.mod.player;
    const focus = player?.position ?? cam;

    // limpiar: lejos, destruidos o robados
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const v = this.cars[i];
      const brain = (v as any).brain as CarBrain | undefined;
      const driverNpc = v.driver && v.driver.kind === 'npc' ? v.driver.npc : null;
      const far = v.getPosition(tmpV).distanceTo(focus) > 210;
      if (v === this.vm.current || (!driverNpc && !far)) {
        // lo ha cogido el jugador o se ha quedado sin conductor: ya no es tráfico
        if (!driverNpc) {
          this.cars.splice(i, 1);
          (v as any).brain = undefined;
          this.parked.push(v);
        }
        continue;
      }
      if (far || v.destroyed || !brain) {
        this.cars.splice(i, 1);
        if (driverNpc) this.npcs.remove(driverNpc);
        if (v !== this.vm.current && !v.owned) this.vm.remove(v);
      }
    }
    for (let i = this.parked.length - 1; i >= 0; i--) {
      const v = this.parked[i];
      if (v === this.vm.current || v.owned || !v.transient) {
        this.parked.splice(i, 1);
        continue;
      }
      if (v.getPosition(tmpV).distanceTo(focus) > 220) {
        this.parked.splice(i, 1);
        this.vm.remove(v);
      }
    }

    // aparecer poco a poco
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.4;
      if (this.cars.length < this.target) {
        const edges = this.roads.edgesInRing(focus, 70, 170);
        if (edges.length) {
          const eid = edges[Math.floor(rnd.next() * edges.length)];
          const dir: 1 | -1 = rnd.next() < 0.5 ? 1 : -1;
          const t = 0.2 + rnd.next() * 0.6;
          const p = this.roads.lanePoint(eid, dir, t, 0, tmpV);
          // preferir sitios que no se ven (detrás de la cámara)
          const toP = tmpT.copy(p).sub(cam).normalize();
          const fwd = this.game.camera.getWorldDirection(tmpL);
          if (toP.dot(fwd) < 0.35 || p.distanceTo(cam) > 130) this.spawnCar(eid, dir, t);
        }
      }
      if (this.parked.length < Math.round(8 * this.game.quality.density)) this.spawnParked();
    }

    for (const v of this.cars) this.drive(v, dt);
  }

  /** Conducción de un coche de IA siguiendo su carril. */
  drive(v: Vehicle, dt: number) {
    const brain = (v as any).brain as CarBrain;
    if (!brain || v.destroyed) return;
    const R = this.roads;
    const e = R.g.edges[brain.edge];
    const len = R.length(brain.edge) || 1;
    const pos = v.getPosition(tmpV);
    const speed = v.speed;

    let target: THREE.Vector3;
    let wantSpeed = brain.cruise;
    if (brain.mode === 'chase' && brain.chaseTarget) {
      target = tmpT.copy(brain.chaseTarget);
      wantSpeed = v.spec.maxSpeed * 0.85;
    } else {
      // avanzar t según la proyección de la posición sobre la arista
      const [a, b] = R.ends(e, brain.dir);
      const abx = b.x - a.x, abz = b.z - a.z;
      brain.t = Math.max(brain.t, ((pos.x - a.x) * abx + (pos.z - a.z) * abz) / (len * len));
      if (!brain.next) brain.next = R.nextEdge(brain.edge, brain.dir, true);
      const look = 5 + Math.abs(speed) * 0.7;
      const tAhead = brain.t + look / len;
      if (tAhead <= 1) {
        target = R.lanePoint(brain.edge, brain.dir, tAhead, e.width / 4, tmpT);
      } else {
        const ne = R.g.edges[brain.next.edge];
        const nlen = R.length(brain.next.edge) || 1;
        target = R.lanePoint(brain.next.edge, brain.next.dir, Math.min(1, ((tAhead - 1) * len) / nlen), ne.width / 4, tmpT);
      }
      if (brain.t >= 0.98) {
        brain.edge = brain.next.edge;
        brain.dir = brain.next.dir;
        brain.t = 0;
        brain.next = null;
      }
    }

    // ángulo hacia el objetivo en ejes del coche
    v.getQuaternion(tmpQ).invert();
    tmpL.copy(target).sub(pos).applyQuaternion(tmpQ);
    const angle = Math.atan2(tmpL.x, tmpL.z); // + = objetivo a la izquierda
    let steer = THREE.MathUtils.clamp(-angle * 2.2, -1, 1);
    // frenar en curvas
    wantSpeed *= THREE.MathUtils.clamp(1 - Math.abs(angle) * 1.1, 0.35, 1);

    // obstáculos delante: rayo desde el morro
    const h = v.spec.half;
    const heading = v.heading;
    const fwd = tmpL.set(Math.sin(heading), 0, Math.cos(heading));
    const nose = new THREE.Vector3(pos.x + fwd.x * (h.z + 0.3), pos.y + 0.2, pos.z + fwd.z * (h.z + 0.3));
    const rayLen = 4 + Math.max(0, speed) * 1.1;
    const hit = this.game.physics.raycast(nose, fwd, rayLen, G.VEHICLE | G.PLAYER | G.NPC | G.STATIC, v.body);
    let blockedByPlayer = false;
    if (hit) {
      const dist = hit.distance;
      const owner: any = hit.owner;
      blockedByPlayer = owner === this.game.mod.player || owner === this.vm.current;
      // en persecución, al jugador se le embiste
      if (!(brain.mode === 'chase' && blockedByPlayer)) {
        const safe = Math.max(0, dist - 2.5);
        wantSpeed = Math.min(wantSpeed, safe * 0.9);
      }
    }

    // atascado: marcha atrás un momento
    if (brain.reverse > 0) {
      brain.reverse -= dt;
      v.controls.throttle = -0.7;
      v.controls.steer = -steer;
      v.controls.handbrake = false;
      return;
    }
    if (wantSpeed > 1 && Math.abs(speed) < 0.4) {
      brain.stuck += dt;
      if (brain.stuck > 3.5) {
        brain.stuck = 0;
        brain.reverse = 1.3;
      }
    } else brain.stuck = 0;

    // pitar si el jugador bloquea
    if (hit && wantSpeed < 1) {
      brain.blocked += dt;
      if (blockedByPlayer && brain.blocked > 1.2 && this.game.time.elapsed - brain.honked > 2.5) {
        brain.honked = this.game.time.elapsed;
        this.game.events.emit('vehicle:horn' as any, { vehicle: v } as any);
        const d = v.driver && v.driver.kind === 'npc' ? v.driver.npc : null;
        if (d && rnd.next() < 0.5) this.game.mod.audio?.say(pos, 4, d.voice, 0.5);
      }
    } else brain.blocked = 0;

    const diff = wantSpeed - speed;
    v.controls.throttle = diff > 0.5 ? THREE.MathUtils.clamp(diff * 0.35, 0.15, 1) : diff < -0.8 ? -1 : 0;
    v.controls.steer = steer;
    v.controls.handbrake = wantSpeed < 0.3 && Math.abs(speed) < 1;
    v.controls.boost = false;
  }
}

