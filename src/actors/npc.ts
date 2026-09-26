// NPC: peatones, conductores, Los Devueltos, policías, clientes... Todos comparten esta base.
// Se mueven sin controlador de física (barato): siguen el terreno con heightAt y esquivan con rayos.
// Tienen un colisor cinemático para que les den las balas y el jugador choque con ellos.
import * as THREE from 'three';
import type { Game } from '../core/game';
import { RAPIER, G, groups, SOLID } from '../core/physics';
import type { CharacterLook, CharacterPose, CharacterRig, CharacterAnimParams } from '../core/contracts';
import type { Vehicle } from '../vehicles/vehicle';
import { seatTransform } from '../vehicles/types';
import type { NpcDriver } from '../vehicles/manager';
import { fx as rnd } from '../core/rng';

export type NpcRole = 'civil' | 'driver' | 'devuelto' | 'policia' | 'cliente' | 'repartidor' | 'bailarin' | 'vendedor' | 'jefe';
export type NpcState =
  | 'idle' | 'walk' | 'run' | 'flee' | 'knocked' | 'down' | 'getup' | 'dead'
  | 'driving' | 'taped' | 'stunned' | 'pulled' | 'dance' | 'custom' | 'angry';

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpO = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
/** Contra qué no se puede andar (edificios, muros y coches). */
const WALK_BLOCK = G.STATIC | G.VEHICLE;
let nextId = 1;

export class Npc implements NpcDriver {
  readonly id = nextId++;
  role: NpcRole;
  rig: CharacterRig;
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  heading = 0;
  health = 100;
  maxHealth = 100;
  /** Se puede derribar del todo (enemigos). Los civiles nunca "mueren": se caen y huyen. */
  killable = false;
  hostile = false;
  police = false;
  state: NpcState = 'idle';
  stateTime = 0;
  /** Adónde quiere ir (andar/correr). */
  target: THREE.Vector3 | null = null;
  walkSpeed = 1.5;
  runSpeed = 5.5;
  /** Pose fija cuando state = 'custom'. */
  customPose: CharacterPose = 'normal';
  aiming = false;
  weapon: CharacterAnimParams['weapon'] = 'none';
  shotPulse = false;
  vehicle: Vehicle | null = null;
  /** Datos libres de la IA que lo controla. */
  brain: any = null;
  /** Para peatones: lo gestiona la población y se puede borrar lejos. */
  transient = true;
  removed = false;
  voice = 0.8 + rnd.next() * 0.7;
  private vy = 0;
  private spin = 0;
  readonly collider: RAPIER.Collider;
  private body: RAPIER.RigidBody;
  private avoidTimer = 0;
  private avoidTurn = 0;
  private animSkip = 0;
  private poofTimer = -1;
  /** Segundos que lleva pegado (cinta) o aturdido (sellos). */
  private holdFor = 0;
  /** Segundos seguidos que lleva queriendo andar sin poder (contra una pared). La IA lo usa para cambiar de plan. */
  blockedTime = 0;
  onDeath: ((npc: Npc) => void) | null = null;

  constructor(
    private game: Game,
    role: NpcRole,
    rig: CharacterRig,
    pos: THREE.Vector3,
    heading = 0,
  ) {
    this.role = role;
    this.rig = rig;
    this.position.copy(pos);
    this.heading = heading;
    rig.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
    game.scene.add(rig.root);
    const w = game.physics.world;
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y + 0.9, pos.z));
    this.collider = w.createCollider(
      // no choca con vehículos (los atropellos los resuelve NpcManager.runOvers): si no, son postes
      RAPIER.ColliderDesc.capsule(0.5, 0.33).setCollisionGroups(groups(G.NPC, G.PLAYER | G.PROJECTILE)),
      this.body,
    );
    game.physics.tag(this.collider, this);
    this.syncRoot();
  }

  setState(s: NpcState) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
  }

  get alive() {
    return this.state !== 'dead' && !this.removed && !(this.killable && this.health <= 0);
  }
  get busy() {
    return this.state === 'knocked' || this.state === 'down' || this.state === 'getup' || this.state === 'dead' || this.state === 'taped' || this.state === 'stunned' || this.state === 'pulled';
  }

  /** Andar/correr hacia un punto. */
  goTo(p: THREE.Vector3, run = false) {
    if (!this.target) this.target = new THREE.Vector3();
    this.target.copy(p);
    if (!this.busy && this.state !== 'driving') this.setState(run ? 'run' : 'walk');
  }

  stop() {
    this.target = null;
    if (this.state === 'walk' || this.state === 'run' || this.state === 'flee') this.setState('idle');
  }

  /** Recibir daño. dir = dirección del golpe (para salir despedido). */
  hurt(amount: number, source?: unknown, dir?: THREE.Vector3, knock = 0) {
    if (!this.alive) return;
    this.health -= amount;
    this.game.events.emit('npc:hurt' as any, { npc: this, amount, source } as any);
    this.game.mod.audio?.say(this.position, 2, this.voice, 0.5);
    const lethal = this.killable && this.health <= 0;
    if (knock > 0 || this.health <= 0) {
      const d = dir ? tmpV.copy(dir).setY(0).normalize() : tmpV.set(rnd.next() - 0.5, 0, rnd.next() - 0.5).normalize();
      // el derribo se tiene que ver: sale volando hacia atrás dando vueltas
      const h = lethal ? Math.max(5.5, knock) : Math.max(3, knock);
      const up = lethal ? Math.max(5.5, knock * 0.6) : Math.max(3, knock * 0.5);
      this.knock(d.multiplyScalar(h).setY(up));
      if (lethal) this.spin *= 1.6;
    }
    if (lethal) {
      // primer estallido de confeti al caer (la nube de cartón grande sale al hacer «puf»)
      const pt = tmpV2.copy(this.position).setY(this.position.y + 1.1);
      this.game.mod.particles?.emit('confetti', pt, { count: 10, speed: 0.7 });
      this.game.mod.particles?.emit('cardboard', pt, { count: 4, speed: 0.6 });
    }
    if (this.health <= 0) {
      if (this.killable) {
        this.health = 0;
        this.die(source);
      } else {
        this.health = this.maxHealth * 0.5; // civiles: se levantan y huyen
      }
    }
  }

  /** Sale volando (atropello, explosión, golpe fuerte). */
  knock(vel: THREE.Vector3) {
    if (this.state === 'dead' && this.poofTimer >= 0) return;
    if (this.vehicle) this.leaveVehicle();
    this.velocity.set(vel.x, 0, vel.z);
    this.vy = vel.y;
    this.spin = (rnd.next() - 0.5) * 12;
    this.position.y += 0.1;
    this.target = null;
    if (this.state !== 'dead') this.setState('knocked');
  }

  die(source?: unknown) {
    // si va volando, termina el vuelo y al caer pasa a 'dead' (lo hace el estado knocked)
    if (this.state !== 'knocked') this.setState('dead');
    this.target = null;
    this.poofTimer = 1.1;
    this.game.events.emit('npc:killed' as any, { npc: this, source } as any);
    this.onDeath?.(this);
  }

  /** Pegado al suelo con cinta (arma loca). */
  tape(seconds = 4) {
    if (!this.alive) return;
    if (this.vehicle) return; // dentro de un coche no se le puede precintar
    this.target = null;
    // (no se sustituye `brain`: otros módulos guardan referencias a él)
    if (this.state === 'taped') this.holdFor = Math.max(this.holdFor, this.stateTime + seconds);
    else {
      this.setState('taped');
      this.holdFor = seconds;
    }
  }
  /** Aturdido (pistola de sellos). */
  stun(seconds = 2.5) {
    if (!this.alive || this.state === 'taped' || this.vehicle) return;
    // en el aire no: primero que aterrice (si no, se quedaría flotando)
    if (this.state === 'knocked' || this.state === 'down' || this.state === 'getup' || this.state === 'dead') return;
    this.target = null;
    if (this.state === 'stunned') this.holdFor = Math.max(this.holdFor, this.stateTime + seconds * 0.5);
    else {
      this.setState('stunned');
      this.holdFor = seconds;
    }
  }

  // ─────────── Vehículos ───────────

  enterVehicle(v: Vehicle) {
    this.vehicle = v;
    v.driver = { kind: 'npc', npc: this };
    this.setState('driving');
    this.collider.setEnabled(false);
    v.mesh.group.add(this.rig.root);
    const st = seatTransform(v.spec);
    this.rig.root.position.set(st.x, st.y, st.z);
    this.rig.root.scale.setScalar(st.scale);
    this.rig.root.rotation.set(0, 0, 0);
  }

  /** Va de pasajero (invisible) hasta que se baja con leaveVehicle. */
  rideAlong(v: Vehicle) {
    this.vehicle = v;
    this.setState('driving');
    this.collider.setEnabled(false);
    this.rig.root.visible = false;
    this.passenger = true;
    v.mesh.group.add(this.rig.root);
    const st = seatTransform(v.spec);
    this.rig.root.position.set(-st.x, st.y, st.z);
    this.rig.root.scale.setScalar(st.scale);
  }
  passenger = false;

  leaveVehicle(exitPos?: THREE.Vector3) {
    const v = this.vehicle;
    if (!v) return;
    if (v.driver && v.driver.kind === 'npc' && v.driver.npc === this) v.driver = null;
    this.vehicle = null;
    this.passenger = false;
    this.rig.root.visible = true;
    this.rig.root.scale.setScalar(1);
    this.game.scene.add(this.rig.root);
    const p = exitPos ?? this.game.mod.vehicles?.doorPoint(v, new THREE.Vector3()) ?? v.getPosition(new THREE.Vector3());
    this.position.copy(p);
    if (this.game.world) this.position.y = this.game.world.heightAt(p.x, p.z);
    this.collider.setEnabled(true);
    this.setState('idle');
  }

  /** NpcDriver: el jugador le saca del coche. */
  pulledOut(v: Vehicle, exitPos: THREE.Vector3) {
    this.leaveVehicle(exitPos);
    this.setState('pulled');
    this.heading = v.heading + Math.PI / 2;
    this.velocity.set(0, 0, 0);
    this.game.events.emit('npc:carjacked' as any, { npc: this, vehicle: v } as any);
  }

  // ─────────── Actualización ───────────

  update(dt: number, far: boolean) {
    if (this.removed) return;
    this.stateTime += dt;
    const w = this.game.world;
    let speed = 0;
    let pose: CharacterPose = 'normal';
    let grounded = true;

    switch (this.state) {
      case 'driving':
        pose = this.vehicle?.spec.pose ?? 'drive';
        // la posición lógica sigue al vehículo (explosiones, búsquedas por distancia...)
        if (this.vehicle && !this.vehicle.disposed) this.vehicle.getPosition(this.position);
        break;
      case 'knocked': {
        // vuelo balístico con rebote (y rebota en las paredes en vez de atravesarlas)
        this.vy -= 22 * dt;
        const hs = Math.hypot(this.velocity.x, this.velocity.z);
        if (hs > 0.3) {
          const o = tmpO.set(this.position.x, this.position.y + 0.6, this.position.z);
          const d = tmpD.set(this.velocity.x / hs, 0, this.velocity.z / hs);
          const hit = this.game.physics.raycast(o, d, hs * dt + 0.4, G.STATIC);
          if (hit && hit.distance > 0.001) {
            const n = hit.normal;
            const vn = this.velocity.x * n.x + this.velocity.z * n.z;
            if (vn < 0) {
              this.velocity.x -= 2 * vn * n.x;
              this.velocity.z -= 2 * vn * n.z;
            }
            this.velocity.multiplyScalar(0.35);
            this.game.mod.particles?.emit('dust', hit.point, { count: 3, dir: n, scale: 0.6 });
          }
        }
        this.position.addScaledVector(this.velocity, dt);
        this.position.y += this.vy * dt;
        this.heading += this.spin * dt;
        const gy = w ? w.heightAt(this.position.x, this.position.z) : 0;
        grounded = false;
        if (this.position.y <= gy) {
          this.position.y = gy;
          if (this.vy < -4) {
            this.vy = -this.vy * 0.3;
            this.velocity.multiplyScalar(0.5);
            this.spin *= 0.5;
          } else {
            this.vy = 0;
            this.velocity.multiplyScalar(Math.max(0, 1 - dt * 6));
            if (this.velocity.lengthSq() < 0.5 && this.stateTime > 0.4) this.setState(this.health > 0 || !this.killable ? 'down' : 'dead');
          }
        }
        pose = 'knocked';
        break;
      }
      case 'down':
        pose = 'knocked';
        if (this.stateTime > 1.2) this.setState('getup');
        break;
      case 'getup':
        pose = 'getup';
        if (this.stateTime > 1.0) this.setState(this.hostile ? 'idle' : 'angry');
        break;
      case 'angry':
        pose = 'normal';
        if (this.stateTime < 0.1) this.game.mod.audio?.say(this.position, 5, this.voice, 0.7);
        if (this.stateTime > 1.8) this.setState('flee');
        break;
      case 'dead':
        pose = 'dead';
        if (this.poofTimer >= 0) {
          this.poofTimer -= dt;
          if (this.poofTimer < 0) {
            this.game.mod.particles?.poof(tmpV.copy(this.position).setY(this.position.y + 0.5));
            this.game.mod.audio?.play('pop', { pos: this.position });
            this.removed = true;
            this.rig.root.visible = false;
            this.collider.setEnabled(false);
          }
        }
        break;
      case 'taped':
        pose = 'taped';
        if (w) this.position.y = w.heightAt(this.position.x, this.position.z);
        if (this.stateTime > (this.holdFor || 4)) this.setState('getup');
        break;
      case 'stunned':
        pose = 'stunned';
        if (w) this.position.y = w.heightAt(this.position.x, this.position.z);
        if (this.stateTime > (this.holdFor || 2.5)) this.setState(this.hostile ? 'idle' : 'flee');
        break;
      case 'pulled':
        pose = 'pulled';
        if (this.stateTime > 0.9) this.setState(this.hostile || this.police ? 'idle' : 'angry');
        break;
      case 'dance':
        pose = 'dance';
        break;
      case 'custom':
        pose = this.customPose;
        break;
      case 'walk':
      case 'run':
      case 'flee':
      case 'idle': {
        const run = this.state === 'run' || this.state === 'flee';
        if (this.target) {
          const to = tmpV.copy(this.target).sub(this.position).setY(0);
          const dist = to.length();
          if (dist < 0.6) {
            this.target = null;
            if (this.state !== 'flee') this.setState('idle');
          } else {
            let want = Math.atan2(to.x, to.z);
            // esquivar obstáculos cada poco
            this.avoidTimer -= dt;
            if (this.avoidTimer <= 0 && (!far || this.hostile)) {
              this.avoidTimer = 0.35;
              const origin = tmpV2.copy(this.position).setY(this.position.y + 1);
              const fwd = tmpD.set(Math.sin(want), 0, Math.cos(want));
              const hit = this.game.physics.raycast(origin, fwd, 1.8, SOLID | G.VEHICLE);
              this.avoidTurn = hit ? (this.avoidTurn || (rnd.next() < 0.5 ? 1 : -1)) : 0;
            }
            want += this.avoidTurn * 1.1;
            let d = want - this.heading;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            this.heading += d * Math.min(1, dt * 8);
            speed = run ? this.runSpeed : this.walkSpeed;
            const mx = Math.sin(this.heading) * speed * dt;
            const mz = Math.cos(this.heading) * speed * dt;
            // cerca de la cámara (o si es de los que pelean) no atraviesa paredes ni coches: resbala por ellos
            if (!far || this.hostile) this.slideMove(mx, mz, dt);
            else {
              this.position.x += mx;
              this.position.z += mz;
            }
          }
        } else this.blockedTime = 0;
        if (w) this.position.y = w.heightAt(this.position.x, this.position.z);
        pose = this.aiming ? 'normal' : 'normal';
        break;
      }
    }

    if (this.state !== 'driving') {
      this.syncRoot();
      // colisor
      this.body.setNextKinematicTranslation({ x: this.position.x, y: this.position.y + 0.85, z: this.position.z });
    }
    // animación (lejos, a medio ritmo)
    this.animSkip++;
    if (!far || this.animSkip % 3 === 0) {
      this.rig.update(far ? dt * 3 : dt, {
        speed,
        grounded,
        vy: this.vy,
        pose,
        aiming: this.aiming,
        weapon: this.weapon,
        shot: this.shotPulse,
      });
      this.shotPulse = false;
    }
  }

  /**
   * Avanza (mx, mz) sin meterse en edificios ni coches: si hay algo delante, resbala por la pared;
   * si está en una esquina, se queda quieto (y blockedTime sube para que la IA cambie de plan).
   * Si ya está dentro de algo (ha aparecido dentro), le deja salir.
   */
  private slideMove(mx: number, mz: number, dt: number) {
    const len = Math.hypot(mx, mz);
    if (len < 1e-6) return;
    const ph = this.game.physics;
    const o = tmpO.set(this.position.x, this.position.y + 0.6, this.position.z);
    const d = tmpD.set(mx / len, 0, mz / len);
    const hit = ph.raycast(o, d, len + 0.35, WALK_BLOCK);
    let bx = mx, bz = mz;
    if (hit && hit.distance > 0.001) {
      const n = hit.normal;
      const nl = Math.hypot(n.x, n.z);
      if (nl > 0.2) {
        const nx = n.x / nl, nz = n.z / nl;
        const into = bx * nx + bz * nz;
        if (into < 0) {
          bx -= into * nx;
          bz -= into * nz;
        }
        const sl = Math.hypot(bx, bz);
        if (sl > 1e-6) {
          const h2 = ph.raycast(o, d.set(bx / sl, 0, bz / sl), sl + 0.35, WALK_BLOCK);
          if (h2 && h2.distance > 0.001) bx = bz = 0;
        }
      } else bx = bz = 0;
    }
    this.position.x += bx;
    this.position.z += bz;
    // atasco: avanza menos de un tercio de lo que quería
    if (Math.hypot(bx, bz) < len * 0.35) this.blockedTime += dt;
    else this.blockedTime = Math.max(0, this.blockedTime - dt * 2);
  }

  private syncRoot() {
    this.rig.root.position.copy(this.position);
    this.rig.root.rotation.set(0, this.heading, 0);
  }

  /** Mirar hacia un punto. */
  face(p: THREE.Vector3) {
    this.heading = Math.atan2(p.x - this.position.x, p.z - this.position.z);
  }

  dispose() {
    this.removed = true;
    if (this.vehicle) this.leaveVehicle();
    this.rig.root.parent?.remove(this.rig.root);
    this.rig.dispose();
    this.game.physics.untag(this.collider);
    this.game.physics.world.removeRigidBody(this.body);
  }
}

void DOWN;
export type { CharacterLook };
