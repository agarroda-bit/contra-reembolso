// Tráfico con IA: coches que siguen su carril, frenan ante obstáculos, pitan y se van si están lejos.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import { Roads } from './roads';
import type { VehicleManager } from '../vehicles/manager';
import type { Vehicle } from '../vehicles/vehicle';
import type { NpcManager } from '../actors/npcManager';
import { TRAFFIC_KINDS } from '../vehicles/types';
import { RAPIER, G, groups } from '../core/physics';
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
  /** Segundos que le quedan adelantando por el carril contrario (algo parado delante). */
  bypass?: number;
  /** Segundos seguidos sin avanzar (atasco): si no se ve, se retira. */
  jam?: number;
  /** Intentos de desatascarse ante el mismo obstáculo (alterna marcha atrás y adelantar). */
  tries?: number;
}

const tmpV = new THREE.Vector3();
const tmpT = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpL = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpN = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const frustum = new THREE.Frustum();
const sphere = new THREE.Sphere();
const castRot = { x: 0, y: 0, z: 0, w: 1 };
const castPos = { x: 0, y: 0, z: 0 };
const castVel = { x: 0, y: 0, z: 1 };
/** Caja que se "lanza" por delante de cada coche para ver obstáculos (una por tipo, del ancho del coche). */
const castShapes = new Map<string, RAPIER.Cuboid>();
const OBSTACLES = groups(G.ALL, G.VEHICLE | G.PLAYER | G.NPC | G.STATIC);

/**
 * Esquina de un cruce: el punto donde se cortan el carril de llegada (edge1, dir1) y el de salida
 * (edge2, dir2). Los coches siguen su carril hasta cerca de este punto y giran alrededor de él,
 * sin comerse la acera. Devuelve el ángulo de giro (0 = recto, π = media vuelta).
 */
function laneCorner(R: Roads, e1: number, d1: 1 | -1, e2: number, d2: 1 | -1, out: THREE.Vector3): number {
  const E1 = R.g.edges[e1], E2 = R.g.edges[e2];
  const N = R.g.nodes[d1 === 1 ? E1.b : E1.a].pos;
  const h1 = R.heading(e1, d1), h2 = R.heading(e2, d2);
  const ax = Math.sin(h1), az = Math.cos(h1), bx = Math.sin(h2), bz = Math.cos(h2);
  const o1 = E1.width / 4, o2 = E2.width / 4;
  // carril = eje desplazado a la derecha del sentido de marcha: derecha de (dx, dz) = (−dz, dx)
  const p1x = N.x - az * o1, p1z = N.z + ax * o1;
  const p2x = N.x - bz * o2, p2z = N.z + bx * o2;
  const cr = ax * bz - az * bx;
  const turn = Math.abs(Math.atan2(cr, ax * bx + az * bz));
  if (Math.abs(cr) < 0.2) {
    // casi recto (o media vuelta en un fondo de saco): el final del carril
    if (ax * bx + az * bz > 0) out.set((p1x + p2x) / 2, N.y, (p1z + p2z) / 2);
    else out.set(p1x, N.y, p1z);
    return turn;
  }
  const s1 = THREE.MathUtils.clamp(((p2x - p1x) * bz - (p2z - p1z) * bx) / cr, -10, 10);
  out.set(p1x + ax * s1, N.y, p1z + az * s1);
  return turn;
}

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

  /** ¿Se ve este punto (esfera de radio r) desde la cámara? Hay que llamar antes a updateFrustum(). */
  private inView(p: THREE.Vector3, r = 3): boolean {
    return frustum.intersectsSphere(sphere.set(p, r));
  }
  private updateFrustum() {
    const cam = this.game.camera;
    cam.updateMatrixWorld();
    tmpM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(tmpM);
  }

  /** Coche aparcado sin conductor. */
  spawnParked(): void {
    const w = this.game.world;
    // alrededor del jugador (no de la cámara: en el menú la cámara está lejos), nunca pegado a él
    const focus = this.game.mod.player?.position ?? this.game.camera.position;
    const cam = this.game.camera.position;
    const office = w.pois.find((p) => p.kind === 'office');
    const spots = w.parkingSpots.filter((s) => {
      const d = s.pos.distanceTo(focus);
      if (office && s.pos.distanceTo(office.door) < 18) return false;
      // que no aparezca de golpe delante de la cámara
      if (d < 120 && this.inView(s.pos) && s.pos.distanceTo(cam) < 150) return false;
      return d > 45 && d < 140;
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
    this.updateFrustum();

    // limpiar: lejos, destruidos o robados
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const v = this.cars[i];
      if (v.disposed) {
        this.cars.splice(i, 1);
        continue;
      }
      const brain = (v as any).brain as CarBrain | undefined;
      const driverNpc = v.driver && v.driver.kind === 'npc' ? v.driver.npc : null;
      if (v.destroyed) {
        // los restos los retira VehicleDamageFx; el conductor sale despedido y se queda como peatón
        this.cars.splice(i, 1);
        (v as any).brain = undefined;
        if (driverNpc) {
          const out = v.getPosition(new THREE.Vector3());
          driverNpc.leaveVehicle(out);
          driverNpc.knock(new THREE.Vector3((rnd.next() - 0.5) * 8, 6, (rnd.next() - 0.5) * 8));
          this.game.mod.pedestrians?.adopt?.(driverNpc);
        }
        continue;
      }
      v.getPosition(tmpV);
      const dFocus = tmpV.distanceTo(focus);
      // lejos (y sin verse, salvo que esté ya muy lejos, en la niebla)
      let far = dFocus > 210 && (dFocus > 270 || !this.inView(tmpV, 4));
      // atascado un buen rato donde no se ve: se retira (así no se forman colas eternas)
      if (!far && brain && (brain.jam ?? 0) > 18 && dFocus > 35 && !this.inView(tmpV, 4)) far = true;
      if (v === this.vm.current || (!driverNpc && !far)) {
        // lo ha cogido el jugador o se ha quedado sin conductor: ya no es tráfico
        if (!driverNpc) {
          this.cars.splice(i, 1);
          (v as any).brain = undefined;
          this.parked.push(v);
        }
        continue;
      }
      if (far || !brain) {
        this.cars.splice(i, 1);
        if (driverNpc) this.npcs.remove(driverNpc);
        if (v !== this.vm.current && !v.owned) this.vm.remove(v);
      }
    }
    for (let i = this.parked.length - 1; i >= 0; i--) {
      const v = this.parked[i];
      if (v.disposed || v === this.vm.current || v.owned || !v.transient) {
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
          // solo donde no se ve (fuera del encuadre), para que no aparezcan coches de la nada
          if (!this.inView(p, 4)) this.spawnCar(eid, dir, t);
        }
      }
      if (this.parked.length < Math.round(8 * this.game.quality.density)) this.spawnParked();
    }

    for (const v of this.cars) this.drive(v, dt);
  }

  /**
   * Conducción de un coche de IA: sigue su carril (girando alrededor de la esquina de cada cruce),
   * o va hacia `chaseTarget` en persecución. Frena ante lo que tiene delante; si es algo fijo
   * (una farola, una pared) da marcha atrás, y si es un coche parado o el jugador, acaba adelantando.
   */
  drive(v: Vehicle, dt: number) {
    const brain = (v as any).brain as CarBrain;
    if (!brain || v.destroyed) return;
    const R = this.roads;
    const pos = v.getPosition(tmpV);
    const speed = v.speed;
    const absSpeed = Math.abs(speed);

    let target: THREE.Vector3;
    let wantSpeed = brain.cruise;
    if (brain.mode === 'chase' && brain.chaseTarget) {
      target = tmpT.copy(brain.chaseTarget);
      wantSpeed = v.spec.maxSpeed * 0.85;
    } else {
      if (!brain.next) brain.next = R.nextEdge(brain.edge, brain.dir, true);
      let h1 = R.heading(brain.edge, brain.dir);
      let turn = laneCorner(R, brain.edge, brain.dir, brain.next.edge, brain.next.dir, tmpC);
      // distancia (a lo largo del carril) hasta la esquina
      let rem = (tmpC.x - pos.x) * Math.sin(h1) + (tmpC.z - pos.z) * Math.cos(h1);
      if (rem < 0.4) {
        // esquina pasada: al siguiente tramo
        brain.edge = brain.next.edge;
        brain.dir = brain.next.dir;
        brain.next = R.nextEdge(brain.edge, brain.dir, true);
        h1 = R.heading(brain.edge, brain.dir);
        turn = laneCorner(R, brain.edge, brain.dir, brain.next.edge, brain.next.dir, tmpC);
        rem = (tmpC.x - pos.x) * Math.sin(h1) + (tmpC.z - pos.z) * Math.cos(h1);
      }
      const e = R.g.edges[brain.edge];
      const len = R.length(brain.edge) || 1;
      const [a] = R.ends(e, brain.dir);
      brain.t = THREE.MathUtils.clamp(((pos.x - a.x) * Math.sin(h1) + (pos.z - a.z) * Math.cos(h1)) / len, 0, 1);
      // punto a perseguir: por el carril hasta la esquina y luego por el carril de salida
      const look = 3.5 + absSpeed * 0.45;
      if (rem > look) {
        target = tmpT.set(tmpC.x - Math.sin(h1) * (rem - look), pos.y, tmpC.z - Math.cos(h1) * (rem - look));
      } else {
        const h2 = R.heading(brain.next.edge, brain.next.dir);
        target = tmpT.set(tmpC.x + Math.sin(h2) * (look - rem), pos.y, tmpC.z + Math.cos(h2) * (look - rem));
      }
      // adelantando: por el carril contrario (media calzada a la izquierda)
      if ((brain.bypass ?? 0) > 0) {
        brain.bypass! -= dt;
        const sh = e.width / 2;
        target.x += Math.cos(h1) * sh;
        target.z -= Math.sin(h1) * sh;
        wantSpeed = Math.min(wantSpeed, 6);
      }
      // frenar antes de la esquina según lo cerrada que sea
      const cornerSpeed = turn > 2.6 ? 3 : brain.cruise * THREE.MathUtils.clamp(1.05 - turn * 0.42, 0.38, 1);
      wantSpeed = Math.min(wantSpeed, Math.sqrt(cornerSpeed * cornerSpeed + 7 * Math.max(0, rem - 1.5)));
    }

    // ángulo hacia el objetivo en ejes del coche
    v.getQuaternion(tmpQ).invert();
    tmpL.copy(target).sub(pos).applyQuaternion(tmpQ);
    const angle = Math.atan2(tmpL.x, tmpL.z); // + = objetivo a la izquierda
    const steer = THREE.MathUtils.clamp(-angle * 2.2, -1, 1);
    // frenar en curvas
    wantSpeed *= THREE.MathUtils.clamp(1 - Math.abs(angle) * 1.1, 0.35, 1);

    // obstáculos delante: una caja del ancho del coche que se lanza hacia donde va a girar
    const h = v.spec.half;
    const heading = v.heading + THREE.MathUtils.clamp(angle, -0.6, 0.6);
    const fx = Math.sin(heading), fz = Math.cos(heading);
    let shape = castShapes.get(v.spec.kind);
    if (!shape) castShapes.set(v.spec.kind, (shape = new RAPIER.Cuboid(Math.max(0.35, h.x * 0.9), 0.3, 0.1)));
    castPos.x = pos.x + fx * h.z * 0.9;
    castPos.y = pos.y + 0.1;
    castPos.z = pos.z + fz * h.z * 0.9;
    castRot.y = Math.sin(heading / 2);
    castRot.w = Math.cos(heading / 2);
    castVel.x = fx;
    castVel.z = fz;
    const rayLen = 4 + Math.max(0, speed) * 1.1;
    const phys = this.game.physics;
    const hit = phys.world.castShape(castPos, castRot, castVel, shape, 0, rayLen, true, undefined, OBSTACLES, undefined, v.body);
    let blockedByPlayer = false;
    let staticHit = false;
    let stillHit = false;
    let otherCar: Vehicle | null = null;
    if (hit) {
      const dist = hit.time_of_impact;
      const owner: any = phys.ownerOf(hit.collider);
      blockedByPlayer = owner === this.game.mod.player || owner === this.vm.current;
      staticHit = !owner;
      otherCar = owner?.spec ? (owner as Vehicle) : null;
      stillHit = staticHit || (otherCar ? Math.abs(otherCar.speed) < 0.5 : false) || owner === this.game.mod.player;
      // en persecución, al jugador se le embiste
      if (!(brain.mode === 'chase' && blockedByPlayer)) {
        const safe = Math.max(0, dist - 1.6);
        wantSpeed = Math.min(wantSpeed, safe * 0.9);
      }
    }

    // atascado: marcha atrás un momento
    if (brain.reverse > 0) {
      brain.reverse -= dt;
      v.controls.throttle = -0.7;
      v.controls.steer = -steer;
      v.controls.handbrake = false;
      v.controls.boost = false;
      return;
    }
    if (wantSpeed > 1 && absSpeed < 0.4) {
      brain.stuck += dt;
      if (brain.stuck > 3.5) {
        brain.stuck = 0;
        brain.reverse = 1.3;
      }
    } else brain.stuck = 0;
    brain.jam = absSpeed < 0.5 ? (brain.jam ?? 0) + dt : 0;

    // parado por algo delante
    if (hit && wantSpeed < 1) {
      brain.blocked += dt;
      if (blockedByPlayer && brain.blocked > 1.2 && this.game.time.elapsed - brain.honked > 2.5) {
        brain.honked = this.game.time.elapsed;
        this.game.events.emit('vehicle:horn' as any, { vehicle: v } as any);
        const d = v.driver && v.driver.kind === 'npc' ? v.driver.npc : null;
        if (d && rnd.next() < 0.5) this.game.mod.audio?.say(pos, 4, d.voice, 0.5);
      }
      if (staticHit && brain.blocked > 1.5) {
        // una farola, un árbol o una esquina: atrás y a intentarlo otra vez
        brain.blocked = 0;
        brain.reverse = 1.4;
      } else if (brain.mode === 'lane' && !staticHit && brain.blocked > (blockedByPlayer ? 7 : stillHit ? 4 : 9)) {
        brain.blocked = 0;
        const tries = (brain.tries = (brain.tries ?? 0) + 1);
        // ¿de frente o cruzado? (en un cruce, dos que giran a la vez se quedan morro con morro)
        let dh = otherCar ? otherCar.heading - v.heading : 0;
        dh = Math.abs(Math.atan2(Math.sin(dh), Math.cos(dh)));
        if (otherCar && dh > 1.2 && (otherCar as any).brain && otherCar.id < v.id) {
          // cede el paso el de número más alto: marcha atrás; el otro espera y pasa
          brain.reverse = 1.3;
        } else if (otherCar && dh > 1.2 && (otherCar as any).brain && tries < 3) {
          // tiene preferencia: espera a que el otro se aparte (si no se aparta, acabará adelantando)
        } else if (tries % 2 === 0 && dh > 1.2) {
          brain.reverse = 1.3;
        } else {
          // un coche parado (o el jugador plantado, o alguien en la calzada): adelantar por el otro carril
          brain.bypass = 4.5;
        }
      }
    } else brain.blocked = 0;
    if (absSpeed > 3) brain.tries = 0;

    const diff = wantSpeed - speed;
    v.controls.throttle = diff > 0.5 ? THREE.MathUtils.clamp(diff * 0.35, 0.15, 1) : diff < -0.8 ? -1 : 0;
    v.controls.steer = steer;
    v.controls.handbrake = wantSpeed < 0.3 && absSpeed < 1;
    v.controls.boost = false;
  }
}
