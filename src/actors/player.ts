// El repartidor: movimiento a pie con el controlador cinemático de Rapier.
import * as THREE from 'three';
import type { Game, System } from '../core/game';
import { RAPIER, G, groups } from '../core/physics';
import type { CharacterAnimParams, CharacterLook, CharacterRig, CharacterPose } from '../core/contracts';
import type { CameraRig } from './cameraRig';
import { JUMP_WINDUP, type Animator, type Gesture } from './character/animator';

export const PLAYER_RADIUS = 0.35;
export const PLAYER_HALF = 0.55; // mitad del cilindro de la cápsula
const CENTER_Y = PLAYER_HALF + PLAYER_RADIUS; // del pie al centro de la cápsula

const WALK = 3.4;
const RUN = 7.2;
const AIM_WALK = 2.6;
/** Agachado (tecla C): de puntillas, despacito. */
const CROUCH_WALK = 1.8;
const JUMP_V = 7.8;
const GRAVITY = -24;

export type PlayerState = 'foot' | 'vehicle' | 'dead' | 'busy';

const tmpF = new THREE.Vector3();
const tmpR = new THREE.Vector3();
const tmpMove = new THREE.Vector3();
const NO_MOVE = { x: 0, y: 0 } as const;

export class Player implements System {
  name = 'player';
  /** Posición de los pies. */
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  heading = 0; // 0 = mirando a +Z
  state: PlayerState = 'foot';
  grounded = false;
  health = 100;
  maxHealth = 100;
  armor = 0;
  stamina = 100;
  invincible = false;
  /** Segundos de invulnerabilidad que quedan (al reaparecer: el personaje parpadea). */
  shield = 0;
  /** Pose especial mientras dure (bailar, etc.). */
  pose: CharacterPose = 'normal';
  poseTimer = 0;
  aiming = false;
  aimPitch = 0;
  weaponKind: CharacterAnimParams['weapon'] = 'none';
  shotPulse = false;
  wobble = 0;
  /** Multiplicador de velocidad (efectos). */
  speedMul = 1;
  /** Velocidad externa (empujones, explosiones) que se va apagando. */
  readonly push = new THREE.Vector3();
  /** Va sentado en un vehículo (el muñeco es hijo del vehículo). */
  seated = false;
  /** Última vez que recibió daño (la vida se recupera sola hasta 60 si pasa un rato). */
  lastHurt = -99;

  readonly root = new THREE.Group();
  rig: CharacterRig | null = null;
  private body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private controller: RAPIER.KinematicCharacterController;
  private jumpQueued = 0;
  private vy = 0;
  private wantMove = new THREE.Vector3();
  private sprint = false;
  private lastGroundedTime = 0;
  private placeholder: THREE.Object3D | null = null;
  private landTimer = 0;
  /** Preparación del salto (se agacha un instante antes de despegar). */
  private jumpWind = 0;
  /** Agachado (mantener C). */
  crouching = false;
  /** Parámetros de animación (se reutilizan: nada de objetos nuevos por frame). */
  private readonly anim: CharacterAnimParams = { speed: 0, grounded: true, vy: 0, pose: 'normal', aiming: false, aimPitch: 0, weapon: 'none', shot: false, wobble: 0 };

  constructor(private game: Game, private makeRig?: (look: CharacterLook) => CharacterRig, look?: CharacterLook) {
    game.mod.player = this;
    const R = RAPIER;
    const w = game.physics.world;
    this.body = w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 5, 0));
    this.collider = w.createCollider(
      R.ColliderDesc.capsule(PLAYER_HALF, PLAYER_RADIUS)
        .setCollisionGroups(groups(G.PLAYER, G.GROUND | G.STATIC | G.VEHICLE | G.NPC | G.PROP | G.DEBRIS))
        .setFriction(0),
      this.body,
    );
    game.physics.tag(this.collider, this);
    this.controller = w.createCharacterController(0.03);
    this.controller.setSlideEnabled(true);
    this.controller.enableAutostep(0.5, 0.25, false);
    this.controller.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    this.controller.enableSnapToGround(0.45);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(80);

    game.scene.add(this.root);
    // celebraciones: al cobrar, un puño arriba; al conseguir algo gordo, saltito, bailecito y vuelta
    const ev = game.events;
    ev.on('job:done' as any, (e: any) => this.celebrate(e?.job && e.job.integrity < 40 ? 'shrug' : 'cheer'));
    for (const big of ['fame:level', 'story:done', 'attic:bought', 'loot:recovered']) ev.on(big as any, () => this.celebrate('celebrate'));
    ev.on('toast', (e) => {
      if (typeof e?.text === 'string' && e.text.startsWith('🏆')) this.celebrate('celebrate');
    });
    if (makeRig && look) this.setRig(makeRig(look));
    else this.makePlaceholder();
  }

  setRig(rig: CharacterRig) {
    if (this.rig) {
      this.root.remove(this.rig.root);
      this.rig.dispose();
    }
    if (this.placeholder) {
      this.root.remove(this.placeholder);
      this.placeholder = null;
    }
    this.rig = rig;
    const an = this.animator;
    if (an) {
      an.fidgetAfter = 10; // parado 10 s: mira el reloj, bosteza...
      an.danceMix = false; // baila el paso que elige (el club dice su nombre)
    }
    rig.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
    this.root.add(rig.root);
  }

  private makePlaceholder() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(PLAYER_RADIUS, PLAYER_HALF * 2, 4, 8),
      new THREE.MeshLambertMaterial({ color: '#ffd23f' }),
    );
    body.position.y = CENTER_Y;
    body.castShadow = true;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.3), new THREE.MeshLambertMaterial({ color: '#c2185b' }));
    nose.position.set(0, 1.5, 0.35);
    g.add(body, nose);
    this.placeholder = g;
    this.root.add(g);
  }

  /** El animador del muñeco (gestos, agacharse...), si el muñeco lo tiene. */
  get animator(): Animator | null {
    const r = this.rig as { anim?: Animator } | null;
    return r && r.anim ? r.anim : null;
  }

  /**
   * Gesto de alegría (o de fastidio) que no estorba: solo a pie y sin apuntar. Andando se hace
   * de cintura para arriba; una celebración larga se corta si echas a andar.
   */
  celebrate(g: Gesture) {
    const an = this.animator;
    if (!an || this.state !== 'foot' || this.pose !== 'normal' || this.aiming || this.crouching) return;
    an.gesture(g);
  }

  teleport(p: THREE.Vector3, heading?: number) {
    this.body.setTranslation({ x: p.x, y: p.y + CENTER_Y, z: p.z }, true);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + CENTER_Y, z: p.z });
    this.position.copy(p);
    this.vy = 0;
    this.velocity.set(0, 0, 0);
    if (heading !== undefined) {
      this.heading = heading;
      (this.game.mod.cameraRig as CameraRig | undefined)?.snapBehind(heading);
    }
    this.syncVisual(0);
  }

  /** Activa o desactiva el cuerpo (al subir a un vehículo). */
  setActive(active: boolean) {
    this.collider.setEnabled(active);
    this.root.visible = active;
  }

  update(dt: number) {
    const g = this.game;
    const input = g.input;
    const cam = g.mod.cameraRig as CameraRig | undefined;
    if (this.state !== 'dead' && this.health < 60 && g.time.elapsed - this.lastHurt > 8) this.health = Math.min(60, this.health + dt * 2.5);
    if (this.shield > 0) {
      this.shield = Math.max(0, this.shield - dt);
      // parpadeo mientras dura (así se ve que aún no te pueden hacer daño)
      if (this.rig) this.rig.root.visible = this.shield <= 0 || Math.floor(this.shield * 8) % 2 === 0;
    }
    if (this.state !== 'foot') {
      this.syncVisual(dt);
      return;
    }
    // Derribado o levantándose del suelo: no se mueve ni apunta hasta estar de pie
    const down = this.pose === 'knocked' || this.pose === 'getup';
    // Entrada → dirección deseada relativa a la cámara
    const ax = input.enabled && !down ? input.moveAxis() : NO_MOVE;
    const fwd = cam ? cam.forwardXZ(tmpF) : tmpF.set(0, 0, -1);
    const right = cam ? cam.rightXZ(tmpR) : tmpR.set(1, 0, 0);
    this.wantMove.set(0, 0, 0).addScaledVector(fwd, ax.y).addScaledVector(right, ax.x);
    const len = this.wantMove.length();
    if (len > 1) this.wantMove.divideScalar(len);
    this.aiming = input.enabled && !down && input.down('aim');
    this.crouching = input.enabled && !down && input.down('crouch') && this.pose === 'normal';
    this.sprint = input.enabled && input.down('sprint') && len > 0.1 && !this.aiming && !this.crouching && this.stamina > 1;
    if (input.enabled && !down && input.pressed('jump')) this.jumpQueued = 0.15;

    // Aguante
    if (this.sprint) this.stamina = Math.max(0, this.stamina - dt * 14);
    else this.stamina = Math.min(100, this.stamina + dt * (len > 0.1 ? 10 : 18));

    // Rumbo: hacia donde anda, o hacia donde apunta la cámara
    if (this.aiming && cam) {
      this.heading = cam.yaw + Math.PI;
    } else if (len > 0.1) {
      const target = Math.atan2(this.wantMove.x, this.wantMove.z);
      let d = target - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * (this.sprint ? 9 : 12));
    }
    if (cam) {
      cam.aiming = this.aiming;
      cam.sprinting = this.sprint;
      this.aimPitch = -cam.pitch;
    }
    if (this.poseTimer > 0) {
      this.poseTimer -= dt;
      if (this.poseTimer <= 0) {
        if (this.pose === 'knocked') {
          // del suelo no se pasa a estar de pie de golpe: se levanta (si aún va por el aire, espera)
          if (this.grounded) {
            this.pose = 'getup';
            this.poseTimer = 0.8;
          } else this.poseTimer = 0.1;
        } else this.pose = 'normal';
      }
    }
    this.jumpQueued = Math.max(0, this.jumpQueued - dt);
    this.syncVisual(dt);
  }

  fixedUpdate(dt: number) {
    if (this.state !== 'foot') return;
    const speed = (this.crouching ? CROUCH_WALK : this.aiming ? AIM_WALK : this.sprint ? RUN : WALK) * this.speedMul;
    // aceleración suave en horizontal
    const targetVX = this.wantMove.x * speed;
    const targetVZ = this.wantMove.z * speed;
    const accel = this.grounded ? 14 : 4;
    this.velocity.x += (targetVX - this.velocity.x) * Math.min(1, dt * accel);
    this.velocity.z += (targetVZ - this.velocity.z) * Math.min(1, dt * accel);
    // efecto colocado: deriva lateral
    if (this.wobble > 0) {
      const t = this.game.time.elapsed;
      this.velocity.x += Math.sin(t * 2.1) * this.wobble * 1.2 * dt * 10;
      this.velocity.z += Math.cos(t * 1.7) * this.wobble * 1.2 * dt * 10;
    }

    // salto con margen ("coyote time")
    const now = this.game.time.elapsed;
    if (this.grounded) this.lastGroundedTime = now;
    if (this.jumpQueued > 0 && this.jumpWind <= 0 && now - this.lastGroundedTime < 0.15 && this.pose === 'normal') {
      // primero se agacha un instante (anticipación de dibujo animado) y luego despega
      this.jumpWind = JUMP_WINDUP;
      this.jumpQueued = 0;
      this.animator?.jumpWindup();
    }
    if (this.jumpWind > 0) {
      this.jumpWind -= dt;
      if (this.jumpWind <= 0) {
        this.jumpWind = 0;
        if (this.pose === 'normal') {
          this.vy = JUMP_V;
          this.lastGroundedTime = -1;
          this.grounded = false;
          this.game.events.emit('player:jump' as any, {} as any);
        }
      }
    }
    this.vy += GRAVITY * dt;
    if (this.vy < -40) this.vy = -40;

    // empujones externos
    const pushLen = this.push.length();
    tmpMove.set(
      (this.velocity.x + this.push.x) * dt,
      (this.vy + this.push.y) * dt,
      (this.velocity.z + this.push.z) * dt,
    );
    if (pushLen > 0.01) this.push.multiplyScalar(Math.max(0, 1 - dt * 4));

    this.controller.computeColliderMovement(
      this.collider,
      tmpMove,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      groups(G.ALL, G.GROUND | G.STATIC | G.VEHICLE | G.NPC | G.PROP | G.DEBRIS),
    );
    const mv = this.controller.computedMovement();
    const wasGrounded = this.grounded;
    this.grounded = this.controller.computedGrounded();
    if (this.grounded && this.vy < 0) {
      if (!wasGrounded && this.vy < -12) this.landTimer = 0.25;
      this.vy = -1; // pegado al suelo
    }
    // techo
    if (!this.grounded && this.vy > 0 && mv.y < tmpMove.y * 0.5) this.vy = 0;
    const t = this.body.translation();
    const nx = t.x + mv.x, ny = t.y + mv.y, nz = t.z + mv.z;
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    this.position.set(nx, ny - CENTER_Y, nz);

    // caída al mar
    const w = this.game.world;
    if (w && this.position.y < w.seaLevel - 1.2) {
      this.game.events.emit('player:water' as any, {} as any);
    }
  }

  private syncVisual(dt: number) {
    if (!this.seated) {
      this.root.position.copy(this.position);
      this.root.rotation.y = this.heading;
    }
    if (this.landTimer > 0) this.landTimer -= dt;
    if (this.rig && this.root.visible) {
      const hs = Math.hypot(this.velocity.x, this.velocity.z);
      const a = this.anim;
      a.speed = this.state === 'foot' ? hs : 0;
      a.grounded = this.grounded;
      a.vy = this.vy;
      a.pose = this.pose;
      a.aiming = this.aiming;
      a.aimPitch = this.aimPitch;
      a.weapon = this.weaponKind;
      a.shot = this.shotPulse;
      a.wobble = this.wobble;
      // levantarse del suelo, algo más rápido que los peatones
      a.timeScale = this.pose === 'getup' ? 1.3 : 1;
      const an = this.animator;
      if (an) {
        an.heading = this.state === 'foot' && !this.seated ? this.heading : NaN;
        an.crouch = this.crouching && this.state === 'foot';
      }
      this.rig.update(dt, a);
      this.shotPulse = false;
    }
    // HUD
    const h = this.game.hud;
    h.health = this.health;
    h.maxHealth = this.maxHealth;
    h.armor = this.armor;
    h.stamina = this.stamina;
    const cam = this.game.mod.cameraRig as CameraRig | undefined;
    if (cam && this.state === 'foot') {
      cam.mode = cam.mode === 'cinematic' || cam.mode === 'free' ? cam.mode : 'foot';
      cam.target.copy(this.position);
      cam.excludeBody = null;
    }
  }

  /** Recibir daño (lo usan balas, golpes, explosiones). Devuelve true si ha muerto. */
  hurt(amount: number, source?: unknown): boolean {
    if (this.invincible || this.shield > 0 || this.state === 'dead') return false;
    let a = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, a * 0.7);
      this.armor -= absorbed;
      a -= absorbed;
    }
    this.health = Math.max(0, this.health - a);
    this.lastHurt = this.game.time.elapsed;
    this.game.events.emit('player:hurt', { amount, source });
    if (this.health <= 0) {
      this.state = 'dead';
      this.game.events.emit('player:died', { cause: String((source as any)?.cause ?? 'golpe') });
      return true;
    }
    return false;
  }

  heal(amount: number) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  get bodyHandle() {
    return this.body;
  }
}
