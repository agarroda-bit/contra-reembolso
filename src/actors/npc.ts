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
import type { Animator, Gesture } from './character/animator';

export type NpcRole = 'civil' | 'driver' | 'devuelto' | 'policia' | 'cliente' | 'repartidor' | 'bailarin' | 'vendedor' | 'jefe';
export type NpcState =
  | 'idle' | 'walk' | 'run' | 'flee' | 'knocked' | 'down' | 'getup' | 'dead'
  | 'driving' | 'taped' | 'stunned' | 'pulled' | 'dance' | 'custom' | 'angry'
  | 'react'; // se para a mirar algo raro (señala, graba con el móvil, manos arriba...)

/** Qué hace al reaccionar. */
export type NpcReaction = 'point' | 'film' | 'hands_up' | 'cheer' | 'wave' | 'shrug';
/** Segundos que se queda sentado en el coche (mientras llegas a la puerta) antes de salir de un tirón. */
const PULL_WAIT = 0.5;
/** Segundos por el aire y de culo en el suelo tras el tirón. */
const PULL_FLY = 0.35;
const PULL_SIT = 0.6;
/** Enfadado tras un atropello o un robo: se va a la acera a paso ligero agitando el puño. */
const ANGRY_WALK = 2.6;

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpO = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
/** Parámetros de animación, reutilizados por todos (rig.update no se los guarda): nada de objetos nuevos por frame. */
const ANIM: CharacterAnimParams = { speed: 0, grounded: true, vy: 0, pose: 'normal', aiming: false, weapon: 'none', shot: false };
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
  /** Reacción en curso (estado 'react'). */
  private reactKind: NpcReaction = 'point';
  private reactFor = 0;
  private reactThen: 'walk' | 'flee' = 'walk';
  private readonly reactAt = new THREE.Vector3();
  /** Hasta cuándo (tiempo de juego) se tapa la cabeza al huir (ha oído tiros). */
  coverUntil = -1;
  /** No vuelve a reaccionar a lo loco hasta este momento (tiempo de juego). */
  reactCool = 0;
  /** Coche del que le han sacado (para quedarse sentado dentro hasta el tirón). */
  private pulledFrom: Vehicle | null = null;
  private getupFor = 1;

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
    if (!this.busy && this.state !== 'driving' && this.state !== 'react') this.setState(run ? 'run' : 'walk');
  }

  /** El animador del muñeco (gestos, bailes...). */
  get anim(): Animator | null {
    const r = this.rig as { anim?: Animator };
    return r.anim ?? null;
  }

  /**
   * Se para, mira hacia `at` y reacciona (señalar y gritar, grabarlo con el móvil, manos arriba...).
   * Después vuelve a pasear ('walk') o sale corriendo ('flee'). false = ahora no puede.
   */
  react(kind: NpcReaction, at: THREE.Vector3, seconds = 1.8, then: 'walk' | 'flee' = 'walk'): boolean {
    if (!this.alive || this.busy || this.vehicle || this.state === 'driving' || this.state === 'angry') return false;
    this.reactKind = kind;
    this.reactFor = seconds;
    this.reactThen = then;
    this.reactAt.copy(at);
    // (si estaba parado mirando el móvil, deja la pausa: si no, el cerebro de peatón le volvería a parar)
    const b = this.brain as { pause?: number } | null;
    if (b && typeof b.pause === 'number') b.pause = 0;
    this.setState('react');
    if (kind !== 'hands_up') this.anim?.gesture(kind, seconds);
    return true;
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
    this.pulledFrom = v;
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
        if (w) this.position.y = w.heightAt(this.position.x, this.position.z);
        if (this.stateTime > this.getupFor) {
          this.getupFor = 1;
          if (this.hostile) this.setState('idle');
          else this.enterAngry();
        }
        break;
      case 'angry': {
        // se levanta cabreado y se quita de en medio: a la acera a paso ligero, agitando el puño
        pose = 'normal';
        if (this.target) {
          const to = tmpV.copy(this.target).sub(this.position).setY(0);
          if (to.length() < 0.5) this.target = null;
          else {
            let d = Math.atan2(to.x, to.z) - this.heading;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            this.heading += d * Math.min(1, dt * 8);
            speed = ANGRY_WALK;
            const mx = Math.sin(this.heading) * speed * dt, mz = Math.cos(this.heading) * speed * dt;
            if (!far) this.slideMove(mx, mz, dt);
            else {
              this.position.x += mx;
              this.position.z += mz;
            }
          }
        }
        if (w) this.position.y = w.heightAt(this.position.x, this.position.z);
        if (this.stateTime > (this.target ? 4 : 1.3)) {
          this.target = null;
          this.setState('flee');
        }
        break;
      }
      case 'react': {
        pose = this.reactKind === 'hands_up' ? 'hands_up' : 'normal';
        // mira hacia lo que pasa
        let d = Math.atan2(this.reactAt.x - this.position.x, this.reactAt.z - this.position.z) - this.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.heading += d * Math.min(1, dt * 6);
        if (w) this.position.y = w.heightAt(this.position.x, this.position.z);
        if (this.stateTime > this.reactFor) this.endReaction();
        break;
      }
      case 'dead':
        pose = 'dead';
        if (this.poofTimer >= 0) {
          this.poofTimer -= dt;
          if (this.poofTimer < 0) {
            const pt = tmpV.copy(this.position).setY(this.position.y + 0.5);
            this.game.mod.particles?.poof(pt);
            // que se vea bien de lejos: trozos de caja grandes y un chorro de confeti hacia arriba
            this.game.mod.particles?.emit('cardboard', pt, { count: 6, scale: 1.8, speed: 1.1 });
            this.game.mod.particles?.emit('confetti', pt, { count: 14, speed: 1.3, scale: 1.4 });
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
      case 'pulled': {
        const v = this.pulledFrom;
        const st = this.stateTime;
        if (st < PULL_WAIT && v && !v.disposed) {
          // aún dentro, agarrado al volante, mientras llegas a la puerta
          pose = 'drive';
          const seat = seatTransform(v.spec);
          v.localToWorld(tmpS.set(seat.x, seat.y, seat.z), this.position);
          this.rig.root.position.copy(this.position);
          this.rig.root.quaternion.copy(v.getQuaternion(tmpQ));
          this.rig.root.scale.setScalar(seat.scale);
          break;
        }
        if (this.rig.root.scale.x !== 1) {
          // ¡fuera! aparece en la puerta y sale despedido
          this.rig.root.scale.setScalar(1);
          if (v && !v.disposed) this.game.mod.vehicles?.doorPoint(v, this.position);
          this.game.mod.npcs?.shout?.(this, 'carjack');
          this.game.mod.audio?.say(this.position, 4, this.voice * 1.1, 0.8);
        }
        pose = 'pulled';
        if (st < PULL_WAIT + PULL_FLY) {
          // sale volando hacia atrás (hacia fuera del coche)
          const k = 3.6 * dt;
          const mx = Math.sin(this.heading) * k, mz = Math.cos(this.heading) * k;
          if (!far) this.slideMove(mx, mz, dt);
          else {
            this.position.x += mx;
            this.position.z += mz;
          }
        }
        if (w) this.position.y = w.heightAt(this.position.x, this.position.z);
        if (st > PULL_WAIT + PULL_FLY + PULL_SIT) {
          this.pulledFrom = null;
          if (this.hostile || this.police) this.setState('idle');
          else {
            // se levanta desde el suelo (sentado: sin la parte de estar tumbado)
            this.getupFor = 0.7;
            this.setState('getup');
          }
        }
        break;
      }
      case 'dance':
        pose = 'dance';
        break;
      case 'custom':
        pose = this.customPose;
        // los fiesteros, cuando se paran por la calle, se marcan un baile
        if (pose === 'normal' && this.streetDancer) pose = 'dance';
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

    // gestos que duran lo que dura el estado (huir con los brazos en alto, agitar el puño...)
    const an = this.anim;
    if (an && !this.removed) {
      let want: Gesture | null = null;
      if (this.state === 'angry') want = 'fist';
      else if (this.state === 'flee' && this.role === 'civil' && !this.hostile && !this.police) {
        want = this.game.time.elapsed < this.coverUntil ? 'cover' : this.id % 3 === 0 ? 'lookback' : 'flail';
      }
      if (want) {
        if (an.gest !== want || !an.gestLoop) an.gesture(want, Infinity);
      } else if (an.gest && an.gestLoop) an.stopGesture();
    }

    if (this.state === 'pulled' && this.stateTime < PULL_WAIT && this.pulledFrom && !this.pulledFrom.disposed) {
      // (sigue sentado en el coche: el muñeco ya está colocado en el asiento)
      this.body.setNextKinematicTranslation({ x: this.position.x, y: this.position.y + 0.85, z: this.position.z });
    } else if (this.state !== 'driving') {
      this.syncRoot();
      // colisor
      this.body.setNextKinematicTranslation({ x: this.position.x, y: this.position.y + 0.85, z: this.position.z });
    }
    // animación (lejos, a medio ritmo)
    this.animSkip++;
    if (!far || this.animSkip % 3 === 0) {
      const a = ANIM;
      a.speed = speed;
      a.grounded = grounded;
      a.vy = this.vy;
      a.pose = pose;
      a.aiming = this.aiming;
      a.weapon = this.weapon;
      a.shot = this.shotPulse;
      this.rig.update(far ? dt * 3 : dt, a);
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

  /** Fin de una reacción: vuelve a pasear o sale corriendo de lo que ha visto. */
  private endReaction() {
    this.reactCool = this.game.time.elapsed + 6;
    if (this.reactThen === 'flee') {
      // los peatones huyen con su cerebro de pánico (el de la población)
      const b = this.brain as { panic?: number; from?: THREE.Vector3 | null } | null;
      if (b && typeof b.panic === 'number') {
        b.panic = 4 + rnd.next() * 3;
        b.from = this.reactAt.clone();
      }
      const away = tmpV.copy(this.position).sub(this.reactAt).setY(0);
      if (away.lengthSq() < 0.01) away.set(rnd.next() - 0.5, 0, rnd.next() - 0.5);
      away.normalize().multiplyScalar(12).add(this.position);
      this.setState('idle');
      this.goTo(away, true);
      this.setState('flee');
    } else if (this.target) {
      this.setState('idle');
      this.goTo(this.target, false);
    } else this.setState('idle');
  }

  /** Bailarín callejero: los fiesteros bailan cuando se paran por la calle. */
  private get streetDancer(): boolean {
    if (this.role !== 'civil' || !this.transient) return false;
    return (this.rig.look as { kind?: string }).kind === 'fiestero';
  }

  /**
   * Tras un atropello o un robo: se enfada y se va a la acera más cercana (si está en la calzada)
   * agitando el puño. Si ya está en la acera, lo agita un momento y sigue a lo suyo.
   */
  private enterAngry() {
    this.setState('angry');
    this.target = null;
    this.game.mod.audio?.say(this.position, 5, this.voice, 0.7);
    this.game.mod.npcs?.shout?.(this, 'angry');
    const roads = this.game.mod.traffic?.roads;
    if (!roads) return;
    const ne = roads.nearestEdge(this.position, false);
    if (!ne) return;
    const e = roads.g.edges[ne.edge];
    const a = roads.g.nodes[e.a].pos, b = roads.g.nodes[e.b].pos;
    const abx = b.x - a.x, abz = b.z - a.z;
    const len = Math.hypot(abx, abz) || 1;
    // distancia (con signo) al eje de la calle
    const lat = ((this.position.x - a.x) * abz - (this.position.z - a.z) * abx) / len;
    if (Math.abs(lat) > e.width / 2 + 0.5) return; // ya está en la acera
    const side = lat >= 0 ? 1 : -1;
    const off = side * (e.width / 2 + 1.4) - lat;
    this.target = new THREE.Vector3(this.position.x + (abz / len) * off, this.position.y, this.position.z - (abx / len) * off);
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
