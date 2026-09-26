// Un vehículo con física de Rapier (chasis dinámico + ruedas por rayos) y conducción arcade.
import * as THREE from 'three';
import type { Game } from '../core/game';
import { RAPIER, G, groups } from '../core/physics';
import { VEHICLES, type VehicleKind, type VehicleSpec } from './types';
import { makeVehicleMesh, releaseWheels, setWheelInstance, type VehicleMesh } from './meshes';

export interface VehicleControls {
  throttle: number; // -1..1 (negativo = freno/marcha atrás)
  steer: number; // -1..1 (positivo = derecha)
  handbrake: boolean;
  boost: boolean;
}

export type Driver = { kind: 'player' } | { kind: 'npc'; npc: any } | null;

const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpTq = new THREE.Vector3();
const tmpFwd = new THREE.Vector3();
const tmpGroupM = new THREE.Matrix4();
const TWO_PI = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
let nextId = 1;
/** Escala de los frenos de Rapier (medida en pruebas/vehiculos.html?medir). */
const BRAKE_K = 1.2;
/** Escala global del motor. */
const ENGINE_K = 1.55;
/** En el aire la gravedad pesa menos: saltos más largos y vistosos (la del mundo es muy fuerte, −22). */
const AIR_GRAVITY = 0.62;

export class Vehicle {
  readonly id = nextId++;
  readonly spec: VehicleSpec;
  readonly mesh: VehicleMesh;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly controller: RAPIER.DynamicRayCastVehicleController;
  color: string;
  health: number;
  driver: Driver = null;
  /** Pasajeros/paquetes (lo usa el sistema de encargos). */
  packages = 0;
  readonly controls: VehicleControls = { throttle: 0, steer: 0, handbrake: false, boost: false };
  /** Velocidad hacia delante (m/s, negativa marcha atrás). */
  speed = 0;
  /** 0..1: turbo disponible. */
  boost = 1;
  destroyed = false;
  onFire = false;
  sinking = false;
  /** Tiempo desde que está volcado. */
  private flipTimer = 0;
  /** Tiempo encallado sin ruedas en el suelo y sin moverse (encima de algo). */
  private beachedTimer = 0;
  /** true mientras va por el aire con la gravedad rebajada. */
  private airborne = false;
  private steerSmooth = 0;
  private prevVel = new THREE.Vector3();
  private wheelSpin = [0, 0, 0, 0];
  private airTime = 0;
  /** true si es propiedad del jugador (garaje). */
  owned = false;
  /** Marca de tráfico: el gestor puede borrarlo cuando esté lejos. */
  transient = true;
  /** Última vez (s) que el jugador lo condujo. */
  lastDriven = -999;
  /** Mejoras compradas (fase 5). */
  upgrades = { engine: 0, brakes: 0, armor: 0, tires: 0, trunk: 0, nitro: 0 };
  sirenOn = false;
  hornTimer = 0;
  /** Callback de impacto (daño a paquetes, sonidos...). */
  onImpact: ((dv: number, v: Vehicle) => void) | null = null;
  readonly wheelContact = [false, false, false, false];
  /** Velocidad lateral (m/s): derrape. */
  slip = 0;

  constructor(private game: Game, kind: VehicleKind, pos: THREE.Vector3, heading: number, color?: string) {
    this.spec = VEHICLES[kind];
    const s = this.spec;
    this.color = color ?? s.colors[Math.floor(Math.random() * s.colors.length)];
    this.health = s.health;
    this.mesh = makeVehicleMesh(s, this.color, game.scene);
    game.scene.add(this.mesh.group);

    const w = game.physics.world;
    tmpQ.setFromAxisAngle(UP, heading);
    const spawnY = pos.y + s.half.y + s.suspension + s.wheelRadius - s.wheelY * 0.2 + 0.25;
    this.body = w.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, spawnY, pos.z)
        .setRotation({ x: tmpQ.x, y: tmpQ.y, z: tmpQ.z, w: tmpQ.w })
        .setLinearDamping(0.08)
        .setAngularDamping(0.9)
        .setCanSleep(true)
        .setCcdEnabled(s.maxSpeed > 30),
    );
    const { x: hx, y: hy, z: hz } = s.half;
    const inertia = {
      x: (s.mass / 12) * (4 * hy * hy + 4 * hz * hz) * 1.2,
      y: (s.mass / 12) * (4 * hx * hx + 4 * hz * hz) * 1.2,
      z: (s.mass / 12) * (4 * hx * hx + 4 * hy * hy) * (s.twoWheels ? 3 : 1.2),
    };
    this.collider = w.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setMassProperties(s.mass, { x: 0, y: -hy * 0.55, z: 0 }, inertia, { x: 0, y: 0, z: 0, w: 1 })
        .setFriction(0.4)
        .setRestitution(0.1)
        .setCollisionGroups(groups(G.VEHICLE, G.ALL & ~G.TRIGGER & ~G.PROP))
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),
      this.body,
    );
    game.physics.tag(this.collider, this);

    const c = w.createVehicleController(this.body);
    (c as any).setIndexForwardAxis = 2;
    const wheels: [number, number][] = [
      [s.wheelX, s.wheelZFront],
      [-s.wheelX, s.wheelZFront],
      [s.wheelX, s.wheelZBack],
      [-s.wheelX, s.wheelZBack],
    ];
    for (const [x, z] of wheels) {
      c.addWheel({ x, y: s.wheelY, z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, s.suspension, s.wheelRadius);
    }
    for (let i = 0; i < 4; i++) {
      c.setWheelSuspensionStiffness(i, s.stiffness);
      c.setWheelSuspensionCompression(i, s.damping);
      c.setWheelSuspensionRelaxation(i, s.damping * 1.2);
      c.setWheelMaxSuspensionTravel(i, s.suspension * 1.2);
      c.setWheelFrictionSlip(i, s.friction);
      c.setWheelSideFrictionStiffness(i, 1);
      c.setWheelMaxSuspensionForce(i, s.mass * 60);
    }
    this.controller = c;
    this.syncVisual(0);
  }

  /** Ya borrado del mundo: no se puede tocar su cuerpo de Rapier (se usa la última posición). */
  disposed = false;
  private lastT = { x: 0, y: 0, z: 0 };
  private lastR = { x: 0, y: 0, z: 0, w: 1 };
  private tr() {
    return this.disposed ? this.lastT : this.body.translation();
  }
  private rt() {
    return this.disposed ? this.lastR : this.body.rotation();
  }

  get position(): THREE.Vector3 {
    const t = this.tr();
    return tmpV.set(t.x, t.y, t.z);
  }
  getPosition(out: THREE.Vector3): THREE.Vector3 {
    const t = this.tr();
    return out.set(t.x, t.y, t.z);
  }
  getQuaternion(out: THREE.Quaternion): THREE.Quaternion {
    const r = this.rt();
    return out.set(r.x, r.y, r.z, r.w);
  }
  /** Rumbo en el plano (0 = mirando a +Z). */
  get heading(): number {
    const r = this.rt();
    tmpQ.set(r.x, r.y, r.z, r.w);
    tmpV2.set(0, 0, 1).applyQuaternion(tmpQ);
    return Math.atan2(tmpV2.x, tmpV2.z);
  }
  /** Punto local → mundo. */
  localToWorld(local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const r = this.rt();
    const t = this.tr();
    tmpQ.set(r.x, r.y, r.z, r.w);
    return out.copy(local).applyQuaternion(tmpQ).add(tmpV2.set(t.x, t.y, t.z));
  }
  /** ¿Está volcado? */
  get upsideDown(): boolean {
    const r = this.rt();
    tmpQ.set(r.x, r.y, r.z, r.w);
    tmpV2.set(0, 1, 0).applyQuaternion(tmpQ);
    return tmpV2.y < 0.3;
  }

  fixedUpdate(dt: number) {
    if (this.destroyed) {
      if (this.airborne && !this.disposed) this.setAirborne(false);
      return;
    }
    const s = this.spec;
    const c = this.controller;
    const ctl = this.controls;
    const up = this.upgrades;
    const mul = (1 + up.engine * 0.12) * ENGINE_K;
    const topSpeed = s.maxSpeed * (1 + up.engine * 0.06) * (this.health < s.health * 0.15 ? 0.6 : 1);

    this.speed = c.currentVehicleSpeed();
    const absSpeed = Math.abs(this.speed);

    // Dirección: menos giro a alta velocidad
    const steerLimit = (s.steer / (1 + Math.pow(absSpeed / 8, 1.7))) * (ctl.handbrake ? 1.5 : 1);
    const targetSteer = -ctl.steer * steerLimit;
    this.steerSmooth += (targetSteer - this.steerSmooth) * Math.min(1, dt * 8);
    c.setWheelSteering(0, this.steerSmooth);
    c.setWheelSteering(1, this.steerSmooth);

    // Motor, freno y marcha atrás
    let engine = 0;
    let brake = 0;
    const t = ctl.throttle;
    if (t > 0.05) {
      if (this.speed < -1) brake = s.brake * t;
      else if (this.speed < topSpeed) engine = s.engine * t * mul * (1 - Math.max(0, this.speed / topSpeed) ** 3 * 0.8);
    } else if (t < -0.05) {
      if (this.speed > 1) brake = s.brake * -t * (1 + up.brakes * 0.2);
      else if (this.speed > -s.reverseSpeed) engine = s.engine * t * 0.6;
    } else {
      brake = s.brake * 0.04; // freno motor
    }
    // turbo
    if (ctl.boost && this.boost > 0.02 && t > 0.1) {
      engine *= 1.9 + up.nitro * 0.3;
      this.boost = Math.max(0, this.boost - dt * 0.35);
      if (this.speed < topSpeed * 1.3) engine = Math.max(engine, s.engine * 1.2);
    } else {
      this.boost = Math.min(1, this.boost + dt * 0.12);
    }
    const drive = s.drive;
    for (let i = 0; i < 4; i++) {
      const front = i < 2;
      const powered = drive === 'awd' || (drive === 'fwd' ? front : !front);
      c.setWheelEngineForce(i, powered ? engine * (drive === 'awd' ? 0.5 : 1) : 0);
      c.setWheelBrake(i, brake * (front ? 0.6 : 0.4) * BRAKE_K);
    }
    // Freno de mano: bloquea detrás y quita agarre (derrape)
    const grip = s.friction * (1 + up.tires * 0.12);
    if (ctl.handbrake) {
      c.setWheelBrake(2, s.brake * 0.5 * BRAKE_K);
      c.setWheelBrake(3, s.brake * 0.5 * BRAKE_K);
      c.setWheelFrictionSlip(2, grip * 0.35);
      c.setWheelFrictionSlip(3, grip * 0.35);
      c.setWheelSideFrictionStiffness(2, 0.35);
      c.setWheelSideFrictionStiffness(3, 0.35);
    } else {
      c.setWheelFrictionSlip(2, grip);
      c.setWheelFrictionSlip(3, grip);
      c.setWheelSideFrictionStiffness(2, 1);
      c.setWheelSideFrictionStiffness(3, 1);
      c.setWheelFrictionSlip(0, grip);
      c.setWheelFrictionSlip(1, grip);
    }

    c.updateVehicle(dt, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, groups(G.ALL, G.GROUND | G.STATIC | G.VEHICLE), (col) => col.handle !== this.collider.handle);

    // Ayudas arcade
    let contacts = 0;
    for (let i = 0; i < 4; i++) {
      this.wheelContact[i] = c.wheelIsInContact(i);
      if (this.wheelContact[i]) contacts++;
    }
    const r = this.body.rotation();
    tmpQ.set(r.x, r.y, r.z, r.w);
    const bodyUp = tmpV2.set(0, 1, 0).applyQuaternion(tmpQ);
    const av = this.body.angvel();
    const mass = s.mass;
    const lv = this.body.linvel();
    if (contacts === 0) {
      if (this.airTime === 0) this.takeOff(tmpQ, absSpeed, lv.y);
      this.airTime += dt;
      // control en el aire: nivela el coche y permite girar
      const tq = tmpTq.crossVectors(bodyUp, UP);
      if (this.driver?.kind === 'player' && bodyUp.y > 0.5) {
        // el del jugador se mantiene plano en el aire: aterriza sobre las ruedas y no clava el morro
        this.body.applyTorqueImpulse({ x: 0, y: -ctl.steer * mass * 0.6 * dt, z: 0 }, true);
        const w = this.body.angvel();
        const k = Math.min(1, dt * 5);
        this.body.setAngvel({ x: w.x + (tq.x * 2.5 - w.x) * k, y: w.y, z: w.z + (tq.z * 2.5 - w.z) * k }, true);
      } else {
        const levelK = mass * 2.2;
        this.body.applyTorqueImpulse({ x: tq.x * levelK * dt * 3, y: -ctl.steer * mass * 0.6 * dt, z: tq.z * levelK * dt * 3 }, true);
        this.body.setAngvel({ x: av.x * 0.995, y: av.y, z: av.z * 0.995 }, true);
      }
    } else {
      if (this.airborne) this.setAirborne(false);
      if (this.airTime > 0.6) this.game.events.emit('vehicle:landed' as any, { vehicle: this, air: this.airTime } as any);
      this.airTime = 0;
      // carga aerodinámica: pega al suelo a alta velocidad
      const down = Math.min(absSpeed, 50) * mass * 0.12;
      this.body.applyImpulse({ x: -bodyUp.x * down * dt, y: -bodyUp.y * down * dt, z: -bodyUp.z * down * dt }, true);
      // anti-vuelco: momento que mantiene derecho
      const tq = tmpTq.crossVectors(bodyUp, UP).multiplyScalar(mass * (s.twoWheels ? 14 : 5));
      this.body.applyTorqueImpulse({ x: tq.x * dt, y: 0, z: tq.z * dt }, true);
    }
    if (s.twoWheels) {
      // la moto no vuelca: amortigua el balanceo
      this.body.setAngvel({ x: av.x * 0.9, y: av.y, z: av.z * 0.8 }, true);
    }

    // Volcado (o de lado contra una pared): se endereza solo a los 2,5 s si va despacio
    if ((bodyUp.y < 0.35 || (contacts <= 1 && bodyUp.y < 0.7)) && absSpeed < 3) {
      this.flipTimer += dt;
      if (this.flipTimer > 2.5) this.flipUpright();
    } else this.flipTimer = 0;
    // Encallado encima de algo (sin ruedas en el suelo y quieto): también se recoloca
    if (contacts === 0 && absSpeed < 1 && Math.abs(lv.y) < 0.5) {
      this.beachedTimer += dt;
      if (this.beachedTimer > 3) {
        this.beachedTimer = 0;
        this.flipUpright();
      }
    } else this.beachedTimer = 0;

    // Impactos: cambio brusco de velocidad
    // derrape: velocidad lateral en ejes del coche
    tmpQ.set(r.x, r.y, r.z, r.w).invert();
    const localV = tmpV.set(lv.x, lv.y, lv.z).applyQuaternion(tmpQ);
    this.slip = contacts > 1 ? Math.abs(localV.x) : 0;
    const dv = Math.hypot(lv.x - this.prevVel.x, (lv.y - this.prevVel.y) * 0.6, lv.z - this.prevVel.z);
    this.prevVel.set(lv.x, lv.y, lv.z);
    if (dv > 5.5) this.impact(dv);

    // mar
    const w = this.game.world;
    if (w) {
      const p = this.body.translation();
      if (p.y < w.seaLevel - 0.3 && !w.isLand(p.x, p.z)) {
        if (!this.sinking) {
          this.sinking = true;
          this.game.events.emit('vehicle:sink' as any, { vehicle: this } as any);
        }
        this.body.setLinearDamping(3);
        this.body.setAngularDamping(3);
      }
    }
  }

  /** Despegue: gravedad rebajada y, si sale de una rampa, un empujón extra hacia arriba (saltos chulos). */
  private takeOff(rot: THREE.Quaternion, absSpeed: number, vy: number) {
    this.setAirborne(true);
    const fwd = tmpFwd.set(0, 0, 1).applyQuaternion(rot);
    if (fwd.y > 0.12 && vy > 1.5 && absSpeed > 8 && this.speed > 0) {
      this.body.applyImpulse({ x: 0, y: Math.min(3, absSpeed * 0.1) * this.spec.mass, z: 0 }, true);
    }
  }

  private setAirborne(on: boolean) {
    this.airborne = on;
    this.body.setGravityScale(on ? AIR_GRAVITY : 1, true);
  }

  impact(dv: number) {
    const s = this.spec;
    const dmgK = s.tough ? 0.25 : 1;
    const armor = 1 - this.upgrades.armor * 0.15;
    // un choque frontal a 90 km/h se lleva ~25 % de la vida; los roces, casi nada
    const dmg = (dv - 5.5) ** 1.3 * 5 * dmgK * armor * (s.mass / 1500 + 0.4);
    this.damage(dmg);
    this.onImpact?.(dv, this);
    this.game.events.emit('vehicle:impact' as any, { vehicle: this, dv } as any);
    // abolladura visual
    if (dv > 8) this.dent(dv);
  }

  damage(amount: number) {
    if (this.destroyed) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.game.events.emit('vehicle:destroyed' as any, { vehicle: this } as any);
    }
  }

  /** Deforma la carrocería cerca del punto de impacto (dirección de la velocidad perdida). */
  private dent(dv: number) {
    const geo = this.mesh.bodyGeo;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    // punto de impacto aproximado: la cara del chasis en la dirección del movimiento previo
    const lv = this.body.linvel();
    const r = this.body.rotation();
    tmpQ.set(r.x, r.y, r.z, r.w).invert();
    const dir = new THREE.Vector3(lv.x, 0, lv.z).applyQuaternion(tmpQ);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize();
    const h = this.spec.half;
    const hit = new THREE.Vector3(dir.x * h.x, (Math.random() - 0.3) * h.y, dir.z * h.z);
    const radius = Math.min(1.4, 0.5 + dv * 0.05);
    const depth = Math.min(0.35, dv * 0.015);
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - hit.x, dy = pos.getY(i) - hit.y, dz = pos.getZ(i) - hit.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < radius) {
        const k = (1 - d / radius) * depth;
        pos.setXYZ(i, pos.getX(i) - dir.x * k, pos.getY(i) - k * 0.3, pos.getZ(i) - dir.z * k);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  flipUpright() {
    const t = this.body.translation();
    const h = this.heading;
    tmpQ.setFromAxisAngle(UP, h);
    this.body.setTranslation({ x: t.x, y: t.y + 1.5, z: t.z }, true);
    this.body.setRotation({ x: tmpQ.x, y: tmpQ.y, z: tmpQ.z, w: tmpQ.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.flipTimer = 0;
  }

  /** Coloca el vehículo en un sitio (teletransporte, pedir al garaje). */
  place(pos: THREE.Vector3, heading: number) {
    tmpQ.setFromAxisAngle(UP, heading);
    const s = this.spec;
    this.body.setTranslation({ x: pos.x, y: pos.y + s.half.y + s.suspension + 0.3, z: pos.z }, true);
    this.body.setRotation({ x: tmpQ.x, y: tmpQ.y, z: tmpQ.z, w: tmpQ.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.prevVel.set(0, 0, 0);
  }

  syncVisual(dt: number) {
    const t = this.body.translation();
    const r = this.body.rotation();
    const g = this.mesh.group;
    g.position.set(t.x, t.y, t.z);
    g.quaternion.set(r.x, r.y, r.z, r.w);
    const c = this.controller;
    const s = this.spec;
    const slots = this.mesh.wheelSlots;
    if (slots) tmpGroupM.compose(g.position, g.quaternion, g.scale);
    for (let i = 0; i < 4; i++) {
      const pivot = this.mesh.wheels[i];
      const susp = c.wheelSuspensionLength(i) ?? s.suspension;
      pivot.position.y = s.wheelY - susp;
      const steer = i < 2 ? c.wheelSteering(i) ?? 0 : 0;
      this.wheelSpin[i] = (this.wheelSpin[i] + (this.speed / s.wheelRadius) * dt) % TWO_PI;
      const slot = slots?.[i];
      if (slot) {
        // rueda compartida (InstancedMesh): se coloca con su matriz de mundo
        setWheelInstance(slot, tmpGroupM, pivot.position, steer, this.wheelSpin[i]);
        continue;
      }
      pivot.rotation.set(0, 0, 0);
      pivot.rotation.y = steer;
      const wheel = pivot.children[0];
      if (wheel) wheel.rotation.x = this.wheelSpin[i];
    }
    // sirena
    if (this.mesh.siren) {
      const on = this.sirenOn;
      this.mesh.siren.visible = on || this.spec.kind === 'garbage';
      if (on) this.mesh.siren.rotation.y = Math.sin(this.game.time.elapsed * 12) > 0 ? 0 : Math.PI;
    }
  }

  dispose() {
    if (this.disposed) return;
    const t = this.body.translation(), r = this.body.rotation();
    this.lastT = { x: t.x, y: t.y, z: t.z };
    this.lastR = { x: r.x, y: r.y, z: r.z, w: r.w };
    this.disposed = true;
    this.destroyed = true;
    this.driver = null;
    const g = this.game;
    g.scene.remove(this.mesh.group);
    releaseWheels(this.mesh);
    this.mesh.bodyGeo.dispose();
    this.mesh.lights.geometry.dispose();
    this.mesh.siren?.geometry.dispose();
    // carteles laterales: la geometría es de este vehículo (la textura es compartida)
    for (const ch of this.mesh.group.children) if (ch.userData.decal && (ch as THREE.Mesh).isMesh) (ch as THREE.Mesh).geometry.dispose();
    g.physics.untag(this.collider);
    g.physics.world.removeVehicleController(this.controller);
    g.physics.world.removeRigidBody(this.body);
  }
}
